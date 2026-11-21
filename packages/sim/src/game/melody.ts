// game/melody.cpp. Melodies block the whole scheduler (PLAN.md 2.1.4);
// g_soundEnabled is always true in the logic (ToggleSound is unreachable).
import type { Blocking } from '../core/scheduler';
import { G } from './globals';

function* waitVerticalRetrace(): Blocking {
  yield* G.m.waitVerticalRetrace();
}

export function* waitForNRetraces(n: number): Blocking {
  for (let i = 0; i < n; ++i) yield* waitVerticalRetrace();
}

const sound = (f: number) => G.m.sound(f & 0xffff);
const nosound = () => G.m.nosound();

/* 19b2:0105 */
export function* playErrorMelody(): Blocking {
  if (!G.soundEnabled) return;
  sound(50);
  yield* waitForNRetraces(7);
  nosound();
}

/* 19b2:024a */
export function* playFixRoadMelody(): Blocking {
  if (!G.soundEnabled) return;
  for (let i = 12; i >= 0; --i) {
    sound(i * 60 + 20);
    yield* waitVerticalRetrace();
  }
  nosound();
}

/* 19b2:0047 */
export function* playSwitchSwitchedMelody(): Blocking {
  if (!G.soundEnabled) return;
  for (let i = 0; i < 3; ++i) {
    sound(i * 300 + 200);
    yield* waitVerticalRetrace();
  }
  nosound();
}

/* 19b2:000f */
export function* playEntitySwitchedSound(turnOn: boolean): Blocking {
  if (!G.soundEnabled) return;
  sound(turnOn ? 3500 : 5000);
  for (let i = 0; i < 2; ++i) yield* waitVerticalRetrace();
  nosound();
}

/* 19b2:0128 */
export function* playScheduledTrainMelody(freq1: number, freq2: number, iterations: number): Blocking {
  if (!G.soundEnabled) return;
  for (let i = 0; i < iterations; ++i) {
    sound(freq1);
    yield* waitVerticalRetrace();
    sound(freq2);
    yield* waitVerticalRetrace();
  }
  nosound();
}

/* 19b2:0077 */
export function* playTrainFinishedMelody(trainLen: number): Blocking {
  if (!G.soundEnabled) return;
  for (let i = 0; i < trainLen; ++i) {
    sound(i * 200 + 1000);
    yield* waitVerticalRetrace();
    yield* waitVerticalRetrace();
  }
  nosound();
}

/* 19b2:0167 */
export function* beepSound(tone: number): Blocking {
  if (!G.soundEnabled) return;
  sound((tone + 1) * 128);
  yield* waitVerticalRetrace();
  nosound();
}

/* 19b2:018d */
export function* playSpawnedEntranceMelody(): Blocking {
  for (let tone = 7; tone >= 0; --tone) {
    yield* beepSound(tone);
    yield* waitVerticalRetrace();
  }
}

/* 19b2:01e1 */
export function* playGameOverMelody(): Blocking {
  if (!G.soundEnabled) return;
  for (let i = 20; i; --i) {
    sound(i * 100);
    for (let j = 0; j < 5; ++j) yield* waitVerticalRetrace();
  }
  nosound();
}

/* 19b2:021a */
export function* playRailDamagedMelody(): Blocking {
  if (!G.soundEnabled) return;
  for (let i = 0; i < 12; ++i) {
    sound(i * 60 + 20);
    yield* waitVerticalRetrace();
  }
  nosound();
}

/* 19b2:027a */
export function* playHappy2000YearMelody(): Blocking {
  yield* playScheduledTrainMelody(100, 105, 20);
  yield* playScheduledTrainMelody(200, 210, 20);
  yield* playScheduledTrainMelody(300, 315, 20);
  yield* playScheduledTrainMelody(400, 420, 20);
}

/* 1ca8:0033 */
export function playSingleClickSound(): void {
  // In the original game, this function produces a single click sound
}
