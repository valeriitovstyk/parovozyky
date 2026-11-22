// game/mouse/{mouse,state,construction_mode,management_mode}.cpp
import { i16, i8, u16, u8 } from '../core/ints';
import { pop, type Blocking, type TaskGen } from '../core/scheduler';
import type { MouseEvent } from '../core/machine';
import { findClosestEntrance, entranceIsFree } from './entrance';
import { G, type Mode } from './globals';
import { spendMoney } from './header';
import { beepSound, playEntitySwitchedSound, playErrorMelody, playSingleClickSound, playSwitchSwitchedMelody } from './melody';
import { checkRailWouldConflict, checkRailWouldConflictWithExistingRoad } from './rail';
import { allowedRailCursorTypes } from './res';
import { drawSemaphore, findClosestSemaphore, toggleSemaphore } from './semaphore';
import { drawSwitch, eraseSwitch, findClosestSwitch, switchIsBusy, toggleSwitch } from './switch';
import { drawRail } from './drawing';
import { type Glyph, VIDEO_MEM_ROW_BYTES, VIDEO_MEM_SHADOW_BUFFER, VIDEO_MEM_START_ADDR, drawGlyphAlignX8, setVideoModeR0W1, setVideoModeR0W2 } from '../gfx/draw';
import { railGlyph } from '../gfx/res';
import { scheduleAllTrainsRedrawing, spawnServer } from './train';
import {
  Color,
  HeaderFieldId,
  MB_LEFT,
  MB_RIGHT,
  ME_LEFTPRESSED,
  ME_LEFTRELEASED,
  ME_RIGHTPRESSED,
  ME_RIGHTRELEASED,
  MouseAction,
  type MsgMouseEvent,
} from './types';
import { showStatusMessage } from '../ui/statusBar';

// ---- construction mode (construction_mode.cpp) ----

/** mouse::g_state.glyph / videoMemOffset (drawing state of the rail cursor) */
const cursorState: { glyph: Glyph | null; videoMemOffset: number } = { glyph: null, videoMemOffset: 0 };

/* 14af:0126 */
function drawCursorRail(): void {
  if (!G.vga) return;
  const rcs = G.railCursorState;
  const rg = railGlyph(rcs.railType, 0);
  const x = (rcs.tileX - rcs.tileY) * 88 + rg.dx + 320;
  const y = (rcs.tileX + rcs.tileY) * 21 + rg.dy - 22;
  cursorState.videoMemOffset = u16(y * VIDEO_MEM_ROW_BYTES + Math.trunc(x / 8));
  cursorState.glyph = rg.glyph;
  drawGlyphAlignX8(rg.glyph, x, y, Color.BWBlinking);
}

function eraseCursorRail(): void {
  const v = G.vga;
  if (!v) return;
  const glyph = cursorState.glyph;
  if (!glyph) throw new Error('eraseCursorRail: no glyph');
  let dstPtr = VIDEO_MEM_START_ADDR + cursorState.videoMemOffset;
  let srcPtr = VIDEO_MEM_SHADOW_BUFFER + cursorState.videoMemOffset;
  setVideoModeR0W1();
  let p = glyph.o;
  for (let y = 0; y < glyph.h; ++y) {
    for (let x = 0; x < glyph.w; ++x) {
      if (glyph.d[p++]) v.write(dstPtr, v.read(srcPtr));
      ++srcPtr;
      ++dstPtr;
    }
    srcPtr += VIDEO_MEM_ROW_BYTES - glyph.w;
    dstPtr += VIDEO_MEM_ROW_BYTES - glyph.w;
  }
  setVideoModeR0W2();
}

/** mode->drawFn() (the arrow cursor of the management mode is drawn by the driver) */
export function modeDraw(mode: Mode): void {
  if (mode === G.modeConstruction) drawCursorRail();
}

/** mode->clearFn() */
export function modeClear(mode: Mode): void {
  if (mode === G.modeConstruction) eraseCursorRail();
}

/* 14af:0264 */
function updateCursorPosConstruction(x: number, y: number): boolean {
  const rcs = G.railCursorState;
  // The projection is:
  //   x = (tileX - tileY) * 88 + 320
  //   y = (tileX + tileY) * 21 - 22
  const tx = (x * 21 + 88 * y) / 3696.0 - 299.0 / 231.0;
  const tileX = i8(Math.trunc(tx));
  const tileY = i8(Math.trunc(y / 21.0 - tx + 22.0 / 21.0));
  if (tileX === rcs.tileX && tileY === rcs.tileY) return false;
  if (tileX < 0 || tileX > 10 || tileY < 0 || tileY > 10) return false;
  if (allowedRailCursorTypes(tileX, tileY) & (1 << rcs.railType)) {
    modeClear(G.mode!);
    rcs.tileX = u8(tileX);
    rcs.tileY = u8(tileY);
    modeDraw(G.mode!);
    return true;
  }
  return false;
}

// ---- management mode (management_mode.cpp) ----

function updateCursorPosManagement(x: number, y: number): boolean {
  const mode = G.modeManagement;
  mode.x = i16(Math.min(Math.max(x, mode.minX), mode.maxX));
  mode.y = i16(Math.min(Math.max(y, mode.minY), mode.maxY));
  return true;
}

function updatePosFn(mode: Mode, x: number, y: number): boolean {
  return mode === G.modeManagement ? updateCursorPosManagement(x, y) : updateCursorPosConstruction(x, y);
}

// ---- state.cpp ----

/* 14af:0104 */
export function setMode(newMode: Mode): void {
  if (G.mode) modeClear(G.mode);
  G.mode = newMode;
  G.gridVisible = G.mode === G.modeConstruction;
  modeDraw(newMode);
}

export function toggleMode(): void {
  setMode(G.mode === G.modeManagement ? G.modeConstruction : G.modeManagement);
}

// ---- mouse.cpp ----

/* 14af:0761 */
export function handleMouseInput(me: MouseEvent): void {
  const msg: MsgMouseEvent = { action: MouseAction.None, x: i16(me.x), y: i16(me.y) };
  if (G.previousMouseButtonState) G.previousMouseButtonState = u8(me.buttonState);
  else {
    if (me.flags & (ME_LEFTPRESSED | ME_RIGHTPRESSED) && me.buttonState === (MB_LEFT | MB_RIGHT)) {
      msg.action = MouseAction.ToggleMouseMode;
      G.previousMouseButtonState = MB_LEFT;
    } else {
      if (me.flags & ME_LEFTRELEASED) {
        // left button clicked
        if (G.mode === G.modeManagement) msg.action = MouseAction.MouseClick;
        else msg.action = MouseAction.ToggleNextRailType;
      } else {
        if (me.flags & ME_RIGHTRELEASED) {
          // right button clicked
          if (G.mode === G.modeManagement) msg.action = MouseAction.CallServer;
          else msg.action = MouseAction.BuildRails;
        }
      }
    }
  }
  G.mouseMsgQueue.push(msg);
}

/* 14af:0320 */
export function* taskMouseEventHandling(): TaskGen {
  for (;;) {
    const e = yield* pop(G.mouseMsgQueue);
    const mode = G.mode;
    if (!mode) throw new Error('taskMouseEventHandling: no mouse mode');
    let positionChanged = false;
    if (e.action !== MouseAction.BuildRails) positionChanged = updatePosFn(mode, e.x, e.y);
    switch (e.action) {
      case MouseAction.CallServer:
        /* 14af:05e7 */
        yield* callServer(mode);
        break;
      case MouseAction.MouseClick:
        /* 14af:0364 */
        yield* mouseClick(mode);
        break;
      case MouseAction.ToggleMouseMode:
        toggleMode();
        break;
      case MouseAction.ToggleNextRailType:
        /* 14af:0595 */
        // if the user clicked on a new chunk, we just need to move cursor
        if (!positionChanged) {
          modeClear(G.mode!);
          const rcs = G.railCursorState;
          for (;;) {
            rcs.railType = u8((rcs.railType + 1) % 6);
            const curRailMask = u8(1 << rcs.railType);
            const allowedMask = allowedRailCursorTypes(rcs.tileX, rcs.tileY);
            if (curRailMask & allowedMask) break;
          }
          modeDraw(G.mode!);
        }
        break;
      case MouseAction.BuildRails:
        /* 14af:04a5 */
        yield* buildRails();
        break;
      case MouseAction.ToggleSound:
        /* 14af:0695 — unreachable in the original game */
        G.soundEnabled = !G.soundEnabled;
        if (!G.soundEnabled) playSingleClickSound();
        else {
          G.m.sound(2000);
          yield G.m.sleep(20);
          G.m.nosound();
        }
        break;
      case MouseAction.None:
        break;
    }
    yield G.m.sleep(1);
  }
}

function* callServer(mode: Mode): Blocking {
  const entrance = findClosestEntrance(mode.x, mode.y);
  if (!entrance) {
    showStatusMessage('Click CLOSER TO ENTRANCE to call server');
    yield* playErrorMelody();
  } else if (G.headers[HeaderFieldId.Money].value < 2) {
    showStatusMessage('No money to pay for server call');
    yield* playErrorMelody();
  } else {
    const entranceIdx = G.entrances.indexOf(entrance);
    if (!entranceIsFree(entranceIdx)) {
      showStatusMessage('Entrance is locked by train');
      yield* playErrorMelody();
    } else {
      if (spawnServer(entranceIdx)) spendMoney(2);
      else {
        showStatusMessage("Railnet OVERFLOW. Can't call the server");
        yield* playErrorMelody();
      }
    }
  }
}

function* mouseClick(mode: Mode): Blocking {
  const sw = findClosestSwitch(mode.x, mode.y);
  if (sw) {
    if (switchIsBusy(sw)) {
      showStatusMessage('Switch is locked by train');
      yield* playErrorMelody();
    } else {
      const switchIdx = G.switches.indexOf(sw);
      eraseSwitch(switchIdx);
      toggleSwitch(sw);
      drawSwitch(switchIdx, true);
      scheduleAllTrainsRedrawing();
      yield* playSwitchSwitchedMelody();
    }
    return;
  }
  const sem = findClosestSemaphore(mode.x, mode.y);
  if (sem) {
    toggleSemaphore(sem);
    drawSemaphore(sem, 0);
    drawSemaphore(sem, 350);
    scheduleAllTrainsRedrawing();
    yield* playEntitySwitchedSound(sem.isRed);
  } else yield* playErrorMelody();
}

function* buildRails(): Blocking {
  const rcs = G.railCursorState;
  const newRail = u8(1 << rcs.railType);
  const existing = G.mask(rcs.tileX, rcs.tileY);
  if (newRail & existing) {
    showStatusMessage("Track's already built over here");
    yield* playErrorMelody();
  } else {
    if (checkRailWouldConflict(rcs.tileX, rcs.tileY, rcs.railType)) {
      // the rail may conflict with both existing roads and rails of
      // entrances that have not yet built
      const isTripleSwitch = checkRailWouldConflictWithExistingRoad(rcs.tileX, rcs.tileY, rcs.railType);
      showStatusMessage(
        isTripleSwitch ? 'No triple switch allowed' : "Can't build for contradiction to General Construction Plan",
      );
      yield* playErrorMelody();
    } else {
      yield* beepSound(0);
      rcs.year_8 = u8(G.headers[HeaderFieldId.Year].value - 8);
      G.railConstructionMsgQueue.push(rcs.clone());
      modeClear(G.mode!);
      drawRail(rcs.tileX, rcs.tileY, rcs.railType, Color.White, 350);
      modeDraw(G.mode!);
      G.emit({ type: 'railStage', tileX: rcs.tileX, tileY: rcs.tileY, railType: rcs.railType, stage: 0 });
    }
  }
}
