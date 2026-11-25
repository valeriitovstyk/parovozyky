// A whole level in the browser with the 3D view: a demo network in 1801 with
// $9,000,000, played at x3 by the dispatcher (tests/player.ts) until the next
// level begins. Every second of game time a frame is drawn and checked; every
// 20 years a screenshot is attached to the report (pnpm level).
import { expect, test } from '@playwright/test';
import { makePlayer } from '../player';
import { advance, advanceUntil, key, probe, start } from './helpers';

// LEVEL_DEMO=demo_l, a comma list, or "all" (the 20 demo networks; --workers N)
const ALL = 'abcdefghijklmnopqrst'.split('').map((c) => `demo_${c}`);
const env = process.env.LEVEL_DEMO ?? 'demo_f';
const DEMOS = env === 'all' ? ALL : env.split(',');

interface Chunk {
  year: number;
  level: number;
  screen: string;
  halted: string | null;
  problems: string[];
  frames: number;
  maxGeometries: number;
  maxTextures: number;
  finished: number;
}

test.setTimeout(30 * 60_000);

for (const DEMO of DEMOS)
  test(`a whole level in 3D (${DEMO})`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));

    await start(page);
    // the save "aaaaaaaa.aa_": the demo network, money 9000, year 1801
    await page.evaluate((demo) => {
      const files = window.__parovozyky!.game()!.files;
      const data = files.read(demo)!.slice();
      const v = new DataView(data.buffer);
      v.setUint16(24 + 18 + 8, 9000, true);
      v.setUint16(24 + 36 + 8, 1801, true);
      files.write('aaaaaaaa.aa_', data);
    }, DEMO);
    await key(page, 'a', 2);
    await key(page, 'g', 0.5);
    await advanceUntil(page, (p) => p.screen === 'game' && p.dialog < 0, 15);
    await key(page, '3');
    const start0 = await probe(page);
    expect(start0.year).toBe(1801);

    await page.evaluate(`window.__makePlayer = ${makePlayer.toString()}`);
    await page.evaluate(() => {
      const w = window as unknown as { __player: unknown; __makePlayer: (w: unknown) => unknown };
      w.__player = w.__makePlayer(window.__parovozyky!.game()!.sim.world);
    });

    const [level, finished0] = await page.evaluate(() => {
      const h = window.__parovozyky!.game()!.sim.world.headers;
      return [h[3].value, h[0].value];
    });
    const shots = new Set<number>();
    let last: Chunk | null = null;
    let maxGeo = 0;
    let firstGeo = 0;
    for (let i = 0; i < 120; ++i) {
      // 15 s of game time per call: 60 steps of 250 ms, a checked frame every 1 s
      last = await page.evaluate((): Chunk => {
        const api = window.__parovozyky!;
        const game = api.game()!;
        const sim = game.sim;
        const w = sim.world;
        const player = (window as unknown as { __player: { act(): { x: number; y: number; right?: boolean }[] } }).__player;
        const r = api.renderer()!;
        const problems: string[] = [];
        let frames = 0;
        let maxGeometries = 0;
        let maxTextures = 0;
        const click = (t: number, x: number, y: number, right?: boolean) => {
          sim.pushInput({ t, type: 'mouse', flags: 1, buttons: 0, x, y });
          sim.pushInput({ t: t + 20_000, type: 'mouse', flags: right ? 8 : 2, buttons: right ? 2 : 1, x, y });
          sim.pushInput({ t: t + 40_000, type: 'mouse', flags: right ? 16 : 4, buttons: 0, x, y });
        };
        for (let s = 0; s < 60 && !sim.halted; ++s) {
          let dt = 1000;
          for (const c of player.act()) {
            click(game.target + dt, c.x, c.y, c.right);
            dt += 60_000;
          }
          const render = s % 4 === 3;
          for (let k = 0; k < 15; ++k) api.step(16_667, render && k === 14);
          if (!render || w.video.screen !== 'game' || w.video.dialog >= 0) continue;
          ++frames;
          const st = r.inspect();
          maxGeometries = Math.max(maxGeometries, st.geometries);
          maxTextures = Math.max(maxTextures, st.textures);
          let onField = 0;
          let all = 0;
          for (const t of w.trains) {
            if (t.isFreeSlot) continue;
            for (let c = 0; c < t.carriageCnt; ++c) {
              const rail = t.carriages[c].location.rail;
              if (!rail || rail.id <= 1) continue;
              ++all;
              if (rail.type !== 6) ++onField;
            }
          }
          const when = `${w.headers[2].value}`;
          if (st.badTransforms) problems.push(`${when}: ${st.badTransforms} objects with NaN transforms`);
          if (st.glError) problems.push(`${when}: WebGL error ${st.glError}`);
          if (st.carriages !== all) problems.push(`${when}: ${st.carriages} carriage models for ${all} carriages`);
          if (st.visibleCarriages !== onField) problems.push(`${when}: ${st.visibleCarriages} visible carriages for ${onField} on the field`);
          if (!st.drawCalls) problems.push(`${when}: nothing drawn`);
          const field = document.getElementById('field')!;
          if (getComputedStyle(field).visibility !== 'visible') problems.push(`${when}: the HUD is hidden`);
        }
        return {
          year: w.headers[2].value,
          level: w.headers[3].value,
          screen: w.video.screen,
          halted: sim.halted ? `${sim.halted.reason} ${sim.halted.detail}` : null,
          problems: problems.slice(0, 5),
          frames,
          maxGeometries,
          maxTextures,
          finished: w.headers[0].value,
        };
      });
      expect(last.halted, `halted in ${last.year}`).toBeNull();
      expect(last.problems, `in ${last.year}`).toEqual([]);
      expect(errors, `console errors by ${last.year}`).toEqual([]);
      if (!firstGeo) firstGeo = last.maxGeometries;
      maxGeo = Math.max(maxGeo, last.maxGeometries);
      // a picture every 20 years (and the first one in the next level)
      const decade = last.level > level ? 9999 : Math.floor(last.year / 20) * 20;
      if (!shots.has(decade) && last.screen === 'game') {
        shots.add(decade);
        await advance(page, 0.05);
        await info.attach(`${decade === 9999 ? 'next-level' : decade}.png`, { body: await page.screenshot(), contentType: 'image/png' });
      }
      if (last.level > level) break;
    }
    expect(last!.level, `the level did not end: ${JSON.stringify(last)}`).toBe(level + 1);
    expect(last!.year).toBeLessThan(1805);
    // no leak of GPU resources over the level (houses, trains, smoke come and go)
    expect(maxGeo).toBeLessThan(firstGeo * 2 + 200);
    console.log(`${DEMO}: level ${level} -> ${last!.level}, ${last!.finished - finished0} trains, geometries ${firstGeo}..${maxGeo}`);
  });
