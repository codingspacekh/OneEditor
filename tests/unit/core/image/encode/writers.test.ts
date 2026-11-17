// M23 / G11, G10, D5: our own writers — PNG at 1, 4, 8, 24 and 32 bits, GIF, BMP at 1, 4, 8, 24
// and 32 bits, TIFF not compressed or LZW at 1, 8, 24 and 32 bits — each read back by our readers
// to the pixels (or the palette's nearest colours), with the resolution inside and see-through
// parts kept or put on the background as the format can.
import { describe, expect, it } from 'vitest';
import type { ColourDepth, GraphicExportOptions } from '../../../../../src/core/graphics/export.ts';
import { webCompression } from '../../../../../src/core/image/deflate.ts';
import { pngDpi } from '../../../../../src/core/image/dpi.ts';
import { decodeBitmap } from '../../../../../src/core/image/decode/index.ts';
import {
  encodeBitmap,
  encodeOptions,
  type BitmapFormat,
  type RgbaImage,
} from '../../../../../src/core/image/encode/index.ts';
import { EditError } from '../../../../../src/core/model/errors.ts';

/** A 7 × 5 picture: four flat colours in bands, its top-left pixel see-through, one half see-through. */
function picture(): RgbaImage {
  const width = 7;
  const height = 5;
  const colours = [
    [255, 0, 0],
    [0, 128, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colours[Math.floor((x * 4) / width)]!;
      data.set([r!, g!, b!, 255], (y * width + x) * 4);
    }
  data[3] = 0;
  data[(1 * width + 1) * 4 + 3] = 100; // less than half: see-through in a palette
  return { width, height, data };
}

const px = (d: Uint8ClampedArray, i: number) => [...d.subarray(i * 4, i * 4 + 4)];

async function roundTrip(
  format: BitmapFormat,
  options: Omit<GraphicExportOptions, 'format'> = {},
  image = picture(),
  dpi = 300,
) {
  const o = encodeOptions({ format, ...options }, dpi);
  const bytes = await encodeBitmap(format, image, o, webCompression);
  return { bytes, back: await decodeBitmap(bytes, webCompression), image };
}

describe('G11 (M23): PNG at each colour depth', () => {
  it('32 bits keeps every pixel and its alpha; the resolution inside', async () => {
    const { bytes, back, image } = await roundTrip('png', { depth: 32 });
    expect(back).toMatchObject({ width: 7, height: 5, dpi: 300, format: 'png' });
    expect([...back.data]).toEqual([...image.data]);
    expect(bytes[25]).toBe(6); // RGBA
    expect(pngDpi(bytes)).toEqual({ x: 300, y: 300 });
  });

  it('24 bits: RGB, see-through parts on the background', async () => {
    const { bytes, back } = await roundTrip('png', { depth: 24, background: '#000000' });
    expect(bytes[25]).toBe(2); // RGB
    expect(px(back.data, 0)).toEqual([0, 0, 0, 255]);
    expect(px(back.data, 8)).toEqual([100, 0, 0, 255]); // red at 100 / 255 on black
    expect(px(back.data, 6)).toEqual([255, 255, 0, 255]);
  });

  it('8 bits: a palette (PLTE) with one see-through entry (tRNS)', async () => {
    const { bytes, back } = await roundTrip('png', { depth: 8, dither: false });
    expect(bytes[24]).toBe(8);
    expect(bytes[25]).toBe(3); // palette
    expect(px(back.data, 0)[3]).toBe(0);
    expect(px(back.data, 8)[3]).toBe(0); // under half opaque
    expect(px(back.data, 6)).toEqual([255, 255, 0, 255]);
    expect(px(back.data, 2)).toEqual([0, 128, 0, 255]);
  });

  it('see-through parts on the background when not kept; 4 bits', async () => {
    const { back } = await roundTrip('png', {
      depth: 4,
      transparent: false,
      dither: false,
      background: '#ffffff',
    });
    expect(px(back.data, 0)).toEqual([255, 255, 255, 255]);
    expect(px(back.data, 34)).toEqual([255, 255, 0, 255]);
  });

  it('greys: a greyscale PNG (colour type 0) when nothing is see-through', async () => {
    const { bytes, back } = await roundTrip('png', {
      depth: 4,
      palette: 'greys',
      transparent: false,
      dither: false,
    });
    expect(bytes[25]).toBe(0);
    const [r, g, b] = px(back.data, 6);
    expect(r).toBe(g);
    expect(g).toBe(b);
    // Yellow's brightness (226) to the nearest of 16 greys (17 apart): 221.
    expect(r).toBe(221);
  });

  it('greys with a see-through entry are a palette of greys', async () => {
    const { bytes, back } = await roundTrip('png', { depth: 1, palette: 'greys' });
    expect(bytes[25]).toBe(3);
    expect(px(back.data, 0)[3]).toBe(0);
    // 1 bit with a see-through entry leaves one colour: black.
    expect(px(back.data, 6)).toEqual([0, 0, 0, 255]);
  });

  it('1 bit: two colours, dithered by default', async () => {
    const { back } = await roundTrip('png', { depth: 1, transparent: false });
    const seen = new Set<string>();
    for (let i = 0; i < 35; i++) seen.add(px(back.data, i).join());
    expect(seen.size).toBeLessThanOrEqual(2);
  });
});

describe('G11 (M23): GIF', () => {
  it('8 bits: the colours kept (no more than 256), one see-through colour, no resolution', async () => {
    const { bytes, back } = await roundTrip('gif', { dither: false });
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe('GIF89a');
    expect(bytes[10]! & 7).toBe(7); // a table of 256
    expect(back).toMatchObject({ width: 7, height: 5, format: 'gif' });
    expect(back.dpi).toBeUndefined();
    expect(px(back.data, 0)[3]).toBe(0);
    expect(px(back.data, 6)).toEqual([255, 255, 0, 255]);
    expect(bytes.at(-1)).toBe(0x3b);
  });

  it('no Graphic Control Extension when nothing is see-through; 4 and 1 bits', async () => {
    const four = await roundTrip('gif', { depth: 4, transparent: false });
    expect(four.bytes[10]! & 7).toBe(3);
    expect([...four.bytes].includes(0xf9)).toBe(false);
    expect(px(four.back.data, 0)[3]).toBe(255);
    const one = await roundTrip('gif', { depth: 1, transparent: false, dither: false });
    expect(one.bytes[10]! & 7).toBe(0);
  });

  it('a large busy picture: LZW starts its table again (clear codes) and still reads back', async () => {
    const width = 300;
    const height = 200;
    const data = new Uint8ClampedArray(width * height * 4);
    let seed = 7;
    for (let i = 0; i < data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = seed & 0xe0;
      data[i + 1] = (seed >> 8) & 0xe0;
      data[i + 2] = (seed >> 16) & 0xc0;
      data[i + 3] = 255;
    }
    const { back } = await roundTrip('gif', { dither: false }, { width, height, data });
    // 8 × 8 × 4 = 256 colours: every one kept exactly.
    expect([...back.data]).toEqual([...data]);
  });
});

describe('G11 (M23): BMP', () => {
  const header = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

  it('24 bits (the default): bottom-up rows padded to 4 bytes, pixels a metre for the dpi', async () => {
    const { bytes, back } = await roundTrip('bmp');
    const v = header(bytes);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('BM');
    expect(v.getUint32(2, true)).toBe(bytes.length);
    expect(v.getUint16(28, true)).toBe(24);
    expect(v.getInt32(22, true)).toBe(5); // positive: bottom-up
    expect(v.getInt32(38, true)).toBe(11811); // 300 dpi
    // 7 × 3 = 21 bytes a row, padded to 24.
    expect(bytes.length).toBe(54 + 24 * 5);
    expect(back.dpi).toBe(300);
    expect(px(back.data, 0)).toEqual([255, 255, 255, 255]); // see-through on white
    expect(px(back.data, 34)).toEqual([255, 255, 0, 255]);
  });

  it('32 bits: alpha kept, in a BITMAPV4HEADER with its masks', async () => {
    const { bytes, back, image } = await roundTrip('bmp', { depth: 32 });
    const v = header(bytes);
    expect(v.getUint32(14, true)).toBe(108);
    expect(v.getUint32(30, true)).toBe(3); // BI_BITFIELDS
    expect(v.getUint32(66, true)).toBe(0xff000000);
    expect([...back.data]).toEqual([...image.data]);
  });

  it.each([8, 4, 1] as ColourDepth[])(
    '%i bits: a colour table, the pixels read back',
    async (depth) => {
      const { bytes, back } = await roundTrip('bmp', { depth, dither: false });
      const v = header(bytes);
      expect(v.getUint16(28, true)).toBe(depth);
      expect(v.getUint32(46, true)).toBe(2 ** depth);
      expect(back).toMatchObject({ width: 7, height: 5 });
      if (depth >= 4) expect(px(back.data, 6)).toEqual([255, 255, 0, 255]);
    },
  );
});

describe('G11 (M23): TIFF', () => {
  it.each([
    [24, 'lzw'],
    [24, 'none'],
    [32, 'lzw'],
    [32, 'none'],
  ] as const)('%i bits, %s: every pixel kept, the resolution inside', async (depth, tiff) => {
    const { bytes, back, image } = await roundTrip('tiff', { depth, tiff });
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('II');
    expect(back).toMatchObject({ width: 7, height: 5, dpi: 300, format: 'tiff' });
    if (depth === 32) expect([...back.data]).toEqual([...image.data]);
    else {
      expect(px(back.data, 0)).toEqual([255, 255, 255, 255]);
      expect(px(back.data, 34)).toEqual([255, 255, 0, 255]);
    }
  });

  it('8 bits: a ColorMap palette, or greys', async () => {
    const colours = await roundTrip('tiff', { depth: 8, dither: false });
    expect(px(colours.back.data, 6)).toEqual([255, 255, 0, 255]);
    const greys = await roundTrip('tiff', { depth: 8, palette: 'greys', tiff: 'none' });
    const [r, g, b] = px(greys.back.data, 6);
    expect([r, g]).toEqual([b, b]);
  });

  it('1 bit: black and white, or two colours', async () => {
    const bw = await roundTrip('tiff', { depth: 1, palette: 'greys', dither: false });
    for (let i = 0; i < 35; i++) expect([0, 255]).toContain(px(bw.back.data, i)[0]);
    const two = await roundTrip('tiff', { depth: 1, tiff: 'none', dither: false });
    expect(two.back).toMatchObject({ width: 7, height: 5 });
  });

  it('a tall picture in several strips', async () => {
    const width = 200;
    const height = 400; // 200 × 3 = 600 bytes a row: 109 rows a strip
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set([i % 251, (i >> 8) % 256, 9, 255], i);
    const { back } = await roundTrip('tiff', { depth: 24 }, { width, height, data });
    expect([...back.data]).toEqual([...data]);
  });
});

describe('G11 (M23): encodeBitmap refuses what cannot be written', () => {
  it('refuses a picture of no pixels, or pixels that do not fill it', async () => {
    const o = encodeOptions({ format: 'bmp' }, 72);
    await expect(
      encodeBitmap(
        'bmp',
        { width: 0, height: 1, data: new Uint8ClampedArray() },
        o,
        webCompression,
      ),
    ).rejects.toThrow(EditError);
    await expect(
      encodeBitmap(
        'bmp',
        { width: 2, height: 2, data: new Uint8ClampedArray(4) },
        o,
        webCompression,
      ),
    ).rejects.toThrow(/do not fill/);
  });

  it('an image all see-through still has a colour in its palette', async () => {
    const { back } = await roundTrip(
      'gif',
      {},
      {
        width: 2,
        height: 1,
        data: new Uint8ClampedArray(8),
      },
    );
    expect(px(back.data, 0)[3]).toBe(0);
  });
});
