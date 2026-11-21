// Shared between the oracle runner (Node) and the TS port tests: builds the
// initial set of game files for a scenario from a declarative spec.
//
// spec.files: { [fileName]: FileSpec }
//   { from: "<resource name>" }                    copy of reference/reSL/resources/<name>
//   { from: "<name>", dir: "extra" }               copy of reference/reSL/resources/extra/<name>
//   { from: "<name>", patch: [{ offset, u16 }] }   copy with little-endian 16-bit patches
//   { records: [{ name, level }] }                 results.tbl with the given start levels
//
// Standard game resources (play.7, GAMEOVER.7, captions.7, poster.7, RULES.TXT)
// are always present; demo files only when listed (so a scenario can pick one).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STANDARD_FILES = ['play.7', 'GAMEOVER.7', 'captions.7', 'poster.7', 'RULES.TXT'];
export const DEMO_FILES = 'abcdefghijklmnopqrst'.split('').map((c) => `demo_${c}`);

const RECORD_SIZE = 36;
const RECORDS_CAPACITY = 833;

// records.cpp: playerNameHash (174e:0087)
export function playerNameHash(name) {
  let hash = 0;
  for (let i = 0; i < 20 && i < name.length; ++i) {
    hash = (hash + ((name.charCodeAt(i) << (i << 1)) & 0xffffffff)) & 0xffff;
  }
  return hash % RECORDS_CAPACITY;
}

export function makeRecords(records) {
  const buf = new Uint8Array(RECORD_SIZE * RECORDS_CAPACITY);
  const view = new DataView(buf.buffer);
  for (const r of records) {
    const off = playerNameHash(r.name) * RECORD_SIZE;
    // byYears.level (offset 14) is what readLevel() returns
    view.setInt16(off + 14, r.level, true);
    view.setInt16(off + 6, r.level, true);
    for (let i = 0; i < r.name.length && i < 19; ++i) buf[off + 16 + i] = r.name.charCodeAt(i);
  }
  return buf;
}

export function buildFiles(spec, resourcesDir) {
  const files = new Map();
  for (const name of STANDARD_FILES) files.set(name, new Uint8Array(readFileSync(join(resourcesDir, name))));
  for (const [name, fs] of Object.entries(spec.files ?? {})) {
    if (fs.records) {
      files.set(name, makeRecords(fs.records));
      continue;
    }
    const src = fs.dir ? join(resourcesDir, fs.dir, fs.from) : join(resourcesDir, fs.from);
    const data = new Uint8Array(readFileSync(src));
    const view = new DataView(data.buffer);
    for (const p of fs.patch ?? []) view.setUint16(p.offset, p.u16, true);
    files.set(name, data);
  }
  return files;
}
