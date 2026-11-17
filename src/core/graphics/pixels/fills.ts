// M21 (GB3, G12): the paint bucket and the gradient tool on a pixel layer. The bucket fills the
// pixels alike to the one clicked (within a tolerance; joined to it, or all of them: floodMask)
// with a colour; the gradient fills the layer, or the selection, along a dragged line, linear or
// radial, through a gradient's colours (the fill's stops, AN6). Both lay their colour over what is
// there at an opacity, only inside the selection (weighted by it), on the layer where it is on the
// image, or on its layer mask (the colour's grey). Heavy for a 12-megapixel photo, so they are
// pixel jobs (jobs.ts) run in a Web Worker in the app.
import type { Point } from '../../animation/geometry.ts';
import type { GradientStop } from '../../animation/types.ts';
import { EditError } from '../../model/errors.ts';
import { floodMask } from './flood.ts';
import { blendPixel, greyOf, isEmpty, rgbOf, selectionOver } from './paint.ts';
import { editRegion, tileRect, type Bitmap, type Mask, type Raster } from './raster.ts';

export interface BucketInput {
  /** What is filled: the layer's bitmap, or its layer mask. */
  target: Raster;
  /** The picture the alike pixels are found in (the layer's bitmap, the target's size). */
  sample: Bitmap;
  /** Where the layer's top-left pixel is on the image. */
  x: number;
  y: number;
  /** The click, on the image. */
  at: Point;
  /** 0–255 each channel. */
  tolerance: number;
  contiguous: boolean;
  colour: readonly [number, number, number];
  /** 0–1. */
  opacity: number;
  /** The image's selection (absent: none, all may be filled). */
  selection?: Mask;
}

/** The target filled; the very same raster when nothing changes. */
export function bucketFill(input: BucketInput): Raster {
  const { target, sample, x, y, colour, opacity, selection } = input;
  const sx = Math.floor(input.at.x - x);
  const sy = Math.floor(input.at.y - y);
  if (sx < 0 || sy < 0 || sx >= sample.width || sy >= sample.height) return target;
  const region = floodMask(sample, sx, sy, {
    tolerance: input.tolerance,
    contiguous: input.contiguous,
  });
  const grey = greyOf(colour);
  const c = target.channels;
  let out = target;
  region.tiles.forEach((mask, i) => {
    if (!mask) return;
    const at = tileRect(region, i);
    const sel = selectionOver(selection, at, x, y);
    out = editRegion(out, at, (tile) => {
      let any = false;
      for (let p = 0; p < mask.length; p++) {
        const a = (opacity * mask[p]! * (sel ? sel[p]! / 255 : 1)) / 255;
        if (a <= 0) continue;
        blendPixel(tile, p * c, c, colour, grey, a, false);
        any = true;
      }
      return any;
    });
  });
  return out;
}

/** A gradient's colour at a place along it (0–1). */
export interface GradientColour {
  offset: number;
  rgb: [number, number, number];
}

/** A gradient's colours in order: `from`, the colours between (AN6 stops, at %), `to`. */
export function gradientStops(
  from: string,
  to: string,
  between: readonly GradientStop[] = [],
): GradientColour[] {
  const middle = [...between]
    .sort((a, b) => a.at - b.at)
    .map((s) => ({ offset: Math.max(0, Math.min(100, s.at)) / 100, rgb: rgbOf(s.colour) }));
  return [{ offset: 0, rgb: rgbOf(from) }, ...middle, { offset: 1, rgb: rgbOf(to) }];
}

export interface GradientInput {
  target: Raster;
  x: number;
  y: number;
  /** The line dragged, on the image: where the first colour is, where the last is. */
  from: Point;
  to: Point;
  /** Linear: along the line; radial: from its start outwards to its length. */
  kind: 'linear' | 'radial';
  stops: readonly GradientColour[];
  /** 0–1. */
  opacity: number;
  selection?: Mask;
}

/** The target with the gradient laid over it (only inside the selection, if there is one). */
export function gradientFill(input: GradientInput): Raster {
  const { target, x, y, from, to, stops, opacity, selection } = input;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length2 = dx * dx + dy * dy;
  if (!(length2 > 1e-12)) throw new EditError('Drag a line for the gradient.');
  const length = Math.sqrt(length2);
  const radial = input.kind === 'radial';
  const c = target.channels;
  const rgb = [0, 0, 0];
  /** Sets `rgb` to the colour at t (0–1). */
  const colourAt = (t: number) => {
    let n = 1;
    while (n < stops.length - 1 && stops[n]!.offset < t) n++;
    const a = stops[n - 1]!;
    const b = stops[n]!;
    const span = b.offset - a.offset;
    const u = span > 0 ? Math.max(0, Math.min(1, (t - a.offset) / span)) : 1;
    for (let ch = 0; ch < 3; ch++) rgb[ch] = a.rgb[ch]! + (b.rgb[ch]! - a.rgb[ch]!) * u;
  };
  let out = target;
  target.tiles.forEach((_, i) => {
    const at = tileRect(target, i);
    const sel = selectionOver(selection, at, x, y);
    if (sel && isEmpty(sel)) return;
    out = editRegion(out, at, (tile) => {
      let any = false;
      for (let ty = 0; ty < at.height; ty++) {
        const py = at.y + ty + y + 0.5 - from.y;
        for (let tx = 0; tx < at.width; tx++) {
          const p = ty * at.width + tx;
          const a = opacity * (sel ? sel[p]! / 255 : 1);
          if (a <= 0) continue;
          const px = at.x + tx + x + 0.5 - from.x;
          const t = radial ? Math.sqrt(px * px + py * py) / length : (px * dx + py * dy) / length2;
          colourAt(Math.max(0, Math.min(1, t)));
          const grey = c === 1 ? 0.299 * rgb[0]! + 0.587 * rgb[1]! + 0.114 * rgb[2]! : 0;
          blendPixel(tile, p * c, c, rgb, grey, a, false);
          any = true;
        }
      }
      return any;
    });
  });
  return out;
}
