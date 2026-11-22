// game/semaphore.cpp
import { i16, i8 } from '../core/ints';
import { G } from './globals';
import { railConnectionBias, railTypeMeta, semaphoreGlyphBias } from './res';
import { roadMaskInTile } from './rail';
import { Color, type Rail, type RailInfo, type Semaphore, type SemaphoreType } from './types';
import { drawGlyphW16, drawGlyphW8 } from '../gfx/draw';
import { semaphoreGlyph } from '../gfx/res';

/* 17bf:0621 */
function createSemaphore(r: Rail, type: SemaphoreType): void {
  if (!(type >= 0 && type <= 1)) throw new Error('createSemaphore: bad type');
  const rc = railConnectionBias(r.type, type);
  const bias = semaphoreGlyphBias(r.type, type);
  const sem = G.semaphores[G.semaphoreCount];
  let dx: number = bias.dx;
  let dy: number = bias.dy;
  if ((bias.dx ^ bias.dy) >= 1) dx = -dx;
  else dy = -dy;
  sem.pixelX = i16(r.x + (rc.tileOffsetX - rc.tileOffsetY) * 88 + dx);
  sem.pixelY = i16(r.y + (rc.tileOffsetX + rc.tileOffsetY) * 21 + dy);
  // &g_semaphoreGlyphs[bias.dx > 0][bias.dy < 0]
  sem.glyph = (bias.dx > 0 ? 2 : 0) + (bias.dy < 0 ? 1 : 0);
  sem.type = type;
  sem.rail = r;
  sem.isRed = false;
  sem.isRightDirection = bias.dx > 0;
  r.semSlotIdByDirection[type] = i8(G.semaphoreCount);
  ++G.semaphoreCount;
}

/* 17bf:0754 */
function removeSemaphore(r: Rail, type: SemaphoreType): void {
  const sIdx = r.semSlotIdByDirection[type];
  const s = G.semaphores[sIdx];
  G.semaphoreCount = (G.semaphoreCount - 1) & 0xffff;
  const lastSem = G.semaphores[G.semaphoreCount];
  const semIdx = i8(sIdx);
  lastSem.rail!.semSlotIdByDirection[lastSem.type] = semIdx;
  r.semSlotIdByDirection[type] = -1;
  s.copyFrom(lastSem);
}

/* 17bf:07dd */
export function updateSemaphores(ri: RailInfo): void {
  const rail = G.rail(ri.tileX, ri.tileY, ri.railType);
  G.erasedSemaphoreCount = 0;
  G.newSemaphoreCount = 0;
  for (let i = 0; i < 2; ++i) {
    const rc = railConnectionBias(rail.type, i);
    const tileX = i16(ri.tileX + rc.tileOffsetX);
    const tileY = i16(ri.tileY + rc.tileOffsetY);
    let roadMask = roadMaskInTile(tileX, tileY);
    const mask = Math.trunc(rc.unknown1 / 3) & 1 ? 0x1c7 : 0xe38;
    // the control flow is kept as in reSL (do { ... } while (false))
    // eslint-disable-next-line no-useless-assignment
    let create = false;
    do {
      if (roadMask & mask) {
        create = false;
        break;
      }
      roadMask = ((roadMask & 0xe38) >> 3) | (roadMask & 0x1c7);
      if (roadMask === 0x84) {
        create = true;
        break;
      }
      if (roadMask > 0x84) {
        create = !(roadMask !== 0x101 && roadMask !== 0x102 && roadMask !== 0x104);
        break;
      }
      if (roadMask === 0x44) {
        create = true;
        break;
      }
      if (roadMask < 0x45) {
        if (roadMask === 0x41 || roadMask === 0x42) {
          create = true;
          break;
        }
      } else if (roadMask === 0x81) {
        create = true;
        break;
      }
      create = false;
      // eslint-disable-next-line no-constant-condition
    } while (false);

    if (create) {
      for (const rtm of railTypeMeta) {
        const x = i16(tileX + rtm.tileOffsetX);
        const y = i16(tileY + rtm.tileOffsetY);
        const rail2 = G.rail(x, y, rtm.railType);
        if (rail2.type > 1 && (1 << rail2.type) & G.mask(x, y)) {
          createSemaphore(rail2, rtm.semaphoreType);
          G.newSemaphores[G.newSemaphoreCount++].copyFrom(G.semaphores[rail2.semSlotIdByDirection[rtm.semaphoreType]]);
        }
      }
    } else {
      for (const rtm of railTypeMeta) {
        const rail2 = G.rail(tileX + rtm.tileOffsetX, tileY + rtm.tileOffsetY, rtm.railType);
        if (rail2.semSlotIdByDirection[rtm.semaphoreType] !== -1) {
          G.erasedSemaphores[G.erasedSemaphoreCount++].copyFrom(
            G.semaphores[rail2.semSlotIdByDirection[rtm.semaphoreType]],
          );
          removeSemaphore(rail2, rtm.semaphoreType);
        }
      }
    }
  }
}

/* 19de:0414 */
export function toggleSemaphore(s: Semaphore): void {
  s.isRed = !s.isRed;
}

/* 19de:038e */
export function findClosestSemaphore(x: number, y: number): Semaphore | null {
  let res: Semaphore | null = null;
  let bestDistance = 60;
  for (let i = G.semaphoreCount - 1; i >= 0; --i) {
    const s = G.semaphores[i];
    const dx = i16(Math.abs(i16(x - s.pixelX)));
    const dy = i16(Math.abs(i16(y - s.pixelY + 10)));
    const dist = i16(dx + dy * 4);
    if (dist < bestDistance) {
      res = s;
      bestDistance = dist;
    }
  }
  return res;
}

// ---- drawing (137c:0135, 137c:01d3) ----

/* 137c:0135 */
export function drawSemaphore(s: Semaphore, yOffset: number): void {
  if (!G.vga) return;
  const g = semaphoreGlyph(s.glyph);
  const x = s.pixelX + g.xOffset;
  const y = s.pixelY + g.yOffset + yOffset;
  G.glyphHeight = 15;
  drawGlyphW8(g.d, g.bg1, x, y, Color.White);
  drawGlyphW8(g.d, g.bg2, x, y, Color.Black);
  G.glyphHeight = 4;
  drawGlyphW16(g.d, g.light, x + g.lightXOffset, y + g.lightYOffset, s.isRed ? Color.Red : Color.LightGreen);
}

/* 137c:01d3 */
export function eraseSemaphore(s: Semaphore, yOffset: number): void {
  if (!G.vga) return;
  const g = semaphoreGlyph(s.glyph);
  const x = s.pixelX + g.xOffset;
  const y = s.pixelY + g.yOffset + yOffset;
  G.glyphHeight = 15;
  drawGlyphW8(g.d, g.bg1, x, y, Color.Green);
  G.glyphHeight = 4;
  drawGlyphW16(g.d, g.light, x + g.lightXOffset, y + g.lightYOffset, Color.Green);
}
