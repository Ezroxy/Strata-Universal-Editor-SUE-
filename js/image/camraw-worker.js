/* Camera Raw render worker: keeps the preview sources and their analysis caches (depth, sky, subject)
   and renders settings into pixels off the main thread. Messages:
     {type:'src', id, w, h, buf}       store a source (transferred)
     {type:'render', id, job, S, aux}  → {job, id, w, h, buf, hist, clipLo, clipHi, ms}
     {type:'final', id, job, S, aux}   tiled full-size render → progress messages, then {job, buf} */
importScripts('camraw-core.js');
const srcs = {};
self.onmessage = e => {
  const m = e.data;
  try {
    if (m.type === 'src') { srcs[m.id] = { buf: new Uint8ClampedArray(m.buf), w: m.w, h: m.h, cache: {} }; return; }
    if (m.type === 'drop') { delete srcs[m.id]; return; }
    const s = srcs[m.id];
    if (!s) return postMessage({ job: m.job, error: 'missing source ' + m.id });
    const t0 = performance.now();
    if (m.type === 'render') {
      const r = CR.process(s.buf, s.w, s.h, m.S, m.aux || {}, s.cache);
      postMessage({ job: m.job, id: m.id, w: s.w, h: s.h, buf: r.out.buffer, hist: r.hist, clipLo: r.clipLo, clipHi: r.clipHi, ms: performance.now() - t0 }, [r.out.buffer]);
    } else if (m.type === 'final') {
      const out = CR.renderTiled(s.buf, s.w, s.h, m.S, m.aux || {}, s.cache, p => postMessage({ job: m.job, progress: p }));
      postMessage({ job: m.job, id: m.id, w: s.w, h: s.h, buf: out.buffer, ms: performance.now() - t0 }, [out.buffer]);
    }
  } catch (err) { postMessage({ job: m.job, error: String(err && err.stack || err) }); }
};
