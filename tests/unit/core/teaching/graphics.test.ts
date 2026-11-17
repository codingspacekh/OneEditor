// Learn ▸ Graphics (GL1, G9, G10, GC1, M23): the theory of syllabus 19.1 and 19.4 worked out in
// core — the pixelating zoom, print sizes, colour mixing, the format scenarios, and compression
// on a picture with the encoders and the JPEG codec handed in (fakes here; the real ones in the app).
import { describe, expect, it, vi } from 'vitest';
import { FORMAT_INFO, GRAPHIC_FORMATS } from '../../../../src/core/graphics/export.ts';
import type { RgbaImage } from '../../../../src/core/image/encode/index.ts';
import {
  BITMAP_SIDE,
  BITMAP_VECTOR,
  DEMO_MAX_PIXELS,
  MATCHING_SWATCHES,
  SCENARIOS,
  SOCIETY_TOPICS,
  STAR,
  TRACE_TOPICS,
  additiveMix,
  advise,
  colourCodes,
  compareFormats,
  coverage,
  cropImage,
  depthPreview,
  depthSteps,
  difference,
  fitWithin,
  generations,
  halve,
  hueWheel,
  jpegAt,
  pixelsFor,
  pointInPolygon,
  starBitmap,
  printSize,
  printVerdict,
  resolutionSteps,
  shrink,
  subtractiveMix,
  webVerdict,
  zoomView,
  type BitmapEncoder,
  type PictureCodec,
} from '../../../../src/core/teaching/graphics.ts';

/** A test picture: a red-to-blue gradient left to right, green rising down. */
function gradient(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.round((255 * x) / Math.max(1, width - 1));
      data[i + 1] = Math.round((255 * y) / Math.max(1, height - 1));
      data[i + 2] = 255 - data[i]!;
      data[i + 3] = 255;
    }
  return { width, height, data };
}

const plain = (width: number, height: number, rgba: number[]): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width, height, data };
};

/** A JPEG stand-in: the "file" is 1 byte a pixel at quality 100, fewer at lower quality; decoding loses 100 − quality levels in red. */
function fakeCodec(): PictureCodec & { saves: number[] } {
  const made = new Map<Uint8Array, { image: RgbaImage; quality: number }>();
  const saves: number[] = [];
  return {
    saves,
    async jpeg(image, quality) {
      saves.push(quality);
      const bytes = new Uint8Array(
        Math.max(1, Math.round((image.width * image.height * quality) / 100)),
      );
      made.set(bytes, { image, quality });
      return bytes;
    },
    async decode(bytes) {
      const f = made.get(bytes);
      if (!f) throw new Error('not a picture');
      const data = new Uint8ClampedArray(f.image.data);
      for (let i = 0; i < data.length; i += 4) data[i] = data[i]! - (100 - f.quality);
      return {
        image: { width: f.image.width, height: f.image.height, data },
        width: f.image.width,
        height: f.image.height,
      };
    },
  };
}

describe('GL1 G10 (M23) bitmap and vector: the zoom that pixelates', () => {
  it('the star is a closed shape inside the small bitmap', () => {
    expect(STAR.length).toBe(10);
    for (const [x, y] of STAR) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(BITMAP_SIDE);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(BITMAP_SIDE);
    }
  });

  it('a point is inside or outside a polygon', () => {
    const square: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    expect(pointInPolygon(2, 2, square)).toBe(true);
    expect(pointInPolygon(5, 2, square)).toBe(false);
  });

  it('each pixel holds how much of it the shape covers: full in the middle, none in the corner, part on the edge', () => {
    const c = coverage(STAR, BITMAP_SIDE);
    expect(c.length).toBe(BITMAP_SIDE * BITMAP_SIDE);
    const at = (x: number, y: number) => c[y * BITMAP_SIDE + x]!;
    expect(at(8, 9)).toBe(1);
    expect(at(0, 0)).toBe(0);
    expect([...c].some((v) => v > 0 && v < 1)).toBe(true);
  });

  it('the same star at more pixels: the inside stays full, only the edge is soft', () => {
    const small = starBitmap(8);
    const big = starBitmap(32);
    expect(small.length).toBe(64);
    expect(big.length).toBe(1024);
    const soft = (c: Float32Array) => [...c].filter((v) => v > 0 && v < 1).length / c.length;
    expect(soft(big)).toBeLessThan(soft(small));
  });

  it('zooming in shows a smaller part of the picture, centred on the point of the star', () => {
    expect(zoomView(1)).toEqual({ x: 0, y: 0, size: BITMAP_SIDE });
    const z = zoomView(8);
    expect(z.size).toBe(BITMAP_SIDE / 8);
    // The view stays inside the picture.
    expect(z.x).toBeGreaterThanOrEqual(0);
    expect(z.y).toBeGreaterThanOrEqual(0);
    expect(z.x + z.size).toBeLessThanOrEqual(BITMAP_SIDE);
    // Below 1 it is shown whole.
    expect(zoomView(0.5)).toEqual(zoomView(1));
  });

  it('bitmap and vector each have uses, advantages and disadvantages', () => {
    for (const side of [BITMAP_VECTOR.bitmap, BITMAP_VECTOR.vector]) {
      expect(side.uses.length).toBeGreaterThan(1);
      expect(side.pros.length).toBeGreaterThan(1);
      expect(side.cons.length).toBeGreaterThan(1);
    }
    expect(BITMAP_VECTOR.bitmap.cons.join(' ')).toMatch(/pixelat/i);
  });
});

describe('G10 (M23) resolution and print size', () => {
  it('a picture prints at its width ÷ dpi inches (× 2.54 for cm)', () => {
    expect(printSize({ width: 3000, height: 1500 }, 300)).toEqual({
      in: { width: 10, height: 5 },
      cm: { width: 25.4, height: 12.7 },
    });
  });

  it('the pixels needed to print a size at a dpi', () => {
    expect(pixelsFor(10, 'in', 300)).toBe(3000);
    expect(pixelsFor(25.4, 'cm', 300)).toBe(3000);
  });

  it('below 150 dpi is too low for print; 300 is photo quality; over 600 is more than a printer shows', () => {
    expect(printVerdict(72).level).toBe('low');
    expect(printVerdict(72).text).toMatch(/blurred|blocky/);
    expect(printVerdict(200).level).toBe('ok');
    expect(printVerdict(300).level).toBe('good');
    expect(printVerdict(1200).level).toBe('high');
    expect(printVerdict(1200).text).toMatch(/larger file/);
  });

  it('on the web: fewer pixels than shown is stretched; more than 4 × is wasted', () => {
    expect(webVerdict(400, 800).level).toBe('low');
    expect(webVerdict(800, 800).level).toBe('good');
    expect(webVerdict(4000, 800).level).toBe('high');
    expect(webVerdict(4000, 800).text).toMatch(/download/);
  });
});

describe('G9 (M23) colour systems', () => {
  it('the same colour as hex, RGB, HSL and CMYK', () => {
    const c = colourCodes('#b40000');
    expect(c.text).toEqual({
      hex: '#B40000',
      rgb: 'RGB 180, 0, 0',
      hsl: 'HSL 0°, 100 %, 35 %',
      cmyk: 'CMYK 0 %, 100 %, 100 %, 29 %',
    });
    expect(c.rgb).toEqual({ r: 180, g: 0, b: 0 });
  });

  it('additive light: red and green make yellow, all three make white', () => {
    const m = additiveMix({ r: 255, g: 255, b: 255 });
    expect(m).toEqual({
      r: '#ff0000',
      g: '#00ff00',
      b: '#0000ff',
      rg: '#ffff00',
      gb: '#00ffff',
      rb: '#ff00ff',
      rgb: '#ffffff',
    });
    expect(additiveMix({ r: 255, g: 128, b: 0 }).rgb).toBe('#ff8000');
  });

  it('subtractive ink: cyan and magenta make blue, all three make (nearly) black', () => {
    const m = subtractiveMix({ c: 100, m: 100, y: 100 });
    expect(m.c).toBe('#00ffff');
    expect(m.cm).toBe('#0000ff');
    expect(m.my).toBe('#ff0000');
    expect(m.cy).toBe('#00ff00');
    expect(m.cmy).toBe('#000000');
    // Magenta ink takes away green: half as much lets half the green through.
    expect(subtractiveMix({ c: 0, m: 50, y: 0 }).m).toBe('#ff80ff');
  });

  it('the hue wheel goes round from red through green and blue', () => {
    const wheel = hueWheel(6);
    expect(wheel).toEqual(['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff']);
  });

  it('a colour matching system: numbered swatches, each with its ink recipe and its screen colour', () => {
    expect(MATCHING_SWATCHES.length).toBeGreaterThanOrEqual(4);
    for (const s of MATCHING_SWATCHES) {
      expect(s.code).toMatch(/\d/);
      expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('GL1 (M23) file formats for a scenario', () => {
  it('every scenario recommends formats of the seven, and says why', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(
      expect.arrayContaining(['web-photo', 'print', 'logo', 'transparency', 'animation']),
    );
    for (const s of SCENARIOS) {
      expect(s.best.length).toBeGreaterThan(0);
      for (const r of [...s.best, ...s.avoid]) {
        expect(GRAPHIC_FORMATS).toContain(r.format);
        expect(r.why.length).toBeGreaterThan(15);
      }
    }
    // Every format is the best answer somewhere.
    const best = new Set(SCENARIOS.flatMap((s) => s.best.map((b) => b.format)));
    for (const f of GRAPHIC_FORMATS) expect(best, f).toContain(f);
  });

  it('a logo is SVG, a web photo JPG, an animation GIF; JPG is never for transparency', () => {
    expect(advise('logo').best[0]!.format).toBe('svg');
    expect(advise('web-photo').best[0]!.format).toBe('jpg');
    expect(advise('animation').best[0]!.format).toBe('gif');
    expect(advise('transparency').avoid.map((a) => a.format)).toContain('jpg');
    expect(advise('transparency').best.every((b) => FORMAT_INFO[b.format].transparency)).toBe(true);
  });
});

describe('GC1 (M23) a reduced copy of the picture', () => {
  it('fits a big picture within a million pixels, keeping its shape; a small one stays', () => {
    expect(fitWithin(4000, 3000, DEMO_MAX_PIXELS)).toEqual({ width: 1154, height: 866 });
    expect(fitWithin(800, 600, DEMO_MAX_PIXELS)).toEqual({ width: 800, height: 600 });
  });

  it('shrinks by averaging the pixels under each new one', () => {
    const image = plain(4, 4, [0, 0, 0, 255]);
    image.data.set([255, 255, 255, 255], 0); // top-left pixel white
    const small = shrink(image, 2, 2);
    expect([small.width, small.height]).toEqual([2, 2]);
    expect([...small.data.slice(0, 4)]).toEqual([64, 64, 64, 255]);
    expect([...small.data.slice(4, 8)]).toEqual([0, 0, 0, 255]);
    expect(shrink(image, 4, 4)).toBe(image);
  });

  it('halves the resolution (at least 1 pixel)', () => {
    const h = halve(gradient(5, 3));
    expect([h.width, h.height]).toEqual([3, 2]);
    expect(halve(plain(1, 1, [1, 2, 3, 255])).width).toBe(1);
  });

  it('crops a part (kept inside the picture)', () => {
    const c = cropImage(gradient(10, 10), { x: 8, y: 8, width: 4, height: 4 });
    expect([c.width, c.height]).toEqual([2, 2]);
    expect(c.data[0]).toBe(gradient(10, 10).data[(8 * 10 + 8) * 4]);
  });
});

describe('GC1 (M23) the difference view', () => {
  it('shows where pixels changed, brighter the more they changed', () => {
    const a = plain(2, 1, [100, 100, 100, 255]);
    const b = plain(2, 1, [100, 100, 100, 255]);
    b.data[0] = 110; // first pixel's red 10 levels more
    const d = difference(a, b);
    expect(d.stats.changed).toBe(0.5);
    expect(d.stats.mean).toBeCloseTo(10 / 6, 5);
    expect(d.stats.most).toBe(10);
    expect(d.image.data[0]).toBe(80); // 10 × 8
    expect(d.image.data[4]).toBe(0);
    expect(d.image.data[7]).toBe(255);
  });

  it('identical pictures have no difference', () => {
    const d = difference(gradient(3, 3), gradient(3, 3));
    expect(d.stats).toEqual({ changed: 0, mean: 0, most: 0 });
  });

  it('pictures of other sizes cannot be compared', () => {
    expect(() => difference(gradient(2, 2), gradient(3, 3))).toThrow(/same size/);
  });
});

describe('GC1 (M23) JPEG quality', () => {
  it('a JPEG at a quality: its size, the picture it opens as, and what was lost', async () => {
    const codec = fakeCodec();
    const r = await jpegAt(gradient(10, 10), 60, codec);
    expect(r.bytes).toBe(60);
    expect(r.quality).toBe(60);
    // Red falls 40 levels everywhere but where there was none (the first column).
    expect(r.diff.stats.changed).toBeCloseTo(0.9, 5);
  });

  it('saved again and again: each save loses more (the quality changed a little each time)', async () => {
    const codec = fakeCodec();
    const steps = vi.fn();
    const g = await generations(
      gradient(20, 20),
      { quality: 80, count: 4, vary: true },
      codec,
      steps,
    );
    expect(g.map((s) => s.generation)).toEqual([1, 2, 3, 4]);
    expect(codec.saves).toEqual([80, 70, 80, 70]);
    for (let i = 1; i < g.length; i++)
      expect(g[i]!.fromOriginal.mean).toBeGreaterThan(g[i - 1]!.fromOriginal.mean);
    expect(steps).toHaveBeenCalledTimes(4);
  });

  it('at the same quality every time', async () => {
    const codec = fakeCodec();
    await generations(gradient(4, 4), { quality: 50, count: 3, vary: false }, codec);
    expect(codec.saves).toEqual([50, 50, 50]);
  });
});

describe('GC1 (M23) the same picture in five formats', () => {
  it('PNG, GIF, BMP and TIFF from the encoders, JPG from the codec, each with its size and whether it is lossless', async () => {
    const encode = vi.fn<BitmapEncoder>(
      async (format) => new Uint8Array(format === 'bmp' ? 300 : 100),
    );
    const rows = await compareFormats(gradient(20, 20), {
      encode,
      codec: fakeCodec(),
      compression: { deflate: async (d) => d, inflate: async (d) => d },
      dpi: 96,
      quality: 80,
    });
    expect(rows.map((r) => r.format)).toEqual(['png', 'gif', 'bmp', 'tiff', 'jpg']);
    expect(rows.map((r) => r.bytes)).toEqual([100, 100, 300, 100, 320]);
    expect(rows.map((r) => r.lossless)).toEqual([true, false, true, true, false]);
    // 400 colours: a GIF's 256 cannot keep them all.
    expect(rows[0]!.raw).toBe(20 * 20 * 3);
    // GIF at 8 bits (256 colours), the others at 24.
    const depths = encode.mock.calls.map((c) => [c[0], c[2].depth]);
    expect(depths).toEqual([
      ['png', 24],
      ['gif', 8],
      ['bmp', 24],
      ['tiff', 24],
    ]);
  });

  it('a writer that fails with something other than an Error is still listed', async () => {
    const rows = await compareFormats(gradient(2, 2), {
      encode: () => Promise.reject('broken'),
      codec: fakeCodec(),
      compression: { deflate: async (d) => d, inflate: async (d) => d },
      dpi: 96,
      quality: 80,
    });
    expect(rows[0]!.problem).toBe('broken');
  });

  it('a format whose writer is not ready (or fails) is listed with why, the others still made', async () => {
    const rows = await compareFormats(gradient(4, 4), {
      encode: async (format) => {
        if (format === 'tiff') throw new Error('Saving as TIFF is not ready yet.');
        return new Uint8Array(10);
      },
      codec: fakeCodec(),
      compression: { deflate: async (d) => d, inflate: async (d) => d },
      dpi: 96,
      quality: 80,
    });
    const tiff = rows.find((r) => r.format === 'tiff')!;
    expect(tiff.bytes).toBeNull();
    expect(tiff.file).toBeNull();
    expect(tiff.problem).toBe('Saving as TIFF is not ready yet.');
    expect(rows.find((r) => r.format === 'png')!.bytes).toBe(10);
    // 16 colours: a GIF keeps every one.
    expect(rows.find((r) => r.format === 'gif')!.lossless).toBe(true);
  });
});

describe('GC1 (M23) colour depth and resolution reduced: the coursebook’s two lossy examples', () => {
  it('24, 8, 4 and 1 bits: 16.7 million, 256, 16 and 2 colours; the uncompressed size falls with the bits', async () => {
    const image = gradient(16, 16);
    const steps = await depthSteps(image, {
      encode: async () => new Uint8Array(42),
      compression: { deflate: async (d) => d, inflate: async (d) => d },
      dpi: 96,
    });
    expect(steps.map((s) => [s.depth, s.colours, s.raw])).toEqual([
      [24, 16_777_216, 768],
      [8, 256, 256],
      [4, 16, 128],
      [1, 2, 32],
    ]);
    expect(steps.every((s) => s.bytes === 42)).toBe(true);
  });

  it('the picture shown is the PNG opened again; if it cannot be opened, the colours reduced here', async () => {
    const opened = plain(16, 16, [1, 2, 3, 255]);
    const steps = await depthSteps(gradient(16, 16), {
      encode: async (_f, _i, o) => new Uint8Array([o.depth]),
      compression: { deflate: async (d) => d, inflate: async (d) => d },
      dpi: 96,
      decode: async (file) => {
        if (file[0] === 1) throw new Error('cannot open');
        return opened;
      },
    });
    expect(steps.slice(0, 3).every((s) => s.image === opened)).toBe(true);
    expect(steps[3]!.image).not.toBe(opened);
    expect(steps[3]!.image.width).toBe(16);
  });

  it('the preview has no more colours than the depth holds', () => {
    const image = gradient(32, 32);
    const count = (img: RgbaImage) => {
      const seen = new Set<number>();
      for (let i = 0; i < img.data.length; i += 4)
        seen.add((img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!);
      return seen.size;
    };
    expect(count(depthPreview(image, 1))).toBeLessThanOrEqual(2);
    expect(count(depthPreview(image, 4))).toBeLessThanOrEqual(16);
    expect(count(depthPreview(image, 8))).toBeLessThanOrEqual(256);
    expect(depthPreview(image, 24)).toBe(image);
  });

  it('with no writer, the depths still show their pictures and uncompressed sizes', async () => {
    const steps = await depthSteps(gradient(4, 4), {
      encode: () => Promise.reject(new Error('Saving as PNG is not ready yet.')),
      compression: { deflate: async (d) => d, inflate: async (d) => d },
      dpi: 96,
    });
    expect(
      steps.every((s) => s.bytes === null && s.problem === 'Saving as PNG is not ready yet.'),
    ).toBe(true);
    expect(steps[3]!.raw).toBe(2);
  });

  it('the resolution halved and halved again: a quarter of the pixels each time, the JPEG smaller', async () => {
    const steps = await resolutionSteps(gradient(40, 20), fakeCodec(), 80);
    expect(steps.map((s) => [s.width, s.height, s.raw, s.bytes])).toEqual([
      [40, 20, 2400, 640],
      [20, 10, 600, 160],
      [10, 5, 150, 40],
    ]);
  });
});

describe('GL1 (M23) bitmap to vector, and image editing and society', () => {
  it('trace explains the advantages and disadvantages and where it is in OneEditor', () => {
    const text = TRACE_TOPICS.flatMap((t) => t.text).join(' ');
    expect(text).toMatch(/advantage/i);
    expect(TRACE_TOPICS.some((t) => /Trace bitmap/.test(t.where ?? ''))).toBe(true);
  });

  it('society covers airbrushing, memes, politics, consent and copyright', () => {
    const text = SOCIETY_TOPICS.map((t) => `${t.title} ${t.text.join(' ')}`)
      .join(' ')
      .toLowerCase();
    for (const word of ['airbrush', 'meme', 'politic', 'consent', 'copyright'])
      expect(text, word).toContain(word);
  });
});
