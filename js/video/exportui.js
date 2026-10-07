/* Video editor — export dialog (presets, formats, quality) and progress window */
(() => {
'use strict';
const App = window.App, V = App.V;
const { h, icon, btn, clamp } = App;
const P = V.panels;
const tc = t => App.tc(t, V.project.fps);

const even = v => Math.max(2, Math.round(v / 2) * 2);
const sizeFor = (height) => {
  const ar = V.project.width / V.project.height;
  if (height === 'project') return [V.project.width, V.project.height];
  // "height" means the short side for portrait projects
  if (ar >= 1) return [even(height * ar), even(height)];
  return [even(height), even(height / ar)];
};
const BPP = { draft: 0.05, good: 0.09, high: 0.15, max: 0.28 };

P.exportDialog = () => {
  if (!V.clips.length) return App.toast('The timeline is empty — add some clips first', 'warn');
  const fast = V.canFastExport();
  const hasRange = V.range.in != null || V.range.out != null;
  const S = { format: 'mp4', res: 'project', fps: V.project.fps, quality: 'high', range: hasRange ? 'range' : 'all', gifW: 480, gifFps: 15, audio: 'm4a' };
  const presets = [
    { k: 'original', name: 'Original', sub: `${V.project.width}×${V.project.height}`, tip: 'Exactly your project settings — the safest choice.', set: { format: 'mp4', res: 'project', quality: 'high' } },
    { k: 'yt', name: 'YouTube', sub: '1080p · high', tip: 'Great quality for YouTube and Vimeo uploads.', set: { format: 'mp4', res: 1080, quality: 'high' } },
    { k: 'social', name: 'Social', sub: '1080 · good', tip: 'Instagram, TikTok, X — smaller file, still crisp on phones.', set: { format: 'mp4', res: 1080, quality: 'good' } },
    { k: 'web', name: 'Web small', sub: '720p · WebM', tip: 'Compact WebM for websites and sharing over slow connections.', set: { format: 'webm', res: 720, quality: 'good' } },
    { k: '4k', name: '4K master', sub: '2160p · max', tip: 'Highest quality for archiving or further editing.', set: { format: 'mp4', res: 2160, quality: 'max' } },
    { k: 'gif', name: 'GIF', sub: '480 · 15 fps', tip: 'Animated GIF that loops forever — best for short clips (under ~15 s).', set: { format: 'gif' } },
    { k: 'audio', name: 'Audio only', sub: 'M4A / WAV', tip: 'Just the soundtrack, without video.', set: { format: 'audio' } },
  ];
  const presetRow = h('div', { class: 'exp-presets' });
  const name = h('input', { class: 'field wide', value: (V.name || 'strata-edit').replace(/[\\/:*?"<>|]/g, ''), title: 'File name', tip: 'Name of the downloaded file (extension added automatically).' });
  name.addEventListener('keydown', e => e.stopPropagation());
  const formatSeg = App.seg({ value: S.format, onChange: v => { S.format = v; refresh(); }, options: [
    { value: 'mp4', label: 'MP4', tip: 'H.264 video + AAC audio. Plays everywhere: phones, TVs, every website.' },
    { value: 'webm', label: 'WebM', tip: 'VP9 video + Opus audio. Smaller files, great for the web.' },
    { value: 'gif', label: 'GIF', tip: 'Silent, looping animation. Large files — keep it short.' },
    { value: 'audio', label: 'Audio', tip: 'Export only the mixed soundtrack.' }] });
  const resSel = App.select({ label: 'Resolution', value: S.res, tip: 'Output size. The shape (aspect ratio) always matches your project.', options: [['project', `Project (${V.project.width}×${V.project.height})`], [2160, '2160p · 4K'], [1440, '1440p'], [1080, '1080p · Full HD'], [720, '720p · HD'], [480, '480p'], [360, '360p']], onChange: v => { S.res = v === 'project' ? 'project' : +v; refresh(); } });
  const fpsSel = App.select({ label: 'Frame rate', value: S.fps, tip: 'Frames per second of the exported file. Keep your project rate unless you know you need another.', options: [[24, '24 fps'], [25, '25 fps'], [30, '30 fps'], [50, '50 fps'], [60, '60 fps']], onChange: v => { S.fps = +v; refresh(); } });
  const qSeg = App.seg({ value: S.quality, onChange: v => { S.quality = v; refresh(); }, options: [
    { value: 'draft', label: 'Draft', tip: 'Smallest file, visible compression. Good for quick previews.' },
    { value: 'good', label: 'Good', tip: 'Balanced quality and size.' },
    { value: 'high', label: 'High', tip: 'Recommended — clean picture.' },
    { value: 'max', label: 'Max', tip: 'Nearly lossless, very large files.' }] });
  const gifW = App.select({ label: 'GIF width', value: S.gifW, tip: 'Width of the GIF. Smaller = much smaller file.', options: [[320, '320 px'], [480, '480 px'], [640, '640 px'], [800, '800 px']], onChange: v => { S.gifW = +v; refresh(); } });
  const gifFps = App.select({ label: 'GIF fps', value: S.gifFps, tip: 'Frames per second. 10–15 keeps GIFs small and smooth enough.', options: [[8, '8 fps'], [10, '10 fps'], [12, '12 fps'], [15, '15 fps'], [20, '20 fps'], [25, '25 fps']], onChange: v => { S.gifFps = +v; refresh(); } });
  const audSeg = App.seg({ value: S.audio, onChange: v => { S.audio = v; refresh(); }, options: [
    { value: 'm4a', label: 'M4A (AAC)', tip: 'Compressed, plays everywhere (iPhone, Android, Windows, Mac).' },
    { value: 'wav', label: 'WAV', tip: 'Uncompressed, maximum quality, big files.' },
    { value: 'opus', label: 'Opus (WebM)', tip: 'Very efficient compression, great for voice.' }] });
  const rangeSeg = App.seg({ value: S.range, onChange: v => { S.range = v; refresh(); }, options: [
    { value: 'all', label: 'Whole timeline', tip: 'Exports from the start to the end of the last clip.' },
    { value: 'range', label: 'In → Out', tip: hasRange ? 'Exports only between your in and out marks.' : 'Set in/out marks with I and O first.' }] });
  const ctlRow = (label, el, tip) => h('div', { class: 'ctl', title: label, tip }, h('label', null, label), el);
  const vidRows = h('div', null, resSel, fpsSel, ctlRow('Quality', qSeg, 'Higher quality makes bigger files.'));
  const gifRows = h('div', null, gifW, gifFps);
  const audRows = h('div', null, ctlRow('Audio format', audSeg, 'File type for the soundtrack.'));
  const summary = h('div', { class: 'exp-summary' });
  const note = h('div', { class: 'hint' });
  const range = () => S.range === 'range' && hasRange ? V.playRange() : [0, V.duration()];
  const refresh = () => {
    formatSeg.set(S.format); qSeg.set(S.quality); rangeSeg.set(S.range);
    vidRows.style.display = S.format === 'mp4' || S.format === 'webm' ? '' : 'none';
    gifRows.style.display = S.format === 'gif' ? '' : 'none';
    audRows.style.display = S.format === 'audio' ? '' : 'none';
    resSel.set(S.res); fpsSel.set(S.fps);
    const [a, b] = range(), dur = b - a;
    let w, hh, est, enc;
    if (S.format === 'gif') { w = even(S.gifW); hh = even(S.gifW * V.project.height / V.project.width); est = w * hh * S.gifFps * dur * 0.12; enc = 'GIF encoder'; }
    else if (S.format === 'audio') { w = hh = 0; est = S.audio === 'wav' ? dur * 48000 * 4 : dur * 192000 / 8; enc = S.audio === 'wav' ? 'PCM 16-bit' : S.audio === 'm4a' ? 'AAC 192 kbps' : 'Opus 192 kbps'; }
    else { [w, hh] = sizeFor(S.res); est = (w * hh * S.fps * BPP[S.quality] + 192000) * dur / 8; enc = fast ? 'Fast offline (WebCodecs)' : 'Real-time (compatibility)'; }
    summary.innerHTML = '';
    summary.append(
      h('div', null, 'Output', h('b', null, S.format === 'audio' ? '—' : `${w}×${hh}`)),
      h('div', null, 'Length', h('b', null, tc(dur))),
      h('div', null, 'Est. size', h('b', null, '≈ ' + App.fmtBytes(Math.round(est)))),
      h('div', null, 'Frame rate', h('b', null, S.format === 'gif' ? S.gifFps + ' fps' : S.format === 'audio' ? '—' : S.fps + ' fps')),
      h('div', null, 'Encoder', h('b', null, enc)),
      h('div', null, 'Range', h('b', null, `${tc(a)} → ${tc(b)}`)));
    note.textContent = S.format === 'gif' && dur > 20 ? 'Heads-up: long GIFs get very large. Consider setting an in/out range.'
      : (S.format === 'mp4' || S.format === 'webm') && !fast ? 'Your browser lacks WebCodecs, so export runs in real time — keep this tab visible.'
      : 'Rendering is frame-accurate and keeps running even if you switch tabs.';
    presetRow.querySelectorAll('.exp-preset').forEach(p => p.classList.toggle('on', p._match()));
  };
  for (const p of presets) {
    const el = h('button', { class: 'exp-preset', type: 'button', title: p.name, tip: p.tip }, h('b', null, p.name), h('small', null, p.sub));
    el._match = () => Object.entries(p.set).every(([k, v]) => S[k] === v);
    el.addEventListener('click', () => { Object.assign(S, p.set); refresh(); });
    presetRow.append(el);
  }
  refresh();
  App.modal({
    title: 'Export', icon: 'download', width: 560,
    body: h('div', null, presetRow,
      h('div', { class: 'ctl stack' }, h('label', null, 'File name'), name),
      ctlRow('Format', formatSeg, 'Choose the kind of file to create.'), vidRows, gifRows, audRows,
      ctlRow('Range', rangeSeg, 'Export everything or only a section.'), summary, note),
    buttons: [{ label: 'Cancel' }, { label: 'Export', icon: 'download', primary: true, onClick: () => {
      const [a, b] = range();
      const fname = (name.value || 'strata-edit').replace(/[\\/:*?"<>|]/g, '');
      if (S.format === 'audio') return void runAudioExport(fname, S.audio, a, b);
      if (S.format === 'gif') { const w = even(S.gifW), hh = even(S.gifW * V.project.height / V.project.width); return void runJob(fname, 'gif', V.exportGif({ width: w, height: hh, fps: S.gifFps, t0: a, t1: b, onProgress, onStage }), b - a); }
      const [w, hh] = sizeFor(S.res);
      const vb = Math.round(w * hh * S.fps * BPP[S.quality]);
      if (!fast) {
        const fm = V.realtimeFormats().find(f => f[1] === S.format) || V.realtimeFormats()[0];
        if (!fm) return App.toast('This browser cannot export video', 'err');
        return void runJob(fname, fm[1], V.exportRealtime({ mime: fm[0], bitrate: vb, t0: a, t1: b, onProgress }), b - a);
      }
      runJob(fname, S.format, V.exportFast({ container: S.format, width: w, height: hh, fps: S.fps, vbitrate: vb, abitrate: 192000, t0: a, t1: b, onProgress, onStage }), b - a);
    } }],
  });
};

let progUI = null;
const onProgress = (p, elapsed, frameCanvas) => progUI && progUI.update(p, elapsed, frameCanvas);
const onStage = s => progUI && progUI.stage(s);
function runJob(fname, ext, job, dur) {
  const bar = h('i'), stageEl = h('div', { style: { fontWeight: 800, fontSize: '13px', marginBottom: '10px' } }, 'Preparing…');
  const pct = h('span', null, '0%'), eta = h('span', null, ''), speed = h('span', null, '');
  const thumb = h('canvas', { width: 160, height: 90, style: { width: '160px', height: '90px', borderRadius: '8px', background: '#000', flex: 'none', boxShadow: '0 0 0 1px var(--line-2)' } });
  const started = performance.now();
  progUI = {
    stage: s => { stageEl.textContent = s; },
    update: (p, elapsed, fc) => {
      bar.style.width = clamp(p * 100, 0, 100) + '%';
      pct.textContent = Math.round(p * 100) + '%';
      const el = elapsed ?? (performance.now() - started) / 1000;
      if (p > 0.02) { const rem = el / p * (1 - p); eta.textContent = `about ${App.fmtDur(rem)} left`; speed.textContent = `${(dur * p / Math.max(0.01, el)).toFixed(1)}× real time`; }
      if (fc) { const tx = thumb.getContext('2d'); tx.drawImage(fc, 0, 0, 160, 90); }
    },
  };
  let finished = false;
  const md = App.modal({ title: 'Exporting', icon: 'download', width: 460, pad: true,
    body: h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center' } }, thumb, h('div', { style: { flex: 1, minWidth: 0 } }, stageEl, h('div', { class: 'progress' }, bar), h('div', { class: 'prog-meta' }, pct, speed, eta))),
    buttons: [{ label: 'Cancel export', tip: 'Stops rendering; nothing is saved.', onClick: () => { job.cancel(); } }],
    onClose: () => { if (!finished) job.cancel(); } });   // Esc or a click outside also stops the export (it used to keep rendering unseen)
  V.renderFrame(V.time);
  job.promise.then(blob => {
    finished = true; md.close(); progUI = null;
    const file = `${fname}.${ext}`;
    App.download(blob, file);
    const secs = (performance.now() - started) / 1000;
    App.modal({ title: 'Export complete', icon: 'check', width: 400, pad: true,
      body: h('div', null, h('div', { style: { fontSize: '14px', fontWeight: 800, marginBottom: '6px' } }, file), h('div', { class: 'hint', style: { padding: 0 } }, `${App.fmtBytes(blob.size)} · rendered in ${App.fmtDur(secs)}. The file is in your Downloads folder.`)),
      buttons: [{ label: 'Download again', icon: 'download', onClick: () => { App.download(blob, file); return false; } }, { label: 'Done', primary: true }] });
  }).catch(err => {
    finished = true; md.close(); progUI = null;
    if (err && err.message === 'cancelled') App.toast('Export cancelled');
    else { console.error(err); App.toast('Export failed: ' + (err && err.message || err), 'err', 6000); }
  }).finally(() => { V.renderFrame(V.time); });
}
async function runAudioExport(fname, fmt, a, b) {
  if (!V.clips.some(V.hasAudio) || !(b > a)) return App.toast('There is no sound on the timeline to export', 'warn');
  App.toast('Mixing audio…');
  try {
    const blob = await V.exportAudioFile(fmt, a, b);
    App.download(blob, `${fname}.${fmt === 'opus' ? 'webm' : fmt}`);
    App.toast(`Exported audio · ${App.fmtBytes(blob.size)}`, 'ok');
  } catch (e) { App.toast(e.message || 'Audio export failed', 'err', 5000); }
}
P.exportAudio = () => runAudioExport('strata-mix', 'wav', 0, V.duration());
P.sendMixToAudio = async () => {
  const d = V.duration();
  if (!d) return App.toast('Nothing to mix yet', 'warn');
  const ab = await V.renderMix(0, d);
  App.emit('audio:open', { channels: [ab.getChannelData(0).slice(), ab.getChannelData(1).slice()], sampleRate: ab.sampleRate, name: 'Video mix' });
};
})();
