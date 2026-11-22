// Low-poly procedural models of the rolling stock (CarriageType of the game).
// Each model is a single merged geometry with vertex colours (one draw call).
import * as THREE from 'three';
import { GeometryBuilder, trs } from './merge';

const DARK = 0x222226;
const METAL = 0x666a70;
const WHEEL = 0x18181a;
const GLASS = 0x9fd3ff;

function shade(color: number, k: number): number {
  return new THREE.Color(color).multiplyScalar(k).getHex();
}

const box = (w: number, h: number, l: number) => new THREE.BoxGeometry(w, h, l);
const cylZ = (r: number, l: number, seg = 12) => new THREE.CylinderGeometry(r, r, l, seg).rotateX(Math.PI / 2);
const wheelGeo = new THREE.CylinderGeometry(2.4, 2.4, 1.5, 10).rotateZ(Math.PI / 2);

function wheels(b: GeometryBuilder, length: number, n: number): void {
  for (let i = 0; i < n; ++i) {
    const z = -length / 2 + 4 + (i * (length - 8)) / Math.max(1, n - 1);
    for (const s of [-1, 1]) b.add(wheelGeo, WHEEL, trs(s * 5, 2.4, z));
  }
}

const BUFFER = new THREE.CylinderGeometry(0.7, 0.7, 1.6, 6).rotateX(Math.PI / 2);

/** buffers and couplers at both ends, a frame below the body */
function chassis(b: GeometryBuilder, length: number): void {
  for (const e of [-1, 1]) {
    for (const s of [-1, 1]) b.add(BUFFER, METAL, trs(s * 3.5, 4, e * (length / 2 + 0.6)));
    b.add(box(1.2, 1, 1.6), DARK, trs(0, 3.6, e * (length / 2 + 0.6)));
  }
  // axle boxes
  b.add(box(10.6, 1.2, length - 8), 0x2a2a2e, trs(0, 2.8, 0));
}

/** a row of windows on both sides */
function windows(b: GeometryBuilder, length: number, n: number, y: number, h: number, color = GLASS): void {
  const step = length / n;
  for (let i = 0; i < n; ++i) {
    const z = -length / 2 + step * (i + 0.5);
    for (const s of [-1, 1]) b.add(box(0.4, h, step * 0.62), color, trs(s * 5.1, y, z));
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
      a(cylZ(4.7, 1), 0xb08d3a, 0, 10, 9);
      a(cylZ(4.7, 1), 0xb08d3a, 0, 10, -1);
      a(cylZ(4.2, 2), 0x2e2e33, 0, 10, 14.5);
      a(new THREE.CylinderGeometry(1.4, 1.4, 0.6, 10).rotateX(Math.PI / 2), 0xfff2a0, 0, 12.5, 15.6);
      // chimney (a wide one on the old engine), steam dome, sand box
      if (type === 1) a(new THREE.CylinderGeometry(2.6, 1.4, 7, 8), DARK, 0, 17.5, 11);
      else a(new THREE.CylinderGeometry(1.5, 2, 6, 8), DARK, 0, 17, 12);
      a(new THREE.SphereGeometry(2, 8, 6), 0xb08d3a, 0, 14.6, 4);
      a(box(3, 2, 3), DARK, 0, 15, -1);
      // cab with windows and a roof
      a(box(10, 10, 9), bg, 0, 11, -10);
      a(box(10.4, 3.4, 3.4), GLASS, 0, 13, -8);
      a(box(11, 1.5, 10), fg, 0, 16.5, -10);
      // cowcatcher
      b.add(box(9, 3, 3), 0x8a1c14, trs(0, 2.4, 16.8, 0, -0.6));
      chassis(b, 32);
      wheels(b, 32, type === 1 ? 2 : 3);
      break;
    case 3: // trolley
      a(box(10, 3, 20), DARK, 0, 4, 0);
      a(box(9, 8, 14), bg, 0, 9.5, 0);
      windows(b, 14, 3, 10.5, 3);
      a(box(9.6, 1, 15), fg, 0, 14, 0);
      a(box(1, 6, 1), METAL, 0, 17, 0);
      chassis(b, 20);
      wheels(b, 20, 2);
      break;
    case 4: // diesel
    case 5: // electric
      a(box(10, 3, 34), DARK, 0, 4, 0);
      a(box(10, 9, 32), bg, 0, 10, 0);
      a(box(10.4, 2.5, 32), fg, 0, 9, 0);
      a(box(9, 3, 4), GLASS, 0, 12, 15.5);
      a(box(9, 3, 4), GLASS, 0, 12, -15.5);
      a(box(9.6, 1, 33), shade(bg, 0.75), 0, 15, 0);
      windows(b, 20, 5, 12, 1.6, 0x3a3f48);
      if (type === 5) {
        // pantograph
        a(box(6, 1, 8), METAL, 0, 16.5, 0);
        b.add(box(0.5, 0.5, 8), METAL, trs(0, 18.5, 2, 0, 0.5));
        a(box(7, 0.5, 1), METAL, 0, 20.5, 5.5);
      } else {
        a(box(4, 1.5, 3), DARK, 0, 16, -6);
        a(box(4, 1.5, 3), DARK, 0, 16, 6);
      }
      chassis(b, 34);
      wheels(b, 34, 3);
      break;
    case 6: // high-speed locomotive
      a(box(10, 3, 36), DARK, 0, 4, 0);
      a(box(10, 8, 28), bg, 0, 9.5, -3);
      b.add(new THREE.ConeGeometry(5.5, 12, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2), bg, trs(0, 9, 16));
      a(box(10.4, 2, 28), fg, 0, 11, -3);
      b.add(box(8, 2.6, 5), GLASS, trs(0, 12.2, 13, 0, -0.5));
      windows(b, 22, 6, 12.5, 1.8, 0x3a3f48);
      chassis(b, 36);
      wheels(b, 36, 3);
      break;
    case 7: // passenger carriages
    case 8:
    case 9:
      a(box(10, 3, 32), DARK, 0, 4, 0);
      a(box(10, 9, 30), bg, 0, 10, 0);
      windows(b, 26, 7, 11.5, 3);
      a(box(10.4, 1, 30), fg, 0, 8, 0);
      // rounded roof
      a(new THREE.CylinderGeometry(5.4, 5.4, 30, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.35, 1), shade(fg, 0.85), 0, 14.5, 0);
      chassis(b, 32);
      wheels(b, 32, 2);
      break;
    case 10: // open freight
      a(box(10, 3, 30), DARK, 0, 4, 0);
      a(box(10, 6, 30), bg, 0, 8, 0);
      for (let i = -2; i <= 2; ++i) a(box(10.4, 6.2, 0.6), shade(bg, 0.7), 0, 8, i * 6.5);
      // a load of coal
      b.add(new THREE.CylinderGeometry(4.2, 4.6, 3, 6, 1).rotateX(Math.PI / 2).scale(1, 0.6, 6.3), 0x26221f, trs(0, 11, 0));
      chassis(b, 30);
      wheels(b, 30, 2);
      break;
    case 11: // covered freight
      a(box(10, 3, 30), DARK, 0, 4, 0);
      a(box(10, 10, 30), bg, 0, 10.5, 0);
      for (let i = -3; i <= 3; ++i) a(box(10.3, 10, 0.4), shade(bg, 0.82), 0, 10.5, i * 4.2);
      a(box(10.4, 7, 6), shade(bg, 0.6), 0, 10, 0);
      a(box(10.6, 1.5, 30), fg, 0, 16, 0);
      chassis(b, 30);
      wheels(b, 30, 2);
      break;
    case 12: // pocket wagon (a container)
      a(box(10, 3, 30), DARK, 0, 4, 0);
      a(box(9, 7, 11), bg, 0, 9, -5.8);
      a(box(9, 7, 11), fg, 0, 9, 5.8);
      for (const z of [-5.8, 5.8]) for (let i = -2; i <= 2; ++i) a(box(9.3, 6.6, 0.4), 0x55585e, 0, 9, z + i * 2);
      chassis(b, 30);
      wheels(b, 30, 2);
      break;
    case 13: // tank wagon
      a(box(10, 3, 30), DARK, 0, 4, 0);
      a(cylZ(4.5, 26), bg, 0, 10, 0);
      for (const z of [-12, -4, 4, 12]) a(cylZ(4.7, 0.6), shade(bg, 0.7), 0, 10, z);
      a(new THREE.CylinderGeometry(1.6, 1.6, 2, 8), fg, 0, 15, 0);
      a(box(10.4, 0.4, 26), METAL, 0, 13.6, 0);
      chassis(b, 30);
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
