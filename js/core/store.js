/* Strata Studio — persistence: IndexedDB key/value store, autosave scheduler, .strata project files, settings */
(() => {
'use strict';
const App = window.App;

/* ---------- settings (localStorage) ---------- */
const DEFAULTS = {
  tips: true, tipDelay: 420, autosave: true, reduceMotion: false, previewQuality: 'auto', scrub: true, welcomeSeen: false,
  // appearance (applied by themes.js)
  theme: 'dark', accentMode: 'theme', accentColor: '#ff7849', uiFont: 'theme', roundness: null, transparency: null, density: 'normal', themeEffects: true,
  checker: 'light', checkerSize: 16,
  // UI sounds (sound.js)
  sounds: true, soundVolume: 55, soundPack: 'theme', soundCats: {}, soundQuiet: true,
  // interface
  toastPos: 'bottom', toastTime: 'normal', welcome: 'always', startMode: 'last',
  uiScale: 1, timelineWheel: 'zoom',
  // projects & editors
  autosaveSpeed: 'normal', undoSize: 'normal', newVideo: { w: 1920, h: 1080, fps: 30 }, newImage: { w: 1280, h: 800, bg: 'white' },
  snapDefault: true, rippleDefault: false, stillDur: 5, audioView: 'wave', zeroSnapDefault: false,
};
App.SETTING_DEFAULTS = DEFAULTS;
let saved = {};
try { saved = JSON.parse(localStorage.getItem('strata.settings') || '{}'); } catch {}
try { if (localStorage.getItem('strata.tips') === '0') saved.tips = false; } catch {}
// every theme now has its own welcome screen, shown at each start; older saves defaulted to "first launch only"
if (!saved.welcomeThemed) { if (saved.welcome === 'first') saved.welcome = 'always'; saved.welcomeThemed = true; }
App.settings = Object.assign({}, DEFAULTS, saved);
/** Undo history length for an editor, scaled by the "Undo steps" preference. */
App.undoLimit = base => Math.round(base * ({ small: 0.5, normal: 1, large: 2.5 }[App.settings.undoSize] || 1));
App.setSetting = (k, v) => {
  App.settings[k] = v;
  try { localStorage.setItem('strata.settings', JSON.stringify(App.settings)); } catch {}
  App.emit && App.emit('setting', k, v);
};

/* ---------- IndexedDB ---------- */
// ask the browser not to evict autosaved work under storage pressure (granted silently where allowed)
try { navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}); } catch {}
let dbp = null;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
  const r = indexedDB.open('strata-studio', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('kv', mode), st = t.objectStore('kv');
    const req = fn(st);
    t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Storage transaction aborted (disk full?)'));
  });
};
App.store = {
  get: key => tx('readonly', st => st.get(key)),
  set: (key, val) => tx('readwrite', st => st.put(val, key)),
  del: key => tx('readwrite', st => st.delete(key)),
  keys: () => tx('readonly', st => st.getAllKeys()),
  clear: () => tx('readwrite', st => st.clear()),
  /** delete every key starting with prefix that is not in keep */
  async prune(prefix, keep) {
    const ks = await App.store.keys();
    const dead = ks.filter(k => typeof k === 'string' && k.startsWith(prefix) && !keep.has(k));
    if (dead.length) await tx('readwrite', st => { dead.forEach(k => st.delete(k)); return null; });
  },
};

/* ---------- autosave scheduler ---------- */
App.saveState = {};
let leaving = false, leaveTimer = 0;
// the database starts closing as soon as an unload begins, so treat the moments after beforeunload as "leaving" too
// (if the page stays — e.g. the unload was cancelled — the flag clears itself)
addEventListener('beforeunload', () => { leaving = true; clearTimeout(leaveTimer); leaveTimer = setTimeout(() => { leaving = false; }, 3000); });
addEventListener('pagehide', () => { leaving = true; clearTimeout(leaveTimer); });
/**
 * Debounced saver. touch() schedules a save; touch.now() saves immediately and returns a promise that
 * resolves once a save containing the latest state has finished (saves never overlap — they queue).
 */
App.makeSaver = (mod, fn, delay = 1500) => {
  let timer = 0, chain = Promise.resolve(), queued = false, dirty = false;
  const status = s => { App.saveState[mod] = s; App.emit('save-status', mod, s); };
  const run = () => {
    clearTimeout(timer);
    if (queued) return chain;   // a save that hasn't started yet will already include the latest state
    queued = true;
    chain = chain.then(async () => {
      queued = false; dirty = false; status('saving');
      try { await fn(); status(dirty ? 'dirty' : 'saved'); }
      catch (e) { if (leaving) return; console.error('Autosave failed', e); status('error'); }   // the DB closes mid-save while the page unloads — harmless
    });
    return chain;
  };
  const touch = () => {
    if (!App.settings.autosave || touch.paused) return;
    dirty = true; status('dirty');
    clearTimeout(timer);
    timer = setTimeout(run, delay * ({ quick: 0.35, normal: 1, relaxed: 3.5 }[App.settings.autosaveSpeed] || 1));
  };
  touch.now = run;
  touch.paused = false;
  return touch;
};

/* ---------- .strata project container ---------- */
const MAGIC = 'STRATA01';
App.packProject = (module, data, blobs = []) => {
  const enc = new TextEncoder();
  let off = 0;
  const meta = blobs.map(b => { const m = { offset: off, size: b.size, type: b.type || '' }; off += b.size; return m; });
  const json = enc.encode(JSON.stringify({ app: 'strata-studio', v: 1, module, data, blobs: meta, saved: new Date().toISOString() }));
  const head = new Uint8Array(12);
  head.set(enc.encode(MAGIC));
  new DataView(head.buffer).setUint32(8, json.length, true);
  return new Blob([head, json, ...blobs], { type: 'application/octet-stream' });
};
App.unpackProject = async file => {
  const buf = await file.arrayBuffer();
  if (buf.byteLength < 12 || new TextDecoder().decode(new Uint8Array(buf, 0, 8)) !== MAGIC) throw new Error('This is not a Strata Studio project file');
  const len = new DataView(buf).getUint32(8, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, len)));
  const base = 12 + len;
  const blobs = meta.blobs.map(b => new Blob([new Uint8Array(buf, base + b.offset, b.size)], { type: b.type }));
  return { module: meta.module, data: meta.data, blobs };
};
App.saveProjectFile = (module, name, data, blobs) => {
  const blob = App.packProject(module, data, blobs);
  App.download(blob, (name || 'project').replace(/[\\/:*?"<>|]/g, '') + '.strata');
  App.toast(`Saved project file · ${App.fmtBytes(blob.size)}`, 'ok');
};
App.openProjectFile = async (file) => {
  if (!file) { [file] = await App.pickFiles('.strata', false); if (!file) return; }
  try {
    const p = await App.unpackProject(file);
    const mod = App.modules[p.module];
    if (!mod || !mod.loadProject) throw new Error('Unknown project type');
    App.setMode(p.module);
    await mod.loadProject(p.data, p.blobs, file.name.replace(/\.strata$/i, ''));
    App.toast(`Opened “${file.name}”`, 'ok');
  } catch (e) { App.toast(e.message || 'Could not open project', 'err', 5000); }
};
})();
