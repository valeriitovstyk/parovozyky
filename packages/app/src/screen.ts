// Classic renderer: the emulated VGA screen (640x350), the mouse cursor and
// the tile grid of the construction mode (reSL GridOverlay), on a canvas.
import { type Sim, uiGlyphs } from '@shortline/sim';

const W = 640;
const H = 350;

/** reSL field_tile_grid_overlay.cpp: lines between tile corners, clipped */
function gridMask(): Uint8Array {
  const mask = new Uint8Array(W * H);
  const clip = { x: 10, y: 47 + 30, w: W - 20, h: 287 - 40 };
  const plot = (x: number, y: number) => {
    if (x >= clip.x && x < clip.x + clip.w && y >= clip.y && y < clip.y + clip.h) mask[y * W + x] = 1;
  };
  const lineTo = (x1: number, y1: number, x2: number, y2: number) => {
    const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= n; ++i) plot(Math.round(x1 + ((x2 - x1) * i) / n), Math.round(y1 + ((y2 - y1) * i) / n));
  };
  const px = (tx: number, ty: number) => [(tx - ty) * 88 + 320, (tx + ty) * 21 - 22] as const;
  for (let t = 0; t < 11; ++t) {
    lineTo(...px(t, 0), ...px(t, 10));
    lineTo(...px(0, t), ...px(10, t));
  }
  for (let tx = 0; tx < 11; ++tx)
    for (let ty = 0; ty < 11; ++ty) {
      const [x, y] = px(tx, ty);
      for (let k = -1; k <= 1; ++k) {
        plot(x + k, y - 1);
        plot(x + k, y + 1);
        plot(x - 1, y + k);
        plot(x + 1, y + k);
      }
    }
  return mask;
}

/** 16x16 cursor (mouse.cpp createTexture): white over black, bytes reversed per row */
function cursorCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(16, 16);
  for (let y = 0; y < 16; ++y)
    for (let xb = 0; xb < 2; ++xb) {
      const src = y * 2 + (2 - xb - 1);
      let black = uiGlyphs.cursor1[src];
      let white = uiGlyphs.cursor2[src];
      for (let bit = 0; bit < 8; ++bit) {
        const o = (y * 16 + xb * 8 + bit) * 4;
        if (white & 0x80) img.data.set([255, 255, 255, 255], o);
        else if (black & 0x80) img.data.set([0, 0, 0, 255], o);
        black <<= 1;
        white <<= 1;
      }
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class ClassicScreen {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly pixels32: Uint32Array;
  private readonly indexed = new Uint8Array(W * H);
  private readonly grid = gridMask();
  private readonly cursor = cursorCanvas();

  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(W, H);
    this.pixels32 = new Uint32Array(this.image.data.buffer);
  }

  draw(sim: Sim): void {
    const palette = sim.renderIndexed(this.indexed);
    if (!palette) return;
    // ARGB -> canvas RGBA (little endian: ABGR in a Uint32)
    const pal = palette.map((c) => ((0xff << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0);
    const gridColor = ((0xff << 24) | (0x3c << 16) | (0x8b << 8) | 0x64) >>> 0;
    const grid = sim.world.gridVisible && sim.world.video.screen === 'game';
    const px = this.pixels32;
    const idx = this.indexed;
    for (let i = 0; i < px.length; ++i) {
      const c = idx[i];
      // the palette colour 0 (green) is transparent in reSL: overlays show through it
      px[i] = c === 0 && grid && this.grid[i] ? gridColor : pal[c];
    }
    this.ctx.putImageData(this.image, 0, 0);
    const mouse = sim.world.m.mouse;
    if (mouse.cursorVisible) {
      // 16x16 physical pixels on a 640x480 screen
      this.ctx.drawImage(this.cursor, mouse.cursorX, mouse.cursorY, 16, (16 * H) / 480);
    }
  }
}
