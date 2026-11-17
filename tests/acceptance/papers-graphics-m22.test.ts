// M22 exit gate (phase 3): the papers' retouching tasks done in Graphics mode as a student does
// them, on the papers' own photos — the rubbish and a bin, a balloon, posts and wires, a figure
// removed with the heal brush and the clone stamp; a photo made greyscale, its sky removed and
// replaced by a gradient or another photo; a blue layer at 40 %; the Moon cut out, recoloured,
// given a halo; stars and lights painted; a reflection screened in; a lens's bulge and blooms;
// the workbook's swirl, brighter colours, levels, red eye, a colour kept in a greyscale photo and
// a metallic plaque. Workbook Task 8 (the sky replaced) is J/22 Scene4. The workbook's own photos
// are not among the papers' files: the papers' photos stand in. Skipped without the papers (CI).
import { describe, expect, it, vi } from 'vitest';
import type { Point } from '../../src/core/animation/geometry.ts';
import type { ObjectFilter } from '../../src/core/animation/types.ts';
import { newFilter } from '../../src/core/animation/appearance.ts';
import { BUILT_IN_PRESETS } from '../../src/core/graphics/pixels/presets.ts';
import {
  pixelAt,
  readRegion,
  type Bitmap,
  type Rect,
} from '../../src/core/graphics/pixels/raster.ts';
import { defaultSettings } from '../../src/core/graphics/pixels/adjust.ts';
import { drawnImage, graphics } from './helpers/graphics-app.ts';
import { hasPapers } from './helpers/pixels.ts';

vi.setConfig({ testTimeout: 600_000 });

type App = Awaited<ReturnType<typeof graphics>>;

/** G14: an outer glow (a halo, a light bloom). */
const glow = (colour: string, blur: number, opacity = 90): ObjectFilter => ({
  kind: 'glow',
  colour,
  blur,
  opacity,
});

/** The mean colour of a region of a bitmap. */
function mean(b: Bitmap, r: Rect): [number, number, number] {
  const data = readRegion(b, r);
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
    n++;
  }
  return sum.map((v) => v / Math.max(1, n)) as [number, number, number];
}

const near = (a: number[], b: number[], within: number) =>
  a.every((v, i) => Math.abs(v - b[i]!) <= within);

/** Back and forth across a rectangle, a brush's width apart (as a student scrubs over it). */
function zigzag([x, y, w, h]: [number, number, number, number], size: number): Point[] {
  const out: Point[] = [];
  for (let row = 0, yy = y; yy <= y + h; row++, yy += size / 2)
    out.push(
      ...(row % 2 === 0
        ? [
            { x, y: yy },
            { x: x + w, y: yy },
          ]
        : [
            { x: x + w, y: yy },
            { x, y: yy },
          ]),
    );
  return out;
}

/** A clone or heal stroke: Alt-click the source `offset` away, then paint along `points`. */
function retouch(
  s: App,
  tool: 'clone' | 'heal',
  points: Point[],
  offset: { dx: number; dy: number },
  size: number,
) {
  s.g.setTool(tool);
  expect(s.g.setRetouchBrush({ size, hardness: 50 }, tool)).toBeNull();
  s.g.setCloneSource({ x: points[0]!.x + offset.dx, y: points[0]!.y + offset.dy });
  const stroke = s.g.startRetouch(points[0]!)!;
  expect(stroke).not.toBeNull();
  for (const p of points.slice(1)) stroke.to(p);
  expect(stroke.finish()).toBe(true);
}

/** A paintbrush stroke (or a dab) in the colour given. */
function paint(s: App, colour: string, points: Point[]) {
  s.g.setTool('paintbrush');
  s.g.setPaintColours({ foreground: colour });
  const stroke = s.g.startStroke(points[0]!)!;
  for (const p of points.slice(1)) stroke.to(p);
  stroke.finish();
}

describe.skipIf(!hasPapers)('9626/04 O/N/19 Task 1: HarbourScene', () => {
  it('the rubbish and the bin removed a surface at a time: the sea, the kerb, the ground', async () => {
    const s = await graphics(['2019_11_November/Harbour.jpg']);
    await s.open('2019_11_November/Harbour.jpg');
    const before = s.pixels().bitmap;
    expect(before).toMatchObject({ width: 1000, height: 1200 });
    // The sea behind the bin: selected, healed from the sea to the left.
    s.g.selectRect({ x: 851, y: 708, width: 149, height: 214 });
    retouch(s, 'heal', zigzag([840, 728, 170, 200], 60), { dx: -330, dy: 0 }, 60);
    // The kerb: cloned (a hard edge heal would soften).
    s.g.selectRect({ x: 848, y: 920, width: 152, height: 30 });
    retouch(s, 'clone', zigzag([840, 925, 170, 22], 30), { dx: -330, dy: 0 }, 30);
    // The ground: healed.
    s.g.selectRect({ x: 846, y: 948, width: 154, height: 75 });
    retouch(s, 'heal', zigzag([840, 955, 170, 50], 50), { dx: -330, dy: 0 }, 50);
    s.g.deselectPixels();
    expect(
      s.g.store
        .get()
        .history.past.slice(-3)
        .map((e) => e.label),
    ).toEqual([
      expect.stringMatching(/Heal/i),
      expect.stringMatching(/Clone/i),
      expect.stringMatching(/Heal/i),
    ]);
    const after = s.pixels().bitmap;
    // Where the cardboard was is now sea like the sea beside the lamp post, and ground like the
    // ground: brown is gone.
    const sea = mean(after, { x: 880, y: 760, width: 100, height: 120 });
    expect(near(sea, mean(after, { x: 480, y: 760, width: 100, height: 120 }), 25)).toBe(true);
    expect(near(sea, mean(before, { x: 880, y: 760, width: 100, height: 120 }), 25)).toBe(false);
    const ground = mean(after, { x: 880, y: 965, width: 100, height: 30 });
    expect(near(ground, mean(after, { x: 480, y: 965, width: 100, height: 30 }), 25)).toBe(true);
    const file = await s.png(
      await s.exportTo('/out/HarbourScene_ZZ999_9999.png', { format: 'png' }),
    );
    expect([file.width, file.height]).toEqual([1000, 1200]);
  });
});

describe.skipIf(!hasPapers)('9626/04 J/22 Task 1: Scene2, Scene3, Scene4', () => {
  it('the sky repaired without the balloon; the post and wires gone, not cropped; the sky from Sunset.jpg', async () => {
    const s = await graphics(['2022_06_June/Scene1.png', '2022_06_June/Sunset.jpg']);
    await s.open('2022_06_June/Scene1.png');
    const scene = s.layer().id;
    // Scene2: the balloon healed over from the sky to its left.
    retouch(s, 'heal', zigzag([1370, 600, 470, 600], 120), { dx: -800, dy: 0 }, 120);
    let b = s.pixels().bitmap;
    const where = mean(b, { x: 1420, y: 650, width: 380, height: 500 });
    expect(near(where, mean(b, { x: 620, y: 650, width: 380, height: 500 }), 10)).toBe(true);
    await s.exportTo('/out/Scene2_ZZ999_9999.png', { format: 'png' });
    // Scene3: the post cloned over from beside it, then the wires along their length.
    retouch(
      s,
      'clone',
      [
        { x: 1287, y: 1795 },
        { x: 1287, y: 2160 },
      ],
      { dx: 90, dy: 0 },
      64,
    );
    retouch(
      s,
      'clone',
      [
        { x: 1100, y: 1846 },
        { x: 1500, y: 1848 },
      ],
      { dx: 0, dy: -34 },
      20,
    );
    retouch(
      s,
      'clone',
      [
        { x: 1100, y: 1866 },
        { x: 1500, y: 1868 },
      ],
      { dx: 0, dy: 40 },
      18,
    );
    b = s.pixels().bitmap;
    const post = mean(b, { x: 1280, y: 1820, width: 14, height: 300 });
    expect(near(post, mean(b, { x: 1370, y: 1820, width: 14, height: 300 }), 30)).toBe(true);
    const scene3 = await s.png(await s.exportTo('/out/Scene3_ZZ999_9999.png', { format: 'png' }));
    expect([scene3.width, scene3.height]).toEqual([3264, 2448]);
    // Scene4: the sky selected with the magic wand and deleted; Sunset.jpg underneath, filling the width.
    // The sky lightens towards the trees: clicked high, in the middle and low, added together.
    s.g.selectByWand({ x: 1600, y: 300 }, { tolerance: 24, contiguous: true });
    for (const y of [800, 1200, 1450])
      s.g.selectByWand({ x: 1600, y }, { tolerance: 24, contiguous: true, mode: 'add' });
    expect(s.g.deleteSelectedPixels()).toBe(true);
    s.g.deselectPixels();
    for (const y of [300, 900, 1400]) expect(pixelAt(s.pixels().bitmap, 1600, y)[3]).toBe(0);
    await s.addLayer('2022_06_June/Sunset.jpg');
    const sunset = s.layer().id;
    expect(
      s.g.transformPixelLayer({
        reference: 'top-left',
        x: 0,
        y: 0,
        width: 3264,
        keepProportions: true,
      }),
    ).toBeNull();
    await s.g.pixelWork();
    s.g.moveLayer(sunset, 0);
    expect(s.doc().layers.map((l) => l.id)).toEqual([sunset, scene]);
    const shown = drawnImage(s.doc());
    expect(pixelAt(shown, 1600, 300)[3]).toBe(255);
    // The trees in front are as they were in Scene3.
    const tree = pixelAt(shown, 1600, 2300);
    const at = (2300 * 3264 + 1600) * 4;
    expect(near(tree.slice(0, 3), [...scene3.data.subarray(at, at + 3)], 2)).toBe(true);
    await s.exportTo('/out/Scene4_ZZ999_9999.png', { format: 'png' });
  });
});

describe.skipIf(!hasPapers)('9626/04 O/N/24 Task 2: NightScene in 8 steps', () => {
  it('figure removed, greyscale, a gradient sky, a 40 % blue layer, the Moon with a halo, stars and lights, the reflection', async () => {
    const s = await graphics([
      '2024_11_November/Bay.jpg',
      '2024_11_November/Moon.jpg',
      '2024_11_November/Moonlight.png',
    ]);
    await s.open('2024_11_November/Bay.jpg');
    const bay = s.layer().id;
    expect(s.doc().stage).toMatchObject({ width: 1600, height: 1200 });
    // Step 1: the figure healed over with the sea beside it.
    retouch(s, 'heal', zigzag([700, 600, 90, 180], 50), { dx: -260, dy: 0 }, 50);
    // Step 2: greyscale, and the sky selected and deleted.
    expect(await s.g.adjust('greyscale', defaultSettings('greyscale'))).toBe(true);
    const grey = pixelAt(s.pixels().bitmap, 800, 900);
    expect(grey[0]).toBe(grey[1]);
    expect(grey[1]).toBe(grey[2]);
    // The sky, and its pockets: inside the boat's rigging and in the top corners.
    s.g.selectByWand({ x: 800, y: 60 }, { tolerance: 40, contiguous: true });
    // The darker corners join the sea at a high tolerance: a low one there.
    for (const [at, tolerance] of [
      [{ x: 1265, y: 370 }, 40],
      [{ x: 3, y: 3 }, 15],
      [{ x: 1596, y: 3 }, 15],
    ] as const)
      s.g.selectByWand(at, { tolerance, contiguous: true, mode: 'add' });
    expect(s.g.deleteSelectedPixels()).toBe(true);
    s.g.deselectPixels();
    for (const [x, y] of [
      [800, 60],
      [1265, 370],
      [3, 3],
      [1596, 3],
    ])
      expect(pixelAt(s.pixels().bitmap, x!, y!)[3]).toBe(0);
    expect(pixelAt(s.pixels().bitmap, 800, 900)[3]).toBe(255);
    // Step 3: a new pixel layer at the back, a black-to-blue gradient down to the horizon.
    s.g.addPixelLayer();
    const sky = s.layer().id;
    s.g.moveLayer(sky, 0);
    s.g.setPaintColours({ foreground: '#000000', background: '#1a3a9a' });
    expect(await s.g.gradientFill({ x: 800, y: 0 }, { x: 800, y: 485 })).toBe(true);
    // Step 4: a blue layer over the sea and sand at 40 %.
    s.g.selectLayer(bay);
    s.g.addPixelLayer();
    const blue = s.layer().id;
    // Below the horizon, where the photo still has pixels (the sky is gone): its layer pixels.
    s.g.selectLayer(bay);
    s.g.selectLayerPixels();
    s.g.selectRect(
      { x: 0, y: 485, width: 1600, height: 715 },
      { mode: 'intersect', antiAlias: false },
    );
    s.g.selectLayer(blue);
    s.g.setTool('bucket');
    s.g.setBucket({ tolerance: 0, contiguous: false });
    s.g.setPaintColours({ foreground: '#2050ff' });
    expect(await s.g.fillAt({ x: 800, y: 900 })).toBe(true);
    s.g.deselectPixels();
    expect(s.g.setLayerLook(blue, { opacity: 0.4 })).toBeNull();
    // Step 5: the Moon cut out of its black, recoloured, made smaller and placed.
    await s.addLayer('2024_11_November/Moon.jpg');
    const moon = s.layer().id;
    const top = s.pixels().y;
    s.g.selectByWand({ x: 5, y: top + 5 }, { tolerance: 40, contiguous: true });
    expect(s.g.deleteSelectedPixels()).toBe(true);
    s.g.deselectPixels();
    expect(
      await s.g.adjust('hueSaturation', {
        hue: 210,
        saturation: 20,
        lightness: 15,
        colourise: true,
      }),
    ).toBe(true);
    expect(
      s.g.transformPixelLayer({
        reference: 'top-left',
        x: 1050,
        y: 20,
        width: 480,
        keepProportions: true,
      }),
    ).toBeNull();
    await s.g.pixelWork();
    // Step 6: a halo round it (a glow on the Moon's layer).
    expect(s.g.setLayerEffects(moon, [glow('#dfe8ff', 40)])).toBeNull();
    // Step 7: stars in the sky, lights on the headland and on the boat, on a layer of their own.
    s.g.addPixelLayer();
    const lights = s.layer().id;
    s.g.applyBrushPreset(BUILT_IN_PRESETS.find((p) => p.name.startsWith('Scatter'))!);
    paint(s, '#ffffff', [
      { x: 60, y: 40 },
      { x: 980, y: 160 },
    ]);
    s.g.applyBrushPreset(BUILT_IN_PRESETS.find((p) => p.name === 'Soft round')!);
    s.g.setBrush({ size: 10 });
    paint(s, '#ffe9a0', [{ x: 120, y: 470 }]);
    paint(s, '#ffe9a0', [{ x: 1300, y: 460 }]);
    // Step 8: the Moon's reflection screened onto the sea (its black drops out).
    await s.addLayer('2024_11_November/Moonlight.png');
    const reflection = s.layer().id;
    expect(s.g.setLayerLook(reflection, { blend: 'screen' })).toBeNull();
    expect(
      s.g.transformPixelLayer({
        reference: 'top',
        x: 1290,
        y: 485,
        width: 420,
        keepProportions: true,
      }),
    ).toBeNull();
    await s.g.pixelWork();

    const names = s.doc().layers.map((l) => l.id);
    expect(names).toEqual([sky, bay, blue, moon, lights, reflection]);
    const night = drawnImage(s.doc());
    // A dark sky; a blue-tinted sea; the Moon bright; the reflection on the sea.
    const sky1 = pixelAt(night, 400, 20);
    expect(sky1[0] + sky1[1] + sky1[2]).toBeLessThan(60);
    const sea = mean(night, { x: 200, y: 800, width: 300, height: 200 });
    expect(sea[2]).toBeGreaterThan(sea[0] + 30);
    const moonPixels = s.doc().layers.find((l) => l.id === moon)!.pixels!;
    const centre = {
      x: moonPixels.x + moonPixels.bitmap.width / 2,
      y: moonPixels.y + moonPixels.bitmap.height / 2,
    };
    const bright = pixelAt(night, Math.round(centre.x), Math.round(centre.y));
    expect(bright[0] + bright[1] + bright[2]).toBeGreaterThan(400);
    expect(bright[2]).toBeGreaterThanOrEqual(bright[0]);
    expect(
      s
        .doc()
        .layers.find((l) => l.id === lights)!
        .pixels!.bitmap.tiles.some(Boolean),
    ).toBe(true);
    const file = await s.png(await s.exportTo('/out/NightScene_ZZ999_9999.png', { format: 'png' }));
    expect([file.width, file.height]).toEqual([1600, 1200]);
  });
});

describe.skipIf(!hasPapers)('9626/04 O/N/21 Task 1: Lens', () => {
  it('a magnified circle, red sans-serif text, transparent light blooms; 500 px high', async () => {
    const s = await graphics(['2021_11_November/Background1.png']);
    await s.open('2021_11_November/Background1.png');
    expect(s.doc().stage).toMatchObject({ width: 500, height: 400 });
    const before = s.pixels().bitmap;
    expect(
      await s.g.applyFilter({ kind: 'bulge', centre: { x: 250, y: 200 }, radius: 130, amount: 60 }),
    ).toBe(true);
    const after = s.pixels().bitmap;
    // Inside the circle the picture is magnified (changed); outside it is as it was.
    let changed = 0;
    const [a, b] = [
      readRegion(after, { x: 150, y: 100, width: 200, height: 200 }),
      readRegion(before, { x: 150, y: 100, width: 200, height: 200 }),
    ];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
    expect(changed).toBeGreaterThan(1000);
    expect(pixelAt(after, 10, 10)).toEqual(pixelAt(before, 10, 10));
    // The text, red, sans-serif.
    s.g.addLayer();
    s.g.addText({ x: 150, y: 330 }, 'Item counter');
    expect(
      s.g.setProperties({ font: 'Inter', size: 40, fill: { kind: 'solid', colour: '#ff0000' } }),
    ).toBeNull();
    // Light blooms: soft white dabs on a pixel layer, partly see-through, glowing.
    s.g.addPixelLayer();
    const blooms = s.layer().id;
    s.g.applyBrushPreset(BUILT_IN_PRESETS.find((p) => p.name === 'Soft round')!);
    s.g.setBrush({ size: 40 });
    for (const at of [
      { x: 190, y: 140 },
      { x: 320, y: 170 },
      { x: 280, y: 270 },
    ])
      paint(s, '#ffffff', [at]);
    expect(s.g.setLayerLook(blooms, { opacity: 0.6 })).toBeNull();
    expect(s.g.setLayerEffects(blooms, [glow('#ffffff', 18, 70)])).toBeNull();
    // The whole image 500 px high.
    expect(s.g.resizeImage({ width: 625, height: 500, method: 'bicubic' })).toBeNull();
    await s.g.pixelWork();
    const file = await s.png(await s.exportTo('/out/Lens_ZZ999_9999.png', { format: 'png' }));
    expect(file.height).toBe(500);
    const blooming = s.doc().layers.find((l) => l.id === blooms)!;
    expect(blooming.opacity).toBe(0.6);
    expect(blooming.effects?.[0]?.kind).toBe('glow');
  });
});

describe.skipIf(!hasPapers)(
  'Workbook Chapter 6 Task 3: a motion swirl; darker colours brighter',
  () => {
    it('a twirl round the middle, and the darkest colours made lighter with Replace colour', async () => {
      const s = await graphics(['2019_11_November/Harbour.jpg']);
      await s.open('2019_11_November/Harbour.jpg');
      const before = s.pixels().bitmap;
      expect(
        await s.g.applyFilter({
          kind: 'twirl',
          centre: { x: 500, y: 600 },
          radius: 400,
          angle: 120,
        }),
      ).toBe(true);
      expect(
        near(
          mean(s.pixels().bitmap, { x: 300, y: 400, width: 100, height: 100 }),
          mean(before, { x: 300, y: 400, width: 100, height: 100 }),
          1,
        ),
      ).toBe(false);
      const dark = (b: Bitmap) => {
        const d = readRegion(b);
        let sum = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
          if (l < 60) {
            sum += l;
            n++;
          }
        }
        return { n, mean: sum / Math.max(1, n) };
      };
      const was = dark(s.pixels().bitmap);
      expect(
        await s.g.adjust('replaceColour', {
          colour: '#101418',
          fuzziness: 80,
          hue: 0,
          saturation: 0,
          lightness: 50,
        }),
      ).toBe(true);
      expect(dark(s.pixels().bitmap).n).toBeLessThan(was.n * 0.7);
    });
  },
);

describe.skipIf(!hasPapers)('Workbook Chapter 6 Task 5: a poor holiday photo improved', () => {
  it('levels, exposure, contrast and shadows / highlights, one undo step each', async () => {
    const s = await graphics(['2024_11_November/Bay.jpg']);
    await s.open('2024_11_November/Bay.jpg');
    const spread = (b: Bitmap) => {
      const d = readRegion(b);
      let lo = 255;
      let hi = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = Math.round((d[i]! + d[i + 1]! + d[i + 2]!) / 3);
        lo = Math.min(lo, l);
        hi = Math.max(hi, l);
      }
      return hi - lo;
    };
    const steps = s.g.store.get().history.past.length;
    const was = spread(s.pixels().bitmap);
    expect(
      await s.g.adjust('levels', { ...defaultSettings('levels'), inBlack: 30, inWhite: 225 }),
    ).toBe(true);
    expect(await s.g.adjust('exposure', { stops: 0.3 })).toBe(true);
    expect(await s.g.adjust('brightnessContrast', { brightness: 0, contrast: 20 })).toBe(true);
    expect(await s.g.adjust('shadowsHighlights', { shadows: 30, highlights: 20, radius: 30 })).toBe(
      true,
    );
    expect(s.g.store.get().history.past.length).toBe(steps + 4);
    expect(spread(s.pixels().bitmap)).toBeGreaterThanOrEqual(was);
  });
});

describe('Workbook Chapter 6 Task 6.2: red eye', () => {
  it('red pupils clicked or boxed turn dark; the skin stays', async () => {
    const s = await graphics([]);
    expect(
      await s.g.newImage({
        name: 'Eyes',
        size: { width: 200, height: 100, units: 'px', dpi: 96 },
        background: '#e8b896',
      }),
    ).toBeNull();
    s.g.addPixelLayer();
    s.g.setTool('bucket');
    s.g.setBucket({ tolerance: 0, contiguous: false });
    s.g.setPaintColours({ foreground: '#e8b896' });
    expect(await s.g.fillAt({ x: 5, y: 5 })).toBe(true);
    s.g.applyBrushPreset(BUILT_IN_PRESETS.find((p) => p.name === 'Hard round')!);
    s.g.setBrush({ size: 16 });
    paint(s, '#e01010', [{ x: 60, y: 50 }]);
    paint(s, '#e01010', [{ x: 140, y: 50 }]);
    s.g.setTool('red-eye');
    expect(s.g.redEyeAt({ x: 60, y: 50 })).toBe(true);
    expect(s.g.redEyeAt({ x: 128, y: 38 }, { x: 152, y: 62 })).toBe(true);
    for (const x of [60, 140]) {
      const [r, g] = pixelAt(s.pixels().bitmap, x, 50);
      expect(r - g).toBeLessThan(40);
      expect(r).toBeLessThan(120);
    }
    expect(pixelAt(s.pixels().bitmap, 100, 50)).toEqual([0xe8, 0xb8, 0x96, 255]);
  });
});

describe.skipIf(!hasPapers)('Workbook Chapter 6 Task 7: only the balloons coloured', () => {
  it('everything but the balloon made greyscale through an inverted selection', async () => {
    const s = await graphics(['2022_06_June/Scene1.png']);
    await s.open('2022_06_June/Scene1.png');
    s.g.selectEllipse({ x: 1350, y: 580, width: 500, height: 620 });
    s.g.invertPixelSelection();
    expect(await s.g.adjust('greyscale', defaultSettings('greyscale'))).toBe(true);
    s.g.deselectPixels();
    const sky = pixelAt(s.pixels().bitmap, 400, 400);
    expect(sky[0]).toBe(sky[1]);
    expect(sky[1]).toBe(sky[2]);
    const balloon = mean(s.pixels().bitmap, { x: 1500, y: 750, width: 200, height: 200 });
    expect(Math.max(...balloon) - Math.min(...balloon)).toBeGreaterThan(20);
  });
});

describe('Workbook Chapter 6 Task 9: a metallic name plaque', () => {
  it('a grey gradient plate with a bevel and a shadow, its words in front; written to SVG with the effects', async () => {
    const s = await graphics([]);
    expect(
      await s.g.newImage({
        name: 'Plaque',
        size: { width: 600, height: 240, units: 'px', dpi: 96 },
        background: 'none',
      }),
    ).toBeNull();
    s.g.addPixelLayer();
    const plate = s.layer().id;
    s.g.selectRect({ x: 20, y: 20, width: 560, height: 200 }, { antiAlias: false });
    s.g.setPaintColours({ foreground: '#e8e8ea', background: '#6a6d72' });
    expect(await s.g.gradientFill({ x: 300, y: 20 }, { x: 300, y: 220 })).toBe(true);
    s.g.deselectPixels();
    expect(s.g.setLayerEffects(plate, [newFilter('bevel'), newFilter('dropShadow')])).toBeNull();
    s.g.addLayer();
    s.g.addText({ x: 90, y: 80 }, 'METALLIC');
    expect(
      s.g.setProperties({
        font: 'Inter',
        size: 72,
        bold: true,
        fill: { kind: 'linear', from: '#f4f4f4', to: '#55585e', angle: 90 },
      }),
    ).toBeNull();
    expect(s.g.setProperties({ filters: [newFilter('bevel')] })).toBeNull();
    const top = pixelAt(s.doc().layers.find((l) => l.id === plate)!.pixels!.bitmap, 300, 22);
    expect(top[0]).toBeGreaterThan(200);
    const svg = new TextDecoder().decode(
      await s.exportTo('/out/Chapter06_Task9.svg', { format: 'svg' }),
    );
    expect(svg).toContain('<filter');
    expect(svg).toContain('data:image/png;base64,');
    expect(
      s
        .doc()
        .layers.find((l) => l.id === plate)!
        .effects!.map((e) => e.kind),
    ).toEqual(['bevel', 'dropShadow']);
  });
});
