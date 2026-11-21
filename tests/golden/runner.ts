// T2: differential traces — the TS port against golden traces of the oracle.
// On a mismatch the port trace is written to .build/golden-out/<name>.trace and
// the first differing line is reported together with a diff of the state
// sections (from the nearest dumps).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MemoryFileStore, createSim, type InputEvent } from '../../packages/sim/src/index';
import { buildFiles } from '../../tools/scenario/files.mjs';

const ROOT = resolve(__dirname, '../..');
const RESOURCES = join(ROOT, 'reference/reSL/resources');
const SCEN_DIR = join(ROOT, 'tests/golden/scenarios');
const TRACE_DIR = join(ROOT, 'tests/golden/traces');
const OUT_DIR = join(ROOT, '.build/golden-out');

interface Scenario {
  name: string;
  seed: number;
  playerName?: string;
  stopAtUs: number;
  dumpEveryUs?: number;
  chainEveryUs?: number;
  files?: Record<string, unknown>;
  input: [number, 'key' | 'mouse', ...number[]][];
}

export function runPort(sc: Scenario): { lines: string[]; files: Record<string, string> } {
  const files = new MemoryFileStore(buildFiles(sc, RESOURCES));
  const sim = createSim({
    seed: sc.seed,
    files,
    playerName: sc.playerName,
    stopAtUs: sc.stopAtUs,
    trace: { dumpEveryUs: sc.dumpEveryUs ?? 1000000, chainEveryUs: sc.chainEveryUs ?? 0 },
  });
  for (const [t, kind, a, b, c, d] of sc.input) {
    const ev: InputEvent =
      kind === 'key'
        ? { t, type: 'key', scancode: a, down: b !== 0 }
        : { t, type: 'mouse', flags: a, buttons: b, x: c, y: d };
    sim.pushInput(ev);
  }
  sim.advanceTo(Number.MAX_SAFE_INTEGER);
  const manifest: Record<string, string> = {};
  for (const f of files.list().sort()) manifest[f] = createHash('sha256').update(files.read(f)!).digest('hex');
  return { lines: sim.trace!.lines, files: manifest };
}

/** state reconstructed from D/F lines up to (and including) line index `upTo` */
function stateAt(lines: string[], upTo: number): Record<string, number[]> {
  const st: Record<string, number[]> = {};
  for (let i = 0; i <= upTo && i < lines.length; ++i) {
    const l = lines[i];
    if (l[0] === 'D' || l[0] === 'F') Object.assign(st, JSON.parse(l.slice(l.indexOf('{'))));
  }
  return st;
}

function diffStates(a: Record<string, number[]>, b: Record<string, number[]>): string {
  const out: string[] = [];
  for (const k of Object.keys(a)) {
    const x = a[k] ?? [];
    const y = b[k] ?? [];
    if (x.length !== y.length) out.push(`  ${k}: length ${x.length} != ${y.length}`);
    const n = Math.min(x.length, y.length);
    let shown = 0;
    for (let i = 0; i < n && shown < 12; ++i) {
      if (x[i] !== y[i]) {
        out.push(`  ${k}[${i}]: oracle ${x[i]} port ${y[i]}`);
        ++shown;
      }
    }
  }
  return out.join('\n');
}

export function compare(name: string, expected: string[], actual: string[]): string | null {
  const n = Math.max(expected.length, actual.length);
  for (let i = 0; i < n; ++i) {
    if (expected[i] === actual[i]) continue;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, `${name}.trace`), actual.join('\n') + '\n');
    writeFileSync(join(OUT_DIR, `${name}.expected.trace`), expected.join('\n') + '\n');
    const ctx = (ls: string[]) =>
      ls
        .slice(Math.max(0, i - 6), i + 3)
        .map((l, k) => `${k + Math.max(0, i - 6) === i ? '>' : ' '} ${(l ?? '<eof>').slice(0, 160)}`)
        .join('\n');
    // nearest following dump in both traces
    const nextDump = (ls: string[]) => {
      for (let k = i; k < ls.length; ++k) if (ls[k][0] === 'D' || ls[k][0] === 'F') return k;
      return ls.length - 1;
    };
    const diff = diffStates(stateAt(expected, nextDump(expected)), stateAt(actual, nextDump(actual)));
    return `first difference at line ${i + 1}\n--- oracle\n${ctx(expected)}\n--- port\n${ctx(actual)}\n--- state diff at the next dump\n${diff}`;
  }
  return null;
}

const only = process.env.GOLDEN_ONLY ? new RegExp(process.env.GOLDEN_ONLY) : null;
const names = readdirSync(SCEN_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .filter((n) => !only || only.test(n))
  .sort();

/** Registers the tests of one shard (vitest runs test files in parallel) */
export function defineShard(shard: number, shards: number): void {
  const mine = names.filter((_, i) => i % shards === shard);
  describe(`T2: golden traces (shard ${shard + 1}/${shards})`, () => {
    if (!mine.length) it.skip('no scenarios', () => {});
    for (const name of mine) {
      it(name, () => {
        const sc = JSON.parse(readFileSync(join(SCEN_DIR, `${name}.json`), 'utf8')) as Scenario;
        const expected = gunzipSync(readFileSync(join(TRACE_DIR, `${name}.trace.gz`)))
          .toString()
          .split('\n');
        if (expected[expected.length - 1] === '') expected.pop();
        const actual = runPort(sc);
        const err = compare(name, expected, actual.lines);
        expect(err, err ?? '').toBeNull();
        // T3: files written by the game (saves, results.tbl) are byte-identical
        const fiPath = join(TRACE_DIR, `${name}.files.json`);
        if (existsSync(fiPath)) expect(actual.files).toEqual(JSON.parse(readFileSync(fiPath, 'utf8')));
      });
    }
  });
}
