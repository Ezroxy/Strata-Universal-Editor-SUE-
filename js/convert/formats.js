/* Strata Studio — Converter: the format catalogue and the planner that turns (file info + target + options) into an
   ffmpeg command. Pure logic, no DOM: App.CV.formats, App.CV.summarize(probeJson), App.CV.plan(item).
   Rules of thumb the planner follows:
   - "Best" quality never re-encodes a stream the target container can hold as is (lossless, near-instant), unless a
     change (trim, size, frame rate, loudness…) needs it or the user forces it.
   - Lossless targets (FLAC, WAV, ALAC, AIFF, PNG, TIFF, BMP…) keep the source's bit depth / pixels.
   - Lossy encodes use high settings by default (H.264 CRF 16, MP3 320 kbps, AAC 320 kbps…). */
(() => {
'use strict';
const App = window.App;
const CV = App.CV = App.CV || {};

/* ---------- catalogue ---------- */
// kind: what the result is. vc/ac: default video/audio encoder. vcopy/acopy: codecs the container can carry untouched.
const F = [
  // video
  { id: 'mp4', ext: 'mp4', label: 'MP4', kind: 'video', mime: 'video/mp4', desc: 'Plays everywhere: phones, TVs, browsers, YouTube.', vc: 'h264', ac: 'aac', subs: 'mov_text',
    // (MPEG-4 Part 2 / Xvid would fit too, but browsers and many phones can't play it inside .mp4, so it is re-encoded)
    vcopy: ['h264', 'hevc', 'av1', 'vp9'], acopy: ['aac', 'mp3', 'ac3', 'eac3', 'alac', 'opus', 'flac'], multiAudio: true, vcodecs: ['h264', 'h265'] },
  { id: 'mkv', ext: 'mkv', label: 'MKV', kind: 'video', mime: 'video/x-matroska', desc: 'Keeps every audio track, subtitle and chapter.', vc: 'h264', ac: 'aac', subs: 'copy',
    vcopy: '*', acopy: '*', multiAudio: true, vcodecs: ['h264', 'h265'] },
  { id: 'mov', ext: 'mov', label: 'MOV', kind: 'video', mime: 'video/quicktime', desc: 'QuickTime: Apple devices, Final Cut, Premiere.', vc: 'h264', ac: 'aac', subs: 'mov_text',
    vcopy: ['h264', 'hevc', 'mpeg4', 'prores', 'mjpeg', 'dnxhd'], acopy: ['aac', 'mp3', 'alac', 'ac3', 'pcm_s16le', 'pcm_s24le', 'pcm_s16be', 'pcm_s24be'], multiAudio: true, vcodecs: ['h264', 'h265', 'prores'] },
  { id: 'webm', ext: 'webm', label: 'WebM', kind: 'video', mime: 'video/webm', desc: 'For websites. Open and royalty-free (VP8 + Opus).', vc: 'vp8', ac: 'opus', subs: 'webvtt',
    vcopy: ['vp8', 'vp9', 'av1'], acopy: ['opus', 'vorbis'], multiAudio: true },
  { id: 'avi', ext: 'avi', label: 'AVI', kind: 'video', mime: 'video/x-msvideo', desc: 'Older players, DVD and set-top boxes (Xvid + MP3).', vc: 'mpeg4', ac: 'mp3',
    vcopy: ['mpeg4', 'msmpeg4v2', 'msmpeg4v3', 'mjpeg'], acopy: ['mp3', 'ac3', 'pcm_s16le'] },
  { id: 'wmv', ext: 'wmv', label: 'WMV', kind: 'video', mime: 'video/x-ms-wmv', desc: 'Windows Media, for older Windows software.', vc: 'wmv2', ac: 'wmav2',
    vcopy: ['wmv1', 'wmv2'], acopy: ['wmav1', 'wmav2'] },
  { id: 'flv', ext: 'flv', label: 'FLV', kind: 'video', mime: 'video/x-flv', desc: 'Flash video, for older streaming tools.', vc: 'h264', ac: 'aac',
    vcopy: ['h264'], acopy: ['aac', 'mp3'] },
  { id: 'ts', ext: 'ts', label: 'TS', kind: 'video', mime: 'video/mp2t', desc: 'MPEG transport stream (.ts): broadcast and camcorder video.', vc: 'h264', ac: 'aac',
    vcopy: ['h264', 'hevc', 'mpeg2video'], acopy: ['aac', 'mp3', 'ac3', 'eac3', 'mp2'], multiAudio: true },
  { id: 'mpg', ext: 'mpg', label: 'MPEG-2', kind: 'video', mime: 'video/mpeg', desc: 'DVD-style MPEG-2 video (.mpg).', vc: 'mpeg2', ac: 'mp2',
    vcopy: ['mpeg2video', 'mpeg1video'], acopy: ['mp2', 'ac3'] },
  { id: 'ogv', ext: 'ogv', label: 'OGV', kind: 'video', mime: 'video/ogg', desc: 'Ogg Theora + Vorbis, fully open.', vc: 'theora', ac: 'vorbis',
    vcopy: ['theora'], acopy: ['vorbis', 'opus', 'flac'] },
  { id: 'gifanim', ext: 'gif', label: 'GIF', kind: 'video', mime: 'image/gif', desc: 'Animated GIF for chats and memes (no sound).', anim: true },
  // audio
  { id: 'mp3', ext: 'mp3', label: 'MP3', kind: 'audio', mime: 'audio/mpeg', desc: 'The most compatible sound file.', ac: 'mp3', acopy: ['mp3'], cover: true, maxCh: 2, maxSr: 48000 },
  { id: 'm4a', ext: 'm4a', label: 'AAC', kind: 'audio', mime: 'audio/mp4', desc: 'AAC in .m4a: Apple, phones, smaller than MP3.', ac: 'aac', acopy: ['aac'], cover: true, maxSr: 96000 },
  { id: 'alac', ext: 'm4a', label: 'ALAC', kind: 'audio', mime: 'audio/mp4', desc: 'Apple Lossless (.m4a): perfect quality for iTunes.', ac: 'alac', acopy: ['alac'], lossless: true, cover: true },
  { id: 'flac', ext: 'flac', label: 'FLAC', kind: 'audio', mime: 'audio/flac', desc: 'Lossless and compressed: perfect quality, smaller.', ac: 'flac', acopy: ['flac'], lossless: true, cover: true, maxSr: 655350 },
  { id: 'wav', ext: 'wav', label: 'WAV', kind: 'audio', mime: 'audio/wav', desc: 'Uncompressed: perfect quality, works in every editor.', ac: 'pcm', lossless: true },
  { id: 'aiff', ext: 'aiff', label: 'AIFF', kind: 'audio', mime: 'audio/aiff', desc: 'Uncompressed, the Mac counterpart of WAV.', ac: 'pcmbe', lossless: true },
  { id: 'ogg', ext: 'ogg', label: 'OGG', kind: 'audio', mime: 'audio/ogg', desc: 'Ogg Vorbis: open format, games and Linux.', ac: 'vorbis', acopy: ['vorbis'] },
  { id: 'opus', ext: 'opus', label: 'Opus', kind: 'audio', mime: 'audio/ogg', desc: 'The best sound per megabyte. Voice and music.', ac: 'opus', acopy: ['opus'], fixedSr: 48000 },
  { id: 'wma', ext: 'wma', label: 'WMA', kind: 'audio', mime: 'audio/x-ms-wma', desc: 'Windows Media Audio, for older Windows players.', ac: 'wmav2', acopy: ['wmav2'], maxCh: 2, maxSr: 48000 },
  { id: 'ac3', ext: 'ac3', label: 'AC3', kind: 'audio', mime: 'audio/ac3', desc: 'Dolby Digital, up to 5.1 surround.', ac: 'ac3', acopy: ['ac3'], maxCh: 6, maxSr: 48000 },
  { id: 'aorig', ext: '', label: 'Original', kind: 'audio', desc: 'Pull the sound out exactly as it is: no re-encoding, no loss.', orig: true },
  // image
  { id: 'png', ext: 'png', label: 'PNG', kind: 'image', mime: 'image/png', desc: 'Lossless, keeps transparency.', lossless: true },
  { id: 'jpg', ext: 'jpg', label: 'JPEG', kind: 'image', mime: 'image/jpeg', desc: 'Photos: small files, every app opens them.' },
  { id: 'webp', ext: 'webp', label: 'WebP', kind: 'image', mime: 'image/webp', desc: 'Modern web pictures: small, keeps transparency.' },
  { id: 'gif', ext: 'gif', label: 'GIF', kind: 'image', mime: 'image/gif', desc: 'Simple 256-colour picture.' },
  { id: 'bmp', ext: 'bmp', label: 'BMP', kind: 'image', mime: 'image/bmp', desc: 'Uncompressed Windows bitmap.', lossless: true },
  { id: 'tiff', ext: 'tiff', label: 'TIFF', kind: 'image', mime: 'image/tiff', desc: 'Lossless, for print and photo archives.', lossless: true },
  { id: 'ico', ext: 'ico', label: 'ICO', kind: 'image', mime: 'image/x-icon', desc: 'Windows / website icon (up to 256×256).' },
  { id: 'tga', ext: 'tga', label: 'TGA', kind: 'image', mime: 'image/x-tga', desc: 'Targa, for games and 3D tools.', lossless: true },
  // subtitles
  { id: 'srt', ext: 'srt', label: 'SRT', kind: 'sub', mime: 'text/plain', desc: 'The common subtitle file every player reads.' },
  { id: 'vtt', ext: 'vtt', label: 'VTT', kind: 'sub', mime: 'text/vtt', desc: 'WebVTT, subtitles for web video.' },
  { id: 'ass', ext: 'ass', label: 'ASS', kind: 'sub', mime: 'text/plain', desc: 'Advanced SubStation, keeps styles.' },
];
CV.formats = F;
CV.fmt = id => F.find(f => f.id === id);
CV.GROUPS = [['video', 'Video', 'film'], ['audio', 'Audio', 'wave'], ['image', 'Image', 'image'], ['sub', 'Subtitles', 'captions']];

const VC = { h264: 'H.264', h265: 'H.265 (HEVC)', prores: 'ProRes 422', vp8: 'VP8', mpeg4: 'Xvid (MPEG-4)', wmv2: 'WMV 8', mpeg2: 'MPEG-2', theora: 'Theora' };
CV.vcodecName = c => VC[c] || c;
CV.QUALITY = [
  { id: 'best', label: 'Best', tip: 'Full quality. Streams the new format can hold as they are are copied without re-encoding (no loss at all, and very fast); everything else is encoded at the highest settings.' },
  { id: 'high', label: 'High', tip: 'Visually the same as the original for almost everything, with smaller files than Best.' },
  { id: 'balanced', label: 'Balanced', tip: 'Good quality at a sensible size, for sharing and uploading.' },
  { id: 'small', label: 'Small', tip: 'The smallest files that still look and sound decent, for email and messaging.' },
];

/* ---------- reading ffprobe output ---------- */
const IMAGE_DEMUX = /^(image2|png_pipe|jpeg_pipe|webp_pipe|bmp_pipe|tiff_pipe|gif_pipe|ico|psd_pipe|pam_pipe|pgm_pipe|ppm_pipe|pbm_pipe|qoi_pipe|dpx_pipe|exr_pipe|sgi_pipe|sunrast_pipe|xbm_pipe|xpm_pipe|svg_pipe|j2k_pipe|jpegls_pipe|pcx_pipe|tga|hdr_pipe|xwd_pipe|photocd_pipe|pictor_pipe|gem_pipe|dds_pipe|cri_pipe|pgx_pipe|qdraw_pipe|alias_pix|brender_pix|apng|webp|gif)$/;
const TEXT_SUBS = ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text', 'microdvd', 'jacosub', 'sami', 'realtext', 'subviewer', 'subviewer1', 'mpl2', 'pjs', 'vplayer', 'stl'];
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const rate = r => { if (!r) return 0; const [a, b] = String(r).split('/').map(Number); return b ? a / b : a || 0; };
const bitsOf = s => {
  const raw = +s.bits_per_raw_sample || 0, f = s.sample_fmt || '';
  if (raw) return raw;
  if (/^(flt|dbl)/.test(f)) return 32;
  if (/^s32/.test(f)) return 24;
  if (/^(s16|u8)/.test(f)) return 16;
  return 16;
};
const LOSSLESS_A = /^(flac|alac|pcm_|wavpack|tta|ape|mlp|truehd|wmalossless)/;
CV.summarize = (info, file) => {
  const fmt = (info && info.format) || {}, streams = (info && info.streams) || [];
  const dur = num(fmt.duration) || Math.max(0, ...streams.map(s => num(s.duration)));
  const vAll = streams.filter(s => s.codec_type === 'video');
  const covers = vAll.filter(s => s.disposition && s.disposition.attached_pic);
  const vs = vAll.filter(s => !(s.disposition && s.disposition.attached_pic));
  const as = streams.filter(s => s.codec_type === 'audio');
  const ss = streams.filter(s => s.codec_type === 'subtitle');
  const v = vs[0];
  const demux = String(fmt.format_name || '').split(',')[0];
  const frames = v ? (+v.nb_frames || (num(v.duration || dur) * rate(v.avg_frame_rate || v.r_frame_rate))) : 0;
  const stillish = v && (IMAGE_DEMUX.test(demux) || /^(png|mjpeg|bmp|tiff|webp|gif|qoi|targa|ppm|pgm|pam|jpeg2000|sgi|exr|dpx|pcx|xbm|xwd|hdr|psd)$/.test(v.codec_name)) && !as.length;
  const animated = !!(v && stillish && frames > 1.5 && dur > 0.05);
  let kind = 'unknown';
  if (v && stillish && !animated) kind = 'image';
  else if (v) kind = 'video';
  else if (as.length) kind = 'audio';
  else if (ss.length) kind = 'sub';
  const tag = s => (s.tags && (s.tags.language || s.tags.LANGUAGE)) || '';
  const title = s => (s.tags && (s.tags.title || s.tags.TITLE)) || '';
  const S = {
    kind, animated, duration: dur, size: num(fmt.size) || (file && file.size) || 0, bitrate: num(fmt.bit_rate),
    start: num(fmt.start_time), vStart: v ? num(v.start_time) : num(fmt.start_time),
    container: demux, containerLong: fmt.format_long_name || demux, tags: fmt.tags || {},
    chapters: (info && info.chapters || []).length,
    v: v ? { codec: v.codec_name, w: +v.width || 0, h: +v.height || 0, fps: rate(v.avg_frame_rate) || rate(v.r_frame_rate), pix: v.pix_fmt || '', bitrate: num(v.bit_rate), frames: Math.round(frames),
      alpha: /^(rgba|bgra|argb|abgr|ya|yuva|gbrap|pal8|rgba64|bgra64)/.test(v.pix_fmt || ''), rotate: +(v.tags && v.tags.rotate) || 0 } : null,
    vcount: vs.length,
    cover: covers.length ? covers[0].index : null,
    as: as.map((s, i) => ({ i, index: s.index, codec: s.codec_name, sr: +s.sample_rate || 0, ch: +s.channels || 0, layout: s.channel_layout || '', bits: bitsOf(s), fmt: s.sample_fmt || '', bitrate: num(s.bit_rate),
      lossless: LOSSLESS_A.test(s.codec_name || ''), lang: tag(s), title: title(s), def: !!(s.disposition && s.disposition.default) })),
    ss: ss.map((s, i) => ({ i, index: s.index, codec: s.codec_name, text: TEXT_SUBS.includes(s.codec_name), lang: tag(s), title: title(s) })),
  };
  S.textSubs = S.ss.filter(s => s.text);
  return S;
};
/** one line describing a file, e.g. "MKV · H.264 1920×1080 · 23.98 fps · AC3 5.1 · 1:32:10" */
CV.describe = S => {
  const p = [];
  const cn = { matroska: 'MKV', mov: 'MP4 / MOV', mp4: 'MP4', avi: 'AVI', mp3: 'MP3', wav: 'WAV', flac: 'FLAC', ogg: 'OGG', webm: 'WebM', image2: 'Image', png_pipe: 'PNG', jpeg_pipe: 'JPEG', webp_pipe: 'WebP', gif: 'GIF', asf: 'WMV / WMA', flv: 'FLV', mpegts: 'TS', aiff: 'AIFF', srt: 'SRT', ass: 'ASS', webvtt: 'VTT' }[S.container] || S.container.toUpperCase();
  p.push(cn);
  const codec = c => ({ h264: 'H.264', hevc: 'H.265', mpeg4: 'MPEG-4', mpeg2video: 'MPEG-2', vp9: 'VP9', vp8: 'VP8', av1: 'AV1', prores: 'ProRes', mjpeg: 'JPEG', png: 'PNG', aac: 'AAC', mp3: 'MP3', ac3: 'AC3', eac3: 'E-AC3', dts: 'DTS', opus: 'Opus', vorbis: 'Vorbis', flac: 'FLAC', alac: 'ALAC', truehd: 'TrueHD', wmav2: 'WMA', wmv2: 'WMV', subrip: 'SRT', ass: 'ASS', webp: 'WebP', gif: 'GIF', bmp: 'BMP', tiff: 'TIFF' }[c] || (/^pcm_/.test(c) ? 'PCM' : (c || '?').toUpperCase()));
  if (S.v) p.push(`${S.kind === 'image' ? '' : codec(S.v.codec) + ' '}${S.v.w}×${S.v.h}${S.kind === 'video' && S.v.fps ? ' · ' + (+S.v.fps.toFixed(2)) + ' fps' : ''}`.trim());
  if (S.as.length) { const a = S.as[0]; p.push(`${codec(a.codec)} ${a.ch === 1 ? 'mono' : a.ch === 2 ? 'stereo' : a.ch === 6 ? '5.1' : a.ch === 8 ? '7.1' : a.ch + ' ch'}${a.sr ? ' ' + (a.sr / 1000) + ' kHz' : ''}${S.as.length > 1 ? ` (+${S.as.length - 1} track${S.as.length > 2 ? 's' : ''})` : ''}`); }
  if (S.ss.length) p.push(`${S.ss.length} subtitle${S.ss.length > 1 ? 's' : ''}`);
  if (S.kind !== 'image' && S.duration) p.push(CV.time(S.duration));
  return p.join(' · ');
};
CV.time = s => { s = Math.max(0, s || 0); const hh = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = Math.floor(s % 60); return (hh ? hh + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };

/** which targets make sense for a source kind; returns { ok, why } */
CV.allowed = (S, f) => {
  const k = S.kind;
  if (k === 'unknown') return { ok: false, why: 'This file could not be read.' };
  if (f.kind === 'sub') {
    if (k === 'sub') return { ok: true };
    if (k === 'video' && S.textSubs.length) return { ok: true, extract: true };
    return { ok: false, why: k === 'video' && S.ss.length ? 'The subtitles in this file are pictures (Blu-ray / DVD), not text.' : 'This file has no subtitles.' };
  }
  if (k === 'sub') return { ok: false, why: 'Subtitle files can only become other subtitle files.' };
  if (f.kind === 'audio') {
    if (!S.as.length) return { ok: false, why: k === 'image' ? 'A picture has no sound.' : 'This file has no sound.' };
    return { ok: true };
  }
  if (f.kind === 'image') return { ok: true };   // a frame of a video, a waveform of a sound, or the picture itself
  if (f.kind === 'video') {
    if (f.anim && k === 'audio') return { ok: false, why: 'A GIF has no sound, so it can’t be made from audio alone.' };
    if (f.anim && k === 'image') return { ok: false, why: 'A still picture makes a one-frame GIF: pick GIF under Image instead.' };
    return { ok: true };
  }
  return { ok: false, why: '' };
};

/** the default target when a file is added */
CV.defaultTarget = (S, name = '') => {
  const ext = ((/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '').toLowerCase();
  // never suggest the format the file already is
  if (S.kind === 'video') return /^(mp4|m4v)$/.test(ext) ? 'mp3' : 'mp4';
  if (S.kind === 'audio') return ext === 'mp3' ? 'wav' : 'mp3';
  if (S.kind === 'image') return ext === 'png' ? 'jpg' : 'png';
  if (S.kind === 'sub') return ext === 'srt' ? 'vtt' : 'srt';
  return 'mp4';
};

/* ---------- defaults for options ---------- */
CV.DEFAULTS = {
  quality: 'best', force: false, vcodec: 'auto', res: 'orig', fps: 'orig', keepAudio: true, aTrack: 'all', keepSubs: true, meta: true,
  abr: 'auto', sr: 'orig', ch: 'orig', depth: 'auto', normalize: false,
  trimStart: 0, trimEnd: 0, frameAt: null, picture: 'waves', stillDur: 5, gifFps: 15, gifW: 480, imgSize: 'orig', bg: '#ffffff',
};

/* ---------- planning ---------- */
const Q = { best: 0, high: 1, balanced: 2, small: 3 };
const pick = (q, arr) => arr[Q[q] ?? 0];
const even = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
const ABR = { aac: [320, 256, 192, 128], mp3: [320, 256, 192, 128], opus: [256, 192, 128, 96], vorbis: [320, 256, 192, 128], wmav2: [256, 192, 160, 128], ac3: [640, 448, 384, 192], mp2: [384, 320, 256, 192] };
// Opus uses ffmpeg's own encoder: libopus hangs on stereo and surround in this WebAssembly build
const AENC = { aac: ['aac'], mp3: ['libmp3lame'], opus: ['opus', '-strict', '-2'], vorbis: ['libvorbis'], wmav2: ['wmav2'], ac3: ['ac3'], mp2: ['mp2'], alac: ['alac'], flac: ['flac'] };
/* Per-track options: the codec/bitrate/quality options take a typed specifier (-c:a:1), the generic ones need
   ":a:1" — a bare ":1" would mean the file's second stream, which is often the video. */
const spec = idx => ({ t: idx === '' ? '' : ':' + idx, g: idx === '' ? '' : ':a:' + idx });
/** how many channels an audio output ends up with */
const outCh = (f, a, o, codec) => {
  if (o.ch !== 'orig') return +o.ch;
  const maxCh = f.maxCh || ({ mp3: 2, wmav2: 2, mp2: 2, ac3: 6 }[codec] || 0);
  const ch = a ? a.ch : 2;
  return maxCh && ch > maxCh ? maxCh : ch;
};
/** audio encoder args for a target audio codec */
function audioArgs(codec, a, o, idx = '', f = {}) {
  const { t, g } = spec(idx);
  const args = [];
  if (codec === 'pcm' || codec === 'pcmbe') {
    const d = o.depth === 'auto' ? (a && a.lossless ? (a.bits <= 16 ? 16 : 24) : 16) : +o.depth;
    const be = codec === 'pcmbe';
    args.push('-c:a' + t, d === 32 ? (be ? 'pcm_f32be' : 'pcm_f32le') : d === 24 ? (be ? 'pcm_s24be' : 'pcm_s24le') : (be ? 'pcm_s16be' : 'pcm_s16le'));
    return args;
  }
  if (codec === 'flac' || codec === 'alac') {
    const d = o.depth === 'auto' ? (a && a.lossless ? (a.bits <= 16 ? 16 : 24) : 16) : Math.min(24, +o.depth);
    args.push('-c:a' + t, codec);
    if (codec === 'flac') args.push('-compression_level' + g, '8', '-sample_fmt' + g, d > 16 ? 's32' : 's16');
    else args.push('-sample_fmt' + g, d > 16 ? 's32p' : 's16p');
    if (d > 16) args.push('-bits_per_raw_sample' + g, '24');
    return args;
  }
  args.push('-c:a' + t, ...AENC[codec]);
  if (codec === 'mp3' && o.abr === 'auto') {
    if (o.quality === 'best') args.push('-b:a' + t, '320k');
    else args.push('-q:a' + t, String(pick(o.quality, [0, 0, 2, 5])));
  } else if (codec === 'vorbis' && o.abr === 'auto') {
    args.push('-q:a' + t, String(pick(o.quality, [10, 8, 6, 3])));
  } else {
    const kb = o.abr === 'auto' ? pick(o.quality, ABR[codec]) : +o.abr;
    args.push('-b:a' + t, kb + 'k');
  }
  return args;
}
/** sample rate / channel limits + user overrides for an audio output */
function audioShape(f, a, o, codec, idx = '') {
  const { g } = spec(idx);
  const args = [];
  let sr = o.sr === 'orig' ? 0 : +o.sr;
  const src = a ? a.sr : 0;
  const maxSr = f.maxSr || ({ mp3: 48000, wmav2: 48000, ac3: 48000, mp2: 48000, aac: 96000 }[codec] || 0);
  if (!sr && maxSr && src > maxSr) sr = src % 44100 === 0 ? 44100 : 48000;
  if (codec === 'opus') sr = 48000;
  if (o.normalize && !sr) sr = src && (!maxSr || src <= maxSr) ? src : 48000;   // loudnorm works at 192 kHz inside: bring it back
  if (sr) args.push('-ar' + g, String(sr));
  const ch = outCh(f, a, o, codec);
  if (a && ch !== a.ch) args.push('-ac' + g, String(ch));
  return args;
}
/** filters for one audio output: loudness, and surround layouts Vorbis accepts (5.1(side) → 5.1) */
function audioFilters(codec, a, o, f) {
  const fl = [];
  if (o.normalize) fl.push(loud);
  if (codec === 'vorbis' && outCh(f, a, o, codec) > 2) fl.push('aformat=channel_layouts=7.1|5.1|stereo|mono');
  return fl;
}
const loud = 'loudnorm=I=-14:TP=-1:LRA=11';

/** video encoder args */
function videoArgs(vc, o, S, threads) {
  const q = o.quality, a = [];
  if (vc === 'h264') a.push('-c:v', 'libx264', '-preset', pick(q, ['fast', 'fast', 'faster', 'medium']), '-crf', String(pick(q, [16, 19, 23, 28])), '-pix_fmt', 'yuv420p');
  else if (vc === 'h265') a.push('-c:v', 'libx265', '-preset', pick(q, ['fast', 'fast', 'faster', 'medium']), '-crf', String(pick(q, [18, 22, 26, 30])), '-pix_fmt', 'yuv420p', '-x265-params', `log-level=error:pools=${threads}`);
  else if (vc === 'prores') a.push('-c:v', 'prores_ks', '-profile:v', String(pick(q, [3, 3, 2, 0])), '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0');
  else if (vc === 'vp8') a.push('-c:v', 'libvpx', '-deadline', 'good', '-cpu-used', String(pick(q, [2, 3, 4, 5])), '-crf', String(pick(q, [6, 10, 18, 30])), '-b:v', pick(q, ['30M', '15M', '6M', '2M']), '-auto-alt-ref', '0', '-pix_fmt', 'yuv420p');
  else if (vc === 'mpeg4') a.push('-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', String(pick(q, [2, 3, 5, 8])), '-pix_fmt', 'yuv420p', '-mbd', 'rd', '-trellis', '1');
  else if (vc === 'wmv2') a.push('-c:v', 'wmv2', '-q:v', String(pick(q, [2, 3, 5, 8])), '-pix_fmt', 'yuv420p');
  else if (vc === 'mpeg2') a.push('-c:v', 'mpeg2video', '-q:v', String(pick(q, [2, 3, 5, 8])), '-pix_fmt', 'yuv420p', '-maxrate', '40M', '-bufsize', '8M');
  else if (vc === 'theora') a.push('-c:v', 'libtheora', '-q:v', String(pick(q, [10, 8, 6, 4])), '-pix_fmt', 'yuv420p');
  return a;
}
const VCODEC_NAME = { h264: 'h264', h265: 'hevc', prores: 'prores', vp8: 'vp8', mpeg4: 'mpeg4', wmv2: 'wmv2', mpeg2: 'mpeg2video', theora: 'theora' };

/** scale/fps filters for a video output; returns [] when nothing changes */
function videoFilters(S, o, { evenDims, maxW, maxH } = {}) {
  const f = [];
  const H = o.res === 'orig' ? 0 : +o.res;
  if (H && S.v && S.v.h > H) f.push(`scale=-2:${H}:flags=lanczos`);
  if (maxW || maxH) f.push(`scale='min(${maxW || 'iw'},iw)':'min(${maxH || 'ih'},ih)':force_original_aspect_ratio=decrease:flags=lanczos`);
  if (o.fps !== 'orig' && S.v && (!S.v.fps || Math.abs(S.v.fps - +o.fps) > 0.01)) f.push(`fps=${+o.fps}`);
  if (evenDims && (f.length || (S.v && (S.v.w % 2 || S.v.h % 2)))) f.push(even);
  return f;
}

/** the time window of the source to use */
function window_(S, o) {
  const st = Math.max(0, +o.trimStart || 0);
  const en = +o.trimEnd > st ? Math.min(+o.trimEnd, S.duration || Infinity) : 0;
  const pre = st ? ['-ss', st.toFixed(3)] : [];
  const post = en ? ['-t', (en - st).toFixed(3)] : [];
  const len = (en || S.duration || 0) - st;
  return { pre, post, len: Math.max(0, len), trimmed: !!(st || en) };
}

const audioOrig = c => ({ aac: ['m4a', 'audio/mp4'], mp3: ['mp3', 'audio/mpeg'], opus: ['opus', 'audio/ogg'], vorbis: ['ogg', 'audio/ogg'], flac: ['flac', 'audio/flac'], alac: ['m4a', 'audio/mp4'], ac3: ['ac3', 'audio/ac3'], eac3: ['eac3', 'audio/eac3'],
  wmav2: ['wma', 'audio/x-ms-wma'], wmav1: ['wma', 'audio/x-ms-wma'], mp2: ['mp2', 'audio/mpeg'], dts: ['dts', 'audio/vnd.dts'], truehd: ['thd', 'audio/vnd.dolby.mlp'] }[c] || (/^pcm_/.test(c) ? ['wav', 'audio/wav'] : ['mka', 'audio/x-matroska']));

/**
 * item: { S (summary), target, o (options), extra: { picture: File } , threads }
 * returns { args, out, ext, mime, inputs: ['src' | 'picture'], dur (seconds of output, for progress), steps: [text], lossless: 'full'|'partial'|'none', warn: [] }
 */
CV.plan = (item) => {
  const S = item.S, f = CV.fmt(item.target), o = { ...CV.DEFAULTS, ...item.o }, threads = item.threads || 4;
  const al = CV.allowed(S, f);
  if (!al.ok) throw new Error(al.why || 'This conversion is not possible.');
  const T = ['-threads', String(threads)];
  const w = window_(S, o);
  const steps = [], warn = [];
  const inputs = ['src'];
  let args = [], ext = f.ext, mime = f.mime || 'application/octet-stream', dur = w.len, lossless = 'none';
  const meta = o.meta ? ['-map_metadata', '0'] : ['-map_metadata', '-1', '-map_chapters', '-1'];
  const best = o.quality === 'best' && !o.force;
  const pickTracks = () => (o.aTrack === 'all' || o.aTrack == null ? S.as : S.as.filter(a => a.i === +o.aTrack));
  const firstTrack = () => S.as.find(a => a.i === +o.aTrack) || S.as.find(a => a.def) || S.as[0];

  /* ----- subtitles ----- */
  if (f.kind === 'sub') {
    const sub = S.kind === 'sub' ? 0 : S.textSubs[0].i;
    // subtitle times stay relative to the picture: ffmpeg would otherwise shift them by the sound's encoder delay
    const shift = S.kind === 'video' ? S.start - S.vStart : 0;
    args = ['-i', '@in0', '-map', `0:s:${sub}`, '-c:s', { srt: 'srt', vtt: 'webvtt', ass: 'ass' }[f.id], ...(Math.abs(shift) > 0.0005 ? ['-output_ts_offset', shift.toFixed(3)] : []), 'out.' + ext];
    steps.push(S.kind === 'sub' ? 'Convert the subtitles' : `Take the subtitles out${S.textSubs.length > 1 ? ' (first of ' + S.textSubs.length + ')' : ''}`);
    return { args, out: 'out.' + ext, ext, mime, inputs, dur: 0, steps, lossless: 'full', warn };
  }

  /* ----- audio targets ----- */
  if (f.kind === 'audio') {
    const a = firstTrack();
    const map = ['-map', `0:a:${a.i}`];
    if (f.orig) {
      const [e2, m2] = audioOrig(a.codec);
      ext = e2; mime = m2;
      const copyArgs = a.codec === 'aac' || a.codec === 'alac' ? ['-c:a', 'copy', '-movflags', '+faststart'] : ['-c:a', 'copy'];
      args = [...w.pre, '-i', '@in0', ...w.post, ...map, '-vn', '-sn', '-dn', ...copyArgs, ...meta, 'out.' + ext];
      steps.push(`Copy the ${a.codec.toUpperCase()} sound out as it is (.${ext}) — no re-encoding`);
      if (w.trimmed) warn.push('Without re-encoding, a trimmed start lands on the nearest audio frame (a few milliseconds).');
      return { args, out: 'out.' + ext, ext, mime, inputs, dur, steps, lossless: 'full', warn };
    }
    const filters = audioFilters(f.ac, a, o, f);
    const shapeChange = o.sr !== 'orig' || o.ch !== 'orig' || o.normalize || (f.maxCh && a.ch > f.maxCh) || (f.maxSr && a.sr > f.maxSr) || (f.fixedSr && a.sr !== f.fixedSr);
    const depthOk = o.depth === 'auto';
    const canCopy = best && depthOk && !shapeChange && (f.acopy || []).includes(a.codec) || (best && f.id === 'wav' && depthOk && !shapeChange && /^pcm_s(16|24)le$|^pcm_f32le$/.test(a.codec) && a.lossless);
    const cover = f.cover && S.cover != null && !w.trimmed && o.meta;
    args = [...w.pre, '-i', '@in0', ...w.post, ...map];
    if (cover) args.push('-map', `0:${S.cover}`, '-c:v', 'copy', '-disposition:v:0', 'attached_pic');
    else args.push('-vn');
    args.push('-sn', '-dn');
    if (canCopy) { args.push('-c:a', 'copy'); steps.push(`Copy the ${a.codec.toUpperCase()} sound as it is — no quality loss`); lossless = 'full'; }
    else {
      if (filters.length) args.push('-af', filters.join(','));
      const codec = f.ac === 'pcm' || f.ac === 'pcmbe' ? f.ac : f.ac;
      args.push(...audioArgs(codec, a, o, '', f), ...audioShape(f, a, o, codec));
      steps.push(`${S.kind === 'video' ? 'Take the sound out and encode' : 'Encode'} it as ${f.label}${f.lossless ? ' (lossless)' : ''}`);
      if (o.normalize) steps.push('Even out the loudness to −14 LUFS (streaming level)');
      lossless = f.lossless ? (a.lossless ? 'full' : 'none') : 'none';
      if (f.lossless && !a.lossless) warn.push(`The source is already compressed (${a.codec.toUpperCase()}), so ${f.label} keeps it exactly as it sounds now but can’t bring back detail it never had.`);
    }
    if (f.id === 'mp3') args.push('-id3v2_version', '3');
    if (f.id === 'm4a' || f.id === 'alac') args.push('-movflags', '+faststart');
    args.push(...meta, ...T, 'out.' + ext);
    return { args, out: 'out.' + ext, ext, mime, inputs, dur, steps, lossless, warn };
  }

  /* ----- image targets ----- */
  if (f.kind === 'image') {
    const size = o.imgSize;
    const vf = [];
    let pre = [], src = ['-i', '@in0'];
    if (S.kind === 'video') {
      const at = o.frameAt != null && o.frameAt !== '' ? Math.max(0, Math.min(+o.frameAt, Math.max(0, S.duration - 0.05))) : Math.min(S.duration * 0.1, 10);
      pre = ['-ss', at.toFixed(3)];
      steps.push(`Take the frame at ${CV.time(at)}${at % 1 ? '.' + String(Math.round((at % 1) * 10)) : ''}`);
    } else if (S.kind === 'audio') {
      const cols = '0x' + (o.accent || '#ff7849').replace('#', '');
      // (a spectrogram picture was tried too: this build needs minutes for it, silently, so only the waveform is offered)
      const pic = `showwavespic=s=2400x600:split_channels=1:colors=${cols}`;
      src = [...w.pre, '-i', '@in0', ...w.post];
      vf.push(pic);
      steps.push('Draw the waveform of the sound');
      args = [...src, '-filter_complex', `[0:a:${firstTrack().i}]${vf.join(',')}[v]`, '-map', '[v]'];
    } else steps.push(`Convert the picture to ${f.label}`);
    if (S.kind !== 'audio') {
      const sc = { orig: null, half: 'scale=iw/2:-1:flags=lanczos', quarter: 'scale=iw/4:-1:flags=lanczos', 3840: '3840', 1920: '1920', 1280: '1280', 640: '640' }[size];
      if (sc && /^\d+$/.test(sc)) vf.push(`scale='if(gt(iw,ih),min(${sc},iw),-2)':'if(gt(iw,ih),-2,min(${sc},ih))':flags=lanczos`);
      else if (sc) vf.push(sc);
      if (f.id === 'ico') vf.push(`scale='min(256,iw)':'min(256,ih)':force_original_aspect_ratio=decrease:flags=lanczos`);
      args = [...pre, ...src];
    }
    const alpha = S.v && S.v.alpha;
    let enc = [];
    if (f.id === 'png') enc = ['-c:v', 'png'];
    else if (f.id === 'jpg') {
      enc = ['-c:v', 'mjpeg', '-q:v', String(pick(o.quality, [1, 2, 4, 7])), '-qmin', '1', '-pix_fmt', o.quality === 'best' || o.quality === 'high' ? 'yuvj444p' : 'yuvj420p'];
      if (alpha) steps.push(`Fill the transparent areas with ${o.bg === '#000000' ? 'black' : 'white'} (JPEG has no transparency)`);
    } else if (f.id === 'webp') {
      const lossy = !(o.quality === 'best' && S.kind === 'image' && /^(png|bmp|tiff|gif|qoi|targa|ppm|pam)$/.test(S.v.codec));
      enc = ['-c:v', 'libwebp', ...(lossy ? ['-quality', String(pick(o.quality, [95, 90, 82, 70])), '-compression_level', '6'] : ['-lossless', '1', '-compression_level', '6'])];
      if (!lossy) steps.push('Lossless WebP (the source is lossless)');
    } else if (f.id === 'gif') vf.push('split[a][b];[a]palettegen=max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a');
    else if (f.id === 'bmp') enc = ['-c:v', 'bmp'];
    else if (f.id === 'tiff') enc = ['-c:v', 'tiff', '-compression_algo', 'lzw'];
    else if (f.id === 'ico') { enc = ['-c:v', 'png']; vf.push('format=rgba'); }
    else if (f.id === 'tga') enc = ['-c:v', 'targa'];
    if (S.kind !== 'audio') {
      if (f.id === 'jpg' && alpha) {
        const bg = (o.bg || '#ffffff').replace('#', '');
        args.push('-filter_complex', `[0:v]${vf.length ? vf.join(',') + ',' : ''}format=rgba[f];[f]split[f1][f2];[f2]drawbox=c=0x${bg}:t=fill[b];[b][f1]overlay=format=auto[v]`, '-map', '[v]');
      } else if (vf.length) args.push('-vf', vf.join(','));
      else args.push('-map', '0:v:0');
    }
    // -update is the single-picture switch of the image2 writer; the GIF and ICO writers reject it
    args.push(...enc, '-frames:v', '1', ...(f.id === 'gif' || f.id === 'ico' ? [] : ['-update', '1']), ...(o.meta ? [] : ['-map_metadata', '-1']), 'out.' + ext);
    return { args, out: 'out.' + ext, ext, mime, inputs, dur: 0, steps, lossless: f.lossless && S.kind === 'image' ? 'full' : 'none', warn };
  }

  /* ----- video targets ----- */
  if (f.anim) {
    const fps = +o.gifFps || 15, W = o.gifW === 'orig' ? -1 : +o.gifW || 480;
    const scale = W > 0 && S.v && S.v.w > W ? `scale=${W}:-1:flags=lanczos,` : '';
    args = [...w.pre, '-i', '@in0', ...w.post, '-filter_complex', `[0:v:0]fps=${fps},${scale}split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle[v]`, '-map', '[v]', '-loop', '0', ...T, 'out.gif'];
    steps.push(`Make a ${fps} fps animated GIF${scale ? `, ${W} px wide` : ''} with an optimised 256-colour palette`);
    if (dur > 30) warn.push(`That is ${Math.round(dur)} seconds of GIF: the file will be large. Trim it to the part you need.`);
    return { args, out: 'out.gif', ext: 'gif', mime: 'image/gif', inputs, dur, frames: Math.round(dur * fps), steps, lossless: 'none', warn };
  }
  let vc = f.vc;
  if (o.vcodec !== 'auto' && f.vcodecs && f.vcodecs.includes(o.vcodec)) vc = o.vcodec;
  const vcopyOk = c => f.vcopy === '*' || (f.vcopy || []).includes(c);
  const acopyOk = c => f.acopy === '*' || (f.acopy || []).includes(c);
  // (pictures need the even-size fix too: H.264 and most video codecs reject odd widths and heights)
  const vFilters = S.kind === 'video' ? videoFilters(S, o, { evenDims: true }) : S.kind === 'image' ? videoFilters(S, { ...o, fps: 'orig' }, { evenDims: true }) : [];
  const userWantsCodec = o.vcodec !== 'auto' && S.v && VCODEC_NAME[vc] !== S.v.codec;
  const copyV = S.kind === 'video' && best && !w.trimmed && !vFilters.length && !userWantsCodec && vcopyOk(S.v.codec);
  const tracks = o.keepAudio ? (f.multiAudio ? pickTracks() : [firstTrack()].filter(Boolean)) : [];
  args = [];
  if (S.kind === 'image') {
    const d = Math.max(0.5, +o.stillDur || 5);
    args.push('-loop', '1', '-framerate', String(o.fps === 'orig' ? 30 : +o.fps), '-i', '@in0', '-t', d.toFixed(2));
    dur = d;
    steps.push(`Hold the picture for ${d} s`);
  } else if (S.kind === 'audio') {
    args.push(...w.pre, '-i', '@in0', ...w.post);
    if (o.picture === 'image' && item.extra && item.extra.picture) { args.push('-loop', '1', '-framerate', '30', '-i', '@in1'); inputs.push('picture'); }
  } else args.push(...w.pre, '-i', '@in0', ...w.post);

  // video stream
  const outW = 1280, outH = 720;
  if (S.kind === 'audio') {
    const a = firstTrack(), acc = '0x' + (o.accent || '#ff7849').replace('#', '');
    let fc;
    if (o.picture === 'image' && inputs.includes('picture')) { fc = `[1:v]scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p[v]`; steps.push('Show your picture for the whole sound'); }
    else if (o.picture === 'spectrum') { fc = `[0:a:${a.i}]showspectrum=s=${outW}x${outH}:slide=scroll:mode=combined:color=intensity:scale=log,format=yuv420p[v]`; steps.push('Animate a scrolling spectrum of the sound'); }
    else if (o.picture === 'black') { fc = `color=c=black:s=${outW}x${outH}:r=30,format=yuv420p[v]`; steps.push('Use a plain black picture'); }
    else { fc = `[0:a:${a.i}]showwaves=s=${outW}x${outH}:mode=cline:rate=30:colors=${acc}|${acc},format=yuv420p[v]`; steps.push('Animate the waveform of the sound'); }
    args.push('-filter_complex', fc, '-map', '[v]');
    args.push(...videoArgs(vc, o, S, threads));
    if (vc === 'h264' && (o.picture === 'image' || o.picture === 'black')) args.push('-tune', 'stillimage');
    args.push('-shortest');
  } else {
    args.push('-map', '0:v:0');
    if (copyV) { args.push('-c:v', 'copy'); steps.push(`Copy the ${S.v.codec.toUpperCase()} video as it is — no quality loss`); if (f.id === 'mp4' || f.id === 'mov') { if (S.v.codec === 'hevc') args.push('-tag:v', 'hvc1'); } }
    else {
      if (vFilters.length) args.push('-vf', vFilters.join(','));
      args.push(...videoArgs(vc, o, S, threads));
      if (vc === 'h264' && S.kind === 'image') args.push('-tune', 'stillimage');
      if (vc === 'h265' && (f.id === 'mp4' || f.id === 'mov')) args.push('-tag:v', 'hvc1');
      steps.push(`Encode the video as ${CV.vcodecName(vc)}${o.res !== 'orig' && S.v && S.v.h > +o.res ? `, ${o.res}p` : ''}${o.fps !== 'orig' ? `, ${o.fps} fps` : ''}`);
      if (S.kind === 'video' && best && !w.trimmed && !vFilters.length && !vcopyOk(S.v.codec)) warn.push(`${f.label} can’t hold ${S.v.codec.toUpperCase()} video as it is, so the picture is re-encoded at the highest setting.`);
    }
  }
  // audio streams
  let aCopied = 0, aEnc = 0;
  if (S.kind === 'audio') {
    const a = firstTrack();
    args.push('-map', `0:a:${a.i}`);
    const can = best && acopyOk(a.codec) && !o.normalize && o.sr === 'orig' && o.ch === 'orig' && !w.trimmed;
    if (can) { args.push('-c:a', 'copy'); aCopied++; }
    else { const fl = audioFilters(f.ac, a, o, f); if (fl.length) args.push('-af', fl.join(',')); args.push(...audioArgs(f.ac, a, o, '', f), ...audioShape(f, a, o, f.ac)); aEnc++; }
  } else if (S.kind === 'video') {
    tracks.forEach((a, k) => {
      args.push('-map', `0:a:${a.i}`);
      const can = best && acopyOk(a.codec) && !o.normalize && o.sr === 'orig' && o.ch === 'orig' && !w.trimmed;
      if (can) { args.push(`-c:a:${k}`, 'copy'); aCopied++; }
      else {
        const fl = audioFilters(f.ac, a, o, f);
        if (fl.length) args.push(`-filter:a:${k}`, fl.join(','));
        args.push(...audioArgs(f.ac, a, o, k, f), ...audioShape(f, a, o, f.ac, k)); aEnc++;
      }
    });
  }
  if (aCopied) steps.push(`Copy ${aCopied > 1 ? aCopied + ' sound tracks' : 'the sound'} as ${aCopied > 1 ? 'they are' : 'it is'}`);
  if (aEnc) steps.push(`Encode ${aEnc > 1 ? aEnc + ' sound tracks' : 'the sound'} as ${{ aac: 'AAC', opus: 'Opus', mp3: 'MP3', wmav2: 'WMA', mp2: 'MP2', vorbis: 'Vorbis' }[f.ac] || f.ac}${o.normalize ? ', loudness evened out' : ''}`);
  if (S.kind === 'video' && !o.keepAudio && S.as.length) steps.push('Leave the sound out');
  // subtitles
  if (S.kind === 'video' && o.keepSubs && f.subs && w.trimmed && S.ss.length) {
    // FFmpeg gets subtitle timing wrong on a cut (lines from before the cut stay, later ones shift), so a trimmed
    // copy leaves them out rather than showing them at the wrong moments
    warn.push('Subtitles are left out of a trimmed copy: their timing can’t be kept exact after a cut. Convert the whole file to keep them, or save them on their own as SRT.');
  } else if (S.kind === 'video' && o.keepSubs && f.subs) {
    const subs = f.subs === 'copy' ? S.ss : S.textSubs;
    subs.forEach(s => args.push('-map', `0:s:${s.i}`));
    if (subs.length) { args.push('-c:s', f.subs === 'copy' ? 'copy' : f.subs); steps.push(`Keep ${subs.length} subtitle track${subs.length > 1 ? 's' : ''}`); }
    if (f.subs !== 'copy' && S.ss.length > subs.length) warn.push(`${S.ss.length - subs.length} picture-based subtitle track(s) can’t go into ${f.label} and are left out (MKV can keep them).`);
  }
  if (S.kind === 'video' && f.id === 'mkv' && o.meta) args.push('-map', '0:t?');   // fonts / attachments
  if (f.id === 'mp4' || f.id === 'mov') args.push('-movflags', '+faststart');
  if (f.id === 'ts' || f.id === 'mpg') args.push('-muxdelay', '0');
  args.push(...meta, ...T, '-max_muxing_queue_size', '4096', 'out.' + ext);
  if (S.kind === 'video') {
    const vcp = copyV, acp = aEnc === 0;
    lossless = vcp && acp ? 'full' : vcp || aCopied ? 'partial' : 'none';
  }
  // progress for re-encoded video is counted in frames: ffmpeg's clock follows the fastest stream (usually the sound)
  const outFps = S.kind === 'video' ? (o.fps !== 'orig' ? +o.fps : (S.v && S.v.fps) || 30) : S.kind === 'image' ? (o.fps === 'orig' ? 30 : +o.fps) : 30;
  const frames = copyV ? 0 : Math.round(dur * outFps);
  return { args, out: 'out.' + ext, ext, mime, inputs, dur, frames, steps, lossless, warn };
};

/** a short size estimate in bytes (very rough) for the output card */
CV.estimate = (item, plan) => {
  const S = item.S, f = CV.fmt(item.target), o = { ...CV.DEFAULTS, ...item.o };
  const d = plan.dur || S.duration || 0;
  if (plan.lossless === 'full' && S.kind !== 'image' && f.kind !== 'audio') return S.size * (d && S.duration ? d / S.duration : 1);
  if (f.kind === 'audio') {
    const a = S.as[0] || { sr: 48000, ch: 2, bits: 16 };
    if (f.orig || /copy/.test(plan.args.join(' '))) return (a.bitrate || S.bitrate || 192000) / 8 * d;
    if (f.id === 'wav' || f.id === 'aiff') { const bits = o.depth === 'auto' ? (a.lossless ? (a.bits <= 16 ? 16 : 24) : 16) : +o.depth; return (o.sr === 'orig' ? Math.min(a.sr || 48000, 192000) : +o.sr) * (o.ch === 'orig' ? a.ch || 2 : +o.ch) * bits / 8 * d; }
    if (f.lossless) return (a.sr || 48000) * (a.ch || 2) * 2 * 0.6 * d;
    const kb = o.abr !== 'auto' ? +o.abr : pick(o.quality, ABR[f.ac] || [320, 256, 192, 128]);
    return kb * 1000 / 8 * d;
  }
  if (f.kind === 'video' && !f.anim) {
    const px = S.v ? Math.min(S.v.w * S.v.h, o.res === 'orig' ? Infinity : +o.res * +o.res * 16 / 9) : 1280 * 720;
    const bpp = pick(o.quality, [0.16, 0.1, 0.06, 0.035]) * (f.vc === 'h265' || o.vcodec === 'h265' ? 0.6 : 1) * (f.vc === 'mpeg4' || f.vc === 'wmv2' || f.vc === 'mpeg2' ? 1.8 : 1);
    const fps = S.v && S.v.fps ? S.v.fps : 30;
    const v = /-c:v copy/.test(plan.args.join(' ')) ? (S.v.bitrate || S.bitrate * 0.9) / 8 * d : px * fps * bpp / 8 * d;
    return v + (S.as.length && o.keepAudio ? 256000 / 8 * d : 0);
  }
  return 0;
};
})();
