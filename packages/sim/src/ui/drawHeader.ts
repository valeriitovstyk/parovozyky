// ui/components/draw_header.cpp
import { i16 } from '../core/ints';
import { G } from '../game/globals';
import { Color, type HeaderField } from '../game/types';
import { copyRectangle, drawGlyphW16, drawText, filledRectangle, imageDot7, setVideoModeR0W2 } from '../gfx/draw';
import { dispatcherGlyphs, glyphEmptyBackground } from '../gfx/res';

const HEADER_HEIGHT = 47;

/* 1d7d:0138 */
const s_alphabet = ['9', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/** snprintf("%5d") with spaces replaced by zeros */
export function headerDigits(value: number): string {
  let s = String(value);
  if (s.length < 5) s = ' '.repeat(5 - s.length) + s;
  return s.replace(/ /g, '0');
}

/* 12c5:0342 */
export function drawHeaderFieldFontTexture(): void {
  if (!G.vga) return;
  filledRectangle(680, 397, 2, 192, 0xff, Color.White);
  filledRectangle(680, 397, 1, 192, 0x80, Color.DarkGray);
  for (let i = 0; i < 12; ++i) drawText(682, i * 16 + 399, s_alphabet[i], Color.Black);
}

/* 132d:0086 */
export function drawHeaderBackground(yOffset: number): void {
  imageDot7(0, yOffset, 640, HEADER_HEIGHT, G.vga ? G.files.read('play.7') : null);
}

/* 12c5:01d7 */
export function drawHeaderField(hdrField: HeaderField): void {
  if (!G.vga) return;
  for (let i = 0; i <= hdrField.curAnimatingDigit; ++i) {
    copyRectangle(
      hdrField.x + (hdrField.nDigits - i - 1) * 16,
      hdrField.y,
      680,
      i16((hdrField.digitValues[i] + 1) * 16 + hdrField.yScroll + 397),
      2,
      16,
    );
  }
  setVideoModeR0W2();
}

/* 12c5:022d */
function updateHeaderField(fieldIdx: number, newValue: number, yOffset: number): void {
  const hdrField = G.headers[fieldIdx];
  hdrField.value = i16(newValue);
  const buf = headerDigits(hdrField.value);
  for (let i = 0; i < hdrField.nDigits; ++i) hdrField.digitValues[i] = (buf.charCodeAt(4 - i) - 48) & 0xff;
  hdrField.yScroll = 0;
  hdrField.curAnimatingDigit = hdrField.nDigits - 1;
  hdrField.y = i16(hdrField.y + yOffset);
  drawHeaderField(hdrField);
  hdrField.y = i16(hdrField.y - yOffset);
}

/* 12c5:02d1 */
export function setHeaderValues(trains: number, money: number, year: number, level: number, yOffset: number): void {
  drawHeaderFieldFontTexture();
  updateHeaderField(0, trains, yOffset);
  updateHeaderField(1, money, yOffset);
  updateHeaderField(2, year, yOffset);
  updateHeaderField(3, level, yOffset);
}

const DISPATCHERS_X_ORIGIN = 463;
const DISPATCHER_ICON_WIDTH = 22;

/* 137c:0450 */
export function drawDispatcher(entranceIdx: number, signalling: boolean): void {
  if (!G.vga) return;
  const x = entranceIdx * DISPATCHER_ICON_WIDTH + DISPATCHERS_X_ORIGIN;
  const g = dispatcherGlyphs[signalling ? 1 : 0];
  G.glyphHeight = 16;
  drawGlyphW16(glyphEmptyBackground, 0, x, 25, Color.Gray);
  drawGlyphW16(g, 32, x, 25, G.entrances[entranceIdx].bgColor);
  drawGlyphW16(g, 0, x, 25, Color.Black);
}

/* 137c:04c3 */
export function drawDispatchers(yOffset: number): void {
  if (!G.vga) return;
  G.glyphHeight = 16;
  const y = yOffset + 25;
  for (let i = 0; i < G.entranceCount; ++i) {
    const e = G.entrances[i];
    const g = dispatcherGlyphs[e.waitingTrainsCount !== 0 ? 1 : 0];
    const x = i * DISPATCHER_ICON_WIDTH + DISPATCHERS_X_ORIGIN;
    drawGlyphW16(g, 32, x, y, e.bgColor);
    drawGlyphW16(g, 0, x, y, Color.Black);
  }
}
