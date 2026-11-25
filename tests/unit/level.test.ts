// A whole level (1801 -> 2000 and on to the next level) on every demo network,
// played by the dispatcher (tests/player.ts) at x3. Checks the world stays
// consistent all the way: trains on valid rails, no halts, the level ends.
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryFileStore, createSim, type Sim } from '../../packages/sim/src/index';
import { DEMO_FILES, buildFiles } from '../../tools/scenario/files.mjs';
import { makePlayer } from '../player';

const RES = join(resolve(__dirname, '../..'), 'reference/reSL/resources');
const S = 1_000_000;
const KEY = { A: 30, G: 34, K3: 4 };

/** the save file "aaaaaaaa.aa_": a demo network with $9,000,000 in 1801 */
export function levelFiles(demo: string) {
  return buildFiles(
    {
      files: {
        ...Object.fromEntries(DEMO_FILES.map((d: string) => [d, { from: d }])),
        // header: 2+2+20 bytes, then 4 x 18-byte fields with the value at +8
        'aaaaaaaa.aa_': { from: demo, patch: [{ offset: 24 + 18 + 8, u16: 9000 }, { offset: 24 + 36 + 8, u16: 1801 }] },
      },
    },
    RES,
  );
}

function click(sim: Sim, t: number, x: number, y: number, right = false) {
  sim.pushInput({ t, type: 'mouse', flags: 1, buttons: 0, x, y });
  sim.pushInput({ t: t + 20_000, type: 'mouse', flags: right ? 8 : 2, buttons: right ? 2 : 1, x, y });
  sim.pushInput({ t: t + 40_000, type: 'mouse', flags: right ? 16 : 4, buttons: 0, x, y });
}

function key(sim: Sim, t: number, scancode: number) {
  sim.pushInput({ t, type: 'key', scancode, down: true });
  sim.pushInput({ t: t + 60_000, type: 'key', scancode, down: false });
}

/** the problems found in the world (empty when consistent) */
function inconsistencies(sim: Sim): string[] {
  const w = sim.world;
  const out: string[] = [];
  for (const t of w.trains) {
    if (t.isFreeSlot) continue;
    if (t.carriageCnt < 1 || t.carriageCnt > 5) out.push(`train ${t.idx}: ${t.carriageCnt} carriages`);
    for (const loc of [t.head, t.tail, ...t.carriages.slice(0, t.carriageCnt).map((c) => c.location)]) {
      if (!loc.rail || loc.rail.id <= 1) out.push(`train ${t.idx}: no rail`);
      else if (loc.pathStep >= w.pathSize(loc.rail.type)) out.push(`train ${t.idx}: step ${loc.pathStep} off rail type ${loc.rail.type}`);
    }
  }
  // a new world (the next level) starts without entrances
  if (w.entranceCount < 0 || w.entranceCount > 6) out.push(`${w.entranceCount} entrances`);
  return out;
}

function playLevel(demo: string) {
  const events: Record<string, number> = {};
  const sim = createSim({
    seed: 3,
    files: new MemoryFileStore(levelFiles(demo)),
    ubPolicy: 'recover',
    onEvent: (e) => void (events[e.type] = (events[e.type] ?? 0) + 1),
  });
  click(sim, 1 * S, 320, 175); // the loading screen
  key(sim, 4 * S, KEY.A); // Archive: the first save
  key(sim, 7 * S, KEY.G); // Go!
  key(sim, 9 * S, KEY.K3); // x3
  const w = sim.world;
  const player = makePlayer(w);
  let level = 0;
  let finished = -1;
  const problems: string[] = [];
  let levelUpAt = 0;
  for (let t = 10 * S; t < 2400 * S; t += 250_000) {
    sim.advanceTo(t);
    if (sim.halted) break;
    if (w.video.screen === 'game' && !level) {
      level = w.headers[3].value;
      finished = w.headers[0].value;
    }
    if (level) for (const p of inconsistencies(sim)) if (problems.length < 5) problems.push(`${(t / S).toFixed(1)} s: ${p}`);
    let dt = 1000;
    const acts = player.act();
    for (const c of acts) {
      click(sim, t + dt, c.x, c.y, c.right);
      dt += 60_000;
    }
    if (level && !levelUpAt && w.headers[3].value === level + 1) levelUpAt = t;
    // a few seconds of the next level
    if (levelUpAt && t > levelUpAt + 20 * S) break;
  }
  return {
    halted: sim.halted,
    level,
    nextLevel: w.headers[3].value,
    year: w.headers[2].value,
    screen: w.video.screen,
    levelUpAt: levelUpAt / S,
    finished: w.headers[0].value - finished,
    problems,
    events,
    clicks: player.stats,
  };
}

describe('a whole level played by the dispatcher', () => {
  const finished: number[] = [];

  it.each(DEMO_FILES as string[])('%s', (demo) => {
    const r = playLevel(demo);
    finished.push(r.finished);
    expect(r.halted).toBeNull();
    expect(r.problems).toEqual([]);
    expect(r.level).toBeGreaterThan(0);
    // 1801 -> 2000 takes ~25 minutes of game time at x3
    expect(r.levelUpAt).toBeGreaterThan(1300);
    expect(r.nextLevel).toBe(r.level + 1);
    // the next level started over in 1800 (20 s ago)
    expect(r.year).toBeGreaterThanOrEqual(1800);
    expect(r.year).toBeLessThan(1805);
    expect(r.screen).toBe('game');
    expect(r.clicks.switches).toBeGreaterThan(0);
  });

  it('really plays: trains reach their entrances', () => {
    expect(finished.length).toBe(DEMO_FILES.length);
    // ~240 trains on the 20 networks; a dense level-11 network may get only one through
    expect(finished.reduce((a, b) => a + b, 0)).toBeGreaterThan(150);
    expect(finished.filter((n) => n >= 3).length).toBeGreaterThanOrEqual(18);
  });
});
