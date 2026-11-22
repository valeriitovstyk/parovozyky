// Geometry merging with per-vertex colours: one draw call per layer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class GeometryBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];

  /** adds `geo` transformed by `m` with a flat colour (the source geometry is not modified) */
  add(geo: THREE.BufferGeometry, color: number, m: THREE.Matrix4): void {
    let g = geo.clone();
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('uv');
    g.applyMatrix4(m);
    const n = g.getAttribute('position').count;
    const c = new THREE.Color(color);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; ++i) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = this.parts.length ? mergeGeometries(this.parts, false)! : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    return g;
  }
}

export function trs(x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ'));
  m.setPosition(x, y, z);
  return m;
}
