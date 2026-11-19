// 2026-11-18, professional features through the real app: the camera zoomed in on the top-left
// corner of the stage is what the exported MP4 shows (FFmpeg reads its pixels), and its frame is
// drawn on the stage; a keyframe's custom ease curve is shaped by dragging its handle; one
// object's motion is pasted on another.
import { expect, test, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { bundledFfmpeg } from '../integration/helpers/ffmpeg.ts';
import { answerDialogs, launchApp, pickTool } from './app.ts';

const execFileAsync = promisify(execFile);
let dir: string;
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mve-pro-'));
});
test.afterAll(() => rm(dir, { recursive: true, force: true }));

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function animationMode(page: Page) {
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Animation' })
    .click();
  await expect(page.getByRole('application', { name: 'Stage' })).toBeVisible();
}

async function type(page: Page, label: string, value: string) {
  const box = page.getByLabel(label, { exact: true });
  await box.fill(value);
  await box.press('Tab');
}

/** A grey value of the exported video's first frame at (x, y). */
async function pixel(video: string, x: number, y: number): Promise<number> {
  const { stdout } = await execFileAsync(
    bundledFfmpeg().ffmpeg,
    [
      ...['-v', 'error', '-i', video, '-frames:v', '1'],
      ...['-vf', `format=gray,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    ],
    { encoding: 'buffer' },
  );
  return (stdout as Buffer)[0]!;
}

test('the camera zoomed on a corner is what the MP4 shows', async () => {
  test.setTimeout(180_000);
  const { app, window: page } = await launchApp();
  await animationMode(page);
  // A black square in the top-left quarter of the 1280 × 720 stage, typed exactly.
  await pickTool(page, 'Rectangle');
  const b = (await page.getByRole('application', { name: 'Stage' }).boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + 60, b.y + 60, { steps: 4 });
  await page.mouse.up();
  await type(page, 'X', '220');
  await type(page, 'Y', '80');
  await type(page, 'W', '200');
  await type(page, 'H', '200');
  const props = page.getByRole('complementary', { name: 'Properties' });
  // The fill's colour (the outline's comes after it).
  await props.getByLabel('Colour', { exact: true }).first().fill('#000000');
  await props.getByLabel('Colour', { exact: true }).first().press('Enter');
  // Nothing selected (a click on the empty stage): Properties shows the camera.
  await pickTool(page, 'Select');
  await page.mouse.click(b.x + b.width - 5, b.y + b.height - 5);
  // The camera: centred on the square, zoomed in 4 times.
  const camera = page.getByRole('group', { name: 'Camera' });
  await camera.getByLabel('Camera X', { exact: true }).fill('320');
  await camera.getByLabel('Camera X', { exact: true }).press('Tab');
  await camera.getByLabel('Camera Y', { exact: true }).fill('180');
  await camera.getByLabel('Camera Y', { exact: true }).press('Tab');
  await camera.getByLabel('Zoom', { exact: true }).fill('400');
  await camera.getByLabel('Zoom', { exact: true }).press('Tab');
  await expect(page.getByLabel('Camera frame')).toBeVisible();

  const mp4 = join(dir, 'camera.mp4');
  await answerDialogs(app, { exportTo: mp4 });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const box = page.getByRole('dialog', { name: 'Export animation' });
  await box.getByRole('radio', { name: /MP4 video/ }).check();
  await box.getByRole('button', { name: 'Export file' }).click();
  await expect(box).toBeHidden({ timeout: 60_000 });
  await expect.poll(() => exists(mp4), { timeout: 60_000 }).toBe(true);
  // Through the camera (centred on (320, 180), 4×) the square (220–420 across) is drawn from
  // 240 to 1040 px: the middle of the picture is black, as is 300 px; 200 px and the far corner
  // are white stage. Without the camera the middle would be white.
  expect(await pixel(mp4, 640, 360)).toBeLessThan(40);
  expect(await pixel(mp4, 300, 360)).toBeLessThan(40);
  expect(await pixel(mp4, 200, 360)).toBeGreaterThan(200);
  expect(await pixel(mp4, 1200, 30)).toBeGreaterThan(200);
  await app.close();
});

test('a custom ease curve is dragged; a motion is pasted on another object', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  /** An ellipse drawn at fractions of the stage (measured each time: the keyframe bar moves it). */
  const draw = async (fx: number, fy: number) => {
    const b = (await page.getByRole('application', { name: 'Stage' }).boundingBox())!;
    await pickTool(page, 'Ellipse');
    await page.mouse.move(b.x + fx * b.width, b.y + fy * b.height);
    await page.mouse.down();
    await page.mouse.move(b.x + fx * b.width + 20, b.y + fy * b.height + 20, { steps: 4 });
    await page.mouse.up();
  };
  await draw(0.05, 0.1);
  await page.getByLabel('Go to frame').fill('24');
  await page.getByLabel('Go to frame').press('Enter');
  await type(page, 'X', '600');
  const timeline = page.getByRole('region', { name: 'Timeline' });
  await timeline.getByRole('button', { name: 'X keyframe at frame 0' }).click();
  await page.getByLabel('Easing').selectOption({ label: 'Custom curve' });
  const handle = page.getByRole('slider', { name: 'Curve handle 1' });
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x - 10, h.y - 60, { steps: 5 });
  await page.mouse.up();
  const numbers = (await page.getByLabel('Curve numbers').textContent()) ?? '';
  expect(numbers).not.toBe('0.42, 0.00, 0.58, 1.00');
  await page.getByRole('button', { name: 'Done' }).click();
  // Copy its motion; paste it on a second ellipse.
  const props = page.getByRole('complementary', { name: 'Properties' });
  await props.getByRole('button', { name: 'Copy motion' }).click();
  await page.getByLabel('Go to frame').fill('0');
  await page.getByLabel('Go to frame').press('Enter');
  await draw(0.05, 0.6);
  await props.getByRole('button', { name: 'Paste motion' }).click();
  // Both ellipses now have keyframes at frame 24 (each object's row on the timeline).
  await expect(
    timeline.getByRole('button', { name: 'Keyframes of Ellipse at frame 24' }),
  ).toBeVisible();
  await expect(
    timeline.getByRole('button', { name: 'Keyframes of Ellipse 2 at frame 24' }),
  ).toBeVisible();
  await app.close();
});
