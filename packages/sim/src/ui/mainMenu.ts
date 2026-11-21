// ui/main_menu.cpp
import type { Blocking } from '../core/scheduler';
import { drawFieldBackground, drawGameField, drawWorld, fillGameFieldBackground } from '../game/drawing';
import { loadDemo } from '../game/demo';
import { G, cstrValue } from '../game/globals';
import { createNewWorld } from '../game/init';
import { taskGameMainLoop } from '../game/mainLoop';
import { playEntitySwitchedSound, waitForNRetraces } from '../game/melody';
import { setMode } from '../game/mouse';
import { readLevel, recordsScreenData } from '../game/records';
import { findNextSaveFile, lastSearchResult, loadSavedGame } from '../game/savefile';
import { drawStaticObjects } from '../game/staticObject';
import { spawnNewTrain } from '../game/train';
import { DialogType, ME_LEFTRELEASED, ME_RIGHTRELEASED } from '../game/types';
import { CloseButton, toggleButtonState } from './buttons';
import { alert, drawDialog, handleDialog } from './dialog';
import { setHeaderValues } from './drawHeader';
import { animateScreenShifting, copyScreenBufferTo, setVideoFrameOrigin } from './screens';
import { showManual } from './manual';
import { showStatusMessage } from './statusBar';
import { SimHalt } from '../core/scheduler';

/* 1d7d:2046 */
const g_monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function* drawMainMenu(): Blocking {
  drawGameField(350);
  setHeaderValues(0, 100, 1800, readLevel(), 350);
  drawDialog(DialogType.MainMenu, 350);
  G.video.screen = 'menu';
  yield* setVideoFrameOrigin(0, 350);
  copyScreenBufferTo(0);
  yield* setVideoFrameOrigin(0, 0);
}

enum ArchiveMenuAction {
  ReturnToMainMenu,
  StartGame,
}

function pad(v: number, n: number): string {
  let s = String(Math.abs(v));
  while (s.length < n - (v < 0 ? 1 : 0)) s = '0' + s;
  return (v < 0 ? '-' : '') + s;
}

/* 15e8:063e */
function* showArchiveMenu(): Blocking<ArchiveMenuAction> {
  let worldChanged = false;
  function* returnToMain(): Blocking<ArchiveMenuAction> {
    if (worldChanged) createNewWorld();
    yield* drawMainMenu();
    return ArchiveMenuAction.ReturnToMainMenu;
  }

  for (;;) {
    if (findNextSaveFile()) {
      yield* alert("Can't open game files in current dir");
      return yield* returnToMain();
    }
    worldChanged = true;
    const file = lastSearchResult();
    G.lastKeyPressed = 0;
    if (!loadSavedGame(file.fileName)) {
      yield* alert('Load Error');
      continue;
    }
    let year = (file.fileDate >> 9) + 80; // year since 1980
    if (year > 100) year -= 100;
    const name = cstrValue(G.playerName);
    const buf =
      `Player: ${name.padEnd(18)} Date: ${pad(file.fileDate & 0x1f, 2)}-${g_monthNames[((file.fileDate >> 5) & 0xf) - 1].padStart(3)}-${pad(year, 2)}` +
      `  Time: ${pad((file.fileTime >> 11) & 0x1f, 2)}:${pad((file.fileTime >> 5) & 0x3f, 2)}  File: ${file.fileName}`;
    drawWorld();
    for (let showNextFile = false; !showNextFile; ) {
      drawDialog(DialogType.Archive, 350);
      G.video.screen = 'archive';
      yield* setVideoFrameOrigin(0, 350);
      copyScreenBufferTo(0);
      showStatusMessage(buf);
      yield* setVideoFrameOrigin(0, 0);
      drawWorld();
      for (let needRedrawDialog = false; !showNextFile && !needRedrawDialog; ) {
        const item = yield* handleDialog(DialogType.Archive);
        switch (item) {
          case -1:
            // Timeout
            break;
          case 0: {
            /* 15e8:0785 */
            // [V]iew
            const hintMessage = G.m.mouse.isTouchDevice()
              ? 'Touch anywhere on the screen to close the preview'
              : 'Press any key or click the mouse to close the preview';
            showStatusMessage(hintMessage, 350);
            let mouseClicked = false;
            G.m.mouse.setCursorVisibility(false);
            const holder = G.m.mouse.addHandler((me) => {
              me.stopPropagation();
              mouseClicked = (me.flags & (ME_LEFTRELEASED | ME_RIGHTRELEASED)) !== 0;
            });
            try {
              yield* setVideoFrameOrigin(0, 350);
              const dialog = G.dialogs[DialogType.Archive];
              let itemY = dialog.itemY[0];
              if (itemY > 350) itemY -= 350;
              toggleButtonState(dialog.x, itemY);
              // wait until a keyboard button is pressed or mouse clicked
              G.lastKeyPressed = 0;
              while (G.lastKeyPressed === 0 && !mouseClicked) yield* G.m.waitVerticalRetrace();
              G.m.mouse.setCursorVisibility(true);
              yield* setVideoFrameOrigin(0, 0);
              G.lastKeyPressed = 0;
            } finally {
              holder.remove();
            }
            break;
          }
          case 1:
            /* 15e8:063e */
            // [N]ext
            showNextFile = true;
            break;
          case 2:
            /* 15e8:07d6 */
            // [G]o
            yield* setVideoFrameOrigin(0, 350);
            // eraseArchiveMenu(0): drawing only
            yield* setVideoFrameOrigin(0, 0);
            fillGameFieldBackground(350);
            drawFieldBackground(350);
            setMode(G.modeManagement);
            yield* spawnNewTrain();
            return ArchiveMenuAction.StartGame;
          case 3:
            /* 15e8:0823 */
            // [D] Delete
            drawDialog(DialogType.Confirmation, 0);
            G.lastKeyPressed = 0;
            if ((yield* handleDialog(DialogType.Confirmation, 1)) === 0) {
              // Yes
              G.files.remove(file.fileName);
              showNextFile = true;
            } else {
              // No
              needRedrawDialog = true;
            }
            break;
          case 4:
            /* 15e8:085c */
            // [B]ye
            return yield* returnToMain();
          default:
            throw new Error('showArchiveMenu: unreachable');
        }
      }
    }
  }
}

/* 15e8:04c3 */
export function* mainMenu(): Blocking {
  for (;;) {
    G.lastKeyPressed = 0;
    G.video.screen = 'menu';
    const item = yield* handleDialog(DialogType.MainMenu);
    switch (item) {
      case 0:
        /* 15e8:04ea */
        // [M] Manual
        yield* showManual();
        drawGameField(350);
        setHeaderValues(0, 100, 1800, readLevel(), 350);
        drawDialog(DialogType.MainMenu, 350);
        G.video.screen = 'menu';
        yield* animateScreenShifting();
        yield* setVideoFrameOrigin(0, 350);
        copyScreenBufferTo(0);
        yield* setVideoFrameOrigin(0, 0);
        break;
      case -1:
      case 1:
        if (item === -1) {
          /* 15e8:0575 */
          // No item selected - dialog was closed due to timeout => run the demo
          toggleButtonState(G.dialogs[DialogType.MainMenu].x, G.dialogs[DialogType.MainMenu].itemY[1]);
          yield* playEntitySwitchedSound(false);
          yield* waitForNRetraces(8);
        }
        /* 15e8:0590 */
        // [D]emo
        if (loadDemo()) {
          G.isDemoMode = true;
          drawWorld();
          // MenuButton::draw(350): drawing only
          G.video.screen = 'game';
          yield* animateScreenShifting();
          copyScreenBufferTo(0);
          yield* setVideoFrameOrigin(0, 0);
          fillGameFieldBackground(350);
          drawFieldBackground(350);
          setMode(G.modeManagement);
          return;
        }
        break;
      case 2:
        /* 15e8:05e8 */
        // [G]o!
        drawGameField(350);
        setHeaderValues(0, 100, 1800, readLevel(), 350);
        G.video.screen = 'game';
        yield* setVideoFrameOrigin(0, 350);
        copyScreenBufferTo(0);
        yield* setVideoFrameOrigin(0, 0);
        setMode(G.modeConstruction);
        return;
      case 3:
        /* 15e8:063e */
        // [A] Archive
        if ((yield* showArchiveMenu()) === ArchiveMenuAction.StartGame) {
          G.video.screen = 'game';
          return;
        }
        break;
      case 4: {
        /* 15e8:08c7 */
        // [R] Records
        G.video.screen = 'records';
        G.video.records = recordsScreenData();
        G.textSpacing = 2; // showRecordsScreen
        const closeBtn = new CloseButton();
        try {
          yield* animateScreenShifting();
          copyScreenBufferTo(0);
          yield* setVideoFrameOrigin(0, 0);
          G.lastKeyPressed = 0;
          while (G.lastKeyPressed === 0 && !closeBtn.clicked()) yield* G.m.waitVerticalRetrace();
          yield* closeBtn.click();
          drawGameField(350);
          setHeaderValues(0, 100, 1800, readLevel(), 350);
          drawDialog(DialogType.MainMenu, 350);
          G.video.screen = 'menu';
          yield* animateScreenShifting();
          yield* setVideoFrameOrigin(0, 350);
          copyScreenBufferTo(0);
          yield* setVideoFrameOrigin(0, 0);
        } finally {
          closeBtn.destroy();
        }
        break;
      }
      case 5:
        /* 15e8:0913 */
        // [B]ye
        exitWithMessage('Bye\n');
        break;
      default:
        throw new Error('mainMenu: unreachable');
    }
  }
}

/* 15ab:024d */
export function exitWithMessage(msg: string): never {
  G.m.nosound();
  G.emit({ type: 'exit', message: msg });
  throw new SimHalt('exit');
}

/* 132d:00b6 */
export function drawMainMenuBackground(yOffset: number): void {
  // play.7: drawing only
  drawStaticObjects(yOffset);
}

/* 16a6:065f */
export function* returnToMainMenu(): Blocking {
  yield* waitForNRetraces(40);
  const ok = G.m.sched.stopTask(G.taskGameMainLoop);
  if (!ok) throw new Error('returnToMainMenu: the main loop task is not running');
  G.taskGameMainLoop = G.m.addTask(taskGameMainLoop(), 'taskGameMainLoop');
}
