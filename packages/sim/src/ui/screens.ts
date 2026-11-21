// graphics/animation.cpp and the blocking screen helpers (logic part).
import type { Blocking } from '../core/scheduler';
import { G } from '../game/globals';

/* 1b06:04fd */
export function* shiftScreen(yOffset: number): Blocking {
  yield* G.m.waitVerticalRetrace();
  G.video.lineCompare = yOffset & 0x1ff;
}

/* 1b06:042f */
export function* setVideoFrameOrigin(_x: number, y: number): Blocking {
  yield* G.m.waitVerticalRetrace();
  G.video.frameOriginY = y;
  yield* G.m.waitVerticalRetrace();
}

/* 17a7:00cd */
export function* animateScreenShifting(): Blocking {
  yield* shiftScreen(1);
  yield* setVideoFrameOrigin(0, 350);
  for (let i = 0; i < 371; i += (i >> 4) + 2) yield* shiftScreen(i);
}

/* 1b06:0408 — reSL waits for the vertical retrace instead of a scanline */
export function* waitForLine(_line: number): Blocking {
  yield* G.m.waitVerticalRetrace();
}

/** graphics::copyScreenBufferTo(0): drawing only (the screen picture changes) */
export function copyScreenBufferTo(_y: number): void {
  G.video.copies++;
}
