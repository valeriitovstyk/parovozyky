// game/move_trains.cpp
import { i16, u16, u8 } from '../core/ints';
import type { Blocking, TaskGen } from '../core/scheduler';
import { drawEraseTrainFinishedExclamation } from './drawing';
import { G, pathStep, ub } from './globals';
import { spendMoney, startHeaderFieldAnimation } from './header';
import { playFixRoadMelody, playTrainFinishedMelody } from './melody';
import { trainGlyph } from './res';
import { drawSemaphore } from './semaphore';
import { modeClear, modeDraw } from './mouse';
import {
  VIDEO_MEM_SHADOW_BUFFER,
  copyFromShadowBuffer,
  copySpriteFromShadowBuffer,
  line,
  setDataRotation,
  setVideoModeR0W1,
  setVideoModeR0W2,
} from '../gfx/draw';
import { drawTrainList, eraseTrain, scheduleTrainsDrawing } from './train';
import { showStatusMessage } from '../ui/statusBar';
import {
  BLINKING_TRAIN_ENTRANCE_IDX,
  CRASHED_TRAIN_ENTRANCE_IDX,
  type Carriage,
  CarriageType,
  Color,
  DISABLED_SWITCH_PATH,
  HeaderFieldId,
  INNER_ENTRANCE_RAIL_TYPE,
  type Location,
  type Rail,
  type Train,
  setEmptyRectangle,
} from './types';

enum MoveAbility {
  Ok,
  // the train has reached a impasse or blocked switch
  BlockedByRoad,
  // the train has reached a red semaphore
  BlockedBySemaphore,
}

function validRail(r: Rail | null, where: string): Rail {
  if (!r || r === DISABLED_SWITCH_PATH) ub(`${where}: invalid rail`);
  return r;
}

/* 18a5:0006 */
function tryMoveAlongPath(loc: Location): MoveAbility {
  const rail = validRail(loc.rail, 'tryMoveAlongPath');
  if (loc.forwardDirection) {
    if (loc.pathStep < rail.maxPathStep) {
      loc.pathStep = u8(loc.pathStep + 1);
      return MoveAbility.Ok;
    }
  } else {
    if (loc.pathStep > rail.minPathStep) {
      loc.pathStep = u8(loc.pathStep - 1);
      return MoveAbility.Ok;
    }
  }

  const next = rail.connections[loc.forwardDirection];
  if (!next.rail || next.rail === DISABLED_SWITCH_PATH) return MoveAbility.BlockedByRoad;

  const semSlotId = rail.semSlotIdByDirection[loc.forwardDirection];
  if (semSlotId !== -1 && G.semaphores[semSlotId].isRed) return MoveAbility.BlockedBySemaphore;

  if (next.slot) loc.pathStep = u8(G.pathSize(next.rail.type) - 1);
  else loc.pathStep = 0;
  loc.rail = next.rail;
  loc.forwardDirection = u8(next.slot ^ 1);
  return MoveAbility.Ok;
}

/* 18a5:00c1 */
export function moveAlongPath(loc: Location, distance: number): void {
  for (let i = 0; i < distance; ++i) {
    const rail = validRail(loc.rail, 'moveAlongPath');
    if (loc.forwardDirection) {
      if (loc.pathStep < rail.maxPathStep) {
        loc.pathStep = u8(loc.pathStep + 1);
        continue;
      }
    } else {
      if (loc.pathStep > rail.minPathStep) {
        loc.pathStep = u8(loc.pathStep - 1);
        continue;
      }
    }

    const next = rail.connections[loc.forwardDirection];
    // moving past an impasse or into a disabled switch path dereferences
    // nullptr / g_disabledSwitchPath (docs/fidelity.md, U1; oracle P7)
    if (!next.rail || next.rail === DISABLED_SWITCH_PATH) ub('moveAlongPath: invalid rail');
    if (next.slot) loc.pathStep = u8(G.pathSize(next.rail.type) - 1);
    else loc.pathStep = 0;
    loc.rail = next.rail;
    loc.forwardDirection = u8(next.slot ^ 1);
  }
}

/* 18a5:044c */
function countPassengerCarriages(train: Train): number {
  let res = 0;
  for (let i = 0; i < train.carriageCnt; ++i) {
    switch (train.carriages[i].type) {
      case CarriageType.HighSpeedLocomotive:
      case CarriageType.AncientPassengerCarriage:
      case CarriageType.PassengerCarriage:
      case CarriageType.HighSpeedPassengerCarriage:
        ++res;
        break;
      default:
        break;
    }
  }
  return res;
}

/* 18a5:050c */
function carriagePosition(loc: Location): { x: number; y: number } {
  const rail = validRail(loc.rail, 'carriagePosition');
  const p = pathStep(rail.type, loc.pathStep);
  return { x: i16(rail.x + p.dx), y: i16(rail.y + p.dy) };
}

/* 132d:0239 — consumes 750 random numbers and blocks for 250 ms */
function* animateCollisionAndPlaySound(pos: { x: number; y: number }): Blocking {
  G.emit({ type: 'explosion', x: pos.x, y: pos.y });
  const rng = G.rng;
  setDataRotation(0x18); // rotation = 0, mode = XOR
  const x1: number[] = [];
  const y1: number[] = [];
  const x2: number[] = [];
  const y2: number[] = [];
  for (let i = 0; i < 125; ++i) {
    x1[i] = i16(pos.x + rng.symmetricRand(5));
    y1[i] = i16(pos.y + rng.symmetricRand(3));
    x2[i] = i16(pos.x + rng.symmetricRand(Math.trunc(i / 2) + 1));
    y2[i] = i16(pos.y + rng.symmetricRand(Math.trunc(i / 2) + 1));
    line(x1[i], y1[i], x2[i], y2[i], Color.White);
    const freq = rng.genRandomNumber(i * 16 + 1);
    G.m.sound(u16(freq + 30));
    yield* G.m.driverSleep(1); // activeSleep(1)
  }
  for (let i = 0; i < 125; ++i) {
    line(x1[i], y1[i], x2[i], y2[i], Color.White);
    const freq = rng.genRandomNumber(i * 16 + 1);
    G.m.sound(u16(freq + 30));
    yield* G.m.driverSleep(1);
  }
  G.m.nosound();
  setDataRotation(0); // default mode - simple copying without rotation
}

/* 18fa:023d */
function createCrashMarker(c: Carriage): void {
  const train = c.train!;
  train.isFreeSlot = false;
  train.headCarriageIdx = 0;
  train.carriageCnt = 1;
  const c0 = train.carriages[0];
  c0.copyFrom(c);
  c0.dstEntranceIdx = CRASHED_TRAIN_ENTRANCE_IDX;
  c0.type = CarriageType.CrashedTrain;
  train.tail.set(c0.location);
  train.head.set(c0.location);
  setEmptyRectangle(c0.rect);
  train.needToRedraw = true;
}

/* 18fa:063d */
function showPassengerAccidentMessage(count: number): void {
  const firstDigit = Math.trunc(count / 10);
  const d0 = firstDigit ? String.fromCharCode(48 + firstDigit) : ' ';
  const d1 = String.fromCharCode(48 + (count % 10));
  showStatusMessage(`${d0}${d1} PASSENGER CARS involved in the accident`);
}

/* 18fa:00ba */
function removeTrainFromDrawingChain(train: Train): void {
  // Carriage** c = &g_trainDrawingChains[train.drawingChainIdx];
  const idx = train.drawingChainIdx;
  let prev: Carriage | null = null;
  let cur = G.trainDrawingChains[idx];
  while (cur) {
    if (cur.train === train) {
      if (prev) prev.next = cur.next;
      else G.trainDrawingChains[idx] = cur.next;
      cur = cur.next;
    } else {
      prev = cur;
      cur = cur.next;
    }
  }
}

/* 18a5:042f */
function deleteTrain(train: Train): void {
  removeTrainFromDrawingChain(train);
  eraseTrain(train);
  train.isFreeSlot = true;
}

/* 18a5:03a5 */
function reverseTrain(train: Train): void {
  // std::swap(train.tail, train.head)
  const tmp = train.tail.clone();
  train.tail.set(train.head);
  train.head.set(tmp);
  for (let i = 0; i < train.carriageCnt; ++i) {
    const l = train.carriages[i].location;
    l.forwardDirection = l.forwardDirection ? 0 : 1;
  }
  train.head.forwardDirection = train.head.forwardDirection ? 0 : 1;
  train.tail.forwardDirection = train.tail.forwardDirection ? 0 : 1;
  if (train.headCarriageIdx === 0) train.headCarriageIdx = u8(train.carriageCnt - 1);
  else train.headCarriageIdx = 0;
  train.speed = 1;
}

/* 18a5:0145 */
export function* moveTrain(train: Train, dTime: number): Blocking<boolean> {
  const totalDistance = i16(train.speed * dTime * 10 + train.movementDebt);
  const maxDistance = totalDistance >> 8;
  train.movementDebt = u8(totalDistance);

  let distance = 0;
  for (; distance < maxDistance; ++distance) {
    const moveAbility = tryMoveAlongPath(train.head);
    if (moveAbility === MoveAbility.Ok) G.needToRedrawTrains = true;
    else {
      // blinking trains ignore semaphores
      if (
        moveAbility !== MoveAbility.BlockedBySemaphore ||
        train.carriages[0].dstEntranceIdx !== BLINKING_TRAIN_ENTRANCE_IDX
      )
        break;
      moveAlongPath(train.head, 1);
    }
  }

  for (let i = 0; i < train.carriageCnt; ++i) moveAlongPath(train.carriages[i].location, distance);
  moveAlongPath(train.tail, distance);

  if (distance < maxDistance) {
    // the train faced some obstacle
    if (train.carriages[0].dstEntranceIdx === BLINKING_TRAIN_ENTRANCE_IDX) {
      // the blinking train crashes on blocked switches
      const passengerCnt = countPassengerCarriages(train);

      yield* animateCollisionAndPlaySound(carriagePosition(train.head));
      eraseTrain(train);
      train.carriages[0].location.set(train.head);
      createCrashMarker(train.carriages[train.headCarriageIdx]);

      if (passengerCnt) showPassengerAccidentMessage(passengerCnt);

      spendMoney(train.carriageCnt + passengerCnt * 9);
      return true;
    }
  } else {
    const dstEntrance = G.entrances[train.carriages[0].dstEntranceIdx];
    if (train.head.rail === dstEntrance.rail.connections[0].rail) train.maxSpeed = 30;
    if (validRail(train.head.rail, 'moveTrain').type !== INNER_ENTRANCE_RAIL_TYPE) return false;
    const rect = train.carriages[train.carriageCnt - 1 - train.headCarriageIdx].rect;
    if (rect.x1 < 638 && rect.x2 > 1) return false;

    if (
      train.head.rail === dstEntrance.rail ||
      train.carriages[0].type === CarriageType.Server ||
      train.carriages[0].dstEntranceIdx === BLINKING_TRAIN_ENTRANCE_IDX
    ) {
      // the train has reached the entrance
      deleteTrain(train);
      G.emit({ type: 'trainFinished', x: Math.trunc((rect.x1 + rect.x2) / 2), y: Math.trunc((rect.y1 + rect.y2) / 2) });
      drawEraseTrainFinishedExclamation(Math.trunc((rect.x1 + rect.x2) / 2), Math.trunc((rect.y1 + rect.y2) / 2));
      yield* playTrainFinishedMelody(train.carriageCnt);
      if (train.carriages[0].type === CarriageType.Server) showStatusMessage('Server went out');
      else {
        startHeaderFieldAnimation(HeaderFieldId.Trains, 1);
        startHeaderFieldAnimation(HeaderFieldId.Money, train.carriageCnt + 3);
      }
      // this function uses XOR when drawing, thus this duplicate call simply
      // erases the previously drawn image
      drawEraseTrainFinishedExclamation(Math.trunc((rect.x1 + rect.x2) / 2), Math.trunc((rect.y1 + rect.y2) / 2));
      return false;
    }
  }
  reverseTrain(train);
  return false;
}

/* 18fa:0295 */
function* processCarriageCollision(c1: Carriage, c2: Carriage, x: number, y: number): Blocking {
  for (;;) {
    if (c1.type === CarriageType.Server) {
      if (c2.type === CarriageType.CrashedTrain) {
        // server should fix the damaged road
        if (c1.train!.speed) {
          c1.train!.speed = 0;
          return;
        }
        yield* playFixRoadMelody();
        deleteTrain(c2.train!);
        c1.train!.speed = 1;
        spendMoney(1);
        return;
      }
    }
    if (c1.type === CarriageType.CrashedTrain) {
      if (c2.type === CarriageType.CrashedTrain) return;
      const tmp = c1;
      c1 = c2;
      c2 = tmp;
      continue;
    }
    break;
  }

  yield* animateCollisionAndPlaySound({ x, y });
  let nPassenger = countPassengerCarriages(c1.train!);
  let dMoney = c1.train!.carriageCnt;

  deleteTrain(c1.train!);
  if (c2.type === CarriageType.CrashedTrain) c2.train!.needToRedraw = true;
  else {
    deleteTrain(c2.train!);
    if (x > 0 && x < 639) createCrashMarker(c1);
    dMoney = i16(dMoney + c2.train!.carriageCnt);
    nPassenger = i16(nPassenger + countPassengerCarriages(c2.train!));
  }

  if (nPassenger) showPassengerAccidentMessage(nPassenger);

  dMoney = i16(dMoney + nPassenger * 9);
  spendMoney(dMoney);
}

/* 1d7d:234c */
const g_sinArr = [0, 3, 5, 5, 3];
/* 1d7d:2356 */
const g_cosArr = [5, 4, 1, -1, -4];

function sinAt(i: number): number {
  if (i < 0 || i > 4) ub(`g_sinArr[${i}]`);
  return g_sinArr[i];
}
function cosAt(i: number): number {
  if (i < 0 || i > 4) ub(`g_cosArr[${i}]`);
  return g_cosArr[i];
}

function* handleCollisions(c1: Carriage, c2: Carriage): Blocking<boolean> {
  const loc1 = c1.location;
  const loc2 = c2.location;
  const r1 = validRail(loc1.rail, 'handleCollisions');
  const r2 = validRail(loc2.rail, 'handleCollisions');

  const p1 = pathStep(r1.type, loc1.pathStep);
  const p2 = pathStep(r2.type, loc2.pathStep);

  const x1 = i16(r1.x + p1.dx);
  const y1 = i16(r1.y + p1.dy);
  const x2 = i16(r2.x + p2.dx);
  const y2 = i16(r2.y + p2.dy);

  const dx = i16(x1 - x2);
  const dy = i16((y1 - y2) * 4);

  const cos = cosAt(p1.angle);
  const sin = i16(-sinAt(p1.angle));

  const w1 = i16(trainGlyph(c1.type, 0, 0).width - 4);
  const w2 = i16(trainGlyph(c2.type, 0, 0).width - 4);

  const a1 = i16(Math.trunc((cos * w1) / 10));
  const b1 = i16(Math.trunc((sin * w1) / 10));
  const a2 = i16(Math.trunc((sin * 8) / 10));
  const b2 = i16(Math.trunc((-cos * 8) / 10));

  const xOffsets = [a1 - a2, a1 + a2, -a1 - a2, -a1 + a2].map(i16);
  const yOffsets = [b1 - b2, b1 + b2, -b1 - b2, -b1 + b2].map(i16);

  // This is weird, but in the original game this value is overwritten with 0 (18fa:0563)
  xOffsets[0] = 0;

  // The original game makes 5 iterations (18fa:062d), but xOffsets[4] / yOffsets[4]
  // are never initialised; reSL makes 4 (kept as is)
  for (let i = 0; i < 4; ++i) {
    const curX = i16(xOffsets[i] + dx);
    const curY = i16(yOffsets[i] + dy);

    const xDist = i16(sinAt(c2.x_direction) * curX + cosAt(c2.x_direction) * curY);
    const yDist = i16(cosAt(c2.x_direction) * curX - sinAt(c2.x_direction) * curY);
    if (Math.abs(xDist) > 20 || Math.abs(yDist) >= Math.trunc((w2 * 5) / 2)) continue;

    yield* processCarriageCollision(c1, c2, Math.trunc((x1 + x2) / 2), Math.trunc((y1 + y2) / 2));
    return true;
  }
  return false;
}

/* 18fa:0b10 */
function eraseCarriagesInShadowBuffer(c: Carriage, ptr: number): void {
  const widthBytes = ((c.rect.x2 - 1) >> 3) - (c.rect.x1 >> 3) + 1;
  const height = c.rect.y2 - c.rect.y1;
  if (c.next) eraseCarriagesInShadowBuffer(c.next, ptr + widthBytes * height);
  copySpriteFromShadowBuffer(ptr, c.rect.x1, c.rect.y1 + 350, widthBytes, height);
}

/* 18fa:068a */
export function* taskMoveAndRedrawTrains(): TaskGen {
  const minMovementPeriod = 15;
  let curChain = 0; // u16

  for (;;) {
    yield G.m.sleep(1);

    scheduleTrainsDrawing();

    for (let i = 0; i < G.collidedTrainsArrayLen; ++i) {
      const [c1, c2] = G.collidedTrainsArray[i];
      if (c1!.train!.isFreeSlot || c2!.train!.isFreeSlot) continue;
      if (!(yield* handleCollisions(c1!, c2!))) yield* handleCollisions(c2!, c1!);
    }

    for (let i = 0; i < G.trainDrawingChainLen; ++i) {
      yield G.m.yieldEffect();

      let needToRedrawCursor = false;
      G.needToRedrawTrains = false;

      curChain = u16(curChain + 1);
      if (curChain >= G.trainDrawingChainLen) curChain = 0;

      let carriage = G.trainDrawingChains[curChain];
      // P3 / docs/fidelity.md F2: 16-bit unsigned difference
      if (!carriage || u16(G.m.getTime() - carriage.train!.lastMovementTime) < minMovementPeriod) continue;

      let needToRestartDrawing = false;
      do {
        const train = carriage.train!;
        if (train.needToRedraw) {
          G.needToRedrawTrains = true;
          train.needToRedraw = false;
        }
        if (!train.isActualPosition) {
          train.isActualPosition = true;
          const curTime = G.m.getTime();
          const dTime = u16(curTime - train.lastMovementTime);
          train.lastMovementTime = i16(curTime);

          if (carriage.type !== CarriageType.CrashedTrain) {
            const trainCrashed = yield* moveTrain(train, i16(dTime));
            if (trainCrashed) {
              needToRestartDrawing = true;
              break;
            }
          }
        }
        const mode = G.mode!;
        const mouseX = mode.x & 0xfff8;
        const mouseY = mode.y;
        if (
          mode === G.modeManagement &&
          mouseX - 8 < carriage.rect.x2 &&
          mouseX + 32 > carriage.rect.x1 &&
          mouseY < carriage.rect.y2 &&
          mouseY + 16 > carriage.rect.y1
        )
          needToRedrawCursor = true;
        carriage = carriage.next;
      } while (carriage);
      if (needToRestartDrawing) break;

      carriage = G.trainDrawingChains[curChain];
      if (!G.needToRedrawTrains || !carriage) continue;

      drawTrainList(carriage);
      if (G.vga)
        for (let k = 0; k < G.semaphoreCount; ++k)
          if (G.semaphores[k].isRightDirection) drawSemaphore(G.semaphores[k], 350);

      yield* G.m.waitVerticalRetrace();
      if (G.vga) {
        if (needToRedrawCursor) modeClear(G.mode!);
        setVideoModeR0W1();
        let bb = 0;
        let c: Carriage | null = carriage;
        do {
          copyFromShadowBuffer(G.carriagesBoundingBoxes[bb++]);
          c = c.next;
        } while (c);
        setVideoModeR0W2();
        if (needToRedrawCursor) modeDraw(G.mode!);
        setVideoModeR0W1();
        eraseCarriagesInShadowBuffer(G.trainDrawingChains[curChain]!, VIDEO_MEM_SHADOW_BUFFER);
        setVideoModeR0W2();
      }
    }
  }
}
