// M21 GB6 (and G9, D6): Image ▸ Reduce colours — a pixel layer's colours cut to 2, 16 or 256 (the
// colour depths of 1, 4 and 8 bits a pixel) or to greys, with Floyd–Steinberg dithering on or off,
// and an honest estimate of what that saves. The palette is found by median cut (Heckbert): the
// colours used, counted in 32 × 32 × 32 boxes, are split again and again across their widest
// side at the median until there are enough boxes; each box's average is a palette colour.
// Dithering spreads each pixel's error to the pixels right and below (7/16, 3/16, 5/16, 1/16),
// so dots of the palette's colours mix to the colours between. Alpha is kept as it was. Pure
// functions on typed arrays: they can run in the pixel worker unchanged.
import { bitmapFromRGBA, readRegion, type Bitmap } from './raster.ts';

/** What the colours are reduced to: a palette of so many, or 256 greys. */
export type ColourTarget = 2 | 16 | 256 | 'grey';

export const COLOUR_TARGETS: readonly ColourTarget[] = [2, 16, 256, 'grey'];

/** The bits a pixel takes once reduced (as a palette or greyscale PNG would keep it). */
export const BITS_FOR: Readonly<Record<string, number>> = { 2: 1, 16: 4, 256: 8, grey: 8 };

const BINS = 32 * 32 * 32;
const binOf = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/**
 * The median-cut palette of the pixels that show (alpha above 0) in RGBA `data`: at most `count`
 * colours, 3 bytes each (fewer when fewer are used; none for a transparent picture).
 */
export function medianCut(data: Uint8ClampedArray, count: number): Uint8Array {
  const counts = new Float64Array(BINS);
  const sums = new Float64Array(BINS * 3);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const k = binOf(r, g, b);
    counts[k]!++;
    sums[k * 3]! += r;
    sums[k * 3 + 1]! += g;
    sums[k * 3 + 2]! += b;
  }
  const used: number[] = [];
  for (let k = 0; k < BINS; k++) if (counts[k]) used.push(k);
  // Each used box's average colour.
  const mean = (k: number, ch: number) => sums[k * 3 + ch]! / counts[k]!;
  interface Box {
    bins: number[];
    pixels: number;
    channel: number;
    range: number;
  }
  const boxOf = (bins: number[]): Box => {
    let best = 0;
    let range = -1;
    for (let ch = 0; ch < 3; ch++) {
      let lo = 255;
      let hi = 0;
      for (const k of bins) {
        const v = mean(k, ch);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > range) {
        range = hi - lo;
        best = ch;
      }
    }
    return { bins, pixels: bins.reduce((n, k) => n + counts[k]!, 0), channel: best, range };
  };
  const boxes: Box[] = used.length ? [boxOf(used)] : [];
  while (boxes.length < count) {
    // The box with the most pixels over the widest range (one colour cannot be split).
    let pick = -1;
    let score = -1;
    boxes.forEach((b, i) => {
      const s = b.bins.length > 1 ? b.pixels * (b.range + 1) : -1;
      if (s > score) {
        score = s;
        pick = i;
      }
    });
    if (pick < 0) break;
    const box = boxes[pick]!;
    const sorted = [...box.bins].sort((a, b) => mean(a, box.channel) - mean(b, box.channel));
    // The median by pixels, with at least one box on each side.
    let seen = 0;
    let cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      seen += counts[sorted[i]!]!;
      cut = i + 1;
      if (seen >= box.pixels / 2) break;
    }
    boxes.splice(pick, 1, boxOf(sorted.slice(0, cut)), boxOf(sorted.slice(cut)));
  }
  const palette = new Uint8Array(boxes.length * 3);
  boxes.forEach((b, i) => {
    for (let ch = 0; ch < 3; ch++) {
      let total = 0;
      for (const k of b.bins) total += sums[k * 3 + ch]!;
      palette[i * 3 + ch] = Math.round(total / b.pixels);
    }
  });
  return palette;
}

/** The nearest palette colour to each colour, found once per 64 × 64 × 64 cell and kept. */
function nearestOf(palette: Uint8Array): (r: number, g: number, b: number) => number {
  const n = palette.length / 3;
  const known = new Int16Array(64 * 64 * 64).fill(-1);
  return (r, g, b) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const hit = known[key]!;
    if (hit >= 0) return hit;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dr = palette[i * 3]! - r;
      const dg = palette[i * 3 + 1]! - g;
      const db = palette[i * 3 + 2]! - b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    known[key] = best;
    return best;
  };
}

/**
 * The palette entry for each pixel of RGBA `data` (dithered: Floyd–Steinberg), one byte a
 * pixel; a pixel that does not show (alpha 0) is given 0 and passes on no error. M23 (D5): the
 * same mapping the bitmap writers use for a 1-, 4- or 8-bit file (core/image/encode/palette.ts).
 */
export function paletteIndices(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  palette: Uint8Array,
  dither: boolean,
): Uint8Array {
  const out = new Uint8Array(width * height);
  if (palette.length === 0) return out;
  const nearest = nearestOf(palette);
  // The errors carried to this row and the next, 3 a pixel, with a pixel's room either side.
  let here = new Float32Array((width + 2) * 3);
  let next = new Float32Array((width + 2) * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * width + x;
      const i = k * 4;
      if (data[i + 3] === 0) continue;
      let r = data[i]!;
      let g = data[i + 1]!;
      let b = data[i + 2]!;
      const e = (x + 1) * 3;
      if (dither) {
        r = Math.min(255, Math.max(0, r + here[e]!));
        g = Math.min(255, Math.max(0, g + here[e + 1]!));
        b = Math.min(255, Math.max(0, b + here[e + 2]!));
      }
      const n = nearest(r, g, b);
      out[k] = n;
      if (!dither) continue;
      const p = n * 3;
      const er = r - palette[p]!;
      const eg = g - palette[p + 1]!;
      const eb = b - palette[p + 2]!;
      here[e + 3]! += (er * 7) / 16;
      here[e + 4]! += (eg * 7) / 16;
      here[e + 5]! += (eb * 7) / 16;
      next[e - 3]! += (er * 3) / 16;
      next[e - 2]! += (eg * 3) / 16;
      next[e - 1]! += (eb * 3) / 16;
      next[e]! += (er * 5) / 16;
      next[e + 1]! += (eg * 5) / 16;
      next[e + 2]! += (eb * 5) / 16;
      next[e + 3]! += er / 16;
      next[e + 4]! += eg / 16;
      next[e + 5]! += eb / 16;
    }
    [here, next] = [next, here];
    next.fill(0);
  }
  return out;
}

/** The pixels in place, each the nearest palette colour (dithered: Floyd–Steinberg). */
function mapToPalette(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  palette: Uint8Array,
  dither: boolean,
): void {
  if (palette.length === 0) return;
  const indices = paletteIndices(data, width, height, palette, dither);
  for (let k = 0, i = 0; k < indices.length; k++, i += 4) {
    if (data[i + 3] === 0) continue;
    const p = indices[k]! * 3;
    data[i] = palette[p]!;
    data[i + 1] = palette[p + 1]!;
    data[i + 2] = palette[p + 2]!;
  }
}

/** GB6: the bitmap with every pixel that shows in a colour of `palette` (3 bytes a colour). */
export function quantise(bitmap: Bitmap, palette: Uint8Array, dither: boolean): Bitmap {
  const data = readRegion(bitmap);
  mapToPalette(data, bitmap.width, bitmap.height, palette, dither);
  return bitmapFromRGBA(bitmap.width, bitmap.height, data);
}

/** GB6: the bitmap's colours reduced to 2, 16 or 256 (median cut) or to greys. */
export function reduceColours(
  bitmap: Bitmap,
  options: { to: ColourTarget; dither: boolean },
): Bitmap {
  const data = readRegion(bitmap);
  if (options.to === 'grey') {
    // The brightness the eye sees (ITU-R BT.601), as a greyscale picture keeps it.
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      data[i] = data[i + 1] = data[i + 2] = y;
    }
  } else
    mapToPalette(data, bitmap.width, bitmap.height, medianCut(data, options.to), options.dither);
  return bitmapFromRGBA(bitmap.width, bitmap.height, data);
}

export interface ColourStats {
  /** Different colours among the pixels that show. */
  colours: number;
  /** Any pixel partly or wholly see-through. */
  transparent: boolean;
  pixels: number;
}

/** How many colours the bitmap uses (one bit for each of the 16.7 million), and any alpha. */
export function colourStats(bitmap: Bitmap): ColourStats {
  const seen = new Uint8Array(1 << 21);
  let colours = 0;
  let transparent = false;
  bitmap.tiles.forEach((tile) => {
    if (!tile) {
      transparent = true;
      return;
    }
    for (let i = 0; i < tile.length; i += 4) {
      const a = tile[i + 3]!;
      if (a < 255) transparent = true;
      if (a === 0) continue;
      const c = (tile[i]! << 16) | (tile[i + 1]! << 8) | tile[i + 2]!;
      const bit = 1 << (c & 7);
      if (!(seen[c >> 3]! & bit)) {
        seen[c >> 3]! |= bit;
        colours++;
      }
    }
  });
  return { colours, transparent, pixels: bitmap.width * bitmap.height };
}

/**
 * GB6: an estimate of the picture's size, uncompressed, before and after: 24 bits a pixel (32
 * with alpha) before; 1, 4 or 8 bits a pixel and the palette's 3 bytes a colour (4 with alpha)
 * after, or 8 bits of grey (16 with alpha), each row a whole number of bytes, as a PNG holds it
 * before it is compressed.
 */
export function sizeEstimate(
  stats: ColourStats,
  width: number,
  height: number,
  to: ColourTarget,
): { before: number; after: number; beforeBits: number; afterBits: number } {
  const beforeBits = stats.transparent ? 32 : 24;
  const afterBits = to === 'grey' ? (stats.transparent ? 16 : 8) : BITS_FOR[to]!;
  const palette = to === 'grey' ? 0 : to * (stats.transparent ? 4 : 3);
  return {
    before: (width * beforeBits * height) / 8,
    after: Math.ceil((width * afterBits) / 8) * height + palette,
    beforeBits,
    afterBits,
  };
}
