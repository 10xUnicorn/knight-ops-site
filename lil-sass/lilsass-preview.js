/* Private preview page controller — pickers, prototype, dashboards, pricing,
   decisions, vote results, finalize. */
(function () {
'use strict';
const L = window.LILSASS, ART = window.LILSASS_ART;
const $ = s => document.querySelector(s);
const state = {
  structure:'A', style:'1', device:'mobile', dashboard:'A', decisions:{},
  // which options Christie wants the public to vote on
  pubStruct: new Set(['A','B','C']),
  pubStyle:  new Set(['1','2','3'])
};
let app = null;

function shareToggle(kind, code, on) {
  return `<span class="shr${on?' on':''}" data-share="${kind}:${code}" role="checkbox" aria-checked="${on}">
    <i></i>${on ? 'Voters see this' : 'Hidden from voters'}</span>`;
}
function wireShare(scope) {
  scope.querySelectorAll('[data-share]').forEach(t =>
    t.addEventListener('click', e => {
      e.stopPropagation();
      const [kind, code] = t.dataset.share.split(':');
      const set = kind === 'structure' ? state.pubStruct : state.pubStyle;
      if (set.has(code)) { if (set.size > 1) set.delete(code); } else { set.add(code); }
      kind === 'structure' ? buildStructures() : buildStyles();
      renderPublicSummary();
    }));
}

/* ---------- pickers ---------- */
function buildStructures() {
  $('#structpick').innerHTML = Object.values(L.STRUCTURES).map(s => `
    <button class="opt${s.code===state.structure?' on':''}" data-struct="${s.code}">
      <div class="code">Structure ${s.code}</div>
      <h3>${s.name}</h3>
      <div class="tag">${s.tagline}</div>
      <p>${s.blurb}</p>
      <div class="best">✅ ${s.bestFor}</div>
      <div class="trade">Trade-off: ${s.tradeoff}</div>
      <span class="phase">${s.phase}</span>
      ${shareToggle('structure', s.code, state.pubStruct.has(s.code))}
    </button>`).join('');
  $('#structpick').querySelectorAll('[data-struct]').forEach(b =>
    b.addEventListener('click', () => {
      state.structure = b.dataset.struct;
      state.dashboard = b.dataset.struct;
      buildStructures(); buildDash(); mountApp(); syncNow();
    }));
  wireShare($('#structpick'));
}

function buildStyles() {
  $('#stylepick').innerHTML = Object.values(L.STYLES).map(s => `
    <button class="opt${s.code===state.style?' on':''}" data-style="${s.code}">
      <div class="sw">${s.swatch.map(c => `<i style="background:${c}"></i>`).join('')}</div>
      <div class="code">Style ${s.code}</div>
      <h3>${s.name}</h3>
      <div class="tag">${s.tagline}</div>
      <p>${s.blurb}</p>
      <div class="best">✅ ${s.bestFor}</div>
      ${shareToggle('style', s.code, state.pubStyle.has(s.code))}
    </button>`).join('');
  $('#stylepick').querySelectorAll('[data-style]').forEach(b =>
    b.addEventListener('click', () => {
      state.style = b.dataset.style;
      buildStyles();
      if (app) app.setStyle(state.style);
      renderDash();   // dashboard wears the same style
      syncNow();
    }));
  wireShare($('#stylepick'));
}

function renderPublicSummary() {
  const box = $('#publicsummary'); if (!box) return;
  const st = [...state.pubStruct].sort().map(c => L.STRUCTURES[c].name);
  const sy = [...state.pubStyle].sort().map(c => L.STYLES[c].name);
  box.innerHTML =
    `<b>${st.length} structure${st.length>1?'s':''}</b> — ${st.join(', ')}<br>
     <b>${sy.length} style${sy.length>1?'s':''}</b> — ${sy.join(', ')}<br>
     <span style="color:var(--soft)">Your dashboard is never shown publicly. Voters can't see results either.</span>`;
}

function mountApp() {
  app = window.LILSASS_APP.createApp($('#devicestage'), {
    structure: state.structure, style: state.style, device: state.device, art: ART
  });
}

function syncNow() {
  $('#nowshow').innerHTML =
    `Showing <b>${L.STRUCTURES[state.structure].name}</b> in <b>${L.STYLES[state.style].name}</b>`;
  renderSummary();
}

/* ---------- dashboards ---------- */
function buildDash() {
  $('#dashpick').innerHTML = Object.values(L.DASHBOARDS).map(d => `
    <button class="opt${d.code===state.dashboard?' on':''}" data-dash="${d.code}">
      <div class="code">Dashboard ${d.code}</div>
      <h3>${d.name}</h3>
      <div class="tag">${d.tagline}</div>
      <p>${d.blurb}</p>
    </button>`).join('');
  $('#dashpick').querySelectorAll('[data-dash]').forEach(b =>
    b.addEventListener('click', () => { state.dashboard = b.dataset.dash; buildDash(); renderDash(); renderSummary(); }));
  renderDash();
}

const PANELS = {
  recent: `<div class="panel"><h5>Newest adventures</h5>
    <div class="prow"><span class="pav" style="background:#E8442A">A</span>Amina, 8 · Anger · teal cape<span class="ptag">Today</span></div>
    <div class="prow"><span class="pav" style="background:#5B3FA8">J</span>Jonah, 6 · Sadness · gold cape<span class="ptag">Today</span></div>
    <div class="prow"><span class="pav" style="background:#0FA3A3">M</span>Maya, 10 · Grief · purple cape<span class="ptag">Yesterday</span></div>
  </div>`,
  flags: `<div class="panel"><h5>Wellbeing check-ins <span style="color:#FFB55C">●</span></h5>
    <div class="prow"><span class="pav" style="background:#FFB55C">!</span>A grown-up was notified · story paused gently<span class="pwarn">Review</span></div>
    <div class="prow" style="color:#8C97B8;font-size:11.5px">Sass never gives advice. She listens, then points to a trusted grown-up.</div>
  </div>`,
  affiliate: `<div class="panel"><h5>Affiliate partners</h5>
    <div class="prow">Top partner · 41 referrals<span class="ptag">$312 earned</span></div>
    <div class="prow">12 active partners this month<span class="ptag">30% lifetime</span></div>
  </div>`,
  guides: `<div class="panel"><h5>Which guide keeps children coming back</h5>
    <div class="prow" style="display:block">Lil’ Sass · 48% chosen · 71% return<div class="bar2"><i style="width:71%"></i></div></div>
    <div class="prow" style="display:block">Lil’ Artie · 24% chosen · 78% return<div class="bar2"><i style="width:78%"></i></div></div>
    <div class="prow" style="display:block">Mr. OG · 18% chosen · 64% return<div class="bar2"><i style="width:64%"></i></div></div>
    <div class="prow" style="display:block">Mrs. Moo · 10% chosen · 59% return<div class="bar2"><i style="width:59%"></i></div></div>
  </div>`,
  emotions: `<div class="panel"><h5>Emotions children are bringing</h5>
    <div class="prow" style="display:block">Anger · 34%<div class="bar2"><i style="width:34%"></i></div></div>
    <div class="prow" style="display:block">Sadness · 26%<div class="bar2"><i style="width:26%"></i></div></div>
    <div class="prow" style="display:block">Worry · 21%<div class="bar2"><i style="width:21%"></i></div></div>
    <div class="prow" style="display:block">Grief · 12%<div class="bar2"><i style="width:12%"></i></div></div>
    <div class="prow" style="color:#8C97B8;font-size:11.5px">Worry is climbing. A “Worry” book would land right now.</div>
  </div>`,
  signals: `<div class="panel"><h5>Worth a conversation</h5>
    <div class="prow"><span class="pav" style="background:#4ED18A">3</span>Grown-ups who made 5+ books — warm for a workshop<span class="ptag">Ascension</span></div>
    <div class="prow"><span class="pav" style="background:#4ED18A">2</span>Teachers using a family account — classroom tier fit<span class="ptag">Upsell</span></div>
  </div>`,
  classrooms: `<div class="panel"><h5>Classrooms</h5>
    <div class="prow"><span class="pav" style="background:#0FA3A3">R</span>Ms. Rivera · Grade 3 · 28 seats<span class="ptag">Active</span></div>
    <div class="prow"><span class="pav" style="background:#5B3FA8">T</span>Mr. Tan · Counselling · 15 seats<span class="pwarn">Renews in 21d</span></div>
  </div>`,
  seats: `<div class="panel"><h5>Seat usage</h5>
    <div class="prow" style="display:block">418 of 480 seats in use<div class="bar2"><i style="width:87%"></i></div></div>
    <div class="prow" style="color:#8C97B8;font-size:11.5px">Two schools are near capacity. Good moment to offer an upgrade.</div>
  </div>`
};

const NAVICON = { Overview:'📊', Readers:'👧', Books:'📚', Settings:'⚙️', Guides:'✨',
  Emotions:'💛', Classrooms:'🏫', Families:'👨‍👩‍👧', Seats:'🎟️' };

function renderDash() {
  const d = L.DASHBOARDS[state.dashboard];
  const v = L.STYLES[state.style].vars;
  // Christie's dashboard wears HER brand, and follows whichever style is selected.
  const theme = {
    '--d-screen': v['--screen'], '--d-card': v['--card'], '--d-ink': v['--ink'],
    '--d-soft': v['--ink-soft'], '--d-line': v['--line'], '--d-chip': v['--chip'],
    '--d-accent': v['--accent'], '--d-support': v['--support'], '--d-onaccent': v['--onaccent']
  };
  const styleAttr = Object.entries(theme).map(([k, val]) => `${k}:${val}`).join(';');

  $('#dashstage').innerHTML = `
    <div class="dashwrap">
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
            ${d.nav.map((n,i) => `<button class="${i===0?'on':''}"><i style="font-style:normal">${NAVICON[n]||'•'}</i>${n}</button>`).join('')}
          </div>
          <div class="dashmain">
            <h4>Hi Christie 💖</h4>
            <div class="dsub">${d.blurb}</div>
            <div class="kpis">
              ${d.kpis.map(k => `<div class="kpi"><div class="n">${k.n}</div><div class="l">${k.l}</div>${k.d?`<div class="d">${k.d}</div>`:''}</div>`).join('')}
            </div>
            ${d.panels.map(p => PANELS[p] || '').join('')}
          </div>
        </div>
      </div>
      <div class="dashnote">Your dashboard follows whichever style you pick above, so it always feels like
      Lil’ Sass rather than a generic admin panel. Only ${d.nav.length} things in the sidebar — everything
      else lives inside those pages so it never gets overwhelming.</div>
    </div>`;
  $('#dashstage').querySelectorAll('.dashnav button').forEach(b =>
    b.addEventListener('click', () => {
      $('#dashstage').querySelectorAll('.dashnav button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    }));
}

/* ---------- pricing ---------- */
function renderPricing() {
  $('#models').innerHTML = L.PRICING.models.map(m => `
    <div class="model${m.id===L.PRICING.recommended?' rec':''}">
      ${m.badge ? `<span class="badge${m.id===L.PRICING.recommended?'':' alt'}">${m.badge}</span>` : ''}
      <h3>${m.name}</h3>
      <div class="pitch">${m.pitch}</div>
      <div class="why">${m.why}</div>
      ${m.tiers.map(t => `
        <div class="tier">
          <span><span class="tn">${t.name}</span><span class="td">${t.detail}</span></span>
          <span class="tp">${t.price === 0 ? 'Free' : '$' + t.price}<small style="font-weight:700;color:var(--soft)">${t.unit==='once'||t.unit==='free'?'':t.unit}</small>
            <span class="tm">${t.margin}</span></span>
        </div>`).join('')}
      <div class="note">${m.note}</div>
    </div>`).join('');
}

/* ---------- decisions ---------- */
const DECISIONS = [
  { group:'Your story', items:[
    { key:'guides', q:'Which characters can a child create with?',
      ctx:'You suggested opening it up so boys have a buddy too. Lil’ Artie was your idea on the call.',
      opts:['Lil’ Sass only','Sass + Artie','All four (Sass, Artie, Moo, OG)'], rec:'All four (Sass, Artie, Moo, OG)' },
    { key:'emotions', q:'Which emotions do we launch with?',
      ctx:'Fewer means we can make each one excellent. We can add more any time.',
      opts:['Just Anger, Joy, Sadness','Your five book emotions','Five plus Worry'], rec:'Your five book emotions' },
    { key:'capes', q:'How do children choose a cape colour?',
      ctx:'You asked if there was a limit. There isn’t — this is about what feels better.',
      opts:['A handful of preset colours','Full colour picker','Presets now, picker later'], rec:'Presets now, picker later' },
    { key:'newbooks', q:'Do Lil’ D and Lil’ K join the platform?',
      ctx:'The two illustrated books sitting in the hopper.',
      opts:['Yes, include them','Hold for now','Publish them first'], rec:'Yes, include them' }
  ]},
  { group:'Looking after children', items:[
    { key:'flagroute', q:'When a child shares something heavy, who hears about it?',
      ctx:'Sass will always respond warmly, never advise, and point them to a trusted grown-up. This is about who else gets told.',
      opts:['The grown-up on the account','Grown-up + you get a summary','Grown-up + you see every flag'], rec:'Grown-up + you get a summary' },
    { key:'retention', q:'How long do we keep a child’s conversation?',
      ctx:'Shorter is safer and simpler. Longer means Sass remembers them next time.',
      opts:['Delete after the book is made','Keep 12 months','Keep while the account is active'], rec:'Keep 12 months' }
  ]},
  { group:'Money', items:[
    { key:'pricingmodel', q:'Which pricing model do we launch with?',
      ctx:'Our recommendation is the ladder. It earns the most and is the fastest to turn on.',
      opts:['Story Club Ladder','Adventure Packs','Free book, then choose'], rec:'Story Club Ladder' },
    { key:'affiliate', q:'How do we reward people who share it?',
      ctx:'You liked lifetime on the call. Lifetime attracts better partners; first-year protects margin.',
      opts:['30% first year','30% lifetime','40% first year'], rec:'30% lifetime' },
    { key:'backlist', q:'Where do we send people to buy your five books?',
      ctx:'Amazon works today. A publisher relationship might pay you more later.',
      opts:['Amazon for now','Wait for a publisher','Amazon now, switch later'], rec:'Amazon now, switch later' },
    { key:'schools', q:'When do we open the classroom tier?',
      ctx:'It is the highest revenue per relationship but it needs the family structure first.',
      opts:['Phase 1','Phase 2','Once 5 schools ask'], rec:'Phase 2' }
  ]},
  { group:'Launch', items:[
    { key:'launchdate', q:'When do we launch properly?',
      ctx:'You mentioned October and November is good for you, and Chrissy needs runway.',
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
    <div class="decgroup">
      <h3>${g.group}</h3>
      ${g.items.map(d => `
        <div class="dec">
          <div class="q">${d.q}</div>
          <div class="ctx">${d.ctx}</div>
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
        b.classList.add('on');
        renderSummary();
      })));
}

/* ---------- votes (private to Christie) ---------- */
const DEMO_VOTES = {
  structure: { A: 4, B: 11, C: 6 },
  style:     { '1': 7, '2': 5, '3': 9 },
  device:    { desktop: 12, mobile: 5, both: 4 }
};
function renderVotes() {
  const sec = (title, obj, labelFn) => {
    const total = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
    return `<h5 style="font-size:13px;margin:14px 0 4px;color:var(--plum-deep)">${title}</h5>` +
      Object.entries(obj).sort((a,b) => b[1]-a[1]).map(([k, v]) => `
        <div class="vrow">
          <span class="vname">${labelFn(k)}</span>
          <span class="vbar"><i style="width:${Math.round(v/total*100)}%"></i></span>
          <span class="vn">${v} · ${Math.round(v/total*100)}%</span>
        </div>`).join('');
  };
  $('#votes').innerHTML =
    `<div style="font-size:13px;color:var(--soft);margin-bottom:4px">21 people voted so far.</div>` +
    sec('Structure', DEMO_VOTES.structure, k => `${k} · ${L.STRUCTURES[k].name}`) +
    sec('Style', DEMO_VOTES.style, k => `${k} · ${L.STYLES[k].name}`) +
    sec('Where they’d use it', DEMO_VOTES.device, k => ({desktop:'On a computer',mobile:'On a phone',both:'Both'}[k])) +
    `<div style="margin-top:14px;font-size:12.5px;line-height:1.6;color:var(--plum-deep);background:#F4F0FE;border-radius:12px;padding:11px 13px;font-weight:700">
      Most people said they'd create on a computer — which matches your own instinct on our call. That's a good
      reason to make the web experience the main one and let the phone app follow.</div>`;
}

/* ---------- summary + finalize ---------- */
function renderSummary() {
  const answered = Object.keys(state.decisions).length;
  const total = DECISIONS.reduce((n, g) => n + g.items.length, 0);
  $('#summary').innerHTML =
    `<b>Structure:</b> ${L.STRUCTURES[state.structure].name} &nbsp;·&nbsp;
     <b>Style:</b> ${L.STYLES[state.style].name} &nbsp;·&nbsp;
     <b>Dashboard:</b> ${L.DASHBOARDS[state.dashboard].name}<br>
     <b>Decisions answered:</b> ${answered} of ${total}`;
}

/* ---------- finalize -> Supabase ---------- */
const SB = {
  url: 'https://trpnlkntvulkjerevngm.supabase.co',
  key: 'sb_publishable_oZuxXtZg07RhUiqpsKLm9Q_XZD8L8XK',
  previewId: 'f124bace-0970-42fb-ade6-d8132955bc86',
  projectId: 'ea3bd6ab-9d70-4a78-8ced-0ffabcd516d9'
};

/* Turns her answers into concrete instructions the build system follows.
   Everything assumes the locked stack: Expo / React Native (native, never a
   WebView wrapper) with React Native Web for the browser build. */
const DIRECTIVES = {
  guides: {
    'Lil’ Sass only': 'Single guide. Skip the guide-select screen entirely.',
    'Sass + Artie': 'Two guides. Guide-select screen with 2 cards; route tone by selection.',
    'All four (Sass, Artie, Moo, OG)': 'Four guides with distinct prompt personas. Guide-select screen required. Lil’ Sass ALWAYS performs the Mrs. Moo introduction regardless of chosen guide.'
  },
  capes: {
    'A handful of preset colours': 'Ship 5 preset cape colours as pre-rendered art variants. No runtime recolour.',
    'Full colour picker': 'Runtime HSV recolour pipeline on the cape mask. Higher cost, needs QA against skin tones.',
    'Presets now, picker later': 'Phase 1: 5 pre-rendered presets. Leave the cape colour as a config value so a picker can be added without touching the story engine.'
  },
  pricingmodel: {
    'Story Club Ladder': 'Stripe Billing: 3 recurring prices (12.99 / 17.99 / 24.99) + annual 99. First book free, gate book #2. Entitlement check behind PaymentProvider interface.',
    'Adventure Packs': 'Stripe one-time prices for 1/3/10 credits. Credit ledger table. No recurring billing at launch.',
    'Free book, then choose': 'Both Stripe recurring and one-time packs, presented on one paywall screen. Requires A/B instrumentation from day one.'
  },
  affiliate: {
    '30% first year': 'Referral attribution with a 12-month commission window. Excludes physical/print revenue.',
    '30% lifetime': 'Referral attribution with unbounded commission on subscription revenue only. Excludes print. Needs clawback on refund.',
    '40% first year': 'As first-year, rate 0.40. Model margin impact before enabling.'
  },
  flagroute: {
    'The grown-up on the account': 'Wellbeing flag notifies account holder only. Store flag row, no creator visibility.',
    'Grown-up + you get a summary': 'Notify account holder immediately. Weekly aggregated, de-identified summary to the creator dashboard. Never expose raw child text.',
    'Grown-up + you see every flag': 'Notify account holder and surface each flag in the creator dashboard. Requires an explicit privacy disclosure in the parent consent copy.'
  },
  retention: {
    'Delete after the book is made': 'Purge conversation transcript on book delivery. Keep only derived story metadata.',
    'Keep 12 months': 'Retain transcripts 12 months then auto-purge via scheduled job. Document in privacy policy.',
    'Keep while the account is active': 'Retain until account deletion. Requires clear parent-facing disclosure and a delete-my-data flow.'
  },
  schools: {
    'Phase 1': 'Build seat/licence model, classroom rosters and educator role in Phase 1. Adds material scope.',
    'Phase 2': 'Design the data model to allow an account to own multiple child profiles, but do not build classroom UI until Phase 2.',
    'Once 5 schools ask': 'Manual/concierge onboarding first. No classroom UI until demand is proven.'
  },
  adults: {
    'Children only': 'Age gate limits profiles to under-13 flow.',
    'Grown-ups too': 'Allow an adult profile with adult-voiced story templates. Same guardrails, different tone. No separate app.',
    'Grown-ups later': 'Ship children-only; keep profile.type column so adult mode is a later toggle.'
  }
};

function buildSpec() {
  const s = L.STRUCTURES[state.structure], y = L.STYLES[state.style], d = L.DASHBOARDS[state.dashboard];
  return {
    generated_at: new Date().toISOString(),
    client: 'Christie Mann', entity: 'Dunbar Group & Associates',
    stack: {
      framework: 'Expo (React Native)', routing: 'Expo Router', web: 'React Native Web',
      native_required: true, webview_wrapper_forbidden: true,
      rationale: 'Apple rejects WebView shells under Guideline 4.2 — fatal for a first Kids Category submission.',
      data: 'Supabase JS', payments: 'Stripe (web) behind a PaymentProvider interface; iOS uses US external-link checkout at 0% commission'
    },
    structure: { code: s.code, name: s.name, screens: s.screens },
    style: { code: y.code, name: y.name, tokens: y.vars },
    dashboard: { code: d.code, name: d.name, nav: d.nav },
    public_vote: {
      structures: [...state.pubStruct].sort(),
      styles: [...state.pubStyle].sort()
    },
    decisions: Object.entries(state.decisions).map(([k, v]) => ({
      key: k, value: v,
      directive: (DIRECTIVES[k] && DIRECTIVES[k][v]) || null
    })),
    non_negotiables: [
      'Lil’ Sass introduces the child to Mrs. Moo before the cape ceremony — she is the through-line in every story.',
      'Adult holds the account. Parental gate before any purchase, share or external link.',
      'No medical or psychological advice, ever. Warm redirect to a trusted grown-up + logged wellbeing flag.',
      'No third-party ad or analytics SDKs in the app (Kids Category).',
      'Spend caps and rate limits on all AI generation from day one.'
    ]
  };
}

/* Anon has INSERT/UPDATE but no SELECT here, so PostgREST upserts
   (resolution=merge-duplicates) fail — they need to read the conflicting row.
   Insert each row, and PATCH it on a duplicate-key conflict instead. */
const SBH = {
  apikey: SB.key, Authorization: 'Bearer ' + SB.key,
  'Content-Type': 'application/json', Prefer: 'return=minimal'
};

async function saveDecision(row) {
  let res = await fetch(SB.url + '/rest/v1/preview_decisions', {
    method: 'POST', headers: SBH, body: JSON.stringify([row])
  });
  if (res.ok) return 'inserted';
  const txt = await res.text();
  if (res.status === 409 || /duplicate key/i.test(txt)) {
    const patch = Object.assign({}, row);
    delete patch.preview_id; delete patch.decision_key;
    res = await fetch(SB.url + '/rest/v1/preview_decisions?preview_id=eq.' + SB.previewId +
                      '&decision_key=eq.' + encodeURIComponent(row.decision_key), {
      method: 'PATCH', headers: SBH, body: JSON.stringify(patch)
    });
    if (res.ok) return 'updated';
  }
  throw new Error('HTTP ' + res.status + ' ' + txt.slice(0, 110));
}

$('#finalbtn').addEventListener('click', async function () {
  const spec = buildSpec();
  this.disabled = true; this.textContent = 'Saving…';
  let saved = false;
  try {
    const rows = [
      { preview_id: SB.previewId, project_id: SB.projectId, category: 'selection',
        decision_key: 'structure', question: 'Chosen app structure',
        decision_value: spec.structure.name,
        build_directive: 'Build screens: ' + spec.structure.screens.join(' → '),
        decided_at: new Date().toISOString(), decided_by: 'Christie Mann' },
      { preview_id: SB.previewId, project_id: SB.projectId, category: 'selection',
        decision_key: 'style', question: 'Chosen visual style',
        decision_value: spec.style.name,
        build_directive: 'Apply theme tokens: ' + JSON.stringify(spec.style.tokens),
        decided_at: new Date().toISOString(), decided_by: 'Christie Mann' },
      { preview_id: SB.previewId, project_id: SB.projectId, category: 'selection',
        decision_key: 'dashboard', question: 'Chosen creator dashboard',
        decision_value: spec.dashboard.name,
        build_directive: 'Dashboard nav (max 7 primary): ' + spec.dashboard.nav.join(', '),
        decided_at: new Date().toISOString(), decided_by: 'Christie Mann' },
      { preview_id: SB.previewId, project_id: SB.projectId, category: 'build',
        decision_key: 'build_spec', question: 'Machine-readable build spec',
        decision_value: 'generated',
        build_directive: JSON.stringify(spec),
        decided_at: new Date().toISOString(), decided_by: 'system' }
    ].concat(spec.decisions.map(d => ({
      preview_id: SB.previewId, project_id: SB.projectId, category: 'answer',
      decision_key: d.key, decision_value: d.value, build_directive: d.directive,
      decided_at: new Date().toISOString(), decided_by: 'Christie Mann'
    })));
    for (const r of rows) await saveDecision(r);
    saved = true;
  } catch (e) { console.warn('decision save failed:', e.message); }

  this.textContent = saved ? '✓ Locked in — Daniel has been notified'
                           : '✓ Choices recorded (Daniel will confirm)';
  this.style.background = '#1F7A4D';
  window.__LILSASS_SPEC = spec;
  renderSummary();
});

$('#resetbtn').addEventListener('click', () => app && app.reset());
document.querySelectorAll('#devseg button').forEach(b =>
  b.addEventListener('click', () => {
    document.querySelectorAll('#devseg button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); state.device = b.dataset.dev; mountApp();
  }));

/* boot */
buildStructures(); buildStyles(); mountApp(); buildDash();
renderPricing(); renderDecisions(); renderVotes(); syncNow(); renderPublicSummary();
})();
