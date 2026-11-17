// GT4, GT5 (M20, D10): the letters' outlines read from the bundled font files with opentype.js,
// checked against what the app's canvas (Chromium, Electron 44) measured for the same letters:
// each letter's advance and the box round its ink, in px at the size given.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createOpentypeGlyphs,
  dataUrlBytes,
  fontGlyphs,
} from '../../../src/adapters/fonts/opentype-glyphs.ts';
import { readGlyphVariations, scalarOf } from '../../../src/adapters/fonts/gvar.ts';
import { parse as parseFont } from 'opentype.js/dist/opentype.mjs';
import { createText } from '../../../src/core/animation/factory.ts';
import type { PathObject } from '../../../src/core/animation/types.ts';
import type { FontGlyphs } from '../../../src/core/graphics/glyphs.ts';
import { textToCurves } from '../../../src/core/graphics/text-outlines.ts';

const FONTS = join(import.meta.dirname, '../../../resources/fonts');

function source() {
  const read: string[] = [];
  const glyphs = createOpentypeGlyphs(async (file) => {
    read.push(file);
    return new Uint8Array(readFileSync(join(FONTS, file)));
  });
  return { glyphs, read };
}

/** [advance, left, right, top, bottom] of a letter's ink, as canvas measureText gives them. */
function measured(g: FontGlyphs, char: string, size: number): number[] {
  const pts = g
    .outline(char, size)
    .flatMap((c) =>
      c.type === 'Z' ? [] : [{ x: c.x, y: c.y }, ...(c.type === 'Q' ? [{ x: c.x1, y: c.y1 }] : [])],
    );
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return [
    g.advance(char, size),
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
}

const near = (got: number[], canvas: number[], within = 0.1) =>
  got.forEach((v, i) => expect(Math.abs(v - canvas[i]!)).toBeLessThan(within));

describe('GT4: the bundled fonts’ letters, as the stage draws them', () => {
  it('Inter (a variable font): its “o” and the em box top the stage draws text from', async () => {
    const inter = (await source().glyphs.load('Inter', false, false))!;
    // The canvas's textBaseline 'top' was 80.06 px above the baseline at 100 px.
    expect(inter.top).toBeCloseTo(0.8006, 3);
    near(measured(inter, 'o', 100), [54.88, 3.52, 51.37, -52.73, 1.17]);
    // Its optical size follows the size in px, as the browser sets it: not just scaled down.
    near(measured(inter, 'o', 24), [13.71, 1.01, 12.7, -12.93, 0.28], 0.05);
  });

  it('bold at the variable font’s weight 700, its points moved as the browser moves them', async () => {
    const { glyphs } = source();
    near(
      measured((await glyphs.load('Inter', true, false))!, 'D', 100),
      [70.11, 5.43, 67.03, -72.75, 0],
    );
    const montserrat = (await glyphs.load('Montserrat', true, false))!;
    near(measured(montserrat, 'o', 100), [65.51, 3.25, 62.26, -54.55, 0.76]);
    // A letter made of parts (the stem and the dot of i), each part at the weight.
    near(measured(montserrat, 'i', 100), [30.07, 5.3, 24.7, -78.7, 0]);
  });

  it('a font with its own bold file uses it; one with no italic is slanted as the browser does', async () => {
    const { glyphs, read } = source();
    near(
      measured((await glyphs.load('Arvo', false, false))!, 'A', 100),
      [75.29, 0.49, 74.8, -74.02, 0],
    );
    near(
      measured((await glyphs.load('Arvo', true, false))!, 'A', 100),
      [72.8, 1.32, 71.68, -74.02, 0],
    );
    expect(read).toEqual(['Arvo-Regular.ttf', 'Arvo-Bold.ttf']);
    const bebas = (await glyphs.load('Bebas Neue', false, true))!;
    near(measured(bebas, 'H', 100), [42, 4.1, 55.4, -70, 0]);
    expect(bebas.top).toBe(0.75);
  });

  it('reads each file once; a font that is not bundled has none; a space or unknown letter is empty', async () => {
    const { glyphs, read } = source();
    const [a, b] = await Promise.all([
      glyphs.load('Inter', false, false),
      glyphs.load('Inter', true, false),
    ]);
    expect(read).toEqual(['Inter.ttf']);
    expect(await glyphs.load('Comic Sans MS', false, false)).toBeNull();
    expect(a!.outline(' ', 50)).toEqual([]);
    expect(a!.advance(' ', 100)).toBeGreaterThan(20);
    expect(b!.outline('\u{10FFFF}', 50)).toEqual([]);
    expect(b!.advance('\u{10FFFF}', 50)).toBe(0);
    // Asked again, the outline comes from what was read.
    expect(a!.outline('o', 100)).toEqual(a!.outline('o', 100));
  });

  it('a file that cannot be read is tried again next time', async () => {
    let tries = 0;
    const glyphs = createOpentypeGlyphs(async (file) => {
      tries++;
      if (tries === 1) throw new Error('busy');
      return new Uint8Array(readFileSync(join(FONTS, file)));
    });
    await expect(glyphs.load('Anton', false, false)).rejects.toThrow('busy');
    expect(await glyphs.load('Anton', false, false)).not.toBeNull();
  });
});

describe('GT4: a converted letter lies where the stage drew it', () => {
  it('“H” of Inter at 100 px, drawn from the top of its box: within a pixel of the canvas', async () => {
    const inter = (await source().glyphs.load('Inter', false, false))!;
    const t = { ...createText('H', { x: 0, y: 0, size: 100 }), width: 65.33, height: 120 };
    const widthOf = (s: string) => [...s].reduce((w, c) => w + inter.advance(c, 100), 0);
    const [h] = textToCurves(t, inter, widthOf).children as PathObject[];
    // The canvas drew its ink 7.23 px from the left and 80.06 − 72.75 px below the top.
    expect(Math.abs(h!.x - 7.23)).toBeLessThan(1);
    expect(Math.abs(h!.y - (80.06 - 72.75))).toBeLessThan(1);
    expect(Math.abs(h!.width - (63.57 - 7.23))).toBeLessThan(1);
    expect(Math.abs(h!.height - 72.75)).toBeLessThan(1);
  });
});

describe('GT4: the outline commands of TrueType points', () => {
  /** A one-letter font: the given contour for "x", 1000 units to the em. */
  const tiny = (points: { x: number; y: number; onCurve: boolean }[], os2?: [number, number]) =>
    fontGlyphs(
      {
        unitsPerEm: 1000,
        ascender: 750,
        descender: -250,
        glyphs: {
          get: () => ({ index: 1, path: { commands: [] }, getPath: () => ({ commands: [] }) }),
          length: 2,
        },
        tables: os2 ? { os2: { sTypoAscender: os2[0], sTypoDescender: os2[1] } } : {},
        charToGlyph: (c: string) =>
          c === 'x'
            ? {
                index: 1,
                advanceWidth: 500,
                points: points.map((p, i) => ({
                  ...p,
                  lastPointOfContour: i === points.length - 1,
                })),
                path: { commands: [] },
                getPath: () => ({ commands: [] }),
              }
            : c === 'c'
              ? {
                  index: 2,
                  path: {
                    commands: [
                      { type: 'M', x: 0, y: 0 },
                      { type: 'C', x1: 0, y1: 100, x2: 100, y2: 100, x: 100, y: 0 },
                      { type: 'Z' },
                    ],
                  },
                  getPath: () => ({ commands: [] }),
                }
              : null,
      },
      new Uint8Array(),
      { bold: false, italic: false, face: { style: 'normal' } },
    );

  it('on-curve points joined by lines, y turned downwards and scaled to the size', () => {
    const g = tiny([
      { x: 0, y: 0, onCurve: true },
      { x: 500, y: 0, onCurve: true },
      { x: 500, y: 500, onCurve: true },
    ]);
    expect(g.outline('x', 10)).toEqual([
      { type: 'M', x: 5, y: -5 },
      { type: 'L', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'L', x: 5, y: -5 },
      { type: 'Z' },
    ]);
    expect(g.advance('x', 10)).toBe(5);
    // The em box from the ascender and descender when there are no typographic ones.
    expect(g.top).toBe(0.75);
  });

  it('a round contour of off-curve points only: curves through the points between them', () => {
    const g = tiny([
      { x: 0, y: 100, onCurve: false },
      { x: 100, y: 100, onCurve: false },
      { x: 100, y: 0, onCurve: false },
      { x: 0, y: 0, onCurve: false },
    ]);
    const cmds = g.outline('x', 1000);
    expect(cmds[0]).toEqual({ type: 'M', x: 0, y: -50 });
    expect(cmds.filter((c) => c.type === 'Q')).toHaveLength(4);
    expect(cmds[1]).toEqual({ type: 'Q', x1: 0, y1: -100, x: 50, y: -100 });
  });

  it('a contour ending on an off-curve point starts at its first on-curve one', () => {
    const g = tiny(
      [
        { x: 0, y: 0, onCurve: true },
        { x: 100, y: 0, onCurve: true },
        { x: 100, y: 100, onCurve: false },
      ],
      [800, -200],
    );
    const cmds = g.outline('x', 1000);
    expect(cmds[0]).toEqual({ type: 'M', x: 0, y: 0 });
    expect(cmds.at(-2)).toEqual({ type: 'Q', x1: 100, y1: -100, x: 0, y: 0 });
    expect(g.top).toBe(0.8);
  });

  it('a letter with cubic outlines (no points) keeps its curves', () => {
    const cmds = tiny([]).outline('c', 1000);
    expect(cmds[1]).toEqual({ type: 'C', x1: 0, y1: -100, x2: 100, y2: -100, x: 100, y: 0 });
  });
});

describe('GT4: a variable font’s masters', () => {
  it('a master between two places applies in proportion, outside them not at all', () => {
    const t = { peak: [0.5], start: [0], end: [1] };
    expect(scalarOf(t, [0.25])).toBeCloseTo(0.5);
    expect(scalarOf(t, [0.75])).toBeCloseTo(0.5);
    expect(scalarOf(t, [0.5])).toBe(1);
    expect(scalarOf(t, [-0.1])).toBe(0);
    expect(scalarOf({ peak: [1] }, [0])).toBe(0);
    expect(scalarOf({ peak: [-1] }, [0.5])).toBe(0);
    expect(scalarOf({ peak: [0, 1] }, [0.3, 0.5])).toBeCloseTo(0.5);
  });

  it('a static font has no variations; a letter index outside the table has none', () => {
    expect(
      readGlyphVariations(new Uint8Array(readFileSync(join(FONTS, 'Anton-Regular.ttf')))),
    ).toBeNull();
    const gvar = readGlyphVariations(new Uint8Array(readFileSync(join(FONTS, 'Oswald.ttf'))))!;
    expect(gvar.tuplesOf(-1, 4)).toEqual([]);
    expect(gvar.tuplesOf(1e6, 4)).toEqual([]);
  });
});

describe('fonts handed over as data: URLs', () => {
  it('base64 or plain', () => {
    expect([...dataUrlBytes('data:font/ttf;base64,AAEC')]).toEqual([0, 1, 2]);
    expect(new TextDecoder().decode(dataUrlBytes('data:text/plain,a%20b'))).toBe('a b');
  });
});

describe('G4 (benchmark 2026-11-17): only the letters used go inside an SVG', () => {
  /** The letter's outline in px from a font file: y down from the baseline, as outline() gives it. */
  const outlineIn = (bytes: Uint8Array, char: string, size: number) => {
    const font = parseFont(new Uint8Array(bytes).buffer);
    const glyph = font.charToGlyph(char)!;
    return { font, glyph, path: glyph.getPath(0, 0, size).commands };
  };
  const box = (cmds: readonly object[]) => {
    const at = cmds as { x?: number; y?: number }[];
    const xs = at.flatMap((c) => (c.x === undefined ? [] : [c.x]));
    const ys = at.flatMap((c) => (c.y === undefined ? [] : [c.y]));
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  };

  it('Inter at a size: a small font of just those letters, the same outlines and advances', async () => {
    const inter = (await source().glyphs.load('Inter', false, false))!;
    const bytes = inter.subset!('OE Inter 400 48', 'Villa Villa', 48);
    // The whole variable font is 880 KB; five letters are a few.
    expect(bytes.length).toBeLessThan(12_000);
    const { font, glyph, path } = outlineIn(bytes, 'V', 48);
    expect(font.charToGlyph('b')?.index ?? 0).toBe(0);
    near(box(path), box(inter.outline('V', 48)), 0.05);
    expect(((glyph.advanceWidth ?? 0) * 48) / font.unitsPerEm).toBeCloseTo(
      inter.advance('V', 48),
      1,
    );
    // A space keeps its width.
    const space = font.charToGlyph(' ')!;
    expect(((space.advanceWidth ?? 0) * 48) / font.unitsPerEm).toBeCloseTo(
      inter.advance(' ', 48),
      1,
    );
  });

  it('bold at weight 700 and a slanted font without an italic file keep their own letters', async () => {
    const bold = (await source().glyphs.load('Inter', true, false))!;
    near(
      box(outlineIn(bold.subset!('b', 'H', 64), 'H', 64).path),
      box(bold.outline('H', 64)),
      0.05,
    );
    const slanted = (await source().glyphs.load('Anton', false, true))!;
    near(
      box(outlineIn(slanted.subset!('s', 'H', 64), 'H', 64).path),
      box(slanted.outline('H', 64)),
      0.05,
    );
  });
});
