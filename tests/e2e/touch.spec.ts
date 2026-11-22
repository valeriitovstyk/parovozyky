// Touch (reSL touch_handler.cpp): tap = left click, long tap (700 ms) = right
// click, swipe = both buttons (switches the mouse mode).
import { expect, test, type Page } from '@playwright/test';
import { advance, advanceUntil, choose, probe, start } from './helpers';

async function touch(page: Page, kind: 'tap' | 'long' | 'swipe', x: number, y: number) {
  await page.evaluate(
    async ({ kind, x, y }) => {
      const app = document.getElementById('app')!;
      const ev = (type: string, cx: number, cy: number) =>
        app.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, button: 0, clientX: cx, clientY: cy, bubbles: true }));
      ev('pointerdown', x, y);
      if (kind === 'swipe') ev('pointermove', x + 120, y);
      if (kind === 'long') await new Promise((r) => setTimeout(r, 800));
      ev('pointerup', kind === 'swipe' ? x + 120 : x, y);
    },
    { kind, x, y },
  );
  await advance(page, 0.6);
}

test('tap, long tap and swipe', async ({ page }) => {
  await start(page);
  await choose(page, 'Go!');
  await advanceUntil(page, (p) => p.screen === 'game' && p.mode === 2);
  await advance(page, 3);
  const box = (await page.locator('#gl').boundingBox())!;
  const x = box.x + box.width * 0.62;
  const y = box.y + box.height * 0.55;
  const railType = () => page.evaluate(() => window.__shortline!.game()!.sim.world.railCursorState.railType);

  // tap on the cursor tile: the next rail type
  await touch(page, 'tap', x, y);
  const t0 = await railType();
  await touch(page, 'tap', x, y);
  expect(await railType()).not.toBe(t0);

  // long tap: build
  const money = (await probe(page)).money;
  await touch(page, 'long', x, y);
  await advanceUntil(page, (p) => p.money < money, 10);

  // swipe: the management mode
  await touch(page, 'swipe', x, y);
  await advanceUntil(page, (p) => p.mode === 1, 5);
});
