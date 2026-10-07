/* Video editor — project model, media import, edit primitives, undo */
(() => {
'use strict';
const App = window.App;
const { clamp, uid } = App;

/** frame size and rate for new projects (Preferences ▸ Projects) */
const newProjectSpec = () => { const n = App.settings.newVideo || {}; return { width: n.w || 1920, height: n.h || 1080, fps: n.fps || 30, bg: '#000000' }; };
const V = App.V = {
  project: newProjectSpec(),
  media: [],
  tracks: [],
  clips: [],
  markers: [],
  range: { in: null, out: null },
  sel: new Set(),
  time: 0,
  playing: false,
  rate: 1,
  loop: false,
  tool: 'select',
  snap: App.settings.snapDefault !== false,
  ripple: !!App.settings.rippleDefault,
  pps: 60,
  undoStack: [],
  redoStack: [],
  clipboard: null,
  listeners: [],
};

V.addTrackObj = (type) => ({ id: uid('t'), type, hidden: false, locked: false, muted: false, solo: false, name: '' });
V.tracks = [V.addTrackObj('video'), V.addTrackObj('video'), V.addTrackObj('audio'), V.addTrackObj('audio')];

/* ---------- lookups ---------- */
V.getClip = id => V.clips.find(c => c.id === id);
V.getMedia = id => V.media.find(m => m.id === id);
V.getTrack = id => V.tracks.find(t => t.id === id);
V.clipsOn = trackId => V.clips.filter(c => c.trackId === trackId).sort((a, b) => a.start - b.start);
V.end = c => c.start + c.dur;
V.duration = () => V.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
V.snapFrame = t => Math.round(t * V.project.fps) / V.project.fps;
V.frame = () => 1 / V.project.fps;
V.isVisual = c => c.kind !== 'audio';
V.hasAudio = c => {
  if (c.kind === 'audio') return true;
  if (c.kind !== 'video' || c.audioDetached) return false;
  const m = V.getMedia(c.mediaId);
  return !!(m && m.hasAudio);
};
V.trackLabel = tr => {
  if (tr.name) return tr.name;
  const same = V.tracks.filter(t => t.type === tr.type);
  const i = same.indexOf(tr);
  return tr.type === 'video' ? 'V' + (same.length - i) : 'A' + (i + 1);
};
V.mediaDurFor = c => {
  if (c.kind !== 'video' && c.kind !== 'audio') return Infinity;
  const m = V.getMedia(c.mediaId);
  return m ? m.duration : Infinity;
};
V.clipName = c => {
  if (c.name) return c.name;
  if (c.kind === 'text') return (c.text.content || 'Text').split('\n')[0].slice(0, 40);
  if (c.kind === 'color') return 'Color matte';
  const m = V.getMedia(c.mediaId);
  return m ? m.name : 'Clip';
};

/* ---------- change notification ---------- */
V.onChange = fn => V.listeners.push(fn);
V.changed = (what = 'all') => { for (const fn of V.listeners) fn(what); };

/* ---------- undo / redo ---------- */
V.snapshot = () => JSON.stringify({ tracks: V.tracks, clips: V.clips, markers: V.markers, project: V.project, range: V.range });
V.commit = (label = 'Edit') => {
  V.undoStack.push({ s: V.snapshot(), label });
  while (V.undoStack.length > App.undoLimit(200)) V.undoStack.shift();
  V.redoStack.length = 0;
};
V.restore = s => {
  const o = JSON.parse(s);
  const resize = o.project.width !== V.project.width || o.project.height !== V.project.height;
  V.tracks = o.tracks; V.clips = o.clips; V.markers = o.markers; V.project = o.project; V.range = o.range;
  V.sel = new Set([...V.sel].filter(id => V.getClip(id)));
  if (resize && V.resizeCanvas) V.resizeCanvas();
  V.changed('restore');
};
V.undo = () => {
  const e = V.undoStack.pop();
  if (!e) return App.toast('Nothing to undo');
  V.redoStack.push({ s: V.snapshot(), label: e.label });
  V.restore(e.s);
  App.toast('Undo · ' + e.label);
};
V.redo = () => {
  const e = V.redoStack.pop();
  if (!e) return App.toast('Nothing to redo');
  V.undoStack.push({ s: V.snapshot(), label: e.label });
  V.restore(e.s);
  App.toast('Redo · ' + e.label);
};

/* ---------- clip factory ---------- */
V.defaultFx = () => ({ brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0, vignette: 0 });
V.clipDefaults = () => ({
  id: uid('c'), trackId: null, kind: 'video', mediaId: null,
  start: 0, dur: 5, in: 0, speed: 1, keepPitch: true,
  volume: 1, pan: 0, fadeIn: 0, fadeOut: 0, muted: false, audioDetached: false,
  x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipH: false, flipV: false,
  fit: 'contain', blend: 'source-over', motion: 'none',
  crop: { l: 0, t: 0, r: 0, b: 0 },
  fx: V.defaultFx(),
  key: { on: false, color: '#00ff00', similarity: 38, smoothness: 8, spill: 12 },
  mask: { shape: 'none', radius: 40 },
  border: { width: 0, color: '#ffffff' },
  shadow: { on: false, blur: 40, opacity: 55, dist: 14 },
  kf: {},
  transIn: { type: 'none', dur: 0.5 }, transOut: { type: 'none', dur: 0.5 },
  label: null, name: '',
});
V.makeClip = (props) => Object.assign(V.clipDefaults(), props);
/** Fill in properties added in newer versions (for restored / opened projects). */
V.normalizeClip = c => {
  const d = V.clipDefaults();
  for (const k in d) {
    if (k === 'id') continue;
    if (!(k in c)) c[k] = d[k];
    else if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && c[k] && typeof c[k] === 'object') { for (const kk in d[k]) if (!(kk in c[k])) c[k][kk] = d[k][kk]; }
  }
  return c;
};

/* ---------- keyframes ---------- */
V.ANIM = ['x', 'y', 'scale', 'rotation', 'opacity', 'volume'];
const easeIO = p => p * p * (3 - 2 * p);
V.hasKf = (c, prop) => !!(c.kf && c.kf[prop] && c.kf[prop].length);
V.kfVal = (c, prop, lt) => {
  const list = c.kf && c.kf[prop];
  if (!list || !list.length) return c[prop];
  if (lt <= list[0].t) return list[0].v;
  const last = list[list.length - 1];
  if (lt >= last.t) return last.v;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (lt >= a.t && lt <= b.t) {
      if (a.e === 'hold') return a.v;
      let p = (lt - a.t) / Math.max(1e-6, b.t - a.t);
      if (a.e !== 'linear') p = easeIO(p);
      return a.v + (b.v - a.v) * p;
    }
  }
  return c[prop];
};
V.kfAt = (c, prop, lt, tol) => {
  const list = c.kf && c.kf[prop];
  if (!list) return -1;
  tol = tol ?? 0.5 / V.project.fps;
  return list.findIndex(k => Math.abs(k.t - lt) <= tol);
};
V.setKf = (c, prop, lt, v) => {
  c.kf = c.kf || {};
  const list = c.kf[prop] = c.kf[prop] || [];
  const i = V.kfAt(c, prop, lt);
  if (i >= 0) list[i].v = v;
  else { list.push({ t: lt, v, e: 'ease' }); list.sort((a, b) => a.t - b.t); }
};
V.removeKf = (c, prop, lt) => {
  const i = V.kfAt(c, prop, lt);
  if (i >= 0) c.kf[prop].splice(i, 1);
  if (c.kf[prop] && !c.kf[prop].length) delete c.kf[prop];
};
V.shiftKf = (c, d) => { if (!c.kf) return; for (const p in c.kf) for (const k of c.kf[p]) k.t -= d; };
V.scaleKf = (c, f) => { if (!c.kf) return; for (const p in c.kf) for (const k of c.kf[p]) k.t *= f; };
V.kfTimes = c => { const s = new Set(); if (c.kf) for (const p in c.kf) for (const k of c.kf[p]) s.add(+k.t.toFixed(4)); return [...s].sort((a, b) => a - b); };
V.defaultText = () => ({
  content: 'Your Title', font: 'Manrope', size: 110, color: '#ffffff', bold: true, italic: false, align: 'center',
  stroke: '#000000', strokeW: 0, shadow: 'soft', bg: false, bgColor: '#000000', bgAlpha: 0.6, anim: 'fade', spacing: 0,
});
V.defaultFill = () => ({ c1: '#1d2b53', c2: '#ff7849', gradient: true, angle: 135 });
V.cloneClip = c => Object.assign(JSON.parse(JSON.stringify(c)), { id: uid('c') });

/* ---------- edit primitives (no commit — callers commit first) ---------- */
V.splitClip = (c, t) => {
  t = V.snapFrame(t);
  if (t <= c.start + 1e-6 || t >= c.start + c.dur - 1e-6) return null;
  const r = V.cloneClip(c);
  const leftDur = t - c.start;
  r.start = t; r.dur = c.dur - leftDur; r.in = c.in + leftDur * c.speed;
  V.shiftKf(r, leftDur);
  r.transIn = { type: 'none', dur: c.transIn.dur }; r.fadeIn = 0;
  c.dur = leftDur; c.transOut = { type: 'none', dur: c.transOut.dur }; c.fadeOut = 0;
  V.clips.push(r);
  return r;
};
/** Remove clip content in [t0, t1) on a track (overwrite edit). */
V.clearRange = (trackId, t0, t1, exclude = new Set()) => {
  for (const c of [...V.clips]) {
    if (c.trackId !== trackId || exclude.has(c.id)) continue;
    const e = c.start + c.dur;
    if (e <= t0 + 1e-6 || c.start >= t1 - 1e-6) continue;
    if (c.start >= t0 - 1e-6 && e <= t1 + 1e-6) V.clips.splice(V.clips.indexOf(c), 1);
    else if (c.start < t0 && e > t1) { V.splitClip(c, t1); c.dur = t0 - c.start; }
    else if (c.start < t0) c.dur = t0 - c.start;
    else { const d = t1 - c.start; c.in += d * c.speed; c.dur -= d; c.start = t1; V.shiftKf(c, d); }
  }
};
V.rippleShift = (trackId, fromT, delta, exclude = new Set()) => {
  for (const c of V.clips) if (c.trackId === trackId && !exclude.has(c.id) && c.start >= fromT - 1e-6) c.start = Math.max(0, c.start + delta);
};
/** Open a gap of `dur` at time t on a track, splitting any clip that spans t. */
V.rippleInsert = (trackId, t, dur) => {
  const spanning = V.clips.find(c => c.trackId === trackId && c.start < t - 1e-6 && c.start + c.dur > t + 1e-6);
  if (spanning) V.splitClip(spanning, t);
  V.rippleShift(trackId, t, dur);
};
V.removeClips = ids => {
  V.clips = V.clips.filter(c => !ids.has(c.id));
  for (const id of ids) V.sel.delete(id);
};
V.rippleDelete = ids => {
  const list = V.clips.filter(c => ids.has(c.id)).sort((a, b) => b.start - a.start);
  for (const c of list) {
    V.clips.splice(V.clips.indexOf(c), 1);
    V.rippleShift(c.trackId, c.start + c.dur, -c.dur);
  }
  for (const id of ids) V.sel.delete(id);
};
V.trackLocked = id => { const t = V.getTrack(id); return !t || t.locked; };
V.firstTrack = (type, unlocked = true) => {
  const list = V.tracks.filter(t => t.type === type && (!unlocked || !t.locked));
  if (!list.length) return null;
  return type === 'video' ? list[list.length - 1] : list[0];
};
V.addTrack = (type, atIndex) => {
  const t = V.addTrackObj(type);
  if (atIndex != null) V.tracks.splice(atIndex, 0, t);
  else if (type === 'video') V.tracks.unshift(t);
  else V.tracks.push(t);
  return t;
};
/** Find (or create) a video track that is free in [t0, t1), searching from bottom up. */
V.freeVideoTrack = (t0, t1, above = true) => {
  const vids = V.tracks.filter(t => t.type === 'video' && !t.locked).reverse();
  const start = above ? 1 : 0;
  for (let i = Math.min(start, vids.length - 1); i < vids.length; i++) {
    const tr = vids[i];
    if (!V.clips.some(c => c.trackId === tr.id && c.start < t1 - 1e-6 && c.start + c.dur > t0 + 1e-6)) return tr;
  }
  return V.addTrack('video');
};

/* ---------- media import ---------- */
const extType = name => {
  const e = (name.split('.').pop() || '').toLowerCase();
  if (['mp4', 'webm', 'mov', 'mkv', 'm4v', 'ogv', 'avi'].includes(e)) return 'video';
  if (['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus', 'weba'].includes(e)) return 'audio';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(e)) return 'image';
  return null;
};
const once = (el, ev) => new Promise(res => el.addEventListener(ev, res, { once: true }));

async function loadVideoMeta(m) {
  const v = document.createElement('video');
  v.preload = 'metadata'; v.muted = true; v.src = m.url;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('This video format cannot be decoded by the browser.')); });
  if (!isFinite(v.duration)) {
    v.currentTime = 1e9;
    await Promise.race([once(v, 'durationchange'), new Promise(r => setTimeout(r, 3000))]);
  }
  m.duration = isFinite(v.duration) ? v.duration : 10;
  m.width = v.videoWidth; m.height = v.videoHeight;
  v.removeAttribute('src'); v.load();
}
async function genThumbs(m) {
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = m.url;
  await once(v, 'loadeddata');
  const n = clamp(Math.ceil(m.duration / 1.5), 6, 60);
  const th = 72, tw = Math.round(th * (m.width / m.height || 16 / 9));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(m.duration - 0.05, (i + 0.5) * m.duration / n);
    v.currentTime = Math.max(0, t);
    await Promise.race([once(v, 'seeked'), new Promise(r => setTimeout(r, 1500))]);
    const c = App.canvas(tw, th);
    c.getContext('2d').drawImage(v, 0, 0, tw, th);
    out.push({ t, c });
    if (i === 0) { m.thumbs = out; V.changed('media'); }
  }
  m.thumbs = out;
  v.removeAttribute('src'); v.load();
}
async function decodeAudio(m) {
  if (m.file.size > 1.2e9) return;
  try {
    const ab = await App.ac().decodeAudioData(await m.file.arrayBuffer());
    m.audioBuffer = ab; m.hasAudio = true; m.env = App.dsp.envelope(ab, 100);
    if (m.type === 'audio') m.duration = ab.duration;
  } catch (e) {
    m.hasAudio = false;
    if (m.type === 'audio') throw new Error('This audio format cannot be decoded.');
  }
}

V.importFiles = async (files, opts = {}) => {
  const added = [];
  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi];
    const type = (f.type.split('/')[0] in { video: 1, audio: 1, image: 1 }) ? f.type.split('/')[0] : extType(f.name);
    if (!type) { App.toast('Unsupported file: ' + f.name, 'warn'); continue; }
    const m = { id: (opts.ids && opts.ids[fi]) || uid('m'), name: f.name, type, file: f, url: URL.createObjectURL(f), duration: 0, width: 0, height: 0, loading: true, thumbs: [], env: null, audioBuffer: null, hasAudio: false, _stored: !!opts.stored };
    V.media.push(m);
    V.changed('media');
    try {
      if (type === 'video') await loadVideoMeta(m);
      if (type === 'video' && !(m.width && m.height)) {
        // sound only, in a video container (e.g. a .webm or .mp4 exported from the Audio editor) → treat it as audio
        m.type = 'audio';
        await decodeAudio(m);
        m.loading = false; added.push(m);
      } else if (type === 'video') {
        m.loading = false;
        added.push(m);
        V.changed('media');
        // first video sets the project frame size when the timeline is empty
        if (!opts.restore && !V.clips.length && m.width && m.height && (m.width !== V.project.width || m.height !== V.project.height) && !V._matched) {
          V._matched = true;
          V.project.width = m.width; V.project.height = m.height;
          V.resizeCanvas && V.resizeCanvas();
          App.toast(`Project frame set to ${m.width}×${m.height} to match “${m.name}”`);
        }
        genThumbs(m).catch(() => {}).finally(() => V.changed('media'));
        decodeAudio(m).finally(() => V.changed('media'));
      } else if (type === 'audio') {
        await decodeAudio(m);
        m.loading = false; added.push(m);
      } else {
        const img = await App.loadImage(m.url);
        m.img = img; m.width = img.naturalWidth || 1280; m.height = img.naturalHeight || 720; m.duration = Infinity;
        const th = 64, tw = Math.round(th * m.width / m.height);
        const c = App.canvas(tw, th); c.getContext('2d').drawImage(img, 0, 0, tw, th);
        m.thumbs = [{ t: 0, c }];
        m.loading = false; added.push(m);
      }
    } catch (err) {
      V.media.splice(V.media.indexOf(m), 1);
      App.toast(`${f.name}: ${err.message || 'could not be loaded'}`, 'err', 4000);
    }
    V.changed('media');
  }
  if (added.length && !opts.restore) { V.saveSoon && V.saveSoon(); App.toast(`Imported ${added.length} file${added.length > 1 ? 's' : ''}`, 'ok'); }
  return added;
};
V.importBlob = (blob, name) => V.importFiles([new File([blob], name, { type: blob.type })]);

/* ---------- persistence ---------- */
V.name = 'Untitled project';
V.serialize = () => ({
  name: V.name, project: V.project, tracks: V.tracks, clips: V.clips, markers: V.markers, range: V.range,
  media: V.media.filter(m => !m.loading || m.file).map(m => ({ id: m.id, name: m.name, type: m.type })),
});
V.save = async () => {
  await App.store.set('video:project', V.serialize());
  for (const m of V.media) if (!m._stored && m.file) { await App.store.set('video:media:' + m.id, m.file); m._stored = true; }
  await App.store.prune('video:media:', new Set(V.media.map(m => 'video:media:' + m.id)));
};
V.saveSoon = App.makeSaver('video', V.save, 1200);
App.on('store-cleared', () => { for (const m of V.media) m._stored = false; });
/** Replace the project. fromStore = the media blobs come from the autosave store (so they don't need saving again). */
V.loadData = async (p, getBlob, fromStore = false) => {
  V.pause && V.pause();
  V.saveSoon.paused = true;
  for (const m of V.media) { try { URL.revokeObjectURL(m.url); } catch {} }
  V.media = [];
  V.name = p.name || 'Untitled project';
  V.project = Object.assign({ width: 1920, height: 1080, fps: 30, bg: '#000000' }, p.project);
  V.tracks = p.tracks && p.tracks.length ? p.tracks : [V.addTrackObj('video'), V.addTrackObj('audio')];
  V.clips = (p.clips || []).map(V.normalizeClip);
  V.markers = p.markers || [];
  V.range = p.range || { in: null, out: null };
  V.undoStack = []; V.redoStack = []; V.sel = new Set(); V.time = 0; V._matched = true;
  V.resizeCanvas && V.resizeCanvas();
  V.changed('restore');
  const files = [], ids = [];
  let missing = 0;
  for (const mm of p.media || []) {
    const b = await getBlob(mm).catch(() => null);
    if (b) { files.push(b instanceof File ? b : new File([b], mm.name, { type: b.type })); ids.push(mm.id); } else missing++;
  }
  await V.importFiles(files, { ids, restore: true, stored: fromStore });
  if (missing) App.toast(`${missing} media file(s) could not be restored`, 'warn', 5000);
  V.saveSoon.paused = false;
  V.changed('restore');
};
V.restoreSession = async () => {
  let p = null;
  try { p = await App.store.get('video:project'); } catch {}
  if (!p || (!p.clips?.length && !p.media?.length)) return false;
  await V.loadData(p, mm => App.store.get('video:media:' + mm.id), true);
  return true;
};
V.newProject = async () => {
  if ((V.clips.length || V.media.length) && !(await App.confirm('New project', 'Start a new, empty video project? The current one will be closed (save it first with File ▸ Save project if you want to keep it).', 'New project', true))) return;
  await V.loadData({ name: 'Untitled project', project: newProjectSpec(), tracks: [V.addTrackObj('video'), V.addTrackObj('video'), V.addTrackObj('audio'), V.addTrackObj('audio')] }, async () => null);
  V._matched = false;
  V.saveSoon();
};
V.saveProjectFile = () => {
  const data = V.serialize();
  const blobs = [];
  data.media = V.media.filter(m => m.file).map(m => { blobs.push(m.file); return { id: m.id, name: m.name, type: m.type, blob: blobs.length - 1 }; });
  App.saveProjectFile('video', V.name, data, blobs);
};
})();
