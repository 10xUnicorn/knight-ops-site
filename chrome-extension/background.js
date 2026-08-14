/**
 * Knight Ops Recorder — background service worker
 * Orchestrates capture permission, the offscreen recorder, the on-page overlay,
 * and the upload lifecycle. Holds no media itself (service workers can't).
 */

const FN = 'https://trpnlkntvulkjerevngm.supabase.co/functions/v1';
const SITE = 'https://knightops.biz';

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
  return { token: koToken || '', worker: koWorker || '' };
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

// ── offscreen document ─────────────────────────────────────
async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA', 'DISPLAY_MEDIA'],
    justification: 'Record screen, tab, window, camera and microphone audio.',
  });
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
function chooseDesktop(sources, tab) {
  return new Promise((resolve, reject) => {
    const reqId = chrome.desktopCapture.chooseDesktopMedia(sources, tab, (streamId, options) => {
      if (!streamId) return reject(new Error('cancelled'));
      resolve({ streamId, options });
    });
    // If the picker never returns we don't want a dangling request.
    setTimeout(() => { try { chrome.desktopCapture.cancelChooseDesktopMedia(reqId); } catch (_) {} }, 120000);
  });
}

// ── START ──────────────────────────────────────────────────
async function startRecording(opts) {
  const { token, worker } = await getConfig();
  if (!token) { setState({ status: 'error', error: 'No token. Open extension options.' }); return; }

  let workerUrl = worker;
  if (!workerUrl) {
    const cfg = await api('config', {});
    workerUrl = cfg.worker;
    await chrome.storage.local.set({ koWorker: workerUrl });
  }
  if (!workerUrl) { setState({ status: 'error', error: 'Storage worker URL not configured.' }); return; }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  setState({ status: 'starting', tabId: tab?.id || null, sourceType: opts.source, error: null, shareUrl: null, progress: 0 });

  let streamId = null;
  let captureSource = 'desktop';
  try {
    if (opts.source === 'tab') {
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      captureSource = 'tab';
    } else if (opts.source === 'camera') {
      streamId = null;
    } else {
      const sources = opts.source === 'window' ? ['window'] : ['screen', 'window'];
      if (opts.systemAudio) sources.push('audio');
      const res = await chooseDesktop(sources, tab);
      streamId = res.streamId;
    }
  } catch (e) {
    setState({ status: 'idle', error: e.message === 'cancelled' ? null : e.message });
    return;
  }

  // Create the DB row up front so the share link exists before the upload finishes.
  let created;
  try {
    created = await api('create', {
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
  } catch (e) {
    setState({ status: 'error', error: e.message });
    return;
  }

  setState({ videoId: created.id, slug: created.slug });

  if (tab?.id && opts.source !== 'camera') {
    await injectOverlay(tab.id, { camera: opts.camera, countdown: opts.countdown !== false });
  }

  await ensureOffscreen();
  chrome.runtime.sendMessage({
    type: 'ko-offscreen-start',
    payload: {
      streamId, captureSource,
      source: opts.source,
      mic: !!opts.mic,
      systemAudio: !!opts.systemAudio,
      camera: !!opts.camera && opts.source === 'camera',
      worker: workerUrl,
      token,
      videoId: created.id,
      countdown: opts.countdown !== false ? 3 : 0,
      quality: opts.quality || 'high',
    },
  }).catch(() => {});
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
      case 'ko-start':     await startRecording(msg.opts); sendResponse({ ok: true }); break;
      case 'ko-stop':      await stopRecording(); sendResponse({ ok: true }); break;
      case 'ko-pause':     await pauseRecording(); sendResponse({ ok: true }); break;
      case 'ko-resume':    await resumeRecording(); sendResponse({ ok: true }); break;
      case 'ko-cancel':    await cancelRecording(); sendResponse({ ok: true }); break;
      case 'ko-screenshot': await takeScreenshot(msg.opts || {}); sendResponse({ ok: true }); break;

      // ── from the offscreen recorder ──
      case 'ko-recording-started': setState({ status: 'recording', startedAt: Date.now() }); break;
      case 'ko-upload-progress':   setState({ status: 'uploading', progress: msg.progress }); break;
      case 'ko-recording-done':    await finish(msg.payload); break;
      case 'ko-recording-error':
        setState({ status: 'error', error: msg.error });
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
