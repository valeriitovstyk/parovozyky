import { expect, type Page } from '@playwright/test';

export interface Probe {
  screen: string;
  dialog: number;
  money: number;
  year: number;
  entrances: number;
  trains: number;
  demo: boolean;
  mode: number;
  userFiles: string[];
  halted: string | null;
  status: string;
  page: number;
  pauseItem: string | null;
}

export async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const g = window.__parovozyky?.game();
    if (!g)
      return { screen: 'none', dialog: -1, money: 0, year: 0, entrances: 0, trains: 0, demo: false, mode: 0, userFiles: [], halted: null, status: '', page: 0, pauseItem: null };
    const w = g.sim.world;
    return {
      screen: w.video.screen,
      dialog: w.video.dialog,
      money: w.headers[1].value,
      year: w.headers[2].value,
      entrances: w.entranceCount,
      trains: w.trains.filter((t) => !t.isFreeSlot).length,
      demo: w.isDemoMode,
      mode: w.mode === null ? 0 : w.mode === w.modeManagement ? 1 : 2,
      userFiles: g.files.userFiles(),
      halted: g.sim.halted?.reason ?? null,
      status: w.video.statusText,
      page: w.video.manualPage,
      pauseItem: w.dialogs[3].itemNames[1],
    };
  });
}

/** test mode: advance the virtual time in 1/60 s frames */
export async function advance(page: Page, seconds: number): Promise<void> {
  await page.evaluate((s) => {
    const end = s * 1e6;
    // presentation events (explosions, construction stages) are delivered per step either way
    for (let t = 0; t < end; t += 16667) window.__parovozyky!.step(16667, t + 16667 >= end);
  }, seconds);
}

/** advance until `cond` holds (virtual time limit) */
export async function advanceUntil(page: Page, cond: (p: Probe) => boolean, maxSeconds = 30): Promise<Probe> {
  for (let t = 0; t < maxSeconds; t += 0.25) {
    const p = await probe(page);
    if (cond(p)) return p;
    await advance(page, 0.25);
  }
  const p = await probe(page);
  expect(cond(p), `condition not reached in ${maxSeconds} virtual s: ${JSON.stringify({ ...p, userFiles: p.userFiles.length })}`).toBe(true);
  return p;
}

export async function start(page: Page, query = ''): Promise<void> {
  await page.goto(`/?test=1&seed=7${query}`);
  await expect.poll(() => page.evaluate(() => !!window.__parovozyky?.game())).toBe(true);
  await advanceUntil(page, (p) => p.screen === 'loading');
  await advance(page, 0.5);
  await page.locator('#app').click({ position: { x: 200, y: 200 } });
  await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0);
}

/** a dialog item of the HTML HUD */
export async function choose(page: Page, item: string): Promise<void> {
  await page.locator(`.hud-item[data-item="${item}"]`).click();
  await advance(page, 0.5);
}

export async function key(page: Page, k: string, seconds = 0.4): Promise<void> {
  await page.keyboard.press(k);
  await advance(page, seconds);
}
