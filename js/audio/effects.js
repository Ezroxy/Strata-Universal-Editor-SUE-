/* Audio editor — effect definitions (all processing is offline / non-realtime) */
(() => {
'use strict';
const App = window.App;
const D = App.dsp;
const A = App.A = App.A || {};
const db = App.dbToGain;

/** Run channels through a Web Audio graph offline. build(ctx, src) → last node. Returns channels (+tail). */
async function offline(chs, sr, build, tail = 0) {
  const n = chs[0].length, len = n + Math.round(tail * sr);
  const oac = new OfflineAudioContext(chs.length, Math.max(1, len), sr);
  const buf = oac.createBuffer(chs.length, Math.max(1, n), sr);
  chs.forEach((c, i) => buf.copyToChannel(c, i));
  const src = oac.createBufferSource(); src.buffer = buf;
  const out = build(oac, src);
  out.connect(oac.destination);
  src.start();
  const r = await oac.startRendering();
  return Array.from({ length: chs.length }, (_, i) => r.getChannelData(i).slice(0, len));
}
A.offline = offline;
const map = (chs, fn) => chs.map((c, ci) => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = fn(c[i], i, ci, c.length); return o; });
const peakOf = chs => { let m = 0; for (const c of chs) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > m) m = v; } return m; };
A.peakOf = peakOf;
const dryWet = (dry, wet, mix, dryLvl = 1) => dry.map((d, ci) => { const w = wet[ci], o = new Float32Array(Math.max(d.length, w.length)); for (let i = 0; i < o.length; i++) o[i] = (d[i] || 0) * dryLvl * (i < d.length ? 1 : 0) + (w[i] || 0) * mix; return o; });

const curveFn = {
  linear: x => x,
  exponential: x => x * x * x,
  logarithmic: x => 1 - Math.pow(1 - x, 3),
  scurve: x => x * x * (3 - 2 * x),
};

A.FX = [
  /* ---------------- Amplitude ---------------- */
  { id: 'amplify', cat: 'Volume & dynamics', name: 'Amplify', icon: 'volume', tip: 'Makes the selection louder or quieter by a fixed amount.',
    params: [{ id: 'gain', label: 'Gain', min: -30, max: 30, step: 0.1, def: 3, unit: 'dB', tip: 'Positive = louder, negative = quieter. +6 dB is roughly twice the level.' }],
    presets: { '−6 dB (half)': { gain: -6 }, '+3 dB': { gain: 3 }, '+6 dB (double)': { gain: 6 } },
    run: (chs, sr, p) => { const g = db(p.gain); return map(chs, v => v * g); } },
  { id: 'normalize', cat: 'Volume & dynamics', name: 'Normalize', icon: 'normalize', tip: 'Raises (or lowers) the level so the loudest peak hits a target — the quickest way to get a consistent volume.',
    params: [
      { id: 'target', label: 'Peak level', min: -12, max: 0, step: 0.1, def: -1, unit: 'dB', tip: 'Where the loudest peak should land. −1 dB leaves a little safety headroom.' },
      { id: 'dc', label: 'Remove DC', type: 'toggle', def: 1, tip: 'Also re-centers the waveform if it is offset from zero (prevents clicks).' }],
    run: (chs, sr, p) => {
      let out = chs;
      if (p.dc) out = chs.map(c => { let s = 0; for (let i = 0; i < c.length; i++) s += c[i]; const m = s / c.length; return c.map(v => v - m); });
      const pk = peakOf(out);
      if (pk < 1e-6) return out;
      const g = db(p.target) / pk;
      return map(out, v => v * g);
    } },
  { id: 'fadein', cat: 'Volume & dynamics', name: 'Fade in', icon: 'fadeIn', tip: 'Smoothly ramps the selection up from silence.',
    params: [{ id: 'curve', label: 'Curve', type: 'select', def: 'linear', options: [['linear', 'Linear'], ['exponential', 'Exponential (slow start)'], ['logarithmic', 'Logarithmic (fast start)'], ['scurve', 'S-curve (smooth)']], tip: 'Shape of the volume ramp. Exponential sounds most natural for music.' }],
    run: (chs, sr, p) => map(chs, (v, i, ci, n) => v * curveFn[p.curve](i / Math.max(1, n - 1))) },
  { id: 'fadeout', cat: 'Volume & dynamics', name: 'Fade out', icon: 'fadeOut', tip: 'Smoothly ramps the selection down to silence.',
    params: [{ id: 'curve', label: 'Curve', type: 'select', def: 'linear', options: [['linear', 'Linear'], ['exponential', 'Exponential (fast drop)'], ['logarithmic', 'Logarithmic (slow drop)'], ['scurve', 'S-curve (smooth)']], tip: 'Shape of the volume ramp.' }],
    run: (chs, sr, p) => map(chs, (v, i, ci, n) => v * curveFn[p.curve](1 - i / Math.max(1, n - 1))) },
  { id: 'compressor', cat: 'Volume & dynamics', name: 'Compressor', icon: 'sliders', tip: 'Evens out loud and quiet parts so everything sits at a steadier level — essential for voice and podcasts.',
    params: [
      { id: 'threshold', label: 'Threshold', min: -60, max: 0, step: 0.5, def: -24, unit: 'dB', tip: 'Level above which compression starts. Lower = more of the audio gets compressed.' },
      { id: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.1, def: 4, unit: ':1', tip: 'How strongly loud parts are reduced. 2:1 is gentle, 8:1+ is heavy.' },
      { id: 'knee', label: 'Knee', min: 0, max: 40, step: 0.5, def: 6, unit: 'dB', tip: 'Softens the transition into compression. Higher = smoother, more transparent.' },
      { id: 'attack', label: 'Attack', min: 0, max: 200, step: 0.5, def: 10, unit: 'ms', tip: 'How fast it reacts to loud sounds. Short catches peaks; longer keeps punch.' },
      { id: 'release', label: 'Release', min: 10, max: 1000, step: 5, def: 250, unit: 'ms', tip: 'How fast it lets go after the sound gets quieter.' },
      { id: 'makeup', label: 'Makeup gain', min: 0, max: 24, step: 0.5, def: 4, unit: 'dB', tip: 'Boost added afterwards to win back the lost loudness.' }],
    presets: { 'Gentle vocal': { threshold: -20, ratio: 2.5, knee: 10, attack: 15, release: 200, makeup: 3 }, 'Podcast voice': { threshold: -26, ratio: 4, knee: 6, attack: 5, release: 180, makeup: 6 }, 'Punchy drums': { threshold: -18, ratio: 5, knee: 3, attack: 25, release: 120, makeup: 4 }, 'Squash': { threshold: -36, ratio: 12, knee: 0, attack: 1, release: 80, makeup: 12 } },
    run: (chs, sr, p) => offline(chs, sr, (ctx, src) => {
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = p.threshold; c.ratio.value = p.ratio; c.knee.value = p.knee; c.attack.value = p.attack / 1000; c.release.value = p.release / 1000;
      const g = ctx.createGain(); g.gain.value = db(p.makeup);
      src.connect(c).connect(g); return g;
    }) },
  { id: 'limiter', cat: 'Volume & dynamics', name: 'Limiter', icon: 'minus', tip: 'Makes audio louder while guaranteeing it never goes above a ceiling — the final step of mastering.',
    params: [
      { id: 'input', label: 'Input gain', min: 0, max: 18, step: 0.1, def: 4, unit: 'dB', tip: 'How much to push the level into the limiter. More = louder, but more squashed.' },
      { id: 'ceiling', label: 'Ceiling', min: -12, max: 0, step: 0.1, def: -1, unit: 'dB', tip: 'The absolute maximum peak level allowed.' },
      { id: 'release', label: 'Release', min: 5, max: 500, step: 1, def: 60, unit: 'ms', tip: 'How quickly the gain recovers after a peak.' }],
    run: (chs, sr, p) => {
      const n = chs[0].length, ig = db(p.input), ceil = db(p.ceiling), la = Math.max(1, Math.round(sr * 0.005));
      const tgt = new Float32Array(n);
      for (let i = 0; i < n; i++) { let m = 0; for (const c of chs) { const v = Math.abs(c[i] * ig); if (v > m) m = v; } tgt[i] = m > ceil ? ceil / m : 1; }
      const g = new Float32Array(n); g[n - 1] = tgt[n - 1];
      for (let i = n - 2; i >= 0; i--) g[i] = Math.min(tgt[i], g[i + 1] + 1 / la);
      const k = 1 - Math.exp(-1 / (p.release / 1000 * sr));
      let prev = g[0];
      for (let i = 0; i < n; i++) { const v = Math.min(g[i], prev + (1 - prev) * k); g[i] = v; prev = v; }
      return map(chs, (v, i) => Math.max(-ceil, Math.min(ceil, v * ig * g[i])));
    } },
  { id: 'gate', cat: 'Volume & dynamics', name: 'Noise gate', icon: 'silence', tip: 'Silences the quiet gaps between words or notes — removes background hiss and room noise during pauses.',
    params: [
      { id: 'threshold', label: 'Threshold', min: -80, max: -10, step: 0.5, def: -42, unit: 'dB', tip: 'Anything quieter than this is treated as “silence” and turned down.' },
      { id: 'reduction', label: 'Reduction', min: 0, max: 90, step: 1, def: 40, unit: 'dB', tip: 'How much the quiet parts are turned down.' },
      { id: 'attack', label: 'Attack', min: 0.1, max: 50, step: 0.1, def: 2, unit: 'ms', tip: 'How fast the gate opens when sound starts.' },
      { id: 'hold', label: 'Hold', min: 0, max: 500, step: 1, def: 60, unit: 'ms', tip: 'Keeps the gate open a little after the sound stops, so word endings aren’t chopped.' },
      { id: 'release', label: 'Release', min: 5, max: 1000, step: 1, def: 150, unit: 'ms', tip: 'How smoothly the gate closes.' }],
    run: (chs, sr, p) => {
      const n = chs[0].length, thr = db(p.threshold), floor = db(-p.reduction);
      const ka = 1 - Math.exp(-1 / (p.attack / 1000 * sr)), kr = 1 - Math.exp(-1 / (p.release / 1000 * sr)), hold = Math.round(p.hold / 1000 * sr);
      const envK = 1 - Math.exp(-1 / (0.005 * sr));
      const g = new Float32Array(n);
      let env = 0, gain = floor, held = 0;
      for (let i = 0; i < n; i++) {
        let m = 0; for (const c of chs) { const v = Math.abs(c[i]); if (v > m) m = v; }
        env += (m - env) * (m > env ? 1 : envK);
        let target;
        if (env > thr) { target = 1; held = hold; } else if (held > 0) { target = 1; held--; } else target = floor;
        gain += (target - gain) * (target > gain ? ka : kr);
        g[i] = gain;
      }
      return map(chs, (v, i) => v * g[i]);
    } },

  { id: 'loudnorm', cat: 'Volume & dynamics', name: 'Loudness normalize', icon: 'lufs', tip: 'Sets the perceived loudness (LUFS) to a broadcast standard so your audio sounds as loud as everything else — and never clips.',
    params: [
      { id: 'target', label: 'Target', min: -30, max: -6, step: 0.5, def: -14, unit: 'LUFS', tip: '−14 for Spotify/YouTube, −16 for podcasts, −23 for broadcast TV.' },
      { id: 'ceiling', label: 'Peak ceiling', min: -6, max: 0, step: 0.1, def: -1, unit: 'dB', tip: 'Peaks above this are gently limited after the gain change.' }],
    presets: { 'Streaming (−14 LUFS)': { target: -14, ceiling: -1 }, 'Podcast (−16 LUFS)': { target: -16, ceiling: -1 }, 'Broadcast (−23 LUFS)': { target: -23, ceiling: -2 }, 'Loud master (−9 LUFS)': { target: -9, ceiling: -0.3 } },
    run: async (chs, sr, p) => {
      const L = await D.work('loudness', chs, sr);
      if (!isFinite(L.integrated)) throw new Error('This selection is too quiet or too short to measure loudness');
      const g = db(p.target - L.integrated);
      let out = map(chs, v => v * g);
      if (A.peakOf(out) > db(p.ceiling)) out = A.FX.find(f => f.id === 'limiter').run(out, sr, { input: 0, ceiling: p.ceiling, release: 80 });
      App.toast(`Measured ${L.integrated.toFixed(1)} LUFS → ${p.target} LUFS (${(p.target - L.integrated >= 0 ? '+' : '') + (p.target - L.integrated).toFixed(1)} dB)`, 'ok', 3500);
      return out;
    } },
  { id: 'leveler', cat: 'Volume & dynamics', name: 'Voice leveler', icon: 'lufs', tip: 'Rides the volume for you: quiet sentences come up, loud ones go down, so a voice stays at one even level — like a sound engineer on the fader. Pauses and background noise are left alone.',
    params: [
      { id: 'target', label: 'Target level', min: -32, max: -10, step: 0.5, def: -20, unit: 'dB', tip: 'The average speaking level to aim for. −20 dB suits most voice recordings; louder targets need a limiter afterwards.' },
      { id: 'boost', label: 'Max boost', min: 0, max: 24, step: 0.5, def: 10, unit: 'dB', tip: 'The most a quiet passage may be raised.' },
      { id: 'cut', label: 'Max cut', min: 0, max: 24, step: 0.5, def: 10, unit: 'dB', tip: 'The most a loud passage may be turned down.' },
      { id: 'speed', label: 'Speed', type: 'select', def: 'medium', options: [['slow', 'Slow (gentle, musical)'], ['medium', 'Medium (speech)'], ['fast', 'Fast (word by word)']], tip: 'How quickly the level follows the voice. Faster evens out more but can sound pumpy.' },
      { id: 'floor', label: 'Ignore below', min: -70, max: -25, step: 1, def: -48, unit: 'dB', tip: 'Anything quieter than this is treated as a pause or background noise and is not boosted.' }],
    presets: { 'Podcast / interview': { target: -20, boost: 10, cut: 10, speed: 'medium', floor: -48 }, 'Gentle': { target: -20, boost: 6, cut: 6, speed: 'slow', floor: -50 }, 'Strong (very uneven recording)': { target: -19, boost: 18, cut: 14, speed: 'fast', floor: -46 } },
    run: (chs, sr, p) => {
      const n = chs[0].length, hop = Math.max(1, Math.round(sr * 0.01)), nb = Math.ceil(n / hop);
      const win = Math.max(1, Math.round({ slow: 1.6, medium: 0.7, fast: 0.3 }[p.speed] / 0.01));
      // mean square per 10 ms block (channels folded), then a centred moving average over the speed window
      const ms = new Float64Array(nb);
      for (let b = 0; b < nb; b++) { let s = 0; const s0 = b * hop, s1 = Math.min(n, s0 + hop); for (const c of chs) for (let i = s0; i < s1; i++) s += c[i] * c[i]; ms[b] = s / ((s1 - s0) * chs.length); }
      const pre = new Float64Array(nb + 1); for (let b = 0; b < nb; b++) pre[b + 1] = pre[b] + ms[b];
      const gainDb = new Float32Array(nb), floor = p.floor;
      let g = 0;
      for (let b = 0; b < nb; b++) {
        const a = Math.max(0, b - (win >> 1)), z = Math.min(nb, a + win), lvl = 10 * Math.log10((pre[z] - pre[a]) / Math.max(1, z - a) + 1e-12);
        // only speech-level material moves the fader; in pauses it drifts gently back towards 0 dB
        const want = lvl > floor ? Math.max(-p.cut, Math.min(p.boost, p.target - lvl)) : g * 0.97;
        g += (want - g) * (want < g ? 0.35 : 0.12);
        gainDb[b] = g;
      }
      const out = chs.map(c => new Float32Array(n));
      for (let b = 0; b < nb; b++) {
        const g0 = App.dbToGain(gainDb[b]), g1 = App.dbToGain(gainDb[Math.min(nb - 1, b + 1)]), s0 = b * hop, s1 = Math.min(n, s0 + hop);
        for (let i = s0; i < s1; i++) { const k = g0 + (g1 - g0) * (i - s0) / hop; for (let c = 0; c < chs.length; c++) out[c][i] = chs[c][i] * k; }
      }
      // catch the odd peak the boost pushed too high
      return A.peakOf(out) > db(-1) ? A.FX.find(f => f.id === 'limiter').run(out, sr, { input: 0, ceiling: -1, release: 60 }) : out;
    } },
  { id: 'duck', cat: 'Volume & dynamics', name: 'Auto-duck', icon: 'duck', needsControl: true, tip: 'Automatically lowers this track (e.g. music) whenever another track (e.g. a voice-over) is speaking — the classic podcast / YouTube mix.',
    params: [
      { id: 'control', label: 'Listen to', type: 'track', tip: 'The track whose sound triggers the ducking — usually the voice.' },
      { id: 'amount', label: 'Duck by', min: -30, max: -2, step: 0.5, def: -12, unit: 'dB', tip: 'How much quieter this track gets while the other one is active.' },
      { id: 'threshold', label: 'Threshold', min: -60, max: -10, step: 0.5, def: -36, unit: 'dB', tip: 'How loud the voice must be to trigger ducking.' },
      { id: 'attack', label: 'Fade down', min: 10, max: 1000, step: 5, def: 120, unit: 'ms', tip: 'How quickly the music dips when the voice starts.' },
      { id: 'release', label: 'Fade up', min: 50, max: 3000, step: 10, def: 600, unit: 'ms', tip: 'How quickly the music returns after the voice stops.' },
      { id: 'hold', label: 'Hold', min: 0, max: 2000, step: 10, def: 300, unit: 'ms', tip: 'Keeps the music ducked through short pauses between words.' }],
    run: (chs, sr, p, ctx) => {
      const ctl = A.tracks.find(t => t.id === p.control);
      if (!ctl || !ctx || ctl === ctx.tr) throw new Error('Choose a different track to listen to (e.g. your voice-over)');
      const n = chs[0].length, t0 = ctx.tr.offset + ctx.s0 / sr;
      const thr = db(p.threshold), floor = db(p.amount);
      const ka = 1 - Math.exp(-1 / (p.attack / 1000 * sr)), kr = 1 - Math.exp(-1 / (p.release / 1000 * sr)), holdN = Math.round(p.hold / 1000 * sr);
      const envK = 1 - Math.exp(-1 / (0.02 * sr));
      const out = chs.map(c => new Float32Array(c.length));
      let env = 0, gain = 1, held = 0;
      for (let i = 0; i < n; i++) {
        const ci = Math.round((t0 - ctl.offset) * sr) + i;
        let m = 0;
        if (ci >= 0 && ci < ctl.channels[0].length) for (const c of ctl.channels) { const v = Math.abs(c[ci]); if (v > m) m = v; }
        env += (m - env) * (m > env ? 0.5 : envK);
        let target;
        if (env > thr) { target = floor; held = holdN; } else if (held > 0) { target = floor; held--; } else target = 1;
        gain += (target - gain) * (target < gain ? ka : kr);
        for (let c = 0; c < chs.length; c++) out[c][i] = chs[c][i] * gain;
      }
      return out;
    } },

  /* ---------------- EQ & filters ---------------- */
  { id: 'eq', cat: 'EQ & filters', name: 'Graphic EQ', icon: 'spectrum', tip: 'Boost or cut 10 frequency bands — shape the tone from deep bass to airy highs.', eq: true,
    params: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map(f => ({ id: 'b' + f, f, label: f >= 1000 ? f / 1000 + 'k' : String(f), min: -15, max: 15, step: 0.5, def: 0, unit: 'dB' })).concat([{ id: 'out', label: 'Output', min: -12, max: 12, step: 0.5, def: 0, unit: 'dB', tip: 'Overall level after EQ — lower it if boosting caused clipping.' }]),
    presets: {
      'Flat': {}, 'Bass boost': { b31: 6, b62: 5, b125: 3, b250: 1 }, 'Treble boost': { b4000: 2, b8000: 4, b16000: 5 },
      'Vocal presence': { b125: -2, b250: -1, b2000: 2, b4000: 3.5, b8000: 1.5 }, 'Warm': { b62: 2, b125: 3, b250: 1.5, b8000: -2, b16000: -3 },
      'Bright & airy': { b2000: 1, b4000: 2, b8000: 4, b16000: 6 }, 'De-mud': { b250: -4, b500: -2.5 }, 'Telephone': { b31: -15, b62: -15, b125: -12, b250: -4, b2000: 4, b4000: -6, b8000: -15, b16000: -15 },
      'Loudness (smile)': { b31: 5, b62: 4, b125: 2, b1000: -2, b4000: 1, b8000: 3, b16000: 4 },
    },
    build: (ctx, p) => {
      const nodes = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((f, i, arr) => {
        const b = ctx.createBiquadFilter();
        b.type = i === 0 ? 'lowshelf' : i === arr.length - 1 ? 'highshelf' : 'peaking';
        b.frequency.value = f; b.Q.value = 1.1; b.gain.value = p['b' + f] || 0;
        return b;
      });
      return nodes;
    },
    run: (chs, sr, p) => offline(chs, sr, (ctx, src) => {
      const nodes = A.FX.find(x => x.id === 'eq').build(ctx, p);
      let last = src; for (const n of nodes) { last.connect(n); last = n; }
      const g = ctx.createGain(); g.gain.value = db(p.out || 0); last.connect(g); return g;
    }) },
  { id: 'highpass', cat: 'EQ & filters', name: 'High-pass filter', icon: 'chevUp', tip: 'Removes low rumble (wind, traffic, handling noise) below a cutoff frequency. Great first step for voice.',
    params: [{ id: 'freq', label: 'Cutoff', min: 20, max: 2000, step: 1, def: 80, unit: 'Hz', tip: 'Frequencies below this are cut. 80 Hz is safe for voice.' }, { id: 'q', label: 'Resonance', min: 0.3, max: 10, step: 0.05, def: 0.71, tip: 'Emphasis at the cutoff point. 0.71 is neutral.' }],
    run: (chs, sr, p) => offline(chs, sr, (ctx, src) => { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = p.freq; f.Q.value = p.q; src.connect(f); return f; }) },
  { id: 'lowpass', cat: 'EQ & filters', name: 'Low-pass filter', icon: 'chevDown', tip: 'Removes high frequencies above a cutoff — tames hiss and harshness, or makes things sound muffled/distant.',
    params: [{ id: 'freq', label: 'Cutoff', min: 200, max: 20000, step: 10, def: 8000, unit: 'Hz', tip: 'Frequencies above this are cut.' }, { id: 'q', label: 'Resonance', min: 0.3, max: 10, step: 0.05, def: 0.71, tip: 'Emphasis at the cutoff point.' }],
    presets: { 'Muffled (next room)': { freq: 900, q: 0.8 }, 'Tame hiss': { freq: 9000, q: 0.71 }, 'AM radio': { freq: 3500, q: 1.5 } },
    run: (chs, sr, p) => offline(chs, sr, (ctx, src) => { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.freq; f.Q.value = p.q; src.connect(f); return f; }) },
  { id: 'hum', cat: 'EQ & filters', name: 'Hum remover', icon: 'tone', tip: 'Notches out electrical mains hum (50 or 60 Hz) and its harmonics.',
    params: [{ id: 'base', label: 'Mains', type: 'select', def: '50', options: [['50', '50 Hz (Europe, Asia…)'], ['60', '60 Hz (Americas…)']], tip: 'The hum frequency of your power grid.' }, { id: 'harm', label: 'Harmonics', min: 1, max: 10, step: 1, def: 5, tip: 'How many overtones of the hum to remove.' }, { id: 'q', label: 'Narrowness', min: 5, max: 60, step: 1, def: 30, tip: 'Higher = narrower notches that affect less of the wanted sound.' }],
    run: (chs, sr, p) => offline(chs, sr, (ctx, src) => { let last = src; for (let k = 1; k <= p.harm; k++) { const f = ctx.createBiquadFilter(); f.type = 'notch'; f.frequency.value = +p.base * k; f.Q.value = p.q; last.connect(f); last = f; } return last; }) },

  /* ---------------- Time & pitch ---------------- */
  { id: 'pitch', cat: 'Time & pitch', name: 'Change pitch', icon: 'music', tip: 'Shifts the pitch up or down without changing the speed.', lengthy: true,
    params: [{ id: 'semi', label: 'Semitones', min: -12, max: 12, step: 1, def: 2, tip: '12 semitones = one octave.' }, { id: 'cents', label: 'Fine', min: -100, max: 100, step: 1, def: 0, unit: '¢', tip: 'Fine tuning in cents (1/100 of a semitone).' }],
    presets: { 'Chipmunk (+7)': { semi: 7, cents: 0 }, 'Deep voice (−5)': { semi: -5, cents: 0 }, 'Octave up': { semi: 12, cents: 0 }, 'Octave down': { semi: -12, cents: 0 } },
    run: (chs, sr, p) => Promise.all(chs.map(c => D.work('pitchShift', c, p.semi + p.cents / 100, sr))) },
  { id: 'tempo', cat: 'Time & pitch', name: 'Change tempo', icon: 'speed', tip: 'Speeds up or slows down without changing the pitch. The selection gets shorter or longer.', lengthy: true,
    params: [{ id: 'pct', label: 'Tempo change', min: -50, max: 100, step: 1, def: 10, unit: '%', tip: '+10% is 10% faster. −20% is 20% slower.' }],
    run: (chs, sr, p) => Promise.all(chs.map(c => D.work('timeStretch', c, 1 + p.pct / 100, sr))) },
  { id: 'speed', cat: 'Time & pitch', name: 'Change speed', icon: 'speed', tip: 'Like a tape or record player: faster also means higher pitch.', lengthy: true,
    params: [{ id: 'pct', label: 'Speed change', min: -50, max: 100, step: 1, def: 25, unit: '%', tip: 'Positive = faster and higher; negative = slower and deeper.' }],
    run: (chs, sr, p) => chs.map(c => D.resample(c, 1 + p.pct / 100)) },
  { id: 'reverse', cat: 'Time & pitch', name: 'Reverse', icon: 'reverse', instant: true, tip: 'Plays the selection backwards.',
    run: chs => chs.map(c => c.slice().reverse()) },

  /* ---------------- Space ---------------- */
  { id: 'reverb', cat: 'Space & modulation', name: 'Reverb', icon: 'sparkle', tip: 'Places the sound in a room, hall or cathedral. The tail spills into the audio after the selection.', tail: true,
    params: [
      { id: 'size', label: 'Room size', min: 0.2, max: 8, step: 0.1, def: 2, unit: 's', tip: 'Length of the reverb tail — bigger rooms ring longer.' },
      { id: 'decay', label: 'Decay', min: 1, max: 8, step: 0.1, def: 3, tip: 'How quickly the reflections die away. Higher = faster fade.' },
      { id: 'predelay', label: 'Pre-delay', min: 0, max: 200, step: 1, def: 15, unit: 'ms', tip: 'Gap before the reverb starts — keeps vocals clear.' },
      { id: 'tone', label: 'Tone', min: 1000, max: 20000, step: 100, def: 9000, unit: 'Hz', tip: 'Darker (low) or brighter (high) reverb.' },
      { id: 'wet', label: 'Wet', min: 0, max: 100, step: 1, def: 30, unit: '%', tip: 'Amount of reverb.' },
      { id: 'dry', label: 'Dry', min: 0, max: 100, step: 1, def: 100, unit: '%', tip: 'Amount of original sound.' }],
    presets: { 'Small room': { size: 0.6, decay: 4, predelay: 5, tone: 8000, wet: 22, dry: 100 }, 'Concert hall': { size: 3, decay: 2.5, predelay: 25, tone: 9000, wet: 35, dry: 100 }, 'Cathedral': { size: 7, decay: 2, predelay: 40, tone: 7000, wet: 45, dry: 90 }, 'Bright plate': { size: 1.8, decay: 3.5, predelay: 0, tone: 16000, wet: 30, dry: 100 } },
    run: async (chs, sr, p) => {
      const wet = await offline(chs, sr, (ctx, src) => {
        const pd = ctx.createDelay(1); pd.delayTime.value = p.predelay / 1000;
        const cv = ctx.createConvolver(); cv.buffer = D.impulse(ctx, p.size, p.decay);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.tone;
        src.connect(pd).connect(cv).connect(lp); return lp;
      }, p.size + p.predelay / 1000);
      return dryWet(chs, wet, p.wet / 100, p.dry / 100);
    } },
  { id: 'echo', cat: 'Space & modulation', name: 'Echo / delay', icon: 'loop', tip: 'Repeating echoes of the sound. Tail spills past the selection.', tail: true,
    params: [
      { id: 'time', label: 'Delay time', min: 10, max: 2000, step: 1, def: 350, unit: 'ms', tip: 'Time between repeats.' },
      { id: 'fb', label: 'Feedback', min: 0, max: 92, step: 1, def: 40, unit: '%', tip: 'How many repeats — higher means echoes last longer.' },
      { id: 'mix', label: 'Echo level', min: 0, max: 100, step: 1, def: 35, unit: '%', tip: 'Loudness of the echoes.' }],
    presets: { 'Slapback': { time: 110, fb: 10, mix: 35 }, 'Canyon': { time: 600, fb: 55, mix: 40 }, 'Rhythmic': { time: 375, fb: 45, mix: 30 } },
    run: async (chs, sr, p) => {
      const tail = Math.min(12, (p.time / 1000) * Math.log(0.001) / Math.log(Math.max(0.01, p.fb / 100)));
      const wet = await offline(chs, sr, (ctx, src) => {
        const d = ctx.createDelay(2.5); d.delayTime.value = p.time / 1000;
        const fb = ctx.createGain(); fb.gain.value = p.fb / 100;
        src.connect(d); d.connect(fb).connect(d);
        return d;
      }, Math.max(0.1, tail));
      return dryWet(chs, wet, p.mix / 100, 1);
    } },
  { id: 'chorus', cat: 'Space & modulation', name: 'Chorus', icon: 'wave', tip: 'Thickens the sound with slightly detuned, shimmering copies — lush on guitars and pads.',
    params: [{ id: 'rate', label: 'Rate', min: 0.1, max: 5, step: 0.05, def: 1.2, unit: 'Hz', tip: 'Speed of the shimmer.' }, { id: 'depth', label: 'Depth', min: 0.5, max: 10, step: 0.1, def: 3, unit: 'ms', tip: 'Amount of detuning.' }, { id: 'mix', label: 'Mix', min: 0, max: 100, step: 1, def: 50, unit: '%', tip: 'Blend of effect vs. original.' }],
    run: (chs, sr, p) => chs.map((c, ci) => {
      const o = new Float32Array(c.length), base = 0.012 * sr, dep = p.depth / 1000 * sr, w = 2 * Math.PI * p.rate / sr, ph = ci * Math.PI / 2, mix = p.mix / 100;
      for (let i = 0; i < c.length; i++) {
        const d = base + dep * (1 + Math.sin(i * w + ph)) / 2, pos = i - d, i0 = Math.floor(pos), f = pos - i0;
        const s = i0 >= 0 ? c[i0] * (1 - f) + (c[i0 + 1] || 0) * f : 0;
        o[i] = c[i] * (1 - mix * 0.5) + s * mix * 0.7;
      }
      return o;
    }) },
  { id: 'tremolo', cat: 'Space & modulation', name: 'Tremolo', icon: 'tone', tip: 'Rhythmic volume wobble, like a vintage amp.',
    params: [{ id: 'rate', label: 'Rate', min: 0.5, max: 20, step: 0.1, def: 5, unit: 'Hz', tip: 'Wobbles per second.' }, { id: 'depth', label: 'Depth', min: 0, max: 100, step: 1, def: 50, unit: '%', tip: 'How deep the volume dips.' }],
    run: (chs, sr, p) => { const w = 2 * Math.PI * p.rate / sr, d = p.depth / 100; return map(chs, (v, i) => v * (1 - d * (0.5 + 0.5 * Math.sin(i * w)))); } },
  { id: 'width', cat: 'Space & modulation', name: 'Stereo width', icon: 'expand', tip: 'Narrows or widens the stereo image (stereo tracks only).',
    params: [{ id: 'w', label: 'Width', min: 0, max: 200, step: 1, def: 140, unit: '%', tip: '0% = mono, 100% = unchanged, 200% = extra wide.' }],
    run: (chs, sr, p) => {
      if (chs.length < 2) { App.toast('Stereo width needs a stereo track', 'warn'); return chs; }
      const L = chs[0], R = chs[1], w = p.w / 100, oL = new Float32Array(L.length), oR = new Float32Array(L.length);
      for (let i = 0; i < L.length; i++) { const m = (L[i] + R[i]) / 2, s = (L[i] - R[i]) / 2 * w; oL[i] = m + s; oR[i] = m - s; }
      return [oL, oR, ...chs.slice(2)];
    } },

  /* ---------------- Character ---------------- */
  { id: 'distortion', cat: 'Character', name: 'Distortion', icon: 'sparkle', tip: 'Adds grit, crunch and warmth by overdriving the signal.',
    params: [{ id: 'drive', label: 'Drive', min: 0, max: 100, step: 1, def: 40, unit: '%', tip: 'Amount of overdrive.' }, { id: 'tone', label: 'Tone', min: 500, max: 16000, step: 50, def: 6000, unit: 'Hz', tip: 'Smooths harsh highs after distortion.' }, { id: 'mix', label: 'Mix', min: 0, max: 100, step: 1, def: 100, unit: '%', tip: 'Blend with the clean sound.' }, { id: 'out', label: 'Output', min: -24, max: 6, step: 0.5, def: -4, unit: 'dB', tip: 'Level after distortion.' }],
    run: async (chs, sr, p) => {
      const k = p.drive * 2;
      const wet = await offline(chs, sr, (ctx, src) => {
        const ws = ctx.createWaveShaper(), n = 2048, curve = new Float32Array(n);
        let mx = 1e-6;
        for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; curve[i] = (3 + k) * x * 20 * Math.PI / 180 / (Math.PI + k * Math.abs(x)); mx = Math.max(mx, Math.abs(curve[i])); }
        for (let i = 0; i < n; i++) curve[i] /= mx;
        ws.curve = curve; ws.oversample = '4x';
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.tone;
        src.connect(ws).connect(lp); return lp;
      });
      const g = db(p.out), mix = p.mix / 100;
      return chs.map((c, ci) => c.map((v, i) => (v * (1 - mix) + wet[ci][i] * mix) * g));
    } },
  { id: 'bitcrush', cat: 'Character', name: 'Lo-fi / bitcrusher', icon: 'grid', tip: 'Retro, crunchy “8-bit” sound by reducing resolution and sample rate.',
    params: [{ id: 'bits', label: 'Bit depth', min: 2, max: 16, step: 1, def: 6, unit: 'bit', tip: 'Fewer bits = more grit.' }, { id: 'down', label: 'Downsample', min: 1, max: 40, step: 1, def: 6, unit: '×', tip: 'Higher = more aliasing and lo-fi crunch.' }, { id: 'mix', label: 'Mix', min: 0, max: 100, step: 1, def: 100, unit: '%', tip: 'Blend with the clean sound.' }],
    run: (chs, sr, p) => { const q = Math.pow(2, p.bits - 1), mix = p.mix / 100; return chs.map(c => { const o = new Float32Array(c.length); let hold = 0; for (let i = 0; i < c.length; i++) { if (i % p.down === 0) hold = Math.round(c[i] * q) / q; o[i] = c[i] * (1 - mix) + hold * mix; } return o; }); } },

  /* ---------------- Repair ---------------- */
  { id: 'denoise', cat: 'Repair', name: 'Noise reduction', icon: 'sparkle', tip: 'Removes steady background noise (hiss, fan, hum). First capture a noise-only sample, then apply to everything.', denoise: true,
    params: [
      { id: 'reduction', label: 'Reduction', min: 0, max: 40, step: 0.5, def: 18, unit: 'dB', tip: 'How much the noise is turned down. Too much can sound “underwater”.' },
      { id: 'sensitivity', label: 'Sensitivity', min: 0, max: 24, step: 0.5, def: 6, unit: 'dB', tip: 'How far above the noise level sound must be to be kept. Higher removes more.' },
      { id: 'smoothing', label: 'Smoothing', min: 0, max: 10, step: 1, def: 3, tip: 'Blurs the gating across frequencies to reduce warbly artifacts.' }],
    run: (chs, sr, p) => {
      if (!A.noiseProfile) throw new Error('Capture a noise profile first: select a few seconds of pure noise and press “Capture noise profile”.');
      return Promise.all(chs.map(c => D.work('noiseReduce', c, A.noiseProfile, { reduction: p.reduction, sensitivity: p.sensitivity, smoothing: p.smoothing })));
    } },
  { id: 'deess', cat: 'Repair', name: 'De-esser', icon: 'tone', tip: 'Tames harsh “s”, “sh” and “t” sounds that hiss or whistle in a voice — only while they happen, so the rest of the voice keeps its brightness.',
    params: [
      { id: 'freq', label: 'Frequency', min: 3000, max: 10000, step: 50, def: 5500, unit: 'Hz', tip: 'Where the hiss lives. Lower for deeper voices (≈4.5 kHz), higher for bright voices (≈7 kHz).' },
      { id: 'threshold', label: 'Threshold', min: -50, max: -5, step: 0.5, def: -28, unit: 'dB', tip: 'How loud the hiss must be before it is turned down. Lower = more de-essing.' },
      { id: 'reduction', label: 'Max reduction', min: 2, max: 24, step: 0.5, def: 10, unit: 'dB', tip: 'The most the hissing sounds are turned down.' }],
    presets: { 'Gentle': { freq: 5500, threshold: -24, reduction: 6 }, 'Medium': { freq: 5500, threshold: -28, reduction: 10 }, 'Strong': { freq: 5000, threshold: -34, reduction: 16 } },
    run: (chs, sr, p) => {
      // split off the sibilance band with a zero-phase high-pass (run forwards, then backwards — so the band lines up exactly
      // with the original and subtracting part of it really removes hiss), follow its level, and turn it down when it's too loud
      const w0 = 2 * Math.PI * Math.min(p.freq, sr * 0.45) / sr, cw = Math.cos(w0), al = Math.sin(w0) / (2 * 0.7071), a0 = 1 + al;
      const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, b2 = b0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
      const hp = x => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; } return y; };
      const zeroPhase = x => hp(hp(x).reverse()).reverse();
      const bands = chs.map(zeroPhase), n = chs[0].length;
      const ka = 1 - Math.exp(-1 / (0.0015 * sr)), kr = 1 - Math.exp(-1 / (0.06 * sr)), thr = db(p.threshold), maxR = p.reduction;
      const g = new Float32Array(n);
      let env = 0;
      for (let i = 0; i < n; i++) {
        let m = 0; for (const b of bands) { const v = Math.abs(b[i]); if (v > m) m = v; }
        env += (m - env) * (m > env ? ka : kr);
        const over = env > thr ? 20 * Math.log10(env / thr) : 0;   // dB above the threshold, compressed 4:1
        g[i] = over > 0 ? db(-Math.min(maxR, over * 0.75)) : 1;
      }
      return chs.map((c, ci) => { const b = bands[ci], o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = c[i] - b[i] * (1 - g[i]); return o; });
    } },
  { id: 'dc', cat: 'Repair', name: 'Remove DC offset', icon: 'target', instant: true, tip: 'Re-centers a waveform that sits above or below zero.',
    run: chs => chs.map(c => { let s = 0; for (let i = 0; i < c.length; i++) s += c[i]; const m = s / c.length; return c.map(v => v - m); }) },
  { id: 'invert', cat: 'Repair', name: 'Invert polarity', icon: 'invert', instant: true, tip: 'Flips the waveform upside-down. Sounds the same alone, but fixes phase problems between microphones.',
    run: chs => chs.map(c => c.map(v => -v)) },
];

/* ---------------- generators ---------------- */
A.GEN = [
  { id: 'tone', name: 'Tone…', icon: 'tone', tip: 'Creates a pure test tone: sine, square, saw or triangle wave.',
    params: [
      { id: 'wave', label: 'Waveform', type: 'select', def: 'sine', options: [['sine', 'Sine'], ['square', 'Square'], ['sawtooth', 'Sawtooth'], ['triangle', 'Triangle']], tip: 'Shape of the wave — sine is pure, square and saw are buzzy.' },
      { id: 'freq', label: 'Frequency', min: 20, max: 8000, step: 1, def: 440, unit: 'Hz', tip: '440 Hz is the note A.' },
      { id: 'amp', label: 'Level', min: -40, max: 0, step: 0.5, def: -12, unit: 'dB', tip: 'Loudness of the tone.' },
      { id: 'dur', label: 'Duration', min: 0.1, max: 60, step: 0.1, def: 3, unit: 's', tip: 'Length (ignored if you have a selection — the selection is filled).' }],
    make: (n, sr, p) => {
      const o = new Float32Array(n), a = db(p.amp), f = p.freq / sr;
      for (let i = 0; i < n; i++) {
        const ph = (i * f) % 1;
        o[i] = a * (p.wave === 'sine' ? Math.sin(2 * Math.PI * ph) : p.wave === 'square' ? (ph < 0.5 ? 1 : -1) : p.wave === 'sawtooth' ? 2 * ph - 1 : 1 - 4 * Math.abs(ph - 0.5));
      }
      return o;
    } },
  { id: 'noise', name: 'Noise…', icon: 'dice', tip: 'Creates white, pink or brown noise — useful for testing or as ambience.',
    params: [
      { id: 'color', label: 'Color', type: 'select', def: 'pink', options: [['white', 'White (bright hiss)'], ['pink', 'Pink (balanced, like rain)'], ['brown', 'Brown (deep rumble)']], tip: 'Different “colors” of noise have different tonal balance.' },
      { id: 'amp', label: 'Level', min: -40, max: 0, step: 0.5, def: -18, unit: 'dB', tip: 'Loudness of the noise.' },
      { id: 'dur', label: 'Duration', min: 0.1, max: 60, step: 0.1, def: 5, unit: 's', tip: 'Length (ignored if you have a selection).' }],
    make: (n, sr, p) => {
      const o = new Float32Array(n), a = db(p.amp);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (p.color === 'white') o[i] = w * a;
        else if (p.color === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          o[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11 * a; b6 = w * 0.115926;
        } else { last = (last + 0.02 * w) / 1.02; o[i] = last * 3.5 * a; }
      }
      return o;
    } },
  { id: 'click', name: 'Click track…', icon: 'metronome', tip: 'A metronome — handy to record in time.',
    params: [
      { id: 'bpm', label: 'Tempo', min: 30, max: 250, step: 1, def: 120, unit: 'BPM', tip: 'Beats per minute.' },
      { id: 'beats', label: 'Beats per bar', min: 1, max: 12, step: 1, def: 4, tip: 'The first beat of every bar is accented.' },
      { id: 'dur', label: 'Duration', min: 1, max: 600, step: 1, def: 16, unit: 's', tip: 'Length (ignored if you have a selection).' }],
    make: (n, sr, p) => {
      const o = new Float32Array(n), step = 60 / p.bpm * sr, cl = Math.round(0.03 * sr);
      for (let k = 0, s = 0; s < n; k++, s = Math.round(k * step)) {
        const acc = k % p.beats === 0, f = acc ? 1600 : 1000;
        for (let i = 0; i < cl && s + i < n; i++) o[s + i] = Math.sin(2 * Math.PI * f * i / sr) * Math.exp(-i / (cl / 5)) * (acc ? 0.8 : 0.5);
      }
      return o;
    } },
  { id: 'silence', name: 'Silence…', icon: 'silence', tip: 'Inserts a stretch of pure silence.',
    params: [{ id: 'dur', label: 'Duration', min: 0.1, max: 60, step: 0.1, def: 2, unit: 's', tip: 'Length of the silence (ignored if you have a selection — the selection is silenced).' }],
    make: n => new Float32Array(n) },
];
})();
