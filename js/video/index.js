/* Video editor — module assembly, menus, autosave and keyboard shortcuts */
(() => {
'use strict';
const App = window.App, V = App.V;
const { h, btn, clamp } = App;
App.modules = App.modules || {};

App.on('video:import', async (blob, name) => {
  App.setMode('video');
  const added = await V.importBlob(blob, name);
  if (added.length) App.toast(`“${name}” added to the Video media bin`, 'ok');
});

const tc = t => App.tc(t, V.project.fps);
let root = null;
const togglePanel = cls => { root.classList.toggle(cls); try { localStorage.setItem('strata.v.' + cls, root.classList.contains(cls) ? '1' : '0'); } catch {} setTimeout(() => { V.tl.render(); }, 30); };

function menus() {
  const O = V.ops, T = V.tl, P = V.panels;
  let cs = [], one = null;
  const fresh = () => { cs = O.selClips(); one = cs[0]; };
  return [
    { label: 'File', tip: 'Projects, importing and exporting.', items: () => [
      { label: 'New project', icon: 'fileNew', tip: 'Start an empty video project.', action: V.newProject },
      { label: 'Open project…', icon: 'folder', tip: 'Open a .strata project file.', action: () => App.openProjectFile() },
      { label: 'Save project…', icon: 'save', key: 'Ctrl+S', tip: 'Download a .strata file containing the timeline and all its media — reopen it any time, on any computer.', action: V.saveProjectFile },
      { sep: true },
      { label: 'Import media…', icon: 'upload', key: 'Ctrl+I', tip: 'Add video, audio or image files.', action: P.importDialog },
      { sep: true },
      { label: 'Export…', icon: 'download', key: 'Ctrl+E', tip: 'Render MP4, WebM, GIF or audio.', action: P.exportDialog },
      { label: 'Export current frame (PNG)', icon: 'camera', tip: 'Full-resolution still of the frame under the playhead.', action: async () => App.download(await O.frameBlob(), `frame-${tc(V.time).replace(/:/g, '-')}.png`) },
      { label: 'Export audio mix (WAV)', icon: 'wave', tip: 'Just the soundtrack, uncompressed.', action: P.exportAudio },
      { label: 'Chapters from markers…', icon: 'marker', tip: 'Turns your timeline markers into a YouTube chapter list (0:00 Intro, 1:23 …) ready to paste into the video description.', action: O.chapters },
      { label: 'Export captions (.srt)', icon: 'captions', tip: 'Save the captions on your timeline as a standard .srt subtitle file — for YouTube, video players or other editors.', action: () => V.captions.exportSrt() },
      { label: 'Import captions (.srt / .vtt)…', icon: 'captions', tip: 'Load a subtitle file and turn it into caption clips on a new “Captions” track, styled with your last caption look.', action: () => V.captions.importSrt() },
      { sep: true },
      { label: 'Send frame to Image editor', icon: 'image', tip: 'Opens the current frame in the Image tab to paint or retouch it.', action: async () => App.emit('image:open', await O.frameBlob(), 'Frame ' + tc(V.time)) },
      { label: 'Send mix to Audio editor', icon: 'send', tip: 'Mixes down the soundtrack and opens it in the Audio tab for mastering.', action: P.sendMixToAudio },
    ] },
    { label: 'Edit', tip: 'Undo, clipboard and selection.', items: () => (fresh(), [
      { label: 'Undo', icon: 'undo', key: 'Ctrl+Z', disabled: !V.undoStack.length, tip: V.undoStack.length ? 'Undo “' + V.undoStack[V.undoStack.length - 1].label + '”.' : 'Nothing to undo.', action: V.undo },
      { label: 'Redo', icon: 'redo', key: 'Ctrl+Shift+Z', disabled: !V.redoStack.length, tip: 'Re-apply what you undid.', action: V.redo },
      { sep: true },
      { label: 'Cut', icon: 'scissors', key: 'Ctrl+X', disabled: !cs.length, tip: 'Copy and remove the selected clips.', action: O.cut },
      { label: 'Copy', icon: 'copy', key: 'Ctrl+C', disabled: !cs.length, tip: 'Copy the selected clips.', action: O.copy },
      { label: 'Paste', icon: 'paste', key: 'Ctrl+V', disabled: !V.clipboard, tip: 'Paste at the playhead.', action: () => O.paste() },
      { label: 'Duplicate', icon: 'copy', key: 'Ctrl+D', disabled: !cs.length, tip: 'Copy placed right after the selection.', action: O.duplicate },
      { label: 'Delete', icon: 'trash', key: 'Del', disabled: !cs.length, tip: 'Remove the selected clips.', action: () => O.deleteSel() },
      { label: 'Ripple delete', icon: 'gap', key: 'Shift+Del', disabled: !cs.length, tip: 'Remove and close the gap.', action: () => O.deleteSel(true) },
      { sep: true },
      { label: 'Copy attributes', icon: 'copy', key: 'Ctrl+Alt+C', disabled: !one, tip: 'Copy a clip’s look, transform, key and keyframes.', action: O.copyAttrs },
      { label: 'Paste attributes', icon: 'paste', key: 'Ctrl+Alt+V', disabled: !V.attrClipboard, tip: 'Apply copied attributes to the selected clips.', action: O.pasteAttrs },
      { sep: true },
      { label: 'Select all', icon: 'cursor', key: 'Ctrl+A', tip: 'Select every clip.', action: O.selectAll },
      { label: 'Deselect', icon: 'x', key: 'Esc', tip: 'Clear the selection (shows project settings).', action: () => { V.sel.clear(); V.changed('sel'); } },
    ]) },
    { label: 'Clip', tip: 'Cutting, speed, audio and look of clips.', items: () => (fresh(), [
      { label: 'Split at playhead', icon: 'scissors', key: 'S', tip: 'Cut the selected (or all) clips at the playhead.', action: O.splitAtPlayhead },
      { label: 'Trim start to playhead', icon: 'trimStart', key: 'Q', tip: 'Remove everything before the playhead and close the gap.', action: O.trimStartToPlayhead },
      { label: 'Trim end to playhead', icon: 'trimEnd', key: 'W', tip: 'Remove everything after the playhead and close the gap.', action: O.trimEndToPlayhead },
      { label: 'Remove silences…', icon: 'autocut', key: 'Ctrl+Shift+S', tip: 'Auto-cut every pause in the selected clips (or the whole timeline): live preview, presets, and delete / shorten / mute / mark — great for vlogs, tutorials and talking heads.', action: O.removeSilences },
      { label: 'Auto captions…', icon: 'captions', key: 'Ctrl+Shift+C', tip: 'Turn speech into timed captions automatically. A speech-recognition model (Whisper) runs on this computer — no internet, nothing uploaded. Proofread, pick a style (incl. word-by-word highlights) and add them to the timeline.', action: () => V.captions.open() },
      { label: 'Speed', icon: 'speed', disabled: !cs.some(c => c.kind === 'video' || c.kind === 'audio'), tip: 'Slow motion or fast forward.', sub: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map(s => ({ label: s + '×', checked: one && one.speed === s, action: () => O.setSpeed(cs, s) })) },
      { label: 'Detach audio', icon: 'detach', disabled: !cs.some(c => c.kind === 'video' && V.hasAudio(c)), tip: 'Move a video’s sound to its own track.', action: () => O.detachAudio() },
      { label: 'Normalize loudness', icon: 'normalize', tip: 'Measures how loud each selected clip sounds (or every clip with sound, if none is selected) and sets its volume to the same target — no more jumping between quiet and loud clips.', sub: [[-14, 'YouTube, Spotify, Instagram (−14 LUFS)'], [-16, 'Podcasts, Apple (−16 LUFS)'], [-23, 'TV broadcast (−23 LUFS)']].map(([t, l]) => ({ label: l, action: () => O.normalizeLoudness(t) })) },
      { label: 'Freeze frame', icon: 'freeze', tip: 'Insert a 2-second still at the playhead.', action: O.freezeFrame },
      { sep: true },
      { label: 'Add transition at start', icon: 'transition', disabled: !cs.some(V.isVisual), tip: 'Choose how the selected clips appear.', sub: V.TRANSITIONS.map(t => ({ label: t.name, tip: t.tip, action: () => { V.commit('Add transition'); cs.filter(V.isVisual).forEach(k => { k.transIn = { type: t.id, dur: Math.min(k.transIn.dur || 0.5, k.dur / 2) }; }); V.changed(); } })) },
      { label: 'Add title at playhead', icon: 'text', tip: 'Create a text clip.', action: () => O.addText(V.TITLE_PRESETS[0]) },
      { label: 'Add color matte', icon: 'solid', tip: 'Solid / gradient background clip.', action: () => O.addColor() },
      { label: 'Reset look & motion', icon: 'undo', disabled: !cs.some(V.isVisual), tip: 'Clear transform, color, key, mask and keyframes.', action: O.resetLook },
    ]) },
    { label: 'Timeline', tip: 'Tracks, markers and editing modes.', items: () => [
      { label: 'Add video track', icon: 'plus', tip: 'New track on top for overlays and titles.', action: () => { V.commit('Add track'); V.addTrack('video'); V.changed(); } },
      { label: 'Add audio track', icon: 'plus', tip: 'New track for music or voice-over.', action: () => { V.commit('Add track'); V.addTrack('audio'); V.changed(); } },
      { sep: true },
      { label: 'Add marker', icon: 'marker', key: 'M', tip: 'Drop a marker at the playhead.', action: O.addMarker },
      { label: 'Mark in', icon: 'trimStart', key: 'I', tip: 'Start of the loop/export range.', action: O.setIn },
      { label: 'Mark out', icon: 'trimEnd', key: 'O', tip: 'End of the loop/export range.', action: O.setOut },
      { label: 'Clear in/out', icon: 'x', key: 'Alt+X', tip: 'Remove the range.', action: O.clearRange },
      { label: 'Chapters from markers…', icon: 'marker', tip: 'A YouTube chapter list made from your markers — copy it into the video description.', action: O.chapters },
      { sep: true },
      { label: 'Snapping', icon: 'magnet', key: 'N', checked: V.snap, tip: 'Stick edits to nearby cuts and markers.', action: T.toggleSnap },
      { label: 'Ripple editing', icon: 'ripple', key: 'R', checked: V.ripple, tip: 'Deleting/trimming pulls later clips along.', action: T.toggleRipple },
      { label: 'Audio scrubbing', icon: 'wave', checked: App.settings.scrub, tip: 'Hear audio while dragging the playhead.', action: () => App.setSetting('scrub', !App.settings.scrub) },
      { label: 'Loop playback', icon: 'loop', key: 'Ctrl+L', checked: V.loop, tip: 'Repeat the range while playing.', action: T.toggleLoop },
      { label: 'Track height', icon: 'layers', tip: 'Compact, normal or tall tracks.', sub: [[0.75, 'Compact'], [1, 'Normal'], [1.5, 'Tall']].map(([s, l]) => ({ label: l, checked: V.trackScale === s, action: () => V.ops.setTrackScale(s) })) },
    ] },
    { label: 'View', tip: 'Zoom, panels and preview.', items: () => [
      { label: 'Zoom in', icon: 'zoomIn', key: '=', tip: 'Zoom the timeline in.', action: () => T.zoomBy(1.5) },
      { label: 'Zoom out', icon: 'zoomOut', key: '-', tip: 'Zoom the timeline out.', action: () => T.zoomBy(1 / 1.5) },
      { label: 'Zoom to fit', icon: 'fit', key: '\\', tip: 'Fit the whole edit in view.', action: T.zoomFit },
      { sep: true },
      { label: 'Fullscreen preview', icon: 'expand', key: 'F', tip: 'Watch the program full screen.', action: () => P.toggleFullscreen() },
      { label: 'Safe-area guides', icon: 'safe', key: "'", checked: !!P.guides, tip: 'Framing guides over the preview.', action: () => P.toggleGuides() },
      { label: 'Preview quality', icon: 'quality', tip: 'Lower = smoother playback on heavy projects.', sub: [['auto', 'Auto'], ['full', 'Full'], ['half', 'Half'], ['quarter', 'Quarter']].map(([v, l]) => ({ label: l, checked: App.settings.previewQuality === v, action: () => App.setSetting('previewQuality', v) })) },
      { sep: true },
      { label: 'Show media panel', icon: 'panelLeft', checked: !root.classList.contains('no-left'), tip: 'Show or hide the left panel.', action: () => togglePanel('no-left') },
      { label: 'Show inspector', icon: 'panelRight', checked: !root.classList.contains('no-right'), tip: 'Show or hide the right panel.', action: () => togglePanel('no-right') },
    ] },
  ];
}

function buildTop(top) {
  const nameIn = h('input', { class: 'proj-name', value: V.name, title: 'Project name', tip: 'Click to rename your project. The name is used for saved project files and exports.', spellcheck: 'false' });
  nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') nameIn.blur(); });
  nameIn.addEventListener('change', () => { V.name = nameIn.value.trim() || 'Untitled project'; nameIn.value = V.name; V.saveSoon(); });
  V.onChange(w => { if (w === 'restore' && document.activeElement !== nameIn) nameIn.value = V.name; });
  top.append(App.menubar(menus()), App.sep(), nameIn, h('div', { class: 'grow' }),
    btn({ icon: 'panelLeft', title: 'Media panel', tip: 'Show or hide the left panel (more room for the viewer).', onClick: () => togglePanel('no-left') }),
    btn({ icon: 'panelRight', title: 'Inspector', tip: 'Show or hide the inspector.', onClick: () => togglePanel('no-right') }),
    App.sep(),
    btn({ icon: 'undo', title: 'Undo', key: 'Ctrl+Z', tip: 'Step back through your edits.', onClick: V.undo }),
    btn({ icon: 'redo', title: 'Redo', key: 'Ctrl+Shift+Z', tip: 'Re-apply an edit you undid.', onClick: V.redo }),
    btn({ icon: 'save', label: 'Save', cls: 'solid txt', title: 'Save project', key: 'Ctrl+S', tip: 'Download a portable .strata project file (timeline + media). Your work also autosaves in this browser.', onClick: V.saveProjectFile }),
    btn({ icon: 'download', label: 'Export', cls: 'primary txt', title: 'Export', key: 'Ctrl+E', tip: 'Render your edit to MP4, WebM, GIF or audio.', onClick: () => V.panels.exportDialog() }));
}

App.on('font-loaded', () => V.requestRender && V.requestRender());
App.modules.video = {
  menus: () => menus(),
  init() {
    root = document.getElementById('mod-video');
    const top = h('div', { class: 'panel mhead v-top' });
    const left = h('div', { class: 'panel v-left' });
    const viewer = h('div', { class: 'panel v-viewer' });
    const insp = h('div', { class: 'panel v-insp' });
    const split = h('div', { class: 'splitter v-split', title: 'Resize', tip: 'Drag up or down to give the timeline or the viewer more room.' });
    const tl = h('div', { class: 'panel v-tl' });
    root.append(top, left, viewer, insp, split, tl);
    try { for (const c of ['no-left', 'no-right']) if (localStorage.getItem('strata.v.' + c) === '1') root.classList.add(c); } catch {}
    buildTop(top);
    V.panels.buildLeft(left);
    V.panels.buildViewer(viewer);
    V.panels.buildInspector(insp);
    V.tl.build(tl);

    let tlH = 330, cur = 330;
    try { const s = +localStorage.getItem('strata.v.tlh'); if (s) { tlH = cur = s; root.style.setProperty('--tl-h', s + 'px'); } } catch {}
    App.splitter(split, {
      onDrag: d => {
        if (d == null) { tlH = cur; try { localStorage.setItem('strata.v.tlh', cur); } catch {} return; }
        cur = clamp(tlH - d, 150, root.clientHeight - 220);
        root.style.setProperty('--tl-h', cur + 'px');
      },
    });

    V.onChange(w => {
      if (w !== 'sel') V.saveSoon();
      if (w === 'sel') { V.tl.markSelection(); V.requestRender(); return; }
      if (w === 'media') { V.tl.renderSoon(); V.requestRender(); return; }
      V.tl.render();
      V.gcVideos();
      if (V.playing) V.restartClock(); else V.requestRender();
    });
    V.tl.render();
    V.requestRender();
    V.restoreSession().then(ok => {
      if (ok) { App.toast(`Restored “${V.name}”`, 'ok', 3000, { label: 'Start new', fn: V.newProject }); V.tl.zoomFit(); }
    });
  },
  async loadProject(data, blobs, fname) {
    await V.loadData(data, async mm => (mm.blob != null ? blobs[mm.blob] : null));
    if (fname && (!data.name || data.name === 'Untitled project')) V.name = fname;
    V.changed('restore');
    V.tl.zoomFit();
    V.saveSoon();
  },
  flushSave() { return V.saveSoon.now(); },
  hide() { V.pause(); },
  onKey(e) {
    const k = App.combo(e);
    const O = V.ops, T = V.tl, fps = V.project.fps;
    const jumpKf = dir => {
      const c = O.selClips()[0];
      if (!c) return;
      const lt = V.time - c.start, ts = V.kfTimes(c).filter(t => t >= 0 && t <= c.dur);
      const t = dir > 0 ? ts.find(x => x > lt + 1e-3) : [...ts].reverse().find(x => x < lt - 1e-3);
      if (t != null) { V.pause(); V.seek(c.start + t); } else App.toast('No more keyframes on this clip');
    };
    const map = {
      'space': () => V.togglePlay(),
      'k': () => V.shuttle(0), 'j': () => V.shuttle(-1), 'l': () => V.shuttle(1),
      'arrowleft': () => V.step(-1), 'arrowright': () => V.step(1),
      'shift+arrowleft': () => V.step(-fps), 'shift+arrowright': () => V.step(fps),
      'alt+arrowleft': () => O.nudge(-1), 'alt+arrowright': () => O.nudge(1),
      'arrowup': O.prevEdit, 'arrowdown': O.nextEdit,
      'home': () => { V.pause(); V.seek(0); T.reveal(); },
      'end': () => { V.pause(); V.seek(V.duration()); T.reveal(); },
      's': O.splitAtPlayhead, 'q': O.trimStartToPlayhead, 'w': O.trimEndToPlayhead,
      'delete': () => O.deleteSel(), 'backspace': () => O.deleteSel(),
      'shift+delete': () => O.deleteSel(true), 'shift+backspace': () => O.deleteSel(true),
      'ctrl+z': V.undo, 'ctrl+shift+z': V.redo, 'ctrl+y': V.redo,
      'ctrl+c': O.copy, 'ctrl+x': O.cut, 'ctrl+v': () => O.paste(), 'ctrl+d': O.duplicate, 'ctrl+a': O.selectAll,
      'ctrl+alt+c': O.copyAttrs, 'ctrl+alt+v': O.pasteAttrs,
      'm': O.addMarker, 'i': O.setIn, 'o': O.setOut, 'alt+x': O.clearRange,
      'v': () => T.setTool('select'), 'c': () => T.setTool('blade'), 'y': () => T.setTool('slip'),
      'n': T.toggleSnap, 'r': T.toggleRipple,
      '=': () => T.zoomBy(1.5), 'shift+=': () => T.zoomBy(1.5), '-': () => T.zoomBy(1 / 1.5), '\\': T.zoomFit,
      'ctrl+e': V.panels.exportDialog, 'ctrl+i': V.panels.importDialog, 'ctrl+s': V.saveProjectFile, 'ctrl+l': T.toggleLoop, 'ctrl+shift+s': O.removeSilences, 'ctrl+shift+c': () => V.captions.open(),
      "'": () => V.panels.toggleGuides(), 'f': () => V.panels.toggleFullscreen(),
      '[': () => jumpKf(-1), ']': () => jumpKf(1),
      'escape': () => { if (V.panels.pickKey) { V.panels.pickKey = null; V.drawOverlay(); return; } V.sel.clear(); V.changed('sel'); },
    };
    const fn = map[k];
    if (fn) { e.preventDefault(); fn(); return true; }
    return false;
  },
  shortcuts: [
    ['Playback', [['Space', 'Play / pause'], ['J / K / L', 'Shuttle back / stop / forward'], ['← / →', 'Previous / next frame'], ['Shift + ← / →', 'Back / forward 1 second'], ['↑ / ↓', 'Previous / next cut'], ['Home / End', 'Start / end'], ['I / O', 'Mark in / out'], ['Alt + X', 'Clear in/out'], ['Ctrl + L', 'Loop playback'], ['F', 'Fullscreen preview']]],
    ['Cutting', [['S', 'Split at playhead'], ['Ctrl + Shift + S', 'Remove silences (auto-cut pauses)'], ['Ctrl + Shift + C', 'Auto captions (speech to text)'], ['Q', 'Trim start to playhead (ripple)'], ['W', 'Trim end to playhead (ripple)'], ['Del', 'Delete'], ['Shift + Del', 'Ripple delete'], ['Ctrl + drag edge', 'Roll edit (move a cut)'], ['Alt + ← / →', 'Nudge clip one frame'], ['Alt + drag', 'Duplicate while dragging'], ['Ctrl + drop', 'Insert (push clips right)']]],
    ['Tools', [['V', 'Select tool'], ['C', 'Blade tool (Shift = all tracks)'], ['Y', 'Slip tool'], ['N', 'Toggle snapping'], ['R', 'Toggle ripple editing'], ['M', 'Add marker'], ['[ / ]', 'Previous / next keyframe']]],
    ['Edit & view', [['Ctrl + Z / Shift + Z', 'Undo / redo'], ['Ctrl + C / X / V', 'Copy / cut / paste'], ['Ctrl + Alt + C / V', 'Copy / paste attributes'], ['Ctrl + D', 'Duplicate'], ['Ctrl + A', 'Select all'], ['= / -', 'Zoom in / out'], ['\\', 'Zoom to fit'], ['Ctrl + wheel', 'Zoom at cursor'], ['Ctrl + S', 'Save project file'], ['Ctrl + E', 'Export'], ["'", 'Safe-area guides']]],
  ],
};
})();
