/* Strata Studio — Preferences window (Ctrl+,): themes and appearance, UI sounds, interface behaviour,
   saving, per-editor defaults, fonts (including your own) and storage. Every option applies immediately. */
(() => {
'use strict';
const App = window.App;
const { h, icon, btn } = App;
const S = () => App.settings;
const set = (k, v) => App.setSetting(k, v);

/* appearance settings re-style the app as soon as they change */
const LOOK = new Set(['theme', 'accentMode', 'accentColor', 'uiFont', 'roundness', 'transparency', 'density', 'themeEffects', 'reduceMotion', 'checker', 'checkerSize']);
App.on('setting', k => { if (LOOK.has(k)) App.applyLook(App.settings); });
App.setTheme = id => {
  const go = () => set('theme', id);
  if (!document.startViewTransition || S().reduceMotion || document.hidden) return go();
  // a new switch (e.g. clicking through the theme gallery) aborts the running fade — expected, so don't report it
  const t = document.startViewTransition(go);
  for (const p of [t.ready, t.finished, t.updateCallbackDone]) p.catch(() => {});
};
/** the theme's own roundness / transparency, read from its CSS */
const themeDefault = (id, prop) => {
  const probe = h('div', { dataset: { theme: id }, style: { display: 'none' } });
  document.body.append(probe);
  const v = parseFloat(getComputedStyle(probe).getPropertyValue(prop));
  probe.remove();
  return isFinite(v) ? v : 1;
};

/* ---------- small building blocks ---------- */
const group = (title, ...kids) => h('div', { class: 'pref-group' }, title ? h('h4', null, title) : null, ...kids);
const note = (...t) => h('div', { class: 'pref-note' }, ...t);
const row = (label, tip, ...ctl) => h('div', { class: 'ctl pref-row', title: label, tip }, h('label', null, label), h('div', { class: 'ctl-main' }, ...ctl));
const toggle = (label, key, tip, after) => App.toggle({ label, value: !!S()[key], tip, onChange: v => { set(key, v); after && after(v); } });
const seg = (key, options, after) => App.seg({ value: S()[key], options, onChange: v => { set(key, v); after && after(v); } });
const LOGO = `<svg width="54" height="54" viewBox="0 0 32 32"><g transform="skewX(-12) translate(4 0)"><rect x="2" y="5" width="22" height="6" rx="3" fill="#ff7849"/><rect x="4" y="13" width="22" height="6" rx="3" fill="#35d6b4"/><rect x="6" y="21" width="22" height="6" rx="3" fill="#a08aff"/></g></svg>`;

/* ---------- live theme preview: a miniature of the real UI rendered in the theme's own CSS ---------- */
function mock(id) {
  const range = (v) => h('input', { type: 'range', min: 0, max: 100, value: v, tabindex: -1, style: { '--p': v + '%' } });
  const r = (label, ctl) => h('div', { class: 'ctl' }, h('label', null, label), h('div', { class: 'ctl-main' }, ctl));
  const clip = (cls, left, width, name) => h('div', { class: 'clip ' + cls, style: { left: left + 'px', width: width + 'px' } }, h('div', { class: 'c-label' }, name));
  return h('div', { class: 'theme-mini', dataset: { theme: id }, 'aria-hidden': 'true' },
    h('div', { class: 'topbar' },
      h('div', { class: 'brand', html: LOGO.replace(/54/g, '22') }, h('span', null, 'Strata', h('em', null, 'Studio'))),
      h('div', { class: 'tabs' }, ['video', 'audio', 'image'].map((m, i) => h('span', { class: 'tab' + (i ? '' : ' on'), dataset: { mode: m } }, h('span', { class: 'dot' }), h('span', null, ['Video', 'Audio', 'Image'][i])))),
      h('div', { class: 'tb-right' }, h('span', { class: 'save-pill' }, h('i'), h('span', null, 'Saved')), h('span', { class: 'tb-pill on' }, 'Tips'))),
    h('div', { class: 'tm-grid' },
      h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('span', { class: 'panel-title' }, 'Inspector')),
        h('div', { class: 'tm-rows' }, r('Opacity', range(72)), r('Scale', range(38)),
          r('Snap', h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: true, tabindex: -1 }), h('i'))),
          h('div', { class: 'tm-btns' }, h('span', { class: 'btn solid txt' }, 'Cancel'), h('span', { class: 'btn primary txt' }, 'Export')))),
      h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('span', { class: 'panel-title' }, 'Timeline'), h('div', { class: 'grow' }), h('span', { class: 'btn on sm' }, icon('magnet', 14)), h('span', { class: 'btn sm' }, icon('scissors', 14))),
        h('div', { class: 'tm-tl' },
          h('div', { class: 'tm-lane' }, clip('k-text', 70, 120, 'Title')),
          h('div', { class: 'tm-lane' }, clip('k-video sel', 0, 170, 'interview.mp4'), clip('k-image', 174, 110, 'logo.png')),
          h('div', { class: 'tm-lane' }, clip('k-audio', 0, 290, 'voice.wav')),
          h('i', { class: 'tm-ph' })))));
}

/* =====================================================================
   Sections
   ===================================================================== */
function appearance() {
  const cur = S().theme || 'dark';
  const gallery = h('div', { class: 'theme-grid' }, App.THEMES.map(t => {
    const card = h('div', { class: 'theme-card' + (t.id === cur ? ' on' : ''), role: 'button', tabindex: 0, title: t.name, tip: t.desc + ' Click to switch — your work stays exactly as it is.', dataset: { id: t.id } },
      h('div', { class: 'tc-prev' }, mock(t.id)),
      h('div', { class: 'tc-meta' }, h('b', null, t.name, h('span', { class: 'tc-check' }, icon('check', 13, 3))), h('span', null, t.desc)));
    const pick = () => { App.setTheme(t.id); gallery.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('on', c === card)); refreshDefaults(); };
    card.addEventListener('click', pick);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    return card;
  }));

  // accent
  const accentColor = App.color({ label: 'Colour', value: S().accentColor || '#ff7849', tip: 'The single accent colour used everywhere.', onInput: v => App.applyLook({ ...S(), accentMode: 'custom', accentColor: v }), onChange: v => set('accentColor', v) });
  const swatches = h('div', { class: 'pref-swatches' }, ['#ff7849', '#ff4f7b', '#ffb547', '#f5d90a', '#43d68b', '#35d6b4', '#2fb7ff', '#4f7cff', '#a08aff', '#e05cff', '#ffffff'].map(c => {
    const b = h('button', { type: 'button', style: { background: c }, title: c, 'aria-label': c });
    b.addEventListener('click', () => { accentColor.set(c); set('accentColor', c); });
    return b;
  }));
  const accentExtra = h('div', null, accentColor, h('div', { class: 'ctl' }, h('label', null, ''), h('div', { class: 'ctl-main' }, swatches)));
  const showAccent = () => { accentExtra.style.display = S().accentMode === 'custom' ? '' : 'none'; };
  const accentSeg = seg('accentMode', [
    { value: 'theme', label: 'Theme colours', tip: 'Each editor keeps its own colour from the theme (e.g. orange video, teal audio, violet image).' },
    { value: 'custom', label: 'One colour', tip: 'Use one accent colour of your choice in all three editors.' }], showAccent);
  showAccent();

  // roundness / transparency follow the theme until you move them
  const roundRow = App.slider({ label: 'Corner roundness', min: 0, max: 200, step: 5, unit: '%', noReset: true, value: 100, tip: 'From square corners (0%) to extra-round (200%).',
    onInput: v => App.applyLook({ ...S(), roundness: v / 100 }), onChange: v => { set('roundness', v / 100); refreshDefaults(); } });
  const glassRow = App.slider({ label: 'Transparency', min: 0, max: 80, step: 1, unit: '%', noReset: true, value: 0, tip: 'See-through panels that softly blur the background behind them (a "glass" look). 0% is solid.',
    onInput: v => App.applyLook({ ...S(), transparency: v }), onChange: v => { set('transparency', v); refreshDefaults(); } });
  const resetBtn = (key, label) => btn({ icon: 'undo', cls: 'sm', title: 'Use theme default', tip: `Go back to the ${label} the theme was designed with.`, onClick: () => { set(key, null); refreshDefaults(); } });
  const roundReset = resetBtn('roundness', 'corner roundness'), glassReset = resetBtn('transparency', 'transparency');
  roundRow.querySelector('.ctl-main').append(roundReset);
  glassRow.querySelector('.ctl-main').append(glassReset);
  function refreshDefaults() {
    const id = S().theme || 'dark';
    roundRow.set(Math.round((S().roundness ?? themeDefault(id, '--round')) * 100));
    glassRow.set(Math.round(S().transparency ?? (1 - App.themeById(id).alpha) * 100));
    roundReset.style.visibility = S().roundness == null ? 'hidden' : '';
    glassReset.style.visibility = S().transparency == null ? 'hidden' : '';
  }
  refreshDefaults();

  const fontSel = App.select({ label: 'Interface font', value: S().uiFont || 'theme', tip: 'The typeface used for menus, buttons and labels. "Theme default" lets each theme choose (e.g. Tahoma for XP, typewriter faces for Film Noir).',
    options: [...App.UI_FONTS.map(([v, l, stack]) => [v, l, stack ? { fontFamily: stack } : null]), ...((App.userFonts || []).length ? [{ group: 'Your fonts', options: App.userFonts.map(f => [f.family, f.family, { fontFamily: `"${f.family}"` }]) }] : [])],
    onChange: v => set('uiFont', v) });

  return [
    group('Theme', note('Pick a look. Each theme comes with its own matching set of UI sounds (see ', h('a', { href: '#', onclick: e => { e.preventDefault(); open('sounds'); } }, 'Sounds'), ').'), gallery,
      h('div', { class: 'pref-inline' }, btn({ icon: 'dice', label: 'Surprise me', cls: 'solid txt sm', title: 'Random theme', tip: 'Switches to a random theme.', onClick: () => {
        const others = App.THEMES.filter(t => t.id !== S().theme); const t = others[Math.floor(Math.random() * others.length)];
        gallery.querySelector(`[data-id="${t.id}"]`).click(); gallery.querySelector(`[data-id="${t.id}"]`).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } }))),
    group('Colour & type',
      h('div', { class: 'ctl', title: 'Accent colour', tip: 'The highlight colour of buttons, sliders, selections and the playhead.' }, h('label', null, 'Accent'), accentSeg), accentExtra, fontSel),
    group('Shape & density', roundRow, glassRow,
      h('div', { class: 'ctl', title: 'Density', tip: 'How much space buttons, rows and menus take up.' }, h('label', null, 'Density'), seg('density', [
        { value: 'compact', label: 'Compact', tip: 'Smaller controls — more room for your timeline, waveforms and canvas.' },
        { value: 'normal', label: 'Normal', tip: 'The standard size.' },
        { value: 'comfy', label: 'Comfortable', tip: 'Larger controls and text — easier to hit and read.' }])),
      toggle('Theme effects', 'themeEffects', 'Decorative extras some themes add: CRT scanlines (Terminal), film grain (Film Noir), stitched leather (Skeuomorphic) and the blinking cursor. Turn off for a cleaner look.')),
  ];
}

function sounds() {
  const packList = h('div', { class: 'pack-list' });
  const demo = id => {
    const pack = id === 'theme' ? App.themeById(S().theme).pack : id;
    const steps = [['click'], ['select'], ['on'], ['tick', 0.2], ['tick', 0.45], ['tick', 0.7], ['open'], ['drop'], ['success']];
    steps.forEach(([n, v], i) => setTimeout(() => App.sound(n, v ?? 0.5, { force: true, pack }), i * 190));
  };
  const renderPacks = () => {
    packList.innerHTML = '';
    const curPack = S().soundPack || 'theme';
    const themePack = App.SOUND_PACKS.find(p => p.id === App.themeById(S().theme).pack) || App.SOUND_PACKS[0];
    for (const p of [{ id: 'theme', name: 'Match the theme', desc: `Currently “${themePack.name}” — changes automatically when you switch themes.` }, ...App.SOUND_PACKS]) {
      const r = h('div', { class: 'pack' + (p.id === curPack ? ' on' : ''), role: 'button', tabindex: 0, title: p.name, tip: p.desc + ' Click to use it; press ▶ to hear a sample.' },
        h('span', { class: 'pack-radio' }), h('div', { class: 'pack-txt' }, h('b', null, p.name), h('span', null, p.desc)),
        btn({ icon: 'play', cls: 'sm', title: 'Preview', tip: 'Plays a short sample of this pack: click, toggle, slider ticks, a window opening, a drop and a success chime.', onClick: e => { e.stopPropagation(); demo(p.id); } }));
      r.addEventListener('click', () => { set('soundPack', p.id); renderPacks(); demo(p.id); });
      packList.append(r);
    }
  };
  renderPacks();
  const cats = S().soundCats || {};
  const catRows = App.SOUND_CATS.map(c => {
    const t = App.toggle({ label: c.label, value: cats[c.id] !== false, tip: c.tip, onChange: v => { set('soundCats', { ...(S().soundCats || {}), [c.id]: v }); } });
    t.querySelector('.ctl-main').append(btn({ icon: 'play', cls: 'sm', title: 'Test', tip: 'Play an example of this kind of sound.', onClick: () => c.events.slice(0, 2).forEach((e, i) => setTimeout(() => App.sound(e, 0.6, { force: true }), i * 220)) }));
    return t;
  });
  const vol = App.slider({ label: 'Volume', min: 0, max: 100, step: 1, unit: '%', value: S().soundVolume ?? 55, def: 55, tip: 'How loud UI sounds are. They stay well below your media either way.',
    onInput: v => { set('soundVolume', v); App.sound('tick', v / 100, { force: true }); }, onChange: v => set('soundVolume', v) });
  return [
    group('UI sounds',
      note('Every click, toggle and window can make a small sound. They are synthesized live — no audio files — and each theme has its own pack.'),
      App.toggle({ label: 'Play UI sounds', value: S().sounds !== false, tip: 'Turn all interface sounds on or off.', onChange: v => { set('sounds', v); if (v) App.sound('on', 0.5, { force: true }); } }),
      vol,
      toggle('Quiet while playing', 'soundQuiet', 'Mute interface sounds while your video or audio is playing or recording, so they never get in the way of listening.')),
    group('Sound pack', packList),
    group('What makes a sound', ...catRows),
  ];
}

function interfaceSec() {
  const delay = App.seg({ value: S().tipDelay <= 200 ? 'quick' : S().tipDelay >= 700 ? 'relaxed' : 'normal', onChange: v => set('tipDelay', { quick: 150, normal: 420, relaxed: 800 }[v]), options: [
    { value: 'quick', label: 'Quick', tip: 'Bubbles appear almost instantly.' }, { value: 'normal', label: 'Normal', tip: 'A short pause before bubbles appear.' }, { value: 'relaxed', label: 'Relaxed', tip: 'Bubbles only appear when you linger.' }] });
  return [
    group('Explainers',
      App.toggle({ label: 'Hover explainers', value: S().tips, tip: 'Show a small explanation bubble when hovering any control.', onChange: v => App.setTips(v) }),
      h('div', { class: 'ctl', title: 'Explainer delay', tip: 'How long to hover before the bubble appears.' }, h('label', null, 'Delay'), delay)),
    group('Notifications',
      h('div', { class: 'ctl', title: 'Position', tip: 'Where the little status messages pop up.' }, h('label', null, 'Position'), seg('toastPos', [
        { value: 'bottom', label: 'Bottom', tip: 'Bottom centre of the window.' }, { value: 'bottom-right', label: 'Bottom right', tip: 'Bottom-right corner.' },
        { value: 'top', label: 'Top', tip: 'Just under the top bar.' }, { value: 'top-right', label: 'Top right', tip: 'Top-right corner.' }], () => App.toast('Notifications will appear here', 'ok'))),
      h('div', { class: 'ctl', title: 'Duration', tip: 'How long messages stay on screen (hovering one keeps it open).' }, h('label', null, 'Duration'), seg('toastTime', [
        { value: 'short', label: 'Short', tip: 'Messages disappear quickly.' }, { value: 'normal', label: 'Normal', tip: 'The standard time.' }, { value: 'long', label: 'Long', tip: 'Messages stay almost twice as long.' }]))),
    group('Start-up & motion',
      App.select({ label: 'Welcome screen', value: S().welcome || 'always', tip: 'When the welcome screen with the three editors appears. Each theme has its own welcome screen.', options: [['first', 'First launch only'], ['always', 'Every time Strata starts'], ['never', 'Never']], onChange: v => set('welcome', v) }),
      App.select({ label: 'Start in', value: S().startMode || 'last', tip: 'Which editor is open when Strata Studio starts.', options: [['last', 'The editor I used last'], ['video', 'Video'], ['audio', 'Audio'], ['image', 'Image']], onChange: v => set('startMode', v) }),
      toggle('Reduce motion', 'reduceMotion', 'Turns off animations and transitions, including the cross-fade when switching themes.'),
      h('div', { class: 'pref-inline' }, btn({ icon: 'home', label: 'Show welcome screen', cls: 'solid txt sm', title: 'Welcome screen', tip: 'Open the welcome screen now.', onClick: () => { close(); App.showWelcome(); } }),
        btn({ icon: 'keyboard', label: 'Keyboard shortcuts', cls: 'solid txt sm', title: 'Shortcuts', key: '?', tip: 'Every shortcut for the current editor.', onClick: () => { close(); App.showShortcuts(); } }))),
  ];
}

function projects() {
  const nv = S().newVideo || {}, ni = S().newImage || {};
  const updPill = () => App.emit('save-status', App.active);
  return [
    group('Autosave',
      App.toggle({ label: 'Autosave', value: S().autosave, tip: 'Continuously saves every editor’s work in this browser so nothing is lost if you close the window.', onChange: v => { set('autosave', v); updPill(); App.toast(v ? 'Autosave on' : 'Autosave off — use File ▸ Save project to keep your work', v ? 'ok' : 'warn'); } }),
      h('div', { class: 'ctl', title: 'Save delay', tip: 'How soon after a change your work is saved. Relaxed saves less often, which can feel smoother on huge projects.' }, h('label', null, 'Save after'), seg('autosaveSpeed', [
        { value: 'quick', label: 'Quick', tip: 'Saves within about half a second of each change.' }, { value: 'normal', label: 'Normal', tip: 'Saves a second or two after you stop editing.' }, { value: 'relaxed', label: 'Relaxed', tip: 'Waits about five seconds — fewer saves on very large projects.' }])),
      h('div', { class: 'ctl', title: 'Undo history', tip: 'How many steps Ctrl+Z can go back in each editor. More steps use more memory.' }, h('label', null, 'Undo steps'), seg('undoSize', [
        { value: 'small', label: 'Fewer', tip: 'Half the usual history — saves memory on modest PCs.' }, { value: 'normal', label: 'Normal', tip: 'Video 200, audio 80, image 50 steps.' }, { value: 'large', label: 'More', tip: '2.5× the usual history — great with plenty of RAM.' }]))),
    group('New video projects',
      App.select({ label: 'Frame size', value: `${nv.w || 1920}x${nv.h || 1080}`, tip: 'The frame size new video projects start with. (Importing a video into an empty project still adopts that video’s size.)', options: [
        ['1920x1080', 'Full HD 1920 × 1080 (16:9)'], ['1280x720', 'HD 1280 × 720 (16:9)'], ['2560x1440', 'QHD 2560 × 1440 (16:9)'], ['3840x2160', '4K UHD 3840 × 2160 (16:9)'],
        ['1080x1920', 'Vertical 1080 × 1920 (9:16) — Shorts, Reels, TikTok'], ['1080x1350', 'Portrait 1080 × 1350 (4:5)'], ['1080x1080', 'Square 1080 × 1080 (1:1)']],
        onChange: v => { const [w, hh] = v.split('x').map(Number); set('newVideo', { ...(S().newVideo || {}), w, h: hh }); } }),
      App.select({ label: 'Frame rate', value: String(nv.fps || 30), tip: 'Frames per second for new video projects.', options: [['24', '24 fps — film'], ['25', '25 fps — PAL / Europe'], ['30', '30 fps — web & phones'], ['50', '50 fps'], ['60', '60 fps — smooth motion & games']],
        onChange: v => set('newVideo', { ...(S().newVideo || {}), fps: +v }) })),
    group('New images',
      App.select({ label: 'Size', value: `${ni.w || 1280}x${ni.h || 800}`, tip: 'The size pre-filled in the New image dialog and used for the very first canvas.', options: [
        ['1280x800', '1280 × 800'], ['1920x1080', '1920 × 1080 (Full HD)'], ['1080x1080', '1080 × 1080 (square post)'], ['1080x1920', '1080 × 1920 (story)'], ['1024x1024', '1024 × 1024'], ['800x600', '800 × 600'], ['3000x2000', '3000 × 2000 (photo)'], ['2480x3508', '2480 × 3508 (A4 at 300 dpi)']],
        onChange: v => { const [w, hh] = v.split('x').map(Number); set('newImage', { ...(S().newImage || {}), w, h: hh }); } }),
      h('div', { class: 'ctl', title: 'Background', tip: 'What new canvases start filled with.' }, h('label', null, 'Background'), App.seg({ value: ni.bg || 'white', onChange: v => set('newImage', { ...(S().newImage || {}), bg: v }), options: [
        { value: 'white', label: 'White', tip: 'A white canvas.' }, { value: 'transparent', label: 'Transparent', tip: 'An empty, see-through canvas.' }, { value: 'black', label: 'Black', tip: 'A black canvas.' }] }))),
  ];
}

function videoSec() {
  const V = App.V, O = V && V.ops;
  return [
    group('Playback',
      App.select({ label: 'Preview', value: S().previewQuality, tip: 'Lower preview quality makes playback smoother on big projects. Exports are always full quality.', options: [['auto', 'Auto'], ['full', 'Full'], ['half', 'Half'], ['quarter', 'Quarter']], onChange: v => set('previewQuality', v) }),
      toggle('Audio scrubbing', 'scrub', 'Hear short snippets of audio while dragging the playhead.')),
    group('Editing',
      toggle('Snapping on at start', 'snapDefault', 'Whether clips and the playhead snap to cuts and markers when the editor opens (toggle any time with N).', v => { if (V) { V.snap = v; V.tl && V.tl.snapBtn && V.tl.snapBtn.setOn(v); } }),
      toggle('Ripple editing on at start', 'rippleDefault', 'Whether deleting or trimming closes the gap automatically when the editor opens.', v => { if (V) { V.ripple = v; V.tl && V.tl.rippleBtn && V.tl.rippleBtn.setOn(v); } }),
      App.slider({ label: 'Still length', min: 1, max: 20, step: 0.5, unit: 's', value: S().stillDur || 5, def: 5, tip: 'How long images, titles and colour mattes last when you add them.', onChange: v => set('stillDur', v) }),
      h('div', { class: 'ctl', title: 'Track height', tip: 'How tall timeline tracks are. Taller tracks show bigger thumbnails and waveforms.' }, h('label', null, 'Track height'), App.seg({ value: String(V ? V.trackScale : 1), options: [
        { value: '0.75', label: 'Compact', tip: 'More tracks fit on screen.' }, { value: '1', label: 'Normal', tip: 'The standard height.' }, { value: '1.5', label: 'Tall', tip: 'Big thumbnails and waveforms.' }],
        onChange: v => { if (O && O.setTrackScale) O.setTrackScale(+v); else try { localStorage.setItem('strata.trackScale', v); } catch {} } }))),
  ];
}

function sidePanelToggle(mod, key, label, tip) {
  const root = document.getElementById('mod-' + mod);
  let on = true;
  try { on = localStorage.getItem(key) !== '1'; } catch {}
  return App.toggle({ label, value: on, tip, onChange: v => {
    const m = App.modules[mod];
    if (root && root.childElementCount && m && m.toggleSide) { if (root.classList.contains('no-side') === v) m.toggleSide(); }
    else try { localStorage.setItem(key, v ? '0' : '1'); } catch {}
  } });
}
function audioSec() {
  return [
    group('Tracks',
      h('div', { class: 'ctl', title: 'New tracks show', tip: 'How newly imported or recorded tracks are displayed. You can switch any track from its menu.' }, h('label', null, 'New tracks'), seg('audioView', [
        { value: 'wave', label: 'Waveform', tip: 'Loudness over time — best for editing.' }, { value: 'spec', label: 'Spectrogram', tip: 'A frequency heat-map — reveals hum, hiss and harsh sounds.' }])),
      toggle('Snap to zero crossings', 'zeroSnapDefault', 'Start with selection edges snapping to points where the waveform crosses zero, which avoids clicks at cuts.', v => { if (App.A) App.A.zeroSnap = v; }),
      sidePanelToggle('audio', 'strata.a.noside', 'Effects panel', 'Show the effects rack on the right. Hide it for more waveform room.')),
  ];
}
function imageSec() {
  const I = App.I;
  const view = () => { let v = {}; try { v = JSON.parse(localStorage.getItem('strata.i.view') || '{}'); } catch {} return I && I.view ? I.view : Object.assign({ grid: false, gridSize: 64, rulers: false, pixelGrid: true }, v); };
  const setView = (k, val) => { const v = view(); v[k] = val; if (I && I.saveView) I.saveView(); else try { localStorage.setItem('strata.i.view', JSON.stringify(v)); } catch {} };
  const vt = (label, k, tip) => App.toggle({ label, value: !!view()[k], tip, onChange: val => setView(k, val) });
  return [
    group('Canvas',
      h('div', { class: 'ctl', title: 'Transparency checkerboard', tip: 'The pattern shown where an image is see-through.' }, h('label', null, 'Checkerboard'), seg('checker', [
        { value: 'light', label: 'Light', tip: 'White and light grey (the classic).' }, { value: 'dark', label: 'Dark', tip: 'Dark greys — easier on the eyes in dark themes.' }, { value: 'contrast', label: 'Contrast', tip: 'Strong grey and white — see transparency at a glance.' }])),
      h('div', { class: 'ctl', title: 'Checker size', tip: 'How big the checkerboard squares are.' }, h('label', null, 'Square size'), App.seg({ value: String(S().checkerSize || 16), onChange: v => set('checkerSize', +v), options: [
        { value: '8', label: 'Small', tip: '8-pixel squares.' }, { value: '16', label: 'Medium', tip: '16-pixel squares.' }, { value: '28', label: 'Large', tip: '28-pixel squares.' }] })),
      vt('Pixel grid when zoomed', 'pixelGrid', 'Outline every pixel at 800% zoom and above — handy for pixel art.'),
      vt('Rulers', 'rulers', 'Pixel rulers along the top and left edges (Ctrl+R).'),
      App.select({ label: 'Grid spacing', value: String(view().gridSize || 64), tip: 'Distance between grid lines (View ▸ Grid, Ctrl+\') in image pixels.', options: [['8', '8 px'], ['16', '16 px'], ['32', '32 px'], ['64', '64 px'], ['100', '100 px'], ['128', '128 px']], onChange: v => setView('gridSize', +v) }),
      sidePanelToggle('image', 'strata.i.noside', 'Side panel', 'Show the Layers / Adjust / History panel. Hide it for more canvas room.')),
  ];
}

function fonts() {
  const sample = h('input', { class: 'field wide', value: 'Strata Studio — The quick brown fox 0123', title: 'Preview text', tip: 'Type anything to preview it in every font.' });
  sample.addEventListener('keydown', e => e.stopPropagation());
  const list = h('div', { class: 'font-list' });
  const asUi = fam => { set('uiFont', fam); App.toast(`Interface font: ${fam}`, 'ok'); };
  const fontRow = (fam, meta, extra) => h('div', { class: 'font-row' },
    h('div', { class: 'font-sample', style: { fontFamily: `"${fam}"` } }, sample.value),
    h('div', { class: 'font-meta' }, h('b', null, fam), h('span', null, meta)),
    btn({ icon: 'text', label: 'Use for interface', cls: 'sm txt', title: 'Use for interface', tip: `Show menus, buttons and labels in ${fam}. Switch back under Appearance ▸ Interface font.`, onClick: () => asUi(fam) }), extra);
  const render = () => {
    list.innerHTML = '';
    const games = {};
    (App.GAME_FONTS || []).forEach(g => (games[g.game] = games[g.game] || []).push(g));
    for (const [game, fs] of Object.entries(games)) {
      list.append(h('h5', null, game));
      fs.forEach(g => { App.ensureFont(g.family); list.append(fontRow(g.family, g.style)); });
    }
    list.append(h('h5', null, 'Your fonts'));
    if (!App.userFonts.length) list.append(note('No fonts added yet. Add .ttf, .otf, .woff or .woff2 files — they appear in the title and text tools of the video and image editors, and stay available offline.'));
    App.userFonts.forEach(f => list.append(fontRow(f.family, `${f.file || 'Imported font'} · ${App.fmtBytes(f.size || 0)}`,
      btn({ icon: 'trash', cls: 'sm danger', title: 'Remove font', tip: 'Removes this font from Strata Studio. Titles and text layers that use it fall back to another font.', onClick: async () => { await App.removeUserFont(f.family); render(); } }))));
  };
  sample.addEventListener('input', () => list.querySelectorAll('.font-sample').forEach(s => { s.textContent = sample.value || 'Aa'; }));
  render();
  App.on('fonts-changed', () => { if (list.isConnected) render(); });
  return [
    group('Fonts', note('Fonts available in the video title tool and the image text tool. Preview any text below.'), sample,
      h('div', { class: 'pref-inline' }, btn({ icon: 'plus', label: 'Add font files…', cls: 'primary txt sm', title: 'Add fonts', tip: 'Import your own .ttf, .otf, .woff or .woff2 fonts. They are stored in this browser (or the desktop app) and work offline.', onClick: async () => {
        const files = await App.pickFiles('.ttf,.otf,.woff,.woff2,font/*', true);
        if (!files.length) return;
        let n = 0;
        for (const f of files) { try { await App.addUserFont(f); n++; } catch (e) { App.toast(`${f.name}: ${e.message || 'not a usable font'}`, 'err', 5000); } }
        if (n) App.toast(`Added ${n} font${n > 1 ? 's' : ''}`, 'ok');
        render();
      } })), list),
    group('About the game fonts', note('The GTA San Andreas and L.A. Noire typefaces were traced from the game files and belong to Rockstar Games. They are included for personal use only — keep that in mind before sharing the desktop app or publishing work that uses them.')),
  ];
}

function storage() {
  const usage = h('div', { class: 'pref-usage' }, h('div', { class: 'progress' }, h('i')), h('div', { class: 'prog-meta' }, h('span', null, 'Measuring…'), h('span')));
  const counts = h('div', { class: 'pref-counts' });
  const measure = async () => {
    try {
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
      if (est) {
        usage.querySelector('.progress i').style.width = Math.min(100, est.usage / Math.max(1, est.quota) * 100).toFixed(2) + '%';
        usage.querySelector('.prog-meta').firstChild.textContent = `${App.fmtBytes(est.usage || 0)} used`;
        usage.querySelector('.prog-meta').lastChild.textContent = `${App.fmtBytes(est.quota || 0)} available · ${persisted ? 'protected from automatic clean-up' : 'may be cleared if the disk runs low'}`;
      }
      const keys = await App.store.keys();
      const n = p => keys.filter(k => typeof k === 'string' && k.startsWith(p)).length;
      counts.innerHTML = '';
      [['Video', 'video:', 'film'], ['Audio', 'audio:', 'wave'], ['Image', 'image:', 'image'], ['Fonts', 'font:', 'font']].forEach(([l, p, ic]) => counts.append(h('div', null, icon(ic, 15), h('b', null, l), h('span', null, `${n(p)} item${n(p) === 1 ? '' : 's'}`))));
    } catch (e) { usage.querySelector('.prog-meta').firstChild.textContent = 'Storage information is not available here.'; }
  };
  measure();
  const clearPrefix = async (label, prefix) => {
    if (!(await App.confirm('Clear ' + label, `Delete the autosaved ${label.toLowerCase()} from this ${window.__strataDesktop ? 'computer' : 'browser'}? Open editors keep their current content until you reload. This can’t be undone.`, 'Delete', true))) return;
    if (prefix) await App.store.prune(prefix, new Set()); else await App.store.clear();
    App.emit('store-cleared'); App.toast(label + ' cleared', 'ok'); measure();
  };
  const exportPrefs = () => { const blob = new Blob([JSON.stringify({ app: 'strata-studio', kind: 'preferences', saved: new Date().toISOString(), settings: App.settings }, null, 2)], { type: 'application/json' }); App.download(blob, 'strata-preferences.json'); App.toast('Preferences exported', 'ok'); };
  const importPrefs = async () => {
    const [f] = await App.pickFiles('.json,application/json', false); if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const s = j && j.settings; if (!s || typeof s !== 'object') throw new Error('This file doesn’t contain Strata preferences');
      for (const [k, v] of Object.entries(s)) if (k in App.SETTING_DEFAULTS) set(k, v);
      App.applyLook(App.settings); App.toast('Preferences imported', 'ok'); open('storage');
    } catch (e) { App.toast(e.message || 'Could not read that file', 'err', 5000); }
  };
  const resetPrefs = async () => {
    if (!(await App.confirm('Reset preferences', 'Put every preference (theme, sounds, defaults…) back to how Strata Studio ships? Your projects are not touched.', 'Reset', true))) return;
    for (const [k, v] of Object.entries(App.SETTING_DEFAULTS)) if (k !== 'welcomeSeen') set(k, v);
    App.applyLook(App.settings); App.toast('Preferences reset', 'ok'); open('storage');
  };
  return [
    group('Saved work', note(`Autosaved projects live ${window.__strataDesktop ? 'in %LOCALAPPDATA%\\StrataStudio on this computer' : 'in this browser’s storage on this computer'}. Nothing is uploaded anywhere.`), usage, counts,
      h('div', { class: 'pref-inline' },
        btn({ icon: 'film', label: 'Clear video', cls: 'solid txt sm', title: 'Clear video', tip: 'Delete the autosaved video project and its media copies.', onClick: () => clearPrefix('Video work', 'video:') }),
        btn({ icon: 'wave', label: 'Clear audio', cls: 'solid txt sm', title: 'Clear audio', tip: 'Delete the autosaved audio project.', onClick: () => clearPrefix('Audio work', 'audio:') }),
        btn({ icon: 'image', label: 'Clear images', cls: 'solid txt sm', title: 'Clear images', tip: 'Delete the autosaved image documents.', onClick: () => clearPrefix('Image work', 'image:') }),
        btn({ icon: 'trash', label: 'Clear everything', cls: 'solid danger txt sm', title: 'Clear everything', tip: 'Delete all autosaved work and imported fonts.', onClick: () => clearPrefix('All saved work', null) }))),
    group('Preferences backup', note('Save your preferences to a file to move them to another computer, or start over.'),
      h('div', { class: 'pref-inline' },
        btn({ icon: 'download', label: 'Export…', cls: 'solid txt sm', title: 'Export preferences', tip: 'Download all preferences as a small .json file.', onClick: exportPrefs }),
        btn({ icon: 'upload', label: 'Import…', cls: 'solid txt sm', title: 'Import preferences', tip: 'Load preferences from a .json file exported earlier.', onClick: importPrefs }),
        btn({ icon: 'undo', label: 'Reset all preferences', cls: 'solid danger txt sm', title: 'Reset preferences', tip: 'Back to the original theme, sounds and defaults. Your work is kept.', onClick: resetPrefs }))),
  ];
}

function about() {
  const logo = h('div', { class: 'about-logo', html: LOGO });
  return [
    h('div', { class: 'about' }, logo, h('div', null, h('h2', null, 'Strata ', h('em', null, 'Studio')),
      h('p', null, 'Video, audio and image editing — together, private and ' + (window.__strataDesktop ? 'fully offline.' : 'right in your browser.')),
      h('p', { class: 'pref-note' }, `${App.THEMES.length} themes · ${App.SOUND_PACKS.length} sound packs · ${(App.GAME_FONTS || []).length} game fonts · no tracking, no uploads.`))),
    group('Handy shortcuts', h('div', { class: 'about-keys' }, [['Ctrl + ,', 'Preferences'], ['Ctrl + K', 'Command palette'], ['?', 'All shortcuts'], ['Alt + 1 / 2 / 3', 'Video / Audio / Image'], ['Ctrl + Shift + S', 'Remove silences']].map(([k, d]) => h('div', null, h('kbd', null, k), h('span', null, d))))),
  ];
}

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'theme', build: appearance, keys: 'theme colour color accent font typeface roundness corners transparency glass density compact effects dark light' },
  { id: 'sounds', label: 'Sounds', icon: 'sound', build: sounds, keys: 'sound audio click volume pack mute beep quiet' },
  { id: 'interface', label: 'Interface', icon: 'sliders2', build: interfaceSec, keys: 'tips explainers tooltips delay notifications toast welcome start motion animation' },
  { id: 'projects', label: 'Projects & saving', icon: 'save', build: projects, keys: 'autosave save undo history resolution frame rate fps new image size background' },
  { id: 'video', label: 'Video', icon: 'film', build: videoSec, keys: 'preview quality scrub snap ripple still title duration track height timeline' },
  { id: 'audio', label: 'Audio', icon: 'wave', build: audioSec, keys: 'waveform spectrogram zero crossing effects panel' },
  { id: 'image', label: 'Image', icon: 'image', build: imageSec, keys: 'checkerboard transparency pixel grid rulers side panel canvas' },
  { id: 'fonts', label: 'Fonts', icon: 'font', build: fonts, keys: 'font typeface import ttf otf gta san andreas noire' },
  { id: 'storage', label: 'Storage & backup', icon: 'database', build: storage, keys: 'storage clear delete export import reset backup disk' },
  { id: 'about', label: 'About', icon: 'info', build: about, keys: 'about version' },
];

/* =====================================================================
   Window
   ===================================================================== */
let md = null, content = null, nav = null, current = 'appearance';
function open(id) {
  current = SECTIONS.find(s => s.id === id) ? id : current;
  if (!md) return;
  nav.querySelectorAll('.pref-nav-item').forEach(n => n.classList.toggle('on', n.dataset.id === current));
  const sec = SECTIONS.find(s => s.id === current);
  content.innerHTML = '';
  content.append(h('h3', { class: 'pref-title' }, icon(sec.icon, 18), sec.label), ...sec.build());
  content.scrollTop = 0;
  try { localStorage.setItem('strata.prefs.sec', current); } catch {}
}
const close = () => md && md.close();
App.showPrefs = (id) => {
  if (md && !md.el.isConnected) md = null;
  if (md) { open(id); return; }
  try { current = id || localStorage.getItem('strata.prefs.sec') || 'appearance'; } catch { current = id || 'appearance'; }
  const search = h('input', { class: 'field wide pref-search', placeholder: 'Search preferences…', spellcheck: 'false', title: 'Search', tip: 'Type a word like “sound”, “font” or “autosave” to find the right page.' });
  nav = h('div', { class: 'pref-nav' }, search, SECTIONS.map(s => {
    const it = h('div', { class: 'pref-nav-item', role: 'button', tabindex: 0, dataset: { id: s.id }, title: s.label, tip: 'Settings for: ' + s.keys.split(' ').slice(0, 6).join(', ') + '…', tipPos: 'right' }, icon(s.icon, 16), h('span', null, s.label));
    it.addEventListener('click', () => open(s.id));
    it.addEventListener('keydown', e => { if (e.key === 'Enter') open(s.id); });
    return it;
  }));
  search.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { const first = nav.querySelector('.pref-nav-item:not(.hidden)'); first && open(first.dataset.id); } if (e.key === 'Escape') close(); });
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let first = null;
    nav.querySelectorAll('.pref-nav-item').forEach(n => {
      const s = SECTIONS.find(x => x.id === n.dataset.id), hit = !q || (s.label + ' ' + s.keys).toLowerCase().includes(q);
      n.classList.toggle('hidden', !hit);
      if (hit && !first) first = s.id;
    });
    if (q && first && first !== current) open(first);
  });
  content = h('div', { class: 'pref-content' });
  md = App.modal({ title: 'Preferences', icon: 'settings', width: 980, cls: 'prefs-modal', body: h('div', { class: 'prefs' }, nav, content),
    left: h('span', { class: 'hint', style: { padding: 0 } }, 'Changes apply instantly and are remembered.'),
    buttons: [{ label: 'Done', primary: true, tip: 'Close Preferences.' }],
    onClose: () => { md = null; } });
  open(current);
};
App.showSettings = App.showPrefs;

/* =====================================================================
   Your own fonts — stored in IndexedDB under font:<family>
   ===================================================================== */
const famFromFile = name => name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim() || 'My font';
async function registerFont(rec) {
  const face = new FontFace(rec.family, await rec.blob.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  if (!App.userFonts.find(f => f.family === rec.family)) App.userFonts.push({ family: rec.family, file: rec.file, size: rec.blob.size, face });
}
App.addUserFont = async file => {
  let family = famFromFile(file.name);
  const taken = new Set([...App.userFonts.map(f => f.family), ...(App.GAME_FONTS || []).map(f => f.family)]);
  for (let i = 2; taken.has(family); i++) family = famFromFile(file.name) + ' ' + i;
  const rec = { family, file: file.name, blob: new Blob([await file.arrayBuffer()], { type: file.type || 'font/ttf' }) };
  await registerFont(rec);   // throws if the browser can't read it
  await App.store.set('font:' + family, rec);
  App.emit('fonts-changed'); App.emit('font-loaded', family);
  return family;
};
App.removeUserFont = async family => {
  const i = App.userFonts.findIndex(f => f.family === family);
  if (i >= 0) { try { document.fonts.delete(App.userFonts[i].face); } catch {} App.userFonts.splice(i, 1); }
  await App.store.del('font:' + family);
  if (S().uiFont === family) set('uiFont', 'theme');
  App.emit('fonts-changed');
};
App.loadUserFonts = async () => {
  try {
    const keys = (await App.store.keys()).filter(k => typeof k === 'string' && k.startsWith('font:'));
    for (const k of keys) { const rec = await App.store.get(k); if (rec && rec.blob) try { await registerFont(rec); App.emit('font-loaded', rec.family); } catch {} }
    if (keys.length) { App.emit('fonts-changed'); App.applyLook(App.settings); }
  } catch {}
};
App.on('store-cleared', () => { App.userFonts.slice().forEach(f => { try { document.fonts.delete(f.face); } catch {} }); App.userFonts.length = 0; App.emit('fonts-changed'); });
})();
