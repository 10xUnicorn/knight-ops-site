/**
 * Knight Ops Recorder — offscreen document
 * MediaRecorder lives here (service workers can't touch media).
 *
 * The important trick: we do NOT hold the whole recording in memory and upload
 * at the end. Chunks accumulate into an 8MB buffer and each full buffer is sent
 * as an R2 multipart part *while you are still recording*. When you hit stop,
 * only the tail is left to send — a 25 minute video finishes uploading in a
 * couple of seconds instead of a couple of minutes.
 */

const PART_SIZE = 8 * 1024 * 1024; // R2 requires >=5MB for every part but the last

let rec = null;
let stream = null;
let micStream = null;
let audioCtx = null;
let micFailed = null;
let keepAliveTimer = null;

let session = null; // { worker, token, videoId, key, uploadId, parts, partNo, buffer, bytes }
let startedAt = 0;
let pausedTotal = 0;
let pausedAt = 0;
let posterDone = false;
let uploadChain = Promise.resolve();
let cancelled = false;

const send = (type, extra = {}) => chrome.runtime.sendMessage({ type, ...extra }).catch(() => {});

/** Route a diagnostic through the service worker, which posts it to the dashboard. */
const note = (stage, message, detail = {}, level = 'info') =>
  send('ko-report', { stage, message: String(message), detail, level });

let stage = 'init';
const fail = (e) => {
  const msg = String(e?.name === 'NotAllowedError' ? 'Permission denied: ' + e.message : (e?.message || e));
  console.error('[ko]', stage, e);
  note(stage, msg, { name: e?.name || null, stack: String(e?.stack || '').slice(0, 600) }, 'error');
  send('ko-recording-error', { error: msg });
  cleanup();
};

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
  ];
  return candidates.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
}

function bitrate(quality) {
  return { low: 1_200_000, medium: 3_000_000, high: 6_000_000, max: 10_000_000 }[quality] || 6_000_000;
}

// ── worker calls ───────────────────────────────────────────
async function w(path, opts = {}) {
  const r = await fetch(`${session.worker}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${session.token}`, ...(opts.headers || {}) },
  });
  const isJson = (r.headers.get('content-type') || '').includes('json');
  const data = isJson ? await r.json() : await r.text();
  if (!r.ok) throw new Error(typeof data === 'string' ? data : data.error || `worker ${r.status}`);
  return data;
}

async function initUpload(mime) {
  const res = await w('/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mime, ext: 'webm', kind: 'video' }),
  });
  session.key = res.key;
  session.uploadId = res.uploadId;
}

/**
 * Upload one part, retrying transient failures.
 *
 * A part that never lands leaves a hole in the object, and R2 will happily
 * concatenate what remains — producing a file that looks complete by byte count
 * but stops playing at the gap. So: retry hard, and if a part truly cannot be
 * uploaded, poison the session rather than quietly continuing.
 */
async function uploadPart(blob, partNumber) {
  const qs = new URLSearchParams({
    key: session.key, uploadId: session.uploadId, part: String(partNumber),
  });

  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await w(`/upload/part?${qs}`, { method: 'PUT', body: blob });
      if (res.size != null && res.size !== blob.size) {
        throw new Error(`size mismatch: sent ${blob.size}, stored ${res.size}`);
      }
      session.parts.push({ part: partNumber, etag: res.etag });
      session.uploadedBytes += blob.size;
      note('upload', `part ${partNumber} uploaded`, {
        size: blob.size, parts: session.parts.length, attempt,
      }, 'info');
      send('ko-upload-progress', {
        progress: Math.min(95, Math.round((session.uploadedBytes / Math.max(session.bytes, 1)) * 100)),
      });
      return;
    } catch (e) {
      lastErr = e;
      note('upload', `part ${partNumber} attempt ${attempt} failed: ${e.message}`,
        { size: blob.size }, 'warn');
      if (attempt < 4) await new Promise(r => setTimeout(r, 400 * attempt * attempt));
    }
  }

  session.poisoned = `part ${partNumber} failed after 4 attempts: ${lastErr?.message}`;
  throw new Error(session.poisoned);
}

/** Serialise part uploads so they always land in order and are numbered densely. */
function queuePart(blob) {
  const partNumber = ++session.partNo;
  uploadChain = uploadChain
    .then(() => (session.poisoned ? null : uploadPart(blob, partNumber)))
    .catch((e) => { session.poisoned = session.poisoned || String(e?.message || e); });
  return uploadChain;
}

/**
 * R2 multipart uploads require EVERY part except the last to be exactly the
 * same size, so we slice to exact PART_SIZE boundaries.
 *
 * CRITICAL — this must be serialised and must never assign to session.buffer.
 * The original version did `session.buffer = []`, awaited an upload, then did
 * `session.buffer = [remainder]`. MediaRecorder fires ondataavailable every 2s,
 * so any chunk that arrived during that await was overwritten and lost. The
 * result was a byte stream with holes: ffprobe could still find packets out to
 * the full duration, but the container was damaged and browsers stopped playing
 * at the first gap. A 5-minute recording played 2:45.
 *
 * The lock serialises flushes; unshift returns the remainder to the FRONT so it
 * stays ahead of anything appended while we were awaiting.
 */
let flushLock = Promise.resolve();
function flushBuffer(force) {
  flushLock = flushLock.then(() => doFlush(force)).catch(() => {});
  return flushLock;
}

async function doFlush(force) {
  for (;;) {
    const total = session.buffer.reduce((n, b) => n + b.size, 0);
    if (!total) return;
    if (!force && total < PART_SIZE) return;

    const blob = new Blob(session.buffer, { type: 'application/octet-stream' });
    session.buffer = [];

    if (blob.size >= PART_SIZE) {
      await queuePart(blob.slice(0, PART_SIZE));
      const rest = blob.slice(PART_SIZE);
      if (rest.size) session.buffer.unshift(rest);
      continue;                       // more may have arrived; loop again
    }

    if (force) { await queuePart(blob); return; }
    session.buffer.unshift(blob);     // put it back, never discard
    return;
  }
}

// ── poster / thumbnail from the live stream ────────────────
async function capturePoster(videoTrack) {
  if (posterDone || !videoTrack) return;
  posterDone = true;
  try {
    const probe = document.getElementById('probe');
    probe.srcObject = new MediaStream([videoTrack]);
    await probe.play();
    await new Promise(r => setTimeout(r, 1200));

    const settings = videoTrack.getSettings();
    const vw = probe.videoWidth || settings.width || 1280;
    const vh = probe.videoHeight || settings.height || 720;
    session.width = vw; session.height = vh;

    const canvas = document.getElementById('canvas');
    const scale = Math.min(1, 1280 / vw);
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    canvas.getContext('2d').drawImage(probe, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob) return;
    const key = `videos/${session.key.split('/')[1]}/thumb.jpg`;
    const res = await w(`/upload/simple?key=${encodeURIComponent(key)}&mime=image/jpeg`, {
      method: 'PUT', body: blob,
    });
    session.thumbKey = res.key;
    probe.srcObject = null;
  } catch (e) {
    console.warn('[ko] poster failed', e);
  }
}

// ── build the capture stream ───────────────────────────────
async function buildStream(p) {
  let display = null;

  if (p.source === 'camera') {
    display = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: p.mic,
    });
  } else if (p.captureSource === 'tab') {
    display = await navigator.mediaDevices.getUserMedia({
      audio: p.systemAudio
        ? { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: p.streamId } }
        : false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: p.streamId,
          maxWidth: 2560, maxHeight: 1440, maxFrameRate: 30,
        },
      },
    });
    // Tab capture mutes the tab for the user by default — play it back so they still hear it.
    if (p.systemAudio && display.getAudioTracks().length) {
      const ctx = new AudioContext();
      ctx.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(ctx.destination);
    }
  } else {
    /**
     * Screen and window capture use getDisplayMedia() directly, NOT
     * chrome.desktopCapture.
     *
     * desktopCapture is a trap in this architecture:
     *   - with a targetTab, the picker opens but the handle is bound to that
     *     page's security origin, so this offscreen document (which runs on
     *     chrome-extension://) is refused at getUserMedia with a bare AbortError
     *   - without a targetTab the handle would be usable, but a service worker
     *     has no window to anchor the picker to, so it never opens at all
     *
     * There is no setting that satisfies both. getDisplayMedia sidesteps the
     * whole problem: Chrome draws its own picker, the stream belongs to this
     * document, and there is no handle to expire or mis-scope. The offscreen
     * document is created with the DISPLAY_MEDIA reason precisely for this.
     */
    const surface = p.source === 'window' ? 'window' : 'monitor';
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: surface,
          frameRate: { ideal: 30 },
          width: { max: 2560 },
          height: { max: 1440 },
        },
        // Chrome only offers system audio for tab sources on macOS. Asking is
        // harmless here — unlike the old mandatory constraints, an unavailable
        // audio track no longer takes the video down with it.
        audio: !!p.systemAudio,
        systemAudio: p.systemAudio ? 'include' : 'exclude',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      });
    } catch (e) {
      const name = String(e?.name || '');
      if (name === 'NotAllowedError') {
        // User dismissed Chrome's picker, or macOS is withholding the permission.
        throw new Error('Screen recording was not allowed. If Chrome never showed a picker, enable it in System Settings → Privacy & Security → Screen Recording.');
      }
      throw e;
    }
  }

  // Mic gets mixed into whatever audio the capture already has.
  const audioTracks = [];
  const sysAudio = display.getAudioTracks();
  if (p.mic && p.source !== 'camera') {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      note('build_stream', 'microphone captured', { tracks: micStream.getAudioTracks().length }, 'info');
    } catch (e) {
      // This used to be swallowed, which is why recordings came out silent with
      // no explanation. An offscreen document cannot show a permission prompt —
      // the grant has to be given once from the extension's options page.
      const name = String(e?.name || '');
      note('build_stream',
        name === 'NotAllowedError'
          ? 'microphone permission not granted to the extension — recording will be silent'
          : `microphone unavailable: ${e?.message || e}`,
        { name }, 'warn');
      micFailed = name === 'NotAllowedError' ? 'permission' : 'error';
    }
  }

  if (micStream && sysAudio.length) {
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const sysGain = audioCtx.createGain(); sysGain.gain.value = 0.8;
    const micGain = audioCtx.createGain(); micGain.gain.value = 1.0;
    audioCtx.createMediaStreamSource(new MediaStream(sysAudio)).connect(sysGain).connect(dest);
    audioCtx.createMediaStreamSource(micStream).connect(micGain).connect(dest);
    audioTracks.push(...dest.stream.getAudioTracks());
  } else if (micStream) {
    audioTracks.push(...micStream.getAudioTracks());
  } else {
    audioTracks.push(...sysAudio);
  }

  return new MediaStream([...display.getVideoTracks(), ...audioTracks]);
}

// ── start ──────────────────────────────────────────────────
async function start(p) {
  try {
    cancelled = false; posterDone = false; pausedTotal = 0; pausedAt = 0; micFailed = null;
    session = {
      worker: p.worker, token: p.token, videoId: p.videoId,
      key: null, uploadId: null, parts: [], partNo: 0,
      buffer: [], bytes: 0, uploadedBytes: 0, poisoned: null,
      width: null, height: null, thumbKey: null,
    };

    stage = 'build_stream';
    stream = await buildStream(p);
    const vt = stream.getVideoTracks(), at = stream.getAudioTracks();
    if (!vt.length) throw new Error('No video track was produced by the capture.');
    note('build_stream', 'stream ready', {
      source: p.source, captureSource: p.captureSource,
      videoTracks: vt.length, audioTracks: at.length,
      settings: vt[0] ? vt[0].getSettings() : null,
    });

    stage = 'pick_mime';
    const mime = pickMime();

    stage = 'init_upload';
    await initUpload(mime);

    stage = 'countdown';
    if (p.countdown) await new Promise(r => setTimeout(r, p.countdown * 1000));
    if (cancelled) return { ok: false, stage: 'cancelled', error: 'cancelled' };

    stage = 'recorder';
    rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: bitrate(p.quality),
      audioBitsPerSecond: 128_000,
    });

    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size || cancelled) return;
      session.buffer.push(e.data);
      session.bytes += e.data.size;

      // Backpressure watch: if uploads fall behind capture the backlog grows
      // without bound, which is the only thing that could break a very long
      // recording now. Warn once per threshold so it is visible in diagnostics.
      const backlog = session.buffer.reduce((n, b) => n + b.size, 0);
      if (backlog > PART_SIZE * 4 && backlog > (session.warnedBacklog || 0) * 2) {
        session.warnedBacklog = backlog;
        note('upload', 'upload is falling behind capture', {
          backlogMB: +(backlog / 1048576).toFixed(1),
          recordedMB: +(session.bytes / 1048576).toFixed(1),
          uploadedMB: +(session.uploadedBytes / 1048576).toFixed(1),
        }, 'warn');
      }

      flushBuffer(false);
    };
    rec.onerror = (e) => fail(e.error || new Error('recorder error'));
    rec.onstop = () => finalize().catch(fail);

    // Stopping the share from Chrome's own "Stop sharing" bar ends the track.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (rec && rec.state !== 'inactive') send('ko-stream-ended');
    });

    rec.start(2000); // 2s timeslice keeps memory flat and upload steady
    stage = 'recording';
    startedAt = Date.now();

    // Ping the service worker while recording. Any message resets Chrome's
    // ~30s idle timer; without this the worker is torn down mid-recording and
    // the stop/finalize path dies with it — which capped recordings at about a
    // minute. Cleared in cleanup().
    clearInterval(keepAliveTimer);
    keepAliveTimer = setInterval(() => {
      send('ko-keepalive', { elapsed: Math.round((Date.now() - startedAt - pausedTotal) / 1000) });
    }, 20000);
    send('ko-recording-started');
    note('recording', 'recorder started', { mime, state: rec.state });
    capturePoster(stream.getVideoTracks()[0]);
    return { ok: true, micFailed };
  } catch (e) {
    const failedAt = stage;
    // Don't mark the whole run failed yet — the service worker may retry with a
    // fresh capture handle or fall back to screen capture.
    const msg = String(e?.name === 'NotAllowedError' ? 'Permission denied: ' + e.message : (e?.message || e));
    console.error('[ko]', failedAt, e);
    note(failedAt, msg, { name: e?.name || null, source: p.source, captureSource: p.captureSource }, 'error');
    cleanup();
    return { ok: false, stage: failedAt, error: msg, name: e?.name || null };
  }
}

// ── finalize ───────────────────────────────────────────────
async function finalize() {
  if (cancelled) return cleanup();
  try {
    send('ko-upload-progress', { progress: 60 });
    await uploadChain;
    await flushBuffer(true);
    await uploadChain;

    if (!session.parts.length) throw new Error('Nothing was recorded.');

    // Only ever complete with a DENSE run of parts starting at 1. Completing
    // across a gap yields a file that is the right size but unplayable past the
    // hole — far worse than a video that is honestly a bit shorter.
    const sorted = session.parts.slice().sort((a, b) => a.part - b.part);
    const dense = [];
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].part !== i + 1) break;
      dense.push(sorted[i]);
    }
    if (dense.length !== sorted.length) {
      note('upload', `dropping ${sorted.length - dense.length} part(s) after a gap to keep the file playable`,
        { kept: dense.length, total: sorted.length }, 'warn');
    }
    if (session.poisoned) note('upload', session.poisoned, {}, 'error');

    const done = await w('/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: session.key, uploadId: session.uploadId, parts: dense }),
    });

    // Report what R2 actually stored, not what we hoped to send.
    const storedBytes = done.size != null ? done.size : session.uploadedBytes;
    if (storedBytes !== session.bytes) {
      note('upload', 'stored size differs from recorded size',
        { recorded: session.bytes, stored: storedBytes }, 'warn');
    }

    const durationSec = Math.max(0, (Date.now() - startedAt - pausedTotal) / 1000);
    send('ko-recording-done', {
      payload: {
        storage_key: session.key,
        thumb_key: session.thumbKey,
        size_bytes: storedBytes,
        duration_sec: Number(durationSec.toFixed(2)),
        width: session.width,
        height: session.height,
      },
    });
  } catch (e) {
    fail(e);
  } finally {
    cleanup();
  }
}

function cleanup() {
  clearInterval(keepAliveTimer); keepAliveTimer = null;
  try { stream?.getTracks().forEach(t => t.stop()); } catch (_) {}
  try { micStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
  try { audioCtx?.close(); } catch (_) {}
  stream = null; micStream = null; audioCtx = null; rec = null;
}

// ── screenshots ────────────────────────────────────────────
async function screenshot(p) {
  try {
    session = { worker: p.worker, token: p.token, videoId: p.videoId };
    let dataUrl = p.dataUrl, width = 0, height = 0;

    // Area-crop path: background hands us { full, rect, dpr }
    if (typeof dataUrl === 'object' && dataUrl.full) {
      const { full, rect, dpr = 1 } = dataUrl;
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = full; });
      const canvas = document.getElementById('canvas');
      canvas.width = Math.round(rect.w * dpr);
      canvas.height = Math.round(rect.h * dpr);
      canvas.getContext('2d').drawImage(
        img, Math.round(rect.x * dpr), Math.round(rect.y * dpr),
        canvas.width, canvas.height, 0, 0, canvas.width, canvas.height
      );
      dataUrl = canvas.toDataURL('image/png');
      width = canvas.width; height = canvas.height;
    }

    const blob = await (await fetch(dataUrl)).blob();
    if (!width) {
      const bmp = await createImageBitmap(blob);
      width = bmp.width; height = bmp.height;
    }

    const res = await w('/upload/simple?ext=png&mime=image/png', { method: 'PUT', body: blob });
    send('ko-recording-done', {
      payload: {
        storage_key: res.key, thumb_key: res.key,
        size_bytes: blob.size, duration_sec: 0, width, height,
      },
    });
  } catch (e) { fail(e); }
}

// ── clipboard (offscreen documents can write to it) ────────
function copyText(text) {
  const el = document.getElementById('clip');
  el.value = text;
  el.select();
  try { document.execCommand('copy'); } catch (_) {}
}

// ── router ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  switch (msg.type) {
    // Handshake so the service worker knows this listener is live before it
    // sends the start payload.
    // PROTOCOL must match background.js. A mismatch means a stale offscreen
    // document survived an update — the worker will tear it down and rebuild.
    case 'ko-offscreen-ping':       respond({ ready: true, protocol: 2 }); return true;
    // Report the outcome back so the service worker can retry or fall back
    // instead of the run dying silently.
    case 'ko-offscreen-start':
      start(msg.payload).then(respond, (e) =>
        respond({ ok: false, stage: 'unknown', error: String(e?.message || e) }));
      return true;
    case 'ko-offscreen-stop':       if (rec && rec.state !== 'inactive') rec.stop(); break;
    case 'ko-offscreen-pause':
      if (rec?.state === 'recording') { rec.pause(); pausedAt = Date.now(); } break;
    case 'ko-offscreen-resume':
      if (rec?.state === 'paused') { rec.resume(); pausedTotal += Date.now() - pausedAt; pausedAt = 0; } break;
    case 'ko-offscreen-cancel':
      cancelled = true;
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (_) {}
      if (session?.key && session?.uploadId) {
        w('/upload/abort', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: session.key, uploadId: session.uploadId }),
        }).catch(() => {});
      }
      cleanup();
      break;
    case 'ko-offscreen-screenshot': screenshot(msg.payload); break;
    case 'ko-offscreen-clipboard':  copyText(msg.text); break;
    default: break;
  }
});
