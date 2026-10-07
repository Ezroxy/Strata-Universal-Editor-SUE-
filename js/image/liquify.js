/* Image editor — Liquify (Filter ▸ Liquify, Shift+Ctrl+X).
   Works on a displacement field at preview resolution: every brush edits where each pixel samples from,
   so strokes stay smooth and fully reversible (Reconstruct). OK re-renders the field at full resolution. */
(() => {
'use strict';
const App = window.App, F = App.IF, X = F.X, I = App.I;
const { h, icon, btn } = App;
const clamp = X.clamp;

const TOOLS = [
  ['warp', 'Forward Warp', 'W', 'warp', 'Pushes pixels forward as you drag — reshape a smile, a waistline, a wave.'],
  ['reconstruct', 'Reconstruct', 'R', 'undo', 'Paint to gradually undo the distortion back to the original.'],
  ['smooth', 'Smooth', 'E', 'curve', 'Evens out bumpy, uneven distortions.'],
  ['twirl', 'Twirl Clockwise', 'C', 'rotate', 'Hold to twist pixels clockwise. Hold Alt to twist counter-clockwise.'],
  ['pucker', 'Pucker', 'S', 'minus', 'Hold to pull pixels toward the brush center (makes things smaller). Alt = Bloat.'],
  ['bloat', 'Bloat', 'B', 'plus', 'Hold to push pixels away from the brush center (makes things bigger). Alt = Pucker.'],
  ['push', 'Push Left', 'O', 'move', 'Moves pixels to the left of your drag direction (drag up = push left, down = push right).'],
  ['freeze', 'Freeze Mask', 'F', 'lock', 'Paint over areas you want to protect from changes.'],
  ['thaw', 'Thaw Mask', 'D', 'unlock', 'Erase the freeze mask so the area can be changed again.'],
  ['hand', 'Hand', 'H', 'hand', 'Drag to move around the preview (or hold Space).'],
  ['zoom', 'Zoom', 'Z', 'zoom', 'Click to zoom in, Alt+click to zoom out (or use the mouse wheel).'],
];

I.liquify = () => {
  const L = I.active();
  if (!L) return;
  if (L.locked) return App.toast('Layer is locked', 'warn');
  I.settle(); I.flushDev();
  const tgt = I.target(), full = tgt.src;
  const k = Math.min(1, 1200 / Math.max(full.width, full.height));
  const work = k < 1 ? X.scaled(full, k) : F.clone(full), w = work.width, hh = work.height, n = w * hh;
  const src = X.read(work).data;
  let Dx = new Float32Array(n), Dy = new Float32Array(n), Fz = new Float32Array(n);
  const tmpX = new Float32Array(n), tmpY = new Float32Array(n);
  const opt = { tool: 'warp', size: 100, density: 50, pressure: 100, rate: 80, pin: false, mesh: false, maskShow: true, backdrop: false };
  try { Object.assign(opt, JSON.parse(localStorage.getItem('strata.liquify') || '{}'), { tool: 'warp' }); } catch {}
  const saveOpt = () => { try { localStorage.setItem('strata.liquify', JSON.stringify({ size: opt.size, density: opt.density, pressure: opt.pressure, rate: opt.rate, pin: opt.pin, mesh: opt.mesh, maskShow: opt.maskShow })); } catch {} };

  /* ---------- view ---------- */
  const cv = h('canvas', { class: 'lq-cv', width: w, height: hh }), ctx = cv.getContext('2d');
  const ov = h('canvas', { class: 'lq-ov', width: w, height: hh }), octx = ov.getContext('2d');
  const cursor = h('div', { class: 'lq-cursor' });
  const layer = h('div', { class: 'lq-layer' }, cv, ov);
  const stage = h('div', { class: 'lq-stage' }, layer, cursor);
  const out = ctx.createImageData(w, hh), od = out.data, tmp = [0, 0, 0, 0];
  const view = { z: 1, x: 0, y: 0 };
  const fitView = () => { const r = stage.getBoundingClientRect(); view.z = Math.min((r.width - 24) / w, (r.height - 24) / hh, 4); view.x = (r.width - w * view.z) / 2; view.y = (r.height - hh * view.z) / 2; applyView(); };
  const applyView = () => { layer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`; layer.style.width = w + 'px'; layer.style.height = hh + 'px'; };
  const toWork = e => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z }; };
  const zoomAt = (f, cx, cy) => { const nz = clamp(view.z * f, 0.05, 16); view.x = cx - (cx - view.x) * nz / view.z; view.y = cy - (cy - view.y) * nz / view.z; view.z = nz; applyView(); placeCursor(); };

  /* ---------- rendering ---------- */
  const renderRect = (x0, y0, x1, y1) => {
    x0 = clamp(Math.floor(x0), 0, w); y0 = clamp(Math.floor(y0), 0, hh); x1 = clamp(Math.ceil(x1), 0, w); y1 = clamp(Math.ceil(y1), 0, hh);
    if (x1 <= x0 || y1 <= y0) return;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const j = y * w + x; X.sample(src, w, hh, x + 0.5 + Dx[j], y + 0.5 + Dy[j], od, j * 4, opt.pin ? 'clamp' : 'clamp'); }
    ctx.putImageData(out, 0, 0, x0, y0, x1 - x0, y1 - y0);
  };
  const renderAll = () => { renderRect(0, 0, w, hh); drawOverlay(); };
  const drawOverlay = () => {
    octx.clearRect(0, 0, w, hh);
    if (opt.maskShow) {
      const im = octx.createImageData(w, hh), d = im.data; let any = false;
      for (let j = 0; j < n; j++) if (Fz[j] > 0.01) { any = true; d[j * 4] = 255; d[j * 4 + 1] = 40; d[j * 4 + 2] = 60; d[j * 4 + 3] = Fz[j] * 120; }
      if (any) octx.putImageData(im, 0, 0);
    }
    if (opt.mesh) {
      octx.strokeStyle = 'rgba(160,190,255,.55)'; octx.lineWidth = 1 / view.z; const step = Math.max(12, Math.round(Math.min(w, hh) / 28));
      // first-order forward map: source point u appears near u − D(u)
      const at = (x, y) => { const j = clamp(Math.round(y), 0, hh - 1) * w + clamp(Math.round(x), 0, w - 1); return [x - Dx[j], y - Dy[j]]; };
      octx.beginPath();
      for (let y = 0; y <= hh; y += step) for (let x = 0; x <= w; x += 4) { const [px, py] = at(x, y); x ? octx.lineTo(px, py) : octx.moveTo(px, py); }
      for (let x = 0; x <= w; x += step) for (let y = 0; y <= hh; y += 4) { const [px, py] = at(x, y); y ? octx.lineTo(px, py) : octx.moveTo(px, py); }
      octx.stroke();
    }
  };

  /* ---------- brushes ---------- */
  const radius = () => Math.max(0.5, opt.size / 2 * k);
  const falloff = r => Math.pow(Math.max(0, 1 - r * r), 0.45 + (100 - opt.density) / 36);
  const sampleD = (A, x, y) => {
    x = clamp(x, 0, w - 1); y = clamp(y, 0, hh - 1);
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(hh - 1, y0 + 1), fx = x - x0, fy = y - y0;
    return A[y0 * w + x0] * (1 - fx) * (1 - fy) + A[y0 * w + x1] * fx * (1 - fy) + A[y1 * w + x0] * (1 - fx) * fy + A[y1 * w + x1] * fx * fy;
  };
  /** move the content under the brush: v(x, y, wt) returns the displacement [vx, vy] for a pixel */
  const displaceBrush = (px, py, margin, v) => {
    const R = radius(), x0 = clamp(Math.floor(px - R - margin - 2), 0, w), x1 = clamp(Math.ceil(px + R + margin + 2), 0, w), y0 = clamp(Math.floor(py - R - margin - 2), 0, hh), y1 = clamp(Math.ceil(py + R + margin + 2), 0, hh);
    for (let y = y0; y < y1; y++) { tmpX.set(Dx.subarray(y * w + x0, y * w + x1), y * w + x0); tmpY.set(Dy.subarray(y * w + x0, y * w + x1), y * w + x0); }
    const pr = opt.pressure / 100;
    for (let y = Math.max(0, Math.floor(py - R)); y < Math.min(hh, Math.ceil(py + R)); y++) for (let x = Math.max(0, Math.floor(px - R)); x < Math.min(w, Math.ceil(px + R)); x++) {
      const r = Math.hypot(x + 0.5 - px, y + 0.5 - py) / R;
      if (r >= 1) continue;
      const j = y * w + x, wt = falloff(r) * pr * (1 - Fz[j]);
      if (wt <= 0.0005) continue;
      const [vx, vy] = v(x + 0.5, y + 0.5, wt);
      Dx[j] = sampleD(tmpX, x - vx, y - vy) - vx; Dy[j] = sampleD(tmpY, x - vx, y - vy) - vy;
    }
    return [x0, y0, x1, y1];
  };
  const fieldBrush = (px, py, fn) => {
    const R = radius(), x0 = clamp(Math.floor(px - R), 0, w), x1 = clamp(Math.ceil(px + R), 0, w), y0 = clamp(Math.floor(py - R), 0, hh), y1 = clamp(Math.ceil(py + R), 0, hh);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const r = Math.hypot(x + 0.5 - px, y + 0.5 - py) / R; if (r < 1) fn(y * w + x, falloff(r) * opt.pressure / 100, x, y); }
    return [x0, y0, x1, y1];
  };
  /** apply the current tool once at (px, py); dv = drag since the last step */
  const step = (px, py, dvx, dvy, alt) => {
    const t = opt.tool, rate = opt.rate / 100;
    let box = null;
    if (t === 'warp') { if (!dvx && !dvy) return; box = displaceBrush(px, py, Math.hypot(dvx, dvy), (x, y, wt) => [dvx * wt, dvy * wt]); }
    else if (t === 'push') { if (!dvx && !dvy) return; box = displaceBrush(px, py, Math.hypot(dvx, dvy), (x, y, wt) => [dvy * wt * (alt ? -1 : 1), -dvx * wt * (alt ? -1 : 1)]); }
    else if (t === 'pucker' || t === 'bloat') { const s = ((t === 'pucker') !== !!alt ? 1 : -1) * rate * 0.06; box = displaceBrush(px, py, radius() * 0.1, (x, y, wt) => [(px - x) * wt * s, (py - y) * wt * s]); }
    else if (t === 'twirl') { const dir = alt ? 1 : -1; box = displaceBrush(px, py, radius() * 0.12, (x, y, wt) => { const a = dir * wt * rate * 0.07, rx = x - px, ry = y - py, ca = Math.cos(a), sa = Math.sin(a); return [rx - (rx * ca - ry * sa), ry - (rx * sa + ry * ca)]; }); }
    else if (t === 'reconstruct') box = fieldBrush(px, py, (j, wt) => { const f = 1 - clamp(wt * rate * 0.22 * (1 - Fz[j]), 0, 1); Dx[j] *= f; Dy[j] *= f; });
    else if (t === 'smooth') {
      tmpX.set(Dx); tmpY.set(Dy);
      box = fieldBrush(px, py, (j, wt, x, y) => { let sx = 0, sy = 0, c = 0; for (let dy = -3; dy <= 3; dy += 2) for (let dx = -3; dx <= 3; dx += 2) { const q = clamp(y + dy, 0, hh - 1) * w + clamp(x + dx, 0, w - 1); sx += tmpX[q]; sy += tmpY[q]; c++; } const f = clamp(wt * rate * 0.35 * (1 - Fz[j]), 0, 1); Dx[j] += (sx / c - Dx[j]) * f; Dy[j] += (sy / c - Dy[j]) * f; });
    }
    else if (t === 'freeze') box = fieldBrush(px, py, (j, wt) => { Fz[j] = Math.max(Fz[j], clamp(wt * 1.4, 0, 1)); });
    else if (t === 'thaw') box = fieldBrush(px, py, (j, wt) => { Fz[j] = Fz[j] * (1 - clamp(wt * 1.4, 0, 1)); });
    if (!box) return;
    if (t === 'freeze' || t === 'thaw') { drawOverlay(); return; }
    renderRect(...box);
    if (opt.mesh) drawOverlay();
    edited = true;
  };

  /* ---------- undo inside Liquify ---------- */
  const undo = [], redo = [];
  let edited = false;
  const snap = () => ({ x: Dx.slice(), y: Dy.slice(), f: Fz.slice() });
  const pushUndo = () => { undo.push(snap()); if (undo.length > 30) undo.shift(); redo.length = 0; };
  const restore = s => { Dx = s.x; Dy = s.y; Fz = s.f; renderAll(); };
  const doUndo = () => { if (!undo.length) return App.toast('Nothing to undo in Liquify'); redo.push(snap()); restore(undo.pop()); };
  const doRedo = () => { if (!redo.length) return; undo.push(snap()); restore(redo.pop()); };

  /* ---------- pointer ---------- */
  let spaceDown = false;
  const placeCursor = (e) => {
    if (e) cursor._e = { x: e.clientX, y: e.clientY };
    const p = cursor._e; if (!p) return;
    const r = stage.getBoundingClientRect(), d = opt.size * k * view.z;
    cursor.style.width = cursor.style.height = d + 'px';
    cursor.style.left = (p.x - r.left) + 'px'; cursor.style.top = (p.y - r.top) + 'px';
    cursor.style.display = ['hand', 'zoom'].includes(opt.tool) || spaceDown ? 'none' : '';
  };
  stage.addEventListener('pointermove', placeCursor);
  stage.addEventListener('pointerleave', () => { cursor.style.display = 'none'; });
  stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect(); if (e.ctrlKey || e.altKey || true) zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault(); stage.setPointerCapture(e.pointerId);
    const r = stage.getBoundingClientRect();
    if (opt.tool === 'hand' || spaceDown || e.button === 1) {
      const sx = e.clientX - view.x, sy = e.clientY - view.y;
      const mv = ev => { view.x = ev.clientX - sx; view.y = ev.clientY - sy; applyView(); };
      const up = () => { stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); };
      stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up); return;
    }
    if (opt.tool === 'zoom') { zoomAt(e.altKey ? 1 / 1.5 : 1.5, e.clientX - r.left, e.clientY - r.top); return; }
    pushUndo();
    let last = toWork(e), cur = last, alt = e.altKey;
    const stationary = ['twirl', 'pucker', 'bloat', 'reconstruct', 'smooth', 'freeze', 'thaw'].includes(opt.tool);
    if (stationary) step(cur.x, cur.y, 0, 0, alt);
    const timer = stationary ? setInterval(() => step(cur.x, cur.y, 0, 0, alt), 30) : 0;
    const mv = ev => {
      cur = toWork(ev); alt = ev.altKey;
      if (!stationary) {
        // sub-step long drags so fast strokes stay smooth
        const dx = cur.x - last.x, dy = cur.y - last.y, dist = Math.hypot(dx, dy), stepLen = Math.max(1, radius() * 0.18), nSteps = Math.ceil(dist / stepLen);
        for (let i = 1; i <= nSteps; i++) step(last.x + dx * i / nSteps, last.y + dy * i / nSteps, dx / nSteps, dy / nSteps, alt);
      }
      last = cur; placeCursor(ev);
    };
    const up = () => { clearInterval(timer); stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerup', up); };
    stage.addEventListener('pointermove', mv); stage.addEventListener('pointerup', up);
  });

  /* ---------- panels ---------- */
  const toolBtns = TOOLS.map(([id, label, key, ic, tip]) => btn({ icon: ic, cls: 'tool-btn' + (id === opt.tool ? ' on' : ''), title: label, key, tip, tipPos: 'right', onClick: () => setTool(id) }));
  const setTool = id => { opt.tool = id; toolBtns.forEach((b, i) => b.setOn(TOOLS[i][0] === id)); stage.dataset.tool = id; placeCursor(); };
  const S = (key, label, min, max, tip) => App.slider({ label, min, max, value: opt[key], def: { size: 100, density: 50, pressure: 100, rate: 80 }[key], tip, onInput: v => { opt[key] = v; placeCursor(); saveOpt(); } });
  const sizeRow = S('size', 'Size', 1, 1500, 'Brush diameter in image pixels. [ and ] change it quickly.');
  const props = h('div', { class: 'lq-props' },
    App.section('Brush tool options', 'brush', h('div', null,
      sizeRow, S('density', 'Density', 0, 100, 'How the brush feathers: high = strong to the edge, low = mostly in the middle.'),
      S('pressure', 'Pressure', 1, 100, 'How strongly each stroke distorts.'), S('rate', 'Rate', 0, 100, 'Speed of tools you hold still (Twirl, Pucker, Bloat, Reconstruct, Smooth).'),
      App.toggle({ label: 'Pin edges', value: opt.pin, tip: 'Keeps the image edges in place so no transparent gaps appear.', onChange: v => { opt.pin = v; saveOpt(); renderAll(); } })), { id: 'lq-brush' }),
    App.section('Mask options', 'lock', h('div', null,
      App.toggle({ label: 'Show mask', value: opt.maskShow, tip: 'Show frozen areas in red.', onChange: v => { opt.maskShow = v; saveOpt(); drawOverlay(); } }),
      h('div', { class: 'btn-row wrap', style: { padding: '4px 12px' } },
        btn({ label: 'Freeze all', cls: 'solid txt sm', title: 'Freeze all', tip: 'Protect the whole image (then thaw what you want to change).', onClick: () => { pushUndo(); Fz.fill(1); drawOverlay(); } }),
        btn({ label: 'Invert', cls: 'solid txt sm', title: 'Invert mask', tip: 'Swap frozen and unfrozen areas.', onClick: () => { pushUndo(); for (let j = 0; j < n; j++) Fz[j] = 1 - Fz[j]; drawOverlay(); } }),
        btn({ label: 'Thaw all', cls: 'solid txt sm', title: 'Thaw all', tip: 'Remove the freeze mask.', onClick: () => { pushUndo(); Fz.fill(0); drawOverlay(); } }),
        I.sel ? btn({ label: 'From selection', cls: 'solid txt sm', title: 'Freeze outside selection', tip: 'Freeze everything outside the current selection.', onClick: () => { pushUndo(); const m = X.read(X.resizeTo(I.sel.mask, w, hh)).data; for (let j = 0; j < n; j++) Fz[j] = 1 - m[j * 4 + 3] / 255; drawOverlay(); } }) : null)), { id: 'lq-mask' }),
    App.section('Reconstruct options', 'undo', h('div', null,
      App.slider({ label: 'Amount', min: 0, max: 100, value: 100, def: 100, unit: '%', noReset: true, tip: 'How much of the distortion to keep when you press Reconstruct.', onChange: v => { pushUndo(); const f = v / 100; if (!edited) return; for (let j = 0; j < n; j++) { Dx[j] *= f; Dy[j] *= f; } renderAll(); } }),
      h('div', { class: 'btn-row wrap', style: { padding: '4px 12px' } }, btn({ icon: 'undo', label: 'Restore all', cls: 'solid txt sm', title: 'Restore all', tip: 'Removes every distortion (frozen areas too).', onClick: () => { pushUndo(); Dx.fill(0); Dy.fill(0); renderAll(); } }))), { id: 'lq-rec' }),
    App.section('View options', 'eye', h('div', null,
      App.toggle({ label: 'Show mesh', value: opt.mesh, tip: 'Shows a grid that bends with your edits.', onChange: v => { opt.mesh = v; saveOpt(); drawOverlay(); } }),
      App.toggle({ label: 'Show original', value: false, tip: 'Peek at the untouched image (also: hold the "Before" button).', onChange: v => { cv.style.visibility = v ? 'hidden' : ''; layer.style.background = v ? '' : ''; layer.classList.toggle('orig', v); } })), { id: 'lq-view' }));
  const origImg = h('canvas', { class: 'lq-orig', width: w, height: hh }); origImg.getContext('2d').drawImage(work, 0, 0); layer.prepend(origImg);
  const tools = h('div', { class: 'lq-tools' }, toolBtns);
  const body = h('div', { class: 'lq' }, tools, stage, props);

  const finish = () => {
    if (!edited && !Dx.some(v => v)) return;
    I.busy(true, 'Liquify…');
    setTimeout(() => {
      try {
        const FW = full.width, FH = full.height;
        const res = X.warp(full, (x, y, p) => { const wx = clamp(x * k - 0.5, 0, w - 1), wy = clamp(y * k - 0.5, 0, hh - 1); p[0] = x + sampleD(Dx, wx, wy) / k; p[1] = y + sampleD(Dy, wx, wy) / k; }, 'clamp');
        I.writeTarget(tgt, I.maskWithSel(full, res), 'Liquify', 'drop');
      } finally { I.busy(false); }
    }, 30);
  };
  const onKey = e => {
    if (App.isTyping(e.target)) return;
    const kk = App.combo(e);
    const map = { w: 'warp', r: 'reconstruct', e: 'smooth', c: 'twirl', s: 'pucker', b: 'bloat', o: 'push', f: 'freeze', d: 'thaw', h: 'hand', z: 'zoom' };
    if (map[kk]) { e.preventDefault(); e.stopPropagation(); return setTool(map[kk]); }
    if (kk === '[' || kk === ']') { e.preventDefault(); e.stopPropagation(); opt.size = kk === ']' ? Math.min(1500, Math.round(opt.size * 1.15) + 1) : Math.max(1, Math.round(opt.size / 1.15)); sizeRow.set(opt.size); placeCursor(); saveOpt(); return; }
    if (kk === 'ctrl+z') { e.preventDefault(); e.stopPropagation(); return doUndo(); }
    if (kk === 'ctrl+y' || kk === 'ctrl+shift+z') { e.preventDefault(); e.stopPropagation(); return doRedo(); }
    if (kk === 'ctrl+0') { e.preventDefault(); e.stopPropagation(); return fitView(); }
    if (kk === 'space') { e.preventDefault(); e.stopPropagation(); spaceDown = true; stage.dataset.tool = 'hand'; placeCursor(); }
  };
  const onKeyUp = e => { if (e.key === ' ') { spaceDown = false; stage.dataset.tool = opt.tool; placeCursor(); } };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKeyUp, true);

  const cmp = btn({ icon: 'eye', label: 'Before', cls: 'solid txt sm', title: 'Compare', tip: 'Hold to see the original.' });
  cmp.addEventListener('pointerdown', () => layer.classList.add('orig'));
  ['pointerup', 'pointerleave'].forEach(ev => cmp.addEventListener(ev, () => layer.classList.remove('orig')));
  const md = App.modal({ title: 'Liquify', icon: 'drop', width: Math.min(1500, innerWidth - 40), cls: 'lq-modal', body,
    left: h('div', { class: 'btn-row' }, cmp, btn({ icon: 'undo', cls: 'sm', title: 'Undo', key: 'Ctrl+Z', tip: 'Undo the last Liquify stroke.', onClick: doUndo }), btn({ icon: 'redo', cls: 'sm', title: 'Redo', key: 'Ctrl+Y', tip: 'Redo.', onClick: doRedo }), btn({ icon: 'fit', cls: 'sm', title: 'Fit', key: 'Ctrl+0', tip: 'Fit the image in the window.', onClick: fitView }),
      h('span', { class: 'hint', style: { padding: '0 6px' } }, k < 1 ? `Editing a ${w}×${hh} preview — OK applies it at full ${full.width}×${full.height}.` : '')),
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, tip: 'Apply the distortion to the layer (Ctrl+Z undoes it).', onClick: finish }],
    onClose: () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); } });
  setTool('warp');
  renderAll();
  requestAnimationFrame(fitView);
  I.liquify._debug = { step, get Dx() { return Dx; }, opt, finish, w, h: hh };
  return md;
};
})();
