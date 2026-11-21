// Generates golden traces with the native oracle:
//   tests/golden/scenarios/<name>.json   scenario (input for both oracle and port)
//   tests/golden/traces/<name>.trace.gz  oracle trace (see docs/trace-format.md)
//
// usage: node tools/oracle/golden.mjs [--only <regex>] [--check]
//   --check  regenerate into memory and compare with the committed files
//            (non-zero exit on any difference)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { ORACLE, ROOT, pool, runScenario } from './scenario.mjs';
import { allScenarios } from './scenarios.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? new RegExp(args[args.indexOf('--only') + 1]) : null;
const check = args.includes('--check');

if (!existsSync(ORACLE)) {
  console.error('oracle is not built: run `pnpm oracle:build`');
  process.exit(1);
}

const scenDir = join(ROOT, 'tests/golden/scenarios');
const traceDir = join(ROOT, 'tests/golden/traces');
mkdirSync(scenDir, { recursive: true });
mkdirSync(traceDir, { recursive: true });

const scenarios = allScenarios().filter((s) => !only || only.test(s.name));
const t0 = Date.now();
let bad = 0;
let totalBytes = 0;

await pool(scenarios, Math.max(1, cpus().length - 1), async (sc) => {
  const { trace, files } = await runScenario(sc);
  const manifest = JSON.stringify(files, null, 1) + '\n';
  if (!/^E \d+ (stop|ub|exit) /m.test(trace)) throw new Error(`${sc.name}: the trace has no stop marker`);
  const json = JSON.stringify(sc) + '\n';
  const gz = gzipSync(Buffer.from(trace), { level: 9 });
  totalBytes += gz.length;
  const scPath = join(scenDir, `${sc.name}.json`);
  const trPath = join(traceDir, `${sc.name}.trace.gz`);
  const fiPath = join(traceDir, `${sc.name}.files.json`);
  if (check) {
    const sameSc = existsSync(scPath) && readFileSync(scPath, 'utf8') === json;
    const sameTr = existsSync(trPath) && gunzipSync(readFileSync(trPath)).toString() === trace;
    const sameFi = existsSync(fiPath) && readFileSync(fiPath, 'utf8') === manifest;
    if (!sameSc || !sameTr || !sameFi) {
      ++bad;
      console.log(`DIFF ${sc.name} (scenario ${sameSc ? 'same' : 'differs'}, trace ${sameTr ? 'same' : 'differs'}, files ${sameFi ? 'same' : 'differ'})`);
    }
  } else {
    writeFileSync(scPath, json);
    writeFileSync(trPath, gz);
    writeFileSync(fiPath, manifest);
  }
});

console.log(
  `${check ? 'checked' : 'generated'} ${scenarios.length} scenarios in ${((Date.now() - t0) / 1000).toFixed(1)} s, ` +
    `${(totalBytes / 1024 / 1024).toFixed(2)} MiB of gzipped traces${check ? `, ${bad} differ` : ''}`,
);
if (bad) process.exit(1);
