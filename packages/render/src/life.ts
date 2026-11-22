// Smoke of steam engines and small animals running across the meadow
// (presentation only). Both are functions of the presentation time `nowMs`
// and a seeded generator, so test mode renders them deterministically.
import * as THREE from 'three';
import { GeometryBuilder, trs } from './merge';
import { prng } from './nature';

// ---- smoke --------------------------------------------------------------------

interface Puff {
  x: number;
  y: number;
  z: number;
  t0: number;
  life: number;
  size: number;
  dark: boolean;
}

export class Smoke {
  private static readonly MAX = 400;
  readonly mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, flatShading: true }),
    Smoke.MAX,
  );
  private readonly puffs: Puff[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();

  constructor() {
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  emit(x: number, y: number, z: number, nowMs: number, dark = false, size = 1, life = 2200): void {
    if (this.puffs.length >= Smoke.MAX) this.puffs.shift();
    this.puffs.push({ x, y, z, t0: nowMs, life, size, dark });
  }

  update(nowMs: number): void {
    let n = 0;
    for (let i = this.puffs.length - 1; i >= 0; --i) {
      const p = this.puffs[i];
      const t = (nowMs - p.t0) / p.life;
      if (t >= 1 || t < 0) {
        if (t >= 1) this.puffs.splice(i, 1);
        continue;
      }
      const s = p.size * (1.6 + t * 5.5);
      const age = (nowMs - p.t0) / 1000;
      this.m.makeScale(s, s * 0.85, s);
      // rises, drifts with the wind and shrinks away at the end
      const fade = t > 0.75 ? 1 - (t - 0.75) * 4 : 1;
      this.m.scale(new THREE.Vector3(fade, fade, fade));
      this.m.setPosition(p.x + age * 9, p.y + age * 13, p.z - age * 6);
      this.mesh.setMatrixAt(n, this.m);
      const g = p.dark ? 0.25 + t * 0.35 : 0.78 + t * 0.2;
      this.mesh.setColorAt(n, this.c.setRGB(g, g, g * 1.02));
      ++n;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---- animals ------------------------------------------------------------------

type Kind = 'rabbit' | 'fox' | 'deer' | 'hedgehog';

interface Legs {
  pivots: THREE.Object3D[];
}

/** a low-poly animal: a body mesh and (for walkers) four legs swinging around the hips */
function buildAnimal(kind: Kind, mat: THREE.Material): { root: THREE.Group; body: THREE.Object3D; legs: Legs } {
  const b = new GeometryBuilder();
  const root = new THREE.Group();
  const box = (w: number, h: number, l: number) => new THREE.BoxGeometry(w, h, l);
  const legs: Legs = { pivots: [] };
  let legColor = 0;
  let legLen = 0;
  let hips: [number, number, number][] = [];
  switch (kind) {
    case 'rabbit': {
      const c = 0xb8a690;
      b.add(new THREE.SphereGeometry(2.2, 8, 6).scale(1, 0.9, 1.3), c, trs(0, 2.4, 0));
      b.add(new THREE.SphereGeometry(1.4, 8, 6), c, trs(0, 4, 2.4));
      for (const s of [-1, 1]) b.add(box(0.5, 3, 0.9), c, trs(s * 0.6, 6.4, 2.0, 0, -0.25, s * 0.15));
      b.add(new THREE.SphereGeometry(0.8, 6, 4), 0xf4f1ea, trs(0, 2.8, -2.8));
      for (const s of [-1, 1]) b.add(box(0.9, 1, 2.8), 0x8a7460, trs(s * 1.4, 0.6, -0.4));
      for (const s of [-1, 1]) b.add(box(0.35, 0.35, 0.2), 0x111111, trs(s * 0.9, 4.4, 3.5));
      break;
    }
    case 'hedgehog': {
      b.add(new THREE.SphereGeometry(2.4, 7, 5).scale(1, 0.75, 1.3), 0x4d3b2c, trs(0, 1.8, 0));
      b.add(new THREE.ConeGeometry(1, 2, 6).rotateX(Math.PI / 2), 0xc9a985, trs(0, 1.4, 3.4));
      b.add(new THREE.SphereGeometry(0.3, 4, 3), 0x111111, trs(0, 1.4, 4.4));
      break;
    }
    case 'fox': {
      const c = 0xd2691e;
      b.add(box(3, 3, 7), c, trs(0, 5, 0));
      b.add(box(2.4, 1.6, 5.4), 0xf3e6d0, trs(0, 3.7, 0.2));
      b.add(box(2.8, 2.6, 2.6), c, trs(0, 6.4, 4.4));
      b.add(box(1.4, 1.2, 2.2), 0xf3e6d0, trs(0, 5.6, 6.4));
      b.add(box(0.5, 0.5, 0.5), 0x111111, trs(0, 5.9, 7.5));
      for (const s of [-1, 1]) b.add(new THREE.ConeGeometry(0.7, 1.8, 4), c, trs(s * 0.9, 8.4, 4.2));
      b.add(box(1.8, 1.8, 6).translate(0, 0, -3), c, trs(0, 5.4, -3.2, 0, 0.45));
      b.add(box(1.6, 1.6, 1.6), 0xfaf5ec, trs(0, 3.4, -8.4));
      legColor = 0x3a2416;
      legLen = 3.6;
      hips = [[-1, 3.6, 2.6], [1, 3.6, 2.6], [-1, 3.6, -2.6], [1, 3.6, -2.6]];
      break;
    }
    case 'deer': {
      const c = 0x9a6a3e;
      b.add(box(4, 4.5, 10), c, trs(0, 9, 0));
      b.add(box(3.2, 1, 8), 0xe8d8bc, trs(0, 6.8, 0));
      b.add(box(2, 6, 2.4), c, trs(0, 12.5, 4.6, 0, 0.45));
      b.add(box(2.4, 2.4, 4), c, trs(0, 15.2, 6.6));
      b.add(box(0.6, 0.6, 0.6), 0x111111, trs(0, 15, 8.7));
      for (const s of [-1, 1]) {
        b.add(box(0.5, 0.5, 2), c, trs(s * 1.6, 16.4, 5.4, s * 0.9));
        // antlers
        b.add(box(0.4, 4, 0.4), 0xe0d0b0, trs(s * 0.9, 18.4, 5.6, 0, 0, s * 0.35));
        b.add(box(0.4, 2.2, 0.4), 0xe0d0b0, trs(s * 1.5, 19, 6.4, 0, 0.6, s * 0.2));
      }
      b.add(box(1.4, 1.6, 1.2), 0xf6f0e4, trs(0, 10, -5.4));
      legColor = 0x6e4a2a;
      legLen = 7;
      hips = [[-1.4, 7.2, 3.8], [1.4, 7.2, 3.8], [-1.4, 7.2, -3.8], [1.4, 7.2, -3.8]];
      break;
    }
  }
  const body = new THREE.Mesh(b.build(), mat);
  body.castShadow = true;
  root.add(body);
  if (legLen) {
    const legGeo = new GeometryBuilder();
    legGeo.add(new THREE.BoxGeometry(0.9, legLen, 0.9).translate(0, -legLen / 2, 0), legColor, new THREE.Matrix4());
    const g = legGeo.build();
    for (const [x, y, z] of hips) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const leg = new THREE.Mesh(g, mat);
      leg.castShadow = true;
      pivot.add(leg);
      body.add(pivot);
      legs.pivots.push(pivot);
    }
  }
  return { root, body, legs };
}

interface Waypoint {
  /** time of arrival, ms after the spawn */
  t: number;
  x: number;
  z: number;
  /** pause at this waypoint before going on, ms */
  pause: number;
}

interface Animal {
  kind: Kind;
  t0: number;
  route: Waypoint[];
  end: number;
  obj: ReturnType<typeof buildAnimal>;
  dx: number;
  dz: number;
}

const SPEED: Record<Kind, number> = { rabbit: 60, fox: 80, deer: 90, hedgehog: 14 };
/** a bit larger than life: they must be noticeable next to the trains */
const SCALE: Record<Kind, number> = { rabbit: 2, fox: 1.5, deer: 1.35, hedgehog: 1.8 };

/**
 * Every 12–30 s a small group of animals crosses the visible field from one
 * side to another, along a wobbly path with short stops.
 */
export class Animals {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly rnd = prng(424242);
  private readonly alive: Animal[] = [];
  private nextSpawn = 6000;
  private lastNow = -1;
  /** visible half extents of the world (x, z) */
  extent = { halfW: 320, halfZ: 700 };

  update(nowMs: number): void {
    if (this.lastNow >= 0 && nowMs < this.lastNow - 1000) {
      // the presentation clock went back (a new game in test mode): start over
      for (const a of this.alive) this.group.remove(a.obj.root);
      this.alive.length = 0;
      this.nextSpawn = nowMs + 6000;
    }
    this.lastNow = nowMs;
    if (nowMs >= this.nextSpawn) {
      this.spawn(this.nextSpawn);
      this.nextSpawn += 12000 + this.rnd() * 18000;
    }
    for (let i = this.alive.length - 1; i >= 0; --i) {
      const a = this.alive[i];
      const t = nowMs - a.t0;
      if (t > a.end) {
        this.group.remove(a.obj.root);
        a.obj.root.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        this.alive.splice(i, 1);
        continue;
      }
      this.pose(a, t);
    }
  }

  private spawn(at: number): void {
    const r = this.rnd;
    const roll = r();
    const kind: Kind = roll < 0.4 ? 'rabbit' : roll < 0.65 ? 'fox' : roll < 0.88 ? 'deer' : 'hedgehog';
    const count = kind === 'rabbit' ? 1 + Math.floor(r() * 3) : kind === 'deer' ? 1 + Math.floor(r() * 2) : 1;
    const { halfW, halfZ } = this.extent;
    const fromLeft = r() < 0.5;
    const margin = 40;
    // hedgehogs are slow: they only take a short walk somewhere in view
    const z0 = (r() - 0.5) * halfZ * 1.5;
    const z1 = Math.max(-halfZ, Math.min(halfZ, z0 + (r() - 0.5) * halfZ));
    for (let k = 0; k < count; ++k) {
      const ox = (r() - 0.5) * 30;
      const oz = (r() - 0.5) * 40;
      let x0 = (fromLeft ? -1 : 1) * (halfW + margin) + ox;
      let x1 = (fromLeft ? 1 : -1) * (halfW + margin) + ox;
      if (kind === 'hedgehog') {
        x0 = (r() - 0.5) * halfW * 1.4;
        x1 = x0 + (fromLeft ? 1 : -1) * 120;
      }
      const route = this.route(kind, x0, z0 + oz, x1, z1 + oz);
      const obj = buildAnimal(kind, this.mat);
      obj.root.scale.setScalar(SCALE[kind]);
      const a: Animal = { kind, t0: at + k * (250 + r() * 500), route, end: route[route.length - 1].t, obj, dx: 1, dz: 0 };
      this.group.add(obj.root);
      this.alive.push(a);
      this.pose(a, Math.max(0, this.lastNow - a.t0));
    }
  }

  private route(kind: Kind, x0: number, z0: number, x1: number, z1: number): Waypoint[] {
    const r = this.rnd;
    const steps = 4 + Math.floor(r() * 4);
    const speed = SPEED[kind] * (0.85 + r() * 0.3);
    const pts: Waypoint[] = [{ t: 0, x: x0, z: z0, pause: 0 }];
    let t = 0;
    let px = x0;
    let pz = z0;
    for (let i = 1; i <= steps; ++i) {
      const f = i / steps;
      const x = x0 + (x1 - x0) * f + (i < steps ? (r() - 0.5) * 60 : 0);
      const z = z0 + (z1 - z0) * f + (i < steps ? (r() - 0.5) * 120 : 0);
      t += (Math.hypot(x - px, z - pz) / speed) * 1000;
      const stop = i < steps && r() < (kind === 'rabbit' || kind === 'hedgehog' ? 0.6 : 0.3) ? 600 + r() * 1800 : 0;
      pts.push({ t, x, z, pause: stop });
      t += stop;
      px = x;
      pz = z;
    }
    return pts;
  }

  private pose(a: Animal, t: number): void {
    const route = a.route;
    // waypoint i is reached at route[i].t and left after route[i].pause
    let i = 1;
    while (i < route.length - 1 && t > route[i].t + route[i].pause) ++i;
    const prev = route[i - 1];
    const next = route[i];
    const depart = prev.t + prev.pause;
    const moving = t < next.t;
    const f = Math.max(0, Math.min(1, (t - depart) / Math.max(1, next.t - depart)));
    const x = prev.x + (next.x - prev.x) * f;
    const z = prev.z + (next.z - prev.z) * f;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    a.dx = dx / len;
    a.dz = dz / len;
    const root = a.obj.root;
    root.position.set(x, 0, z);
    root.rotation.y = Math.atan2(a.dx, a.dz);
    const dist = f * len;
    const body = a.obj.body;
    body.position.y = 0;
    body.rotation.x = 0;
    if (!moving) {
      // a stop: nibbling grass
      if (a.kind === 'rabbit' || a.kind === 'deer') body.rotation.x = 0.15 + Math.sin(t / 180) * 0.05;
      for (const p of a.obj.legs.pivots) p.rotation.x = 0;
      return;
    }
    switch (a.kind) {
      case 'rabbit': {
        const ph = (dist / 14) * Math.PI;
        body.position.y = Math.abs(Math.sin(ph)) * 4;
        body.rotation.x = -Math.cos(ph) * 0.25;
        break;
      }
      case 'hedgehog':
        body.position.y = Math.abs(Math.sin(dist * 1.5)) * 0.3;
        break;
      default: {
        const stride = a.kind === 'deer' ? 16 : 11;
        const ph = (dist / stride) * Math.PI * 2;
        body.position.y = Math.abs(Math.sin(ph)) * (a.kind === 'deer' ? 1.6 : 0.8);
        const legs = a.obj.legs.pivots;
        legs.forEach((p, k) => {
          p.rotation.x = Math.sin(ph + (k === 0 || k === 3 ? 0 : Math.PI)) * 0.6;
        });
      }
    }
  }
}
