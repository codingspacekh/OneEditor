// GV4, G3 (M19): envelopes and perspective as maps of an object's box. A point of the box, as
// fractions (u across, v down; 0, 0 = its top left), goes to where the bent box puts it. A preset
// (arch, arc, bulge, flag, wave, rise, squeeze, bent by a %) is made into four Bézier sides, as a
// custom envelope has, and the inside follows the sides as a Coons patch (each point a blend of
// the four sides, so straight sides give back the box). Perspective moves the four corners and
// maps the box as a camera would (a projective map: straight lines stay straight, the far end
// gets smaller); a corner dragged past the others (a bow-tie) falls back to a plain blend of the
// corners. Pure: no objects here (see warp.ts), so geometry.ts can use it too.
import { EditError } from '../model/errors.ts';
import type {
  Envelope,
  EnvelopePreset,
  EnvelopeSide,
  EnvelopeSides,
  EnvPoint,
} from '../animation/types.ts';

/** The presets in the order the Properties panel lists them. */
export const ENVELOPE_PRESETS: readonly EnvelopePreset[] = [
  'arch',
  'arc',
  'bulge',
  'flag',
  'wave',
  'rise',
  'squeeze',
];

export const PRESET_LABELS: Record<EnvelopePreset, string> = {
  arch: 'Arch',
  arc: 'Arc',
  bulge: 'Bulge',
  flag: 'Flag',
  wave: 'Wave',
  rise: 'Rise',
  squeeze: 'Squeeze',
};

/** A preset bends from −100 % (the other way) to 100 %. */
export const MAX_BEND = 100;
/** The bend a new preset starts at. */
export const DEFAULT_BEND = 50;
/** How far a dragged corner or control point may go outside the box (fractions of it). */
export const MAX_REACH = 10;

export type Corners = [EnvPoint, EnvPoint, EnvPoint, EnvPoint];

/** The box's corners going round: top left, top right, bottom right, bottom left. */
export const BOX_CORNERS: Readonly<Corners> = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const lerp = (a: EnvPoint, b: EnvPoint, t: number): EnvPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const shift = (p: EnvPoint, dx: number, dy: number): EnvPoint => ({ x: p.x + dx, y: p.y + dy });

/** A straight side: its control points a third and two thirds of the way along. */
export const straightSide = (a: EnvPoint, b: EnvPoint): EnvelopeSide => ({
  a: { ...a },
  c1: lerp(a, b, 1 / 3),
  c2: lerp(a, b, 2 / 3),
  b: { ...b },
});

/** Straight sides between four corners (top left, top right, bottom right, bottom left). */
export function sidesFromCorners([tl, tr, br, bl]: Readonly<Corners>): EnvelopeSides {
  return {
    top: straightSide(tl, tr),
    right: straightSide(tr, br),
    bottom: straightSide(bl, br),
    left: straightSide(tl, bl),
  };
}

/** A side bowed: its middle moved by (dx, dy) (control points moved by 4/3 of that). */
function bowed(a: EnvPoint, b: EnvPoint, dx: number, dy: number): EnvelopeSide {
  const s = straightSide(a, b);
  const k = 4 / 3;
  return { ...s, c1: shift(s.c1, dx * k, dy * k), c2: shift(s.c2, dx * k, dy * k) };
}

/**
 * An S-shaped side: one way near its start, the other near its end, at most `d` from the
 * straight line (the control points go ±d / 0.2887, where a cubic's S peaks).
 */
function waved(a: EnvPoint, b: EnvPoint, dx: number, dy: number): EnvelopeSide {
  const s = straightSide(a, b);
  const k = 1 / (Math.sqrt(3) / 6);
  return { ...s, c1: shift(s.c1, dx * k, dy * k), c2: shift(s.c2, -dx * k, -dy * k) };
}

/**
 * GV4: a preset's four sides at a bend of −100 to 100 % (0: the box itself). Arch bends the
 * top and bottom up; arc bends them round a circle below (a rainbow: the sides lean out); bulge
 * pushes the top up and the bottom down; squeeze pinches the middle of the sides in; flag waves
 * the top and bottom; wave waves all four sides; rise lifts the right side, the top and bottom
 * rising to it. A bend below 0 goes the other way (arch down, a smile, pinched…).
 */
export function presetSides(preset: EnvelopePreset, bend: number): EnvelopeSides {
  const b = Math.max(-MAX_BEND, Math.min(MAX_BEND, bend)) / 100;
  const [tl, tr, br, bl] = BOX_CORNERS;
  const box = sidesFromCorners(BOX_CORNERS);
  switch (preset) {
    case 'arch':
      return { ...box, top: bowed(tl, tr, 0, -0.5 * b), bottom: bowed(bl, br, 0, -0.5 * b) };
    case 'arc': {
      // The middle of the top stays; its ends drop by d and lean out by s; the bottom's ends
      // stay level and lean in, its middle rising by d.
      const d = 0.5 * b;
      const s = 0.15 * b;
      const [a, c] = [
        { x: -s, y: d },
        { x: 1 + s, y: d },
      ];
      const [e, f] = [
        { x: s, y: 1 },
        { x: 1 - s, y: 1 },
      ];
      return {
        top: bowed(a, c, 0, -d),
        right: straightSide(c, f),
        bottom: bowed(e, f, 0, -d),
        left: straightSide(a, e),
      };
    }
    case 'bulge':
      return { ...box, top: bowed(tl, tr, 0, -0.5 * b), bottom: bowed(bl, br, 0, 0.5 * b) };
    case 'squeeze':
      return { ...box, left: bowed(tl, bl, 0.3 * b, 0), right: bowed(tr, br, -0.3 * b, 0) };
    case 'flag':
      return { ...box, top: waved(tl, tr, 0, 0.25 * b), bottom: waved(bl, br, 0, 0.25 * b) };
    case 'wave':
      return {
        top: waved(tl, tr, 0, 0.25 * b),
        right: waved(tr, br, 0.25 * b, 0),
        bottom: waved(bl, br, 0, 0.25 * b),
        left: waved(tl, bl, 0.25 * b, 0),
      };
    case 'rise': {
      const r = 0.5 * b;
      const [up, down] = [
        { x: 1, y: -r },
        { x: 1, y: 1 - r },
      ];
      // Level where they start, rising into the right side: an eased slope.
      return {
        top: { a: tl, c1: { x: 1 / 3, y: 0 }, c2: { x: 2 / 3, y: -r }, b: up },
        right: straightSide(up, down),
        bottom: { a: bl, c1: { x: 1 / 3, y: 1 }, c2: { x: 2 / 3, y: 1 - r }, b: down },
        left: straightSide(tl, bl),
      };
    }
  }
}

/** The four sides an envelope bends the box to (perspective: straight between its corners). */
export function sidesOf(envelope: Envelope): EnvelopeSides {
  switch (envelope.kind) {
    case 'preset':
      return presetSides(envelope.preset, envelope.bend);
    case 'perspective':
      return sidesFromCorners(envelope.corners);
    case 'custom':
      return envelope.sides;
  }
}

/** Its four corners going round (top left, top right, bottom right, bottom left). */
export function cornersOf(envelope: Envelope): Corners {
  if (envelope.kind === 'perspective') return envelope.corners.map((c) => ({ ...c })) as Corners;
  const { top, bottom } = sidesOf(envelope);
  return [{ ...top.a }, { ...top.b }, { ...bottom.b }, { ...bottom.a }];
}

const bezier = (s: EnvelopeSide, t: number): EnvPoint => {
  const u = 1 - t;
  const [k0, k1, k2, k3] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: k0 * s.a.x + k1 * s.c1.x + k2 * s.c2.x + k3 * s.b.x,
    y: k0 * s.a.y + k1 * s.c1.y + k2 * s.c2.y + k3 * s.b.y,
  };
};

/** A Coons patch of four sides: (u, v) → the bent point. */
function coons(sides: EnvelopeSides): (p: EnvPoint) => EnvPoint {
  const { top, right, bottom, left } = sides;
  const [p00, p10, p01, p11] = [top.a, top.b, bottom.a, bottom.b];
  return ({ x: u, y: v }) => {
    const [t, b, l, r] = [bezier(top, u), bezier(bottom, u), bezier(left, v), bezier(right, v)];
    const blend = (k: 'x' | 'y') =>
      (1 - v) * t[k] +
      v * b[k] +
      (1 - u) * l[k] +
      u * r[k] -
      ((1 - u) * (1 - v) * p00[k] + u * (1 - v) * p10[k] + (1 - u) * v * p01[k] + u * v * p11[k]);
    return { x: blend('x'), y: blend('y') };
  };
}

/** The four corners blended (bilinear): the fallback for a perspective that folds over. */
function bilinear([tl, tr, br, bl]: Readonly<Corners>): (p: EnvPoint) => EnvPoint {
  return ({ x: u, y: v }) => lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
}

/** Below this the far side of a perspective would be at (or past) the horizon. */
const HORIZON = 0.05;

/**
 * G3: the projective map of the unit square onto four corners (Heckbert's square-to-quad), or
 * null when the corners fold over (a corner dragged inside or past the others: the divisor would
 * reach 0 inside the box, sending points to infinity) or lie on one line.
 */
function projective([p0, p1, p2, p3]: Readonly<Corners>): ((p: EnvPoint) => EnvPoint) | null {
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const [dx1, dx2, dy1, dy2] = [p1.x - p2.x, p3.x - p2.x, p1.y - p2.y, p3.y - p2.y];
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-12) return null;
  const g = (sx * dy2 - dx2 * sy) / det;
  const h = (dx1 * sy - sx * dy1) / det;
  // The divisor is 1 + g·u + h·v: above 0 over the whole box when it is at each corner.
  if (Math.min(1 + g, 1 + h, 1 + g + h) < HORIZON) return null;
  const [a, b, c] = [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x];
  const [d, e, f] = [p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y];
  return ({ x: u, y: v }) => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
  };
}

/** GV4, G3: where the envelope puts each point of the box (all in fractions of the box). */
export function envelopeMap(envelope: Envelope): (p: EnvPoint) => EnvPoint {
  if (envelope.kind === 'perspective') {
    return projective(envelope.corners) ?? bilinear(envelope.corners);
  }
  return coons(sidesOf(envelope));
}

/** The map in px of a box `width` × `height` (local coordinates: 0, 0 is its top left). */
export function boxMap(
  envelope: Envelope,
  width: number,
  height: number,
): (p: EnvPoint) => EnvPoint {
  const map = envelopeMap(envelope);
  return (p) => {
    const q = map({ x: width ? p.x / width : 0, y: height ? p.y / height : 0 });
    return { x: q.x * width, y: q.y * height };
  };
}

/** Whether the envelope leaves the box as it is (a preset at 0 %, or the box's own corners). */
export function isFlat(envelope: Envelope): boolean {
  if (envelope.kind === 'preset') return envelope.bend === 0;
  const same = (a: EnvelopeSides, b: EnvelopeSides) =>
    (['top', 'right', 'bottom', 'left'] as const).every((k) =>
      (['a', 'c1', 'c2', 'b'] as const).every(
        (p) => Math.abs(a[k][p].x - b[k][p].x) < 1e-9 && Math.abs(a[k][p].y - b[k][p].y) < 1e-9,
      ),
    );
  return same(sidesOf(envelope), sidesFromCorners(BOX_CORNERS));
}

const near = (p: EnvPoint) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Math.abs(p.x) <= MAX_REACH &&
  Math.abs(p.y) <= MAX_REACH;

/** GV4: a bend in range and points that are numbers not too far from the box; or why not. */
export function validateEnvelope(envelope: Envelope): void {
  if (envelope.kind === 'preset') {
    if (!(Number.isFinite(envelope.bend) && Math.abs(envelope.bend) <= MAX_BEND))
      throw new EditError(`The bend must be between −${MAX_BEND} % and ${MAX_BEND} %.`);
    return;
  }
  const points =
    envelope.kind === 'perspective'
      ? envelope.corners
      : Object.values(envelope.sides).flatMap((s) => [s.a, s.c1, s.c2, s.b]);
  if (!points.every(near))
    throw new EditError(
      `Keep the corners and handles within ${MAX_REACH} times the object's size of it.`,
    );
}

/**
 * The same envelope with one corner moved (custom: the two sides meeting there move their ends,
 * and the control points next to it move with it, so the side keeps its curve).
 */
export function moveCorner(envelope: Envelope, index: 0 | 1 | 2 | 3, to: EnvPoint): Envelope {
  if (envelope.kind === 'perspective') {
    const corners = envelope.corners.map((c, i) => (i === index ? { ...to } : c)) as Corners;
    return { kind: 'perspective', corners };
  }
  const sides = structuredClone(sidesOf(envelope));
  const from = cornersOf(envelope)[index]!;
  const [dx, dy] = [to.x - from.x, to.y - from.y];
  const move = (side: EnvelopeSide, end: 'a' | 'b') => {
    const c = end === 'a' ? 'c1' : 'c2';
    side[end] = { ...to };
    side[c] = shift(side[c], dx, dy);
  };
  // Top left is top.a and left.a; top right top.b and right.a; bottom right right.b and
  // bottom.b; bottom left bottom.a and left.b.
  const ends: [keyof EnvelopeSides, 'a' | 'b'][][] = [
    [
      ['top', 'a'],
      ['left', 'a'],
    ],
    [
      ['top', 'b'],
      ['right', 'a'],
    ],
    [
      ['right', 'b'],
      ['bottom', 'b'],
    ],
    [
      ['bottom', 'a'],
      ['left', 'b'],
    ],
  ];
  for (const [side, end] of ends[index]!) move(sides[side], end);
  return { kind: 'custom', sides };
}

/** The same custom envelope with one control point of a side moved. */
export function moveControl(
  envelope: Envelope,
  side: keyof EnvelopeSides,
  which: 'c1' | 'c2',
  to: EnvPoint,
): Envelope {
  const sides = structuredClone(sidesOf(envelope));
  sides[side][which] = { ...to };
  return { kind: 'custom', sides };
}

/** About one point every this many px of an outline, so a bent straight side curves smoothly. */
const DENSE_STEP = 4;

/**
 * GV4: a polyline in the box (px) bent by the envelope: its sides divided every few px first,
 * so a straight side bends smoothly (for outlines, bounds and hit-testing).
 */
export function bendPolyline(
  envelope: Envelope,
  width: number,
  height: number,
  points: readonly EnvPoint[],
  closed: boolean,
): EnvPoint[] {
  const map = boxMap(envelope, width, height);
  const out: EnvPoint[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / DENSE_STEP));
    for (let s = 0; s < steps; s++) out.push(map(lerp(a, b, s / steps)));
  }
  if (!closed && points.length) out.push(map(points.at(-1)!));
  return out;
}
