// ui/components/dialog.cpp
import { i16 } from '../core/ints';
import type { MouseEvent } from '../core/machine';
import type { Blocking } from '../core/scheduler';
import { G } from '../game/globals';
import { playEntitySwitchedSound, playErrorMelody, waitForNRetraces } from '../game/melody';
import { charTraits } from '../game/res';
import { DialogType, ME_LEFTRELEASED } from '../game/types';
import { buttonHeight, toggleButtonState } from './buttons';

/* 1d7d:1f62 : 74 bytes */
const g_asciiToKeycodeTable = [
  0x1e, 0x30, 0x2e, 0x20, 0x12, 0x21, 0x22, 0x23, 0x17, 0x24, 0x25, 0x26, 0x32, 0x31, 0x18, 0x19, 0x10, 0x13, 0x1f,
  0x14, 0x16, 0x2f, 0x11, 0x2d, 0x15, 0x2c, 0x46, 0x20, 0x7d, 0x1d, 0x4a, 0x20, 0x7d, 0x1d, 0x4e, 0x20, 0x7d, 0x1d,
  0x52, 0x20, 0x7d, 0x1d, 0x56, 0x20, 0x7d, 0x1d, 0x5a, 0x20, 0x7d, 0x1d, 0x5e, 0x20, 0x7d, 0x1d, 0x62, 0x20, 0x7d,
  0x1d, 0x66, 0x20, 0x7d, 0x1d, 0x6a, 0x20, 0x7d, 0x1d, 0x6e, 0x20, 0x7d, 0x1d, 0x72, 0x20, 0x7d, 0x1d,
];

const GAME_FIELD_HEIGHT = 287;

/* graphics/text.cpp: measureText (1b06:...) */
export function measureText(s: string): number {
  let width = 0;
  for (let i = 0; i < s.length; ++i) {
    width = i16(width + G.textSpacing + 9);
    if (charTraits[s.charCodeAt(i) & 0xff] & (4 | 2)) width = i16(width + 4);
  }
  return width;
}

/* 15e8:0003 */
export function drawDialog(type: DialogType, yOffset: number): void {
  const dlg = G.dialogs[type];
  G.textSpacing = 3;
  let maxWidth = measureText(dlg.title);
  let itemsCount = 0;
  for (; itemsCount < 7 && dlg.itemNames[itemsCount] !== null; ++itemsCount) {
    const itemWidth = measureText(dlg.itemNames[itemsCount]!);
    if (itemWidth > maxWidth) maxWidth = itemWidth;
  }
  dlg.itemWidth = maxWidth;
  const widthBytes = Math.trunc((maxWidth + 56) / 8);
  const height = (itemsCount + 1) * 30 + 18;
  const x = (80 - widthBytes) * 4;
  const y0 = yOffset + Math.trunc((GAME_FIELD_HEIGHT - height) / 2);
  const y = y0 + 47;
  for (let i = 0; i < itemsCount; ++i) {
    dlg.x = i16(x + 25);
    const itemBaseLineY = y + (i + 1) * 30;
    dlg.itemY[i] = i16(itemBaseLineY + 18);
  }
  G.emit({ type: 'dialog', dialog: type, yOffset });
}

class DialogMouseHandler {
  private clickedFlag = false;
  selectedItem: number | null = null;
  private readonly holder;

  constructor(private readonly type: DialogType) {
    G.m.mouse.setCursorVisibility(true);
    this.holder = G.m.mouse.addHandler((e) => this.handle(e));
  }

  newClicks(): boolean {
    const res = this.clickedFlag;
    this.clickedFlag = false;
    return res;
  }

  destroy(): void {
    this.holder.remove();
  }

  private handle(e: MouseEvent): void {
    e.stopPropagation();
    if (!(e.flags & ME_LEFTRELEASED)) return;
    this.clickedFlag = true;
    const dlg = G.dialogs[this.type];
    if (e.x < dlg.x || e.x > dlg.x + dlg.itemWidth) return;
    const itemHeight = buttonHeight();
    for (let i = 0; dlg.itemNames[i] !== null && i < 7; ++i) {
      let dlgY = dlg.itemY[i];
      if (dlgY > 350) dlgY -= 350; // in the shadow buffer
      if (e.y >= dlgY && e.y <= dlgY + itemHeight) {
        this.selectedItem = i;
        return;
      }
    }
  }
}

/* 15e8:03b7 */
export function* handleDialog(type: DialogType, defaultChoice: number | null = null): Blocking<number> {
  const dlg = G.dialogs[type];
  let timeout = 700;
  let itemsCount = 0;
  while (itemsCount < 7 && dlg.itemNames[itemsCount] !== null) ++itemsCount;

  let selectedItem: number | null = null;
  {
    const mouseHandler = new DialogMouseHandler(type);
    try {
      for (;;) {
        while (!G.lastKeyPressed && !mouseHandler.newClicks()) {
          if (timeout-- === 0) return -1;
          yield* G.m.waitVerticalRetrace();
        }
        if (G.lastKeyPressed) {
          for (let i = 0; selectedItem === null && i < itemsCount; ++i) {
            const c = dlg.itemNames[i]!.charCodeAt(0) || 0;
            if (c >= 65 && g_asciiToKeycodeTable[c - 65] === G.lastKeyPressed) selectedItem = i;
          }
        } else selectedItem = mouseHandler.selectedItem;
        G.lastKeyPressed = 0;
        if (selectedItem !== null || defaultChoice !== null) break;
        yield* playErrorMelody();
      }
    } finally {
      mouseHandler.destroy();
    }
  }
  if (selectedItem !== null) {
    toggleButtonState(dlg.x, dlg.itemY[selectedItem]);
    yield* playEntitySwitchedSound(false);
    yield* waitForNRetraces(8);
    return selectedItem;
  }
  return defaultChoice!;
}

/* 15e8:0947 */
export function* alert(message: string): Blocking {
  G.dialogs[DialogType.Alert].title = message;
  yield* G.m.waitVerticalRetrace(); // waitForLine(200)
  drawDialog(DialogType.Alert, 0);
  yield* handleDialog(DialogType.Alert, 0);
}
