// M23 step 5 (GN4): the Graphics document the Cross-platform job exports on Windows and on macOS
// (tests/e2e/cross-platform.spec.ts), and how the two exports are compared, as X6 compares the
// animations. Built here from code, the same on every computer: a photo-like pixel layer with an
// adjustment (hue / saturation) and two filters (zoom and Gaussian blur) done on its pixels;
// vector shapes with a linear and a radial gradient and an outline; a soft disc on a pixel layer
// screened over them at 85 % with a glow; and words in the bundled font. The pixel work is ours
// (the same JavaScript on both), so the layers' bytes must be the very same; the export is drawn
// by each computer's canvas, so the pictures must match closely, the words apart (each OS's font
// engine smooths the letters' edges its own way) — in the same place and alike.
import {
  createEllipse,
  createLayer,
  createRect,
  createStar,
  createText,
} from '../../src/core/animation/factory.ts';
import type { AnimationDoc, AnimObject } from '../../src/core/animation/types.ts';
import { createGraphic } from '../../src/core/graphics/document.ts';
import { adjust } from '../../src/core/graphics/pixels/adjust.ts';
import { runFilter } from '../../src/core/graphics/pixels/filter-specs.ts';
import { bitmapFromRGBA, type Bitmap, type Rect } from '../../src/core/graphics/pixels/raster.ts';

export const CROSS_GRAPHIC = { width: 480, height: 320 } as const;

/** Where the words are drawn: compared apart. */
export const TEXT_BOX: Rect = { x: 20, y: 246, width: 420, height: 66 };

/** A photo-like picture: a colour ramp, squares and rings (detail a filter drawn wrongly shows). */
function photo(): Bitmap {
  const { width: W, height: H } = CROSS_GRAPHIC;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const ring = Math.round(Math.hypot(x - 140, y - 120) / 9) % 2;
      px[i] = (x * 255) / W;
      px[i + 1] = ring ? 210 : (y * 255) / H;
      px[i + 2] = ((x >> 4) + (y >> 4)) & 1 ? 190 : 50;
      px[i + 3] = 255;
    }
  return bitmapFromRGBA(W, H, px);
}

/** A disc with a soft edge on transparent pixels, `size` across. */
function disc(size: number, colour: readonly [number, number, number]): Bitmap {
  const px = new Uint8ClampedArray(size * size * 4);
  const r = size / 2 - 6;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      const a = Math.max(0, Math.min(1, (r - d) / 4));
      if (a === 0) continue;
      px.set([...colour, Math.round(a * 255)], (y * size + x) * 4);
    }
  return bitmapFromRGBA(size, size, px);
}

/** GN4: the document, built the same way on every computer. */
export function crossGraphic(): AnimationDoc {
  const doc = createGraphic({
    name: 'Cross',
    size: { ...CROSS_GRAPHIC, units: 'px', dpi: 96 },
    background: '#ffffff',
  });
  // The photo: a hue / saturation adjustment, then a zoom blur and a Gaussian blur.
  let bitmap = adjust(photo(), {
    kind: 'hueSaturation',
    settings: { hue: 25, saturation: 30, lightness: 0, colourise: false },
  });
  bitmap = runFilter(bitmap, { kind: 'zoom', centre: { x: 260, y: 150 }, amount: 25 });
  bitmap = runFilter(bitmap, { kind: 'gaussian', radius: 1.5 });
  const photoLayer = createLayer('Photo', { pixels: { bitmap, x: 0, y: 0 } });

  const box = { x: 40, y: 30, width: 170, height: 110 };
  const shapes: AnimObject[] = [
    {
      ...createRect(box),
      fill: {
        kind: 'linear',
        from: '#1d3557',
        to: '#e63946',
        angle: 30,
        stops: [
          { at: 0, colour: '#1d3557' },
          { at: 60, colour: '#f1faee' },
          { at: 100, colour: '#e63946' },
        ],
      },
      stroke: { colour: '#000000', width: 4, dash: 'solid' },
    },
    {
      ...createEllipse({ x: 250, y: 150, width: 150, height: 90 }),
      fill: { kind: 'radial', from: '#ffbe0b', to: '#8338ec', cx: 40, cy: 40 },
      stroke: undefined,
    },
    {
      ...createStar({ x: 400, y: 140, width: 70, height: 70 }),
      fill: { kind: 'solid', colour: '#2a9d8f' },
      stroke: { colour: '#264653', width: 3, dash: 'solid' },
    },
    // White behind the words, so only their ink is dark there.
    { ...createRect(TEXT_BOX), fill: { kind: 'solid', colour: '#ffffff' }, stroke: undefined },
  ];
  const vectorLayer = createLayer('Shapes', { objects: shapes });

  // A soft orange disc screened over the rest at 85 %, with a yellow glow.
  const glowLayer = createLayer('Glow', {
    pixels: { bitmap: disc(110, [255, 140, 40]), x: 330, y: 20 },
    blend: 'screen',
    opacity: 0.85,
    effects: [{ kind: 'glow', colour: '#ffee00', blur: 14, opacity: 80 }],
  });

  const words = createText('Lake Naivasha', { x: TEXT_BOX.x + 12, y: TEXT_BOX.y + 8, size: 40 });
  const textLayer = createLayer('Words', { objects: [words] });

  // Bottom first, as the Layers panel lists them from the bottom.
  return { ...doc, layers: [photoLayer, vectorLayer, glowLayer, textLayer] };
}

/** RGBA pixels, as a PNG decodes. */
export interface Picture {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

/** PSNR (dB) of the colours over the pixels `use` picks; Infinity when they are the same. */
function psnr(a: Picture, b: Picture, use: (x: number, y: number) => boolean): number {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++) {
      if (!use(x, y)) continue;
      const i = (y * a.width + x) * 4;
      for (let c = 0; c < 3; c++) sum += (a.data[i + c]! - b.data[i + c]!) ** 2;
      n += 3;
    }
  const mse = sum / Math.max(1, n);
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

/** The first and last row and column of the dark pixels (the ink) within a box. */
export function inkBox(p: Picture, box: Rect): [number, number, number, number] {
  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (let y = box.y; y < box.y + box.height; y++)
    for (let x = box.x; x < box.x + box.width; x++) {
      const i = (y * p.width + x) * 4;
      if ((p.data[i]! + p.data[i + 1]! + p.data[i + 2]!) / 3 >= 100) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  return [top, bottom, left, right];
}

/** GN4: how two exports of the document differ: everything but the words, and the words. */
export function comparePictures(a: Picture, b: Picture, text: Rect = TEXT_BOX) {
  if (a.width !== b.width || a.height !== b.height)
    throw new Error(`Different sizes: ${a.width} × ${a.height} and ${b.width} × ${b.height}.`);
  let largest = 0;
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++) {
      if (inside(text, x, y)) continue;
      const i = (y * a.width + x) * 4;
      for (let c = 0; c < 4; c++)
        largest = Math.max(largest, Math.abs(a.data[i + c]! - b.data[i + c]!));
    }
  return {
    /** Everything but the words. */
    psnr: psnr(a, b, (x, y) => !inside(text, x, y)),
    /** The largest difference of a channel outside the words, 0–255. */
    largest,
    textPsnr: psnr(a, b, (x, y) => inside(text, x, y)),
    ink: [inkBox(a, text), inkBox(b, text)] as const,
  };
}
