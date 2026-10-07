/* Image editor — Camera Raw Filter (Filter ▸ Camera Raw Filter…, Shift+Ctrl+A).
   A full develop workspace modelled on Adobe Camera Raw: Edit panels (Light, Color, Effects, Curve,
   Color/B&W Mixer, Color Grading, Detail, Optics, Geometry, Lens Blur, Calibration), Crop & Rotate,
   Remove (heal / clone), Masking (subject, sky, background, brush, linear, radial, luminance range),
   Red Eye, Presets, Snapshots, before/after views, histogram with clipping warnings, color samplers.
   Pixels are rendered by camraw-core.js in a Web Worker: a fast low-res pass while you drag, then a sharp
   preview, and a tiled full-resolution render when you press OK. */
(() => {
'use strict';
const App = window.App, F = App.IF, X = F.X, I = App.I, CR = window.CR;
const { h, icon, btn } = App;
const clamp = X.clamp, PI = Math.PI;
const deep = o => JSON.parse(JSON.stringify(o));
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, path, v) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

/* ---------- worker bridge (falls back to the main thread when workers are unavailable) ---------- */
let worker, jobSeq = 0;
const pending = new Map();
const mainCaches = {}, mainSrcs = {};
function bridge() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker('js/image/camraw-worker.js');
    worker.onmessage = e => { const p = pending.get(e.data.job); if (!p) return; if (e.data.progress != null) return p.progress && p.progress(e.data.progress); pending.delete(e.data.job); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data); };
    worker.onerror = () => { worker = null; for (const p of pending.values()) p.rej(new Error('Render worker failed')); pending.clear(); };
  } catch { worker = null; }
  return worker;
}
const engine = {
  setSrc(id, img) {
    const buf = new Uint8ClampedArray(img.data);
    if (bridge()) worker.postMessage({ type: 'src', id, w: img.width, h: img.height, buf: buf.buffer }, [buf.buffer]);
    else { mainSrcs[id] = { buf, w: img.width, h: img.height }; mainCaches[id] = {}; }
  },
  call(type, id, S, aux, progress) {
    if (bridge()) return new Promise((res, rej) => { const job = ++jobSeq; pending.set(job, { res, rej, progress }); worker.postMessage({ type, id, job, S, aux }); });
    const s = mainSrcs[id], t0 = performance.now();
    return new Promise((res, rej) => setTimeout(() => {
      try {
        if (type === 'render') { const r = CR.process(s.buf, s.w, s.h, S, aux, mainCaches[id]); res({ w: s.w, h: s.h, buf: r.out.buffer, hist: r.hist, clipLo: r.clipLo, clipHi: r.clipHi, ms: performance.now() - t0 }); }
        else res({ w: s.w, h: s.h, buf: CR.renderTiled(s.buf, s.w, s.h, S, aux, mainCaches[id], progress).buffer });
      } catch (e) { rej(e); }
    }, 0));
  },
};

/* ---------- presets ---------- */
const P = (name, group, s, tip) => ({ name, group, s, tip });
const PRESETS = [
  P('Auto', 'Basic', null, 'Let Strata balance exposure, contrast and color automatically.'),
  P('Soft glow', 'Portrait', { clarity: -15, texture: -12, exposure: 0.1, highlights: -20, vibrance: 10, glow: 12 }, 'Flattering, smooth skin with a gentle glow.'),
  P('Warm skin', 'Portrait', { temp: 12, tint: 3, vibrance: 8, cg: { mid: { h: 30, s: 8, l: 0 } } }, 'Warm, healthy skin tones.'),
  P('Vivid', 'Landscape', { profile: 'landscape', dehaze: 15, clarity: 20, vibrance: 25, highlights: -30, shadows: 25 }, 'Rich skies and foliage with lots of detail.'),
  P('Golden hour', 'Landscape', { temp: 25, tint: 5, vibrance: 15, cg: { hi: { h: 45, s: 25, l: 0 }, sh: { h: 210, s: 10, l: 0 } } }, 'Warm late-afternoon light.'),
  P('Teal & orange', 'Style', { profile: 'modern', contrast: 10, vigAmount: -20, cg: { sh: { h: 195, s: 30, l: 0 }, hi: { h: 35, s: 25, l: 0 } } }, 'Blockbuster color grade.'),
  P('Faded film', 'Style', { profile: 'vintage', grain: 25, vigAmount: -15 }, 'Lifted blacks, warm cast and grain.'),
  P('Matte', 'Style', { profile: 'matte', clarity: 5 }, 'Soft, editorial matte finish.'),
  P('Cool future', 'Style', { temp: -20, tint: 8, clarity: 15, cg: { sh: { h: 250, s: 25, l: 0 }, hi: { h: 180, s: 15, l: 0 } } }, 'Cold, cyan-tinted sci-fi look.'),
  P('High contrast', 'Black & White', { profile: 'bwhigh', clarity: 20 }, 'Deep blacks, bright whites.'),
  P('Soft', 'Black & White', { profile: 'bwsoft' }, 'Gentle, low-contrast black & white.'),
  P('Selenium', 'Black & White', { profile: 'monochrome', cg: { sh: { h: 260, s: 20, l: 0 }, hi: { h: 40, s: 10, l: 0 } } }, 'Classic split-toned print.'),
  P('Fresh food', 'Subject', { temp: 5, vibrance: 20, texture: 15, clarity: 10, shadows: 15 }, 'Appetising color and texture.'),
  P('Gritty urban', 'Subject', { clarity: 40, texture: 25, saturation: -25, contrast: 20, vigAmount: -25 }, 'Hard-edged street look.'),
  P('Clean night', 'Subject', { nr: 40, cnr: 50, shadows: 20, highlights: -25, temp: -8 }, 'Less noise, open shadows for night shots.'),
  P('Bright travel', 'Subject', { exposure: 0.25, shadows: 30, vibrance: 20, dehaze: 8 }, 'Airy and colorful.'),
];
const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = deep(b[k]); } return a; };

/* ---------- gradient tracks for sliders (Adobe-style) ---------- */
const TRACK = {
  tone: 'linear-gradient(90deg,#1b1b1b,#e8e8e8)', temp: 'linear-gradient(90deg,#3b6fd6,#c9c9c9,#e5c437)', tint: 'linear-gradient(90deg,#3fae4a,#c9c9c9,#d04ccf)',
  sat: 'linear-gradient(90deg,#9a9a9a,#ff4d6a,#ffb02e,#4cd964,#2fb7ff,#a35bff)',
  hue: c => `linear-gradient(90deg, hsl(${c - 30},85%,55%), hsl(${c},85%,55%), hsl(${c + 30},85%,55%))`,
  satOf: c => `linear-gradient(90deg, hsl(${c},0%,55%), hsl(${c},90%,55%))`,
  lumOf: c => `linear-gradient(90deg, hsl(${c},70%,12%), hsl(${c},80%,50%), hsl(${c},70%,92%))`,
};
const HUE_DEG = { red: 0, orange: 30, yellow: 58, green: 120, aqua: 180, blue: 225, purple: 275, magenta: 315 };
const HUE_NAMES = { red: 'Reds', orange: 'Oranges', yellow: 'Yellows', green: 'Greens', aqua: 'Aquas', blue: 'Blues', purple: 'Purples', magenta: 'Magentas' };

I.cameraRaw = () => {
  const Lr = I.active();
  if (!Lr) return;
  if (Lr.locked) return App.toast('Layer is locked', 'warn');
  I.settle(); I.flushDev();
  const tgt = I.target(), full = tgt.src, FW = full.width, FH = full.height;
  let S = CR.defaults();
  const DEF = CR.defaults();
  const quality = store.get('strata.cr.quality', 'balanced');
  const PROXY = { fast: 1400, balanced: 2200, high: 3200 }[quality] || 2200;

  /* ---------- sources (original, retouched) at quick / proxy sizes ---------- */
  const mk = (cv, max) => { const k = Math.min(1, max / Math.max(cv.width, cv.height)); const c = k < 1 ? X.scaled(cv, k) : F.clone(cv); return { cv: c, img: X.read(c), w: c.width, h: c.height }; };
  const orig = { q: mk(full, 640), p: mk(full, PROXY) };
  let src = { q: orig.q, p: orig.p }, retouchedFull = full;
  const pushSources = () => { engine.setSrc('q', src.q.img); engine.setSrc('p', src.p.img); };
  pushSources();

  /* ---------- retouch (Remove + Red Eye) — applied to the source before every other adjustment ---------- */
  let retouch = { spots: [], eyes: [], eyePupil: 50, eyeDarken: 50, eyeType: 'red' };
  function applyRetouch(cv) {
    const W = cv.width, H = cv.height, ctx = cv.getContext('2d', { willReadFrequently: true });
    for (const sp of retouch.spots) {
      const r = Math.max(1, sp.r * W), m = App.canvas(W, H), mc = m.getContext('2d');
      mc.strokeStyle = mc.fillStyle = '#fff'; mc.lineCap = mc.lineJoin = 'round'; mc.lineWidth = r * 2;
      if (sp.feather) mc.filter = `blur(${r * sp.feather / 100 * 0.5}px)`;
      mc.beginPath(); sp.pts.forEach(([x, y], i) => (i ? mc.lineTo(x * W, y * H) : mc.moveTo(x * W, y * H))); if (sp.pts.length === 1) { mc.arc(sp.pts[0][0] * W, sp.pts[0][1] * H, r, 0, 7); mc.fill(); } else mc.stroke();
      mc.filter = 'none';
      if (sp.opacity < 100) { mc.globalCompositeOperation = 'destination-in'; mc.fillStyle = `rgba(255,255,255,${sp.opacity / 100})`; mc.fillRect(0, 0, W, H); }
      if (sp.mode === 'clone') {
        const t = App.canvas(W, H), tc2 = t.getContext('2d'); tc2.drawImage(cv, sp.src[0] * W, sp.src[1] * H); tc2.globalCompositeOperation = 'destination-in'; tc2.drawImage(m, 0, 0);
        ctx.drawImage(t, 0, 0);
      } else F.heal(cv, m, r);
    }
    if (retouch.eyes.length) {
      const id = ctx.getImageData(0, 0, W, H), d = id.data, pup = 0.4 + retouch.eyePupil / 100 * 0.8, dk = retouch.eyeDarken / 100;
      for (const e of retouch.eyes) {
        const cx = e.cx * W, cy = e.cy * H, rx = Math.max(1, e.rx * W * pup), ry = Math.max(1, e.ry * H * pup);
        for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(H, Math.ceil(cy + ry)); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(W, Math.ceil(cx + rx)); x++) {
          const t = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (t > 1) continue;
          const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2], edge = clamp((1 - t) * 4, 0, 1);
          if (retouch.eyeType === 'pet') { const L = (r + g + b) / 3; if (L > 120) { const k = edge * clamp((L - 120) / 80, 0, 1) * (0.5 + dk * 0.5); d[i] = r * (1 - k) + 18 * k; d[i + 1] = g * (1 - k) + 18 * k; d[i + 2] = b * (1 - k) + 18 * k; } }
          else { const red = r - Math.max(g, b); if (red > 20) { const k = edge * clamp(red / 60, 0, 1), nv = (g + b) / 2 * (1 - dk * 0.6); d[i] = r * (1 - k) + nv * k; d[i + 1] = g * (1 - k * dk * 0.3); d[i + 2] = b * (1 - k * dk * 0.3); } }
        }
      }
      ctx.putImageData(id, 0, 0);
    }
    return cv;
  }
  let retouchTimer = 0;
  const retouchChanged = () => {
    clearTimeout(retouchTimer);
    retouchTimer = setTimeout(() => {
      const has = retouch.spots.length || retouch.eyes.length;
      retouchedFull = has ? applyRetouch(F.clone(full)) : full;
      src = has ? { q: mk(retouchedFull, 640), p: mk(retouchedFull, PROXY) } : { q: orig.q, p: orig.p };
      pushSources(); delete S._ca; delete S._air; requestRender();
    }, 60);
  };

  /* ---------- rendering scheduler: quick pass while dragging, sharp pass when idle ---------- */
  let version = 0, shown = -1, shownKind = '', busyQ = false, busyP = false, againQ = false, againP = false, pTimer = 0, last = null, lastHist = null, hoverS = null;
  const brushCache = {};
  const aux = kind => {
    const s = kind === 'final' ? { w: FW, h: FH } : src[kind], brush = {};
    for (const M of S.masks) if (M.type === 'brush') {
      const key = M.id + '|' + kind + '|' + M.ver;
      if (!brushCache[key]) { const c = App.canvas(s.w, s.h), x = c.getContext('2d'); x.lineCap = x.lineJoin = 'round'; for (const st of M.strokes) { const r = Math.max(0.5, st.r * s.w); x.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over'; x.strokeStyle = x.fillStyle = `rgba(255,255,255,${st.flow / 100})`; x.filter = st.feather ? `blur(${r * st.feather / 100 * 0.6}px)` : 'none'; x.lineWidth = r * 2; x.beginPath(); st.pts.forEach(([px, py], i) => (i ? x.lineTo(px * s.w, py * s.h) : x.moveTo(px * s.w, py * s.h))); if (st.pts.length === 1) { x.arc(st.pts[0][0] * s.w, st.pts[0][1] * s.h, r, 0, 7); x.fill(); } else x.stroke(); } const d = x.getImageData(0, 0, s.w, s.h).data, p = new Uint8Array(s.w * s.h); for (let j = 0; j < p.length; j++) p[j] = d[j * 4 + 3]; for (const k in brushCache) if (k.startsWith(M.id + '|' + kind + '|')) delete brushCache[k]; brushCache[key] = p; }
      brush[M.id] = brushCache[key];
    }
    return { brush };
  };
  const payload = () => {
    const s = deep(hoverS || S);
    if (s.removeCA && !s._ca) s._ca = S._ca = CR.estimateCA(src.p.img.data, src.p.w, src.p.h);
    if (s.dehaze && !S._air) S._air = CR.estimateAir(src.p.img.data, src.p.w, src.p.h);
    if (s.dehaze) s._air = S._air;
    return s;
  };
  const requestRender = () => { version++; renderQ(); clearTimeout(pTimer); pTimer = setTimeout(renderP, 170); };
  async function renderQ() {
    if (busyQ) { againQ = true; return; }
    busyQ = true; const v = version;
    try { const r = await engine.call('render', 'q', payload(), aux('q')); if (v > shown || (v === shown && shownKind !== 'p')) show(r, 'q', v); } catch (e) { console.error(e); status.textContent = 'Render error: ' + e.message; }
    busyQ = false; if (againQ) { againQ = false; renderQ(); }
  }
  async function renderP() {
    if (busyP) { againP = true; return; }
    busyP = true; const v = version;
    try { const r = await engine.call('render', 'p', payload(), aux('p')); if (v >= shown) show(r, 'p', v); } catch (e) { console.error(e); }
    busyP = false; if (againP || v !== version) { againP = false; clearTimeout(pTimer); pTimer = setTimeout(renderP, 120); }
  }
  const afterCv = App.canvas(1, 1);
  function show(r, kind, v) {
    shown = v; shownKind = kind;
    afterCv.width = r.w; afterCv.height = r.h;
    const img = new ImageData(new Uint8ClampedArray(r.buf), r.w, r.h);
    afterCv.getContext('2d').putImageData(img, 0, 0);
    last = img; lastHist = r;
    clipCache = null;
    drawHist(); drawView(); updateSamplers();
    status.textContent = `${kind === 'p' ? 'Preview' : 'Quick preview'} ${r.w}×${r.h} · ${Math.round(r.ms || 0)} ms`;
  }

  /* =====================================================================
     Layout
     ===================================================================== */
  const view = h('canvas', { class: 'cr-view' }), ov = h('canvas', { class: 'cr-ov' });
  const stage = h('div', { class: 'cr-stage' }, view, ov);
  const status = h('div', { class: 'cr-status' }, 'Loading…');
  const samplerBar = h('div', { class: 'cr-samplers' });
  const zoomSel = App.select({ bare: true, label: 'Zoom', value: 'fit', tip: 'Preview zoom. Fit shows the whole image; 100% shows real pixels (also Ctrl+0 / Ctrl+Alt+0, mouse wheel).', options: [['fit', 'Fit in view'], ['0.25', '25%'], ['0.5', '50%'], ['1', '100%'], ['2', '200%'], ['4', '400%']], onChange: v => { if (v === 'fit') fit(); else zoomTo(+v); } });
  let viewMode = 'single', showBefore = false;
  const VIEWS = [['single', 'Single view'], ['lr', 'Before / after — side by side'], ['tb', 'Before / after — top / bottom'], ['split', 'Before / after — split']];
  const viewBtn = btn({ icon: 'panelLeft', cls: 'sm', title: 'Before / after view', key: 'Y', tip: 'Cycle between single, side-by-side, top/bottom and split before/after views.', onClick: () => { const i = VIEWS.findIndex(v => v[0] === viewMode); viewMode = VIEWS[(i + 1) % VIEWS.length][0]; App.toast(VIEWS.find(v => v[0] === viewMode)[1], '', 1200); drawView(); } });
  const beforeBtn = btn({ icon: 'eye', cls: 'sm', title: 'Show original', key: 'P', tip: 'Toggle between your edit and the original image.', onClick: () => { showBefore = !showBefore; beforeBtn.setOn(showBefore); drawView(); } });
  const bottom = h('div', { class: 'cr-bottom' }, zoomSel, h('div', { class: 'grow' }), status, h('div', { class: 'grow' }), viewBtn, beforeBtn);
  const main = h('div', { class: 'cr-main' }, samplerBar, stage, bottom);
  const histCv = h('canvas', { class: 'cr-hist', title: 'Histogram', tip: 'Brightness distribution of the result (red, green and blue). The corner triangles show and toggle clipping warnings.' });
  const clipLoBtn = h('button', { class: 'cr-clip lo', title: 'Shadow clipping warning', tip: 'Highlights pure-black areas in blue on the preview (shortcut U).' });
  const clipHiBtn = h('button', { class: 'cr-clip hi', title: 'Highlight clipping warning', tip: 'Highlights blown-out white areas in red on the preview (shortcut O).' });
  let clipLo = false, clipHi = false, clipCache = null;
  clipLoBtn.addEventListener('click', () => { clipLo = !clipLo; clipLoBtn.classList.toggle('on', clipLo); drawView(); });
  clipHiBtn.addEventListener('click', () => { clipHi = !clipHi; clipHiBtn.classList.toggle('on', clipHi); drawView(); });
  const rgbRead = h('div', { class: 'cr-rgb' }, 'R: —  G: —  B: —');
  const histBox = h('div', { class: 'cr-histbox' }, histCv, clipLoBtn, clipHiBtn, rgbRead);
  const panel = h('div', { class: 'cr-panel' });
  const side = h('div', { class: 'cr-side' }, histBox, panel);
  let tool = 'edit', md = null;
  const TOOLS = [
    ['edit', 'sliders2', 'Edit', 'E', 'All the global adjustments: light, color, curves, grading, detail, optics and more.'],
    ['crop', 'crop', 'Crop & rotate', 'C', 'Straighten and crop. The crop is applied to the whole image when you press OK.'],
    ['remove', 'bandage', 'Remove', 'B', 'Paint over blemishes, dust or small objects to heal them away (or clone from elsewhere).'],
    ['mask', 'mask', 'Masking', 'M', 'Local adjustments: subject, sky, background, brush, gradients and range masks.'],
    ['redeye', 'eye', 'Red eye', 'Shift+E', 'Drag around an eye to remove red-eye (or pet-eye glow).'],
    ['presets', 'sparkle', 'Presets', 'Shift+P', 'One-click looks — hover to preview, click to apply. Save your own too.'],
    ['snapshots', 'history', 'Snapshots', 'Shift+S', 'Save versions of your settings and jump back to them.'],
  ];
  const toolBtns = {};
  const strip = h('div', { class: 'cr-strip' },
    TOOLS.map(([id, ic, label, key, tip]) => (toolBtns[id] = btn({ icon: ic, cls: 'cr-tb', title: label, key, tip, tipPos: 'left', onClick: () => setTool(id) }))),
    btn({ label: '⋯', cls: 'cr-tb more', title: 'More', tip: 'Reset, previous settings, copy and paste settings.', tipPos: 'left', onClick: (e, b) => { const r = b.getBoundingClientRect(); App.openMenu(r.left - 6, r.top, moreMenu(), 0, true); } }),
    h('div', { class: 'grow' }),
    (toolBtns.zoom = btn({ icon: 'zoom', cls: 'cr-tb', title: 'Zoom', key: 'Z', tip: 'Click to zoom in, Alt+click to zoom out.', tipPos: 'left', onClick: () => setPointer('zoom') })),
    (toolBtns.hand = btn({ icon: 'hand', cls: 'cr-tb', title: 'Hand', key: 'H', tip: 'Drag to move around (or hold Space).', tipPos: 'left', onClick: () => setPointer('hand') })),
    (toolBtns.sampler = btn({ icon: 'dropper', cls: 'cr-tb', title: 'Color sampler', key: 'S', tip: 'Click to place up to 9 color samplers that show live RGB values.', tipPos: 'left', onClick: () => setPointer('sampler') })),
    (toolBtns.grid = btn({ icon: 'grid', cls: 'cr-tb', title: 'Grid overlay', key: 'Ctrl+Shift+G', tip: 'Show a grid over the preview to help align things.', tipPos: 'left', onClick: () => { showGrid = !showGrid; toolBtns.grid.setOn(showGrid); drawView(); } })));
  const body = h('div', { class: 'cr' }, main, side, strip);
  let showGrid = false, pointerMode = null;   // pointerMode overrides the tool's own pointer (zoom / hand / sampler / wb / fringe / focus)
  const setPointer = m => { pointerMode = pointerMode === m ? null : m; ['zoom', 'hand', 'sampler'].forEach(k => toolBtns[k].setOn(pointerMode === k)); stage.dataset.pointer = pointerMode || tool; };
  function setTool(id) { tool = id; pointerMode = null; ['zoom', 'hand', 'sampler'].forEach(k => toolBtns[k].setOn(false)); TOOLS.forEach(([k]) => toolBtns[k].setOn(k === id)); stage.dataset.pointer = id; buildPanel(); if (id === 'crop' || pv.cropShown !== (id !== 'crop')) fit(); drawView(); }
  const pv = { cropShown: true };

  /* =====================================================================
     Undo inside Camera Raw
     ===================================================================== */
  const undo = [], redo = [];
  let committed = JSON.stringify({ S, retouch });
  const commit = () => { const now = JSON.stringify({ S, retouch }); if (now === committed) return; undo.push(committed); if (undo.length > 60) undo.shift(); redo.length = 0; committed = now; };
  const restoreState = json => { const o = JSON.parse(json); S = o.S; const rtChanged = JSON.stringify(o.retouch) !== JSON.stringify(retouch); retouch = o.retouch; committed = json; buildPanel(); if (rtChanged) retouchChanged(); else requestRender(); };
  const doUndo = () => { if (!undo.length) return App.toast('Nothing to undo'); redo.push(JSON.stringify({ S, retouch })); restoreState(undo.pop()); };
  const doRedo = () => { if (!redo.length) return; undo.push(JSON.stringify({ S, retouch })); restoreState(redo.pop()); };

  /* =====================================================================
     View: zoom, pan, before/after, overlays
     ===================================================================== */
  const V = { z: 1, x: 0, y: 0 };
  const cropActive = () => tool !== 'crop' && (S.crop.w < 0.999 || S.crop.h < 0.999 || S.crop.x > 0.001 || S.crop.y > 0.001);
  const frame = () => (cropActive() ? { x: S.crop.x * FW, y: S.crop.y * FH, w: S.crop.w * FW, h: S.crop.h * FH } : { x: 0, y: 0, w: FW, h: FH });
  const dpr = () => window.devicePixelRatio || 1;
  function fit() {
    const r = stage.getBoundingClientRect(), f = frame(), split = viewMode === 'lr' ? 2 : 1, splitV = viewMode === 'tb' ? 2 : 1;
    V.z = Math.min((r.width / split - 30) / f.w, (r.height / splitV - 30) / f.h); V.x = (r.width - f.w * V.z * split) / 2 / split; V.y = (r.height - f.h * V.z * splitV) / 2 / splitV;
    zoomSel.value = 'fit'; pv.cropShown = tool !== 'crop'; drawView();
  }
  function zoomTo(z, cx, cy) {
    const r = stage.getBoundingClientRect(); cx = cx ?? r.width / 2; cy = cy ?? r.height / 2;
    const nz = clamp(z, 0.02, 16); V.x = cx - (cx - V.x) * nz / V.z; V.y = cy - (cy - V.y) * nz / V.z; V.z = nz;
    const opt = [...zoomSel.options].find(o => +o.value === nz); zoomSel.value = opt ? opt.value : 'fit'; if (!opt) zoomSel.options[0].text = `Fit · ${Math.round(nz * 100)}%`;
    drawView();
  }
  /** client → normalized image coords (0..1 of the full frame) */
  const toImg = (cx, cy) => { const r = stage.getBoundingClientRect(), f = frame(); let x = cx - r.left, y = cy - r.top; if (viewMode === 'lr' && x > r.width / 2) x -= r.width / 2; if (viewMode === 'tb' && y > r.height / 2) y -= r.height / 2; return { x: (f.x + (x - V.x) / V.z) / FW, y: (f.y + (y - V.y) / V.z) / FH }; };
  const toScr = (nx, ny) => { const f = frame(); return { x: V.x + (nx * FW - f.x) * V.z, y: V.y + (ny * FH - f.y) * V.z }; };
  function drawView() {
    const r = stage.getBoundingClientRect(), k = dpr();
    for (const c of [view, ov]) { const W = Math.max(1, Math.round(r.width * k)), H = Math.max(1, Math.round(r.height * k)); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } }
    const ctx = view.getContext('2d'); ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
    ctx.imageSmoothingQuality = 'high';
    const f = frame();
    const drawImg = (cv, dx, dy, clipRect) => {
      if (!cv || !cv.width) return;
      const sx = cv.width / FW, sy = cv.height / FH;
      ctx.save();
      if (clipRect) { ctx.beginPath(); ctx.rect(...clipRect); ctx.clip(); }
      ctx.drawImage(cv, f.x * sx, f.y * sy, f.w * sx, f.h * sy, dx + V.x, dy + V.y, f.w * V.z, f.h * V.z);
      ctx.restore();
    };
    const before = orig.p.cv, after = afterCv.width > 1 ? afterCv : null;
    if (viewMode === 'single') drawImg(showBefore ? before : after || before, 0, 0);
    else if (viewMode === 'lr') { drawImg(before, 0, 0, [0, 0, r.width / 2, r.height]); drawImg(after || before, r.width / 2, 0, [r.width / 2, 0, r.width / 2, r.height]); }
    else if (viewMode === 'tb') { drawImg(before, 0, 0, [0, 0, r.width, r.height / 2]); drawImg(after || before, 0, r.height / 2, [0, r.height / 2, r.width, r.height / 2]); }
    else { drawImg(before, 0, 0, [0, 0, r.width / 2, r.height]); drawImg(after || before, 0, 0, [r.width / 2, 0, r.width / 2, r.height]); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(r.width / 2 - 0.5, 0, 1, r.height); }
    if (viewMode !== 'single') { ctx.font = '700 11px Manrope'; ctx.fillStyle = 'rgba(0,0,0,.55)'; const lab = (t, x, y) => { const w = ctx.measureText(t).width + 14; ctx.fillRect(x, y, w, 20); ctx.fillStyle = '#fff'; ctx.fillText(t, x + 7, y + 14); ctx.fillStyle = 'rgba(0,0,0,.55)'; }; lab('Before', 10, 10); lab('After', viewMode === 'tb' ? 10 : r.width / 2 + 10, viewMode === 'tb' ? r.height / 2 + 10 : 10); }
    // clipping warnings
    if ((clipLo || clipHi) && last && !showBefore) {
      if (!clipCache) { const c = App.canvas(last.width, last.height), d = last.data, id = c.getContext('2d').createImageData(last.width, last.height), o = id.data; for (let i = 0; i < d.length; i += 4) { if (clipHi && (d[i] >= 254 || d[i + 1] >= 254 || d[i + 2] >= 254)) { o[i] = 255; o[i + 1] = 30; o[i + 2] = 40; o[i + 3] = 255; } else if (clipLo && d[i] <= 1 && d[i + 1] <= 1 && d[i + 2] <= 1) { o[i] = 40; o[i + 1] = 90; o[i + 2] = 255; o[i + 3] = 255; } } c.getContext('2d').putImageData(id, 0, 0); clipCache = c; }
      drawImg(clipCache, viewMode === 'lr' ? r.width / 2 : 0, viewMode === 'tb' ? r.height / 2 : 0);
    }
    drawOverlay();
  }

  /* ---------- overlay: tool handles, samplers, grid, cursor ---------- */
  let cursorPos = null, selSpot = -1, selMask = null, maskOverlay = true, maskOvCache = null;
  function drawOverlay() {
    const r = stage.getBoundingClientRect(), k = dpr(), c = ov.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, r.width, r.height);
    const f = frame(), ix = V.x, iy = V.y, iw = f.w * V.z, ihh = f.h * V.z;
    if (showGrid) { c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < 8; i++) { c.moveTo(ix + iw * i / 8, iy); c.lineTo(ix + iw * i / 8, iy + ihh); c.moveTo(ix, iy + ihh * i / 8); c.lineTo(ix + iw, iy + ihh * i / 8); } c.stroke(); }
    const handle = (x, y, on) => { c.beginPath(); c.arc(x, y, on ? 6 : 5, 0, 7); c.fillStyle = on ? '#fff' : 'rgba(255,255,255,.85)'; c.fill(); c.lineWidth = 2; c.strokeStyle = on ? App.cssVar('--accent') : 'rgba(0,0,0,.6)'; c.stroke(); };
    if (tool === 'crop') {
      const a = toScr(S.crop.x, S.crop.y), b = toScr(S.crop.x + S.crop.w, S.crop.y + S.crop.h);
      c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.rect(0, 0, r.width, r.height); c.rect(a.x, a.y, b.x - a.x, b.y - a.y); c.fill('evenodd');
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5; c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < 3; i++) { const x = a.x + (b.x - a.x) * i / 3, y = a.y + (b.y - a.y) * i / 3; c.moveTo(x, a.y); c.lineTo(x, b.y); c.moveTo(a.x, y); c.lineTo(b.x, y); } c.stroke();
      [[a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y], [(a.x + b.x) / 2, a.y], [(a.x + b.x) / 2, b.y], [a.x, (a.y + b.y) / 2], [b.x, (a.y + b.y) / 2]].forEach(([x, y]) => { c.fillStyle = '#fff'; c.fillRect(x - 4, y - 4, 8, 8); c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeRect(x - 4, y - 4, 8, 8); });
    }
    if (tool === 'remove') retouch.spots.forEach((sp, i) => {
      const W = FW; c.lineWidth = i === selSpot ? 2 : 1.2; c.strokeStyle = i === selSpot ? '#fff' : 'rgba(255,255,255,.7)'; c.setLineDash(sp.mode === 'clone' ? [] : [4, 3]);
      const rr = sp.r * W * V.z;
      if (sp.pts.length === 1) { const p = toScr(...sp.pts[0]); c.beginPath(); c.arc(p.x, p.y, rr, 0, 7); c.stroke(); }
      else { c.lineCap = c.lineJoin = 'round'; c.beginPath(); sp.pts.forEach(([x, y], j) => { const p = toScr(x, y); j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); c.lineWidth = Math.max(1.5, rr * 2); c.strokeStyle = i === selSpot ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.16)'; c.stroke(); }
      if (sp.mode === 'clone' && i === selSpot) { const p = toScr(sp.pts[0][0] - sp.src[0], sp.pts[0][1] - sp.src[1]); c.setLineDash([]); c.strokeStyle = '#7fd3ff'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, rr, 0, 7); c.stroke(); const q = toScr(...sp.pts[0]); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke(); }
      c.setLineDash([]);
    });
    if (tool === 'redeye') retouch.eyes.forEach(e => { const p = toScr(e.cx, e.cy); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(p.x, p.y, e.rx * FW * V.z, e.ry * FH * V.z, 0, 0, 7); c.stroke(); });
    if (tool === 'mask') {
      if (selMask && maskOverlay) {
        if (!maskOvCache || maskOvCache.key !== JSON.stringify([selMask, src.q.w])) {
          const M = selMask, s = src.q, auxq = aux('q'), wts = CR.maskWeights(M, s.w, s.h, auxq, s.img.data, mcache), cv = App.canvas(s.w, s.h), id = cv.getContext('2d').createImageData(s.w, s.h);
          for (let j = 0; j < wts.length; j++) { id.data[j * 4] = 255; id.data[j * 4 + 1] = 40; id.data[j * 4 + 2] = 70; id.data[j * 4 + 3] = wts[j] * 120; }
          cv.getContext('2d').putImageData(id, 0, 0); maskOvCache = { key: JSON.stringify([selMask, src.q.w]), cv };
        }
        c.drawImage(maskOvCache.cv, f.x / FW * maskOvCache.cv.width, f.y / FH * maskOvCache.cv.height, f.w / FW * maskOvCache.cv.width, f.h / FH * maskOvCache.cv.height, ix, iy, iw, ihh);
      }
      for (const M of S.masks) {
        const on = M === selMask;
        if (M.type === 'linear') { const a = toScr(M.x1, M.y1), b = toScr(M.x2, M.y2), dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * 2000, ny = dx / L * 2000; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.45)'; c.lineWidth = 1.2; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(a.x - nx, a.y - ny); c.lineTo(a.x + nx, a.y + ny); c.moveTo(b.x - nx, b.y - ny); c.lineTo(b.x + nx, b.y + ny); c.stroke(); c.setLineDash([]); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); handle(a.x, a.y, on); handle(b.x, b.y, on); }
        if (M.type === 'radial') { const p = toScr(M.cx, M.cy), rx = M.rx * FW * V.z, ry = M.ry * FH * V.z, a = (M.angle || 0) * PI / 180; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.45)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(p.x, p.y, rx, ry, a, 0, 7); c.stroke(); c.setLineDash([4, 4]); const f2 = 1 - (M.feather ?? 50) / 100; c.beginPath(); c.ellipse(p.x, p.y, Math.max(1, rx * f2), Math.max(1, ry * f2), a, 0, 7); c.stroke(); c.setLineDash([]); handle(p.x, p.y, on); if (on) { handle(p.x + Math.cos(a) * rx, p.y + Math.sin(a) * rx, false); handle(p.x - Math.sin(a) * ry, p.y + Math.cos(a) * ry, false); } }
      }
    }
    // samplers
    samplers.forEach((sp, i) => { const p = toScr(sp.x, sp.y); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, 6, 0, 7); c.moveTo(p.x - 10, p.y); c.lineTo(p.x + 10, p.y); c.moveTo(p.x, p.y - 10); c.lineTo(p.x, p.y + 10); c.stroke(); c.fillStyle = '#fff'; c.font = '700 10px Manrope'; c.fillText(String(i + 1), p.x + 8, p.y - 8); });
    // brush cursor
    if (cursorPos && brushSize()) { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.2; c.beginPath(); c.arc(cursorPos.x, cursorPos.y, brushSize() * FW * V.z, 0, 7); c.stroke(); c.strokeStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.arc(cursorPos.x, cursorPos.y, brushSize() * FW * V.z + 1.2, 0, 7); c.stroke(); }
  }
  const mcache = {};

  /* ---------- histogram ---------- */
  function drawHist() {
    const k = dpr(), W = histCv.clientWidth || 300, H = histCv.clientHeight || 100;
    histCv.width = W * k; histCv.height = H * k; const c = histCv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, H);
    // the theme's "well" colour, so light themes get a light histogram instead of a muddy grey box
    c.fillStyle = App.th.well || 'rgba(0,0,0,.25)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = `rgba(${App.th.ink},.1)`; c.lineWidth = 1; c.strokeRect(0.5, 0.5, W - 1, H - 1);
    if (!lastHist) return;
    const hst = lastHist.hist; let mx = 1; for (const ch of ['r', 'g', 'b']) for (let i = 3; i < 253; i++) mx = Math.max(mx, hst[ch][i]);
    // additive on dark backgrounds (overlaps glow towards white), multiply on light ones (overlaps deepen to grey)
    const light = App.th.light;
    c.globalCompositeOperation = light ? 'multiply' : 'lighter';
    for (const [ch, col] of light ? [['r', 'rgba(255,92,92,.8)'], ['g', 'rgba(70,200,105,.75)'], ['b', 'rgba(85,135,255,.8)']] : [['r', 'rgba(255,60,60,.75)'], ['g', 'rgba(60,220,90,.7)'], ['b', 'rgba(70,120,255,.8)']]) { c.fillStyle = col; c.beginPath(); c.moveTo(0, H); for (let i = 0; i < 256; i++) c.lineTo(i / 255 * W, H - Math.min(1, Math.sqrt(hst[ch][i] / mx)) * (H - 4)); c.lineTo(W, H); c.fill(); }
    c.globalCompositeOperation = 'source-over';
    const tot = lastHist.w * lastHist.h;
    clipLoBtn.classList.toggle('warn', lastHist.clipLo / tot > 0.002); clipHiBtn.classList.toggle('warn', lastHist.clipHi / tot > 0.002);
  }

  /* ---------- color samplers ---------- */
  const samplers = [];
  function updateSamplers() {
    samplerBar.innerHTML = '';
    samplerBar.style.display = samplers.length ? '' : 'none';
    samplers.forEach((sp, i) => { const v = sampleAt(sp.x, sp.y); samplerBar.append(h('span', { class: 'cr-smp', title: 'Sampler ' + (i + 1), tip: 'Live RGB values at this point. Click to remove.' }, h('b', null, i + 1), v ? `R ${v[0]}  G ${v[1]}  B ${v[2]}` : '—')); samplerBar.lastChild.addEventListener('click', () => { samplers.splice(i, 1); updateSamplers(); drawOverlay(); }); });
    if (samplers.length) samplerBar.append(btn({ label: 'Clear', cls: 'sm txt', title: 'Clear samplers', tip: 'Remove all color samplers.', onClick: () => { samplers.length = 0; updateSamplers(); drawOverlay(); } }));
  }
  const sampleAt = (nx, ny) => { if (!last) return null; const x = clamp(Math.floor(nx * last.width), 0, last.width - 1), y = clamp(Math.floor(ny * last.height), 0, last.height - 1), i = (y * last.width + x) * 4; return [last.data[i], last.data[i + 1], last.data[i + 2]]; };

  /* =====================================================================
     Pointer interaction on the preview
     ===================================================================== */
  let spaceDown = false;
  const brushSize = () => (tool === 'remove' && !pointerMode ? removeOpt.size / FW : tool === 'mask' && selMask && selMask.type === 'brush' && !pointerMode ? brushOpt.size / FW : 0);
  stage.addEventListener('pointermove', e => {
    const r = stage.getBoundingClientRect(); cursorPos = { x: e.clientX - r.left, y: e.clientY - r.top };
    const p = toImg(e.clientX, e.clientY), v = sampleAt(p.x, p.y);
    rgbRead.textContent = v && p.x >= 0 && p.y >= 0 && p.x <= 1 && p.y <= 1 ? `R: ${v[0]}   G: ${v[1]}   B: ${v[2]}` : 'R: —  G: —  B: —';
    if (brushSize()) drawOverlay();
  });
  stage.addEventListener('pointerleave', () => { cursorPos = null; drawOverlay(); });
  stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomTo(V.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  stage.addEventListener('dblclick', () => { if (!pointerMode && tool !== 'mask') fit(); });
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault(); stage.setPointerCapture(e.pointerId);
    const r = stage.getBoundingClientRect(), mode = spaceDown || e.button === 1 ? 'hand' : pointerMode;
    const drag = (mv, up) => { const m2 = ev => mv(ev), u2 = ev => { stage.removeEventListener('pointermove', m2); stage.removeEventListener('pointerup', u2); up && up(ev); }; stage.addEventListener('pointermove', m2); stage.addEventListener('pointerup', u2); };
    const p0 = toImg(e.clientX, e.clientY);
    if (mode === 'hand') { const sx = e.clientX - V.x, sy = e.clientY - V.y; return drag(ev => { V.x = ev.clientX - sx; V.y = ev.clientY - sy; drawView(); }); }
    if (mode === 'zoom') return zoomTo(V.z * (e.altKey ? 1 / 1.6 : 1.6), e.clientX - r.left, e.clientY - r.top);
    if (mode === 'sampler') { if (samplers.length >= 9) return App.toast('Up to 9 samplers'); samplers.push({ x: p0.x, y: p0.y }); updateSamplers(); return drawOverlay(); }
    if (mode === 'wb') { const s = src.p, cx = Math.floor(p0.x * s.w), cy = Math.floor(p0.y * s.h); let rr = 0, gg = 0, bb = 0, n = 0; for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) { if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue; const i = (y * s.w + x) * 4; rr += CR.S2L[s.img.data[i]]; gg += CR.S2L[s.img.data[i + 1]]; bb += CR.S2L[s.img.data[i + 2]]; n++; } if (n) { const q = CR.neutralize(rr / n, gg / n, bb / n); S.temp = q.temp; S.tint = q.tint; S.wb = 'custom'; refresh(); requestRender(); commit(); } setPointer(null); return; }
    if (mode === 'focus') { const d = CR.sampleMap(CR.depthMap(src.q.img.data, src.q.w, src.q.h), p0.x * src.q.w, p0.y * src.q.h) * 100; S.lb.near = Math.round(clamp(d - 8, 0, 100)); S.lb.far = Math.round(clamp(d + 8, 0, 100)); S.lb.on = true; refresh(); requestRender(); commit(); setPointer(null); return; }
    if (mode === 'fringe') { const v = sampleAt(p0.x, p0.y); if (v) { const [hh] = X.rgbToHsv(v[0] / 255, v[1] / 255, v[2] / 255), deg = hh * 360; if (deg > 250 || deg < 20) { S.purpleAmt = Math.max(S.purpleAmt, 6); } else if (deg > 60 && deg < 180) { S.greenAmt = Math.max(S.greenAmt, 6); } else App.toast('That pixel isn’t a purple or green fringe', 'warn'); refresh(); requestRender(); commit(); } setPointer(null); return; }
    // tool-specific editing
    if (tool === 'crop') return cropPointer(e, p0, drag);
    if (tool === 'remove') return removePointer(e, p0, drag);
    if (tool === 'redeye') return redeyePointer(e, p0, drag);
    if (tool === 'mask') return maskPointer(e, p0, drag);
    // default: hand
    const sx = e.clientX - V.x, sy = e.clientY - V.y; drag(ev => { V.x = ev.clientX - sx; V.y = ev.clientY - sy; drawView(); });
  });

  /* ---------- crop ---------- */
  const ASPECTS = [['free', 'Free'], ['shot', 'As shot'], ['1:1', '1 : 1'], ['4:5', '4 : 5 (8 × 10)'], ['5:7', '5 : 7'], ['2:3', '2 : 3 (4 × 6)'], ['3:4', '3 : 4'], ['16:9', '16 : 9'], ['16:10', '16 : 10'], ['9:16', '9 : 16 (vertical)']];
  const aspectOf = a => { if (a === 'free') return null; if (a === 'shot') return FW / FH; const [x, y] = a.split(':').map(Number); return x / y; };
  const applyAspect = () => {
    const ar = aspectOf(S.crop.aspect); if (!ar) return;
    const c = S.crop, cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    let w = c.w * FW, hh = c.h * FH; if (w / hh > ar) w = hh * ar; else hh = w / ar;
    w = Math.min(w, FW); hh = Math.min(hh, FH); if (w / hh > ar) w = hh * ar; else hh = w / ar;
    c.w = w / FW; c.h = hh / FH; c.x = clamp(cx - c.w / 2, 0, 1 - c.w); c.y = clamp(cy - c.h / 2, 0, 1 - c.h);
  };
  function cropPointer(e, p0, drag) {
    const c = S.crop, a = toScr(c.x, c.y), b = toScr(c.x + c.w, c.y + c.h), r = stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, near = (x, y) => Math.abs(px - x) < 10 && Math.abs(py - y) < 10;
    let edge = '';
    if (near(a.x, a.y)) edge = 'nw'; else if (near(b.x, a.y)) edge = 'ne'; else if (near(a.x, b.y)) edge = 'sw'; else if (near(b.x, b.y)) edge = 'se';
    else if (Math.abs(py - a.y) < 8 && px > a.x && px < b.x) edge = 'n'; else if (Math.abs(py - b.y) < 8 && px > a.x && px < b.x) edge = 's'; else if (Math.abs(px - a.x) < 8 && py > a.y && py < b.y) edge = 'w'; else if (Math.abs(px - b.x) < 8 && py > a.y && py < b.y) edge = 'e';
    const o = { ...c }, ar = aspectOf(c.aspect);
    if (!edge) {
      if (p0.x > c.x && p0.x < c.x + c.w && p0.y > c.y && p0.y < c.y + c.h) return drag(ev => { const p = toImg(ev.clientX, ev.clientY); c.x = clamp(o.x + p.x - p0.x, 0, 1 - c.w); c.y = clamp(o.y + p.y - p0.y, 0, 1 - c.h); drawView(); }, () => commit());
      // outside: drag to rotate (straighten)
      const cx = toScr(c.x + c.w / 2, c.y + c.h / 2), a0 = Math.atan2(py - cx.y, px - cx.x), ang0 = c.angle;
      return drag(ev => { const a1 = Math.atan2(ev.clientY - r.top - cx.y, ev.clientX - r.left - cx.x); c.angle = clamp(Math.round((ang0 + (a1 - a0) * 180 / PI) * 10) / 10, -45, 45); refresh(); requestRender(); }, () => commit());
    }
    drag(ev => {
      const p = toImg(ev.clientX, ev.clientY);
      let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      if (edge.includes('w')) x0 = clamp(p.x, 0, x1 - 0.02); if (edge.includes('e')) x1 = clamp(p.x, x0 + 0.02, 1);
      if (edge.includes('n')) y0 = clamp(p.y, 0, y1 - 0.02); if (edge.includes('s')) y1 = clamp(p.y, y0 + 0.02, 1);
      if (ar) { const w = (x1 - x0) * FW, hh = (y1 - y0) * FH; if (edge === 'n' || edge === 's') { const nw = hh * ar / FW; x0 = clamp((o.x + o.w / 2) - nw / 2, 0, 1); x1 = Math.min(1, x0 + nw); } else { const nh = w / ar / FH; if (edge.includes('n')) y0 = y1 - nh; else y1 = y0 + nh; if (y0 < 0 || y1 > 1) return; } }
      c.x = x0; c.y = y0; c.w = x1 - x0; c.h = y1 - y0; drawView();
    }, () => commit());
  }
  /* ---------- remove (heal / clone) ---------- */
  const removeOpt = Object.assign({ mode: 'heal', size: Math.round(Math.max(FW, FH) / 60), feather: 30, opacity: 100 }, store.get('strata.cr.remove', {}));
  function removePointer(e, p0, drag) {
    // click on an existing spot (or its clone source) selects it
    const hit = retouch.spots.findIndex(sp => sp.pts.some(([x, y]) => Math.hypot((x - p0.x) * FW, (y - p0.y) * FH) < sp.r * FW + 3));
    if (hit >= 0 && !e.shiftKey) { selSpot = hit; drawOverlay(); const sp = retouch.spots[hit], o = sp.pts.map(q => q.slice()); return drag(ev => { const p = toImg(ev.clientX, ev.clientY); sp.pts = o.map(([x, y]) => [x + p.x - p0.x, y + p.y - p0.y]); drawOverlay(); }, () => { retouchChanged(); commit(); }); }
    const srcHit = selSpot >= 0 && retouch.spots[selSpot] && retouch.spots[selSpot].mode === 'clone' ? retouch.spots[selSpot] : null;
    if (srcHit && Math.hypot((srcHit.pts[0][0] - srcHit.src[0] - p0.x) * FW, (srcHit.pts[0][1] - srcHit.src[1] - p0.y) * FH) < srcHit.r * FW) { const o = srcHit.src.slice(); return drag(ev => { const p = toImg(ev.clientX, ev.clientY); srcHit.src = [o[0] - (p.x - p0.x), o[1] - (p.y - p0.y)]; drawOverlay(); }, () => { retouchChanged(); commit(); }); }
    const r = removeOpt.size / FW, sp = { pts: [[p0.x, p0.y]], r, feather: removeOpt.feather, opacity: removeOpt.opacity, mode: removeOpt.mode, src: [r * 2.6, r * 0.6] };
    retouch.spots.push(sp); selSpot = retouch.spots.length - 1; drawOverlay();
    drag(ev => { const p = toImg(ev.clientX, ev.clientY), lp = sp.pts[sp.pts.length - 1]; if (Math.hypot((p.x - lp[0]) * FW, (p.y - lp[1]) * FH) > removeOpt.size * 0.3) { sp.pts.push([p.x, p.y]); drawOverlay(); } }, () => { retouchChanged(); commit(); buildPanel(); });
  }
  /* ---------- red eye ---------- */
  function redeyePointer(e, p0, drag) {
    const eye = { cx: p0.x, cy: p0.y, rx: 0.005, ry: 0.005 * FW / FH }; retouch.eyes.push(eye);
    drag(ev => { const p = toImg(ev.clientX, ev.clientY); eye.cx = (p0.x + p.x) / 2; eye.cy = (p0.y + p.y) / 2; eye.rx = Math.max(0.002, Math.abs(p.x - p0.x) / 2); eye.ry = Math.max(0.002, Math.abs(p.y - p0.y) / 2); drawOverlay(); }, () => { if (eye.rx * FW < 3) { eye.rx = 0.02; eye.ry = 0.02 * FW / FH; } retouchChanged(); commit(); buildPanel(); });
  }
  /* ---------- masks ---------- */
  const brushOpt = Object.assign({ size: Math.round(Math.max(FW, FH) / 30), feather: 50, flow: 100, erase: false }, store.get('strata.cr.brush', {}));
  const maskName = t => ({ subject: 'Subject', sky: 'Sky', background: 'Background', brush: 'Brush', linear: 'Linear gradient', radial: 'Radial gradient', lum: 'Luminance range' })[t];
  const addMask = type => {
    const M = { id: App.uid('mk'), type, name: maskName(type) + ' ' + (S.masks.filter(m => m.type === type).length + 1), invert: false, opacity: 100, adj: CR.localDefaults(), ver: 0 };
    if (type === 'linear') Object.assign(M, { x1: 0.5, y1: 0.15, x2: 0.5, y2: 0.55 });
    if (type === 'radial') Object.assign(M, { cx: 0.5, cy: 0.5, rx: 0.22, ry: 0.22 * FW / FH, angle: 0, feather: 50 });
    if (type === 'brush') M.strokes = [];
    if (type === 'lum') Object.assign(M, { lo: 60, hi: 100, smooth: 20 });
    if (['subject', 'sky', 'background', 'lum'].includes(type)) M.adj.exposure = 0;
    S.masks.push(M); selMask = M; maskOvCache = null; buildPanel(); drawView(); commit();
  };
  function maskPointer(e, p0, drag) {
    const M = selMask;
    // pick a mask by its handles first
    for (const K of S.masks) {
      if (K.type === 'linear') for (const [kx, ky] of [['x1', 'y1'], ['x2', 'y2']]) { const s = toScr(K[kx], K[ky]), r = stage.getBoundingClientRect(); if (Math.hypot(e.clientX - r.left - s.x, e.clientY - r.top - s.y) < 9) { selMask = K; buildPanel(); const o = [K[kx], K[ky]]; return drag(ev => { const p = toImg(ev.clientX, ev.clientY); K[kx] = o[0] + p.x - p0.x; K[ky] = o[1] + p.y - p0.y; maskOvCache = null; drawOverlay(); requestRender(); }, () => commit()); } }
      if (K.type === 'radial') { const s = toScr(K.cx, K.cy), r = stage.getBoundingClientRect(), dx = e.clientX - r.left - s.x, dy = e.clientY - r.top - s.y, a = (K.angle || 0) * PI / 180, rx = K.rx * FW * V.z, ry = K.ry * FH * V.z;
        if (Math.hypot(dx, dy) < 9) { selMask = K; buildPanel(); const o = [K.cx, K.cy]; return drag(ev => { const p = toImg(ev.clientX, ev.clientY); K.cx = o[0] + p.x - p0.x; K.cy = o[1] + p.y - p0.y; maskOvCache = null; drawOverlay(); requestRender(); }, () => commit()); }
        if (K === selMask && Math.hypot(dx - Math.cos(a) * rx, dy - Math.sin(a) * rx) < 9) return drag(ev => { const p = toImg(ev.clientX, ev.clientY); K.rx = Math.max(0.01, Math.hypot((p.x - K.cx) * FW, (p.y - K.cy) * FH) / FW); maskOvCache = null; drawOverlay(); requestRender(); }, () => commit());
        if (K === selMask && Math.hypot(dx + Math.sin(a) * ry, dy - Math.cos(a) * ry) < 9) return drag(ev => { const p = toImg(ev.clientX, ev.clientY); K.ry = Math.max(0.01, Math.hypot((p.x - K.cx) * FW, (p.y - K.cy) * FH) / FH); maskOvCache = null; drawOverlay(); requestRender(); }, () => commit());
      }
    }
    if (!M) return App.toast('Create a mask first (on the right)', 'warn');
    if (M.type === 'brush') {
      const st = { pts: [[p0.x, p0.y]], r: brushOpt.size / FW, feather: brushOpt.feather, flow: brushOpt.flow, erase: brushOpt.erase !== e.altKey };
      M.strokes.push(st); M.ver++;
      return drag(ev => { const p = toImg(ev.clientX, ev.clientY); st.pts.push([p.x, p.y]); M.ver++; maskOvCache = null; drawOverlay(); clearTimeout(brushTimer); brushTimer = setTimeout(requestRender, 60); }, () => { maskOvCache = null; requestRender(); commit(); });
    }
    if (M.type === 'linear') return drag(ev => { const p = toImg(ev.clientX, ev.clientY); M.x1 = p0.x; M.y1 = p0.y; M.x2 = p.x; M.y2 = p.y; maskOvCache = null; drawOverlay(); requestRender(); }, () => commit());
    if (M.type === 'radial') return drag(ev => { const p = toImg(ev.clientX, ev.clientY); M.cx = p0.x; M.cy = p0.y; M.rx = Math.max(0.01, Math.abs(p.x - p0.x)); M.ry = Math.max(0.01, Math.abs(p.y - p0.y)); maskOvCache = null; drawOverlay(); requestRender(); }, () => commit());
  }
  let brushTimer = 0;

  /* =====================================================================
     Panels
     ===================================================================== */
  let regs = [];   // {path, ctl} — refreshed after undo / presets / auto
  const refresh = () => { for (const r of regs) { const v = get(S, r.path); if (r.ctl.set) r.ctl.set(r.kind === 'toggle' ? !!v : v); } };
  /** slider bound to a settings path */
  const sl = (path, label, min, max, o = {}) => {
    const row = App.slider({ label, min, max, step: o.step || 1, value: get(S, path), def: get(DEF, path) ?? 0, unit: o.unit, tip: o.tip, fmt: o.fmt,
      onInput: v => { set(S, path, v); if (o.after) o.after(v); requestRender(); }, onChange: () => commit() });
    row.classList.add('cr-sl');
    if (o.track) { row.input.classList.add('grad'); row.input.style.setProperty('--track', o.track); }
    regs.push({ path, ctl: row });
    return row;
  };
  const tg = (path, label, tip, after) => { const t = App.toggle({ label, value: !!get(S, path), tip, onChange: v => { set(S, path, v); after && after(v); requestRender(); commit(); } }); regs.push({ path, ctl: t, kind: 'toggle' }); return t; };
  const segOf = (path, options, after) => { const s = App.seg({ value: get(S, path), options, onChange: v => { set(S, path, v); after && after(v); requestRender(); commit(); } }); regs.push({ path, ctl: s }); return s; };
  const eye = key => { const b = btn({ icon: S.off[key] ? 'eyeOff' : 'eye', cls: 'sm cr-eye' + (S.off[key] ? ' off' : ''), title: 'Show / hide panel adjustments', tip: 'Temporarily turn this panel’s adjustments off to compare (they’re kept).', onClick: e => { e.stopPropagation(); S.off[key] = !S.off[key]; b.classList.toggle('off', S.off[key]); b.replaceChildren(icon(S.off[key] ? 'eyeOff' : 'eye', 15)); requestRender(); } }); return b; };
  const sec = (key, title, content, open = false) => App.section(title, null, content, { id: 'cr-' + key, closed: !open, action: eye(key) });
  const sub = (title, ...kids) => { const d = h('details', { class: 'cr-sub' }, h('summary', { title, tip: 'Show more options.' }, title), ...kids); return d; };

  function editPanel() {
    const mono = CR.isMono(S);
    const autoBtn = btn({ label: 'Auto', cls: 'solid txt sm', title: 'Auto', tip: 'Automatically sets exposure, contrast, highlights, shadows, whites, blacks, vibrance and saturation for this photo.', onClick: () => { Object.assign(S, CR.auto(src.p.img.data, src.p.w, src.p.h)); refresh(); requestRender(); commit(); } });
    const bwBtn = btn({ label: 'B&W', cls: 'solid txt sm' + (mono ? ' on' : ''), title: 'Black & white', tip: 'Switch between color and black & white (Monochrome profile).', onClick: () => { S.profile = CR.isMono(S) ? 'color' : 'monochrome'; buildPanel(); requestRender(); commit(); } });
    const profSel = App.select({ label: 'Profile', value: S.profile, tip: 'The base rendering of the photo. Creative profiles add a look with an Amount slider.', options: [{ group: 'Basic', options: CR.PROFILES.slice(0, 6).map(p => [p[0], p[1]]) }, { group: 'Creative', options: CR.PROFILES.slice(6).map(p => [p[0], p[1]]) }], onChange: v => { S.profile = v; buildPanel(); requestRender(); commit(); } });
    const top = h('div', { class: 'cr-edit-head' }, h('b', null, 'Edit'), h('div', { class: 'grow' }), autoBtn, bwBtn);
    const prof = h('div', null, profSel, CR.isCreative(S) || mono ? sl('profileAmount', 'Amount', 0, 200, { tip: 'Strength of the profile’s look.', unit: '%' }) : null);
    const light = sec('light', 'Light', h('div', null,
      sl('exposure', 'Exposure', -5, 5, { step: 0.05, track: TRACK.tone, tip: 'Overall brightness in stops (EV): +1 doubles the light.', fmt: v => (v > 0 ? '+' : '') + (+v).toFixed(2) }),
      sl('contrast', 'Contrast', -100, 100, { track: TRACK.tone, tip: 'Difference between darks and lights.' }),
      sl('highlights', 'Highlights', -100, 100, { track: TRACK.tone, tip: 'Recover (−) or brighten (+) the bright areas — adapts to each region so detail is kept.' }),
      sl('shadows', 'Shadows', -100, 100, { track: TRACK.tone, tip: 'Open up (+) or deepen (−) the dark areas.' }),
      sl('whites', 'Whites', -100, 100, { track: TRACK.tone, tip: 'Sets how bright the brightest whites get.' }),
      sl('blacks', 'Blacks', -100, 100, { track: TRACK.tone, tip: 'Sets how dark the darkest blacks get.' })), true);
    const wbSel = App.select({ label: 'White balance', value: S.wb, tip: 'As shot keeps the colors; Auto neutralises color casts; Custom is whatever you set.', options: [['shot', 'As shot'], ['auto', 'Auto'], ['custom', 'Custom']], onChange: v => { S.wb = v; if (v === 'shot') { S.temp = 0; S.tint = 0; } if (v === 'auto') Object.assign(S, CR.autoWB(src.p.img.data)); refresh(); requestRender(); commit(); } });
    regs.push({ path: 'wb', ctl: wbSel });
    const wbPick = btn({ icon: 'dropper', cls: 'sm', title: 'White balance tool', key: 'I', tip: 'Click something in the photo that should be neutral grey or white to remove the color cast.', onClick: () => setPointer('wb') });
    wbSel.append(wbPick);
    const color = sec('color', 'Color', h('div', null, wbSel,
      sl('temp', 'Temperature', -100, 100, { track: TRACK.temp, tip: 'Cooler (blue) ↔ warmer (yellow).', after: () => { S.wb = 'custom'; wbSel.set('custom'); } }),
      sl('tint', 'Tint', -100, 100, { track: TRACK.tint, tip: 'Green ↔ magenta.', after: () => { S.wb = 'custom'; wbSel.set('custom'); } }),
      sl('vibrance', 'Vibrance', -100, 100, { track: TRACK.sat, tip: 'Smart saturation: boosts muted colors most and protects skin tones.' }),
      sl('saturation', 'Saturation', -100, 100, { track: TRACK.sat, tip: 'Intensity of every color equally.' })), true);
    const effects = sec('effects', 'Effects', h('div', null,
      sl('texture', 'Texture', -100, 100, { tip: 'Fine surface detail (skin, foliage) — negative smooths it.' }),
      sl('clarity', 'Clarity', -100, 100, { tip: 'Mid-tone local contrast — punch (+) or soft glow (−).' }),
      sl('dehaze', 'Dehaze', -100, 100, { tip: 'Removes (+) or adds (−) atmospheric haze and fog.' }),
      sl('vigAmount', 'Vignette', -100, 100, { track: TRACK.tone, tip: 'Darken (−) or lighten (+) the edges of the (cropped) frame.' }),
      sub('Vignette options', App.select({ label: 'Style', value: S.vigStyle, tip: 'Highlight priority keeps bright areas bright; Color priority keeps hues; Paint overlay mixes in black.', options: [['hp', 'Highlight priority'], ['cp', 'Color priority'], ['paint', 'Paint overlay']], onChange: v => { S.vigStyle = v; requestRender(); commit(); } }),
        sl('vigMid', 'Midpoint', 0, 100, { tip: 'How far the vignette reaches into the image.' }), sl('vigRound', 'Roundness', -100, 100, { tip: 'Rounder (+) or more rectangular (−) vignette.' }), sl('vigFeather', 'Feather', 0, 100, { tip: 'Softness of the transition.' }), sl('vigHigh', 'Highlights', 0, 100, { tip: 'Lets bright areas punch through a dark vignette.' })),
      sl('grain', 'Grain', 0, 100, { tip: 'Film grain.' }),
      sub('Grain options', sl('grainSize', 'Size', 0, 100, { tip: 'Size of the grain.' }), sl('grainRough', 'Roughness', 0, 100, { tip: 'Regular (low) or clumpy (high) grain.' })),
      sl('glow', 'Glow', 0, 100, { tip: 'Soft bloom around bright highlights.' }),
      sub('Glow options', sl('glowSize', 'Size', 0, 100, { tip: 'How far the glow spreads.' }))));
    const curve = sec('curve', 'Curve', curvePanel());
    const mixer = mono ? sec('mixer', 'B&W Mixer', bwPanel()) : sec('mixer', 'Color Mixer', hslPanel());
    const grading = sec('grading', 'Color Grading', gradingPanel());
    const detail = sec('detail', 'Detail', h('div', null,
      sl('sharpen', 'Sharpening', 0, 150, { tip: 'Crisper edges and detail.' }),
      sub('Sharpening options', sl('sharpRadius', 'Radius', 0.5, 3, { step: 0.1, tip: 'Size of the details to sharpen.' }), sl('sharpDetail', 'Detail', 0, 100, { tip: 'Higher sharpens fine texture more strongly; lower suppresses halos.' }), sl('sharpMask', 'Masking', 0, 100, { tip: 'Raise to sharpen only edges and leave smooth areas (sky, skin) untouched.' })),
      sl('nr', 'Noise Reduction', 0, 100, { tip: 'Smooths luminance (grain-like) noise.' }),
      sub('Noise reduction options', sl('nrDetail', 'Detail', 0, 100, { tip: 'Keeps more fine detail.' }), sl('nrContrast', 'Contrast', 0, 100, { tip: 'Keeps more local contrast.' })),
      sl('cnr', 'Color Noise Reduction', 0, 100, { tip: 'Removes colored speckles.' }),
      sub('Color noise options', sl('cnrDetail', 'Detail', 0, 100, { tip: 'Protects thin colored edges.' }), sl('cnrSmooth', 'Smoothness', 0, 100, { tip: 'Removes low-frequency color blotches.' }))));
    const optics = sec('optics', 'Optics', h('div', null,
      tg('removeCA', 'Remove chromatic aberration', 'Automatically aligns the red and blue channels to remove colored fringes at the edges of the frame.'),
      sl('distortion', 'Distortion', -100, 100, { tip: 'Corrects barrel (+) or pincushion (−) lens distortion.' }),
      sl('lensVig', 'Vignette', -100, 100, { tip: 'Corrects the darkening of the lens corners.' }),
      sub('Vignette midpoint', sl('lensVigMid', 'Midpoint', 0, 100, { tip: 'Where the correction starts.' })),
      h('div', { class: 'cr-defringe' }, h('h5', { class: 'fx-head' }, 'Defringe'),
        h('div', { class: 'ctl' }, h('label', null, 'Sample fringe'), btn({ icon: 'dropper', cls: 'sm', title: 'Sample fringe', tip: 'Click a purple or green fringe in the photo to set the defringe amount automatically.', onClick: () => setPointer('fringe') })),
        sl('purpleAmt', 'Purple amount', 0, 20, { tip: 'Removes purple / magenta fringes along high-contrast edges.' }), sl('purpleLo', 'Purple hue from', 0, 100, { track: 'linear-gradient(90deg,#7b2cff,#ff2bd6)', tip: 'Start of the purple hue range.' }), sl('purpleHi', 'Purple hue to', 0, 100, { track: 'linear-gradient(90deg,#7b2cff,#ff2bd6)', tip: 'End of the purple hue range.' }),
        sl('greenAmt', 'Green amount', 0, 20, { tip: 'Removes green fringes.' }), sl('greenLo', 'Green hue from', 0, 100, { track: 'linear-gradient(90deg,#d4e600,#00d68f)', tip: 'Start of the green hue range.' }), sl('greenHi', 'Green hue to', 0, 100, { track: 'linear-gradient(90deg,#d4e600,#00d68f)', tip: 'End of the green hue range.' }))));
    const geometry = sec('geometry', 'Geometry', h('div', null,
      h('div', { class: 'ctl', title: 'Upright', tip: 'Level finds the horizon and straightens it automatically.' }, h('label', null, 'Upright'), App.seg({ value: S.upright, options: [{ value: 'off', label: 'Off', tip: 'No automatic correction.' }, { value: 'level', label: 'Level', tip: 'Straighten the horizon automatically.' }], onChange: v => { S.upright = v; S.gRot = v === 'level' ? Math.round(CR.estimateLevel(src.p.img.data, src.p.w, src.p.h) * 10) / 10 : 0; refresh(); requestRender(); commit(); } })),
      sl('gVert', 'Vertical', -100, 100, { tip: 'Corrects buildings that lean backwards (vertical perspective).' }), sl('gHorz', 'Horizontal', -100, 100, { tip: 'Corrects horizontal perspective.' }), sl('gRot', 'Rotate', -10, 10, { step: 0.1, unit: '°', tip: 'Fine rotation.' }), sl('gAspect', 'Aspect', -100, 100, { tip: 'Stretches the image wider or taller.' }), sl('gScale', 'Scale', 50, 150, { unit: '%', tip: 'Zoom in to hide edges after transforming.' }), sl('gX', 'X Offset', -100, 100, { tip: 'Shift horizontally.' }), sl('gY', 'Y Offset', -100, 100, { tip: 'Shift vertically.' })));
    const lensblur = sec('lensblur', 'Lens Blur', lensBlurPanel());
    const cal = sec('calibration', 'Calibration', h('div', null,
      App.select({ label: 'Process', value: 'v6', tip: 'Processing version used for the rendering.', options: [['v6', 'Version 6 (Current)']], onChange: () => {} }),
      h('h5', { class: 'fx-head' }, 'Shadows'), sl('cal.shTint', 'Tint', -100, 100, { track: TRACK.tint, tip: 'Removes a green or magenta cast from the shadows.' }),
      h('h5', { class: 'fx-head' }, 'Red primary'), sl('cal.rH', 'Hue', -100, 100, { track: 'linear-gradient(90deg,#ff3d8b,#ff3b2f,#ff8a00)', tip: 'Shifts how reds (and everything containing red) are rendered.' }), sl('cal.rS', 'Saturation', -100, 100, { track: TRACK.satOf(0), tip: 'Saturation of the red primary.' }),
      h('h5', { class: 'fx-head' }, 'Green primary'), sl('cal.gH', 'Hue', -100, 100, { track: 'linear-gradient(90deg,#b5e61d,#22c55e,#14b8a6)', tip: 'Shifts how greens are rendered.' }), sl('cal.gS', 'Saturation', -100, 100, { track: TRACK.satOf(120), tip: 'Saturation of the green primary.' }),
      h('h5', { class: 'fx-head' }, 'Blue primary'), sl('cal.bH', 'Hue', -100, 100, { track: 'linear-gradient(90deg,#06b6d4,#2563eb,#7c3aed)', tip: 'Shifts how blues are rendered.' }), sl('cal.bS', 'Saturation', -100, 100, { track: TRACK.satOf(225), tip: 'Saturation of the blue primary.' })));
    return [top, prof, light, color, effects, curve, mixer, grading, detail, optics, geometry, lensblur, cal];
  }

  /* ---------- curve panel ---------- */
  let curveMode = 'param';
  function curvePanel() {
    const cv = h('canvas', { class: 'cr-curve', title: 'Curve', tip: 'Parametric: shape the curve with the sliders below. Point curves: click to add a point, drag to bend, drag off or double-click to remove.' });
    const bar = h('canvas', { class: 'cr-curvebar', title: 'Region dividers', tip: 'Drag the three markers to change where shadows, darks, lights and highlights meet.' });
    const KEY = { point: 'curve', r: 'curveR', g: 'curveG', b: 'curveB' };
    const draw = () => {
      const k = dpr(), W = cv.clientWidth || 260, H = W; cv.width = W * k; cv.height = H * k; const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0);
      c.fillStyle = App.th.well || 'rgba(0,0,0,.2)'; c.fillRect(0, 0, W, H);
      c.strokeStyle = `rgba(${App.th.ink},.1)`; c.lineWidth = 1; c.strokeRect(0.5, 0.5, W - 1, H - 1);
      if (lastHist) { const hs = lastHist.hist; let mx = 1; const L = new Float32Array(256); for (let i = 0; i < 256; i++) { L[i] = hs.r[i] + hs.g[i] + hs.b[i]; if (i > 2 && i < 253) mx = Math.max(mx, L[i]); } c.fillStyle = `rgba(${App.th.ink},.1)`; for (let i = 0; i < 256; i++) { const v = Math.min(1, Math.sqrt(L[i] / mx)); c.fillRect(i / 256 * W, H - v * H, W / 256 + 1, v * H); } }
      c.strokeStyle = `rgba(${App.th.ink},.14)`; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < 4; i++) { c.moveTo(i * W / 4, 0); c.lineTo(i * W / 4, H); c.moveTo(0, i * H / 4); c.lineTo(W, i * H / 4); } c.stroke();
      c.strokeStyle = `rgba(${App.th.ink},.25)`; c.beginPath(); c.moveTo(0, H); c.lineTo(W, 0); c.stroke();
      const col = { param: App.th.text, point: App.th.text, r: '#ff5d6c', g: '#4ade80', b: '#5ab0ff' }[curveMode];
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath();
      if (curveMode === 'param') {
        // preview the parametric curve by running the engine’s formula on a ramp
        const s = { ...S }, ramp = [];
        for (let i = 0; i < 256; i++) { const x = i / 255, s1 = s.split1 / 100, s2 = s.split2 / 100, s3 = s.split3 / 100, bump = (a, b) => (x <= a || x >= b ? 0 : Math.sin(PI * (x - a) / (b - a))); ramp.push(clamp(x + (s.pcShadows / 100 * 0.13 * bump(0, Math.min(1, s1 * 1.8)) + s.pcDarks / 100 * 0.13 * bump(Math.max(0, s1 * 0.5), s2 + (s2 - s1)) + s.pcLights / 100 * 0.13 * bump(s2 - (s3 - s2), Math.min(1, s3 + (1 - s3) * 0.5)) + s.pcHigh / 100 * 0.13 * bump(Math.max(0, s3 - (1 - s3) * 0.8), 1)), 0, 1)); }
        ramp.forEach((v, i) => (i ? c.lineTo(i / 255 * W, H - v * H) : c.moveTo(0, H - v * H)));
      } else { const lut = CR.curveLut(S[KEY[curveMode]]); for (let x = 0; x < 256; x++) { const px = x / 255 * W, py = H - lut[x] / 255 * H; x ? c.lineTo(px, py) : c.moveTo(px, py); } }
      c.stroke();
      if (curveMode !== 'param') { c.fillStyle = col; for (const [x, y] of S[KEY[curveMode]]) { c.beginPath(); c.arc(x / 255 * W, H - y / 255 * H, 4.5, 0, 7); c.fill(); } }
      // region bar
      const bw = W, bh = 16; bar.width = bw * k; bar.height = bh * k; const b = bar.getContext('2d'); b.setTransform(k, 0, 0, k, 0, 0);
      const g = b.createLinearGradient(0, 0, bw, 0); g.addColorStop(0, '#000'); g.addColorStop(1, '#fff'); b.fillStyle = g; b.fillRect(0, 2, bw, 5);
      bar.style.display = curveMode === 'param' ? '' : 'none';
      for (const key of ['split1', 'split2', 'split3']) { const x = S[key] / 100 * bw; b.fillStyle = App.th.text; b.beginPath(); b.moveTo(x, 8); b.lineTo(x - 5, 15); b.lineTo(x + 5, 15); b.closePath(); b.fill(); }
    };
    curveDraw = draw;
    const toV = e => { const r = cv.getBoundingClientRect(); return [clamp(Math.round((e.clientX - r.left) / r.width * 255), 0, 255), clamp(Math.round((1 - (e.clientY - r.top) / r.height) * 255), 0, 255), e.clientY - r.top, r]; };
    cv.addEventListener('pointerdown', e => {
      if (curveMode === 'param') return;
      const key = KEY[curveMode], pts = S[key], [x, y] = toV(e);
      let idx = pts.findIndex(p => Math.abs(p[0] - x) < 10 && Math.abs(p[1] - y) < 14);
      if (idx < 0) { pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); idx = pts.findIndex(p => p[0] === x && p[1] === y); }
      cv.setPointerCapture(e.pointerId);
      const mv = ev => { const [nx, ny, py, r] = toV(ev); if ((py < -30 || py > r.height + 30) && idx > 0 && idx < pts.length - 1) { pts.splice(idx, 1); idx = -1; cv.removeEventListener('pointermove', mv); } else if (idx >= 0) { const lo = idx > 0 ? pts[idx - 1][0] + 1 : 0, hi = idx < pts.length - 1 ? pts[idx + 1][0] - 1 : 255; pts[idx] = [clamp(nx, lo, hi), ny]; } draw(); requestRender(); };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', () => { cv.removeEventListener('pointermove', mv); commit(); }, { once: true });
      draw(); requestRender();
    });
    cv.addEventListener('dblclick', e => { if (curveMode === 'param') return; const key = KEY[curveMode], pts = S[key], [x, y] = toV(e), idx = pts.findIndex(p => Math.abs(p[0] - x) < 10 && Math.abs(p[1] - y) < 14); if (idx > 0 && idx < pts.length - 1) { pts.splice(idx, 1); draw(); requestRender(); commit(); } });
    bar.addEventListener('pointerdown', e => { const r = bar.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 100, key = ['split1', 'split2', 'split3'].reduce((a, k) => (Math.abs(S[k] - x) < Math.abs(S[a] - x) ? k : a), 'split1'); bar.setPointerCapture(e.pointerId); const mv = ev => { const v = clamp((ev.clientX - r.left) / r.width * 100, 5, 95); const lo = key === 'split1' ? 5 : S[key === 'split2' ? 'split1' : 'split2'] + 5, hi = key === 'split3' ? 95 : S[key === 'split1' ? 'split2' : 'split3'] - 5; S[key] = Math.round(clamp(v, lo, hi)); draw(); requestRender(); }; bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', () => { bar.removeEventListener('pointermove', mv); commit(); }, { once: true }); });
    const modes = h('div', { class: 'cr-curvemodes' }, h('span', { class: 'hint', style: { padding: 0 } }, 'Adjust'),
      ...[['param', 'Parametric curve', 'curve'], ['point', 'Point curve (RGB)', 'target'], ['r', 'Red channel', null], ['g', 'Green channel', null], ['b', 'Blue channel', null]].map(([id, label, ic]) => {
        const b = h('button', { class: 'cr-cm ' + id + (curveMode === id ? ' on' : ''), title: label, tip: id === 'param' ? 'Shape tones with Highlights / Lights / Darks / Shadows sliders.' : 'Bend the curve with points' + (id === 'point' ? ' (all channels).' : ' for this channel only.') }, ic ? icon(ic, 14) : null);
        b.addEventListener('click', () => { curveMode = id; modes.querySelectorAll('.cr-cm').forEach(x => x.classList.toggle('on', x === b)); params.style.display = id === 'param' ? '' : 'none'; draw(); });
        return b;
      }),
      btn({ icon: 'undo', cls: 'sm', title: 'Reset curve', tip: 'Reset the current curve.', onClick: () => { if (curveMode === 'param') Object.assign(S, { pcHigh: 0, pcLights: 0, pcDarks: 0, pcShadows: 0, split1: 25, split2: 50, split3: 75 }); else S[KEY[curveMode]] = [[0, 0], [255, 255]]; refresh(); draw(); requestRender(); commit(); } }));
    const params = h('div', { style: { display: curveMode === 'param' ? '' : 'none' } },
      sl('pcHigh', 'Highlights', -100, 100, { tip: 'Raise or lower the brightest region of the curve.', after: () => draw() }), sl('pcLights', 'Lights', -100, 100, { tip: 'Raise or lower the light mid-tones.', after: () => draw() }),
      sl('pcDarks', 'Darks', -100, 100, { tip: 'Raise or lower the dark mid-tones.', after: () => draw() }), sl('pcShadows', 'Shadows', -100, 100, { tip: 'Raise or lower the darkest region.', after: () => draw() }));
    requestAnimationFrame(draw);
    return h('div', { class: 'cr-curvewrap' }, modes, cv, bar, params);
  }
  let curveDraw = null;

  /* ---------- color mixer (HSL) and B&W mixer ---------- */
  let hslTab = 'hue';
  function hslPanel() {
    const body2 = h('div');
    const render = () => {
      body2.innerHTML = '';
      const kinds = hslTab === 'all' ? ['hue', 'sat', 'lum'] : [hslTab];
      for (const kd of kinds) {
        if (hslTab === 'all') body2.append(h('h5', { class: 'fx-head' }, { hue: 'Hue', sat: 'Saturation', lum: 'Luminance' }[kd]));
        for (const c of CR.HUES) { const deg = HUE_DEG[c]; body2.append(sl(`${kd}.${c}`, HUE_NAMES[c], -100, 100, { track: kd === 'hue' ? TRACK.hue(deg) : kd === 'sat' ? TRACK.satOf(deg) : TRACK.lumOf(deg), tip: `${{ hue: 'Shift the hue of', sat: 'Saturation of', lum: 'Brightness of' }[kd]} the ${HUE_NAMES[c].toLowerCase()} in the photo.` })); }
      }
    };
    const seg = App.seg({ value: hslTab, onChange: v => { hslTab = v; regs = regs.filter(r => !/^(hue|sat|lum)\./.test(r.path)); render(); }, options: [{ value: 'hue', label: 'Hue', tip: 'Shift each color family’s hue.' }, { value: 'sat', label: 'Saturation', tip: 'Make each color family more or less intense.' }, { value: 'lum', label: 'Luminance', tip: 'Make each color family brighter or darker.' }, { value: 'all', label: 'All', tip: 'Show all three sets of sliders.' }] });
    render();
    return h('div', null, h('div', { class: 'ctl' }, h('label', null, 'Adjust'), seg), body2);
  }
  function bwPanel() {
    const auto = btn({ label: 'Auto', cls: 'solid txt sm', title: 'Auto mix', tip: 'Automatic black & white mix based on the photo’s colors.', onClick: () => {
      const d = src.q.img.data, sums = Object.fromEntries(CR.HUES.map(k => [k, 0])); let tot = 0;
      for (let i = 0; i < d.length; i += 16) { const [hh, s] = X.rgbToHsv(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255); if (s < 0.15) continue; const deg = hh * 360; let best = 'red', bd = 999; for (const k of CR.HUES) { const dd = Math.min(Math.abs(deg - HUE_DEG[k]), 360 - Math.abs(deg - HUE_DEG[k])); if (dd < bd) { bd = dd; best = k; } } sums[best]++; tot++; }
      for (const k of CR.HUES) S.bw[k] = tot ? Math.round(clamp((sums[k] / tot - 0.12) * 120, -30, 40)) : 0;
      refresh(); requestRender(); commit();
    } });
    return h('div', null, h('div', { class: 'ctl' }, h('label', null, ''), auto), ...CR.HUES.map(c => sl(`bw.${c}`, HUE_NAMES[c], -100, 100, { track: TRACK.lumOf(HUE_DEG[c]), tip: `How light or dark ${HUE_NAMES[c].toLowerCase()} become in black & white.` })));
  }

  /* ---------- color grading wheels ---------- */
  let gradeTab = '3way';
  function wheel(key, size, label) {
    const cv = h('canvas', { class: 'cr-wheel', style: { width: size + 'px', height: size + 'px' }, title: label, tip: `Drag the point to tint the ${label.toLowerCase()}: direction = hue, distance from center = saturation. Shift-drag changes only saturation, Ctrl-drag only hue. Double-click to reset.` });
    const draw = () => {
      const k = dpr(), W = size; cv.width = W * k; cv.height = W * k; const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0);
      const R = W / 2 - 3, cx = W / 2;
      const g = c.createConicGradient(-PI / 2 + 0, cx, cx); for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `hsl(${i * 30},90%,55%)`);   // hue grows clockwise from the top, matching the drag maths
      c.fillStyle = g; c.beginPath(); c.arc(cx, cx, R, 0, 7); c.fill();
      const rg = c.createRadialGradient(cx, cx, 0, cx, cx, R); rg.addColorStop(0, 'rgba(128,128,128,1)'); rg.addColorStop(1, 'rgba(128,128,128,0)'); c.fillStyle = rg; c.beginPath(); c.arc(cx, cx, R, 0, 7); c.fill();
      const v = S.cg[key], a = (v.h - 90) * PI / 180, rr = v.s / 100 * R, px = cx + Math.cos(a) * rr, py = cx + Math.sin(a) * rr;
      c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 2; c.beginPath(); c.arc(px, py, 6, 0, 7); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, 5, 0, 7); c.stroke();
      c.beginPath(); c.arc(cx, cx, 1.5, 0, 7); c.fillStyle = '#fff'; c.fill();
    };
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); const v = S.cg[key], o = { ...v };
      const mv = ev => { const r = cv.getBoundingClientRect(), x = ev.clientX - r.left - r.width / 2, y = ev.clientY - r.top - r.height / 2, R = r.width / 2 - 3; const hh = Math.round(((Math.atan2(y, x) * 180 / PI + 90) % 360 + 360) % 360), s = Math.round(clamp(Math.hypot(x, y) / R * 100, 0, 100)); if (!ev.ctrlKey) v.s = s; else v.s = o.s; if (!ev.shiftKey) v.h = hh; else v.h = o.h; draw(); syncHS(); requestRender(); };
      mv(e); cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', () => { cv.removeEventListener('pointermove', mv); commit(); }, { once: true });
    });
    cv.addEventListener('dblclick', () => { S.cg[key].s = 0; draw(); syncHS(); requestRender(); commit(); });
    wheelDraws.push(draw); requestAnimationFrame(draw);
    return cv;
  }
  let wheelDraws = [], syncHS = () => {};
  function gradingPanel() {
    wheelDraws = [];
    const body2 = h('div');
    const KEYS = { sh: 'Shadows', mid: 'Midtones', hi: 'Highlights', glob: 'Global' };
    const render = () => {
      body2.innerHTML = ''; wheelDraws = []; regs = regs.filter(r => !r.path.startsWith('cg.'));
      if (gradeTab === '3way') {
        body2.append(h('div', { class: 'cr-wheels3' },
          h('div', { class: 'cr-wcell big' }, h('span', null, 'Midtones'), wheel('mid', 120, 'Midtones'), sl('cg.mid.l', '', -100, 100, { tip: 'Brightness of the midtones.', track: TRACK.tone })),
          h('div', { class: 'cr-wrow' }, h('div', { class: 'cr-wcell' }, h('span', null, 'Shadows'), wheel('sh', 104, 'Shadows'), sl('cg.sh.l', '', -100, 100, { tip: 'Brightness of the shadows.', track: TRACK.tone })), h('div', { class: 'cr-wcell' }, h('span', null, 'Highlights'), wheel('hi', 104, 'Highlights'), sl('cg.hi.l', '', -100, 100, { tip: 'Brightness of the highlights.', track: TRACK.tone })))));
        syncHS = () => {};
      } else {
        const k = gradeTab;
        const hS = sl(`cg.${k}.h`, 'Hue', 0, 360, { tip: 'Tint color.', track: 'linear-gradient(90deg,hsl(0,85%,55%),hsl(60,85%,55%),hsl(120,85%,55%),hsl(180,85%,55%),hsl(240,85%,55%),hsl(300,85%,55%),hsl(360,85%,55%))', after: () => wheelDraws.forEach(d => d()) });
        const sS = sl(`cg.${k}.s`, 'Saturation', 0, 100, { tip: 'Strength of the tint.', after: () => wheelDraws.forEach(d => d()) });
        body2.append(h('div', { class: 'cr-wcell big' }, wheel(k, 170, KEYS[k])), hS, sS, sl(`cg.${k}.l`, 'Luminance', -100, 100, { tip: 'Brightness of this tonal range.', track: TRACK.tone }));
        syncHS = () => { hS.set(S.cg[k].h); sS.set(S.cg[k].s); };
      }
      body2.append(sl('cg.blend', 'Blending', 0, 100, { tip: 'How much the shadow, midtone and highlight ranges overlap.' }), sl('cg.balance', 'Balance', -100, 100, { tip: 'Shifts the split between shadows (−) and highlights (+).' }));
    };
    const tabs = h('div', { class: 'cr-gradetabs' }, h('span', { class: 'hint', style: { padding: 0 } }, 'Adjust'), ...[['3way', 'Three-way', 'All three wheels at once.'], ['sh', 'Shadows', 'Tint the shadows.'], ['mid', 'Midtones', 'Tint the midtones.'], ['hi', 'Highlights', 'Tint the highlights.'], ['glob', 'Global', 'Tint the whole image.']].map(([id, label, tip]) => {
      const b = h('button', { class: 'cr-gt ' + id + (gradeTab === id ? ' on' : ''), title: label, tip });
      b.addEventListener('click', () => { gradeTab = id; tabs.querySelectorAll('.cr-gt').forEach(x => x.classList.toggle('on', x === b)); render(); });
      return b;
    }));
    render();
    return h('div', null, tabs, body2);
  }

  /* ---------- lens blur ---------- */
  function lensBlurPanel() {
    const shapes = h('div', { class: 'cr-bokeh' }, ...[['circle', 'Circle', 'Smooth round bokeh.'], ['bubble', 'Bubble', 'Soap-bubble bokeh with bright rims.'], ['blade', '5-blade', 'Pentagonal bokeh like a stopped-down lens.'], ['ring', 'Ring', 'Ring-shaped (mirror-lens) bokeh.'], ['cat', 'Cat eye', 'Oval highlights near the frame edges, like vintage lenses.']].map(([id, label, tip]) => {
      const b = h('button', { class: 'cr-bk ' + id + (S.lb.bokeh === id ? ' on' : ''), title: label, tip });
      b.addEventListener('click', () => { S.lb.bokeh = id; shapes.querySelectorAll('.cr-bk').forEach(x => x.classList.toggle('on', x === b)); requestRender(); commit(); });
      return b;
    }));
    return h('div', null,
      tg('lb.on', 'Apply', 'Turn the lens blur on. Strata estimates a depth map so the background (or foreground) blurs like a fast lens.'),
      sl('lb.amount', 'Blur amount', 0, 100, { tip: 'Strength of the blur outside the focus range.', after: () => { if (!S.lb.on) { S.lb.on = true; refresh(); } } }),
      h('h5', { class: 'fx-head' }, 'Bokeh'), shapes,
      sl('lb.catEye', 'Cat eye', 0, 100, { tip: 'Squashes bokeh toward the frame edges (vintage lens look).' }),
      sl('lb.boost', 'Bokeh boost', 0, 100, { tip: 'Makes bright highlights in the blurred area bloom into glowing discs.' }),
      h('h5', { class: 'fx-head' }, 'Focus range'),
      h('div', { class: 'ctl' }, h('label', null, 'Focus'), h('div', { class: 'btn-row' },
        btn({ icon: 'select', label: 'Subject', cls: 'solid txt sm', title: 'Subject focus', tip: 'Focus on the detected main subject.', onClick: () => { const d = CR.subjectMap(src.q.img.data, src.q.w, src.q.h), dm = CR.depthMap(src.q.img.data, src.q.w, src.q.h); let sum = 0, wsum = 0; for (let j = 0; j < d.d.length; j++) { sum += d.d[j] * dm.d[j]; wsum += d.d[j]; } const c = wsum ? sum / wsum * 100 : 30; S.lb.near = Math.round(clamp(c - 10, 0, 100)); S.lb.far = Math.round(clamp(c + 10, 0, 100)); S.lb.on = true; refresh(); requestRender(); commit(); } }),
        btn({ icon: 'target', label: 'Point', cls: 'solid txt sm', title: 'Point focus', tip: 'Then click the spot in the photo that should be sharp.', onClick: () => setPointer('focus') }))),
      sl('lb.near', 'Near', 0, 100, { tip: 'Closest distance that stays sharp (0 = nearest).', track: 'linear-gradient(90deg,#ff9f43,#6c5ce7)' }),
      sl('lb.far', 'Far', 0, 100, { tip: 'Farthest distance that stays sharp (100 = farthest).', track: 'linear-gradient(90deg,#ff9f43,#6c5ce7)' }),
      tg('lb.viz', 'Visualize depth', 'Show the estimated depth map: warm = near, cool = far, bright = in focus.'),
      h('div', { class: 'hint' }, 'The depth map is estimated from the picture itself, so it works best on photos with a clear subject and background.'));
  }

  /* ---------- other tools ---------- */
  function cropPanel() {
    const aspect = App.select({ label: 'Aspect', value: S.crop.aspect, tip: 'Lock the crop to a ratio, or Free.', options: ASPECTS, onChange: v => { S.crop.aspect = v; applyAspect(); drawView(); commit(); } });
    return [h('div', { class: 'cr-edit-head' }, h('b', null, 'Crop & rotate')), aspect,
      sl('crop.angle', 'Angle', -45, 45, { step: 0.1, unit: '°', tip: 'Straighten. You can also drag outside the crop box to rotate.' }),
      h('div', { class: 'btn-row wrap', style: { padding: '6px 12px' } },
        btn({ icon: 'sparkle', label: 'Auto straighten', cls: 'solid txt sm', title: 'Auto straighten', tip: 'Finds the horizon or strong verticals and levels them.', onClick: () => { S.crop.angle = Math.round(CR.estimateLevel(src.p.img.data, src.p.w, src.p.h) * 10) / 10; refresh(); requestRender(); commit(); } }),
        btn({ icon: 'undo', label: 'Reset crop', cls: 'solid txt sm', title: 'Reset crop', tip: 'Back to the full frame with no rotation.', onClick: () => { S.crop = { x: 0, y: 0, w: 1, h: 1, angle: 0, aspect: S.crop.aspect }; refresh(); requestRender(); drawView(); commit(); } })),
      h('div', { class: 'hint' }, 'Drag the corners or edges to crop, drag inside to move, drag outside to rotate. The crop applies to the whole image when you press OK.')];
  }
  function removePanel() {
    const save = () => store.set('strata.cr.remove', removeOpt);
    const o = (k, label, min, max, tip) => App.slider({ label, min, max, value: removeOpt[k], def: { size: Math.round(Math.max(FW, FH) / 60), feather: 30, opacity: 100 }[k], tip, onInput: v => { removeOpt[k] = v; save(); drawOverlay(); } });
    return [h('div', { class: 'cr-edit-head' }, h('b', null, 'Remove')),
      h('div', { class: 'ctl' }, h('label', null, 'Type'), App.seg({ value: removeOpt.mode, options: [{ value: 'heal', label: 'Heal', tip: 'Replaces the area with matching texture from nearby, blended seamlessly.' }, { value: 'clone', label: 'Clone', tip: 'Copies another area exactly. Drag the blue source circle to choose where from.' }], onChange: v => { removeOpt.mode = v; save(); } })),
      o('size', 'Size', 1, Math.round(Math.max(FW, FH) / 4), 'Brush size in image pixels ( [ and ] ).'), o('feather', 'Feather', 0, 100, 'Softness of the edge.'), o('opacity', 'Opacity', 1, 100, 'Strength of the fix.'),
      h('div', { class: 'hint' }, `${retouch.spots.length} spot${retouch.spots.length === 1 ? '' : 's'}. Click or paint over a blemish. Click a spot to select it; Delete removes it.`),
      h('div', { class: 'btn-row wrap', style: { padding: '4px 12px' } },
        btn({ icon: 'trash', label: 'Delete selected', cls: 'solid txt sm', title: 'Delete spot', tip: 'Remove the selected spot.', onClick: () => { if (selSpot >= 0) { retouch.spots.splice(selSpot, 1); selSpot = -1; retouchChanged(); commit(); buildPanel(); } } }),
        btn({ icon: 'x', label: 'Clear all', cls: 'solid txt sm', title: 'Clear all spots', tip: 'Remove every spot.', onClick: () => { retouch.spots = []; selSpot = -1; retouchChanged(); commit(); buildPanel(); } }))];
  }
  function redeyePanel() {
    const upd = () => { retouchChanged(); };
    return [h('div', { class: 'cr-edit-head' }, h('b', null, 'Red eye')),
      h('div', { class: 'ctl' }, h('label', null, 'Type'), App.seg({ value: retouch.eyeType, options: [{ value: 'red', label: 'Red eye', tip: 'People photographed with flash.' }, { value: 'pet', label: 'Pet eye', tip: 'The yellow / green glow in animals’ eyes.' }], onChange: v => { retouch.eyeType = v; upd(); commit(); } })),
      App.slider({ label: 'Pupil size', min: 1, max: 100, value: retouch.eyePupil, def: 50, tip: 'Size of the area corrected inside each selection.', onInput: v => { retouch.eyePupil = v; upd(); }, onChange: () => commit() }),
      App.slider({ label: 'Darken', min: 1, max: 100, value: retouch.eyeDarken, def: 50, tip: 'How dark the corrected pupil becomes.', onInput: v => { retouch.eyeDarken = v; upd(); }, onChange: () => commit() }),
      h('div', { class: 'hint' }, `${retouch.eyes.length} eye${retouch.eyes.length === 1 ? '' : 's'} fixed. Drag a box around each eye.`),
      h('div', { class: 'btn-row', style: { padding: '4px 12px' } }, btn({ icon: 'x', label: 'Clear all', cls: 'solid txt sm', title: 'Clear', tip: 'Remove all red-eye fixes.', onClick: () => { retouch.eyes = []; upd(); commit(); buildPanel(); } }))];
  }
  function maskPanel() {
    const add = h('div', { class: 'cr-maskadd' }, ...[['subject', 'select', 'Subject', 'Selects the main subject automatically.'], ['sky', 'sun', 'Sky', 'Selects the sky automatically.'], ['background', 'layers', 'Background', 'Everything except the subject.'], ['brush', 'brush', 'Brush', 'Paint where the adjustment goes (Alt or Erase to remove).'], ['linear', 'gradient', 'Linear gradient', 'A soft transition, e.g. to darken a sky.'], ['radial', 'target', 'Radial gradient', 'An oval area — spotlight a face.'], ['lum', 'contrast', 'Luminance range', 'Only the pixels within a brightness range.']].map(([t, ic, label, tip]) => btn({ icon: ic, label, cls: 'solid txt sm', title: 'New ' + label.toLowerCase() + ' mask', tip, onClick: () => addMask(t) })));
    const list = h('div', { class: 'cr-masklist' }, S.masks.length ? S.masks.map(M => {
      const row = h('div', { class: 'cr-mask' + (M === selMask ? ' on' : ''), role: 'button', tabindex: 0, title: M.name, tip: 'Click to edit this mask’s adjustments.' }, icon({ subject: 'select', sky: 'sun', background: 'layers', brush: 'brush', linear: 'gradient', radial: 'target', lum: 'contrast' }[M.type], 14), h('span', null, M.name),
        btn({ icon: M.hidden ? 'eyeOff' : 'eye', cls: 'sm', title: 'Show / hide', tip: 'Turn this mask’s adjustments on or off.', onClick: e => { e.stopPropagation(); M.hidden = !M.hidden; buildPanel(); requestRender(); } }),
        btn({ icon: 'trash', cls: 'sm', title: 'Delete mask', tip: 'Delete this mask.', onClick: e => { e.stopPropagation(); S.masks.splice(S.masks.indexOf(M), 1); if (selMask === M) selMask = S.masks[0] || null; maskOvCache = null; buildPanel(); requestRender(); drawView(); commit(); } }));
      row.addEventListener('click', () => { selMask = M; maskOvCache = null; buildPanel(); drawView(); });
      return row;
    }) : h('div', { class: 'hint' }, 'No masks yet — create one above.'));
    const out = [h('div', { class: 'cr-edit-head' }, h('b', null, 'Masking')), h('h5', { class: 'fx-head' }, 'Create new mask'), add, h('h5', { class: 'fx-head' }, 'Masks'), list];
    const M = selMask;
    if (M) {
      const msl = (key, label, min, max, tip, o = {}) => App.slider({ label, min, max, step: o.step || 1, value: M[key], def: o.def ?? 0, unit: o.unit, tip, onInput: v => { M[key] = v; maskOvCache = null; drawView(); requestRender(); }, onChange: () => commit() });
      out.push(h('h5', { class: 'fx-head' }, M.name),
        App.toggle({ label: 'Show overlay', value: maskOverlay, tip: 'Tint the masked area red on the preview.', onChange: v => { maskOverlay = v; drawView(); } }),
        App.toggle({ label: 'Invert', value: M.invert, tip: 'Apply the adjustments everywhere except the masked area.', onChange: v => { M.invert = v; maskOvCache = null; drawView(); requestRender(); commit(); } }),
        msl('opacity', 'Amount', 0, 100, 'Overall strength of this mask.', { def: 100, unit: '%' }),
        M.type === 'radial' ? msl('feather', 'Feather', 0, 100, 'Softness of the oval edge.', { def: 50 }) : null,
        M.type === 'radial' ? msl('angle', 'Angle', -90, 90, 'Rotate the oval.', { unit: '°' }) : null,
        M.type === 'lum' ? msl('lo', 'From', 0, 100, 'Darkest brightness included.') : null,
        M.type === 'lum' ? msl('hi', 'To', 0, 100, 'Brightest brightness included.', { def: 100 }) : null,
        M.type === 'lum' ? msl('smooth', 'Smoothness', 0, 100, 'Softness of the range edges.', { def: 20 }) : null);
      if (M.type === 'brush') {
        const save = () => store.set('strata.cr.brush', brushOpt);
        out.push(App.slider({ label: 'Size', min: 1, max: Math.round(Math.max(FW, FH) / 3), value: brushOpt.size, def: Math.round(Math.max(FW, FH) / 30), tip: 'Brush size in image pixels ( [ and ] ).', onInput: v => { brushOpt.size = v; save(); drawOverlay(); } }),
          App.slider({ label: 'Feather', min: 0, max: 100, value: brushOpt.feather, def: 50, tip: 'Softness of the brush edge.', onInput: v => { brushOpt.feather = v; save(); } }),
          App.slider({ label: 'Flow', min: 1, max: 100, value: brushOpt.flow, def: 100, tip: 'How much each stroke adds.', onInput: v => { brushOpt.flow = v; save(); } }),
          App.toggle({ label: 'Erase', value: brushOpt.erase, tip: 'Paint to remove from the mask (or hold Alt while painting).', onChange: v => { brushOpt.erase = v; save(); } }),
          h('div', { class: 'btn-row', style: { padding: '4px 12px' } }, btn({ icon: 'x', label: 'Clear strokes', cls: 'solid txt sm', title: 'Clear strokes', tip: 'Remove all painting from this mask.', onClick: () => { M.strokes = []; M.ver++; maskOvCache = null; requestRender(); drawView(); commit(); } })));
      }
      const L = (key, label, min, max, o = {}) => { const row = App.slider({ label, min, max, step: o.step || 1, value: M.adj[key], def: 0, tip: o.tip, fmt: o.fmt, onInput: v => { M.adj[key] = v; requestRender(); }, onChange: () => commit() }); row.classList.add('cr-sl'); if (o.track) { row.input.classList.add('grad'); row.input.style.setProperty('--track', o.track); } return row; };
      out.push(h('h5', { class: 'fx-head' }, 'Adjustments'),
        L('exposure', 'Exposure', -4, 4, { step: 0.05, track: TRACK.tone, tip: 'Brightness inside the mask.', fmt: v => (+v).toFixed(2) }), L('contrast', 'Contrast', -100, 100, { tip: 'Contrast inside the mask.' }), L('highlights', 'Highlights', -100, 100, { tip: 'Bright areas inside the mask.' }), L('shadows', 'Shadows', -100, 100, { tip: 'Dark areas inside the mask.' }), L('whites', 'Whites', -100, 100, { tip: 'White point inside the mask.' }), L('blacks', 'Blacks', -100, 100, { tip: 'Black point inside the mask.' }),
        L('temp', 'Temperature', -100, 100, { track: TRACK.temp, tip: 'Cooler / warmer inside the mask.' }), L('tint', 'Tint', -100, 100, { track: TRACK.tint, tip: 'Green / magenta inside the mask.' }), L('hue', 'Hue', -100, 100, { track: TRACK.sat, tip: 'Shifts all hues inside the mask.' }), L('saturation', 'Saturation', -100, 100, { track: TRACK.sat, tip: 'Color intensity inside the mask.' }),
        L('texture', 'Texture', -100, 100, { tip: 'Fine detail inside the mask.' }), L('clarity', 'Clarity', -100, 100, { tip: 'Local contrast inside the mask.' }), L('dehaze', 'Dehaze', -100, 100, { tip: 'Removes or adds haze inside the mask.' }), L('sharpness', 'Sharpness', -100, 100, { tip: 'Sharpen (+) or soften (−) inside the mask.' }),
        h('div', { class: 'btn-row', style: { padding: '4px 12px 10px' } }, btn({ icon: 'undo', label: 'Reset adjustments', cls: 'solid txt sm', title: 'Reset', tip: 'Set this mask’s sliders back to zero.', onClick: () => { M.adj = CR.localDefaults(); buildPanel(); requestRender(); commit(); } })));
    }
    return out;
  }
  function presetPanel() {
    const user = store.get('strata.cr.presets', []);
    const all = [...PRESETS, ...user.map(u => ({ ...u, group: 'Your presets', user: true }))];
    const groups = {}; all.forEach(p => (groups[p.group] = groups[p.group] || []).push(p));
    const apply = p => { if (!p.s) Object.assign(S, CR.auto(src.p.img.data, src.p.w, src.p.h)); else merge(S, p.s); hoverS = null; refresh(); requestRender(); commit(); App.toast('Preset: ' + p.name, 'ok', 1500); };
    const out = [h('div', { class: 'cr-edit-head' }, h('b', null, 'Presets'), h('div', { class: 'grow' }), btn({ icon: 'plus', label: 'Create', cls: 'solid txt sm', title: 'Create preset', tip: 'Save the current settings (except retouching and masks) as a preset.', onClick: async () => { const name = await App.prompt('Create preset', 'Preset name', 'My preset'); if (!name) return; const s = deep(S); delete s.masks; delete s.crop; delete s._ca; delete s._air; delete s.off; user.push({ name, s }); store.set('strata.cr.presets', user); buildPanel(); } }))];
    for (const [g, list] of Object.entries(groups)) out.push(App.section(g, null, h('div', { class: 'cr-presets' }, list.map(p => {
      const row = h('div', { class: 'cr-preset', role: 'button', tabindex: 0, title: p.name, tip: (p.tip || 'Your saved preset.') + ' Hover to preview, click to apply.' }, h('span', null, p.name), p.user ? btn({ icon: 'x', cls: 'sm', title: 'Delete preset', tip: 'Delete this preset.', onClick: e => { e.stopPropagation(); user.splice(user.indexOf(user.find(u => u.name === p.name)), 1); store.set('strata.cr.presets', user); buildPanel(); } }) : null);
      row.addEventListener('pointerenter', () => { hoverS = p.s ? merge(deep(S), p.s) : Object.assign(deep(S), CR.auto(src.p.img.data, src.p.w, src.p.h)); version++; renderQ(); });
      row.addEventListener('pointerleave', () => { if (hoverS) { hoverS = null; requestRender(); } });
      row.addEventListener('click', () => apply(p));
      return row;
    })), { id: 'cr-pg-' + g.replace(/\W/g, ''), closed: false }));
    return out;
  }
  function snapshotPanel() {
    const snaps = store.get('strata.cr.snapshots', []);
    return [h('div', { class: 'cr-edit-head' }, h('b', null, 'Snapshots'), h('div', { class: 'grow' }), btn({ icon: 'plus', label: 'Create', cls: 'solid txt sm', title: 'Create snapshot', tip: 'Save the current settings so you can come back to them.', onClick: async () => { const name = await App.prompt('Create snapshot', 'Snapshot name', 'Snapshot ' + (snaps.length + 1)); if (!name) return; snaps.unshift({ name, state: JSON.stringify({ S, retouch }), at: Date.now() }); store.set('strata.cr.snapshots', snaps.slice(0, 40)); buildPanel(); } })),
      snaps.length ? h('div', { class: 'cr-presets' }, snaps.map((sn, i) => { const row = h('div', { class: 'cr-preset', role: 'button', tabindex: 0, title: sn.name, tip: 'Click to load this snapshot.' }, h('span', null, sn.name), btn({ icon: 'x', cls: 'sm', title: 'Delete', tip: 'Delete this snapshot.', onClick: e => { e.stopPropagation(); snaps.splice(i, 1); store.set('strata.cr.snapshots', snaps); buildPanel(); } })); row.addEventListener('click', () => { commit(); undo.push(JSON.stringify({ S, retouch })); restoreState(sn.state); App.toast('Loaded ' + sn.name, 'ok', 1400); }); return row; })) : h('div', { class: 'hint' }, 'No snapshots yet.')];
  }
  const moreMenu = () => [
    { label: 'Reset to default', icon: 'undo', tip: 'Clear every adjustment (keeps nothing).', action: () => { commit(); S = CR.defaults(); retouch = { spots: [], eyes: [], eyePupil: 50, eyeDarken: 50, eyeType: 'red' }; selMask = null; buildPanel(); retouchChanged(); commit(); } },
    { label: 'Previous conversion', icon: 'history', disabled: !store.get('strata.cr.last', null), tip: 'Load the settings you used last time you pressed OK.', action: () => { const l = store.get('strata.cr.last', null); if (!l) return; commit(); S = merge(CR.defaults(), l); buildPanel(); requestRender(); commit(); } },
    { sep: true },
    { label: 'Copy settings', icon: 'copy', tip: 'Copy these settings to paste into another photo.', action: () => { store.set('strata.cr.clip', S); App.toast('Settings copied', 'ok', 1200); } },
    { label: 'Paste settings', icon: 'paste', disabled: !store.get('strata.cr.clip', null), tip: 'Paste settings copied earlier.', action: () => { commit(); S = merge(CR.defaults(), store.get('strata.cr.clip', {})); buildPanel(); requestRender(); commit(); } },
    { sep: true },
    { label: 'Preview quality', icon: 'quality', tip: 'Sharper preview vs. faster updates (reopen Camera Raw to apply).', sub: [['fast', 'Fast'], ['balanced', 'Balanced'], ['high', 'High']].map(([v, l]) => ({ label: l, checked: quality === v, action: () => { store.set('strata.cr.quality', v); App.toast('Preview quality: ' + l + ' — reopen Camera Raw to apply'); } })) },
  ];
  function buildPanel() {
    regs = [];
    const content = tool === 'edit' ? editPanel() : tool === 'crop' ? cropPanel() : tool === 'remove' ? removePanel() : tool === 'mask' ? maskPanel() : tool === 'redeye' ? redeyePanel() : tool === 'presets' ? presetPanel() : snapshotPanel();
    const sc = panel.scrollTop;
    panel.replaceChildren(...content.filter(Boolean));
    panel.scrollTop = sc;
  }

  /* =====================================================================
     Keyboard, modal, finish
     ===================================================================== */
  const onKey = e => {
    if (App.isTyping(e.target) || !md) return;
    const k = App.combo(e);
    const map = {
      e: () => setTool('edit'), c: () => setTool('crop'), b: () => setTool('remove'), m: () => setTool('mask'), 'shift+e': () => setTool('redeye'), 'shift+p': () => setTool('presets'), 'shift+s': () => setTool('snapshots'),
      z: () => setPointer('zoom'), h: () => setPointer('hand'), s: () => setPointer('sampler'), i: () => setPointer('wb'), 'ctrl+shift+g': () => toolBtns.grid.click(),
      'ctrl+z': doUndo, 'ctrl+shift+z': doRedo, 'ctrl+y': doRedo, 'ctrl+0': fit, 'ctrl+alt+0': () => zoomTo(1),
      y: () => viewBtn.click(), p: () => beforeBtn.click(), u: () => clipLoBtn.click(), o: () => clipHiBtn.click(),
      delete: () => { if (tool === 'remove' && selSpot >= 0) { retouch.spots.splice(selSpot, 1); selSpot = -1; retouchChanged(); commit(); buildPanel(); } else if (tool === 'mask' && selMask) { S.masks.splice(S.masks.indexOf(selMask), 1); selMask = S.masks[0] || null; buildPanel(); requestRender(); drawView(); commit(); } },
      '[': () => { if (tool === 'remove') { removeOpt.size = Math.max(1, Math.round(removeOpt.size / 1.15)); buildPanel(); drawOverlay(); } else if (selMask && selMask.type === 'brush') { brushOpt.size = Math.max(1, Math.round(brushOpt.size / 1.15)); buildPanel(); drawOverlay(); } },
      ']': () => { if (tool === 'remove') { removeOpt.size = Math.round(removeOpt.size * 1.15) + 1; buildPanel(); drawOverlay(); } else if (selMask && selMask.type === 'brush') { brushOpt.size = Math.round(brushOpt.size * 1.15) + 1; buildPanel(); drawOverlay(); } },
    };
    map.backspace = map.delete;
    if (k === 'space') { e.preventDefault(); e.stopPropagation(); spaceDown = true; stage.dataset.pointer = 'hand'; return; }
    if (map[k]) { e.preventDefault(); e.stopPropagation(); map[k](); }
  };
  const onKeyUp = e => { if (e.key === ' ') { spaceDown = false; stage.dataset.pointer = pointerMode || tool; } };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKeyUp, true);
  const ro = new ResizeObserver(() => { fit(); drawHist(); curveDraw && curveDraw(); });

  const finish = async () => {
    commit();
    store.set('strata.cr.last', (() => { const s = deep(S); delete s.masks; delete s._ca; delete s._air; delete s.off; return s; })());
    I.busy(true, 'Camera Raw — rendering full size…');
    try {
      // full-resolution source (with retouching) to the worker, render in tiles
      const fimg = X.read(retouch.spots.length || retouch.eyes.length ? applyRetouch(F.clone(full)) : full);
      engine.setSrc('f', fimg);
      const Sx = deep(S); if (Sx.removeCA) Sx._ca = S._ca || CR.estimateCA(src.p.img.data, src.p.w, src.p.h); if (Sx.dehaze) Sx._air = S._air || CR.estimateAir(src.p.img.data, src.p.w, src.p.h);
      const r = await engine.call('final', 'f', Sx, aux('final'), p => I.busy(true, `Camera Raw — rendering ${Math.round(p * 100)}%`));
      const outCv = App.canvas(r.w, r.h); outCv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.buf), r.w, r.h), 0, 0);
      if (bridge()) worker.postMessage({ type: 'drop', id: 'f' });
      I.writeTarget(tgt, I.maskWithSel(full, outCv), 'Camera Raw Filter', 'camera');
      const c = S.crop;
      if (c.w < 0.999 || c.h < 0.999 || c.x > 0.001 || c.y > 0.001) { const cw = Math.max(1, Math.round(c.w * FW)), ch = Math.max(1, Math.round(c.h * FH)); I.resizeCanvas(cw, ch, -Math.round(c.x * FW), -Math.round(c.y * FH), 'Camera Raw crop'); I.fit(); }
    } catch (e) { console.error(e); App.toast('Camera Raw failed: ' + e.message, 'err', 6000); }
    finally { I.busy(false); }
  };
  md = App.modal({ title: 'Camera Raw · ' + (I.doc.name || 'Image') + (tgt.mask ? ' (mask)' : ''), icon: 'camera', width: Math.min(1720, innerWidth - 24), cls: 'cr-modal', body,
    left: h('div', { class: 'btn-row' }, btn({ icon: 'undo', cls: 'sm', title: 'Undo', key: 'Ctrl+Z', tip: 'Undo inside Camera Raw.', onClick: doUndo }), btn({ icon: 'redo', cls: 'sm', title: 'Redo', key: 'Ctrl+Shift+Z', tip: 'Redo.', onClick: doRedo }), h('span', { class: 'hint', style: { padding: '0 8px' } }, `${FW} × ${FH} px`)),
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, tip: 'Render at full resolution and apply to the layer (Ctrl+Z undoes it).', onClick: () => { finish(); } }],
    onClose: () => { ro.disconnect(); document.removeEventListener('keydown', onKey, true); document.removeEventListener('keyup', onKeyUp, true); clearTimeout(pTimer); clearTimeout(retouchTimer); md = null; } });
  setTool('edit');
  ro.observe(stage);
  requestAnimationFrame(() => { fit(); requestRender(); });
  I.cameraRaw._debug = { get S() { return S; }, set S(v) { S = v; }, requestRender, refresh, buildPanel, setTool, addMask, retouch: () => retouch, retouchChanged, finish, get last() { return last; }, get shown() { return shownKind; } };
  return md;
};
})();
