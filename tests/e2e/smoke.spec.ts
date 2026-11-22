// Stage 3 smoke: loading screen -> menu -> Go -> build -> trains -> pause ->
// Save -> reload -> Archive -> Go; the demo starts by itself on idle.
import { expect, test, type Page } from '@playwright/test';

interface Probe {
  screen: string;
  money: number;
  entrances: number;
  trains: number;
  demo: boolean;
  userFiles: string[];
  halted: string | null;
  status: string;
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const g = window.__parovozyky?.game();
    if (!g) return { screen: 'none', money: 0, entrances: 0, trains: 0, demo: false, userFiles: [], halted: null, status: '' };
    const w = g.sim.world;
    return {
      screen: w.video.screen,
      money: w.headers[1].value,
      entrances: w.entranceCount,
      trains: w.trains.filter((t) => !t.isFreeSlot).length,
      demo: w.isDemoMode,
      userFiles: g.files.userFiles(),
      halted: g.sim.halted?.reason ?? null,
      status: (window as unknown as { __lastStatus?: string }).__lastStatus ?? '',
    };
  });
}

async function until(page: Page, cond: (p: Probe) => boolean, timeout = 20_000): Promise<Probe> {
  let last: Probe | null = null;
  await expect
    .poll(async () => {
      last = await probe(page);
      return cond(last);
    }, { timeout, intervals: [200] })
    .toBe(true);
  return last!;
}

/** waits for `seconds` of game time: menus animate in game time, and a slow
 * (software) renderer may run the game a little slower than the wall clock */
async function waitGame(page: Page, seconds: number): Promise<void> {
  const start = await page.evaluate(() => window.__parovozyky!.game()!.sim.now);
  await expect
    .poll(() => page.evaluate(() => window.__parovozyky!.game()!.sim.now), { timeout: 20_000, intervals: [100] })
    .toBeGreaterThanOrEqual(start + seconds * 1e6);
}

const canvas = (page: Page) => page.locator('#screen');

async function skipLoadingScreen(page: Page) {
  await until(page, (p) => p.screen === 'loading');
  await page.waitForTimeout(300);
  await page.locator('#app').click({ position: { x: 400, y: 300 } });
  await until(page, (p) => p.screen === 'menu');
  await waitGame(page, 1.5); // the menu slides in
}

test('full cycle with save and archive', async ({ page }) => {
  await page.goto('/');
  await skipLoadingScreen(page);

  await page.keyboard.press('g');
  await until(page, (p) => p.screen === 'game');

  // build a rail (construction mode, right button)
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);
  await page.waitForTimeout(300);
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.6, { button: 'right' });
  await until(page, (p) => p.money < 100, 10_000);

  // x3, wait for the second entrance, then pause + go spawns a train
  await page.keyboard.press('3');
  await until(page, (p) => p.entrances >= 2, 30_000);
  await page.keyboard.press('p');
  await waitGame(page, 0.8);
  await page.keyboard.press('g');
  await until(page, (p) => p.trains > 0, 30_000);

  // pause -> Save -> Bye
  await page.keyboard.press('p');
  await waitGame(page, 0.8);
  await page.keyboard.press('s');
  await until(page, (p) => p.userFiles.some((f) => /^.{8}\..{2}_$/.test(f)), 10_000);
  await page.keyboard.press('b');
  await until(page, (p) => p.screen === 'menu', 15_000);

  // reload: the save is still there (IndexedDB)
  await page.reload();
  await skipLoadingScreen(page);
  expect((await probe(page)).userFiles.some((f) => /^.{8}\..{2}_$/.test(f))).toBe(true);
  await page.keyboard.press('a');
  await until(page, (p) => p.screen === 'archive', 10_000);
  await waitGame(page, 1);
  await page.keyboard.press('g');
  await until(page, (p) => p.screen === 'game' && p.trains > 0, 10_000);
  expect((await probe(page)).halted).toBeNull();
});

test('the demo starts after ~11.7 s in the main menu', async ({ page }) => {
  await page.goto('/');
  await skipLoadingScreen(page);
  const t0 = Date.now();
  await until(page, (p) => p.demo, 20_000);
  const waited = (Date.now() - t0) / 1000;
  expect(waited).toBeGreaterThan(9);
  expect(waited).toBeLessThan(16);
});
