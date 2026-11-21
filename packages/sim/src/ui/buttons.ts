// ui/components/{button,menu_button,close_button}.cpp (logic part)
import type { HandlerHolder, MouseEvent } from '../core/machine';
import type { Blocking } from '../core/scheduler';
import { G } from '../game/globals';
import { playEntitySwitchedSound, waitForNRetraces } from '../game/melody';
import { ME_LEFTRELEASED } from '../game/types';

/** g_menuItemGlyph1: 3 bytes x 21 rows */
export function buttonHeight(): number {
  return 21;
}
export function buttonWidth(): number {
  return 3 * 8;
}

/* 15e8:047b */
export function toggleButtonState(_x: number, _y: number): void {
  // XOR highlight: drawing only
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
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
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
