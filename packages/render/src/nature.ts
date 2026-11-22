// Grass, flowers, stones and bushes on the ground (presentation only).
// Everything is instanced; positions come from a seeded generator, so a scene
// looks the same every time (and screenshot tests stay stable).
import * as THREE from 'three';

/** mulberry32 */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tileable grass texture: soft patches of different greens and specks */
export function grassTexture(size = 512): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5d9a31';
  g.fillRect(0, 0, size, size);
  const r = prng(7);
  const blob = (x: number, y: number, rad: number, color: string, alpha: number) => {
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        gr.addColorStop(0, color);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = alpha;
        g.fillStyle = gr;
        g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
  };
  const tones = ['#4c8a26', '#6fae3c', '#548f2b', '#7ab445', '#3f7a22', '#8aa13e'];
  for (let i = 0; i < 70; ++i) blob(r() * size, r() * size, 30 + r() * 90, tones[i % tones.length], 0.35);
  // small specks: blades, clover, dry grass
  g.globalAlpha = 1;
  for (let i = 0; i < 9000; ++i) {
    const x = r() * size;
    const y = r() * size;
    const t = r();
    g.fillStyle = t < 0.45 ? '#3d7420' : t < 0.8 ? '#86c04f' : t < 0.95 ? '#9fb257' : '#c7c27a';
    g.fillRect(x, y, 1 + (t > 0.9 ? 1 : 0), 1 + r() * 2.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** a tuft: a few crossed blades, darker at the base (vertex colours) */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const blades = 5;
  const base = new THREE.Color(0x2c5216);
  const tip = new THREE.Color(0x7cb846);
  for (let i = 0; i < blades; ++i) {
    const a = (i / blades) * Math.PI * 2 + i * 0.7;
    const lean = 0.35 + (i % 3) * 0.2;
    const h = 3.2 + (i % 4) * 0.9;
    const w = 0.55;
    const ox = Math.cos(a) * 0.8;
    const oz = Math.sin(a) * 0.8;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    const tx = ox + Math.cos(a) * lean * h * 0.4;
    const tz = oz + Math.sin(a) * lean * h * 0.4;
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, h, tz);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** wind: blades sway by their height (instanced shader patch) */
function windMaterial<M extends THREE.Material>(base: M, time: { value: number }, strength: number): M {
  base.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // geometry is baked in world space: the phase follows the position
        float ph = position.x * 0.043 + position.z * 0.061;
        float sway = sin(uTime * 1.7 + ph) * 0.6 + sin(uTime * 3.1 + ph * 1.7) * 0.25;
        transformed.x += sway * ${strength.toFixed(3)} * transformed.y;
        transformed.z += sway * ${(strength * 0.5).toFixed(3)} * transformed.y;`,
      );
  };
  return base;
}

/**
 * Many copies of one small geometry baked into a single mesh. (Software WebGL
 * draws instanced meshes very slowly; a plain buffer is cheap everywhere.)
 * The API mirrors InstancedMesh: setMatrixAt / setColorAt / count.
 */
class Batch {
  private readonly src: THREE.BufferGeometry;
  private readonly pos: Float32Array;
  private readonly nrm: Float32Array;
  private readonly col: Float32Array;
  private readonly vpi: number;
  private readonly nm = new THREE.Matrix3();
  private readonly v = new THREE.Vector3();
  count = 0;

  constructor(
    geo: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    max: number,
  ) {
    this.src = geo.index ? geo.toNonIndexed() : geo;
    if (!this.src.getAttribute('normal')) this.src.computeVertexNormals();
    this.vpi = this.src.getAttribute('position').count;
    this.pos = new Float32Array(max * this.vpi * 3);
    this.nrm = new Float32Array(max * this.vpi * 3);
    this.col = new Float32Array(max * this.vpi * 3).fill(1);
  }

  setMatrixAt(i: number, m: THREE.Matrix4): void {
    const p = this.src.getAttribute('position');
    const n = this.src.getAttribute('normal');
    this.nm.getNormalMatrix(m);
    const o = i * this.vpi * 3;
    for (let k = 0; k < this.vpi; ++k) {
      const j = o + k * 3;
      this.v.fromBufferAttribute(p, k).applyMatrix4(m).toArray(this.pos, j);
      this.v.fromBufferAttribute(n, k).applyMatrix3(this.nm).normalize().toArray(this.nrm, j);
    }
  }

  setColorAt(i: number, c: THREE.Color): void {
    const sc = this.src.getAttribute('color');
    const o = i * this.vpi * 3;
    for (let k = 0; k < this.vpi; ++k) {
      const r = sc ? sc.getX(k) : 1;
      const g = sc ? sc.getY(k) : 1;
      const b = sc ? sc.getZ(k) : 1;
      const j = o + k * 3;
      this.col[j] = r * c.r;
      this.col[j + 1] = g * c.g;
      this.col[j + 2] = b * c.b;
    }
  }

  build(): THREE.Mesh {
    const len = this.count * this.vpi * 3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, len), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, len), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, len), 3));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, this.material);
  }
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

/** a spatial hash of circles: is a point free? */
class Blockers {
  private readonly cells = new Map<string, Obstacle[]>();
  constructor(private readonly cell = 24) {}

  add(o: Obstacle): void {
    const c = this.cell;
    for (let x = Math.floor((o.x - o.r) / c); x <= Math.floor((o.x + o.r) / c); ++x)
      for (let z = Math.floor((o.z - o.r) / c); z <= Math.floor((o.z + o.r) / c); ++z) {
        const k = `${x},${z}`;
        let l = this.cells.get(k);
        if (!l) this.cells.set(k, (l = []));
        l.push(o);
      }
  }

  free(x: number, z: number): boolean {
    const l = this.cells.get(`${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`);
    if (!l) return true;
    for (const o of l) if ((o.x - x) ** 2 + (o.z - z) ** 2 < o.r * o.r) return false;
    return true;
  }
}

/** world area covered by decorations (the field and a margin for wide screens) */
const AREA = { x0: -1100, x1: 1100, z0: -1000, z1: 1050 };

/** is the world point on a tile where rails can be built? (bushes and big stones stay away) */
export type Predicate = (x: number, z: number) => boolean;

/** smooth value noise in [0, 1] (for meadow patches) */
export function valueNoise(seed: number): (x: number, y: number) => number {
  const hash = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + seed * 144665;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = sm(x - i);
    const fy = sm(y - j);
    const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * fx;
    const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

/** the ground: a tiled grass texture modulated by large meadow patches (vertex colours) */
export function groundMesh(): THREE.Mesh {
  const W = 6000;
  const H = 8000;
  const geo = new THREE.PlaneGeometry(W, H, 60, 80);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; ++i) uv.setXY(i, uv.getX(i) * (W / 230), uv.getY(i) * (H / 230));
  const pos = geo.getAttribute('position');
  const noise = valueNoise(3);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; ++i) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const n = noise(x / 260, y / 260) * 0.6 + noise(x / 90, y / 90) * 0.4;
    // darker lush patches and lighter dry ones
    const k = 0.82 + n * 0.32;
    col.set([k * (0.95 + (n - 0.5) * 0.25), k, k * (0.9 - (n - 0.5) * 0.2)], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: grassTexture(), vertexColors: true }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function bushGeometry(): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(5, 0);
  const p = g.getAttribute('position');
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; ++i) {
    const y = p.getY(i);
    const k = 0.75 + (y / 5) * 0.25 + (((i * 7919) % 13) / 13 - 0.5) * 0.15;
    c.set([0.2 * k, 0.4 * k, 0.1 * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** a flower: a thin stem and a head (vertex colours: the stem stays green) */
function flowerGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.15, 0.2, 3, 3, 1, true).translate(0, 1.5, 0).toNonIndexed();
  const head = new THREE.OctahedronGeometry(1, 0).scale(1, 0.55, 1).translate(0, 3.2, 0);
  const g = new THREE.BufferGeometry();
  const a = stem.getAttribute('position').array as Float32Array;
  const b = head.getAttribute('position').array as Float32Array;
  const pos = new Float32Array(a.length + b.length);
  pos.set(a);
  pos.set(b, a.length);
  const col = new Float32Array(pos.length);
  for (let i = 0; i < a.length; i += 3) col.set([0.25, 0.45, 0.18], i);
  col.fill(1, a.length);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class Nature {
  readonly group = new THREE.Group();
  readonly time = { value: 0 };
  private level = 1;
  private readonly fine: THREE.Object3D[] = [];
  private readonly tuftGeo = tuftGeometry();
  private readonly flowerGeo = flowerGeometry();
  private readonly stoneGeo = new THREE.DodecahedronGeometry(2.4, 0);
  private readonly bushGeo = bushGeometry();
  // unlit (cheap: there are thousands of them); the colours already include the light
  private readonly tuftMat = windMaterial(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), this.time, 0.09);
  private readonly flowerMat = windMaterial(new THREE.MeshBasicMaterial({ vertexColors: true }), this.time, 0.06);
  private readonly stoneMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly bushMat = windMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.time, 0.015);

  /** rebuilds all decorations avoiding the obstacles (tracks, houses, trees) */
  rebuild(obstacles: Obstacle[], buildable: Predicate): void {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c instanceof THREE.Mesh) c.geometry.dispose();
    }
    const blockers = new Blockers();
    for (const o of obstacles) blockers.add(o);
    const r = prng(20260);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    const meadow = valueNoise(11);
    const randomPoint = () => [AREA.x0 + r() * (AREA.x1 - AREA.x0), AREA.z0 + r() * (AREA.z1 - AREA.z0)];
    const spin = () => q.setFromEuler(e.set(0, r() * Math.PI * 2, 0));

    // grass tufts, in clumps; denser in lush patches
    const TUFTS = 11000;
    const tufts = new Batch(this.tuftGeo, this.tuftMat, TUFTS);
    let n = 0;
    for (let tries = 0; n < TUFTS && tries < TUFTS; ++tries) {
      const [cx, cz] = randomPoint();
      const lush = meadow(cx / 120, cz / 120);
      if (r() > lush * 1.4) continue;
      const k = 3 + Math.floor(lush * 6);
      for (let j = 0; j < k && n < TUFTS; ++j) {
        const x = cx + (r() - 0.5) * 18;
        const z = cz + (r() - 0.5) * 18;
        if (!blockers.free(x, z)) continue;
        const sc = 0.7 + r() * 0.7 + lush * 0.4;
        m.compose(p.set(x, 0, z), spin(), s.set(sc, sc * (0.8 + r() * 0.6), sc));
        tufts.setMatrixAt(n, m);
        tufts.setColorAt(n, c.setHSL(0.22 + r() * 0.07, 0.4 + r() * 0.2, 0.7 + r() * 0.3));
        ++n;
      }
    }
    tufts.count = n;
    this.fine.length = 0;
    this.fine.push(tufts.build());

    // flowers: patches of one colour
    const FLOWERS = 1800;
    const flowers = new Batch(this.flowerGeo, this.flowerMat, FLOWERS);
    const palette = [0xfff36b, 0xffffff, 0xc98cff, 0xff5a5a, 0x7fc8ff, 0xffb347, 0xffffff, 0xfff36b];
    n = 0;
    for (let patch = 0; n < FLOWERS && patch < 600; ++patch) {
      const [cx, cz] = randomPoint();
      const color = palette[patch % palette.length];
      for (let j = 0; j < 10 && n < FLOWERS; ++j) {
        const x = cx + (r() - 0.5) * 34;
        const z = cz + (r() - 0.5) * 34;
        if (!blockers.free(x, z)) continue;
        const sc = 0.8 + r() * 0.6;
        m.compose(p.set(x, 0, z), spin(), s.set(sc, sc * (0.8 + r() * 0.5), sc));
        flowers.setMatrixAt(n, m);
        flowers.setColorAt(n, c.set(color).multiplyScalar(0.7 + r() * 0.15));
        ++n;
      }
    }
    flowers.count = n;
    this.fine.push(flowers.build());
    for (const o of this.fine) o.visible = this.level > 0;
    this.group.add(...this.fine);

    // stones: small ones anywhere, big ones only where nothing can be built
    const STONES = 260;
    const stones = new Batch(this.stoneGeo, this.stoneMat, STONES);
    n = 0;
    for (let tries = 0; n < STONES && tries < STONES * 4; ++tries) {
      const [x, z] = randomPoint();
      if (!blockers.free(x, z)) continue;
      const big = !buildable(x, z) && r() < 0.35;
      const k = big ? 1.6 + r() * 2.2 : 0.4 + r() * 0.8;
      q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3));
      m.compose(p.set(x, 0.5 * k, z), q, s.set(k * (1 + r() * 0.8), k * (0.5 + r() * 0.3), k));
      stones.setMatrixAt(n, m);
      stones.setColorAt(n, c.setHSL(0.08 + r() * 0.05, 0.06 + r() * 0.06, 0.42 + r() * 0.25));
      ++n;
    }
    stones.count = n;
    const stoneMesh = stones.build();
    stoneMesh.receiveShadow = true;
    this.group.add(stoneMesh);

    // bushes: clusters of blobs, only where nothing can be built (they would look like obstacles)
    const BUSHES = 140;
    const bushes = new Batch(this.bushGeo, this.bushMat, BUSHES * 4);
    n = 0;
    for (let tries = 0, placed = 0; placed < BUSHES && tries < BUSHES * 8; ++tries) {
      const [x, z] = randomPoint();
      if (buildable(x, z) || !blockers.free(x, z)) continue;
      ++placed;
      const parts = 2 + Math.floor(r() * 3);
      for (let j = 0; j < parts; ++j) {
        const k = 0.6 + r() * 0.7;
        m.compose(p.set(x + (r() - 0.5) * 10, 3.2 * k, z + (r() - 0.5) * 10), spin(), s.set(k * 1.25, k * 0.95, k * 1.25));
        bushes.setMatrixAt(n, m);
        bushes.setColorAt(n, c.setHSL(0.2 + r() * 0.06, 0.45, 0.65 + r() * 0.3));
        ++n;
      }
    }
    bushes.count = n;
    const bushMesh = bushes.build();
    bushMesh.castShadow = true;
    bushMesh.receiveShadow = true;
    this.group.add(bushMesh);
  }

  update(nowMs: number): void {
    this.time.value = nowMs / 1000;
  }

  /** 1: everything; 0: without the grass tufts and flowers */
  get detail(): number {
    return this.level;
  }

  set detail(v: number) {
    this.level = v;
    for (const o of this.fine) o.visible = v > 0;
  }
}
