// game/demo.cpp
import { i16, u16 } from '../core/ints';
import type { Blocking, TaskGen } from '../core/scheduler';
import { G, strcpy } from './globals';
import { loadSavedGame } from './savefile';
import { MouseAction } from './types';
import { returnToMainMenu } from '../ui/mainMenu';

const GAME_FIELD_WIDTH = 640;
const GAME_FIELD_HEIGHT = 287;

export function demoFileName(): string {
  return 'demo_' + String.fromCharCode(G.demoFileLetter);
}

/* 16a6:09f8 */
export function loadDemo(): boolean {
  const origPlayerName = new Uint8Array(20);
  strcpy(origPlayerName, G.playerName);
  let res = loadSavedGame(demoFileName());
  if (!res) {
    G.demoFileLetter = 'a'.charCodeAt(0);
    res = loadSavedGame(demoFileName());
  }
  if (G.demoFileLetter === 'z'.charCodeAt(0)) G.demoFileLetter = 'a'.charCodeAt(0);
  else ++G.demoFileLetter;
  strcpy(G.playerName, origPlayerName);
  return res;
}

/* 16a6:0a7b */
export function stopDemo(): void {
  G.isDemoMode = false;
  G.m.sched.stopTask(G.taskDemoAI);
}

/* 1300:0273 */
function* moveCursorTowardsPoint(x: number, y: number): Blocking {
  const m = G.mode!;
  const msg = G.demoMouseMsg;
  msg.action = MouseAction.None;
  msg.x = i16(m.x + Math.trunc((x - m.x) / 4));
  msg.y = i16(m.y + Math.trunc((y - m.y) / 4));
  yield* G.m.mouse.setPosition(msg.x, msg.y);
}

/* 1300:0200 — a coroutine awaited with `co_await` (see the 'call' effect) */
function* moveMouseCursor(x: number, y: number): TaskGen {
  for (let i = 0; i <= 50; ++i) {
    const m = G.mode!;
    const dx = i16(Math.abs(x - m.x));
    const dy = i16(Math.abs(y - m.y));
    if (dx + dy <= 10) {
      G.demoMouseMsg.action = MouseAction.MouseClick;
      G.mouseMsgQueue.push({ ...G.demoMouseMsg });
      return;
    }
    yield* moveCursorTowardsPoint(x, y);
    yield G.m.sleep(18);
  }
}

/* 1300:02b6 */
function performMouseAction(action: MouseAction): void {
  G.demoMouseMsg.action = action;
  G.mouseMsgQueue.push({ ...G.demoMouseMsg });
}

/* 1300:0003 */
export function* taskDemoAI(): TaskGen {
  const startTime = G.m.getTime();
  const rng = G.rng;
  for (;;) {
    // docs/fidelity.md F3: 16-bit unsigned difference
    if (u16(G.m.getTime() - startTime) > 6000) {
      yield* returnToMainMenu();
      return;
    }
    const time = G.m.getTime() & 7;
    if (G.mode === G.modeManagement) {
      switch (time) {
        case 0:
          performMouseAction(MouseAction.ToggleMouseMode);
          break;
        case 1:
        case 2:
          break;
        case 3:
          if (G.semaphoreCount) {
            const sem = G.semaphores[rng.genRandomNumber(G.semaphoreCount)];
            yield { k: 'call', g: moveMouseCursor(sem.pixelX, i16(sem.pixelY - 12)) };
          }
          break;
        default:
          if (G.nSwitches) {
            const s = G.switches[rng.genRandomNumber(G.nSwitches)];
            yield { k: 'call', g: moveMouseCursor(s.x, s.y) };
          }
          break;
      }
    } else {
      switch (time) {
        case 0:
        case 1: {
          const x = rng.genRandomNumber(GAME_FIELD_WIDTH);
          const y = rng.genRandomNumber(GAME_FIELD_HEIGHT);
          for (let i = 0; i < 10; ++i) {
            yield* moveCursorTowardsPoint(x, y);
            yield G.m.sleep(15);
          }
          break;
        }
        case 2:
        case 3:
          performMouseAction(MouseAction.ToggleMouseMode);
          break;
        case 4:
        case 5: {
          performMouseAction(MouseAction.BuildRails);
          const x = rng.genRandomNumber(GAME_FIELD_WIDTH);
          const y = rng.genRandomNumber(GAME_FIELD_HEIGHT) + 47;
          yield* moveCursorTowardsPoint(x, y);
          break;
        }
        case 6:
        case 7:
          // The original game has dead code here (1300:0185), see reSL
          performMouseAction(MouseAction.ToggleNextRailType);
          break;
      }
    }
    yield G.m.sleep(100);
  }
}
