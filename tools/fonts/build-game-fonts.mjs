// Extracts the bitmap fonts from GTA: San Andreas (PS2 fonts.txd + fonts.dat) and L.A. Noire (BMFont + DDS
// inside out.wad.pc) and converts them into real TrueType fonts for the editors.
//
//   node tools/fonts/build-game-fonts.mjs [gtaSaFolder] [laNoireFolder]
//
// Output: fonts/game/*.ttf, css/gamefonts.css, js/core/gamefonts.js
// These typefaces belong to their respective owners — for personal projects only.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GSMem } from './gsmem.mjs';
import { decodeDDS } from './textures.mjs';
import { vectorize, writeTTF } from './ttf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [GTA, LAN] = process.argv.slice(2);
if (!GTA || !LAN) {
  console.error('usage: node tools/fonts/build-game-fonts.mjs <GTA San Andreas (PS2) folder> <L.A. Noire (PC) folder>');
  process.exit(1);
}
const OUT = path.join(ROOT, 'fonts/game');
fs.mkdirSync(OUT, { recursive: true });
const UPM = 1000;
const made = [];

function emit(def, glyphList, metrics, kerning = []) {
  const glyphs = [{ name: '.notdef', unicodes: [], advance: Math.round(UPM * 0.5), contours: [] }, ...glyphList];
  const ttf = writeTTF({ family: def.family, style: def.style || 'Regular', upm: UPM, ascender: metrics.ascender, descender: metrics.descender, glyphs, kerning, copyright: def.credit });
  const file = def.file + '.ttf';
  fs.writeFileSync(path.join(OUT, file), ttf);
  made.push({ family: def.family, file, game: def.game, style: def.label, credit: def.credit });
  console.log(`  ${def.family.padEnd(28)} ${String(glyphList.length).padStart(4)} glyphs  ${Math.round(ttf.length / 1024)} KB`);
}

/* =================== GTA: San Andreas (PS2) =================== */
function gtaSA() {
  const txdPath = path.join(GTA, 'models/fonts.txd'), datPath = path.join(GTA, 'data/fonts.dat');
  if (!fs.existsSync(txdPath)) { console.log('GTA SA not found, skipping:', txdPath); return; }
  console.log('GTA: San Andreas');
  const buf = fs.readFileSync(txdPath);
  // ---- textures (PS2 natives: 4-bit palettized, uploaded as PSMCT16 256×256) ----
  const sheets = {};
  let off = 12 + buf.readUInt32LE(16) + 12;   // skip dictionary struct
  while (off < buf.length - 12 && buf.readUInt32LE(off) === 0x15) {
    const size = buf.readUInt32LE(off + 4), base = off;
    const name = buf.toString('latin1', base + 44, base + 52).replace(/\0.*/s, '');
    const hdr = base + 92;
    const w = buf.readUInt32LE(hdr), h = buf.readUInt32LE(hdr + 4), depth = buf.readUInt32LE(hdr + 8);
    if (depth !== 4) throw new Error('unexpected depth ' + depth);
    // pixel struct body: GIF packets (A+D regs, IMAGE) for pixels, then for the palette
    let p = hdr + 64 + 12, images = [];
    const end = p + buf.readUInt32LE(hdr + 64 + 4);
    while (p < end && !(images.length === 2 && images[1].data)) {
      const lo = buf.readBigUInt64LE(p), nloop = Number(lo & 0x7fffn), flg = Number((lo >> 58n) & 3n);
      p += 16;
      if (flg === 0) { for (let i = 0; i < nloop; i++, p += 16) if (Number(buf.readBigUInt64LE(p + 8)) === 0x52) images.push({ rrw: Number(buf.readBigUInt64LE(p) & 0xfffn), rrh: Number((buf.readBigUInt64LE(p) >> 32n) & 0xfffn) }); }
      else { images[images.length - 1].data = buf.subarray(p, p + nloop * 16); p += nloop * 16; }
    }
    const [pix, pal] = images;
    const g = new GSMem(); g.upload('CT16', 0, pix.rrw / 64, pix.rrw, pix.rrh, pix.data);
    const alpha = i => Math.min(255, pal.data[i * 4 + 3] * 2) / 255;   // PS2 alpha: 0x80 = opaque
    const cov = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cov[y * w + x] = alpha(g.read('T4', 0, w / 64, x, y));
    sheets[name] = { cov, w, h };
    off = base + 12 + size;
  }
  // ---- fonts.dat: proportional widths per font id ----
  const dat = fs.readFileSync(datPath, 'latin1').split(/\r?\n/);
  const props = []; let cur = null, mode = '';
  for (const line of dat) {
    const t = line.replace(/#.*/, '').trim();
    if (!t) continue;
    if (t.startsWith('[')) { mode = t; if (t === '[PROP]') props.push(cur = []); continue; }
    if (mode === '[PROP]') cur.push(...t.split(/\s+/).map(Number));
  }
  // slot → characters (the PS2/PC sheets share one layout: main font 0–143, sub-font 144–207)
  const MAIN = {}, SUB = {};
  ' !"®$%&\'()#+,-./0123456789:;<=>?™'.split('').forEach((c, i) => (MAIN[i] = c));
  for (let i = 0; i < 26; i++) { MAIN[33 + i] = String.fromCharCode(65 + i); MAIN[65 + i] = String.fromCharCode(97 + i); }
  Object.assign(MAIN, { 59: '&', 60: '\\', 61: '★', 64: '¡', 92: '°', 94: '[', 95: ']' });
  'ÀÁÂÄÆÇÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜßàáâäæçèéêëìíîïòóôöùúûüÑñ¿'.split('').forEach((c, i) => (MAIN[96 + i] = c));
  '0123456789:'.split('').forEach((c, i) => (SUB[144 + i] = c + (c === ':' ? '' : '')));
  for (let i = 0; i < 26; i++) SUB[155 + i] = String.fromCharCode(65 + i) + String.fromCharCode(97 + i);
  'ÀÁÂÄÆÇÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜßÑ¿'.split('').forEach((c, i) => (SUB[181 + i] = c === 'ß' || c === '¿' ? c : c + c.toLowerCase()));
  Object.assign(SUB, { 206: '\'', 207: '.' });

  const CW = 32, CH = 40;
  const cell = (sheet, slot) => {
    const S = sheets[sheet], col = slot % 16, row = Math.floor(slot / 16), cov = new Float32Array(CW * CH);
    let ink = 0;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const sy = row * CH + y, v = sy < S.h ? S.cov[sy * S.w + col * CW + x] : 0;
      cov[y * CW + x] = v; ink += v;
    }
    return { cov, ink };
  };
  const bottom = c => { for (let y = CH - 1; y >= 0; y--) for (let x = 0; x < CW; x++) if (c.cov[y * CW + x] >= 0.5) return y + 1; return CH * 0.8; };
  const build = (def, sheet, map, prop, hSlot, spaceAdv) => {
    const basePx = bottom(cell(sheet, hSlot)), k = UPM / CH;
    const toFont = (x, y) => [x * k, (basePx - y) * k];
    const glyphs = [{ name: 'space', unicodes: [32, 160], advance: spaceAdv * k, contours: [] }];
    const used = new Set([32]), raw = [];
    for (const [slotS, chars] of Object.entries(map)) {
      const slot = +slotS, c = cell(sheet, slot);
      if (chars === ' ' || c.ink < 2) continue;
      const unicodes = [...chars].map(ch => ch.codePointAt(0)).filter(u => !used.has(u));
      if (!unicodes.length) continue;
      unicodes.forEach(u => used.add(u));
      let right = 0;
      for (let y = 0; y < CH; y++) for (let x = CW - 1; x > right; x--) if (c.cov[y * CW + x] >= 0.35) { right = x + 1; break; }
      raw.push({ unicodes, prop: prop[slot] || 20, right, contours: vectorize(c.cov, CW, CH, toFont) });
    }
    // the game's width table pads some glyphs (e.g. Gothic digits) far beyond their ink: cap the gap at the typical one
    const gaps = raw.map(g => g.prop - g.right).sort((a, b) => a - b), gap = gaps[gaps.length >> 1];
    for (const g of raw) glyphs.push({ unicodes: g.unicodes, advance: Math.round(Math.min(g.prop, g.right + gap + 3) * k), contours: g.contours });
    emit(def, glyphs, { ascender: Math.round(basePx * k), descender: -Math.round((CH - basePx) * k) });
  };
  const credit = 'Glyphs traced from Grand Theft Auto: San Andreas (© Rockstar Games). Personal use only.';
  // font id 0 (GOTHIC) lives on "font2", font id 1 (GTA HEADER) on "font1"
  build({ family: 'San Andreas Subtitles', file: 'SanAndreas-Subtitles', game: 'GTA San Andreas', label: 'Subtitles & HUD', credit }, 'font1', MAIN, props[1], 40, props[1][0]);
  build({ family: 'San Andreas Pricedown', file: 'SanAndreas-Pricedown', game: 'GTA San Andreas', label: 'Title logo font', credit }, 'font1', SUB, props[1], 162, props[1][0]);
  build({ family: 'San Andreas Gothic', file: 'SanAndreas-Gothic', game: 'GTA San Andreas', label: 'Mission titles', credit }, 'font2', MAIN, props[0], 40, props[0][0]);
  build({ family: 'San Andreas Menu', file: 'SanAndreas-Menu', game: 'GTA San Andreas', label: 'Menus', credit }, 'font2', SUB, props[0], 162, props[0][0]);
}

/* =================== L.A. Noire (BMFont + DDS in out.wad.pc) =================== */
function laNoire() {
  const wadPath = path.join(LAN, 'final/pc/out.wad.pc');
  if (!fs.existsSync(wadPath)) { console.log('L.A. Noire not found, skipping:', wadPath); return; }
  console.log('L.A. Noire');
  const wad = fs.readFileSync(wadPath), count = wad.readUInt32LE(4);
  const ent = i => { const p = 8 + i * 12, o = wad.readUInt32LE(p + 4); return wad.subarray(o, o + wad.readUInt32LE(p + 8)); };
  const parseBMF = b => {
    let p = 4; const f = { chars: [], kern: [] };
    while (p < b.length) {
      const type = b[p], len = b.readUInt32LE(p + 1), s = p + 5;
      if (type === 1) f.info = { size: Math.abs(b.readInt16LE(s)), outline: b[s + 13], name: b.toString('latin1', s + 14, b.indexOf(0, s + 14)) };
      if (type === 2) f.common = { lineHeight: b.readUInt16LE(s), base: b.readUInt16LE(s + 2) };
      if (type === 3) f.page = b.toString('latin1', s, b.indexOf(0, s));
      if (type === 4) for (let q = s; q < s + len; q += 20) f.chars.push({ id: b.readUInt32LE(q), x: b.readUInt16LE(q + 4), y: b.readUInt16LE(q + 6), w: b.readUInt16LE(q + 8), h: b.readUInt16LE(q + 10), xo: b.readInt16LE(q + 12), yo: b.readInt16LE(q + 14), adv: b.readInt16LE(q + 16) });
      if (type === 5) for (let q = s; q < s + len; q += 10) f.kern.push([b.readUInt32LE(q), b.readUInt32LE(q + 4), b.readInt16LE(q + 8)]);
      p = s + len;
    }
    return f;
  };
  // index every BMFont and every DDS so each font can find its sheet by size (the sheet follows the font)
  const fonts = [], dds = [];
  for (let i = 0; i < count; i++) {
    const b = ent(i), sig = b.toString('latin1', 0, 4);
    if (sig === 'BMF\x03') fonts.push({ i, ...parseBMF(b) });
    if (sig === 'DDS ') dds.push(i);
  }
  const PICK = {   // page name → nice family name (largest variant of each typeface)
    'vehicleshowroom_font_large_0.tga': ['L.A. Noire Heroic', 'Heroic Condensed Bold — menus & titles', 'Bold'],
    'casemenu_font_0.tga': ['L.A. Noire Chandler', 'Chandler 42 — case files (typewriter)'],
    'notebook_font_0.tga': ['L.A. Noire Notebook', 'CCFaceFront — handwritten notebook'],
    'subtitle_font_0.tga': ['L.A. Noire Subtitles', 'News Gothic Demi — subtitles'],
    'locationtitling_font_0.tga': ['L.A. Noire Typewriter', 'American Typewriter — location titles'],
    'tutorial_font_0.tga': ['L.A. Noire Futura', 'Futura — tutorials'],
  };
  const credit = 'Glyphs traced from L.A. Noire (© Rockstar Games / Team Bondi). Personal use only.';
  for (const f of fonts) {
    const pick = PICK[f.page];
    if (!pick) continue;
    // texture: nearest following DDS whose size matches the font's sheet
    const ti = dds.find(d => d > f.i && d < f.i + 4);
    const tex = decodeDDS(ent(ti));
    const useRed = f.info.outline > 0;   // outlined exports keep the clean glyph in RGB, glyph+outline in alpha
    const k = UPM / f.info.size, base = f.common.base;
    const ids = new Map();
    const glyphs = [];
    for (const c of f.chars) {
      if (c.id === 32) { glyphs.push({ unicodes: [32, 160], advance: Math.round(c.adv * k), contours: [] }); ids.set(32, glyphs.length); continue; }
      if (c.id > 0xffff || c.id < 32) continue;
      const cov = new Float32Array(c.w * c.h);
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const o = ((c.y + y) * tex.w + c.x + x) * 4; cov[y * c.w + x] = (useRed ? tex.data[o] * tex.data[o + 3] / 255 : tex.data[o + 3]) / 255; }
      const toFont = (x, y) => [(x + c.xo) * k, (base - (y + c.yo)) * k];
      glyphs.push({ unicodes: [c.id], advance: Math.round(c.adv * k), contours: c.w && c.h ? vectorize(cov, c.w, c.h, toFont) : [] });
      ids.set(c.id, glyphs.length);   // +1 for .notdef added in emit()
    }
    const kerning = f.kern.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([a, b, v]) => [ids.get(a), ids.get(b), v * k]);
    emit({ family: pick[0], style: pick[2] || 'Regular', file: pick[0].replace(/[^A-Za-z]/g, ''), game: 'L.A. Noire', label: pick[1], credit }, glyphs,
      { ascender: Math.round(base * k), descender: -Math.round((f.common.lineHeight - base) * k) }, kerning);
  }
}

gtaSA();
laNoire();

// ---- app integration: @font-face rules + font list ----
fs.writeFileSync(path.join(ROOT, 'css/gamefonts.css'), '/* Generated by tools/fonts/build-game-fonts.mjs — fonts traced from game files (personal use) */\n' +
  made.map(m => `@font-face { font-family: '${m.family}'; src: url(../fonts/game/${m.file}) format('truetype'); font-display: swap; }`).join('\n') + '\n');
fs.writeFileSync(path.join(ROOT, 'js/core/gamefonts.js'), `/* Generated by tools/fonts/build-game-fonts.mjs */\nwindow.App = window.App || {};\nApp.GAME_FONTS = ${JSON.stringify(made.map(({ family, game, style }) => ({ family, game, style })), null, 1)};\n`);
console.log(`\n${made.length} fonts → fonts/game/`);
