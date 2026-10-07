/* Welcome screen — Frutiger Aero: a bright sky over a glossy green hill, soap bubbles drifting up, light swooshes
   flowing across, and three glossy glass orbs (with real reflections) for the editors. Point at an orb and it bounces
   while a frosted glass panel explains it; click it and it pops into bubbles. */
(() => {
const App = window.App;
App.WELCOMES.aero = {
  css: `
.wl-aero { background: linear-gradient(180deg, #1673d9 0%, #3aa0f0 34%, #9fdcff 66%, #e8f8ff 100%); color: #fff; font-family: 'Segoe UI', 'Frutiger', 'Myriad Pro', sans-serif; }
.wl-aero .wa-head { position: absolute; left: 6vw; top: 7vh; z-index: 3; animation: wa-float 1s .1s cubic-bezier(.2,.9,.3,1.2) both; }
@keyframes wa-float { from { opacity: 0; transform: translateY(24px) scale(.96); } }
.wl-aero .wa-head .wa-row { display: flex; align-items: center; gap: 16px; }
.wl-aero h1 { margin: 0; font: 300 clamp(40px, 4.6vw, 72px)/1 'Segoe UI Light', 'Segoe UI', sans-serif; letter-spacing: -.01em; background: linear-gradient(180deg, #ffffff 0%, #ffffff 48%, #d7f0ff 52%, #ffffff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 2px 6px rgba(0,60,140,.45)); }
.wl-aero h1 b { font-weight: 600; }
.wl-aero .wa-head p { margin: 12px 0 0 2px; font-size: clamp(13px, 1.1vw, 16px); color: #fff; text-shadow: 0 1px 4px rgba(0,50,120,.55); max-width: 520px; }
.wl-aero .wa-acts { position: absolute; right: 4vw; top: 7vh; z-index: 3; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; max-width: 48vw; }
.wl-aero .wa-jelly { position: relative; display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 16px; border-radius: 17px; border: 1px solid rgba(255,255,255,.85); color: #063a6e; font: 600 12.5px 'Segoe UI', sans-serif; background: linear-gradient(180deg, rgba(255,255,255,.95) 0%, rgba(255,255,255,.7) 49%, rgba(200,236,255,.75) 50%, rgba(235,250,255,.9) 100%); box-shadow: 0 3px 10px rgba(0,60,140,.25), inset 0 -2px 6px rgba(120,200,255,.35); transition: transform .25s cubic-bezier(.2,1.6,.4,1), box-shadow .2s; }
.wl-aero .wa-jelly:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 6px 16px rgba(0,60,140,.32), inset 0 -2px 8px rgba(120,200,255,.5), 0 0 14px rgba(255,255,255,.8); }
.wl-aero .wa-jelly kbd { font: 600 10px 'Segoe UI'; opacity: .6; }
.wl-aero .wa-jelly.wa-go { background: linear-gradient(180deg, #b8f27a 0%, #6fcf3a 49%, #3fae1b 50%, #6fd83c 100%); color: #fff; text-shadow: 0 1px 2px rgba(0,60,0,.5); border-color: rgba(255,255,255,.9); }
.wl-aero .wa-orbs { position: absolute; left: 0; right: 0; top: 30%; z-index: 3; display: flex; justify-content: center; gap: clamp(28px, 6vw, 110px); }
.wl-aero .wa-orb { display: flex; flex-direction: column; align-items: center; gap: 14px; background: none; border: 0; padding: 0; animation: wa-float 1s cubic-bezier(.2,.9,.3,1.3) both; }
.wl-aero .wa-orb:nth-child(1) { animation-delay: .25s; } .wl-aero .wa-orb:nth-child(2) { animation-delay: .38s; } .wl-aero .wa-orb:nth-child(3) { animation-delay: .51s; }
.wl-aero .wa-ball { position: relative; width: clamp(104px, 11vw, 168px); aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; color: #fff;
  background: radial-gradient(circle at 50% 120%, var(--c2) 0%, transparent 55%), radial-gradient(circle at 50% 45%, var(--c) 0%, var(--cd) 78%, var(--cdd) 100%);
  box-shadow: 0 14px 30px rgba(0,50,120,.35), inset 0 -10px 24px rgba(255,255,255,.35), inset 0 2px 2px rgba(255,255,255,.6);
  -webkit-box-reflect: below 10px linear-gradient(transparent 58%, rgba(255,255,255,.32));
  transition: transform .5s cubic-bezier(.2,1.8,.4,1), box-shadow .3s; }
.wl-aero .wa-ball::before { content: ''; position: absolute; left: 14%; right: 14%; top: 5%; height: 46%; border-radius: 50% 50% 46% 46% / 62% 62% 38% 38%; background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.08)); }
.wl-aero .wa-ball svg { position: relative; width: 40%; height: 40%; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
.wl-aero .wa-orb:hover .wa-ball, .wl-aero .wa-orb:focus-visible .wa-ball, .wl-aero .wa-orb.wa-on .wa-ball { transform: translateY(-10px) scale(1.08); box-shadow: 0 24px 40px rgba(0,50,120,.4), 0 0 40px var(--c2), inset 0 -10px 24px rgba(255,255,255,.4), inset 0 2px 2px rgba(255,255,255,.7); }
.wl-aero .wa-orb:focus-visible { outline: none; }
.wl-aero .wa-orb.wa-pop .wa-ball { transform: scale(1.5); opacity: 0; transition: transform .35s ease-out, opacity .3s; }
.wl-aero .wa-lbl { margin-top: clamp(40px, 5vw, 70px); padding: 5px 18px; border-radius: 14px; font: 600 clamp(15px, 1.3vw, 19px) 'Segoe UI', sans-serif; color: #fff; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.6); backdrop-filter: blur(6px); text-shadow: 0 1px 3px rgba(0,50,120,.5); box-shadow: inset 0 1px 0 rgba(255,255,255,.6); }
.wl-aero .wa-lbl kbd { margin-left: 8px; font: 700 11px 'Segoe UI'; opacity: .75; }
.wl-aero .wa-glass { position: absolute; left: 50%; bottom: 5.5vh; z-index: 4; transform: translateX(-50%); width: min(720px, 90vw); border-radius: 10px; padding: 0 0 14px; color: #08294a; background: rgba(220,242,255,.42); border: 1px solid rgba(255,255,255,.85); backdrop-filter: blur(16px) saturate(1.7); box-shadow: 0 16px 40px rgba(0,50,120,.28), inset 0 1px 0 rgba(255,255,255,.9), inset 0 0 0 1px rgba(120,190,240,.35); overflow: hidden; animation: wa-float .9s .6s cubic-bezier(.2,.9,.3,1.1) both; }
.wl-aero .wa-bar { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 8px 0 14px; background: linear-gradient(180deg, rgba(255,255,255,.75), rgba(255,255,255,.25) 50%, rgba(170,220,255,.25) 51%, rgba(255,255,255,.35)); border-bottom: 1px solid rgba(255,255,255,.7); font: 400 12.5px 'Segoe UI'; color: #063a6e; }
.wl-aero .wa-bar .wa-sp { flex: 1; }
.wl-aero .wa-x { width: 42px; height: 19px; border-radius: 4px; border: 1px solid rgba(80,20,10,.5); background: linear-gradient(180deg, #f0a597, #d9583f 50%, #c63a1f 51%, #e26a4a); color: #fff; display: grid; place-items: center; box-shadow: inset 0 1px 0 rgba(255,255,255,.6); }
.wl-aero .wa-x:hover { background: linear-gradient(180deg, #ffb7a8, #ec6a4f 50%, #dd4527 51%, #f57d5c); }
.wl-aero .wa-body { padding: 12px 18px 0; display: grid; grid-template-columns: 1fr auto; gap: 6px 18px; align-items: start; min-height: 96px; }
.wl-aero .wa-body h3 { margin: 0; font: 600 18px 'Segoe UI'; color: #063a6e; }
.wl-aero .wa-body p { margin: 2px 0 0; font-size: 13px; color: #18436b; }
.wl-aero .wa-body ul { margin: 8px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 3px 18px; font-size: 12.5px; color: #183f63; }
.wl-aero .wa-body li::before { content: '✓'; display: inline-grid; place-items: center; width: 15px; height: 15px; margin-right: 6px; border-radius: 50%; font-size: 10px; color: #fff; background: radial-gradient(circle at 40% 30%, #a6ef6a, #2f9b16); box-shadow: 0 1px 2px rgba(0,60,0,.3); }
.wl-aero .wa-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; font-size: 12px; color: #18436b; }
.wl-aero .wl-startup input { accent-color: #1d86ff; }
`,
  build(root, api) {
    const M = api.modes;
    const deep = M.map(m => api.mix(m.color, '#00204a', 0.35)), deeper = M.map(m => api.mix(m.color, '#001030', 0.62)), glow = M.map(m => api.mix(m.color, '#ffffff', 0.55));
    root.innerHTML = `
      <canvas class="wl-cv"></canvas>
      <div class="wa-head"><div class="wa-row">${api.logo(58, M.map(m => m.color))}<h1>Strata <b>Studio</b></h1></div><p>${api.esc(api.tagline)}</p></div>
      <div class="wa-acts">${api.actions.map(a => `<button class="wa-jelly" data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${api.icon(a.icon, 15)}${a.label}${a.key ? `<kbd>${a.key}</kbd>` : ''}</button>`).join('')}</div>
      <div class="wa-orbs">${M.map((m, i) => `<button class="wa-orb" data-pick="${m.id}" aria-label="Open the ${m.name} editor" style="--c:${m.color};--cd:${deep[i]};--cdd:${deeper[i]};--c2:${glow[i]}"${api.tip(m.name + ' editor', m.tip, m.key)}><span class="wa-ball">${api.icon(m.icon, 64, 1.7)}</span><span class="wa-lbl">${m.name}<kbd>${m.key}</kbd></span></button>`).join('')}</div>
      <div class="wa-glass"><div class="wa-bar">${api.logo(16, M.map(m => m.color))}<span class="wa-t">Welcome Center</span><span class="wa-sp"></span><button class="wa-x" data-act="close"${api.tip('Close', 'Close the welcome screen and keep working.', 'Esc')}>${api.icon('x', 12, 3)}</button></div>
        <div class="wa-body"><div class="wa-info"></div><div class="wa-side"><span class="wa-su"></span><button class="wa-jelly wa-go" data-act="close"${api.tip('Continue', 'Close the welcome screen and go back to what you were doing.', 'Esc')}>Continue</button></div></div></div>`;
    root.querySelector('.wa-su').append(api.startup('Show at startup'));
    const info = root.querySelector('.wa-info'), orbs = [...root.querySelectorAll('.wa-orb')];
    const idle = () => { info.innerHTML = `<h3>Get started with Strata Studio</h3><p>Choose a bubble to open an editor — or press 1, 2 or 3. Everything you make is saved automatically.</p><ul><li>Works without the internet</li><li>Your files stay on this computer</li><li>Hover anything for an explanation</li><li>Ctrl+K finds any command</li></ul>`; };
    const show = i => { const m = M[i]; info.innerHTML = `<h3>${m.name} editor</h3><p>${m.desc}</p><ul>${m.pts.map(p => `<li>${p}</li>`).join('')}</ul>`; };
    idle();
    let hover = -1;
    orbs.forEach((o, i) => {
      o.addEventListener('pointerenter', () => { hover = i; show(i); burst(i, 6); api.sound('tick'); });
      o.addEventListener('pointerleave', () => { if (hover === i) { hover = -1; idle(); } });
      o.addEventListener('focus', () => { hover = i; show(i); orbs.forEach((x, k) => x.classList.toggle('wa-on', k === i)); });
      o.addEventListener('blur', () => { o.classList.remove('wa-on'); });
    });

    /* ---------- the sky: swooshes, sun glare, hill, bubbles ---------- */
    const S = api.canvas(root.querySelector('canvas')), c = S.ctx;
    const bubbles = [];
    const mkBubble = (x, y, r, vy, burstFrom) => ({ x, y, r, vy, vx: (Math.random() - 0.5) * (burstFrom ? 60 : 8), ph: Math.random() * 7, hue: Math.random() * 360, life: burstFrom ? 1.6 + Math.random() : 1e9 });
    for (let i = 0; i < 34; i++) bubbles.push(mkBubble(Math.random(), Math.random(), 6 + Math.random() * 26, 10 + Math.random() * 26));
    const burst = (i, n) => {
      const r = orbs[i].querySelector('.wa-ball').getBoundingClientRect(), rr = root.getBoundingClientRect();
      for (let k = 0; k < n; k++) { const a = Math.random() * 7, d = r.width * 0.4 * Math.random(); bubbles.push(Object.assign(mkBubble((r.left - rr.left + r.width / 2 + Math.cos(a) * d) / S.w, (r.top - rr.top + r.height / 2 + Math.sin(a) * d) / S.h, 4 + Math.random() * 14, 40 + Math.random() * 60, true), { abs: true })); }
    };
    const drawBubble = (x, y, r, hue, a) => {
      c.globalAlpha = a;
      const g = c.createRadialGradient(x, y, r * 0.55, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.82, `hsla(${hue},90%,82%,.18)`); g.addColorStop(0.95, `hsla(${(hue + 120) % 360},90%,90%,.55)`); g.addColorStop(1, 'rgba(255,255,255,.75)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(x + r * 0.42, y + r * 0.4, r * 0.08, 0, 7); c.fill();
      c.globalAlpha = 1;
    };
    api.loop((t, dt) => {
      const W = S.w, H = S.h, tt = api.reduce ? 0 : t;
      c.clearRect(0, 0, W, H);
      // sun glare + lens flare (top right)
      const sx = W * 0.88, sy = H * 0.06;
      let g = c.createRadialGradient(sx, sy, 0, sx, sy, W * 0.45); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.08, 'rgba(255,255,255,.55)'); g.addColorStop(0.35, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.save(); c.globalCompositeOperation = 'lighter';
      [[0.18, 26, 'rgba(160,255,200,.10)'], [0.33, 14, 'rgba(255,220,160,.12)'], [0.52, 46, 'rgba(140,200,255,.08)'], [0.7, 10, 'rgba(255,255,255,.14)']].forEach(([k, r, col]) => { const x = sx + (W * 0.45 - sx) * k, y = sy + (H * 0.55 - sy) * k; c.fillStyle = col; c.beginPath(); c.arc(x, y, r * (H / 900 + 0.4), 0, 7); c.fill(); });
      // light swooshes (aurora-like ribbons)
      for (let k = 0; k < 3; k++) {
        const y0 = H * (0.5 + k * 0.07), amp = H * (0.07 + k * 0.025), ph = tt * (0.18 + k * 0.05) + k * 2;
        const top = [], bot = [];
        for (let x = -20; x <= W + 20; x += 20) { const u = x / W; const y = y0 + Math.sin(u * 4.2 + ph) * amp - Math.sin(u * 1.6 - ph * 0.7) * amp * 0.6 - u * H * 0.12; const th = (14 + 22 * Math.sin(u * 3 + ph * 1.3 + k) ** 2) * (H / 900 + 0.3); top.push([x, y - th]); bot.push([x, y + th]); }
        const lg = c.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.35, `rgba(255,255,255,${0.16 - k * 0.03})`); lg.addColorStop(0.7, `rgba(210,250,255,${0.22 - k * 0.04})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = lg; c.beginPath(); top.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); bot.reverse().forEach(([x, y]) => c.lineTo(x, y)); c.closePath(); c.fill();
      }
      c.restore();
      // glossy hill
      const hy = H * 0.8;
      const hillPath = (off, k) => { c.beginPath(); c.moveTo(-10, H + 10); c.lineTo(-10, hy + off); c.bezierCurveTo(W * 0.25, hy - H * 0.12 * k + off, W * 0.55, hy + H * 0.08 * k + off, W + 10, hy - H * 0.05 * k + off); c.lineTo(W + 10, H + 10); c.closePath(); };
      hillPath(H * 0.04, 0.6); c.fillStyle = '#4fa83a'; c.fill();
      hillPath(0, 1);
      g = c.createLinearGradient(0, hy - H * 0.12, 0, H); g.addColorStop(0, '#a6ec5e'); g.addColorStop(0.35, '#5cc232'); g.addColorStop(1, '#1f7a14');
      c.fillStyle = g; c.fill();
      c.save(); c.clip();
      g = c.createLinearGradient(0, hy - H * 0.12, 0, hy + H * 0.06); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, hy - H * 0.14, W, H * 0.2);
      c.restore();
      // bubbles
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (!api.reduce) { b.y -= (b.vy * dt) / H; b.x += (Math.sin(tt * 0.8 + b.ph) * 6 + b.vx) * dt / W; b.vx *= 0.97; b.life -= dt; }
        if (b.y < -0.1 && !b.abs) { b.y = 1.08; b.x = Math.random(); }
        if (b.life <= 0 || b.y < -0.2) { bubbles.splice(i, 1); continue; }
        drawBubble(b.x * W, b.y * H, b.r * (0.6 + H / 1800), (b.hue + tt * 20) % 360, Math.min(1, b.life) * 0.95);
      }
    });
    return {
      key(e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = hover < 0 ? 0 : (hover + (e.key === 'ArrowRight' ? 1 : 2)) % 3; orbs[n].focus(); return true; }
        return false;
      },
      leave(id) { const i = M.findIndex(m => m.id === id); burst(i, 26); orbs[i].classList.add('wa-pop'); return 420; },
    };
  },
};
})();
