// T1: the generated TS tables contain exactly what dump_tables.cpp read from
// the C++ resources (same FNV-1a hash over keys and values in dump order).
import { describe, expect, it } from 'vitest';
import * as glyphs from '../src/data/glyphs';
import * as tables from '../src/data/tables';

function fnvTables(): number {
  const all: Record<string, unknown> = { ...tables, ...glyphs };
  let h = 2166136261;
  const word = (v: number) => {
    h = Math.imul((h ^ v) >>> 0, 16777619) >>> 0;
  };
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'number') word(v | 0);
    else throw new Error(`unexpected value ${String(v)}`);
  };
  for (const key of tables.TABLE_ORDER) {
    for (let i = 0; i < key.length; ++i) word(key.charCodeAt(i));
    walk(all[key]);
  }
  return h >>> 0;
}

describe('T1: extracted tables', () => {
  it('hash of the TS data equals the hash of the C++ dump', () => {
    expect(fnvTables().toString(16).padStart(8, '0')).toBe(tables.CPP_TABLES_HASH.toString(16).padStart(8, '0'));
  });

  it('has the expected shapes', () => {
    expect(tables.movementPaths.map((p) => p[0])).toEqual([152, 152, 207, 231, 207, 231, 255]);
    for (const p of tables.movementPaths) expect(p.length).toBe(1 + 3 * p[0]);
    expect(tables.entranceRails).toHaveLength(46);
    expect(tables.trainGlyphSizes).toHaveLength(15 * 5 * 2);
    expect(tables.railConnectionRules).toHaveLength(36);
    expect(tables.textGlyphs).toHaveLength(147);
    expect(tables.charTraits).toHaveLength(256);
    expect(glyphs.font14).toHaveLength(256 * 14);
  });
});
