// Stage 5: every menu item, through the HTML HUD (modern view).
import { expect, test } from '@playwright/test';
import { advance, advanceUntil, choose, key, probe, start } from './helpers';

test('Manual: pages, close button and Esc', async ({ page }) => {
  await start(page);
  await choose(page, 'Manual');
  await advanceUntil(page, (p) => p.screen === 'manual');
  await expect(page.locator('.hud-manual pre')).toContainText('RULES');
  await advance(page, 1.5); // the page slides in
  await page.locator('.hud-manual').click({ position: { x: 100, y: 100 } });
  await advanceUntil(page, (p) => p.page === 1);
  await page.locator('.hud-manual .hud-close').click();
  await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0);
  await choose(page, 'Manual');
  await advanceUntil(page, (p) => p.screen === 'manual');
  await advance(page, 1.5); // the page slides in (the game clears the last key)
  await key(page, 'Escape', 1);
  await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0);
});

test('Demo: starts from the menu and stops with the menu button', async ({ page }) => {
  await start(page);
  await choose(page, 'Demo');
  await advanceUntil(page, (p) => p.demo && p.screen === 'game');
  await advance(page, 3);
  await page.locator('.hud-menu').click();
  await advanceUntil(page, (p) => !p.demo && p.screen === 'menu' && p.dialog === 0, 30);
});

test('Go!: construction, pause Go / Save / Bye', async ({ page }) => {
  await start(page);
  await choose(page, 'Go!');
  await advanceUntil(page, (p) => p.screen === 'game' && p.mode === 2);
  // build a rail with the right button
  const box = (await page.locator('#gl').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.55);
  await advance(page, 0.3);
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.55, { button: 'right' });
  await advanceUntil(page, (p) => p.money < 100, 10);
  // Space toggles the mouse mode
  await key(page, 'Space', 1.2);
  expect((await probe(page)).mode).toBe(1);
  // pause: Go!
  await page.locator('.hud-menu').click();
  await advanceUntil(page, (p) => p.dialog === 3);
  await choose(page, 'Go!');
  await advanceUntil(page, (p) => p.dialog === -1);
  // pause: Save -> OK, then Bye
  await key(page, 'p', 1);
  await advanceUntil(page, (p) => p.dialog === 3);
  await choose(page, 'Save');
  await advanceUntil(page, (p) => p.pauseItem === '  OK' && p.userFiles.some((f) => f.endsWith('_')));
  await choose(page, 'Bye');
  await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0, 40);
});

test('Archive: no saves => alert; View, Next, Delete (Sure? No/Yes), Go!, Bye', async ({ page }) => {
  await start(page);
  await choose(page, 'Archive');
  await advanceUntil(page, (p) => p.dialog === 4);
  await expect(page.locator('.hud-dialog h2')).toHaveText("Can't open game files in current dir");
  await page.locator('.hud-item').click(); // OK
  await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0);

  // make two saves
  for (let i = 0; i < 2; ++i) {
    await choose(page, 'Go!');
    await advanceUntil(page, (p) => p.screen === 'game');
    await advance(page, 2);
    await key(page, 'p', 1);
    await choose(page, 'Save');
    await advanceUntil(page, (p) => p.pauseItem === '  OK');
    await choose(page, 'Bye');
    await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0, 40);
  }
  const saves = (await probe(page)).userFiles.filter((f) => f.endsWith('_'));
  expect(saves.length).toBe(2);

  await choose(page, 'Archive');
  await advanceUntil(page, (p) => p.screen === 'archive' && p.dialog === 1);
  expect((await probe(page)).status).toContain('File:');
  await choose(page, 'View');
  await advanceUntil(page, (p) => p.dialog === -1 && p.status.includes('close the preview'));
  await page.locator('#app').click({ position: { x: 300, y: 300 } });
  await advanceUntil(page, (p) => p.dialog === 1);
  await choose(page, 'Next');
  await advanceUntil(page, (p) => p.dialog === 1);
  await choose(page, 'Delete');
  await advanceUntil(page, (p) => p.dialog === 2);
  await choose(page, 'No');
  await advanceUntil(page, (p) => p.dialog === 1);
  await choose(page, 'Delete');
  await advanceUntil(page, (p) => p.dialog === 2);
  await choose(page, 'Yes');
  await advanceUntil(page, (p) => p.userFiles.filter((f) => f.endsWith('_')).length === 1);
  await advanceUntil(page, (p) => p.dialog === 1);
  await choose(page, 'Bye');
  await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0);
  await choose(page, 'Archive');
  await advanceUntil(page, (p) => p.dialog === 1);
  await choose(page, 'Go!');
  await advanceUntil(page, (p) => p.screen === 'game' && p.dialog === -1);
});

test('Records: shows the tables and closes', async ({ page }) => {
  await start(page);
  // a record: play a little and quit through the pause menu (writeRecords)
  await choose(page, 'Go!');
  await advanceUntil(page, (p) => p.screen === 'game');
  // (the game clears the last key when it starts: wait for the first entrance)
  await advance(page, 3);
  await key(page, 'p', 1);
  await choose(page, 'Bye');
  await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0, 40);
  await choose(page, 'Records');
  await advanceUntil(page, (p) => p.screen === 'records');
  await expect(page.locator('.hud-records')).toContainText('The best managers');
  await expect(page.locator('.hud-records')).toContainText('Unknown');
  await page.locator('.hud-records .hud-close').click();
  await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0);
});

test('Bye: the game ends, Play again restarts it', async ({ page }) => {
  await start(page);
  await choose(page, 'Bye');
  await advanceUntil(page, (p) => p.halted === 'exit');
  await expect(page.locator('#overlay')).toContainText('Bye');
  await page.locator('#overlay button').click();
  await advanceUntil(page, (p) => p.screen === 'loading');
});

test('Player name: the start level comes from the records', async ({ page }) => {
  await start(page);
  await page.locator('.toolbar button[title="Settings"]').click();
  await page.locator('input[name="playerName"]').fill('Tester');
  await page.getByText('Start as this player').click();
  await advanceUntil(page, (p) => p.screen === 'loading');
  const name = await page.evaluate(() => {
    const b = window.__parovozyky!.game()!.sim.world.playerName;
    return String.fromCharCode(...b.slice(0, b.indexOf(0)));
  });
  expect(name).toBe('Tester');
});

test('Go: the mode button shows and switches the mouse mode', async ({ page }) => {
  await start(page);
  const button = page.locator('.hud-mode');
  await expect(button).toBeHidden();
  await choose(page, 'Go!');
  // a new game starts in construction (main_menu.cpp)
  await advanceUntil(page, (p) => p.screen === 'game' && p.mode === 2);
  await expect(button).toHaveAttribute('data-mode', 'construction');
  // the main loop starts after the screen shift and drops the keys pressed before it
  await advance(page, 3);
  await button.click();
  await advanceUntil(page, (p) => p.mode === 1, 2);
  await expect(button).toHaveAttribute('data-mode', 'management');
  // the keyboard switches it as well
  await key(page, 'Space');
  await advanceUntil(page, (p) => p.mode === 2, 2);
  await expect(button).toHaveAttribute('data-mode', 'construction');
  // and the middle mouse button
  await page.locator('#app').click({ button: 'middle', position: { x: 300, y: 300 } });
  await advanceUntil(page, (p) => p.mode === 1, 2);
  await expect(button).toHaveAttribute('data-mode', 'management');
});
