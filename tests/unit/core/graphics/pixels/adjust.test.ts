// M22 step 2 (GB3): the adjustments as pure functions, each answer worked out by hand — greyscale,
// black and white, brightness / contrast, levels, exposure, colour balance, shadows / highlights,
// hue / saturation / lightness and colourise, temperature / tint, replace colour and invert; the
// same size back, transparent pixels and untouched tiles left as they were; on a mask only those
// that make sense there.
import { describe, expect, it } from 'vitest';
import {
  ADJUSTMENTS,
  adjust,
  adjustmentLabel,
  defaultSettings,
  maskRefusal,
  worksOnMask,
  type AdjustmentKind,
  type AnyAdjustment,
} from '../../../../../src/core/graphics/pixels/adjust.ts';
import {
  bitmapFromRGBA,
  createBitmap,
  createMask,
  fillRect,
  maskFromBytes,
  pixelAt,
  readRegion,
  type Bitmap,
} from '../../../../../src/core/graphics/pixels/raster.ts';
import { EditError } from '../../../../../src/core/model/errors.ts';

/** One-pixel-high bitmap of the given colours (opaque unless an alpha is given). */
const row = (...colours: number[][]): Bitmap =>
  bitmapFromRGBA(
    colours.length,
    1,
    Uint8ClampedArray.from(colours.flatMap(([r, g, b, a = 255]) => [r!, g!, b!, a])),
  );
const px = (b: Bitmap, x = 0) => pixelAt(b, x, 0);

function run<K extends AdjustmentKind>(
  b: Bitmap,
  kind: K,
  change: Partial<Extract<AnyAdjustment, { kind: K }>['settings']> = {},
): Bitmap {
  const settings = { ...defaultSettings(kind), ...change };
  return adjust(b, { kind, settings } as AnyAdjustment) as Bitmap;
}

describe('M22 GB3: the adjustments, known answers', () => {
  it('M22 GB3: greyscale keeps the brightness the eye sees (BT.601)', () => {
    const b = run(row([255, 0, 0], [0, 255, 0], [0, 0, 255], [200, 100, 50]), 'greyscale');
    expect([px(b, 0), px(b, 1), px(b, 2)]).toEqual([
      [76, 76, 76, 255],
      [150, 150, 150, 255],
      [29, 29, 29, 255],
    ]);
    // 0.299 × 200 + 0.587 × 100 + 0.114 × 50 = 124.2
    expect(px(b, 3)).toEqual([124, 124, 124, 255]);
  });

  it('M22 GB3: black and white: at or above the level white, below it black', () => {
    const b = row([128, 128, 128], [127, 127, 127], [255, 0, 0]);
    expect([px(run(b, 'threshold'), 0), px(run(b, 'threshold'), 1)]).toEqual([
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);
    // Red's brightness is 76: white only with the level at 76 or lower.
    expect(px(run(b, 'threshold', { level: 76 }), 2)).toEqual([255, 255, 255, 255]);
    expect(px(run(b, 'threshold', { level: 77 }), 2)).toEqual([0, 0, 0, 255]);
  });

  it('M22 GB3: brightness adds levels; contrast spreads them from the middle', () => {
    const b = row([100, 200, 0]);
    expect(px(run(b, 'brightnessContrast', { brightness: 20 }))).toEqual([120, 220, 20, 255]);
    expect(px(run(b, 'brightnessContrast', { brightness: -150 }))).toEqual([0, 50, 0, 255]);
    // Contrast 50: ×tan(3π/8) ≈ 2.414 about 127.5.
    expect(px(run(b, 'brightnessContrast', { contrast: 50 }))).toEqual([61, 255, 0, 255]);
    // −100: everything the middle grey; +100: everything black or white.
    expect(px(run(b, 'brightnessContrast', { contrast: -100 }))).toEqual([128, 128, 128, 255]);
    expect(px(run(b, 'brightnessContrast', { contrast: 100 }))).toEqual([0, 255, 0, 255]);
  });

  it('M22 GB3: levels: input points, gamma, output range, one channel alone', () => {
    const b = row([50, 125, 200], [128, 128, 128], [0, 255, 100]);
    const stretched = run(b, 'levels', { inBlack: 50, inWhite: 200 });
    expect(px(stretched)).toEqual([0, 128, 255, 255]);
    // Gamma 2 brightens the middle: (128 / 255)^½ × 255 = 180.7.
    expect(px(run(b, 'levels', { gamma: 2 }), 1)).toEqual([181, 181, 181, 255]);
    // The output range 20–220 lifts black and lowers white.
    expect(px(run(b, 'levels', { outBlack: 20, outWhite: 220 }), 2)).toEqual([20, 220, 98, 255]);
    // Only the red channel.
    expect(px(run(b, 'levels', { inBlack: 50, inWhite: 200, channel: 'red' }))).toEqual([
      0, 125, 200, 255,
    ]);
    expect(px(run(b, 'levels', { outWhite: 0, channel: 'blue' }), 2)).toEqual([0, 255, 0, 255]);
  });

  it('M22 GB3: exposure works in linear light: +1 stop doubles the light', () => {
    const b = row([128, 0, 255], [64, 64, 64]);
    // sRGB 128 is 0.2159 of the light; doubled 0.4317, which is sRGB 175.6.
    expect(px(run(b, 'exposure', { stops: 1 }))).toEqual([176, 0, 255, 255]);
    // −1 stop halves it: 0.2159 / 2 = 0.1079, sRGB 92.4; white's half is sRGB 187.5.
    expect(px(run(b, 'exposure', { stops: -1 }))).toEqual([92, 0, 188, 255]);
    expect(run(b, 'exposure', { stops: 0 })).toBe(b);
  });

  it('M22 GB3: colour balance moves the shadows, midtones or highlights apart', () => {
    const b = row([128, 128, 128], [0, 0, 0], [255, 255, 255]);
    const tone = { cyanRed: 50, magentaGreen: 0, yellowBlue: 0 };
    // The middle grey is all midtone; black is no midtone.
    const mid = run(b, 'colourBalance', { midtones: tone, preserveLuminosity: false });
    expect([px(mid, 0), px(mid, 1)]).toEqual([
      [178, 128, 128, 255],
      [0, 0, 0, 255],
    ]);
    const shadows = run(b, 'colourBalance', {
      shadows: { cyanRed: 0, magentaGreen: -40, yellowBlue: 60 },
      preserveLuminosity: false,
    });
    expect([px(shadows, 0), px(shadows, 1)]).toEqual([
      [128, 128, 128, 255],
      [0, 0, 60, 255],
    ]);
    const highlights = run(b, 'colourBalance', {
      highlights: { cyanRed: -30, magentaGreen: 0, yellowBlue: 0 },
      preserveLuminosity: false,
    });
    expect(px(highlights, 2)).toEqual([225, 255, 255, 255]);
    // Luminosity kept: the change in brightness (0.299 × 50 = 15) taken off every channel.
    expect(px(run(b, 'colourBalance', { midtones: tone }))).toEqual([163, 113, 113, 255]);
  });

  it('M22 GB3: shadows / highlights lifts the dark parts and recovers the bright ones', () => {
    const b = row([64, 64, 64], [230, 230, 230], [0, 0, 0], [255, 255, 255], [40, 20, 10]);
    const lifted = run(b, 'shadowsHighlights', { shadows: 50, highlights: 0, radius: 0 });
    expect(px(lifted, 0)[0]).toBeGreaterThan(90);
    expect(px(lifted, 1)[0]).toBeGreaterThanOrEqual(230);
    expect([px(lifted, 2), px(lifted, 3)]).toEqual([
      [0, 0, 0, 255],
      [255, 255, 255, 255],
    ]);
    // The colour kept: every channel brightened in proportion.
    const [r, g, bl] = px(lifted, 4);
    expect(r! / bl!).toBeCloseTo(4, 0);
    expect(g! / bl!).toBeCloseTo(2, 0);
    const recovered = run(b, 'shadowsHighlights', { shadows: 0, highlights: 60, radius: 0 });
    expect(px(recovered, 1)[0]).toBeLessThan(215);
    expect(px(recovered, 0)).toEqual([64, 64, 64, 255]);
    expect(run(b, 'shadowsHighlights', { shadows: 0, highlights: 0 })).toBe(b);
  });

  it('M22 GB3: shadows / highlights is local: a dark part in a dark area is lifted more', () => {
    // 60 px: dark on the left half, white on the right, one dark pixel inside the white.
    const data = new Uint8ClampedArray(60 * 4);
    for (let x = 0; x < 60; x++) {
      const v = x < 30 ? 40 : 255;
      data.set([v, v, v, 255], x * 4);
    }
    data.set([40, 40, 40, 255], 45 * 4);
    const b = bitmapFromRGBA(60, 1, data);
    const out = run(b, 'shadowsHighlights', { shadows: 80, highlights: 0, radius: 6 });
    expect(px(out, 10)[0]).toBeGreaterThan(px(out, 45)[0] + 10);
    // A preview at half size: the radius in its own pixels is halved, the answer near the same.
    const settings = { ...defaultSettings('shadowsHighlights'), shadows: 80, radius: 12 };
    const half = adjust(b, { kind: 'shadowsHighlights', settings }, 2) as Bitmap;
    expect(px(half, 10)).toEqual(px(out, 10));
  });

  it('M22 GB3: hue / saturation / lightness, and colourise (the Moon recoloured)', () => {
    const red = row([255, 0, 0], [128, 128, 128]);
    expect(px(run(red, 'hueSaturation', { hue: 120 }))).toEqual([0, 255, 0, 255]);
    expect(px(run(red, 'hueSaturation', { hue: -120 }))).toEqual([0, 0, 255, 255]);
    expect(px(run(red, 'hueSaturation', { saturation: -100 }))).toEqual([128, 128, 128, 255]);
    expect(px(run(red, 'hueSaturation', { lightness: 100 }))).toEqual([255, 255, 255, 255]);
    expect(px(run(red, 'hueSaturation', { lightness: -100 }))).toEqual([0, 0, 0, 255]);
    expect(px(run(red, 'hueSaturation', { lightness: 50 }))).toEqual([255, 128, 128, 255]);
    // A grey has no hue to turn: unchanged.
    expect(px(run(red, 'hueSaturation', { hue: 90, saturation: 50 }), 1)).toEqual([
      128, 128, 128, 255,
    ]);
    // Colourise: every pixel the one hue and saturation, its brightness kept.
    const moon = run(red, 'hueSaturation', { colourise: true, hue: 240, saturation: 100 });
    expect(px(moon, 1)).toEqual([1, 1, 255, 255]);
    const yellow = run(red, 'hueSaturation', { colourise: true, hue: 60, saturation: 40 });
    expect(px(yellow, 1)).toEqual([179, 179, 77, 255]);
  });

  it('M22 GB3: hue turns red all round the colour wheel', () => {
    const red = row([255, 0, 0]);
    const turned = [30, 90, 150, 180, -150, -90, -30].map((hue) =>
      px(run(red, 'hueSaturation', { hue })).slice(0, 3),
    );
    expect(turned).toEqual([
      [255, 128, 0],
      [128, 255, 0],
      [0, 255, 128],
      [0, 255, 255],
      [0, 128, 255],
      [128, 0, 255],
      [255, 0, 128],
    ]);
  });

  it('M22 GB3: temperature warms (more red, less blue); tint adds magenta or green', () => {
    const b = row([100, 100, 100]);
    expect(px(run(b, 'temperatureTint', { temperature: 100 }))).toEqual([130, 100, 70, 255]);
    expect(px(run(b, 'temperatureTint', { temperature: -50 }))).toEqual([85, 100, 115, 255]);
    expect(px(run(b, 'temperatureTint', { tint: 100 }))).toEqual([100, 70, 100, 255]);
    expect(px(run(b, 'temperatureTint', { tint: -100 }))).toEqual([100, 130, 100, 255]);
  });

  it('M22 GB3: replace colour changes only the colours near the one picked', () => {
    const b = row([255, 0, 0], [0, 0, 255], [235, 10, 10]);
    const out = run(b, 'replaceColour', { colour: '#ff0000', fuzziness: 40, hue: 120 });
    expect(px(out, 0)).toEqual([0, 255, 0, 255]);
    expect(px(out, 1)).toEqual([0, 0, 255, 255]);
    // Near (17 levels away): mostly changed.
    const [r, g] = px(out, 2);
    expect(g!).toBeGreaterThan(r!);
  });

  it('M22 GB3: replace colour: the darker colours made brighter (workbook Task 3)', () => {
    const b = row([0, 0, 0], [50, 50, 50], [200, 200, 200]);
    const out = run(b, 'replaceColour', { colour: '#000000', fuzziness: 100, lightness: 50 });
    // Black: lightness 0 → 0.5; 50 levels away: half changed (50 → 152.5, blended to 101).
    expect([px(out, 0), px(out, 1), px(out, 2)]).toEqual([
      [128, 128, 128, 255],
      [101, 101, 101, 255],
      [200, 200, 200, 255],
    ]);
    // No fuzziness: only that very colour.
    const exact = run(b, 'replaceColour', { colour: '#323232', fuzziness: 0, lightness: -100 });
    expect([px(exact, 0), px(exact, 1)]).toEqual([
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ]);
    expect(px(exact, 2)).toEqual([200, 200, 200, 255]);
  });

  it('M22 GB3: invert turns every colour into its opposite', () => {
    expect(px(run(row([200, 100, 0, 128]), 'invert'))).toEqual([55, 155, 255, 128]);
  });
});

describe('M22 GB3: what every adjustment keeps', () => {
  it('M22 GB3: the same size; transparent pixels and see-through amounts left alone', () => {
    const b = row([200, 100, 0, 0], [200, 100, 0, 77]);
    for (const { kind } of ADJUSTMENTS) {
      const change =
        kind === 'replaceColour' ? { colour: '#c86400', fuzziness: 10, hue: 90 } : undefined;
      const out = run(b, kind, change as never);
      expect([out.width, out.height, out.channels], kind).toEqual([2, 1, 4]);
      expect(px(out, 0), kind).toEqual([200, 100, 0, 0]);
      expect(px(out, 1)[3], kind).toBe(77);
    }
  });

  it('M22 GB3, GN1: a tile left the same is the very same tile; an empty one stays empty', () => {
    // 600 × 10: three tiles across; the first white, the second black, the third transparent.
    let b = createBitmap(600, 10);
    b = fillRect(b, { x: 0, y: 0, width: 256, height: 10 }, [255, 255, 255, 255]);
    b = fillRect(b, { x: 256, y: 0, width: 256, height: 10 }, [0, 0, 0, 255]);
    const out = run(b, 'threshold');
    expect(out.tiles[0]).toBe(b.tiles[0]);
    expect(out.tiles[1]).toBe(b.tiles[1]);
    expect(out.tiles[2]).toBeNull();
    expect(out).toBe(b);
    const inverted = run(b, 'invert');
    expect(inverted.tiles[0]).not.toBe(b.tiles[0]);
    expect(inverted.tiles[2]).toBeNull();
    // The image as it was: never changed.
    expect(pixelAt(b, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('M22 GB3: settings out of range are brought into it; nonsense is the default', () => {
    const b = row([100, 100, 100]);
    expect(px(run(b, 'brightnessContrast', { brightness: 900 }))).toEqual([250, 250, 250, 255]);
    expect(px(run(b, 'threshold', { level: Number.NaN }))).toEqual([0, 0, 0, 255]);
    expect(px(run(b, 'levels', { inBlack: 200, inWhite: 100 }))).toEqual([0, 0, 0, 255]);
    expect(px(run(b, 'replaceColour', { colour: 'nonsense', fuzziness: 0, hue: 60 }))).toEqual([
      100, 100, 100, 255,
    ]);
  });

  it('M22 GB3: each adjustment has a name and its settings to start from', () => {
    expect(ADJUSTMENTS.map((a) => a.kind)).toEqual([
      'brightnessContrast',
      'levels',
      'exposure',
      'shadowsHighlights',
      'hueSaturation',
      'colourBalance',
      'temperatureTint',
      'replaceColour',
      'threshold',
      'greyscale',
      'invert',
    ]);
    expect(adjustmentLabel('threshold')).toBe('Black and white');
    expect(adjustmentLabel('hueSaturation')).toBe('Hue / saturation');
    // The defaults change nothing (but greyscale, black and white and invert, which have none).
    const b = row([10, 120, 230], [250, 3, 77]);
    for (const { kind } of ADJUSTMENTS)
      if (!['greyscale', 'threshold', 'invert'].includes(kind))
        expect(readRegion(run(b, kind)), kind).toEqual(readRegion(b));
  });
});

describe('M22 GB3: adjustments on a layer mask (one channel)', () => {
  const mask = maskFromBytes(4, 1, Uint8ClampedArray.from([0, 100, 200, 255]));
  const on = <K extends AdjustmentKind>(
    kind: K,
    change: Partial<Extract<AnyAdjustment, { kind: K }>['settings']> = {},
  ) => [
    ...readRegion(
      adjust(mask, { kind, settings: { ...defaultSettings(kind), ...change } } as AnyAdjustment),
    ),
  ];

  it('M22 GB3: levels, brightness / contrast, black and white and invert work on its greys', () => {
    expect(on('invert')).toEqual([255, 155, 55, 0]);
    expect(on('threshold', { level: 150 })).toEqual([0, 0, 255, 255]);
    expect(on('brightnessContrast', { brightness: 20 })).toEqual([20, 120, 220, 255]);
    expect(on('levels', { inBlack: 100, inWhite: 200, channel: 'red' })).toEqual([0, 0, 255, 255]);
    // An empty tile (nothing shown) can be changed too: inverted, everything shows.
    const inverted = adjust(createMask(300, 2), { kind: 'invert', settings: {} });
    expect(pixelAt(inverted as never, 299, 1)).toBe(255);
    expect(
      (['invert', 'threshold', 'levels', 'brightnessContrast'] as const).every(worksOnMask),
    ).toBe(true);
  });

  it('M22 GB3: the colour adjustments are refused on a mask, saying what to use', () => {
    for (const kind of ['hueSaturation', 'greyscale', 'replaceColour', 'exposure'] as const) {
      expect(worksOnMask(kind)).toBe(false);
      expect(() => on(kind)).toThrow(EditError);
    }
    expect(maskRefusal('colourBalance')).toMatch(/Colour balance.*mask.*Levels/);
  });
});
