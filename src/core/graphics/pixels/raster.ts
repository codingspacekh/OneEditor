// M21 (D3, GN1): the tiled raster under every pixel layer (RGBA, a Bitmap), layer mask and
// selection (one channel, a Mask). The image is cut into 256 × 256 tiles, those at the right and
// bottom edges cut to the image; a tile that is all zero (transparent, or nothing selected) is
// null and costs nothing. A raster is immutable: every edit returns a new one that shares every
// tile it did not touch, so the app's history of whole documents (app/history.ts) keeps, for each
// undo step, only the tiles that step changed.

export const TILE = 256;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Raster<C extends 1 | 4 = 1 | 4> {
  readonly width: number;
  readonly height: number;
  /** 4: RGBA, 8 bits each, not premultiplied (as ImageData); 1: a mask's 0–255. */
  readonly channels: C;
  /** Row by row from the top left; null: every byte 0. Never changed once made. */
  readonly tiles: readonly (Uint8ClampedArray | null)[];
}

/** A pixel layer's pixels. */
export type Bitmap = Raster<4>;
/** A layer mask or a selection: 255 shown / selected, 0 hidden / not, between: partly. */
export type Mask = Raster<1>;

export const tilesAcross = (r: { width: number }): number => Math.ceil(r.width / TILE);
export const tilesDown = (r: { height: number }): number => Math.ceil(r.height / TILE);

/** Where tile `i` lies in the image. */
export function tileRect(r: { width: number; height: number }, i: number): Rect {
  const across = tilesAcross(r);
  const x = (i % across) * TILE;
  const y = Math.floor(i / across) * TILE;
  return { x, y, width: Math.min(TILE, r.width - x), height: Math.min(TILE, r.height - y) };
}

function checkSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError(`A raster must be at least 1 × 1 whole px (not ${width} × ${height}).`);
}

function empty<C extends 1 | 4>(width: number, height: number, channels: C): Raster<C> {
  checkSize(width, height);
  return {
    width,
    height,
    channels,
    tiles: new Array<null>(tilesAcross({ width }) * tilesDown({ height })).fill(null),
  };
}

/** A transparent bitmap. */
export const createBitmap = (width: number, height: number): Bitmap => empty(width, height, 4);
/** A mask with nothing selected (or everything hidden). */
export const createMask = (width: number, height: number): Mask => empty(width, height, 1);

const allZero = (data: Uint8ClampedArray): boolean => {
  // Eight bytes at a time where the array lines up (tiles always do).
  if (data.byteOffset % 8 === 0 && data.byteLength % 8 === 0) {
    const wide = new BigUint64Array(data.buffer, data.byteOffset, data.byteLength / 8);
    for (let i = 0; i < wide.length; i++) if (wide[i] !== 0n) return false;
    return true;
  }
  for (let i = 0; i < data.length; i++) if (data[i] !== 0) return false;
  return true;
};

/** The part of `a` inside `b`, or null. */
export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

const whole = (r: Raster): Rect => ({ x: 0, y: 0, width: r.width, height: r.height });

/** The tiles a region touches, by index. */
function tilesUnder(r: Raster, region: Rect): number[] {
  const inside = intersect(region, whole(r));
  if (!inside) return [];
  const across = tilesAcross(r);
  const out: number[] = [];
  for (let ty = Math.floor(inside.y / TILE); ty * TILE < inside.y + inside.height; ty++)
    for (let tx = Math.floor(inside.x / TILE); tx * TILE < inside.x + inside.width; tx++)
      out.push(ty * across + tx);
  return out;
}

/** Copies a rectangle of rows between two row-major buffers with `channels` bytes a pixel. */
function copyRows(
  from: Uint8ClampedArray,
  fromWidth: number,
  fx: number,
  fy: number,
  to: Uint8ClampedArray,
  toWidth: number,
  tx: number,
  ty: number,
  width: number,
  height: number,
  channels: number,
): void {
  const row = width * channels;
  for (let j = 0; j < height; j++) {
    const start = ((fy + j) * fromWidth + fx) * channels;
    to.set(from.subarray(start, start + row), ((ty + j) * toWidth + tx) * channels);
  }
}

function fromData<C extends 1 | 4>(
  width: number,
  height: number,
  channels: C,
  data: Uint8ClampedArray,
): Raster<C> {
  checkSize(width, height);
  if (data.length !== width * height * channels)
    throw new RangeError(
      `${width} × ${height} px need ${width * height * channels} bytes, not ${data.length}.`,
    );
  const r = empty(width, height, channels);
  const tiles = r.tiles.map((_, i) => {
    const at = tileRect(r, i);
    const tile = new Uint8ClampedArray(at.width * at.height * channels);
    copyRows(data, width, at.x, at.y, tile, at.width, 0, 0, at.width, at.height, channels);
    return allZero(tile) ? null : tile;
  });
  return { ...r, tiles };
}

/** A bitmap of RGBA pixels (ImageData's order: rows from the top, 4 bytes a pixel). */
export const bitmapFromRGBA = (width: number, height: number, data: Uint8ClampedArray): Bitmap =>
  fromData(width, height, 4, data);

/** A mask of one byte a pixel. */
export const maskFromBytes = (width: number, height: number, data: Uint8ClampedArray): Mask =>
  fromData(width, height, 1, data);

/** The pixels of a region (the whole raster by default); outside the raster they are zero. */
export function readRegion(r: Raster, region: Rect = whole(r)): Uint8ClampedArray {
  const { channels } = r;
  const out = new Uint8ClampedArray(region.width * region.height * channels);
  for (const i of tilesUnder(r, region)) {
    const tile = r.tiles[i];
    if (!tile) continue;
    const at = tileRect(r, i);
    const part = intersect(at, region)!;
    copyRows(
      tile,
      at.width,
      part.x - at.x,
      part.y - at.y,
      out,
      region.width,
      part.x - region.x,
      part.y - region.y,
      part.width,
      part.height,
      channels,
    );
  }
  return out;
}

/** One pixel: [r, g, b, a] for a bitmap, 0–255 for a mask; outside the raster, zero. */
export function pixelAt(r: Bitmap, x: number, y: number): [number, number, number, number];
export function pixelAt(r: Mask, x: number, y: number): number;
export function pixelAt(r: Raster, x: number, y: number): number | number[] {
  const c = r.channels;
  const zero = c === 4 ? [0, 0, 0, 0] : 0;
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return zero;
  const i = Math.floor(y / TILE) * tilesAcross(r) + Math.floor(x / TILE);
  const tile = r.tiles[i];
  if (!tile) return zero;
  const at = tileRect(r, i);
  const k = ((y - at.y) * at.width + (x - at.x)) * c;
  return c === 4 ? [...tile.subarray(k, k + 4)] : tile[k]!;
}

/**
 * Edits the tiles under `region`: `edit` is given a copy of each tile (zeros where it was null),
 * the tile's place in the image, and the part of the region on it, and returns whether it changed
 * anything. Unchanged tiles stay the very same arrays; a tile left all zero becomes null; when
 * nothing changes the raster itself comes back.
 */
export function editRegion<C extends 1 | 4>(
  r: Raster<C>,
  region: Rect,
  edit: (tile: Uint8ClampedArray, at: Rect, part: Rect) => boolean,
): Raster<C> {
  let tiles: (Uint8ClampedArray | null)[] | null = null;
  for (const i of tilesUnder(r, region)) {
    const at = tileRect(r, i);
    const old = r.tiles[i] ?? null;
    const copy = old ? old.slice() : new Uint8ClampedArray(at.width * at.height * r.channels);
    if (!edit(copy, at, intersect(at, region)!)) continue;
    const next = allZero(copy) ? null : copy;
    if (next === null && old === null) continue;
    if (next !== null && old !== null && sameBytes(next, old)) continue;
    tiles ??= [...r.tiles];
    tiles[i] = next;
  }
  return tiles ? { ...r, tiles } : r;
}

function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Puts `data` (region-sized, row by row) into the raster; the parts outside it are dropped. */
export function writeRegion<C extends 1 | 4>(
  r: Raster<C>,
  region: Rect,
  data: Uint8ClampedArray,
): Raster<C> {
  if (data.length !== region.width * region.height * r.channels)
    throw new RangeError('The pixels do not fill the region.');
  return editRegion(r, region, (tile, at, part) => {
    const before = tile.slice();
    copyRows(
      data,
      region.width,
      part.x - region.x,
      part.y - region.y,
      tile,
      at.width,
      part.x - at.x,
      part.y - at.y,
      part.width,
      part.height,
      r.channels,
    );
    return !sameBytes(before, tile);
  });
}

/** Fills a rectangle with one colour (a bitmap) or value (a mask). */
export function fillRect(r: Bitmap, region: Rect, value: readonly number[]): Bitmap;
export function fillRect(r: Mask, region: Rect, value: number): Mask;
export function fillRect(r: Raster, region: Rect, value: number | readonly number[]): Raster {
  const bytes = typeof value === 'number' ? [value] : value;
  const c = r.channels;
  return editRegion(r, region, (tile, at, part) => {
    let changed = false;
    for (let y = part.y; y < part.y + part.height; y++)
      for (let x = part.x; x < part.x + part.width; x++) {
        const k = ((y - at.y) * at.width + (x - at.x)) * c;
        for (let ch = 0; ch < c; ch++)
          if (tile[k + ch] !== bytes[ch]) {
            tile[k + ch] = bytes[ch]!;
            changed = true;
          }
      }
    return changed;
  });
}

/**
 * The smallest rectangle holding every pixel that is not transparent (a bitmap's alpha above 0)
 * or not zero (a mask); null when there is none. Crop to content (O/N/19 pearl).
 */
export function contentBounds(r: Raster): Rect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const c = r.channels;
  const a = c - 1; // a bitmap's alpha, a mask's one byte
  r.tiles.forEach((tile, i) => {
    if (!tile) return;
    const at = tileRect(r, i);
    // Only the rows and columns that could widen what is found so far need looking at, but a
    // tile is small: one pass.
    for (let y = 0; y < at.height; y++)
      for (let x = 0; x < at.width; x++) {
        if (tile[(y * at.width + x) * c + a] === 0) continue;
        left = Math.min(left, at.x + x);
        right = Math.max(right, at.x + x);
        top = Math.min(top, at.y + y);
        bottom = Math.max(bottom, at.y + y);
      }
  });
  return left === Infinity
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** The pixels of `region` as a raster of its size (past the raster's edges: zero). */
export function cropRaster<C extends 1 | 4>(r: Raster<C>, region: Rect): Raster<C> {
  return fromData(region.width, region.height, r.channels, readRegion(r, region));
}

/** The same size, its pixels moved by whole px (what moves off the edge is lost). */
export function translateRaster<C extends 1 | 4>(r: Raster<C>, dx: number, dy: number): Raster<C> {
  return cropRaster(r, {
    x: -Math.round(dx),
    y: -Math.round(dy),
    width: r.width,
    height: r.height,
  });
}

/** A bitmap's alpha as a mask. */
export function maskFromAlpha(b: Bitmap): Mask {
  const tiles = b.tiles.map((tile) => {
    if (!tile) return null;
    const out = new Uint8ClampedArray(tile.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = tile[i * 4 + 3]!;
    return allZero(out) ? null : out;
  });
  return { width: b.width, height: b.height, channels: 1, tiles };
}

/** The bytes its tiles take (null tiles: none). */
export const rasterBytes = (r: Raster): number =>
  r.tiles.reduce((n, t) => n + (t?.byteLength ?? 0), 0);

/** GN1: the bytes two rasters share (the very same tiles): what an undo step does not cost. */
export function sharedBytes(a: Raster, b: Raster): number {
  const mine = new Set(a.tiles);
  return b.tiles.reduce((n, t) => n + (t && mine.has(t) ? t.byteLength : 0), 0);
}

/** For the file checks: a raster made by this module (or read back into one). */
export function isRaster(v: unknown, channels?: 1 | 4): v is Raster {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Raster;
  if (!Number.isInteger(r.width) || !Number.isInteger(r.height) || r.width < 1 || r.height < 1)
    return false;
  if (r.channels !== 1 && r.channels !== 4) return false;
  if (channels !== undefined && r.channels !== channels) return false;
  if (!Array.isArray(r.tiles) || r.tiles.length !== tilesAcross(r) * tilesDown(r)) return false;
  return r.tiles.every((t, i) => {
    if (t === null) return true;
    const at = tileRect(r, i);
    return t instanceof Uint8ClampedArray && t.length === at.width * at.height * r.channels;
  });
}
