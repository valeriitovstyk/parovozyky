// Moving the player's files (saved games "????????.??_" and the records
// "results.tbl") in and out of the browser: a zip of them, the original DOS
// files one by one, and the files of the reSL web version
// (konovalov-aleks.github.io), taken out of its IndexedDB by a bookmarklet.

export const RECORDS_FILE = 'results.tbl';
const RECORDS_SIZE = 833 * 36;
const RECORD_SIZE = 36;

// ---- zip (stored entries; deflated ones are read with DecompressionStream) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; ++n) {
    let c = n;
    for (let k = 0; k < 8; ++k) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; ++i) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** a zip archive of `files` (no compression: the files are small) */
export function zip(files: [string, Uint8Array][]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // 1992-06-15 12:00 (DOS date/time), like the date of the files in the game
  const time = 12 << 11;
  const date = 15 | (6 << 5) | ((1992 - 1980) << 9);
  for (const [name, data] of files) {
    const n = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 10, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, n.length, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 10, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function isZip(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 3 && data[3] === 4;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Blob([data.slice()]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** the files of a zip archive (stored or deflated entries; folders are flattened) */
export async function unzip(data: Uint8Array): Promise<[string, Uint8Array][]> {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); --i)
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const res: [string, Uint8Array][] = [];
  for (let i = 0; i < count; ++i) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('a broken zip archive');
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true);
    const xlen = v.getUint16(p + 30, true);
    const clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(data.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = data.subarray(start, start + csize);
    if (method === 0) res.push([name, raw.slice()]);
    else if (method === 8) res.push([name, await inflateRaw(raw)]);
  }
  return res;
}

// ---- the player's files ----

/** the game's name of a player's file, or null when it is not one */
export function playerFileName(path: string, data: Uint8Array): string | null {
  const base = path.split(/[\\/]/).pop() ?? '';
  if (base.toLowerCase() === RECORDS_FILE) return data.length === RECORDS_SIZE ? RECORDS_FILE : null;
  // a saved game: "????????.??_" (load_game.cpp), a few kilobytes
  if (/^[^.]{8}\.[^.]{2}_$/.test(base) && data.length > 1000 && data.length < 0x10000) return base;
  return null;
}

export interface RecordEntry {
  name: string;
  level: number;
  year: number;
}

/** the players of a records table with their best level */
export function recordEntries(data: Uint8Array): RecordEntry[] {
  const res: RecordEntry[] = [];
  for (let i = 0; (i + 1) * RECORD_SIZE <= data.length; ++i) {
    const off = i * RECORD_SIZE;
    if (!data[off + 16]) continue;
    let name = '';
    for (let k = 16; k < 36 && data[off + k]; ++k) name += String.fromCharCode(data[off + k]);
    res.push({ name, year: data[off + 12] | (data[off + 13] << 8), level: data[off + 14] | (data[off + 15] << 8) });
  }
  return res.sort((a, b) => b.level - a.level || b.year - a.year);
}

/** both tables in one: a player found in both keeps the better results */
export function mergeRecords(old: Uint8Array | null, add: Uint8Array): Uint8Array {
  if (!old || old.length !== add.length) return add.slice();
  const out = old.slice();
  const rd = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
  const sameName = (off: number) => {
    for (let k = 16; k < 36; ++k) {
      if (old[off + k] !== add[off + k]) return false;
      if (!old[off + k]) return true;
    }
    return true;
  };
  for (let off = 0; off + RECORD_SIZE <= add.length; off += RECORD_SIZE) {
    if (!add[off + 16]) continue;
    // a slot is the hash of the name: another name there loses to the imported one
    if (!old[off + 16] || !sameName(off)) {
      out.set(add.subarray(off, off + RECORD_SIZE), off);
      continue;
    }
    // by trains (+0..7), by years (+8..15: trains, money, year, level)
    if (rd(add, off) > rd(old, off)) out.set(add.subarray(off, off + 8), off);
    const lvA = rd(add, off + 14);
    const lvO = rd(old, off + 14);
    if (lvA > lvO || (lvA === lvO && rd(add, off + 12) > rd(old, off + 12))) out.set(add.subarray(off + 8, off + 16), off + 8);
  }
  return out;
}

export interface ImportReport {
  saves: string[];
  /** the records file was imported: its players */
  records: RecordEntry[] | null;
  skipped: string[];
}

interface Store {
  read(name: string): Uint8Array | null;
  write(name: string, data: Uint8Array): void;
}

/** imports files (zip archives are opened) into the game's file store */
export async function importFiles(store: Store, files: [string, Uint8Array][]): Promise<ImportReport> {
  const report: ImportReport = { saves: [], records: null, skipped: [] };
  const queue = [...files];
  while (queue.length) {
    const [path, data] = queue.shift()!;
    if (isZip(data)) {
      try {
        queue.push(...(await unzip(data)));
      } catch {
        report.skipped.push(path);
      }
      continue;
    }
    const name = playerFileName(path, data);
    if (!name) {
      report.skipped.push(path.split(/[\\/]/).pop() ?? path);
      continue;
    }
    if (name === RECORDS_FILE) {
      store.write(RECORDS_FILE, mergeRecords(store.read(RECORDS_FILE), data));
      report.records = recordEntries(data);
    } else {
      store.write(name, data);
      report.saves.push(name);
    }
  }
  return report;
}

/** a zip of the player's files */
export function exportZip(store: Store, names: string[]): Uint8Array {
  const files: [string, Uint8Array][] = [];
  for (const n of names.sort()) {
    const d = store.read(n);
    if (d && playerFileName(n, d)) files.push([n, d]);
  }
  return zip(files);
}

// ---- the reSL web version ----

/**
 * A bookmarklet for the page of the reSL web version: it reads the game's
 * folder "/persistent" (Emscripten IDBFS: the IndexedDB database
 * "/persistent", store "FILE_DATA", {contents} by "/persistent/<name>") and
 * downloads the files as a zip. Self-contained: it runs on the other site.
 */
export function reslExportScript(): string {
  const body = function () {
    const req = indexedDB.open('/persistent');
    req.onerror = () => alert('No saved games found here.');
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('FILE_DATA')) {
        alert('No saved games found here: open the page of the game first.');
        return;
      }
      const files: [string, Uint8Array][] = [];
      const cur = db.transaction('FILE_DATA', 'readonly').objectStore('FILE_DATA').openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) {
          const v = c.value as { contents?: ArrayLike<number> | ArrayBuffer };
          const name = String(c.key).split('/').pop() ?? '';
          if (v && v.contents && name) {
            const src = v.contents instanceof ArrayBuffer ? new Uint8Array(v.contents) : v.contents;
            files.push([name, Uint8Array.from(src as ArrayLike<number>, (x) => x & 0xff)]);
          }
          c.continue();
          return;
        }
        if (!files.length) {
          alert('No saved games found here.');
          return;
        }
        // a stored zip (see zip() above)
        const crcT: number[] = [];
        for (let n = 0; n < 256; ++n) {
          let x = n;
          for (let k = 0; k < 8; ++k) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
          crcT[n] = x >>> 0;
        }
        const crc = (d: Uint8Array) => {
          let x = 0xffffffff;
          for (let i = 0; i < d.length; ++i) x = crcT[(x ^ d[i]) & 0xff] ^ (x >>> 8);
          return (x ^ 0xffffffff) >>> 0;
        };
        const parts: BlobPart[] = [];
        const cd: BlobPart[] = [];
        let off = 0;
        for (const [name, d] of files) {
          const nm = new TextEncoder().encode(name);
          const h = new DataView(new ArrayBuffer(30));
          h.setUint32(0, 0x04034b50, true);
          h.setUint16(4, 10, true);
          h.setUint32(14, crc(d), true);
          h.setUint32(18, d.length, true);
          h.setUint32(22, d.length, true);
          h.setUint16(26, nm.length, true);
          parts.push(h.buffer, nm, d.slice().buffer);
          const e = new DataView(new ArrayBuffer(46));
          e.setUint32(0, 0x02014b50, true);
          e.setUint16(4, 20, true);
          e.setUint16(6, 10, true);
          e.setUint32(16, crc(d), true);
          e.setUint32(20, d.length, true);
          e.setUint32(24, d.length, true);
          e.setUint16(28, nm.length, true);
          e.setUint32(42, off, true);
          cd.push(e.buffer, nm);
          off += 30 + nm.length + d.length;
        }
        const cdSize = cd.reduce((s: number, p) => s + (p as ArrayBuffer | Uint8Array).byteLength, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, cdSize, true);
        end.setUint32(16, off, true);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([...parts, ...cd, end.buffer], { type: 'application/zip' }));
        a.download = 'shortline-saves.zip';
        document.body.append(a);
        a.click();
        a.remove();
      };
    };
  };
  return `(${body.toString()})()`;
}

export function reslBookmarklet(): string {
  return `javascript:${encodeURIComponent(reslExportScript())}`;
}
