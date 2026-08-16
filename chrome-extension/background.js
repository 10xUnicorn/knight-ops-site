/**
 * Knight Ops Recorder — background service worker
 * Orchestrates capture permission, the offscreen recorder, the on-page overlay,
 * and the upload lifecycle. Holds no media itself (service workers can't).
 */

const FN = 'https://trpnlkntvulkjerevngm.supabase.co/functions/v1';
const SITE = 'https://knightops.biz';

// Bump whenever the background↔offscreen message contract changes, and keep the
// matching number in offscreen.js. Guards against a stale offscreen document
// answering a newer service worker.
const OFFSCREEN_PROTOCOL = 2;

// ── state ──────────────────────────────────────────────────
let state = {
  status: 'idle',            // idle | starting | recording | paused | uploading | done | error
  videoId: null,
  slug: null,
  startedAt: 0,
  pausedMs: 0,
  tabId: null,
  sourceType: null,
  progress: 0,
  shareUrl: null,
  error: null,
};

function setState(patch) {
  state = { ...state, ...patch };
  chrome.runtime.sendMessage({ type: 'state', state }).catch(() => {});
  if (state.tabId) {
    chrome.tabs.sendMessage(state.tabId, { type: 'ko-state', state }).catch(() => {});
  }
  paintBadge();
}

function paintBadge() {
  const map = {
    recording: { text: 'REC', color: '#e5484d' },
    paused:    { text: '||',  color: '#C9922A' },
    uploading: { text: '↑',   color: '#00D4C8' },
    done:      { text: '✓',   color: '#30a46c' },
    error:     { text: '!',   color: '#e5484d' },
  };
  const b = map[state.status];
  chrome.action.setBadgeText({ text: b ? b.text : '' });
  if (b) chrome.action.setBadgeBackgroundColor({ color: b.color });
}

async function getConfig() {
  const { koToken, koWorker } = await chrome.storage.local.get(['koToken', 'koWorker']);
  if (koToken) return { token: koToken, worker: koWorker || '' };

  // Nothing saved yet — fall back to the gitignored local-config.json that ships
  // alongside the extension on this machine, and persist it so this only runs once.
  try {
    const r = await fetch(chrome.runtime.getURL('local-config.json'));
    if (r.ok) {
      const c = await r.json();
      if (c && c.token) {
        await chrome.storage.local.set({ koToken: c.token, koWorker: c.worker || '' });
        return { token: c.token, worker: c.worker || '' };
      }
    }
  } catch (_) { /* no local config — the options page will ask */ }

  return { token: '', worker: '' };
}

async function api(action, payload) {
  const { token } = await getConfig();
  if (!token) throw new Error('No access token set. Open the extension options and paste your Knight Ops recorder token.');
  const r = await fetch(`${FN}/video-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `video-manage ${r.status}`);
  return data;
}

// ── remote diagnostics ─────────────────────────────────────
// The service worker and offscreen document have no console we can reach, so
// anything that goes wrong is posted to the dashboard where it can be read.
async function report(stage, message, detail = {}, level = 'error') {
  try {
    const { token } = await getConfig();
    if (!token) return;
    await fetch(`${FN}/video-debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'log', level, stage,
        message: String(message || '').slice(0, 2000),
        detail, video_id: state.videoId || null,
        version: chrome.runtime.getManifest().version,
      }),
    });
  } catch (_) { /* diagnostics must never break the recording */ }
}

// ── offscreen document ─────────────────────────────────────
/**
 * Always tear down and rebuild the offscreen document before a run.
 *
 * An offscreen document outlives the service worker. After an extension update
 * or a service-worker restart you can end up with a NEW worker talking to an
 * OLD offscreen document — it answers the ping, then ignores the current start
 * protocol and returns nothing, so the run dies with no error anywhere. Cheap
 * to recreate (a few hundred ms) and it happens before we mint a capture
 * handle, so it costs nothing that matters.
 */
async function ensureOffscreen() {
  await closeOffscreen();
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA', 'DISPLAY_MEDIA'],
      justification: 'Record screen, tab, window, camera and microphone audio.',
    });
  } catch (e) {
    // Two starts in quick succession can race on creation; an existing doc is fine.
    if (!/single offscreen|already/i.test(String(e?.message))) throw e;
  }
  // createDocument resolves when the document exists — not when offscreen.js has
  // registered its message listener. Sending before then drops the start message
  // silently and the recording never begins. Wait for it to answer a ping.
  for (let i = 0; i < 60; i++) {
    try {
      const pong = await chrome.runtime.sendMessage({ type: 'ko-offscreen-ping' });
      if (pong?.ready) {
        if (pong.protocol !== OFFSCREEN_PROTOCOL) {
          throw new Error(`Recorder version mismatch (page ${pong.protocol}, worker ${OFFSCREEN_PROTOCOL}). Reload the extension at chrome://extensions.`);
        }
        return true;
      }
    } catch (e) {
      if (/version mismatch/i.test(String(e?.message))) throw e;
      /* otherwise: not listening yet */
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('The recorder background page did not start. Reload the extension and try again.');
}

async function closeOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length) await chrome.offscreen.closeDocument().catch(() => {});
}

// ── overlay injection ──────────────────────────────────────
async function injectOverlay(tabId, opts) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['overlay.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['overlay.js'] });
    await chrome.tabs.sendMessage(tabId, { type: 'ko-overlay-init', opts });
    return true;
  } catch (_) {
    // chrome:// pages, the web store, and PDFs refuse injection — recording still works.
    return false;
  }
}

async function removeOverlay(tabId) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: 'ko-overlay-destroy' }).catch(() => {});
}

// ── capture source ─────────────────────────────────────────
/**
 * The targetTab argument IS required here.
 *
 * Called from a service worker without a targetTab, Chrome has no window to
 * anchor the picker to and fires the callback immediately with an empty
 * streamId — the picker simply never appears. Passing the active tab is what
 * Chrome's own screen-recording sample does.
 *
 * `options.canRequestAudioTrack` tells us whether the user actually granted
 * audio. It matters enormously: on macOS, Chrome cannot capture system audio
 * for screen or window sources at all (only for tabs). Demanding a mandatory
 * audio track that the platform cannot supply makes getUserMedia reject the
 * ENTIRE stream with a bare AbortError — which Chrome then mislabels as
 * "Error starting tab capture".
 */
function chooseDesktop(sources, tab) {
  return new Promise((resolve, reject) => {
    const reqId = chrome.desktopCapture.chooseDesktopMedia(sources, tab, (streamId, options) => {
      if (!streamId) return reject(new Error('cancelled'));
      resolve({ streamId, canAudio: !!(options && options.canRequestAudioTrack) });
    });
    // If the picker never returns we don't want a dangling request.
    setTimeout(() => { try { chrome.desktopCapture.cancelChooseDesktopMedia(reqId); } catch (_) {} }, 120000);
  });
}

// Chrome physically cannot capture these pages — no extension can. Catching it
// here turns an opaque "Error starting tab capture" into something actionable.
const UNCAPTURABLE = /^(chrome|chrome-extension|devtools|edge|about|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/i;

function tabCaptureBlockedReason(tab) {
  if (!tab || !tab.url) return 'Chrome will not report this tab. Click into a normal website tab and try again.';
  if (UNCAPTURABLE.test(tab.url)) {
    return 'Chrome blocks recording of browser pages like this one (settings, extension pages, the Web Store). ' +
           'Switch to a normal website tab, or record the Screen or a Window instead.';
  }
  return null;
}

// ── START ──────────────────────────────────────────────────
/**
 * Every exit from this function reports. A silent return here is a bug: it
 * leaves the user with a dead popup and leaves no trace in diagnostics, which
 * is precisely what made this so slow to track down.
 */
async function startRecording(opts) {
  // Always reports, then stops the run.
  const bail = (stage, logMsg, userMsg, detail = {}) => {
    report(stage, logMsg, detail);
    setState({ status: 'error', error: userMsg || logMsg });
    return false;
  };
  const step = (name, detail = {}) => report('step', name, detail, 'info');

  try {
    // 1. Config comes from local storage only — no network here.
    const { token, worker } = await getConfig();
    if (!token) {
      return bail('config', 'no token in storage or local-config.json',
        'No recorder token yet. Open the extension options.');
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    setState({ status: 'starting', tabId: tab?.id || null, sourceType: opts.source, error: null, shareUrl: null, progress: 0 });

    report('start', 'recording requested', {
      source: opts.source, mic: !!opts.mic, systemAudio: !!opts.systemAudio,
      quality: opts.quality, countdown: opts.countdown !== false,
      tabUrl: (tab?.url || '').slice(0, 120),
    }, 'info');

    // 2. Resolve the storage worker BEFORE minting a capture handle.
    let workerUrl = worker;
    if (!workerUrl) {
      try {
        const cfg = await api('config', {});
        workerUrl = cfg.worker;
        if (workerUrl) await chrome.storage.local.set({ koWorker: workerUrl });
      } catch (e) {
        return bail('config', `worker lookup failed: ${e.message}`,
          'Could not reach your dashboard. Check your connection and try again.');
      }
    }
    if (!workerUrl) {
      return bail('config', 'no worker URL configured', 'Storage worker URL not configured.');
    }
    step('worker resolved', { worker: workerUrl });

    // 3. Rebuild the offscreen recorder BEFORE asking Chrome for a capture
    //    handle — handles are single-use and expire almost immediately.
    try {
      await ensureOffscreen();
    } catch (e) {
      return bail('offscreen', String(e?.message || e), String(e?.message || e));
    }
    step('offscreen ready');

    // 4. Now mint the handle and consume it immediately.
    let streamId = null;
    let captureSource = 'desktop';
    let canAudio = false;
    try {
      if (opts.source === 'tab') {
        const blocked = tabCaptureBlockedReason(tab);
        if (blocked) return bail('get_stream', 'tab not capturable', blocked, { url: tab?.url });
        streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
        captureSource = 'tab';
      } else if (opts.source === 'camera') {
        streamId = null;
      } else {
        // Screen and window go through getDisplayMedia inside the offscreen
        // document — Chrome draws its own picker there, so nothing is minted
        // here and there is no handle to expire or mis-scope. See offscreen.js.
        streamId = null;
        captureSource = 'display';
        step('using getDisplayMedia (Chrome draws the picker)', { surface: opts.source });
      }
    } catch (e) {
      const raw = String(e?.message || e);
      if (raw === 'cancelled') {
        // Reported deliberately: "the picker never appeared" and "the user hit
        // cancel" look identical from here, and only the log tells them apart.
        report('get_stream', 'picker returned no handle (cancelled or never shown)',
          { source: opts.source }, 'warn');
        setState({ status: 'idle', error: null });
        return false;
      }
      return bail('get_stream', raw,
        /tab capture/i.test(raw)
          ? (tabCaptureBlockedReason(tab) || 'Chrome refused to capture this tab. Record the Screen instead.')
          : raw,
        { source: opts.source, url: tab?.url || null });
    }
    step('handle acquired', { captureSource, hasHandle: !!streamId });

    const basePayload = {
      source: opts.source,
      mic: !!opts.mic,
      systemAudio: !!opts.systemAudio,
      canAudio,
      camera: !!opts.camera && opts.source === 'camera',
      worker: workerUrl,
      token,
      countdown: opts.countdown !== false ? 3 : 0,
      quality: opts.quality || 'high',
    };

    const attempt = (sid, cs, countdown) =>
      chrome.runtime.sendMessage({
        type: 'ko-offscreen-start',
        payload: { ...basePayload, streamId: sid, captureSource: cs, countdown },
      }).catch(e => ({ ok: false, stage: 'transport', error: String(e?.message || e) }));

    step('handing off to recorder');
    let res = await attempt(streamId, captureSource, basePayload.countdown);

    // Tab capture handles can go stale between minting and use — mint a fresh
    // one and try again before giving up.
    if (!res?.ok && opts.source === 'tab' && res?.stage === 'build_stream') {
      report('retry', 'tab capture failed, retrying with a fresh handle', { first: res.error }, 'warn');
      try {
        const fresh = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
        res = await attempt(fresh, 'tab', 0);   // no second countdown
      } catch (e) {
        res = { ok: false, stage: 'build_stream', error: String(e?.message || e) };
      }
    }

    // Still no good: fall back to screen capture, which now goes through
    // getDisplayMedia in the offscreen document rather than desktopCapture.
    if (!res?.ok && opts.source === 'tab') {
      report('fallback', 'tab capture unavailable, falling back to screen', { last: res?.error }, 'warn');
      basePayload.source = 'screen';
      setState({ sourceType: 'screen' });
      await chrome.storage.local.set({ koSource: 'screen' });
      res = await attempt(null, 'display', 0);
    }

    if (!res?.ok) {
      const noReply = !res || res.ok === undefined;
      await removeOverlay(tab?.id);
      // Chrome says "Error starting tab capture" for every capture failure —
      // Screen and Window included. Never repeat that wording to the user.
      return bail('start_failed',
        noReply ? 'recorder returned no result' : (res.error || 'unknown'),
        noReply
          ? 'The recorder did not respond. Reload the extension at chrome://extensions and try again.'
          : res.name === 'NotAllowedError'
            ? 'Permission was denied. Allow screen recording for Chrome in System Settings → Privacy & Security → Screen Recording, then try again.'
            : /tab capture|aborterror/i.test(res.error || '')
              ? 'Chrome dropped the screen-capture handle before recording could start. Try again.'
              : (res.error || 'The recording could not start.'),
        { source: opts.source, stage: res?.stage || null, name: res?.name || null, raw: res || null });
    }

    step('capture running');

    // Capture is genuinely running. The overlay shows the countdown, then waits
    // for the 'recording' state before the timer bar appears.
    if (tab?.id && opts.source !== 'camera' && !UNCAPTURABLE.test(tab.url || '')) {
      injectOverlay(tab.id, { camera: opts.camera, countdown: opts.countdown !== false });
    }
    setState({ status: 'recording', startedAt: Date.now() });

    // 5. Create the database row in parallel with the countdown.
    try {
      const created = await api('create', {
        kind: 'video',
        title: opts.title || null,
        mime: 'video/webm',
        source_type: opts.source,
        source_url: tab?.url || null,
        source_title: tab?.title || null,
        has_audio: !!(opts.mic || opts.systemAudio),
        has_camera: !!opts.camera,
        visibility: opts.visibility || 'unlisted',
        folder: opts.folder || null,
      });
      setState({ videoId: created.id, slug: created.slug });
      step('row created', { slug: created.slug });
    } catch (e) {
      report('create', `row insert failed: ${e.message}`);
      setState({ status: 'error', error: `Could not create the recording: ${e.message}` });
      relay('ko-offscreen-cancel');
      return false;
    }
    return true;
  } catch (e) {
    // Nothing may escape this function unreported.
    report('unhandled', String(e?.message || e), { stack: String(e?.stack || '').slice(0, 700) });
    setState({ status: 'error', error: String(e?.message || e) });
    return false;
  }
}

// ── STOP / PAUSE / RESUME / CANCEL ─────────────────────────
function relay(type) { chrome.runtime.sendMessage({ type }).catch(() => {}); }

async function stopRecording()   { relay('ko-offscreen-stop'); }
async function pauseRecording()  { relay('ko-offscreen-pause');  setState({ status: 'paused' }); }
async function resumeRecording() { relay('ko-offscreen-resume'); setState({ status: 'recording' }); }
async function cancelRecording() {
  relay('ko-offscreen-cancel');
  if (state.videoId) api('delete', { id: state.videoId }).catch(() => {});
  await removeOverlay(state.tabId);
  await closeOffscreen();
  setState({ status: 'idle', videoId: null, slug: null, shareUrl: null, progress: 0 });
}

// ── SCREENSHOT ─────────────────────────────────────────────
async function takeScreenshot(opts = {}) {
  const { token, worker } = await getConfig();
  if (!token) { setState({ status: 'error', error: 'No token set.' }); return; }
  let workerUrl = worker;
  if (!workerUrl) { const c = await api('config', {}); workerUrl = c.worker; await chrome.storage.local.set({ koWorker: workerUrl }); }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  setState({ status: 'uploading', tabId: tab?.id || null, progress: 20 });

  try {
    let dataUrl;
    if (opts.area && tab?.id) {
      dataUrl = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { type: 'ko-select-area' }, (res) => {
          if (chrome.runtime.lastError || !res?.rect) return reject(new Error('cancelled'));
          chrome.tabs.captureVisibleTab(null, { format: 'png' }, (full) => resolve({ full, rect: res.rect, dpr: res.dpr }));
        });
      });
    } else {
      dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    }

    const created = await api('create', {
      kind: 'screenshot', mime: 'image/png',
      source_type: 'screenshot', source_url: tab?.url || null, source_title: tab?.title || null,
      title: opts.title || tab?.title || null, has_audio: false,
      visibility: opts.visibility || 'unlisted',
    });

    await ensureOffscreen();
    chrome.runtime.sendMessage({
      type: 'ko-offscreen-screenshot',
      payload: { dataUrl, worker: workerUrl, token, videoId: created.id },
    }).catch(() => {});
    setState({ videoId: created.id, slug: created.slug, progress: 50 });
  } catch (e) {
    setState({ status: e.message === 'cancelled' ? 'idle' : 'error', error: e.message === 'cancelled' ? null : e.message });
  }
}

// ── finish ─────────────────────────────────────────────────
async function finish(payload) {
  try {
    // The row is created in parallel with the countdown. On a very short
    // recording over a slow connection it may not exist yet — wait for it.
    for (let i = 0; i < 40 && !state.videoId; i++) {
      await new Promise(r => setTimeout(r, 250));
    }
    if (!state.videoId) throw new Error('The recording never registered. Check your connection and try again.');

    const res = await api('finalize', { id: state.videoId, ...payload });
    const shareUrl = res.url || `${SITE}/v/${state.slug}`;
    setState({ status: 'done', shareUrl, progress: 100 });

    // Put the link on the clipboard via the offscreen doc, and tell the user.
    chrome.runtime.sendMessage({ type: 'ko-offscreen-clipboard', text: shareUrl }).catch(() => {});
    chrome.notifications.create(`ko-${state.slug}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Recording ready — link copied',
      message: shareUrl,
      priority: 2,
    });
    await removeOverlay(state.tabId);
    if (payload.openTab !== false) chrome.tabs.create({ url: shareUrl });
  } catch (e) {
    setState({ status: 'error', error: e.message });
  } finally {
    setTimeout(() => closeOffscreen(), 3000);
  }
}

// ── message router ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'ko-get-state': sendResponse({ state }); break;
      case 'ko-reset':
        // Clear a finished or failed run so the next popup opens clean.
        if (state.status === 'error' || state.status === 'done') {
          setState({ status: 'idle', error: null, progress: 0, videoId: null, slug: null, shareUrl: null });
        }
        sendResponse({ ok: true });
        break;
      case 'ko-start':     await startRecording(msg.opts); sendResponse({ ok: true }); break;
      case 'ko-stop':      await stopRecording(); sendResponse({ ok: true }); break;
      case 'ko-pause':     await pauseRecording(); sendResponse({ ok: true }); break;
      case 'ko-resume':    await resumeRecording(); sendResponse({ ok: true }); break;
      case 'ko-cancel':    await cancelRecording(); sendResponse({ ok: true }); break;
      case 'ko-screenshot': await takeScreenshot(msg.opts || {}); sendResponse({ ok: true }); break;

      // ── from the offscreen recorder ──
      case 'ko-report': report(msg.stage, msg.message, msg.detail, msg.level); break;
      case 'ko-recording-started': setState({ status: 'recording', startedAt: Date.now() }); break;
      case 'ko-upload-progress':   setState({ status: 'uploading', progress: msg.progress }); break;
      case 'ko-recording-done':    await finish(msg.payload); break;
      case 'ko-recording-error':
        setState({ status: 'error', error: msg.error });
        report('recording', msg.error, {}, 'error');
        if (state.videoId) api('fail', { id: state.videoId, error: msg.error }).catch(() => {});
        await removeOverlay(state.tabId);
        break;
      case 'ko-stream-ended':      await stopRecording(); break;
      default: break;
    }
  })();
  return true;
});

// ── keyboard shortcuts + context menu ──────────────────────
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === 'toggle-recording') {
    if (state.status === 'recording' || state.status === 'paused') await stopRecording();
    else await startRecording({ source: 'screen', mic: true, systemAudio: true, countdown: true });
  }
  if (cmd === 'take-screenshot') await takeScreenshot({});
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ko-rec-screen', title: 'Record this screen', contexts: ['all'] });
    chrome.contextMenus.create({ id: 'ko-rec-tab', title: 'Record this tab', contexts: ['all'] });
    chrome.contextMenus.create({ id: 'ko-shot', title: 'Screenshot this tab', contexts: ['all'] });
    chrome.contextMenus.create({ id: 'ko-library', title: 'Open my video library', contexts: ['all'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'ko-rec-screen') await startRecording({ source: 'screen', mic: true, systemAudio: true, countdown: true });
  if (info.menuItemId === 'ko-rec-tab')    await startRecording({ source: 'tab', mic: true, systemAudio: true, countdown: true });
  if (info.menuItemId === 'ko-shot')       await takeScreenshot({});
  if (info.menuItemId === 'ko-library')    chrome.tabs.create({ url: `${SITE}/videos` });
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('ko-') && state.shareUrl) chrome.tabs.create({ url: state.shareUrl });
});
