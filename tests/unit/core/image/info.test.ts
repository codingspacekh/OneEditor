// GL2 (M23): the facts of a picture file a task asks about — its format (by what is inside, not
// its name), pixel size, dpi and printed size, colour depth, see-through pixels, a JPEG's quality,
// a GIF's frames, an SVG's units, viewBox and bitmaps, a PDF's page — read from the bytes.
import { describe, expect, it } from 'vitest';
import { imageFacts } from '../../../../src/core/image/info.ts';
import { webCompression } from '../../../../src/core/image/deflate.ts';
import { encodePng } from '../../../../src/core/image/png.ts';
import { EditError } from '../../../../src/core/model/errors.ts';
import {
  bmpFile,
  gifFile,
  ijgTable,
  jpegFile,
  pngFile,
  text,
  tiffFile,
  tiffLzw,
  zlib,
} from '../../../helpers/image-files.ts';

const rgba = (w: number, h: number, alpha: (i: number) => number) =>
  new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? alpha(i >> 2) : 200));

describe('GL2 (M23) PNG facts', () => {
  it('pixel size, dpi, printed size and 32-bit depth; a see-through pixel is found', async () => {
    const png = await encodePng(
      { width: 1181, height: 709, channels: 4, data: rgba(1181, 709, (i) => (i === 5 ? 0 : 255)) },
      webCompression,
      { dpi: 300 },
    );
    const f = await imageFacts(png, 'Chip.png');
    expect(f).toMatchObject({
      format: 'png',
      kind: 'bitmap',
      extension: 'png',
      width: 1181,
      height: 709,
      dpi: { x: 300, y: 300 },
      depth: 32,
      seeThrough: 'used',
      sizeBytes: png.length,
    });
    expect(f.extensionSays).toBeUndefined();
    expect(f.print!.widthCm).toBeCloseTo(10, 1);
    expect(f.print!.heightCm).toBeCloseTo(6, 1);
    expect(f.print!.widthIn).toBeCloseTo(1181 / 300, 3);
    expect(f.print!.from).toBe('dpi');
  });

  it('an alpha channel with every pixel solid holds no see-through pixel; grey is 8 bits; no dpi, no printed size', async () => {
    const solid = await encodePng(
      { width: 4, height: 3, channels: 4, data: rgba(4, 3, () => 255) },
      webCompression,
    );
    expect(await imageFacts(solid, 'a.png')).toMatchObject({ seeThrough: 'unused', depth: 32 });
    const grey = await encodePng(
      { width: 2, height: 2, channels: 1, data: new Uint8Array(4) },
      webCompression,
    );
    const g = await imageFacts(grey, 'mask.png');
    expect(g).toMatchObject({ depth: 8, grey: true, seeThrough: 'none' });
    expect(g.dpi).toBeUndefined();
    expect(g.print).toBeUndefined();
  });

  it('a damaged PNG is refused in words', async () => {
    const png = await encodePng(
      { width: 2, height: 2, channels: 4, data: rgba(2, 2, () => 0) },
      webCompression,
    );
    png[png.length - 20] = png[png.length - 20]! ^ 0xff; // inside the image data: its check no longer matches
    await expect(imageFacts(png, 'x.png')).rejects.toThrow(EditError);
  });
});

describe('GL2 (M23) the format is read from what is inside, not the name', () => {
  it('a JPEG named .png is a JPEG, and the name is said to disagree', async () => {
    const f = await imageFacts(jpegFile({ width: 8, height: 8, table: ijgTable(75) }), 'Logo.png');
    expect(f).toMatchObject({ format: 'jpg', extension: 'png', extensionSays: 'png' });
  });

  it('a .jpeg and a .tif are the names of a JPG and a TIFF; no extension says nothing', async () => {
    const jpg = jpegFile({ width: 8, height: 8, table: ijgTable(75) });
    expect((await imageFacts(jpg, 'photo.JPEG')).extensionSays).toBeUndefined();
    expect((await imageFacts(jpg, 'photo')).extension).toBe('');
    const tif = tiffFile({ width: 1, height: 1, bitsPerSample: [8], photometric: 1, strip: [9] });
    expect(await imageFacts(tif, 'scan.tif')).toMatchObject({ format: 'tiff' });
    expect((await imageFacts(tif, 'scan.tif')).extensionSays).toBeUndefined();
  });

  it('a file that is none of the seven is refused', async () => {
    await expect(imageFacts(text('hello'), 'notes.txt')).rejects.toThrow(
      /not a PNG, JPG, GIF, BMP, TIFF, SVG or PDF/,
    );
    await expect(imageFacts(new Uint8Array(), 'empty.png')).rejects.toThrow(EditError);
  });
});

describe('GL2 (M23) JPEG facts', () => {
  it('size, 24-bit colour, JFIF dpi and the quality its table was made at (libjpeg scaling)', async () => {
    for (const q of [10, 50, 75, 90, 100]) {
      const f = await imageFacts(
        jpegFile({
          width: 3744,
          height: 2104,
          table: ijgTable(q),
          jfif: { units: 1, x: 180, y: 180 },
        }),
        'Heron.jpg',
      );
      expect(f).toMatchObject({
        format: 'jpg',
        width: 3744,
        height: 2104,
        depth: 24,
        dpi: { x: 180, y: 180 },
        seeThrough: 'none',
        jpeg: { quality: q, exact: true, progressive: false },
      });
    }
  });

  it('a table made another way gets the nearest quality, marked as not exact', async () => {
    const table = ijgTable(80).map((v, i) => (i % 2 ? v + 1 : v));
    const f = await imageFacts(jpegFile({ width: 8, height: 8, table }), 'x.jpg');
    expect(f.jpeg!.exact).toBe(false);
    expect(Math.abs(f.jpeg!.quality - 79)).toBeLessThanOrEqual(2);
  });

  it('dots a centimetre, an Exif resolution, a grey JPEG, a progressive one; density units 0 give no dpi', async () => {
    const cm = await imageFacts(
      jpegFile({ width: 8, height: 8, table: ijgTable(75), jfif: { units: 2, x: 118, y: 118 } }),
      'a.jpg',
    );
    expect(cm.dpi).toEqual({ x: 300, y: 300 });
    const exif = await imageFacts(
      jpegFile({ width: 8, height: 8, table: ijgTable(75), exifDpi: 200 }),
      'b.jpg',
    );
    expect(exif.dpi).toEqual({ x: 200, y: 200 });
    const grey = await imageFacts(
      jpegFile({ width: 8, height: 8, table: ijgTable(75), components: 1, progressive: true }),
      'c.jpg',
    );
    expect(grey).toMatchObject({ depth: 8, grey: true, jpeg: { progressive: true } });
    const aspect = await imageFacts(
      jpegFile({ width: 8, height: 8, table: ijgTable(75), jfif: { units: 0, x: 1, y: 1 } }),
      'd.jpg',
    );
    expect(aspect.dpi).toBeUndefined();
  });
});

describe('GL2 (M23) GIF facts', () => {
  const palette = [0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 255, 0];

  it('a palette of 4 colours is 2 bits; a see-through index that is used, and one that is not', async () => {
    const pixels = Array.from({ length: 64 }, (_, i) => i % 3);
    const used = gifFile({
      width: 8,
      height: 8,
      palette,
      frames: [{ indices: pixels, transparent: 2 }],
    });
    expect(await imageFacts(used, 'logo.gif')).toMatchObject({
      format: 'gif',
      width: 8,
      height: 8,
      depth: 2,
      palette: 4,
      seeThrough: 'used',
      gif: { frames: 1, loop: false },
    });
    const unused = gifFile({
      width: 8,
      height: 8,
      palette,
      frames: [{ indices: pixels, transparent: 3 }],
    });
    expect((await imageFacts(unused, 'logo.gif')).seeThrough).toBe('unused');
    const none = gifFile({ width: 8, height: 8, palette, frames: [{ indices: pixels }] });
    expect((await imageFacts(none, 'logo.gif')).seeThrough).toBe('none');
  });

  it('a long picture (the LZW table fills and starts again) is read to its end', async () => {
    const w = 200;
    const h = 120;
    const pixels = Array.from({ length: w * h }, (_, i) => ((i * 7919) >> 3) % 4);
    pixels[w * h - 1] = 3;
    const gif = gifFile({
      width: w,
      height: h,
      palette,
      frames: [{ indices: pixels, transparent: 3 }],
    });
    expect((await imageFacts(gif, 'big.gif')).seeThrough).toBe('used');
    const never = pixels.map((p) => (p === 3 ? 1 : p));
    const gif2 = gifFile({
      width: w,
      height: h,
      palette,
      frames: [{ indices: never, transparent: 3 }],
    });
    expect((await imageFacts(gif2, 'big.gif')).seeThrough).toBe('unused');
  });

  it("a later frame's see-through colour keeps the frame before: not see-through; a first frame smaller than the picture is", async () => {
    const solid = { indices: Array(16).fill(1) };
    const keep = { indices: Array(16).fill(2), transparent: 2 };
    const gif = gifFile({ width: 4, height: 4, palette, frames: [solid, keep] });
    expect((await imageFacts(gif, 'anim.gif')).seeThrough).toBe('unused');
    const small = gifFile({
      width: 4,
      height: 4,
      palette,
      frames: [{ indices: [1, 1, 1, 1], width: 2, height: 2 }],
    });
    expect((await imageFacts(small, 'small.gif')).seeThrough).toBe('used');
  });

  it('frames, their times and looping: an animated GIF of 3 frames at 4/100 s that loops', async () => {
    const frame = { indices: Array(16).fill(1), delay: 4 };
    const gif = gifFile({
      width: 4,
      height: 4,
      palette,
      frames: [frame, frame, frame],
      loop: true,
    });
    const f = await imageFacts(gif, 'spin.gif');
    expect(f.gif).toEqual({ frames: 3, loop: true, duration: 0.12 });
  });

  it('a frame with a palette of its own (256 colours: 8 bits)', async () => {
    const local = Array.from({ length: 256 * 3 }, (_, i) => i % 256);
    const gif = gifFile({ width: 2, height: 1, frames: [{ indices: [0, 255], local }] });
    expect(await imageFacts(gif, 'x.gif')).toMatchObject({ depth: 8, palette: 256 });
  });
});

describe('GL2 (M23) BMP facts', () => {
  it('24-bit: size, dpi, no see-through pixels', async () => {
    const bmp = bmpFile({ width: 2, height: 1, bits: 24, rows: [[1, 2, 3, 4, 5, 6]], dpi: 96 });
    expect(await imageFacts(bmp, 'scan.bmp')).toMatchObject({
      format: 'bmp',
      width: 2,
      height: 1,
      depth: 24,
      dpi: { x: 96, y: 96 },
      seeThrough: 'none',
      compression: 'none',
    });
  });

  it('8-bit with a palette of 4 colours; a top-down BMP has a positive height', async () => {
    const bmp = bmpFile({
      width: 3,
      height: 2,
      bits: 8,
      rows: [
        [0, 1, 2],
        [3, 0, 1],
      ],
      palette: Array(16).fill(0),
      topDown: true,
    });
    expect(await imageFacts(bmp, 'x.bmp')).toMatchObject({ depth: 8, palette: 4, height: 2 });
  });

  it('32-bit with an alpha mask: a see-through pixel is found, or every pixel is solid', async () => {
    const see = bmpFile({
      width: 2,
      height: 1,
      bits: 32,
      rows: [[1, 2, 3, 255, 1, 2, 3, 0]],
      alphaMask: 0xff000000,
    });
    expect(await imageFacts(see, 'a.bmp')).toMatchObject({ depth: 32, seeThrough: 'used' });
    const solid = bmpFile({
      width: 2,
      height: 1,
      bits: 32,
      rows: [[1, 2, 3, 255, 1, 2, 3, 255]],
      alphaMask: 0xff000000,
    });
    expect((await imageFacts(solid, 'a.bmp')).seeThrough).toBe('unused');
  });

  it('32-bit without a mask: a fourth byte of 0 everywhere is unused, not see-through', async () => {
    const zero = bmpFile({ width: 2, height: 1, bits: 32, rows: [[1, 2, 3, 0, 1, 2, 3, 0]] });
    expect((await imageFacts(zero, 'a.bmp')).seeThrough).toBe('none');
    const mixed = bmpFile({ width: 2, height: 1, bits: 32, rows: [[1, 2, 3, 255, 1, 2, 3, 9]] });
    expect((await imageFacts(mixed, 'a.bmp')).seeThrough).toBe('used');
  });
});

describe('GL2 (M23) TIFF facts', () => {
  it('24-bit RGB, dpi (in inches or cm), not compressed; no alpha channel', async () => {
    const tif = tiffFile({
      width: 2,
      height: 1,
      bitsPerSample: [8, 8, 8],
      photometric: 2,
      strip: [1, 2, 3, 4, 5, 6],
      dpi: 300,
    });
    expect(await imageFacts(tif, 'print.tif')).toMatchObject({
      format: 'tiff',
      width: 2,
      height: 1,
      depth: 24,
      dpi: { x: 300, y: 300 },
      seeThrough: 'none',
      compression: 'none',
    });
    const cm = tiffFile({
      ...{ width: 1, height: 1, bitsPerSample: [8], photometric: 1 },
      strip: [0],
      dpi: 118,
      unit: 3,
    });
    expect((await imageFacts(cm, 'a.tif')).dpi).toEqual({ x: 300, y: 300 });
  });

  it('32-bit with an alpha channel: see-through pixels found, also through LZW and the predictor', async () => {
    const pixels = [9, 9, 9, 255, 9, 9, 9, 128];
    const plain = tiffFile({
      width: 2,
      height: 1,
      bitsPerSample: [8, 8, 8, 8],
      photometric: 2,
      strip: pixels,
      extraSamples: [2],
    });
    expect(await imageFacts(plain, 'a.tif')).toMatchObject({ depth: 32, seeThrough: 'used' });
    const lzw = tiffFile({
      width: 2,
      height: 1,
      bitsPerSample: [8, 8, 8, 8],
      photometric: 2,
      strip: tiffLzw(pixels),
      compression: 5,
      extraSamples: [1],
      bigEndian: true,
    });
    expect(await imageFacts(lzw, 'a.tif')).toMatchObject({
      seeThrough: 'used',
      compression: 'LZW',
    });
    // Horizontal differencing: the second alpha is stored as 0 (255 − 255): solid.
    const predicted = tiffFile({
      width: 2,
      height: 1,
      bitsPerSample: [8, 8, 8, 8],
      photometric: 2,
      strip: tiffLzw([9, 9, 9, 255, 0, 0, 0, 0]),
      compression: 5,
      predictor: 2,
      extraSamples: [2],
    });
    expect((await imageFacts(predicted, 'a.tif')).seeThrough).toBe('unused');
  });

  it('a long LZW strip (codes grow to 12 bits and the table starts again) is read whole', async () => {
    const w = 300;
    const h = 40;
    const pixels: number[] = [];
    for (let i = 0; i < w * h; i++) pixels.push((i * 31) & 255, (i * 17) & 255, i & 255, 255);
    pixels[pixels.length - 1] = 7;
    const tif = tiffFile({
      width: w,
      height: h,
      bitsPerSample: [8, 8, 8, 8],
      photometric: 2,
      strip: tiffLzw(pixels),
      compression: 5,
      extraSamples: [2],
    });
    expect((await imageFacts(tif, 'a.tif')).seeThrough).toBe('used');
  });

  it('a palette TIFF (8 bits, 256 colours); a 1-bit one; a compression not read says "can hold"', async () => {
    const pal = tiffFile({
      width: 1,
      height: 1,
      bitsPerSample: [8],
      photometric: 3,
      strip: [0],
      colourMap: Array(768).fill(0),
    });
    expect(await imageFacts(pal, 'a.tif')).toMatchObject({ depth: 8, palette: 256 });
    const bw = tiffFile({ width: 8, height: 1, bitsPerSample: [1], photometric: 0, strip: [0] });
    expect(await imageFacts(bw, 'a.tif')).toMatchObject({ depth: 1, grey: true });
    const jpegInside = tiffFile({
      width: 1,
      height: 1,
      bitsPerSample: [8, 8, 8, 8],
      photometric: 2,
      strip: [0],
      compression: 7,
      extraSamples: [2],
    });
    expect((await imageFacts(jpegInside, 'a.tif')).seeThrough).toBe('possible');
  });
});

describe('GL2 (M23) SVG facts: units, viewBox, and bitmaps inside ("must not contain bitmap elements")', () => {
  it('width and height with their units, the viewBox, the printed size; no bitmaps', async () => {
    const svg = text(
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10cm" height="5cm" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>',
    );
    const f = await imageFacts(svg, 'Logo.svg');
    expect(f).toMatchObject({
      format: 'svg',
      kind: 'vector',
      svg: { width: '10cm', height: '5cm', unit: 'cm', viewBox: '0 0 100 50', bitmaps: 0 },
      seeThrough: 'possible',
    });
    expect(f.print!.widthCm).toBeCloseTo(10, 5);
    expect(f.print!.heightCm).toBeCloseTo(5, 5);
    expect(f.print!.from).toBe('units');
    expect(f.width).toBeCloseTo(377.95, 1);
    expect(f.depth).toBeUndefined();
  });

  it("the paper's ChipLeg.svg form: numbers without units are px, at 96 an inch", async () => {
    const f = await imageFacts(
      text(
        '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="77.44" height="240"></svg>',
      ),
      'ChipLeg.svg',
    );
    expect(f).toMatchObject({ width: 77.44, height: 240, svg: { unit: 'px' } });
    expect(f.svg!.viewBox).toBeUndefined();
    expect(f.print!.from).toBe('css');
    expect(f.print!.heightCm).toBeCloseTo((240 / 96) * 2.54, 5);
  });

  it('counts <image> elements, a data:image in a style and a pattern filled with a picture', async () => {
    const svg =
      text(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">
      <defs><pattern id="p"><image xlink:href="data:image/png;base64,AAAA" width="5" height="5"/></pattern></defs>
      <svg:image href="photo.jpg"/>
      <rect style="fill: url('data:image/png;base64,BBBB')"/>
      <filter><feImage href="x.png"/></filter>
    </svg>`);
    const f = await imageFacts(svg, 'x.svg');
    expect(f.svg!.bitmaps).toBe(4);
    expect(f.width).toBe(10);
  });
});

describe('GL2 (M23) PDF facts', () => {
  const pdf = (body: string) => text(`%PDF-1.7\n${body}\n%%EOF`);

  it('the page size in pt and cm, the pages, and pictures inside', async () => {
    const f = await imageFacts(
      pdf(
        '1 0 obj << /Type /Pages /Kids [2 0 R] /Count 1 >> endobj\n2 0 obj << /Type /Page /MediaBox [0 0 283.46 141.73] >> endobj\n3 0 obj << /Type /XObject /Subtype /Image /Width 4 >> endobj',
      ),
      'Poster.pdf',
    );
    expect(f).toMatchObject({ format: 'pdf', kind: 'vector', seeThrough: 'none' });
    expect(f.pdf).toMatchObject({ pages: 1, bitmaps: 1 });
    expect(f.pdf!.widthPt).toBeCloseTo(283.46, 2);
    expect(f.print!.widthCm).toBeCloseTo(10, 2);
    expect(f.print!.heightCm).toBeCloseTo(5, 2);
    expect(f.print!.from).toBe('page');
  });

  it('none; and with compressed object streams it cannot tell', async () => {
    const plain = await imageFacts(pdf('<</Type/Page/MediaBox[0 0 595 842]>>'), 'a.pdf');
    expect(plain.pdf).toMatchObject({ pages: 1, bitmaps: 0, widthPt: 595, heightPt: 842 });
    const hidden = await imageFacts(pdf('<</Type/ObjStm/N 3>> stream x endstream'), 'b.pdf');
    expect(hidden.pdf!.bitmaps).toBeNull();
    expect(hidden.print).toBeUndefined();
  });
});

describe('GL2 (M23) unusual and damaged files', () => {
  const damaged = (bytes: Uint8Array | number[], name: string) =>
    expect(
      imageFacts(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), name),
    ).rejects.toThrow(EditError);

  it('a palette PNG with a see-through entry (tRNS), used or not; an interlaced one is not looked at', async () => {
    const palette = [255, 0, 0, 0, 0, 255];
    const used = pngFile({
      width: 2,
      height: 1,
      depth: 8,
      type: 3,
      rows: [[0, 1]],
      palette,
      trns: [0],
    });
    expect(await imageFacts(used, 'a.png')).toMatchObject({
      depth: 8,
      palette: 2,
      seeThrough: 'used',
    });
    const unused = pngFile({
      width: 2,
      height: 1,
      depth: 8,
      type: 3,
      rows: [[1, 1]],
      palette,
      trns: [0],
    });
    expect((await imageFacts(unused, 'a.png')).seeThrough).toBe('unused');
    const interlaced = pngFile({
      width: 1,
      height: 1,
      depth: 8,
      type: 6,
      rows: [[1, 2, 3, 4]],
      interlaced: true,
    });
    expect((await imageFacts(interlaced, 'a.png')).seeThrough).toBe('possible');
    const rgb16 = pngFile({ width: 1, height: 1, depth: 16, type: 2, rows: [[0, 1, 0, 2, 0, 3]] });
    expect(await imageFacts(rgb16, 'a.png')).toMatchObject({ depth: 48, seeThrough: 'none' });
    await damaged(used.subarray(0, 30), 'a.png');
  });

  it('an SVG with a byte-order mark; a PDF after a few other bytes; an SVG with only a width', async () => {
    const bom = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...text('<svg width="2in" viewBox="0 0 2 1"></svg>'),
    ]);
    const f = await imageFacts(bom, 'a.svg');
    expect(f.format).toBe('svg');
    expect(f.print).toMatchObject({ from: 'units' });
    expect(f.print!.widthCm).toBeCloseTo(5.08, 5);
    expect(f.print!.heightCm).toBeCloseTo(2.54, 5);
    const tall = await imageFacts(text('<svg height="1in" viewBox="0 0 2 1"></svg>'), 'b.svg');
    expect(tall.print!.widthCm).toBeCloseTo(5.08, 5);
    const pdf = await imageFacts(
      new Uint8Array([0, 0, ...text('%PDF-1.4 <</Type /Page>>')]),
      'c.pdf',
    );
    expect(pdf).toMatchObject({ format: 'pdf', pdf: { pages: 1, bitmaps: 0 } });
    expect(pdf.print).toBeUndefined();
    await damaged(text('<html><body>no svg</body></html> <svg'), 'd.svg');
  });

  it('a TIFF in PackBits or deflate with alpha; a damaged deflate strip; no resolution unit; damaged', async () => {
    const tiff = (strip: number[], compression: number) =>
      tiffFile({
        width: 2,
        height: 1,
        bitsPerSample: [8, 8, 8, 8],
        photometric: 2,
        strip,
        compression,
        extraSamples: [1],
        dpi: 72,
      });
    // PackBits: a run of three 9s, one literal 255, a run of three 9s, one literal 0; a no-op (-128).
    const packed = tiff([254, 9, 0, 255, 128, 254, 9, 0, 0], 32773);
    expect(await imageFacts(packed, 'a.tif')).toMatchObject({
      seeThrough: 'used',
      compression: 'PackBits',
    });
    const deflated = tiff(zlib([9, 9, 9, 255, 9, 9, 9, 255]), 8);
    expect(await imageFacts(deflated, 'a.tif')).toMatchObject({
      seeThrough: 'unused',
      compression: 'deflate (ZIP)',
    });
    await damaged(tiff([1, 2, 3, 4], 8), 'a.tif');
    const noUnit = tiffFile({
      width: 1,
      height: 1,
      bitsPerSample: [8],
      photometric: 1,
      strip: [0],
      dpi: 72,
      unit: 1 as 2,
    });
    expect((await imageFacts(noUnit, 'a.tif')).dpi).toBeUndefined();
    await damaged([0x49, 0x49, 42, 0, 8, 0, 0, 0, 0, 0], 'a.tif');
    await damaged([0x49, 0x49, 42, 0, 200, 0, 0, 0], 'a.tif');
    const odd = tiffFile({
      width: 1,
      height: 1,
      bitsPerSample: [8],
      photometric: 1,
      strip: [0],
      compression: 99,
    });
    expect((await imageFacts(odd, 'a.tif')).compression).toBe('type 99');
  });

  it('BMP: the old OS/2 header, run-length compression, damaged ones', async () => {
    const os2 = [
      ...text('BM'),
      ...[30, 0, 0, 0, 0, 0, 0, 0, 26, 0, 0, 0],
      ...[12, 0, 0, 0, 3, 0, 2, 0, 1, 0, 24, 0],
    ];
    expect(await imageFacts(new Uint8Array(os2), 'a.bmp')).toMatchObject({
      width: 3,
      height: 2,
      depth: 24,
      seeThrough: 'none',
    });
    const os2pal = [...os2.slice(0, 24), 8, 0];
    expect(await imageFacts(new Uint8Array(os2pal), 'a.bmp')).toMatchObject({
      depth: 8,
      palette: 256,
    });
    const rle = bmpFile({ width: 1, height: 1, bits: 8, rows: [[0]], palette: [0, 0, 0, 0] });
    rle[30] = 1;
    expect((await imageFacts(rle, 'a.bmp')).compression).toBe('RLE (8-bit)');
    rle[30] = 9;
    expect((await imageFacts(rle, 'a.bmp')).compression).toBe('type 9');
    const bad = bmpFile({ width: 1, height: 1, bits: 24, rows: [[0, 0, 0]] });
    bad[28] = 7;
    await damaged(bad, 'a.bmp');
    const short = bmpFile({ width: 2, height: 1, bits: 32, rows: [[1, 2, 3, 0, 1, 2, 3, 0]] });
    await damaged(short.subarray(0, short.length - 4), 'a.bmp');
    await damaged([...text('BM'), ...Array(30).fill(0)], 'a.bmp');
  });

  it('JPEG: fill bytes, a 16-bit table, restart markers; damaged ones', async () => {
    const jpg = jpegFile({ width: 8, height: 8, table: ijgTable(50) });
    // Fill bytes and a lone restart marker before the first segment.
    const filled = new Uint8Array([0xff, 0xd8, 0xff, 0xff, 0xd0, ...jpg.subarray(2)]);
    expect((await imageFacts(filled, 'a.jpg')).jpeg!.quality).toBe(50);
    const wide = [0xff, 0xd8, 0xff, 0xdb, 0, 131, 0x10, ...ijgTable(50).flatMap((v) => [0, v])];
    const sixteen = new Uint8Array([...wide, ...jpg.subarray(2 + 69)]);
    expect((await imageFacts(sixteen, 'a.jpg')).jpeg).toMatchObject({ quality: 50, exact: true });
    await damaged([0xff, 0xd8, 0xff, 0xd9], 'a.jpg');
    await damaged([0xff, 0xd8, 0xff, 0xe0, 0, 1, 0, 0], 'a.jpg');
    await damaged([0xff, 0xd8, 0xff, 0xe0, 0, 99, 0, 0], 'a.jpg');
    await damaged([0xff, 0xd8, 0xff, 0x00, 0x12, 0, 0, 0, 0, 0], 'a.jpg');
  });

  it('GIF: a comment block is passed over; damaged ones', async () => {
    const gif = gifFile({
      width: 1,
      height: 1,
      palette: [0, 0, 0, 9, 9, 9],
      frames: [{ indices: [1] }],
    });
    const commented = new Uint8Array([
      ...gif.subarray(0, 19),
      0x21,
      0xfe,
      2,
      104,
      105,
      0,
      ...gif.subarray(19),
    ]);
    expect(await imageFacts(commented, 'a.gif')).toMatchObject({ width: 1, gif: { frames: 1 } });
    await damaged(gif.subarray(0, 10), 'a.gif');
    await damaged([...gif.subarray(0, 19), 0x99], 'a.gif');
    await damaged([...gif.subarray(0, 19), 0x3b], 'a.gif');
    await damaged([...gif.subarray(0, 19), 0x2c, 0, 0], 'a.gif');
  });

  it('GIF LZW that is damaged (a code not yet in the table, a first code that is not a colour) stops', async () => {
    const head = gifFile({
      width: 2,
      height: 2,
      palette: [0, 0, 0, 9, 9, 9],
      frames: [] as never[],
    });
    const frame = (data: number[]) =>
      new Uint8Array([
        ...head.subarray(0, head.length - 1),
        0x21,
        0xf9,
        4,
        1,
        0,
        0,
        1,
        0,
        0x2c,
        0,
        0,
        0,
        0,
        2,
        0,
        2,
        0,
        0,
        2,
        data.length,
        ...data,
        0,
        0x3b,
      ]);
    // Codes of 3 bits: clear (4), then 7 (not yet in the table).
    expect((await imageFacts(frame([0b111100]), 'a.gif')).seeThrough).toBe('unused');
    // Clear, then 5 (the end code) at once; then a first code of 6.
    expect((await imageFacts(frame([0b101100]), 'a.gif')).seeThrough).toBe('unused');
    expect((await imageFacts(frame([0b110100]), 'a.gif')).seeThrough).toBe('unused');
  });
});
