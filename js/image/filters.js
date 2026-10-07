/* Image editor — pixel processing: adjustments, develop, filters, histogram, curves */
(() => {
'use strict';
const App = window.App;
const F = App.IF = {};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

F.clone = (src) => { const c = App.canvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; };
F.data = cv => cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height);
/** Run a per-pixel function over a canvas; returns a new canvas. fn(d, w, h) mutates d (RGBA). */
F.pixels = (src, fn) => {
  const out = App.canvas(src.width, src.height), ctx = out.getContext('2d');
  const id = F.data(src);
  fn(id.data, src.width, src.height);
  ctx.putImageData(id, 0, 0);
  return out;
};
F.lut = (src, lr, lg = lr, lb = lr) => F.pixels(src, d => { for (let i = 0; i < d.length; i += 4) { d[i] = lr[d[i]]; d[i + 1] = lg[d[i + 1]]; d[i + 2] = lb[d[i + 2]]; } });
const mkLut = f => { const l = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) l[i] = Math.round(clamp(f(i / 255), 0, 1) * 255); return l; };
F.mkLut = mkLut;

/* ---------- canvas-filter based (GPU) ---------- */
F.cssFilter = (src, filter, pad = 0) => {
  const out = App.canvas(src.width, src.height), ctx = out.getContext('2d');
  ctx.filter = filter;
  if (pad) {
    // extend edges so blur doesn't fade into transparency at the borders
    const p = App.canvas(src.width + pad * 2, src.height + pad * 2), pc = p.getContext('2d');
    pc.drawImage(src, pad, pad);
    pc.drawImage(src, 0, 0, 1, src.height, 0, pad, pad, src.height);
    pc.drawImage(src, src.width - 1, 0, 1, src.height, src.width + pad, pad, pad, src.height);
    pc.drawImage(p, 0, pad, p.width, 1, 0, 0, p.width, pad);
    pc.drawImage(p, 0, pad + src.height - 1, p.width, 1, 0, pad + src.height, p.width, pad);
    ctx.drawImage(p, -pad, -pad);
  } else ctx.drawImage(src, 0, 0);
  return out;
};
F.blur = (src, r) => r > 0 ? F.cssFilter(src, `blur(${r}px)`, Math.ceil(r * 2.5)) : F.clone(src);

/* ---------- adjustments ---------- */
F.brightnessContrast = (src, { brightness, contrast }) => {
  const b = brightness / 100, c = contrast / 100, k = c >= 0 ? 1 + c * 1.5 : 1 + c;
  return F.lut(src, mkLut(x => (x + b * 0.5 - 0.5) * k + 0.5));
};
F.exposure = (src, { exposure, offset, gamma }) => {
  const m = Math.pow(2, exposure);
  return F.lut(src, mkLut(x => Math.pow(clamp(x * m + offset / 100, 0, 1), 1 / gamma)));
};
F.levels = (src, { inBlack, inWhite, gamma, outBlack, outWhite }) => {
  return F.lut(src, mkLut(x => {
    const v = clamp((x * 255 - inBlack) / Math.max(1, inWhite - inBlack), 0, 1);
    return (outBlack + Math.pow(v, 1 / gamma) * (outWhite - outBlack)) / 255;
  }));
};
function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return [h / 6, s, l];
}
function hue2rgb(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
function hsl2rgb(h, s, l) {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}
F.rgb2hsl = rgb2hsl; F.hsl2rgb = hsl2rgb;
F.hueSat = (src, { hue, saturation, lightness, colorize }) => F.pixels(src, d => {
  const hs = hue / 360, ss = saturation / 100, ls = lightness / 100;
  for (let i = 0; i < d.length; i += 4) {
    let [h, s, l] = rgb2hsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    if (colorize) { h = ((hue + 360) % 360) / 360; s = clamp(0.25 + ss * 0.75 + 0.25, 0, 1) * 0.6; }
    else { h = (h + hs + 1) % 1; s = clamp(ss >= 0 ? s + (1 - s) * ss * s : s * (1 + ss), 0, 1); }
    l = ls >= 0 ? l + (1 - l) * ls : l * (1 + ls);
    const [r, g, b] = hsl2rgb(h, s, l);
    d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255;
  }
});
F.colorBalance = (src, { temperature, tint, cyanRed, magentaGreen, yellowBlue }) => {
  const t = temperature / 100, n = tint / 100;
  const lr = mkLut(x => x * (1 + t * 0.2) + cyanRed / 400);
  const lg = mkLut(x => x * (1 - n * 0.15) + magentaGreen / 400);
  const lb = mkLut(x => x * (1 - t * 0.2) + yellowBlue / 400);
  return F.lut(src, lr, lg, lb);
};
F.vibrance = (src, { vibrance, saturation }) => F.pixels(src, d => {
  const v = vibrance / 100, s = saturation / 100;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const k = 1 + s + v * (1 - (mx - mn) / 255);
    d[i] = L + (r - L) * k; d[i + 1] = L + (g - L) * k; d[i + 2] = L + (b - L) * k;
  }
});
F.blackWhite = (src, { red, green, blue, tintAmt, tintColor }) => F.pixels(src, d => {
  const wr = red / 100, wg = green / 100, wb = blue / 100, sum = Math.max(0.01, wr + wg + wb);
  const [tr, tg, tb] = App.hexToRgb(tintColor || '#c8a070'), ta = (tintAmt || 0) / 100;
  for (let i = 0; i < d.length; i += 4) {
    const L = (d[i] * wr + d[i + 1] * wg + d[i + 2] * wb) / sum;
    d[i] = L * (1 - ta) + L * tr / 255 * ta * 1.25; d[i + 1] = L * (1 - ta) + L * tg / 255 * ta * 1.25; d[i + 2] = L * (1 - ta) + L * tb / 255 * ta * 1.25;
  }
});
F.invert = src => F.pixels(src, d => { for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } });
F.posterize = (src, { levels }) => { const n = Math.max(2, levels) - 1; return F.lut(src, mkLut(x => Math.round(x * n) / n)); };
F.threshold = (src, { level }) => F.pixels(src, d => { for (let i = 0; i < d.length; i += 4) { const v = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) >= level ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } });
F.sepia = (src, { amount }) => F.cssFilter(src, `sepia(${amount}%)`);

/* ---------- histogram & auto ---------- */
F.histogram = (src, maxSide = 400) => {
  let cv = src;
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  if (k < 1) { cv = App.canvas(src.width * k, src.height * k); cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); }
  const d = F.data(cv).data;
  const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    r[d[i]]++; g[d[i + 1]]++; b[d[i + 2]]++; l[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++;
  }
  return { r, g, b, l };
};
F.drawHistogram = (cv, hist, channels = 'rgb') => {
  const dpr = App.fitCanvas(cv), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const light = App.th && App.th.light;
  ctx.fillStyle = `rgba(${(App.th && App.th.ink) || '255,255,255'},.03)`; ctx.fillRect(0, 0, W, H);
  if (!hist) return;
  let mx = 1;
  for (const k of ['r', 'g', 'b']) for (let i = 2; i < 254; i++) mx = Math.max(mx, hist[k][i]);
  const draw = (arr, col) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let i = 0; i < 256; i++) ctx.lineTo(i / 255 * W, H - Math.min(1, Math.sqrt(arr[i] / mx)) * (H - 2));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  };
  // additive colours on dark themes; multiplied (ink-like) colours on light ones
  ctx.globalCompositeOperation = light ? 'multiply' : 'lighter';
  if (channels === 'rgb') light ? (draw(hist.r, 'rgba(255,90,90,.75)'), draw(hist.g, 'rgba(90,220,120,.7)'), draw(hist.b, 'rgba(90,140,255,.75)')) : (draw(hist.r, 'rgba(255,70,70,.55)'), draw(hist.g, 'rgba(70,255,110,.5)'), draw(hist.b, 'rgba(80,140,255,.6)'));
  else draw(hist[channels], light ? 'rgba(60,60,70,.45)' : 'rgba(220,220,230,.6)');
  ctx.globalCompositeOperation = 'source-over';
};
F.autoLevels = (src) => {
  const hst = F.histogram(src, 600);
  const pct = (arr, p) => { let tot = 0; for (const v of arr) tot += v; let acc = 0; for (let i = 0; i < 256; i++) { acc += arr[i]; if (acc >= tot * p) return i; } return 255; };
  const luts = ['r', 'g', 'b'].map(k => { const lo = pct(hst[k], 0.005), hi = Math.max(lo + 1, pct(hst[k], 0.995)); return mkLut(x => (x * 255 - lo) / (hi - lo)); });
  return F.lut(src, ...luts);
};

/* ---------- curves (monotone cubic) ---------- */
F.curveLut = pts => {
  const p = pts.slice().sort((a, b) => a[0] - b[0]);
  const n = p.length, xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  const lut = new Uint8ClampedArray(256);
  if (n < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
  const dx = [], m = [], d = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / Math.max(1e-6, dx[i]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  for (let x = 0; x < 256; x++) {
    let k = 0;
    if (x <= xs[0]) { lut[x] = ys[0]; continue; }
    if (x >= xs[n - 1]) { lut[x] = ys[n - 1]; continue; }
    while (k < n - 2 && x > xs[k + 1]) k++;
    const h = dx[k], t = (x - xs[k]) / h, t2 = t * t, t3 = t2 * t;
    lut[x] = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
  }
  return lut;
};
F.curves = (src, curves) => {
  const rgb = F.curveLut(curves.rgb), r = F.curveLut(curves.r), g = F.curveLut(curves.g), b = F.curveLut(curves.b);
  const lr = new Uint8ClampedArray(256), lg = new Uint8ClampedArray(256), lb = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) { lr[i] = r[rgb[i]]; lg[i] = g[rgb[i]]; lb[i] = b[rgb[i]]; }
  return F.lut(src, lr, lg, lb);
};

/* ---------- filters ---------- */
F.convolve = (src, k, divisor = 1, bias = 0, keepAlpha = true) => {
  const w = src.width, h = src.height, sd = F.data(src).data;
  return F.pixels(src, d => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let ky = -1; ky <= 1; ky++) {
        const yy = Math.min(h - 1, Math.max(0, y + ky));
        for (let kx = -1; kx <= 1; kx++) {
          const xx = Math.min(w - 1, Math.max(0, x + kx)), o = (yy * w + xx) * 4, kv = k[(ky + 1) * 3 + kx + 1];
          r += sd[o] * kv; g += sd[o + 1] * kv; b += sd[o + 2] * kv;
        }
      }
      const o = (y * w + x) * 4;
      d[o] = r / divisor + bias; d[o + 1] = g / divisor + bias; d[o + 2] = b / divisor + bias;
      if (!keepAlpha) d[o + 3] = 255;
    }
  });
};
F.sharpen = (src, { amount, radius, threshold }) => {
  const bl = F.data(F.blur(src, radius)).data, a = amount / 100, t = threshold;
  return F.pixels(src, d => {
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) {
      const diff = d[i + c] - bl[i + c];
      if (Math.abs(diff) >= t) d[i + c] = d[i + c] + diff * a;
    }
  });
};
F.noise = (src, { amount, mono }) => F.pixels(src, d => {
  const a = amount * 2.55;
  for (let i = 0; i < d.length; i += 4) {
    if (mono) { const n = (Math.random() - 0.5) * a; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    else { d[i] += (Math.random() - 0.5) * a; d[i + 1] += (Math.random() - 0.5) * a; d[i + 2] += (Math.random() - 0.5) * a; }
  }
});
F.denoise = (src, { strength, detail }) => {
  const bl = F.data(F.blur(src, 1 + strength / 25)).data, thr = 10 + (100 - detail) * 0.6;
  return F.pixels(src, d => {
    for (let i = 0; i < d.length; i += 4) {
      const diff = Math.abs(d[i] - bl[i]) + Math.abs(d[i + 1] - bl[i + 1]) + Math.abs(d[i + 2] - bl[i + 2]);
      const k = clamp(1 - diff / thr, 0, 1) * Math.min(1, strength / 60);
      d[i] += (bl[i] - d[i]) * k; d[i + 1] += (bl[i + 1] - d[i + 1]) * k; d[i + 2] += (bl[i + 2] - d[i + 2]) * k;
    }
  });
};
F.pixelate = (src, { size }) => {
  const s = Math.max(1, Math.round(size)), w = Math.max(1, Math.ceil(src.width / s)), h = Math.max(1, Math.ceil(src.height / s));
  const small = App.canvas(w, h), sc = small.getContext('2d'); sc.imageSmoothingQuality = 'high'; sc.drawImage(src, 0, 0, w, h);
  const out = App.canvas(src.width, src.height), oc = out.getContext('2d'); oc.imageSmoothingEnabled = false; oc.drawImage(small, 0, 0, w * s, h * s);
  return out;
};
F.emboss = (src, { strength }) => { const s = strength / 50; return F.convolve(src, [-2 * s, -s, 0, -s, 1, s, 0, s, 2 * s], 1, 0); };
F.edges = (src, { invert }) => {
  const out = F.convolve(src, [-1, -1, -1, -1, 8, -1, -1, -1, -1], 1, 0);
  return invert ? F.invert(out) : out;
};
F.vignette = (src, { amount, size, color }) => {
  const out = F.clone(src), ctx = out.getContext('2d'), w = out.width, h = out.height;
  const [r, g, b] = App.hexToRgb(color || '#000000');
  const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * size / 200, w / 2, h / 2, Math.hypot(w, h) / 2);
  gr.addColorStop(0, `rgba(${r},${g},${b},0)`); gr.addColorStop(1, `rgba(${r},${g},${b},${amount / 100})`);
  ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  return out;
};
F.glow = (src, { radius, strength, threshold }) => {
  const bright = F.pixels(src, d => { for (let i = 0; i < d.length; i += 4) { const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; const k = clamp((L - threshold) / Math.max(1, 255 - threshold), 0, 1); d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } });
  const bl = F.blur(bright, radius);
  const out = F.clone(src), ctx = out.getContext('2d');
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = strength / 100;
  ctx.drawImage(bl, 0, 0); ctx.drawImage(bl, 0, 0);
  ctx.globalCompositeOperation = 'destination-in'; ctx.globalAlpha = 1; ctx.drawImage(src, 0, 0);
  return out;
};
F.motionBlur = (src, { angle, distance }) => {
  const out = App.canvas(src.width, src.height), ctx = out.getContext('2d');
  const n = Math.max(2, Math.min(48, Math.round(distance / 2))), a = angle * Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * distance;
    ctx.globalAlpha = 1 / (i + 1);
    ctx.drawImage(src, Math.cos(a) * t, Math.sin(a) * t);
  }
  return out;
};
F.oil = (src, { radius, levels }) => {
  // Kuwahara-lite: average of the most common intensity bucket in a neighbourhood (downscaled for speed)
  const w = src.width, h = src.height, sd = F.data(src).data, r = Math.round(radius), L = levels;
  return F.pixels(src, d => {
    const cnt = new Uint16Array(L), sr = new Float32Array(L), sg = new Float32Array(L), sb = new Float32Array(L);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      cnt.fill(0); sr.fill(0); sg.fill(0); sb.fill(0);
      for (let dy = -r; dy <= r; dy += 2) { const yy = Math.min(h - 1, Math.max(0, y + dy)); for (let dx = -r; dx <= r; dx += 2) {
        const xx = Math.min(w - 1, Math.max(0, x + dx)), o = (yy * w + xx) * 4;
        const k = Math.min(L - 1, ((sd[o] + sd[o + 1] + sd[o + 2]) / 3 * L / 256) | 0);
        cnt[k]++; sr[k] += sd[o]; sg[k] += sd[o + 1]; sb[k] += sd[o + 2];
      } }
      let best = 0; for (let k = 1; k < L; k++) if (cnt[k] > cnt[best]) best = k;
      const o = (y * w + x) * 4; d[o] = sr[best] / cnt[best]; d[o + 1] = sg[best] / cnt[best]; d[o + 2] = sb[best] / cnt[best];
    }
  });
};
F.dropShadow = (src, { x, y, blur, opacity, color }) => {
  const out = App.canvas(src.width, src.height), ctx = out.getContext('2d');
  ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = x; ctx.shadowOffsetY = y;
  ctx.globalAlpha = 1;
  const sh = App.canvas(src.width, src.height), sc = sh.getContext('2d');
  sc.shadowColor = color; sc.shadowBlur = blur; sc.shadowOffsetX = x; sc.shadowOffsetY = y; sc.drawImage(src, 0, 0);
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = opacity / 100; ctx.drawImage(sh, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(src, 0, 0);
  return out;
};
F.outline = (src, { width, color }) => {
  const out = App.canvas(src.width, src.height), ctx = out.getContext('2d');
  const tint = App.canvas(src.width, src.height), tc = tint.getContext('2d');
  tc.drawImage(src, 0, 0); tc.globalCompositeOperation = 'source-in'; tc.fillStyle = color; tc.fillRect(0, 0, src.width, src.height);
  const steps = Math.max(8, Math.round(width * 2));
  for (let i = 0; i < steps; i++) { const a = i / steps * Math.PI * 2; ctx.drawImage(tint, Math.cos(a) * width, Math.sin(a) * width); }
  ctx.drawImage(src, 0, 0);
  return out;
};

/* ---------- healing brush: best-matching nearby patch + seamless (membrane) blending ---------- */
function membrane(val, U, w, hh, iters = 40) {
  // multi-resolution Jacobi relaxation of unknown pixels (U=1) towards a smooth interpolation of known ones
  if (w > 24 && hh > 24) {
    const cw = Math.ceil(w / 2), ch = Math.ceil(hh / 2), cv = new Float32Array(cw * ch), cu = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      let s = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const fx = x * 2 + dx, fy = y * 2 + dy; if (fx < w && fy < hh && !U[fy * w + fx]) { s += val[fy * w + fx]; n++; } }
      if (n) cv[y * cw + x] = s / n; else cu[y * cw + x] = 1;
    }
    membrane(cv, cu, cw, ch, iters);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (U[y * w + x]) val[y * w + x] = cv[(y >> 1) * cw + (x >> 1)];
  } else {
    let s = 0, n = 0;
    for (let i = 0; i < w * hh; i++) if (!U[i]) { s += val[i]; n++; }
    const m = n ? s / n : 0;
    for (let i = 0; i < w * hh; i++) if (U[i]) val[i] = m;
    iters = 200;
  }
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!U[i]) continue;
      let s = 0, n = 0;
      if (x > 0) { s += val[i - 1]; n++; } if (x < w - 1) { s += val[i + 1]; n++; }
      if (y > 0) { s += val[i - w]; n++; } if (y < hh - 1) { s += val[i + w]; n++; }
      val[i] = s / n;
    }
  }
}
/** Heal the area covered by `mask` (alpha = coverage) on `layer` (modified in place). */
F.heal = (layer, mask, radius = 20) => {
  const W = layer.width, H = layer.height, md = F.data(mask).data;
  let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (md[(y * W + x) * 4 + 3] > 8) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  if (bx1 < 0) return false;
  const pad = Math.max(6, Math.round(radius * 0.6));
  const x0 = Math.max(0, bx0 - pad), y0 = Math.max(0, by0 - pad), x1 = Math.min(W - 1, bx1 + pad), y1 = Math.min(H - 1, by1 + pad);
  const w = x1 - x0 + 1, hh = y1 - y0 + 1;
  const reach = Math.round(Math.max(w, hh) * 1.1);
  const ex0 = Math.max(0, x0 - reach), ey0 = Math.max(0, y0 - reach), ex1 = Math.min(W - 1, x1 + reach), ey1 = Math.min(H - 1, y1 + reach);
  const EW = ex1 - ex0 + 1;
  const ctx = layer.getContext('2d', { willReadFrequently: true });
  const big = ctx.getImageData(ex0, ey0, EW, ey1 - ey0 + 1).data;
  const M = new Float32Array(w * hh), U = new Uint8Array(w * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const a = md[((y + y0) * W + x + x0) * 4 + 3] / 255; M[y * w + x] = a; U[y * w + x] = a > 0.02 ? 1 : 0; }
  const T = (x, y, c) => big[((y + y0 - ey0) * EW + x + x0 - ex0) * 4 + c];
  // full-res mask lookup for rejecting sources that overlap the damage
  const covered = (gx, gy) => md[(gy * W + gx) * 4 + 3] > 8;
  let best = null, bestScore = Infinity;
  const dists = [reach * 0.55, reach * 0.8, reach];
  for (const dist of dists) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, ox = Math.round(Math.cos(a) * dist), oy = Math.round(Math.sin(a) * dist);
    if (x0 + ox < ex0 || y0 + oy < ey0 || x1 + ox > ex1 || y1 + oy > ey1) continue;
    let s = 0, n = 0, bad = false;
    for (let y = 0; y < hh && !bad; y += 2) for (let x = 0; x < w; x += 2) {
      if (covered(x + x0 + ox, y + y0 + oy)) { bad = true; break; }
      if (U[y * w + x]) continue;
      for (let c = 0; c < 3; c++) { const d = T(x, y, c) - T(x + ox, y + oy, c); s += d * d; }
      n++;
    }
    if (bad || !n) continue;
    s /= n;
    if (s < bestScore) { bestScore = s; best = [ox, oy]; }
  }
  const out = ctx.getImageData(x0, y0, w, hh), od = out.data;
  for (let c = 0; c < 4; c++) {
    const diff = new Float32Array(w * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!U[i]) diff[i] = T(x, y, c) - (best ? T(x + best[0], y + best[1], c) : 0);
    }
    membrane(diff, U, w, hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!U[i]) continue;
      const v = (best ? T(x + best[0], y + best[1], c) : 0) + diff[i];
      od[i * 4 + c] = T(x, y, c) * (1 - M[i]) + v * M[i];
    }
  }
  ctx.putImageData(out, x0, y0);
  return true;
};

/* ---------- selection mask refinements ---------- */
F.maskBlur = (mask, r) => F.blur(mask, r);
F.maskThreshold = (mask, lo) => F.pixels(mask, d => { for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] > lo ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a; } });
F.maskGrow = (mask, px) => F.maskThreshold(F.cssFilter(mask, `blur(${Math.max(0.5, px / 2)}px)`), 12);
F.maskShrink = (mask, px) => F.maskThreshold(F.cssFilter(mask, `blur(${Math.max(0.5, px / 2)}px)`), 243);

/* ---------- develop (Adjust panel) ---------- */
const RND = new Float32Array(65536);
for (let i = 0; i < RND.length; i++) RND[i] = Math.random() - 0.5;
F.DEV_DEFAULTS = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 0, clarity: 0, fade: 0, vignette: 0, grain: 0 };
F.isDefault = p => Object.keys(F.DEV_DEFAULTS).every(k => (p[k] || 0) === F.DEV_DEFAULTS[k]);
/** lumBlur: Uint8ClampedArray RGBA of a blurred copy (needed for clarity) */
F.develop = (src, p, lumBlur) => F.pixels(src, (d, w, h) => {
  const ev = Math.pow(2, p.exposure), con = p.contrast / 100, cf = con >= 0 ? 1 + con * 0.9 : 1 + con * 0.7;
  const temp = p.temperature / 100, tint = p.tint / 100, hi = p.highlights / 100, sh = p.shadows / 100;
  const sat = p.saturation / 100, vib = p.vibrance / 100, clar = p.clarity / 100, fade = p.fade / 100, vig = p.vignette / 100, grain = p.grain / 100;
  const cx = w / 2, cy = h / 2, maxD = Math.hypot(cx, cy);
  const rM = ev * (1 + temp * 0.16), gM = ev * (1 - tint * 0.12), bM = ev * (1 - temp * 0.16);
  for (let y = 0, i = 0; y < h; y++) {
    const dy = (y - cy) / maxD;
    for (let x = 0; x < w; x++, i += 4) {
      let r = d[i] / 255 * rM, g = d[i + 1] / 255 * gM, b = d[i + 2] / 255 * bM;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b, Lc = L > 1 ? 1 : L;
      let delta = sh * 0.6 * Lc * (1 - Lc) * (1 - Lc) * 2 + hi * 0.6 * Lc * Lc * (1 - Lc) * 2;
      if (clar && lumBlur) { const lb = (0.2126 * lumBlur[i] + 0.7152 * lumBlur[i + 1] + 0.0722 * lumBlur[i + 2]) / 255; delta += clar * (Lc - lb) * 1.2 * (0.3 + 2.8 * Lc * (1 - Lc)); }
      r += delta; g += delta; b += delta;
      r = (r - 0.5) * cf + 0.5; g = (g - 0.5) * cf + 0.5; b = (b - 0.5) * cf + 0.5;
      if (sat || vib) {
        const L2 = 0.2126 * r + 0.7152 * g + 0.0722 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const k = Math.max(0, 1 + sat + vib * (1 - clamp(mx - mn, 0, 1)) * 1.2);
        r = L2 + (r - L2) * k; g = L2 + (g - L2) * k; b = L2 + (b - L2) * k;
      }
      if (fade) { r = r * (1 - fade * 0.22) + fade * 0.13; g = g * (1 - fade * 0.22) + fade * 0.13; b = b * (1 - fade * 0.22) + fade * 0.13; }
      if (vig) {
        const dd = Math.hypot((x - cx) / maxD, dy), t = clamp((dd - 0.35) / 0.7, 0, 1), f = t * t * (3 - 2 * t);
        if (vig > 0) { const m = 1 - vig * f * 0.85; r *= m; g *= m; b *= m; }
        else { const m = -vig * f * 0.7; r += (1 - r) * m; g += (1 - g) * m; b += (1 - b) * m; }
      }
      if (grain) { const n = RND[(i * 7 + (i >> 9)) & 65535] * grain * 0.22; r += n; g += n; b += n; }
      d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255;
    }
  }
});
F.LOOKS = [
  { name: 'Natural', p: {}, tip: 'Removes every adjustment.' },
  { name: 'Vivid', p: { contrast: 18, vibrance: 40, saturation: 8, clarity: 15 }, tip: 'Rich color and punch.' },
  { name: 'Warm', p: { temperature: 32, vibrance: 12, exposure: 0.05 }, tip: 'Golden, sunny tones.' },
  { name: 'Cool', p: { temperature: -30, tint: 4, contrast: 6 }, tip: 'Crisp, blue-ish tones.' },
  { name: 'Golden', p: { temperature: 45, tint: 8, vibrance: 25, highlights: -18, vignette: 18 }, tip: 'Golden-hour glow.' },
  { name: 'Cinematic', p: { temperature: -12, contrast: 26, highlights: -30, shadows: 16, saturation: -12, vignette: 26 }, tip: 'Moody film look with deep contrast.' },
  { name: 'Matte', p: { fade: 48, contrast: -14, saturation: -15 }, tip: 'Faded blacks, soft and editorial.' },
  { name: 'Vintage', p: { temperature: 26, tint: 6, fade: 36, saturation: -28, vignette: 26, grain: 28 }, tip: 'Old-photo warmth with grain.' },
  { name: 'Dramatic', p: { clarity: 60, contrast: 30, highlights: -42, shadows: 32, vignette: 40, saturation: -10 }, tip: 'Gritty detail and strong shadows.' },
  { name: 'Mono', p: { saturation: -100, contrast: 12 }, tip: 'Clean black & white.' },
  { name: 'Noir', p: { saturation: -100, contrast: 42, clarity: 25, vignette: 38, grain: 15 }, tip: 'High-contrast B&W with dark edges.' },
  { name: 'Soft', p: { clarity: -40, contrast: -10, exposure: 0.12, fade: 14 }, tip: 'Dreamy, soft-focus glow — flattering for portraits.' },
];
})();
