// G12 (M19): the built-in pattern tiles as plain geometry, so the stage, the PNG and JPG exports
// and the SVG draw the same tile (the canvas from a tile drawn once, the SVG as a <pattern>). A
// tile is `size` px square (bricks: half as high, two rows of bricks a tile) and repeats without
// a seam: whatever leaves one edge comes back in at the other. Its shapes are filled in the
// pattern's colour, over its background (or see-through between).
import type { Point } from '../animation/geometry.ts';
import type { PatternName } from '../animation/types.ts';

export type TileShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'polygon'; points: Point[] };

export interface Tile {
  width: number;
  height: number;
  shapes: TileShape[];
}

/** The tiles drawn from geometry (a picture tiled is the picture itself). */
export type TileName = Exclude<PatternName, 'picture'>;

/** The pattern names in the order the Properties panel lists them, with their labels. */
export const PATTERN_LABELS: Readonly<Record<PatternName, string>> = {
  weave: 'Weave',
  checks: 'Checks',
  stripes: 'Stripes',
  dots: 'Dots',
  hatching: 'Hatching',
  crosshatch: 'Crosshatch',
  bricks: 'Bricks',
  picture: 'A picture tiled',
};

const rect = (x: number, y: number, w: number, h: number): TileShape => ({
  kind: 'rect',
  x,
  y,
  w,
  h,
});
type Polygon = Extract<TileShape, { kind: 'polygon' }>;
const polygon = (...points: [number, number][]): Polygon => ({
  kind: 'polygon',
  points: points.map(([x, y]) => ({ x, y })),
});

/**
 * A diagonal line from the bottom left to the top right of an s-px tile, `d` px each side of it
 * (measured along x), with the two corner pieces that carry it on into the next tiles.
 */
function diagonal(s: number, d: number): Polygon[] {
  return [
    polygon([0, s - d], [s - d, 0], [s, 0], [s, d], [d, s], [0, s]),
    polygon([0, 0], [d, 0], [0, d]),
    polygon([s, s], [s - d, s], [s, s - d]),
  ];
}

/** The same line mirrored left to right (top left to bottom right). */
const mirrored = (s: number, shapes: Polygon[]): Polygon[] =>
  shapes.map((shape) => ({
    kind: 'polygon',
    points: shape.points.map((p) => ({ x: s - p.x, y: p.y })).reverse(),
  }));

/** G12: the tile of a built-in pattern, `size` px across. */
export function patternTile(name: TileName, size: number): Tile {
  const s = size;
  const square = (shapes: TileShape[]): Tile => ({ width: s, height: s, shapes });
  switch (name) {
    case 'stripes':
      // Bands as wide as the gaps between them.
      return square([rect(0, 0, s, s / 2)]);
    case 'checks':
      return square([rect(0, 0, s / 2, s / 2), rect(s / 2, s / 2, s / 2, s / 2)]);
    case 'dots':
      return square([{ kind: 'circle', x: s / 2, y: s / 2, r: s / 4 }]);
    case 'hatching':
      // Thin lines at 45°, as a technical drawing's cut faces.
      return square(diagonal(s, s / 8));
    case 'crosshatch': {
      const line = diagonal(s, s / 8);
      return square([...line, ...mirrored(s, line)]);
    }
    case 'bricks': {
      // Two rows of bricks twice as long as high, the lower row half a brick along, with mortar
      // (the background) between them.
      const g = s / 16;
      const h = s / 2;
      return {
        width: s,
        height: s,
        shapes: [
          rect(g / 2, g / 2, s - g, h - g),
          rect(0, h + g / 2, s / 2 - g / 2, h - g),
          rect(s / 2 + g / 2, h + g / 2, s / 2 - g / 2, h - g),
        ],
      };
    }
    case 'weave': {
      // A basket weave: two strands across in the top-left and bottom-right quarters, two down
      // in the others.
      const q = s / 2;
      const g = s / 16;
      const t = q / 2 - g;
      const across = (x: number, y: number) => [
        rect(x + g / 2, y + g / 2, q - g, t),
        rect(x + g / 2, y + q / 2 + g / 2, q - g, t),
      ];
      const down = (x: number, y: number) => [
        rect(x + g / 2, y + g / 2, t, q - g),
        rect(x + q / 2 + g / 2, y + g / 2, t, q - g),
      ];
      return square([...across(0, 0), ...down(q, 0), ...down(0, q), ...across(q, q)]);
    }
  }
}

/**
 * G12: a picture tiled `size` px wide, as high as its own proportions make it (a picture of no
 * known size is tiled square).
 */
export function pictureTileSize(
  size: number,
  picture: { width: number; height: number } | undefined,
): { width: number; height: number } {
  const ratio =
    picture && picture.width > 0 && picture.height > 0 ? picture.height / picture.width : 1;
  return { width: size, height: size * ratio };
}
