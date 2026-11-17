// D9 (M21): the Graphics mode file (.mveg, and its recovery file): a stored zip of doc.json (the
// document as an animation file's JSON, each raster only a reference) and one lossless PNG per
// pixel layer's bitmap and per layer mask (pixels/<n>.png, pixels/<n>-mask.png). One file to hand
// in or move; PNG keeps the pixels exact; doc.json stays readable. A .mveg made before M21 is the
// JSON alone, and still opens. A raster's PNG is kept beside it once made (rasters never change),
// so saving again, or the autosave, writes again only the layers that changed.
import {
  ANIMATION_DAMAGED,
  deserializeAnimation,
  pixelFiles,
  serializeAnimation,
} from '../animation/serialize.ts';
import type { AnimationDoc } from '../animation/types.ts';
import type { Compression } from '../image/deflate.ts';
import { decodePng, encodePngRows } from '../image/png.ts';
import { ProjectFileError } from '../model/errors.ts';
import { isZip, readZip, writeZip, type ZipEntry } from '../project/zip.ts';
import { bitmapFromRGBA, maskFromBytes, readRegion, type Raster } from './pixels/raster.ts';

export const DOC_JSON = 'doc.json';

/** Each raster's PNG, once made or read: a raster never changes, so its PNG never does. */
const pngs = new WeakMap<Raster, Uint8Array>();

/** A raster (RGBA bitmap or grey mask) as a PNG, a band of tiles at a time. */
export async function rasterPng(raster: Raster, compression: Compression): Promise<Uint8Array> {
  const known = pngs.get(raster);
  if (known) return known;
  const png = await encodePngRows(
    raster.width,
    raster.height,
    raster.channels,
    (y, count) => readRegion(raster, { x: 0, y, width: raster.width, height: count }),
    compression,
  );
  pngs.set(raster, png);
  return png;
}

/** The document as a .mveg file. Refuses (ProjectFileError) one that would not open again. */
export async function writeGraphicFile(
  doc: AnimationDoc,
  compression: Compression,
): Promise<Uint8Array> {
  const text = serializeAnimation(doc);
  const files = pixelFiles(doc);
  // What is saved must open: the same checks as opening (a raster by the size doc.json says).
  const named = new Map(files.map((f) => [f.file, f.raster]));
  try {
    deserializeAnimation(text, (file) => named.get(file));
  } catch {
    throw new ProjectFileError(
      `The ${doc.graphic ? 'image' : 'animation'} could not be saved: something in it could not be opened again. Undo the last change and save again.`,
    );
  }
  const entries: ZipEntry[] = [{ name: DOC_JSON, data: new TextEncoder().encode(text) }];
  for (const f of files)
    entries.push({ name: f.file, data: await rasterPng(f.raster, compression) });
  return writeZip(entries);
}

/** The first byte that is not white space (or a UTF-8 byte order mark). */
function firstByte(bytes: Uint8Array): number | undefined {
  let at = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) at = 3;
  while (at < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[at]!)) at++;
  return bytes[at];
}

/** A raster from its PNG: RGBA for a bitmap, the grey for a mask. */
async function rasterOf(png: Uint8Array, mask: boolean, compression: Compression): Promise<Raster> {
  const { width, height, data } = await decodePng(png, compression);
  let raster: Raster;
  if (mask) {
    const grey = new Uint8ClampedArray(width * height);
    for (let p = 0; p < grey.length; p++) grey[p] = data[p * 4]!;
    raster = maskFromBytes(width, height, grey);
  } else raster = bitmapFromRGBA(width, height, data);
  pngs.set(raster, png);
  return raster;
}

/**
 * A .mveg file's document: a zip of doc.json and its PNGs, or (made before M21) the JSON alone.
 * Refuses (ProjectFileError) a file that is neither, or is damaged.
 */
export async function readGraphicFile(
  bytes: Uint8Array,
  compression: Compression,
): Promise<AnimationDoc> {
  if (firstByte(bytes) === 0x7b) return deserializeAnimation(new TextDecoder().decode(bytes));
  if (!isZip(bytes)) throw new ProjectFileError(ANIMATION_DAMAGED);
  let entries: Map<string, Uint8Array>;
  try {
    entries = readZip(bytes);
  } catch {
    throw new ProjectFileError(ANIMATION_DAMAGED);
  }
  const json = entries.get(DOC_JSON);
  if (!json) throw new ProjectFileError(ANIMATION_DAMAGED);
  const rasters = new Map<string, Raster>();
  try {
    await Promise.all(
      [...entries]
        .filter(([name]) => /^pixels\/\d+(-mask)?\.png$/.test(name))
        .map(async ([name, png]) =>
          rasters.set(name, await rasterOf(png, name.endsWith('-mask.png'), compression)),
        ),
    );
  } catch {
    throw new ProjectFileError(ANIMATION_DAMAGED);
  }
  return deserializeAnimation(new TextDecoder().decode(json), (file) => rasters.get(file));
}
