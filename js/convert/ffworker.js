/* Strata Studio — Converter engine: runs ffmpeg (WebAssembly, vendor/ffmpeg*) in a module worker.
   Messages in:  { id, type: 'load', mt }                      → { id, ok, threads }
                 { id, type: 'probe', file }                   → { id, ok, info }   (ffprobe JSON)
                 { id, type: 'run', inputs: [File], args, outputs: [name] } → { id, ok, files: [{ name, blob }], code, log }
   Messages out while running: { id, type: 'progress', time, ratio } and { id, type: 'log', line }.
   Input files are mounted read-only (WORKERFS) so even very large files are never copied into memory; outputs are
   written to the in-memory file system and handed back as Blobs. Cancelling = terminating the worker. */
let core = null, cur = null, logs = [], threaded = false;

const base = new URL('../../vendor/', import.meta.url).href;

async function load(mt, mem) {
  if (core) return threaded;
  const dir = base + 'ffmpeg/';   // the multi-threaded build (needs cross-origin isolation, which server.js and the desktop app give)
  const coreURL = dir + 'ffmpeg-core.js';
  const create = (await import(coreURL)).default;
  const opts = { mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL: dir + 'ffmpeg-core.wasm', workerURL: dir + 'ffmpeg-core.worker.js' }))}` };
  if (mt && mem) opts.INITIAL_MEMORY = mem;   // the threaded build cannot grow its memory, so it is sized up front
  core = await create(opts);
  threaded = !!mt;
  core.setLogger(({ type, message }) => {
    if (cur == null) return;
    logs.push(message);
    if (logs.length > 400) logs.splice(0, logs.length - 300);
    if (type === 'stderr') {
      const m = /time=\s*(-?\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message), fr = /frame=\s*(\d+)/.exec(message);
      if (m) postMessage({ id: cur, type: 'progress', time: +m[1] * 3600 + +m[2] * 60 + +m[3], frame: fr ? +fr[1] : 0 });
    }
    postMessage({ id: cur, type: 'log', line: message });
  });
  core.setProgress(({ progress, time }) => { if (cur != null) postMessage({ id: cur, type: 'progress', ratio: progress, time: time / 1e6 }); });
  return threaded;
}

let mountN = 0;
// mounted under plain names (in0.mkv, in1.png…): some file names would otherwise be read as patterns (e.g. "%03d")
const safe = (f, i) => new File([f], 'in' + i + ((/\.[a-z0-9]{1,6}$/i.exec(f.name) || [''])[0]).toLowerCase(), { type: f.type });
function mount(files) {
  const dir = '/in' + (++mountN);
  core.FS.mkdir(dir);
  core.FS.mount(core.FS.filesystems.WORKERFS, { files }, dir);
  return dir;
}
function unmount(dir) { try { core.FS.unmount(dir); core.FS.rmdir(dir); } catch {} }
const rm = p => { try { core.FS.unlink(p); } catch {} };

function exec(args) {
  core.setTimeout(-1);
  // ('unwind' is how this build reports a thread that could not start; the host restarts the engine after any error)
  try { core.exec(...args); } catch (e) {
    if (e === 'unwind') throw new Error('The converter engine stopped early.');
    if (e instanceof RangeError || /allocation failed|out of memory/i.test(String(e && e.message))) throw new Error('The result is too large to build in memory (the limit is about 2 GB per file). Trim it, lower the quality or pick a smaller format.');
    throw e;
  }
  const r = core.ret;
  core.reset();
  return r;
}

async function probe(file) {
  file = safe(file, 0);
  const dir = mount([file]);
  logs = [];
  try {
    core.setTimeout(-1);
    core.ffprobe('-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-show_chapters', '-o', '/probe.json', `${dir}/${file.name}`);
    core.reset();
    let txt = '';
    try { txt = new TextDecoder().decode(core.FS.readFile('/probe.json')); } catch {}
    rm('/probe.json');
    if (!txt.trim()) throw new Error(lastError() || 'This file could not be read.');
    return JSON.parse(txt);
  } finally { unmount(dir); }
}

function lastError() {
  const bad = logs.filter(l => /error|invalid|not supported|could not|unknown|failed|no such/i.test(l) && !/^\s*(built with|configuration|lib)/.test(l));
  return (bad[bad.length - 1] || '').trim();
}

async function run({ inputs, args, outputs, mime }) {
  inputs = inputs.map(safe);
  const dir = inputs.length ? mount(inputs) : null;
  logs = [];
  const a = args.map(x => (typeof x === 'string' ? x.replace(/^@in(\d+)$/, (_, i) => `${dir}/${inputs[+i].name}`) : String(x)));
  try {
    const code = exec(a);
    const files = [];
    for (const name of outputs) {
      let data = null;
      try { data = core.FS.readFile('/' + name); } catch {}
      rm('/' + name);
      if (data && data.length) files.push({ name, blob: new Blob([data], { type: (mime && mime[name]) || 'application/octet-stream' }) });
    }
    // a non-zero exit code means ffmpeg gave up part-way: whatever it left behind is not a usable file
    if (code !== 0 || !files.length) throw new Error(lastError() || `ffmpeg stopped with code ${code}`);
    return { code, files, log: logs.slice(-60) };
  } finally {
    for (const name of outputs) rm('/' + name);
    if (dir) unmount(dir);
  }
}

onmessage = async ({ data }) => {
  const { id, type } = data;
  cur = id;
  try {
    let res;
    if (type === 'load') res = { threads: await load(data.mt, data.mem) };
    else if (type === 'noop') res = {};
    else if (!core) throw new Error('The converter engine is not loaded.');
    else if (type === 'probe') res = { info: await probe(data.file) };
    else if (type === 'run') res = await run(data);
    else throw new Error('Unknown request ' + type);
    postMessage({ id, ok: true, ...res });
  } catch (e) {
    postMessage({ id, ok: false, error: String((e && e.message) || e), log: logs.slice(-60) });
  } finally { cur = null; }
};
