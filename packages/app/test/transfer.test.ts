import { describe, expect, it } from 'vitest';
import { crc32, importFiles, mergeRecords, playerFileName, recordEntries, unzip, zip } from '../src/transfer';

const rec = (entries: { slot: number; name: string; trains?: number; year?: number; level: number }[]) => {
  const b = new Uint8Array(833 * 36);
  for (const e of entries) {
    const off = e.slot * 36;
    const v = new DataView(b.buffer);
    v.setUint16(off, e.trains ?? 0, true);
    v.setUint16(off + 12, e.year ?? 1900, true);
    v.setUint16(off + 14, e.level, true);
    for (let i = 0; i < e.name.length; ++i) b[off + 16 + i] = e.name.charCodeAt(i);
  }
  return b;
};

/** a zip with one deflated entry (as made by the zip tools of the OS) */
async function deflatedZip(name: string, data: Uint8Array): Promise<Uint8Array> {
  const n = new TextEncoder().encode(name);
  const cs = new Blob([data.slice()]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const c = new Uint8Array(await new Response(cs).arrayBuffer());
  const out = new Uint8Array(30 + n.length + c.length + 46 + n.length + 22);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(8, 8, true);
  v.setUint32(14, crc32(data), true);
  v.setUint32(18, c.length, true);
  v.setUint32(22, data.length, true);
  v.setUint16(26, n.length, true);
  out.set(n, 30);
  out.set(c, 30 + n.length);
  const cd = 30 + n.length + c.length;
  v.setUint32(cd, 0x02014b50, true);
  v.setUint16(cd + 10, 8, true);
  v.setUint32(cd + 16, crc32(data), true);
  v.setUint32(cd + 20, c.length, true);
  v.setUint32(cd + 24, data.length, true);
  v.setUint16(cd + 28, n.length, true);
  out.set(n, cd + 46);
  const end = cd + 46 + n.length;
  v.setUint32(end, 0x06054b50, true);
  v.setUint16(end + 8, 1, true);
  v.setUint16(end + 10, 1, true);
  v.setUint32(end + 12, 46 + n.length, true);
  v.setUint32(end + 16, cd, true);
  return out;
}

describe('moving the player files', () => {
  const save = new Uint8Array(4000).map((_, i) => i * 7);

  it('zip and unzip', async () => {
    const files: [string, Uint8Array][] = [['017EN815.25_', save], ['results.tbl', rec([{ slot: 3, name: 'Unknown', level: 4 }])]];
    expect(await unzip(zip(files))).toEqual(files);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('reads deflated zips with folders', async () => {
    expect(await unzip(await deflatedZip('saves/048hl949.02_', save))).toEqual([['saves/048hl949.02_', save]]);
  });

  it('recognises the game files', () => {
    expect(playerFileName('C:\\GAMES\\SL\\RESULTS.TBL', new Uint8Array(833 * 36))).toBe('results.tbl');
    expect(playerFileName('results.tbl', new Uint8Array(100))).toBeNull();
    expect(playerFileName('dir/203sg999.01_', save)).toBe('203sg999.01_');
    expect(playerFileName('demo_a', save)).toBeNull();
    expect(playerFileName('notes.txt', save)).toBeNull();
  });

  it('merges the records: the better result of every player', () => {
    const old = rec([
      { slot: 1, name: 'Unknown', trains: 50, level: 5 },
      { slot: 2, name: 'Mom', level: 3 },
    ]);
    const add = rec([
      { slot: 1, name: 'Unknown', trains: 10, level: 8, year: 1950 },
      { slot: 4, name: 'Dad', level: 9 },
    ]);
    const m = recordEntries(mergeRecords(old, add));
    expect(m.map((e) => `${e.name}:${e.level}`)).toEqual(['Dad:9', 'Unknown:8', 'Mom:3']);
    // by trains: the old 50 stays
    expect(new DataView(mergeRecords(old, add).buffer).getUint16(36, true)).toBe(50);
  });

  it('imports a zip into a store', async () => {
    const store = new Map<string, Uint8Array>();
    const s = { read: (n: string) => store.get(n) ?? null, write: (n: string, d: Uint8Array) => void store.set(n, d) };
    const r = await importFiles(s, [
      ['shortline-saves.zip', zip([['017EN815.25_', save], ['results.tbl', rec([{ slot: 1, name: 'Unknown', level: 6 }])]])],
      ['readme.md', new Uint8Array(3)],
    ]);
    expect(r.saves).toEqual(['017EN815.25_']);
    expect(r.records?.map((e) => e.name)).toEqual(['Unknown']);
    expect(r.skipped).toEqual(['readme.md']);
    expect([...store.keys()].sort()).toEqual(['017EN815.25_', 'results.tbl']);
  });
});
