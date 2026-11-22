// Copies the game files (reference/reSL/resources) into the web app:
// packages/app/public/game/ + an index (files.json). They are loaded into the
// in-browser FileStore at startup. The help text (RULES.TXT) is adapted to the
// browser game; the number of lines stays the same (it defines the pages).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_FILES, STANDARD_FILES } from '../scenario/files.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'reference/reSL/resources');
const DST = join(ROOT, 'packages/app/public/game');

const RULES_LINES = [
  ['users (players) names.  Once you run SHORTLINE from DOS command', 'users (players) names.  Once you enter your name in Settings'],
  ['line using you name as the argument the system registrates you', 'the system registrates you'],
  ['Running SHORTLINE without player names will cause profiling with', 'Playing without a player name will cause profiling with'],
  ["                   13. 'Inside SHORTLINE'", "                   13. 'Inside the game'"],
];

export function adaptRules(data) {
  const lines = data.toString('latin1').split('\r\n');
  for (const [from, to] of RULES_LINES) {
    const i = lines.indexOf(from);
    if (i < 0) throw new Error(`RULES.TXT: line not found: ${from}`);
    lines[i] = to;
  }
  if (lines.some((l) => /short\s*line/i.test(l))) throw new Error('RULES.TXT: the old name is still there');
  return Buffer.from(lines.join('\r\n'), 'latin1');
}

mkdirSync(DST, { recursive: true });
const files = [...STANDARD_FILES, ...DEMO_FILES];
for (const f of files) {
  if (f === 'RULES.TXT') writeFileSync(join(DST, f), adaptRules(readFileSync(join(SRC, f))));
  else copyFileSync(join(SRC, f), join(DST, f));
}
writeFileSync(join(DST, 'files.json'), JSON.stringify(files) + '\n');
console.log(`copied ${files.length} game files to ${DST}`);
