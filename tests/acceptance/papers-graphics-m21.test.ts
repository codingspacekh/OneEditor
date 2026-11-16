// M21 exit gate (phase 3): the papers' bitmap tasks done in Graphics mode as a student does them,
// on the papers' own files — a photo opened as an image, cropped to its content, its white
// background selected with the magic wand and deleted, resized and exported at the width asked;
// a map recoloured with the paint bucket and put in a ring by a clipping mask; a picture cut into
// jigsaw pieces by shapes; a balloon cut out of a photo and enlarged — and the files checked.
// The PNG exports are drawn here by the pixel compositor (the app draws them on a canvas, which
// the e2e tests check). Skipped where the papers' files are not on the computer (CI).
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { TRANSPARENT } from '../../src/core/animation/rules.ts';
import type { AnimationDoc, PixelContent } from '../../src/core/animation/types.ts';
import { compositeLayers, drawnPixelLayers } from '../../src/core/graphics/pixels/merge.ts';
import {
  contentBounds,
  cropRaster,
  maskFromAlpha,
  pixelAt,
  readRegion,
  type Bitmap,
} from '../../src/core/graphics/pixels/raster.ts';
import { resampleBitmap } from '../../src/core/graphics/pixels/resample.ts';
import { webCompression } from '../../src/core/image/deflate.ts';
import { decodePng, encodePng } from '../../src/core/image/png.ts';
import { IMAGE, testApp } from '../helpers/test-app.ts';
import { hasPapers, loadBitmap, paperFile } from './helpers/pixels.ts';

/** The image as the PNG export draws its pixel layers (at its size or scaled to `size`). */
function drawnImage(doc: AnimationDoc, size?: { width: number; height: number }): Bitmap {
  const { width, height } = doc.stage;
  const whole = compositeLayers(drawnPixelLayers(doc), { x: 0, y: 0, width, height });
  return size && (size.width !== width || size.height !== height)
    ? resampleBitmap(whole, size.width, size.height, 'bicubic')
    : whole;
}

async function graphics(files: string[]) {
  const t = testApp(Object.fromEntries(files.map((f) => [paperFile(f), IMAGE])));
  await t.app.candidate.set({ centre: 'ZZ999', number: '9999', name: 'Ann' });
  const g = t.app.graphics;
  // The app reads a picture's file for its resolution.
  for (const f of files) t.bytes.set(paperFile(f), new Uint8Array(await readFile(paperFile(f))));
  // The page decodes pictures on a canvas; here the papers' files are read by helpers/pixels.ts.
  t.stageRenderer.pixels.mockImplementation(async (path) => {
    const { bitmap } = await loadBitmap(path);
    return { width: bitmap.width, height: bitmap.height, data: readRegion(bitmap) };
  });
  t.stageRenderer.renderPng.mockImplementation(async (doc, _frame, size) => {
    const b = drawnImage(doc, size);
    return encodePng(
      { width: b.width, height: b.height, channels: 4, data: readRegion(b) },
      webCompression,
    );
  });
  const doc = () => g.store.get().history.present;
  const layer = () => doc().layers.find((l) => l.id === g.store.get().layerId)!;
  const pixels = (): PixelContent => layer().pixels!;
  async function open(file: string) {
    t.dialogs.openPicture.mockResolvedValueOnce(paperFile(file));
    expect(await g.openPictureAsImage()).toBe(true);
  }
  async function addLayer(file: string) {
    t.dialogs.openPicture.mockResolvedValueOnce(paperFile(file));
    await g.addPictureAsLayer();
  }
  async function exportTo(path: string, options: Parameters<typeof g.exportImage>[0]) {
    t.dialogs.exportGraphic.mockResolvedValueOnce(path);
    const written = await g.exportImage(options);
    expect(g.store.get().message?.kind).not.toBe('error');
    expect(written).toContain(path);
    return t.bytes.get(path) ?? new TextEncoder().encode(t.disk.get(path) ?? '');
  }
  const png = async (bytes: Uint8Array) => decodePng(bytes, webCompression);
  return { ...t, g, doc, layer, pixels, open, addLayer, exportTo, png };
}

/** The share of a bitmap's pixels that are wholly transparent. */
function clearShare(b: { width: number; height: number; data: Uint8ClampedArray }): number {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) if (b.data[i] === 0) n++;
  return n / (b.width * b.height);
}

describe.skipIf(!hasPapers)('9626/04 O/N/19 Task 2: the pearl', () => {
  it('cropped to exclude the white, its background transparent, saved as a PNG 210 px wide', async () => {
    const s = await graphics(['2019_11_November/Pearl.jpg']);
    await s.open('2019_11_November/Pearl.jpg');
    expect(s.doc().stage).toMatchObject({ width: 300, height: 300 });
    // Image ▸ Trim Plain Edges: the white border goes.
    expect(s.g.trimCanvas(true)).toBe(true);
    const { width, height } = s.doc().stage;
    expect(width).toBeLessThan(300);
    expect(height).toBeLessThan(300);
    // The white left round the pearl: the magic wand (not contiguous: between the parts too).
    s.g.selectByWand({ x: 0, y: 0 }, { tolerance: 12, contiguous: false });
    expect(s.g.hasPixelSelection()).toBe(true);
    expect(s.g.deleteSelectedPixels()).toBe(true);
    s.g.deselectPixels();
    const p = s.pixels();
    expect(pixelAt(p.bitmap, 0, 0)[3]).toBe(0);
    expect(pixelAt(p.bitmap, Math.floor(width / 2), Math.floor(height / 2))[3]).toBe(255);
    // Image ▸ Image Size…: 210 px wide, the height in proportion.
    const h = Math.round((210 * height) / width);
    expect(s.g.resizeImage({ width: 210, height: h, method: 'bicubic' })).toBeNull();
    const file = await s.png(await s.exportTo('/out/Pearl_ZZ999_9999.png', { format: 'png' }));
    expect([file.width, file.height]).toEqual([210, h]);
    expect(file.data[3]).toBe(0);
    expect(clearShare(file)).toBeGreaterThan(0.05);
    expect(clearShare(file)).toBeLessThan(0.6);
  });
});

describe.skipIf(!hasPapers)('9626/04 M/21 Task 1: the world map and the Global logo', () => {
  it('land green, sea and lakes light blue; in a ring with a red gradient and black text; SVG and a 500 px high PNG', async () => {
    const s = await graphics(['2021_03_March/WorldMap.png']);
    await s.open('2021_03_March/WorldMap.png');
    const before = s.pixels().bitmap;
    // The land is grey; the sea and lakes are see-through. The paint bucket, not contiguous,
    // recolours every pixel like the one clicked.
    const land = { x: 416, y: 199 };
    expect(pixelAt(before, land.x, land.y)).toEqual([200, 200, 200, 255]);
    s.g.setTool('bucket');
    s.g.setBucket({ tolerance: 40, contiguous: false });
    s.g.setPaintColours({ foreground: '#2e9d3a' });
    expect(await s.g.fillAt(land)).toBe(true);
    s.g.setPaintColours({ foreground: '#9fd8f5' });
    expect(await s.g.fillAt({ x: 0, y: 0 })).toBe(true);
    const map = s.pixels().bitmap;
    expect(pixelAt(map, land.x, land.y)).toEqual([0x2e, 0x9d, 0x3a, 255]);
    expect(pixelAt(map, 0, 0)).toEqual([0x9f, 0xd8, 0xf5, 255]);
    // No grey and no see-through pixel is left.
    const data = readRegion(map);
    let grey = 0;
    let clear = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) clear++;
      if (data[i] === data[i + 1] && data[i + 1] === data[i + 2] && data[i]! > 150) grey++;
    }
    expect(clear).toBe(0);
    expect(grey / (data.length / 4)).toBeLessThan(0.01);
    const colour = await s.png(
      await s.exportTo('/out/WorldMap_Colour_ZZ999_9999.png', { format: 'png' }),
    );
    expect([colour.width, colour.height]).toEqual([832, 398]);

    // The logo: the map seen only inside a circle (a clipping mask), a ring round it with a
    // left-to-right light-to-dark red gradient, the words in a black sans-serif font.
    const mapLayer = s.layer().id;
    s.g.addLayer();
    s.g.moveLayer(s.layer().id, 0);
    s.g.addShape('ellipse', { x: 217, y: 0, width: 398, height: 398 });
    s.g.selectLayer(mapLayer);
    expect(s.g.setLayerLook(mapLayer, { clip: true })).toBeNull();
    // The ring: a circle cut out of a larger one, filled with the gradient.
    s.g.addLayer();
    const ringLayer = s.layer().id;
    s.g.addShape('ellipse', { x: 197, y: -20, width: 438, height: 438 });
    s.g.addShape('ellipse', { x: 217, y: 0, width: 398, height: 398 });
    s.g.select(
      s
        .doc()
        .layers.find((l) => l.id === ringLayer)!
        .objects.map((o) => o.id),
    );
    expect(s.g.combine('cutOut')).toBeNull();
    expect(
      s.g.setProperties({
        fill: { kind: 'linear', from: '#ff9999', to: '#8b0000', angle: 0 },
      }),
    ).toBeNull();
    s.g.addText({ x: 300, y: 180 }, 'Tawara Global');
    expect(
      s.g.setProperties({ font: 'Inter', fill: { kind: 'solid', colour: '#000000' } }),
    ).toBeNull();
    const svg = new TextDecoder().decode(
      await s.exportTo('/out/GlobalLogo_ZZ999_9999.svg', { format: 'svg' }),
    );
    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/png;base64,');
    expect(svg).toMatch(/<mask|clip-path/);
    expect(svg).toContain('Tawara Global');
    await s.exportTo('/out/GlobalLogo_ZZ999_9999.png', {
      format: 'png',
      size: { by: 'height', px: 500 },
    });
    const [, , size] = s.stageRenderer.renderPng.mock.calls.at(-1)!;
    expect(size).toEqual({ width: Math.round((500 * 832) / 398), height: 500 });
    expect(s.doc().stage.background).toBe(TRANSPARENT);
  });
});

describe.skipIf(!hasPapers)('9626/04 M/25 Task 2(b): Tier.png cut by the jigsaw template', () => {
  it('four pieces from 80 mm squares with tabs, each a PNG, that fit back together exactly', async () => {
    const s = await graphics(['2025_03_March/Tier.png']);
    await s.open('2025_03_March/Tier.png');
    const photo = s.layer().id;
    const tier = s.pixels().bitmap;
    expect(s.doc().stage).toMatchObject({ width: 1200, height: 1200 });
    // At the file's 190 dpi a 600 px square is 80 mm (Task 2(a)'s template).
    const mm = (600 / s.doc().graphic!.dpi) * 25.4;
    expect(mm).toBeGreaterThan(79);
    expect(mm).toBeLessThan(81.5);
    // The template on a vector layer: each piece a square with tabs added and sockets cut.
    s.g.addLayer();
    const shapes = s.layer().id;
    const square = (x: number, y: number) =>
      s.g.addShape('rect', { x, y, width: 600, height: 600 });
    const tab = (cx: number, cy: number) =>
      s.g.addShape('ellipse', { x: cx - 80, y: cy - 80, width: 160, height: 160 });
    const ids = () =>
      s
        .doc()
        .layers.find((l) => l.id === shapes)!
        .objects.map((o) => o.id);
    const piece = (
      x: number,
      y: number,
      tabs: [number, number][],
      sockets: [number, number][],
    ): string => {
      const start = ids().length;
      square(x, y);
      for (const [cx, cy] of tabs) tab(cx, cy);
      if (tabs.length) {
        s.g.select(ids().slice(start));
        expect(s.g.combine('union')).toBeNull();
      }
      for (const [cx, cy] of sockets) {
        const base = ids().at(-1)!;
        tab(cx, cy);
        s.g.select([base, ids().at(-1)!]);
        expect(s.g.combine('cutOut')).toBeNull();
      }
      return ids().at(-1)!;
    };
    const pieces = [
      piece(0, 0, [[600, 300]], [[300, 600]]),
      piece(600, 0, [[900, 600]], [[600, 300]]),
      piece(
        600,
        600,
        [],
        [
          [900, 600],
          [600, 900],
        ],
      ),
      piece(
        0,
        600,
        [
          [300, 600],
          [600, 900],
        ],
        [],
      ),
    ];
    // Each piece: select it, select the photo's pixels inside it, copy them to a layer, save.
    const cut: Bitmap[] = [];
    const pieceLayers: string[] = [];
    for (const [i, id] of pieces.entries()) {
      s.g.selectLayer(shapes);
      s.g.select([id]);
      expect(s.g.selectFromObjects({ antiAlias: false })).toBeNull();
      s.g.selectLayer(photo);
      s.g.copySelectionToLayer();
      // Layer via Copy keeps only the selected pixels' box, placed where it was: put back on
      // the whole image to compare.
      const { bitmap, x, y } = s.pixels();
      cut.push(cropRaster(bitmap, { x: -x, y: -y, width: 1200, height: 1200 }));
      const bytes = await s.exportTo(`/out/TierPiece${i + 1}.png`, { format: 'png' });
      expect((await s.png(bytes)).width).toBe(1200);
      pieceLayers.push(s.layer().id);
      s.g.toggleLayer(s.layer().id, 'visible');
    }
    // They fit together: no pixel in two pieces, and together they are the whole picture.
    const original = readRegion(tier);
    const parts = cut.map((b) => readRegion(maskFromAlpha(b)));
    const whole = readRegion(tier);
    let overlap = 0;
    let missing = 0;
    for (let p = 0; p < 1200 * 1200; p++) {
      const covered = parts.filter((m) => m[p]! > 0).length;
      if (covered > 1) overlap++;
      if (original[p * 4 + 3]! > 0 && covered === 0) missing++;
    }
    expect(overlap).toBe(0);
    expect(missing).toBe(0);
    // The tabs: piece 1 reaches past x 600 at y 300 and is cut in at (300, 600).
    expect(pixelAt(cut[0]!, 640, 300)[3]).toBeGreaterThan(0);
    expect(pixelAt(cut[0]!, 300, 560)[3]).toBe(0);
    // 4Pngs: the four put back together are the picture again.
    for (const id of pieceLayers) s.g.toggleLayer(id, 'visible');
    s.g.toggleLayer(photo, 'visible');
    s.g.toggleLayer(shapes, 'visible');
    const together = readRegion(drawnImage(s.doc()));
    let differ = 0;
    for (let i = 0; i < whole.length; i++) if (Math.abs(together[i]! - whole[i]!) > 1) differ++;
    expect(differ).toBe(0);
  });
});

describe.skipIf(!hasPapers)('9626/04 J/22 Task 1: Balloon1', () => {
  it('only the balloon, 3000 × 2250 px, on a transparent background', async () => {
    const s = await graphics(['2022_06_June/Scene1.png']);
    await s.open('2022_06_June/Scene1.png');
    expect(s.doc().stage).toMatchObject({ width: 3264, height: 2448 });
    // A 4:3 box round the balloon, copied to its own layer; the canvas cropped to it.
    s.g.selectRect({ x: 1206, y: 588, width: 787, height: 590 });
    s.g.copySelectionToLayer();
    const balloon = s.layer().id;
    s.g.selectRect({ x: 1206, y: 588, width: 787, height: 590 });
    s.g.cropToPixelSelection();
    expect(s.doc().stage).toMatchObject({ width: 787, height: 590 });
    // The sky round it: the magic wand from each corner, deleted.
    for (const at of [
      { x: 2, y: 2 },
      { x: 784, y: 2 },
      { x: 2, y: 587 },
      { x: 784, y: 587 },
    ])
      s.g.selectByWand(at, { tolerance: 24, contiguous: true, mode: 'add' });
    expect(s.g.deleteSelectedPixels()).toBe(true);
    s.g.deselectPixels();
    // The photo underneath is hidden: only the balloon is saved.
    for (const l of s.doc().layers) if (l.id !== balloon) s.g.toggleLayer(l.id, 'visible');
    expect(s.g.resizeImage({ width: 3000, height: 2250, method: 'bicubic' })).toBeNull();
    const file = await s.png(await s.exportTo('/out/Balloon1_ZZ999_9999.png', { format: 'png' }));
    expect([file.width, file.height]).toEqual([3000, 2250]);
    expect(file.data[3]).toBe(0);
    const centre = (1125 * 3000 + 1500) * 4;
    expect(file.data[centre + 3]).toBe(255);
    const share = clearShare(file);
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.8);
    const kept = contentBounds(s.pixels().bitmap)!;
    expect(kept.width).toBeGreaterThan(1200);
  });
});
