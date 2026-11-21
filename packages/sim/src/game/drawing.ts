// game/drawing.cpp, game/impasse.cpp and other drawing helpers.
// Pure drawing is dropped (the renderers draw from the state); everything
// that touches the game state, the RNG or the time is kept in place.
import type { Blocking } from '../core/scheduler';
import { i16 } from '../core/ints';
import { G } from './globals';
import { chunkBoundingBox } from './res';
import { drawStaticObjects } from './staticObject';
import { drawTrains, scheduleAllTrainsRedrawing, scheduleTrainsDrawing } from './train';
import { HeaderFieldId, type Rail, type Rectangle } from './types';
import { setHeaderValues } from '../ui/drawHeader';

export const HEADER_HEIGHT = 47; // g_headerHeight
export const FOOTER_Y_POS = 334; // g_footerYPos

/* 17bf:0e1b */
export function* redrawScreenArea(): Blocking {
  yield* G.m.waitVerticalRetrace();
  // copies g_areaToRedraw from the shadow buffer to the screen (drawing only)
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

/* 137c:0378 */
export function eraseImpasse(_r: Rail, _yOffset: number): void {
  // drawing only
}

/* 17bf:0cd0 */
export function drawFieldBackground(yOffset: number): void {
  // rails, impasses, switches: drawing only
  drawStaticObjects(yOffset);
  // semaphores: drawing only
  scheduleAllTrainsRedrawing();
  // drawHeaderFieldFontTexture(): drawing only
}

/* 132d:004b */
export function fillGameFieldBackground(_yOffset: number): void {
  // drawing only
}

/* 15e8:09c8 */
export function drawWorld(): void {
  fillGameFieldBackground(350);
  // rails, impasses, switches, left semaphores: drawing only
  drawStaticObjects(350);
  scheduleTrainsDrawing();
  drawTrains();
  // right semaphores, header background: drawing only
  setHeaderValues(
    G.headers[HeaderFieldId.Trains].value,
    G.headers[HeaderFieldId.Money].value,
    G.headers[HeaderFieldId.Year].value,
    G.headers[HeaderFieldId.Level].value,
    350,
  );
  // dispatchers, status bar with copyright: drawing only
}

/* 132d:01e2 */
export function drawEraseTrainFinishedExclamation(entranceX: number, entranceY: number): void {
  G.emit({ type: 'trainFinished', x: entranceX, y: entranceY });
}

/* 132d:00f9 */
export function drawGameField(yOffset: number): void {
  // readBinaryFile("play.7") + imageDot7: drawing only
  drawStaticObjects(yOffset);
  // drawCopyright: drawing only
}
