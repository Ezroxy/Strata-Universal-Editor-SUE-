/* Image editor — pixel engine shared by the Photoshop-style filters, Filter Gallery, Liquify and Camera Raw.
   Everything works on plain typed arrays (fast, no canvas round-trips) and returns new canvases. */
(() => {
'use strict';
const App = window.App, F = App.IF;
const X = F.X = {};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
X.clamp = clamp;

/* ---------- canvas ↔ ImageData ---------- */
X.read = cv => F.data(cv);
X.toCanvas = (img) => { const c = App.canvas(img.width, img.height); c.getContext('2d').putImageData(img, 0, 0); return c; };
X.blank = (w, h) => new ImageData(w, h);
X.copy = img => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
/** run fn(srcData, outData, w, h) and return a canvas */
X.op = (src, fn) => {
  const a = X.read(src), b = new ImageData(new Uint8ClampedArray(a.data), a.width, a.height);
  fn(a.data, b.data, a.width, a.height);
  return X.toCanvas(b);
};
/** resample a canvas to a scale factor (used to run slow filters on a smaller copy) */
X.scaled = (src, k) => {
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const c = App.canvas(w, h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); return c;
};
X.resizeTo = (src, w, h) => { const c = App.canvas(w, h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); return c; };

/* ---------- planes (Float32, one value per pixel) ---------- */
X.lum = (d, n) => { const p = new Float32Array(n); for (let i = 0, j = 0; j < n; i += 4, j++) p[j] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return p; };
X.channel = (d, n, c) => { const p = new Float32Array(n); for (let i = c, j = 0; j < n; i += 4, j++) p[j] = d[i]; return p; };
/** box blur of a plane (separable running sum, clamped edges); returns a new plane */
X.boxPlane = (src, w, h, r) => {
  r = Math.round(r);
  if (r < 1) return Float32Array.from(src);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w; let s = src[row] * (r + 1);
    for (let x = 1; x <= r; x++) s += src[row + Math.min(w - 1, x)];
    for (let x = 0; x < w; x++) { tmp[row + x] = s * k; s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = tmp[x] * (r + 1);
    for (let y = 1; y <= r; y++) s += tmp[Math.min(h - 1, y) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s * k; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
};
/** gaussian approximation: three box passes */
X.gaussPlane = (p, w, h, sigma) => {
  if (sigma < 0.4) return Float32Array.from(p);
  const n = 3, wIdeal = Math.sqrt(12 * sigma * sigma / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  let out = p;
  for (let i = 0; i < n; i++) out = X.boxPlane(out, w, h, ((i < m ? wl : wl + 2) - 1) / 2);
  return out;
};
/** blur all four channels of ImageData (premultiplied so transparent edges don't darken) */
X.blurImg = (img, sigma, box = false) => {
  const { width: w, height: h, data: d } = img, n = w * h;
  const a = X.channel(d, n, 3), ch = [0, 1, 2].map(c => { const p = new Float32Array(n); for (let i = c, j = 0; j < n; i += 4, j++) p[j] = d[i] * d[j * 4 + 3] / 255; return p; });
  const bl = q => (box ? X.boxPlane(q, w, h, sigma) : X.gaussPlane(q, w, h, sigma));
  const A = bl(a), C = ch.map(bl), out = new ImageData(w, h), o = out.data;
  for (let j = 0, i = 0; j < n; j++, i += 4) { const al = A[j]; o[i + 3] = al; const k = al > 0.01 ? 255 / al : 0; o[i] = C[0][j] * k; o[i + 1] = C[1][j] * k; o[i + 2] = C[2][j] * k; }
  return out;
};
/** Sobel gradient magnitude (0–~1) and direction of a plane */
X.sobel = (p, w, h) => {
  const mag = new Float32Array(w * h), ang = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1) * w, y1 = y * w, y2 = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1), x2 = Math.min(w - 1, x + 1);
      const gx = (p[y0 + x2] + 2 * p[y1 + x2] + p[y2 + x2]) - (p[y0 + x0] + 2 * p[y1 + x0] + p[y2 + x0]);
      const gy = (p[y2 + x0] + 2 * p[y2 + x] + p[y2 + x2]) - (p[y0 + x0] + 2 * p[y0 + x] + p[y0 + x2]);
      mag[y1 + x] = Math.hypot(gx, gy) / 1020; ang[y1 + x] = Math.atan2(gy, gx);
    }
  }
  return { mag, ang };
};

/* ---------- sampling & warping ---------- */
/** bilinear sample of ImageData at (x, y) into out[o..o+3]; edge: 'clamp' | 'wrap' | 'none' (transparent) */
X.sample = (sd, w, h, x, y, out, o, edge) => {
  if (edge === 'wrap') { x = ((x % w) + w) % w; y = ((y % h) + h) % h; }
  else if (edge === 'none' && (x < -0.5 || y < -0.5 || x > w - 0.5 || y > h - 0.5)) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; return; }
  x = clamp(x - 0.5, 0, w - 1); y = clamp(y - 0.5, 0, h - 1);
  const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  const a = (1 - fx) * (1 - fy), b = fx * (1 - fy), c = (1 - fx) * fy, e = fx * fy;
  out[o] = sd[i00] * a + sd[i10] * b + sd[i01] * c + sd[i11] * e;
  out[o + 1] = sd[i00 + 1] * a + sd[i10 + 1] * b + sd[i01 + 1] * c + sd[i11 + 1] * e;
  out[o + 2] = sd[i00 + 2] * a + sd[i10 + 2] * b + sd[i01 + 2] * c + sd[i11 + 2] * e;
  out[o + 3] = sd[i00 + 3] * a + sd[i10 + 3] * b + sd[i01 + 3] * c + sd[i11 + 3] * e;
};
/** backward warp: map(x, y, p) writes the source position for output pixel (x, y) into p[0], p[1] (pixel centers at +0.5) */
X.warp = (src, map, edge = 'clamp') => {
  const a = X.read(src), w = a.width, h = a.height, sd = a.data, out = new ImageData(w, h), o = out.data, p = [0, 0];
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) { p[0] = x + 0.5; p[1] = y + 0.5; map(x + 0.5, y + 0.5, p); X.sample(sd, w, h, p[0], p[1], o, i, edge); }
  return X.toCanvas(out);
};

/* ---------- neighbourhood filters ---------- */
/** median of each channel within a square radius (Huang sliding histogram) */
X.median = (img, r, pct = 0.5) => {
  const { width: w, height: h, data: d } = img, out = new ImageData(new Uint8ClampedArray(d), w, h), o = out.data;
  r = Math.max(1, Math.round(r));
  const win = (2 * r + 1) * (2 * r + 1), target = Math.max(1, Math.round(win * pct));
  for (let c = 0; c < 3; c++) {
    const hist = new Uint16Array(256);
    for (let y = 0; y < h; y++) {
      hist.fill(0);
      for (let dy = -r; dy <= r; dy++) { const yy = clamp(y + dy, 0, h - 1) * w; for (let dx = -r; dx <= r; dx++) hist[d[(yy + clamp(dx, 0, w - 1)) * 4 + c]]++; }
      for (let x = 0; x < w; x++) {
        let acc = 0, v = 0; while (v < 255 && (acc += hist[v]) < target) v++;
        o[(y * w + x) * 4 + c] = v;
        const xo = clamp(x - r, 0, w - 1), xi = clamp(x + r + 1, 0, w - 1);
        for (let dy = -r; dy <= r; dy++) { const yy = clamp(y + dy, 0, h - 1) * w; hist[d[(yy + xo) * 4 + c]]--; hist[d[(yy + xi) * 4 + c]]++; }
      }
    }
  }
  return out;
};
/** edge-preserving (surface / bilateral-style) blur: averages neighbours whose colour is within `thr` */
X.surface = (img, radius, thr, hard = false) => {
  const { width: w, height: h, data: d } = img, out = new ImageData(new Uint8ClampedArray(d), w, h), o = out.data;
  const r = Math.max(1, Math.round(radius)), step = Math.max(1, Math.round(r / 5)), t = Math.max(1, thr) * 2.5;
  const offs = [];
  for (let dy = -r; dy <= r; dy += step) for (let dx = -r; dx <= r; dx += step) if (dx * dx + dy * dy <= r * r) offs.push([dx, dy]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
    let sr = 0, sg = 0, sb = 0, sw = 0;
    for (const [dx, dy] of offs) {
      const j = (clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)) * 4;
      const diff = (Math.abs(d[j] - R) + Math.abs(d[j + 1] - G) + Math.abs(d[j + 2] - B)) / 3;
      const wt = hard ? (diff < thr ? 1 : 0) : Math.max(0, 1 - diff / t);
      sr += d[j] * wt; sg += d[j + 1] * wt; sb += d[j + 2] * wt; sw += wt;
    }
    if (sw > 0) { o[i] = sr / sw; o[i + 1] = sg / sw; o[i + 2] = sb / sw; }
  }
  return out;
};
/** morphological max / min (Photoshop Maximum / Minimum). round: octagon (square ⊕ diamond) ≈ circle; else square */
X.morph = (img, r, max, round = true) => {
  const { width: w, height: h, data: d } = img;
  r = Math.max(1, Math.round(r));
  // one 1-D pass along (dx, dy) over ±len steps
  const pass = (src, dx, dy, len) => {
    if (len < 1) return src;
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        let v = src[i + c];
        for (let k = -len; k <= len; k++) { const s = src[(clamp(y + k * dy, 0, h - 1) * w + clamp(x + k * dx, 0, w - 1)) * 4 + c]; if (max ? s > v : s < v) v = s; }
        out[i + c] = v;
      }
    }
    return out;
  };
  const a = round ? Math.max(1, Math.round(r * 0.414)) : r, k = round ? Math.round(r * 0.293) : 0;
  let res = pass(pass(d, 1, 0, a), 0, 1, a);
  if (k) res = pass(pass(res, 1, 1, k), 1, -1, k);
  return new ImageData(res, w, h);
};
/** 2-D convolution with an arbitrary odd-sized kernel */
X.convolve = (img, k, size, scale = 1, offset = 0) => {
  const { width: w, height: h, data: d } = img, out = new ImageData(new Uint8ClampedArray(d), w, h), o = out.data, r = (size - 1) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sr = 0, sg = 0, sb = 0;
    for (let ky = -r; ky <= r; ky++) { const yy = clamp(y + ky, 0, h - 1) * w; for (let kx = -r; kx <= r; kx++) { const kv = k[(ky + r) * size + kx + r]; if (!kv) continue; const j = (yy + clamp(x + kx, 0, w - 1)) * 4; sr += d[j] * kv; sg += d[j + 1] * kv; sb += d[j + 2] * kv; } }
    const i = (y * w + x) * 4; o[i] = sr / scale + offset; o[i + 1] = sg / scale + offset; o[i + 2] = sb / scale + offset;
  }
  return out;
};

/* ---------- noise & textures ---------- */
/** seeded PRNG (mulberry32) */
X.rng = (seed = 1) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
X.gauss = rnd => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/** smooth value noise in [0,1], `scale` = feature size in px, `oct` octaves of fractal detail */
X.fractal = (w, h, scale, oct = 5, seed = 7, persistence = 0.5) => {
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0, s = Math.max(2, scale);
  for (let o = 0; o < oct; o++) {
    const gw = Math.ceil(w / s) + 2, gh = Math.ceil(h / s) + 2, rnd = X.rng(seed * 131 + o * 977), g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y < h; y++) {
      const gy = y / s, y0 = gy | 0, fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < w; x++) {
        const gx = x / s, x0 = gx | 0, fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], e = g[(y0 + 1) * gw + x0 + 1];
        out[y * w + x] += ((a + (b - a) * sx) * (1 - sy) + (c + (e - c) * sx) * sy) * amp;
      }
    }
    tot += amp; amp *= persistence; s = Math.max(1, s / 2);
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
};
/** jittered-grid Voronoi: cell index per pixel plus distance to the nearest edge (for borders/cracks) */
X.voronoi = (w, h, size, seed = 3) => {
  const s = Math.max(3, size), gw = Math.ceil(w / s) + 1, gh = Math.ceil(h / s) + 1, rnd = X.rng(seed);
  const px = new Float32Array(gw * gh), py = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { const i = gy * gw + gx; px[i] = (gx + 0.1 + rnd() * 0.8) * s; py[i] = (gy + 0.1 + rnd() * 0.8) * s; }
  const cell = new Int32Array(w * h), edge = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = (x / s) | 0, cy = (y / s) | 0;
    let b1 = Infinity, b2 = Infinity, bi = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy; if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
      const i = gy * gw + gx, dd = (px[i] - x) ** 2 + (py[i] - y) ** 2;
      if (dd < b1) { b2 = b1; b1 = dd; bi = i; } else if (dd < b2) b2 = dd;
    }
    cell[y * w + x] = bi; edge[y * w + x] = (Math.sqrt(b2) - Math.sqrt(b1)) / 2;
  }
  return { cell, edge, px, py, count: gw * gh };
};
/** average colour of each Voronoi cell */
X.cellColors = (d, cell, count, n) => {
  const s = new Float64Array(count * 4), c = new Uint32Array(count);
  for (let j = 0, i = 0; j < n; j++, i += 4) { const k = cell[j]; s[k * 4] += d[i]; s[k * 4 + 1] += d[i + 1]; s[k * 4 + 2] += d[i + 2]; s[k * 4 + 3] += d[i + 3]; c[k]++; }
  for (let k = 0; k < count; k++) if (c[k]) for (let q = 0; q < 4; q++) s[k * 4 + q] /= c[k];
  return s;
};

/* ---------- variable blur (blur gallery, lens blur) ---------- */
/**
 * Blur with a different radius at every pixel. `rad` is a Float32Array of radii (px) per pixel.
 * Builds a small stack of progressively blurred copies and blends the two nearest per pixel.
 * bokeh > 0 boosts bright highlights before blurring so they bloom into discs.
 */
X.varBlur = (img, rad, maxR, { bokeh = 0, threshold = 200 } = {}) => {
  const { width: w, height: h } = img, n = w * h;
  let base = img;
  if (bokeh > 0) {
    base = X.copy(img); const b = base.data;
    for (let i = 0; i < b.length; i += 4) { const L = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]; if (L > threshold) { const k = 1 + bokeh * ((L - threshold) / (255 - threshold)) * 2.5; b[i] *= k; b[i + 1] *= k; b[i + 2] *= k; } }
  }
  const levels = [0, 0.15, 0.32, 0.55, 0.78, 1].map(f => f * maxR);
  const stack = levels.map(r => (r < 0.5 ? (bokeh > 0 ? null : img) : X.blurImg(base, r * 0.55)));
  stack[0] = img;
  const out = new ImageData(w, h), o = out.data;
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    const r = clamp(rad[j], 0, maxR);
    let k = 1; while (k < levels.length - 1 && levels[k] < r) k++;
    const lo = levels[k - 1], hi = levels[k], t = hi > lo ? (r - lo) / (hi - lo) : 0, A = stack[k - 1].data, B = stack[k].data;
    o[i] = A[i] + (B[i] - A[i]) * t; o[i + 1] = A[i + 1] + (B[i + 1] - A[i + 1]) * t; o[i + 2] = A[i + 2] + (B[i + 2] - A[i + 2]) * t; o[i + 3] = A[i + 3] + (B[i + 3] - A[i + 3]) * t;
  }
  return out;
};
/** disc-shaped (bokeh) blur: averages samples on rings inside a polygon/circle aperture */
X.bokehBlur = (img, radius, { blades = 0, rotation = 0, boost = 0, threshold = 210 } = {}) => {
  const { width: w, height: h, data: d } = img, n = w * h;
  const r = Math.max(1, radius), lin = new Float32Array(n * 3);
  for (let j = 0, i = 0; j < n; j++, i += 4) for (let c = 0; c < 3; c++) {
    let v = d[i + c] / 255; v = v * v;   // roughly linear light so highlights dominate like real bokeh
    const L = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    if (boost && L > threshold) v *= 1 + boost * 3 * (L - threshold) / (255 - threshold);
    lin[j * 3 + c] = v;
  }
  const offs = [], rings = Math.max(2, Math.min(7, Math.round(r / 2.5)));
  const inShape = (x, y) => {
    if (!blades) return true;
    const a = Math.atan2(y, x) - rotation, seg = 2 * Math.PI / blades, t = ((a % seg) + seg) % seg - seg / 2;
    return Math.hypot(x, y) * Math.cos(t) <= r * Math.cos(Math.PI / blades) + 0.01;
  };
  offs.push([0, 0]);
  for (let k = 1; k <= rings; k++) { const rr = r * k / rings, cnt = Math.max(6, Math.round(2 * Math.PI * rr / Math.max(1.2, r / rings))); for (let q = 0; q < cnt; q++) { const a = q / cnt * 2 * Math.PI + k * 0.37, x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (inShape(x, y)) offs.push([Math.round(x), Math.round(y)]); } }
  const acc = new Float32Array(n * 3);
  for (const [dx, dy] of offs) for (let y = 0; y < h; y++) { const sy = clamp(y + dy, 0, h - 1) * w; for (let x = 0; x < w; x++) { const s = (sy + clamp(x + dx, 0, w - 1)) * 3, t = (y * w + x) * 3; acc[t] += lin[s]; acc[t + 1] += lin[s + 1]; acc[t + 2] += lin[s + 2]; } }
  const out = new ImageData(new Uint8ClampedArray(d), w, h), o = out.data, inv = 1 / offs.length;
  for (let j = 0, i = 0; j < n; j++, i += 4) for (let c = 0; c < 3; c++) o[i + c] = Math.sqrt(Math.max(0, acc[j * 3 + c] * inv)) * 255;
  return out;
};

/* ---------- colour helpers ---------- */
X.rgbToHsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn; let hh = 0; if (dd) { if (mx === r) hh = ((g - b) / dd + 6) % 6; else if (mx === g) hh = (b - r) / dd + 2; else hh = (r - g) / dd + 4; } return [hh / 6, mx ? dd / mx : 0, mx]; };
X.hsvToRgb = (hh, s, v) => { const f = k => { const q = (k + hh * 6) % 6; return v - v * s * Math.max(0, Math.min(q, 4 - q, 1)); }; return [f(5), f(3), f(1)]; };
X.hex = c => App.hexToRgb(c || '#000000');
/** map luminance 0..1 between two colours (sketch filters use foreground / background) */
X.duo = (o, i, t, A, B) => { t = clamp(t, 0, 1); o[i] = A[0] + (B[0] - A[0]) * t; o[i + 1] = A[1] + (B[1] - A[1]) * t; o[i + 2] = A[2] + (B[2] - A[2]) * t; };
})();
