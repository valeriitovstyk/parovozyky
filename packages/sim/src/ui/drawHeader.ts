// ui/components/draw_header.cpp (logic part: header values and digits)
import { i16 } from '../core/ints';
import { G } from '../game/globals';

/** snprintf("%5d") with spaces replaced by zeros: digits from the least significant one */
export function headerDigits(value: number): string {
  let s = String(value);
  if (s.length < 5) s = ' '.repeat(5 - s.length) + s;
  return s.replace(/ /g, '0');
}

/* 12c5:022d */
function updateHeaderField(fieldIdx: number, newValue: number, _yOffset: number): void {
  const hdrField = G.headers[fieldIdx];
  hdrField.value = i16(newValue);
  const buf = headerDigits(hdrField.value);
  for (let i = 0; i < hdrField.nDigits; ++i) hdrField.digitValues[i] = (buf.charCodeAt(4 - i) - 48) & 0xff;
  hdrField.yScroll = 0;
  hdrField.curAnimatingDigit = hdrField.nDigits - 1;
  // drawHeaderField: drawing only
}

/* 12c5:02d1 */
export function setHeaderValues(trains: number, money: number, year: number, level: number, yOffset: number): void {
  updateHeaderField(0, trains, yOffset);
  updateHeaderField(1, money, yOffset);
  updateHeaderField(2, year, yOffset);
  updateHeaderField(3, level, yOffset);
}

/* 137c:0450 */
export function drawDispatcher(_entranceIdx: number, _signalling: boolean): void {
  // drawing only (the renderers show waitingTrainsCount)
}
