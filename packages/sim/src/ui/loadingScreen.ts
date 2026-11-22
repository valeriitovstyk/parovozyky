// ui/loading_screen.cpp
import type { Blocking } from '../core/scheduler';
import { G } from '../game/globals';
import { waitForNRetraces } from '../game/melody';
import { waitForLine } from './screens';
import { copyRectangle, imageDot7, setVideoModeR0W2 } from '../gfx/draw';

/* 17a7:0150 */
function* drawLoadingScreenTitle(item: number): Blocking {
  G.video.loadingTitle = item;
  yield* waitForLine(70);
  copyRectangle(132, 10, 8, item * 49 + 351, 49, 46);
  setVideoModeR0W2();
}

/* 17a7:0005 */
export function* showLoadingScreen(): Blocking {
  G.lastKeyPressed = 0;
  G.video.screen = 'loading';
  if (G.vga) {
    imageDot7(0, 0, 640, 350, G.files.read('poster.7'));
    imageDot7(0, 350, 400, 350, G.files.read('captions.7'));
  }
  yield* drawLoadingScreenTitle(0);

  let clicked = false;
  const handler = G.m.mouse.addHandler((e) => {
    if (e.flags) clicked = true; // any mouse button actions
    e.stopPropagation();
  });
  try {
    const nItems = 5;
    const totalAnimationTime = 120;
    for (let i = 0; i < nItems + 1; ++i) {
      yield* drawLoadingScreenTitle(i % nItems);
      for (let j = 0; j < 220; ++j) {
        if (G.lastKeyPressed || clicked) return;
        yield* G.m.waitVerticalRetrace();
      }
      if (i !== nItems) {
        // clearLoadingScreenTitle (17a7:0120)
        G.video.loadingTitle = -1;
        yield* waitForLine(70);
        copyRectangle(132, 10, 0, 600, 49, 46);
        setVideoModeR0W2();
        yield* waitForNRetraces(Math.trunc(totalAnimationTime / nItems));
      }
    }
    G.lastKeyPressed = 0;
  } finally {
    handler.remove();
  }
}
