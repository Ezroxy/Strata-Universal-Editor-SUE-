/* Welcome screen — Nord Frost: a calm arctic night. Aurora curtains ripple over snowy ridges and a frozen lake
   mirrors them while snow drifts down; the editors are three frosted-glass cards. Point at one and the aurora takes
   its colour. The mountains follow the mouse a little (parallax). */
(() => {
const App = window.App;
App.WELCOMES.nord = {
  css: `
.wl-nord { background: #1d222c; color: #eceff4; font-family: Manrope, sans-serif; }
.wl-nord .wn-head { position: absolute; left: 0; right: 0; top: 9vh; z-index: 3; text-align: center; pointer-events: none; animation: wn-in 1.4s .1s ease both; }
@keyframes wn-in { from { opacity: 0; transform: translateY(14px); filter: blur(8px); } }
.wl-nord .wn-eb { font: 600 11px 'JetBrains Mono'; letter-spacing: .55em; color: #88c0d0; padding-left: .55em; }
.wl-nord h1 { margin: 14px 0 0; font: 200 clamp(38px, 4.6vw, 70px)/1 Manrope, sans-serif; letter-spacing: .32em; padding-left: .32em; color: #eceff4; text-shadow: 0 0 30px rgba(136,192,208,.35); }
.wl-nord h1 b { font-weight: 700; }
.wl-nord .wn-head p { margin: 16px 0 0; font-size: clamp(13px, 1.05vw, 15px); color: #d8dee9; opacity: .8; }
.wl-nord .wn-cards { position: absolute; left: 50%; bottom: 13vh; z-index: 3; transform: translateX(-50%); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(12px, 1.6vw, 22px); width: min(1060px, 92vw); }
.wl-nord .wn-card { position: relative; text-align: left; padding: 18px 18px 16px; border-radius: 14px; border: 1px solid rgba(216,222,233,.22); background: linear-gradient(160deg, rgba(236,239,244,.12), rgba(46,52,64,.28) 60%); backdrop-filter: blur(16px) saturate(1.3); color: #eceff4; box-shadow: 0 20px 50px -20px rgba(0,0,0,.6), inset 0 1px 0 rgba(236,239,244,.18); overflow: hidden; transition: transform .45s cubic-bezier(.2,1.2,.3,1), border-color .3s, box-shadow .3s; animation: wn-in 1.2s both; }
.wl-nord .wn-card:nth-child(1) { animation-delay: .5s; } .wl-nord .wn-card:nth-child(2) { animation-delay: .62s; } .wl-nord .wn-card:nth-child(3) { animation-delay: .74s; }
.wl-nord .wn-card::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5; background: radial-gradient(120px 60px at 0 0, rgba(236,239,244,.25), transparent 70%), radial-gradient(90px 50px at 100% 100%, rgba(236,239,244,.14), transparent 70%); }
.wl-nord .wn-card::after { content: ''; position: absolute; left: -40%; top: 0; width: 40%; height: 1px; background: linear-gradient(90deg, transparent, #fff, transparent); opacity: 0; }
.wl-nord .wn-card:hover, .wl-nord .wn-card:focus-visible, .wl-nord .wn-card.wn-on { transform: translateY(-8px); border-color: color-mix(in srgb, var(--c) 70%, transparent); box-shadow: 0 30px 60px -20px rgba(0,0,0,.7), 0 0 34px -8px var(--c), inset 0 1px 0 rgba(236,239,244,.3); outline: none; }
.wl-nord .wn-card:hover::after, .wl-nord .wn-card.wn-on::after { animation: wn-glint 1.1s ease forwards; }
@keyframes wn-glint { from { left: -40%; opacity: 1; } to { left: 110%; opacity: 1; } }
.wl-nord .wn-top { display: flex; align-items: center; gap: 12px; }
.wl-nord .wn-ic { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: #2e3440; background: var(--c); box-shadow: 0 0 22px -4px var(--c); flex: none; }
.wl-nord .wn-card h2 { margin: 0; font: 700 20px Manrope; letter-spacing: .02em; }
.wl-nord .wn-card kbd { margin-left: auto; font: 600 11px 'JetBrains Mono'; color: #d8dee9; border: 1px solid rgba(216,222,233,.3); border-radius: 6px; padding: 2px 7px; }
.wl-nord .wn-card p { margin: 12px 0 10px; font-size: 13px; line-height: 1.5; color: #d8dee9; }
.wl-nord .wn-card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 5px; }
.wl-nord .wn-card li { font: 600 12px Manrope; color: #c3cad6; display: flex; gap: 8px; align-items: center; }
.wl-nord .wn-card li::before { content: '❄'; font-size: 10px; color: var(--c); }
.wl-nord .wn-acts { position: absolute; right: 3.5vw; top: 3.5vh; z-index: 4; display: flex; gap: 4px; }
.wl-nord .wn-btn { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px; border-radius: 8px; border: 0; background: transparent; color: #d8dee9; font: 600 12px Manrope; transition: background .2s, color .2s; }
.wl-nord .wn-btn:hover { background: rgba(236,239,244,.08); color: #fff; }
.wl-nord .wn-btn kbd { font: 600 10px 'JetBrains Mono'; opacity: .5; }
.wl-nord .wn-meta { position: absolute; left: 3.5vw; top: 3.5vh; z-index: 4; font: 600 11px 'JetBrains Mono'; letter-spacing: .1em; color: #8fa0b8; line-height: 32px; }
.wl-nord .wn-bot { position: absolute; left: 0; right: 0; bottom: 4vh; z-index: 4; display: flex; justify-content: center; align-items: center; gap: 18px; font: 600 12px Manrope; color: #c3cad6; }
.wl-nord .wn-bot .wn-btn { border: 1px solid rgba(216,222,233,.25); }
.wl-nord .wn-bot .wn-hint { font: 600 11px 'JetBrains Mono'; letter-spacing: .12em; color: #7f8ea6; }
.wl-nord .wl-startup input { accent-color: #88c0d0; }
@media (max-width: 1180px) { .wl-nord .wn-meta { display: none; } }
`,
  build(root, api) {
    const M = api.modes;
    root.innerHTML = `
      <canvas class="wl-cv"></canvas>
      <div class="wn-meta">☾ <span class="wn-clock"></span> · AURORA ACTIVITY: HIGH</div>
      <div class="wn-acts">${api.actions.map(a => `<button class="wn-btn" data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${api.icon(a.icon, 15)}${a.label}${a.key ? `<kbd>${a.key}</kbd>` : ''}</button>`).join('')}</div>
      <div class="wn-head"><div class="wn-eb">VIDEO · AUDIO · IMAGE</div><h1><b>STRATA</b> STUDIO</h1><p>${api.esc(api.tagline)}</p></div>
      <div class="wn-cards">${M.map(m => `<button class="wn-card" data-pick="${m.id}" aria-label="Open the ${m.name} editor" style="--c:${m.color}"${api.tip(m.name + ' editor', m.tip, m.key)}>
        <div class="wn-top"><span class="wn-ic">${api.icon(m.icon, 21, 2)}</span><h2>${m.name}</h2><kbd>${m.key}</kbd></div><p>${m.desc}</p><ul>${m.pts.map(p => `<li>${p}</li>`).join('')}</ul></button>`).join('')}</div>
      <div class="wn-bot"><span class="wn-hint">PRESS 1 · 2 · 3</span><span class="wn-su"></span><button class="wn-btn" data-act="close"${api.tip('Continue', 'Close the welcome screen and keep working.', 'Esc')}>Continue · Esc</button></div>`;
    root.querySelector('.wn-su').append(api.startup('Show at startup'));
    const clock = root.querySelector('.wn-clock'); const tick = () => { clock.textContent = new Date().toTimeString().slice(0, 5); }; tick(); api.every(10000, tick);
    const cards = [...root.querySelectorAll('.wn-card')];
    let hover = -1;
    cards.forEach((el, i) => { el.addEventListener('pointerenter', () => { hover = i; }); el.addEventListener('pointerleave', () => { if (hover === i) hover = -1; }); el.addEventListener('focus', () => { hover = i; el.classList.add('wn-on'); }); el.addEventListener('blur', () => { el.classList.remove('wn-on'); if (hover === i) hover = -1; }); });

    const S = api.canvas(root.querySelector('canvas'), 1.5), c = S.ctx;
    // aurora column sprite: transparent → colour → transparent (vertical), tinted per layer
    const sprite = col => { const s = document.createElement('canvas'); s.width = 1; s.height = 256; const g = s.getContext('2d'), lg = g.createLinearGradient(0, 0, 0, 256); lg.addColorStop(0, api.rgba(col, 0)); lg.addColorStop(0.18, api.rgba(col, 0.75)); lg.addColorStop(0.35, api.rgba(col, 0.35)); lg.addColorStop(1, api.rgba(col, 0)); g.fillStyle = lg; g.fillRect(0, 0, 1, 256); return s; };
    const BASE = ['#a3be8c', '#8fbcbb', '#b48ead'];
    let cols = BASE.slice(), sprites = cols.map(sprite), lastCols = cols.join();
    const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random() * 0.6, r: Math.random() * 1.2 + 0.2, p: Math.random() * 7 }));
    const snow = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.8 + 0.4, s: 0.02 + Math.random() * 0.05, p: Math.random() * 7 }));
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    api.on(root, 'pointermove', e => { mouse.tx = e.clientX / innerWidth - 0.5; mouse.ty = e.clientY / innerHeight - 0.5; });
    // jagged ridges from summed triangle waves (sharp peaks, like real mountains)
    const tri = v => 1 - 2 * Math.abs((v - Math.floor(v)) - 0.5);
    const ridge = (base, amp, seed, freq) => x => base - amp * (0.62 * tri(x * freq + seed) ** 1.6 + 0.26 * tri(x * freq * 2.7 + seed * 1.9) + 0.12 * tri(x * freq * 7.3 + seed * 0.7));
    const sky = document.createElement('canvas');
    api.loop((t, dt) => {
      const W = S.w, H = S.h, tt = api.reduce ? 0 : t, hz = H * 0.66;
      mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
      // aurora colour follows the hovered card
      const want = hover >= 0 ? [M[hover].color, api.mix(M[hover].color, '#8fbcbb', 0.4), api.mix(M[hover].color, '#b48ead', 0.4)] : BASE;
      cols = cols.map((col, k) => api.mix(col, want[k], Math.min(1, dt * 3)));
      const key = cols.join(); if (key !== lastCols) { sprites = cols.map(sprite); lastCols = key; }
      let g = c.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, '#0f1218'); g.addColorStop(0.55, '#1f2530'); g.addColorStop(0.85, '#3b4658'); g.addColorStop(1, '#5d6b82');
      c.fillStyle = g; c.fillRect(0, 0, W, hz);
      for (const s of stars) { c.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(tt * 0.9 + s.p)); c.fillStyle = '#eceff4'; c.fillRect(s.x * W, s.y * hz, s.r, s.r); }
      c.globalAlpha = 1;
      // aurora curtains
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let L = 0; L < 3; L++) {
        const step = 3, top0 = H * (0.1 + L * 0.06), amp = H * (0.07 + L * 0.02), len = H * (0.38 - L * 0.06);
        for (let x = 0; x < W; x += step) {
          const u = x / W;
          const y = top0 + Math.sin(u * 5.2 + tt * (0.22 + L * 0.07) + L * 2) * amp + Math.sin(u * 13 - tt * 0.5 + L) * amp * 0.25;
          const k = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(u * 9 + tt * 0.3 + L * 1.3) * 0.5 + 0.5 + Math.sin(u * 23 - tt * 0.9) * 0.25), 1.4);
          c.globalAlpha = k * (0.8 - L * 0.18);
          c.drawImage(sprites[L], x, y, step, len * (0.75 + 0.35 * Math.sin(u * 7 + tt * 0.4)));
        }
      }
      c.restore(); c.globalAlpha = 1;
      // keep a copy of the sky for the lake reflection
      if (sky.width !== Math.ceil(W) || sky.height !== Math.ceil(hz)) { sky.width = Math.ceil(W); sky.height = Math.ceil(hz); }
      sky.getContext('2d').drawImage(S.cv, 0, 0, S.cv.width, Math.round(hz * S.dpr), 0, 0, sky.width, sky.height);
      // ridges (parallax)
      const layers = [[hz, H * 0.3, 0.13, 0.0016, ['#4a5468', '#2b313d'], 6, 0.42], [hz + 2, H * 0.19, 0.61, 0.0027, ['#3a4252', '#232832'], 14, 0.5], [hz + 3, H * 0.09, 0.37, 0.0055, ['#2a303b', '#1a1e26'], 26, 0.62]];
      for (const [base, amp, seed, freq, col, par, snowK] of layers) {
        const f = ridge(base, amp, seed, freq), ox = mouse.x * par, oy = mouse.y * par * 0.4;
        c.beginPath(); c.moveTo(-20, hz + 4);
        for (let x = -20; x <= W + 20; x += 4) c.lineTo(x, f(x + ox * 4) + oy);
        c.lineTo(W + 20, hz + 4); c.closePath();
        g = c.createLinearGradient(0, base - amp, 0, base); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
        c.fillStyle = g; c.fill();
        // snow only on the summits: everything above the snow line, with a ragged lower edge
        c.save(); c.clip();
        const line = base - amp * snowK;
        g = c.createLinearGradient(0, base - amp, 0, line); g.addColorStop(0, 'rgba(236,239,244,.95)'); g.addColorStop(1, 'rgba(216,222,233,.75)');
        c.fillStyle = g; c.beginPath(); c.moveTo(-20, 0);
        for (let x = -20; x <= W + 20; x += 5) c.lineTo(x, line + Math.sin(x * 0.09 + seed * 9) * amp * 0.05 + Math.sin(x * 0.31) * amp * 0.025);
        c.lineTo(W + 20, 0); c.closePath(); c.fill();
        // moonlit side: a soft shade on the right-facing slopes
        c.fillStyle = 'rgba(15,18,24,.18)';
        for (let x = -20; x <= W + 20; x += 4) { const a = f(x + ox * 4), b2 = f(x + 4 + ox * 4); if (b2 > a) c.fillRect(x, a + oy, 4, base - a + 6); }
        c.restore();
      }
      // frozen lake: mirrored sky, then ice tint
      c.save(); c.beginPath(); c.rect(0, hz, W, H - hz); c.clip();
      c.translate(0, hz * 2); c.scale(1, -1); c.globalAlpha = 0.35; c.drawImage(sky, 0, 0, W, hz); c.restore();
      g = c.createLinearGradient(0, hz, 0, H); g.addColorStop(0, 'rgba(46,52,64,.55)'); g.addColorStop(1, 'rgba(22,26,34,.96)');
      c.fillStyle = g; c.fillRect(0, hz, W, H - hz);
      c.strokeStyle = 'rgba(216,222,233,.06)'; c.lineWidth = 1;
      for (let k = 0; k < 18; k++) { const y = hz + Math.pow(k / 18, 1.6) * (H - hz); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y + 4); c.stroke(); }
      // snow
      for (const s of snow) {
        if (!api.reduce) { s.y += s.s * dt * (0.6 + s.r * 0.3); s.x += Math.sin(tt * 0.6 + s.p) * 0.0004; if (s.y > 1.02) { s.y = -0.02; s.x = Math.random(); } }
        c.globalAlpha = 0.35 + s.r * 0.25; c.fillStyle = '#eceff4'; c.beginPath(); c.arc(s.x * W + mouse.x * s.r * 10, s.y * H, s.r, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    });
    return {
      key(e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { cards[hover < 0 ? 0 : (hover + (e.key === 'ArrowRight' ? 1 : 2)) % 3].focus(); return true; }
        return false;
      },
    };
  },
};
})();
