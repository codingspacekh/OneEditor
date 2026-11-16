// G2, GB1 (M21): pixel layers on a browser canvas (StageCanvas.drawBitmap). Each layer keeps one
// canvas of its bitmap's size; when the layer's bitmap is drawn again, only the tiles that are not
// the very arrays put there last time are put in again (tiles never change once made, D3), so a
// brush stroke on a 12-megapixel photo uploads a few tiles, and undo or redo the same. One canvas
// for the whole bitmap, not one per tile, so a zoomed stage shows no seams between tiles. A layer
// mask is kept the same way and laid over a copy with 'destination-in'.
import {
  tileRect,
  type Bitmap,
  type Mask,
  type Raster,
} from '../../core/graphics/pixels/raster.ts';

/** The parts of an OffscreenCanvas this needs (a stand-in in the tests). */
export interface PictureCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): PictureContext | null;
}

interface PictureContext {
  globalCompositeOperation: string;
  putImageData(data: unknown, x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: unknown, x: number, y: number): void;
  save(): void;
  restore(): void;
}

export interface BitmapCacheDeps {
  makeCanvas?: (width: number, height: number) => PictureCanvas;
  makeImageData?: (data: Uint8ClampedArray, width: number, height: number) => unknown;
  /** How many layers' pictures are kept (the least recently drawn go first). */
  limit?: number;
}

interface Entry {
  canvas: PictureCanvas;
  tiles: readonly (Uint8ClampedArray | null)[];
  used: number;
}

/** A mask tile as RGBA: black, its value the alpha. */
function maskTileRGBA(tile: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(tile.length * 4);
  for (let i = 0; i < tile.length; i++) out[i * 4 + 3] = tile[i]!;
  return out;
}

export function createBitmapCache({
  makeCanvas = (w, h) => new OffscreenCanvas(w, h) as unknown as PictureCanvas,
  makeImageData = (data, w, h) => new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h),
  limit = 32,
}: BitmapCacheDeps = {}) {
  const entries = new Map<string, Entry>();
  let clock = 0;

  function prune(): void {
    while (entries.size > limit) {
      let oldest: string | null = null;
      let when = Infinity;
      for (const [key, e] of entries)
        if (e.used < when) {
          when = e.used;
          oldest = key;
        }
      entries.delete(oldest!);
    }
  }

  /** The raster as a picture, kept under `key` and brought up to date tile by tile. */
  function pictureOf(raster: Raster, key: string): PictureCanvas {
    let entry = entries.get(key);
    if (
      !entry ||
      entry.canvas.width !== raster.width ||
      entry.canvas.height !== raster.height ||
      entry.tiles.length !== raster.tiles.length
    ) {
      entry = {
        canvas: makeCanvas(raster.width, raster.height),
        tiles: raster.tiles.map(() => null),
        used: 0,
      };
      entries.set(key, entry);
    }
    const ctx = entry.canvas.getContext('2d')!;
    raster.tiles.forEach((tile, i) => {
      if (tile === entry.tiles[i]) return;
      const at = tileRect(raster, i);
      if (!tile) ctx.clearRect(at.x, at.y, at.width, at.height);
      else {
        const rgba = raster.channels === 4 ? tile : maskTileRGBA(tile);
        ctx.putImageData(makeImageData(rgba, at.width, at.height), at.x, at.y);
      }
    });
    entry.tiles = raster.tiles;
    entry.used = ++clock;
    prune();
    return entry.canvas;
  }

  /** The bitmap seen through its mask: a copy kept under its own key, made again on a change. */
  const masked = new Map<string, { bitmap: Bitmap; mask: Mask; canvas: PictureCanvas }>();
  function maskedPicture(bitmap: Bitmap, mask: Mask, key: string): PictureCanvas {
    const pixels = pictureOf(bitmap, key);
    const shown = pictureOf(mask, `${key} mask`);
    const last = masked.get(key);
    if (last && last.bitmap === bitmap && last.mask === mask) return last.canvas;
    const canvas =
      last && last.canvas.width === bitmap.width && last.canvas.height === bitmap.height
        ? last.canvas
        : makeCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(pixels, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(shown, 0, 0);
    ctx.restore();
    masked.set(key, { bitmap, mask, canvas });
    // Masked copies of layers no longer drawn go with their pictures.
    for (const k of masked.keys()) if (!entries.has(k)) masked.delete(k);
    return canvas;
  }

  return {
    pictureOf,
    /** What StageCanvas.drawBitmap draws: the layer's picture, through its mask if it has one. */
    picture: (bitmap: Bitmap, key: string, mask?: Mask): PictureCanvas =>
      mask ? maskedPicture(bitmap, mask, key) : pictureOf(bitmap, key),
    /** For the tests: the keys kept. */
    keys: () => [...entries.keys()],
  };
}

export type BitmapCache = ReturnType<typeof createBitmapCache>;

let shared: BitmapCache | null = null;
/** The page's one cache: the stage and the exports draw the same layers. */
export const pageBitmaps = (): BitmapCache => (shared ??= createBitmapCache());
