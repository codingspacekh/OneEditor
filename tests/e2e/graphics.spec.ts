// M18: Graphics mode in the real app, where only the real canvas can show the result: a logo
// drawn on a new image of a chosen size is saved as a .mveg, exported as a PNG and a JPG whose
// pixels and resolution are right (G10, G11), as a 10 cm SVG (9626/04 M/22 HeronV10cm), and sent
// to Animation mode (GL3). The papers: J/23 BasicWheel (exact px and hex colours), J/17 HUNGRY
// (200 × 200 px, a compressed format for a website).
import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRect } from '../../src/core/animation/factory.ts';
import { createGraphic } from '../../src/core/graphics/document.ts';
import { writeGraphicFile } from '../../src/core/graphics/mveg.ts';
import { webCompression } from '../../src/core/image/deflate.ts';
import { jpegDpi, pngDpi } from '../../src/core/image/dpi.ts';
import { bundledFfmpeg, run } from '../integration/helpers/ffmpeg.ts';
import { answerDialogs, launchApp, menu, pickTool } from './app.ts';

let dir: string;
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mve-graphics-'));
});
test.afterAll(() => rm(dir, { recursive: true, force: true }));

async function type(page: Page, label: string, value: string) {
  const box = page.getByLabel(label, { exact: true });
  await box.fill(value);
  await box.press('Tab');
}

/** A PNG's width and height from its header. */
const pngSize = (b: Uint8Array) => ({
  width: (b[16]! << 24) | (b[17]! << 16) | (b[18]! << 8) | b[19]!,
  height: (b[20]! << 24) | (b[21]! << 16) | (b[22]! << 8) | b[23]!,
});

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

async function newImage(page: Page, preset: string) {
  await page.getByRole('button', { name: 'New image' }).click();
  const box = page.getByRole('dialog', { name: 'New image' });
  await box.getByRole('button', { name: preset, exact: true }).click();
  await box.getByRole('button', { name: 'Create' }).click();
  await expect(box).toBeHidden();
}

async function drawEllipse(page: Page) {
  await pickTool(page, 'Ellipse');
  const stage = page.getByRole('application', { name: 'Stage' });
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();
}

async function exportAs(
  page: Page,
  format: RegExp,
  set?: (box: ReturnType<Page['getByRole']>) => Promise<void>,
) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const box = page.getByRole('dialog', { name: 'Export image' });
  await box.getByRole('radio', { name: format }).check();
  if (set) await set(box);
  await box.getByRole('button', { name: 'Export…' }).click();
  await expect(box).toBeHidden({ timeout: 30_000 });
}

test('J/23 BasicWheel and J/17 HUNGRY: a logo saved, exported as PNG and JPG with the right pixels and dpi', async () => {
  test.setTimeout(120_000);
  const { app, window: page } = await launchApp();
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Graphics' })
    .click();
  await newImage(page, 'Logo 200 × 200 px');
  await expect(page.getByRole('button', { name: /Image settings: 200 × 200 px/ })).toBeVisible();

  // A red hub of exact size and place: the hex colour typed, as the paper gives it.
  await drawEllipse(page);
  await type(page, 'X', '50');
  await type(page, 'Y', '50');
  await type(page, 'W', '100');
  await type(page, 'H', '100');
  const props = page.getByRole('complementary', { name: 'Properties' });
  const colour = props.getByRole('textbox', { name: 'Colour', exact: true }).first();
  await colour.fill('#FF0000');
  await colour.press('Tab');

  // Saved as a .mveg with its resolution.
  const saved = join(dir, 'Hungry_logo.mveg');
  await answerDialogs(app, { save: saved });
  await menu(app, 'File', 'Save');
  await expect
    .poll(async () => (await readFile(saved, 'utf8').catch(() => '')).includes('"graphic"'))
    .toBe(true);

  // PNG: 200 × 200, 96 dpi inside, red in the middle, white in the corner.
  const png = join(dir, 'Hungry_logo.png');
  await answerDialogs(app, { exportTo: png });
  await exportAs(page, /PNG/);
  const pngBytes = new Uint8Array(await readFile(png));
  expect(pngSize(pngBytes)).toEqual({ width: 200, height: 200 });
  expect(pngDpi(pngBytes)).toEqual({ x: 96, y: 96 });
  expect(await pixel(png, 100, 100, 200)).toEqual([255, 0, 0, 255]);
  expect(await pixel(png, 2, 2, 200)).toEqual([255, 255, 255, 255]);

  // JPG at 600 px wide (the other side in proportion), its dpi written in, the red still red.
  const jpg = join(dir, 'Hungry_logo.jpg');
  await answerDialogs(app, { exportTo: jpg });
  await exportAs(page, /JPG/, async (box) => {
    await box.getByLabel('Size').selectOption('width');
    await box.getByLabel('Width', { exact: true }).fill('600');
  });
  const jpgBytes = new Uint8Array(await readFile(jpg));
  expect(jpegDpi(jpgBytes)).toEqual({ x: 96, y: 96 });
  const [r, g, b] = await pixel(jpg, 300, 300, 600);
  expect(r).toBeGreaterThan(240);
  expect(g).toBeLessThan(15);
  expect(b).toBeLessThan(15);
  await app.close();
});

test('M/22 HeronV10cm: a 10 cm image exports as a 10 cm SVG and a 300 dpi PNG; Send to Animation', async () => {
  test.setTimeout(120_000);
  const { app, window: page } = await launchApp();
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Graphics' })
    .click();
  await newImage(page, '10 × 10 cm');
  await drawEllipse(page);

  const svg = join(dir, 'HeronV10cm.svg');
  await answerDialogs(app, { exportTo: svg });
  await exportAs(page, /SVG/);
  expect(await readFile(svg, 'utf8')).toMatch(/width="10cm" height="10cm" viewBox="0 0 1181 1181"/);

  const png = join(dir, 'HeronV10cm.png');
  await answerDialogs(app, { exportTo: png });
  await exportAs(page, /PNG/);
  const bytes = new Uint8Array(await readFile(png));
  expect(pngSize(bytes)).toEqual({ width: 1181, height: 1181 });
  expect(pngDpi(bytes)).toEqual({ x: 300, y: 300 });

  // GL3: the drawing goes on as editable objects in Animation mode.
  await page.getByRole('button', { name: 'Send to Animation' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Mode' }).getByRole('button', { name: 'Animation' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/One object from Untitled added/)).toBeVisible();
  await app.close();
});

test('M19: a drop shadow and a pattern drawn by the real canvas; a PDF of the image at its size', async () => {
  test.setTimeout(120_000);
  const { app, window: page } = await launchApp();
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Graphics' })
    .click();
  await newImage(page, 'Logo 200 × 200 px');
  await drawEllipse(page);
  await type(page, 'X', '50');
  await type(page, 'Y', '50');
  await type(page, 'W', '100');
  await type(page, 'H', '100');
  const props = page.getByRole('complementary', { name: 'Properties' });
  const colour = props.getByRole('textbox', { name: 'Colour', exact: true }).first();
  await colour.fill('#FF0000');
  await colour.press('Tab');

  // G14: a drop shadow (6 px across and down, soft, half black) falls below and to the right.
  await props.getByLabel('Add', { exact: true }).selectOption('dropShadow');
  await props.getByRole('button', { name: 'Add filter' }).click();
  const shadowed = join(dir, 'Shadow.png');
  await answerDialogs(app, { exportTo: shadowed });
  await exportAs(page, /PNG/);
  expect(await pixel(shadowed, 100, 100, 200)).toEqual([255, 0, 0, 255]);
  const [r = 0, g = 0, b = 0] = await pixel(shadowed, 141, 141, 200);
  expect(r).toBeLessThan(235);
  expect(Math.abs(r - g)).toBeLessThan(4);
  expect(Math.abs(g - b)).toBeLessThan(4);
  // No shadow above and to the left.
  expect(await pixel(shadowed, 58, 58, 200)).toEqual([255, 255, 255, 255]);

  // G12: a pattern fill: down the middle of the shape the (level) stripes change colour.
  await props.getByLabel('Fill', { exact: true }).selectOption('pattern');
  await props.getByLabel('Pattern', { exact: true }).selectOption('stripes');
  const striped = join(dir, 'Stripes.png');
  await answerDialogs(app, { exportTo: striped });
  await exportAs(page, /PNG/);
  const row = await Promise.all(
    [70, 76, 82, 88, 94, 100, 106, 112, 118, 124, 130].map((y) => pixel(striped, 100, y, 200)),
  );
  expect(new Set(row.map((p) => p.join(','))).size).toBeGreaterThan(1);

  // G11: PDF, the page 200 px at 96 dpi = 2.08 in = 150 pt square.
  const pdf = join(dir, 'Logo.pdf');
  await answerDialogs(app, { exportTo: pdf });
  await exportAs(page, /PDF/);
  const text = (await readFile(pdf)).toString('latin1');
  expect(text.startsWith('%PDF')).toBe(true);
  expect(text).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+150(\.\d+)?\s+150(\.\d+)?\s*\]/);
  await app.close();
});

test('M20: letter-spaced text drawn by the real canvas, then turned into its letters’ outlines from the bundled font', async () => {
  test.setTimeout(120_000);
  const { app, window: page } = await launchApp();
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Graphics' })
    .click();
  await newImage(page, 'Logo 200 × 200 px');
  await pickTool(page, 'Text');
  const stage = page.getByRole('application', { name: 'Stage' });
  const box = (await stage.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.4);
  await type(page, 'Words', 'OPEN');
  await type(page, 'Size', '48');
  await type(page, 'X', '10');
  await type(page, 'Y', '70');

  // GT1: spaced letters are written one by one in the SVG.
  await type(page, 'Letter spacing', '200');
  const spaced = join(dir, 'Spaced.svg');
  await answerDialogs(app, { exportTo: spaced });
  await exportAs(page, /SVG/);
  const svg = await readFile(spaced, 'utf8');
  expect(svg.match(/<text/g)?.length).toBe(4);

  // GT4: Convert to curves reads the font's outlines and makes each letter a path.
  const props = page.getByRole('complementary', { name: 'Properties' });
  await props.getByRole('button', { name: 'Convert to curves' }).click();
  const curves = join(dir, 'Curves.svg');
  await expect(async () => {
    await answerDialogs(app, { exportTo: curves });
    await exportAs(page, /SVG/);
    const out = await readFile(curves, 'utf8');
    expect(out).not.toMatch(/<text/);
    expect(out.match(/<path/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  }).toPass({ timeout: 20_000 });
  await app.close();
});

test('Graphics benchmark B1, G8, G10 (M23): a see-through image as a JPG on white; a stroke effect and a gradient fading out, drawn by the real canvas', async () => {
  test.setTimeout(120_000);
  // A see-through 200 × 100 image: a yellow square with a 6 px red stroke effect outside it
  // (M/21: the globe's outline), and a square whose blue fades to see-through left to right
  // (J/22: the balloon's shading).
  const base = createGraphic({
    name: 'Effects',
    size: { width: 200, height: 100, units: 'px', dpi: 96 },
    background: 'none',
  });
  const square = {
    ...createRect({ x: 20, y: 20, width: 60, height: 60 }),
    fill: { kind: 'solid' as const, colour: '#ffcc00' },
    stroke: undefined,
    filters: [
      {
        kind: 'stroke' as const,
        colour: '#ff0000',
        width: 6,
        opacity: 100,
        position: 'outside' as const,
      },
    ],
  };
  const fading = {
    ...createRect({ x: 120, y: 20, width: 60, height: 60 }),
    fill: { kind: 'linear' as const, from: '#0000ff', to: '#0000ff00', angle: 0 },
    stroke: undefined,
  };
  const doc = { ...base, layers: [{ ...base.layers[0]!, objects: [square, fading] }] };
  const file = join(dir, 'Effects.mveg');
  await writeFile(file, await writeGraphicFile(doc as never, webCompression));

  const { app, window: page } = await launchApp();
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Graphics' })
    .click();
  await answerDialogs(app, { open: [file] });
  await menu(app, 'File', 'Open Image…');
  await expect(page.getByRole('button', { name: /Image settings: 200 × 100 px/ })).toBeVisible();

  const png = join(dir, 'Effects.png');
  await answerDialogs(app, { exportTo: png });
  await exportAs(page, /PNG/);
  // G10: 3 px outside the square's left edge is the stroke, 10 px out is still see-through.
  expect(await pixel(png, 17, 50, 200)).toEqual([255, 0, 0, 255]);
  expect((await pixel(png, 10, 50, 200))[3]).toBe(0);
  expect(await pixel(png, 50, 50, 200)).toEqual([255, 204, 0, 255]);
  // G8: the blue fades out across the second square.
  const [left, middle, right] = await Promise.all(
    [122, 150, 178].map(async (x) => (await pixel(png, x, 50, 200))[3]!),
  );
  expect(left).toBeGreaterThan(230);
  expect(middle).toBeGreaterThan(100);
  expect(middle).toBeLessThan(160);
  expect(right).toBeLessThan(25);

  // B1: a JPG cannot be see-through: the see-through parts are the dialog's white, not black.
  const jpg = join(dir, 'Effects.jpg');
  await answerDialogs(app, { exportTo: jpg });
  await exportAs(page, /JPG/);
  for (const [x, y] of [
    [2, 2],
    [100, 50],
    [197, 97],
  ] as const) {
    const [r, g, b] = await pixel(jpg, x, y, 200);
    expect(Math.min(r!, g!, b!)).toBeGreaterThan(245);
  }
  await app.close();
});
