// Decorations are deterministic and stay off the tracks.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Animals } from '../src/life';
import { Nature, prng } from '../src/nature';

describe('nature', () => {
  it('prng is seeded', () => {
    const a = prng(1);
    const b = prng(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('keeps grass and flowers away from obstacles', () => {
    const n = new Nature();
    const obstacles = [{ x: 0, z: 0, r: 120 }];
    n.rebuild(obstacles, () => false);
    let total = 0;
    for (const c of n.group.children) {
      const pos = (c as THREE.Mesh).geometry.getAttribute('position');
      let near = Infinity;
      for (let i = 0; i < pos.count; ++i) near = Math.min(near, Math.hypot(pos.getX(i), pos.getZ(i)));
      // blades lean and bushes are clusters: vertices may stray a few units from a free point
      expect(near).toBeGreaterThan(105);
      total += pos.count;
    }
    expect(total).toBeGreaterThan(50_000);
  });
});

describe('animals', () => {
  function run(frames: number[]) {
    const a = new Animals();
    for (const t of frames) a.update(t);
    return a.group.children.map((c) => c.position.toArray().map((v) => Math.round(v * 1000)));
  }

  it('poses depend on the time only, not on the frame rate', () => {
    const fine = Array.from({ length: 2400 }, (_, i) => i * 16.667);
    const coarse = Array.from({ length: 400 }, (_, i) => i * 100.002);
    const end = 40_000;
    const a = run([...fine.filter((t) => t < end), end]);
    const b = run([...coarse.filter((t) => t < end), end]);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});
