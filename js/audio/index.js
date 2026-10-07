/* Audio editor — multitrack waveform editor: selection editing, volume envelopes, markers,
   effects with live preview, loudness, recording, mixdown, autosave & project files */
(() => {
'use strict';
const App = window.App, D = App.dsp;
const { h, icon, btn, clamp } = App;
const A = App.A;
Object.assign(A, {
  tracks: [], sel: null, cursor: 0, playhead: 0, playing: false, loop: false, markers: [],
  pps: 60, scroll: 0, tool: 'select', undoStack: [], redoStack: [], clipboard: null, name: 'Untitled audio',
  noiseProfile: null, zeroSnap: !!App.settings.zeroSnapDefault, recording: null, version: 0, lastFx: null, sr: 48000, inputId: '', devices: [],
});
const HEAD = 210;
const COLORS = ['#35d6b4', '#5ab0ff', '#ffb547', '#ff6fae', '#a08aff', '#ff7849', '#8bd450'];
const MCOLORS = ['#ffc24b', '#35d6b4', '#ff7849', '#a08aff', '#5ab0ff', '#ff6fae'];
const COLOR_NAMES = { '#35d6b4': 'Teal', '#5ab0ff': 'Blue', '#ffb547': 'Amber', '#ff6fae': 'Pink', '#a08aff': 'Purple', '#ff7849': 'Orange', '#8bd450': 'Green', '#ffc24b': 'Yellow' };
const fmt = t => App.fmtTime(t);
const parseTime = s => {
  const parts = String(s).trim().split(':').map(Number);
  if (parts.some(isNaN)) return NaN;
  return parts.reduce((acc, v) => acc * 60 + v, 0);
};
const rgba = (hex, a) => { const [r, g, b] = App.hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

/* =====================================================================
   Model
   ===================================================================== */
A.trackLen = tr => tr.channels[0].length / A.sr;
A.trackEnd = tr => tr.offset + A.trackLen(tr);
A.duration = () => A.tracks.reduce((m, t) => Math.max(m, A.trackEnd(t)), 0);
A.selTracks = () => A.tracks.filter(t => t.selected);
A.targets = () => { const s = A.selTracks(); return s.length ? s : A.tracks.length === 1 ? A.tracks : A.sel ? A.tracks : []; };
A.newTrack = (channels, name, offset = 0) => {
  const tr = { id: App.uid('at'), name, channels, offset, gain: 0, pan: 0, mute: false, solo: false, selected: false, view: App.settings.audioView === 'spec' ? 'spec' : 'wave', color: COLORS[A.tracks.length % COLORS.length], h: 124, env: [] };
  A.tracks.push(tr);
  return tr;
};
A.sampleRange = (tr, t0, t1) => {
  const n = tr.channels[0].length;
  return [clamp(Math.round((t0 - tr.offset) * A.sr), 0, n), clamp(Math.round((t1 - tr.offset) * A.sr), 0, n)];
};
const concat = (...arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0), o = new Float32Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
const zeros = n => new Float32Array(Math.max(0, Math.round(n)));
const fitChannels = (chs, n) => {
  if (chs.length === n) return chs;
  if (n === 1) { const o = new Float32Array(chs[0].length); for (const c of chs) for (let i = 0; i < o.length; i++) o[i] += c[i] / chs.length; return [o]; }
  return Array.from({ length: n }, (_, i) => chs[Math.min(i, chs.length - 1)]);
};

/* ---------- volume envelope (points in track-local seconds, linear gain 0…2) ---------- */
A.envAt = (tr, lt) => {
  const E = tr.env;
  if (!E || !E.length) return 1;
  if (lt <= E[0].t) return E[0].g;
  if (lt >= E[E.length - 1].t) return E[E.length - 1].g;
  for (let i = 0; i < E.length - 1; i++) if (lt >= E[i].t && lt <= E[i + 1].t) return E[i].g + (E[i + 1].g - E[i].g) * (lt - E[i].t) / Math.max(1e-9, E[i + 1].t - E[i].t);
  return 1;
};
const envDelete = (tr, l0, l1) => { if (!tr.env || !tr.env.length) return; const d = l1 - l0; tr.env = tr.env.filter(p => p.t <= l0 || p.t >= l1).map(p => p.t >= l1 ? { ...p, t: p.t - d } : p); };
const envInsert = (tr, l, len) => { if (!tr.env || !tr.env.length) return; tr.env = tr.env.map(p => p.t >= l ? { ...p, t: p.t + len } : p); };
const envScale = (tr, l0, l1, newLen) => {
  if (!tr.env || !tr.env.length) return;
  const k = newLen / Math.max(1e-9, l1 - l0), d = newLen - (l1 - l0);
  tr.env = tr.env.map(p => p.t <= l0 ? p : p.t >= l1 ? { ...p, t: p.t + d } : { ...p, t: l0 + (p.t - l0) * k });
};

/* ---------- undo ---------- */
const snap = () => ({ tracks: A.tracks.map(t => ({ ...t, env: (t.env || []).map(p => ({ ...p })), _cv: null, _buf: null, _spec: null })), sel: A.sel && { ...A.sel }, cursor: A.cursor, markers: A.markers.map(m => ({ ...m })) });
A.commit = label => {
  A.undoStack.push({ s: snap(), label });
  while (A.undoStack.length > App.undoLimit(80)) A.undoStack.shift();
  A.redoStack.length = 0;
};
const restore = s => { A.stop(); A.tracks = s.tracks.map(t => ({ ...t })); A.sel = s.sel; A.cursor = s.cursor; A.markers = s.markers || []; A.changed(); };
A.undo = () => { const e = A.undoStack.pop(); if (!e) return App.toast('Nothing to undo'); A.redoStack.push({ s: snap(), label: e.label }); restore(e.s); App.toast('Undo · ' + e.label); };
A.redo = () => { const e = A.redoStack.pop(); if (!e) return App.toast('Nothing to redo'); A.undoStack.push({ s: snap(), label: e.label }); restore(e.s); App.toast('Redo · ' + e.label); };

/* ---------- edit primitives (return new arrays — never mutate in place) ---------- */
function insertAt(tr, t, clip) {
  clip = fitChannels(clip, tr.channels.length);
  const pos = Math.round((t - tr.offset) * A.sr), n = tr.channels[0].length, len = clip[0].length;
  if (pos < 0) { tr.channels = tr.channels.map((c, i) => concat(clip[i], zeros(-pos), c)); envInsert(tr, 0, (len - pos) / A.sr); tr.offset = t; }
  else if (pos > n) tr.channels = tr.channels.map((c, i) => concat(c, zeros(pos - n), clip[i]));
  else { tr.channels = tr.channels.map((c, i) => concat(c.subarray(0, pos), clip[i], c.subarray(pos))); envInsert(tr, pos / A.sr, len / A.sr); }
}
function deleteRange(tr, t0, t1) {
  const [s0, s1] = A.sampleRange(tr, t0, t1);
  if (s1 > s0) { tr.channels = tr.channels.map(c => concat(c.subarray(0, s0), c.subarray(s1))); envDelete(tr, s0 / A.sr, s1 / A.sr); }
  if (tr.offset >= t1) tr.offset -= (t1 - t0);
  else if (tr.offset > t0) tr.offset = t0;
  if (!tr.channels[0].length) tr.channels = tr.channels.map(() => zeros(1));
}
function replaceSeg(tr, s0, s1, out, mixTail) {
  const len = s1 - s0;
  if (mixTail && out[0].length > len) {
    const n = tr.channels[0].length, extra = out[0].length - len, newN = Math.max(n, s1 + extra);
    tr.channels = tr.channels.map((c, i) => {
      const o = new Float32Array(newN); o.set(c);
      o.set(out[i].subarray(0, len), s0);
      for (let k = 0; k < extra; k++) o[s1 + k] += out[i][len + k];
      return o;
    });
  } else {
    if (out[0].length !== len) envScale(tr, s0 / A.sr, s1 / A.sr, out[0].length / A.sr);
    tr.channels = tr.channels.map((c, i) => concat(c.subarray(0, s0), out[i], c.subarray(s1)));
  }
}
const zeroCross = (tr, t) => {
  const d = tr.channels[0], c = Math.round((t - tr.offset) * A.sr), w = Math.round(A.sr * 0.01);
  for (let k = 0; k < w; k++) for (const i of [c + k, c - k]) if (i > 0 && i < d.length && (d[i - 1] <= 0) !== (d[i] <= 0)) return tr.offset + i / A.sr;
  return t;
};

/* =====================================================================
   Edit operations
   ===================================================================== */
const needSel = () => { if (!A.sel) { App.toast('Select a region first — drag across a waveform'); return false; } if (!A.targets().length) { App.toast('Click a track to select it'); return false; } return true; };
A.ops = {
  copy() {
    if (!needSel()) return;
    A.clipboard = A.targets().map(tr => { const [s0, s1] = A.sampleRange(tr, A.sel.t0, A.sel.t1); return tr.channels.map(c => c.slice(s0, s1)); });
    App.toast(`Copied ${fmt(A.sel.t1 - A.sel.t0)}`);
  },
  cut() { if (!needSel()) return; A.ops.copy(); A.ops.del('Cut'); },
  del(label = 'Delete') {
    if (!needSel()) return;
    A.commit(label);
    const len = A.sel.t1 - A.sel.t0;
    for (const tr of A.targets()) deleteRange(tr, A.sel.t0, A.sel.t1);
    A.cursor = A.playhead = A.sel.t0; A.sel = null;
    A.changed();
    App.toast(`${label === 'Cut' ? 'Cut' : 'Deleted'} ${fmt(len)}`, '', 3500, { label: 'Undo', fn: A.undo });
  },
  paste() {
    if (!A.clipboard) return App.toast('Clipboard is empty');
    A.commit('Paste');
    const at = A.sel ? A.sel.t0 : A.cursor;
    const tgs = A.selTracks();
    if (A.sel) for (const tr of tgs) deleteRange(tr, A.sel.t0, A.sel.t1);
    let len = 0;
    A.clipboard.forEach((clip, i) => {
      let tr = tgs[i];
      if (!tr) { tr = A.newTrack(clip.map(c => c.slice()), 'Pasted audio', at); tr.selected = true; }
      else insertAt(tr, at, clip);
      len = Math.max(len, clip[0].length / A.sr);
    });
    A.sel = { t0: at, t1: at + len };
    A.changed();
  },
  silence() {
    if (!needSel()) return;
    A.commit('Silence');
    for (const tr of A.targets()) { const [s0, s1] = A.sampleRange(tr, A.sel.t0, A.sel.t1); replaceSeg(tr, s0, s1, tr.channels.map(() => zeros(s1 - s0))); }
    A.changed();
  },
  trim() {
    if (!needSel()) return;
    A.commit('Trim to selection');
    for (const tr of A.targets()) {
      const [s0, s1] = A.sampleRange(tr, A.sel.t0, A.sel.t1);
      if (s1 <= s0) continue;
      tr.channels = tr.channels.map(c => c.slice(s0, s1));
      if (tr.env && tr.env.length) tr.env = tr.env.map(p => ({ ...p, t: p.t - s0 / A.sr })).filter(p => p.t >= -0.5 && p.t <= (s1 - s0) / A.sr + 0.5);
      tr.offset += s0 / A.sr;
    }
    A.changed();
  },
  duplicate(split = false) {
    if (!needSel()) return;
    A.commit(split ? 'Split to new track' : 'Duplicate to new track');
    for (const tr of A.targets().slice()) {
      const [s0, s1] = A.sampleRange(tr, A.sel.t0, A.sel.t1);
      if (s1 <= s0) continue;
      const nt = A.newTrack(tr.channels.map(c => c.slice(s0, s1)), tr.name + (split ? ' (split)' : ' (copy)'), tr.offset + s0 / A.sr);
      nt.gain = tr.gain; nt.pan = tr.pan;
      if (split) replaceSeg(tr, s0, s1, tr.channels.map(() => zeros(s1 - s0)));
    }
    A.changed();
  },
  async insertSilence() {
    const v = await App.prompt('Insert silence', 'Length in seconds (inserted at the cursor on selected tracks)', '1.0');
    const d = parseFloat(v);
    if (!(d > 0)) return;
    const tgs = A.targets();
    if (!tgs.length) return App.toast('Select a track first');
    A.commit('Insert silence');
    for (const tr of tgs) insertAt(tr, A.cursor, tr.channels.map(() => zeros(d * A.sr)));
    A.changed();
  },
  selectAll() { A.tracks.forEach(t => t.selected = true); const d = A.duration(); A.sel = d ? { t0: 0, t1: d } : null; A.redraw(); A.renderHeads(); },
  selectNone() { A.sel = null; A.redraw(); },
  addMarker() {
    A.commit('Add marker');
    const n = A.markers.length + 1, color = MCOLORS[A.markers.length % MCOLORS.length];
    if (A.sel && A.sel.t1 - A.sel.t0 > 0.01) A.markers.push({ id: App.uid('mk'), t: A.sel.t0, t1: A.sel.t1, label: 'Region ' + n, color });
    else A.markers.push({ id: App.uid('mk'), t: A.playhead, label: 'Marker ' + n, color });
    A.markers.sort((a, b) => a.t - b.t);
    A.changed();
  },
  clearEnvelope() {
    const tgs = A.targets().filter(t => t.env && t.env.length);
    if (!tgs.length) return App.toast('No volume envelopes on the selected tracks');
    A.commit('Clear envelope');
    tgs.forEach(t => t.env = []);
    A.changed();
  },
  applyEnvelope() {
    const tgs = A.targets().filter(t => t.env && t.env.length);
    if (!tgs.length) return App.toast('No volume envelopes on the selected tracks');
    A.commit('Apply envelope');
    for (const tr of tgs) {
      tr.channels = tr.channels.map(c => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] * A.envAt(tr, i / A.sr); return o; });
      tr.env = [];
    }
    A.changed();
    App.toast('Envelope baked into the audio', 'ok');
  },
};

/* ---------- remove silences ---------- */
/** Removes (or mutes) timeline regions from one track in a single pass, with short fades at every join. */
function cutRegions(tr, regions, mute) {
  const n = tr.channels[0].length, fadeN = Math.round(A.sr * 0.004);
  const ranges = [];
  let before = 0;   // timeline seconds removed before the track starts
  for (const r of regions) {
    if (r.t1 <= tr.offset) { before += r.t1 - r.t0; continue; }
    if (r.t0 < tr.offset) before += tr.offset - r.t0;
    const [s0, s1] = A.sampleRange(tr, r.t0, r.t1);
    if (s1 > s0) ranges.push([s0, s1]);
  }
  if (mute) {
    tr.channels = tr.channels.map(c => {
      const o = c.slice();
      for (const [s0, s1] of ranges) {
        for (let i = s0; i < s1; i++) o[i] = 0;
        for (let k = 0; k < fadeN; k++) { const g = k / fadeN; if (s0 - fadeN + k >= 0) o[s0 - fadeN + k] *= 1 - g; if (s1 + k < n) o[s1 + k] *= g; }
      }
      return o;
    });
    return;
  }
  const removed = ranges.reduce((s, [a, b]) => s + b - a, 0), keepLen = Math.max(1, n - removed);
  tr.channels = tr.channels.map(c => {
    const o = new Float32Array(keepLen), joins = [];
    let w = 0, from = 0;
    for (const [s0, s1] of ranges) { o.set(c.subarray(from, s0), w); w += s0 - from; joins.push(w); from = s1; }
    o.set(c.subarray(from, n), w);
    for (const j of joins) {   // 4 ms fade out before each join and fade in after it → no clicks
      if (j <= 0 || j >= keepLen) continue;
      for (let k = 0; k < fadeN; k++) { const g = k / fadeN; if (j - 1 - k >= 0) o[j - 1 - k] *= g; if (j + k < keepLen) o[j + k] *= g; }
    }
    return o;
  });
  for (const [s0, s1] of [...ranges].reverse()) envDelete(tr, s0 / A.sr, s1 / A.sr);
  tr.offset = Math.max(0, tr.offset - before);
}
A.removeSilences = () => {
  const tgs = A.targets().length ? A.targets() : A.tracks;
  if (!tgs.length) return App.toast('Import or record some audio first', 'warn');
  const t0 = A.sel ? A.sel.t0 : Math.min(...tgs.map(t => t.offset)), t1 = A.sel ? A.sel.t1 : Math.max(...tgs.map(A.trackEnd));
  const src = list => list.map(t => ({ chs: t.channels, sr: A.sr, start: t.offset, dur: A.trackLen(t), srcStart: 0, speed: 1, gain: t.mute ? 0 : App.dbToGain(t.gain || 0) }));
  const cache = {};
  App.silenceDialog({
    title: 'Remove silences',
    hint: `Finds the pauses ${A.sel ? 'inside your selection' : 'in the whole recording'} on ${tgs.length > 1 ? tgs.length + ' tracks — they are cut together, so everything stays in sync' : '“' + tgs[0].name + '”'}. Every cut gets a tiny fade so there are no clicks.`,
    sources: [{ value: 'mix', label: tgs.length > 1 ? 'All these tracks together' : tgs[0].name }, ...(tgs.length > 1 ? tgs.map(t => ({ value: t.id, label: 'Only “' + t.name + '”' })) : [])],
    analyze: v => cache[v] || (cache[v] = { levels: D.levels(src(v === 'mix' ? tgs : tgs.filter(t => t.id === v)), t0, t1, 0.01), hop: 0.01, t0, t1 }),
    apply: (regions, p) => {
      const label = { delete: 'Remove silences', shorten: 'Shorten pauses', mute: 'Mute silences', mark: 'Mark silences' }[p.action];
      A.commit(label);
      const asc = regions.slice().sort((a, b) => a.t0 - b.t0);
      if (p.action === 'mark') {
        asc.forEach((r, i) => A.markers.push({ id: App.uid('mk'), t: r.t0, t1: r.t1, label: 'Silence ' + (i + 1), color: '#ff6fae' }));
        A.markers.sort((a, b) => a.t - b.t);
      } else {
        for (const tr of tgs) cutRegions(tr, asc, p.action === 'mute');
        if (p.action !== 'mute') {
          for (const r of [...asc].reverse()) {
            const len = r.t1 - r.t0;
            for (const m of A.markers) { if (m.t >= r.t1) m.t -= len; else if (m.t > r.t0) m.t = r.t0; if (m.t1 != null) { if (m.t1 >= r.t1) m.t1 -= len; else if (m.t1 > r.t0) m.t1 = r.t0; } }
          }
          A.markers = A.markers.filter(m => m.t1 == null || m.t1 - m.t > 0.01);
          if (A.sel) A.sel = { t0: A.sel.t0, t1: Math.max(A.sel.t0 + 0.01, A.sel.t1 - p.removed) };
          A.cursor = A.playhead = Math.min(A.cursor, A.duration());
        }
      }
      A.changed();
      const n = regions.length;
      App.toast(p.action === 'mark' ? `Marked ${n} silence${n === 1 ? '' : 's'}` : p.action === 'mute' ? `Muted ${n} silence${n === 1 ? '' : 's'}` : `${p.action === 'shorten' ? 'Shortened' : 'Removed'} ${n} silence${n === 1 ? '' : 's'} · ${p.removed.toFixed(1)} s shorter`, 'ok', 5000, { label: 'Undo', fn: A.undo });
    },
  });
};

/* ---------- effects ---------- */
/** the right hint when there is nothing to work on */
const needTarget = (msg = 'Select a track (click its name) or a region first') => App.toast(A.tracks.length ? msg : 'Import or record some audio first', 'warn');
A.applyFx = async (fx, params = {}) => {
  const tgs = A.targets();
  if (!tgs.length) return needTarget('Select a track or region first');
  const t0 = A.sel ? A.sel.t0 : -Infinity, t1 = A.sel ? A.sel.t1 : Infinity;
  A.busy(true, fx.name + '…');
  await new Promise(r => setTimeout(r, 30));
  const snapBefore = snap();
  let done = 0;
  try {
    for (const tr of tgs) {
      const [s0, s1] = A.sampleRange(tr, t0, t1);
      if (s1 - s0 < 32) continue;
      const seg = tr.channels.map(c => c.slice(s0, s1));
      const out = await fx.run(seg, A.sr, params, { tr, s0, s1 });
      replaceSeg(tr, s0, s1, fitChannels(out, tr.channels.length), fx.tail);
      if (fx.lengthy && A.sel) A.sel.t1 = A.sel.t0 + out[0].length / A.sr;
      done++;
    }
    if (done) {
      A.undoStack.push({ s: snapBefore, label: fx.name }); A.redoStack.length = 0;
      A.lastFx = { fx, params };
      App.toast(`${fx.name} applied`, 'ok', 3000, { label: 'Undo', fn: A.undo });
    } else App.toast('Selection is too short or outside the track', 'warn');
  } catch (e) {
    // tracks processed before the error stay changed — keep them undoable
    if (done) { A.undoStack.push({ s: snapBefore, label: fx.name }); A.redoStack.length = 0; }
    App.toast(e.message || String(e), 'err', 5000);
  }
  A.busy(false);
  A.changed();
};
A.repeatLast = () => { if (!A.lastFx) return App.toast('No effect used yet'); A.applyFx(A.lastFx.fx, A.lastFx.params); };

/* =====================================================================
   Playback
   ===================================================================== */
const trackBuffer = tr => {
  if (tr._buf && tr._bufFor === tr.channels[0]) return tr._buf;
  const b = new AudioBuffer({ length: Math.max(1, tr.channels[0].length), numberOfChannels: tr.channels.length, sampleRate: A.sr });
  tr.channels.forEach((c, i) => b.copyToChannel(c, i));
  tr._buf = b; tr._bufFor = tr.channels[0];
  return b;
};
A.ensureMaster = () => {
  if (A.master) return;
  const ac = App.ac();
  A.master = ac.createGain();
  A.anSpec = ac.createAnalyser(); A.anSpec.fftSize = 4096; A.anSpec.smoothingTimeConstant = 0.75;
  const split = ac.createChannelSplitter(2);
  A.anL = ac.createAnalyser(); A.anR = ac.createAnalyser(); A.anL.fftSize = A.anR.fftSize = 1024;
  A.master.connect(A.anSpec); A.master.connect(split); split.connect(A.anL, 0); split.connect(A.anR, 1);
  A.master.connect(ac.destination);
};
const audible = () => { const solo = A.tracks.some(t => t.solo); return A.tracks.filter(t => !t.mute && (!solo || t.solo)); };
/** connect a track into ctx with gain/pan and the envelope automation, starting at timeline time t0 (ctx time `when`) */
function scheduleTrack(ctx, dest, tr, t0, when, tEnd) {
  const end = Math.min(tEnd, A.trackEnd(tr));
  if (end <= t0 || tr.offset >= tEnd) return null;
  const src = ctx.createBufferSource(); src.buffer = trackBuffer(tr);
  const g = ctx.createGain();
  const base = App.dbToGain(tr.gain);
  const startT = Math.max(t0, tr.offset);
  const at = lt => when + (tr.offset + lt - t0);
  if (tr.env && tr.env.length) {
    const lt0 = startT - tr.offset;
    g.gain.setValueAtTime(base * A.envAt(tr, lt0), Math.max(0, at(lt0)));
    for (const p of tr.env) if (p.t > lt0 && tr.offset + p.t < end) g.gain.linearRampToValueAtTime(base * p.g, at(p.t));
  } else g.gain.value = base;
  const p = ctx.createStereoPanner(); p.pan.value = tr.pan;
  src.connect(g).connect(p).connect(dest);
  src.start(Math.max(ctx.currentTime, when + (startT - t0)), startT - tr.offset, end - startT);
  return { src, g, p, tr };
}
let nodes = [];
const stopNodes = () => { for (const n of nodes) { try { n.src.stop(); } catch {} try { n.src.disconnect(); } catch {} } nodes = []; };
function startNodes(t0, tEnd) {
  stopNodes();
  const ac = App.ac(); A.ensureMaster();
  const when = ac.currentTime + 0.05;
  for (const tr of audible()) { const n = scheduleTrack(ac, A.master, tr, t0, when, tEnd); if (n) nodes.push(n); }
  A.clock = { ctx0: when, t0, end: tEnd };
}
A.updateLive = () => {
  if (!A.playing) return;
  if (nodes.some(n => n.tr.env && n.tr.env.length) || A.tracks.some(t => t.solo) !== A._soloWas) { A._soloWas = A.tracks.some(t => t.solo); return A.seek(A.playhead); }
  const solo = A.tracks.some(t => t.solo);
  for (const n of nodes) { n.g.gain.value = (n.tr.mute || (solo && !n.tr.solo)) ? 0 : App.dbToGain(n.tr.gain); n.p.pan.value = n.tr.pan; }
};
A.play = (from) => {
  if (!A.tracks.length) return;
  const d = A.duration();
  let t0, tEnd;
  if (from != null) { t0 = from; tEnd = d; }
  else if (A.sel && A.sel.t1 - A.sel.t0 > 0.01) { t0 = (A.playhead > A.sel.t0 && A.playhead < A.sel.t1 - 0.05) ? A.playhead : A.sel.t0; tEnd = A.sel.t1; }
  else { t0 = A.playhead >= d - 0.01 ? 0 : A.playhead; tEnd = d; }
  A.playStart = t0;
  A._soloWas = A.tracks.some(t => t.solo);
  startNodes(t0, tEnd);
  A.playing = true;
  A.onPlayState();
  requestAnimationFrame(tick);
};
A.pause = () => { if (!A.playing) return; stopNodes(); A.playing = false; A.onPlayState(); A.placeLines(); };
A.stop = () => { if (A.recording) A.stopRecord(); const was = A.playing; A.pause(); if (was && A.playStart != null) { A.playhead = A.playStart; A.placeLines(); } };
A.toggle = () => (A.playing ? A.pause() : A.play());
A.seek = t => { A.playhead = A.cursor = Math.max(0, t); if (A.playing) { const end = A.clock.end; startNodes(A.playhead, end); } A.placeLines(); };
function tick() {
  if (!A.playing) return;
  const ac = App.ac();
  let t = A.clock.t0 + Math.max(0, ac.currentTime - A.clock.ctx0);
  if (t >= A.clock.end) {
    if (A.loop && !A.recording) { startNodes(A.sel ? A.sel.t0 : 0, A.clock.end); t = A.clock.t0; }
    else if (!A.recording) { A.playhead = A.clock.end; A.pause(); return; }
  }
  A.playhead = t;
  const vis = A.laneW / A.pps;
  if (t > A.scroll + vis * 0.95 || t < A.scroll) { A.scroll = Math.max(0, t - vis * 0.05); A.redraw(); }
  A.placeLines();
  requestAnimationFrame(tick);
}

/* ---------- recording ---------- */
A.refreshDevices = async () => {
  try { A.devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch { A.devices = []; }
};
/* Raw PCM capture (lossless, sample-accurate — no MediaRecorder/Opus round trip). An AudioWorklet hands over blocks of
   samples while you record, so the new track's waveform is drawn live; ScriptProcessor is the fallback. */
const CAPTURE_WORKLET = `class StrataCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = null; this.n = 0; this.size = 2048; this.on = true; this.port.onmessage = e => { if (e.data === 'stop') { this.flush(); this.port.postMessage('done'); this.on = false; } }; }
  flush() { if (this.buf && this.n) { this.port.postMessage(this.buf.map(b => b.slice(0, this.n))); } this.buf = null; this.n = 0; }
  process(inputs) {
    const inp = inputs[0];
    if (!this.on) return false;
    if (!inp || !inp.length) return true;
    const ch = Math.min(2, inp.length);
    if (!this.buf || this.buf.length !== ch) { this.flush(); this.buf = Array.from({ length: ch }, () => new Float32Array(this.size)); }
    const len = inp[0].length;
    for (let c = 0; c < ch; c++) this.buf[c].set(inp[c], this.n);
    this.n += len;
    if (this.n + 128 > this.size) this.flush();
    return true;
  }
}
registerProcessor('strata-capture', StrataCapture);`;
let workletReady = null;
const loadCaptureWorklet = ac => workletReady || (workletReady = ac.audioWorklet
  ? ac.audioWorklet.addModule(URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }))).catch(e => { workletReady = null; throw e; })
  : Promise.reject(new Error('no AudioWorklet')));
const PEAK = 256;   // samples per live-waveform peak bucket (≈5 ms)
function addCaptured(R, block) {
  if (!R.nCh) R.nCh = block.length;
  const n = block[0].length;
  for (let c = 0; c < R.nCh; c++) R.chunks[c].push(block[Math.min(c, block.length - 1)]);
  // peaks for the live lane: min/max per PEAK samples, all channels folded together
  for (let i = 0; i < n; i++) {
    let v0 = 0; for (let c = 0; c < block.length; c++) { const v = block[c][i]; if (Math.abs(v) > Math.abs(v0)) v0 = v; }
    if (v0 > R.pkHi) R.pkHi = v0; if (v0 < R.pkLo) R.pkLo = v0;
    if (++R.pkN === PEAK) { R.peaks.push(R.pkLo, R.pkHi); R.pkLo = 0; R.pkHi = 0; R.pkN = 0; }
  }
  R.length += n;
}
A.record = async () => {
  if (A.recording) return A.stopRecord();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return App.toast('Recording needs a secure page (localhost or https) and a microphone', 'err');
  let stream;
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } };
  if (A.inputId) audio.deviceId = { exact: A.inputId };
  try { stream = await navigator.mediaDevices.getUserMedia({ audio }); }
  catch (e) { return App.toast('Microphone access was denied or is unavailable', 'err', 4000); }
  A.refreshDevices();
  const ac = App.ac();
  if (ac.state === 'suspended') await ac.resume();
  const srcNode = ac.createMediaStreamSource(stream);
  const split = ac.createChannelSplitter(2);
  const inL = ac.createAnalyser(), inR = ac.createAnalyser();
  srcNode.connect(split); split.connect(inL, 0); try { split.connect(inR, 1); } catch { srcNode.connect(inR); }
  const t0 = A.sel ? A.sel.t0 : A.playhead;
  const R = { stream, t0, inL, inR, srcNode, started: performance.now(), chunks: [[], []], nCh: 0, length: 0, peaks: [], pkLo: 0, pkHi: 0, pkN: 0, track: 'Recording ' + (A.tracks.filter(t => t.name.startsWith('Recording')).length + 1) };
  // capture node → silent gain → destination (keeps it pulled by the graph without monitoring the mic)
  const sink = ac.createGain(); sink.gain.value = 0; sink.connect(ac.destination);
  try {
    await loadCaptureWorklet(ac);
    const micCh = Math.min(2, Math.max(1, (stream.getAudioTracks()[0].getSettings() || {}).channelCount || 2));   // mono mics stay mono
    const node = new AudioWorkletNode(ac, 'strata-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: micCh, channelCountMode: 'explicit' });
    node.port.onmessage = e => { if (e.data === 'done') { R.onFlush && R.onFlush(); return; } if (A.recording === R || R.finishing) addCaptured(R, e.data); };
    srcNode.connect(node); node.connect(sink);
    R.node = node;
  } catch {
    const sp = ac.createScriptProcessor(2048, 2, 1);
    sp.onaudioprocess = e => { if (A.recording !== R) return; const b = e.inputBuffer; addCaptured(R, Array.from({ length: Math.min(2, b.numberOfChannels) }, (_, i) => b.getChannelData(i).slice())); };
    srcNode.connect(sp); sp.connect(sink);
    R.node = sp;
  }
  R.sink = sink;
  A.recording = R;
  if (el.empty.isConnected) el.empty.remove();
  el.tracks.append(liveRow(R));
  if (A.tracks.length) A.play(t0);
  else { A.playing = true; A.clock = { ctx0: ac.currentTime, t0, end: Infinity }; A.onPlayState(); requestAnimationFrame(tick); }
  A.onRecState();
  App.toast('Recording… press R or Stop to finish');
};
A.stopRecord = async () => {
  const R = A.recording;
  if (!R) return;
  R.finishing = true;
  A.recording = null;
  // let the worklet hand over its last partial block before tearing the graph down
  if (R.node instanceof AudioWorkletNode) { await new Promise(res => { R.onFlush = res; R.node.port.postMessage('stop'); setTimeout(res, 300); }); }
  R.stream.getTracks().forEach(t => t.stop());
  for (const n of [R.srcNode, R.node, R.sink]) { try { n.disconnect(); } catch {} }
  A.pause();
  A.onRecState();
  if (!R.length) { A.changed(true); return App.toast('Nothing was recorded — check the microphone', 'warn'); }
  const chs = Array.from({ length: R.nCh || 1 }, (_, c) => concat(...R.chunks[c]));
  A.commit('Record');
  const tr = A.newTrack(chs, R.track, R.t0);
  A.tracks.forEach(t => t.selected = false); tr.selected = true;
  A.changed();
  App.toast(`Recorded ${fmt(R.length / A.sr)}`, 'ok', 3500, { label: 'Undo', fn: A.undo });
};
/* ---------- the live lane shown while recording ---------- */
function liveRow(R) {
  const cv = h('canvas');
  const info = h('div', { class: 'at-info' }, 'Listening…');
  const row = h('div', { class: 'a-track a-live', style: { height: '124px', '--tc': '#ff5d6c' } },
    h('div', { class: 'a-thead' }, h('div', { class: 'at-top' }, h('div', { class: 'at-name' }, h('i', { class: 'live-dot' }), R.track)), info),
    h('div', { class: 'a-lane' }, cv));
  R.liveEl = row; R.liveCv = cv; R.liveInfo = info;
  return row;
}
function drawLive() {
  const R = A.recording;
  if (!R || !R.liveCv || !R.liveCv.isConnected) return;
  const cv = R.liveCv, dpr = App.fitCanvas(cv), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, ppd = A.pps * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  const x0 = (R.t0 - A.scroll) * ppd, x1 = (R.t0 + R.length / A.sr - A.scroll) * ppd;
  ctx.fillStyle = 'rgba(255,93,108,.09)'; ctx.fillRect(Math.max(0, x0), 0, Math.min(W, x1) - Math.max(0, x0), H);
  const mid = H / 2, amp = H / 2 * 0.9, P = R.peaks, nb = P.length / 2, bucketsPerPx = A.sr / PEAK / ppd;
  ctx.fillStyle = `rgba(${App.th.ink},.08)`; ctx.fillRect(Math.max(0, x0), Math.round(mid), Math.max(0, Math.min(W, x1) - Math.max(0, x0)), dpr);
  ctx.fillStyle = '#ff5d6c';
  for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
    const b0 = Math.floor((x - x0) * bucketsPerPx), b1 = Math.max(b0 + 1, Math.floor((x + 1 - x0) * bucketsPerPx));
    let lo = 0, hi = 0;
    for (let b = b0; b < Math.min(nb, b1); b++) { if (P[b * 2] < lo) lo = P[b * 2]; if (P[b * 2 + 1] > hi) hi = P[b * 2 + 1]; }
    if (b0 >= nb) break;
    const ya = mid - hi * amp, yb = mid - lo * amp;
    ctx.fillRect(x, ya, 1, Math.max(dpr, yb - ya));
  }
  if (x0 >= 0 && x0 <= W) { ctx.fillStyle = 'rgba(255,93,108,.8)'; ctx.fillRect(x0, 0, dpr, H); }
  R.liveInfo.textContent = `${R.nCh === 1 ? 'Mono' : R.nCh === 2 ? 'Stereo' : '…'} · ${(A.sr / 1000).toFixed(1)} kHz · ${fmt(R.length / A.sr)}`;
}

/* ---------- mixdown / export ---------- */
A.mixdown = async (t0, t1, nCh = 2) => {
  const len = Math.max(1, Math.ceil((t1 - t0) * A.sr));
  const oac = new OfflineAudioContext(nCh, len, A.sr);
  for (const tr of audible()) scheduleTrack(oac, oac.destination, tr, t0, 0, t1);
  return oac.startRendering();
};
A.exportDialog = (selOnly = false, preset) => {
  if (!A.tracks.length) return App.toast('Nothing to export yet', 'warn');
  const hasEnc = typeof window.AudioEncoder === 'function';
  const name = h('input', { class: 'field wide', value: (preset && preset.name) || A.name.replace(/[\\/:*?"<>|]/g, ''), title: 'File name', tip: 'Name of the downloaded file.' });
  name.addEventListener('keydown', e => e.stopPropagation());
  const fmtSel = App.select({ label: 'Format', value: 'wav16', tip: 'WAV is lossless (biggest). M4A/AAC plays everywhere and is ~10× smaller. Opus is the most efficient, great for voice.', options: [['wav16', 'WAV · 16-bit (CD quality)'], ['wav24', 'WAV · 24-bit'], ['wav32', 'WAV · 32-bit float'], ...(hasEnc ? [['m4a', 'M4A · AAC 256 kbps'], ['m4a128', 'M4A · AAC 128 kbps'], ['opus', 'Opus (WebM) · 160 kbps']] : [])] });
  const ch = App.select({ label: 'Channels', value: '2', tip: 'Stereo keeps left/right placement. Mono folds everything to one channel (smaller).', options: [['2', 'Stereo'], ['1', 'Mono']] });
  let range = preset ? 'custom' : selOnly && A.sel ? 'sel' : 'all';
  const seg = App.seg({ value: range, onChange: v => range = v, options: [{ value: 'all', label: 'Whole project', tip: 'Everything from 0:00 to the end of the last track.' }, { value: 'sel', label: 'Selection', tip: A.sel ? 'Only the selected time range.' : 'Make a selection first.' }, ...(preset ? [{ value: 'custom', label: preset.label, tip: 'The region you chose.' }] : [])] });
  const level = App.select({ label: 'Level', value: 'asis', tip: 'Optionally fix the overall level on export. Loudness targets match what streaming services and podcast apps expect.', options: [['asis', 'As mixed'], ['peak', 'Normalize peaks to −1 dB'], ['l14', 'Loudness −14 LUFS (Spotify, YouTube)'], ['l16', 'Loudness −16 LUFS (podcasts, Apple)'], ['l23', 'Loudness −23 LUFS (broadcast)']] });
  App.modal({
    title: 'Export audio', icon: 'download', width: 440,
    body: h('div', null, h('div', { class: 'ctl stack' }, h('label', null, 'File name'), name), fmtSel, ch, h('div', { class: 'ctl', title: 'Range', tip: 'What part to export.' }, h('label', null, 'Range'), seg), level,
      h('div', { class: 'hint' }, 'The mix respects track volume, pan, envelopes, mute and solo.')),
    buttons: [{ label: 'Cancel' }, { label: 'Export', icon: 'download', primary: true, onClick: async () => {
      const [t0, t1] = range === 'custom' ? [preset.t0, preset.t1] : range === 'sel' && A.sel ? [A.sel.t0, A.sel.t1] : [0, A.duration()];
      A.busy(true, 'Rendering mix…');
      try {
        const ab = await A.mixdown(t0, t1, +ch.get());
        let chs = Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i));
        const lv = level.get();
        if (lv === 'peak') { const pk = A.peakOf(chs); if (pk > 0) { const g = App.dbToGain(-1) / pk; chs = chs.map(c => c.map(v => v * g)); } }
        else if (lv !== 'asis') chs = await A.FX.find(f => f.id === 'loudnorm').run(chs, A.sr, { target: -+lv.slice(1), ceiling: -1 });
        const f = fmtSel.get();
        let blob, ext;
        if (f.startsWith('wav')) { blob = D.encodeWAV(chs, A.sr, +f.slice(3)); ext = 'wav'; }
        else { A.busy(true, 'Encoding…'); blob = await App.mux.encodeAudioFile(chs, A.sr, f === 'opus' ? 'webm' : 'mp4', f === 'm4a128' ? 128000 : f === 'opus' ? 160000 : 256000); ext = f === 'opus' ? 'webm' : 'm4a'; }
        App.download(blob, (name.value || 'strata-audio') + '.' + ext);
        App.toast(`Exported ${App.fmtBytes(blob.size)}`, 'ok');
      } catch (e) { App.toast('Export failed: ' + e.message, 'err', 5000); }
      A.busy(false);
    } }],
  });
};
/** Every region marker → its own file (split a recording into songs, chapters or takes in one go). */
A.exportRegions = () => {
  const regs = A.markers.filter(m => m.t1 != null && m.t1 - m.t > 0.01).sort((a, b) => a.t - b.t);
  if (!regs.length) return App.toast('Make some regions first: select a range and press M (or use Remove silences ▸ Mark)', 'warn', 5000);
  const hasEnc = typeof window.AudioEncoder === 'function';
  const fmtSel = App.select({ label: 'Format', value: 'wav16', tip: 'WAV is lossless. M4A and Opus are much smaller.', options: [['wav16', 'WAV · 16-bit (CD quality)'], ['wav24', 'WAV · 24-bit'], ...(hasEnc ? [['m4a', 'M4A · AAC 256 kbps'], ['opus', 'Opus (WebM) · 160 kbps']] : [])] });
  const ch = App.select({ label: 'Channels', value: '2', tip: 'Stereo keeps left/right placement; mono files are half the size.', options: [['2', 'Stereo'], ['1', 'Mono']] });
  const safe = s => String(s).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  const list = h('div', { class: 'region-list' }, regs.map((m, i) => h('div', null, h('i', { style: { background: m.color } }), h('b', null, `${String(i + 1).padStart(2, '0')} ${m.label}`), h('span', { class: 'mono' }, `${fmt(m.t)} → ${fmt(m.t1)}`))));
  App.modal({
    title: 'Export regions', icon: 'download', width: 460,
    body: h('div', null, h('div', { class: 'hint', style: { paddingTop: 0 } }, `Saves each of the ${regs.length} region${regs.length > 1 ? 's' : ''} as its own file, named after the region. The mix respects volume, pan, envelopes, mute and solo.`), fmtSel, ch, list),
    buttons: [{ label: 'Cancel' }, { label: `Export ${regs.length} file${regs.length > 1 ? 's' : ''}`, icon: 'download', primary: true, onClick: async () => {
      const f = fmtSel.get(), nCh = +ch.get(), base = safe(A.name) || 'audio';
      A.busy(true, 'Exporting regions…');
      try {
        for (let i = 0; i < regs.length; i++) {
          const m = regs[i];
          A.busy(true, `Exporting region ${i + 1} of ${regs.length}…`);
          const ab = await A.mixdown(m.t, m.t1, nCh), chs = Array.from({ length: ab.numberOfChannels }, (_, k) => ab.getChannelData(k));
          let blob, ext;
          if (f.startsWith('wav')) { blob = D.encodeWAV(chs, A.sr, +f.slice(3)); ext = 'wav'; }
          else { blob = await App.mux.encodeAudioFile(chs, A.sr, f === 'opus' ? 'webm' : 'mp4', f === 'opus' ? 160000 : 256000); ext = f === 'opus' ? 'webm' : 'm4a'; }
          App.download(blob, `${base} - ${String(i + 1).padStart(2, '0')} ${safe(m.label) || 'Region'}.${ext}`);
          await App.sleep(350);   // browsers drop downloads that arrive all at once
        }
        App.toast(`Exported ${regs.length} file${regs.length > 1 ? 's' : ''}`, 'ok');
      } catch (e) { App.toast('Export failed: ' + e.message, 'err', 5000); }
      A.busy(false);
    } }],
  });
};
A.sendToVideo = async () => {
  if (!A.tracks.length) return App.toast('Nothing to send yet', 'warn');
  const ab = await A.mixdown(0, A.duration(), 2);
  App.emit('video:import', D.bufferToWav(ab, 16), (A.name || 'Audio mix') + '.wav');
};

/* ---------- import ---------- */
A.importFiles = async files => {
  const ac = App.ac();
  let added = 0;
  A.busy(true, 'Decoding audio…');
  for (const f of files) {
    try {
      const ab = await ac.decodeAudioData(await f.arrayBuffer());
      if (!added) A.commit('Import');
      const tr = A.newTrack(Array.from({ length: Math.min(2, ab.numberOfChannels) }, (_, i) => ab.getChannelData(i).slice()), f.name.replace(/\.[^.]+$/, ''), 0);
      A.tracks.forEach(t => t.selected = false); tr.selected = true;
      if (A.tracks.length === 1 && A.name === 'Untitled audio') A.name = tr.name;
      added++;
    } catch (e) { App.toast(`${f.name}: can't decode this file`, 'err'); }
  }
  A.busy(false);
  if (added) { A.changed(); A.zoomFit(); App.toast(`Imported ${added} file${added > 1 ? 's' : ''}`, 'ok'); }
};
A.openData = ({ channels, sampleRate, name }) => {
  if (sampleRate !== A.sr) channels = channels.map(c => D.resample(c, sampleRate / A.sr));
  A.commit('Open audio');
  const tr = A.newTrack(channels.slice(0, 2), name || 'Audio', 0);
  A.tracks.forEach(t => t.selected = false); tr.selected = true;
  A.changed(); A.zoomFit();
  App.toast(`“${tr.name}” opened as a new track`, 'ok');
};

/* ---------- drag & drop with the other editors ---------- */
/** sound arriving from the Video or Image editor → a new track starting at time t */
A.addTrackFrom = ({ channels, sampleRate }, name, t = A.cursor) => {
  if (sampleRate !== A.sr) channels = channels.map(c => D.resample(c, sampleRate / A.sr));
  A.commit('Add track');
  const tr = A.newTrack(channels.slice(0, 2), name || 'Audio', Math.max(0, t));
  A.tracks.forEach(t2 => t2.selected = false); tr.selected = true;
  A.changed();
  App.toast(`“${tr.name}” added at ${fmt(tr.offset)}`, 'ok', 3500, { label: 'Undo', fn: A.undo });
  return tr;
};
App.xfer.receivers.audio = {
  accepts: p => !!p.audio,
  async receive(p, t) { A.addTrackFrom(await p.audio(), p.name, t ?? A.cursor); },
};
/** a track (or the selected part of it) as something the Video editor can take */
A.trackPayload = tr => {
  const part = A.sel && tr.selected ? A.sel : null;
  const get = () => { if (!part) return tr.channels; const [s0, s1] = A.sampleRange(tr, part.t0, part.t1); return tr.channels.map(c => c.slice(s0, s1)); };
  const name = part ? `${tr.name} (${fmt(part.t1 - part.t0)})` : tr.name;
  const dur = part ? part.t1 - part.t0 : A.trackLen(tr);
  return { kind: 'audio', from: 'audio', name, icon: 'wave', duration: dur,
    audio: async () => ({ channels: get(), sampleRate: A.sr }),
    file: async () => App.xfer.wavFile(get(), A.sr, name) };
};

/* ---------- persistence (channels are immutable → stored once by identity) ---------- */
const chKey = new WeakMap();
let chSeq = 0, stored = new Set();
const keyOf = arr => { let k = chKey.get(arr); if (!k) { k = Date.now().toString(36) + '-' + (++chSeq); chKey.set(arr, k); } return k; };
const trackMeta = t => ({ id: t.id, name: t.name, offset: t.offset, gain: t.gain, pan: t.pan, mute: t.mute, solo: t.solo, view: t.view, color: t.color, h: t.h, env: t.env || [] });
A.serialize = () => ({ name: A.name, sr: A.sr, markers: A.markers, tracks: A.tracks.map(t => ({ ...trackMeta(t), chans: t.channels.map(keyOf) })) });
A.save = async () => {
  const data = A.serialize(), keep = new Set();
  for (const t of A.tracks) for (const c of t.channels) {
    const k = 'audio:ch:' + keyOf(c);
    keep.add(k);
    if (!stored.has(k)) { await App.store.set(k, c); stored.add(k); }
  }
  await App.store.set('audio:project', data);
  await App.store.prune('audio:ch:', keep);
  stored = new Set([...stored].filter(k => keep.has(k)));
};
A.saveSoon = App.makeSaver('audio', A.save, 2000);
App.on('store-cleared', () => { stored = new Set(); });
const loadTracks = async (data, getChan) => {
  const tracks = [];
  for (const tm of data.tracks || []) {
    let chans = await Promise.all(tm.chans.map(getChan));
    if (chans.some(c => !c)) continue;
    if (data.sr && data.sr !== A.sr) chans = chans.map(c => D.resample(c, data.sr / A.sr));
    const t = { ...tm, channels: chans, selected: false, env: tm.env || [] };
    delete t.chans;
    tracks.push(t);
  }
  return tracks;
};
A.restoreSession = async () => {
  let data = null;
  try { data = await App.store.get('audio:project'); } catch {}
  if (!data || !data.tracks || !data.tracks.length) return false;
  A.saveSoon.paused = true;
  const tracks = await loadTracks(data, async k => {
    const c = await App.store.get('audio:ch:' + k);
    if (c) { chKey.set(c, k); stored.add('audio:ch:' + k); }
    return c;
  });
  // anything recorded, imported or dropped while the session was still loading is kept (after the restored tracks)
  const added = A.tracks.filter(t => !tracks.includes(t));
  A.tracks = [...tracks, ...added]; A.markers = [...(data.markers || []), ...(added.length ? A.markers : [])]; A.name = data.name || 'Untitled audio';
  if (!added.length) { A.undoStack = []; A.redoStack = []; A.sel = null; }
  A.saveSoon.paused = false;
  A.changed(true); A.zoomFit();
  if (added.length) A.saveSoon();
  return tracks.length > 0;
};
A.saveProjectFile = () => {
  if (!A.tracks.length) return App.toast('Nothing to save yet', 'warn');
  const blobs = [];
  const data = { name: A.name, sr: A.sr, markers: A.markers, tracks: A.tracks.map(t => ({ ...trackMeta(t), chans: t.channels.map(c => { blobs.push(new Blob([c])); return blobs.length - 1; }) })) };
  App.saveProjectFile('audio', A.name, data, blobs);
};
A.loadProject = async (data, blobs, fname) => {
  A.stop();
  const tracks = await loadTracks(data, async i => new Float32Array(await blobs[i].arrayBuffer()));
  A.tracks = tracks; A.markers = data.markers || []; A.name = data.name || fname || 'Untitled audio';
  A.undoStack = []; A.redoStack = []; A.sel = null; A.cursor = A.playhead = 0;
  A.changed(); A.zoomFit();
};
A.newProject = async () => {
  if (A.tracks.length && !(await App.confirm('New audio project', 'Close all tracks and start an empty project? (Save it first with File ▸ Save project if you want to keep it.)', 'New project', true))) return;
  A.stop(); A.tracks = []; A.markers = []; A.sel = null; A.name = 'Untitled audio'; A.undoStack = []; A.redoStack = [];
  A.changed();
};

/* =====================================================================
   UI
   ===================================================================== */
let el = {};
A.busy = (on, msg) => {
  if (!el.busy) return;
  el.busy.style.display = on ? 'grid' : 'none';
  if (msg) el.busyMsg.textContent = msg;
};
function menus() {
  const fxItems = () => {
    const out = []; let cat = null;
    for (const fx of A.FX) {
      if (fx.cat !== cat) { cat = fx.cat; out.push({ head: cat }); }
      out.push({ label: fx.name + (fx.instant ? '' : '…'), icon: fx.icon, tip: fx.tip, action: () => A.fxDialog(fx) });
    }
    return out;
  };
  return [
    { label: 'File', tip: 'Projects, import, record, export and hand-off to the other editors.', items: () => [
      { label: 'New project', icon: 'fileNew', tip: 'Close all tracks and start fresh.', action: A.newProject },
      { label: 'Open project…', icon: 'folder', tip: 'Open a .strata project file.', action: () => App.openProjectFile() },
      { label: 'Save project…', icon: 'save', key: 'Ctrl+S', tip: 'Download a .strata file with all tracks, envelopes and markers.', action: A.saveProjectFile },
      { sep: true },
      { label: 'Import audio…', icon: 'upload', key: 'Ctrl+I', tip: 'Open audio files (WAV, MP3, OGG, FLAC, M4A…) — each becomes its own track. You can also drop files onto the tracks.', action: A.importDialog },
      { label: 'Record from microphone', icon: 'record', key: 'R', tip: 'Records a new track starting at the cursor while playing the existing tracks.', action: A.record },
      { label: 'Recording input', icon: 'mic', tip: 'Choose which microphone to record from.', sub: () => [{ label: 'System default', checked: !A.inputId, action: () => { A.inputId = ''; } }, ...A.devices.map((d, i) => ({ label: d.label || 'Microphone ' + (i + 1), checked: A.inputId === d.deviceId, action: () => { A.inputId = d.deviceId; App.toast('Recording input: ' + (d.label || 'Microphone ' + (i + 1))); } })), ...(A.devices.some(d => d.label) ? [] : [{ sep: true }, { label: 'Names appear after the first recording', disabled: true }])] },
      { label: 'New empty track', icon: 'addTrack', tip: 'Adds a silent stereo track you can paste or generate into.', action: () => { A.commit('New track'); A.newTrack([zeros(A.sr), zeros(A.sr)], 'Track ' + (A.tracks.length + 1)); A.changed(); } },
      { sep: true },
      { label: 'Export…', icon: 'download', key: 'Ctrl+E', tip: 'Mix every audible track into a WAV, M4A or Opus file.', action: () => A.exportDialog(false) },
      { label: 'Export selection…', icon: 'download', disabled: () => !A.sel, tip: 'Export only the selected time range.', action: () => A.exportDialog(true) },
      { label: 'Export regions as files…', icon: 'flag', disabled: () => !A.markers.some(m => m.t1 != null), tip: 'Saves every region as its own file, named after the region — split a recording into songs, chapters or takes in one go.', action: A.exportRegions },
      { label: 'Send mix to Video editor', icon: 'film', tip: 'Adds the mixdown to the Video tab’s media bin — perfect for soundtracks and cleaned-up voice-overs.', action: A.sendToVideo },
    ] },
    { label: 'Edit', tip: 'Cut, copy, paste and selection commands.', items: () => [
      { label: 'Undo', icon: 'undo', key: 'Ctrl+Z', disabled: !A.undoStack.length, tip: A.undoStack.length ? 'Undo “' + A.undoStack[A.undoStack.length - 1].label + '”.' : 'Nothing to undo.', action: A.undo },
      { label: 'Redo', icon: 'redo', key: 'Ctrl+Shift+Z', disabled: !A.redoStack.length, tip: 'Re-apply what you undid.', action: A.redo },
      { sep: true },
      { label: 'Cut', icon: 'scissors', key: 'Ctrl+X', tip: 'Removes the selection and keeps it on the clipboard. Later audio slides left.', action: A.ops.cut },
      { label: 'Copy', icon: 'copy', key: 'Ctrl+C', tip: 'Copies the selected audio.', action: A.ops.copy },
      { label: 'Paste', icon: 'paste', key: 'Ctrl+V', tip: 'Inserts the clipboard at the cursor (or replaces the selection).', action: A.ops.paste },
      { label: 'Delete', icon: 'trash', key: 'Del', tip: 'Removes the selection and closes the gap.', action: () => A.ops.del() },
      { label: 'Silence selection', icon: 'silence', key: 'Ctrl+L', tip: 'Replaces the selection with silence without changing timing.', action: A.ops.silence },
      { label: 'Trim to selection', icon: 'crop', key: 'Ctrl+T', tip: 'Keeps only the selected part of each selected track.', action: A.ops.trim },
      { sep: true },
      { label: 'Duplicate to new track', icon: 'copy', key: 'Ctrl+D', tip: 'Copies the selection onto a new track at the same time position — great for layering.', action: () => A.ops.duplicate(false) },
      { label: 'Split to new track', icon: 'detach', key: 'Ctrl+Shift+D', tip: 'Moves the selection onto its own track, leaving silence behind.', action: () => A.ops.duplicate(true) },
      { label: 'Insert silence…', icon: 'plus', tip: 'Pushes later audio right by inserting silence at the cursor.', action: A.ops.insertSilence },
      { label: 'Remove silences…', icon: 'autocut', key: 'Ctrl+Shift+S', tip: 'Automatically finds every pause and cuts, shortens, mutes or marks it — with a live preview, presets and click-free cuts. Works on the selection or the whole recording.', action: A.removeSilences },
      { sep: true },
      { label: 'Add marker / region', icon: 'flag', key: 'M', tip: 'Drops a marker at the playhead — or a region over the selection. Great for chapters and edit notes.', action: A.ops.addMarker },
      { label: 'Clear volume envelope', icon: 'envelope', tip: 'Removes envelope points from the selected tracks.', action: A.ops.clearEnvelope },
      { label: 'Apply volume envelope', icon: 'envelope', tip: 'Bakes the envelope into the audio permanently.', action: A.ops.applyEnvelope },
      { sep: true },
      { label: 'Select all', icon: 'cursor', key: 'Ctrl+A', tip: 'Selects every track from start to end.', action: A.ops.selectAll },
      { label: 'Select none', icon: 'x', key: 'Esc', tip: 'Clears the time selection.', action: A.ops.selectNone },
      { label: 'Snap to zero crossings', icon: 'target', checked: A.zeroSnap, tip: 'Nudges selection edges to the nearest point where the waveform crosses zero — avoids clicks at cut points.', action: () => { A.zeroSnap = !A.zeroSnap; App.toast('Zero-crossing snap ' + (A.zeroSnap ? 'on' : 'off')); } },
    ] },
    { label: 'Effect', tip: 'Process the selection (or whole selected tracks).', items: () => [
      { label: 'Repeat last effect', icon: 'redo', key: 'Ctrl+R', disabled: !A.lastFx, tip: A.lastFx ? 'Applies ' + A.lastFx.fx.name + ' again with the same settings.' : 'Use an effect first.', action: A.repeatLast },
      { sep: true }, ...fxItems()] },
    { label: 'Generate', tip: 'Create tones, noise, clicks or silence.', items: () => A.GEN.map(g => ({ label: g.name, icon: g.icon, tip: g.tip, action: () => A.genDialog(g) })) },
    { label: 'Analyze', tip: 'Measure levels and frequency content.', items: () => [
      { label: 'Loudness & statistics…', icon: 'lufs', tip: 'LUFS loudness, peak level, dynamics, DC offset and clipping for the selection.', action: A.statsDialog },
      { label: 'Plot spectrum…', icon: 'spectrum', tip: 'Shows which frequencies are present in the selection — find hum, harshness or muddiness.', action: A.spectrumDialog },
    ] },
    { label: 'View', tip: 'Zoom and display options.', items: () => [
      { label: 'Zoom in', icon: 'zoomIn', key: '=', tip: 'Shows more detail.', action: () => A.zoomBy(1.6) },
      { label: 'Zoom out', icon: 'zoomOut', key: '-', tip: 'Shows more time.', action: () => A.zoomBy(1 / 1.6) },
      { label: 'Fit project', icon: 'fit', key: 'F', tip: 'Fits everything in view.', action: A.zoomFit },
      { label: 'Zoom to selection', icon: 'expand', key: 'Z', disabled: !A.sel, tip: 'Fills the view with the selected range.', action: A.zoomSel },
      { sep: true },
      { label: 'Waveform view', icon: 'wave', tip: 'Shows selected tracks as waveforms (amplitude over time).', action: () => { A.targets().forEach(t => t.view = 'wave'); A.redraw(); } },
      { label: 'Spectrogram view', icon: 'spectrum', tip: 'Shows selected tracks as a heat-map of frequencies over time — noise and hum become easy to spot.', action: () => { A.targets().forEach(t => t.view = 'spec'); A.redraw(); } },
      { sep: true },
      { label: 'Show effects panel', icon: 'panelRight', checked: () => !el.root.classList.contains('no-side'), tip: 'Show or hide the effects rack.', action: toggleSide },
    ] },
  ];
}
const toggleSide = () => { el.root.classList.toggle('no-side'); try { localStorage.setItem('strata.a.noside', el.root.classList.contains('no-side') ? '1' : '0'); } catch {} setTimeout(() => { A.laneW = el.ruler.clientWidth; A.redraw(); }, 30); };

function buildTop(root) {
  el.playBtn = btn({ icon: 'play', cls: 'play-btn', title: 'Play / Pause', key: 'Space', tip: 'Plays the selection (or from the cursor). Press again to pause.', onClick: A.toggle });
  el.recBtn = btn({ icon: 'record', cls: 'rec-btn', title: 'Record', key: 'R', tip: 'Records from your microphone onto a new track at the cursor, while you hear the other tracks. Pick the microphone in File ▸ Recording input.', onClick: A.record });
  el.loopBtn = btn({ icon: 'loop', title: 'Loop', key: 'L', tip: 'Repeats the selection while playing — handy for fine-tuning effects.', onClick: () => { A.loop = !A.loop; el.loopBtn.setOn(A.loop); } });
  el.time = h('div', { class: 'a-time', title: 'Position', tip: 'Current playhead position in minutes:seconds.milliseconds.' });
  el.toolSeg = App.seg({ value: A.tool, onChange: v => A.setTool(v), options: [
    { value: 'select', icon: 'ibeam', title: 'Selection tool', key: 'I', tip: 'Drag across waveforms to select a time range. Shift-click extends, drag across tracks to select several.' },
    { value: 'shift', icon: 'timeShift', title: 'Time-shift tool', key: 'T', tip: 'Drag a track left or right to change when it starts.' },
    { value: 'env', icon: 'envelope', title: 'Envelope tool', key: 'E', tip: 'Draw volume automation: click a track to add points, drag them up/down to make that part louder or quieter, double-click to delete. Perfect for ducking music under a voice.' }] });
  const nameIn = h('input', { class: 'proj-name', value: A.name, title: 'Project name', tip: 'Click to rename. Used for exports and saved project files.', spellcheck: 'false' });
  nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') nameIn.blur(); });
  nameIn.addEventListener('change', () => { A.name = nameIn.value.trim() || 'Untitled audio'; nameIn.value = A.name; A.saveSoon(); });
  el.nameIn = nameIn;
  const qfx = id => () => A.applyFx(A.FX.find(f => f.id === id), id === 'normalize' ? { target: -1, dc: 1 } : { curve: 'scurve' });
  root.append(App.menubar(menus()), nameIn, App.sep(),
    btn({ icon: 'toStart', title: 'To start', key: 'Home', tip: 'Moves the cursor to the beginning.', onClick: () => A.seek(0) }),
    el.playBtn,
    btn({ icon: 'stop', title: 'Stop', tip: 'Stops and returns the playhead to where playback started.', onClick: A.stop }),
    el.recBtn,
    el.loopBtn,
    el.time, el.toolSeg, App.sep(),
    btn({ icon: 'trash', title: 'Delete', key: 'Del', tip: 'Removes the selection and closes the gap.', onClick: () => A.ops.del() }),
    btn({ icon: 'silence', title: 'Silence', key: 'Ctrl+L', tip: 'Mutes the selection while keeping the timing.', onClick: A.ops.silence }),
    btn({ icon: 'crop', title: 'Trim to selection', key: 'Ctrl+T', tip: 'Keeps only what’s selected.', onClick: A.ops.trim }),
    btn({ icon: 'fadeIn', title: 'Quick fade in', tip: 'Smooth S-curve fade-in over the selection.', onClick: qfx('fadein') }),
    btn({ icon: 'fadeOut', title: 'Quick fade out', tip: 'Smooth S-curve fade-out over the selection.', onClick: qfx('fadeout') }),
    btn({ icon: 'normalize', title: 'Quick normalize', tip: 'Brings the loudest peak to −1 dB.', onClick: qfx('normalize') }),
    btn({ icon: 'autocut', title: 'Remove silences', key: 'Ctrl+Shift+S', tip: 'Auto-cut all the pauses: finds silences, shows a preview and removes or shortens them in one go.', onClick: A.removeSilences }),
    btn({ icon: 'flag', title: 'Add marker / region', key: 'M', tip: 'Drops a marker at the playhead, or a labelled region over the selection.', onClick: A.ops.addMarker }),
    App.sep(),
    btn({ icon: 'undo', title: 'Undo', key: 'Ctrl+Z', tip: 'Step back.', onClick: A.undo }),
    btn({ icon: 'redo', title: 'Redo', key: 'Ctrl+Shift+Z', tip: 'Step forward.', onClick: A.redo }),
    h('div', { class: 'grow' }),
    btn({ icon: 'zoomOut', title: 'Zoom out', key: '-', tip: 'See more time.', onClick: () => A.zoomBy(1 / 1.6) }),
    btn({ icon: 'zoomIn', title: 'Zoom in', key: '=', tip: 'See more detail — zoom far enough and you’ll see individual samples.', onClick: () => A.zoomBy(1.6) }),
    btn({ icon: 'fit', title: 'Fit project', key: 'F', tip: 'Shows the whole project.', onClick: A.zoomFit }),
    btn({ icon: 'panelRight', title: 'Effects panel', tip: 'Show or hide the effects rack for more waveform room.', onClick: toggleSide }),
    btn({ icon: 'save', label: 'Save', cls: 'solid txt', title: 'Save project', key: 'Ctrl+S', tip: 'Download a portable .strata project (tracks, envelopes, markers). Your work also autosaves in this browser.', onClick: A.saveProjectFile }),
    btn({ icon: 'download', label: 'Export', cls: 'primary txt', title: 'Export', key: 'Ctrl+E', tip: 'Save your mix as WAV, M4A or Opus.', onClick: () => A.exportDialog(false) }),
  );
}
A.setTool = v => {
  A.tool = v; el.toolSeg.set(v);
  el.main.classList.toggle('a-tool-shift', v === 'shift');
  el.main.classList.toggle('a-tool-env', v === 'env');
  A.redraw();
};
A.importDialog = async () => { const f = await App.pickFiles('audio/*,video/*', true); if (f.length) A.importFiles(f); };
A.onPlayState = () => {
  el.playBtn.innerHTML = ''; el.playBtn.append(icon(A.playing ? 'pause' : 'play', 18));
  if (A.playing) meterLoop();
};
A.onRecState = () => { el.recBtn.classList.toggle('on', !!A.recording); A.placeLines(); };

/* ---------- main area ---------- */
function buildMain(root) {
  el.main = root;
  el.ov = h('div', { class: 'a-overview', title: 'Overview', tip: 'The whole project at a glance. Drag the highlighted window to scroll, or click anywhere to jump there.' });
  el.ovCv = h('canvas');
  el.ovWin = h('div', { class: 'a-ov-win' });
  el.ov.append(el.ovCv, el.ovWin);
  el.ruler = h('canvas', { title: 'Timeline ruler', tip: 'Click or drag to move the playhead. Markers and regions appear here — click one to jump to it.' });
  el.markers = h('div', { class: 'a-markers' });
  const corner = h('div', { class: 'a-corner' },
    btn({ icon: 'addTrack', cls: 'sm', label: 'Track', title: 'New track', tip: 'Adds a silent stereo track you can paste, record or generate into.', onClick: () => { A.commit('New track'); A.newTrack([zeros(A.sr), zeros(A.sr)], 'Track ' + (A.tracks.length + 1)); A.changed(); } }),
    h('div', { class: 'grow' }),
    btn({ icon: 'mic', cls: 'sm', title: 'Record', tip: 'Record from the microphone.', onClick: A.record }));
  const rrow = h('div', { class: 'a-ruler-row' }, corner, el.ruler, el.markers);
  el.tracks = h('div', { class: 'a-tracks' });
  el.lines = h('div', { class: 'a-lines' });
  el.playLine = h('div', { class: 'a-line a-playhead' });
  el.curLine = h('div', { class: 'a-line a-cursor' });
  el.mlines = h('div');
  el.recRegion = h('div', { style: { position: 'absolute', top: 0, bottom: 0, background: 'rgba(255,93,108,.18)', borderLeft: '2px solid var(--danger)', display: 'none' } });
  el.lines.append(el.mlines, el.recRegion, el.curLine, el.playLine);
  el.busy = h('div', { style: { position: 'absolute', inset: 0, display: 'none', placeItems: 'center', background: 'rgba(8,9,12,.55)', zIndex: 20, backdropFilter: 'blur(1px)' } },
    h('div', { class: 'toast' }, h('span', { class: 'toast-ico' }, h('i', { class: 'live-dot' })), el.busyMsg = h('span', null, 'Working…')));
  el.empty = h('div', { class: 'a-empty' }, h('div', { class: 'empty' },
    icon('wave', 44), h('div', { style: { fontSize: '15px', fontWeight: 800, color: 'var(--text-2)', marginBottom: '4px' } }, 'No audio yet'),
    'Drop audio or video files here, import, record, or generate a sound.', h('br'), h('br'),
    h('div', { class: 'btn-row', style: { justifyContent: 'center', gap: '6px' } },
      btn({ icon: 'upload', label: 'Import audio', cls: 'primary txt', title: 'Import', tip: 'Open audio files as tracks.', onClick: A.importDialog }),
      btn({ icon: 'mic', label: 'Record', cls: 'solid txt', title: 'Record', tip: 'Record from your microphone.', onClick: A.record }),
      btn({ icon: 'tone', label: 'Generate tone', cls: 'solid txt', title: 'Generate', tip: 'Create a test tone to play with.', onClick: () => A.genDialog(A.GEN[0]) }))));
  root.append(el.ov, rrow, el.tracks, el.lines, el.busy);
  el.tracks.append(el.empty);
  App.fileDrop(root, files => A.importFiles(files));
  el.dropLine = h('div', { class: 'a-line a-dropline', style: { display: 'none' } });
  el.lines.append(el.dropLine);
  const dropT = e => Math.max(0, A.xToT(e.clientX));
  App.xfer.zone(root, {
    accepts: p => !!p.audio && p.from !== 'audio',
    label: (p, e) => `Drop to add “${p.name}” as a new track at ${fmt(dropT(e))}`,
    over: (p, e) => { const x = A.tToX(dropT(e)); el.dropLine.style.left = x + 'px'; el.dropLine.style.display = x >= 0 && x <= A.laneW ? '' : 'none'; },
    leave: () => { el.dropLine.style.display = 'none'; },
    drop: async (p, e) => A.addTrackFrom(await p.audio(), p.name, dropT(e)),
  });

  new ResizeObserver(() => { A.laneW = el.ruler.clientWidth; A.redraw(); }).observe(el.ruler);
  setupLaneEvents();
  setupRuler();
  setupOverview();
}
const laneLeft = () => el.ruler.getBoundingClientRect().left;
A.xToT = clientX => A.scroll + (clientX - laneLeft()) / A.pps;
A.tToX = t => (t - A.scroll) * A.pps;

A.renderHeads = () => {
  el.tracks.querySelectorAll('.a-track').forEach(row => {
    const tr = A.tracks.find(t => t.id === row.dataset.id);
    if (tr) row.classList.toggle('sel', tr.selected);
  });
};
A.changed = (noSave) => {
  A.version++;
  el.tracks.innerHTML = '';
  if (!A.tracks.length) el.tracks.append(el.empty);
  for (const tr of A.tracks) el.tracks.append(trackRow(tr));
  if (A.recording && A.recording.liveEl) { el.empty.remove(); el.tracks.append(A.recording.liveEl); }
  A.laneW = el.ruler.clientWidth;
  if (el.nameIn && document.activeElement !== el.nameIn) el.nameIn.value = A.name;
  A.redraw();
  updSelFields();
  if (noSave !== true) A.saveSoon();
};
function trackRow(tr) {
  const row = h('div', { class: 'a-track' + (tr.selected ? ' sel' : ''), dataset: { id: tr.id }, style: { height: tr.h + 'px', '--tc': tr.color } });
  const name = h('div', { class: 'at-name', title: tr.name, tip: 'Click to select this track. Double-click to rename.' }, tr.name);
  name.addEventListener('dblclick', async e => { e.stopPropagation(); const v = await App.prompt('Rename track', 'Track name', tr.name); if (v != null) { A.commit('Rename'); tr.name = v || tr.name; A.changed(); } });
  const ms = (k, label, tip) => {
    const b = h('button', { class: 'ms ' + k + (tr[label] ? ' on' : ''), title: label === 'mute' ? 'Mute' : 'Solo', tip }, k.toUpperCase());
    b.addEventListener('click', e => { e.stopPropagation(); tr[label] = !tr[label]; b.classList.toggle('on', tr[label]); A.updateLive(); A.version++; drawOverview(); A.tracks.forEach(drawTrack); A.saveSoon(); });
    return b;
  };
  const menuBtn = btn({ icon: 'chevDown', cls: 'sm', title: 'Track options', tip: 'Rename, change view or color, convert channels, reorder or delete this track.', onClick: e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); App.openMenu(r.left, r.bottom + 4, trackMenu(tr)); } });
  const mini = (label, min, max, step, get, set, fmtv, tip) => {
    const inp = h('input', { type: 'range', min, max, step, value: get(), 'aria-label': label });
    const v = h('span', { class: 'v' }, fmtv(get()));
    App.setRangeFill(inp);
    inp.addEventListener('input', () => { set(+inp.value); v.textContent = fmtv(+inp.value); A.updateLive(); });
    inp.addEventListener('change', () => A.saveSoon());
    inp.addEventListener('dblclick', () => { inp.value = 0; set(0); v.textContent = fmtv(0); App.setRangeFill(inp); A.updateLive(); A.saveSoon(); });
    inp.addEventListener('pointerdown', e => e.stopPropagation());
    return h('div', { class: 'mini', title: label, tip: tip + ' Double-click to reset.' }, h('span', null, label), inp, v);
  };
  const dragGrip = h('div', { class: 'at-grip', title: 'Drag track', tip: 'Drag this track into the Video editor — or just your selection, if this track has one. Hold it over the Video tab to switch there.' }, icon('grip', 14));
  App.xfer.source(dragGrip, () => A.trackPayload(tr));
  const head = h('div', { class: 'a-thead' },
    h('div', { class: 'at-top' }, dragGrip, name, ms('m', 'mute', 'Silences this track.'), ms('s', 'solo', 'Plays only soloed tracks.'), menuBtn),
    h('div', { class: 'at-info' }, `${tr.channels.length === 1 ? 'Mono' : 'Stereo'} · ${(A.sr / 1000).toFixed(1)} kHz · ${fmt(A.trackLen(tr))}${tr.env && tr.env.length ? ' · env' : ''}`),
    tr.h >= 90 ? mini('Gain', -24, 12, 0.5, () => tr.gain, v => tr.gain = v, v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB', 'Track volume (non-destructive).') : null,
    tr.h >= 90 ? mini('Pan', -1, 1, 0.01, () => tr.pan, v => tr.pan = v, v => v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100), 'Left / right placement in the stereo mix.') : null,
  );
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input')) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) tr.selected = !tr.selected;
    else { A.tracks.forEach(t => t.selected = t === tr); }
    A.renderHeads(); A.redraw();
  });
  head.addEventListener('contextmenu', e => App.contextMenu(e, trackMenu(tr)));
  const cv = h('canvas');
  tr._cv = cv;
  const lane = h('div', { class: 'a-lane', dataset: { id: tr.id } }, cv);
  const grip = h('div', { style: { position: 'absolute', left: 0, right: 0, bottom: '-3px', height: '6px', cursor: 'row-resize', zIndex: 4 }, title: 'Resize track', tip: 'Drag to make this track taller or shorter.' });
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const y0 = e.clientY, h0 = tr.h;
    const mv = ev => { tr.h = clamp(h0 + ev.clientY - y0, 48, 400); row.style.height = tr.h + 'px'; drawTrack(tr); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); A.changed(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  row.append(head, lane, grip);
  return row;
}
function trackMenu(tr) {
  const i = A.tracks.indexOf(tr);
  return [
    { label: 'Rename…', icon: 'tag', tip: 'Give the track a new name.', action: async () => { const v = await App.prompt('Rename track', 'Track name', tr.name); if (v != null) { A.commit('Rename'); tr.name = v || tr.name; A.changed(); } } },
    { label: 'Color', icon: 'palette', tip: 'Change the track color.', sub: COLORS.map(c => ({ label: COLOR_NAMES[c] || c, swatch: c, checked: tr.color === c, action: () => { A.commit('Track color'); tr.color = c; A.changed(); } })) },
    { label: 'Waveform', icon: 'wave', checked: tr.view === 'wave', tip: 'Amplitude over time — best for editing.', action: () => { tr.view = 'wave'; drawTrack(tr); } },
    { label: 'Spectrogram', icon: 'spectrum', checked: tr.view === 'spec', tip: 'Frequency heat-map — reveals hum, hiss and harsh frequencies.', action: () => { tr.view = 'spec'; drawTrack(tr); } },
    { sep: true },
    { label: 'Make mono', icon: 'merge', disabled: tr.channels.length === 1, tip: 'Mixes left and right into a single channel.', action: () => { A.commit('Make mono'); tr.channels = fitChannels(tr.channels, 1); A.changed(); } },
    { label: 'Make stereo', icon: 'copy', disabled: tr.channels.length === 2, tip: 'Copies the mono channel to both sides.', action: () => { A.commit('Make stereo'); tr.channels = [tr.channels[0], tr.channels[0].slice()]; A.changed(); } },
    { label: 'Swap channels', icon: 'swap', disabled: tr.channels.length < 2, tip: 'Exchanges left and right.', action: () => { A.commit('Swap channels'); tr.channels = [tr.channels[1], tr.channels[0]]; A.changed(); } },
    { label: A.sel && tr.selected ? 'Send selection to Video editor' : 'Send to Video editor', icon: 'film', tip: 'Adds this track’s sound (or just the selected part) to the video timeline at the playhead. You can also drag the ⠿ handle onto the timeline.', action: () => App.xfer.send(A.trackPayload(tr), 'video') },
    { label: 'Duplicate track', icon: 'copy', tip: 'Makes an identical copy below.', action: () => { A.commit('Duplicate track'); const n = A.newTrack(tr.channels.map(c => c), tr.name + ' copy', tr.offset); n.gain = tr.gain; n.pan = tr.pan; n.env = (tr.env || []).map(p => ({ ...p })); A.tracks.splice(A.tracks.indexOf(n), 1); A.tracks.splice(i + 1, 0, n); A.changed(); } },
    { label: 'Clear envelope', icon: 'envelope', disabled: !(tr.env && tr.env.length), tip: 'Removes this track’s volume automation.', action: () => { A.commit('Clear envelope'); tr.env = []; A.changed(); } },
    { sep: true },
    { label: 'Move up', icon: 'chevUp', disabled: i === 0, tip: 'Moves the track up.', action: () => { A.commit('Move track'); A.tracks.splice(i, 1); A.tracks.splice(i - 1, 0, tr); A.changed(); } },
    { label: 'Move down', icon: 'chevDown', disabled: i === A.tracks.length - 1, tip: 'Moves the track down.', action: () => { A.commit('Move track'); A.tracks.splice(i, 1); A.tracks.splice(i + 1, 0, tr); A.changed(); } },
    { label: 'Delete track', icon: 'trash', tip: 'Removes the track (can be undone).', action: () => { A.commit('Delete track'); A.tracks.splice(i, 1); A.changed(); App.toast(`Deleted “${tr.name}”`, '', 3500, { label: 'Undo', fn: A.undo }); } },
  ];
}

/* ---------- drawing ---------- */
let rafDraw = 0;
A.redraw = () => {
  if (rafDraw) return;
  rafDraw = requestAnimationFrame(() => {
    rafDraw = 0;
    for (const tr of A.tracks) drawTrack(tr);
    drawRuler(); drawOverview(); A.placeLines(); updSelFields();
  });
};
const envY = (g, H) => H - Math.min(2, g) / 2 * H;
function drawTrack(tr) {
  const cv = tr._cv;
  if (!cv || !cv.isConnected) return;
  const dpr = App.fitCanvas(cv);
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, ppd = A.pps * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const x0 = (tr.offset - A.scroll) * ppd, x1 = (A.trackEnd(tr) - A.scroll) * ppd;
  const muted = tr.mute || (A.tracks.some(t => t.solo) && !tr.solo);
  const bodyG = ctx.createLinearGradient(0, 0, 0, H);
  bodyG.addColorStop(0, rgba(tr.color, tr.selected ? 0.13 : 0.08)); bodyG.addColorStop(1, rgba(tr.color, tr.selected ? 0.06 : 0.03));
  ctx.fillStyle = bodyG;
  ctx.fillRect(Math.max(0, x0), 0, Math.min(W, x1) - Math.max(0, x0), H);
  ctx.fillStyle = rgba(tr.color, 0.7);
  if (x0 >= 0 && x0 <= W) ctx.fillRect(x0, 0, dpr, H);
  if (x1 >= 0 && x1 <= W) ctx.fillRect(x1 - dpr, 0, dpr, H);
  const nCh = tr.channels.length, band = H / nCh;
  for (let ci = 0; ci < nCh; ci++) {
    const mid = band * (ci + 0.5), amp = band / 2 * 0.92, data = tr.channels[ci];
    if (tr.view === 'spec') { drawSpec(ctx, tr, ci, band * ci, band, ppd, W); continue; }
    ctx.fillStyle = `rgba(${App.th.ink},.08)`; ctx.fillRect(Math.max(0, x0), Math.round(mid), Math.min(W, x1) - Math.max(0, x0), dpr);
    const spp = A.sr / ppd;
    const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W, Math.ceil(x1));
    const col = muted ? 'rgba(160,160,170,.5)' : tr.color;
    if (spp >= 1) {
      const wg = ctx.createLinearGradient(0, mid - amp, 0, mid + amp);
      wg.addColorStop(0, rgba(muted ? '#a0a0aa' : tr.color, 0.95)); wg.addColorStop(0.5, rgba(muted ? '#a0a0aa' : tr.color, 0.7)); wg.addColorStop(1, rgba(muted ? '#a0a0aa' : tr.color, 0.95));
      ctx.fillStyle = wg;
      const rmsCol = muted ? 'rgba(200,200,210,.45)' : 'rgba(255,255,255,.38)';
      const rms = [];
      for (let x = xa; x < xb; x++) {
        const s0 = (A.scroll + x / ppd - tr.offset) * A.sr;
        const r = D.range(data, s0, s0 + spp);
        if (!r) continue;
        const y0 = mid - r.hi * amp, y1 = mid - r.lo * amp;
        ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
        rms.push(x, r.rms);
        if (r.hi >= 0.999 || r.lo <= -0.999) { const f = ctx.fillStyle; ctx.fillStyle = '#ff5d6c'; ctx.fillRect(x, band * ci, 1, 3 * dpr); ctx.fillRect(x, band * (ci + 1) - 3 * dpr, 1, 3 * dpr); ctx.fillStyle = f; }
      }
      ctx.fillStyle = rmsCol;
      for (let i = 0; i < rms.length; i += 2) ctx.fillRect(rms[i], mid - rms[i + 1] * amp, 1, Math.max(1, rms[i + 1] * amp * 2));
    } else {
      const sA = Math.max(0, Math.floor((A.scroll - tr.offset) * A.sr) - 1), sB = Math.min(data.length, Math.ceil((A.scroll + W / ppd - tr.offset) * A.sr) + 1);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5 * dpr; ctx.beginPath();
      for (let s = sA; s < sB; s++) { const x = (tr.offset + s / A.sr - A.scroll) * ppd, y = mid - data[s] * amp; s === sA ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
      if (spp < 0.2) { ctx.fillStyle = col; for (let s = sA; s < sB; s++) { const x = (tr.offset + s / A.sr - A.scroll) * ppd; ctx.beginPath(); ctx.arc(x, mid - data[s] * amp, 2.2 * dpr, 0, 7); ctx.fill(); } }
    }
    if (ci > 0) { ctx.fillStyle = `rgba(${App.th.ink},.1)`; ctx.fillRect(0, band * ci, W, dpr); }
  }
  // regions
  for (const m of A.markers) if (m.t1 != null) { const a = (m.t - A.scroll) * ppd, b = (m.t1 - A.scroll) * ppd; if (b > 0 && a < W) { ctx.fillStyle = rgba(m.color, 0.07); ctx.fillRect(a, 0, b - a, H); } }
  if (A.sel && tr.selected) {
    const sx0 = (A.sel.t0 - A.scroll) * ppd, sx1 = (A.sel.t1 - A.scroll) * ppd;
    ctx.fillStyle = `rgba(${App.th.ink},.13)`;
    ctx.fillRect(sx0, 0, sx1 - sx0, H);
    ctx.fillStyle = `rgba(${App.th.ink},.65)`;
    ctx.fillRect(sx0, 0, dpr, H); ctx.fillRect(sx1 - dpr, 0, dpr, H);
  }
  // volume envelope
  const E = tr.env || [];
  if (E.length || A.tool === 'env') {
    const xOf = lt => (tr.offset + lt - A.scroll) * ppd;
    ctx.save();
    ctx.lineWidth = 2 * dpr; ctx.strokeStyle = A.tool === 'env' ? '#ffe14a' : 'rgba(255,225,74,.7)';
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3 * dpr;
    ctx.beginPath();
    if (!E.length) { ctx.moveTo(Math.max(0, x0), envY(1, H)); ctx.lineTo(Math.min(W, x1), envY(1, H)); }
    else {
      ctx.moveTo(Math.max(0, x0), envY(E[0].g, H));
      for (const p of E) ctx.lineTo(xOf(p.t), envY(p.g, H));
      ctx.lineTo(Math.min(W, x1), envY(E[E.length - 1].g, H));
    }
    ctx.stroke();
    if (A.tool === 'env') {
      ctx.fillStyle = '#ffe14a';
      for (const p of E) { ctx.beginPath(); ctx.arc(xOf(p.t), envY(p.g, H), 4.5 * dpr, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,225,74,.55)'; ctx.font = `${10 * dpr}px JetBrains Mono`;
      ctx.fillText('0 dB', Math.max(4 * dpr, x0 + 4 * dpr), envY(1, H) - 4 * dpr);
    }
    ctx.restore();
  }
}
function drawSpec(ctx, tr, ci, y0, band, ppd, W) {
  const key = `${A.scroll}|${A.pps}|${W}|${band}|${tr.channels[ci].length}|${ci}`;
  tr._spec = tr._spec || {};
  let img = tr._spec[ci];
  if (!img || img.key !== key || img.data !== tr.channels[ci]) {
    const data = tr.channels[ci], N = 1024, Hh = Math.max(1, Math.round(band));
    const im = ctx.createImageData(W, Hh), px = im.data, lut = D.magma, bins = N / 2, nyq = A.sr / 2;
    const binFor = new Int32Array(Hh);
    for (let y = 0; y < Hh; y++) { const f = 30 * Math.pow(nyq / 30, 1 - y / Hh); binFor[y] = Math.min(bins - 1, Math.round(f / nyq * bins)); }
    const step = Math.max(1, Math.round(W / 900));
    for (let x = 0; x < W; x += step) {
      const t = A.scroll + x / ppd - tr.offset;
      if (t < 0 || t * A.sr >= data.length) continue;
      const spec = D.spectrumAt(data, Math.round(t * A.sr) - N / 2, N);
      for (let y = 0; y < Hh; y++) {
        const v = clamp((spec[binFor[y]] + 100) / 90, 0, 1), li = Math.round(v * 255) * 3;
        for (let k = 0; k < step && x + k < W; k++) { const o = (y * W + x + k) * 4; px[o] = lut[li]; px[o + 1] = lut[li + 1]; px[o + 2] = lut[li + 2]; px[o + 3] = 255; }
      }
    }
    img = tr._spec[ci] = { key, data: tr.channels[ci], im };
  }
  ctx.putImageData(img.im, 0, Math.round(y0));
}
function niceStep(pps) {
  const c = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return c.find(s => s * pps >= 80) || 600;
}
function drawRuler() {
  const cv = el.ruler, dpr = App.fitCanvas(cv), ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = cv.clientWidth, H = 28;
  ctx.clearRect(0, 0, W, H);
  if (A.sel) { ctx.fillStyle = `rgba(${App.th.ink},.1)`; ctx.fillRect(A.tToX(A.sel.t0), 0, (A.sel.t1 - A.sel.t0) * A.pps, H); }
  const major = niceStep(A.pps), minor = major / 5;
  const t0 = A.scroll, t1 = A.scroll + W / A.pps;
  ctx.strokeStyle = `rgba(${App.th.ink},.14)`; ctx.beginPath();
  for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
    const x = Math.round(A.tToX(t)) + 0.5, isMaj = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    ctx.moveTo(x, isMaj ? 12 : 20); ctx.lineTo(x, H);
  }
  ctx.stroke();
  ctx.fillStyle = App.th.muted; ctx.font = '500 10px "JetBrains Mono", monospace';
  const dec = major < 0.01 ? 3 : major < 0.1 ? 2 : major < 1 ? 1 : 0;
  for (let t = Math.floor(t0 / major) * major; t <= t1; t += major) {
    const m = Math.floor(t / 60), s = t - m * 60;
    ctx.fillText(`${m}:${s.toFixed(dec).padStart(dec ? dec + 3 : 2, '0')}`, A.tToX(t) + 4, 25);
  }
  // markers (DOM so they can be clicked, dragged and renamed)
  el.markers.innerHTML = ''; el.mlines.innerHTML = '';
  for (const m of A.markers) {
    const x = A.tToX(m.t), x1 = m.t1 != null ? A.tToX(m.t1) : x;
    if (x1 < -200 || x > W + 10) continue;
    const mk = h('div', { class: 'a-marker', dataset: { id: m.id }, style: { left: x + 'px', width: Math.max(2, x1 - x) + 'px', '--mc': m.color }, title: m.label, tip: (m.t1 != null ? 'Region' : 'Marker') + ' — click to jump' + (m.t1 != null ? ' and select it' : '') + ', drag to move, double-click to rename, right-click for options.' },
      h('span', { class: 'flag' }, m.label), m.t1 != null ? h('i', { class: 'reg' }) : null);
    el.markers.append(mk);
    el.mlines.append(h('div', { class: 'a-mline', style: { left: x + 'px', '--mc': m.color } }));
    if (m.t1 != null) el.mlines.append(h('div', { class: 'a-mline', style: { left: x1 + 'px', '--mc': m.color } }));
  }
}
let ovCache = { v: -1, w: 0, data: null };
function drawOverview() {
  const cv = el.ovCv, dpr = App.fitCanvas(cv), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const total = Math.max(A.duration(), (A.laneW || 800) / A.pps, 1);
  if (ovCache.v !== A.version || ovCache.w !== W || ovCache.total !== total) {
    const data = new Float32Array(W);
    for (const tr of A.tracks) {
      if (tr.mute) continue;
      for (let x = 0; x < W; x++) {
        const ta = x / W * total, tb = (x + 1) / W * total;
        for (const ch of tr.channels) { const r = D.range(ch, (ta - tr.offset) * A.sr, (tb - tr.offset) * A.sr); if (r) data[x] = Math.max(data[x], r.hi, -r.lo); }
      }
    }
    ovCache = { v: A.version, w: W, total, data };
  }
  ctx.clearRect(0, 0, W, H);
  const acc = App.cssVar('--audio') || '#35d6b4';
  ctx.fillStyle = rgba(acc, 0.55);
  for (let x = 0; x < W; x++) { const a = Math.sqrt(ovCache.data[x]) * (H / 2 - 4); ctx.fillRect(x, H / 2 - a, 1, Math.max(1, a * 2)); }
  for (const m of A.markers) { ctx.fillStyle = m.color; ctx.fillRect(m.t / total * W, 0, dpr, H); }
  if (A.sel) { ctx.fillStyle = `rgba(${App.th.ink},.15)`; ctx.fillRect(A.sel.t0 / total * W, 0, (A.sel.t1 - A.sel.t0) / total * W, H); }
  const vis = (A.laneW || 800) / A.pps;
  el.ovWin.style.left = (A.scroll / total * 100) + '%';
  el.ovWin.style.width = Math.min(100, vis / total * 100) + '%';
  el.ovTotal = total;
  ctx.fillStyle = App.th.text;
  ctx.fillRect(A.playhead / total * W, 0, dpr, H);
}
A.placeLines = () => {
  if (!el.lines) return;
  const top = el.tracks.offsetTop;
  el.lines.style.top = top + 'px';
  const px = A.tToX(A.playhead), cx = A.tToX(A.cursor);
  el.playLine.style.left = px + 'px';
  el.playLine.style.display = px < 0 || px > A.laneW ? 'none' : '';
  el.curLine.style.left = cx + 'px';
  el.curLine.style.display = A.sel || cx < 0 || cx > A.laneW || A.playing ? 'none' : '';
  if (A.recording) {
    const x0 = A.tToX(A.recording.t0);
    el.recRegion.style.display = '';
    el.recRegion.style.left = x0 + 'px';
    el.recRegion.style.width = Math.max(0, px - x0) + 'px';
    drawLive();
  } else el.recRegion.style.display = 'none';
  el.time.innerHTML = '';
  el.time.append(fmt(A.playhead), h('small', null, A.recording ? '● recording' : A.playing ? 'playing' : A.sel ? 'selection ' + fmt(A.sel.t1 - A.sel.t0) : 'cursor'));
  if (A.playing) drawOverview();
};

/* ---------- zoom & scroll ---------- */
A.setView = (pps, scroll) => {
  A.pps = clamp(pps, 0.2, A.sr * 3 / (devicePixelRatio || 1));
  const vis = (A.laneW || 800) / A.pps;
  A.scroll = clamp(scroll, 0, Math.max(0, Math.max(A.duration(), vis) - vis * 0.5));
  A.redraw();
};
A.zoomBy = (f, clientX) => {
  const ax = clientX != null ? clientX - laneLeft() : (A.playing ? A.tToX(A.playhead) : A.sel ? A.tToX((A.sel.t0 + A.sel.t1) / 2) : A.tToX(A.cursor));
  const tAt = A.scroll + ax / A.pps;
  const np = clamp(A.pps * f, 0.2, A.sr * 3);
  A.setView(np, tAt - ax / np);
};
A.zoomFit = () => { const d = Math.max(1, A.duration()); A.setView(((A.laneW || 800) - 20) / d, 0); };
A.zoomSel = () => { if (!A.sel) return; const d = A.sel.t1 - A.sel.t0; const pps = ((A.laneW || 800) * 0.9) / d; A.setView(pps, A.sel.t0 - d * 0.05); };

/* ---------- mouse ---------- */
function envPointer(e, tr, lane) {
  const r = lane.getBoundingClientRect(), H = r.height;
  const lt = A.xToT(e.clientX) - tr.offset;
  const g = clamp((1 - (e.clientY - r.top) / H) * 2, 0, 2);
  tr.env = tr.env || [];
  let idx = tr.env.findIndex(p => Math.abs(A.tToX(tr.offset + p.t) - (e.clientX - laneLeft())) < 7 && Math.abs(envY(p.g, H) - (e.clientY - r.top)) < 9);
  A.commit('Edit envelope');
  if (idx < 0) {
    if (!tr.env.length) tr.env.push({ t: 0, g: 1 });
    tr.env.push({ t: Math.max(0, lt), g: clamp(Math.round(g * 100) / 100, 0, 2) });
    tr.env.sort((a, b) => a.t - b.t);
    idx = tr.env.findIndex(p => Math.abs(p.t - Math.max(0, lt)) < 1e-9);
  }
  const p = tr.env[idx];
  const mv = ev => {
    const nlt = clamp(A.xToT(ev.clientX) - tr.offset, 0, A.trackLen(tr));
    const lo = idx > 0 ? tr.env[idx - 1].t + 0.001 : 0, hi = idx < tr.env.length - 1 ? tr.env[idx + 1].t - 0.001 : A.trackLen(tr);
    p.t = clamp(nlt, lo, hi);
    let ng = clamp((1 - (ev.clientY - r.top) / H) * 2, 0, 2);
    if (Math.abs(ng - 1) < 0.04) ng = 1;
    p.g = Math.round(ng * 100) / 100;
    drawTrack(tr);
    App.V && App.V.tl && App.V.tl.readout ? App.V.tl.readout(ev, `${p.g ? (App.gainToDb(p.g) > 0 ? '+' : '') + App.gainToDb(p.g).toFixed(1) + ' dB' : '−∞ dB'}  ·  ${fmt(tr.offset + p.t)}`) : 0;
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); App.V && App.V.tl && App.V.tl.readout && App.V.tl.readout(null); A.changed(); if (A.playing) A.seek(A.playhead); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function setupLaneEvents() {
  el.tracks.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); A.zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.clientX); }
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); A.setView(A.pps, A.scroll + (e.deltaX || e.deltaY) / A.pps); }
  }, { passive: false });
  el.tracks.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const lane = e.target.closest('.a-lane');
    if (!lane) return;
    e.preventDefault();
    const tr = A.tracks.find(t => t.id === lane.dataset.id);
    const rows = [...el.tracks.querySelectorAll('.a-track')];
    const startIdx = rows.findIndex(r => r.dataset.id === tr.id);
    const t = A.xToT(e.clientX);
    if (A.tool === 'env') return envPointer(e, tr, lane);
    if (A.tool === 'shift') {
      const o = tr.offset, x0 = e.clientX;
      let committed = false;
      const mv = ev => {
        if (!committed) { A.commit('Time shift'); committed = true; App.sound('grab'); }
        tr.offset = Math.max(0, o + (ev.clientX - x0) / A.pps);
        drawTrack(tr); drawOverview();
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (committed) { A.changed(); App.sound('drop'); } };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
      return;
    }
    let anchor = t, edgeDrag = false;
    if (A.sel && tr.selected) {
      const ex0 = A.tToX(A.sel.t0) + laneLeft(), ex1 = A.tToX(A.sel.t1) + laneLeft();
      if (Math.abs(e.clientX - ex0) < 6) { anchor = A.sel.t1; edgeDrag = true; }
      else if (Math.abs(e.clientX - ex1) < 6) { anchor = A.sel.t0; edgeDrag = true; }
    }
    if (!edgeDrag) {
      if (e.shiftKey && (A.sel || A.cursor != null)) {
        anchor = A.sel ? (Math.abs(t - A.sel.t0) < Math.abs(t - A.sel.t1) ? A.sel.t1 : A.sel.t0) : A.cursor;
        tr.selected = true;
        A.sel = { t0: Math.min(anchor, t), t1: Math.max(anchor, t) };
      } else if (e.ctrlKey || e.metaKey) tr.selected = !tr.selected;
      else A.tracks.forEach(x => x.selected = x === tr);
    }
    const baseSel = new Set(A.tracks.filter(x => x.selected).map(x => x.id));
    let moved = false;
    const mv = ev => {
      if (!moved && Math.abs(ev.clientX - e.clientX) < 3 && Math.abs(ev.clientY - e.clientY) < 3) return;
      moved = true;
      const t2 = Math.max(0, A.xToT(ev.clientX));
      A.sel = { t0: Math.min(anchor, t2), t1: Math.max(anchor, t2) };
      if (!edgeDrag && !e.ctrlKey && !e.shiftKey) {
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const row = under && under.closest('.a-track');
        const idx = row ? rows.indexOf(row) : -1;
        if (idx >= 0) {
          const [a, b] = [Math.min(idx, startIdx), Math.max(idx, startIdx)];
          rows.forEach((r, i) => { const x = A.tracks.find(k => k.id === r.dataset.id); if (x) x.selected = (i >= a && i <= b) || baseSel.has(x.id) && i === startIdx; });
        }
      }
      const lr = el.ruler.getBoundingClientRect();
      if (ev.clientX > lr.right - 10) A.setView(A.pps, A.scroll + 20 / A.pps);
      else if (ev.clientX < lr.left + 10) A.setView(A.pps, A.scroll - 20 / A.pps);
      A.renderHeads(); A.redraw();
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (!moved && !edgeDrag && !e.shiftKey) {
        A.sel = null;
        if (A.playing) A.seek(t); else { A.cursor = A.playhead = Math.max(0, t); }
      } else if (A.sel) {
        if (A.zeroSnap) { const tt = A.selTracks()[0]; if (tt) A.sel = { t0: zeroCross(tt, A.sel.t0), t1: zeroCross(tt, A.sel.t1) }; }
        if (A.sel.t1 - A.sel.t0 < 1 / A.sr) A.sel = null;
        else { A.cursor = A.sel.t0; if (!A.playing) A.playhead = A.sel.t0; }
      }
      A.renderHeads(); A.redraw();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  el.tracks.addEventListener('dblclick', e => {
    const lane = e.target.closest('.a-lane');
    if (!lane) return;
    const tr = A.tracks.find(t => t.id === lane.dataset.id);
    if (A.tool === 'env') {
      const r = lane.getBoundingClientRect();
      const idx = (tr.env || []).findIndex(p => Math.abs(A.tToX(tr.offset + p.t) - (e.clientX - laneLeft())) < 8 && Math.abs(envY(p.g, r.height) - (e.clientY - r.top)) < 10);
      if (idx >= 0) { A.commit('Delete envelope point'); tr.env.splice(idx, 1); if (tr.env.length === 1 && tr.env[0].g === 1) tr.env = []; A.changed(); }
      return;
    }
    A.tracks.forEach(x => x.selected = x === tr);
    A.sel = { t0: tr.offset, t1: A.trackEnd(tr) };
    A.renderHeads(); A.redraw();
  });
  el.tracks.addEventListener('contextmenu', e => {
    const lane = e.target.closest('.a-lane');
    if (!lane) return;
    App.contextMenu(e, [
      { label: 'Play selection', icon: 'play', disabled: !A.sel, tip: 'Plays just the selected range.', action: () => A.play() },
      { label: 'Cut', icon: 'scissors', key: 'Ctrl+X', disabled: !A.sel, tip: 'Removes the selection to the clipboard.', action: A.ops.cut },
      { label: 'Copy', icon: 'copy', key: 'Ctrl+C', disabled: !A.sel, tip: 'Copies the selection.', action: A.ops.copy },
      { label: 'Paste', icon: 'paste', key: 'Ctrl+V', disabled: !A.clipboard, tip: 'Inserts at the cursor.', action: A.ops.paste },
      { label: 'Delete', icon: 'trash', key: 'Del', disabled: !A.sel, tip: 'Removes the selection and closes the gap.', action: () => A.ops.del() },
      { label: 'Silence', icon: 'silence', key: 'Ctrl+L', disabled: !A.sel, tip: 'Mutes the selection.', action: A.ops.silence },
      { sep: true },
      { label: 'Fade in', icon: 'fadeIn', disabled: !A.sel, tip: 'Smooth fade-in over the selection.', action: () => A.applyFx(A.FX.find(f => f.id === 'fadein'), { curve: 'scurve' }) },
      { label: 'Fade out', icon: 'fadeOut', disabled: !A.sel, tip: 'Smooth fade-out over the selection.', action: () => A.applyFx(A.FX.find(f => f.id === 'fadeout'), { curve: 'scurve' }) },
      { label: 'Capture noise profile', icon: 'target', disabled: !A.sel, tip: 'Learns what the background noise sounds like from this selection (use a part with no speech or music).', action: A.captureNoise },
      { label: 'Add region marker', icon: 'flag', disabled: !A.sel, tip: 'Labels the selected range as a region.', action: A.ops.addMarker },
      { label: 'Zoom to selection', icon: 'expand', disabled: !A.sel, tip: 'Fills the view with the selection.', action: A.zoomSel },
    ]);
  });
}
A.captureNoise = () => {
  const tr = A.targets()[0];
  if (!A.sel || !tr) return App.toast('Select a stretch of pure background noise first', 'warn');
  const [s0, s1] = A.sampleRange(tr, A.sel.t0, A.sel.t1);
  if (s1 - s0 < 4096) return App.toast('Select at least 0.1 s of noise', 'warn');
  A.noiseProfile = D.noiseProfile(fitChannels(tr.channels.map(c => c.subarray(s0, s1)), 1)[0]);
  App.toast('Noise profile captured — now select everything and run Noise reduction', 'ok');
};
function markerMenu(m) {
  return [
    { label: 'Rename…', icon: 'tag', tip: 'Change the label.', action: async () => { const v = await App.prompt('Rename', 'Label', m.label); if (v != null) { A.commit('Rename marker'); m.label = v; A.changed(); } } },
    { label: 'Color', icon: 'palette', tip: 'Color-code markers by meaning.', sub: MCOLORS.map(c => ({ label: COLOR_NAMES[c] || c, swatch: c, checked: m.color === c, action: () => { A.commit('Marker color'); m.color = c; A.changed(); } })) },
    m.t1 != null ? { label: 'Select region', icon: 'cursor', tip: 'Selects this region on all tracks.', action: () => { A.sel = { t0: m.t, t1: m.t1 }; if (!A.selTracks().length) A.tracks.forEach(t => t.selected = true); A.renderHeads(); A.redraw(); } } : null,
    m.t1 != null ? { label: 'Export region…', icon: 'download', tip: 'Exports just this region as its own file.', action: () => A.exportDialog(false, { t0: m.t, t1: m.t1, label: m.label, name: m.label }) } : null,
    m.t1 != null ? { label: 'Export all regions…', icon: 'download', tip: 'Saves every region as its own file in one go.', action: A.exportRegions } : null,
    { label: 'Delete', icon: 'trash', tip: 'Removes this marker.', action: () => { A.commit('Delete marker'); A.markers = A.markers.filter(x => x !== m); A.changed(); } },
  ];
}
function setupRuler() {
  el.ruler.addEventListener('pointerdown', e => {
    e.preventDefault();
    const go = ev => A.seek(Math.max(0, A.xToT(ev.clientX)));
    go(e);
    const up = () => { removeEventListener('pointermove', go); removeEventListener('pointerup', up); };
    addEventListener('pointermove', go); addEventListener('pointerup', up);
  });
  el.ruler.addEventListener('wheel', e => { e.preventDefault(); A.zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.clientX); }, { passive: false });
  el.markers.addEventListener('pointerdown', e => {
    const mk = e.target.closest('.a-marker');
    if (!mk || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const m = A.markers.find(x => x.id === mk.dataset.id);
    const x0 = e.clientX, o0 = m.t, o1 = m.t1;
    let moved = false;
    const mv = ev => {
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      if (!moved) { moved = true; A.commit('Move marker'); App.sound('grab'); }
      const d = (ev.clientX - x0) / A.pps;
      m.t = Math.max(0, o0 + d); if (o1 != null) m.t1 = m.t + (o1 - o0);
      drawRuler();
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (moved) { A.changed(); App.sound('drop'); return; }
      if (m.t1 != null) { A.sel = { t0: m.t, t1: m.t1 }; if (!A.selTracks().length) A.tracks.forEach(t => t.selected = true); A.renderHeads(); }
      A.seek(m.t); A.redraw();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  el.markers.addEventListener('dblclick', async e => {
    const mk = e.target.closest('.a-marker');
    if (!mk) return;
    const m = A.markers.find(x => x.id === mk.dataset.id);
    const v = await App.prompt('Rename', 'Label', m.label);
    if (v != null) { A.commit('Rename marker'); m.label = v; A.changed(); }
  });
  el.markers.addEventListener('contextmenu', e => {
    const mk = e.target.closest('.a-marker');
    if (!mk) return;
    App.contextMenu(e, markerMenu(A.markers.find(x => x.id === mk.dataset.id)));
  });
}
function setupOverview() {
  el.ov.addEventListener('pointerdown', e => {
    e.preventDefault();
    const r = el.ov.getBoundingClientRect(), total = el.ovTotal || 1, vis = A.laneW / A.pps;
    const onWin = e.target === el.ovWin;
    const s0 = A.scroll, x0 = e.clientX;
    if (!onWin) A.setView(A.pps, (e.clientX - r.left) / r.width * total - vis / 2);
    const mv = ev => {
      if (onWin) A.setView(A.pps, s0 + (ev.clientX - x0) / r.width * total);
      else A.setView(A.pps, (ev.clientX - r.left) / r.width * total - vis / 2);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
}

/* ---------- footer: selection fields, spectrum, meters ---------- */
function buildFoot(root) {
  const field = (tip, title) => { const f = h('input', { class: 'field', title, tip }); f.addEventListener('keydown', e => { if (e.key === 'Enter') f.blur(); e.stopPropagation(); }); return f; };
  el.fStart = field('Selection start. Type a time like 0:12.5 and press Enter.', 'Start');
  el.fEnd = field('Selection end.', 'End');
  el.fLen = field('Selection length — change it to resize the selection from its start.', 'Length');
  const apply = () => {
    const a = parseTime(el.fStart.value), b = parseTime(el.fEnd.value);
    if (isFinite(a) && isFinite(b) && b > a) { A.sel = { t0: Math.max(0, a), t1: b }; if (!A.selTracks().length) A.tracks.forEach(t => t.selected = true); A.renderHeads(); A.redraw(); }
  };
  el.fStart.addEventListener('change', apply); el.fEnd.addEventListener('change', apply);
  el.fLen.addEventListener('change', () => { const l = parseTime(el.fLen.value), a = A.sel ? A.sel.t0 : A.cursor; if (isFinite(l) && l > 0) { A.sel = { t0: a, t1: a + l }; if (!A.selTracks().length) A.tracks.forEach(t => t.selected = true); A.renderHeads(); A.redraw(); } });
  el.spec = h('canvas');
  el.mL = h('b'); el.mR = h('b'); el.pL = h('i'); el.pR = h('i');
  el.mLbl = h('div', { class: 'hmeter-lbl' }, h('span', null, 'L / R'), h('span', null, '−∞ dB'));
  root.append(
    h('div', { class: 'af-sel' }, h('label', null, 'Start'), el.fStart, h('label', null, 'End'), el.fEnd, h('label', null, 'Length'), el.fLen),
    h('div', { class: 'af-spec', title: 'Spectrum analyzer', tip: 'Live frequency spectrum of what’s playing — bass on the left, treble on the right.' }, el.spec),
    h('div', { class: 'af-meter', title: 'Level meters', tip: 'Peak levels for left and right. The white tick holds the recent maximum; red means clipping.' },
      el.mLbl, h('div', { class: 'hmeter' }, el.mL, el.pL), h('div', { class: 'hmeter' }, el.mR, el.pR),
      h('div', { class: 'hmeter-lbl' }, h('span', null, '−48'), h('span', null, '−24'), h('span', null, '−6'), h('span', null, '0'))));
  drawSpectrum(true);
}
function updSelFields() {
  if (!el.fStart || document.activeElement && document.activeElement.classList.contains('field')) return;
  if (A.sel) { el.fStart.value = fmt(A.sel.t0); el.fEnd.value = fmt(A.sel.t1); el.fLen.value = fmt(A.sel.t1 - A.sel.t0); }
  else { el.fStart.value = fmt(A.cursor); el.fEnd.value = fmt(A.cursor); el.fLen.value = fmt(0); }
}
function drawSpectrum(idle) {
  const cv = el.spec, dpr = App.fitCanvas(cv), ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = cv.clientWidth, H = cv.clientHeight;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = `rgba(${App.th.ink},.05)`; ctx.fillStyle = App.th.dim; ctx.font = '500 9px "JetBrains Mono", monospace';
  const fx = f => Math.log(f / 20) / Math.log(20000 / 20) * W;
  ctx.beginPath();
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = fx(f); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.fillText(f >= 1000 ? f / 1000 + 'k' : f, x + 3, H - 4); }
  ctx.stroke();
  if (idle || !A.anSpec) { ctx.fillStyle = App.th.dim; ctx.font = '600 11px Manrope'; ctx.fillText('Spectrum analyzer — press play', 12, 18); return; }
  const n = A.anSpec.frequencyBinCount, data = new Uint8Array(n);
  A.anSpec.getByteFrequencyData(data);
  const nyq = App.ac().sampleRate / 2;
  const grad = ctx.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, rgba(App.th.audio, 0.15)); grad.addColorStop(1, rgba(App.th.audio, 0.85));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) {
    const f = 20 * Math.pow(1000, x / W), i = Math.min(n - 1, Math.round(f / nyq * n));
    ctx.lineTo(x, H - data[i] / 255 * (H - 4));
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}
const tbuf = new Float32Array(2048);
const peakAn = an => { an.getFloatTimeDomainData(tbuf.subarray(0, an.fftSize)); let m = 0; for (let i = 0; i < an.fftSize; i++) { const v = Math.abs(tbuf[i]); if (v > m) m = v; } return m; };
let hold = [0, 0], holdT = [0, 0];
let previewing = () => false;
function meterLoop() {
  const R = A.recording;
  const ans = R ? [R.inL, R.inR] : A.anL ? [A.anL, A.anR] : null;
  if (ans) {
    const now = performance.now();
    const lv = ans.map(peakAn);
    lv.forEach((v, i) => {
      const db = App.gainToDb(v), pct = clamp((db + 48) / 48 * 100, 0, 100);
      (i ? el.mR : el.mL).style.width = pct + '%';
      if (pct >= hold[i] || now - holdT[i] > 1200) { hold[i] = pct; holdT[i] = now; }
      (i ? el.pR : el.pL).style.left = hold[i] + '%';
    });
    const mx = Math.max(...lv);
    el.mLbl.lastChild.textContent = mx > 0 ? App.gainToDb(mx).toFixed(1) + ' dB' : '−∞ dB';
  }
  drawSpectrum(!(A.playing || previewing()));
  if (A.playing || A.recording || previewing()) requestAnimationFrame(meterLoop);
  else { el.mL.style.width = el.mR.style.width = '0'; }
}

/* ---------- side panel: searchable effect rack ---------- */
function buildSide(root) {
  root.append(h('div', { class: 'panel-head' }, h('span', { class: 'panel-title' }, 'Effects')));
  const body = h('div', { class: 'panel-body' });
  const search = h('input', { class: 'field wide fx-search', placeholder: 'Search effects…', title: 'Search', tip: 'Type to filter the effects list (e.g. “noise”, “voice”, “bass”).', style: { fontFamily: 'var(--font)', height: '30px', fontSize: '12px', width: 'calc(100% - 16px)' } });
  search.addEventListener('keydown', e => e.stopPropagation());
  body.append(search, h('div', { class: 'hint' }, 'Effects change the ', h('b', null, 'selection'), ' — or whole selected tracks if nothing is selected. Every effect has a live ', h('b', null, 'Preview'), '.'));
  const list = h('div', { class: 'fx-list' });
  const items = [];
  let cat = null, catEl = null;
  for (const fx of A.FX) {
    if (fx.cat !== cat) { cat = fx.cat; catEl = h('div', { class: 'fx-cat' }, cat); list.append(catEl); }
    const b = h('button', { class: 'fx-btn', title: fx.name, tip: fx.tip, tipPos: 'left' }, icon(fx.icon, 16), fx.name);
    b.addEventListener('click', () => A.fxDialog(fx));
    list.append(b); items.push({ b, text: (fx.name + ' ' + fx.tip + ' ' + fx.cat).toLowerCase(), cat: catEl });
  }
  const gcat = h('div', { class: 'fx-cat' }, 'Generate');
  list.append(gcat);
  for (const g of A.GEN) {
    const b = h('button', { class: 'fx-btn', title: g.name.replace('…', ''), tip: g.tip, tipPos: 'left' }, icon(g.icon, 16), g.name.replace('…', ''));
    b.addEventListener('click', () => A.genDialog(g));
    list.append(b); items.push({ b, text: (g.name + ' ' + g.tip + ' generate').toLowerCase(), cat: gcat });
  }
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    const cats = new Set();
    for (const it of items) { const on = !q || q.split(/\s+/).every(w => it.text.includes(w)); it.b.style.display = on ? '' : 'none'; if (on) cats.add(it.cat); }
    list.querySelectorAll('.fx-cat').forEach(c => c.style.display = cats.has(c) ? '' : 'none');
  });
  body.append(list);
  root.append(body);
}

/* ---------- effect & generator dialogs ---------- */
function paramControls(defs, vals, onChange, ctx) {
  return defs.map(p => {
    if (p.type === 'select' || p.type === 'track') {
      const opts = p.type === 'track' ? A.tracks.filter(t => !ctx || t !== ctx.tr).map(t => [t.id, t.name]) : p.options;
      if (p.type === 'track' && vals[p.id] == null && opts.length) vals[p.id] = opts[0][0];
      return App.select({ label: p.label, value: vals[p.id], options: opts.length ? opts : [['', '(no other tracks)']], tip: p.tip, onChange: v => { vals[p.id] = v; onChange && onChange(); } });
    }
    if (p.type === 'toggle') return App.toggle({ label: p.label, value: !!vals[p.id], tip: p.tip, onChange: v => { vals[p.id] = v ? 1 : 0; onChange && onChange(); } });
    const s = App.slider({ label: p.label, min: p.min, max: p.max, step: p.step, value: vals[p.id], def: p.def, unit: p.unit, tip: p.tip || '', onInput: v => { vals[p.id] = v; onChange && onChange(); } });
    s._pid = p.id;
    return s;
  });
}
/** Looping live preview of an effect on (up to) 12 s of the selection, with A/B against the original. */
function makePreviewer(fx, vals) {
  const ac = App.ac();
  const P = { on: false, mode: 'proc', src: null, orig: null, proc: null, t0: 0, busy: false, dirty: false };
  const tr = A.targets()[0];
  const t0 = A.sel ? A.sel.t0 : tr.offset, t1 = Math.min(A.sel ? A.sel.t1 : A.trackEnd(tr), t0 + 12);
  const [s0, s1] = A.sampleRange(tr, t0, t1);
  const seg = tr.channels.map(c => c.slice(s0, s1));
  const toBuf = chs => { const b = new AudioBuffer({ length: Math.max(1, chs[0].length), numberOfChannels: chs.length, sampleRate: A.sr }); chs.forEach((c, i) => b.copyToChannel(c, i)); return b; };
  P.valid = s1 - s0 >= 64;
  P.orig = P.valid ? toBuf(seg) : null;
  const g = ac.createGain(); g.gain.value = App.dbToGain(tr.gain);
  const pos = () => { const b = P.mode === 'proc' ? P.proc : P.orig; return b ? ((ac.currentTime - P.t0) % b.duration + b.duration) % b.duration : 0; };
  const play = (buf, at) => {
    if (P.src) { try { P.src.stop(); } catch {} P.src.disconnect(); }
    A.ensureMaster(); g.connect(A.master);
    P.src = ac.createBufferSource(); P.src.buffer = buf; P.src.loop = true; P.src.connect(g);
    const off = buf.duration ? at % buf.duration : 0;
    P.src.start(0, off); P.t0 = ac.currentTime - off;
  };
  const render = async () => {
    if (P.busy) { P.dirty = true; return; }
    P.busy = true;
    try { P.proc = toBuf(fitChannels(await fx.run(seg.map(c => c.slice()), A.sr, { ...vals }, { tr, s0, s1 }), seg.length)); }
    catch (e) { App.toast(e.message, 'err', 4000); P.busy = false; return; }
    P.busy = false;
    if (P.dirty) { P.dirty = false; return render(); }
    if (P.on && P.mode === 'proc') play(P.proc, pos());
  };
  let tmr = 0;
  P.changed = () => { if (!P.on) return; clearTimeout(tmr); tmr = setTimeout(render, 220); };
  P.start = async () => { if (!P.valid) return App.toast('Nothing to preview here', 'warn'); A.pause(); P.on = true; await render(); if (P.on && P.proc) { play(P.mode === 'proc' ? P.proc : P.orig, 0); meterLoop(); } };
  P.stop = () => { P.on = false; if (P.src) { try { P.src.stop(); } catch {} P.src.disconnect(); P.src = null; } };
  P.ab = mode => { const at = pos(); P.mode = mode; if (P.on) play(mode === 'proc' ? (P.proc || P.orig) : P.orig, at); };
  return P;
}
A.fxDialog = fx => {
  if (fx.instant) return A.applyFx(fx, {});
  if (!A.targets().length) return needTarget();
  const vals = {};
  for (const p of fx.params) vals[p.id] = p.def;
  if (A.lastFx && A.lastFx.fx === fx) Object.assign(vals, A.lastFx.params);
  const ctx = { tr: A.targets()[0] };
  const PV = makePreviewer(fx, vals);
  previewing = () => PV.on;
  let eqCanvas = null;
  const redrawEq = () => eqCanvas && drawEqCurve(eqCanvas, fx, vals);
  const changed = () => { redrawEq(); PV.changed(); };
  const ctlWrap = h('div');
  const rebuild = () => {
    ctlWrap.innerHTML = '';
    if (fx.eq) {
      eqCanvas = h('canvas', { class: 'eq-canvas', title: 'Frequency response', tip: 'The resulting tone curve: above the line = boosted, below = cut.' });
      const bands = h('div', { class: 'eq-bands' });
      for (const p of fx.params.filter(p => p.f)) {
        const inp = h('input', { type: 'range', min: p.min, max: p.max, step: p.step, value: vals[p.id], 'aria-label': p.label + ' Hz' });
        const v = h('b', null, (vals[p.id] > 0 ? '+' : '') + vals[p.id]);
        App.setRangeFill(inp);
        inp.addEventListener('input', () => { vals[p.id] = +inp.value; v.textContent = (vals[p.id] > 0 ? '+' : '') + vals[p.id]; changed(); });
        inp.addEventListener('dblclick', () => { inp.value = 0; inp.dispatchEvent(new Event('input')); App.setRangeFill(inp); });
        bands.append(h('div', { class: 'eq-band', title: p.label + ' Hz', tip: `Boost or cut around ${p.label} Hz. ${p.f <= 125 ? 'Bass: warmth and thump.' : p.f <= 500 ? 'Low-mids: body (too much = muddy).' : p.f <= 2000 ? 'Mids: presence and honk.' : p.f <= 8000 ? 'Upper-mids/treble: clarity and bite.' : 'Air: sparkle and breath.'} Double-click to reset.` }, v, inp, h('span', null, p.label)));
      }
      ctlWrap.append(h('div', { style: { padding: '0 14px' } }, eqCanvas), bands);
      ctlWrap.append(...paramControls(fx.params.filter(p => !p.f), vals, changed, ctx));
      requestAnimationFrame(redrawEq);
    } else ctlWrap.append(...paramControls(fx.params, vals, changed, ctx));
  };
  rebuild();
  const presetSel = fx.presets ? App.select({ label: 'Preset', value: '', tip: 'Starting points — pick one, then tweak.', options: [['', 'Choose a preset…'], ...Object.keys(fx.presets).map(k => [k, k])], onChange: v => {
    if (!v) return;
    for (const p of fx.params) vals[p.id] = p.def;
    Object.assign(vals, fx.presets[v]);
    rebuild(); PV.changed();
  } }) : null;
  const liveDot = h('i', { class: 'live-dot', style: { display: 'none' } });
  const abSeg = App.seg({ value: 'proc', onChange: v => PV.ab(v), options: [
    { value: 'proc', label: 'Processed', tip: 'Hear the audio with the effect.' },
    { value: 'orig', label: 'Original', tip: 'Hear the untouched audio (A/B comparison).' }] });
  abSeg.style.display = 'none';
  const previewBtn = btn({ icon: 'play', label: 'Live preview', cls: 'solid txt', title: 'Live preview', tip: 'Loops up to 12 seconds of the selection with the effect. Change any setting and you’ll hear it within a moment — nothing is changed until you press Apply.', onClick: async () => {
    if (PV.on) { PV.stop(); previewBtn.querySelector('span').textContent = 'Live preview'; liveDot.style.display = 'none'; abSeg.style.display = 'none'; return; }
    await PV.start();
    if (PV.on) { previewBtn.querySelector('span').textContent = 'Stop'; liveDot.style.display = ''; abSeg.style.display = ''; }
  } });
  const extra = [];
  if (fx.denoise) {
    const st = h('span', { class: 'hint', style: { padding: 0 } }, A.noiseProfile ? '✓ Noise profile ready' : 'No profile yet');
    extra.push(h('div', { class: 'ctl', style: { gap: '10px' } }, btn({ icon: 'target', label: 'Capture noise profile', cls: 'solid txt sm', title: 'Capture noise profile', tip: 'Step 1: select a few seconds of only background noise (no voice/music), then click this.', onClick: () => { A.captureNoise(); st.textContent = A.noiseProfile ? '✓ Noise profile ready' : 'No profile yet'; } }), st));
    extra.push(h('div', { class: 'hint' }, 'Step 2: select the whole recording (Ctrl+A) and press Apply.'));
  }
  if (fx.needsControl && A.tracks.length < 2) extra.push(h('div', { class: 'hint', style: { color: 'var(--warn)' } }, 'Auto-duck needs a second track (e.g. a voice-over) to listen to.'));
  App.modal({
    title: fx.name, icon: fx.icon, width: fx.eq ? 490 : 430,
    body: h('div', null, h('div', { class: 'hint', style: { paddingTop: 0 } }, fx.tip), ...extra, presetSel, ctlWrap),
    left: h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, previewBtn, liveDot, abSeg),
    buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, tip: 'Processes the audio (undo with Ctrl+Z).', onClick: () => { PV.stop(); A.applyFx(fx, { ...vals }); } }],
    onClose: () => { PV.stop(); previewing = () => false; },
  });
};
function drawEqCurve(cv, fx, vals) {
  const dpr = App.fitCanvas(cv), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const ac = App.ac(), nodes = fx.build(ac, vals);
  const N = 256, freqs = new Float32Array(N), mag = new Float32Array(N), ph = new Float32Array(N), tot = new Float32Array(N).fill(0);
  for (let i = 0; i < N; i++) freqs[i] = 20 * Math.pow(1000, i / (N - 1));
  for (const n of nodes) { n.getFrequencyResponse(freqs, mag, ph); for (let i = 0; i < N; i++) tot[i] += 20 * Math.log10(mag[i]); }
  const out = vals.out || 0;
  const y = db => H / 2 - (db / 18) * (H / 2 - 6);
  ctx.strokeStyle = `rgba(${App.th.ink},.06)`; ctx.lineWidth = dpr; ctx.beginPath();
  for (const d of [-12, -6, 0, 6, 12]) { ctx.moveTo(0, y(d)); ctx.lineTo(W, y(d)); }
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = Math.log(f / 20) / Math.log(1000) * W; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  ctx.stroke();
  ctx.fillStyle = App.th.dim; ctx.font = `${9 * dpr}px JetBrains Mono`;
  for (const f of [100, 1000, 10000]) ctx.fillText(f >= 1000 ? f / 1000 + 'k' : f, Math.log(f / 20) / Math.log(1000) * W + 3, H - 4);
  ctx.beginPath();
  for (let i = 0; i < N; i++) { const x = i / (N - 1) * W, yy = y(tot[i] + out); i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
  ctx.strokeStyle = App.th.audio; ctx.lineWidth = 2 * dpr; ctx.stroke();
  ctx.lineTo(W, H / 2); ctx.lineTo(0, H / 2); ctx.closePath();
  ctx.fillStyle = rgba(App.th.audio, 0.12); ctx.fill();
}
A.genDialog = g => {
  const vals = {};
  for (const p of g.params) vals[p.id] = p.def;
  App.modal({
    title: 'Generate ' + g.name.replace('…', '').toLowerCase(), icon: g.icon, width: 400,
    body: h('div', null, h('div', { class: 'hint', style: { paddingTop: 0 } }, g.tip + (A.sel ? ' It will fill the current selection.' : ' It is inserted at the cursor (a new track is created if none is selected).')), ...paramControls(g.params, vals)),
    buttons: [{ label: 'Cancel' }, { label: 'Generate', primary: true, onClick: () => {
      const len = A.sel ? A.sel.t1 - A.sel.t0 : vals.dur;
      const n = Math.max(1, Math.round(len * A.sr));
      const mono = g.make(n, A.sr, vals);
      A.commit('Generate ' + g.name.replace('…', ''));
      const tgs = A.selTracks();
      if (!tgs.length) {
        const tr = A.newTrack([mono, mono.slice()], g.name.replace('…', ''), A.sel ? A.sel.t0 : A.cursor);
        A.tracks.forEach(t => t.selected = t === tr);
      } else for (const tr of tgs) {
        const chs = tr.channels.map(() => mono.slice());
        if (A.sel) { const [s0, s1] = A.sampleRange(tr, A.sel.t0, A.sel.t1); if (s1 > s0) replaceSeg(tr, s0, s1, chs.map(c => c.subarray(0, s1 - s0))); else insertAt(tr, A.sel.t0, chs); }
        else insertAt(tr, A.cursor, chs);
      }
      if (!A.sel) A.sel = { t0: A.cursor, t1: A.cursor + len };
      A.changed();
      if (A.tracks.length === 1 && A.duration() < 15) A.zoomFit();
    } }],
  });
};

/* ---------- analysis ---------- */
A.statsDialog = async () => {
  const tgs = A.targets();
  if (!tgs.length) return needTarget('Select a track first');
  A.busy(true, 'Measuring loudness…');
  const rows = [];
  try {
    for (const tr of tgs) {
      const [s0, s1] = A.sel ? A.sampleRange(tr, A.sel.t0, A.sel.t1) : [0, tr.channels[0].length];
      let pk = 0, sq = 0, sum = 0, clip = 0, n = 0;
      for (const c of tr.channels) for (let i = s0; i < s1; i++) { const v = c[i], a = Math.abs(v); if (a > pk) pk = a; sq += v * v; sum += v; if (a >= 0.999) clip++; n++; }
      const rms = Math.sqrt(sq / Math.max(1, n));
      const L = (s1 - s0) > A.sr * 0.5 ? await D.work('loudness', tr.channels.map(c => c.slice(s0, s1)), A.sr) : null;
      const lu = v => isFinite(v) ? v.toFixed(1) + ' LUFS' : '—';
      rows.push([tr.name, [
        ['Integrated loudness', L ? lu(L.integrated) : 'too short'], ['Short-term max (3 s)', L ? lu(L.shortMax) : '—'], ['Momentary max (0.4 s)', L ? lu(L.momentaryMax) : '—'],
        ['Peak level', pk ? App.gainToDb(pk).toFixed(2) + ' dBFS' : '−∞'], ['Average (RMS)', rms ? App.gainToDb(rms).toFixed(2) + ' dBFS' : '−∞'],
        ['Crest factor', pk && rms ? (App.gainToDb(pk) - App.gainToDb(rms)).toFixed(1) + ' dB' : '—'],
        ['DC offset', (sum / Math.max(1, n) * 100).toFixed(3) + ' %'], ['Clipped samples', clip ? String(clip) + ' ⚠' : 'none'], ['Length', fmt((s1 - s0) / A.sr)]]]);
    }
  } finally { A.busy(false); }
  const body = h('div', { class: 'shortcut-grid', style: { gridTemplateColumns: '1fr' } });
  for (const [name, list] of rows) {
    body.append(h('h4', null, name + (A.sel ? ' · selection' : ' · whole track')));
    for (const [k, v] of list) body.append(h('div', { class: 'sc' }, h('span', null, k), h('b', { class: 'mono' }, v)));
  }
  body.append(h('div', { class: 'hint', style: { padding: '10px 0 0' } }, 'Targets: Spotify/YouTube ≈ −14 LUFS, podcasts ≈ −16 LUFS, broadcast −23 LUFS. Use Effect ▸ Loudness normalize to hit them. Any clipped samples mean distortion.'));
  App.modal({ title: 'Loudness & statistics', icon: 'lufs', width: 460, body });
};
A.spectrumDialog = () => {
  const tr = A.targets()[0];
  if (!tr) return needTarget('Select a track first');
  const [s0, s1] = A.sel ? A.sampleRange(tr, A.sel.t0, A.sel.t1) : [0, tr.channels[0].length];
  const N = 4096, mono = fitChannels(tr.channels.map(c => c.subarray(s0, s1)), 1)[0];
  const acc = new Float32Array(N / 2);
  let frames = 0;
  const hop = Math.max(N / 2, Math.floor((mono.length - N) / 400));
  for (let p = 0; p + N <= mono.length; p += hop) { const sp = D.spectrumAt(mono, p, N); for (let i = 0; i < N / 2; i++) acc[i] += Math.pow(10, sp[i] / 10); frames++; }
  if (!frames) return App.toast('Select a longer region (at least 0.1 s)', 'warn');
  const cv = h('canvas', { style: { width: '100%', height: '280px', display: 'block', borderRadius: '8px', background: 'var(--well)' } });
  const readout = h('div', { class: 'hint mono' }, 'Hover the plot to read frequency and level.');
  App.modal({ title: 'Frequency spectrum · ' + tr.name, icon: 'spectrum', width: 640, pad: true, body: h('div', null, cv, readout) });
  requestAnimationFrame(() => {
    const dpr = App.fitCanvas(cv), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, nyq = A.sr / 2;
    const xOf = f => Math.log(f / 20) / Math.log(nyq / 20) * W, yOf = d => (-d / 100) * H;
    ctx.strokeStyle = `rgba(${App.th.ink},.06)`; ctx.lineWidth = dpr; ctx.fillStyle = App.th.dim; ctx.font = `${10 * dpr}px JetBrains Mono`; ctx.beginPath();
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) { if (f > nyq) continue; const x = xOf(f); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.fillText(f >= 1000 ? f / 1000 + 'k' : f, x + 3, H - 5); }
    for (const d of [-20, -40, -60, -80]) { ctx.moveTo(0, yOf(d)); ctx.lineTo(W, yOf(d)); ctx.fillText(d + ' dB', 4, yOf(d) - 3); }
    ctx.stroke();
    ctx.beginPath();
    const dbs = new Float32Array(N / 2);
    for (let i = 1; i < N / 2; i++) { dbs[i] = 10 * Math.log10(acc[i] / frames + 1e-12); const x = xOf(i / (N / 2) * nyq), y = yOf(Math.max(-100, dbs[i])); i === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.strokeStyle = App.th.audio; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect(), f = 20 * Math.pow(nyq / 20, (e.clientX - r.left) / r.width), i = Math.round(f / nyq * N / 2);
      readout.textContent = `${f < 1000 ? f.toFixed(0) + ' Hz' : (f / 1000).toFixed(2) + ' kHz'}  ·  ${dbs[i] ? dbs[i].toFixed(1) : '—'} dB`;
    });
  });
};

/* =====================================================================
   Module
   ===================================================================== */
App.on('audio:open', d => { App.setMode('audio'); A.openData(d); });
App.modules = App.modules || {};
App.modules.audio = {
  menus: () => menus(),
  init() {
    A.sr = App.ac().sampleRate;
    const root = document.getElementById('mod-audio');
    el.root = root;
    try { if (localStorage.getItem('strata.a.noside') === '1') root.classList.add('no-side'); } catch {}
    const top = h('div', { class: 'panel mhead a-top' });
    const main = h('div', { class: 'panel a-main' });
    const side = h('div', { class: 'panel a-side' });
    const foot = h('div', { class: 'panel a-foot' });
    root.append(top, main, side, foot);
    buildTop(top); buildMain(main); buildSide(side); buildFoot(foot);
    A.changed(true);
    A.setView(60, 0);
    A.refreshDevices();
    A.restoreSession().then(ok => { if (ok) App.toast(`Restored “${A.name}”`, 'ok', 3000, { label: 'Start new', fn: A.newProject }); });
  },
  loadProject: (data, blobs, fname) => A.loadProject(data, blobs, fname),
  flushSave() { return A.saveSoon.now(); },
  toggleSide: () => toggleSide(),
  hide() { A.pause(); },
  onKey(e) {
    const k = App.combo(e);
    const step = 20 / A.pps;
    const map = {
      'space': A.toggle, 'home': () => A.seek(0), 'end': () => A.seek(A.duration()),
      'r': A.record, 'l': () => el.loopBtn.click(), 'm': A.ops.addMarker,
      'ctrl+z': A.undo, 'ctrl+shift+z': A.redo, 'ctrl+y': A.redo,
      'ctrl+x': A.ops.cut, 'ctrl+c': A.ops.copy, 'ctrl+v': A.ops.paste,
      'delete': () => A.ops.del(), 'backspace': () => A.ops.del(),
      'ctrl+l': A.ops.silence, 'ctrl+t': A.ops.trim, 'ctrl+d': () => A.ops.duplicate(false), 'ctrl+shift+d': () => A.ops.duplicate(true),
      'ctrl+a': A.ops.selectAll, 'escape': A.ops.selectNone,
      'ctrl+i': A.importDialog, 'ctrl+e': () => A.exportDialog(false), 'ctrl+s': A.saveProjectFile, 'ctrl+r': A.repeatLast, 'ctrl+shift+s': A.removeSilences,
      '=': () => A.zoomBy(1.6), 'shift+=': () => A.zoomBy(1.6), '-': () => A.zoomBy(1 / 1.6), 'f': A.zoomFit, 'z': A.zoomSel,
      'i': () => A.setTool('select'), 't': () => A.setTool('shift'), 'e': () => A.setTool('env'),
      'arrowleft': () => { A.sel = null; A.seek(Math.max(0, A.cursor - step)); A.redraw(); },
      'arrowright': () => { A.sel = null; A.seek(A.cursor + step); A.redraw(); },
      'shift+arrowleft': () => { const a = A.sel ? A.sel.t0 : A.cursor, b = A.sel ? A.sel.t1 : A.cursor; A.sel = { t0: Math.max(0, a - step), t1: b }; A.redraw(); },
      'shift+arrowright': () => { const a = A.sel ? A.sel.t0 : A.cursor, b = A.sel ? A.sel.t1 : A.cursor; A.sel = { t0: a, t1: b + step }; A.redraw(); },
    };
    const fn = map[k];
    if (fn) { e.preventDefault(); fn(); return true; }
    return false;
  },
  shortcuts: [
    ['Transport', [['Space', 'Play / pause'], ['Home / End', 'Start / end'], ['R', 'Record (toggle)'], ['L', 'Loop selection'], ['← / →', 'Move cursor'], ['Shift + ← / →', 'Extend selection'], ['M', 'Add marker / region']]],
    ['Editing', [['Ctrl + X / C / V', 'Cut / copy / paste'], ['Del', 'Delete selection'], ['Ctrl + L', 'Silence selection'], ['Ctrl + T', 'Trim to selection'], ['Ctrl + D', 'Duplicate to new track'], ['Ctrl + Shift + D', 'Split to new track'], ['Ctrl + R', 'Repeat last effect'], ['Ctrl + Shift + S', 'Remove silences'], ['Ctrl + Z / Shift + Z', 'Undo / redo'], ['Ctrl + S', 'Save project file']]],
    ['Selection & view', [['Drag', 'Select a range (across tracks)'], ['Shift + click', 'Extend selection'], ['Double-click', 'Select whole track'], ['Ctrl + A / Esc', 'Select all / none'], ['= / -', 'Zoom in / out'], ['F / Z', 'Fit project / zoom to selection'], ['Ctrl + wheel', 'Zoom at cursor'], ['Shift + wheel', 'Scroll horizontally'], ['I / T / E', 'Selection / time-shift / envelope tool']]],
  ],
};
})();
