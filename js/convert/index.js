/* Strata Studio — the Convert workspace (fourth tab): turn any video, audio, picture or subtitle file into another
   format. Files go into a queue; each has its own target and settings (the side panel edits the selected ones); the
   queue converts one file at a time in the background (js/convert/engine.js), so you can keep editing elsewhere.
   Results can be downloaded (one by one or as a ZIP), opened in the Video / Audio / Image editor, or dragged onto
   their tabs. Plans (what is copied, what is re-encoded and how) come from js/convert/formats.js. */
(() => {
'use strict';
const App = window.App, CV = App.CV, E = CV.engine;
const { h, btn, icon } = App;
const X = App.xfer;

/* ---------- state ---------- */
const C = App.Conv = { items: [], sel: new Set(), running: null, stopAll: false };
const LS = 'strata.cv';
const store = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();
const saveStore = () => { try { localStorage.setItem(LS, JSON.stringify(store)); } catch {} };
store.defaults = store.defaults || {};          // per source kind: { target, o }
if (store.autoSave == null) store.autoSave = true;
let uid = 0;
const el = {};
const KIND_ICON = { video: 'film', audio: 'wave', image: 'image', sub: 'captions', unknown: 'fileAny' };
const accent = () => App.cssVar('--convert') || App.cssVar('--accent') || '#f2b33d';
const fmtB = b => App.fmtBytes(Math.max(0, Math.round(b || 0)));
const baseName = n => n.replace(/\.[^.]+$/, '');
const extOf = n => ((/\.([a-z0-9]{1,6})$/i.exec(n) || [])[1] || '').toLowerCase();
const busy = () => !!C.running;
const pending = () => C.items.filter(i => i.status === 'ready' || i.status === 'error');
const selected = () => C.items.filter(it => C.sel.has(it.id));
const targets = () => (C.sel.size ? selected() : C.items);

/* ---------- adding files ---------- */
const IMG_FALLBACK = /^(avif|heic|heif|svg|svgz)$/;
/** pictures ffmpeg can't read (AVIF, SVG…) are decoded by the browser into a lossless PNG first */
async function browserDecode(file) {
  try {
    let bmp;
    if (/svg/.test(file.type) || /\.svg$/i.test(file.name)) {
      const url = URL.createObjectURL(new Blob([file], { type: 'image/svg+xml' }));   // without the type the browser won't draw it
      const img = await App.loadImage(url).finally(() => setTimeout(() => URL.revokeObjectURL(url), 1000));
      const c = App.canvas(img.naturalWidth || 1024, img.naturalHeight || 1024); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); bmp = c;
    } else bmp = await createImageBitmap(file);
    const c = App.canvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return blob ? new File([blob], baseName(file.name) + '.png', { type: 'image/png' }) : null;
  } catch { return null; }
}
C.add = async (files, { target } = {}) => {
  files = [...files].filter(f => f && f.size !== undefined && !/\.strata$/i.test(f.name));
  if (!files.length) return [];
  if (App.active !== 'convert') App.setMode('convert');
  const added = files.map(file => ({ id: 'c' + (++uid), file, src: file, name: file.name, size: file.size, status: 'probing', S: null, target: target || null, o: {}, extra: {}, progress: 0 }));
  C.items.push(...added);
  if (added.length) { C.sel = new Set([added[added.length - 1].id]); }
  render();
  App.sound && App.sound('drop');
  for (const it of added) probe(it);
  return added;
};
async function probe(it) {
  try {
    let r;
    try { r = await E.probe(it.src); } catch (e) { r = null; it._probeErr = e; }
    // pictures this FFmpeg build recognises but can't decode (SVG, AVIF's AV1) or can't open at all go through the browser
    const browserPic = IMG_FALLBACK.test(extOf(it.name)) || (r && r.S.kind === 'image' && /^(svg|av1)$/.test(r.S.v.codec));
    if ((!r || r.S.kind === 'unknown' || browserPic) && (/^image\//.test(it.file.type) || IMG_FALLBACK.test(extOf(it.name)) || browserPic)) {
      const png = await browserDecode(it.file);
      if (png) { it.src = png; it.viaBrowser = true; r = await E.probe(png); }
    }
    if (!r || r.S.kind === 'unknown') throw it._probeErr || new Error('This file could not be read. It may be damaged, or not a media file.');
    it.info = r.info; it.S = r.S;
    const d = store.defaults[it.S.kind];
    if (!it.target) it.target = (d && d.target) || CV.defaultTarget(it.S, it.name);
    if (!CV.allowed(it.S, CV.fmt(it.target)).ok) it.target = CV.defaultTarget(it.S, it.name);
    it.o = { ...CV.DEFAULTS, ...(d && d.o || {}), ...it.o };
    it.status = 'ready';
    refresh(it);
    if (C.sel.has(it.id)) renderSide();
    renderTop();
    E.thumb(it.src, it.S).then(b => { if (b) { it.thumb = URL.createObjectURL(b); refresh(it); } });
  } catch (e) {
    it.status = 'unsupported'; it.error = friendly(e);
    refresh(it); renderTop();
    if (C.sel.has(it.id)) renderSide();
  }
  renderFoot();
}
const friendly = e => {
  const m = String((e && e.message) || e || '');
  if (/converter needs/i.test(m)) return m;
  if (/dynamically imported module|Failed to fetch|NetworkError|WebAssembly/i.test(m)) return 'The converter engine could not start (' + m + ').';
  if (/Invalid data found|could not find codec|moov atom not found|EBML header parsing failed|Invalid argument/i.test(m)) return 'This file could not be read. It may be damaged, incomplete, or not a media file.';
  if (/Unknown encoder|not supported/i.test(m)) return 'This combination isn’t supported by the converter: ' + m;
  return m || 'Something went wrong.';
};

/* ---------- conversion ---------- */
const outName = it => {
  const f = CV.fmt(it.target);
  if (it.customName) return it.customName;
  const ext = it.plan ? it.plan.ext : f.ext;
  let n = baseName(it.name) + '.' + ext;
  if (n.toLowerCase() === it.name.toLowerCase()) n = baseName(it.name) + ' (converted).' + ext;
  return n;
};
C.plan = it => {
  const extra = { ...it.extra };
  return CV.plan({ S: it.S, target: it.target, o: { ...it.o, accent: accent() }, extra, threads: CV.threads });
};
C.convert = (list = targets()) => {
  let n = 0;
  for (const it of list) if (it.status === 'ready' || it.status === 'done' || it.status === 'error') { it.status = 'queued'; it.error = null; it._retried = false; n++; refresh(it); }
  if (!n) return App.toast(C.items.some(i => i.status === 'probing') ? 'Still reading the files — one moment' : 'Nothing to convert yet. Add some files first.', 'warn');
  C.stopAll = false;
  pump();
  renderTop(); renderFoot();
};
C.stop = () => {
  C.stopAll = true;
  for (const it of C.items) if (it.status === 'queued') { it.status = 'ready'; refresh(it); }
  if (C.running && C.running.job) C.running.job.cancel();
  renderTop(); renderFoot();
};
const STALL_MS = 90000;
async function pump() {
  if (C.running) return;
  const it = C.items.find(i => i.status === 'queued');
  if (!it) { finishedAll(); return; }
  C.running = { it, t0: performance.now() };
  it.status = 'running'; it.progress = 0; it.speed = 0; it.eta = null; it.log = [];
  refresh(it); renderTop(); renderFoot();
  let plan;
  try {
    plan = it.plan = C.plan(it);
    const inputs = [it.src];
    if (plan.inputs.includes('picture')) inputs.push(it.extra.picture);
    let beat = performance.now();
    const job = E.run({ inputs, args: plan.args, out: plan.out, mime: plan.mime,
      onLog: line => { beat = performance.now(); it.log.push(line); if (it.log.length > 600) it.log.splice(0, 200); },
      onProgress: p => {
        beat = performance.now();
        if (plan.frames > 0 && !p.frame) return;   // time-only reports run ahead of the picture
        const el2 = (performance.now() - C.running.t0) / 1000;
        let t = p.time > 0 ? p.time : 0;
        let r = plan.frames > 0 && p.frame ? Math.min(0.999, p.frame / plan.frames)
          : plan.dur > 0 && t ? Math.min(0.999, t / plan.dur) : p.ratio > 0 && p.ratio <= 1 ? p.ratio : it.progress;
        if (plan.frames > 0 && p.frame) t = r * plan.dur;   // speed and time left follow the picture too
        it.progress = Math.max(it.progress, r || 0);
        it.speed = t && el2 > 0.5 ? t / el2 : 0;
        it.eta = it.progress > 0.02 ? el2 * (1 - it.progress) / it.progress : null;
        tick(it);
      } });
    C.running.job = job;
    // watchdog: ffmpeg reports progress twice a second while it works; total silence means a codec has hung
    let stalled = false;
    const dog = setInterval(() => { if (performance.now() - beat > STALL_MS) { stalled = true; clearInterval(dog); job.cancel(); } }, 2000);
    let blob;
    try { blob = await job.promise; }
    catch (e) { if (stalled) throw Object.assign(new Error(`The converter stopped responding (nothing happened for ${STALL_MS / 1000} seconds), twice. Try another format or quality for this file.`), { stalled: true }); throw e; }
    finally { clearInterval(dog); }
    if (!blob || !blob.size) throw new Error('The result came out empty.');
    if (it.result && it.result.url) URL.revokeObjectURL(it.result.url);
    const name = outName(it);
    it.result = { blob, name, url: URL.createObjectURL(blob), secs: (performance.now() - C.running.t0) / 1000, kind: CV.fmt(it.target).kind === 'video' && !CV.fmt(it.target).anim ? 'video' : CV.fmt(it.target).anim ? 'image' : CV.fmt(it.target).kind };
    it.status = 'done'; it.progress = 1;
    if (store.autoSave) App.download(blob, name);
    App.sound && App.sound('success', 0.4);
  } catch (e) {
    if (e && e.stalled && !it._retried) {
      // the engine was replaced by the watchdog: one more go on a fresh one usually just works
      it._retried = true; it.status = 'queued'; it.progress = 0;
      C.running = null; refresh(it);
      if (!C.stopAll) return pump();
    }
    if (e && e.cancelled) { it.status = 'ready'; it.progress = 0; }
    else { it.status = 'error'; it.error = friendly(e); console.warn('convert failed', it.name, e, it.log && it.log.slice(-20)); App.sound && App.sound('error'); }
  }
  C.running = null;
  refresh(it); renderTop(); renderFoot(); if (C.sel.has(it.id)) renderSide();
  if (!C.stopAll) pump(); else finishedAll(true);
}
let lastSummary = '';
function finishedAll(stopped) {
  renderTop(); renderFoot();
  const done = C.items.filter(i => i.status === 'done' && !i.announced), bad = C.items.filter(i => i.status === 'error' && !i.announced);
  [...done, ...bad].forEach(i => (i.announced = true));
  if (!done.length && !bad.length) return;
  const msg = stopped ? 'Stopped' : bad.length ? `${done.length} converted, ${bad.length} failed` : done.length === 1 ? `Converted “${done[0].result.name}”` : `All ${done.length} files converted`;
  if (msg === lastSummary && stopped) return;
  lastSummary = msg;
  App.toast(msg + (store.autoSave && done.length ? (window.__strataDesktop ? '' : ' · saved to your Downloads') : ''), bad.length ? 'warn' : 'ok', 4200,
    done.length && !store.autoSave ? { label: done.length > 1 ? 'Download all' : 'Download', fn: () => downloadAll() } : undefined);
}

/* ---------- results ---------- */
const resultFile = it => new File([it.result.blob], it.result.name, { type: it.result.blob.type });
C.download = it => { if (it.result) App.download(it.result.blob, it.result.name); };
async function downloadAll(zip = null) {
  const done = C.items.filter(i => i.status === 'done' && i.result);
  if (!done.length) return App.toast('Nothing has been converted yet', 'warn');
  const total = done.reduce((s, i) => s + i.result.blob.size, 0);
  if (zip === null) zip = done.length > 1 && total < 1.8e9;
  if (!zip || done.length === 1) { done.forEach((i, k) => setTimeout(() => C.download(i), k * 250)); return; }
  App.toast('Packing ' + done.length + ' files…', '', 1500);
  const blob = await makeZip(done.map(i => ({ name: i.result.name, blob: i.result.blob })));
  App.download(blob, 'Converted files.zip');
}
const sendTo = async (it, mode) => {
  if (!it.result) return;
  const file = resultFile(it);
  try {
    if (mode === 'video') App.emit('video:import', file, file.name);
    else if (mode === 'image') App.emit('image:open', file, file.name);
    else if (mode === 'audio') { const d = await X.decode(file); App.emit('audio:open', { ...d, name: file.name }); }
  } catch (e) { App.toast(`The ${mode} editor couldn’t open “${file.name}”: ${e.message || e}`, 'err', 4000); }
};
const openTargets = it => {
  const k = it.result && it.result.kind;
  if (!k || k === 'sub') return [];
  if (k === 'video') return ['video'];
  if (k === 'audio') return ['audio', 'video'];
  if (k === 'image') return ['image', 'video'];
  return [];
};
const payload = it => ({
  kind: it.result.kind === 'audio' ? 'audio' : it.result.kind === 'image' ? 'image' : 'video', from: 'convert', name: it.result.name,
  icon: KIND_ICON[it.result.kind],
  file: async () => resultFile(it),
  audio: it.result.kind === 'audio' || it.result.kind === 'video' ? async () => X.decode(resultFile(it)) : undefined,
  image: it.result.kind === 'image' ? async () => it.result.blob : undefined,
});

/* ---------- small ZIP writer (stored, no compression: media is already compressed) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
async function crc32(blob) {
  let c = 0xffffffff;
  for (let o = 0; o < blob.size; o += 8 << 20) {
    const b = new Uint8Array(await blob.slice(o, o + (8 << 20)).arrayBuffer());
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
    await new Promise(r => setTimeout(r, 0));
  }
  return (c ^ 0xffffffff) >>> 0;
}
async function makeZip(files) {
  const parts = [], central = [], enc = new TextEncoder(), seen = new Map();
  let off = 0;
  const d = new Date(), dt = ((d.getFullYear() - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) | (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const f of files) {
    let name = f.name; const k = (seen.get(name) || 0) + 1; seen.set(f.name, k);
    if (k > 1) name = baseName(f.name) + ` (${k})` + (extOf(f.name) ? '.' + extOf(f.name) : '');
    const nb = enc.encode(name), crc = await crc32(f.blob), size = f.blob.size;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(10, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nb.length, true);
    parts.push(lh.buffer, nb, f.blob);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(12, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(ch.buffer, nb);
    off += 30 + nb.length + size;
  }
  const cdSize = central.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
C.makeZip = makeZip;

/* ---------- queue list ---------- */
function render() { renderList(); renderSide(); renderTop(); renderFoot(); }
const rows = new Map();
function renderList() {
  const list = el.list;
  if (!list) return;
  el.empty.style.display = C.items.length ? 'none' : '';
  list.style.display = C.items.length ? '' : 'none';
  el.qcount.textContent = C.items.length ? `${C.items.length} file${C.items.length > 1 ? 's' : ''}` : '';
  for (const [id, r] of rows) if (!C.items.some(i => i.id === id)) { r.remove(); rows.delete(id); }
  C.items.forEach((it, k) => {
    let r = rows.get(it.id);
    if (!r) { r = row(it); rows.set(it.id, r); }
    if (list.children[k] !== r) list.insertBefore(r, list.children[k] || null);
    paint(it, r);
  });
}
function refresh(it) { const r = rows.get(it.id); if (r) paint(it, r); }
function tick(it) {
  const r = rows.get(it.id); if (!r) return;
  r._bar.style.setProperty('--p', (it.progress * 100).toFixed(1) + '%');
  r._stat.textContent = statusText(it);
  tabBadge();
  renderFootProgress();
}
const statusText = it => {
  if (it.status === 'running') {
    const pct = it.plan && it.plan.dur > 0 ? Math.round(it.progress * 100) + '%' : 'Working…';
    return [pct, it.speed > 0.05 ? (it.speed >= 10 ? Math.round(it.speed) : it.speed.toFixed(1)) + '× real time' : '', it.eta != null && isFinite(it.eta) && it.progress > 0.02 ? CV.time(it.eta) + ' left' : ''].filter(Boolean).join(' · ');
  }
  return { probing: 'Reading…', ready: 'Ready', queued: 'Waiting in line', done: 'Done', error: 'Failed', unsupported: 'Can’t read this file' }[it.status] || '';
};
function row(it) {
  const thumb = h('div', { class: 'cv-thumb' });
  const name = h('div', { class: 'cv-name' });
  const meta = h('div', { class: 'cv-meta' });
  const bar = h('div', { class: 'cv-bar' }, h('i'));
  const stat = h('div', { class: 'cv-stat' });
  const res = h('div', { class: 'cv-res' });
  const chip = h('button', { type: 'button', class: 'cv-chip', title: 'Convert to', tip: 'The format this file becomes. Click to pick another one — or use the panel on the right for all the details.' });
  chip.addEventListener('click', e => { e.stopPropagation(); quickPick(it, chip); });
  const acts = h('div', { class: 'cv-acts' });
  const r = h('div', { class: 'cv-item', dataset: { id: it.id }, tabindex: '-1' },
    thumb, h('div', { class: 'cv-main' }, h('div', { class: 'cv-line' }, name, h('span', { class: 'cv-arrow' }, icon('stepFwd', 14)), chip), meta, h('div', { class: 'cv-progrow' }, bar, stat), res), acts);
  Object.assign(r, { _thumb: thumb, _name: name, _meta: meta, _bar: bar, _stat: stat, _res: res, _chip: chip, _acts: acts });
  r.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, a, input')) return;
    if (e.shiftKey && C.anchor) {
      const ids = C.items.map(i => i.id), a = ids.indexOf(C.anchor), b = ids.indexOf(it.id);
      C.sel = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else if (e.ctrlKey || e.metaKey) { C.sel.has(it.id) ? C.sel.delete(it.id) : C.sel.add(it.id); C.anchor = it.id; }
    else { C.sel = new Set([it.id]); C.anchor = it.id; }
    renderList(); renderSide();
  });
  r.addEventListener('dblclick', e => { if (!e.target.closest('button') && (it.status === 'ready' || it.status === 'error' || it.status === 'done')) C.convert([it]); });
  r.addEventListener('contextmenu', e => {
    if (!C.sel.has(it.id)) { C.sel = new Set([it.id]); renderList(); renderSide(); }
    App.contextMenu(e, itemMenu(it));
  });
  r.addEventListener('dragstart', e => { if (!it.result) return e.preventDefault(); X.start(e, payload(it)); });
  return r;
}
function paint(it, r) {
  r.classList.toggle('sel', C.sel.has(it.id));
  r.dataset.status = it.status;
  r.draggable = !!it.result;
  const k = it.S ? it.S.kind : 'unknown';
  r._thumb.innerHTML = '';
  if (it.thumb) r._thumb.append(h('img', { src: it.thumb, alt: '' }));
  else r._thumb.append(icon(KIND_ICON[it.status === 'probing' ? 'unknown' : k] || 'fileAny', 22));
  r._thumb.append(h('span', { class: 'cv-kind' }, it.status === 'probing' ? '…' : { video: it.S && it.S.animated ? 'Animation' : 'Video', audio: 'Audio', image: 'Image', sub: 'Subtitles', unknown: '?' }[k]));
  r._name.textContent = it.name;
  r._name.title = it.name;
  r._name.dataset.tip = `${it.name} · ${fmtB(it.size)}${it.viaBrowser ? ' · decoded by the browser first' : ''}`;
  r._meta.textContent = it.status === 'unsupported' ? it.error : it.S ? CV.describe(it.S) + ' · ' + fmtB(it.size) : 'Reading the file…';
  const f = it.target && CV.fmt(it.target);
  r._chip.innerHTML = '';
  r._chip.append(h('b', null, f ? f.label : '—'), icon('chevDown', 12));
  r._chip.disabled = !it.S || busyItem(it);
  r._chip.style.visibility = it.status === 'unsupported' ? 'hidden' : '';
  r._bar.style.setProperty('--p', (it.progress * 100).toFixed(1) + '%');
  r._bar.parentNode.style.display = it.status === 'running' || it.status === 'queued' ? '' : 'none';
  r._stat.textContent = statusText(it);
  r._res.innerHTML = '';
  if (it.status === 'done' && it.result) {
    const p = it.plan || {};
    r._res.append(icon('check', 14), h('span', null, `${it.result.name} · ${fmtB(it.result.blob.size)} · ${it.result.secs < 10 ? it.result.secs.toFixed(1) : Math.round(it.result.secs)} s`),
      ...[p.lossless === 'full' ? h('em', { class: 'cv-badge ok', tip: 'Nothing was re-encoded: the result has exactly the original quality.' }, 'No quality loss') : p.lossless === 'partial' ? h('em', { class: 'cv-badge', tip: 'Part of the file (e.g. the picture) was copied untouched; the rest was re-encoded at high quality.' }, 'Partly copied') : null].filter(Boolean));
  } else if (it.status === 'error') r._res.append(icon('x', 14), h('span', { class: 'cv-err' }, it.error));
  r._acts.innerHTML = '';
  if (it.status === 'done') {
    r._acts.append(btn({ icon: 'download', cls: 'sm solid', title: 'Download', tip: `Save “${it.result.name}”${window.__strataDesktop ? ' to your Downloads folder' : ''}.`, onClick: () => C.download(it) }));
    const ot = openTargets(it);
    if (ot.length) r._acts.append(btn({ icon: 'send', cls: 'sm', title: 'Open in an editor', tip: 'Open the result in the ' + ot.map(m => m[0].toUpperCase() + m.slice(1)).join(' or ') + ' editor. You can also drag this row onto an editor’s tab.', onClick: (e, b) => { const rr = b.getBoundingClientRect(); App.openMenu(rr.left, rr.bottom + 4, ot.map(m => ({ label: `Open in ${m[0].toUpperCase() + m.slice(1)} editor`, icon: KIND_ICON[m], tip: { video: 'Adds it to the Video editor’s media bin.', audio: 'Opens it as a new track in the Audio editor.', image: 'Opens it in its own tab in the Image editor.' }[m], action: () => sendTo(it, m) }))); } }));
  } else if (it.status === 'ready' || it.status === 'error') r._acts.append(btn({ icon: 'convert', cls: 'sm', title: 'Convert this file', tip: 'Converts just this file now.', onClick: () => C.convert([it]) }));
  else if (it.status === 'running' || it.status === 'queued') r._acts.append(btn({ icon: 'x', cls: 'sm', title: it.status === 'running' ? 'Stop' : 'Take out of the line', tip: it.status === 'running' ? 'Stops this conversion.' : 'Keeps the file but doesn’t convert it now.', onClick: () => cancelOne(it) }));
  r._acts.append(btn({ icon: 'trash', cls: 'sm', title: 'Remove', tip: 'Takes the file off the list (your original file is not touched).', disabled: it.status === 'running', onClick: () => remove([it]) }));
}
const busyItem = it => it.status === 'running' || it.status === 'queued';
function cancelOne(it) {
  if (it.status === 'queued') { it.status = 'ready'; refresh(it); renderTop(); renderFoot(); return; }
  if (it.status === 'running' && C.running && C.running.job) C.running.job.cancel();
}
function remove(list) {
  list = list.filter(i => i.status !== 'running');
  if (!list.length) return;
  for (const it of list) {
    if (it.thumb) URL.revokeObjectURL(it.thumb);
    if (it.result && it.result.url) URL.revokeObjectURL(it.result.url);
    C.sel.delete(it.id);
  }
  C.items = C.items.filter(i => !list.includes(i));
  render();
}
function itemMenu(it) {
  const sel = selected().length ? selected() : [it];
  return [
    { label: sel.length > 1 ? `Convert these ${sel.length}` : 'Convert', icon: 'convert', disabled: !sel.some(i => ['ready', 'done', 'error'].includes(i.status)), tip: 'Starts converting now.', action: () => C.convert(sel) },
    it.result ? { label: 'Download', icon: 'download', tip: 'Saves the converted file.', action: () => C.download(it) } : null,
    ...openTargets(it).map(m => ({ label: `Open in ${m[0].toUpperCase() + m.slice(1)} editor`, icon: KIND_ICON[m], tip: 'Sends the converted file to that editor.', action: () => sendTo(it, m) })),
    { label: 'Also convert to another format', icon: 'copy', disabled: !it.S, tip: 'Adds a copy of this file to the list so you can make a second format from it (e.g. both MP4 and MP3).', action: () => duplicate(sel) },
    it.log && it.log.length ? { label: 'Show the engine log', icon: 'info', tip: 'The technical details of the last conversion, for troubleshooting.', action: () => showLog(it) } : null,
    { sep: true },
    { label: sel.length > 1 ? `Remove ${sel.length} files` : 'Remove', icon: 'trash', tip: 'Takes them off the list. Your original files are not touched.', action: () => remove(sel) },
  ].filter(Boolean);
}
function duplicate(list) {
  const copies = list.filter(i => i.S).map(i => ({ ...i, id: 'c' + (++uid), status: 'ready', result: null, error: null, progress: 0, log: [], announced: false, customName: null, o: { ...i.o }, extra: { ...i.extra }, thumb: i.thumb }));
  if (!copies.length) return;
  for (const c of copies) { const k = C.items.findIndex(i => i.id === list[copies.indexOf(c)].id); C.items.splice(k + 1, 0, c); }
  C.sel = new Set(copies.map(c => c.id));
  render();
  App.toast('Added a copy — pick the second format on the right', 'ok');
}
function showLog(it) {
  const pre = h('pre', { class: 'cv-log' }, (it.log || []).join('\n') || '(empty)');
  const md = App.modal({ title: 'Engine log — ' + it.name, icon: 'info', width: 760, body: h('div', { style: { padding: '0 18px' } }, h('p', { class: 'cv-hint' }, 'ffmpeg’s own report of the last conversion of this file. Useful if something went wrong.'), pre),
    buttons: [{ label: 'Copy', action: () => { navigator.clipboard && navigator.clipboard.writeText(pre.textContent); App.toast('Copied', 'ok'); return false; } }, { label: 'Close', primary: true }] });
  return md;
}

/* quick format picker on a row */
function quickPick(it, anchor) {
  if (!it.S) return;
  const sel = C.sel.has(it.id) ? selected() : [it];
  const grid = formatGrid(sel, id => { setTarget(sel, id); App.closePopover(); });
  App.popover(anchor, h('div', { class: 'cv-pop' }, grid), { cls: 'cv-popover' });
}
function setTarget(list, id) {
  const f = CV.fmt(id);
  for (const it of list) if (it.S && !busyItem(it) && CV.allowed(it.S, f).ok) { it.target = id; it.customName = null; if (it.status === 'done') it.status = 'ready'; }
  renderList(); renderSide();
}

/* ---------- format grid ---------- */
function formatGrid(list, onPick) {
  const wrap = h('div', { class: 'cv-fmts' });
  const cur = new Set(list.map(i => i.target));
  for (const [kind, label, ic] of CV.GROUPS) {
    const fs = CV.formats.filter(f => f.kind === kind);
    const st = fs.map(f => { const res = list.map(i => i.S ? CV.allowed(i.S, f) : { ok: false, why: 'Still reading the file.' }); return { f, ok: res.every(r => r.ok), why: (res.find(r => !r.ok) || {}).why }; });
    if (!st.some(x => x.ok) && kind === 'sub') continue;
    const g = h('div', { class: 'cv-fgroup' }, h('div', { class: 'cv-fhead' }, icon(ic, 14), label));
    const tiles = h('div', { class: 'cv-ftiles' });
    for (const { f, ok, why } of st) {
      const t = h('button', { type: 'button', class: 'cv-ftile' + (cur.has(f.id) ? ' on' : '') + (ok ? '' : ' off'), dataset: { id: f.id }, title: f.label + (f.ext && f.label.toLowerCase() !== f.ext ? ` (.${f.ext})` : ''), tip: ok ? f.desc : (why || 'Not possible for this file.') },
        h('b', null, f.label), h('small', null, f.orig ? 'no re-encode' : '.' + f.ext));
      if (ok) t.addEventListener('click', () => onPick(f.id));
      else t.setAttribute('aria-disabled', 'true');
      tiles.append(t);
    }
    g.append(tiles);
    wrap.append(g);
  }
  return wrap;
}

/* ---------- side panel: settings for the selection ---------- */
function renderSide() {
  const body = el.sideBody;
  if (!body) return;
  const list = selected().filter(i => i.S);
  const scroll = body.scrollTop;
  body.innerHTML = '';
  el.sideTitle.textContent = list.length > 1 ? `Convert ${list.length} files to` : 'Convert to';
  if (!list.length) {
    const pending = selected().find(i => i.status === 'probing'), bad = selected().find(i => i.status === 'unsupported');
    body.append(h('div', { class: 'cv-side-empty' }, icon(pending ? 'cpu' : bad ? 'x' : 'convert', 34),
      h('b', null, pending ? 'Reading the file…' : bad ? 'This file can’t be read' : C.items.length ? 'Pick a file on the left' : 'Add files to get started'),
      h('span', null, pending ? 'Looking at what is inside: streams, codecs, sizes.' : bad ? bad.error : C.items.length ? 'Its settings appear here. Ctrl-click or Shift-click to change several at once.' : 'Drop files anywhere on this page, or use Add files. Any video, sound, picture or subtitle file works.')));
    return;
  }
  const it = list[0], f = CV.fmt(it.target);
  const same = key => list.every(i => JSON.stringify(i.o[key]) === JSON.stringify(it.o[key]));
  const sameTarget = list.every(i => i.target === it.target);
  const kinds = new Set(list.map(i => i.S.kind));
  const set = (key, v, rerender = true) => { for (const i of list) if (!busyItem(i)) { i.o[key] = v; if (i.status === 'done') i.status = 'ready'; } renderList(); if (rerender) renderSide(); else updateOut(); };
  const locked = list.some(busyItem);

  body.append(formatGrid(list, id => setTarget(list, id)));
  if (!sameTarget) body.append(h('p', { class: 'cv-hint' }, 'The selected files have different targets. Picking a format sets it for all of them.'));

  // quality
  const fk = f.kind;
  const lossless = f.lossless && fk !== 'image';
  if (!f.orig && fk !== 'sub' && !lossless) {
    const qs = App.seg({ value: same('quality') ? it.o.quality : null, options: CV.QUALITY.map(q => ({ value: q.id, label: q.label, tip: q.tip })), onChange: v => set('quality', v) });
    const qtip = CV.QUALITY.find(q => q.id === it.o.quality);
    body.append(h('div', { class: 'cv-sec' }, h('div', { class: 'cv-sech' }, 'Quality'), qs, h('p', { class: 'cv-hint' }, same('quality') && qtip ? qtip.tip : 'Mixed settings.')));
  } else if (lossless) body.append(h('div', { class: 'cv-sec' }, h('div', { class: 'cv-sech' }, 'Quality'), h('p', { class: 'cv-hint' }, icon('check', 13), ` ${f.label} is lossless: every sample is kept exactly.`)));

  // options per target / source
  const opts = h('div', { class: 'cv-ctls' });
  const sel = (label, key, options, tip, rer = true) => opts.append(App.select({ label, value: same(key) ? String(it.o[key]) : '', options: same(key) ? options : [['', '(mixed)'], ...options], tip, onChange: v => { if (v !== '') set(key, /^-?\d+(\.\d+)?$/.test(v) ? +v : v, rer); } }));
  const tog = (label, key, tip) => opts.append(App.toggle({ label, value: !!it.o[key], tip, onChange: v => set(key, v) }));
  const S = it.S;
  const timeBased = kinds.has('video') || kinds.has('audio');

  if (fk === 'video' && !f.anim) {
    if (f.vcodecs) sel('Video codec', 'vcodec', [['auto', 'Automatic (' + CV.vcodecName(f.vc) + ')'], ...f.vcodecs.map(c => [c, CV.vcodecName(c) + ({ h264: ' — plays everywhere', h265: ' — half the size, newer devices', prores: ' — for editing, very large' }[c] || '')])], 'Which video format goes inside the file. Automatic copies the original video when it can.');
    if (!kinds.has('audio')) {
      sel('Resolution', 'res', [['orig', 'Original' + (list.length === 1 && S.v ? ` (${S.v.w}×${S.v.h})` : '')], ['2160', '4K (2160p)'], ['1440', '1440p'], ['1080', '1080p (Full HD)'], ['720', '720p (HD)'], ['480', '480p'], ['360', '360p']], 'Makes the picture smaller (never bigger). Keeps the shape.');
      sel('Frame rate', 'fps', [['orig', 'Original' + (list.length === 1 && S.v && S.v.fps && kinds.has('video') ? ` (${+S.v.fps.toFixed(2)} fps)` : '')], ['60', '60 fps'], ['50', '50 fps'], ['30', '30 fps'], ['25', '25 fps'], ['24', '24 fps']], 'Frames per second. Lower is smaller; changing it means re-encoding.');
    }
    if (kinds.has('video')) {
      const hasA = list.some(i => i.S.as.length);
      if (hasA) tog('Keep the sound', 'keepAudio', 'Turn off to make a silent video.');
      if (list.length === 1 && S.as.length > 1 && it.o.keepAudio) sel('Sound tracks', 'aTrack', [['all', f.multiAudio ? `All ${S.as.length} tracks` : 'The main track'], ...S.as.map(a => [String(a.i), trackName(a)])], f.multiAudio ? 'Keep every language / commentary track, or just one.' : f.label + ' holds one sound track; pick which.');
      if (list.some(i => i.S.ss.length) && f.subs) tog('Keep subtitles', 'keepSubs', f.subs === 'copy' ? 'MKV keeps every subtitle track as it is.' : `Text subtitles go into the ${f.label} too (picture-based ones can only go into MKV).`);
    }
    if (kinds.has('image')) opts.append(App.slider({ label: 'Duration', min: 1, max: 60, step: 0.5, value: it.o.stillDur, unit: 's', tip: 'How long the picture is shown.', onChange: v => set('stillDur', v, false) }));
    if (kinds.has('audio')) {
      sel('Picture', 'picture', [['waves', 'Animated waveform'], ['spectrum', 'Scrolling spectrum'], ['black', 'Black screen'], ['image', 'A picture of my choice…']], 'A video needs something to look at: draw the sound, or show a picture of your choice (cover art, a logo…).');
      if (list.some(i => i.o.picture === 'image')) {
        const has = list.every(i => i.extra.picture);
        opts.append(h('div', { class: 'ctl', title: 'Picture file', tip: 'The picture shown for the whole length of the sound.' }, h('label', null, 'Picture file'),
          h('div', { class: 'ctl-main' }, btn({ icon: 'image', cls: 'sm solid', label: has ? it.extra.picture.name : 'Choose a picture…', onClick: async () => { const [p] = await App.pickFiles('image/*', false); if (p) { list.forEach(i => (i.extra.picture = p)); renderSide(); } } }))));
      }
    }
  }
  if (f.anim) {
    sel('Frames per second', 'gifFps', [['10', '10 fps'], ['15', '15 fps'], ['20', '20 fps'], ['25', '25 fps'], ['30', '30 fps']], 'Smoother motion makes a bigger file.');
    sel('Width', 'gifW', [['320', '320 px'], ['480', '480 px'], ['640', '640 px'], ['800', '800 px'], ['orig', 'Original']], 'GIFs get big fast: 480 px is a good size for chats.');
  }
  if (fk === 'audio' && !f.orig) {
    if (list.length === 1 && S.as.length > 1) sel('Sound track', 'aTrack', [['all', 'The main track'], ...S.as.map(a => [String(a.i), trackName(a)])], 'This file has several sound tracks (languages, commentary…). Pick the one to keep.');
    if (!f.lossless) sel('Bitrate', 'abr', [['auto', 'Automatic (by quality)'], ...[320, 256, 192, 160, 128, 96].filter(k => !(f.ac === 'wmav2' && k > 256)).map(k => [String(k), k + ' kbps']).concat(f.ac === 'ac3' ? [['640', '640 kbps'], ['448', '448 kbps']] : [])], 'Higher is better sound and a bigger file. 320 kbps is the most MP3 can do.');
    if (!f.fixedSr) sel('Sample rate', 'sr', [['orig', 'Original' + (list.length === 1 && S.as[0] ? ` (${S.as[0].sr / 1000} kHz)` : '')], ['48000', '48 kHz (video)'], ['44100', '44.1 kHz (CD)'], ...(f.maxSr && f.maxSr < 96000 ? [] : [['96000', '96 kHz']])], 'Keep the original unless a device asks for something specific.');
    sel('Channels', 'ch', [['orig', 'Original' + (list.length === 1 && S.as[0] ? ` (${S.as[0].ch === 1 ? 'mono' : S.as[0].ch === 2 ? 'stereo' : S.as[0].ch + ' ch'})` : '')], ['2', 'Stereo'], ['1', 'Mono'], ...(f.maxCh === 2 ? [] : [['6', '5.1 surround']])], 'Mixes surround down to stereo, or stereo to mono.');
    if (f.lossless) sel('Bit depth', 'depth', [['auto', 'Automatic (like the source)'], ['16', '16-bit (CD)'], ['24', '24-bit (studio)'], ...(f.id === 'wav' || f.id === 'aiff' ? [['32', '32-bit float']] : [])], 'Automatic keeps the original resolution of lossless sources and uses 16-bit for compressed ones.');
    tog('Even out loudness', 'normalize', 'Brings the overall volume to −14 LUFS, the level Spotify and YouTube use, without clipping.');
  }
  if (fk === 'video' && !f.anim && (kinds.has('video') || kinds.has('audio')) && !f.orig) tog('Even out loudness', 'normalize', 'Brings the sound to −14 LUFS, the level YouTube and streaming use.');
  if (fk === 'image') {
    if (kinds.has('video')) {
      const fa = h('input', { class: 'num', type: 'text', value: it.o.frameAt == null ? '' : String(it.o.frameAt), placeholder: CV.time(Math.min(S.duration * 0.1, 10)), 'aria-label': 'Frame at' });
      fa.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') fa.blur(); });
      fa.addEventListener('change', () => { const v = parseTime(fa.value); set('frameAt', v == null ? null : Math.max(0, v), false); });
      opts.append(h('div', { class: 'ctl', title: 'Frame at', tip: 'Which moment of the video becomes the picture: seconds (e.g. 12.5) or minutes:seconds (1:05). Leave empty for a frame near the start.' }, h('label', null, 'Frame at'), h('div', { class: 'ctl-main' }, fa)));
    }
    if (kinds.has('audio')) opts.append(h('p', { class: 'cv-hint', style: { padding: '0 12px' } }, 'The picture shows the waveform of the whole sound.'));
    if (!kinds.has('audio')) sel('Size', 'imgSize', [['orig', 'Original' + (list.length === 1 && S.v ? ` (${S.v.w}×${S.v.h})` : '')], ['3840', 'Fit in 3840 px'], ['1920', 'Fit in 1920 px'], ['1280', 'Fit in 1280 px'], ['640', 'Fit in 640 px'], ['half', 'Half size'], ['quarter', 'Quarter size']], 'Makes the picture smaller (never bigger). The longest side fits the size you pick.');
    if (f.id === 'jpg' && list.some(i => i.S.v && i.S.v.alpha)) sel('Transparent areas', 'bg', [['#ffffff', 'White'], ['#000000', 'Black']], 'JPEG can’t be see-through, so transparent parts get a background colour.');
  }
  if (fk !== 'sub' && timeBased && !kinds.has('image') && !(fk === 'image' && kinds.has('video'))) {
    const tr = h('div', { class: 'cv-trim' });
    const mk = (key, label, ph) => { const i = h('input', { class: 'num', type: 'text', value: it.o[key] ? fmtT(it.o[key]) : '', placeholder: ph, 'aria-label': label }); i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); }); i.addEventListener('change', () => { const v = parseTime(i.value); set(key, v == null ? 0 : Math.max(0, v), false); i.value = v ? fmtT(v) : ''; }); return h('label', null, h('span', null, label), i); };
    tr.append(mk('trimStart', 'From', '0:00'), mk('trimEnd', 'To', list.length === 1 ? CV.time(S.duration) : 'end'));
    opts.append(h('div', { class: 'ctl', title: 'Trim', tip: 'Convert only part of the file: type a start and/or end time (seconds, or minutes:seconds). Leave empty for the whole file.' }, h('label', null, 'Trim'), h('div', { class: 'ctl-main' }, tr)));
  }
  if (fk !== 'sub' && !f.orig && (fk !== 'image' || kinds.has('image'))) tog('Keep tags & chapters', 'meta', 'Keeps titles, artist, album, dates, chapters and cover art. Turn off to strip them (e.g. for privacy).');
  if (!f.orig && fk !== 'sub' && fk !== 'image' && !f.lossless && !f.anim) tog('Always re-encode', 'force', 'Normally streams the new format can hold are copied untouched (no loss, much faster). Turn this on for files that must be re-encoded, e.g. for an old device that only plays certain settings.');
  if (opts.children.length) body.append(h('div', { class: 'cv-sec' }, h('div', { class: 'cv-sech' }, 'Settings'), opts));

  // output card
  el.outCard = h('div', { class: 'cv-out' });
  body.append(el.outCard);
  updateOut();

  body.append(h('div', { class: 'cv-sidebtns' },
    btn({ icon: 'check', cls: 'sm solid', label: 'Use for all files', tip: 'Gives every file on the list (that can take it) this format and these settings.', onClick: () => { const all = C.items.filter(i => i.S && !busyItem(i) && CV.allowed(i.S, f).ok); for (const i of all) { i.target = it.target; i.o = { ...it.o }; i.customName = null; if (i.status === 'done') i.status = 'ready'; } renderList(); renderSide(); App.toast(`${all.length} file${all.length > 1 ? 's' : ''} set to ${f.label}`, 'ok'); } }),
    btn({ icon: 'save', cls: 'sm', label: 'Make default', tip: `New ${it.S.kind === 'sub' ? 'subtitle' : it.S.kind} files will start with ${f.label} and these settings.`, onClick: () => { store.defaults[it.S.kind] = { target: it.target, o: { ...it.o, frameAt: null, trimStart: 0, trimEnd: 0 } }; saveStore(); App.toast(`New ${it.S.kind} files will become ${f.label}`, 'ok'); } }),
    btn({ icon: 'convert', cls: 'sm primary', label: list.length > 1 ? `Convert ${list.length}` : 'Convert', disabled: locked, tip: 'Start converting the selected file(s) now.', onClick: () => C.convert(list) })));
  body.scrollTop = scroll;
}
const fmtT = s => { const m = Math.floor(s / 60), r = s - m * 60; return m ? m + ':' + (r < 10 ? '0' : '') + (+r.toFixed(2)) : String(+s.toFixed(2)); };
const parseTime = v => {
  v = String(v || '').trim(); if (!v) return null;
  const p = v.split(':').map(Number);
  if (p.some(x => !isFinite(x))) return null;
  return p.reduce((a, b) => a * 60 + b, 0);
};
const trackName = a => [`Track ${a.i + 1}`, a.lang && a.lang !== 'und' ? a.lang.toUpperCase() : '', a.title, `${(a.codec || '').toUpperCase()} ${a.ch === 6 ? '5.1' : a.ch === 2 ? 'stereo' : a.ch === 1 ? 'mono' : a.ch + ' ch'}`].filter(Boolean).join(' · ');
function updateOut() {
  const card = el.outCard;
  if (!card) return;
  const list = selected().filter(i => i.S);
  card.innerHTML = '';
  if (!list.length) return;
  const it = list[0];
  let plan;
  try { plan = C.plan(it); } catch (e) { card.append(h('div', { class: 'cv-out-h err' }, icon('x', 14), e.message)); return; }
  it.plan = plan;
  const badge = plan.lossless === 'full' ? h('em', { class: 'cv-badge ok' }, 'No quality loss') : plan.lossless === 'partial' ? h('em', { class: 'cv-badge' }, 'Partly copied') : h('em', { class: 'cv-badge enc' }, 'Re-encoded');
  const est = CV.estimate(it, plan);
  card.append(h('div', { class: 'cv-out-h' }, icon('fileAny', 15), h('span', null, list.length > 1 ? 'What happens (first file)' : 'What happens'), badge));
  card.append(h('ol', null, plan.steps.map(s => h('li', null, s))));
  for (const w of plan.warn) card.append(h('p', { class: 'cv-warn' }, icon('info', 13), ' ', w));
  if (list.length === 1) {
    const nameIn = h('input', { class: 'field cv-outname', value: outName(it), 'aria-label': 'File name', spellcheck: 'false' });
    nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') nameIn.blur(); });
    nameIn.addEventListener('change', () => { let v = nameIn.value.trim().replace(/[\\/:*?"<>|]/g, '_'); if (!v) { it.customName = null; nameIn.value = outName(it); return; } if (!new RegExp('\\.' + plan.ext + '$', 'i').test(v)) v += '.' + plan.ext; it.customName = v; nameIn.value = v; refresh(it); });
    card.append(h('div', { class: 'ctl', title: 'File name', tip: 'The name of the converted file. The extension is added for you.' }, h('label', null, 'Save as'), h('div', { class: 'ctl-main' }, nameIn)));
  }
  if (est > 0) card.append(h('p', { class: 'cv-hint' }, `About ${fmtB(est)}${list.length > 1 ? ' for this file' : ''}${plan.lossless === 'none' && CV.fmt(it.target).kind === 'video' && !CV.fmt(it.target).anim ? ' (a rough guess: it depends on the picture)' : ''}.`));
}

/* ---------- top bar and footer ---------- */
function renderTop() {
  if (!el.goBtn) return;
  const any = pending().length > 0;
  el.goBtn.disabled = !any && !busy();
  el.goBtn.style.display = busy() ? 'none' : '';
  el.stopBtn.style.display = busy() ? '' : 'none';
  el.dlBtn.disabled = !C.items.some(i => i.status === 'done');
  el.clrBtn.disabled = !C.items.length;
  const lab = el.goBtn.querySelector('span');
  const todo = pending().length;
  if (lab) lab.textContent = todo > 1 ? `Convert all (${todo})` : 'Convert';
  tabBadge();
}
function renderFoot() {
  if (!el.foot) return;
  const n = C.items.length, done = C.items.filter(i => i.status === 'done'), bad = C.items.filter(i => i.status === 'error').length, q = C.items.filter(i => busyItem(i)).length;
  const inSize = C.items.reduce((s, i) => s + (i.size || 0), 0), outSize = done.reduce((s, i) => s + i.result.blob.size, 0);
  el.totals.textContent = !n ? '' : [`${n} file${n > 1 ? 's' : ''} · ${fmtB(inSize)}`, done.length ? `${done.length} done · ${fmtB(outSize)}` : '', q ? `${q} to go` : '', bad ? `${bad} failed` : ''].filter(Boolean).join('  ·  ');
  renderFootProgress();
}
function renderFootProgress() {
  if (!el.fbar) return;
  const r = C.running ? C.running.it.progress : 0;
  el.fbar.style.display = C.running ? '' : 'none';
  el.fbar.style.setProperty('--p', (r * 100).toFixed(1) + '%');
}
function engineState() {
  if (!el.eng) return;
  const st = !CV.supported() ? 'off' : (E.conv.state.status === 'busy' ? 'busy' : E.conv.state.status === 'loading' || E.info.state.status === 'loading' ? 'loading' : E.conv.state.status === 'ready' || E.info.state.status === 'ready' || E.info.state.status === 'busy' ? 'ready' : 'idle');
  el.eng.dataset.st = st;
  el.engTxt.textContent = { off: 'Engine unavailable here — start Strata from start.bat or the desktop app', idle: 'Engine asleep (wakes up when needed)', loading: 'Starting the engine…', ready: `Engine ready · ${CV.threads} CPU threads`, busy: `Converting · ${CV.threads} CPU threads` }[st];
}
App.on('convert:engine', engineState);
function tabBadge() {
  const tab = document.querySelector('.tab[data-mode="convert"]');
  if (!tab) return;
  let b = tab.querySelector('.cv-tabbadge');
  const run = C.running, waiting = C.items.filter(i => i.status === 'queued').length;
  const txt = run ? Math.round(run.it.progress * 100) + '%' + (waiting ? ' +' + waiting : '') : '';
  if (!txt) { b && b.remove(); return; }
  if (!b) { b = h('span', { class: 'cv-tabbadge' }); tab.append(b); }
  b.textContent = txt;
}

/* ---------- presets / menus ---------- */
const PRESETS = [
  ['mp4', 'Everything to MP4', 'Video that plays everywhere. Sound files get an animated waveform picture.'],
  ['mp3', 'Sound to MP3', 'Takes the sound out of every file as an MP3 (320 kbps at Best).'],
  ['aorig', 'Sound out, untouched', 'Pulls the original sound out of every video with no re-encoding at all.'],
  ['wav', 'Sound to WAV', 'Uncompressed sound for any editor.'],
  ['flac', 'Sound to FLAC', 'Lossless and compressed sound.'],
  ['png', 'Pictures to PNG', 'Lossless pictures (videos give one frame).'],
  ['jpg', 'Pictures to JPEG', 'Small photos for sharing.'],
  ['gifanim', 'Videos to GIF', 'Animated GIFs from videos.'],
];
function applyPreset(id) {
  const f = CV.fmt(id), list = targets().filter(i => i.S && !busyItem(i));
  let n = 0;
  for (const i of list) if (CV.allowed(i.S, f).ok) { i.target = id; i.customName = null; if (i.status === 'done') i.status = 'ready'; n++; }
  renderList(); renderSide();
  App.toast(n ? `${n} file${n > 1 ? 's' : ''} → ${f.label}${list.length > n ? ` (${list.length - n} can’t become ${f.label})` : ''}` : `None of these files can become ${f.label}`, n ? 'ok' : 'warn');
}
async function fromVideo() {
  const ms = (App.V && App.V.media || []).filter(m => m.file && !m.loading);
  if (!ms.length) return App.toast('The Video editor’s media bin is empty', 'warn');
  C.add(ms.map(m => m.file instanceof File ? m.file : new File([m.file], m.name, { type: m.file.type })));
}
async function fromAudio() {
  const A = App.A;
  if (!A || !A.tracks || !A.tracks.length) return App.toast('The Audio editor has no sound yet', 'warn');
  const ab = await A.mixdown(0, A.duration(), 2);
  const chs = Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i));
  C.add([new File([App.dsp.encodeWAV(chs, ab.sampleRate, 24)], (A.name || 'Audio mix') + '.wav', { type: 'audio/wav' })]);
}
async function fromImage() {
  const I = App.I;
  if (!I || !I.doc) return App.toast('The Image editor has no picture open', 'warn');
  const blob = await new Promise(r => I.flatten().toBlob(r, 'image/png'));
  C.add([new File([blob], (I.doc.name || 'Image') + '.png', { type: 'image/png' })]);
}
C.addFiles = async () => { const fs = await App.pickFiles('', true); if (fs.length) C.add(fs); };
function menus() {
  const done = () => C.items.some(i => i.status === 'done');
  return [
    { label: 'File', tip: 'Add files, bring work over from the editors, and save results.', items: () => [
      { label: 'Add files…', icon: 'upload', key: 'Ctrl+O', tip: 'Pick video, audio, picture or subtitle files to convert. You can also drop files anywhere here.', action: C.addFiles },
      { sep: true },
      { label: 'Add the Video editor’s media', icon: 'film', disabled: !(App.V && App.V.media && App.V.media.length), tip: 'Every file in the Video editor’s media bin.', action: fromVideo },
      { label: 'Add the Audio editor’s mix', icon: 'wave', disabled: !(App.A && App.A.tracks && App.A.tracks.length), tip: 'The Audio editor’s whole mix, rendered as a 24-bit WAV.', action: fromAudio },
      { label: 'Add the Image editor’s picture', icon: 'image', disabled: !(App.I && App.I.doc), tip: 'The current Image editor document, flattened to a PNG.', action: fromImage },
      { sep: true },
      { label: 'Download all results (ZIP)', icon: 'download', key: 'Ctrl+Shift+S', disabled: !done(), tip: 'All converted files in one .zip.', action: () => downloadAll(true) },
      { label: 'Download all results (separate files)', icon: 'download', disabled: !done(), tip: 'Saves every converted file on its own.', action: () => downloadAll(false) },
      { label: 'Save each result automatically', checked: store.autoSave, tip: 'Saves every converted file to your Downloads folder the moment it is ready.', action: () => { store.autoSave = !store.autoSave; saveStore(); App.toast('Automatic saving ' + (store.autoSave ? 'on' : 'off'), 'ok'); } },
    ] },
    { label: 'Edit', tip: 'Select and remove files.', items: () => [
      { label: 'Select all', icon: 'select', key: 'Ctrl+A', disabled: !C.items.length, tip: 'Selects every file so the panel on the right changes them all.', action: () => { C.sel = new Set(C.items.map(i => i.id)); renderList(); renderSide(); renderTop(); } },
      { label: 'Also convert to another format', icon: 'copy', key: 'Ctrl+D', disabled: !selected().some(i => i.S), tip: 'Adds a copy of the selected files, to make a second format from them.', action: () => duplicate(selected()) },
      { sep: true },
      { label: 'Remove selected', icon: 'trash', key: 'Del', disabled: !C.sel.size, tip: 'Takes them off the list. Your original files are not touched.', action: () => remove(selected()) },
      { label: 'Remove finished', icon: 'check', disabled: !done(), tip: 'Clears the files that are done.', action: () => remove(C.items.filter(i => i.status === 'done')) },
      { label: 'Remove all', icon: 'x', disabled: !C.items.length, tip: 'Empties the list (a running conversion keeps going).', action: () => remove(C.items) },
    ] },
    { label: 'Convert', tip: 'Start and stop.', items: () => [
      { label: 'Convert all', icon: 'convert', key: 'Enter', disabled: !pending().length, tip: 'Every file that hasn’t been converted yet.', action: () => C.convert(pending()) },
      { label: 'Convert selected', icon: 'convert', key: 'Ctrl+Enter', disabled: !selected().some(i => ['ready', 'error', 'done'].includes(i.status)), tip: 'Only the selected files (again, if they are already done).', action: () => C.convert(selected()) },
      { label: 'Retry failed', icon: 'undo', disabled: !C.items.some(i => i.status === 'error'), tip: 'Tries the files that failed again.', action: () => C.convert(C.items.filter(i => i.status === 'error')) },
      { label: 'Stop', icon: 'stop', key: 'Ctrl+.', disabled: !busy() && !C.items.some(i => i.status === 'queued'), tip: 'Stops the current conversion and empties the line.', action: C.stop },
    ] },
    { label: 'Presets', tip: 'One-click targets for the selected files (or all of them).', items: () => PRESETS.map(([id, label, tip]) => ({ label, icon: KIND_ICON[CV.fmt(id).kind === 'sub' ? 'sub' : CV.fmt(id).kind] || 'convert', tip, action: () => applyPreset(id) })) },
    { label: 'View', tip: 'Panels and interface size.', items: () => [
      { label: 'Settings panel', icon: 'panelRight', checked: !document.getElementById('mod-convert').classList.contains('no-side'), tip: 'Shows or hides the “Convert to” panel on the right.', action: toggleSide },
      { sep: true },
      App.uiScaleMenu ? App.uiScaleMenu() : null,
    ].filter(Boolean) },
    { label: 'Help', tip: 'What the converter can do.', items: () => [
      { label: 'Formats and quality…', icon: 'help', tip: 'Every format the converter reads and writes, and how quality works.', action: showHelp },
      { label: 'Keyboard shortcuts', icon: 'keyboard', key: '?', tip: 'All shortcuts for this workspace.', action: () => App.showShortcuts() },
    ] },
  ];
}
function showHelp() {
  const groups = CV.GROUPS.map(([k, l]) => h('div', { class: 'cv-help-g' }, h('b', null, l + ':'), ' ', CV.formats.filter(f => f.kind === k && !f.orig).map(f => f.label).join(', ')));
  App.modal({ title: 'Formats and quality', icon: 'convert', width: 640, body: h('div', { class: 'cv-help' },
    h('p', null, 'The converter reads almost any video, sound, picture or subtitle file — hundreds of formats, from MKV, MP4, MOV, AVI, WMV, FLV, MTS and WebM to MP3, FLAC, WAV, AAC, AC3, DTS, Opus, OGG, WMA, PNG, JPEG, WebP, TIFF, BMP, GIF, AVIF, SVG, SRT and ASS.'),
    h('p', null, h('b', null, 'It writes:')), ...groups,
    h('p', null, h('b', null, 'Quality. '), '“Best” copies every stream the new format can hold exactly as it is (no loss, and usually done in seconds). Only what doesn’t fit is re-encoded, at the highest settings: H.264 at CRF 16, AAC and MP3 at 320 kbps, and so on. Lossless formats (FLAC, WAV, ALAC, AIFF, PNG, TIFF) keep every sample and pixel. Converting a compressed file to a lossless one keeps it exactly as it sounds or looks, but can’t bring back detail that was already gone.'),
    h('p', null, h('b', null, 'Private. '), 'Everything happens on this computer. Nothing is uploaded.'),
    h('p', { class: 'cv-hint' }, 'Engine: FFmpeg (WebAssembly build, GPL). Results up to about 2 GB per file. WebM is written with VP8 video.')),
    buttons: [{ label: 'Close', primary: true }] });
}

const toggleSide = () => {
  const root = document.getElementById('mod-convert');
  root.classList.toggle('no-side');
  const on = !root.classList.contains('no-side');
  el.sideBtn && el.sideBtn.setOn(on);
  try { localStorage.setItem('strata.cv.noside', on ? '0' : '1'); } catch {}
};

/* ---------- build ---------- */
function build(root) {
  const top = h('div', { class: 'panel mhead c-top' });
  const queue = h('div', { class: 'panel c-queue' });
  const side = h('div', { class: 'panel c-side' });
  const foot = h('div', { class: 'panel c-foot' });
  root.append(top, queue, side, foot);

  el.goBtn = btn({ icon: 'convert', cls: 'primary', label: 'Convert', key: 'Enter', title: 'Convert all', tip: 'Converts every file on the list that isn’t done yet, one at a time. You can keep working in the other editors meanwhile. (The button at the bottom of the right-hand panel converts just the selected files.)', onClick: () => C.convert(pending()) });
  el.stopBtn = btn({ icon: 'stop', cls: 'solid', label: 'Stop', key: 'Ctrl+.', title: 'Stop', tip: 'Stops the current conversion and empties the line.', onClick: C.stop });
  el.dlBtn = btn({ icon: 'download', cls: 'solid', label: 'Download all', title: 'Download all', tip: 'Saves every converted file (as one ZIP when there are several).', onClick: () => downloadAll() });
  el.clrBtn = btn({ icon: 'trash', title: 'Clear the list', tip: 'Removes every file from the list (your original files are not touched).', onClick: () => remove(C.items) });
  const quick = App.select({ bare: true, label: 'Everything to', tip: 'Sets the format for the selected files — or all of them.', value: '', options: [['', 'Everything to…'], ...CV.GROUPS.map(([k, l]) => ({ group: l, options: CV.formats.filter(f => f.kind === k).map(f => [f.id, f.label + (f.orig ? ' sound, untouched' : ' (.' + f.ext + ')')]) }))], onChange: v => { if (v) applyPreset(v); quick.value = ''; } });
  quick.classList.add('cv-quick');
  try { if (localStorage.getItem('strata.cv.noside') === '1') root.classList.add('no-side'); } catch {}
  const sideBtn = btn({ icon: 'panelRight', title: 'Settings panel', tip: 'Shows or hides the “Convert to” panel on the right.', on: !root.classList.contains('no-side'), onClick: () => toggleSide() });
  el.sideBtn = sideBtn;
  top.append(App.menubar(menus()), App.sep(), btn({ icon: 'upload', cls: 'solid', label: 'Add files', key: 'Ctrl+O', title: 'Add files', tip: 'Pick files to convert — or drop them anywhere on this page.', onClick: C.addFiles }), quick, h('div', { class: 'grow' }), el.dlBtn, el.clrBtn, sideBtn, App.sep(), el.stopBtn, el.goBtn);

  el.qcount = h('span', { class: 'cv-count' });
  queue.append(h('div', { class: 'panel-head' }, h('span', { class: 'panel-title' }, 'Files'), el.qcount, h('div', { class: 'grow' }),
    btn({ icon: 'plus', cls: 'sm', title: 'Add files', tip: 'Pick more files to convert.', onClick: C.addFiles })));
  const qb = h('div', { class: 'panel-body cv-qbody' });
  el.list = h('div', { class: 'cv-list', role: 'list' });
  const chip = t => h('span', { class: 'cv-fchip' }, t);
  el.empty = h('div', { class: 'cv-empty' },
    h('div', { class: 'cv-drop' },
      h('div', { class: 'cv-orb' }, icon('convert', 40, 1.6)),
      h('h2', null, 'Drop any file here'),
      h('p', null, 'Video, sound, pictures or subtitles — and get it back in the format you need, at full quality. Everything stays on this computer.'),
      h('div', { class: 'cv-chips' }, ['MKV → MP4', 'MP4 → MP3', 'MOV → GIF', 'FLAC → WAV', 'WAV → MP3', 'AVI → MP4', 'PNG → JPEG', 'HEIC/AVIF → PNG', 'MKV → SRT'].map(chip)),
      h('div', { class: 'cv-emptybtns' },
        btn({ icon: 'upload', cls: 'primary', label: 'Choose files…', tip: 'Pick files from your computer.', onClick: C.addFiles }),
        btn({ icon: 'film', cls: 'solid', label: 'From the Video editor', tip: 'Adds every file in the Video editor’s media bin.', onClick: fromVideo }),
        btn({ icon: 'wave', cls: 'solid', label: 'From the Audio editor', tip: 'Adds the Audio editor’s mix.', onClick: fromAudio }),
        btn({ icon: 'image', cls: 'solid', label: 'From the Image editor', tip: 'Adds the Image editor’s current picture.', onClick: fromImage }))));
  qb.append(el.empty, el.list);
  queue.append(qb);
  qb.addEventListener('pointerdown', e => { if (e.target === qb || e.target === el.list) { C.sel.clear(); renderList(); renderSide(); renderTop(); } });

  el.sideTitle = h('span', { class: 'panel-title' }, 'Convert to');
  side.append(h('div', { class: 'panel-head' }, el.sideTitle));
  el.sideBody = h('div', { class: 'panel-body cv-side' });
  side.append(el.sideBody);

  el.eng = h('span', { class: 'cv-eng', title: 'Converter engine', tip: 'FFmpeg, running inside Strata on this computer. It starts when needed and goes to sleep after a few idle minutes to free memory.' }, h('i'));
  el.engTxt = h('span', { class: 'cv-engtxt' });
  el.totals = h('span', { class: 'cv-totals' });
  el.fbar = h('div', { class: 'cv-fbar' }, h('i'));
  const auto = App.toggle({ bare: true, label: 'Save results automatically', value: store.autoSave, tip: 'Saves every converted file to your Downloads folder the moment it is ready.', onChange: v => { store.autoSave = v; saveStore(); } });
  el.foot = foot;
  foot.append(el.eng, el.engTxt, h('span', { class: 'cv-priv', title: 'Private', tip: 'Files are converted on this computer. Nothing is uploaded anywhere.' }, icon('lock', 13), 'Private: nothing is uploaded'), el.fbar, h('div', { class: 'grow' }), el.totals,
    h('label', { class: 'cv-auto' }, auto, h('span', null, 'Save automatically')));

  // dropping files (desktop) and things dragged from the other editors
  App.fileDrop(root, files => C.add(files));
  X.zone(root, { accepts: p => !!p.file && p.from !== 'convert', label: p => `Drop to convert “${p.name}”`, drop: async p => C.add([await p.file()]) });
  render();
  engineState();
  E.warm();
}

X.receivers.convert = { accepts: p => !!p.file && p.from !== 'convert', async receive(p) { await C.add([await p.file()]); } };
App.on('convert:add', (files, opts) => C.add(files, opts));

App.modules = App.modules || {};
App.modules.convert = {
  menus: () => menus(),
  init() { build(document.getElementById('mod-convert')); },
  toggleSide: () => toggleSide(),
  show() { renderTop(); },
  shortcuts: [
    ['Converter', [['Ctrl + O', 'Add files'], ['Enter', 'Convert all'], ['Ctrl + Enter', 'Convert the selected files'], ['Ctrl + .', 'Stop'], ['Del', 'Remove selected'], ['Ctrl + A', 'Select all'], ['Ctrl + D', 'Also convert to another format'], ['Ctrl + Shift + S', 'Download all results (ZIP)'], ['Esc', 'Clear the selection'], ['Double-click a file', 'Convert just that one']]],
  ],
  onKey(e) {
    const k = App.combo(e);
    const map = {
 'ctrl+o': C.addFiles, 'enter': () => C.convert(pending()), 'ctrl+enter': () => C.convert(), 'ctrl+.': C.stop, 'delete': () => remove(selected()), 'backspace': () => remove(selected()),
      'ctrl+a': () => { C.sel = new Set(C.items.map(i => i.id)); renderList(); renderSide(); renderTop(); }, 'ctrl+d': () => duplicate(selected()),
      'ctrl+shift+s': () => downloadAll(true), 'escape': () => { if (C.sel.size) { C.sel.clear(); renderList(); renderSide(); renderTop(); } },
    };
    if (map[k]) { e.preventDefault(); map[k](); }
  },
};
})();
