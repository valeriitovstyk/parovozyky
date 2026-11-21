// ui/game_over.cpp
import type { Blocking } from '../core/scheduler';
import { G } from '../game/globals';
import { playGameOverMelody } from '../game/melody';
import { writeRecords } from '../game/records';
import { returnToMainMenu } from './mainMenu';

/* 16a6:0615 */
export function* gameOver(): Blocking {
  // imageDot7("GAMEOVER.7"): drawing only
  G.emit({ type: 'screen', name: 'gameover' });
  yield* playGameOverMelody();
  if (!G.isDemoMode) writeRecords();
  G.gameOver = true;
  yield* returnToMainMenu();
}
