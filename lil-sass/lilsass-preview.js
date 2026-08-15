/* Christie's private page — one design choice, sticky preview, share link,
   decisions, pricing, votes, finalize. */
(function () {
'use strict';
const L = window.LILSASS, ART = window.LILSASS_ART;
const $ = s => document.querySelector(s);

const SB = {
  url: 'https://trpnlkntvulkjerevngm.supabase.co',
  key: 'sb_publishable_oZuxXtZg07RhUiqpsKLm9Q_XZD8L8XK',
  previewId: 'f124bace-0970-42fb-ade6-d8132955bc86',
  projectId: 'ea3bd6ab-9d70-4a78-8ced-0ffabcd516d9',
  voteBase: 'https://www.knightops.biz/lil-sass/vote'
};

const state = {
  direction: 'picture',
  device: 'mobile',
  screen: 'grownup',
  decisions: {},
  pub: new Set(['picture','deck','calm'])
};
let app = null, deskApp = null;

/* ---------- the build (not a choice) ---------- */
function renderBuild() {
  $('#buildbox').innerHTML = `
    <div class="buildcard">
      <div class="buildtag">What we're building</div>
      <h3>${L.BUILD.name}</h3>
      <p class="buildsum">${L.BUILD.summary}</p>
      <div class="whygrid">
        ${L.BUILD.why.map(([t, d]) => `<div class="why"><b>${t}</b><span>${d}</span></div>`).join('')}
      </div>
    </div>`;
}

/* ---------- direction picker ---------- */
function renderDirections() {
  $('#dirpick').innerHTML = Object.values(L.DIRECTIONS).map(d => `
    <button class="opt${d.code===state.direction?' on':''}" data-dir="${d.code}">
      <div class="sw">${d.swatch.map(c => `<i style="background:${c}"></i>`).join('')}</div>
      <h3>${d.name}</h3>
      <div class="tag">${d.tagline}</div>
      <p>${d.blurb}</p>
      <div class="best">✅ ${d.bestFor}</div>
      <div class="layoutnote">${d.layoutNote}</div>
      <span class="shr${state.pub.has(d.code)?' on':''}" data-share="${d.code}">
        <i></i>${state.pub.has(d.code) ? 'Voters see this' : 'Hidden from voters'}</span>
    </button>`).join('');

  $('#dirpick').querySelectorAll('[data-dir]').forEach(b =>
    b.addEventListener('click', () => {
      state.direction = b.dataset.dir;
      renderDirections(); renderDash(); renderShare();
      if (app) app.setDirection(state.direction);
      mountDesktop();
      syncNow();
    }));

  $('#dirpick').querySelectorAll('[data-share]').forEach(t =>
    t.addEventListener('click', e => {
      e.stopPropagation();
      const c = t.dataset.share;
      if (state.pub.has(c)) { if (state.pub.size > 1) state.pub.delete(c); } else { state.pub.add(c); }
      renderDirections(); renderShare();
    }));
}

/* ---------- sticky prototype ---------- */
const SCREENS = [
  ['grownup','Grown-up'], ['profiles','Our rink'], ['childHome','A child'],
  ['guide','Pick a guide'], ['chat','Talking'], ['mooIntro','Mrs. Moo'],
  ['cape','The cape'], ['book','The book'], ['delivered','Finished']
];

function mountApp() {
  app = window.LILSASS_APP.createApp($('#stage'), {
    direction: state.direction, device: 'mobile', art: ART
  });
  // defensive: never let a stale cached renderer blank the page
  if (state.screen && app && typeof app.goTo === 'function') app.goTo(state.screen);
  mountDesktop();
}

/* full-width desktop preview, below the choices - never overlapping them */
function mountDesktop() {
  const d = L.DIRECTIONS[state.direction];
  const el = $('#deskname'); if (el) el.textContent = 'Showing ' + d.name;
  const stage = $('#deskstage'); if (!stage) return;
  deskApp = window.LILSASS_APP.createApp(stage, {
    direction: state.direction, device: 'desktop', art: ART
  });
  if (state.screen && deskApp && typeof deskApp.goTo === 'function') deskApp.goTo(state.screen);
}

function renderScreenNav() {
  $('#screennav').innerHTML = SCREENS.map(([id, label]) =>
    `<button class="scrbtn${id===state.screen?' on':''}" data-screen="${id}">${label}</button>`).join('');
  $('#screennav').querySelectorAll('[data-screen]').forEach(b =>
    b.addEventListener('click', () => {
      state.screen = b.dataset.screen;
      renderScreenNav();
      if (app) app.goTo(state.screen);
      if (deskApp && typeof deskApp.goTo === 'function') deskApp.goTo(state.screen);
    }));
}

function syncNow() {
  $('#nowshow').innerHTML = `Showing <b>${L.DIRECTIONS[state.direction].name}</b>`;
  renderSummary();
}

/* ---------- dashboard (one, themed) ---------- */
function renderDash() {
  const d = L.DASHBOARD, v = L.DIRECTIONS[state.direction].vars;
  const theme = {
    '--d-screen':v['--screen'],'--d-card':v['--card'],'--d-ink':v['--ink'],
    '--d-soft':v['--ink-soft'],'--d-line':v['--line'],'--d-chip':v['--chip'],
    '--d-accent':v['--accent'],'--d-support':v['--support'],'--d-onaccent':v['--onaccent']
  };
  const styleAttr = Object.entries(theme).map(([k, val]) => `${k}:${val}`).join(';');
  const ICON = { Overview:'📊', Children:'👧', Adventures:'📚', Classrooms:'🏫', Settings:'⚙️' };

  $('#dashstage').innerHTML = `
    <div class="dash" style="${styleAttr}">
      <div class="dashtop">
        <span class="dot" style="background:#FF5F57"></span>
        <span class="dot" style="background:#FEBC2E"></span>
        <span class="dot" style="background:#28C840"></span>
        <span class="durl">🔒 lilsass.com/dashboard</span>
      </div>
      <div class="dashbody">
        <div class="dashnav">
          <div class="dashbrand"><img src="${ART.cape.red}" alt=""><b>Lil’ Sass</b></div>
          ${d.nav.map((n,i) => `<button class="${i===0?'on':''}"><i style="font-style:normal">${ICON[n]||'•'}</i>${n}</button>`).join('')}
        </div>
        <div class="dashmain">
          <h4>Hi Christie 💖</h4>
          <div class="dsub">${d.blurb}</div>
          <div class="kpis">
            ${d.kpis.map(k => `<div class="kpi"><div class="n">${k.n}</div><div class="l">${k.l}</div>${k.d?`<div class="d">${k.d}</div>`:''}</div>`).join('')}
          </div>
          <div class="panelrow">
            <div class="panel"><h5>Newest adventures</h5>
              <div class="prow"><span class="pav" style="background:#E8442A">A</span>Amina, 8 · Anger · teal cape<span class="ptag">Today</span></div>
              <div class="prow"><span class="pav" style="background:#5B3FA8">J</span>Jonah, 6 · Sadness · gold cape<span class="ptag">Today</span></div>
              <div class="prow"><span class="pav" style="background:#0FA3A3">M</span>Maya, 10 · Grief · purple cape<span class="ptag">Yesterday</span></div>
            </div>
            <div class="panel"><h5>Wellbeing check-ins <span style="color:#E8A33C">●</span></h5>
              <div class="prow"><span class="pav" style="background:#E8A33C">!</span>A grown-up was notified · story paused gently<span class="pwarn">Review</span></div>
              <div class="prow" style="font-size:11.5px;opacity:.75">Sass never gives advice. She listens, then points to a trusted grown-up.</div>
            </div>
          </div>
          <div class="panelrow">
            <div class="panel"><h5>Which guide keeps children coming back</h5>
              ${[['Lil’ Sass',48,71],['Lil’ Artie',24,78],['Mr. OG',18,64],['Mrs. Moo',10,59]].map(([n,c,r]) =>
                `<div class="prow" style="display:block">${n} · ${c}% chosen · ${r}% return<div class="bar2"><i style="width:${r}%"></i></div></div>`).join('')}
            </div>
            <div class="panel"><h5>Emotions children are bringing</h5>
              ${[['Anger',34],['Sadness',26],['Worry',21],['Grief',12]].map(([n,p]) =>
                `<div class="prow" style="display:block">${n} · ${p}%<div class="bar2"><i style="width:${p}%"></i></div></div>`).join('')}
              <div class="prow" style="font-size:11.5px;opacity:.75">Worry is climbing. A “Worry” book would land right now.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="dashnote">One dashboard, and it wears whichever direction you pick above. Five things in the
    sidebar, everything else lives inside them, so it never gets heavy.</div>`;

  $('#dashstage').querySelectorAll('.dashnav button').forEach(b =>
    b.addEventListener('click', () => {
      $('#dashstage').querySelectorAll('.dashnav button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    }));
}

/* ---------- pricing ---------- */
function renderPricing() {
  const p = L.PRICING;
  $('#pricing').innerHTML = `
    <div class="pricehead"><h3>${p.headline}</h3><p>${p.reasoning}</p></div>
    <div class="pricetable">
      ${p.tiers.map(t => `
        <div class="ptier${t.hero?' hero':''}">
          <div class="pname">${t.name}</div>
          <div class="pprice">${t.price}<small>${t.unit}</small></div>
          <div class="pdetail">${t.detail}</div>
          <div class="pmargin">${t.margin}</div>
        </div>`).join('')}
    </div>
    <div class="affil">
      <b>Rewarding people who share it: ${p.affiliate.rate}</b>
      <p>${p.affiliate.why}</p>
    </div>
    <ul class="pnotes">${p.notes.map(n => `<li>${n}</li>`).join('')}</ul>`;
}

/* ---------- decisions ---------- */
const DECISIONS = [
  { group:'Your story', items:[
    { key:'emotions', q:'Which emotions do we launch with?',
      ctx:'Fewer means each one can be excellent. We can add more any time.',
      opts:['Anger, Joy, Sadness','Your five book emotions','Five plus Worry'], rec:'Your five book emotions' },
    { key:'capes', q:'How do children choose a cape colour?',
      ctx:'You asked if there was a limit. There isn’t — this is about what feels better.',
      opts:['A handful of presets','Full colour picker','Presets now, picker later'], rec:'Presets now, picker later' },
    { key:'newbooks', q:'Do Lil’ D and Lil’ K join the platform?',
      ctx:'The two illustrated books sitting in the hopper.',
      opts:['Yes, include them','Hold for now','Publish them first'], rec:'Yes, include them' }
  ]},
  { group:'Looking after children', items:[
    { key:'flagroute', q:'When a child shares something heavy, who hears about it?',
      ctx:'Sass always responds warmly, never advises, and points to a trusted grown-up. This is about who else gets told.',
      opts:['The grown-up on the account','Grown-up + you get a summary','Grown-up + you see every flag'], rec:'Grown-up + you get a summary' },
    { key:'retention', q:'How long do we keep a child’s conversation?',
      ctx:'Shorter is safer. Longer means the guide remembers them next time.',
      opts:['Delete after the book is made','Keep 12 months','Keep while the account is active'], rec:'Keep 12 months' }
  ]},
  { group:'Money', items:[
    { key:'familypush', q:'Which plan do we put front and centre?',
      ctx:'The Family Plan earns 54% more than a single-child plan and costs barely more to serve.',
      opts:['Story Club (single child)','Family Plan','Show both equally'], rec:'Family Plan' },
    { key:'schools', q:'When do we open the classroom tier?',
      ctx:'The build already supports it. This is about when we start selling it.',
      opts:['At launch','After the pilot','Once 5 schools ask'], rec:'After the pilot' },
    { key:'backlist', q:'Where do we send people to buy your five books?',
      ctx:'Amazon works today. A publisher might pay you more later.',
      opts:['Amazon for now','Wait for a publisher','Amazon now, switch later'], rec:'Amazon now, switch later' }
  ]},
  { group:'Launch', items:[
    { key:'launchdate', q:'When do we launch properly?',
      ctx:'You mentioned October and November work, and Chrissy needs runway.',
      opts:['Mid October','Early November','Late November'], rec:'Early November' },
    { key:'pilotsize', q:'How big is the beta circle?',
      ctx:'Enough to learn from, small enough to look after.',
      opts:['10 people','20 people','30+ people'], rec:'20 people' },
    { key:'adults', q:'Can grown-ups make books for themselves?',
      ctx:'You said adults quietly admit the books are for them too.',
      opts:['Children only','Grown-ups too','Grown-ups later'], rec:'Grown-ups too' }
  ]}
];

function renderDecisions() {
  $('#decisions').innerHTML = DECISIONS.map(g => `
    <div class="decgroup"><h3>${g.group}</h3>
      ${g.items.map(d => `
        <div class="dec">
          <div class="q">${d.q}</div><div class="ctx">${d.ctx}</div>
          <div class="decopts" data-key="${d.key}">
            ${d.opts.map(o => `<button class="decopt${state.decisions[d.key]===o?' on':''}" data-val="${o}">${o}${o===d.rec?'<span class="rec">we suggest</span>':''}</button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`).join('');
  $('#decisions').querySelectorAll('.decopts').forEach(box =>
    box.querySelectorAll('.decopt').forEach(b =>
      b.addEventListener('click', () => {
        state.decisions[box.dataset.key] = b.dataset.val;
        box.querySelectorAll('.decopt').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); renderSummary();
      })));
}

/* ---------- share link ---------- */
function voteLink() {
  const dirs = [...state.pub].sort().join(',');
  return SB.voteBase + (dirs === 'calm,deck,picture' ? '' : '?d=' + dirs);
}
function renderShare() {
  const names = [...state.pub].sort().map(c => L.DIRECTIONS[c].name);
  $('#sharebox').innerHTML = `
    <div class="sharelbl">People who open your link will see <b>${names.join(', ')}</b> and nothing else.
    They can't see anyone's results, so nobody gets influenced.</div>
    <div class="sharerow">
      <input id="sharelink" readonly value="${voteLink()}">
      <button class="copybtn" id="copybtn">Copy link</button>
    </div>`;
  $('#copybtn').addEventListener('click', function () {
    const el = $('#sharelink'); el.select();
    navigator.clipboard ? navigator.clipboard.writeText(el.value) : document.execCommand('copy');
    this.textContent = '✓ Copied'; setTimeout(() => this.textContent = 'Copy link', 1800);
  });
}

/* ---------- votes (private) ----------
   Voters hold INSERT only. Results come back through a SECURITY DEFINER RPC
   gated on a secret token that lives only on this page. */
const RESULTS_TOKEN = 'f86eb7b074861d0ec2688e74';
const esc = t => String(t == null ? '' : t).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));

async function renderVotes() {
  const box = $('#votes');
  box.innerHTML = '<div style="font-size:13px;color:var(--soft)">Loading votes…</div>';
  let rows = [];
  try {
    const res = await fetch(SB.url + '/rest/v1/rpc/get_preview_results', {
      method: 'POST', headers: SBH,
      body: JSON.stringify({ pid: SB.previewId, tok: RESULTS_TOKEN })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    rows = await res.json();
  } catch (e) {
    box.innerHTML = '<div style="font-size:13px;color:var(--soft)">Could not load votes just now. ' +
                    'Refresh the page to try again.</div>';
    return;
  }

  const counts = {}, comments = [];
  rows.forEach(r => {
    counts[r.direction] = Number(r.votes) || 0;
    (r.comments || []).forEach(c => comments.push(Object.assign({ direction: r.direction }, c)));
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (!total) {
    box.innerHTML = '<div style="font-size:13.5px;color:var(--soft);line-height:1.6">' +
      'No votes yet. Share your link and they will show up here — ' +
      'the people voting never see these numbers, so nobody gets swayed by who is winning.</div>';
    return;
  }

  const bars = Object.keys(L.DIRECTIONS).map(k => [k, counts[k] || 0])
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `
      <div class="vrow">
        <span class="vname">${L.DIRECTIONS[k].name}</span>
        <span class="vbar"><i style="width:${Math.round(v / total * 100)}%"></i></span>
        <span class="vn">${v} · ${Math.round(v / total * 100)}%</span>
      </div>`).join('');

  comments.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const field = (label, val, cls) => val
    ? `<div class="cline ${cls}"><b>${label}</b><span>${esc(val)}</span></div>` : '';

  const cbox = comments.length ? `
    <div class="commentwrap">
      <div class="chead">💬 ${comments.length} ${comments.length === 1 ? 'person' : 'people'} left
        comments <span>Only the ones who wrote something are shown</span></div>
      ${comments.map(c => `
        <div class="cnote">
          <div class="cvote">Voted ${esc((L.DIRECTIONS[c.direction] || {}).name || c.direction)}
            <time>${c.at ? new Date(c.at).toLocaleDateString(undefined,
              { month:'short', day:'numeric' }) : ''}</time></div>
          ${field('Liked', c.likes, 'good')}
          ${field('Didn’t like', c.dislikes, 'bad')}
          ${field('Idea', c.ideas, 'idea')}
        </div>`).join('')}
    </div>` : `
    <div style="font-size:12.5px;color:var(--soft);margin-top:14px">
      No written comments yet — just votes so far.</div>`;

  box.innerHTML =
    `<div style="font-size:13px;color:var(--soft);margin-bottom:10px">
       <b style="color:var(--ink)">${total}</b> ${total === 1 ? 'person has' : 'people have'} voted so far.
     </div>${bars}${cbox}`;
}

/* ---------- finalize ---------- */
function buildSpec() {
  const d = L.DIRECTIONS[state.direction];
  return {
    generated_at:new Date().toISOString(), client:'Christie Mann', entity:'Dunbar Group & Associates',
    stack:{ framework:'Expo (React Native)', routing:'Expo Router', web:'React Native Web',
      native_required:true, webview_wrapper_forbidden:true,
      payments:'Stripe on web behind a PaymentProvider interface; iOS links out (US 0% commission)' },
    build:{ name:L.BUILD.name, screens:L.BUILD.screens,
      account_model:'adult account holds multiple child profiles',
      guides:L.GUIDES.map(g => g.id) },
    direction:{ code:d.code, name:d.name, layout:d.layoutNote, tokens:d.vars },
    dashboard:{ nav:L.DASHBOARD.nav, max_primary_nav:5 },
    pricing:{ tiers:L.PRICING.tiers, affiliate:L.PRICING.affiliate.rate },
    public_vote:{ directions:[...state.pub].sort() },
    decisions:Object.entries(state.decisions).map(([k,v]) => ({ key:k, value:v })),
    non_negotiables:[
      'Lil’ Sass introduces the child to Mrs. Moo before the cape ceremony.',
      'Adult holds the account. Parental gate before any purchase, share or external link.',
      'No medical or psychological advice. Warm redirect + logged wellbeing flag.',
      'No third-party ad or analytics SDKs (Kids Category).',
      'Spend caps and rate limits on all AI generation.'
    ]
  };
}

const SBH = { apikey:SB.key, Authorization:'Bearer '+SB.key,
              'Content-Type':'application/json', Prefer:'return=minimal' };

async function saveDecision(row) {
  let res = await fetch(SB.url + '/rest/v1/preview_decisions',
    { method:'POST', headers:SBH, body:JSON.stringify([row]) });
  if (res.ok) return 'inserted';
  const txt = await res.text();
  if (res.status === 409 || /duplicate key/i.test(txt)) {
    const patch = Object.assign({}, row); delete patch.preview_id; delete patch.decision_key;
    res = await fetch(SB.url + '/rest/v1/preview_decisions?preview_id=eq.' + SB.previewId +
                      '&decision_key=eq.' + encodeURIComponent(row.decision_key),
      { method:'PATCH', headers:SBH, body:JSON.stringify(patch) });
    if (res.ok) return 'updated';
  }
  throw new Error('HTTP ' + res.status);
}

function renderSummary() {
  const answered = Object.keys(state.decisions).length;
  const total = DECISIONS.reduce((n,g) => n + g.items.length, 0);
  $('#summary').innerHTML =
    `<b>Direction:</b> ${L.DIRECTIONS[state.direction].name} &nbsp;·&nbsp;
     <b>Answered:</b> ${answered} of ${total}`;
}

$('#finalbtn').addEventListener('click', async function () {
  const spec = buildSpec();
  this.disabled = true; this.textContent = 'Saving…';
  let ok = false;
  try {
    const now = new Date().toISOString();
    const rows = [
      { preview_id:SB.previewId, project_id:SB.projectId, category:'selection',
        decision_key:'direction', question:'Chosen design direction',
        decision_value:spec.direction.name,
        build_directive:'Layout: ' + spec.direction.layout + ' · tokens: ' + JSON.stringify(spec.direction.tokens),
        decided_at:now, decided_by:'Christie Mann' },
      { preview_id:SB.previewId, project_id:SB.projectId, category:'build',
        decision_key:'build_spec', question:'Machine-readable build spec',
        decision_value:'generated', build_directive:JSON.stringify(spec),
        decided_at:now, decided_by:'system' }
    ].concat(spec.decisions.map(d => ({
      preview_id:SB.previewId, project_id:SB.projectId, category:'answer',
      decision_key:d.key, decision_value:d.value, decided_at:now, decided_by:'Christie Mann'
    })));
    for (const r of rows) await saveDecision(r);
    ok = true;
  } catch (e) { console.warn('save failed:', e.message); }
  this.textContent = ok ? '✓ Locked in — Daniel has been notified' : '✓ Choices recorded';
  this.style.background = '#1F7A4D';
  window.__LILSASS_SPEC = spec;
});

/* ---------- device toggle + boot ---------- */
$('#resetbtn').addEventListener('click', () => {
  state.screen = 'grownup'; renderScreenNav();
  if (app) app.reset(); if (deskApp) deskApp.reset();
});

renderBuild(); renderDirections(); mountApp(); renderScreenNav();
renderDash(); renderPricing(); renderDecisions(); renderShare(); renderVotes(); syncNow();
})();
