// game/records.cpp: "results.tbl" — a hash table of 833 records x 36 bytes
import { i16, i8, u16 } from '../core/ints';
import { G, cstrValue } from './globals';
import { HeaderFieldId } from './types';

const RECORDS_FILE = 'results.tbl';
const CAPACITY = 833;
const RECORD_SIZE = 36;

/* 174e:0087 */
export function playerNameHash(): number {
  let hash = 0;
  const name = G.playerName;
  for (let i = 0; i < 20 && name[i]; ++i) hash = u16(hash + (i8(name[i]) << (i << 1)));
  return hash % CAPACITY;
}

function rd16(b: Uint8Array, off: number): number {
  return b[off] | (b[off + 1] << 8);
}
function wr16(b: Uint8Array, off: number, v: number): void {
  b[off] = v & 0xff;
  b[off + 1] = (v >> 8) & 0xff;
}

/* 174e:0243 — RecordItem at `off`: trains, money, year, level (uint16) */
function fillRecordItem(rec: Uint8Array, off: number): void {
  wr16(rec, off + 0, G.headers[HeaderFieldId.Trains].value);
  wr16(rec, off + 2, G.headers[HeaderFieldId.Money].value);
  wr16(rec, off + 4, G.headers[HeaderFieldId.Year].value);
  wr16(rec, off + 6, G.headers[HeaderFieldId.Level].value);
}

/* 174e:00cc */
export function writeRecords(): void {
  let file = G.files.read(RECORDS_FILE);
  if (!file) {
    // initialize a new empty hash table
    file = new Uint8Array(RECORD_SIZE * CAPACITY);
  }
  const hash = playerNameHash();
  const off = hash * RECORD_SIZE;
  if (off + RECORD_SIZE > file.length) {
    G.files.write(RECORDS_FILE, file);
    return; // the read fails
  }
  const r = file.slice(off, off + RECORD_SIZE);

  const curTrains = G.headers[HeaderFieldId.Trains].value;
  let needUpdate = rd16(r, 0) < curTrains;
  if (needUpdate) fillRecordItem(r, 0);
  const curLevel = G.headers[HeaderFieldId.Level].value;
  const curYear = G.headers[HeaderFieldId.Year].value;
  const byYearsLevel = rd16(r, 8 + 6);
  const byYearsYear = rd16(r, 8 + 4);
  if (byYearsLevel < curLevel || (byYearsLevel === curLevel && byYearsYear < curYear)) {
    needUpdate = true;
    fillRecordItem(r, 8);
  }
  if (needUpdate) {
    // strcpy(r.playerName, g_playerName)
    for (let i = 0; i < 20; ++i) {
      r[16 + i] = G.playerName[i];
      if (!G.playerName[i]) break;
    }
    file.set(r, off);
  }
  G.files.write(RECORDS_FILE, file);
}

/* 174e:052b */
export function readLevel(): number {
  const defaultLevel = 1;
  const file = G.files.read(RECORDS_FILE);
  if (!file) return defaultLevel;
  const off = playerNameHash() * RECORD_SIZE;
  if (off > file.length) return defaultLevel;
  if (off + RECORD_SIZE > file.length) return defaultLevel;
  const level = i16(rd16(file, off + 14));
  return level <= 0 ? defaultLevel : level;
}

export interface RecordView {
  name: string;
  trains: number;
  money: number;
  year: number;
  level: number;
}

/* 174e:0266 — the data of the records screen (the drawing is done by the renderers) */
export function recordsScreenData(): { byTrains: RecordView[]; byYears: RecordView[] } {
  const data = G.files.read(RECORDS_FILE);
  type Rec = { trains: number[]; years: number[]; name: string };
  const recs: Rec[] = [];
  if (data && data.length) {
    for (let i = 0; i < CAPACITY && (i + 1) * RECORD_SIZE <= data.length; ++i) {
      const off = i * RECORD_SIZE;
      if (!data[off + 16]) continue;
      recs.push({
        trains: [0, 2, 4, 6].map((k) => rd16(data, off + k)),
        years: [8, 10, 12, 14].map((k) => rd16(data, off + k)),
        name: cstrValue(data.subarray(off + 16, off + 36)),
      });
    }
  }
  const view = (r: Rec, which: 'trains' | 'years'): RecordView => {
    const v = r[which];
    return { name: r.name, trains: v[0], money: v[1], year: v[2], level: v[3] };
  };
  // docs/fidelity.md D3: stable sorts
  const byTrains = [...recs].sort((a, b) => b.trains[0] - a.trains[0]);
  const byYears = [...recs].sort((a, b) => b.years[3] - a.years[3] || b.years[2] - a.years[2]);
  return {
    byTrains: byTrains.slice(0, 10).filter((r) => r.trains[0]).map((r) => view(r, 'trains')),
    byYears: byYears.slice(0, 10).filter((r) => r.years[3]).map((r) => view(r, 'years')),
  };
}
