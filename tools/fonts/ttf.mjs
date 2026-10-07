// Bitmap-font → TrueType converter.
//  1. upsample each glyph's coverage map (bicubic) so curves come out round, not faceted
//  2. trace the 50% iso-line with marching squares (sub-pixel, interpolated)
//  3. fix contour direction by nesting (outer = clockwise, holes = counter-clockwise)
//  4. simplify (Ramer–Douglas–Peucker) and fit quadratic curves, keeping real corners sharp
//  5. write a TrueType file (head, hhea, maxp, OS/2, hmtx, cmap, loca, glyf, kern, name, post)

/* ---------------- raster → contours ---------------- */
/** Catmull-Rom upsample of a w×h coverage map (0..1) by integer factor f. */
export function upsample(cov, w, h, f) {
  const W = w * f, H = h * f, out = new Float32Array(W * H);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : cov[y * w + x]);
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  for (let Y = 0; Y < H; Y++) {
    const sy = (Y + 0.5) / f - 0.5, y0 = Math.floor(sy), ty = sy - y0;
    for (let X = 0; X < W; X++) {
      const sx = (X + 0.5) / f - 0.5, x0 = Math.floor(sx), tx = sx - x0;
      const r = [-1, 0, 1, 2].map(dy => cr(at(x0 - 1, y0 + dy), at(x0, y0 + dy), at(x0 + 1, y0 + dy), at(x0 + 2, y0 + dy), tx));
      out[Y * W + X] = Math.min(1, Math.max(0, cr(r[0], r[1], r[2], r[3], ty)));
    }
  }
  return { cov: out, w: W, h: H };
}

/** Marching squares at threshold T. Returns closed loops of [x, y] in pixel space (y down, pixel centers at +0.5). */
export function trace(cov, w, h, T = 0.5) {
  const GW = w + 2, GH = h + 2;
  const g = (i, j) => (i < 1 || j < 1 || i > w || j > h ? 0 : cov[(j - 1) * w + (i - 1)]);
  const pts = new Map(), adj = new Map();
  const key = (i, j, vert) => ((j * (GW + 1) + i) << 1) | vert;
  const point = (k, i, j, vert) => {
    if (pts.has(k)) return;
    const v0 = g(i, j), v1 = vert ? g(i, j + 1) : g(i + 1, j), t = (T - v0) / (v1 - v0);
    pts.set(k, vert ? [i - 0.5, j - 0.5 + t] : [i - 0.5 + t, j - 0.5]);
  };
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) {
    const va = g(i, j), vb = g(i + 1, j), vc = g(i + 1, j + 1), vd = g(i, j + 1);
    const a = va >= T, b = vb >= T, c = vc >= T, d = vd >= T;
    if (a === b && b === c && c === d) continue;
    const E = [];   // crossing edges in order top, right, bottom, left
    const top = key(i, j, 0), right = key(i + 1, j, 1), bottom = key(i, j + 1, 0), left = key(i, j, 1);
    if (a !== b) { point(top, i, j, 0); E.push(top); }
    if (b !== c) { point(right, i + 1, j, 1); E.push(right); }
    if (c !== d) { point(bottom, i, j + 1, 0); E.push(bottom); }
    if (d !== a) { point(left, i, j, 1); E.push(left); }
    if (E.length === 2) link(E[0], E[1]);
    else {   // saddle: decide by the cell center
      const center = (va + vb + vc + vd) / 4 >= T;
      if (a === center) { link(top, right); link(bottom, left); } else { link(left, top); link(right, bottom); }
    }
  }
  const loops = [], seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = []; let prev = -1, cur = start;
    while (!seen.has(cur)) {
      seen.add(cur); loop.push(pts.get(cur));
      const n = adj.get(cur), next = n[0] !== prev ? n[0] : n[1];
      prev = cur; cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

const area = l => { let s = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
const inside = (pt, l) => { let c = false; for (let i = 0, j = l.length - 1; i < l.length; j = i++) { const [xi, yi] = l[i], [xj, yj] = l[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = -1, md = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > md) { md = d; idx = i; } }
  if (md <= eps) return [pts[0], pts[pts.length - 1]];
  const l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps);
  return l.slice(0, -1).concat(r);
}
export function simplifyLoop(loop, eps) {
  let far = 0, fd = 0;
  for (let i = 1; i < loop.length; i++) { const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = rdp(loop.slice(0, far + 1), eps), b = rdp(loop.slice(far).concat([loop[0]]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

/**
 * Polygon → TrueType quadratic contour: sharp turns stay on-curve corners; gentle turns become
 * off-curve control points bracketed by on-curve points no farther than `radius` from the vertex.
 * Returns [{x, y, on}].
 */
export function fitCurves(poly, cornerDeg = 55, radius = 1.5) {
  const n = poly.length, cos = Math.cos(cornerDeg * Math.PI / 180), out = [];
  const smooth = poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const d = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
    return d > cos;
  });
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    out.push({ x: p[0], y: p[1], on: !smooth[i] });
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const ra = Math.min(len / 2, radius), rb = Math.min(len / 2, radius);
    const A = smooth[i] ? [p[0] + ux * ra, p[1] + uy * ra] : null, B = smooth[(i + 1) % n] ? [q[0] - ux * rb, q[1] - uy * rb] : null;
    if (A) out.push({ x: A[0], y: A[1], on: true });
    if (B && !(A && Math.hypot(A[0] - B[0], A[1] - B[1]) < 1e-6)) out.push({ x: B[0], y: B[1], on: true });
  }
  return out;
}

/**
 * Full pipeline for one glyph bitmap. cov: Float32 coverage (w×h), `toFont(x, y)` maps bitmap pixel
 * coordinates to font units. Returns contours of {x, y, on} in font units with correct direction.
 */
export function vectorize(cov, w, h, toFont, { up = 4, eps = 0.3, cornerDeg = 55, radius = 1.4, minArea = 1.2 } = {}) {
  const U = upsample(cov, w, h, up);
  let loops = trace(U.cov, U.w, U.h, 0.5).map(l => l.map(([x, y]) => [x / up, y / up]));   // back to source pixels
  loops = loops.filter(l => Math.abs(area(l)) >= minArea / (up * up) * 4);
  const simp = loops.map(l => simplifyLoop(l, eps / up)).filter(l => l.length >= 3 && Math.abs(area(l)) > 0.05);
  const fontLoops = simp.map(l => l.map(([x, y]) => toFont(x, y)));
  // direction by nesting depth: even depth = filled outer → clockwise in y-up font space (negative area)
  return fontLoops.map((l, i) => {
    let depth = 0;
    for (let j = 0; j < fontLoops.length; j++) if (j !== i && inside(l[0], fontLoops[j])) depth++;
    const wantNeg = depth % 2 === 0, a = area(l);
    const dir = (wantNeg && a > 0) || (!wantNeg && a < 0) ? l.slice().reverse() : l;
    const scale = Math.hypot(toFont(1, 0)[0] - toFont(0, 0)[0], toFont(1, 0)[1] - toFont(0, 0)[1]);
    return fitCurves(dir, cornerDeg, radius * scale).map(p => ({ x: Math.round(p.x), y: Math.round(p.y), on: p.on }));
  }).filter(c => c.length >= 3);
}

/* ---------------- TrueType writer ---------------- */
class W {
  constructor() { this.b = []; }
  u8(v) { this.b.push(v & 255); return this; }
  u16(v) { this.b.push((v >> 8) & 255, v & 255); return this; }
  i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
  u32(v) { this.b.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return this; }
  i32(v) { return this.u32(v >>> 0); }
  tag(s) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
  bytes(a) { for (const x of a) this.b.push(x); return this; }
  pad4() { while (this.b.length % 4) this.b.push(0); return this; }
  get length() { return this.b.length; }
  buf() { return Buffer.from(this.b); }
}
const checksum = buf => { let s = 0; const p = Buffer.concat([buf, Buffer.alloc((4 - buf.length % 4) % 4)]); for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0; return s; };

/**
 * font = { family, style:'Regular'|'Bold', upm, ascender, descender, copyright,
 *          glyphs: [{ name, unicodes:[], advance, contours:[[{x,y,on}]] }], kerning: [[leftGlyphIdx, rightGlyphIdx, value]] }
 * glyphs[0] must be .notdef.
 */
export function writeTTF(font) {
  const { upm, ascender, descender, glyphs } = font;
  const bold = /bold/i.test(font.style);
  // ---- glyf + loca ----
  const glyf = new W(), loca = [];
  let maxPts = 0, maxCont = 0, gxMin = 1e9, gyMin = 1e9, gxMax = -1e9, gyMax = -1e9;
  const lsb = [];
  for (const g of glyphs) {
    loca.push(glyf.length);
    const cs = g.contours || [];
    if (!cs.length) { lsb.push(0); continue; }
    const all = cs.flat();
    const xMin = Math.min(...all.map(p => p.x)), yMin = Math.min(...all.map(p => p.y)), xMax = Math.max(...all.map(p => p.x)), yMax = Math.max(...all.map(p => p.y));
    gxMin = Math.min(gxMin, xMin); gyMin = Math.min(gyMin, yMin); gxMax = Math.max(gxMax, xMax); gyMax = Math.max(gyMax, yMax);
    lsb.push(xMin);
    maxPts = Math.max(maxPts, all.length); maxCont = Math.max(maxCont, cs.length);
    glyf.i16(cs.length).i16(xMin).i16(yMin).i16(xMax).i16(yMax);
    let end = -1; for (const c of cs) { end += c.length; glyf.u16(end); }
    glyf.u16(0);                                    // no hinting instructions
    // compact coordinates: 1-byte deltas where possible, "same as previous" for zero deltas
    const xs = [], ys = [];
    let px = 0, py = 0;
    const flags = all.map(p => {
      const dx = p.x - px, dy = p.y - py; px = p.x; py = p.y;
      let f = p.on ? 1 : 0;
      if (dx === 0) f |= 0x10; else if (Math.abs(dx) < 256) { f |= 0x02 | (dx > 0 ? 0x10 : 0); xs.push([1, Math.abs(dx)]); } else xs.push([2, dx]);
      if (dy === 0) f |= 0x20; else if (Math.abs(dy) < 256) { f |= 0x04 | (dy > 0 ? 0x20 : 0); ys.push([1, Math.abs(dy)]); } else ys.push([2, dy]);
      return f;
    });
    flags.forEach(f => glyf.u8(f));
    for (const [n, v] of xs) n === 1 ? glyf.u8(v) : glyf.i16(v);
    for (const [n, v] of ys) n === 1 ? glyf.u8(v) : glyf.i16(v);
    glyf.pad4();
  }
  loca.push(glyf.length);
  const locaT = new W(); loca.forEach(o => locaT.u32(o));
  if (gxMin > gxMax) { gxMin = gyMin = 0; gxMax = gyMax = 0; }

  // ---- metrics ----
  const hmtx = new W(); glyphs.forEach((g, i) => hmtx.u16(Math.max(0, Math.round(g.advance))).i16(lsb[i]));
  const advMax = Math.max(...glyphs.map(g => g.advance));
  const minRsb = Math.min(...glyphs.map((g, i) => { const cs = (g.contours || []).flat(); return cs.length ? g.advance - Math.max(...cs.map(p => p.x)) : 0; }));
  const hhea = new W().u32(0x10000).i16(ascender).i16(descender).i16(0).u16(Math.round(advMax)).i16(Math.min(...lsb)).i16(Math.round(minRsb)).i16(gxMax)
    .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(glyphs.length);
  const maxp = new W().u32(0x10000).u16(glyphs.length).u16(maxPts).u16(maxCont).u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

  // ---- cmap (format 4, BMP) ----
  const map = new Map();
  glyphs.forEach((g, i) => (g.unicodes || []).forEach(u => { if (u < 0x10000 && !map.has(u)) map.set(u, i); }));
  const codes = [...map.keys()].sort((a, b) => a - b);
  const segs = [];
  for (const c of codes) { const s = segs[segs.length - 1]; if (s && c === s.end + 1 && map.get(c) - c === map.get(s.start) - s.start) s.end = c; else segs.push({ start: c, end: c }); }
  segs.push({ start: 0xffff, end: 0xffff, last: true });
  const segX2 = segs.length * 2, sr = 2 * 2 ** Math.floor(Math.log2(segs.length));
  const sub = new W().u16(4).u16(16 + segs.length * 8).u16(0).u16(segX2).u16(sr).u16(Math.log2(sr / 2)).u16(segX2 - sr);
  segs.forEach(s => sub.u16(s.end)); sub.u16(0);
  segs.forEach(s => sub.u16(s.start));
  segs.forEach(s => sub.u16(s.last ? 1 : (map.get(s.start) - s.start) & 0xffff));   // idDelta (mod 65536)
  segs.forEach(() => sub.u16(0));
  const cmap = new W().u16(0).u16(2).u16(0).u16(3).u32(20).u16(3).u16(1).u32(20).bytes(sub.b);

  // ---- OS/2 v4 ----
  const avg = Math.round(glyphs.filter(g => g.advance > 0).reduce((s, g) => s + g.advance, 0) / Math.max(1, glyphs.filter(g => g.advance > 0).length));
  const hGlyph = glyphs.find(g => (g.unicodes || []).includes(72)), xGlyph = glyphs.find(g => (g.unicodes || []).includes(120));
  const top = g => (g && g.contours.length ? Math.max(...g.contours.flat().map(p => p.y)) : 0);
  const os2 = new W().u16(4).i16(avg).u16(bold ? 700 : 400).u16(5).u16(0)
    .i16(Math.round(upm * 0.65)).i16(Math.round(upm * 0.6)).i16(0).i16(Math.round(upm * 0.07))
    .i16(Math.round(upm * 0.65)).i16(Math.round(upm * 0.6)).i16(0).i16(Math.round(upm * 0.48))
    .i16(Math.round(upm * 0.05)).i16(Math.round(upm * 0.26)).i16(0)
    .bytes([2, 0, bold ? 8 : 5, 0, 0, 0, 0, 0, 0, 0])
    .u32(3).u32(0).u32(0).u32(0).tag('STRT')
    .u16(bold ? 0x20 : 0x40).u16(codes.length ? codes[0] : 32).u16(codes.length ? codes[codes.length - 1] : 32)
    .i16(ascender).i16(descender).i16(0).u16(Math.max(ascender, gyMax)).u16(Math.max(-descender, -gyMin))
    .u32(1).u32(0).i16(top(xGlyph)).i16(top(hGlyph)).u16(0).u16(32).u16(2);

  // ---- kern (format 0) ----
  let kern = null;
  const kp = (font.kerning || []).filter(k => k[2]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (kp.length) {
    const n = kp.length, sr2 = 6 * 2 ** Math.floor(Math.log2(n));
    kern = new W().u16(0).u16(1).u16(0).u16(14 + n * 6).u16(1).u16(n).u16(sr2).u16(Math.floor(Math.log2(n))).u16(n * 6 - sr2);
    kp.forEach(([l, r, v]) => kern.u16(l).u16(r).i16(Math.round(v)));
  }

  // ---- name ----
  const ps = (font.family + '-' + font.style).replace(/[^A-Za-z0-9-]/g, '');
  const names = [[0, font.copyright || ''], [1, font.family], [2, font.style], [3, ps + ';Strata'], [4, font.family + (font.style === 'Regular' ? '' : ' ' + font.style)], [5, 'Version 1.000'], [6, ps]];
  const nameW = new W(), strs = new W();
  nameW.u16(0).u16(names.length).u16(6 + names.length * 12);
  for (const [id, s] of names) {
    const enc = Buffer.from(s, 'utf16le').swap16();
    nameW.u16(3).u16(1).u16(0x409).u16(id).u16(enc.length).u16(strs.length);
    strs.bytes(enc);
  }
  nameW.bytes(strs.b);

  const post = new W().u32(0x30000).i32(0).i16(Math.round(-upm * 0.1)).i16(Math.round(upm * 0.05)).u32(0).u32(0).u32(0).u32(0).u32(0);
  const now = BigInt(Math.floor(Date.now() / 1000) + 2082844800);
  const head = new W().u32(0x10000).u32(0x10000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(upm)
    .u32(Number(now >> 32n)).u32(Number(now & 0xffffffffn)).u32(Number(now >> 32n)).u32(Number(now & 0xffffffffn))
    .i16(gxMin).i16(gyMin).i16(gxMax).i16(gyMax).u16(bold ? 1 : 0).u16(8).i16(2).i16(1).i16(0);

  const tables = { 'OS/2': os2, cmap, glyf, head, hhea, hmtx, loca: locaT, maxp, name: nameW, post };
  if (kern) tables.kern = kern;
  const tags = Object.keys(tables).sort();
  const n = tags.length, sr3 = 16 * 2 ** Math.floor(Math.log2(n));
  const dir = new W().u32(0x10000).u16(n).u16(sr3).u16(Math.floor(Math.log2(n))).u16(n * 16 - sr3);
  let off = 12 + n * 16;
  const bodies = [];
  for (const t of tags) {
    const b = tables[t].buf();
    dir.tag(t.padEnd(4)).u32(checksum(b)).u32(off).u32(b.length);
    const padded = Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4)]);
    bodies.push(padded); off += padded.length;
  }
  const file = Buffer.concat([dir.buf(), ...bodies]);
  // head.checkSumAdjustment
  const headOff = 12 + n * 16 + bodies.slice(0, tags.indexOf('head')).reduce((s, b) => s + b.length, 0);
  file.writeUInt32BE((0xb1b0afba - checksum(file)) >>> 0, headOff + 8);
  return file;
}
