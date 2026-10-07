/* Welcome screen — Pastel Pop: the logo's three bars rebuilt as soft clay slabs stacked in 3D (isometric). They
   drop in one by one, the stack follows the mouse a little, and pointing at a slab slides it out of the pile while a
   frosted card explains it. Little candy cubes bob around the stack. */
(() => {
const App = window.App;
App.WELCOMES.pastel = {
  css: `
@property --wp-pull { syntax: '<length>'; inherits: false; initial-value: 0px; }
@property --wp-drop { syntax: '<length>'; inherits: false; initial-value: 0px; }
.wl-pastel { font-family: Manrope, sans-serif; color: #352c52; background: linear-gradient(160deg, #ffe4ef 0%, #f1e4f8 50%, #ddf2ec 100%); }
.wl-pastel::before { content: ''; position: absolute; inset: 0; background: radial-gradient(600px 400px at 85% 15%, rgba(255,255,255,.7), transparent 70%), radial-gradient(500px 400px at 10% 90%, rgba(255,214,234,.6), transparent 70%); pointer-events: none; }
.wl-pastel .wq-stage { position: absolute; inset: 0; perspective: 2600px; perspective-origin: 60% 40%; }
.wl-pastel .wq-world { position: absolute; left: 62%; top: 57%; width: 0; height: 0; transform-style: preserve-3d; transform: rotateX(var(--rx, 58deg)) rotateZ(var(--rz, -45deg)); }
.wl-pastel .wq-floor { position: absolute; left: -900px; top: -900px; width: 1800px; height: 1800px; transform: translateZ(-1px); background-image: linear-gradient(rgba(110,80,170,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(110,80,170,.12) 1px, transparent 1px); background-size: 50px 50px; -webkit-mask-image: radial-gradient(circle, #000 18%, transparent 58%); mask-image: radial-gradient(circle, #000 18%, transparent 58%); }
.wl-pastel .wq-shadow { position: absolute; left: -290px; top: -70px; width: 580px; height: 250px; background: rgba(110,60,160,.24); filter: blur(30px); border-radius: 40px; transform: translate3d(30px, 40px, 0); }
.wl-pastel .wq-slab { --W: 470px; --D: 172px; --H: 64px; position: absolute; width: var(--W); height: var(--D); transform-style: preserve-3d; cursor: pointer; border: 0; padding: 0; background: none;
  transform: translate3d(calc(var(--x) - var(--W) / 2), calc(var(--D) / -2 + var(--wp-pull)), calc(var(--z) + var(--wp-drop)));
  transition: --wp-pull .55s cubic-bezier(.2,1.3,.35,1); animation: wq-drop 1.1s cubic-bezier(.3,1.35,.5,1) both; }
@keyframes wq-drop { from { --wp-drop: 520px; } }
.wl-pastel .wq-slab.wq-on { --wp-pull: 170px; }
.wl-pastel .wq-world.wq-hov .wq-slab:not(.wq-on) .wq-f { filter: saturate(.55) brightness(1.04); }
.wl-pastel .wq-f { position: absolute; left: 0; top: 0; transform-origin: 0 0; backface-visibility: hidden; transition: filter .35s; }
.wl-pastel .wq-f.wq-top { width: var(--W); height: var(--D); border-radius: 18px; transform: translateZ(var(--H)); background: linear-gradient(135deg, color-mix(in srgb, var(--l) 70%, #fff), var(--l) 45%, color-mix(in srgb, var(--c) 60%, var(--l))); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.6); display: flex; align-items: center; padding: 0 26px; gap: 16px; }
.wl-pastel .wq-f.wq-front { width: var(--W); height: var(--H); transform: translate3d(0, var(--D), var(--H)) rotateX(-90deg); background: linear-gradient(180deg, var(--c), color-mix(in srgb, var(--c) 78%, var(--d))); border-radius: 0 0 14px 14px; display: flex; align-items: center; justify-content: space-between; padding: 0 22px; }
.wl-pastel .wq-f.wq-end { width: var(--H); height: var(--D); transform: rotateY(-90deg); background: linear-gradient(90deg, color-mix(in srgb, var(--d) 75%, #000), var(--d)); border-radius: 0 0 14px 0; }
.wl-pastel .wq-f.wq-front b { font: 800 34px/1 Manrope; letter-spacing: .02em; color: #fff; text-shadow: 0 -1px 0 rgba(0,0,0,.12); }
.wl-pastel .wq-f.wq-front span { font: 700 11px 'JetBrains Mono'; color: rgba(0,0,0,.32); letter-spacing: .1em; }
.wl-pastel .wq-f.wq-top .wq-ic { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; background: rgba(255,255,255,.65); color: var(--d); box-shadow: 0 6px 0 color-mix(in srgb, var(--d) 28%, transparent); }
.wl-pastel .wq-f.wq-top .wq-ln { flex: 1; display: grid; gap: 9px; }
.wl-pastel .wq-f.wq-top .wq-ln i { display: block; height: 9px; border-radius: 5px; background: color-mix(in srgb, var(--d) 26%, transparent); }
.wl-pastel .wq-f.wq-top .wq-ln i:nth-child(2) { width: 72%; } .wl-pastel .wq-f.wq-top .wq-ln i:nth-child(3) { width: 48%; }
.wl-pastel .wq-f.wq-top .wq-k { font: 800 18px 'JetBrains Mono'; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 14px; background: rgba(255,255,255,.72); color: var(--d); box-shadow: 0 4px 0 color-mix(in srgb, var(--d) 32%, transparent); }
.wl-pastel .wq-cube { position: absolute; width: 22px; height: 22px; transform-style: preserve-3d; animation: wq-bob 4s ease-in-out infinite; }
.wl-pastel .wq-cube .wq-f.wq-top { width: 22px; height: 22px; border-radius: 5px; transform: translateZ(22px); padding: 0; box-shadow: none; }
.wl-pastel .wq-cube .wq-f.wq-front { width: 22px; height: 22px; transform: translate3d(0, 22px, 22px) rotateX(-90deg); padding: 0; border-radius: 0 0 5px 5px; }
.wl-pastel .wq-cube .wq-f.wq-end { width: 22px; height: 22px; transform: rotateY(-90deg); border-radius: 0; }
@keyframes wq-bob { 0%, 100% { transform: translate3d(var(--cx), var(--cy), var(--cz)); } 50% { transform: translate3d(var(--cx), var(--cy), calc(var(--cz) + 34px)) rotateZ(25deg); } }
.wl-pastel .wq-title { position: absolute; left: 6vw; top: 9vh; z-index: 2; }
.wl-pastel .wq-title .wq-eb { font: 700 11px 'JetBrains Mono'; letter-spacing: .3em; color: #9a8cc0; }
.wl-pastel .wq-title h1 { margin: 14px 0 0; font: 800 clamp(56px, 6.4vw, 104px)/.88 Manrope; letter-spacing: -.055em; animation: wq-pop .8s .1s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes wq-pop { from { opacity: 0; transform: scale(.9) translateY(10px); } }
.wl-pastel .wq-title h1 span { display: block; color: transparent; -webkit-text-stroke: 1.6px #352c52; }
.wl-pastel .wq-title p { margin: 20px 0 0; max-width: 360px; font-size: 15px; line-height: 1.6; color: #5f567e; }
.wl-pastel .wq-card { position: absolute; left: 6vw; bottom: 9vh; z-index: 2; width: 350px; padding: 20px 22px; border-radius: 24px; background: rgba(255,255,255,.66); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.9); box-shadow: 0 20px 50px -20px rgba(110,60,160,.35); }
.wl-pastel .wq-card .wq-k2 { font: 700 11px 'JetBrains Mono'; letter-spacing: .15em; color: var(--cd, #9a8cc0); }
.wl-pastel .wq-card h2 { margin: 6px 0 4px; font: 800 26px Manrope; letter-spacing: -.03em; }
.wl-pastel .wq-card p { margin: 0; font-size: 13.5px; line-height: 1.55; color: #5f567e; }
.wl-pastel .wq-card ul { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.wl-pastel .wq-card li { font: 650 12.5px Manrope; display: flex; align-items: center; gap: 8px; }
.wl-pastel .wq-card li::before { content: ''; width: 8px; height: 8px; border-radius: 3px; background: var(--cc, #8b78ff); transform: rotate(45deg); }
.wl-pastel .wq-card.wq-bump { animation: wq-bump .4s cubic-bezier(.2,1.5,.4,1); }
@keyframes wq-bump { 0% { transform: translateY(6px) scale(.98); } }
.wl-pastel .wq-acts { position: absolute; right: 4vw; top: 6vh; z-index: 2; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; max-width: 54vw; }
.wl-pastel .wq-btn { display: flex; align-items: center; gap: 7px; height: 38px; padding: 0 16px; border-radius: 999px; border: 1px solid rgba(255,255,255,.95); background: rgba(255,255,255,.6); color: #352c52; font: 700 12.5px Manrope; box-shadow: 0 3px 0 rgba(110,60,160,.12); transition: transform .25s cubic-bezier(.2,1.8,.4,1), box-shadow .2s; }
.wl-pastel .wq-btn:hover { transform: translateY(-3px) scale(1.04); box-shadow: 0 6px 0 rgba(110,60,160,.14); }
.wl-pastel .wq-btn kbd { font: 600 10px 'JetBrains Mono'; opacity: .55; }
.wl-pastel .wq-btn.wq-go { background: #352c52; color: #fff; border-color: #352c52; }
.wl-pastel .wq-bot { position: absolute; right: 4vw; bottom: 5vh; z-index: 2; display: flex; align-items: center; gap: 14px; font: 700 12.5px Manrope; color: #5f567e; }
.wl-pastel .wl-startup input { accent-color: #ff74a4; }
@media (max-width: 980px) { .wl-pastel .wq-world { left: 66%; transform: scale(.7) rotateX(var(--rx, 58deg)) rotateZ(var(--rz, -45deg)); } }
`,
  build(root, api) {
    const M = api.modes;
    const POS = [{ z: 172, x: -60, d: 0.5 }, { z: 86, x: 0, d: 0.3 }, { z: 0, x: 60, d: 0.1 }];
    root.innerHTML = `
      <div class="wq-stage"><div class="wq-world"><div class="wq-floor"></div><div class="wq-shadow"></div></div></div>
      <div class="wq-title"><div class="wq-eb">VIDEO · AUDIO · IMAGE</div><h1>Strata<span>Studio</span></h1><p>${api.esc(api.tagline)}</p></div>
      <div class="wq-card"></div>
      <div class="wq-acts">${api.actions.map(a => `<button class="wq-btn" data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${api.icon(a.icon, 15)}${a.label}${a.key ? `<kbd>${a.key}</kbd>` : ''}</button>`).join('')}</div>
      <div class="wq-bot"><span class="wq-su"></span><button class="wq-btn wq-go" data-act="close"${api.tip('Continue', 'Close the welcome screen and keep working.', 'Esc')}>Continue · Esc</button></div>`;
    root.querySelector('.wq-su').append(api.startup('Show at startup'));
    const world = root.querySelector('.wq-world'), card = root.querySelector('.wq-card');
    const idle = () => { card.style.cssText = ''; card.innerHTML = `<div class="wq-k2">THREE LAYERS, ONE STUDIO</div><h2>Pull out a layer</h2><p>Point at a slab to slide it out, then click — or press 1, 2 or 3.</p>`; };
    let k = -1;
    const slabs = M.map((m, i) => {
      const d = api.mix(m.color, '#3a1060', 0.32), l = api.mix(m.color, '#ffffff', 0.62);
      const s = api.el(`<button class="wq-slab" data-pick="${m.id}" aria-label="Open the ${m.name} editor" style="--c:${m.color};--d:${d};--l:${l};--z:${POS[i].z}px;--x:${POS[i].x}px;animation-delay:${POS[i].d}s"${api.tip(m.name + ' editor', m.tip, m.key)}><div class="wq-f wq-end"></div><div class="wq-f wq-front"><b>${m.name}</b><span>0${i + 1} / 03</span></div><div class="wq-f wq-top"><div class="wq-ic">${api.icon(m.icon, 30, 2)}</div><div class="wq-ln"><i></i><i></i><i></i></div><div class="wq-k">${m.key}</div></div></button>`);
      const on = () => {
        k = i; slabs.forEach(o => o.classList.toggle('wq-on', o === s)); world.classList.add('wq-hov');
        card.style.cssText = `--cd:${d};--cc:${m.color}`;
        card.innerHTML = `<div class="wq-k2">LAYER 0${i + 1} · PRESS ${m.key}</div><h2>${m.name} editor</h2><p>${m.desc}</p><ul>${m.pts.map(p => `<li>${p}</li>`).join('')}</ul>`;
        card.classList.remove('wq-bump'); void card.offsetWidth; card.classList.add('wq-bump');
      };
      s.addEventListener('pointerenter', on); s.addEventListener('focus', on);
      s.addEventListener('pointerleave', () => { s.classList.remove('wq-on'); if (!slabs.some(o => o.classList.contains('wq-on'))) { world.classList.remove('wq-hov'); idle(); } });
      world.append(s); return s;
    });
    [[M[0].color, -330, -200, 120, 0], [M[1].color, 300, -170, 230, 1.2], [M[2].color, 260, 210, 40, 2.1], ['#ffd36b', -470, 40, 280, 0.6], ['#ff9ec7', 40, -320, 320, 1.8]].forEach(([c, x, y, z, dl]) => {
      const q = document.createElement('div'); q.className = 'wq-cube';
      q.style.cssText = `--c:${c};--d:${api.mix(c, '#3a1060', 0.3)};--l:${api.mix(c, '#fff', 0.55)};--cx:${x}px;--cy:${y}px;--cz:${z}px;animation-delay:-${dl}s`;
      q.innerHTML = '<div class="wq-f wq-end"></div><div class="wq-f wq-front"></div><div class="wq-f wq-top"></div>';
      world.append(q);
    });
    idle();
    let rx = 58, rz = -45, tx = 58, tz = -45;
    api.on(root, 'pointermove', e => { tz = -45 + (e.clientX / innerWidth - 0.5) * 14; tx = 58 - (e.clientY / innerHeight - 0.5) * 8; });
    if (!api.reduce) api.loop(() => { rx += (tx - rx) * 0.06; rz += (tz - rz) * 0.06; world.style.setProperty('--rx', rx + 'deg'); world.style.setProperty('--rz', rz + 'deg'); });
    return {
      key(e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { const n = (k + (e.key === 'ArrowDown' ? 1 : 2) + 3) % 3; slabs[k < 0 ? (e.key === 'ArrowDown' ? 0 : 2) : n].focus(); return true; }
        return false;
      },
      leave(id) { const i = M.findIndex(m => m.id === id); slabs[i].dispatchEvent(new Event('pointerenter')); return 380; },
    };
  },
};
})();
