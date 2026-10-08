/* Video editor — bins (media/titles/transitions/looks), program viewer, inspector, export */
(() => {
'use strict';
const App = window.App, V = App.V;
const { h, icon, btn, clamp } = App;
const P = V.panels = {};
const tc = t => App.tc(t, V.project.fps);
const O = () => V.ops;
const T = () => V.tl;

/* =====================================================================
   Presets
   ===================================================================== */
V.LOOKS = [
  { name: 'Original', fx: {}, tip: 'Removes any look — back to the untouched picture.' },
  { name: 'Vivid', fx: { saturate: 145, contrast: 115 }, tip: 'Richer colors and extra punch.' },
  { name: 'Warm', fx: { sepia: 22, saturate: 125, brightness: 104, hue: -6 }, tip: 'Golden, sunny feel.' },
  { name: 'Cool', fx: { saturate: 90, hue: 12, brightness: 102, contrast: 105 }, tip: 'Blue-ish, calm and clean.' },
  { name: 'Cinematic', fx: { contrast: 122, saturate: 82, brightness: 94, vignette: 35 }, tip: 'Moody contrast, muted color and a soft vignette.' },
  { name: 'Mono', fx: { grayscale: 100, contrast: 118 }, tip: 'Classic black & white.' },
  { name: 'Noir', fx: { grayscale: 100, contrast: 165, brightness: 88, vignette: 55 }, tip: 'Hard, high-contrast black & white with dark edges.' },
  { name: 'Vintage', fx: { sepia: 48, contrast: 88, saturate: 78, brightness: 106, vignette: 30 }, tip: 'Faded old-film tones.' },
  { name: 'Faded', fx: { contrast: 78, saturate: 70, brightness: 112 }, tip: 'Soft matte look with lifted shadows.' },
  { name: 'Dreamy', fx: { blur: 1.2, brightness: 112, saturate: 120, contrast: 90 }, tip: 'Glowy and soft-focus.' },
  { name: 'Punch', fx: { contrast: 138, saturate: 128, brightness: 98 }, tip: 'Bold, high-energy contrast.' },
  { name: 'Invert', fx: { invert: 100 }, tip: 'Negative image — fun for glitchy edits.' },
];
V.TITLE_PRESETS = [
  { name: 'Title', tip: 'Big centered heading that fades in and out.', text: { content: 'Your Title', size: 120, anim: 'fade' } },
  { name: 'Subtitle', tip: 'Readable caption in a dark box near the bottom of the frame.', y: 400, text: { content: 'Subtitle text goes here', size: 52, bold: false, bg: true, bgColor: '#000000', bgAlpha: 0.65, anim: 'fade', shadow: 'none' } },
  { name: 'Lower third', tip: 'Name + role label that rises in at the bottom-left — classic for interviews.', x: -560, y: 330, text: { content: 'Alex Morgan\nDirector', size: 54, align: 'left', bg: true, bgColor: '#ff7849', bgAlpha: 0.92, anim: 'rise', shadow: 'none', color: '#1a0d06' } },
  { name: 'Impact', tip: 'Huge outlined word that pops in with a bounce.', text: { content: 'WOW!', size: 230, font: 'Bebas Neue', strokeW: 8, stroke: '#111111', anim: 'pop', color: '#ffe14a' } },
  { name: 'Neon', tip: 'Glowing sign-style text.', text: { content: 'neon nights', size: 120, font: 'Pacifico', color: '#5ef2ff', shadow: 'glow', anim: 'fade' } },
  { name: 'Typewriter', tip: 'Letters appear one by one, like typing.', text: { content: 'Once upon a time…', size: 68, font: 'JetBrains Mono', bold: false, anim: 'typewriter' } },
  { name: 'Elegant', tip: 'Serif title with spacing for a refined, cinematic feel.', text: { content: 'Chapter One', size: 104, font: 'Playfair Display', bold: false, italic: true, spacing: 4, anim: 'fade' } },
  { name: 'Marker', tip: 'Hand-drawn style, playful and casual.', text: { content: 'hello there!', size: 110, font: 'Permanent Marker', color: '#ffffff', shadow: 'hard', anim: 'pop' } },
  { name: 'Credits', tip: 'Scrolling end credits that roll from bottom to top.', dur: 10, text: { content: 'Directed by\nYOUR NAME\n\nEdited with\nStrata Studio\n\nThanks for watching', size: 56, bold: false, anim: 'scroll', shadow: 'none' } },
];
V.FONTS = ['Manrope', 'Bebas Neue', 'Playfair Display', 'Pacifico', 'Permanent Marker', 'JetBrains Mono', 'Arial', 'Georgia', 'Impact', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Segoe UI', 'Comic Sans MS'];
const RES = [
  ['1920x1080', '1920 × 1080 · Full HD'], ['1280x720', '1280 × 720 · HD'], ['3840x2160', '3840 × 2160 · 4K'], ['2560x1440', '2560 × 1440 · QHD'],
  ['1080x1920', '1080 × 1920 · Vertical (Reels/Shorts)'], ['1080x1080', '1080 × 1080 · Square'], ['1080x1350', '1080 × 1350 · Portrait 4:5'], ['2560x1080', '2560 × 1080 · Ultrawide'],
];

/* =====================================================================
   Left panel — bins
   ===================================================================== */
P.buildLeft = root => {
  const tabsDef = [
    ['media', 'Media', 'film', 'Your imported videos, music and pictures. Drag them onto the timeline.'],
    ['text', 'Titles', 'text', 'Animated text styles. Click to add at the playhead, or drag onto the timeline.'],
    ['trans', 'Transitions', 'transition', 'Ways for clips to appear and disappear. Drag onto the start or end of a clip.'],
    ['looks', 'Looks', 'palette', 'One-click color grades. Select clips and click a look, or drag it onto a clip.'],
  ];
  const ptabs = h('div', { class: 'ptabs' });
  const body = h('div', { class: 'panel-body' });
  const panes = {};
  let cur = 'media';
  const show = k => {
    cur = k;
    ptabs.querySelectorAll('.ptab').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    body.innerHTML = ''; body.append(panes[k]());
  };
  for (const [k, l, ic, tip] of tabsDef) {
    const b = h('button', { class: 'ptab', dataset: { k }, title: l, tip }, l);
    b.addEventListener('click', () => show(k));
    ptabs.append(b);
  }
  panes.media = mediaPane;
  panes.text = titlesPane;
  panes.trans = transPane;
  panes.looks = looksPane;
  root.append(ptabs, body);
  App.fileDrop(root, files => V.importFiles(files));
  App.xfer.zone(root, {
    accepts: p => p.from !== 'video',
    label: p => `Drop to add “${p.name}” to the media bin`,
    drop: async p => { const [m] = await V.importFiles([await p.file()]); if (m) App.toast(`“${m.name}” added to the media bin`, 'ok'); },
  });
  V.onChange(w => { if (cur === 'media' && (w === 'media' || w === 'all' || w === 'restore')) show('media'); });
  show('media');
};

async function importDialog() {
  const files = await App.pickFiles('video/*,audio/*,image/*', true);
  if (files.length) V.importFiles(files);
}
P.importDialog = importDialog;

function mediaPane() {
  const wrap = h('div');
  wrap.append(h('div', { class: 'media-tools' },
    btn({ icon: 'upload', label: 'Import', cls: 'primary txt', title: 'Import media', key: 'Ctrl+I', tip: 'Add video, audio or image files to this project. You can also drag files from your desktop anywhere here.', onClick: importDialog }),
    btn({ icon: 'solid', label: 'Color', cls: 'solid txt', title: 'Color matte', tip: 'Adds a solid or gradient background clip at the playhead — perfect behind titles.', onClick: () => O().addColor() }),
  ));
  if (!V.media.length) {
    const d = h('div', { class: 'drop-hint', title: 'Import', tip: 'Click to browse, or drop files here.' }, icon('upload', 26), h('b', null, 'Drop videos, music or images here'), h('br'), 'or click to browse');
    d.addEventListener('click', importDialog);
    wrap.append(d, h('div', { class: 'hint' }, 'Tip: drag clips from here onto the timeline. Hold ', h('kbd', null, 'Ctrl'), ' while dropping to insert and push later clips right.'));
    return wrap;
  }
  const grid = h('div', { class: 'media-grid' });
  for (const m of V.media) grid.append(mediaItem(m));
  wrap.append(grid);
  return wrap;
}
function mediaItem(m) {
  const kindIcon = { video: 'film', audio: 'music', image: 'image' }[m.type];
  const thumb = h('div', { class: 'mi-thumb' });
  if (m.thumbs && m.thumbs.length) {
    const t = m.thumbs[Math.floor(m.thumbs.length / 3)].c;
    const c = App.canvas(t.width, t.height); c.getContext('2d').drawImage(t, 0, 0); thumb.append(c);
  } else if (m.env) {
    const c = App.canvas(240, 66), x = c.getContext('2d');
    x.fillStyle = '#0f2a24'; x.fillRect(0, 0, 240, 66); x.fillStyle = '#35d6b4';
    for (let i = 0; i < 240; i++) { const v = m.env[Math.floor(i / 240 * m.env.length)] || 0; x.fillRect(i, 33 - v * 30, 1, v * 60 + 1); }
    thumb.append(c);
  } else thumb.append(icon(kindIcon, 26));
  thumb.append(h('span', { class: 'mi-kind' }, icon(kindIcon, 12, 2.2)));
  if (m.type !== 'image') thumb.append(h('span', { class: 'mi-dur' }, m.loading ? '…' : tc(m.duration).replace(/^00:/, '')));
  const add = btn({ icon: 'plus', cls: 'sm mi-add', title: 'Append to timeline', tip: 'Adds this clip after the last clip on the main track.', onClick: e => { e.stopPropagation(); O().placeMedia(m, 'append'); } });
  thumb.append(add);
  const info = m.type === 'image' ? `${m.width}×${m.height} image` : m.type === 'video' ? `${m.width}×${m.height} · ${tc(m.duration)}${m.hasAudio ? ' · with sound' : ''}` : `Audio · ${tc(m.duration)}`;
  const used = V.clips.some(c => c.mediaId === m.id);
  const el = h('div', { class: 'media-item' + (used ? ' used' : ''), draggable: 'true', title: m.name, tip: `${info}${used ? ' · used in the timeline' : ''}. Drag onto the timeline, double-click to append, right-click for more.` },
    thumb, h('div', { class: 'mi-name' }, m.name), m.loading ? h('i', { class: 'mi-load' }) : null);
  el.addEventListener('dragstart', e => { T().dragPayload = { kind: 'media', media: m }; e.dataTransfer.setData('text/plain', m.name); e.dataTransfer.effectAllowed = 'copy'; if (!m.loading) App.xfer.start(e, P.mediaPayload(m), false); });
  el.addEventListener('dragend', () => { setTimeout(() => { T().dragPayload = null; }, 50); });
  el.addEventListener('dblclick', () => O().placeMedia(m, 'append'));
  el.addEventListener('contextmenu', e => App.contextMenu(e, [
    { label: 'Append to timeline', icon: 'plus', tip: 'Adds after the last clip on the main track.', action: () => O().placeMedia(m, 'append') },
    { label: 'Insert at playhead', icon: 'ripple', tip: 'Splits at the playhead and pushes later clips right to make room.', action: () => O().placeMedia(m, 'insert') },
    { label: 'Overwrite at playhead', icon: 'download', tip: 'Places the clip at the playhead, replacing whatever was there.', action: () => O().placeMedia(m, 'overwrite') },
    { sep: true },
    m.audioBuffer ? { label: 'Open in Audio editor', icon: 'wave', tip: 'Loads this file\'s sound into the Audio tab.', action: () => { const ab = m.audioBuffer; App.emit('audio:open', { channels: Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i).slice()), sampleRate: ab.sampleRate, name: m.name }); } } : null,
    m.type === 'image' ? { label: 'Open in Image editor', icon: 'image', tip: 'Edit or paint on this picture in the Image tab.', action: () => App.emit('image:open', m.file, m.name) } : null,
    m.file ? { label: 'Convert to another format…', icon: 'convert', tip: 'Sends this file to the Converter (e.g. MKV → MP4, or take the sound out as MP3).', action: () => App.Conv.add([m.file instanceof File ? m.file : new File([m.file], m.name, { type: m.file.type })]) } : null,
    { label: 'Remove from project', icon: 'trash', tip: 'Deletes this media and every clip that uses it.', action: async () => {
      const n = V.clips.filter(c => c.mediaId === m.id).length;
      if (n && !(await App.confirm('Remove media', `“${m.name}” is used by ${n} clip(s) on the timeline. Remove it and those clips?`, 'Remove'))) return;
      V.commit('Remove media');
      V.clips = V.clips.filter(c => c.mediaId !== m.id);
      V.media.splice(V.media.indexOf(m), 1);
      V.changed();
    } },
  ]));
  return el;
}

function titlesPane() {
  const grid = h('div', { class: 'tile-grid' });
  for (const p of V.TITLE_PRESETS) {
    const t = Object.assign(V.defaultText(), p.text);
    const vis = h('div', { class: 'tile-vis', style: { background: 'linear-gradient(135deg,#232733,#12141a)' } },
      h('span', { style: { font: `${t.italic ? 'italic ' : ''}${t.bold ? 800 : 500} 17px "${t.font}", Manrope`, color: t.color, textShadow: t.shadow === 'glow' ? `0 0 8px ${t.color}` : '0 1px 3px #000', WebkitTextStroke: t.strokeW ? '0.6px #000' : '', background: t.bg ? t.bgColor : '', padding: t.bg ? '1px 6px' : '', borderRadius: '3px', whiteSpace: 'nowrap', maxWidth: '90%', overflow: 'hidden' } }, t.content.split('\n')[0]));
    const tile = h('div', { class: 'tile', draggable: 'true', title: p.name, tip: p.tip + ' Click to add at the playhead, or drag onto the timeline.' }, vis, h('div', { class: 'tile-name' }, p.name));
    tile.addEventListener('click', () => O().addText(p));
    tile.addEventListener('dragstart', e => { T().dragPayload = { kind: 'text', preset: p }; e.dataTransfer.setData('text/plain', p.name); });
    tile.addEventListener('dragend', () => setTimeout(() => { T().dragPayload = null; }, 50));
    grid.append(tile);
  }
  const cap = btn({ icon: 'captions', label: 'Auto captions…', cls: 'solid txt', title: 'Auto captions', key: 'Ctrl+Shift+C', tip: 'Turn the speech in your video into timed captions automatically — runs on this computer, no internet needed.', onClick: () => V.captions.open() });
  return h('div', null, h('div', { class: 'cap-cta' }, cap), grid, h('div', { class: 'hint' }, 'Titles land on the first free video track above your footage. Select one to edit its text, font and animation in the Inspector.'));
}

function transPane() {
  const grid = h('div', { class: 'tile-grid' });
  for (const tr of V.TRANSITIONS) {
    const cv = App.canvas(168, 104);
    cv.style.width = '100%'; cv.style.height = '100%';
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    V.previewTransition(ctx, tr.id, 0.55, 84, 52);
    let raf = 0, t0 = 0;
    const anim = ts => { if (!t0) t0 = ts; const p = ((ts - t0) / 1100) % 1.25; ctx.clearRect(0, 0, 84, 52); V.previewTransition(ctx, tr.id, Math.min(1, p), 84, 52); raf = requestAnimationFrame(anim); };
    const tile = h('div', { class: 'tile', draggable: 'true', title: tr.name, tip: tr.tip + ' Drag onto the start or end of a clip — or select clips and click (Shift+click for the end).' }, h('div', { class: 'tile-vis' }, cv), h('div', { class: 'tile-name' }, tr.name));
    tile.addEventListener('pointerenter', () => { t0 = 0; raf = requestAnimationFrame(anim); });
    tile.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, 84, 52); V.previewTransition(ctx, tr.id, 0.55, 84, 52); });
    tile.addEventListener('click', e => {
      const cs = O().selClips().filter(V.isVisual);
      if (!cs.length) return App.toast('Select clips on the timeline first — or drag the transition onto a clip');
      V.commit('Add transition');
      for (const c of cs) {
        if (e.shiftKey) c.transOut = { type: tr.id === 'dissolve' ? 'fade' : tr.id, dur: Math.min(c.transOut.dur || 0.5, c.dur / 2) };
        else c.transIn = { type: tr.id, dur: Math.min(c.transIn.dur || 0.5, c.dur / 2) };
      }
      V.changed();
    });
    tile.addEventListener('dragstart', e => { T().dragPayload = { kind: 'transition', id: tr.id }; e.dataTransfer.setData('text/plain', tr.name); });
    tile.addEventListener('dragend', () => setTimeout(() => { T().dragPayload = null; }, 50));
    grid.append(tile);
  }
  return h('div', null, h('div', { class: 'hint' }, 'Drop on the ', h('b', null, 'left half'), ' of a clip for an intro, the ', h('b', null, 'right half'), ' for an outro. For a cross dissolve, put it on the start of the second clip.'), grid);
}

function looksPane() {
  const grid = h('div', { class: 'tile-grid' });
  for (const lk of V.LOOKS) {
    const fx = Object.assign(V.defaultFx(), lk.fx);
    const vis = h('div', { class: 'tile-vis' }, h('div', { class: 'look-vis', style: { filter: V.filterString(fx) } }));
    if (fx.vignette) vis.append(h('div', { style: { position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${fx.vignette / 100}))` } }));
    const tile = h('div', { class: 'tile', draggable: 'true', title: lk.name, tip: lk.tip + ' Applies to selected clips; fine-tune in the Inspector’s Color section.' }, vis, h('div', { class: 'tile-name' }, lk.name));
    tile.addEventListener('click', () => {
      const cs = O().selClips().filter(V.isVisual);
      if (!cs.length) return App.toast('Select clips on the timeline first');
      V.commit('Apply look');
      for (const c of cs) c.fx = Object.assign(V.defaultFx(), lk.fx);
      V.changed();
    });
    tile.addEventListener('dragstart', e => { T().dragPayload = { kind: 'look', look: lk }; e.dataTransfer.setData('text/plain', lk.name); });
    tile.addEventListener('dragend', () => setTimeout(() => { T().dragPayload = null; }, 50));
    grid.append(tile);
  }
  return grid;
}

/** a media-bin item as something the Audio and Image editors can take (its sound, a frame, or the picture itself) */
P.mediaPayload = m => ({
  kind: m.type, from: 'video', name: m.name.replace(/\.[^.]+$/, ''), duration: m.type === 'image' ? undefined : m.duration,
  file: async () => m.file,
  audio: m.audioBuffer ? async () => { const ab = m.audioBuffer; return { channels: Array.from({ length: Math.min(2, ab.numberOfChannels) }, (_, i) => ab.getChannelData(i).slice()), sampleRate: ab.sampleRate }; } : null,
  image: m.type === 'image' ? async () => m.file : m.type === 'video' ? () => App.xfer.videoFrame(m.url, 1) : null,
});
P.RES = RES;
})();
