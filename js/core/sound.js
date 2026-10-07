/* Strata Studio — UI sounds. Every sound is synthesized live with Web Audio (no audio files), in packs
   that match the themes. Subtle by design, grouped into categories that can be switched off one by one,
   and silent while your own audio or video is playing. */
(() => {
'use strict';
const App = window.App;

/* ---------- engine ---------- */
let ctx = null, master = null, verbIn = null, hazeIn = null, noiseBuf = null, irBuf = null, hazeBuf = null;
function init() {
  if (ctx) return true;
  // never create an AudioContext before the person has interacted with the page
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
  try { ctx = App.ac(); } catch { return false; }
  master = ctx.createGain();
  master.connect(ctx.destination);
  // a small synthetic room, used by packs that want a little space (glass, synth, bells)
  const len = Math.round(ctx.sampleRate * 1.3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
  irBuf = ir;
  const verb = ctx.createConvolver(); verb.buffer = ir;
  verbIn = ctx.createGain(); verbIn.gain.value = 0.5;
  verbIn.connect(verb); verb.connect(master);
  // a much bigger, darker room for the Dream pack's slowed-down sounds
  const hl = Math.round(ctx.sampleRate * 3.4), hz = ctx.createBuffer(2, hl, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = hz.getChannelData(c); for (let i = 0; i < hl; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / hl, 2.2); }
  hazeBuf = hz;
  hazeIn = makeHaze(ctx, master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  setVolume();
  return true;
}
const setting = (k, d) => (App.settings && App.settings[k] != null ? App.settings[k] : d);
function makeHaze(c, dest) {
  const inp = c.createGain(), verb = c.createConvolver(), lp = c.createBiquadFilter();
  verb.buffer = hazeBuf; lp.type = 'lowpass'; lp.frequency.value = 3200; inp.gain.value = 0.55;
  inp.connect(verb); verb.connect(lp); lp.connect(dest);
  return inp;
}
function setVolume() { if (master) master.gain.value = 0.34 * Math.pow(setting('soundVolume', 55) / 100, 1.5); }

const T0 = () => ctx.currentTime + 0.004;
function out(node, o) {
  if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; node.connect(p); node = p; }
  node.connect(master);
  if (o.wet) { const w = ctx.createGain(); w.gain.value = o.wet; node.connect(w); w.connect(verbIn); }
  if (o.haze) { const w = ctx.createGain(); w.gain.value = o.haze; node.connect(w); w.connect(hazeIn); }
}
let trimGain = 1;   // per-sound level correction (see TRIM), applied to every voice of the sound being played
function shape(g, t, a, dur, vol, swell) {
  vol *= trimGain;
  g.gain.setValueAtTime(0.0001, t);
  if (swell) { g.gain.linearRampToValueAtTime(vol, t + dur * swell); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  else { g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur); }
}
/** Oscillator voice. o: {f, f2, type, at, dur, a, vol, cutoff, cutoff2, q, ftype, detune, pan, wet, swell} */
function tone(o) {
  const t = T0() + (o.at || 0), a = o.a ?? 0.003, dur = o.dur ?? 0.06;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide ?? dur));
  if (o.detune) osc.detune.value = o.detune;
  let node = osc;
  if (o.cutoff) {
    const fl = ctx.createBiquadFilter(); fl.type = o.ftype || 'lowpass'; fl.Q.value = o.q ?? 0.8;
    fl.frequency.setValueAtTime(o.cutoff, t);
    if (o.cutoff2) fl.frequency.exponentialRampToValueAtTime(o.cutoff2, t + dur);
    node.connect(fl); node = fl;
  }
  const g = ctx.createGain(); shape(g, t, a, dur, o.vol ?? 0.3, o.swell);
  node.connect(g); out(g, o);
  osc.start(t); osc.stop(t + a + dur + 0.05);
}
/** Filtered noise burst. o: {at, dur, vol, ftype, f, f2, q, a, swell, pan, wet} */
function noise(o) {
  const t = T0() + (o.at || 0), a = o.a ?? 0.001, dur = o.dur ?? 0.02;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = o.ftype || 'bandpass'; fl.Q.value = o.q ?? 1;
  fl.frequency.setValueAtTime(o.f || 2000, t);
  if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  const g = ctx.createGain(); shape(g, t, a, dur, o.vol ?? 0.3, o.swell);
  src.connect(fl); fl.connect(g); out(g, o);
  src.start(t, Math.random() * 0.5); src.stop(t + a + dur + 0.05);
}
/** FM voice (bells, glass). o: {f, ratio, index, dur, vol, at, wet} */
function fm(o) {
  const t = T0() + (o.at || 0), dur = o.dur ?? 0.4;
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
  car.frequency.value = o.f; mod.frequency.value = o.f * (o.ratio ?? 3.5);
  mg.gain.setValueAtTime(o.f * (o.index ?? 1.2), t); mg.gain.exponentialRampToValueAtTime(o.f * 0.02, t + dur);
  mod.connect(mg); mg.connect(car.frequency);
  const g = ctx.createGain(); shape(g, t, 0.002, dur, o.vol ?? 0.15);
  car.connect(g); out(g, o);
  car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
}
/* little instruments built from the voices */
const chime = (f, o = {}) => { [[1, 1], [2.01, 0.42], [2.76, 0.3], [5.4, 0.12]].forEach(([k, v], i) => tone({ f: f * k, dur: (o.dur ?? 0.5) / (1 + i * 0.6), vol: (o.vol ?? 0.12) * v, at: o.at, wet: o.wet ?? 0.25, haze: o.haze, a: 0.002 })); };
const pluck = (f, o = {}) => tone({ type: 'triangle', f, dur: o.dur ?? 0.08, vol: o.vol ?? 0.18, at: o.at, cutoff: o.cutoff ?? 5000, wet: o.wet });
const whoosh = (f1, f2, o = {}) => noise({ f: f1, f2, q: o.q ?? 1.4, dur: o.dur ?? 0.16, vol: o.vol ?? 0.07, swell: 0.45, at: o.at, wet: o.wet, haze: o.haze });
const tap = (f, o = {}) => noise({ f, q: o.q ?? 1.6, dur: o.dur ?? 0.01, vol: o.vol ?? 0.3, at: o.at });
const thump = (f, o = {}) => tone({ f, f2: f * (o.drop ?? 0.55), dur: o.dur ?? 0.06, vol: o.vol ?? 0.3, at: o.at });
const seq = (notes, fn, gap) => notes.forEach((n, i) => fn(n, i * gap));

/* ---------- packs: each event receives v (0–1, e.g. slider position or editor index) ---------- */
const PACKS = {
  soft: { name: 'Soft', desc: 'Gentle, rounded blips — the Strata default.', s: {
    click: () => { tone({ f: 1750, f2: 1250, dur: 0.028, vol: 0.2 }); tap(5200, { vol: 0.04, dur: 0.006 }); },
    select: () => { tone({ f: 1046, dur: 0.045, vol: 0.15 }); tone({ f: 1568, dur: 0.035, vol: 0.06 }); },
    on: () => { tone({ f: 660, dur: 0.045, vol: 0.16 }); tone({ f: 990, dur: 0.07, vol: 0.16, at: 0.045 }); },
    off: () => { tone({ f: 990, dur: 0.045, vol: 0.14 }); tone({ f: 660, dur: 0.07, vol: 0.14, at: 0.045 }); },
    tick: v => tone({ f: 900 + v * 900, dur: 0.016, vol: 0.09 }),
    open: () => { tone({ f: 520, f2: 800, dur: 0.12, vol: 0.12 }); whoosh(1000, 2800, { vol: 0.035, dur: 0.12 }); },
    close: () => tone({ f: 780, f2: 470, dur: 0.1, vol: 0.1 }),
    menu: () => tone({ f: 1200, f2: 1500, dur: 0.035, vol: 0.1 }),
    grab: () => tone({ type: 'triangle', f: 420, f2: 540, dur: 0.05, vol: 0.16 }),
    drop: () => { tone({ type: 'triangle', f: 540, f2: 330, dur: 0.06, vol: 0.18 }); noise({ ftype: 'lowpass', f: 700, dur: 0.03, vol: 0.08 }); },
    success: () => seq([1046, 1318, 1568], (f, at) => tone({ f, dur: 0.16, vol: 0.11, at, wet: 0.2 }), 0.06),
    error: () => { tone({ type: 'square', f: 330, dur: 0.1, vol: 0.06, cutoff: 1200 }); tone({ type: 'square', f: 247, dur: 0.16, vol: 0.06, cutoff: 1000, at: 0.1 }); },
    warn: () => { tone({ type: 'triangle', f: 660, dur: 0.06, vol: 0.13 }); tone({ type: 'triangle', f: 660, dur: 0.08, vol: 0.13, at: 0.1 }); },
    notify: () => tone({ f: 1318, dur: 0.12, vol: 0.08, wet: 0.15 }),
    switch: v => { whoosh(600, 2400, { vol: 0.05 }); tone({ f: [523, 659, 784][Math.round(v * 2)] || 659, dur: 0.14, vol: 0.08, at: 0.04 }); },
  } },
  glass: { name: 'Liquid glass', desc: 'Bubbles, water drops and glassy chimes (Frutiger Aero).', s: {
    click: () => tone({ f: 700, f2: 1500, dur: 0.035, vol: 0.19, wet: 0.25 }),
    select: () => tone({ f: 900, f2: 1900, dur: 0.04, vol: 0.16, wet: 0.3 }),
    on: () => { tone({ f: 600, f2: 1300, dur: 0.04, vol: 0.16, wet: 0.25 }); tone({ f: 900, f2: 1900, dur: 0.045, vol: 0.14, at: 0.05, wet: 0.3 }); },
    off: () => { tone({ f: 1300, f2: 650, dur: 0.05, vol: 0.14, wet: 0.25 }); },
    tick: v => tone({ f: 2000 + v * 1500, dur: 0.018, vol: 0.06, wet: 0.2 }),
    open: () => { fm({ f: 1318, ratio: 3.01, index: 0.7, dur: 0.5, vol: 0.09, wet: 0.45 }); fm({ f: 1975, ratio: 3.01, index: 0.5, dur: 0.4, vol: 0.06, at: 0.05, wet: 0.45 }); },
    close: () => fm({ f: 988, ratio: 3.01, index: 0.6, dur: 0.3, vol: 0.08, wet: 0.4 }),
    menu: () => tone({ f: 1000, f2: 2000, dur: 0.05, vol: 0.12, wet: 0.3 }),
    grab: () => tone({ f: 500, f2: 950, dur: 0.05, vol: 0.15, wet: 0.2 }),
    drop: () => { tone({ f: 1800, f2: 600, dur: 0.05, vol: 0.16, wet: 0.3 }); tone({ f: 420, f2: 820, dur: 0.04, vol: 0.12, at: 0.035, wet: 0.3 }); },
    success: () => seq([1318, 1661, 1975, 2637], (f, at) => fm({ f, ratio: 3.01, index: 0.5, dur: 0.5, vol: 0.075, at, wet: 0.5 }), 0.07),
    error: () => { fm({ f: 440, ratio: 1.41, index: 2.5, dur: 0.25, vol: 0.12 }); fm({ f: 330, ratio: 1.41, index: 2, dur: 0.3, vol: 0.1, at: 0.09 }); },
    warn: () => { fm({ f: 880, ratio: 3.01, index: 0.8, dur: 0.25, vol: 0.08, wet: 0.3 }); fm({ f: 880, ratio: 3.01, index: 0.8, dur: 0.25, vol: 0.08, at: 0.12, wet: 0.3 }); },
    notify: () => fm({ f: 1760, ratio: 3.01, index: 0.5, dur: 0.4, vol: 0.06, wet: 0.5 }),
    switch: () => { whoosh(800, 3000, { vol: 0.05, wet: 0.3 }); seq([700, 1000, 1400], (f, at) => tone({ f, f2: f * 2, dur: 0.04, vol: 0.1, at: at + 0.03, wet: 0.35 }), 0.04); },
  } },
  xp: { name: 'XP', desc: 'Crisp navigation clicks and friendly dings, early-2000s style.', s: {
    click: () => { tap(3000, { q: 2, dur: 0.012, vol: 0.22 }); tone({ f: 1500, dur: 0.01, vol: 0.04 }); },
    select: () => tap(2300, { q: 2, dur: 0.012, vol: 0.2 }),
    on: () => { tap(3000, { q: 2, vol: 0.2 }); tone({ f: 1200, dur: 0.03, vol: 0.06, at: 0.01 }); },
    off: () => { tap(2400, { q: 2, vol: 0.18 }); tone({ f: 900, dur: 0.03, vol: 0.05, at: 0.01 }); },
    tick: () => tap(4000, { q: 3, dur: 0.006, vol: 0.09 }),
    open: () => { tone({ f: 523, dur: 0.2, vol: 0.06, swell: 0.3 }); tone({ f: 784, dur: 0.2, vol: 0.05, swell: 0.3 }); },
    close: () => whoosh(2600, 700, { vol: 0.05, dur: 0.12 }),
    menu: () => tap(2600, { q: 2, dur: 0.01, vol: 0.16 }),
    grab: () => tap(1800, { q: 2, dur: 0.012, vol: 0.18 }),
    drop: () => { tap(1400, { q: 1.5, dur: 0.015, vol: 0.22 }); thump(160, { vol: 0.12 }); },
    success: () => { chime(1318, { vol: 0.09 }); chime(1760, { vol: 0.08, at: 0.09 }); },
    error: () => { tone({ type: 'square', f: 440, dur: 0.12, vol: 0.04, cutoff: 1500 }); tone({ type: 'square', f: 554, dur: 0.12, vol: 0.035, cutoff: 1500 }); tone({ type: 'square', f: 330, dur: 0.18, vol: 0.04, cutoff: 1300, at: 0.12 }); tone({ type: 'square', f: 415, dur: 0.18, vol: 0.035, cutoff: 1300, at: 0.12 }); },
    warn: () => chime(660, { vol: 0.1, dur: 0.6 }),
    notify: () => chime(1568, { vol: 0.07 }),
    switch: () => { whoosh(500, 2200, { vol: 0.05 }); chime(784, { vol: 0.06, at: 0.05 }); },
  } },
  mech: { name: 'Mechanical', desc: 'Physical keys, toggle switches, fader detents and latches.', s: {
    click: () => { tap(2500, { q: 1.5, dur: 0.008, vol: 0.4 }); thump(180, { vol: 0.15, dur: 0.03 }); tap(3200, { q: 2, dur: 0.005, vol: 0.15, at: 0.045 }); },
    select: () => { tap(3500, { q: 2.5, dur: 0.006, vol: 0.3 }); tone({ f: 1200, dur: 0.01, vol: 0.04 }); },
    on: () => { noise({ ftype: 'highpass', f: 2000, dur: 0.01, vol: 0.4 }); thump(140, { vol: 0.24, dur: 0.04 }); tone({ f: 2600, dur: 0.06, vol: 0.03 }); },
    off: () => { noise({ ftype: 'highpass', f: 1600, dur: 0.01, vol: 0.34 }); thump(110, { vol: 0.22, dur: 0.04 }); },
    tick: v => tap(3000 + v * 1500, { q: 4, dur: 0.004, vol: 0.2 }),
    open: () => { noise({ ftype: 'lowpass', f: 400, f2: 1600, dur: 0.12, vol: 0.08, swell: 0.7 }); tap(2800, { q: 2, vol: 0.25, at: 0.12 }); },
    close: () => { tap(2600, { q: 2, vol: 0.28 }); thump(130, { vol: 0.2, at: 0.005 }); },
    menu: () => tap(3000, { q: 2, dur: 0.008, vol: 0.2 }),
    grab: () => noise({ ftype: 'lowpass', f: 900, dur: 0.03, vol: 0.14 }),
    drop: () => { thump(120, { drop: 0.6, dur: 0.08, vol: 0.32 }); noise({ ftype: 'lowpass', f: 600, dur: 0.03, vol: 0.18 }); },
    success: () => { tap(3000, { vol: 0.2 }); tap(3000, { vol: 0.2, at: 0.06 }); chime(2093, { vol: 0.06, at: 0.1 }); },
    error: () => tone({ type: 'sawtooth', f: 110, dur: 0.18, vol: 0.08, cutoff: 600 }),
    warn: () => { tap(2200, { vol: 0.3 }); thump(150, { vol: 0.15 }); tap(2200, { vol: 0.3, at: 0.1 }); thump(150, { vol: 0.15, at: 0.1 }); },
    notify: () => chime(1760, { vol: 0.05 }),
    switch: () => { noise({ ftype: 'bandpass', f: 1800, dur: 0.02, vol: 0.35 }); thump(90, { dur: 0.07, vol: 0.3 }); },
  } },
  minimal: { name: 'Minimal', desc: 'Barely-there ticks. Feedback without noise.', s: {
    click: () => tone({ f: 2400, dur: 0.012, vol: 0.07 }),
    select: () => tone({ f: 2000, dur: 0.012, vol: 0.07 }),
    on: () => tone({ f: 2600, dur: 0.016, vol: 0.07 }),
    off: () => tone({ f: 1800, dur: 0.016, vol: 0.07 }),
    tick: v => tone({ f: 3000 + v * 1000, dur: 0.006, vol: 0.035 }),
    open: () => tone({ f: 1600, f2: 2000, dur: 0.04, vol: 0.05 }),
    close: () => tone({ f: 2000, f2: 1600, dur: 0.04, vol: 0.045 }),
    menu: () => tone({ f: 2200, dur: 0.01, vol: 0.05 }),
    grab: () => tone({ f: 1400, dur: 0.02, vol: 0.06 }),
    drop: () => tone({ f: 1000, dur: 0.03, vol: 0.07 }),
    success: () => { tone({ f: 2093, dur: 0.05, vol: 0.05 }); tone({ f: 2637, dur: 0.06, vol: 0.05, at: 0.05 }); },
    error: () => { tone({ f: 400, dur: 0.06, vol: 0.07 }); tone({ f: 400, dur: 0.06, vol: 0.07, at: 0.09 }); },
    warn: () => tone({ f: 880, dur: 0.05, vol: 0.06 }),
    notify: () => tone({ f: 2637, dur: 0.06, vol: 0.04 }),
    switch: () => tone({ f: 1760, dur: 0.05, vol: 0.05 }),
  } },
  synth: { name: 'Synthwave', desc: 'Analog synth blips, filter sweeps and lasers.', s: {
    click: () => { tone({ type: 'sawtooth', f: 220, dur: 0.06, vol: 0.07, cutoff: 2400, cutoff2: 500, detune: -6 }); tone({ type: 'sawtooth', f: 220, dur: 0.06, vol: 0.06, cutoff: 2400, cutoff2: 500, detune: 7 }); },
    select: () => tone({ type: 'square', f: 440, dur: 0.05, vol: 0.06, cutoff: 1800, cutoff2: 600 }),
    on: () => { tone({ type: 'sawtooth', f: 440, dur: 0.05, vol: 0.07, cutoff: 3000 }); tone({ type: 'sawtooth', f: 880, dur: 0.07, vol: 0.06, cutoff: 3000, at: 0.05, wet: 0.3 }); },
    off: () => { tone({ type: 'sawtooth', f: 880, dur: 0.05, vol: 0.06, cutoff: 2500 }); tone({ type: 'sawtooth', f: 440, dur: 0.07, vol: 0.06, cutoff: 1800, at: 0.05 }); },
    tick: v => tone({ type: 'square', f: 300 + v * 600, dur: 0.018, vol: 0.035, cutoff: 2000 }),
    open: () => { tone({ type: 'sawtooth', f: 110, dur: 0.26, vol: 0.08, cutoff: 300, cutoff2: 4000, q: 6, wet: 0.4 }); tone({ type: 'sawtooth', f: 165, dur: 0.26, vol: 0.05, cutoff: 300, cutoff2: 4000, q: 6, detune: 8 }); },
    close: () => tone({ type: 'sawtooth', f: 110, dur: 0.2, vol: 0.07, cutoff: 3500, cutoff2: 250, q: 6, wet: 0.3 }),
    menu: () => tone({ type: 'sawtooth', f: 660, dur: 0.05, vol: 0.05, cutoff: 3000, wet: 0.3 }),
    grab: () => tone({ type: 'sawtooth', f: 220, f2: 330, dur: 0.06, vol: 0.06, cutoff: 2000 }),
    drop: () => tone({ type: 'sawtooth', f: 330, f2: 165, dur: 0.08, vol: 0.07, cutoff: 1500, cutoff2: 300 }),
    success: () => seq([523, 659, 784, 988], (f, at) => tone({ type: 'sawtooth', f, dur: 0.18, vol: 0.05, cutoff: 3000, cutoff2: 800, at, wet: 0.5 }), 0.07),
    error: () => { tone({ type: 'sawtooth', f: 98, dur: 0.3, vol: 0.08, cutoff: 700 }); tone({ type: 'sawtooth', f: 98, dur: 0.3, vol: 0.07, cutoff: 700, detune: 18 }); },
    warn: () => { tone({ type: 'square', f: 440, dur: 0.06, vol: 0.05, cutoff: 2000 }); tone({ type: 'square', f: 440, dur: 0.06, vol: 0.05, cutoff: 2000, at: 0.1 }); },
    notify: () => { tone({ f: 659, dur: 0.4, vol: 0.05, swell: 0.3, wet: 0.5 }); tone({ f: 988, dur: 0.4, vol: 0.04, swell: 0.3, wet: 0.5 }); },
    switch: () => tone({ type: 'sawtooth', f: 1800, f2: 200, dur: 0.15, vol: 0.06, cutoff: 5000, wet: 0.4 }),
  } },
  beep: { name: 'Terminal beeps', desc: 'Square-wave beeps straight from an old computer.', s: {
    click: () => tone({ type: 'square', f: 1000, dur: 0.015, vol: 0.05, cutoff: 4000 }),
    select: () => tone({ type: 'square', f: 1200, dur: 0.02, vol: 0.05, cutoff: 4000 }),
    on: () => { tone({ type: 'square', f: 800, dur: 0.03, vol: 0.05, cutoff: 4000 }); tone({ type: 'square', f: 1600, dur: 0.03, vol: 0.05, cutoff: 4000, at: 0.035 }); },
    off: () => { tone({ type: 'square', f: 1600, dur: 0.03, vol: 0.05, cutoff: 4000 }); tone({ type: 'square', f: 800, dur: 0.03, vol: 0.05, cutoff: 4000, at: 0.035 }); },
    tick: v => tone({ type: 'square', f: 600 + v * 1400, dur: 0.008, vol: 0.03, cutoff: 4000 }),
    open: () => seq([400, 800, 1200], (f, at) => tone({ type: 'square', f, dur: 0.02, vol: 0.045, cutoff: 4000, at }), 0.025),
    close: () => seq([1200, 800, 400], (f, at) => tone({ type: 'square', f, dur: 0.02, vol: 0.045, cutoff: 4000, at }), 0.025),
    menu: () => tone({ type: 'square', f: 1500, dur: 0.015, vol: 0.045, cutoff: 4000 }),
    grab: () => tone({ type: 'square', f: 500, dur: 0.025, vol: 0.05, cutoff: 3000 }),
    drop: () => tone({ type: 'square', f: 300, dur: 0.035, vol: 0.06, cutoff: 3000 }),
    success: () => seq([880, 1175, 1760], (f, at) => tone({ type: 'square', f, dur: 0.04, vol: 0.045, cutoff: 4000, at }), 0.05),
    error: () => tone({ type: 'square', f: 220, dur: 0.22, vol: 0.06, cutoff: 2500 }),
    warn: () => { tone({ type: 'square', f: 440, dur: 0.05, vol: 0.05, cutoff: 3000 }); tone({ type: 'square', f: 440, dur: 0.05, vol: 0.05, cutoff: 3000, at: 0.09 }); },
    notify: () => tone({ type: 'square', f: 1760, dur: 0.05, vol: 0.035, cutoff: 4000 }),
    switch: () => tone({ type: 'square', f: 600, f2: 2400, dur: 0.08, vol: 0.04, cutoff: 4000 }),
  } },
  frost: { name: 'Frost', desc: 'Crystalline ticks and icy chimes.', s: {
    click: () => { tone({ f: 2600, dur: 0.02, vol: 0.09, wet: 0.2 }); tone({ f: 5200, dur: 0.01, vol: 0.025 }); },
    select: () => tone({ f: 3100, dur: 0.02, vol: 0.08, wet: 0.2 }),
    on: () => tone({ f: 2600, f2: 3500, dur: 0.05, vol: 0.08, wet: 0.25 }),
    off: () => tone({ f: 3500, f2: 2600, dur: 0.05, vol: 0.07, wet: 0.25 }),
    tick: v => tone({ f: 3500 + v * 1500, dur: 0.006, vol: 0.04 }),
    open: () => fm({ f: 2637, ratio: 2, index: 0.3, dur: 0.35, vol: 0.06, wet: 0.5 }),
    close: () => fm({ f: 1976, ratio: 2, index: 0.3, dur: 0.25, vol: 0.05, wet: 0.45 }),
    menu: () => tone({ f: 3136, dur: 0.02, vol: 0.06, wet: 0.2 }),
    grab: () => tone({ f: 1568, dur: 0.03, vol: 0.08 }),
    drop: () => { tone({ f: 1175, dur: 0.05, vol: 0.08 }); noise({ ftype: 'lowpass', f: 600, dur: 0.03, vol: 0.06 }); },
    success: () => seq([1976, 2637, 3136], (f, at) => fm({ f, ratio: 2, index: 0.3, dur: 0.4, vol: 0.05, at, wet: 0.5 }), 0.07),
    error: () => { tone({ f: 392, dur: 0.2, vol: 0.07 }); tone({ f: 370, dur: 0.2, vol: 0.07 }); },
    warn: () => { tone({ f: 1568, dur: 0.05, vol: 0.07 }); tone({ f: 1568, dur: 0.05, vol: 0.07, at: 0.1 }); },
    notify: () => fm({ f: 3136, ratio: 2, index: 0.3, dur: 0.4, vol: 0.045, wet: 0.5 }),
    switch: () => { noise({ ftype: 'highpass', f: 6000, dur: 0.15, vol: 0.03, swell: 0.4 }); fm({ f: 2349, ratio: 2, index: 0.3, dur: 0.3, vol: 0.05, at: 0.04, wet: 0.5 }); },
  } },
  paper: { name: 'Paper & pencil', desc: 'Pencil taps, page turns and a rubber stamp.', s: {
    click: () => { tap(1800, { q: 3, dur: 0.01, vol: 0.26 }); tone({ f: 900, dur: 0.01, vol: 0.025 }); },
    select: () => tap(2400, { q: 3, dur: 0.009, vol: 0.22 }),
    on: () => { tap(3000, { q: 3, dur: 0.006, vol: 0.25 }); tap(3400, { q: 3, dur: 0.006, vol: 0.2, at: 0.03 }); },
    off: () => tap(2600, { q: 3, dur: 0.007, vol: 0.2 }),
    tick: () => tap(5000, { q: 2, dur: 0.006, vol: 0.07 }),
    open: () => whoosh(800, 3000, { dur: 0.22, vol: 0.1, q: 0.8 }),
    close: () => whoosh(2600, 900, { dur: 0.14, vol: 0.08, q: 0.8 }),
    menu: () => noise({ ftype: 'highpass', f: 3000, dur: 0.04, vol: 0.07, swell: 0.3 }),
    grab: () => noise({ ftype: 'lowpass', f: 2000, dur: 0.06, vol: 0.06, swell: 0.4 }),
    drop: () => noise({ ftype: 'lowpass', f: 500, dur: 0.04, vol: 0.22 }),
    success: () => { thump(150, { drop: 0.5, dur: 0.08, vol: 0.3 }); noise({ ftype: 'lowpass', f: 1500, dur: 0.03, vol: 0.16 }); },
    error: () => { for (let i = 0; i < 5; i++) tap(900 + Math.random() * 2500, { q: 0.8, dur: 0.02, vol: 0.12, at: i * 0.028 }); },
    warn: () => { tap(1800, { q: 3, vol: 0.24 }); tap(1800, { q: 3, vol: 0.24, at: 0.09 }); },
    notify: () => chime(2093, { vol: 0.04 }),
    switch: () => whoosh(700, 3200, { dur: 0.24, vol: 0.1, q: 0.7 }),
  } },
  classic: { name: 'Classic PC', desc: 'Relay clicks, a plain ding and the good old error chord.', s: {
    click: () => tap(2000, { q: 1.5, dur: 0.008, vol: 0.18 }),
    select: () => tap(2200, { q: 1.5, dur: 0.008, vol: 0.16 }),
    on: () => tone({ f: 1200, dur: 0.02, vol: 0.07 }),
    off: () => tone({ f: 900, dur: 0.02, vol: 0.07 }),
    tick: v => tone({ f: 1500 + v * 500, dur: 0.006, vol: 0.035 }),
    open: () => whoosh(700, 2400, { vol: 0.05, dur: 0.1 }),
    close: () => whoosh(2400, 700, { vol: 0.05, dur: 0.1 }),
    menu: () => tap(2500, { q: 1.5, dur: 0.006, vol: 0.14 }),
    grab: () => tap(1600, { q: 1.5, dur: 0.01, vol: 0.16 }),
    drop: () => tap(1100, { q: 1.5, dur: 0.012, vol: 0.2 }),
    success: () => chime(1046, { vol: 0.1, dur: 0.6 }),
    error: () => [523, 659, 784].forEach(f => tone({ f, dur: 0.35, vol: 0.06, a: 0.005 })),
    warn: () => { chime(784, { vol: 0.08 }); chime(1046, { vol: 0.08, at: 0.1 }); },
    notify: () => chime(1318, { vol: 0.06 }),
    switch: () => { tone({ f: 659, dur: 0.1, vol: 0.05 }); tone({ f: 988, dur: 0.1, vol: 0.04 }); },
  } },
  pop: { name: 'Pop', desc: 'Bouncy pops, plops and marimba notes.', s: {
    click: () => tone({ f: 400, f2: 1100, dur: 0.025, vol: 0.2 }),
    select: () => tone({ f: 500, f2: 1300, dur: 0.028, vol: 0.18 }),
    on: () => { tone({ f: 400, f2: 1200, dur: 0.03, vol: 0.18 }); tone({ f: 2000, dur: 0.04, vol: 0.05, at: 0.03 }); },
    off: () => tone({ f: 1100, f2: 400, dur: 0.04, vol: 0.16 }),
    tick: v => pluck(1200 + v * 1200, { dur: 0.015, vol: 0.05 }),
    open: () => { tone({ type: 'triangle', f: 330, f2: 660, dur: 0.1, vol: 0.13 }); tone({ type: 'triangle', f: 660, f2: 990, dur: 0.08, vol: 0.1, at: 0.06 }); },
    close: () => tone({ type: 'triangle', f: 660, f2: 330, dur: 0.1, vol: 0.12 }),
    menu: () => tone({ f: 700, f2: 1600, dur: 0.03, vol: 0.13 }),
    grab: () => tone({ type: 'triangle', f: 300, f2: 520, dur: 0.06, vol: 0.14 }),
    drop: () => tone({ f: 900, f2: 300, dur: 0.07, vol: 0.18 }),
    success: () => seq([784, 988, 1175, 1568], (f, at) => pluck(f, { at, dur: 0.12, vol: 0.12 }), 0.06),
    error: () => { tone({ f: 300, dur: 0.1, vol: 0.12 }); tone({ f: 250, dur: 0.12, vol: 0.12, at: 0.12 }); },
    warn: () => { tone({ f: 600, f2: 900, dur: 0.04, vol: 0.13 }); tone({ f: 600, f2: 900, dur: 0.04, vol: 0.13, at: 0.1 }); },
    notify: () => pluck(1318, { dur: 0.15, vol: 0.1 }),
    switch: () => tone({ type: 'triangle', f: 400, f2: 1200, dur: 0.15, vol: 0.1 }),
  } },
  typewriter: { name: 'Typewriter', desc: 'Key strikes, carriage ratchet and the margin bell (Film Noir).', s: {
    click: () => { tap(2200, { q: 1.2, dur: 0.015, vol: 0.38 }); thump(130, { dur: 0.03, vol: 0.2 }); tap(6000, { q: 3, dur: 0.004, vol: 0.08 }); },
    select: () => { tap(2600, { q: 1.2, dur: 0.012, vol: 0.3 }); thump(150, { dur: 0.025, vol: 0.14 }); },
    on: () => { tap(2200, { q: 1.2, dur: 0.015, vol: 0.34 }); thump(130, { dur: 0.03, vol: 0.18 }); tap(4500, { q: 6, dur: 0.004, vol: 0.12, at: 0.05 }); },
    off: () => { tap(1800, { q: 1.2, dur: 0.015, vol: 0.3 }); thump(110, { dur: 0.03, vol: 0.18 }); },
    tick: () => tap(4500, { q: 6, dur: 0.004, vol: 0.13 }),
    open: () => { noise({ ftype: 'lowpass', f: 600, f2: 2500, dur: 0.22, vol: 0.07, swell: 0.6 }); for (let i = 0; i < 4; i++) tap(4500, { q: 6, dur: 0.004, vol: 0.1, at: 0.03 + i * 0.04 }); },
    close: () => whoosh(1800, 900, { dur: 0.12, vol: 0.07 }),
    menu: () => tap(2800, { q: 1.2, dur: 0.01, vol: 0.24 }),
    grab: () => tap(2000, { q: 1.2, dur: 0.012, vol: 0.26 }),
    drop: () => { thump(120, { dur: 0.06, vol: 0.28 }); tap(1500, { q: 1, dur: 0.02, vol: 0.18 }); },
    success: () => chime(2637, { vol: 0.11, dur: 0.7, wet: 0.3 }),
    error: () => { tap(1600, { q: 1, dur: 0.02, vol: 0.4 }); thump(100, { vol: 0.25 }); tap(1600, { q: 1, dur: 0.02, vol: 0.4, at: 0.07 }); thump(100, { vol: 0.25, at: 0.07 }); },
    warn: () => chime(1760, { vol: 0.09, dur: 0.5 }),
    notify: () => chime(2637, { vol: 0.05 }),
    switch: () => { for (let i = 0; i < 6; i++) tap(4500, { q: 6, dur: 0.004, vol: 0.11, at: i * 0.025 }); chime(2637, { vol: 0.06, at: 0.16 }); },
  } },
  gta: { name: 'Grove Street', desc: 'Punchy menu blips, kicks and pager beeps.', s: {
    click: () => { tone({ f: 220, f2: 170, dur: 0.06, vol: 0.2 }); tap(5000, { q: 1, dur: 0.005, vol: 0.08 }); },
    select: () => tone({ type: 'triangle', f: 660, dur: 0.04, vol: 0.12 }),
    on: () => { tone({ type: 'triangle', f: 440, dur: 0.04, vol: 0.12 }); tone({ type: 'triangle', f: 660, dur: 0.05, vol: 0.12, at: 0.045 }); },
    off: () => { tone({ type: 'triangle', f: 660, dur: 0.04, vol: 0.11 }); tone({ type: 'triangle', f: 440, dur: 0.05, vol: 0.11, at: 0.045 }); },
    tick: v => tone({ type: 'triangle', f: 800 + v * 800, dur: 0.01, vol: 0.05 }),
    open: () => { tone({ f: 90, f2: 60, dur: 0.18, vol: 0.28 }); whoosh(500, 1800, { vol: 0.05, dur: 0.1 }); },
    close: () => { tone({ f: 70, f2: 95, dur: 0.12, vol: 0.22 }); },
    menu: () => tone({ type: 'triangle', f: 880, dur: 0.03, vol: 0.1 }),
    grab: () => tone({ type: 'triangle', f: 330, dur: 0.04, vol: 0.12 }),
    drop: () => tone({ f: 150, f2: 45, dur: 0.12, vol: 0.34 }),
    success: () => { [392, 494, 587].forEach(f => tone({ type: 'sawtooth', f, dur: 0.22, vol: 0.04, cutoff: 1800, cutoff2: 600 })); tone({ f: 150, f2: 45, dur: 0.12, vol: 0.3 }); },
    error: () => { tone({ type: 'square', f: 110, dur: 0.2, vol: 0.06, cutoff: 600 }); tone({ type: 'square', f: 104, dur: 0.2, vol: 0.05, cutoff: 600 }); },
    warn: () => { tone({ type: 'triangle', f: 523, dur: 0.05, vol: 0.12 }); tone({ type: 'triangle', f: 523, dur: 0.05, vol: 0.12, at: 0.09 }); },
    notify: () => { tone({ type: 'square', f: 2000, dur: 0.05, vol: 0.03, cutoff: 5000 }); tone({ type: 'square', f: 2000, dur: 0.05, vol: 0.03, cutoff: 5000, at: 0.09 }); },
    switch: () => noise({ f: 400, f2: 2400, q: 3, dur: 0.18, vol: 0.12, swell: 0.5 }),
  } },
  clear: { name: 'Clear', desc: 'Distinct, mid-range tones that are easy to tell apart.', s: {
    click: () => tone({ f: 1000, dur: 0.03, vol: 0.16 }),
    select: () => tone({ f: 1200, dur: 0.03, vol: 0.15 }),
    on: () => tone({ f: 800, f2: 1200, dur: 0.08, vol: 0.15 }),
    off: () => tone({ f: 1200, f2: 800, dur: 0.08, vol: 0.14 }),
    tick: v => tone({ f: 1000 + v * 800, dur: 0.01, vol: 0.07 }),
    open: () => tone({ f: 600, f2: 900, dur: 0.1, vol: 0.13 }),
    close: () => tone({ f: 900, f2: 600, dur: 0.1, vol: 0.12 }),
    menu: () => tone({ f: 1400, dur: 0.03, vol: 0.12 }),
    grab: () => tone({ f: 500, dur: 0.04, vol: 0.14 }),
    drop: () => tone({ f: 400, dur: 0.06, vol: 0.16 }),
    success: () => { tone({ f: 784, dur: 0.1, vol: 0.14 }); tone({ f: 1046, dur: 0.14, vol: 0.14, at: 0.1 }); },
    error: () => { tone({ f: 300, dur: 0.12, vol: 0.16 }); tone({ f: 300, dur: 0.12, vol: 0.16, at: 0.16 }); },
    warn: () => { tone({ f: 600, dur: 0.08, vol: 0.14 }); tone({ f: 600, dur: 0.08, vol: 0.14, at: 0.12 }); },
    notify: () => tone({ f: 1046, dur: 0.08, vol: 0.12 }),
    switch: () => tone({ f: 700, f2: 1000, dur: 0.1, vol: 0.12 }),
  } },
  dream: { name: 'Dream', desc: 'Slowed-down XP clicks and chimes drifting in a huge soft room — made for the Windows XP Dreamcore theme.', s: {
    click: () => { tap(1700, { q: 1.4, dur: 0.02, vol: 0.12 }); tone({ f: 523, dur: 0.14, vol: 0.05, haze: 0.5 }); },
    select: () => tone({ f: 659, dur: 0.16, vol: 0.06, haze: 0.55 }),
    on: () => tone({ f: 523, f2: 784, glide: 0.14, dur: 0.24, vol: 0.06, haze: 0.6 }),
    off: () => tone({ f: 784, f2: 523, glide: 0.14, dur: 0.24, vol: 0.06, haze: 0.6 }),
    tick: () => tap(2400, { q: 2, dur: 0.008, vol: 0.06 }),
    open: () => [262, 330, 392, 494].forEach((f, i) => tone({ f, dur: 1.1, vol: 0.035, swell: 0.45, at: i * 0.035, haze: 0.8 })),
    close: () => { whoosh(1400, 400, { vol: 0.04, dur: 0.4, haze: 0.6 }); tone({ f: 392, f2: 262, dur: 0.5, vol: 0.035, haze: 0.7 }); },
    menu: () => tone({ type: 'triangle', f: 587, dur: 0.12, vol: 0.08, cutoff: 2400, haze: 0.45 }),
    grab: () => tone({ type: 'triangle', f: 330, dur: 0.1, vol: 0.08, cutoff: 1500, haze: 0.4 }),
    drop: () => { thump(110, { vol: 0.14 }); tone({ f: 220, dur: 0.3, vol: 0.04, haze: 0.6 }); },
    success: () => { chime(988, { vol: 0.07, dur: 1, haze: 0.7 }); chime(1318, { vol: 0.06, dur: 1, at: 0.16, haze: 0.7 }); },
    error: () => { tone({ type: 'square', f: 294, dur: 0.35, vol: 0.025, cutoff: 900, haze: 0.6 }); tone({ type: 'square', f: 220, dur: 0.5, vol: 0.025, cutoff: 800, at: 0.2, haze: 0.7 }); },
    warn: () => chime(523, { vol: 0.08, dur: 1.2, haze: 0.7 }),
    notify: () => { chime(784, { vol: 0.05, dur: 0.9, haze: 0.7 }); chime(1175, { vol: 0.04, dur: 0.9, at: 0.12, haze: 0.7 }); },
    switch: () => { whoosh(600, 1800, { vol: 0.04, dur: 0.35, haze: 0.6 }); tone({ f: 392, f2: 523, glide: 0.2, dur: 0.4, vol: 0.04, haze: 0.7 }); },
  } },
};
/* Level corrections in dB so every pack sounds about as loud as "Soft" (measured with App.soundMeasure:
   loudest 30 ms window per sound; Minimal is deliberately 6 dB quieter). */
const TRIM = {
  soft: { menu: 2, error: 2 },
  glass: { on: 1, off: 1, tick: 3, close: -1, menu: -1, grab: -1, error: -3, switch: 2 },
  xp: { click: 13, select: 17, on: 10, off: 10, tick: 16, close: 16, menu: 15, grab: 18, drop: 1, success: -1, error: 3, warn: -4, notify: -3 },
  mech: { click: 1, select: 12, on: -4, off: -4, tick: 15, open: 13, close: -4, menu: 16, grab: 18, drop: -8, success: 2, error: 5, warn: -1, switch: -9 },
  minimal: { click: 5, select: 4, on: 5, off: 4, tick: 3, open: 5, close: 4, menu: 5, grab: 3, drop: 2, success: 4, warn: 1, notify: 2, switch: 2 },
  synth: { click: 4, select: 6, on: 10, off: 10, tick: 5, close: 5, menu: 9, grab: 10, drop: 8, success: 9, error: -2, warn: 6, notify: -2, switch: 6 },
  beep: { click: 11, select: 10, on: 10, off: 9, tick: 8, open: 9, close: 7, menu: 9, grab: 9, drop: 7, success: 10, error: 1, warn: 7, notify: 8, switch: 7 },
  dream: { click: 6, select: 4, on: 5, off: 4, tick: 22, close: 5, menu: 1, grab: 3, drop: -1, error: 7, warn: -4, switch: 4 },
  frost: { click: 7, select: 8, on: 6, off: 7, tick: 8, open: 4, close: 4, menu: 7, grab: 6, drop: 5, success: 4, error: -2, warn: 6, notify: 3, switch: 2 },
  paper: { click: 15, select: 20, on: 20, off: 20, tick: 16, open: 9, close: 8, menu: 4, grab: 13, drop: 14, success: -6, error: 15, warn: 16, notify: 2, switch: 7 },
  classic: { click: 20, select: 18, on: 10, off: 10, tick: 9, open: 20, close: 17, menu: 16, grab: 19, drop: 19, success: -2, error: -2, warn: -3, notify: -1, switch: 4 },
  pop: { on: 1, tick: 6, open: 2, drop: -3, success: 2, error: -1, warn: 1 },
  typewriter: { click: -1, select: 2, tick: 14, open: 12, close: 13, menu: 10, grab: 13, drop: -6, success: -3, error: -6, warn: -3 },
  gta: { click: -2, select: 4, on: 5, off: 5, tick: 7, open: -9, close: -8, menu: 4, grab: 3, drop: -10, success: -7, error: -3, warn: 3, notify: 9, switch: 13 },
  clear: { click: 2, select: 2, tick: 3, close: -1, drop: -1, success: -1, error: -4, warn: -2, notify: -2, switch: -2 },
};
const setTrim = (pack, name) => { trimGain = Math.pow(10, ((TRIM[pack] && TRIM[pack][name]) || 0) / 20); };
App.SOUND_PACKS = Object.entries(PACKS).map(([id, p]) => ({ id, name: p.name, desc: p.desc }));
/* each event belongs to a category the person can turn off */
App.SOUND_CATS = [
  { id: 'clicks', label: 'Buttons & tabs', tip: 'Clicking buttons, tabs, chips and menu items.', events: ['click', 'select', 'switch'] },
  { id: 'toggles', label: 'Switches', tip: 'Turning switches and checkboxes on or off.', events: ['on', 'off'] },
  { id: 'sliders', label: 'Sliders', tip: 'Soft ticks while you drag a slider (the pitch follows the value).', events: ['tick'] },
  { id: 'windows', label: 'Windows & menus', tip: 'Opening and closing dialogs, menus and pop-ups.', events: ['open', 'close', 'menu'] },
  { id: 'drag', label: 'Drag & drop', tip: 'Picking up and dropping clips, layers, files and panels.', events: ['grab', 'drop'] },
  { id: 'alerts', label: 'Notifications', tip: 'Success, warning and error messages.', events: ['success', 'error', 'warn', 'notify'] },
];
const CAT = {}; App.SOUND_CATS.forEach(c => c.events.forEach(e => { CAT[e] = c.id; }));
const PRI = { tick: 0, click: 1, select: 1, menu: 2, grab: 2, drop: 2, on: 2, off: 2, notify: 2, open: 3, close: 3, switch: 3, warn: 4, success: 4, error: 4 };

App.soundPackId = () => {
  const p = setting('soundPack', 'theme');
  return p === 'theme' || !PACKS[p] ? (App.themeById(setting('theme', 'dark')).pack || 'soft') : p;
};
const busy = () => (App.V && App.V.playing) || (App.A && (App.A.playing || App.A.recording));
let last = 0, lastPri = -1, lastTick = 0, lastTickV = -1;
/** Play a UI sound. force: ignore the on/off, category and quiet-while-playing settings (used by the test buttons). */
App.sound = (name, v = 0.5, { force = false, pack } = {}) => {
  if (!force) {
    if (!setting('sounds', true)) return;
    const cats = setting('soundCats', {});
    if (cats[CAT[name]] === false) return;
    if (setting('soundQuiet', true) && busy()) return;
    if (document.hidden) return;
  }
  const now = performance.now();
  if (name === 'tick') {
    if (now - lastTick < 42 || Math.abs(v - lastTickV) < 0.012) return;
    lastTick = now; lastTickV = v;
  } else {
    // one gesture can trigger several events (press → menu opens): keep only the most meaningful sound
    if (!force && now - last < 45 && (PRI[name] ?? 1) <= lastPri) return;
    last = now; lastPri = PRI[name] ?? 1;
  }
  if (!init()) return;
  if (ctx.state === 'suspended') ctx.resume();
  const id = PACKS[pack] ? pack : PACKS[App.soundPackId()] ? App.soundPackId() : 'soft', fn = PACKS[id].s[name];
  if (fn) try { setTrim(id, name); fn(Math.max(0, Math.min(1, v))); } catch (e) { console.warn('UI sound failed', e); }
};
App.on('setting', k => { if (k === 'soundVolume') setVolume(); });
/** Render one sound offline at the current volume and return its peak and RMS level in dBFS (used to keep the packs balanced). */
App.soundMeasure = async (pack, name, v = 0.5) => {
  if (!init() || !PACKS[pack] || !PACKS[pack].s[name]) return null;
  const live = { ctx, master, verbIn, hazeIn }, sr = ctx.sampleRate;
  const off = new OfflineAudioContext(2, Math.round(sr * 1.8), sr);
  ctx = off; master = off.createGain(); master.gain.value = live.master.gain.value; master.connect(off.destination);
  const verb = off.createConvolver(); verb.buffer = irBuf;
  verbIn = off.createGain(); verbIn.gain.value = 0.5; verbIn.connect(verb); verb.connect(master);
  hazeIn = makeHaze(off, master);
  try { setTrim(pack, name); PACKS[pack].s[name](v); } finally { ({ ctx, master, verbIn, hazeIn } = live); }
  const buf = await off.startRendering();
  let peak = 0, st = 0;
  const L = buf.getChannelData(0), R = buf.getChannelData(1), win = Math.round(sr * 0.03);
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  // short-term loudness: the loudest 30 ms window (closer to how loud a short click feels than its peak)
  for (let i = 0; i + win <= L.length; i += win >> 1) { let e = 0; for (let k = i; k < i + win; k++) e += L[k] * L[k] + R[k] * R[k]; st = Math.max(st, e / (2 * win)); }
  const db = x => 20 * Math.log10(Math.max(1e-9, x));
  return { peak: +db(peak).toFixed(1), st: +(10 * Math.log10(Math.max(1e-18, st))).toFixed(1) };
};

/* ---------- hooks: clicks, toggles, sliders, drag & drop ---------- */
const PRESS = 'button, .chip, .menu-item, .fx-btn, .tile, .media-item, .look, .layer, .doc-tab, .wf-step, .ptab, .hist-item, .pal-item, .exp-preset, .wl-card, .wlx [data-pick], .wlx [data-act], .section-head, .color-sw, .swatches .sw, .palette i, .brand, .theme-card, .pref-nav-item';
const SELECTISH = '.seg button, .tab, .chip, .ptab, .doc-tab, .wf-step, .look, .exp-preset, .tool-btn, .theme-card, .pref-nav-item, .hist-item, .layer';
document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !e.target.closest) return;
  const el = e.target.closest(PRESS);
  if (!el || el.disabled || el.classList.contains('disabled')) return;
  if (el.closest('.menubar') || el.closest('.switch') || el.matches('.tab') || el.dataset.silent != null) return;   // menus and editor tabs have their own sounds
  if (el.matches('.menu-item') && el.querySelector('.mi-sub')) return;
  App.sound(el.matches(SELECTISH) ? 'select' : 'click');
}, true);
document.addEventListener('change', e => {
  const t = e.target;
  if (t && t.type === 'checkbox') App.sound(t.checked ? 'on' : 'off');
}, true);
document.addEventListener('input', e => {
  const t = e.target;
  if (t && t.type === 'range' && e.isTrusted) App.sound('tick', (t.value - t.min) / ((t.max - t.min) || 1));
}, true);
document.addEventListener('dragstart', e => { if (e.isTrusted) App.sound('grab'); }, true);
document.addEventListener('drop', () => App.sound('drop'), true);
})();
