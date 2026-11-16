// M21 GB6, G8: the whole image made another size. Image size scales every layer: a pixel layer
// resampled (its mask too) and its place scaled, vector objects scaled with their outlines and
// letters (as a group is), the guides too. Canvas size keeps the picture as it is and moves it by
// a 9-point anchor: the new area is the image's background (transparent or a colour), a smaller
// canvas crops. Crop to a box and trim / crop to content (the bounds of the pixels and the objects
// shown; "trim plain edges" also counts a border of one colour as empty: O/N/19 Pearl, "exclude
// as much white space as possible"). Pixels left off the canvas are dropped, so a big photo
// cropped small does not keep its whole bitmap. Every function returns a new document.
import type { Bounds } from '../animation/geometry.ts';
import { setSize } from '../animation/geometry.ts';
import { MIN_STAGE, TRANSPARENT } from '../animation/rules.ts';
import type {
  AnimObject,
  AnimationDoc,
  GroupObject,
  Layer,
  PixelContent,
} from '../animation/types.ts';
import {
  canvasAround,
  cropCanvas,
  drawingBounds,
  MAX_CANVAS,
  validateGraphicStage,
} from './document.ts';
import { fromPx, roundIn, toPx } from './units.ts';
import { isPixelLayer } from './pixels/layers.ts';
import {
  createBitmap,
  cropRaster,
  intersect,
  pixelAt,
  tileRect,
  type Bitmap,
  type Mask,
  type Rect,
} from './pixels/raster.ts';
import { resampleBitmap, resampleMask, type ResampleMethod } from './pixels/resample.ts';

/** A new size from one side, the other in proportion (at least 1 px). */
export function scaledSize(
  from: { width: number; height: number },
  to: { width: number } | { height: number },
): { width: number; height: number } {
  if ('width' in to)
    return {
      width: to.width,
      height: Math.max(1, Math.round((from.height * to.width) / from.width)),
    };
  return {
    width: Math.max(1, Math.round((from.width * to.height) / from.height)),
    height: to.height,
  };
}

/** Objects scaled about the image's top left, as the parts of a group are when it is resized. */
function scaledObjects(
  objects: readonly AnimObject[],
  from: { width: number; height: number },
  to: { width: number; height: number },
): AnimObject[] {
  if (objects.length === 0) return [];
  const group: GroupObject = {
    kind: 'group',
    id: 'image',
    name: 'Image',
    x: 0,
    y: 0,
    width: from.width,
    height: from.height,
    rotation: 0,
    opacity: 100,
    fill: { kind: 'none' },
    children: [...objects],
  };
  return setSize(group, to.width, to.height).children;
}

/** A pixel layer's pixels at the scale (its edges rounded to whole image px). */
function scaledPixels(
  p: PixelContent,
  sx: number,
  sy: number,
  method: ResampleMethod,
): PixelContent {
  const x = Math.round(p.x * sx);
  const y = Math.round(p.y * sy);
  const width = Math.max(1, Math.round((p.x + p.bitmap.width) * sx) - x);
  const height = Math.max(1, Math.round((p.y + p.bitmap.height) * sy) - y);
  return {
    bitmap: resampleBitmap(p.bitmap, width, height, method),
    x,
    y,
    ...(p.mask ? { mask: resampleMask(p.mask, width, height, method) } : {}),
  };
}

/**
 * GB6: Image size: the image `width` × `height` px, everything on it scaled to fit (resampled
 * by `method`). The resolution stays: change it alone with setImage's dpi (no resampling).
 */
export function resizeImage(
  doc: AnimationDoc,
  size: { width: number; height: number; method: ResampleMethod },
): AnimationDoc {
  const { width, height, method } = size;
  const from = doc.stage;
  if (width === from.width && height === from.height) return doc;
  const stage = { ...from, width, height };
  validateGraphicStage(stage);
  const sx = width / from.width;
  const sy = height / from.height;
  return {
    ...doc,
    stage,
    layers: doc.layers.map((l) => ({
      ...l,
      objects: scaledObjects(l.objects, from, stage),
      ...(l.pixels ? { pixels: scaledPixels(l.pixels, sx, sy, method) } : {}),
    })),
    guides: { x: doc.guides.x.map((g) => g * sx), y: doc.guides.y.map((g) => g * sy) },
  };
}

/** GB6: where Canvas size keeps the picture: a corner, an edge's middle or the centre. */
export type Anchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'centre'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** In reading order, as the 3 × 3 buttons are laid out. */
export const ANCHORS: readonly Anchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'centre',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

/** How far the picture moves on a new canvas: none, half or all of the change on each axis. */
export function anchorOffset(
  anchor: Anchor,
  from: { width: number; height: number },
  to: { width: number; height: number },
): { dx: number; dy: number } {
  const i = ANCHORS.indexOf(anchor);
  const fx = (i % 3) / 2;
  const fy = Math.floor(i / 3) / 2;
  return {
    dx: Math.round((to.width - from.width) * fx) + 0,
    dy: Math.round((to.height - from.height) * fy) + 0,
  };
}

/**
 * The part of a pixel layer on the canvas: what lies off it is dropped (a layer entirely off it
 * keeps one empty pixel, a raster's least). The layer itself when it is all on the canvas.
 */
function onCanvas(p: PixelContent, canvas: { width: number; height: number }): PixelContent {
  const box: Rect = { x: p.x, y: p.y, width: p.bitmap.width, height: p.bitmap.height };
  const part = intersect(box, { x: 0, y: 0, width: canvas.width, height: canvas.height });
  if (part && part.width === box.width && part.height === box.height) return p;
  if (!part) return { bitmap: createBitmap(1, 1), x: 0, y: 0 };
  const local = { ...part, x: part.x - p.x, y: part.y - p.y };
  return {
    bitmap: cropRaster(p.bitmap, local),
    x: part.x,
    y: part.y,
    ...(p.mask ? { mask: cropRaster(p.mask, local) } : {}),
  };
}

const pixelsOnCanvas = (doc: AnimationDoc): AnimationDoc => ({
  ...doc,
  layers: doc.layers.map((l) => (l.pixels ? { ...l, pixels: onCanvas(l.pixels, doc.stage) } : l)),
});

export interface CanvasChange {
  width: number;
  height: number;
  anchor: Anchor;
  /** The new area's background: a colour, or 'none': transparent. Absent: as it was. */
  background?: string;
  /** G8: the picture moved by this instead of by the anchor (a crop to a typed box). */
  offset?: { dx: number; dy: number };
}

/** How far Canvas size moves the picture: the offset given, or the anchor's. */
export const canvasOffset = (
  change: CanvasChange,
  from: { width: number; height: number },
): { dx: number; dy: number } => change.offset ?? anchorOffset(change.anchor, from, change);

/**
 * GB6: Canvas size: the canvas `width` × `height` px with the picture kept at `anchor` (or moved
 * by `offset`); the new area shows the background. A smaller canvas crops.
 */
export function resizeCanvas(doc: AnimationDoc, change: CanvasChange): AnimationDoc {
  const { width, height, background } = change;
  const { dx, dy } = canvasOffset(change, doc.stage);
  const stage = { ...doc.stage, width, height, ...(background ? { background } : {}) };
  validateGraphicStage(stage);
  const moved = canvasAround(doc, { x: -dx, y: -dy, width, height });
  return pixelsOnCanvas({ ...moved, stage });
}

/** GB6: the size units: the graphics units and a percentage of the image as it is. */
export type SizeUnit = 'px' | '%' | 'cm' | 'mm' | 'in';

export const SIZE_UNITS: readonly SizeUnit[] = ['px', '%', 'cm', 'mm', 'in'];

/** A length typed in a size unit as pixels (not rounded); `whole`: the side as it is, in px. */
export const sizeToPx = (value: number, unit: SizeUnit, dpi: number, whole: number): number =>
  unit === '%' ? (whole * value) / 100 : toPx(value, unit, dpi);

/** Pixels as a length in a size unit, rounded as it is shown (% to 0.1). */
export const pxToSize = (px: number, unit: SizeUnit, dpi: number, whole: number): number =>
  unit === '%' ? Math.round((px / whole) * 1000) / 10 : roundIn(fromPx(px, unit, dpi), unit);

/** GB6: a new image or canvas size in whole px, or why it cannot be (16 to 8192 px a side). */
export function checkedSize(
  width: number,
  height: number,
): { width: number; height: number; error: string | null } {
  const w = Math.round(width);
  const h = Math.round(height);
  for (const [what, n] of [
    ['width', w],
    ['height', h],
  ] as const)
    if (!Number.isFinite(n) || n < MIN_STAGE || n > MAX_CANVAS)
      return {
        width: w,
        height: h,
        error: `The ${what} must come to between ${MIN_STAGE} and ${MAX_CANVAS} pixels (it is ${Number.isFinite(n) ? n : '?'} px).`,
      };
  return { width: w, height: h, error: null };
}

/** G8: the canvas cropped to a box (at least 16 × 16 px); the pixels off it dropped. */
export const cropImage = (doc: AnimationDoc, box: Bounds): AnimationDoc =>
  pixelsOnCanvas(cropCanvas(doc, box));

/** How far (the largest of R, G, B) a colour may be from the plain edge's and still be it. */
export const PLAIN_TOLERANCE = 16;

/**
 * The colour a plain edge is: the image's top-left pixel as it is seen (the top pixel layer that
 * shows something there, or the background). Null: only transparent edges are trimmed.
 */
function plainColour(doc: AnimationDoc): readonly number[] | null {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i]!;
    if (!l.visible || l.mask || !isPixelLayer(l)) continue;
    const { bitmap, x, y, mask } = l.pixels;
    const seen = pixelAt(bitmap, -x, -y);
    if (seen[3] === 0 || (mask && pixelAt(mask, -x, -y) === 0)) continue;
    return seen[3] === 255 ? seen : null;
  }
  const bg = doc.stage.background;
  if (bg === TRANSPARENT) return null;
  const hex = /^#([0-9a-f]{6})$/i.exec(bg)?.[1];
  return hex ? [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16)).concat(255) : null;
}

/**
 * The bounds of a bitmap's pixels that show (alpha above 0, not hidden by the mask) and, with a
 * plain colour, are not that colour; in the bitmap's own px. Null: none.
 */
function shownBounds(
  bitmap: Bitmap,
  mask: Mask | undefined,
  plain: readonly number[] | null,
  tolerance: number,
): Rect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const [pr, pg, pb] = plain ?? [0, 0, 0];
  bitmap.tiles.forEach((tile, i) => {
    if (!tile) return;
    const at = tileRect(bitmap, i);
    const m = mask ? mask.tiles[i] : undefined;
    if (m === null) return; // all hidden
    for (let y = 0; y < at.height; y++)
      for (let x = 0; x < at.width; x++) {
        const gx = at.x + x;
        const gy = at.y + y;
        // Inside what is found already: nothing to learn.
        if (gx >= left && gx <= right && gy >= top && gy <= bottom) continue;
        const k = y * at.width + x;
        if (tile[k * 4 + 3] === 0 || (m && m[k] === 0)) continue;
        if (
          plain &&
          Math.abs(tile[k * 4]! - pr!) <= tolerance &&
          Math.abs(tile[k * 4 + 1]! - pg!) <= tolerance &&
          Math.abs(tile[k * 4 + 2]! - pb!) <= tolerance
        )
          continue;
        left = Math.min(left, gx);
        right = Math.max(right, gx);
        top = Math.min(top, gy);
        bottom = Math.max(bottom, gy);
      }
  });
  return left === Infinity
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function union(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * G8: what Trim / Crop to content crops to: the bounds of everything shown — the visible pixel
 * layers' pixels and the visible objects — kept to the canvas. `plain`: a border of the image's
 * top-left colour (within `tolerance`) counts as empty too. Null when nothing is drawn.
 */
export function contentBox(
  doc: AnimationDoc,
  options: { plain?: boolean; tolerance?: number } = {},
): Rect | null {
  const plain = options.plain ? plainColour(doc) : null;
  const tolerance = options.tolerance ?? PLAIN_TOLERANCE;
  let box: Rect | null = drawingBounds(doc);
  for (const l of doc.layers as Layer[]) {
    if (!l.visible || l.mask || !isPixelLayer(l)) continue;
    const found = shownBounds(l.pixels.bitmap, l.pixels.mask, plain, tolerance);
    if (found) box = union(box, { ...found, x: found.x + l.pixels.x, y: found.y + l.pixels.y });
  }
  if (!box) return null;
  const canvas = { x: 0, y: 0, width: doc.stage.width, height: doc.stage.height };
  const left = Math.floor(box.x);
  const top = Math.floor(box.y);
  const whole = {
    x: left,
    y: top,
    width: Math.ceil(box.x + box.width) - left,
    height: Math.ceil(box.y + box.height) - top,
  };
  return intersect(whole, canvas);
}
