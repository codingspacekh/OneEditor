// GV4, G3 (M19): a live envelope shows everywhere — the stage drawing (and so the PNG), the SVG,
// and the outline used to pick, measure and snap the object.
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createGroup,
  createLayer,
  createPath,
  createRect,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { drawStage, type StageCanvas } from '../../../../src/core/animation/draw.ts';
import { boundsOf, hitTest } from '../../../../src/core/animation/geometry.ts';
import { stageSvg } from '../../../../src/core/animation/svg-export.ts';
import type {
  AnimationDoc,
  AnimObject,
  Envelope,
  PathObject,
} from '../../../../src/core/animation/types.ts';

const arch: Envelope = { kind: 'preset', preset: 'arch', bend: 100 };
const red = { kind: 'solid' as const, colour: '#B40000' };
const box = (): AnimObject => ({
  ...createRect({ x: 50, y: 100, width: 200, height: 100 }),
  fill: red,
  stroke: undefined,
});

function stageWith(...objects: AnimObject[]): AnimationDoc {
  const doc = createAnimation({ name: 'Bent' });
  return {
    ...doc,
    stage: { ...doc.stage, width: 600, height: 400, background: '#ffffff' },
    layers: [createLayer('Layer 1', { objects })],
  };
}

/** The calls a drawing makes (method names only). */
function calls(doc: AnimationDoc): string[] {
  const made: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, key: string) =>
        key === 'withLayer' || key === 'withFilters' || key === 'patternOf' || key === 'measureText'
          ? undefined
          : () => void made.push(key),
      set: () => true,
    },
  ) as unknown as StageCanvas;
  drawStage(ctx, doc);
  return made;
}

describe('GV4 a live envelope is drawn', () => {
  it('on the stage as curves (a plain rectangle is four straight sides)', () => {
    const plain = calls(stageWith(box()));
    expect(plain).not.toContain('bezierCurveTo');
    const bent = calls(stageWith({ ...box(), envelope: arch }));
    expect(bent.filter((c) => c === 'bezierCurveTo').length).toBeGreaterThan(10);
    expect(bent).toContain('fill');
  });

  it('in the SVG as one bent path, arched above the box', () => {
    const svg = stageSvg(stageWith({ ...box(), envelope: arch }));
    const d = /<path d="([^"]+)" fill="#B40000"\/>/.exec(svg)?.[1] ?? '';
    expect(d).toMatch(/^M50 100/);
    expect(d).toContain('C');
    // The top's middle is 50 px above the box (y 100 − 50).
    const ys = [...d.matchAll(/-?[\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeCloseTo(50, 0);
  });

  it('text with an envelope (from a file) is drawn as plain text', () => {
    const text = { ...createText('Hi', { x: 0, y: 0 }), envelope: arch };
    expect(calls(stageWith(text))).toContain('fillText');
  });
});

describe('GV4 a bent object is picked and measured where it is drawn', () => {
  it('its bounds take in the arch; a click above the box on the arch picks it, under it does not', () => {
    const o = { ...box(), envelope: arch };
    const b = boundsOf(o);
    expect(b.y).toBeCloseTo(50, 0);
    expect(b.height).toBeCloseTo(150, 0);
    expect(hitTest(o, { x: 150, y: 60 })).toBe(true);
    expect(hitTest(box(), { x: 150, y: 60 })).toBe(false);
    // The bottom's middle rose to y 150: the box's bottom middle is now outside.
    expect(hitTest(o, { x: 150, y: 190 })).toBe(false);
    expect(hitTest(box(), { x: 150, y: 190 })).toBe(true);
  });

  it('a bent group is picked inside its bent box; a hole is bent with its shape', () => {
    const g = { ...createGroup([box()]), envelope: arch };
    expect(hitTest(g, { x: 150, y: 60 })).toBe(true);
    const holed: PathObject = {
      ...createPath(
        [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 100 },
          { x: 0, y: 100 },
        ],
        true,
      ),
      fill: red,
      holes: [
        [
          { x: 80, y: 30 },
          { x: 120, y: 30 },
          { x: 120, y: 70 },
          { x: 80, y: 70 },
        ],
      ],
    };
    // The hole's middle (100, 50) is lifted to (100, 0) by the arch.
    expect(hitTest(holed, { x: 100, y: 50 })).toBe(false);
    const bent = { ...holed, envelope: arch };
    expect(hitTest(bent, { x: 100, y: 0 })).toBe(false);
    expect(hitTest(bent, { x: 100, y: 50 })).toBe(true);
  });
});
