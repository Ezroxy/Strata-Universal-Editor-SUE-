/* Welcome screen — Midnight OLED: "Orbit". On true black, the Strata logo is a sun made of particles (they scatter
   from the mouse and settle back), and the three editors are planets on tilted orbits: a ringed planet whose ring is
   film, a planet that sends out sound waves, and a cut-gem planet with a pixel moon. Hover slows time and opens a card. */
(() => {
const App = window.App;
App.WELCOMES.oled = {
  css: `
.wl-oled { background: #000; color: #f4f4f4; font-family: Manrope, sans-serif; }
.wl-oled header { position: absolute; left: 0; right: 0; top: 6vh; text-align: center; pointer-events: none; z-index: 2; animation: wo-in 1.4s .2s ease both; }
@keyframes wo-in { from { opacity: 0; letter-spacing: .9em; } }
.wl-oled .wo-eb { font: 600 11px 'JetBrains Mono'; letter-spacing: .6em; color: #6e6e6e; }
.wl-oled h1 { margin: 12px 0 0; font: 300 clamp(28px, 3.2vw, 50px)/1 Manrope; letter-spacing: .42em; padding-left: .42em; }
.wl-oled h1 b { font-weight: 800; }
.wl-oled header p { margin: 14px 0 0; font-size: 14px; color: #8a8a8a; }
.wl-oled .wo-card { position: absolute; left: 0; top: 0; z-index: 3; width: 290px; padding: 16px 18px; border-radius: 16px; background: rgba(10,10,10,.82); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 20px 60px rgba(0,0,0,.8), 0 0 0 1px color-mix(in srgb, var(--c) 30%, transparent), 0 0 40px -12px var(--c); opacity: 0; transform: scale(.94); transform-origin: 0 50%; transition: opacity .2s, transform .3s cubic-bezier(.2,1.4,.4,1); pointer-events: none; }
.wl-oled .wo-card.wo-on { opacity: 1; transform: none; }
.wl-oled .wo-card.wo-left { transform-origin: 100% 50%; }
.wl-oled .wo-card .wo-k { font: 700 10.5px 'JetBrains Mono'; letter-spacing: .2em; color: var(--c); }
.wl-oled .wo-card h2 { margin: 6px 0 4px; font: 800 22px Manrope; letter-spacing: -.02em; }
.wl-oled .wo-card p { margin: 0; font-size: 12.5px; line-height: 1.55; color: #a8a8a8; }
.wl-oled .wo-card ul { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 5px; }
.wl-oled .wo-card li { font: 650 12px Manrope; color: #dcdcdc; display: flex; gap: 8px; align-items: center; }
.wl-oled .wo-card li::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); }
.wl-oled .wo-card .wo-go { margin-top: 12px; font: 700 11px 'JetBrains Mono'; color: #777; letter-spacing: .1em; }
.wl-oled .wo-acts { position: absolute; left: 50%; bottom: 4.5vh; transform: translateX(-50%); z-index: 2; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; width: max-content; max-width: 96vw; }
.wl-oled .wo-btn { display: flex; align-items: center; gap: 7px; height: 36px; padding: 0 15px; border-radius: 18px; border: 1px solid rgba(255,255,255,.12); background: #000; color: #cfcfcf; font: 700 12.5px Manrope; transition: background .2s, border-color .2s, color .2s; }
.wl-oled .wo-btn:hover { background: #111; border-color: rgba(255,255,255,.3); color: #fff; }
.wl-oled .wo-btn kbd { font: 600 10px 'JetBrains Mono'; opacity: .55; }
.wl-oled .wo-pk { position: absolute; z-index: 2; width: 10px; height: 10px; border-radius: 50%; padding: 0; border: 0; background: transparent; transform: translate(-50%, -50%); }
.wl-oled .wo-pk:focus-visible { outline: 2px solid #fff; outline-offset: 30px; }
.wl-oled .wl-startup { font: 700 12px Manrope; color: #a8a8a8; padding: 0 8px; } .wl-oled .wl-startup input { accent-color: #8f6dff; }
`,
  build(root, api) {
    const M = api.modes;
    const L = M.map(m => api.mix(m.color, '#ffffff', 0.55)), D = M.map(m => api.mix(m.color, '#000000', 0.45));
    root.innerHTML = `
      <canvas class="wl-cv"></canvas>
      <header><div class="wo-eb">WELCOME TO</div><h1><b>STRATA</b> STUDIO</h1><p>${api.esc(api.tagline)} Click a planet — or press 1, 2, 3.</p></header>
      ${M.map(m => `<button class="wo-pk" data-pick="${m.id}" aria-label="Open the ${m.name} editor"></button>`).join('')}
      <div class="wo-card"></div>
      <div class="wo-acts">${api.actions.map(a => `<button class="wo-btn" data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${api.icon(a.icon, 15)}${a.label}${a.key ? `<kbd>${a.key}</kbd>` : ''}</button>`).join('')}<span class="wo-su"></span><button class="wo-btn" data-act="close"${api.tip('Continue', 'Close the welcome screen and keep working.', 'Esc')}>Continue<kbd>Esc</kbd></button></div>`;
    root.querySelector('.wo-su').append(api.startup('Show at startup'));
    const card = root.querySelector('.wo-card'), pks = [...root.querySelectorAll('.wo-pk')];
    const S = api.canvas(root.querySelector('canvas')), c = S.ctx;
    let W = 1, H = 1, cx = 0, cy = 0, U = 1, stars = [], neb = null, parts = [];
    const hash = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    const mouse = { x: -1e4, y: -1e4, px: 0, py: 0 };
    function buildLogo() {
      const s = 9.6 * U, k = Math.tan(-12 * Math.PI / 180), step = Math.max(2.6, 3.2 * U) / s;
      const bars = [[2, 5, 0], [4, 13, 1], [6, 21, 2]];
      const old = parts; parts = [];
      bars.forEach(([bx, by, mi]) => {
        for (let y = by; y <= by + 6; y += step) for (let x = bx; x <= bx + 22; x += step) {
          const qx = Math.max(bx + 3 - x, 0, x - (bx + 19)), qy = Math.max(by + 3 - y, 0, y - (by + 3));
          if (qx * qx + qy * qy > 9) continue;
          const tx = cx + (x + k * y + 4 - 16) * s, ty = cy + (y - 16) * s, o = old[parts.length];
          const a = Math.random() * 7, r = 300 + Math.random() * 600;
          parts.push({ tx, ty, x: o ? o.x : api.reduce ? tx : cx + Math.cos(a) * r, y: o ? o.y : api.reduce ? ty : cy + Math.sin(a) * r, vx: 0, vy: 0, mi, sz: 1.2 + Math.random() * 1.4, ph: Math.random() * 7, lit: Math.random() < 0.18 });
        }
      });
    }
    S.onResize = s => {
      W = s.w; H = s.h; cx = W / 2; cy = H * 0.52; U = Math.min(W / 1440, H / 900);
      stars = [];
      for (let l = 0; l < 3; l++) for (let i = 0; i < 160 + l * 60; i++) stars.push({ x: Math.random() * W * 1.1 - W * 0.05, y: Math.random() * H * 1.1 - H * 0.05, r: 0.4 + Math.random() * (0.7 + l * 0.5), d: 0.006 + l * 0.014, tw: Math.random() * 7, a: 0.35 + Math.random() * 0.6 });
      neb = document.createElement('canvas'); neb.width = Math.max(1, Math.round(W / 2)); neb.height = Math.max(1, Math.round(H / 2)); const n = neb.getContext('2d');
      [[0.18, 0.3, M[0].color], [0.82, 0.25, M[1].color], [0.7, 0.85, M[2].color]].forEach(([x, y, col]) => { const g = n.createRadialGradient(neb.width * x, neb.height * y, 0, neb.width * x, neb.height * y, neb.width * 0.45); g.addColorStop(0, api.rgba(col, 0.07)); g.addColorStop(1, api.rgba(col, 0)); n.fillStyle = g; n.fillRect(0, 0, neb.width, neb.height); });
      buildLogo();
    };
    const PL = [{ a: 0.205, b: 0.31, sp: 0.16, ph: 2.3, r: 30 }, { a: 0.3, b: 0.3, sp: 0.11, ph: 0.4, r: 27 }, { a: 0.4, b: 0.3, sp: 0.075, ph: 4.4, r: 29 }];
    const TILT = -0.12;
    let t = 0, ts = 1, hover = -1, pulse = null, P = [];
    const pos = (p, i) => { const A = W * p.a, B = A * p.b, th = p.ph + t * p.sp, ex = Math.cos(th) * A, ey = Math.sin(th) * B; return { x: cx + ex * Math.cos(TILT) - ey * Math.sin(TILT), y: cy + ex * Math.sin(TILT) + ey * Math.cos(TILT), depth: Math.sin(th), s: (0.78 + 0.32 * (Math.sin(th) + 1) / 2) * U * (hover === i ? 1.18 : 1) }; };
    const ring = (p, front) => { const A = W * p.a, B = A * p.b; c.save(); c.translate(cx, cy); c.rotate(TILT); c.strokeStyle = front ? 'rgba(220,220,230,.16)' : 'rgba(220,220,230,.07)'; c.lineWidth = 1; c.setLineDash(front ? [] : [3, 6]); c.beginPath(); c.ellipse(0, 0, A, B, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); c.stroke(); c.restore(); c.setLineDash([]); };
    const sphere = (x, y, r, i) => { const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); g.addColorStop(0, L[i]); g.addColorStop(0.45, M[i].color); g.addColorStop(0.85, D[i]); g.addColorStop(1, '#0a0a0a'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
    const halo = (x, y, r, i, k = 1) => { c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(x, y, r * 0.6, x, y, r * 3.2); g.addColorStop(0, api.rgba(M[i].color, 0.27 * k)); g.addColorStop(1, api.rgba(M[i].color, 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 3.2, 0, 7); c.fill(); c.restore(); };
    function planet(i, Q) {
      const p = PL[i], r = p.r * Q.s, x = Q.x, y = Q.y, on = hover === i, id = M[i].id;
      halo(x, y, r, i, on ? 1.6 : 1);
      if (id === 'video') {
        const film = (from, to) => { c.save(); c.translate(x, y); c.rotate(-0.38); c.strokeStyle = 'rgba(30,20,14,.95)'; c.lineWidth = 9 * Q.s; c.beginPath(); c.ellipse(0, 0, r * 2.05, r * 0.56, 0, from, to); c.stroke(); c.strokeStyle = api.rgba(L[0], 0.85); c.lineWidth = 1.6 * Q.s; c.setLineDash([2.2 * Q.s, 3.6 * Q.s]); c.lineDashOffset = -t * 18; [-3.1, 3.1].forEach(o => { c.beginPath(); c.ellipse(0, 0, r * 2.05 + o * Q.s, r * 0.56 + o * Q.s * 0.28, 0, from, to); c.stroke(); }); c.restore(); c.setLineDash([]); };
        film(Math.PI, Math.PI * 2); sphere(x, y, r, i);
        c.save(); c.beginPath(); c.arc(x, y, r, 0, 7); c.clip(); c.fillStyle = 'rgba(255,230,200,.12)'; for (let k = -2; k <= 2; k++) c.fillRect(x - r, y + k * r * 0.33 - r * 0.06, r * 2, r * 0.1); c.restore();
        film(0, Math.PI);
      } else if (id === 'audio') {
        for (let k = 0; k < 3; k++) { const q = ((t * 0.5 + k / 3) % 1); c.strokeStyle = api.rgba(M[i].color, 0.55 * (1 - q)); c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r * (1.15 + q * 1.6), 0, 7); c.stroke(); }
        sphere(x, y, r, i);
        c.save(); c.beginPath(); c.arc(x, y, r, 0, 7); c.clip(); c.strokeStyle = 'rgba(230,255,248,.55)'; c.lineWidth = 1.4 * Q.s; c.beginPath();
        for (let q = -r; q <= r; q += 2) { const a = Math.sin(q * 0.35 + t * 6) * Math.sin(q * 0.07 + t) * r * 0.32; q === -r ? c.moveTo(x + q, y + a) : c.lineTo(x + q, y + a); }
        c.stroke(); c.restore();
      } else {
        sphere(x, y, r, i);
        c.save(); c.beginPath(); c.arc(x, y, r, 0, 7); c.clip();
        const pts = [[0, 0]]; for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283 + t * 0.15; pts.push([Math.cos(a) * r * (0.55 + 0.5 * hash(k)), Math.sin(a) * r * (0.55 + 0.5 * hash(k + 4))]); }
        for (let k = 1; k <= 9; k++) { const a = pts[k], b = pts[k % 9 + 1], lit = 0.5 + 0.5 * Math.sin(k * 1.7 + t * 0.6); c.fillStyle = lit > 0.5 ? `rgba(255,255,255,${(lit - 0.5) * 0.4})` : `rgba(10,0,30,${(0.5 - lit) * 0.5})`; c.beginPath(); c.moveTo(x, y); c.lineTo(x + a[0], y + a[1]); c.lineTo(x + b[0], y + b[1]); c.fill(); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 0.8; c.stroke(); }
        c.restore();
        const ma = t * 1.4, mx = x + Math.cos(ma) * r * 1.7, my = y + Math.sin(ma) * r * 0.6, ms = 5 * Q.s;
        c.fillStyle = L[2]; c.save(); c.translate(mx, my); c.rotate(t); c.fillRect(-ms / 2, -ms / 2, ms, ms); c.restore();
      }
      c.font = `700 ${Math.round(11 * Math.max(0.9, Q.s))}px Manrope`; c.textAlign = 'center'; if ('letterSpacing' in c) c.letterSpacing = '3px';
      c.fillStyle = on ? '#fff' : 'rgba(225,225,230,.7)'; c.fillText(`${M[i].name.toUpperCase()}  ${M[i].key}`, x, y + r * (id === 'video' ? 1.5 : 1) + 22);
      if ('letterSpacing' in c) c.letterSpacing = '0px';
      if (on) { c.save(); c.strokeStyle = M[i].color; c.lineWidth = 1.2; c.setLineDash([4, 5]); c.lineDashOffset = t * 12; c.beginPath(); c.arc(x, y, r * (id === 'video' ? 2.4 : 1.9), 0, 7); c.stroke(); c.restore(); }
    }
    const setHover = h => {
      if (h === hover) return;
      hover = h; root.style.cursor = h >= 0 ? 'pointer' : '';
      if (h >= 0) { const m = M[h]; card.style.setProperty('--c', m.color); card.innerHTML = `<div class="wo-k">PLANET 0${h + 1} · PRESS ${m.key}</div><h2>${m.name}</h2><p>${m.desc}</p><ul>${m.pts.map(p => `<li>${p}</li>`).join('')}</ul><div class="wo-go">CLICK TO LAND →</div>`; }
      card.classList.toggle('wo-on', h >= 0);
    };
    api.loop((_, dt, now) => {
      if (!neb) return;
      ts += ((hover >= 0 ? 0.06 : 1) - ts) * Math.min(1, dt * 5);
      if (!api.reduce) t += dt * ts;
      const T = now / 1000;
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      c.drawImage(neb, 0, 0, W, H);
      mouse.px += ((mouse.x > -1e3 ? mouse.x - cx : 0) - mouse.px) * 0.05; mouse.py += ((mouse.y > -1e3 ? mouse.y - cy : 0) - mouse.py) * 0.05;
      for (const s of stars) { c.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(T * 1.6 + s.tw)); c.fillStyle = '#e6e6f0'; c.fillRect(s.x - mouse.px * s.d, s.y - mouse.py * s.d, s.r, s.r); }
      c.globalAlpha = 1;
      const sh = (T % 9) / 1.1;
      if (sh < 1 && !api.reduce) { const sx = W * (0.15 + hash(Math.floor(T / 9)) * 0.6) + sh * 260, sy = H * 0.12 + sh * 120; const g = c.createLinearGradient(sx - 120, sy - 55, sx, sy); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${0.8 * (1 - sh)})`); c.strokeStyle = g; c.lineWidth = 1.4; c.beginPath(); c.moveTo(sx - 120, sy - 55); c.lineTo(sx, sy); c.stroke(); }
      P = PL.map(pos);
      PL.forEach(p => ring(p, false));
      const order = [0, 1, 2].sort((a, b) => P[a].depth - P[b].depth);
      order.filter(i => P[i].depth < 0).forEach(i => planet(i, P[i]));
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const q of parts) {
        let fx = (q.tx - q.x) * 0.045, fy = (q.ty - q.y) * 0.045;
        const dx = q.x - mouse.x, dy = q.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 9000) { const f = (9000 - d2) / 9000 * 2.4, d = Math.sqrt(d2) || 1; fx += dx / d * f; fy += dy / d * f; }
        q.vx = (q.vx + fx) * 0.84; q.vy = (q.vy + fy) * 0.84; q.x += q.vx; q.y += q.vy;
        c.globalAlpha = q.lit ? 0.6 + 0.4 * Math.sin(T * 3 + q.ph) : 0.8; c.fillStyle = q.lit ? L[q.mi] : M[q.mi].color;
        c.fillRect(q.x + Math.sin(T + q.ph) * 0.6, q.y + Math.cos(T * 1.3 + q.ph) * 0.6, q.sz, q.sz);
      }
      c.restore(); c.globalAlpha = 1;
      PL.forEach(p => ring(p, true));
      order.filter(i => P[i].depth >= 0).forEach(i => planet(i, P[i]));
      if (pulse) { const k = (now - pulse.t) / 700; if (k > 1) pulse = null; else { c.strokeStyle = M[pulse.i].color; c.globalAlpha = 1 - k; c.lineWidth = 3 * (1 - k) + 0.5; c.beginPath(); c.arc(pulse.x, pulse.y, 30 + k * 140, 0, 7); c.stroke(); c.globalAlpha = 1; } }
      // hit-testing + keep the invisible focus targets on the planets (keyboard / screen readers)
      let h = -1, best = 1e9;
      P.forEach((q, i) => { pks[i].style.left = q.x + 'px'; pks[i].style.top = q.y + 'px'; const d = Math.hypot(mouse.x - q.x, mouse.y - q.y); if (d < PL[i].r * q.s * 2 + 14 && d < best) { best = d; h = i; } });
      const f = pks.indexOf(document.activeElement);
      setHover(h >= 0 ? h : f);
      if (hover >= 0) { const q = P[hover], off = PL[hover].r * q.s * 2.6 + 18; let left = q.x < cx; if (left && q.x - off - 290 < 20) left = false; if (!left && q.x + off + 290 > W - 20) left = true; card.classList.toggle('wo-left', left); card.style.left = (left ? q.x - off - 290 : q.x + off) + 'px'; card.style.top = Math.max(20, Math.min(H - card.offsetHeight - 20, q.y - card.offsetHeight / 2)) + 'px'; }
    });
    api.on(root, 'pointermove', e => { const r = root.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    api.on(root, 'pointerleave', () => { mouse.x = mouse.y = -1e4; });
    api.on(root, 'click', e => { if (hover >= 0 && !e.target.closest('button')) api.choose(M[hover].id); });
    return {
      key(e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const cur = pks.indexOf(document.activeElement); pks[cur < 0 ? 0 : (cur + (e.key === 'ArrowRight' ? 1 : 2)) % 3].focus(); return true; }
        return false;
      },
      leave(id) { const i = M.findIndex(m => m.id === id), q = P[i]; if (q) pulse = { x: q.x, y: q.y, i, t: performance.now() }; return 450; },
    };
  },
};
})();
