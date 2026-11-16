// M21: Graphics mode's pixels in the real app, where only the real canvas and the real worker can
// show the result — a picture opened as an image (GB1), its white background selected with the
// magic wand and deleted (GB2), a line drawn with the pencil and an area filled with the paint
// bucket through the pixel worker (GB4, GB3), saved as a .mveg and opened again (D9), and
// exported as a PNG whose pixels are right (the stage's canvas drawing the pixel layer).
import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundledFfmpeg, run } from '../integration/helpers/ffmpeg.ts';
import { answerDialogs, launchApp, menu } from './app.ts';

let dir: string;
let picture: string;
const W = 400;
const H = 300;

test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mve-pixels-'));
  picture = join(dir, 'Box.png');
  // White, with a red box at (100, 100), 100 × 80, and a blue box at (260, 60), 80 × 60.
  await run(bundledFfmpeg().ffmpeg, [
    ...['-v', 'error', '-f', 'lavfi', '-i', `color=white:s=${W}x${H}`],
    ...[
      '-vf',
      'drawbox=x=100:y=100:w=100:h=80:color=red:t=fill,drawbox=x=260:y=60:w=80:h=60:color=blue:t=fill',
    ],
    ...['-frames:v', '1', '-y', picture],
  ]);
});
test.afterAll(() => rm(dir, { recursive: true, force: true }));

/** The RGBA of one pixel of a picture, as FFmpeg decodes it. */
async function pixel(file: string, x: number, y: number, width: number): Promise<number[]> {
  const raw = join(dir, `${Math.random().toString(36).slice(2)}.rgba`);
  await run(bundledFfmpeg().ffmpeg, [
    ...['-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'format=rgba'],
    ...['-f', 'rawvideo', '-y', raw],
  ]);
  const bytes = await readFile(raw);
  const at = (y * width + x) * 4;
  return [...bytes.subarray(at, at + 4)];
}

/** Where an image pixel is on the screen. */
async function onScreen(page: Page, x: number, y: number) {
  const box = (await page.getByRole('application', { name: 'Stage' }).boundingBox())!;
  return { x: box.x + ((x + 0.5) * box.width) / W, y: box.y + ((y + 0.5) * box.height) / H };
}

async function clickAt(page: Page, x: number, y: number) {
  const p = await onScreen(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function tool(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}

async function exportPng(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const box = page.getByRole('dialog', { name: 'Export image' });
  await box.getByRole('radio', { name: /PNG/ }).check();
  await box.getByRole('button', { name: 'Export…' }).click();
  await expect(box).toBeHidden({ timeout: 30_000 });
}

test('GB1 GB2 GB3 GB4 D9: a picture opened, its background deleted with the wand, painted and filled through the worker, saved, opened again and exported with the right pixels', async () => {
  test.setTimeout(180_000);
  const { app, window: page } = await launchApp();
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Graphics' })
    .click();
  await answerDialogs(app, { open: [picture] });
  await menu(app, 'File', 'Open Picture as Image…');
  await expect(page.getByText(/Opened Box\.png as a new image: 400 × 300 px/)).toBeVisible();

  // N10: in a small window the Layers panel's buttons wrap inside it (none under the tools).
  const outside = await page.evaluate(() => {
    const panel = document.querySelector('.slot.left')!.getBoundingClientRect();
    return [...document.querySelectorAll('.slot.left .actions button')]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.right > panel.right + 0.5).length;
  });
  expect(outside).toBe(0);

  // GB2: the white round the boxes, with the magic wand (not contiguous), deleted.
  await tool(page, 'Magic wand');
  await page.getByLabel('Contiguous').uncheck();
  await clickAt(page, 5, 5);
  await page.keyboard.press('Delete');
  // Select ▸ Deselect: the bucket and the brushes work only inside a selection.
  await menu(app, 'Select', 'Deselect');

  // GB3: the paint bucket fills the blue box green, through the pixel worker.
  await tool(page, 'Paint bucket');
  const colour = page.getByLabel('Colour', { exact: true });
  await colour.fill('#00FF00');
  await colour.press('Tab');
  await clickAt(page, 300, 90);

  // GB4: a pencil line across the bottom.
  await tool(page, 'Pencil');
  const from = await onScreen(page, 20, 250);
  const to = await onScreen(page, 380, 250);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();

  // The bucket ran in the worker the build made (not in the page).
  await expect
    .poll(() => page.workers().map((w) => w.url()))
    .toContainEqual(expect.stringMatching(/pixels[-.][\w-]*\.js/));

  // D9: saved as a .mveg, closed by a new image, opened again.
  const saved = join(dir, 'Box.mveg');
  await answerDialogs(app, { save: saved });
  await menu(app, 'File', 'Save As…');
  await expect
    .poll(
      () =>
        readFile(saved).then(
          (b) => b.length,
          () => 0,
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  const zip = await readFile(saved);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  await answerDialogs(app, { open: [saved] });
  await menu(app, 'File', 'Open Image…');

  const output = join(dir, 'Box.png');
  await answerDialogs(app, { exportTo: output });
  await exportPng(page);
  // The white is gone; red stays; the blue box is green; the pencil line is drawn.
  expect((await pixel(output, 5, 5, W))[3]).toBe(0);
  // FFmpeg draws its boxes in YUV: its red is 253.
  const red = await pixel(output, 150, 140, W);
  expect(red[0]).toBeGreaterThan(240);
  expect([red[1], red[2], red[3]]).toEqual([0, 0, 255]);
  const green = await pixel(output, 300, 90, W);
  expect(green[1]).toBeGreaterThan(200);
  expect(green[2]).toBeLessThan(60);
  const line = await pixel(output, 200, 250, W);
  expect(line[3]).toBe(255);
  await app.close();
});
