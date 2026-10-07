/* Strata Studio — shared UI kit: element builder, tooltips, toasts, menus, modals, controls,
   color picker and command palette */
(() => {
'use strict';
const App = (window.App = window.App || {});

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
let uidN = 0;
const uid = (p = 'id') => p + (++uidN).toString(36) + Math.random().toString(36).slice(2, 6);
Object.assign(App, { $, $$, clamp, lerp, uid });
const setting = (k, d) => (App.settings && k in App.settings ? App.settings[k] : d);
const sfx = (name, v) => App.sound && App.sound(name, v);

/* ---------- event bus ---------- */
const handlers = {};
App.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
App.emit = (ev, ...a) => { (handlers[ev] || []).slice().forEach(fn => fn(...a)); };

/* ---------- element builder ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const sk in v) { if (sk.startsWith('--')) e.style.setProperty(sk, v[sk]); else e.style[sk] = v[sk]; }
      }
      else if (k === 'tip') e.dataset.tip = v;
      else if (k === 'title') { e.dataset.tipTitle = v; if (!e.hasAttribute('aria-label')) e.setAttribute('aria-label', v); }
      else if (k === 'key') e.dataset.key = v;
      else if (k === 'tipPos') e.dataset.tipPos = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if ((k === 'value' || k === 'checked' || k === 'selected') && k in e) e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(3)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
App.h = h;

function icon(name, size = 18, sw = 1.8) {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${App.ICONS[name] || ''}</svg>`;
  return t.content.firstChild;
}
App.icon = icon;

function btn(o) {
  const b = h('button', {
    class: 'btn ' + (o.cls || '') + (o.on ? ' on' : ''),
    title: o.title, tip: o.tip, key: o.key, tipPos: o.tipPos, type: 'button', disabled: o.disabled,
  });
  if (o.icon) b.append(icon(o.icon, o.size || 18));
  if (o.label) b.append(h('span', null, o.label));
  if (o.onClick) b.addEventListener('click', e => o.onClick(e, b));
  b.setOn = v => { b.classList.toggle('on', !!v); return b; };
  return b;
}
App.btn = btn;
App.sep = () => h('div', { class: 'sep' });

/* ---------- tooltips ---------- */
const tipEl = h('div', { class: 'tip', role: 'tooltip' });
let tipTarget = null, tipTimer = 0, lastHide = 0;
Object.defineProperty(App, 'tipsEnabled', { get: () => setting('tips', true) });
App.setTips = v => { App.setSetting ? App.setSetting('tips', v) : 0; if (!v) hideTip(); };
function hideTip() {
  clearTimeout(tipTimer);
  if (tipEl.classList.contains('show')) lastHide = performance.now();
  tipEl.classList.remove('show');
  tipTarget = null;
}
App.hideTip = hideTip;
function showTip(t) {
  if (!t.isConnected || !App.tipsEnabled || document.body.classList.contains('dragging-ui')) return;
  const title = t.dataset.tipTitle, body = t.dataset.tip, key = t.dataset.key;
  if (!body && !key) return;
  tipEl.innerHTML = '';
  tipEl.append(h('i', { class: 't-accent' }));
  if (title || key) tipEl.append(h('div', { class: 't-title' }, title || '', key ? h('span', { class: 't-key' }, key) : null));
  if (body) tipEl.append(h('div', { class: 't-body' }, body));
  if (!tipEl.isConnected) document.body.append(tipEl);
  tipEl.className = 'tip';
  const r = t.getBoundingClientRect();
  const tr = tipEl.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight, m = 8;
  let pos = t.dataset.tipPos || 'below', x, y;
  if (pos === 'right' && r.right + tr.width + 14 > vw) pos = 'left';
  if (pos === 'left' && r.left - tr.width - 14 < 0) pos = 'right';
  if (pos === 'below' && r.bottom + tr.height + 12 > vh) pos = 'above';
  if (pos === 'above' && r.top - tr.height - 12 < 0) pos = 'below';
  if (pos === 'right' || pos === 'left') {
    x = pos === 'right' ? r.right + 10 : r.left - tr.width - 10;
    y = clamp(r.top + r.height / 2 - tr.height / 2, m, vh - tr.height - m);
    tipEl.style.setProperty('--ay', (r.top + r.height / 2 - y) + 'px');
  } else {
    x = clamp(r.left + r.width / 2 - tr.width / 2, m, vw - tr.width - m);
    y = pos === 'below' ? r.bottom + 9 : r.top - tr.height - 9;
    tipEl.style.setProperty('--ax', clamp(r.left + r.width / 2 - x, 12, tr.width - 12) + 'px');
  }
  tipEl.style.left = Math.round(x) + 'px';
  tipEl.style.top = Math.round(y) + 'px';
  tipEl.classList.add(pos);
  requestAnimationFrame(() => tipEl.classList.add('show'));
}
document.addEventListener('pointerover', e => {
  if (e.pointerType === 'touch') return;
  const t = e.target.closest ? e.target.closest('[data-tip],[data-key]') : null;
  if (t === tipTarget) return;
  hideTip();
  if (!t || e.buttons) return;
  tipTarget = t;
  const warm = performance.now() - lastHide < 500;
  tipTimer = setTimeout(() => showTip(t), warm ? 60 : setting('tipDelay', 420));
});
document.addEventListener('pointerdown', hideTip, true);
document.addEventListener('wheel', hideTip, { passive: true, capture: true });
document.addEventListener('keydown', hideTip, true);
window.addEventListener('blur', hideTip);

/* ---------- toasts ---------- */
const toastWrap = h('div', { class: 'toasts', 'aria-live': 'polite' });
const TOAST_ICON = { ok: 'check', err: 'x', warn: 'info', '': 'sparkle' };
/** App.toast(message, type?, ms?, action?: {label, fn}) */
const TOAST_TIME = { short: 0.65, normal: 1, long: 1.8 };
App.toast = (msg, type = '', ms = 2600, action) => {
  if (!toastWrap.isConnected) document.body.append(toastWrap);
  toastWrap.dataset.pos = setting('toastPos', 'bottom');
  ms *= TOAST_TIME[setting('toastTime', 'normal')] || 1;
  sfx({ ok: 'success', err: 'error', warn: 'warn' }[type] || 'notify');
  while (toastWrap.children.length > 3) toastWrap.firstChild.remove();
  const t = h('div', { class: 'toast ' + type }, h('span', { class: 'toast-ico' }, icon(TOAST_ICON[type] || 'sparkle', 14, 2.4)), h('span', { class: 'toast-msg' }, msg));
  let timer;
  const close = () => { clearTimeout(timer); t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  if (action) {
    const a = h('button', { class: 'toast-act', type: 'button' }, action.label);
    a.addEventListener('click', () => { close(); action.fn(); });
    t.append(a);
    ms = Math.max(ms, 4500);
  }
  toastWrap.append(t);
  timer = setTimeout(close, ms);
  t.addEventListener('pointerenter', () => clearTimeout(timer));
  t.addEventListener('pointerleave', () => { timer = setTimeout(close, 1500); });
  return close;
};

/* ---------- modal ---------- */
App.modalCount = 0;
// open windows, oldest first: only the top one answers Enter / Esc (a prompt opened from inside Camera Raw or
// Preferences must not also press that window's OK button or close it)
const modalStack = [];
App.modal = ({ title, body, buttons = [], width = 420, onClose, pad = false, clear = false, left, cls = '', icon: ic }) => {
  const back = h('div', { class: 'modal-back' + (clear ? ' clear' : '') });
  const bodyEl = h('div', { class: 'modal-body' + (pad ? ' pad' : '') }, body);
  const foot = h('div', { class: 'modal-foot' });
  const box = h('div', { class: 'modal ' + cls, role: 'dialog', 'aria-label': title, style: { width: width + 'px' } });
  let closed = false;
  const close = (result) => {
    if (closed) return; closed = true;
    box.classList.add('closing'); back.classList.add('closing');
    setTimeout(() => back.remove(), 140);
    App.modalCount--;
    const si = modalStack.indexOf(box);
    if (si >= 0) modalStack.splice(si, 1);
    document.removeEventListener('keydown', onKey, true);
    sfx('close');
    onClose && onClose(result);
  };
  const head = h('div', { class: 'modal-head' }, ic ? h('span', { class: 'modal-ico' }, icon(ic, 16)) : null, h('span', null, title), h('div', { class: 'grow' }),
    btn({ icon: 'x', cls: 'sm', title: 'Close', tip: 'Close this window without applying.', onClick: () => close(null) }));
  if (left) foot.append(h('div', { class: 'left' }, left));
  let primary = null;
  for (const b of buttons) {
    const el = btn({ label: b.label, icon: b.icon, cls: 'txt ' + (b.primary ? 'primary' : b.danger ? 'solid danger' : 'solid'), title: b.title || b.label, tip: b.tip,
      onClick: async () => { if (b.onClick) { const r = await b.onClick(); if (r === false) return; } close(b.value ?? true); } });
    if (b.primary) primary = el;
    foot.append(el);
  }
  box.append(head, bodyEl);
  if (buttons.length || left) box.append(foot);
  back.append(box);
  if (!clear) back.addEventListener('pointerdown', e => { if (e.target === back) close(null); });
  const onKey = e => {
    if (modalStack[modalStack.length - 1] !== box || e.defaultPrevented) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
    else if (e.key === 'Enter' && primary && !e.target.matches('textarea, button')) { e.preventDefault(); primary.click(); }
  };
  document.addEventListener('keydown', onKey, true);
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r = box.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    box.style.position = 'fixed'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.margin = '0';
    const mv = ev => { box.style.left = clamp(ev.clientX - ox, 0, innerWidth - 60) + 'px'; box.style.top = clamp(ev.clientY - oy, 0, innerHeight - 40) + 'px'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  document.body.append(back);
  App.modalCount++;
  modalStack.push(box);
  hideTip();
  sfx('open');
  setTimeout(() => { const f = box.querySelector('[autofocus], input.field, textarea'); f && f.focus(); f && f.select && f.select(); }, 30);
  return { close, el: box, body: bodyEl, foot };
};
App.prompt = (title, label, value = '', tip) => new Promise(res => {
  const inp = h('input', { class: 'field wide', value, autofocus: true });
  let v = null;
  App.modal({
    title, width: 360, pad: true,
    body: h('div', null, h('div', { class: 'hint', style: { padding: '0 0 8px' } }, label), inp),
    buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, tip, onClick: () => { v = inp.value; } }],
    onClose: () => res(v),
  });
});
App.confirm = (title, msg, okLabel = 'OK', danger = false) => new Promise(res => {
  let ok = false;
  App.modal({ title, width: 390, pad: true, body: h('div', { class: 'hint', style: { padding: 0 } }, msg),
    buttons: [{ label: 'Cancel' }, { label: okLabel, primary: !danger, danger, onClick: () => { ok = true; } }], onClose: () => res(ok) });
});

/* ---------- menus ---------- */
let openMenus = [];
function closeMenus(depth = 0) {
  while (openMenus.length > depth) openMenus.pop().remove();
  if (!depth) { $$('.menubar > button.open').forEach(b => b.classList.remove('open')); App._menubarActive = null; }
}
App.closeMenus = closeMenus;
document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu') && !e.target.closest('.menubar')) closeMenus(); }, true);
document.addEventListener('keydown', e => {
  if (!openMenus.length) return;
  if (e.key === 'Escape') { closeMenus(); e.stopPropagation(); e.preventDefault(); return; }
  if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
    e.preventDefault(); e.stopPropagation();
    const m = openMenus[openMenus.length - 1];
    const items = $$('.menu-item:not(.disabled)', m);
    let i = items.findIndex(x => x.classList.contains('hover'));
    if (e.key === 'Enter') { if (i >= 0) items[i].click(); return; }
    items.forEach(x => x.classList.remove('hover'));
    i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    if (items[i]) { items[i].classList.add('hover'); items[i].scrollIntoView({ block: 'nearest' }); }
  }
}, true);
function openMenu(x, y, items, depth = 0, alignRight = false) {
  closeMenus(depth);
  if (!depth) sfx('menu');
  const m = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.append(h('div', { class: 'menu-sep' })); continue; }
    if (it.head) { m.append(h('div', { class: 'menu-head' }, it.head)); continue; }
    const dis = typeof it.disabled === 'function' ? it.disabled() : it.disabled;
    const chk = typeof it.checked === 'function' ? it.checked() : it.checked;
    const row = h('div', { class: 'menu-item' + (dis ? ' disabled' : '') + (chk ? ' checked' : ''), role: 'menuitem', tip: it.tip, title: it.tip ? it.label : null, tipPos: 'right' },
      h('span', { class: 'mi-ico' }, chk ? icon('check', 14, 2.4) : (it.icon ? icon(it.icon, 15) : null)),
      it.swatch ? h('i', { class: 'mi-swatch', style: { background: it.swatch } }) : null,
      h('span', { class: 'mi-label' }, it.label),
      it.key ? h('span', { class: 'mi-key' }, it.key) : null,
      it.sub ? h('span', { class: 'mi-sub' }, icon('chevRight', 13)) : null);
    if (it.sub) {
      const openSub = () => {
        $$('.menu-item.hover', m).forEach(r => r.classList.remove('hover'));
        row.classList.add('hover');
        const r = row.getBoundingClientRect();
        openMenu(r.right - 2, r.top - 6, typeof it.sub === 'function' ? it.sub() : it.sub, depth + 1);
      };
      row.addEventListener('pointerenter', openSub);
      row.addEventListener('click', openSub);
    } else {
      row.addEventListener('pointerenter', () => { if (openMenus.length > depth + 1) closeMenus(depth + 1); $$('.menu-item.hover', m).forEach(r => r.classList.remove('hover')); row.classList.add('hover'); });
      row.addEventListener('click', () => { if (dis) return; closeMenus(); hideTip(); it.action && it.action(); });
    }
    m.append(row);
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  if (alignRight) x -= r.width;
  if (x + r.width > innerWidth - 6) x = depth ? x - r.width - (openMenus[depth - 1]?.offsetWidth || 0) + 4 : innerWidth - r.width - 6;
  if (y + r.height > innerHeight - 6) y = Math.max(6, innerHeight - r.height - 6);
  m.style.left = Math.max(6, x) + 'px'; m.style.top = y + 'px';
  openMenus.push(m);
  return m;
}
App.openMenu = openMenu;
App.contextMenu = (e, items) => { e.preventDefault(); hideTip(); openMenu(e.clientX, e.clientY, items); };
App.menubar = (menus) => {
  const bar = h('div', { class: 'menubar', role: 'menubar' });
  for (const mn of menus) {
    const b = h('button', { type: 'button', title: mn.label, tip: mn.tip }, mn.label);
    const open = () => {
      closeMenus(); hideTip();
      b.classList.add('open'); App._menubarActive = bar;
      const r = b.getBoundingClientRect();
      openMenu(r.left, r.bottom + 4, typeof mn.items === 'function' ? mn.items() : mn.items);
    };
    b.addEventListener('click', () => { if (b.classList.contains('open')) closeMenus(); else open(); });
    b.addEventListener('pointerenter', () => { if (App._menubarActive === bar && !b.classList.contains('open')) open(); });
    bar.append(b);
  }
  return bar;
};

/* ---------- generic popover ---------- */
let openPop = null;
App.popover = (anchor, content, { onClose, cls = '' } = {}) => {
  App.closePopover();
  sfx('menu');
  const p = h('div', { class: 'popover ' + cls }, content);
  document.body.append(p);
  const r = anchor.getBoundingClientRect(), pr = p.getBoundingClientRect();
  let x = r.left, y = r.bottom + 6;
  if (x + pr.width > innerWidth - 8) x = innerWidth - pr.width - 8;
  if (y + pr.height > innerHeight - 8) y = Math.max(8, r.top - pr.height - 6);
  p.style.left = Math.max(8, x) + 'px'; p.style.top = y + 'px';
  const outside = e => { if (!p.contains(e.target) && !anchor.contains(e.target)) App.closePopover(); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); App.closePopover(); } };
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  document.addEventListener('keydown', key, true);
  openPop = { el: p, close: () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); p.remove(); onClose && onClose(); } };
  return p;
};
App.closePopover = () => { if (openPop) { const o = openPop; openPop = null; o.close(); } };

/* ---------- color picker ---------- */
const hsv2rgb = (hh, s, v) => { const f = n => { const k = (n + hh / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)].map(x => Math.round(x * 255)); };
const rgb2hsv = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0; if (d) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; } return [hh, mx ? d / mx : 0, mx]; };
const PRESET_COLORS = ['#000000', '#ffffff', '#7f7f7f', '#ed1c24', '#ff7849', '#ffc90e', '#fff200', '#22b14c', '#35d6b4', '#00a2e8', '#3f48cc', '#9d84ff', '#a349a4', '#ff6fae', '#b97a57', '#1d2b53'];
const recentColors = () => { try { return JSON.parse(localStorage.getItem('strata.recentColors') || '[]'); } catch { return []; } };
const pushRecent = c => { const r = [c, ...recentColors().filter(x => x !== c)].slice(0, 8); try { localStorage.setItem('strata.recentColors', JSON.stringify(r)); } catch {} };
App.colorPopover = (anchor, value, { onInput, onChange, onStart } = {}) => {
  let [hh, s, v] = rgb2hsv(...App.hexToRgb(value || '#ffffff'));
  let started = false, cur = (value || '#ffffff').toLowerCase();
  const sv = h('canvas', { class: 'cp-sv', width: 212, height: 140 });
  const svKnob = h('i', { class: 'cp-knob' });
  const hue = h('canvas', { class: 'cp-hue', width: 212, height: 12 });
  const hueKnob = h('i', { class: 'cp-hknob' });
  const prev = h('i', { class: 'cp-prev' });
  const hex = h('input', { class: 'field cp-hex', value: cur, spellcheck: 'false', title: 'Hex color', tip: 'Type a hex code like #ff7849 and press Enter.' });
  const emit = (final) => {
    const c = App.rgbToHex(...hsv2rgb(hh, s, v));
    if (c !== cur) { if (!started) { started = true; onStart && onStart(); } cur = c; onInput && onInput(c); }
    if (final && started) { pushRecent(cur); onChange && onChange(cur); started = false; }
  };
  const paint = () => {
    const x = sv.getContext('2d');
    x.fillStyle = App.rgbToHex(...hsv2rgb(hh, 1, 1)); x.fillRect(0, 0, 212, 140);
    let g = x.createLinearGradient(0, 0, 212, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 212, 140);
    g = x.createLinearGradient(0, 0, 0, 140); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 212, 140);
    svKnob.style.left = (s * 100) + '%'; svKnob.style.top = ((1 - v) * 100) + '%';
    hueKnob.style.left = (hh / 360 * 100) + '%';
    prev.style.background = cur;
    if (document.activeElement !== hex) hex.value = cur;
  };
  const hx = hue.getContext('2d'), hg = hx.createLinearGradient(0, 0, 212, 0);
  for (let i = 0; i <= 6; i++) hg.addColorStop(i / 6, App.rgbToHex(...hsv2rgb(i * 60 % 360, 1, 1)));
  hx.fillStyle = hg; hx.fillRect(0, 0, 212, 12);
  const drag = (el, fn) => el.parentNode.addEventListener('pointerdown', e => {
    e.preventDefault();
    const move = ev => { const r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); emit(false); paint(); };
    move(e);
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); emit(true); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  const svWrap = h('div', { class: 'cp-svwrap' }, sv, svKnob), hueWrap = h('div', { class: 'cp-huewrap' }, hue, hueKnob);
  drag(sv, (x, y) => { s = x; v = 1 - y; });
  drag(hue, x => { hh = x * 360; });
  const setHex = val => { if (/^#?[0-9a-f]{6}$/i.test(val.trim())) { const c = '#' + val.trim().replace('#', '').toLowerCase(); [hh, s, v] = rgb2hsv(...App.hexToRgb(c)); emit(true); paint(); } };
  hex.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') setHex(hex.value); });
  hex.addEventListener('change', () => setHex(hex.value));
  const sw = list => h('div', { class: 'cp-sw' }, list.map(c => { const b = h('button', { type: 'button', style: { background: c }, title: c, 'aria-label': c }); b.addEventListener('click', () => { [hh, s, v] = rgb2hsv(...App.hexToRgb(c)); emit(true); paint(); }); return b; }));
  const tools = [prev, hex];
  if (window.EyeDropper) tools.push(btn({ icon: 'dropper', cls: 'sm', title: 'Pick from screen', tip: 'Pick any color visible on your screen.', onClick: async () => { try { const r = await new EyeDropper().open(); setHex(r.sRGBHex); } catch {} } }));
  const rec = recentColors();
  App.popover(anchor, h('div', { class: 'cp' }, svWrap, hueWrap, h('div', { class: 'cp-row' }, tools), sw(PRESET_COLORS), rec.length ? h('div', { class: 'cp-lbl' }, 'Recent') : null, rec.length ? sw(rec) : null), { cls: 'cp-pop' });
  paint();
};

/* ---------- controls ---------- */
function setRangeFill(inp) {
  const min = +inp.min, max = +inp.max, v = +inp.value;
  inp.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%');
}
App.setRangeFill = setRangeFill;
document.addEventListener('input', e => { if (e.target.type === 'range') setRangeFill(e.target); }, true);

App.slider = (o) => {
  const step = o.step ?? 1;
  const dec = o.decimals ?? (String(step).includes('.') ? String(step).split('.')[1].length : 0);
  const fmt = o.fmt || (v => (+v).toFixed(dec));
  const def = o.def ?? o.value ?? o.min;
  const inp = h('input', { type: 'range', min: o.min, max: o.max, step, value: o.value ?? def, 'aria-label': o.label });
  const num = h('input', { class: 'num', type: 'text', value: fmt(o.value ?? def), 'aria-label': o.label + ' value' });
  const lab = h('label', null, o.label);
  const row = h('div', { class: 'ctl slider', title: o.label, tip: (o.tip || '') + (o.noReset ? '' : ' Double-click to reset.'), key: o.key },
    lab, h('div', { class: 'ctl-main' }, inp, num, o.unit ? h('span', { class: 'unit' }, o.unit) : null));
  setRangeFill(inp);
  let live = false;
  const start = () => { if (!live) { live = true; o.onStart && o.onStart(); } };
  inp.addEventListener('pointerdown', () => { start(); document.body.classList.add('dragging-ui'); });
  inp.addEventListener('pointerup', () => document.body.classList.remove('dragging-ui'));
  inp.addEventListener('keydown', start);
  inp.addEventListener('input', () => { start(); num.value = fmt(+inp.value); o.onInput && o.onInput(+inp.value); });
  inp.addEventListener('change', () => { live = false; o.onChange && o.onChange(+inp.value); });
  num.addEventListener('focus', () => num.select());
  num.addEventListener('keydown', e => {
    if (e.key === 'Enter') num.blur();
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const v = clamp((parseFloat(num.value) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1), o.hardMin ?? +o.min, o.hardMax ?? +o.max);
      start(); row.set(v); o.onInput && o.onInput(v); live = false; o.onChange && o.onChange(v);
    }
    e.stopPropagation();
  });
  num.addEventListener('change', () => {
    let v = o.parse ? o.parse(num.value) : parseFloat(num.value);
    if (!isFinite(v)) v = +inp.value;
    v = clamp(v, o.hardMin ?? +o.min, o.hardMax ?? +o.max);
    start(); row.set(v); o.onInput && o.onInput(v); live = false; o.onChange && o.onChange(v);
  });
  // drag on the label to scrub the value
  lab.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const x0 = e.clientX, v0 = +inp.value, range = (+o.max - +o.min);
    let moved = false;
    const mv = ev => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      if (!moved) { moved = true; start(); document.body.classList.add('scrubbing'); }
      let v = v0 + dx / 220 * range * (ev.shiftKey ? 0.1 : 1);
      v = clamp(Math.round(v / step) * step, +o.min, +o.max);
      row.set(v); o.onInput && o.onInput(v);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); document.body.classList.remove('scrubbing'); if (moved) { live = false; o.onChange && o.onChange(+inp.value); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  const reset = () => { if (o.noReset) return; start(); row.set(def); o.onInput && o.onInput(def); live = false; o.onChange && o.onChange(def); };
  inp.addEventListener('dblclick', reset);
  lab.addEventListener('dblclick', reset);
  row.set = v => { inp.value = v; num.value = fmt(v); setRangeFill(inp); };
  row.get = () => +inp.value;
  row.input = inp;
  row.label = lab;
  return row;
};
App.select = (o) => {
  const opt = op => {
    const [v, l, style] = Array.isArray(op) ? op : [op, op];
    return h('option', { value: v, selected: String(v) === String(o.value), style }, l);
  };
  // options: values, [value, label, style] pairs, or { group, options } for <optgroup>s
  const sel = h('select', { 'aria-label': o.label }, o.options.map(op => op && op.group ? h('optgroup', { label: op.group }, op.options.map(opt)) : opt(op)));
  sel.addEventListener('change', () => { o.onChange && o.onChange(sel.value); setTimeout(() => sel.blur(), 0); });
  sel.addEventListener('keydown', e => e.stopPropagation());
  if (o.bare) { sel.dataset.tip = o.tip || ''; sel.dataset.tipTitle = o.label || ''; return sel; }
  const row = h('div', { class: 'ctl', title: o.label, tip: o.tip }, h('label', null, o.label), sel);
  row.set = v => { sel.value = v; };
  row.get = () => sel.value;
  row.sel = sel;
  return row;
};
/* ---------- fonts (built-in, extracted game fonts, user-imported) ---------- */
App.userFonts = [];   // filled by the Fonts preferences page: [{ family }]
App.isGameFont = f => !!(App.GAME_FONTS || []).find(g => g.family === f);
/** Grouped font list for pickers; each option previews itself in its own typeface. */
App.fontOptions = (base, current) => {
  const o = f => [f, f, { fontFamily: `"${f}"` }];
  const groups = [{ group: 'Built-in', options: base.map(o) }];
  const games = {};
  for (const g of App.GAME_FONTS || []) (games[g.game] = games[g.game] || []).push(o(g.family));
  for (const [game, list] of Object.entries(games)) groups.push({ group: game, options: list });
  if (App.userFonts.length) groups.push({ group: 'Your fonts', options: App.userFonts.map(f => o(f.family)) });
  const all = groups.flatMap(g => g.options.map(x => x[0]));
  if (current && !all.includes(current)) groups.push({ group: 'Missing', options: [o(current)] });
  return groups;
};
/** Make sure a web font is loaded before canvas text uses it; emits 'font-loaded' once ready. */
const fontPromises = new Map();
App.ensureFont = family => {
  if (!family || !document.fonts) return Promise.resolve();
  if (!fontPromises.has(family)) fontPromises.set(family, document.fonts.load(`40px "${family}"`).then(r => { if (r.length) App.emit('font-loaded', family); }).catch(() => {}));
  return fontPromises.get(family);
};
App.toggle = (o) => {
  const inp = h('input', { type: 'checkbox', checked: !!o.value, 'aria-label': o.label });
  inp.addEventListener('change', () => o.onChange && o.onChange(inp.checked));
  const sw = h('label', { class: 'switch' }, inp, h('i'));
  if (o.bare) { sw.dataset.tip = o.tip || ''; sw.dataset.tipTitle = o.label || ''; sw.set = v => inp.checked = !!v; return sw; }
  const row = h('div', { class: 'ctl', title: o.label, tip: o.tip }, h('label', null, o.label), h('div', { class: 'ctl-main' }, sw));
  row.set = v => { inp.checked = !!v; };
  row.get = () => inp.checked;
  return row;
};
/** Color control backed by the custom picker. */
App.color = (o) => {
  let val = o.value || '#ffffff';
  const sw = h('button', { type: 'button', class: 'color-sw', style: { '--c': val }, title: o.label, tip: o.tip, 'aria-label': o.label });
  const hexLbl = h('span', { class: 'mono color-hex' }, val.toUpperCase());
  const set = v => { val = v; sw.style.setProperty('--c', v); hexLbl.textContent = String(v).toUpperCase(); };
  sw.addEventListener('click', () => App.colorPopover(sw, val, {
    onStart: o.onStart, onInput: v => { set(v); o.onInput && o.onInput(v); }, onChange: v => { set(v); o.onChange && o.onChange(v); },
  }));
  const input = { get value() { return val; }, set value(v) { set(v); } };
  sw.set = set; sw.input = input;
  if (o.bare) return sw;
  const row = h('div', { class: 'ctl', title: o.label, tip: o.tip }, h('label', null, o.label), h('div', { class: 'ctl-main' }, sw, hexLbl, o.extra || null));
  row.set = set;
  row.input = input;
  return row;
};
App.seg = (o) => {
  const wrap = h('div', { class: 'seg', role: 'radiogroup' });
  const btns = o.options.map(op => {
    const b = h('button', { type: 'button', title: op.title || op.label, tip: op.tip, key: op.key, class: op.value === o.value ? 'on' : '', role: 'radio' },
      op.icon ? icon(op.icon, op.size || 15) : null, op.label && !op.iconOnly ? op.label : null);
    b.addEventListener('click', () => { wrap.set(op.value); o.onChange && o.onChange(op.value); });
    b._v = op.value;
    wrap.append(b);
    return b;
  });
  wrap.set = v => btns.forEach(b => { b.classList.toggle('on', b._v === v); b.setAttribute('aria-checked', b._v === v); });
  wrap.set(o.value);
  return wrap;
};
App.section = (title, iconName, content, { closed = false, tip, action, id } = {}) => {
  const key = id && 'strata.sec.' + id;
  if (key) { try { const s = localStorage.getItem(key); if (s) closed = s === '1'; } catch {} }
  const s = h('div', { class: 'section' + (closed ? ' closed' : '') });
  const head = h('div', { class: 'section-head', title, tip: tip || 'Click to expand or collapse this group.' },
    iconName ? h('span', { class: 's-ico' }, icon(iconName, 15)) : null, h('span', { class: 's-title' }, title),
    action ? h('span', { class: 's-act' }, action) : null,
    h('span', { class: 'chev' }, icon('chevDown', 14)));
  head.addEventListener('click', e => { if (e.target.closest('.s-act')) return; s.classList.toggle('closed'); if (key) try { localStorage.setItem(key, s.classList.contains('closed') ? '1' : '0'); } catch {} });
  s.append(head, h('div', { class: 'section-body' }, content));
  return s;
};

/* ---------- command palette ---------- */
const fuzzy = (q, s) => {
  q = q.toLowerCase(); s = s.toLowerCase();
  if (!q) return 1;
  const direct = s.indexOf(q);
  if (direct >= 0) return 1000 - direct + (direct === 0 || s[direct - 1] === ' ' ? 200 : 0);
  let si = 0, score = 0, streak = 0;
  for (const ch of q) {
    const i = s.indexOf(ch, si);
    if (i < 0) return 0;
    streak = i === si ? streak + 1 : 0;
    score += 10 + streak * 5 + (i === 0 || s[i - 1] === ' ' ? 15 : 0);
    si = i + 1;
  }
  return score;
};
App.flattenMenus = (menus) => {
  const out = [];
  const add = (items, path) => {
    for (const it of (typeof items === 'function' ? items() : items) || []) {
      if (!it || it.sep || it.head) continue;
      if (it.sub) { add(it.sub, path + ' › ' + it.label); continue; }
      out.push({ label: it.label.replace(/…$/, ''), group: path, icon: it.icon, key: it.key, tip: it.tip, action: it.action, disabled: typeof it.disabled === 'function' ? it.disabled() : it.disabled, checked: typeof it.checked === 'function' ? it.checked() : it.checked });
    }
  };
  for (const m of menus) add(m.items, m.label);
  return out;
};
App.commandPalette = (extra = []) => {
  if (App.modalCount) return;
  const mod = App.modules[App.active];
  const cmds = [...(mod && mod.menus ? App.flattenMenus(mod.menus()) : []), ...extra].filter(c => c.action);
  const input = h('input', { class: 'pal-input', placeholder: 'Type a command…  (e.g. “split”, “export”, “blur”)', spellcheck: 'false' });
  const list = h('div', { class: 'pal-list' });
  let shown = [], sel = 0;
  const render = () => {
    const q = input.value.trim();
    shown = cmds.map(c => ({ c, s: Math.max(fuzzy(q, c.label), fuzzy(q, c.group + ' ' + c.label) * 0.8) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 60).map(x => x.c);
    sel = clamp(sel, 0, Math.max(0, shown.length - 1));
    list.innerHTML = '';
    if (!shown.length) list.append(h('div', { class: 'pal-empty' }, 'No matching command'));
    shown.forEach((c, i) => {
      const row = h('div', { class: 'pal-item' + (i === sel ? ' on' : '') + (c.disabled ? ' disabled' : '') },
        h('span', { class: 'pal-ico' }, icon(c.icon || 'chevRight', 15)),
        h('div', { class: 'pal-txt' }, h('div', { class: 'pal-label' }, c.label, c.checked ? h('span', { class: 'pal-chk' }, ' ✓') : null), c.tip ? h('div', { class: 'pal-tip' }, c.tip) : null),
        h('span', { class: 'pal-group' }, c.group), c.key ? h('kbd', null, c.key) : null);
      row.addEventListener('pointerenter', () => { sel = i; list.querySelectorAll('.pal-item').forEach((r, j) => r.classList.toggle('on', j === i)); });
      row.addEventListener('click', () => run(c));
      list.append(row);
    });
    const on = list.querySelector('.on'); on && on.scrollIntoView({ block: 'nearest' });
  };
  const back = h('div', { class: 'pal-back' }, h('div', { class: 'pal' }, h('div', { class: 'pal-head' }, icon('zoom', 17), input, h('kbd', null, 'Esc')), list));
  const close = () => { back.remove(); App.modalCount--; sfx('close'); };
  const run = c => { if (c.disabled) return App.toast('Not available right now', 'warn'); close(); setTimeout(() => c.action(), 0); };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[sel]) run(shown[sel]); }
  });
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  document.body.append(back);
  App.modalCount++;
  hideTip();
  sfx('open');
  render();
  setTimeout(() => input.focus(), 10);
};

/* ---------- keyboard ---------- */
App.combo = e => {
  let k = e.key.toLowerCase();
  if (k === ' ') k = 'space';
  if (k === '+') k = '=';
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(k);
  return parts.join('+');
};
App.isTyping = (t) => t && t.matches && t.matches('input:not([type=range]):not([type=checkbox]):not([type=color]), textarea, select, [contenteditable="true"]');
// Clicking buttons/toggles shouldn't steal keyboard focus — otherwise Space would re-click them instead of playing.
document.addEventListener('mousedown', e => {
  if (e.target.closest && e.target.closest('button, .switch, .hist-item, .look')) e.preventDefault();
}, true);

/* ---------- misc helpers ---------- */
App.pickFiles = (accept, multiple = true) => new Promise(res => {
  const inp = h('input', { type: 'file', accept, multiple });
  inp.addEventListener('change', () => res(Array.from(inp.files || [])));
  inp.click();
});
App.download = (blob, name) => {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
};
let _ac = null;
App.ac = () => {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (_ac.state === 'suspended') _ac.resume();
  return _ac;
};
App.fmtTime = (t, ms = true) => {
  if (!isFinite(t)) t = 0;
  const neg = t < 0; t = Math.abs(t);
  const m = Math.floor(t / 60), s = t - m * 60;
  const ss = ms ? s.toFixed(3).padStart(6, '0') : String(Math.floor(s)).padStart(2, '0');
  return (neg ? '-' : '') + m + ':' + ss;
};
App.tc = (t, fps = 30) => {
  if (!isFinite(t)) t = 0;
  const f = Math.round(Math.max(0, t) * fps);
  const ff = f % fps, s = Math.floor(f / fps) % 60, m = Math.floor(f / fps / 60) % 60, hh = Math.floor(f / fps / 3600);
  const p = n => String(n).padStart(2, '0');
  return `${p(hh)}:${p(m)}:${p(s)}:${p(ff)}`;
};
App.fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(2) + ' MB' : (b / 1073741824).toFixed(2) + ' GB';
App.fmtDur = s => s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
App.dbToGain = db => Math.pow(10, db / 20);
App.gainToDb = g => 20 * Math.log10(Math.max(1e-9, g));
App.fileDrop = (el, onFiles, { accept } = {}) => {
  let depth = 0;
  el.addEventListener('dragenter', e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); depth++; el.classList.add('dropzone-over'); });
  el.addEventListener('dragover', e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; el.classList.remove('dropzone-over'); } });
  el.addEventListener('drop', e => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); e.stopPropagation(); depth = 0; el.classList.remove('dropzone-over');
    let files = Array.from(e.dataTransfer.files);
    const proj = files.find(f => /\.strata$/i.test(f.name));
    if (proj) return App.openProjectFile(proj);
    if (accept) files = files.filter(f => accept.test(f.type) || accept.test(f.name));
    if (files.length) onFiles(files, e);
  });
};
/** Mouse navigation shared by the video and audio timelines.
    Wheel: zoom at the pointer (or scroll, if Preferences ▸ Interface ▸ Mouse wheel says so) · Ctrl+wheel / pinch: zoom ·
    Shift+wheel or a sideways swipe: scroll left/right · Alt+wheel, or the wheel over the track names: scroll up/down ·
    press the wheel and drag: pan in any direction.
    zoom(factor, clientX) zooms around a point; panX(px) / panY(px) scroll by screen pixels (positive = later / lower).
    zoomOnly: the plain wheel always zooms (e.g. over the audio ruler, which has nothing to scroll). */
App.wheelZooms = () => setting('timelineWheel', 'zoom') !== 'scroll';
// releasing Alt after Alt + wheel must not move keyboard focus to the browser's own menu
let altWheel = false;
document.addEventListener('keydown', e => { if (e.key === 'Alt') altWheel = false; }, true);
document.addEventListener('keyup', e => { if (e.key === 'Alt' && altWheel) { altWheel = false; e.preventDefault(); } }, true);
App.timelineNav = (el, { zoom, panX, panY, heads, zoomOnly = false }) => {
  // wheel steps are gathered and applied once per frame, so free-spinning wheels and trackpads stay smooth
  let acc = null;
  const flush = () => { const a = acc; acc = null; if (a.f !== 1) zoom(a.f, a.cx); if (a.dx) panX(a.dx); if (a.dy) panY(a.dy); };
  const add = (k, v, cx) => {
    if (!acc) { acc = { f: 1, cx, dx: 0, dy: 0 }; requestAnimationFrame(flush); }
    if (k === 'f') { acc.f *= v; acc.cx = cx; } else acc[k] += v;
  };
  el.addEventListener('wheel', e => {
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? el.clientHeight : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    const side = Math.abs(dx) > Math.abs(dy);
    const zoomBy = d => { e.preventDefault(); if (d) add('f', Math.exp(-clamp(d, -300, 300) * 0.0018), e.clientX); };
    if (e.ctrlKey || e.metaKey) return zoomBy(side ? dx : dy);
    if (e.shiftKey) { e.preventDefault(); return add('dx', side ? dx : dy); }
    if (e.altKey) { e.preventDefault(); altWheel = true; return add('dy', side ? dx : dy); }
    if (side) { e.preventDefault(); return add('dx', dx); }
    if (!zoomOnly && (!App.wheelZooms() || (heads && e.target.closest(heads)))) return;   // the browser scrolls up/down
    zoomBy(dy);
  }, { passive: false });
  // middle button: grab and drag the timeline (capture phase, so clips, rulers and markers never see it)
  el.addEventListener('pointerdown', e => {
    if (e.button !== 1) return;
    e.preventDefault(); e.stopPropagation();
    hideTip();
    let lx = e.clientX, ly = e.clientY;
    document.body.classList.add('panning');
    const mv = ev => {
      if (!(ev.buttons & 4)) return up();
      const dx = lx - ev.clientX, dy = ly - ev.clientY;
      lx = ev.clientX; ly = ev.clientY;
      if (dx) panX(dx);
      if (dy) panY(dy);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('blur', up); document.body.classList.remove('panning'); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('blur', up);
  }, true);
  // stops the browser's own middle-click autoscroll
  el.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }, true);
};
/** "Mouse wheel" choice for the timelines' View menus. */
App.wheelMenu = () => ({
  label: 'Mouse wheel', icon: 'zoom', tip: 'What the mouse wheel does over the timeline. Pressing the wheel and dragging always moves the view.',
  sub: () => [
    { label: 'Zooms in and out', checked: App.wheelZooms(), tip: 'Wheel zooms at the mouse pointer. Shift + wheel scrolls left/right, Alt + wheel (or the wheel over the track names) scrolls up/down.', action: () => { App.setSetting('timelineWheel', 'zoom'); App.toast('Mouse wheel zooms the timeline · Shift = sideways, Alt = up/down', 'ok', 3200); } },
    { label: 'Scrolls up and down', checked: !App.wheelZooms(), tip: 'Wheel scrolls through the tracks like a web page. Ctrl + wheel zooms, Shift + wheel scrolls left/right.', action: () => { App.setSetting('timelineWheel', 'scroll'); App.toast('Mouse wheel scrolls the timeline · Ctrl + wheel zooms', 'ok', 3200); } },
  ],
});
App.splitter = (el, { axis = 'y', onDrag }) => {
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('active');
    sfx('grab');
    const s = axis === 'y' ? e.clientY : e.clientX;
    const mv = ev => onDrag((axis === 'y' ? ev.clientY : ev.clientX) - s, ev);
    const up = () => { el.classList.remove('active'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); sfx('drop'); onDrag(null); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  });
};
App.canvas = (w, hgt) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hgt)); return c; };
App.fitCanvas = (cv) => {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(cv.clientWidth * dpr)), ht = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== ht) { cv.width = w; cv.height = ht; }
  return dpr;
};
App.loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
App.hexToRgb = hex => { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
App.rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
App.luma = hex => { const [r, g, b] = App.hexToRgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
App.sleep = ms => new Promise(r => setTimeout(r, ms));
App.cssVar = name => getComputedStyle(document.body).getPropertyValue(name).trim();
/** Theme colours for canvas drawing (cached; refreshed whenever the theme or appearance changes).
 *  ink is an "r,g,b" triplet for overlays: `rgba(${App.th.ink},.1)`. */
App.th = {};
const TH_KEYS = { ink: '--ink', text: '--text', text2: '--text-2', muted: '--muted', dim: '--dim', panel: '--panel', panel2: '--panel-2', well: '--well', bg: '--bg', bg2: '--bg-2', video: '--video', audio: '--audio', image: '--image', mono: '--mono', font: '--font' };
App.readTheme = () => {
  const cs = getComputedStyle(document.body);
  for (const k in TH_KEYS) App.th[k] = cs.getPropertyValue(TH_KEYS[k]).trim();
  App.th.ink = App.th.ink || '255,255,255';
  App.th.light = App.luma(App.th.panel.startsWith('#') ? App.th.panel : '#131419') > 0.5;
};
App.readTheme();
let themeRaf = 0;   // canvases redraw on resize — once per frame, however many appearance changes arrive
App.on('theme', () => { App.readTheme(); if (!themeRaf) themeRaf = requestAnimationFrame(() => { themeRaf = 0; window.dispatchEvent(new Event('resize')); }); });
})();
