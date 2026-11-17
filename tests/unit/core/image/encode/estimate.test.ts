// M23 / GC2, G11: the export dialog's estimate of a file's size — exact for a BMP and a TIFF
// without compression, "about" for the compressed formats, smaller for flat colour than a photo,
// smaller for a JPG at a lower quality; none for vector formats.
import { describe, expect, it } from 'vitest';
import { webCompression } from '../../../../../src/core/image/deflate.ts';
import { estimateFileSize, sizeWords } from '../../../../../src/core/image/encode/estimate.ts';
import { encodeBitmap, encodeOptions } from '../../../../../src/core/image/encode/index.ts';

const size = { width: 101, height: 40 };
const image = { ...size, data: new Uint8ClampedArray(101 * 40 * 4).fill(255) };

describe('GC2 (M23): the estimated file size', () => {
  it.each([1, 4, 8, 24, 32] as const)('a %i-bit BMP: exactly its size', async (depth) => {
    const bytes = await encodeBitmap(
      'bmp',
      image,
      encodeOptions({ format: 'bmp', depth }, 96),
      webCompression,
    );
    expect(estimateFileSize('bmp', size, { depth, photo: true })).toEqual({
      bytes: bytes.length,
      exact: true,
    });
  });

  it('a TIFF without compression is exact (within its header); with LZW it is about', async () => {
    const plain = await encodeBitmap(
      'tiff',
      image,
      encodeOptions({ format: 'tiff', tiff: 'none' }, 96),
      webCompression,
    );
    const guess = estimateFileSize('tiff', size, { depth: 24, tiff: 'none', photo: false })!;
    expect(guess.exact).toBe(true);
    expect(Math.abs(guess.bytes - plain.length)).toBeLessThan(100);
    const lzw = estimateFileSize('tiff', size, { depth: 8, tiff: 'lzw', photo: true })!;
    expect(lzw.exact).toBe(false);
    expect(lzw.bytes).toBeLessThan(
      estimateFileSize('tiff', size, { depth: 24, photo: true })!.bytes,
    );
  });

  it('flat colour compresses more than a photo; a palette is smaller than full colour', () => {
    const photo = estimateFileSize('png', size, { depth: 24, photo: true })!;
    const drawing = estimateFileSize('png', size, { depth: 24, photo: false })!;
    expect(drawing.bytes).toBeLessThan(photo.bytes);
    expect(estimateFileSize('png', size, { depth: 8, photo: true })!.bytes).toBeLessThan(
      photo.bytes,
    );
    expect(estimateFileSize('gif', size, { depth: 8, photo: false })!.exact).toBe(false);
  });

  it('a JPG is smaller at a lower quality; SVG and PDF are not pixels', () => {
    const high = estimateFileSize('jpg', size, { depth: 24, quality: 90, photo: true })!;
    const low = estimateFileSize('jpg', size, { depth: 24, quality: 30, photo: true })!;
    expect(low.bytes).toBeLessThan(high.bytes);
    expect(estimateFileSize('jpg', size, { depth: 24, photo: false })!.bytes).toBeLessThan(
      high.bytes,
    );
    expect(estimateFileSize('svg', size, { depth: 24, photo: false })).toBeNull();
    expect(estimateFileSize('pdf', size, { depth: 24, photo: false })).toBeNull();
  });

  it('in words: bytes, KB, MB; "about" unless exact', () => {
    expect(sizeWords({ bytes: 350, exact: true })).toBe('350 bytes');
    expect(sizeWords({ bytes: 4012, exact: false })).toBe('about 4.0 KB');
    expect(sizeWords({ bytes: 350_400, exact: true })).toBe('350 KB');
    expect(sizeWords({ bytes: 36_000_054, exact: true })).toBe('36.0 MB');
  });
});
