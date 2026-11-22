// VGA 640x350x16 planar video memory emulation (a port of the oracle's headless
// VGAEmulation, itself the memory part of reSL system/driver/sdl/video.cpp).
// Optional: the simulator runs without it (tests); the classic renderer and
// the screenshot tests enable it.

export const VIDEO_MEM_ROW_BYTES = 0x5c;
export const VIDEO_MEM_START_ADDR = 0xa0000;
/** A000:7DC8 = 0x5C * 350 */
export const VIDEO_MEM_SHADOW_BUFFER = VIDEO_MEM_START_ADDR + 0x7dc8;

export enum WriteOperation {
  Copy = 0,
  And = 1,
  Or = 2,
  Xor = 3,
}

/** system/driver/sdl/video.cpp generatePalette (ARGB) */
export const DEFAULT_PALETTE = [
  0xff55aa00, 0xff000000, 0xffaaaaaa, 0xff555555, 0xffffffff, 0xffffff55, 0xffaaaa00, 0xff0055ff, 0xff0055aa,
  0xffff5500, 0xffaa5500, 0xff1affff, 0xff00aaaa, 0xff00ff00, 0xff00aa00, 0xffffffff,
];

export class Vga {
  /** mem[offset * 4 + plane] */
  readonly mem = new Uint8Array(0x10000 * 4);
  private readonly latches = new Uint8Array(4);
  writeMask = 0;
  writeMode = 2;
  writeOperation = WriteOperation.Copy;
  readMode = 0;
  readPlane = 0;
  regPlaneMask = 0xf;
  readonly palette = DEFAULT_PALETTE.slice();

  private offset(ptr: number): number {
    const off = ptr - VIDEO_MEM_START_ADDR;
    if (off < 0 || off >= 0x10000) throw new Error(`VGA: address out of range ${ptr.toString(16)}`);
    return off;
  }

  write(ptr: number, color: number): void {
    const o = this.offset(ptr) * 4;
    const m = this.mem;
    switch (this.writeMode) {
      case 0:
        if (this.regPlaneMask && this.writeMask) {
          const mask = this.writeMask;
          for (let plane = 0; plane < 4; ++plane) {
            if (!(this.regPlaneMask & (1 << plane))) continue;
            m[o + plane] = (m[o + plane] & ~mask) | (mask & color);
          }
        }
        break;
      case 1:
        m[o] = this.latches[0];
        m[o + 1] = this.latches[1];
        m[o + 2] = this.latches[2];
        m[o + 3] = this.latches[3];
        break;
      case 2:
        if (this.writeMask) {
          const mask = this.writeMask;
          for (let plane = 0; plane < 4; ++plane) {
            const v = m[o + plane];
            let bitsToSet = mask * (color & 1);
            switch (this.writeOperation) {
              case WriteOperation.Copy:
                break;
              case WriteOperation.And:
                bitsToSet &= v;
                break;
              case WriteOperation.Or:
                bitsToSet |= v;
                break;
              case WriteOperation.Xor:
                bitsToSet ^= v;
                break;
            }
            m[o + plane] = ((v & ~mask) | bitsToSet) & 0xff;
            color >>= 1;
          }
        }
        break;
    }
  }

  read(ptr: number): number {
    const o = this.offset(ptr) * 4;
    this.latches[0] = this.mem[o];
    this.latches[1] = this.mem[o + 1];
    this.latches[2] = this.mem[o + 2];
    this.latches[3] = this.mem[o + 3];
    return this.mem[o + this.readPlane];
  }

  setMode(mode: number): void {
    this.writeMode = mode & 3;
    this.readMode = (mode >> 2) & 1;
  }

  /** color index of a pixel (x, row) of the video memory */
  pixel(x: number, row: number): number {
    const o = ((row * VIDEO_MEM_ROW_BYTES + (x >> 3)) & 0xffff) * 4;
    const bit = 7 - (x & 7);
    const m = this.mem;
    return (
      ((m[o] >> bit) & 1) | (((m[o + 1] >> bit) & 1) << 1) | (((m[o + 2] >> bit) & 1) << 2) | (((m[o + 3] >> bit) & 1) << 3)
    );
  }

  /**
   * The visible screen (640x350 ARGB) as the CRT shows it: rows above the
   * line compare register come from `frameOriginY`, the rest from row 0.
   */
  renderScreen(dst: Uint32Array, frameOriginY: number, lineCompare: number): void {
    for (let y = 0; y < 350; ++y) {
      const srcY = y < lineCompare ? y + frameOriginY : y - lineCompare;
      for (let x = 0; x < 640; ++x) dst[y * 640 + x] = this.palette[this.pixel(x, srcY)];
    }
  }
}
