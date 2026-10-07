/* Strata Studio — Camera Raw processing engine. Pure typed-array code (no DOM) so it runs in a Web Worker.
   CR.process(full, fw, fh, S, aux, cache, tile) renders one tile (or the whole image) of the full frame.
   Everything position-dependent (geometry, masks, vignettes, grain, depth) uses full-frame coordinates and
   every radius scales with the frame size, so previews, proxies and tiled full-size renders all match.
   Stage order mirrors Adobe Camera Raw: geometry → noise reduction & defringe → white balance, calibration,
   exposure → dehaze → profile & tone (locally adaptive highlights/shadows) → curves → texture & clarity →
   colour (vibrance, mixer / B&W, grading) → local masks → lens blur → sharpening → glow, vignette, grain. */
(function (G) {
'use strict';
const CR = G.CR = {};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / ((b - a) || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
const LW = [0.2126, 0.7152, 0.0722];
CR.clamp = clamp;

/* ---------- defaults ---------- */
const HUES = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
const HUE_C = [0, 30, 60, 120, 180, 240, 275, 315];
CR.HUES = HUES;
const zeros = () => Object.fromEntries(HUES.map(k => [k, 0]));
CR.defaults = () => ({
  profile: 'color', profileAmount: 100,
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  wb: 'shot', temp: 0, tint: 0, vibrance: 0, saturation: 0,
  texture: 0, clarity: 0, dehaze: 0,
  vigAmount: 0, vigMid: 50, vigRound: 0, vigFeather: 50, vigHigh: 0, vigStyle: 'hp',
  grain: 0, grainSize: 25, grainRough: 50, glow: 0, glowSize: 50,
  pcHigh: 0, pcLights: 0, pcDarks: 0, pcShadows: 0, split1: 25, split2: 50, split3: 75,
  curve: [[0, 0], [255, 255]], curveR: [[0, 0], [255, 255]], curveG: [[0, 0], [255, 255]], curveB: [[0, 0], [255, 255]],
  hue: zeros(), sat: zeros(), lum: zeros(), bw: zeros(),
  cg: { sh: { h: 220, s: 0, l: 0 }, mid: { h: 30, s: 0, l: 0 }, hi: { h: 40, s: 0, l: 0 }, glob: { h: 0, s: 0, l: 0 }, blend: 50, balance: 0 },
  sharpen: 0, sharpRadius: 1, sharpDetail: 25, sharpMask: 0,
  nr: 0, nrDetail: 50, nrContrast: 0, cnr: 0, cnrDetail: 50, cnrSmooth: 50,
  distortion: 0, lensVig: 0, lensVigMid: 50, removeCA: false, purpleAmt: 0, purpleLo: 30, purpleHi: 70, greenAmt: 0, greenLo: 40, greenHi: 60,
  upright: 'off', gVert: 0, gHorz: 0, gRot: 0, gAspect: 0, gScale: 100, gX: 0, gY: 0,
  crop: { x: 0, y: 0, w: 1, h: 1, angle: 0, aspect: 'shot' },
  lb: { on: false, amount: 50, bokeh: 'circle', catEye: 0, boost: 50, near: 0, far: 25, viz: false },
  cal: { shTint: 0, rH: 0, rS: 0, gH: 0, gS: 0, bH: 0, bS: 0 },
  masks: [], off: {},
});
CR.LOCAL_KEYS = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temp', 'tint', 'hue', 'saturation', 'texture', 'clarity', 'dehaze', 'sharpness'];
CR.localDefaults = () => Object.fromEntries(CR.LOCAL_KEYS.map(k => [k, 0]));
/** tile overlap needed so blur-based stages are exact at tile borders */
CR.margin = (fw, fh) => Math.ceil(175 * Math.hypot(fw, fh) / 2000 + 12);

/* ---------- numeric toolbox ---------- */
// linear ↔ display use the exact sRGB curves, so an untouched image comes back unchanged
const enc = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const L2S = new Float32Array(16385);
for (let i = 0; i <= 16384; i++) L2S[i] = enc(i / 16384);
const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
CR.S2L = S2L;
const toDisp = x => { if (x <= 0) return 0; if (x >= 1) return enc(x); const f = x * 16384, i = f | 0; return L2S[i] + (L2S[i + 1] - L2S[i]) * (f - i); };
const boxPlane = (src, w, h, r) => {
  r = Math.round(r); if (r < 1) return Float32Array.from(src);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) { const row = y * w; let s = src[row] * (r + 1); for (let x = 1; x <= r; x++) s += src[row + Math.min(w - 1, x)]; for (let x = 0; x < w; x++) { tmp[row + x] = s * k; s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = tmp[x] * (r + 1); for (let y = 1; y <= r; y++) s += tmp[Math.min(h - 1, y) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s * k; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
};
const gauss = (p, w, h, sigma) => {
  if (sigma < 0.4) return Float32Array.from(p);
  const n = 3, wi = Math.sqrt(12 * sigma * sigma / n + 1); let wl = Math.floor(wi); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  let o = p; for (let i = 0; i < n; i++) o = boxPlane(o, w, h, ((i < m ? wl : wl + 2) - 1) / 2); return o;
};
CR.gauss = gauss;
const minFilter = (p, w, h, r) => {
  const a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = Infinity; for (let k = -r; k <= r; k++) { const v = p[y * w + clamp(x + k, 0, w - 1)]; if (v < m) m = v; } a[y * w + x] = m; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = Infinity; for (let k = -r; k <= r; k++) { const v = a[clamp(y + k, 0, h - 1) * w + x]; if (v < m) m = v; } b[y * w + x] = m; }
  return b;
};
/** monotone cubic curve through points (0..255) → 256-entry LUT */
CR.curveLut = pts => {
  const p = pts.slice().sort((a, b) => a[0] - b[0]), n = p.length, xs = p.map(q => q[0]), ys = p.map(q => q[1]), lut = new Float32Array(256);
  if (n < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
  const dx = [], m = [], d = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / Math.max(1e-6, dx[i]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  for (let x = 0; x < 256; x++) {
    if (x <= xs[0]) { lut[x] = ys[0]; continue; } if (x >= xs[n - 1]) { lut[x] = ys[n - 1]; continue; }
    let k = 0; while (k < n - 2 && x > xs[k + 1]) k++;
    const hh = dx[k], t = (x - xs[k]) / hh, t2 = t * t, t3 = t2 * t;
    lut[x] = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * hh * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * hh * m[k + 1];
  }
  return lut;
};
const isIdentityCurve = c => !c || (c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 255 && c[1][1] === 255);
const lutAt = (lut, v) => { const x = clamp(v, 0, 1) * 255, i = Math.min(254, x | 0), f = x - i; return (lut[i] + (lut[i + 1] - lut[i]) * f) / 255; };
const hsv = (h, s, v) => { const f = k => { const q = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(q, 4 - q, 1)); }; return [f(5), f(3), f(1)]; };
CR.hsv = hsv;
/** chroma direction for a hue (zero-luminance vector) */
const hueVec = hue => { const [r, g, b] = hsv(((hue % 360) + 360) % 360, 1, 1), L = LW[0] * r + LW[1] * g + LW[2] * b; return [r - L, g - L, b - L]; };
/** coordinate-hashed value noise in [-1, 1] — seamless across tiles because it only depends on (gx, gy) */
const hash = (x, y, s) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h & 0xffff) / 32768 - 1; };
const vnoise = (gx, gy, sc, seed) => { const fx = gx / sc, fy = gy / sc, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed); return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy; };

/* ---------- geometry: lens distortion, upright transform, crop angle, CA (one resample) ---------- */
CR.hasGeometry = S => !!(S.distortion || S.gRot || S.gScale !== 100 || S.gVert || S.gHorz || S.gAspect || S.gX || S.gY || (S.crop && S.crop.angle) || (S.removeCA && S._ca && (S._ca[0] || S._ca[1])));
function geometry(src, fw, fh, S, T) {
  const w = T.w, h = T.h, out = new Uint8ClampedArray(w * h * 4);
  if (!CR.hasGeometry(S)) {
    for (let y = 0; y < h; y++) { const sy = clamp(y + T.y0, 0, fh - 1); out.set(src.subarray((sy * fw + clamp(T.x0, 0, fw - 1)) * 4, (sy * fw + clamp(T.x0, 0, fw - 1)) * 4 + w * 4), y * w * 4); }
    return out;
  }
  const k = S.distortion / 100 * 0.35, ang = (S.gRot + ((S.crop && S.crop.angle) || 0)) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
  // crop-angle rotation zooms just enough to keep the frame filled
  const ca2 = Math.abs(Math.cos(((S.crop && S.crop.angle) || 0) * Math.PI / 180)), sa2 = Math.abs(Math.sin(((S.crop && S.crop.angle) || 0) * Math.PI / 180)), fill = Math.max((fw * ca2 + fh * sa2) / fw, (fw * sa2 + fh * ca2) / fh);
  const sc = S.gScale / 100 * fill;
  const pv = S.gVert / 100 * 0.5, ph = S.gHorz / 100 * 0.5, asp = 1 + S.gAspect / 100 * 0.4, ox = S.gX / 100 * 0.5, oy = S.gY / 100 * 0.5;
  const caK = S.removeCA && S._ca ? S._ca : [0, 0];
  const cx = fw / 2, cy = fh / 2, R = Math.hypot(cx, cy);
  const samp = (x, y, c) => { x = clamp(x - 0.5, 0, fw - 1); y = clamp(y - 0.5, 0, fh - 1); const x0 = x | 0, y0 = y | 0, x1 = Math.min(fw - 1, x0 + 1), y1 = Math.min(fh - 1, y0 + 1), fx = x - x0, fy = y - y0; return (src[(y0 * fw + x0) * 4 + c] * (1 - fx) + src[(y0 * fw + x1) * 4 + c] * fx) * (1 - fy) + (src[(y1 * fw + x0) * 4 + c] * (1 - fx) + src[(y1 * fw + x1) * 4 + c] * fx) * fy; };
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
    let u = (x + T.x0 + 0.5 - cx) / R / sc - ox, v = (y + T.y0 + 0.5 - cy) / R / sc - oy;
    u /= asp;
    let ru = u * ca - v * sa, rv = u * sa + v * ca;
    const ww = 1 + pv * rv + ph * ru; ru /= ww; rv /= ww;
    const f = 1 - k * (ru * ru + rv * rv);
    out[i + 1] = samp(cx + ru * f * R, cy + rv * f * R, 1); out[i + 3] = samp(cx + ru * f * R, cy + rv * f * R, 3);
    const fr = f * (1 + caK[0]), fb = f * (1 + caK[1]);
    out[i] = samp(cx + ru * fr * R, cy + rv * fr * R, 0); out[i + 2] = samp(cx + ru * fb * R, cy + rv * fb * R, 2);
  }
  return out;
}
/** automatic chromatic-aberration estimate: radial scale of red / blue that best aligns them with green at edges */
CR.estimateCA = (src, w, h) => {
  const step = Math.max(1, Math.round(Math.max(w, h) / 400)), cx = w / 2, cy = h / 2, pts = [];
  for (let y = 2; y < h - 2 && pts.length < 4000; y += step) for (let x = 2; x < w - 2; x += step) { const i = (y * w + x) * 4; if (Math.abs(src[i + 1] - src[i + 5]) > 40 && Math.hypot(x - cx, y - cy) > Math.min(w, h) * 0.25) pts.push([x, y]); }
  const best = [0, 0];
  for (const [c, bi] of [[0, 0], [2, 1]]) {
    let bs = Infinity;
    for (let s = -0.004; s <= 0.0041; s += 0.0005) {
      let err = 0;
      for (const [x, y] of pts) { const sx = Math.round(cx + (x - cx) * (1 + s)), sy = Math.round(cy + (y - cy) * (1 + s)); if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue; const d = src[(sy * w + sx) * 4 + c] - src[(y * w + x) * 4 + 1]; err += d * d; }
      if (err < bs) { bs = err; best[bi] = s; }
    }
  }
  return best;
};
/** automatic straighten: dominant edge angle near the horizontal / vertical (degrees to rotate) */
CR.estimateLevel = (src, w, h) => {
  const hist = new Float32Array(181), step = Math.max(1, Math.round(Math.max(w, h) / 500));
  const L = i => 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2];
  for (let y = step; y < h - step; y += step) for (let x = step; x < w - step; x += step) {
    const gx = L((y * w + x + step) * 4) - L((y * w + x - step) * 4), gy = L(((y + step) * w + x) * 4) - L(((y - step) * w + x) * 4), m = Math.hypot(gx, gy);
    if (m < 40) continue;
    let a = Math.atan2(gy, gx) * 180 / Math.PI;
    a = ((a % 90) + 90) % 90; if (a > 45) a -= 90;
    if (Math.abs(a) < 15) hist[Math.round(a * 6) + 90] += m;
  }
  let bi = 90; for (let i = 0; i < 181; i++) if (hist[i] > hist[bi]) bi = i;
  return -(bi - 90) / 6;
};

/* ---------- profiles ---------- */
CR.PROFILES = [
  ['color', 'Color', 'Neutral starting point: the image exactly as it is.'], ['vivid', 'Vivid', 'Punchy color and contrast.'], ['landscape', 'Landscape', 'Richer greens and blues, crisp contrast.'], ['portrait', 'Portrait', 'Gentle contrast and flattering skin tones.'], ['neutral', 'Neutral', 'Flat, low-contrast base for heavy grading.'], ['monochrome', 'Monochrome', 'Black & white — shape it with the B&W Mixer.'],
  ['vintage', 'Vintage', 'Faded blacks, warm cast, muted color.'], ['modern', 'Modern', 'Teal shadows, warm highlights, strong contrast.'], ['matte', 'Matte', 'Lifted blacks, soft and editorial.'], ['bwhigh', 'B&W High Contrast', 'Deep blacks and bright whites.'], ['bwsoft', 'B&W Soft', 'Smooth, low-contrast black & white.'],
];
const PROF = {
  color: { k: 1, sat: 1 }, vivid: { k: 1.22, sat: 1.28, vib: 0.15 }, landscape: { k: 1.18, sat: 1.12, gb: 0.15 }, portrait: { k: 1.05, sat: 0.94, skin: 0.06 }, neutral: { k: 0.9, sat: 0.9 },
  monochrome: { k: 1.05, mono: true }, vintage: { k: 0.98, sat: 0.78, lift: 0.06, warm: 0.05 }, modern: { k: 1.25, sat: 1.05, split: true }, matte: { k: 0.95, sat: 0.9, lift: 0.08 }, bwhigh: { k: 1.4, mono: true }, bwsoft: { k: 0.85, mono: true, lift: 0.03 },
};
CR.isMono = S => !!(PROF[S.profile] || PROF.color).mono;
CR.isCreative = S => ['vintage', 'modern', 'matte', 'bwhigh', 'bwsoft', 'vivid', 'landscape', 'portrait', 'neutral'].includes(S.profile);
const scurve = (x, k) => (k === 1 ? x : x < 0.5 ? 0.5 * Math.pow(2 * x, k) : 1 - 0.5 * Math.pow(2 * (1 - x), k));

/* ---------- calibration: rotate / scale each primary around the grey axis ---------- */
function calibMatrix(c) {
  const rot = (v, a) => { const k = 1 / Math.sqrt(3), ca = Math.cos(a), sa = Math.sin(a), kv = (v[0] + v[1] + v[2]) * k, kx = [k * (v[2] - v[1]), k * (v[0] - v[2]), k * (v[1] - v[0])]; return [0, 1, 2].map(i => v[i] * ca + kx[i] * sa + k * kv * (1 - ca)); };
  const cols = [[c.rH, c.rS], [c.gH, c.gS], [c.bH, c.bS]].map(([hh, s], i) => { const l = LW[i], ch = [0, 1, 2].map(q => (q === i ? 1 : 0) - l), r = rot(ch, hh / 100 * 0.5), f = 1 + s / 100 * 0.6; return [l + r[0] * f, l + r[1] * f, l + r[2] * f]; });
  return [[cols[0][0], cols[1][0], cols[2][0]], [cols[0][1], cols[1][1], cols[2][1]], [cols[0][2], cols[1][2], cols[2][2]]];
}

/* ---------- semantic maps at low resolution (depth, sky, subject), sampled anywhere in the frame ---------- */
const lowRes = (src, fw, fh, maxSide) => {
  const s = Math.min(1, maxSide / Math.max(fw, fh)), sw = Math.max(2, Math.round(fw * s)), sh = Math.max(2, Math.round(fh * s)), R = new Float32Array(sw * sh), Gc = new Float32Array(sw * sh), B = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const i = (Math.min(fh - 1, Math.floor((y + 0.5) / s)) * fw + Math.min(fw - 1, Math.floor((x + 0.5) / s))) * 4, j = y * sw + x; R[j] = src[i]; Gc[j] = src[i + 1]; B[j] = src[i + 2]; }
  return { s, sw, sh, R, G: Gc, B };
};
const sampleMap = (M, gx, gy) => { const fx = clamp(gx * M.s - 0.5, 0, M.sw - 1), fy = clamp(gy * M.s - 0.5, 0, M.sh - 1), x0 = fx | 0, y0 = fy | 0, x1 = Math.min(M.sw - 1, x0 + 1), y1 = Math.min(M.sh - 1, y0 + 1), ax = fx - x0, ay = fy - y0, d = M.d; return (d[y0 * M.sw + x0] * (1 - ax) + d[y0 * M.sw + x1] * ax) * (1 - ay) + (d[y1 * M.sw + x0] * (1 - ax) + d[y1 * M.sw + x1] * ax) * ay; };
CR.sampleMap = sampleMap;
/** subject: colours that stand out from what fills the frame's edges, weighted toward the centre, split into
    connected regions (the strongest ones are kept) and snapped to the photo's edges with a guided filter */
CR.subjectMap = (src, fw, fh) => {
  const L = lowRes(src, fw, fh, 256), { sw, sh } = L, n = sw * sh;
  // 1. colour histogram (8 levels per channel) and how often each colour appears along the border
  const NB = 512, cnt = new Float32Array(NB), bcnt = new Float32Array(NB), mr = new Float32Array(NB), mg = new Float32Array(NB), mb = new Float32Array(NB), bin = new Uint16Array(n);
  const bw = Math.max(2, Math.round(Math.min(sw, sh) * 0.04));
  let btot = 0;
  for (let y = 0, j = 0; y < sh; y++) for (let x = 0; x < sw; x++, j++) {
    const r = L.R[j], g = L.G[j], b = L.B[j], k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    bin[j] = k; cnt[k]++; mr[k] += r; mg[k] += g; mb[k] += b;
    if (x < bw || y < bw || x >= sw - bw || y >= sh - bw) { bcnt[k]++; btot++; }
  }
  const used = []; for (let k = 0; k < NB; k++) if (cnt[k]) { mr[k] /= cnt[k]; mg[k] /= cnt[k]; mb[k] /= cnt[k]; used.push(k); }
  // perceptual-ish distance: luminance plus opponent chroma
  const dist = (a, b) => { const dr = mr[a] - mr[b], dg = mg[a] - mg[b], db = mb[a] - mb[b], dl = 0.3 * dr + 0.59 * dg + 0.11 * db; return Math.sqrt(dl * dl * 0.6 + (dr - dg) ** 2 * 0.5 + ((dr + dg) / 2 - db) ** 2 * 0.4); };
  // 2. per colour: global contrast (rare, different colours) × not-background (unlike the border colours)
  const sal = new Float32Array(NB);
  for (const a of used) {
    let c = 0, bg = 0;
    for (const b of used) { const d = dist(a, b); c += cnt[b] * d; if (bcnt[b]) bg += bcnt[b] * Math.exp(-(d * d) / (2 * 26 * 26)); }
    sal[a] = (c / n) * Math.max(0, 1 - Math.min(1, (bg / (btot || 1)) * 5));
  }
  // 3. per pixel, with a gentle centre prior, smoothed
  let s0 = new Float32Array(n), mx = 1e-6;
  for (let y = 0, j = 0; y < sh; y++) for (let x = 0; x < sw; x++, j++) { const dx = x / sw - 0.5, dy = y / sh - 0.5; s0[j] = sal[bin[j]] * (0.45 + 0.55 * Math.exp(-(dx * dx + dy * dy) / 0.14)); if (s0[j] > mx) mx = s0[j]; }
  s0 = gauss(s0, sw, sh, 1.2);
  for (let j = 0; j < n; j++) s0[j] /= mx;
  // 4. Otsu threshold, then connected regions scored by strength, size and centrality
  const H = new Float32Array(64); for (let j = 0; j < n; j++) H[Math.min(63, (s0[j] * 64) | 0)]++;
  let sumAll = 0; for (let i = 0; i < 64; i++) sumAll += i * H[i];
  let wB = 0, sB = 0, best = 0, thr = 0.3;
  for (let i = 0; i < 64; i++) { wB += H[i]; if (!wB || wB === n) continue; sB += i * H[i]; const mB = sB / wB, mF = (sumAll - sB) / (n - wB), v = wB * (n - wB) * (mB - mF) ** 2; if (v > best) { best = v; thr = (i + 1) / 64; } }
  thr = Math.max(0.12, thr);
  const lab = new Int32Array(n).fill(-1), comps = [];
  for (let j0 = 0; j0 < n; j0++) {
    if (lab[j0] >= 0 || s0[j0] < thr) continue;
    const id = comps.length, q = [j0]; lab[j0] = id; let area = 0, sum = 0, cx = 0, cy = 0, edge = 0;
    while (q.length) {
      const j = q.pop(), x = j % sw, y = (j / sw) | 0; area++; sum += s0[j]; cx += x; cy += y;
      if (x === 0 || y === 0 || x === sw - 1 || y === sh - 1) edge++;
      if (x > 0 && lab[j - 1] < 0 && s0[j - 1] >= thr) { lab[j - 1] = id; q.push(j - 1); }
      if (x < sw - 1 && lab[j + 1] < 0 && s0[j + 1] >= thr) { lab[j + 1] = id; q.push(j + 1); }
      if (y > 0 && lab[j - sw] < 0 && s0[j - sw] >= thr) { lab[j - sw] = id; q.push(j - sw); }
      if (y < sh - 1 && lab[j + sw] < 0 && s0[j + sw] >= thr) { lab[j + sw] = id; q.push(j + sw); }
    }
    const dx = cx / area / sw - 0.5, dy = cy / area / sh - 0.5;
    comps.push({ area, score: sum * (0.35 + Math.exp(-(dx * dx + dy * dy) / 0.08)) * (edge > (sw + sh) * 0.25 ? 0.35 : 1) });
  }
  const top = comps.reduce((m, c) => Math.max(m, c.score), 0), keep = comps.map(c => c.score >= top * 0.3 && c.area >= n * 0.002);
  const bm = new Float32Array(n); for (let j = 0; j < n; j++) bm[j] = lab[j] >= 0 && keep[lab[j]] ? 1 : 0;
  // 5. edge-aware refinement: guided filter with the photo's luminance as the guide
  const Y = new Float32Array(n); for (let j = 0; j < n; j++) Y[j] = (0.3 * L.R[j] + 0.59 * L.G[j] + 0.11 * L.B[j]) / 255;
  const r = Math.max(2, Math.round(Math.min(sw, sh) / 40)), eps = 0.004;
  const mI = boxPlane(Y, sw, sh, r), mP = boxPlane(bm, sw, sh, r), IP = new Float32Array(n), II = new Float32Array(n);
  for (let j = 0; j < n; j++) { IP[j] = Y[j] * bm[j]; II[j] = Y[j] * Y[j]; }
  const mIP = boxPlane(IP, sw, sh, r), mII = boxPlane(II, sw, sh, r), A = new Float32Array(n), B = new Float32Array(n);
  for (let j = 0; j < n; j++) { const v = mII[j] - mI[j] * mI[j]; A[j] = (mIP[j] - mI[j] * mP[j]) / (v + eps); B[j] = mP[j] - A[j] * mI[j]; }
  const mA = boxPlane(A, sw, sh, r), mB2 = boxPlane(B, sw, sh, r), d = new Float32Array(n);
  for (let j = 0; j < n; j++) d[j] = clamp(mA[j] * Y[j] + mB2[j], 0, 1);
  return { s: L.s, sw, sh, d: gauss(d, sw, sh, 0.8) };
};
/** rough depth (0 near → 1 far): higher in the frame reads as farther, and the subject is pulled to the front */
CR.depthMap = (src, fw, fh, subj) => {
  const S = subj || CR.subjectMap(src, fw, fh), { sw, sh } = S, d = new Float32Array(sw * sh);
  for (let y = 0, j = 0; y < sh; y++) { const v = 0.2 + 0.75 * (1 - y / sh); for (let x = 0; x < sw; x++, j++) d[j] = v * (1 - 0.85 * S.d[j]); }
  return { s: S.s, sw, sh, d: gauss(d, sw, sh, 1.5) };
};
/** sky: bright or bluish regions connected to the top edge */
CR.skyMap = (src, fw, fh) => {
  const L = lowRes(src, fw, fh, 384), { sw, sh } = L, n = sw * sh, cand = new Uint8Array(n), seen = new Uint8Array(n), d = new Float32Array(n);
  for (let j = 0; j < n; j++) { const r = L.R[j], g = L.G[j], b = L.B[j], Y = 0.3 * r + 0.59 * g + 0.11 * b; cand[j] = (b > r * 0.95 && b > 90 && Y > 80) || Y > 200 ? 1 : 0; }
  const q = []; for (let x = 0; x < sw; x++) if (cand[x]) { q.push(x); seen[x] = 1; }
  while (q.length) { const j = q.pop(); d[j] = 1; const x = j % sw, y = (j / sw) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue; const k = ny * sw + nx; if (!seen[k] && cand[k]) { seen[k] = 1; q.push(k); } } }
  return { s: L.s, sw, sh, d: gauss(d, sw, sh, 1.5) };
};
const getMap = (cache, kind, full, fw, fh) => cache[kind] || (cache[kind] = kind === 'sky' ? CR.skyMap(full, fw, fh) : kind === 'subject' ? CR.subjectMap(full, fw, fh) : CR.depthMap(full, fw, fh, getMap(cache, 'subject', full, fw, fh)));

/* ---------- local mask weights for one tile ---------- */
function maskWeights(M, T, fw, fh, aux, cache, full, tileSrc) {
  const w = T.w, h = T.h, n = w * h, out = new Float32Array(n);
  if (M.type === 'linear') {
    const ax = M.x1 * fw, ay = M.y1 * fh, dx = M.x2 * fw - ax, dy = M.y2 * fh - ay, l2 = dx * dx + dy * dy || 1;
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) out[j] = 1 - sstep(0, 1, ((x + T.x0 + 0.5 - ax) * dx + (y + T.y0 + 0.5 - ay) * dy) / l2);
  } else if (M.type === 'radial') {
    const cx = M.cx * fw, cy = M.cy * fh, rx = Math.max(1, M.rx * fw), ry = Math.max(1, M.ry * fh), a = (M.angle || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), f = clamp((M.feather ?? 50) / 100, 0.001, 1);
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) { const px = x + T.x0 + 0.5 - cx, py = y + T.y0 + 0.5 - cy, u = (px * ca + py * sa) / rx, v = (-px * sa + py * ca) / ry; out[j] = 1 - sstep(1 - f, 1, Math.hypot(u, v)); }
  } else if (M.type === 'brush') {
    const p = aux && aux.brush && aux.brush[M.id];
    if (p) for (let y = 0, j = 0; y < h; y++) { const gy = clamp(y + T.y0, 0, fh - 1); for (let x = 0; x < w; x++, j++) out[j] = p[gy * fw + clamp(x + T.x0, 0, fw - 1)] / 255; }
  } else if (M.type === 'sky' || M.type === 'subject' || M.type === 'background') {
    const map = getMap(cache, M.type === 'sky' ? 'sky' : 'subject', full, fw, fh);
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) { const v = sampleMap(map, x + T.x0 + 0.5, y + T.y0 + 0.5); out[j] = M.type === 'background' ? 1 - v : v; }
  } else if (M.type === 'lum') {
    const lo = (M.lo ?? 0) / 100, hi = (M.hi ?? 100) / 100, sm = Math.max(0.01, (M.smooth ?? 20) / 100) * 0.5;
    for (let j = 0; j < n; j++) { const i = j * 4, L = (0.2126 * tileSrc[i] + 0.7152 * tileSrc[i + 1] + 0.0722 * tileSrc[i + 2]) / 255; out[j] = sstep(lo - sm, lo + sm, L) * (1 - sstep(hi - sm, hi + sm, L)); }
  }
  if (M.invert) for (let j = 0; j < n; j++) out[j] = 1 - out[j];
  const op = (M.opacity ?? 100) / 100; if (op < 1) for (let j = 0; j < n; j++) out[j] *= op;
  return out;
}
CR.maskWeights = (M, fw, fh, aux, full, cache = {}) => maskWeights(M, { x0: 0, y0: 0, w: fw, h: fh }, fw, fh, aux, cache, full, full);

/* =====================================================================
   The pipeline (one tile)
   ===================================================================== */
CR.process = (full, fw, fh, S, aux = {}, cache = {}, T = null) => {
  T = T || { x0: 0, y0: 0, w: fw, h: fh };
  const w = T.w, h = T.h, n = w * h, res = Math.hypot(fw, fh) / 2000;
  const off = S.off || {}, on = k => !off[k];
  const gS = on('geometry') ? S : { ...S, gRot: 0, gScale: 100, gVert: 0, gHorz: 0, gAspect: 0, gX: 0, gY: 0 };
  const src = geometry(full, fw, fh, on('optics') ? gS : { ...gS, distortion: 0, removeCA: false }, T);
  const R = new Float32Array(n), Gp = new Float32Array(n), B = new Float32Array(n), A = new Uint8ClampedArray(n);
  for (let j = 0, i = 0; j < n; j++, i += 4) { R[j] = S2L[src[i]]; Gp[j] = S2L[src[i + 1]]; B[j] = S2L[src[i + 2]]; A[j] = src[i + 3]; }

  /* noise reduction: luminance via a guided filter, colour via chroma blur */
  if (on('detail') && (S.nr > 0 || S.cnr > 0)) {
    const Y = new Float32Array(n), cb = new Float32Array(n), cr = new Float32Array(n);
    for (let j = 0; j < n; j++) { const y = 0.299 * R[j] + 0.587 * Gp[j] + 0.114 * B[j]; Y[j] = y; cb[j] = B[j] - y; cr[j] = R[j] - y; }
    let Yo = Y;
    if (S.nr > 0) {
      const rad = Math.max(1, Math.round((1 + S.nr / 18) * Math.max(0.5, res))), eps = Math.pow(0.004 + S.nr / 100 * 0.05, 2) * (1 - S.nrContrast / 200);
      const mI = boxPlane(Y, w, h, rad), II = new Float32Array(n); for (let j = 0; j < n; j++) II[j] = Y[j] * Y[j];
      const mII = boxPlane(II, w, h, rad), a = new Float32Array(n), b = new Float32Array(n);
      for (let j = 0; j < n; j++) { const vr = mII[j] - mI[j] * mI[j], k = vr / (vr + eps); a[j] = k; b[j] = mI[j] * (1 - k); }
      const ma = boxPlane(a, w, h, rad), mb = boxPlane(b, w, h, rad), keep = S.nrDetail / 100 * 0.6; Yo = new Float32Array(n);
      for (let j = 0; j < n; j++) Yo[j] = (ma[j] * Y[j] + mb[j]) * (1 - keep) + Y[j] * keep;
    }
    let cbo = cb, cro = cr;
    if (S.cnr > 0) { const sg = (0.6 + S.cnr / 100 * 5 + S.cnrSmooth / 100 * 3) * Math.max(0.5, res); cbo = gauss(cb, w, h, sg); cro = gauss(cr, w, h, sg); const keep = S.cnrDetail / 100 * 0.4; if (keep) for (let j = 0; j < n; j++) { cbo[j] = cbo[j] * (1 - keep) + cb[j] * keep; cro[j] = cro[j] * (1 - keep) + cr[j] * keep; } }
    for (let j = 0; j < n; j++) { const y = Yo[j], r = y + cro[j], b = y + cbo[j]; R[j] = r; B[j] = b; Gp[j] = (y - 0.299 * r - 0.114 * b) / 0.587; }
  }
  /* defringe: desaturate purple / green fringes along strong edges */
  if (on('optics') && (S.purpleAmt > 0 || S.greenAmt > 0)) {
    const Y = new Float32Array(n); for (let j = 0; j < n; j++) Y[j] = toDisp(0.2126 * R[j] + 0.7152 * Gp[j] + 0.0722 * B[j]);
    const e = new Float32Array(n);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const j = y * w + x; e[j] = Math.abs(Y[j + 1] - Y[j - 1]) + Math.abs(Y[j + w] - Y[j - w]); }
    const ee = boxPlane(e, w, h, Math.max(1, Math.round(2 * res)));
    const pLo = 260 + S.purpleLo * 0.9, pHi = 260 + S.purpleHi * 0.9, gLo = 60 + S.greenLo * 1.2, gHi = 60 + S.greenHi * 1.2;
    for (let j = 0; j < n; j++) {
      if (ee[j] < 0.06) continue;
      const r = R[j], g = Gp[j], b = B[j], mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 0.02) continue;
      let hh; if (mx === r) hh = ((g - b) / (mx - mn) + 6) % 6; else if (mx === g) hh = (b - r) / (mx - mn) + 2; else hh = (r - g) / (mx - mn) + 4; hh *= 60;
      let k = 0;
      if (S.purpleAmt > 0 && hh >= pLo && hh <= pHi) k = S.purpleAmt / 20;
      if (S.greenAmt > 0 && hh >= gLo && hh <= gHi) k = Math.max(k, S.greenAmt / 20);
      if (!k) continue;
      k *= clamp((ee[j] - 0.06) * 6, 0, 1);
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b; R[j] = r + (L - r) * k; Gp[j] = g + (L - g) * k; B[j] = b + (L - b) * k;
    }
  }

  /* white balance, calibration, exposure */
  const Tm = on('color') ? S.temp / 100 : 0, Nt = on('color') ? S.tint / 100 : 0;
  let mr = Math.exp(0.32 * Tm + 0.1 * Nt), mg = Math.exp(-0.2 * Nt), mb = Math.exp(-0.32 * Tm + 0.1 * Nt);
  const nrm = LW[0] * mr + LW[1] * mg + LW[2] * mb; mr /= nrm; mg /= nrm; mb /= nrm;
  const ev = on('light') ? Math.pow(2, S.exposure) : 1;
  const cal = S.cal, calOn = on('calibration') && (cal.rH || cal.rS || cal.gH || cal.gS || cal.bH || cal.bS), Mx = calOn ? calibMatrix(cal) : null, shTint = on('calibration') ? cal.shTint / 100 : 0;
  for (let j = 0; j < n; j++) {
    let r = R[j] * mr, g = Gp[j] * mg, b = B[j] * mb;
    if (Mx) { const r2 = Mx[0][0] * r + Mx[0][1] * g + Mx[0][2] * b, g2 = Mx[1][0] * r + Mx[1][1] * g + Mx[1][2] * b, b2 = Mx[2][0] * r + Mx[2][1] * g + Mx[2][2] * b; r = r2; g = g2; b = b2; }
    if (shTint) { const L = LW[0] * r + LW[1] * g + LW[2] * b, wS = Math.pow(clamp(1 - L * 3, 0, 1), 2); g *= 1 - shTint * 0.18 * wS; r *= 1 + shTint * 0.06 * wS; b *= 1 + shTint * 0.06 * wS; }
    R[j] = r * ev; Gp[j] = g * ev; B[j] = b * ev;
  }

  /* dehaze (dark-channel prior); the airlight is estimated once for the whole frame */
  if (on('effects') && S.dehaze) {
    const dark = new Float32Array(n); for (let j = 0; j < n; j++) dark[j] = Math.min(R[j], Gp[j], B[j]);
    const rr = Math.max(1, Math.round(6 * res)), dm = gauss(minFilter(dark, w, h, rr), w, h, rr * 2);
    let air = S._air; if (!air) { const sorted = Float32Array.from(dm).sort(); air = Math.max(0.2, sorted[Math.floor(n * 0.998)] || 1); }
    const amt = S.dehaze / 100;
    for (let j = 0; j < n; j++) {
      if (amt > 0) { const t = clamp(1 - amt * 0.92 * dm[j] / air, 0.12, 1); R[j] = (R[j] - air * (1 - t)) / t; Gp[j] = (Gp[j] - air * (1 - t)) / t; B[j] = (B[j] - air * (1 - t)) / t; }
      else { const k = -amt * 0.55; R[j] += (air - R[j]) * k; Gp[j] += (air - Gp[j]) * k; B[j] += (air - B[j]) * k; }
    }
  }

  /* profile + tone on display-referred luminance (colour ratios preserved) */
  const prof = PROF[S.profile] || PROF.color, pa = (S.profileAmount ?? 100) / 100;
  const Yd = new Float32Array(n);
  for (let j = 0; j < n; j++) Yd[j] = toDisp(Math.max(0, LW[0] * R[j] + LW[1] * Gp[j] + LW[2] * B[j]));
  const lightOn = on('light');
  const base = lightOn && (S.highlights || S.shadows) ? gauss(Yd, w, h, 24 * res + 2) : null;
  const pk = 1 + (prof.k - 1) * pa, ck = Math.pow(2, (lightOn ? S.contrast : 0) / 100 * 1.15);
  const wht = lightOn ? S.whites / 100 : 0, blk = lightOn ? S.blacks / 100 : 0, hiA = lightOn ? S.highlights / 100 : 0, shA = lightOn ? S.shadows / 100 : 0;
  const shoulder = ev > 1.001 || wht > 0 || hiA > 0 || shA > 0;
  const curveOn = on('curve');
  const pcLut = curveOn && (S.pcHigh || S.pcLights || S.pcDarks || S.pcShadows) ? (() => { const l = new Float32Array(256), s1 = S.split1 / 100, s2 = S.split2 / 100, s3 = S.split3 / 100; for (let i = 0; i < 256; i++) { const x = i / 255; const bump = (a, b) => (x <= a || x >= b ? 0 : Math.sin(Math.PI * (x - a) / (b - a))); l[i] = clamp(x + (S.pcShadows / 100 * 0.13 * bump(0, Math.min(1, s1 * 1.8)) + S.pcDarks / 100 * 0.13 * bump(Math.max(0, s1 * 0.5), s2 + (s2 - s1)) + S.pcLights / 100 * 0.13 * bump(s2 - (s3 - s2), Math.min(1, s3 + (1 - s3) * 0.5)) + S.pcHigh / 100 * 0.13 * bump(Math.max(0, s3 - (1 - s3) * 0.8), 1)), 0, 1) * 255; } return l; })() : null;
  const cAll = curveOn && !isIdentityCurve(S.curve) ? CR.curveLut(S.curve) : null, cR = curveOn && !isIdentityCurve(S.curveR) ? CR.curveLut(S.curveR) : null, cG = curveOn && !isIdentityCurve(S.curveG) ? CR.curveLut(S.curveG) : null, cB = curveOn && !isIdentityCurve(S.curveB) ? CR.curveLut(S.curveB) : null;
  const oR = new Float32Array(n), oG = new Float32Array(n), oB = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const y0 = Yd[j];
    let y = y0;
    if (base) { const bl = base[j], wH = sstep(0.42, 0.95, bl), wS = 1 - sstep(0.04, 0.5, bl); y *= Math.pow(2, hiA * (hiA < 0 ? 1.4 : 0.7) * wH + shA * (shA > 0 ? 1.5 : 0.9) * wS); }
    if (blk) y = blk < 0 ? (y + blk * 0.06) / (1 + blk * 0.06) : y + blk * 0.08 * Math.pow(1 - clamp(y, 0, 1), 3);
    if (wht) y = wht > 0 ? y * (1 + wht * 0.22 * clamp(y, 0, 1)) : y * (1 + wht * 0.22 * Math.pow(clamp(y, 0, 1), 2));
    if (shoulder && y > 0.86) y = 0.86 + 0.14 * Math.tanh((y - 0.86) / 0.14);
    y = clamp(y, 0, 1);
    y = scurve(y, pk * ck);
    if (prof.lift) y = prof.lift * pa + y * (1 - prof.lift * pa);
    if (pcLut) y = lutAt(pcLut, y);
    if (cAll) y = lutAt(cAll, y);
    const k = y0 > 1e-5 ? y / y0 : 0;
    let r, g, b;
    if (y0 <= 1e-5) r = g = b = y;
    else { r = toDisp(Math.max(0, R[j])) * k; g = toDisp(Math.max(0, Gp[j])) * k; b = toDisp(Math.max(0, B[j])) * k; }
    if (cR) r = lutAt(cR, r); if (cG) g = lutAt(cG, g); if (cB) b = lutAt(cB, b);
    oR[j] = r; oG[j] = g; oB[j] = b;
  }

  /* texture & clarity: local contrast on display luminance */
  const effOn = on('effects');
  const masksOn = on('masks') && (S.masks || []).some(m => !m.hidden && m.adj && CR.LOCAL_KEYS.some(k => m.adj[k]));
  const needDetail = (effOn && (S.texture || S.clarity)) || (masksOn && S.masks.some(m => m.adj && (m.adj.texture || m.adj.clarity || m.adj.sharpness || m.adj.dehaze)));
  let Lp = null, bTex = null, bClar = null;
  if (needDetail) { Lp = new Float32Array(n); for (let j = 0; j < n; j++) Lp[j] = LW[0] * oR[j] + LW[1] * oG[j] + LW[2] * oB[j]; bTex = gauss(Lp, w, h, 3 * res + 0.8); bClar = gauss(Lp, w, h, 28 * res + 3); }
  if (effOn && (S.texture || S.clarity)) {
    const tx = S.texture / 100, cl = S.clarity / 100;
    for (let j = 0; j < n; j++) {
      const L = Lp[j], mid = 4 * L * (1 - L); let d = 0;
      if (tx) { const det = L - bTex[j]; d += tx * det * (tx > 0 ? 1.4 / (1 + Math.abs(det) * 8) : 1); }
      if (cl) d += cl * (L - bClar[j]) * (cl > 0 ? 0.9 : 0.75) * (0.25 + mid);
      oR[j] += d; oG[j] += d; oB[j] += d;
    }
  }

  /* colour: profile saturation, vibrance / saturation, colour mixer or B&W mixer, colour grading */
  const colOn = on('color'), mixOn = on('mixer'), gradeOn = on('grading');
  const sat = colOn ? S.saturation / 100 : 0, vib = (colOn ? S.vibrance / 100 : 0) + (prof.vib || 0) * pa;
  const psat = 1 + ((prof.sat || 1) - 1) * pa, mono = !!prof.mono;
  const hasHSL = mixOn && !mono && HUES.some(k => S.hue[k] || S.sat[k] || S.lum[k]);
  const cg = S.cg, grade = gradeOn && (cg.sh.s || cg.mid.s || cg.hi.s || cg.glob.s || cg.sh.l || cg.mid.l || cg.hi.l || cg.glob.l);
  const vSh = hueVec(cg.sh.h), vMid = hueVec(cg.mid.h), vHi = hueVec(cg.hi.h), vGl = hueVec(cg.glob.h), bal = cg.balance / 100, blendW = 0.15 + cg.blend / 100 * 0.35;
  const hueW = new Float32Array(8);
  const bandWeights = hh => { hueW.fill(0); for (let i = 0; i < 8; i++) { const c = HUE_C[i], prev = i === 0 ? HUE_C[7] - 360 : HUE_C[i - 1], next = i === 7 ? 360 : HUE_C[i + 1]; let x = hh; if (i === 0 && x > 180) x -= 360; if (i === 7 && x < 90) x += 360; if (x >= prev && x <= c) hueW[i] = (x - prev) / (c - prev); else if (x > c && x <= next) hueW[i] = (next - x) / (next - c); } };
  const split = prof.split ? pa : 0, warm = (prof.warm || 0) * pa, gbBoost = (prof.gb || 0) * pa, skin = (prof.skin || 0) * pa;
  const hueOf = (r, g, b, mx, mn) => { const d = mx - mn; let hh; if (mx === r) hh = ((g - b) / d + 6) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; return hh * 60; };
  if (mono || psat !== 1 || sat || vib || gbBoost || skin || hasHSL || grade || warm || split) for (let j = 0; j < n; j++) {
    let r = oR[j], g = oG[j], b = oB[j];
    const L = LW[0] * r + LW[1] * g + LW[2] * b;
    if (mono) {
      let gray = L;
      if (mixOn) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sv = mx > 1e-4 ? (mx - mn) / mx : 0; if (sv > 0.01) { bandWeights(hueOf(r, g, b, mx, mn)); let adj = 0; for (let i = 0; i < 8; i++) if (hueW[i]) adj += hueW[i] * S.bw[HUES[i]] / 100; gray = L * (1 + adj * 0.9 * sv); } }
      r = g = b = gray;
    } else {
      if (psat !== 1 || sat || vib || gbBoost || skin) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), cs = mx - mn;
        let k = psat * (1 + sat);
        if (vib) { const skinW = r > g && g > b ? clamp(1 - Math.abs((g - b) / (r - b + 1e-4) - 0.45) * 3, 0, 1) : 0; k *= 1 + vib * (vib > 0 ? (1 - clamp(cs * 1.6, 0, 1)) * (1 - skinW * 0.6) : 1); }
        if (gbBoost && (g >= r || b >= r)) k *= 1 + gbBoost;
        k = Math.max(0, k);
        r = L + (r - L) * k; g = L + (g - L) * k; b = L + (b - L) * k;
        if (skin && r > g && g > b) { r += skin * 0.04; b -= skin * 0.02; }
      }
      if (hasHSL) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx - mn > 0.003 && mx > 0) {
          bandWeights(hueOf(r, g, b, mx, mn));
          let dh = 0, ds = 0, dl = 0;
          for (let i = 0; i < 8; i++) if (hueW[i]) { const span = i === 3 || i === 4 ? 45 : 22; dh += hueW[i] * S.hue[HUES[i]] / 100 * span; ds += hueW[i] * S.sat[HUES[i]] / 100; dl += hueW[i] * S.lum[HUES[i]] / 100; }
          let sv = (mx - mn) / mx; const vv = mx * (1 + dl * 0.45 * sv);
          sv = clamp(sv * (1 + ds), 0, 1);
          const c = hsv(((hueOf(r, g, b, mx, mn) + dh) % 360 + 360) % 360, sv, vv); r = c[0]; g = c[1]; b = c[2];
        }
      }
    }
    if (warm) { r += warm * 0.06; b -= warm * 0.1; }
    if (split) { const L2 = LW[0] * r + LW[1] * g + LW[2] * b, wS = 1 - sstep(0.1, 0.55, L2), wH = sstep(0.45, 0.9, L2); r += split * (-0.05 * wS + 0.05 * wH); g += split * (0.01 * wS + 0.01 * wH); b += split * (0.07 * wS - 0.06 * wH); }
    if (grade) {
      const L2 = LW[0] * r + LW[1] * g + LW[2] * b, c0 = 0.5 - bal * 0.25;
      const wS = 1 - sstep(c0 - blendW - 0.2, c0 + blendW - 0.2, L2), wH = sstep(c0 - blendW + 0.2, c0 + blendW + 0.2, L2), wM = clamp(1 - wS - wH, 0, 1);
      const add = (v, s, l, wt) => { if (!wt) return; const amt = s / 100 * 0.3 * wt; r += v[0] * amt; g += v[1] * amt; b += v[2] * amt; if (l) { const f = 1 + l / 100 * 0.35 * wt; r *= f; g *= f; b *= f; } };
      add(vSh, cg.sh.s, cg.sh.l, wS); add(vMid, cg.mid.s, cg.mid.l, wM); add(vHi, cg.hi.s, cg.hi.l, wH); add(vGl, cg.glob.s, cg.glob.l, 1);
    }
    oR[j] = r; oG[j] = g; oB[j] = b;
  }

  /* local masks */
  if (masksOn) for (const M of S.masks) {
    const a = M.adj; if (M.hidden || !a || !CR.LOCAL_KEYS.some(k => a[k])) continue;
    const wt = maskWeights(M, T, fw, fh, aux, cache, full, src);
    const ev2 = Math.pow(2, a.exposure / 2.2 * 1.2), ct = 1 + a.contrast / 100 * 0.6, tT = a.temp / 100, tN = a.tint / 100, sat2 = 1 + a.saturation / 100;
    const hr = a.hue / 100 * 40 * Math.PI / 180, chs = Math.cos(hr), shh = Math.sin(hr), kk = 1 / Math.sqrt(3);
    for (let j = 0; j < n; j++) {
      const m = wt[j]; if (m < 0.002) continue;
      let r = oR[j] * ev2, g = oG[j] * ev2, b = oB[j] * ev2;
      if (a.contrast) { r = 0.5 + (r - 0.5) * ct; g = 0.5 + (g - 0.5) * ct; b = 0.5 + (b - 0.5) * ct; }
      let L = LW[0] * r + LW[1] * g + LW[2] * b;
      if (a.highlights || a.shadows || a.whites || a.blacks) { const gain = 1 + a.highlights / 100 * 0.45 * sstep(0.45, 1, L) + a.shadows / 100 * 0.9 * (1 - sstep(0, 0.5, L)) + a.whites / 100 * 0.2 * L + a.blacks / 100 * 0.25 * Math.pow(1 - clamp(L, 0, 1), 3) / Math.max(0.05, L); r *= gain; g *= gain; b *= gain; }
      if (tT || tN) { r *= 1 + tT * 0.12 + tN * 0.04; g *= 1 - tN * 0.07; b *= 1 - tT * 0.12 + tN * 0.04; }
      L = LW[0] * r + LW[1] * g + LW[2] * b;
      if (a.hue) { const cr = r - L, cgc = g - L, cb = b - L; r = L + cr * chs + kk * (cb - cgc) * shh; g = L + cgc * chs + kk * (cr - cb) * shh; b = L + cb * chs + kk * (cgc - cr) * shh; }
      if (a.saturation) { r = L + (r - L) * sat2; g = L + (g - L) * sat2; b = L + (b - L) * sat2; }
      if (Lp) { const det = (a.texture / 100) * (Lp[j] - bTex[j]) * 1.3 + (a.clarity / 100) * (Lp[j] - bClar[j]) * 0.9 + (a.sharpness / 100) * (Lp[j] - bTex[j]) * 1.6 + (a.dehaze / 100) * (Lp[j] - bClar[j]) * 0.6; r += det; g += det; b += det; if (a.dehaze) { const f = 1 + a.dehaze / 100 * 0.15, s0 = 0.08 * a.dehaze / 100; r = (r - s0) * f; g = (g - s0) * f; b = (b - s0) * f; } }
      oR[j] += (r - oR[j]) * m; oG[j] += (g - oG[j]) * m; oB[j] += (b - oB[j]) * m;
    }
  }

  /* lens blur (depth-based) — blur stack in linear light so highlights bloom into bokeh */
  const lb = S.lb;
  if (on('lensblur') && lb && (lb.on || lb.viz)) {
    const depth = getMap(cache, 'depth', full, fw, fh), near = lb.near / 100, far = lb.far / 100;
    if (lb.viz) {
      for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) { const d = sampleMap(depth, x + T.x0 + 0.5, y + T.y0 + 0.5), inR = d >= near && d <= far, c = hsv(20 + d * 210, 0.75, inR ? 1 : 0.5); oR[j] = c[0]; oG[j] = c[1]; oB[j] = c[2]; }
    } else {
      const maxR = Math.max(1, lb.amount / 100 * 22 * res + 1), rad = new Float32Array(n);
      for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) { const d = sampleMap(depth, x + T.x0 + 0.5, y + T.y0 + 0.5), dist = d < near ? near - d : d > far ? d - far : 0; rad[j] = maxR * clamp(dist * 3.2, 0, 1); }
      const boost = lb.boost / 100, ring = lb.bokeh === 'ring' || lb.bokeh === 'bubble';
      const lin = [oR, oG, oB].map(p => { const q = new Float32Array(n); for (let j = 0; j < n; j++) { let v = clamp(p[j], 0, 1); v *= v; if (boost && v > 0.5) v *= 1 + boost * 5 * (v - 0.5); q[j] = v; } return q; });
      const levels = [0, 0.2, 0.42, 0.7, 1].map(f => f * maxR);
      const blurLevel = (p, r) => { if (r < 0.5) return p; const g1 = gauss(p, w, h, r * 0.5); if (!ring) return g1; const g2 = gauss(p, w, h, r * 0.22), o = new Float32Array(n); for (let j = 0; j < n; j++) o[j] = Math.max(0, g1[j] * 1.35 - g2[j] * 0.35); return o; };
      const stacks = levels.map(r => lin.map(p => blurLevel(p, r)));
      for (let j = 0; j < n; j++) {
        const r = rad[j]; let k = 1; while (k < levels.length - 1 && levels[k] < r) k++;
        const lo = levels[k - 1], hi = levels[k], t = hi > lo ? (r - lo) / (hi - lo) : 0;
        oR[j] = Math.sqrt(Math.max(0, stacks[k - 1][0][j] + (stacks[k][0][j] - stacks[k - 1][0][j]) * t));
        oG[j] = Math.sqrt(Math.max(0, stacks[k - 1][1][j] + (stacks[k][1][j] - stacks[k - 1][1][j]) * t));
        oB[j] = Math.sqrt(Math.max(0, stacks[k - 1][2][j] + (stacks[k][2][j] - stacks[k - 1][2][j]) * t));
      }
    }
  }

  /* sharpening on display luminance, with halo control (Detail) and an edge mask (Masking) */
  if (on('detail') && S.sharpen > 0) {
    const Lb = new Float32Array(n); for (let j = 0; j < n; j++) Lb[j] = LW[0] * oR[j] + LW[1] * oG[j] + LW[2] * oB[j];
    const bl = gauss(Lb, w, h, S.sharpRadius * Math.max(0.6, res)), amt = S.sharpen / 100 * 1.6, halo = 0.35 + S.sharpDetail / 100 * 0.65;
    let edge = null;
    if (S.sharpMask > 0) { const sm = gauss(Lb, w, h, 1.5 * res + 0.6); edge = new Float32Array(n); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const j = y * w + x; edge[j] = Math.abs(sm[j + 1] - sm[j - 1]) + Math.abs(sm[j + w] - sm[j - w]); } edge = boxPlane(edge, w, h, Math.max(1, Math.round(res))); }
    const mthr = S.sharpMask / 100 * 0.08;
    for (let j = 0; j < n; j++) {
      let d = Lb[j] - bl[j]; d = d > 0 ? d * halo + d * (1 - halo) / (1 + d * 30) : d;
      const m = edge ? sstep(mthr * 0.5, mthr * 1.5 + 1e-4, edge[j]) : 1, add = d * amt * m;
      oR[j] += add; oG[j] += add; oB[j] += add;
    }
  }

  /* effects: glow, post-crop vignette, grain; then lens vignette correction */
  if (effOn && S.glow > 0) {
    const bright = new Float32Array(n); for (let j = 0; j < n; j++) bright[j] = Math.max(0, LW[0] * oR[j] + LW[1] * oG[j] + LW[2] * oB[j] - 0.55) * 2.2;
    const gl = gauss(bright, w, h, (10 + S.glowSize / 100 * 40) * res + 2), k = S.glow / 100 * 0.9;
    for (let j = 0; j < n; j++) { const g = gl[j] * k; oR[j] = 1 - (1 - oR[j]) * (1 - g); oG[j] = 1 - (1 - oG[j]) * (1 - g * 0.96); oB[j] = 1 - (1 - oB[j]) * (1 - g * 0.9); }
  }
  if (effOn && S.vigAmount) {
    const amt = S.vigAmount / 100, mid = 0.3 + S.vigMid / 100 * 0.9, round = S.vigRound / 100, fea = 0.04 + S.vigFeather / 100 * 1.1, hiP = S.vigHigh / 100;
    const sx = fw / 2, sy = fh / 2, m = Math.max(fw, fh) / 2, pw = round < 0 ? 2 - round * 6 : 2, rp = Math.max(0, round);
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
      const u = Math.abs((x + T.x0 + 0.5 - sx) * ((1 - rp) / sx + rp / m)), v = Math.abs((y + T.y0 + 0.5 - sy) * ((1 - rp) / sy + rp / m));
      const f = sstep(mid - fea * 0.5, mid + fea * 0.5, Math.pow(Math.pow(u, pw) + Math.pow(v, pw), 1 / pw));
      if (!f) continue;
      let r = oR[j], g = oG[j], b = oB[j];
      if (amt < 0) {
        if (S.vigStyle === 'paint') { const t = -amt * f; r -= r * t; g -= g * t; b -= b * t; }
        else { const L = LW[0] * r + LW[1] * g + LW[2] * b, protect = 1 - hiP * sstep(0.6, 1, L), mm = Math.max(0, 1 + amt * f * 0.95 * protect); if (S.vigStyle === 'cp') { const L2 = L * mm; r = L2 + (r - L) * mm * 1.05; g = L2 + (g - L) * mm * 1.05; b = L2 + (b - L) * mm * 1.05; } else { r *= mm; g *= mm; b *= mm; } }
      } else { const t = amt * f; r += (1 - r) * t; g += (1 - g) * t; b += (1 - b) * t; }
      oR[j] = r; oG[j] = g; oB[j] = b;
    }
  }
  if (effOn && S.grain > 0) {
    const sc = (0.6 + S.grainSize / 100 * 3.5) * Math.max(1, res), rough = S.grainRough / 100, amt = S.grain / 100 * 0.16;
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) {
      const gx = x + T.x0, gy = y + T.y0, L = LW[0] * oR[j] + LW[1] * oG[j] + LW[2] * oB[j], mw = 0.35 + 2.6 * L * (1 - L);
      const q = (vnoise(gx, gy, sc, 7) * (1 - rough * 0.6) + vnoise(gx, gy, sc * 0.5, 13) * rough * 0.6) * amt * mw;
      oR[j] += q; oG[j] += q; oB[j] += q;
    }
  }
  if (on('optics') && S.lensVig) {
    const amt = S.lensVig / 100, mid = 0.2 + S.lensVigMid / 100 * 0.6, cx = fw / 2, cy = fh / 2, Rr = Math.hypot(cx, cy);
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j++) { const f = 1 + amt * sstep(mid * 0.5, 1.05, Math.hypot(x + T.x0 + 0.5 - cx, y + T.y0 + 0.5 - cy) / Rr) * 0.7; oR[j] *= f; oG[j] *= f; oB[j] *= f; }
  }

  /* encode + histogram */
  const out = new Uint8ClampedArray(n * 4), hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256);
  let clipLo = 0, clipHi = 0;
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    out[i] = clamp(oR[j], 0, 1) * 255; out[i + 1] = clamp(oG[j], 0, 1) * 255; out[i + 2] = clamp(oB[j], 0, 1) * 255; out[i + 3] = A[j];
    if (A[j] > 8) { hr[out[i]]++; hg[out[i + 1]]++; hb[out[i + 2]]++; if (oR[j] >= 1 || oG[j] >= 1 || oB[j] >= 1) clipHi++; if (oR[j] <= 0.002 && oG[j] <= 0.002 && oB[j] <= 0.002) clipLo++; }
  }
  return { out, hist: { r: hr, g: hg, b: hb }, clipLo, clipHi };
};

/** Full-size render in overlapping tiles (bounded memory). onProgress(0..1). */
CR.renderTiled = (full, fw, fh, S, aux, cache, onProgress, tile = 1536) => {
  const m = CR.margin(fw, fh), out = new Uint8ClampedArray(fw * fh * 4);
  if (S.dehaze && !S._air) S._air = CR.estimateAir(full, fw, fh);
  const tilesX = Math.ceil(fw / tile), tilesY = Math.ceil(fh / tile), total = tilesX * tilesY;
  let done = 0;
  for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
    const ix0 = tx * tile, iy0 = ty * tile, iw = Math.min(tile, fw - ix0), ih = Math.min(tile, fh - iy0);
    const x0 = Math.max(0, ix0 - m), y0 = Math.max(0, iy0 - m), x1 = Math.min(fw, ix0 + iw + m), y1 = Math.min(fh, iy0 + ih + m);
    const r = CR.process(full, fw, fh, S, aux, cache, { x0, y0, w: x1 - x0, h: y1 - y0 });
    const tw = x1 - x0;
    for (let y = 0; y < ih; y++) { const so = ((iy0 - y0 + y) * tw + (ix0 - x0)) * 4; out.set(r.out.subarray(so, so + iw * 4), ((iy0 + y) * fw + ix0) * 4); }
    done++; onProgress && onProgress(done / total);
  }
  return out;
};
/** airlight for dehaze, estimated once on a small copy of the whole frame */
CR.estimateAir = (full, fw, fh) => {
  const L = lowRes(full, fw, fh, 512), n = L.sw * L.sh, dark = new Float32Array(n);
  for (let j = 0; j < n; j++) dark[j] = Math.min(S2L[L.R[j] | 0], S2L[L.G[j] | 0], S2L[L.B[j] | 0]);
  const dm = gauss(minFilter(dark, L.sw, L.sh, 3), L.sw, L.sh, 6), sorted = Float32Array.from(dm).sort();
  return Math.max(0.2, sorted[Math.floor(n * 0.998)] || 1);
};

/* ---------- Auto tone and auto white balance ---------- */
CR.auto = (src, w, h) => {
  const hist = new Uint32Array(256); let tot = 0;
  for (let i = 0; i < src.length; i += 4) { if (src[i + 3] < 8) continue; hist[Math.round(0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2])]++; tot++; }
  if (!tot) return {};
  const pct = p => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= tot * p) return i / 255; } return 1; };
  const lo = pct(0.005), med = pct(0.5), hi = pct(0.995); let mean = 0; for (let i = 0; i < 256; i++) mean += hist[i] * i; mean /= tot * 255;
  return {
    exposure: +clamp(Math.log2(0.46 / Math.max(0.05, (med + mean) / 2)) * 0.8, -2, 2).toFixed(2),
    contrast: Math.round(clamp((0.62 - (pct(0.8) - pct(0.2))) * 90, -20, 35)),
    highlights: Math.round(clamp(-(pct(0.9) - 0.75) * 220, -80, 0)), shadows: Math.round(clamp((0.25 - pct(0.15)) * 160, 0, 60)),
    whites: Math.round(clamp((0.96 - hi) * 140, -40, 40)), blacks: Math.round(clamp((lo - 0.03) * -180, -40, 20)), vibrance: 12, saturation: 2,
  };
};
/** temperature / tint that make a linear colour neutral */
CR.neutralize = (r, g, b) => {
  r = Math.max(1e-4, r); g = Math.max(1e-4, g); b = Math.max(1e-4, b);
  const T = (Math.log(b) - Math.log(r)) / 0.64, N = (Math.log(g) - Math.log(r) - 0.32 * T) / 0.3;
  return { temp: clamp(Math.round(T * 100), -100, 100), tint: clamp(Math.round(N * 100), -100, 100) };
};
CR.autoWB = (src) => {
  let r = 0, g = 0, b = 0, c = 0;
  for (let i = 0; i < src.length; i += 16) { const L = 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]; if (L < 25 || L > 235 || src[i + 3] < 8) continue; r += S2L[src[i]]; g += S2L[src[i + 1]]; b += S2L[src[i + 2]]; c++; }
  return c ? CR.neutralize(r / c, g / c, b / c) : { temp: 0, tint: 0 };
};
})(typeof self !== 'undefined' ? self : window);
