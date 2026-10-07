/* Welcome screen — Synthwave: an outrun sunset. A striped neon sun sinks behind wireframe mountains while the
   perspective grid races toward you; chrome title, a neon "Studio" sign that flickers on, and the editors as three
   neon signs. Point at one and the sun takes its colour and the grid speeds up. VHS on-screen display included. */
(() => {
const App = window.App;
App.WELCOMES.synthwave = {
  css: `
.wl-synthwave { background: #12041f; color: #fbeaff; font-family: Manrope, sans-serif; }
.wl-synthwave .ws-title { position: absolute; left: 0; right: 0; top: max(7vh, 74px); z-index: 3; text-align: center; pointer-events: none; }
.wl-synthwave .ws-chrome { display: inline-block; font: 400 clamp(64px, 9.5vw, 150px)/.9 'Bebas Neue', sans-serif; letter-spacing: .06em; transform: skewX(-8deg); background: linear-gradient(180deg, #ffffff 0%, #c7e9ff 30%, #4e7bd6 49%, #1b0b3a 50%, #b04cc4 64%, #ffd1f4 82%, #ffffff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 1px #fff) drop-shadow(0 4px 0 #3b0d5e) drop-shadow(0 0 22px rgba(255,47,185,.55)); animation: ws-drop 1s .2s cubic-bezier(.2,.9,.3,1.25) both; }
@keyframes ws-drop { from { opacity: 0; transform: skewX(-8deg) translateY(-40px) scale(1.1); } }
.wl-synthwave .ws-neon { display: block; margin-top: -.35em; font: 400 clamp(40px, 5.2vw, 84px)/1 Pacifico, cursive; color: #ffe4f6; transform: rotate(-6deg); text-shadow: 0 0 4px #fff, 0 0 12px #ff2fb9, 0 0 28px #ff2fb9, 0 0 52px #ff2fb9; animation: ws-flick 2.4s .9s both; }
@keyframes ws-flick { 0% { opacity: 0; } 8% { opacity: 1; } 10% { opacity: .1; } 14% { opacity: 1; } 18% { opacity: .2; } 22%, 100% { opacity: 1; } }
.wl-synthwave .ws-tag { margin-top: 18px; font: 600 clamp(12px, 1vw, 15px) Manrope; letter-spacing: .08em; color: #ffd6f3; text-shadow: 0 0 10px rgba(255,47,185,.6); }
.wl-synthwave .ws-signs { position: absolute; left: 0; right: 0; bottom: 15vh; z-index: 3; display: flex; justify-content: center; gap: clamp(18px, 3.4vw, 54px); perspective: 900px; }
.wl-synthwave .ws-sign { position: relative; width: clamp(170px, 17vw, 250px); padding: 18px 16px 16px; border-radius: 16px; background: rgba(18,4,31,.62); border: 2px solid var(--c); color: #fff; text-align: center; backdrop-filter: blur(4px);
  box-shadow: 0 0 6px var(--c), 0 0 22px color-mix(in srgb, var(--c) 55%, transparent), inset 0 0 14px color-mix(in srgb, var(--c) 40%, transparent);
  -webkit-box-reflect: below 6px linear-gradient(transparent 55%, rgba(255,255,255,.22));
  transform: rotateX(8deg); transition: transform .35s cubic-bezier(.2,1.4,.4,1), box-shadow .25s, opacity .25s, filter .25s; animation: ws-rise .9s cubic-bezier(.2,.9,.3,1.2) both; }
.wl-synthwave .ws-sign:nth-child(1) { animation-delay: 1s; } .wl-synthwave .ws-sign:nth-child(2) { animation-delay: 1.12s; } .wl-synthwave .ws-sign:nth-child(3) { animation-delay: 1.24s; }
@keyframes ws-rise { from { opacity: 0; transform: rotateX(70deg) translateY(60px); } }
.wl-synthwave .ws-sign .ws-ic { width: 52px; height: 52px; margin: 0 auto 6px; border-radius: 50%; display: grid; place-items: center; color: var(--c); filter: drop-shadow(0 0 6px var(--c)); }
.wl-synthwave .ws-sign b { display: block; font: 400 clamp(34px, 3vw, 46px)/1 'Bebas Neue'; letter-spacing: .12em; color: #fff; text-shadow: 0 0 3px #fff, 0 0 12px var(--c), 0 0 26px var(--c); }
.wl-synthwave .ws-sign small { display: block; margin-top: 6px; font: 600 11.5px/1.45 Manrope; color: #ecd2fb; }
.wl-synthwave .ws-sign kbd { position: absolute; top: 10px; right: 12px; font: 700 11px 'JetBrains Mono'; color: var(--c); text-shadow: 0 0 6px var(--c); }
.wl-synthwave .ws-signs.ws-hov .ws-sign:not(.ws-on) { opacity: .45; filter: saturate(.5); }
.wl-synthwave .ws-sign.ws-on, .wl-synthwave .ws-sign:focus-visible { transform: rotateX(0) translateY(-10px) scale(1.06); box-shadow: 0 0 8px var(--c), 0 0 34px var(--c), 0 0 70px color-mix(in srgb, var(--c) 50%, transparent), inset 0 0 20px color-mix(in srgb, var(--c) 50%, transparent); outline: none; }
.wl-synthwave .ws-osd { position: absolute; z-index: 4; font: 700 clamp(14px, 1.3vw, 20px) 'JetBrains Mono', monospace; color: #fff; text-shadow: 2px 2px 0 rgba(0,0,0,.6), 0 0 8px rgba(255,255,255,.5); letter-spacing: .06em; pointer-events: none; }
.wl-synthwave .ws-osd.ws-tl { left: 3vw; top: 4vh; } .wl-synthwave .ws-osd.ws-br { right: 3vw; bottom: 3.4vh; text-align: right; }
.wl-synthwave .ws-osd .ws-blink { animation: ws-bl 1s steps(1) infinite; } @keyframes ws-bl { 50% { opacity: 0; } }
.wl-synthwave .ws-info { position: absolute; left: 0; right: 0; bottom: 6.5vh; z-index: 4; text-align: center; font: 600 13px 'JetBrains Mono', monospace; color: #fbeaff; text-shadow: 0 0 8px rgba(255,47,185,.6); letter-spacing: .04em; pointer-events: none; }
.wl-synthwave .ws-info .ws-press { color: #18eeff; text-shadow: 0 0 8px #18eeff; animation: ws-bl 1.2s steps(1) infinite; }
.wl-synthwave .ws-acts { position: absolute; right: 3vw; top: 4vh; z-index: 5; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; max-width: 52vw; }
.wl-synthwave .ws-btn { height: 32px; padding: 0 14px; display: inline-flex; align-items: center; gap: 7px; border-radius: 8px; border: 1px solid rgba(24,238,255,.7); background: rgba(18,4,31,.55); color: #c9fbff; font: 700 11.5px Manrope; letter-spacing: .06em; text-transform: uppercase; box-shadow: 0 0 10px rgba(24,238,255,.25), inset 0 0 8px rgba(24,238,255,.15); transition: box-shadow .2s, color .2s; }
.wl-synthwave .ws-btn:hover { color: #fff; box-shadow: 0 0 18px rgba(24,238,255,.6), inset 0 0 10px rgba(24,238,255,.3); }
.wl-synthwave .ws-bot { position: absolute; left: 3vw; bottom: 3.4vh; z-index: 5; display: flex; align-items: center; gap: 14px; font: 600 12px Manrope; color: #ecd2fb; }
.wl-synthwave .wl-startup input { accent-color: #ff2fb9; }
.wl-synthwave .ws-btn.ws-pink { border-color: rgba(255,47,185,.8); color: #ffd6f3; box-shadow: 0 0 10px rgba(255,47,185,.35), inset 0 0 8px rgba(255,47,185,.2); }
`,
  build(root, api) {
    const M = api.modes;
    const now = new Date(), MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][now.getMonth()];
    root.innerHTML = `
      <canvas class="wl-cv"></canvas>
      <div class="ws-osd ws-tl"><span class="ws-blink">▶</span> PLAY</div>
      <div class="ws-acts">${api.actions.map(a => `<button class="ws-btn" data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${api.icon(a.icon, 14)}${a.short}</button>`).join('')}</div>
      <div class="ws-title"><span class="ws-chrome">STRATA</span><span class="ws-neon">Studio</span><div class="ws-tag">${api.esc(api.tagline)}</div></div>
      <div class="ws-signs">${M.map(m => `<button class="ws-sign" data-pick="${m.id}" aria-label="Open the ${m.name} editor" style="--c:${m.color}"${api.tip(m.name + ' editor', m.tip, m.key)}><kbd>${m.key}</kbd><div class="ws-ic">${api.icon(m.icon, 40, 1.6)}</div><b>${m.name}</b><small>${m.desc}</small></button>`).join('')}</div>
      <div class="ws-info"><span class="ws-press">PRESS 1 · 2 · 3</span></div>
      <div class="ws-bot"><button class="ws-btn ws-pink" data-act="close"${api.tip('Continue', 'Close the welcome screen and keep working.', 'Esc')}>Continue · Esc</button></div>
      <div class="ws-osd ws-br">${MON} ${String(now.getDate()).padStart(2, '0')} ${now.getFullYear()}<br><span class="ws-clock"></span></div>`;
    root.querySelector('.ws-bot').append(api.startup('Show at startup'));
    const info = root.querySelector('.ws-info'), signsEl = root.querySelector('.ws-signs'), signs = [...root.querySelectorAll('.ws-sign')];
    const clock = root.querySelector('.ws-clock'); const tick = () => { const d = new Date(); clock.textContent = d.toTimeString().slice(0, 8).replace(/^(\d\d)/, h => (+h % 12 || 12).toString().padStart(2, '0')) + (d.getHours() < 12 ? ' AM' : ' PM'); }; tick(); api.every(1000, tick);
    const IDLE_INFO = info.innerHTML;
    let hover = -1;
    const set = i => {
      hover = i; signsEl.classList.toggle('ws-hov', i >= 0); signs.forEach((s, k) => s.classList.toggle('ws-on', k === i));
      info.innerHTML = i < 0 ? IDLE_INFO : `<span style="color:${M[i].color};text-shadow:0 0 8px ${M[i].color}">▶ ${M[i].name.toUpperCase()}</span> &nbsp; ${M[i].pts.join(' · ')}`;
    };
    signs.forEach((s, i) => { s.addEventListener('pointerenter', () => set(i)); s.addEventListener('pointerleave', () => { if (hover === i) set(-1); }); s.addEventListener('focus', () => set(i)); s.addEventListener('blur', () => { if (hover === i) set(-1); }); });

    const S = api.canvas(root.querySelector('canvas')), c = S.ctx;
    const stars = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.3 + 0.2, p: Math.random() * 7 }));
    const sunCol = { cur: ['#ffd319', '#ff8c2a', '#ff2fb9'] };
    let speed = 1, z = 0, warp = 0;
    const sun = document.createElement('canvas');
    const lerpCol = (a, b, k) => api.mix(a, b, k);
    const mountains = (side, H, hz, W) => {
      // jagged wireframe ridge on one side
      const pts = []; const n = 14;
      for (let k = 0; k <= n; k++) { const u = k / n; const x = side < 0 ? u * W * 0.42 : W - u * W * 0.42; const peak = Math.abs(Math.sin(k * 1.7 + (side < 0 ? 0 : 2))) * 0.6 + 0.2; const y = hz - (1 - u) * H * 0.22 * peak - (1 - u) * H * 0.04; pts.push([x, y]); }
      pts.push([side < 0 ? W * 0.42 : W * 0.58, hz]);
      c.beginPath(); c.moveTo(side < 0 ? 0 : W, hz); pts.forEach(([x, y]) => c.lineTo(x, y)); c.closePath();
      c.fillStyle = '#1a0630'; c.fill();
      c.strokeStyle = 'rgba(24,238,255,.75)'; c.lineWidth = 1.4; c.shadowColor = '#18eeff'; c.shadowBlur = 8; c.stroke(); c.shadowBlur = 0;
      c.strokeStyle = 'rgba(24,238,255,.18)'; c.lineWidth = 1;
      for (let k = 0; k < pts.length - 1; k++) { c.beginPath(); c.moveTo(pts[k][0], pts[k][1]); c.lineTo(pts[k][0] + (side < 0 ? 30 : -30), hz); c.stroke(); }
    };
    const palm = (x, base, s, flip) => {
      c.save(); c.translate(x, base); c.scale(flip ? -s : s, s);
      c.fillStyle = '#0d0218'; c.strokeStyle = 'rgba(255,47,185,.55)'; c.lineWidth = 1.2 / s;
      c.beginPath(); c.moveTo(-4, 0); c.quadraticCurveTo(10, -90, 30, -170); c.lineTo(36, -168); c.quadraticCurveTo(18, -90, 6, 0); c.closePath(); c.fill(); c.stroke();
      for (let k = 0; k < 7; k++) { const a = -2.6 + k * 0.62; c.beginPath(); c.moveTo(33, -170); c.quadraticCurveTo(33 + Math.cos(a) * 50, -170 + Math.sin(a) * 30 - 18, 33 + Math.cos(a) * 92, -170 + Math.sin(a) * 52 + 26); c.quadraticCurveTo(33 + Math.cos(a) * 50, -170 + Math.sin(a) * 30 - 4, 33, -166); c.fill(); c.stroke(); }
      c.restore();
    };
    api.loop((t, dt) => {
      const W = S.w, H = S.h, hz = H * 0.6, tt = api.reduce ? 0 : t;
      const target = hover >= 0 ? [api.mix(M[hover].color, '#fff7c0', 0.45), M[hover].color, api.mix(M[hover].color, '#2a0640', 0.35)] : ['#ffd319', '#ff8c2a', '#ff2fb9'];
      sunCol.cur = sunCol.cur.map((col, k) => lerpCol(col, target[k], Math.min(1, dt * 4)));
      speed += ((hover >= 0 ? 2.6 : 1) + warp * 14 - speed) * Math.min(1, dt * 3);
      if (!api.reduce) z = (z + dt * 0.55 * speed) % 1;
      // sky
      let g = c.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, '#0b0217'); g.addColorStop(0.55, '#2a0844'); g.addColorStop(0.85, '#6a1a6e'); g.addColorStop(1, '#c2366e');
      c.fillStyle = g; c.fillRect(0, 0, W, hz);
      for (const s of stars) { c.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(tt * 1.3 + s.p)); c.fillStyle = '#fff'; c.fillRect(s.x * W, s.y * H, s.r, s.r); }
      c.globalAlpha = 1;
      // sun
      const R = Math.min(W * 0.2, H * 0.3), sx = W / 2, sy = hz - R * 0.32;
      g = c.createRadialGradient(sx, sy, R * 0.6, sx, sy, R * 2.2); g.addColorStop(0, api.rgba(sunCol.cur[2], 0.45)); g.addColorStop(1, api.rgba(sunCol.cur[2], 0));
      c.fillStyle = g; c.fillRect(0, 0, W, hz);
      // the sun is painted off-screen so its cut-out stripes don't punch holes in the sky
      const sz = Math.ceil(R * 2 + 4);
      if (sun.width !== sz) { sun.width = sun.height = sz; }
      const sc = sun.getContext('2d'); sc.clearRect(0, 0, sz, sz);
      g = sc.createLinearGradient(0, 0, 0, sz); g.addColorStop(0, sunCol.cur[0]); g.addColorStop(0.55, sunCol.cur[1]); g.addColorStop(1, sunCol.cur[2]);
      sc.fillStyle = g; sc.beginPath(); sc.arc(sz / 2, sz / 2, R, 0, 7); sc.fill();
      sc.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 9; k++) { const p = ((k + (tt * 0.35) % 1) / 9); const y = sz / 2 + R * (-0.1 + p * 1.15), hh = R * 0.02 + p * R * 0.09; sc.fillRect(0, y, sz, hh); }
      sc.globalCompositeOperation = 'source-over';
      c.save(); c.beginPath(); c.rect(0, 0, W, hz); c.clip(); c.drawImage(sun, sx - sz / 2, sy - sz / 2); c.restore();
      mountains(-1, H, hz, W); mountains(1, H, hz, W);
      // floor
      g = c.createLinearGradient(0, hz, 0, H); g.addColorStop(0, '#2b0743'); g.addColorStop(1, '#0a0114');
      c.fillStyle = g; c.fillRect(0, hz, W, H - hz);
      c.save(); c.beginPath(); c.rect(0, hz, W, H - hz); c.clip();
      c.strokeStyle = '#ff2fb9'; c.shadowColor = '#ff2fb9'; c.shadowBlur = 10; c.lineWidth = 1.5;
      const vx = W / 2, depth = H - hz;
      for (let k = -24; k <= 24; k++) { c.beginPath(); c.moveTo(vx + k * W * 0.012, hz); c.lineTo(vx + k * W * 0.16, H); c.stroke(); }
      for (let k = 0; k < 22; k++) { const p = (k + z) / 22, y = hz + Math.pow(p, 2.6) * depth * 1.02; c.globalAlpha = Math.min(1, p * 2.4); c.lineWidth = 0.8 + p * 2; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      c.globalAlpha = 1; c.shadowBlur = 0;
      // horizon haze
      g = c.createLinearGradient(0, hz - 2, 0, hz + depth * 0.22); g.addColorStop(0, 'rgba(255,90,200,.55)'); g.addColorStop(1, 'rgba(255,90,200,0)');
      c.fillStyle = g; c.fillRect(0, hz - 2, W, depth * 0.22);
      c.restore();
      palm(W * 0.07, H + 4, H / 620, false); palm(W * 0.15, H + 30, H / 900, true); palm(W * 0.93, H + 4, H / 640, true);
      // VHS tracking noise line
      if (api.fx && !api.reduce) { const ny = ((tt * 0.07) % 1.3) * H; c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(0, ny, W, 3); c.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1); }
    });
    return {
      key(e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { signs[hover < 0 ? 0 : (hover + (e.key === 'ArrowRight' ? 1 : 2)) % 3].focus(); return true; }
        return false;
      },
      leave(id) { set(M.findIndex(m => m.id === id)); warp = 1; return 520; },
    };
  },
};
})();
