// Game file storage (demo files, saves, results.tbl, pictures, RULES.TXT).
// In the browser it is backed by IndexedDB, in tests by memory. The formats
// are binary compatible with the original game.

export interface FileStore {
  read(name: string): Uint8Array | null;
  write(name: string, data: Uint8Array): void;
  remove(name: string): boolean;
  /** all file names (any order) */
  list(): string[];
}

export class MemoryFileStore implements FileStore {
  private readonly files = new Map<string, Uint8Array>();

  constructor(init?: Iterable<[string, Uint8Array]>) {
    if (init) for (const [k, v] of init) this.files.set(k, new Uint8Array(v));
  }

  read(name: string): Uint8Array | null {
    const f = this.files.get(name);
    return f ? new Uint8Array(f) : null;
  }

  write(name: string, data: Uint8Array): void {
    this.files.set(name, new Uint8Array(data));
  }

  remove(name: string): boolean {
    return this.files.delete(name);
  }

  list(): string[] {
    return [...this.files.keys()];
  }
}
