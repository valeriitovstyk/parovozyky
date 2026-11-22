// Rail centerlines from the movement paths of the original game
// (g_movementPaths): a rail is the polyline of its path steps, smoothed to
// remove the pixel staircase while staying within one logical pixel.
import { tables } from '@shortline/sim';

const { movementPaths } = tables;

export interface Point2 {
  x: number;
  y: number;
}

export function tileOrigin(tileX: number, tileY: number): Point2 {
  return { x: (tileX - tileY) * 88 + 320, y: (tileX + tileY) * 21 - 22 };
}

/** raw path points of a rail type relative to the rail origin (logical pixels) */
export function pathPoints(type: number): Point2[] {
  const p = movementPaths[type];
  const n = p[0];
  const res: Point2[] = [];
  for (let i = 0; i < n; ++i) res.push({ x: p[1 + i * 3], y: p[2 + i * 3] });
  return res;
}

/** path angle (0..4) of each step */
export function pathAngles(type: number): number[] {
  const p = movementPaths[type];
  return Array.from({ length: p[0] }, (_, i) => p[3 + i * 3]);
}

const cache = new Map<number, Point2[]>();

/** smoothed centerline (same number of points as the path) */
export function centerline(type: number): Point2[] {
  const hit = cache.get(type);
  if (hit) return hit;
  const raw = pathPoints(type);
  const R = 4;
  const res = raw.map((_, i) => {
    // shrink the window near the ends: endpoints stay exact
    const r = Math.min(R, i, raw.length - 1 - i);
    let sx = 0;
    let sy = 0;
    for (let k = -r; k <= r; ++k) {
      sx += raw[i + k].x;
      sy += raw[i + k].y;
    }
    return { x: sx / (2 * r + 1), y: sy / (2 * r + 1) };
  });
  cache.set(type, res);
  return res;
}
