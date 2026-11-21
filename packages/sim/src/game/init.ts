// game/init.cpp
import { i16, u8 } from '../core/ints';
import { G, pathStep } from './globals';
import { taskHeaderFieldAnimation } from './header';
import { taskMoveAndRedrawTrains } from './moveTrains';
import { isVisible } from './rail';
import { emptyRailConnection } from './rail';
import { entranceRail, entranceRails, railConnectionBias } from './res';
import { taskRoadConstruction } from './roadConstruction';
import { initTrains, resetCarriages } from './train';
import { Color, INNER_ENTRANCE_RAIL_TYPE, NORMAL_ENTRANCE_COUNT, type StaticObject, StaticObjectKind } from './types';

/* 146b:000c */
export function resetGameData(): void {
  G.railRoadCount = 0;
  G.nSwitches = 0;
  G.semaphoreCount = 0;
  G.entranceCount = 0;
  for (let x = 0; x < 11; ++x) {
    for (let y = 0; y < 11; ++y) {
      G.setMask(x, y, 0);
      for (let type = 0; type < 6; ++type) {
        const r = G.rail(x, y, type);
        r.connections[0].set(emptyRailConnection);
        r.connections[1].set(emptyRailConnection);
        r.minPathStep = 0;
        r.maxPathStep = u8(G.pathSize(type) - 1);
        r.semSlotIdByDirection[0] = -1;
        r.semSlotIdByDirection[1] = -1;
        r.semSlotIdByDirection[2] = -1;
      }
    }
  }
  resetCarriages();
}

/* 146b:00cc */
export function initGameData(): void {
  for (let x = 0; x < 11; ++x) {
    for (let y = 0; y < 11; ++y) {
      for (let type = 0; type < 6; ++type) {
        const r = G.rail(x, y, type);
        r.type = type;
        r.x = i16((x - y) * 88 + 320);
        r.y = i16((x + y) * 21 - 22);
      }
    }
  }
  initTrains();
}

/* 1530:04f5 */
function validateHousePosition(houseIdx: number, i: number): boolean {
  const house = G.staticObjects[houseIdx];
  const x = i16(house.x + 8);
  // Houses can only be placed at the edge of the screen: [0; 50] and [590; 640]
  if ((x < 0 || x > 50) && (x < 590 || x > 640)) return false;
  // Houses can't be located too close to each other
  for (let house2Idx = houseIdx - 1; i > 0; --i, --house2Idx) {
    const house2 = G.staticObjects[house2Idx];
    const dy = i16(Math.abs(house.y - house2.y));
    const dx = i16(Math.abs(house.x - house2.x));
    if (dy < 10 && dx < 10) return false;
  }
  return true;
}

/* 1530:0351 */
function generateEntranceHouses(entranceIdx: number): void {
  const housesPerEntrance = 5;
  const rng = G.rng;
  const ri = entranceRail(G.entrances[entranceIdx].entranceRailInfoIdx);
  for (let i = 0; i < housesPerEntrance; ++i) {
    const objIdx = i + entranceIdx * housesPerEntrance;
    const obj = G.staticObjects[objIdx];
    obj.kind = StaticObjectKind.BuildingHouse;
    obj.type = u8(rng.genRandomNumber(4) + 1);
    obj.color = G.entrances[entranceIdx].bgColor;
    if (entranceIdx === 0 || entranceIdx === 1) obj.creationYear = 0;
    else obj.creationYear = u8((entranceIdx - 2) * 40 + i * 8 + 5);
    do {
      const stepIdx = rng.genRandomNumber(G.pathSize(ri.railType));
      const step = pathStep(ri.railType, stepIdx);
      obj.x = i16((ri.tileX - ri.tileY) * 88 + step.dx + 320);
      obj.y = i16((ri.tileX + ri.tileY) * 21 + step.dy - 22);
      const rnd = rng.genRandomNumber(4);
      obj.y = i16(obj.y + (rng.rand() & 1 ? -23 - rnd : 5 + rnd));
    } while (!validateHousePosition(objIdx, i));
  }
}

/* 146b:01a7 */
function generateEntrances(): void {
  const rng = G.rng;
  for (let i = 0; i < NORMAL_ENTRANCE_COUNT; ++i) {
    const entrance = G.entrances[i];
    // BUGFIX (reSL): reset waitingTrainsCount, otherwise the game may freeze
    entrance.waitingTrainsCount = 0;
    let suits = false;
    while (!suits) {
      const r1Idx = rng.genRandomNumber(entranceRails.length);
      entrance.entranceRailInfoIdx = u8(r1Idx);
      const ri1 = entranceRail(entrance.entranceRailInfoIdx);
      suits = true;
      for (let j = 0; j < i; ++j) {
        const r2Idx = G.entrances[j].entranceRailInfoIdx;
        const ri2 = entranceRail(r2Idx);
        if (i === 1) {
          if (Math.abs(r1Idx - r2Idx) < 23) {
            suits = false;
            break;
          }
        } else {
          const y1 = i16((ri1.tileX - ri1.tileY) * 88 + 320);
          const y2 = i16((ri2.tileX - ri2.tileY) * 88 + 320);
          const distY = i16(Math.abs(y1 - y2));
          if (distY < 320 && Math.abs(r1Idx - r2Idx) < 10) {
            suits = false;
            break;
          }
        }
      }
    }
    const ri = entranceRail(entrance.entranceRailInfoIdx);
    const rail = G.rail(ri.tileX, ri.tileY, ri.railType);
    const visible = isVisible(rail) ? 1 : 0;
    const entranceRailObj = entrance.rail;
    rail.connections[visible].rail = entranceRailObj;
    entranceRailObj.connections[0].slot = visible;
    entranceRailObj.connections[0].rail = rail;
    entranceRailObj.maxPathStep = u8(G.pathSize(INNER_ENTRANCE_RAIL_TYPE) - 1);
    entranceRailObj.type = INNER_ENTRANCE_RAIL_TYPE;
    const rcb = railConnectionBias(rail.type, visible);
    const tileX = ri.tileX + rcb.tileOffsetX;
    const tileY = ri.tileY + rcb.tileOffsetY;
    entranceRailObj.x = i16((tileX - tileY) * 88 + 320);
    entranceRailObj.y = i16((tileX + tileY) * 21 - 22);
    generateEntranceHouses(i);
  }
}

/* 1530:010f */
function isInsideField(x: number, y: number): boolean {
  return y > 47 && y + 16 < 334 && x + 8 >= 0 && x + 8 < 640;
}

/* 1530:001f */
function generateForest(): void {
  const rng = G.rng;
  let x = rng.genRandomNumber(624);
  let y = rng.genRandomNumber(270) + 48;
  for (let i = 30; i < G.staticObjects.length; ++i) {
    const obj = G.staticObjects[i];
    obj.kind = StaticObjectKind.Tree;
    obj.type = u8(rng.genRandomNumber(4));
    obj.x = i16(x);
    obj.y = i16(y);
    obj.color = rng.rand() & 1 ? Color.Brown : Color.DarkGreen;
    x = i16(x + rng.symmetricRand(25));
    y = i16(y + Math.trunc(rng.symmetricRand(25) / 4));
    if ((rng.rand() & 0xffff) < 2600 || !isInsideField(x, y)) {
      x = rng.genRandomNumber(624);
      y = rng.genRandomNumber(271) + 47;
    }
  }
  // docs/fidelity.md D3: a stable sort by Y instead of qsort with an
  // inconsistent comparator (oracle patch P8)
  const sorted = G.staticObjects.map((o) => snapshot(o)).sort((a, b) => a.y - b.y);
  sorted.forEach((o, i) => G.staticObjects[i].copyFrom(o));
}

function snapshot(o: StaticObject): StaticObject {
  const c = Object.create(Object.getPrototypeOf(o)) as StaticObject;
  Object.assign(c, o);
  return c;
}

/* 16a6:0963 */
export function createNewWorld(): void {
  resetGameData();
  generateEntrances();
  generateForest();
}

/* 16a6:0973 */
export function resetTasks(): void {
  // The original game uses different coroutine implementation, but the
  // common algorithm is the same: clear message queues, restart all tasks
  const s = G.m.sched;
  G.railConstructionMsgQueue.clear();
  s.stopTask(G.taskRoadConstruction);
  G.taskRoadConstruction = G.m.addTask(taskRoadConstruction(), 'taskRoadConstruction');
  G.headerAnimationTaskQueue.clear();
  s.stopTask(G.taskHeaderFieldAnimation);
  G.taskHeaderFieldAnimation = G.m.addTask(taskHeaderFieldAnimation(), 'taskHeaderFieldAnimation');
  s.stopTask(G.taskMoveAndRedrawTrains);
  G.taskMoveAndRedrawTrains = G.m.addTask(taskMoveAndRedrawTrains(), 'taskMoveAndRedrawTrains');
  G.mouseMsgQueue.clear();
}
