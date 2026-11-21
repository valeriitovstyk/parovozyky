// game/road_construction.cpp
import { pop, type TaskGen } from '../core/scheduler';
import { clampRectToGameFieldBoundaries, drawFieldBackground, eraseImpasse, redrawScreenArea, scheduleRailRedrawing } from './drawing';
import { G } from './globals';
import { spendMoney } from './header';
import { beepSound, playErrorMelody } from './melody';
import { checkRailWouldConflict, connectRail } from './rail';
import { updateSemaphores } from './semaphore';
import { destroyStaticObjectsForRailConstruction, drawStaticObjects } from './staticObject';
import { HeaderFieldId, StaticObjectKind } from './types';
import { showStatusMessage } from '../ui/statusBar';

// redrawAdjacentRails (17bf:0aa0): drawing only

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
      // mode clear/draw, drawRail(Green): drawing only
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
    G.emit({ type: 'railStage', tileX: ri.tileX, tileY: ri.tileY, railType: ri.railType, stage: 1 });
    scheduleRailRedrawing(rail);
    clampRectToGameFieldBoundaries(G.areaToRedraw);
    yield* redrawScreenArea();
    yield G.m.sleep(100);
    yield* beepSound(3);
    G.emit({ type: 'railStage', tileX: ri.tileX, tileY: ri.tileY, railType: ri.railType, stage: 2 });
    yield* redrawScreenArea();
    yield G.m.sleep(100);
    yield* beepSound(4);
    connectRail(ri);
    G.railRoad[G.railRoadCount].copyFrom(ri);
    G.railRoadCount = (G.railRoadCount + 1) & 0xffff;
    updateSemaphores(ri);
    // eraseSemaphore: drawing only
    G.emit({ type: 'railStage', tileX: ri.tileX, tileY: ri.tileY, railType: ri.railType, stage: 3 });
    drawFieldBackground(0x15e);
    yield* redrawScreenArea();
  }
}
