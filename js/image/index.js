/* Image editor — documents (tabs), layers with masks & live text, compositing, history, selections,
   panels, menus, dialogs, autosave and .strata project files */
(() => {
'use strict';
const App = window.App, F = App.IF;
const { h, icon, btn, clamp } = App;
const I = App.I;
const T = I.TOOLS;
/** Everything that belongs to one open image (swapped in/out when switching tabs). */
const docState = () => ({ history: [], hIndex: -1, sel: null, lastSel: null, zoom: 1, panX: 0, panY: 0, layerN: 0, cloneSrc: null, cloneOff: null, maskEdit: false, maskView: false, dev: { ...F.DEV_DEFAULTS }, devSession: null, lastPt: null, cropRect: null });
const STATE_KEYS = Object.keys(docState());
Object.assign(I, docState(), {
  docs: [], doc: null, dpr: 1, tool: 'brush', primary: '#1d1d1f', secondary: '#ffffff',
  stroke: null, preview: null, clip: null, panel: 'layers', ruby: false,
});
const VIEW = I.view = { grid: false, gridSize: 64, rulers: false, pixelGrid: true };
try { Object.assign(VIEW, JSON.parse(localStorage.getItem('strata.i.view') || '{}')); } catch {}
const saveView = () => { try { localStorage.setItem('strata.i.view', JSON.stringify(VIEW)); } catch {} I.overlay && I.overlay(); };
I.saveView = saveView;
/** [width, height, background] for new canvases (Preferences ▸ Projects) */
const newDocSpec = () => { const n = App.settings.newImage || {}; return [n.w || 1280, n.h || 800, { transparent: 'transparent', black: '#000000' }[n.bg] || '#ffffff']; };

const PALETTE = ['#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4', '#1d1d1f', '#5c4033', '#ff6fae', '#35d6b4',
  '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7', '#9d84ff', '#ff7849', '#2b59c3', '#f5f5dc'];
const HIST_ICON = { 'New image': 'fileNew', Brush: 'brush', Pencil: 'pencil', Eraser: 'eraser', Fill: 'bucket', Gradient: 'gradient', Shape: 'shapes', Text: 'text', 'Edit text': 'text', 'Move text': 'move', Crop: 'crop', 'Clone stamp': 'stamp', Retouch: 'drop', 'Healing brush': 'bandage', 'Move layer': 'move', 'Move selection': 'move', 'Free transform': 'transform', Adjust: 'sliders' };

/* =====================================================================
   Layers & documents
   ===================================================================== */
const scratch = {};
I.scratch = name => {
  const D = I.doc;
  let s = scratch[name];
  if (!s || s.canvas.width !== D.w || s.canvas.height !== D.h) { const c = App.canvas(D.w, D.h); s = scratch[name] = { canvas: c, ctx: c.getContext('2d') }; }
  return s;
};
// Versions are globally unique so history snapshots and autosave blobs can be shared safely.
let verSeq = 0;
const bump = L => (L.ver = ++verSeq);
const bumpM = L => (L.mver = ++verSeq);
const mkLayer = (name, w, hh) => { const c = App.canvas(w, hh); return { id: App.uid('L'), name, canvas: c, ctx: c.getContext('2d'), visible: true, opacity: 1, blend: 'source-over', locked: false, ver: ++verSeq, mask: null, mver: 0, maskOn: true, text: null, textBounds: null }; };
const whiteMask = (w, hh) => { const c = App.canvas(w, hh), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh); return c; };
const mkDoc = (w, hh, name) => ({ id: App.uid('D'), w, h: hh, name, layers: [], active: 0, fresh: false, _st: null });
/** does this mask mostly reveal (white) at its corners? decides how newly exposed mask areas are filled */
const maskBgWhite = m => { const d = F.data(m).data, W = m.width, H = m.height; let n = 0; for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) if (d[(y * W + x) * 4 + 3] > 127) n++; return n >= 2; };

I.active = () => I.doc && I.doc.layers[I.doc.active];
I.addLayer = (name, at) => {
  const L = mkLayer(name || 'Layer ' + (++I.layerN), I.doc.w, I.doc.h);
  const idx = at ?? I.doc.active + 1;
  I.doc.layers.splice(idx, 0, L);
  I.doc.active = idx;
  I.maskEdit = false;
  I.layersUI();
  return L;
};
I.dirty = (L, mask) => { if (mask) bumpM(L); else bump(L); I.composite(); I.thumbsSoon(); };
I.ensurePixels = (L, silent) => {
  if (!L || !L.text) return;
  L.text = null; L.textBounds = null;
  if (!silent) App.toast(`“${L.name}” was converted to pixels — its text is no longer editable (Ctrl+Z undoes)`, '', 4200);
};
I.shiftMask = (L, dx, dy) => {
  if (!L.mask || (!dx && !dy)) return;
  const D = I.doc, m = App.canvas(D.w, D.h), c = m.getContext('2d');
  if (maskBgWhite(L.mask)) { c.fillStyle = '#fff'; c.fillRect(0, 0, D.w, D.h); c.clearRect(dx, dy, D.w, D.h); }
  c.drawImage(L.mask, dx, dy);
  L.mask = m; bumpM(L);
};
I.masked = L => {
  if (!L.mask || !L.maskOn) return L.canvas;
  const c = F.clone(L.canvas), x = c.getContext('2d');
  x.globalCompositeOperation = 'destination-in'; x.drawImage(L.mask, 0, 0);
  return c;
};

/* ---------- multiple documents ---------- */
const stash = () => { if (!I.doc) return; const s = {}; for (const k of STATE_KEYS) s[k] = I[k]; I.doc._st = s; };
const unstash = D => { const s = D._st || docState(); for (const k of STATE_KEYS) I[k] = s[k]; };
/** Finish any in-progress interaction (text typing, free transform) before structural changes. */
I.settle = (cancel) => {
  if (!I.doc) return;
  if (I.textEdit) cancel ? I.cancelText() : I.commitText();
  if (T.transform.S) { cancel ? T.transform.cancel() : T.transform.apply(); }
};
I.pristine = () => !!(I.doc && I.doc.fresh && I.history.length <= 1);
I.switchDoc = D => {
  if (!D || D === I.doc) return;
  I.settle(); I.flushDev();
  stash();
  I.preview = null; I.stroke = null;
  I.doc = D; unstash(D);
  I.disp.width = D.w; I.disp.height = D.h;
  if (!I.history.length) I.pushHistory(D._openLabel || 'Open', D._openIcon || 'folder');
  if (!D._fitOk) I.fit(); else I.applyView();
  if (I.tool === 'transform') I.setTool('move');
  else if (I.tool === 'crop') T.crop.activate();
  I.compositeNow(); I.layersUI(); I.historyUI(); I.statusUI(); I.devUI && I.devUI(); I.docTabsUI(); optionsUI(); I.overlay();
  I.saveSoon();
};
/** Adds a document as a new tab (replacing an untouched blank canvas). */
I.addDoc = (D, at) => {
  if (I.pristine() && I.docs.length) { I.settle(); I.docs.splice(I.docs.indexOf(I.doc), 1, D); I.doc = null; }
  else I.docs.splice(at ?? I.docs.length, 0, D);
  I.switchDoc(D);
  return D;
};
I.newDoc = (w, hh, bg = '#ffffff', name = 'Untitled') => {
  const D = mkDoc(w, hh, name);
  const L = mkLayer(bg === 'transparent' ? 'Layer 1' : 'Background', w, hh);
  if (bg !== 'transparent') { L.ctx.fillStyle = bg; L.ctx.fillRect(0, 0, w, hh); }
  D.layers.push(L);
  D.fresh = true; D._openLabel = 'New image'; D._openIcon = 'fileNew';
  return I.addDoc(D);
};
I.closeDoc = (D = I.doc) => {
  const i = I.docs.indexOf(D);
  if (i < 0) return;
  const cur = D === I.doc;
  if (cur) { I.settle(); I.flushDev(); stash(); }
  const edited = !!(D._st && D._st.history.length > 1) || !D.fresh;
  I.docs.splice(i, 1);
  if (cur) {
    I.doc = null;
    if (I.docs.length) I.switchDoc(I.docs[Math.min(i, I.docs.length - 1)]);
    else I.newDoc(...newDocSpec(), 'Untitled');
  }
  I.docTabsUI(); I.saveSoon();
  if (edited) App.toast(`Closed “${D.name}”`, '', 5000, { label: 'Undo', fn: () => I.addDoc(D, Math.min(i, I.docs.length)) });
};
I.duplicateDoc = () => {
  I.settle(); I.flushDev();
  const S = I.doc, D = mkDoc(S.w, S.h, S.name + ' copy');
  D.layers = S.layers.map(L => cloneLayer(L, L.name));
  D.active = S.active; D._openLabel = 'Duplicate image'; D._openIcon = 'copy';
  I.addDoc(D);
};
const cloneLayer = (L, name) => {
  const N = mkLayer(name, I.doc.w, I.doc.h);
  N.ctx.drawImage(L.canvas, 0, 0);
  Object.assign(N, { opacity: L.opacity, blend: L.blend, visible: L.visible, maskOn: L.maskOn, text: L.text ? { ...L.text } : null, textBounds: L.textBounds ? { ...L.textBounds } : null });
  if (L.mask) { N.mask = F.clone(L.mask); bumpM(N); }
  return N;
};
I.openImage = async (blob, name = 'Image', asLayer = false, at = null) => {
  const url = URL.createObjectURL(blob);
  let img;
  try { img = await App.loadImage(url); } catch { URL.revokeObjectURL(url); return App.toast('Could not open this image', 'err'); }
  URL.revokeObjectURL(url);
  let w = img.naturalWidth || 800, hh = img.naturalHeight || 600;
  const k = Math.min(1, 8192 / Math.max(w, hh));
  if (k < 1) { w = Math.round(w * k); hh = Math.round(hh * k); App.toast('Large image scaled down to ' + w + '×' + hh, 'warn'); }
  const base = (name || 'Image').replace(/\.[^.]+$/, '') || 'Image';
  if (asLayer && I.doc) {
    I.settle(); I.flushDev();
    const L = I.addLayer(base.slice(0, 28));
    const s = Math.min(1, I.doc.w / w, I.doc.h / hh), dw = w * s, dh = hh * s;
    L.ctx.imageSmoothingQuality = 'high';
    // centred on the drop point when dragged in, otherwise on the canvas
    const cx = at ? at.x : I.doc.w / 2, cy = at ? at.y : I.doc.h / 2;
    L.ctx.drawImage(img, Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);
    I.dirty(L); I.pushHistory('Add image layer', 'image');
  } else {
    const D = mkDoc(w, hh, base);
    const L = mkLayer('Background', w, hh);
    L.ctx.imageSmoothingQuality = 'high';
    L.ctx.drawImage(img, 0, 0, w, hh);
    D.layers.push(L);
    D._openLabel = 'Open ' + base.slice(0, 24); D._openIcon = 'folder';
    I.addDoc(D);
  }
  I.workflowUI();
};
I.flatten = (layers) => {
  const D = I.doc, c = App.canvas(D.w, D.h), ctx = c.getContext('2d');
  for (const L of layers || D.layers) { if (!L.visible) continue; ctx.globalAlpha = L.opacity; ctx.globalCompositeOperation = L.blend; ctx.drawImage(I.masked(L), 0, 0); }
  return c;
};
I.sample = (x, y, all) => {
  const D = I.doc; x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= D.w || y >= D.h) return null;
  const src = all ? I.disp : I.active().canvas;
  return Array.from(src.getContext('2d').getImageData(x, y, 1, 1).data);
};

/* ---------- history (structural sharing by version) ---------- */
I.pushHistory = (label, ic) => {
  const D = I.doc, prev = I.history[I.hIndex];
  const same = prev && prev.w === D.w && prev.h === D.h;
  const state = {
    label, icon: ic || HIST_ICON[label] || 'history', w: D.w, h: D.h, active: D.active, maskEdit: I.maskEdit,
    layers: D.layers.map(L => {
      const pl = same && prev.layers.find(p => p.id === L.id);
      return {
        id: L.id, name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, ver: L.ver, mver: L.mver, maskOn: L.maskOn,
        text: L.text ? { ...L.text } : null, tb: L.textBounds ? { ...L.textBounds } : null,
        copy: pl && pl.ver === L.ver ? pl.copy : F.clone(L.canvas),
        mcopy: !L.mask ? null : pl && pl.mcopy && pl.mver === L.mver ? pl.mcopy : F.clone(L.mask),
      };
    }),
  };
  I.history = I.history.slice(0, I.hIndex + 1);
  I.history.push(state);
  while (I.history.length > App.undoLimit(50)) I.history.shift();
  I.hIndex = I.history.length - 1;
  if (I.history.length > 1) D.fresh = false;
  I.historyUI(); I.layersUI(); I.statusUI();
  I.saveSoon();
};
I.goHistory = i => {
  if (i < 0 || i >= I.history.length || i === I.hIndex) return;
  I.cancelText && I.cancelText();
  if (T.transform.S) T.transform.S = null;
  I.preview = null; I.stroke = null; I.devReset(true);
  const s = I.history[i], D = I.doc;
  const sizeChanged = s.w !== D.w || s.h !== D.h;
  const old = new Map(D.layers.map(L => [L.id, L]));
  D.w = s.w; D.h = s.h; D.active = Math.min(s.active, s.layers.length - 1);
  D.layers = s.layers.map(sl => {
    const cur = old.get(sl.id);
    let L;
    if (cur && cur.ver === sl.ver && !sizeChanged) L = cur;   // pixels unchanged → reuse
    else { L = mkLayer(sl.name, s.w, s.h); L.ctx.drawImage(sl.copy, 0, 0); }
    Object.assign(L, { id: sl.id, name: sl.name, visible: sl.visible, opacity: sl.opacity, blend: sl.blend, locked: sl.locked, ver: sl.ver, maskOn: sl.maskOn,
      text: sl.text ? { ...sl.text } : null, textBounds: sl.tb ? { ...sl.tb } : null });
    if (!sl.mcopy) L.mask = null;
    else if (!(cur && cur === L && cur.mask && cur.mver === sl.mver)) L.mask = F.clone(sl.mcopy);
    L.mver = sl.mver;
    return L;
  });
  I.maskEdit = !!(s.maskEdit && I.active().mask);
  if (!I.maskEdit) I.maskView = false;
  I.hIndex = i;
  if (sizeChanged) { I.disp.width = D.w; I.disp.height = D.h; I.sel = null; I.fit(); }
  if (I.tool === 'crop') T.crop.activate();
  if (I.tool === 'transform') I.setTool('move');
  I.compositeNow(); I.historyUI(); I.layersUI(); I.statusUI(); I.overlay(); I.docTabsUI(); optionsUI();
  I.saveSoon();
};
I.undo = () => {
  if (I.textEdit) return I.cancelText();
  if (T.transform.S) { T.transform.cancel(); return I.setTool('move'); }
  if (I.hIndex <= 0) return App.toast('Nothing to undo');
  I.goHistory(I.hIndex - 1); App.toast('Undo · ' + I.history[I.hIndex + 1].label);
};
I.redo = () => { if (I.hIndex >= I.history.length - 1) return App.toast('Nothing to redo'); I.goHistory(I.hIndex + 1); App.toast('Redo · ' + I.history[I.hIndex].label); };

/* ---------- compositing & strokes ---------- */
let compPending = false;
I.composite = () => { if (compPending) return; compPending = true; requestAnimationFrame(() => { compPending = false; I.compositeNow(); }); };
function layerSrc(L) {
  const st = I.stroke, D = I.doc;
  if (st && st.layer === L && st.target !== 'mask') {
    const s = I.scratch('comp');
    s.ctx.globalCompositeOperation = 'source-over'; s.ctx.globalAlpha = 1;
    s.ctx.clearRect(0, 0, D.w, D.h); s.ctx.drawImage(L.canvas, 0, 0);
    renderStroke(st, s.ctx);
    return s.canvas;
  }
  if (I.preview && I.preview.layer === L && !I.preview.mask && I.preview.show !== false) return I.preview.canvas;
  return L.canvas;
}
function maskSrc(L) {
  const st = I.stroke, D = I.doc;
  if (st && st.layer === L && (st.target === 'mask' || st.maskMove || st.maskRender)) {
    const s = I.scratch('mcomp');
    s.ctx.globalCompositeOperation = 'source-over'; s.ctx.globalAlpha = 1;
    s.ctx.clearRect(0, 0, D.w, D.h);
    if (st.target === 'mask') { s.ctx.drawImage(L.mask, 0, 0); renderStroke(st, s.ctx); }
    else if (st.maskRender) st.maskRender(s.ctx);
    else { const d = st.maskMove(); s.ctx.drawImage(L.mask, d.x, d.y); }
    return s.canvas;
  }
  if (I.preview && I.preview.layer === L && I.preview.mask && I.preview.show !== false) return I.preview.canvas;
  return L.mask;
}
I.compositeNow = () => {
  const D = I.doc;
  if (!D) return;
  const ctx = I.dctx, A = I.active();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, D.w, D.h);
  if (I.maskView && A && A.mask) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, D.w, D.h);
    ctx.drawImage(maskSrc(A), 0, 0);
  } else for (const L of D.layers) {
    if (!L.visible || L._editing) continue;
    let src = layerSrc(L);
    const m = L.mask && L.maskOn ? maskSrc(L) : null;
    if (m) {
      const s = I.scratch('lm');
      s.ctx.globalAlpha = 1; s.ctx.globalCompositeOperation = 'source-over';
      s.ctx.clearRect(0, 0, D.w, D.h); s.ctx.drawImage(src, 0, 0);
      s.ctx.globalCompositeOperation = 'destination-in'; s.ctx.drawImage(m, 0, 0);
      s.ctx.globalCompositeOperation = 'source-over';
      src = s.canvas;
    }
    ctx.globalAlpha = L.opacity; ctx.globalCompositeOperation = L.blend;
    ctx.drawImage(src, 0, 0, D.w, D.h);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  I.histSoon && I.histSoon();
  if (I.maskEdit && I.ruby) I.overlay();
};
function selClip(src) {
  if (!I.sel) return src;
  const D = I.doc, k = I.scratch('selclip');
  k.ctx.globalCompositeOperation = 'source-over'; k.ctx.globalAlpha = 1;
  k.ctx.clearRect(0, 0, D.w, D.h); k.ctx.drawImage(src, 0, 0);
  k.ctx.globalCompositeOperation = 'destination-in'; k.ctx.drawImage(I.sel.mask, 0, 0);
  k.ctx.globalCompositeOperation = 'source-over';
  return k.canvas;
}
/**
 * Applies a stroke to ctx. Layer targets: paint / erase / reveal (clone, retouch) / heal (preview only).
 * Mask targets keep coverage in alpha (white = reveal): new = old·(1−a) + value·a, done exactly with
 * destination-out followed by an additive 'lighter' draw.
 */
function renderStroke(st, ctx) {
  if (st.render) return st.render(ctx);
  const D = I.doc, m = selClip(st.canvas);
  ctx.save();
  if (st.target === 'mask') {
    if (st.replace) {
      ctx.globalAlpha = st.opacity; ctx.globalCompositeOperation = 'destination-out';
      if (I.sel) ctx.drawImage(I.sel.mask, 0, 0); else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, D.w, D.h); }
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(m, 0, 0);
    } else {
      const v = st.mode === 'erase' ? 1 : st.value;
      ctx.globalAlpha = st.opacity; ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(m, 0, 0);
      if (v > 0.002) { ctx.globalAlpha = st.opacity * v; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(m, 0, 0); }
    }
  } else if (st.mode === 'paint') { ctx.globalAlpha = st.opacity; ctx.drawImage(m, 0, 0); }
  else if (st.mode === 'erase') { ctx.globalAlpha = st.opacity; ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(m, 0, 0); }
  else if (st.mode === 'reveal' || st.mode === 'heal') {
    const r = I.scratch('reveal');
    r.ctx.globalCompositeOperation = 'source-over'; r.ctx.globalAlpha = 1;
    r.ctx.clearRect(0, 0, D.w, D.h); r.ctx.drawImage(m, 0, 0);
    r.ctx.globalCompositeOperation = 'source-in';
    if (st.mode === 'heal') { r.ctx.fillStyle = '#ff4d6a'; r.ctx.fillRect(0, 0, D.w, D.h); }
    else r.ctx.drawImage(st.source, st.dx, st.dy);
    r.ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = st.mode === 'heal' ? 0.45 : st.opacity; ctx.drawImage(r.canvas, 0, 0);
  }
  ctx.restore();
}
I.beginStroke = (mode, o = {}) => {
  const s = I.scratch('stroke');
  s.ctx.setTransform(1, 0, 0, 1, 0, 0); s.ctx.globalAlpha = 1; s.ctx.globalCompositeOperation = 'source-over';
  s.ctx.clearRect(0, 0, I.doc.w, I.doc.h);
  const L = I.active();
  const target = I.maskEdit && L.mask && mode !== 'heal' ? 'mask' : 'layer';
  I.stroke = { layer: L, mode, target, canvas: s.canvas, ctx: s.ctx, opacity: o.opacity ?? 1, source: o.source, dx: o.dx || 0, dy: o.dy || 0, replace: !!o.replace && target === 'mask', value: o.color ? App.luma(o.color) : 1 };
  return I.stroke;
};
I.updateStroke = () => I.composite();
I.endStroke = label => {
  const st = I.stroke;
  if (!st) return;
  const L = st.layer;
  I.stroke = null;
  if (st.target === 'mask') { renderStroke(st, L.mask.getContext('2d')); I.dirty(L, true); }
  else {
    if (L.text) I.ensurePixels(L);
    renderStroke(st, L.ctx); I.dirty(L);
    if (st.maskMove && L.mask) { const d = st.maskMove(); I.shiftMask(L, d.x, d.y); }
    if (st.maskRender && L.mask) { const m = App.canvas(I.doc.w, I.doc.h); st.maskRender(m.getContext('2d')); L.mask = m; bumpM(L); }
  }
  I.pushHistory(label);
};
I.cancelStroke = () => { I.stroke = null; I.composite(); };

/* ---------- edit target (layer pixels or its mask) ---------- */
const maskToGray = m => F.pixels(m, d => { for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = d[i + 3]; d[i + 3] = 255; } });
const grayToMask = I.grayToMask = g => F.pixels(g, d => { for (let i = 0; i < d.length; i += 4) { const v = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) * d[i + 3] / 255; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = v; } });
I.target = () => { const L = I.active(), mask = !!(I.maskEdit && L.mask); return { L, mask, src: mask ? maskToGray(L.mask) : L.canvas }; };
const writeTarget = I.writeTarget = (t, out, label, ic = 'sliders') => {
  const cv = t.mask ? t.L.mask : t.L.canvas, c = cv.getContext('2d');
  c.save(); c.globalCompositeOperation = 'copy'; c.drawImage(t.mask ? grayToMask(out) : out, 0, 0); c.restore();
  if (!t.mask) I.ensurePixels(t.L, true);
  I.dirty(t.L, t.mask); I.pushHistory(label, ic);
};

/* ---------- layer masks ---------- */
I.addMask = (hide = false) => {
  const L = I.active(), D = I.doc;
  if (L.mask) { I.maskEdit = true; I.layersUI(); optionsUI(); return App.toast('This layer already has a mask — it’s selected for painting now'); }
  I.settle(); I.flushDev();
  let m;
  if (I.sel) {
    m = App.canvas(D.w, D.h);
    const c = m.getContext('2d');
    if (hide) { c.fillStyle = '#fff'; c.fillRect(0, 0, D.w, D.h); c.globalCompositeOperation = 'destination-out'; }
    c.drawImage(I.sel.mask, 0, 0);
    I.deselect();
  } else m = hide ? App.canvas(D.w, D.h) : whiteMask(D.w, D.h);
  L.mask = m; L.maskOn = true; bumpM(L);
  I.maskEdit = true;
  I.compositeNow(); I.thumbsSoon();
  I.pushHistory(hide ? 'Add mask (hide all)' : 'Add layer mask', 'mask');
  optionsUI();
  if (!App.settings.maskHint) { App.setSetting('maskHint', true); App.toast('Mask added — paint black to hide, white to reveal. Click the layer’s picture thumbnail to edit pixels again.', 'ok', 6500); }
};
const needMask = () => { const L = I.active(); if (!L.mask) { App.toast('This layer has no mask — add one with the mask button in the Layers panel', 'warn'); return null; } I.settle(); I.flushDev(); return L; };
I.deleteMask = () => { const L = needMask(); if (!L) return; L.mask = null; bumpM(L); I.maskEdit = false; I.maskView = false; I.compositeNow(); I.pushHistory('Delete mask', 'trash'); optionsUI(); };
I.applyMask = () => {
  const L = needMask(); if (!L) return;
  if (L.maskOn) { L.ctx.save(); L.ctx.globalCompositeOperation = 'destination-in'; L.ctx.drawImage(L.mask, 0, 0); L.ctx.restore(); I.ensurePixels(L, true); bump(L); }
  L.mask = null; bumpM(L); I.maskEdit = false; I.maskView = false;
  I.compositeNow(); I.thumbsSoon(); I.pushHistory('Apply mask', 'mask'); optionsUI();
};
I.invertMask = () => {
  const L = needMask(); if (!L) return;
  const m = whiteMask(I.doc.w, I.doc.h), c = m.getContext('2d');
  c.globalCompositeOperation = 'destination-out'; c.drawImage(L.mask, 0, 0);
  L.mask = m; I.dirty(L, true); I.pushHistory('Invert mask', 'invert');
};
I.toggleMask = () => { const L = needMask(); if (!L) return; L.maskOn = !L.maskOn; I.compositeNow(); I.pushHistory(L.maskOn ? 'Enable mask' : 'Disable mask', 'mask'); };
I.editMask = on => {
  const L = I.active();
  if (on && !L.mask) return I.addMask();
  if (I.maskEdit === !!on) return;
  I.settle(); I.flushDev();
  I.maskEdit = !!on;
  if (!on) I.maskView = false;
  I.compositeNow(); I.layersUI(); optionsUI(); I.statusUI(); I.overlay();
};
I.toggleMaskView = () => { const L = I.active(); if (!L.mask) return; I.maskView = !I.maskView; if (I.maskView) I.maskEdit = true; I.compositeNow(); I.layersUI(); optionsUI(); App.toast(I.maskView ? 'Showing the mask — Alt+click the mask again (or Esc) to return' : 'Showing the image'); };

/* ---------- selection ---------- */
function selInfo(sel) {
  const D = I.doc, id = F.data(sel.mask), d = id.data;
  let x0 = D.w, y0 = D.h, x1 = -1, y1 = -1;
  for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) if (d[(y * D.w + x) * 4 + 3] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return false;
  sel.bounds = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  sel.alpha = d;
  if (!sel.path) {
    const e = App.canvas(D.w, D.h), ec = e.getContext('2d'), ed = ec.createImageData(D.w, D.h), o = ed.data;
    const on = (x, y) => x >= 0 && y >= 0 && x < D.w && y < D.h && d[(y * D.w + x) * 4 + 3] > 127;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (on(x, y) && (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1))) { const k = (y * D.w + x) * 4; o[k] = o[k + 1] = o[k + 2] = 255; o[k + 3] = 255; }
    ec.putImageData(ed, 0, 0);
    sel.edges = e;
  }
  return true;
}
I.setSel = (mask, path, mode = 'new') => {
  if (mode !== 'new' && I.sel) {
    const m = F.clone(I.sel.mask), c = m.getContext('2d');
    if (mode === 'subtract') c.globalCompositeOperation = 'destination-out';
    else if (mode === 'intersect') c.globalCompositeOperation = 'destination-in';
    c.drawImage(mask, 0, 0);
    mask = m; path = null;
  } else if (mode === 'subtract' || mode === 'intersect') { if (!I.sel) return; }
  const sel = { mask, path };
  I.sel = selInfo(sel) ? sel : null;
  I.overlay(); I.statusUI();
};
I.selectAll = () => { const D = I.doc, m = whiteMask(D.w, D.h), p = new Path2D(); p.rect(0, 0, D.w, D.h); I.setSel(m, p, 'new'); };
I.deselect = () => { if (I.sel) I.lastSel = I.sel; I.sel = null; I.overlay(); I.statusUI(); };
I.reselect = () => { if (!I.lastSel || I.lastSel.mask.width !== I.doc.w || I.lastSel.mask.height !== I.doc.h) return App.toast('No previous selection to restore'); I.sel = I.lastSel; I.overlay(); I.statusUI(); };
I.invertSel = () => {
  const D = I.doc;
  if (!I.sel) return I.selectAll();
  const m = whiteMask(D.w, D.h), c = m.getContext('2d');
  c.globalCompositeOperation = 'destination-out'; c.drawImage(I.sel.mask, 0, 0);
  I.setSel(m, null, 'new');
};
I.selFromAlpha = (cv, mode = 'new') => {
  const m = F.pixels(cv, d => { for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255; });
  I.setSel(m, null, mode);
  if (!I.sel) App.toast('Nothing to select there — it’s empty', 'warn');
};
I.selHit = (x, y) => {
  const s = I.sel, D = I.doc;
  if (!s) return false;
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= D.w || y >= D.h) return false;
  return s.alpha[(y * D.w + x) * 4 + 3] > 127;
};
I.offsetSel = (dx, dy) => {
  if (!I.sel) return;
  const D = I.doc, m = App.canvas(D.w, D.h);
  m.getContext('2d').drawImage(I.sel.mask, dx, dy);
  let p = null;
  if (I.sel.path) { p = new Path2D(); p.addPath(I.sel.path, new DOMMatrix().translate(dx, dy)); }
  I.setSel(m, p, 'new');
};
I.cropToSel = () => {
  if (!I.sel) return App.toast('Make a selection first', 'warn');
  const b = I.sel.bounds;
  I.resizeCanvas(b.w, b.h, -b.x, -b.y, 'Crop to selection');
  I.fit();
};
/** canvas with `out` applied only inside the selection */
I.maskWithSel = (orig, out) => {
  if (!I.sel) return out;
  const f = F.clone(orig), fc = f.getContext('2d');
  fc.globalCompositeOperation = 'destination-out'; fc.drawImage(I.sel.mask, 0, 0, f.width, f.height);
  const t = F.clone(out), tc = t.getContext('2d');
  tc.globalCompositeOperation = 'destination-in'; tc.drawImage(I.sel.mask, 0, 0, t.width, t.height);
  fc.globalCompositeOperation = 'source-over'; fc.drawImage(t, 0, 0);
  return f;
};
/** Feather / grow / shrink / border / smooth — previewed live as marching ants. */
I.selectDialog = kind => {
  if (!I.sel) return App.toast('Make a selection first', 'warn');
  const K = {
    feather: ['Feather selection', 'Softens the selection edge so edits fade out gradually instead of stopping at a hard line.', 'Radius', 1, 150, 10],
    grow: ['Grow selection', 'Expands the selection outward by a number of pixels.', 'Grow by', 1, 200, 6],
    shrink: ['Shrink selection', 'Pulls the selection edge inward — great for trimming a halo off a cut-out.', 'Shrink by', 1, 200, 4],
    border: ['Border selection', 'Turns the selection into a ring along its edge — then fill it for an outline, or heal a seam.', 'Width', 2, 200, 12],
    smooth: ['Smooth selection', 'Rounds off jagged corners and removes tiny specks from the selection.', 'Radius', 1, 60, 4],
  }[kind];
  const orig = I.sel;
  let v = K[5], timer = 0;
  const run = () => {
    const m = orig.mask;
    let out;
    if (kind === 'feather') out = F.maskBlur(m, v / 2);
    else if (kind === 'grow') out = F.maskGrow(m, v * 1.2);
    else if (kind === 'shrink') out = F.maskShrink(m, v * 1.2);
    else if (kind === 'border') { out = F.maskGrow(m, v * 0.6); const c = out.getContext('2d'); c.globalCompositeOperation = 'destination-out'; c.drawImage(F.maskShrink(m, v * 0.6), 0, 0); }
    else out = F.maskThreshold(F.maskBlur(m, v), 127);
    I.sel = null; I.setSel(out, null, 'new');
  };
  const sl = App.slider({ label: K[2], min: K[3], max: K[4], step: 1, value: v, def: K[5], unit: 'px', tip: K[1], onInput: x => { v = x; clearTimeout(timer); timer = setTimeout(run, 60); } });
  App.modal({ title: K[0], icon: 'feather', width: 340, clear: true, body: h('div', null, h('div', { class: 'hint', style: { paddingTop: 0 } }, K[1]), sl),
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { clearTimeout(timer); run(); } }],
    onClose: r => { clearTimeout(timer); if (!r) { I.sel = orig; I.overlay(); I.statusUI(); } } });
  run();
};
/** Similar-color selection with a soft falloff. */
I.colorRangeDialog = () => {
  const orig = I.sel;
  let col = I.primary, fuzz = 60, all = true, inv = false, timer = 0;
  const run = () => {
    const src = all ? I.flatten() : I.active().canvas, [r0, g0, b0] = App.hexToRgb(col), lo = fuzz * 0.5, span = Math.max(1, fuzz - lo);
    const m = F.pixels(src, d => {
      for (let i = 0; i < d.length; i += 4) {
        const dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0, dist = Math.sqrt(dr * dr + dg * dg + db * db);
        let a = dist <= lo ? 1 : dist >= fuzz ? 0 : (fuzz - dist) / span;
        a *= d[i + 3] / 255;
        if (inv) a = 1 - a;
        d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255;
      }
    });
    I.sel = null; I.setSel(m, null, 'new');
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 80); };
  const cc = App.color({ label: 'Color', value: col, tip: 'The color to select. Click anywhere on the image while this window is open to sample it.', onInput: v => { col = v; later(); } });
  const sl = App.slider({ label: 'Fuzziness', min: 4, max: 250, step: 1, value: fuzz, def: 60, tip: 'How different a color can be and still be (partly) selected. Edges fade softly.', onInput: v => { fuzz = v; later(); } });
  const tg = App.toggle({ label: 'Sample all layers', value: all, tip: 'Match against the visible image rather than only the active layer.', onChange: v => { all = v; later(); } });
  const ti = App.toggle({ label: 'Invert', value: inv, tip: 'Select everything except this color.', onChange: v => { inv = v; later(); } });
  I.pickHook = p => { const c = I.sample(p.x, p.y, all); if (c && c[3]) { col = App.rgbToHex(c[0], c[1], c[2]); cc.set(col); later(); } };
  App.modal({ title: 'Select color range', icon: 'dropper', width: 360, clear: true,
    body: h('div', null, h('div', { class: 'hint', style: { paddingTop: 0 } }, 'Click the image to pick a color — every similar pixel gets selected (e.g. a sky, a green screen, or one colored object).'), cc, sl, tg, ti),
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { clearTimeout(timer); run(); } }],
    onClose: r => { clearTimeout(timer); I.pickHook = null; if (!r) { I.sel = orig; I.overlay(); I.statusUI(); } } });
  run();
};
/** Region-grow from the image border: finds a plain/similar background. */
function backgroundMask(src, tol) {
  const id = F.data(src), d = id.data, w = id.width, hh = id.height, n = w * hh;
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (hh - 1) * w + x);
  for (let y = 1; y < hh - 1; y++) border.push(y * w, y * w + w - 1);
  const med = [0, 1, 2, 3].map(c => { const v = border.map(i => d[i * 4 + c]).sort((a, b) => a - b); return v[v.length >> 1]; });
  const t2 = tol * tol * 3, seedT = (tol * 2.2) ** 2 * 3;
  const dist2 = (a, r, g, b, al) => { const dr = d[a] - r, dg = d[a + 1] - g, db = d[a + 2] - b, da = d[a + 3] - al; return dr * dr + dg * dg + db * db + da * da; };
  const seed = new Int32Array(n).fill(-1), q = new Int32Array(n);
  let qh = 0, qt = 0;
  for (const i of border) if (seed[i] < 0 && dist2(i * 4, med[0], med[1], med[2], med[3]) <= seedT) { seed[i] = i; q[qt++] = i; }
  const push = (i, s) => {
    if (seed[i] >= 0) return;
    const a = i * 4, b = s * 4;
    if (!(d[a + 3] < 12 && d[b + 3] < 12) && dist2(a, d[b], d[b + 1], d[b + 2], d[b + 3]) > t2) return;
    seed[i] = s; q[qt++] = i;
  };
  while (qh < qt) {
    const i = q[qh++], s = seed[i], x = i % w;
    if (x > 0) push(i - 1, s);
    if (x < w - 1) push(i + 1, s);
    if (i >= w) push(i - w, s);
    if (i < n - w) push(i + w, s);
  }
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (seed[i] >= 0) m[i] = 1;
  return m;
}
I.subjectDialog = (subject = true) => {
  const orig = I.sel;
  let tol = 28, all = true, timer = 0;
  const run = () => {
    const D = I.doc, src = all ? I.flatten() : I.active().canvas;
    let m = I.maskCanvas(backgroundMask(src, tol), D.w, D.h);
    if (subject) { const c = whiteMask(D.w, D.h), x = c.getContext('2d'); x.globalCompositeOperation = 'destination-out'; x.drawImage(m, 0, 0); m = c; }
    m = F.maskBlur(m, 0.7);
    I.sel = null; I.setSel(m, null, 'new');
    if (!I.sel) App.toast(subject ? 'Couldn’t find a subject — try a higher tolerance' : 'Couldn’t find a plain background — try a higher tolerance', 'warn');
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 90); };
  App.modal({ title: subject ? 'Select subject' : 'Select background', icon: 'select', width: 360, clear: true,
    body: h('div', null, h('div', { class: 'hint', style: { paddingTop: 0 } }, 'Finds the background by growing inward from the image edges — works best on plain or studio backgrounds. Tweak the tolerance until the marching ants hug your subject, then refine with Select ▸ Grow / Shrink / Feather.'),
      App.slider({ label: 'Tolerance', min: 2, max: 120, step: 1, value: tol, def: 28, tip: 'Higher includes more varied background colors (but may eat into the subject).', onInput: v => { tol = v; later(); } }),
      App.toggle({ label: 'Sample all layers', value: all, tip: 'Analyze the visible image instead of only the active layer.', onChange: v => { all = v; later(); } })),
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { clearTimeout(timer); run(); } }],
    onClose: r => { clearTimeout(timer); if (!r) { I.sel = orig; I.overlay(); I.statusUI(); } } });
  run();
};

/** Edit ▸ Content-aware fill: remove whatever is inside the selection and rebuild it from the surroundings. */
I.contentAwareFill = () => {
  const L = I.active(), D = I.doc;
  if (!I.sel) return App.toast('First select what should disappear (Lasso or Rectangle select, a little larger than the object), then run Content-aware fill', 'warn', 6000);
  if (L.locked) return App.toast('This layer is locked', 'warn');
  if (I.maskEdit) return App.toast('Content-aware fill works on pixels — click the layer thumbnail (not the mask) first', 'warn');
  I.settle(); I.flushDev();
  const b = I.sel.bounds, big = b.w * b.h > D.w * D.h * 0.3;
  I.busy(true, 'Content-aware fill…');
  setTimeout(() => {
    try {
      if (F.heal(L.canvas, I.sel.mask, Math.max(20, Math.min(b.w, b.h) / 3))) {
        I.ensurePixels(L, true); I.dirty(L); I.pushHistory('Content-aware fill', 'bandage');
        App.toast(big ? 'Filled — large areas are hard to rebuild; try smaller selections one at a time for cleaner results' : 'Filled from the surrounding area — Ctrl+Z undoes it', big ? 'warn' : 'ok', big ? 6000 : 3000);
      } else App.toast('The selection is empty — nothing to fill', 'warn');
    } finally { I.busy(false); }
  }, 30);
};
/** Layer ▸ Remove background: hides a plain background with a layer mask (non-destructive — paint the mask to fix it up). */
I.removeBackground = () => {
  const L = I.active(), D = I.doc;
  if (L.locked) return App.toast('This layer is locked', 'warn');
  if (L.mask) return App.toast('This layer already has a mask — delete or apply it first (Layer ▸ Layer mask)', 'warn', 5000);
  I.settle(); I.flushDev();
  I.busy(true, 'Finding the background…');
  setTimeout(() => {
    try {
      const bg = backgroundMask(L.canvas, 30);
      let n = 0; for (let i = 0; i < bg.length; i++) n += bg[i];
      const share = n / bg.length;
      if (share < 0.02 || share > 0.97) return App.toast(share < 0.02 ? 'Couldn’t find a plain background around the edges — try Select ▸ Select subject and adjust the tolerance' : 'The whole layer looks like background — try Select ▸ Select subject and lower the tolerance', 'warn', 6500);
      const m = whiteMask(D.w, D.h), c = m.getContext('2d');
      c.globalCompositeOperation = 'destination-out'; c.drawImage(I.maskCanvas(bg, D.w, D.h), 0, 0);
      L.mask = F.maskBlur(m, 0.8); L.maskOn = true; bumpM(L);
      I.maskEdit = false; I.maskView = false;
      I.compositeNow(); I.thumbsSoon(); I.layersUI(); optionsUI();
      I.pushHistory('Remove background', 'mask');
      App.toast('Background hidden with a layer mask — paint the mask white to bring parts back, black to hide more', 'ok', 6000, { label: 'Edit mask', fn: () => I.editMask(true) });
    } finally { I.busy(false); }
  }, 30);
};

/* ---------- canvas-level operations ---------- */
I.resizeCanvas = (w, hh, ox, oy, label, fill) => {
  I.settle(); I.flushDev();
  const D = I.doc;
  for (const L of D.layers) {
    const c = App.canvas(w, hh), ctx = c.getContext('2d');
    if (fill && L === D.layers[0]) { ctx.fillStyle = fill; ctx.fillRect(0, 0, w, hh); }
    ctx.drawImage(L.canvas, ox, oy);
    L.canvas = c; L.ctx = ctx; bump(L);
    if (L.mask) {
      const m = App.canvas(w, hh), mc = m.getContext('2d');
      if (maskBgWhite(L.mask)) { mc.fillStyle = '#fff'; mc.fillRect(0, 0, w, hh); mc.clearRect(ox, oy, D.w, D.h); }
      mc.drawImage(L.mask, ox, oy);
      L.mask = m; bumpM(L);
    }
    if (L.text) { L.text.x += ox; L.text.y += oy; if (L.textBounds) { L.textBounds.x += ox; L.textBounds.y += oy; } }
  }
  D.w = w; D.h = hh;
  I.disp.width = w; I.disp.height = hh;
  I.sel = null; I.lastSel = null;
  I.compositeNow(); I.thumbsSoon(); I.docTabsUI();
  I.pushHistory(label, 'crop');
};
I.transformAll = (label, w, hh, draw) => {
  I.settle(); I.flushDev();
  const D = I.doc;
  for (const L of D.layers) {
    const c = App.canvas(w, hh), ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    draw(ctx, L.canvas);
    L.canvas = c; L.ctx = ctx; bump(L);
    if (L.mask) { const m = App.canvas(w, hh), mc = m.getContext('2d'); mc.imageSmoothingQuality = 'high'; draw(mc, L.mask); L.mask = m; bumpM(L); }
    I.ensurePixels(L, true);
  }
  D.w = w; D.h = hh; I.disp.width = w; I.disp.height = hh; I.sel = null; I.lastSel = null;
  I.fit(); I.compositeNow(); I.thumbsSoon(); I.docTabsUI(); I.pushHistory(label, 'rotate');
};
I.transformLayer = (label, draw) => {
  const L = I.active();
  if (L.locked) return App.toast('Layer is locked', 'warn');
  I.settle(); I.flushDev();
  const mask = !!(I.maskEdit && L.mask), cv = mask ? L.mask : L.canvas, c = cv.getContext('2d'), old = F.clone(cv);
  c.save(); c.clearRect(0, 0, I.doc.w, I.doc.h); c.imageSmoothingQuality = 'high'; draw(c, old); c.restore();
  if (!mask) I.ensurePixels(L, true);
  I.dirty(L, mask); I.pushHistory(label, 'rotate');
};
const rot90 = cw => I.transformAll(cw ? 'Rotate 90° right' : 'Rotate 90° left', I.doc.h, I.doc.w, (ctx, src) => { ctx.translate(cw ? src.height : 0, cw ? 0 : src.width); ctx.rotate((cw ? 90 : -90) * Math.PI / 180); ctx.drawImage(src, 0, 0); });
const flipAll = horiz => I.transformAll(horiz ? 'Flip horizontal' : 'Flip vertical', I.doc.w, I.doc.h, (ctx, src) => { ctx.translate(horiz ? src.width : 0, horiz ? 0 : src.height); ctx.scale(horiz ? -1 : 1, horiz ? 1 : -1); ctx.drawImage(src, 0, 0); });

/* ---------- clipboard ---------- */
I.copy = (merged = false, cut = false) => {
  I.settle();
  const D = I.doc, src = merged ? I.flatten() : I.masked(I.active());
  const b = I.sel ? I.sel.bounds : { x: 0, y: 0, w: D.w, h: D.h };
  const c = App.canvas(b.w, b.h), ctx = c.getContext('2d');
  ctx.drawImage(src, -b.x, -b.y);
  if (I.sel) { ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(I.sel.mask, -b.x, -b.y); }
  I.clip = { canvas: c, x: b.x, y: b.y, written: false };
  c.toBlob(blob => {
    try { navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => { if (I.clip && I.clip.canvas === c) I.clip.written = true; }).catch(() => {}); } catch {}
  });
  if (cut && !merged) I.clearSel('Cut');
  else App.toast(I.sel ? 'Copied selection' : merged ? 'Copied the visible image' : 'Copied layer');
};
I.pasteCanvas = (c, x, y, name = 'Pasted') => {
  I.settle(); I.flushDev();
  const L = I.addLayer(name);
  if (x == null) { x = (I.doc.w - c.width) / 2; y = (I.doc.h - c.height) / 2; }
  L.ctx.drawImage(c, x, y);
  I.dirty(L); I.pushHistory('Paste', 'paste');
  I.setTool('move');
  App.toast('Pasted as a new layer — drag to position it, Ctrl+T to resize');
};
I.clearSel = (label = 'Delete') => {
  const L = I.active();
  if (L.locked) return App.toast('Layer is locked', 'warn');
  I.settle(); I.flushDev();
  if (!I.sel && L.text && !I.maskEdit && I.doc.layers.length > 1) return delLayer();
  const mask = !!(I.maskEdit && L.mask), cv = mask ? L.mask : L.canvas, c = cv.getContext('2d');
  c.save();
  if (I.sel) { c.globalCompositeOperation = 'destination-out'; c.drawImage(I.sel.mask, 0, 0); }
  else c.clearRect(0, 0, I.doc.w, I.doc.h);
  c.restore();
  if (!mask) I.ensurePixels(L, true);
  I.dirty(L, mask); I.pushHistory(label, 'trash');
};
I.fillSel = (color = I.primary) => {
  const L = I.active();
  if (L.locked) return App.toast('Layer is locked', 'warn');
  I.settle(); I.flushDev();
  const st = I.beginStroke('paint', { color });
  st.ctx.fillStyle = I.maskEdit ? '#ffffff' : color; st.ctx.fillRect(0, 0, I.doc.w, I.doc.h);
  I.endStroke('Fill');
};

/* =====================================================================
   View & overlay
   ===================================================================== */
I.applyView = () => {
  I.stage.style.transform = `translate(${I.panX}px, ${I.panY}px) scale(${I.zoom})`;
  I.stage.classList.toggle('pixelated', I.zoom >= 2);
  I.overlay(); I.styleTextEdit && I.styleTextEdit(); I.statusUI();
};
I.setZoom = (z, cx, cy) => {
  z = clamp(z, 0.02, 32);
  const r = I.vp.getBoundingClientRect();
  const ax = cx != null ? cx - r.left : r.width / 2, ay = cy != null ? cy - r.top : r.height / 2;
  const dx = (ax - I.panX) / I.zoom, dy = (ay - I.panY) / I.zoom;
  I.zoom = z; I.panX = ax - dx * z; I.panY = ay - dy * z;
  I.applyView();
};
I.fit = () => {
  const D = I.doc, vw = I.vp.clientWidth || 800, vh = I.vp.clientHeight || 600, pad = VIEW.rulers ? 66 : 48;
  I.zoom = clamp(Math.min((vw - pad) / D.w, (vh - pad) / D.h), 0.02, 8);
  I.panX = (vw - D.w * I.zoom) / 2 + (VIEW.rulers ? 9 : 0); I.panY = (vh - D.h * I.zoom) / 2 + (VIEW.rulers ? 9 : 0);
  D._fitOk = vw > 50;
  I.applyView();
};
I.toDoc = (cx, cy) => { const r = I.vp.getBoundingClientRect(); return { x: (cx - r.left - I.panX) / I.zoom, y: (cy - r.top - I.panY) / I.zoom }; };
I.toScreen = (x, y) => ({ x: x * I.zoom + I.panX, y: y * I.zoom + I.panY });
I.setCursor = c => { I.vp.style.cursor = c; };

let ovPending = false, mouse = null, antsPhase = 0;
I.overlay = () => { if (ovPending) return; ovPending = true; requestAnimationFrame(() => { ovPending = false; drawOverlay(); }); };
function drawOverlay() {
  if (!I.doc || !I.ovCv) return;
  const cv = I.ovCv, dpr = I.dpr = App.fitCanvas(cv), ctx = cv.getContext('2d');
  const W = cv.width / dpr, H = cv.height / dpr, D = I.doc, z = I.zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const tool = T[I.tool];
  const docSpace = () => ctx.setTransform(z * dpr, 0, 0, z * dpr, I.panX * dpr, I.panY * dpr);
  // red “rubylith” over areas the mask hides
  const A = I.active();
  if (I.maskEdit && I.ruby && A && A.mask && !I.maskView) {
    const r = I.scratch('ruby');
    r.ctx.globalCompositeOperation = 'source-over'; r.ctx.clearRect(0, 0, D.w, D.h);
    r.ctx.fillStyle = 'rgba(255,40,60,.5)'; r.ctx.fillRect(0, 0, D.w, D.h);
    r.ctx.globalCompositeOperation = 'destination-out'; r.ctx.drawImage(maskSrc(A), 0, 0);
    ctx.save(); docSpace(); ctx.imageSmoothingEnabled = z < 2; ctx.drawImage(r.canvas, 0, 0); ctx.restore();
  }
  // grids
  const vx0 = Math.max(0, Math.floor(-I.panX / z)), vy0 = Math.max(0, Math.floor(-I.panY / z));
  const vx1 = Math.min(D.w, Math.ceil((W - I.panX) / z)), vy1 = Math.min(D.h, Math.ceil((H - I.panY) / z));
  const gridLines = (step, color) => {
    ctx.beginPath();
    for (let x = Math.ceil(vx0 / step) * step; x <= vx1; x += step) { const sx = Math.round(x * z + I.panX) + 0.5; ctx.moveTo(sx, vy0 * z + I.panY); ctx.lineTo(sx, vy1 * z + I.panY); }
    for (let y = Math.ceil(vy0 / step) * step; y <= vy1; y += step) { const sy = Math.round(y * z + I.panY) + 0.5; ctx.moveTo(vx0 * z + I.panX, sy); ctx.lineTo(vx1 * z + I.panX, sy); }
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
  };
  if (VIEW.pixelGrid && z >= 8) gridLines(1, 'rgba(128,128,128,.32)');
  if (VIEW.grid && VIEW.gridSize * z >= 4) { gridLines(VIEW.gridSize, 'rgba(0,0,0,.22)'); ctx.translate(-1, -1); gridLines(VIEW.gridSize, 'rgba(255,255,255,.34)'); ctx.translate(1, 1); }
  // selection marching ants
  if (I.sel && I.tool !== 'crop' && !(T.transform.S && T.transform.S.sel)) {
    const off = tool.overlayOffset ? tool.overlayOffset() || { x: 0, y: 0 } : { x: 0, y: 0 };
    ctx.save();
    ctx.setTransform(z * dpr, 0, 0, z * dpr, (I.panX + off.x * z) * dpr, (I.panY + off.y * z) * dpr);
    if (I.sel.path) {
      ctx.lineWidth = 1.2 / z;
      ctx.strokeStyle = '#000'; ctx.stroke(I.sel.path);
      ctx.strokeStyle = '#fff'; ctx.setLineDash([5 / z, 5 / z]); ctx.lineDashOffset = -antsPhase / z; ctx.stroke(I.sel.path);
    } else {
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(I.sel.edges, 0, 0);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = (antsPhase / 5 | 0) % 2 ? '#ffffff' : '#9d84ff';
      ctx.fillRect(0, 0, D.w, D.h);
    }
    ctx.restore();
  }
  // text layer frames (so live text is discoverable)
  if ((I.tool === 'text' || I.tool === 'move') && !I.textEdit) {
    const hov = mouse && I.textLayerAt ? I.textLayerAt(mouse) : null;
    for (const L of [A, hov]) {
      if (!L || !L.text || !L.textBounds || !L.visible) continue;
      const b = L.textBounds, a = I.toScreen(b.x, b.y);
      ctx.save(); ctx.strokeStyle = L === A ? (App.cssVar('--accent') || '#a08aff') : 'rgba(255,255,255,.55)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.w * z), Math.round(b.h * z)); ctx.restore();
    }
  }
  if (tool.overlay) { ctx.save(); tool.overlay(ctx); ctx.restore(); }
  if (I.tool === 'clone' && I.cloneSrc) {
    let sp = I.cloneSrc;
    if (I.cloneOff && mouse && (I.stroke || I.opts.clone.aligned)) sp = { x: mouse.x + I.cloneOff.x, y: mouse.y + I.cloneOff.y };
    const s = I.toScreen(sp.x, sp.y);
    ctx.strokeStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(s.x - 9, s.y); ctx.lineTo(s.x + 9, s.y); ctx.moveTo(s.x, s.y - 9); ctx.lineTo(s.x, s.y + 9); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (mouse && tool.brushCursor && !I.panning) {
    const o = I.opts[I.tool] || {};
    const s = I.toScreen(mouse.x, mouse.y), r = Math.max(1, (o.size || 1) * z / 2);
    ctx.lineWidth = 1;
    if (I.tool === 'pencil') { const sz = Math.max(1, Math.round(o.size)) * z, px = I.toScreen(Math.floor(mouse.x) - Math.floor(o.size / 2), Math.floor(mouse.y) - Math.floor(o.size / 2)); ctx.strokeStyle = '#000'; ctx.strokeRect(px.x - 0.5, px.y - 0.5, sz + 1, sz + 1); ctx.strokeStyle = '#fff'; ctx.strokeRect(px.x + 0.5, px.y + 0.5, sz - 1, sz - 1); }
    else {
      ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.beginPath(); ctx.arc(s.x, s.y, r + 0.5, 0, 7); ctx.stroke();
      ctx.strokeStyle = I.tool === 'heal' ? 'rgba(255,120,140,.95)' : 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, r - 0.5), 0, 7); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(s.x - 0.5, s.y - 0.5, 1, 1);
    }
  }
  if (VIEW.rulers) drawRulers(ctx, W, H);
}
function drawRulers(ctx, W, H) {
  const R = 18, z = I.zoom, accent = App.cssVar('--accent') || '#a08aff';
  ctx.save();
  ctx.fillStyle = App.th.panel; ctx.globalAlpha = 0.95; ctx.fillRect(0, 0, W, R); ctx.fillRect(0, 0, R, H); ctx.globalAlpha = 1;
  ctx.strokeStyle = `rgba(${App.th.ink},.12)`; ctx.beginPath(); ctx.moveTo(0, R + 0.5); ctx.lineTo(W, R + 0.5); ctx.moveTo(R + 0.5, 0); ctx.lineTo(R + 0.5, H); ctx.stroke();
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  const step = steps.find(s => s * z >= 64) || 20000, div = step * z / 10 >= 5 ? 10 : step * z / 5 >= 5 ? 5 : 2, minor = step / div;
  ctx.font = '500 9px "JetBrains Mono", monospace'; ctx.fillStyle = App.th.muted; ctx.strokeStyle = `rgba(${App.th.ink},.28)`;
  ctx.beginPath();
  for (let k = Math.floor((R - I.panX) / z / minor); ; k++) {
    const v = k * minor, sx = Math.round(v * z + I.panX) + 0.5;
    if (sx > W) break; if (sx < R) continue;
    const major = k % div === 0;
    ctx.moveTo(sx, major ? 3 : div === 10 && k % 5 === 0 ? 9 : 13); ctx.lineTo(sx, R);
    if (major) ctx.fillText(String(Math.round(v)), sx + 3, 9);
  }
  for (let k = Math.floor((R - I.panY) / z / minor); ; k++) {
    const v = k * minor, sy = Math.round(v * z + I.panY) + 0.5;
    if (sy > H) break; if (sy < R) continue;
    const major = k % div === 0;
    ctx.moveTo(major ? 3 : div === 10 && k % 5 === 0 ? 9 : 13, sy); ctx.lineTo(R, sy);
    if (major) { ctx.save(); ctx.translate(9, sy + 3); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText(String(Math.round(v)), 0, 0); ctx.restore(); }
  }
  ctx.stroke();
  if (mouse) {
    const s = I.toScreen(mouse.x, mouse.y);
    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.beginPath();
    if (s.x > R) { ctx.moveTo(s.x, 0); ctx.lineTo(s.x, R); }
    if (s.y > R) { ctx.moveTo(0, s.y); ctx.lineTo(R, s.y); }
    ctx.stroke();
  }
  ctx.fillStyle = App.th.panel; ctx.fillRect(0, 0, R, R);
  ctx.restore();
}
setInterval(() => { if (I.sel && App.active === 'image' && !document.hidden) { antsPhase = (antsPhase + 1) % 1000; I.overlay(); } }, 110);

/* =====================================================================
   Pointer & keyboard
   ===================================================================== */
const MODIFIES = new Set(['brush', 'pencil', 'eraser', 'fill', 'gradient', 'shape', 'clone', 'retouch', 'move', 'heal']);
const ALT_PICK = new Set(['brush', 'pencil', 'fill', 'gradient', 'shape']);
let activeTool = null, spaceDown = false;
function setupViewport() {
  const vp = I.vp;
  vp.addEventListener('pointerdown', e => {
    if (I.textEdit && I.tool !== 'text') I.commitText();
    if (e.button === 1 || spaceDown) {
      e.preventDefault(); I.panning = true;
      vp.setPointerCapture(e.pointerId);
      activeTool = T.hand; T.hand.down(e); I.overlay();
      return;
    }
    const p = I.toDoc(e.clientX, e.clientY);
    if (I.pickHook && e.button === 0) { e.preventDefault(); I.pickHook(p); return; }
    const tool = T[I.tool];
    if (e.button === 2 && !tool.paints && I.tool !== 'dropper') return;
    e.preventDefault();
    if (e.altKey && ALT_PICK.has(I.tool)) { T.dropper.pick(e, p); return; }
    if (I.tool === 'move' && !I.sel && I.textLayerAt) {
      const tl = I.textLayerAt(p);
      if (tl && tl !== I.active()) { I.flushDev(); I.doc.active = I.doc.layers.indexOf(tl); I.maskEdit = false; I.layersUI(); optionsUI(); }
    }
    if (MODIFIES.has(I.tool)) {
      const L = I.active();
      if (L.locked) return App.toast('“' + L.name + '” is locked — unlock it in the Layers panel', 'warn');
      if (!L.visible) return App.toast('“' + L.name + '” is hidden — show it to edit', 'warn');
      if (I.maskView && I.tool !== 'move') { I.maskView = false; I.compositeNow(); }
      I.flushDev();
    }
    vp.setPointerCapture(e.pointerId);
    activeTool = tool;
    tool.down && tool.down(e, p);
  });
  vp.addEventListener('pointermove', e => {
    const p = I.toDoc(e.clientX, e.clientY);
    mouse = p;
    if (activeTool) activeTool.move && activeTool.move(e, activeTool === T.hand ? null : p);
    else if (T[I.tool].hover) T[I.tool].hover(p);
    if (T[I.tool].brushCursor || I.tool === 'clone' || VIEW.rulers || I.tool === 'text' || I.tool === 'move') I.overlay();
    I.statusUI(p);
  });
  const end = e => {
    if (!activeTool) return;
    const t = activeTool; activeTool = null;
    t.up && t.up(e, I.toDoc(e.clientX, e.clientY));
    if (I.panning) { I.panning = false; I.setCursor(spaceDown ? 'grab' : T[I.tool].cursor); }
    I.overlay();
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
  vp.addEventListener('pointerleave', () => { mouse = null; I.statusUI(null); I.overlay(); });
  vp.addEventListener('dblclick', e => {
    if ((I.tool !== 'move' && I.tool !== 'text') || I.textEdit || !I.textLayerAt) return;
    const L = I.textLayerAt(I.toDoc(e.clientX, e.clientY));
    if (!L) return;
    I.doc.active = I.doc.layers.indexOf(L); I.maskEdit = false; I.layersUI();
    I.startText(L.text.x, L.text.y, L);
  });
  vp.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (T[I.tool].paints || I.tool === 'dropper') return;
    App.contextMenu(e, [
      { label: 'Select all', icon: 'cursor', key: 'Ctrl+A', tip: 'Selects the whole canvas.', action: I.selectAll },
      { label: 'Deselect', icon: 'x', key: 'Ctrl+D', disabled: !I.sel, tip: 'Removes the selection.', action: I.deselect },
      { label: 'Invert selection', icon: 'swap', key: 'Ctrl+Shift+I', tip: 'Selects everything else.', action: I.invertSel },
      { label: 'Feather…', icon: 'feather', disabled: !I.sel, tip: 'Softens the selection edge.', action: () => I.selectDialog('feather') },
      { sep: true },
      { label: 'Copy', icon: 'copy', key: 'Ctrl+C', tip: 'Copies the selection (or layer).', action: () => I.copy() },
      { label: 'Cut', icon: 'scissors', key: 'Ctrl+X', tip: 'Copies then erases the selection.', action: () => I.copy(false, true) },
      { label: 'Paste', icon: 'paste', key: 'Ctrl+V', disabled: !I.clip, tip: 'Pastes as a new layer.', action: () => I.clip && I.pasteCanvas(I.clip.canvas, I.clip.x, I.clip.y) },
      { label: 'Layer via copy', icon: 'layers', key: 'Ctrl+J', tip: 'Copies the selection onto a new layer.', action: () => layerViaCopy(false) },
      { sep: true },
      { label: 'Free transform', icon: 'transform', key: 'Ctrl+T', tip: 'Scale and rotate the layer or selection with handles.', action: () => I.setTool('transform') },
      { label: 'Mask from selection', icon: 'mask', disabled: !I.sel, tip: 'Hides everything outside the selection on this layer — non-destructively.', action: () => I.addMask(false) },
      { label: 'Crop to selection', icon: 'crop', disabled: !I.sel, tip: 'Trims the canvas to the selection.', action: I.cropToSel },
      { label: 'Fill with primary color', icon: 'bucket', disabled: !I.sel, tip: 'Fills the selection with the primary color.', action: () => I.fillSel() },
      { label: 'Delete selected pixels', icon: 'trash', key: 'Del', disabled: !I.sel, tip: 'Erases the selected area on the active layer.', action: () => I.clearSel() },
      { label: 'Content-aware fill', icon: 'bandage', key: 'Shift+F5', disabled: !I.sel, tip: 'Removes what is selected by rebuilding it from the surroundings.', action: I.contentAwareFill },
    ]);
  });
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) I.setZoom(I.zoom * Math.pow(1.0015, -e.deltaY * (e.deltaMode ? 30 : 1)), e.clientX, e.clientY);
    else { I.panX -= e.shiftKey ? e.deltaY : e.deltaX; I.panY -= e.shiftKey ? 0 : e.deltaY; I.applyView(); }
  }, { passive: false });
  // pictures carried from the Video editor, another image's tab or a layer → a new layer where it's dropped
  App.xfer.zone(vp, {
    accepts: p => !!p.image && !(p.from === 'image' && p.docId === I.doc.id),
    label: p => `Drop to add “${p.name}” as a new layer here`,
    drop: async (p, e) => { await I.openImage(await p.image(), p.name, true, I.toDoc(e.clientX, e.clientY)); },
  });
  App.fileDrop(vp, async files => {
    const imgs = files.filter(x => x.type.startsWith('image/'));
    const proj = files.find(x => /\.strata$/i.test(x.name));
    if (proj) return App.openProjectFile(proj);
    if (!imgs.length) return App.toast('Drop an image file', 'warn');
    if (I.pristine()) { for (const f of imgs) await I.openImage(f, f.name); }
    else { for (const f of imgs) await I.openImage(f, f.name, true); App.toast(imgs.length > 1 ? `Added ${imgs.length} images as layers` : 'Added as a new layer — drop onto the tab bar to open as a separate image'); }
  });
  new ResizeObserver(() => { if (I.doc && !I.doc._fitOk && I.vp.clientWidth > 50) I.fit(); else I.overlay(); }).observe(vp);
}
I.setTool = id => {
  if (!T[id]) return;
  if (id === I.tool && id === 'transform' && T.transform.S) return;
  if (I.tool !== id) { const old = T[I.tool]; old && old.deactivate && old.deactivate(); }
  I.tool = id;
  const t = T[id];
  t.activate && t.activate();
  I.setCursor(t.cursor || 'default');
  document.querySelectorAll('.i-tools .tool-btn').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
  optionsUI(); I.overlay(); I.workflowUI();
};
function layerViaCopy(cut = false) {
  const L = I.active();
  I.settle(); I.flushDev();
  const c = F.clone(L.canvas);
  if (I.sel) { const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-in'; x.drawImage(I.sel.mask, 0, 0); }
  if (cut && I.sel) { L.ctx.save(); L.ctx.globalCompositeOperation = 'destination-out'; L.ctx.drawImage(I.sel.mask, 0, 0); L.ctx.restore(); I.ensurePixels(L, true); bump(L); }
  const N = I.addLayer(L.name.replace(/^Text: /, '') + (cut ? ' (cut)' : ' (copy)'));
  N.ctx.drawImage(c, 0, 0);
  I.dirty(N); I.pushHistory(cut ? 'Layer via cut' : 'Layer via copy', 'layers');
}

/* =====================================================================
   Panels
   ===================================================================== */
let el = {};
function buildTools(root) {
  for (const id of I.TOOL_ORDER) {
    if (id === '|') { root.append(h('div', { class: 'tool-sep' })); continue; }
    const t = T[id];
    const b = h('button', { class: 'btn tool-btn', dataset: { tool: id }, title: t.name, tip: t.tip, key: t.key, tipPos: 'right' }, icon(t.icon, 19), h('span', { class: 'tk' }, t.key.replace('Shift+', '⇧').replace('Ctrl+', '^')));
    b.addEventListener('click', () => I.setTool(id));
    root.append(b);
  }
  root.append(h('div', { class: 'tool-sep' }));
  el.swP = h('div', { class: 'sw p', title: 'Primary color', tip: 'Used by left-click painting, outlines and fills. Click to choose a color. On a mask, its brightness decides how much is hidden.', tipPos: 'right' });
  el.swS = h('div', { class: 'sw s', title: 'Secondary color', tip: 'Used by right-click painting and shape fills. Click to choose a color.', tipPos: 'right' });
  el.swP.addEventListener('click', () => App.colorPopover(el.swP, I.primary, { onInput: c => { I.primary = c; I.updateSwatches(); } }));
  el.swS.addEventListener('click', () => App.colorPopover(el.swS, I.secondary, { onInput: c => { I.secondary = c; I.updateSwatches(); } }));
  const swap = h('div', { class: 'swap', title: 'Swap colors', key: 'X', tip: 'Exchanges the primary and secondary colors.' }, icon('swap', 14));
  swap.addEventListener('click', () => { [I.primary, I.secondary] = [I.secondary, I.primary]; I.updateSwatches(); });
  const reset = h('div', { class: 'reset', title: 'Default colors', key: 'D', tip: 'Resets to black and white — handy when painting masks.' });
  reset.addEventListener('click', () => { I.primary = '#000000'; I.secondary = '#ffffff'; I.updateSwatches(); });
  root.append(h('div', { class: 'swatches' }, el.swP, el.swS, swap, reset));
}
I.updateSwatches = () => { el.swP.style.background = I.primary; el.swS.style.background = I.secondary; };

function optionsUI() {
  const root = el.opts;
  if (!root) return;
  root.innerHTML = '';
  const t = T[I.tool];
  root.append(h('div', { class: 'panel-title', style: { whiteSpace: 'nowrap', marginRight: '6px' } }, t.name));
  for (const c of (t.options ? t.options() : [])) root.append(c);
  if (I.maskEdit && I.doc) {
    root.append(h('div', { class: 'grow' }), h('button', { class: 'i-mask-pill' + (I.maskView ? ' on' : ''), title: 'Editing the layer mask', tip: 'You’re painting on the layer mask: black hides, white reveals, grey partly hides. Click to go back to editing pixels. Press \\ for a red overlay of hidden areas.',
      onclick: () => I.editMask(false) }, icon('mask', 13), I.maskView ? 'Viewing mask' : 'Editing mask'));
  }
}
I.optionsUI = optionsUI;

/* ---------- document tabs ---------- */
I.docTabsUI = () => {
  const root = el.docTabs;
  if (!root) return;
  root.innerHTML = '';
  for (const D of I.docs) {
    const t = h('div', { class: 'doc-tab' + (D === I.doc ? ' on' : ''), title: D.name, tip: 'Click to switch images · double-click to rename · middle-click to close. Your open images autosave in this browser.' },
      icon('image', 13), h('span', { class: 'dt-name' }, D.name), h('span', { class: 'dt-size' }, `${D.w}×${D.h}`),
      btn({ icon: 'x', cls: 'sm', title: 'Close image', tip: 'Closes this image (you can undo right after).', onClick: e => { e.stopPropagation(); I.closeDoc(D); } }));
    t.addEventListener('click', () => I.switchDoc(D));
    t.addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); I.closeDoc(D); } });
    t.addEventListener('dblclick', async () => { const v = await App.prompt('Rename image', 'Image name', D.name); if (v && v.trim()) { D.name = v.trim(); I.docTabsUI(); I.saveSoon(); } });
    App.xfer.source(t, () => I.docPayload(D));   // drag a tab into the Video editor (or onto another image as a layer)
    root.append(t);
  }
  root.append(btn({ icon: 'plus', cls: 'sm', title: 'New image', key: 'Ctrl+N', tip: 'Opens another blank canvas in a new tab. Drop image files here to open them as new tabs.', onClick: I.newDialog }));
  const on = root.querySelector('.doc-tab.on');
  on && on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

/* ---------- side panel ---------- */
function buildSide(root) {
  const tabs = h('div', { class: 'ptabs' });
  const body = h('div', { class: 'panel-body', style: { display: 'flex', flexDirection: 'column' } });
  const defs = [['layers', 'Layers', 'layers', 'Stack of layers with masks and editable text. Paint on separate layers to keep edits flexible.'], ['adjust', 'Adjust', 'sliders', 'Lightroom-style light & color sliders plus one-click looks.'], ['history', 'History', 'history', 'Every step you took. Click any step to jump back to it.']];
  for (const [k, l, ic, tip] of defs) {
    const b = h('button', { class: 'ptab', dataset: { k }, title: l, tip }, icon(ic, 14), l);
    b.addEventListener('click', () => I.showPanel(k));
    tabs.append(b);
  }
  el.sideBody = body;
  el.tabs = tabs;
  root.append(tabs, body);
  el.layersPane = buildLayersPane();
  el.adjustPane = buildAdjustPane();
  el.historyPane = h('div', { style: { padding: '6px', overflow: 'auto' } });
}
I.showPanel = k => {
  I.panel = k;
  el.tabs.querySelectorAll('.ptab').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  el.sideBody.innerHTML = '';
  el.sideBody.append(k === 'layers' ? el.layersPane : k === 'adjust' ? el.adjustPane : el.historyPane);
  if (k === 'adjust') { I.devUI(); makeLooks(); I.histSoon(); }
  if (k === 'history') I.historyUI();
  if (k === 'layers') I.layersUI();
  I.workflowUI();
};
const newLayerCmd = () => { I.settle(); I.flushDev(); I.addLayer(); I.pushHistory('New layer', 'layers'); };
function buildLayersPane() {
  const wrap = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } });
  el.layerList = h('div', { class: 'layers' });
  el.layerProps = h('div', { class: 'layer-props' });
  const B = (ic, title, tip, fn, key) => btn({ icon: ic, cls: 'sm', title, tip, key, onClick: fn });
  const btns = h('div', { class: 'layer-btns' },
    B('plus', 'New layer', 'Adds an empty transparent layer above the current one.', newLayerCmd, 'Ctrl+Shift+N'),
    B('mask', 'Add layer mask', 'Adds a mask: paint black on it to hide parts of the layer, white to bring them back — nothing is ever erased. With a selection, everything outside it is hidden. Alt+click: start with everything hidden.', e => I.addMask(e && e.altKey)),
    B('copy', 'Duplicate layer', 'Makes a copy of the current layer (with its mask and text).', () => dupLayer()),
    B('merge', 'Merge down', 'Combines this layer with the one below it.', mergeDown, 'Ctrl+E'),
    B('chevUp', 'Move up', 'Moves the layer up the stack (drawn on top of more layers).', () => moveLayer(1), 'Ctrl+]'),
    B('chevDown', 'Move down', 'Moves the layer down the stack.', () => moveLayer(-1), 'Ctrl+['),
    B('trash', 'Delete layer', 'Removes the current layer.', delLayer),
  );
  wrap.append(el.layerList, el.layerProps, btns);
  return wrap;
}
function dupLayer() {
  I.settle(); I.flushDev();
  const L = I.active(), D = I.doc, N = cloneLayer(L, L.name + ' copy');
  D.layers.splice(D.active + 1, 0, N); D.active++;
  I.maskEdit = false;
  I.compositeNow(); I.pushHistory('Duplicate layer', 'copy');
}
function mergeDown() {
  const D = I.doc, i = D.active;
  if (i === 0) return App.toast('Nothing below to merge into', 'warn');
  I.settle(); I.flushDev();
  const top = D.layers[i], below = D.layers[i - 1];
  if (below.mask) { if (below.maskOn) { below.ctx.save(); below.ctx.globalCompositeOperation = 'destination-in'; below.ctx.drawImage(below.mask, 0, 0); below.ctx.restore(); } below.mask = null; bumpM(below); }
  below.ctx.save(); below.ctx.globalAlpha = top.opacity; below.ctx.globalCompositeOperation = top.blend; if (top.visible) below.ctx.drawImage(I.masked(top), 0, 0); below.ctx.restore();
  I.ensurePixels(below, true);
  D.layers.splice(i, 1); D.active = i - 1; I.maskEdit = false;
  I.dirty(below); I.pushHistory('Merge down', 'merge');
}
function mergeVisible() {
  const D = I.doc, vis = D.layers.filter(L => L.visible);
  if (vis.length < 2) return App.toast('Need at least two visible layers to merge', 'warn');
  I.settle(); I.flushDev();
  const flat = I.flatten(vis), at = D.layers.indexOf(vis[vis.length - 1]);
  const N = mkLayer('Merged', D.w, D.h); N.ctx.drawImage(flat, 0, 0);
  D.layers.splice(at + 1, 0, N);
  D.layers = D.layers.filter(L => !vis.includes(L));
  D.active = D.layers.indexOf(N); I.maskEdit = false;
  I.compositeNow(); I.pushHistory('Merge visible', 'merge');
}
function moveLayer(dir) {
  const D = I.doc, i = D.active, j = i + dir;
  if (j < 0 || j >= D.layers.length) return;
  [D.layers[i], D.layers[j]] = [D.layers[j], D.layers[i]];
  D.active = j; I.compositeNow(); I.pushHistory('Reorder layers', 'layers');
}
function delLayer() {
  const D = I.doc;
  if (D.layers.length <= 1) return App.toast('An image needs at least one layer', 'warn');
  I.settle(); I.flushDev();
  const name = D.layers[D.active].name;
  D.layers.splice(D.active, 1);
  D.active = Math.max(0, D.active - 1); I.maskEdit = false; I.maskView = false;
  I.compositeNow(); I.pushHistory('Delete layer', 'trash');
  App.toast(`Deleted “${name}”`, '', 4000, { label: 'Undo', fn: I.undo });
}
I.flattenImage = () => {
  const D = I.doc;
  if (D.layers.length <= 1 && !D.layers[0].mask) return;
  I.settle(); I.flushDev();
  const flat = I.flatten(), L = mkLayer('Background', D.w, D.h);
  L.ctx.drawImage(flat, 0, 0);
  D.layers = [L]; D.active = 0; I.maskEdit = false; I.maskView = false;
  I.compositeNow(); I.pushHistory('Flatten', 'layers');
};
let thumbTimer = 0;
I.thumbsSoon = () => { clearTimeout(thumbTimer); thumbTimer = setTimeout(drawThumbs, 200); };
function drawThumbs() {
  if (!el.layerList || !I.doc) return;
  const D = I.doc;
  el.layerList.querySelectorAll('.layer').forEach(row => {
    const L = D.layers.find(l => l.id === row.dataset.id);
    if (!L) return;
    const k = Math.min(88 / D.w, 68 / D.h), w = D.w * k, hh = D.h * k;
    const lt = row.querySelector('canvas.lt'), mt = row.querySelector('canvas.mask');
    if (lt) { const c = lt.getContext('2d'); c.clearRect(0, 0, 88, 68); c.drawImage(L.canvas, (88 - w) / 2, (68 - hh) / 2, w, hh); }
    if (mt && L.mask) { const c = mt.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, 88, 68); c.drawImage(L.mask, (88 - w) / 2, (68 - hh) / 2, w, hh); }
  });
}
const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color dodge'], ['color-burn', 'Color burn'], ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity']];
const selectLayer = (i, mask = false) => {
  const D = I.doc;
  if (D.active === i && I.maskEdit === mask) return;
  I.settle(); I.flushDev();
  if (D.active !== i) I.maskView = false;
  D.active = i; I.maskEdit = mask && !!D.layers[i].mask;
  if (!I.maskEdit) I.maskView = false;
  I.compositeNow(); I.layersUI(); I.histSoon(); optionsUI(); I.statusUI(); I.overlay();
  if (I.tool === 'text' && T.text.activate) { T.text.activate(); optionsUI(); }
};
I.layersUI = () => {
  if (!el.layerList || !I.doc) return;
  const D = I.doc;
  if (I.maskEdit && !(I.active() && I.active().mask)) I.maskEdit = false;
  const scroll = el.layerList.scrollTop;
  el.layerList.innerHTML = '';
  let dragId = null;
  for (let i = D.layers.length - 1; i >= 0; i--) {
    const L = D.layers[i], on = i === D.active;
    const lt = h('canvas', { width: 88, height: 68, class: 'lt' + (on && L.mask && !I.maskEdit ? ' editing' : ''), title: L.text ? 'Text layer' : 'Layer pixels',
      tip: L.text ? 'Live text — double-click to edit the words, font or color. Ctrl+click: select its shape.' : 'Click to paint on the layer’s pixels. Ctrl+click: select its contents.' });
    lt.addEventListener('click', e => { e.stopPropagation(); if (e.ctrlKey || e.metaKey) return I.selFromAlpha(L.canvas, e.shiftKey ? 'add' : 'new'); selectLayer(i, false); });
    lt.addEventListener('dblclick', e => { e.stopPropagation(); if (L.text) { selectLayer(i, false); I.startText(L.text.x, L.text.y, L); } });
    let mt = null;
    if (L.mask) {
      mt = h('canvas', { width: 88, height: 68, class: 'mask' + (on && I.maskEdit ? ' editing' : '') + (L.maskOn ? '' : ' off'), title: 'Layer mask',
        tip: 'Black hides, white reveals. Click to paint on the mask · Shift+click: turn it off/on · Alt+click: view the mask itself · Ctrl+click: load it as a selection. Right-click for more.' });
      mt.addEventListener('click', e => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) return I.selFromAlpha(L.mask, e.shiftKey ? 'add' : 'new');
        if (i !== D.active) selectLayer(i, true);
        if (e.shiftKey) return I.toggleMask();
        if (e.altKey) return I.toggleMaskView();
        selectLayer(i, true);
      });
      mt.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); selectLayer(i, true); App.contextMenu(e, maskMenuItems()); });
    }
    const name = h('div', { class: 'l-name', title: 'Layer name', tip: 'Double-click to rename.' }, L.name);
    const badges = [];
    if (L.text) badges.push(h('span', { class: 'l-badge', title: 'Text layer', tip: 'This text stays editable — double-click its thumbnail or the text on the canvas.' }, 'T'));
    if (L.mask && !L.maskOn) badges.push(h('span', { class: 'l-badge off', title: 'Mask disabled', tip: 'The mask is turned off. Shift+click the mask thumbnail to turn it back on.' }, 'MASK OFF'));
    const row = h('div', { class: 'layer' + (on ? ' on' : '') + (L.visible ? '' : ' hiddenl'), draggable: 'true', dataset: { id: L.id } },
      lt, mt, h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'l-top' }, name, ...badges), h('div', { class: 'l-sub' }, `${Math.round(L.opacity * 100)}% · ${BLENDS.find(b => b[0] === L.blend)[1]}`)),
      btn({ icon: L.visible ? 'eye' : 'eyeOff', cls: 'sm', title: L.visible ? 'Hide layer' : 'Show layer', tip: 'Toggles whether this layer is visible. Alt+click: show only this layer.', onClick: e => { e.stopPropagation(); if (e.altKey) { const solo = D.layers.every(x => x === L || !x.visible); D.layers.forEach(x => x.visible = solo || x === L); } else L.visible = !L.visible; I.compositeNow(); I.pushHistory(L.visible ? 'Show layer' : 'Hide layer', 'eye'); } }),
      btn({ icon: L.locked ? 'lock' : 'unlock', cls: 'sm', title: L.locked ? 'Unlock' : 'Lock', tip: 'A locked layer can’t be painted on or moved.', onClick: e => { e.stopPropagation(); L.locked = !L.locked; I.layersUI(); I.saveSoon(); } }));
    row.addEventListener('click', () => selectLayer(i, false));
    name.addEventListener('dblclick', async e => { e.stopPropagation(); const v = await App.prompt('Rename layer', 'Layer name', L.name); if (v) { L.name = v; I.pushHistory('Rename layer', 'tag'); } });
    row.addEventListener('contextmenu', e => { e.preventDefault(); selectLayer(i, false); App.contextMenu(e, layerMenuItems()); });
    row.addEventListener('dragstart', e => { dragId = L.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', L.name); App.xfer.start(e, I.layerPayload(L), false); });
    row.addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); const r = row.getBoundingClientRect(); row.classList.toggle('drop-above', e.clientY < r.top + r.height / 2); row.classList.toggle('drop-below', e.clientY >= r.top + r.height / 2); });
    row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
    row.addEventListener('drop', e => {
      e.preventDefault(); row.classList.remove('drop-above', 'drop-below');
      const from = D.layers.findIndex(x => x.id === dragId); dragId = null;
      if (from < 0) return;
      const r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
      const moving = D.layers.splice(from, 1)[0];
      const to = D.layers.indexOf(L) + (above ? 1 : 0);
      D.layers.splice(to, 0, moving); D.active = to;
      I.compositeNow(); I.pushHistory('Reorder layers', 'layers');
    });
    el.layerList.append(row);
  }
  el.layerList.scrollTop = scroll;
  const L = I.active();
  el.layerProps.innerHTML = '';
  el.layerProps.append(
    App.slider({ label: 'Opacity', min: 0, max: 100, step: 1, value: Math.round(L.opacity * 100), def: 100, unit: '%', tip: 'How see-through the whole layer is.', onInput: v => { L.opacity = v / 100; I.composite(); }, onChange: () => I.pushHistory('Layer opacity', 'layers') }),
    App.select({ label: 'Blend', value: L.blend, options: BLENDS, tip: 'How this layer mixes with the layers below. Multiply darkens (great for shadows/line art), Screen lightens (glows), Overlay boosts contrast.', onChange: v => { L.blend = v; I.compositeNow(); I.pushHistory('Blend mode', 'layers'); } }));
  if (L.mask) el.layerProps.append(h('div', { class: 'chips', style: { paddingTop: '6px' } },
    chip(I.maskEdit ? 'Editing mask' : 'Edit mask', 'Paint on the mask instead of the pixels (black hides, white reveals).', () => I.editMask(!I.maskEdit), I.maskEdit),
    chip('Invert', 'Swap hidden and visible areas.', I.invertMask), chip(L.maskOn ? 'Disable' : 'Enable', 'Temporarily turn the mask off to compare.', I.toggleMask),
    chip('Apply', 'Permanently erase the hidden parts and remove the mask.', I.applyMask), chip('Delete', 'Remove the mask — the whole layer shows again.', I.deleteMask)));
  if (L.text) el.layerProps.append(h('div', { class: 'chips', style: { paddingTop: '6px' } },
    chip('Edit text', 'Change the words, font, size or color.', () => I.startText(L.text.x, L.text.y, L)),
    chip('Rasterize', 'Turn the text into ordinary pixels so you can paint on it or filter it.', () => { I.ensurePixels(L, true); I.pushHistory('Rasterize text', 'text'); })));
  drawThumbs();
};
const chip = (label, tip, fn, on) => { const c = h('button', { class: 'chip' + (on ? ' on' : ''), title: label, tip }, label); c.addEventListener('click', fn); return c; };

/* ---------- history panel ---------- */
I.historyUI = () => {
  if (!el.historyPane || I.panel !== 'history') return;
  el.historyPane.innerHTML = '';
  I.history.forEach((s, i) => {
    const it = h('div', { class: 'hist-item' + (i === I.hIndex ? ' on' : '') + (i > I.hIndex ? ' future' : ''), title: s.label, tip: i > I.hIndex ? 'Undone step — click to redo up to here.' : 'Click to go back to this point. Your later steps stay available until you make a new change.' }, icon(s.icon, 15), s.label);
    it.addEventListener('click', () => I.goHistory(i));
    el.historyPane.append(it);
  });
  if (I.history.length >= 50) el.historyPane.append(h('div', { class: 'hint' }, 'Only the last 50 steps are kept.'));
  const on = el.historyPane.querySelector('.on');
  on && on.scrollIntoView({ block: 'nearest' });
};

/* ---------- adjust (develop) panel ---------- */
const DEV_GROUPS = [
  ['Light', 'sun', [['exposure', 'Exposure', -3, 3, 0.05, 'EV', 'Overall brightness, like opening the camera aperture.'], ['contrast', 'Contrast', -100, 100, 1, '', 'Difference between lights and darks.'], ['highlights', 'Highlights', -100, 100, 1, '', 'Recover (−) or brighten (+) the brightest areas, like skies.'], ['shadows', 'Shadows', -100, 100, 1, '', 'Lift (+) dark areas to reveal detail, or deepen them (−).']]],
  ['Color', 'palette', [['temperature', 'Temperature', -100, 100, 1, '', 'Cooler (blue) or warmer (yellow) white balance.'], ['tint', 'Tint', -100, 100, 1, '', 'Shifts toward green (−) or magenta (+). Fixes color casts from fluorescent light.'], ['vibrance', 'Vibrance', -100, 100, 1, '', 'Smart saturation: boosts dull colors more than already-strong ones (skin stays natural).'], ['saturation', 'Saturation', -100, 100, 1, '', 'Intensity of all colors. −100 = black & white.']]],
  ['Effects', 'sparkle', [['clarity', 'Clarity', -100, 100, 1, '', 'Adds mid-tone punch and texture (+) or a soft dreamy glow (−).'], ['fade', 'Fade', 0, 100, 1, '', 'Lifts the blacks for a matte, film-like finish.'], ['vignette', 'Vignette', -100, 100, 1, '', 'Darkens (+) or lightens (−) the corners to focus attention.'], ['grain', 'Grain', 0, 100, 1, '', 'Adds film grain texture.']]],
];
let devCtls = [];
function buildAdjustPane() {
  const wrap = h('div', { style: { overflow: 'auto', flex: 1 } });
  el.histo = h('canvas', { class: 'histo', title: 'Histogram', tip: 'Distribution of tones from black (left) to white (right). A graph bunched to one side means the image is dark or bright.' });
  el.looks = h('div', { class: 'looks' });
  wrap.append(h('div', { class: 'histo-wrap' }, el.histo));
  wrap.append(App.section('Looks', 'sparkle', [h('div', { class: 'hint', style: { paddingTop: 0 } }, 'One-click starting points — then fine-tune below.'), el.looks], { tip: 'Preset combinations of the sliders below.', id: 'i-looks' }));
  for (const [title, ic, list] of DEV_GROUPS) {
    const rows = list.map(([k, label, min, max, step, unit, tip]) => {
      const s = App.slider({ label, min, max, step, value: I.dev[k], def: 0, unit, tip, onInput: v => { I.dev[k] = v; I.devUpdate(true); }, onChange: () => I.devUpdate(false) });
      s._k = k; devCtls.push(s);
      return s;
    });
    wrap.append(App.section(title, ic, rows, { id: 'i-dev-' + title }));
  }
  wrap.append(h('div', { class: 'hint' }, 'Adjustments preview live on the active layer (inside the selection, if any). Press ', h('b', null, 'Apply'), ' to bake them in — or just keep working and they’re applied automatically.'));
  wrap.append(h('div', { class: 'adj-actions' },
    btn({ icon: 'undo', label: 'Reset', cls: 'solid txt', title: 'Reset sliders', tip: 'Puts every slider back to zero and drops the preview.', onClick: () => I.devReset() }),
    btn({ icon: 'check', label: 'Apply', cls: 'primary txt', title: 'Apply adjustments', key: 'Enter', tip: 'Bakes the adjustments into the layer (undoable).', onClick: () => I.devApply() })));
  return wrap;
}
I.devUI = () => { for (const s of devCtls) s.set(I.dev[s._k]); };
let devRaf = 0, devDraft = true;
I.devUpdate = draft => {
  devDraft = draft;
  if (devRaf) return;
  devRaf = requestAnimationFrame(() => { devRaf = 0; runDev(devDraft); });
};
function runDev(draft) {
  const D = I.doc, L = I.active();
  if (F.isDefault(I.dev)) { if (I.preview && !I.preview.dialog) I.preview = null; I.devSession = null; I.composite(); I.devUI(); return; }
  let S = I.devSession;
  if (!S || S.layer !== L || S.ver !== L.ver) S = I.devSession = { layer: L, ver: L.ver };
  const px = D.w * D.h, k = draft && px > 1.2e6 ? Math.sqrt(1.2e6 / px) : 1;
  const key = k === 1 ? 'full' : 'draft';
  if (!S[key]) {
    let src = L.canvas;
    if (k < 1) { src = App.canvas(D.w * k, D.h * k); const c = src.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(L.canvas, 0, 0, src.width, src.height); }
    S[key] = { src };
  }
  const E = S[key];
  if (I.dev.clarity && !E.blur) E.blur = F.data(F.blur(E.src, Math.max(3, Math.min(E.src.width, E.src.height) * 0.025))).data;
  const out = F.develop(E.src, I.dev, E.blur);
  I.preview = { layer: L, canvas: I.sel ? I.maskWithSel(E.src, out) : out };
  I.composite();
}
I.devApply = () => {
  if (F.isDefault(I.dev)) return App.toast('Move a slider or pick a look first');
  if (I.active().locked) return App.toast('Layer is locked', 'warn');
  runDev(false);
  const L = I.active();
  L.ctx.save(); L.ctx.globalCompositeOperation = 'copy'; L.ctx.drawImage(I.preview.canvas, 0, 0); L.ctx.restore();
  I.preview = null; I.devSession = null; I.dev = { ...F.DEV_DEFAULTS };
  I.ensurePixels(L, true);
  I.devUI(); I.dirty(L); I.pushHistory('Adjust', 'sliders');
  makeLooks();
};
I.devReset = () => { I.dev = { ...F.DEV_DEFAULTS }; I.devSession = null; if (I.preview && !I.preview.dialog) I.preview = null; I.composite(); I.devUI && I.devUI(); };
/** Bake any pending adjustment preview before another edit. */
I.flushDev = () => { if (I.doc && !F.isDefault(I.dev) && I.devSession) { I.devApply(); App.toast('Pending adjustments were applied'); } };
function makeLooks() {
  if (!el.looks || I.panel !== 'adjust' || !I.doc) return;
  el.looks.innerHTML = '';
  const L = I.active(), D = I.doc, k = Math.min(1, 120 / Math.max(D.w, D.h));
  const small = App.canvas(D.w * k, D.h * k), sc = small.getContext('2d');
  sc.fillStyle = '#fff'; sc.fillRect(0, 0, small.width, small.height);
  sc.drawImage(L.canvas, 0, 0, small.width, small.height);
  const blur = F.data(F.blur(small, 3)).data;
  for (const lk of F.LOOKS) {
    const p = { ...F.DEV_DEFAULTS, ...lk.p };
    const out = F.develop(small, p, blur);
    const cv = h('canvas', { width: out.width, height: out.height });
    cv.getContext('2d').drawImage(out, 0, 0);
    const tile = h('div', { class: 'look', title: lk.name, tip: lk.tip + ' Click to preview, then Apply.' }, cv, h('span', null, lk.name));
    tile.addEventListener('click', () => { I.dev = { ...F.DEV_DEFAULTS, ...lk.p }; I.devUI(); I.devUpdate(false); el.looks.querySelectorAll('.look').forEach(t => t.classList.toggle('on', t === tile)); });
    el.looks.append(tile);
  }
}
let histTimer = 0;
I.histSoon = () => {
  if (I.panel !== 'adjust' || !I.doc) return;
  clearTimeout(histTimer);
  histTimer = setTimeout(() => { const L = I.active(); F.drawHistogram(el.histo, F.histogram(I.preview && I.preview.layer === L && !I.preview.mask ? I.preview.canvas : L.canvas, 300)); }, 120);
};

/* =====================================================================
   Dialogs
   ===================================================================== */
const PRESETS = [
  ['1920×1080', 1920, 1080, 'Full HD'], ['1280×720', 1280, 720, 'HD / Thumbnail'], ['1080×1080', 1080, 1080, 'Square post'], ['1080×1350', 1080, 1350, 'Portrait post'],
  ['1080×1920', 1080, 1920, 'Story / Reel'], ['1500×500', 1500, 500, 'Banner'], ['3840×2160', 3840, 2160, '4K'], ['2480×3508', 2480, 3508, 'A4 @ 300 dpi'], ['512×512', 512, 512, 'Icon'],
];
I.newDialog = () => {
  const [w0, h0, bg0] = newDocSpec();
  let bg = bg0;
  const fw = h('input', { class: 'field', value: w0, title: 'Width', tip: 'Width in pixels.' }), fh = h('input', { class: 'field', value: h0, title: 'Height', tip: 'Height in pixels.' });
  [fw, fh].forEach(f => f.addEventListener('keydown', e => e.stopPropagation()));
  const chips = h('div', { class: 'newdoc-presets' }, PRESETS.map(([lab, pw, ph, nm]) => {
    const c = h('button', { class: 'chip', title: nm, tip: `${pw} × ${ph} pixels.` }, nm, h('small', null, lab));
    c.addEventListener('click', () => { fw.value = pw; fh.value = ph; chips.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); });
    return c;
  }));
  const fromClip = I.clip ? h('button', { class: 'chip', title: 'Clipboard size', tip: `Use the size of what you copied (${I.clip.canvas.width} × ${I.clip.canvas.height}).` }, 'Clipboard', h('small', null, `${I.clip.canvas.width}×${I.clip.canvas.height}`)) : null;
  if (fromClip) { fromClip.addEventListener('click', () => { fw.value = I.clip.canvas.width; fh.value = I.clip.canvas.height; }); chips.prepend(fromClip); }
  const nameF = h('input', { class: 'field wide', value: 'Untitled', title: 'Name', tip: 'Shown on the image tab and used for exports.' });
  nameF.addEventListener('keydown', e => e.stopPropagation());
  const bgSeg = App.seg({ value: { transparent: 'transparent', '#000000': 'black' }[bg0] || 'white', onChange: v => { bg = v === 'white' ? '#ffffff' : v === 'transparent' ? 'transparent' : v === 'black' ? '#000000' : I.secondary; }, options: [
    { value: 'white', label: 'White', tip: 'Start with a white canvas.' }, { value: 'transparent', label: 'Transparent', tip: 'Start with an empty, see-through canvas (great for logos and stickers).' },
    { value: 'black', label: 'Black', tip: 'Start with a black canvas.' }, { value: 'secondary', label: 'Secondary color', tip: 'Fill with the current secondary color.' }] });
  App.modal({
    title: 'New image', icon: 'fileNew', width: 500,
    body: h('div', null, h('div', { class: 'hint', style: { paddingTop: 0 } }, 'Pick a preset or type a size. The image opens in its own tab — your other images stay open.'), chips,
      h('div', { class: 'dims' }, fw, '×', fh, h('span', { class: 'hint', style: { padding: 0 } }, 'pixels')),
      h('div', { class: 'ctl', style: { padding: '8px 16px' }, title: 'Background', tip: 'What the canvas starts filled with.' }, h('label', null, 'Background'), bgSeg),
      h('div', { class: 'ctl stack', style: { padding: '0 16px 8px' } }, h('label', null, 'Name'), nameF)),
    buttons: [{ label: 'Cancel' }, { label: 'Create', primary: true, onClick: () => {
      const W = clamp(Math.round(+fw.value) || 1280, 1, 8192), H = clamp(Math.round(+fh.value) || 800, 1, 8192);
      I.newDoc(W, H, bg, nameF.value.trim() || 'Untitled');
    } }],
  });
};
const flatBlob = (fmt, q, k = 1) => {
  const flat = I.flatten(), c = App.canvas(Math.max(1, flat.width * k), Math.max(1, flat.height * k)), ctx = c.getContext('2d');
  if (fmt === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(flat, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(b => r({ b, w: c.width, h: c.height }), 'image/' + fmt, q));
};
I.exportDialog = () => {
  I.settle(); I.flushDev();
  let fmt = 'png';
  const name = h('input', { class: 'field wide', value: I.doc.name || 'image', title: 'File name', tip: 'Name of the downloaded file.' });
  name.addEventListener('keydown', e => e.stopPropagation());
  const info = h('div', { class: 'hint mono' }, 'Estimating size…');
  const q = App.slider({ label: 'Quality', min: 10, max: 100, step: 1, value: 90, def: 90, unit: '%', tip: 'Higher = better looking but larger file. 80–90% is a good balance.', onChange: () => est() });
  const sc = App.slider({ label: 'Scale', min: 10, max: 200, step: 1, value: 100, def: 100, unit: '%', tip: 'Export smaller (or bigger) than the canvas.', onChange: () => est() });
  const seg = App.seg({ value: fmt, onChange: v => { fmt = v; q.style.display = v === 'png' ? 'none' : ''; est(); }, options: [
    { value: 'png', label: 'PNG', tip: 'Lossless, keeps transparency. Best for graphics, screenshots and logos.' },
    { value: 'jpeg', label: 'JPEG', tip: 'Small files for photos. No transparency (filled with white).' },
    { value: 'webp', label: 'WebP', tip: 'Modern format: small files with transparency. Great for websites.' }] });
  q.style.display = 'none';
  let estT = 0;
  const est = () => { clearTimeout(estT); estT = setTimeout(async () => { const { b, w, h: hh } = await flatBlob(fmt, q.get() / 100, sc.get() / 100); info.textContent = `${w} × ${hh} px · about ${App.fmtBytes(b.size)}`; }, 150); };
  est();
  const copyBtn = btn({ icon: 'copy', label: 'Copy', cls: 'solid txt sm', title: 'Copy to clipboard', tip: 'Copies the finished image so you can paste it straight into a chat, email or document.', onClick: async () => {
    try { const { b } = await flatBlob('png', 1, sc.get() / 100); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); App.toast('Image copied to the clipboard', 'ok'); }
    catch { App.toast('The browser blocked clipboard access', 'warn'); }
  } });
  App.modal({
    title: 'Export image', icon: 'download', width: 420, left: copyBtn,
    body: h('div', null, h('div', { class: 'ctl stack' }, h('label', null, 'File name'), name), h('div', { class: 'ctl', title: 'Format', tip: 'File type.' }, h('label', null, 'Format'), seg), q, sc, info,
      h('div', { class: 'hint' }, 'All visible layers are merged into the exported file. Your layers, masks and text stay editable here — use ', h('b', null, 'Save project'), ' to keep them in a file.')),
    buttons: [{ label: 'Cancel' }, { label: 'Export', primary: true, onClick: async () => { const { b } = await flatBlob(fmt, q.get() / 100, sc.get() / 100); App.download(b, (name.value || 'image') + '.' + (fmt === 'jpeg' ? 'jpg' : fmt)); App.toast('Exported ' + App.fmtBytes(b.size), 'ok'); } }],
  });
};
I.sendToVideo = () => { I.settle(); I.flushDev(); App.xfer.send(I.docPayload(I.doc), 'video'); };

/* ---------- drag & drop with the other editors ---------- */
const flattenDoc = D => {
  const c = App.canvas(D.w, D.h), ctx = c.getContext('2d');
  for (const L of D.layers) { if (!L.visible) continue; ctx.globalAlpha = L.opacity; ctx.globalCompositeOperation = L.blend; ctx.drawImage(I.masked(L), 0, 0); }
  return c;
};
/** a whole image (all visible layers) as something the Video editor can take */
I.docPayload = D => ({ kind: 'image', from: 'image', docId: D.id, name: D.name, icon: 'image',
  image: () => { if (D === I.doc) { I.settle(); I.flushDev(); } return App.xfer.canvasBlob(flattenDoc(D)); },
  file: async () => App.xfer.pngFile(await App.xfer.canvasBlob(flattenDoc(D)), D.name) });
/** one layer (with its mask applied, keeping its place on the canvas) */
I.layerPayload = L => ({ kind: 'image', from: 'image', docId: I.doc.id, layerId: L.id, name: L.name, icon: 'layers',
  image: () => App.xfer.canvasBlob(I.masked(L)),
  file: async () => App.xfer.pngFile(await App.xfer.canvasBlob(I.masked(L)), L.name) });
App.xfer.receivers.image = {
  accepts: p => !!p.image,
  async receive(p) { await I.openImage(await p.image(), p.name); },
};
function resizeDialog() {
  const D = I.doc, ar = D.w / D.h;
  let lock = true;
  const fw = h('input', { class: 'field', value: D.w, title: 'Width', tip: 'New width in pixels.' }), fh = h('input', { class: 'field', value: D.h, title: 'Height', tip: 'New height in pixels.' });
  [fw, fh].forEach(f => f.addEventListener('keydown', e => e.stopPropagation()));
  fw.addEventListener('input', () => { if (lock) fh.value = Math.round(+fw.value / ar) || ''; });
  fh.addEventListener('input', () => { if (lock) fw.value = Math.round(+fh.value * ar) || ''; });
  const lk = App.toggle({ label: 'Keep proportions', value: true, tip: 'Changes width and height together so the image isn’t stretched.', onChange: v => lock = v });
  const pct = h('div', { class: 'chips', style: { padding: '4px 16px' } }, [25, 50, 75, 150, 200].map(p => { const c = h('button', { class: 'chip', title: p + '%', tip: `Resize to ${p}% of the current size.` }, p + '%'); c.addEventListener('click', () => { fw.value = Math.round(D.w * p / 100); fh.value = Math.round(D.h * p / 100); }); return c; }));
  let smooth = 'smooth';
  const qs = App.seg({ value: smooth, onChange: v => smooth = v, options: [{ value: 'smooth', label: 'Smooth', tip: 'Best for photos.' }, { value: 'pixel', label: 'Pixelated', tip: 'Keeps hard pixel edges — best for pixel art.' }] });
  App.modal({ title: 'Resize image', icon: 'expand', width: 400, body: h('div', null, h('div', { class: 'dims' }, fw, '×', fh, 'px'), pct, lk, h('div', { class: 'ctl', title: 'Resampling', tip: 'How new pixels are calculated.' }, h('label', null, 'Quality'), qs)),
    buttons: [{ label: 'Cancel' }, { label: 'Resize', primary: true, onClick: () => {
      const W = clamp(Math.round(+fw.value), 1, 8192), H = clamp(Math.round(+fh.value), 1, 8192);
      I.transformAll('Resize image', W, H, (ctx, src) => { ctx.imageSmoothingEnabled = smooth === 'smooth'; ctx.drawImage(src, 0, 0, W, H); });
    } }] });
}
function canvasSizeDialog() {
  const D = I.doc;
  const fw = h('input', { class: 'field', value: D.w, title: 'Width', tip: 'New canvas width — the image isn’t scaled, just given more (or less) room.' }), fh = h('input', { class: 'field', value: D.h, title: 'Height', tip: 'New canvas height.' });
  [fw, fh].forEach(f => f.addEventListener('keydown', e => e.stopPropagation()));
  let ax = 1, ay = 1;
  const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 26px)', gap: '3px' } });
  const cells = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const c = h('button', { class: 'chip' + (x === 1 && y === 1 ? ' on' : ''), style: { width: '26px', height: '26px', padding: 0 }, title: 'Anchor', tip: 'Where the existing image sits in the new canvas.' }, '•');
    c.addEventListener('click', () => { ax = x; ay = y; cells.forEach(k => k.classList.toggle('on', k === c)); });
    cells.push(c); grid.append(c);
  }
  const fill = App.color({ label: 'Fill new area', value: '#ffffff', tip: 'Color for the added space on the bottom layer (or leave it transparent).' });
  let transp = true;
  const tr = App.toggle({ label: 'Transparent', value: true, tip: 'Leave new space empty instead of filling it.', onChange: v => transp = v });
  App.modal({ title: 'Canvas size', icon: 'grid', width: 400, body: h('div', null, h('div', { class: 'dims' }, fw, '×', fh, 'px'), h('div', { class: 'ctl', title: 'Anchor', tip: 'Choose which edge stays put.' }, h('label', null, 'Anchor'), grid), tr, fill),
    buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: () => {
      const W = clamp(Math.round(+fw.value), 1, 8192), H = clamp(Math.round(+fh.value), 1, 8192);
      I.resizeCanvas(W, H, Math.round((W - D.w) * ax / 2), Math.round((H - D.h) * ay / 2), 'Canvas size', transp ? null : fill.input.value);
      I.fit();
    } }] });
}
function straightenDialog() {
  let ang = 0, fillCorners = true;
  const disp = I.disp;
  const prev = () => {
    const a = Math.abs(ang) * Math.PI / 180, D = I.doc;
    const s = fillCorners ? Math.max((D.w * Math.cos(a) + D.h * Math.sin(a)) / D.w, (D.w * Math.sin(a) + D.h * Math.cos(a)) / D.h) : 1;
    disp.style.transform = `rotate(${ang}deg) scale(${s})`;
    disp.style.transformOrigin = '50% 50%';
    I.stage.style.overflow = 'hidden';
    return s;
  };
  const sl = App.slider({ label: 'Angle', min: -45, max: 45, step: 0.1, value: 0, def: 0, unit: '°', tip: 'Tilt to level a crooked horizon. Fine steps of 0.1°.', onInput: v => { ang = v; prev(); } });
  const tg = App.toggle({ label: 'Fill corners', value: true, tip: 'Zooms in slightly so no empty corners appear after rotating.', onChange: v => { fillCorners = v; prev(); } });
  const md = App.modal({ title: 'Straighten / rotate', icon: 'rotate', width: 380, clear: true, body: h('div', null, h('div', { class: 'hint', style: { paddingTop: 0 } }, 'Tip: line up a horizon or building edge with the image edges. Turn on View ▸ Grid for a reference.'), sl, tg,
    h('div', { class: 'chips', style: { padding: '4px 12px' } }, [-90, -45, 45, 90, 180].map(a => { const c = h('button', { class: 'chip', title: a + '°', tip: `Set the angle to ${a}°.` }, a + '°'); c.addEventListener('click', () => { ang = a; sl.set(Math.max(-45, Math.min(45, a))); prev(); }); return c; }))),
    buttons: [{ label: 'Cancel' }, { label: 'Rotate', primary: true, onClick: () => {
      disp.style.transform = ''; I.stage.style.overflow = '';
      if (!ang) return;
      const s = prev(); disp.style.transform = ''; I.stage.style.overflow = '';
      const D = I.doc;
      I.transformAll('Rotate ' + ang + '°', D.w, D.h, (ctx, src) => { ctx.translate(D.w / 2, D.h / 2); ctx.rotate(ang * Math.PI / 180); ctx.scale(s, s); ctx.drawImage(src, -D.w / 2, -D.h / 2); });
    } }],
    onClose: () => { disp.style.transform = ''; I.stage.style.overflow = ''; } });
  dockModal(md);
}
const dockModal = I.dockModal = md => { const r = I.vp.getBoundingClientRect(); Object.assign(md.el.style, { position: 'fixed', top: (r.top + 12) + 'px', left: (r.right - md.el.offsetWidth - 12) + 'px', margin: 0 }); };

/**
 * Generic live-preview filter dialog (works on layer pixels or, when editing a mask, on the mask).
 * params: slider {id,label,min,max,step,def,unit,tip} · select {type:'select',options} · toggle · color ·
 *         point {type:'point', def:[fx,fy]} = a position you set by clicking the image (shown as a crosshair) ·
 *         head {type:'head', label} = a small group heading · button {type:'button', label, onClick(vals)}.
 * heavy: slower filters — longer debounce and a "Rendering…" note. vals: start values (used by Last Filter).
 */
I.fxDialog = ({ title, tip, params = [], run, presets, width = 380, extra, heavy = false, vals: start, onClose: closeHook }) => {
  const L = I.active();
  if (L.locked) return App.toast('Layer is locked', 'warn');
  I.settle(); I.flushDev();
  const t = I.target();
  const vals = {};
  for (const p of params) if (p.id) vals[p.id] = Array.isArray(p.def) ? p.def.slice() : p.def;
  if (start) Object.assign(vals, JSON.parse(JSON.stringify(start)));
  const orig = t.src;
  let timer = 0, last = null;
  const big = I.doc.w * I.doc.h > 2e6;
  const status = h('div', { class: 'fx-status' });
  const compute = () => { last = I.maskWithSel(orig, run(orig, vals)); return last; };
  const update = () => {
    clearTimeout(timer);
    if (heavy) status.textContent = 'Rendering preview…';
    timer = setTimeout(() => {
      const t0 = performance.now();
      try { compute(); } catch (e) { console.error(e); status.textContent = 'Could not render: ' + e.message; return; }
      I.preview = { layer: L, canvas: t.mask ? grayToMask(last) : last, dialog: true, mask: t.mask }; I.composite(); I.histSoon();
      const ms = Math.round(performance.now() - t0);
      status.textContent = heavy || ms > 400 ? `Preview ready · ${ms} ms` : '';
    }, heavy ? (big ? 320 : 180) : big ? 140 : 40);
  };
  // point parameters: click (or drag) on the image to place them
  const points = params.filter(p => p.type === 'point');
  let activePt = points[0] && points[0].id;
  const markers = points.map(p => { const m = h('div', { class: 'fx-pin', dataset: { id: p.id } }); I.vp.append(m); return m; });
  const placeMarkers = () => markers.forEach(m => { const v = vals[m.dataset.id], q = I.toScreen(v[0] * I.doc.w, v[1] * I.doc.h); m.style.left = q.x + 'px'; m.style.top = q.y + 'px'; m.classList.toggle('on', m.dataset.id === activePt); });
  const onPick = e => {
    if (!points.length || e.button !== 0 || !e.target.closest || !e.target.closest('.i-viewport')) return;
    e.preventDefault(); e.stopPropagation();
    const set = ev => { const q = I.toDoc(ev.clientX, ev.clientY); vals[activePt] = [clamp(q.x / I.doc.w, 0, 1), clamp(q.y / I.doc.h, 0, 1)]; placeMarkers(); update(); };
    set(e);
    const mv = ev => set(ev), up = () => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
  };
  if (points.length) document.addEventListener('pointerdown', onPick, true);
  const ptRows = [];
  const ctls = params.map(p => {
    if (p.type === 'point') {
      const r = h('div', { class: 'ctl fx-pt-row' + (p.id === activePt ? ' on' : ''), title: p.label, tip: (p.tip || 'Where the effect is centred.') + ' Click or drag on the image to move it.' }, h('label', null, p.label), h('span', { class: 'fx-pt-hint' }, icon('target', 13), points.length > 1 ? 'Pick, then click the image' : 'Click the image to place'));
      r.addEventListener('click', () => { activePt = p.id; ptRows.forEach(x => x.classList.toggle('on', x === r)); placeMarkers(); });
      ptRows.push(r);
      return r;
    }
    if (p.type === 'select') { const s = App.select({ label: p.label, value: vals[p.id], options: p.options, tip: p.tip, onChange: v => { vals[p.id] = v === '' || isNaN(+v) ? v : +v; update(); } }); s._id = p.id; return s; }
    if (p.type === 'toggle') { const s = App.toggle({ label: p.label, value: !!vals[p.id], tip: p.tip, onChange: v => { vals[p.id] = v; update(); } }); s._id = p.id; return s; }
    if (p.type === 'color') { const s = App.color({ label: p.label, value: vals[p.id], tip: p.tip, onInput: v => { vals[p.id] = v; update(); } }); s._id = p.id; return s; }
    if (p.type === 'button') return h('div', { class: 'ctl' }, h('label', null, ''), btn({ label: p.label, icon: p.icon, cls: 'solid txt sm', title: p.label, tip: p.tip, onClick: () => { p.onClick(vals); ctls.forEach(c => c && c._id != null && c.set && c.set(vals[c._id])); update(); } }));
    if (p.type === 'head') return h('h5', { class: 'fx-head' }, p.label);
    const s = App.slider({ label: p.label, min: p.min, max: p.max, step: p.step || 1, value: vals[p.id], def: p.def, unit: p.unit, tip: p.tip || '', onInput: v => { vals[p.id] = v; update(); } });
    s._id = p.id;
    return s;
  });
  const presetSel = presets ? App.select({ label: 'Preset', value: '', tip: 'Quick starting points.', options: [['', 'Choose…'], ...Object.keys(presets).map(k => [k, k])], onChange: v => { if (!v) return; Object.assign(vals, presets[v]); ctls.forEach(c => c && c._id != null && c.set && c.set(vals[c._id])); update(); } }) : null;
  let showOrig = false;
  const cmp = btn({ icon: 'eye', label: 'Before', cls: 'solid txt sm', title: 'Compare', tip: 'Hold to see the original image; release to see the result.' });
  cmp.addEventListener('pointerdown', () => { showOrig = true; if (I.preview) I.preview.show = false; I.composite(); });
  const rel = () => { if (!showOrig) return; showOrig = false; if (I.preview) I.preview.show = true; I.composite(); };
  cmp.addEventListener('pointerup', rel); cmp.addEventListener('pointerleave', rel);
  const viewTimer = points.length ? setInterval(placeMarkers, 120) : 0;   // follows zoom / pan while the dialog is open
  const md = App.modal({
    title: title + (t.mask ? ' · mask' : ''), width, clear: true, cls: 'fx-modal',
    body: h('div', null, tip ? h('div', { class: 'hint', style: { paddingTop: 0 } }, tip) : null, t.mask ? h('div', { class: 'hint', style: { paddingTop: 0 } }, h('b', null, 'Working on the layer mask.'), ' Click the layer thumbnail first to filter the pixels instead.') : null, extra ? extra(vals, update) : null, presetSel, ...ctls, status),
    left: cmp,
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, tip: 'Apply the filter (Ctrl+Z undoes it).', onClick: () => {
      clearTimeout(timer);
      I.busy(true, title + '…');
      try { const out = compute(); I.preview = null; writeTarget(t, out, title, 'sparkle'); }
      finally { I.busy(false); }
      I.lastFilter = { title, tip, params, run, presets, width, extra, heavy, vals: JSON.parse(JSON.stringify(vals)) };
    } }],
    onClose: () => {
      clearTimeout(timer); clearInterval(viewTimer);
      if (points.length) { document.removeEventListener('pointerdown', onPick, true); markers.forEach(m => m.remove()); }
      if (I.preview && I.preview.dialog) { I.preview = null; I.composite(); }
      closeHook && closeHook();
    },
  });
  dockModal(md);
  placeMarkers();
  update();
  return md;
};
/** Filter ▸ Last Filter (Ctrl+Alt+F): run the previous filter again with the same settings. */
I.repeatFilter = () => {
  const f = I.lastFilter;
  if (!f) return App.toast('No filter used yet');
  const L = I.active();
  if (L.locked) return App.toast('Layer is locked', 'warn');
  I.settle(); I.flushDev();
  const t = I.target();
  I.busy(true, f.title + '…');
  setTimeout(() => { try { writeTarget(t, I.maskWithSel(t.src, f.run(t.src, f.vals)), f.title, 'sparkle'); } finally { I.busy(false); } }, 30);
};
I.applyNow = (title, fn) => {
  const L = I.active();
  if (L.locked) return App.toast('Layer is locked', 'warn');
  I.settle(); I.flushDev();
  const t = I.target();
  writeTarget(t, I.maskWithSel(t.src, fn(t.src)), title);
};

function curvesDialog() {
  const curves = { rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] };
  let ch = 'rgb';
  const cv = h('canvas', { class: 'curve-canvas', title: 'Curve', tip: 'Click to add a point, drag to bend the curve, drag a point off the graph (or double-click it) to remove. Up = brighter, down = darker; an S-shape adds contrast.' });
  const hist = F.histogram(I.target().src, 300);
  const draw = () => {
    const dpr = App.fitCanvas(cv), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    let mx = 1; const arr = ch === 'rgb' ? hist.l : hist[ch];
    for (let i = 2; i < 254; i++) mx = Math.max(mx, arr[i]);
    ctx.fillStyle = `rgba(${App.th.ink},.08)`;
    for (let i = 0; i < 256; i++) { const v = Math.sqrt(arr[i] / mx); ctx.fillRect(i / 256 * W, H - v * H, W / 256 + 1, v * H); }
    ctx.strokeStyle = `rgba(${App.th.ink},.1)`; ctx.lineWidth = dpr; ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(i * W / 4, 0); ctx.lineTo(i * W / 4, H); ctx.moveTo(0, i * H / 4); ctx.lineTo(W, i * H / 4); }
    ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
    const col = { rgb: App.th.text, r: '#ff5d6c', g: '#4ade80', b: '#5ab0ff' }[ch];
    const lut = F.curveLut(curves[ch]);
    ctx.strokeStyle = col; ctx.lineWidth = 2 * dpr; ctx.beginPath();
    for (let x = 0; x < 256; x++) { const px = x / 255 * W, py = H - lut[x] / 255 * H; x ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
    ctx.fillStyle = col;
    for (const [x, y] of curves[ch]) { ctx.beginPath(); ctx.arc(x / 255 * W, H - y / 255 * H, 5 * dpr, 0, 7); ctx.fill(); }
  };
  let update = () => {};
  const toVal = e => { const r = cv.getBoundingClientRect(); return [clamp(Math.round((e.clientX - r.left) / r.width * 255), 0, 255), clamp(Math.round((1 - (e.clientY - r.top) / r.height) * 255), 0, 255), e.clientX - r.left, e.clientY - r.top, r]; };
  cv.addEventListener('pointerdown', e => {
    const [x, y] = toVal(e), pts = curves[ch];
    let idx = pts.findIndex(p => Math.abs(p[0] - x) < 10 && Math.abs(p[1] - y) < 14);
    if (idx < 0) { pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); idx = pts.findIndex(p => p[0] === x && p[1] === y); }
    cv.setPointerCapture(e.pointerId);
    const mv = ev => {
      const [nx, ny, , py, r] = toVal(ev);
      const out = (py < -30 || py > r.height + 30) && idx > 0 && idx < pts.length - 1;
      if (out) { pts.splice(idx, 1); idx = -1; cv.removeEventListener('pointermove', mv); }
      else { const lo = idx > 0 ? pts[idx - 1][0] + 1 : 0, hi = idx < pts.length - 1 ? pts[idx + 1][0] - 1 : 255; pts[idx] = [clamp(nx, lo, hi), ny]; }
      draw(); update();
    };
    cv.addEventListener('pointermove', mv);
    cv.addEventListener('pointerup', () => cv.removeEventListener('pointermove', mv), { once: true });
    draw(); update();
  });
  cv.addEventListener('dblclick', e => { const [x, y] = toVal(e), pts = curves[ch]; const idx = pts.findIndex(p => Math.abs(p[0] - x) < 10 && Math.abs(p[1] - y) < 14); if (idx > 0 && idx < pts.length - 1) { pts.splice(idx, 1); draw(); update(); } });
  const chSeg = App.seg({ value: 'rgb', onChange: v => { ch = v; draw(); }, options: [{ value: 'rgb', label: 'RGB', tip: 'Brightness of all channels together.' }, { value: 'r', label: 'Red', tip: 'Red channel only — up adds red, down adds cyan.' }, { value: 'g', label: 'Green', tip: 'Green channel — up adds green, down adds magenta.' }, { value: 'b', label: 'Blue', tip: 'Blue channel — up adds blue, down adds yellow.' }] });
  const presetBtns = h('div', { class: 'chips', style: { padding: '8px 14px 0' } }, [
    ['Medium contrast', [[0, 0], [64, 52], [192, 204], [255, 255]]], ['Strong contrast', [[0, 0], [64, 40], [192, 216], [255, 255]]], ['Brighten', [[0, 0], [128, 160], [255, 255]]], ['Darken', [[0, 0], [128, 100], [255, 255]]], ['Matte fade', [[0, 32], [128, 128], [255, 236]]], ['Negative', [[0, 255], [255, 0]]],
  ].map(([n, pts]) => { const c = h('button', { class: 'chip', title: n, tip: 'Load this curve shape for the current channel.' }, n); c.addEventListener('click', () => { curves[ch] = pts.map(p => p.slice()); draw(); update(); }); return c; }));
  I.fxDialog({ title: 'Curves', width: 330, tip: 'The most precise tone tool. Bend the line to remap shadows (left) through highlights (right).',
    extra: (vals, upd) => { update = upd; requestAnimationFrame(draw); return h('div', null, h('div', { class: 'ctl' }, chSeg), h('div', { class: 'curve-wrap' }, cv), presetBtns); },
    run: src => F.curves(src, curves) });
}
function levelsDialog() {
  const hist = F.histogram(I.target().src, 300);
  const cv = h('canvas', { class: 'histo', style: { height: '90px' }, title: 'Histogram', tip: 'Tones from black (left) to white (right). Move Black/White points to where the graph starts and ends.' });
  requestAnimationFrame(() => F.drawHistogram(cv, hist, 'l'));
  I.fxDialog({ title: 'Levels', tip: 'Set the darkest and brightest points and the midtone balance — a quick way to fix flat, foggy or dull photos.',
    extra: () => h('div', { style: { padding: '0 12px 6px' } }, cv),
    params: [
      { id: 'inBlack', label: 'Black point', min: 0, max: 254, def: 0, tip: 'Everything darker than this becomes pure black.' },
      { id: 'gamma', label: 'Midtones', min: 0.1, max: 3, step: 0.01, def: 1, tip: 'Brighten (> 1) or darken (< 1) the mid-tones without clipping.' },
      { id: 'inWhite', label: 'White point', min: 1, max: 255, def: 255, tip: 'Everything brighter than this becomes pure white.' },
      { id: 'outBlack', label: 'Output black', min: 0, max: 255, def: 0, tip: 'Raise to make the darkest black a dark grey (faded look).' },
      { id: 'outWhite', label: 'Output white', min: 0, max: 255, def: 255, tip: 'Lower to make the brightest white a light grey.' }],
    run: (src, v) => F.levels(src, v) });
}

const ADJ = {
  brightness: () => I.fxDialog({ title: 'Brightness / Contrast', tip: 'The quickest fix for images that are too dark, too bright or flat.', params: [{ id: 'brightness', label: 'Brightness', min: -100, max: 100, def: 0, tip: 'Lighter or darker overall.' }, { id: 'contrast', label: 'Contrast', min: -100, max: 100, def: 0, tip: 'More or less difference between darks and lights.' }], run: (s, v) => F.brightnessContrast(s, v) }),
  exposure: () => I.fxDialog({ title: 'Exposure', tip: 'Photographic exposure in stops (EV), plus offset and gamma.', params: [{ id: 'exposure', label: 'Exposure', min: -3, max: 3, step: 0.05, def: 0, unit: 'EV', tip: '+1 doubles the light, −1 halves it.' }, { id: 'offset', label: 'Offset', min: -50, max: 50, def: 0, tip: 'Shifts the darkest tones up or down.' }, { id: 'gamma', label: 'Gamma', min: 0.2, max: 3, step: 0.01, def: 1, tip: 'Midtone correction.' }], run: (s, v) => F.exposure(s, v) }),
  hueSat: () => I.fxDialog({ title: 'Hue / Saturation', tip: 'Shift colors, make them more or less intense, or colorize the whole image with one tint.', params: [{ id: 'hue', label: 'Hue', min: -180, max: 180, def: 0, unit: '°', tip: 'Rotates every color around the color wheel.' }, { id: 'saturation', label: 'Saturation', min: -100, max: 100, def: 0, tip: 'Color intensity.' }, { id: 'lightness', label: 'Lightness', min: -100, max: 100, def: 0, tip: 'Pushes everything toward white or black.' }, { id: 'colorize', label: 'Colorize', type: 'toggle', def: false, tip: 'Turns the image into shades of a single color (choose it with Hue).' }], run: (s, v) => F.hueSat(s, v) }),
  balance: () => I.fxDialog({ title: 'Color balance', tip: 'Fix color casts or set a mood by nudging the color channels.', params: [{ id: 'temperature', label: 'Temperature', min: -100, max: 100, def: 0, tip: 'Cool (blue) ↔ warm (yellow).' }, { id: 'tint', label: 'Tint', min: -100, max: 100, def: 0, tip: 'Green ↔ magenta.' }, { id: 'cyanRed', label: 'Cyan ↔ Red', min: -100, max: 100, def: 0, tip: 'Adds red (+) or cyan (−).' }, { id: 'magentaGreen', label: 'Magenta ↔ Green', min: -100, max: 100, def: 0, tip: 'Adds green (+) or magenta (−).' }, { id: 'yellowBlue', label: 'Yellow ↔ Blue', min: -100, max: 100, def: 0, tip: 'Adds blue (+) or yellow (−).' }], run: (s, v) => F.colorBalance(s, v) }),
  vibrance: () => I.fxDialog({ title: 'Vibrance', tip: 'Boost color naturally — vibrance protects already-saturated colors and skin tones.', params: [{ id: 'vibrance', label: 'Vibrance', min: -100, max: 100, def: 30, tip: 'Smart saturation boost.' }, { id: 'saturation', label: 'Saturation', min: -100, max: 100, def: 0, tip: 'Plain saturation for all colors.' }], run: (s, v) => F.vibrance(s, v) }),
  bw: () => I.fxDialog({ title: 'Black & white', tip: 'Convert to monochrome and control how each color channel becomes grey — like using color filters on B&W film.', presets: { 'Neutral': { red: 30, green: 59, blue: 11 }, 'Red filter (dramatic skies)': { red: 80, green: 20, blue: 0 }, 'Green filter (portraits)': { red: 20, green: 70, blue: 10 }, 'Blue filter (moody)': { red: 10, green: 30, blue: 60 } }, params: [{ id: 'red', label: 'Reds', min: 0, max: 100, def: 30, tip: 'How bright red areas become.' }, { id: 'green', label: 'Greens', min: 0, max: 100, def: 59, tip: 'How bright green areas become.' }, { id: 'blue', label: 'Blues', min: 0, max: 100, def: 11, tip: 'How bright blue areas (sky) become.' }, { id: 'tintAmt', label: 'Tone', min: 0, max: 100, def: 0, unit: '%', tip: 'Adds a tint such as sepia or selenium.' }, { id: 'tintColor', label: 'Tone color', type: 'color', def: '#c8a070', tip: 'Color of the tint.' }], run: (s, v) => F.blackWhite(s, v) }),
  posterize: () => I.fxDialog({ title: 'Posterize', tip: 'Reduces the number of tones for a flat, graphic poster look.', params: [{ id: 'levels', label: 'Levels', min: 2, max: 16, def: 5, tip: 'Tones per channel — fewer = bolder.' }], run: (s, v) => F.posterize(s, v) }),
  threshold: () => I.fxDialog({ title: 'Threshold', tip: 'Pure black & white — every pixel becomes either black or white. Great for stencils and line art.', params: [{ id: 'level', label: 'Threshold', min: 1, max: 255, def: 128, tip: 'Pixels brighter than this turn white.' }], run: (s, v) => F.threshold(s, v) }),
  sepia: () => I.fxDialog({ title: 'Sepia', tip: 'Warm brown antique photo tone.', params: [{ id: 'amount', label: 'Amount', min: 0, max: 100, def: 80, unit: '%', tip: 'Strength of the tint.' }], run: (s, v) => F.sepia(s, v) }),
};
const FILT = {
  blur: () => I.fxDialog({ title: 'Gaussian blur', tip: 'Smooth, even softening. Use with a selection to blur a background or hide details — or on a mask to soften its edge.', params: [{ id: 'r', label: 'Radius', min: 0, max: 100, step: 0.5, def: 6, unit: 'px', tip: 'Blur amount.' }], run: (s, v) => F.blur(s, v.r) }),
  motion: () => I.fxDialog({ title: 'Motion blur', tip: 'Streaks the image in one direction — suggests speed and movement.', params: [{ id: 'angle', label: 'Angle', min: -180, max: 180, def: 0, unit: '°', tip: 'Direction of the motion.' }, { id: 'distance', label: 'Distance', min: 2, max: 200, def: 30, unit: 'px', tip: 'Length of the streaks.' }], run: (s, v) => F.motionBlur(s, v) }),
  sharpen: () => I.fxDialog({ title: 'Sharpen', tip: 'Unsharp mask: crisper edges and detail. Don’t overdo it — watch for halos.', params: [{ id: 'amount', label: 'Amount', min: 0, max: 300, def: 80, unit: '%', tip: 'Strength of sharpening.' }, { id: 'radius', label: 'Radius', min: 0.5, max: 10, step: 0.1, def: 1.5, unit: 'px', tip: 'Size of the details to enhance.' }, { id: 'threshold', label: 'Threshold', min: 0, max: 40, def: 3, tip: 'Ignores tiny differences so noise isn’t sharpened.' }], run: (s, v) => F.sharpen(s, v) }),
  denoise: () => I.fxDialog({ title: 'Reduce noise', tip: 'Smooths grain and color speckles in flat areas while keeping edges.', params: [{ id: 'strength', label: 'Strength', min: 0, max: 100, def: 50, tip: 'How much smoothing.' }, { id: 'detail', label: 'Preserve detail', min: 0, max: 100, def: 50, tip: 'Higher keeps more texture and edges.' }], run: (s, v) => F.denoise(s, v) }),
  noise: () => I.fxDialog({ title: 'Add noise', tip: 'Adds grain or texture — great for a film look or to hide banding.', params: [{ id: 'amount', label: 'Amount', min: 0, max: 100, def: 12, tip: 'Grain strength.' }, { id: 'mono', label: 'Monochrome', type: 'toggle', def: true, tip: 'Grey grain instead of colored speckles.' }], run: (s, v) => F.noise(s, v) }),
  pixelate: () => I.fxDialog({ title: 'Pixelate', tip: 'Big blocky pixels — retro style, or to censor faces/plates with a selection.', params: [{ id: 'size', label: 'Cell size', min: 2, max: 100, def: 12, unit: 'px', tip: 'Size of each block.' }], run: (s, v) => F.pixelate(s, v) }),
  glow: () => I.fxDialog({ title: 'Glow', tip: 'Makes bright areas bloom with a soft dreamy light.', params: [{ id: 'radius', label: 'Radius', min: 2, max: 80, def: 18, unit: 'px', tip: 'Spread of the glow.' }, { id: 'strength', label: 'Strength', min: 0, max: 100, def: 55, unit: '%', tip: 'Intensity of the glow.' }, { id: 'threshold', label: 'Threshold', min: 0, max: 250, def: 150, tip: 'Only areas brighter than this glow.' }], run: (s, v) => F.glow(s, v) }),
  emboss: () => I.fxDialog({ title: 'Emboss', tip: 'Raised, stamped-metal relief effect.', params: [{ id: 'strength', label: 'Strength', min: 10, max: 200, def: 60, tip: 'Depth of the relief.' }], run: (s, v) => F.emboss(s, v) }),
  edges: () => I.fxDialog({ title: 'Find edges', tip: 'Outlines the edges in the image — sketch-like.', params: [{ id: 'invert', label: 'Dark lines on white', type: 'toggle', def: true, tip: 'Pencil-sketch look.' }], run: (s, v) => F.edges(s, v) }),
  oil: () => I.fxDialog({ title: 'Oil paint', tip: 'Painterly brush-stroke look (can be slow on big images).', params: [{ id: 'radius', label: 'Brush size', min: 1, max: 8, def: 3, tip: 'Size of the paint daubs.' }, { id: 'levels', label: 'Detail', min: 4, max: 30, def: 14, tip: 'Number of tone levels.' }], run: (s, v) => F.oil(s, v) }),
  vignette: () => I.fxDialog({ title: 'Vignette', tip: 'Darkens (or colors) the edges to frame your subject.', params: [{ id: 'amount', label: 'Amount', min: 0, max: 100, def: 55, unit: '%', tip: 'Darkness of the edges.' }, { id: 'size', label: 'Clear center', min: 0, max: 100, def: 45, unit: '%', tip: 'Size of the untouched middle area.' }, { id: 'color', label: 'Color', type: 'color', def: '#000000', tip: 'Edge color.' }], run: (s, v) => F.vignette(s, v) }),
  shadow: () => I.fxDialog({ title: 'Drop shadow', tip: 'Adds a shadow behind the layer’s content — makes cut-outs and text pop.', params: [{ id: 'x', label: 'Offset X', min: -100, max: 100, def: 10, unit: 'px', tip: 'Horizontal shadow offset.' }, { id: 'y', label: 'Offset Y', min: -100, max: 100, def: 12, unit: 'px', tip: 'Vertical shadow offset.' }, { id: 'blur', label: 'Softness', min: 0, max: 100, def: 18, unit: 'px', tip: 'Blur of the shadow edge.' }, { id: 'opacity', label: 'Opacity', min: 0, max: 100, def: 60, unit: '%', tip: 'Shadow darkness.' }, { id: 'color', label: 'Color', type: 'color', def: '#000000', tip: 'Shadow color.' }], run: (s, v) => F.dropShadow(s, v) }),
  outline: () => I.fxDialog({ title: 'Outline', tip: 'Draws a solid outline around the layer’s content — sticker style.', params: [{ id: 'width', label: 'Width', min: 1, max: 40, def: 6, unit: 'px', tip: 'Outline thickness.' }, { id: 'color', label: 'Color', type: 'color', def: '#ffffff', tip: 'Outline color.' }], run: (s, v) => F.outline(s, v) }),
};

/* =====================================================================
   Menus, top bar, status bar
   ===================================================================== */
const openImageCmd = async () => { const fs = await App.pickFiles('image/*', true); for (const f of fs) await I.openImage(f, f.name); };
function maskMenuItems() {
  const L = I.active(), has = !!(L && L.mask);
  return [
    { label: 'Add layer mask', icon: 'mask', disabled: has, tip: 'Non-destructive hiding: paint black on the mask to hide, white to reveal. With a selection, hides everything outside it.', action: () => I.addMask(false) },
    { label: I.sel ? 'Mask hiding the selection' : 'Add mask that hides all', icon: 'mask', disabled: has, tip: I.sel ? 'Hides the selected area instead of keeping it.' : 'Starts fully hidden — paint white to reveal.', action: () => I.addMask(true) },
    { sep: true },
    { label: 'Edit mask', icon: 'brush', disabled: !has, checked: () => I.maskEdit, tip: 'Paint on the mask instead of the pixels.', action: () => I.editMask(!I.maskEdit) },
    { label: 'Show mask overlay', icon: 'eye', disabled: !has, key: '\\', checked: () => I.ruby, tip: 'Tints hidden areas red while you edit the mask.', action: () => { I.ruby = !I.ruby; I.overlay(); } },
    { label: 'View mask', icon: 'contrast', disabled: !has, checked: () => I.maskView, tip: 'Shows the mask itself in black & white.', action: I.toggleMaskView },
    { label: 'Invert mask', icon: 'invert', disabled: !has, tip: 'Swap hidden and visible areas.', action: I.invertMask },
    { label: 'Disable / enable mask', icon: 'eyeOff', disabled: !has, tip: 'Temporarily turn the mask off to compare.', action: I.toggleMask },
    { label: 'Selection from mask', icon: 'selRect', disabled: !has, tip: 'Loads the mask as a selection.', action: () => I.selFromAlpha(L.mask) },
    { label: 'Apply mask', icon: 'check', disabled: !has, tip: 'Permanently erases the hidden parts and removes the mask.', action: I.applyMask },
    { label: 'Delete mask', icon: 'trash', disabled: !has, tip: 'Removes the mask — the whole layer shows again.', action: I.deleteMask },
  ];
}
function layerMenuItems() {
  const L = I.active();
  return [
    { label: 'New layer', icon: 'plus', key: 'Ctrl+Shift+N', tip: 'Empty transparent layer above the current one.', action: newLayerCmd },
    { label: 'Duplicate layer', icon: 'copy', tip: 'Copy of the current layer (with mask and text).', action: dupLayer },
    { label: 'Layer via copy', icon: 'layers', key: 'Ctrl+J', tip: 'Copy the selection to a new layer.', action: () => layerViaCopy(false) },
    { label: 'Layer via cut', icon: 'scissors', key: 'Ctrl+Shift+J', tip: 'Move the selection to a new layer.', action: () => layerViaCopy(true) },
    { label: 'Delete layer', icon: 'trash', tip: 'Remove the current layer.', action: delLayer },
    { sep: true },
    { label: 'Layer mask', icon: 'mask', tip: 'Hide parts of a layer without erasing them.', sub: maskMenuItems },
    { label: 'Remove background', icon: 'select', disabled: !!(L && L.mask), tip: 'One click: finds the plain background around your subject (product shots, portraits on a backdrop) and hides it with a layer mask. Nothing is erased — paint the mask to fix the edges.', action: I.removeBackground },
    { label: 'Edit text', icon: 'text', disabled: !(L && L.text), tip: 'Re-open the text for typing and styling.', action: () => L.text && I.startText(L.text.x, L.text.y, L) },
    { label: 'Rasterize text', icon: 'grid', disabled: !(L && L.text), tip: 'Convert text into ordinary pixels.', action: () => { I.ensurePixels(L, true); I.pushHistory('Rasterize text', 'text'); } },
    { sep: true },
    { label: 'Merge down', icon: 'merge', key: 'Ctrl+E', tip: 'Combine with the layer below.', action: mergeDown },
    { label: 'Merge visible', icon: 'merge', key: 'Ctrl+Shift+E', tip: 'Combine every visible layer into one (hidden layers are kept).', action: mergeVisible },
    { label: 'Flatten image', icon: 'layers', tip: 'Merge all layers into one.', action: I.flattenImage },
    { sep: true },
    { label: 'Free transform', icon: 'transform', key: 'Ctrl+T', tip: 'Scale, rotate and move with handles.', action: () => I.setTool('transform') },
    { label: 'Send layer to Video editor', icon: 'film', tip: 'Places just this layer (keeping its transparency and position) on the video timeline at the playhead — great for logos and overlays. You can also drag the layer onto the timeline.', action: () => App.xfer.send(I.layerPayload(I.active()), 'video') },
    { label: 'Flip layer horizontal', icon: 'flipH', tip: 'Mirror just this layer.', action: () => I.transformLayer('Flip layer', (ctx, s) => { ctx.translate(s.width, 0); ctx.scale(-1, 1); ctx.drawImage(s, 0, 0); }) },
    { label: 'Flip layer vertical', icon: 'flipV', tip: 'Mirror just this layer vertically.', action: () => I.transformLayer('Flip layer', (ctx, s) => { ctx.translate(0, s.height); ctx.scale(1, -1); ctx.drawImage(s, 0, 0); }) },
    { label: 'Rotate layer 90°', icon: 'rotate', tip: 'Rotate just this layer around the canvas center.', action: () => I.transformLayer('Rotate layer', (ctx, s) => { ctx.translate(s.width / 2, s.height / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(s, -s.width / 2, -s.height / 2); }) },
    { sep: true },
    { label: 'Clear layer', icon: 'x', tip: 'Erase everything on this layer.', action: () => { const s = I.sel; I.sel = null; I.clearSel('Clear layer'); I.sel = s; } },
    { label: 'Fill with primary', icon: 'bucket', key: 'Alt+Backspace', tip: 'Fill the whole layer (or selection) with the primary color.', action: () => I.fillSel() },
    { label: 'Drop shadow…', icon: 'layers', tip: 'Shadow behind the content.', action: FILT.shadow },
    { label: 'Outline…', icon: 'outline', tip: 'Sticker-style outline.', action: FILT.outline },
  ];
}
function menus() {
  return [
    { label: 'File', tip: 'Create, open, save, export and share images.', items: () => [
      { label: 'New image…', icon: 'fileNew', key: 'Ctrl+N', tip: 'Start a blank canvas at any size, in a new tab.', action: I.newDialog },
      { label: 'Open image…', icon: 'folder', key: 'Ctrl+O', tip: 'Open photos or pictures — each opens in its own tab.', action: openImageCmd },
      { label: 'Place as layer…', icon: 'layers', tip: 'Add pictures on top of this image as new layers.', action: async () => { const fs = await App.pickFiles('image/*', true); for (const f of fs) await I.openImage(f, f.name, true); } },
      { label: 'Duplicate image', icon: 'copy', tip: 'Opens a copy of this image (with all layers) in a new tab.', action: I.duplicateDoc },
      { label: 'Close image', icon: 'x', tip: 'Closes this tab (you can undo right after).', action: () => I.closeDoc() },
      { sep: true },
      { label: 'Open project…', icon: 'folder', tip: 'Open a .strata project file.', action: () => App.openProjectFile() },
      { label: 'Save project…', icon: 'save', key: 'Ctrl+S', tip: 'Download a .strata file that keeps layers, masks and editable text. Your open images also autosave in this browser.', action: I.saveProjectFile },
      { sep: true },
      { label: 'Export…', icon: 'download', key: 'Ctrl+Shift+S', tip: 'Save as PNG, JPEG or WebP.', action: I.exportDialog },
      { label: 'Quick export PNG', icon: 'download', tip: 'Instantly downloads a full-size PNG.', action: () => { I.settle(); I.flatten().toBlob(b => App.download(b, (I.doc.name || 'image') + '.png')); } },
      { label: 'Send to Video editor', icon: 'film', tip: 'Places this image on the video timeline at the playhead (as a still for titles, overlays or slideshows). You can also drag its tab onto the timeline.', action: I.sendToVideo },
    ] },
    { label: 'Edit', tip: 'Undo, clipboard and transform commands.', items: () => [
      { label: 'Undo', icon: 'undo', key: 'Ctrl+Z', disabled: I.hIndex <= 0, tip: I.hIndex > 0 ? 'Undo “' + I.history[I.hIndex].label + '”.' : 'Nothing to undo.', action: I.undo },
      { label: 'Redo', icon: 'redo', key: 'Ctrl+Y', disabled: I.hIndex >= I.history.length - 1, tip: 'Step forward.', action: I.redo },
      { sep: true },
      { label: 'Cut', icon: 'scissors', key: 'Ctrl+X', tip: 'Copy the selection and erase it from the layer.', action: () => I.copy(false, true) },
      { label: 'Copy', icon: 'copy', key: 'Ctrl+C', tip: 'Copy the selection (or the whole layer).', action: () => I.copy() },
      { label: 'Copy merged', icon: 'copy', key: 'Ctrl+Shift+C', tip: 'Copy what you see — all visible layers combined.', action: () => I.copy(true) },
      { label: 'Paste as layer', icon: 'paste', key: 'Ctrl+V', disabled: !I.clip, tip: 'Paste the copied pixels onto a new layer. (Ctrl+V also pastes images copied from other apps.)', action: () => I.clip && I.pasteCanvas(I.clip.canvas, I.clip.x, I.clip.y) },
      { label: 'Delete selected pixels', icon: 'trash', key: 'Del', tip: 'Erase the selection (or the whole layer).', action: () => I.clearSel() },
      { label: 'Fill with primary color', icon: 'bucket', key: 'Alt+Backspace', tip: 'Fill the selection (or layer) with the primary color.', action: () => I.fillSel() },
      { label: 'Fill with secondary color', icon: 'bucket', key: 'Ctrl+Backspace', tip: 'Fill the selection (or layer) with the secondary color.', action: () => I.fillSel(I.secondary) },
      { label: 'Content-aware fill', icon: 'bandage', key: 'Shift+F5', disabled: !I.sel, tip: 'Makes whatever is inside the selection disappear by rebuilding it from the area around it — remove people, wires, logos or dust. Select a little more than the object.', action: I.contentAwareFill },
      { sep: true },
      { label: 'Free transform', icon: 'transform', key: 'Ctrl+T', tip: 'Scale, rotate, flip and move the layer (or selection) with handles.', action: () => I.setTool('transform') },
    ] },
    { label: 'Image', tip: 'Size, rotation and canvas operations (affect every layer).', items: () => [
      { label: 'Resize image…', icon: 'expand', key: 'Ctrl+Alt+I', tip: 'Scale the whole picture to a new pixel size.', action: resizeDialog },
      { label: 'Canvas size…', icon: 'grid', key: 'Ctrl+Alt+C', tip: 'Add or remove space around the image without scaling it.', action: canvasSizeDialog },
      { label: 'Crop to selection', icon: 'crop', disabled: !I.sel, tip: 'Trim to the selected area.', action: I.cropToSel },
      { label: 'Trim transparent edges', icon: 'crop', tip: 'Removes empty transparent borders around the content.', action: trimTransparent },
      { sep: true },
      { label: 'Rotate 90° right', icon: 'rotate', tip: 'Turn the image clockwise.', action: () => rot90(true) },
      { label: 'Rotate 90° left', icon: 'rotateL', tip: 'Turn the image counter-clockwise.', action: () => rot90(false) },
      { label: 'Rotate 180°', icon: 'rotate', tip: 'Turn the image upside-down.', action: () => I.transformAll('Rotate 180°', I.doc.w, I.doc.h, (ctx, s) => { ctx.translate(s.width, s.height); ctx.rotate(Math.PI); ctx.drawImage(s, 0, 0); }) },
      { label: 'Straighten / rotate…', icon: 'rotate', tip: 'Rotate by any angle to level a crooked horizon.', action: straightenDialog },
      { label: 'Flip horizontal', icon: 'flipH', tip: 'Mirror the whole image left-to-right.', action: () => flipAll(true) },
      { label: 'Flip vertical', icon: 'flipV', tip: 'Mirror the whole image top-to-bottom.', action: () => flipAll(false) },
      { sep: true },
      { label: 'Flatten image', icon: 'layers', tip: 'Merge all layers into one.', action: I.flattenImage },
    ] },
    { label: 'Layer', tip: 'Create, combine, mask and transform layers.', items: () => layerMenuItems() },
    { label: 'Select', tip: 'Make, refine and reuse selections.', items: () => [
      { label: 'All', icon: 'cursor', key: 'Ctrl+A', tip: 'Select the whole canvas.', action: I.selectAll },
      { label: 'Deselect', icon: 'x', key: 'Ctrl+D', disabled: !I.sel, tip: 'Remove the selection.', action: I.deselect },
      { label: 'Reselect', icon: 'redo', key: 'Ctrl+Shift+D', disabled: !I.lastSel, tip: 'Bring back the selection you just removed.', action: I.reselect },
      { label: 'Inverse', icon: 'swap', key: 'Ctrl+Shift+I', tip: 'Select everything that wasn’t selected.', action: I.invertSel },
      { sep: true },
      { label: 'Select subject', icon: 'select', tip: 'Selects the main object by finding a plain background around it — great for product shots and portraits on simple backdrops.', action: () => I.subjectDialog(true) },
      { label: 'Select background', icon: 'select', tip: 'Selects the plain background around your subject — then Delete to cut it out.', action: () => I.subjectDialog(false) },
      { label: 'Color range…', icon: 'dropper', tip: 'Select every pixel similar to a color you pick, with soft edges.', action: I.colorRangeDialog },
      { label: 'From layer transparency', icon: 'layers', tip: 'Select the non-transparent pixels of the active layer (also: Ctrl+click its thumbnail).', action: () => I.selFromAlpha(I.active().canvas) },
      { sep: true },
      { label: 'Feather…', icon: 'feather', key: 'Shift+F6', disabled: !I.sel, tip: 'Soften the selection edge.', action: () => I.selectDialog('feather') },
      { label: 'Grow…', icon: 'plus', disabled: !I.sel, tip: 'Expand the selection outward.', action: () => I.selectDialog('grow') },
      { label: 'Shrink…', icon: 'minus', disabled: !I.sel, tip: 'Contract the selection inward.', action: () => I.selectDialog('shrink') },
      { label: 'Border…', icon: 'outline', disabled: !I.sel, tip: 'Turn the selection into a ring along its edge.', action: () => I.selectDialog('border') },
      { label: 'Smooth…', icon: 'curve', disabled: !I.sel, tip: 'Round off jagged corners.', action: () => I.selectDialog('smooth') },
      { sep: true },
      { label: 'Mask from selection', icon: 'mask', disabled: !I.sel, tip: 'Hide everything outside the selection on this layer — non-destructively.', action: () => I.addMask(false) },
      { label: 'Crop to selection', icon: 'crop', disabled: !I.sel, tip: 'Trim the canvas to the selection.', action: I.cropToSel },
    ] },
    { label: 'Adjust', tip: 'Tone and color corrections (apply to the active layer — or its mask — inside the selection if any).', items: () => [
      { label: 'Auto enhance', icon: 'sparkle', tip: 'One-click fix: stretches tones and removes color casts automatically.', action: () => I.applyNow('Auto enhance', F.autoLevels) },
      { label: 'Develop panel', icon: 'sliders', tip: 'Open the Lightroom-style Adjust panel with live sliders and looks.', action: () => I.showPanel('adjust') },
      { sep: true },
      { label: 'Brightness / Contrast…', icon: 'sun', tip: 'Quick overall light fix.', action: ADJ.brightness },
      { label: 'Levels…', icon: 'analyze', key: 'Ctrl+L', tip: 'Set black, white and midtone points with a histogram.', action: levelsDialog },
      { label: 'Curves…', icon: 'curve', key: 'Ctrl+M', tip: 'Precise tone control by bending a curve.', action: curvesDialog },
      { label: 'Exposure…', icon: 'sun', tip: 'Photographic exposure in stops.', action: ADJ.exposure },
      { sep: true },
      { label: 'Hue / Saturation…', icon: 'palette', key: 'Ctrl+U', tip: 'Shift and intensify colors, or colorize.', action: ADJ.hueSat },
      { label: 'Vibrance…', icon: 'palette', tip: 'Natural-looking color boost.', action: ADJ.vibrance },
      { label: 'Color balance…', icon: 'palette', key: 'Ctrl+B', tip: 'Fix color casts.', action: ADJ.balance },
      { label: 'Black & white…', icon: 'contrast', tip: 'Convert to monochrome with channel control.', action: ADJ.bw },
      { label: 'Sepia…', icon: 'contrast', tip: 'Warm antique tone.', action: ADJ.sepia },
      { sep: true },
      { label: 'Invert', icon: 'invert', key: 'Ctrl+I', tip: 'Turn into a color negative (on a mask: swap hidden and visible).', action: () => I.applyNow('Invert', F.invert) },
      { label: 'Posterize…', icon: 'grid', tip: 'Flat graphic poster tones.', action: ADJ.posterize },
      { label: 'Threshold…', icon: 'contrast', tip: 'Pure black & white.', action: ADJ.threshold },
      ...I.adjustExtraItems(),
    ] },
    { label: 'Filter', tip: 'Every Photoshop filter family: Camera Raw, Liquify, Filter Gallery, Lens Correction, blur, distort, noise, pixelate, render, sharpen, stylize and more.', items: () => I.filterMenuItems() },
    { label: 'View', tip: 'Zoom, guides and panels.', items: () => [
      { label: 'Zoom in', icon: 'zoomIn', key: 'Ctrl+=', tip: 'Magnify.', action: () => I.setZoom(I.zoom * 1.25) },
      { label: 'Zoom out', icon: 'zoomOut', key: 'Ctrl+-', tip: 'Shrink the view.', action: () => I.setZoom(I.zoom / 1.25) },
      { label: 'Fit on screen', icon: 'fit', key: 'Ctrl+0', tip: 'Show the whole image.', action: I.fit },
      { label: 'Actual pixels (100%)', icon: 'target', key: 'Ctrl+1', tip: 'One image pixel per screen pixel.', action: () => I.setZoom(1) },
      { sep: true },
      { label: 'Grid', icon: 'grid', key: "Ctrl+'", checked: () => VIEW.grid, tip: 'Overlay a square grid to line things up (not exported).', action: () => { VIEW.grid = !VIEW.grid; saveView(); } },
      { label: 'Grid spacing…', icon: 'grid', tip: 'Distance between grid lines, in image pixels.', action: async () => { const v = await App.prompt('Grid spacing', 'Pixels between grid lines', String(VIEW.gridSize)); const n = Math.round(+v); if (n >= 2) { VIEW.gridSize = n; VIEW.grid = true; saveView(); } } },
      { label: 'Rulers', icon: 'ruler', key: 'Ctrl+R', checked: () => VIEW.rulers, tip: 'Pixel rulers along the top and left edges, with a marker at the cursor.', action: () => { VIEW.rulers = !VIEW.rulers; saveView(); } },
      { label: 'Pixel grid when zoomed', icon: 'grid', checked: () => VIEW.pixelGrid, tip: 'Outline every pixel at 800% zoom and above — handy for pixel art.', action: () => { VIEW.pixelGrid = !VIEW.pixelGrid; saveView(); } },
      { label: 'Mask overlay', icon: 'mask', key: '\\', checked: () => I.ruby, tip: 'While editing a mask, tint the hidden areas red.', action: () => { I.ruby = !I.ruby; I.overlay(); } },
      { sep: true },
      { label: 'Side panel', icon: 'panelRight', checked: () => !el.root.classList.contains('no-side'), tip: 'Show or hide the Layers / Adjust / History panel for more canvas room.', action: toggleSide },
      { sep: true },
      App.uiScaleMenu(),
    ] },
  ];
}
const toggleSide = () => { el.root.classList.toggle('no-side'); try { localStorage.setItem('strata.i.noside', el.root.classList.contains('no-side') ? '1' : '0'); } catch {} setTimeout(() => I.overlay(), 30); };

function buildTop(root) {
  el.workflow = h('div', { class: 'workflow' });
  const steps = [
    ['open', 'Open', 'Start here: create a blank canvas, open a photo, or paste one (Ctrl+V).'],
    ['crop', 'Crop & rotate', 'Frame your shot: crop to a ratio, straighten, rotate or resize.'],
    ['adjust', 'Adjust', 'Fix light and color with simple sliders, or pick a one-click look.'],
    ['paint', 'Paint & retouch', 'Draw, add text and shapes, heal blemishes, mask and work in layers.'],
    ['export', 'Export', 'Save as PNG, JPEG or WebP — or send it to the Video editor.'],
  ];
  steps.forEach(([k, label, tip], i) => {
    if (i) el.workflow.append(h('span', { class: 'wf-arrow' }, icon('chevRight', 12)));
    const b = h('button', { class: 'wf-step', dataset: { k }, title: `Step ${i + 1}: ${label}`, tip }, h('i', null, i + 1), label);
    b.addEventListener('click', e => wfGo(k, e));
    el.workflow.append(b);
  });
  root.append(App.menubar(menus()), el.workflow,
    btn({ icon: 'undo', title: 'Undo', key: 'Ctrl+Z', tip: 'Step back. The History tab shows every step.', onClick: I.undo }),
    btn({ icon: 'redo', title: 'Redo', key: 'Ctrl+Y', tip: 'Step forward.', onClick: I.redo }),
    btn({ icon: 'panelRight', title: 'Side panel', tip: 'Show or hide the Layers / Adjust / History panel for more canvas room.', onClick: toggleSide }),
    btn({ icon: 'save', label: 'Save', cls: 'solid txt', title: 'Save project', key: 'Ctrl+S', tip: 'Download a .strata project that keeps layers, masks and editable text. Your images also autosave in this browser.', onClick: I.saveProjectFile }),
    btn({ icon: 'download', label: 'Export', cls: 'primary txt', title: 'Export', key: 'Ctrl+Shift+S', tip: 'Save your image as PNG, JPEG or WebP.', onClick: I.exportDialog }));
}
function wfGo(k, e) {
  if (k === 'open') {
    const r = e.currentTarget.getBoundingClientRect();
    App.openMenu(r.left, r.bottom + 6, [
      { label: 'New image…', icon: 'fileNew', key: 'Ctrl+N', tip: 'Blank canvas at any size.', action: I.newDialog },
      { label: 'Open image…', icon: 'folder', key: 'Ctrl+O', tip: 'Open photos from your computer.', action: openImageCmd },
      { label: 'Paste from clipboard', icon: 'paste', key: 'Ctrl+V', tip: 'Use an image you copied (e.g. a screenshot). You can also just press Ctrl+V anywhere.', action: pasteFromSystem },
      { label: 'Open project…', icon: 'folder', tip: 'Open a .strata project file.', action: () => App.openProjectFile() },
    ]);
  } else if (k === 'crop') { I.setTool('crop'); App.toast('Drag the frame handles, then press Enter. More in Image ▸ Rotate/Resize.'); }
  else if (k === 'adjust') I.showPanel('adjust');
  else if (k === 'paint') { I.setTool('brush'); I.showPanel('layers'); }
  else if (k === 'export') I.exportDialog();
}
I.workflowUI = () => {
  if (!el.workflow) return;
  const cur = I.tool === 'crop' ? 'crop' : I.panel === 'adjust' ? 'adjust' : ['brush', 'pencil', 'eraser', 'fill', 'gradient', 'shape', 'text', 'clone', 'retouch', 'heal'].includes(I.tool) ? 'paint' : null;
  el.workflow.querySelectorAll('.wf-step').forEach(b => b.classList.toggle('on', b.dataset.k === cur));
};
function trimTransparent() {
  const flat = I.flatten(), D = I.doc, b = I.contentBounds(flat);
  if (!b) return App.toast('The image is completely empty', 'warn');
  if (b.x === 0 && b.y === 0 && b.w === D.w && b.h === D.h) return App.toast('No transparent edges to trim');
  I.resizeCanvas(b.w, b.h, -b.x, -b.y, 'Trim');
  I.fit();
}
async function pasteFromSystem() {
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) { const t = it.types.find(x => x.startsWith('image/')); if (t) { const b = await it.getType(t); return I.pristine() ? I.openImage(b, 'Pasted image') : pasteBlobAsLayer(b); } }
    App.toast('No image on the clipboard', 'warn');
  } catch { App.toast('Press Ctrl+V to paste (browser blocked clipboard access)', 'warn'); }
}
async function pasteBlobAsLayer(b) {
  const url = URL.createObjectURL(b);
  const img = await App.loadImage(url);
  URL.revokeObjectURL(url);
  const c = App.canvas(img.naturalWidth, img.naturalHeight); c.getContext('2d').drawImage(img, 0, 0);
  I.pasteCanvas(c, null, null, 'Pasted image');
}
document.addEventListener('paste', async e => {
  if (App.active !== 'image' || App.isTyping(e.target) || App.modalCount || !I.doc) return;
  const item = Array.from(e.clipboardData ? e.clipboardData.items : []).find(i => i.type.startsWith('image/'));
  if (item && !(I.clip && !I.clip.written)) {
    e.preventDefault();
    const b = item.getAsFile();
    if (I.pristine()) I.openImage(b, 'Pasted image'); else pasteBlobAsLayer(b);
  } else if (I.clip) { e.preventDefault(); I.pasteCanvas(I.clip.canvas, I.clip.x, I.clip.y); }
});

function buildBottom(root) {
  const pal = h('div', { class: 'palette', title: 'Color palette', tip: 'Left-click a swatch to set the primary color, right-click for the secondary color. The + cells open the full color picker.' });
  const more = which => {
    const c = h('i', { class: 'pal-more', title: which === 'p' ? 'Custom primary color' : 'Custom secondary color', tip: which === 'p' ? 'Pick any primary color.' : 'Pick any secondary color.' }, icon('plus', 11));
    c.addEventListener('click', () => App.colorPopover(c, which === 'p' ? I.primary : I.secondary, { onInput: v => { if (which === 'p') I.primary = v; else I.secondary = v; I.updateSwatches(); } }));
    return c;
  };
  PALETTE.forEach((c, i) => {
    const sw = h('i', { style: { background: c } });
    sw.addEventListener('click', () => { I.primary = c; I.updateSwatches(); });
    sw.addEventListener('contextmenu', e => { e.preventDefault(); I.secondary = c; I.updateSwatches(); });
    pal.append(sw);
    if (i === 13) pal.append(more('p'));
  });
  pal.append(more('s'));
  el.status = h('div', { class: 'i-status' });
  el.zoomLbl = h('button', { class: 'tb-pill', style: { height: '26px', minWidth: '62px', justifyContent: 'center' }, title: 'Zoom', tip: 'Click to fit the image on screen.' });
  el.zoomLbl.addEventListener('click', I.fit);
  root.append(pal, h('div', { class: 'grow' }), el.status,
    btn({ icon: 'zoomOut', cls: 'sm', title: 'Zoom out', key: 'Ctrl+-', tip: 'Shrink the view.', onClick: () => I.setZoom(I.zoom / 1.25) }), el.zoomLbl,
    btn({ icon: 'zoomIn', cls: 'sm', title: 'Zoom in', key: 'Ctrl+=', tip: 'Magnify.', onClick: () => I.setZoom(I.zoom * 1.25) }),
    btn({ icon: 'fit', cls: 'sm', title: 'Fit', key: 'Ctrl+0', tip: 'Fit the image on screen.', onClick: I.fit }));
}
let statusRaf = 0;
I.statusUI = (p) => {
  if (p !== undefined) I._lastP = p;
  if (statusRaf) return;
  statusRaf = requestAnimationFrame(() => { statusRaf = 0; renderStatus(); });
};
function renderStatus() {
  if (!el.status || !I.doc) return;
  const q = I._lastP, D = I.doc, L = I.active();
  let col = null;
  if (q && q.x >= 0 && q.y >= 0 && q.x < D.w && q.y < D.h) {
    try { const d = I.dctx.getImageData(Math.floor(q.x), Math.floor(q.y), 1, 1).data; col = d[3] ? App.rgbToHex(d[0], d[1], d[2]) : 'transparent'; } catch {}
  }
  el.status.innerHTML = '';
  el.status.append(...[h('span', null, h('b', null, `${D.w} × ${D.h}`), ' px'),
    h('span', null, I.maskEdit ? 'Mask of ' : 'Layer ', h('b', null, L ? L.name : '')),
    I.sel ? h('span', null, 'Selection ', h('b', null, `${I.sel.bounds.w} × ${I.sel.bounds.h}`)) : null,
    q ? h('span', null, 'x ', h('b', null, Math.floor(q.x)), ' y ', h('b', null, Math.floor(q.y))) : null,
    col ? h('span', null, h('i', { class: 'px', style: { background: col === 'transparent' ? 'repeating-conic-gradient(#888 0 25%, #ccc 0 50%) 0 0/6px 6px' : col } }), h('b', null, col === 'transparent' ? '—' : col.toUpperCase())) : null].filter(Boolean));
  el.zoomLbl.textContent = Math.round(I.zoom * 100) + '%';
}
I.busy = (on, msg) => {
  if (!el.busy) return;
  el.busy.style.display = on ? 'grid' : 'none';
  if (msg) el.busyMsg.textContent = msg;
};

/* =====================================================================
   Persistence: autosave (IndexedDB) and .strata project files
   ===================================================================== */
let stored = new Set();
App.on('store-cleared', () => { stored = new Set(); });
const pngOf = cv => new Promise(r => cv.toBlob(r, 'image/png'));
const layerMeta = L => ({ id: L.id, name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, ver: L.ver, mver: L.mver, maskOn: L.maskOn, text: L.text ? { ...L.text } : null, tb: L.textBounds ? { ...L.textBounds } : null });
I.save = async () => {
  if (!I.docs.length) return;
  stash();
  const keep = new Set(), docs = [];
  const put = async (key, cv) => { keep.add(key); if (stored.has(key)) return; const b = await pngOf(cv); if (b) { await App.store.set(key, b); stored.add(key); } };
  for (const D of I.docs.slice()) {
    const layers = [];
    for (const L of D.layers.slice()) {
      const m = layerMeta(L);
      m.key = `image:L:${L.id}:${m.ver}`;
      m.mkey = L.mask ? `image:M:${L.id}:${m.mver}` : null;
      await Promise.all([put(m.key, L.canvas), L.mask ? put(m.mkey, L.mask) : null]);   // both encodes start synchronously → consistent with ver
      layers.push(m);
    }
    docs.push({ id: D.id, name: D.name, w: D.w, h: D.h, active: D.active, layerN: D._st ? D._st.layerN : 0, layers });
  }
  await App.store.set('image:docs', { active: Math.max(0, I.docs.indexOf(I.doc)), docs });
  await App.store.prune('image:L:', keep);
  await App.store.prune('image:M:', keep);
  stored = new Set([...stored].filter(k => keep.has(k)));
};
I.saveSoon = App.makeSaver('image', I.save, 2500);
const drawBlob = async (ctx, blob) => {
  if (!blob) return false;
  try { const bmp = await createImageBitmap(blob); ctx.drawImage(bmp, 0, 0); bmp.close && bmp.close(); return true; } catch { return false; }
};
async function buildDoc(dd, getBlob, keepVer) {
  const D = mkDoc(dd.w, dd.h, dd.name || 'Image');
  if (keepVer && dd.id) D.id = dd.id;
  for (const lm of dd.layers || []) {
    const L = mkLayer(lm.name || 'Layer', dd.w, dd.h);
    Object.assign(L, { visible: lm.visible !== false, opacity: lm.opacity ?? 1, blend: lm.blend || 'source-over', locked: !!lm.locked, maskOn: lm.maskOn !== false, text: lm.text || null, textBounds: lm.tb || null });
    if (keepVer) { L.id = lm.id || L.id; L.ver = lm.ver; L.mver = lm.mver || 0; verSeq = Math.max(verSeq, L.ver, L.mver); }
    await drawBlob(L.ctx, await getBlob(lm.key));
    if (lm.mkey != null) {
      L.mask = App.canvas(dd.w, dd.h);
      if (!(await drawBlob(L.mask.getContext('2d'), await getBlob(lm.mkey)))) L.mask = whiteMask(dd.w, dd.h);
      if (!keepVer) bumpM(L);
    }
    D.layers.push(L);
  }
  if (!D.layers.length) return null;
  D.active = clamp(dd.active || 0, 0, D.layers.length - 1);
  D._st = { ...docState(), layerN: dd.layerN || D.layers.length };
  return D;
}
I.restoreSession = async () => {
  let data = null;
  try { data = await App.store.get('image:docs'); } catch {}
  if (!data || !data.docs || !data.docs.length) return 0;
  I.saveSoon.paused = true;
  const docs = [];
  try {
    for (const dd of data.docs) {
      const D = await buildDoc(dd, k => App.store.get(k), true);
      if (!D) continue;
      D._openLabel = 'Restored'; D._openIcon = 'history';
      for (const L of D.layers) { stored.add(`image:L:${L.id}:${L.ver}`); if (L.mask) stored.add(`image:M:${L.id}:${L.mver}`); }
      docs.push(D);
    }
  } catch (e) { console.warn('Image restore failed', e); }
  I.saveSoon.paused = false;
  if (!docs.length) return 0;
  if (I.pristine()) { I.settle(true); I.docs = docs; I.doc = null; I.switchDoc(docs[clamp(data.active || 0, 0, docs.length - 1)]); }
  else { I.docs.push(...docs); I.docTabsUI(); I.saveSoon(); }   // something was opened meanwhile — keep it in front
  return docs.length;
};
I.saveProjectFile = async () => {
  I.settle(); I.flushDev();
  const D = I.doc, blobs = [], layers = [];
  I.busy(true, 'Packing project…');
  try {
    for (const L of D.layers) {
      const m = layerMeta(L);
      blobs.push(await pngOf(L.canvas)); m.key = blobs.length - 1;
      if (L.mask) { blobs.push(await pngOf(L.mask)); m.mkey = blobs.length - 1; } else m.mkey = null;
      layers.push(m);
    }
    App.saveProjectFile('image', D.name, { name: D.name, w: D.w, h: D.h, active: D.active, layerN: I.layerN, layers }, blobs);
  } finally { I.busy(false); }
};
I.loadProject = async (data, blobs, fname) => {
  const D = await buildDoc(data, i => blobs[i], false);
  if (!D) throw new Error('This image project is empty');
  D.name = data.name || fname || 'Image';
  D._openLabel = 'Open project'; D._openIcon = 'folder';
  I.addDoc(D);
};

/* =====================================================================
   Module
   ===================================================================== */
App.on('image:open', async (blob, name) => {
  App.setMode('image');
  await I.openImage(blob, name || 'Image');
  App.toast(`Opened “${(name || 'Image').replace(/\.[^.]+$/, '')}” in its own tab`, 'ok');
});
App.modules = App.modules || {};
App.modules.image = {
  menus: () => menus(),
  toggleSide: () => toggleSide(),
  init() {
    const root = document.getElementById('mod-image');
    el.root = root;
    try { if (localStorage.getItem('strata.i.noside') === '1') root.classList.add('no-side'); } catch {}
    const top = h('div', { class: 'panel mhead i-top' });
    const opts = h('div', { class: 'panel i-opts' });
    const tools = h('div', { class: 'panel i-tools' });
    const wrap = h('div', { class: 'panel i-stagewrap' });
    const side = h('div', { class: 'panel i-side' });
    const bottom = h('div', { class: 'panel i-bottom' });
    root.append(top, opts, tools, wrap, side, bottom);
    el.opts = opts;
    el.docTabs = h('div', { class: 'doc-tabs' });
    App.xfer.zone(el.docTabs, {
      accepts: p => !!p.image && !(p.from === 'image' && !p.layerId),
      label: p => `Drop to open “${p.name}” as a new image`,
      drop: async p => App.xfer.receivers.image.receive(p),
    });
    App.fileDrop(el.docTabs, async files => {
      const proj = files.find(x => /\.strata$/i.test(x.name));
      if (proj) return App.openProjectFile(proj);
      for (const f of files.filter(x => x.type.startsWith('image/'))) await I.openImage(f, f.name);
    });
    I.vp = h('div', { class: 'i-viewport' });
    I.stage = h('div', { class: 'i-stage' });
    I.disp = h('canvas', { class: 'disp' });
    I.dctx = I.disp.getContext('2d');
    I.ovCv = h('canvas', { class: 'i-overlay' });
    el.busy = h('div', { style: { position: 'absolute', inset: 0, display: 'none', placeItems: 'center', background: 'rgba(8,9,12,.45)', zIndex: 20 } },
      h('div', { class: 'toast' }, h('span', { class: 'toast-ico' }, h('i', { class: 'live-dot' })), el.busyMsg = h('span', null, 'Working…')));
    I.stage.append(I.disp);
    I.vp.append(I.stage, I.ovCv, el.busy);
    wrap.append(el.docTabs, I.vp);
    buildTop(top); buildTools(tools); buildSide(side); buildBottom(bottom);
    setupViewport();
    I.updateSwatches();
    I.saveSoon.paused = true;
    I.newDoc(...newDocSpec(), 'Untitled');
    I.saveSoon.paused = false;
    I.setTool('brush');
    I.showPanel('layers');
    I.restoreSession().then(n => { if (n) App.toast(`Restored ${n} image${n > 1 ? 's' : ''} from your last session`, 'ok', 3200, { label: 'New image', fn: I.newDialog }); });
  },
  show() { if (I.doc) requestAnimationFrame(() => { if (!I.doc._fitOk) I.fit(); I.overlay(); }); },
  hide() { I.settle(); },
  loadProject: (data, blobs, fname) => I.loadProject(data, blobs, fname),
  flushSave() { return I.saveSoon.now(); },
  onKey(e) {
    const k = App.combo(e);
    if (k === 'space') { e.preventDefault(); if (!spaceDown) { spaceDown = true; I.setCursor('grab'); } return true; }
    const toolKeys = { v: 'move', m: 'selRect', 'shift+m': 'selEllipse', l: 'lasso', w: 'wand', c: 'crop', b: 'brush', p: 'pencil', e: 'eraser', g: 'fill', 'shift+g': 'gradient', u: 'shape', t: 'text', s: 'clone', j: 'heal', r: 'retouch', i: 'dropper', h: 'hand', z: 'zoom', 'ctrl+t': 'transform' };
    if (toolKeys[k]) { e.preventDefault(); I.setTool(toolKeys[k]); return true; }
    const sizeTool = I.opts[I.tool];
    const nudge = (dx, dy) => {
      if (I.tool === 'transform' && T.transform.S) { T.transform.S.tx += dx; T.transform.S.ty += dy; I.updateStroke(); I.overlay(); return; }
      if (I.tool === 'move') { I.flushDev(); T.move.nudge(dx, dy); }
    };
    const resize = up => { if (sizeTool && sizeTool.size) { sizeTool.size = up ? Math.min(400, Math.round(sizeTool.size * 1.2) + 1) : Math.max(1, Math.round(sizeTool.size / 1.2)); optionsUI(); I.overlay(); } };
    const map = {
      'ctrl+z': I.undo, 'ctrl+shift+z': I.redo, 'ctrl+y': I.redo,
      'ctrl+a': I.selectAll, 'ctrl+d': I.deselect, 'ctrl+shift+d': I.reselect, 'ctrl+shift+i': I.invertSel, 'shift+f6': () => I.selectDialog('feather'), 'ctrl+alt+d': () => I.selectDialog('feather'),
      'escape': () => {
        if (I.tool === 'transform' && T.transform.S) { T.transform.cancel(); I.setTool('move'); }
        else if (I.tool === 'crop') T.crop.activate();
        else if (!F.isDefault(I.dev)) I.devReset();
        else if (I.maskView) I.toggleMaskView();
        else I.deselect();
      },
      'enter': () => {
        if (I.tool === 'transform' && T.transform.S) { T.transform.apply(); I.setTool('move'); }
        else if (I.tool === 'crop') T.crop.apply();
        else if (!F.isDefault(I.dev)) I.devApply();
      },
      'delete': () => I.clearSel(), 'backspace': () => I.clearSel(), 'shift+f5': I.contentAwareFill, 'alt+backspace': () => I.fillSel(), 'ctrl+backspace': () => I.fillSel(I.secondary),
      'ctrl+c': () => I.copy(), 'ctrl+shift+c': () => I.copy(true), 'ctrl+x': () => I.copy(false, true),
      'ctrl+j': () => layerViaCopy(false), 'ctrl+shift+j': () => layerViaCopy(true), 'ctrl+shift+n': newLayerCmd, 'ctrl+e': mergeDown, 'ctrl+shift+e': mergeVisible,
      'ctrl+]': () => moveLayer(1), 'ctrl+[': () => moveLayer(-1),
      'ctrl+n': I.newDialog, 'alt+n': I.newDialog, 'ctrl+o': openImageCmd,
      'ctrl+s': I.saveProjectFile, 'ctrl+shift+s': I.exportDialog,
      'ctrl+0': I.fit, 'ctrl+1': () => I.setZoom(1), 'ctrl+=': () => I.setZoom(I.zoom * 1.25), 'ctrl+shift+=': () => I.setZoom(I.zoom * 1.25), 'ctrl+-': () => I.setZoom(I.zoom / 1.25),
      'ctrl+l': levelsDialog, 'ctrl+m': curvesDialog, 'ctrl+u': ADJ.hueSat, 'ctrl+b': ADJ.balance, 'ctrl+i': () => I.applyNow('Invert', F.invert),
      'ctrl+alt+i': resizeDialog, 'ctrl+alt+c': canvasSizeDialog,
      "ctrl+'": () => { VIEW.grid = !VIEW.grid; saveView(); App.toast('Grid ' + (VIEW.grid ? 'on' : 'off')); },
      'ctrl+r': () => { VIEW.rulers = !VIEW.rulers; saveView(); },
      '\\': () => { if (!I.maskEdit) return App.toast('Select a layer mask first (click its mask thumbnail)'); I.ruby = !I.ruby; I.overlay(); },
      'x': () => { [I.primary, I.secondary] = [I.secondary, I.primary]; I.updateSwatches(); },
      'd': () => { I.primary = '#000000'; I.secondary = '#ffffff'; I.updateSwatches(); },
      '[': () => resize(false), ']': () => resize(true),
      'arrowleft': () => nudge(-1, 0), 'arrowright': () => nudge(1, 0), 'arrowup': () => nudge(0, -1), 'arrowdown': () => nudge(0, 1),
      'shift+arrowleft': () => nudge(-10, 0), 'shift+arrowright': () => nudge(10, 0), 'shift+arrowup': () => nudge(0, -10), 'shift+arrowdown': () => nudge(0, 10),
    };
    const fn = map[k] || (I.filterKeys && I.filterKeys()[k]);
    if (fn) { e.preventDefault(); fn(); return true; }
    return false;
  },
  onKeyUp(e) { if (e.key === ' ') { spaceDown = false; I.setCursor(T[I.tool].cursor || 'default'); } },
  shortcuts: [
    ['Tools', [['V', 'Move (click text to pick it)'], ['Ctrl + T', 'Free transform'], ['M / Shift+M', 'Rectangle / ellipse select'], ['L', 'Lasso'], ['W', 'Magic wand'], ['C', 'Crop'], ['B', 'Brush'], ['P', 'Pencil'], ['E', 'Eraser'], ['G / Shift+G', 'Fill / gradient'], ['U', 'Shapes'], ['T', 'Text (click text to edit)'], ['J', 'Healing brush'], ['S', 'Clone stamp'], ['R', 'Retouch brush'], ['I', 'Eyedropper'], ['H / Space', 'Hand (pan)'], ['Z', 'Zoom']]],
    ['Painting & masks', [['[ / ]', 'Smaller / bigger brush'], ['X', 'Swap colors'], ['D', 'Default colors'], ['Right button', 'Paint with secondary color'], ['Alt + click', 'Pick color (paint tools)'], ['Shift + click', 'Straight line'], ['Alt + click (clone)', 'Set clone source'], ['\\', 'Red overlay while editing a mask'], ['Alt + click mask', 'View the mask itself']]],
    ['Selection & layers', [['Ctrl + A / D', 'Select all / deselect'], ['Ctrl + Shift + D', 'Reselect'], ['Ctrl + Shift + I', 'Invert selection'], ['Shift + F6', 'Feather selection'], ['Del', 'Delete selected pixels'], ['Shift + F5', 'Content-aware fill'], ['Alt / Ctrl + Backspace', 'Fill with primary / secondary'], ['Ctrl + C / X / V', 'Copy / cut / paste'], ['Ctrl + J', 'Layer via copy'], ['Ctrl + Shift + N', 'New layer'], ['Ctrl + E', 'Merge down'], ['Ctrl + [ / ]', 'Move layer down / up'], ['Ctrl + click thumb', 'Select layer contents'], ['Arrows', 'Nudge (Move / Transform)']]],
    ['Image & view', [['Ctrl + Z / Y', 'Undo / redo'], ['Ctrl + L / M / U', 'Levels / Curves / Hue-Sat'], ['Ctrl + I', 'Invert colors'], ['Enter', 'Apply crop / transform / adjustments'], ['Ctrl + 0 / 1', 'Fit / 100%'], ['Ctrl + wheel', 'Zoom at cursor'], ["Ctrl + ' / Ctrl + R", 'Grid / rulers'], ['Ctrl + S', 'Save project'], ['Ctrl + Shift + S', 'Export image'], ['Ctrl + O', 'Open image (new tab)']]],
  ],
};
})();
