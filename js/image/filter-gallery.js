/* Image editor — Filter Gallery: 47 artistic effects in Photoshop's six families, with thumbnails rendered
   from your own image, a large live preview and stackable effect layers. Effects receive ImageData at the
   preview scale k (sizes are multiplied by k so the preview matches the full-resolution result). */
(() => {
'use strict';
const App = window.App, F = App.IF, X = F.X, I = App.I;
const { h, icon, btn } = App;
const clamp = X.clamp, PI = Math.PI;

/* ---------- helpers on ImageData / planes ---------- */
const fg = () => X.hex(I.primary), bg = () => X.hex(I.secondary);
const lumP = img => X.lum(img.data, img.width * img.height);
const blurP = (img, p, s) => X.gaussPlane(p, img.width, img.height, s);
const norm = p => { let mn = Infinity, mx = -Infinity; for (const q of p) { if (q < mn) mn = q; if (q > mx) mx = q; } const r = mx - mn || 1; for (let i = 0; i < p.length; i++) p[i] = (p[i] - mn) / r; return p; };
const noiseP = (n, seed = 1) => { const r = X.rng(seed), p = new Float32Array(n); for (let i = 0; i < n; i++) p[i] = r(); return p; };
/** blur a plane along a direction (line integral) — the basis of every "stroke" texture */
const lineBlur = (p, w, hh, deg, len) => {
  len = Math.max(1, Math.round(len)); if (len < 2) return Float32Array.from(p);
  const a = deg * PI / 180, dx = Math.cos(a), dy = Math.sin(a), out = new Float32Array(w * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -len; k <= len; k += 1) s += p[clamp(Math.round(y + dy * k), 0, hh - 1) * w + clamp(Math.round(x + dx * k), 0, w - 1)]; out[y * w + x] = s / (2 * len + 1); }
  return out;
};
const strokes = (w, hh, deg, len, seed) => norm(lineBlur(noiseP(w * hh, seed), w, hh, deg, len));
/** blur the whole image along a direction */
const lineBlurImg = (img, deg, len) => { const { width: w, height: hh, data: d } = img, n = w * hh; const ch = [0, 1, 2].map(c => lineBlur(X.channel(d, n, c), w, hh, deg, len)); for (let j = 0, i = 0; j < n; j++, i += 4) { d[i] = ch[0][j]; d[i + 1] = ch[1][j]; d[i + 2] = ch[2][j]; } return img; };
const posterize = (img, lv) => { const d = img.data, q = 255 / Math.max(1, lv - 1); for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] / q) * q; return img; };
const blurI = (img, s) => (s < 0.4 ? img : X.blurImg(img, s));
const kuwa = (img, r, lv) => X.read(F.oil(X.toCanvas(img), { radius: clamp(Math.round(r), 1, 10), levels: lv }));
const edgeP = (img, s = 0) => { const p = lumP(img); return X.sobel(s ? blurP(img, p, s) : p, img.width, img.height).mag; };
/** procedural textures for Texturizer & friends: 0..1 height map */
function texture(type, w, hh, scale) {
  const s = Math.max(0.3, scale), n = w * hh, t = new Float32Array(n), r = X.rng(17);
  if (type === 'sandstone') return norm(X.fractal(w, hh, 6 * s, 4, 21, 0.6));
  if (type === 'frosted') return norm(X.fractal(w, hh, 3 * s, 3, 5, 0.5));
  if (type === 'blocks') { const sz = 14 * s; for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) t[y * w + x] = ((Math.floor(x / sz) * 7 + Math.floor(y / sz) * 13) % 5) / 4; return t; }
  if (type === 'lens') { const sz = 9 * s; for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const u = (x % sz) / sz - 0.5, v = (y % sz) / sz - 0.5; t[y * w + x] = Math.max(0, 1 - (u * u + v * v) * 4); } return t; }
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    let v;
    if (type === 'brick') { const bw = 36 * s, bh = 16 * s, row = Math.floor(y / bh), xx = x + (row % 2) * bw / 2, mx = xx % bw, my = y % bh; v = mx < 2.5 * s || my < 2.5 * s ? 0 : 0.85 + r() * 0.15; }
    else if (type === 'burlap') { const p = 6 * s; v = 0.5 + 0.25 * Math.sin(x / p * PI) * Math.sign(Math.sin(y / p * PI / 2)) + 0.25 * Math.sin(y / p * PI) * Math.sign(Math.cos(x / p * PI / 2)) + (r() - 0.5) * 0.25; }
    else { const p = 3.2 * s; v = 0.5 + 0.22 * Math.sin(x / p * PI) * Math.sin(y / p * PI) + 0.18 * Math.sin((x + y) / (p * 1.7)) + (r() - 0.5) * 0.12; }   // canvas
    t[y * w + x] = v;
  }
  return t;
}
const LIGHT = { top: 90, topright: 45, right: 0, bottomright: -45, bottom: -90, bottomleft: -135, left: 180, topleft: 135 };
const LIGHTS = [['top', 'Top'], ['topright', 'Top right'], ['right', 'Right'], ['bottomright', 'Bottom right'], ['bottom', 'Bottom'], ['bottomleft', 'Bottom left'], ['left', 'Left'], ['topleft', 'Top left']];
/** relief shading from a height map: returns per-pixel brightness multipliers around 1 */
const relief = (t, w, hh, amount, light = 'topleft', invert = false) => {
  const a = LIGHT[light] * PI / 180, lx = Math.cos(a), ly = -Math.sin(a), m = new Float32Array(w * hh), k = amount * (invert ? -1 : 1);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const gx = t[y * w + Math.min(w - 1, x + 1)] - t[y * w + Math.max(0, x - 1)], gy = t[Math.min(hh - 1, y + 1) * w + x] - t[Math.max(0, y - 1) * w + x]; m[y * w + x] = 1 + (gx * lx + gy * ly) * k; }
  return m;
};
const applyMul = (img, m) => { const d = img.data; for (let j = 0, i = 0; j < m.length; j++, i += 4) { d[i] *= m[j]; d[i + 1] *= m[j]; d[i + 2] *= m[j]; } return img; };
const duoMap = (img, f) => { const d = img.data, A = fg(), B = bg(), n = img.width * img.height; for (let j = 0, i = 0; j < n; j++, i += 4) X.duo(d, i, f(j), A, B); return img; };
const displaceBy = (img, dxP, dyP, amt) => { const { width: w, height: hh, data: sd } = img, out = new ImageData(w, hh), o = out.data; for (let y = 0, j = 0; y < hh; y++) for (let x = 0; x < w; x++, j++) X.sample(sd, w, hh, x + 0.5 + dxP[j] * amt, y + 0.5 + dyP[j] * amt, o, j * 4, 'clamp'); return out; };
const gradOf = (p, w, hh) => { const gx = new Float32Array(w * hh), gy = new Float32Array(w * hh); for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { gx[y * w + x] = p[y * w + Math.min(w - 1, x + 1)] - p[y * w + Math.max(0, x - 1)]; gy[y * w + x] = p[Math.min(hh - 1, y + 1) * w + x] - p[Math.max(0, y - 1) * w + x]; } return [gx, gy]; };
const L255 = (img, j) => { const d = img.data, i = j * 4; return (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; };

/* ---------- the effects ---------- */
const P = (id, label, min, max, def, tip) => ({ id, label, min, max, def, tip });
const S = (id, label, options, def, tip) => ({ id, label, options, def, tip, type: 'select' });
const TEX = [S('tex', 'Texture', [['canvas', 'Canvas'], ['burlap', 'Burlap'], ['brick', 'Brick'], ['sandstone', 'Sandstone']], 'canvas', 'Surface texture.'), P('scaling', 'Scaling', 50, 200, 100, 'Size of the texture.'), P('relief', 'Relief', 0, 50, 12, 'Depth of the texture.'), S('light', 'Light', LIGHTS, 'topleft', 'Direction light falls on the texture.')];
const texOf = (img, v, k) => applyMul(img, relief(texture(v.tex, img.width, img.height, v.scaling / 100 * k), img.width, img.height, v.relief / 30, v.light));

const FX = {
  Artistic: {
    'Colored Pencil': [[P('width', 'Pencil width', 1, 24, 4, 'Thickness of the pencil strokes.'), P('pressure', 'Stroke pressure', 0, 15, 8, 'How dark the strokes are.'), P('paper', 'Paper brightness', 0, 50, 25, 'Color of the paper showing through.')], (img, v, k) => {
      const w = img.width, hh = img.height, d = img.data, st = strokes(w, hh, -45, v.width * 2.5 * k, 3), e = edgeP(img, 0.6), pb = 150 + v.paper * 2.1;
      for (let j = 0, i = 0; j < w * hh; j++, i += 4) { const L = L255(img, j), t = clamp((1 - L) * (0.55 + v.pressure / 22) + e[j] * 2.5 - st[j] * 0.55 + 0.15, 0, 1); for (let c = 0; c < 3; c++) d[i + c] = pb + (d[i + c] * 0.85 - pb) * t; }
      return img; }],
    'Cutout': [[P('levels', 'Number of levels', 2, 8, 4, 'Number of flat color steps.'), P('simplicity', 'Edge simplicity', 0, 10, 4, 'Smoother, simpler shapes.'), P('fidelity', 'Edge fidelity', 1, 3, 2, 'How closely shapes follow the original.')], (img, v, k) => posterize(X.median(blurI(img, (v.simplicity * 0.9 + 0.5) * k), Math.max(1, Math.round((4 - v.fidelity) * k))), v.levels)],
    'Dry Brush': [[P('size', 'Brush size', 0, 10, 2, 'Size of the dabs.'), P('detail', 'Brush detail', 0, 10, 8, 'Preserved detail.'), P('texture', 'Texture', 1, 3, 1, 'Grain of the dry paint.')], (img, v, k) => { const o = posterize(kuwa(img, (v.size + 1) * k, 6 + v.detail), 5 + v.detail); const t = X.fractal(img.width, img.height, 2 * k + 1, 2, 4); return applyMul(o, t.map(q => 1 + (q - 0.5) * 0.12 * v.texture)); }],
    'Film Grain': [[P('grain', 'Grain', 0, 20, 4, 'Amount of grain.'), P('highlight', 'Highlight area', 0, 20, 0, 'How much of the image glows white.'), P('intensity', 'Intensity', 0, 10, 10, 'Strength of the highlight glow.')], (img, v) => { const d = img.data, r = X.rng(3), th = 255 - v.highlight * 9; for (let i = 0; i < d.length; i += 4) { const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], n = (r() - 0.5) * v.grain * 9 * (1 - Math.abs(L / 255 - 0.5)), hi = L > th ? (L - th) / (255 - th + 1) * v.intensity / 10 : 0; for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + n + (255 - d[i + c]) * hi; } return img; }],
    'Fresco': [[P('size', 'Brush size', 0, 10, 2, 'Size of the strokes.'), P('detail', 'Brush detail', 0, 10, 8, 'Preserved detail.'), P('texture', 'Texture', 1, 3, 1, 'Plaster texture.')], (img, v, k) => { let o = kuwa(img, (v.size + 1.5) * k, 8 + v.detail); const e = edgeP(o, 0.8), d = o.data; for (let j = 0, i = 0; j < e.length; j++, i += 4) { const m = clamp(1 - e[j] * 3.5, 0.25, 1) * 0.92; for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] - 128) * 1.25 * m + 128 * m; } return applyMul(o, X.fractal(o.width, o.height, 3 * k + 1, 2, 6).map(q => 1 + (q - 0.5) * 0.18 * v.texture)); }],
    'Neon Glow': [[P('size', 'Glow size', -24, 24, 5, 'Positive glows outward from bright areas, negative from dark.'), P('brightness', 'Glow brightness', 0, 50, 15, 'Strength of the glow.'), { id: 'color', type: 'color', label: 'Glow color', def: '#8fd6ff', tip: 'Color of the neon.' }], (img, v, k) => { const w = img.width, hh = img.height, d = img.data, A = fg(), B = bg(), G = X.hex(v.color); let p = lumP(img); if (v.size < 0) p = p.map(q => 255 - q); const gl = norm(blurP(img, X.sobel(p, w, hh).mag, Math.abs(v.size) * 0.6 * k + 0.5)), b = v.brightness / 50 * 1.6; for (let j = 0, i = 0; j < w * hh; j++, i += 4) { const L = L255(img, j); for (let c = 0; c < 3; c++) { const base = A[c] + (B[c] - A[c]) * L * 0.75; d[i + c] = 255 - (255 - base) * (1 - G[c] / 255 * clamp(gl[j] * b, 0, 1)); } } return img; }],
    'Paint Daubs': [[P('size', 'Brush size', 1, 50, 8, 'Size of the daubs.'), P('sharpness', 'Sharpness', 0, 40, 7, 'Crispness of the daubs.'), S('type', 'Brush type', [['simple', 'Simple'], ['lightrough', 'Light rough'], ['darkrough', 'Dark rough'], ['widesharp', 'Wide sharp'], ['wideblurry', 'Wide blurry'], ['sparkle', 'Sparkle']], 'simple', 'Character of the brush.')], (img, v, k) => { let o = X.median(img, Math.max(1, Math.round(v.size / 3 * k))); if (v.type === 'wideblurry') o = X.blurImg(o, 1.5 * k); const c = X.toCanvas(o); o = X.read(F.sharpen(c, { amount: v.sharpness * 6, radius: 1.5 * k, threshold: 0 })); const d = o.data, r = X.rng(9); for (let i = 0; i < d.length; i += 4) { const L = (d[i] + d[i + 1] + d[i + 2]) / 3; let add = 0; if (v.type === 'lightrough') add = (r() - 0.3) * 30; else if (v.type === 'darkrough') add = (r() - 0.7) * 30; else if (v.type === 'sparkle' && L > 170) add = (L - 170) * 0.9; else if (v.type === 'widesharp') add = (L - 128) * 0.15; d[i] += add; d[i + 1] += add; d[i + 2] += add; } return o; }],
    'Palette Knife': [[P('stroke', 'Stroke size', 1, 50, 25, 'Size of the knife strokes.'), P('detail', 'Stroke detail', 1, 3, 3, 'Detail kept.'), P('softness', 'Softness', 0, 10, 0, 'Softens the edges of the strokes.')], (img, v, k) => blurI(posterize(kuwa(img, v.stroke / 6 * k + 1, 4 + v.detail * 3), 4 + v.detail * 3), v.softness * 0.4 * k)],
    'Plastic Wrap': [[P('strength', 'Highlight strength', 0, 20, 15, 'Brightness of the plastic sheen.'), P('detail', 'Detail', 1, 15, 9, 'How closely the wrap follows the image.'), P('smoothness', 'Smoothness', 1, 15, 7, 'Smoothness of the plastic.')], (img, v, k) => { const w = img.width, hh = img.height, d = img.data, p = blurP(img, lumP(img), (v.smoothness * 0.7 + (16 - v.detail) * 0.3) * k), [gx, gy] = gradOf(p, w, hh); for (let j = 0, i = 0; j < w * hh; j++, i += 4) { const sh = clamp(-(gx[j] + gy[j]) / 30, 0, 1), s = Math.pow(sh, 2.2) * v.strength / 20 * 255 * 1.6; for (let c = 0; c < 3; c++) d[i + c] += s; } return img; }],
    'Poster Edges': [[P('thickness', 'Edge thickness', 0, 10, 2, 'Width of the black outlines.'), P('intensity', 'Edge intensity', 0, 10, 1, 'How many edges get outlined.'), P('posterize', 'Posterization', 0, 6, 2, 'Number of color levels.')], (img, v, k) => { const e = norm(blurP(img, edgeP(img, 0.7 * k), v.thickness * 0.35 * k)), o = posterize(img, 2 + v.posterize), d = o.data, t = 0.42 - v.intensity * 0.03; for (let j = 0, i = 0; j < e.length; j++, i += 4) if (e[j] > t) { const m = clamp(1 - (e[j] - t) * 6, 0, 1); d[i] *= m; d[i + 1] *= m; d[i + 2] *= m; } return o; }],
    'Rough Pastels': [[P('length', 'Stroke length', 0, 40, 6, 'Length of the pastel strokes.'), P('detail', 'Stroke detail', 1, 20, 4, 'Detail kept.'), ...TEX], (img, v, k) => texOf(lineBlurImg(img, -40, v.length * 0.7 * k + (21 - v.detail) * 0.1), v, k)],
    'Smudge Stick': [[P('length', 'Stroke length', 0, 10, 2, 'Length of the smudges.'), P('highlight', 'Highlight area', 0, 20, 0, 'How much glows.'), P('intensity', 'Intensity', 0, 10, 10, 'Strength of the highlight.')], (img, v, k) => { const o = lineBlurImg(X.copy(img), 45, v.length * 2.5 * k + 1), d = o.data, s = img.data, th = 255 - v.highlight * 9; for (let i = 0; i < d.length; i += 4) { for (let c = 0; c < 3; c++) d[i + c] = Math.min(d[i + c], s[i + c]) * 0.85 + d[i + c] * 0.15; const L = (d[i] + d[i + 1] + d[i + 2]) / 3; if (L > th) for (let c = 0; c < 3; c++) d[i + c] += (255 - d[i + c]) * (L - th) / (255 - th + 1) * v.intensity / 10; } return o; }],
    'Sponge': [[P('size', 'Brush size', 0, 10, 2, 'Size of the sponge holes.'), P('definition', 'Definition', 0, 25, 12, 'Contrast of the sponge texture.'), P('smoothness', 'Smoothness', 1, 15, 5, 'Smoothness of the result.')], (img, v, k) => { const o = blurI(img, v.smoothness * 0.3 * k), t = norm(X.fractal(img.width, img.height, (v.size + 1) * 2 * k + 1, 3, 12)); return applyMul(o, t.map(q => 1 + (q - 0.5) * v.definition / 25 * 0.9)); }],
    'Underpainting': [[P('size', 'Brush size', 0, 40, 6, 'Blur of the underpainting.'), P('coverage', 'Texture coverage', 0, 40, 16, 'How much of the original shows through.'), ...TEX], (img, v, k) => { const o = blurI(X.copy(img), v.size * 0.35 * k + 0.5), d = o.data, s = img.data, m = 1 - v.coverage / 40; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * (1 - m * 0.4) + s[i + c] * m * 0.4; return texOf(o, v, k); }],
    'Watercolor': [[P('detail', 'Brush detail', 1, 14, 9, 'Detail kept.'), P('shadow', 'Shadow intensity', 0, 10, 1, 'Darkness of pooled pigment at edges.'), P('texture', 'Texture', 1, 3, 1, 'Paper texture.')], (img, v, k) => { let o = X.median(img, Math.max(1, Math.round((15 - v.detail) / 3 * k))); o = blurI(o, 0.8 * k); const e = norm(edgeP(o, 1.2 * k)), d = o.data; for (let j = 0, i = 0; j < e.length; j++, i += 4) { const L = (d[i] + d[i + 1] + d[i + 2]) / 3, m = 1 - e[j] * (0.25 + v.shadow * 0.07); for (let c = 0; c < 3; c++) d[i + c] = (L + (d[i + c] - L) * 1.25) * m; } return applyMul(o, X.fractal(o.width, o.height, 2 * k + 1, 2, 31).map(q => 1 + (q - 0.5) * 0.08 * v.texture)); }],
  },
  'Brush Strokes': {
    'Accented Edges': [[P('width', 'Edge width', 1, 14, 2, 'Width of the accented edges.'), P('brightness', 'Edge brightness', 0, 50, 38, 'Above 25 the edges glow like chalk; below, they darken like ink.'), P('smoothness', 'Smoothness', 1, 15, 5, 'Smoothness of the edges.')], (img, v, k) => { const e = norm(blurP(img, edgeP(img, v.smoothness * 0.2 * k), v.width * 0.3 * k)), d = img.data, up = v.brightness >= 25, s = Math.abs(v.brightness - 25) / 25; for (let j = 0, i = 0; j < e.length; j++, i += 4) for (let c = 0; c < 3; c++) d[i + c] = up ? d[i + c] + (255 - d[i + c]) * e[j] * s * 1.6 : d[i + c] * (1 - e[j] * s * 1.6); return img; }],
    'Angled Strokes': [[P('balance', 'Direction balance', 0, 100, 50, 'Balance between the two stroke directions.'), P('length', 'Stroke length', 3, 50, 15, 'Length of the strokes.'), P('sharpness', 'Sharpness', 0, 10, 3, 'Crispness.')], (img, v, k) => { const a = lineBlurImg(X.copy(img), 45, v.length / 2.5 * k), b = lineBlurImg(X.copy(img), -45, v.length / 2.5 * k), d = img.data, th = v.balance / 100; for (let j = 0, i = 0; i < d.length; j++, i += 4) { const L = (d[i] + d[i + 1] + d[i + 2]) / 765, src = L < th ? a.data : b.data; for (let c = 0; c < 3; c++) d[i + c] = src[i + c] + (src[i + c] - 128) * v.sharpness * 0.04; } return img; }],
    'Crosshatch': [[P('length', 'Stroke length', 3, 50, 9, 'Length of the hatching.'), P('sharpness', 'Sharpness', 0, 20, 6, 'Crispness.'), P('strength', 'Strength', 1, 3, 1, 'How many hatch layers.')], (img, v, k) => { const w = img.width, hh = img.height, d = img.data, h1 = strokes(w, hh, 45, v.length * k, 1), h2 = strokes(w, hh, -45, v.length * k, 2); for (let j = 0, i = 0; j < w * hh; j++, i += 4) { const L = L255(img, j), hatch = (L < 0.6 ? clamp((0.6 - L) * 2 - h1[j] + 0.4, 0, 1) : 0) + (v.strength > 1 && L < 0.35 ? clamp((0.35 - L) * 3 - h2[j] + 0.4, 0, 1) : 0), m = 1 - clamp(hatch * (0.4 + v.sharpness / 40), 0, 0.85); for (let c = 0; c < 3; c++) d[i + c] *= m; } return img; }],
    'Dark Strokes': [[P('balance', 'Balance', 0, 10, 5, 'Balance between dark and light strokes.'), P('black', 'Black intensity', 0, 10, 0, 'Darkness of the dark strokes.'), P('white', 'White intensity', 0, 10, 2, 'Brightness of the light strokes.')], (img, v, k) => { const a = lineBlurImg(X.copy(img), -45, 3 * k), b = lineBlurImg(X.copy(img), 45, 9 * k), d = img.data, th = v.balance / 10; for (let i = 0; i < d.length; i += 4) { const L = (d[i] + d[i + 1] + d[i + 2]) / 765; for (let c = 0; c < 3; c++) d[i + c] = L < th ? a.data[i + c] * (0.85 - v.black * 0.06) : b.data[i + c] + (255 - b.data[i + c]) * v.white * 0.05; } return img; }],
    'Ink Outlines': [[P('length', 'Stroke length', 1, 50, 4, 'Length of the ink strokes.'), P('dark', 'Dark intensity', 0, 50, 20, 'Darkness of the outlines.'), P('light', 'Light intensity', 0, 50, 10, 'Brightness of light areas.')], (img, v, k) => { const e = norm(lineBlur(edgeP(img, 0.6 * k), img.width, img.height, 45, v.length * 0.5 * k)), d = img.data; for (let j = 0, i = 0; j < e.length; j++, i += 4) { const L = L255(img, j); for (let c = 0; c < 3; c++) { let q = d[i + c] * (1 - e[j] * v.dark / 30); if (L > 0.6) q += (255 - q) * v.light / 100; d[i + c] = q; } } return img; }],
    'Spatter': [[P('radius', 'Spray radius', 0, 25, 10, 'How far paint sprays.'), P('smoothness', 'Smoothness', 1, 15, 5, 'Smoothness of the spray pattern.')], (img, v, k) => { const w = img.width, hh = img.height, a = norm(blurP(img, noiseP(w * hh, 3), v.smoothness * 0.25)), b = norm(blurP(img, noiseP(w * hh, 4), v.smoothness * 0.25)); return displaceBy(img, a.map(q => q - 0.5), b.map(q => q - 0.5), v.radius * 1.6 * k); }],
    'Sprayed Strokes': [[P('length', 'Stroke length', 0, 20, 12, 'Length of the strokes.'), P('radius', 'Spray radius', 0, 25, 7, 'Spray spread.'), S('dir', 'Stroke direction', [['-45', 'Right diagonal'], ['45', 'Left diagonal'], ['0', 'Horizontal'], ['90', 'Vertical']], '-45', 'Direction of the strokes.')], (img, v, k) => { const w = img.width, hh = img.height, a = noiseP(w * hh, 5).map(q => q - 0.5), b = noiseP(w * hh, 6).map(q => q - 0.5); return lineBlurImg(displaceBy(img, a, b, v.radius * 1.4 * k), +v.dir, v.length / 2 * k); }],
    'Sumi-e': [[P('width', 'Stroke width', 3, 15, 10, 'Width of the brush strokes.'), P('pressure', 'Stroke pressure', 0, 15, 2, 'How much ink.'), P('contrast', 'Contrast', 0, 40, 16, 'Contrast of the ink.')], (img, v, k) => { const o = blurI(img, v.width * 0.18 * k), d = o.data, c2 = 1 + v.contrast / 20; for (let i = 0; i < d.length; i += 4) { const L = (d[i] + d[i + 1] + d[i + 2]) / 765, m = Math.pow(L, 1 + v.pressure / 8); for (let c = 0; c < 3; c++) d[i + c] = clamp(((d[i + c] * m / Math.max(0.05, L)) - 128) * c2 + 128, 0, 255); } return o; }],
  },
  Distort: {
    'Diffuse Glow': [[P('grain', 'Graininess', 0, 10, 6, 'Grain in the glow.'), P('glow', 'Glow amount', 0, 20, 10, 'Strength of the glow (uses the background color).'), P('clear', 'Clear amount', 0, 20, 15, 'How much of the image stays clear of glow.')], (img, v) => { const d = img.data, B = bg(), r = X.rng(2), th = v.clear / 20 * 0.8; for (let i = 0; i < d.length; i += 4) { const L = (d[i] + d[i + 1] + d[i + 2]) / 765, g = clamp((L - th) / (1 - th + 1e-3), 0, 1) * v.glow / 20, n = (r() - 0.5) * v.grain * 8; for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (B[c] - d[i + c]) * g + n; } return img; }],
    'Glass': [[P('distortion', 'Distortion', 0, 20, 5, 'Strength of the refraction.'), P('smoothness', 'Smoothness', 1, 15, 3, 'Smoothness of the glass.'), S('tex', 'Texture', [['frosted', 'Frosted'], ['blocks', 'Blocks'], ['canvas', 'Canvas'], ['lens', 'Tiny lens']], 'frosted', 'Glass surface.'), P('scaling', 'Scaling', 50, 200, 100, 'Size of the texture.')], (img, v, k) => { const w = img.width, hh = img.height, t = X.gaussPlane(texture(v.tex, w, hh, v.scaling / 100 * k * 1.4), w, hh, v.smoothness * 0.3 * k), [gx, gy] = gradOf(t, w, hh); return displaceBy(img, gx, gy, v.distortion * 4 * k); }],
    'Ocean Ripple': [[P('size', 'Ripple size', 1, 15, 9, 'Size of the ripples.'), P('magnitude', 'Ripple magnitude', 0, 20, 9, 'Strength.')], (img, v, k) => { const w = img.width, hh = img.height, t = X.fractal(w, hh, v.size * 2.2 * k + 2, 2, 8), [gx, gy] = gradOf(t, w, hh); return displaceBy(img, gx, gy, v.magnitude * 9 * k); }],
  },
  Sketch: {
    'Bas Relief': [[P('detail', 'Detail', 1, 15, 13, 'Detail of the relief.'), P('smoothness', 'Smoothness', 1, 15, 3, 'Smoothness.'), S('light', 'Light', LIGHTS, 'bottom', 'Light direction.')], (img, v, k) => { const w = img.width, hh = img.height, p = blurP(img, lumP(img), (v.smoothness * 0.4 + (16 - v.detail) * 0.15) * k).map(q => q / 255), m = relief(p, w, hh, 3.2 * v.detail / 13, v.light); return duoMap(img, j => clamp(0.5 + (m[j] - 1) * 1.4 + (L255(img, j) - 0.5) * 0.25, 0, 1)); }],
    'Chalk & Charcoal': [[P('charcoal', 'Charcoal area', 0, 20, 6, 'How much is drawn in charcoal (primary color).'), P('chalk', 'Chalk area', 0, 20, 6, 'How much is drawn in chalk (secondary color).'), P('pressure', 'Stroke pressure', 0, 5, 1, 'Stroke strength.')], (img, v, k) => { const w = img.width, hh = img.height, d = img.data, A = fg(), B = bg(), s1 = strokes(w, hh, 45, 5 * k, 7), s2 = strokes(w, hh, -45, 5 * k, 8); for (let j = 0, i = 0; j < w * hh; j++, i += 4) { const L = L255(img, j), dark = clamp((0.5 - L) * (1 + v.charcoal / 6) + (s1[j] - 0.5) * (0.3 + v.pressure * 0.1), 0, 1), light = clamp((L - 0.5) * (1 + v.chalk / 6) + (s2[j] - 0.5) * (0.3 + v.pressure * 0.1), 0, 1); for (let c = 0; c < 3; c++) d[i + c] = 128 + (A[c] - 128) * dark * 1.6 + (B[c] - 128) * light * 1.6; } return img; }],
    'Charcoal': [[P('thickness', 'Charcoal thickness', 1, 7, 1, 'Thickness of the strokes.'), P('detail', 'Detail', 0, 5, 5, 'Detail kept.'), P('balance', 'Light/dark balance', 0, 100, 50, 'More charcoal or more paper.')], (img, v, k) => { const w = img.width, hh = img.height, s = strokes(w, hh, -45, (2 + v.thickness * 2) * k, 9), e = edgeP(img, (6 - v.detail) * 0.3 * k), th = v.balance / 100; return duoMap(img, j => { const L = L255(img, j); return clamp((L - th) * 3.5 + 0.5 + (s[j] - 0.5) * 0.9 + e[j] * -2, 0, 1); }); }],
    'Chrome': [[P('detail', 'Detail', 0, 10, 4, 'Number of chrome reflections.'), P('smoothness', 'Smoothness', 0, 10, 7, 'Smoothness of the metal.')], (img, v, k) => { const p = blurP(img, lumP(img), (v.smoothness * 0.6 + 0.5) * k), d = img.data, f = 1.5 + v.detail / 2.2; for (let j = 0, i = 0; j < p.length; j++, i += 4) { const q = 0.5 + 0.5 * Math.sin(p[j] / 255 * PI * f - PI / 2), g = clamp(q, 0, 1) * 255; d[i] = d[i + 1] = d[i + 2] = g; } return img; }],
    'Conté Crayon': [[P('fgLevel', 'Foreground level', 1, 15, 11, 'Strength of the dark (primary) crayon.'), P('bgLevel', 'Background level', 1, 15, 7, 'Strength of the light (secondary) crayon.'), ...TEX], (img, v, k) => { const o = duoMap(img, j => clamp((L255(img, j) - 0.5) * (0.6 + (v.fgLevel + v.bgLevel) / 15) + 0.5 + (v.bgLevel - v.fgLevel) / 40, 0, 1)); return texOf(o, v, k); }],
    'Graphic Pen': [[P('length', 'Stroke length', 1, 15, 15, 'Length of the pen strokes.'), P('balance', 'Light/dark balance', 0, 100, 50, 'More ink or more paper.'), S('dir', 'Stroke direction', [['-45', 'Right diagonal'], ['0', 'Horizontal'], ['45', 'Left diagonal'], ['90', 'Vertical']], '-45', 'Direction of the strokes.')], (img, v, k) => { const w = img.width, hh = img.height, s = strokes(w, hh, +v.dir, v.length * 0.8 * k, 10), th = v.balance / 100; return duoMap(img, j => (L255(img, j) * 0.9 + s[j] * 0.45 - 0.2 > th ? 1 : 0)); }],
    'Halftone Pattern': [[P('size', 'Size', 1, 12, 1, 'Size of the pattern.'), P('contrast', 'Contrast', 0, 50, 5, 'Contrast of the pattern.'), S('type', 'Pattern', [['circle', 'Circle'], ['dot', 'Dot'], ['line', 'Line']], 'dot', 'Halftone shape.')], (img, v, k) => { const w = img.width, sz = (v.size * 2 + 3) * k, ct = 1 + v.contrast / 6; return duoMap(img, j => { const x = j % w, y = (j / w) | 0; let pat; if (v.type === 'line') pat = 0.5 + 0.5 * Math.sin(y / sz * 2 * PI); else if (v.type === 'circle') { const cx = w / 2, cy = img.height / 2; pat = 0.5 + 0.5 * Math.sin(Math.hypot(x - cx, y - cy) / sz * 2 * PI); } else pat = 0.5 + 0.25 * (Math.sin(x / sz * 2 * PI) + Math.sin(y / sz * 2 * PI)); return clamp((L255(img, j) - pat) * ct * 4 + 0.5, 0, 1); }); }],
    'Note Paper': [[P('balance', 'Image balance', 0, 50, 25, 'Threshold between paper and print.'), P('grain', 'Graininess', 0, 20, 10, 'Paper grain.'), P('relief', 'Relief', 0, 25, 11, 'Embossed depth.')], (img, v, k) => { const w = img.width, hh = img.height, th = v.balance / 50, r = X.rng(4), t = new Float32Array(w * hh); for (let j = 0; j < t.length; j++) t[j] = L255(img, j) + (r() - 0.5) * v.grain / 30 > th ? 1 : 0; const sm = X.gaussPlane(t, w, hh, 1.2 * k), m = relief(sm, w, hh, v.relief / 6, 'topleft'); return duoMap(img, j => clamp(t[j] * 0.85 + 0.15 + (m[j] - 1), 0, 1)); }],
    'Photocopy': [[P('detail', 'Detail', 1, 24, 7, 'Width of the copied edges.'), P('darkness', 'Darkness', 1, 50, 8, 'Darkness of the toner.')], (img, v, k) => { const p = lumP(img), b = blurP(img, p, v.detail * 0.5 * k + 0.5); return duoMap(img, j => clamp(1 - (b[j] - p[j]) / 255 * v.darkness * 0.9, 0, 1)); }],
    'Plaster': [[P('balance', 'Image balance', 0, 50, 20, 'Threshold of the plaster.'), P('smoothness', 'Smoothness', 1, 15, 2, 'Smoothness of the blobs.'), S('light', 'Light', LIGHTS, 'top', 'Light direction.')], (img, v, k) => { const w = img.width, hh = img.height, b = blurP(img, lumP(img), v.smoothness * 0.6 * k + 0.6), th = v.balance / 50 * 255, t = b.map(q => (q > th ? 1 : 0)), sm = X.gaussPlane(t, w, hh, 1.5 * k), m = relief(sm, w, hh, 3, v.light); return duoMap(img, j => clamp(0.15 + sm[j] * 0.7 + (m[j] - 1) * 1.2, 0, 1)); }],
    'Reticulation': [[P('density', 'Density', 0, 50, 12, 'Density of the grain.'), P('fgLevel', 'Foreground level', 0, 50, 40, 'Strength of the shadows.'), P('bgLevel', 'Background level', 0, 50, 5, 'Strength of the highlights.')], (img, v, k) => { const w = img.width, hh = img.height, n = X.fractal(w, hh, 1.3 * k + 0.5, 2, 13); return duoMap(img, j => clamp((L255(img, j) - 0.5) * 2 + (n[j] - 0.5) * v.density / 18 + (v.bgLevel - v.fgLevel) / 80 + 0.5, 0, 1)); }],
    'Stamp': [[P('balance', 'Light/dark balance', 0, 50, 25, 'Threshold.'), P('smoothness', 'Smoothness', 1, 50, 5, 'Smoothness of the stamp shapes.')], (img, v, k) => { const b = blurP(img, lumP(img), v.smoothness * 0.25 * k + 0.4), th = v.balance / 50 * 255; return duoMap(img, j => clamp((b[j] - th) / 12 + 0.5, 0, 1)); }],
    'Torn Edges': [[P('balance', 'Image balance', 0, 50, 25, 'Threshold.'), P('smoothness', 'Smoothness', 1, 15, 11, 'Smoothness of the torn edges.'), P('contrast', 'Contrast', 1, 25, 17, 'Edge sharpness.')], (img, v, k) => { const w = img.width, hh = img.height, b = blurP(img, lumP(img), (16 - v.smoothness) * 0.15 * k + 0.4), n = X.fractal(w, hh, 2 * k + 1, 3, 15), th = v.balance / 50 * 255; return duoMap(img, j => clamp((b[j] + (n[j] - 0.5) * 70 - th) * v.contrast / 120 + 0.5, 0, 1)); }],
    'Water Paper': [[P('fiber', 'Fiber length', 3, 50, 15, 'Length of the paper fibres.'), P('brightness', 'Brightness', 0, 100, 60, 'Brightness.'), P('contrast', 'Contrast', 0, 100, 80, 'Contrast.')], (img, v, k) => { const w = img.width, hh = img.height, f1 = norm(lineBlur(noiseP(w * hh, 3), w, hh, 90, v.fiber * 0.4 * k)), o = X.blurImg(img, 0.8 * k), d = o.data, b = (v.brightness - 50) * 1.6, c = 0.4 + v.contrast / 80; for (let j = 0, i = 0; j < f1.length; j++, i += 4) for (let q = 0; q < 3; q++) d[i + q] = ((d[i + q] - 128) * c + 128 + b) * (0.85 + f1[j] * 0.3); return o; }],
  },
  Stylize: {
    'Glowing Edges': [[P('width', 'Edge width', 1, 14, 2, 'Width of the glowing edges.'), P('brightness', 'Edge brightness', 0, 20, 6, 'Brightness of the glow.'), P('smoothness', 'Smoothness', 1, 15, 5, 'Smoothness.')], (img, v, k) => { const w = img.width, hh = img.height, d = img.data, n = w * hh, e = [0, 1, 2].map(c => blurP(img, X.sobel(X.gaussPlane(X.channel(d, n, c), w, hh, v.smoothness * 0.2 * k), w, hh).mag, v.width * 0.35 * k)); for (let j = 0, i = 0; j < n; j++, i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp(e[c][j] * 255 * (1.5 + v.brightness / 3), 0, 255); return img; }],
  },
  Texture: {
    'Craquelure': [[P('spacing', 'Crack spacing', 2, 100, 15, 'Distance between cracks.'), P('depth', 'Crack depth', 0, 10, 6, 'Darkness of the cracks.'), P('brightness', 'Crack brightness', 0, 10, 9, 'Brightness of the surface.')], (img, v, k) => { const w = img.width, hh = img.height, vo = X.voronoi(w, hh, v.spacing * 2 * k + 4, 21), t = vo.edge.map(q => clamp(q / (2.2 * k + 0.5), 0, 1)), m = relief(t, w, hh, v.depth / 3, 'topleft'), d = img.data; for (let j = 0, i = 0; j < t.length; j++, i += 4) { const crack = 1 - (1 - t[j]) * v.depth / 12; for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * crack * m[j] * (0.75 + v.brightness / 36); } return img; }],
    'Grain': [[P('intensity', 'Intensity', 0, 100, 40, 'Strength of the grain.'), P('contrast', 'Contrast', 0, 100, 50, 'Contrast.'), S('type', 'Grain type', [['regular', 'Regular'], ['soft', 'Soft'], ['sprinkles', 'Sprinkles'], ['clumped', 'Clumped'], ['contrasty', 'Contrasty'], ['enlarged', 'Enlarged'], ['stippled', 'Stippled'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['speckle', 'Speckle']], 'regular', 'Kind of grain.')], (img, v, k) => { const w = img.width, hh = img.height, d = img.data, n = w * hh; let g = noiseP(n, 23); if (v.type === 'soft' || v.type === 'clumped') g = norm(X.gaussPlane(g, w, hh, (v.type === 'clumped' ? 1.4 : 0.7) * k)); if (v.type === 'enlarged') g = norm(X.gaussPlane(g, w, hh, 2 * k)); if (v.type === 'horizontal') g = norm(lineBlur(g, w, hh, 0, 6 * k)); if (v.type === 'vertical') g = norm(lineBlur(g, w, hh, 90, 6 * k)); const a = v.intensity / 100 * 120; for (let j = 0, i = 0; j < n; j++, i += 4) { let q = (g[j] - 0.5) * a; if (v.type === 'sprinkles') q = g[j] > 0.92 ? 120 : 0; if (v.type === 'stippled') q = g[j] > 0.75 ? -90 : 0; if (v.type === 'speckle') q = g[j] > 0.96 ? 140 : g[j] < 0.04 ? -140 : 0; if (v.type === 'contrasty') q *= 1.8; for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] + q - 128) * (0.5 + v.contrast / 100) + 128; } return img; }],
    'Mosaic Tiles': [[P('tile', 'Tile size', 2, 100, 12, 'Size of the tiles.'), P('grout', 'Grout width', 1, 15, 3, 'Width of the gaps.'), P('lighten', 'Lighten grout', 0, 10, 9, 'Brightness of the grout.')], (img, v, k) => { const w = img.width, d = img.data, sz = v.tile * 1.5 * k + 2, gw = v.grout * 0.5 * k + 0.5; for (let j = 0, i = 0; i < d.length; j++, i += 4) { const x = j % w, y = (j / w) | 0, mx = x % sz, my = y % sz, inG = mx < gw || my < gw; if (inG) for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * 0.3 + 255 * v.lighten / 14; else { const sh = 1 + ((mx < sz / 2 ? 0.06 : -0.04) + (my < sz / 2 ? 0.06 : -0.04)); for (let c = 0; c < 3; c++) d[i + c] *= sh; } } return img; }],
    'Patchwork': [[P('square', 'Square size', 0, 10, 4, 'Size of the patches.'), P('relief', 'Relief', 0, 25, 8, 'Depth of the patches.')], (img, v, k) => { const w = img.width, hh = img.height, sz = Math.max(2, Math.round((v.square + 2) * 2 * k)), o = X.read(F.pixelate(X.toCanvas(img), { size: sz })), d = o.data, t = new Float32Array(w * hh); for (let j = 0; j < t.length; j++) { const x = j % w, y = (j / w) | 0; t[j] = (x % sz) / sz + (y % sz) / sz; } return applyMul(o, relief(t, w, hh, v.relief / 50, 'topleft')); }],
    'Stained Glass': [[P('cell', 'Cell size', 2, 50, 10, 'Size of the glass pieces.'), P('border', 'Border thickness', 1, 20, 4, 'Lead lines (in the primary color).'), P('light', 'Light intensity', 0, 10, 3, 'Light shining through the center.')], (img, v, k) => { const w = img.width, hh = img.height, n = w * hh, vo = X.voronoi(w, hh, v.cell * 3 * k + 4, 33), cc = X.cellColors(img.data, vo.cell, vo.count, n), d = img.data, A = fg(), bw = v.border * 0.45 * k + 0.4, cx = w / 2, cy = hh / 2, R = Math.hypot(cx, cy); for (let j = 0, i = 0; j < n; j++, i += 4) { const q = vo.cell[j] * 4, x = j % w, y = (j / w) | 0, lt = 1 + v.light / 10 * 0.7 * clamp(1 - Math.hypot(x - cx, y - cy) / R * 1.4, 0, 1); if (vo.edge[j] < bw) { d[i] = A[0]; d[i + 1] = A[1]; d[i + 2] = A[2]; } else { d[i] = cc[q] * lt; d[i + 1] = cc[q + 1] * lt; d[i + 2] = cc[q + 2] * lt; } } return img; }],
    'Texturizer': [[...TEX, { id: 'invert', type: 'toggle', label: 'Invert', def: false, tip: 'Flip the texture’s bumps and dents.' }], (img, v, k) => applyMul(img, relief(texture(v.tex, img.width, img.height, v.scaling / 100 * k), img.width, img.height, v.relief / 30, v.light, v.invert))],
  },
};
I.GALLERY = FX;
const find = name => { for (const cat in FX) if (FX[cat][name]) return FX[cat][name]; return null; };
const defaults = name => Object.fromEntries(find(name)[0].map(p => [p.id, p.def]));
const runStack = (cv, layers, k) => { let img = X.read(cv); for (const L of layers) if (L.on) img = find(L.name)[1](img, L.v, k) || img; return img; };

/* =====================================================================
   Dialog
   ===================================================================== */
I.filterGallery = () => {
  const Lr = I.active();
  if (!Lr) return;
  if (Lr.locked) return App.toast('Layer is locked', 'warn');
  I.settle(); I.flushDev();
  const tgt = I.target(), full = tgt.src;
  let last = null; try { last = JSON.parse(localStorage.getItem('strata.gallery') || 'null'); } catch {}
  const layers = last && last.length ? last.filter(L => find(L.name)).map(L => ({ ...L, v: { ...defaults(L.name), ...L.v } })) : [{ name: 'Dry Brush', v: defaults('Dry Brush'), on: true }];
  let cur = layers.length - 1;
  // preview source at screen size
  const maxSide = 900, pk = Math.min(1, maxSide / Math.max(full.width, full.height)), prevSrc = pk < 1 ? X.scaled(full, pk) : F.clone(full);
  const pv = h('canvas', { class: 'fg-cv', width: prevSrc.width, height: prevSrc.height }), pctx = pv.getContext('2d');
  const status = h('div', { class: 'fg-status' }, 'Rendering…');
  let timer = 0, showOrig = false;
  const render = () => {
    clearTimeout(timer); status.textContent = 'Rendering…';
    timer = setTimeout(() => {
      const t0 = performance.now();
      try { pctx.putImageData(showOrig ? X.read(prevSrc) : runStack(prevSrc, layers, pk), 0, 0); status.textContent = `${layers.filter(l => l.on).length} effect${layers.length === 1 ? '' : 's'} · preview ${Math.round(performance.now() - t0)} ms`; }
      catch (e) { console.error(e); status.textContent = 'Could not render: ' + e.message; }
    }, 90);
  };
  // thumbnails rendered from a crop of the image
  const tw = 96, th = 66, crop = (() => { const s = Math.min(full.width / tw, full.height / th) * 0.55, cw = tw * s, ch = th * s, c = App.canvas(tw, th); c.getContext('2d').drawImage(full, (full.width - cw) / 2, (full.height - ch) / 2, cw, ch, 0, 0, tw, th); return { c, k: 1 / s }; })();
  const thumbQueue = [];
  const pumpThumbs = () => { const t0 = performance.now(); while (thumbQueue.length && performance.now() - t0 < 30) { const [cv, name] = thumbQueue.shift(); try { cv.getContext('2d').putImageData(find(name)[1](X.read(crop.c), defaults(name), crop.k), 0, 0); } catch {} } if (thumbQueue.length) setTimeout(pumpThumbs, 16); };
  const tiles = {};
  const catalog = h('div', { class: 'fg-cat' }, Object.entries(FX).map(([cat, items]) => {
    const grid = h('div', { class: 'fg-grid' }, Object.keys(items).map(name => {
      const cv = h('canvas', { width: tw, height: th }); thumbQueue.push([cv, name]);
      const t = h('div', { class: 'fg-tile', role: 'button', tabindex: 0, title: name, tip: `Apply “${name}” to the selected effect layer.` }, cv, h('span', null, name));
      t.addEventListener('click', () => { layers[cur] = { name, v: defaults(name), on: true }; refresh(); });
      tiles[name] = t;
      return t;
    }));
    return App.section(cat, 'folder', grid, { id: 'fg-' + cat.replace(/\W/g, ''), closed: cat !== 'Artistic' });
  }));
  setTimeout(pumpThumbs, 50);
  // right side: effect selector, params, effect layers
  const params = h('div', { class: 'fg-params' }), stackEl = h('div', { class: 'fg-stack' });
  const allNames = Object.entries(FX).map(([cat, items]) => ({ group: cat, options: Object.keys(items).map(n => [n, n]) }));
  const refresh = () => {
    const L = layers[cur], def = find(L.name)[0];
    Object.values(tiles).forEach(t => t.classList.remove('on')); tiles[L.name] && tiles[L.name].classList.add('on');
    params.innerHTML = '';
    params.append(App.select({ label: 'Effect', value: L.name, options: allNames, tip: 'Effect used by the selected layer.', onChange: v => { layers[cur] = { name: v, v: defaults(v), on: true }; refresh(); } }));
    for (const p of def) {
      if (p.type === 'select') params.append(App.select({ label: p.label, value: L.v[p.id], options: p.options, tip: p.tip, onChange: v => { L.v[p.id] = v; render(); } }));
      else if (p.type === 'toggle') params.append(App.toggle({ label: p.label, value: !!L.v[p.id], tip: p.tip, onChange: v => { L.v[p.id] = v; render(); } }));
      else if (p.type === 'color') params.append(App.color({ label: p.label, value: L.v[p.id], tip: p.tip, onInput: v => { L.v[p.id] = v; render(); } }));
      else params.append(App.slider({ label: p.label, min: p.min, max: p.max, value: L.v[p.id], def: p.def, tip: p.tip, onInput: v => { L.v[p.id] = v; render(); } }));
    }
    stackEl.innerHTML = '';
    layers.slice().reverse().forEach((L2, ri) => {
      const i = layers.length - 1 - ri;
      const eye = btn({ icon: L2.on ? 'eye' : 'eyeOff', cls: 'sm', title: 'Show / hide', tip: 'Turn this effect layer on or off.', onClick: e => { e.stopPropagation(); L2.on = !L2.on; refresh(); } });
      const row = h('div', { class: 'fg-layer' + (i === cur ? ' on' : ''), role: 'button', tabindex: 0, title: L2.name, tip: 'Effect layers run bottom to top. Click to edit this one.' }, eye, h('span', null, L2.name));
      row.addEventListener('click', () => { cur = i; refresh(); });
      stackEl.append(row);
    });
    render();
  };
  const stackBtns = h('div', { class: 'btn-row', style: { padding: '6px 10px', justifyContent: 'flex-end' } },
    btn({ icon: 'plus', cls: 'sm', title: 'New effect layer', tip: 'Add another effect on top of the current ones (it starts as a copy of the selected effect).', onClick: () => { layers.splice(cur + 1, 0, { name: layers[cur].name, v: { ...layers[cur].v }, on: true }); cur++; refresh(); } }),
    btn({ icon: 'trash', cls: 'sm', title: 'Delete effect layer', tip: 'Remove the selected effect layer.', onClick: () => { if (layers.length < 2) return App.toast('The gallery needs at least one effect'); layers.splice(cur, 1); cur = Math.max(0, cur - 1); refresh(); } }));
  const cmp = btn({ icon: 'eye', label: 'Before', cls: 'solid txt sm', title: 'Compare', tip: 'Hold to see the original.' });
  cmp.addEventListener('pointerdown', () => { showOrig = true; render(); });
  ['pointerup', 'pointerleave'].forEach(ev => cmp.addEventListener(ev, () => { if (showOrig) { showOrig = false; render(); } }));
  const body = h('div', { class: 'fg' }, h('div', { class: 'fg-view' }, pv, status), catalog, h('div', { class: 'fg-side' }, params, h('h5', { class: 'fx-head' }, 'Effect layers'), stackEl, stackBtns));
  App.modal({ title: 'Filter Gallery', icon: 'palette', width: Math.min(1500, innerWidth - 40), cls: 'fg-modal', body, left: h('div', { class: 'btn-row' }, cmp, h('span', { class: 'hint', style: { padding: '0 6px' } }, 'Sketch effects draw with your primary and secondary colors.')),
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, tip: 'Apply the effect stack at full resolution (Ctrl+Z undoes it).', onClick: () => {
      try { localStorage.setItem('strata.gallery', JSON.stringify(layers)); } catch {}
      I.busy(true, 'Filter Gallery…');
      setTimeout(() => { try { const out = X.toCanvas(runStack(full, layers, 1)); I.writeTarget(tgt, I.maskWithSel(full, out), 'Filter Gallery', 'palette'); } finally { I.busy(false); } }, 30);
    } }],
    onClose: () => { clearTimeout(timer); thumbQueue.length = 0; } });
  refresh();
};
})();
