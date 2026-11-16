// M21 (GB1, D9): the papers' photos and pictures as bitmaps in Node, for the Graphics mode
// acceptance tests — a PNG through our own reader (core/image/png.ts), a JPEG (or GIF, BMP,
// WebP) through the bundled FFmpeg as raw RGBA. The papers' files are kept outside the repository
// (Extracted_Tasks_2017-2026/4_Graphics_Editing, or PAPERS_DIR): `hasPapers` says whether they are
// here, so a test can be skipped on a computer without them (CI).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { rasterPng } from '../../../src/core/graphics/mveg.ts';
import {
  bitmapFromRGBA,
  type Bitmap,
  type Raster,
} from '../../../src/core/graphics/pixels/raster.ts';
import { webCompression } from '../../../src/core/image/deflate.ts';
import { jpegDpi } from '../../../src/core/image/dpi.ts';
import { decodePng } from '../../../src/core/image/png.ts';
import { bundledFfmpeg } from '../../integration/helpers/ffmpeg.ts';

const run = promisify(execFile);

/** Where the papers' Graphics editing files are (one folder per session, e.g. 2023_11_November). */
export const PAPERS =
  process.env.PAPERS_DIR ??
  join(homedir(), 'Downloads/exam-paper-batch4/Extracted_Tasks_2017-2026/4_Graphics_Editing');

export const hasPapers = existsSync(PAPERS);

/** A paper's file: paperFile('2023_11_November/Castle.jpg'). */
export const paperFile = (relative: string): string => join(PAPERS, relative);

export interface LoadedPicture {
  bitmap: Bitmap;
  /** The resolution the file gives, if it gives one. */
  dpi?: number;
}

/** A picture file as a bitmap at its own size (not premultiplied RGBA, as the app keeps it). */
export async function loadBitmap(path: string): Promise<LoadedPicture> {
  const bytes = new Uint8Array(await readFile(path));
  if (/\.png$/i.test(path)) {
    const png = await decodePng(bytes, webCompression);
    return {
      bitmap: bitmapFromRGBA(png.width, png.height, png.data),
      ...(png.dpi ? { dpi: png.dpi } : {}),
    };
  }
  const { ffmpeg, ffprobe } = bundledFfmpeg();
  const probe = await run(ffprobe, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0:s=x',
    path,
  ]);
  const [width, height] = probe.stdout.trim().split('x').map(Number) as [number, number];
  const raw = await run(
    ffmpeg,
    ['-v', 'error', '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { encoding: 'buffer', maxBuffer: width * height * 4 + 1024 },
  );
  const data = new Uint8ClampedArray(raw.stdout.buffer, raw.stdout.byteOffset, width * height * 4);
  const dpi = jpegDpi(bytes)?.x;
  return { bitmap: bitmapFromRGBA(width, height, data), ...(dpi ? { dpi } : {}) };
}

/** A bitmap (or mask) saved as a PNG, as the app writes them, to look at or check. */
export async function saveBitmapPng(raster: Raster, path: string): Promise<void> {
  await writeFile(path, await rasterPng(raster, webCompression));
}
