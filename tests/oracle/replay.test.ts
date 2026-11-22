// `pnpm replay <file.json>`: a replay exported by the app (Settings ->
// Export replay) is run on the TS port and on the native oracle; the traces
// must be identical (otherwise the first difference is reported).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORACLE, runScenario } from '../../tools/oracle/scenario.mjs';
import { compare, runPort } from '../golden/runner';

const file = process.env.REPLAY;

describe.skipIf(!file || !existsSync(ORACLE))('replay: port = oracle', () => {
  it(file ?? 'no replay', async () => {
    const sc = JSON.parse(readFileSync(resolve(file!), 'utf8'));
    const { trace } = await runScenario(sc);
    const expected = trace.split('\n');
    if (expected[expected.length - 1] === '') expected.pop();
    const actual = runPort(sc).lines;
    const err = compare(sc.name, expected, actual);
    expect(err, err ?? '').toBeNull();
    console.log(`${sc.name}: ${actual.length} trace lines, ${sc.input.length} input events — identical`);
  });
});
