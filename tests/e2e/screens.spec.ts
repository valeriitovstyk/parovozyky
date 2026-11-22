// T7: screenshots of fixed (deterministic) states in three window sizes.
import { expect, test } from '@playwright/test';
import { advance, advanceUntil, choose, start } from './helpers';

const SIZES = [
  { width: 1280, height: 960 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
];

for (const size of SIZES) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test('menu and demo', async ({ page }) => {
      await start(page);
      await advance(page, 1);
      await expect(page).toHaveScreenshot('menu.png');
      await choose(page, 'Demo');
      await advanceUntil(page, (p) => p.demo && p.screen === 'game');
      await advance(page, 6);
      // the pointer stays away from the field: no highlight
      await expect(page).toHaveScreenshot('demo-modern.png');
      await page.evaluate(() => {
        window.__parovozyky!.setMode('classic');
        window.__parovozyky!.step(1);
      });
      await expect(page).toHaveScreenshot('demo-classic.png');
      await page.evaluate(() => {
        window.__parovozyky!.setMode('overlay');
        window.__parovozyky!.step(1);
      });
      await expect(page).toHaveScreenshot('demo-overlay.png');
    });
  });
}
