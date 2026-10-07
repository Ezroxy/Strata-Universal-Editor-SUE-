/* Image editor — tools: paint, select, fill, shapes, editable text, free transform, crop,
   healing brush, clone, retouch… (all mask-aware) */
(() => {
'use strict';
const App = window.App, F = App.IF;
const { h, icon, btn, clamp } = App;
const I = App.I = App.I || {};
const T = I.TOOLS = {};

I.opts = {
  brush: { size: 16, hardness: 0.7, opacity: 1, smooth: 0.35 },
  pencil: { size: 1 },
  eraser: { size: 28, hardness: 0.6, opacity: 1 },
  fill: { tolerance: 32, contiguous: true, all: false, opacity: 1 },
  gradient: { type: 'linear', transparent: false, opacity: 1 },
  shape: { type: 'rect', mode: 'outline', width: 4, radius: 18 },
  text: { font: 'Manrope', size: 64, bold: true, italic: false, align: 'left', color: '#1d1d1f' },
  select: { mode: 'new' },
  wand: { tolerance: 32, contiguous: true, all: false },
  crop: { ratio: 'free' },
  clone: { size: 40, hardness: 0.5, opacity: 1, aligned: true },
  heal: { size: 30, hardness: 0.6 },
  retouch: { mode: 'blur', size: 50, strength: 60, hardness: 0.3 },
  dropper: { all: true },
};

/* ---------- helpers ---------- */
const dabCache = new Map();
function dab(size, hard, color) {
  const key = size.toFixed(1) + '|' + hard.toFixed(2) + '|' + color;
  let c = dabCache.get(key);
  if (c) return c;
  if (dabCache.size > 80) dabCache.clear();
  const d = Math.max(1, Math.ceil(size)) + 2, r = Math.max(0.5, size / 2);
  c = App.canvas(d, d);
  const x = c.getContext('2d');
  if (hard >= 0.99) { x.fillStyle = color; x.beginPath(); x.arc(d / 2, d / 2, r, 0, 7); x.fill(); }
  else {
    const [R, G, B] = App.hexToRgb(color);
    const g = x.createRadialGradient(d / 2, d / 2, r * hard, d / 2, d / 2, r);
    g.addColorStop(0, `rgba(${R},${G},${B},1)`); g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    x.fillStyle = g; x.beginPath(); x.arc(d / 2, d / 2, r, 0, 7); x.fill();
  }
  dabCache.set(key, c);
  return c;
}
const pressureOf = e => (e.pointerType === 'pen' && e.pressure > 0 ? 0.15 + e.pressure * 0.85 : 1);
const modeFrom = (e, base) => e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : base;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** In mask-edit mode tools paint white “coverage”; the stroke's value comes from the chosen color's brightness. */
const paintColor = c => (I.maskEdit ? '#ffffff' : c);

I.floodMask = (id, sx, sy, tol, contiguous) => {
  const { data, width: w, height: hgt } = id, m = new Uint8Array(w * hgt);
  const o = (sy * w + sx) * 4, r0 = data[o], g0 = data[o + 1], b0 = data[o + 2], a0 = data[o + 3];
  const match = i => { const k = i * 4; return Math.abs(data[k] - r0) <= tol && Math.abs(data[k + 1] - g0) <= tol && Math.abs(data[k + 2] - b0) <= tol && Math.abs(data[k + 3] - a0) <= tol; };
  if (!contiguous) { for (let i = 0; i < w * hgt; i++) if (match(i)) m[i] = 1; return m; }
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop(); let x = stack.pop();
    let i = y * w + x;
    while (x >= 0 && !m[i] && match(i)) { x--; i--; }
    x++; i++;
    let up = false, dn = false;
    while (x < w && !m[i] && match(i)) {
      m[i] = 1;
      if (y > 0) { const j = i - w; if (!m[j] && match(j)) { if (!up) { stack.push(x, y - 1); up = true; } } else up = false; }
      if (y < hgt - 1) { const j = i + w; if (!m[j] && match(j)) { if (!dn) { stack.push(x, y + 1); dn = true; } } else dn = false; }
      x++; i++;
    }
  }
  return m;
};
I.maskCanvas = (m, w, hgt, rgb = [255, 255, 255]) => {
  const c = App.canvas(w, hgt), ctx = c.getContext('2d'), id = ctx.createImageData(w, hgt), d = id.data;
  for (let i = 0; i < m.length; i++) if (m[i]) { const k = i * 4; d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = 255; }
  ctx.putImageData(id, 0, 0);
  return c;
};

/* ---------- option-bar control builders ---------- */
const os = (label, o, key, min, max, step, unit, tip, scale = 1, after) => {
  const s = App.slider({ label, min, max, step, value: o[key] * scale, unit, tip, noReset: true, onInput: v => { o[key] = v / scale; I.overlay(); after && after(); } });
  s.classList.add('opt');
  return s;
};
const oseg = (o, key, options, onChange) => App.seg({ value: o[key], options, onChange: v => { o[key] = v; onChange && onChange(v); I.overlay(); } });
const otog = (label, o, key, tip) => { const t = App.toggle({ label, value: o[key], tip, onChange: v => { o[key] = v; } }); t.classList.add('opt'); return t; };
const selModeSeg = o => oseg(o, 'mode', [
  { value: 'new', label: 'New', title: 'New selection', tip: 'Replaces the current selection.' },
  { value: 'add', label: 'Add', title: 'Add to selection', tip: 'Adds to the current selection. Shortcut: hold Shift while dragging.' },
  { value: 'subtract', label: 'Subtract', title: 'Subtract from selection', tip: 'Removes from the current selection. Shortcut: hold Alt.' },
  { value: 'intersect', label: 'Intersect', title: 'Intersect', tip: 'Keeps only the overlap with the current selection. Shortcut: Shift+Alt.' }]);
const selActions = () => [App.sep(),
  btn({ icon: 'cursor', label: 'All', cls: 'sm txt', title: 'Select all', key: 'Ctrl+A', tip: 'Selects the entire canvas.', onClick: () => I.selectAll() }),
  btn({ icon: 'x', label: 'None', cls: 'sm txt', title: 'Deselect', key: 'Ctrl+D', tip: 'Removes the selection.', onClick: () => I.deselect() }),
  btn({ icon: 'swap', label: 'Invert', cls: 'sm txt', title: 'Invert selection', key: 'Ctrl+Shift+I', tip: 'Selects everything that was not selected.', onClick: () => I.invertSel() }),
  btn({ icon: 'feather', label: 'Feather', cls: 'sm txt', title: 'Feather', tip: 'Softens the selection edge so edits blend in smoothly.', onClick: () => I.selectDialog('feather') }),
  btn({ icon: 'crop', label: 'Crop', cls: 'sm txt', title: 'Crop to selection', tip: 'Trims the canvas to the selection’s bounding box.', onClick: () => I.cropToSel() })];

/* =====================================================================
   Paint tools
   ===================================================================== */
function dabTool(cfg) {
  let st = null, s = null;
  return Object.assign({
    cursor: 'none', brushCursor: true, paints: true,
    down(e, p) {
      const o = I.opts[cfg.opt];
      if (I.maskEdit && cfg.mode === 'reveal') { App.toast('This tool works on pixels — click the layer thumbnail (not the mask) first', 'warn'); return; }
      const valueColor = cfg.mask ? '#ffffff' : (e.button === 2 ? I.secondary : I.primary);
      const extra = cfg.begin ? cfg.begin(e, p) : {};
      if (extra === false) return;
      st = I.beginStroke(cfg.mode, Object.assign({ opacity: o.opacity ?? 1, color: cfg.mode === 'erase' ? null : valueColor }, extra));
      s = { last: p, sm: p, color: cfg.mask ? '#ffffff' : paintColor(valueColor), o };
      if (e.shiftKey && I.lastPt && !cfg.noLine) seg(I.lastPt, p, pressureOf(e));
      else put(p, pressureOf(e));
      I.updateStroke();
    },
    move(e, p) {
      if (!st) return;
      const k = 1 - (s.o.smooth || 0) * 0.85;
      const target = { x: s.sm.x + (p.x - s.sm.x) * k, y: s.sm.y + (p.y - s.sm.y) * k };
      s.sm = target;
      seg(s.last, target, pressureOf(e));
      s.last = target;
      I.updateStroke();
    },
    up() {
      if (!st) return;
      I.lastPt = s.last;
      if (cfg.finish) cfg.finish(st);
      else I.endStroke(cfg.label);
      st = null;
    },
  }, cfg.tool);
  function put(p, pr) {
    const size = Math.max(1, s.o.size * pr);
    const img = dab(size, s.o.hardness ?? 1, s.color);
    st.ctx.drawImage(img, p.x - img.width / 2, p.y - img.height / 2);
  }
  function seg(a, b, pr) {
    const d = dist(a, b), step = Math.max(0.5, s.o.size * pr * 0.12), n = Math.ceil(d / step);
    for (let i = 1; i <= n; i++) put({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }, pr);
  }
}

T.brush = dabTool({ opt: 'brush', mode: 'paint', label: 'Brush', tool: {
  name: 'Brush', icon: 'brush', key: 'B', tip: 'Paint soft or hard strokes. Left button = primary color, right button = secondary. Shift-click draws a straight line. [ and ] change the size. On a mask: black hides, white reveals.',
  options: () => { const o = I.opts.brush; return [
    os('Size', o, 'size', 1, 400, 1, 'px', 'Brush diameter.'),
    os('Hardness', o, 'hardness', 0, 100, 1, '%', 'Soft (0%) feathered edges or crisp (100%) edges.', 100),
    os('Opacity', o, 'opacity', 1, 100, 1, '%', 'How see-through the stroke is.', 100),
    os('Smoothing', o, 'smooth', 0, 95, 1, '%', 'Steadies shaky mouse strokes for smoother lines.', 100)]; },
} });
T.pencil = {
  name: 'Pencil', icon: 'pencil', key: 'P', cursor: 'crosshair', paints: true, brushCursor: true,
  tip: 'Hard-edged, pixel-perfect drawing — just like MS Paint. Great for pixel art. Right button draws with the secondary color.',
  options: () => [os('Size', I.opts.pencil, 'size', 1, 64, 1, 'px', 'Square pencil size in pixels.')],
  down(e, p) {
    const c = e.button === 2 ? I.secondary : I.primary;
    this.st = I.beginStroke('paint', { opacity: 1, color: c });
    this.st.ctx.fillStyle = paintColor(c);
    const from = e.shiftKey && I.lastPt ? I.lastPt : p;
    this.line(from, p); this.last = p; I.updateStroke();
  },
  move(e, p) { if (!this.st) return; this.line(this.last, p); this.last = p; I.updateStroke(); },
  up() { if (!this.st) return; I.lastPt = this.last; I.endStroke('Pencil'); this.st = null; },
  line(a, b) {
    const s = Math.max(1, Math.round(I.opts.pencil.size)), o = Math.floor(s / 2);
    let x0 = Math.floor(a.x), y0 = Math.floor(a.y); const x1 = Math.floor(b.x), y1 = Math.floor(b.y);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.st.ctx.fillRect(x0 - o, y0 - o, s, s);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  },
};
T.eraser = dabTool({ opt: 'eraser', mode: 'erase', mask: true, label: 'Eraser', tool: {
  name: 'Eraser', icon: 'eraser', key: 'E', tip: 'Erases to transparency on the active layer (on a mask it reveals the layer again). Shift-click erases in a straight line.',
  options: () => { const o = I.opts.eraser; return [
    os('Size', o, 'size', 1, 400, 1, 'px', 'Eraser diameter.'),
    os('Hardness', o, 'hardness', 0, 100, 1, '%', 'Soft or crisp eraser edge.', 100),
    os('Strength', o, 'opacity', 1, 100, 1, '%', 'Lower values only partially erase.', 100)]; },
} });
T.clone = dabTool({ opt: 'clone', mode: 'reveal', mask: true, label: 'Clone stamp', noLine: true,
  begin(e, p) {
    if (e.altKey) { I.cloneSrc = { x: p.x, y: p.y }; I.cloneOff = null; App.toast('Clone source set — now paint where you want the copy'); I.overlay(); return false; }
    if (!I.cloneSrc) { App.toast('Alt+click a spot to copy from first', 'warn'); return false; }
    if (!I.cloneOff || !I.opts.clone.aligned) I.cloneOff = { x: I.cloneSrc.x - p.x, y: I.cloneSrc.y - p.y };
    return { source: F.clone(I.active().canvas), dx: -I.cloneOff.x, dy: -I.cloneOff.y };
  },
  tool: {
    name: 'Clone stamp', icon: 'stamp', key: 'S', tip: 'Copies pixels from one spot to another — remove dust, wires or unwanted objects by painting over them with a clean area. Alt+click to pick the source, then paint.',
    options: () => { const o = I.opts.clone; return [
      os('Size', o, 'size', 2, 400, 1, 'px', 'Stamp diameter.'),
      os('Hardness', o, 'hardness', 0, 100, 1, '%', 'Soft edges blend in more naturally.', 100),
      os('Opacity', o, 'opacity', 1, 100, 1, '%', 'Partial opacity helps blend repairs.', 100),
      otog('Aligned', o, 'aligned', 'On: the source follows your brush across strokes. Off: every stroke starts again from the source point.')]; },
  } });
T.heal = dabTool({ opt: 'heal', mode: 'heal', mask: true, label: 'Healing brush', noLine: true,
  begin() { if (I.maskEdit) { App.toast('Healing works on pixels — select the layer thumbnail first', 'warn'); return false; } return { opacity: 1 }; },
  finish(st) {
    const L = st.layer, cover = F.clone(st.canvas);
    if (I.sel) { const c = cover.getContext('2d'); c.globalCompositeOperation = 'destination-in'; c.drawImage(I.sel.mask, 0, 0); }
    I.cancelStroke();
    I.busy(true, 'Healing…');
    setTimeout(() => {
      try { if (F.heal(L.canvas, cover, I.opts.heal.size)) { I.ensurePixels(L); I.dirty(L); I.pushHistory('Healing brush', 'bandage'); } }
      finally { I.busy(false); }
    }, 20);
  },
  tool: {
    name: 'Healing brush', icon: 'bandage', key: 'J', tip: 'Paint over a blemish, spot, scratch or small object — Strata finds matching texture nearby and blends it in seamlessly. No source to pick.',
    options: () => { const o = I.opts.heal; return [
      os('Size', o, 'size', 2, 300, 1, 'px', 'Brush diameter — slightly bigger than the spot works best.'),
      os('Hardness', o, 'hardness', 0, 100, 1, '%', 'Softer edges blend the repair more gradually.', 100),
      h('span', { class: 'hint', style: { padding: 0 } }, 'Paint over the spot, then release.')]; },
  } });
const RETOUCH = {
  blur: (c, s) => F.blur(c, 1 + s / 12),
  sharpen: (c, s) => F.sharpen(c, { amount: 40 + s * 2, radius: 1.5, threshold: 2 }),
  lighten: (c, s) => F.cssFilter(c, `brightness(${1 + s / 180})`),
  darken: (c, s) => F.cssFilter(c, `brightness(${1 - s / 260})`),
  desaturate: (c, s) => F.cssFilter(c, `saturate(${1 - s / 100})`),
  saturate: (c, s) => F.cssFilter(c, `saturate(${1 + s / 60})`),
};
T.retouch = dabTool({ opt: 'retouch', mode: 'reveal', mask: true, label: 'Retouch', noLine: true,
  begin() { const o = I.opts.retouch; return { source: RETOUCH[o.mode](I.active().canvas, o.strength), opacity: 1 }; },
  tool: {
    name: 'Retouch brush', icon: 'drop', key: 'R', tip: 'Paint to locally blur, sharpen, lighten (dodge), darken (burn) or change saturation — ideal for skin smoothing and bringing out detail.',
    options: () => { const o = I.opts.retouch; return [
      oseg(o, 'mode', [
        { value: 'blur', label: 'Blur', tip: 'Softens detail — smooth skin or backgrounds.' },
        { value: 'sharpen', label: 'Sharpen', tip: 'Crisps up eyes, textures and edges.' },
        { value: 'lighten', label: 'Dodge', tip: 'Brightens areas you paint.' },
        { value: 'darken', label: 'Burn', tip: 'Darkens areas you paint.' },
        { value: 'desaturate', label: 'Desat', tip: 'Removes color where you paint.' },
        { value: 'saturate', label: 'Saturate', tip: 'Boosts color where you paint.' }]),
      os('Size', o, 'size', 2, 400, 1, 'px', 'Brush diameter.'),
      os('Strength', o, 'strength', 1, 100, 1, '%', 'How strong the effect is.')]; },
  } });

/* ---------- fill & gradient ---------- */
T.fill = {
  name: 'Fill bucket', icon: 'bucket', key: 'G', cursor: 'crosshair', paints: true,
  tip: 'Fills an area of similar color with the primary color (right-click: secondary). Respects the selection. On a mask, fills with black/white/grey.',
  options: () => { const o = I.opts.fill; return [
    os('Tolerance', o, 'tolerance', 0, 255, 1, '', 'How different a color can be and still get filled. Higher = fills more.'),
    os('Opacity', o, 'opacity', 1, 100, 1, '%', 'See-through fill.', 100),
    otog('Contiguous', o, 'contiguous', 'On: only connected pixels. Off: every matching pixel in the image.'),
    otog('All layers', o, 'all', 'Use the combined image (not just this layer) to decide what to fill.')]; },
  down(e, p) {
    const x = Math.floor(p.x), y = Math.floor(p.y), D = I.doc;
    if (x < 0 || y < 0 || x >= D.w || y >= D.h) return;
    const o = I.opts.fill, col = e.button === 2 ? I.secondary : I.primary;
    const src = I.maskEdit ? I.active().mask : o.all ? I.flatten() : I.active().canvas;
    const m = I.floodMask(F.data(src), x, y, o.tolerance, o.contiguous);
    const st = I.beginStroke('paint', { opacity: o.opacity, color: col });
    st.ctx.drawImage(I.maskCanvas(m, D.w, D.h, App.hexToRgb(paintColor(col))), 0, 0);
    I.endStroke('Fill');
  },
};
T.gradient = {
  name: 'Gradient', icon: 'gradient', key: 'Shift+G', cursor: 'crosshair', paints: true,
  tip: 'Drag to fill with a smooth blend from the primary to the secondary color (or to transparent). Fills the selection if there is one. On a mask, makes a smooth fade between visible and hidden.',
  options: () => { const o = I.opts.gradient; return [
    oseg(o, 'type', [{ value: 'linear', label: 'Linear', tip: 'Straight blend along the drag direction.' }, { value: 'radial', label: 'Radial', tip: 'Circular blend from the start point outward.' }]),
    otog('To transparent', o, 'transparent', 'Blend from the primary color into transparency instead of the secondary color.'),
    os('Opacity', o, 'opacity', 1, 100, 1, '%', 'Overall gradient opacity.', 100)]; },
  down(e, p) { this.a = p; this.swap = e.button === 2; this.st = I.beginStroke('paint', { opacity: I.opts.gradient.opacity, color: '#ffffff', replace: true }); this.draw(p); },
  move(e, p) { if (!this.st) return; if (e.shiftKey) { const ang = Math.round(Math.atan2(p.y - this.a.y, p.x - this.a.x) / (Math.PI / 4)) * Math.PI / 4, d = dist(this.a, p); p = { x: this.a.x + Math.cos(ang) * d, y: this.a.y + Math.sin(ang) * d }; } this.b = p; this.draw(p); },
  up() { if (!this.st) return; if (this.b && dist(this.a, this.b) > 2) I.endStroke('Gradient'); else I.cancelStroke(); this.st = null; this.b = null; I.overlay(); },
  draw(p) {
    const o = I.opts.gradient, ctx = this.st.ctx, D = I.doc, a = this.a;
    ctx.clearRect(0, 0, D.w, D.h);
    const g = o.type === 'radial' ? ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(1, dist(a, p))) : ctx.createLinearGradient(a.x, a.y, p.x, p.y);
    const c1 = this.swap ? I.secondary : I.primary, c2 = this.swap ? I.primary : I.secondary;
    const conv = c => I.maskEdit ? `rgba(255,255,255,${App.luma(c)})` : c;
    g.addColorStop(0, conv(c1));
    if (o.transparent) { const [r, gg, b] = App.hexToRgb(c1); g.addColorStop(1, I.maskEdit ? 'rgba(255,255,255,0)' : `rgba(${r},${gg},${b},0)`); } else g.addColorStop(1, conv(c2));
    ctx.fillStyle = g; ctx.fillRect(0, 0, D.w, D.h);
    I.updateStroke();
  },
  overlay(ctx) {
    if (!this.st || !this.b) return;
    const A = I.toScreen(this.a.x, this.a.y), B = I.toScreen(this.b.x, this.b.y);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    for (const q of [A, B]) { ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 7); ctx.stroke(); }
  },
};

/* ---------- shapes ---------- */
I.drawShape = (ctx, type, a, b, o, stroke, fill, mods = {}) => {
  let x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
  if (type === 'line' || type === 'arrow') {
    if (mods.shift) { const ang = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * Math.PI / 4, d = Math.hypot(x1 - x0, y1 - y0); x1 = x0 + Math.cos(ang) * d; y1 = y0 + Math.sin(ang) * d; }
  } else {
    if (mods.shift) { const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * s; y1 = y0 + Math.sign(y1 - y0 || 1) * s; }
    if (mods.alt) { x0 = a.x - (x1 - a.x); y0 = a.y - (y1 - a.y); }
  }
  const L = Math.min(x0, x1), Tp = Math.min(y0, y1), W = Math.abs(x1 - x0), H = Math.abs(y1 - y0), cx = L + W / 2, cy = Tp + H / 2;
  ctx.lineWidth = o.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = stroke; ctx.fillStyle = o.mode === 'fill' ? stroke : fill;
  const p = new Path2D();
  switch (type) {
    case 'rect': p.rect(L, Tp, W, H); break;
    case 'rrect': p.roundRect ? p.roundRect(L, Tp, W, H, Math.min(o.radius, W / 2, H / 2)) : p.rect(L, Tp, W, H); break;
    case 'ellipse': p.ellipse(cx, cy, W / 2 || 0.1, H / 2 || 0.1, 0, 0, Math.PI * 2); break;
    case 'triangle': p.moveTo(cx, Tp); p.lineTo(L + W, Tp + H); p.lineTo(L, Tp + H); p.closePath(); break;
    case 'star': for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.42 : 1, ang = -Math.PI / 2 + i * Math.PI / 5; const x = cx + Math.cos(ang) * W / 2 * r, y = cy + Math.sin(ang) * H / 2 * r; i ? p.lineTo(x, y) : p.moveTo(x, y); } p.closePath(); break;
    case 'heart': p.moveTo(cx, Tp + H * 0.3); p.bezierCurveTo(cx, Tp, L, Tp, L, Tp + H * 0.35); p.bezierCurveTo(L, Tp + H * 0.65, cx, Tp + H * 0.8, cx, Tp + H); p.bezierCurveTo(cx, Tp + H * 0.8, L + W, Tp + H * 0.65, L + W, Tp + H * 0.35); p.bezierCurveTo(L + W, Tp, cx, Tp, cx, Tp + H * 0.3); p.closePath(); break;
    case 'bubble': { const r = Math.min(W, H) * 0.18; p.roundRect ? p.roundRect(L, Tp, W, H * 0.78, r) : p.rect(L, Tp, W, H * 0.78); p.moveTo(L + W * 0.22, Tp + H * 0.78); p.lineTo(L + W * 0.18, Tp + H); p.lineTo(L + W * 0.4, Tp + H * 0.78); break; }
    case 'line': p.moveTo(x0, y0); p.lineTo(x1, y1); ctx.stroke(p); return;
    case 'arrow': {
      const ang = Math.atan2(y1 - y0, x1 - x0), hs = Math.max(10, o.width * 3.5);
      p.moveTo(x0, y0); p.lineTo(x1 - Math.cos(ang) * hs * 0.6, y1 - Math.sin(ang) * hs * 0.6); ctx.stroke(p);
      const hd = new Path2D(); hd.moveTo(x1, y1); hd.lineTo(x1 - Math.cos(ang - 0.45) * hs, y1 - Math.sin(ang - 0.45) * hs); hd.lineTo(x1 - Math.cos(ang + 0.45) * hs, y1 - Math.sin(ang + 0.45) * hs); hd.closePath();
      ctx.fillStyle = stroke; ctx.fill(hd); return;
    }
  }
  if (o.mode !== 'outline') ctx.fill(p);
  if (o.mode !== 'fill') ctx.stroke(p);
};
T.shape = {
  name: 'Shapes', icon: 'shapes', key: 'U', cursor: 'crosshair', paints: true,
  tip: 'Drag to draw rectangles, circles, lines, arrows, stars, speech bubbles and more. Shift = perfect square/circle or 45° line, Alt = draw from center. Outline uses the primary color, fill uses the secondary.',
  options: () => { const o = I.opts.shape; return [
    oseg(o, 'type', [
      { value: 'rect', icon: 'rect', title: 'Rectangle', tip: 'Rectangle (Shift = square).' }, { value: 'rrect', icon: 'rrect', title: 'Rounded rectangle', tip: 'Rectangle with rounded corners.' },
      { value: 'ellipse', icon: 'ellipse', title: 'Ellipse', tip: 'Ellipse (Shift = circle).' }, { value: 'line', icon: 'line', title: 'Line', tip: 'Straight line (Shift = 45° steps).' },
      { value: 'arrow', icon: 'arrow', title: 'Arrow', tip: 'Line with an arrowhead — great for annotations.' }, { value: 'triangle', icon: 'triangle', title: 'Triangle', tip: 'Triangle.' },
      { value: 'star', icon: 'star', title: 'Star', tip: 'Five-pointed star.' }, { value: 'heart', icon: 'heart', title: 'Heart', tip: 'Heart shape.' }, { value: 'bubble', icon: 'bubble', title: 'Speech bubble', tip: 'Comic-style speech bubble — add text on top.' }]),
    oseg(o, 'mode', [
      { value: 'outline', icon: 'outline', title: 'Outline', tip: 'Only the outline, in the primary color.' },
      { value: 'fill', icon: 'fill', title: 'Fill', tip: 'Solid shape in the primary color.' },
      { value: 'both', icon: 'both', title: 'Outline + fill', tip: 'Primary-color outline with a secondary-color fill.' }]),
    os('Line width', o, 'width', 1, 100, 1, 'px', 'Thickness of outlines and lines.'),
    os('Corner radius', o, 'radius', 0, 200, 1, 'px', 'Roundness of rounded rectangles.')]; },
  down(e, p) { this.a = p; this.swap = e.button === 2; this.st = I.beginStroke('paint', { opacity: 1, color: this.swap ? I.secondary : I.primary }); },
  move(e, p) {
    if (!this.st) return;
    this.b = p;
    const D = I.doc; this.st.ctx.clearRect(0, 0, D.w, D.h);
    I.drawShape(this.st.ctx, I.opts.shape.type, this.a, p, I.opts.shape, paintColor(this.swap ? I.secondary : I.primary), paintColor(this.swap ? I.primary : I.secondary), { shift: e.shiftKey, alt: e.altKey });
    I.updateStroke();
  },
  up() { if (!this.st) return; if (this.b && dist(this.a, this.b) > 1) I.endStroke('Shape'); else I.cancelStroke(); this.st = null; this.b = null; },
};

/* ---------- editable text layers ---------- */
const FONTS = ['Manrope', 'Bebas Neue', 'Playfair Display', 'Pacifico', 'Permanent Marker', 'JetBrains Mono', 'Arial', 'Georgia', 'Impact', 'Times New Roman', 'Courier New', 'Comic Sans MS', 'Verdana'];
I.textFont = (o, scale = 1) => `${o.italic ? 'italic ' : ''}${o.bold ? 800 : 500} ${o.size * scale}px "${o.font}", Manrope, sans-serif`;
I.renderText = L => {
  const t = L.text, ctx = L.ctx;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, L.canvas.width, L.canvas.height);
  ctx.font = I.textFont(t); ctx.textBaseline = 'top'; ctx.fillStyle = t.color;
  const lines = t.content.split('\n'), widths = lines.map(l => ctx.measureText(l).width), mw = Math.max(1, ...widths);
  lines.forEach((l, i) => {
    const x = t.align === 'left' ? t.x : t.align === 'center' ? t.x + (mw - widths[i]) / 2 : t.x + mw - widths[i];
    ctx.fillText(l, x, t.y + i * t.size * 1.2 + t.size * 0.08);
  });
  ctx.restore();
  L.textBounds = { x: t.x - 4, y: t.y - 4, w: mw + 8, h: lines.length * t.size * 1.2 + 8 };
  I.dirty(L);
};
const textLayerAt = p => [...I.doc.layers].reverse().find(L => L.visible && L.text && L.textBounds && !L._editing && p.x >= L.textBounds.x && p.x <= L.textBounds.x + L.textBounds.w && p.y >= L.textBounds.y && p.y <= L.textBounds.y + L.textBounds.h);
I.textLayerAt = textLayerAt;
let textHistTimer = 0;
App.on('font-loaded', fam => {
  for (const D of I.docs || []) for (const L of D.layers) if (L.text && L.text.font === fam) {
    const cur = I.doc; if (D !== cur) continue;   // other tabs re-render when they're shown
    I.renderText(L);
  }
  if (I.textEdit) I.styleTextEdit();
});
I.applyTextOpts = () => {
  if (I.textEdit) return I.styleTextEdit();
  const L = I.active();
  if (I.tool !== 'text' || !L || !L.text) return;
  Object.assign(L.text, { font: I.opts.text.font, size: I.opts.text.size, bold: I.opts.text.bold, italic: I.opts.text.italic, align: I.opts.text.align, color: I.opts.text.color });
  I.renderText(L);
  clearTimeout(textHistTimer); textHistTimer = setTimeout(() => I.pushHistory('Text style', 'text'), 500);
};
T.text = {
  name: 'Text', icon: 'text', key: 'T', cursor: 'text',
  tip: 'Click on the image to type. Each text is its own layer and stays editable — click existing text with this tool to change it. Ctrl+Enter or click elsewhere to finish, Esc to cancel.',
  activate() { const L = I.active(); if (L && L.text) Object.assign(I.opts.text, { font: L.text.font, size: L.text.size, bold: L.text.bold, italic: L.text.italic, align: L.text.align, color: L.text.color }); },
  options: () => {
    const o = I.opts.text;
    const fontSel = App.select({ bare: true, label: 'Font', value: o.font, options: App.fontOptions(FONTS, o.font), tip: 'Typeface — includes the fonts extracted from GTA San Andreas and L.A. Noire, and any fonts you import in Settings ▸ Fonts.', onChange: v => {
      o.font = v;
      if (App.isGameFont(v) && o.bold) { o.bold = false; I.optionsUI && setTimeout(I.optionsUI, 0); }   // single-weight fonts: avoid faux bold
      App.ensureFont(v).then(() => I.applyTextOpts()); I.applyTextOpts();
    } });
    const col = App.color({ bare: true, label: 'Text color', value: o.color, tip: 'Color of the text (separate from the paint colors).', onInput: v => { o.color = v; I.applyTextOpts(); } });
    const L = I.active();
    return [fontSel,
      os('Size', o, 'size', 6, 400, 1, 'px', 'Text size in image pixels.', 1, I.applyTextOpts),
      btn({ icon: 'bold', cls: 'sm' + (o.bold ? ' on' : ''), title: 'Bold', tip: 'Heavier letters.', onClick: e => { o.bold = !o.bold; e.currentTarget.classList.toggle('on', o.bold); I.applyTextOpts(); } }),
      btn({ icon: 'italic', cls: 'sm' + (o.italic ? ' on' : ''), title: 'Italic', tip: 'Slanted letters.', onClick: e => { o.italic = !o.italic; e.currentTarget.classList.toggle('on', o.italic); I.applyTextOpts(); } }),
      oseg(o, 'align', [{ value: 'left', icon: 'alignL', title: 'Left', tip: 'Align lines left.' }, { value: 'center', icon: 'alignC', title: 'Center', tip: 'Center lines.' }, { value: 'right', icon: 'alignR', title: 'Right', tip: 'Align lines right.' }], () => I.applyTextOpts()),
      col,
      h('span', { class: 'hint', style: { padding: 0 } }, L && L.text ? 'Editing the selected text layer — click its text to retype it.' : 'Click the canvas to add text.')];
  },
  down(e, p) {
    if (I.textEdit) { I.commitText(); return; }
    const hit = textLayerAt(p);
    if (hit) { I.doc.active = I.doc.layers.indexOf(hit); I.maskEdit = false; I.layersUI(); return I.startText(hit.text.x, hit.text.y, hit); }
    I.startText(p.x, p.y, null);
  },
  deactivate() { if (I.textEdit) I.commitText(); },
};
I.startText = (x, y, layer) => {
  if (layer) Object.assign(I.opts.text, { font: layer.text.font, size: layer.text.size, bold: layer.text.bold, italic: layer.text.italic, align: layer.text.align, color: layer.text.color });
  const ta = h('textarea', { class: 'i-textedit', spellcheck: 'false' });
  if (layer) { ta.value = layer.text.content; layer._editing = true; I.composite(); }
  I.textEdit = { ta, x, y, layer };
  I.vp.append(ta);
  I.styleTextEdit();
  ta.addEventListener('input', () => I.styleTextEdit());
  ta.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); I.cancelText(); }
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); I.commitText(); }
  });
  ta.addEventListener('pointerdown', ev => ev.stopPropagation());
  const focus = () => { if (document.activeElement !== ta && ta.isConnected) { ta.focus(); if (layer) ta.select(); } };
  focus(); setTimeout(focus, 0);
  I.setTool && I.tool !== 'text' && I.setTool('text');
};
I.styleTextEdit = () => {
  const E = I.textEdit;
  if (!E) return;
  const o = I.opts.text, ta = E.ta, s = I.toScreen(E.x, E.y);
  Object.assign(ta.style, { left: s.x + 'px', top: s.y + 'px', font: I.textFont(o, I.zoom), color: o.color, textAlign: o.align, lineHeight: '1.2' });
  const lines = ta.value.split('\n');
  const mc = document.createElement('canvas').getContext('2d'); mc.font = I.textFont(o, I.zoom);
  ta.style.width = Math.max(40, ...lines.map(l => mc.measureText(l).width)) + o.size * I.zoom * 0.6 + 'px';
  ta.style.height = lines.length * o.size * I.zoom * 1.2 + 6 + 'px';
};
I.cancelText = () => { const E = I.textEdit; if (!E) return; E.ta.remove(); I.textEdit = null; if (E.layer) { E.layer._editing = false; I.composite(); } };
I.commitText = () => {
  const E = I.textEdit;
  if (!E) return;
  const txt = E.ta.value.replace(/\s+$/, '');
  E.ta.remove(); I.textEdit = null;
  const o = I.opts.text;
  if (E.layer) {
    E.layer._editing = false;
    if (!txt) { const i = I.doc.layers.indexOf(E.layer); if (i >= 0 && I.doc.layers.length > 1) { I.doc.layers.splice(i, 1); I.doc.active = Math.max(0, Math.min(I.doc.active, I.doc.layers.length - 1)); } I.compositeNow(); I.pushHistory('Delete text', 'trash'); return; }
    if (txt === E.layer.text.content && ['font', 'size', 'bold', 'italic', 'align', 'color'].every(k => E.layer.text[k] === o[k])) { I.composite(); return; }
    Object.assign(E.layer.text, { content: txt, font: o.font, size: o.size, bold: o.bold, italic: o.italic, align: o.align, color: o.color });
    E.layer.name = 'Text: ' + txt.split('\n')[0].slice(0, 18);
    I.renderText(E.layer);
    I.pushHistory('Edit text', 'text');
    return;
  }
  if (!txt) return;
  const L = I.addLayer('Text: ' + txt.split('\n')[0].slice(0, 18));
  L.text = { content: txt, x: E.x, y: E.y, font: o.font, size: o.size, bold: o.bold, italic: o.italic, align: o.align, color: o.color };
  I.renderText(L);
  I.pushHistory('Text', 'text');
  I.optionsUI && I.optionsUI();
};

/* =====================================================================
   Selection tools
   ===================================================================== */
function shapeSelect(kind) {
  return {
    cursor: 'crosshair',
    options: () => [selModeSeg(I.opts.select), ...selActions()],
    down(e, p) { this.a = p; this.b = p; this.mode = modeFrom(e, I.opts.select.mode); this.pts = [p]; },
    move(e, p) {
      if (!this.a) return;
      if (kind === 'lasso') { if (dist(this.pts[this.pts.length - 1], p) > 1 / I.zoom) this.pts.push(p); }
      else if (e.shiftKey && this.mode === 'new') { const s = Math.max(Math.abs(p.x - this.a.x), Math.abs(p.y - this.a.y)); p = { x: this.a.x + Math.sign(p.x - this.a.x || 1) * s, y: this.a.y + Math.sign(p.y - this.a.y || 1) * s }; }
      this.b = p; I.overlay();
    },
    up() {
      if (!this.a) return;
      const path = this.path();
      const tiny = kind === 'lasso' ? this.pts.length < 3 : (Math.abs(this.b.x - this.a.x) < 1 || Math.abs(this.b.y - this.a.y) < 1);
      if (tiny) { if (this.mode === 'new') I.deselect(); }
      else {
        const D = I.doc, m = App.canvas(D.w, D.h), mc = m.getContext('2d');
        mc.fillStyle = '#fff'; mc.fill(path);
        I.setSel(m, path, this.mode);
      }
      this.a = null; I.overlay();
    },
    path() {
      const p = new Path2D(), a = this.a, b = this.b;
      if (kind === 'rect') p.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      else if (kind === 'ellipse') p.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2 || 0.1, Math.abs(b.y - a.y) / 2 || 0.1, 0, 0, Math.PI * 2);
      else { this.pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); p.closePath(); }
      return p;
    },
    overlay(ctx) {
      if (!this.a) return;
      ctx.save();
      const dpr = I.dpr || 1;
      ctx.setTransform(I.zoom * dpr, 0, 0, I.zoom * dpr, I.panX * dpr, I.panY * dpr);
      ctx.lineWidth = 1 / I.zoom;
      ctx.strokeStyle = '#000'; ctx.setLineDash([]); ctx.stroke(this.path());
      ctx.strokeStyle = '#fff'; ctx.setLineDash([4 / I.zoom, 4 / I.zoom]); ctx.stroke(this.path());
      ctx.restore();
      if (kind !== 'lasso') { const s = I.toScreen(Math.min(this.a.x, this.b.x), Math.min(this.a.y, this.b.y)); ctx.fillStyle = '#fff'; ctx.font = '600 11px JetBrains Mono'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.fillText(`${Math.round(Math.abs(this.b.x - this.a.x))} × ${Math.round(Math.abs(this.b.y - this.a.y))}`, s.x, s.y - 6); }
    },
  };
}
T.selRect = Object.assign(shapeSelect('rect'), { name: 'Rectangle select', icon: 'selRect', key: 'M', tip: 'Drag to select a rectangular area. Shift adds, Alt subtracts. Painting and adjustments then only affect the selection.' });
T.selEllipse = Object.assign(shapeSelect('ellipse'), { name: 'Ellipse select', icon: 'selEllipse', key: 'Shift+M', tip: 'Drag to select an oval or (with Shift) a circle.' });
T.lasso = Object.assign(shapeSelect('lasso'), { name: 'Lasso', icon: 'lasso', key: 'L', tip: 'Draw freehand around an area to select it.' });
T.wand = {
  name: 'Magic wand', icon: 'wand', key: 'W', cursor: 'crosshair',
  tip: 'Click to select an area of similar color — e.g. a sky or a plain background. Shift-click adds more, Alt-click subtracts.',
  options: () => { const o = I.opts.wand; return [
    os('Tolerance', o, 'tolerance', 0, 255, 1, '', 'How similar colors must be to get selected.'),
    otog('Contiguous', o, 'contiguous', 'On: only connected areas. Off: matching colors everywhere.'),
    otog('All layers', o, 'all', 'Sample the combined image instead of just the active layer.'),
    selModeSeg(I.opts.select), ...selActions()]; },
  down(e, p) {
    const D = I.doc, x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= D.w || y >= D.h) return;
    const o = I.opts.wand;
    const m = I.floodMask(F.data(o.all ? I.flatten() : I.active().canvas), x, y, o.tolerance, o.contiguous);
    I.setSel(I.maskCanvas(m, D.w, D.h), null, modeFrom(e, I.opts.select.mode));
  },
};

/* =====================================================================
   Move, free transform, crop, eyedropper, hand, zoom
   ===================================================================== */
T.move = {
  name: 'Move', icon: 'move', key: 'V', cursor: 'move',
  tip: 'Drag to move the active layer — or, if there is a selection, just the selected pixels. Text layers stay editable. Arrow keys nudge by 1 px (Shift = 10 px).',
  options: () => [h('span', { class: 'hint', style: { padding: 0 } }, 'Drag inside a selection to move only those pixels. Need to resize or rotate? Use Free transform (Ctrl+T).')],
  down(e, p, forceFloat) {
    const L = I.active();
    if (L.locked) return App.toast('This layer is locked', 'warn');
    this.a = p; this.d = { x: 0, y: 0 };
    const inside = forceFloat != null ? forceFloat : I.sel && I.selHit(p.x, p.y);
    this.text = !inside && !!L.text && !I.maskEdit;
    if (inside) {
      const tgt = I.maskEdit ? L.mask : L.canvas;
      const fl = App.canvas(I.doc.w, I.doc.h), fc = fl.getContext('2d');
      fc.drawImage(tgt, 0, 0); fc.globalCompositeOperation = 'destination-in'; fc.drawImage(I.sel.mask, 0, 0);
      const mask = I.sel.mask, self = this;
      this.st = I.beginStroke('move', {});
      this.st.render = (ctx) => { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(fl, self.d.x, self.d.y); ctx.restore(); };
      this.floating = true;
    } else {
      const self = this, copy = F.clone(I.maskEdit ? L.mask : L.canvas);
      this.st = I.beginStroke('move', {});
      this.st.render = (ctx) => { ctx.save(); ctx.clearRect(0, 0, I.doc.w, I.doc.h); ctx.drawImage(copy, self.d.x, self.d.y); ctx.restore(); };
      if (L.mask && !I.maskEdit) this.st.maskMove = () => self.d;   // the mask travels with its layer
      this.floating = false;
    }
  },
  move(e, p) {
    if (!this.st) return;
    let dx = p.x - this.a.x, dy = p.y - this.a.y;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    this.d = { x: Math.round(dx), y: Math.round(dy) };
    I.updateStroke(); I.overlay();
  },
  up() {
    if (!this.st) return;
    const { x, y } = this.d;
    if (x || y) {
      if (this.text) {
        const L = this.st.layer; I.cancelStroke();
        L.text.x += x; L.text.y += y; if (L.mask) I.shiftMask(L, x, y); I.renderText(L); I.pushHistory('Move text', 'move');
      } else {
        I.endStroke(this.floating ? 'Move selection' : 'Move layer');
        if (this.floating) I.offsetSel(x, y);
      }
    } else I.cancelStroke();
    this.st = null;
  },
  overlayOffset() { return this.st && this.floating ? this.d : null; },
  nudge(dx, dy) { this.down({}, { x: 0, y: 0 }, !!I.sel); if (!this.st) return; this.d = { x: dx, y: dy }; this.up(); },
};

/* ---------- free transform ---------- */
I.contentBounds = cv => {
  const d = F.data(cv).data, w = cv.width, hh = cv.height;
  let x0 = w, y0 = hh, x1 = -1, y1 = -1;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
T.transform = {
  name: 'Free transform', icon: 'transform', key: 'Ctrl+T', cursor: 'default',
  tip: 'Scale, rotate and move the active layer (or the selected pixels) with handles. Corners keep proportions (Shift = free), edges stretch, drag outside the box to rotate (Shift snaps 15°). Enter applies, Esc cancels.',
  activate() {
    const L = I.active();
    this.S = null;
    if (L.locked) { App.toast('This layer is locked', 'warn'); return setTimeout(() => I.setTool('move'), 0); }
    I.flushDev && I.flushDev();
    const tgt = I.maskEdit ? L.mask : L.canvas;
    const float = F.clone(tgt);
    if (I.sel) { const c = float.getContext('2d'); c.globalCompositeOperation = 'destination-in'; c.drawImage(I.sel.mask, 0, 0); }
    const b = I.sel ? { ...I.sel.bounds } : I.contentBounds(float);
    if (!b) { App.toast('Nothing to transform on this layer', 'warn'); return setTimeout(() => I.setTool('move'), 0); }
    const S = this.S = { L, float, b, tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, sel: I.sel && I.sel.mask };
    const st = I.beginStroke('move', {});
    const place = ctx => { ctx.translate(S.b.x + S.b.w / 2 + S.tx, S.b.y + S.b.h / 2 + S.ty); ctx.rotate(S.rot); ctx.scale(S.sx, S.sy); };
    st.render = ctx => {
      ctx.save();
      if (S.sel) { ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(S.sel, 0, 0); ctx.globalCompositeOperation = 'source-over'; }
      else ctx.clearRect(0, 0, I.doc.w, I.doc.h);
      ctx.imageSmoothingQuality = 'high';
      place(ctx);
      ctx.drawImage(S.float, S.b.x, S.b.y, S.b.w, S.b.h, -S.b.w / 2, -S.b.h / 2, S.b.w, S.b.h);
      ctx.restore();
    };
    if (L.mask && !I.maskEdit && !I.sel) {
      // the layer's mask is transformed together with its pixels
      const mfloat = F.clone(L.mask), white = (() => { const d = F.data(L.mask).data, W = L.mask.width, H = L.mask.height; return [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].filter(([x, y]) => d[(y * W + x) * 4 + 3] > 127).length >= 2; })();
      st.maskRender = ctx => {
        ctx.save();
        ctx.clearRect(0, 0, I.doc.w, I.doc.h);
        if (white) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, I.doc.w, I.doc.h); }
        ctx.imageSmoothingQuality = 'high';
        place(ctx);
        ctx.globalCompositeOperation = 'destination-out'; ctx.fillRect(-S.b.w / 2, -S.b.h / 2, S.b.w, S.b.h);
        ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(mfloat, S.b.x, S.b.y, S.b.w, S.b.h, -S.b.w / 2, -S.b.h / 2, S.b.w, S.b.h);
        ctx.restore();
      };
    }
    I.updateStroke(); I.overlay();
  },
  deactivate() { if (this.S) this.apply(); },
  apply() {
    const S = this.S; if (!S) return;
    this.S = null;
    if (S.tx === 0 && S.ty === 0 && S.sx === 1 && S.sy === 1 && S.rot === 0) { I.cancelStroke(); return; }
    I.endStroke('Free transform');
    if (S.sel) I.deselect();
  },
  cancel() { if (!this.S) return; this.S = null; I.cancelStroke(); App.toast('Transform cancelled'); },
  center() { const S = this.S; return { x: S.b.x + S.b.w / 2 + S.tx, y: S.b.y + S.b.h / 2 + S.ty }; },
  local(p) { const c = this.center(), dx = p.x - c.x, dy = p.y - c.y, cs = Math.cos(-this.S.rot), sn = Math.sin(-this.S.rot); return { x: dx * cs - dy * sn, y: dx * sn + dy * cs }; },
  hit(p) {
    const S = this.S; if (!S) return null;
    const l = this.local(p), hw = S.b.w * Math.abs(S.sx) / 2, hh = S.b.h * Math.abs(S.sy) / 2, r = 9 / I.zoom;
    if (Math.hypot(l.x, l.y + hh + 26 / I.zoom) < r * 1.3) return { m: 'rotate' };
    for (const hx of [-1, 0, 1]) for (const hy of [-1, 0, 1]) {
      if (!hx && !hy) continue;
      if (Math.abs(l.x - hx * hw) < r && Math.abs(l.y - hy * hh) < r) return { m: 'scale', hx, hy };
    }
    if (Math.abs(l.x) <= hw && Math.abs(l.y) <= hh) return { m: 'move' };
    return { m: 'rotate' };
  },
  hover(p) {
    const ht = this.hit(p);
    if (!ht) return I.setCursor('default');
    if (ht.m === 'move') return I.setCursor('move');
    if (ht.m === 'rotate') return I.setCursor('alias');
    const ang = (Math.atan2(ht.hy, ht.hx) + this.S.rot) * 180 / Math.PI;
    const a = ((Math.round(ang / 45) % 4) + 4) % 4;
    I.setCursor(['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][a]);
  },
  options() {
    const S = this.S;
    if (!S) return [h('span', { class: 'hint', style: { padding: 0 } }, 'Select a layer with content to transform.')];
    const num = (label, get, set, tip, unit) => {
      const f = h('input', { class: 'num', value: get(), title: label, tip, style: { width: '62px' } });
      f.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') f.blur(); });
      f.addEventListener('change', () => { const v = parseFloat(f.value); if (isFinite(v)) { set(v); I.updateStroke(); I.overlay(); } f.value = get(); });
      this._nums = this._nums || []; this._nums.push(() => { if (document.activeElement !== f) f.value = get(); });
      return h('span', { class: 'ctl', style: { gap: '4px' } }, h('label', null, label), f, unit ? h('span', { class: 'unit' }, unit) : null);
    };
    this._nums = [];
    return [
      num('W', () => Math.round(S.sx * 100), v => S.sx = Math.sign(S.sx || 1) * v / 100, 'Width as a percentage of the original.', '%'),
      num('H', () => Math.round(S.sy * 100), v => S.sy = Math.sign(S.sy || 1) * v / 100, 'Height as a percentage of the original.', '%'),
      num('Angle', () => Math.round(S.rot * 1800 / Math.PI) / 10, v => S.rot = v * Math.PI / 180, 'Rotation in degrees.', '°'),
      btn({ icon: 'flipH', cls: 'sm', title: 'Flip horizontal', tip: 'Mirror left-to-right.', onClick: () => { S.sx *= -1; I.updateStroke(); I.overlay(); } }),
      btn({ icon: 'flipV', cls: 'sm', title: 'Flip vertical', tip: 'Mirror top-to-bottom.', onClick: () => { S.sy *= -1; I.updateStroke(); I.overlay(); } }),
      App.sep(),
      btn({ icon: 'check', label: 'Apply', cls: 'primary txt sm', title: 'Apply transform', key: 'Enter', tip: 'Commits the transform.', onClick: () => { this.apply(); I.setTool('move'); } }),
      btn({ icon: 'x', label: 'Cancel', cls: 'solid txt sm', title: 'Cancel', key: 'Esc', tip: 'Puts everything back.', onClick: () => { this.cancel(); I.setTool('move'); } }),
    ];
  },
  down(e, p) {
    const S = this.S; if (!S) return;
    const ht = this.hit(p);
    this.drag = { ht, p0: p, o: { tx: S.tx, ty: S.ty, sx: S.sx, sy: S.sy, rot: S.rot }, c0: this.center() };
  },
  move(e, p) {
    const S = this.S, D = this.drag; if (!S || !D) return;
    const o = D.o;
    if (D.ht.m === 'move') { S.tx = o.tx + p.x - D.p0.x; S.ty = o.ty + p.y - D.p0.y; }
    else if (D.ht.m === 'rotate') {
      let r = o.rot + Math.atan2(p.y - D.c0.y, p.x - D.c0.x) - Math.atan2(D.p0.y - D.c0.y, D.p0.x - D.c0.x);
      if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
      S.rot = r;
    } else {
      const { hx, hy } = D.ht, cs = Math.cos(o.rot), sn = Math.sin(o.rot);
      // pointer in the original (pre-drag) local frame
      const dx = p.x - D.c0.x, dy = p.y - D.c0.y, lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
      const hw = S.b.w * Math.abs(o.sx) / 2, hh = S.b.h * Math.abs(o.sy) / 2;
      const ax = -hx * hw, ay = -hy * hh;
      let nw = hx ? Math.max(2, (lx - ax) * hx) : hw * 2, nh = hy ? Math.max(2, (ly - ay) * hy) : hh * 2;
      if (hx && hy && !e.shiftKey) { const k = Math.max(nw / (hw * 2), nh / (hh * 2)); nw = hw * 2 * k; nh = hh * 2 * k; }
      if (e.altKey) { nw = hx ? Math.abs(lx) * 2 : nw; nh = hy ? Math.abs(ly) * 2 : nh; }
      S.sx = Math.sign(o.sx || 1) * nw / S.b.w; S.sy = Math.sign(o.sy || 1) * nh / S.b.h;
      const mcx = e.altKey ? 0 : ax + hx * nw / 2, mcy = e.altKey ? 0 : ay + hy * nh / 2;
      S.tx = o.tx + (hx ? mcx : 0) * cs - (hy ? mcy : 0) * sn;
      S.ty = o.ty + (hx ? mcx : 0) * sn + (hy ? mcy : 0) * cs;
    }
    (this._nums || []).forEach(f => f());
    I.updateStroke(); I.overlay();
  },
  up() { this.drag = null; },
  overlay(ctx) {
    const S = this.S; if (!S) return;
    const c = this.center(), hw = S.b.w * Math.abs(S.sx) / 2, hh = S.b.h * Math.abs(S.sy) / 2;
    const pt = (lx, ly) => { const x = c.x + lx * Math.cos(S.rot) - ly * Math.sin(S.rot), y = c.y + lx * Math.sin(S.rot) + ly * Math.cos(S.rot); return I.toScreen(x, y); };
    const corners = [pt(-hw, -hh), pt(hw, -hh), pt(hw, hh), pt(-hw, hh)];
    ctx.strokeStyle = App.cssVar('--accent') || '#a08aff'; ctx.lineWidth = 1.5; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3;
    ctx.beginPath(); corners.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.stroke();
    const top = pt(0, -hh), rot = pt(0, -hh - 26 / I.zoom);
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rot.x, rot.y); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
    for (const [lx, ly] of [[-hw, -hh], [0, -hh], [hw, -hh], [hw, 0], [hw, hh], [0, hh], [-hw, hh], [-hw, 0]]) { const q = pt(lx, ly); ctx.fillRect(q.x - 4.5, q.y - 4.5, 9, 9); ctx.strokeRect(q.x - 4.5, q.y - 4.5, 9, 9); }
    ctx.beginPath(); ctx.arc(rot.x, rot.y, 5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '600 11px JetBrains Mono'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
    ctx.fillText(`${Math.round(S.b.w * Math.abs(S.sx))} × ${Math.round(S.b.h * Math.abs(S.sy))}  ${Math.round(S.rot * 1800 / Math.PI) / 10}°`, corners[0].x, corners[0].y - 10);
  },
};

I.cropRect = null;
const RATIOS = { free: null, orig: 'orig', '1:1': 1, '4:3': 4 / 3, '3:2': 3 / 2, '16:9': 16 / 9, '9:16': 9 / 16, '4:5': 4 / 5, '2:3': 2 / 3 };
T.crop = {
  name: 'Crop', icon: 'crop', key: 'C', cursor: 'crosshair',
  tip: 'Drag the frame handles (or draw a new frame) to choose what to keep, then press Enter or Apply. Pick an aspect ratio for social-media sizes.',
  activate() { const D = I.doc; I.cropRect = { x: 0, y: 0, w: D.w, h: D.h }; I.overlay(); },
  deactivate() { I.cropRect = null; I.overlay(); },
  options: () => { const o = I.opts.crop; return [
    App.select({ bare: true, label: 'Aspect ratio', value: o.ratio, tip: 'Locks the crop frame to a shape. Free lets you drag any size.', options: [['free', 'Free'], ['orig', 'Original'], ['1:1', '1:1 Square'], ['4:3', '4:3'], ['3:2', '3:2'], ['16:9', '16:9 Widescreen'], ['9:16', '9:16 Story'], ['4:5', '4:5 Portrait post'], ['2:3', '2:3']], onChange: v => { o.ratio = v; T.crop.fitRatio(); } }),
    btn({ icon: 'swap', cls: 'sm', title: 'Swap orientation', tip: 'Turns a landscape frame into portrait and back.', onClick: () => { const r = I.cropRect; if (!r) return; const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }; Object.assign(r, { w: r.h, h: r.w, x: c.x - r.h / 2, y: c.y - r.w / 2 }); T.crop.clampRect(); I.overlay(); } }),
    btn({ icon: 'check', label: 'Apply crop', cls: 'primary txt sm', title: 'Apply crop', key: 'Enter', tip: 'Trims the image to the frame.', onClick: () => T.crop.apply() }),
    btn({ icon: 'x', label: 'Reset', cls: 'solid txt sm', title: 'Reset frame', key: 'Esc', tip: 'Resets the frame to the whole image.', onClick: () => T.crop.activate() })]; },
  ratio() { const r = RATIOS[I.opts.crop.ratio]; return r === 'orig' ? I.doc.w / I.doc.h : r; },
  fitRatio() {
    const r = this.ratio(), c = I.cropRect, D = I.doc;
    if (!r || !c) return I.overlay();
    let w = c.w, hh = w / r;
    if (hh > D.h) { hh = D.h; w = hh * r; }
    if (w > D.w) { w = D.w; hh = w / r; }
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    Object.assign(c, { w, h: hh, x: cx - w / 2, y: cy - hh / 2 });
    this.clampRect(); I.overlay();
  },
  clampRect() { const c = I.cropRect, D = I.doc; c.w = Math.min(c.w, D.w); c.h = Math.min(c.h, D.h); c.x = clamp(c.x, 0, D.w - c.w); c.y = clamp(c.y, 0, D.h - c.h); },
  hit(p) {
    const c = I.cropRect; if (!c) return null;
    const tol = 10 / I.zoom;
    const nearL = Math.abs(p.x - c.x) < tol, nearR = Math.abs(p.x - (c.x + c.w)) < tol, nearT = Math.abs(p.y - c.y) < tol, nearB = Math.abs(p.y - (c.y + c.h)) < tol;
    const inX = p.x > c.x - tol && p.x < c.x + c.w + tol, inY = p.y > c.y - tol && p.y < c.y + c.h + tol;
    let hnd = '';
    if (nearT && inX) hnd += 'n'; else if (nearB && inX) hnd += 's';
    if (nearL && inY) hnd += 'w'; else if (nearR && inY) hnd += 'e';
    if (hnd) return hnd;
    if (p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h) return 'move';
    return null;
  },
  hover(p) { const hd = this.hit(p); I.setCursor(!hd ? 'crosshair' : hd === 'move' ? 'move' : { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }[hd]); },
  down(e, p) { if (!I.cropRect) this.activate(); this.mode = this.hit(p) || 'new'; this.a = p; this.o = { ...I.cropRect }; },
  move(e, p) {
    if (!this.mode) return;
    const D = I.doc, c = I.cropRect, o = this.o, r = this.ratio();
    const dx = p.x - this.a.x, dy = p.y - this.a.y;
    if (this.mode === 'move') { c.x = clamp(o.x + dx, 0, D.w - o.w); c.y = clamp(o.y + dy, 0, D.h - o.h); }
    else if (this.mode === 'new') {
      const x0 = clamp(this.a.x, 0, D.w), y0 = clamp(this.a.y, 0, D.h), x1 = clamp(p.x, 0, D.w), y1 = clamp(p.y, 0, D.h);
      let w = Math.abs(x1 - x0), hh = Math.abs(y1 - y0);
      if (r) { if (w / hh > r) w = hh * r; else hh = w / r; }
      Object.assign(c, { x: x1 < x0 ? x0 - w : x0, y: y1 < y0 ? y0 - hh : y0, w, h: hh });
    } else {
      let L = o.x, Tt = o.y, R = o.x + o.w, B = o.y + o.h;
      if (this.mode.includes('w')) L = clamp(o.x + dx, 0, R - 4);
      if (this.mode.includes('e')) R = clamp(R + dx, L + 4, D.w);
      if (this.mode.includes('n')) Tt = clamp(o.y + dy, 0, B - 4);
      if (this.mode.includes('s')) B = clamp(B + dy, Tt + 4, D.h);
      let w = R - L, hh = B - Tt;
      if (r) {
        if (this.mode === 'n' || this.mode === 's') w = hh * r; else hh = w / r;
        if (this.mode.includes('w')) L = R - w;
        if (this.mode.includes('n')) Tt = B - hh;
      }
      Object.assign(c, { x: L, y: Tt, w, h: hh });
      this.clampRect();
    }
    I.overlay();
  },
  up() { this.mode = null; if (I.cropRect && (I.cropRect.w < 2 || I.cropRect.h < 2)) this.activate(); },
  apply() {
    const c = I.cropRect;
    if (!c) return;
    const x = Math.round(c.x), y = Math.round(c.y), w = Math.max(1, Math.round(c.w)), hh = Math.max(1, Math.round(c.h));
    if (x === 0 && y === 0 && w === I.doc.w && hh === I.doc.h) return App.toast('Drag the frame edges inward to choose what to keep');
    I.resizeCanvas(w, hh, -x, -y, 'Crop');
    this.activate();
    I.fit();
  },
  overlay(ctx) {
    const c = I.cropRect;
    if (!c) return;
    const a = I.toScreen(c.x, c.y), b = I.toScreen(c.x + c.w, c.y + c.h), W = ctx.canvas.width / (devicePixelRatio || 1), H = ctx.canvas.height / (devicePixelRatio || 1);
    ctx.fillStyle = 'rgba(0,0,0,.58)';
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const f of [1 / 3, 2 / 3]) { const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f; ctx.moveTo(x, a.y); ctx.lineTo(x, b.y); ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); }
    ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.lineWidth = 4; ctx.beginPath();
    const L = 16;
    for (const [x, y, sx, sy] of [[a.x, a.y, 1, 1], [b.x, a.y, -1, 1], [b.x, b.y, -1, -1], [a.x, b.y, 1, -1]]) { ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); }
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '600 11px JetBrains Mono';
    ctx.fillText(`${Math.round(c.w)} × ${Math.round(c.h)}`, a.x + 6, a.y - 8 > 10 ? a.y - 8 : a.y + 16);
  },
};
T.dropper = {
  name: 'Eyedropper', icon: 'dropper', key: 'I', cursor: 'crosshair',
  tip: 'Click to pick a color from the image as the primary color (right-click sets the secondary). Tip: hold Alt with the brush to pick colors quickly.',
  options: () => [otog('All layers', I.opts.dropper, 'all', 'On: pick the visible color. Off: pick from the active layer only.')],
  down(e, p) { this.pick(e, p); this.on = true; },
  move(e, p) { if (this.on) this.pick(e, p); },
  up() { this.on = false; },
  pick(e, p) {
    const c = I.sample(p.x, p.y, I.opts.dropper.all);
    if (!c || c[3] === 0) return;
    const hex = App.rgbToHex(c[0], c[1], c[2]);
    if (e.button === 2) I.secondary = hex; else I.primary = hex;
    I.updateSwatches();
  },
};
T.hand = {
  name: 'Hand', icon: 'hand', key: 'H', cursor: 'grab',
  tip: 'Drag to scroll around the image. Shortcut: hold Space with any tool, or drag with the middle mouse button.',
  options: () => [h('span', { class: 'hint', style: { padding: 0 } }, 'Ctrl + mouse wheel zooms · plain wheel scrolls')],
  down(e) { this.a = { x: e.clientX, y: e.clientY, px: I.panX, py: I.panY }; I.setCursor('grabbing'); },
  move(e) { if (!this.a) return; I.panX = this.a.px + e.clientX - this.a.x; I.panY = this.a.py + e.clientY - this.a.y; I.applyView(); },
  up() { this.a = null; I.setCursor('grab'); },
};
T.zoom = {
  name: 'Zoom', icon: 'zoom', key: 'Z', cursor: 'zoom-in',
  tip: 'Click to zoom in, Alt+click to zoom out.',
  options: () => [
    btn({ icon: 'fit', label: 'Fit', cls: 'sm txt', title: 'Fit on screen', key: 'Ctrl+0', tip: 'Shows the whole image.', onClick: () => I.fit() }),
    btn({ label: '100%', cls: 'sm txt', title: 'Actual pixels', key: 'Ctrl+1', tip: 'One image pixel per screen pixel.', onClick: () => I.setZoom(1) })],
  down(e) { I.setZoom(I.zoom * (e.altKey ? 1 / 1.5 : 1.5), e.clientX, e.clientY); },
};

I.TOOL_ORDER = ['move', 'transform', 'selRect', 'selEllipse', 'lasso', 'wand', 'crop', '|', 'brush', 'pencil', 'eraser', 'fill', 'gradient', 'shape', 'text', '|', 'heal', 'clone', 'retouch', 'dropper', '|', 'hand', 'zoom'];
})();
