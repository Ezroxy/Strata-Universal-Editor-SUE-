/* Strata Studio — demuxers (MP4/MOV, WebM/MKV) + a sequential frame decoder built on WebCodecs.
   Used by export to decode source video far faster than seeking a <video> element frame by frame. */
(() => {
'use strict';
const App = window.App;
const X = App.demux = {};
const hex2 = v => v.toString(16).padStart(2, '0');

/* =====================================================================
   MP4 / MOV
   ===================================================================== */
async function readRange(file, off, len) { return new Uint8Array(await file.slice(off, off + len).arrayBuffer()); }
function boxes(buf, start, end, fn) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = start;
  while (o + 8 <= end) {
    let size = dv.getUint32(o), hdr = 8;
    const type = String.fromCharCode(buf[o + 4], buf[o + 5], buf[o + 6], buf[o + 7]);
    if (size === 1) { size = dv.getUint32(o + 8) * 4294967296 + dv.getUint32(o + 12); hdr = 16; }
    else if (size === 0) size = end - o;
    if (size < hdr) break;
    fn(type, o + hdr, Math.min(end, o + size), dv);
    o += size;
  }
}
async function parseMp4(file) {
  // locate moov without reading mdat
  let off = 0, moov = null;
  while (off < file.size) {
    const h = await readRange(file, off, 16);
    if (h.length < 8) break;
    const dv = new DataView(h.buffer);
    let size = dv.getUint32(0), hdr = 8;
    const type = String.fromCharCode(h[4], h[5], h[6], h[7]);
    if (size === 1) { size = dv.getUint32(8) * 4294967296 + dv.getUint32(12); hdr = 16; }
    else if (size === 0) size = file.size - off;
    if (size < 8) break;
    if (type === 'moov') { moov = await readRange(file, off + hdr, size - hdr); break; }
    off += size;
  }
  if (!moov) throw new Error('no moov');
  let movieTs = 1000;
  const tracks = [];
  boxes(moov, 0, moov.length, (type, s, e, dv) => {
    if (type === 'mvhd') { const v = moov[s]; movieTs = dv.getUint32(s + (v === 1 ? 20 : 12)); }
    if (type !== 'trak') return;
    const tr = { edits: [] };
    const walk = (s0, e0) => boxes(moov, s0, e0, (t, a, b) => {
      if (['mdia', 'minf', 'stbl', 'edts'].includes(t)) return walk(a, b);
      const ver = moov[a];
      if (t === 'tkhd') { const m = a + (ver === 1 ? 4 + 8 + 8 + 4 + 4 + 8 : 4 + 4 + 4 + 4 + 4 + 4) + 8 + 2 + 2 + 2 + 2; const A = dv.getInt32(m) / 65536, B = dv.getInt32(m + 4) / 65536; tr.rotation = (Math.round(Math.atan2(B, A) * 180 / Math.PI) + 360) % 360; }
      else if (t === 'mdhd') { tr.timescale = dv.getUint32(a + (ver === 1 ? 20 : 12)); }
      else if (t === 'hdlr') { tr.handler = String.fromCharCode(moov[a + 8], moov[a + 9], moov[a + 10], moov[a + 11]); }
      else if (t === 'elst') {
        const n = dv.getUint32(a + 4); let p = a + 8;
        for (let i = 0; i < n; i++) {
          const segDur = ver === 1 ? dv.getUint32(p) * 4294967296 + dv.getUint32(p + 4) : dv.getUint32(p);
          const mt = ver === 1 ? dv.getInt32(p + 8) * 4294967296 + dv.getUint32(p + 12) : dv.getInt32(p + 4);
          tr.edits.push({ segDur, mediaTime: mt });
          p += ver === 1 ? 20 : 12;
        }
      }
      else if (t === 'stsd') {
        const es = a + 8, type2 = String.fromCharCode(moov[es + 4], moov[es + 5], moov[es + 6], moov[es + 7]);
        tr.format = type2;
        tr.width = dv.getUint16(es + 8 + 24); tr.height = dv.getUint16(es + 8 + 26);
        const esize = dv.getUint32(es);
        boxes(moov, es + 8 + 78, es + esize, (ct, ca, cb) => { if (['avcC', 'hvcC', 'vpcC', 'av1C'].includes(ct)) { tr.cfgType = ct; tr.cfg = moov.slice(ca, cb); } });
      }
      else if (t === 'stts') { const n = dv.getUint32(a + 4); tr.stts = []; for (let i = 0; i < n; i++) tr.stts.push([dv.getUint32(a + 8 + i * 8), dv.getUint32(a + 12 + i * 8)]); }
      else if (t === 'ctts') { const n = dv.getUint32(a + 4); tr.ctts = []; for (let i = 0; i < n; i++) tr.ctts.push([dv.getUint32(a + 8 + i * 8), dv.getInt32(a + 12 + i * 8)]); }
      else if (t === 'stss') { const n = dv.getUint32(a + 4); tr.stss = new Set(); for (let i = 0; i < n; i++) tr.stss.add(dv.getUint32(a + 8 + i * 4)); }
      else if (t === 'stsc') { const n = dv.getUint32(a + 4); tr.stsc = []; for (let i = 0; i < n; i++) tr.stsc.push([dv.getUint32(a + 8 + i * 12), dv.getUint32(a + 12 + i * 12)]); }
      else if (t === 'stsz') { const ss = dv.getUint32(a + 4), n = dv.getUint32(a + 8); tr.sizes = new Uint32Array(n); for (let i = 0; i < n; i++) tr.sizes[i] = ss || dv.getUint32(a + 12 + i * 4); }
      else if (t === 'stco') { const n = dv.getUint32(a + 4); tr.co = new Float64Array(n); for (let i = 0; i < n; i++) tr.co[i] = dv.getUint32(a + 8 + i * 4); }
      else if (t === 'co64') { const n = dv.getUint32(a + 4); tr.co = new Float64Array(n); for (let i = 0; i < n; i++) tr.co[i] = dv.getUint32(a + 8 + i * 8) * 4294967296 + dv.getUint32(a + 12 + i * 8); }
    });
    walk(s, e);
    tracks.push(tr);
  });
  const tr = tracks.find(t => t.handler === 'vide' && t.sizes && t.sizes.length && t.co && t.cfg);
  if (!tr) throw new Error('no decodable video track');
  // codec string
  const c = tr.cfg;
  let codec, description = null;
  if (tr.cfgType === 'avcC') { codec = `avc1.${hex2(c[1])}${hex2(c[2])}${hex2(c[3])}`; description = c; }
  else if (tr.cfgType === 'hvcC') {
    const space = c[1] >> 6, tier = (c[1] >> 5) & 1, prof = c[1] & 31;
    let compat = (c[2] << 24 | c[3] << 16 | c[4] << 8 | c[5]) >>> 0, rev = 0;
    for (let i = 0; i < 32; i++) { rev = (rev << 1) | (compat & 1); compat >>>= 1; }
    const cons = [c[6], c[7], c[8], c[9], c[10], c[11]];
    while (cons.length && !cons[cons.length - 1]) cons.pop();
    codec = `${tr.format === 'hev1' ? 'hev1' : 'hvc1'}.${['', 'A', 'B', 'C'][space]}${prof}.${(rev >>> 0).toString(16)}.${tier ? 'H' : 'L'}${c[12]}${cons.map(b => '.' + hex2(b)).join('')}`;
    description = c;
  }
  else if (tr.cfgType === 'vpcC') { codec = `vp09.${String(c[4]).padStart(2, '0')}.${String(c[5]).padStart(2, '0')}.${String(c[6] >> 4).padStart(2, '0')}`; }
  else if (tr.cfgType === 'av1C') { const prof = c[1] >> 5, lvl = c[1] & 31, tierH = c[2] >> 7, hbd = (c[2] >> 6) & 1, twelve = (c[2] >> 5) & 1; codec = `av01.${prof}.${String(lvl).padStart(2, '0')}${tierH ? 'H' : 'M'}.${hbd ? (twelve ? '12' : '10') : '08'}`; description = c; }
  else throw new Error('unsupported codec');
  // sample table
  const n = tr.sizes.length, ts = tr.timescale || 90000;
  const samples = new Array(n);
  let dts = 0, si = 0;
  const durs = new Uint32Array(n);
  for (const [cnt, d] of tr.stts) for (let k = 0; k < cnt && si < n; k++) durs[si++] = d;
  const ctt = new Int32Array(n);
  if (tr.ctts) { si = 0; for (const [cnt, o] of tr.ctts) for (let k = 0; k < cnt && si < n; k++) ctt[si++] = o; }
  // chunk offsets
  const offs = new Float64Array(n);
  si = 0;
  for (let ci = 0; ci < tr.co.length && si < n; ci++) {
    let per = 1;
    for (const [first, spc] of tr.stsc) if (ci + 1 >= first) per = spc;
    let o = tr.co[ci];
    for (let k = 0; k < per && si < n; k++) { offs[si] = o; o += tr.sizes[si]; si++; }
  }
  // edit list → presentation offset
  let shift = 0;
  for (const e of tr.edits) { if (e.mediaTime === -1) shift += e.segDur / movieTs * ts; else { shift -= e.mediaTime; break; } }
  for (let i = 0; i < n; i++) {
    samples[i] = { offset: offs[i], size: tr.sizes[i], pts: Math.round((dts + ctt[i] + shift) / ts * 1e6), dur: Math.round(durs[i] / ts * 1e6), key: !tr.stss || tr.stss.has(i + 1) };
    dts += durs[i];
  }
  return { codec, description, width: tr.width, height: tr.height, rotation: tr.rotation || 0, samples, src: 'file' };
}

/* =====================================================================
   WebM / Matroska
   ===================================================================== */
function parseWebmBuffer(buf) {
  let p = 0;
  const readId = () => { const b = buf[p]; let len = 1; while (len <= 4 && !(b & (0x80 >> (len - 1)))) len++; let v = 0; for (let i = 0; i < len; i++) v = v * 256 + buf[p + i]; p += len; return v; };
  const readSize = () => {
    const b = buf[p]; let len = 1; while (len <= 8 && !(b & (0x80 >> (len - 1)))) len++;
    let v = b & (0xff >> len), allOnes = v === (0xff >> len);
    for (let i = 1; i < len; i++) { v = v * 256 + buf[p + i]; if (buf[p + i] !== 0xff) allOnes = false; }
    p += len;
    return allOnes ? -1 : v;
  };
  const uint = (s, e) => { let v = 0; for (let i = s; i < e; i++) v = v * 256 + buf[i]; return v; };
  const LEVEL1 = new Set([0x1F43B675, 0x1C53BB6B, 0x1254C367, 0x1043A770, 0x1941A469, 0x114D9B74, 0x1549A966, 0x1654AE6B]);
  let tcScale = 1e6, video = null;
  const samples = [];
  const end = buf.length;
  // EBML header
  if (readId() !== 0x1A45DFA3) throw new Error('not webm');
  let sz = readSize(); p += sz;
  if (readId() !== 0x18538067) throw new Error('no segment');
  sz = readSize();
  const segEnd = sz < 0 ? end : Math.min(end, p + sz);
  while (p < segEnd) {
    const id = readId(), size = readSize(), start = p;
    const elEnd = size < 0 ? segEnd : Math.min(segEnd, p + size);
    if (id === 0x1549A966) { // Info
      while (p < elEnd) { const cid = readId(), cs = readSize(); if (cid === 0x2AD7B1) tcScale = uint(p, p + cs); p += cs; }
    } else if (id === 0x1654AE6B) { // Tracks
      while (p < elEnd) {
        const tid = readId(), ts = readSize(), te = p + ts;
        if (tid === 0xAE) {
          const t = {};
          while (p < te) {
            const cid = readId(), cs = readSize();
            if (cid === 0xD7) t.num = uint(p, p + cs);
            else if (cid === 0x83) t.type = uint(p, p + cs);
            else if (cid === 0x86) t.codecId = String.fromCharCode(...buf.slice(p, p + cs));
            else if (cid === 0x63A2) t.priv = buf.slice(p, p + cs);
            else if (cid === 0xE0) { let q = p; const qe = p + cs; const save = p; p = q; while (p < qe) { const vid = readId(), vs = readSize(); if (vid === 0xB0) t.width = uint(p, p + vs); if (vid === 0xBA) t.height = uint(p, p + vs); p += vs; } p = save; }
            p += cs;
          }
          if (t.type === 1 && !video) video = t;
        }
        p = te;
      }
    } else if (id === 0x1F43B675) { // Cluster
      let ctc = 0;
      while (p < elEnd) {
        const save = p, cid = readId();
        if (LEVEL1.has(cid)) { p = save; break; }
        const cs = readSize(), ce = cs < 0 ? elEnd : p + cs;
        if (cid === 0xE7) ctc = uint(p, ce);
        else if (cid === 0xA3 || cid === 0xA0) {
          let bs = p, be = ce, key = false;
          if (cid === 0xA0) { // BlockGroup
            let q = p, blockS = -1, blockE = -1, hasRef = false;
            const sp = p; p = q;
            while (p < ce) { const gid = readId(), gs = readSize(); if (gid === 0xA1) { blockS = p; blockE = p + gs; } if (gid === 0xFB) hasRef = true; p += gs; }
            p = sp;
            if (blockS < 0) { p = ce; continue; }
            bs = blockS; be = blockE; key = !hasRef;
          }
          const sp = p; p = bs;
          const trackNum = (() => { const b = buf[p]; let len = 1; while (len <= 8 && !(b & (0x80 >> (len - 1)))) len++; let v = b & (0xff >> len); for (let i = 1; i < len; i++) v = v * 256 + buf[p + i]; p += len; return v; })();
          const rel = (buf[p] << 8 | buf[p + 1]) << 16 >> 16, flags = buf[p + 2];
          p += 3;
          if (cid === 0xA3) key = !!(flags & 0x80);
          if (video && trackNum === video.num) {
            if (flags & 0x06) throw new Error('laced video not supported');
            samples.push({ offset: p, size: be - p, pts: Math.round((ctc + rel) * tcScale / 1000), key });
          }
          p = sp;
        }
        p = ce;
      }
      if (p < elEnd && size >= 0) p = elEnd;
      continue;
    }
    p = size < 0 ? elEnd : start + size;
  }
  if (!video || !samples.length) throw new Error('no video');
  samples.sort((a, b) => a.offset - b.offset);
  for (let i = 0; i < samples.length; i++) samples[i].dur = i + 1 < samples.length ? Math.max(1, samples[i + 1].pts - samples[i].pts) : 33333;
  let codec, description = null;
  if (video.codecId === 'V_VP8') codec = 'vp8';
  else if (video.codecId === 'V_VP9') codec = 'vp09.00.10.08';
  else if (video.codecId === 'V_AV1') { codec = 'av01.0.08M.08'; description = video.priv || null; }
  else if (video.codecId === 'V_MPEG4/ISO/AVC' && video.priv) { const c = video.priv; codec = `avc1.${hex2(c[1])}${hex2(c[2])}${hex2(c[3])}`; description = c; }
  else throw new Error('unsupported codec ' + video.codecId);
  return { codec, description, width: video.width, height: video.height, rotation: 0, samples, src: 'buffer', buf };
}

/** Demux a media File (cached per File). Resolves to null when the fast path isn't possible. */
const cache = new WeakMap();
X.demux = file => {
  if (cache.has(file)) return cache.get(file);
  const p = (async () => {
    if (typeof window.VideoDecoder !== 'function') return null;
    const head = await readRange(file, 0, 12);
    const isMp4 = String.fromCharCode(head[4], head[5], head[6], head[7]) === 'ftyp' || /\.(mp4|m4v|mov)$/i.test(file.name);
    const isWebm = head[0] === 0x1A && head[1] === 0x45 && head[2] === 0xDF && head[3] === 0xA3;
    let info = null;
    if (isWebm) { if (file.size > 600e6) return null; info = parseWebmBuffer(new Uint8Array(await file.arrayBuffer())); }
    else if (isMp4) info = await parseMp4(file);
    else return null;
    const cfg = { codec: info.codec, codedWidth: info.width, codedHeight: info.height };
    if (info.description) cfg.description = info.description;
    const sup = await VideoDecoder.isConfigSupported(cfg).catch(() => ({ supported: false }));
    if (!sup.supported) return null;
    info.config = cfg;
    info.file = file;
    info.decodeOrder = info.samples;
    return info;
  })().catch(e => { console.info('Fast decode unavailable:', e.message); return null; });
  cache.set(file, p);
  return p;
};

/* =====================================================================
   Sequential frame decoder (forward-only, seeks to keyframes when jumping)
   ===================================================================== */
class FrameDecoder {
  constructor(info) {
    this.info = info; this.S = info.samples; this.queue = []; this.cur = null; this.next = 0; this.err = null; this.fedPts = -Infinity; this.lastTarget = null;
    this.win = null; this.winOff = 0;
    this.waiters = [];
    this.make();
    if (info.rotation) { this.rc = document.createElement('canvas'); }
  }
  make() {
    this.dec = new VideoDecoder({ output: f => { this.queue.push(f); this.queue.sort((a, b) => a.timestamp - b.timestamp); this.wake(); }, error: e => { this.err = e; this.wake(); } });
    this.dec.configure(this.info.config);
  }
  wake() { const w = this.waiters; this.waiters = []; w.forEach(f => f()); }
  wait(ms = 40) { return new Promise(r => { this.waiters.push(r); setTimeout(r, ms); }); }
  async data(s) {
    if (this.info.src === 'buffer') return this.info.buf.subarray(s.offset, s.offset + s.size);
    if (!this.win || s.offset < this.winOff || s.offset + s.size > this.winOff + this.win.length) {
      this.winOff = s.offset;
      this.win = await readRange(this.info.file, s.offset, Math.max(4 << 20, s.size));
    }
    return this.win.subarray(s.offset - this.winOff, s.offset - this.winOff + s.size);
  }
  keyBefore(us) {
    let k = 0;
    for (let i = 0; i < this.S.length; i++) if (this.S[i].key && this.S[i].pts <= us) k = i;
    return k;
  }
  async seekTo(us) {
    try { this.dec.reset(); } catch {}
    if (this.dec.state === 'closed') this.make(); else this.dec.configure(this.info.config);
    for (const f of this.queue) f.close();
    this.queue = []; if (this.cur) { this.cur.close(); this.cur = null; }
    this.next = this.keyBefore(us); this.flushed = false; this.fedPts = -Infinity;
  }
  async frameAt(t) {
    const us = Math.round(t * 1e6) + 500;
    if (this.lastTarget == null || us < this.lastTarget - 1000) await this.seekTo(us);
    else if (us > this.fedPts + 3e6) { const k = this.keyBefore(us); if (k > this.next) await this.seekTo(us); }
    this.lastTarget = us;
    for (let guard = 0; guard < 100000; guard++) {
      if (this.err) throw this.err;
      while (this.queue.length && this.queue[0].timestamp <= us) { if (this.cur) this.cur.close(); this.cur = this.queue.shift(); }
      if (this.queue.length) break;
      if (this.next >= this.S.length) {
        if (!this.flushed) { this.flushed = true; await this.dec.flush().catch(() => {}); continue; }
        break;
      }
      for (let i = 0; i < 6 && this.next < this.S.length; i++) {
        const s = this.S[this.next++];
        this.dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.pts, duration: s.dur, data: await this.data(s) }));
        this.fedPts = Math.max(this.fedPts, s.pts);
      }
      if (this.dec.decodeQueueSize > 3 || !this.queue.length) await this.wait(this.dec.decodeQueueSize > 3 ? 60 : 4);
    }
    const f = this.cur;
    if (!f) return null;
    const w = f.displayWidth, hh = f.displayHeight;
    if (!this.info.rotation) return { src: f, w, h: hh };
    const r = this.info.rotation, swap = r === 90 || r === 270, c = this.rc;
    const cw = swap ? hh : w, ch = swap ? w : hh;
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.translate(cw / 2, ch / 2); x.rotate(r * Math.PI / 180); x.drawImage(f, -w / 2, -hh / 2, w, hh);
    return { src: c, w: cw, h: ch };
  }
  close() { for (const f of this.queue) f.close(); this.queue = []; if (this.cur) this.cur.close(); this.cur = null; try { this.dec.close(); } catch {} }
}
X.FrameDecoder = FrameDecoder;
})();
