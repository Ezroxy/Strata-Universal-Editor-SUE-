/* Video editor — frame-accurate offline export (WebCodecs → MP4 / WebM), animated GIF, audio-only.
   Rendering does not depend on requestAnimationFrame, so it keeps going with the tab in the background. */
(() => {
'use strict';
const App = window.App, V = App.V, M = App.mux;

const waitEvent = (el, ev, ms = 4000) => new Promise(res => {
  let done = false;
  const f = () => { if (done) return; done = true; el.removeEventListener(ev, f); res(true); };
  el.addEventListener(ev, f);
  setTimeout(() => { if (!done) { done = true; el.removeEventListener(ev, f); res(false); } }, ms);
});

/** Export frame provider: WebCodecs decoders when possible, otherwise frame-accurately seeked <video> elements. */
class FrameSource {
  constructor(useDecoders = true) { this.els = new Map(); this.decs = new Map(); this.useDecoders = useDecoders && !!App.demux; this.stats = { fast: 0, seek: 0 }; }
  async get(c) {
    let el = this.els.get(c.id);
    if (!el) {
      const m = V.getMedia(c.mediaId);
      el = document.createElement('video');
      el.muted = true; el.preload = 'auto'; el.playsInline = true; el.src = m.url;
      this.els.set(c.id, el);
      if (el.readyState < 2) await waitEvent(el, 'loadeddata', 10000);
    }
    return el;
  }
  async seek(el, t) {
    if (el.readyState >= 2 && Math.abs(el.currentTime - t) < 1e-4) return;
    const p = waitEvent(el, 'seeked', 6000);
    el.currentTime = t;
    await p;
    if (el.readyState < 2) await waitEvent(el, 'canplay', 3000);
  }
  async prepare(t) {
    const map = new Map();
    for (const { c } of V.activeAt(t)) {
      if (c.kind !== 'video') continue;
      const m = V.getMedia(c.mediaId);
      if (!m || m.loading) continue;
      const st = Math.min(Math.max(0, c.in + (t - c.start) * c.speed), Math.max(0, m.duration - 0.03));
      if (this.useDecoders) {
        let dec = this.decs.get(c.id);
        if (dec === undefined) {
          const info = await App.demux.demux(m.file);
          dec = info ? new App.demux.FrameDecoder(info) : null;
          this.decs.set(c.id, dec);
        }
        if (dec) {
          try {
            const fr = await dec.frameAt(st);
            if (fr) { map.set(c.id, fr); this.stats.fast++; continue; }
          } catch (e) { console.warn('Decoder failed, falling back to seeking', e); dec.close(); this.decs.set(c.id, null); }
        }
      }
      const el = await this.get(c);
      await this.seek(el, st + 0.0005);
      map.set(c.id, el);
      this.stats.seek++;
    }
    return map;
  }
  close() {
    for (const el of this.els.values()) { el.removeAttribute('src'); el.load(); }
    this.els.clear();
    for (const d of this.decs.values()) if (d) d.close();
    this.decs.clear();
  }
}
const dequeue = enc => new Promise(r => {
  if ('ondequeue' in enc) { const f = () => { enc.removeEventListener('dequeue', f); r(); }; enc.addEventListener('dequeue', f); setTimeout(f, 250); }
  else setTimeout(r, 2);
});

V.canFastExport = () => M.supported();

/**
 * Offline export. opts: {container:'mp4'|'webm', width, height, fps, vbitrate, abitrate, t0, t1, onProgress(p, elapsed), onStage(text)}
 * Returns {promise: Promise<Blob>, cancel()}.
 */
V.exportFast = (o) => {
  let cancelled = false;
  const promise = (async () => {
    V.pause();
    const stage = s => o.onStage && o.onStage(s);
    const pickV = await M.pickVideoConfig(o.container, o.width, o.height, o.fps, o.vbitrate);
    if (!pickV) throw new Error(`This browser has no ${o.container.toUpperCase()} video encoder for ${o.width}×${o.height}`);
    const anyAudio = V.clips.some(V.hasAudio);
    stage('Mixing audio…');
    const mix = anyAudio ? await V.renderMix(o.t0, o.t1, 48000) : null;
    const pickA = mix ? await M.pickAudioConfig(o.container, 48000, 2, o.abitrate) : null;
    const muxer = o.container === 'mp4'
      ? new M.Mp4Muxer({ video: { codec: pickV.kind, width: o.width, height: o.height, fps: o.fps }, audio: pickA ? { codec: pickA.kind, sampleRate: 48000, channels: 2, bitrate: o.abitrate } : null })
      : new M.WebmMuxer({ video: { codec: pickV.kind, width: o.width, height: o.height }, audio: pickA ? { sampleRate: 48000, channels: 2 } : null });
    if (pickA) {
      stage('Encoding audio…');
      await M.encodeAudio([mix.getChannelData(0), mix.getChannelData(1)], 48000, pickA.config, (c, m) => muxer.addAudio(c, m));
    }
    let vErr = null;
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideo(c, m), error: e => { vErr = e; } });
    venc.configure(pickV.config);
    const cv = App.canvas(o.width, o.height);
    const ctx = cv.getContext('2d', { alpha: false });
    const scale = o.width / V.project.width;
    const src = new FrameSource();
    const N = Math.max(1, Math.round((o.t1 - o.t0) * o.fps));
    const started = performance.now();
    const gop = Math.max(1, Math.round(o.fps * 2));
    stage('Rendering video…');
    try {
      for (let i = 0; i < N; i++) {
        if (cancelled) throw new Error('cancelled');
        if (vErr) throw vErr;
        const t = o.t0 + i / o.fps;
        const map = await src.prepare(t);
        V.renderFrame(t, ctx, { scale, vids: map });
        const frame = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / o.fps), duration: Math.round(1e6 / o.fps) });
        venc.encode(frame, { keyFrame: i % gop === 0 });
        frame.close();
        while (venc.encodeQueueSize > 4) await dequeue(venc);
        if (i % 2 === 0 || i === N - 1) o.onProgress && o.onProgress((i + 1) / N, (performance.now() - started) / 1000, i === 0 ? cv : null);
      }
      stage('Finishing…');
      await venc.flush();
    } finally { V._exportStats = src.stats; src.close(); try { venc.close(); } catch {} }
    if (vErr) throw vErr;
    return muxer.finalize();
  })();
  return { promise, cancel: () => { cancelled = true; } };
};

/** Animated GIF export (palette from sampled frames, ordered dithering). */
V.exportGif = (o) => {
  let cancelled = false;
  const promise = (async () => {
    V.pause();
    const cv = App.canvas(o.width, o.height), ctx = cv.getContext('2d', { alpha: false, willReadFrequently: true });
    const scale = o.width / V.project.width;
    const src = new FrameSource();
    const N = Math.max(1, Math.round((o.t1 - o.t0) * o.fps));
    const gif = new M.GifEncoder(o.width, o.height);
    const started = performance.now();
    try {
      o.onStage && o.onStage('Building palette…');
      const samples = Math.min(N, 24);
      for (let s = 0; s < samples; s++) {
        if (cancelled) throw new Error('cancelled');
        const t = o.t0 + (s + 0.5) * (o.t1 - o.t0) / samples;
        V.renderFrame(t, ctx, { scale, vids: await src.prepare(t) });
        gif.sample(ctx.getImageData(0, 0, o.width, o.height));
      }
      gif.buildPalette();
      o.onStage && o.onStage('Rendering frames…');
      for (let i = 0; i < N; i++) {
        if (cancelled) throw new Error('cancelled');
        const t = o.t0 + i / o.fps;
        V.renderFrame(t, ctx, { scale, vids: await src.prepare(t) });
        const cs = Math.round((i + 1) * 100 / o.fps) - Math.round(i * 100 / o.fps);
        gif.addFrame(ctx.getImageData(0, 0, o.width, o.height), cs * 10);
        if (i % 2 === 0) o.onProgress && o.onProgress((i + 1) / N, (performance.now() - started) / 1000);
        if (i % 4 === 0) await App.sleep(0);
      }
    } finally { src.close(); }
    return gif.finalize();
  })();
  return { promise, cancel: () => { cancelled = true; } };
};

/** Audio-only export of the timeline mix. format: 'wav' | 'm4a' | 'opus' */
V.exportAudioFile = async (format, t0, t1) => {
  const mix = await V.renderMix(t0, t1, 48000);
  const chs = [mix.getChannelData(0), mix.getChannelData(1)];
  if (format === 'wav') return App.dsp.encodeWAV(chs, 48000, 16);
  return M.encodeAudioFile(chs, 48000, format === 'm4a' ? 'mp4' : 'webm', 192000);
};
})();
