// G12, G14 (M19): how an object's appearance is drawn on any StageCanvas — a pattern fill as a
// tile that repeats, and the effects (filters) worked out once for the stage and the SVG: what a
// bevel is made of, how soft a shadow is, the numbers a new filter starts with.
import type { StageCanvas } from './draw.ts';
import { TRANSPARENT } from './rules.ts';
import type { FilterKind, ObjectFilter, Paint } from './types.ts';
import { patternTile, pictureTileSize } from '../graphics/patterns.ts';

/** A 2-D matrix as a canvas's setTransform takes it: [a, b, c, d, e, f]. */
export type TileMatrix = [number, number, number, number, number, number];

/**
 * G12: one tile of a pattern fill: `draw` paints it from (0, 0) to (width, height) in its own
 * space; `matrix` takes that space to the one the fill is made in (the object's box centred on
 * (0, 0): the tiles start at its top-left corner and are turned by the pattern's angle).
 */
export interface PatternTile {
  width: number;
  height: number;
  matrix: TileMatrix;
  draw(ctx: StageCanvas): void;
}

/** a × b: b's step first, then a's. */
export function timesMatrix(a: TileMatrix, b: TileMatrix): TileMatrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

const turn = (degrees: number): TileMatrix => {
  const r = (degrees * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
};
const move = (x: number, y: number): TileMatrix => [1, 0, 0, 1, x, y];

type PatternPaint = Extract<Paint, { kind: 'pattern' }>;

/**
 * G12: the tile of a pattern fill in a box w × h centred on (0, 0). A picture tiled needs its
 * loaded image (null while it loads: then there is no tile, and the fill is its colour) and its
 * size, for its proportions.
 */
export function patternTileOf(
  paint: PatternPaint,
  w: number,
  h: number,
  image: unknown | null,
  pictureSize?: { width: number; height: number },
): PatternTile | null {
  const matrix = timesMatrix(turn(paint.angle ?? 0), move(-w / 2, -h / 2));
  if (paint.pattern === 'picture') {
    if (!image) return null;
    const size = pictureTileSize(paint.size, pictureSize);
    return {
      ...size,
      matrix,
      draw: (ctx) => ctx.drawImage(image, 0, 0, size.width, size.height),
    };
  }
  const tile = patternTile(paint.pattern, paint.size);
  return {
    width: tile.width,
    height: tile.height,
    matrix,
    draw(ctx) {
      if (paint.background !== TRANSPARENT) {
        ctx.fillStyle = paint.background;
        ctx.fillRect(0, 0, tile.width, tile.height);
      }
      ctx.beginPath();
      for (const shape of tile.shapes) {
        if (shape.kind === 'rect') {
          ctx.moveTo(shape.x, shape.y);
          ctx.lineTo(shape.x + shape.w, shape.y);
          ctx.lineTo(shape.x + shape.w, shape.y + shape.h);
          ctx.lineTo(shape.x, shape.y + shape.h);
        } else if (shape.kind === 'circle') {
          ctx.moveTo(shape.x + shape.r, shape.y);
          ctx.arc(shape.x, shape.y, shape.r, 0, 2 * Math.PI);
        } else
          shape.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
      }
      ctx.fillStyle = paint.colour;
      ctx.fill();
    },
  };
}

// ---- G14: effects ----

/** The effects in the order the Filters section lists them, with their names. */
export const FILTER_LABELS: Readonly<Record<FilterKind, string>> = {
  dropShadow: 'Drop shadow',
  innerShadow: 'Inner shadow',
  glow: 'Glow',
  bevel: 'Bevel',
  blur: 'Blur',
};

export const FILTER_KINDS = Object.keys(FILTER_LABELS) as FilterKind[];

/** G14: a new effect, with numbers that show it plainly on a shape of a hundred pixels or so. */
export function newFilter(kind: FilterKind): ObjectFilter {
  switch (kind) {
    case 'dropShadow':
      return { kind, colour: '#000000', dx: 6, dy: 6, blur: 8, opacity: 50 };
    case 'innerShadow':
      return { kind, colour: '#000000', dx: 4, dy: 4, blur: 6, opacity: 60 };
    case 'glow':
      return { kind, colour: '#ffe680', blur: 20, opacity: 90 };
    case 'bevel':
      return {
        kind,
        depth: 4,
        blur: 4,
        angle: 135,
        light: '#ffffff',
        shadow: '#000000',
        opacity: 70,
      };
    case 'blur':
      return { kind, radius: 4 };
  }
}

/**
 * How soft a shadow or glow is: its `blur` is as a canvas's shadowBlur and CSS's text-shadow
 * read it, which blurs by a standard deviation of half of it (the SVG's stdDeviation).
 */
export const shadowDeviation = (blur: number): number => blur / 2;

export type InnerShadow = Extract<ObjectFilter, { kind: 'innerShadow' }>;

/**
 * G14: a bevel is two inner shadows: the light along the edges that face the light, the shade
 * along the others. `angle` is where the light comes from, as in Photoshop: 0° from the right,
 * 90° from above, 135° from the top left. Each is pushed `depth` px away from its own edge.
 */
export function bevelShadows(
  f: Extract<ObjectFilter, { kind: 'bevel' }>,
): [InnerShadow, InnerShadow] {
  const r = (f.angle * Math.PI) / 180;
  // Towards the light, in stage directions (y down).
  const lx = Math.cos(r) * f.depth;
  const ly = -Math.sin(r) * f.depth;
  const round = (v: number) => Math.round(v * 1000) / 1000 || 0;
  const inner = (colour: string, dx: number, dy: number): InnerShadow => ({
    kind: 'innerShadow',
    colour,
    dx: round(dx),
    dy: round(dy),
    blur: f.blur,
    opacity: f.opacity,
  });
  return [inner(f.light, -lx, -ly), inner(f.shadow, lx, ly)];
}

/** A hex colour at an opacity (0–100 %) as CSS rgba(). */
export function rgba(colour: string, opacity: number): string {
  const v = parseInt(colour.slice(1), 16);
  const a = Math.round(Math.max(0, Math.min(100, opacity))) / 100;
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}
