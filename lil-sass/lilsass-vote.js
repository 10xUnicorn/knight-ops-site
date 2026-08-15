/* Public voting + waitlist controller.
   Voters can cast but NEVER see results. Waitlist is app-updates only. */
(function () {
'use strict';
const L = window.LILSASS, ART = window.LILSASS_ART;
const $ = s => document.querySelector(s);

const CFG = {
  url: 'https://trpnlkntvulkjerevngm.supabase.co',
  key: 'sb_publishable_oZuxXtZg07RhUiqpsKLm9Q_XZD8L8XK',
  previewId: 'f124bace-0970-42fb-ade6-d8132955bc86',
  consent: 'Yes, keep me posted about updates to the Lil’ Sass app. We’ll only email you about this app — nothing else, ever.'
};

/* Which options are public. Overridable via ?s=A,B&y=1,3 so Christie's
   "Voters see this" toggles can drive the shared link. */
const qs = new URLSearchParams(location.search);
const PUB_DIRS = (qs.get('d') || 'picture,deck,calm').split(',').filter(c => L.DIRECTIONS[c]);

const vote = { direction:null, id:null };

function fingerprint() {
  let f = localStorage.getItem('ls_fp');
  if (!f) { f = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); localStorage.setItem('ls_fp', f); }
  return f;
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* Voters hold INSERT + UPDATE but deliberately NOT SELECT — results must stay
   private. That rules out return=representation AND PostgREST upserts
   (merge-duplicates needs to read the conflicting row). So: plain INSERT, and
   on a duplicate-key conflict fall back to a filtered PATCH. */
const HEAD = {
  'apikey': CFG.key,
  'Authorization': 'Bearer ' + CFG.key,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

async function rpc(fn, args) {
  const res = await fetch(CFG.url + '/rest/v1/rpc/' + fn, {
    method: 'POST', headers: HEAD, body: JSON.stringify(args)
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(await res.text()); msg = j.message || j.hint || msg; } catch (e) {}
    throw new Error(msg);
  }
  return true;
}

async function insertRow(table, row) {
  const res = await fetch(CFG.url + '/rest/v1/' + table, {
    method: 'POST', headers: HEAD, body: JSON.stringify([row])
  });
  if (res.ok) return 'inserted';
  const txt = await res.text();
  if (res.status === 409 || /duplicate key/i.test(txt)) return 'conflict';
  let msg = 'HTTP ' + res.status;
  try { const j = JSON.parse(txt); msg = j.message || j.hint || msg; } catch (e) {}
  throw new Error(msg);
}

async function patchRow(table, filter, row) {
  const res = await fetch(CFG.url + '/rest/v1/' + table + '?' + filter, {
    method: 'PATCH', headers: HEAD, body: JSON.stringify(row)
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(await res.text()); msg = j.message || j.hint || msg; } catch (e) {}
    throw new Error(msg);
  }
  return 'updated';
}

/* ---------- pick a direction ---------- */
function buildDirections() {
  const g = $('#structgrid'); g.innerHTML = '';
  PUB_DIRS.forEach(code => {
    const d = L.DIRECTIONS[code];
    const card = document.createElement('button');
    card.className = 'vopt' + (vote.direction === code ? ' on' : '');
    card.dataset.dir = code;
    card.innerHTML = `
      <div class="sw">${d.swatch.map(c => `<i style="background:${c}"></i>`).join('')}</div>
      <h3>${d.name}</h3>
      <div class="tag">${d.tagline}</div>
      <p>${d.blurb}</p>
      <div class="stagebox" id="stage-${code}"></div>
      <div class="pick"><i></i>${vote.direction === code ? 'This is my pick' : 'Pick this one'}</div>`;
    card.addEventListener('click', () => {
      vote.direction = code;
      g.querySelectorAll('.vopt').forEach(x => {
        x.classList.toggle('on', x.dataset.dir === code);
        x.querySelector('.pick').lastChild.textContent =
          x.dataset.dir === code ? 'This is my pick' : 'Pick this one';
      });
      renderDesktop(code);
      $('#n1').disabled = false;
    });
    g.appendChild(card);
  });
  PUB_DIRS.forEach(code => {
    window.LILSASS_APP.createApp($('#stage-' + code), { direction: code, device: 'mobile', art: ART });
    // Using the prototype ALSO counts as picking it — the click bubbles to the
    // card on purpose. Only thing we swallow is the phone's own scroll chrome.
    $('#stage-' + code).style.pointerEvents = 'auto';
  });
  renderDesktop(vote.direction || PUB_DIRS[0]);
}

/* ONE full-width desktop preview underneath, following the current pick */
let deskApp = null, deskScreen = 'grownup';
const SCREENS = [
  ['grownup','Grown-up'], ['profiles','Our rink'], ['childHome','A child'],
  ['guide','Pick a guide'], ['chat','Talking'], ['mooIntro','Mrs. Moo'],
  ['cape','The cape'], ['book','The book'], ['delivered','Finished']
];
function renderDesktop(code) {
  const d = L.DIRECTIONS[code]; if (!d) return;
  $('#deskname').textContent = 'Showing ' + d.name;
  deskApp = window.LILSASS_APP.createApp($('#deskstage'), { direction: code, device: 'desktop', art: ART });
  if (deskApp && typeof deskApp.goTo === 'function') deskApp.goTo(deskScreen);
  window.LILSASS_APP.fitDesktop($('#deskstage'));
  const nav = $('#desknav'); if (!nav) return;
  nav.innerHTML = SCREENS.map(([id, label]) =>
    `<button class="scrbtn${id===deskScreen?' on':''}" data-screen="${id}">${label}</button>`).join('');
  nav.querySelectorAll('[data-screen]').forEach(b =>
    b.addEventListener('click', () => {
      deskScreen = b.dataset.screen;
      nav.querySelectorAll('.scrbtn').forEach(x => x.classList.toggle('on', x === b));
      if (deskApp && typeof deskApp.goTo === 'function') deskApp.goTo(deskScreen);
      window.LILSASS_APP.fitDesktop($('#deskstage'));
    }));
}

/* ---------- reveal, don't navigate ---------- */
function reveal(id) {
  const e = $(id); if (!e) return;
  e.classList.remove('hide');
  e.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- submit vote ---------- */
/* The vote is committed on its own. Feedback is a second, optional step that
   PATCHes the same row — so we never lose a vote to someone abandoning a textarea. */
let voteFp = null;

$('#n1').addEventListener('click', async function () {
  this.disabled = true; this.textContent = 'Sending…';
  voteFp = fingerprint();
  try {
    await rpc('save_preview_vote',
      { pid: CFG.previewId, fp: voteFp, dir: vote.direction, fb: null });
  } catch (e) {
    console.warn('vote save failed:', e.message);
  }
  this.textContent = '✓ Vote sent';
  reveal('#fbblock');
  setTimeout(() => $('#fbText').focus({ preventScroll: true }), 450);
});

async function sendFeedback(text) {
  if (!text || !voteFp) return;
  try {
    await rpc('save_preview_vote',
      { pid: CFG.previewId, fp: voteFp, dir: null, fb: text });
  } catch (e) { console.warn('feedback save failed:', e.message); }
}

$('#fbsend').addEventListener('click', async function () {
  const text = $('#fbText').value.trim();
  this.disabled = true; this.textContent = 'Sending…';
  await sendFeedback(text);
  this.textContent = '✓ Sent';
  $('#fbthanks').textContent = text ? '✓ Got it. Thank you.' : '✓ Your vote is counted.';
  $('#fbskip').disabled = true;
  $('#fbText').readOnly = true;
  reveal('#wlblock');
});

$('#fbskip').addEventListener('click', function () {
  this.disabled = true; $('#fbsend').disabled = true;
  $('#fbthanks').textContent = '✓ Your vote is counted.';
  reveal('#wlblock');
});

/* ---------- waitlist ---------- */
$('#wlopt').addEventListener('change', function () {
  $('#wlfields').classList.toggle('hide', !this.checked);
  if (this.checked) setTimeout(() => $('#wlname').focus(), 60);
});

$('#skip').addEventListener('click', function () {
  this.disabled = true; $('#n4').disabled = true;
  $('#donemsg').textContent = 'Thank you for helping shape this. Christie reads every single response.';
  reveal('#doneblock');
});

$('#n4').addEventListener('click', async function () {
  const err = $('#wlerr'); err.style.display = 'none';
  if (!$('#wlopt').checked) { $('#wlopt').checked = true; $('#wlfields').classList.remove('hide'); return; }
  const name = $('#wlname').value.trim(), email = $('#wlemail').value.trim();
  if (!name)  { err.textContent = 'Just your first name is fine.'; err.style.display = 'block'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    err.textContent = 'That email doesn’t look quite right.'; err.style.display = 'block'; return;
  }
  this.disabled = true; this.textContent = 'Adding you…';
  try {
    const row = {
      preview_id: CFG.previewId,
      name, email,
      consent_text: CFG.consent,
      marketing_opt_in: false,
      suppressed_from_knight_ops: true,
      audience: 'client_app_waitlist',
      source_page: 'lil-sass-vote',
      user_agent: navigator.userAgent.slice(0, 250)
    };
    const r = await insertRow('preview_waitlist', row);
    if (r === 'conflict') {
      await patchRow('preview_waitlist',
        'preview_id=eq.' + CFG.previewId + '&email=eq.' + encodeURIComponent(email),
        { name, consent_text: CFG.consent, marketing_opt_in: false, suppressed_from_knight_ops: true });
    }
    $('#donemsg').innerHTML = 'You’re on the list, ' + name.replace(/[<>&]/g, '') +
      '. We’ll email you when there’s real news about the app — and nothing else.';
    $('#skip').disabled = true;
    this.textContent = '✓ You’re on the list';
    reveal('#doneblock');
  } catch (e) {
    err.textContent = 'Something went wrong saving that. Your vote was still counted.';
    err.style.display = 'block';
    this.disabled = false; this.textContent = 'Join the list →';
  }
});

$('#sharelink').addEventListener('click', function () {
  const btn = this;
  const done = () => { btn.textContent = '✓ Copied'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '🔗 Copy the link'; btn.classList.remove('copied'); }, 2400); };
  if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done);
  else done();
});

/* boot */
buildDirections();
})();
