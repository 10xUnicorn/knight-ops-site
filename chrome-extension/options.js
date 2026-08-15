const FN = 'https://trpnlkntvulkjerevngm.supabase.co/functions/v1';
const $ = (id) => document.getElementById(id);

/**
 * Load order: saved settings first, then local-config.json if nothing is saved yet.
 * local-config.json is gitignored, so credentials live on this machine only —
 * but it means a fresh install configures itself instead of asking you to paste.
 */
async function localConfig() {
  try {
    const r = await fetch(chrome.runtime.getURL('local-config.json'));
    if (!r.ok) return null;
    const c = await r.json();
    return c && c.token ? c : null;
  } catch (_) { return null; }
}

(async () => {
  const { koToken, koWorker } = await chrome.storage.local.get(['koToken', 'koWorker']);
  if (koToken) {
    $('token').value = koToken;
    if (koWorker) $('worker').value = koWorker;
    return;
  }
  const cfg = await localConfig();
  if (!cfg) return;
  $('token').value = cfg.token;
  if (cfg.worker) $('worker').value = cfg.worker;
  msg('Found local-config.json — connecting automatically…', true);
  $('save').click();   // self-configure: saves and runs the connection test
})();

function msg(text, ok) {
  const el = $('msg');
  el.textContent = text;
  el.className = `msg ${ok ? 'ok' : 'bad'}`;
}

$('save').addEventListener('click', async () => {
  const token = $('token').value.trim();
  if (!token) return msg('Paste your recorder token first.', false);

  $('save').textContent = 'Testing…';
  try {
    const r = await fetch(`${FN}/video-manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'config' }),
    });
    const data = await r.json().catch(() => ({}));

    if (r.status === 401) return msg('That token was rejected. Check it matches KO_VIDEO_SECRET exactly.', false);
    if (!r.ok) return msg(`Connection failed: ${data.error || r.status}`, false);

    const worker = $('worker').value.trim() || data.worker || '';
    if (!worker) return msg('Connected, but no storage worker URL is configured on the server yet.', false);

    // Confirm the storage worker is actually reachable.
    let workerOk = false;
    try {
      const h = await fetch(`${worker}/health`);
      workerOk = h.ok;
    } catch (_) { /* below */ }

    await chrome.storage.local.set({ koToken: token, koWorker: worker });
    msg(workerOk
      ? '✅ Connected. Dashboard and storage worker both responding — you are ready to record.'
      : `⚠️ Saved. Dashboard is fine, but the storage worker at ${worker} did not respond to /health. Deploy the ko-video worker.`,
      workerOk);
  } catch (e) {
    msg(`Connection failed: ${e.message}`, false);
  } finally {
    $('save').textContent = 'Save & test connection';
  }
});

$('clear').addEventListener('click', async () => {
  await chrome.storage.local.remove(['koToken', 'koWorker']);
  $('token').value = '';
  $('worker').value = '';
  msg('Cleared.', true);
});
