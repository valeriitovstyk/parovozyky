// game/static_object.cpp
import { i16 } from '../core/ints';
import { G } from './globals';
import { FOOTER_Y_POS, HEADER_HEIGHT, clampRectToGameFieldBoundaries } from './drawing';
import { pathStep } from './globals';
import { type Rail, Rectangle, type StaticObject, StaticObjectKind, setEmptyRectangle } from './types';

const GAME_FIELD_WIDTH = 640;
const GAME_FIELD_HEIGHT = 287;

/* 1530:013e */
function drawGrass(_yOffset: number): void {
  // drawGrass changes the state of the random number generator (PLAN.md 2.1.2)
  const rng = G.rng;
  const seed = rng.rand();
  rng.srand(G.staticObjects[119].x);
  for (let i = 0; i < 25; ++i) {
    let x = rng.genRandomNumber(GAME_FIELD_WIDTH);
    let y = rng.genRandomNumber(GAME_FIELD_HEIGHT) + HEADER_HEIGHT;
    for (let j = 0; j < 45; ++j) {
      // if (isInsideGameField(x, y)) { getPixel / putPixel } - drawing only
      x += rng.symmetricRand(20);
      y += Math.trunc(rng.symmetricRand(20) / 4);
    }
    void x;
    void y;
  }
  rng.srand(seed);
}

/* 1530:0229 */
export function drawStaticObjects(yOffset: number): void {
  drawGrass(yOffset);
  // houses and trees: drawing only
}

/* 17bf:0b96 */
function needRemoveObjectToBuildRail(obj: StaticObject, r: Rail): boolean {
  if (Math.abs(obj.x - r.x) > 176) return false;
  if (Math.abs(obj.y - r.y) > 42) return false;
  const size = G.pathSize(r.type);
  const xCoord = [0, 0, 0, 0];
  const yCoord = [0, 0, 0, 0];
  for (let i = 0; i < size; ++i) {
    const p = pathStep(r.type, i);
    const xPos = i16(r.x + p.dx);
    xCoord[0] = i16(xPos - 4);
    xCoord[1] = i16(xPos + 4);
    const yPos = i16(r.y + p.dy);
    yCoord[0] = i16(yPos + -2);
    yCoord[1] = i16(yPos + 2);
    xCoord[2] = xCoord[0];
    xCoord[3] = xCoord[1];
    yCoord[2] = yCoord[1];
    yCoord[3] = yCoord[0];
    for (let j = 0; j < 4; ++j) {
      if (obj.x <= xCoord[j] && obj.x + 16 >= xCoord[j] && obj.y <= yCoord[j] && obj.y + 16 >= yCoord[j]) return true;
    }
  }
  return false;
}

/* 17bf:04ac */
export function destroyStaticObjectsForRailConstruction(r: Rail): void {
  const cut = G.cuttingDownStaticObjectsByKind;
  cut[StaticObjectKind.Tree] = 0;
  cut[StaticObjectKind.House] = 0;
  const a = G.areaToRedraw;
  for (const obj of G.staticObjects) {
    if (!needRemoveObjectToBuildRail(obj, r)) continue;
    switch (obj.kind) {
      case StaticObjectKind.BuildingHouse:
        obj.kind = StaticObjectKind.None;
        break;
      case StaticObjectKind.House:
      case StaticObjectKind.Tree:
        cut[obj.kind] = (cut[obj.kind] + 1) & 0xff;
        obj.kind = StaticObjectKind.None;
        // eraseStaticObject(obj, 350): drawing only
        if (obj.x < a.x1) a.x1 = obj.x;
        if (obj.x + 16 > a.x2) a.x2 = i16(obj.x + 16);
        if (obj.y < a.y1) a.y1 = obj.y;
        if (obj.y + 16 > a.y2) a.y2 = i16(obj.y + 16);
        break;
      case StaticObjectKind.None:
        break;
    }
  }
}

/* 1530:056f */
export function buildHouses(year: number): void {
  const boundingBox = new Rectangle();
  setEmptyRectangle(boundingBox);
  let created = false;
  for (const obj of G.staticObjects) {
    if (obj.kind === StaticObjectKind.BuildingHouse && obj.creationYear === year - 1800) {
      obj.kind = StaticObjectKind.House;
      if (obj.x < boundingBox.x1) boundingBox.x1 = obj.x;
      if (obj.x + 16 > boundingBox.x2) boundingBox.x2 = i16(obj.x + 16);
      if (obj.y < boundingBox.y1) boundingBox.y1 = obj.y;
      if (obj.y + 16 > boundingBox.y2) boundingBox.y2 = i16(obj.y + 16);
      created = true;
    }
  }
  if (created) {
    drawStaticObjects(350);
    clampRectToGameFieldBoundaries(boundingBox);
    // copyFromShadowBuffer: drawing only
  }
}

export { FOOTER_Y_POS };
