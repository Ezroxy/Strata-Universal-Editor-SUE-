/* TEMPORARY QA harness (not part of the app; not embedded in the exe). Load in the preview with
   await import('/qa/harness.js')  →  window.QA.sweep('video' | 'audio' | 'image')  runs every menu command. */
const App = window.App, V = App.V, A = App.A, I = App.I;
const Q = window.QA = window.QA || { errors: [], log: [], results: {}, downloads: [] };
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await tick(); };
const wait = ms => new Promise(r => setTimeout(r, ms));
Q.tick = tick; Q.settle = settle; Q.wait = wait;
Q.cur = Q.cur || 'boot';
const push = (kind, msg) => Q.errors.push({ at: Q.cur, kind, msg: String(msg).slice(0, 500) });
if (!Q.hooked) {
  Q.hooked = true;
  addEventListener('error', e => push('error', (e.error && e.error.stack) || e.message));
  addEventListener('unhandledrejection', e => push('reject', (e.reason && e.reason.stack) || e.reason));
  const oe = console.error.bind(console); console.error = (...a) => { push('console', a.map(x => (x && x.stack) || String(x)).join(' ')); oe(...a); };
  const ow = console.warn.bind(console); console.warn = (...a) => { Q.log.push('warn@' + Q.cur + ': ' + a.map(String).join(' ').slice(0, 200)); ow(...a); };
  App.download = (b, n) => { Q.downloads.push([Q.cur, n, b && b.size]); Q.lastBlob = b; Q.lastName = n; };
  App.pickFiles = async () => [];
  Q.toasts = []; const ot = App.toast; App.toast = (msg, type, ...r) => { Q.toasts.push([Q.cur, String(msg).slice(0, 140), type || '']); return ot(msg, type, ...r); };
  const ic = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () { if (this.type === 'file') return; return ic.call(this); };
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('blocked by QA', 'NotAllowedError'); };
}

Q.closeAll = async () => {
  try { App.closeMenus && App.closeMenus(); } catch {}
  try { App.closePopover && App.closePopover(); } catch {}
  for (let k = 0; k < 6; k++) {
    const backs = [...document.querySelectorAll('.modal-back:not(.closing)')];
    if (!backs.length) break;
    for (const b of backs) { const x = b.querySelector('.modal-head .btn[data-tip-title="Close"], .modal-head button:last-of-type'); if (x) x.click(); else b.remove(); }
    await settle();
  }
  document.querySelectorAll('.pal-back').forEach(p => { p.remove(); App.modalCount--; });
  if (document.querySelector('.wlx')) App.closeWelcome();
  await settle();
  const open = document.querySelectorAll('.modal-back:not(.closing), .pal-back, .wlx:not(.wl-out)').length;
  if (App.modalCount !== open) { Q.log.push(`modalCount drift ${App.modalCount} vs ${open} after ${Q.cur}`); App.modalCount = open; }
};

/* ---------- test assets ---------- */
Q.png = () => new Promise(r => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 360; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 640, 360); g.addColorStop(0, '#3a6fb8'); g.addColorStop(1, '#ffb070'); x.fillStyle = g; x.fillRect(0, 0, 640, 360);
  x.fillStyle = '#b8473a'; x.beginPath(); x.arc(320, 200, 90, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = '700 48px Manrope'; x.fillText('QA', 280, 90);
  c.toBlob(r, 'image/png');
});
Q.wav = (secs = 4, sr = 48000) => {
  const n = secs * sr, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / sr, on = (t % 1) < 0.7 ? 1 : 0; L[i] = on * 0.4 * Math.sin(2 * Math.PI * 220 * t); R[i] = on * 0.4 * Math.sin(2 * Math.PI * 330 * t); }
  return { blob: App.dsp.encodeWAV([L, R], sr, 16), channels: [L, R], sampleRate: sr };
};

/* ---------- per-editor content so menu items have something to work on ---------- */
Q.setup = {
  async video() {
    if (!V.media.some(m => m.name === 'qa-image.png')) await V.importBlob(await Q.png(), 'qa-image.png');
    if (!V.media.some(m => m.name === 'qa-tone.wav')) await V.importBlob(Q.wav().blob, 'qa-tone.wav');
    for (let i = 0; i < 40 && V.media.some(m => m.loading); i++) await wait(50);
    if (!V.clips.length) { for (const m of V.media) V.ops.placeMedia(m, 'append', 0); }
    if (!V.sel.size) { V.sel = new Set(V.clips.map(c => c.id)); V.changed('sel'); }
  },
  async audio() {
    if (!A.tracks.length) { const w = Q.wav(); A.addTrackFrom({ channels: w.channels, sampleRate: w.sampleRate }, 'QA tone', 0); }
    if (!A.tracks.some(t => t.selected)) A.tracks.forEach(t => (t.selected = true));
    if (!A.sel) A.sel = { t0: 0.5, t1: 2.5 };
    A.redraw && A.redraw();
  },
  async image() {
    if (!I.doc || !I.doc.name.startsWith('QA')) {
      I.newDoc(800, 500, '#ffffff', 'QA');
      const c = I.active().ctx; const g = c.createLinearGradient(0, 0, 800, 500); g.addColorStop(0, '#5aa0ff'); g.addColorStop(1, '#ffd27a'); c.fillStyle = g; c.fillRect(0, 0, 800, 500);
      c.fillStyle = '#b8473a'; c.beginPath(); c.arc(400, 260, 120, 0, 7); c.fill(); I.pushHistory && I.pushHistory('QA paint', 'brush');
    }
  },
};

/** run every enabled menu command of an editor; returns [name, status, dialogs opened] rows */
Q.sweep = async (mode, { skip = [], only = null } = {}) => {
  App.setMode(mode); await settle(); await wait(30);
  await Q.closeAll();
  await Q.setup[mode]();
  const names = App.flattenMenus(App.modules[mode].menus()).map(it => it.group + ' › ' + it.label);
  const res = [];
  for (const name of names) {
    if (only && !only.some(s => name.includes(s))) continue;
    if (skip.some(s => name.includes(s))) { res.push([name, 'skip']); continue; }
    const it = App.flattenMenus(App.modules[mode].menus()).find(x => x.group + ' › ' + x.label === name);
    if (!it || !it.action) { res.push([name, 'gone']); continue; }
    if (it.disabled) { res.push([name, 'disabled']); continue; }
    Q.cur = mode + ': ' + name; const e0 = Q.errors.length;
    try { const r = it.action(); if (r && r.then) await Promise.race([r.catch(e => push('reject', e && e.stack || e)), wait(4000)]); }
    catch (e) { push('throw', e.stack || e); }
    await settle(); await wait(40); await settle();
    const opened = [...document.querySelectorAll('.modal-back:not(.closing) .modal-head > span:not(.modal-ico)')].map(s => s.textContent).join(' | ');
    if (Q.applyMode && opened) {
      // press the dialog's main button and wait for the work to finish
      const backs = [...document.querySelectorAll('.modal-back:not(.closing)')], top = backs[backs.length - 1];
      const pri = top && top.querySelector('.modal-foot .primary');
      if (pri && !pri.disabled) {
        const d0 = Q.downloads.length;
        await wait(250); pri.click();
        for (let k = 0; k < 120; k++) {
          await wait(100);
          const busy = [...document.querySelectorAll('[class*="busy"]')].some(b => b.offsetParent && getComputedStyle(b).display !== 'none');
          const stillOpen = top.isConnected && !top.classList.contains('closing');
          if (!busy && (!stillOpen || Q.downloads.length > d0) && k > 3) break;
        }
      }
    }
    await Q.closeAll();
    if (App.active !== mode) { App.setMode(mode); await settle(); }
    await Q.setup[mode]();
    res.push([name, Q.errors.length > e0 ? 'ERROR' : 'ok', opened]);
    Q.progress = `${mode} ${res.length}/${names.length}`;
  }
  Q.cur = 'idle';
  Q.results[mode] = res;
  return res;
};
/* ---------- context menus: right-click a target, run every item (one submenu level) ---------- */
const rowsOf = m => [...m.querySelectorAll('.menu-item')].map(r => ({ label: r.querySelector('.mi-label').textContent, dis: r.classList.contains('disabled'), sub: !!r.querySelector('.mi-sub') }));
Q.ctxSweep = async (mode, tag, getTarget) => {
  App.setMode(mode); await settle();
  const open = async () => {
    await Q.closeAll(); if (App.active !== mode) App.setMode(mode); await Q.setup[mode](); await settle(); await wait(20);
    const t = getTarget(); if (!t || !t.el) return null;
    const r = t.el.getBoundingClientRect(), x = t.x ?? r.left + r.width / 2, y = t.y ?? r.top + r.height / 2;
    t.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
    await settle();
    const ms = document.querySelectorAll('.menu'); return ms[ms.length - 1] || null;
  };
  const exec = async (name, fn) => {
    Q.cur = mode + ': ' + name; const e0 = Q.errors.length;
    try { fn(); } catch (e) { push('throw', e.stack || e); }
    await settle(); await wait(60); await settle();
    const opened = [...document.querySelectorAll('.modal-back:not(.closing) .modal-head > span:not(.modal-ico)')].map(s => s.textContent).join(' | ');
    await Q.closeAll();
    return [name, Q.errors.length > e0 ? 'ERROR' : 'ok', opened];
  };
  let m = await open(); if (!m) return [[tag, 'NO MENU']];
  const rows = rowsOf(m), res = [];
  for (let i = 0; i < rows.length; i++) {
    const { label, dis, sub } = rows[i];
    if (dis) { res.push([tag + ' › ' + label, 'disabled']); continue; }
    if (!sub) { m = await open(); if (!m) break; const row = m.querySelectorAll('.menu-item')[i]; if (!row || row.classList.contains('disabled')) { res.push([tag + ' › ' + label, 'disabled now']); continue; } res.push(await exec(tag + ' › ' + label, () => row.click())); continue; }
    m = await open(); m.querySelectorAll('.menu-item')[i].click(); await settle();
    const subRows = rowsOf([...document.querySelectorAll('.menu')].pop());
    for (let j = 0; j < subRows.length; j++) {
      if (subRows[j].dis || subRows[j].sub) { res.push([tag + ' › ' + label + ' › ' + subRows[j].label, subRows[j].dis ? 'disabled' : 'nested']); continue; }
      m = await open(); m.querySelectorAll('.menu-item')[i].click(); await settle();
      const sm = [...document.querySelectorAll('.menu')].pop(), row = sm.querySelectorAll('.menu-item')[j];
      res.push(await exec(tag + ' › ' + label + ' › ' + subRows[j].label, () => row.click()));
    }
  }
  Q.cur = 'idle';
  (Q.results.ctx = Q.results.ctx || []).push(...res);
  return res;
};
/* ---------- keyboard: press lots of key combinations in an editor ---------- */
Q.keySweep = async (mode) => {
  App.setMode(mode); await Q.closeAll(); await Q.setup[mode]();
  const keys = [...'abcdefghijklmnopqrstuvwxyz0123456789', 'Delete', 'Backspace', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', '[', ']', '=', '-', '\\', "'", '?', ' ', 'Tab', 'PageUp', 'PageDown'];
  const mods = [{}, { ctrlKey: true }, { shiftKey: true }, { ctrlKey: true, shiftKey: true }, { altKey: true }, { ctrlKey: true, altKey: true }];
  const res = [];
  for (const k of keys) for (const md of mods) {
    const name = `${md.ctrlKey ? 'Ctrl+' : ''}${md.altKey ? 'Alt+' : ''}${md.shiftKey ? 'Shift+' : ''}${k === ' ' ? 'Space' : k}`;
    Q.cur = mode + ': key ' + name; const e0 = Q.errors.length;
    const target = document.activeElement && document.activeElement !== document.body && !App.isTyping(document.activeElement) ? document.activeElement : document.body;
    try {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, bubbles: true, cancelable: true, ...md }));
      target.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true, ...md }));
    } catch (e) { push('throw', e.stack || e); }
    await settle(6);
    const opened = [...document.querySelectorAll('.modal-back:not(.closing) .modal-head > span:not(.modal-ico), .pal-back')].map(s => s.textContent || 'palette').join(' | ');
    if (opened || document.querySelector('.menu, .popover')) await Q.closeAll();
    if (App.active !== mode) { res.push([name, 'switched to ' + App.active]); App.setMode(mode); await settle(); }
    if (App.V.playing) App.V.pause(); if (App.A.playing) App.A.stop && App.A.stop();
    await Q.setup[mode]();
    if (Q.errors.length > e0) res.push([name, 'ERROR']);
  }
  Q.cur = 'idle';
  Q.results['keys-' + mode] = res;
  return res;
};
/* ---------- pointer drags ---------- */
Q.drag = async (el, from, to, { steps = 8, button = 0, mods = {}, target = null } = {}) => {
  const r = el.getBoundingClientRect(), P = ([fx, fy]) => ({ clientX: r.left + r.width * fx, clientY: r.top + r.height * fy });
  const fire = (type, p, extra = {}) => (target || el).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button, buttons: type === 'pointerup' ? 0 : 1 << button, ...p, ...mods, ...extra }));
  fire('pointerdown', P(from)); await tick();
  for (let k = 1; k <= steps; k++) { const f = [from[0] + (to[0] - from[0]) * k / steps, from[1] + (to[1] - from[1]) * k / steps]; const p = P(f); fire('pointermove', p); document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, buttons: 1 << button, ...p, ...mods })); window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, buttons: 1 << button, ...p, ...mods })); await tick(); }
  const pe = P(to);
  fire('pointerup', pe); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, ...pe, ...mods })); window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, ...pe, ...mods }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...pe }));
  await settle();
};
Q.key = (k, mods = {}) => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })) || document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })); };
Q.report = mode => ({ n: (Q.results[mode] || []).length, bad: (Q.results[mode] || []).filter(r => r[1] === 'ERROR').map(r => r[0]), errors: Q.errors.filter(e => e.at.startsWith(mode)).map(e => `${e.at} :: ${e.kind} :: ${e.msg}`), drift: Q.log.filter(l => l.startsWith('modalCount')) });
