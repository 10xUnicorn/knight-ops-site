/**
 * Knight Ops Recorder — on-page overlay (content script)
 * Countdown, floating control bar, draggable camera bubble, draw-on-screen,
 * and the screenshot area selector. Everything lives in a shadow root so the
 * page's stylesheet can't break it and we can't break the page.
 */
(() => {
  if (window.__koOverlayLoaded) return;
  window.__koOverlayLoaded = true;

  const HOST_ID = 'ko-recorder-host';
  let host, root, bar, timerEl, camWrap, camStream, drawCanvas, drawing = false;
  let startedAt = 0, tick = null, paused = false;

  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
  .wrap{position:fixed;inset:0;pointer-events:none}

  .bar{position:fixed;left:20px;bottom:20px;display:flex;align-items:center;gap:4px;
    background:rgba(5,6,26,.94);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.13);
    border-radius:13px;padding:7px 8px;box-shadow:0 12px 40px rgba(0,0,0,.5);pointer-events:auto;
    animation:rise .25s cubic-bezier(.2,.9,.3,1)}
  @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  .dot{width:9px;height:9px;border-radius:50%;background:#e5484d;margin:0 5px 0 6px;
    animation:blink 1.4s infinite;flex:0 0 9px}
  .dot.paused{background:#C9922A;animation:none}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
  .time{color:#fff;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;
    letter-spacing:.4px;min-width:46px;margin-right:6px}
  .btn{background:rgba(255,255,255,.08);border:none;border-radius:8px;width:32px;height:32px;
    cursor:pointer;display:grid;place-items:center;color:#e9e9f2;transition:.13s;padding:0}
  .btn:hover{background:rgba(255,255,255,.17)}
  .btn.on{background:rgba(0,212,200,.24);color:#00D4C8}
  .btn.stop{background:#C9922A;color:#05061a;width:auto;padding:0 13px;font-size:12.5px;font-weight:700}
  .btn.stop:hover{filter:brightness(1.1)}
  .btn.kill:hover{background:rgba(229,72,77,.3);color:#ff9b9e}
  .btn svg{width:15px;height:15px}
  .sep{width:1px;height:20px;background:rgba(255,255,255,.13);margin:0 3px}

  .cam{position:fixed;left:20px;bottom:78px;width:150px;height:150px;border-radius:50%;
    overflow:hidden;border:3px solid #C9922A;box-shadow:0 10px 34px rgba(0,0,0,.55);
    pointer-events:auto;cursor:grab;background:#05061a}
  .cam.dragging{cursor:grabbing}
  .cam video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}

  .count{position:fixed;inset:0;display:grid;place-items:center;background:rgba(5,6,26,.82);
    backdrop-filter:blur(6px);pointer-events:auto}
  .count b{font-size:132px;color:#C9922A;font-weight:800;line-height:1;
    animation:pop .95s cubic-bezier(.2,.9,.3,1);text-shadow:0 0 60px rgba(201,146,42,.45)}
  @keyframes pop{0%{transform:scale(.5);opacity:0}35%{transform:scale(1.06);opacity:1}100%{transform:scale(1);opacity:1}}
  .count small{display:block;text-align:center;color:#8a8aa4;font-size:14px;margin-top:18px;letter-spacing:1px}

  .draw{position:fixed;inset:0;pointer-events:auto;cursor:crosshair}

  .sel{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;background:rgba(5,6,26,.42)}
  .selbox{position:fixed;border:2px solid #00D4C8;background:rgba(0,212,200,.1);
    box-shadow:0 0 0 9999px rgba(5,6,26,.42);pointer-events:none}
  .selhint{position:fixed;top:22px;left:50%;transform:translateX(-50%);background:rgba(5,6,26,.94);
    color:#e9e9f2;padding:9px 17px;border-radius:9px;font-size:13px;border:1px solid rgba(255,255,255,.14);
    pointer-events:none;letter-spacing:.2px}

  .toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(5,6,26,.95);
    color:#e9e9f2;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px 18px;
    font-size:13px;pointer-events:none;animation:rise .2s}
  `;

  const ICON = {
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.4" height="14" rx="1"/><rect x="13.6" y="5" width="3.4" height="14" rx="1"/></svg>',
    play:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg>',
    pen:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 19l7-7-4-4-7 7-1 5z"/><path d="M16 6l2-2 4 4-2 2"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  };

  // ── mount ───────────────────────────────────────────────
  function mount() {
    if (document.getElementById(HOST_ID)) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    root.appendChild(wrap);
    document.documentElement.appendChild(host);
    return wrap;
  }

  function unmount() {
    stopCamera();
    if (tick) { clearInterval(tick); tick = null; }
    document.getElementById(HOST_ID)?.remove();
    window.__koOverlayLoaded = false;
  }

  const wrap = () => root.querySelector('.wrap');

  function toast(text, ms = 2200) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    wrap().appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ── countdown ───────────────────────────────────────────
  function countdown(from = 3) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'count';
      el.innerHTML = `<div><b>${from}</b><small>GET READY</small></div>`;
      wrap().appendChild(el);
      let n = from;
      const iv = setInterval(() => {
        n--;
        if (n <= 0) { clearInterval(iv); el.remove(); resolve(); return; }
        const b = el.querySelector('b');
        b.textContent = n;
        b.style.animation = 'none';
        void b.offsetWidth;
        b.style.animation = '';
      }, 1000);
    });
  }

  // ── control bar ─────────────────────────────────────────
  function buildBar() {
    bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML = `
      <span class="dot"></span>
      <span class="time">0:00</span>
      <button class="btn" data-a="pause" title="Pause (Alt+Shift+P)">${ICON.pause}</button>
      <button class="btn" data-a="draw" title="Draw on screen">${ICON.pen}</button>
      <span class="sep"></span>
      <button class="btn stop" data-a="stop" title="Stop and share (Alt+Shift+R)">Stop</button>
      <button class="btn kill" data-a="cancel" title="Discard">${ICON.trash}</button>`;
    wrap().appendChild(bar);
    timerEl = bar.querySelector('.time');

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-a]');
      if (!btn) return;
      const a = btn.dataset.a;
      if (a === 'pause') {
        chrome.runtime.sendMessage({ type: paused ? 'ko-resume' : 'ko-pause' });
      } else if (a === 'stop') {
        chrome.runtime.sendMessage({ type: 'ko-stop' });
        bar.querySelector('.btn.stop').textContent = 'Saving…';
      } else if (a === 'cancel') {
        if (confirm('Discard this recording?')) chrome.runtime.sendMessage({ type: 'ko-cancel' });
      } else if (a === 'draw') {
        toggleDraw(btn);
      }
    });

    startedAt = Date.now();
    tick = setInterval(() => {
      if (paused) return;
      const s = Math.floor((Date.now() - startedAt) / 1000);
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      timerEl.textContent = h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
                              : `${m}:${String(sec).padStart(2, '0')}`;
    }, 500);
  }

  // ── camera bubble ───────────────────────────────────────
  async function startCamera() {
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'user' }, audio: false,
      });
    } catch (_) { toast('Camera unavailable — recording without it'); return; }

    camWrap = document.createElement('div');
    camWrap.className = 'cam';
    const v = document.createElement('video');
    v.autoplay = true; v.muted = true; v.playsInline = true;
    v.srcObject = camStream;
    camWrap.appendChild(v);
    wrap().appendChild(camWrap);

    // drag to reposition
    let dx = 0, dy = 0, dragging = false;
    camWrap.addEventListener('pointerdown', (e) => {
      dragging = true;
      camWrap.classList.add('dragging');
      camWrap.setPointerCapture(e.pointerId);
      const r = camWrap.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
    });
    camWrap.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const x = Math.max(8, Math.min(innerWidth - 158, e.clientX - dx));
      const y = Math.max(8, Math.min(innerHeight - 158, e.clientY - dy));
      camWrap.style.left = `${x}px`;
      camWrap.style.top = `${y}px`;
      camWrap.style.bottom = 'auto';
    });
    camWrap.addEventListener('pointerup', (e) => {
      dragging = false;
      camWrap.classList.remove('dragging');
      camWrap.releasePointerCapture(e.pointerId);
    });
  }

  function stopCamera() {
    try { camStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
    camStream = null;
    camWrap?.remove();
  }

  // ── draw on screen ──────────────────────────────────────
  function toggleDraw(btn) {
    drawing = !drawing;
    btn.classList.toggle('on', drawing);
    if (!drawing) { drawCanvas?.remove(); drawCanvas = null; return; }

    drawCanvas = document.createElement('canvas');
    drawCanvas.className = 'draw';
    drawCanvas.width = innerWidth; drawCanvas.height = innerHeight;
    wrap().appendChild(drawCanvas);
    const ctx = drawCanvas.getContext('2d');
    ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 4;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    let down = false;
    const strokes = [];
    drawCanvas.addEventListener('pointerdown', (e) => { down = true; ctx.beginPath(); ctx.moveTo(e.clientX, e.clientY); });
    drawCanvas.addEventListener('pointermove', (e) => {
      if (!down) return;
      ctx.lineTo(e.clientX, e.clientY); ctx.stroke();
    });
    drawCanvas.addEventListener('pointerup', () => {
      down = false;
      // Ink fades after 3.5s so the recording never gets cluttered.
      const snapshot = ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
      strokes.push(snapshot);
      setTimeout(() => {
        let a = 1;
        const fade = setInterval(() => {
          a -= 0.08;
          if (a <= 0) { clearInterval(fade); ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); return; }
          ctx.globalAlpha = 1;
          ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
          ctx.globalAlpha = a;
          ctx.putImageData(snapshot, 0, 0);
        }, 45);
      }, 3500);
    });
    toast('Draw mode on — ink fades automatically. Click the pen again to exit.');
  }

  // ── screenshot area selector ────────────────────────────
  function selectArea() {
    return new Promise((resolve) => {
      mount();
      const layer = document.createElement('div');
      layer.className = 'sel';
      const box = document.createElement('div');
      box.className = 'selbox';
      box.style.display = 'none';
      const hint = document.createElement('div');
      hint.className = 'selhint';
      hint.textContent = 'Drag to select an area · Esc to cancel';
      wrap().append(layer, box, hint);

      let sx = 0, sy = 0, active = false;
      const done = (rect) => {
        layer.remove(); box.remove(); hint.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(rect);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
      document.addEventListener('keydown', onKey, true);

      layer.addEventListener('pointerdown', (e) => {
        active = true; sx = e.clientX; sy = e.clientY;
        box.style.display = 'block';
        Object.assign(box.style, { left: `${sx}px`, top: `${sy}px`, width: '0px', height: '0px' });
      });
      layer.addEventListener('pointermove', (e) => {
        if (!active) return;
        const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
        Object.assign(box.style, {
          left: `${x}px`, top: `${y}px`,
          width: `${Math.abs(e.clientX - sx)}px`, height: `${Math.abs(e.clientY - sy)}px`,
        });
      });
      layer.addEventListener('pointerup', (e) => {
        if (!active) return;
        active = false;
        const rect = {
          x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY),
          w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy),
        };
        done(rect.w > 8 && rect.h > 8 ? rect : null);
      });
    });
  }

  // ── message router ──────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.type === 'ko-overlay-init') {
      mount();
      (async () => {
        if (msg.opts?.countdown) await countdown(3);
        if (!bar) buildBar();
        if (msg.opts?.camera) startCamera();
      })();
      respond?.({ ok: true });
    }

    if (msg.type === 'ko-overlay-destroy') { unmount(); respond?.({ ok: true }); }

    if (msg.type === 'ko-state') {
      const s = msg.state;
      paused = s.status === 'paused';
      if (bar) {
        bar.querySelector('.dot')?.classList.toggle('paused', paused);
        const pb = bar.querySelector('[data-a="pause"]');
        if (pb) pb.innerHTML = paused ? ICON.play : ICON.pause;
        if (s.status === 'uploading') {
          const stop = bar.querySelector('.btn.stop');
          if (stop) stop.textContent = `Saving ${s.progress || 0}%`;
        }
      }
      if (s.status === 'done' || s.status === 'idle' || s.status === 'error') unmount();
    }

    if (msg.type === 'ko-select-area') {
      selectArea().then((rect) => respond({ rect, dpr: window.devicePixelRatio || 1 }));
      return true;
    }
    return true;
  });

  // ── keyboard: Esc cancels, Alt+Shift+P pauses ───────────
  document.addEventListener('keydown', (e) => {
    if (!bar) return;
    if (e.altKey && e.shiftKey && e.code === 'KeyP') {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: paused ? 'ko-resume' : 'ko-pause' });
    }
  }, true);
})();
