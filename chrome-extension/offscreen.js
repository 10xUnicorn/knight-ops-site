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

async function uploadPart(blob) {
  const n = ++session.partNo;
  const qs = new URLSearchParams({ key: session.key, uploadId: session.uploadId, part: String(n) });
  const res = await w(`/upload/part?${qs}`, { method: 'PUT', body: blob });
  session.parts.push({ part: res.part, etag: res.etag });
  session.uploadedBytes += blob.size;
  send('ko-upload-progress', {
    progress: Math.min(95, Math.round((session.uploadedBytes / Math.max(session.bytes, 1)) * 100)),
  });
}

/** Queue a part upload so parts always land in order. */
function queuePart(blob) {
  uploadChain = uploadChain.then(() => uploadPart(blob)).catch(fail);
  return uploadChain;
}

async function flushBuffer(force) {
  if (!session.buffer.length) return;
  const total = session.buffer.reduce((n, b) => n + b.size, 0);
  if (!force && total < PART_SIZE) return;
  const blob = new Blob(session.buffer, { type: 'application/octet-stream' });
  session.buffer = [];
  await queuePart(blob);
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
    // System audio is only available if the picker granted it. On macOS Chrome
    // CANNOT capture system audio for screen or window sources at all — and
    // because these legacy constraints are `mandatory`, asking for an audio
    // track that cannot exist makes Chrome reject the WHOLE request with a bare
    // AbortError, losing the video too. So: ask only when granted, and if it
    // still fails, fall back to video-only rather than losing the recording.
    const videoConstraint = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: p.streamId,
        maxWidth: 2560, maxHeight: 1440, maxFrameRate: 30,
      },
    };
    const wantAudio = p.systemAudio && p.canAudio;

    if (wantAudio) {
      try {
        display = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: p.streamId } },
          video: videoConstraint,
        });
      } catch (e) {
        note('build_stream', 'system audio unavailable, capturing video only',
          { name: e?.name || null, error: String(e?.message || e) }, 'warn');
        display = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraint });
      }
    } else {
      if (p.systemAudio) {
        note('build_stream', 'picker did not grant system audio — video only (normal on macOS for screen/window)',
          {}, 'warn');
      }
      display = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraint });
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
    } catch (e) { console.warn('[ko] mic denied', e); }
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
    cancelled = false; posterDone = false; pausedTotal = 0; pausedAt = 0;
    session = {
      worker: p.worker, token: p.token, videoId: p.videoId,
      key: null, uploadId: null, parts: [], partNo: 0,
      buffer: [], bytes: 0, uploadedBytes: 0,
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
    send('ko-recording-started');
    note('recording', 'recorder started', { mime, state: rec.state });
    capturePoster(stream.getVideoTracks()[0]);
    return { ok: true };
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

    await w('/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: session.key, uploadId: session.uploadId, parts: session.parts }),
    });

    const durationSec = Math.max(0, (Date.now() - startedAt - pausedTotal) / 1000);
    send('ko-recording-done', {
      payload: {
        storage_key: session.key,
        thumb_key: session.thumbKey,
        size_bytes: session.bytes,
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
