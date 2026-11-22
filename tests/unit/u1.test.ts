// docs/fidelity.md U1: a train spawned into a dead end. Reproduced by a bot
// playing without demo files (loadDemo() leaves a half-reset world behind).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryFileStore, createSim } from '../../packages/sim/src/index';
import { buildFiles } from '../../tools/scenario/files.mjs';

const ROOT = resolve(__dirname, '../..');

function run(policy: 'halt' | 'recover') {
  const sc = JSON.parse(readFileSync(join(ROOT, 'tests/golden/scenarios/bot-00-l1.json'), 'utf8'));
  for (const k of Object.keys(sc.files)) if (k.startsWith('demo_')) delete sc.files[k];
  const cancelled: number[] = [];
  const sim = createSim({
    seed: sc.seed,
    files: new MemoryFileStore(buildFiles(sc, join(ROOT, 'reference/reSL/resources'))),
    stopAtUs: 300e6,
    ubPolicy: policy,
    onEvent: (e) => {
      if (e.type === 'spawnCancelled') cancelled.push(sim.now);
    },
  });
  for (const [t, kind, a, b, c, d] of sc.input as [number, string, number, number, number, number][])
    sim.pushInput(kind === 'key' ? { t, type: 'key', scancode: a, down: b !== 0 } : { t, type: 'mouse', flags: a, buttons: b, x: c, y: d });
  sim.advanceTo(Number.MAX_SAFE_INTEGER);
  return { halted: sim.halted, now: sim.now, cancelled };
}

describe('U1: spawning into a dead end', () => {
  it("'halt' stops like the oracle", () => {
    const r = run('halt');
    expect(r.halted?.reason).toBe('ub');
    expect(r.halted?.detail).toBe('moveAlongPath: invalid rail');
    expect(r.cancelled).toEqual([]);
  });

  it("'recover' cancels the spawn and the game goes on", () => {
    const halt = run('halt');
    const r = run('recover');
    expect(r.halted?.reason).toBe('stop');
    expect(r.cancelled.length).toBeGreaterThan(0);
    expect(r.cancelled[0]).toBe(halt.now);
  });
});
