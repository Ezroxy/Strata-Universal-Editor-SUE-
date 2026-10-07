/* Welcome screen — Classic 98: a teal desktop with pixel icons, a "Welcome to Strata 98" window (drag it by its
   title bar) and a working taskbar with a Start menu and a clock. Double-click an icon, pick an item in the window,
   or use the Start menu. Shut Down… continues to Strata. */
(() => {
const App = window.App;
/* 32×32 pixel icons drawn with rectangles: [x, y, w, h, colour] */
const px = (cells, s = 32) => `<svg viewBox="0 0 32 32" width="${s}" height="${s}" shape-rendering="crispEdges">${cells.map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`).join('')}</svg>`;
const ICONS = {
  folder: px([[2, 8, 12, 3, '#000'], [3, 9, 10, 2, '#fde68a'], [2, 10, 28, 19, '#000'], [3, 11, 26, 17, '#facc15'], [3, 11, 26, 2, '#fef08a'], [3, 26, 26, 2, '#b45309'], [27, 11, 2, 17, '#ca8a04']]),
  video: px([[4, 10, 20, 15, '#000'], [5, 11, 18, 13, '#6b7280'], [5, 11, 18, 2, '#9ca3af'], [7, 14, 6, 6, '#000'], [8, 15, 4, 4, '#1e3a8a'], [9, 16, 2, 2, '#93c5fd'], [16, 14, 5, 2, '#e5e7eb'], [24, 13, 6, 9, '#000'], [25, 14, 4, 7, '#374151'], [6, 4, 6, 6, '#000'], [7, 5, 4, 4, '#d1d5db'], [14, 4, 6, 6, '#000'], [15, 5, 4, 4, '#d1d5db'], [8, 6, 2, 2, '#000'], [16, 6, 2, 2, '#000'], [6, 25, 4, 3, '#000'], [18, 25, 4, 3, '#000']]),
  audio: px([[6, 4, 14, 24, '#000'], [7, 5, 12, 22, '#d6d3d1'], [7, 5, 12, 2, '#f5f5f4'], [9, 8, 8, 8, '#000'], [10, 9, 6, 6, '#57534e'], [12, 11, 2, 2, '#000'], [10, 19, 6, 6, '#000'], [11, 20, 4, 4, '#78716c'], [22, 6, 2, 12, '#000'], [24, 6, 4, 2, '#000'], [26, 8, 2, 2, '#000'], [20, 16, 4, 4, '#000'], [21, 17, 2, 2, '#0e7490'], [26, 14, 2, 10, '#000'], [24, 22, 4, 4, '#000'], [25, 23, 2, 2, '#0e7490']]),
  image: px([[3, 5, 26, 21, '#000'], [4, 6, 24, 19, '#fff'], [4, 6, 24, 9, '#7dd3fc'], [20, 8, 4, 4, '#fde047'], [4, 15, 24, 10, '#22c55e'], [4, 19, 24, 6, '#15803d'], [9, 12, 2, 3, '#14532d'], [8, 14, 4, 2, '#14532d'], [20, 18, 2, 10, '#000'], [21, 18, 1, 8, '#a16207'], [19, 26, 4, 3, '#000'], [20, 26, 2, 2, '#dc2626'], [24, 21, 6, 5, '#000'], [25, 22, 4, 3, '#a855f7']]),
  keys: px([[2, 9, 28, 15, '#000'], [3, 10, 26, 13, '#c0c0c0'], [3, 10, 26, 1, '#fff'], [5, 12, 3, 3, '#fff'], [9, 12, 3, 3, '#fff'], [13, 12, 3, 3, '#fff'], [17, 12, 3, 3, '#fff'], [21, 12, 3, 3, '#fff'], [25, 12, 2, 3, '#fff'], [5, 16, 3, 3, '#fff'], [9, 16, 14, 3, '#fff'], [24, 16, 3, 3, '#fff'], [5, 20, 22, 1, '#808080']]),
  dos: px([[2, 5, 28, 22, '#000'], [3, 6, 26, 3, '#000080'], [3, 9, 26, 17, '#000'], [5, 12, 2, 2, '#c0c0c0'], [8, 12, 2, 2, '#c0c0c0'], [11, 12, 4, 2, '#c0c0c0'], [16, 12, 4, 2, '#c0c0c0'], [5, 17, 2, 2, '#c0c0c0'], [8, 18, 4, 1, '#c0c0c0']]),
  power: px([[6, 6, 20, 20, '#000'], [7, 7, 18, 18, '#c0c0c0'], [15, 9, 2, 8, '#b91c1c'], [11, 12, 2, 8, '#b91c1c'], [19, 12, 2, 8, '#b91c1c'], [12, 20, 8, 2, '#b91c1c'], [12, 11, 2, 2, '#b91c1c'], [18, 11, 2, 2, '#b91c1c']]),
};
const SM = s => s.replace(/width="32" height="32"/, 'width="16" height="16"');
App.WELCOMES.classic = {
  css: `
.wl-classic { background: #008080; color: #000; font: 11px 'Pixelated MS Sans Serif', 'MS Sans Serif', 'Microsoft Sans Serif', Tahoma, sans-serif; --bo: inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf; --bi: inset -1px -1px #ffffff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px #808080; }
.wl-classic .w9-desk { position: absolute; left: 10px; top: 10px; bottom: 40px; display: flex; flex-direction: column; flex-wrap: wrap; align-content: flex-start; gap: 14px 6px; }
.wl-classic .w9-ic { width: 76px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 2px; color: #fff; text-align: center; background: none; border: 0; }
.wl-classic .w9-ic span { padding: 1px 3px; line-height: 13px; }
.wl-classic .w9-ic.w9-sel span { background: #000080; outline: 1px dotted #ffff00; }
.wl-classic .w9-ic.w9-sel svg { filter: drop-shadow(0 0 0 #000080) brightness(.6) sepia(1) hue-rotate(190deg) saturate(4); }
.wl-classic .w9-win { position: absolute; left: max(50%, calc(98px + min(700px, 100vw - 120px) / 2)); top: 46%; width: min(700px, 100vw - 120px); transform: translate(-50%, -50%); background: #c0c0c0; box-shadow: var(--bo); padding: 3px; animation: w9-open .28s steps(4) both; }
@keyframes w9-open { from { clip-path: inset(48% 48% 48% 48%); } }
.wl-classic .w9-title { height: 20px; display: flex; align-items: center; gap: 4px; padding: 0 2px 0 4px; background: linear-gradient(90deg, #000080, #1084d0); color: #fff; font-weight: 700; cursor: default; }
.wl-classic .w9-title .w9-t { flex: 1; }
.wl-classic .w9-tb { width: 16px; height: 14px; background: #c0c0c0; box-shadow: var(--bo); border: 0; padding: 0; display: grid; place-items: center; font: 700 10px/1 'Marlett', Tahoma, sans-serif; color: #000; }
.wl-classic .w9-tb:active { box-shadow: var(--bi); }
.wl-classic .w9-body { display: grid; grid-template-columns: 210px 1fr; gap: 0; margin-top: 3px; height: min(360px, 100vh - 150px); }
.wl-classic .w9-list { background: #000; padding: 22px 10px 10px; display: flex; flex-direction: column; gap: 8px; box-shadow: var(--bi); }
.wl-classic .w9-item { display: flex; align-items: center; gap: 8px; padding: 4px 6px; color: #fff; background: none; border: 0; text-align: left; font: 700 12px Tahoma, sans-serif; }
.wl-classic .w9-item svg { flex: none; }
.wl-classic .w9-item:hover, .wl-classic .w9-item.w9-sel { color: #ffff00; text-decoration: underline; }
.wl-classic .w9-item .w9-arrow { width: 0; height: 0; border: 5px solid transparent; border-left-color: #00ff00; visibility: hidden; margin-left: -4px; }
.wl-classic .w9-item.w9-sel .w9-arrow { visibility: visible; }
.wl-classic .w9-pane { position: relative; background: linear-gradient(135deg, #000080 0%, #0c1a6e 45%, #000 100%); color: #fff; padding: 22px 26px; box-shadow: var(--bi); overflow: hidden; }
.wl-classic .w9-wel { font: 400 18px Tahoma, sans-serif; color: #c0c0ff; }
.wl-classic .w9-big { display: flex; align-items: center; gap: 12px; margin-top: 2px; font: 700 44px/1.05 'Franklin Gothic Medium', Tahoma, sans-serif; letter-spacing: -.01em; background: linear-gradient(100deg, #fff 0 40%, #ffff9a 46%, #fff 52% 100%) 0 0 / 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: w9-sweep 5s 1s linear infinite; }
.wl-classic .w9-big i { font-style: normal; color: #ffcc00; -webkit-text-fill-color: #ffcc00; }
@keyframes w9-sweep { from { background-position: 100% 0; } to { background-position: -100% 0; } }
.wl-classic .w9-logo { display: inline-flex; animation: w9-fly .9s .2s steps(9) both; }
@keyframes w9-fly { from { transform: translate(-60px, 30px) scale(.4); opacity: 0; } }
.wl-classic .w9-txt { margin-top: 18px; font: 400 13px/1.55 Tahoma, sans-serif; color: #e6e6ff; min-height: 150px; }
.wl-classic .w9-txt b { display: block; font-size: 15px; color: #fff; margin-bottom: 6px; }
.wl-classic .w9-txt ul { margin: 8px 0 0; padding-left: 18px; color: #ccd; }
.wl-classic .w9-btn { min-width: 86px; height: 24px; padding: 0 10px; background: #c0c0c0; color: #000; border: 0; box-shadow: var(--bo); font: 11px Tahoma, sans-serif; }
.wl-classic .w9-btn:active { box-shadow: var(--bi); }
.wl-classic .w9-btn:focus-visible { outline: 1px dotted #000; outline-offset: -5px; }
.wl-classic .w9-open { position: absolute; right: 26px; bottom: 20px; }
.wl-classic .w9-foot { display: flex; align-items: center; justify-content: space-between; padding: 8px 4px 4px; }
.wl-classic .w9-foot .wl-startup { gap: 6px; }
.wl-classic .w9-task { position: absolute; left: 0; right: 0; bottom: 0; height: 30px; background: #c0c0c0; box-shadow: inset 0 1px #dfdfdf, inset 0 2px #fff; display: flex; align-items: center; gap: 4px; padding: 2px 2px 0; z-index: 5; }
.wl-classic .w9-start { height: 22px; display: flex; align-items: center; gap: 3px; padding: 0 6px 0 3px; font: 700 11px Tahoma, sans-serif; background: #c0c0c0; border: 0; box-shadow: var(--bo); }
.wl-classic .w9-start.w9-on { box-shadow: var(--bi); }
.wl-classic .w9-sep { width: 2px; height: 22px; box-shadow: inset 1px 0 #808080, inset -1px 0 #fff; margin: 0 2px; }
.wl-classic .w9-ql { display: flex; gap: 2px; }
.wl-classic .w9-ql button { width: 22px; height: 22px; display: grid; place-items: center; background: none; border: 0; padding: 0; }
.wl-classic .w9-ql button:hover { box-shadow: var(--bo); }
.wl-classic .w9-taskbtn { height: 22px; min-width: 160px; display: flex; align-items: center; gap: 4px; padding: 0 6px; font: 700 11px Tahoma; background: #c0c0c0; border: 0; box-shadow: var(--bi); background-image: repeating-conic-gradient(#fff 0 25%, #c0c0c0 0 50%); background-size: 2px 2px; }
.wl-classic .w9-tray { margin-left: auto; height: 22px; display: flex; align-items: center; gap: 6px; padding: 0 10px; box-shadow: inset -1px -1px #fff, inset 1px 1px #808080; font: 11px Tahoma; }
.wl-classic .w9-menu { position: absolute; left: 2px; bottom: 28px; z-index: 6; display: none; background: #c0c0c0; box-shadow: var(--bo); padding: 3px; }
.wl-classic .w9-menu.w9-on { display: flex; animation: w9-slide .12s steps(3) both; }
@keyframes w9-slide { from { clip-path: inset(100% 0 0 0); } }
.wl-classic .w9-band { width: 22px; background: linear-gradient(0deg, #000080, #1084d0); color: #c0c0c0; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px; }
.wl-classic .w9-band span { writing-mode: vertical-rl; transform: rotate(180deg); font: 700 17px Tahoma, sans-serif; letter-spacing: .02em; }
.wl-classic .w9-band b { color: #fff; }
.wl-classic .w9-mi { display: flex; flex-direction: column; min-width: 200px; }
.wl-classic .w9-mi button { display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 22px 0 6px; background: none; border: 0; font: 11px Tahoma; text-align: left; }
.wl-classic .w9-mi button:hover, .wl-classic .w9-mi button:focus-visible { background: #000080; color: #fff; outline: none; }
.wl-classic .w9-mi hr { border: 0; height: 2px; margin: 2px 2px; box-shadow: inset 0 1px #808080, inset 0 -1px #fff; }
`,
  build(root, api) {
    const M = api.modes;
    const ITEMS = [
      ...M.map(m => ({ pick: m.id, icon: ICONS[m.id], label: m.name + ' editor', title: m.name, desc: m.desc, pts: m.pts, tip: m.tip, key: m.key })),
      { act: 'open', icon: ICONS.folder, label: 'Open a project', title: 'Open a project', desc: 'Load a .strata project file you saved earlier. It brings back the timeline, tracks or layers exactly as you left them.', pts: ['Works with files from all three editors', 'You can also drop a file onto the window'], tip: api.actions[0].tip },
      { act: 'shortcuts', icon: ICONS.keys, label: 'Keyboard shortcuts', title: 'Keyboard shortcuts', desc: 'Every keyboard shortcut for the editor you are in, in one searchable list.', pts: ['Press ? any time to see it again', 'Ctrl+K finds any command by name'], tip: api.actions[2].tip, key: '?' },
    ];
    const logo = api.logo(40, M.map(m => m.color === '#000080' ? '#1084d0' : m.color));
    root.innerHTML = `
      <div class="w9-desk">
        ${M.map(m => `<button class="w9-ic" data-icon="${m.id}"${api.tip(m.name, 'Double-click to open the ' + m.name + ' editor. ' + m.tip, m.key)}>${ICONS[m.id]}<span>${m.name}</span></button>`).join('')}
        <button class="w9-ic" data-icon="open"${api.tip('My Projects', 'Double-click to open a .strata project file.')}>${ICONS.folder}<span>My Projects</span></button>
        <button class="w9-ic" data-icon="palette"${api.tip('Command Prompt', 'Double-click to open the command palette and run any command by name.', 'Ctrl+K')}>${ICONS.dos}<span>Commands</span></button>
      </div>
      <div class="w9-win" role="group" aria-label="Welcome to Strata 98">
        <div class="w9-title">${SM(ICONS.image)}<span class="w9-t">Welcome</span>
          <button class="w9-tb" data-act="shortcuts"${api.tip('Help', 'Show the keyboard shortcuts.', '?')}>?</button>
          <button class="w9-tb" data-act="close"${api.tip('Close', 'Close the welcome screen.', 'Esc')}>✕</button></div>
        <div class="w9-body">
          <div class="w9-list">${ITEMS.map((it, i) => `<button class="w9-item" data-i="${i}"${api.tip(it.title, it.tip, it.key)}><span class="w9-arrow"></span>${SM(it.icon)}${it.label}</button>`).join('')}</div>
          <div class="w9-pane"><div class="w9-wel">Welcome to</div><div class="w9-big"><span class="w9-logo">${logo}</span>Strata <i>98</i></div>
            <div class="w9-txt"></div>
            <button class="w9-btn w9-open"></button></div>
        </div>
        <div class="w9-foot"><span class="w9-su"></span><button class="w9-btn" data-act="close"${api.tip('Close', 'Close the welcome screen and keep working.', 'Esc')}>Close</button></div>
      </div>
      <div class="w9-menu"><div class="w9-band"><span><b>Strata</b>98</span></div><div class="w9-mi">
        ${M.map(m => `<button data-pick="${m.id}"${api.tip(m.name + ' editor', m.tip, m.key)}>${ICONS[m.id]}${m.name}</button>`).join('')}<hr>
        ${api.actions.map(a => `<button data-act="${a.id}"${api.tip(a.label, a.tip, a.key)}>${SM(ICONS[{ open: 'folder', palette: 'dos', shortcuts: 'keys', prefs: 'folder' }[a.id]]).replace('width="16" height="16"', 'width="24" height="24"')}${a.label}</button>`).join('')}<hr>
        <button data-act="close"${api.tip('Shut Down', 'Close the welcome screen and go to Strata Studio.', 'Esc')}>${ICONS.power}Shut Down…</button></div></div>
      <div class="w9-task">
        <button class="w9-start"${api.tip('Start', 'Open the Start menu: editors, projects, commands and settings.')}>${api.logo(16, M.map(m => m.color === '#000080' ? '#1084d0' : m.color))}Start</button>
        <span class="w9-sep"></span>
        <span class="w9-ql">${M.map(m => `<button data-pick="${m.id}"${api.tip(m.name + ' editor', m.tip, m.key)}>${SM(ICONS[m.id])}</button>`).join('')}</span>
        <span class="w9-sep"></span>
        <button class="w9-taskbtn" tabindex="-1">${SM(ICONS.image)}Welcome</button>
        <span class="w9-tray">${SM(ICONS.audio)}<span class="w9-clock"></span></span>
      </div>`;
    root.querySelector('.w9-su').append(api.startup('Show this screen each time Strata starts'));
    const win = root.querySelector('.w9-win'), txt = root.querySelector('.w9-txt'), openBtn = root.querySelector('.w9-open');
    const items = [...root.querySelectorAll('.w9-item')], menu = root.querySelector('.w9-menu'), start = root.querySelector('.w9-start');
    let sel = 0;
    const select = i => {
      sel = i; const it = ITEMS[i];
      items.forEach((b, k) => b.classList.toggle('w9-sel', k === i));
      txt.innerHTML = `<b>${it.title}</b>${it.desc}<ul>${it.pts.map(p => `<li>${p}</li>`).join('')}</ul>`;
      openBtn.textContent = it.pick ? `Open ${it.title}` : it.act === 'open' ? 'Browse…' : 'Show';
      openBtn.removeAttribute('data-pick'); openBtn.removeAttribute('data-act');
      if (it.pick) openBtn.dataset.pick = it.pick; else openBtn.dataset.act = it.act;
    };
    items.forEach((b, i) => { b.addEventListener('pointerenter', () => select(i)); b.addEventListener('focus', () => select(i)); b.addEventListener('click', () => (ITEMS[i].pick ? api.choose(ITEMS[i].pick) : api.run(ITEMS[i].act))); });
    select(0);
    // desktop icons: click selects, double-click opens
    root.querySelectorAll('.w9-ic').forEach(ic => {
      ic.addEventListener('click', () => root.querySelectorAll('.w9-ic').forEach(o => o.classList.toggle('w9-sel', o === ic)));
      ic.addEventListener('dblclick', () => { const id = ic.dataset.icon; if (M.some(m => m.id === id)) api.choose(id); else api.run(id); });
      ic.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ic.dispatchEvent(new MouseEvent('dblclick')); } });
    });
    // Start menu
    const toggleMenu = on => { menu.classList.toggle('w9-on', on); start.classList.toggle('w9-on', on); if (on) api.sound('menu'); };
    start.addEventListener('click', e => { e.stopPropagation(); toggleMenu(!menu.classList.contains('w9-on')); });
    api.on(root, 'pointerdown', e => { if (!e.target.closest('.w9-menu, .w9-start')) toggleMenu(false); });
    // drag the window by its title bar
    const title = root.querySelector('.w9-title');
    title.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const r = win.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      win.style.transform = 'none'; win.style.left = r.left + 'px'; win.style.top = r.top + 'px';
      const mv = ev => { win.style.left = Math.max(-r.width + 80, Math.min(innerWidth - 80, ev.clientX - ox)) + 'px'; win.style.top = Math.max(0, Math.min(innerHeight - 60, ev.clientY - oy)) + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    const clock = root.querySelector('.w9-clock');
    const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }; tick(); api.every(5000, tick);
    return {
      key(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { items[(sel + (e.key === 'ArrowDown' ? 1 : ITEMS.length - 1)) % ITEMS.length].focus(); return true; }
        if (e.key === 'Escape' && menu.classList.contains('w9-on')) { toggleMenu(false); return true; }
        if ((e.key === 'Meta' || e.key === 'OS')) { toggleMenu(!menu.classList.contains('w9-on')); return true; }
        return false;
      },
    };
  },
};
})();
