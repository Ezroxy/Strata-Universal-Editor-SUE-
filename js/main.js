/* Strata Studio — app shell: top bar, tabs, keyboard routing, welcome, settings, command palette */
(() => {
'use strict';
const App = window.App;
const { h, icon, btn } = App;
const MODES = [
  { id: 'video', label: 'Video', key: 'Alt+1', icon: 'film', tip: 'Multitrack video editor: cut, trim, layer, animate, add titles, transitions and color, then export.' },
  { id: 'audio', label: 'Audio', key: 'Alt+2', icon: 'wave', tip: 'Multitrack audio editor: record, cut, clean up noise, EQ, effects, loudness and mastering.' },
  { id: 'image', label: 'Image', key: 'Alt+3', icon: 'image', tip: 'Layered photo editor with paint tools, selections, masks, adjustments and filters.' },
];
const inited = {};
App.active = null;
const LOGO = `<svg width="26" height="26" viewBox="0 0 32 32"><g transform="skewX(-12) translate(4 0)"><rect x="2" y="5" width="22" height="6" rx="3" fill="#ff7849"/><rect x="4" y="13" width="22" height="6" rx="3" fill="#35d6b4"/><rect x="6" y="21" width="22" height="6" rx="3" fill="#a08aff"/></g></svg>`;
const logoNode = () => { const t = document.createElement('template'); t.innerHTML = LOGO; return t.content.firstChild; };

let savePill = null;
function buildTopbar() {
  const bar = document.getElementById('topbar');
  const brand = h('div', { class: 'brand', title: 'Home', tip: 'Open the welcome screen.' }, logoNode(), h('span', null, 'Strata', h('em', null, 'Studio')));
  brand.addEventListener('click', showWelcome);
  const tabs = h('nav', { class: 'tabs', role: 'tablist' });
  for (const m of MODES) {
    const b = h('button', { class: 'tab', role: 'tab', dataset: { mode: m.id }, title: m.label + ' editor', tip: m.tip, key: m.key }, h('span', { class: 'dot' }), h('span', { class: 'lbl' }, m.label));
    b.addEventListener('click', () => App.setMode(m.id));
    App.xfer.tab(b, m.id);   // hold a drag here to switch editors, drop to send it there
    tabs.append(b);
  }
  savePill = h('div', { class: 'save-pill', title: 'Autosave', tip: 'Your work is saved automatically in this browser and restored next time you open Strata Studio. Use File ▸ Save project to keep a portable copy.' }, h('i'), h('span', null, 'Saved'));
  const tipsBtn = h('button', { class: 'tb-pill' + (App.tipsEnabled ? ' on' : ''), title: 'Hover explainers', tip: 'Turns these little explanation bubbles on or off.' }, icon('bubble', 15), 'Tips');
  tipsBtn.addEventListener('click', () => { App.setTips(!App.tipsEnabled); tipsBtn.classList.toggle('on', App.tipsEnabled); App.toast('Hover explainers ' + (App.tipsEnabled ? 'on' : 'off')); });
  App.on('setting', k => { if (k === 'tips') tipsBtn.classList.toggle('on', App.tipsEnabled); });
  const cmdBtn = h('button', { class: 'tb-pill', title: 'Command palette', key: 'Ctrl+K', tip: 'Search and run any command in the current editor by typing its name.' }, icon('command', 14), 'Commands', h('kbd', null, 'Ctrl K'));
  cmdBtn.addEventListener('click', () => openPalette());
  const keysBtn = h('button', { class: 'tb-pill', title: 'Keyboard shortcuts', key: '?', tip: 'Shows every shortcut for the current editor.' }, icon('keyboard', 15));
  keysBtn.addEventListener('click', showShortcuts);
  const themeBtn = h('button', { class: 'tb-pill', title: 'Theme', tip: 'Switch between the 15 themes (Frutiger Aero, Windows XP, Skeuomorphic, Synthwave, Film Noir…). More choices in Preferences ▸ Appearance.' }, icon('theme', 15));
  themeBtn.addEventListener('click', () => { const r = themeBtn.getBoundingClientRect(); App.openMenu(r.right, r.bottom + 6, themeMenu(), 0, true); });
  const setBtn = h('button', { class: 'tb-pill', title: 'Preferences', key: 'Ctrl+,', tip: 'Themes, UI sounds, fonts, explainers, autosave, editor defaults and storage.' }, icon('settings', 15));
  setBtn.addEventListener('click', () => showSettings());
  bar.append(brand, tabs, h('div', { class: 'tb-right' }, savePill, cmdBtn, tipsBtn, keysBtn, themeBtn, setBtn));
}
function updatePill() {
  if (!savePill) return;
  const s = App.saveState[App.active] || 'saved';
  savePill.className = 'save-pill ' + s;
  savePill.lastChild.textContent = !App.settings.autosave ? 'Autosave off' : { dirty: 'Unsaved changes', saving: 'Saving…', saved: 'All changes saved', error: 'Save failed' }[s];
}
App.on('save-status', (mod) => { if (mod === App.active) updatePill(); });
const themeMenu = () => [
  { head: 'Theme' },
  ...App.THEMES.map(t => ({ label: t.name, checked: () => (App.settings.theme || 'dark') === t.id, tip: t.desc, action: () => App.setTheme(t.id) })),
  { sep: true },
  { label: (App.settings.sounds !== false ? 'Turn off' : 'Turn on') + ' UI sounds', icon: 'sound', tip: 'Interface sounds for clicks, toggles, windows and notifications.', action: () => { const v = App.settings.sounds === false; App.setSetting('sounds', v); App.toast('UI sounds ' + (v ? 'on' : 'off')); if (v) App.sound('on', 0.5, { force: true }); } },
  { label: 'Appearance & sounds…', icon: 'settings', tip: 'Accent colour, interface font, roundness, transparency, density and sound packs.', action: () => showSettings('appearance') },
];

App.setMode = id => {
  if (App.active === id) return;
  App.endDrags();
  const prev = App.active && App.modules[App.active];
  if (prev && prev.hide) prev.hide();
  if (App.active) App.sound && App.sound('switch', MODES.findIndex(m => m.id === id) / 2);
  App.active = id;
  document.body.dataset.mode = id;
  document.querySelectorAll('.tab').forEach(t => { t.classList.toggle('on', t.dataset.mode === id); t.setAttribute('aria-selected', t.dataset.mode === id); });
  const mod = App.modules[id];
  if (mod && !inited[id]) {
    inited[id] = true;
    try { mod.init(); } catch (e) { console.error(e); App.toast('Failed to start the ' + id + ' editor: ' + e.message, 'err', 6000); }
  }
  if (mod && mod.show) mod.show();
  try { localStorage.setItem('strata.mode', id); } catch {}
  App.closeMenus();
  App.closePopover();
  updatePill();
};

/* ---------- command palette ---------- */
function globalCommands() {
  return [
    ...MODES.map(m => ({ label: `Go to ${m.label} editor`, group: 'Navigate', icon: m.icon, key: m.key, tip: m.tip, action: () => App.setMode(m.id) })),
    { label: 'Open project file', group: 'File', icon: 'folder', tip: 'Open a .strata project saved from any editor.', action: () => App.openProjectFile() },
    { label: 'Preferences', group: 'App', icon: 'settings', key: 'Ctrl+,', tip: 'Themes, sounds, fonts, explainers, autosave and editor defaults.', action: () => showSettings() },
    { label: 'Change theme…', group: 'App', icon: 'theme', tip: 'Pick one of the 15 themes with live previews.', action: () => showSettings('appearance') },
    ...App.THEMES.map(t => ({ label: 'Theme: ' + t.name, group: 'Theme', icon: 'theme', tip: t.desc, checked: (App.settings.theme || 'dark') === t.id, action: () => App.setTheme(t.id) })),
    { label: (App.settings.sounds !== false ? 'Turn off' : 'Turn on') + ' UI sounds', group: 'App', icon: 'sound', tip: 'Interface sounds for clicks, toggles, windows and notifications.', action: () => App.setSetting('sounds', App.settings.sounds === false) },
    { label: 'Fonts', group: 'App', icon: 'font', tip: 'Preview the bundled game fonts and add your own font files.', action: () => showSettings('fonts') },
    { label: 'Keyboard shortcuts', group: 'App', icon: 'keyboard', key: '?', tip: 'All shortcuts for this editor.', action: showShortcuts },
    { label: 'Welcome screen', group: 'App', icon: 'home', tip: 'The start screen with all three editors.', action: showWelcome },
    { label: (App.tipsEnabled ? 'Hide' : 'Show') + ' hover explainers', group: 'App', icon: 'bubble', tip: 'Toggle the explanation bubbles.', action: () => App.setTips(!App.tipsEnabled) },
  ];
}
const openPalette = () => App.commandPalette(globalCommands());

/* ---------- shortcuts ---------- */
function showShortcuts() {
  const mod = App.modules[App.active];
  const grid = h('div', { class: 'shortcut-grid' });
  const groups = [...(mod && mod.shortcuts || []), ['Global', [['Ctrl + K', 'Command palette'], ['Alt + 1 / 2 / 3', 'Switch to Video / Audio / Image'], ['Ctrl + ,', 'Settings'], ['Ctrl + Alt + = / - / 0', 'Interface bigger / smaller / 100%'], ['?', 'This list']]]];
  const search = h('input', { class: 'field wide', placeholder: 'Filter shortcuts…', style: { height: '32px', fontSize: '12px', fontFamily: 'var(--font)' } });
  const render = () => {
    const q = search.value.toLowerCase();
    grid.innerHTML = '';
    for (const [title, rows] of groups) {
      const r = rows.filter(([k, d]) => !q || k.toLowerCase().includes(q) || d.toLowerCase().includes(q));
      if (!r.length) continue;
      grid.append(h('h4', null, title));
      for (const [k, d] of r) grid.append(h('div', { class: 'sc' }, h('span', null, d), h('kbd', null, k)));
    }
  };
  search.addEventListener('input', render);
  search.addEventListener('keydown', e => e.stopPropagation());
  render();
  App.modal({ title: `${App.active[0].toUpperCase() + App.active.slice(1)} editor shortcuts`, icon: 'keyboard', width: 660, body: h('div', null, h('div', { style: { padding: '0 18px 4px' } }, search), grid) });
}
App.showShortcuts = showShortcuts;

/* ---------- settings: the Preferences window lives in core/prefs.js ---------- */
const showSettings = (section) => App.showPrefs(section);

/* ---------- welcome: one screen per theme, see core/welcome.js and js/welcome/ ---------- */
const showWelcome = () => App.showWelcome();
App.openPalette = openPalette;

/* ---------- drags that lose their release ----------
   Editors follow a drag with pointermove/pointerup listeners on the window. If the button is let go where the
   page never hears it (outside the window, or the system takes over the pointer), the drag would stay live and
   keep steering its editor — even from another tab (e.g. a playhead drag restarting the video when you click
   Play in the Audio editor). So: end every open drag on pointercancel, when the window loses focus, and when
   switching editors. Only drags in progress listen for pointerup on the window, so nothing else reacts. */
App.endDrags = () => dispatchEvent(new PointerEvent('pointerup'));
addEventListener('pointercancel', App.endDrags);
addEventListener('blur', App.endDrags);

/* ---------- keyboard routing ---------- */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !App.modalCount) { e.preventDefault(); openPalette(); return; }
  // Interface size (Ctrl+Alt+= / - / 0) works everywhere, even with a window open
  if (!App.isTyping(e.target) && App.uiScaleKey && App.uiScaleKey(e)) return;
  if (App.modalCount > 0) return;
  if (App.isTyping(e.target)) return;
  if (e.target.matches && e.target.matches('input[type=range]') && /^(arrow|page|home|end)/i.test(e.key)) return;
  if (e.altKey && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); App.setMode(MODES[+e.key - 1].id); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); showSettings(); return; }
  if (e.key === '?') { e.preventDefault(); showShortcuts(); return; }
  const mod = App.modules[App.active];
  if (mod && mod.onKey) mod.onKey(e);
});
document.addEventListener('keyup', e => {
  const mod = App.modules[App.active];
  if (mod && mod.onKeyUp) mod.onKeyUp(e);
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  const f = Array.from(e.dataTransfer.files || []).find(x => /\.strata$/i.test(x.name));
  if (f) App.openProjectFile(f);
});
/** Save every opened editor right now (used on page unload and by the desktop app before its window closes). */
App.flushAll = () => Promise.all(Object.keys(App.modules).map(id => { const m = App.modules[id]; if (!inited[id] || !m.flushSave) return null; try { return m.flushSave(); } catch { return null; } }));
window.addEventListener('beforeunload', () => { App.flushAll(); });

/* ---------- boot ---------- */
buildTopbar();
let start = App.settings.startMode && App.settings.startMode !== 'last' ? App.settings.startMode : 'video';
if (!App.settings.startMode || App.settings.startMode === 'last') try { start = localStorage.getItem('strata.mode') || 'video'; } catch {}
if (!App.modules[start]) start = 'video';
App.setMode(start);
const wl = App.settings.welcome || 'always';
if (wl === 'always' || (wl === 'first' && !App.settings.welcomeSeen)) setTimeout(showWelcome, 250);
App.loadUserFonts && App.loadUserFonts();
// warm up the extracted game fonts so titles/text render in them immediately when picked
setTimeout(() => (App.GAME_FONTS || []).forEach(f => App.ensureFont(f.family)), 1200);
})();
