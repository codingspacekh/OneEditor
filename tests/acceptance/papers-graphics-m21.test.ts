// M21 exit gate (phase 3): the papers' bitmap tasks done in Graphics mode as a student does them,
// on the papers' own files — a photo opened as an image, cropped to its content, its white
// background selected with the magic wand and deleted, resized and exported at the width asked;
// a map recoloured with the paint bucket and put in a ring by a clipping mask; a picture cut into
// jigsaw pieces by shapes; a balloon cut out of a photo and enlarged — and the files checked.
// The PNG exports are drawn here by the pixel compositor (the app draws them on a canvas, which
// the e2e tests check). Skipped where the papers' files are not on the computer (CI).
import { describe, expect, it, vi } from 'vitest';
import { TRANSPARENT } from '../../src/core/animation/rules.ts';
import {
  contentBounds,
  cropRaster,
  maskFromAlpha,
  pixelAt,
  readRegion,
  type Bitmap,
} from '../../src/core/graphics/pixels/raster.ts';
import { clearShare, drawnImage, graphics } from './helpers/graphics-app.ts';
import { hasPapers } from './helpers/pixels.ts';

// The papers' photos are up to 12 megapixels, each step done for real: under coverage
// instrumentation (npm run check) Balloon1 alone took 3½ minutes.
vi.setConfig({ testTimeout: 600_000 });

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

// The workbook's own photos (Task3_Canal.jpeg, Task4_Stadium.jpg) are not among the papers'
// files: the papers' photos of the same kind stand in for them.
describe.skipIf(!hasPapers)('Workbook Chapter 6 Task 3.5: the resolution for emailing', () => {
  it('the photo made 640 px wide, the height in proportion, saved as a JPG', async () => {
    const s = await graphics(['2023_11_November/Castle.jpg']);
    await s.open('2023_11_November/Castle.jpg');
    const { width, height } = s.doc().stage;
    const h = Math.round((640 * height) / width);
    expect(s.g.resizeImage({ width: 640, height: h, method: 'bicubic' })).toBeNull();
    expect(s.doc().stage).toMatchObject({ width: 640, height: h });
    expect(s.pixels().bitmap).toMatchObject({ width: 640, height: h });
    await s.exportTo('/out/Chapter06_Task3_5.jpg', { format: 'jpg', quality: 80 });
    expect(s.stageRenderer.renderJpeg).toHaveBeenCalled();
    const doc = s.stageRenderer.renderJpeg.mock.calls.at(-1)![0];
    expect([doc.stage.width, doc.stage.height]).toEqual([640, h]);
  });
});

describe.skipIf(!hasPapers)('Workbook Chapter 6 Task 4: the circular club logo', () => {
  it('the stadium photo seen through a circle (a clipping mask), words round part of it, saved as SVG', async () => {
    const s = await graphics(['2023_11_November/Ocean.jpg']);
    await s.open('2023_11_November/Ocean.jpg');
    const photo = s.layer().id;
    // The circle on a vector layer below the photo; the photo clipped to it.
    s.g.addLayer();
    const circleLayer = s.layer().id;
    s.g.moveLayer(circleLayer, 0);
    s.g.addShape('ellipse', { x: 1100, y: 200, width: 1900, height: 1900 });
    expect(s.g.setLayerLook(photo, { clip: true })).toBeNull();
    const clipped = s.doc().layers.find((l) => l.id === photo)!;
    expect(clipped.clip).toBe(true);
    // The words round the top of a second circle (text on a path, shown hidden).
    s.g.addLayer();
    s.g.addShape('ellipse', { x: 1000, y: 100, width: 2100, height: 2100 });
    const arc = s.layer().objects.at(-1)!;
    s.g.addText({ x: 1200, y: 100 }, 'The Greatest Team in Football');
    const words = s.layer().objects.at(-1)!;
    s.g.select([words.id, arc.id]);
    expect(s.g.putOnPath(false)).toBeNull();
    const svg = new TextDecoder().decode(
      await s.exportTo('/out/Chapter06_Task4.svg', { format: 'svg' }),
    );
    // The photo is in the SVG as a picture, cut by the circle; the words follow the circle.
    expect(svg).toContain('data:image/png;base64,');
    expect(svg).toMatch(/<mask|clip-path/);
    // Text on a path is written letter by letter, each turned to follow the circle.
    expect((svg.match(/<text\b/g) ?? []).length).toBeGreaterThanOrEqual(
      'TheGreatestTeaminFootball'.length,
    );
  });
});

describe.skipIf(!hasPapers)('9626/04 O/N/23 Task 1: Castle, Ocean and Sky as three layers', () => {
  it('the view cut out of the castle, the ocean and the sky fitted behind it, each layer saved apart and the three combined', async () => {
    const s = await graphics(['2023_11_November/Castle.jpg', '2023_11_November/Ocean.jpg']);
    await s.open('2023_11_November/Castle.jpg');
    expect(s.doc().stage).toMatchObject({ width: 3630, height: 1155 });
    const castle = s.layer().id;
    expect(s.g.renameLayer(castle, 'CastleLayer')).toBeNull();
    // SkyLayer: a band of the castle's own sky, copied to a layer and stretched over the view.
    s.g.selectRect({ x: 930, y: 0, width: 2135, height: 260 });
    s.g.copySelectionToLayer();
    const sky = s.layer().id;
    expect(s.g.renameLayer(sky, 'SkyLayer')).toBeNull();
    expect(
      s.g.transformPixelLayer({
        reference: 'top-left',
        x: 930,
        y: 0,
        width: 2135,
        height: 760,
        keepProportions: false,
      }),
    ).toBeNull();
    expect(s.pixels()).toMatchObject({ x: 930, y: 0 });
    expect(s.pixels().bitmap).toMatchObject({ width: 2135, height: 760 });
    // CastleLayer: the view between the towers selected with the polygonal lasso and deleted.
    s.g.selectLayer(castle);
    s.g.selectLasso([
      { x: 930, y: 0 },
      { x: 3065, y: 0 },
      { x: 3065, y: 700 },
      { x: 2600, y: 1000 },
      { x: 1200, y: 1000 },
      { x: 930, y: 700 },
    ]);
    expect(s.g.deleteSelectedPixels()).toBe(true);
    s.g.deselectPixels();
    expect(pixelAt(s.pixels().bitmap, 2000, 300)[3]).toBe(0);
    expect(pixelAt(s.pixels().bitmap, 200, 300)[3]).toBe(255);
    // OceanLayer: Ocean.jpg added, turned the right way up, scaled to the view's width.
    await s.addLayer('2023_11_November/Ocean.jpg');
    const ocean = s.layer().id;
    expect(s.g.renameLayer(ocean, 'OceanLayer')).toBeNull();
    s.g.flipPixels('vertical');
    expect(
      s.g.transformPixelLayer({
        reference: 'top-left',
        x: 930,
        y: 480,
        width: 2135,
        keepProportions: true,
      }),
    ).toBeNull();
    expect(s.pixels().bitmap.width).toBe(2135);
    expect(s.pixels().bitmap.height).toBe(Math.round((2135 * 2322) / 4128));
    // In order: the sky at the back, then the ocean, the castle in front.
    s.g.moveLayer(sky, 0);
    s.g.moveLayer(ocean, 1);
    s.g.moveLayer(castle, 2);
    expect(s.doc().layers.map((l) => l.name)).toEqual(['SkyLayer', 'OceanLayer', 'CastleLayer']);
    // Each layer saved apart; then the three combined.
    s.dialogs.chooseFolder.mockResolvedValueOnce('/out');
    const files = await s.g.exportImage({ format: 'png', what: 'layers' });
    expect(files).toHaveLength(3);
    for (const name of ['SkyLayer', 'OceanLayer', 'CastleLayer'])
      expect(files!.some((f) => f.includes(name))).toBe(true);
    // CastleLayer alone: the view see-through.
    const alone = await s.png(s.bytes.get(files!.find((f) => f.includes('CastleLayer'))!)!);
    expect(alone.data[(300 * 3630 + 2000) * 4 + 3]).toBe(0);
    const combined = await s.png(
      await s.exportTo('/out/3LayerImage_ZZ999_9999.png', { format: 'png' }),
    );
    expect([combined.width, combined.height]).toEqual([3630, 1155]);
    const alpha = (x: number, y: number) => combined.data[(y * 3630 + x) * 4 + 3];
    // The hole shows the sky above and the ocean below; nothing is left see-through.
    expect(alpha(2000, 150)).toBe(255);
    expect(alpha(2000, 900)).toBe(255);
    expect(clearShare(combined)).toBe(0);
  });
});

describe.skipIf(!hasPapers)(
  'Workbook Chapter 6 Task 3.4: edited images as layers on the canal',
  () => {
    it('two pictures added as layers, placed, turned and made partly see-through', async () => {
      const s = await graphics([
        '2023_11_November/Castle.jpg',
        '2019_11_November/Pearl.jpg',
        '2021_03_March/WorldMap.png',
      ]);
      await s.open('2023_11_November/Castle.jpg');
      await s.addLayer('2019_11_November/Pearl.jpg');
      const pearl = s.layer().id;
      expect(
        s.g.transformPixelLayer({ reference: 'top-left', x: 200, y: 150, rotate: -12 }),
      ).toBeNull();
      expect(s.g.setLayerLook(pearl, { opacity: 0.7 })).toBeNull();
      await s.addLayer('2021_03_March/WorldMap.png');
      const map = s.layer().id;
      s.g.rotatePixels(20);
      expect(s.g.setLayerLook(map, { opacity: 0.5 })).toBeNull();
      const layers = s.doc().layers;
      expect(layers.map((l) => l.opacity ?? 1)).toEqual([1, 0.7, 0.5]);
      // Turned: each picture's box is larger than the picture, its corners see-through.
      const turned = layers[2]!.pixels!.bitmap;
      expect(turned.width).toBeGreaterThan(832);
      expect(pixelAt(turned, 0, 0)[3]).toBe(0);
      const placed = layers[1]!.pixels!;
      expect(placed.bitmap.width).toBeGreaterThan(300);
      const file = await s.png(await s.exportTo('/out/Chapter06_Task3_4.png', { format: 'png' }));
      expect([file.width, file.height]).toEqual([3630, 1155]);
    });
  },
);
