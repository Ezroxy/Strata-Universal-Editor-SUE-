/* Strata Studio — container writers: MP4 (ISO-BMFF, fast-start), WebM (Matroska) and animated GIF */
(() => {
'use strict';
const App = window.App;
const M = App.mux = {};

/* ---------- byte helpers ---------- */
const enc = new TextEncoder();
const cat = (...parts) => {
  const flat = [];
  const walk = p => { if (p == null) return; if (Array.isArray(p)) p.forEach(walk); else flat.push(p instanceof Uint8Array ? p : new Uint8Array(p)); };
  walk(parts);
  let n = 0; for (const p of flat) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of flat) { out.set(p, o); o += p.length; }
  return out;
};
const u8 = v => new Uint8Array([v & 255]);
const u16 = v => new Uint8Array([(v >> 8) & 255, v & 255]);
const i16 = v => u16(v < 0 ? v + 65536 : v);
const u24 = v => new Uint8Array([(v >> 16) & 255, (v >> 8) & 255, v & 255]);
const u32 = v => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const i32 = v => u32(v < 0 ? v + 4294967296 : v);
const u64 = v => cat(u32(Math.floor(v / 4294967296)), u32(v >>> 0));
const str = s => enc.encode(s);
const zeros = n => new Uint8Array(n);
const box = (type, ...parts) => { const body = cat(...parts); return cat(u32(8 + body.length), str(type), body); };
const fbox = (type, version, flags, ...parts) => box(type, u8(version), u24(flags), ...parts);
const MATRIX = cat(u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000));
const chunkBytes = chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); return b; };

/* =====================================================================
   MP4
   ===================================================================== */
class Mp4Muxer {
  /** video: {codec:'avc'|'vp9', width, height, fps}  audio: {codec:'aac'|'opus', sampleRate, channels} */
  constructor({ video, audio }) {
    this.v = video ? { ...video, samples: [], desc: null, timescale: 90000 } : null;
    this.a = audio ? { ...audio, samples: [], desc: null, timescale: audio.sampleRate } : null;
  }
  addVideo(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description) this.v.desc = new Uint8Array(meta.decoderConfig.description);
    this.v.samples.push({ data: chunkBytes(chunk), ts: chunk.timestamp, dur: chunk.duration || 0, key: chunk.type === 'key' });
  }
  addAudio(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description) this.a.desc = new Uint8Array(meta.decoderConfig.description);
    this.a.samples.push({ data: chunkBytes(chunk), ts: chunk.timestamp, dur: chunk.duration || 0, key: true });
  }
  finalize() {
    const tracks = [this.v, this.a].filter(t => t && t.samples.length);
    tracks.forEach((t, i) => { t.id = i + 1; this.prepTrack(t); });
    // interleave ~0.5 s chunks
    const chunks = [];
    for (const t of tracks) {
      let cur = null;
      t.samples.forEach((s, i) => {
        if (!cur || s.ts - cur.t0 > 500000) { cur = { track: t, t0: s.ts, samples: [] }; chunks.push(cur); }
        cur.samples.push(i);
      });
    }
    chunks.sort((a, b) => a.t0 - b.t0 || a.track.id - b.track.id);
    let dataSize = 0;
    for (const c of chunks) { c.size = c.samples.reduce((n, i) => n + c.track.samples[i].data.length, 0); dataSize += c.size; }
    const co64 = dataSize > 4.2e9;
    const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str(this.v && this.v.codec === 'avc' ? 'avc1' : 'iso6'), str('mp41'));
    const mdatHead = dataSize + 8 > 4294967295 ? cat(u32(1), str('mdat'), u64(dataSize + 16)) : cat(u32(dataSize + 8), str('mdat'));
    const layout = base => { let o = base; for (const c of chunks) { c.offset = o; o += c.size; } };
    layout(0);
    let moov = this.moov(tracks, chunks, co64);
    layout(ftyp.length + moov.length + mdatHead.length);
    moov = this.moov(tracks, chunks, co64);
    const parts = [ftyp, moov, mdatHead];
    for (const c of chunks) for (const i of c.samples) parts.push(c.track.samples[i].data);
    return new Blob(parts, { type: this.v ? 'video/mp4' : 'audio/mp4' });
  }
  prepTrack(t) {
    const S = t.samples, ts = t.timescale;
    const toTs = us => Math.round(us * ts / 1e6);
    // decode order = arrival order; durations from presentation timestamps
    const pts = S.map(s => toTs(s.ts));
    const sorted = pts.slice().sort((a, b) => a - b);
    t.reordered = pts.some((p, i) => p !== sorted[i]);
    t.dts = sorted;
    t.durs = S.map((s, i) => i < S.length - 1 ? Math.max(1, sorted[i + 1] - sorted[i]) : Math.max(1, toTs(s.dur) || (S.length > 1 ? sorted[i] - sorted[i - 1] : toTs(33333))));
    t.cts = pts.map((p, i) => p - sorted[i]);
    t.duration = t.durs.reduce((a, b) => a + b, 0) + (sorted[0] || 0);
  }
  moov(tracks, chunks, co64) {
    const mvTs = 1000;
    const dur = Math.max(...tracks.map(t => Math.round(t.duration / t.timescale * mvTs)));
    const mvhd = fbox('mvhd', 0, 0, u32(0), u32(0), u32(mvTs), u32(dur), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(tracks.length + 1));
    return box('moov', mvhd, ...tracks.map(t => this.trak(t, chunks.filter(c => c.track === t), mvTs, co64)));
  }
  trak(t, chunks, mvTs, co64) {
    const isV = t === this.v;
    const tkDur = Math.round(t.duration / t.timescale * mvTs);
    const tkhd = fbox('tkhd', 0, 3, u32(0), u32(0), u32(t.id), u32(0), u32(tkDur), zeros(8), u16(0), u16(0), u16(isV ? 0 : 0x0100), u16(0), MATRIX,
      u32(isV ? t.width * 65536 : 0), u32(isV ? t.height * 65536 : 0));
    const mdhd = fbox('mdhd', 0, 0, u32(0), u32(0), u32(t.timescale), u32(t.duration), u16(0x55c4), u16(0));
    const hdlr = fbox('hdlr', 0, 0, u32(0), str(isV ? 'vide' : 'soun'), zeros(12), str(isV ? 'Strata Video' : 'Strata Audio'), u8(0));
    const xmhd = isV ? fbox('vmhd', 0, 1, u16(0), zeros(6)) : fbox('smhd', 0, 0, u16(0), u16(0));
    const dinf = box('dinf', fbox('dref', 0, 0, u32(1), fbox('url ', 0, 1)));
    // stts
    const runs = [];
    for (const d of t.durs) { const r = runs[runs.length - 1]; if (r && r[1] === d) r[0]++; else runs.push([1, d]); }
    const stts = fbox('stts', 0, 0, u32(runs.length), runs.map(r => cat(u32(r[0]), u32(r[1]))));
    let ctts = null;
    if (t.reordered) {
      const cr = [];
      for (const c of t.cts) { const r = cr[cr.length - 1]; if (r && r[1] === c) r[0]++; else cr.push([1, c]); }
      ctts = fbox('ctts', 1, 0, u32(cr.length), cr.map(r => cat(u32(r[0]), i32(r[1]))));
    }
    const stss = isV ? (() => { const k = []; t.samples.forEach((s, i) => s.key && k.push(i + 1)); return fbox('stss', 0, 0, u32(k.length), k.map(u32)); })() : null;
    const scRuns = [];
    chunks.forEach((c, i) => { const r = scRuns[scRuns.length - 1]; if (!r || r[1] !== c.samples.length) scRuns.push([i + 1, c.samples.length]); });
    const stsc = fbox('stsc', 0, 0, u32(scRuns.length), scRuns.map(r => cat(u32(r[0]), u32(r[1]), u32(1))));
    const stsz = fbox('stsz', 0, 0, u32(0), u32(t.samples.length), t.samples.map(s => u32(s.data.length)));
    const stco = co64 ? fbox('co64', 0, 0, u32(chunks.length), chunks.map(c => u64(c.offset))) : fbox('stco', 0, 0, u32(chunks.length), chunks.map(c => u32(c.offset)));
    const stbl = box('stbl', fbox('stsd', 0, 0, u32(1), this.sampleEntry(t)), stts, ctts, stss, stsc, stsz, stco);
    return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', xmhd, dinf, stbl)));
  }
  sampleEntry(t) {
    if (t === this.v) {
      const common = [zeros(6), u16(1), u16(0), u16(0), zeros(12), u16(t.width), u16(t.height), u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x18), i16(-1)];
      if (t.codec === 'avc') return box('avc1', ...common, box('avcC', t.desc || new Uint8Array(0)));
      // VP9 in MP4 (vpcC)
      return box('vp09', ...common, fbox('vpcC', 1, 0, u8(0), u8(10), u8((8 << 4) | (1 << 1) | 0), u8(1), u8(1), u8(1), u16(0)));
    }
    const head = [zeros(6), u16(1), zeros(8), u16(t.channels), u16(16), u16(0), u16(0), u32(t.sampleRate * 65536)];
    if (t.codec === 'opus') {
      const preSkip = 312;
      return box('Opus', ...head, box('dOps', u8(0), u8(t.channels), u16(preSkip), u32(t.sampleRate), i16(0), u8(0)));
    }
    const asc = t.desc && t.desc.length ? t.desc : (() => { // AAC-LC AudioSpecificConfig fallback
      const idx = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000].indexOf(t.sampleRate);
      return new Uint8Array([(2 << 3) | (idx >> 1), ((idx & 1) << 7) | (t.channels << 3)]);
    })();
    const desc = (tag, body) => cat(u8(tag), u8(body.length), body);
    const dcd = desc(0x04, cat(u8(0x40), u8(0x15), u24(0), u32(t.bitrate || 192000), u32(t.bitrate || 192000), desc(0x05, asc)));
    const esd = desc(0x03, cat(u16(t.id), u8(0), dcd, desc(0x06, u8(0x02))));
    return box('mp4a', ...head, fbox('esds', 0, 0, esd));
  }
}
M.Mp4Muxer = Mp4Muxer;

/* =====================================================================
   WebM
   ===================================================================== */
const idBytes = id => { const b = []; let v = id; while (v > 0) { b.unshift(v & 255); v = Math.floor(v / 256); } return new Uint8Array(b); };
const vint = n => {
  for (let len = 1; len <= 8; len++) {
    if (n < Math.pow(2, 7 * len) - 1) {
      const b = new Uint8Array(len); let v = n;
      for (let i = len - 1; i >= 0; i--) { b[i] = v & 255; v = Math.floor(v / 256); }
      b[0] |= 1 << (8 - len);
      return b;
    }
  }
  throw new Error('EBML size too large');
};
const el = (id, ...parts) => { const body = cat(...parts); return cat(idBytes(id), vint(body.length), body); };
const euint = (id, v, fixed) => {
  const b = [];
  if (fixed) { for (let i = 0; i < fixed; i++) { b.unshift(v & 255); v = Math.floor(v / 256); } }
  else { do { b.unshift(v & 255); v = Math.floor(v / 256); } while (v > 0); }
  return el(id, new Uint8Array(b));
};
const efloat = (id, v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, b); };
const estr = (id, s) => el(id, str(s));
class WebmMuxer {
  constructor({ video, audio }) {
    this.v = video ? { ...video, frames: [] } : null;
    this.a = audio ? { ...audio, frames: [] } : null;
  }
  addVideo(chunk) { this.v.frames.push({ data: chunkBytes(chunk), ts: chunk.timestamp, key: chunk.type === 'key', track: 1 }); }
  addAudio(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description) this.a.desc = new Uint8Array(meta.decoderConfig.description);
    this.a.frames.push({ data: chunkBytes(chunk), ts: chunk.timestamp, key: true, track: this.v ? 2 : 1 });
  }
  finalize() {
    const preSkip = 312;
    const entries = [];
    if (this.v) entries.push(el(0xAE, euint(0xD7, 1), euint(0x73C5, 1), euint(0x83, 1), estr(0x86, this.v.codec === 'vp8' ? 'V_VP8' : 'V_VP9'),
      el(0xE0, euint(0xB0, this.v.width), euint(0xBA, this.v.height))));
    if (this.a) {
      const n = this.v ? 2 : 1;
      const head = this.a.desc && this.a.desc.length >= 19 ? this.a.desc : (() => {
        const b = new Uint8Array(19); b.set(str('OpusHead')); b[8] = 1; b[9] = this.a.channels;
        const dv = new DataView(b.buffer); dv.setUint16(10, preSkip, true); dv.setUint32(12, this.a.sampleRate, true); dv.setInt16(16, 0, true); b[18] = 0;
        return b;
      })();
      entries.push(el(0xAE, euint(0xD7, n), euint(0x73C5, n), euint(0x83, 2), estr(0x86, 'A_OPUS'), el(0x63A2, head),
        euint(0x56AA, Math.round(preSkip / 48000 * 1e9)), euint(0x56BB, 80000000),
        el(0xE1, efloat(0xB5, this.a.sampleRate), euint(0x9F, this.a.channels))));
    }
    const tracks = el(0x1654AE6B, ...entries);
    const frames = [...(this.v ? this.v.frames : []), ...(this.a ? this.a.frames : [])].sort((x, y) => x.ts - y.ts || x.track - y.track);
    const durMs = frames.length ? frames[frames.length - 1].ts / 1000 + 40 : 0;
    const info = el(0x1549A966, euint(0x2AD7B1, 1000000), estr(0x4D80, 'Strata Studio'), estr(0x5741, 'Strata Studio'), efloat(0x4489, durMs));
    // clusters
    const clusters = [];
    let cur = null;
    for (const f of frames) {
      const ms = Math.round(f.ts / 1000);
      const startNew = !cur || ms - cur.t0 > 32000 || (ms - cur.t0 >= 2000 && (this.v ? (f.track === 1 && f.key) : true));
      if (startNew) { cur = { t0: ms, blocks: [], cue: !this.v || (f.track === 1 && f.key) }; clusters.push(cur); }
      const rel = ms - cur.t0;
      cur.blocks.push(el(0xA3, vint(f.track), i16(rel), u8(f.key ? 0x80 : 0), f.data));
    }
    const clusterBytes = clusters.map(c => el(0x1F43B675, euint(0xE7, c.t0), ...c.blocks));
    const cuesFor = offsets => el(0x1C53BB6B, ...clusters.map((c, i) => c.cue ? el(0xBB, euint(0xB3, c.t0), el(0xB7, euint(0xF7, 1), euint(0xF1, offsets[i], 8))) : null).filter(Boolean));
    let cues = cuesFor(clusters.map(() => 0));
    const offs = []; let o = info.length + tracks.length + cues.length;
    for (const cb of clusterBytes) { offs.push(o); o += cb.length; }
    cues = cuesFor(offs);
    const segBody = [info, tracks, cues, ...clusterBytes];
    const segSize = segBody.reduce((n, p) => n + p.length, 0);
    const ebml = el(0x1A45DFA3, euint(0x4286, 1), euint(0x42F7, 1), euint(0x42F2, 4), euint(0x42F3, 8), estr(0x4282, 'webm'), euint(0x4287, 4), euint(0x4285, 2));
    return new Blob([ebml, idBytes(0x18538067), vint(segSize), ...segBody], { type: this.v ? 'video/webm' : 'audio/webm' });
  }
}
M.WebmMuxer = WebmMuxer;

/* =====================================================================
   Animated GIF (median-cut palette, ordered dither, LZW)
   ===================================================================== */
class GifEncoder {
  constructor(w, h, { loop = 0 } = {}) { this.w = w; this.h = h; this.loop = loop; this.pts = []; this.parts = null; }
  /** feed a representative frame for the palette (call before addFrame) */
  sample(imageData) {
    const d = imageData.data, stride = Math.max(1, Math.floor(d.length / 4 / 2500));
    for (let i = 0; i < d.length; i += 4 * stride) this.pts.push([d[i], d[i + 1], d[i + 2]]);
  }
  buildPalette() {
    const pts = this.pts.length ? this.pts : [[0, 0, 0]];
    const mk = arr => {
      const lo = [255, 255, 255], hi = [0, 0, 0];
      for (const p of arr) for (let c = 0; c < 3; c++) { if (p[c] < lo[c]) lo[c] = p[c]; if (p[c] > hi[c]) hi[c] = p[c]; }
      const rng = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      const r = Math.max(...rng);
      return { arr, axis: rng.indexOf(r), score: r * Math.sqrt(arr.length) };
    };
    const boxes = [mk(pts)];
    while (boxes.length < 255) {
      let bi = 0;
      for (let i = 1; i < boxes.length; i++) if (boxes[i].score > boxes[bi].score) bi = i;
      const bx = boxes[bi];
      if (bx.arr.length < 2 || bx.score === 0) break;
      bx.arr.sort((a, b) => a[bx.axis] - b[bx.axis]);
      const mid = bx.arr.length >> 1;
      boxes.splice(bi, 1, mk(bx.arr.slice(0, mid)), mk(bx.arr.slice(mid)));
    }
    const pal = boxes.map(({ arr }) => { const s = [0, 0, 0]; for (const p of arr) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return s.map(v => Math.round(v / arr.length)); });
    while (pal.length < 256) pal.push([0, 0, 0]);
    this.pal = pal;
    this.cache = new Int16Array(32768).fill(-1);
    this.pts = [];
  }
  nearest(r, g, b) {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let v = this.cache[key];
    if (v >= 0) return v;
    let best = 0, bd = 1e9;
    for (let i = 0; i < this.pal.length; i++) { const p = this.pal[i], d = (p[0] - r) ** 2 * 2 + (p[1] - g) ** 2 * 4 + (p[2] - b) ** 2 * 3; if (d < bd) { bd = d; best = i; } }
    this.cache[key] = best;
    return best;
  }
  lzw(indices) {
    const minCode = 8, clear = 256, eoi = 257;
    const out = []; let cur = 0, bits = 0;
    const emit = (code, size) => { cur |= code << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
    let dict = new Map(), next = 258, size = 9;
    emit(clear, size);
    let w = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = w * 4096 + k;
      const hit = dict.get(key);
      if (hit !== undefined) { w = hit; continue; }
      emit(w, size);
      if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
      else { emit(clear, size); dict = new Map(); next = 258; size = 9; }
      w = k;
    }
    emit(w, size); emit(eoi, size);
    if (bits > 0) out.push(cur & 255);
    const blocks = [u8(minCode)];
    for (let i = 0; i < out.length; i += 255) { const s = out.slice(i, i + 255); blocks.push(u8(s.length), new Uint8Array(s)); }
    blocks.push(u8(0));
    return cat(blocks);
  }
  /** quantize + LZW-encode one frame immediately (keeps memory low) */
  addFrame(imageData, delayMs) {
    const le16 = v => new Uint8Array([v & 255, (v >> 8) & 255]);
    if (!this.pal) { this.sample(imageData); this.buildPalette(); }
    if (!this.parts) {
      this.parts = [str('GIF89a'), le16(this.w), le16(this.h), u8(0xF7), u8(0), u8(0), new Uint8Array(this.pal.flat())];
      this.parts.push(new Uint8Array([0x21, 0xFF, 0x0B]), str('NETSCAPE2.0'), new Uint8Array([3, 1]), le16(this.loop), u8(0));
    }
    const d = imageData.data;
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v / 16 - 0.5) * 16);
    const idx = new Uint8Array(this.w * this.h);
    for (let y = 0, p = 0; y < this.h; y++) for (let x = 0; x < this.w; x++, p++) {
      const o = p * 4, t = bayer[(y & 3) * 4 + (x & 3)];
      idx[p] = this.nearest(Math.max(0, Math.min(255, d[o] + t)), Math.max(0, Math.min(255, d[o + 1] + t)), Math.max(0, Math.min(255, d[o + 2] + t)));
    }
    this.parts.push(new Uint8Array([0x21, 0xF9, 4, 0x04]), le16(Math.round(delayMs / 10)), u8(0), u8(0));
    this.parts.push(u8(0x2C), le16(0), le16(0), le16(this.w), le16(this.h), u8(0));
    this.parts.push(this.lzw(idx));
  }
  finalize() {
    this.parts.push(u8(0x3B));
    return new Blob(this.parts, { type: 'image/gif' });
  }
}
M.GifEncoder = GifEncoder;

/* =====================================================================
   Codec helpers (WebCodecs)
   ===================================================================== */
M.supported = () => typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';
M.pickVideoConfig = async (container, width, height, fps, bitrate) => {
  const mbps = (width / 16) * (height / 16) * fps;
  const avcLevel = mbps <= 245760 ? '28' : mbps <= 522240 ? '2a' : mbps <= 983040 ? '33' : '34';
  const vpLevel = width * height <= 2228224 ? '41' : '51';
  const list = container === 'mp4'
    ? [['avc', `avc1.6400${avcLevel}`], ['avc', `avc1.4d00${avcLevel}`], ['avc', `avc1.4200${avcLevel}`], ['avc', 'avc1.640034'], ['vp9', `vp09.00.${vpLevel}.08`]]
    : [['vp9', `vp09.00.${vpLevel}.08`], ['vp9', 'vp09.00.10.08'], ['vp8', 'vp8']];
  for (const [kind, codec] of list) {
    const cfg = { codec, width, height, bitrate, framerate: fps, latencyMode: 'quality' };
    if (kind === 'avc') cfg.avc = { format: 'avc' };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { kind, config: r.config || cfg }; } catch {}
  }
  return null;
};
M.pickAudioConfig = async (container, sampleRate, channels, bitrate) => {
  if (typeof window.AudioEncoder !== 'function') return null;
  const list = container === 'mp4' ? [['aac', 'mp4a.40.2'], ['opus', 'opus']] : [['opus', 'opus']];
  for (const [kind, codec] of list) {
    const cfg = { codec, sampleRate, numberOfChannels: channels, bitrate };
    try { const r = await AudioEncoder.isConfigSupported(cfg); if (r.supported) return { kind, config: cfg }; } catch {}
  }
  return null;
};
/** Encode stereo/mono planar float channels into AAC/Opus chunks via an AudioEncoder. */
M.encodeAudio = async (channels, sampleRate, cfg, onChunk) => {
  let failed = null;
  const encd = new AudioEncoder({ output: onChunk, error: e => { failed = e; } });
  encd.configure(cfg);
  const n = channels[0].length, step = 4096, nc = channels.length;
  for (let pos = 0; pos < n; pos += step) {
    const len = Math.min(step, n - pos), buf = new Float32Array(len * nc);
    for (let c = 0; c < nc; c++) buf.set(channels[c].subarray(pos, pos + len), c * len);
    const ad = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: len, numberOfChannels: nc, timestamp: Math.round(pos * 1e6 / sampleRate), data: buf });
    encd.encode(ad); ad.close();
    if (encd.encodeQueueSize > 20) await new Promise(r => setTimeout(r, 0));
    if (failed) throw failed;
  }
  await encd.flush();
  encd.close();
  if (failed) throw failed;
};
/** Audio-only compressed export (M4A / WebM-Opus). */
M.encodeAudioFile = async (channels, sampleRate, container, bitrate = 192000) => {
  const pick = await M.pickAudioConfig(container, sampleRate, channels.length, bitrate);
  if (!pick) throw new Error(`This browser can't encode ${container === 'mp4' ? 'AAC' : 'Opus'} audio`);
  const mx = container === 'mp4' ? new Mp4Muxer({ audio: { codec: pick.kind, sampleRate, channels: channels.length, bitrate } }) : new WebmMuxer({ audio: { sampleRate, channels: channels.length } });
  await M.encodeAudio(channels, sampleRate, pick.config, (c, m) => mx.addAudio(c, m));
  return mx.finalize();
};
})();
