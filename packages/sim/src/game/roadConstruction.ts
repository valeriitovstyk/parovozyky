// game/road_construction.cpp
import { pop, type TaskGen } from '../core/scheduler';
import { clampRectToGameFieldBoundaries, drawFieldBackground, drawRail, drawRailBg1, drawRailBg2, eraseImpasse, redrawScreenArea, scheduleRailRedrawing } from './drawing';
import { modeClear, modeDraw } from './mouse';
import { railConnectionBias, railTypeMeta } from './res';
import { G } from './globals';
import { spendMoney } from './header';
import { beepSound, playErrorMelody } from './melody';
import { checkRailWouldConflict, connectRail } from './rail';
import { eraseSemaphore, updateSemaphores } from './semaphore';
import { destroyStaticObjectsForRailConstruction, drawStaticObjects } from './staticObject';
import { Color, HeaderFieldId, type RailInfo, StaticObjectKind } from './types';
import { showStatusMessage } from '../ui/statusBar';

/* 17bf:0aa0 — the gray background of a new rail may erase adjacent rails */
function redrawAdjacentRails(ri: RailInfo): void {
  if (!G.vga) return;
  for (let side = 0; side < 2; ++side) {
    const b = railConnectionBias(ri.railType, side);
    const x = b.tileOffsetX + ri.tileX;
    const y = b.tileOffsetY + ri.tileY;
    for (const rt of railTypeMeta) {
      const tileX = x + rt.tileOffsetX;
      const tileY = y + rt.tileOffsetX; // (sic) tileOffsetX, as in reSL
      // (drawing only: an out-of-range read here must not stop the game)
      const idx = tileX * 11 + tileY;
      const m = idx >= 0 && idx < 121 ? G.railroadTypeMasks[idx] : 0;
      if ((1 << rt.railType) & m) drawRail(tileX, tileY, rt.railType, Color.Black, 350);
    }
  }
}

/* 17bf:000d */
export function* taskRoadConstruction(): TaskGen {
  for (;;) {
    const ri = (yield* pop(G.railConstructionMsgQueue)).clone();
    if ((1 << ri.railType) & G.mask(ri.tileX, ri.tileY)) {
      showStatusMessage('ALREADY BUILT');
      yield* playErrorMelody();
      continue;
    }
    if (checkRailWouldConflict(ri.tileX, ri.tileY, ri.railType)) {
      showStatusMessage("Can't construct triple switch");
      yield* playErrorMelody();
      continue;
    }
    const rail = G.rail(ri.tileX, ri.tileY, ri.railType);
    let penalty = ri.railType < 2 ? 1 : 2;
    if (penalty > G.headers[HeaderFieldId.Money].value) {
      showStatusMessage('Not enough money to build');
      yield* playErrorMelody();
      modeClear(G.mode!);
      drawRail(ri.tileX, ri.tileY, ri.railType, Color.Green, 350);
      modeDraw(G.mode!);
      G.emit({ type: 'railStage', tileX: ri.tileX, tileY: ri.tileY, railType: ri.railType, stage: -1 });
      scheduleRailRedrawing(rail);
      clampRectToGameFieldBoundaries(G.areaToRedraw);
      drawFieldBackground(350);
      yield* redrawScreenArea();
      continue;
    }
    spendMoney(penalty);
    G.areaToRedraw.y1 = 32000;
    G.areaToRedraw.x1 = 32000;
    G.areaToRedraw.y2 = 0;
    G.areaToRedraw.x2 = 0;
    destroyStaticObjectsForRailConstruction(rail);
    penalty =
      G.cuttingDownStaticObjectsByKind[StaticObjectKind.House] + G.cuttingDownStaticObjectsByKind[StaticObjectKind.Tree];
    if (penalty) {
      showStatusMessage('Cutting down the tree(s) or house(s)');
      for (let i = 0; i < penalty; ++i) {
        if (G.soundEnabled) G.m.sound(G.rng.genRandomNumber(40) + 30);
        yield G.m.sleep(4);
        G.m.nosound();
        yield G.m.sleep(18);
      }
      showStatusMessage('... and paying $' + String(penalty) + ',000 FINE');
      spendMoney(penalty);
      drawStaticObjects(350);
      clampRectToGameFieldBoundaries(G.areaToRedraw);
      yield* redrawScreenArea();
      yield* beepSound(1);
    }
    yield G.m.sleep(100);
    yield* beepSound(2);
    eraseImpasse(rail, 350);
    drawRail(ri.tileX, ri.tileY, ri.railType, Color.Gray, 350);
    drawRailBg1(ri.tileX, ri.tileY, ri.railType, Color.DarkGray, 350);
    G.emit({ type: 'railStage', tileX: ri.tileX, tileY: ri.tileY, railType: ri.railType, stage: 1 });
    scheduleRailRedrawing(rail);
    clampRectToGameFieldBoundaries(G.areaToRedraw);
    yield* redrawScreenArea();
    yield G.m.sleep(100);
    yield* beepSound(3);
    drawRailBg2(ri.tileX, ri.tileY, ri.railType, Color.Gray, 350);
    drawRail(ri.tileX, ri.tileY, ri.railType, Color.Gray, 350);
    redrawAdjacentRails(ri);
    G.emit({ type: 'railStage', tileX: ri.tileX, tileY: ri.tileY, railType: ri.railType, stage: 2 });
    yield* redrawScreenArea();
    yield G.m.sleep(100);
    yield* beepSound(4);
    connectRail(ri);
    G.railRoad[G.railRoadCount].copyFrom(ri);
    G.railRoadCount = (G.railRoadCount + 1) & 0xffff;
    updateSemaphores(ri);
    for (let i = 0; i < G.erasedSemaphoreCount; ++i) eraseSemaphore(G.erasedSemaphores[i], 350);
    G.emit({ type: 'railStage', tileX: ri.tileX, tileY: ri.tileY, railType: ri.railType, stage: 3 });
    drawFieldBackground(0x15e);
    yield* redrawScreenArea();
  }
}
