/* Strata Studio — DSP helpers: FFT, WAV, peaks, time-stretch, noise reduction, loudness.
   The pure number-crunching lives in dspCore() so it can run both here and inside a Web Worker. */
(() => {
'use strict';
const App = window.App;

function dspCore(D) {
  /* ---------- FFT (in-place radix-2) ---------- */
  D.fft = (re, im, inverse = false) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inverse ? 2 : -2) * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const br = re[b] * cr - im[b] * ci, bi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - br; im[b] = im[a] - bi;
          re[a] += br; im[a] += bi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  };
  const winCache = {};
  D.hann = n => winCache[n] || (winCache[n] = Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)));
  D.spectrumAt = (data, pos, n = 1024) => {
    const re = new Float32Array(n), im = new Float32Array(n), w = D.hann(n);
    for (let i = 0; i < n; i++) { const s = data[pos + i] || 0; re[i] = s * w[i]; }
    D.fft(re, im);
    const out = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) out[i] = 20 * Math.log10(Math.hypot(re[i], im[i]) / (n / 4) + 1e-9);
    return out;
  };

  /* ---------- resampling & time-stretch ---------- */
  D.resample = (x, factor) => {
    const n = Math.max(1, Math.round(x.length / factor)), y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * factor, i0 = Math.floor(p), f = p - i0;
      const a = x[i0] || 0, b = x[i0 + 1] ?? a;
      y[i] = a + (b - a) * f;
    }
    return y;
  };
  /** WSOLA time-stretch. rate > 1 → faster (shorter) with the same pitch. */
  D.timeStretch = (x, rate, sr) => {
    let N = Math.round(sr * 0.046); N -= N % 2;
    const Hs = N / 2, Ha = Hs * rate, delta = Math.round(sr * 0.006);
    const outLen = Math.ceil(x.length / rate);
    const y = new Float32Array(outLen + N), ws = new Float32Array(outLen + N);
    const w = D.hann(N);
    let prev = 0;
    for (let k = 0; ; k++) {
      const outPos = k * Hs;
      if (outPos >= outLen) break;
      const nominal = Math.round(k * Ha);
      if (nominal >= x.length) break;
      let best = nominal;
      if (k > 0) {
        const tgt = prev + Hs, L = N / 2;
        let bestC = -Infinity;
        for (let d = -delta; d <= delta; d += 2) {
          const s = nominal + d;
          if (s < 0 || s + L >= x.length || tgt + L >= x.length) continue;
          let c = 0;
          for (let i = 0; i < L; i += 6) c += x[s + i] * x[tgt + i];
          if (c > bestC) { bestC = c; best = s; }
        }
      }
      for (let i = 0; i < N; i++) {
        const xi = x[best + i];
        if (xi === undefined) break;
        y[outPos + i] += xi * w[i]; ws[outPos + i] += w[i];
      }
      prev = best;
    }
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) out[i] = ws[i] > 1e-3 ? y[i] / ws[i] : 0;
    return out;
  };
  D.pitchShift = (x, semis, sr) => {
    const f = Math.pow(2, semis / 12);
    const out = D.resample(D.timeStretch(x, 1 / f, sr), f);
    if (out.length === x.length) return out;
    const fixed = new Float32Array(x.length); fixed.set(out.subarray(0, x.length)); return fixed;
  };

  /* ---------- noise reduction (spectral gate) ---------- */
  const NR_N = 2048, NR_HOP = 512;
  D.noiseProfile = x => {
    const re = new Float32Array(NR_N), im = new Float32Array(NR_N), w = D.hann(NR_N);
    const acc = new Float32Array(NR_N / 2 + 1); let frames = 0;
    for (let p = 0; p + NR_N <= x.length; p += NR_HOP) {
      for (let i = 0; i < NR_N; i++) { re[i] = x[p + i] * w[i]; im[i] = 0; }
      D.fft(re, im);
      for (let k = 0; k <= NR_N / 2; k++) acc[k] += Math.hypot(re[k], im[k]);
      frames++;
    }
    if (!frames) return null;
    for (let k = 0; k < acc.length; k++) acc[k] /= frames;
    return acc;
  };
  D.noiseReduce = (x, profile, { reduction = 18, sensitivity = 6, smoothing = 3 } = {}) => {
    const N = NR_N, hop = NR_HOP, w = D.hann(N), bins = N / 2 + 1;
    const thr = profile.map(v => v * Math.pow(10, sensitivity / 20));
    const floor = Math.pow(10, -reduction / 20);
    const padded = new Float32Array(x.length + 2 * N); padded.set(x, N);
    const out = new Float32Array(padded.length), norm = new Float32Array(padded.length);
    const re = new Float32Array(N), im = new Float32Array(N);
    const g = new Float32Array(bins), gs = new Float32Array(bins), prevG = new Float32Array(bins).fill(1);
    for (let p = 0; p + N <= padded.length; p += hop) {
      for (let i = 0; i < N; i++) { re[i] = padded[p + i] * w[i]; im[i] = 0; }
      D.fft(re, im);
      for (let k = 0; k < bins; k++) g[k] = Math.hypot(re[k], im[k]) > thr[k] ? 1 : floor;
      for (let k = 0; k < bins; k++) {
        let s = 0, c = 0;
        for (let j = -smoothing; j <= smoothing; j++) { const q = k + j; if (q >= 0 && q < bins) { s += g[q]; c++; } }
        let v = s / c;
        v = v > prevG[k] ? v : prevG[k] * 0.6 + v * 0.4;
        gs[k] = v; prevG[k] = v;
      }
      for (let k = 0; k < bins; k++) {
        re[k] *= gs[k]; im[k] *= gs[k];
        if (k > 0 && k < N / 2) { re[N - k] *= gs[k]; im[N - k] *= gs[k]; }
      }
      D.fft(re, im, true);
      for (let i = 0; i < N; i++) { out[p + i] += re[i] * w[i]; norm[p + i] += w[i] * w[i]; }
    }
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) { const n = norm[i + N]; y[i] = n > 1e-6 ? out[i + N] / n : 0; }
    return y;
  };

  /* ---------- loudness (ITU-R BS.1770-4 / EBU R128) ---------- */
  const biquad = (x, b0, b1, b2, a1, a2) => {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
    }
    return y;
  };
  D.kWeight = (x, sr) => {
    let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    let K = Math.tan(Math.PI * f0 / sr);
    const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const s1 = biquad(x, (Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
    f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / sr);
    a0 = 1 + K / Q + K * K;
    return biquad(s1, 1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
  };
  D.loudness = (chs, sr) => {
    const kw = chs.slice(0, 2).map(c => D.kWeight(c, sr));
    const n = kw[0].length, blk = Math.round(0.4 * sr), step = Math.round(0.1 * sr);
    const z = [];
    for (let s = 0; s + blk <= n; s += step) {
      let sum = 0;
      for (const c of kw) { let a = 0; for (let i = s; i < s + blk; i++) a += c[i] * c[i]; sum += a / blk; }
      z.push(sum);
    }
    const L = v => -0.691 + 10 * Math.log10(v + 1e-20);
    const abs = z.filter(v => L(v) > -70);
    let integrated = -Infinity;
    if (abs.length) {
      const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
      const g2 = abs.filter(v => L(v) > rel);
      if (g2.length) integrated = L(g2.reduce((a, b) => a + b, 0) / g2.length);
    }
    let momentaryMax = -Infinity;
    for (const v of z) momentaryMax = Math.max(momentaryMax, L(v));
    // short-term: 3 s windows
    let shortMax = -Infinity;
    const st = Math.round(3 * sr);
    for (let s = 0; s + st <= n; s += Math.round(sr)) {
      let sum = 0;
      for (const c of kw) { let a = 0; for (let i = s; i < s + st; i += 2) a += c[i] * c[i]; sum += a / (st / 2); }
      shortMax = Math.max(shortMax, L(sum));
    }
    let peak = 0;
    for (const c of chs) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; }
    return { integrated, momentaryMax, shortMax, peak: 20 * Math.log10(peak + 1e-12) };
  };
  return D;
}

const D = App.dsp = dspCore({});

/* ---------- worker pool: heavy DSP off the main thread ---------- */
let worker = null, seq = 0;
const pending = new Map();
function getWorker() {
  if (worker) return worker;
  const src = `const D = (${dspCore.toString()})({});
    onmessage = e => {
      const { id, name, args } = e.data;
      try {
        const r = D[name](...args);
        const tr = [];
        const walk = v => { if (v && v.buffer instanceof ArrayBuffer && !tr.includes(v.buffer)) tr.push(v.buffer); else if (Array.isArray(v)) v.forEach(walk); };
        walk(r);
        postMessage({ id, r }, tr);
      } catch (err) { postMessage({ id, err: String(err && err.message || err) }); }
    };`;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = e => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.err ? p.rej(new Error(e.data.err)) : p.res(e.data.r); };
    worker.onerror = () => { worker = null; for (const p of pending.values()) p.rej(new Error('The audio processor stopped unexpectedly')); pending.clear(); };
  } catch { worker = null; }
  return worker;
}
/** Run a dsp function in the background. Falls back to the main thread if workers are unavailable. */
D.work = (name, ...args) => {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => D[name](...args));
  return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); w.postMessage({ id, name, args }); });
};

/* ---------- WAV ---------- */
D.encodeWAV = (channels, sr, bits = 16) => {
  const nCh = channels.length, len = channels[0].length, bps = bits / 8;
  const dataLen = len * nCh * bps;
  const buf = new ArrayBuffer(44 + dataLen), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true); v.setUint16(22, nCh, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nCh * bps, true); v.setUint16(32, nCh * bps, true); v.setUint16(34, bits, true);
  str(36, 'data'); v.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nCh; c++) {
      let s = channels[c][i]; s = s > 1 ? 1 : s < -1 ? -1 : (s || 0);
      if (bits === 16) { v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
      else if (bits === 24) { const x = Math.round(s * 8388607); v.setUint8(o, x & 255); v.setUint8(o + 1, (x >> 8) & 255); v.setUint8(o + 2, (x >> 16) & 255); o += 3; }
      else { v.setFloat32(o, s, true); o += 4; }
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
};
D.bufferToWav = (ab, bits = 16) => D.encodeWAV(Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i)), ab.sampleRate, bits);

/* ---------- peak cache (min/max/rms per 256-sample block) ---------- */
const BLOCK = 256;
D.BLOCK = BLOCK;
const peakCache = new WeakMap();
D.peaks = arr => {
  let p = peakCache.get(arr);
  if (p) return p;
  const n = Math.ceil(arr.length / BLOCK);
  const mn = new Float32Array(n), mx = new Float32Array(n), rms = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let lo = 1, hi = -1, sq = 0;
    const s0 = b * BLOCK, s1 = Math.min(arr.length, s0 + BLOCK);
    for (let i = s0; i < s1; i++) { const v = arr[i]; if (v < lo) lo = v; if (v > hi) hi = v; sq += v * v; }
    mn[b] = lo; mx[b] = hi; rms[b] = Math.sqrt(sq / Math.max(1, s1 - s0));
  }
  p = { mn, mx, rms };
  peakCache.set(arr, p);
  return p;
};
D.range = (arr, s0, s1) => {
  s0 = Math.max(0, Math.floor(s0)); s1 = Math.min(arr.length, Math.ceil(s1));
  if (s1 <= s0) return null;
  let lo = 1, hi = -1, sq = 0, cnt = 0;
  if (s1 - s0 > BLOCK * 2) {
    const p = D.peaks(arr);
    const b0 = Math.floor(s0 / BLOCK), b1 = Math.min(p.mn.length, Math.ceil(s1 / BLOCK));
    for (let b = b0; b < b1; b++) { if (p.mn[b] < lo) lo = p.mn[b]; if (p.mx[b] > hi) hi = p.mx[b]; sq += p.rms[b] * p.rms[b]; cnt++; }
    return { lo, hi, rms: Math.sqrt(sq / Math.max(1, cnt)) };
  }
  for (let i = s0; i < s1; i++) { const v = arr[i]; if (v < lo) lo = v; if (v > hi) hi = v; sq += v * v; cnt++; }
  return { lo, hi, rms: Math.sqrt(sq / cnt) };
};
D.envelope = (ab, perSec = 100) => {
  const sr = ab.sampleRate, step = Math.max(1, Math.floor(sr / perSec));
  const n = Math.ceil(ab.length / step), out = new Float32Array(n);
  const chs = Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i));
  for (let b = 0; b < n; b++) {
    let m = 0;
    const s0 = b * step, s1 = Math.min(ab.length, s0 + step);
    for (const ch of chs) for (let i = s0; i < s1; i += 4) { const v = Math.abs(ch[i]); if (v > m) m = v; }
    out[b] = m;
  }
  return out;
};

/* ---------- impulse response for reverb ---------- */
/* ---------- silence detection (shared by the audio and video editors) ---------- */
/**
 * Short-time level (dBFS) every `hop` seconds over the timeline span [t0, t1].
 * sources: [{ chs: Float32Array[], sr, start (timeline s), dur (timeline s), srcStart (s into chs), speed, gain }]
 * Each 20 ms window has its mean removed (DC / rumble) and the per-source energies are summed.
 */
D.levels = (sources, t0, t1, hop = 0.01) => {
  const n = Math.max(1, Math.ceil((t1 - t0) / hop)), out = new Float32Array(n).fill(-120);
  const energy = new Float64Array(n);
  for (const s of sources) {
    const chs = s.chs, sr = s.sr, speed = s.speed || 1, g2 = (s.gain ?? 1) ** 2, win = Math.round(0.02 * sr * speed);
    const len = chs[0].length, nc = chs.length;
    const k0 = Math.max(0, Math.floor((s.start - t0) / hop)), k1 = Math.min(n, Math.ceil((s.start + s.dur - t0) / hop));
    for (let k = k0; k < k1; k++) {
      const tl = t0 + (k + 0.5) * hop;
      const c = Math.round((s.srcStart + (tl - s.start) * speed) * sr), a = Math.max(0, c - (win >> 1)), b = Math.min(len, a + win);
      if (b - a < 8) continue;
      let sum = 0, sq = 0;
      for (let i = a; i < b; i++) { let v = 0; for (let ch = 0; ch < nc; ch++) v += chs[ch][i]; v /= nc; sum += v; sq += v * v; }
      const m = sum / (b - a);
      energy[k] += Math.max(0, sq / (b - a) - m * m) * g2;
    }
  }
  for (let k = 0; k < n; k++) out[k] = energy[k] > 1e-12 ? 10 * Math.log10(energy[k]) : -120;
  return out;
};
/**
 * Finds silent regions in a level curve. Returns { regions: [{t0, t1}], threshold, floor, loud }.
 * opts: mode 'auto' | 'manual', sensitivity 0…1 (auto), threshold dB (manual), minSilence s, minSound s,
 *       padBefore / padAfter s (breathing room kept around speech), hysteresis dB.
 */
D.detectSilence = (lv, hop, t0, o = {}) => {
  const { mode = 'auto', sensitivity = 0.4, threshold = -40, minSilence = 0.5, minSound = 0.08, padBefore = 0.1, padAfter = 0.15, hysteresis = 3 } = o;
  const sorted = Float32Array.from(lv).filter(v => v > -119).sort();
  const pct = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : -120;
  const floor = pct(0.1), loud = pct(0.95);
  const T = mode === 'manual' ? threshold : (loud - floor < 6 ? floor + 3 : floor + (loud - floor) * (0.12 + 0.5 * sensitivity));
  // gate with hysteresis → sound/silence per frame
  const n = lv.length, sound = new Uint8Array(n);
  let open = false;
  for (let k = 0; k < n; k++) { if (open) open = lv[k] > T - hysteresis; else open = lv[k] > T; sound[k] = open ? 1 : 0; }
  // ignore very short noises (clicks, taps, breaths)
  const minSoundF = Math.max(1, Math.round(minSound / hop));
  for (let k = 0; k < n;) {
    if (!sound[k]) { k++; continue; }
    let e = k; while (e < n && sound[e]) e++;
    if (e - k < minSoundF) sound.fill(0, k, e);
    k = e;
  }
  const regions = [];
  for (let k = 0; k < n;) {
    if (sound[k]) { k++; continue; }
    let e = k; while (e < n && !sound[e]) e++;
    const atStart = k === 0, atEnd = e === n;
    let a = t0 + k * hop, b = t0 + e * hop;
    if (b - a >= minSilence) {
      if (!atStart) a += padAfter;
      if (!atEnd) b -= padBefore;
      if (b - a > 0.03) regions.push({ t0: a, t1: b });
    }
    k = e;
  }
  return { regions, threshold: T, floor, loud };
};
D.impulse = (ctx, seconds, decay, reverse = false) => {
  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * seconds));
  const ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const n = reverse ? len - i : i;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / len, decay);
    }
  }
  return ir;
};

/* ---------- color map ---------- */
D.magma = (() => {
  const stops = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const p = i / 255 * (stops.length - 1), a = Math.floor(p), f = p - a, b = Math.min(stops.length - 1, a + 1);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[a][c] + (stops[b][c] - stops[a][c]) * f;
  }
  return lut;
})();
})();
