/* Welcome screen — Strata Light: a bright bento grid with live previews. A little film plays on the Video tile
   (hover to scrub it), a voice is being recorded on the Audio tile, and the Image tile compares a flat photo with its
   edit (hover to move the divider). Small tiles hold the actions and a rotating tip. */
(() => {
const App = window.App;
App.WELCOMES.light = {
  css: `
.wl-light { color: #1d1a16; font-family: Manrope, sans-serif; background: #ebe7df radial-gradient(rgba(60,40,20,.09) 1px, transparent 1.2px) 0 0 / 22px 22px; }
.wl-light .wb-grid { position: absolute; inset: 0; padding: 18px; display: grid; gap: 14px; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(0, 1fr)); }
.wl-light .wb-tile { position: relative; border-radius: 22px; background: #fbfaf7; border: 1px solid rgba(60,40,20,.07); box-shadow: inset 0 1px 0 #fff, 0 1px 2px rgba(40,30,20,.05), 0 10px 30px -12px rgba(40,30,20,.12); padding: 18px; min-height: 0; min-width: 0; display: flex; text-align: left; color: inherit; font: inherit; animation: wb-up .7s cubic-bezier(.2,.9,.25,1) both; transition: transform .35s cubic-bezier(.2,1.2,.4,1), box-shadow .35s, border-color .35s; }
@keyframes wb-up { from { opacity: 0; transform: translateY(14px) scale(.985); } }
.wl-light .wb-hero { grid-area: 1 / 1 / 3 / 6; flex-direction: column; justify-content: space-between; padding: 24px 26px; overflow: hidden; }
.wl-light .wb-hero::after { content: ''; position: absolute; right: -60px; bottom: -80px; width: 260px; height: 260px; background: conic-gradient(from 200deg, var(--v), var(--a), var(--i), var(--v)); filter: blur(60px); opacity: .28; border-radius: 50%; animation: wb-spin 14s linear infinite; pointer-events: none; }
@keyframes wb-spin { to { transform: rotate(1turn); } }
.wl-light .wb-hero .wb-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; position: relative; z-index: 1; }
.wl-light .wb-badges { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.wl-light .wb-badges span { font: 700 11px Manrope; padding: 5px 10px; border-radius: 999px; background: #f0ece4; color: #6d6458; display: flex; align-items: center; gap: 6px; }
.wl-light .wb-badges i { width: 6px; height: 6px; border-radius: 50%; background: #2fbf71; box-shadow: 0 0 0 3px rgba(47,191,113,.18); }
.wl-light .wb-hero h1 { margin: 0; font: 800 clamp(38px, 4.2vw, 64px)/.95 Manrope; letter-spacing: -.05em; position: relative; z-index: 1; }
.wl-light .wb-hero h1 em { font: italic 400 1.06em 'Playfair Display', serif; letter-spacing: -.02em; color: #8b7f70; }
.wl-light .wb-hero p { margin: 10px 0 0; font-size: clamp(13px, 1vw, 15px); line-height: 1.55; color: #6f675e; max-width: 440px; position: relative; z-index: 1; }
.wl-light .wb-pick { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font: 700 12px Manrope; color: #8b7f70; }
.wl-light .wb-pick .wb-grow { flex: 1; }
.wl-light kbd { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 6px; background: #fff; border: 1px solid rgba(60,40,20,.14); border-bottom-width: 2px; font: 700 11px 'JetBrains Mono'; color: #4c443b; }
.wl-light .wb-cont { height: 30px; padding: 0 14px; border-radius: 999px; border: 0; background: #1d1a16; color: #fff; font: 700 12px Manrope; }
.wl-light .wb-cont:hover { background: #3a342c; }
.wl-light .wl-startup { font: 700 12px Manrope; color: #6d6458; } .wl-light .wl-startup input { accent-color: #1d1a16; }
.wl-light .wb-ed { flex-direction: column; padding: 16px; }
.wl-light .wb-ed.wb-video { grid-area: 1 / 6 / 4 / 13; } .wl-light .wb-ed.wb-audio { grid-area: 3 / 1 / 6 / 6; } .wl-light .wb-ed.wb-image { grid-area: 4 / 6 / 7 / 10; }
.wl-light .wb-ed:hover, .wl-light .wb-ed:focus-visible { transform: translateY(-3px); border-color: color-mix(in srgb, var(--c) 55%, transparent); box-shadow: inset 0 1px 0 #fff, 0 2px 4px rgba(40,30,20,.05), 0 24px 50px -18px color-mix(in srgb, var(--c) 45%, transparent); outline: none; }
.wl-light .wb-hd { display: flex; align-items: center; gap: 12px; padding: 2px 2px 12px; }
.wl-light .wb-hd .wb-ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 18%, #fff); color: var(--c); flex: none; transition: background .3s, color .3s, transform .5s cubic-bezier(.2,1.6,.4,1); }
.wl-light .wb-ed:hover .wb-hd .wb-ic { background: var(--c); color: #fff; transform: rotate(-8deg) scale(1.08); }
.wl-light .wb-hd h2 { margin: 0; font: 800 21px Manrope; letter-spacing: -.02em; }
.wl-light .wb-hd p { margin: 2px 0 0; font-size: 12.5px; color: #7a7167; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wl-light .wb-hd .wb-txt { flex: 1; min-width: 0; }
.wl-light .wb-hd .wb-go { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; border: 1px solid rgba(60,40,20,.12); color: #4c443b; flex: none; transition: background .3s, color .3s, border-color .3s, transform .4s cubic-bezier(.2,1.4,.4,1); }
.wl-light .wb-ed:hover .wb-hd .wb-go { background: #1d1a16; border-color: #1d1a16; color: #fff; transform: rotate(-45deg); }
.wl-light .wb-pv { position: relative; flex: 1; min-height: 0; border-radius: 14px; overflow: hidden; background: #141318; }
.wl-light .wb-pts { position: absolute; left: 10px; right: 10px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 6px; pointer-events: none; }
.wl-light .wb-pts span { font: 700 11.5px Manrope; padding: 6px 11px; border-radius: 999px; background: rgba(255,255,255,.92); color: #1d1a16; box-shadow: 0 4px 14px rgba(0,0,0,.18); opacity: 0; transform: translateY(10px); transition: opacity .25s calc(var(--i) * 45ms), transform .4s calc(var(--i) * 45ms) cubic-bezier(.2,1.4,.4,1); }
.wl-light .wb-ed:hover .wb-pts span, .wl-light .wb-ed:focus-visible .wb-pts span { opacity: 1; transform: none; }
.wl-light .wb-video .wb-pts { top: 10px; bottom: auto; right: 130px; }
.wl-light .wb-scrub { position: absolute; right: 10px; top: 10px; font: 700 10.5px Manrope; color: rgba(255,255,255,.85); background: rgba(0,0,0,.35); padding: 4px 9px; border-radius: 999px; opacity: 0; transition: opacity .3s; pointer-events: none; }
.wl-light .wb-ed:hover .wb-scrub { opacity: 1; }
.wl-light .wb-sm { align-items: center; gap: 14px; padding: 12px 16px; border: 0; }
.wl-light .wb-sm:hover, .wl-light .wb-sm:focus-visible { transform: translateY(-2px); box-shadow: inset 0 1px 0 #fff, 0 2px 4px rgba(40,30,20,.05), 0 18px 36px -16px rgba(40,30,20,.25); outline: none; }
.wl-light .wb-sm .wb-ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: #f0ece4; color: #4c443b; flex: none; }
.wl-light .wb-sm b { display: block; font: 800 14px Manrope; }
.wl-light .wb-sm span { display: block; font-size: 12px; color: #7a7167; margin-top: 2px; }
.wl-light .wb-sm .wb-txt { flex: 1; min-width: 0; }
.wl-light .wb-open { grid-area: 4 / 10 / 5 / 13; } .wl-light .wb-pal { grid-area: 5 / 10 / 6 / 13; } .wl-light .wb-keys { grid-area: 6 / 10 / 7 / 13; }
.wl-light .wb-tip { grid-area: 6 / 1 / 7 / 6; align-items: center; gap: 14px; padding: 12px 18px; overflow: hidden; }
.wl-light .wb-tip .wb-lbl { font: 800 10.5px 'JetBrains Mono'; letter-spacing: .12em; color: #b08a3e; background: #fbf0d9; padding: 5px 8px; border-radius: 6px; flex: none; }
.wl-light .wb-tip .wb-msg { flex: 1; font-size: 13px; line-height: 1.45; color: #4c443b; transition: opacity .35s, transform .35s; }
.wl-light .wb-tip .wb-msg.wb-out { opacity: 0; transform: translateY(6px); }
@media (max-height: 760px) {
  .wl-light .wb-hero { padding: 16px 18px; }
  .wl-light .wb-hero p, .wl-light .wb-badges { display: none; }
  .wl-light .wb-hero h1 { font-size: clamp(32px, 3.6vw, 48px); }
  .wl-light .wb-sm span { display: none; }
}
.wl-light .wb-tip .wb-prefs { flex: none; height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(60,40,20,.14); background: #fff; font: 700 12px Manrope; display: flex; align-items: center; gap: 6px; }
`,
  build(root, api) {
    const M = api.modes, V = M[0], A = M[1], I = M[2];
    const light = c => api.mix(c, '#ffffff', 0.7);
    root.style.setProperty('--v', V.color); root.style.setProperty('--a', A.color); root.style.setProperty('--i', I.color);
    const HINT = { video: 'Hover to scrub', audio: 'Recording live', image: 'Hover to compare' };
    root.innerHTML = `<div class="wb-grid">
      <section class="wb-tile wb-hero" style="animation-delay:.02s">
        <div class="wb-top">${api.logo(44, M.map(m => m.color))}<div class="wb-badges"><span><i></i>Works offline</span><span>Your files stay on this computer</span></div></div>
        <div><h1>Strata <em>Studio</em></h1><p>${api.esc(api.tagline)}</p></div>
        <div class="wb-pick">Pick an editor — or press <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><span class="wb-grow"></span><span class="wb-su"></span><button class="wb-cont" data-act="close"${api.tip('Continue', 'Close the welcome screen and keep working.', 'Esc')}>Continue</button></div>
      </section>
      ${M.map((m, i) => `<button class="wb-tile wb-ed wb-${m.id}" data-pick="${m.id}" aria-label="Open the ${m.name} editor" style="--c:${m.color};animation-delay:${0.1 + i * 0.08}s"${api.tip(m.name + ' editor', m.tip, m.key)}>
        <div class="wb-hd"><div class="wb-ic">${api.icon(m.icon, 20)}</div><div class="wb-txt"><h2>${m.name}</h2><p>${m.desc}</p></div><kbd>${m.key}</kbd><div class="wb-go">${api.icon('chevRight', 16, 2.4)}</div></div>
        <div class="wb-pv"><canvas class="wl-cv"></canvas><div class="wb-scrub">${HINT[m.id]}</div><div class="wb-pts">${m.pts.map((p, k) => `<span style="--i:${k}">${p}</span>`).join('')}</div></div></button>`).join('')}
      <section class="wb-tile wb-tip" style="animation-delay:.42s"><span class="wb-lbl">TIP</span><div class="wb-msg"></div><button class="wb-prefs" data-act="convert"${api.tip('Convert files', api.actions[4].tip, 'Alt+4')}>${api.icon('convert', 14)}Convert</button><button class="wb-prefs" data-act="prefs"${api.tip('Preferences', api.actions[3].tip, 'Ctrl+,')}>${api.icon('settings', 14)}Preferences</button></section>
      <button class="wb-tile wb-sm wb-open" data-act="open" style="animation-delay:.3s"${api.tip('Open project', api.actions[0].tip)}><div class="wb-ic">${api.icon('folder', 19)}</div><div class="wb-txt"><b>Open project…</b><span>Or drop a file anywhere</span></div></button>
      <button class="wb-tile wb-sm wb-pal" data-act="palette" style="animation-delay:.36s"${api.tip('Command palette', api.actions[1].tip, 'Ctrl+K')}><div class="wb-ic">${api.icon('command', 19)}</div><div class="wb-txt"><b>Command palette</b><span>Find any tool by name</span></div><kbd>Ctrl</kbd><kbd>K</kbd></button>
      <button class="wb-tile wb-sm wb-keys" data-act="shortcuts" style="animation-delay:.42s"${api.tip('Shortcuts', api.actions[2].tip, '?')}><div class="wb-ic">${api.icon('keyboard', 19)}</div><div class="wb-txt"><b>Shortcuts</b><span>Every key, in one place</span></div><kbd>?</kbd></button>
    </div>`;
    root.querySelector('.wb-su').append(api.startup('Show at startup'));
    const tiles = {};
    M.forEach(m => {
      const el = root.querySelector('.wb-' + m.id), s = api.canvas(el.querySelector('canvas'));
      s.mx = null; s.onResize = () => { s.fresh = true; };
      el.querySelector('.wb-pv').addEventListener('pointermove', e => { const r = s.cv.getBoundingClientRect(); s.mx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); });
      el.addEventListener('pointerleave', () => { s.mx = null; });
      tiles[m.id] = s;
    });
    const hash = i => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
    const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    /* Video: a little film plays on a monitor above its own timeline */
    const VL = 8;
    function drawVideo(s, t) {
      const c = s.ctx, w = s.w, h = s.h;
      const tt = s.mx != null ? s.mx * VL : t % VL;
      s.vt = s.vt == null ? tt : s.vt + (tt - s.vt) * (s.mx != null ? 0.35 : 1);
      const T = s.vt, p = T / VL, mh = Math.round(h * 0.62), th = h - mh;
      const sky = c.createLinearGradient(0, 0, 0, mh); sky.addColorStop(0, '#261a45'); sky.addColorStop(0.5, '#b8452a'); sky.addColorStop(0.78, '#ff9a5c'); sky.addColorStop(1, '#ffd4ae');
      c.fillStyle = sky; c.fillRect(0, 0, w, mh);
      const sx = w * (0.62 - p * 0.08), sy = mh * (0.42 + p * 0.22), sr = mh * 0.11;
      const glow = c.createRadialGradient(sx, sy, 0, sx, sy, sr * 5); glow.addColorStop(0, 'rgba(255,236,200,.85)'); glow.addColorStop(0.2, 'rgba(255,190,120,.35)'); glow.addColorStop(1, 'rgba(255,140,80,0)');
      c.fillStyle = glow; c.fillRect(0, 0, w, mh);
      c.fillStyle = '#fff3dc'; c.beginPath(); c.arc(sx, sy, sr, 0, 7); c.fill();
      ['#8c3a24', '#5a2318', '#2b120d'].forEach((col, k) => {
        const base = mh * (0.66 + k * 0.11), off = T * (14 + k * 30);
        c.fillStyle = col; c.beginPath(); c.moveTo(0, mh);
        for (let x = 0; x <= w + 6; x += 6) c.lineTo(x, base - Math.sin((x + off) * (0.006 + k * 0.003)) * mh * 0.07 - Math.sin((x + off) * 0.017 + k) * mh * 0.025);
        c.lineTo(w, mh); c.fill();
      });
      const ta = smooth(1.8, 2.8, T) * (1 - smooth(5.8, 6.6, T));
      if (ta > 0) { c.save(); c.globalAlpha = ta; c.fillStyle = '#fff'; c.textAlign = 'center'; c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 12; c.font = `italic 400 ${Math.round(mh * 0.17)}px "Playfair Display"`; c.fillText('Golden Hour', w / 2, mh * 0.4 + (1 - ta) * 6); c.font = `700 ${Math.max(9, Math.round(mh * 0.045))}px Manrope`; c.fillText('A  FILM  BY  YOU', w / 2, mh * 0.5); c.restore(); }
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.2;
      const g = 12, L = 14;
      [[g, g, 1, 1], [w - g, g, -1, 1], [g, mh - g, 1, -1], [w - g, mh - g, -1, -1]].forEach(([x, y, dx, dy]) => { c.beginPath(); c.moveTo(x, y + L * dy); c.lineTo(x, y); c.lineTo(x + L * dx, y); c.stroke(); });
      const fr = Math.floor(T * 24);
      c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '600 10.5px "JetBrains Mono"'; c.textAlign = 'left';
      c.fillText(`00:00:${String(Math.floor(fr / 24)).padStart(2, '0')}:${String(fr % 24).padStart(2, '0')}`, g + 6, mh - g - 6);
      c.fillStyle = '#18171d'; c.fillRect(0, mh, w, th);
      const rh = 16, X = sec => 10 + (sec / VL) * (w - 20);
      c.fillStyle = '#1f1e25'; c.fillRect(0, mh, w, rh);
      c.fillStyle = 'rgba(255,255,255,.28)'; c.font = '600 9px "JetBrains Mono"';
      for (let k = 0; k <= VL * 2; k++) { const x = X(k / 2); c.fillRect(x, mh + rh - (k % 2 ? 4 : 7), 1, k % 2 ? 4 : 7); if (k % 4 === 0 && k < VL * 2) c.fillText(k / 2 + 's', x + 3, mh + 10); }
      const top = mh + rh + 5, row = (th - rh - 10) / 3;
      const clip = (a, b, r, col, label, wave) => {
        const x = X(a), x2 = X(b), y = top + r * row + 2, hh = row - 4;
        rr(c, x + 1, y, x2 - x - 2, hh, 5); c.fillStyle = col; c.fill();
        c.save(); c.clip();
        if (wave) { c.fillStyle = 'rgba(10,60,50,.45)'; for (let q = x + 3; q < x2 - 3; q += 3) { const a2 = (0.25 + 0.75 * hash(Math.floor(q / 3))) * (0.4 + 0.6 * Math.abs(Math.sin(q * 0.02))); c.fillRect(q, y + hh / 2 - a2 * hh * 0.38, 2, a2 * hh * 0.76); } }
        c.fillStyle = 'rgba(25,12,6,.85)'; c.font = '700 10px Manrope'; if (hh > 13) c.fillText(label, x + 8, y + hh / 2 + 3.5);
        c.restore();
      };
      clip(1.8, 6.6, 0, light(I.color), 'T  Golden Hour'); clip(0, 4.6, 1, api.mix(V.color, '#fff', 0.2), 'sunset.mp4'); clip(4.6, VL, 1, api.mix(V.color, '#fff', 0.4), 'hills.mp4'); clip(0, VL, 2, api.mix(A.color, '#fff', 0.3), '', true);
      const px = X(T);
      c.fillStyle = '#fff'; c.fillRect(px - 0.75, mh + 4, 1.5, th - 4);
      c.beginPath(); c.moveTo(px - 6, mh + 2); c.lineTo(px + 6, mh + 2); c.lineTo(px, mh + 10); c.fill();
    }
    /* Audio: a voice is being recorded live, with a spectrum and loudness meter */
    const amp = i => { const env = Math.max(0, Math.sin(i * 0.05) * 0.55 + Math.sin(i * 0.011 + 1.3) * 0.5 + 0.1); return Math.min(1, env * (0.3 + 0.7 * hash(i))); };
    function drawAudio(s, t) {
      const c = s.ctx, w = s.w, h = s.h, col = A.color;
      const bg = c.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, api.mix(col, '#000', 0.78)); bg.addColorStop(1, api.mix(col, '#000', 0.88));
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      const wh = h * 0.6, cy = wh * 0.56, head = w * 0.76, px = 3.5, scroll = t * 40;
      c.fillStyle = 'rgba(255,255,255,.07)'; for (let x = 0; x < w; x += 40) c.fillRect(x - (scroll % 40), 22, 1, wh - 22);
      const off = scroll % px, base = Math.floor(scroll / px);
      for (let x = head - off; x > 0; x -= px) { const i = base - Math.round((head - off - x) / px), a = amp(i) * smooth(0, 60, x); const hh = Math.max(1.5, a * wh * 0.4); c.fillStyle = api.rgba(col, 0.35 + 0.65 * smooth(0, head, x)); c.fillRect(x, cy - hh, 2.2, hh * 2); }
      c.fillStyle = '#ff5a4f'; c.fillRect(head, 18, 1.5, wh - 18);
      c.font = '700 10.5px "JetBrains Mono"'; c.textAlign = 'left';
      c.fillStyle = (t % 1.2) < 0.8 ? '#ff5a4f' : 'rgba(255,90,79,.3)'; c.beginPath(); c.arc(16, 18, 4, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.8)'; const sec = Math.floor(t) % 600; c.fillText(`REC  ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`, 26, 22);
      const cur = amp(base), n = 34, sy = wh + 14, sh = h - sy - 12, bw = (w - 28 - 60) / n;
      s.spec = s.spec || new Float32Array(n); s.peak = s.peak || new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const shape = Math.exp(-Math.pow((k - 6) / 9, 2)) * 0.9 + Math.exp(-Math.pow((k - 18) / 6, 2)) * 0.45 + 0.08;
        const v = Math.min(1, cur * shape * (0.7 + 0.5 * hash(k + Math.floor(t * 18) * 31)));
        s.spec[k] += (v - s.spec[k]) * (v > s.spec[k] ? 0.6 : 0.15); s.peak[k] = Math.max(s.spec[k], s.peak[k] - 0.008);
        const x = 14 + k * bw, bh = Math.max(2, s.spec[k] * sh);
        const gr = c.createLinearGradient(0, sy + sh, 0, sy); gr.addColorStop(0, api.mix(col, '#000', 0.35)); gr.addColorStop(1, api.mix(col, '#fff', 0.6));
        c.fillStyle = gr; rr(c, x, sy + sh - bh, bw - 2.5, bh, 2); c.fill();
        c.fillStyle = api.rgba(api.mix(col, '#fff', 0.6), 0.7); c.fillRect(x, sy + sh - s.peak[k] * sh - 3, bw - 2.5, 1.5);
      }
      const mx = w - 52, lu = -14 + Math.sin(t * 0.7) * 0.6 + (cur - 0.4) * 1.5;
      [0, 1].forEach(k => { const x = mx + k * 12, v = Math.min(1, cur * (0.9 + 0.1 * k) + 0.05); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x, sy, 8, sh); const gm = c.createLinearGradient(0, sy + sh, 0, sy); gm.addColorStop(0, col); gm.addColorStop(0.75, '#e8e36b'); gm.addColorStop(1, '#ff5a4f'); c.fillStyle = gm; c.fillRect(x, sy + sh * (1 - v), 8, sh * v); });
      c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '700 10px "JetBrains Mono"'; c.textAlign = 'right'; c.fillText(`${lu.toFixed(1)} LUFS`, w - 14, 22); c.textAlign = 'left';
    }
    /* Image: a landscape photo, flat "raw" on the left and graded on the right */
    function photo(w, h, dpr) {
      const cv = document.createElement('canvas'); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const c = cv.getContext('2d'); c.scale(dpr, dpr);
      const hz = h * 0.6;
      const sky = c.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#5f8fce'); sky.addColorStop(0.65, '#b9cde6'); sky.addColorStop(1, '#f7d7b2');
      c.fillStyle = sky; c.fillRect(0, 0, w, hz);
      const g = c.createRadialGradient(w * 0.7, hz * 0.72, 0, w * 0.7, hz * 0.72, w * 0.45); g.addColorStop(0, 'rgba(255,240,215,.95)'); g.addColorStop(1, 'rgba(255,220,180,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, hz);
      const ridge = (base, a, seed, col, snow) => {
        const pts = []; for (let x = -10; x <= w + 10; x += 5) pts.push([x, base - a * (0.55 * Math.abs(Math.sin(x * 0.009 + seed)) + 0.3 * Math.sin(x * 0.023 + seed * 2) + 0.15 * Math.sin(x * 0.061 + seed))]);
        c.fillStyle = col; c.beginPath(); c.moveTo(-10, hz); pts.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(w + 10, hz); c.fill();
        if (snow) { c.save(); c.clip(); c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.moveTo(-10, 0); pts.forEach(p => c.lineTo(p[0], p[1] + a * 0.18)); c.lineTo(w + 10, 0); c.fill(); c.restore(); }
      };
      ridge(hz * 0.78, hz * 0.42, 1.1, '#8ea3c4', true); ridge(hz * 0.95, hz * 0.3, 4.2, '#53698f', false); ridge(hz * 1.01, hz * 0.12, 7.7, '#2f4a54', false);
      c.save(); c.translate(0, hz * 2); c.scale(1, -1); c.globalAlpha = 0.45; c.drawImage(cv, 0, 0, cv.width, hz * dpr, 0, 0, w, hz); c.restore();
      const lk = c.createLinearGradient(0, hz, 0, h); lk.addColorStop(0, 'rgba(70,110,150,.35)'); lk.addColorStop(1, 'rgba(18,40,62,.95)');
      c.fillStyle = lk; c.fillRect(0, hz, w, h - hz);
      c.fillStyle = 'rgba(255,255,255,.18)'; for (let k = 0; k < 40; k++) { const y = hz + 4 + Math.pow(hash(k), 1.6) * (h - hz); c.fillRect(hash(k + 9) * w, y, 12 + hash(k + 3) * 40, 1); }
      const pine = (x, y, s) => { c.fillStyle = '#16241f'; for (let k = 0; k < 4; k++) { const yy = y - k * s * 0.55, ww = s * (0.75 - k * 0.15); c.beginPath(); c.moveTo(x, yy - s * 0.9); c.lineTo(x - ww, yy); c.lineTo(x + ww, yy); c.fill(); } c.fillRect(x - s * 0.06, y, s * 0.12, s * 0.3); };
      [[0.04, 1.0, 0.24], [0.11, 1.03, 0.18], [0.17, 1.0, 0.13], [0.93, 1.02, 0.22], [0.86, 1.0, 0.15]].forEach(([x, y, s]) => pine(w * x, hz * y + 10, h * s));
      const make = f => { const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height; const oc = o.getContext('2d'); oc.filter = f; oc.drawImage(cv, 0, 0); return o; };
      const graded = make('saturate(1.55) contrast(1.12) brightness(1.03)');
      const gc = graded.getContext('2d'); gc.globalCompositeOperation = 'soft-light'; const warm = gc.createLinearGradient(0, 0, 0, cv.height); warm.addColorStop(0, 'rgba(255,170,90,.55)'); warm.addColorStop(1, 'rgba(0,60,120,.4)'); gc.fillStyle = warm; gc.fillRect(0, 0, cv.width, cv.height);
      return { raw: make('saturate(.4) contrast(.74) brightness(1.12)'), graded };
    }
    function drawImage(s, t) {
      const c = s.ctx, w = s.w, h = s.h;
      if (s.fresh || !s.ph) { s.ph = photo(w, h, s.dpr); s.fresh = false; }
      const target = s.mx != null ? s.mx : 0.5 + Math.sin(t * 0.7) * 0.3;
      s.sp = s.sp == null ? target : s.sp + (target - s.sp) * 0.2;
      const x = w * s.sp;
      c.drawImage(s.ph.raw, 0, 0, w, h);
      c.save(); c.beginPath(); c.rect(x, 0, w - x, h); c.clip(); c.drawImage(s.ph.graded, 0, 0, w, h); c.restore();
      c.fillStyle = '#fff'; c.fillRect(x - 1, 0, 2, h);
      c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 10; c.beginPath(); c.arc(x, h * 0.42, 15, 0, 7); c.fill(); c.shadowBlur = 0;
      c.strokeStyle = '#3a3330'; c.lineWidth = 1.8; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x - 4, h * 0.42 - 5); c.lineTo(x - 8, h * 0.42); c.lineTo(x - 4, h * 0.42 + 5); c.moveTo(x + 4, h * 0.42 - 5); c.lineTo(x + 8, h * 0.42); c.lineTo(x + 4, h * 0.42 + 5); c.stroke();
      const tag = (txt, tx, right) => { c.font = '800 9.5px "JetBrains Mono"'; const tw = c.measureText(txt).width + 14; const xx = right ? tx - tw : tx; c.fillStyle = 'rgba(0,0,0,.38)'; rr(c, xx, 10, tw, 20, 10); c.fill(); c.fillStyle = '#fff'; c.fillText(txt, xx + 7, 23.5); };
      if (x > 70) tag('RAW', 10); if (x < w - 80) tag('EDITED', w - 10, true);
    }
    api.loop(t => {
      const tt = api.reduce ? 2.4 : t;
      for (const [id, s] of Object.entries(tiles)) { if (s.w < 4) continue; s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); if (id === 'video') drawVideo(s, tt); else if (id === 'audio') drawAudio(s, tt); else drawImage(s, tt); }
    });
    const TIPS = [
      'Drag a recording from Audio straight onto the Video timeline — no exporting in between.',
      'Cut out the boring pauses: Remove silences (Ctrl + Shift + S) trims every quiet gap in one go.',
      'Auto captions run on your own computer, so nothing is uploaded.',
      'Right-click almost anything to see what else it can do.',
      'Every theme has its own welcome screen — try a few in Preferences ▸ Appearance.',
    ];
    let ti = 0;
    const msg = root.querySelector('.wb-msg');
    const showTip = () => { msg.classList.add('wb-out'); api.after(300, () => { msg.textContent = TIPS[ti]; msg.classList.remove('wb-out'); ti = (ti + 1) % TIPS.length; }); };
    msg.textContent = TIPS[ti++]; api.every(5200, showTip);
    const eds = [...root.querySelectorAll('.wb-ed')];
    return {
      key(e) {
        if (e.key.startsWith('Arrow')) { const cur = eds.indexOf(document.activeElement); eds[cur < 0 ? 0 : (cur + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 2)) % 3].focus(); return true; }
        return false;
      },
    };
  },
};
})();
