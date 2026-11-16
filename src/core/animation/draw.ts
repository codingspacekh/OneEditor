// AN1–AN7, AN13: draws the stage onto any 2D canvas. The preview, the PNG export, the video
// and GIF exports (M14) and the HTML player (M16) all use this one function, so what the
// student sees is what is exported (ARCHITECTURE §7.3, as the text drawing).
import { curvedText, curveOf, type PlacedLetter } from './curve.ts';
import { roughTextWidth } from './factory.ts';
import { placeLetters } from './letters-placed.ts';
import { hasLetterSpacing, layoutText, lineHeightOf } from './text-layout.ts';
import { bentForDrawing } from '../graphics/warp.ts';
import { flattenPath, isClosed, localOutline, outlineOf, pivotInBox, skewOf } from './geometry.ts';
import { arcSweep } from '../graphics/bezier.ts';
import { colourStops, radialCentre } from './gradient.ts';
import { patternTileOf, timesMatrix, type PatternTile } from './appearance.ts';
import { TRANSPARENT } from './rules.ts';
import { stateAt } from './state.ts';
import { clipBaseIndex } from '../graphics/pixels/clipping.ts';
import type { Bitmap, Mask } from '../graphics/pixels/raster.ts';
import type {
  AnimObject,
  AnimationDoc,
  BlendMode,
  ButtonObject,
  EllipseObject,
  Layer,
  ObjectFilter,
  Paint,
  PathObject,
  Stroke,
  TextObject,
} from './types.ts';

/** The parts of CanvasRenderingContext2D the drawing needs (a recording fake is used in tests). */
export interface StageCanvas {
  globalAlpha: number;
  fillStyle: string | object;
  strokeStyle: string | object;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
  /** AN23: a flip is a scale of −1. */
  scale(x: number, y: number): void;
  /** AN25: a skew (and taking it off again for an outline). */
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  setLineDash(segments: number[]): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    start: number,
    end: number,
  ): void;
  /** AN24: 'evenodd' for a shape with holes. */
  fill(rule?: 'nonzero' | 'evenodd'): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  /** AN26: how wide words are in the current font (a canvas without it: roughly). */
  measureText?(text: string): { width: number };
  drawImage(image: unknown, x: number, y: number, w: number, h: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): CanvasGradientLike;
  /**
   * Draws `draw` into a layer of its own, then puts the layer down at `alpha`: a see-through
   * group is faded as one picture, so where its parts overlap it is no darker. A canvas without
   * it fades each part instead.
   */
  withLayer?(alpha: number, draw: (layer: StageCanvas) => void, how?: LayerHow): void;
  /**
   * G12 (M19): a pattern fill to use as a fillStyle: `tile` repeated, placed by its matrix in
   * the current space. A canvas without it (or giving null) fills with the pattern's colour.
   */
  patternOf?(tile: PatternTile): object | null;
  /**
   * G14 (M19): draws `draw` into a layer of its own, then puts the layer down with the effects,
   * in order, each on what the ones before made (shadows, glows, bevels, blur). Their sizes are
   * stage pixels, their offsets the stage's directions. A canvas without it draws no effects.
   */
  withFilters?(filters: readonly ObjectFilter[], draw: (layer: StageCanvas) => void): void;
  /**
   * G2 (M21): how what is drawn next mixes with what is there ('source-over', 'multiply'…). A
   * canvas without it draws every layer normally.
   */
  globalCompositeOperation?: string;
  /**
   * G2, GB1 (M21): draws a pixel layer's bitmap with its top left at (x, y) in the current space,
   * at globalAlpha, seen only where its layer mask (the bitmap's size) shows it. `key` names the
   * layer: the canvas keeps one picture per key and puts into it only the tiles that are not the
   * very ones it drew last time (tiles never change once made), so a brush stroke costs the tiles
   * it changed. A canvas without it (the HTML player: pixel layers are Graphics mode's) draws no
   * pixels.
   */
  drawBitmap?(
    bitmap: Bitmap,
    x: number,
    y: number,
    key: string,
    mask?: Mask,
    /** M22: each bitmap pixel covers this many image px (a reduced preview). Absent: 1. */
    scale?: number,
  ): void;
}

/** G2 (M21): how withLayer puts its layer down, besides its opacity. */
export interface LayerHow {
  /** The canvas's name for the blend mode (COMPOSITE_OPERATION); absent: 'source-over'. */
  blend?: string;
  /**
   * A clipping mask: the layer is seen only where the canvas it is put on already has something
   * drawn (its base, drawn there first). Each layer clipped to the base is put down this way.
   */
  clip?: boolean;
}

/** G2 (M21): the canvas's name for each blend mode. */
export const COMPOSITE_OPERATION: Record<BlendMode, string> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  colour: 'color',
  luminosity: 'luminosity',
  difference: 'difference',
};

export interface CanvasGradientLike {
  addColorStop(offset: number, colour: string): void;
}

export interface DrawOptions {
  /** The loaded image for a picture (an HTMLImageElement in the app); null while loading. */
  image?: (pictureId: string) => unknown | null;
  /** G12 (M19): a picture's size, for a picture tiled in a pattern fill (drawStage: the doc's). */
  pictureSize?: (pictureId: string) => { width: number; height: number } | undefined;
  /** Drawn after the background and before the objects (the grid behind them, AN2). */
  afterBackground?: (ctx: StageCanvas) => void;
  /** AN9: the frame to draw (every object with its tweened values); frame 0 when absent. */
  frame?: number;
  /**
   * AN12: the stage while editing — a mask works only while its layer is locked (the padlock, as
   * in the coursebook); unlocked, its shapes are shown so they can be moved. Exports leave this
   * out, so masks always work there.
   */
  editing?: boolean;
  /**
   * AN14: onion skin while editing — the objects to draw faintly behind a layer's own (the
   * drawings just before and after the one shown, see frames.ts), to draw the next one in step.
   */
  onionSkin?: (layerId: string) => readonly AnimObject[];
  /**
   * GV7 (M19): View ▸ Outline while editing — every object as a thin line `lineWidth` stage px
   * wide (1 screen px at the zoom), no fills, pictures as their box with a cross, on a white
   * stage, so overlapping parts can be checked and picked. Ignored unless `editing`: exports
   * never use it.
   */
  wireframe?: { lineWidth: number };
}

/** AN14: how strongly the onion skin's neighbouring drawings are drawn. */
export const ONION_OPACITY = 0.3;

/** GV7 (M19): the outline view's lines, the same dark grey on every object. */
export const WIREFRAME_COLOUR = '#1e222a';
/** GV8 (M19): how strongly a template layer is drawn on the stage (it is never exported). */
export const TEMPLATE_OPACITY = 0.4;

export const LINE_HEIGHT = 1.2;
const TAU = 2 * Math.PI;
const PLACEHOLDER = '#9aa4b2';

/** The CSS font of a text object: `italic 700 64px "Inter"`. */
export function fontOf(t: TextObject): string {
  return `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${t.size}px "${t.font}"`;
}

/** AN18: a button's label is drawn in the bundled Inter, semi-bold. */
export const BUTTON_FONT = 'Inter';
export const buttonFontOf = (b: ButtonObject): string => `600 ${b.size}px "${BUTTON_FONT}"`;
/** A button's corners: rounded a little, as a browser's own buttons. */
const BUTTON_RADIUS = 3;

/** The CSS fonts the objects' text and button labels need loaded before drawing, each once. */
export function fontsUsed(objects: readonly AnimObject[]): string[] {
  const walk = (list: readonly AnimObject[]): string[] =>
    list.flatMap((o) =>
      o.kind === 'text'
        ? [fontOf(o)]
        : o.kind === 'button'
          ? [buttonFontOf(o)]
          : o.kind === 'group'
            ? walk(o.children)
            : [],
    );
  return [...new Set(walk(objects))];
}

/** Where a letter is drawn from (AN26): a place in the box centred on (0, 0), and a turn. */
type Spot = { x: number; y: number; angle: number };

/**
 * The paint as a canvas style, inside a box centred on (0, 0). Given a letter's spot (AN26), the
 * gradient is made where the letter is drawn from, so it still runs across the whole words.
 */
function styleOf(
  ctx: StageCanvas,
  paint: Paint,
  w: number,
  h: number,
  spot?: Spot,
  options: DrawOptions = {},
): string | object | null {
  const at = (x: number, y: number) => {
    if (!spot) return { x, y };
    const a = (-spot.angle * Math.PI) / 180;
    const [dx, dy] = [x - spot.x, y - spot.y];
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  };
  let g: CanvasGradientLike;
  switch (paint.kind) {
    case 'none':
      return null;
    case 'pattern':
      return patternStyle(ctx, paint, w, h, spot, options);
    case 'solid':
      return paint.colour;
    case 'linear': {
      const a = (paint.angle * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      const [p, q] = [at(-dx * half, -dy * half), at(dx * half, dy * half)];
      g = ctx.createLinearGradient(p.x, p.y, q.x, q.y);
      break;
    }
    case 'radial': {
      // AN6: from its centre (the middle of the box unless moved), as far as half the box.
      const centre = radialCentre(paint);
      const c = at(((centre.x - 50) / 100) * w, ((centre.y - 50) / 100) * h);
      g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(w, h) / 2);
      break;
    }
  }
  for (const stop of colourStops(paint)) g.addColorStop(stop.offset, stop.colour);
  return g;
}

/**
 * G12 (M19): a pattern fill as a canvas style: its tile repeated from the box's top-left corner
 * (for a letter of curved text, AN26, from where the letter is drawn, so it runs on across the
 * words). A canvas that cannot repeat a tile, or a picture still loading, gives the colour.
 */
function patternStyle(
  ctx: StageCanvas,
  paint: Extract<Paint, { kind: 'pattern' }>,
  w: number,
  h: number,
  spot: Spot | undefined,
  options: DrawOptions,
): string | object {
  const id = paint.pictureId ?? '';
  const image = paint.pattern === 'picture' ? (options.image?.(id) ?? null) : null;
  const tile = patternTileOf(paint, w, h, image, options.pictureSize?.(id));
  if (!tile || !ctx.patternOf) return paint.colour;
  if (spot) {
    const a = (-spot.angle * Math.PI) / 180;
    const back: [number, number, number, number, number, number] = [
      Math.cos(a),
      Math.sin(a),
      -Math.sin(a),
      Math.cos(a),
      0,
      0,
    ];
    tile.matrix = timesMatrix(back, timesMatrix([1, 0, 0, 1, -spot.x, -spot.y], tile.matrix));
  }
  return ctx.patternOf(tile) ?? paint.colour;
}

/** G12 (M19): draws with the fill's or the outline's own opacity under the object's (`shown`). */
function faded(ctx: StageCanvas, shown: number, percent: number | undefined, draw: () => void) {
  const own = (percent ?? 100) / 100;
  if (own === 1) return draw();
  ctx.globalAlpha = shown * own;
  draw();
  ctx.globalAlpha = shown;
}

function applyStroke(ctx: StageCanvas, stroke: Stroke): void {
  ctx.strokeStyle = stroke.colour;
  ctx.lineWidth = stroke.width;
  ctx.lineJoin = 'round';
  const w = Math.max(1, stroke.width);
  if (stroke.dash === 'dashed') {
    ctx.lineCap = 'butt';
    ctx.setLineDash([3 * w, 2 * w]);
  } else if (stroke.dash === 'dotted') {
    ctx.lineCap = 'round';
    ctx.setLineDash([0.01, 2 * w]);
  } else {
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
  }
}

/** A rectangle with rounded corners, centred on (0, 0). */
function roundedRect(ctx: StageCanvas, w: number, h: number, radius: number): void {
  const ox = -w / 2;
  const oy = -h / 2;
  const r = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(ox + r, oy);
  ctx.lineTo(ox + w - r, oy);
  ctx.arc(ox + w - r, oy + r, r, -Math.PI / 2, 0);
  ctx.lineTo(ox + w, oy + h - r);
  ctx.arc(ox + w - r, oy + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(ox + r, oy + h);
  ctx.arc(ox + r, oy + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(ox, oy + r);
  ctx.arc(ox + r, oy + r, r, Math.PI, 1.5 * Math.PI);
  ctx.closePath();
}

/** Traces the object's outline as a path, in its own box moved so its centre is (0, 0). */
function tracePath(ctx: StageCanvas, o: AnimObject): void {
  const ox = -o.width / 2;
  const oy = -o.height / 2;
  ctx.beginPath();
  if (o.kind === 'ellipse') {
    if (o.arc) return traceArc(ctx, o);
    ctx.ellipse(0, 0, o.width / 2, o.height / 2, 0, 0, TAU);
    return;
  }
  if ((o.kind === 'rect' && o.radius > 0) || o.kind === 'button') {
    roundedRect(ctx, o.width, o.height, o.kind === 'rect' ? o.radius : BUTTON_RADIUS);
    return;
  }
  if (o.kind === 'path' && o.points.some((p) => p.in || p.out)) {
    const pts = o.points;
    const n = o.closed ? pts.length : pts.length - 1;
    ctx.moveTo(ox + pts[0]!.x, oy + pts[0]!.y);
    for (let i = 0; i < n; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const c1 = a.out ?? a;
      const c2 = b.in ?? b;
      ctx.bezierCurveTo(ox + c1.x, oy + c1.y, ox + c2.x, oy + c2.y, ox + b.x, oy + b.y);
    }
    if (o.closed) ctx.closePath();
    traceHoles(ctx, o);
    return;
  }
  const points = o.kind === 'path' ? flattenPath(o.points, false) : localOutline(o);
  points.forEach((p, i) =>
    i === 0 ? ctx.moveTo(ox + p.x, oy + p.y) : ctx.lineTo(ox + p.x, oy + p.y),
  );
  if (o.kind !== 'path' || o.closed) ctx.closePath();
  if (o.kind === 'path') traceHoles(ctx, o);
}

/**
 * GV1 (M19): part of an ellipse, from its start clockwise to its end (an SVG arc in the SVG); a
 * pie slice goes on to the centre and back, a chord straight back across, an open arc stops.
 */
function traceArc(ctx: StageCanvas, o: EllipseObject): void {
  const arc = o.arc!;
  const start = (arc.start * Math.PI) / 180;
  ctx.ellipse(0, 0, o.width / 2, o.height / 2, 0, start, start + (arcSweep(arc) * Math.PI) / 180);
  if (arc.close === 'pie') ctx.lineTo(0, 0);
  if (arc.close !== 'open') ctx.closePath();
}

/** AN24: each hole as its own closed outline in the same path (filled even-odd). */
function traceHoles(ctx: StageCanvas, o: PathObject): void {
  const ox = -o.width / 2;
  const oy = -o.height / 2;
  for (const hole of o.holes ?? []) {
    flattenPath(hole, true).forEach((p, i) =>
      i === 0 ? ctx.moveTo(ox + p.x, oy + p.y) : ctx.lineTo(ox + p.x, oy + p.y),
    );
    ctx.closePath();
  }
}

/**
 * AN26: curved text, letter by letter: each from the middle of its line-high cell on the arc,
 * turned to follow it; the bent words in the middle of the box (their bounds are the box).
 */
function drawCurvedText(ctx: StageCanvas, t: TextObject, shown: number, options: DrawOptions) {
  ctx.font = fontOf(t);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const widthOf = (s: string) =>
    ctx.measureText ? ctx.measureText(s).width : roughTextWidth(s, t.size);
  const bent = curvedText(t, widthOf);
  // GT1 (M20): each letter from the top of its line-high cell (the line spacing's height).
  const half = lineHeightOf(t) / 2;
  const letter = (l: PlacedLetter) => {
    const spot = { x: l.x - bent.width / 2, y: l.y - bent.height / 2, angle: l.angle };
    ctx.save();
    ctx.translate(spot.x, spot.y);
    if (spot.angle !== 0) ctx.rotate((spot.angle * Math.PI) / 180);
    const stroke = t.stroke;
    if (stroke && stroke.width > 0)
      faded(ctx, shown, stroke.opacity, () => {
        applyStroke(ctx, stroke);
        ctx.strokeText(l.char, 0, -half);
      });
    const fill = styleOf(ctx, t.fill, t.width, t.height, spot, options);
    if (fill !== null)
      faded(ctx, shown, t.fillOpacity, () => {
        ctx.fillStyle = fill;
        ctx.fillText(l.char, 0, -half);
      });
    ctx.restore();
  };
  for (const l of bent.letters) if (l.char.trim() !== '') letter(l);
}

/**
 * GT2, GT3 (M20): text on a path or in a shape, letter by letter where placeLetters puts them in
 * the box (each from the top of its line-high cell, turned with the path), as curved text is;
 * under them the path, when it has an outline (hidden otherwise: "do not show the path").
 */
function drawTextAlong(ctx: StageCanvas, t: TextObject, shown: number, options: DrawOptions) {
  const line = t.path?.stroke;
  if (t.path && line && line.width > 0) {
    const outline = { ...t, kind: 'path', points: t.path.points, closed: t.path.closed };
    tracePath(ctx, outline as unknown as PathObject);
    faded(ctx, shown, line.opacity, () => {
      applyStroke(ctx, line);
      ctx.stroke();
    });
  }
  ctx.font = fontOf(t);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const widthOf = (s: string) =>
    ctx.measureText ? ctx.measureText(s).width : roughTextWidth(s, t.size);
  const half = lineHeightOf(t) / 2;
  for (const l of placeLetters(t, widthOf)) {
    const spot = { x: l.x - t.width / 2, y: l.y - t.height / 2, angle: l.angle };
    ctx.save();
    ctx.translate(spot.x, spot.y);
    if (spot.angle !== 0) ctx.rotate((spot.angle * Math.PI) / 180);
    const stroke = t.stroke;
    if (stroke && stroke.width > 0)
      faded(ctx, shown, stroke.opacity, () => {
        applyStroke(ctx, stroke);
        ctx.strokeText(l.char, 0, -half);
      });
    const fill = styleOf(ctx, t.fill, t.width, t.height, spot, options);
    if (fill !== null)
      faded(ctx, shown, t.fillOpacity, () => {
        ctx.fillStyle = fill;
        ctx.fillText(l.char, 0, -half);
      });
    ctx.restore();
  }
}

function drawText(ctx: StageCanvas, t: TextObject, shown = 1, options: DrawOptions = {}): void {
  if (t.path || t.inShape) return drawTextAlong(ctx, t, shown, options);
  if (curveOf(t) !== 0) return drawCurvedText(ctx, t, shown, options);
  const fill = styleOf(ctx, t.fill, t.width, t.height, undefined, options);
  ctx.font = fontOf(t);
  const spaced = hasLetterSpacing(t);
  ctx.textAlign = spaced ? 'left' : t.align === 'centre' ? 'center' : t.align;
  ctx.textBaseline = 'top';
  if (spaced) return drawSpacedText(ctx, t, shown, fill);
  const x = t.align === 'left' ? 0 : t.align === 'centre' ? t.width / 2 : t.width;
  const ox = -t.width / 2;
  const oy = -t.height / 2;
  // GT1 (M20): the lines its line spacing apart (1.2 times the size when not set).
  const lineHeight = lineHeightOf(t);
  t.text.split('\n').forEach((line, i) => {
    const y = i * lineHeight;
    const stroke = t.stroke;
    if (stroke && stroke.width > 0)
      faded(ctx, shown, stroke.opacity, () => {
        applyStroke(ctx, stroke);
        ctx.strokeText(line, ox + x, oy + y);
      });
    if (fill !== null)
      faded(ctx, shown, t.fillOpacity, () => {
        ctx.fillStyle = fill;
        ctx.fillText(line, ox + x, oy + y);
      });
  });
}

/**
 * GT1 (M20): straight text with letter spacing or kerning, letter by letter where the letter
 * layout puts them (from each letter's left), each line aligned in the box. As a whole line is,
 * each line's outlines are drawn before its fills, and the fill is made once for the whole box,
 * so a gradient or a pattern still runs across all the words.
 */
function drawSpacedText(
  ctx: StageCanvas,
  t: TextObject,
  shown: number,
  fill: string | object | null,
): void {
  const widthOf = (s: string) =>
    ctx.measureText ? ctx.measureText(s).width : roughTextWidth(s, t.size);
  const layout = layoutText(t, widthOf);
  const free = t.width - layout.width;
  const ox = -t.width / 2 + (t.align === 'left' ? 0 : t.align === 'centre' ? free / 2 : free);
  const oy = -t.height / 2;
  layout.lineWidths.forEach((_, row) => {
    const letters = layout.cells.filter((c) => c.line === row && c.char.trim() !== '');
    const stroke = t.stroke;
    if (stroke && stroke.width > 0)
      faded(ctx, shown, stroke.opacity, () => {
        applyStroke(ctx, stroke);
        for (const c of letters) ctx.strokeText(c.char, ox + c.x, oy + c.y);
      });
    if (fill !== null)
      faded(ctx, shown, t.fillOpacity, () => {
        ctx.fillStyle = fill;
        for (const c of letters) ctx.fillText(c.char, ox + c.x, oy + c.y);
      });
  });
}

/**
 * GV7 (M19): an object in the outline view, in its own box (centred on (0, 0), already placed by
 * drawObject): a shape's outline (holes too), a picture's box with a cross, a group's parts,
 * text's letters and a button's label in the outline colour. Nothing is filled, faded or given
 * effects, so parts hidden under others can be seen and picked (O/N/25 Apple).
 */
function drawOutlined(
  ctx: StageCanvas,
  o: AnimObject,
  options: DrawOptions,
  lineWidth: number,
): void {
  const ox = -o.width / 2;
  const oy = -o.height / 2;
  const line = () => {
    ctx.strokeStyle = WIREFRAME_COLOUR;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash([]);
  };
  switch (o.kind) {
    case 'group':
      ctx.translate(ox, oy);
      for (const child of o.children) drawObject(ctx, child, options);
      return;
    case 'text':
      return drawText(ctx, {
        ...o,
        fill: { kind: 'solid', colour: WIREFRAME_COLOUR },
        stroke: undefined,
      });
    case 'picture':
      line();
      ctx.strokeRect(ox, oy, o.width, o.height);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(-ox, -oy);
      ctx.moveTo(-ox, oy);
      ctx.lineTo(ox, -oy);
      ctx.stroke();
      return;
    default: {
      tracePath(ctx, o);
      // The skew is taken off while the line is drawn, so it stays as thin (as for an outline).
      const k = skewOf(o);
      const det = 1 + k.x * k.y;
      const unskew = (k.x !== 0 || k.y !== 0) && Math.abs(det) > 1e-9;
      if (unskew) ctx.transform(1 / det, -k.y / det, k.x / det, 1 / det, 0, 0);
      line();
      ctx.stroke();
      if (unskew) ctx.transform(1, k.y, -k.x, 1, 0, 0);
      if (o.kind === 'button') {
        ctx.font = buttonFontOf(o);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = WIREFRAME_COLOUR;
        ctx.fillText(o.label, 0, 0);
      }
    }
  }
}

/** Draws one object; `alpha` is the opacity of the groups it is in (0–1). */
export function drawObject(
  ctx: StageCanvas,
  o: AnimObject,
  options: DrawOptions = {},
  alpha = 1,
): void {
  // GV4 (M19): a bent shape or group is drawn as its bent paths (the envelope stays live on it).
  if (o.envelope) {
    const bent = bentForDrawing(o);
    if (bent !== o) return drawObject(ctx, bent, options, alpha);
  }
  // G14 (M19): its effects are drawn from it as it looks, faded and all, so it is drawn whole
  // into a layer first.
  if (o.filters?.length && ctx.withFilters && !options.wireframe) {
    const { filters, ...plain } = o;
    return ctx.withFilters(filters, (layer) =>
      drawObject(layer, plain as AnimObject, options, alpha),
    );
  }
  // AN27: turned, mirrored and skewed about the point it turns about (its centre unless chosen).
  const pivot = pivotInBox(o);
  ctx.save();
  ctx.translate(o.x + pivot.x, o.y + pivot.y);
  if (o.rotation !== 0) ctx.rotate((o.rotation * Math.PI) / 180);
  if (o.flipX || o.flipY) ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
  // AN25: skewed in its own box, as geometry's toStage: x' = x − tan(skewX)·y, y' = y + tan(skewY)·x.
  const k = skewOf(o);
  const skewed = k.x !== 0 || k.y !== 0;
  if (skewed) ctx.transform(1, k.y, -k.x, 1, 0, 0);
  // The rest is drawn about the box's centre: placed from the pivot, in the turned box.
  const fromPivot = { x: o.width / 2 - pivot.x, y: o.height / 2 - pivot.y };
  if (fromPivot.x !== 0 || fromPivot.y !== 0) ctx.translate(fromPivot.x, fromPivot.y);
  // GV7 (M19): View ▸ Outline: only its lines, at full strength.
  if (options.wireframe) {
    drawOutlined(ctx, o, options, options.wireframe.lineWidth);
    return ctx.restore();
  }
  const shown = alpha * (o.opacity / 100);
  if (shown !== 1) ctx.globalAlpha = shown;
  const ox = -o.width / 2;
  const oy = -o.height / 2;
  switch (o.kind) {
    case 'group':
      // A group made 0 wide or high shows nothing; its parts wait to grow back (AN13).
      if (o.width === 0 || o.height === 0) break;
      // The children are placed in the group's box: move its top-left corner to the origin.
      ctx.translate(ox, oy);
      if (shown < 1 && o.children.length > 1 && ctx.withLayer)
        ctx.withLayer(shown, (layer) => {
          for (const child of o.children) drawObject(layer, child, options);
        });
      else for (const child of o.children) drawObject(ctx, child, options, shown);
      break;
    case 'text':
      drawText(ctx, o, shown, options);
      break;
    case 'picture': {
      const image = options.image?.(o.pictureId) ?? null;
      if (image) ctx.drawImage(image, ox, oy, o.width, o.height);
      else {
        ctx.strokeStyle = PLACEHOLDER;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(ox, oy, o.width, o.height);
      }
      break;
    }
    default: {
      tracePath(ctx, o);
      const fill = styleOf(ctx, o.fill, o.width, o.height, undefined, options);
      if (fill !== null && isClosed(o))
        faded(ctx, shown, o.fillOpacity, () => {
          ctx.fillStyle = fill;
          // GT4 (M20): a letter made curves is filled nonzero, as its font is.
          if (o.kind === 'path' && o.holes?.length && o.fillRule !== 'nonzero') ctx.fill('evenodd');
          else ctx.fill();
        });
      if (o.stroke && o.stroke.width > 0) {
        // AN25: the outline follows the skewed shape but its lines stay as wide as set (as in
        // the SVG): the skew is taken off while it is drawn, then put back for a button's label.
        const det = 1 + k.x * k.y;
        const unskew = skewed && Math.abs(det) > 1e-9;
        if (unskew) ctx.transform(1 / det, -k.y / det, k.x / det, 1 / det, 0, 0);
        const stroke = o.stroke;
        faded(ctx, shown, stroke.opacity, () => {
          applyStroke(ctx, stroke);
          ctx.stroke();
        });
        if (unskew) ctx.transform(1, k.y, -k.x, 1, 0, 0);
      }
      if (o.kind === 'button') {
        // AN18: the label in the middle of the box.
        ctx.font = buttonFontOf(o);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = o.colour;
        ctx.fillText(o.label, 0, 0);
      }
    }
  }
  ctx.restore();
}

/**
 * GV8 (M19): a template layer, faded, only while editing (every export leaves it out); in the
 * outline view it stays a picture, to be drawn over.
 */
function drawTemplate(ctx: StageCanvas, layer: Layer, options: DrawOptions): void {
  if (!options.editing) return;
  const plain = { ...options, wireframe: undefined };
  for (const object of layer.objects) drawObject(ctx, object, plain, TEMPLATE_OPACITY);
}

/**
 * G2, GB1 (M21): a pixel layer's pixels where it lies, at its opacity and in its blend mode (or
 * at full strength, `plain`, inside a picture of its own that is put down with them).
 */
function drawPixels(ctx: StageCanvas, layer: Layer, plain = false): void {
  const content = layer.pixels;
  if (!content || !ctx.drawBitmap) return;
  ctx.save();
  if (!plain) {
    ctx.globalAlpha = layer.opacity ?? 1;
    if (layer.blend && layer.blend !== 'normal')
      ctx.globalCompositeOperation = COMPOSITE_OPERATION[layer.blend];
  }
  // M22: a reduced preview has its own picture, so the layer's own stays ready for afterwards.
  if (content.scale && content.scale !== 1)
    ctx.drawBitmap(
      content.bitmap,
      content.x,
      content.y,
      `${layer.id} preview`,
      content.mask,
      content.scale,
    );
  else ctx.drawBitmap(content.bitmap, content.x, content.y, layer.id, content.mask);
  ctx.restore();
}

/** G2 (M21): how a layer is put down when it is drawn as one picture (absent: normal). */
const howOf = (layer: Layer): LayerHow =>
  layer.blend && layer.blend !== 'normal' ? { blend: COMPOSITE_OPERATION[layer.blend] } : {};

/** Draws the whole stage at its own size: background, then every visible layer in order. */
export function drawStage(ctx: StageCanvas, doc: AnimationDoc, given: DrawOptions = {}): void {
  // G12 (M19): a picture tiled in a pattern fill takes its proportions from the doc's pictures.
  const options: DrawOptions = {
    pictureSize: (id) => doc.pictures.find((p) => p.id === id),
    ...given,
    // GV7 (M19): the outline view is only for editing; an export never draws it.
    wireframe: given.editing ? given.wireframe : undefined,
  };
  // AN21: a transparent stage is cleared (a canvas used again keeps no earlier frame).
  if (doc.stage.background === TRANSPARENT && !options.wireframe)
    ctx.clearRect(0, 0, doc.stage.width, doc.stage.height);
  else {
    // GV7: the outline view's lines are on white, as Illustrator's.
    ctx.fillStyle = options.wireframe ? '#ffffff' : doc.stage.background;
    ctx.fillRect(0, 0, doc.stage.width, doc.stage.height);
  }
  options.afterBackground?.(ctx);
  // Frame 0 is a frame like any other (an object on a path is at its start, not where drawn).
  const shown = options.frame === undefined ? doc : stateAt(doc, options.frame);
  const layers = shown.layers;
  // GV7: in the outline view nothing is masked, so every part can be checked.
  const masking = (l: Layer): boolean =>
    l.mask === true && l.visible && (!options.editing || l.locked) && !options.wireframe;
  const skin = (layer: Layer): void => {
    for (const object of options.onionSkin?.(layer.id) ?? [])
      drawObject(ctx, object, options, ONION_OPACITY);
  };
  /** A vector layer's objects (AN12: only what lies under its mask's shapes), `fade`d. */
  const drawVectors = (target: StageCanvas, layer: Layer, i: number, fade?: number): void => {
    const mask = layers[i + 1];
    if (!mask || !masking(mask)) {
      if (target === ctx) skin(layer);
      for (const object of layer.objects) drawObject(target, object, options, fade);
      return;
    }
    target.save();
    target.beginPath();
    for (const o of mask.objects)
      for (const outline of outlineOf(o)) {
        outline.forEach((p, k) => (k === 0 ? target.moveTo(p.x, p.y) : target.lineTo(p.x, p.y)));
        target.closePath();
      }
    target.clip();
    for (const object of layer.objects) drawObject(target, object, options, fade);
    target.restore();
  };
  /** A layer at full strength, inside a picture of its own. */
  const drawPlain = (target: StageCanvas, layer: Layer, i: number): void =>
    layer.pixels ? drawPixels(target, layer, true) : drawVectors(target, layer, i);
  layers.forEach((layer, i) => {
    if (!layer.visible || masking(layer)) return;
    if (layer.template) return drawTemplate(ctx, layer, options);
    // G2 (M21): a layer clipped to the one below is drawn with that one, its base (a canvas
    // without layers draws it as an ordinary layer), and not at all when its base is hidden.
    const base = clipBaseIndex(layers, i);
    if (base >= 0 && (ctx.withLayer || !layers[base]!.visible)) return;
    const opacity = layer.opacity ?? 1;
    const clipped = layers.flatMap((l, j) =>
      j > i && l.visible && clipBaseIndex(layers, j) === i ? [{ layer: l, j }] : [],
    );
    if (clipped.length > 0 && ctx.withLayer) {
      // The base and the layers clipped to it make one picture, put down as the base is.
      ctx.withLayer(
        opacity,
        (group) => {
          drawPlain(group, layer, i);
          for (const c of clipped) {
            const how = { ...howOf(c.layer), clip: true };
            group.withLayer!(c.layer.opacity ?? 1, (top) => drawPlain(top, c.layer, c.j), how);
          }
        },
        howOf(layer),
      );
      return;
    }
    if (layer.pixels) return drawPixels(ctx, layer);
    // G2: a see-through or blended vector layer is faded and mixed as one picture.
    if ((opacity < 1 || layer.blend) && ctx.withLayer) {
      ctx.withLayer(opacity, (one) => drawVectors(one, layer, i), howOf(layer));
      return;
    }
    drawVectors(ctx, layer, i, opacity < 1 ? opacity : undefined);
  });
}
