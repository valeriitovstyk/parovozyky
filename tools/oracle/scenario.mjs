// Runs one scenario on the native oracle and returns its trace text.
//
// Scenario (tests/golden/scenarios/<name>.json):
// {
//   "name": "demo-a-s1",
//   "seed": 1,                   // RESL_SEED
//   "playerName": "Unknown",     // optional, argv[1]
//   "stopAtUs": 70000000,        // RESL_STOP_AT
//   "dumpEveryUs": 1000000,      // RESL_DUMP_EVERY
//   "chainEveryUs": 0,           // RESL_CHAIN_EVERY (0: one H line per state change)
//   "files": { ... },            // see tools/scenario/files.mjs
//   "input": [[tUs, "key", scancode, down01], [tUs, "mouse", flags, buttons, x, y], ...]
// }

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFiles } from '../scenario/files.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const ORACLE = join(ROOT, '.build/oracle/resl-oracle');
export const RESOURCES = join(ROOT, 'reference/reSL/resources');

export function scriptText(input) {
  const lines = [];
  for (const ev of input) {
    const [t, kind, ...args] = ev;
    if (kind !== 'key' && kind !== 'mouse') throw new Error(`unknown input event ${kind}`);
    lines.push(`${t} ${kind} ${args.join(' ')}`);
  }
  return lines.join('\n') + '\n';
}

function prepare(sc, screenshotEveryUs) {
  const dir = mkdtempSync(join(tmpdir(), `resl-${sc.name}-`));
  for (const [name, data] of buildFiles(sc, RESOURCES)) writeFileSync(join(dir, name), data);
  writeFileSync(join(dir, '.script'), scriptText(sc.input ?? []));
  const env = {
    PATH: process.env.PATH,
    RESL_SEED: String(sc.seed),
    RESL_SCRIPT: join(dir, '.script'),
    RESL_TRACE: join(dir, '.trace'),
    RESL_STOP_AT: String(sc.stopAtUs),
    RESL_DUMP_EVERY: String(sc.dumpEveryUs ?? 1000000),
    RESL_SCREENSHOT_EVERY: String(screenshotEveryUs),
    RESL_CHAIN_EVERY: String(sc.chainEveryUs ?? 0),
  };
  const args = sc.playerName ? [sc.playerName] : [];
  return { dir, env, args };
}

// Resolves to { trace, dir } (dir is removed unless keepDir).
export function runScenario(sc, { screenshotEveryUs = 0, keepDir = false } = {}) {
  const { dir, env, args } = prepare(sc, screenshotEveryUs);
  return new Promise((resolvePromise, reject) => {
    const p = spawn(ORACLE, args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d));
    p.stdout.resume();
    p.on('close', (status, signal) => {
      try {
        if (status !== 0) throw new Error(`oracle failed for ${sc.name}: status=${status} signal=${signal}\n${stderr}`);
        const files = {};
        for (const f of readdirSync(dir).sort()) {
          if (f.startsWith('.')) continue;
          files[f] = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex');
        }
        resolvePromise({ trace: readFileSync(join(dir, '.trace'), 'utf8'), files, dir });
      } catch (e) {
        reject(e);
      } finally {
        if (!keepDir) rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}

// Runs tasks with at most `limit` in flight.
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
