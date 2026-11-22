// T6: the 3D camera reproduces the original projection.
import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  cameraSetup,
  layoutFor,
  logicalFromWorld,
  logicalToScreen,
  screenToLogical,
  worldFromLogical,
} from '../src/projection';
import { centerline, pathPoints, tileOrigin } from '../src/railGeometry';

function camera(w: number, h: number) {
  const l = layoutFor(w, h);
  const s = cameraSetup(l);
  const cam = new OrthographicCamera(s.left, s.right, s.top, s.bottom, s.near, s.far);
  cam.position.set(s.position.x, s.position.y, s.position.z);
  cam.lookAt(s.target.x, s.target.y, s.target.z);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return { l, cam };
}

/** CSS pixel of a world point through the THREE camera */
function project(cam: OrthographicCamera, w: number, h: number, p: { x: number; y: number; z: number }) {
  const v = new Vector3(p.x, p.y, p.z).project(cam);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
}

// deterministic pseudo-random numbers
function rnd(seed: number) {
  let a = seed;
  return () => ((a = (Math.imul(a, 1103515245) + 12345) >>> 0) / 4294967296);
}

const SIZES: [number, number][] = [
  [1280, 960],
  [1920, 1080],
  [390, 844],
];

describe('T6: projection', () => {
  it('world <-> logical round trip', () => {
    const r = rnd(1);
    for (let i = 0; i < 1000; ++i) {
      const x = r() * 640;
      const y = r() * 350;
      const back = logicalFromWorld(worldFromLogical(x, y, r() * 50));
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
    }
  });

  for (const [w, h] of SIZES) {
    it(`screen -> logic -> screen for 1000 clicks at ${w}x${h}`, () => {
      const { l, cam } = camera(w, h);
      const r = rnd(w * 7 + h);
      for (let i = 0; i < 1000; ++i) {
        const px = Math.floor(r() * w);
        const py = Math.floor(r() * h);
        const lg = screenToLogical(l, px, py);
        const s = logicalToScreen(l, lg.x, lg.y);
        expect(Math.abs(s.x - px)).toBeLessThan(1e-6);
        expect(Math.abs(s.y - py)).toBeLessThan(1e-6);
        // the THREE camera puts the ground point under this logical pixel at the same place
        const c = project(cam, w, h, worldFromLogical(lg.x, lg.y));
        expect(Math.abs(c.x - px)).toBeLessThan(1e-3);
        expect(Math.abs(c.y - py)).toBeLessThan(1e-3);
      }
    });
  }
});

describe('T6: rail geometry', () => {
  for (let type = 0; type < 6; ++type) {
    it(`rail type ${type}: the centerline is within 1 logical pixel of the path`, () => {
      const o = tileOrigin(5, 5);
      const raw = pathPoints(type);
      const line = centerline(type);
      const { cam } = camera(1280, 960);
      const l = layoutFor(1280, 960);
      let worst = 0;
      for (let i = 0; i < raw.length; ++i) {
        // the 3D point of the centerline projected back to logical pixels
        const c = project(cam, 1280, 960, worldFromLogical(o.x + line[i].x, o.y + line[i].y));
        const lg = screenToLogical(l, c.x, c.y);
        worst = Math.max(worst, Math.hypot(lg.x - (o.x + raw[i].x), lg.y - (o.y + raw[i].y)));
      }
      expect(worst).toBeLessThanOrEqual(1);
    });
  }
});
