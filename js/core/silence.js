/* Strata Studio — "Remove silences" dialog shared by the audio and video editors.
   Live preview of levels + threshold + regions, presets, and delete / shorten / mute / mark actions. */
(() => {
'use strict';
const App = window.App, D = App.dsp;
const { h, btn } = App;

const DEFAULTS = { mode: 'auto', sensitivity: 0.4, threshold: -42, minSilence: 0.5, minSound: 0.08, padBefore: 0.1, padAfter: 0.15, action: 'delete', keepGap: 0.3 };
const PRESETS = [
  { name: 'Podcast / voice-over', tip: 'Removes pauses longer than half a second but keeps natural breathing room around every sentence.', p: { mode: 'auto', sensitivity: 0.4, minSilence: 0.5, minSound: 0.1, padBefore: 0.12, padAfter: 0.2, action: 'shorten', keepGap: 0.3 } },
  { name: 'Tight jump cuts', tip: 'YouTube-style: cuts almost every pause for a fast, punchy edit.', p: { mode: 'auto', sensitivity: 0.5, minSilence: 0.25, minSound: 0.06, padBefore: 0.05, padAfter: 0.08, action: 'delete' } },
  { name: 'Gentle', tip: 'Only shortens long gaps and leaves a relaxed pause — good for interviews and storytelling.', p: { mode: 'auto', sensitivity: 0.3, minSilence: 1.0, minSound: 0.12, padBefore: 0.2, padAfter: 0.3, action: 'shorten', keepGap: 0.6 } },
  { name: 'Dead air only', tip: 'Removes only really long silences (2 s or more), e.g. before a recording starts or while setting up.', p: { mode: 'auto', sensitivity: 0.35, minSilence: 2.0, minSound: 0.2, padBefore: 0.25, padAfter: 0.3, action: 'delete' } },
  { name: 'Mark for review', tip: 'Doesn’t cut anything — adds a marker region on every silence so you can decide yourself.', p: { action: 'mark' } },
];

/**
 * opts: { title, hint, sources: [{value, label}], analyze(sourceValue) → {levels, hop, t0, t1} | Promise,
 *         actions: ['delete','shorten','mute','mark'], extra: [App.select/toggle rows], apply(regions, params) → summary text }
 */
App.silenceDialog = (opts) => {
  const saved = Object.assign({}, DEFAULTS, App.settings.silence || {});
  const P = { ...saved };
  const actions = opts.actions || ['delete', 'shorten', 'mute', 'mark'];
  if (!actions.includes(P.action)) P.action = actions[0];
  let src = opts.sources[0].value, A = null, result = null, raf = 0;

  const cv = h('canvas', { class: 'sil-canvas', title: 'Silence preview', tip: 'Loudness over time. Red areas are the silences that will be cut (or shortened, muted, marked). The dashed line is the threshold — anything quieter counts as silence.' });
  const stats = h('div', { class: 'sil-stats' }, 'Analyzing…');
  const ctrl = {};
  const rerun = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; detect(); }); };
  const S = (id, label, min, max, step, unit, tip, scale = 1) => (ctrl[id] = App.slider({ label, min, max, step, value: +(P[id] * scale).toFixed(3), def: DEFAULTS[id] * scale, unit, tip, onInput: v => { P[id] = v / scale; rerun(); } }));
  const modeSeg = App.seg({ value: P.mode, onChange: v => { P.mode = v; showMode(); rerun(); }, options: [
    { value: 'auto', label: 'Automatic', tip: 'Measures the background noise and the speech level and picks the threshold for you.' },
    { value: 'manual', label: 'Manual', tip: 'Set the exact loudness (dB) below which audio counts as silence.' }] });
  const sens = S('sensitivity', 'Sensitivity', 0, 100, 1, '%', 'Higher treats quieter sounds (soft breathing, room noise, whispers) as silence too. Lower keeps more.', 100);
  const thr = S('threshold', 'Threshold', -80, -10, 1, 'dB', 'Audio quieter than this counts as silence.');
  const showMode = () => { sens.style.display = P.mode === 'auto' ? '' : 'none'; thr.style.display = P.mode === 'manual' ? '' : 'none'; };
  const actSeg = App.seg({ value: P.action, onChange: v => { P.action = v; gapRow.style.display = v === 'shorten' ? '' : 'none'; rerun(); }, options: [
    { value: 'delete', label: 'Delete', tip: 'Cuts the silences out and closes the gaps.' },
    { value: 'shorten', label: 'Shorten', tip: 'Keeps a short, even pause instead of removing silences completely — sounds more natural.' },
    { value: 'mute', label: 'Mute', tip: 'Replaces silences with true digital silence (removes room noise) without changing timing.' },
    { value: 'mark', label: 'Mark', tip: 'Only adds marker regions — nothing is cut.' }].filter(o => actions.includes(o.value)) });
  const gapRow = S('keepGap', 'Pause length', 0.05, 2, 0.05, 's', 'How long each shortened pause becomes.');
  gapRow.style.display = P.action === 'shorten' ? '' : 'none';
  const srcSel = opts.sources.length > 1 ? App.select({ label: 'Listen to', value: src, options: opts.sources.map(s => [s.value, s.label]), tip: 'Which audio decides what is silent. E.g. detect on the voice track but cut the music track along with it to keep everything in sync.', onChange: async v => { src = v; await analyze(); } }) : null;
  const presetRow = h('div', { class: 'chips', style: { padding: '2px 0 8px' } }, PRESETS.filter(p => !p.p.action || actions.includes(p.p.action)).map(p => {
    const c = h('button', { class: 'chip', title: p.name, tip: p.tip }, p.name);
    c.addEventListener('click', () => {
      Object.assign(P, p.p);
      for (const [k, row] of Object.entries(ctrl)) row.set(+(P[k] * (k === 'sensitivity' ? 100 : 1)).toFixed(3));
      modeSeg.set(P.mode); actSeg.set(P.action); gapRow.style.display = P.action === 'shorten' ? '' : 'none'; showMode();
      presetRow.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
      rerun();
    });
    return c;
  }));
  showMode();

  const fmt = t => App.fmtTime(Math.max(0, t));
  const removed = () => !result ? 0 : P.action === 'delete' ? result.regions.reduce((s, r) => s + r.t1 - r.t0, 0) : P.action === 'shorten' ? result.regions.reduce((s, r) => s + Math.max(0, r.t1 - r.t0 - P.keepGap), 0) : 0;
  function detect() {
    if (!A) return;
    result = D.detectSilence(A.levels, A.hop, A.t0, P);
    draw();
    const n = result.regions.length, total = A.t1 - A.t0, rm = removed();
    const verb = { delete: 'removes', shorten: 'saves', mute: 'mutes', mark: 'marks' }[P.action];
    const amount = P.action === 'mute' || P.action === 'mark' ? result.regions.reduce((s, r) => s + r.t1 - r.t0, 0) : rm;
    stats.innerHTML = '';
    stats.append(h('b', null, `${n} silence${n === 1 ? '' : 's'}`), ` · ${verb} `, h('b', null, `${amount.toFixed(1)} s`), ` (${Math.round(amount / Math.max(0.001, total) * 100)}%)`,
      P.action === 'delete' || P.action === 'shorten' ? h('span', null, ' · ', h('b', null, fmt(total)), ' → ', h('b', { class: 'sil-new' }, fmt(total - rm))) : '',
      h('span', { class: 'sil-thr' }, ` · threshold ${result.threshold.toFixed(0)} dB${P.mode === 'auto' ? ` (noise ${result.floor.toFixed(0)}, speech ${result.loud.toFixed(0)})` : ''}`));
    applyBtn.textContent = n ? ({ delete: `Cut ${n} silence${n === 1 ? '' : 's'}`, shorten: `Shorten ${n} pause${n === 1 ? '' : 's'}`, mute: `Mute ${n} silence${n === 1 ? '' : 's'}`, mark: `Add ${n} marker${n === 1 ? '' : 's'}` })[P.action] : 'Nothing to do';
    applyBtn.disabled = !n;
  }
  function draw() {
    const dpr = App.fitCanvas(cv), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (!A) return;
    const span = A.t1 - A.t0, x = t => (t - A.t0) / span * W, y = db => H - Math.max(0, Math.min(1, (db + 72) / 72)) * (H - 14 * dpr);
    const css = n => App.cssVar(n);
    // regions
    for (const r of result.regions) {
      ctx.fillStyle = P.action === 'mark' ? 'rgba(255,196,75,.22)' : 'rgba(255,77,106,.24)';
      ctx.fillRect(x(r.t0), 0, Math.max(1, x(r.t1) - x(r.t0)), H);
      if (P.action === 'shorten' && r.t1 - r.t0 > P.keepGap) { const m = (r.t0 + r.t1) / 2; ctx.fillStyle = `rgba(${App.th.ink},.12)`; ctx.fillRect(x(m - P.keepGap / 2), 0, Math.max(1, x(m + P.keepGap / 2) - x(m - P.keepGap / 2)), H); }
    }
    // level curve (max per pixel column)
    const lv = A.levels, cols = W, per = lv.length / cols;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let i = 0; i < cols; i++) { let m = -120; for (let k = Math.floor(i * per); k < Math.min(lv.length, Math.floor((i + 1) * per) + 1); k++) if (lv[k] > m) m = lv[k]; ctx.lineTo(i, y(m)); }
    ctx.lineTo(W, H); ctx.closePath();
    const acc = css('--accent') || 'rgb(160, 138, 255)', fade = acc.startsWith('rgb(') ? acc.replace('rgb(', 'rgba(').replace(')', ', .15)') : acc;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, acc); g.addColorStop(1, fade);
    ctx.fillStyle = g; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    // threshold
    const ty = y(result.threshold);
    const warn = css('--warn') || '#ffc24b';
    ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.strokeStyle = warn; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(W, ty); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = warn; ctx.font = `600 ${10 * dpr}px JetBrains Mono`; ctx.fillText(`${result.threshold.toFixed(0)} dB`, 6 * dpr, ty - 4 * dpr);
    // time ticks
    ctx.fillStyle = css('--muted') || '#888'; ctx.font = `500 ${9.5 * dpr}px JetBrains Mono`;
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800].find(s => s / span * W > 70 * dpr) || 3600;
    for (let t = Math.ceil(A.t0 / step) * step; t < A.t1; t += step) { const X = x(t); ctx.fillRect(X, H - 5 * dpr, dpr, 5 * dpr); ctx.fillText(fmt(t), X + 3 * dpr, H - 3 * dpr); }
  }
  // drag the threshold line directly on the preview
  cv.addEventListener('pointerdown', e => {
    if (!A) return;
    cv.setPointerCapture(e.pointerId);
    const set = ev => { const r = cv.getBoundingClientRect(), db = ((r.height - (ev.clientY - r.top)) / (r.height - 14)) * 72 - 72; P.mode = 'manual'; P.threshold = Math.round(Math.max(-80, Math.min(-10, db))); modeSeg.set('manual'); thr.set(P.threshold); showMode(); rerun(); };
    set(e);
    const mv = ev => set(ev), up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); };
    cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
  });
  async function analyze() {
    stats.textContent = 'Analyzing audio…';
    await App.sleep(10);
    try { A = await opts.analyze(src); } catch (e) { stats.textContent = e.message || 'Could not analyze the audio'; A = null; return; }
    if (!A || !A.levels.length) { stats.textContent = 'No audio to analyze.'; return; }
    detect();
  }
  const applyBtn = h('button', { class: 'btn primary txt', title: 'Apply', tip: 'Applies the edit — fully undoable with Ctrl+Z.' }, 'Apply');
  const md = App.modal({
    title: opts.title || 'Remove silences', icon: 'autocut', width: 760, cls: 'sil-modal',
    body: h('div', { class: 'sil' },
      opts.hint ? h('div', { class: 'hint', style: { padding: '0 0 8px' } }, opts.hint) : null,
      presetRow, cv, stats,
      h('div', { class: 'sil-cols' },
        h('div', null, h('h5', null, 'What counts as silence'), srcSel, h('div', { class: 'ctl', title: 'Threshold', tip: 'Automatic adapts to each recording; manual uses a fixed loudness. You can also drag on the preview to set it.' }, h('label', null, 'Threshold'), modeSeg), sens, thr,
          S('minSilence', 'Minimum pause', 0.1, 5, 0.05, 's', 'Only pauses at least this long are touched. Shorter ones (between words) are left alone.'),
          S('minSound', 'Ignore noises under', 0, 0.5, 0.01, 's', 'Short sounds like clicks, taps or a quick breath shorter than this don’t interrupt a silence.')),
        h('div', null, h('h5', null, 'What to do'), h('div', { class: 'ctl', title: 'Action', tip: 'What happens to each silence.' }, h('label', null, 'Action'), actSeg), gapRow,
          S('padBefore', 'Keep before speech', 0, 0.6, 0.01, 's', 'Breathing room kept right before speech starts again, so words never sound clipped.'),
          S('padAfter', 'Keep after speech', 0, 0.8, 0.01, 's', 'Room kept after a word ends, so sentences can trail off naturally.'),
          ...(opts.extra || [])))),
    left: h('span', { class: 'hint', style: { padding: 0 } }, 'Tip: drag on the preview to set the threshold by hand.'),
    buttons: [{ label: 'Cancel' }],
    onClose: () => cancelAnimationFrame(raf),
  });
  md.foot.append(applyBtn);
  applyBtn.addEventListener('click', async () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; detect(); }   // a slider moved since the last frame — use the latest result
    if (!result || !result.regions.length) return;
    App.setSetting('silence', Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, P[k]])));
    md.close(true);
    const regions = P.action === 'shorten'
      ? result.regions.filter(r => r.t1 - r.t0 > P.keepGap + 0.02).map(r => { const m = (r.t0 + r.t1) / 2; return { t0: Math.max(r.t0, m - (r.t1 - r.t0) / 2 + P.keepGap / 2), t1: Math.min(r.t1, m + (r.t1 - r.t0) / 2 - P.keepGap / 2) }; })
      : result.regions;
    await opts.apply(regions, { ...P, removed: removed(), total: A.t1 - A.t0 });
  });
  new ResizeObserver(() => draw()).observe(cv);
  analyze();
};
})();
