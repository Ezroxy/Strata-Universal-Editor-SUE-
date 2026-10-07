/* Welcome screen — Film Noir: opening titles. Letterbox bars with a running timecode, film grain and flicker,
   venetian-blind light across the wall, a slow ceiling-fan shadow and rain on the window. "A Strata Studio
   production", then the title in L.A. Noire type and the three editors billed like stars; point at one and it fills
   with its footage while the credits list what it does. Any key or click skips the intro. */
(() => {
const App = window.App;
App.WELCOMES.noir = {
  css: `
.wl-noir { background: #000; color: #ece6da; font-family: 'L.A. Noire Subtitles', Manrope, sans-serif; }
.wl-noir .wz-frame { position: absolute; left: 0; right: 0; top: 11vh; bottom: 11vh; overflow: hidden; background: radial-gradient(ellipse at 38% 45%, #24201b, #0b0a09 72%); }
.wl-noir[data-fx="on"] .wz-frame { animation: wz-weave .12s steps(2) infinite, wz-flicker 3.2s infinite; }
@keyframes wz-weave { 50% { transform: translate(.4px, -.5px); } }
@keyframes wz-flicker { 0%, 100% { filter: brightness(1); } 47% { filter: brightness(1.06); } 48% { filter: brightness(.93); } 49% { filter: brightness(1.03); } }
.wl-noir .wz-blinds { position: absolute; inset: -20%; background: repeating-linear-gradient(-28deg, transparent 0 38px, rgba(255,246,225,.075) 38px 74px); -webkit-mask-image: radial-gradient(ellipse 55% 60% at 62% 42%, #000 20%, transparent 75%); mask-image: radial-gradient(ellipse 55% 60% at 62% 42%, #000 20%, transparent 75%); animation: wz-drift 22s ease-in-out infinite alternate; }
@keyframes wz-drift { to { transform: translate(-40px, 18px); } }
.wl-noir .wz-fan { position: absolute; right: -6vw; top: -18vh; width: 70vh; height: 70vh; border-radius: 50%; opacity: .35; filter: blur(9px); background: conic-gradient(from 0deg, rgba(0,0,0,.95) 0 9deg, transparent 9deg 90deg, rgba(0,0,0,.95) 90deg 99deg, transparent 99deg 180deg, rgba(0,0,0,.95) 180deg 189deg, transparent 189deg 270deg, rgba(0,0,0,.95) 270deg 279deg, transparent 279deg); -webkit-mask-image: radial-gradient(circle, #000 55%, transparent 70%); mask-image: radial-gradient(circle, #000 55%, transparent 70%); animation: wz-fan 7s linear infinite; }
@keyframes wz-fan { to { transform: rotate(1turn); } }
.wl-noir canvas.wz-rain { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .5; }
.wl-noir canvas.wz-grain { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .13; mix-blend-mode: screen; pointer-events: none; z-index: 5; }
.wl-noir .wz-vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, transparent 42%, rgba(0,0,0,.8)); pointer-events: none; z-index: 4; }
.wl-noir .wz-bar { position: absolute; left: 0; right: 0; height: 11vh; background: #000; z-index: 10; display: flex; align-items: center; gap: 24px; padding: 0 4vw; font: 400 12px 'L.A. Noire Typewriter', 'Courier New', monospace; letter-spacing: .24em; color: #8a8174; }
.wl-noir .wz-bar.wz-top { top: 0; } .wl-noir .wz-bar.wz-bot { bottom: 0; }
.wl-noir .wz-bar .wz-grow { flex: 1; }
.wl-noir .wz-bar button { background: none; border: 0; padding: 4px 0; font: inherit; letter-spacing: inherit; color: #c9bba3; text-transform: uppercase; transition: color .2s; }
.wl-noir .wz-bar button:hover { color: #fff3dd; text-decoration: underline; text-underline-offset: 5px; text-decoration-color: #c9a96e; }
.wl-noir .wz-rec { color: #b3302a; }
.wl-noir .wl-startup { letter-spacing: .12em; color: #a89e8f; } .wl-noir .wl-startup input { accent-color: #c9a96e; }
.wl-noir .wz-pre { position: absolute; inset: 0; display: grid; place-items: center; z-index: 3; font: 400 clamp(13px, 1.2vw, 17px) 'L.A. Noire Typewriter', 'Courier New', monospace; letter-spacing: .6em; color: #c9bba3; opacity: 0; animation: wz-pre 1.7s ease forwards; pointer-events: none; }
@keyframes wz-pre { 0% { opacity: 0; } 20% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
.wl-noir .wz-title { position: absolute; left: 6vw; top: 50%; transform: translateY(-50%); z-index: 3; animation: wz-in 1.6s 1.25s cubic-bezier(.2,.8,.2,1) both; }
@keyframes wz-in { from { opacity: 0; filter: blur(10px); transform: translateY(-46%); } }
.wl-noir .wz-title h1 { margin: 0; font: 400 clamp(76px, 10vw, 168px)/.84 'L.A. Noire Heroic', 'Bebas Neue', sans-serif; letter-spacing: .01em; background: linear-gradient(100deg, #efe4cc 0%, #fff8e9 40%, #c9a96e 50%, #efe4cc 62%) 0 0 / 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: wz-sheen 6s 3s ease-in-out infinite; }
@keyframes wz-sheen { 0% { background-position: 100% 0; } 60%, 100% { background-position: -100% 0; } }
.wl-noir .wz-title .wz-st { font: 400 clamp(13px, 1.1vw, 17px) 'L.A. Noire Typewriter', monospace; letter-spacing: 1.1em; color: #b9a98e; margin: 16px 0 0 8px; }
.wl-noir .wz-title p { margin: 30px 0 0 6px; max-width: 420px; font: 400 clamp(14px, 1.15vw, 17px)/1.6 'L.A. Noire Subtitles', Manrope, sans-serif; color: #a89e8f; }
.wl-noir .wz-credit { margin: 26px 0 0 6px; min-height: 70px; max-width: 470px; font: 400 12px/2.1 'L.A. Noire Typewriter', monospace; letter-spacing: .18em; color: #c9bba3; }
.wl-noir .wz-credit em { font-style: normal; color: #6d6458; display: block; letter-spacing: .5em; }
.wl-noir .wz-words { position: absolute; right: 5vw; top: 50%; transform: translateY(-50%); z-index: 3; display: flex; flex-direction: column; align-items: flex-end; }
.wl-noir .wz-w { position: relative; background: none; border: 0; padding: 0; font: 400 clamp(80px, 15vh, 170px)/.9 'L.A. Noire Heroic', 'Bebas Neue', sans-serif; animation: wz-word 1.2s cubic-bezier(.2,.8,.2,1) both; transition: opacity .5s; text-align: right; }
.wl-noir .wz-w:nth-child(1) { animation-delay: 1.75s; } .wl-noir .wz-w:nth-child(2) { animation-delay: 1.95s; } .wl-noir .wz-w:nth-child(3) { animation-delay: 2.15s; }
@keyframes wz-word { from { opacity: 0; transform: translateX(60px); filter: blur(6px); } }
.wl-noir .wz-w .wz-t { display: inline-block; letter-spacing: .02em; color: transparent; -webkit-text-stroke: 1.5px rgba(236,230,218,.55); transition: -webkit-text-stroke-color .4s, letter-spacing .6s cubic-bezier(.2,1,.3,1); background-size: 220% 220%; -webkit-background-clip: text; background-clip: text; }
.wl-noir .wz-w .wz-n { position: absolute; left: -58px; top: 18%; font: 400 12px 'L.A. Noire Typewriter', monospace; letter-spacing: .2em; color: #6d6458; }
.wl-noir .wz-words:hover .wz-w, .wl-noir .wz-words.wz-hov .wz-w { opacity: .2; }
.wl-noir .wz-words .wz-w:hover, .wl-noir .wz-words .wz-w.wz-on, .wl-noir .wz-w:focus-visible { opacity: 1; outline: none; }
.wl-noir .wz-w:hover .wz-t, .wl-noir .wz-w.wz-on .wz-t, .wl-noir .wz-w:focus-visible .wz-t { -webkit-text-stroke-color: transparent; letter-spacing: .06em; animation: wz-footage 6s linear infinite; }
.wl-noir .wz-w.wz-video:is(:hover, .wz-on, :focus-visible) .wz-t { background-image: radial-gradient(circle at 30% 40%, #fff 0 5%, transparent 28%), repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 2px, transparent 2px 5px), linear-gradient(120deg, #f4ecda, #8f887c 40%, #fffaf0 60%, #5d574e); }
.wl-noir .wz-w.wz-audio:is(:hover, .wz-on, :focus-visible) .wz-t { background-image: repeating-linear-gradient(90deg, #e7cc93 0 5px, #8c6d33 5px 8px, #f6e3b4 8px 11px, #6e5524 11px 16px), linear-gradient(#f6e3b4, #8c6d33); background-blend-mode: overlay; }
.wl-noir .wz-w.wz-image:is(:hover, .wz-on, :focus-visible) .wz-t { background-image: radial-gradient(circle at 70% 70%, #ffd2c4 0 4%, transparent 18%), radial-gradient(circle at 40% 40%, #e2483d 0 22%, transparent 60%), linear-gradient(140deg, #3d0b08, #b3302a 45%, #f06a5c 70%, #5a110c); }
@keyframes wz-footage { 0% { background-position: 0% 50%; } 50% { background-position: 100% 30%; } 100% { background-position: 0% 50%; } }
`,
  build(root, api) {
    const M = api.modes;
    root.dataset.fx = api.fx ? 'on' : 'off';
    const IDLE = '<em>STARRING</em>VIDEO · AUDIO · IMAGE';
    root.innerHTML = `
      <div class="wz-bar wz-top"><span class="wz-rec">● REC</span><span class="wz-tc">00:00:00:00</span><span class="wz-grow"></span><span>REEL 1 · SCENE 1 · TAKE 1</span><span class="wz-grow"></span><span>2.39 : 1</span></div>
      <div class="wz-frame">
        <div class="wz-blinds"></div><div class="wz-fan"></div><canvas class="wz-rain"></canvas>
        <div class="wz-pre">A STRATA STUDIO PRODUCTION</div>
        <div class="wz-title"><h1>Strata</h1><div class="wz-st">STUDIO</div><p>${api.esc(api.tagline)}</p><div class="wz-credit">${IDLE}</div></div>
        <div class="wz-words">${M.map((m, i) => `<button class="wz-w wz-${m.id}" data-pick="${m.id}" aria-label="Open the ${m.name} editor"${api.tip(m.name + ' editor', m.tip, m.key)}><span class="wz-n">0${i + 1}</span><span class="wz-t">${m.name.toUpperCase()}</span></button>`).join('')}</div>
        <canvas class="wz-grain"></canvas><div class="wz-vig"></div>
      </div>
      <div class="wz-bar wz-bot"><span>PRESS 1 · 2 · 3</span><span class="wz-grow"></span>${api.actions.map(a => `<button data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${a.short}</button>`).join('')}<span class="wz-su"></span><button data-act="close"${api.tip('Continue', 'Close the welcome screen and keep working.', 'Esc')}>CONTINUE (ESC)</button></div>`;
    root.querySelector('.wz-su').append(api.startup('AT STARTUP'));
    const credit = root.querySelector('.wz-credit'), words = root.querySelector('.wz-words'), ws = [...root.querySelectorAll('.wz-w')];
    const hl = i => { words.classList.toggle('wz-hov', i >= 0); ws.forEach((w, k) => w.classList.toggle('wz-on', k === i)); credit.innerHTML = i < 0 ? IDLE : `<em>FEATURING</em>${M[i].pts.map(p => p.toUpperCase()).join(' · ')}`; };
    ws.forEach((w, i) => { w.addEventListener('pointerenter', () => hl(i)); w.addEventListener('pointerleave', () => hl(-1)); w.addEventListener('focus', () => hl(i)); w.addEventListener('blur', () => hl(-1)); });
    ['L.A. Noire Heroic', 'L.A. Noire Typewriter', 'L.A. Noire Subtitles'].forEach(f => App.ensureFont && App.ensureFont(f));
    // skip the intro on the first key / click
    const skip = () => { for (const a of root.getAnimations({ subtree: true })) { try { const t = a.effect.getComputedTiming(); if (isFinite(t.endTime) && a.playState !== 'finished') a.finish(); } catch {} } };
    if (api.reduce) skip();
    let skipped = false;
    api.on(root, 'pointerdown', () => { if (!skipped) { skipped = true; skip(); } }, true);
    // grain at 24 fps + running timecode
    const g = root.querySelector('.wz-grain'), gx = g.getContext('2d'), tc = root.querySelector('.wz-tc');
    let f = 0;
    const gsize = () => { g.width = Math.ceil(g.clientWidth / 2) || 1; g.height = Math.ceil(g.clientHeight / 2) || 1; };
    gsize(); api.on(window, 'resize', gsize);
    api.every(1000 / 24, () => {
      if (api.fx && !api.reduce) {
        const id = gx.createImageData(g.width, g.height), d = id.data;
        for (let i = 0; i < d.length; i += 4) { const v = Math.random() < 0.5 ? Math.random() * 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        gx.putImageData(id, 0, 0);
        if (Math.random() < 0.3) { gx.fillStyle = 'rgba(255,255,255,.9)'; gx.beginPath(); gx.arc(Math.random() * g.width, Math.random() * g.height, 1 + Math.random() * 2, 0, 7); gx.fill(); }
        if (Math.random() < 0.12) { gx.fillStyle = 'rgba(255,255,255,.6)'; gx.fillRect(Math.random() * g.width, 0, 1, g.height); }
      }
      f++; const s = Math.floor(f / 24);
      tc.textContent = `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f % 24).padStart(2, '0')}`;
    });
    // rain on the window
    const R = api.canvas(root.querySelector('.wz-rain'), 1), rc = R.ctx;
    const drops = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), l: 10 + Math.random() * 26, v: 0.5 + Math.random() * 0.8 }));
    const beads = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.4 }));
    api.loop((t, dt) => {
      const W = R.w, H = R.h;
      rc.clearRect(0, 0, W, H);
      rc.strokeStyle = 'rgba(220,215,200,.35)'; rc.lineWidth = 1;
      rc.beginPath();
      for (const d of drops) { if (!api.reduce) { d.y += d.v * dt; d.x -= d.v * dt * 0.12; if (d.y > 1.05) { d.y = -0.05; d.x = Math.random() * 1.1; } } const x = d.x * W, y = d.y * H; rc.moveTo(x, y); rc.lineTo(x - d.l * 0.2, y + d.l); }
      rc.stroke();
      rc.fillStyle = 'rgba(230,225,210,.25)';
      for (const b of beads) { rc.beginPath(); rc.arc(b.x * W, b.y * H, b.r, 0, 7); rc.fill(); }
    });
    return {
      key(e) {
        if (!skipped && !['Escape', '1', '2', '3'].includes(e.key)) { skipped = true; skip(); return true; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const cur = ws.indexOf(document.activeElement), dn = e.key === 'ArrowDown'; ws[cur < 0 ? (dn ? 0 : 2) : (cur + (dn ? 1 : 2)) % 3].focus(); return true; }
        return false;
      },
      leave(id) { skip(); hl(M.findIndex(m => m.id === id)); return 420; },
    };
  },
};
})();
