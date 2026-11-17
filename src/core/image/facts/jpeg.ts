// GL2 (M23): a JPEG's facts from its headers — size and depth (SOF), dpi (JFIF, or Exif as a
// camera writes it), progressive or not, and its quality. A JPEG keeps no "quality" number: the
// quality slider only scales the quantisation tables. Nearly every program (libjpeg, so the
// browsers, the canvas, GIMP, phones) scales the standard luminance table the same way, so the
// quality whose table is nearest the file's is the estimate; exact when it is the very table.
import { EditError } from '../../model/errors.ts';
import { jpegDpi } from '../dpi.ts';
import { tiffTags } from './tiff.ts';
import type { Found } from './types.ts';

const DAMAGED = 'This JPEG file is damaged.';

/** libjpeg's standard luminance table (ITU T.81 Annex K), in the zigzag order a file keeps. */
const LUMINANCE = [
  16, 11, 12, 14, 12, 10, 16, 14, 13, 14, 18, 17, 16, 19, 24, 40, 26, 24, 22, 22, 24, 49, 35, 37,
  29, 40, 58, 51, 61, 60, 57, 51, 56, 55, 64, 72, 92, 78, 64, 68, 87, 69, 55, 56, 80, 109, 81, 87,
  95, 98, 103, 104, 103, 62, 77, 113, 121, 112, 100, 120, 92, 101, 103, 99,
];

/** The table libjpeg makes at `quality` (jpeg_quality_scaling, kept to 8 bits as baseline does). */
function scaled(quality: number): number[] {
  const scale = quality < 50 ? Math.floor(5000 / quality) : 200 - quality * 2;
  return LUMINANCE.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));
}

/** The quality (1–100) whose libjpeg table is nearest `table`; exact when it is that table. */
export function estimateQuality(table: readonly number[]): { quality: number; exact: boolean } {
  let best = { quality: 100, error: Infinity };
  for (let q = 100; q >= 1; q--) {
    const t = scaled(q);
    let error = 0;
    for (let i = 0; i < 64; i++) error += Math.abs(t[i]! - (table[i] ?? 0));
    if (error < best.error) best = { quality: q, error };
  }
  return { quality: best.quality, exact: best.error === 0 };
}

/** An Exif block's resolution (IFD0's XResolution, YResolution and ResolutionUnit). */
function exifDpi(tiff: Uint8Array): { x: number; y: number } | undefined {
  const tags = tiffTags(tiff);
  const x = tags?.get(282)?.[0];
  const y = tags?.get(283)?.[0] ?? x;
  const unit = tags?.get(296)?.[0] ?? 2;
  const perInch = unit === 3 ? 2.54 : unit === 2 ? 1 : 0;
  if (!x || !y || !perInch) return undefined;
  return { x: Math.round(x * perInch), y: Math.round(y * perInch) };
}

export function jpegFacts(b: Uint8Array): Found {
  let at = 2;
  let size: { width: number; height: number; depth: number; grey: boolean } | null = null;
  let progressive = false;
  let luminance: number[] | null = null;
  let dpi = jpegDpi(b) ?? undefined;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) throw new EditError(DAMAGED);
    const marker = b[at + 1]!;
    if (marker === 0xff) {
      at++; // fill bytes
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // the picture's data starts: no more headers
    const length = (b[at + 2]! << 8) | b[at + 3]!;
    const data = b.subarray(at + 4, at + 2 + length);
    if (length < 2 || at + 2 + length > b.length) throw new EditError(DAMAGED);
    if (marker === 0xdb) {
      for (let k = 0; k < data.length;) {
        const wide = data[k]! >> 4;
        const id = data[k]! & 15;
        const values: number[] = [];
        for (let i = 0; i < 64; i++)
          values.push(wide ? (data[k + 1 + 2 * i]! << 8) | data[k + 2 + 2 * i]! : data[k + 1 + i]!);
        if (id === 0 && !luminance) luminance = values;
        k += 1 + 64 * (wide ? 2 : 1);
      }
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const components = data[5]!;
      size = {
        height: (data[1]! << 8) | data[2]!,
        width: (data[3]! << 8) | data[4]!,
        depth: data[0]! * components,
        grey: components === 1,
      };
      progressive = [0xc2, 0xc6, 0xca, 0xce].includes(marker);
    } else if (
      marker === 0xe1 &&
      !dpi &&
      String.fromCharCode(...data.subarray(0, 4)) === 'Exif' &&
      data[4] === 0
    )
      dpi = exifDpi(data.subarray(6));
    at += 2 + length;
  }
  if (!size || !(size.width > 0) || !(size.height > 0)) throw new EditError(DAMAGED);
  return {
    width: size.width,
    height: size.height,
    ...(dpi && dpi.x > 0 ? { dpi } : {}),
    depth: size.depth,
    ...(size.grey ? { grey: true } : {}),
    seeThrough: 'none',
    compression: progressive ? 'JPEG (lossy, progressive)' : 'JPEG (lossy)',
    ...(luminance ? { jpeg: { ...estimateQuality(luminance), progressive } } : {}),
  };
}
