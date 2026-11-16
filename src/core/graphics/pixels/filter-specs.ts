// M22 step 4 (GB5, GN2): the Filter menu's filters as data — a kind and its settings in image px,
// as the student types them or drags them on the stage — so the same filter can be checked (a
// refusal in words before anything is done), placed on a layer's pixels (points measured from its
// top-left corner; lengths shrunk with a reduced preview), given defaults from the layer or the
// selection, and run in the pixel worker (jobs.ts) by runFilter.
import type { Point } from '../../animation/geometry.ts';
import { EditError } from '../../model/errors.ts';
import {
  bulge,
  cornersProblem,
  meshProblem,
  perspective,
  restMesh,
  twirl,
  warp,
  MAX_TWIRL,
} from './distort.ts';
import {
  gaussianBlur,
  MAX_BLUR,
  MAX_DISTANCE,
  motionBlur,
  unsharpMask,
  zoomBlur,
} from './filters.ts';
import type { Raster, Rect } from './raster.ts';

export type FilterSpec =
  | { kind: 'gaussian'; radius: number }
  | { kind: 'motion'; angle: number; distance: number }
  | { kind: 'zoom'; centre: Point; amount: number }
  | { kind: 'twirl'; centre: Point; radius: number; angle: number }
  | { kind: 'sharpen'; amount: number; radius: number; threshold: number }
  | { kind: 'bulge'; centre: Point; radius: number; amount: number }
  /** Top left, top right, bottom right, bottom left. */
  | { kind: 'perspective'; corners: readonly Point[] }
  /** 4 × 4, row by row from the top left. */
  | { kind: 'warp'; points: readonly Point[] };

export type FilterKind = FilterSpec['kind'];
export type FilterOf<K extends FilterKind> = Extract<FilterSpec, { kind: K }>;

/** In the Filter menu's order. */
export const FILTER_KINDS: readonly FilterKind[] = [
  'gaussian',
  'motion',
  'zoom',
  'twirl',
  'sharpen',
  'bulge',
  'perspective',
  'warp',
];

/** The name of each, as the dialog's title and the undo step's label. */
export const FILTER_NAMES: Readonly<Record<FilterKind, string>> = {
  gaussian: 'Gaussian blur',
  motion: 'Motion blur',
  zoom: 'Zoom blur',
  twirl: 'Twirl',
  sharpen: 'Sharpen',
  bulge: 'Bulge / pinch',
  perspective: 'Perspective',
  warp: 'Warp',
};

/** A number the student types. */
export interface FilterField {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
  /** A length in image px (shrunk with a reduced preview). */
  length?: boolean;
}

const f = (
  key: string,
  label: string,
  unit: string,
  min: number,
  max: number,
  decimals = 0,
  length = false,
): FilterField => ({ key, label, unit, min, max, decimals, ...(length ? { length } : {}) });

/** The largest circle (px) a twirl or a bulge takes. */
export const MAX_CIRCLE = 20000;

/** Each kind's typed numbers (the centre, corners and mesh points are points, apart). */
export const FILTER_FIELDS: Readonly<Record<FilterKind, readonly FilterField[]>> = {
  gaussian: [f('radius', 'Radius', 'px', 0.1, MAX_BLUR, 1, true)],
  motion: [
    f('angle', 'Angle', '°', -360, 360),
    f('distance', 'Distance', 'px', 1, MAX_DISTANCE, 0, true),
  ],
  zoom: [f('amount', 'Amount', '%', 1, 100)],
  twirl: [
    f('radius', 'Radius', 'px', 1, MAX_CIRCLE, 0, true),
    f('angle', 'Angle', '°', -MAX_TWIRL, MAX_TWIRL),
  ],
  sharpen: [
    f('amount', 'Amount', '%', 1, 500),
    f('radius', 'Radius', 'px', 0.1, MAX_BLUR, 1, true),
    f('threshold', 'Threshold', 'levels', 0, 255),
  ],
  bulge: [
    f('radius', 'Radius', 'px', 1, MAX_CIRCLE, 0, true),
    f('amount', 'Amount', '%', -100, 100),
  ],
  perspective: [],
  warp: [],
};

/** The filters with a centre (chosen by clicking on the stage, or typed). */
export const hasCentre = (kind: FilterKind): boolean =>
  kind === 'zoom' || kind === 'twirl' || kind === 'bulge';

const numbers = (s: FilterSpec) => s as unknown as Record<string, number>;

/** Why a field's value cannot be used, or null. */
export function fieldProblem(field: FilterField, value: number): string | null {
  if (!Number.isFinite(value)) return `${field.label}: type a number.`;
  if (value < field.min || value > field.max)
    return `${field.label} must be between ${field.min} and ${field.max} ${field.unit}.`;
  return null;
}

/** Why the filter cannot be done as it is set, in words; null when it can. */
export function filterProblem(spec: FilterSpec): string | null {
  for (const field of FILTER_FIELDS[spec.kind]) {
    const problem = fieldProblem(field, numbers(spec)[field.key]!);
    if (problem) return problem;
  }
  if ('centre' in spec && !(Number.isFinite(spec.centre.x) && Number.isFinite(spec.centre.y)))
    return 'The centre needs an X and a Y: type them, or click the image.';
  if (spec.kind === 'perspective') return cornersProblem(spec.corners);
  if (spec.kind === 'warp') return meshProblem(spec.points);
  return null;
}

const middle = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const round = (v: number) => Math.round(v * 10) / 10;

/**
 * A kind's settings to start from, on a layer whose pixels cover `box` (image px): the centre in
 * the middle of `focus` (the selection's bounds, else the box) and the circle as big as fits in
 * it; the corners and mesh on the box.
 */
export function defaultFilter(kind: FilterKind, box: Rect, focus: Rect = box): FilterSpec {
  const centre = { x: round(middle(focus).x), y: round(middle(focus).y) };
  const radius = Math.max(1, Math.round(Math.min(focus.width, focus.height) / 2));
  switch (kind) {
    case 'gaussian':
      return { kind, radius: 5 };
    case 'motion':
      return { kind, angle: 0, distance: 20 };
    case 'zoom':
      return { kind, centre, amount: 30 };
    case 'twirl':
      return { kind, centre, radius, angle: 90 };
    case 'sharpen':
      return { kind, amount: 100, radius: 1, threshold: 0 };
    case 'bulge':
      return { kind, centre, radius, amount: 50 };
    case 'perspective':
      return {
        kind,
        corners: [
          { x: box.x, y: box.y },
          { x: box.x + box.width, y: box.y },
          { x: box.x + box.width, y: box.y + box.height },
          { x: box.x, y: box.y + box.height },
        ],
      };
    case 'warp':
      return { kind, points: restMesh(box.width, box.height, box.x, box.y) };
  }
}

/**
 * GN2: the filter placed on pixels whose top-left pixel is at (x, y) on the image and each of
 * whose pixels covers `scale` image px (a reduced preview): points measured from that corner,
 * lengths divided by the scale; angles and amounts as they are.
 */
export function filterInRaster(
  spec: FilterSpec,
  place: { x: number; y: number; scale: number },
): FilterSpec {
  const k = place.scale;
  const at = (p: Point): Point => ({ x: (p.x - place.x) / k, y: (p.y - place.y) / k });
  const out = { ...spec } as Record<string, unknown>;
  for (const field of FILTER_FIELDS[spec.kind])
    if (field.length) out[field.key] = numbers(spec)[field.key]! / k;
  if ('centre' in spec) out.centre = at(spec.centre);
  if (spec.kind === 'perspective') out.corners = spec.corners.map(at);
  if (spec.kind === 'warp') out.points = spec.points.map(at);
  return out as FilterSpec;
}

/**
 * GB5: the filter done on pixels (raster px: placed by filterInRaster), pixels of the same size;
 * a refused filter throws its words (an EditError).
 */
export function runFilter<C extends 1 | 4>(r: Raster<C>, spec: FilterSpec): Raster<C> {
  const problem = filterProblem(spec);
  if (problem) throw new EditError(problem);
  switch (spec.kind) {
    case 'gaussian':
      return gaussianBlur(r, spec.radius);
    case 'motion':
      return motionBlur(r, spec.angle, spec.distance);
    case 'zoom':
      return zoomBlur(r, spec.centre, spec.amount);
    case 'twirl':
      return twirl(r, spec);
    case 'sharpen':
      return unsharpMask(r, spec);
    case 'bulge':
      return bulge(r, spec);
    case 'perspective':
      return perspective(r, spec.corners);
    case 'warp':
      return warp(r, spec.points);
  }
}
