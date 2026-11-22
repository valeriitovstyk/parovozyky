// Browser input -> the game's input events (logical 640x350 coordinates,
// MOUSE.H flags, DOS scan codes). See reSL system/driver/sdl/{driver,mouse}.cpp.

/** KeyboardEvent.code -> DOS scan code (driver.cpp: scancodeToKeyCode) */
export const SCANCODES: Record<string, number> = {
  Escape: 1, Digit1: 2, Digit2: 3, Digit3: 4, Digit4: 5, Digit5: 6, Digit6: 7, Digit7: 8, Digit8: 9, Digit9: 10,
  Digit0: 11, Minus: 12, Equal: 13, Backspace: 14, Tab: 15, KeyQ: 16, KeyW: 17, KeyE: 18, KeyR: 19, KeyT: 20,
  KeyY: 21, KeyU: 22, KeyI: 23, KeyO: 24, KeyP: 25, BracketLeft: 26, BracketRight: 27, Enter: 28, ControlLeft: 29,
  ControlRight: 29, KeyA: 30, KeyS: 31, KeyD: 32, KeyF: 33, KeyG: 34, KeyH: 35, KeyJ: 36, KeyK: 37, KeyL: 38,
  Semicolon: 39, Quote: 40, Backquote: 41, ShiftLeft: 42, Backslash: 43, KeyZ: 44, KeyX: 45, KeyC: 46, KeyV: 47,
  KeyB: 48, KeyN: 49, KeyM: 50, Comma: 51, Period: 52, Slash: 53, ShiftRight: 54, AltLeft: 56, AltRight: 56,
  Space: 57, CapsLock: 58,
};

export const ME_LEFTPRESSED = 2;
export const ME_LEFTRELEASED = 4;
export const ME_RIGHTPRESSED = 8;
export const ME_RIGHTRELEASED = 16;

export interface InputSink {
  mouse(flags: number, buttons: number, x: number, y: number): void;
  key(scancode: number, down: boolean): void;
  /** the first user gesture (audio can start) */
  gesture(): void;
}

export function attachInput(canvas: HTMLCanvasElement, sink: InputSink): () => void {
  let buttons = 0;
  const pos = (e: PointerEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) * 640) / r.width);
    const y = Math.floor(((e.clientY - r.top) * 350) / r.height);
    return [Math.max(0, Math.min(639, x)), Math.max(0, Math.min(349, y))] as const;
  };
  const onMove = (e: PointerEvent) => {
    const [x, y] = pos(e);
    sink.mouse(0, buttons, x, y);
  };
  const onDown = (e: PointerEvent) => {
    sink.gesture();
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    if (e.button === 0) {
      buttons |= 1;
      sink.mouse(ME_LEFTPRESSED, buttons, x, y);
    } else if (e.button === 2) {
      buttons |= 2;
      sink.mouse(ME_RIGHTPRESSED, buttons, x, y);
    }
  };
  const onUp = (e: PointerEvent) => {
    const [x, y] = pos(e);
    if (e.button === 0 && buttons & 1) {
      buttons &= ~1;
      sink.mouse(ME_LEFTRELEASED, buttons, x, y);
    } else if (e.button === 2 && buttons & 2) {
      buttons &= ~2;
      sink.mouse(ME_RIGHTRELEASED, buttons, x, y);
    }
  };
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    const sc = SCANCODES[e.code];
    if (!sc) return;
    if (down) sink.gesture();
    if (e.ctrlKey || e.metaKey) return; // keep browser shortcuts
    e.preventDefault();
    sink.key(sc, down);
  };
  const noMenu = (e: Event) => e.preventDefault();
  const kd = onKey(true);
  const ku = onKey(false);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('contextmenu', noMenu);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  return () => {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('contextmenu', noMenu);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
  };
}
