const SITE = 'https://knightops.biz';
const $ = (id) => document.getElementById(id);
const show = (el, on) => el.classList.toggle('hide', !on);

let source = 'screen';
let tick = null;
let startedAt = 0;

// Pages Chrome refuses to capture — warn before the user hits record, rather
// than letting them hit an opaque "Error starting tab capture".
const UNCAPTURABLE = /^(chrome|chrome-extension|devtools|edge|about|view-source):|^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/i;
let activeTabUrl = '';

async function checkTabCapturable() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabUrl = tab?.url || '';
  const blocked = !activeTabUrl || UNCAPTURABLE.test(activeTabUrl);
  const tabTile = document.querySelector('.src[data-src="tab"]');
  if (tabTile) {
    tabTile.style.opacity = blocked ? '.4' : '';
    tabTile.title = blocked ? 'Chrome does not allow recording this page' : 'Record just this browser tab';
  }
  if (source === 'tab' && blocked) {
    $('err').textContent = 'Chrome will not record this page (browser and extension pages are off limits). Pick Screen or Window, or switch to a normal website tab.';
    show($('err'), true);
    $('start').disabled = true;
    return false;
  }
  show($('err'), false);
  $('start').disabled = false;
  return true;
}

// ── source picker ──────────────────────────────────────────
document.querySelectorAll('.src').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.src').forEach(s => s.classList.remove('on'));
    el.classList.add('on');
    source = el.dataset.src;
    // Camera-only recordings have no system audio and no bubble to overlay.
    const cameraOnly = source === 'camera';
    $('sys').disabled = cameraOnly;
    $('cam').disabled = cameraOnly;
    if (cameraOnly) { $('sys').checked = false; $('cam').checked = false; }
    chrome.storage.local.set({ koSource: source });
    checkTabCapturable();
  });
});

// ── restore preferences ────────────────────────────────────
chrome.storage.local.get(['koSource', 'koPrefs'], ({ koSource, koPrefs }) => {
  if (koSource) {
    const el = document.querySelector(`.src[data-src="${koSource}"]`);
    if (el) el.click();
  }
  if (koPrefs) {
    $('mic').checked = koPrefs.mic !== false;
    $('sys').checked = koPrefs.systemAudio !== false;
    $('cam').checked = !!koPrefs.camera;
    $('cd').checked = koPrefs.countdown !== false;
    $('quality').value = koPrefs.quality || 'high';
    $('visibility').value = koPrefs.visibility || 'unlisted';
  }
});

function prefs() {
  return {
    source,
    mic: $('mic').checked,
    systemAudio: $('sys').checked && source !== 'camera',
    camera: $('cam').checked && source !== 'camera',
    countdown: $('cd').checked,
    quality: $('quality').value,
    visibility: $('visibility').value,
  };
}

// ── actions ────────────────────────────────────────────────
$('start').addEventListener('click', async () => {
  const p = prefs();
  await chrome.storage.local.set({ koPrefs: p });
  $('start').disabled = true;
  $('start').textContent = 'Choose what to share…';
  chrome.runtime.sendMessage({ type: 'ko-start', opts: p });
  setTimeout(() => window.close(), 400);
});

$('snap').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'ko-screenshot', opts: { visibility: $('visibility').value } });
  setTimeout(() => window.close(), 300);
});

$('pause').addEventListener('click', () => {
  const paused = $('pause').dataset.paused === '1';
  chrome.runtime.sendMessage({ type: paused ? 'ko-resume' : 'ko-pause' });
});
$('stop').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'ko-stop' }));
$('cancel').addEventListener('click', () => {
  if (confirm('Discard this recording? It cannot be recovered.')) {
    chrome.runtime.sendMessage({ type: 'ko-cancel' });
  }
});
$('again').addEventListener('click', () => render({ status: 'idle' }));
$('copy').addEventListener('click', () => {
  $('shareUrl').select();
  navigator.clipboard.writeText($('shareUrl').value);
  $('copy').textContent = 'Copied';
  setTimeout(() => ($('copy').textContent = 'Copy'), 1500);
});
$('openVid').addEventListener('click', () => chrome.tabs.create({ url: $('shareUrl').value }));
$('library').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: `${SITE}/videos` }); });
$('settings').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

// ── render ─────────────────────────────────────────────────
function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
           : `${m}:${String(sec).padStart(2, '0')}`;
}

function render(state) {
  const st = state.status;
  const live = st === 'recording' || st === 'paused';
  const up   = st === 'uploading';
  const done = st === 'done';
  // Anything that isn't an active run falls back to the idle panel — including
  // 'error' and any unknown/missing status. The popup must never render empty.
  const idleish = !live && !up && !done;
  show($('idle'), idleish);
  show($('live'), live);
  show($('up'),   up);
  show($('done'), done);

  if (state.error) { $('err').textContent = state.error; show($('err'), true); }
  else show($('err'), false);

  if (idleish) {
    $('start').disabled = false;
    $('start').textContent = 'Start recording';
    checkTabCapturable();
  }

  if (st === 'recording' || st === 'paused') {
    startedAt = state.startedAt || Date.now();
    $('lblState').textContent = st === 'paused' ? 'Paused' : 'Recording';
    $('pause').dataset.paused = st === 'paused' ? '1' : '0';
    $('pause').textContent = st === 'paused' ? '▶ Resume' : '⏸ Pause';
    const labels = { screen: 'Full screen', window: 'Window', tab: 'Browser tab', camera: 'Camera' };
    $('srcLbl').textContent = `${labels[state.sourceType] || 'Screen'} · uploading as you record`;
    if (!tick) tick = setInterval(() => { $('timer').textContent = fmt(Date.now() - startedAt); }, 500);
  } else if (tick) { clearInterval(tick); tick = null; }

  if (st === 'uploading') {
    $('barFill').style.width = `${state.progress || 5}%`;
    $('upLbl').textContent = state.progress >= 90 ? 'Finishing up…' : 'Uploading…';
  }

  if (st === 'done' && state.shareUrl) $('shareUrl').value = state.shareUrl;
}

chrome.runtime.onMessage.addListener((msg) => { if (msg.type === 'state') render(msg.state); });

// Opening the popup clears a finished-or-failed run, so a stale error from
// earlier can never leave the UI stuck. Safety net: if the service worker is
// asleep or never answers, fall back to a usable idle screen.
let answered = false;
chrome.runtime.sendMessage({ type: 'ko-get-state' }, (res) => {
  answered = true;
  const s = res?.state;
  if (!s) { render({ status: 'idle' }); return; }
  if (s.status === 'error' || s.status === 'done') {
    chrome.runtime.sendMessage({ type: 'ko-reset' }).catch(() => {});
    render({ ...s, status: 'idle' });      // keep the message, restore the controls
    return;
  }
  render(s);
});
setTimeout(() => { if (!answered) render({ status: 'idle' }); }, 1200);

// Nudge the user to set a token if they never have.
// Checks saved settings first, then the gitignored local-config.json that lets
// the extension configure itself on this machine.
(async () => {
  const { koToken } = await chrome.storage.local.get('koToken');
  if (koToken) return;
  try {
    const r = await fetch(chrome.runtime.getURL('local-config.json'));
    if (r.ok) {
      const c = await r.json();
      if (c && c.token) {
        await chrome.storage.local.set({ koToken: c.token, koWorker: c.worker || '' });
        return;
      }
    }
  } catch (_) { /* fall through to the prompt */ }

  $('err').innerHTML = 'No recorder token set. <a href="#" id="goOpt" style="color:#C9922A">Open settings</a> and paste it.';
  show($('err'), true);
  $('goOpt')?.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
  $('start').disabled = true;
})();
