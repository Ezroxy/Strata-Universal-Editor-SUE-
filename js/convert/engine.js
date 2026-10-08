/* Strata Studio — Converter engine host: two ffmpeg workers (js/convert/ffworker.js), one for converting and one for
   reading file details, so adding files stays instant while a long conversion runs.
   App.CV.engine.probe(file)                      → { info, S }   (ffprobe JSON + App.CV.summarize)
   App.CV.engine.thumb(file, S)                   → Blob | null    (small JPEG preview)
   App.CV.engine.run({ inputs, args, out, mime, onProgress, onLog }) → { promise, cancel }
   Each worker holds ~1 GB of (mostly unused) shared memory, so it is shut down after a few idle minutes and started
   again on demand. Everything runs on this computer: no file ever leaves it. */
(() => {
'use strict';
const App = window.App, CV = App.CV;
const IDLE_MS = 3 * 60 * 1000;
// This FFmpeg build locks up for good on about its 66th run in the same worker (some internal pool runs out), so each
// worker is replaced by a fresh one well before that. Starting one takes about a second.
const MAX_RUNS = 20;
CV.threads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 4));   // more than 4 breaks some encoders in this build
CV.supported = () => typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated && typeof WebAssembly === 'object';

function host(name) {
  let w = null, ready = null, n = 0, idle = 0, busy = 0, runs = 0;
  const pend = new Map();
  const state = { name, status: 'off' };
  const emit = () => App.emit('convert:engine', state);
  const kill = (why) => {
    if (w) { w.terminate(); w = null; }
    ready = null; state.status = 'off'; emit();
    for (const [, p] of pend) p.reject(new Error(why || 'stopped'));
    pend.clear();
  };
  const arm = () => { clearTimeout(idle); if (!busy) idle = setTimeout(() => kill('idle'), IDLE_MS); };
  const start = () => {
    if (ready) return ready;
    state.status = 'loading'; emit();
    runs = 0;
    w = new Worker(new URL('js/convert/ffworker.js', document.baseURI), { type: 'module' });
    w.onmessage = ({ data }) => {
      const p = pend.get(data.id);
      if (!p) return;
      if (data.type === 'progress') return p.onProgress && p.onProgress(data);
      if (data.type === 'log') return p.onLog && p.onLog(data.line);
      pend.delete(data.id);
      data.ok ? p.resolve(data) : p.reject(Object.assign(new Error(data.error || 'failed'), { log: data.log }));
    };
    w.onerror = e => { e.preventDefault && e.preventDefault(); kill('The converter engine stopped unexpectedly' + (e.message ? ': ' + e.message : '') + '.'); };
    ready = call({ type: 'load', mt: true }).then(r => { state.status = 'ready'; emit(); arm(); return r; }, e => { kill(); throw e; });
    return ready;
  };
  function call(msg, cb = {}, transfer) {
    return new Promise((resolve, reject) => {
      const id = ++n;
      pend.set(id, { resolve, reject, ...cb });
      w.postMessage({ id, ...msg }, transfer || []);
    });
  }
  return {
    state,
    async request(msg, cb) {
      if (!CV.supported()) throw new Error('The converter needs Strata Studio to run from start.bat or the desktop app (it uses several CPU threads).');
      busy++; clearTimeout(idle);
      try {
        await start();
        state.status = 'busy'; emit();
        return await call(msg, cb);
      } finally {
        busy--;
        if (msg.type === 'run' || msg.type === 'probe') runs++;
        if (w && !busy && runs >= MAX_RUNS) kill('recycle');
        else if (w && state.status === 'busy' && !busy) { state.status = 'ready'; emit(); }
        arm();
      }
    },
    kill,
  };
}
const conv = host('convert'), info = host('info');
CV.engine = {
  conv, info,
  warm() { if (CV.supported()) info.request({ type: 'noop' }).catch(() => {}); },
  async probe(file, retry = true) {
    // reading a file takes well under a second; a probe that hangs gets one more try on a fresh worker
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('Reading the file took too long.'), { stuck: true })), 45000); });
    try {
      const r = await Promise.race([info.request({ type: 'probe', file }), timeout]);
      return { info: r.info, S: CV.summarize(r.info, file) };
    } catch (e) {
      if (e.stuck) { info.kill('stuck'); if (retry) return CV.engine.probe(file, false); }
      throw e;
    } finally { clearTimeout(timer); }
  },
  async thumb(file, S) {
    if (!S || !S.v) return null;
    const at = S.kind === 'video' ? Math.min(S.duration * 0.1, 10) : 0;
    try {
      const r = await info.request({ type: 'run', inputs: [file], args: [...(at ? ['-ss', at.toFixed(2)] : []), '-i', '@in0', '-map', '0:v:0', '-frames:v', '1', '-vf', "scale='min(320,iw)':-2:flags=bilinear", '-q:v', '5', '-update', '1', 'thumb.jpg'], outputs: ['thumb.jpg'], mime: { 'thumb.jpg': 'image/jpeg' } });
      return r.files[0].blob;
    } catch { return null; }
  },
  /** inputs: File[] (mounted as @in0, @in1…) */
  run({ inputs, args, out, mime, onProgress, onLog }) {
    let cancelled = false;
    const promise = conv.request({ type: 'run', inputs, args, outputs: [out], mime: { [out]: mime } }, { onProgress, onLog })
      .then(r => r.files[0].blob, e => {
        if (cancelled) throw Object.assign(new Error('Cancelled'), { cancelled: true });
        conv.kill('reset');   // start from a clean engine after a failure
        throw e;
      });
    return { promise, cancel: () => { cancelled = true; conv.kill('Cancelled'); } };
  },
};
})();
