// M22 (GB3): the adjustments a pixel layer's colours can be given — greyscale, black and white
// (threshold), brightness / contrast, levels, exposure, colour balance (shadows, midtones,
// highlights), shadows / highlights, hue / saturation / lightness and colourise, temperature /
// tint, replace colour and invert. Each is a pure function from a raster to a new one of the same
// size, done tile by tile (look-up tables where a channel's new value depends only on its old
// one), quick enough for 12 megapixels. Transparent pixels and a pixel's alpha stay as they were;
// a tile that comes out the same is the very same tile (GN1). A layer mask (one channel of greys)
// takes only levels, brightness / contrast, black and white and invert.
import { normaliseHex } from '../../colour.ts';
import { EditError } from '../../model/errors.ts';
import type { Raster } from './raster.ts';
import { tileRect } from './raster.ts';

/** Moves along one colour axis, −100 to 100 (the first colour named: negative). */
export interface Tones {
  cyanRed: number;
  magentaGreen: number;
  yellowBlue: number;
}

export type LevelsChannel = 'rgb' | 'red' | 'green' | 'blue';

export interface AdjustmentSettings {
  greyscale: Record<string, never>;
  /** Black and white: a pixel this bright (0–255) or brighter is white, a darker one black. */
  threshold: { level: number };
  /** Brightness −150 to 150 (levels added); contrast −100 to 100 %. */
  brightnessContrast: { brightness: number; contrast: number };
  /** 0–255 each; gamma 0.1–9.99 (above 1 brightens the middle tones); one channel or all. */
  levels: {
    inBlack: number;
    inWhite: number;
    gamma: number;
    outBlack: number;
    outWhite: number;
    channel: LevelsChannel;
  };
  /** Stops of light, −5 to 5: +1 doubles it. */
  exposure: { stops: number };
  colourBalance: {
    shadows: Tones;
    midtones: Tones;
    highlights: Tones;
    /** The brightness kept as it was: only the colour moves. */
    preserveLuminosity: boolean;
  };
  /** Lift the shadows, recover the highlights: 0–100 % each; the area looked at, in image px. */
  shadowsHighlights: { shadows: number; highlights: number; radius: number };
  /**
   * Hue −180° to 180°, saturation and lightness −100 to 100 %; colourised: every pixel given the
   * hue (0–360°) and saturation (0–100 %), its brightness kept.
   */
  hueSaturation: { hue: number; saturation: number; lightness: number; colourise: boolean };
  /** −100 to 100 each: warmer (more red, less blue); more magenta (less green). */
  temperatureTint: { temperature: number; tint: number };
  /**
   * The colours near `colour` (#rrggbb) — up to `fuzziness` (0–200) levels away, the nearer the
   * more — have their hue (−180° to 180°), saturation and lightness (−100 to 100 %) moved.
   */
  replaceColour: {
    colour: string;
    fuzziness: number;
    hue: number;
    saturation: number;
    lightness: number;
  };
  invert: Record<string, never>;
}

export type AdjustmentKind = keyof AdjustmentSettings;

/** One adjustment with its settings. */
export type AnyAdjustment = {
  [K in AdjustmentKind]: { kind: K; settings: AdjustmentSettings[K] };
}[AdjustmentKind];

const NONE: Tones = { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 };

const DEFAULTS: AdjustmentSettings = {
  greyscale: {},
  threshold: { level: 128 },
  brightnessContrast: { brightness: 0, contrast: 0 },
  levels: { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255, channel: 'rgb' },
  exposure: { stops: 0 },
  colourBalance: { shadows: NONE, midtones: NONE, highlights: NONE, preserveLuminosity: true },
  shadowsHighlights: { shadows: 0, highlights: 0, radius: 30 },
  hueSaturation: { hue: 0, saturation: 0, lightness: 0, colourise: false },
  temperatureTint: { temperature: 0, tint: 0 },
  replaceColour: { colour: '#000000', fuzziness: 40, hue: 0, saturation: 0, lightness: 0 },
  invert: {},
};

/** The settings an adjustment starts from (they change nothing, but where there are none). */
export const defaultSettings = <K extends AdjustmentKind>(kind: K): AdjustmentSettings[K] =>
  structuredClone(DEFAULTS[kind]);

/** The adjustments in the order the menu gives them, with their names and where they work. */
export const ADJUSTMENTS: readonly { kind: AdjustmentKind; label: string; mask: boolean }[] = [
  { kind: 'brightnessContrast', label: 'Brightness / contrast', mask: true },
  { kind: 'levels', label: 'Levels', mask: true },
  { kind: 'exposure', label: 'Exposure', mask: false },
  { kind: 'shadowsHighlights', label: 'Shadows / highlights', mask: false },
  { kind: 'hueSaturation', label: 'Hue / saturation', mask: false },
  { kind: 'colourBalance', label: 'Colour balance', mask: false },
  { kind: 'temperatureTint', label: 'Temperature / tint', mask: false },
  { kind: 'replaceColour', label: 'Replace colour', mask: false },
  { kind: 'threshold', label: 'Black and white', mask: true },
  { kind: 'greyscale', label: 'Greyscale', mask: false },
  { kind: 'invert', label: 'Invert', mask: true },
];

const entry = (kind: AdjustmentKind) => ADJUSTMENTS.find((a) => a.kind === kind)!;
export const adjustmentLabel = (kind: AdjustmentKind): string => entry(kind).label;
/** Whether it can be done on a layer mask (one channel of greys). */
export const worksOnMask = (kind: AdjustmentKind): boolean => entry(kind).mask;
/** Why it is not done on a layer mask, and what is. */
export const maskRefusal = (kind: AdjustmentKind): string =>
  `${adjustmentLabel(kind)} changes colours, and a layer mask has only greys (how much of the layer shows). On a mask use Levels, Brightness / contrast, Black and white or Invert — or stop editing the mask to adjust the layer.`;

// ---- numbers ----

/** `n` within lo–hi; not a number: `fallback`. */
const within = (n: unknown, lo: number, hi: number, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
const byte = (v: number) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
/** The brightness the eye sees (ITU-R BT.601), 0–255 — as Reduce colours' greys. */
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

// ---- going over the tiles ----

type Kernel = (src: Uint8ClampedArray, out: Uint8ClampedArray, tileIndex: number) => void;

function sameBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * A new raster with `kernel` run over each tile (`out` starts as a copy of `src`, so it changes
 * only what it means to). A bitmap's empty tile (transparent) stays empty; a mask's is all 0 and
 * is worked on too unless `zeroStays`. Tiles that come out the same are the very same tiles.
 */
function mapTiles<R extends Raster>(r: R, kernel: Kernel, zeroStays = true): R {
  let changed = false;
  const tiles = r.tiles.map((tile, i) => {
    if (!tile && (r.channels === 4 || zeroStays)) return tile;
    const at = tileRect(r, i);
    const src = tile ?? new Uint8ClampedArray(at.width * at.height * r.channels);
    const out = src.slice();
    kernel(src, out, i);
    if (sameBytes(src, out)) return tile;
    changed = true;
    return out.some((v) => v !== 0) ? out : null;
  });
  return changed ? ({ ...r, tiles } as R) : r;
}

/** Per-channel tables: a bitmap's red, green and blue (or a mask's one channel: `red`). */
function withTables<R extends Raster>(
  r: R,
  red: Uint8Array,
  green: Uint8Array = red,
  blue: Uint8Array = red,
): R {
  const identity = (t: Uint8Array) => t.every((v, i) => v === i);
  if (identity(red) && identity(green) && identity(blue)) return r;
  if (r.channels === 1)
    return mapTiles(
      r,
      (src, out) => {
        for (let i = 0; i < src.length; i++) out[i] = red[src[i]!]!;
      },
      red[0] === 0,
    );
  return mapTiles(r, (src, out) => {
    for (let i = 0; i < src.length; i += 4) {
      if (src[i + 3] === 0) continue;
      out[i] = red[src[i]!]!;
      out[i + 1] = green[src[i + 1]!]!;
      out[i + 2] = blue[src[i + 2]!]!;
    }
  });
}

function table(f: (v: number) => number): Uint8Array {
  const t = new Uint8Array(256);
  for (let v = 0; v < 256; v++) t[v] = byte(f(v));
  return t;
}

/** Each opaque or partly see-through pixel of a bitmap changed by `f` (writing r, g, b into `to`). */
function perPixel<R extends Raster>(
  r: R,
  f: (r: number, g: number, b: number, to: Float64Array, index: number) => void,
): R {
  const to = new Float64Array(3);
  return mapTiles(r, (src, out, tileIndex) => {
    const at = tileRect(r, tileIndex);
    for (let y = 0, i = 0; y < at.height; y++) {
      const first = (at.y + y) * r.width + at.x;
      for (let x = 0; x < at.width; x++, i += 4) {
        if (src[i + 3] === 0) continue;
        f(src[i]!, src[i + 1]!, src[i + 2]!, to, first + x);
        out[i] = byte(to[0]!);
        out[i + 1] = byte(to[1]!);
        out[i + 2] = byte(to[2]!);
      }
    }
  });
}

// ---- HSL, in floats (h 0–360, s and l 0–1; r, g, b 0–255) ----

const hsl = new Float64Array(3);
function toHsl(r: number, g: number, b: number): void {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  hsl[0] = h;
  hsl[1] = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  hsl[2] = l;
}
function fromHsl(h: number, s: number, l: number, to: Float64Array): void {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  // No arrays made: this runs for every pixel.
  if (hh < 1) {
    r = c;
    g = x;
  } else if (hh < 2) {
    r = x;
    g = c;
  } else if (hh < 3) {
    g = c;
    b = x;
  } else if (hh < 4) {
    g = x;
    b = c;
  } else if (hh < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  to[0] = (r + m) * 255;
  to[1] = (g + m) * 255;
  to[2] = (b + m) * 255;
}
const moveSaturation = (s: number, by: number) => Math.min(1, s * (1 + by / 100));
const moveLightness = (l: number, by: number) =>
  by < 0 ? l * (1 + by / 100) : l + (1 - l) * (by / 100);

// ---- the adjustments ----

function greyscale<R extends Raster>(r: R): R {
  return perPixel(r, (red, g, b, to) => {
    const y = Math.round(luma(red, g, b));
    to[0] = to[1] = to[2] = y;
  });
}

function threshold<R extends Raster>(r: R, s: AdjustmentSettings['threshold']): R {
  const level = within(s.level, 0, 255, 128);
  if (r.channels === 1)
    return withTables(
      r,
      table((v) => (v >= level ? 255 : 0)),
    );
  return perPixel(r, (red, g, b, to) => {
    to[0] = to[1] = to[2] = Math.round(luma(red, g, b)) >= level ? 255 : 0;
  });
}

function brightnessContrast<R extends Raster>(
  r: R,
  s: AdjustmentSettings['brightnessContrast'],
): R {
  const brightness = within(s.brightness, -150, 150, 0);
  // 0 % keeps the levels, −100 % makes them all the middle grey, 100 % all black or white.
  const k = Math.tan(((within(s.contrast, -100, 100, 0) / 100 + 1) * Math.PI) / 4);
  return withTables(
    r,
    table((v) => (v + brightness - 127.5) * k + 127.5),
  );
}

function levels<R extends Raster>(r: R, s: AdjustmentSettings['levels']): R {
  const inBlack = within(s.inBlack, 0, 254, 0);
  const inWhite = within(s.inWhite, inBlack + 1, 255, 255);
  const gamma = within(s.gamma, 0.1, 9.99, 1);
  const outBlack = within(s.outBlack, 0, 255, 0);
  const outWhite = within(s.outWhite, 0, 255, 255);
  const t = table((v) => {
    const x = Math.min(1, Math.max(0, (v - inBlack) / (inWhite - inBlack)));
    return outBlack + x ** (1 / gamma) * (outWhite - outBlack);
  });
  if (r.channels === 1 || s.channel === 'rgb' || !['red', 'green', 'blue'].includes(s.channel))
    return withTables(r, t);
  const same = table((v) => v);
  return withTables(
    r,
    s.channel === 'red' ? t : same,
    s.channel === 'green' ? t : same,
    s.channel === 'blue' ? t : same,
  );
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (l: number) => {
  const c = Math.min(1, Math.max(0, l));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};

function exposure<R extends Raster>(r: R, s: AdjustmentSettings['exposure']): R {
  const gain = 2 ** within(s.stops, -5, 5, 0);
  return withTables(
    r,
    table((v) => toSrgb(toLinear(v) * gain)),
  );
}

/** How much of each tone a channel's value is: shadows near 0, midtones about 128, highlights near 255. */
const shadowWeight = (x: number) => Math.max(0, 1 - 2 * x) ** 2;
const midWeight = (x: number) => 4 * x * (1 - x);
const highWeight = (x: number) => Math.max(0, 2 * x - 1) ** 2;

function colourBalance<R extends Raster>(r: R, s: AdjustmentSettings['colourBalance']): R {
  const tone = (t: Tones | undefined) => ({
    cyanRed: within(t?.cyanRed, -100, 100, 0),
    magentaGreen: within(t?.magentaGreen, -100, 100, 0),
    yellowBlue: within(t?.yellowBlue, -100, 100, 0),
  });
  const [sh, mid, hi] = [tone(s.shadows), tone(s.midtones), tone(s.highlights)];
  /** A channel's new value (unrounded) along one axis. */
  const curve = (axis: keyof Tones) => {
    const c = new Float64Array(256);
    for (let v = 0; v < 256; v++) {
      const x = v / 255;
      c[v] = v + sh[axis] * shadowWeight(x) + mid[axis] * midWeight(x) + hi[axis] * highWeight(x);
    }
    return c;
  };
  const [cr, cg, cb] = [curve('cyanRed'), curve('magentaGreen'), curve('yellowBlue')];
  const still = (c: Float64Array) => c.every((v, i) => v === i);
  if (still(cr) && still(cg) && still(cb)) return r;
  const round = (c: Float64Array) => Uint8Array.from(c, byte);
  if (!s.preserveLuminosity) return withTables(r, round(cr), round(cg), round(cb));
  return perPixel(r, (red, g, b, to) => {
    const nr = Math.min(255, Math.max(0, cr[red]!));
    const ng = Math.min(255, Math.max(0, cg[g]!));
    const nb = Math.min(255, Math.max(0, cb[b]!));
    const d = luma(red, g, b) - luma(nr, ng, nb);
    to[0] = nr + d;
    to[1] = ng + d;
    to[2] = nb + d;
  });
}

/**
 * A box blur of a full-size channel of floats, `radius` px each way, along the rows and then down
 * the columns (running sums: as quick for any radius); past the edges the edge pixel again.
 */
function boxBlur(v: Float32Array, width: number, height: number, radius: number): Float32Array {
  const n = 2 * radius + 1;
  const across = new Float32Array(v.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const last = row + width - 1;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += v[Math.min(last, Math.max(row, row + k))]!;
    for (let x = 0; x < width; x++) {
      across[row + x] = sum / n;
      sum += v[Math.min(last, row + x + radius + 1)]! - v[Math.max(row, row + x - radius)]!;
    }
  }
  const out = new Float32Array(v.length);
  const sums = new Float64Array(width);
  const rowAt = (y: number) => Math.min(height - 1, Math.max(0, y)) * width;
  for (let k = -radius; k <= radius; k++) {
    const row = rowAt(k);
    for (let x = 0; x < width; x++) sums[x]! += across[row + x]!;
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const coming = rowAt(y + radius + 1);
    const going = rowAt(y - radius);
    for (let x = 0; x < width; x++) {
      out[row + x] = sums[x]! / n;
      sums[x]! += across[coming + x]! - across[going + x]!;
    }
  }
  return out;
}

function shadowsHighlights<R extends Raster>(
  r: R,
  s: AdjustmentSettings['shadowsHighlights'],
  scale: number,
): R {
  const lift = within(s.shadows, 0, 100, 0) / 100;
  const recover = within(s.highlights, 0, 100, 0) / 100;
  if (lift === 0 && recover === 0) return r;
  // The brightness of the area round each pixel: a box blur three times (near a Gaussian).
  const { width, height } = r;
  const around = new Float32Array(width * height);
  r.tiles.forEach((tile, i) => {
    if (!tile) return;
    const at = tileRect(r, i);
    for (let y = 0; y < at.height; y++)
      for (let x = 0; x < at.width; x++) {
        const k = (y * at.width + x) * 4;
        around[(at.y + y) * width + at.x + x] = luma(tile[k]!, tile[k + 1]!, tile[k + 2]!) / 255;
      }
  });
  const radius = Math.round(within(s.radius, 0, 500, 30) / Math.max(1e-6, scale) / 3);
  let near: Float32Array = around;
  if (radius > 0) for (let n = 0; n < 3; n++) near = boxBlur(near, width, height, radius);
  // The new brightness (0–255) for each brightness of the area round (0–255) and of the pixel:
  // darks in a dark area lifted (a gamma under 1), brights in a bright area brought down.
  const target = new Float32Array(256 * 256);
  for (let a = 0; a < 256; a++) {
    const up = 1 / (1 + 4 * lift * shadowWeight(a / 255));
    const down = 1 / (1 + 4 * recover * highWeight(a / 255));
    for (let v = 0; v < 256; v++) {
      let now = (v / 255) ** up;
      now = 1 - (1 - now) ** down;
      target[a * 256 + v] = now * 255;
    }
  }
  return perPixel(r, (red, g, b, to, index) => {
    const y = luma(red, g, b);
    const now = target[Math.round(near[index]! * 255) * 256 + Math.round(y)]!;
    // The colour kept: every channel in proportion (from black, the same amount added).
    if (y > 1) {
      const k = now / y;
      to[0] = red * k;
      to[1] = g * k;
      to[2] = b * k;
    } else {
      to[0] = red + now - y;
      to[1] = g + now - y;
      to[2] = b + now - y;
    }
  });
}

function hueSaturation<R extends Raster>(r: R, s: AdjustmentSettings['hueSaturation']): R {
  const lightness = within(s.lightness, -100, 100, 0);
  if (s.colourise) {
    const hue = within(s.hue, -360, 360, 0);
    const sat = within(s.saturation, 0, 100, 25) / 100;
    return perPixel(r, (red, g, b, to) =>
      fromHsl(hue, sat, moveLightness(luma(red, g, b) / 255, lightness), to),
    );
  }
  const hue = within(s.hue, -180, 180, 0);
  const saturation = within(s.saturation, -100, 100, 0);
  if (hue === 0 && saturation === 0 && lightness === 0) return r;
  return perPixel(r, (red, g, b, to) => {
    toHsl(red, g, b);
    fromHsl(
      hsl[0]! + hue,
      moveSaturation(hsl[1]!, saturation),
      moveLightness(hsl[2]!, lightness),
      to,
    );
  });
}

function temperatureTint<R extends Raster>(r: R, s: AdjustmentSettings['temperatureTint']): R {
  const t = within(s.temperature, -100, 100, 0) / 100;
  const tint = within(s.tint, -100, 100, 0) / 100;
  return withTables(
    r,
    table((v) => v * (1 + 0.3 * t)),
    table((v) => v * (1 - 0.3 * tint)),
    table((v) => v * (1 - 0.3 * t)),
  );
}

function replaceColour<R extends Raster>(r: R, s: AdjustmentSettings['replaceColour']): R {
  const hex =
    normaliseHex(typeof s.colour === 'string' ? s.colour : '') ?? DEFAULTS.replaceColour.colour;
  const n = parseInt(hex.slice(1), 16);
  const [pr, pg, pb] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const fuzziness = within(s.fuzziness, 0, 200, 40);
  const hue = within(s.hue, -180, 180, 0);
  const saturation = within(s.saturation, -100, 100, 0);
  const lightness = within(s.lightness, -100, 100, 0);
  if (hue === 0 && saturation === 0 && lightness === 0) return r;
  const shifted = new Float64Array(3);
  return perPixel(r, (red, g, b, to) => {
    to[0] = red;
    to[1] = g;
    to[2] = b;
    // How far from the picked colour, in levels (the distance in RGB over √3).
    const d = Math.sqrt(((red - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2) / 3);
    const w = fuzziness === 0 ? (d < 0.5 ? 1 : 0) : Math.max(0, 1 - d / fuzziness);
    if (w === 0) return;
    toHsl(red, g, b);
    fromHsl(
      hsl[0]! + hue,
      moveSaturation(hsl[1]!, saturation),
      moveLightness(hsl[2]!, lightness),
      shifted,
    );
    to[0] = red + (shifted[0]! - red) * w;
    to[1] = g + (shifted[1]! - g) * w;
    to[2] = b + (shifted[2]! - b) * w;
  });
}

const invert = <R extends Raster>(r: R): R =>
  withTables(
    r,
    table((v) => 255 - v),
  );

/**
 * GB3: `raster` (a bitmap, or a mask's one channel) with the adjustment done; `scale` is how many
 * image px each of its pixels covers (more than 1 for a reduced preview: the shadows / highlights
 * radius is in image px). The same raster back when nothing changes. On a mask, the colour
 * adjustments are refused (an EditError saying what to use).
 */
export function adjust<R extends Raster>(raster: R, a: AnyAdjustment, scale = 1): R {
  if (raster.channels === 1 && !worksOnMask(a.kind)) throw new EditError(maskRefusal(a.kind));
  const s = { ...DEFAULTS[a.kind], ...a.settings } as never;
  switch (a.kind) {
    case 'greyscale':
      return greyscale(raster);
    case 'threshold':
      return threshold(raster, s);
    case 'brightnessContrast':
      return brightnessContrast(raster, s);
    case 'levels':
      return levels(raster, s);
    case 'exposure':
      return exposure(raster, s);
    case 'colourBalance':
      return colourBalance(raster, s);
    case 'shadowsHighlights':
      return shadowsHighlights(raster, s, scale);
    case 'hueSaturation':
      return hueSaturation(raster, s);
    case 'temperatureTint':
      return temperatureTint(raster, s);
    case 'replaceColour':
      return replaceColour(raster, s);
    case 'invert':
      return invert(raster);
  }
}
