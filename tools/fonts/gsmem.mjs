// Minimal PlayStation 2 GS local-memory emulation (PSMCT32 / PSMCT16 / PSMT8 / PSMT4 addressing).
// PS2 games upload textures in one pixel format and sample them in another; to recover a texture we
// "upload" the raw transfer into emulated memory and read it back with the texture's real format.
// Memory = pages of 2048 words; pages hold 32 blocks of 64 words; blocks hold 4 columns of 16 words.

const BLOCK_32 = [[0, 1, 4, 5, 16, 17, 20, 21], [2, 3, 6, 7, 18, 19, 22, 23], [8, 9, 12, 13, 24, 25, 28, 29], [10, 11, 14, 15, 26, 27, 30, 31]];
const BLOCK_16 = [[0, 2, 8, 10], [1, 3, 9, 11], [4, 6, 12, 14], [5, 7, 13, 15], [16, 18, 24, 26], [17, 19, 25, 27], [20, 22, 28, 30], [21, 23, 29, 31]];
const COL_ROW = [[0, 1, 4, 5, 8, 9, 12, 13], [2, 3, 6, 7, 10, 11, 14, 15]];   // words of a 32-bit column, per row

// per format: page size, block size, block table, and (x,y in block) → [word in block, sub-unit]
const FMT = {
  CT32: { pw: 64, ph: 32, bw: 8, bh: 8, table: BLOCK_32, bits: 32, at: (x, y) => [(y >> 1) * 16 + COL_ROW[y & 1][x], 0] },
  CT16: { pw: 64, ph: 64, bw: 16, bh: 8, table: BLOCK_16, bits: 16, at: (x, y) => [(y >> 1) * 16 + COL_ROW[y & 1][x & 7], x >> 3] },
  T8: { pw: 128, ph: 64, bw: 16, bh: 16, table: BLOCK_32, bits: 8, at: (x, y) => {
    const c = y >> 2, r = y & 3, rot = (r >> 1) ^ (c & 1), i = rot ? ((x & 7) + 4) & 7 : x & 7;
    return [c * 16 + COL_ROW[r & 1][i], (r >> 1) + (x >> 3) * 2];
  } },
  T4: { pw: 128, ph: 128, bw: 32, bh: 16, table: BLOCK_16, bits: 4, at: (x, y) => {
    const c = y >> 2, r = y & 3, rot = (r >> 1) ^ (c & 1), i = rot ? ((x & 7) + 4) & 7 : x & 7;
    return [c * 16 + COL_ROW[r & 1][i], (r >> 1) + (x >> 3) * 2];
  } },
};

export class GSMem {
  constructor(words = 1 << 20) { this.mem = new Uint32Array(words); }
  /** word address and sub-unit for pixel (x,y) of a buffer at basePtr (in blocks) with width bw (in 64-px units) */
  addr(fmt, base, bw, x, y) {
    const F = FMT[fmt], pagesPerRow = Math.max(1, (bw * 64) / F.pw);
    const page = Math.floor(y / F.ph) * pagesPerRow + Math.floor(x / F.pw);
    const px = x % F.pw, py = y % F.ph;
    const block = F.table[Math.floor(py / F.bh)][Math.floor(px / F.bw)];
    const [w, sub] = F.at(px % F.bw, py % F.bh);
    return [base * 64 + page * 2048 + block * 64 + w, sub];
  }
  write(fmt, base, bw, x, y, v) {
    const [a, s] = this.addr(fmt, base, bw, x, y), F = FMT[fmt];
    if (F.bits === 32) { this.mem[a] = v >>> 0; return; }
    const sh = s * F.bits, mask = ((1 << F.bits) - 1) << sh;
    this.mem[a] = ((this.mem[a] & ~mask) | ((v << sh) & mask)) >>> 0;
  }
  read(fmt, base, bw, x, y) {
    const [a, s] = this.addr(fmt, base, bw, x, y), F = FMT[fmt];
    return F.bits === 32 ? this.mem[a] : (this.mem[a] >>> (s * F.bits)) & ((1 << F.bits) - 1);
  }
  /** host→local transfer of a raw byte stream (row-major) into an rrw×rrh rectangle */
  upload(fmt, base, bw, rrw, rrh, bytes) {
    const F = FMT[fmt];
    let bit = 0;
    for (let y = 0; y < rrh; y++) for (let x = 0; x < rrw; x++) {
      let v = 0;
      if (F.bits >= 8) { for (let b = 0; b < F.bits / 8; b++) v |= bytes[(bit >> 3) + b] << (8 * b); }
      else v = (bytes[bit >> 3] >> (bit & 7)) & 15;
      this.write(fmt, base, bw, x, y, v);
      bit += F.bits;
    }
  }
}
