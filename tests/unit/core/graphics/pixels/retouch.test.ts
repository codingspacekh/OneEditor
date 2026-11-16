// M22 step 3 (GB5, D8): the retouching brushes' known answers on M21's brush engine — the clone
// stamp copies exact pixels at the offset (from this layer or every visible layer, a transparent
// source leaving the target as it was, on a mask its grey), a stroke tells its weights and can be
// laid again with another painter, the blur brush evens out a checkerboard and the sharpen brush
// steepens an edge (only where the stroke went), the smudge brush drags colour along the stroke,
// and red eye turns red pupils dark and leaves the skin; and the retouching settings' ranges.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRUSH,
  createStroke,
  type BrushSettings,
} from '../../../../../src/core/graphics/pixels/brush.ts';
import {
  blurredSource,
  clonePainter,
  compositeSource,
  lazySource,
  rasterSource,
  redness,
  removeRedEye,
  sharpenedSource,
  smudgeHooks,
  towardsPainter,
} from '../../../../../src/core/graphics/pixels/retouch.ts';
import {
  DEFAULT_RETOUCH,
  checkRetouch,
  isRetouchBrushTool,
  isStrengthTool,
} from '../../../../../src/core/graphics/pixels/retouch-options.ts';
import {
  bitmapFromRGBA,
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  type Bitmap,
} from '../../../../../src/core/graphics/pixels/raster.ts';

const hard = (change: Partial<BrushSettings> = {}): BrushSettings => ({
  ...DEFAULT_BRUSH,
  hardness: 100,
  pressureSize: false,
  ...change,
});

/** A bitmap whose every pixel tells where it is: r = x, g = y, b = 7, opaque. */
function coords(width: number, height: number): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set([x, y, 7, 255], (y * width + x) * 4);
  return bitmapFromRGBA(width, height, data);
}

describe('M22 GB5: the clone stamp', () => {
  it('copies the exact pixels at the offset under a hard brush', () => {
    const b = coords(100, 100);
    const s = createStroke(
      {
        target: b,
        x: 0,
        y: 0,
        brush: hard({ size: 10 }),
        colour: [0, 0, 0],
        painter: clonePainter(rasterSource(b), { x: 0, y: 0 }, { dx: -30, dy: 12 }, 4),
      },
      { x: 60, y: 40 },
    );
    s.to({ x: 70, y: 40 });
    const out = s.result() as Bitmap;
    expect(pixelAt(out, 60, 40)).toEqual([30, 52, 7, 255]);
    expect(pixelAt(out, 70, 41)).toEqual([40, 53, 7, 255]);
    // Outside the stroke the pixels are their own.
    expect(pixelAt(out, 60, 60)).toEqual([60, 60, 7, 255]);
  });

  it('works on a layer placed elsewhere on the image (the offset in image px)', () => {
    const b = coords(50, 50);
    const s = createStroke(
      {
        target: b,
        x: 100,
        y: 200,
        brush: hard({ size: 4 }),
        colour: [0, 0, 0],
        painter: clonePainter(rasterSource(b, 100, 200), { x: 100, y: 200 }, { dx: 5, dy: 0 }, 4),
      },
      { x: 120, y: 220 },
    );
    expect(pixelAt(s.result() as Bitmap, 20, 20)).toEqual([25, 20, 7, 255]);
  });

  it('leaves the target as it was where the source is transparent, and mixes at an opacity', () => {
    const b = fillRect(
      createBitmap(40, 40),
      { x: 0, y: 0, width: 20, height: 40 },
      [0, 0, 200, 255],
    );
    const target = fillRect(b, { x: 20, y: 0, width: 20, height: 40 }, [200, 0, 0, 255]);
    const src = rasterSource(
      fillRect(createBitmap(40, 40), { x: 0, y: 0, width: 20, height: 40 }, [0, 0, 200, 255]),
    );
    const s = createStroke(
      {
        target,
        x: 0,
        y: 0,
        brush: hard({ size: 4, opacity: 50 }),
        colour: [0, 0, 0],
        painter: clonePainter(src, { x: 0, y: 0 }, { dx: -15, dy: 0 }, 4),
      },
      { x: 30, y: 10 },
    );
    s.to({ x: 30, y: 30 });
    const out = s.result() as Bitmap;
    // Copied from x = 15 (blue) at 50 %: half way from red to blue.
    const [r, , bl] = pixelAt(out, 30, 20);
    expect(r).toBeGreaterThan(95);
    expect(r).toBeLessThan(105);
    expect(bl).toBeGreaterThan(95);
    // From the source's transparent right half: nothing changes.
    const t = createStroke(
      {
        target,
        x: 0,
        y: 0,
        brush: hard({ size: 4 }),
        colour: [0, 0, 0],
        painter: clonePainter(src, { x: 0, y: 0 }, { dx: 5, dy: 0 }, 4),
      },
      { x: 30, y: 10 },
    );
    expect(pixelAt(t.result() as Bitmap, 30, 10)).toEqual([200, 0, 0, 255]);
  });

  it('on a layer mask copies the mask’s grey, and a bitmap source’s grey', () => {
    const mask = fillRect(createMask(30, 30), { x: 0, y: 0, width: 10, height: 30 }, 255);
    const s = createStroke(
      {
        target: mask,
        x: 0,
        y: 0,
        brush: hard({ size: 3 }),
        colour: [0, 0, 0],
        painter: clonePainter(rasterSource(mask), { x: 0, y: 0 }, { dx: -15, dy: 0 }, 1),
      },
      { x: 20, y: 15 },
    );
    expect(pixelAt(s.result() as never, 20, 15)).toBe(255);
    const grey = fillRect(
      createBitmap(30, 30),
      { x: 0, y: 0, width: 30, height: 30 },
      [255, 0, 0, 255],
    );
    const t = createStroke(
      {
        target: mask,
        x: 0,
        y: 0,
        brush: hard({ size: 3 }),
        colour: [0, 0, 0],
        painter: clonePainter(rasterSource(grey), { x: 0, y: 0 }, { dx: 0, dy: 0 }, 1),
      },
      { x: 20, y: 15 },
    );
    expect(pixelAt(t.result() as never, 20, 15)).toBe(76);
  });

  it('a mask source painted on a bitmap gives its grey', () => {
    const mask = fillRect(createMask(10, 10), { x: 0, y: 0, width: 10, height: 10 }, 128);
    const target = createBitmap(10, 10);
    const s = createStroke(
      {
        target,
        x: 0,
        y: 0,
        brush: hard({ size: 4 }),
        colour: [0, 0, 0],
        painter: clonePainter(rasterSource(mask), { x: 0, y: 0 }, { dx: 0, dy: 0 }, 4),
      },
      { x: 5, y: 5 },
    );
    expect(pixelAt(s.result() as Bitmap, 5, 5)).toEqual([128, 128, 128, 255]);
  });

  it('copies from every visible layer as drawn, made only for the tiles read', () => {
    const below = fillRect(
      createBitmap(300, 300),
      { x: 0, y: 0, width: 300, height: 300 },
      [0, 0, 255, 255],
    );
    const above = fillRect(
      createBitmap(100, 100),
      { x: 0, y: 0, width: 100, height: 100 },
      [255, 0, 0, 255],
    );
    const src = compositeSource(
      [
        { pixels: { bitmap: below, x: 0, y: 0 }, opacity: 1, blend: 'normal', clip: false },
        { pixels: { bitmap: above, x: 0, y: 0 }, opacity: 0.5, blend: 'normal', clip: false },
      ],
      { x: 0, y: 0, width: 300, height: 300 },
    );
    const px = new Uint8ClampedArray(4);
    src.read(10, 10, px, 0);
    expect(px[0]).toBeGreaterThan(120);
    expect(px[2]).toBeGreaterThan(120);
    src.read(280, 280, px, 0);
    expect([...px]).toEqual([0, 0, 255, 255]);
    src.read(-1, 5, px, 0);
    expect([...px]).toEqual([0, 0, 0, 0]);
  });

  it('a lazy source makes each tile once, when first read', () => {
    let made = 0;
    const src = lazySource(600, 300, 1, (rect) => {
      made++;
      return new Uint8ClampedArray(rect.width * rect.height).fill(rect.x === 0 ? 10 : 20);
    });
    const px = new Uint8ClampedArray(1);
    src.read(5, 5, px, 0);
    src.read(6, 9, px, 0);
    expect(made).toBe(1);
    src.read(300, 5, px, 0);
    expect(px[0]).toBe(20);
    expect(made).toBe(2);
    src.read(600, 5, px, 0);
    expect(px[0]).toBe(0);
  });

  it('a raster source reads zero outside and on empty tiles', () => {
    const src = rasterSource(createBitmap(300, 10), 0, 0);
    const px = new Uint8ClampedArray([1, 2, 3, 4]);
    src.read(5, 5, px, 0);
    expect([...px]).toEqual([0, 0, 0, 0]);
    px.fill(9);
    src.read(-1, 0, px, 0);
    expect([...px]).toEqual([0, 0, 0, 0]);
  });
});

describe('M22 GB5: a stroke’s weights and laying it again', () => {
  it('weights are opacity × coverage × selection over the box the stroke covers', () => {
    const selection = fillRect(createMask(60, 60), { x: 0, y: 0, width: 30, height: 60 }, 255);
    const s = createStroke(
      {
        target: createBitmap(60, 60),
        x: 0,
        y: 0,
        brush: hard({ size: 10, opacity: 50 }),
        colour: [255, 0, 0],
        selection,
      },
      { x: 25, y: 20 },
    );
    const w = s.weights()!;
    expect(w.x).toBe(20);
    expect(w.y).toBe(15);
    expect(w.width).toBe(10); // cut at the selection's edge (x < 30)
    expect(w.height).toBe(10);
    expect(w.values[5 * w.width + 5]).toBeCloseTo(0.5, 5);
  });

  it('weights are null for a stroke off the target or outside the selection', () => {
    const off = createStroke(
      { target: createBitmap(10, 10), x: 0, y: 0, brush: hard({ size: 4 }), colour: [0, 0, 0] },
      { x: 100, y: 100 },
    );
    expect(off.weights()).toBeNull();
    const unselected = createStroke(
      {
        target: createBitmap(10, 10),
        x: 0,
        y: 0,
        brush: hard({ size: 4 }),
        colour: [0, 0, 0],
        selection: createMask(10, 10),
      },
      { x: 5, y: 5 },
    );
    expect(unselected.weights()).toBeNull();
  });

  it('repaint lays the whole stroke again with another painter', () => {
    const target = createBitmap(40, 40);
    const s = createStroke(
      { target, x: 0, y: 0, brush: hard({ size: 6 }), colour: [255, 0, 0] },
      { x: 10, y: 10 },
    );
    s.to({ x: 30, y: 10 });
    expect(pixelAt(s.result() as Bitmap, 20, 10)).toEqual([255, 0, 0, 255]);
    s.repaint((out, k, _x, _y, a) => {
      out[k + 1] = 255 * a;
      out[k + 3] = 255 * a;
    });
    const out = s.result() as Bitmap;
    expect(pixelAt(out, 20, 10)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(out, 20, 30)).toEqual([0, 0, 0, 0]);
  });

  it('onDab hears every dab with its centre on the target and its size', () => {
    const dabs: number[][] = [];
    const s = createStroke(
      {
        target: createBitmap(40, 40),
        x: 10,
        y: 0,
        brush: hard({ size: 8, spacing: 50 }),
        colour: [0, 0, 0],
        onDab: (cx, cy, size) => dabs.push([cx, cy, size]),
      },
      { x: 15, y: 5 },
    );
    s.to({ x: 23, y: 5 });
    expect(dabs).toEqual([
      [5, 5, 8],
      [9, 5, 8],
      [13, 5, 8],
    ]);
  });
});

/** A checkerboard of black and white, opaque. */
function checker(size: number): Bitmap {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = (x + y) % 2 ? 255 : 0;
      data.set([v, v, v, 255], (y * size + x) * 4);
    }
  return bitmapFromRGBA(size, size, data);
}

describe('M22 GB5: the blur and sharpen brushes', () => {
  it('the blur brush evens out a checkerboard where it goes, at its strength', () => {
    const b = checker(64);
    const stroke = (strength: number) => {
      const s = createStroke(
        {
          target: b,
          x: 0,
          y: 0,
          brush: hard({ size: 20 }),
          colour: [0, 0, 0],
          painter: (out, k, x, y, a) =>
            towardsPainter(blurredSource(b, 2))(out, k, x, y, a * strength),
        },
        { x: 32, y: 32 },
      );
      return s.result() as Bitmap;
    };
    const full = stroke(1);
    for (const [x, y] of [
      [32, 32],
      [33, 32],
    ]) {
      const [r, , , a] = pixelAt(full, x!, y!);
      expect(Math.abs(r - 128)).toBeLessThan(8);
      expect(a).toBe(255);
    }
    // Half strength: half way.
    const half = pixelAt(stroke(0.5), 33, 32)[0];
    expect(half).toBeGreaterThan(180);
    expect(half).toBeLessThan(200);
    // Where the stroke did not go, the squares stay.
    expect(pixelAt(full, 2, 2)[0]).toBe(0);
    expect(pixelAt(full, 3, 2)[0]).toBe(255);
  });

  it('blurring is premultiplied: a transparent neighbour lends no colour', () => {
    const b = fillRect(
      createBitmap(20, 20),
      { x: 0, y: 0, width: 10, height: 20 },
      [200, 0, 0, 255],
    );
    const px = new Uint8ClampedArray(4);
    blurredSource(b, 2).read(9, 10, px, 0);
    expect(px[0]).toBeGreaterThan(195);
    expect(px[3]).toBeLessThan(255);
    expect(px[3]).toBeGreaterThan(0);
  });

  it('blurs a mask’s grey', () => {
    const m = fillRect(createMask(20, 20), { x: 0, y: 0, width: 10, height: 20 }, 255);
    const px = new Uint8ClampedArray(1);
    blurredSource(m, 2).read(10, 10, px, 0);
    expect(px[0]).toBeGreaterThan(60);
    expect(px[0]).toBeLessThan(200);
  });

  it('the sharpen brush steepens an edge and keeps flat parts and alpha', () => {
    const b = fillRect(
      fillRect(createBitmap(40, 40), { x: 0, y: 0, width: 40, height: 40 }, [100, 100, 100, 200]),
      { x: 20, y: 0, width: 20, height: 40 },
      [150, 150, 150, 200],
    );
    const src = sharpenedSource(b, 1.5, 1);
    const px = new Uint8ClampedArray(4);
    src.read(19, 10, px, 0);
    expect(px[0]).toBeLessThan(100);
    src.read(20, 10, px, 0);
    expect(px[0]).toBeGreaterThan(150);
    src.read(5, 10, px, 0);
    expect([...px]).toEqual([100, 100, 100, 200]);
    const m = sharpenedSource(
      fillRect(createMask(10, 10), { x: 0, y: 0, width: 10, height: 10 }, 90),
      1,
      1,
    );
    const one = new Uint8ClampedArray(1);
    m.read(5, 5, one, 0);
    expect(one[0]).toBe(90);
  });
});

describe('M22 GB5: the smudge brush', () => {
  it('drags the colour where the stroke starts along it, fading at a lower strength', () => {
    const b = fillRect(
      fillRect(createBitmap(80, 20), { x: 0, y: 0, width: 80, height: 20 }, [255, 255, 255, 255]),
      { x: 0, y: 0, width: 20, height: 20 },
      [0, 0, 0, 255],
    );
    const smear = (strength: number) => {
      const hooks = smudgeHooks(b, { x: 0, y: 0 }, strength, 1, 10);
      const s = createStroke(
        {
          target: b,
          x: 0,
          y: 0,
          brush: hard({ size: 10, spacing: 10 }),
          colour: [0, 0, 0],
          ...hooks,
        },
        { x: 12, y: 10 },
      );
      s.to({ x: 40, y: 10 });
      return s.result() as Bitmap;
    };
    const full = smear(1);
    expect(pixelAt(full, 30, 10)[0]).toBeLessThan(30);
    const weak = smear(0.5);
    expect(pixelAt(weak, 30, 10)[0]).toBeGreaterThan(pixelAt(full, 30, 10)[0] + 60);
    expect(pixelAt(weak, 22, 10)[0]).toBeLessThan(pixelAt(weak, 30, 10)[0]);
    // Far from the stroke, nothing changes.
    expect(pixelAt(full, 70, 10)).toEqual([255, 255, 255, 255]);
  });

  it('stays inside the selection, and copes with an empty layer and the edge', () => {
    const b = fillRect(
      createBitmap(300, 20),
      { x: 0, y: 0, width: 20, height: 20 },
      [0, 0, 0, 255],
    );
    const selection = fillRect(createMask(300, 20), { x: 0, y: 0, width: 25, height: 20 }, 255);
    const hooks = smudgeHooks(b, { x: 0, y: 0 }, 1, 1, 10, selection);
    const s = createStroke(
      {
        target: b,
        x: 0,
        y: 0,
        brush: hard({ size: 10, spacing: 10 }),
        colour: [0, 0, 0],
        ...hooks,
      },
      { x: 2, y: 2 },
    );
    s.to({ x: 290, y: 2 });
    const out = s.result() as Bitmap;
    expect(pixelAt(out, 23, 2)[3]).toBe(255);
    expect(pixelAt(out, 40, 2)).toEqual([0, 0, 0, 0]);
  });
});

describe('M22 GB5: red eye', () => {
  /** Skin round a red pupil of radius 6 at (20, 20). */
  function eye(): Bitmap {
    const data = new Uint8ClampedArray(40 * 40 * 4);
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) {
        const inPupil = Math.hypot(x + 0.5 - 20, y + 0.5 - 20) < 6;
        data.set(inPupil ? [200, 30, 40, 255] : [220, 170, 140, 255], (y * 40 + x) * 4);
      }
    return bitmapFromRGBA(40, 40, data);
  }

  it('turns red pupils dark and grey and leaves the skin', () => {
    const out = removeRedEye(eye(), { x: 0, y: 0 }, { cx: 20, cy: 20, rx: 10, ry: 10 }, 0.5);
    const [r, g, b] = pixelAt(out, 20, 20);
    expect(r).toBeLessThan(25);
    expect(Math.abs(r - (g + b) / 2)).toBeLessThan(4);
    expect(pixelAt(out, 20, 28)).toEqual([220, 170, 140, 255]);
    expect(pixelAt(out, 13, 20)).toEqual([220, 170, 140, 255]);
  });

  it('with no darkening the pupil is grey at its own green and blue; outside the area untouched', () => {
    const out = removeRedEye(eye(), { x: 0, y: 0 }, { cx: 20, cy: 20, rx: 10, ry: 10 }, 0);
    expect(pixelAt(out, 20, 20)).toEqual([35, 30, 40, 255]);
    const small = removeRedEye(eye(), { x: 0, y: 0 }, { cx: 17, cy: 20, rx: 2, ry: 2 }, 0.5);
    expect(pixelAt(small, 23, 20)).toEqual([200, 30, 40, 255]);
  });

  it('keeps to the selection and to the layer’s place on the image', () => {
    const sel = fillRect(createMask(140, 140), { x: 100, y: 100, width: 20, height: 40 }, 255);
    const out = removeRedEye(
      eye(),
      { x: 100, y: 100 },
      { cx: 120, cy: 120, rx: 10, ry: 10 },
      0.5,
      sel,
    );
    expect(pixelAt(out, 18, 20)[0]).toBeLessThan(30);
    expect(pixelAt(out, 21, 20)).toEqual([200, 30, 40, 255]);
  });

  it('a click with nothing red leaves the very same bitmap', () => {
    const skin = fillRect(
      createBitmap(20, 20),
      { x: 0, y: 0, width: 20, height: 20 },
      [220, 170, 140, 255],
    );
    expect(removeRedEye(skin, { x: 0, y: 0 }, { cx: 10, cy: 10, rx: 5, ry: 5 }, 1)).toBe(skin);
    expect(
      removeRedEye(createBitmap(20, 20), { x: 0, y: 0 }, { cx: 10, cy: 10, rx: 5, ry: 5 }, 1)
        .tiles[0],
    ).toBeNull();
  });

  it('redness: a red pupil 1, skin and grey 0, a dark red 0', () => {
    expect(redness(200, 30, 40)).toBe(1);
    expect(redness(220, 170, 140)).toBe(0);
    expect(redness(128, 128, 128)).toBe(0);
    expect(redness(30, 5, 5)).toBe(0);
  });
});

describe('M22 GB5: the retouching settings', () => {
  it('names the tools and keeps the ranges', () => {
    expect(isRetouchBrushTool('heal')).toBe(true);
    expect(isRetouchBrushTool('red-eye')).toBe(false);
    expect(isStrengthTool('smudge')).toBe(true);
    expect(isStrengthTool('clone')).toBe(false);
    expect(() => checkRetouch(DEFAULT_RETOUCH)).not.toThrow();
    const bad = (change: object) => () => checkRetouch({ ...DEFAULT_RETOUCH, ...change });
    expect(bad({ strength: { ...DEFAULT_RETOUCH.strength, smudge: 0 } })).toThrow('1 to 100');
    expect(bad({ pupilSize: 1 })).toThrow('2 to 500');
    expect(bad({ darken: 101 })).toThrow('0 to 100');
    expect(bad({ sample: 'x' })).toThrow('copy from');
    expect(
      bad({ brushes: { ...DEFAULT_RETOUCH.brushes, heal: { ...DEFAULT_BRUSH, size: 0 } } }),
    ).toThrow();
  });
});
