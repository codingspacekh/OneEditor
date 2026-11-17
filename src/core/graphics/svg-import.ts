// GV6 (M19): a given SVG file opened as editable objects (9626/04 M/26: ChipLeg.svg, the leg of a
// chip to be repeated evenly). Rectangles, circles and ellipses stay rectangles and ellipses where
// their transform allows (turned, mirrored, scaled, skewed up to 80°); everything else becomes
// paths with their curves (arcs and quadratics as cubic Béziers), a path's extra outlines its
// holes (filled even-odd); groups stay groups; text becomes text in the nearest bundled font.
// Fills and outlines come from the attributes, `style=""` and a <style> sheet's simple rules;
// linear and radial gradients (by url(#id), in either unit system) become the app's gradients,
// matched as closely as its angle and centre allow. What the app cannot edit (pictures inside,
// clip paths, masks, filters…) is left out and named in `notes`. Our own SVG exports open back
// as the same shapes where the file says what they were. Pure: no DOM.
import { createGroup, DEFAULT_FONT, LINE_HEIGHT, roughTextWidth } from '../animation/factory.ts';
import { flattenPath } from '../animation/geometry.ts';
import { fontOf } from '../animation/draw.ts';
import { fontKey } from '../animation/svg-export.ts';
import type {
  AnimationDoc,
  AnimObject,
  Dash,
  GradientStop,
  Paint,
  PathObject,
  PathPoint,
  Stroke,
  TextAlign,
  TextObject,
} from '../animation/types.ts';
import { EditError } from '../model/errors.ts';
import { newId } from '../model/factory.ts';
import { FONTS } from '../text/fonts.ts';
import { mixColours, parseColour, type ReadColour } from './svg-colours.ts';
import { opaqueOf, withAlpha } from '../colour.ts';
import {
  apply,
  arcCubics,
  IDENTITY,
  invert,
  multiply,
  numbersIn,
  parsePathData,
  parseTransform,
  rotation,
  scaleOf,
  translation,
  type ArcSeg,
  type Matrix,
  type Pt,
  type SubPath,
} from './svg-path.ts';
import { createGraphic } from './document.ts';
import { SCREEN_DPI, toPx } from './units.ts';
import { MIN_STAGE, TRANSPARENT } from '../animation/rules.ts';
import { isElement, parseXml, textOf, type XmlElement } from './xml.ts';

export interface SvgImage {
  /** The picture's size in px at the dpi asked for (not rounded: 77.44 × 240 for ChipLeg.svg). */
  width: number;
  height: number;
  /** Its objects in stage px, the first at the back. */
  objects: AnimObject[];
  /** What was left out or changed, for the student: "1 picture inside the SVG was left out." */
  notes: string[];
}

export interface SvgReadOptions {
  /** The image's resolution: a size in cm, mm, in or pt becomes px at it. Absent: 96. */
  dpi?: number;
  /**
   * How far below the top of its letters each font's baseline sits, in em, keyed as
   * StageRenderer.textTops keys them ('400 "Inter"'), so text lands where it was. Absent: 0.9.
   */
  textTops?: Readonly<Record<string, number>>;
}

const DEFAULT_TOP = 0.9;
const MAX_SKEW = 80;
const EPS = 1e-9;

/** Up to 6 decimals, no "-0": what a file's numbers become in the objects. */
const clean = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};

const localName = (name: string) => name.slice(name.indexOf(':') + 1);

// ---- style ----

/** Properties a child takes from its parent unless it sets its own. */
const INHERITED = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'color',
  'visibility',
] as const;
const OWN = ['opacity', 'display', 'clip-path', 'mask', 'filter', 'stop-color', 'stop-opacity'];
const PROPERTIES = new Set<string>([...INHERITED, ...OWN]);

type Style = Readonly<Record<string, string>>;

const ROOT_STYLE: Style = {
  fill: 'black',
  stroke: 'none',
  'stroke-width': '1',
  'font-size': '16',
  'font-family': 'sans-serif',
  color: 'black',
};

/** "fill: red; stroke-width: 2 !important" → { fill: 'red', 'stroke-width': '2' }. */
function declarations(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important/i, '')
      .trim();
    if (key && value) out[key] = value;
  }
  return out;
}

interface CssRule {
  tag?: string;
  id?: string;
  classes: string[];
  specificity: number;
  order: number;
  decls: Record<string, string>;
}

/** A <style> sheet's simple rules (tag, .class, #id and their mixes, as Illustrator writes). */
function cssRules(sheet: string, from: number): CssRule[] {
  const rules: CssRule[] = [];
  const text = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let order = from;
  for (let m = rule.exec(text); m; m = rule.exec(text)) {
    const decls = declarations(m[2]!);
    for (const raw of m[1]!.split(',')) {
      const selector = raw.trim();
      // @font-face, @media… and anything with combinators are not ours to follow.
      if (!/^[\w-]*(?:[.#][\w-]+)*$|^\*$/.test(selector) || selector === '') continue;
      const tag = /^[\w-]+/.exec(selector)?.[0];
      const id = /#([\w-]+)/.exec(selector)?.[1];
      const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((c) => c[1]!);
      rules.push({
        ...(tag ? { tag } : {}),
        ...(id ? { id } : {}),
        classes,
        specificity: (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0),
        order: order++,
        decls,
      });
    }
  }
  return rules;
}

// ---- reading ----

interface Viewport {
  width: number;
  height: number;
}

type NoteKind = 'picture' | 'clip' | 'mask' | 'filter' | 'pattern' | 'other' | 'strokePaint';

/** A box placed by a matrix as the app places an object: turned, mirrored, skewed in x. */
interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX?: boolean;
  flipY?: boolean;
  skewX?: number;
  /** From the box (its centre at 0, 0) to the stage. */
  frame: Matrix;
}

/** One closed or open outline on the stage, as the app's path points. */
interface Outline {
  points: PathPoint[];
  closed: boolean;
}

const norm180 = (deg: number) => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

/**
 * The box (x, y, w, h) in a frame `m` as the app's box: placed, turned, mirrored and skewed in x
 * (any transform that does not squash the box flat is one). Null when the skew would be more than
 * the app allows (80°) or the box is flat; the shape is then baked into a path.
 */
function placeBox(
  m: Matrix,
  box: { x: number; y: number; w: number; h: number },
): Placement | null {
  const a1 = { x: m[0] * box.w, y: m[1] * box.w };
  const a2 = { x: m[2] * box.h, y: m[3] * box.h };
  const width = Math.hypot(a1.x, a1.y);
  if (width < EPS) return null;
  const theta = Math.atan2(a1.y, a1.x);
  const [cos, sin] = [Math.cos(theta), Math.sin(theta)];
  const along = a2.x * cos + a2.y * sin;
  const across = -a2.x * sin + a2.y * cos;
  const height = Math.abs(across);
  if (height < EPS) return null;
  const k = -along / height;
  const skew = (Math.atan(k) * 180) / Math.PI;
  if (Math.abs(skew) > MAX_SKEW) return null;
  let turn = norm180((theta * 180) / Math.PI);
  let flipX = false;
  let flipY = across < 0;
  // Mirrored top to bottom and turned half round is mirrored left to right: the smaller turn.
  if (flipY && Math.abs(norm180(turn - 180)) < Math.abs(turn)) {
    turn = norm180(turn - 180);
    [flipX, flipY] = [true, false];
  }
  const centre = apply(m, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
  const frame = multiply(
    multiply(translation(centre.x, centre.y), rotation(turn)),
    multiply([flipX ? -1 : 1, 0, 0, flipY ? -1 : 1, 0, 0], [1, 0, -k, 1, 0, 0]),
  );
  return {
    x: clean(centre.x - width / 2),
    y: clean(centre.y - height / 2),
    width: clean(width),
    height: clean(height),
    rotation: clean(turn),
    ...(flipX ? { flipX } : {}),
    ...(flipY ? { flipY } : {}),
    ...(Math.abs(skew) > 1e-6 ? { skewX: clean(skew) } : {}),
    frame,
  };
}

const near = (a: Pt, b: Pt, tol = 0.01) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
const sub2 = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Pt) => Math.hypot(v.x, v.y);

/** The segments that go somewhere (a canvas's arc first draws a line to where it starts). */
function realSegs(s: SubPath): ArcOrLine[] {
  const out: ArcOrLine[] = [];
  let at = s.start;
  for (const seg of s.segs) {
    const to = seg.to;
    if (seg.kind === 'L' && near(at, to, 1e-6)) continue;
    out.push(seg as ArcOrLine);
    at = to;
  }
  return out;
}
type ArcOrLine = Extract<SubPath['segs'][number], { kind: 'L' | 'A' | 'C' }>;

/** The end of the outline is back at its start: closed by Z or by going back. */
const comesBack = (s: SubPath) => s.closed || near(s.segs.at(-1)?.to ?? s.start, s.start, 1e-6);

/** Our own export's rectangles: four straight sides at right angles. */
function asRectangle(s: SubPath): { frame: Matrix; w: number; h: number } | null {
  const segs = realSegs(s);
  if (!comesBack(s) || segs.some((g) => g.kind !== 'L')) return null;
  const pts = [s.start, ...segs.map((g) => g.to)];
  if (near(pts.at(-1)!, pts[0]!, 1e-6)) pts.pop();
  if (pts.length !== 4) return null;
  const [p0, p1, p2, p3] = pts as [Pt, Pt, Pt, Pt];
  const [e1, e2] = [sub2(p1, p0), sub2(p3, p0)];
  const [w, h] = [len(e1), len(e2)];
  const tol = 0.01 + 1e-4 * Math.max(w, h);
  if (w < EPS || h < EPS) return null;
  if (!near(sub2(p2, p1), e2, tol) || Math.abs(e1.x * e2.x + e1.y * e2.y) / w > tol) return null;
  return { frame: [e1.x / w, e1.y / w, e2.x / h, e2.y / h, p0.x, p0.y], w, h };
}

/** Our own export's ellipses: arcs of one ellipse going all the way round. */
function asEllipse(s: SubPath): { frame: Matrix; rx: number; ry: number } | null {
  const segs = realSegs(s);
  if (segs.length === 0 || segs.some((g) => g.kind !== 'A')) return null;
  const arcs = segs as ArcSeg[];
  const [a] = arcs as [ArcSeg];
  const tol = 0.01 + 1e-4 * Math.max(a.rx, a.ry);
  const same = arcs.every(
    (b) =>
      Math.abs(b.rx - a.rx) <= tol &&
      Math.abs(b.ry - a.ry) <= tol &&
      Math.abs(norm180(b.rot - a.rot)) < 1e-3 &&
      // A half turn's centre moves a little with the file's rounding: allow for it.
      near(b.centre, a.centre, 0.05 + 0.01 * Math.max(a.rx, a.ry)),
  );
  const round = Math.abs(Math.abs(arcs.reduce((sum, b) => sum + b.sweep, 0)) - 2 * Math.PI);
  if (!same || round > 0.05 || !near(arcs.at(-1)!.to, s.start, tol)) return null;
  const centre = {
    x: arcs.reduce((sum, b) => sum + b.centre.x, 0) / arcs.length,
    y: arcs.reduce((sum, b) => sum + b.centre.y, 0) / arcs.length,
  };
  return {
    frame: multiply(translation(centre.x, centre.y), rotation(a.rot)),
    rx: a.rx,
    ry: a.ry,
  };
}

/** Our own export's rounded rectangles: four quarter circles of one radius, and straight sides. */
function asRoundedRect(s: SubPath): { frame: Matrix; w: number; h: number; r: number } | null {
  const segs = realSegs(s);
  const arcs = segs.filter((g): g is ArcSeg => g.kind === 'A');
  if (!comesBack(s) || arcs.length !== 4 || segs.some((g) => g.kind === 'C')) return null;
  if (segs.length - arcs.length > 4) return null;
  const r = arcs[0]!.rx;
  const tol = 0.01 + 1e-4 * r;
  if (!arcs.every((a) => Math.abs(a.rx - r) <= tol && Math.abs(a.ry - r) <= tol)) return null;
  if (!arcs.every((a) => Math.abs(Math.abs(a.sweep) - Math.PI / 2) < 1e-3)) return null;
  const [c0, c1, c2, c3] = arcs.map((a) => a.centre) as [Pt, Pt, Pt, Pt];
  const [s1, s2, s3, s4] = [sub2(c1, c0), sub2(c2, c1), sub2(c3, c2), sub2(c0, c3)];
  if (!near(s1, { x: -s3.x, y: -s3.y }, tol) || !near(s2, { x: -s4.x, y: -s4.y }, tol)) return null;
  if (Math.abs(s1.x * s2.x + s1.y * s2.y) > tol * Math.max(1, len(s1) * len(s2))) return null;
  // The top side runs from the top-left corner's centre (c3) to the top-right one's (c0).
  let e1: Pt;
  let e2: Pt;
  if (len(s4) > tol) {
    e1 = { x: s4.x / len(s4), y: s4.y / len(s4) };
    e2 = len(s1) > tol ? { x: s1.x / len(s1), y: s1.y / len(s1) } : { x: -e1.y, y: e1.x };
  } else if (len(s1) > tol) {
    e2 = { x: s1.x / len(s1), y: s1.y / len(s1) };
    e1 = { x: e2.y, y: -e2.x };
  } else
    [e1, e2] = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
  const [w, h] = [len(s4) + 2 * r, len(s1) + 2 * r];
  const origin = { x: c3.x - r * e1.x - r * e2.x, y: c3.y - r * e1.y - r * e2.y };
  return { frame: [e1.x, e1.y, e2.x, e2.y, origin.x, origin.y], w, h, r };
}

/** An outline through a matrix, as path points with handles where it curves. */
function outlineOf(s: SubPath, m: Matrix): Outline {
  const p = (q: Pt) => apply(m, q);
  const points: PathPoint[] = [{ ...p(s.start) }];
  for (const seg of s.segs) {
    const cubics = seg.kind === 'A' ? arcCubics(seg) : seg.kind === 'C' ? [seg] : [{ to: seg.to }];
    for (const c of cubics) {
      if ('c1' in c) {
        points[points.length - 1]!.out = p(c.c1);
        points.push({ ...p(c.to), in: p(c.c2) });
      } else points.push({ ...p(c.to) });
    }
  }
  const closed = s.closed;
  if (closed && points.length > 1 && near(points.at(-1)!, points[0]!, 1e-6)) {
    const last = points.pop()!;
    if (last.in) points[0]!.in = last.in;
  }
  // Handles on their anchor add nothing: a straight side stays straight.
  for (const q of points) {
    if (q.in && near(q.in, q, 1e-9)) delete q.in;
    if (q.out && near(q.out, q, 1e-9)) delete q.out;
  }
  return { points, closed };
}

/** Where the outlines lie on the stage, curves included. */
function boundsOf(outlines: readonly Outline[]) {
  const pts = outlines.flatMap((o) => flattenPath(o.points, o.closed));
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The local bounding box of an element's geometry (objectBoundingBox gradients). */
function localBounds(subs: readonly SubPath[]) {
  return boundsOf(subs.map((s) => outlineOf(s, IDENTITY)));
}

/** A gradient's stops along it (0–1) and their colours. */
interface Ramp {
  stops: { t: number; colour: string }[];
}

/** Two gradient colours mixed, their opacity too (G8). */
const mixAlpha = (a: string, b: string, t: number): string => {
  const byte = (c: string) => (c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255);
  const alpha = byte(a) + (byte(b) - byte(a)) * t;
  return withAlpha(mixColours(opaqueOf(a), opaqueOf(b), t), (alpha / 255) * 100);
};

/** A gradient's colour as a solid paint: its own opacity (G8) becomes the fill's. */
const solidOf = (colour: string): { paint: Paint; alpha: number } => ({
  paint: { kind: 'solid', colour: opaqueOf(colour) },
  alpha: colour.length > 7 ? parseInt(colour.slice(7, 9), 16) / 255 : 1,
});

function colourAt(ramp: Ramp, t: number): string {
  const { stops } = ramp;
  if (t <= stops[0]!.t) return stops[0]!.colour;
  for (let i = 1; i < stops.length; i++) {
    const [a, b] = [stops[i - 1]!, stops[i]!];
    if (t <= b.t)
      return b.t - a.t < EPS ? b.colour : mixAlpha(a.colour, b.colour, (t - a.t) / (b.t - a.t));
  }
  return stops.at(-1)!.colour;
}

/**
 * The app's gradient running over `u0`…`u1` of the file's (in its own 0–1): the colours at its
 * ends, and the file's colours that fall between as stops in %.
 */
function rampPaint(
  ramp: Ramp,
  t0: number,
  t1: number,
): { from: string; to: string; stops?: GradientStop[] } {
  const between: GradientStop[] = [];
  for (const s of ramp.stops) {
    const at = Math.round(((s.t - t0) / (t1 - t0)) * 1000) / 10;
    if (at > 0 && at < 100) between.push({ at, colour: s.colour });
  }
  between.sort((a, b) => a.at - b.at);
  return {
    from: colourAt(ramp, t0),
    to: colourAt(ramp, t1),
    ...(between.length ? { stops: between } : {}),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * GV6: reads an SVG file's objects. Throws an EditError when the file is not an SVG picture.
 */
export function readSvg(source: string, options: SvgReadOptions = {}): SvgImage {
  const dpi = options.dpi ?? 96;
  const tops = options.textTops ?? {};
  const root = parseXml(source);
  if (localName(root.name) !== 'svg') throw new EditError('This file is not an SVG picture.');

  // Every element with an id (gradients, <use>), and the style sheets' rules.
  const byId = new Map<string, XmlElement>();
  const rules: CssRule[] = [];
  const index = (e: XmlElement) => {
    if (e.attrs.id && !byId.has(e.attrs.id)) byId.set(e.attrs.id, e);
    if (localName(e.name) === 'style') rules.push(...cssRules(textOf(e), rules.length));
    e.children.filter(isElement).forEach(index);
  };
  index(root);
  rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);

  const counts = new Map<NoteKind, number>();
  const note = (kind: NoteKind) => counts.set(kind, (counts.get(kind) ?? 0) + 1);

  /** The element's own properties: attributes, then the sheet's rules, then style="". */
  function specified(e: XmlElement): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(e.attrs)) if (PROPERTIES.has(k)) out[k] = v.trim();
    const classes = (e.attrs.class ?? '').split(/\s+/).filter(Boolean);
    const tag = localName(e.name);
    for (const r of rules)
      if (
        (!r.tag || r.tag === tag) &&
        (!r.id || r.id === e.attrs.id) &&
        r.classes.every((c) => classes.includes(c))
      )
        Object.assign(out, r.decls);
    if (e.attrs.style) Object.assign(out, declarations(e.attrs.style));
    return out;
  }

  function styleOf(e: XmlElement, parent: Style): Style {
    const own = specified(e);
    const out: Record<string, string> = {};
    for (const k of INHERITED) if (parent[k] !== undefined) out[k] = parent[k]!;
    for (const [k, v] of Object.entries(own))
      if (v === 'inherit') {
        if (parent[k] !== undefined) out[k] = parent[k]!;
      } else out[k] = v;
    return out;
  }

  /** A length in the user units of a viewport (px, pt, mm… at the CSS 96 dpi; % of it). */
  function userLength(value: string | undefined, of: number, fallback = 0): number {
    const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(value ?? '');
    if (!m) return fallback;
    const v = Number(m[1]);
    const unit = m[2]!.toLowerCase();
    if (unit === '%') return (v / 100) * of;
    if (unit === 'em') return v * 16;
    if (unit === 'ex') return v * 8;
    if (unit === 'pc') return v * 16;
    if (unit === 'cm' || unit === 'mm' || unit === 'in' || unit === 'pt') return toPx(v, unit, 96);
    return v;
  }

  /** An opacity, "0.5" or "50%", as 0–1. */
  function opacityOf(value: string | undefined): number {
    if (value === undefined) return 1;
    const v = value.trim().endsWith('%') ? parseFloat(value) / 100 : parseFloat(value);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  }

  /** "url(#g) red", "currentColor", a colour: what a fill or outline is painted with. */
  type Spec =
    | { kind: 'none' }
    | { kind: 'colour'; colour: ReadColour }
    | { kind: 'gradient'; element: XmlElement };

  function specOf(value: string | undefined, style: Style, fallback: ReadColour | 'none'): Spec {
    const v = (value ?? '').trim();
    const url = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)\s*(.*)$/i.exec(v);
    if (url) {
      const target = byId.get(url[1]!);
      const kind = target ? localName(target.name) : '';
      if (target && (kind === 'linearGradient' || kind === 'radialGradient'))
        return { kind: 'gradient', element: target };
      if (target && kind === 'pattern') {
        note('pattern');
        const inside = patternColour(target);
        if (inside) return { kind: 'colour', colour: inside };
      }
      return url[2] ? specOf(url[2], style, 'none') : { kind: 'none' };
    }
    if (/^currentcolou?r$/i.test(v)) return specOf(style.color ?? 'black', {}, fallback);
    const c = parseColour(v);
    const read = c ?? fallback;
    return read === 'none' ? { kind: 'none' } : { kind: 'colour', colour: read };
  }

  /**
   * G12: the colour of a pattern's last filled part (drawn on top: the stripes, not the paper
   * under them), which the fill becomes.
   */
  function patternColour(p: XmlElement): ReadColour | null {
    let found: ReadColour | null = null;
    for (const child of p.children.filter(isElement)) {
      const fill = specified(child).fill;
      const c = fill ? parseColour(fill) : null;
      if (c && c !== 'none') found = c;
      found = patternColour(child) ?? found;
    }
    return found;
  }

  /** A gradient's attributes and stops, following href to the gradient it builds on. */
  function gradientOf(e: XmlElement) {
    const attrs: Record<string, string> = {};
    let stops: XmlElement[] = [];
    const seen = new Set<XmlElement>();
    for (let g: XmlElement | undefined = e; g && !seen.has(g);) {
      seen.add(g);
      for (const [k, v] of Object.entries(g.attrs)) if (!(k in attrs)) attrs[k] = v;
      const own = g.children.filter(isElement).filter((c) => localName(c.name) === 'stop');
      if (stops.length === 0) stops = own;
      const href: string = (g.attrs.href ?? g.attrs['xlink:href'] ?? '').replace(/^#/, '');
      g = href ? byId.get(href) : undefined;
    }
    let last = 0;
    const ramp: Ramp = { stops: [] };
    for (const s of stops) {
      const style = { ...declarations(s.attrs.style ?? ''), ...s.attrs };
      const own = { ...s.attrs, ...declarations(s.attrs.style ?? '') };
      const offset = opacityOf(own.offset ?? style.offset ?? '0');
      last = Math.max(last, offset);
      const c = parseColour(own['stop-color'] ?? 'black');
      // G8 (M23): a see-through stop keeps its opacity in its colour (#rrggbbaa).
      const alpha = opacityOf(own['stop-opacity']) * (c && c !== 'none' ? c.alpha : 1);
      ramp.stops.push({
        t: last,
        colour: withAlpha(c && c !== 'none' ? c.hex : '#000000', alpha * 100),
      });
    }
    return { attrs, kind: localName(e.name), ramp };
  }

  /**
   * The app's paint for a fill: a colour, or a gradient matched in the object's box. `frame`
   * takes the box (centred on 0, 0) to the stage; `m` the element's own units to the stage;
   * `bbox` is the element's own bounds (for objectBoundingBox gradients).
   */
  function paintOf(
    spec: Spec,
    place: { frame: Matrix; width: number; height: number },
    m: Matrix,
    bbox: { x: number; y: number; width: number; height: number },
    viewport: Viewport,
  ): { paint: Paint; alpha: number } {
    if (spec.kind === 'none') return { paint: { kind: 'none' }, alpha: 1 };
    if (spec.kind === 'colour')
      return { paint: { kind: 'solid', colour: spec.colour.hex }, alpha: spec.colour.alpha };
    const { attrs, kind, ramp } = gradientOf(spec.element);
    if (ramp.stops.length === 0) return { paint: { kind: 'none' }, alpha: 1 };
    if (ramp.stops.length === 1) return solidOf(ramp.stops[0]!.colour);
    const box = attrs.gradientUnits !== 'userSpaceOnUse';
    const units: Matrix = box ? [bbox.width, 0, 0, bbox.height, bbox.x, bbox.y] : IDENTITY;
    const toStage = multiply(multiply(m, units), parseTransform(attrs.gradientTransform));
    const back = invert(place.frame);
    const g = back ? multiply(back, toStage) : toStage;
    const coord = (name: string, fallback: string, of: number) =>
      box
        ? (() => {
            const v = (attrs[name] ?? fallback).trim();
            return v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
          })()
        : userLength(attrs[name] ?? fallback, of);
    const { width: w, height: h } = place;
    if (kind === 'linearGradient') {
      const p1 = apply(g, {
        x: coord('x1', '0%', viewport.width),
        y: coord('y1', '0%', viewport.height),
      });
      const p2 = apply(g, {
        x: coord('x2', '100%', viewport.width),
        y: coord('y2', '0%', viewport.height),
      });
      const v = sub2(p2, p1);
      const l2 = v.x * v.x + v.y * v.y;
      if (!(l2 > EPS)) return solidOf(ramp.stops.at(-1)!.colour);
      const angle = Math.atan2(v.y, v.x);
      const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      const t = (s: Pt) => ((s.x - p1.x) * v.x + (s.y - p1.y) * v.y) / l2;
      const [t0, t1] = [t({ x: -dx * half, y: -dy * half }), t({ x: dx * half, y: dy * half })];
      if (!(Math.abs(t1 - t0) > EPS)) return solidOf(colourAt(ramp, t0));
      return {
        paint: {
          kind: 'linear',
          angle: clean(((angle * 180) / Math.PI + 360) % 360),
          ...rampPaint(ramp, t0, t1),
        },
        alpha: 1,
      };
    }
    const c = apply(g, {
      x: coord('cx', '50%', viewport.width),
      y: coord('cy', '50%', viewport.height),
    });
    const r =
      coord('r', '50%', Math.hypot(viewport.width, viewport.height) / Math.SQRT2) * scaleOf(g);
    const reach = Math.max(w, h) / 2;
    if (!(r > EPS) || !(reach > EPS)) return solidOf(ramp.stops.at(-1)!.colour);
    const pct = (v: number, size: number) =>
      clean(Math.max(0, Math.min(100, size > EPS ? (v / size + 0.5) * 100 : 50)));
    const [cx, cy] = [pct(c.x, w), pct(c.y, h)];
    return {
      paint: {
        kind: 'radial',
        ...rampPaint(ramp, 0, reach / r),
        ...(cx !== 50 ? { cx } : {}),
        ...(cy !== 50 ? { cy } : {}),
      },
      alpha: 1,
    };
  }

  /** Fill, outline and opacities for a shape placed at `place`. */
  function looks(
    style: Style,
    place: { frame: Matrix; width: number; height: number },
    m: Matrix,
    bbox: { x: number; y: number; width: number; height: number },
    viewport: Viewport,
  ) {
    const fill = paintOf(
      specOf(style.fill, style, { hex: '#000000', alpha: 1 }),
      place,
      m,
      bbox,
      viewport,
    );
    const strokeSpec = specOf(style.stroke, style, 'none');
    let stroke: Stroke | undefined;
    const width =
      userLength(
        style['stroke-width'],
        Math.hypot(viewport.width, viewport.height) / Math.SQRT2,
        1,
      ) * scaleOf(m);
    if (strokeSpec.kind !== 'none' && width > 0) {
      let colour: ReadColour;
      if (strokeSpec.kind === 'gradient') {
        note('strokePaint');
        const { ramp } = gradientOf(strokeSpec.element);
        colour = { hex: opaqueOf(ramp.stops[0]?.colour ?? '#000000'), alpha: 1 };
      } else colour = strokeSpec.colour;
      const opacity = opacityOf(style['stroke-opacity']) * colour.alpha;
      stroke = {
        colour: colour.hex,
        width: clean(width),
        dash: dashOf(style['stroke-dasharray'], width / Math.max(scaleOf(m), EPS)),
        ...(opacity < 1 ? { opacity: clean(opacity * 100) } : {}),
      };
    }
    const fillOpacity = opacityOf(style['fill-opacity']) * fill.alpha;
    return {
      fill: fill.paint,
      ...(stroke ? { stroke } : {}),
      ...(fillOpacity < 1 && fill.paint.kind !== 'none'
        ? { fillOpacity: clean(fillOpacity * 100) }
        : {}),
    };
  }

  /** stroke-dasharray as the app's dashes: short dashes are dots. */
  function dashOf(value: string | undefined, width: number): Dash {
    const dashes = numbersIn(value ?? '');
    if (dashes.length === 0 || dashes.every((d) => d <= 0)) return 'solid';
    return dashes[0]! <= width ? 'dotted' : 'dashed';
  }

  const nameOf = (e: XmlElement, fallback: string) =>
    (e.attrs['inkscape:label'] ?? e.attrs.id ?? '').trim() || fallback;

  /** The parts an element is drawn with that the app cannot keep: noted, the rest drawn. */
  function noteLeftOut(style: Style): void {
    const used = (v: string | undefined) => v !== undefined && v !== 'none' && v !== '';
    if (used(style['clip-path'])) note('clip');
    if (used(style.mask)) note('mask');
    if (used(style.filter)) note('filter');
  }

  /** A box shape (rect, ellipse) as the app's own, or null to bake it into a path. */
  function boxShape(
    e: XmlElement,
    kind: 'rect' | 'ellipse',
    frame: Matrix,
    box: { x: number; y: number; w: number; h: number },
    style: Style,
    m: Matrix,
    bbox: { x: number; y: number; width: number; height: number },
    viewport: Viewport,
    radius = 0,
  ): AnimObject | null {
    const place = placeBox(frame, box);
    if (!place) return null;
    const { frame: placed, ...where } = place;
    const base = {
      id: newId(),
      name: nameOf(e, kind === 'rect' ? 'Rectangle' : 'Ellipse'),
      ...where,
      opacity: clean(opacityOf(style.opacity) * 100),
      ...looks(
        style,
        { frame: placed, width: place.width, height: place.height },
        m,
        bbox,
        viewport,
      ),
    };
    if (kind === 'ellipse') return { kind: 'ellipse', ...base };
    const scale = Math.min(place.width / box.w, place.height / box.h);
    return { kind: 'rect', radius: clean(radius * scale), ...base };
  }

  /** A path's outlines as one path with holes, or several paths in a group (open pieces). */
  function pathShape(
    e: XmlElement,
    subs: SubPath[],
    style: Style,
    m: Matrix,
    viewport: Viewport,
    fallbackName = 'Shape',
  ): AnimObject | null {
    const real = subs.filter((s) => s.segs.length > 0);
    if (real.length === 0) return null;
    const bbox = localBounds(real);
    if (real.length === 1) {
      const s = real[0]!;
      const rect = asRectangle(s);
      if (rect) {
        const made = boxShape(
          e,
          'rect',
          multiply(m, rect.frame),
          { x: 0, y: 0, w: rect.w, h: rect.h },
          style,
          m,
          bbox,
          viewport,
        );
        if (made) return made;
      }
      const round = asRoundedRect(s);
      if (round) {
        const made = boxShape(
          e,
          'rect',
          multiply(m, round.frame),
          { x: 0, y: 0, w: round.w, h: round.h },
          style,
          m,
          bbox,
          viewport,
          round.r,
        );
        if (made) return made;
      }
      const ellipse = asEllipse(s);
      if (ellipse) {
        const made = boxShape(
          e,
          'ellipse',
          multiply(m, ellipse.frame),
          { x: -ellipse.rx, y: -ellipse.ry, w: 2 * ellipse.rx, h: 2 * ellipse.ry },
          style,
          m,
          bbox,
          viewport,
        );
        if (made) return made;
      }
    }
    const outlines = real.map((s) => outlineOf(s, m)).filter((o) => o.points.length >= 2);
    if (outlines.length === 0) return null;
    const allClosed = outlines.every((o) => o.closed && o.points.length >= 3);
    const opacity = clean(opacityOf(style.opacity) * 100);
    const make = (main: Outline, holes: Outline[], name: string): PathObject => {
      const b = boundsOf([main, ...holes]);
      const shift = (q: PathPoint): PathPoint => ({
        ...q,
        x: clean(q.x - b.x),
        y: clean(q.y - b.y),
        ...(q.in ? { in: { x: clean(q.in.x - b.x), y: clean(q.in.y - b.y) } } : {}),
        ...(q.out ? { out: { x: clean(q.out.x - b.x), y: clean(q.out.y - b.y) } } : {}),
      });
      const place = {
        frame: translation(b.x + b.width / 2, b.y + b.height / 2),
        width: b.width,
        height: b.height,
      };
      const look = looks(style, place, m, bbox, viewport);
      return {
        kind: 'path',
        id: newId(),
        name,
        x: clean(b.x),
        y: clean(b.y),
        width: clean(b.width),
        height: clean(b.height),
        rotation: 0,
        opacity,
        ...look,
        // An open line is not filled in the app.
        ...(main.closed ? {} : { fill: { kind: 'none' as const } }),
        ...(main.closed ? {} : look.fillOpacity !== undefined ? { fillOpacity: undefined } : {}),
        points: main.points.map(shift),
        closed: main.closed,
        ...(holes.length ? { holes: holes.map((h) => h.points.map(shift)) } : {}),
      };
    };
    const name = nameOf(e, fallbackName);
    if (allClosed || outlines.length === 1) {
      const [main, ...holes] = outlines;
      return tidy(make(main!, holes, name));
    }
    // Pieces left open: each its own path, together as a group.
    return createGroup(outlines.map((o, i) => tidy(make(o, [], `${name} ${i + 1}`))));
  }

  /** Takes off what is undefined, so the objects are plain data. */
  function tidy<T extends object>(o: T): T {
    for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
    return o;
  }

  /** The nearest bundled font to a font-family list. */
  function fontFor(families: string): string {
    const list = families.split(',').map((f) =>
      f
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase(),
    );
    for (const fam of list) {
      const found = FONTS.find(
        (f) => fam === f.name.toLowerCase() || fam.startsWith(f.name.toLowerCase()),
      );
      if (found) return found.name;
    }
    const all = list.join(' ');
    if (/mono|courier|consol|typewriter/.test(all)) return 'Courier Prime';
    if (/cursive|script|comic|hand|brush/.test(all)) return 'Dancing Script';
    if (/fantasy|impact/.test(all)) return 'Anton';
    if (/(^|[^-])serif|times|georgia|garamond|cambria|book/.test(all) && !/sans/.test(all))
      return 'Noto Serif';
    return DEFAULT_FONT;
  }

  /** Text, line by line (a tspan with its own y starts a line). */
  function textShape(
    e: XmlElement,
    style: Style,
    m: Matrix,
    viewport: Viewport,
  ): AnimObject | null {
    const preserve = e.attrs['xml:space'] === 'preserve';
    const lines: string[] = [''];
    const walk = (node: XmlElement) => {
      for (const c of node.children) {
        if (!isElement(c)) lines[lines.length - 1] += c.text;
        else if (localName(c.name) === 'tspan') {
          if ((c.attrs.y !== undefined || c.attrs.dy !== undefined) && lines.at(-1)!.trim() !== '')
            lines.push('');
          walk(c);
        } else if (localName(c.name) === 'textPath') {
          note('other');
          walk(c);
        }
      }
    };
    walk(e);
    const text = lines
      .map((l) => (preserve ? l.replace(/[\n\t]/g, ' ') : l.replace(/\s+/g, ' ').trim()))
      .filter((l) => l !== '')
      .join('\n');
    if (text === '') return null;
    const vh = Math.hypot(viewport.width, viewport.height) / Math.SQRT2;
    const size = userLength(style['font-size'], vh, 16);
    const weight = style['font-weight'] ?? '400';
    const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
    const italic = /italic|oblique/.test(style['font-style'] ?? '');
    const font = fontFor(style['font-family'] ?? 'sans-serif');
    const anchor = style['text-anchor'] ?? 'start';
    const align: TextAlign = anchor === 'middle' ? 'centre' : anchor === 'end' ? 'right' : 'left';
    const x = userLength(numbersIn(e.attrs.x ?? '0')[0]?.toString(), viewport.width);
    const y = userLength(numbersIn(e.attrs.y ?? '0')[0]?.toString(), viewport.height);
    const nLines = text.split('\n').length;
    const w = roughTextWidth(text, size);
    const h = size * LINE_HEIGHT * nLines;
    const probe = { italic, bold, size: 100, font } as TextObject;
    const baseline = style['dominant-baseline'] ?? '';
    const top = /before-edge|hanging|text-top/.test(baseline)
      ? 0
      : /central|middle/.test(baseline)
        ? 0.5
        : (tops[fontKey(fontOf(probe))] ?? DEFAULT_TOP);
    const left = x - (align === 'centre' ? w / 2 : align === 'right' ? w : 0);
    const place = placeBox(m, { x: left, y: y - top * size, w, h });
    if (!place) {
      note('other');
      return null;
    }
    const { frame, ...where } = place;
    const look = looks(
      style,
      { frame, width: place.width, height: place.height },
      m,
      { x: left, y: y - top * size, width: w, height: h },
      viewport,
    );
    return tidy({
      kind: 'text',
      id: newId(),
      name: nameOf(e, text.split('\n')[0]!.trim()),
      ...where,
      opacity: clean(opacityOf(style.opacity) * 100),
      ...look,
      text,
      font,
      size: clean(size * (place.height / h)),
      bold,
      italic,
      align,
    } satisfies TextObject);
  }

  /** The matrix of a viewport of `size` showing `viewBox` (preserveAspectRatio as written). */
  function viewBoxMatrix(
    e: XmlElement,
    size: Viewport,
    natural: Viewport,
  ): { m: Matrix; viewport: Viewport } {
    const box = numbersIn(e.attrs.viewBox ?? '');
    if (box.length < 4 || !(box[2]! > 0) || !(box[3]! > 0)) {
      return {
        m: [size.width / natural.width || 1, 0, 0, size.height / natural.height || 1, 0, 0],
        viewport: natural,
      };
    }
    const [minX, minY, vw, vh] = box as [number, number, number, number];
    const par = (e.attrs.preserveAspectRatio ?? 'xMidYMid meet').trim();
    let [sx, sy] = [size.width / vw, size.height / vh];
    let [tx, ty] = [0, 0];
    if (!par.startsWith('none')) {
      const s = /slice/.test(par) ? Math.max(sx, sy) : Math.min(sx, sy);
      [sx, sy] = [s, s];
      const spare = { x: size.width - vw * s, y: size.height - vh * s };
      tx = /xMid/.test(par) ? spare.x / 2 : /xMax/.test(par) ? spare.x : 0;
      ty = /YMid/.test(par) ? spare.y / 2 : /YMax/.test(par) ? spare.y : 0;
    }
    return {
      m: [sx, 0, 0, sy, tx - minX * sx, ty - minY * sy],
      viewport: { width: vw, height: vh },
    };
  }

  const DRAWN_ELSEWHERE = new Set([
    'defs',
    'title',
    'desc',
    'metadata',
    'style',
    'script',
    'linearGradient',
    'radialGradient',
    'clipPath',
    'mask',
    'marker',
    'symbol',
    'pattern',
    'filter',
    'font',
    'font-face',
    'cursor',
    'animate',
    'animateTransform',
    'animateMotion',
    'set',
    'view',
    'stop',
  ]);
  const NOT_EDITABLE = new Set(['foreignObject', 'video', 'audio', 'iframe', 'canvas']);

  /** The objects an element draws, in stage px. `depth` stops a <use> that uses itself. */
  function draw(
    e: XmlElement,
    parentM: Matrix,
    parent: Style,
    viewport: Viewport,
    depth = 0,
  ): AnimObject[] {
    if (depth > 24) return [];
    const tag = localName(e.name);
    // Other programs' own elements (sodipodi:namedview, inkscape:…) are not drawn.
    if (e.name.includes(':') && !e.name.startsWith('svg:')) return [];
    if (DRAWN_ELSEWHERE.has(tag)) return [];
    const style = styleOf(e, parent);
    if (style.display === 'none') return [];
    const m = multiply(parentM, parseTransform(e.attrs.transform));
    const len = (name: string, of: number, fallback = 0) => userLength(e.attrs[name], of, fallback);
    const diag = Math.hypot(viewport.width, viewport.height) / Math.SQRT2;
    const hidden = style.visibility === 'hidden' || style.visibility === 'collapse';
    switch (tag) {
      case 'svg':
      case 'g':
      case 'a':
      case 'switch': {
        let inner = m;
        let vp = viewport;
        if (tag === 'svg') {
          const size = {
            width: len('width', viewport.width, viewport.width),
            height: len('height', viewport.height, viewport.height),
          };
          const fit = viewBoxMatrix(e, size, size);
          inner = multiply(
            multiply(m, translation(len('x', viewport.width), len('y', viewport.height))),
            fit.m,
          );
          vp = fit.viewport;
        }
        noteLeftOut(style);
        const kids = e.children.filter(isElement);
        const list = tag === 'switch' ? kids.slice(0, 1) : kids;
        const children = list.flatMap((c) => draw(c, inner, style, vp, depth + 1));
        return grouped(e, children, opacityOf(style.opacity));
      }
      case 'use': {
        const href = (e.attrs.href ?? e.attrs['xlink:href'] ?? '').replace(/^#/, '');
        const target = byId.get(href);
        if (!target) return [];
        const at = multiply(m, translation(len('x', viewport.width), len('y', viewport.height)));
        noteLeftOut(style);
        const used =
          localName(target.name) === 'symbol'
            ? target.children
                .filter(isElement)
                .flatMap((c) => draw(c, at, styleOf(target, style), viewport, depth + 1))
            : draw(target, at, style, viewport, depth + 1);
        return grouped(e, used, opacityOf(style.opacity));
      }
      case 'image':
        note('picture');
        return [];
      case 'text': {
        if (hidden) return [];
        noteLeftOut(style);
        const t = textShape(e, style, m, viewport);
        return t ? [t] : [];
      }
      default:
        break;
    }
    if (NOT_EDITABLE.has(tag)) {
      note('other');
      return [];
    }
    // Hidden, or squashed flat by its transform (a browser draws nothing then either).
    if (hidden || scaleOf(m) < EPS) return [];
    let made: AnimObject | null;
    switch (tag) {
      case 'rect': {
        const [x, y] = [len('x', viewport.width), len('y', viewport.height)];
        const [w, h] = [len('width', viewport.width), len('height', viewport.height)];
        if (!(w > 0 && h > 0)) return [];
        let rx = e.attrs.rx !== undefined ? len('rx', viewport.width) : undefined;
        let ry = e.attrs.ry !== undefined ? len('ry', viewport.height) : undefined;
        rx = Math.max(0, Math.min(w / 2, rx ?? ry ?? 0));
        ry = Math.max(0, Math.min(h / 2, ry ?? rx));
        const bbox = { x, y, width: w, height: h };
        made = boxShape(e, 'rect', m, { x, y, w, h }, style, m, bbox, viewport, Math.min(rx, ry));
        if (!made) {
          const d =
            rx > 0 && ry > 0
              ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
              : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
          made = pathShape(e, parsePathData(d), style, m, viewport, 'Rectangle');
        }
        break;
      }
      case 'circle':
      case 'ellipse': {
        const [cx, cy] = [len('cx', viewport.width), len('cy', viewport.height)];
        const rx = tag === 'circle' ? len('r', diag) : len('rx', viewport.width, NaN);
        const ry = tag === 'circle' ? rx : len('ry', viewport.height, NaN);
        const [a, b] = [Number.isNaN(rx) ? ry : rx, Number.isNaN(ry) ? rx : ry];
        if (!(a > 0 && b > 0)) return [];
        const bbox = { x: cx - a, y: cy - b, width: 2 * a, height: 2 * b };
        made =
          boxShape(
            e,
            'ellipse',
            m,
            { x: cx - a, y: cy - b, w: 2 * a, h: 2 * b },
            style,
            m,
            bbox,
            viewport,
          ) ??
          pathShape(
            e,
            parsePathData(
              `M${cx + a} ${cy}A${a} ${b} 0 0 1 ${cx - a} ${cy}A${a} ${b} 0 0 1 ${cx + a} ${cy}Z`,
            ),
            style,
            m,
            viewport,
            'Ellipse',
          );
        break;
      }
      case 'line': {
        const d = `M${len('x1', viewport.width)} ${len('y1', viewport.height)}L${len('x2', viewport.width)} ${len('y2', viewport.height)}`;
        made = pathShape(e, parsePathData(d), style, m, viewport, 'Line');
        break;
      }
      case 'polyline':
      case 'polygon': {
        const v = numbersIn(e.attrs.points ?? '');
        if (v.length < 4) return [];
        const pairs: string[] = [];
        for (let i = 0; i + 1 < v.length; i += 2) pairs.push(`${v[i]} ${v[i + 1]}`);
        const d = `M${pairs.join('L')}${tag === 'polygon' ? 'Z' : ''}`;
        made = pathShape(
          e,
          parsePathData(d),
          style,
          m,
          viewport,
          tag === 'polygon' ? 'Shape' : 'Path',
        );
        break;
      }
      case 'path': {
        const subs = parsePathData(e.attrs.d ?? '');
        made = subs.length
          ? pathShape(e, subs, style, m, viewport, subs.every((s) => s.closed) ? 'Shape' : 'Path')
          : null;
        break;
      }
      default:
        return [];
    }
    if (!made) return [];
    noteLeftOut(style);
    return [made];
  }

  /** A <g>'s children as a group (one child: itself, its opacity taken in). */
  function grouped(e: XmlElement, children: AnimObject[], opacity: number): AnimObject[] {
    if (children.length === 0) return [];
    if (children.length === 1) {
      const [only] = children as [AnimObject];
      return [opacity < 1 ? { ...only, opacity: clean(only.opacity * opacity) } : only];
    }
    const group = createGroup(children);
    return [{ ...group, name: nameOf(e, 'Group'), opacity: clean(opacity * 100) }];
  }

  // The picture's own size, and the step from its units to px at the dpi.
  const sized = (name: 'width' | 'height', at: number) => {
    const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(
      root.attrs[name] ?? '',
    );
    if (!m) return undefined;
    const v = Number(m[1]);
    const unit = (m[2] ?? 'px').toLowerCase();
    const px =
      unit === 'px' ? v : unit === 'pc' ? toPx(v * 12, 'pt', at) : toPx(v, unit as 'cm', at);
    return px > 0 ? px : undefined;
  };
  const box = numbersIn(root.attrs.viewBox ?? '');
  const [bw, bh] = [box[2] ?? NaN, box[3] ?? NaN];
  const hasBox = bw > 0 && bh > 0;
  let [width, height] = [sized('width', dpi), sized('height', dpi)];
  let [cssW, cssH] = [sized('width', 96), sized('height', 96)];
  if (hasBox) {
    if (width === undefined && height === undefined) [width, height, cssW, cssH] = [bw, bh, bw, bh];
    else if (width === undefined) [width, cssW] = [(height! * bw) / bh, (cssH! * bw) / bh];
    else if (height === undefined) [height, cssH] = [(width * bh) / bw, (cssW! * bh) / bw];
  }
  [width, height] = [width ?? 300, height ?? 150];
  [cssW, cssH] = [cssW ?? 300, cssH ?? 150];
  const fit = viewBoxMatrix(root, { width, height }, { width: cssW, height: cssH });
  const rootStyle = styleOf(root, ROOT_STYLE);
  noteLeftOut(rootStyle);
  const objects = root.children
    .filter(isElement)
    .flatMap((c) => draw(c, fit.m, rootStyle, fit.viewport));
  const rootOpacity = opacityOf(rootStyle.opacity);
  const shown =
    rootOpacity < 1
      ? objects.map((o) => ({ ...o, opacity: clean(o.opacity * rootOpacity) }))
      : objects;

  const notes: string[] = [];
  const n = (k: NoteKind) => counts.get(k) ?? 0;
  if (n('picture'))
    notes.push(
      `${plural(n('picture'), 'picture')} inside the SVG ${n('picture') === 1 ? 'was' : 'were'} left out.`,
    );
  if (n('clip')) notes.push('A clip path was left out: the shapes it cut are shown whole.');
  if (n('mask')) notes.push('A mask was left out: the shapes under it are shown whole.');
  if (n('filter'))
    notes.push('Effects (shadows, glows, blurs) were left out: add them again in Properties.');
  if (n('pattern')) notes.push('A pattern fill became one colour.');
  if (n('strokePaint')) notes.push('A gradient outline became one colour.');
  if (n('other'))
    notes.push(
      `${plural(n('other'), 'part')} the app cannot edit (such as text on a path) ${n('other') === 1 ? 'was' : 'were'} left out.`,
    );
  return { width: clean(width), height: clean(height), objects: shown, notes };
}

/**
 * GV6: an SVG opened as an image: a rectangle filling the whole canvas first (our own exports'
 * background, a plain colour) becomes the canvas colour instead of an object.
 */
export function takeBackground(image: SvgImage): { background?: string; objects: AnimObject[] } {
  const [first, ...rest] = image.objects;
  const fills =
    first?.kind === 'rect' &&
    first.radius === 0 &&
    first.rotation === 0 &&
    !first.stroke &&
    !first.skewX &&
    first.opacity === 100 &&
    first.fillOpacity === undefined &&
    first.fill.kind === 'solid' &&
    Math.abs(first.x) < 0.01 &&
    Math.abs(first.y) < 0.01 &&
    Math.abs(first.width - image.width) < 0.01 &&
    Math.abs(first.height - image.height) < 0.01;
  return fills && first.fill.kind === 'solid'
    ? { background: first.fill.colour, objects: rest }
    : { objects: image.objects };
}

/**
 * GV6: an SVG opened in Graphics mode as a new image: the canvas its size (whole px, at least
 * 16), its objects on the first layer, its background rectangle the canvas colour (else
 * see-through, as the SVG was).
 */
export function imageFromSvg(name: string, image: SvgImage, dpi = SCREEN_DPI): AnimationDoc {
  const { background, objects } = takeBackground(image);
  const side = (v: number) => Math.max(MIN_STAGE, Math.ceil(v - 1e-6));
  const doc = createGraphic({
    name,
    size: { width: side(image.width), height: side(image.height), units: 'px', dpi },
    background: background ?? TRANSPARENT,
  });
  const [first, ...rest] = doc.layers;
  return { ...doc, layers: [{ ...first!, objects }, ...rest] };
}
