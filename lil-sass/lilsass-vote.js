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
const PUB_STRUCT = (qs.get('s') || 'A,B,C').split(',').filter(c => L.STRUCTURES[c]);
const PUB_STYLE  = (qs.get('y') || '1,2,3').split(',').filter(c => L.STYLES[c]);

const vote = { structure:null, style:null, device:null, id:null };
const apps = {};
let device = 'mobile';

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

/* ---------- step 1: structures ---------- */
function buildStructures() {
  const g = $('#structgrid'); g.innerHTML = '';
  PUB_STRUCT.forEach(code => {
    const s = L.STRUCTURES[code];
    const card = document.createElement('button');
    card.className = 'vopt' + (vote.structure === code ? ' on' : '');
    card.dataset.struct = code;
    card.innerHTML = `
      <h3>${s.name}</h3>
      <div class="tag">${s.tagline}</div>
      <p>${s.blurb}</p>
      <div class="stagebox" id="stage-${code}"></div>
      <div class="pick"><i></i>${vote.structure === code ? 'This is my pick' : 'Pick this one'}</div>`;
    card.addEventListener('click', () => {
      vote.structure = code;
      g.querySelectorAll('.vopt').forEach(x => {
        x.classList.toggle('on', x.dataset.struct === code);
        x.querySelector('.pick').lastChild.textContent =
          x.dataset.struct === code ? 'This is my pick' : 'Pick this one';
      });
      $('#n1').disabled = false;
    });
    g.appendChild(card);
  });
  PUB_STRUCT.forEach(code => {
    apps[code] = window.LILSASS_APP.createApp($('#stage-' + code), {
      structure: code, style: vote.style || PUB_STYLE[0], device, art: ART
    });
    // let people actually play inside the frame
    const box = $('#stage-' + code);
    box.style.pointerEvents = 'auto';
    box.addEventListener('click', e => e.stopPropagation());
  });
}

/* ---------- step 2: styles ---------- */
function buildStyles() {
  const g = $('#stylegrid'); g.innerHTML = '';
  PUB_STYLE.forEach(code => {
    const s = L.STYLES[code];
    const card = document.createElement('button');
    card.className = 'vopt' + (vote.style === code ? ' on' : '');
    card.dataset.style = code;
    card.innerHTML = `
      <div class="sw">${s.swatch.map(c => `<i style="background:${c}"></i>`).join('')}</div>
      <h3>${s.name}</h3>
      <div class="tag">${s.tagline}</div>
      <p>${s.blurb}</p>
      <div class="stagebox" id="sstage-${code}"></div>
      <div class="pick"><i></i>${vote.style === code ? 'This is my pick' : 'Pick this one'}</div>`;
    card.addEventListener('click', () => {
      vote.style = code;
      g.querySelectorAll('.vopt').forEach(x => {
        x.classList.toggle('on', x.dataset.style === code);
        x.querySelector('.pick').lastChild.textContent =
          x.dataset.style === code ? 'This is my pick' : 'Pick this one';
      });
      $('#n2').disabled = false;
    });
    g.appendChild(card);
  });
  PUB_STYLE.forEach(code => {
    window.LILSASS_APP.createApp($('#sstage-' + code), {
      structure: vote.structure || PUB_STRUCT[0], style: code, device:'mobile', art: ART
    });
    const box = $('#sstage-' + code);
    box.addEventListener('click', e => e.stopPropagation());
  });
}

/* ---------- navigation ---------- */
function show(n) {
  [1,2,3,4,5].forEach(i => $('#s' + i).classList.toggle('hide', i !== n));
  document.querySelectorAll('.progress i').forEach((d, i) => d.classList.toggle('on', i < Math.min(n,4)));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#n1').addEventListener('click', () => { buildStyles(); show(2); });
$('#n2').addEventListener('click', () => show(3));
document.querySelectorAll('[data-back]').forEach(b =>
  b.addEventListener('click', () => show(+b.dataset.back)));

document.querySelectorAll('[data-devpref]').forEach(b =>
  b.addEventListener('click', () => {
    vote.device = b.dataset.devpref;
    document.querySelectorAll('.devopt').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    $('#n3').disabled = false;
  }));

document.querySelectorAll('#dev1 button').forEach(b =>
  b.addEventListener('click', () => {
    document.querySelectorAll('#dev1 button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); device = b.dataset.dev; buildStructures();
  }));

/* ---------- submit vote ---------- */
$('#n3').addEventListener('click', async function () {
  this.disabled = true; this.textContent = 'Sending…';
  vote.id = uuid();
  const fp = fingerprint();
  const payload = {
    structure_code: vote.structure,
    style_code: vote.style,
    device_pref: vote.device
  };
  try {
    const r = await insertRow('preview_votes',
      Object.assign({ id: vote.id, preview_id: CFG.previewId, voter_fingerprint: fp }, payload));
    if (r === 'conflict') {
      // they already voted from this browser — update their answer instead
      vote.id = null;
      await patchRow('preview_votes',
        'preview_id=eq.' + CFG.previewId + '&voter_fingerprint=eq.' + encodeURIComponent(fp), payload);
    }
  } catch (e) {
    console.warn('vote save failed:', e.message); // still thank them
    vote.id = null;
  }
  this.disabled = false; this.textContent = 'Send my vote →';
  show(4);
});

/* ---------- waitlist ---------- */
$('#wlopt').addEventListener('change', function () {
  $('#wlfields').classList.toggle('hide', !this.checked);
  if (this.checked) setTimeout(() => $('#wlname').focus(), 60);
});

$('#skip').addEventListener('click', () => {
  $('#donemsg').textContent = 'Thank you for helping shape this. Christie reads every single response.';
  show(5);
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
      vote_id: vote.id,
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
    show(5);
  } catch (e) {
    err.textContent = 'Something went wrong saving that. Your vote was still counted.';
    err.style.display = 'block';
    this.disabled = false; this.textContent = 'Join the list →';
  }
});

$('#sharelink').addEventListener('click', function () {
  navigator.clipboard && navigator.clipboard.writeText(location.href);
  this.textContent = '✓ Link copied';
});

/* boot */
buildStructures();
})();
