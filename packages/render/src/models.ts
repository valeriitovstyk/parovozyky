// Low-poly procedural models of the rolling stock (CarriageType of the game).
// Each model is a single merged geometry with vertex colours (one draw call).
import * as THREE from 'three';
import { GeometryBuilder, trs } from './merge';

const DARK = 0x222226;
const METAL = 0x666a70;
const WHEEL = 0x18181a;
const GLASS = 0x9fd3ff;

const box = (w: number, h: number, l: number) => new THREE.BoxGeometry(w, h, l);
const cylZ = (r: number, l: number, seg = 12) => new THREE.CylinderGeometry(r, r, l, seg).rotateX(Math.PI / 2);
const wheelGeo = new THREE.CylinderGeometry(2.4, 2.4, 1.5, 10).rotateZ(Math.PI / 2);

function wheels(b: GeometryBuilder, length: number, n: number): void {
  for (let i = 0; i < n; ++i) {
    const z = -length / 2 + 4 + (i * (length - 8)) / Math.max(1, n - 1);
    for (const s of [-1, 1]) b.add(wheelGeo, WHEEL, trs(s * 5, 2.4, z));
  }
}

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * Built along +Z. `bg` / `fg`: the two colours of the destination entrance
 * (the original paints the carriages with them). Geometries are shared.
 */
export function carriageGeometry(type: number, bg: number, fg: number): THREE.BufferGeometry {
  const key = `${type}:${bg}:${fg}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const b = new GeometryBuilder();
  const a = (geo: THREE.BufferGeometry, c: number, x: number, y: number, z: number) => b.add(geo, c, trs(x, y, z));
  switch (type) {
    case 0: // server (a service trolley)
      a(box(10, 3, 16), 0xffd000, 0, 4, 0);
      a(box(8, 7, 5), 0xffd000, 0, 9, -3);
      a(box(6, 1, 1), 0xff3300, 0, 13, -3);
      wheels(b, 16, 2);
      break;
    case 1: // ancient locomotive
    case 2: // steam locomotive
      a(box(10, 3, 32), DARK, 0, 4, 0);
      a(cylZ(4.5, 20), DARK, 0, 10, 4);
      a(new THREE.CylinderGeometry(1.5, 2, 6, 8), DARK, 0, 17, 12);
      a(box(10, 10, 9), bg, 0, 11, -10);
      a(box(11, 1.5, 10), fg, 0, 16.5, -10);
      wheels(b, 32, type === 1 ? 2 : 3);
      break;
    case 3: // trolley
      a(box(10, 3, 20), DARK, 0, 4, 0);
      a(box(9, 8, 14), bg, 0, 9.5, 0);
      a(box(1, 6, 1), METAL, 0, 16, 0);
      wheels(b, 20, 2);
      break;
    case 4: // diesel
    case 5: // electric
      a(box(10, 3, 34), DARK, 0, 4, 0);
      a(box(10, 9, 32), bg, 0, 10, 0);
      a(box(10.4, 2.5, 32), fg, 0, 9, 0);
      a(box(9, 3, 4), GLASS, 0, 12, 15.5);
      if (type === 5) a(box(6, 1, 8), METAL, 0, 16.5, 0);
      wheels(b, 34, 3);
      break;
    case 6: // high-speed locomotive
      a(box(10, 3, 36), DARK, 0, 4, 0);
      a(box(10, 8, 28), bg, 0, 9.5, -3);
      b.add(new THREE.ConeGeometry(5.5, 12, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2), bg, trs(0, 9, 16));
      a(box(10.4, 2, 28), fg, 0, 11, -3);
      wheels(b, 36, 3);
      break;
    case 7: // passenger carriages
    case 8:
    case 9:
      a(box(10, 3, 32), DARK, 0, 4, 0);
      a(box(10, 9, 30), bg, 0, 10, 0);
      a(box(10.6, 2.5, 26), GLASS, 0, 11, 0);
      a(box(10.4, 1.5, 30), fg, 0, 15, 0);
      wheels(b, 32, 2);
      break;
    case 10: // open freight
      a(box(10, 3, 30), DARK, 0, 4, 0);
      a(box(10, 6, 30), bg, 0, 8, 0);
      a(box(8, 2, 27), 0x3a2a1a, 0, 10, 0);
      wheels(b, 30, 2);
      break;
    case 11: // covered freight
      a(box(10, 3, 30), DARK, 0, 4, 0);
      a(box(10, 10, 30), bg, 0, 10.5, 0);
      a(box(10.6, 1.5, 30), fg, 0, 16, 0);
      wheels(b, 30, 2);
      break;
    case 12: // pocket wagon (a container)
      a(box(10, 3, 30), DARK, 0, 4, 0);
      a(box(9, 7, 22), bg, 0, 9, 0);
      wheels(b, 30, 2);
      break;
    case 13: // tank wagon
      a(box(10, 3, 30), DARK, 0, 4, 0);
      a(cylZ(4.5, 26), bg, 0, 10, 0);
      a(box(2, 2, 2), fg, 0, 15, 0);
      wheels(b, 30, 2);
      break;
    default:
      // crash marker / damaged rail: a warning sign
      a(new THREE.CylinderGeometry(0.8, 0.8, 14, 6), METAL, 0, 7, 0);
      b.add(new THREE.CylinderGeometry(6, 6, 1, 3), 0xff4400, trs(0, 16, 0, 0, Math.PI / 2));
      b.add(box(2, 16, 2), 0xffffff, trs(0, 3, 0, 0, 0, Math.PI / 4));
      b.add(box(2, 16, 2), 0xffffff, trs(0, 3, 0, 0, 0, -Math.PI / 4));
      break;
  }
  const g = b.build();
  cache.set(key, g);
  return g;
}

export function buildCarriageModel(type: number, bg: number, fg: number): THREE.Mesh {
  // own material: the blinking train changes its colour
  const m = new THREE.Mesh(carriageGeometry(type, bg, fg), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = true;
  return m;
}
