// Converts the original .7 pictures into PNG (port of graphics::imageDot7 of
// reSL, which always walks 640-pixel wide rows; resources/tools/dot7unpack.py
// walks only `width` and is wrong for narrow images).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RES = join(ROOT, 'reference/reSL/resources');
const OUT = join(ROOT, 'packages/render/assets');

// palette of system/driver/sdl/video.cpp (color 0 = green background)
export const PALETTE = [
  [0x55, 0xaa, 0x00], [0x00, 0x00, 0x00], [0xaa, 0xaa, 0xaa], [0x55, 0x55, 0x55],
  [0xff, 0xff, 0xff], [0xff, 0xff, 0x55], [0xaa, 0xaa, 0x00], [0x00, 0x55, 0xff],
  [0x00, 0x55, 0xaa], [0xff, 0x55, 0x00], [0xaa, 0x55, 0x00], [0x1a, 0xff, 0xff],
  [0x00, 0xaa, 0xaa], [0x00, 0xff, 0x00], [0x00, 0xaa, 0x00], [0xff, 0xff, 0xff],
];

// Returns color indexes (width*height).
export function decodeDot7(data, width, height) {
  const img = new Uint8Array(width * height);
  let p = 0x10;
  for (let y = 0; y < height; y += 7) {
    for (let x = 0; x < 640; x += 8) {
      let drawn = 0;
      while (drawn !== 0xf) {
        const b = data[p++];
        const planes = b & 0xf;
        drawn |= planes;
        const perRow = (b & 0xf0) !== 0;
        if (x < width) {
          for (let row = 0; row < 7; ++row) {
            const mask = perRow ? data[p + row] : data[p];
            for (let col = 0; col < 8; ++col) {
              const xx = x + col;
              const yy = y + row;
              if (xx >= width || yy >= height) continue;
              const i = yy * width + xx;
              img[i] &= ~planes & 0xff;
              if (mask & (0x80 >> col)) img[i] |= planes;
            }
          }
        }
        p += perRow ? 7 : 1;
      }
    }
  }
  return img;
}

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; ++k) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(indexes, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // palette
  const plte = Buffer.from(PALETTE.flat());
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; ++y) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; ++x) raw[y * (width + 1) + 1 + x] = indexes[y * width + x];
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// sizes as used by the game (main_menu.cpp, loading_screen.cpp, game_over.cpp)
const IMAGES = [
  ['poster.7', 640, 350],
  ['captions.7', 400, 350],
  ['play.7', 640, 350],
  ['GAMEOVER.7', 284, 263],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  for (const [name, w, h] of IMAGES) {
    const png = encodePng(decodeDot7(readFileSync(join(RES, name)), w, h), w, h);
    const out = join(OUT, name.replace('.7', '.png').toLowerCase());
    writeFileSync(out, png);
    console.log(`${name} -> ${out} (${png.length} bytes)`);
  }
}
