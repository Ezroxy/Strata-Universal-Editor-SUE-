/* Auto captions — speech-to-text worker (module). Runs OpenAI Whisper (base, 8-bit) entirely on this computer via
   transformers.js + ONNX Runtime (WebAssembly). Nothing is downloaded: the model ships in models/whisper-base.
   Messages in:  {type:'load'} · {type:'run', audio: Float32Array (16 kHz mono), language: 'auto'|code, task, words} · {type:'cancel'}
   Messages out: {type:'load', loaded, total} · {type:'ready', threads} · {type:'plan', chunks, speech}
                 {type:'language', code} · {type:'chunk', i, n, words:[{text, t0, t1}]} · {type:'done'} · {type:'error', message} */
import { pipeline, env, Tensor } from '../../vendor/transformers/transformers.min.js';

const base = new URL('../../', import.meta.url).href;
env.allowRemoteModels = false;
env.allowLocalModels = true;
// a site-relative path: transformers.js only treats non-http(s) paths as local files
env.localModelPath = new URL('../../models/', import.meta.url).pathname;
env.useBrowserCache = false;
env.useWasmCache = false;
const threads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 1;
env.backends.onnx.wasm.numThreads = threads;

// ONNX Runtime starts its thread pool with `new Worker(import.meta.url)` from inside this worker. The desktop app (WebView2)
// can't load a worker started from inside another worker from its built-in server — the model would hang forever after
// loading. Loading the runtime from a blob: URL makes its threads start from that blob instead, which works everywhere.
let ortBlob = null;
async function ortPaths() {
  if (!ortBlob) {
    const src = await (await fetch(base + 'vendor/ort/ort-wasm-simd-threaded.asyncify.mjs')).text();
    ortBlob = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  }
  return { mjs: ortBlob, wasm: base + 'vendor/ort/ort-wasm-simd-threaded.asyncify.wasm' };
}

const SR = 16000;
let asr = null, loading = null, cancelled = false;
const post = m => self.postMessage(m);

function load() {
  if (!loading) {
    const files = {};
    loading = ortPaths().then(paths => { env.backends.onnx.wasm.wasmPaths = paths; }).then(() => pipeline('automatic-speech-recognition', 'whisper-base', {
      dtype: 'q8', device: 'wasm',
      progress_callback: p => {
        if (p.status !== 'progress' || !p.total) return;
        files[p.file] = [p.loaded, p.total];
        let a = 0, b = 0; for (const k in files) { a += files[k][0]; b += files[k][1]; }
        post({ type: 'load', loaded: a, total: b });
      },
    })).then(p => { asr = p; return p; });
    loading.catch(() => { loading = null; });
  }
  return loading;
}

/* ---------- where is the speech? 20 ms energy frames → speech regions → chunks of at most 28 s, cut in pauses ---------- */
function plan(audio) {
  const F = 320, n = Math.floor(audio.length / F), db = new Float32Array(n);
  for (let f = 0; f < n; f++) { let s = 0; for (let i = f * F, e = i + F; i < e; i++) s += audio[i] * audio[i]; db[f] = 10 * Math.log10(s / F + 1e-10); }
  const sorted = Float32Array.from(db).sort(), pct = q => sorted[Math.min(n - 1, Math.floor(q * (n - 1)))] ?? -100;
  const lo = pct(0.1), hi = pct(0.95);
  if (!n || hi < -58) return [];
  const thr = Math.min(hi - 6, Math.max(lo + 0.3 * (hi - lo), lo + 6, -60));
  const sp = new Uint8Array(n); for (let f = 0; f < n; f++) sp[f] = db[f] > thr ? 1 : 0;
  // close short gaps (< 0.4 s), drop blips (< 0.1 s), pad 0.25 s
  let regs = [];
  for (let f = 0; f < n;) { if (!sp[f]) { f++; continue; } let e = f; while (e < n && sp[e]) e++; regs.push([f, e]); f = e; }
  const merged = [];
  for (const r of regs) { const last = merged[merged.length - 1]; if (last && r[0] - last[1] < 20) last[1] = r[1]; else merged.push(r.slice()); }
  regs = merged.filter(r => r[1] - r[0] >= 5).map(([a, b]) => [Math.max(0, a - 12), Math.min(n, b + 12)]);
  // pack into chunks ≤ 28 s; split very long regions at their quietest moment
  const MAX = 28 * 50, MIN_CUT = 16 * 50, chunks = [];
  let cs = -1, ce = -1;
  const flush = () => { if (cs >= 0) chunks.push([cs * F, Math.min(audio.length, ce * F)]); cs = ce = -1; };
  for (let [a, b] of regs) {
    if (cs >= 0 && b - cs > MAX) flush();
    if (cs < 0) cs = a;
    while (b - cs > MAX) {
      let cut = cs + MAX, best = Infinity;
      for (let f = cs + MIN_CUT; f < cs + MAX; f++) if (db[f] < best) { best = db[f]; cut = f; }
      ce = cut; flush(); cs = cut;
    }
    ce = b;
  }
  flush();
  return chunks;
}

/* Whisper can't detect the language on its own here, so ask the model directly: which language token is most likely first? */
async function detectLanguage(audio) {
  const gc = asr.model.generation_config;
  const { input_features } = await asr.processor(audio);
  const ids = new Tensor('int64', BigInt64Array.from([BigInt(gc.decoder_start_token_id)]), [1, 1]);
  const out = await asr.model({ input_features, decoder_input_ids: ids });
  const logits = out.logits.data, V = out.logits.dims[out.logits.dims.length - 1], off = logits.length - V;
  let best = 'en', bv = -Infinity;
  for (const [tok, id] of Object.entries(gc.lang_to_id)) { const v = logits[off + id]; if (v > bv) { bv = v; best = tok.slice(2, -2); } }
  return best;
}

/* collapse runaway repeats (a known Whisper failure on music or noise) */
const tidy = words => {
  const out = [];
  for (const w of words) {
    const k = w.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    let run = 0; for (let i = out.length - 1; i >= 0 && out[i]._k === k; i--) run++;
    if (k && run >= 4) continue;
    out.push(Object.assign(w, { _k: k }));
  }
  return out.map(({ _k, ...w }) => w);
};

async function run({ audio, language, task, words: wantWords }) {
  cancelled = false;
  await load();
  post({ type: 'ready', threads });
  const chunks = plan(audio);
  post({ type: 'plan', chunks: chunks.length, speech: chunks.reduce((s, [a, b]) => s + (b - a) / SR, 0) });
  if (!chunks.length) return post({ type: 'done' });
  let lang = language && language !== 'auto' ? language : null;
  if (!lang) {
    // the chunk with the most audio gives the most reliable guess
    const [a, b] = chunks.reduce((m, c) => (c[1] - c[0] > m[1] - m[0] ? c : m), chunks[0]);
    try { lang = await detectLanguage(audio.subarray(a, Math.min(b, a + 30 * SR))); } catch (e) { lang = 'en'; }
    post({ type: 'language', code: lang });
  }
  let wordMode = wantWords !== false;
  for (let i = 0; i < chunks.length; i++) {
    await new Promise(r => setTimeout(r, 0));   // let a pending 'cancel' message in
    if (cancelled) return post({ type: 'done', cancelled: true });
    const [a, b] = chunks[i], seg = audio.slice(a, b), t0 = a / SR, dur = (b - a) / SR;
    const opts = { language: lang, task: task || 'transcribe', return_timestamps: wordMode ? 'word' : true };
    let r;
    try { r = await asr(seg, opts); }
    catch (e) { if (!wordMode) throw e; wordMode = false; r = await asr(seg, { ...opts, return_timestamps: true }); }
    const list = (r.chunks || [{ text: r.text, timestamp: [0, dur] }])
      .map(c => ({ text: (c.text || '').trim(), t0: t0 + Math.min(dur, c.timestamp[0] ?? 0), t1: t0 + Math.min(dur, c.timestamp[1] ?? dur) }))
      .filter(w => w.text);
    for (const w of list) if (w.t1 < w.t0) w.t1 = w.t0;
    post({ type: 'chunk', i, n: chunks.length, upto: b / SR, segments: !wordMode, words: tidy(list) });
  }
  post({ type: 'done' });
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'load') { await load(); post({ type: 'ready', threads }); }
    else if (m.type === 'run') await run(m);
    else if (m.type === 'cancel') cancelled = true;
  } catch (err) { post({ type: 'error', message: String(err && err.message || err) }); }
};
