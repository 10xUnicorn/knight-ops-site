/* =====================================================================
   Lil' Sass — Interactive prototype renderer
   Real state, real navigation, real typing, real page turns.
   createApp(mount, {direction, device, art}) -> control object
   ===================================================================== */
(function (global) {
'use strict';
const L = global.LILSASS;
const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function createApp(mount, opts) {
  const art = opts.art || {};
  const device = opts.device || 'mobile';
  const build = L.BUILD;
  let dir = L.DIRECTIONS[opts.direction] || L.DIRECTIONS.picture;

  // ---- session state -------------------------------------------------
  const S = {
    view: build.screens[0],
    name: 'Amina',
    guide: L.GUIDES[0],
    cape: L.CAPES[0],
    chatStep: 0,
    page: 0,
    child: 0,
    dashTab: 0,
    with: 'Just me'
  };
  const CHILDREN = [
    { name:'Amina', age:8,  colour:'#E8442A', emotion:'Anger',   books:4, cape:'teal'   },
    { name:'Jonah', age:6,  colour:'#5B3FA8', emotion:'Sadness', books:2, cape:'gold'   },
    { name:'Maya',  age:10, colour:'#0FA3A3', emotion:'Grief',   books:6, cape:'purple' }
  ];

  const root = el('div', 'ls-root ls-' + device);
  mount.innerHTML = '';
  mount.appendChild(root);

  function applyDirection() {
    Object.entries(dir.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.setAttribute('data-atmos', dir.atmosphere);
    root.setAttribute('data-layout', dir.code);
  }

  // ---- screen builders ----------------------------------------------
  const V = {};

  V.welcome = () => {
    const v = el('div', 'ls-view');
    v.innerHTML = `
      <div class="ls-art"><img src="${art.cape[S.cape.k] || art.cape.red}" alt="Lil' Sass"></div>
      <div class="ls-h1">Hi! I'm <em>Lil’ Sass</em>.</div>
      <p class="ls-p">Every big feeling deserves a story. Let's make one where <b>you</b> are the hero — right here at the Venice Beach roller rink.</p>
      <div class="ls-bottom">
        <button class="ls-btn" data-go="profiles">Start my adventure &nbsp;→</button>
        <div class="ls-mini">About 5 minutes · Your first book is free</div>
      </div>`;
    return v;
  };

  V.grownup = () => {
    const v = el('div', 'ls-view');
    v.innerHTML = `
      <div class="ls-art"><img src="${art.pose.D}" alt="Lil' Sass"></div>
      <div class="ls-h1">Welcome, <em>grown-up</em>.</div>
      <p class="ls-p">You hold the account. Each child gets their own space, their own cape, and their own story shelf — and you can see how they're doing any time.</p>
      <div class="ls-bottom">
        <button class="ls-btn" data-go="profiles">See our rink &nbsp;→</button>
        <div class="ls-mini">You're the only one who can buy or share</div>
      </div>`;
    return v;
  };

  V.profiles = () => {
    const v = el('div', 'ls-view');
    let cards = CHILDREN.map((c, i) => `
      <button class="ls-kid" data-child="${i}">
        <span class="ls-av" style="background:${c.colour}">${c.name[0]}</span>
        <span class="ls-kidmeta"><b>${c.name}, ${c.age}</b><small>${c.books} adventures · last: ${c.emotion}</small></span>
        <span class="ls-go">›</span>
      </button>`).join('');
    v.innerHTML = `
      <div class="ls-h1" style="margin-top:20px">Who's creating <em>today</em>?</div>
      <p class="ls-p" style="margin-bottom:12px">Tap a child to start their adventure.</p>
      <div class="ls-kids">${cards}</div>
      <button class="ls-add">+ Add a child</button>
      <div class="ls-bottom"><div class="ls-mini">Grown-up: christie@lilsass.com</div></div>`;
    v.querySelectorAll('[data-child]').forEach(b =>
      b.addEventListener('click', () => { S.child = +b.dataset.child; S.name = CHILDREN[S.child].name; go('childHome'); }));
    return v;
  };

  V.childHome = () => {
    const c = CHILDREN[S.child];
    const v = el('div', 'ls-view');
    v.innerHTML = `
      <button class="ls-back" data-go="profiles">‹</button>
      <div class="ls-art" style="margin-top:20px"><img src="${art.cape[c.cape] || art.cape.red}" alt=""></div>
      <div class="ls-h1">Hi <em>${c.name}</em>!</div>
      <div class="ls-streak">🔥 <b>${c.books}</b> adventures · 3 in a row this week</div>
      <div class="ls-badges">
        <span class="ls-badge">💛 Anger</span><span class="ls-badge">💧 Sadness</span>
        <span class="ls-badge">✨ Joy</span><span class="ls-badge locked">🔒 Worry</span>
      </div>
      <p class="ls-p">You have ${c.books} adventures on your shelf. Want to make another one?</p>
      <div class="ls-shelfrow">
        ${[0,1,2].map(i => `<div class="ls-mini-book"><img src="${art.pose[['B','C','D'][i]]}" alt=""></div>`).join('')}
      </div>
      <div class="ls-bottom">
        <button class="ls-btn" data-go="chat">New adventure &nbsp;→</button>
        <button class="ls-btn ls-ghost" data-go="shelf">My shelf</button>
      </div>`;
    return v;
  };

  V.identity = () => {
    const v = el('div', 'ls-view');
    v.innerHTML = `
      <button class="ls-back" data-go="grownup">‹</button>
      <div class="ls-h1" style="margin-top:22px">Tell me about <em>you</em></div>
      <p class="ls-p" style="margin-bottom:10px">So the hero looks and sounds like you.</p>
      <div class="ls-field"><label>My name</label><div class="ls-val">${esc(S.name)}</div></div>
      <div class="ls-field"><label>I am</label><div class="ls-val">8 years old</div></div>
      <div class="ls-field"><label>My hair &amp; skin</label><div class="ls-val">Curly black hair · brown skin</div></div>
      <div class="ls-field"><label>Something I love</label><div class="ls-val">Drawing dragons</div></div>
      <div class="ls-sec">Who's reading with me?</div>
      <div class="ls-chips" id="withchips">
        ${['Just me','A grown-up','My class'].map(x => `<button class="ls-chip${x===S.with?' on':''}">${x}</button>`).join('')}
      </div>
      <div class="ls-bottom"><button class="ls-btn" data-go="guide">Next &nbsp;→</button></div>`;
    v.querySelectorAll('#withchips .ls-chip').forEach(c =>
      c.addEventListener('click', () => {
        v.querySelectorAll('#withchips .ls-chip').forEach(x => x.classList.remove('on'));
        c.classList.add('on'); S.with = c.textContent;
      }));
    return v;
  };

  V.guide = () => {
    const v = el('div', 'ls-view');
    v.innerHTML = `
      <button class="ls-back" data-go="childHome">‹</button>
      <div class="ls-h1" style="margin-top:22px">Who's making it <em>with you</em>?</div>
      <p class="ls-p" style="margin-bottom:10px">Everyone tells a story a little differently.</p>
      <div class="ls-guides">
        ${L.GUIDES.map(g => `
          <button class="ls-guide${g.id===S.guide.id?' on':''}" data-guide="${g.id}">
            <img src="${g.id==='moo'?art.moo:(g.id==='og'?art.crew:art.pose[g.id==='artie'?'C':'B'])}" alt="">
            <span class="ls-gname">${g.name}</span>
            <span class="ls-grole">${g.role}</span>
            <span class="ls-gline">“${g.line}”</span>
          </button>`).join('')}
      </div>
      <div class="ls-bottom"><button class="ls-btn" data-go="chat">Let's go &nbsp;→</button></div>`;
    v.querySelectorAll('[data-guide]').forEach(b =>
      b.addEventListener('click', () => {
        S.guide = L.GUIDES.find(g => g.id === b.dataset.guide);
        v.querySelectorAll('.ls-guide').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      }));
    return v;
  };

  V.chat = () => {
    const v = el('div', 'ls-view ls-chatview');
    const g = S.guide;
    const avatar = g.id==='moo'?art.moo:(g.id==='og'?art.crew:art.pose[g.id==='artie'?'C':'B']);
    v.innerHTML = `
      <button class="ls-back" data-go="guide">‹</button>
      <div class="ls-who" style="margin-top:22px">
        <img src="${avatar}" alt=""><span>${g.name}</span><small>● here with you</small>
      </div>
      <div class="ls-chat" id="chat"></div>
      <div class="ls-chips" id="chatchips"></div>`;
    setTimeout(() => runChat(v, g), 30);
    return v;
  };

  function runChat(v, g) {
    const box = v.querySelector('#chat'), chips = v.querySelector('#chatchips');
    S.chatStep = 0; box.innerHTML = ''; chips.innerHTML = '';
    // Bubbles animate in and the typing dots get removed, so the height keeps
    // changing after append. One rAF is not enough — nudge it a few times.
    const toBottom = () => {
      const hit = () => { box.scrollTop = box.scrollHeight; };
      requestAnimationFrame(() => { requestAnimationFrame(hit); });
      [90, 260, 520].forEach(ms => setTimeout(hit, ms));
    };
    const bubble = (who, html) => {
      const b = el('div', 'ls-bub ls-' + who, html);
      box.appendChild(b); toBottom(); return b;
    };
    const typing = () => {
      const t = el('div', 'ls-bub ls-guide ls-typing', '<i></i><i></i><i></i>');
      box.appendChild(t); toBottom(); return t;
    };
    function showChips(list, goId) {
      chips.innerHTML = '';
      (list || []).forEach(label => {
        const b = el('button', 'ls-chip', label);
        b.addEventListener('click', () => {
          chips.innerHTML = ''; toBottom();
          if (goId) { go(goId); return; }
          advance();
        });
        chips.appendChild(b);
      });
    }
    function advance() {
      const step = L.SCRIPT[S.chatStep];
      if (!step) return;
      if (step.from === 'me') {
        bubble('me', esc(step.t)); S.chatStep++;
        const t = typing();
        setTimeout(() => { t.remove(); advance(); }, 800);
      } else {
        bubble('guide', step.t.replace('{NAME}', esc(S.name))); S.chatStep++;
        showChips(step.chips, step.go); toBottom();
      }
    }
    advance();
  }

  V.mooIntro = () => {
    const v = el('div', 'ls-view');
    v.innerHTML = `
      <button class="ls-back" data-go="chat">‹</button>
      <div class="ls-h1" style="margin-top:22px;text-align:center">Someone you should <em>meet</em></div>
      <div class="ls-mooart"><img src="${art.moo}" alt="Mrs. Moo"></div>
      <div class="ls-bub ls-guide ls-solo">“${esc(S.name)}, this is Mrs. Moo. She's the one who gave me my cape. She's been waiting for you.”</div>
      <div class="ls-cred">— Lil’ Sass</div>
      <div class="ls-bottom"><button class="ls-btn" data-go="cape">Meet Mrs. Moo &nbsp;→</button></div>`;
    return v;
  };

  V.cape = () => {
    const v = el('div', 'ls-view');
    v.innerHTML = `
      <button class="ls-back" data-go="mooIntro">‹</button>
      <div class="ls-h1" style="margin-top:22px;text-align:center">Choose <em>your</em> cape</div>
      <p class="ls-p" style="text-align:center">Mrs. Moo has been waiting for you.</p>
      <div class="ls-capewrap">
        <img id="capeart" class="ls-capeart" src="${art.cape[S.cape.k]}" alt="">
        <img class="ls-moosm" src="${art.moo}" alt="">
      </div>
      <div class="ls-sw">
        ${L.CAPES.map(c => `<button class="ls-swatch${c.k===S.cape.k?' on':''}" data-cape="${c.k}" style="background:${c.hex}" aria-label="${c.label}"></button>`).join('')}
      </div>
      <p class="ls-quote">“This is your cape to feel your feelings.<br>It's your birthright, ${esc(S.name)}.”</p>
      <div class="ls-bottom"><button class="ls-btn" data-go="generating">Wear it &nbsp;✨</button></div>`;
    v.querySelectorAll('[data-cape]').forEach(b =>
      b.addEventListener('click', () => {
        S.cape = L.CAPES.find(c => c.k === b.dataset.cape);
        v.querySelector('#capeart').src = art.cape[S.cape.k];
        v.querySelectorAll('.ls-swatch').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      }));
    return v;
  };

  V.generating = () => {
    const v = el('div', 'ls-view');
    const steps = ['Writing your story','Drawing ' + esc(S.name) + ' into the rink','Adding Mrs. Moo &amp; Mr. OG','Painting all 12 pages','Preparing your print-ready book'];
    v.innerHTML = `
      <div class="ls-gen">
        <div class="ls-ring"></div>
        <div class="ls-h1" style="text-align:center">Writing <em>${esc(S.name)} and The Adventure of Anger</em></div>
        <p class="ls-p" style="text-align:center">Hang tight — Sass is lacing up her skates.</p>
        <div class="ls-genlist">
          ${steps.map((s,i) => `<div class="ls-genrow wait"><span class="ls-dot">${i+1}</span>${s}</div>`).join('')}
        </div>
      </div>`;
    setTimeout(() => {
      const rows = v.querySelectorAll('.ls-genrow'); let i = 0;
      (function tick() {
        if (!v.isConnected) return;
        if (i < rows.length) {
          rows[i].classList.remove('wait');
          rows[i].querySelector('.ls-dot').innerHTML = '✓';
          i++; timers.push(setTimeout(tick, 560));
        } else { S.page = 0; timers.push(setTimeout(() => go('book'), 650)); }
      })();
    }, 200);
    return v;
  };

  V.book = () => {
    const v = el('div', 'ls-view');
    v.innerHTML = `
      <button class="ls-back" data-go="cape">‹</button>
      <div class="ls-page" style="margin-top:22px">
        <img id="bookimg" src="" alt="">
        <p class="ls-txt" id="booktxt"></p>
        <div class="ls-pager">
          <button id="pprev">‹ Back</button>
          <span class="ls-dots" id="pdots"></span>
          <button id="pnext">Next ›</button>
        </div>
      </div>`;
    setTimeout(() => { renderPage(v); }, 10);
    v.addEventListener('click', e => {
      if (e.target.id === 'pprev' && S.page > 0) { S.page--; renderPage(v); }
      if (e.target.id === 'pnext') {
        if (S.page < L.PAGES.length - 1) { S.page++; renderPage(v); }
        else go('delivered');
      }
    });
    return v;
  };

  function renderPage(v) {
    const p = L.PAGES[S.page];
    const imgs = [art.pose.B, art.pose.C, art.pose.B, art.pose.C, art.pose.D, art.pose.D];
    const img = v.querySelector('#bookimg'); if (!img) return;
    img.src = imgs[S.page];
    v.querySelector('#booktxt').innerHTML = p.txt.replace(/{NAME}/g, esc(S.name));
    v.querySelector('#pdots').innerHTML = L.PAGES.map((_, i) => `<i class="${i===S.page?'on':''}"></i>`).join('');
    v.querySelector('#pprev').disabled = S.page === 0;
    v.querySelector('#pnext').textContent = S.page === L.PAGES.length - 1 ? 'Finish ›' : 'Next ›';
  }

  V.delivered = () => {
    const v = el('div', 'ls-view');
    v.innerHTML = `
      <button class="ls-back" data-go="book">‹</button>
      <div class="ls-art" style="margin-top:20px"><img src="${art.pose.D}" alt="" style="width:96px"></div>
      <div class="ls-h1" style="text-align:center;font-size:19px">Your book is <em>yours</em>.</div>
      <p class="ls-p" style="text-align:center;margin-bottom:8px">Sent to grown-up@email.com ✓</p>
      <div class="ls-rcpt"><h4>📚 ${esc(S.name)} and The Adventure of Anger</h4><p>12 pages · print-ready PDF · created today</p></div>
      <div class="ls-rcpt"><h4>✨ Your practice this week</h4><p>When your chest gets hot, name the thing that mattered. Out loud, to someone safe.</p></div>
      <div class="ls-row">
        <button class="ls-btn" data-toast="📦 Print order started — ships in 5–7 days">Order a copy</button>
        <button class="ls-btn ls-ghost" data-toast="🔗 Link copied for Grandma">Share</button>
      </div>
      <div class="ls-mini">A grown-up confirms before anything is bought or shared</div>`;
    return v;
  };

  V.shelf = () => {
    const c = CHILDREN[S.child];
    const v = el('div', 'ls-view');
    v.innerHTML = `
      <button class="ls-back" data-go="childHome">‹</button>
      <div class="ls-h1" style="margin-top:22px">${c.name}'s <em>shelf</em></div>
      <p class="ls-p" style="margin-bottom:10px">Every adventure, kept forever.</p>
      <div class="ls-grid3">
        ${['B','C','D','B','C','D'].map((k,i) => `
          <div class="ls-bookcard"><img src="${art.pose[k]}" alt="">
          <b>${['Anger','Joy','Sadness','Grief','Worry','Brave'][i]}</b></div>`).join('')}
      </div>
      <div class="ls-bottom"><button class="ls-btn" data-go="chat">New adventure &nbsp;→</button></div>`;
    return v;
  };

  // ---- navigation ----------------------------------------------------
  let timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function go(id) {
    if (!V[id]) return;
    clearTimers();
    S.view = id;
    render();
  }

  function render() {
    applyDirection();
    root.innerHTML = '';

    const frame = el('div', 'ls-frame');
    if (device === 'mobile') frame.appendChild(el('div', 'ls-notch'));

    const screen = el('div', 'ls-screen');
    // drifting clouds / stars behind everything
    const sky = el('div', 'ls-sky');
    sky.innerHTML = '<div class="ls-cloud c1"></div><div class="ls-cloud c2"></div>' +
                    '<div class="ls-cloud c3"></div><div class="ls-cloud c4"></div>';
    screen.appendChild(sky);
    const bar = el('div', 'ls-status',
      device === 'mobile'
        ? '<span>9:41</span><span>●●● ⏻</span>'
        : `<span class="ls-url">🔒 lilsass.com/create</span>`);
    screen.appendChild(bar);

    const navItems = [['profiles','👨‍👩‍👧','Our rink'],['childHome','📚','Shelf'],
                      ['guide','💬','Create'],['grownup','⚙️','Grown-up']];

    if (device === 'desktop') {
      /* Genuine desktop app: thin icon rail + top bar + wide canvas.
         Deliberately NOT the phone layout stretched. */
      const shell = el('div', 'ls-shell');

      const rail = el('div', 'ls-rail');
      rail.appendChild(el('img', 'ls-raillogo')).src = art.cape[S.cape.k] || art.cape.red;
      navItems.forEach(([id, ic, label]) => {
        const t = el('button', 'ls-railbtn' + (id === S.view ? ' on' : ''),
                     `<i>${ic}</i><span>${label.split(' ')[0]}</span>`);
        t.title = label;
        t.addEventListener('click', () => go(id));
        rail.appendChild(t);
      });
      const rf = el('div', 'ls-railfoot');
      rf.appendChild(el('div', 'ls-railav', 'C'));
      rail.appendChild(rf);
      shell.appendChild(rail);

      const main = el('div', 'ls-main');
      const TITLES = {
        welcome:'Start a new adventure', identity:'About you', guide:'Choose your guide',
        chat:'Your conversation', mooIntro:'Meet Mrs. Moo', cape:'The cape ceremony',
        generating:'Writing your book', book:'Your book', delivered:'All done',
        grownup:'Grown-up home', profiles:'Our rink', childHome:'Adventures', shelf:'The shelf'
      };
      main.appendChild(el('div', 'ls-topbar',
        `<span class="ls-topttl">${TITLES[S.view] || 'Lil’ Sass'}</span>
         <span class="ls-topcrumb">Lil’ Sass · ${CHILDREN[S.child].name}</span>
         <span class="ls-topspacer">
           <span class="ls-toppill">${CHILDREN[S.child].books} adventures</span>
           <span class="ls-toppill">Story Club</span>
         </span>`));

      const port = el('div', 'ls-port');
      const dv = V[S.view] ? V[S.view]() : el('div', 'ls-view', 'Screen');
      // Hero screens become genuinely two-column on desktop: art in one panel,
      // everything else in the other. Restructure the DOM rather than relying on
      // grid tricks, so nothing overflows the window.
      if (['welcome','grownup','childHome','mooIntro','cape','delivered'].indexOf(S.view) > -1) {
        const artNode = dv.querySelector(':scope > .ls-art, :scope > .ls-capewrap, :scope > .ls-mooart');
        if (artNode) {
          dv.classList.add('ls-split');
          const left = el('div', 'ls-splitart');
          const right = el('div', 'ls-splitbody');
          Array.from(dv.children).forEach(ch => {
            if (ch === artNode) left.appendChild(ch);
            else if (!ch.classList.contains('ls-back')) right.appendChild(ch);
          });
          dv.appendChild(left); dv.appendChild(right);
        }
      }
      port.appendChild(dv);
      main.appendChild(port);
      shell.appendChild(main);
      screen.appendChild(shell);
    } else {
      const port = el('div', 'ls-port');
      port.appendChild(V[S.view] ? V[S.view]() : el('div', 'ls-view', 'Screen'));
      screen.appendChild(port);

      const tb = el('div', 'ls-tabs');
      navItems.forEach(([id, ic, label]) => {
        const t = el('button', 'ls-tab' + (id === S.view ? ' on' : ''), `<i>${ic}</i>${label}`);
        t.addEventListener('click', () => go(id));
        tb.appendChild(t);
      });
      screen.appendChild(tb);
    }

    const toast = el('div', 'ls-toast'); toast.id = 'ls-toast';
    screen.appendChild(toast);

    frame.appendChild(screen);
    root.appendChild(frame);

    // wire generic handlers
    root.querySelectorAll('[data-go]').forEach(b =>
      b.addEventListener('click', () => go(b.dataset.go)));
    root.querySelectorAll('[data-toast]').forEach(b =>
      b.addEventListener('click', () => {
        const t = root.querySelector('#ls-toast');
        t.textContent = b.dataset.toast; t.classList.add('show');
        timers.push(setTimeout(() => t.classList.remove('show'), 2000));
      }));
  }

  render();

  return {
    setDirection(code) { dir = L.DIRECTIONS[code] || dir; render(); },
    goTo(view) { if (V[view]) go(view); },
    reset() { S.view = build.screens[0]; S.chatStep = 0; S.page = 0; S.child = 0; render(); },
    get state() { return S; }
  };
}

/* A 1000px desktop frame squashed into a phone stops looking like a desktop, so we
   render it full size and scale it down. transform:scale() does NOT change layout
   size, so the host's height must be set by hand — and re-set whenever the real
   height changes (images loading, screen swaps, rotation) or the preview collapses.
   NB: every goTo rebuilds the frame, so nothing here may capture a frame reference —
   a stale one leaves the live frame unsized and the whole preview disappears. */
function fitDesktop(host) {
  if (!host) return;
  const DESIGN = 1000;

  const apply = () => {
    const frame = host.querySelector('.ls-desktop');   // always the CURRENT frame
    if (!frame) return false;
    frame.classList.add('ls-scaled');
    const avail = host.clientWidth || (host.parentNode && host.parentNode.clientWidth) || 0;
    if (avail < 40) return false;
    const scale = Math.min(1, avail / DESIGN);
    frame.style.transform = 'scale(' + scale + ')';
    frame.style.marginLeft = Math.max(0, (avail - DESIGN * scale) / 2) + 'px';
    const h = Math.round(frame.offsetHeight * scale);
    if (h > 40) { host.style.height = h + 'px'; return true; }
    return false;
  };

  apply();
  requestAnimationFrame(apply);
  [60, 200, 500, 1000].forEach(ms => setTimeout(apply, ms));

  const frame = host.querySelector('.ls-desktop');
  if (host.__fitRO) host.__fitRO.disconnect();
  if (window.ResizeObserver && frame) {
    host.__fitRO = new ResizeObserver(() => apply());
    host.__fitRO.observe(frame);
    host.__fitRO.observe(host);
  }
  host.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', apply, { once: true });
  });

  /* Bind the window listeners once, but keep the LATEST apply on the element so the
     handler can never call into a closure holding a detached frame. */
  host.__fitApply = apply;
  if (!host.__fitBound) {
    host.__fitBound = true;
    let t;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => { if (host.__fitApply) host.__fitApply(); }, 120);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }
}

global.LILSASS_APP = { createApp, fitDesktop };
})(window);
