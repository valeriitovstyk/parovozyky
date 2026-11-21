// game/header.cpp
import { i16, i8 } from '../core/ints';
import { pop, type Blocking, type TaskGen } from '../core/scheduler';
import { G } from './globals';
import { headerDigits } from '../ui/drawHeader';
import { gameOver } from '../ui/gameOver';
import { showStatusMessage } from '../ui/statusBar';
import { type HeaderField, HeaderFieldId } from './types';

/* 12c5:031b */
export function startHeaderFieldAnimation(fieldId: HeaderFieldId, delta: number): void {
  G.headerAnimationTaskQueue.push({ delta: i8(delta), fieldId, value: 0 });
}

/* 19de:0490 */
export function spendMoney(delta: number): void {
  startHeaderFieldAnimation(HeaderFieldId.Money, -delta);
}

/* 16a6:067b */
function* onHeaderFieldLimitValueReached(fld: HeaderField): Blocking {
  const fieldId = G.headers.indexOf(fld) as HeaderFieldId;
  if (fieldId === HeaderFieldId.Money) {
    showStatusMessage('OUT OF MONEY');
    yield* gameOver();
  } else if (fieldId === HeaderFieldId.Year) {
    // makeYearFieldBlinking(): drawing only (and immediately overwritten)
  }
}

/* 12c5:0008 */
export function* taskHeaderFieldAnimation(): TaskGen {
  // drawHeaderFieldFontTexture(): drawing only
  for (;;) {
    const req = yield* pop(G.headerAnimationTaskQueue);
    const hdrField = G.headers[req.fieldId];
    if (req.delta === 0) {
      hdrField.value = i16(req.value);
      const buf = headerDigits(hdrField.value);
      // (sic) reSL adds '0' here instead of subtracting it
      for (let i = 0; i < hdrField.nDigits; ++i) hdrField.digitValues[i] = (buf.charCodeAt(4 - i) + 48) & 0xff;
      hdrField.yScroll = 0;
      hdrField.curAnimatingDigit = i8(hdrField.nDigits - 1);
    } else if (req.delta > 0) {
      for (; req.delta !== 0; req.delta = i8(req.delta - 1)) {
        if (hdrField.value + 1 === hdrField.valueLimit) yield* onHeaderFieldLimitValueReached(hdrField);
        hdrField.yScroll = 1;
        hdrField.curAnimatingDigit = 0;
        while (
          hdrField.curAnimatingDigit < hdrField.nDigits - 1 &&
          hdrField.digitValues[hdrField.curAnimatingDigit] === 9
        )
          hdrField.curAnimatingDigit = i8(hdrField.curAnimatingDigit + 1);
        do {
          // drawHeaderField: drawing only
          yield G.m.sleep(3);
          hdrField.yScroll = i16(hdrField.yScroll + 1);
        } while (hdrField.yScroll <= 16);
        hdrField.yScroll = 0;
        for (let i = 0; i < hdrField.curAnimatingDigit; ++i) hdrField.digitValues[i] = 0;
        hdrField.digitValues[hdrField.curAnimatingDigit] = (hdrField.digitValues[hdrField.curAnimatingDigit] + 1) & 0xff;
        hdrField.value = i16(hdrField.value + 1);
      }
    } else {
      for (; req.delta !== 0; req.delta = i8(req.delta + 1)) {
        if (hdrField.value - 1 === hdrField.valueLimit) yield* onHeaderFieldLimitValueReached(hdrField);
        hdrField.yScroll = -1;
        hdrField.curAnimatingDigit = 0;
        while (
          hdrField.curAnimatingDigit < hdrField.nDigits - 1 &&
          hdrField.digitValues[hdrField.curAnimatingDigit] === 0
        )
          hdrField.curAnimatingDigit = i8(hdrField.curAnimatingDigit + 1);
        do {
          yield G.m.sleep(2);
          hdrField.yScroll = i16(hdrField.yScroll - 1);
        } while (hdrField.yScroll >= -16);
        hdrField.yScroll = 0;
        for (let i = 0; i < hdrField.curAnimatingDigit; ++i) hdrField.digitValues[i] = 9;
        hdrField.digitValues[hdrField.curAnimatingDigit] = (hdrField.digitValues[hdrField.curAnimatingDigit] - 1) & 0xff;
        hdrField.value = i16(hdrField.value - 1);
      }
    }
  }
}
