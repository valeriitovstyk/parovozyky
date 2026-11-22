// Trees, houses and construction sites (presentation only): low-poly models
// with per-object variation taken from the object's position (stable).
import * as THREE from 'three';
import { GeometryBuilder, trs } from './merge';
import { prng } from './nature';

const TRUNK = new THREE.CylinderGeometry(1, 1.6, 8, 6).translate(0, 4, 0);
const CONE = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
const BLOB = new THREE.IcosahedronGeometry(1, 1);
const BOX = new THREE.BoxGeometry(1, 1, 1);
/** a triangular prism along X: a gable roof, unit size, ridge at y = 1 */
const GABLE = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5).rotateY(Math.PI / 2);
})();

function scaled(x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0): THREE.Matrix4 {
  return trs(x, y, z, rotY).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
}

function shade(color: number, k: number, hueShift = 0): number {
  const c = new THREE.Color(color);
  if (hueShift) c.offsetHSL(hueShift, 0, 0);
  return c.multiplyScalar(k).getHex();
}

/** a tree: conifers (even types) are stacked cones, others are clumps of blobs */
export function addTree(b: GeometryBuilder, x: number, z: number, type: number, color: number): void {
  const r = prng(Math.imul(Math.round(x) + 9973, 31337) ^ Math.round(z) * 7919);
  const size = 0.85 + r() * 0.35;
  const lean = (r() - 0.5) * 0.08;
  b.add(TRUNK, 0x5b3a1f, trs(x, 0, z, 0, lean, 0).multiply(new THREE.Matrix4().makeScale(size, size, size)));
  if (type % 2 === 0) {
    const tiers = 3 + Math.floor(r() * 2);
    for (let i = 0; i < tiers; ++i) {
      const t = i / tiers;
      const rad = (8.5 - t * 5) * size;
      const h = (10 - t * 2) * size;
      const y = (5 + i * 5.5) * size;
      b.add(CONE, shade(color, 0.7 + t * 0.3, (r() - 0.5) * 0.02), scaled(x, y, z, rad, h, rad, r() * 3));
    }
  } else {
    const blobs = 3 + Math.floor(r() * 3);
    for (let i = 0; i < blobs; ++i) {
      const a = (i / blobs) * Math.PI * 2 + r();
      const d = i === 0 ? 0 : 3.5 * size;
      const rad = (i === 0 ? 7.5 : 5 + r() * 1.5) * size;
      const y = (i === 0 ? 15 : 11 + r() * 5) * size;
      b.add(BLOB, shade(color, 0.72 + r() * 0.3, (r() - 0.5) * 0.03), scaled(x + Math.cos(a) * d, y, z + Math.sin(a) * d, rad, rad * 0.9, rad, r() * 3));
    }
  }
}

const ROOFS = [0x8a3324, 0x5d4636, 0x47515c, 0x9a4b2a];
const WINDOW = 0x2b3f55;
const FRAME = 0xf2ead8;

/** a house facing the camera at 45° like in the original; `color` is the town colour */
export function addHouse(b: GeometryBuilder, x: number, z: number, type: number, color: number): void {
  const rot = Math.PI / 4;
  const w = 13 + (type % 3) * 3;
  const d = 11 + (type % 2) * 2;
  const h = 9 + (type % 4) * 3;
  const floors = h > 13 ? 2 : 1;
  const local = (lx: number, ly: number, lz: number) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return { x: x + lx * c + lz * s, y: ly, z: z - lx * s + lz * c };
  };
  const put = (geo: THREE.BufferGeometry, col: number, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number) => {
    const p = local(lx, ly, lz);
    b.add(geo, col, scaled(p.x, p.y, p.z, sx, sy, sz, rot));
  };
  // plinth, walls, cornice
  put(BOX, 0x8b857a, 0, 0.8, 0, w + 1, 1.6, d + 1);
  put(BOX, color, 0, h / 2 + 1, 0, w, h, d);
  put(BOX, shade(color, 0.8), 0, h + 1.2, 0, w + 0.8, 0.8, d + 0.8);
  // gable roof along the long side
  put(GABLE, ROOFS[type % ROOFS.length], 0, h + 1.4, 0, w + 2, 6 + (type % 2) * 2, d + 2.5);
  // chimney
  put(BOX, 0x7d4a3a, w * 0.25, h + 6, d * 0.15, 2, 5, 2);
  // windows on the long faces, a door in front
  const perFloor = Math.max(2, Math.floor(w / 5));
  for (let f = 0; f < floors; ++f) {
    const wy = 4 + f * 5.5;
    for (let i = 0; i < perFloor; ++i) {
      const wx = -w / 2 + (w / perFloor) * (i + 0.5);
      if (f === 0 && i === Math.floor(perFloor / 2)) continue;
      for (const side of [-1, 1]) {
        put(BOX, FRAME, wx, wy, side * (d / 2 + 0.05), 2.6, 3.2, 0.3);
        put(BOX, WINDOW, wx, wy, side * (d / 2 + 0.2), 1.8, 2.4, 0.3);
      }
    }
    for (const side of [-1, 1]) {
      put(BOX, FRAME, side * (w / 2 + 0.05), wy, 0, 0.3, 3.2, 2.6);
      put(BOX, WINDOW, side * (w / 2 + 0.2), wy, 0, 0.3, 2.4, 1.8);
    }
  }
  const dx = -w / 2 + (w / perFloor) * (Math.floor(perFloor / 2) + 0.5);
  put(BOX, 0x5a3520, dx, 3.2, d / 2 + 0.2, 2.6, 4.6, 0.4);
  put(BOX, 0x8b857a, dx, 0.4, d / 2 + 1.4, 4, 0.8, 2);
}
