// GT4 (M20): text to curves in core — each letter a pen path from its font's outline (a fake font
// here: square letters with a square counter), where the stage draws the letter, grouped in the
// text's place; and the fonts' outlines loaded once and kept for drawing (glyphs.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { createRect, createText } from '../../../../src/core/animation/factory.ts';
import type { GroupObject, PathObject, TextObject } from '../../../../src/core/animation/types.ts';
import {
  bentWithText,
  glyphsMissing,
  hasGlyphSource,
  glyphsOf,
  glyphsReady,
  loadGlyphsFor,
  setGlyphSource,
  textsIn,
  widthsOf,
} from '../../../../src/core/graphics/glyphs.ts';
import {
  glyphRings,
  letterOutlines,
  textToCurves,
} from '../../../../src/core/graphics/text-outlines.ts';
import { fakeGlyphs, fakeGlyphSource, fakeWidths } from '../../../helpers/fake-glyphs.ts';

const text = (words: string, more: Partial<TextObject> = {}): TextObject => ({
  ...createText(words, { x: 100, y: 50, size: 100 }),
  width: words.length * 60,
  height: 120,
  ...more,
});
const same = (p: { x: number; y: number }) => p;
const xs = (o: PathObject) => o.points.map((p) => p.x + o.x);
const ys = (o: PathObject) => o.points.map((p) => p.y + o.y);

afterEach(() => setGlyphSource(null));

describe('GT4: a letter’s outline as pen points', () => {
  it('one ring per contour, the point it comes back to made one (the square and its counter)', () => {
    const rings = glyphRings(fakeGlyphs.outline('o', 100), same);
    expect(rings).toHaveLength(2);
    expect(rings[0]).toEqual([
      { x: 10, y: -70 },
      { x: 50, y: -70 },
      { x: 50, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(rings[1]).toHaveLength(4);
  });

  it('quadratic curves become cubic handles at two thirds; a curve back to the start closes it', () => {
    // M(10,−30) Q(30,−40) → (50,−30), C back to (10,−30): two points, the first curve halved.
    const [ring] = glyphRings(fakeGlyphs.outline('-', 100), same);
    expect(ring).toHaveLength(3);
    expect(ring![0]).toMatchObject({ x: 10, y: -30, in: { x: 10, y: -20 } });
    expect(ring![1]!.x).toBeCloseTo(30);
    expect(ring![1]!.y).toBeCloseTo(-35);
    expect(ring![2]).toMatchObject({ x: 50, y: -30, out: { x: 50, y: -20 } });
    const three = glyphRings(
      [
        { type: 'M', x: 0, y: 0 },
        { type: 'Q', x1: 30, y1: -30, x: 60, y: 0 },
        { type: 'L', x: 30, y: 30 },
        { type: 'C', x1: 20, y1: 30, x2: 0, y2: 20, x: 0, y: 0 },
        { type: 'Z' },
      ],
      same,
    )[0]!;
    expect(three).toHaveLength(3);
    expect(three[0]!.out).toEqual({ x: 20, y: -20 });
    expect(three[1]).toMatchObject({ x: 60, y: 0, in: { x: 40, y: -20 } });
    // The closing curve's handle is on the first point.
    expect(three[0]!.in).toEqual({ x: 0, y: 20 });
    expect(three[2]!.out).toEqual({ x: 20, y: 30 });
  });

  it('a point the curve runs on through is smooth (GV3), a corner stays a cusp', () => {
    const [ring] = glyphRings(
      [
        { type: 'M', x: 0, y: 0 },
        { type: 'C', x1: 10, y1: -10, x2: 20, y2: -10, x: 30, y: -10 },
        { type: 'C', x1: 40, y1: -10, x2: 50, y2: -10, x: 60, y: 0 },
        { type: 'L', x: 30, y: 30 },
        { type: 'Z' },
      ],
      same,
    );
    expect(ring![1]!.type).toBe('smooth');
    expect(ring![0]!.type).toBeUndefined();
  });

  it('a contour of fewer than three points (nothing to fill) is left out', () => {
    const rings = glyphRings(
      [
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 10, y: 0 },
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 10, y: 0 },
        { type: 'L', x: 10, y: 10 },
      ],
      same,
    );
    expect(rings).toHaveLength(1);
  });
});

describe('GT4: outlines drawn oddly', () => {
  it('commands with no move to start them still make a ring', () => {
    const [ring] = glyphRings(
      [
        { type: 'Q', x1: 5, y1: 0, x: 10, y: 0 },
        { type: 'C', x1: 10, y1: 5, x2: 10, y2: 5, x: 10, y: 10 },
        { type: 'L', x: 0, y: 10 },
        { type: 'Z' },
      ],
      same,
    );
    expect(ring).toHaveLength(3);
    const [lone] = glyphRings([{ type: 'C', x1: 0, y1: 0, x2: 5, y2: 5, x: 5, y: 0 }], same);
    expect(lone).toBeUndefined();
  });

  it('two points with straight sides enclose nothing; with one curve between them it is halved', () => {
    const line = glyphRings(
      [{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 10, y: 0 }, { type: 'Z' }],
      same,
    );
    expect(line).toEqual([]);
    const [dome] = glyphRings(
      [
        { type: 'M', x: 0, y: 0 },
        { type: 'C', x1: 0, y1: -10, x2: 10, y2: -10, x: 10, y: 0 },
        { type: 'Z' },
      ],
      same,
    );
    expect(dome).toHaveLength(3);
    expect(dome![0]).not.toHaveProperty('in');
    expect(dome![2]).not.toHaveProperty('out');
    expect(dome![1]!.y).toBeCloseTo(-7.5);
  });

  it('a letter the font has no outline for is left out; a curved letter keeps its handles in its box', () => {
    const glyphs = {
      ...fakeGlyphs,
      outline: (c: string, size: number) => (c === 'x' ? [] : fakeGlyphs.outline(c, size)),
    };
    const g = textToCurves(text('x-', { align: 'right', width: 300 }), glyphs, fakeWidths(100));
    expect(g.children.map((c) => c.name)).toEqual(['-']);
    const bar = g.children[0] as PathObject;
    // Right-aligned in a 300 px box: "-" drawn from 240.
    expect(bar.x).toBeCloseTo(250);
    const handles = bar.points.flatMap((p) => [p.in, p.out]).filter((h) => h !== undefined);
    expect(handles.length).toBeGreaterThan(0);
    for (const h of handles) {
      expect(h!.x).toBeGreaterThanOrEqual(0);
      expect(h!.y).toBeGreaterThanOrEqual(0);
      expect(h!.x).toBeLessThanOrEqual(bar.width);
      expect(h!.y).toBeLessThanOrEqual(bar.height);
    }
  });
});

describe('GT4: each letter where the stage draws it', () => {
  it('straight text: centred on its cell, its baseline the font’s top below the cell’s top', () => {
    const [o, k] = letterOutlines(text('ok'), fakeGlyphs, fakeWidths(100));
    // The stage draws "o" from x 0 (its cell 60 wide), "k" from 60; the square is 10–50 in it.
    expect(Math.min(...o!.rings[0]!.map((p) => p.x))).toBeCloseTo(10);
    expect(Math.min(...k!.rings[0]!.map((p) => p.x))).toBeCloseTo(70);
    // Baseline 80 px below the top (0.8 em): the square stands from 10 to 80.
    expect(o!.rings[0]!.map((p) => p.y).sort((a, b) => a - b)).toEqual([10, 10, 80, 80]);
  });

  it('spaces have no outline; a second line is a line height lower (GT1 line spacing)', () => {
    const letters = letterOutlines(
      text('a b\nc', { lineSpacing: 1.5 }),
      fakeGlyphs,
      fakeWidths(100),
    );
    expect(letters.map((l) => l.char)).toEqual(['a', 'b', 'c']);
    expect(Math.max(...letters[2]!.rings[0]!.map((p) => p.y))).toBeCloseTo(150 + 80);
  });

  it('lines centred in a box wider than the words, as the stage aligns them', () => {
    const [a] = letterOutlines(
      text('a', { align: 'centre', width: 200 }),
      fakeGlyphs,
      fakeWidths(100),
    );
    expect(Math.min(...a!.rings[0]!.map((p) => p.x))).toBeCloseTo(70 + 10);
  });

  it('letter spacing moves each letter on (GT1)', () => {
    const [, b] = letterOutlines(text('ab', { letterSpacing: 100 }), fakeGlyphs, fakeWidths(100));
    expect(Math.min(...b!.rings[0]!.map((p) => p.x))).toBeCloseTo(60 + 10 + 10);
  });

  it('curved text (AN26): each letter turned with the arc, the words in the middle of the box', () => {
    const t = text('abc', { curve: 60, width: 300, height: 200 });
    const letters = letterOutlines(t, fakeGlyphs, fakeWidths(100));
    expect(letters).toHaveLength(3);
    // The first letter leans left (turned anticlockwise), the last right: its bottom edge slopes.
    const slope = (l: (typeof letters)[number]) => {
      const [p, q] = [l.rings[0]![2]!, l.rings[0]![3]!];
      return Math.atan2(p.y - q.y, p.x - q.x);
    };
    expect(slope(letters[0]!)).toBeLessThan(-0.05);
    expect(slope(letters[2]!)).toBeGreaterThan(0.05);
    expect(slope(letters[1]!)).toBeCloseTo(0, 5);
  });

  it('text on a path (GT2) is placed in its box as the path puts it', () => {
    const t = text('ab', {
      width: 400,
      height: 200,
      path: {
        points: [
          { x: 0, y: 150 },
          { x: 400, y: 150 },
        ],
        closed: false,
        start: 0,
        side: 'outside',
      },
    });
    const letters = letterOutlines(t, fakeGlyphs, fakeWidths(100));
    expect(letters).toHaveLength(2);
    // Standing on the line: nothing below it.
    expect(Math.max(...letters.flatMap((l) => l.rings.flat().map((p) => p.y)))).toBeLessThanOrEqual(
      150.01,
    );
  });
});

describe('GT4: the text as a group of letters', () => {
  const look = {
    fill: { kind: 'solid' as const, colour: '#B40000' },
    stroke: { colour: '#000000', width: 2, dash: 'solid' as const },
    fillOpacity: 80,
    opacity: 70,
    rotation: 15,
    flipX: true,
    skewX: 10,
    pivot: { x: 0, y: 1 },
    filters: [{ kind: 'glow' as const, colour: '#ffff00', blur: 6, opacity: 80 }],
  };

  it('in the text’s place, each letter a pen path with its counter as a hole, filled nonzero', () => {
    const t = text('Logo', look);
    const g = textToCurves(t, fakeGlyphs, fakeWidths(100));
    expect(g).toMatchObject({
      kind: 'group',
      id: t.id,
      name: 'Logo',
      x: 100,
      y: 50,
      width: 240,
      height: 120,
      rotation: 15,
      flipX: true,
      skewX: 10,
      pivot: { x: 0, y: 1 },
      opacity: 70,
      filters: look.filters,
      fill: { kind: 'none' },
    });
    expect(g).not.toHaveProperty('text');
    expect(g).not.toHaveProperty('stroke');
    expect(g.children.map((c) => c.name)).toEqual(['L', 'o', 'g', 'o']);
    const o = g.children[1] as PathObject;
    expect(o).toMatchObject({
      kind: 'path',
      closed: true,
      fill: look.fill,
      stroke: look.stroke,
      fillOpacity: 80,
      opacity: 100,
      fillRule: 'nonzero',
      x: 70,
      y: 10,
      width: 40,
      height: 70,
    });
    expect(o.holes).toHaveLength(1);
    // Every point inside its own box.
    expect(Math.min(...xs(o))).toBeCloseTo(o.x);
    expect(Math.max(...ys(o))).toBeCloseTo(o.y + o.height);
    expect(new Set(g.children.map((c) => c.id)).size).toBe(4);
  });

  it('a separate piece (the dot of i) is another ring of the same letter', () => {
    const g = textToCurves(text('i'), fakeGlyphs, fakeWidths(100));
    expect((g.children[0] as PathObject).holes).toHaveLength(1);
  });

  it('keeps its envelope and the keyframes a group can play; the text’s own keyframes go', () => {
    const t = text('Hi', {
      envelope: { kind: 'preset', preset: 'arch', bend: 50 },
      tracks: [
        { property: 'x', keyframes: [] },
        { property: 'fillColour', keyframes: [] },
        { property: 'size', keyframes: [] },
      ],
    });
    const g = textToCurves(t, fakeGlyphs, fakeWidths(100));
    expect(g.envelope).toEqual(t.envelope);
    expect(g.tracks?.map((k) => k.property)).toEqual(['x']);
    const still = textToCurves(
      text('Hi', { tracks: [{ property: 'size', keyframes: [] }] }),
      fakeGlyphs,
      fakeWidths(100),
    );
    expect(still).not.toHaveProperty('tracks');
  });

  it('text on a shown path keeps the path as a line under the letters; a hidden one does not', () => {
    const path = {
      points: [
        { x: 0, y: 150 },
        { x: 400, y: 150 },
      ],
      closed: false,
      start: 0,
      side: 'outside' as const,
    };
    const shown = textToCurves(
      text('ab', { width: 400, height: 200, path: { ...path, stroke: look.stroke } }),
      fakeGlyphs,
      fakeWidths(100),
    );
    expect(shown.children[0]).toMatchObject({
      kind: 'path',
      name: 'Path',
      closed: false,
      fill: { kind: 'none' },
      stroke: look.stroke,
      x: 0,
      y: 150,
      width: 400,
      height: 0,
    });
    const hidden = textToCurves(
      text('ab', { width: 400, height: 200, path }),
      fakeGlyphs,
      fakeWidths(100),
    );
    expect(hidden.children.map((c) => c.name)).toEqual(['a', 'b']);
  });

  it('refuses words with no letters', () => {
    expect(() => textToCurves(text('   '), fakeGlyphs, fakeWidths(100))).toThrow(/no letters/);
  });
});

describe('GT4: the fonts’ outlines, loaded once and kept', () => {
  it('loads each font a text uses once (groups’ texts too); a font not bundled is missing', async () => {
    const source = fakeGlyphSource();
    setGlyphSource(source);
    const a = text('a');
    const bold = text('b', { bold: true });
    const away = text('c', { font: 'Nowhere' });
    const group: GroupObject = {
      ...textToCurves(text('x'), fakeGlyphs, fakeWidths(100)),
      children: [bold, away],
    };
    expect(textsIn([a, group])).toEqual([a, bold, away]);
    expect(glyphsOf(a)).toBeNull();
    expect(glyphsReady(group)).toBe(false);
    expect(await loadGlyphsFor([a, a, group])).toBe(true);
    expect(source.loads).toEqual(['Inter', 'Inter bold', 'Nowhere']);
    expect(glyphsOf(a)).toBe(fakeGlyphs);
    expect(glyphsOf(away)).toBeNull();
    expect(glyphsMissing(away)).toBe(true);
    expect(glyphsMissing(a)).toBe(false);
    expect(glyphsReady(a)).toBe(true);
    expect(await loadGlyphsFor([a])).toBe(false);
    expect(source.loads).toHaveLength(3);
  });

  it('a font being loaded is loaded once for two askers; a failed load counts as missing', async () => {
    let calls = 0;
    setGlyphSource({
      load: async (font) => {
        calls++;
        if (font === 'Broken') throw new Error('unreadable');
        return fakeGlyphs;
      },
    });
    await Promise.all([loadGlyphsFor([text('a')]), loadGlyphsFor([text('b')])]);
    expect(calls).toBe(1);
    await loadGlyphsFor([text('a', { font: 'Broken' })]);
    expect(glyphsMissing(text('a', { font: 'Broken' }))).toBe(true);
  });

  it('outlines loaded for a source since replaced are not kept; with none nothing loads', async () => {
    let release: () => void = () => {};
    setGlyphSource({ load: () => new Promise((r) => (release = () => r(fakeGlyphs))) });
    const loading = loadGlyphsFor([text('a')]);
    setGlyphSource(fakeGlyphSource());
    release();
    expect(await loading).toBe(false);
    expect(glyphsOf(text('a'))).toBeNull();
    setGlyphSource(null);
    expect(await loadGlyphsFor([text('a')])).toBe(false);
  });

  it('GT5: the bent objects holding text are the ones whose outlines the stage reads', () => {
    const arch = { kind: 'preset' as const, preset: 'arch' as const, bend: 50 };
    const plain = text('a');
    const bent = { ...text('b'), envelope: arch };
    const square = { ...createRect({ x: 0, y: 0, width: 10, height: 10 }), envelope: arch };
    const inner: GroupObject = {
      ...textToCurves(text('x'), fakeGlyphs, fakeWidths(100)),
      children: [bent],
    };
    const outer: GroupObject = { ...inner, envelope: undefined, children: [inner, plain] };
    expect(bentWithText([plain, square, bent])).toEqual([bent]);
    expect(bentWithText([outer])).toEqual([bent]);
    expect(bentWithText([{ ...outer, envelope: arch }])).toEqual([{ ...outer, envelope: arch }]);
    expect(hasGlyphSource()).toBe(false);
  });

  it('widths as the stage measures them, else from the font’s advances, else roughly', async () => {
    const t = text('ab');
    expect(widthsOf(t)('ab')).toBeCloseTo(2 * 0.55 * 100);
    setGlyphSource(fakeGlyphSource());
    await loadGlyphsFor([t]);
    expect(widthsOf(t)('ab')).toBeCloseTo(120);
    setGlyphSource(fakeGlyphSource(), (face, s) => (face.size === 100 ? s.length * 7 : 0));
    expect(widthsOf(t)('ab')).toBe(14);
  });
});
