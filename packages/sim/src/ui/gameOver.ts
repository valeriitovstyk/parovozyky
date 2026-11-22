// ui/game_over.cpp
import type { Blocking } from '../core/scheduler';
import { G } from '../game/globals';
import { playGameOverMelody } from '../game/melody';
import { writeRecords } from '../game/records';
import { returnToMainMenu } from './mainMenu';
import { imageDot7 } from '../gfx/draw';

/* 16a6:0615 */
export function* gameOver(): Blocking {
  // (reSL uses the upper-case name, DOS was case-insensitive)
  imageDot7(184, 58, 284, 263, G.vga ? G.files.read('GAMEOVER.7') : null);
  G.emit({ type: 'screen', name: 'gameover' });
  yield* playGameOverMelody();
  if (!G.isDemoMode) writeRecords();
  G.gameOver = true;
  yield* returnToMainMenu();
}
