/* Welcome screen — Grove Street: a San Andreas style front end. A loading screen with the Pricedown logo and a thin
   loading bar, then the main menu over a halftone Los Santos sunset (skyline, palms, power lines). The editors are
   the first menu items; Load Game opens a project; picking an editor shows "MISSION PASSED! RESPECT +". */
(() => {
const App = window.App;
App.WELCOMES.grove = {
  css: `
.wl-grove { background: #07130a; color: #f1f5e8; font-family: 'San Andreas Subtitles', Manrope, sans-serif; }
.wl-grove .wg-logo { position: absolute; left: 5vw; top: 6vh; z-index: 3; pointer-events: none; line-height: .82; animation: wg-in .7s .15s cubic-bezier(.2,.9,.3,1.2) both; }
@keyframes wg-in { from { opacity: 0; transform: scale(1.15); } }
.wl-grove .wg-logo .wg-p { display: block; font: 400 clamp(56px, 7.4vw, 118px)/.85 'San Andreas Pricedown', 'Bebas Neue', sans-serif; color: #fff; letter-spacing: .01em; -webkit-text-stroke: 3px #000; paint-order: stroke fill; text-shadow: 4px 5px 0 #000, 0 0 30px rgba(0,0,0,.5); }
.wl-grove .wg-logo .wg-p + .wg-p { margin-left: .4em; }
.wl-grove .wg-logo .wg-g { display: block; margin: 10px 0 0 .3em; font: 400 clamp(26px, 3vw, 46px)/1 'San Andreas Gothic', serif; color: #f2c12e; -webkit-text-stroke: 1.5px #000; paint-order: stroke fill; text-shadow: 3px 3px 0 #000; }
.wl-grove .wg-tag { position: absolute; left: 5.4vw; top: calc(6vh + clamp(170px, 21vw, 300px)); z-index: 3; max-width: 430px; font: 400 clamp(14px, 1.15vw, 17px)/1.4 'San Andreas Subtitles', Manrope, sans-serif; color: #fff; text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.wl-grove .wg-menu { position: absolute; right: 7vw; top: 50%; transform: translateY(-50%); z-index: 3; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; animation: wg-in .6s .35s both; }
.wl-grove .wg-mi { position: relative; background: none; border: 0; padding: 0 0 0 40px; font: 400 clamp(30px, 3.4vw, 50px)/1.15 'San Andreas Menu', 'Bebas Neue', sans-serif; color: #c8dff2; letter-spacing: .04em; -webkit-text-stroke: 2px #000; paint-order: stroke fill; text-shadow: 3px 3px 0 rgba(0,0,0,.85); transition: color .1s, transform .15s; text-transform: uppercase; }
.wl-grove .wg-mi.wg-sm { font-size: clamp(22px, 2.3vw, 34px); color: #9fb6c9; }
.wl-grove .wg-mi.wg-on, .wl-grove .wg-mi:focus-visible { color: #fff; transform: scale(1.06); outline: none; }
.wl-grove .wg-mi.wg-on::before, .wl-grove .wg-mi:focus-visible::before { content: ''; position: absolute; left: 8px; top: 50%; margin-top: -9px; border: 9px solid transparent; border-left: 14px solid #f2c12e; filter: drop-shadow(2px 2px 0 #000); }
.wl-grove .wg-gap { height: 18px; }
.wl-grove .wg-brief { position: absolute; left: 50%; bottom: 7vh; transform: translateX(-50%); z-index: 4; width: min(860px, 88vw); text-align: center; font: 400 clamp(16px, 1.4vw, 21px)/1.4 'San Andreas Subtitles', Manrope, sans-serif; color: #fff; text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; pointer-events: none; min-height: 3em; }
.wl-grove .wg-brief b { color: var(--c, #f2c12e); }
.wl-grove .wg-hud { position: absolute; right: 4vw; top: 4vh; z-index: 4; text-align: right; font: 400 clamp(26px, 2.4vw, 38px)/1 'San Andreas Pricedown', 'Bebas Neue', sans-serif; -webkit-text-stroke: 2px #000; paint-order: stroke fill; pointer-events: none; }
.wl-grove .wg-hud .wg-time { color: #fff; }
.wl-grove .wg-hud .wg-cash { color: #36b54a; margin-top: 4px; }
.wl-grove .wg-hud .wg-stars { margin-top: 6px; font: 26px/1 serif; color: #000; -webkit-text-stroke: 1.5px #dcdcdc; letter-spacing: 2px; }
.wl-grove .wg-foot { position: absolute; left: 5vw; bottom: 3vh; z-index: 4; display: flex; align-items: center; gap: 16px; font: 400 14px 'San Andreas Subtitles', Manrope, sans-serif; color: #fff; text-shadow: 1px 1px 0 #000; }
.wl-grove .wg-foot .wl-startup input { accent-color: #36b54a; }
.wl-grove .wg-load { position: absolute; inset: 0; z-index: 10; background: #000; transition: opacity .35s; }
.wl-grove .wg-load.wg-gone { opacity: 0; pointer-events: none; }
.wl-grove .wg-load .wg-ll { position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%); text-align: center; line-height: .82; }
.wl-grove .wg-load .wg-p { display: block; font: 400 clamp(60px, 8vw, 120px)/.85 'San Andreas Pricedown', 'Bebas Neue', sans-serif; color: #fff; -webkit-text-stroke: 3px #000; paint-order: stroke fill; text-shadow: 4px 5px 0 #262626; }
.wl-grove .wg-load .wg-g { display: block; margin-top: 12px; font: 400 clamp(26px, 3vw, 46px)/1 'San Andreas Gothic', serif; color: #f2c12e; }
.wl-grove .wg-bar { position: absolute; left: 50%; bottom: 9vh; width: min(560px, 70vw); height: 10px; transform: translateX(-50%); border: 2px solid #000; outline: 1px solid #666; background: #2a2a2a; }
.wl-grove .wg-bar i { display: block; height: 100%; width: 0; background: linear-gradient(180deg, #7bdc6a, #36b54a 60%, #1f7a2b); animation: wg-load 1.25s .1s ease-in-out forwards; }
@keyframes wg-load { to { width: 100%; } }
.wl-grove .wg-pass { position: absolute; left: 0; right: 0; top: 34%; z-index: 9; text-align: center; display: none; pointer-events: none; }
.wl-grove .wg-pass.wg-on { display: block; }
.wl-grove .wg-pass b { display: block; font: 400 clamp(56px, 7vw, 110px)/1 'San Andreas Pricedown', 'Bebas Neue', sans-serif; color: #f2c12e; -webkit-text-stroke: 3px #000; paint-order: stroke fill; text-shadow: 4px 4px 0 #000; animation: wg-pop .45s cubic-bezier(.2,1.8,.4,1) both; }
.wl-grove .wg-pass span { display: block; margin-top: 8px; font: 400 clamp(28px, 3vw, 44px)/1 'San Andreas Pricedown', sans-serif; color: #fff; -webkit-text-stroke: 2px #000; paint-order: stroke fill; animation: wg-pop .45s .2s cubic-bezier(.2,1.8,.4,1) both; }
@keyframes wg-pop { from { transform: scale(2.2); opacity: 0; } }
`,
  build(root, api) {
    const M = api.modes;
    const LIST = [
      ...M.map(m => ({ label: m.name, pick: m.id, key: m.key, tip: m.tip, brief: `<b style="--c:${m.color}">${m.name.toUpperCase()}:</b> ${m.desc} ${m.pts.join(', ')}.` })),
      { gap: true },
      { label: 'Load Game', act: 'open', sm: true, tip: api.actions[0].tip, brief: 'Load a saved <b>.strata</b> project and carry on where you left off.' },
      { label: 'Options', act: 'prefs', sm: true, key: 'Ctrl+,', tip: api.actions[3].tip, brief: 'Themes, sounds, fonts and the rest of the <b>Preferences</b>.' },
      { label: 'Controls', act: 'shortcuts', sm: true, key: '?', tip: api.actions[2].tip, brief: 'Every keyboard shortcut, in one list. <b>Ctrl+K</b> finds any command by name.' },
      { label: 'Continue', act: 'close', sm: true, key: 'Esc', tip: 'Close the welcome screen and keep working.', brief: 'Back to whatever you were working on. Everything autosaves.' },
    ];
    root.innerHTML = `
      <canvas class="wl-cv"></canvas>
      <div class="wg-logo"><span class="wg-p">Strata</span><span class="wg-p">Studio</span><span class="wg-g">Video · Audio · Image</span></div>
      <div class="wg-tag">${api.esc(api.tagline)}</div>
      <div class="wg-hud"><div class="wg-time"></div><div class="wg-cash">$00000000</div><div class="wg-stars">☆☆☆☆☆☆</div></div>
      <div class="wg-menu">${LIST.map((it, i) => it.gap ? '<div class="wg-gap"></div>' : `<button class="wg-mi${it.sm ? ' wg-sm' : ''}" data-i="${i}" ${it.pick ? `data-pick="${it.pick}"` : `data-act="${it.act}"`}${api.tip(it.label, it.tip, it.key)}>${it.label}</button>`).join('')}</div>
      <div class="wg-brief"></div>
      <div class="wg-foot"><span>Press 1 · 2 · 3 &nbsp;·&nbsp; ↑ ↓ Enter</span><span class="wg-su"></span></div>
      <div class="wg-pass"><b>Mission passed!</b><span>Respect +</span></div>
      <div class="wg-load"><div class="wg-ll"><span class="wg-p">Strata</span><span class="wg-p">Studio</span><span class="wg-g">Video · Audio · Image</span></div><div class="wg-bar"><i></i></div></div>`;
    root.querySelector('.wg-su').append(api.startup('Show at startup'));
    const items = [...root.querySelectorAll('.wg-mi')], brief = root.querySelector('.wg-brief'), load = root.querySelector('.wg-load');
    const time = root.querySelector('.wg-time'); const tick = () => { time.textContent = new Date().toTimeString().slice(0, 5); }; tick(); api.every(10000, tick);
    let sel = 0;
    const select = (k, quiet) => { sel = k; items.forEach((b, j) => b.classList.toggle('wg-on', j === k)); brief.innerHTML = LIST[+items[k].dataset.i].brief; if (!quiet) api.sound('tick'); };
    items.forEach((b, k) => { b.addEventListener('pointerenter', () => select(k)); b.addEventListener('focus', () => select(k, true)); });
    select(0, true);
    const endLoad = () => load.classList.add('wg-gone');
    if (api.reduce) endLoad(); else api.after(1450, endLoad);
    api.on(load, 'pointerdown', endLoad);

    /* ---------- Los Santos at sunset, printed in halftone ---------- */
    const S = api.canvas(root.querySelector('canvas'), 1.5), c = S.ctx;
    const dots = document.createElement('canvas'); dots.width = dots.height = 6;
    { const d = dots.getContext('2d'); d.fillStyle = 'rgba(40,10,0,.28)'; d.beginPath(); d.arc(3, 3, 1.4, 0, 7); d.fill(); }
    let dotPat = null;
    const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(11);
    const towers = Array.from({ length: 40 }, (_, i) => ({ u: i / 40 + rnd() * 0.01, w: 0.012 + rnd() * 0.026, h: (0.04 + rnd() ** 2.4 * 0.24) * (Math.abs(i / 40 - 0.36) < 0.12 ? 0.45 : 1), lit: Array.from({ length: 40 }, () => rnd() < 0.35) }));
    const palms = [[0.04, 1.0], [0.13, 0.86], [0.58, 0.78], [0.66, 0.92], [0.97, 0.95]];
    const palm = (x, base, s) => {
      c.save(); c.translate(x, base); c.scale(s, s);
      c.fillStyle = '#1a0d14';
      c.beginPath(); c.moveTo(-5, 0); c.quadraticCurveTo(14, -120, 26, -230); c.lineTo(32, -229); c.quadraticCurveTo(22, -120, 6, 0); c.closePath(); c.fill();
      for (let k = 0; k < 8; k++) { const a = -2.9 + k * 0.72; c.beginPath(); c.moveTo(29, -230); c.quadraticCurveTo(29 + Math.cos(a) * 60, -230 + Math.sin(a) * 34 - 26, 29 + Math.cos(a) * 112, -230 + Math.sin(a) * 66 + 34); c.quadraticCurveTo(29 + Math.cos(a) * 60, -230 + Math.sin(a) * 34 - 8, 29, -224); c.fill(); }
      c.restore();
    };
    api.loop(t => {
      const W = S.w, H = S.h, tt = api.reduce ? 0 : t, hz = H * 0.74;
      let g = c.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, '#2b1150'); g.addColorStop(0.35, '#a33a5e'); g.addColorStop(0.7, '#f07c3a'); g.addColorStop(1, '#ffc24b');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // sun + bands of cloud drifting
      const sx = W * 0.36, sy = hz - H * 0.08, R = H * 0.16;
      g = c.createRadialGradient(sx, sy, R * 0.2, sx, sy, R * 3); g.addColorStop(0, 'rgba(255,240,170,.9)'); g.addColorStop(0.3, 'rgba(255,200,90,.35)'); g.addColorStop(1, 'rgba(255,160,60,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, hz);
      c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(sx, sy, R, 0, 7); c.fill();
      c.fillStyle = 'rgba(120,30,70,.55)';
      for (let k = 0; k < 5; k++) { const y = H * (0.18 + k * 0.08), off = ((tt * (6 + k * 3) + k * 300) % (W + 600)) - 300; c.beginPath(); c.ellipse(off + W * 0.2 * k % W, y, W * 0.22, H * 0.012 + k * 1.5, 0, 0, 7); c.fill(); }
      // distant hills (Vinewood-ish)
      c.fillStyle = '#5a2a4a'; c.beginPath(); c.moveTo(0, hz);
      for (let x = 0; x <= W; x += 8) c.lineTo(x, hz - H * 0.07 - Math.sin(x * 0.004 + 1) * H * 0.04 - Math.sin(x * 0.013) * H * 0.012);
      c.lineTo(W, hz); c.fill();
      // skyline with lit windows
      for (const tw of towers) {
        const x = tw.u * W * 1.05 - W * 0.02, w = tw.w * W, h = tw.h * H, y = hz - h;
        c.fillStyle = '#26101e'; c.fillRect(x, y, w, h + 2);
        c.fillStyle = 'rgba(255,214,120,.75)';
        const cols = Math.max(1, Math.floor(w / 6)), rows = Math.floor(h / 9);
        for (let r = 1; r < rows; r++) for (let q = 0; q < cols; q++) if (tw.lit[(r * 7 + q) % 40]) c.fillRect(x + 2 + q * 6, y + r * 9, 2.4, 3);
      }
      // ground + road + power line
      g = c.createLinearGradient(0, hz, 0, H); g.addColorStop(0, '#2b1220'); g.addColorStop(1, '#0d0508');
      c.fillStyle = g; c.fillRect(0, hz, W, H - hz);
      c.strokeStyle = '#1a0d14'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, H * 0.3); c.quadraticCurveTo(W * 0.3, H * 0.38, W * 0.62, H * 0.27); c.quadraticCurveTo(W * 0.82, H * 0.33, W, H * 0.25); c.stroke();
      c.fillStyle = '#1a0d14'; c.fillRect(W * 0.62 - 3, H * 0.27, 6, hz - H * 0.27); c.fillRect(W * 0.62 - 24, H * 0.27, 48, 4);
      palms.forEach(([u, k]) => palm(W * u, H + 6, H / 820 * k));
      // halftone print + vignette
      if (!dotPat) dotPat = c.createPattern(dots, 'repeat');
      c.fillStyle = dotPat; c.fillRect(0, 0, W, H);
      g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    });
    return {
      key(e) {
        if (!load.classList.contains('wg-gone') && !['Escape', '1', '2', '3'].includes(e.key)) { endLoad(); return true; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { select((sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length); return true; }
        if (e.key === 'Enter') { items[sel].click(); return true; }
        return false;
      },
      leave(id) { endLoad(); select(M.findIndex(m => m.id === id), true); root.querySelector('.wg-pass').classList.add('wg-on'); api.sound('success'); return 950; },
    };
  },
};
})();
