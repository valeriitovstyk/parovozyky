// game/train.cpp
import { i16, u16, u8 } from '../core/ints';
import type { Blocking, TaskGen } from '../core/scheduler';
import { addWaitingTrain, entranceIsFree } from './entrance';
import { G, SpawnCancelled, pathStep, ub } from './globals';
import { moveAlongPath } from './moveTrains';
import { carriageYBias, trainGlyph, trainSpecification } from './res';
import { showStatusMessage } from '../ui/statusBar';
import { drawDispatcher } from '../ui/drawHeader';
import {
  BLINKING_TRAIN_ENTRANCE_IDX,
  type Carriage,
  CarriageType,
  HeaderFieldId,
  SERVER_ENTRANCE_IDX,
  type Train,
  setEmptyRectangle,
} from './types';

/* 146b:0153 */
export function initTrains(): void {
  for (const train of G.trains) {
    for (let i = 0; i < 5; ++i) train.carriages[i].train = train;
  }
}

/* 146b:018c */
export function resetCarriages(): void {
  for (const train of G.trains) train.isFreeSlot = true;
}

/* 18fa:0142 */
function trainOverlaps(t: Train, idx: number): boolean {
  for (let i = t.carriageCnt - 1; i >= 0; --i) {
    const c1 = t.carriages[i];
    for (let c2 = G.trainDrawingChains[idx]; c2; c2 = c2.next) {
      // Check if the rectangles overlap
      if (
        c1.rect.y1 < c2.rect.y2 &&
        c1.rect.y2 > c2.rect.y1 &&
        (c1.rect.x1 & ~7) <= (c2.rect.x2 & ~7) &&
        (c1.rect.x2 & ~7) >= (c2.rect.x1 & ~7)
      ) {
        const pair = G.collidedTrainsArray[G.collidedTrainsArrayLen];
        if (!pair) ub('g_collidedTrainsArray overflow');
        pair[0] = c1;
        pair[1] = c2;
        G.collidedTrainsArrayLen = u16(G.collidedTrainsArrayLen + 1);
        return true;
      }
    }
  }
  return false;
}

/* 18fa:00e9 */
function addToDrawingChain(t: Train, chainIdx: number): void {
  for (let i = t.carriageCnt - 1; i >= 0; --i) {
    const c1 = t.carriages[i];
    // Carriage** c2 = &g_trainDrawingChains[chainIdx];
    let prev: Carriage | null = null;
    let cur = G.trainDrawingChains[chainIdx];
    while (cur && cur.drawingPriority < c1.drawingPriority) {
      prev = cur;
      cur = cur.next;
    }
    c1.next = cur;
    if (prev) prev.next = c1;
    else G.trainDrawingChains[chainIdx] = c1;
  }
  t.drawingChainIdx = u8(chainIdx);
}

/* 18fa:01e1 */
function mergeDrawingChains(idx1: number, idx2: number): void {
  let c1 = G.trainDrawingChains[idx1]!;
  let c2 = G.trainDrawingChains[idx2];
  G.trainDrawingChains[idx2] = null;
  while (c2) {
    c2.train!.drawingChainIdx = u8(idx1);
    for (;;) {
      if (!c1.next) ub('mergeDrawingChains: c1->next is nullptr');
      if (!(c1.next.drawingPriority < c2.drawingPriority)) break;
      c1 = c1.next;
      if (!c1.next) {
        c1.next = c2;
        return;
      }
    }
    const tmp: Carriage | null = c2.next;
    c2.next = c1.next;
    c1.next = c2;
    c1 = c1.next;
    c2 = tmp;
  }
}

/* 18fa:000b */
export function scheduleTrainsDrawing(): void {
  G.collidedTrainsArrayLen = 0;
  G.trainDrawingChainLen = 0;

  for (const t of G.trains) {
    if (t.isFreeSlot) continue;

    t.isActualPosition = false;
    for (let i = 0; ; ++i) {
      if (i < G.trainDrawingChainLen) {
        if (!trainOverlaps(t, i)) {
          // the train doesn't intersect with previously processed trains
          continue;
        }
        addToDrawingChain(t, i);
        for (let j = i + 1; j < G.trainDrawingChainLen; ++j) {
          if (trainOverlaps(t, j)) mergeDrawingChains(i, j);
        }
      } else {
        G.trainDrawingChains[G.trainDrawingChainLen] = null;
        addToDrawingChain(t, G.trainDrawingChainLen);
        G.trainDrawingChainLen = u16(G.trainDrawingChainLen + 1);
      }
      break;
    }
  }
}

/* 19de:0841 */
export function scheduleAllTrainsRedrawing(): void {
  for (const train of G.trains) train.needToRedraw = true;
}

/* 18fa:08d6 — computes carriage.rect / drawingPriority / direction (PLAN.md 2.1.1) */
export function drawTrainList(c: Carriage | null): void {
  let bb = 0;
  for (; c; c = c.next) {
    const rail = c.location.rail;
    if (!rail || rail.id === 1) ub('drawTrainList: invalid rail');
    const p = pathStep(rail.type, c.location.pathStep);
    if ((p.angle ^ c.x_direction) === 4) c.direction = u8(c.direction ^ 1);

    c.x_direction = u8(p.angle);
    const glyph = trainGlyph(c.type, p.angle, c.direction);

    if (bb < G.carriagesBoundingBoxes.length) G.carriagesBoundingBoxes[bb].set(c.rect);

    c.rect.x1 = i16(rail.x + p.dx - Math.trunc(glyph.width / 2));
    c.rect.x2 = i16(c.rect.x1 + glyph.width);
    c.drawingPriority = i16(rail.y + p.dy);
    c.rect.y1 = i16(c.drawingPriority - glyph.height + carriageYBias(c.type, p.angle));
    c.rect.y2 = i16(c.rect.y1 + glyph.height);

    if (bb < G.carriagesBoundingBoxes.length) {
      const box = G.carriagesBoundingBoxes[bb];
      if (c.rect.x1 < box.x1) box.x1 = c.rect.x1;
      if (c.rect.x2 > box.x2) box.x2 = c.rect.x2;
      if (c.rect.y1 < box.y1) box.y1 = c.rect.y1;
      if (c.rect.y2 > box.y2) box.y2 = c.rect.y2;
    }
    // copySpriteToShadowBuffer / drawGlyph: drawing only
    ++bb;
  }
}

/* 18fa:0b73 */
export function drawTrains(): void {
  for (let i = 0; i < G.trainDrawingChainLen; ++i) drawTrainList(G.trainDrawingChains[i]);
}

/* 132d:0002 */
export function eraseTrain(_train: Train): void {
  // drawing only
}

/* 19de:0797 */
export function allocateTrainSlot(): Train | null {
  for (const t of G.trains) {
    if (t.isFreeSlot) {
      t.isFreeSlot = false;
      return t;
    }
  }
  return null;
}

function getTrainSpawnInterval(): number {
  let res = 18000;
  for (let i = 0; i < G.headers[HeaderFieldId.Level].value - 1; ++i) res = i16(res - Math.trunc(res / 25));
  return res;
}

/* 19de:07b7 */
function noTrainsExist(): boolean {
  for (const train of G.trains) if (!train.isFreeSlot) return false;
  return true;
}

/* 1a65:03fa */
function isTrainAvailableInCurrentYear(type: CarriageType): boolean {
  const year = G.headers[HeaderFieldId.Year].value;
  const spec = trainSpecification(type);
  return year >= spec.minYear && year <= spec.maxYear;
}

/* 1a65:043a */
function generateTrain(t: Train, entranceIdx: number): void {
  const rng = G.rng;
  t.carriageCnt = u8(rng.genRandomNumber(5) + 1);
  do {
    const rnd = rng.genRandomNumber(6);
    t.carriages[0].type = u8(rnd + CarriageType.AncientLocomotive);
  } while (!isTrainAvailableInCurrentYear(t.carriages[0].type));

  const spec = trainSpecification(t.carriages[0].type);
  t.maxSpeed = spec.maxSpeed;
  t.speed = t.maxSpeed;
  t.carriages[0].direction = G.entrances[entranceIdx].rail.x > 320 ? 1 : 0;
  t.carriages[0].x_direction = 0;
  for (let i = 1; i < t.carriageCnt; ++i) {
    do {
      t.carriages[i].type = spec.possibleCarriages[rng.genRandomNumber(5)];
    } while (!isTrainAvailableInCurrentYear(t.carriages[i].type));
  }
}

/* 1a65:0100 */
function spawnTrain(entranceIdx: number): Train | null {
  const t = allocateTrainSlot();
  if (t && !cancellable(t, () => placeTrain(t, entranceIdx))) return null;
  return t;
}

/**
 * Runs the placement of a new train; with the 'recover' UB policy a placement
 * that walks into a dead end (docs/fidelity.md U1) frees the slot instead.
 */
function cancellable(t: Train, place: () => void): boolean {
  G.spawning = true;
  try {
    place();
    return true;
  } catch (e) {
    if (!(e instanceof SpawnCancelled)) throw e;
    t.isFreeSlot = true;
    G.emit({ type: 'spawnCancelled', reason: e.message });
    return false;
  } finally {
    G.spawning = false;
  }
}

function placeTrain(t: Train, entranceIdx: number): void {
  {
    generateTrain(t, entranceIdx);
    t.head.rail = G.entrances[entranceIdx].rail;
    t.head.forwardDirection = 0;
    t.head.pathStep = 0;
    moveAlongPath(t.head, 60);

    let dstEntranceIdx: number;
    do {
      dstEntranceIdx = G.rng.genRandomNumber(G.entranceCount);
    } while (dstEntranceIdx === entranceIdx);

    const loc = t.head.clone();
    loc.forwardDirection = loc.forwardDirection ? 0 : 1;
    for (let i = 0; i < t.carriageCnt; ++i) {
      const c = t.carriages[i];
      c.dstEntranceIdx = u8(dstEntranceIdx);

      const moveStep = i16(Math.trunc(trainGlyph(c.type, 0, 0).width / 2) + 4);
      moveAlongPath(loc, moveStep);
      c.location.set(loc);
      c.location.forwardDirection = c.location.forwardDirection ? 0 : 1;
      setEmptyRectangle(c.rect);
      moveAlongPath(loc, moveStep);
    }
    t.tail.set(loc);
    t.tail.forwardDirection = t.tail.forwardDirection ? 0 : 1;

    t.needToRedraw = true;
    t.headCarriageIdx = 0;
    t.year = G.headers[HeaderFieldId.Year].value;
    t.lastMovementTime = i16(G.m.getTime());
  }
}

/* 16a6:08bb */
export function tryRunWaitingTrains(): void {
  for (let i = G.entranceCount - 1; i >= 0; --i) {
    const e = G.entrances[i];
    if (e.waitingTrainsCount && entranceIsFree(i)) {
      const train = spawnTrain(i);
      if (train) {
        e.waitingTrainsCount = u8(e.waitingTrainsCount - 1);
        if (!e.waitingTrainsCount) drawDispatcher(i, false);
      }
    }
  }
}

/* 1a65:0073 */
export function* spawnNewTrain(): Blocking {
  const entranceIdx = G.rng.genRandomNumber(G.entranceCount);
  if (G.entranceCount < 2) return;

  if (entranceIsFree(entranceIdx)) {
    const train = spawnTrain(entranceIdx);
    if (train) {
      const level = u16(G.headers[HeaderFieldId.Level].value);
      if (level >= 6 && level * 200 > u16(G.rng.rand())) {
        // create an unmanaged blinking train
        for (let i = 0; i < train.carriageCnt; ++i) train.carriages[i].dstEntranceIdx = BLINKING_TRAIN_ENTRANCE_IDX;
      }
      return;
    }
    showStatusMessage('Railnet OVERFLOWED. New train waits outside');
  }
  yield* addWaitingTrain(entranceIdx);
}

/* 1a65:0030 */
export function* taskSpawnTrains(): TaskGen {
  for (;;) {
    const period = u16(getTrainSpawnInterval());

    if (!noTrainsExist()) yield G.m.sleep(u16(G.rng.genRandomNumber(i16(Math.trunc(period / 2))) + 1));

    yield* spawnNewTrain();
    yield G.m.sleep(u16(G.rng.genRandomNumber(i16(Math.trunc(period / 2))) + 1));
  }
}

/* 1a65:0256 */
export function spawnServer(entranceIdx: number): Train | null {
  const train = allocateTrainSlot();
  if (train && !cancellable(train, () => placeServer(train, entranceIdx))) return null;
  return train;
}

function placeServer(train: Train, entranceIdx: number): void {
  {
    const entrance = G.entrances[entranceIdx];

    train.carriageCnt = 1;
    train.maxSpeed = trainSpecification(0).maxSpeed;
    train.speed = train.maxSpeed;
    const c0 = train.carriages[0];
    c0.type = CarriageType.Server;

    train.head.forwardDirection = 1;
    train.head.rail = entrance.rail;
    train.head.pathStep = 0;

    c0.dstEntranceIdx = SERVER_ENTRANCE_IDX;
    c0.location.set(train.head);

    const step = i16(Math.trunc(trainGlyph(0, 0, 0).width / 2) + 4);
    moveAlongPath(c0.location, step);

    const loc = c0.location.clone();
    moveAlongPath(loc, step);
    train.tail.set(loc);

    setEmptyRectangle(c0.rect);

    train.head.forwardDirection = 0;
    train.tail.forwardDirection = 0;
    c0.location.forwardDirection = 0;

    moveAlongPath(train.head, 60);
    moveAlongPath(train.tail, 60);
    moveAlongPath(c0.location, 60);

    train.year = G.headers[HeaderFieldId.Year].value;
    train.lastMovementTime = i16(G.m.getTime());
    train.needToRedraw = true;

    c0.direction = entrance.rail.x > 320 ? 1 : 0;
    c0.x_direction = 0;
    train.headCarriageIdx = 0;
  }
}

/* 16a6:06e0 */
export function accelerateTrains(count: number): void {
  for (let i = 0; i < count; ++i) {
    G.lastProcessedTrain = u8((G.lastProcessedTrain + 1) % G.trains.length);

    const train = G.trains[G.lastProcessedTrain];
    if (!train.isFreeSlot) {
      const c = u8(G.lastProcessedCarriages[G.lastProcessedTrain] + 1);
      G.lastProcessedCarriages[G.lastProcessedTrain] = c;
      if (c % train.carriageCnt === 0 && train.speed < train.maxSpeed) train.speed = u8(train.speed + 1);
    }
  }
}

/* 16a6:0893 */
export function waitingTrainsCount(): number {
  let res = 0;
  for (let i = 0; i < G.entranceCount; ++i) res = i16(res + G.entrances[i].waitingTrainsCount);
  return res;
}
