/* Video editor — inspector: clip properties with keyframes, color, chroma key, shape/frame,
   transitions, timing, audio, text and project settings */
(() => {
'use strict';
const App = window.App, V = App.V;
const { h, icon, btn, clamp } = App;
const P = V.panels;
const tc = t => App.tc(t, V.project.fps);
const O = () => V.ops;
const T = () => V.tl;

let inspBody = null, binds = [], structKey = '';
P.buildInspector = root => {
  root.append(h('div', { class: 'panel-head' }, h('span', { class: 'panel-title' }, 'Inspector')));
  inspBody = h('div', { class: 'panel-body' });
  root.append(inspBody);
  P.rebuildInspector();
  V.onChange(w => {
    if (w === 'props' || w === 'media') return;
    const key = [...V.sel].join(',') + '|' + O().selClips().map(c => c.kind).join(',');
    if (key !== structKey || w === 'sel' || w === 'restore') P.rebuildInspector();
    else P.refreshValues();
  });
  let tPend = false;
  V.onTime(() => {
    if (V.playing || tPend || !binds.length) return;
    tPend = true;
    requestAnimationFrame(() => { tPend = false; P.refreshValues(); });
  });
};
P.refreshValues = () => { for (const b of binds) b(); };

P.rebuildInspector = () => {
  const cs = O().selClips();
  structKey = [...V.sel].join(',') + '|' + cs.map(c => c.kind).join(',');
  binds = [];
  const scroll = inspBody.scrollTop;
  inspBody.innerHTML = '';
  if (!cs.length) { inspBody.append(projectInspector()); return; }
  const c0 = cs[cs.length - 1];
  const kindName = { video: 'Video clip', image: 'Image', text: 'Title', color: 'Color matte', audio: 'Audio clip' }[c0.kind];
  const sub = h('div', { class: 'ih-sub' });
  const updSub = () => { sub.textContent = cs.length > 1 ? `${cs.length} clips selected — edits apply to all` : `${kindName} · ${tc(c0.dur)} @ ${tc(c0.start)}`; };
  updSub(); binds.push(updSub);
  inspBody.append(h('div', { class: 'insp-head' },
    h('div', { class: 'ih-ico' }, icon({ video: 'film', image: 'image', text: 'text', color: 'solid', audio: 'music' }[c0.kind], 18)),
    h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'ih-name' }, cs.length > 1 ? 'Multiple clips' : V.clipName(c0)), sub),
    btn({ icon: 'undo', cls: 'sm', title: 'Reset look & motion', tip: 'Removes transform, color, key, mask and keyframes from the selected clips.', onClick: O().resetLook })));

  const visual = cs.filter(V.isVisual);
  const media = cs.filter(c => c.kind === 'video' || c.kind === 'image');
  const audible = cs.filter(V.hasAudio);
  const speedable = cs.filter(c => c.kind === 'video' || c.kind === 'audio');
  const W = V.project.width, H = V.project.height;

  /** plain slider bound to a property across clips */
  const sl = (set, label, opts, get, put, after) => {
    const row = App.slider(Object.assign({ label }, opts, {
      value: get(set[set.length - 1]),
      onStart: () => V.commit(label),
      onInput: v => { for (const c of set) put(c, v); V.requestRender(); after && after(); },
      onChange: () => V.changed('props'),
    }));
    binds.push(() => row.set(get(set[set.length - 1])));
    return row;
  };
  /** animatable slider with a keyframe diamond */
  const asl = (set, label, prop, opts, toUi = v => v, fromUi = v => v, after) => {
    const cl = set[set.length - 1];
    const row = App.slider(Object.assign({ label }, opts, {
      value: toUi(V.getAnimProp(cl, prop)),
      onStart: () => V.commit(label),
      onInput: v => { for (const c of set) V.setAnimProp(c, prop, fromUi(v)); V.requestRender(); after && after(); refresh(); },
      onChange: () => { V.changed('props'); T().renderSoon(); },
    }));
    row.classList.add('has-kf');
    const kfb = h('button', { type: 'button', class: 'kf-btn', title: `Keyframe ${label.toLowerCase()}`, tip: 'Animate this setting. Click to add a keyframe at the playhead (click again to remove it). Once animated, changing the value at another time adds a keyframe and Strata animates smoothly between them. Right-click for more.' });
    const toggleKf = () => {
      const inside = V.time >= cl.start - 1e-6 && V.time <= cl.start + cl.dur + 1e-6;
      if (!inside) { V.pause(); V.seek(cl.start); }
      V.commit('Keyframe ' + label);
      const here = V.kfAt(cl, prop, V.localTime(cl)) >= 0;
      for (const c of set) { const lt = V.localTime(c); if (here) V.removeKf(c, prop, lt); else V.setKf(c, prop, lt, V.getAnimProp(c, prop)); }
      V.changed('props'); T().render(); refresh();
    };
    kfb.addEventListener('click', toggleKf);
    kfb.addEventListener('contextmenu', e => {
      const list = (cl.kf && cl.kf[prop]) || [];
      const jump = dir => {
        const lt = V.localTime(cl);
        const k = dir > 0 ? list.find(x => x.t > lt + 1e-3) : [...list].reverse().find(x => x.t < lt - 1e-3);
        if (k) { V.pause(); V.seek(cl.start + clamp(k.t, 0, cl.dur)); }
      };
      const i = V.kfAt(cl, prop, V.localTime(cl));
      const setEase = eName => { V.commit('Keyframe easing'); for (const c of set) { const j = V.kfAt(c, prop, V.localTime(c)); if (j >= 0) c.kf[prop][j].e = eName; } V.changed('props'); };
      App.contextMenu(e, [
        { label: 'Previous keyframe', icon: 'stepBack', disabled: !list.length, tip: 'Moves the playhead to the previous keyframe of this setting.', action: () => jump(-1) },
        { label: 'Next keyframe', icon: 'stepFwd', disabled: !list.length, tip: 'Moves the playhead to the next keyframe.', action: () => jump(1) },
        { sep: true },
        { head: 'Easing from this keyframe' },
        { label: 'Smooth', checked: i >= 0 && list[i].e === 'ease', disabled: i < 0, tip: 'Accelerates and decelerates naturally.', action: () => setEase('ease') },
        { label: 'Linear', checked: i >= 0 && list[i].e === 'linear', disabled: i < 0, tip: 'Constant speed between keyframes.', action: () => setEase('linear') },
        { label: 'Hold', checked: i >= 0 && list[i].e === 'hold', disabled: i < 0, tip: 'Jumps to the next value instantly (no animation).', action: () => setEase('hold') },
        { sep: true },
        { label: 'Remove all keyframes', icon: 'trash', disabled: !list.length, tip: 'Stops animating this setting and keeps its current value.', action: () => { V.commit('Remove keyframes'); for (const c of set) { c[prop] = V.getAnimProp(c, prop); if (c.kf) delete c.kf[prop]; } V.changed('props'); T().render(); refresh(); } },
      ]);
    });
    row.insertBefore(kfb, row.firstChild);
    const refresh = () => {
      const anim = V.hasKf(cl, prop), here = anim && V.kfAt(cl, prop, V.localTime(cl)) >= 0;
      kfb.classList.toggle('anim', anim); kfb.classList.toggle('here', here);
      row.classList.toggle('animated', anim);
      row.set(toUi(V.getAnimProp(cl, prop)));
    };
    refresh();
    binds.push(refresh);
    return row;
  };
  const apply = (set, label, fn) => { V.commit(label); for (const c of set) fn(c); V.changed('props'); V.requestRender(); };
  const relayout = () => T().renderSoon();

  if (cs.length === 1 && c0.kind === 'text') inspBody.append(textSection(c0, sl, apply));
  if (cs.length === 1 && c0.kind === 'color') inspBody.append(colorSection(c0, apply));

  if (visual.length) {
    const fitSeg = App.seg({ value: visual[visual.length - 1].fit, onChange: v => apply(media, 'Fit', c => c.fit = v), options: [
      { value: 'contain', label: 'Fit', title: 'Fit', tip: 'Shows the whole picture inside the frame (may leave bars).' },
      { value: 'cover', label: 'Fill', title: 'Fill', tip: 'Fills the frame completely, cropping the edges if needed.' },
      { value: 'stretch', label: 'Stretch', title: 'Stretch', tip: 'Distorts the picture to exactly match the frame.' },
      { value: 'none', label: '1:1', title: 'Original size', tip: 'Uses the media’s real pixel size.' }] });
    const flips = h('div', { class: 'btn-row' },
      btn({ icon: 'flipH', cls: 'sm', title: 'Flip horizontal', tip: 'Mirrors the picture left-to-right.', onClick: () => apply(visual, 'Flip', c => c.flipH = !c.flipH) }),
      btn({ icon: 'flipV', cls: 'sm', title: 'Flip vertical', tip: 'Turns the picture upside-down.', onClick: () => apply(visual, 'Flip', c => c.flipV = !c.flipV) }),
      btn({ icon: 'target', cls: 'sm', title: 'Center', tip: 'Moves the clip back to the middle of the frame.', onClick: () => apply(visual, 'Center', c => { V.setAnimProp(c, 'x', 0); V.setAnimProp(c, 'y', 0); }) }));
    const blend = App.select({ label: 'Blend', value: visual[visual.length - 1].blend, tip: 'How this layer mixes with the tracks beneath it. Screen brightens, Multiply darkens, Overlay adds contrast.', onChange: v => apply(visual, 'Blend mode', c => c.blend = v),
      options: [['source-over', 'Normal'], ['screen', 'Screen'], ['multiply', 'Multiply'], ['overlay', 'Overlay'], ['lighten', 'Lighten'], ['darken', 'Darken'], ['color-dodge', 'Color dodge'], ['color-burn', 'Color burn'], ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity']] });
    const motion = App.select({ label: 'Auto motion', value: visual[visual.length - 1].motion, tip: 'One-click camera-style movement across the clip — “Ken Burns” zooms and pans bring photos to life. For custom moves, use the ◆ keyframe buttons instead.', onChange: v => apply(visual, 'Motion', c => c.motion = v),
      options: [['none', 'None'], ['zoomIn', 'Slow zoom in'], ['zoomOut', 'Slow zoom out'], ['panL', 'Pan left'], ['panR', 'Pan right'], ['panU', 'Pan up'], ['panD', 'Pan down'], ['shake', 'Handheld shake'], ['pulse', 'Pulse']] });
    inspBody.append(App.section('Transform', 'move', [
      h('div', { class: 'hint', style: { paddingTop: 0 } }, 'Tip: click a ◆ to animate a setting with keyframes.'),
      asl(visual, 'Position X', 'x', { min: -W, max: W, step: 1, def: 0, unit: 'px', tip: 'Moves the clip left / right. You can also drag it directly in the viewer.' }),
      asl(visual, 'Position Y', 'y', { min: -H, max: H, step: 1, def: 0, unit: 'px', tip: 'Moves the clip up / down.' }),
      asl(visual, 'Scale', 'scale', { min: 1, max: 400, step: 1, def: 100, unit: '%', tip: 'Makes the clip bigger or smaller. Drag a corner handle in the viewer for the same effect.' }, v => Math.round(v * 100), v => v / 100),
      asl(visual, 'Rotation', 'rotation', { min: -180, max: 180, step: 0.5, def: 0, unit: '°', tip: 'Tilts the clip. Hold Shift while dragging the viewer handle to snap to 15° steps.' }),
      asl(visual, 'Opacity', 'opacity', { min: 0, max: 100, step: 1, def: 100, unit: '%', tip: 'How see-through the clip is. Lower values reveal tracks underneath.' }, v => Math.round(v * 100), v => v / 100),
      media.length ? h('div', { class: 'ctl', title: 'Frame fit', tip: 'How media of a different shape fits the project frame.' }, h('label', null, 'Fit'), fitSeg) : null,
      h('div', { class: 'ctl', title: 'Flip & center', tip: 'Quick orientation helpers.' }, h('label', null, 'Flip'), flips),
      blend, motion,
    ], { id: 'v-transform' }));

    // Picture-in-picture & frame
    const pip = (pos) => () => apply(visual, 'Picture-in-picture', c => {
      const s = 0.32, m = 0.04;
      const bx = (W * s) / 2, by = (H * s) / 2;
      const px = pos.includes('l') ? -W / 2 + W * m + bx : pos.includes('r') ? W / 2 - W * m - bx : 0;
      const py = pos.includes('t') ? -H / 2 + H * m + by : pos.includes('b') ? H / 2 - H * m - by : 0;
      c.kf = c.kf || {}; ['x', 'y', 'scale'].forEach(k => delete c.kf[k]);
      c.scale = s; c.x = Math.round(px); c.y = Math.round(py); c.fit = 'cover';
      c.mask = { shape: 'rounded', radius: 28 }; c.shadow = { on: true, blur: 40, opacity: 55, dist: 14 }; c.border = { width: 3, color: '#ffffff' };
    });
    const pipChips = h('div', { class: 'chips' }, [['tl', 'Top-left'], ['tr', 'Top-right'], ['bl', 'Bottom-left'], ['br', 'Bottom-right'], ['c', 'Center']].map(([k, l]) => {
      const ch = h('button', { class: 'chip', title: 'Picture-in-picture: ' + l, tip: 'Shrinks the clip into a framed corner window with rounded edges and a shadow — perfect for webcam overlays and reactions.' }, l);
      ch.addEventListener('click', pip(k));
      return ch;
    }));
    const shapeSeg = App.seg({ value: visual[visual.length - 1].mask.shape, onChange: v => apply(visual, 'Mask shape', c => c.mask.shape = v), options: [
      { value: 'none', label: 'None', tip: 'Rectangular, unmasked picture.' }, { value: 'rounded', label: 'Rounded', tip: 'Rounded corners (set the radius below).' },
      { value: 'circle', label: 'Circle', tip: 'Perfect circle — great for webcam bubbles.' }, { value: 'ellipse', label: 'Oval', tip: 'Oval that fills the clip’s box.' }] });
    const borderCol = App.color({ label: 'Border color', value: visual[visual.length - 1].border.color, tip: 'Color of the frame around the clip.', onStart: () => V.commit('Border color'), onInput: v => { for (const c of visual) c.border.color = v; V.requestRender(); }, onChange: () => V.changed('props') });
    inspBody.append(App.section('Shape & frame', 'pip', [
      h('div', { class: 'ctl', title: 'Picture-in-picture', tip: 'One-click corner placements.' }, h('label', null, 'PiP'), h('span', { class: 'hint', style: { padding: 0 } }, 'quick layouts:')), pipChips,
      h('div', { class: 'ctl', title: 'Mask', tip: 'Cuts the clip into a shape.' }, h('label', null, 'Mask'), shapeSeg),
      sl(visual, 'Corner radius', { min: 0, max: 400, step: 1, def: 40, unit: 'px', tip: 'Roundness of the corners for the Rounded mask.' }, c => c.mask.radius, (c, v) => c.mask.radius = v),
      sl(visual, 'Border', { min: 0, max: 40, step: 0.5, def: 0, unit: 'px', tip: 'Thickness of a frame around the clip. 0 = none.' }, c => c.border.width, (c, v) => c.border.width = v),
      borderCol,
      App.toggle({ label: 'Drop shadow', value: visual[visual.length - 1].shadow.on, tip: 'Casts a soft shadow under the clip so it floats above the background.', onChange: v => apply(visual, 'Shadow', c => c.shadow.on = v) }),
      sl(visual, 'Shadow blur', { min: 0, max: 150, step: 1, def: 40, unit: 'px', tip: 'Softness of the shadow.' }, c => c.shadow.blur, (c, v) => c.shadow.blur = v),
      sl(visual, 'Shadow opacity', { min: 0, max: 100, step: 1, def: 55, unit: '%', tip: 'Darkness of the shadow.' }, c => c.shadow.opacity, (c, v) => c.shadow.opacity = v),
      sl(visual, 'Shadow distance', { min: 0, max: 100, step: 1, def: 14, unit: 'px', tip: 'How far below the clip the shadow falls.' }, c => c.shadow.dist, (c, v) => c.shadow.dist = v),
    ], { closed: true, id: 'v-shape' }));

    if (media.length) inspBody.append(App.section('Crop', 'crop', [
      sl(media, 'Left', { min: 0, max: 49, step: 0.5, def: 0, unit: '%', tip: 'Trims away the left edge of the picture.' }, c => c.crop.l * 100, (c, v) => c.crop.l = v / 100),
      sl(media, 'Right', { min: 0, max: 49, step: 0.5, def: 0, unit: '%', tip: 'Trims away the right edge.' }, c => c.crop.r * 100, (c, v) => c.crop.r = v / 100),
      sl(media, 'Top', { min: 0, max: 49, step: 0.5, def: 0, unit: '%', tip: 'Trims away the top edge.' }, c => c.crop.t * 100, (c, v) => c.crop.t = v / 100),
      sl(media, 'Bottom', { min: 0, max: 49, step: 0.5, def: 0, unit: '%', tip: 'Trims away the bottom edge.' }, c => c.crop.b * 100, (c, v) => c.crop.b = v / 100),
    ], { closed: true, id: 'v-crop' }));

    if (media.length) {
      const keyCol = App.color({ label: 'Key color', value: media[media.length - 1].key.color, tip: 'The background color to make transparent (usually green or blue).', onStart: () => V.commit('Key color'), onInput: v => { for (const c of media) { c.key.color = v; c.key.on = true; } V.requestRender(); }, onChange: () => V.changed('props') });
      const keyTog = App.toggle({ label: 'Enable', value: media[media.length - 1].key.on, tip: 'Removes the key color so the tracks underneath show through — the classic green-screen effect.', onChange: v => apply(media, 'Chroma key', c => c.key.on = v) });
      inspBody.append(App.section('Chroma key', 'chroma', [
        keyTog,
        keyCol,
        h('div', { class: 'ctl' }, h('label', null, ''), h('div', { class: 'btn-row wrap' },
          btn({ icon: 'dropper', label: 'Pick from viewer', cls: 'solid txt sm', title: 'Pick key color', tip: 'Then click the green/blue background in the viewer to sample its exact color.', onClick: () => { P.pickKey = media[media.length - 1].id; V.drawOverlay(); App.toast('Click the background color in the viewer'); } }),
          btn({ label: 'Green', cls: 'solid txt sm', title: 'Green screen', tip: 'Standard green screen color.', onClick: () => apply(media, 'Key color', c => { c.key.color = '#00b140'; c.key.on = true; }) }),
          btn({ label: 'Blue', cls: 'solid txt sm', title: 'Blue screen', tip: 'Standard blue screen color.', onClick: () => apply(media, 'Key color', c => { c.key.color = '#0047bb'; c.key.on = true; }) }))),
        sl(media, 'Similarity', { min: 0, max: 100, step: 1, def: 38, tip: 'How close a color must be to the key color to be removed. Raise it until the background disappears.' }, c => c.key.similarity, (c, v) => c.key.similarity = v),
        sl(media, 'Smoothness', { min: 0, max: 50, step: 0.5, def: 8, tip: 'Softens the edge between subject and background (helps with hair).' }, c => c.key.smoothness, (c, v) => c.key.smoothness = v),
        sl(media, 'Spill', { min: 0, max: 60, step: 0.5, def: 12, tip: 'Removes the green/blue glow reflected onto your subject’s edges.' }, c => c.key.spill, (c, v) => c.key.spill = v),
      ], { closed: !media[media.length - 1].key.on, id: 'v-key' }));
    }

    const lookChips = h('div', { class: 'chips' }, V.LOOKS.map(lk => {
      const ch = h('button', { class: 'chip', title: lk.name, tip: lk.tip }, lk.name);
      ch.addEventListener('click', () => apply(visual, 'Apply look', c => c.fx = Object.assign(V.defaultFx(), lk.fx)));
      return ch;
    }));
    const fxs = (key, label, min, max, def, unit, tip, step = 1) => sl(visual, label, { min, max, def, unit, tip, step }, c => c.fx[key], (c, v) => c.fx[key] = v, relayout);
    inspBody.append(App.section('Color', 'palette', [
      lookChips,
      fxs('brightness', 'Brightness', 0, 200, 100, '%', 'Lightens or darkens the whole picture.'),
      fxs('contrast', 'Contrast', 0, 200, 100, '%', 'Difference between darks and lights. Higher = punchier.'),
      fxs('saturate', 'Saturation', 0, 300, 100, '%', 'Color intensity. 0% is black & white.'),
      fxs('hue', 'Hue shift', -180, 180, 0, '°', 'Rotates every color around the color wheel.'),
      fxs('blur', 'Blur', 0, 40, 0, 'px', 'Softens the picture — use for backgrounds behind text.', 0.5),
      fxs('grayscale', 'Grayscale', 0, 100, 0, '%', 'Gradually removes color.'),
      fxs('sepia', 'Sepia', 0, 100, 0, '%', 'Warm brown old-photo tint.'),
      fxs('invert', 'Invert', 0, 100, 0, '%', 'Turns the image into its negative.'),
      fxs('vignette', 'Vignette', 0, 100, 0, '%', 'Darkens the edges to draw the eye to the center.'),
    ], { action: btn({ icon: 'undo', cls: 'sm', title: 'Reset color', tip: 'Removes every color adjustment from the clip.', onClick: () => apply(visual, 'Reset color', c => c.fx = V.defaultFx()) }), id: 'v-color' }));

    const trOpts = [['none', 'None'], ...V.TRANSITIONS.map(t => [t.id, t.name])];
    const trSel = (dir) => App.select({ label: dir === 'in' ? 'In' : 'Out', value: visual[visual.length - 1][dir === 'in' ? 'transIn' : 'transOut'].type, tip: dir === 'in' ? 'How the clip appears at its start.' : 'How the clip disappears at its end.',
      options: dir === 'in' ? trOpts : trOpts.filter(o => o[0] !== 'dissolve'),
      onChange: v => apply(visual, 'Transition', c => { const k = dir === 'in' ? 'transIn' : 'transOut'; c[k] = { type: v, dur: Math.min(c[k].dur || 0.5, c.dur / 2) }; }) });
    inspBody.append(App.section('Transitions', 'transition', [
      trSel('in'),
      sl(visual, 'In length', { min: 0.1, max: 5, step: 0.05, def: 0.5, unit: 's', tip: 'How long the intro transition lasts.' }, c => c.transIn.dur, (c, v) => c.transIn.dur = Math.min(v, c.dur), relayout),
      trSel('out'),
      sl(visual, 'Out length', { min: 0.1, max: 5, step: 0.05, def: 0.5, unit: 's', tip: 'How long the outro transition lasts.' }, c => c.transOut.dur, (c, v) => c.transOut.dur = Math.min(v, c.dur), relayout),
    ], { closed: true, id: 'v-trans' }));
  }

  const timing = [];
  if (speedable.length) {
    const row = App.slider({ label: 'Speed', min: 0.1, max: 8, step: 0.05, value: c0.speed, def: 1, unit: '×', tip: 'Plays the clip slower or faster. The clip gets longer or shorter to match, and later clips move along.', onChange: v => O().setSpeed(speedable, v) });
    timing.push(row);
    binds.push(() => row.set(c0.speed));
    timing.push(h('div', { class: 'chips' }, [0.25, 0.5, 1, 1.5, 2, 4].map(s => {
      const ch = h('button', { class: 'chip' + (c0.speed === s ? ' on' : ''), title: s + '× speed', tip: s < 1 ? 'Slow motion.' : s > 1 ? 'Fast forward.' : 'Normal speed.' }, s + '×');
      ch.addEventListener('click', () => O().setSpeed(speedable, s));
      return ch;
    })));
    if (speedable.some(V.hasAudio)) timing.push(App.toggle({ label: 'Keep pitch', value: c0.keepPitch, tip: 'Keeps voices and music at their natural pitch when you speed up or slow down (no chipmunk effect).', onChange: v => apply(speedable, 'Keep pitch', c => c.keepPitch = v) }));
  }
  const stills = cs.filter(c => c.kind === 'image' || c.kind === 'text' || c.kind === 'color');
  if (stills.length) timing.push(sl(stills, 'Duration', { min: 0.2, max: 60, step: 0.1, def: 5, unit: 's', tip: 'How long the still image, title or matte stays on screen.' }, c => +c.dur.toFixed(2), (c, v) => {
    const oldEnd = c.start + c.dur; c.dur = V.snapFrame(v) || v;
    if (V.ripple) V.rippleShift(c.trackId, oldEnd - 1e-6, c.start + c.dur - oldEnd, new Set([c.id]));
  }, relayout));
  if (timing.length) inspBody.append(App.section('Timing', 'speed', timing, { id: 'v-timing' }));

  if (audible.length) {
    inspBody.append(App.section('Audio', 'volume', [
      asl(audible, 'Volume', 'volume', { min: -40, max: 12, step: 0.5, def: 0, unit: 'dB', tip: 'Loudness of this clip. 0 dB is unchanged; go negative to make it quieter (e.g. music under dialogue). Use ◆ keyframes to duck the music only where someone speaks.', fmt: v => (+v).toFixed(1) },
        g => +App.gainToDb(g).toFixed(1), v => v <= -40 ? 0 : App.dbToGain(v), relayout),
      sl(audible, 'Pan', { min: -100, max: 100, step: 1, def: 0, tip: 'Places the sound more to the left (−) or right (+) speaker.' }, c => Math.round(c.pan * 100), (c, v) => c.pan = v / 100),
      sl(audible, 'Fade in', { min: 0, max: 10, step: 0.05, def: 0, unit: 's', tip: 'Ramps the volume up smoothly at the start of the clip.' }, c => c.fadeIn, (c, v) => c.fadeIn = Math.min(v, c.dur), relayout),
      sl(audible, 'Fade out', { min: 0, max: 10, step: 0.05, def: 0, unit: 's', tip: 'Ramps the volume down smoothly at the end of the clip.' }, c => c.fadeOut, (c, v) => c.fadeOut = Math.min(v, c.dur), relayout),
      h('div', { class: 'ctl' }, h('div', { class: 'btn-row wrap' },
        btn({ icon: audible[0].muted ? 'volume' : 'mute', label: audible[0].muted ? 'Unmute' : 'Mute', cls: 'solid txt sm', title: 'Mute clip', tip: 'Silences only these clips.', onClick: () => { apply(audible, 'Mute', c => c.muted = !audible[0].muted); P.rebuildInspector(); } }),
        btn({ icon: 'normalize', label: 'Normalize', cls: 'solid txt sm', title: 'Normalize loudness', tip: 'Sets the volume so these clips sound as loud as YouTube and Spotify expect (−14 LUFS). More targets in Clip ▸ Normalize loudness.', onClick: () => O().normalizeLoudness(-14, audible) }),
        audible.some(c => c.kind === 'video') ? btn({ icon: 'detach', label: 'Detach', cls: 'solid txt sm', title: 'Detach audio', tip: 'Moves the sound to its own audio track.', onClick: () => O().detachAudio(audible) }) : null,
        btn({ icon: 'wave', label: 'Edit in Audio tab', cls: 'solid txt sm', title: 'Open in Audio editor', tip: 'Sends the used part of this sound to the Audio tab for noise reduction, EQ and more.', onClick: () => sendClipAudio(audible[audible.length - 1]) }),
      )),
    ], { id: 'v-audio' }));
  }
  inspBody.scrollTop = scroll;
};
function sendClipAudio(c) {
  const m = V.getMedia(c.mediaId);
  if (!m || !m.audioBuffer) return;
  const ab = m.audioBuffer, sr = ab.sampleRate;
  const s0 = Math.floor(c.in * sr), s1 = Math.min(ab.length, Math.floor((c.in + c.dur * c.speed) * sr));
  App.emit('audio:open', { channels: Array.from({ length: ab.numberOfChannels }, (_, i) => ab.getChannelData(i).slice(s0, s1)), sampleRate: sr, name: V.clipName(c) });
}

function textSection(c, sl, apply) {
  const T = c.text;
  const ta = h('textarea', { value: T.content, rows: 3, title: 'Text', tip: 'Type your title. Press Enter for a new line.' });
  let editing = false;
  ta.addEventListener('focus', () => { editing = false; });
  ta.addEventListener('input', () => { if (!editing) { V.commit('Edit text'); editing = true; } T.content = ta.value; V.requestRender(); });
  ta.addEventListener('blur', () => { if (editing) V.changed('all'); });
  ta.addEventListener('keydown', e => e.stopPropagation());
  P.focusText = () => { ta.focus(); ta.select(); };
  const font = App.select({ label: 'Font', value: T.font, options: App.fontOptions(V.FONTS, T.font), tip: 'Typeface for the title — includes the fonts extracted from GTA San Andreas and L.A. Noire.', onChange: v => { App.ensureFont(v); apply([c], 'Font', k => { k.text.font = v; if (App.isGameFont(v)) k.text.bold = false; }); } });
  const style = h('div', { class: 'btn-row' },
    btn({ icon: 'bold', cls: 'sm' + (T.bold ? ' on' : ''), title: 'Bold', tip: 'Heavier letters.', onClick: e => { apply([c], 'Bold', k => k.text.bold = !k.text.bold); e.currentTarget.classList.toggle('on', T.bold); } }),
    btn({ icon: 'italic', cls: 'sm' + (T.italic ? ' on' : ''), title: 'Italic', tip: 'Slanted letters.', onClick: e => { apply([c], 'Italic', k => k.text.italic = !k.text.italic); e.currentTarget.classList.toggle('on', T.italic); } }),
    App.sep(),
    App.seg({ value: T.align, onChange: v => apply([c], 'Align', k => k.text.align = v), options: [
      { value: 'left', icon: 'alignL', title: 'Align left', tip: 'Lines line up on the left.' },
      { value: 'center', icon: 'alignC', title: 'Center', tip: 'Lines are centered.' },
      { value: 'right', icon: 'alignR', title: 'Align right', tip: 'Lines line up on the right.' }] }));
  const color = App.color({ label: 'Color', value: T.color, tip: 'Text fill color.', onStart: () => V.commit('Text color'), onInput: v => { T.color = v; V.requestRender(); }, onChange: () => V.changed('props') });
  const stroke = App.color({ label: 'Outline', value: T.stroke, tip: 'Color of the outline around the letters (set its width below).', onStart: () => V.commit('Outline color'), onInput: v => { T.stroke = v; V.requestRender(); }, onChange: () => V.changed('props') });
  const bgc = App.color({ label: 'Box color', value: T.bgColor, tip: 'Color of the background box behind the text.', onStart: () => V.commit('Box color'), onInput: v => { T.bgColor = v; V.requestRender(); }, onChange: () => V.changed('props') });
  return App.section('Text', 'text', [
    h('div', { class: 'ctl stack' }, ta),
    font,
    sl([c], 'Size', { min: 8, max: 400, step: 1, def: 110, unit: 'px', tip: 'Letter height in project pixels.' }, k => k.text.size, (k, v) => k.text.size = v),
    h('div', { class: 'ctl', title: 'Style', tip: 'Weight, slant and alignment.' }, h('label', null, 'Style'), style),
    color,
    App.select({ label: 'Animation', value: T.anim, tip: 'How the text animates on screen.', onChange: v => apply([c], 'Text animation', k => k.text.anim = v),
      options: [['none', 'None'], ['fade', 'Fade in & out'], ['rise', 'Rise up'], ['pop', 'Pop'], ['typewriter', 'Typewriter'], ['scroll', 'Scrolling credits']] }),
    App.select({ label: 'Shadow', value: T.shadow, tip: 'Adds depth or glow so the text reads well over busy video.', onChange: v => apply([c], 'Text shadow', k => k.text.shadow = v),
      options: [['none', 'None'], ['soft', 'Soft shadow'], ['hard', 'Hard shadow'], ['glow', 'Neon glow']] }),
    stroke,
    sl([c], 'Outline width', { min: 0, max: 30, step: 0.5, def: 0, unit: 'px', tip: 'Thickness of the letter outline. 0 = none.' }, k => k.text.strokeW, (k, v) => k.text.strokeW = v),
    sl([c], 'Letter spacing', { min: -10, max: 60, step: 0.5, def: 0, unit: 'px', tip: 'Space between letters — wide spacing looks elegant.' }, k => k.text.spacing || 0, (k, v) => k.text.spacing = v),
    App.toggle({ label: 'Background', value: T.bg, tip: 'Puts a rounded box behind the text for readability.', onChange: v => apply([c], 'Text box', k => k.text.bg = v) }),
    bgc,
    sl([c], 'Box opacity', { min: 0, max: 100, step: 1, def: 60, unit: '%', tip: 'How solid the background box is.' }, k => Math.round(k.text.bgAlpha * 100), (k, v) => k.text.bgAlpha = v / 100),
    ...(T.words && T.words.length ? [
      App.select({ label: 'Word highlight', value: T.hl || 'none', tip: 'This caption knows when each word is spoken: color the spoken word, slide a box behind it, or reveal the words one by one.', onChange: v => apply([c], 'Word highlight', k => { k.text.hl = v; }),
        options: [['none', 'Off'], ['color', 'Color the spoken word'], ['box', 'Box behind the spoken word'], ['reveal', 'Reveal word by word']] }),
      App.color({ label: 'Highlight color', value: T.hlColor || '#ffd43b', tip: 'Color of the spoken word (or of its box).', onStart: () => V.commit('Highlight color'), onInput: v => { T.hlColor = v; V.requestRender(); }, onChange: () => V.changed('props') }),
    ] : []),
    ...(c.caption ? [h('div', { class: 'btn-row', style: { padding: '4px 12px' } },
      btn({ icon: 'captions', label: 'Caption styles…', cls: 'solid txt sm', title: 'Caption styles', tip: 'Open Auto captions to restyle every caption at once.', onClick: () => V.captions.open() }))] : []),
  ], { id: 'v-text' });
}
function colorSection(c, apply) {
  const F = c.fill;
  const col = (key, label, tip) => App.color({ label, value: F[key], tip, onStart: () => V.commit('Matte color'), onInput: v => { F[key] = v; V.requestRender(); }, onChange: () => V.changed('all') });
  const ang = App.slider({ label: 'Angle', min: 0, max: 360, step: 1, value: F.angle, def: 135, unit: '°', tip: 'Direction of the gradient.', onStart: () => V.commit('Gradient angle'), onInput: v => { F.angle = v; V.requestRender(); }, onChange: () => V.changed('all') });
  return App.section('Color matte', 'solid', [
    col('c1', 'Color', 'Main fill color.'),
    App.toggle({ label: 'Gradient', value: F.gradient, tip: 'Blend smoothly into a second color.', onChange: v => apply([c], 'Gradient', k => k.fill.gradient = v) }),
    col('c2', 'Second color', 'The color the gradient blends into.'),
    ang,
  ]);
}

function projectInspector() {
  const wrap = h('div');
  const Pj = V.project;
  const pName = h('div', { class: 'ih-name' }, V.name), pSub = h('div', { class: 'ih-sub' });
  const updP = () => { pName.textContent = V.name; pSub.textContent = `${V.clips.length} clip${V.clips.length === 1 ? '' : 's'} · ${tc(V.duration())}`; };
  updP(); binds.push(updP);   // stays current as clips are added, removed or trimmed
  wrap.append(h('div', { class: 'insp-head' }, h('div', { class: 'ih-ico' }, icon('film', 18)), h('div', null, pName, pSub)));
  const key = `${Pj.width}x${Pj.height}`;
  const custW = h('input', { class: 'field', value: Pj.width, style: { width: '70px' }, title: 'Width', tip: 'Custom frame width in pixels.' });
  const custH = h('input', { class: 'field', value: Pj.height, style: { width: '70px' }, title: 'Height', tip: 'Custom frame height in pixels.' });
  const setRes = (w, hh) => {
    w = clamp(Math.round(w / 2) * 2, 16, 7680); hh = clamp(Math.round(hh / 2) * 2, 16, 4320);
    V.commit('Frame size'); Pj.width = w; Pj.height = hh; V.resizeCanvas(); V.changed('sel');
  };
  [custW, custH].forEach(i => { i.addEventListener('change', () => setRes(+custW.value || Pj.width, +custH.value || Pj.height)); i.addEventListener('keydown', e => e.stopPropagation()); });
  wrap.append(App.section('Frame', 'safe', [
    App.select({ label: 'Resolution', value: P.RES.some(r => r[0] === key) ? key : 'custom', tip: 'Size of the exported video. Pick Vertical for phone-first platforms.', options: [...P.RES, ['custom', 'Custom…']], onChange: v => { if (v === 'custom') return custW.focus(); const [w, hh] = v.split('x').map(Number); setRes(w, hh); } }),
    h('div', { class: 'ctl', title: 'Custom size', tip: 'Type any frame size (even numbers).' }, h('label', null, 'Custom'), h('div', { class: 'ctl-main' }, custW, '×', custH)),
    App.select({ label: 'Frame rate', value: Pj.fps, tip: 'Frames per second. 24 looks cinematic, 30 is standard for web, 60 is smooth for gaming and sports.', options: [[24, '24 fps · film'], [25, '25 fps · PAL'], [30, '30 fps · web'], [50, '50 fps'], [60, '60 fps · smooth']], onChange: v => { V.commit('Frame rate'); Pj.fps = +v; V.changed('sel'); } }),
    App.color({ label: 'Background', value: Pj.bg, tip: 'Color shown where no clip covers the frame.', onStart: () => V.commit('Background'), onInput: v => { Pj.bg = v; V.requestRender(); }, onChange: () => V.changed('props') }),
  ], { id: 'v-frame' }));
  wrap.append(App.section('Quick start', 'info', h('div', { class: 'hint' },
    h('b', null, '1. Import'), ' — drop videos, music and photos into the Media bin.', h('br'),
    h('b', null, '2. Arrange'), ' — drag them onto the timeline. Higher video tracks appear on top.', h('br'),
    h('b', null, '3. Cut'), ' — press ', h('kbd', null, 'S'), ' to split, ', h('kbd', null, 'Q'), '/', h('kbd', null, 'W'), ' to trim to the playhead, or use the Blade ', h('kbd', null, 'C'), '. Ctrl-drag a cut to roll it.', h('br'),
    h('b', null, '4. Polish'), ' — click the ', h('b', null, '+'), ' between clips for a transition; add titles and looks; animate with ◆ keyframes.', h('br'),
    h('b', null, '5. Export'), ' — the Export button or ', h('kbd', null, 'Ctrl+E'), '. Your project autosaves as you go.'), { id: 'v-quick' }));
  return wrap;
}
})();
