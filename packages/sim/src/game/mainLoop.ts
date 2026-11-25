// game/main_loop.cpp
import { i16 } from '../core/ints';
import type { Blocking, TaskGen } from '../core/scheduler';
import { taskDemoAI, stopDemo } from './demo';
import { drawWorld } from './drawing';
import { spawnNewEntrance } from './entrance';
import { G, ub } from './globals';
import { startHeaderFieldAnimation } from './header';
import { createNewWorld, resetTasks } from './init';
import { playHappy2000YearMelody } from './melody';
import { modeDraw, setMode, toggleMode } from './mouse';
import { copyFromShadowBuffer, setPaletteItem, setVideoModeR0W1, setVideoModeR0W2 } from '../gfx/draw';
import { randomRailDamage } from './rail';
import { readLevel, writeRecords } from './records';
import { entranceRail } from './res';
import { saveGame } from './savefile';
import { buildHouses } from './staticObject';
import { accelerateTrains, scheduleAllTrainsRedrawing, spawnNewTrain, tryRunWaitingTrains, waitingTrainsCount } from './train';
import { Color, DialogType, HeaderFieldId, KEY_1, KEY_2, KEY_3, KEY_SPACE } from './types';
import { MenuButton } from '../ui/buttons';
import { alert, drawDialog, handleDialog } from '../ui/dialog';
import { setHeaderValues } from '../ui/drawHeader';
import { showLoadingScreen } from '../ui/loadingScreen';
import { drawMainMenuBackground, mainMenu } from '../ui/mainMenu';
import { animateScreenShifting, copyScreenBufferTo, setVideoFrameOrigin, shiftScreen } from '../ui/screens';
import { showStatusMessage, updateStatusBar } from '../ui/statusBar';

/* 16a6:0750 */
function incrementGameTime(delta: number): number {
  G.gameTime = i16(G.gameTime + delta);
  if (G.gameTime < 2000) return 0;
  G.gameTime = i16(G.gameTime - 2000);
  return G.headers[HeaderFieldId.Year].value;
}

/* 15e8:0bbd */
function pauseMenuShowSaveItem(): void {
  G.dialogs[DialogType.Pause].itemNames[1] = 'Save';
}

/* 15e8:0bcf */
function pauseMenuShowOkItem(): void {
  G.dialogs[DialogType.Pause].itemNames[1] = '  OK';
}

enum PauseMenuAction {
  ContinueGame,
  ReturnToMainMenu,
}

/* 16a6:0154 */
function* showPauseMenu(): Blocking<PauseMenuAction> {
  pauseMenuShowSaveItem();
  let needInit = true;
  for (;;) {
    if (needInit) {
      drawDialog(DialogType.Pause, 0);
      writeRecords();
      needInit = false;
    }

    /* 16a6:016f */
    G.lastKeyPressed = 0;
    const item = yield* handleDialog(DialogType.Pause);
    G.lastKeyPressed = 0;
    switch (item) {
      case -1:
        // Timeout
        break;
      case 0:
        /* 16a6:0195 */
        // [G]o
        setVideoModeR0W1();
        copyFromShadowBuffer(G.dialogArea);
        setVideoModeR0W2();
        scheduleAllTrainsRedrawing();
        G.m.timer.start(); // enableTimer()
        yield* spawnNewTrain();
        return PauseMenuAction.ContinueGame;
      case 1:
        /* 16a6:01b9 */
        // [S]ave
        if (saveGame()) pauseMenuShowOkItem();
        else yield* alert('Error');
        needInit = true;
        break;
      case 2:
        /* 16a6:01d8 */
        // [B]ye
        G.m.timer.start(); // enableTimer()
        return PauseMenuAction.ReturnToMainMenu;
      default:
        throw new Error('showPauseMenu: unreachable');
    }
  }
}

/* 16a6:0001 */
export function* taskGameMainLoop(): TaskGen {
  G.gameTime = 0;

  // The original game uses uint8 here - VGA color code (0 / 0x3F).
  let blinkingColor = 0xffffffff;
  let isOddIter = false;

  G.m.sched.stopTask(G.taskDemoAI);

  yield* setVideoFrameOrigin(0, 0);
  yield* shiftScreen(511);

  if (G.isDemoMode || !G.gameOver) yield* showLoadingScreen();

  G.gameOver = false;

  const menuButton = new MenuButton();
  try {
    for (;;) {
      /* 16a6:004c */
      G.m.timer.stop(); // disableTimer()

      createNewWorld();
      drawMainMenuBackground(350);

      setHeaderValues(0, 100, 1800, readLevel(), 350);
      drawDialog(DialogType.MainMenu, 350);
      G.video.screen = 'menu';

      yield* animateScreenShifting();
      setMode(G.modeManagement);
      copyScreenBufferTo(0);
      yield* setVideoFrameOrigin(0, 0);

      G.isDemoMode = false;

      yield* mainMenu();

      if (G.isDemoMode) {
        G.m.sched.stopTask(G.taskDemoAI);
        G.taskDemoAI = G.m.addTask(taskDemoAI(), 'taskDemoAI');
      }

      menuButton.enable();

      let needReturnToMainMenu = false;
      while (!needReturnToMainMenu) {
        resetTasks();

        G.gameTime = 0;
        modeDraw(G.mode!);
        if (G.headers[HeaderFieldId.Year].value === 1800) {
          buildHouses(1800);
          if (G.entranceCount === 0) yield* spawnNewEntrance(entranceRail(G.entrances[0].entranceRailInfoIdx));
        }
        G.lastKeyPressed = 0;
        G.m.timer.start(); // enableTimer()

        let needRestartGame = false;
        while (!needRestartGame) {
          /* 16a6:0126 */
          yield G.m.sleep(50);

          if (G.lastKeyPressed) {
            // use <space> as a hot key to switch mouse modes
            switch (G.lastKeyPressed) {
              case KEY_SPACE:
                toggleMode();
                G.lastKeyPressed = 0;
                break;
              case KEY_1:
                G.m.timer.setTimeAcceleration(1);
                G.lastKeyPressed = 0;
                break;
              case KEY_2:
                G.m.timer.setTimeAcceleration(2);
                G.lastKeyPressed = 0;
                break;
              case KEY_3:
                G.m.timer.setTimeAcceleration(3);
                G.lastKeyPressed = 0;
                break;
              default:
                yield* menuButton.click();
            }
          }
          if (menuButton.clicked()) {
            menuButton.reset();
            menuButton.disable();
            G.m.timer.stop(); // disableTimer()
            if (G.isDemoMode) {
              stopDemo();
              G.m.timer.start();
              needReturnToMainMenu = true;
              break;
            } else {
              const menuRes = yield* showPauseMenu();
              if (menuRes === PauseMenuAction.ReturnToMainMenu) {
                needReturnToMainMenu = true;
                break;
              }
              menuButton.enable();
              continue;
            }
          }

          updateStatusBar();
          accelerateTrains(5);
          yield* G.m.waitVerticalRetrace();

          blinkingColor = (blinkingColor ^ 0xffffff) >>> 0;
          G.video.blinkingColor = blinkingColor;
          setPaletteItem(Color.BWBlinking, blinkingColor);

          isOddIter = !isOddIter;
          if (!isOddIter) {
            const probability = i16(
              Math.trunc(G.headers[HeaderFieldId.Level].value / 2) * G.railRoadCount,
            );
            if ((G.rng.rand() & 0xffff) < probability) yield* randomRailDamage();
            continue;
          }

          tryRunWaitingTrains();

          if (G.mode === G.modeConstruction) modeDraw(G.mode);

          const newYear = incrementGameTime(100);
          if (!newYear) continue;

          /* 16a6:024e */
          startHeaderFieldAnimation(HeaderFieldId.Year, 1);
          if (newYear & 1) startHeaderFieldAnimation(HeaderFieldId.Money, -1);

          const waitingTrains = waitingTrainsCount();
          if (waitingTrains) {
            showStatusMessage(`${waitingTrains},000 penalty for waiting trains`);
            startHeaderFieldAnimation(HeaderFieldId.Money, -waitingTrains);
          }

          buildHouses(G.headers[HeaderFieldId.Year].value + 1);
          scheduleAllTrainsRedrawing();

          // docs/fidelity.md U3: the year field is animated, a busy header
          // animation queue lets the year pass 2000 unnoticed (and then no
          // locomotive is available: generateTrain never ends)
          let year = G.headers[HeaderFieldId.Year].value;
          if (year > 2000) {
            if (G.ubPolicy !== 'recover') ub('the year passed 2000');
            year = 2000;
          }
          switch (year) {
            case 1800:
              if (G.entranceCount === 1) yield* spawnNewEntrance(entranceRail(G.entrances[1].entranceRailInfoIdx));
              break;
            case 1840:
              if (G.entranceCount === 2) yield* spawnNewEntrance(entranceRail(G.entrances[2].entranceRailInfoIdx));
              break;
            case 1880:
              if (G.entranceCount === 3) yield* spawnNewEntrance(entranceRail(G.entrances[3].entranceRailInfoIdx));
              break;
            case 1920:
              if (G.entranceCount === 4) yield* spawnNewEntrance(entranceRail(G.entrances[4].entranceRailInfoIdx));
              break;
            case 1960:
              if (G.entranceCount === 5) yield* spawnNewEntrance(entranceRail(G.entrances[5].entranceRailInfoIdx));
              break;
            case 2000: {
              /* 16a6:03d6 */
              yield* playHappy2000YearMelody();
              if (!G.isDemoMode) writeRecords();
              createNewWorld();
              yield* alert('Happy New 2000 Year!');
              const h = G.headers;
              h[HeaderFieldId.Year].value = 1800;
              h[HeaderFieldId.Level].value = i16(h[HeaderFieldId.Level].value + 1);
              h[HeaderFieldId.Money].value = i16(h[HeaderFieldId.Money].value + 10);
              drawWorld();
              MenuButton.draw(350);
              yield* animateScreenShifting();
              copyScreenBufferTo(0);
              yield* setVideoFrameOrigin(0, 0);
              needRestartGame = true;
              break;
            }
          }
        }
      }
      G.m.timer.setTimeAcceleration(1);
    }
  } finally {
    menuButton.destroy();
  }
}
