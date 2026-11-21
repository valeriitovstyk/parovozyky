// ui/manual.cpp
import type { Blocking } from '../core/scheduler';
import { G } from '../game/globals';
import { KEY_ESCAPE, ME_LEFTRELEASED } from '../game/types';
import { CloseButton } from './buttons';
import { animateScreenShifting, copyScreenBufferTo, setVideoFrameOrigin } from './screens';

/** RULES.TXT split into pages of 25 lines ("\r\n" line endings), as reSL does */
export function manualPages(): string[][] {
  const data = G.files.read('RULES.TXT') ?? new Uint8Array(0);
  const text = Array.from(data.subarray(0, 0xfffa), (c) => String.fromCharCode(c)).join('');
  const pages: string[][] = [];
  let pos = 0;
  while (pos < text.length) {
    const lines: string[] = [];
    for (let i = 0; i < 25; ++i) {
      if (pos < text.length) {
        const end = text.indexOf('\r', pos);
        if (end < 0) throw new Error('RULES.TXT: a line without "\\r\\n"');
        lines.push(text.slice(pos, end));
        pos = end + 2;
      } else {
        lines.push('');
        pos += 2;
      }
    }
    pages.push(lines);
  }
  return pages;
}

/* 16a6:04a8 */
export function* showManual(): Blocking {
  const pages = manualPages();
  const pageCnt = pages.length;

  let needSwitchPage = false;
  const screenClickHandler = G.m.mouse.addHandler((e) => {
    if (e.flags === ME_LEFTRELEASED) {
      needSwitchPage = true;
      e.stopPropagation();
    }
  });
  const closeButton = new CloseButton();
  try {
    let curPage = 0;
    do {
      G.video.screen = 'manual';
      G.video.manualPage = curPage;
      yield* animateScreenShifting();
      copyScreenBufferTo(0);
      yield* setVideoFrameOrigin(0, 0);
      G.lastKeyPressed = 0;
      do {
        yield* G.m.waitVerticalRetrace();
      } while (!G.lastKeyPressed && !closeButton.clicked() && !needSwitchPage);
      curPage = (curPage + 1) % pageCnt;
      needSwitchPage = false;
    } while (G.lastKeyPressed !== KEY_ESCAPE && !closeButton.clicked());
    yield* closeButton.click();
  } finally {
    closeButton.destroy();
    screenClickHandler.remove();
  }
}
