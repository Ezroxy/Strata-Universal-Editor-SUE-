/* Video editor — Auto captions (Clip ▸ Auto captions…, Ctrl+Shift+C).
   Speech-to-text runs on this computer with OpenAI Whisper (see captions-worker.js) — no internet, no upload.
   Words come back with timings and are grouped into readable captions (balanced lines, sentence-aware breaks),
   proofread in an editable list, and placed as styled text clips on a new "Captions" track, optionally with the
   spoken word highlighted. Also: restyle existing captions, import / export .srt subtitles. */
(() => {
'use strict';
const App = window.App, V = App.V;
const { h, btn, clamp } = App;
const SR = 16000;
const deep = o => JSON.parse(JSON.stringify(o));
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const r3 = t => Math.round(t * 1000) / 1000;
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
const clock = s => { s = Math.max(0, Math.round(s)); return s < 60 ? s + ' s' : `${Math.floor(s / 60)} min ${s % 60 ? (s % 60) + ' s' : ''}`.trim(); };

const LANGS = [['auto', 'Detect automatically'], ['en', 'English'], ['ar', 'Arabic'], ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['pl', 'Polish'], ['tr', 'Turkish'], ['fa', 'Persian'], ['ur', 'Urdu'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['vi', 'Vietnamese'], ['th', 'Thai'], ['id', 'Indonesian'], ['ms', 'Malay'], ['sv', 'Swedish'], ['no', 'Norwegian'], ['da', 'Danish'], ['fi', 'Finnish'], ['el', 'Greek'], ['he', 'Hebrew'], ['ro', 'Romanian'], ['hu', 'Hungarian'], ['cs', 'Czech']];
const langName = code => (LANGS.find(l => l[0] === code) || [0, code.toUpperCase()])[1];

/* caption looks — sizes are for a 1080-pixel frame and scale with the project */
const STYLES = [
  { id: 'clean', name: 'Clean', tip: 'White bold text with a soft shadow — readable on anything.', text: { font: 'Manrope', size: 58, bold: true, color: '#ffffff', shadow: 'soft', strokeW: 0, bg: false, anim: 'none', hl: 'none', hlColor: '#ffd43b' }, pos: 'bottom', length: 'medium', lines: 2, upper: false },
  { id: 'subs', name: 'Subtitles', tip: 'Classic subtitles in a dark box.', text: { font: 'Manrope', size: 50, bold: false, color: '#ffffff', shadow: 'none', strokeW: 0, bg: true, bgColor: '#000000', bgAlpha: 0.65, anim: 'none', hl: 'none', hlColor: '#ffd43b' }, pos: 'bottom', length: 'long', lines: 2, upper: false },
  { id: 'pop', name: 'Pop words', tip: 'Big punchy words, the spoken one in yellow — the social-media look.', text: { font: 'Manrope', size: 92, bold: true, color: '#ffffff', stroke: '#000000', strokeW: 7, shadow: 'hard', bg: false, anim: 'pop', hl: 'color', hlColor: '#ffe14a' }, pos: 'middle', length: 'short', lines: 1, upper: true },
  { id: 'box', name: 'Highlight box', tip: 'A colored box jumps from word to word as they are spoken.', text: { font: 'Manrope', size: 70, bold: true, color: '#ffffff', shadow: 'soft', strokeW: 0, bg: false, anim: 'none', hl: 'box', hlColor: '#7c5cff' }, pos: 'bottom', length: 'short', lines: 2, upper: false },
  { id: 'reveal', name: 'Word by word', tip: 'Words appear one at a time, exactly when they are said.', text: { font: 'Manrope', size: 72, bold: true, color: '#ffffff', stroke: '#000000', strokeW: 4, shadow: 'soft', bg: false, anim: 'none', hl: 'reveal', hlColor: '#ffd43b' }, pos: 'middle', length: 'short', lines: 2, upper: false },
  { id: 'minimal', name: 'Minimal', tip: 'Small, light and unobtrusive.', text: { font: 'Manrope', size: 42, bold: false, color: '#f4f4f4', shadow: 'soft', strokeW: 0, bg: false, anim: 'fade', hl: 'none', hlColor: '#ffd43b' }, pos: 'bottom', length: 'long', lines: 2, upper: false },
  { id: 'impact', name: 'Impact', tip: 'Tall condensed letters with a thick outline; the spoken word turns green.', text: { font: 'Bebas Neue', size: 112, bold: false, color: '#ffffff', stroke: '#111111', strokeW: 6, shadow: 'none', bg: false, anim: 'pop', hl: 'color', hlColor: '#4cf0a0' }, pos: 'middle', length: 'short', lines: 1, upper: true },
  { id: 'neon', name: 'Neon', tip: 'Glowing cyan text for music and night scenes.', text: { font: 'Manrope', size: 66, bold: true, color: '#5ef2ff', shadow: 'glow', strokeW: 0, bg: false, anim: 'fade', hl: 'none', hlColor: '#ff5ef2' }, pos: 'bottom', length: 'medium', lines: 2, upper: false },
];
const LENGTH = { short: { chars: 16, dur: 2.6 }, medium: { chars: 30, dur: 5 }, long: { chars: 42, dur: 6.5 } };

/* ---------- caption geometry: scaled style, measuring, balanced line wrapping ---------- */
const measureCtx = document.createElement('canvas').getContext('2d');
const scaleK = () => Math.min(V.project.width, V.project.height) / 1080;
const styledText = look => {
  const k = scaleK(), T = Object.assign(V.defaultText(), deep(look.text));
  T.size = Math.max(8, Math.round(look.text.size * k)); T.strokeW = (look.text.strokeW || 0) * k; T.spacing = (look.text.spacing || 0) * k;
  return T;
};
const measurer = T => { measureCtx.font = V.textFont(T); if ('letterSpacing' in measureCtx) measureCtx.letterSpacing = (T.spacing || 0) + 'px'; return s => measureCtx.measureText(s).width; };
const maxLineW = (look, T) => {
  const P = V.project, chars = LENGTH[look.length].chars * clamp(P.width / P.height / (16 / 9), 0.55, 1);
  return Math.min(P.width * 0.88, T.size * 0.56 * Math.max(8, chars));
};
/** split tokens into ≤ maxLines lines, balancing two-line captions so neither line is much longer */
const wrap = (toks, look, T) => {
  const mw = measurer(T), maxW = maxLineW(look, T), all = toks.join(' ');
  if (look.lines === 1 || toks.length < 2 || mw(all) <= maxW * 0.62) return [all];
  let best = null, bw = Infinity;
  for (let i = 1; i < toks.length; i++) { const a = toks.slice(0, i).join(' '), b = toks.slice(i).join(' '), w = Math.max(mw(a), mw(b)); if (w < bw) { bw = w; best = [a, b]; } }
  return best;
};
const fits = (toks, look, T) => { const mw = measurer(T), maxW = maxLineW(look, T); return look.lines === 1 ? mw(toks.join(' ')) <= maxW : wrap(toks, look, T).every(l => mw(l) <= maxW); };
const shown = (s, look) => (look.upper ? s.toLocaleUpperCase() : s);

/** words [{text, t0, t1}] (timeline seconds) → captions [{t0, t1, words}] */
function group(words, look) {
  const T = styledText(look), maxDur = LENGTH[look.length].dur, cues = [];
  let cur = null;
  for (const w of words) {
    if (cur) {
      const prev = cur.words[cur.words.length - 1].text, toks = [...cur.words, w].map(x => shown(x.text, look));
      const brk = w.t0 - cur.t1 > 0.7 || /[.!?…。！？؟]["'”’)]*$/.test(prev) || w.t1 - cur.t0 > maxDur || !fits(toks, look, T)
        || (/[,;:،]$/.test(prev) && cur.words.length >= 3 && look.length !== 'short');
      if (brk) { cues.push(cur); cur = null; }
    }
    if (!cur) cur = { t0: w.t0, t1: w.t1, words: [] };
    cur.words.push(w); cur.t1 = Math.max(cur.t1, w.t1);
  }
  if (cur) cues.push(cur);
  // timing polish: stay up at least 0.7 s and linger 0.25 s after the last word, without overlapping the next caption
  cues.forEach((c, i) => { const next = cues[i + 1], want = Math.max(c.t0 + 0.7, c.t1 + 0.25); c.t1 = next ? Math.max(c.t1, Math.min(want, next.t0)) : want; });
  return cues;
}
const cueText = c => c.words.map(w => w.text).join(' ');
/** spread tokens over [t0, t1] by length — for edited captions, imported subtitles and segment-only results */
const spread = (text, t0, t1) => {
  const toks = text.split(/\s+/).filter(Boolean), tot = toks.reduce((n, w) => n + w.length + 1, 0) || 1;
  let acc = 0;
  return toks.map(w => { const a = t0 + (t1 - t0) * acc / tot; acc += w.length + 1; return { text: w, t0: a, t1: t0 + (t1 - t0) * acc / tot }; });
};

/** build the text clip for one caption */
function captionClip(cue, look, trackId) {
  const P = V.project, T = styledText(look), start = V.snapFrame(cue.t0), end = Math.max(start + V.frame(), V.snapFrame(cue.t1));
  const raw = cue.words.map(w => w.text);
  T.content = wrap(raw.map(s => shown(s, look)), look, T).join('\n');
  T.words = cue.words.map(w => [r3(Math.max(0, w.t0 - start)), r3(Math.max(0, w.t1 - start))]);
  const c = V.makeClip({ kind: 'text', trackId, start, dur: end - start, text: T, caption: true, capText: raw.join(' '), transIn: { type: 'none', dur: 0.2 }, transOut: { type: 'none', dur: 0.2 } });
  c.y = posY(c, look);
  return c;
}
const posY = (c, look) => {
  const H = V.project.height, L = V.textLayout(c), m = H * 0.075;
  return Math.round(look.pos === 'top' ? -H / 2 + m + L.h / 2 : look.pos === 'middle' ? 0 : H / 2 - m - L.h / 2);
};

/* ---------- sound → 16 kHz mono (only the chosen clips; tracks muted / soloed as you hear them) ---------- */
const audible = () => {
  const soloOn = V.tracks.some(tr => tr.type === 'audio' && tr.solo);
  return V.clips.filter(c => { const tr = V.getTrack(c.trackId), m = V.getMedia(c.mediaId); return tr && V.hasAudio(c) && !c.muted && !tr.muted && !(soloOn && !(tr.type === 'audio' && tr.solo)) && m && m.audioBuffer; });
};
async function renderAudio(clips, t0, t1, onProgress) {
  const total = Math.max(0.1, t1 - t0), out = new Float32Array(Math.ceil(total * SR)), BLOCK = 240;
  for (let a = t0; a < t1; a += BLOCK) {
    const b = Math.min(t1, a + BLOCK), off = Math.round((a - t0) * SR), len = Math.max(1, Math.min(out.length - off, Math.ceil((b - a) * SR)));
    const oac = new OfflineAudioContext(1, len, SR);
    let any = false;
    for (const c of clips) {
      const s = Math.max(a, c.start), e = Math.min(b, c.start + c.dur), ab = V.getMedia(c.mediaId).audioBuffer, sp = c.speed || 1;
      const from = c.in + (s - c.start) * sp;
      if (e <= s || from >= ab.duration) continue;
      const src = oac.createBufferSource(), g = oac.createGain();
      src.buffer = ab; src.playbackRate.value = sp; g.gain.value = Math.max(0.05, c.volume ?? 1);
      src.connect(g); g.connect(oac.destination); src.start(s - a, from, (e - s) * sp); any = true;
    }
    if (any) out.set((await oac.startRendering()).getChannelData(0).subarray(0, len), off);
    onProgress && onProgress(Math.min(1, (b - t0) / total));
  }
  return out;
}

/* ---------- the speech model lives in a worker; it is unloaded when the window closes ---------- */
let worker = null;
const getWorker = () => worker || (worker = new Worker('js/video/captions-worker.js', { type: 'module' }));
const killWorker = () => { if (worker) { worker.terminate(); worker = null; } };

/* ---------- .srt ---------- */
const srtTime = t => { const ms = Math.max(0, Math.round(t * 1000)), p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const toSrt = list => list.map((c, i) => `${i + 1}\n${srtTime(c.t0)} --> ${srtTime(c.t1)}\n${c.text}\n`).join('\n');
const parseTime = s => { const m = s.trim().replace(',', '.').split(':').map(Number); return m.length === 3 ? m[0] * 3600 + m[1] * 60 + m[2] : m[0] * 60 + m[1]; };
const parseSubs = txt => {
  const out = [];
  for (const block of txt.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n'), i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->'), text = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
    const t0 = parseTime(a), t1 = parseTime(b.trim().split(/\s+/)[0]);
    if (text && isFinite(t0) && isFinite(t1) && t1 > t0) out.push({ t0, t1, text });
  }
  return out;
};
const captionClips = () => V.clips.filter(c => c.kind === 'text' && c.caption).sort((a, b) => a.start - b.start);
const newCaptionTrack = () => {
  const names = new Set(V.tracks.map(t => t.name));
  let name = 'Captions', n = 2; while (names.has(name)) name = 'Captions ' + n++;
  const tr = V.addTrack('video'); tr.name = name; return tr;
};
function addCaptions(cues, look, label = 'Auto captions') {
  if (!cues.length) return;
  V.commit(label);
  const tr = newCaptionTrack();
  for (const cue of cues) V.clips.push(captionClip(cue, look, tr.id));
  V.sel = new Set(); V.changed();
  App.toast(`Added ${cues.length} caption${cues.length === 1 ? '' : 's'} on the “${tr.name}” track`, 'ok', 6000, { label: 'Undo', fn: V.undo });
}
function restyle(look) {
  const list = captionClips();
  if (!list.length) return App.toast('There are no captions on the timeline yet', 'warn');
  V.commit('Restyle captions');
  for (const c of list) {
    const raw = c.capText || c.text.content.replace(/\n/g, ' '), toks = raw.split(/\s+/).filter(Boolean), old = c.text.words;
    const T = styledText(look);
    T.content = wrap(toks.map(s => shown(s, look)), look, T).join('\n');
    T.words = old && old.length ? old : spread(raw, c.in || 0, (c.in || 0) + c.dur * 0.9).map(w => [r3(w.t0), r3(w.t1)]);
    c.text = T; c.y = posY(c, look); c.x = 0;
  }
  V.changed();
  App.toast(`Restyled ${list.length} caption${list.length === 1 ? '' : 's'}`, 'ok', 5000, { label: 'Undo', fn: V.undo });
}
function exportSrt() {
  const list = captionClips();
  if (!list.length) return App.toast('No captions to export — make some with Clip ▸ Auto captions first', 'warn');
  const txt = toSrt(list.map(c => ({ t0: c.start, t1: c.start + c.dur, text: c.text.content })));
  App.download(new Blob([txt], { type: 'application/x-subrip' }), (V.name || 'captions').replace(/[\\/:*?"<>|]+/g, '_') + '.srt');
}
async function importSrt() {
  const [f] = await App.pickFiles('.srt,.vtt,text/vtt', false);
  if (!f) return;
  const subs = parseSubs(await f.text());
  if (!subs.length) return App.toast('No subtitles found in that file', 'warn');
  const look = loadLook();
  addCaptions(subs.map(s => ({ t0: s.t0, t1: s.t1, words: spread(s.text, s.t0, s.t1 - Math.min(0.25, (s.t1 - s.t0) * 0.2)) })), look, 'Import captions');
}
const loadLook = () => { const l = store.get('strata.captions.look', null); return l && l.text && LENGTH[l.length] ? l : deep(STYLES[0]); };

/* =====================================================================
   The Auto captions window
   ===================================================================== */
function open() {
  const sources = audible();
  if (!sources.length) return App.toast('Add a video or audio clip with sound first — captions are made from what is said', 'warn');
  V.pause && V.pause();
  const opt = Object.assign({ source: 'all', lang: 'auto', task: 'transcribe', range: false }, store.get('strata.captions.opt', {}));
  let look = loadLook();
  const saveOpt = () => { store.set('strata.captions.opt', { lang: opt.lang, task: opt.task }); store.set('strata.captions.look', look); };
  let words = [], cues = [], selCue = -1, running = false, detected = null, md = null, raf = 0;

  /* ---------- settings column ---------- */
  const sel = V.ops.selClips().filter(c => sources.includes(c));
  const srcOptions = [['all', 'Everything you hear on the timeline'], ...(sel.length ? [['sel', `Only the selected clip${sel.length > 1 ? 's' : ''}`]] : []), ...(sources.length > 1 && sources.length <= 14 ? sources.map(c => [c.id, 'Only “' + V.clipName(c) + '”']) : [])];
  if (!srcOptions.some(o => o[0] === opt.source)) opt.source = sel.length ? 'sel' : 'all';
  const hasRange = V.range && V.range.in != null && V.range.out != null && V.range.out > V.range.in;
  const srcSel = App.select({ label: 'Listen to', value: opt.source, options: srcOptions, tip: 'Which sound to transcribe. Pick just the voice clip if there is music on other tracks — the model hears more clearly.', onChange: v => { opt.source = v; } });
  const rangeTg = hasRange ? App.toggle({ label: 'Only In → Out', value: opt.range, tip: 'Only caption the part between the In and Out points you marked on the timeline (I / O keys).', onChange: v => { opt.range = v; } }) : null;
  const langSel = App.select({ label: 'Language', value: opt.lang, options: LANGS, tip: 'The language being spoken. “Detect automatically” listens to the loudest part first and picks it for you.', onChange: v => { opt.lang = v; saveOpt(); } });
  const taskSeg = h('div', { class: 'ctl', title: 'Output', tip: 'Write down what is said, or translate the speech into English captions.' }, h('label', null, 'Captions in'),
    App.seg({ value: opt.task, onChange: v => { opt.task = v; saveOpt(); }, options: [{ value: 'transcribe', label: 'Spoken language', tip: 'Captions in the language that is spoken.' }, { value: 'translate', label: 'English', tip: 'Translate the speech into English captions.' }] }));

  const styleGrid = h('div', { class: 'cap-styles' });
  const drawStyles = () => styleGrid.replaceChildren(...STYLES.map(s => {
    const t = s.text, demo = s.upper ? 'HELLO THERE' : 'Hello there';
    const word = (txt, on) => h('span', { style: { color: on && t.hl === 'color' ? t.hlColor : t.color, background: on && t.hl === 'box' ? t.hlColor : 'none', opacity: on || t.hl !== 'reveal' ? 1 : 0.18, borderRadius: '4px', padding: t.hl === 'box' ? '0 3px' : 0 } }, txt);
    const [w1, w2] = demo.split(' ');
    const vis = h('div', { class: 'cap-style-vis', style: { font: `${t.bold ? 800 : 500} 15px "${t.font}", Manrope`, textShadow: t.shadow === 'glow' ? `0 0 8px ${t.color}` : '0 1px 3px #000', WebkitTextStroke: t.strokeW ? '0.5px #000' : '', background: t.bg ? 'rgba(0,0,0,.65)' : 'none', padding: t.bg ? '1px 6px' : 0, borderRadius: '4px' } }, word(w1, false), ' ', word(w2, true));
    const tile = h('button', { class: 'cap-style' + (look.id === s.id ? ' on' : ''), type: 'button', title: s.name, tip: s.tip }, vis, h('span', { class: 'cap-style-name' }, s.name));
    tile.addEventListener('click', () => { App.ensureFont(s.text.font); look = deep(s); saveOpt(); buildLook(); regroup(); });
    return tile;
  }));
  const lookBox = h('div');
  function buildLook() {
    drawStyles();
    const set = (fn, re = true) => v => { fn(v); look.id = 'custom'; styleGrid.querySelectorAll('.cap-style').forEach(b => b.classList.remove('on')); saveOpt(); if (re) regroup(); else drawPreview(); };
    lookBox.replaceChildren(
      App.select({ label: 'Font', value: look.text.font, options: App.fontOptions(V.FONTS, look.text.font), tip: 'Typeface for the captions.', onChange: set(v => { App.ensureFont(v); look.text.font = v; if (App.isGameFont && App.isGameFont(v)) look.text.bold = false; }) }),
      App.slider({ label: 'Size', min: 24, max: 160, step: 1, value: look.text.size, def: 58, unit: 'px', tip: 'Letter height on a 1080-pixel frame (it scales with your project).', onChange: set(v => { look.text.size = v; }) }),
      App.color({ label: 'Text color', value: look.text.color, tip: 'Fill color of the caption text.', onInput: v => { look.text.color = v; drawPreview(); }, onChange: set(() => {}, false) }),
      App.select({ label: 'Word highlight', value: look.text.hl || 'none', tip: 'Uses the word timings: color the word being spoken, slide a box behind it, or reveal words one by one.', options: [['none', 'Off'], ['color', 'Color the spoken word'], ['box', 'Box behind the spoken word'], ['reveal', 'Reveal word by word']], onChange: set(v => { look.text.hl = v; }, false) }),
      App.color({ label: 'Highlight color', value: look.text.hlColor || '#ffd43b', tip: 'Color used for the spoken word (or its box).', onInput: v => { look.text.hlColor = v; drawPreview(); }, onChange: set(() => {}, false) }),
      h('div', { class: 'ctl', title: 'Position', tip: 'Where the captions sit in the frame.' }, h('label', null, 'Position'), App.seg({ value: look.pos, onChange: set(v => { look.pos = v; }, false), options: [{ value: 'top', label: 'Top', tip: 'Near the top edge.' }, { value: 'middle', label: 'Middle', tip: 'Centered — popular for vertical videos.' }, { value: 'bottom', label: 'Bottom', tip: 'Classic subtitle position.' }] })),
      h('div', { class: 'ctl', title: 'Caption length', tip: 'How much text each caption holds. Short = a few punchy words; Long = full sentences.' }, h('label', null, 'Length'), App.seg({ value: look.length, onChange: set(v => { look.length = v; }), options: [{ value: 'short', label: 'Short', tip: 'A few words at a time.' }, { value: 'medium', label: 'Medium', tip: 'Half a sentence.' }, { value: 'long', label: 'Long', tip: 'Whole sentences.' }] })),
      h('div', { class: 'ctl', title: 'Lines', tip: 'Maximum number of lines per caption.' }, h('label', null, 'Lines'), App.seg({ value: look.lines, onChange: set(v => { look.lines = v; }), options: [{ value: 1, label: '1 line', tip: 'Always a single line.' }, { value: 2, label: '2 lines', tip: 'Up to two balanced lines.' }] })),
      App.toggle({ label: 'UPPERCASE', value: look.upper, tip: 'Show captions in capital letters.', onChange: set(v => { look.upper = v; }) }),
      App.toggle({ label: 'Text box', value: !!look.text.bg, tip: 'Puts a dark box behind the text for readability.', onChange: set(v => { look.text.bg = v; look.text.bgColor = look.text.bgColor || '#000000'; look.text.bgAlpha = look.text.bgAlpha ?? 0.65; }) }),
      App.slider({ label: 'Outline', min: 0, max: 14, step: 0.5, value: look.text.strokeW || 0, def: 0, unit: 'px', tip: 'Dark outline around the letters — helps on bright footage.', onChange: set(v => { look.text.strokeW = v; look.text.stroke = look.text.stroke || '#000000'; }, false) }),
    );
  }
  const restyleBtn = btn({ icon: 'captions', label: 'Restyle existing captions', cls: 'solid txt sm', title: 'Restyle existing captions', tip: 'Apply this look to every caption already on the timeline (their text and timing stay).', onClick: () => { restyle(look); refreshRestyle(); } });
  const refreshRestyle = () => { const n = captionClips().length; restyleBtn.style.display = n ? '' : 'none'; restyleBtn.lastChild.textContent = `Restyle ${n} existing caption${n === 1 ? '' : 's'}`; };
  const left = h('div', { class: 'cap-left' },
    App.section('Speech', 'mic', [srcSel, rangeTg, langSel, taskSeg].filter(Boolean), { id: 'cap-speech' }),
    App.section('Look', 'text', [styleGrid, lookBox, h('div', { class: 'cap-restyle' }, restyleBtn)], { id: 'cap-look' }));
  buildLook(); refreshRestyle();

  /* ---------- preview + transcript ---------- */
  const P = V.project, pv = h('canvas', { class: 'cap-preview', title: 'Preview', tip: 'How the captions will look over the current frame. Click a caption in the list to preview it.' });
  pv.style.aspectRatio = `${P.width} / ${P.height}`;
  const headInfo = h('span', { class: 'grow' }, 'Transcript');
  const list = h('div', { class: 'cap-list' });
  const empty = h('div', { class: 'cap-empty' },
    h('div', { class: 'cap-empty-ico' }, App.icon('captions', 30)),
    h('b', null, 'Turn speech into captions'),
    h('div', null, 'A speech-recognition model (Whisper) listens to your video right here on this computer — nothing is uploaded and no internet is needed. You can proofread every caption before adding it.'),
    btn({ icon: 'sparkle', label: 'Generate captions', cls: 'primary txt', title: 'Generate captions', tip: 'Start listening. The first run takes a few extra seconds to load the speech model.', onClick: () => generate() }));
  const right = h('div', { class: 'cap-right' }, h('div', { class: 'cap-pvwrap' }, pv), h('div', { class: 'cap-head' }, headInfo), list);
  list.append(empty);

  const sample = () => spread('Your captions will look like this', 0, 2.4).map(w => ({ ...w }));
  function drawPreview() {
    const r = pv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (pv.width !== W || pv.height !== H) { pv.width = W; pv.height = H; }
    const ctx = pv.getContext('2d'), k = W / P.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (V.ctx && V.ctx.canvas.width) ctx.drawImage(V.ctx.canvas, 0, 0, W, H);
    const cue = cues[selCue] || { t0: 0, t1: 2.4, words: sample() };
    const c = captionClip({ ...cue, words: cue.words.map(w => ({ ...w, text: w.text })) }, look, null);
    // play the caption through, then hold it fully visible for a moment before looping
    const span = Math.max(0.6, c.dur), ph = (performance.now() / 1000) % (span + 0.9), lt = ph < span ? ph : span * 0.55;
    const rs = V._rs; V._rs = k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    try { V.drawClip(ctx, c, c.start + Math.min(lt, span - 0.01), { held: true }); } catch (e) { console.error(e); }
    V._rs = rs; ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  const loop = () => { drawPreview(); raf = requestAnimationFrame(loop); };

  function regroup() {
    if (words.length) { const keep = cues[selCue] && cues[selCue].t0; cues = group(words, look); selCue = keep != null ? Math.max(0, cues.findIndex(c => c.t1 > keep)) : -1; renderList(); }
    drawPreview();
  }
  function renderList() {
    if (!words.length) { list.replaceChildren(empty); headInfo.textContent = 'Transcript'; return; }
    headInfo.textContent = `${cues.length} caption${cues.length === 1 ? '' : 's'} · ${words.length} words` + (detected ? ` · ${langName(detected)}` : '');
    const top = list.scrollTop;
    list.replaceChildren(...cues.map((c, i) => {
      const ta = h('textarea', { rows: 1, spellcheck: 'true', title: 'Caption text', tip: 'Fix any word the model misheard. Changes keep their timing.' });
      ta.value = cueText(c);
      const row = h('div', { class: 'cap-cue' + (i === selCue ? ' on' : '') },
        h('button', { class: 'cap-time', type: 'button', title: 'Jump here', tip: 'Preview this caption and move the playhead to it.' }, fmt(c.t0)),
        ta,
        btn({ icon: 'x', cls: 'sm', title: 'Delete caption', tip: 'Remove this caption (its words are dropped).', onClick: () => { const set = new Set(c.words); words = words.filter(w => !set.has(w)); regroup(); } }));
      const pick = () => { selCue = i; list.querySelectorAll('.cap-cue').forEach((r, j) => r.classList.toggle('on', j === i)); V.seek && V.seek(c.t0 + 0.05); setTimeout(drawPreview, 120); };
      row.firstChild.addEventListener('click', pick);
      ta.addEventListener('focus', pick);
      ta.addEventListener('keydown', e => e.stopPropagation());
      ta.addEventListener('change', () => {
        const text = ta.value.replace(/\s+/g, ' ').trim(), at = words.indexOf(c.words[0]);
        const last = c.words[c.words.length - 1], nw = text ? spread(text, c.words[0].t0, last.t1) : [];
        words.splice(at, c.words.length, ...nw); regroup();
      });
      return row;
    }));
    list.scrollTop = top;
  }

  /* ---------- run ---------- */
  const bar = h('i'), prog = h('div', { class: 'cap-prog', style: { visibility: 'hidden' } }, bar), status = h('span', { class: 'cap-status' }, 'Runs on this computer · Whisper base');
  const setProg = (p, msg) => { prog.style.visibility = p == null ? 'hidden' : ''; bar.style.width = Math.round((p || 0) * 100) + '%'; if (msg != null) status.textContent = msg; };
  let primary = null, srtBtn = null;
  const syncButtons = () => {
    if (!primary) return;
    primary.lastChild.textContent = running ? 'Stop' : cues.length ? `Add ${cues.length} caption${cues.length === 1 ? '' : 's'} to timeline` : 'Generate captions';
    primary.dataset.tip = running ? 'Stop listening — you keep what was found so far.' : cues.length ? 'Places the captions as text clips on a new “Captions” track above your video. Ctrl+Z undoes it.' : 'Start listening.';
    srtBtn.disabled = !cues.length;
  };
  async function generate() {
    if (running) return;
    const clips = opt.source === 'all' ? sources : opt.source === 'sel' ? sel : sources.filter(c => c.id === opt.source);
    let t0 = Math.min(...clips.map(c => c.start)), t1 = Math.max(...clips.map(V.end));
    if (opt.range && hasRange) { t0 = Math.max(t0, V.range.in); t1 = Math.min(t1, V.range.out); }
    if (!(t1 > t0)) return App.toast('Nothing to listen to in that range', 'warn');
    if (t1 - t0 > 3 * 3600) return App.toast('That is longer than 3 hours — mark a shorter In → Out range first', 'warn');
    running = true; words = []; cues = []; selCue = -1; detected = null; renderList(); syncButtons();
    list.replaceChildren(h('div', { class: 'cap-empty' }, h('div', { class: 'spinner' }), h('div', null, 'Listening… captions appear here as they are found.')));
    const started = performance.now();
    try {
      setProg(0, 'Preparing the sound…');
      const audio = await renderAudio(clips, t0, t1, p => setProg(p * 0.08, `Preparing the sound… ${Math.round(p * 100)}%`));
      if (!md) return;
      const w = getWorker();
      let speech = 0, firstChunkAt = 0;
      const res = await new Promise((resolve, reject) => {
        w.onmessage = e => {
          const m = e.data;
          if (m.type === 'load') setProg(0.08 + 0.1 * (m.loaded / m.total), `Loading the speech model… ${Math.round(m.loaded / m.total * 100)}%`);
          else if (m.type === 'ready') setProg(0.18, 'Finding the speech…');
          else if (m.type === 'plan') { speech = m.speech; if (!m.chunks) setProg(1, 'No speech found'); else setProg(0.2, `Listening… (${clock(speech)} of speech)`); }
          else if (m.type === 'language') { detected = m.code; status.textContent = `Detected ${langName(m.code)} — listening…`; }
          else if (m.type === 'chunk') {
            const add = (m.segments ? m.words.flatMap(s => spread(s.text, s.t0, s.t1)) : m.words).map(x => ({ text: x.text, t0: r3(x.t0 + t0), t1: r3(x.t1 + t0) }));
            words.push(...add); cues = group(words, look);
            if (!firstChunkAt) firstChunkAt = performance.now();
            const p = (m.i + 1) / m.n, el = (performance.now() - started) / 1000, left = m.i + 1 < m.n ? el / p * (1 - p) : 0;
            setProg(0.2 + 0.8 * p, `Listening… ${Math.round(p * 100)}%` + (left > 3 ? ` · about ${clock(left)} left` : ''));
            renderList(); list.scrollTop = list.scrollHeight; syncButtons(); headInfo.textContent += ' · listening…';
          } else if (m.type === 'done') resolve(m);
          else if (m.type === 'error') reject(new Error(m.message));
        };
        w.onerror = e => reject(new Error(e.message || 'The speech model could not start'));
        w.postMessage({ type: 'run', audio, language: opt.lang, task: opt.task, words: true }, [audio.buffer]);
      });
      const secs = (performance.now() - started) / 1000;
      setProg(null, res && res.cancelled ? `Stopped — kept the ${cues.length} caption${cues.length === 1 ? '' : 's'} found so far.` : words.length ? `Done in ${clock(secs)} — proofread the list, then add the captions.` : 'No speech was found in that sound.');
      if (!words.length) list.replaceChildren(empty);
    } catch (e) {
      console.error(e); killWorker();
      setProg(null, 'Captioning failed: ' + e.message);
      App.toast('Auto captions failed: ' + e.message, 'err', 7000);
      if (!words.length) list.replaceChildren(empty);
    } finally { running = false; renderList(); syncButtons(); }
  }
  const stop = () => { if (worker) worker.postMessage({ type: 'cancel' }); status.textContent = 'Stopping after this part…'; };

  md = App.modal({ title: 'Auto captions', icon: 'captions', width: Math.min(1060, innerWidth - 40), cls: 'cap-modal', body: h('div', { class: 'cap' }, left, right),
    left: h('div', { class: 'cap-foot' }, prog, status),
    buttons: [
      { label: 'Close' },
      { label: 'Download .srt', tip: 'Save the captions as a standard subtitle file (.srt) for YouTube, players or other editors.', onClick: () => { if (!cues.length) return false; App.download(new Blob([toSrt(cues.map(c => ({ t0: c.t0, t1: c.t1, text: wrap(c.words.map(w => shown(w.text, look)), look, styledText(look)).join('\n') })))], { type: 'application/x-subrip' }), (V.name || 'captions').replace(/[\\/:*?"<>|]+/g, '_') + '.srt'); return false; } },
      { label: 'Generate captions', primary: true, onClick: () => { if (running) { stop(); return false; } if (!cues.length) { generate(); return false; } addCaptions(cues, look); } },
    ],
    onClose: () => { cancelAnimationFrame(raf); killWorker(); md = null; } });
  const foot = md.el ? md.el.querySelector('.modal-foot') : document.querySelector('.cap-modal .modal-foot');
  primary = foot.querySelector('.primary'); srtBtn = [...foot.querySelectorAll('button')].find(b => b.textContent.includes('.srt'));
  syncButtons();
  App.ensureFont(look.text.font);
  raf = requestAnimationFrame(loop);
  V.captions._debug = { get words() { return words; }, set words(v) { words = v; regroup(); }, get cues() { return cues; }, get look() { return look; }, generate, regroup, group, captionClip, drawPreview };
  return md;
}

V.captions = { open, exportSrt, importSrt, restyle: () => restyle(loadLook()), parseSubs, toSrt, group, spread };
})();
