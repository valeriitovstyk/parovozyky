// Access to the extracted bitmaps (data/glyphs.ts).
import * as GL from '../data/glyphs';
import { type Glyph, glyphAt } from './draw';

export interface RailGlyph {
  dx: number;
  dy: number;
  glyph: Glyph;
}

/** railBackgrounds[type]: 0 mainGlyph, 1 bg2, 2 bg1, 3 switches[0], 4 switches[1] */
export function railGlyph(type: number, which: number): RailGlyph {
  const a = GL.railGlyphs[type][which] as readonly number[];
  return { dx: a[0], dy: a[1], glyph: glyphAt(a, 2) };
}

/** g_trainGlyphs[type][angle][direction] -> glyph1 (black), glyph2 (bg), glyph3 (fg) */
export function trainGlyphBitmaps(type: number, angle: number, direction: number): [Glyph, Glyph, Glyph] {
  const g = GL.trainGlyphs[(type * 5 + angle) * 2 + direction] as unknown as readonly (readonly number[])[];
  return [glyphAt(g[0]), glyphAt(g[1]), glyphAt(g[2])];
}

/** g_semaphoreGlyphs (flattened [2][2]) */
export function semaphoreGlyph(i: number) {
  const a = GL.semaphoreGlyphs[i] as readonly number[];
  return { xOffset: a[0], yOffset: a[1], lightXOffset: a[2], lightYOffset: a[3], d: a, bg2: 4, bg1: 19, light: 34 };
}

/** fg at 0, bg at half */
export const dispatcherGlyphs = GL.dispatcherGlyphs as unknown as readonly (readonly number[])[];
export const impasseGlyphs = GL.impasseGlyphs as unknown as readonly (readonly number[])[];
export const houseGlyphs = GL.houseGlyphs as unknown as readonly (readonly number[])[];
export const treeGlyphs = GL.treeGlyphs as unknown as readonly (readonly number[])[];
export const glyphEmptyBackground = GL.glyphEmptyBackground as readonly number[];
export const trainFinishedGlyphs = (GL.trainFinishedGlyphs as unknown as readonly (readonly number[])[]).map((a) => glyphAt(a));
export const uiGlyphs = {
  menuItem1: glyphAt(GL.uiGlyphs.menuItem1),
  menuItem2: glyphAt(GL.uiGlyphs.menuItem2),
  menuItem3: glyphAt(GL.uiGlyphs.menuItem3),
  firstMenuItemTextArea: glyphAt(GL.uiGlyphs.firstMenuItemTextArea),
  cursor1: GL.uiGlyphs.cursor1 as readonly number[],
  cursor2: GL.uiGlyphs.cursor2 as readonly number[],
};
