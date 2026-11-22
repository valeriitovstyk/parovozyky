// game/entrance.cpp
import { i16 } from '../core/ints';
import type { Blocking } from '../core/scheduler';
import { clampRectToGameFieldBoundaries, drawFieldBackground, eraseImpasse, redrawScreenArea, scheduleRailRedrawing } from './drawing';
import { G } from './globals';
import { playScheduledTrainMelody, playSpawnedEntranceMelody } from './melody';
import { connectRail } from './rail';
import { eraseSemaphore, updateSemaphores } from './semaphore';
import { destroyStaticObjectsForRailConstruction } from './staticObject';
import { CarriageType, type Entrance, type RailInfo } from './types';
import { drawDispatcher } from '../ui/drawHeader';

/* 17bf:03ba */
export function* spawnNewEntrance(riIn: RailInfo): Blocking {
  const ri = riIn.clone(); // passed by value
  const r = G.rail(ri.tileX, ri.tileY, ri.railType);
  scheduleRailRedrawing(r);
  destroyStaticObjectsForRailConstruction(r);
  clampRectToGameFieldBoundaries(G.areaToRedraw);
  eraseImpasse(r, 350);
  connectRail(ri);
  G.railRoad[G.railRoadCount].copyFrom(ri);
  G.railRoadCount = (G.railRoadCount + 1) & 0xffff;
  updateSemaphores(ri);
  for (let i = 0; i < G.erasedSemaphoreCount; ++i) eraseSemaphore(G.erasedSemaphores[i], 350);
  drawFieldBackground(350);
  yield* redrawScreenArea();
  yield* playSpawnedEntranceMelody();
  drawDispatcher(G.entranceCount, false);
  G.entranceCount = i16(G.entranceCount + 1);
}

/* 19de:028b */
export function findClosestEntrance(x: number, y: number): Entrance | null {
  let result: Entrance | null = null;
  let bestDistance = 200;
  for (let i = 0; i < G.entranceCount; ++i) {
    const entrance = G.entrances[i];
    const dx = i16(Math.abs(x - entrance.rail.x));
    const dy = i16(Math.abs(y - entrance.rail.y));
    const dist = i16(dx + dy * 4);
    if (dist < bestDistance) {
      bestDistance = dist;
      result = entrance;
    }
  }
  return result;
}

/* 1a65:039d */
export function entranceIsFree(entranceIdx: number): boolean {
  const entrance = G.entrances[entranceIdx];
  for (const train of G.trains) {
    if (train.isFreeSlot || train.carriages[0].type === CarriageType.CrashedTrain) continue;
    if (
      train.head.rail === entrance.rail ||
      train.head.rail === entrance.rail.connections[0].rail ||
      train.tail.rail === entrance.rail ||
      train.tail.rail === entrance.rail.connections[0].rail
    )
      return false;
  }
  return true;
}

/* 1a65:0528 */
export function* addWaitingTrain(entranceIdx: number): Blocking {
  const e = G.entrances[entranceIdx];
  e.waitingTrainsCount = (e.waitingTrainsCount + 1) & 0xff;
  if (e.waitingTrainsCount === 1) {
    yield* playScheduledTrainMelody(200, 800, 6);
    drawDispatcher(entranceIdx, true);
  }
}
