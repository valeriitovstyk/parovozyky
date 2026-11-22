// Classic renderer vs the oracle: screenshots of the emulated VGA memory of the
// port must be pixel-identical to the oracle's (RESL_SCREENSHOT_EVERY) at the
// same frames. Needs the native oracle (`pnpm oracle:build`); skipped otherwise.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryFileStore, createSim } from '../../packages/sim/src/index';
import { buildFiles } from '../../tools/scenario/files.mjs';
import { ORACLE, runScenario } from '../../tools/oracle/scenario.mjs';
import { encodePngRgb } from './png';

const ROOT = resolve(__dirname, '../..');
const OUT = join(ROOT, '.build/screens');
const SHOT_EVERY = 500_000;

interface Scenario {
  name: string;
  seed: number;
  playerName?: string;
  stopAtUs: number;
  files?: Record<string, unknown>;
  input: [number, 'key' | 'mouse', ...number[]][];
}

function load(name: string, stopAtUs?: number): Scenario {
  const sc = JSON.parse(readFileSync(join(ROOT, 'tests/golden/scenarios', `${name}.json`), 'utf8')) as Scenario;
  if (stopAtUs) sc.stopAtUs = stopAtUs;
  return sc;
}

function portShots(sc: Scenario): Map<number, Uint32Array> {
  const shots = new Map<number, Uint32Array>();
  let next = 0;
  const sim = createSim({
    seed: sc.seed,
    files: new MemoryFileStore(buildFiles(sc, join(ROOT, 'reference/reSL/resources'))),
    playerName: sc.playerName,
    stopAtUs: sc.stopAtUs,
    video: true,
    onFrame: (t) => {
      if (t < next) return;
      const px = new Uint32Array(640 * 350);
      sim.renderScreen(px);
      shots.set(t, px);
      while (next <= t) next += SHOT_EVERY;
    },
  });
  for (const [t, kind, a, b, c, d] of sc.input)
    sim.pushInput(kind === 'key' ? { t, type: 'key', scancode: a, down: b !== 0 } : { t, type: 'mouse', flags: a, buttons: b, x: c, y: d });
  sim.advanceTo(Number.MAX_SAFE_INTEGER);
  return shots;
}

function readPpm(path: string): Uint32Array {
  const data = readFileSync(path);
  // "P6\n640 350\n255\n"
  let p = 0;
  for (let nl = 0; nl < 3; ++p) if (data[p] === 10) ++nl;
  const px = new Uint32Array(640 * 350);
  for (let i = 0; i < px.length; ++i) px[i] = (0xff000000 | (data[p + i * 3] << 16) | (data[p + i * 3 + 1] << 8) | data[p + i * 3 + 2]) >>> 0;
  return px;
}

async function oracleShots(sc: Scenario): Promise<Map<number, Uint32Array>> {
  const { dir } = await runScenario({ ...sc, dumpEveryUs: 0 } as never, { keepDir: true, screenshotEveryUs: SHOT_EVERY });
  const shots = new Map<number, Uint32Array>();
  for (const f of readdirSync(dir)) {
    const m = f.match(/^\.trace\.(\d+)\.ppm$/);
    if (m) shots.set(Number(m[1]), readPpm(join(dir, f)));
  }
  return shots;
}

function savePng(name: string, px: Uint32Array) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), encodePngRgb(px, 640, 350));
}

const CASES: [string, number | undefined][] = [
  ['demo-a-s1', undefined],
  ['demo-k-s2', undefined],
  ['archive-extra', undefined],
  ['year2000-x3', 100_000_000],
  ['bot-01-l6', 240_000_000],
  ['bot-05-l12-edges', 240_000_000],
];

describe.skipIf(!existsSync(ORACLE))('classic renderer = oracle screenshots', () => {
  for (const [name, stop] of CASES) {
    it(name, async () => {
      const sc = load(name, stop);
      const expected = await oracleShots(sc);
      const actual = portShots(sc);
      expect([...actual.keys()]).toEqual([...expected.keys()].sort((a, b) => a - b));
      for (const [t, exp] of [...expected].sort((a, b) => a[0] - b[0])) {
        const act = actual.get(t)!;
        let diff = 0;
        for (let i = 0; i < exp.length; ++i) if (exp[i] !== act[i]) ++diff;
        if (diff) {
          savePng(`${name}.${t}.oracle.png`, exp);
          savePng(`${name}.${t}.port.png`, act);
        }
        expect(diff, `${name}: ${diff} pixels differ at t=${t} (see .build/screens)`).toBe(0);
      }
    }, 300_000);
  }
});
