// Saved games and records in and out of the browser: the bookmarklet on a
// (simulated) page of the reSL web version, import of its zip, the start
// level of the imported records, Archive, "play as", export.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { makeRecords } from '../../tools/scenario/files.mjs';
import { advance, advanceUntil, key, probe, start } from './helpers';

const EXTRA = join(process.cwd(), 'reference/reSL/resources/extra');
const SAVES = ['017EN815.25_', '203sg999.01_'];

/** the files of the reSL web version: IndexedDB "/persistent" written by Emscripten IDBFS */
async function fakeResl(page: Page, files: [string, number[]][]): Promise<void> {
  await page.evaluate(async (files) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('/persistent', 21);
      req.onupgradeneeded = () => req.result.createObjectStore('FILE_DATA').createIndex('timestamp', 'timestamp');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction('FILE_DATA', 'readwrite');
        const st = tx.objectStore('FILE_DATA');
        st.put({ timestamp: new Date(), mode: 16877 }, '/persistent');
        for (const [name, data] of files) st.put({ timestamp: new Date(), mode: 33206, contents: new Uint8Array(data) }, `/persistent/${name}`);
        tx.oncomplete = () => resolve();
      };
    });
  }, files);
}

/** runs the bookmarklet of the settings panel (as built); returns the zip it downloads */
async function runBookmarklet(page: Page): Promise<Buffer> {
  await page.locator('.toolbar button[title=Settings]').click();
  const href = (await page.locator('.settings .bookmarklet').getAttribute('href'))!;
  expect(href.startsWith('javascript:')).toBe(true);
  await page.locator('.toolbar button[title=Settings]').click();
  const download = page.waitForEvent('download');
  await page.evaluate(decodeURIComponent(href.slice('javascript:'.length)));
  const d = await download;
  expect(d.suggestedFilename()).toBe('shortline-saves.zip');
  return readFileSync((await d.path())!);
}

test('saves from the reSL web version: bookmarklet, import, level, archive, export', async ({ page }) => {
  await start(page);
  const records = makeRecords([
    { name: 'Unknown', level: 7 },
    { name: 'Dad', level: 9 },
  ]) as Uint8Array;
  await fakeResl(page, [
    ...SAVES.map((n) => [n, Array.from(readFileSync(join(EXTRA, n)))] as [string, number[]]),
    ['results.tbl', Array.from(records)],
  ]);
  const zip = await runBookmarklet(page);

  // import through the settings panel
  await page.locator('.toolbar button[title=Settings]').click();
  await page.locator('.settings .saves input[type=file]').setInputFiles({ name: 'shortline-saves.zip', mimeType: 'application/zip', buffer: zip });
  const report = page.locator('.saves-report');
  await expect(report).toContainText('Ігор: 2');
  await expect(report).toContainText('Unknown: рівень 7 (це ви)');
  await expect(report).toContainText('Dad: рівень 9');
  expect((await probe(page)).userFiles.sort()).toEqual([...SAVES, 'results.tbl'].sort());

  // the game starts again in the main menu with the level of the records
  await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0, 30);
  const level = () => page.evaluate(() => window.__parovozyky!.game()!.sim.world.headers[3].value);
  expect(await level()).toBe(7);

  // "play as" Dad
  await report.getByRole('button', { name: 'грати як цей гравець' }).click();
  await expect(report).toContainText('Dad: рівень 9 (це ви)');
  await advanceUntil(page, (p) => p.screen === 'menu' && p.dialog === 0, 30);
  expect(await level()).toBe(9);

  // Archive shows the imported games
  await page.locator('.toolbar button[title=Settings]').click();
  await key(page, 'a', 2);
  await advanceUntil(page, (p) => p.screen === 'archive', 10);
  await advance(page, 1);

  // export: a zip with the same files
  const download = page.waitForEvent('download');
  await page.locator('.toolbar button[title=Settings]').click();
  await page.getByRole('button', { name: 'Експорт (zip)' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('parovozyky-saves.zip');
  const out = readFileSync((await d.path())!);
  for (const n of [...SAVES, 'results.tbl']) expect(out.includes(Buffer.from(n))).toBe(true);
});

test('original DOS files dropped one by one; other files are skipped', async ({ page }) => {
  await start(page);
  await page.locator('.toolbar button[title=Settings]').click();
  await page.locator('.settings .saves input[type=file]').setInputFiles([
    { name: '048HL949.02_', mimeType: 'application/octet-stream', buffer: readFileSync(join(EXTRA, '048hl949.02_')) },
    { name: 'RESULTS.TBL', mimeType: 'application/octet-stream', buffer: Buffer.from(makeRecords([{ name: 'Unknown', level: 3 }]) as Uint8Array) },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
  ]);
  const report = page.locator('.saves-report');
  await expect(report).toContainText('Ігор: 1');
  await expect(report).toContainText('Пропущено (не файли гри): notes.txt');
  expect((await probe(page)).userFiles.sort()).toEqual(['048HL949.02_', 'results.tbl']);
});
