/* Image editor — Photoshop-style Filter menu (Blur, Blur Gallery, Distort, Noise, Pixelate, Render, Sharpen,
   Stylize, Video, Other, Lens Correction, Adaptive Wide Angle, Smart Denoise…) and extra Image ▸ Adjustments.
   Every filter is a parameter list + a run(src, vals) → canvas function; I.fxDialog gives it a live preview. */
(() => {
'use strict';
const App = window.App, F = App.IF, X = F.X, I = App.I;
const { h } = App;
const clamp = X.clamp, rd = X.read, tc = X.toCanvas, PI = Math.PI;
const smooth = (a, b, x) => { const t = clamp((x - a) / ((b - a) || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
const prim = () => X.hex(I.primary), sec = () => X.hex(I.secondary);

/* ---------- parameter shorthands ---------- */
const sl = (id, label, min, max, def, tip, o = {}) => ({ id, label, min, max, def, tip, ...o });
const sel = (id, label, options, def, tip) => ({ id, type: 'select', label, options, def, tip });
const tg = (id, label, def, tip) => ({ id, type: 'toggle', label, def, tip });
const col = (id, label, def, tip) => ({ id, type: 'color', label, def, tip });
const pt = (id, label, def = [0.5, 0.5], tip) => ({ id, type: 'point', label, def, tip });
const head = label => ({ type: 'head', label });
const seedBtn = { type: 'button', label: 'Randomize', icon: 'dice', tip: 'Try a different random pattern.', onClick: v => { v.seed = (Math.random() * 1e6) | 0; } };
const EDGE = sel('edge', 'Undefined areas', [['clamp', 'Repeat edge pixels'], ['wrap', 'Wrap around'], ['none', 'Transparent']], 'clamp', 'What fills pixels that come from outside the image.');

/* =====================================================================
   Filter implementations
   ===================================================================== */
const imgOp = fn => s => tc(fn(rd(s)));
const centerOf = (v, w, h, k = 'center') => [(v[k] ? v[k][0] : 0.5) * w, (v[k] ? v[k][1] : 0.5) * h];
/** canvas-accumulated multi-copy blur (spin / zoom), cheap on the GPU */
function multiCopy(s, n, place) {
  const c = App.canvas(s.width, s.height), x = c.getContext('2d');
  for (let i = 0; i < n; i++) { x.save(); x.globalAlpha = 1 / (i + 1); place(x, n > 1 ? i / (n - 1) : 0); x.drawImage(s, 0, 0); x.restore(); }
  return c;
}
const spin = (s, cx, cy, deg, n) => multiCopy(s, n, (x, t) => { x.translate(cx, cy); x.rotate((t - 0.5) * deg * PI / 180); x.translate(-cx, -cy); });
const zoom = (s, cx, cy, amt, n) => multiCopy(s, n, (x, t) => { const k = 1 + t * amt; x.translate(cx, cy); x.scale(k, k); x.translate(-cx, -cy); });
const blend = (a, b, m) => { const A = rd(a), B = rd(b), o = new ImageData(A.width, A.height), od = o.data, ad = A.data, bd = B.data; for (let j = 0, i = 0; j < m.length; j++, i += 4) { const t = m[j]; for (let c = 0; c < 4; c++) od[i + c] = ad[i + c] + (bd[i + c] - ad[i + c]) * t; } return tc(o); };
const noisePlane = (n, amt, gauss, seed = 11) => { const r = X.rng(seed), p = new Float32Array(n); for (let i = 0; i < n; i++) p[i] = gauss ? X.gauss(r) * amt * 0.6 : (r() - 0.5) * 2 * amt; return p; };
function addNoise(img, amount, gauss, mono, seed = 5) {
  const { data: d } = img, n = d.length / 4, a = amount / 100 * 128, r = X.rng(seed);
  const nz = () => (gauss ? X.gauss(r) * a * 0.6 : (r() - 0.5) * 2 * a);
  for (let i = 0; i < d.length; i += 4) { if (mono) { const q = nz(); d[i] += q; d[i + 1] += q; d[i + 2] += q; } else { d[i] += nz(); d[i + 1] += nz(); d[i + 2] += nz(); } }
  return img;
}

/* ---------- blur ---------- */
function average(s) {
  const a = rd(s), d = a.data, sm = I.sel ? rd(I.sel.mask).data : null;
  let r = 0, g = 0, b = 0, t = 0;
  for (let i = 0; i < d.length; i += 4) { const wt = d[i + 3] * (sm ? sm[i + 3] / 255 : 1); r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; t += wt; }
  if (t) for (let i = 0; i < d.length; i += 4) { d[i] = r / t; d[i + 1] = g / t; d[i + 2] = b / t; }
  return tc(a);
}
function lensBlur(s, v) {
  const r = v.radius;
  if (r < 0.5) return F.clone(s);
  const w = s.width, h = s.height;
  let out;
  if (v.depth === 'none') {
    const k = Math.min(1, 9 / r), small = k < 1 ? X.scaled(s, k) : s;
    const b = tc(X.bokehBlur(rd(small), r * k, { blades: +v.shape, rotation: v.rotation * PI / 180, boost: v.bright / 100, threshold: v.thresh }));
    out = k < 1 ? X.resizeTo(b, w, h) : b;
  } else {
    const n = w * h, depth = new Float32Array(n), L = I.active();
    if (v.depth === 'mask' && L.mask) { const md = rd(L.mask).data; for (let j = 0; j < n; j++) depth[j] = md[j * 4 + 3]; }
    else if (v.depth === 'top') for (let y = 0; y < h; y++) depth.fill((1 - y / h) * 255, y * w, (y + 1) * w);
    else for (let y = 0; y < h; y++) depth.fill(y / h * 255, y * w, (y + 1) * w);
    const rad = new Float32Array(n);
    for (let j = 0; j < n; j++) { let dd = depth[j]; if (v.invert) dd = 255 - dd; rad[j] = r * Math.abs(dd - v.focal) / 255; }
    out = tc(X.varBlur(rd(s), rad, r, { bokeh: v.bright / 100, threshold: v.thresh }));
  }
  if (v.noise) { const o = rd(out); addNoise(o, v.noise / 4, v.dist === 'gauss', v.mono); out = tc(o); }
  return out;
}
function smartBlur(s, v) {
  const img = rd(s), w = img.width, hh = img.height;
  const sm = X.surface(img, v.radius, v.threshold * 2.55, true);
  if (v.mode === 'normal') return tc(sm);
  const e = X.sobel(X.lum(img.data, w * hh), w, hh).mag, t = 0.04 + (100 - v.threshold) / 100 * 0.12, o = v.mode === 'edge' ? new ImageData(w, hh) : sm, od = o.data;
  for (let j = 0; j < w * hh; j++) { const on = e[j] > t; if (v.mode === 'edge') { od[j * 4] = od[j * 4 + 1] = od[j * 4 + 2] = on ? 255 : 0; od[j * 4 + 3] = 255; } else if (on) od[j * 4] = od[j * 4 + 1] = od[j * 4 + 2] = 255; }
  return tc(o);
}
/* ---------- blur gallery ---------- */
const BOKEH = [head('Bokeh'), sl('bokeh', 'Light bokeh', 0, 100, 0, 'Makes bright spots in the blurred area bloom into glowing discs, like a fast lens.', { unit: '%' }), sl('thresh', 'Light range', 120, 254, 200, 'How bright a spot must be to become a bokeh highlight.')];
function gallery(s, v, radiusAt) {
  const w = s.width, hh = s.height, n = w * hh, rad = new Float32Array(n);
  for (let y = 0, j = 0; y < hh; y++) for (let x = 0; x < w; x++, j++) rad[j] = radiusAt(x + 0.5, y + 0.5);
  return tc(X.varBlur(rd(s), rad, Math.max(0.5, v.blur, v.blur2 || 0), { bokeh: (v.bokeh || 0) / 100, threshold: v.thresh || 200 }));
}
const fieldBlur = (s, v) => { const w = s.width, hh = s.height, D = Math.hypot(w, hh), [ax, ay] = centerOf(v, w, hh, 'p1'), [bx, by] = centerOf(v, w, hh, 'p2'); return gallery(s, { ...v, blur: Math.max(v.blur, v.blur2) }, (x, y) => { const wa = 1 / (((x - ax) ** 2 + (y - ay) ** 2) / (D * D) + 1e-4), wb = 1 / (((x - bx) ** 2 + (y - by) ** 2) / (D * D) + 1e-4); return (v.blur * wa + v.blur2 * wb) / (wa + wb); }); };
const irisBlur = (s, v) => { const w = s.width, hh = s.height, [cx, cy] = centerOf(v, w, hh), a = v.angle * PI / 180, ca = Math.cos(a), sa = Math.sin(a), rx = v.sx / 100 * w / 2, ry = v.sy / 100 * hh / 2, f = v.feather / 100; return gallery(s, v, (x, y) => { const dx = x - cx, dy = y - cy, u = (dx * ca + dy * sa) / rx, q = (-dx * sa + dy * ca) / ry; return v.blur * smooth(f, 1, Math.hypot(u, q)); }); };
const tiltShift = (s, v) => { const w = s.width, hh = s.height, [cx, cy] = centerOf(v, w, hh), a = v.angle * PI / 180, nx = -Math.sin(a), ny = Math.cos(a), f = v.focus / 100 * hh, t = v.transition / 100 * hh; return gallery(s, v, (x, y) => v.blur * smooth(f, f + t, Math.abs((x - cx) * nx + (y - cy) * ny))); };
function spinBlur(s, v) {
  const w = s.width, hh = s.height, [cx, cy] = centerOf(v, w, hh), R = v.radius / 100 * Math.min(w, hh) / 2, f = v.feather / 100, n = w * hh, m = new Float32Array(n);
  for (let y = 0, j = 0; y < hh; y++) for (let x = 0; x < w; x++, j++) m[j] = 1 - smooth(1 - f, 1, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R);
  return blend(s, spin(s, cx, cy, v.angle, Math.min(64, 12 + Math.round(v.angle))), m);
}

/* ---------- distort ---------- */
function polar(s, v) {
  const w = s.width, hh = s.height, cx = w / 2, cy = hh / 2;
  if (v.mode === 'toP') return X.warp(s, (x, y, p) => { const dx = (x - cx) / cx, dy = (y - cy) / cy, r = Math.hypot(dx, dy), a = Math.atan2(dx, -dy); p[0] = ((a / (2 * PI)) + 1) % 1 * w; p[1] = r * hh; }, 'wrap');
  return X.warp(s, (x, y, p) => { const a = x / w * 2 * PI, r = y / hh; p[0] = cx + Math.sin(a) * r * cx; p[1] = cy - Math.cos(a) * r * cy; }, 'clamp');
}
function radialWarp(s, v, fn, edge = 'clamp') {
  const w = s.width, hh = s.height, [cx, cy] = centerOf(v, w, hh), R = Math.min(w, hh) / 2;
  return X.warp(s, (x, y, p) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); if (r >= R || r < 1e-6) return; const k = fn(r / R, Math.atan2(dy, dx), dx, dy); if (k.length === 2) { p[0] = cx + k[0]; p[1] = cy + k[1]; } }, edge);
}
const pinch = (s, v) => { const kk = v.amount / 100; return radialWarp(s, v, (t, a, dx, dy) => { const f = Math.pow(Math.sin(PI / 2 * t), -kk * 0.8) ; const ff = f * (1 - Math.pow(t, 6)) + Math.pow(t, 6); return [dx * ff, dy * ff]; }); };
const twirl = (s, v) => radialWarp(s, v, (t, a, dx, dy) => { const r = Math.hypot(dx, dy), b = a + v.angle * PI / 180 * (1 - t) * (1 - t); return [Math.cos(b) * r, Math.sin(b) * r]; });
function spherize(s, v) {
  const w = s.width, hh = s.height, [cx, cy] = centerOf(v, w, hh), rx = v.mode === 'v' ? Infinity : w / 2, ry = v.mode === 'h' ? Infinity : hh / 2, k = v.amount / 100;
  return X.warp(s, (x, y, p) => {
    const u = (x - cx) / rx, q = (y - cy) / ry, t = Math.hypot(u, q);
    if (t >= 1 || t < 1e-6) return;
    const ts = k >= 0 ? t + (2 / PI * Math.asin(t) - t) * k : t + (Math.sin(t * PI / 2) - t) * -k;
    const f = ts / t;
    p[0] = cx + (x - cx) * (v.mode === 'v' ? 1 : f); p[1] = cy + (y - cy) * (v.mode === 'h' ? 1 : f);
  });
}
function zigzag(s, v) {
  const a = v.amount / 100, n = v.ridges;
  return radialWarp(s, v, (t, ang, dx, dy) => {
    const r = Math.hypot(dx, dy), wave = Math.sin(2 * PI * n * t) * (1 - t);
    if (v.style === 'around') { const b = ang + a * wave * 0.6; return [Math.cos(b) * r, Math.sin(b) * r]; }
    const rr = r + a * wave * r * 0.18 * (v.style === 'pond' ? 1.6 : 1);
    const b = v.style === 'pond' ? ang + a * wave * 0.15 : ang;
    return [Math.cos(b) * rr, Math.sin(b) * rr];
  });
}
const ripple = (s, v) => { const L = { s: 8, m: 16, l: 32 }[v.size], A = v.amount / 100 * L * 0.35; return X.warp(s, (x, y, p) => { p[0] = x + A * Math.sin(2 * PI * y / L); p[1] = y + A * Math.sin(2 * PI * x / L * 0.9); }, v.edge); };
const shear = (s, v) => { const w = s.width, hh = s.height, A = v.amount / 100; return X.warp(s, (x, y, p) => { if (v.dir === 'h') p[0] = x - A * w * 0.5 * Math.sin(PI * y / hh); else p[1] = y - A * hh * 0.5 * Math.sin(PI * x / w); }, v.edge); };
function wave(s, v) {
  const w = s.width, hh = s.height, r = X.rng(v.seed || 1), waves = [];
  for (let i = 0; i < v.gens; i++) waves.push({ L: v.wlMin + r() * Math.max(0, v.wlMax - v.wlMin), A: v.ampMin + r() * Math.max(0, v.ampMax - v.ampMin), ph: r() * 2 * PI, ang: r() * 2 * PI });
  const shape = t => v.type === 'tri' ? 2 / PI * Math.asin(Math.sin(t)) : v.type === 'sq' ? Math.sign(Math.sin(t)) : Math.sin(t);
  const sx = v.scaleH / 100 / Math.max(1, v.gens) * 1.6, sy = v.scaleV / 100 / Math.max(1, v.gens) * 1.6;
  return X.warp(s, (x, y, p) => { let dx = 0, dy = 0; for (const q of waves) { const ph = (x * Math.cos(q.ang) + y * Math.sin(q.ang)) / q.L * 2 * PI + q.ph; dx += shape(ph) * q.A; dy += shape(ph + 1.3) * q.A; } p[0] = x + dx * sx; p[1] = y + dy * sy; }, v.edge);
}
function displace(s, v) {
  const w = s.width, hh = s.height, n = w * hh;
  const M = v.map === 'lum' ? X.gaussPlane(X.lum(rd(s).data, n), w, hh, v.detail / 8).map(q => q / 255) : X.fractal(w, hh, v.detail, 4, v.seed || 9);
  const ax = v.h / 100 * 128, ay = v.v / 100 * 128;
  return X.warp(s, (x, y, p) => { const m = M[(Math.min(hh - 1, y | 0)) * w + Math.min(w - 1, x | 0)] - 0.5; p[0] = x + m * 2 * ax; p[1] = y + m * 2 * ay; }, v.edge);
}

/* ---------- noise ---------- */
function dust(s, v) {
  const a = rd(s), m = X.median(a, v.radius), ad = a.data, md = m.data;
  for (let i = 0; i < ad.length; i += 4) for (let c = 0; c < 3; c++) if (Math.abs(ad[i + c] - md[i + c]) > v.threshold) ad[i + c] = md[i + c];
  return tc(a);
}
function bigMedian(s, r) { if (r <= 12) return tc(X.median(rd(s), r)); const k = 12 / r, sm = X.scaled(s, k); return X.resizeTo(tc(X.median(rd(sm), 12)), s.width, s.height); }
function despeckle(s) {
  const a = rd(s), w = a.width, hh = a.height, m = X.median(a, 1), e = X.sobel(X.lum(a.data, w * hh), w, hh).mag, ad = a.data, md = m.data;
  for (let j = 0, i = 0; j < w * hh; j++, i += 4) { const k = clamp(1 - e[j] * 6, 0, 1); for (let c = 0; c < 3; c++) ad[i + c] += (md[i + c] - ad[i + c]) * k; }
  return tc(a);
}
/** Edge-aware denoise with a guided filter (luminance-guided, so edges stay crisp) plus chroma smoothing */
function guidedDenoise(img, strength, chroma, detail) {
  const { width: w, height: hh, data: d } = img, n = w * hh;
  const Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
  for (let j = 0, i = 0; j < n; j++, i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; Y[j] = 0.299 * r + 0.587 * g + 0.114 * b; Cb[j] = b - Y[j]; Cr[j] = r - Y[j]; }
  const rad = Math.max(1, Math.round(1 + strength * 0.35)), eps = Math.pow(4 + strength * 5.5, 2);
  const mI = X.boxPlane(Y, w, hh, rad), II = new Float32Array(n); for (let j = 0; j < n; j++) II[j] = Y[j] * Y[j];
  const mII = X.boxPlane(II, w, hh, rad), A = new Float32Array(n), B = new Float32Array(n);
  for (let j = 0; j < n; j++) { const vr = mII[j] - mI[j] * mI[j], a = vr / (vr + eps); A[j] = a; B[j] = mI[j] * (1 - a); }
  const mA = X.boxPlane(A, w, hh, rad), mB = X.boxPlane(B, w, hh, rad), keep = detail / 100;
  const cr = 0.5 + chroma / 100 * 6, Cb2 = X.gaussPlane(Cb, w, hh, cr), Cr2 = X.gaussPlane(Cr, w, hh, cr);
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    const y = (mA[j] * Y[j] + mB[j]) * (1 - keep * 0.5) + Y[j] * keep * 0.5, cb = Cb2[j], crr = Cr2[j];
    const r = y + crr, b = y + cb, g = (y - 0.299 * r - 0.114 * b) / 0.587;
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  return img;
}
/** multi-scale detail enhancement with halo suppression (clamps to the local min/max) */
function enhanceDetail(img, amount, fine, noise) {
  const { width: w, height: hh, data: d } = img, n = w * hh, Y = X.lum(d, n);
  const b1 = X.gaussPlane(Y, w, hh, 0.8 + fine / 100), b2 = X.gaussPlane(Y, w, hh, 2.5 + fine / 40);
  const mx = X.boxPlane(Y, w, hh, 1), a = amount / 100, thr = noise / 100 * 6;
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    let det = (Y[j] - b1[j]) * 1.4 + (b1[j] - b2[j]) * 0.8;
    if (Math.abs(det) < thr) det *= Math.abs(det) / thr;
    let ny = Y[j] + det * a * 1.6;
    const lo = Math.min(Y[j], mx[j]) - 24, hi = Math.max(Y[j], mx[j]) + 24; ny = clamp(ny, lo, hi);
    const k = Y[j] > 0.5 ? ny / Y[j] : 1, add = ny - Y[j];
    for (let c = 0; c < 3; c++) d[i + c] = Y[j] > 20 ? d[i + c] * k : d[i + c] + add;
  }
  return img;
}

/* ---------- pixelate ---------- */
function colorHalftone(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, R = Math.max(2, v.radius), cell = R * 2, out = new ImageData(w, hh), o = out.data;
  const angs = [v.c, v.m, v.y, v.k].map(q => q * PI / 180);
  // ink coverage of channel c (0 C, 1 M, 2 Y, 3 K) at pixel offset i
  const cov = (i, c) => { const mx = Math.max(d[i], d[i + 1], d[i + 2]) / 255, k = 1 - mx; if (c === 3) return k; if (k >= 0.999) return 0; return (1 - d[i + c] / 255 - k) / (1 - k); };
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const ink = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const ca = Math.cos(angs[c]), sa = Math.sin(angs[c]), u = x * ca + y * sa, q = -x * sa + y * ca;
      const cu = (Math.floor(u / cell) + 0.5) * cell, cq = (Math.floor(q / cell) + 0.5) * cell;
      const sx = clamp(Math.round(cu * ca - cq * sa), 0, w - 1), sy = clamp(Math.round(cu * sa + cq * ca), 0, hh - 1);
      const dist = Math.hypot(u - cu, q - cq), rr = Math.sqrt(Math.max(0, cov((sy * w + sx) * 4, c))) * R * 1.414;
      ink[c] = clamp(rr - dist + 0.5, 0, 1);
    }
    const i = (y * w + x) * 4;
    o[i] = 255 * (1 - ink[0]) * (1 - ink[3]); o[i + 1] = 255 * (1 - ink[1]) * (1 - ink[3]); o[i + 2] = 255 * (1 - ink[2]) * (1 - ink[3]); o[i + 3] = d[i + 3];
  }
  return tc(out);
}
function crystallize(s, v) {
  const a = rd(s), w = a.width, hh = a.height, vo = X.voronoi(w, hh, v.size, v.seed || 3), cc = X.cellColors(a.data, vo.cell, vo.count, w * hh), o = a.data;
  for (let j = 0, i = 0; j < w * hh; j++, i += 4) { const k = vo.cell[j] * 4; o[i] = cc[k]; o[i + 1] = cc[k + 1]; o[i + 2] = cc[k + 2]; }
  return tc(a);
}
function pointillize(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, c = App.canvas(w, hh), x = c.getContext('2d'), r = X.rng(v.seed || 4), [br, bg, bb] = sec();
  x.fillStyle = `rgb(${br},${bg},${bb})`; x.fillRect(0, 0, w, hh);
  const step = v.size * 0.75;
  for (let gy = 0; gy < hh + step; gy += step) for (let gx = 0; gx < w + step; gx += step) {
    const px = gx + (r() - 0.5) * step, py = gy + (r() - 0.5) * step, i = (clamp(Math.round(py), 0, hh - 1) * w + clamp(Math.round(px), 0, w - 1)) * 4;
    const j = (q) => clamp(d[i + q] + (r() - 0.5) * 40, 0, 255);
    x.fillStyle = `rgb(${j(0)},${j(1)},${j(2)})`; x.beginPath(); x.arc(px, py, v.size * (0.45 + r() * 0.2), 0, 7); x.fill();
  }
  return c;
}
function mezzotint(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, n = w * hh, r = X.rng(7), t = v.type;
  let N = new Float32Array(n); for (let j = 0; j < n; j++) N[j] = r() * 255;
  const blur = { fine: 0, medium: 0.7, grainy: 0.4, coarse: 1.6 }[t];
  if (blur) { N = X.gaussPlane(N, w, hh, blur); let mn = 255, mx = 0; for (const q of N) { if (q < mn) mn = q; if (q > mx) mx = q; } for (let j = 0; j < n; j++) N[j] = (N[j] - mn) / (mx - mn + 1e-6) * 255; }
  const len = { shortl: 4, mediuml: 9, longl: 18, shorts: 4, mediums: 9, longs: 18 }[t];
  if (len) { const diag = t.endsWith('s'), M = new Float32Array(n); for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { let q = 0; for (let k = -len; k <= len; k++) q += N[clamp(y + (diag ? k : 0), 0, hh - 1) * w + clamp(x + k, 0, w - 1)]; M[y * w + x] = q / (2 * len + 1); } let mn = 255, mx = 0; for (const q of M) { if (q < mn) mn = q; if (q > mx) mx = q; } for (let j = 0; j < n; j++) N[j] = (M[j] - mn) / (mx - mn + 1e-6) * 255; }
  for (let j = 0, i = 0; j < n; j++, i += 4) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] > N[j] ? 255 : 0;
  return tc(a);
}
function fragment(s) { const c = App.canvas(s.width, s.height), x = c.getContext('2d'); [[-4, -4], [4, -4], [-4, 4], [4, 4]].forEach(([dx, dy], i) => { x.globalAlpha = 1 / (i + 1); x.drawImage(s, dx, dy); }); return c; }
const facet = s => { const a = rd(s); return tc(X.surface(X.surface(a, 3, 22, true), 2, 30, true)); };

/* ---------- render ---------- */
function clouds(s, v, diff) {
  const w = s.width, hh = s.height, N = X.fractal(w, hh, Math.max(w, hh) / 4, 8, v.seed || ((Math.random() * 1e6) | 0), 0.55), A = prim(), B = sec(), a = rd(s), d = a.data;
  let mn = 1, mx = 0; for (const q of N) { if (q < mn) mn = q; if (q > mx) mx = q; }
  for (let j = 0, i = 0; j < w * hh; j++, i += 4) { const t = (N[j] - mn) / (mx - mn + 1e-6); for (let c = 0; c < 3; c++) { const val = A[c] + (B[c] - A[c]) * t; d[i + c] = diff ? Math.abs(d[i + c] - val) : val; } if (!diff) d[i + 3] = 255; }
  return tc(a);
}
function fibers(s, v) {
  const w = s.width, hh = s.height, n = w * hh, r = X.rng(v.seed || 2), A = prim(), B = sec(), a = rd(s), d = a.data;
  const col = new Float32Array(w); for (let x = 0; x < w; x++) col[x] = r();
  const N = new Float32Array(n), stretch = v.strength * 6;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) N[y * w + x] = col[x] + (r() - 0.5) * 0.3;
  const sm = X.boxPlane(N, w, hh, 0), V = new Float32Array(n);
  for (let x = 0; x < w; x++) { let acc = 0; for (let y = 0; y < hh; y++) { acc = acc * (1 - 1 / stretch) + sm[y * w + x] / stretch; V[y * w + x] = acc; } }
  let mn = 1e9, mx = -1e9; for (const q of V) { if (q < mn) mn = q; if (q > mx) mx = q; }
  const g = v.variance / 16;
  for (let j = 0, i = 0; j < n; j++, i += 4) { const t = clamp(((V[j] - mn) / (mx - mn + 1e-6) - 0.5) * g + 0.5, 0, 1); X.duo(d, i, t, A, B); d[i + 3] = 255; }
  return tc(a);
}
function lensFlare(s, v) {
  const w = s.width, hh = s.height, c = F.clone(s), x = c.getContext('2d'), [fx, fy] = centerOf(v, w, hh), D = Math.hypot(w, hh), b = v.brightness / 100;
  const lens = { zoom: { halo: 0.16, streak: 1, ghosts: 7, tint: [255, 210, 160] }, p35: { halo: 0.1, streak: 0.6, ghosts: 4, tint: [255, 230, 200] }, p105: { halo: 0.2, streak: 0.4, ghosts: 3, tint: [255, 240, 220] }, movie: { halo: 0.12, streak: 2.2, ghosts: 5, tint: [150, 200, 255] } }[v.lens];
  x.globalCompositeOperation = 'screen';
  const glow = (cx, cy, r, rgb, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
  glow(fx, fy, D * 0.04 * b, '255,255,255', Math.min(1, b));
  glow(fx, fy, D * 0.12 * b, lens.tint.join(','), 0.55 * Math.min(1, b));
  x.strokeStyle = `rgba(${lens.tint.join(',')},${0.18 * Math.min(1, b)})`; x.lineWidth = D * 0.004; x.beginPath(); x.arc(fx, fy, D * lens.halo, 0, 7); x.stroke();
  const sw = D * 0.5 * lens.streak * b, sg = x.createLinearGradient(fx - sw, fy, fx + sw, fy);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, `rgba(${lens.tint.join(',')},${0.5 * Math.min(1, b)})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = sg; x.fillRect(fx - sw, fy - D * 0.002, sw * 2, D * 0.004);
  const cx = w / 2, cy = hh / 2, cols = ['120,180,255', '255,150,90', '140,255,170', '255,120,200', '200,170,255', '255,230,120', '120,255,240'];
  for (let i = 0; i < lens.ghosts; i++) { const t = -0.4 - i * 0.32, gx = fx + (cx - fx) * (1 - t) * 1.0, gy = fy + (cy - fy) * (1 - t); glow(gx + (cx - fx) * i * 0.15, gy + (cy - fy) * i * 0.15, D * (0.012 + (i % 3) * 0.018) * b, cols[i % cols.length], 0.35); }
  x.globalCompositeOperation = 'destination-in'; x.drawImage(s, 0, 0);
  return c;
}
function lighting(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, n = w * hh, [lx, ly] = centerOf(v, w, hh), [cr, cg, cb] = X.hex(v.color).map(q => q / 255);
  const Y = X.gaussPlane(X.lum(d, n), w, hh, 1), H = v.height / 100 * 6, R = v.radius / 100 * Math.hypot(w, hh), I0 = v.intensity / 100, amb = 0.25 + v.ambience / 200, gl = v.gloss / 100;
  for (let y = 0, j = 0, i = 0; y < hh; y++) for (let x = 0; x < w; x++, j++, i += 4) {
    let nx = 0, ny = 0;
    if (v.bump) { nx = -(Y[y * w + Math.min(w - 1, x + 1)] - Y[y * w + Math.max(0, x - 1)]) / 255 * H; ny = -(Y[Math.min(hh - 1, y + 1) * w + x] - Y[Math.max(0, y - 1) * w + x]) / 255 * H; }
    const nl = 1 / Math.hypot(nx, ny, 1);
    let dx, dy, dz, att;
    if (v.type === 'dir') { dx = lx - w / 2; dy = ly - hh / 2; dz = Math.min(w, hh) * 0.5; att = 1; }
    else { dx = lx - x; dy = ly - y; dz = Math.min(w, hh) * 0.35; const dist = Math.hypot(dx, dy); att = v.type === 'spot' ? clamp(1 - dist / R, 0, 1) ** 1.4 : clamp(1 - (dist / (R * 1.6)) ** 2, 0, 1); }
    const dl = 1 / Math.hypot(dx, dy, dz), ndl = Math.max(0, (nx * dx + ny * dy + dz) * nl * dl);
    const spec = gl > 0 ? Math.pow(Math.max(0, ndl), 24) * gl : 0, lit = amb + ndl * I0 * att;
    d[i] = d[i] * lit * (cr * 0.8 + 0.2) + spec * 255 * att; d[i + 1] = d[i + 1] * lit * (cg * 0.8 + 0.2) + spec * 255 * att; d[i + 2] = d[i + 2] * lit * (cb * 0.8 + 0.2) + spec * 255 * att;
  }
  return tc(a);
}

/* ---------- sharpen ---------- */
const conv3 = (k, s) => tc(X.convolve(rd(s), k, 3, 1, 0));
function smartSharpen(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, n = w * hh, Y = X.lum(d, n);
  let base;
  if (v.remove === 'motion') { const m = rd(F.motionBlur(s, { angle: v.angle, distance: Math.max(2, v.radius * 4) })); base = X.lum(m.data, n); }
  else base = X.gaussPlane(Y, w, hh, v.remove === 'lens' ? v.radius * 0.7 : v.radius);
  const nz = v.noise / 100 * 9;   // detail smaller than this (grain) is faded out instead of sharpened
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    let det = Y[j] - base[j]; if (nz > 0 && Math.abs(det) < nz) det *= Math.abs(det) / nz;
    const L = Y[j] / 255, fade = 1 - (v.shadowFade / 100) * clamp(1 - L * 3, 0, 1) - (v.highFade / 100) * clamp(L * 3 - 2, 0, 1);
    const add = det * v.amount / 100 * fade;
    d[i] += add; d[i + 1] += add; d[i + 2] += add;
  }
  return tc(a);
}

/* ---------- stylize ---------- */
function diffuse(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, out = new Uint8ClampedArray(d), r = X.rng(3), Y = X.lum(d, w * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    let sx, sy;
    if (v.mode === 'aniso') { const gx = Y[y * w + Math.min(w - 1, x + 1)] - Y[y * w + Math.max(0, x - 1)], gy = Y[Math.min(hh - 1, y + 1) * w + x] - Y[Math.max(0, y - 1) * w + x], m = Math.hypot(gx, gy) || 1, t = (r() - 0.5) * 4; sx = x + Math.round(-gy / m * t); sy = y + Math.round(gx / m * t); }
    else { sx = x + Math.round((r() - 0.5) * 4); sy = y + Math.round((r() - 0.5) * 4); }
    sx = clamp(sx, 0, w - 1); sy = clamp(sy, 0, hh - 1);
    const i = (y * w + x) * 4, j = (sy * w + sx) * 4;
    if (v.mode === 'darken' && Y[sy * w + sx] > Y[y * w + x]) continue;
    if (v.mode === 'lighten' && Y[sy * w + sx] < Y[y * w + x]) continue;
    out[i] = d[j]; out[i + 1] = d[j + 1]; out[i + 2] = d[j + 2];
  }
  return tc(new ImageData(out, w, hh));
}
function emboss(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, n = w * hh, ang = v.angle * PI / 180, dx = Math.cos(ang) * v.height / 2, dy = -Math.sin(ang) * v.height / 2, k = v.amount / 100;
  const ch = [0, 1, 2].map(c => X.channel(d, n, c)), at = (p, x, y) => p[clamp(Math.round(y), 0, hh - 1) * w + clamp(Math.round(x), 0, w - 1)];
  for (let y = 0, j = 0, i = 0; y < hh; y++) for (let x = 0; x < w; x++, j++, i += 4) for (let c = 0; c < 3; c++) d[i + c] = 128 + (at(ch[c], x + dx, y + dy) - at(ch[c], x - dx, y - dy)) * k;
  return tc(a);
}
function extrude(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, c = App.canvas(w, hh), x = c.getContext('2d'), sz = v.size, r = X.rng(5), cx = w / 2, cy = hh / 2;
  const fill = v.mask ? 'rgba(0,0,0,0)' : null;
  if (fill === null) { x.fillStyle = '#000'; x.fillRect(0, 0, w, hh); }
  const blocks = [];
  for (let by = 0; by < hh; by += sz) for (let bx = 0; bx < w; bx += sz) {
    if (v.mask && (bx + sz > w || by + sz > hh)) continue;
    let rr = 0, gg = 0, bb = 0, nn = 0;
    for (let y = by; y < Math.min(hh, by + sz); y += 2) for (let xx = bx; xx < Math.min(w, bx + sz); xx += 2) { const i = (y * w + xx) * 4; rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; nn++; }
    rr /= nn; gg /= nn; bb /= nn;
    const depth = (v.level ? (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255 : r()) * v.depth / 255;
    blocks.push({ bx, by, rr, gg, bb, depth });
  }
  blocks.sort((p, q) => p.depth - q.depth);
  for (const B of blocks) {
    const k = 1 + B.depth * 0.6, fx = (B.bx + sz / 2 - cx) * k + cx, fy = (B.by + sz / 2 - cy) * k + cy, half = sz / 2 * k;
    const bc = `rgb(${B.rr | 0},${B.gg | 0},${B.bb | 0})`, dark = `rgb(${B.rr * 0.55 | 0},${B.gg * 0.55 | 0},${B.bb * 0.55 | 0})`, lite = `rgb(${Math.min(255, B.rr * 0.8) | 0},${Math.min(255, B.gg * 0.8) | 0},${Math.min(255, B.bb * 0.8) | 0})`;
    const ox = B.bx + sz / 2, oy = B.by + sz / 2;
    const quad = (p, col) => { x.fillStyle = col; x.beginPath(); p.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); x.fill(); };
    if (v.type === 'pyr') {
      quad([[B.bx, B.by], [B.bx + sz, B.by], [fx, fy]], lite); quad([[B.bx + sz, B.by], [B.bx + sz, B.by + sz], [fx, fy]], dark);
      quad([[B.bx + sz, B.by + sz], [B.bx, B.by + sz], [fx, fy]], bc); quad([[B.bx, B.by + sz], [B.bx, B.by], [fx, fy]], lite);
    } else {
      quad([[ox - sz / 2, oy - sz / 2], [ox + sz / 2, oy - sz / 2], [fx + half, fy - half], [fx - half, fy - half]], lite);
      quad([[ox + sz / 2, oy - sz / 2], [ox + sz / 2, oy + sz / 2], [fx + half, fy + half], [fx + half, fy - half]], dark);
      quad([[ox - sz / 2, oy + sz / 2], [ox + sz / 2, oy + sz / 2], [fx + half, fy + half], [fx - half, fy + half]], dark);
      quad([[ox - sz / 2, oy - sz / 2], [ox - sz / 2, oy + sz / 2], [fx - half, fy + half], [fx - half, fy - half]], lite);
      if (v.solid) { x.fillStyle = bc; x.fillRect(fx - half, fy - half, half * 2, half * 2); }
      else x.drawImage(s, B.bx, B.by, sz, sz, fx - half, fy - half, half * 2, half * 2);
    }
  }
  return c;
}
function findEdges(s) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, n = w * hh;
  const m = [0, 1, 2].map(c => X.sobel(X.channel(d, n, c), w, hh).mag);
  for (let j = 0, i = 0; j < n; j++, i += 4) for (let c = 0; c < 3; c++) d[i + c] = 255 - clamp(m[c][j] * 255 * 2.4, 0, 255);
  return tc(a);
}
function oilPaint(s, v) {
  let out = F.oil(s, { radius: clamp(Math.round(v.stylization * v.scale), 1, 10), levels: clamp(Math.round(8 + v.cleanliness * 2.2), 6, 32) });
  if (v.bristle > 0) { const o = rd(out); addNoise(o, v.bristle * 1.2, false, true, 9); out = tc(X.blurImg(o, 0.6)); }
  if (v.lighting && v.shine > 0) {
    const a = rd(out), w = a.width, hh = a.height, d = a.data, n = w * hh, Y = X.gaussPlane(X.lum(d, n), w, hh, 1.2 * v.scale), ang = v.angle * PI / 180, lx = Math.cos(ang), ly = -Math.sin(ang), k = v.shine / 10 * 2.2;
    for (let y = 0, j = 0, i = 0; y < hh; y++) for (let x = 0; x < w; x++, j++, i += 4) { const gx = Y[y * w + Math.min(w - 1, x + 1)] - Y[y * w + Math.max(0, x - 1)], gy = Y[Math.min(hh - 1, y + 1) * w + x] - Y[Math.max(0, y - 1) * w + x]; const sh = (gx * lx + gy * ly) * k; d[i] += sh; d[i + 1] += sh; d[i + 2] += sh; }
    out = tc(a);
  }
  return out;
}
function tiles(s, v) {
  const w = s.width, hh = s.height, c = App.canvas(w, hh), x = c.getContext('2d'), sz = Math.min(w, hh) / v.number, r = X.rng(6), off = v.offset / 100 * sz;
  if (v.fill === 'fg') { x.fillStyle = I.primary; x.fillRect(0, 0, w, hh); } else if (v.fill === 'bg') { x.fillStyle = I.secondary; x.fillRect(0, 0, w, hh); }
  else if (v.fill === 'inverse') x.drawImage(F.invert(s), 0, 0); else if (v.fill === 'unaltered') x.drawImage(s, 0, 0);
  for (let ty = 0; ty < hh; ty += sz) for (let tx = 0; tx < w; tx += sz) x.drawImage(s, tx, ty, sz, sz, tx + (r() - 0.5) * 2 * off, ty + (r() - 0.5) * 2 * off, sz, sz);
  return c;
}
function traceContour(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, out = new ImageData(w, hh), o = out.data, L = v.level;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, iR = (y * w + Math.min(w - 1, x + 1)) * 4, iD = (Math.min(hh - 1, y + 1) * w + x) * 4;
    for (let c = 0; c < 3; c++) { const cross = v.upper ? (d[i + c] > L) !== (d[iR + c] > L) || (d[i + c] > L) !== (d[iD + c] > L) : (d[i + c] < L) !== (d[iR + c] < L) || (d[i + c] < L) !== (d[iD + c] < L); o[i + c] = cross ? 0 : 255; }
    o[i + 3] = d[i + 3];
  }
  return tc(out);
}
function wind(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, out = new Uint8ClampedArray(d), r = X.rng(8), Y = X.lum(d, w * hh), dir = v.dir === 'left' ? -1 : 1;
  const maxLen = { wind: 18, blast: 50, stagger: 26 }[v.method];
  for (let y = 0; y < hh; y++) {
    const ys = v.method === 'stagger' ? clamp(y + Math.round((r() - 0.5) * 3), 0, hh - 1) : y;
    for (let x = 0; x < w; x++) {
      const xp = clamp(x - dir, 0, w - 1);
      if (Y[ys * w + x] - Y[ys * w + xp] < 18 || r() > 0.85) continue;
      const len = Math.round(maxLen * (0.3 + r() * 0.7)), i0 = (ys * w + x) * 4;
      for (let k = 1; k <= len; k++) { const xx = x + k * dir; if (xx < 0 || xx >= w) break; const i = (y * w + xx) * 4, f = 1 - k / (len + 1); for (let c = 0; c < 3; c++) out[i + c] = Math.max(out[i + c], d[i + c] + (d[i0 + c] - d[i + c]) * f); }
    }
  }
  return tc(new ImageData(out, w, hh));
}
const solarize = s => F.pixels(s, d => { for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] > 127 ? (255 - d[i + c]) * 2 : d[i + c] * 2; });

/* ---------- video ---------- */
function deinterlace(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, keepOdd = v.field === 'even';
  for (let y = 0; y < hh; y++) {
    if ((y % 2 === 1) !== keepOdd) continue;
    const up = clamp(y - 1, 0, hh - 1), dn = clamp(y + 1, 0, hh - 1);
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, iu = (up * w + x) * 4, id = (dn * w + x) * 4; for (let c = 0; c < 4; c++) d[i + c] = v.create === 'dup' ? d[iu + c] : (d[iu + c] + d[id + c]) / 2; }
  }
  return tc(a);
}
const ntsc = s => F.pixels(s, d => { for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; let Y = 0.299 * r + 0.587 * g + 0.114 * b; const I2 = 0.596 * r - 0.274 * g - 0.322 * b, Q = 0.211 * r - 0.523 * g + 0.312 * b; Y = clamp(Y, 16, 235); const sat = Math.hypot(I2, Q), m = sat > 100 ? 100 / sat : 1, ii = I2 * m, qq = Q * m; d[i] = Y + 0.956 * ii + 0.621 * qq; d[i + 1] = Y - 0.272 * ii - 0.647 * qq; d[i + 2] = Y - 1.106 * ii + 1.703 * qq; } });

/* ---------- other ---------- */
function highPass(s, v) { const a = rd(s), b = X.blurImg(a, v.radius), ad = a.data, bd = b.data; for (let i = 0; i < ad.length; i += 4) for (let c = 0; c < 3; c++) ad[i + c] = 128 + ad[i + c] - bd[i + c]; return tc(a); }
const hsbHsl = (s, v) => F.pixels(s, d => { for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255; const q = v.mode === 'hsl' ? F.rgb2hsl(r, g, b) : X.rgbToHsv(r, g, b); d[i] = q[0] * 255; d[i + 1] = q[1] * 255; d[i + 2] = q[2] * 255; } });
function offset(s, v) { const w = s.width, hh = s.height; return X.warp(s, (x, y, p) => { p[0] = x - v.dx; p[1] = y - v.dy; }, v.edge); }

/* ---------- lens correction & adaptive wide angle ---------- */
function lensCorrect(s, v) {
  const a = rd(s), w = a.width, hh = a.height, sd = a.data, out = new ImageData(w, hh), o = out.data, tmp = [0, 0, 0, 0];
  const cx = w / 2, cy = hh / 2, R = Math.hypot(cx, cy), k = v.distortion / 100 * 0.42, an = -v.angle * PI / 180, ca = Math.cos(an), sa = Math.sin(an), sc = v.scale / 100;
  const pv = v.vpersp / 100 * 0.55, ph = v.hpersp / 100 * 0.55, CA = [1 + v.caR / 100 * 0.01, 1 + v.caG / 100 * 0.01, 1 + v.caB / 100 * 0.01], hasCA = v.caR || v.caG || v.caB;
  const vig = v.vignette / 100, mid = 0.25 + v.midpoint / 100 * 0.7, edge = v.edge;
  for (let y = 0, i = 0; y < hh; y++) for (let x = 0; x < w; x++, i += 4) {
    let u = (x + 0.5 - cx) / R / sc, q = (y + 0.5 - cy) / R / sc;
    let ru = u * ca - q * sa, rq = u * sa + q * ca;
    const ww = 1 + pv * rq * 0.8 + ph * ru * 0.8; ru /= ww; rq /= ww;
    const r2 = ru * ru + rq * rq, f = 1 - k * r2;
    if (hasCA) for (let c = 0; c < 3; c++) { X.sample(sd, w, hh, cx + ru * f * CA[c] * R, cy + rq * f * CA[c] * R, tmp, 0, edge); o[i + c] = tmp[c]; if (c === 1) o[i + 3] = tmp[3]; }
    else { X.sample(sd, w, hh, cx + ru * f * R, cy + rq * f * R, tmp, 0, edge); o[i] = tmp[0]; o[i + 1] = tmp[1]; o[i + 2] = tmp[2]; o[i + 3] = tmp[3]; }
    if (vig) { const m = 1 + vig * smooth(mid * 0.6, 1.05, Math.hypot((x + 0.5 - cx) / R, (y + 0.5 - cy) / R)) * 0.9; o[i] *= m; o[i + 1] *= m; o[i + 2] *= m; }
  }
  return tc(out);
}
function wideAngle(s, v) {
  const w = s.width, hh = s.height, cx = w / 2, cy = hh / 2, f = Math.max(1, v.focal / (36 / v.crop) * w), sc = v.scale / 100;
  if (v.type === 'sphere') return X.warp(s, (x, y, p) => { const dx = (x - cx) / sc, dy = (y - cy) / sc, lon = Math.atan2(dx, f), lat = Math.atan2(dy, Math.hypot(dx, f)); p[0] = (lon / (2 * PI) + 0.5) * w; p[1] = (lat / PI + 0.5) * hh; }, 'wrap');
  return X.warp(s, (x, y, p) => {
    const dx = (x - cx) / sc, dy = (y - cy) / sc, ru = Math.hypot(dx, dy);
    if (ru < 1e-6) { p[0] = cx; p[1] = cy; return; }
    let rs;
    if (v.type === 'fisheye') rs = f * Math.atan(ru / f);
    else { const th = 2 * Math.atan(ru / (2 * f)); rs = th < PI / 2 - 0.01 ? f * Math.tan(th) : 1e6; }
    p[0] = cx + dx / ru * rs; p[1] = cy + dy / ru * rs;
  }, v.edge);
}

/* =====================================================================
   Adjustments (Image ▸ Adjustments in Photoshop)
   ===================================================================== */
const PHOTO_FILTERS = { warm85: ['Warming filter (85)', '#ec8a00'], warmLBA: ['Warming filter (LBA)', '#fa9600'], warm81: ['Warming filter (81)', '#ebb113'], cool80: ['Cooling filter (80)', '#006dff'], coolLBB: ['Cooling filter (LBB)', '#005dff'], cool82: ['Cooling filter (82)', '#00b5ff'], red: ['Red', '#ea1a1a'], orange: ['Orange', '#f38417'], yellow: ['Yellow', '#f9e31c'], green: ['Green', '#19c919'], cyan: ['Cyan', '#1dcbea'], blue: ['Blue', '#1d35ea'], violet: ['Violet', '#9b1dea'], magenta: ['Magenta', '#e318e3'], sepia: ['Sepia', '#ac7a33'], deepRed: ['Deep red', '#ff0000'], deepBlue: ['Deep blue', '#0022cd'], deepEmerald: ['Deep emerald', '#008c00'], deepYellow: ['Deep yellow', '#ffd500'], under: ['Underwater', '#00c1b1'] };
function photoFilter(s, v) {
  const [fr, fg, fb] = X.hex(v.filter === 'custom' ? v.color : PHOTO_FILTERS[v.filter][1]), k = v.density / 100;
  return F.pixels(s, d => { for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2], L0 = 0.299 * r + 0.587 * g + 0.114 * b; let nr = r + (r * fr / 255 - r) * k, ng = g + (g * fg / 255 - g) * k, nb = b + (b * fb / 255 - b) * k; if (v.lum) { const L1 = 0.299 * nr + 0.587 * ng + 0.114 * nb, m = L1 > 0.5 ? L0 / L1 : 1; nr *= m; ng *= m; nb *= m; } d[i] = nr; d[i + 1] = ng; d[i + 2] = nb; } });
}
function channelMixer(s, v) {
  const M = [[v.rr, v.rg, v.rb, v.rc], [v.gr, v.gg, v.gb, v.gc], [v.br, v.bg, v.bb, v.bc]].map(r => r.map(q => q / 100));
  return F.pixels(s, d => { for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (v.mono) { const q = r * M[0][0] + g * M[0][1] + b * M[0][2] + M[0][3] * 255; d[i] = d[i + 1] = d[i + 2] = q; } else for (let c = 0; c < 3; c++) d[i + c] = r * M[c][0] + g * M[c][1] + b * M[c][2] + M[c][3] * 255; } });
}
const GRADIENTS = { bw: ['Black, White', ['#000000', '#ffffff']], sepia: ['Sepia', ['#1a0e05', '#8a5a2b', '#f6e7c8']], copper: ['Copper', ['#1a0700', '#b5541b', '#ffd9a0']], teal: ['Teal & orange', ['#062a33', '#2c7f86', '#f0b37a', '#fff1dc']], violet: ['Violet & orange', ['#1b0533', '#8a2be2', '#ff8c3a', '#fff0cc']], blue: ['Midnight blue', ['#000814', '#1d3a8a', '#9fd3ff']], spectrum: ['Spectrum', ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff']], fire: ['Fire', ['#000000', '#8a0000', '#ff6a00', '#ffd400', '#ffffff']], fg: ['Foreground to background', null] };
function gradientMap(s, v) {
  let stops = v.preset === 'custom' ? [v.c1, v.c2] : v.preset === 'fg' ? [I.primary, I.secondary] : GRADIENTS[v.preset][1];
  if (v.reverse) stops = stops.slice().reverse();
  const cs = stops.map(X.hex), lut = new Uint8ClampedArray(256 * 3), r = X.rng(1);
  for (let i = 0; i < 256; i++) { const t = i / 255 * (cs.length - 1), k = Math.min(cs.length - 2, Math.floor(t)), f = t - k; for (let c = 0; c < 3; c++) lut[i * 3 + c] = cs[k][c] + (cs[k + 1][c] - cs[k][c]) * f; }
  return F.pixels(s, d => { for (let i = 0; i < d.length; i += 4) { let L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; if (v.dither) L = clamp(L + (r() - 0.5) * 1.5, 0, 255); const j = Math.round(L) * 3; d[i] = lut[j]; d[i + 1] = lut[j + 1]; d[i + 2] = lut[j + 2]; } });
}
function shadowsHighlights(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, n = w * hh, Y = X.lum(d, n);
  const bs = X.gaussPlane(Y, w, hh, Math.max(1, v.sRadius)), bh = v.hRadius === v.sRadius ? bs : X.gaussPlane(Y, w, hh, Math.max(1, v.hRadius));
  const sA = v.shadows / 100, hA = v.highlights / 100, sT = 0.15 + v.sTone / 100 * 0.6, hT = 0.15 + v.hTone / 100 * 0.6, colK = v.color / 100, mc = v.midtone / 100;
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    const L = Y[j] / 255, ls = bs[j] / 255, lh = bh[j] / 255;
    let gain = 1;
    if (sA) { const wS = clamp(1 - ls / sT, 0, 1); gain *= 1 + sA * 2.2 * wS * wS; }
    if (hA) { const wH = clamp((lh - (1 - hT)) / hT, 0, 1); gain *= 1 - hA * 0.55 * wH * wH; }
    let nL = clamp(L * gain, 0, 1);
    if (mc) nL = clamp(0.5 + (nL - 0.5) * (1 + mc * 0.8), 0, 1);
    const k = L > 0.002 ? nL / L : 1;
    for (let c = 0; c < 3; c++) { const ch = d[i + c] * k, Lc = nL * 255; d[i + c] = Lc + (ch - Lc) * (1 + (k - 1) * colK * 0.3); }
  }
  return tc(a);
}
const SEL_RANGES = [['reds', 'Reds'], ['yellows', 'Yellows'], ['greens', 'Greens'], ['cyans', 'Cyans'], ['blues', 'Blues'], ['magentas', 'Magentas'], ['whites', 'Whites'], ['neutrals', 'Neutrals'], ['blacks', 'Blacks']];
function selectiveColor(s, v) {
  const adj = v.ranges, rel = v.method === 'rel';
  return F.pixels(s, d => {
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), mid = r + g + b - mx - mn;
      const wts = { reds: r === mx ? mx - mid : 0, greens: g === mx ? mx - mid : 0, blues: b === mx ? mx - mid : 0, cyans: r === mn ? mid - mn : 0, magentas: g === mn ? mid - mn : 0, yellows: b === mn ? mid - mn : 0, whites: Math.max(0, mn - 0.5) * 2, blacks: Math.max(0, 0.5 - mx) * 2, neutrals: 1 - (Math.abs(mx - 0.5) + Math.abs(mn - 0.5)) };
      let cr = 1 - r, cg = 1 - g, cb = 1 - b;
      for (const k in adj) { const a = adj[k], wt = wts[k]; if (!wt || !(a.c || a.m || a.y || a.k)) continue; const base = (q) => (rel ? q : 1); cr += wt * (a.c / 100 * base(cr) + a.k / 100 * base(cr)); cg += wt * (a.m / 100 * base(cg) + a.k / 100 * base(cg)); cb += wt * (a.y / 100 * base(cb) + a.k / 100 * base(cb)); }
      d[i] = (1 - clamp(cr, 0, 1)) * 255; d[i + 1] = (1 - clamp(cg, 0, 1)) * 255; d[i + 2] = (1 - clamp(cb, 0, 1)) * 255;
    }
  });
}
function replaceColor(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, px = clamp(Math.round(v.pick[0] * w), 0, w - 1), py = clamp(Math.round(v.pick[1] * hh), 0, hh - 1), k0 = (py * w + px) * 4;
  const tr = d[k0], tg = d[k0 + 1], tb = d[k0 + 2], fz = Math.max(1, v.fuzz) * 1.3, hs = v.hue / 360, ss = v.sat / 100, ls = v.light / 100;
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - tr, d[i + 1] - tg, d[i + 2] - tb), wt = clamp(1 - dist / fz, 0, 1);
    if (!wt) continue;
    let [H, S, L] = F.rgb2hsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    H = (H + hs + 1) % 1; S = clamp(S * (1 + ss), 0, 1); L = clamp(ls >= 0 ? L + (1 - L) * ls : L * (1 + ls), 0, 1);
    const [r, g, b] = F.hsl2rgb(H, S, L);
    d[i] += (r * 255 - d[i]) * wt; d[i + 1] += (g * 255 - d[i + 1]) * wt; d[i + 2] += (b * 255 - d[i + 2]) * wt;
  }
  return tc(a);
}
function equalize(s) {
  const hst = F.histogram(s, 1200).l, cdf = new Float64Array(256); let acc = 0, tot = 0; for (const q of hst) tot += q;
  for (let i = 0; i < 256; i++) { acc += hst[i]; cdf[i] = acc / tot; }
  return F.pixels(s, d => { for (let i = 0; i < d.length; i += 4) { const L = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]), k = L > 0 ? cdf[L] * 255 / L : 1; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } });
}
const desaturate = s => F.pixels(s, d => { for (let i = 0; i < d.length; i += 4) { const L = (Math.max(d[i], d[i + 1], d[i + 2]) + Math.min(d[i], d[i + 1], d[i + 2])) / 2; d[i] = d[i + 1] = d[i + 2] = L; } });
function autoContrast(s) {
  const hst = F.histogram(s, 600).l, pct = p => { let tot = 0; for (const q of hst) tot += q; let acc = 0; for (let i = 0; i < 256; i++) { acc += hst[i]; if (acc >= tot * p) return i; } return 255; };
  const lo = pct(0.003), hi = Math.max(lo + 1, pct(0.997));
  return F.lut(s, F.mkLut(x => (x * 255 - lo) / (hi - lo)));
}
function autoColor(s) {
  const a = rd(s), d = a.data; let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; if (L > 30 && L < 230) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } }
  if (!n) return autoContrast(s);
  const m = (r + g + b) / 3 / n, kr = m / (r / n), kg = m / (g / n), kb = m / (b / n);
  for (let i = 0; i < d.length; i += 4) { d[i] *= kr; d[i + 1] *= kg; d[i + 2] *= kb; }
  return autoContrast(tc(a));
}
const LOOKUPS = {
  teal: ['Teal & orange', (r, g, b) => { const L = 0.3 * r + 0.59 * g + 0.11 * b; return [r + (L - 0.5) * 0.18 + (L > 0.5 ? 0.06 : -0.04), g + (L > 0.5 ? 0.02 : 0.02), b + (L > 0.5 ? -0.08 : 0.08)]; }],
  bleach: ['Bleach bypass', (r, g, b) => { const L = 0.3 * r + 0.59 * g + 0.11 * b, k = 0.55; const c = q => { q = q * (1 - k) + L * k; return q < 0.5 ? 2 * q * q * 1.05 : 1 - 2 * (1 - q) * (1 - q) * 0.95; }; return [c(r), c(g), c(b)]; }],
  film: ['Fuji-style film', (r, g, b) => [r * 0.95 + 0.03, g * 1.02 + 0.01, b * 0.9 + 0.07]],
  kodak: ['Warm print film', (r, g, b) => [Math.pow(r, 0.92) + 0.02, Math.pow(g, 0.97), Math.pow(b, 1.08) - 0.01]],
  moon: ['Moonlight', (r, g, b) => { const L = 0.3 * r + 0.59 * g + 0.11 * b; return [L * 0.75, L * 0.88, L * 1.12 + 0.03]; }],
  sunset: ['Late sunset', (r, g, b) => [r * 1.08 + 0.04, g * 0.94 + 0.02, b * 0.78]],
  candle: ['Candlelight', (r, g, b) => [r * 1.1 + 0.05, g * 0.92 + 0.02, b * 0.7]],
  horror: ['Horror blue', (r, g, b) => { const L = 0.3 * r + 0.59 * g + 0.11 * b; return [L * 0.6 + r * 0.2, L * 0.75 + g * 0.2, L * 0.9 + b * 0.25]; }],
  fog: ['Foggy night', (r, g, b) => [r * 0.8 + 0.1, g * 0.82 + 0.11, b * 0.85 + 0.14]],
  amber: ['Edgy amber', (r, g, b) => { const L = 0.3 * r + 0.59 * g + 0.11 * b; return [L * 1.1 + 0.05, L * 0.9 + 0.02, L * 0.55]; }],
  crisp: ['Crisp winter', (r, g, b) => [r * 0.95, g * 1.0 + 0.02, b * 1.08 + 0.03]],
  soft: ['Soft warming', (r, g, b) => [r * 1.04 + 0.03, g * 1.01 + 0.02, b * 0.95 + 0.02]],
};
function colorLookup(s, v) {
  const fn = LOOKUPS[v.look][1], k = v.opacity / 100;
  return F.pixels(s, d => { for (let i = 0; i < d.length; i += 4) { const o = fn(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255); for (let c = 0; c < 3; c++) d[i + c] += (clamp(o[c], 0, 1) * 255 - d[i + c]) * k; } });
}
function hdrToning(s, v) {
  const a = rd(s), w = a.width, hh = a.height, d = a.data, n = w * hh, Y = new Float32Array(n);
  for (let j = 0, i = 0; j < n; j++, i += 4) Y[j] = Math.log(1 + 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
  const B = X.gaussPlane(Y, w, hh, v.radius), str = v.strength / 100, det = 1 + v.detail / 100, gam = v.gamma, ev = Math.pow(2, v.exposure), sat = 1 + v.saturation / 100, vib = v.vibrance / 100;
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    const base = B[j], detail = Y[j] - base, nb = base * (1 - str * 0.6) + Math.log(128) * str * 0.6, ny = Math.exp(nb + detail * det) - 1;
    const L0 = Math.exp(Y[j]) - 1, k = L0 > 0.5 ? clamp(Math.pow(ny / 255, 1 / gam) * 255 * ev / L0, 0, 8) : 1;
    let r = d[i] * k, g = d[i + 1] * k, b = d[i + 2] * k;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b), ks = sat + vib * (1 - clamp((mx - mn) / 255, 0, 1));
    d[i] = L + (r - L) * ks; d[i + 1] = L + (g - L) * ks; d[i + 2] = L + (b - L) * ks;
  }
  return tc(a);
}

/* =====================================================================
   Catalog → dialogs and menus
   ===================================================================== */
const D = (title, tip, params, run, o = {}) => () => I.fxDialog({ title, tip, params, run, ...o });
const now = (title, fn) => () => { I.busy(true, title + '…'); setTimeout(() => { try { I.applyNow(title, fn); } finally { I.busy(false); } }, 20); };
const SHAPES = [[0, 'Circle'], [3, 'Triangle'], [4, 'Square'], [5, 'Pentagon'], [6, 'Hexagon'], [7, 'Heptagon'], [8, 'Octagon']];

const FX = I.FX = {
  // blur
  average: now('Average', average),
  blur: now('Blur', imgOp(a => X.blurImg(a, 0.9))),
  blurMore: now('Blur more', imgOp(a => X.blurImg(a, 2))),
  boxBlur: D('Box blur', 'Averages each pixel with its square neighbourhood — a flat, even blur.', [sl('radius', 'Radius', 1, 200, 5, 'Size of the averaging square.', { unit: 'px' })], (s, v) => tc(X.blurImg(rd(s), v.radius, true)), { heavy: true }),
  gaussian: D('Gaussian blur', 'Smooth, natural softening. Use with a selection to blur a background, or on a mask to soften its edge.', [sl('radius', 'Radius', 0.1, 250, 4, 'Blur amount.', { step: 0.1, unit: 'px' })], (s, v) => F.blur(s, v.radius)),
  lensBlur: D('Lens blur', 'Real lens-style blur: bright points bloom into bokeh shapes. Optionally use the layer mask or a gradient as a depth map so focus falls off with distance.', [
    head('Depth map'), sel('depth', 'Source', [['none', 'None (blur everything)'], ['mask', 'Layer mask (white = far)'], ['top', 'Gradient (top is far)'], ['bottom', 'Gradient (bottom is far)']], 'none', 'What decides how far away each pixel is.'),
    sl('focal', 'Focal distance', 0, 255, 0, 'Which depth stays sharp (0 = near).'), tg('invert', 'Invert depth', false, 'Swap near and far.'),
    head('Iris'), sel('shape', 'Shape', SHAPES, 6, 'Aperture shape of the bokeh highlights.'), sl('radius', 'Radius', 0, 100, 15, 'Blur strength.', { unit: 'px' }), sl('rotation', 'Blade rotation', 0, 360, 0, 'Turns the aperture shape.', { unit: '°' }),
    head('Specular highlights'), sl('bright', 'Brightness', 0, 100, 30, 'How strongly bright spots bloom.'), sl('thresh', 'Threshold', 120, 254, 200, 'Only pixels brighter than this bloom.'),
    head('Noise'), sl('noise', 'Amount', 0, 100, 0, 'Adds back grain so the blurred area matches a grainy photo.'), sel('dist', 'Distribution', [['uniform', 'Uniform'], ['gauss', 'Gaussian']], 'uniform', 'Shape of the noise.'), tg('mono', 'Monochromatic', true, 'Grey grain instead of colored.')],
    lensBlur, { heavy: true, width: 400 }),
  motion: D('Motion blur', 'Streaks the image in one direction — suggests speed and movement.', [sl('angle', 'Angle', -180, 180, 0, 'Direction of the motion.', { unit: '°' }), sl('distance', 'Distance', 1, 400, 30, 'Length of the streaks.', { unit: 'px' })], (s, v) => F.motionBlur(s, v)),
  radial: D('Radial blur', 'Spin: blurs in circles around a point. Zoom: blurs outward from a point, like zooming the lens during the shot.', [sl('amount', 'Amount', 1, 100, 10, 'Strength of the blur.'), sel('method', 'Blur method', [['spin', 'Spin'], ['zoom', 'Zoom']], 'spin', 'Circular or outward blur.'), sel('quality', 'Quality', [['draft', 'Draft'], ['good', 'Good'], ['best', 'Best']], 'good', 'More copies = smoother result, slower.'), pt('center', 'Blur center', [0.5, 0.5], 'The point the blur spins or zooms around.')],
    (s, v) => { const [cx, cy] = centerOf(v, s.width, s.height), n = { draft: 12, good: 28, best: 56 }[v.quality]; return v.method === 'spin' ? spin(s, cx, cy, v.amount * 0.9, n) : zoom(s, cx, cy, v.amount / 140, n); }),
  smartBlur: D('Smart blur', 'Blurs only where colors are similar, so edges stay sharp — or extracts the edges.', [sl('radius', 'Radius', 0.5, 50, 3, 'How far to look for similar pixels.', { step: 0.1 }), sl('threshold', 'Threshold', 0.5, 100, 25, 'How different a pixel may be and still be blurred.', { step: 0.1 }), sel('mode', 'Mode', [['normal', 'Normal'], ['edge', 'Edge only'], ['overlay', 'Overlay edge']], 'normal', 'Blur, or show the detected edges.')], smartBlur, { heavy: true }),
  surface: D('Surface blur', 'Smooths surfaces (skin, sky, walls) while keeping edges crisp.', [sl('radius', 'Radius', 1, 100, 5, 'Size of the smoothing area.', { unit: 'px' }), sl('threshold', 'Threshold', 2, 255, 15, 'Color difference that counts as an edge — lower keeps more detail.', { unit: 'levels' })], (s, v) => tc(X.surface(rd(s), v.radius, v.threshold)), { heavy: true }),
  // blur gallery
  field: D('Field blur', 'Two pins, each with its own blur amount — the blur fades smoothly between them.', [pt('p1', 'Pin 1', [0.25, 0.5], 'First pin.'), sl('blur', 'Pin 1 blur', 0, 100, 15, 'Blur at pin 1.', { unit: 'px' }), pt('p2', 'Pin 2', [0.75, 0.5], 'Second pin.'), sl('blur2', 'Pin 2 blur', 0, 100, 0, 'Blur at pin 2.', { unit: 'px' }), ...BOKEH], fieldBlur, { heavy: true }),
  iris: D('Iris blur', 'Keeps an oval area sharp and blurs everything outside it — fake shallow depth of field.', [pt('center', 'Focus center'), sl('sx', 'Width', 5, 150, 40, 'Width of the sharp oval.', { unit: '%' }), sl('sy', 'Height', 5, 150, 40, 'Height of the sharp oval.', { unit: '%' }), sl('angle', 'Angle', -90, 90, 0, 'Rotates the oval.', { unit: '°' }), sl('feather', 'Sharp area', 0, 95, 45, 'How much of the oval stays fully sharp before the blur starts.', { unit: '%' }), sl('blur', 'Blur', 0, 100, 15, 'Blur outside the oval.', { unit: 'px' }), ...BOKEH], irisBlur, { heavy: true }),
  tilt: D('Tilt-shift', 'A sharp band across the image with blur above and below — makes real scenes look like miniatures.', [pt('center', 'Focus line'), sl('angle', 'Angle', -90, 90, 0, 'Tilt of the sharp band.', { unit: '°' }), sl('focus', 'Focus band', 0, 50, 10, 'Half-height of the sharp band.', { unit: '%' }), sl('transition', 'Transition', 1, 60, 18, 'How gradually it becomes blurry.', { unit: '%' }), sl('blur', 'Blur', 0, 100, 15, 'Maximum blur.', { unit: 'px' }), ...BOKEH], tiltShift, { heavy: true }),
  spinBlur: D('Spin blur', 'Rotational blur inside a circle — spinning wheels, fans and propellers.', [pt('center', 'Spin center'), sl('radius', 'Radius', 5, 150, 35, 'Size of the spinning area.', { unit: '%' }), sl('angle', 'Blur angle', 1, 180, 20, 'How far it spins during the "exposure".', { unit: '°' }), sl('feather', 'Edge softness', 0, 100, 20, 'Blends the edge of the spinning area.', { unit: '%' })], spinBlur, { heavy: true }),
  // distort
  displace: D('Displace', 'Pushes pixels around using a map — liquid, heat-haze or textured-glass looks.', [sl('h', 'Horizontal scale', -100, 100, 10, 'Sideways movement (100% = 128 px).', { unit: '%' }), sl('v', 'Vertical scale', -100, 100, 10, 'Up/down movement.', { unit: '%' }), sel('map', 'Displacement map', [['clouds', 'Clouds (random)'], ['lum', 'The image’s own brightness']], 'clouds', 'Where the push directions come from.'), sl('detail', 'Map size', 4, 400, 60, 'Size of the features in the map.', { unit: 'px' }), seedBtn, EDGE], displace, { heavy: true }),
  pinch: D('Pinch', 'Squeezes the image toward the center (or bulges it outward with negative values).', [sl('amount', 'Amount', -100, 100, 50, 'Positive pinches in, negative bulges out.', { unit: '%' }), pt('center', 'Center')], pinch),
  polar: D('Polar coordinates', 'Wraps the image into a circle (tiny-planet effect) or unwraps a circle into a strip.', [sel('mode', 'Conversion', [['toP', 'Rectangular to polar'], ['toR', 'Polar to rectangular']], 'toP', 'Which way to convert.')], polar),
  ripple: D('Ripple', 'Rippled water-like wobble.', [sl('amount', 'Amount', -300, 300, 100, 'Strength of the ripples.', { unit: '%' }), sel('size', 'Size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], 'm', 'Ripple wavelength.'), EDGE], ripple),
  shear: D('Shear', 'Bends the image along a smooth curve.', [sl('amount', 'Bend', -100, 100, 30, 'How far the middle bends sideways.', { unit: '%' }), sel('dir', 'Direction', [['h', 'Horizontal'], ['v', 'Vertical']], 'h', 'Axis of the bend.'), EDGE], shear),
  spherize: D('Spherize', 'Wraps the image around a sphere — a fish-eye bulge (or a pinch with negative values).', [sl('amount', 'Amount', -100, 100, 60, 'Bulge (positive) or pinch (negative).', { unit: '%' }), sel('mode', 'Mode', [['n', 'Normal'], ['h', 'Horizontal only'], ['v', 'Vertical only']], 'n', 'Spherize in both directions or just one.'), pt('center', 'Center')], spherize),
  twirl: D('Twirl', 'Swirls the image around a point — stronger in the middle.', [sl('angle', 'Angle', -999, 999, 150, 'How far to twist. Negative twists the other way.', { unit: '°' }), pt('center', 'Center')], twirl),
  wave: D('Wave', 'Overlapping waves for wobbly, glitchy or liquid distortions.', [sl('gens', 'Generators', 1, 20, 5, 'Number of overlapping waves.'), sl('wlMin', 'Wavelength min', 1, 500, 10, 'Shortest wave.', { unit: 'px' }), sl('wlMax', 'Wavelength max', 2, 600, 120, 'Longest wave.', { unit: 'px' }), sl('ampMin', 'Amplitude min', 1, 200, 5, 'Smallest displacement.', { unit: 'px' }), sl('ampMax', 'Amplitude max', 1, 300, 35, 'Largest displacement.', { unit: 'px' }), sl('scaleH', 'Horizontal', 0, 100, 100, 'Scale of the sideways movement.', { unit: '%' }), sl('scaleV', 'Vertical', 0, 100, 100, 'Scale of the vertical movement.', { unit: '%' }), sel('type', 'Type', [['sine', 'Sine'], ['tri', 'Triangle'], ['sq', 'Square']], 'sine', 'Wave shape.'), { ...seedBtn, label: 'Randomize' }, EDGE], wave, { heavy: true, width: 400 }),
  zigzag: D('ZigZag', 'Ripples that radiate from a point, like a stone dropped in a pond.', [sl('amount', 'Amount', -100, 100, 15, 'Strength.'), sl('ridges', 'Ridges', 1, 20, 6, 'Number of ripples.'), sel('style', 'Style', [['pond', 'Pond ripples'], ['out', 'Out from center'], ['around', 'Around center']], 'pond', 'Direction of the ripples.'), pt('center', 'Center')], zigzag),
  // noise
  addNoise: D('Add noise', 'Adds grain — a film look, or to hide banding in smooth gradients.', [sl('amount', 'Amount', 0, 100, 12, 'Grain strength.', { unit: '%' }), sel('dist', 'Distribution', [['uniform', 'Uniform'], ['gauss', 'Gaussian']], 'gauss', 'Gaussian looks more natural, uniform more even.'), tg('mono', 'Monochromatic', true, 'Grey grain instead of colored speckles.')], (s, v) => tc(addNoise(rd(s), v.amount, v.dist === 'gauss', v.mono))),
  despeckle: now('Despeckle', despeckle),
  dust: D('Dust & scratches', 'Removes small specks and scratches by replacing pixels that differ from their neighbours.', [sl('radius', 'Radius', 1, 30, 2, 'Size of defects to remove.', { unit: 'px' }), sl('threshold', 'Threshold', 0, 255, 8, 'How different a pixel must be to count as dust — raise to keep texture.', { unit: 'levels' })], dust, { heavy: true }),
  median: D('Median', 'Replaces each pixel with the median of its neighbours — removes noise and creates a painterly, posterised look at larger radii.', [sl('radius', 'Radius', 1, 60, 3, 'Neighbourhood size.', { unit: 'px' })], (s, v) => bigMedian(s, v.radius), { heavy: true }),
  reduceNoise: D('Reduce noise', 'Removes grain and color blotches while keeping edges.', [sl('strength', 'Strength', 0, 10, 6, 'Luminance noise reduction.'), sl('preserve', 'Preserve details', 0, 100, 50, 'Keeps fine texture.', { unit: '%' }), sl('color', 'Reduce color noise', 0, 100, 45, 'Removes colored speckles.', { unit: '%' }), sl('sharpen', 'Sharpen details', 0, 100, 25, 'Restores a little crispness afterwards.', { unit: '%' })], (s, v) => { const img = guidedDenoise(rd(s), v.strength * 8, v.color, v.preserve); return tc(v.sharpen ? enhanceDetail(img, v.sharpen * 0.6, 20, 30) : img); }, { heavy: true }),
  // pixelate
  halftone: D('Color halftone', 'Simulates printed CMYK dots, like comics and newspapers.', [sl('radius', 'Max radius', 2, 60, 8, 'Size of the largest dots.', { unit: 'px' }), head('Screen angles (degrees)'), sl('c', 'Cyan', 0, 180, 108, 'Angle of the cyan dot grid.'), sl('m', 'Magenta', 0, 180, 162, 'Angle of the magenta grid.'), sl('y', 'Yellow', 0, 180, 90, 'Angle of the yellow grid.'), sl('k', 'Black', 0, 180, 45, 'Angle of the black grid.')], colorHalftone, { heavy: true }),
  crystallize: D('Crystallize', 'Breaks the image into solid-color crystal cells.', [sl('size', 'Cell size', 3, 300, 10, 'Size of the crystals.'), seedBtn], crystallize, { heavy: true }),
  facet: now('Facet', facet),
  fragment: now('Fragment', fragment),
  mezzotint: D('Mezzotint', 'Turns the image into a pattern of dots, lines or strokes in pure colors — an engraving look.', [sel('type', 'Type', [['fine', 'Fine dots'], ['medium', 'Medium dots'], ['grainy', 'Grainy dots'], ['coarse', 'Coarse dots'], ['shortl', 'Short lines'], ['mediuml', 'Medium lines'], ['longl', 'Long lines'], ['shorts', 'Short strokes'], ['mediums', 'Medium strokes'], ['longs', 'Long strokes']], 'medium', 'Pattern style.')], mezzotint),
  mosaic: D('Mosaic', 'Square blocks of averaged color.', [sl('size', 'Cell size', 2, 200, 10, 'Size of each square.', { unit: 'px' })], (s, v) => F.pixelate(s, v)),
  pointillize: D('Pointillize', 'Recreates the image as dots of color on the background color — like pointillist painting.', [sl('size', 'Cell size', 3, 100, 8, 'Dot size.'), seedBtn], pointillize),
  // render
  clouds: now('Clouds', s => clouds(s, {})),
  diffClouds: now('Difference clouds', s => clouds(s, {}, true)),
  fibers: D('Fibers', 'A woven-fibre texture made from the primary and secondary colors.', [sl('variance', 'Variance', 1, 64, 16, 'Contrast between light and dark fibres.'), sl('strength', 'Strength', 1, 64, 4, 'Longer, stiffer fibres.'), seedBtn], fibers),
  lensFlare: D('Lens flare', 'Adds a bright lens flare as if the sun or a light shines into the camera.', [sl('brightness', 'Brightness', 10, 300, 100, 'Intensity of the flare.', { unit: '%' }), sel('lens', 'Lens type', [['zoom', '50–300 mm zoom'], ['p35', '35 mm prime'], ['p105', '105 mm prime'], ['movie', 'Movie prime (anamorphic)']], 'zoom', 'Changes the halos, ghosts and streak.'), pt('center', 'Flare center', [0.3, 0.3])], lensFlare),
  lighting: D('Lighting effects', 'Relights the image with a colored light; optional bump texture from the image’s brightness.', [sel('type', 'Light', [['spot', 'Spot'], ['point', 'Point'], ['dir', 'Infinite (directional)']], 'spot', 'Kind of light.'), pt('center', 'Light position', [0.35, 0.3]), col('color', 'Color', '#fff4dc', 'Light color.'), sl('intensity', 'Intensity', 0, 200, 100, 'Light strength.', { unit: '%' }), sl('radius', 'Spread', 5, 150, 60, 'How far the light reaches.', { unit: '%' }), sl('ambience', 'Ambience', -100, 100, 0, 'Light that reaches everywhere.'), sl('gloss', 'Gloss', 0, 100, 20, 'Shiny highlights.'), tg('bump', 'Texture from brightness', true, 'Uses the image’s own brightness as a bumpy surface.'), sl('height', 'Height', 0, 100, 30, 'Depth of the texture.')], lighting, { heavy: true }),
  // sharpen
  sharpen: now('Sharpen', s => conv3([0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0], s)),
  sharpenEdges: now('Sharpen edges', s => F.sharpen(s, { amount: 90, radius: 1, threshold: 8 })),
  sharpenMore: now('Sharpen more', s => conv3([-0.5, -0.5, -0.5, -0.5, 5, -0.5, -0.5, -0.5, -0.5], s)),
  smartSharpen: D('Smart sharpen', 'Advanced sharpening: choose what blur to remove, suppress noise and protect shadows or highlights.', [sl('amount', 'Amount', 1, 500, 200, 'Strength.', { unit: '%' }), sl('radius', 'Radius', 0.1, 64, 1, 'Size of the details to enhance.', { step: 0.1, unit: 'px' }), sl('noise', 'Reduce noise', 0, 100, 10, 'Avoids sharpening grain.', { unit: '%' }), sel('remove', 'Remove', [['gauss', 'Gaussian blur'], ['lens', 'Lens blur'], ['motion', 'Motion blur']], 'lens', 'The kind of softness to counteract.'), sl('angle', 'Motion angle', -180, 180, 0, 'For "Motion blur": direction of the shake.', { unit: '°' }), head('Shadows / highlights'), sl('shadowFade', 'Fade shadows', 0, 100, 0, 'Less sharpening in dark areas (hides noise).', { unit: '%' }), sl('highFade', 'Fade highlights', 0, 100, 0, 'Less sharpening in bright areas (avoids halos).', { unit: '%' })], smartSharpen, { heavy: true }),
  unsharp: D('Unsharp mask', 'Classic sharpening by contrast at edges.', [sl('amount', 'Amount', 1, 500, 100, 'Strength.', { unit: '%' }), sl('radius', 'Radius', 0.1, 64, 1, 'Edge width affected.', { step: 0.1, unit: 'px' }), sl('threshold', 'Threshold', 0, 255, 0, 'Ignore differences smaller than this (keeps skin and sky smooth).', { unit: 'levels' })], (s, v) => F.sharpen(s, v)),
  // stylize
  diffuse: D('Diffuse', 'Shuffles pixels slightly for a soft, frosted-glass look.', [sel('mode', 'Mode', [['normal', 'Normal'], ['darken', 'Darken only'], ['lighten', 'Lighten only'], ['aniso', 'Anisotropic']], 'normal', 'Which pixels move.')], diffuse),
  emboss: D('Emboss', 'Stamped-metal relief in grey.', [sl('angle', 'Angle', -180, 180, 135, 'Light direction.', { unit: '°' }), sl('height', 'Height', 1, 30, 3, 'Depth of the relief.', { unit: 'px' }), sl('amount', 'Amount', 1, 500, 100, 'Contrast of the relief.', { unit: '%' })], emboss),
  extrude: D('Extrude', 'Turns the image into 3-D blocks or pyramids flying at you.', [sel('type', 'Type', [['blocks', 'Blocks'], ['pyr', 'Pyramids']], 'blocks', 'Shape of the extruded tiles.'), sl('size', 'Size', 4, 200, 30, 'Tile size.', { unit: 'px' }), sl('depth', 'Depth', 1, 255, 30, 'How far tiles stick out.'), tg('level', 'Level-based', false, 'Brighter tiles stick out further (otherwise random).'), tg('solid', 'Solid front faces', false, 'Fill the front of each block with its average color.'), tg('mask', 'Mask incomplete blocks', false, 'Leave out partial blocks at the edges.')], extrude),
  findEdges: now('Find edges', findEdges),
  oil: D('Oil paint', 'Turns the photo into an oil painting with brush texture and lighting.', [sl('stylization', 'Stylization', 0.1, 10, 4, 'Smoothness of the strokes.', { step: 0.1 }), sl('cleanliness', 'Cleanliness', 0, 10, 5, 'More detail vs. cleaner strokes.', { step: 0.1 }), sl('scale', 'Scale', 0.1, 3, 1, 'Size of the strokes.', { step: 0.1 }), sl('bristle', 'Bristle detail', 0, 10, 2, 'Fine brush texture.', { step: 0.1 }), tg('lighting', 'Lighting', true, 'Light catching the paint relief.'), sl('angle', 'Angle', -180, 180, -60, 'Light direction.', { unit: '°' }), sl('shine', 'Shine', 0, 10, 1.5, 'Strength of the relief lighting.', { step: 0.1 })], oilPaint, { heavy: true }),
  solarize: now('Solarize', solarize),
  tiles: D('Tiles', 'Cuts the image into tiles and shifts them slightly.', [sl('number', 'Number of tiles', 1, 99, 10, 'Tiles along the shorter side.'), sl('offset', 'Max offset', 1, 99, 10, 'How far tiles may move.', { unit: '%' }), sel('fill', 'Fill empty area with', [['bg', 'Background (secondary) color'], ['fg', 'Foreground (primary) color'], ['inverse', 'Inverse image'], ['unaltered', 'Unaltered image']], 'bg', 'What shows in the gaps.')], tiles),
  trace: D('Trace contour', 'Draws thin contour lines where brightness crosses a level — like a topographic map.', [sl('level', 'Level', 0, 255, 128, 'Brightness to trace.'), tg('upper', 'Upper edge', false, 'Trace where values go above the level (else below).')], traceContour),
  wind: D('Wind', 'Short horizontal streaks blowing from the edges.', [sel('method', 'Method', [['wind', 'Wind'], ['blast', 'Blast'], ['stagger', 'Stagger']], 'wind', 'Strength and style of the streaks.'), sel('dir', 'Direction', [['right', 'From the right'], ['left', 'From the left']], 'right', 'Which way the wind blows.')], wind),
  glow: D('Glow', 'Makes bright areas bloom with a soft dreamy light.', [sl('radius', 'Radius', 2, 80, 18, 'Spread of the glow.', { unit: 'px' }), sl('strength', 'Strength', 0, 100, 55, 'Intensity.', { unit: '%' }), sl('threshold', 'Threshold', 0, 250, 150, 'Only areas brighter than this glow.')], (s, v) => F.glow(s, v)),
  vignette: D('Vignette', 'Darkens (or colors) the edges to frame your subject.', [sl('amount', 'Amount', 0, 100, 55, 'Darkness of the edges.', { unit: '%' }), sl('size', 'Clear center', 0, 100, 45, 'Size of the untouched middle.', { unit: '%' }), col('color', 'Color', '#000000', 'Edge color.')], (s, v) => F.vignette(s, v)),
  // video
  deinterlace: D('De-interlace', 'Removes the comb-like lines from frames captured from interlaced video.', [sel('field', 'Eliminate', [['odd', 'Odd fields'], ['even', 'Even fields']], 'odd', 'Which set of lines to replace.'), sel('create', 'Create new fields by', [['interp', 'Interpolation'], ['dup', 'Duplication']], 'interp', 'Blend from neighbours (smoother) or copy (sharper).')], deinterlace),
  ntsc: now('NTSC colors', ntsc),
  // other
  custom: () => {
    const grid = Array(25).fill(0); grid[12] = 1;
    const ins = [];
    const mk = (vals, update) => { vals.k = grid; const g = h('div', { class: 'kgrid' }); for (let i = 0; i < 25; i++) { const inp = h('input', { class: 'num', value: grid[i], title: 'Kernel cell', tip: 'Weight of this neighbour. The center cell is the pixel itself.' }); inp.addEventListener('keydown', e => e.stopPropagation()); inp.addEventListener('change', () => { grid[i] = parseFloat(inp.value) || 0; update(); }); ins.push(inp); g.append(inp); } return g; };
    I.fxDialog({ title: 'Custom', tip: 'Design your own 5×5 convolution: each pixel becomes the weighted sum of its neighbours ÷ Scale + Offset.', width: 360, extra: mk,
      params: [sl('scale', 'Scale', 1, 100, 1, 'The weighted sum is divided by this.'), sl('offset', 'Offset', -255, 255, 0, 'Added to every result.'),
        { type: 'button', label: 'Edge detect preset', icon: 'grid', tip: 'Load a Laplacian edge kernel.', onClick: v => { const k = [0, 0, -1, 0, 0, 0, -1, -2, -1, 0, -1, -2, 16, -2, -1, 0, -1, -2, -1, 0, 0, 0, -1, 0, 0]; k.forEach((q, i) => { grid[i] = q; ins[i].value = q; }); } },
        { type: 'button', label: 'Sharpen preset', icon: 'target', tip: 'Load a sharpening kernel.', onClick: v => { const k = Array(25).fill(0); [7, 11, 13, 17].forEach(i => (k[i] = -1)); k[12] = 5; k.forEach((q, i) => { grid[i] = q; ins[i].value = q; }); } }],
      run: (s, v) => tc(X.convolve(rd(s), v.k || grid, 5, v.scale, v.offset)) });
  },
  highPass: D('High pass', 'Keeps only fine detail on a mid-grey background. Put it on a layer in Overlay or Soft light mode to sharpen.', [sl('radius', 'Radius', 0.1, 250, 10, 'Size of the detail kept.', { step: 0.1, unit: 'px' })], highPass),
  hsb: D('HSB / HSL', 'Converts colors into Hue, Saturation and Brightness (or Lightness) channels shown as red, green and blue.', [sel('mode', 'Row order', [['hsb', 'HSB'], ['hsl', 'HSL']], 'hsb', 'Which model to convert to.')], hsbHsl),
  maximum: D('Maximum', 'Spreads light areas and shrinks dark ones (dilation).', [sl('radius', 'Radius', 1, 50, 1, 'Distance.', { unit: 'px' }), sel('shape', 'Preserve', [['round', 'Roundness'], ['square', 'Squareness']], 'round', 'Shape of the spread.')], (s, v) => tc(X.morph(rd(s), v.radius, true, v.shape === 'round')), { heavy: true }),
  minimum: D('Minimum', 'Spreads dark areas and shrinks light ones (erosion).', [sl('radius', 'Radius', 1, 50, 1, 'Distance.', { unit: 'px' }), sel('shape', 'Preserve', [['round', 'Roundness'], ['square', 'Squareness']], 'round', 'Shape of the spread.')], (s, v) => tc(X.morph(rd(s), v.radius, false, v.shape === 'round')), { heavy: true }),
  offset: D('Offset', 'Slides the image — with "Wrap around" you can see and fix the seams of a repeating texture.', [sl('dx', 'Horizontal', -2000, 2000, 100, 'Pixels right.', { unit: 'px' }), sl('dy', 'Vertical', -2000, 2000, 100, 'Pixels down.', { unit: 'px' }), { ...EDGE, def: 'wrap' }], offset),
  // top level
  lensCorrection: D('Lens correction', 'Fixes lens problems: barrel/pincushion distortion, colored fringes (chromatic aberration), dark corners and converging lines.', [
    sl('distortion', 'Remove distortion', -100, 100, 0, 'Positive straightens lines that bow outward (barrel); negative fixes pincushion.'),
    head('Chromatic aberration'), sl('caR', 'Fix red / cyan fringe', -100, 100, 0, 'Shrinks or grows the red channel to line up with the others.'), sl('caG', 'Fix green / magenta fringe', -100, 100, 0, 'Adjusts the green channel.'), sl('caB', 'Fix blue / yellow fringe', -100, 100, 0, 'Adjusts the blue channel.'),
    head('Vignette'), sl('vignette', 'Amount', -100, 100, 0, 'Positive brightens dark corners; negative darkens them.'), sl('midpoint', 'Midpoint', 0, 100, 50, 'How far into the image the correction reaches.'),
    head('Transform'), sl('vpersp', 'Vertical perspective', -100, 100, 0, 'Fixes tall buildings that lean back.'), sl('hpersp', 'Horizontal perspective', -100, 100, 0, 'Fixes walls shot from an angle.'), sl('angle', 'Angle', -45, 45, 0, 'Straighten.', { step: 0.1, unit: '°' }), sl('scale', 'Scale', 50, 150, 100, 'Zoom in to hide empty edges.', { unit: '%' }),
    sel('edge', 'Edge', [['none', 'Transparency'], ['clamp', 'Edge extension']], 'none', 'What fills areas pulled in from outside the photo.')], lensCorrect, { heavy: true, width: 400 }),
  wideAngle: D('Adaptive wide angle', 'Straightens the curved lines of fish-eye and wide-angle lenses, or turns a 360° panorama into a normal view.', [
    sel('type', 'Correction', [['fisheye', 'Fisheye'], ['persp', 'Perspective'], ['sphere', 'Full spherical (360° panorama)']], 'fisheye', 'The kind of lens that took the photo.'),
    sl('focal', 'Focal length', 1, 50, 8, 'Focal length of the lens (smaller = wider = stronger correction).', { step: 0.1, unit: 'mm' }), sl('crop', 'Crop factor', 0.5, 4, 1, 'Sensor crop factor (1 = full frame, 1.5 = most APS-C).', { step: 0.05 }), sl('scale', 'Scale', 30, 200, 100, 'Zoom to fill or show more.', { unit: '%' }), sel('edge', 'Edge', [['none', 'Transparency'], ['clamp', 'Edge extension']], 'none', 'What fills empty areas.')], wideAngle, { heavy: true }),
  smartDenoise: D('Smart denoise', 'Strong, edge-aware noise reduction for high-ISO and low-light photos. Runs locally on your computer.', [sl('strength', 'Strength', 0, 100, 50, 'How much grain to remove.'), sl('color', 'Color noise', 0, 100, 60, 'Removes colored blotches.'), sl('detail', 'Keep detail', 0, 100, 40, 'Higher keeps more fine texture.')], (s, v) => tc(guidedDenoise(rd(s), v.strength, v.color, v.detail)), { heavy: true }),
  enhanceDetail: D('Enhance detail', 'Clean, halo-free multi-scale sharpening that brings out fine texture without boosting noise.', [sl('amount', 'Amount', 0, 200, 70, 'Strength.', { unit: '%' }), sl('fine', 'Detail size', 0, 100, 30, 'Small = micro texture, large = bigger structures.'), sl('noise', 'Noise threshold', 0, 100, 25, 'Ignore tiny variations so grain isn’t sharpened.')], (s, v) => tc(enhanceDetail(rd(s), v.amount, v.fine, v.noise)), { heavy: true }),
};
/* Image ▸ Adjustments additions */
const ADJ2 = I.ADJ2 = {
  photoFilter: D('Photo filter', 'Like a colored filter on the lens: warm, cool or any tint.', [sel('filter', 'Filter', [...Object.entries(PHOTO_FILTERS).map(([k, [l]]) => [k, l]), ['custom', 'Custom color…']], 'warm85', 'Which lens filter.'), col('color', 'Custom color', '#ec8a00', 'Used when Filter is "Custom color".'), sl('density', 'Density', 1, 100, 25, 'Strength.', { unit: '%' }), tg('lum', 'Preserve luminosity', true, 'Keep the brightness unchanged.')], photoFilter),
  channelMixer: D('Channel mixer', 'Builds each output color channel from a mix of the source channels — creative color and precise black & white.', [
    tg('mono', 'Monochrome', false, 'Make a black & white image from the Red output mix.'),
    head('Red output'), sl('rr', 'Red', -200, 200, 100, '', { unit: '%' }), sl('rg', 'Green', -200, 200, 0, '', { unit: '%' }), sl('rb', 'Blue', -200, 200, 0, '', { unit: '%' }), sl('rc', 'Constant', -200, 200, 0, '', { unit: '%' }),
    head('Green output'), sl('gr', 'Red', -200, 200, 0, '', { unit: '%' }), sl('gg', 'Green', -200, 200, 100, '', { unit: '%' }), sl('gb', 'Blue', -200, 200, 0, '', { unit: '%' }), sl('gc', 'Constant', -200, 200, 0, '', { unit: '%' }),
    head('Blue output'), sl('br', 'Red', -200, 200, 0, '', { unit: '%' }), sl('bg', 'Green', -200, 200, 0, '', { unit: '%' }), sl('bb', 'Blue', -200, 200, 100, '', { unit: '%' }), sl('bc', 'Constant', -200, 200, 0, '', { unit: '%' })], channelMixer,
    { width: 400, presets: { 'B&W with red filter': { mono: true, rr: 104, rg: -4, rb: 0 }, 'B&W with green filter': { mono: true, rr: 10, rg: 70, rb: 20 }, 'B&W infrared': { mono: true, rr: -70, rg: 200, rb: -30 }, 'Swap red & blue': { rr: 0, rb: 100, br: 100, bb: 0 } } }),
  gradientMap: D('Gradient map', 'Maps the brightness of the image onto a gradient — duotones, cinematic grades and false color.', [sel('preset', 'Gradient', [...Object.entries(GRADIENTS).map(([k, [l]]) => [k, l]), ['custom', 'Custom two colors']], 'bw', 'The colors from dark to light.'), col('c1', 'Custom dark', '#1b0533', 'Shadow color for "Custom".'), col('c2', 'Custom light', '#ffcf7a', 'Highlight color for "Custom".'), tg('reverse', 'Reverse', false, 'Flip the gradient.'), tg('dither', 'Dither', true, 'Avoids banding.')], gradientMap),
  selectiveColor: () => {
    const ranges = {}; SEL_RANGES.forEach(([k]) => (ranges[k] = { c: 0, m: 0, y: 0, k: 0 }));
    let cur = 'reds'; const sliders = [];
    const extra = (vals, update) => {
      vals.ranges = ranges;
      const rs = App.select({ label: 'Colors', value: cur, options: SEL_RANGES, tip: 'Which color family to adjust. Each keeps its own settings.', onChange: v => { cur = v; sliders.forEach(sv => sv.set(ranges[cur][sv._k])); } });
      for (const [k, label, tip] of [['c', 'Cyan', 'More cyan (less red) in this color family.'], ['m', 'Magenta', 'More magenta (less green).'], ['y', 'Yellow', 'More yellow (less blue).'], ['k', 'Black', 'Darker or lighter.']]) { const sv = App.slider({ label, min: -100, max: 100, value: 0, def: 0, unit: '%', tip, onInput: q => { ranges[cur][k] = q; update(); } }); sv._k = k; sliders.push(sv); }
      return h('div', null, rs, ...sliders);
    };
    I.fxDialog({ title: 'Selective color', tip: 'Adjust the amount of cyan, magenta, yellow and black in one color family — like a printer would.', extra, params: [sel('method', 'Method', [['rel', 'Relative'], ['abs', 'Absolute']], 'rel', 'Relative changes in proportion to what is there; absolute adds a fixed amount.')], run: selectiveColor });
  },
  shadowsHighlights: D('Shadows / highlights', 'Opens up dark shadows and recovers bright highlights, using each area’s surroundings — great for backlit photos.', [head('Shadows'), sl('shadows', 'Amount', 0, 100, 35, 'Brightens dark areas.', { unit: '%' }), sl('sTone', 'Tone', 0, 100, 50, 'How bright an area may be and still count as shadow.', { unit: '%' }), sl('sRadius', 'Radius', 1, 200, 30, 'Size of the surrounding area considered.', { unit: 'px' }), head('Highlights'), sl('highlights', 'Amount', 0, 100, 0, 'Darkens bright areas.', { unit: '%' }), sl('hTone', 'Tone', 0, 100, 50, 'How dark an area may be and still count as highlight.', { unit: '%' }), sl('hRadius', 'Radius', 1, 200, 30, 'Size of the surrounding area.', { unit: 'px' }), head('Adjustments'), sl('color', 'Color', -100, 100, 20, 'Saturation of the corrected areas.'), sl('midtone', 'Midtone', -100, 100, 0, 'Midtone contrast.')], shadowsHighlights, { heavy: true }),
  replaceColor: D('Replace color', 'Picks a color in the image (click it) and changes its hue, saturation and lightness everywhere it appears.', [pt('pick', 'Color to replace', [0.5, 0.5], 'Click a pixel with the color you want to change.'), sl('fuzz', 'Fuzziness', 0, 200, 40, 'How similar a color must be to be included.'), sl('hue', 'Hue', -180, 180, 0, 'New hue shift.', { unit: '°' }), sl('sat', 'Saturation', -100, 100, 0, 'More or less color.'), sl('light', 'Lightness', -100, 100, 0, 'Lighter or darker.')], replaceColor),
  colorLookup: D('Color lookup', 'Film and cinema color grades in one click.', [sel('look', 'Look', Object.entries(LOOKUPS).map(([k, [l]]) => [k, l]), 'teal', 'The grade.'), sl('opacity', 'Strength', 0, 100, 100, 'How strong the look is.', { unit: '%' })], colorLookup),
  hdr: D('HDR toning', 'Local tone mapping: compresses bright skies and dark foregrounds while boosting detail — the "HDR" look.', [sl('radius', 'Radius', 2, 200, 40, 'Size of the regions that get balanced.', { unit: 'px' }), sl('strength', 'Strength', 0, 100, 50, 'How much the tones are compressed.'), sl('gamma', 'Gamma', 0.4, 2.5, 1, 'Overall contrast.', { step: 0.01 }), sl('exposure', 'Exposure', -2, 2, 0, 'Overall brightness.', { step: 0.05, unit: 'EV' }), sl('detail', 'Detail', -100, 300, 60, 'Local detail boost.', { unit: '%' }), sl('vibrance', 'Vibrance', -100, 100, 15, 'Smart saturation.'), sl('saturation', 'Saturation', -100, 100, 0, 'Plain saturation.')], hdrToning, { heavy: true }),
  equalize: now('Equalize', equalize),
  desaturate: now('Desaturate', desaturate),
  autoTone: now('Auto tone', s => F.autoLevels(s)),
  autoContrast: now('Auto contrast', autoContrast),
  autoColor: now('Auto color', autoColor),
};

/* ---------- menus ---------- */
const it = (label, fn, tip, o = {}) => ({ label, action: fn, tip, ...o });
I.filterMenuItems = () => [
  { label: I.lastFilter ? `Last filter: ${I.lastFilter.title}` : 'Last filter', icon: 'redo', key: 'Ctrl+Alt+F', disabled: !I.lastFilter, tip: 'Run the previous filter again with the same settings.', action: I.repeatFilter },
  { sep: true },
  it('Filter Gallery…', () => I.filterGallery(), 'Over 40 artistic effects — painting, sketch, brush strokes and textures — with a large preview, stackable.', { icon: 'palette' }),
  it('Adaptive Wide Angle…', FX.wideAngle, 'Straighten curved lines from fish-eye and wide lenses, or flatten a 360° panorama.', { icon: 'expand', key: 'Alt+Shift+Ctrl+A' }),
  it('Camera Raw Filter…', () => I.cameraRaw(), 'The full photo-development workspace: light, color, curves, color grading, detail, optics, lens blur, masks and more.', { icon: 'camera', key: 'Shift+Ctrl+A' }),
  it('Smart Denoise…', FX.smartDenoise, 'Strong edge-aware noise reduction for grainy photos (runs locally).', { icon: 'sparkle' }),
  it('Enhance Detail…', FX.enhanceDetail, 'Halo-free sharpening that brings out texture.', { icon: 'target' }),
  it('Lens Correction…', FX.lensCorrection, 'Fix distortion, colored fringes, dark corners and perspective.', { icon: 'pip', key: 'Shift+Ctrl+R' }),
  it('Liquify…', () => I.liquify(), 'Push, pull, twirl, pucker and bloat pixels with a brush — reshape anything.', { icon: 'drop', key: 'Shift+Ctrl+X' }),
  { sep: true },
  { label: 'Blur', icon: 'blur', tip: 'Soften the image in many different ways.', sub: () => [it('Average', FX.average, 'Fills the layer (or selection) with its average color.'), it('Blur', FX.blur, 'A light, even softening.'), it('Blur More', FX.blurMore, 'A stronger light softening.'), it('Box Blur…', FX.boxBlur, 'Flat square-average blur.'), it('Gaussian Blur…', FX.gaussian, 'Smooth, natural blur.'), it('Lens Blur…', FX.lensBlur, 'Lens-style blur with bokeh highlights and optional depth map.'), it('Motion Blur…', FX.motion, 'Directional streaks.'), it('Radial Blur…', FX.radial, 'Spin or zoom blur around a point.'), it('Smart Blur…', FX.smartBlur, 'Edge-preserving blur.'), it('Surface Blur…', FX.surface, 'Smooths surfaces, keeps edges.')] },
  { label: 'Blur Gallery', icon: 'blur', tip: 'Creative depth-of-field blurs with on-image controls.', sub: () => [it('Field Blur…', FX.field, 'Blur that fades between two pins.'), it('Iris Blur…', FX.iris, 'Sharp oval, blurred surroundings.'), it('Tilt-Shift…', FX.tilt, 'Miniature-world effect.'), it('Spin Blur…', FX.spinBlur, 'Spinning wheels and fans.')] },
  { label: 'Distort', icon: 'wave', tip: 'Bend, twist and warp the image.', sub: () => [it('Displace…', FX.displace, 'Push pixels with a map.'), it('Pinch…', FX.pinch, 'Squeeze toward the center.'), it('Polar Coordinates…', FX.polar, 'Tiny-planet wrap or unwrap.'), it('Ripple…', FX.ripple, 'Water-like wobble.'), it('Shear…', FX.shear, 'Bend along a curve.'), it('Spherize…', FX.spherize, 'Fish-eye bulge.'), it('Twirl…', FX.twirl, 'Swirl around a point.'), it('Wave…', FX.wave, 'Overlapping waves.'), it('ZigZag…', FX.zigzag, 'Pond ripples.')] },
  { label: 'Noise', icon: 'dice', tip: 'Add grain, or remove noise, dust and scratches.', sub: () => [it('Add Noise…', FX.addNoise, 'Film grain.'), it('Despeckle', FX.despeckle, 'Removes fine noise while keeping edges.'), it('Dust & Scratches…', FX.dust, 'Removes small specks.'), it('Median…', FX.median, 'Median smoothing.'), it('Reduce Noise…', FX.reduceNoise, 'Removes grain and color blotches.')] },
  { label: 'Pixelate', icon: 'grid', tip: 'Cells, dots and blocks.', sub: () => [it('Color Halftone…', FX.halftone, 'Printed CMYK dots.'), it('Crystallize…', FX.crystallize, 'Crystal cells.'), it('Facet', FX.facet, 'Clumps similar colors into flat facets.'), it('Fragment', FX.fragment, 'Four offset copies — a shaky double-vision look.'), it('Mezzotint…', FX.mezzotint, 'Dots, lines or strokes.'), it('Mosaic…', FX.mosaic, 'Square blocks.'), it('Pointillize…', FX.pointillize, 'Dots of paint.')] },
  { label: 'Render', icon: 'sun', tip: 'Generate clouds, fibres, flares and light.', sub: () => [it('Clouds', FX.clouds, 'Soft clouds from the primary and secondary colors (replaces the layer).'), it('Difference Clouds', FX.diffClouds, 'Clouds blended in Difference mode — marble-like.'), it('Fibers…', FX.fibers, 'Woven-fibre texture.'), it('Lens Flare…', FX.lensFlare, 'Bright camera lens flare.'), it('Lighting Effects…', FX.lighting, 'Relight with a spot or point light.')] },
  { label: 'Sharpen', icon: 'target', tip: 'Crisper edges and detail.', sub: () => [it('Sharpen', FX.sharpen, 'Light sharpening.'), it('Sharpen Edges', FX.sharpenEdges, 'Sharpens edges only.'), it('Sharpen More', FX.sharpenMore, 'Stronger sharpening.'), it('Smart Sharpen…', FX.smartSharpen, 'Advanced sharpening with noise and tone control.'), it('Unsharp Mask…', FX.unsharp, 'Classic sharpening.')] },
  { label: 'Stylize', icon: 'sparkle', tip: 'Graphic and artistic effects.', sub: () => [it('Diffuse…', FX.diffuse, 'Frosted-glass shuffle.'), it('Emboss…', FX.emboss, 'Grey relief.'), it('Extrude…', FX.extrude, '3-D blocks or pyramids.'), it('Find Edges', FX.findEdges, 'Colored edge outlines on white.'), it('Oil Paint…', FX.oil, 'Oil painting with brush texture.'), it('Solarize', FX.solarize, 'Mix of negative and positive.'), it('Tiles…', FX.tiles, 'Shifted tiles.'), it('Trace Contour…', FX.trace, 'Contour lines.'), it('Wind…', FX.wind, 'Wind streaks.'), { sep: true }, it('Glow…', FX.glow, 'Soft bloom on highlights.'), it('Vignette…', FX.vignette, 'Darken the edges.')] },
  { label: 'Video', icon: 'film', tip: 'Fixes for frames from video.', sub: () => [it('De-Interlace…', FX.deinterlace, 'Remove interlacing lines.'), it('NTSC Colors', FX.ntsc, 'Limit colors to broadcast-safe values.')] },
  { label: 'Other', icon: 'sliders', tip: 'Technical filters.', sub: () => [it('Custom…', FX.custom, 'Your own 5×5 convolution kernel.'), it('High Pass…', FX.highPass, 'Fine detail on grey — for sharpening layers.'), it('HSB/HSL…', FX.hsb, 'Convert to hue/saturation channels.'), it('Maximum…', FX.maximum, 'Grow light areas.'), it('Minimum…', FX.minimum, 'Grow dark areas.'), it('Offset…', FX.offset, 'Slide and wrap the image.')] },
];
I.adjustExtraItems = () => [
  { sep: true },
  it('Auto Tone', ADJ2.autoTone, 'Stretches each color channel to the full range.', { icon: 'sparkle', key: 'Shift+Ctrl+L' }),
  it('Auto Contrast', ADJ2.autoContrast, 'Stretches brightness without changing colors.', { icon: 'contrast', key: 'Alt+Shift+Ctrl+L' }),
  it('Auto Color', ADJ2.autoColor, 'Neutralises color casts and stretches tones.', { icon: 'palette', key: 'Shift+Ctrl+B' }),
  { sep: true },
  it('Shadows / Highlights…', ADJ2.shadowsHighlights, 'Open up shadows, recover highlights.', { icon: 'sun' }),
  it('HDR Toning…', ADJ2.hdr, 'Local tone mapping for an HDR look.', { icon: 'sun' }),
  it('Photo Filter…', ADJ2.photoFilter, 'Warming, cooling or colored lens filter.', { icon: 'drop' }),
  it('Channel Mixer…', ADJ2.channelMixer, 'Mix color channels; creative B&W.', { icon: 'sliders' }),
  it('Color Lookup…', ADJ2.colorLookup, 'Film and cinema looks.', { icon: 'film' }),
  it('Gradient Map…', ADJ2.gradientMap, 'Map tones onto a gradient.', { icon: 'gradient' }),
  it('Selective Color…', ADJ2.selectiveColor, 'CMYK tweaks per color family.', { icon: 'palette' }),
  it('Replace Color…', ADJ2.replaceColor, 'Recolor one color everywhere.', { icon: 'dropper' }),
  it('Equalize', ADJ2.equalize, 'Spreads brightness evenly across the tonal range.', { icon: 'analyze' }),
  it('Desaturate', ADJ2.desaturate, 'Remove all color.', { icon: 'contrast', key: 'Shift+Ctrl+U' }),
];
I.filterKeys = () => ({
  'ctrl+alt+f': I.repeatFilter, 'ctrl+shift+a': () => I.cameraRaw(), 'ctrl+alt+shift+a': FX.wideAngle, 'ctrl+shift+r': FX.lensCorrection, 'ctrl+shift+x': () => I.liquify(),
  'ctrl+shift+l': ADJ2.autoTone, 'ctrl+alt+shift+l': ADJ2.autoContrast, 'ctrl+shift+b': ADJ2.autoColor, 'ctrl+shift+u': ADJ2.desaturate,
});
})();
