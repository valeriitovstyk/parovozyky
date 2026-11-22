// graphics/{drawing,glyph,text,vga}.cpp: drawing into the emulated video
// memory. Every function is a no-op when the video is disabled (G.vga === null).
import { G } from '../game/globals';
import { font14 } from '../data/glyphs';
import { textGlyphs } from '../data/tables';
import { VIDEO_MEM_ROW_BYTES as ROW, VIDEO_MEM_SHADOW_BUFFER, VIDEO_MEM_START_ADDR as START, WriteOperation } from './vga';
import type { Rectangle } from '../game/types';

/** A 1-bit glyph: `w` bytes x `h` rows starting at d[o] */
export interface Glyph {
  readonly w: number;
  readonly h: number;
  readonly d: ArrayLike<number>;
  readonly o: number;
}

/** `[width, height, ...data]` -> Glyph */
export function glyphAt(arr: ArrayLike<number>, at = 0): Glyph {
  return { w: arr[at], h: arr[at + 1], d: arr, o: at + 2 };
}

const sar3 = (x: number) => x >> 3;
const rotr8 = (v: number, n: number) => ((v >> n) | (v << (8 - n))) & 0xff;
const ptrOf = (x: number, y: number) => START + y * ROW + sar3(x);

// ---- vga.cpp ----

export function setVideoModeR0W0(): void {
  const v = G.vga;
  if (!v) return;
  v.setMode(0);
  v.writeMask = 0xff;
}
export function setVideoModeR0W1(): void {
  const v = G.vga;
  if (!v) return;
  v.setMode(1);
  v.writeMask = 0xff;
}
export function setVideoModeR0W2(): void {
  const v = G.vga;
  if (!v) return;
  v.setMode(2);
  v.writeMask = 0xff;
}
/* 1b06:02a5 */
export function setDataRotation(rotation: number): void {
  if (G.vga) G.vga.writeOperation = (rotation >> 3) as WriteOperation;
}
/* 1b06:02b5 */
export function videoChoosePlanes(mask: number): void {
  if (G.vga) G.vga.regPlaneMask = mask;
}
/* 1b06:02ec */
export function setPaletteItem(c: number, argb: number): void {
  if (G.vga) G.vga.palette[c] = (argb | 0xff000000) >>> 0;
}

// ---- glyph.cpp ----

/* 1b06:062b */
export function drawGlyphAlignX8(g: Glyph, x: number, y: number, color: number): void {
  const v = G.vga;
  if (!v) return;
  let videoPtr = ptrOf(x, y);
  let p = g.o;
  for (let row = 0; row < g.h; ++row) {
    let vp = videoPtr;
    for (let col = 0; col < g.w; ++col) {
      v.writeMask = g.d[p];
      v.write(vp, color);
      ++vp;
      ++p;
    }
    videoPtr += ROW;
  }
}

/* 1b06:067e */
export function drawGlyph(g: Glyph, x: number, y: number, color: number): void {
  const v = G.vga;
  if (!v) return;
  let videoPtr = ptrOf(x, y);
  const off = x & 7;
  const rightMask = 0xff >> off;
  let p = g.o;
  for (let row = 0; row < g.h; ++row) {
    for (let col = 0; col < g.w; ++col) {
      if (g.d[p]) {
        const data = rotr8(g.d[p], off);
        v.writeMask = data & rightMask;
        v.write(videoPtr, color);
        v.writeMask = data & ~rightMask & 0xff;
        v.write(videoPtr + 1, color);
      }
      ++videoPtr;
      ++p;
    }
    videoPtr += ROW - g.w;
  }
}

/* 1b06:05cb */
export function drawGlyphW8(d: ArrayLike<number>, o: number, x: number, y: number, color: number): void {
  const v = G.vga;
  if (!v) return;
  let videoPtr = ptrOf(x, y);
  const off = x & 7;
  const rightMask = 0xff >> off;
  for (let row = 0; row < G.glyphHeight; ++row) {
    const data = rotr8(d[o++], off);
    v.writeMask = data & rightMask;
    v.write(videoPtr, color);
    v.writeMask = data & ~rightMask & 0xff;
    v.write(videoPtr + 1, color);
    videoPtr += ROW;
  }
}

/* 1b06:0548 */
export function drawGlyphW16(d: ArrayLike<number>, o: number, x: number, y: number, color: number): void {
  const v = G.vga;
  if (!v) return;
  let videoPtr = ptrOf(x, y);
  const off = x & 7;
  const rightMask = 0xff >> off;
  for (let row = 0; row < G.glyphHeight; ++row) {
    let data = rotr8(d[o + 1], off);
    v.writeMask = data & rightMask;
    v.write(videoPtr, color);
    v.writeMask = data & ~rightMask & 0xff;
    v.write(videoPtr + 1, color);
    data = rotr8(d[o], off);
    o += 2;
    v.writeMask = data & rightMask;
    v.write(videoPtr + 1, color);
    v.writeMask = data & ~rightMask & 0xff;
    v.write(videoPtr + 2, color);
    videoPtr += ROW;
  }
}

// ---- text.cpp ----

/* 1b06:1552 */
export function drawText(x: number, y: number, s: string, color: number): void {
  if (!G.vga) return;
  const oldGlyphHeight = G.glyphHeight;
  for (let i = 0; i < s.length; ++i) {
    const g = textGlyphs[(s.charCodeAt(i) - 0x20) & 0xff];
    G.glyphHeight = g[1] & 0xff;
    const tileY = g[0] + y;
    if (g[2] <= 8) drawGlyphW8(g, 3, x, tileY, color);
    else drawGlyphW16(g, 3, x, tileY, color);
    x += g[2] + G.textSpacing;
  }
  G.glyphHeight = oldGlyphHeight;
}

/* 1b06:077c */
export function drawTextSmall(x: number, y: number, s: string, color: number): void {
  const v = G.vga;
  if (!v) return;
  let symbStartPtr = ptrOf(x, y);
  for (let i = 0; i < s.length; ++i, ++symbStartPtr) {
    const base = (s.charCodeAt(i) & 0xff) * 14;
    let ptr = symbStartPtr;
    for (let curY = 0; curY < 14; ++curY) {
      v.writeMask = font14[base + curY];
      v.write(ptr, color);
      ptr += ROW;
    }
  }
}

// ---- drawing.cpp ----

/* 1b06:06f9 */
export function filledRectangle(x: number, y: number, widthBytes: number, height: number, pattern: number, color: number): void {
  const v = G.vga;
  if (!v) return;
  let videoPtr = ptrOf(x, y);
  v.writeMask = pattern;
  for (let curY = 0; curY < height; ++curY) {
    let vp = videoPtr;
    for (let curX = 0; curX < widthBytes; ++curX) v.write(vp++, color);
    videoPtr += ROW;
  }
}

/* 1b06:0956 */
export function horizontalLine(x1: number, x2: number, y: number, color: number): void {
  const v = G.vga;
  if (!v) return;
  if (x2 < x1) [x1, x2] = [x2, x1];
  let videoPtr1 = ptrOf(x1, y);
  const videoPtr2 = ptrOf(x2, y);
  const off1 = x1 & 7;
  const off2 = x2 & 7;
  const rotr16 = (val: number, n: number) => ((val >> n) | (val << (16 - n))) & 0xffff;
  if (videoPtr1 === videoPtr2) {
    v.writeMask = ((rotr16(0x80ff, off2) >> 8) & (0xff >> off1)) & 0xff;
    v.write(videoPtr1, color);
  } else {
    v.writeMask = 0xff >> off1;
    v.write(videoPtr1++, color);
    v.writeMask = 0xff;
    for (let i = 0, cnt = videoPtr2 - videoPtr1; i < cnt; ++i) v.write(videoPtr1++, color);
    v.writeMask = (rotr16(0x80ff, off2) >> 8) & 0xff;
    v.write(videoPtr1, color);
  }
}

/* 15e8:025a */
export function dialogFrame(x: number, y: number, widthBytes: number, height: number, bgColor: number): void {
  if (!G.vga) return;
  const x2 = x + (widthBytes - 1) * 8;
  const roundedX1 = x & 0xfff8;
  const roundedX2 = roundedX1 + widthBytes * 8;
  filledRectangle(x, y, widthBytes, height, 0xff, bgColor);
  filledRectangle(x, y, 1, height, 0x60, 4);
  filledRectangle(x, y, 1, height, 0x90, 1);
  filledRectangle(x2, y, 1, height, 6, 4);
  filledRectangle(x2, y, 1, height, 9, 1);
  filledRectangle(x, y, widthBytes, 1, 0xff, 1);
  filledRectangle(x, y + height, widthBytes, 1, 0xff, 1);
  horizontalLine(roundedX1 + 1, roundedX2 - 2, y + 1, 4);
  horizontalLine(roundedX1 + 1, roundedX2 - 2, y + height - 1, 4);
  horizontalLine(roundedX1 + 3, roundedX2 - 4, y + 2, 1);
  horizontalLine(roundedX1 + 3, roundedX2 - 4, y + height - 2, 1);
}

/* 1abc:00a3 */
export function imageDot7(x: number, y: number, width: number, height: number, image: Uint8Array | null): void {
  const v = G.vga;
  if (!v || !image) return;
  let p = 0x10;
  setVideoModeR0W0();
  for (let curY = 0; curY < height; curY += 7) {
    for (let curX = 0; curX < 640; curX += 8) {
      let drawn = 0;
      while (drawn !== 0xf) {
        const b = image[p];
        const planes = b & 0xf;
        drawn |= planes;
        videoChoosePlanes(planes);
        ++p;
        if (curX < width) {
          // implDrawImageDot7
          let videoPtr = ptrOf(x + curX, y + curY);
          const sprite = (b & 0xf0) !== 0;
          for (let r = 0; r < 7; ++r) {
            v.write(videoPtr, sprite ? image[p + r] : image[p]);
            videoPtr += ROW;
          }
        }
        p += b & 0xf0 ? 7 : 1;
      }
    }
  }
  setVideoModeR0W2();
  videoChoosePlanes(0xf);
}

/* 1b06:07db */
export function getPixel(x: number, y: number): number {
  const v = G.vga;
  if (!v) return 0;
  const videoPtr = ptrOf(x, y);
  const mask = 0x80 >> (x & 7);
  let res = 0;
  for (let plane = 0; plane < 4; ++plane) {
    v.readPlane = plane;
    if (v.read(videoPtr) & mask) res |= 1 << plane;
  }
  return res;
}

/* 1b06:0838 */
export function putPixel(x: number, y: number, c: number): void {
  const v = G.vga;
  if (!v) return;
  v.writeMask = 0x80 >> (x & 7);
  v.write(ptrOf(x, y), c);
}

/* 1b06:086a (Bresenham, as in reSL) */
export function line(x1: number, y1: number, x2: number, y2: number, c: number): void {
  const v = G.vga;
  if (!v) return;
  if (x2 < x1) {
    [x1, x2] = [x2, x1];
    [y1, y2] = [y2, y1];
  }
  let dx = x2 - x1;
  let dy = y2 - y1;
  const negativeDY = y2 < y1;
  if (negativeDY) dy = -dy;
  const inverseAxis = dx > dy;
  if (inverseAxis) [dx, dy] = [dy, dx];
  if (dy === 0) return;
  const mode = ((negativeDY ? 1 : 0) << 2) | ((inverseAxis ? 1 : 0) << 1);
  let err = 2 * dx - dy;
  let videoPtr = ptrOf(x1, y1);
  let pixelMask = 0x80 >> (x1 & 7);
  const moveAlongX = () => {
    const lastBit = pixelMask & 1;
    pixelMask = rotr8(pixelMask, 1);
    videoPtr += lastBit;
  };
  for (let y = 0; y < dy; ++y) {
    v.writeMask = pixelMask;
    v.write(videoPtr, c);
    const isNegative = err < 0;
    switch (mode | (isNegative ? 1 : 0)) {
      case 0:
        moveAlongX();
        videoPtr += ROW;
        break;
      case 1:
        videoPtr += ROW;
        break;
      case 2:
        videoPtr += ROW;
        moveAlongX();
        break;
      case 3:
        moveAlongX();
        break;
      case 4:
        moveAlongX();
        videoPtr -= ROW;
        break;
      case 5:
        videoPtr -= ROW;
        break;
      case 6:
        videoPtr -= ROW;
        moveAlongX();
        break;
      case 7:
        moveAlongX();
        break;
    }
    if (!isNegative) err -= 2 * dy;
    err += 2 * dx;
  }
}

/* 1b06:0324 */
export function copyRectangle(dstX: number, dstY: number, srcX: number, srcY: number, width: number, height: number): void {
  const v = G.vga;
  if (!v) return;
  v.setMode(1);
  let src = ptrOf(srcX, srcY);
  let dst = ptrOf(dstX, dstY);
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const data = v.read(src++);
      v.write(dst++, data);
    }
    src += ROW - width;
    dst += ROW - width;
  }
}

/* 1b06:0004 */
export function copyFromShadowBuffer(r: Rectangle): void {
  const v = G.vga;
  if (!v) return;
  const xOffsetBytes = sar3(r.x1);
  const widthBytes = sar3(r.x2) - xOffsetBytes + 1;
  const height = r.y2 - r.y1;
  const offset = xOffsetBytes + r.y1 * ROW;
  let dst = START + offset;
  let src = VIDEO_MEM_SHADOW_BUFFER + offset;
  // (uint16 loop counters: negative sizes mean huge loops in C; never happens)
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < widthBytes; ++x) v.write(dst++, v.read(src++));
    dst += ROW - widthBytes;
    src += ROW - widthBytes;
  }
}

/* 1b06:0062 */
export function copySpriteToShadowBuffer(dstPtr: number, x: number, y: number, width: number, height: number): number {
  const v = G.vga;
  if (!v) return dstPtr;
  let src = ptrOf(x, y);
  for (let curY = 0; curY < height; ++curY) {
    for (let curX = 0; curX < width; ++curX) v.write(dstPtr++, v.read(src++));
    src += ROW - width;
  }
  return dstPtr;
}

/* 1b06:00a0 */
export function copySpriteFromShadowBuffer(srcPtr: number, x: number, y: number, width: number, height: number): number {
  const v = G.vga;
  if (!v) return srcPtr;
  let dst = ptrOf(x, y);
  for (let curY = 0; curY < height; ++curY) {
    for (let curX = 0; curX < width; ++curX) v.write(dst++, v.read(srcPtr++));
    dst += ROW - width;
  }
  return srcPtr;
}

/* 132d:03c2 */
export function copyScreenBufferToImpl(y: number): void {
  copyRectangle(0, y, 0, y ^ 350, 80, 350);
  setVideoModeR0W2();
}

export { ROW as VIDEO_MEM_ROW_BYTES, START as VIDEO_MEM_START_ADDR, VIDEO_MEM_SHADOW_BUFFER };
