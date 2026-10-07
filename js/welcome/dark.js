/* Welcome screen — Strata Dark: "Sediment". The three editors settle in as layers of rock, one at a time;
   point at a layer and it swells to show what's inside. Every project is built in layers. */
(() => {
const App = window.App;
App.WELCOMES.dark = {
  css: `
.wl-dark { background: #0c0d11; color: #f4f0e8; font-family: Manrope, sans-serif; }
.wl-dark header { position: absolute; left: 6vw; top: 8vh; z-index: 2; pointer-events: none; }
.wl-dark h1 { margin: 0; font: italic 700 clamp(54px, 7.4vw, 118px)/.9 'Playfair Display', serif; letter-spacing: -.02em; animation: wld-rise 1.1s .15s cubic-bezier(.2,.8,.2,1) both; }
.wl-dark h1 span { display: block; font: 800 clamp(13px, 1.1vw, 17px)/1 Manrope; letter-spacing: .62em; font-style: normal; color: #b9b4aa; margin: 14px 0 0 6px; }
.wl-dark header p { margin: 22px 0 0 4px; max-width: 520px; color: #a9a49b; font-size: clamp(13px, 1.05vw, 16px); line-height: 1.6; animation: wld-rise 1.1s .35s cubic-bezier(.2,.8,.2,1) both; }
.wl-dark header .wd-depth { position: absolute; left: -3.3vw; top: 6px; bottom: -14px; width: 1px; background: linear-gradient(#fff3, transparent); }
@keyframes wld-rise { from { opacity: 0; transform: translateY(16px); filter: blur(6px); } }
.wl-dark nav { position: absolute; right: 5vw; top: 8vh; z-index: 3; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; max-width: 60vw; }
.wl-dark nav button { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04); color: #e9e4da; font: 700 12px Manrope; backdrop-filter: blur(6px); transition: background .2s, border-color .2s; }
.wl-dark nav button:hover, .wl-dark nav button:focus-visible { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.3); }
.wl-dark nav kbd { font: 600 10px 'JetBrains Mono'; opacity: .55; }
.wl-dark .wd-lab { position: absolute; left: 0; right: 0; z-index: 2; display: flex; align-items: flex-start; padding: 0 6vw; transition: opacity .3s; outline-offset: -6px; }
.wl-dark .wd-lab .wd-num { font: 600 12px 'JetBrains Mono'; letter-spacing: .2em; opacity: .7; width: 64px; padding-top: 1.4vw; }
.wl-dark .wd-lab .wd-nm { font: 400 clamp(46px, 6.4vw, 104px)/1 'Bebas Neue', sans-serif; letter-spacing: .03em; text-shadow: 0 2px 30px rgba(0,0,0,.25); }
.wl-dark .wd-lab .wd-more { margin-left: 5vw; padding-top: 1.1vw; max-width: 560px; opacity: 0; transform: translateY(10px); transition: opacity .35s, transform .45s cubic-bezier(.2,1,.3,1); pointer-events: none; }
.wl-dark .wd-lab.wd-open .wd-more { opacity: 1; transform: none; }
.wl-dark .wd-lab .wd-more p { margin: 0 0 12px; font-size: clamp(14px, 1.15vw, 18px); font-weight: 650; line-height: 1.45; }
.wl-dark .wd-lab .wd-more ul { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 22px; }
.wl-dark .wd-lab .wd-more li { font-size: 13px; font-weight: 600; opacity: .85; display: flex; gap: 8px; align-items: baseline; }
.wl-dark .wd-lab .wd-more li::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .6; transform: translateY(-1px); flex: none; }
.wl-dark .wd-lab .wd-go { margin-left: auto; padding-top: 1.3vw; display: flex; align-items: center; gap: 10px; font: 800 13px Manrope; letter-spacing: .08em; text-transform: uppercase; opacity: 0; transition: opacity .3s; }
.wl-dark .wd-lab.wd-open .wd-go { opacity: 1; }
.wl-dark .wd-lab .wd-go i { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,.22); }
.wl-dark .wd-foot { position: absolute; z-index: 3; right: 5vw; top: calc(8vh + 48px); display: flex; align-items: center; gap: 14px; }
.wl-dark .wd-hint { margin: 26px 0 0 4px; font: 600 10.5px 'JetBrains Mono'; letter-spacing: .16em; color: rgba(255,255,255,.45); animation: wld-rise 1.1s .5s cubic-bezier(.2,.8,.2,1) both; }
.wl-dark .wd-foot .wl-startup { letter-spacing: .06em; text-transform: none; font: 600 11.5px Manrope; color: rgba(255,255,255,.75); accent-color: #ff7849; }
.wl-dark .wd-foot button { height: 32px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); background: rgba(10,10,12,.35); color: #fff; font: 700 11.5px Manrope; letter-spacing: .04em; backdrop-filter: blur(6px); }
.wl-dark .wd-foot button:hover { background: rgba(10,10,12,.6); }
`,
  build(root, api) {
    const M = api.modes;
    const deep = M.map(m => api.mix(m.color, '#1a0d08', 0.45)), light = M.map(m => api.mix(m.color, '#ffffff', 0.45));
    root.innerHTML = `
      <canvas class="wl-cv"></canvas>
      <header><div class="wd-depth"></div><h1>Strata<span>STUDIO</span></h1><p>${api.esc(api.tagline)}</p><div class="wd-hint">EVERY PROJECT IS BUILT IN LAYERS · PRESS 1 · 2 · 3</div></header>
      <nav>${api.actions.map(a => `<button data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${api.icon(a.icon, 15)}${a.label}${a.key ? `<kbd>${a.key}</kbd>` : ''}</button>`).join('')}</nav>
      ${M.map((m, i) => `<div class="wd-lab" data-pick="${m.id}" tabindex="0" role="button" aria-label="Open the ${m.name} editor" style="color:${api.inkOn(m.color)}">
        <div class="wd-num">0${i + 1}</div><div class="wd-nm">${m.name}</div>
        <div class="wd-more"><p>${m.desc}</p><ul>${m.pts.map(p => `<li>${p}</li>`).join('')}</ul></div>
        <div class="wd-go"${api.tip('Open ' + m.name, m.tip, m.key)}>Open ${m.name}<i>${api.icon('chevRight', 18, 2.4)}</i></div></div>`).join('')}
      <div class="wd-foot"></div>`;
    const foot = root.querySelector('.wd-foot');
    foot.append(api.startup(), api.el(`<button data-act="close"${api.tip('Continue', 'Close the welcome screen and keep working where you left off.', 'Esc')}>Continue · Esc</button>`));
    const S = api.canvas(root.querySelector('canvas')), ctx = S.ctx;
    const labels = [...root.querySelectorAll('.wd-lab')];
    // film grain tile + fixed sediment specks
    const grain = document.createElement('canvas'); grain.width = grain.height = 220;
    { const g = grain.getContext('2d'), id = g.createImageData(220, 220); for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } g.putImageData(id, 0, 0); }
    const grainPat = ctx.createPattern(grain, 'repeat');
    const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
    const specks = M.map(() => Array.from({ length: 120 }, () => ({ u: rnd(), v: rnd(), r: 0.6 + rnd() * 2.4, a: 0.1 + rnd() * 0.25, d: rnd() < 0.5 })));
    const dust = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.4, s: 0.2 + Math.random() * 0.8, p: Math.random() * 6 }));
    let hover = -1, focus = -1;
    const weight = M.map(() => (api.reduce ? 1 : 0)), born = M.map((_, i) => 380 + i * 260);
    const boundary = (i, x, t, amp) => Math.sin(x / S.w * Math.PI * 2 * 1.3 + t * 0.35 + i * 2.1) * amp * 0.6 + Math.sin(x / S.w * Math.PI * 2 * 3.4 - t * 0.22 + i * 1.3) * amp * 0.4;
    labels.forEach((L, i) => {
      L.addEventListener('pointerenter', () => { hover = i; });
      L.addEventListener('pointerleave', () => { if (hover === i) hover = -1; });
      L.addEventListener('focus', () => { focus = i; });
      L.addEventListener('blur', () => { if (focus === i) focus = -1; });
    });
    api.loop((t, dt, now) => {
      const W = S.w, H = S.h, tt = api.reduce ? 0 : t;
      ctx.clearRect(0, 0, W, H);
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5); sky.addColorStop(0, '#0b0c10'); sky.addColorStop(1, '#16151a');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      for (const d of dust) { const y = (d.y + tt * 0.004 * d.s) % 0.42; ctx.fillStyle = `rgba(255,240,220,${0.08 + 0.12 * Math.sin(tt + d.p) ** 2})`; ctx.beginPath(); ctx.arc(d.x * W + Math.sin(tt * 0.3 + d.p) * 10, y * H, d.s * 1.2, 0, 7); ctx.fill(); }
      const act = hover >= 0 ? hover : focus;
      for (let i = 0; i < 3; i++) {
        const appear = api.reduce ? 1 : Math.min(1, Math.max(0, (t * 1000 - born[i]) / 900));
        const target = (act < 0 ? 1 : act === i ? 2.7 : 0.62) * (1 - Math.pow(1 - appear, 3));
        weight[i] += (target - weight[i]) * (api.reduce ? 1 : Math.min(1, dt * 7.5));
      }
      const top0 = H * 0.42, avail = H - top0, sum = weight.reduce((a, b) => a + b, 0) || 1;
      const filled = Math.min(1, sum / 3), tops = [];
      let y = H - avail * filled;
      for (let i = 0; i < 3; i++) { tops.push(y); y += avail * filled * weight[i] / sum; }
      tops.push(H);
      for (let i = 0; i < 3; i++) {
        const m = M[i], top = tops[i], bot = tops[i + 1], amp = 9 + (act === i ? 8 : 0);
        const L = labels[i];
        L.style.top = top + 8 + 'px'; L.style.height = Math.max(0, bot - top - 8) + 'px';
        L.style.opacity = weight[i] > 0.3 ? Math.min(1, (bot - top) / 60) : 0;
        L.classList.toggle('wd-open', act === i && bot - top > 200);
        if (bot - top < 1) continue;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, top + boundary(i, x, tt, amp));
        ctx.lineTo(W, H); ctx.closePath();
        const g = ctx.createLinearGradient(0, top, 0, H);
        g.addColorStop(0, m.color); g.addColorStop(Math.min(1, (bot - top) / (H - top) * 1.1), deep[i]); g.addColorStop(1, '#100c0a');
        ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = -8;
        ctx.fillStyle = g; ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.clip();
        const lines = Math.max(2, Math.floor((bot - top) / 16));
        for (let k = 1; k < lines; k++) {
          const yy = top + k * (bot - top) / lines;
          ctx.beginPath();
          for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, yy + boundary(i, x, tt, amp * (1 - k / lines)) + Math.sin(x * 0.02 + k * 3.1) * 2.2);
          ctx.strokeStyle = k % 3 === 0 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.07)'; ctx.lineWidth = k % 3 === 0 ? 1.4 : 1; ctx.stroke();
        }
        for (const s of specks[i]) { ctx.fillStyle = s.d ? `rgba(0,0,0,${s.a})` : `rgba(255,255,255,${s.a * 0.6})`; ctx.beginPath(); ctx.ellipse(s.u * W, top + 14 + s.v * (bot - top), s.r * 1.6, s.r, s.u * 3, 0, 7); ctx.fill(); }
        ctx.beginPath(); for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, top + boundary(i, x, tt, amp));
        ctx.strokeStyle = light[i]; ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.restore();
      }
      if (api.fx) {
        ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.16; ctx.fillStyle = grainPat;
        ctx.save(); ctx.translate((tt * 37) % 220, (tt * 23) % 220); ctx.fillRect(-220, -220, W + 440, H + 440); ctx.restore();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    });
    return {
      key(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const dn = e.key === 'ArrowDown'; labels[focus < 0 ? (dn ? 0 : 2) : (focus + (dn ? 1 : 2)) % 3].focus(); return true; }
        return false;
      },
    };
  },
};
})();
