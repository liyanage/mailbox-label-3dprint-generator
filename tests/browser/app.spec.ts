import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { inspectStl } from '../stl.mjs';
import { inspectThreeMf } from '../three-mf.mjs';

const font = process.env.MAILBOX_TEST_FONT ?? '/Library/Fonts/SF-Pro-Rounded-Bold.otf';
test.skip(!existsSync(font), 'Set MAILBOX_TEST_FONT to SF-Pro-Rounded-Bold.otf.');

async function chooseFont(page: Page): Promise<void> {
  await page.locator('#font-file').setInputFiles(font);
  await expect(page.locator('#generate')).toBeEnabled();
}

async function generate(page: Page): Promise<void> {
  await page.locator('#generate').click();
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#download-3mf')).toBeEnabled();
}

async function download3mf(page: Page, filename: string): Promise<void> {
  const pending = page.waitForEvent('download');
  await page.locator('#download-3mf').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(filename);
  const parts = inspectThreeMf(await readFile((await download.path())!));
  expect(parts.map(part => part.name)).toEqual(['Base', 'Text']);
  expect(parts[0].levels).toEqual([0, 2]);
  expect(parts[1].levels).toEqual([2, 3]);
}

test('font, single and double names, 3D views, STL and 3MF downloads, persistence and forgetting', async ({ page }, testInfo) => {
  const errors: string[] = [], remoteRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4173/')) remoteRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('#generate')).toBeDisabled();
  await expect(page.locator('#download-3mf')).toBeDisabled();
  await expect(page.locator('canvas')).toBeVisible();
  await chooseFont(page);
  await generate(page);
  await download3mf(page, '52-hopper.3mf');
  await page.screenshot({ path: testInfo.outputPath('desktop-one-name.png'), fullPage: true });
  await page.locator('#unit').fill('54');
  await page.locator('#name-one').fill('ALPHA');
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#download-3mf')).toBeDisabled();
  await page.locator('#add-name').click();
  await page.locator('#name-two').fill('BETA');
  await generate(page);
  await download3mf(page, '54-alpha-beta.3mf');
  await page.locator('.printing-guidance summary').click();
  await page.screenshot({ path: testInfo.outputPath('desktop-two-names.png'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('54-alpha-beta.stl');
  const mesh = inspectStl(await readFile((await download.path())!));
  expect(mesh.max).toEqual([44.5, 38.5, 3]);
  expect(mesh.levels).toEqual([0, 2, 3]);
  expect(mesh.triangles).toBe(3608);
  expect(Math.abs(mesh.volume-3629.5786221163767)).toBeLessThan(0.001);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await page.mouse.down(); await page.mouse.move(box.x+box.width/2+90, box.y+box.height/2+30, { steps: 12 }); await page.mouse.up();
  await page.locator('#reset-view').click();
  await page.reload();
  await expect(page.locator('#font-name')).toHaveText('SF-Pro-Rounded-Bold.otf');
  await expect(page.locator('#generate')).toBeEnabled();
  await page.locator('#forget-font').click();
  await expect(page.locator('#download-3mf')).toBeDisabled();
  await expect(page.locator('#font-name')).toHaveText('No font selected');
  await page.reload();
  await expect(page.locator('#generate')).toBeDisabled();
  await expect(page.locator('#font-name')).toHaveText('No font selected');
  expect(errors).toEqual([]);
  expect(remoteRequests).toEqual([]);
});

test('fit reports, validation, restored defaults and mobile layout', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Mailbox labels');
  await expect(page.locator('.about-link')).toHaveAttribute('href', 'https://github.com/liyanage/mailbox-label-3dprint-generator#readme');
  await expect(page.locator('.about-link')).toHaveAttribute('target', '_blank');
  await expect(page.locator('.guidance-content')).toBeHidden();
  await chooseFont(page);
  await page.locator('#name-one').fill('EXTRA-LONG-EXAMPLE-LABEL');
  await generate(page);
  await expect(page.locator('#fit-note')).toContainText('fitted at');
  await page.locator('.advanced summary').click();
  await page.locator('#setting-baseThickness').fill('1.6');
  await expect(page.locator('#layer-note')).toContainText('color change at 1.6 mm');
  await page.locator('#setting-fit').selectOption('error');
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('too wide');
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#download-3mf')).toBeDisabled();
  await page.locator('#reset-settings').click();
  await expect(page.locator('#layer-note')).toContainText('color change at 2 mm');
  await page.locator('#name-one').fill('EXAMPLE');
  await page.locator('#setting-radius').fill('25');
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('corner radius');
  await page.locator('#reset-settings').click();
  await page.locator('.advanced summary').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await generate(page);
  await page.locator('.printing-guidance summary').click();
  await expect(page.locator('.guidance-content')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#add-name').click();
  await page.locator('#name-two').fill('BETA');
  await generate(page);
  await page.locator('#remove-name').click();
  await generate(page);
  await page.locator('#font-file').setInputFiles({ name: 'invalid.otf', mimeType: 'font/otf', buffer: Buffer.from('this is not a font') });
  await expect(page.locator('#status')).toContainText('OpenType');
  await expect(page.locator('#generate')).toBeDisabled();
  await chooseFont(page);
  await generate(page);
});
