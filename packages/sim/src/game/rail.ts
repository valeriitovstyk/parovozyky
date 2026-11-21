// game/rail.cpp
import type { Blocking } from '../core/scheduler';
import { i16, u16, u8 } from '../core/ints';
import { G } from './globals';
import { playRailDamagedMelody } from './melody';
import { entranceRail, railConnectionBias, railConnectionRule, railTypeMeta } from './res';
import { configChunkStepsForSwitch, updateSwitchPosition } from './switch';
import { allocateTrainSlot } from './train';
import {
  CRASHED_TRAIN_ENTRANCE_IDX,
  CarriageType,
  DISABLED_SWITCH_PATH,
  HeaderFieldId,
  NORMAL_ENTRANCE_COUNT,
  type Rail,
  RailConnection,
  type RailInfo,
  setEmptyRectangle,
} from './types';

/* 262d:6ef4 : 4 bytes */
export const emptyRailConnection = new RailConnection(null, 0);

/* 1ad3:000c */
export function connectRail(r: RailInfo): void {
  if (!(r.tileX < 11 && r.tileY < 11 && r.railType < 6)) throw new Error('connectRail: bad RailInfo');
  const rail = G.rail(r.tileX, r.tileY, r.railType);
  G.setMask(r.tileX, r.tileY, G.mask(r.tileX, r.tileY) | (1 << r.railType));

  for (let i = 0; i < 6; ++i) {
    const ri = railConnectionRule(r.railType, i);
    const tileX = i16(r.tileX + ri.tileDX);
    const tileY = i16(r.tileY + ri.tileDY);
    if (!(G.mask(tileX, tileY) & (1 << ri.railType))) continue;

    const rail2 = G.rail(tileX, tileY, ri.railType);
    const rc1 = rail.connections[ri.slot1];
    const rc2 = rail2.connections[ri.slot2];
    if (!rc2.rail) {
      if (!rc1.rail) {
        // no adjacent roads
        rc1.rail = rail2;
        rc1.slot = ri.slot2;
        rc2.rail = rail;
        rc2.slot = ri.slot1;
      } else if (rc1.rail !== DISABLED_SWITCH_PATH) {
        const s = G.switches[G.nSwitches];
        G.nSwitches = u16(G.nSwitches + 1);
        s.adjacentSwitchIdx = -1;
        s.exit.rail = rail;
        s.exit.slot = ri.slot1;
        s.disabledPath.rail = rail2;
        s.disabledPath.slot = ri.slot2;
        s.entry.set(rc1);
        updateSwitchPosition(s);
        configChunkStepsForSwitch(s.disabledPath.clone());
      }
    } else if (rc2.rail !== DISABLED_SWITCH_PATH) {
      const sIdx = G.nSwitches;
      const s = G.switches[sIdx];
      G.nSwitches = u16(G.nSwitches + 1);
      s.adjacentSwitchIdx = -1;
      s.exit.rail = rail2;
      s.exit.slot = ri.slot2;
      s.disabledPath.rail = rail;
      s.disabledPath.slot = ri.slot1;
      s.entry.set(rc2);
      updateSwitchPosition(s);
      configChunkStepsForSwitch(s.disabledPath.clone());

      for (let s2Idx = 0; s2Idx < sIdx; ++s2Idx) {
        const s2 = G.switches[s2Idx];
        // Handle X-shaped crossings: switches are connected each other directly.
        if (s2.entry.rail === rail2 && s2.entry.slot === ri.slot2) {
          s.adjacentSwitchIdx = s2Idx;
          s2.adjacentSwitchIdx = sIdx;
          break;
        }
      }
    }
  }
}

/* 19de:0426 */
export function roadMaskInTile(tileX: number, tileY: number): number {
  let tileMask = 0;
  let curBit = 1;
  for (const rtm of railTypeMeta) {
    const m = G.mask(tileX + rtm.tileOffsetX, tileY + rtm.tileOffsetY);
    if ((1 << rtm.railType) & m) tileMask |= curBit;
    curBit = u16(curBit << 1);
  }
  return u16(tileMask);
}

function hasTripleSwitch(mask: number): boolean {
  const tripleMask = 7; // triple switch mask: 0b111
  return (
    (mask & tripleMask) === tripleMask ||
    (mask & (tripleMask << 3)) === tripleMask << 3 ||
    (mask & (tripleMask << 6)) === tripleMask << 6 ||
    (mask & (tripleMask << 9)) === tripleMask << 9
  );
}

/* 19de:04a9 */
export function checkRailWouldConflict(tileX: number, tileY: number, railType: number): boolean {
  let result = false;
  const origMask = G.mask(tileX, tileY);
  G.setMask(tileX, tileY, origMask | (1 << railType));

  // We also have to check that there are no conflicts with entrances that
  // have not yet been built. Temporary mark the rails of all entrances as built.
  const origEntranceRailMasks: number[] = new Array(NORMAL_ENTRANCE_COUNT).fill(0);
  for (let i = G.entranceCount; i < NORMAL_ENTRANCE_COUNT; ++i) {
    const ri = entranceRail(G.entrances[i].entranceRailInfoIdx);
    origEntranceRailMasks[i] = G.mask(ri.tileX, ri.tileY);
    G.setMask(ri.tileX, ri.tileY, G.mask(ri.tileX, ri.tileY) | (1 << ri.railType));
  }

  for (let side = 0; side < 2; ++side) {
    const rc = railConnectionBias(railType, side);
    const mask = roadMaskInTile(tileX + rc.tileOffsetX, tileY + rc.tileOffsetY);
    if (hasTripleSwitch(mask)) {
      result = true;
      break;
    }
  }

  // restore the railroad state
  for (let i = G.entranceCount; i < NORMAL_ENTRANCE_COUNT; ++i) {
    const ri = entranceRail(G.entrances[i].entranceRailInfoIdx);
    G.setMask(ri.tileX, ri.tileY, origEntranceRailMasks[i]);
  }
  G.setMask(tileX, tileY, origMask);
  return result;
}

/* 19de:06a0 */
export function checkRailWouldConflictWithExistingRoad(tileX: number, tileY: number, railType: number): boolean {
  let result = false;
  const origMask = G.mask(tileX, tileY);
  G.setMask(tileX, tileY, origMask | (1 << railType));
  for (let side = 0; side < 2; ++side) {
    const rc = railConnectionBias(railType, side);
    const mask = roadMaskInTile(tileX + rc.tileOffsetX, tileY + rc.tileOffsetY);
    if (hasTripleSwitch(mask)) {
      result = true;
      break;
    }
  }
  G.setMask(tileX, tileY, origMask);
  return result;
}

/** index of a rail in g_rails (pointer arithmetic `&r - &g_rails[0][0][0]`) */
export function railIndex(r: Rail): number {
  return r.id - 2;
}

/* 146b:03c7 */
export function isVisible(r: Rail): boolean {
  const rc = railConnectionBias(r.type, 0);
  const chunkIdx = i16(railIndex(r));
  const nElementsPerCol = 6;
  const nElementsPerRow = 11 * nElementsPerCol;
  const x = Math.trunc(chunkIdx / nElementsPerRow) + rc.tileOffsetX;
  const y = Math.trunc((chunkIdx % nElementsPerRow) / nElementsPerCol) + rc.tileOffsetY;
  const xPixPos = i16((x - y) * 88 + 320);
  return xPixPos > 0 && xPixPos < 640;
}

/* 19de:07d7 */
function railHasNoTrain(rail: Rail): boolean {
  for (const train of G.trains) {
    if (train.isFreeSlot || train.carriages[0].type === CarriageType.CrashedTrain) continue;
    if (train.head.rail === rail || train.tail.rail === rail) return false;
    for (let i = 0; i < train.carriageCnt; ++i) {
      if (train.carriages[i].location.rail === rail) return false;
    }
  }
  return true;
}

/* 16a6:0771 */
export function* randomRailDamage(): Blocking {
  const roadIdx = G.rng.genRandomNumber(i16(G.railRoadCount));
  const ri = G.railRoad[roadIdx];
  const rail = G.rail(ri.tileX, ri.tileY, ri.railType);

  if (!railHasNoTrain(rail)) return;

  const t = allocateTrainSlot();
  if (!t) return;

  const pathSize = G.pathSize(ri.railType);
  t.carriageCnt = 1;
  const c = t.carriages[0];
  c.dstEntranceIdx = CRASHED_TRAIN_ENTRANCE_IDX;
  c.type = CarriageType.CrashedTrain;
  c.location.rail = rail;
  c.location.pathStep = u8(Math.trunc(pathSize / 2) + G.rng.symmetricRand(i16(Math.trunc(pathSize / 8))));
  t.tail.set(c.location);
  t.head.set(c.location);
  setEmptyRectangle(c.rect);
  t.needToRedraw = true;
  t.year = G.headers[HeaderFieldId.Year].value;
  yield* playRailDamagedMelody();
}
