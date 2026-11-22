// ui/components/{button,menu_button,close_button}.cpp (logic part)
import type { HandlerHolder, MouseEvent } from '../core/machine';
import type { Blocking } from '../core/scheduler';
import { G } from '../game/globals';
import { playEntitySwitchedSound, waitForNRetraces } from '../game/melody';
import { Color, ME_LEFTRELEASED } from '../game/types';
import { drawGlyph, drawText, filledRectangle, horizontalLine, setDataRotation } from '../gfx/draw';
import { uiGlyphs } from '../gfx/res';

/** g_menuItemGlyph1: 3 bytes x 21 rows */
export function buttonHeight(): number {
  return 21;
}
export function buttonWidth(): number {
  return 3 * 8;
}

export function drawButton(x: number, y: number, caption: string | null): void {
  if (!G.vga) return;
  drawGlyph(uiGlyphs.menuItem1, x, y, Color.White);
  drawGlyph(uiGlyphs.menuItem2, x, y, Color.Gray);
  drawGlyph(uiGlyphs.menuItem3, x, y, Color.Black);
  if (caption) drawText(x + 7, y + 5, caption, Color.Black);
}

/* 15e8:047b */
export function toggleButtonState(x: number, y: number): void {
  if (!G.vga) return;
  if (y > 350) y -= 350;
  setDataRotation(0x18); // rotation = 0, mode = XOR
  drawGlyph(uiGlyphs.firstMenuItemTextArea, x + 4, y + 3, Color.Yellow);
  setDataRotation(0);
}

const MENU_BUTTON_X = 600;
const MENU_BUTTON_Y = 13;

export class MenuButton {
  enabled = false;
  isClicked = false;
  private readonly handler: HandlerHolder;

  constructor() {
    this.handler = G.m.mouse.addHandler((e: MouseEvent) => {
      if (!this.enabled || this.isClicked || e.flags !== ME_LEFTRELEASED) return;
      if (
        e.x >= MENU_BUTTON_X &&
        e.x <= MENU_BUTTON_X + buttonWidth() &&
        e.y >= MENU_BUTTON_Y &&
        e.y <= MENU_BUTTON_Y + buttonHeight()
      ) {
        e.stopPropagation();
        return this.click();
      }
    });
  }

  /** ~MenuButton */
  destroy(): void {
    this.handler.remove();
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    // erase()
    filledRectangle(MENU_BUTTON_X, MENU_BUTTON_Y, buttonWidth() / 8 + 1, buttonHeight(), 0xff, Color.Gray);
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    MenuButton.draw(0);
  }

  static draw(yOffset = 0): void {
    if (!G.vga) return;
    drawButton(MENU_BUTTON_X, MENU_BUTTON_Y + yOffset, null);
    // a "hamburger" icon
    const x1 = MENU_BUTTON_X + 8;
    const x2 = x1 + 11 - 1;
    let y = MENU_BUTTON_Y + 5 + yOffset;
    for (let l = 0; l < 3; ++l) {
      for (let i = 0; i < 3; ++i) {
        horizontalLine(x1, x2, y, Color.Black);
        ++y;
      }
      y += 1;
    }
  }

  *click(): Blocking {
    this.isClicked = true;
    toggleButtonState(MENU_BUTTON_X, MENU_BUTTON_Y);
    yield* playEntitySwitchedSound(false);
    yield* waitForNRetraces(8);
  }

  clicked(): boolean {
    return this.isClicked;
  }

  reset(): void {
    this.isClicked = false;
  }
}

const CLOSE_BUTTON_X = 600;
const CLOSE_BUTTON_Y = 10;

export class CloseButton {
  isClicked = false;
  private readonly handler: HandlerHolder;

  constructor() {
    this.handler = G.m.mouse.addHandler((e: MouseEvent) => {
      if (this.isClicked || e.flags !== ME_LEFTRELEASED) return;
      const x = e.x;
      let y = e.y;
      if (y > 350) y -= 350;
      if (
        x >= CLOSE_BUTTON_X &&
        x <= CLOSE_BUTTON_X + buttonWidth() &&
        y >= CLOSE_BUTTON_Y &&
        y <= CLOSE_BUTTON_Y + buttonHeight()
      ) {
        e.stopPropagation();
        return this.click();
      }
    });
  }

  destroy(): void {
    this.handler.remove();
  }

  static draw(yOffset: number): void {
    drawButton(CLOSE_BUTTON_X, CLOSE_BUTTON_Y + yOffset, 'X');
  }

  *click(): Blocking {
    if (!this.isClicked) {
      this.isClicked = true;
      toggleButtonState(CLOSE_BUTTON_X, CLOSE_BUTTON_Y);
      yield* playEntitySwitchedSound(false);
      yield* waitForNRetraces(8);
    }
  }

  clicked(): boolean {
    return this.isClicked;
  }
}
