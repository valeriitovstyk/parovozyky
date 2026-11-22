// The 16 colours of the game (system/driver/sdl/video.cpp), RGB.
export const PALETTE = [
  0x55aa00, 0x000000, 0xaaaaaa, 0x555555, 0xffffff, 0xffff55, 0xaaaa00, 0x0055ff, 0x0055aa, 0xff5500, 0xaa5500,
  0x1affff, 0x00aaaa, 0x00ff00, 0x00aa00, 0xffffff,
];

export function colorOf(c: number): number {
  return PALETTE[c & 15];
}
