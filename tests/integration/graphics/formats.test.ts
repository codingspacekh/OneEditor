// M23 / G11, D5 with the bundled FFmpeg, a reader that is not ours: every GIF, BMP, TIFF and
// palette or grey PNG our writers make opens in FFmpeg at its size with the same pixels as our
// readers give; and the BMP, TIFF (not compressed, LZW, PackBits, Deflate) and GIF files FFmpeg
// writes open in our readers with FFmpeg's pixels. Other programs read our files; we read theirs.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GraphicExportOptions } from '../../../src/core/graphics/export.ts';
import { webCompression } from '../../../src/core/image/deflate.ts';
import { decodeBitmap } from '../../../src/core/image/decode/index.ts';
import {
  encodeBitmap,
  encodeOptions,
  type BitmapFormat,
} from '../../../src/core/image/encode/index.ts';
import { bundledFfmpeg, run } from '../helpers/ffmpeg.ts';

const { ffmpeg, ffprobe } = bundledFfmpeg();
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mve-formats-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

/** A 61 × 37 picture: smooth colours, a hard-edged square and a see-through corner. */
function picture() {
  const width = 61;
  const height = 37;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const square = x > 20 && x < 40 && y > 10 && y < 30;
      data[i] = square ? 250 : (x * 255) / width;
      data[i + 1] = square ? 200 : (y * 255) / height;
      data[i + 2] = square ? 10 : 128;
      data[i + 3] = x < 8 && y < 8 ? 0 : 255;
    }
  return { width, height, data };
}

/** FFmpeg's decoding of a file: its size and RGBA pixels. */
async function ffmpegPixels(path: string) {
  const probe = await run(ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    path,
  ]);
  const [width, height] = probe.stdout.trim().split(',').map(Number);
  const raw = join(dir, `${Math.random().toString(36).slice(2)}.rgba`);
  await run(ffmpeg, [
    '-v',
    'error',
    '-i',
    path,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-y',
    raw,
  ]);
  return { width: width!, height: height!, data: new Uint8Array(await readFile(raw)) };
}

/** The largest difference in a colour channel, over the pixels that show in both. */
function colourDifference(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
): number {
  let most = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] === 0 || b[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) most = Math.max(most, Math.abs(a[i + c]! - b[i + c]!));
  }
  return most;
}

const OURS: [BitmapFormat, Omit<GraphicExportOptions, 'format'>, string][] = [
  ['gif', { depth: 8 }, 'gif'],
  ['gif', { depth: 4, dither: false }, 'gif'],
  ['gif', { depth: 1, transparent: false }, 'gif'],
  ['bmp', { depth: 1 }, 'bmp'],
  ['bmp', { depth: 4 }, 'bmp'],
  ['bmp', { depth: 8 }, 'bmp'],
  ['bmp', { depth: 24 }, 'bmp'],
  ['bmp', { depth: 32 }, 'bmp'],
  ['tiff', { depth: 1, palette: 'greys' }, 'tif'],
  ['tiff', { depth: 1 }, 'tif'],
  ['tiff', { depth: 8 }, 'tif'],
  ['tiff', { depth: 8, palette: 'greys', tiff: 'none' }, 'tif'],
  ['tiff', { depth: 24 }, 'tif'],
  ['tiff', { depth: 24, tiff: 'none' }, 'tif'],
  ['tiff', { depth: 32 }, 'tif'],
  ['png', { depth: 1 }, 'png'],
  ['png', { depth: 4, palette: 'greys', transparent: false }, 'png'],
  ['png', { depth: 8 }, 'png'],
  ['png', { depth: 24 }, 'png'],
];

describe('G11 (M23): FFmpeg reads the files our writers make', () => {
  it.each(OURS)('%s %j', async (format, options, extension) => {
    const o = encodeOptions({ format, ...options }, 300);
    const bytes = await encodeBitmap(format, picture(), o, webCompression);
    const path = join(
      dir,
      `ours-${format}-${o.depth}-${Object.values(options).join('-')}.${extension}`,
    );
    await writeFile(path, bytes);
    const theirs = await ffmpegPixels(path);
    const mine = await decodeBitmap(bytes, webCompression);
    expect(theirs).toMatchObject({ width: 61, height: 37 });
    expect(theirs.data.length).toBe(61 * 37 * 4);
    expect(colourDifference(mine.data, theirs.data)).toBeLessThanOrEqual(1);
    // See-through kept where the file can keep it.
    if (o.transparent) expect(theirs.data[3]).toBe(0);
  });
});

describe('G11 (M23): our readers read the files FFmpeg makes', () => {
  const THEIRS: [string, string[]][] = [
    ['plain.bmp', ['-pix_fmt', 'bgr24']],
    ['alpha.bmp', ['-pix_fmt', 'bgra']],
    ['grey.bmp', ['-pix_fmt', 'pal8']],
    ['raw.tif', ['-compression_algo', 'raw', '-pix_fmt', 'rgb24']],
    ['lzw.tif', ['-compression_algo', 'lzw', '-pix_fmt', 'rgba']],
    ['packbits.tif', ['-compression_algo', 'packbits', '-pix_fmt', 'rgb24']],
    ['deflate.tif', ['-compression_algo', 'deflate', '-pix_fmt', 'rgb24']],
    ['grey.tif', ['-compression_algo', 'lzw', '-pix_fmt', 'gray']],
    ['grey16.tif', ['-compression_algo', 'raw', '-pix_fmt', 'gray16be']],
    ['palette.gif', []],
  ];
  it.each(THEIRS)('%s', async (name, args) => {
    const path = join(dir, `ffmpeg-${name}`);
    await run(ffmpeg, [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=54x30:rate=1',
      '-frames:v',
      '1',
      ...args,
      '-y',
      path,
    ]);
    const mine = await decodeBitmap(new Uint8Array(await readFile(path)), webCompression);
    const theirs = await ffmpegPixels(path);
    expect(mine).toMatchObject({ width: 54, height: 30 });
    expect(colourDifference(mine.data, theirs.data)).toBeLessThanOrEqual(1);
  });
});
