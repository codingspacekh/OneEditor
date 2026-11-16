// AN16: reading and writing .mvea animation files (JSON), with picture paths relative to the
// file (X1) and the version upgrades of core/project/migrate.ts.
import { ProjectFileError } from '../model/errors.ts';
import { migrate, type Migration, type ProjectDocument } from '../project/migrate.ts';
import { fromProjectPath, toProjectPath } from '../project/paths.ts';
import { isColour, isStageBackground } from './rules.ts';
import type { AnimationDoc, ObjectKind } from './types.ts';

export const ANIMATION_SCHEMA = 5;
export const ANIMATION_DAMAGED = 'This file is not a OneEditor animation, or it is damaged.';

/** Add an entry whenever the animation format changes (see core/project/migrate.ts). */
export const ANIMATION_MIGRATIONS: Record<number, Migration> = {
  /** Version 2 (M14): objects may carry keyframe tracks. A v1 file has none, so nothing changes. */
  1: (v1) => ({ ...v1, schemaVersion: 2 }),
  /** Version 3 (M15): motion paths, shape keyframes and mask layers; a v2 file has none. */
  2: (v2) => ({ ...v2, schemaVersion: 3 }),
  /** Version 4 (M16): buttons (AN18), stop motion and frame-by-frame layers (AN14); a v3 file has none. */
  3: (v3) => ({ ...v3, schemaVersion: 4 }),
  /**
   * Version 5 (M19, M20, released together in 1.6): pattern fills, fill and outline opacity,
   * effects, envelopes, arcs, node types, template layers and the outline view; letter spacing,
   * kerning, line spacing, text on a path and in a shape; a v4 file has none.
   */
  4: (v4) => ({ ...v4, schemaVersion: 5 }),
};

export function serializeAnimation(doc: AnimationDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function deserializeAnimation(text: string): AnimationDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError(ANIMATION_DAMAGED);
  }
  if (!isObject(raw) || !Number.isInteger(raw.schemaVersion) || !Array.isArray(raw.layers))
    throw new ProjectFileError(ANIMATION_DAMAGED);
  const doc = migrate(raw, ANIMATION_MIGRATIONS, ANIMATION_SCHEMA);
  if (!isAnimation(doc)) throw new ProjectFileError(ANIMATION_DAMAGED);
  return doc;
}

const relocate = (doc: AnimationDoc, map: (path: string) => string): AnimationDoc => ({
  ...doc,
  pictures: doc.pictures.map((p) => ({ ...p, path: map(p.path) })),
  // AN28: sounds too (absent when there are none, so older versions still open the file).
  ...(doc.sounds ? { sounds: doc.sounds.map((s) => ({ ...s, path: map(s.path) })) } : {}),
});

export const animationToDisk = (doc: AnimationDoc, dir: string): AnimationDoc =>
  relocate(doc, (path) => toProjectPath(dir, path));

export const animationFromDisk = (doc: AnimationDoc, dir: string): AnimationDoc =>
  relocate(doc, (path) => fromProjectPath(dir, path));

// ---- shape checks: enough to refuse files that are not animations or are damaged ----

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const has = (o: Obj, keys: string[], check: (v: unknown) => boolean) =>
  keys.every((k) => check(o[k]));
const listOf = (v: unknown, check: (item: Obj) => boolean) =>
  Array.isArray(v) && v.every((item) => isObject(item) && check(item));

const KINDS: ObjectKind[] = [
  'rect',
  'ellipse',
  'star',
  'polygon',
  'path',
  'text',
  'picture',
  'button',
  'group',
];

const ACTIONS = ['pause', 'continue', 'restart', 'goto'];

/** G12 (M19): the built-in pattern tiles and a picture tiled. */
const PATTERNS = [
  'weave',
  'checks',
  'stripes',
  'dots',
  'hatching',
  'crosshatch',
  'bricks',
  'picture',
];
const PRESETS = ['arch', 'arc', 'bulge', 'flag', 'wave', 'rise', 'squeeze'];
const ARC_CLOSES = ['open', 'pie', 'chord'];
const NODE_TYPES = ['cusp', 'smooth', 'symmetrical'];

const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const isPoint = (v: unknown) => isObject(v) && has(v, ['x', 'y'], isNumber);

/** G14 (M19): an effect and its numbers. */
function isFilter(f: Obj): boolean {
  switch (f.kind) {
    case 'dropShadow':
    case 'innerShadow':
      return isColour(f.colour) && has(f, ['dx', 'dy', 'blur', 'opacity'], isNumber);
    case 'glow':
      return isColour(f.colour) && has(f, ['blur', 'opacity'], isNumber);
    case 'bevel':
      return (
        has(f, ['depth', 'blur', 'angle', 'opacity'], isNumber) &&
        isColour(f.light) &&
        isColour(f.shadow)
      );
    case 'blur':
      return isNumber(f.radius);
    default:
      return false;
  }
}

const SIDES = ['outside', 'inside', 'centred'];

/** GT2 (M20): text on a path: its outline, where the words start and on which side. */
const isTextPath = (v: unknown): boolean =>
  isObject(v) &&
  isPathPoints(v.points) &&
  isBoolean(v.closed) &&
  isNumber(v.start) &&
  SIDES.includes(v.side as string) &&
  optional(v.flip, isBoolean) &&
  optional(v.stroke, (st) => isObject(st) && isColour(st.colour) && isNumber(st.width));

/** GT3 (M20): text in a shape: its outline, holes and padding. */
const isTextShape = (v: unknown): boolean =>
  isObject(v) &&
  isPathPoints(v.points) &&
  optional(v.holes, (h) => Array.isArray(h) && h.every(isPathPoints)) &&
  isNumber(v.padding);

/** GV4 (M19): a side of a custom envelope. */
const isSide = (v: unknown) => isObject(v) && ['a', 'c1', 'c2', 'b'].every((k) => isPoint(v[k]));

function isEnvelope(e: unknown): boolean {
  if (!isObject(e)) return false;
  switch (e.kind) {
    case 'preset':
      return PRESETS.includes(e.preset as string) && isNumber(e.bend);
    case 'perspective':
      return Array.isArray(e.corners) && e.corners.length === 4 && e.corners.every(isPoint);
    case 'custom':
      return (
        isObject(e.sides) &&
        ['top', 'right', 'bottom', 'left'].every((k) => isSide((e.sides as Obj)[k]))
      );
    default:
      return false;
  }
}

/** AN6: a gradient's colours between from and to, each at a % of the way. */
const isStops = (v: unknown) =>
  v === undefined || listOf(v, (s) => isNumber(s.at) && isColour(s.colour));

function isPaint(p: unknown): boolean {
  if (!isObject(p)) return false;
  switch (p.kind) {
    case 'none':
      return true;
    case 'solid':
      return isColour(p.colour);
    case 'linear':
      return isColour(p.from) && isColour(p.to) && isNumber(p.angle) && isStops(p.stops);
    case 'radial':
      return (
        isColour(p.from) &&
        isColour(p.to) &&
        isStops(p.stops) &&
        // AN6: its centre, in % of the box.
        ['cx', 'cy'].every((k) => p[k] === undefined || isNumber(p[k]))
      );
    case 'pattern':
      // G12 (M19): a tile in a colour on a background (or see-through), or a picture tiled.
      return (
        PATTERNS.includes(p.pattern as string) &&
        isColour(p.colour) &&
        isStageBackground(p.background) &&
        isNumber(p.size) &&
        optional(p.angle, isNumber) &&
        optional(p.pictureId, isString) &&
        (p.pattern !== 'picture' || isString(p.pictureId))
      );
    default:
      return false;
  }
}

const isTrack = (t: Obj): boolean =>
  isString(t.property) &&
  listOf(
    t.keyframes,
    (k) =>
      isNumber(k.frame) &&
      (isNumber(k.value) ||
        isString(k.value) ||
        (isObject(k.value) && isPathPoints(k.value.points) && isBoolean(k.value.closed))) &&
      isString(k.easing) &&
      isBoolean(k.hold),
  ) &&
  (t.repeat === undefined || t.repeat === 'end' || isNumber(t.repeat));

const isPathPoints = (v: unknown) =>
  listOf(
    v,
    (p) =>
      has(p, ['x', 'y'], isNumber) &&
      // GV3 (M19): how its handles move together.
      optional(p.type, (t) => NODE_TYPES.includes(t as string)),
  );

const isMotion = (m: unknown): boolean =>
  isObject(m) &&
  isPathPoints(m.points) &&
  has(m, ['closed', 'orient', 'even'], isBoolean) &&
  has(m, ['from', 'to'], isNumber) &&
  isString(m.easing);

function isAnimObject(o: Obj): boolean {
  if (!isString(o.kind) || !KINDS.includes(o.kind as ObjectKind)) return false;
  if (!has(o, ['id', 'name'], isString)) return false;
  if (!has(o, ['x', 'y', 'width', 'height', 'rotation', 'opacity'], isNumber)) return false;
  if (!isPaint(o.fill)) return false;
  if (o.stroke !== undefined) {
    if (!isObject(o.stroke) || !isColour(o.stroke.colour) || !isNumber(o.stroke.width))
      return false;
    // G12 (M19): the outline's own opacity.
    if (!optional(o.stroke.opacity, isNumber)) return false;
  }
  // G12, G14, GV4 (M19): the fill's own opacity, effects, an envelope.
  if (!optional(o.fillOpacity, isNumber)) return false;
  if (!optional(o.filters, (v) => listOf(v, isFilter))) return false;
  if (!optional(o.envelope, isEnvelope)) return false;
  if (o.tracks !== undefined && !listOf(o.tracks, isTrack)) return false;
  if (o.paths !== undefined && !(Array.isArray(o.paths) && o.paths.every(isMotion))) return false;
  if (o.drawing !== undefined && !isNumber(o.drawing)) return false;
  if (
    (o.flipX !== undefined && !isBoolean(o.flipX)) ||
    (o.flipY !== undefined && !isBoolean(o.flipY))
  )
    return false;
  if (
    (o.skewX !== undefined && !isNumber(o.skewX)) ||
    (o.skewY !== undefined && !isNumber(o.skewY))
  )
    return false;
  // AN27: the point it turns about, as fractions of its box.
  if (o.pivot !== undefined && !(isObject(o.pivot) && has(o.pivot, ['x', 'y'], isNumber)))
    return false;
  switch (o.kind) {
    case 'rect':
      return isNumber(o.radius);
    case 'ellipse':
      // GV1 (M19): part of the ellipse.
      return optional(
        o.arc,
        (a) =>
          isObject(a) &&
          has(a, ['start', 'end'], isNumber) &&
          ARC_CLOSES.includes(a.close as string),
      );
    case 'star':
      return isNumber(o.points) && isNumber(o.inner);
    case 'polygon':
      return isNumber(o.sides);
    case 'path':
      return (
        isBoolean(o.closed) &&
        isPathPoints(o.points) &&
        (o.holes === undefined || (Array.isArray(o.holes) && o.holes.every(isPathPoints))) &&
        // GT4 (M20): a letter made curves is filled as its font is.
        optional(o.fillRule, (r) => r === 'nonzero' || r === 'evenodd')
      );
    case 'text':
      return (
        has(o, ['text', 'font', 'align'], isString) &&
        isNumber(o.size) &&
        has(o, ['bold', 'italic'], isBoolean) &&
        // AN26: the bend along an arc.
        (o.curve === undefined || isNumber(o.curve)) &&
        // GT1–GT3 (M20): spacing, kerning, line spacing, on a path, in a shape.
        ['letterSpacing', 'lineSpacing'].every((k) => optional(o[k], isNumber)) &&
        optional(o.kerning, (v) => Array.isArray(v) && v.every(isNumber)) &&
        optional(o.path, isTextPath) &&
        optional(o.inShape, isTextShape)
      );
    case 'picture':
      return isString(o.pictureId);
    case 'button':
      return (
        isString(o.label) &&
        ACTIONS.includes(o.action as string) &&
        (o.frame === undefined || isNumber(o.frame)) &&
        isNumber(o.size) &&
        isColour(o.colour)
      );
    case 'group':
      return listOf(o.children, isAnimObject);
    default:
      return true;
  }
}

/** AN28: a sound: its file, length, start, volume, and the optional trim, fades and mute. */
const isSound = (s: Obj): boolean =>
  has(s, ['id', 'name', 'path'], isString) &&
  has(s, ['duration', 'start', 'volume'], isNumber) &&
  (s.effect === undefined || isString(s.effect)) &&
  ['offset', 'length', 'fadeIn', 'fadeOut'].every((k) => s[k] === undefined || isNumber(s[k])) &&
  (s.muted === undefined || isBoolean(s.muted));

function isAnimation(doc: ProjectDocument): doc is ProjectDocument & AnimationDoc {
  const { stage, guides, view } = doc;
  return (
    doc.schemaVersion === ANIMATION_SCHEMA &&
    isString(doc.name) &&
    isObject(stage) &&
    has(stage, ['width', 'height', 'fps', 'length'], isNumber) &&
    isStageBackground(stage.background) &&
    (stage.playOnce === undefined || isBoolean(stage.playOnce)) &&
    listOf(
      doc.layers,
      (l) =>
        has(l, ['id', 'name'], isString) &&
        has(l, ['visible', 'locked'], isBoolean) &&
        (l.mask === undefined || isBoolean(l.mask)) &&
        // GV8 (M19): a template to draw over.
        optional(l.template, isBoolean) &&
        (l.drawings === undefined ||
          (Array.isArray(l.drawings) && l.drawings.length > 0 && l.drawings.every(isNumber))) &&
        listOf(l.objects, isAnimObject),
    ) &&
    listOf(doc.folders, (f) => has(f, ['id', 'name'], isString)) &&
    listOf(
      doc.pictures,
      (p) => has(p, ['id', 'path'], isString) && has(p, ['width', 'height'], isNumber),
    ) &&
    (doc.sounds === undefined || listOf(doc.sounds, isSound)) &&
    // G1 (M18): a Graphics mode image's resolution and units.
    (doc.graphic === undefined ||
      (isObject(doc.graphic) &&
        isNumber(doc.graphic.dpi) &&
        ['px', 'cm', 'mm', 'in', 'pt'].includes(doc.graphic.units as string))) &&
    isObject(guides) &&
    Array.isArray(guides.x) &&
    Array.isArray(guides.y) &&
    isObject(view) &&
    isObject(view.grid) &&
    isObject(view.snap) &&
    // GV7 (M19): the outline view.
    optional(view.wireframe, isBoolean)
  );
}
