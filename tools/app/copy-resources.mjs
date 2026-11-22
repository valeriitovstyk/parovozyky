// Copies the original game files (reference/reSL/resources) into the web app:
// packages/app/public/game/ + an index (files.json). They are loaded into the
// in-browser FileStore at startup.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_FILES, STANDARD_FILES } from '../scenario/files.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'reference/reSL/resources');
const DST = join(ROOT, 'packages/app/public/game');
mkdirSync(DST, { recursive: true });
const files = [...STANDARD_FILES, ...DEMO_FILES];
for (const f of files) copyFileSync(join(SRC, f), join(DST, f));
writeFileSync(join(DST, 'files.json'), JSON.stringify(files) + '\n');
console.log(`copied ${files.length} game files to ${DST}`);
