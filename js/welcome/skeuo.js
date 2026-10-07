/* Welcome screen — Skeuomorphic Studio: the "Strata SS-3" production console on a leather desk. A brushed-metal
   faceplate with screws, a backlit dot-matrix LCD that scrolls, two analog VU meters, three illuminated pads (one
   per editor), a rotary selector you can turn with the mouse wheel or arrow keys, and bat toggle switches. */
(() => {
const App = window.App;
App.WELCOMES.skeuo = {
  css: `
.wl-skeuo { color: #2b2620; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3vh;
  background: radial-gradient(ellipse at 50% 35%, #6a4a35 0%, #3b281c 55%, #1d130c 100%); }
.wl-skeuo::before { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .55; mix-blend-mode: multiply; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='l'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .2  0 0 0 0 .12  0 0 0 0 .06  0 0 0 .7 0'/></filter><rect width='100%' height='100%' filter='url(%23l)'/></svg>"); }
.wl-skeuo::after { content: ''; position: absolute; inset: 14px; border: 2px dashed rgba(255,226,180,.32); border-radius: 18px; pointer-events: none; box-shadow: 0 0 0 1px rgba(0,0,0,.25); }
.wl-skeuo .wk-plate { position: relative; z-index: 2; width: min(1140px, 94vw); padding: 26px 34px 24px; border-radius: 14px;
  background: linear-gradient(180deg, rgba(255,255,255,.45), rgba(255,255,255,0) 18%, rgba(0,0,0,.05) 80%, rgba(0,0,0,.18)), repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 1px, rgba(0,0,0,.04) 1px 2px, rgba(255,255,255,.03) 2px 4px), linear-gradient(180deg, #d9dade, #b9bbc1 50%, #a4a7ae);
  box-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 -2px 0 rgba(0,0,0,.25) inset, 0 30px 60px rgba(0,0,0,.6), 0 8px 18px rgba(0,0,0,.45); animation: wk-in .7s cubic-bezier(.2,.9,.3,1.1) both; }
@keyframes wk-in { from { opacity: 0; transform: translateY(30px) scale(.97); } }
.wl-skeuo .wk-screw { position: absolute; width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #f4f4f4, #9a9ca2 55%, #5e6066); box-shadow: 0 1px 1px rgba(255,255,255,.7), inset 0 -1px 2px rgba(0,0,0,.4); }
.wl-skeuo .wk-screw::after { content: ''; position: absolute; left: 2px; right: 2px; top: 50%; height: 2px; margin-top: -1px; background: #4a4c52; transform: rotate(var(--r)); box-shadow: 0 1px 0 rgba(255,255,255,.5); }
.wl-skeuo .wk-row1 { display: grid; grid-template-columns: 1fr minmax(0, 1.9fr) 1fr; gap: 22px; align-items: center; }
.wl-skeuo .wk-brand { display: flex; flex-direction: column; gap: 6px; }
.wl-skeuo .wk-brand b { font: 800 clamp(22px, 2.2vw, 32px)/1 'Bebas Neue', 'Segoe UI', sans-serif; letter-spacing: .14em; color: #33302b; text-shadow: 0 1px 0 rgba(255,255,255,.75), 0 -1px 0 rgba(0,0,0,.25); }
.wl-skeuo .wk-brand small { font: 700 10px 'Segoe UI'; letter-spacing: .28em; color: #555149; text-shadow: 0 1px 0 rgba(255,255,255,.6); }
.wl-skeuo .wk-leds { display: flex; gap: 6px; margin-top: 4px; }
.wl-skeuo .wk-leds i { width: 30px; height: 7px; border-radius: 4px; background: var(--c); box-shadow: 0 0 8px var(--c), inset 0 1px 1px rgba(255,255,255,.6), 0 0 0 1px rgba(0,0,0,.35); transform: skewX(-12deg); }
.wl-skeuo .wk-lcdbox { padding: 8px; border-radius: 10px; background: linear-gradient(180deg, #2a2b2f, #444650); box-shadow: inset 0 2px 5px rgba(0,0,0,.8), 0 1px 0 rgba(255,255,255,.7); }
.wl-skeuo .wk-lcd { position: relative; height: 84px; border-radius: 4px; padding: 10px 14px; overflow: hidden; background: radial-gradient(ellipse at 50% 30%, #c9f29a, #8fcf5c 70%, #6fae43); box-shadow: inset 0 0 18px rgba(30,60,10,.6); font: 700 clamp(15px, 1.45vw, 21px)/1.35 'JetBrains Mono', Consolas, monospace; color: #1f3510; letter-spacing: .08em; white-space: pre; }
.wl-skeuo .wk-lcd::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(150,200,110,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(150,200,110,.35) 1px, transparent 1px); background-size: 3px 3px; pointer-events: none; }
.wl-skeuo .wk-lcd::after { content: ''; position: absolute; inset: 0; background: linear-gradient(170deg, rgba(255,255,255,.35), transparent 40%); pointer-events: none; }
.wl-skeuo .wk-lcd span { position: relative; display: block; text-shadow: 1px 1px 0 rgba(31,53,16,.2); }
.wl-skeuo .wk-vu { justify-self: center; position: relative; width: clamp(150px, 15vw, 210px); aspect-ratio: 1.7; border-radius: 8px; overflow: hidden; background: linear-gradient(180deg, #2a2b2f, #4a4c54); padding: 6px; box-shadow: inset 0 2px 5px rgba(0,0,0,.8), 0 1px 0 rgba(255,255,255,.7); }
.wl-skeuo .wk-vu .wk-face { position: relative; width: 100%; height: 100%; border-radius: 4px; overflow: hidden; background: radial-gradient(ellipse at 50% 100%, #fff7da, #f1deaa 70%, #d9bf80); box-shadow: inset 0 0 14px rgba(140,90,20,.45); }
.wl-skeuo .wk-vu svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.wl-skeuo .wk-needle { position: absolute; left: 50%; bottom: -14%; width: 2px; height: 92%; margin-left: -1px; background: linear-gradient(#1a1a1a, #3a3a3a); transform-origin: 50% 100%; transform: rotate(-48deg); box-shadow: 1px 0 1px rgba(0,0,0,.3); }
.wl-skeuo .wk-vu .wk-glass { position: absolute; inset: 6px; border-radius: 4px; background: linear-gradient(160deg, rgba(255,255,255,.45), transparent 42%); pointer-events: none; }
.wl-skeuo .wk-row2 { display: grid; grid-template-columns: 1fr auto; gap: 30px; align-items: center; margin-top: 26px; }
.wl-skeuo .wk-pads { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.wl-skeuo .wk-pad { position: relative; height: clamp(150px, 19vh, 200px); border-radius: 14px; border: 0; padding: 16px 16px 14px; text-align: left; color: #e9e2d4;
  background: linear-gradient(180deg, #4b4d53, #2c2e33); box-shadow: 0 6px 0 #17181b, 0 10px 18px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.18), inset 0 0 0 1px rgba(0,0,0,.4);
  transition: transform .08s, box-shadow .08s, background .25s; display: flex; flex-direction: column; }
.wl-skeuo .wk-pad .wk-lens { position: absolute; right: 14px; top: 14px; width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #777, #2a2a2a 70%); box-shadow: inset 0 1px 2px rgba(0,0,0,.8), 0 1px 0 rgba(255,255,255,.2); transition: background .2s, box-shadow .2s; }
.wl-skeuo .wk-pad .wk-ic { color: #a8a294; transition: color .2s, filter .2s; }
.wl-skeuo .wk-pad b { margin-top: auto; font: 400 clamp(26px, 2.3vw, 34px)/1 'Bebas Neue', sans-serif; letter-spacing: .12em; color: #f0e7d8; text-shadow: 0 -1px 0 rgba(0,0,0,.6); }
.wl-skeuo .wk-pad small { display: block; margin-top: 4px; font: 600 11.5px/1.35 'Segoe UI'; color: #b9b1a2; }
.wl-skeuo .wk-pad .wk-ch { position: absolute; left: 16px; top: 13px; font: 700 10px 'JetBrains Mono'; color: #8c8577; letter-spacing: .1em; }
.wl-skeuo .wk-pad .wk-ic { margin-top: 18px; }
.wl-skeuo .wk-pad.wk-on { background: linear-gradient(180deg, color-mix(in srgb, var(--c) 30%, #4b4d53), color-mix(in srgb, var(--c) 18%, #2c2e33)); }
.wl-skeuo .wk-pad.wk-on .wk-lens { background: radial-gradient(circle at 40% 35%, #fff, var(--c) 55%, color-mix(in srgb, var(--c) 60%, #000)); box-shadow: 0 0 14px var(--c), 0 0 4px #fff; }
.wl-skeuo .wk-pad.wk-on .wk-ic { color: var(--c); filter: drop-shadow(0 0 6px var(--c)); }
.wl-skeuo .wk-pad:active, .wl-skeuo .wk-pad.wk-down { transform: translateY(5px); box-shadow: 0 1px 0 #17181b, 0 3px 8px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.12), inset 0 0 0 1px rgba(0,0,0,.4); }
.wl-skeuo .wk-pad:focus-visible { outline: 2px solid #f2a132; outline-offset: 3px; }
.wl-skeuo .wk-sel { position: relative; width: clamp(150px, 14vw, 190px); aspect-ratio: 1; margin: 0 26px; }
.wl-skeuo .wk-sel .wk-lbl { position: absolute; font: 800 10.5px 'Segoe UI'; letter-spacing: .14em; color: #3a3630; text-shadow: 0 1px 0 rgba(255,255,255,.6); transform: translate(-50%, -50%); white-space: nowrap; }
.wl-skeuo .wk-sel .wk-lbl.wk-hot { color: #b45309; }
.wl-skeuo .wk-knob { position: absolute; left: 50%; top: 50%; width: 62%; aspect-ratio: 1; margin: -31% 0 0 -31%; border-radius: 50%; cursor: grab; border: 0; padding: 0;
  background: conic-gradient(from 0deg, #f6f6f6, #9a9da4, #eceef0, #8b8e95, #f6f6f6, #a0a3aa, #e9ebee, #8e9198, #f6f6f6); box-shadow: 0 8px 14px rgba(0,0,0,.5), 0 0 0 6px #2b2c30, 0 0 0 7px rgba(255,255,255,.5), inset 0 0 0 1px rgba(0,0,0,.3); transition: transform .35s cubic-bezier(.2,1.4,.4,1); }
.wl-skeuo .wk-knob::before { content: ''; position: absolute; inset: 16%; border-radius: 50%; background: radial-gradient(circle at 40% 30%, #fafafa, #b8bbc1 60%, #8f9299); box-shadow: inset 0 1px 1px rgba(255,255,255,.9), 0 1px 3px rgba(0,0,0,.4); }
.wl-skeuo .wk-knob::after { content: ''; position: absolute; left: 50%; top: 6%; width: 5px; height: 24%; margin-left: -2.5px; border-radius: 3px; background: #c2410c; box-shadow: 0 0 6px rgba(242,161,50,.8); }
.wl-skeuo .wk-ticks { position: absolute; inset: 0; }
.wl-skeuo .wk-row3 { display: flex; align-items: flex-end; gap: 26px; margin-top: 26px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,.18); box-shadow: 0 -1px 0 rgba(255,255,255,.5); }
.wl-skeuo .wk-sw { display: flex; flex-direction: column; align-items: center; gap: 8px; border: 0; background: none; padding: 0; font: 800 10px 'Segoe UI'; letter-spacing: .14em; color: #3a3630; text-shadow: 0 1px 0 rgba(255,255,255,.6); }
.wl-skeuo .wk-bat { position: relative; width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #f0f0f0, #8e9198 70%); box-shadow: 0 2px 3px rgba(0,0,0,.45), inset 0 -1px 1px rgba(0,0,0,.3); }
.wl-skeuo .wk-bat::after { content: ''; position: absolute; left: 50%; bottom: 40%; width: 9px; height: 26px; margin-left: -4.5px; border-radius: 5px 5px 3px 3px; background: linear-gradient(90deg, #8e9198, #fbfbfb 45%, #9a9da4); box-shadow: 0 3px 4px rgba(0,0,0,.35); transform-origin: 50% 100%; transition: transform .15s; }
.wl-skeuo .wk-sw:hover .wk-bat::after { transform: rotate(-8deg); }
.wl-skeuo .wk-sw.wk-flip .wk-bat::after { transform: rotate(180deg); }
.wl-skeuo .wk-grow { flex: 1; }
.wl-skeuo .wk-su { display: flex; flex-direction: column; align-items: center; gap: 8px; font: 800 10px 'Segoe UI'; letter-spacing: .14em; color: #3a3630; }
.wl-skeuo .wk-su .wl-startup { flex-direction: column; gap: 8px; }
.wl-skeuo .wk-su .wl-startup span { text-transform: uppercase; text-shadow: 0 1px 0 rgba(255,255,255,.6); }
.wl-skeuo .wk-su .wl-startup input { appearance: none; -webkit-appearance: none; width: 46px; height: 24px; border-radius: 12px; background: linear-gradient(180deg, #2a2b2f, #4a4c54); box-shadow: inset 0 2px 4px rgba(0,0,0,.8), 0 1px 0 rgba(255,255,255,.7); position: relative; }
.wl-skeuo .wk-su .wl-startup input::after { content: ''; position: absolute; left: 3px; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #fafafa, #9a9da4); box-shadow: 0 2px 3px rgba(0,0,0,.5); transition: left .15s; }
.wl-skeuo .wk-su .wl-startup input:checked { background: linear-gradient(180deg, #2a2b2f, #4a4c54), radial-gradient(#62e05a, transparent); box-shadow: inset 0 2px 4px rgba(0,0,0,.8), 0 1px 0 rgba(255,255,255,.7), inset 0 0 10px rgba(98,224,90,.6); }
.wl-skeuo .wk-su .wl-startup input:checked::after { left: 25px; }
.wl-skeuo .wk-power { display: flex; align-items: center; gap: 12px; border: 0; padding: 10px 18px 10px 12px; border-radius: 10px; font: 800 12px 'Segoe UI'; letter-spacing: .14em; color: #f0e7d8; background: linear-gradient(180deg, #4b4d53, #2c2e33); box-shadow: 0 4px 0 #17181b, 0 8px 14px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.18); }
.wl-skeuo .wk-power:active { transform: translateY(3px); box-shadow: 0 1px 0 #17181b, inset 0 1px 0 rgba(255,255,255,.12); }
.wl-skeuo .wk-power i { width: 12px; height: 12px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #ffb3a8, #e0301e 60%, #7a0f05); box-shadow: 0 0 10px #ff4a2e; }
.wl-skeuo .wk-emboss { position: relative; z-index: 2; text-align: center; font: 400 clamp(48px, 6.4vw, 96px)/.9 'Bebas Neue', sans-serif; letter-spacing: .16em; color: #3a271b; text-shadow: 0 1px 0 rgba(255,220,180,.18), 0 -1px 1px rgba(0,0,0,.7); animation: wk-in .8s both; }
.wl-skeuo .wk-emboss small { display: block; margin-top: 8px; font: 700 12px 'Segoe UI'; letter-spacing: .5em; color: #4a3324; text-shadow: 0 1px 0 rgba(255,220,180,.15), 0 -1px 0 rgba(0,0,0,.6); }
.wl-skeuo .wk-tag { position: absolute; z-index: 2; left: 50%; bottom: 3vh; transform: translateX(-50%); font: 600 11px 'Segoe UI'; letter-spacing: .2em; color: rgba(255,226,180,.55); text-transform: uppercase; white-space: nowrap; }
`,
  build(root, api) {
    const M = api.modes;
    const screws = [[10, 10, 30], [null, 10, -20], [10, null, 70], [null, null, 10]].map(([l, t, r]) => `<i class="wk-screw" style="${l != null ? `left:${l}px;` : 'right:10px;'}${t != null ? `top:${t}px;` : 'bottom:10px;'}--r:${r}deg"></i>`).join('');
    const vuScale = `<svg viewBox="0 0 170 100" preserveAspectRatio="none"><g fill="none" stroke="#2b2620" stroke-width="1.2">
      <path d="M31.5 57.8 A 72 72 0 0 1 119.7 42.9"/><path d="M119.7 42.9 A 72 72 0 0 1 138.5 57.8" stroke="#c0281a" stroke-width="3"/>
      ${Array.from({ length: 11 }, (_, k) => { const a = (-48 + k * 9.6) * Math.PI / 180, r1 = 72, r2 = k % 2 ? 66 : 62; return `<path d="M${85 + Math.sin(a) * r1} ${106 - Math.cos(a) * r1} L${85 + Math.sin(a) * r2} ${106 - Math.cos(a) * r2}" ${k > 7 ? 'stroke="#c0281a"' : ''}/>`; }).join('')}</g>
      <text x="85" y="62" text-anchor="middle" font-family="Georgia, serif" font-size="13" font-style="italic" fill="#2b2620">VU</text>
      <text x="20" y="88" font-family="Segoe UI" font-size="7" fill="#2b2620">-20</text><text x="138" y="88" font-family="Segoe UI" font-size="7" fill="#c0281a">+3</text></svg>`;
    const SW = [['open', 'OPEN'], ['palette', 'CMD'], ['shortcuts', 'KEYS'], ['prefs', 'PREFS']];
    root.innerHTML = `
      <div class="wk-emboss">Strata Studio<small>Hand-built in layers</small></div>
      <div class="wk-plate">${screws}
        <div class="wk-row1">
          <div class="wk-brand"><b>Strata SS-3</b><small>Production console · Video · Audio · Image</small><div class="wk-leds">${M.map(m => `<i style="--c:${m.color}"></i>`).join('')}</div></div>
          <div class="wk-lcdbox"><div class="wk-lcd"><span class="wk-l1"></span><span class="wk-l2"></span></div></div>
          <div class="wk-vu" title="VU meter"><div class="wk-face">${vuScale}<i class="wk-needle"></i></div><div class="wk-glass"></div></div>
        </div>
        <div class="wk-row2">
          <div class="wk-pads">${M.map((m, i) => `<button class="wk-pad" data-pick="${m.id}" aria-label="Open the ${m.name} editor" style="--c:${m.color}"${api.tip(m.name + ' editor', m.tip, m.key)}><span class="wk-ch">CH ${i + 1} · KEY ${m.key}</span><i class="wk-lens"></i><span class="wk-ic">${api.icon(m.icon, 34, 1.8)}</span><b>${m.name}</b><small>${m.desc}</small></button>`).join('')}</div>
          <div class="wk-sel"><div class="wk-ticks"></div><button class="wk-knob" aria-label="Editor selector"${api.tip('Selector', 'Turn it (mouse wheel, drag or ← →) to choose an editor, then click it to open.')}></button></div>
        </div>
        <div class="wk-row3">
          ${SW.map(([id, l]) => { const a = api.actions.find(x => x.id === id); return `<button class="wk-sw" data-sw="${id}"${api.tip(a.label, a.tip, a.key)}><span class="wk-bat"></span>${l}</button>`; }).join('')}
          <span class="wk-grow"></span><div class="wk-su"></div>
          <button class="wk-power" data-act="close"${api.tip('Continue', 'Close the welcome screen and keep working.', 'Esc')}><i></i>CONTINUE</button>
        </div>
      </div>
      <div class="wk-tag">${api.esc(api.tagline)}</div>`;
    root.querySelector('.wk-su').append(api.startup('At startup'));
    const pads = [...root.querySelectorAll('.wk-pad')], knob = root.querySelector('.wk-knob'), ticks = root.querySelector('.wk-ticks');
    const ANG = [-60, 0, 60];
    ticks.innerHTML = M.map((m, i) => { const a = (ANG[i] - 90) * Math.PI / 180; return `<span class="wk-lbl" style="left:${50 + Math.cos(a) * 60}%;top:${50 + Math.sin(a) * 58}%">${i + 1} ${m.name.toUpperCase()}</span>`; }).join('');
    const lbls = [...ticks.children];
    let sel = -1;
    const l1 = root.querySelector('.wk-l1'), l2 = root.querySelector('.wk-l2'), COLS = 30;
    let msg1 = '  WELCOME TO STRATA STUDIO   ', msg2 = 'SELECT A CHANNEL · 1 · 2 · 3 · ', scroll = 0;
    const select = i => {
      sel = i;
      pads.forEach((p, k) => p.classList.toggle('wk-on', k === i));
      lbls.forEach((l, k) => l.classList.toggle('wk-hot', k === i));
      knob.style.transform = `rotate(${i < 0 ? -90 : ANG[i]}deg)`;
      if (i < 0) { msg1 = '  WELCOME TO STRATA STUDIO   '; msg2 = 'SELECT A CHANNEL · 1 · 2 · 3 · '; }
      else { const m = M[i]; msg1 = `CH${i + 1} ${m.name.toUpperCase()}`.padEnd(COLS); msg2 = (m.desc + ' · ' + m.pts.join(' · ') + ' · ').toUpperCase(); }
      scroll = 0; draw();
    };
    const draw = () => { l1.textContent = msg1.slice(0, COLS); const s = msg2 + msg2; l2.textContent = s.slice(scroll % msg2.length, scroll % msg2.length + COLS); };
    api.every(150, () => { if (!api.reduce) scroll++; draw(); });
    pads.forEach((p, i) => { p.addEventListener('pointerenter', () => select(i)); p.addEventListener('focus', () => select(i)); });
    select(-1);
    // the selector knob: wheel, drag or click
    api.on(knob, 'wheel', e => { e.preventDefault(); select(Math.max(0, Math.min(2, (sel < 0 ? 1 : sel) + (e.deltaY > 0 ? 1 : -1)))); api.sound('tick'); }, { passive: false });
    knob.addEventListener('pointerdown', e => {
      const r = knob.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let moved = false;
      const mv = ev => { const a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90; const i = a < -30 ? 0 : a > 30 ? 2 : 1; if (i !== sel) { select(i); api.sound('tick'); } moved = true; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (!moved && sel >= 0) api.choose(M[sel].id); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    // bat switches flip, then run their action
    root.querySelectorAll('.wk-sw').forEach(b => b.addEventListener('click', () => { b.classList.add('wk-flip'); api.sound('switch'); setTimeout(() => api.run(b.dataset.sw), 180); }));
    // VU needle: a lively fake signal that peaks harder on the selected channel
    const needle = root.querySelector('.wk-needle');
    let v = 0;
    api.loop((t, dt) => {
      const target = api.reduce ? 0.35 : (0.35 + 0.25 * Math.sin(t * 2.1) + 0.2 * Math.sin(t * 5.3 + 1) * Math.sin(t * 0.7) + (Math.random() - 0.5) * 0.25) * (sel >= 0 ? 1.35 : 1);
      v += (Math.max(0, Math.min(1.05, target)) - v) * Math.min(1, dt * 9);
      needle.style.transform = `rotate(${-48 + v * 96}deg)`;
    });
    return {
      key(e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { select(sel < 0 ? 0 : Math.min(2, sel + 1)); api.sound('tick'); return true; }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { select(sel < 0 ? 2 : Math.max(0, sel - 1)); api.sound('tick'); return true; }
        if (e.key === 'Enter' && sel >= 0 && !document.activeElement.closest('.wk-sw, .wk-power, label')) { api.choose(M[sel].id); return true; }
        return false;
      },
      leave(id) { const i = M.findIndex(m => m.id === id); select(i); pads[i].classList.add('wk-down'); msg1 = `LOADING ${M[i].name.toUpperCase()}…`.padEnd(COLS); draw(); return 420; },
    };
  },
};
})();
