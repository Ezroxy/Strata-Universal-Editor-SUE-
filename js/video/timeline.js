/* Video editor — timeline UI (tracks, clips, ruler, markers) and editing operations */
(() => {
'use strict';
const App = window.App, V = App.V;
const { h, icon, btn, clamp } = App;
const T = V.tl = {};
const O = V.ops = {};
const HEAD = 156;
const BASE_H = { video: 64, audio: 52 };
V.trackScale = 1;
const TRACK_H = new Proxy({}, { get: (_, k) => Math.round(BASE_H[k] * V.trackScale) });
const EPS = 1e-6;
const tc = t => App.tc(t, V.project.fps);
const shortTc = t => {
  const fps = V.project.fps, f = Math.round(t * fps), s = Math.floor(f / fps);
  const m = Math.floor(s / 60), hh = Math.floor(m / 60);
  return (hh ? hh + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0');
};

/* =====================================================================
   Edit operations
   ===================================================================== */
const selClips = () => [...V.sel].map(V.getClip).filter(Boolean);
O.selClips = selClips;
O.targetsAt = t => {
  const under = c => t > c.start + EPS && t < c.start + c.dur - EPS && !V.trackLocked(c.trackId);
  const s = selClips().filter(under);
  return s.length ? s : V.clips.filter(under);
};
O.splitAtPlayhead = () => {
  const t = V.snapFrame(V.time);
  const cs = O.targetsAt(t);
  if (!cs.length) return App.toast('No clip under the playhead to split');
  V.commit('Split');
  for (const c of cs) V.splitClip(c, t);
  V.changed();
};
O.splitAt = (c, t, allTracks) => {
  t = V.snapFrame(t);
  const cs = allTracks ? V.clips.filter(k => t > k.start + EPS && t < k.start + k.dur - EPS && !V.trackLocked(k.trackId)) : [c];
  if (!cs.length) return;
  V.commit('Blade cut');
  for (const k of cs) V.splitClip(k, t);
  V.changed();
};
O.trimStartToPlayhead = () => {
  const t = V.snapFrame(V.time);
  const cs = O.targetsAt(t);
  if (!cs.length) return App.toast('Place the playhead over a clip first');
  V.commit('Trim start to playhead');
  let seekTo = t;
  for (const c of cs) {
    const d = t - c.start, oldEnd = c.start + c.dur;
    c.in += d * c.speed; c.dur -= d; V.shiftKf(c, d);
    V.rippleShift(c.trackId, oldEnd, -d, new Set([c.id]));
    seekTo = Math.min(seekTo, c.start);
  }
  V.changed(); V.seek(seekTo);
};
O.trimEndToPlayhead = () => {
  const t = V.snapFrame(V.time);
  const cs = O.targetsAt(t);
  if (!cs.length) return App.toast('Place the playhead over a clip first');
  V.commit('Trim end to playhead');
  for (const c of cs) {
    const oldEnd = c.start + c.dur, d = oldEnd - t;
    c.dur -= d;
    V.rippleShift(c.trackId, oldEnd, -d, new Set([c.id]));
  }
  V.changed();
};
O.deleteSel = (ripple = V.ripple) => {
  const ids = new Set(selClips().filter(c => !V.trackLocked(c.trackId)).map(c => c.id));
  if (!ids.size) return;
  V.commit(ripple ? 'Ripple delete' : 'Delete');
  ripple ? V.rippleDelete(ids) : V.removeClips(ids);
  V.changed();
  App.toast(`${ripple ? 'Ripple-deleted' : 'Deleted'} ${ids.size} clip${ids.size > 1 ? 's' : ''}`, '', 3500, { label: 'Undo', fn: V.undo });
};
/** Auto-cut pauses: detects silences in the selected clips' sound and removes / shortens / mutes / marks them. */
O.removeSilences = () => {
  let S = selClips().filter(c => !V.trackLocked(c.trackId));
  if (!S.length) S = V.clips.filter(c => V.hasAudio(c) && !V.trackLocked(c.trackId));
  // include linked partners (a video and its detached audio) so picture and sound stay in sync
  for (const c of [...S]) for (const k of V.clips) if (!S.includes(k) && k.mediaId && k.mediaId === c.mediaId && Math.abs(k.start - c.start) < V.frame() && Math.abs(k.in - c.in) < 0.05 && !V.trackLocked(k.trackId)) S.push(k);
  const audible = S.filter(c => { const m = V.getMedia(c.mediaId); return V.hasAudio(c) && m && m.audioBuffer; });
  if (!audible.length) return App.toast(S.length ? 'The selected clips have no sound to analyze' : 'Add a clip with sound (a video or audio file) first', 'warn');
  const t0 = Math.min(...S.map(c => c.start)), t1 = Math.max(...S.map(V.end));
  const src = list => list.map(c => { const ab = V.getMedia(c.mediaId).audioBuffer; return { chs: Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i)), sr: ab.sampleRate, start: c.start, dur: c.dur, srcStart: c.in, speed: c.speed, gain: c.muted ? 0 : c.volume }; });
  const cache = {};
  const tracksOf = [...new Set(S.map(c => c.trackId))];
  const closeRow = App.select({ label: 'Close gaps on', value: 'selected', options: [['selected', 'These clips’ tracks'], ['all', 'All tracks (keep everything in sync)']], tip: 'These clips’ tracks: only the selected clips are cut and their tracks slide left. All tracks: the same moments are cut from every track — music, titles and overlays stay lined up with the speech.' });
  App.silenceDialog({
    title: 'Remove silences',
    hint: `Finds the pauses in ${S.length === 1 ? '“' + V.clipName(S[0]) + '”' : S.length + ' clips'} and cuts them out — a quick way to tighten talking-head videos, vlogs and tutorials.`,
    sources: [{ value: 'all', label: audible.length > 1 ? 'All these clips’ sound' : V.clipName(audible[0]) }, ...(audible.length > 1 ? audible.map(c => ({ value: c.id, label: 'Only “' + V.clipName(c) + '”' })) : [])],
    analyze: v => cache[v] || (cache[v] = { levels: App.dsp.levels(src(v === 'all' ? audible : audible.filter(c => c.id === v)), t0, t1, 0.01), hop: 0.01, t0, t1 }),
    extra: [closeRow],
    apply: (regions, p) => {
      const label = { delete: 'Remove silences', shorten: 'Shorten pauses', mute: 'Mute silences', mark: 'Mark silences' }[p.action];
      const regs = regions.map(r => ({ t0: V.snapFrame(r.t0), t1: V.snapFrame(r.t1) })).filter(r => r.t1 - r.t0 >= V.frame() - 1e-6).sort((a, b) => b.t0 - a.t0);
      if (!regs.length) return App.toast('Nothing long enough to cut', 'warn');
      V.commit(label);
      const colors = ['#ff6fae'];
      if (p.action === 'mark') {
        [...regs].reverse().forEach((r, i) => V.markers.push({ id: App.uid('mk'), t: r.t0, label: 'Silence ' + (i + 1), color: colors[0] }));
        V.markers.sort((a, b) => a.t - b.t);
        V.changed();
        return App.toast(`Added ${regs.length} silence markers`, 'ok', 4000, { label: 'Undo', fn: V.undo });
      }
      const cut = new Set(S.map(c => c.id)), all = closeRow.get() === 'all';
      const tracks = all ? V.tracks.filter(t => !t.locked).map(t => t.id) : tracksOf;
      const FADE = 0.015;
      const splitOut = (c, r) => {   // returns the piece covering [r.t0, r.t1)
        const e = V.end(c);
        if (e <= r.t0 + EPS || c.start >= r.t1 - EPS) return null;
        let mid = c;
        if (c.start < r.t0 - EPS) { const s = V.splitClip(c, r.t0); if (!s) return null; mid = s; cut.add(mid.id); c.fadeOut = c.fadeOut || FADE; }
        if (V.end(mid) > r.t1 + EPS) { const right = V.splitClip(mid, r.t1); if (right) { cut.add(right.id); right.fadeIn = right.fadeIn || FADE; } }
        return mid;
      };
      let removed = 0;
      for (const r of regs) {
        const len = r.t1 - r.t0;
        if (p.action === 'mute') { for (const c of V.clips.filter(k => cut.has(k.id) && V.hasAudio(k))) { const m = splitOut(c, r); if (m) m.muted = true; } continue; }   // silent partners stay whole
        if (all) for (const tid of tracks) {
          for (const c of V.clips.filter(k => k.trackId === tid && V.end(k) > r.t0 + EPS && k.start < r.t1 - EPS)) { const m = splitOut(c, r); if (m) V.clips.splice(V.clips.indexOf(m), 1); }
        } else for (const c of V.clips.filter(k => cut.has(k.id))) { const m = splitOut(c, r); if (m) V.clips.splice(V.clips.indexOf(m), 1); }
        for (const tid of tracks) V.rippleShift(tid, r.t1, -len);
        for (const m of V.markers) { if (m.t >= r.t1) m.t -= len; else if (m.t > r.t0) m.t = r.t0; }
        removed += len;
      }
      V.sel = new Set([...V.sel].filter(id => V.getClip(id)));
      V.changed();
      if (V.time > V.duration()) V.seek(V.duration());
      App.toast(p.action === 'mute' ? `Muted ${regs.length} silences` : `${p.action === 'shorten' ? 'Shortened' : 'Removed'} ${regs.length} silences · ${removed.toFixed(1)} s shorter`, 'ok', 5000, { label: 'Undo', fn: V.undo });
    },
  });
};
const ATTRS = ['x', 'y', 'scale', 'rotation', 'opacity', 'flipH', 'flipV', 'fit', 'blend', 'motion', 'crop', 'fx', 'key', 'mask', 'border', 'shadow', 'kf'];
O.copyAttrs = () => {
  const c = selClips()[0];
  if (!c) return App.toast('Select a clip to copy its look from');
  V.attrClipboard = JSON.parse(JSON.stringify(Object.fromEntries(ATTRS.map(k => [k, c[k]]))));
  App.toast('Copied clip attributes — select other clips and choose Paste attributes', 'ok');
};
O.pasteAttrs = () => {
  const cs = selClips().filter(V.isVisual);
  if (!V.attrClipboard || !cs.length) return App.toast(V.attrClipboard ? 'Select clips to paste onto' : 'Copy attributes from a clip first');
  V.commit('Paste attributes');
  for (const c of cs) Object.assign(c, JSON.parse(JSON.stringify(V.attrClipboard)));
  V.changed();
  App.toast(`Pasted attributes onto ${cs.length} clip${cs.length > 1 ? 's' : ''}`, 'ok');
};
O.resetLook = () => {
  const cs = selClips().filter(V.isVisual);
  if (!cs.length) return;
  V.commit('Reset clip');
  const d = V.clipDefaults();
  for (const c of cs) for (const k of ATTRS) c[k] = JSON.parse(JSON.stringify(d[k]));
  V.changed();
};
O.setTrackScale = s => { V.trackScale = s; T.render(); try { localStorage.setItem('strata.trackScale', s); } catch {} };
O.duplicate = () => {
  const cs = selClips();
  if (!cs.length) return;
  V.commit('Duplicate');
  const end = Math.max(...cs.map(V.end)), start = Math.min(...cs.map(c => c.start));
  const ns = new Set();
  for (const c of cs) {
    const k = V.cloneClip(c); k.start = c.start + (end - start);
    V.clearRange(k.trackId, k.start, k.start + k.dur);
    V.clips.push(k); ns.add(k.id);
  }
  V.sel = ns; V.changed();
};
O.copy = () => {
  const cs = selClips();
  if (!cs.length) return;
  const t0 = Math.min(...cs.map(c => c.start));
  V.clipboard = cs.map(c => ({ ...JSON.parse(JSON.stringify(c)), rel: c.start - t0 }));
  App.toast(`Copied ${cs.length} clip${cs.length > 1 ? 's' : ''}`);
};
O.cut = () => { O.copy(); O.deleteSel(); };
O.paste = (at = V.time) => {
  if (!V.clipboard) return App.toast('Clipboard is empty');
  V.commit('Paste');
  const ns = new Set();
  for (const src of V.clipboard) {
    const k = V.cloneClip(src); delete k.rel;
    k.start = V.snapFrame(at + src.rel);
    const need = k.kind === 'audio' ? 'audio' : 'video';
    let tr = V.getTrack(k.trackId);
    if (!tr || tr.type !== need || tr.locked) tr = V.firstTrack(need) || V.addTrack(need);
    k.trackId = tr.id;
    V.clearRange(k.trackId, k.start, k.start + k.dur);
    V.clips.push(k); ns.add(k.id);
  }
  V.sel = ns; V.changed();
};
O.selectAll = () => { V.sel = new Set(V.clips.filter(c => !V.trackLocked(c.trackId)).map(c => c.id)); V.changed('sel'); };
O.nudge = frames => {
  const cs = selClips().filter(c => !V.trackLocked(c.trackId));
  if (!cs.length) return;
  V.commit('Nudge');
  const d = frames / V.project.fps;
  for (const c of cs) c.start = Math.max(0, V.snapFrame(c.start + d));
  V.changed();
};
O.edges = () => {
  const s = new Set([0]);
  for (const c of V.clips) { s.add(+c.start.toFixed(5)); s.add(+(c.start + c.dur).toFixed(5)); }
  for (const m of V.markers) s.add(m.t);
  return [...s].sort((a, b) => a - b);
};
O.prevEdit = () => { const e = O.edges().filter(x => x < V.time - 1e-4); V.pause(); V.seek(e.length ? e[e.length - 1] : 0); T.reveal(); };
O.nextEdit = () => { const e = O.edges().filter(x => x > V.time + 1e-4); V.pause(); if (e.length) V.seek(e[0]); T.reveal(); };
O.addMarker = () => {
  V.commit('Add marker');
  const colors = ['#ffc24b', '#35d6b4', '#ff7849', '#9d84ff', '#5ab0ff', '#ff6fae'];
  V.markers.push({ id: App.uid('mk'), t: V.snapFrame(V.time), label: 'Marker ' + (V.markers.length + 1), color: colors[V.markers.length % colors.length] });
  V.changed();
};
O.setIn = () => { V.commit('Set in point'); V.range.in = V.snapFrame(V.time); if (V.range.out != null && V.range.out <= V.range.in) V.range.out = null; V.changed('range'); };
O.setOut = () => { V.commit('Set out point'); V.range.out = V.snapFrame(V.time); if (V.range.in != null && V.range.in >= V.range.out) V.range.in = null; V.changed('range'); };
O.clearRange = () => { V.commit('Clear in/out'); V.range = { in: null, out: null }; V.changed('range'); };
O.detachAudio = (cs = selClips()) => {
  cs = cs.filter(c => c.kind === 'video' && V.hasAudio(c));
  if (!cs.length) return App.toast('Select a video clip that has sound');
  V.commit('Detach audio');
  for (const c of cs) {
    let tr = V.tracks.find(t => t.type === 'audio' && !t.locked && !V.clips.some(k => k.trackId === t.id && k.start < c.start + c.dur - EPS && k.start + k.dur > c.start + EPS));
    if (!tr) tr = V.addTrack('audio');
    const a = V.makeClip({ kind: 'audio', mediaId: c.mediaId, trackId: tr.id, start: c.start, dur: c.dur, in: c.in, speed: c.speed, keepPitch: c.keepPitch, volume: c.volume, pan: c.pan, fadeIn: c.fadeIn, fadeOut: c.fadeOut, muted: c.muted,
      kf: V.hasKf(c, 'volume') ? { volume: JSON.parse(JSON.stringify(c.kf.volume)) } : {} });   // the sound keeps its volume automation
    V.clips.push(a);
    c.audioDetached = true;
  }
  V.changed();
  App.toast('Audio moved to its own track');
};
O.setSpeed = (cs, s) => {
  cs = cs.filter(c => c.kind !== 'text' && c.kind !== 'color' && c.kind !== 'image');
  if (!cs.length) return;
  V.commit('Change speed');
  for (const c of cs) {
    const srcLen = c.dur * c.speed, mdur = V.mediaDurFor(c);
    const oldEnd = c.start + c.dur;
    V.scaleKf(c, c.speed / s);
    c.speed = s;
    c.dur = Math.max(V.frame(), Math.min(srcLen, mdur - c.in) / s);
    V.rippleShift(c.trackId, oldEnd - EPS, c.start + c.dur - oldEnd, new Set([c.id]));
  }
  V.changed();
};
/** Sets each clip's volume so its sound reaches a loudness target (LUFS) — evens out voice clips recorded at different levels. */
O.normalizeLoudness = async (target = -14, cs = selClips()) => {
  cs = cs.filter(c => V.hasAudio(c) && !V.trackLocked(c.trackId));
  if (!cs.length) cs = V.clips.filter(c => V.hasAudio(c) && !V.trackLocked(c.trackId));
  if (!cs.length) return App.toast('Add a clip with sound first', 'warn');
  App.toast(`Measuring the loudness of ${cs.length} clip${cs.length > 1 ? 's' : ''}…`, '', 1600);
  const res = [];
  for (const c of cs) {
    const m = V.getMedia(c.mediaId), ab = m && m.audioBuffer;
    if (!ab) continue;
    const sr = ab.sampleRate, s0 = Math.max(0, Math.floor(c.in * sr)), s1 = Math.min(ab.length, Math.ceil((c.in + c.dur * c.speed) * sr));
    if (s1 - s0 < sr * 0.5) continue;
    const L = await App.dsp.work('loudness', Array.from({ length: Math.min(2, ab.numberOfChannels) }, (_, i) => ab.getChannelData(i).slice(s0, s1)), sr);
    if (!isFinite(L.integrated)) continue;
    const want = App.dbToGain(target - L.integrated), peak = App.dbToGain(L.peak);
    let g = Math.min(want, App.dbToGain(12));
    if (peak * g > App.dbToGain(-1)) g = App.dbToGain(-1) / peak;   // never push peaks past −1 dBFS
    res.push([c, Math.max(0.01, g), g < want * 0.97]);
  }
  if (!res.length) return App.toast('Those clips are too short or too quiet to measure', 'warn');
  V.commit('Normalize loudness');
  for (const [c, g] of res) {
    // volume keyframes keep their shape, scaled to the new level
    if (V.hasKf(c, 'volume')) { const k = g / Math.max(1e-4, c.volume); for (const p of c.kf.volume) p.v = clamp(p.v * k, 0, App.dbToGain(12)); }
    c.volume = g;
  }
  V.changed('props');
  V.panels.refreshValues && V.panels.refreshValues();
  const short = res.filter(r => r[2]).length;
  App.toast(`Set the volume of ${res.length} clip${res.length > 1 ? 's' : ''} for ${target} LUFS` + (short ? ` · ${short} ${short > 1 ? 'are' : 'is'} too quiet or peaky to get all the way there (boost is capped at +12 dB, peaks at −1 dB)` : ''), short ? 'warn' : 'ok', short ? 7000 : 5000, { label: 'Undo', fn: V.undo });
};
/** YouTube-style chapter list from the timeline markers (copy into a video description). */
O.chapters = () => {
  const mk = [...V.markers].sort((a, b) => a.t - b.t);
  if (!mk.length) return App.toast('Drop a marker (M) where each chapter starts — then rename the markers to name the chapters', 'warn', 5000);
  const stamp = t => { t = Math.max(0, Math.floor(t + 1e-6)); const hh = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (hh ? hh + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  const list = mk[0].t >= 1 ? [{ t: 0, label: 'Intro' }, ...mk] : mk;
  const text = list.map((m, i) => `${stamp(i ? m.t : 0)} ${(m.label || '').trim() || 'Chapter ' + (i + 1)}`).join('\n');
  const notes = [];
  if (list.length < 3) notes.push('YouTube needs at least 3 chapters.');
  const short = list.filter((m, i) => (i + 1 < list.length ? list[i + 1].t : V.duration()) - (i ? m.t : 0) < 10).length;
  if (short) notes.push(`${short} chapter${short > 1 ? 's are' : ' is'} shorter than 10 seconds — YouTube ignores chapter lists with chapters that short.`);
  if (list !== mk) notes.push('An “Intro” chapter at 0:00 was added because YouTube’s list has to start there.');
  const ta = h('textarea', { class: 'field wide', rows: Math.min(14, list.length + 1), spellcheck: 'false', style: { height: 'auto', fontFamily: 'var(--mono)', fontSize: '12px', padding: '8px' }, title: 'Chapters', tip: 'Edit freely, then copy it into your video’s description. Marker names become chapter titles — double-click a marker on the ruler to rename it.' });
  ta.value = text;
  ta.addEventListener('keydown', e => e.stopPropagation());
  App.modal({ title: 'Chapters from markers', icon: 'marker', width: 460, pad: true,
    body: h('div', null, h('div', { class: 'hint', style: { padding: '0 0 8px' } }, 'Paste this into a YouTube description and viewers get clickable chapters. Each marker starts a chapter; its name becomes the title.'), ta,
      notes.length ? h('div', { class: 'hint', style: { padding: '8px 0 0', color: 'var(--warn)' } }, notes.join(' ')) : null),
    buttons: [{ label: 'Download .txt', onClick: () => { App.download(new Blob([ta.value], { type: 'text/plain' }), (V.name || 'chapters').replace(/[\\/:*?"<>|]+/g, '_') + ' chapters.txt'); return false; } },
      { label: 'Copy', primary: true, icon: 'copy', onClick: async () => { try { await navigator.clipboard.writeText(ta.value); App.toast('Chapters copied — paste them into your video description', 'ok'); } catch { ta.select(); App.toast('Press Ctrl+C to copy the selected text', 'warn'); return false; } } }] });
};
O.closeGap = (trackId, t) => {
  const list = V.clipsOn(trackId);
  const prevEnd = Math.max(0, ...list.filter(c => c.start + c.dur <= t + EPS).map(V.end));
  const next = list.find(c => c.start >= t - EPS);
  if (!next) return;
  const gap = next.start - prevEnd;
  if (gap <= EPS) return;
  V.commit('Close gap');
  V.rippleShift(trackId, next.start, -gap);
  V.changed();
};
O.closeAllGaps = trackId => {
  V.commit('Close all gaps');
  let pos = 0;
  for (const c of V.clipsOn(trackId)) { c.start = pos; pos += c.dur; }
  V.changed();
};
O.addText = (preset = {}, at = V.time) => {
  const dur = preset.dur || App.settings.stillDur || 5;
  const tr = V.freeVideoTrack(at, at + dur, true);
  V.commit('Add title');
  // presets are authored for 1920×1080 — scale them to the project frame
  const k = V.project.height / 1080, kx = V.project.width / 1920;
  const text = Object.assign(V.defaultText(), preset.text || {});
  text.size = Math.round(text.size * k); text.strokeW *= k; text.spacing = (text.spacing || 0) * k;
  const c = V.makeClip({ kind: 'text', trackId: tr.id, start: V.snapFrame(at), dur, text, x: Math.round((preset.x || 0) * kx), y: Math.round((preset.y || 0) * k), transIn: { type: 'none', dur: 0.5 }, transOut: { type: 'none', dur: 0.5 } });
  V.clips.push(c);
  V.sel = new Set([c.id]);
  V.changed();
};
O.addColor = (at = V.time, trackId) => {
  const dur = V.snapFrame(App.settings.stillDur || 5);
  // with no track given, use the lowest video track that is free at the playhead — never cut into existing footage
  V.commit('Add color matte');
  const tr = trackId ? V.getTrack(trackId) : V.freeVideoTrack(V.snapFrame(at), V.snapFrame(at) + dur, false);
  const c = V.makeClip({ kind: 'color', trackId: tr.id, start: V.snapFrame(at), dur, fill: V.defaultFill() });
  V.clearRange(tr.id, c.start, c.start + c.dur);
  V.clips.push(c); V.sel = new Set([c.id]); V.changed();
};
/** Place media on the timeline. mode: 'append' | 'insert' | 'overwrite' */
O.placeMedia = (m, mode = 'append', at = V.time, trackId = null) => {
  if (!m || m.loading) return App.toast('Still loading…');
  const type = m.type === 'audio' ? 'audio' : 'video';
  let tr = trackId ? V.getTrack(trackId) : null;
  if (!tr || tr.type !== type || tr.locked) tr = V.firstTrack(type) || V.addTrack(type);
  const still = App.settings.stillDur || 5;
  const dur = m.type === 'image' ? still : m.duration;
  let start = at;
  if (mode === 'append') start = V.clipsOn(tr.id).reduce((e, c) => Math.max(e, c.start + c.dur), 0);
  start = V.snapFrame(Math.max(0, start));
  V.commit(mode === 'insert' ? 'Insert clip' : 'Add clip');
  const c = V.makeClip({ kind: m.type, mediaId: m.id, trackId: tr.id, start, dur: V.snapFrame(dur) || dur });
  if (m.type === 'image') c.dur = V.snapFrame(still);
  if (mode === 'insert') V.rippleInsert(tr.id, start, c.dur);
  else V.clearRange(tr.id, start, start + c.dur);
  V.clips.push(c);
  V.sel = new Set([c.id]);
  V.changed();
  return c;
};
O.freezeFrame = async () => {
  const t = V.snapFrame(V.time);
  const c = O.targetsAt(t).find(k => k.kind === 'video');
  if (!c) return App.toast('Put the playhead over a video clip');
  V.renderFrame(t);
  const el = V.videoEl(c);
  if (!el.videoWidth || el.readyState < 2) return App.toast('The video is still loading — try again in a moment', 'warn');
  const cv = App.canvas(el.videoWidth, el.videoHeight);
  cv.getContext('2d').drawImage(el, 0, 0);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const [m] = await V.importBlob(blob, `Freeze ${tc(t)}.png`);
  if (!m) return;
  V.commit('Freeze frame');
  const r = V.splitClip(c, t);
  const hold = 2;
  V.rippleShift(c.trackId, t, hold);
  const still = V.makeClip({ kind: 'image', mediaId: m.id, trackId: c.trackId, start: t, dur: hold, x: c.x, y: c.y, scale: c.scale, rotation: c.rotation, fx: { ...c.fx }, crop: { ...c.crop }, fit: c.fit, flipH: c.flipH, flipV: c.flipV });
  V.clips.push(still);
  V.sel = new Set([still.id]);
  V.changed();
  App.toast('Inserted a 2 s freeze frame');
  return r;
};
O.frameBlob = async () => {
  V.renderFrame(V.time);
  return new Promise(r => V.canvas.toBlob(r, 'image/png'));
};

/* =====================================================================
   Timeline UI
   ===================================================================== */
T.build = root => {
  const fps = () => V.project.fps;
  T.toolSeg = App.seg({
    value: V.tool, onChange: v => T.setTool(v),
    options: [
      { value: 'select', icon: 'cursor', title: 'Select tool', key: 'V', tip: 'Click clips to select them, drag to move, drag a clip edge to trim. Drag on empty space to box-select several clips.' },
      { value: 'blade', icon: 'scissors', title: 'Blade tool', key: 'C', tip: 'Click anywhere on a clip to cut it at that exact spot. Hold Shift to cut through every track at once.' },
      { value: 'slip', icon: 'slip', title: 'Slip tool', key: 'Y', tip: 'Drag inside a clip to change which part of the source plays, without moving the clip or changing its length.' },
    ],
  });
  T.snapBtn = btn({ icon: 'magnet', title: 'Snapping', key: 'N', on: V.snap, tip: 'When on, clips, trims and the playhead stick to nearby cuts, markers and the playhead so edits line up perfectly.', onClick: () => T.toggleSnap() });
  T.rippleBtn = btn({ icon: 'ripple', title: 'Ripple editing', key: 'R', on: V.ripple, tip: 'When on, deleting or trimming a clip pulls later clips on that track along, so no gaps are left behind.', onClick: () => T.toggleRipple() });
  const bar = h('div', { class: 'tl-toolbar' },
    T.toolSeg, T.snapBtn, T.rippleBtn, App.sep(),
    btn({ icon: 'scissors', title: 'Split at playhead', key: 'S', tip: 'Cuts the selected clips — or every clip under the playhead if nothing is selected — at the playhead.', onClick: O.splitAtPlayhead }),
    btn({ icon: 'trimStart', title: 'Trim start to playhead', key: 'Q', tip: 'Removes the part of the clip before the playhead and slides the rest of the track left to close the gap.', onClick: O.trimStartToPlayhead }),
    btn({ icon: 'trimEnd', title: 'Trim end to playhead', key: 'W', tip: 'Removes the part of the clip after the playhead and closes the gap.', onClick: O.trimEndToPlayhead }),
    btn({ icon: 'autocut', title: 'Remove silences', key: 'Ctrl+Shift+S', tip: 'Auto-cut all pauses in the selected clips: preview, then remove or shorten every silence in one go.', onClick: () => O.removeSilences() }),
    btn({ icon: 'trash', title: 'Delete', key: 'Del', tip: 'Removes the selected clips. Leaves a gap unless Ripple editing is on.', onClick: () => O.deleteSel() }),
    btn({ icon: 'gap', title: 'Ripple delete', key: 'Shift+Del', tip: 'Removes the selected clips and shifts everything after them left so no gap remains.', onClick: () => O.deleteSel(true) }),
    btn({ icon: 'detach', title: 'Detach audio', tip: 'Moves the sound of the selected video clip onto its own audio track so you can edit it separately (J/L-cuts, music swaps…).', onClick: () => O.detachAudio() }),
    btn({ icon: 'freeze', title: 'Freeze frame', tip: 'Holds the current video frame for 2 seconds by inserting a still image at the playhead.', onClick: O.freezeFrame }),
    btn({ icon: 'marker', title: 'Add marker', key: 'M', tip: 'Drops a colored marker at the playhead. Double-click it to rename, drag to move, right-click to delete.', onClick: O.addMarker }),
    App.sep(),
    btn({ icon: 'undo', title: 'Undo', key: 'Ctrl+Z', tip: 'Step back through your edits.', onClick: V.undo }),
    btn({ icon: 'redo', title: 'Redo', key: 'Ctrl+Shift+Z', tip: 'Re-apply an edit you just undid.', onClick: V.redo }),
    h('div', { class: 'grow' }),
    T.durLabel = h('span', { class: 'mono', style: { color: 'var(--muted)', fontSize: '11px', marginRight: '8px', whiteSpace: 'nowrap' }, title: 'Timeline length', tip: 'Total length of your edit (end of the last clip).' }),
    btn({ icon: 'zoomOut', title: 'Zoom out', key: '-', tip: 'See more of the timeline at once.', onClick: () => T.zoomBy(1 / 1.5) }),
    T.zoomRange = h('input', { type: 'range', class: 'tl-zoom', min: 0, max: 100, step: 0.5, title: 'Timeline zoom', tip: 'Drag to zoom the timeline. The mouse wheel over the tracks zooms around the pointer; press the wheel and drag to move around.' }),
    btn({ icon: 'zoomIn', title: 'Zoom in', key: '=', tip: 'Zoom in for frame-accurate cutting.', onClick: () => T.zoomBy(1.5) }),
    btn({ icon: 'fit', title: 'Zoom to fit', key: '\\', tip: 'Fits the whole edit into view.', onClick: () => T.zoomFit() }),
  );
  T.zoomRange.addEventListener('input', () => T.setPps(T.sliderToPps(+T.zoomRange.value)));

  T.body = h('div', { class: 'tl-body tool-' + V.tool });
  T.grid = h('div', { class: 'tl-grid', style: { '--head': HEAD + 'px' } });
  T.ruler = h('canvas', { class: 'tl-ruler', title: 'Ruler', tip: 'Click or drag to move the playhead (snaps to cuts when Snapping is on). Markers and the in/out range show up here.' });
  T.rulerWrap = h('div', { class: 'tl-ruler-wrap' }, T.ruler);
  T.corner = h('div', { class: 'tl-corner' },
    btn({ icon: 'plus', cls: 'sm', label: 'V', title: 'Add video track', tip: 'Adds a new video track on top. Higher tracks are drawn over lower ones — use them for titles, overlays and picture-in-picture.', onClick: () => { V.commit('Add track'); V.addTrack('video'); V.changed(); } }),
    btn({ icon: 'plus', cls: 'sm', label: 'A', title: 'Add audio track', tip: 'Adds a new audio track at the bottom for music, voice-over or sound effects.', onClick: () => { V.commit('Add track'); V.addTrack('audio'); V.changed(); } }),
    h('div', { class: 'grow' }),
    btn({ icon: 'layers', cls: 'sm', title: 'Track height', tip: 'Cycles between compact, normal and tall tracks — tall tracks show bigger thumbnails and waveforms.', onClick: () => O.setTrackScale(V.trackScale === 1 ? 1.5 : V.trackScale === 1.5 ? 0.75 : 1) }),
    T.rangeBtn = btn({ icon: 'loop', cls: 'sm', title: 'Loop playback', key: 'Ctrl+L', tip: 'Plays the in/out range (or the whole edit) over and over.', onClick: () => T.toggleLoop() }),
  );
  try { const s = +localStorage.getItem('strata.trackScale'); if (s) V.trackScale = s; } catch {}
  T.rulerRow = h('div', { class: 'tl-row tl-ruler-row' }, T.corner, T.rulerWrap);
  T.rows = h('div');
  T.emptyHint = h('div', { class: 'tl-empty' }, icon('upload', 18), 'Drag media here from the bin (or straight from your desktop) to start editing');
  T.playhead = h('div', { class: 'tl-playhead' });
  T.snapLine = h('div', { class: 'tl-snapline' });
  T.bladeLine = h('div', { class: 'tl-bladeline' });
  T.rangeEl = h('div', { class: 'tl-range', style: { display: 'none' } });
  T.grid.append(T.rulerRow, T.rows, T.rangeEl, T.playhead, T.snapLine, T.bladeLine, T.emptyHint);
  T.body.append(T.grid);
  T.readoutEl = h('div', { class: 'tl-readout' });
  document.body.append(T.readoutEl);
  root.append(bar, T.body);

  T.body.addEventListener('scroll', () => T.drawRuler());
  App.timelineNav(T.body, {
    zoom: (f, cx) => T.zoomBy(f, cx),
    panX: d => { T.body.scrollLeft += d; },
    panY: d => { T.body.scrollTop += d; },
    heads: '.tl-head, .tl-corner',
  });
  new ResizeObserver(() => T.render()).observe(T.body);
  setupRuler();
  setupLanes();
  setupDrop();
  T.zoomRange.value = T.ppsToSlider(V.pps); App.setRangeFill(T.zoomRange);
  V.onTime(() => T.updatePlayhead());
};

T.sliderToPps = v => 2 * Math.pow(400, v / 100);
T.ppsToSlider = p => Math.log(p / 2) / Math.log(400) * 100;
T.setPps = (p, anchorClientX) => {
  p = clamp(p, 2, 800);
  const rect = T.body.getBoundingClientRect();
  const ax = anchorClientX != null ? anchorClientX - rect.left - HEAD : (V.time * V.pps - T.body.scrollLeft);
  const tAt = (T.body.scrollLeft + ax) / V.pps;
  V.pps = p;
  T.render();
  T.body.scrollLeft = Math.max(0, tAt * p - ax);
  T.zoomRange.value = T.ppsToSlider(p); App.setRangeFill(T.zoomRange);
  T.drawRuler();
};
T.zoomBy = (f, cx) => T.setPps(V.pps * f, cx);
T.zoomFit = () => {
  const d = Math.max(5, V.duration());
  T.setPps((T.body.clientWidth - HEAD - 40) / d);
  T.body.scrollLeft = 0;
};
T.setTool = v => {
  V.tool = v; T.toolSeg.set(v);
  T.body.className = 'tl-body tool-' + v;
  T.bladeLine.style.display = 'none';
};
T.toggleSnap = () => { V.snap = !V.snap; T.snapBtn.setOn(V.snap); App.toast('Snapping ' + (V.snap ? 'on' : 'off'), '', 1000); };
T.toggleRipple = () => { V.ripple = !V.ripple; T.rippleBtn.setOn(V.ripple); App.toast('Ripple editing ' + (V.ripple ? 'on' : 'off'), '', 1000); };
T.toggleLoop = () => { V.loop = !V.loop; T.rangeBtn.setOn(V.loop); V.onLoopChange && V.onLoopChange(); };
T.timeAt = clientX => {
  const r = T.grid.getBoundingClientRect();
  return Math.max(0, (clientX - r.left - HEAD) / V.pps);
};
T.xOf = t => HEAD + t * V.pps;

T.rulerStep = () => {
  const fps = V.project.fps;
  const cands = [1 / fps, 2 / fps, 5 / fps, 10 / fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  let major = cands.find(s => s * V.pps >= 90) || 3600;
  let minorDiv = major <= 1 / fps * 1.01 ? 1 : major < 1 ? (Math.round(major * fps) % 5 === 0 ? 5 : 2) : [5, 15, 30, 300, 1800].includes(major) ? 5 : major === 10 || major === 600 ? 10 : 4;
  return { major, minor: major / minorDiv };
};

/* ---------- render ---------- */
let renderPending = false;
T.renderSoon = () => { if (renderPending) return; renderPending = true; requestAnimationFrame(() => { renderPending = false; T.render(); }); };
T.render = () => {
  if (!T.body) return;
  const viewW = Math.max(100, T.body.clientWidth - HEAD);
  const dur = V.duration();
  const contentW = Math.max(viewW, (dur + 30) * V.pps, 600);
  T.contentW = contentW;
  T.grid.style.width = (HEAD + contentW) + 'px';
  T.grid.style.setProperty('--grid', (T.rulerStep().major * V.pps) + 'px');
  T.rulerWrap.style.width = contentW + 'px';
  T.rows.innerHTML = '';
  for (const tr of V.tracks) T.rows.append(trackRow(tr, contentW));
  // markers
  T.grid.querySelectorAll('.tl-markerline').forEach(e => e.remove());
  T.rulerWrap.querySelectorAll('.tl-marker').forEach(e => e.remove());
  for (const mk of V.markers) {
    const el = h('div', { class: 'tl-marker', style: { left: mk.t * V.pps + 'px', '--mc': mk.color }, title: mk.label, tip: 'Click to jump here · drag to move · double-click to rename · right-click to delete' }, h('span', null, mk.label));
    el.dataset.id = mk.id;
    T.rulerWrap.append(el);
    T.grid.append(h('div', { class: 'tl-markerline', style: { left: T.xOf(mk.t) + 'px', '--mc': mk.color } }));
  }
  // in/out range
  if (V.range.in != null || V.range.out != null) {
    const a = V.range.in ?? 0, b = V.range.out ?? dur;
    T.rangeEl.style.display = '';
    T.rangeEl.style.left = T.xOf(a) + 'px';
    T.rangeEl.style.width = Math.max(1, (b - a) * V.pps) + 'px';
  } else T.rangeEl.style.display = 'none';
  T.durLabel.textContent = tc(dur);
  T.emptyHint.style.display = V.clips.length ? 'none' : '';
  T.updatePlayhead();
  T.drawRuler();
};
/** The little “+” between two touching clips: one click adds a transition (or an audio smoothing fade). */
function cutMenu(a, b, isAudio, e) {
  const r = e.currentTarget.getBoundingClientRect();
  if (isAudio) {
    App.openMenu(r.left, r.bottom + 4, [
      { label: 'Smooth the cut (short fades)', icon: 'fadeOut', tip: 'Adds 40 ms fades on both sides so the cut never clicks.', action: () => { V.commit('Smooth cut'); a.fadeOut = Math.max(a.fadeOut, 0.04); b.fadeIn = Math.max(b.fadeIn, 0.04); V.changed(); } },
      { label: 'Gentle crossfade feel (0.5 s)', icon: 'transition', tip: 'Fades the first clip out and the second in over half a second each.', action: () => { V.commit('Fade cut'); a.fadeOut = 0.5; b.fadeIn = 0.5; V.changed(); } },
      { label: 'Remove fades', icon: 'x', tip: 'Removes the fades at this cut.', action: () => { V.commit('Remove fades'); a.fadeOut = 0; b.fadeIn = 0; V.changed(); } },
    ]);
    return;
  }
  const set = (type, dur = 0.5) => {
    V.commit('Add transition');
    if (type === 'none') { b.transIn = { type: 'none', dur: b.transIn.dur }; a.transOut = { type: 'none', dur: a.transOut.dur }; }
    else if (type === 'dipBlack' || type === 'dipWhite') { a.transOut = { type, dur: Math.min(dur / 2, a.dur / 2) }; b.transIn = { type, dur: Math.min(dur / 2, b.dur / 2) }; }
    else b.transIn = { type, dur: Math.min(dur, b.dur / 2) };
    V.sel = new Set([b.id]);
    V.changed();
  };
  App.openMenu(r.left, r.bottom + 4, [
    { head: 'Transition at this cut' },
    { label: 'Cross dissolve', icon: 'transition', tip: 'The classic smooth blend from one shot to the next.', action: () => set('dissolve') },
    { label: 'Dip to black', icon: 'transition', tip: 'Fades out to black then into the next shot.', action: () => set('dipBlack', 1) },
    { label: 'Dip to white', icon: 'transition', tip: 'Flashes through white.', action: () => set('dipWhite', 1) },
    { label: 'More…', icon: 'chevRight', tip: 'Other transition styles.', sub: V.TRANSITIONS.filter(t => !['dissolve', 'dipBlack', 'dipWhite'].includes(t.id)).map(t => ({ label: t.name, tip: t.tip, action: () => set(t.id) })) },
    { sep: true },
    { label: 'Remove transition', icon: 'x', disabled: b.transIn.type === 'none' && a.transOut.type === 'none', tip: 'Back to a straight cut.', action: () => set('none') },
  ]);
}

function trackRow(tr, contentW) {
  const H = TRACK_H[tr.type];
  const label = V.trackLabel(tr);
  const row = h('div', { class: `tl-row ${tr.type}${tr.locked ? ' locked' : ''}`, dataset: { track: tr.id } });
  const toggle = (prop, name) => () => { V.commit(name); tr[prop] = !tr[prop]; V.changed(); };
  const btns = tr.type === 'video' ? [
    btn({ icon: tr.hidden ? 'eyeOff' : 'eye', cls: 'sm' + (tr.hidden ? ' warn-on' : ''), title: tr.hidden ? 'Show track' : 'Hide track', tip: 'Turns this track\'s picture on or off in the preview and export.', onClick: toggle('hidden', 'Toggle track visibility') }),
    btn({ icon: tr.muted ? 'mute' : 'volume', cls: 'sm' + (tr.muted ? ' warn-on' : ''), title: tr.muted ? 'Unmute track audio' : 'Mute track audio', tip: 'Silences the built-in sound of every video clip on this track.', onClick: toggle('muted', 'Toggle track mute') }),
  ] : [
    h('button', { class: 'btn sm' + (tr.muted ? ' warn-on' : ''), title: 'Mute', tip: 'Silences this audio track.', onclick: toggle('muted', 'Toggle mute'), style: { fontWeight: 800 } }, 'M'),
    h('button', { class: 'btn sm' + (tr.solo ? ' on' : ''), title: 'Solo', tip: 'Plays only soloed audio tracks — quick way to listen to one track on its own.', onclick: toggle('solo', 'Toggle solo'), style: { fontWeight: 800 } }, 'S'),
  ];
  btns.push(btn({ icon: tr.locked ? 'lock' : 'unlock', cls: 'sm' + (tr.locked ? ' warn-on' : ''), title: tr.locked ? 'Unlock track' : 'Lock track', tip: 'A locked track can\'t be edited — protects finished parts from accidental changes.', onClick: toggle('locked', 'Toggle lock') }));
  const nameEl = h('span', { class: 'th-name', title: 'Track ' + label, tip: 'Double-click to rename. Right-click the header for more track options.' }, label);
  nameEl.addEventListener('dblclick', async () => {
    const v = await App.prompt('Rename track', 'Track name', tr.name || label);
    if (v != null) { V.commit('Rename track'); tr.name = v.trim().slice(0, 12); V.changed(); }
  });
  const head = h('div', { class: 'tl-head', style: { height: H + 'px' } }, h('i', { class: 'th-tag' }), nameEl, h('div', { class: 'th-btns' }, btns));
  head.addEventListener('contextmenu', e => App.contextMenu(e, trackMenu(tr)));
  const lane = h('div', { class: 'tl-lane', style: { width: contentW + 'px', height: H + 'px' }, dataset: { track: tr.id } });
  const list = V.clipsOn(tr.id);
  for (const c of list) lane.append(clipEl(c));
  if (!tr.locked) for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (Math.abs(a.start + a.dur - b.start) > 0.75 / V.project.fps) continue;
    const isAudio = tr.type === 'audio';
    if (!isAudio && (!V.isVisual(a) || !V.isVisual(b))) continue;
    const has = isAudio ? (a.fadeOut > 0 || b.fadeIn > 0) : (b.transIn.type !== 'none' || a.transOut.type !== 'none');
    const pt = h('div', { class: 'cut-pt', style: { left: b.start * V.pps + 'px' }, title: 'Cut point', tip: isAudio ? 'Click to smooth this audio cut with short fades.' : 'Click to add a transition between these two clips. Ctrl-drag a clip edge here to roll the cut.' }, icon(has ? 'transition' : 'plus', 12, 2.4));
    pt.addEventListener('pointerdown', e => e.stopPropagation());
    pt.addEventListener('click', e => { e.stopPropagation(); cutMenu(a, b, isAudio, e); });
    lane.append(pt);
  }
  row.append(head, lane);
  return row;
}
function trackMenu(tr) {
  const idx = V.tracks.indexOf(tr);
  const n = V.clips.filter(c => c.trackId === tr.id).length;
  return [
    { label: 'Rename…', icon: 'tag', tip: 'Give this track a custom short name.', action: async () => { const v = await App.prompt('Rename track', 'Track name', tr.name || V.trackLabel(tr)); if (v != null) { V.commit('Rename track'); tr.name = v.trim().slice(0, 12); V.changed(); } } },
    { label: 'Add video track', icon: 'plus', tip: 'Adds a new empty video track on top.', action: () => { V.commit('Add track'); V.addTrack('video'); V.changed(); } },
    { label: 'Add audio track', icon: 'plus', tip: 'Adds a new empty audio track at the bottom.', action: () => { V.commit('Add track'); V.addTrack('audio'); V.changed(); } },
    { label: 'Close all gaps', icon: 'gap', tip: 'Packs every clip on this track tightly together from the start of the timeline.', action: () => O.closeAllGaps(tr.id) },
    { label: 'Select all on track', icon: 'cursor', tip: 'Selects every clip on this track.', action: () => { V.sel = new Set(V.clipsOn(tr.id).map(c => c.id)); V.changed('sel'); } },
    { sep: true },
    { label: 'Move up', icon: 'chevUp', disabled: idx === 0 || V.tracks[idx - 1].type !== tr.type, tip: 'Moves the track one step up (video tracks higher up draw on top).', action: () => { V.commit('Move track'); V.tracks.splice(idx, 1); V.tracks.splice(idx - 1, 0, tr); V.changed(); } },
    { label: 'Move down', icon: 'chevDown', disabled: idx === V.tracks.length - 1 || V.tracks[idx + 1].type !== tr.type, tip: 'Moves the track one step down.', action: () => { V.commit('Move track'); V.tracks.splice(idx, 1); V.tracks.splice(idx + 1, 0, tr); V.changed(); } },
    { sep: true },
    { label: `Delete track${n ? ` (${n} clips)` : ''}`, icon: 'trash', disabled: V.tracks.filter(t => t.type === tr.type).length <= 1, tip: 'Removes the track and every clip on it.', action: () => { V.commit('Delete track'); V.clips = V.clips.filter(c => c.trackId !== tr.id); V.tracks.splice(idx, 1); V.changed(); } },
  ];
}

const KIND_ICON = { video: 'film', image: 'image', text: 'text', color: 'solid', audio: 'music' };
function clipEl(c) {
  const sel = V.sel.has(c.id);
  const el = h('div', { class: `clip k-${c.kind}${sel ? ' sel' : ''}`, dataset: { id: c.id } });
  if (c.label) { el.dataset.lbl = '1'; el.style.setProperty('--lbl', c.label); }
  const badges = [];
  if (c.speed !== 1) badges.push(h('span', { class: 'bdg' }, c.speed + '×'));
  if (c.muted) badges.push(h('span', { class: 'bdg' }, 'muted'));
  if (c.kind === 'video' && c.audioDetached) badges.push(h('span', { class: 'bdg' }, 'no audio'));
  const fxOn = Object.entries(V.defaultFx()).some(([k, v]) => c.fx[k] !== v);
  if (fxOn) badges.push(h('span', { class: 'bdg' }, 'fx'));
  if (c.key && c.key.on) badges.push(h('span', { class: 'bdg' }, 'key'));
  if (c.kf && Object.keys(c.kf).length) badges.push(h('span', { class: 'bdg' }, '◆'));
  const offline = c.mediaId && !V.getMedia(c.mediaId);
  if (offline) { el.classList.add('offline'); el.dataset.tipTitle = 'Media offline'; el.dataset.tip = 'The file this clip uses is missing (it could not be loaded or restored). Import the file again and place it, or delete this clip.'; badges.unshift(h('span', { class: 'bdg bdg-off' }, 'missing media')); }
  el.append(h('div', { class: 'c-label' }, icon(KIND_ICON[c.kind], 11, 2.2), h('span', null, V.clipName(c)), ...badges));
  if (c.kind === 'text') el.append(h('div', { class: 'c-text' }, c.text.content.replace(/\n/g, ' · ')));
  if (c.kind === 'video' || c.kind === 'image') el.append(h('canvas', { class: 'c-thumbs' }));
  if (c.kind === 'color') el.style.background = c.fill.gradient ? `linear-gradient(${c.fill.angle}deg, ${c.fill.c1}, ${c.fill.c2})` : c.fill.c1;
  if (V.hasAudio(c)) el.append(h('canvas', { class: 'c-wave' }),
    h('i', { class: 'c-fade in', title: 'Fade in', tip: 'Drag right to fade the sound in from silence. Double-click to remove the fade.' }),
    h('i', { class: 'c-fade out', title: 'Fade out', tip: 'Drag left to fade the sound out to silence. Double-click to remove the fade.' }));
  el.append(h('div', { class: 'c-tr in' }), h('div', { class: 'c-tr out' }), h('div', { class: 'h l' }), h('div', { class: 'h r' }));
  layoutClip(el, c);
  return el;
}
function layoutClip(el, c) {
  const w = Math.max(3, c.dur * V.pps);
  el.style.left = c.start * V.pps + 'px';
  el.style.width = w + 'px';
  const ti = el.querySelector('.c-tr.in'), to = el.querySelector('.c-tr.out');
  ti.style.display = c.transIn.type !== 'none' ? '' : 'none';
  ti.style.width = Math.min(w, c.transIn.dur * V.pps) + 'px';
  to.style.display = c.transOut.type !== 'none' ? '' : 'none';
  to.style.width = Math.min(w, c.transOut.dur * V.pps) + 'px';
  const fi = el.querySelector('.c-fade.in'), fo = el.querySelector('.c-fade.out');
  if (fi) {
    // the knobs sit where each fade ramp ends (at least clear of the trim handles); hidden on very short clips
    const show = w >= 44 ? '' : 'none';
    fi.style.display = fo.style.display = show;
    fi.style.left = (Math.min(w - 14, Math.max(9, c.fadeIn * V.pps)) - 5) + 'px';
    fo.style.right = (Math.min(w - 14, Math.max(9, c.fadeOut * V.pps)) - 5) + 'px';
    fi.classList.toggle('set', c.fadeIn > 0); fo.classList.toggle('set', c.fadeOut > 0);
  }
  el.querySelectorAll('.c-kf').forEach(k => k.remove());
  for (const t of V.kfTimes(c)) if (t >= -1e-4 && t <= c.dur + 1e-4) el.append(h('i', { class: 'c-kf', style: { left: (t * V.pps) + 'px' } }));
  const m = V.getMedia(c.mediaId);
  const th = el.querySelector('.c-thumbs');
  if (th && m) drawThumbs(th, c, m, w, TRACK_H[c.kind === 'audio' ? 'audio' : 'video'] - 6);
  const wv = el.querySelector('.c-wave');
  if (wv && m) drawWave(wv, c, m, w);
}
T.layoutClip = layoutClip;
function visibleSpan(c, w) {
  // only paint the part of the clip that is on screen (+ margin) to keep canvases small
  const sl = T.body.scrollLeft, vw = T.body.clientWidth;
  const x0 = Math.max(0, sl - HEAD - 400 - c.start * V.pps);
  const x1 = Math.min(w, sl + vw + 400 - c.start * V.pps);
  return x1 > x0 ? [x0, x1] : null;
}
function drawThumbs(cv, c, m, w, hgt) {
  const span = visibleSpan(c, w);
  if (!span || !m.thumbs.length) { cv.width = 1; return; }
  const [x0, x1] = span, dpr = devicePixelRatio || 1;
  const ch = Math.max(10, hgt - 17);
  cv.style.left = x0 + 'px'; cv.style.width = (x1 - x0) + 'px';
  cv.width = Math.min(8000, Math.ceil((x1 - x0) * dpr)); cv.height = Math.ceil(ch * dpr);
  const ctx = cv.getContext('2d');
  const t0 = m.thumbs[0].c;
  const tw = cv.height * t0.width / t0.height;
  const k = cv.width / (x1 - x0);
  const startX = -((x0 * k) % tw);
  for (let x = startX; x < cv.width; x += tw) {
    const lt = (x0 + (x + tw / 2) / k) / V.pps;
    const st = c.in + lt * c.speed;
    let best = m.thumbs[0];
    for (const th of m.thumbs) if (Math.abs(th.t - st) < Math.abs(best.t - st)) best = th;
    ctx.drawImage(best.c, x, 0, tw, cv.height);
  }
}
function drawWave(cv, c, m, w) {
  const span = visibleSpan(c, w);
  if (!span || !m.env) { cv.width = 1; return; }
  const [x0, x1] = span, dpr = devicePixelRatio || 1;
  cv.style.left = x0 + 'px'; cv.style.width = (x1 - x0) + 'px';
  const ch = c.kind === 'audio' ? TRACK_H.audio - 6 - 17 : 22;
  cv.width = Math.min(8000, Math.ceil((x1 - x0) * dpr)); cv.height = Math.ceil(ch * dpr);
  const ctx = cv.getContext('2d');
  const k = cv.width / (x1 - x0);
  const env = m.env, H = cv.height, mid = c.kind === 'audio' ? H / 2 : H;
  if (c.kind !== 'audio') { ctx.fillStyle = 'rgba(8,12,24,.62)'; ctx.fillRect(0, 0, cv.width, H); }
  ctx.fillStyle = c.kind === 'audio' ? 'rgba(220,255,245,.75)' : 'rgba(150,200,255,.9)';
  const vol = c.muted ? 0.15 : Math.min(2, c.volume);
  for (let x = 0; x < cv.width; x++) {
    const lt0 = (x0 + x / k) / V.pps, lt1 = (x0 + (x + 1) / k) / V.pps;
    const i0 = Math.floor((c.in + lt0 * c.speed) * 100), i1 = Math.max(i0 + 1, Math.ceil((c.in + lt1 * c.speed) * 100));
    let mx = 0;
    for (let i = i0; i < i1 && i < env.length; i++) if (env[i] > mx) mx = env[i];
    let g = vol;
    const tt = lt0;
    if (c.fadeIn > 0 && tt < c.fadeIn) g *= tt / c.fadeIn;
    if (c.fadeOut > 0 && tt > c.dur - c.fadeOut) g *= (c.dur - tt) / c.fadeOut;
    const a = Math.min(1, Math.sqrt(mx * g)) * (c.kind === 'audio' ? H / 2 : H) * 0.95;
    if (c.kind === 'audio') ctx.fillRect(x, mid - a, 1, a * 2);
    else ctx.fillRect(x, H - a, 1, a);
  }
  // fade ramps
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5 * dpr;
  if (c.fadeIn > 0) { const fx = (c.fadeIn * V.pps - x0) * k; ctx.beginPath(); ctx.moveTo(-x0 * k, H); ctx.lineTo(fx, 1); ctx.stroke(); }
  if (c.fadeOut > 0) { const fx = ((c.dur - c.fadeOut) * V.pps - x0) * k; ctx.beginPath(); ctx.moveTo(fx, 1); ctx.lineTo((c.dur * V.pps - x0) * k, H); ctx.stroke(); }
}
T.body_scrollRedraw = () => {
  T.grid.querySelectorAll('.clip').forEach(el => { const c = V.getClip(el.dataset.id); if (c) layoutClip(el, c); });
};

T.updatePlayhead = () => {
  if (!T.playhead) return;
  const x = T.xOf(V.time);
  T.playhead.style.left = x + 'px';
  if (V.playing) {
    const sl = T.body.scrollLeft, vw = T.body.clientWidth;
    if (x > sl + vw - 40) T.body.scrollLeft = x - HEAD - 60;
    else if (x < sl + HEAD) T.body.scrollLeft = Math.max(0, x - HEAD - 60);
  }
  T.drawRuler();
};
T.reveal = () => {
  const x = T.xOf(V.time), sl = T.body.scrollLeft, vw = T.body.clientWidth;
  if (x < sl + HEAD + 20 || x > sl + vw - 20) T.body.scrollLeft = Math.max(0, x - HEAD - (vw - HEAD) / 3);
};

/* ---------- ruler ---------- */
let rulerRaf = 0, lastScroll = -1;
T.drawRuler = () => {
  if (rulerRaf) return;
  rulerRaf = requestAnimationFrame(() => {
    rulerRaf = 0;
    const cv = T.ruler;
    const vw = Math.max(50, T.body.clientWidth - HEAD);
    cv.style.width = vw + 'px';
    const dpr = App.fitCanvas(cv);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = vw, H = 30, sl = T.body.scrollLeft;
    ctx.clearRect(0, 0, W, H);
    const { major, minor } = T.rulerStep();
    const t0 = sl / V.pps, t1 = (sl + W) / V.pps;
    // in/out shading
    if (V.range.in != null || V.range.out != null) {
      const a = V.range.in ?? 0, b = V.range.out ?? V.duration();
      ctx.fillStyle = `rgba(${App.th.ink},.07)`;
      ctx.fillRect(a * V.pps - sl, 0, (b - a) * V.pps, H);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent');
      if (V.range.in != null) ctx.fillRect(a * V.pps - sl, 0, 2, H);
      if (V.range.out != null) ctx.fillRect(b * V.pps - sl - 2, 0, 2, H);
    }
    ctx.strokeStyle = `rgba(${App.th.ink},.16)`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
      const x = Math.round(t * V.pps - sl) + 0.5;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      ctx.moveTo(x, isMajor ? 12 : 22); ctx.lineTo(x, H);
    }
    ctx.stroke();
    ctx.fillStyle = App.th.muted || '#8d909a'; ctx.font = '500 10px "JetBrains Mono", monospace';
    for (let t = Math.floor(t0 / major) * major; t <= t1 + major; t += major) {
      const x = t * V.pps - sl;
      const lbl = major < 1 ? tc(t).slice(3) : shortTc(t);
      ctx.fillText(lbl, x + 4, 11);
    }
    // playhead cap
    const px = V.time * V.pps - sl;
    const acc = getComputedStyle(document.body).getPropertyValue('--accent') || '#ff7849';
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.moveTo(px - 6, 0); ctx.lineTo(px + 6, 0); ctx.lineTo(px + 6, 18); ctx.lineTo(px, 26); ctx.lineTo(px - 6, 18); ctx.closePath(); ctx.fill();
    if (sl !== lastScroll) { lastScroll = sl; T.body_scrollRedraw(); }
  });
};
function setupRuler() {
  T.rulerWrap.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const mk = e.target.closest('.tl-marker');
    if (mk) return markerDrag(e, mk);
    e.preventDefault();
    const wasPlaying = V.playing;
    if (wasPlaying) V.pause();
    const targets = O.edges();
    const go = ev => {
      let t = T.timeAt(ev.clientX);
      if (V.snap && !ev.shiftKey) { const s = T.snap(t, targets); t = s.t; }
      V.seek(V.snapFrame(t));
      V.scrubAudio(V.time);
      autoScroll(ev);
    };
    go(e);
    document.body.classList.add('dragging-ui');
    const up = () => { document.body.classList.remove('dragging-ui'); removeEventListener('pointermove', go); removeEventListener('pointerup', up); if (wasPlaying) V.play(); };
    addEventListener('pointermove', go); addEventListener('pointerup', up);
  });
  T.rulerWrap.addEventListener('dblclick', async e => {
    const mk = e.target.closest('.tl-marker');
    if (!mk) return;
    const m = V.markers.find(x => x.id === mk.dataset.id);
    const v = await App.prompt('Rename marker', 'Marker label', m.label);
    if (v != null) { V.commit('Rename marker'); m.label = v; V.changed(); }
  });
  T.rulerWrap.addEventListener('contextmenu', e => {
    const mk = e.target.closest('.tl-marker');
    const t = T.timeAt(e.clientX);
    if (mk) {
      const m = V.markers.find(x => x.id === mk.dataset.id);
      App.contextMenu(e, [
        { label: 'Rename…', icon: 'tag', tip: 'Change the marker text.', action: async () => { const v = await App.prompt('Rename marker', 'Marker label', m.label); if (v != null) { V.commit('Rename marker'); m.label = v; V.changed(); } } },
        { label: 'Color', icon: 'palette', tip: 'Pick a color to group markers by meaning.', sub: ['#ffc24b', '#35d6b4', '#ff7849', '#9d84ff', '#5ab0ff', '#ff6fae'].map(col => ({ label: col, action: () => { V.commit('Marker color'); m.color = col; V.changed(); } })) },
        { label: 'Delete marker', icon: 'trash', tip: 'Removes this marker.', action: () => { V.commit('Delete marker'); V.markers = V.markers.filter(x => x !== m); V.changed(); } },
      ]);
    } else {
      App.contextMenu(e, [
        { label: 'Set in point here', icon: 'trimStart', tip: 'Marks the start of the range used for loop playback and range export.', action: () => { V.seek(V.snapFrame(t)); O.setIn(); } },
        { label: 'Set out point here', icon: 'trimEnd', tip: 'Marks the end of the range.', action: () => { V.seek(V.snapFrame(t)); O.setOut(); } },
        { label: 'Clear in/out', icon: 'x', disabled: V.range.in == null && V.range.out == null, tip: 'Removes the in/out range.', action: O.clearRange },
        { label: 'Add marker here', icon: 'marker', tip: 'Drops a marker at this time.', action: () => { V.seek(V.snapFrame(t)); O.addMarker(); } },
        { label: 'Chapters from markers…', icon: 'marker', disabled: !V.markers.length, tip: 'Turns the markers into a YouTube chapter list for your video description.', action: O.chapters },
        { label: 'Delete all markers', icon: 'trash', disabled: !V.markers.length, tip: 'Removes every marker from the timeline.', action: () => { V.commit('Delete markers'); V.markers = []; V.changed(); } },
      ]);
    }
  });
}
function markerDrag(e, el) {
  const m = V.markers.find(x => x.id === el.dataset.id);
  const x0 = e.clientX; let moved = false;
  const mv = ev => {
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    if (!moved) { moved = true; V.commit('Move marker'); }
    m.t = V.snapFrame(T.timeAt(ev.clientX));
    el.style.left = m.t * V.pps + 'px';
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) V.changed(); else { V.pause(); V.seek(m.t); } };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

/* ---------- snapping ---------- */
T.snapTargets = (exclude = new Set()) => {
  const pts = [0, V.time];
  for (const c of V.clips) if (!exclude.has(c.id)) pts.push(c.start, c.start + c.dur);
  for (const m of V.markers) pts.push(m.t);
  if (V.range.in != null) pts.push(V.range.in);
  if (V.range.out != null) pts.push(V.range.out);
  return pts;
};
T.snap = (t, targets) => {
  if (!V.snap) return { t, snapped: false };
  const thr = 9 / V.pps;
  let best = null, bd = thr;
  for (const p of targets) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
  return best != null ? { t: best, snapped: true } : { t, snapped: false };
};
T.showSnap = t => {
  if (t == null) { T.snapLine.style.display = 'none'; return; }
  T.snapLine.style.display = 'block'; T.snapLine.style.left = T.xOf(t) + 'px';
};
T.readout = (ev, text) => {
  if (!ev) { T.readoutEl.style.display = 'none'; return; }
  T.readoutEl.textContent = text;
  T.readoutEl.style.display = 'block';
  T.readoutEl.style.left = (ev.clientX + 14) + 'px';
  T.readoutEl.style.top = (ev.clientY - 30) + 'px';
};
function autoScroll(ev) {
  const r = T.body.getBoundingClientRect();
  if (ev.clientX > r.right - 30) T.body.scrollLeft += 18;
  else if (ev.clientX < r.left + HEAD + 20) T.body.scrollLeft -= 18;
}

/* ---------- lane interactions ---------- */
function setupLanes() {
  T.body.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const lane = e.target.closest('.tl-lane');
    if (!lane) return;
    const clipNode = e.target.closest('.clip');
    const c = clipNode && V.getClip(clipNode.dataset.id);
    if (V.tool === 'blade') {
      if (c && !V.trackLocked(c.trackId)) {
        let t = T.timeAt(e.clientX);
        const s = T.snap(t, T.snapTargets(new Set([c.id]))); t = s.snapped ? s.t : t;
        O.splitAt(c, t, e.shiftKey);
      }
      return;
    }
    if (c) {
      e.preventDefault();
      if (e.shiftKey || e.ctrlKey || e.metaKey) { V.sel.has(c.id) ? V.sel.delete(c.id) : V.sel.add(c.id); }
      else if (!V.sel.has(c.id)) V.sel = new Set([c.id]);
      markSelection();
      V.changed('sel');
      if (V.trackLocked(c.trackId)) return;
      const fk = e.target.closest('.c-fade');
      if (fk) return startFade(e, c, fk.classList.contains('in') ? 'in' : 'out', clipNode);
      const hd = e.target.closest('.h');
      if (hd) return startTrim(e, c, hd.classList.contains('l') ? 'l' : 'r', clipNode, hd);
      if (V.tool === 'slip') return startSlip(e, c, clipNode);
      return startMove(e, c);
    }
    startMarquee(e);
  });
  T.body.addEventListener('dblclick', e => {
    const fk = e.target.closest('.c-fade');
    if (fk) {
      const c = V.getClip(fk.closest('.clip').dataset.id), key = fk.classList.contains('in') ? 'fadeIn' : 'fadeOut';
      if (c && c[key] && !V.trackLocked(c.trackId)) { V.commit('Remove fade'); c[key] = 0; V.changed('props'); V.panels.refreshValues && V.panels.refreshValues(); }
      return;
    }
    const lane = e.target.closest('.tl-lane');
    if (!lane || e.target.closest('.clip')) return;
    V.pause(); V.seek(V.snapFrame(T.timeAt(e.clientX)));
  });
  T.body.addEventListener('pointermove', e => {
    if (V.tool !== 'blade' || e.buttons) return;
    const clipNode = e.target.closest('.clip');
    if (!clipNode) { T.bladeLine.style.display = 'none'; return; }
    let t = T.timeAt(e.clientX);
    const s = T.snap(t, T.snapTargets(new Set([clipNode.dataset.id]))); t = V.snapFrame(s.snapped ? s.t : t);
    T.bladeLine.style.display = 'block';
    T.bladeLine.style.left = T.xOf(t) + 'px';
    T.bladeLine.dataset.t = tc(t) + (e.shiftKey ? '  · all tracks' : '');
  });
  T.body.addEventListener('pointerleave', () => { T.bladeLine.style.display = 'none'; });
  T.body.addEventListener('contextmenu', e => {
    const lane = e.target.closest('.tl-lane');
    if (!lane) return;
    const clipNode = e.target.closest('.clip');
    const t = T.timeAt(e.clientX);
    if (clipNode) {
      const c = V.getClip(clipNode.dataset.id);
      if (!V.sel.has(c.id)) { V.sel = new Set([c.id]); markSelection(); V.changed('sel'); }
      App.contextMenu(e, clipMenu(c, t));
    } else {
      const trackId = lane.dataset.track, tr = V.getTrack(trackId);
      App.contextMenu(e, [
        { label: 'Paste here', icon: 'paste', key: 'Ctrl+V', disabled: !V.clipboard, tip: 'Pastes copied clips starting at this point.', action: () => O.paste(V.snapFrame(t)) },
        { label: 'Close gap', icon: 'gap', tip: 'Slides the clips to the right of this gap left so they butt up against the previous clip.', action: () => O.closeGap(trackId, t) },
        tr.type === 'video' ? { label: 'Add title here', icon: 'text', tip: 'Creates a text clip at this spot.', action: () => O.addText({}, V.snapFrame(t)) } : null,
        tr.type === 'video' ? { label: 'Add color matte here', icon: 'solid', tip: 'Adds a solid or gradient color clip — great as a background for titles.', action: () => O.addColor(V.snapFrame(t), trackId) } : null,
        { label: 'Move playhead here', icon: 'target', tip: 'Jumps the playhead to this time.', action: () => { V.seek(V.snapFrame(t)); } },
      ]);
    }
  });
}
function markSelection() {
  T.grid.querySelectorAll('.clip').forEach(el => el.classList.toggle('sel', V.sel.has(el.dataset.id)));
}
T.markSelection = markSelection;

function clipMenu(c, t) {
  const cs = selClips();
  const speedItems = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map(s => ({ label: s + '×', checked: c.speed === s, action: () => O.setSpeed(cs, s) }));
  speedItems.push({ sep: true }, { label: 'Keep original pitch', checked: c.keepPitch, tip: 'When on, sped-up or slowed-down audio keeps its natural pitch (no chipmunk voices).', action: () => { V.commit('Keep pitch'); cs.forEach(k => k.keepPitch = !c.keepPitch); V.changed(); } });
  const trItems = V.TRANSITIONS.map(tt => ({ label: tt.name, tip: tt.tip, action: () => { V.commit('Add transition'); cs.forEach(k => { k.transIn = { type: tt.id, dur: k.transIn.dur || 0.5 }; }); V.changed(); } }));
  const trOut = V.TRANSITIONS.filter(x => x.id !== 'dissolve').map(tt => ({ label: tt.name, tip: tt.tip, action: () => { V.commit('Add transition'); cs.forEach(k => { k.transOut = { type: tt.id, dur: k.transOut.dur || 0.5 }; }); V.changed(); } }));
  const colors = [['Default', null], ['Red', '#e5484d'], ['Orange', '#f28c28'], ['Yellow', '#d4b106'], ['Green', '#30a46c'], ['Teal', '#12a594'], ['Blue', '#3e63dd'], ['Purple', '#8e4ec6'], ['Pink', '#d6409f']];
  const m = V.getMedia(c.mediaId);
  return [
    { label: 'Split at playhead', icon: 'scissors', key: 'S', disabled: !(V.time > c.start && V.time < c.start + c.dur), tip: 'Cuts this clip at the playhead.', action: O.splitAtPlayhead },
    { label: 'Split here', icon: 'scissors', tip: 'Cuts this clip exactly where you right-clicked.', action: () => O.splitAt(c, t) },
    { sep: true },
    { label: 'Copy', icon: 'copy', key: 'Ctrl+C', tip: 'Copies the selected clips.', action: O.copy },
    { label: 'Cut', icon: 'scissors', key: 'Ctrl+X', tip: 'Copies then removes the selected clips.', action: O.cut },
    { label: 'Duplicate', icon: 'copy', key: 'Ctrl+D', tip: 'Places a copy right after the selection.', action: O.duplicate },
    { label: 'Delete', icon: 'trash', key: 'Del', tip: 'Removes the clip (leaves a gap).', action: () => O.deleteSel(false) },
    { label: 'Ripple delete', icon: 'gap', key: 'Shift+Del', tip: 'Removes the clip and closes the gap.', action: () => O.deleteSel(true) },
    { sep: true },
    c.kind === 'video' || c.kind === 'audio' ? { label: 'Speed', icon: 'speed', tip: 'Speed up or slow down the clip (changes its length).', sub: speedItems } : null,
    V.isVisual(c) ? { label: 'Transition in', icon: 'transition', tip: 'Choose how this clip appears.', sub: trItems } : null,
    V.isVisual(c) ? { label: 'Transition out', icon: 'transition', tip: 'Choose how this clip disappears.', sub: trOut } : null,
    c.kind === 'video' && V.hasAudio(c) ? { label: 'Detach audio', icon: 'detach', tip: 'Moves the sound to its own audio track.', action: () => O.detachAudio(cs) } : null,
    c.kind === 'video' ? { label: 'Freeze frame at playhead', icon: 'freeze', tip: 'Inserts a 2-second still of the frame at the playhead.', action: O.freezeFrame } : null,
    V.hasAudio(c) ? { label: 'Normalize loudness', icon: 'normalize', tip: 'Sets the volume of the selected clips so they all sound equally loud.', sub: [[-14, 'YouTube, Spotify, Instagram (−14 LUFS)'], [-16, 'Podcasts, Apple (−16 LUFS)'], [-23, 'TV broadcast (−23 LUFS)']].map(([t, l]) => ({ label: l, action: () => O.normalizeLoudness(t, cs) })) } : null,
    V.hasAudio(c) ? { label: c.muted ? 'Unmute clip' : 'Mute clip', icon: c.muted ? 'volume' : 'mute', tip: 'Silences only this clip.', action: () => { V.commit('Mute clip'); cs.forEach(k => k.muted = !c.muted); V.changed(); } } : null,
    { label: 'Clip color', icon: 'palette', tip: 'Color-code clips to keep your timeline organized.', sub: colors.map(([n, col]) => ({ label: n, swatch: col || '#4f7cff', checked: c.label === col, action: () => { V.commit('Clip color'); cs.forEach(k => k.label = col); V.changed(); } })) },
    V.isVisual(c) ? { label: 'Copy attributes', icon: 'copy', key: 'Ctrl+Alt+C', tip: 'Copies this clip’s position, scale, color, key, mask and keyframes so you can paste the same look onto other clips.', action: O.copyAttrs } : null,
    V.isVisual(c) ? { label: 'Paste attributes', icon: 'paste', key: 'Ctrl+Alt+V', disabled: !V.attrClipboard, tip: 'Applies copied attributes to the selected clips.', action: O.pasteAttrs } : null,
    V.isVisual(c) ? { label: 'Reset look & motion', icon: 'undo', tip: 'Removes transform, color, key, mask and keyframes from the selected clips.', action: O.resetLook } : null,
    c.kf && Object.keys(c.kf).length ? { label: 'Remove all keyframes', icon: 'keyframe', tip: 'Deletes every keyframe on the selected clips (keeps their current values).', action: () => { V.commit('Remove keyframes'); cs.forEach(k => { for (const p in k.kf || {}) k[p] = V.kfVal(k, p, V.time - k.start); k.kf = {}; }); V.changed(); } } : null,
    { label: 'Rename…', icon: 'tag', tip: 'Give the clip a custom name on the timeline.', action: async () => { const v = await App.prompt('Rename clip', 'Clip name', V.clipName(c)); if (v != null) { V.commit('Rename clip'); c.name = v; V.changed(); } } },
    { sep: true },
    m && (m.type === 'video' || m.type === 'image') ? { label: 'Send frame to Image editor', icon: 'image', tip: 'Opens the current frame in the Image tab for painting or retouching.', action: async () => { App.emit('image:open', await O.frameBlob(), 'Frame ' + tc(V.time)); } } : null,
    m && m.audioBuffer ? { label: 'Open audio in Audio editor', icon: 'wave', tip: 'Loads this clip\'s sound (just the used portion) into the Audio tab for detailed editing.', action: () => sendClipAudio(c, m) } : null,
  ];
}
function sendClipAudio(c, m) {
  const ab = m.audioBuffer, sr = ab.sampleRate;
  const s0 = Math.floor(c.in * sr), s1 = Math.min(ab.length, Math.floor((c.in + c.dur * c.speed) * sr));
  const chans = Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i).slice(s0, s1));
  App.emit('audio:open', { channels: chans, sampleRate: sr, name: V.clipName(c) });
}

/* ---------- move ---------- */
function startMove(e, c0) {
  const items = selClips().filter(c => !V.trackLocked(c.trackId)).map(c => ({ c, start: c.start, trackId: c.trackId, el: T.grid.querySelector(`.clip[data-id="${c.id}"]`) }));
  if (!items.length) return;
  const x0 = e.clientX, y0 = e.clientY, tDown = T.timeAt(x0);
  const ids = new Set(items.map(i => i.c.id));
  const targets = T.snapTargets(ids);
  const minStart = Math.min(...items.map(i => i.start));
  const typeOf = c => (c.kind === 'audio' ? 'audio' : 'video');
  const listOf = type => V.tracks.filter(t => t.type === type);
  let moved = false, dT = 0, dTrack = 0;
  const origIdx = listOf(typeOf(c0)).findIndex(t => t.id === c0.trackId);
  const targetTrack = (i) => {
    if (!dTrack) return i.trackId;
    const list = listOf(typeOf(i.c));
    const idx = list.findIndex(t => t.id === i.trackId) + dTrack;
    const t = list[clamp(idx, 0, list.length - 1)];
    return t && !t.locked ? t.id : i.trackId;
  };
  const mv = ev => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
    if (!moved) { moved = true; items.forEach(i => i.el && i.el.classList.add('dragging')); App.sound('grab'); }
    autoScroll(ev);
    let d = T.timeAt(ev.clientX) - tDown;
    let best = null;
    if (V.snap) for (const i of items) for (const edge of [i.start + d, i.start + i.c.dur + d]) {
      const s = T.snap(edge, targets);
      if (s.snapped && (!best || Math.abs(s.t - edge) < Math.abs(best.delta))) best = { delta: s.t - edge, at: s.t };
    }
    if (best) { d += best.delta; T.showSnap(best.at); } else T.showSnap(null);
    d = Math.max(d, -minStart);
    dT = d;
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const row = under && under.closest('.tl-row[data-track]');
    if (row) {
      const tr = V.getTrack(row.dataset.track);
      if (tr && tr.type === typeOf(c0)) dTrack = listOf(tr.type).indexOf(tr) - origIdx;
    }
    for (const i of items) {
      if (!i.el) continue;
      i.el.style.left = (i.start + d) * V.pps + 'px';
      const tid = targetTrack(i);
      const lane = T.grid.querySelector(`.tl-lane[data-track="${tid}"]`);
      if (lane && i.el.parentNode !== lane) lane.append(i.el);
    }
    const nt = minStart + d;
    T.readout(ev, `${tc(nt)}   ${d >= 0 ? '+' : '−'}${tc(Math.abs(d))}${ev.altKey ? '   copy' : ''}`);
  };
  const up = ev => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    T.showSnap(null); T.readout(null);
    if (!moved) {
      if (!e.shiftKey && !e.ctrlKey && V.sel.size > 1) { V.sel = new Set([c0.id]); markSelection(); V.changed('sel'); }
      return;
    }
    const copy = ev.altKey;
    V.commit(copy ? 'Copy clips' : 'Move clips');
    const movedIds = new Set();
    for (const i of items) {
      let c = i.c;
      if (copy) { c = V.cloneClip(i.c); V.clips.push(c); }
      c.trackId = targetTrack(i);
      c.start = V.snapFrame(i.start + dT);
      movedIds.add(c.id);
    }
    for (const id of movedIds) { const c = V.getClip(id); V.clearRange(c.trackId, c.start, c.start + c.dur, movedIds); }
    if (copy) V.sel = movedIds;
    V.changed();
    App.sound('drop');
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

/* ---------- trim ---------- */
function startTrim(e, c, side, el, handle) {
  e.preventDefault();
  const fps = V.project.fps, minDur = 1 / fps;
  const o = { start: c.start, dur: c.dur, in: c.in, end: c.start + c.dur, kf: JSON.stringify(c.kf || {}) };
  const mdur = V.mediaDurFor(c);
  const others = V.clipsOn(c.trackId).filter(x => x.id !== c.id);
  // rolling edit: Ctrl/Cmd-drag an edge that touches a neighbour moves the cut point for both clips
  const nb = side === 'r' ? others.find(x => Math.abs(x.start - o.end) < 0.75 / fps) : others.find(x => Math.abs(x.start + x.dur - o.start) < 0.75 / fps);
  if ((e.ctrlKey || e.metaKey) && nb) return startRoll(e, side === 'r' ? c : nb, side === 'r' ? nb : c, handle);
  const prevEnd = Math.max(0, ...others.filter(x => x.start + x.dur <= o.start + EPS).map(V.end));
  const nextStart = Math.min(Infinity, ...others.filter(x => x.start >= o.end - EPS).map(x => x.start));
  const later = others.filter(x => x.start >= o.end - EPS).map(x => ({ x, start: x.start, el: T.grid.querySelector(`.clip[data-id="${x.id}"]`) }));
  const targets = T.snapTargets(new Set([c.id]));
  if (V.playing) V.pause();
  handle.classList.add('act');
  document.body.classList.add('dragging-ui');
  let committed = false;
  const mv = ev => {
    if (!committed) { V.commit('Trim'); committed = true; App.sound('grab'); }
    autoScroll(ev);
    let t = T.timeAt(ev.clientX);
    const s = T.snap(t, targets);
    t = s.snapped ? s.t : V.snapFrame(t);
    T.showSnap(s.snapped ? s.t : null);
    let delta = 0;
    if (side === 'l') {
      const srcMin = isFinite(mdur) ? o.start - o.in / c.speed : -Infinity;
      const lo = Math.max(V.ripple ? -Infinity : prevEnd, srcMin, V.ripple ? -Infinity : 0);
      const ns = clamp(t, lo, o.end - minDur);
      delta = ns - o.start;
      c.in = o.in + delta * c.speed;
      c.dur = o.dur - delta;
      c.kf = JSON.parse(o.kf); V.shiftKf(c, delta);
      if (V.ripple) { c.start = o.start; for (const l of later) { l.x.start = Math.max(0, l.start - delta); l.el && layoutClip(l.el, l.x); } V.seek(o.start); }
      else { c.start = ns; V.seek(ns); }
      T.readout(ev, `In ${tc(c.in)}   ·   length ${tc(c.dur)}   (${delta >= 0 ? '−' : '+'}${tc(Math.abs(delta))})`);
    } else {
      const srcMax = o.start + (mdur - o.in) / c.speed;
      const ne = clamp(t, o.start + minDur, Math.min(V.ripple ? Infinity : nextStart, srcMax));
      delta = ne - o.end;
      c.dur = ne - o.start;
      if (V.ripple) for (const l of later) { l.x.start = l.start + delta; l.el && layoutClip(l.el, l.x); }
      V.seek(Math.max(o.start, ne - minDur));
      T.readout(ev, `Out ${tc(c.in + c.dur * c.speed)}   ·   length ${tc(c.dur)}   (${delta >= 0 ? '+' : '−'}${tc(Math.abs(delta))})`);
    }
    layoutClip(el, c);
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    document.body.classList.remove('dragging-ui');
    handle.classList.remove('act'); T.showSnap(null); T.readout(null);
    if (committed) { V.changed(); App.sound('drop'); }
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
/* rolling edit between clip a (left) and b (right) */
function startRoll(e, a, b, handle) {
  const fps = V.project.fps, minDur = 1 / fps;
  const cut0 = b.start, oa = { dur: a.dur }, ob = { start: b.start, dur: b.dur, in: b.in, kf: JSON.stringify(b.kf || {}) };
  const aMax = isFinite(V.mediaDurFor(a)) ? a.start + (V.mediaDurFor(a) - a.in) / a.speed : Infinity;
  const bMin = isFinite(V.mediaDurFor(b)) ? ob.start - ob.in / b.speed : -Infinity;
  const lo = Math.max(a.start + minDur, bMin), hi = Math.min(ob.start + ob.dur - minDur, aMax);
  const ea = T.grid.querySelector(`.clip[data-id="${a.id}"]`), eb = T.grid.querySelector(`.clip[data-id="${b.id}"]`);
  const targets = T.snapTargets(new Set([a.id, b.id]));
  if (V.playing) V.pause();
  handle.classList.add('act');
  let committed = false;
  const mv = ev => {
    if (!committed) { V.commit('Roll edit'); committed = true; }
    let t = T.timeAt(ev.clientX);
    const s = T.snap(t, targets);
    t = clamp(s.snapped ? s.t : V.snapFrame(t), lo, hi);
    T.showSnap(s.snapped ? s.t : null);
    const d = t - cut0;
    a.dur = oa.dur + d;
    b.start = ob.start + d; b.dur = ob.dur - d; b.in = ob.in + d * b.speed;
    b.kf = JSON.parse(ob.kf); V.shiftKf(b, d);
    ea && layoutClip(ea, a); eb && layoutClip(eb, b);
    V.seek(t);
    T.readout(ev, `Roll  ${d >= 0 ? '+' : '−'}${tc(Math.abs(d))}   ·   cut at ${tc(t)}`);
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    handle.classList.remove('act'); T.showSnap(null); T.readout(null);
    if (committed) V.changed();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

/* ---------- audio fade handles ---------- */
function startFade(e, c, side, el) {
  e.preventDefault();
  const key = side === 'in' ? 'fadeIn' : 'fadeOut', other = side === 'in' ? 'fadeOut' : 'fadeIn';
  const x0 = e.clientX, f0 = c[key];
  let committed = false;
  document.body.classList.add('dragging-ui');
  const mv = ev => {
    if (!committed) { V.commit(side === 'in' ? 'Fade in' : 'Fade out'); committed = true; }
    const d = (ev.clientX - x0) / V.pps * (side === 'in' ? 1 : -1);
    c[key] = Math.round(clamp(f0 + d, 0, Math.max(0, c.dur - c[other])) * 100) / 100;
    layoutClip(el, c);
    T.readout(ev, c[key] ? `Fade ${side} ${c[key].toFixed(2)} s` : `No fade ${side}`);
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    document.body.classList.remove('dragging-ui'); T.readout(null);
    if (committed) { V.changed('props'); V.panels.refreshValues && V.panels.refreshValues(); }
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

/* ---------- slip ---------- */
function startSlip(e, c, el) {
  if (c.kind !== 'video' && c.kind !== 'audio') return App.toast('Slip works on video and audio clips');
  e.preventDefault();
  const mdur = V.mediaDurFor(c), o = c.in, x0 = e.clientX;
  let committed = false;
  const mv = ev => {
    if (!committed) { V.commit('Slip'); committed = true; }
    const d = (ev.clientX - x0) / V.pps;
    c.in = clamp(o - d * c.speed, 0, Math.max(0, mdur - c.dur * c.speed));
    layoutClip(el, c);
    const at = V.time >= c.start && V.time < c.start + c.dur ? V.time : c.start;
    V.seek(at);
    T.readout(ev, `Source  ${tc(c.in)} → ${tc(c.in + c.dur * c.speed)}`);
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); T.readout(null); if (committed) V.changed(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

/* ---------- marquee ---------- */
function startMarquee(e) {
  const g = T.grid.getBoundingClientRect();
  const x0 = e.clientX - g.left, y0 = e.clientY - g.top;
  const base = (e.shiftKey || e.ctrlKey) ? new Set(V.sel) : new Set();
  let box = null;
  const mv = ev => {
    const gr = T.grid.getBoundingClientRect();
    const x1 = ev.clientX - gr.left, y1 = ev.clientY - gr.top;
    if (!box && Math.hypot(x1 - x0, y1 - y0) < 4) return;
    if (!box) { box = h('div', { class: 'tl-marquee' }); T.grid.append(box); }
    autoScroll(ev);
    const l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), hh = Math.abs(y1 - y0);
    Object.assign(box.style, { left: l + 'px', top: t + 'px', width: w + 'px', height: hh + 'px' });
    const r = box.getBoundingClientRect();
    V.sel = new Set(base);
    T.grid.querySelectorAll('.clip').forEach(el => {
      const cr = el.getBoundingClientRect();
      if (cr.right > r.left && cr.left < r.right && cr.bottom > r.top && cr.top < r.bottom) V.sel.add(el.dataset.id);
    });
    markSelection();
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (box) box.remove();
    else V.sel = base;
    markSelection();
    V.changed('sel');
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

/* ---------- drag & drop from the bins / desktop ---------- */
T.dragPayload = null;
/* ---------- receiving things from the Audio and Image editors ---------- */
async function importPayload(p) {
  App.toast(`Adding “${p.name}”…`, '', 1500);
  const file = await p.file();
  const [m] = await V.importFiles([file]);
  return m || null;
}
/** a track of the right type that is free over [t0, t1) (adds one if needed) */
const freeTrack = (type, t0, t1) => {
  if (type === 'video') return V.freeVideoTrack(t0, t1, false);
  const tr = V.tracks.find(k => k.type === 'audio' && !k.locked && !V.clips.some(c => c.trackId === k.id && c.start < t1 - 1e-6 && c.start + c.dur > t0 + 1e-6));
  return tr || V.addTrack('audio');
};
App.xfer.receivers.video = {
  accepts: () => true,
  async receive(p, at = V.time) {
    const m = await importPayload(p);
    if (!m) return;
    const dur = m.type === 'image' ? (App.settings.stillDur || 5) : m.duration;
    const tr = freeTrack(m.type === 'audio' ? 'audio' : 'video', at, at + dur);
    O.placeMedia(m, 'overwrite', at, tr.id);
    App.toast(`“${m.name}” placed at ${tc(at)}`, 'ok', 3000, { label: 'Undo', fn: V.undo });
  },
};
function setupDrop() {
  let ind = null;
  const clear = () => { if (ind) { ind.remove(); ind = null; } T.grid.querySelectorAll('.clip.drop-l, .clip.drop-r, .clip.drop-all').forEach(x => x.classList.remove('drop-l', 'drop-r', 'drop-all')); };
  const laneFor = (ev, type) => {
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    let lane = under && under.closest('.tl-lane');
    let tr = lane && V.getTrack(lane.dataset.track);
    if (!tr || tr.type !== type || tr.locked) { tr = V.firstTrack(type); lane = tr && T.grid.querySelector(`.tl-lane[data-track="${tr.id}"]`); }
    return { lane, tr };
  };
  // something carried over from the Audio or Image editor
  const foreign = ev => (App.xfer.isOurs(ev) && App.xfer.current.from !== 'video' ? App.xfer.current : null);
  T.body.addEventListener('dragover', ev => {
    const xp = foreign(ev);
    const p = T.dragPayload || (xp && { kind: 'media', media: { type: xp.kind, duration: xp.duration || App.settings.stillDur || 5 } });
    if (!p && !ev.dataTransfer.types.includes('Files')) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    clear();
    if (!p) return;
    if (xp) App.xfer.hint.show(ev, `Drop “${xp.name}” at ${tc(V.snapFrame(Math.max(0, T.timeAt(ev.clientX))))}`);
    if (p.kind === 'transition' || p.kind === 'look') {
      const node = ev.target.closest('.clip');
      if (node) {
        const r = node.getBoundingClientRect();
        node.classList.add(p.kind === 'look' ? 'drop-all' : ev.clientX < r.left + r.width / 2 ? 'drop-l' : 'drop-r');
      }
      return;
    }
    const type = p.kind === 'media' && p.media.type === 'audio' ? 'audio' : 'video';
    const { lane } = laneFor(ev, type);
    if (!lane) return;
    let t = T.timeAt(ev.clientX);
    const s = T.snap(t, T.snapTargets()); t = s.snapped ? s.t : t;
    const still = App.settings.stillDur || 5, dur = p.kind === 'media' ? (p.media.type === 'image' ? still : p.media.duration) : still;
    ind = h('div', { class: 'drop-indicator', style: { left: t * V.pps + 'px', width: dur * V.pps + 'px' } });
    lane.append(ind);
  });
  T.body.addEventListener('dragleave', ev => { if (!T.body.contains(ev.relatedTarget)) { clear(); App.xfer.hint.hide(); } });
  T.body.addEventListener('drop', async ev => {
    ev.preventDefault();
    clear();
    const xp = foreign(ev);
    const p = T.dragPayload; T.dragPayload = null;
    let t = T.timeAt(ev.clientX);
    const s = T.snap(t, T.snapTargets()); t = V.snapFrame(s.snapped ? s.t : t);
    if (xp) {
      ev.stopPropagation(); App.xfer.end();
      const { tr } = laneFor(ev, xp.kind === 'audio' ? 'audio' : 'video');
      const m = await importPayload(xp);
      if (m) O.placeMedia(m, ev.ctrlKey ? 'insert' : 'overwrite', Math.max(0, t), tr && tr.id);
      return;
    }
    if (!p) {
      const files = Array.from(ev.dataTransfer.files || []);
      if (!files.length) return;
      const added = await V.importFiles(files);
      let at = t;
      for (const m of added) { const c = O.placeMedia(m, 'overwrite', at); if (c) at = c.start + c.dur; }
      return;
    }
    if (p.kind === 'media') {
      const type = p.media.type === 'audio' ? 'audio' : 'video';
      const { tr } = laneFor(ev, type);
      O.placeMedia(p.media, ev.ctrlKey ? 'insert' : 'overwrite', t, tr && tr.id);
    } else if (p.kind === 'text') {
      O.addText(p.preset, t);
    } else if (p.kind === 'transition' || p.kind === 'look') {
      const node = ev.target.closest('.clip');
      const c = node && V.getClip(node.dataset.id);
      if (!c || !V.isVisual(c)) return App.toast('Drop it onto a video, image or title clip');
      if (p.kind === 'look') { V.commit('Apply look'); Object.assign(c.fx, V.defaultFx(), p.look.fx); V.sel = new Set([c.id]); V.changed(); return; }
      const r = node.getBoundingClientRect();
      V.commit('Add transition');
      if (ev.clientX < r.left + r.width / 2) c.transIn = { type: p.id, dur: Math.min(c.transIn.dur || 0.5, c.dur / 2) };
      else c.transOut = { type: p.id === 'dissolve' ? 'fade' : p.id, dur: Math.min(c.transOut.dur || 0.5, c.dur / 2) };
      V.sel = new Set([c.id]);
      V.changed();
    }
  });
}
})();
