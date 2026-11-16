// M22 (GB5, D8, GN2): what the retouching brushes paint with, on M21's brush engine (brush.ts):
// the clone stamp's pixels copied from the source point plus the stroke's offset (from this layer
// or from every visible pixel layer as the stage shows them, made only for the tiles a stroke
// reaches); the blur and sharpen brushes' pixels (the layer blurred, or sharpened with an unsharp
// mask, again only for the tiles reached, so a stroke on a 12-megapixel photo keeps up with the
// pointer); the smudge brush, which picks up the colour under it and drags it along the stroke;
// and red eye, which turns the red pupils inside a circle or box dark and grey, leaving the skin.
import { blendPixel, selectionOver } from './paint.ts';
import { dabValue, type PixelPainter } from './brush.ts';
import { compositeLayers, type DrawnLayer } from './merge.ts';
import {
  TILE,
  editRegion,
  intersect,
  readRegion,
  tileRect,
  tilesAcross,
  type Bitmap,
  type Mask,
  type Raster,
  type Rect,
} from './raster.ts';

/** Pixels to copy or mix from, read one at a time at a place (in its own coordinates). */
export interface PixelSource {
  readonly channels: 1 | 4;
  /** Writes the pixel at (x, y) into `out` from byte `k` (zero outside or where empty). */
  read(x: number, y: number, out: Uint8ClampedArray, k: number): void;
}

/** A raster's own pixels, its top-left pixel at (x, y). */
export function rasterSource(raster: Raster, x = 0, y = 0): PixelSource {
  const c = raster.channels;
  const across = tilesAcross(raster);
  return {
    channels: c,
    read(px, py, out, k) {
      const rx = px - x;
      const ry = py - y;
      if (rx < 0 || ry < 0 || rx >= raster.width || ry >= raster.height) {
        out.fill(0, k, k + c);
        return;
      }
      const tx = Math.floor(rx / TILE);
      const ty = Math.floor(ry / TILE);
      const tile = raster.tiles[ty * across + tx];
      if (!tile) {
        out.fill(0, k, k + c);
        return;
      }
      const w = Math.min(TILE, raster.width - tx * TILE);
      const j = ((ry - ty * TILE) * w + (rx - tx * TILE)) * c;
      for (let ch = 0; ch < c; ch++) out[k + ch] = tile[j + ch]!;
    },
  };
}

/**
 * Pixels made a tile at a time, when first read: `make` gives the pixels of a rectangle of a
 * width × height area (row by row, `channels` bytes a pixel); the area's top-left is at (x, y).
 */
export function lazySource(
  width: number,
  height: number,
  channels: 1 | 4,
  make: (rect: Rect) => Uint8ClampedArray,
  x = 0,
  y = 0,
): PixelSource {
  const made = new Map<number, Uint8ClampedArray>();
  const area = { width, height };
  const across = tilesAcross(area);
  return {
    channels,
    read(px, py, out, k) {
      const rx = px - x;
      const ry = py - y;
      if (rx < 0 || ry < 0 || rx >= width || ry >= height) {
        out.fill(0, k, k + channels);
        return;
      }
      const tx = Math.floor(rx / TILE);
      const ty = Math.floor(ry / TILE);
      const i = ty * across + tx;
      let tile = made.get(i);
      if (!tile) {
        tile = make(tileRect(area, i));
        made.set(i, tile);
      }
      const w = Math.min(TILE, width - tx * TILE);
      const j = ((ry - ty * TILE) * w + (rx - tx * TILE)) * channels;
      for (let ch = 0; ch < channels; ch++) out[k + ch] = tile[j + ch]!;
    },
  };
}

/** GB5: every visible pixel layer as the stage draws them, over `area` of the image (image px). */
export function compositeSource(layers: readonly DrawnLayer[], area: Rect): PixelSource {
  return lazySource(
    area.width,
    area.height,
    4,
    (rect) => {
      const part = compositeLayers(layers, { ...rect, x: area.x + rect.x, y: area.y + rect.y });
      return readRegion(part);
    },
    area.x,
    area.y,
  );
}

/**
 * GB5: the clone stamp — the pixel at (x, y) of a target placed at `place` on the image takes the
 * source's pixel at its image point plus `offset`, laid over it (a source's transparent pixels
 * leave the target as it was, as Photoshop's clone stamp).
 */
export function clonePainter(
  source: PixelSource,
  place: { x: number; y: number },
  offset: { dx: number; dy: number },
  channels: 1 | 4,
): PixelPainter {
  const px = new Uint8ClampedArray(4);
  const rgb = [0, 0, 0];
  const dx = place.x + Math.round(offset.dx);
  const dy = place.y + Math.round(offset.dy);
  return (out, k, x, y, a) => {
    source.read(x + dx, y + dy, px, 0);
    if (channels === 1) {
      const v = source.channels === 1 ? px[0]! : px[0]! * 0.299 + px[1]! * 0.587 + px[2]! * 0.114;
      blendPixel(out, k, 1, rgb, v, a, false);
      return;
    }
    if (source.channels === 1) {
      rgb[0] = rgb[1] = rgb[2] = px[0]!;
      blendPixel(out, k, 4, rgb, 0, a, false);
      return;
    }
    if (px[3] === 0) return;
    rgb[0] = px[0]!;
    rgb[1] = px[1]!;
    rgb[2] = px[2]!;
    blendPixel(out, k, 4, rgb, 0, (a * px[3]!) / 255, false);
  };
}

/** GB5: the blur and sharpen brushes — the pixel moved `a` of the way to the source's own. */
export function towardsPainter(source: PixelSource): PixelPainter {
  const px = new Uint8ClampedArray(4);
  const c = source.channels;
  return (out, k, x, y, a) => {
    source.read(x, y, px, 0);
    for (let ch = 0; ch < c; ch++) out[k + ch] = out[k + ch]! + (px[ch]! - out[k + ch]!) * a;
  };
}

/** The radius of each of three box blurs that together blur as a Gaussian of `sigma` does. */
const boxRadius = (sigma: number): number =>
  Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));

/**
 * One box blur of radius r along each row, the edges averaging what there is (the ends of a row
 * apart, the window is full: no tests in the loop, GN2).
 */
function rowPass(from: Float32Array, to: Float32Array, w: number, h: number, c: number, r: number) {
  const full = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++)
    for (let ch = 0; ch < c; ch++) {
      const o = y * w * c + ch;
      let sum = 0;
      let count = 0;
      for (let i = 0; i < Math.min(r, w); i++, count++) sum += from[o + i * c]!;
      let i = 0;
      // The start: the window grows (and, in a short row, shrinks at once).
      for (; i < w && (i <= r || i + r >= w); i++) {
        if (i + r < w) {
          sum += from[o + (i + r) * c]!;
          count++;
        }
        if (i > r) {
          sum -= from[o + (i - r - 1) * c]!;
          count--;
        }
        to[o + i * c] = sum / count;
      }
      // The middle: a full window.
      for (; i + r < w; i++) {
        sum += from[o + (i + r) * c]! - from[o + (i - r - 1) * c]!;
        to[o + i * c] = sum * full;
      }
      // The end: the window shrinks.
      for (count = 2 * r; i < w; i++, count--) {
        sum -= from[o + (i - r - 1) * c]!;
        to[o + i * c] = sum / count;
      }
    }
}

/** One box blur of radius r down each column, a row at a time (running sums for every column). */
function columnPass(
  from: Float32Array,
  to: Float32Array,
  w: number,
  h: number,
  c: number,
  r: number,
) {
  const row = w * c;
  const sums = new Float64Array(row);
  let count = Math.min(r, h);
  for (let y = 0; y < count; y++) for (let k = 0; k < row; k++) sums[k]! += from[y * row + k]!;
  for (let y = 0; y < h; y++) {
    if (y + r < h) {
      const add = (y + r) * row;
      for (let k = 0; k < row; k++) sums[k]! += from[add + k]!;
      count++;
    }
    if (y > r) {
      const drop = (y - r - 1) * row;
      for (let k = 0; k < row; k++) sums[k]! -= from[drop + k]!;
      count--;
    }
    const out = y * row;
    for (let k = 0; k < row; k++) to[out + k] = sums[k]! / count;
  }
}

/**
 * A rectangle of a raster blurred (about a Gaussian of `sigma` px): RGBA blurred premultiplied,
 * so transparent pixels lend no colour; the raster's edges average what there is.
 */
function blurredRect(raster: Raster, rect: Rect, sigma: number): Uint8ClampedArray {
  const c = raster.channels;
  const r = boxRadius(sigma);
  const pad = 3 * r;
  const whole = { x: 0, y: 0, width: raster.width, height: raster.height };
  const big = intersect(
    {
      x: rect.x - pad,
      y: rect.y - pad,
      width: rect.width + 2 * pad,
      height: rect.height + 2 * pad,
    },
    whole,
  )!;
  const bytes = readRegion(raster, big);
  const a = new Float32Array(bytes.length);
  for (let k = 0; k < bytes.length; k += c) {
    if (c === 1) {
      a[k] = bytes[k]!;
      continue;
    }
    const al = bytes[k + 3]! / 255;
    a[k] = bytes[k]! * al;
    a[k + 1] = bytes[k + 1]! * al;
    a[k + 2] = bytes[k + 2]! * al;
    a[k + 3] = bytes[k + 3]!;
  }
  const b = new Float32Array(a.length);
  for (let pass = 0; pass < 3; pass++) {
    rowPass(a, b, big.width, big.height, c, r);
    columnPass(b, a, big.width, big.height, c, r);
  }
  // The rectangle's part, unpremultiplied.
  const out = new Uint8ClampedArray(rect.width * rect.height * c);
  for (let y = 0; y < rect.height; y++)
    for (let x = 0; x < rect.width; x++) {
      const from = ((rect.y + y - big.y) * big.width + rect.x + x - big.x) * c;
      const to = (y * rect.width + x) * c;
      if (c === 1) {
        out[to] = a[from]!;
        continue;
      }
      const al = a[from + 3]!;
      const un = al > 0 ? 255 / al : 0;
      out[to] = a[from]! * un;
      out[to + 1] = a[from + 1]! * un;
      out[to + 2] = a[from + 2]! * un;
      out[to + 3] = al;
    }
  return out;
}

/** GB5: the raster blurred (about a Gaussian of `sigma` px), a tile at a time as it is read. */
export function blurredSource(raster: Raster, sigma: number): PixelSource {
  return lazySource(raster.width, raster.height, raster.channels, (rect) =>
    blurredRect(raster, rect, sigma),
  );
}

/**
 * GB5: the raster sharpened with an unsharp mask (each pixel pushed away from its blurred self
 * by `amount`, 1 = as far again), a tile at a time as it is read; alpha kept.
 */
export function sharpenedSource(raster: Raster, sigma: number, amount: number): PixelSource {
  const c = raster.channels;
  return lazySource(raster.width, raster.height, c, (rect) => {
    const blurred = blurredRect(raster, rect, sigma);
    const own = readRegion(raster, rect);
    const out = new Uint8ClampedArray(own.length);
    for (let k = 0; k < own.length; k += c) {
      const colours = c === 4 ? 3 : 1;
      for (let ch = 0; ch < colours; ch++)
        out[k + ch] = own[k + ch]! + (own[k + ch]! - blurred[k + ch]!) * amount;
      if (c === 4) out[k + 3] = own[k + 3]!;
    }
    return out;
  });
}

/**
 * GB5: the smudge brush on a target: each dab drags the colour picked up by the dab before
 * (`strength` 0–1: how much of it is kept — 1 smears all the way); `onDab` and `painter` go into
 * the brush engine's stroke. Inside the selection (weighted by it).
 */
export function smudgeHooks(
  target: Raster,
  place: { x: number; y: number },
  strength: number,
  hardness: number,
  maxSize: number,
  selection?: Mask,
): { onDab: (cx: number, cy: number, size: number) => void; painter: PixelPainter } {
  const c = target.channels;
  const across = tilesAcross(target);
  const working = new Map<number, Uint8ClampedArray>();
  const selections = new Map<number, Uint8ClampedArray | null>();
  const side = Math.ceil(maxSize) + 3;
  const mid = Math.floor(side / 2);
  // NaN: nothing picked up there (off the layer), so nothing is smeared from it.
  const finger = new Float32Array(side * side * c).fill(NaN);
  let started = false;

  function tileOf(i: number): Uint8ClampedArray {
    let t = working.get(i);
    if (!t) {
      const at = tileRect(target, i);
      t = target.tiles[i]?.slice() ?? new Uint8ClampedArray(at.width * at.height * c);
      working.set(i, t);
    }
    return t;
  }
  function selectionAt(i: number): Uint8ClampedArray | null {
    if (!selections.has(i))
      selections.set(i, selectionOver(selection, tileRect(target, i), place.x, place.y));
    return selections.get(i)!;
  }

  return {
    onDab(cx, cy, size) {
      const r = size / 2;
      const fx0 = Math.floor(cx) - mid;
      const fy0 = Math.floor(cy) - mid;
      for (let fy = 0; fy < side; fy++) {
        const y = fy0 + fy;
        if (y < 0 || y >= target.height) continue;
        const ty = Math.floor(y / TILE);
        for (let fx = 0; fx < side; fx++) {
          const x = fx0 + fx;
          if (x < 0 || x >= target.width) continue;
          const tx = Math.floor(x / TILE);
          const i = ty * across + tx;
          const tile = tileOf(i);
          const w = Math.min(TILE, target.width - tx * TILE);
          const p = (y - ty * TILE) * w + (x - tx * TILE);
          const k = p * c;
          const f = (fy * side + fx) * c;
          if (started) {
            const sel = selectionAt(i);
            const v =
              dabValue('round', x + 0.5 - cx, y + 0.5 - cy, r, hardness, false) *
              strength *
              (sel ? sel[p]! / 255 : 1);
            if (v > 0 && !Number.isNaN(finger[f]!))
              for (let ch = 0; ch < c; ch++)
                tile[k + ch] = tile[k + ch]! + (finger[f + ch]! - tile[k + ch]!) * v;
          }
          for (let ch = 0; ch < c; ch++) finger[f + ch] = tile[k + ch]!;
        }
      }
      started = true;
    },
    painter(out, k, x, y) {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      const tile = working.get(ty * across + tx);
      if (!tile) return;
      const w = Math.min(TILE, target.width - tx * TILE);
      const j = ((y - ty * TILE) * w + (x - tx * TILE)) * c;
      for (let ch = 0; ch < c; ch++) out[k + ch] = tile[j + ch]!;
    },
  };
}

/** Where red eye works: an ellipse on the image (image px). */
export interface EyeArea {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** 0 at `a`, 1 at `b`, smoothly between. */
function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How red a pixel is, 0–1: red well above the mean of green and blue (a red pupil: 1; skin, whose
 * red is about 1.4 times the others': 0), and bright enough to be seen as red.
 */
export function redness(r: number, g: number, b: number): number {
  const m = (g + b) / 2;
  return smoothstep(1.6, 2.2, r / (m + 8)) * smoothstep(40, 70, r);
}

/**
 * GB5: red eye removed inside `area` (an ellipse on the image) of a bitmap placed at `place`:
 * each red pixel's red becomes the mean of its green and blue (grey), then darkened by `darken`
 * (0–1); how much by how red it is, with a soft edge in the last fifth of the ellipse, inside the
 * selection. Other pixels (skin, the white of the eye) stay as they were.
 */
export function removeRedEye(
  target: Bitmap,
  place: { x: number; y: number },
  area: EyeArea,
  darken: number,
  selection?: Mask,
): Bitmap {
  const rx = Math.max(0.5, area.rx);
  const ry = Math.max(0.5, area.ry);
  const box = {
    x: Math.floor(area.cx - rx - place.x),
    y: Math.floor(area.cy - ry - place.y),
    width: Math.ceil(2 * rx) + 2,
    height: Math.ceil(2 * ry) + 2,
  };
  const keep = 1 - darken;
  return editRegion(target, box, (tile, at, part) => {
    const sel = selectionOver(selection, at, place.x, place.y);
    let changed = false;
    for (let y = part.y; y < part.y + part.height; y++)
      for (let x = part.x; x < part.x + part.width; x++) {
        const ex = (x + 0.5 + place.x - area.cx) / rx;
        const ey = (y + 0.5 + place.y - area.cy) / ry;
        const edge = 1 - smoothstep(0.8, 1, Math.sqrt(ex * ex + ey * ey));
        if (edge <= 0) continue;
        const p = (y - at.y) * at.width + (x - at.x);
        const k = p * 4;
        if (tile[k + 3] === 0) continue;
        const [r, g, b] = [tile[k]!, tile[k + 1]!, tile[k + 2]!];
        const w = edge * redness(r, g, b) * (sel ? sel[p]! / 255 : 1);
        if (w <= 0) continue;
        const m = (g + b) / 2;
        tile[k] = r + (m * keep - r) * w;
        tile[k + 1] = g + (g * keep - g) * w;
        tile[k + 2] = b + (b * keep - b) * w;
        changed = true;
      }
    return changed;
  });
}
