// GT2, GT3 (M20): text on a path and in a shape drawn on the stage and in the SVG — letter by
// letter where the layout puts them, each turned with the outline; the path drawn under the
// letters only when it has an outline ("do not show the path"); a gradient still runs across the
// whole box. A recording canvas stands in for the real one.
import { describe, expect, it } from 'vitest';
import { createAnimation, createText } from '../../../../src/core/animation/factory.ts';
import { addObject } from '../../../../src/core/animation/layers.ts';
import { drawStage, type StageCanvas } from '../../../../src/core/animation/draw.ts';
import { stageSvg } from '../../../../src/core/animation/svg-export.ts';
import { pathLetters } from '../../../../src/core/graphics/text-path.ts';
import { shapeText } from '../../../../src/core/graphics/text-shape.ts';
import { ellipseAnchors } from '../../../../src/core/graphics/bezier.ts';
import type { AnimationDoc, AnimObject, TextObject } from '../../../../src/core/animation/types.ts';

const tenEach = (s: string) => s.length * 10;

function recorder() {
  const calls: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, key: string) {
      if (key in target) return target[key];
      if (key === 'withLayer' || key === 'patternOf') return undefined;
      return (...args: unknown[]) => {
        const shown = args.map((a) =>
          typeof a === 'number' ? String(Math.round(a * 1000) / 1000) : String(a),
        );
        calls.push(`${key}(${shown.join(',')})`);
        if (key === 'measureText') return { width: tenEach(String(args[0])) };
        if (key.startsWith('create')) return { addColorStop: () => calls.push('stop') };
        return undefined;
      };
    },
    set(_t, key: string, value: unknown) {
      target[key] = value;
      calls.push(`${key}=${typeof value === 'object' ? 'gradient' : String(value)}`);
      return true;
    },
  }) as unknown as StageCanvas;
  return { ctx, calls };
}

const stageWith = (...objects: AnimObject[]): AnimationDoc => {
  let doc = createAnimation({ name: 'Badge' });
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
};

const circle = ellipseAnchors(200, 200).points;
const onCircle = (over: Partial<TextObject> = {}): TextObject => ({
  ...createText('HERON', { x: 50, y: 50, size: 20 }),
  width: 200,
  height: 200,
  path: { points: circle, closed: true, start: 75, side: 'centred' },
  ...over,
});

describe('GT2 drawing text on a path', () => {
  it('draws each letter turned with the outline; a hidden path is not drawn', () => {
    const t = onCircle();
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith(t));
    const letters = pathLetters({ ...t, path: t.path! }, tenEach);
    expect(calls.filter((c) => c.startsWith('fillText(')).map((c) => c.split(',')[0])).toEqual(
      ['H', 'E', 'R', 'O', 'N'].map((c) => `fillText(${c}`),
    );
    // From the top of the letter's line, half a line (24 px) above its middle.
    expect(calls).toContain('fillText(H,0,-12)');
    const r = (letters[0]!.angle * Math.PI) / 180;
    expect(calls).toContain(`rotate(${Math.round(r * 1000) / 1000})`);
    const at = (n: number) => String(Math.round(n * 1000) / 1000);
    expect(calls).toContain(`translate(${at(letters[0]!.x - 100)},${at(letters[0]!.y - 100)})`);
    expect(calls.some((c) => c.startsWith('stroke('))).toBe(false);
  });

  it('draws the path under the letters when it has an outline', () => {
    const shown = onCircle({
      path: {
        points: circle,
        closed: true,
        start: 75,
        side: 'outside',
        stroke: { colour: '#ff0000', width: 3, dash: 'solid' },
      },
    });
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith(shown));
    const stroked = calls.indexOf('stroke()');
    expect(stroked).toBeGreaterThan(-1);
    expect(calls.lastIndexOf('strokeStyle=#ff0000', stroked)).toBeGreaterThan(-1);
    expect(calls.lastIndexOf('lineWidth=3', stroked)).toBeGreaterThan(-1);
    expect(calls.findIndex((c) => c.startsWith('fillText('))).toBeGreaterThan(stroked);
    // The circle as Bézier curves, centred on the box's middle.
    expect(calls).toContain('moveTo(100,0)');
  });

  it('outlines and fills the letters, a gradient made at each letter', () => {
    const t = onCircle({
      fill: { kind: 'linear', from: '#ffffff', to: '#ff0000', angle: 90 },
      stroke: { colour: '#000000', width: 1, dash: 'solid' },
    });
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith(t));
    expect(calls.filter((c) => c.startsWith('strokeText('))).toHaveLength(5);
    expect(calls.filter((c) => c.startsWith('createLinearGradient('))).toHaveLength(5);
  });
});

describe('GT3 drawing text in a shape', () => {
  it('draws the wrapped letters upright where the setting puts them', () => {
    const t: TextObject = {
      ...createText('AB CD', { x: 0, y: 0, size: 20 }),
      width: 40,
      height: 100,
      inShape: {
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 100 },
          { x: 0, y: 100 },
        ],
        padding: 0,
      },
    };
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith(t));
    const set = shapeText({ ...t, inShape: t.inShape! }, tenEach).letters;
    expect(set.map((l) => l.char)).toEqual(['A', 'B', 'C', 'D']);
    expect(calls.filter((c) => c.startsWith('fillText(')).length).toBe(4);
    expect(calls).toContain('translate(-15,-38)');
    expect(calls.some((c) => c.startsWith('rotate('))).toBe(false);
  });
});

describe('GT2 the SVG', () => {
  it('has each letter where the stage puts it, and the path when it is shown', () => {
    const t = onCircle({
      x: 0,
      y: 0,
      path: {
        points: circle,
        closed: true,
        start: 75,
        side: 'outside',
        stroke: { colour: '#ff0000', width: 2, dash: 'solid' },
      },
    });
    const svg = stageSvg(stageWith(t), 0, {}, [], {}, (_font, s) => tenEach(s));
    const letters = [...svg.matchAll(/<text[^>]*transform="matrix\(([^)]+)\)"[^>]*>(.)<\/text>/g)];
    expect(letters.map((m) => m[2])).toEqual(['H', 'E', 'R', 'O', 'N']);
    const placed = pathLetters({ ...t, path: t.path! }, tenEach);
    letters.forEach((m, i) => {
      const [, , , , e, f] = m[1]!.split(' ').map(Number);
      expect(e).toBeCloseTo(placed[i]!.x, 2);
      expect(f).toBeCloseTo(placed[i]!.y, 2);
    });
    expect(svg).toMatch(/<path d="M[^"]*C[^"]*" fill="none" stroke="#ff0000"/);
    const hidden = stageSvg(stageWith(onCircle({ x: 0, y: 0 })), 0, {}, [], {}, (_f, s) =>
      tenEach(s),
    );
    expect(hidden).not.toMatch(/<path/);
  });
});
