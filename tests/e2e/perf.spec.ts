// T9 / stage 4: modern renderer frame time with 20 trains x 5 carriages.
import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  await page.goto('/?view=modern');
  await expect.poll(() => page.evaluate(() => window.__parovozyky?.game()?.sim.world.video.screen), { timeout: 20_000 }).toBe('loading');
  await page.locator('#app').click({ position: { x: 300, y: 300 } });
  await expect.poll(() => page.evaluate(() => window.__parovozyky!.game()!.sim.world.video.screen)).toBe('menu');
  await page.waitForTimeout(1500);
  await page.keyboard.press('d'); // a demo: a world with rails
  await expect.poll(() => page.evaluate(() => window.__parovozyky!.game()!.sim.world.video.screen), { timeout: 10_000 }).toBe('game');
  await page.waitForTimeout(2000);
  // freeze the logic and put 20 trains x 5 carriages on the built rails
  await page.evaluate(() => {
    const api = window.__parovozyky!;
    api.paused = true;
    const w = api.game()!.sim.world;
    const rails = Array.from({ length: w.railRoadCount }, (_, i) => w.railRoad[i]).map((r) => w.rail(r.tileX, r.tileY, r.railType));
    const types = [5, 8, 8, 11, 13];
    w.trains.forEach((t, k) => {
      t.isFreeSlot = false;
      t.carriageCnt = 5;
      t.carriages.forEach((c, i) => {
        c.type = types[i];
        c.dstEntranceIdx = k % 2;
        c.location.rail = rails[(k * 5 + i) % rails.length];
        c.location.pathStep = (k * 13 + i * 30) % 140;
      });
    });
  });
}

async function measure(page: Page, frames: number): Promise<number> {
  return page.evaluate(async (n) => {
    const api = window.__parovozyky!;
    const r = api.renderer()!;
    const sim = api.game()!.sim;
    const gl = r.renderer.getContext();
    for (let i = 0; i < 10; ++i) r.render(sim, performance.now());
    gl.finish();
    let total = 0;
    for (let i = 0; i < n; ++i) {
      const t0 = performance.now();
      r.render(sim, performance.now() + i * 16);
      gl.finish();
      total += performance.now() - t0;
      await new Promise((res) => setTimeout(res, 0));
    }
    return total / n;
  }, frames);
}

test('frame time: 20 trains x 5 carriages', async ({ page }, info) => {
  await setup(page);
  const avg = await measure(page, 120);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const avgThrottled = await measure(page, 60);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const renderer = await page.evaluate(() => {
    const gl = window.__parovozyky!.renderer()!.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  const msg = `GPU: ${renderer}; average frame ${avg.toFixed(2)} ms, with CPU throttling x4 ${avgThrottled.toFixed(2)} ms`;
  console.log(msg);
  info.annotations.push({ type: 'perf', description: msg });
  expect(avg).toBeLessThanOrEqual(4);
  expect(avgThrottled).toBeLessThanOrEqual(16);
});
