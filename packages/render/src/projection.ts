// The projection of the original game, reproduced by an orthographic camera.
//
// Logical screen: 640x350 (VGA), shown on a 4:3 monitor => physical 640x480,
// y_phys = y * 480/350. A tile (tx, ty) is at x = (tx - ty)*88 + 320,
// y = (tx + ty)*21 - 22: the tile is a rhombus with diagonals 176 x 42 logical
// pixels = 176 x 57.6 physical. It is a square seen from the elevation
// asin(57.6 / 176) ≈ 19.1° at the azimuth 45°.
//
// World coordinates (Y up): X = x - 320, Z = (y_phys - 240) / sinθ on the ground.
// An orthographic camera looking down at θ maps (X, Y, Z) to the physical
// screen: sx = X + 320, sy = Z sinθ - Y cosθ + 240 — so logical pixels and
// ground points are in one-to-one correspondence.

export const LOGICAL_W = 640;
export const LOGICAL_H = 350;
export const PHYS_H = 480;
export const Y_SCALE = PHYS_H / LOGICAL_H;
export const SIN_ELEV = (21 * Y_SCALE) / 88;
export const ELEVATION = Math.asin(SIN_ELEV);
export const COS_ELEV = Math.cos(ELEVATION);

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** ground point (height h) under a logical pixel */
export function worldFromLogical(x: number, y: number, h = 0): Vec3 {
  return { x: x - 320, y: h, z: (y * Y_SCALE - 240 + h * COS_ELEV) / SIN_ELEV };
}

/** logical pixel of a world point */
export function logicalFromWorld(p: Vec3): { x: number; y: number } {
  const sy = p.z * SIN_ELEV - p.y * COS_ELEV + 240;
  return { x: p.x + 320, y: sy / Y_SCALE };
}

/** How the 640x480 physical field is placed into a viewport (CSS pixels) */
export interface Layout {
  width: number;
  height: number;
  /** CSS pixels per physical unit */
  scale: number;
}

export function layoutFor(width: number, height: number): Layout {
  return { width, height, scale: Math.min(width / LOGICAL_W, height / PHYS_H) };
}

/** visible area in physical units (the field is centered, extra space is decoration) */
export function visibleExtent(l: Layout): { halfW: number; halfH: number } {
  return { halfW: l.width / l.scale / 2, halfH: l.height / l.scale / 2 };
}

export function screenToLogical(l: Layout, px: number, py: number): { x: number; y: number } {
  const sx = (px - l.width / 2) / l.scale + 320;
  const sy = (py - l.height / 2) / l.scale + 240;
  return { x: sx, y: sy / Y_SCALE };
}

export function logicalToScreen(l: Layout, x: number, y: number): { x: number; y: number } {
  return { x: (x - 320) * l.scale + l.width / 2, y: (y * Y_SCALE - 240) * l.scale + l.height / 2 };
}

/** camera parameters for THREE.OrthographicCamera: frustum, position, lookAt */
export function cameraSetup(l: Layout, distance = 2000) {
  const { halfW, halfH } = visibleExtent(l);
  return {
    left: -halfW,
    right: halfW,
    top: halfH,
    bottom: -halfH,
    near: 1,
    far: distance * 4,
    position: { x: 0, y: distance * SIN_ELEV, z: distance * COS_ELEV },
    target: { x: 0, y: 0, z: 0 },
  };
}
