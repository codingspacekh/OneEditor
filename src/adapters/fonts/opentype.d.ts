// D10: the little of opentype.js 2.0 (MIT) that the glyph adapter uses (the package has no types;
// its ES module file is imported, the same in Node, the tests and the built app).
declare module 'opentype.js/dist/opentype.mjs' {
  export interface PathCommand {
    type: 'M' | 'L' | 'Q' | 'C' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Glyph {
    index: number;
    advanceWidth?: number;
    unicode?: number;
    points?: { x: number; y: number; onCurve: boolean; lastPointOfContour: boolean }[];
    isComposite?: boolean;
    components?: {
      glyphIndex: number;
      dx: number;
      dy: number;
      xScale: number;
      scale01: number;
      scale10: number;
      yScale: number;
      matchedPoints?: number[];
    }[];
    path: { commands: PathCommand[] };
    getPath(x?: number, y?: number, fontSize?: number): { commands: PathCommand[] };
  }
  export interface Axis {
    tag: string;
    minValue: number;
    defaultValue: number;
    maxValue: number;
  }
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    glyphs: { get(index: number): Glyph; length: number };
    tables: {
      os2?: { sTypoAscender: number; sTypoDescender: number };
      hhea?: { ascender: number; descender: number };
      fvar?: { axes: Axis[] };
      [table: string]: unknown;
    };
    charToGlyph(char: string): Glyph | null;
    variation?: {
      getTransform(glyph: Glyph, coords: Record<string, number>): Glyph;
      process: { getNormalizedCoords(coords: Record<string, number>): number[] };
    };
  }
  export function parse(buffer: ArrayBuffer, options?: Record<string, unknown>): Font;

  /** G4: what a new font (a subset written for an SVG) is made of. */
  export class Path {
    commands: PathCommand[];
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(x1: number, y1: number, x: number, y: number): void;
    bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
    close(): void;
  }
  export const Glyph: new (options: {
    name: string;
    unicode?: number;
    advanceWidth: number;
    path: Path;
  }) => Glyph;
  export const Font: new (options: {
    familyName: string;
    styleName: string;
    unitsPerEm: number;
    ascender: number;
    descender: number;
    glyphs: Glyph[];
  }) => Font & { toArrayBuffer(): ArrayBuffer };
}
