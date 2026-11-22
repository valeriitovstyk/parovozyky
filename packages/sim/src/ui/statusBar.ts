// ui/components/status_bar.cpp
import { i8 } from '../core/ints';
import { G } from '../game/globals';
import { Color } from '../game/types';
import { drawTextSmall, filledRectangle } from '../gfx/draw';

const FOOTER_Y_POS = 334;

/* 12ba:0097 */
export function drawCopyright(yOffset: number): void {
  drawTextSmall(12, 336 + yOffset, ' * SHORTLINE * Game by Andrei Snegov * (c) DOKA 1992 Moscow * Version 1.1 *', Color.Black);
}

/* 132d:013c */
export function drawStatusBarWithCopyright(yOffset: number): void {
  filledRectangle(0, FOOTER_Y_POS + yOffset, 80, 16, 0xff, Color.Gray);
  filledRectangle(0, FOOTER_Y_POS + yOffset, 80, 1, 0xff, Color.Black);
  drawCopyright(yOffset);
}

/* 12ba:0003 */
export function showStatusMessage(msg: string, yOffset = 0): void {
  G.statusHook(msg);
  G.footerMessageTimeout = 7;
  G.emit({ type: 'status', text: msg, yOffset });
  G.video.statusText = msg;
  filledRectangle(0, yOffset + 335, 80, 15, 0xff, Color.White);
  drawTextSmall((80 - msg.length) * 4, yOffset + 336, msg, Color.Black);
}

/* 12ba:005c */
export function updateStatusBar(): void {
  if (!G.footerMessageTimeout) return;
  G.footerMessageTimeout = i8(G.footerMessageTimeout - 1);
  if (G.footerMessageTimeout === 0) {
    G.emit({ type: 'statusClear' });
    G.video.statusText = '';
    filledRectangle(0, 335, 80, 15, 0xff, Color.Gray);
    drawCopyright(0);
  }
}
