// T3: every demo file and every save of resources/extra loads; save -> load -> save is stable.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryFileStore, createSim, serializeGame } from '../../packages/sim/src/index';
import { loadSavedGame } from '../../packages/sim/src/game/savefile';

const RES = resolve(__dirname, '../../reference/reSL/resources');
const files: [string, Uint8Array][] = [
  ...readdirSync(RES).filter((f) => /^demo_[a-t]$/.test(f)).map((f) => [f, readFileSync(join(RES, f))] as [string, Uint8Array]),
  ...readdirSync(join(RES, 'extra')).map((f) => [f, readFileSync(join(RES, 'extra', f))] as [string, Uint8Array]),
];

describe('T3: save files', () => {
  it('finds all files', () => expect(files.length).toBe(25));
  for (const [name, data] of files) {
    it(`loads ${name}`, () => {
      const store = new MemoryFileStore([[name, data]]);
      createSim({ seed: 1, files: store });
      expect(loadSavedGame(name)).toBe(true);
      const saved = serializeGame();
      store.write('again', saved);
      expect(loadSavedGame('again')).toBe(true);
      expect(serializeGame()).toEqual(saved);
    });
  }
});
