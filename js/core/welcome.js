/* Strata Studio — the welcome screen.
   Every theme has its own hand-made welcome screen (js/welcome/<theme>.js) that registers itself as
     App.WELCOMES[themeId] = { css: '…scoped under .wl-<theme>…', build(root, api) { …; return { key, leave, dispose } } }
   This file shows the one for the current theme and handles everything they have in common: the editor list, keys
   (1 / 2 / 3 open an editor, Esc skips, Ctrl+K, ?, Ctrl+,), clicks on [data-pick] / [data-act] elements, the actions,
   the "show at startup" switch, and a clean close that stops every animation loop, timer and listener the screen used.
   Screens build their DOM from HTML strings; api.tip() adds the hover explainers. */
(() => {
'use strict';
const App = window.App;
App.WELCOMES = App.WELCOMES || {};

const MODES = [
  { id: 'video', name: 'Video', key: '1', icon: 'film', verb: 'Edit a video',
    desc: 'Cut, layer and animate footage on a multitrack timeline.',
    pts: ['Blade, ripple, roll & slip edits', 'Keyframes, chroma key & titles', 'Auto captions & silence cutting', 'Fast MP4 / WebM / GIF export'],
    tip: 'Multitrack video editor: cut, trim, layer, animate, add titles, captions, transitions and color, then export.' },
  { id: 'audio', name: 'Audio', key: '2', icon: 'wave', verb: 'Record or edit sound',
    desc: 'Record, clean up and master sound with pro tools.',
    pts: ['Live recording & noise reduction', 'EQ, compressor & 25+ effects', 'Loudness (LUFS) & auto-duck', 'Envelopes, markers & live preview'],
    tip: 'Multitrack audio editor: record, cut, clean up noise, EQ, effects, loudness and mastering.' },
  { id: 'image', name: 'Image', key: '3', icon: 'image', verb: 'Edit a photo or paint',
    desc: 'Retouch photos or paint from scratch — MS Paint meets a darkroom.',
    pts: ['Layers, masks & selections', 'Camera Raw, Liquify & 70+ filters', 'Healing brush, clone & text', 'Develop sliders & one-click looks'],
    tip: 'Layered photo editor with paint tools, selections, masks, Camera Raw, adjustments and filters.' },
];
const ACTIONS = [
  { id: 'open', icon: 'folder', label: 'Open project…', short: 'Open', tip: 'Open a .strata project file you saved earlier (from any of the three editors).' },
  { id: 'palette', icon: 'command', label: 'Command palette', short: 'Commands', key: 'Ctrl+K', tip: 'Find and run any command by typing its name.' },
  { id: 'shortcuts', icon: 'keyboard', label: 'Shortcuts', short: 'Keys', key: '?', tip: 'Every keyboard shortcut for the editor, in one list.' },
  { id: 'prefs', icon: 'settings', label: 'Preferences', short: 'Settings', key: 'Ctrl+,', tip: 'Themes, sounds, fonts, explainers, autosave and editor defaults.' },
];
App.WELCOME_MODES = MODES;

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** hover explainer attributes for an HTML string */
const tip = (title, body, key) => ` data-tip-title="${esc(title)}" data-tip="${esc(body)}"${key ? ` data-key="${esc(key)}"` : ''}`;
const iconSvg = (name, size = 18, sw = 1.8) => `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${App.ICONS[name] || ''}</svg>`;
const logoSvg = (size = 40, cols = ['#ff7849', '#35d6b4', '#a08aff']) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><g transform="skewX(-12) translate(4 0)"><rect x="2" y="5" width="22" height="6" rx="3" fill="${cols[0]}"/><rect x="4" y="13" width="22" height="6" rx="3" fill="${cols[1]}"/><rect x="6" y="21" width="22" height="6" rx="3" fill="${cols[2]}"/></g></svg>`;

const BASE_CSS = `
.wlx { position: fixed; inset: 0; z-index: 8500; overflow: hidden; isolation: isolate; user-select: none; -webkit-user-select: none; animation: wlx-in .4s ease both; }
.wlx.wl-out { animation: wlx-out .3s ease forwards; pointer-events: none; }
@keyframes wlx-in { from { opacity: 0; } }
@keyframes wlx-out { to { opacity: 0; transform: scale(1.015); } }
.wlx *, .wlx *::before, .wlx *::after { box-sizing: border-box; }
.wlx [data-pick], .wlx [data-act] { cursor: pointer; }
.wlx button { font: inherit; color: inherit; }
.wlx :focus { outline: none; }
.wlx :focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.wlx canvas.wl-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.wlx .wl-startup { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.wlx .wl-startup input { margin: 0; cursor: pointer; }
`;
/* colour helpers for the screens (hex in, hex / rgba out) */
const rgb = hex => { let s = String(hex).trim().replace('#', ''); if (s.length === 3) s = [...s].map(c => c + c).join(''); const n = parseInt(s.slice(0, 6), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rgba = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
const luma = hex => { const [r, g, b] = rgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const injected = new Set();
const inject = (id, css) => {
  if (injected.has(id) || !css) return;
  injected.add(id);
  const st = document.createElement('style'); st.dataset.welcome = id; st.textContent = css; document.head.append(st);
};

let current = null;

function makeApi(root, theme) {
  const cleanups = [];
  let alive = true;
  // read the theme's colours from a probe element: <html> may still be animating them after a theme switch
  const probe = document.createElement('div');
  probe.dataset.theme = theme; probe.style.display = 'none';
  document.body.append(probe);
  const cs = getComputedStyle(probe), vals = {};
  for (const n of ['video', 'audio', 'image']) for (const s of ['', '-2', '-ink']) vals['--' + n + s] = cs.getPropertyValue('--' + n + s).trim();
  probe.remove();
  const v = n => vals[n];
  const FALLBACK = { video: ['#ff7849', '#ffb08f'], audio: ['#35d6b4', '#9cf0dc'], image: ['#a08aff', '#d2c7ff'] };
  const modes = MODES.map(m => ({ ...m, color: v('--' + m.id) || FALLBACK[m.id][0], light: v('--' + m.id + '-2') || FALLBACK[m.id][1], ink: v('--' + m.id + '-ink') || '#111' }));
  const api = {
    theme, modes, actions: ACTIONS,
    desktop: !!window.__strataDesktop,
    tagline: 'Video, audio and image editing — together, private, and ' + (window.__strataDesktop ? 'fully offline.' : 'right in your browser.'),
    reduce: document.documentElement.classList.contains('reduce-motion'),
    fx: document.documentElement.dataset.fx !== 'off',
    esc, tip, icon: iconSvg, logo: logoSvg, rgb, mix, rgba, luma,
    /** readable text colour on top of a background colour */
    inkOn: (bg, dark = '#141210', light = '#ffffff') => (luma(bg) > 0.55 ? dark : light),
    alive: () => alive,
    /** call fn(t seconds since start, dt, now) every animation frame until the screen closes */
    loop(fn) {
      const t0 = performance.now(); let last = t0, id = 0;
      const step = now => { if (!alive) return; const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; try { fn((now - t0) / 1000, dt, now); } catch (e) { console.error(e); return; } id = requestAnimationFrame(step); };
      id = requestAnimationFrame(step);
      cleanups.push(() => cancelAnimationFrame(id));
    },
    after(ms, fn) { const h = setTimeout(() => alive && fn(), ms); cleanups.push(() => clearTimeout(h)); return h; },
    every(ms, fn) { const h = setInterval(() => alive && fn(), ms); cleanups.push(() => clearInterval(h)); return h; },
    wait: ms => new Promise(res => api.after(ms, res)),
    on(target, type, fn, opts) { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); },
    /** HTML string → first element */
    el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; },
    /** a full-size canvas that keeps itself sized to its box (device-pixel sharp); s.onResize(s) is called after each resize */
    canvas(cv, maxDpr = 2) {
      cv = cv || api.el('<canvas class="wl-cv"></canvas>');
      const s = { cv, ctx: cv.getContext('2d'), w: 1, h: 1, dpr: 1, onResize: null };
      const fit = () => { const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return; s.dpr = Math.min(maxDpr, devicePixelRatio || 1); s.w = r.width; s.h = r.height; cv.width = Math.round(r.width * s.dpr); cv.height = Math.round(r.height * s.dpr); s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); s.onResize && s.onResize(s); };
      const ro = new ResizeObserver(fit); ro.observe(cv); cleanups.push(() => ro.disconnect());
      s.fit = fit;
      return s;
    },
    /** "Show this screen when Strata starts" switch (wired to Preferences ▸ Interface ▸ Welcome screen) */
    startup(label = 'Show this screen at startup') {
      const on = (App.settings.welcome || 'always') === 'always';
      const el = api.el(`<label class="wl-startup"${tip('Welcome screen at startup', 'Show this welcome screen every time Strata Studio starts. You can change it later in Preferences ▸ Interface.')}><input type="checkbox"${on ? ' checked' : ''}><span>${esc(label)}</span></label>`);
      el.querySelector('input').addEventListener('change', e => App.setSetting('welcome', e.target.checked ? 'always' : 'never'));
      return el;
    },
    sound: (ev, v) => App.sound && App.sound(ev, v),
    choose: id => choose(id),
    run: id => run(id),
    close: () => close(),
    /** element focus helpers for keyboard-driven screens */
    css: (id, text) => inject(id, text),
  };
  api._cleanup = () => { alive = false; cleanups.splice(0).forEach(f => { try { f(); } catch {} }); };
  return api;
}

function choose(id) {
  const c = current;
  if (!c || c.leaving) return;
  if (!MODES.some(m => m.id === id)) return;
  c.leaving = true;
  App.sound && App.sound('select');
  let ms = 0;
  try { ms = (!c.api.reduce && c.scene.leave && c.scene.leave(id)) || 0; } catch (e) { console.error(e); }
  setTimeout(() => { App.setMode(id); close(); }, ms);
}
function run(id) {
  const c = current;
  if (!c || c.leaving) return;
  close();
  const go = { open: () => App.openProjectFile(), palette: () => App.openPalette && App.openPalette(), shortcuts: () => App.showShortcuts && App.showShortcuts(), prefs: () => App.showPrefs && App.showPrefs(), prefsLook: () => App.showPrefs && App.showPrefs('appearance') }[id];
  go && setTimeout(go, 60);
}
function close() {
  const c = current;
  if (!c || c.closed) return;
  c.closed = true;
  current = null;
  document.removeEventListener('keydown', c.onKey, true);
  try { c.scene.dispose && c.scene.dispose(); } catch (e) { console.error(e); }
  c.api._cleanup();
  c.root.classList.add('wl-out');
  setTimeout(() => c.root.remove(), c.api.reduce ? 0 : 300);
  App.modalCount--;
  if (!App.settings.welcomeSeen) App.setSetting('welcomeSeen', true);
  App.sound && App.sound('close');
}

/** Show the welcome screen for the current theme (or a given one, for previews and testing). */
App.showWelcome = (themeId) => {
  if (current) return current.root;
  const theme = themeId || App.settings.theme || 'dark';
  const def = App.WELCOMES[theme] || App.WELCOMES.dark;
  if (!def) return null;
  inject('base', BASE_CSS);
  inject(theme, def.css);
  const root = document.createElement('div');
  root.className = `welcome-back wlx wl-${App.WELCOMES[theme] ? theme : 'dark'}`;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Welcome to Strata Studio');
  document.body.append(root);
  App.modalCount++;
  const api = makeApi(root, theme);
  const c = current = { root, api, scene: {}, theme };
  try { c.scene = def.build(root, api) || {}; }
  catch (e) { console.error('welcome screen failed', e); close(); return null; }
  root.addEventListener('click', e => {
    const p = e.target.closest('[data-pick]'); if (p && root.contains(p)) { choose(p.dataset.pick); return; }
    const a = e.target.closest('[data-act]'); if (a && root.contains(a)) { if (a.dataset.act === 'close') close(); else run(a.dataset.act); }
  });
  c.onKey = e => {
    if (current !== c || App.isTyping(e.target)) return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (c.scene.key && c.scene.key(e)) return stop();
    const k = App.combo(e);
    const i = ['1', '2', '3'].indexOf(k);
    if (i >= 0) { stop(); return choose(MODES[i].id); }
    if (k === 'escape') { stop(); return close(); }
    if (k === 'ctrl+k') { stop(); return run('palette'); }
    if (k === 'ctrl+,') { stop(); return run('prefs'); }
    if (e.key === '?') { stop(); return run('shortcuts'); }
    if ((k === 'enter' || k === 'space') && document.activeElement && root.contains(document.activeElement)) {
      const t = document.activeElement;
      if (t.matches('input, label')) return;
      if (t.dataset.pick) { stop(); return choose(t.dataset.pick); }
      if (t.dataset.act) { stop(); return t.dataset.act === 'close' ? close() : run(t.dataset.act); }
    }
  };
  document.addEventListener('keydown', c.onKey, true);
  App.sound && App.sound('open');
  return root;
};
App.closeWelcome = close;
})();
