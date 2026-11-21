// ui/loading_screen.cpp
import type { Blocking } from '../core/scheduler';
import { G } from '../game/globals';
import { waitForNRetraces } from '../game/melody';
import { waitForLine } from './screens';

/* 17a7:0005 */
export function* showLoadingScreen(): Blocking {
  G.lastKeyPressed = 0;
  // poster.7 / captions.7: drawing only
  G.video.screen = 'loading';
  G.video.loadingTitle = 0;
  yield* waitForLine(70); // drawLoadingScreenTitle(0)

  let clicked = false;
  const handler = G.m.mouse.addHandler((e) => {
    if (e.flags) clicked = true; // any mouse button actions
    e.stopPropagation();
  });
  try {
    const nItems = 5;
    const totalAnimationTime = 120;
    for (let i = 0; i < nItems + 1; ++i) {
      G.video.loadingTitle = i % nItems;
      yield* waitForLine(70); // drawLoadingScreenTitle(i % nItems)
      for (let j = 0; j < 220; ++j) {
        if (G.lastKeyPressed || clicked) return;
        yield* G.m.waitVerticalRetrace();
      }
      if (i !== nItems) {
        G.video.loadingTitle = -1;
        yield* waitForLine(70); // clearLoadingScreenTitle()
        yield* waitForNRetraces(Math.trunc(totalAnimationTime / nItems));
      }
    }
    G.lastKeyPressed = 0;
  } finally {
    handler.remove();
  }
}
