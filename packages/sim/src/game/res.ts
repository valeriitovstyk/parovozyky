// Typed access to the extracted constant tables (data/tables.ts).
import * as T from '../data/tables';
import { ub } from './globals';
import { RailInfo } from './types';

function at<X>(arr: readonly X[], i: number, what: string): X {
  if (i < 0 || i >= arr.length || !Number.isInteger(i)) ub(`${what}[${i}]`);
  return arr[i];
}

/** g_railConnectionBiases[railType][side] */
export function railConnectionBias(railType: number, side: number) {
  const b = at(T.railConnectionBiases, railType * 2 + side, 'g_railConnectionBiases');
  return { tileOffsetX: b[0], tileOffsetY: b[1], unknown1: b[2] };
}

/** g_railConnectionRules[railType][i] */
export function railConnectionRule(railType: number, i: number) {
  const r = at(T.railConnectionRules, railType * 6 + i, 'g_railConnectionRules');
  return { railType: r[0], tileDX: r[1], tileDY: r[2], slot1: r[3], slot2: r[4] };
}

/** g_railTypeMeta (12 records) */
export const railTypeMeta = T.railTypeMeta.map((m) => ({
  tileOffsetX: m[0],
  tileOffsetY: m[1],
  railType: m[2],
  semaphoreType: m[3],
}));

/** g_semaphoreGlyphBiases[railType][direction] */
export function semaphoreGlyphBias(railType: number, dir: number) {
  const b = at(T.semaphoreGlyphBiases, railType * 2 + dir, 'g_semaphoreGlyphBiases');
  return { dx: b[0], dy: b[1] };
}

/** g_entranceRails[46] */
export const entranceRails: readonly RailInfo[] = T.entranceRails.map((r) =>
  Object.assign(new RailInfo(), { roadTypeMask: r[0], tileX: r[1], tileY: r[2], railType: r[3], year_8: r[4] }),
);

export function entranceRail(i: number): RailInfo {
  return at(entranceRails, i, 'g_entranceRails');
}

/** g_trainGlyphs[type][angle][direction] -> width/height */
export function trainGlyph(type: number, angle: number, direction: number) {
  if (type < 0 || type >= 15 || angle < 0 || angle >= 5 || direction < 0 || direction >= 2)
    ub(`g_trainGlyphs[${type}][${angle}][${direction}]`);
  const g = T.trainGlyphSizes[(type * 5 + angle) * 2 + direction];
  return { width: g[0], height: g[1] };
}

/** g_carriageYBiases[type][angle] */
export function carriageYBias(type: number, angle: number): number {
  if (type < 0 || type >= 15 || angle < 0 || angle >= 5) ub(`g_carriageYBiases[${type}][${angle}]`);
  return T.carriageYBiases[type * 5 + angle];
}

/** g_chunkBoundingBoxes[6] */
export function chunkBoundingBox(railType: number) {
  const b = at(T.chunkBoundingBoxes, railType, 'g_chunkBoundingBoxes');
  return { x1: b[0], y1: b[1], x2: b[2], y2: b[3] };
}

/** g_allowedRailCursorTypes[tileX][tileY] */
export function allowedRailCursorTypes(tileX: number, tileY: number): number {
  const idx = tileX * 11 + tileY;
  if (idx < 0 || idx >= 121) ub(`g_allowedRailCursorTypes[${tileX}][${tileY}]`);
  return T.allowedRailCursorTypes[idx];
}

/** g_trainSpecifications[14] */
export function trainSpecification(type: number) {
  const s = at(T.trainSpecifications, type, 'g_trainSpecifications');
  return { minYear: s[0], maxYear: s[1], maxSpeed: s[2], possibleCarriages: s.slice(3, 8) as readonly number[] };
}

/** g_textGlyphs[147] -> width */
export function textGlyphWidth(i: number): number {
  return at(T.textGlyphs, i, 'g_textGlyphs')[2];
}

export const charTraits = T.charTraits;
