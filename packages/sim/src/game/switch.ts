// game/switch.cpp
import { i16 } from '../core/ints';
import { G } from './globals';
import { railConnectionBias, semaphoreGlyphBias } from './res';
import { DISABLED_SWITCH_PATH, type RailConnection, type Switch } from './types';

/* 19de:02ee */
export function updateSwitchPosition(s: Switch): void {
  const exitRail = s.exit.rail!;
  const rc = railConnectionBias(exitRail.type, s.exit.slot);
  const sb = semaphoreGlyphBias(exitRail.type, s.exit.slot);
  s.x = i16(exitRail.x + (rc.tileOffsetX - rc.tileOffsetY) * 88 + sb.dx);
  s.y = i16(exitRail.y + (rc.tileOffsetX + rc.tileOffsetY) * 21 + sb.dy);
}

/* 19de:00b6 */
export function configChunkStepsForSwitch(r: RailConnection): void {
  const rail = r.rail!;
  rail.connections[r.slot].rail = DISABLED_SWITCH_PATH;
  if (r.slot === 0) rail.minPathStep = 82;
  else rail.maxPathStep = (G.pathSize(rail.type) - 83) & 0xff;
}

/* 19de:00ec */
export function toggleSwitch(s: Switch): void {
  s.exit.rail!.connections[s.exit.slot].set(s.disabledPath);
  s.disabledPath.rail!.connections[s.disabledPath.slot].set(s.exit);

  configChunkStepsForSwitch(s.entry.clone());
  if (s.disabledPath.slot === 0) s.disabledPath.rail!.minPathStep = 0;
  else s.disabledPath.rail!.maxPathStep = (G.pathSize(s.disabledPath.rail!.type) - 1) & 0xff;

  // std::swap(s.entry, s.disabledPath)
  const tmp = s.entry.clone();
  s.entry.set(s.disabledPath);
  s.disabledPath.set(tmp);

  if (s.adjacentSwitchIdx !== -1) G.switches[s.adjacentSwitchIdx].exit.set(s.entry);
}

/* 19de:020b */
export function findClosestSwitch(x: number, y: number): Switch | null {
  let res: Switch | null = null;
  let bestDistance = 60;
  for (let i = G.nSwitches - 1; i >= 0; --i) {
    const s = G.switches[i];
    const dx = i16(Math.abs(i16(x - s.x)));
    const dy = i16(Math.abs(i16(y - s.y)));
    const dist = i16(dx + dy * 4);
    if (dist < bestDistance) {
      res = s;
      bestDistance = dist;
    }
  }
  return res;
}

/* 19de:0007 */
export function switchIsBusy(s: Switch): boolean {
  for (const t of G.trains) {
    if (t.isFreeSlot) continue;
    // switch is locked if a train occupies both parts of the switch
    let entryBusy = s.entry.rail === t.head.rail || s.entry.rail === t.tail.rail;
    let exitBusy = s.exit.rail === t.head.rail || s.exit.rail === t.tail.rail;
    for (let i = 0; i < t.carriageCnt; ++i) {
      const c = t.carriages[i];
      if (s.entry.rail === c.location.rail) entryBusy = true;
      if (s.exit.rail === c.location.rail) exitBusy = true;
      if (entryBusy && exitBusy) return true;
    }
  }
  return false;
}
