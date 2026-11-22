// FileStore for the browser: the original game files are fetched from
// /game/, the files written by the game (saves, results.tbl) persist in
// IndexedDB. The simulator needs a synchronous store => everything lives in
// memory, writes go to IndexedDB in the background.
import { MemoryFileStore, type FileStore } from '@parovozyky/sim';

const DB_NAME = 'parovozyky';
const STORE = 'files';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readAll(db: IDBDatabase): Promise<[string, Uint8Array][]> {
  return new Promise((resolve) => {
    const res: [string, Uint8Array][] = [];
    const cur = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve(res);
      res.push([String(c.key), new Uint8Array(c.value as ArrayBuffer)]);
      c.continue();
    };
    cur.onerror = () => resolve(res);
  });
}

export class BrowserFileStore implements FileStore {
  private constructor(
    private readonly mem: MemoryFileStore,
    private readonly db: IDBDatabase | null,
    private readonly readonlyNames: Set<string>,
  ) {}

  static async open(base = 'game/'): Promise<BrowserFileStore> {
    const names = (await (await fetch(`${base}files.json`)).json()) as string[];
    const bundled = await Promise.all(
      names.map(async (n) => [n, new Uint8Array(await (await fetch(base + n)).arrayBuffer())] as [string, Uint8Array]),
    );
    const db = await openDb();
    const saved = db ? await readAll(db) : [];
    return new BrowserFileStore(new MemoryFileStore([...bundled, ...saved]), db, new Set(names));
  }

  read(name: string): Uint8Array | null {
    return this.mem.read(name);
  }

  write(name: string, data: Uint8Array): void {
    this.mem.write(name, data);
    this.db?.transaction(STORE, 'readwrite').objectStore(STORE).put(data.slice().buffer, name);
  }

  remove(name: string): boolean {
    const res = this.mem.remove(name);
    this.db?.transaction(STORE, 'readwrite').objectStore(STORE).delete(name);
    return res;
  }

  list(): string[] {
    return this.mem.list();
  }

  /** user files (saves, records) — for the debug menu / tests */
  userFiles(): string[] {
    return this.mem.list().filter((n) => !this.readonlyNames.has(n));
  }
}
