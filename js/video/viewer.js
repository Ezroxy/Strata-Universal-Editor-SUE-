/* Video editor — program viewer: canvas, transport, meters, on-canvas transform handles, key-color picking */
(() => {
'use strict';
const App = window.App, V = App.V;
const { h, icon, btn, clamp } = App;
const P = V.panels;
const tc = t => App.tc(t, V.project.fps);
const O = () => V.ops;
const T = () => V.tl;

/** Value of an animatable property at the playhead (clamped into the clip). */
V.localTime = c => clamp(V.time - c.start, 0, c.dur);
V.getAnimProp = (c, prop) => V.kfVal(c, prop, V.localTime(c));
V.setAnimProp = (c, prop, v) => { if (V.hasKf(c, prop)) V.setKf(c, prop, V.localTime(c), v); else c[prop] = v; };

P.buildViewer = root => {
  const info = h('button', { class: 'tb-pill', title: 'Project settings', tip: 'Frame size and frame rate of your edit. Click to change them in the Inspector.' });
  info.addEventListener('click', () => { V.sel.clear(); V.changed('sel'); });
  const updInfo = () => { info.textContent = `${V.project.width}×${V.project.height} · ${V.project.fps} fps`; };
  const quality = App.select({ bare: true, label: 'Preview quality', value: App.settings.previewQuality, tip: 'Lower preview quality keeps playback smooth on big or effects-heavy projects. Exports always render at full quality.', options: [['auto', 'Auto'], ['full', 'Full'], ['half', '½'], ['quarter', '¼']], onChange: v => App.setSetting('previewQuality', v) });
  quality.style.width = '74px';
  App.on('setting', k => { if (k === 'previewQuality') quality.value = App.settings.previewQuality; });
  const guidesBtn = btn({ icon: 'safe', title: 'Safe-area guides', key: "'", tip: 'Shows title-safe and action-safe frames plus a rule-of-thirds grid to help with framing.', onClick: () => { P.guides = !P.guides; guidesBtn.setOn(P.guides); V.drawOverlay(); } });
  P.toggleGuides = () => guidesBtn.click();
  const stage = h('div', { class: 'viewer-stage' });
  // the current frame as something to carry into the Image editor
  const framePayload = () => { const name = `Frame ${tc(V.time).replace(/:/g, '.')}`; return { kind: 'image', from: 'video', name, icon: 'image', image: () => O().frameBlob(), file: async () => App.xfer.pngFile(await O().frameBlob(), name) }; };
  const frameGrip = btn({ icon: 'image', cls: 't-opt', title: 'Drag this frame', tip: 'Drag the current frame into the Image editor — hold it over the Image tab to switch there, or click to open it in the Image editor right away.', onClick: () => App.xfer.send(framePayload(), 'image') });
  frameGrip.classList.add('xfer-grip');
  App.xfer.source(frameGrip, framePayload);
  // things dragged in from the Audio / Image editors land at the playhead
  App.xfer.zone(stage, { accepts: p => p.from !== 'video', label: p => `Drop to place “${p.name}” at the playhead`, drop: p => App.xfer.receivers.video.receive(p, V.time) });
  const fsBtn = btn({ icon: 'expand', title: 'Fullscreen preview', key: 'F', tip: 'Shows the program full screen. Space plays/pauses, Esc exits.', onClick: () => P.toggleFullscreen() });
  P.toggleFullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen && stage.requestFullscreen().catch(() => App.toast('Fullscreen not available', 'warn')); };
  const head = h('div', { class: 'panel-head' }, h('span', { class: 'panel-title' }, 'Program'), info, h('div', { class: 'grow' }), quality, guidesBtn, fsBtn);

  const box = h('div', { class: 'viewer-box' });
  V.canvas = h('canvas');
  V.ctx = V.canvas.getContext('2d');
  const ov = h('canvas', { class: 'ov' });
  P.ov = ov;
  box.append(V.canvas, ov);
  P.viewerHint = h('div', { class: 'viewer-info' }, 'Drag to move · corner handles scale · top handle rotates · Shift snaps');
  P.badge = h('div', { class: 'viewer-badge', style: { display: 'none' } });
  stage.append(box, P.viewerHint, P.badge);

  const fit = () => {
    const sw = stage.clientWidth - 24, sh = stage.clientHeight - 24;
    if (sw <= 0 || sh <= 0) return;
    const ar = V.project.width / V.project.height;
    let w = sw, hh = w / ar;
    if (hh > sh) { hh = sh; w = hh * ar; }
    box.style.width = Math.floor(w) + 'px'; box.style.height = Math.floor(hh) + 'px';
    V.drawOverlay();
  };
  V.resizeCanvas = () => {
    V.updatePreviewScale();
    V.canvas.width = Math.max(2, Math.round(V.project.width * V.previewScale));
    V.canvas.height = Math.max(2, Math.round(V.project.height * V.previewScale));
    P.badge.style.display = V.previewScale < 1 ? '' : 'none';
    P.badge.textContent = `Preview ${Math.round(V.previewScale * 100)}%`;
    fit(); updInfo(); V.requestRender();
  };
  new ResizeObserver(fit).observe(stage);
  document.addEventListener('fullscreenchange', () => setTimeout(fit, 50));

  const playBtn = btn({ icon: 'play', cls: 'play-btn', title: 'Play / Pause', key: 'Space', tip: 'Starts or stops playback. Use J / K / L to shuttle backward, pause and forward (press repeatedly to go faster).', onClick: () => V.togglePlay() });
  const tcEl = h('div', { class: 'timecode', title: 'Timecode', tip: 'Current position as hours:minutes:seconds:frames, followed by the total length. Click to type a time to jump to.' });
  tcEl.addEventListener('click', async () => {
    const v = await App.prompt('Go to time', 'Type a time (e.g. 1:23, 0:05:12, or 00:01:02:15 with frames)', tc(V.time));
    if (!v) return;
    const parts = v.trim().split(':').map(Number);
    if (parts.some(isNaN)) return App.toast('Could not read that time', 'warn');
    let t = 0;
    if (parts.length === 4) t = parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / V.project.fps;
    else t = parts.reduce((a, b) => a * 60 + b, 0);
    V.pause(); V.seek(V.snapFrame(t)); T().reveal();
  });
  const loopBtn = btn({ icon: 'loop', title: 'Loop', key: 'Ctrl+L', tip: 'Repeats the in/out range (or the whole edit) while playing.', onClick: () => T().toggleLoop() });
  V.onLoopChange = () => loopBtn.setOn(V.loop);
  const meter = h('div', { class: 'meter', title: 'Output level', tip: 'Live loudness of the left and right channels. Keep it out of the red to avoid distortion.' }, h('i', null, h('b')), h('i', null, h('b')));
  const vol = h('input', { type: 'range', min: 0, max: 1.5, step: 0.01, value: 1, style: { width: '70px', flex: 'none' }, title: 'Preview volume', tip: 'Monitoring volume (also applied to exports). Double-click to reset.' });
  vol.addEventListener('input', () => { V.masterVol = +vol.value; if (V.master) V.master.gain.value = V.masterVol; });
  vol.addEventListener('dblclick', () => { vol.value = 1; vol.dispatchEvent(new Event('input')); App.setRangeFill(vol); });
  App.setRangeFill(vol);
  const transport = h('div', { class: 'transport' },
    btn({ icon: 'toStart', title: 'Go to start', key: 'Home', tip: 'Jumps to the beginning of the timeline.', onClick: () => { V.pause(); V.seek(0); T().reveal(); } }),
    btn({ icon: 'stepBack', title: 'Previous frame', key: '←', tip: 'Steps back one frame. Hold Shift to step one second.', onClick: () => V.step(-1) }),
    playBtn,
    btn({ icon: 'stepFwd', title: 'Next frame', key: '→', tip: 'Steps forward one frame. Hold Shift to step one second.', onClick: () => V.step(1) }),
    btn({ icon: 'toEnd', title: 'Go to end', key: 'End', tip: 'Jumps to the end of the last clip.', onClick: () => { V.pause(); V.seek(V.duration()); T().reveal(); } }),
    tcEl,
    btn({ icon: 'trimStart', cls: 't-opt2', title: 'Mark in', key: 'I', tip: 'Sets the start of the range used for looping and range export.', onClick: () => O().setIn() }),
    btn({ icon: 'trimEnd', cls: 't-opt2', title: 'Mark out', key: 'O', tip: 'Sets the end of the range.', onClick: () => O().setOut() }),
    loopBtn,
    h('div', { class: 'grow' }),
    btn({ icon: 'camera', cls: 't-opt', title: 'Snapshot', tip: 'Saves the current frame as a full-resolution PNG image.', onClick: async () => App.download(await O().frameBlob(), `frame-${tc(V.time).replace(/:/g, '-')}.png`) }),
    frameGrip,
    h('span', { style: { color: 'var(--muted)', display: 'flex' } }, icon('volume', 16)), vol, meter,
  );
  root.append(head, stage, transport);

  const updTc = () => { tcEl.innerHTML = ''; tcEl.append(tc(V.time), h('small', null, '  / ' + tc(V.duration()))); };
  V.onTime(updTc);
  V.onChange(() => { updTc(); updInfo(); });
  const meterBars = meter.querySelectorAll('b');
  const buf = new Float32Array(1024);
  const lvl = an => { an.getFloatTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > m) m = v; } return m; };
  let mRaf = 0;
  const meterLoop = () => {
    if (V.anL) [V.anL, V.anR].forEach((an, i) => { const db = App.gainToDb(lvl(an)); meterBars[i].style.height = clamp((db + 48) / 48 * 100, 0, 100) + '%'; });
    if (V.playing) mRaf = requestAnimationFrame(meterLoop); else meterBars.forEach(b => b.style.height = '0');
  };
  V.onPlayState(p => { playBtn.innerHTML = ''; playBtn.append(icon(p ? 'pause' : 'play', 18)); if (p) { cancelAnimationFrame(mRaf); meterLoop(); } });
  setupOverlay(ov, box);
  V.resizeCanvas();
  updTc();
};

/* ---------- overlay: guides + on-canvas transform + key picking ---------- */
const selVisual = () => O().selClips().filter(c => V.isVisual(c) && V.boxes.has(c.id));
V.drawOverlay = () => {
  const ov = P.ov;
  if (!ov) return;
  const dpr = App.fitCanvas(ov);
  const ctx = ov.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ov.width, ov.height);
  const k = ov.width / V.project.width;
  const W = ov.width, H = ov.height;
  if (P.guides) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = dpr; ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
    ctx.strokeRect(W * 0.1, H * 0.1, W * 0.8, H * 0.8);
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.beginPath();
    for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(W * f, 0); ctx.lineTo(W * f, H); ctx.moveTo(0, H * f); ctx.lineTo(W, H * f); }
    ctx.moveTo(W / 2 - 10 * dpr, H / 2); ctx.lineTo(W / 2 + 10 * dpr, H / 2); ctx.moveTo(W / 2, H / 2 - 10 * dpr); ctx.lineTo(W / 2, H / 2 + 10 * dpr);
    ctx.stroke();
  }
  if (P.snapGuide) {
    ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = dpr; ctx.beginPath();
    if (P.snapGuide.x) { ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); }
    if (P.snapGuide.y) { ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); }
    ctx.stroke();
  }
  const showHint = !V.playing && selVisual().length > 0 && !P.pickKey;
  if (P.viewerHint) {
    P.viewerHint.textContent = P.pickKey ? 'Click the background color you want to remove' : 'Drag to move · corner handles scale · top handle rotates · Shift snaps';
    P.viewerHint.style.opacity = showHint || P.pickKey ? '1' : '0';
  }
  if (V.playing) return;
  const acc = App.cssVar('--accent') || '#ff7849';
  for (const c of selVisual()) {
    const b = V.boxes.get(c.id);
    ctx.save();
    ctx.translate(b.cx * k, b.cy * k); ctx.rotate(b.rot);
    const w = b.w * k, hh = b.h * k;
    ctx.strokeStyle = acc; ctx.lineWidth = 1.5 * dpr;
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4 * dpr;
    ctx.strokeRect(-w / 2, -hh / 2, w, hh);
    ctx.beginPath(); ctx.moveTo(0, -hh / 2); ctx.lineTo(0, -hh / 2 - 22 * dpr); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    const hs = 5 * dpr;
    for (const [x, y] of [[-w / 2, -hh / 2], [w / 2, -hh / 2], [w / 2, hh / 2], [-w / 2, hh / 2]]) { ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2); ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2); }
    ctx.beginPath(); ctx.arc(0, -hh / 2 - 22 * dpr, 5 * dpr, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
};
function setupOverlay(ov, box) {
  const toProj = e => { const r = box.getBoundingClientRect(), k = r.width / V.project.width; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, k }; };
  const local = (b, p) => { const dx = p.x - b.cx, dy = p.y - b.cy, cs = Math.cos(-b.rot), sn = Math.sin(-b.rot); return { x: dx * cs - dy * sn, y: dx * sn + dy * cs }; };
  const hitTest = p => {
    for (const c of selVisual()) {
      const b = V.boxes.get(c.id), l = local(b, p), r = 9 / p.k;
      if (Math.hypot(l.x, l.y + b.h / 2 + 22 / p.k) < r * 1.3) return { c, mode: 'rotate', b };
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (Math.abs(l.x - x * b.w / 2) < r && Math.abs(l.y - y * b.h / 2) < r) return { c, mode: 'scale', b };
      if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) return { c, mode: 'move', b };
    }
    return null;
  };
  ov.addEventListener('pointermove', e => {
    if (e.buttons) return;
    if (P.pickKey) { ov.style.cursor = 'crosshair'; return; }
    const ht = hitTest(toProj(e));
    ov.style.cursor = !ht ? 'default' : ht.mode === 'move' ? 'move' : ht.mode === 'scale' ? 'nwse-resize' : 'grab';
  });
  ov.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    V.pause();
    const p0 = toProj(e);
    if (P.pickKey) {
      const c = V.getClip(P.pickKey); P.pickKey = null;
      if (!c) return;
      V.renderFrame(V.time, V.ctx, { noKey: true });
      const s = V.previewScale, px = V.ctx.getImageData(Math.round(p0.x * s), Math.round(p0.y * s), 1, 1).data;
      V.commit('Pick key color');
      c.key.color = App.rgbToHex(px[0], px[1], px[2]); c.key.on = true;
      V.changed('all');
      App.toast('Key color picked — fine-tune Similarity and Smoothness in the Inspector', 'ok');
      return;
    }
    let ht = hitTest(p0);
    if (!ht) {
      const vtr = V.tracks.filter(t => t.type === 'video' && !t.hidden);
      for (const tr of vtr) {
        const c = V.clips.find(k => k.trackId === tr.id && V.boxes.has(k.id) && V.activeIds.has(k.id));
        if (!c) continue;
        const b = V.boxes.get(c.id), l = local(b, p0);
        if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) { ht = { c, mode: 'move', b }; break; }
      }
      V.sel = ht ? new Set([ht.c.id]) : new Set();
      T().markSelection(); V.changed('sel');
      V.drawOverlay();
      if (!ht) return;
    }
    const c = ht.c, b = ht.b;
    if (V.trackLocked(c.trackId)) return App.toast('That track is locked', 'warn');
    const o = { x: V.getAnimProp(c, 'x'), y: V.getAnimProp(c, 'y'), scale: V.getAnimProp(c, 'scale'), rot: V.getAnimProp(c, 'rotation') };
    const d0 = Math.hypot(p0.x - b.cx, p0.y - b.cy), a0 = Math.atan2(p0.y - b.cy, p0.x - b.cx);
    let committed = false;
    ov.setPointerCapture(e.pointerId);
    const mv = ev => {
      const p = toProj(ev);
      if (!committed) { V.commit(ht.mode === 'move' ? 'Move' : ht.mode === 'scale' ? 'Scale' : 'Rotate'); committed = true; }
      if (ht.mode === 'move') {
        let nx = o.x + (p.x - p0.x), ny = o.y + (p.y - p0.y);
        const thr = 10 / p.k;
        P.snapGuide = { x: Math.abs(nx) < thr && !ev.altKey, y: Math.abs(ny) < thr && !ev.altKey };
        if (P.snapGuide.x) nx = 0; if (P.snapGuide.y) ny = 0;
        V.setAnimProp(c, 'x', Math.round(nx)); V.setAnimProp(c, 'y', Math.round(ny));
        T().readout(ev, `X ${Math.round(nx)}  Y ${Math.round(ny)}${V.hasKf(c, 'x') ? '  ◆' : ''}`);
      } else if (ht.mode === 'scale') {
        let s = o.scale * Math.hypot(p.x - b.cx, p.y - b.cy) / Math.max(1, d0);
        if (ev.shiftKey) s = Math.round(s * 20) / 20;
        V.setAnimProp(c, 'scale', clamp(s, 0.02, 20));
        T().readout(ev, `Scale ${Math.round(clamp(s, 0.02, 20) * 100)}%`);
      } else {
        let r = o.rot + (Math.atan2(p.y - b.cy, p.x - b.cx) - a0) * 180 / Math.PI;
        r = ((r + 180) % 360 + 360) % 360 - 180;
        if (ev.shiftKey) r = Math.round(r / 15) * 15;
        V.setAnimProp(c, 'rotation', Math.round(r * 10) / 10);
        T().readout(ev, `Rotation ${Math.round(r * 10) / 10}°`);
      }
      V.requestRender();
      P.refreshValues && P.refreshValues();
    };
    const up = () => { ov.removeEventListener('pointermove', mv); ov.removeEventListener('pointerup', up); P.snapGuide = null; T().readout(null); if (committed) V.changed('props'); V.drawOverlay(); };
    ov.addEventListener('pointermove', mv); ov.addEventListener('pointerup', up);
  });
  ov.addEventListener('dblclick', () => { const c = selVisual()[0]; if (c && c.kind === 'text') P.focusText && P.focusText(); });
}
})();
