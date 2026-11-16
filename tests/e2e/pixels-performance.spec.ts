// M21 (GN1–GN3): the bitmap budget in the real app, on a photo the size of the papers' largest
// (Ocean.jpg, 4128 × 2322, made here by FFmpeg so CI has it too). Opening the JPEG takes ≤ 2 s and
// its .mveg ≤ 3 s (GN3); a brush stroke follows the pointer at ≥ 30 fps (GN2); with 6 layers and 50
// undo steps the whole app stays under 1 GB (GN1). CI's runners stand in for the weakest pilot
// laptop; the teacher's run on that laptop (M23) is the real check.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundledFfmpeg, run } from '../integration/helpers/ffmpeg.ts';
import { answerDialogs, launchApp, menu } from './app.ts';

// CI's macOS runners are virtual Macs drawing without a graphics card (see
// animation-performance.spec.ts): looser limits there, still far from a stalled window.
const VIRTUAL_MAC = Boolean(process.env.CI) && process.platform === 'darwin';
const SLOW = VIRTUAL_MAC ? 2 : 1;
const MIN_FPS = VIRTUAL_MAC ? 20 : 30;
const W = 4128;
const H = 2322;

let dir: string;
let photo: string;
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mve-perf-pixels-'));
  photo = join(dir, 'Ocean.jpg');
  await run(bundledFfmpeg().ffmpeg, [
    ...['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${W}x${H}`],
    ...['-frames:v', '1', '-q:v', '3', '-y', photo],
  ]);
});
test.afterAll(() => rm(dir, { recursive: true, force: true }));

/** The whole app's memory (every process), as the performance report adds it up (N4). */
const appMB = (app: ElectronApplication) =>
  app.evaluate(({ app }) =>
    Math.round(app.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize, 0) / 1024),
  );

async function graphics(page: Page) {
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Graphics' })
    .click();
}

async function openPhoto(app: ElectronApplication, page: Page): Promise<number> {
  await graphics(page);
  await answerDialogs(app, { open: [photo] });
  const started = Date.now();
  await menu(app, 'File', 'Open Picture as Image…');
  await expect(page.getByText(/Opened Ocean\.jpg as a new image: 4128 × 2322 px/)).toBeVisible({
    timeout: 30_000,
  });
  return (Date.now() - started) / 1000;
}

/**
 * Paints a stroke from the page itself, one pointer move per 16 ms for `ms`, and counts the
 * frames the window painted meanwhile (requestAnimationFrame): a slow stroke shows as frames lost.
 */
async function strokeFps(
  page: Page,
  ms: number,
  part: { x: number; y: number; w: number } = { x: 0.1, y: 0.5, w: 0.8 },
) {
  const box = (await page.getByRole('application', { name: 'Stage' }).boundingBox())!;
  return page.evaluate(
    async ({ box, duration, part }) => {
      const stage = document.querySelector('svg[aria-label="Stage"]')!;
      const at = (t: number) => ({
        clientX: box.x + box.width * (part.x + part.w * t),
        clientY: box.y + box.height * (part.y + part.w * 0.3 * Math.sin(t * 12)),
      });
      const event = (type: string, t: number) =>
        new PointerEvent(type, { ...at(t), button: 0, buttons: 1, bubbles: true, pointerId: 1 });
      stage.dispatchEvent(event('pointerdown', 0));
      let frames = 0;
      let longest = 0;
      const start = performance.now();
      let last = start;
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          frames++;
          longest = Math.max(longest, now - last);
          last = now;
          if (now - start < duration) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
        const mover = setInterval(() => {
          const t = (performance.now() - start) / duration;
          if (t >= 1) return clearInterval(mover);
          window.dispatchEvent(event('pointermove', t));
        }, 16);
      });
      window.dispatchEvent(event('pointerup', 1));
      return { fps: (frames * 1000) / duration, longestGapMs: Math.round(longest) };
    },
    { box, duration: ms, part },
  );
}

test('GN3 a 12-megapixel JPEG opens in 2 s and its .mveg in 3 s', async () => {
  test.setTimeout(180_000);
  const { app, window: page } = await launchApp();
  const jpeg = await openPhoto(app, page);
  const saved = join(dir, 'Ocean.mveg');
  await answerDialogs(app, { save: saved });
  await menu(app, 'File', 'Save As…');
  await expect
    .poll(
      () =>
        readFile(saved).then(
          (b) => b.length,
          () => 0,
        ),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);
  await app.close();
  // Opened again in a fresh app, as a student opens yesterday's work.
  const second = await launchApp();
  await graphics(second.window);
  await answerDialogs(second.app, { open: [saved] });
  const started = Date.now();
  await menu(second.app, 'File', 'Open Image…');
  await expect(second.window.getByText('4128 × 2322 px').first()).toBeVisible({ timeout: 30_000 });
  await expect(second.window.getByText('Ocean', { exact: true }).first()).toBeVisible();
  const mveg = (Date.now() - started) / 1000;
  test.info().annotations.push({ type: 'GN3', description: `JPEG ${jpeg} s, .mveg ${mveg} s` });
  expect(jpeg).toBeLessThanOrEqual(2 * SLOW);
  expect(mveg).toBeLessThanOrEqual(3 * SLOW);
  await second.app.close();
});

test('GN2 GN1 a brush stroke follows at 30 fps; 6 layers and 50 undo steps stay under 1 GB', async () => {
  test.setTimeout(300_000);
  const { app, window: page } = await launchApp();
  const before = await appMB(app);
  await openPhoto(app, page);
  await page.waitForTimeout(2000);
  const opened = await appMB(app);
  await page.getByRole('button', { name: 'Paintbrush', exact: true }).click();
  const size = page.getByLabel('Size', { exact: true });
  await size.fill('80');
  await size.press('Tab');
  // A first stroke warms the canvas's pictures up, as a student's first dab would.
  await strokeFps(page, 300);
  const { fps, longestGapMs } = await strokeFps(page, 2000);
  test.info().annotations.push({
    type: 'GN2 stroke',
    description: `${fps.toFixed(1)} fps, longest gap ${longestGapMs} ms`,
  });
  expect(fps).toBeGreaterThanOrEqual(MIN_FPS);

  // GN1: six layers (the photo duplicated five times) and 50 strokes to undo.
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Duplicate layer' }).click();
  await expect(page.getByText('Pixels', { exact: true })).toHaveCount(6);
  await page.waitForTimeout(2000);
  const six = await appMB(app);
  // Brush-sized strokes (each about 300 px of the photo), here and there over it.
  for (let i = 0; i < 50; i++)
    await strokeFps(page, 60, {
      x: 0.05 + 0.85 * ((i * 0.37) % 1),
      y: 0.1 + 0.8 * ((i * 0.61) % 1),
      w: 0.07,
    });
  await page.waitForTimeout(2000);
  const mb = await appMB(app);
  test.info().annotations.push({
    type: 'GN1 memory',
    description: `${mb} MB (${before} at start, ${opened} with the photo, ${six} with 6 layers)`,
  });
  expect(mb).toBeLessThan(1024);
  await app.close();
});
