// A replay exported by the app reproduces the session: it is run on the TS
// port and on the native oracle (`pnpm replay`), the traces must be identical.
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { advance, advanceUntil, choose, key, start } from './helpers';

test('export a replay; port and oracle agree on it', async ({ page }) => {
  test.setTimeout(300_000);
  await start(page);
  await choose(page, 'Go!');
  await advanceUntil(page, (p) => p.screen === 'game');
  await advance(page, 3);
  const box = (await page.locator('#gl').boundingBox())!;
  for (const [fx, fy] of [
    [0.6, 0.5],
    [0.45, 0.6],
    [0.7, 0.4],
  ]) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await advance(page, 0.3);
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy, { button: 'right' });
    await advance(page, 1);
  }
  await key(page, '3', 20);
  const json = await page.evaluate(() => window.__shortline!.exportReplay());
  const sc = JSON.parse(json);
  expect(sc.input.length).toBeGreaterThan(5);
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/replay.json', json);
  if (!existsSync('.build/oracle/resl-oracle')) test.skip(true, 'the oracle is not built');
  const out = execFileSync('pnpm', ['-s', 'replay', 'test-results/replay.json'], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  // eslint-disable-next-line no-control-regex
  expect(out.replace(/\x1b\[[0-9;]*m/g, '')).toMatch(/Tests\s+1 passed/);
});
