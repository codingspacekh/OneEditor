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
import { answerDialogs, launchApp, menu, pickTool } from './app.ts';

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

/** One image pixel as the stage's canvas shows it (what the student sees). */
async function stagePixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([px, py, w, h]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('.paper canvas')!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const cx = Math.floor(((px! + 0.5) * canvas.width) / w!);
      const cy = Math.floor(((py! + 0.5) * canvas.height) / h!);
      return [...ctx.getImageData(cx, cy, 1, 1).data];
    },
    [x, y, W, H],
  );
}

async function tool(page: Page, name: string) {
  await pickTool(page, name);
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

  // Not Box.png: that is the picture the next test opens.
  const output = join(dir, 'Box-exported.png');
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

/** Clicks a native menu item inside a submenu: Image ▸ Adjustments ▸ Brightness / Contrast…. */
async function subMenu(app: import('@playwright/test').ElectronApplication, path: string[]) {
  await app.evaluate(({ Menu, BrowserWindow }, labels) => {
    let items = Menu.getApplicationMenu()!.items;
    let item = items.find((i) => i.label === labels[0])!;
    for (const label of labels.slice(1)) {
      items = item.submenu!.items;
      item = items.find((i) => i.label === label)!;
    }
    item.click(undefined, BrowserWindow.getAllWindows()[0], undefined as never);
  }, path);
}

test('GB5 GB3 G14: a clone stroke, an adjustment and a filter from their dialogs, and a glow on the layer, in the exported pixels', async () => {
  test.setTimeout(180_000);
  const { app, window: page } = await launchApp();
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Graphics' })
    .click();
  await answerDialogs(app, { open: [picture] });
  await menu(app, 'File', 'Open Picture as Image…');
  await expect(page.getByText(/Opened Box\.png/)).toBeVisible();
  // The white made see-through (the glow then shows round the boxes).
  await tool(page, 'Magic wand');
  await page.getByLabel('Contiguous').uncheck();
  await clickAt(page, 5, 5);
  await page.keyboard.press('Delete');
  await menu(app, 'Select', 'Deselect');

  // GB5: the clone stamp — Alt-click the blue box, then paint 140 px below it.
  await tool(page, 'Clone stamp');
  const source = await onScreen(page, 300, 90);
  await page.keyboard.down('Alt');
  await page.mouse.click(source.x, source.y);
  await page.keyboard.up('Alt');
  const from = await onScreen(page, 280, 230);
  const to = await onScreen(page, 320, 230);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  // The stroke is on the stage (blue copied there) before the next step, as a student sees it.
  await expect
    .poll(async () => {
      const [r, , b] = await stagePixel(page, 300, 230);
      return b! - r!;
    })
    .toBeGreaterThan(40);

  // GB3: Brightness / Contrast from the Image menu, its dialog, OK.
  await subMenu(app, ['Image', 'Adjustments', 'Brightness / Contrast…']);
  const adjust = page.getByRole('dialog', { name: 'Brightness / contrast' });
  await expect(adjust).toBeVisible();
  const brightness = adjust.getByLabel('Brightness value');
  await brightness.fill('-60');
  await brightness.press('Tab');
  await adjust.getByRole('button', { name: 'OK' }).click();
  await expect(adjust).toBeHidden({ timeout: 30_000 });

  // GB5: a Gaussian blur from the Filter menu.
  await subMenu(app, ['Filter', 'Blur', 'Gaussian Blur…']);
  const blur = page.getByRole('dialog', { name: 'Gaussian blur' });
  const radius = blur.getByLabel('Radius value');
  await radius.fill('2');
  await radius.press('Tab');
  await blur.getByRole('button', { name: 'OK' }).click();
  await expect(blur).toBeHidden({ timeout: 30_000 });

  // G14: a glow on the pixel layer (Properties, nothing selected).
  await page.getByRole('button', { name: 'Add glow' }).click();

  const output = join(dir, 'Retouched.png');
  await answerDialogs(app, { exportTo: output });
  await exportPng(page);
  // The clone: blue where it was painted.
  const cloned = await pixel(output, 300, 230, W);
  expect(cloned[2]).toBeGreaterThan(cloned[0]! + 40);
  // Darker: the red box's red is well below what it was (253).
  const red = await pixel(output, 150, 140, W);
  expect(red[0]).toBeLessThan(220);
  // Blurred: the box's edge is soft; and the glow shows outside it where all was see-through.
  const edge = await pixel(output, 100, 140, W);
  expect(edge[3]).toBeGreaterThan(0);
  expect(edge[3]).toBeLessThan(255);
  const glow = await pixel(output, 92, 140, W);
  expect(glow[3]).toBeGreaterThan(0);
  await app.close();
});
