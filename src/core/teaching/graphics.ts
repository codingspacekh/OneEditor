// Learn ▸ Graphics (GL1, G9, G10, GC1, M23): the theory of syllabus 19.1 and 19.4 — bitmap and
// vector, resolution and print size, colour systems, the seven file formats for a scenario,
// compression on the student's own picture, bitmap to vector and image editing in society —
// worked out here so the page only shows it. The pictures are a reduced copy (DEMO_MAX_PIXELS)
// so a 12-megapixel photo never holds the page up; the bitmap writers (core/image/encode) and the
// JPEG codec (the page's canvas in the app) are handed in, so the tests can give fakes.
import {
  cmykToHex,
  hexToCmyk,
  hexToHsl,
  hexToRgb,
  hslToHex,
  rgbToHex,
  type Cmyk,
  type Hsl,
  type Rgb,
} from '../colour.ts';
import { FORMAT_INFO, type ColourDepth, type GraphicFormat } from '../graphics/export.ts';
import { reduceColours } from '../graphics/pixels/reduce-colours.ts';
import { bitmapFromRGBA, readRegion } from '../graphics/pixels/raster.ts';
import { toPx } from '../graphics/units.ts';
import type { Compression } from '../image/deflate.ts';
import {
  encodeOptions,
  type BitmapFormat,
  type EncodeOptions,
  type RgbaImage,
} from '../image/encode/index.ts';
import { imageFileSize } from './file-size.ts';

/** A short piece of theory (as Learn ▸ Animation's), with where it is tried in OneEditor. */
export interface GraphicsTopic {
  id: string;
  title: string;
  text: string[];
  where?: string;
}

// ---------------------------------------------------------------------------------------------
// Bitmap and vector (GL1, G10): the same star as a 16 × 16 px bitmap and as a vector shape.

/** The small bitmap's side, in pixels. */
export const BITMAP_SIDE = 16;

/** A five-pointed star (outer and inner corners in turn), point up, in the bitmap's pixels. */
export const STAR: readonly [number, number][] = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 === 0 ? 7.5 : 3;
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  return [8 + r * Math.cos(a), 8.5 + r * Math.sin(a)] as [number, number];
});

/** Even–odd rule: whether (x, y) is inside the polygon. */
export function pointInPolygon(
  x: number,
  y: number,
  polygon: readonly [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * How much of each pixel (rows from the top) the polygon covers, 0–1, from `samples` × `samples`
 * points in each: the soft edge a camera or a drawing program gives a bitmap.
 */
export function coverage(
  polygon: readonly [number, number][],
  side: number,
  samples = 4,
): Float32Array {
  const out = new Float32Array(side * side);
  for (let py = 0; py < side; py++)
    for (let px = 0; px < side; px++) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++)
          if (pointInPolygon(px + (sx + 0.5) / samples, py + (sy + 0.5) / samples, polygon)) hits++;
      out[py * side + px] = hits / (samples * samples);
    }
  return out;
}

/** G10: the same star as a bitmap `side` px wide: what fewer or more pixels make of it. */
export function starBitmap(side: number): Float32Array {
  const k = side / BITMAP_SIDE;
  return coverage(
    STAR.map(([x, y]) => [x * k, y * k] as [number, number]),
    side,
  );
}

/** G10: the star printed at one size from pictures this many pixels across. */
export const PRINT_DEMO_PIXELS: readonly number[] = [8, 16, 32, 64];

/** The part of the picture shown at a zoom (1 = all of it), centred on the star's top point. */
export function zoomView(zoom: number): { x: number; y: number; size: number } {
  const z = Math.max(1, zoom);
  const size = BITMAP_SIDE / z;
  const [tx, ty] = STAR[0]!;
  const clamp = (v: number) => Math.max(0, Math.min(BITMAP_SIDE - size, v));
  return { x: clamp(tx - size / 2), y: clamp(ty + 1 - size / 2), size };
}

interface Kind {
  what: string;
  uses: string[];
  pros: string[];
  cons: string[];
}

export const BITMAP_VECTOR: { bitmap: Kind; vector: Kind } = {
  bitmap: {
    what: 'A grid of small squares called pixels; each pixel is one colour. The file stores the colour of every pixel.',
    uses: [
      'Photographs from a camera or a phone',
      'Scanned pictures and documents',
      'Pictures painted in painting software',
    ],
    pros: [
      'Shows real-life detail: every small change of colour and light in a photograph.',
      'Each pixel can be edited: retouching, filters, clone and blur.',
      'Opens almost everywhere (JPG and PNG in every browser and phone).',
    ],
    cons: [
      'Pixelates when it is enlarged: the pixels grow into visible squares and it looks blurry or blocky.',
      'Large files: the more pixels (the higher the resolution), the bigger the file.',
      'Parts cannot be picked up and moved apart once they are pixels.',
    ],
  },
  vector: {
    what: 'Points (coordinates) joined by lines and curves worked out from equations, each shape with its fill and outline. The file stores the shapes, not pixels.',
    uses: [
      'Logos, which are printed small on a card and large on a sign',
      'Icons, diagrams, maps and plans',
      'Characters for an animation',
    ],
    pros: [
      'Scales to any size without losing quality: it never pixelates, as the shapes are drawn again at each size.',
      'Small files for drawings: a few numbers for each shape.',
      'Each shape stays editable: its colour, size and nodes can be changed later.',
    ],
    cons: [
      'Cannot show a photograph realistically: it would need very many shapes.',
      'A realistic picture takes a lot of work to draw.',
      'Must be drawn into pixels to show on a screen; some programs and websites do not take SVG.',
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// Resolution and print size (G10).

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A picture's printed size at a dpi, in inches and cm (2 decimals). */
export function printSize(
  px: { width: number; height: number },
  dpi: number,
): { in: { width: number; height: number }; cm: { width: number; height: number } } {
  const inch = (n: number) => n / dpi;
  return {
    in: { width: round2(inch(px.width)), height: round2(inch(px.height)) },
    cm: { width: round2(inch(px.width) * 2.54), height: round2(inch(px.height) * 2.54) },
  };
}

/** The pixels needed to print a length at a dpi. */
export function pixelsFor(length: number, unit: 'cm' | 'in', dpi: number): number {
  return Math.round(toPx(length, unit, dpi));
}

/** G10: as Image size warns (step 2): below 150 dpi a print blurs. */
export const PRINT_MIN_DPI = 150;
/** G10: more than 4 × the pixels shown on the web is wasted. */
export const WEB_MAX_TIMES = 4;

export interface Verdict {
  level: 'low' | 'ok' | 'good' | 'high';
  text: string;
}

/** G10: what a resolution does to a print. */
export function printVerdict(dpi: number): Verdict {
  if (dpi < PRINT_MIN_DPI)
    return {
      level: 'low',
      text: `Too low for print: below ${PRINT_MIN_DPI} dpi each pixel is big enough to see, so the print looks blurred or blocky (pixelated).`,
    };
  if (dpi < 300)
    return {
      level: 'ok',
      text: 'Fine for a poster seen from a distance; close up, 300 dpi looks sharper.',
    };
  if (dpi <= 600)
    return {
      level: 'good',
      text: 'Good for print: 300 dpi is the usual resolution for photographs and magazines.',
    };
  return {
    level: 'high',
    text: 'Higher than a printer can show: the extra pixels add no detail, only a larger file that is slower to send and store.',
  };
}

/** G10: a picture `px` wide shown `shown` px wide on a web page. */
export function webVerdict(px: number, shown: number): Verdict {
  const times = px / shown;
  if (times < 1)
    return {
      level: 'low',
      text: 'Too low: the browser stretches the pixels to fill the space, so it looks blurred.',
    };
  if (times <= WEB_MAX_TIMES)
    return {
      level: 'good',
      text: 'Right for the web: enough pixels to look sharp, even on a high-resolution screen.',
    };
  return {
    level: 'high',
    text: `Too high: over ${WEB_MAX_TIMES} × the pixels the page shows. The browser shrinks it anyway, so the larger file only takes longer to download and uses more storage.`,
  };
}

// ---------------------------------------------------------------------------------------------
// Colour systems (G9).

export interface ColourCodes {
  hex: string;
  rgb: Rgb;
  hsl: Hsl;
  cmyk: Cmyk;
  text: { hex: string; rgb: string; hsl: string; cmyk: string };
}

/** G9: one colour in each system. */
export function colourCodes(hex: string): ColourCodes {
  const rgb = hexToRgb(hex);
  const hsl = hexToHsl(hex);
  const cmyk = hexToCmyk(hex);
  return {
    hex: rgbToHex(rgb),
    rgb,
    hsl,
    cmyk,
    text: {
      hex: rgbToHex(rgb).toUpperCase(),
      rgb: `RGB ${rgb.r}, ${rgb.g}, ${rgb.b}`,
      hsl: `HSL ${hsl.h}°, ${hsl.s} %, ${hsl.l} %`,
      cmyk: `CMYK ${cmyk.c} %, ${cmyk.m} %, ${cmyk.y} %, ${cmyk.k} %`,
    },
  };
}

/** G9: three lights overlapping on black: where two meet their light adds up. */
export function additiveMix({
  r,
  g,
  b,
}: Rgb): Record<'r' | 'g' | 'b' | 'rg' | 'gb' | 'rb' | 'rgb', string> {
  return {
    r: rgbToHex({ r, g: 0, b: 0 }),
    g: rgbToHex({ r: 0, g, b: 0 }),
    b: rgbToHex({ r: 0, g: 0, b }),
    rg: rgbToHex({ r, g, b: 0 }),
    gb: rgbToHex({ r: 0, g, b }),
    rb: rgbToHex({ r, g: 0, b }),
    rgb: rgbToHex({ r, g, b }),
  };
}

/** G9: three inks overlapping on white paper: each takes away (absorbs) some light. */
export function subtractiveMix({
  c,
  m,
  y,
}: Omit<Cmyk, 'k'>): Record<'c' | 'm' | 'y' | 'cm' | 'my' | 'cy' | 'cmy', string> {
  const ink = (cc: number, mm: number, yy: number) => cmykToHex({ c: cc, m: mm, y: yy, k: 0 });
  return {
    c: ink(c, 0, 0),
    m: ink(0, m, 0),
    y: ink(0, 0, y),
    cm: ink(c, m, 0),
    my: ink(0, m, y),
    cy: ink(c, 0, y),
    cmy: ink(c, m, y),
  };
}

/** G9: `steps` colours round the hue wheel from red (0°), at a saturation and lightness. */
export function hueWheel(steps: number, s = 100, l = 50): string[] {
  return Array.from({ length: steps }, (_, i) => hslToHex({ h: (360 * i) / steps, s, l }));
}

export interface Swatch {
  /** The number a designer gives the printer. */
  code: string;
  name: string;
  /** The ink recipe the swatch book gives. */
  cmyk: Cmyk;
  /** How it shows on the screen. */
  hex: string;
}

const swatch = (code: string, name: string, cmyk: Cmyk): Swatch => ({
  code,
  name,
  cmyk,
  hex: cmykToHex(cmyk),
});

/**
 * G9: an example colour matching system — a book of numbered colours, each with an exact ink
 * recipe, so a logo prints the same colour at any print shop. (Real ones are sold by companies;
 * these numbers are made up for the lesson.)
 */
export const MATCHING_SWATCHES: readonly Swatch[] = [
  swatch('OE 101', 'Signal red', { c: 0, m: 95, y: 85, k: 5 }),
  swatch('OE 204', 'Sunflower', { c: 0, m: 20, y: 95, k: 0 }),
  swatch('OE 352', 'Leaf green', { c: 75, m: 0, y: 90, k: 10 }),
  swatch('OE 418', 'Ocean blue', { c: 100, m: 45, y: 0, k: 15 }),
  swatch('OE 520', 'Plum', { c: 45, m: 90, y: 10, k: 20 }),
  swatch('OE 907', 'Slate', { c: 30, m: 15, y: 0, k: 70 }),
];

export const COLOUR_TOPICS: readonly GraphicsTopic[] = [
  {
    id: 'rgb',
    title: 'RGB — light (additive)',
    text: [
      'A screen makes every colour from red, green and blue light. Adding light makes it brighter: red and green make yellow, and all three at full strength make white. No light is black.',
      'Each of the three is 0–255 (one byte, 8 bits), so 24 bits a pixel give 256 × 256 × 256 = 16 777 216 colours. As hex, two digits each: #FF0000 is red, #000000 black, #FFFFFF white.',
      'Used for anything shown on a screen: websites, apps, video, digital photographs.',
    ],
  },
  {
    id: 'cmyk',
    title: 'CMYK — ink (subtractive)',
    text: [
      'A printer puts cyan, magenta, yellow and black (K, the key) ink on white paper. Each ink absorbs (subtracts) some of the light that the paper would reflect, so more ink makes a colour darker: cyan and magenta make blue; all three make a muddy near-black, so black ink is used for black and for text.',
      'Each ink is 0–100 %. Print uses CMYK because paper gives no light of its own: the colour seen is the light left after the inks absorb some. Some bright screen colours (vivid greens and blues) cannot be printed, so a design for print is checked in CMYK.',
    ],
  },
  {
    id: 'hsl',
    title: 'HSL — the way people describe colour',
    text: [
      'Hue is the base colour, an angle round the colour wheel (0° red, 120° green, 240° blue); saturation is how strong the colour is (0 % grey, 100 % pure); lightness goes from black (0 %) through the pure colour (50 %) to white (100 %).',
      'It is easy to make a colour paler, darker or duller by changing one number, so designers use it to pick shades of one colour. The computer still turns it into RGB to show it.',
    ],
  },
  {
    id: 'cms',
    title: 'CMS — a colour matching system',
    text: [
      'Not a colour system of its own: a way of making a colour match exactly in another place. A printer’s colour matching system is a book of numbered colours, each with an exact ink recipe, so a company’s logo is the same red on every card, van and website.',
      'In graphics software the coursebook’s example is the eyedropper: click a colour in a picture (the red of a car) to find its RGB and CMYK values, then use the very same colour in a new shape.',
    ],
    where:
      'Graphics ▸ any colour box ▸ the eyedropper; the colour picker shows RGB, hex, HSL and CMYK together.',
  },
];

// ---------------------------------------------------------------------------------------------
// File formats for a scenario (GL1, syllabus 19.1).

export interface Advice {
  format: GraphicFormat;
  why: string;
}

export interface Scenario {
  id:
    'web-photo' | 'print' | 'logo' | 'transparency' | 'animation' | 'document' | 'master' | 'icon';
  label: string;
  best: Advice[];
  avoid: Advice[];
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'web-photo',
    label: 'A photograph for a website',
    best: [
      {
        format: 'jpg',
        why: 'Lossy compression makes a photograph’s file many times smaller, so the page downloads quickly; at a high quality the loss is hard to see.',
      },
      {
        format: 'png',
        why: 'Keeps every pixel, but a photograph as a PNG is several times larger than a JPG: use it only if it must be exact or see-through.',
      },
    ],
    avoid: [
      { format: 'bmp', why: 'Not compressed: a huge file that takes a long time to download.' },
      { format: 'tiff', why: 'Browsers do not show TIFF files, and they are large.' },
      { format: 'gif', why: 'Only 256 colours: a photograph gets bands and speckles.' },
    ],
  },
  {
    id: 'print',
    label: 'A photograph to print in a magazine or on a poster',
    best: [
      {
        format: 'tiff',
        why: 'Lossless, with the resolution (dpi) inside: print shops and publishers ask for TIFF so no detail is lost.',
      },
      {
        format: 'pdf',
        why: 'A whole page ready to print at its exact size, the photograph inside and any text kept sharp.',
      },
    ],
    avoid: [
      { format: 'gif', why: 'Only 256 colours: far too few for a printed photograph.' },
      {
        format: 'jpg',
        why: 'Fine at the highest quality, but each lossy save loses detail that shows in a large print.',
      },
    ],
  },
  {
    id: 'logo',
    label: 'A logo used small on a card and large on a sign',
    best: [
      {
        format: 'svg',
        why: 'Vector: the logo is drawn again at every size, so it stays sharp from a business card to a billboard, in a small file.',
      },
      { format: 'pdf', why: 'Keeps the logo vector for a print shop, at the exact size.' },
      {
        format: 'png',
        why: 'For a place that does not take SVG: export a PNG at the size needed, with a see-through background.',
      },
    ],
    avoid: [
      {
        format: 'jpg',
        why: 'Blurs the sharp edges and text of a logo, and cannot have a see-through background.',
      },
      {
        format: 'bmp',
        why: 'Pixels and no compression: pixelates when enlarged and the file is large.',
      },
    ],
  },
  {
    id: 'transparency',
    label: 'A cut-out picture with a see-through background',
    best: [
      {
        format: 'png',
        why: '32-bit PNG keeps an alpha channel: every pixel from fully see-through to solid, so soft edges blend with any background.',
      },
      {
        format: 'gif',
        why: 'One colour can be see-through, so edges are hard (a pixel is see-through or not): fine for simple icons.',
      },
      {
        format: 'svg',
        why: 'For a drawing: shapes have no background at all unless one is drawn.',
      },
    ],
    avoid: [
      {
        format: 'jpg',
        why: 'No transparency: see-through parts become a solid colour (white or black).',
      },
      {
        format: 'bmp',
        why: 'Most programs ignore a BMP’s transparency and show a solid background.',
      },
    ],
  },
  {
    id: 'animation',
    label: 'A small moving banner or icon',
    best: [
      {
        format: 'gif',
        why: 'Holds several frames that play one after another, in every browser and chat app, with no player needed.',
      },
    ],
    avoid: [
      { format: 'jpg', why: 'One still picture only.' },
      { format: 'bmp', why: 'One still picture only, and a large file.' },
    ],
  },
  {
    id: 'document',
    label: 'A poster or flyer to email or send to a printer',
    best: [
      {
        format: 'pdf',
        why: 'Opens the same on any computer, phone or print shop, at its exact page size, with the text and shapes kept sharp.',
      },
    ],
    avoid: [
      { format: 'svg', why: 'Not every program or printer opens it, and fonts may change.' },
      {
        format: 'gif',
        why: 'Only 256 colours and a fixed number of pixels: it blurs when printed large.',
      },
    ],
  },
  {
    id: 'master',
    label: 'A copy to keep and edit again later (no loss)',
    best: [
      {
        format: 'tiff',
        why: 'Lossless (no compression or LZW), with the resolution kept: the usual format for archives and scans.',
      },
      {
        format: 'png',
        why: 'Lossless and smaller than TIFF or BMP; every pixel comes back exactly.',
      },
      {
        format: 'bmp',
        why: 'Every pixel stored exactly with no compression: simple, and it opens in any Windows program, but large.',
      },
    ],
    avoid: [
      {
        format: 'jpg',
        why: 'Lossy: every time it is edited and saved again it loses a little more (generation loss).',
      },
    ],
  },
  {
    id: 'icon',
    label: 'A simple drawing or icon of a few flat colours, for the web',
    best: [
      {
        format: 'png',
        why: 'Lossless and small for flat colours, as runs of the same colour compress well; 8-bit PNG is smaller still.',
      },
      {
        format: 'gif',
        why: 'A few colours compress very well with LZW; up to 256 is enough for flat art.',
      },
      { format: 'svg', why: 'If it was drawn as shapes: the smallest and sharpest at any size.' },
    ],
    avoid: [
      { format: 'jpg', why: 'Makes blotches (artefacts) round sharp edges and flat colours.' },
    ],
  },
];

/** GL1: the advice for a scenario. */
export function advise(id: Scenario['id']): Scenario {
  return SCENARIOS.find((s) => s.id === id)!;
}

// ---------------------------------------------------------------------------------------------
// Compression on the student's picture (GC1, syllabus 19.4).

/** GC1: the demonstrations work on a copy of at most a million pixels. */
export const DEMO_MAX_PIXELS = 1_000_000;

/** A size of at most `maxPixels`, the shape kept; the same size when it already fits. */
export function fitWithin(
  width: number,
  height: number,
  maxPixels: number,
): { width: number; height: number } {
  if (width * height <= maxPixels) return { width, height };
  const k = Math.sqrt(maxPixels / (width * height));
  return { width: Math.max(1, Math.floor(width * k)), height: Math.max(1, Math.floor(height * k)) };
}

/** The picture made smaller, each new pixel the average of those under it (the same one if no change). */
export function shrink(image: RgbaImage, width: number, height: number): RgbaImage {
  if (width === image.width && height === image.height) return image;
  const out = new Uint8ClampedArray(width * height * 4);
  const src = image.data;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * image.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * image.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * image.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * image.width) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * image.width + xx) * 4;
          r += src[i]!;
          g += src[i + 1]!;
          b += src[i + 2]!;
          a += src[i + 3]!;
        }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * width + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return { width, height, data: out };
}

/** GC1: half the width and height: a quarter of the pixels. */
export const halve = (image: RgbaImage): RgbaImage =>
  shrink(image, Math.max(1, Math.ceil(image.width / 2)), Math.max(1, Math.ceil(image.height / 2)));

/** A part of the picture (kept inside it). */
export function cropImage(
  image: RgbaImage,
  rect: { x: number; y: number; width: number; height: number },
): RgbaImage {
  const x = Math.max(0, Math.min(image.width - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(rect.y)));
  const width = Math.max(1, Math.min(image.width - x, Math.round(rect.width)));
  const height = Math.max(1, Math.min(image.height - y, Math.round(rect.height)));
  const out = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * image.width + x) * 4;
    out.set(image.data.subarray(from, from + width * 4), row * width * 4);
  }
  return { width, height, data: out };
}

export interface DiffStats {
  /** The share of pixels changed at all, 0–1. */
  changed: number;
  /** The average change of a colour channel, in levels (0–255). */
  mean: number;
  /** The largest change of any channel. */
  most: number;
}

/**
 * GC1: the difference view — black where a pixel is the same, brighter the more it changed
 * (each channel's change × `gain`, so small losses show), and the numbers.
 */
export function difference(
  a: RgbaImage,
  b: RgbaImage,
  gain = 8,
): { image: RgbaImage; stats: DiffStats } {
  if (a.width !== b.width || a.height !== b.height)
    throw new Error('Only pictures of the same size can be compared.');
  const out = new Uint8ClampedArray(a.data.length);
  let changed = 0;
  let total = 0;
  let most = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let any = false;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i + c]! - b.data[i + c]!);
      if (d > 0) any = true;
      if (d > most) most = d;
      total += d;
      out[i + c] = d * gain;
    }
    if (any) changed++;
    out[i + 3] = 255;
  }
  const pixels = a.width * a.height;
  return {
    image: { width: a.width, height: a.height, data: out },
    stats: { changed: changed / pixels, mean: total / (pixels * 3), most },
  };
}

/** The picture as the page decodes it: the pixels (perhaps a reduced copy) and the file's own size. */
export interface DecodedPicture {
  image: RgbaImage;
  width: number;
  height: number;
}

/** GC1: what makes and opens a JPEG (the page's canvas in the app). */
export interface PictureCodec {
  /** A JPEG of the pixels at quality 1–100. */
  jpeg(image: RgbaImage, quality: number): Promise<Uint8Array>;
  /** A PNG, JPG, GIF or BMP file's pixels, made smaller to at most `maxPixels` if asked. */
  decode(bytes: Uint8Array, maxPixels?: number): Promise<DecodedPicture>;
}

/** The bitmap writers (core/image/encode's encodeBitmap). */
export type BitmapEncoder = (
  format: BitmapFormat,
  image: RgbaImage,
  options: EncodeOptions,
  compression: Compression,
) => Promise<Uint8Array>;

const why = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface JpegResult {
  quality: number;
  bytes: number;
  file: Uint8Array;
  /** The picture the JPEG opens as. */
  image: RgbaImage;
  diff: { image: RgbaImage; stats: DiffStats };
}

/** GC1: the picture saved as a JPEG at a quality, opened again and compared with the original. */
export async function jpegAt(
  image: RgbaImage,
  quality: number,
  codec: PictureCodec,
): Promise<JpegResult> {
  const file = await codec.jpeg(image, quality);
  const opened = (await codec.decode(file)).image;
  return { quality, bytes: file.length, file, image: opened, diff: difference(image, opened) };
}

export interface Generation {
  generation: number;
  quality: number;
  bytes: number;
  image: RgbaImage;
  /** How far it is from the original now. */
  fromOriginal: DiffStats;
  /** What this save changed. */
  fromPrevious: DiffStats;
}

/**
 * GC1: a JPEG opened and saved again `count` times. With `vary`, every other save is 10 lower in
 * quality, as when the picture goes through different programs or settings.
 */
export async function generations(
  image: RgbaImage,
  options: { quality: number; count: number; vary: boolean },
  codec: PictureCodec,
  onStep?: (step: Generation) => void,
): Promise<Generation[]> {
  const out: Generation[] = [];
  let current = image;
  for (let n = 1; n <= options.count; n++) {
    const quality =
      options.vary && n % 2 === 0 ? Math.max(1, options.quality - 10) : options.quality;
    const r = await jpegAt(current, quality, codec);
    const step: Generation = {
      generation: n,
      quality,
      bytes: r.bytes,
      image: r.image,
      fromOriginal: difference(image, r.image).stats,
      fromPrevious: r.diff.stats,
    };
    out.push(step);
    onStep?.(step);
    current = r.image;
  }
  return out;
}

/** Different colours used, counting no further than `limit` + 1. */
function countColours(image: RgbaImage, limit: number): number {
  const seen = new Set<number>();
  for (let i = 0; i < image.data.length; i += 4) {
    seen.add((image.data[i]! << 16) | (image.data[i + 1]! << 8) | image.data[i + 2]!);
    if (seen.size > limit) break;
  }
  return seen.size;
}

export type CompareFormat = 'png' | 'gif' | 'bmp' | 'tiff' | 'jpg';

export interface FormatResult {
  format: CompareFormat;
  depth: ColourDepth;
  /** The file's size; null when it could not be made. */
  bytes: number | null;
  file: Uint8Array | null;
  /** The picture comes back exactly (a GIF only when it has at most 256 colours). */
  lossless: boolean;
  /** The size with no compression at this depth (width × height × bits ÷ 8). */
  raw: number;
  /** Why it could not be made (an encoder not ready, or an error). */
  problem?: string;
}

export interface CompareDeps {
  encode: BitmapEncoder;
  codec: PictureCodec;
  compression: Compression;
  dpi: number;
  /** The JPG's quality. */
  quality: number;
}

const COMPARED: readonly { format: CompareFormat; depth: ColourDepth }[] = [
  { format: 'png', depth: 24 },
  { format: 'gif', depth: 8 },
  { format: 'bmp', depth: 24 },
  { format: 'tiff', depth: 24 },
  { format: 'jpg', depth: 24 },
];

/** GC1: the same (opaque) picture as PNG, GIF, BMP, TIFF and JPG, one after the other. */
export async function compareFormats(image: RgbaImage, deps: CompareDeps): Promise<FormatResult[]> {
  const fewColours = countColours(image, 256) <= 256;
  const out: FormatResult[] = [];
  for (const { format, depth } of COMPARED) {
    const raw = imageFileSize({ width: image.width, height: image.height, bits: depth }).bytes;
    const lossless = format === 'gif' ? fewColours : FORMAT_INFO[format].compression !== 'lossy';
    try {
      const file =
        format === 'jpg'
          ? await deps.codec.jpeg(image, deps.quality)
          : await deps.encode(
              format,
              image,
              encodeOptions({ format, depth, dither: true }, deps.dpi),
              deps.compression,
            );
      out.push({ format, depth, bytes: file.length, file, lossless, raw });
    } catch (error) {
      out.push({ format, depth, bytes: null, file: null, lossless, raw, problem: why(error) });
    }
  }
  return out;
}

/** GC1: the colour depths shown, from true colour to black and white. */
export const DEMO_DEPTHS: readonly (24 | 8 | 4 | 1)[] = [24, 8, 4, 1];

/**
 * GC1: the picture with its colours cut to what a depth holds (8 bits: 256, 4: 16, 1: 2), by
 * median cut and dithering, as Image ▸ Reduce colours does; 24 bits: the picture itself.
 */
export function depthPreview(image: RgbaImage, depth: 24 | 8 | 4 | 1, dither = true): RgbaImage {
  if (depth === 24) return image;
  const to = depth === 8 ? 256 : depth === 4 ? 16 : 2;
  const bitmap = bitmapFromRGBA(image.width, image.height, new Uint8ClampedArray(image.data));
  return {
    width: image.width,
    height: image.height,
    data: readRegion(reduceColours(bitmap, { to, dither })),
  };
}

export interface DepthStep {
  depth: 24 | 8 | 4 | 1;
  colours: number;
  /** Uncompressed: width × height × bits ÷ 8. */
  raw: number;
  /** As a PNG at this depth; null when it could not be made. */
  bytes: number | null;
  problem?: string;
  image: RgbaImage;
}

/**
 * GC1: the coursebook's first lossy example — fewer bits a pixel, fewer colours, a smaller file.
 * Each depth is saved as a PNG; the picture shown is that file opened again (`decode`), or, when
 * it could not be made or opened, the colours reduced here the same way.
 */
export async function depthSteps(
  image: RgbaImage,
  deps: Pick<CompareDeps, 'encode' | 'compression' | 'dpi'> & {
    decode?: (file: Uint8Array) => Promise<RgbaImage>;
  },
): Promise<DepthStep[]> {
  const out: DepthStep[] = [];
  for (const depth of DEMO_DEPTHS) {
    const raw = imageFileSize({ width: image.width, height: image.height, bits: depth }).bytes;
    const step = { depth, colours: 2 ** depth, raw };
    let file: Uint8Array;
    try {
      file = await deps.encode(
        'png',
        image,
        encodeOptions({ format: 'png', depth, dither: true }, deps.dpi),
        deps.compression,
      );
    } catch (error) {
      out.push({ ...step, bytes: null, problem: why(error), image: depthPreview(image, depth) });
      continue;
    }
    const opened = deps.decode ? await deps.decode(file).catch(() => null) : null;
    out.push({ ...step, bytes: file.length, image: opened ?? depthPreview(image, depth) });
  }
  return out;
}

export interface ResolutionStep {
  width: number;
  height: number;
  /** Uncompressed at 24 bits. */
  raw: number;
  /** As a JPEG at the quality chosen. */
  bytes: number;
  image: RgbaImage;
}

/** GC1: the coursebook's second lossy example — the resolution halved and halved again. */
export async function resolutionSteps(
  image: RgbaImage,
  codec: PictureCodec,
  quality: number,
): Promise<ResolutionStep[]> {
  const out: ResolutionStep[] = [];
  let current = image;
  for (let i = 0; i < 3; i++) {
    if (i > 0) current = halve(current);
    const file = await codec.jpeg(current, quality);
    out.push({
      width: current.width,
      height: current.height,
      raw: imageFileSize({ width: current.width, height: current.height, bits: 24 }).bytes,
      bytes: file.length,
      image: current,
    });
  }
  return out;
}

export const COMPRESSION_TOPICS: readonly GraphicsTopic[] = [
  {
    id: 'what',
    title: 'What compression is',
    text: [
      'Compression makes a file smaller, so it takes less storage, is quicker to email, upload and download, and a web page loads faster. The picture is compressed when it is saved and decompressed when it is opened.',
    ],
  },
  {
    id: 'lossless',
    title: 'Lossless compression',
    text: [
      'When the picture is opened again it is identical to the original: no data is lost, as when a file is zipped and unzipped. The file is not as small as with lossy compression.',
      'It works by writing repeated patterns in fewer bits: run-length encoding writes “200 white pixels” instead of 200 white pixels; LZW (GIF, TIFF) and deflate (PNG) keep a dictionary of patterns seen before. Flat colours and drawings compress well; photographs, with every pixel a little different, much less.',
    ],
  },
  {
    id: 'lossy',
    title: 'Lossy compression',
    text: [
      'Some data is removed for good, so the opened picture is not identical to the original, but the file is much smaller. JPEG keeps the brightness the eye sees and throws away fine detail and colour the eye hardly notices; a lower quality removes more, until blocks and smudges (artefacts) show round edges.',
      'The coursebook’s two other examples: changing the colour depth (fewer bits a pixel, so fewer colours) and changing the resolution (fewer pixels). Both lose data that cannot be put back.',
    ],
  },
  {
    id: 'tip',
    title: 'Keep the original',
    text: [
      'Never save over the original file with a lossy format: export under a new name, so the full-quality picture can be used again. Each time a JPEG is opened, changed and saved again it loses a little more.',
    ],
    where: 'Graphics ▸ Export (each format says whether it is lossless or lossy).',
  },
];

// ---------------------------------------------------------------------------------------------
// Bitmap to vector (GV5) and image editing in society (coursebook 18.1).

export const TRACE_TOPICS: readonly GraphicsTopic[] = [
  {
    id: 'trace',
    title: 'Tracing a bitmap',
    text: [
      'Tracing (vectorising) finds the areas of similar colour in a bitmap and draws round each with a vector shape: points joined by lines and curves, each filled with the area’s colour. A scanned drawing or logo becomes shapes that can be edited and enlarged.',
      'The fewer the colours and the less the detail chosen, the fewer and simpler the shapes; black and white makes a silhouette.',
    ],
    where:
      'Graphics ▸ Picture on the tool strip (or a picture layer), then Properties ▸ Trace bitmap… (colours, detail, smoothing, black and white); the picture is kept underneath to compare.',
  },
  {
    id: 'pros',
    title: 'Advantages and disadvantages',
    text: [
      'Advantages: the shapes scale to any size without pixelating; flat art (logos, cartoons, signatures) gives a small file; each part can be recoloured, moved or reshaped; it can be cut by a vinyl cutter or laser.',
      'Disadvantages: fine detail and soft shading are lost or simplified; a photograph becomes thousands of shapes and a larger file than the JPG; tracing takes time and the result usually needs tidying by hand.',
    ],
  },
];

export const SOCIETY_TOPICS: readonly GraphicsTopic[] = [
  {
    id: 'airbrush',
    title: 'Airbrushing',
    text: [
      'Photos in magazines and adverts are often edited (airbrushed) to make people look thinner or to remove wrinkles and spots. The company may sell more by showing a “perfect” model.',
      'But the picture is not real: people may strive for an impossible look, which can contribute to low self-esteem and mental-health problems. Some countries now require edited adverts to be labelled.',
    ],
  },
  {
    id: 'memes',
    title: 'Memes and fake scenes',
    text: [
      'A selection tool can cut a person out of one photo and place them in another, with the colours adjusted so they seem to belong: a scene that never happened. Memes add text (often vector text) to a bitmap photo.',
      'Memes can draw attention to an advert or be funny, but they can also mock people and situations, and may use a person’s image without their consent.',
    ],
  },
  {
    id: 'politics',
    title: 'Politics and news',
    text: [
      'Edited images can promote a political agenda: making a candidate look better, or crowds look bigger, or putting people where they never were. False versions of real events can mislead an audience on purpose.',
      'They can also be used against opponents, to place them in embarrassing situations or mock them, which can cause offence and influence voters with pictures that are not real. Checking where a picture came from matters.',
    ],
  },
  {
    id: 'consent',
    title: 'Consent and privacy',
    text: [
      'Editing or sharing a photo of a person without their permission can hurt them, damage their reputation or break the law, especially if it is changed to embarrass them. Ask before you publish a picture of someone.',
    ],
  },
  {
    id: 'copyright',
    title: 'Copyright',
    text: [
      'Photos and drawings belong to the person who made them. Using or editing someone else’s image without permission (a licence) can break copyright, even when it is changed. Use your own pictures, ones with a free licence, and credit the source.',
    ],
  },
  {
    id: 'good',
    title: 'Positive uses',
    text: [
      'Image editing also restores old and damaged photographs, removes red eye, improves medical and satellite images, and makes posters, covers and signs more attractive — the same tools, used honestly.',
    ],
  },
];
