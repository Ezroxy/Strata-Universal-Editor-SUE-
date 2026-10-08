/* Video editor — playback engine: video element pool, audio scheduling (keyframed volume,
   pitch-preserving speed), scrubbing, transport clock, real-time export fallback */
(() => {
'use strict';
const App = window.App, V = App.V;
const { clamp } = App;

/* ---------- preview quality ---------- */
V.previewScale = 1;
V.updatePreviewScale = () => {
  const q = App.settings.previewQuality, w = V.project.width;
  V.previewScale = q === 'full' ? 1 : q === 'half' ? 0.5 : q === 'quarter' ? 0.25 : (w > 2600 ? 0.5 : w > 1920 ? 0.75 : 1);
};
App.on('setting', k => { if (k === 'previewQuality' && V.resizeCanvas) V.resizeCanvas(); });

/* ---------- video element pool (one element per clip) ---------- */
const vids = new Map();
const POOL = 8;                // loaded elements kept for clips that are off screen (each one holds a decoder)
const unload = el => { el.pause(); el.removeAttribute('src'); el.load(); };
V.videoEl = c => {
  let el = vids.get(c.id);
  if (el && el._mediaId === c.mediaId) { el._used = performance.now(); return el; }
  if (el) unload(el);
  const m = V.getMedia(c.mediaId);
  el = document.createElement('video');
  el.muted = true; el.playsInline = true; el.preload = 'auto';
  el._mediaId = c.mediaId; el._used = performance.now(); el._want = null; el._lag = 0.1;
  el.src = m.url;
  // the frame a seek lands on is drawn by the next render, which then asks for the newest position
  el.addEventListener('seeked', () => {
    if (el._seekAt) el._lag = clamp(0.7 * el._lag + 0.3 * (performance.now() - el._seekAt) / 1000, 0.02, 0.5);
    el._seekAt = 0; el._waitAt = 0;
    V.requestRender();
  });
  el.addEventListener('loadeddata', () => { el._waitAt = 0; V.requestRender(); });
  el.addEventListener('error', () => V.requestRender());
  vids.set(c.id, el);
  return el;
};
const seekTo = (el, t) => { el._want = t; el._seekAt = performance.now(); el.currentTime = t; };
/* A <video> that fails, or stays unable to show a picture, is swapped for a fresh one: before, a decoder that
   gave up (e.g. after a burst of seeks while dragging the playhead) left the preview black until a restart. */
const STUCK_MS = 8000;
const heals = new Map();
V.videoReady = c => {
  let el = V.videoEl(c);
  const now = performance.now();
  if (!el.error && !el.seeking && el.readyState >= 2) { el._waitAt = 0; heals.delete(c.id); return true; }
  if (!el._waitAt) el._waitAt = now;
  const hl = heals.get(c.id) || { n: 0, next: 0 };
  // a slow file only gets two reloads for hanging (reloading would never let a very slow seek finish)
  if ((el.error || (now - el._waitAt > STUCK_MS && hl.n < 2)) && now >= hl.next) {
    heals.set(c.id, { n: hl.n + 1, next: now + 2000 * 2 ** Math.min(hl.n, 5) });
    unload(el); vids.delete(c.id);
    el = V.videoEl(c);
  }
  return false;
};
/** Steer a clip's <video> towards source time st. While playing, small drift is corrected by nudging the
    speed a few percent (a seek would stall the picture); only a big gap is closed with a jump. */
V.syncVideo = (el, c, st, m) => {
  if (el.error) return;
  const fps = V.project.fps, now = performance.now();
  const maxT = Math.max(0, (m.duration || 0) - 0.04);
  const hold = st > maxT;
  st = clamp(st, 0, maxT);
  const live = V.playing && V.rate > 0 && !hold;
  if (live) {
    const pr = clamp(c.speed * V.rate, 0.0625, 16);
    if (el.paused) {
      if (Math.abs(el.currentTime - st) > 0.1 * Math.max(1, pr)) seekTo(el, st);
      el.playbackRate = pr; el._want = null; el._grace = now + 400;
      const p = el.play(); if (p) p.catch(() => {});
      return;
    }
    if (el.seeking || now < el._grace) return;
    const drift = el.currentTime - st;   // > 0: the picture is ahead of the sound, < 0: behind
    if (Math.abs(drift) > Math.max(0.6, 0.35 * pr)) {
      seekTo(el, Math.min(maxT, st + el._lag * pr));   // land a little ahead, so it doesn't trail behind again
      el.playbackRate = pr; el._grace = now + 500;
    } else {
      const want = Math.abs(drift) < 0.025 ? pr : clamp(pr * clamp(1 - drift * 1.5, 0.8, 1.25), 0.0625, 16);
      if (Math.abs(el.playbackRate - want) > 0.01 * pr) el.playbackRate = want;
    }
  } else {
    if (!el.paused) el.pause();
    if (el.seeking) return;   // 'seeked' renders again, and that render asks for the newest position
    if (el._want != null && Math.abs(el._want - st) < 1e-4) return;   // already asked for exactly this
    if (Math.abs(el.currentTime - st) > 0.45 / fps) seekTo(el, st);
  }
};
V.pauseInactive = active => {
  const idle = [];
  for (const [id, el] of vids) {
    if (active.has(id)) continue;
    if (!el.paused) el.pause();
    idle.push([id, el]);
  }
  // let go of the least recently shown ones, so a long edit with many cuts never runs out of decoders
  if (idle.length > POOL) {
    idle.sort((a, b) => a[1]._used - b[1]._used);
    for (const [id, el] of idle.slice(0, idle.length - POOL)) { unload(el); vids.delete(id); }
  }
};
V.preroll = t => {
  for (const c of V.clips) {
    if (c.kind !== 'video' || c.start <= t || c.start > t + 1.2) continue;
    const tr = V.getTrack(c.trackId);
    if (!tr || tr.hidden) continue;
    const el = V.videoEl(c);
    if (el.paused && !el.seeking && !el.error && Math.abs(el.currentTime - c.in) > 0.08) seekTo(el, c.in);
  }
};
V.gcVideos = () => {
  for (const [id, el] of vids) {
    if (!V.getClip(id)) { unload(el); vids.delete(id); heals.delete(id); }
  }
};

/* ---------- pitch-preserving speed: background time-stretch cache ---------- */
const stretch = new Map();
V.getStretched = (m, speed) => {
  const key = m.id + '@' + speed.toFixed(4);
  const v = stretch.get(key);
  if (v instanceof AudioBuffer) return v;
  if (v) return null;
  const ab = m.audioBuffer;
  const chs = Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i));
  const p = Promise.all(chs.map(c => App.dsp.work('timeStretch', c, speed, ab.sampleRate))).then(out => {
    const b = new AudioBuffer({ length: Math.max(1, out[0].length), numberOfChannels: out.length, sampleRate: ab.sampleRate });
    out.forEach((c, i) => b.copyToChannel(c, i));
    stretch.set(key, b);
    if (V.playing && !V.exporting) V.restartClock();
    return b;
  }).catch(() => { stretch.delete(key); return null; });
  stretch.set(key, p);
  return null;
};
V.ensureStretched = async () => {
  const jobs = [];
  for (const c of V.clips) {
    if (c.speed === 1 || !c.keepPitch || !V.hasAudio(c)) continue;
    const m = V.getMedia(c.mediaId);
    if (!m || !m.audioBuffer) continue;
    if (!V.getStretched(m, c.speed)) jobs.push(stretch.get(m.id + '@' + c.speed.toFixed(4)));
  }
  await Promise.all(jobs);
};

/* ---------- audio ---------- */
V.audioNodes = [];
V.masterVol = 1;
V.ensureMaster = () => {
  if (V.master) return;
  const ac = App.ac();
  V.master = ac.createGain();
  V.master.gain.value = V.masterVol;
  const split = ac.createChannelSplitter(2);
  V.anL = ac.createAnalyser(); V.anR = ac.createAnalyser();
  V.anL.fftSize = V.anR.fftSize = 1024;
  V.master.connect(split); split.connect(V.anL, 0); split.connect(V.anR, 1);
  V.master.connect(ac.destination);
};
/** Schedule every audible clip on ctx from timeline time t0 (at ctx time `when`) until tEnd. */
V.scheduleAudio = (ctx, dest, t0, when, rate = 1, tEnd = Infinity) => {
  const nodes = [];
  const soloOn = V.tracks.some(tr => tr.type === 'audio' && tr.solo);
  for (const c of V.clips) {
    const tr = V.getTrack(c.trackId);
    if (!tr || !V.hasAudio(c) || c.muted) continue;
    if (tr.muted) continue;
    if (soloOn && !(tr.type === 'audio' && tr.solo)) continue;
    if (c.volume <= 0 && !V.hasKf(c, 'volume')) continue;
    const m = V.getMedia(c.mediaId);
    let buf = m && m.audioBuffer;
    if (!buf) continue;
    const cEnd = c.start + c.dur;
    if (cEnd <= t0 || c.start >= tEnd) continue;
    const startT = Math.max(t0, c.start);
    let offset = c.in + (startT - c.start) * c.speed;
    let durSrc = (Math.min(cEnd, tEnd) - startT) * c.speed;
    let pr = c.speed * rate;
    if (c.speed !== 1 && c.keepPitch) {
      const sb = V.getStretched(m, c.speed);
      if (sb) { buf = sb; offset /= c.speed; durSrc /= c.speed; pr = rate; }
    }
    if (offset >= buf.duration || durSrc <= 0) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pr;
    const g = ctx.createGain();
    const ctxAt = tt => when + (tt - t0) / rate;
    const gainAt = tt => {
      let k = 1;
      if (c.fadeIn > 0 && tt < c.start + c.fadeIn) k = Math.min(k, (tt - c.start) / c.fadeIn);
      if (c.fadeOut > 0 && tt > cEnd - c.fadeOut) k = Math.min(k, (cEnd - tt) / c.fadeOut);
      return Math.max(0, V.kfVal(c, 'volume', tt - c.start)) * clamp(k, 0, 1);
    };
    const ws = ctxAt(startT);
    g.gain.setValueAtTime(gainAt(startT), Math.max(0, ws));
    const pts = [c.start + c.fadeIn, cEnd - c.fadeOut, cEnd];
    if (V.hasKf(c, 'volume')) {
      const ks = c.kf.volume;
      ks.forEach((k, i) => { pts.push(c.start + k.t); if (i < ks.length - 1) for (let j = 1; j < 6; j++) pts.push(c.start + k.t + (ks[i + 1].t - k.t) * j / 6); });
    }
    const uniq = [...new Set(pts.filter(x => x > startT + 1e-4 && x <= Math.min(cEnd, tEnd)).map(x => +x.toFixed(5)))].sort((a, b) => a - b);
    for (const p of uniq) g.gain.linearRampToValueAtTime(gainAt(p), ctxAt(p));
    let out = g;
    if (c.pan && ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = c.pan; g.connect(pn); out = pn; }
    src.connect(g); out.connect(dest);
    src.start(Math.max(ws, ctx.currentTime), offset, durSrc);
    nodes.push(src);
  }
  return nodes;
};
V.stopAudio = () => {
  for (const n of V.audioNodes) { try { n.stop(); } catch {} try { n.disconnect(); } catch {} }
  V.audioNodes = [];
};
V.startAudio = () => {
  V.stopAudio();
  if (!V.playing || V.rate <= 0 || V.silent) return;
  V.ensureMaster();
  V.audioNodes = V.scheduleAudio(App.ac(), V.master, V.clock.t0, V.clock.ctx0, V.rate);
};
V.renderMix = async (t0, t1, sr = 48000) => {
  await V.ensureStretched();
  const len = Math.max(1, Math.ceil((t1 - t0) * sr));
  const oac = new OfflineAudioContext(2, len, sr);
  const g = oac.createGain(); g.gain.value = V.masterVol; g.connect(oac.destination);
  V.scheduleAudio(oac, g, t0, 0, 1, t1);
  return oac.startRendering();
};
/* short audio grains while scrubbing */
let lastScrub = 0;
V.scrubAudio = t => {
  if (!App.settings.scrub || V.playing || App.active !== 'video') return;
  const now = performance.now();
  if (now - lastScrub < 55) return;
  lastScrub = now;
  const ac = App.ac(); V.ensureMaster();
  const g = ac.createGain(), at = ac.currentTime + 0.005, len = 0.075;
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.008); g.gain.setValueAtTime(1, at + len - 0.015); g.gain.linearRampToValueAtTime(0, at + len);
  g.connect(V.master);
  const nodes = V.scheduleAudio(ac, g, t, at, 1, t + len);
  setTimeout(() => { nodes.forEach(n => { try { n.disconnect(); } catch {} }); g.disconnect(); }, 400);
};

/* ---------- transport ---------- */
const timeListeners = [], stateListeners = [];
V.onTime = fn => timeListeners.push(fn);
V.onPlayState = fn => stateListeners.push(fn);
V.emitTime = () => timeListeners.forEach(f => f(V.time));
const emitState = () => stateListeners.forEach(f => f(V.playing));
V.playRange = () => {
  const d = V.duration();
  const a = V.range.in ?? 0, b = V.range.out ?? d;
  return [a, Math.max(a + V.frame(), b)];
};
V.play = (rate) => {
  if (App.active !== 'video') return;   // only the editor on screen plays; the Audio editor has its own transport
  const ac = App.ac();
  if (rate != null) V.rate = rate;
  if (V.playing) { V.restartClock(); return; }
  const d = V.duration();
  if (!d) return;
  if (V.rate > 0 && V.time >= d - 1e-3 && !V.loop) V.time = 0;
  if (V.loop && V.rate > 0) { const [a, b] = V.playRange(); if (V.time < a || V.time >= b) V.time = a; }
  V.playing = true;
  V.clock = { ctx0: ac.currentTime + 0.06, t0: V.time };
  V.startAudio();
  emitState();
  requestAnimationFrame(tick);
};
V.restartClock = () => {
  if (!V.playing) return;
  V.clock = { ctx0: App.ac().currentTime + 0.04, t0: V.time };
  V.startAudio();
};
V.pause = () => {
  if (!V.playing) return;
  V.playing = false;
  V.stopAudio();
  for (const el of vids.values()) if (!el.paused) el.pause();
  V.time = V.snapFrame(V.time);
  V.rate = 1;
  V.renderFrame(V.time);
  V.emitTime();
  emitState();
};
V.togglePlay = () => (V.playing ? V.pause() : V.play(1));
V.seek = t => {
  V.time = Math.max(0, t);
  if (V.playing) V.restartClock();
  else V.requestRender();
  V.emitTime();
};
V.step = n => { V.pause(); V.seek(V.snapFrame(V.time) + n / V.project.fps); };
V.shuttle = dir => {
  if (dir === 0) { V.pause(); V.rate = 1; return; }
  let r;
  if (!V.playing || Math.sign(V.rate) !== dir) r = dir;
  else r = clamp(V.rate * 2, -8, 8);
  V.rate = r;
  if (V.playing) V.restartClock(); else V.play(r);
  App.toast(`Shuttle ${r > 0 ? '▶' : '◀'} ${Math.abs(r)}×`, '', 900);
};
function tick() {
  if (!V.playing) return;
  const ac = App.ac();
  let t = V.clock.t0 + Math.max(0, ac.currentTime - V.clock.ctx0) * V.rate;
  const d = V.duration();
  if (V.exporting) {
    if (t >= V.exporting.t1) { V.time = V.exporting.t1; V.renderFrame(V.time); V.exporting.done(); return; }
  } else if (V.loop && V.rate > 0) {
    const [a, b] = V.playRange();
    if (t >= b) { t = a; V.time = a; V.restartClock(); }
  } else if (V.rate > 0 && t >= d) {
    V.time = d; V.pause(); return;
  } else if (V.rate < 0 && t <= 0) {
    V.time = 0; V.pause(); return;
  }
  V.time = t;
  V.renderFrame(t);
  V.preroll(t);
  V.emitTime();
  requestAnimationFrame(tick);
}

/* ---------- real-time export (fallback when WebCodecs is unavailable) ---------- */
V.realtimeFormats = () => {
  if (!window.MediaRecorder) return [];
  return [['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'], ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm']]
    .filter(([m]) => MediaRecorder.isTypeSupported(m));
};
V.exportRealtime = ({ mime, bitrate, t0, t1, onProgress }) => {
  let cancelled = false, rec = null;
  const promise = (async () => {
    V.pause();
    const mix = await V.renderMix(t0, t1);
    if (cancelled) throw new Error('cancelled');
    const ac = App.ac();
    const dest = ac.createMediaStreamDestination();
    const vstream = V.canvas.captureStream(V.project.fps);
    const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    V.time = t0; V.renderFrame(t0);
    await new Promise(r => setTimeout(r, 350));
    V.renderFrame(t0);
    const stopped = new Promise(res => { rec.onstop = res; });
    rec.start(250);
    const src = ac.createBufferSource(); src.buffer = mix; src.connect(dest);
    const ctx0 = ac.currentTime + 0.08;
    src.start(ctx0);
    V.silent = true;
    await new Promise(res => {
      V.exporting = { t1, done: res };
      V.playing = true; V.rate = 1;
      V.clock = { ctx0, t0 };
      emitState();
      const prog = setInterval(() => {
        if (cancelled) { clearInterval(prog); res(); return; }
        onProgress && onProgress((V.time - t0) / (t1 - t0));
        if (!V.exporting) clearInterval(prog);
      }, 200);
      requestAnimationFrame(tick);
    });
    V.exporting = null; V.silent = false;
    V.playing = false; emitState();
    try { src.stop(); } catch {}
    for (const el of vids.values()) el.pause();
    rec.stop();
    await stopped;
    vstream.getTracks().forEach(t => t.stop());
    if (cancelled) throw new Error('cancelled');
    return new Blob(chunks, { type: mime.split(';')[0] });
  })();
  return { promise, cancel: () => { cancelled = true; if (V.exporting) V.exporting.done(); } };
};
})();
