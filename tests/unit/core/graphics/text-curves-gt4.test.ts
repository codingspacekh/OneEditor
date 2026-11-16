// GT4, GT5 (M20): text to curves through Convert to curves, and text bent by an envelope while it
// stays text — drawn (stage and PNG), exported (SVG), picked and measured as its bent letters, and
// applied as paths — with the fake font's outlines (square letters with a square counter).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnimation,
  createGroup,
  createLayer,
  createRect,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { drawStage, type StageCanvas } from '../../../../src/core/animation/draw.ts';
import { boundsOf } from '../../../../src/core/animation/geometry.ts';
import { findObject } from '../../../../src/core/animation/layers.ts';
import {
  deserializeAnimation,
  serializeAnimation,
} from '../../../../src/core/animation/serialize.ts';
import { stageSvg } from '../../../../src/core/animation/svg-export.ts';
import type {
  AnimationDoc,
  AnimObject,
  Envelope,
  GroupObject,
  PathObject,
  TextObject,
} from '../../../../src/core/animation/types.ts';
import { convertToCurves, toCurves } from '../../../../src/core/graphics/curves.ts';
import { loadGlyphsFor, setGlyphSource } from '../../../../src/core/graphics/glyphs.ts';
import { reversePath } from '../../../../src/core/graphics/nodes.ts';
import { applyEnvelope, bentForDrawing, withEnvelope } from '../../../../src/core/graphics/warp.ts';
import { fakeGlyphSource, fakeWidths } from '../../../helpers/fake-glyphs.ts';

const arch: Envelope = { kind: 'preset', preset: 'arch', bend: 100 };
const red = { kind: 'solid' as const, colour: '#B40000' };

const text = (words: string, more: Partial<TextObject> = {}): TextObject => ({
  ...createText(words, { x: 100, y: 50, size: 100 }),
  width: words.length * 60,
  height: 120,
  fill: red,
  ...more,
});

function stageWith(...objects: AnimObject[]): AnimationDoc {
  const doc = createAnimation({ name: 'Letters' });
  return {
    ...doc,
    stage: { ...doc.stage, width: 800, height: 400, background: '#ffffff' },
    layers: [createLayer('Layer 1', { objects })],
  };
}

/** The calls a drawing makes, with a fill's rule; filters drawn into the same recorder. */
function calls(doc: AnimationDoc): string[] {
  const made: string[] = [];
  const ctx: StageCanvas = new Proxy({} as StageCanvas, {
    get: (_t, key: string) =>
      key === 'withLayer' || key === 'patternOf'
        ? undefined
        : key === 'measureText'
          ? (s: string) => ({ width: fakeWidths(100)(s) })
          : key === 'withFilters'
            ? (_f: unknown, draw: (c: StageCanvas) => void) => {
                made.push('withFilters');
                draw(ctx);
              }
            : (...args: unknown[]) =>
                void made.push(key === 'fill' && args[0] ? `fill ${String(args[0])}` : key),
    set: () => true,
  });
  drawStage(ctx, doc);
  return made;
}

beforeEach(() => setGlyphSource(fakeGlyphSource(), (t, s) => fakeWidths(t.size)(s)));
afterEach(() => setGlyphSource(null));

describe('GT4: Convert to curves on text', () => {
  it('waits for the font’s outlines, then makes the text its letters, grouped in its place', async () => {
    const t = text('Logo');
    expect(() => toCurves(t)).toThrow(/still loading/);
    await loadGlyphsFor([t]);
    const g = toCurves(t) as GroupObject;
    expect(g).toMatchObject({ kind: 'group', id: t.id, x: 100, y: 50, width: 240, height: 120 });
    expect(g.children.map((c) => [c.kind, c.name])).toEqual([
      ['path', 'L'],
      ['path', 'o'],
      ['path', 'g'],
      ['path', 'o'],
    ]);
  });

  it('a font that is not bundled says so', async () => {
    const t = text('Logo', { font: 'Nowhere' });
    await loadGlyphsFor([t]);
    expect(() => toCurves(t)).toThrow(/letters of “Nowhere” cannot be read/);
  });

  it('a group’s text is converted inside it; the selection converted where it is', async () => {
    const t = text('Hi');
    const group = createGroup([createRect({ x: 0, y: 0, width: 50, height: 50 }), t]);
    await loadGlyphsFor([group]);
    const doc = convertToCurves(stageWith(group), [group.id]);
    const made = findObject(doc, group.id)!.object as GroupObject;
    expect(made.children.map((c) => c.kind)).toEqual(['path', 'group']);
  });

  it('workbook Task 2: a letter is a pen path the node tool works on, holes and all', async () => {
    const t = text('o');
    await loadGlyphsFor([t]);
    const letter = (toCurves(t) as GroupObject).children[0] as PathObject;
    expect(letter.points).toHaveLength(4);
    expect(letter.holes).toHaveLength(1);
    // Its nodes pulled: the letter stretched upwards.
    const stretched: PathObject = {
      ...letter,
      points: letter.points.map((p, i) => (i < 2 ? { ...p, y: p.y - 40 } : p)),
    };
    expect(Math.min(...stretched.points.map((p) => p.y))).toBe(-40);
    expect(reversePath(letter).points).toHaveLength(4);
  });

  it('a bent text is converted bent: its letters’ paths arched', async () => {
    const t = text('Logo', { envelope: arch });
    await loadGlyphsFor([t]);
    const g = toCurves(t) as GroupObject;
    expect(g.envelope).toBeUndefined();
    expect(g.children).toHaveLength(4);
    // The arch lifts the middle letters above the box's top (y 50).
    expect(g.y).toBeLessThan(50);
    expect(g.children.every((c) => c.kind === 'path' && c.points.some((p) => p.out))).toBe(true);
  });
});

describe('GT5: text bent by an envelope, still text', () => {
  it('drawn unbent while the outlines load, then as its bent letters (no words drawn)', async () => {
    const t = withEnvelope(text('Logo'), arch);
    expect(bentForDrawing(t)).toBe(t);
    expect(calls(stageWith(t))).toContain('fillText');
    await loadGlyphsFor([t]);
    const shown = bentForDrawing(t) as GroupObject;
    expect(shown).toMatchObject({ kind: 'group', id: t.id });
    const drawn = calls(stageWith(t));
    expect(drawn).not.toContain('fillText');
    expect(drawn.filter((c) => c === 'bezierCurveTo').length).toBeGreaterThan(20);
    // Each letter filled as its font is: counters stay holes, overlapping strokes stay filled.
    expect(drawn).toContain('fill');
    expect(drawn).not.toContain('fill evenodd');
  });

  it('its words, font or size changed: the envelope stays and bends the new letters', async () => {
    const t = withEnvelope(text('Logo'), arch);
    await loadGlyphsFor([t]);
    const longer = { ...t, text: 'Logos', width: 300 };
    expect(longer.envelope).toEqual(arch);
    expect((bentForDrawing(longer) as GroupObject).children).toHaveLength(5);
  });

  it('effects (G14) are still drawn with bent text', async () => {
    const t = {
      ...withEnvelope(text('Hi'), arch),
      filters: [
        { kind: 'dropShadow' as const, colour: '#000000', dx: 4, dy: 4, blur: 2, opacity: 60 },
      ],
    };
    await loadGlyphsFor([t]);
    const drawn = calls(stageWith(t));
    expect(drawn).toContain('withFilters');
    expect(drawn).not.toContain('fillText');
  });

  it('coursebook exam-style 1: a TV logo’s arched words in the SVG as bent letter paths', async () => {
    const t = withEnvelope(text('TV'), arch);
    await loadGlyphsFor([t]);
    const svg = stageSvg(stageWith(t));
    expect(svg).not.toContain('<text');
    expect([...svg.matchAll(/<path d="[^"]*C[^"]*" fill="#B40000"/g)]).toHaveLength(2);
  });

  it('picked and measured by its bent box (the arch rises above the text’s box)', () => {
    const t = withEnvelope(text('Logo'), arch);
    expect(boundsOf(t).y).toBeLessThan(50);
  });

  it('Apply makes it the bent letters as paths, in one group named after the text', async () => {
    const t = withEnvelope(text('Logo'), arch);
    await loadGlyphsFor([t]);
    const applied = applyEnvelope(t) as GroupObject;
    expect(applied).toMatchObject({ kind: 'group', id: t.id, name: 'Logo' });
    expect(applied.envelope).toBeUndefined();
    expect(applied.children.map((c) => c.kind)).toEqual(['path', 'path', 'path', 'path']);
    expect((applied.children[1] as PathObject).fillRule).toBe('nonzero');
  });

  it('a group of shapes and text is bent as one, once the text’s outlines are loaded', async () => {
    const group = withEnvelope(
      createGroup([createRect({ x: 100, y: 50, width: 240, height: 120 }), text('Logo')]),
      arch,
    );
    expect(bentForDrawing(group)).toBe(group);
    await loadGlyphsFor([group]);
    const shown = bentForDrawing(group) as GroupObject;
    expect(shown.children.map((c) => c.kind)).toEqual(['path', 'group']);
  });
});

describe('GT4: a letter’s fill rule is saved', () => {
  it('kept and read back; anything else is refused', async () => {
    const t = text('o');
    await loadGlyphsFor([t]);
    const doc = stageWith(toCurves(t));
    const back = deserializeAnimation(serializeAnimation(doc));
    const letter = (back.layers[0]!.objects[0] as GroupObject).children[0] as PathObject;
    expect(letter.fillRule).toBe('nonzero');
    const broken = serializeAnimation(doc).replace('"nonzero"', '"winding"');
    expect(() => deserializeAnimation(broken)).toThrow();
  });
});
