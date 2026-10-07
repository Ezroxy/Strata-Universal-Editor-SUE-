// Texture decoders for game font sheets: DDS (uncompressed / DXT1/3/5), RenderWare TXD (GTA SA), and a tiny PNG writer.
import zlib from 'zlib';

/** RGBA8 image */
export const image = (w, h) => ({ w, h, data: new Uint8Array(w * h * 4) });

const rgb565 = c => [((c >> 11) & 31) * 255 / 31 | 0, ((c >> 5) & 63) * 255 / 63 | 0, (c & 31) * 255 / 31 | 0];
function dxtColorBlock(src, o, out, w, bx, by, dxt1) {
  const c0 = src[o] | src[o + 1] << 8, c1 = src[o + 2] | src[o + 3] << 8;
  const a = rgb565(c0), b = rgb565(c1), pal = [[...a, 255], [...b, 255]];
  if (c0 > c1 || !dxt1) { pal.push([0, 1, 2].map(i => (2 * a[i] + b[i]) / 3 | 0).concat(255), [0, 1, 2].map(i => (a[i] + 2 * b[i]) / 3 | 0).concat(255)); }
  else { pal.push([0, 1, 2].map(i => (a[i] + b[i]) / 2 | 0).concat(255), [0, 0, 0, 0]); }
  const bits = src[o + 4] | src[o + 5] << 8 | src[o + 6] << 16 | src[o + 7] << 24;
  for (let i = 0; i < 16; i++) {
    const x = bx + (i & 3), y = by + (i >> 2);
    if (x >= w || y >= out.h) continue;
    const p = pal[(bits >>> (i * 2)) & 3], k = (y * w + x) * 4;
    out.data[k] = p[0]; out.data[k + 1] = p[1]; out.data[k + 2] = p[2]; out.data[k + 3] = p[3];
  }
}
export function decodeDXT(src, w, h, kind) {
  const out = image(w, h), bs = kind === 'DXT1' ? 8 : 16;
  let o = 0;
  for (let by = 0; by < h; by += 4) for (let bx = 0; bx < w; bx += 4, o += bs) {
    const c = kind === 'DXT1' ? o : o + 8;
    dxtColorBlock(src, c, out, w, bx, by, kind === 'DXT1');
    if (kind === 'DXT1') continue;
    const alpha = new Array(16);
    if (kind === 'DXT3') for (let i = 0; i < 16; i++) alpha[i] = ((src[o + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
    else {
      const a0 = src[o], a1 = src[o + 1], tbl = [a0, a1];
      if (a0 > a1) for (let i = 1; i < 7; i++) tbl.push(((7 - i) * a0 + i * a1) / 7 | 0);
      else { for (let i = 1; i < 5; i++) tbl.push(((5 - i) * a0 + i * a1) / 5 | 0); tbl.push(0, 255); }
      let bits = 0n; for (let i = 0; i < 6; i++) bits |= BigInt(src[o + 2 + i]) << BigInt(8 * i);
      for (let i = 0; i < 16; i++) alpha[i] = tbl[Number((bits >> BigInt(3 * i)) & 7n)];
    }
    for (let i = 0; i < 16; i++) { const x = bx + (i & 3), y = by + (i >> 2); if (x < w && y < h) out.data[(y * w + x) * 4 + 3] = alpha[i]; }
  }
  return out;
}
/** Uncompressed pixels described by bit masks (DDS / D3D formats). */
function decodeMasked(src, w, h, bpp, masks) {
  const out = image(w, h), B = bpp / 8;
  const sh = masks.map(m => { if (!m) return null; let s = 0; while (!((m >>> s) & 1)) s++; let n = 0; while ((m >>> (s + n)) & 1) n++; return [s, (1 << n) - 1]; });
  for (let i = 0; i < w * h; i++) {
    let v = 0; for (let b = 0; b < B; b++) v |= src[i * B + b] << (8 * b);
    v >>>= 0;
    for (let c = 0; c < 4; c++) { const s = sh[c]; out.data[i * 4 + c] = s ? Math.round(((v >>> s[0]) & s[1]) * 255 / s[1]) : c === 3 ? 255 : 0; }
    if (!masks[0] && !masks[1] && !masks[2]) { out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = 255; }   // alpha-only → white
  }
  return out;
}
export function decodeDDS(buf) {
  if (buf.toString('latin1', 0, 4) !== 'DDS ') throw new Error('not a DDS');
  const h = buf.readUInt32LE(12), w = buf.readUInt32LE(16), pfFlags = buf.readUInt32LE(80), four = buf.toString('latin1', 84, 88);
  const data = buf.subarray(128);
  if (pfFlags & 4) return decodeDXT(data, w, h, four);
  const bpp = buf.readUInt32LE(88), masks = [92, 96, 100, 104].map(o => buf.readUInt32LE(o));
  if (!(pfFlags & 1)) masks[3] = 0;   // no alpha
  if (pfFlags & 2 && !(pfFlags & 0x40)) { masks[0] = masks[1] = masks[2] = 0; masks[3] = masks[3] || 0xff; }   // alpha-only
  return decodeMasked(data, w, h, bpp, masks);
}

/** RenderWare texture dictionary (GTA SA PC, D3D9 natives). Returns [{name, img}] (top mip level only). */
export function parseTXD(buf) {
  const out = [];
  const walk = (off, end) => {
    while (off + 12 <= end) {
      const type = buf.readUInt32LE(off), size = buf.readUInt32LE(off + 4), body = off + 12;
      if (type === 0x16) walk(body, body + size);
      else if (type === 0x15) {
        // TextureNative → first child is a Struct (0x01) with the raster
        const s = body + 12;
        const platform = buf.readUInt32LE(s);
        const name = buf.toString('latin1', s + 8, s + 40).replace(/\0.*$/s, '');
        const rasterFormat = buf.readUInt32LE(s + 72), d3d = buf.readUInt32LE(s + 76);
        const w = buf.readUInt16LE(s + 80), h = buf.readUInt16LE(s + 82), depth = buf[s + 84];
        const flags = buf[s + 87];
        let p = s + 88;
        if (platform !== 9 && platform !== 8) throw new Error('unsupported TXD platform ' + platform);
        const pal = (rasterFormat & 0x2000) ? 256 : (rasterFormat & 0x4000) ? 16 : 0;
        let palette = null;
        if (pal) { palette = buf.subarray(p, p + pal * 4); p += pal * 4; }
        const levelSize = buf.readUInt32LE(p), px = buf.subarray(p + 4, p + 4 + levelSize);
        const four = String.fromCharCode(d3d & 255, (d3d >> 8) & 255, (d3d >> 16) & 255, d3d >>> 24);
        let img;
        if (/^DXT[135]$/.test(four)) img = decodeDXT(px, w, h, four);
        else if (pal) { img = image(w, h); for (let i = 0; i < w * h; i++) { const c = pal === 256 ? px[i] : (px[i >> 1] >> ((i & 1) * 4)) & 15; for (let k = 0; k < 4; k++) img.data[i * 4 + k] = palette[c * 4 + k]; } }
        else if (depth === 32) img = decodeMasked(px, w, h, 32, [0xff0000, 0xff00, 0xff, flags & 1 || (rasterFormat & 0xf00) === 0x500 ? 0xff000000 : 0]);
        else if (depth === 16) img = decodeMasked(px, w, h, 16, (rasterFormat & 0xf00) === 0x100 ? [0x7c00, 0x3e0, 0x1f, 0x8000] : [0xf00, 0xf0, 0xf, 0xf000]);
        else if (depth === 8) img = decodeMasked(px, w, h, 8, [0, 0, 0, 0xff]);
        else throw new Error(`unsupported raster ${name}: depth ${depth} fmt ${rasterFormat.toString(16)} d3d ${d3d}`);
        out.push({ name, img, info: { w, h, depth, four, rasterFormat: rasterFormat.toString(16) } });
      }
      off = body + size;
    }
  };
  walk(0, buf.length);
  return out;
}

/** PNG writer for an RGBA image. */
export function encodePNG(img) {
  const { w, h, data } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
