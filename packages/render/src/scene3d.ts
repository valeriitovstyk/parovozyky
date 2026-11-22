// Modern renderer: a Three.js scene built from the simulator state (read only).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Sim, type World, tables } from '@parovozyky/sim';

const { allowedRailCursorTypes } = tables;
import { cameraSetup, layoutFor, type Layout, worldFromLogical } from './projection';
import { centerline, tileOrigin } from './railGeometry';
import { PALETTE, colorOf } from './palette';
import { TrainInterpolator } from './interpolation';
import { buildCarriageModel } from './models';
import { GeometryBuilder, trs } from './merge';

const STEEL_GAUGE = 3.6;
const BALLAST_HALF = 9;

interface RailKey {
  tileX: number;
  tileY: number;
  type: number;
}

function railKey(r: RailKey): string {
  return `${r.tileX},${r.tileY},${r.type}`;
}

/** world point of a rail step (smoothed centerline) */
function railPoint(rail: { x: number; y: number; type: number }, step: number, h = 0): THREE.Vector3 {
  const line = centerline(rail.type);
  const p = line[Math.max(0, Math.min(line.length - 1, step))];
  const w = worldFromLogical(rail.x + p.x, rail.y + p.y, h);
  return new THREE.Vector3(w.x, w.y, w.z);
}

/** a flat ribbon along a polyline (in the XZ plane, at height h) */
function ribbon(points: THREE.Vector3[], offsetA: number, offsetB: number, h: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < points.length; ++i) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    const n = new THREE.Vector3(-t.z, 0, t.x);
    const p = points[i];
    pos.push(p.x + n.x * offsetA, h, p.z + n.z * offsetA, p.x + n.x * offsetB, h, p.z + n.z * offsetB);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const SLEEPER = new THREE.BoxGeometry(BALLAST_HALF * 1.6, 1.2, 2.2);
const STOP_POST = new THREE.BoxGeometry(1.6, 8, 1.6);
const STOP_BEAM = new THREE.BoxGeometry(BALLAST_HALF * 1.5, 3, 1.6);
const STOP_STRIPE = new THREE.BoxGeometry(BALLAST_HALF * 0.5, 3.1, 0.3);
const TRUNK = new THREE.CylinderGeometry(1.4, 1.8, 7, 6);
const CROWN = new THREE.ConeGeometry(7, 18, 7);
const ROUND = new THREE.SphereGeometry(8, 8, 6);
const MAST = new THREE.CylinderGeometry(0.8, 1, 22, 6);
const LAMP = new THREE.SphereGeometry(3, 10, 8);
const DISK = new THREE.CylinderGeometry(4, 4, 1.5, 12);
const LEVER = new THREE.BoxGeometry(2, 2, 12);
const FLAG = new THREE.BoxGeometry(1, 10, 12);

interface Layers {
  plan: THREE.BufferGeometry[];
  ballast: THREE.BufferGeometry[];
  ballastBuilding: THREE.BufferGeometry[];
  steel: THREE.BufferGeometry[];
  sleepers: GeometryBuilder;
}

export interface RendererOptions {
  shadows: boolean;
}

export class ModernRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private layout: Layout = layoutFor(640, 480);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);

  private readonly railGroup = new THREE.Group();
  private readonly objectGroup = new THREE.Group();
  private readonly signalGroup = new THREE.Group();
  private readonly trainGroup = new THREE.Group();
  private readonly fxGroup = new THREE.Group();
  private readonly gridLines: THREE.LineSegments;
  /** construction mode: the area where nothing can be built (dimmed) */
  private readonly blocked: THREE.Mesh;
  private readonly cursorGroup = new THREE.Group();
  /** logical pointer position: the switch/semaphore/entrance a click would act on is highlighted */
  pointer: { x: number; y: number } | null = null;
  private readonly highlight = new THREE.Mesh(
    new THREE.RingGeometry(7, 9.5, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xfff066, transparent: true, opacity: 0.9, depthTest: false }),
  );

  private railSig = '';
  private objectSig = -1;
  private signalSig = -1;
  private cursorSig = '';
  private readonly stages = new Map<string, { key: RailKey; stage: number }>();
  private readonly interp = new TrainInterpolator();
  private readonly carriageMeshes = new Map<number, THREE.Mesh>();
  private readonly explosions: { obj: THREE.Points; t0: number; vel: Float32Array }[] = [];

  private readonly mats = {
    ballast: new THREE.MeshLambertMaterial({ color: 0x8c8a84 }),
    ballastBuilding: new THREE.MeshLambertMaterial({ color: 0x6b6a66, transparent: true, opacity: 0.7 }),
    steel: new THREE.MeshLambertMaterial({ color: 0x2b2b30 }),
    sleeper: new THREE.MeshLambertMaterial({ color: 0x5a3b22 }),
    plan: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    ghost: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
    vertex: new THREE.MeshLambertMaterial({ vertexColors: true }),
    lamp: new THREE.MeshBasicMaterial({ vertexColors: true }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x6b4423 }),
    roof: new THREE.MeshLambertMaterial({ color: 0x7a2e1d }),
    mast: new THREE.MeshLambertMaterial({ color: 0xdddddd }),
    crash: new THREE.MeshLambertMaterial({ color: 0xff5500 }),
  };

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly opts: RendererOptions = { shadows: true },
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(0x3f6e1e);
    this.scene.fog = new THREE.Fog(0x3f6e1e, 2600, 4200);

    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a6a2a, 1.1));
    this.sun.position.set(-500, 900, 400);
    this.sun.castShadow = opts.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -900;
    sc.right = 900;
    sc.top = 900;
    sc.bottom = -900;
    sc.near = 10;
    sc.far = 3000;
    this.scene.add(this.sun);

    // ground: the field plus a decorative margin for wide screens
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 8000),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE[0]).multiplyScalar(0.92) }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.gridLines = this.buildGrid();
    this.blocked = this.buildBlockedArea();
    this.scene.add(this.blocked);
    this.highlight.renderOrder = 10;
    this.scene.add(this.highlight);
    this.scene.add(this.gridLines, this.railGroup, this.objectGroup, this.signalGroup, this.trainGroup, this.fxGroup, this.cursorGroup);
  }

  resize(width: number, height: number): void {
    this.layout = layoutFor(width, height);
    this.renderer.setSize(width, height, false);
    const s = cameraSetup(this.layout);
    Object.assign(this.camera, { left: s.left, right: s.right, top: s.top, bottom: s.bottom, near: s.near, far: s.far });
    this.camera.position.set(s.position.x, s.position.y, s.position.z);
    this.camera.lookAt(s.target.x, s.target.y, s.target.z);
    this.camera.updateProjectionMatrix();
  }

  get currentLayout(): Layout {
    return this.layout;
  }

  /** presentation events of the simulator (construction stages, explosions) */
  onEvent(e: { type: string; [k: string]: unknown }, nowMs: number): void {
    if (e.type === 'railStage') {
      const key = { tileX: e.tileX as number, tileY: e.tileY as number, type: e.railType as number };
      const k = railKey(key);
      if ((e.stage as number) < 0 || (e.stage as number) >= 3) this.stages.delete(k);
      else this.stages.set(k, { key, stage: e.stage as number });
      this.railSig = '';
    } else if (e.type === 'explosion') {
      this.addExplosion(e.x as number, e.y as number, nowMs);
    }
  }

  render(sim: Sim, nowMs: number): void {
    const w = sim.world;
    this.updateRails(w);
    this.updateObjects(w);
    this.updateSignals(w);
    this.updateCursor(w);
    this.updateTrains(w, sim.now, nowMs);
    this.updateFx(nowMs);
    this.gridLines.visible = w.gridVisible;
    this.blocked.visible = w.gridVisible;
    this.updateHighlight(w);
    this.renderer.render(this.scene, this.camera);
  }

  // ---- rails ----------------------------------------------------------------

  private updateRails(w: World): void {
    const built: RailKey[] = [];
    for (let i = 0; i < w.railRoadCount; ++i) {
      const r = w.railRoad[i];
      built.push({ tileX: r.tileX, tileY: r.tileY, type: r.railType });
    }
    // steel is laid between minPathStep and maxPathStep: a disabled switch branch shows a gap
    const sig =
      built.map(railKey).join(';') +
      '|' +
      built.map((k) => {
        const r = w.rail(k.tileX, k.tileY, k.type);
        return `${r.minPathStep}-${r.maxPathStep}`;
      }).join(';') +
      '|' +
      [...this.stages.values()].map((s) => railKey(s.key) + ':' + s.stage).join(';') +
      '|' +
      w.entranceCount;
    if (sig === this.railSig) return;
    this.railSig = sig;
    disposeChildren(this.railGroup);

    const builtSet = new Set(built.map(railKey));
    const layers: Layers = { plan: [], ballast: [], ballastBuilding: [], steel: [], sleepers: new GeometryBuilder() };
    for (const k of built) {
      const r = w.rail(k.tileX, k.tileY, k.type);
      this.addTrack(layers, r, r.minPathStep, r.maxPathStep, 'built');
      // a buffer stop at every free end: here the network can be extended
      // (the classic view draws the impasse sign, drawImpasse)
      for (let slot = 0; slot < 2; ++slot) if (!r.connections[slot].rail) this.addBufferStop(layers, r, slot);
    }
    for (const st of this.stages.values()) {
      if (builtSet.has(railKey(st.key))) continue;
      const o = tileOrigin(st.key.tileX, st.key.tileY);
      const rail = { x: o.x, y: o.y, type: st.key.type };
      const size = centerline(st.key.type).length;
      this.addTrack(layers, rail, 0, size - 1, st.stage === 0 ? 'plan' : st.stage === 1 ? 'ballast' : 'sleepers');
    }
    const addLayer = (geos: THREE.BufferGeometry[], mat: THREE.Material, receive: boolean) => {
      if (!geos.length) return;
      const m = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
      geos.forEach((g) => g.dispose());
      m.receiveShadow = receive;
      this.railGroup.add(m);
    };
    addLayer(layers.ballast, this.mats.ballast, true);
    addLayer(layers.ballastBuilding, this.mats.ballastBuilding, true);
    addLayer(layers.steel, this.mats.steel, false);
    addLayer(layers.plan, this.mats.plan, false);
    if (!layers.sleepers.empty) {
      const m = new THREE.Mesh(layers.sleepers.build(), this.mats.vertex);
      m.receiveShadow = true;
      this.railGroup.add(m);
    }
    // entrances: portals at the screen edge
    for (let i = 0; i < w.entranceCount; ++i) {
      const e = w.entrances[i];
      const p = worldFromLogical(e.rail.x, e.rail.y);
      const portal = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: colorOf(e.bgColor) });
      const dark = new THREE.MeshLambertMaterial({ color: colorOf(e.fgColor) });
      const postGeo = new THREE.BoxGeometry(4, 34, 4);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, dark);
        post.position.set(s * 14, 17, 0);
        post.castShadow = true;
        portal.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(36, 7, 6), mat);
      beam.position.set(0, 36, 0);
      beam.castShadow = true;
      portal.add(beam);
      portal.position.set(p.x, 0, p.z);
      portal.rotation.y = e.rail.x < 320 ? Math.PI / 4 : -Math.PI / 4;
      portal.userData.entrance = i;
      this.railGroup.add(portal);
    }
  }

  private addTrack(
    layers: Layers,
    rail: { x: number; y: number; type: number },
    minStep: number,
    maxStep: number,
    kind: 'built' | 'plan' | 'ballast' | 'sleepers',
  ) {
    const line = centerline(rail.type);
    const pts = line.map((_, i) => railPoint(rail, i));
    if (kind === 'plan') {
      layers.plan.push(ribbon(pts, -BALLAST_HALF, BALLAST_HALF, 0.6));
      return;
    }
    (kind === 'ballast' ? layers.ballastBuilding : layers.ballast).push(ribbon(pts, -BALLAST_HALF, BALLAST_HALF, 0.5));
    if (kind === 'ballast') return;
    const step = 6;
    for (let k = 3; k < pts.length; k += step) {
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      layers.sleepers.add(SLEEPER, 0x5a3b22, trs(pts[k].x, 1, pts[k].z, ang + Math.PI / 2));
    }
    if (kind === 'sleepers') return;
    const lo = Math.max(0, minStep);
    const hi = Math.min(pts.length - 1, maxStep);
    if (hi <= lo) return;
    const steel = pts.slice(lo, hi + 1);
    for (const sgn of [-1, 1]) layers.steel.push(ribbon(steel, sgn * STEEL_GAUGE - 0.7, sgn * STEEL_GAUGE + 0.7, 2));
  }

  private addBufferStop(layers: Layers, rail: { x: number; y: number; type: number }, slot: number): void {
    const n = centerline(rail.type).length;
    const end = slot ? n - 1 : 0;
    const inner = slot ? n - 4 : 3;
    const p = railPoint(rail, end);
    const q = railPoint(rail, inner);
    const ang = Math.atan2(p.x - q.x, p.z - q.z);
    const s = Math.sin(ang);
    const c = Math.cos(ang);
    const at = (along: number, side: number, h: number) => ({ x: q.x + s * along + c * side, z: q.z + c * along - s * side, h });
    for (const side of [-STEEL_GAUGE, STEEL_GAUGE]) {
      const pt = at(0, side, 4);
      layers.sleepers.add(STOP_POST, 0x3a3a3a, trs(pt.x, pt.h, pt.z, ang));
    }
    const beam = at(0, 0, 8);
    layers.sleepers.add(STOP_BEAM, 0xd8261c, trs(beam.x, beam.h, beam.z, ang));
    const stripe = at(0.9, 0, 8);
    layers.sleepers.add(STOP_STRIPE, 0xffffff, trs(stripe.x, stripe.h, stripe.z, ang));
  }

  // ---- houses and trees -------------------------------------------------------

  private updateObjects(w: World): void {
    let sig = 17;
    for (const o of w.staticObjects) sig = (Math.imul(sig, 31) + o.kind * 7919 + o.x * 131 + o.y * 17 + o.type + o.color * 3) | 0;
    if (sig === this.objectSig) return;
    this.objectSig = sig;
    disposeChildren(this.objectGroup);
    const b = new GeometryBuilder();
    for (const o of w.staticObjects) {
      // glyphs are 16x16 at (x, y); the object stands at the bottom centre
      const base = worldFromLogical(o.x + 8, o.y + 14);
      if (o.kind === 3) {
        b.add(TRUNK, 0x6b4423, trs(base.x, 3.5, base.z));
        const crown = new THREE.Color(colorOf(o.color)).multiplyScalar(0.85).getHex();
        if (o.type % 2) b.add(ROUND, crown, trs(base.x, 13, base.z));
        else b.add(CROWN, crown, trs(base.x, 15, base.z));
      } else if (o.kind === 2) {
        const wdt = 12 + (o.type % 3) * 3;
        const h = 12 + o.type * 2;
        b.add(new THREE.BoxGeometry(wdt, h, 12), colorOf(o.color), trs(base.x, h / 2, base.z, Math.PI / 4));
        b.add(new THREE.ConeGeometry(wdt * 0.8, 8, 4).rotateY(Math.PI / 4), 0x7a2e1d, trs(base.x, h + 4, base.z, Math.PI / 4));
      }
    }
    if (b.empty) return;
    const m = new THREE.Mesh(b.build(), this.mats.vertex);
    m.castShadow = true;
    m.receiveShadow = true;
    this.objectGroup.add(m);
  }

  // ---- switches and semaphores ----------------------------------------------

  private updateSignals(w: World): void {
    const blink = w.video.blinkingColor & 1;
    let sig = blink;
    for (let i = 0; i < w.semaphoreCount; ++i) {
      const sm = w.semaphores[i];
      sig = (Math.imul(sig, 31) + sm.pixelX * 7 + sm.pixelY * 13 + (sm.isRed ? 1 : 0)) | 0;
    }
    for (let i = 0; i < w.nSwitches; ++i) {
      const sw = w.switches[i];
      sig = (Math.imul(sig, 31) + sw.x * 5 + sw.y * 11 + (sw.entry.rail?.id ?? 0)) | 0;
    }
    for (const e of w.entrances) sig = (Math.imul(sig, 31) + e.waitingTrainsCount) | 0;
    sig = (Math.imul(sig, 31) + w.entranceCount) | 0;
    if (sig === this.signalSig) return;
    this.signalSig = sig;
    disposeChildren(this.signalGroup);
    const solid = new GeometryBuilder();
    const lamps = new GeometryBuilder();
    for (let i = 0; i < w.semaphoreCount; ++i) {
      const sm = w.semaphores[i];
      const p = worldFromLogical(sm.pixelX, sm.pixelY);
      solid.add(MAST, 0xdddddd, trs(p.x, 11, p.z));
      lamps.add(LAMP, sm.isRed ? 0xff2a10 : 0x22ff44, trs(p.x, 23, p.z));
    }
    // switches: a disk and a lever pointing along the active branch
    for (let i = 0; i < w.nSwitches; ++i) {
      const sw = w.switches[i];
      const p = worldFromLogical(sw.x, sw.y);
      solid.add(DISK, 0xdddddd, trs(p.x, 0.8, p.z));
      const entry = sw.entry.rail;
      if (entry && entry.id > 1 && entry.id < 728) {
        const mid = railPoint(entry, Math.floor(centerline(entry.type).length / 2));
        const ang = Math.atan2(mid.x - p.x, mid.z - p.z);
        solid.add(LEVER, 0xffd000, trs(p.x + Math.sin(ang) * 5, 2, p.z + Math.cos(ang) * 5, ang));
      }
    }
    // dispatcher flags at entrances with waiting trains
    for (let i = 0; i < w.entranceCount; ++i) {
      const e = w.entrances[i];
      if (!e.waitingTrainsCount) continue;
      const p = worldFromLogical(e.rail.x, e.rail.y);
      lamps.add(FLAG, colorOf(e.bgColor), trs(p.x, 50 + (blink ? 2 : 0), p.z));
    }
    if (!solid.empty) {
      const m = new THREE.Mesh(solid.build(), this.mats.vertex);
      m.castShadow = true;
      this.signalGroup.add(m);
    }
    if (!lamps.empty) this.signalGroup.add(new THREE.Mesh(lamps.build(), this.mats.lamp));
  }

  // ---- construction cursor and grid ------------------------------------------

  private buildGrid(): THREE.LineSegments {
    const pts: number[] = [];
    const add = (tx1: number, ty1: number, tx2: number, ty2: number) => {
      const a = tileOrigin(tx1, ty1);
      const b = tileOrigin(tx2, ty2);
      const wa = worldFromLogical(a.x, a.y);
      const wb = worldFromLogical(b.x, b.y);
      pts.push(wa.x, 0.3, wa.z, wb.x, 0.3, wb.z);
    };
    for (let t = 0; t < 11; ++t) {
      add(t, 0, t, 10);
      add(0, t, 10, t);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x648b3c, transparent: true, opacity: 0.8 }));
  }

  /**
   * Tiles where no rail type is allowed (g_allowedRailCursorTypes == 0) and
   * everything outside the 11x11 map: the construction cursor never goes
   * there. A tile cell is the rhombus between the origins of (tx, ty),
   * (tx+1, ty), (tx+1, ty+1) and (tx, ty+1).
   */
  private buildBlockedArea(): THREE.Mesh {
    const pos: number[] = [];
    const corner = (tx: number, ty: number) => {
      const o = tileOrigin(tx, ty);
      const p = worldFromLogical(o.x, o.y);
      return [p.x, 0.4, p.z];
    };
    for (let tx = -14; tx < 25; ++tx)
      for (let ty = -14; ty < 25; ++ty) {
        const inside = tx >= 0 && tx < 11 && ty >= 0 && ty < 11;
        if (inside && allowedRailCursorTypes[tx * 11 + ty]) continue;
        const a = corner(tx, ty);
        const b = corner(tx + 1, ty);
        const c = corner(tx + 1, ty + 1);
        const d = corner(tx, ty + 1);
        pos.push(...a, ...d, ...b, ...b, ...d, ...c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ color: 0x0b1405, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.renderOrder = 1;
    m.visible = false;
    return m;
  }

  private updateCursor(w: World): void {
    const c = w.railCursorState;
    const on = w.mode === w.modeConstruction && w.video.screen === 'game';
    const blink = (w.video.blinkingColor & 1) !== 0;
    const sig = on ? `${c.tileX},${c.tileY},${c.railType},${blink}` : '';
    if (sig === this.cursorSig) return;
    this.cursorSig = sig;
    disposeChildren(this.cursorGroup);
    if (!on) return;
    const o = tileOrigin(c.tileX, c.tileY);
    const pts = centerline(c.railType).map((_, i) => railPoint({ x: o.x, y: o.y, type: c.railType }, i));
    this.mats.ghost.color.set(blink ? 0xffffff : 0x202020);
    this.cursorGroup.add(new THREE.Mesh(ribbon(pts, -BALLAST_HALF, BALLAST_HALF, 3), this.mats.ghost));
  }

  // ---- trains ---------------------------------------------------------------

  private updateTrains(w: World, simNow: number, nowMs: number): void {
    const seen = new Set<number>();
    const blinkOn = (w.video.blinkingColor & 1) !== 0;
    for (const t of w.trains) {
      if (t.isFreeSlot) continue;
      for (let i = 0; i < t.carriageCnt; ++i) {
        const c = t.carriages[i];
        const rail = c.location.rail;
        if (!rail || rail.id <= 1) continue;
        seen.add(c.id);
        const target = railPoint(rail, c.location.pathStep);
        const ahead = railPoint(rail, c.location.pathStep + 2);
        const behind = railPoint(rail, c.location.pathStep - 2);
        const heading = Math.atan2(ahead.x - behind.x, ahead.z - behind.z) + (c.location.forwardDirection ? 0 : Math.PI);
        const dst = w.entrances[c.dstEntranceIdx];
        const key = `${c.type}:${dst.bgColor}:${dst.fgColor}`;
        let mesh = this.carriageMeshes.get(c.id);
        if (!mesh || mesh.userData.key !== key) {
          if (mesh) {
            this.trainGroup.remove(mesh);
            (mesh.material as THREE.Material).dispose();
          }
          mesh = buildCarriageModel(c.type, colorOf(dst.bgColor), colorOf(dst.fgColor));
          mesh.userData.key = key;
          this.carriageMeshes.set(c.id, mesh);
          this.trainGroup.add(mesh);
        }
        const p = this.interp.position(c.id, target, heading, simNow, nowMs);
        mesh.position.copy(p.pos);
        mesh.rotation.y = p.heading;
        // entrance rails are outside the screen: hide carriages there like the original does
        mesh.visible = rail.type !== 6;
        // the unmanaged "blinking" train: a black/white strobe
        (mesh.material as THREE.MeshLambertMaterial).color.set(c.dstEntranceIdx === 8 && !blinkOn ? 0x202020 : 0xffffff);
      }
    }
    for (const [id, mesh] of this.carriageMeshes) {
      if (seen.has(id)) continue;
      this.trainGroup.remove(mesh);
      (mesh.material as THREE.Material).dispose();
      this.carriageMeshes.delete(id);
      this.interp.forget(id);
    }
  }

  // ---- click target ------------------------------------------------------------

  /** the same rules as the game (findClosestSwitch / findClosestSemaphore / findClosestEntrance) */
  private updateHighlight(w: World): void {
    this.highlight.visible = false;
    const p = this.pointer;
    if (!p || w.mode !== w.modeManagement || w.video.screen !== 'game' || w.video.dialog >= 0) return;
    // mode.x/y are clamped to [0, 628] x [0, 318] by the management mode
    const x = Math.min(Math.max(Math.floor(p.x), 0), 628);
    const y = Math.min(Math.max(Math.floor(p.y), 0), 318);
    let best = 60;
    let target: { x: number; y: number; h: number } | null = null;
    for (let i = w.nSwitches - 1; i >= 0; --i) {
      const s = w.switches[i];
      const d = Math.abs(x - s.x) + Math.abs(y - s.y) * 4;
      if (d < best) {
        best = d;
        target = { x: s.x, y: s.y, h: 1 };
      }
    }
    if (!target) {
      best = 60;
      for (let i = w.semaphoreCount - 1; i >= 0; --i) {
        const s = w.semaphores[i];
        const d = Math.abs(x - s.pixelX) + Math.abs(y - s.pixelY + 10) * 4;
        if (d < best) {
          best = d;
          target = { x: s.pixelX, y: s.pixelY, h: 1 };
        }
      }
    }
    if (!target) return;
    const wp = worldFromLogical(target.x, target.y);
    this.highlight.position.set(wp.x, target.h, wp.z);
    this.highlight.visible = true;
  }

  // ---- effects -----------------------------------------------------------------

  private addExplosion(x: number, y: number, nowMs: number): void {
    const n = 160;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const p = worldFromLogical(x, y);
    for (let i = 0; i < n; ++i) {
      pos.set([p.x, 6, p.z], i * 3);
      const a = (i * 2.399) % (Math.PI * 2);
      const s = 20 + ((i * 37) % 60);
      vel.set([Math.cos(a) * s, 40 + ((i * 53) % 80), Math.sin(a) * s], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd060, size: 4, transparent: true }));
    this.fxGroup.add(pts);
    this.explosions.push({ obj: pts, t0: nowMs, vel });
  }

  private updateFx(nowMs: number): void {
    for (let i = this.explosions.length - 1; i >= 0; --i) {
      const e = this.explosions[i];
      const t = (nowMs - e.t0) / 1000;
      if (t > 2.5) {
        this.fxGroup.remove(e.obj);
        disposeTree(e.obj);
        this.explosions.splice(i, 1);
        continue;
      }
      const attr = e.obj.geometry.getAttribute('position') as THREE.BufferAttribute;
      const base = attr.array as Float32Array;
      const n = base.length / 3;
      const dt = 1 / 60;
      for (let k = 0; k < n; ++k) {
        e.vel[k * 3 + 1] -= 120 * dt;
        base[k * 3] += e.vel[k * 3] * dt;
        base[k * 3 + 1] = Math.max(0, base[k * 3 + 1] + e.vel[k * 3 + 1] * dt);
        base[k * 3 + 2] += e.vel[k * 3 + 2] * dt;
      }
      attr.needsUpdate = true;
      (e.obj.material as THREE.PointsMaterial).opacity = 1 - t / 2.5;
    }
  }

  setShadows(on: boolean): void {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.opts.shadows = on;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) (o.material as THREE.Material).needsUpdate = true;
    });
  }
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((m) => {
    if (m instanceof THREE.Mesh || m instanceof THREE.Points || m instanceof THREE.LineSegments) {
      m.geometry.dispose();
    }
  });
}

function disposeChildren(g: THREE.Group): void {
  for (const c of [...g.children]) {
    g.remove(c);
    disposeTree(c);
  }
}
