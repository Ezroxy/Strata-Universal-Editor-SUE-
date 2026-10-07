/* Strata Studio — Interface size (View ▸ Interface size, Preferences ▸ Appearance). Scales the whole interface with
   CSS `zoom` on <html>, then makes the page measure itself the way real browser zoom would: pointer positions,
   element rectangles, the window size and devicePixelRatio are all reported in the page's own (unscaled) pixels,
   width media queries follow the scaled width, and viewport units (vh / vw) are corrected through --vh / --vw.
   That keeps every pointer calculation in the editors exact at any size without touching them one by one.
   Loaded in <head> right after themes.js, before anything measures the page. */
(() => {
'use strict';
const App = (window.App = window.App || {});
const MIN = 0.5, MAX = 2;
let Z = 1;

// Chromium 128+ implements standardized CSS zoom (element.currentCSSZoom). Older engines measure zoomed pages
// differently, so the setting is hidden there instead of half-working.
const supported = typeof Element !== 'undefined' && 'currentCSSZoom' in Element.prototype;
App.uiScaleSupported = supported;
App.UI_SCALE_MIN = MIN; App.UI_SCALE_MAX = MAX;

/* ---------- measuring in unscaled pixels ---------- */
const wrapGetter = (proto, key, fn) => {
  const d = Object.getOwnPropertyDescriptor(proto, key);
  if (!d || !d.get) return;
  const get = d.get;
  Object.defineProperty(proto, key, { ...d, get() { return fn(get.call(this)); } });
};
const div = v => Z === 1 ? v : v / Z;
const rect = r => Z === 1 ? r : new DOMRect(r.x / Z, r.y / Z, r.width / Z, r.height / Z);
if (supported) {
  // pointer, mouse, wheel and drag events all inherit these from MouseEvent
  for (const k of ['clientX', 'clientY', 'pageX', 'pageY', 'x', 'y', 'movementX', 'movementY']) wrapGetter(MouseEvent.prototype, k, div);
  for (const P of [Element.prototype, Range.prototype]) {
    const gbcr = P.getBoundingClientRect, gcr = P.getClientRects;
    P.getBoundingClientRect = function () { return rect(gbcr.call(this)); };
    P.getClientRects = function () { const l = gcr.call(this); return Z === 1 ? l : Array.from(l, rect); };
  }
  // window size and pixel density, as real zoom reports them
  const win = (key, fn) => {
    const owner = Object.getOwnPropertyDescriptor(window, key) ? window : Window.prototype;
    const d = Object.getOwnPropertyDescriptor(owner, key);
    if (!d || !d.get) return;
    const get = d.get;
    Object.defineProperty(window, key, { configurable: true, enumerable: d.enumerable, get() { return fn(get.call(window)); }, set: d.set ? v => d.set.call(window, v) : undefined });
  };
  win('innerWidth', div); win('innerHeight', div);
  win('devicePixelRatio', v => Z === 1 ? v : v * Z);
  // hit-testing takes page coordinates back into screen space
  for (const k of ['elementFromPoint', 'elementsFromPoint', 'caretRangeFromPoint', 'caretPositionFromPoint']) {
    const f = Document.prototype[k];
    if (typeof f === 'function') Document.prototype[k] = function (x, y, ...rest) { return f.call(this, x * Z, y * Z, ...rest); };
  }
}

/* ---------- width / height media queries follow the scaled page width ---------- */
const ORIG = new WeakMap();
const scaleRules = rules => {
  for (const r of rules) {
    if (r instanceof CSSMediaRule) {
      let o = ORIG.get(r);
      if (o == null) { o = r.media.mediaText; ORIG.set(r, o); }
      const t = Z === 1 ? o : o.replace(/(\d*\.?\d+)px/g, (m, v) => +(v * Z).toFixed(2) + 'px');
      if (r.media.mediaText !== t) r.media.mediaText = t;
    }
    if (r.cssRules) scaleRules(r.cssRules);
  }
};
const scaleMedia = () => { for (const sh of document.styleSheets) { try { scaleRules(sh.cssRules); } catch { /* not readable yet */ } } };
if (supported) {
  // stylesheets added later (the welcome screens inject theirs into <head>) get the same treatment before they paint
  new MutationObserver(muts => {
    let any = false;
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeName === 'STYLE') any = true;
      else if (n.nodeName === 'LINK') n.addEventListener('load', () => Z !== 1 && scaleMedia(), { once: true });
    }
    if (any && Z !== 1) scaleMedia();
  }).observe(document.head, { childList: true });
  addEventListener('DOMContentLoaded', () => Z !== 1 && scaleMedia());
  addEventListener('load', () => Z !== 1 && scaleMedia());
}

/** Rewrites viewport units in a stylesheet string so they stay true to the window at any interface size
    (12vh → calc(12 * var(--vh))). Used for CSS injected at runtime, e.g. the welcome screens. */
App.fixViewportUnits = css => String(css).replace(/(^|[\s(,:*/+])(-?)(\d*\.?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)\b/g,
  (m, pre, sign, n, u) => `${pre}calc(${sign}${n} * var(--${u === 'vmin' || u === 'vmax' ? u : u.slice(-2)}))`);

/* ---------- applying a size ---------- */
const norm = z => Math.min(MAX, Math.max(MIN, Math.round((+z || 1) * 100) / 100));
const apply = z => {
  Z = supported ? norm(z) : 1;
  const st = document.documentElement.style;
  if (Z === 1) { st.removeProperty('zoom'); st.removeProperty('--uiz'); }
  else { st.zoom = String(Z); st.setProperty('--uiz', String(Z)); }
  scaleMedia();
};
App.uiScale = () => Z;
/** Set the interface size (1 = 100%). Saves the setting and lets canvases and layouts re-measure. */
App.setUiScale = (z, { toast = false } = {}) => {
  const before = Z;
  apply(z);
  if (App.settings && App.settings.uiScale !== Z) App.setSetting('uiScale', Z);
  if (Z !== before) {
    dispatchEvent(new Event('resize'));
    App.emit && App.emit('uiscale', Z);
    App.hideTip && App.hideTip();
    dialogSync && dialogSync();
  }
  if (toast && App.toast) App.toast(`Interface size ${Math.round(Z * 100)}%` + (Z !== 1 ? ' · Ctrl+Alt+0 resets it' : ''), 'ok', 2200, Z !== 1 ? { label: 'Reset', fn: () => App.setUiScale(1, { toast: true }) } : undefined);
  return Z;
};
const STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
/** One step bigger (+1) or smaller (−1), along the same stops browsers use. */
App.stepUiScale = dir => {
  const next = dir > 0 ? STEPS.find(s => s > Z + 0.001) : [...STEPS].reverse().find(s => s < Z - 0.001);
  return App.setUiScale(next ?? (dir > 0 ? MAX : MIN), { toast: true });
};

/** "Interface size" for each editor's View menu. */
App.uiScaleMenu = () => ({
  label: 'Interface size', icon: 'expand', disabled: !supported,
  tip: supported ? 'Makes everything in Strata bigger or smaller — menus, buttons, text and panels. Handy on very large or very small screens.' : 'Needs a newer version of Chrome, Edge or WebView2.',
  sub: () => [
    { label: 'Bigger', icon: 'zoomIn', key: 'Ctrl+Alt+=', disabled: Z >= MAX, tip: 'One step bigger.', action: () => App.stepUiScale(1) },
    { label: 'Smaller', icon: 'zoomOut', key: 'Ctrl+Alt+-', disabled: Z <= MIN, tip: 'One step smaller.', action: () => App.stepUiScale(-1) },
    { label: 'Reset (100%)', icon: 'undo', key: 'Ctrl+Alt+0', disabled: Z === 1, tip: 'Back to the normal size.', action: () => App.setUiScale(1, { toast: true }) },
    { sep: true },
    ...[0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map(s => ({ label: Math.round(s * 100) + '%', checked: Math.abs(Z - s) < 0.001, tip: `Show the interface at ${Math.round(s * 100)}% size.`, action: () => App.setUiScale(s, { toast: true }) })),
    { sep: true },
    { label: 'Fine-tune…', icon: 'sliders2', tip: 'A slider to set the exact size, from 50% to 200%.', action: () => App.uiScaleDialog() },
  ],
});

/** The fine-tune window: a slider that applies when you let go (so the slider doesn't move under the mouse). */
let dialogSync = null;
App.uiScaleDialog = () => {
  const { h } = App;
  const pct = v => Math.round(v * 100) + '%';
  const preview = h('div', { class: 'uiscale-preview' }, pct(Z));
  const sl = App.slider({ label: 'Size', min: MIN * 100, max: MAX * 100, step: 5, value: Math.round(Z * 100), def: 100, unit: '%',
    tip: 'Drag, then let go to apply. Typing a number works too (50–200).',
    onInput: v => { preview.textContent = v + '%'; },
    onChange: v => App.setUiScale(v / 100) });
  const chips = h('div', { class: 'chips', style: { padding: '4px 16px 0' } }, [0.75, 0.9, 1, 1.25, 1.5].map(s => {
    const c = h('button', { class: 'chip', title: pct(s), tip: `Show the interface at ${pct(s)} size.` }, pct(s));
    c.addEventListener('click', () => App.setUiScale(s));
    return c;
  }));
  // keeps the window in step however the size changes (slider, chips, shortcuts)
  dialogSync = () => { preview.textContent = pct(Z); sl.set(Math.round(Z * 100)); };
  App.modal({ title: 'Interface size', icon: 'expand', width: 400, onClose: () => { dialogSync = null; },
    body: h('div', null, h('div', { class: 'hint', style: { paddingTop: 0 } }, 'Makes menus, buttons, text and panels bigger or smaller. Your videos, sounds and images are not changed.'),
      preview, sl, chips, h('div', { class: 'hint' }, 'Shortcuts: Ctrl+Alt+= bigger, Ctrl+Alt+- smaller, Ctrl+Alt+0 back to 100%.')),
    buttons: [{ label: 'Reset', onClick: () => { App.setUiScale(1); return false; } }, { label: 'Done', primary: true }] });
};

/** Ctrl+Alt+= / - / 0 from anywhere (main.js routes keys here). Returns true when handled. */
App.uiScaleKey = e => {
  if (!supported || !(e.ctrlKey || e.metaKey) || !e.altKey || e.shiftKey) return false;
  const k = e.code === 'NumpadAdd' ? '=' : e.code === 'NumpadSubtract' ? '-' : e.code === 'Numpad0' ? '0' : e.code === 'Equal' ? '=' : e.code === 'Minus' ? '-' : e.code === 'Digit0' ? '0' : e.key;
  if (k === '=' || k === '+') App.stepUiScale(1);
  else if (k === '-') App.stepUiScale(-1);
  else if (k === '0') App.setUiScale(1, { toast: true });
  else return false;
  e.preventDefault();
  return true;
};

// boot: read the saved size directly (store.js hasn't loaded yet) so the first paint is already the right size
try { apply((JSON.parse(localStorage.getItem('strata.settings') || '{}').uiScale) || 1); } catch { apply(1); }
})();
