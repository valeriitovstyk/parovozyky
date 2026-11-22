// game/drawing.cpp, game/impasse.cpp
import type { Blocking } from '../core/scheduler';
import { i16 } from '../core/ints';
import { G } from './globals';
import { chunkBoundingBox, railConnectionBias, semaphoreGlyphBias } from './res';
import { drawStaticObjects } from './staticObject';
import { drawTrains, scheduleAllTrainsRedrawing, scheduleTrainsDrawing } from './train';
import { Color, HeaderFieldId, type Rail, type Rectangle } from './types';
import { drawDispatchers, drawHeaderBackground, drawHeaderFieldFontTexture, setHeaderValues } from '../ui/drawHeader';
import { drawCopyright, drawStatusBarWithCopyright } from '../ui/statusBar';
import {
  copyFromShadowBuffer,
  drawGlyphAlignX8,
  drawGlyphW16,
  filledRectangle,
  imageDot7,
  setDataRotation,
  setVideoModeR0W1,
  setVideoModeR0W2,
} from '../gfx/draw';
import { glyphEmptyBackground, impasseGlyphs, railGlyph, trainFinishedGlyphs } from '../gfx/res';
import { drawSemaphore } from './semaphore';
import { drawSwitch, drawSwitchNoBackup } from './switch';
import { modeClear, modeDraw } from './mouse';

export const HEADER_HEIGHT = 47; // g_headerHeight
export const FOOTER_Y_POS = 334; // g_footerYPos

/* 17bf:0e1b */
export function* redrawScreenArea(): Blocking {
  yield* G.m.waitVerticalRetrace();
  if (G.mode === G.modeManagement) modeClear(G.mode);
  setVideoModeR0W1();
  copyFromShadowBuffer(G.areaToRedraw);
  setVideoModeR0W2();
  if (G.mode === G.modeManagement) modeDraw(G.mode);
}

/* 17bf:0599 */
export function scheduleRailRedrawing(r: Rail): void {
  const b = chunkBoundingBox(r.type);
  const a = G.areaToRedraw;
  a.x1 = i16(b.x1 + r.x);
  a.y1 = i16(b.y1 + r.y);
  a.x2 = i16(b.x2 + r.x);
  a.y2 = i16(b.y2 + r.y);
}

/* 17bf:05dc */
export function clampRectToGameFieldBoundaries(r: Rectangle): void {
  if (r.y1 < HEADER_HEIGHT) r.y1 = HEADER_HEIGHT;
  if (r.y2 > FOOTER_Y_POS) r.y2 = FOOTER_Y_POS;
  if (r.x1 < 0) r.x1 = 0;
  if (r.x2 > 640) r.x2 = 640;
}

function drawRailGlyph(which: number, tileX: number, tileY: number, railType: number, color: number, yOffset: number) {
  if (!G.vga) return;
  const rg = railGlyph(railType, which);
  drawGlyphAlignX8(rg.glyph, (tileX - tileY) * 88 + rg.dx + 320, (tileX + tileY) * 21 + rg.dy + yOffset - 22, color);
}

/* 137c:006f */
export function drawRailBg1(tileX: number, tileY: number, railType: number, color: number, yOffset: number): void {
  drawRailGlyph(2, tileX, tileY, railType, color, yOffset);
}

/* 137c:00d2 */
export function drawRailBg2(tileX: number, tileY: number, railType: number, color: number, yOffset: number): void {
  drawRailGlyph(1, tileX, tileY, railType, color, yOffset);
}

/* 137c:000c */
export function drawRail(tileX: number, tileY: number, railType: number, color: number, yOffset: number): void {
  drawRailGlyph(0, tileX, tileY, railType, color, yOffset);
}

/* 137c:024d */
export function drawImpasse(r: Rail, yOffset: number): void {
  if (!G.vga) return;
  for (let i = 0; i < 2; ++i) {
    if (r.connections[i].rail) continue;
    const gb = semaphoreGlyphBias(r.type, i);
    const rc = railConnectionBias(r.type, i);
    const x = r.x + (rc.tileOffsetX - rc.tileOffsetY) * 88 + Math.trunc((gb.dx * 2) / 3) - 8;
    const y = r.y + (rc.tileOffsetX + rc.tileOffsetY) * 21 + Math.trunc((gb.dy * 2) / 3) + yOffset - 5;
    const direction = (gb.dx ^ gb.dy) > 0 ? 1 : 0;
    G.glyphHeight = 8;
    drawGlyphW16(impasseGlyphs[direction], 16, x, y, Color.Black);
    G.glyphHeight = 8;
    drawGlyphW16(impasseGlyphs[direction], 0, x, y, Color.White);
  }
}

/* 137c:0378 */
export function eraseImpasse(r: Rail, yOffset: number): void {
  if (!G.vga) return;
  for (let i = 0; i < 2; ++i) {
    const gb = semaphoreGlyphBias(r.type, i);
    const rc = railConnectionBias(r.type, i);
    G.glyphHeight = 8;
    drawGlyphW16(
      glyphEmptyBackground,
      0,
      r.x + (rc.tileOffsetX - rc.tileOffsetY) * 88 - Math.trunc((gb.dx * 2) / 3) - 8,
      r.y + (rc.tileOffsetX + rc.tileOffsetY) * 21 - Math.trunc((gb.dy * 2) / 3) + yOffset - 5,
      Color.Green,
    );
  }
}

function drawRoad(yOffset: number): void {
  if (!G.vga) return;
  for (let i = 0; i < G.railRoadCount; ++i) {
    const r = G.railRoad[i];
    drawRailBg1(r.tileX, r.tileY, r.railType, Color.DarkGray, yOffset);
    drawRailBg2(r.tileX, r.tileY, r.railType, Color.Gray, yOffset);
  }
  for (let i = 0; i < G.railRoadCount; ++i) {
    const r = G.railRoad[i];
    drawRail(r.tileX, r.tileY, r.railType, Color.Black, yOffset);
    drawImpasse(G.rail(r.tileX, r.tileY, r.railType), yOffset);
  }
}

/* 17bf:0cd0 */
export function drawFieldBackground(yOffset: number): void {
  drawRoad(yOffset);
  if (G.vga) for (let i = 0; i < G.nSwitches; ++i) drawSwitch(i, false);
  drawStaticObjects(yOffset);
  if (G.vga) for (let i = 0; i < G.semaphoreCount; ++i) drawSemaphore(G.semaphores[i], yOffset);
  scheduleAllTrainsRedrawing();
  drawHeaderFieldFontTexture();
}

/* 132d:004b */
export function fillGameFieldBackground(yOffset: number): void {
  filledRectangle(0, 49 + yOffset, 80, 285, 0xff, Color.Green);
}

/* 15e8:09c8 */
export function drawWorld(): void {
  fillGameFieldBackground(350);
  drawRoad(350);
  if (G.vga) for (let i = 0; i < G.nSwitches; ++i) drawSwitchNoBackup(i, 350);
  drawStaticObjects(350);
  if (G.vga) for (let i = 0; i < G.semaphoreCount; ++i) if (!G.semaphores[i].isRightDirection) drawSemaphore(G.semaphores[i], 350);
  scheduleTrainsDrawing();
  drawTrains();
  if (G.vga) for (let i = 0; i < G.semaphoreCount; ++i) if (G.semaphores[i].isRightDirection) drawSemaphore(G.semaphores[i], 350);
  drawHeaderBackground(350);
  setHeaderValues(
    G.headers[HeaderFieldId.Trains].value,
    G.headers[HeaderFieldId.Money].value,
    G.headers[HeaderFieldId.Year].value,
    G.headers[HeaderFieldId.Level].value,
    350,
  );
  drawDispatchers(350);
  drawStatusBarWithCopyright(350);
}

/* 132d:01e2 — XOR: the same call draws and erases */
export function drawEraseTrainFinishedExclamation(entranceX: number, entranceY: number): void {
  if (!G.vga) return;
  const left = entranceX < 320;
  setDataRotation(0x18);
  drawGlyphAlignX8(trainFinishedGlyphs[left ? 0 : 1], left ? 8 : 611, entranceY - 9, Color.White);
  setDataRotation(0);
}

/* 132d:00f9 */
export function drawGameField(yOffset: number): void {
  imageDot7(0, yOffset, 640, 350, G.vga ? G.files.read('play.7') : null);
  drawStaticObjects(yOffset);
  drawCopyright(yOffset);
}
