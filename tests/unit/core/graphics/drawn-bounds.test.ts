// From the Graphics benchmark (2026-11-17), J/19 the monitor's parts and J/20 the meter's parts:
// B7 Image ▸ Crop canvas to selection (and an export of the selected objects, and Trim) fit what
// is drawn — the whole outline (its outer half too), a turned text's letters, an arc's own line
// inside a group (not its whole ellipse's box), a shadow or a glow round it.
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createEllipse,
  createGroup,
  createRect,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { addObject } from '../../../../src/core/animation/layers.ts';
import type { AnimationDoc, AnimObject } from '../../../../src/core/animation/types.ts';
import { drawingBounds } from '../../../../src/core/graphics/document.ts';
import { imageOfObjects } from '../../../../src/core/graphics/export.ts';

const line = (width: number) => ({ colour: '#000000', width, dash: 'solid' as const });

function stageWith(...objects: AnimObject[]): AnimationDoc {
  let doc = createAnimation({ name: 'A' });
  doc = { ...doc, stage: { ...doc.stage, width: 1000, height: 800 } };
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
}

describe('B7: the canvas cropped to what is drawn', () => {
  it('the outline’s outer half is inside the box', () => {
    const r = { ...createRect({ x: 10, y: 10, width: 100, height: 100 }), stroke: line(4) };
    expect(drawingBounds(stageWith(r))).toEqual({ x: 8, y: 8, width: 104, height: 104 });
    const shape = imageOfObjects(stageWith(r), [r.id]);
    expect(shape.stage).toMatchObject({ width: 104, height: 104 });
  });

  it('J/20: a half-ellipse face in a group counts only its half, not its whole ellipse', () => {
    const face = {
      ...createEllipse({ x: 0, y: 0, width: 300, height: 300 }),
      arc: { start: 180, end: 360, close: 'chord' as const },
      stroke: undefined,
    } as AnimObject;
    const surround = createGroup([
      { ...createRect({ x: 0, y: -40, width: 300, height: 40 }), stroke: undefined },
      face,
    ]);
    const box = drawingBounds(stageWith(surround))!;
    expect(box.y).toBeCloseTo(-40, 6);
    expect(box.height).toBeCloseTo(40 + 150, 1);
  });

  it('J/20: a turned number in a group is wholly inside (its turned box, its letters’ height)', () => {
    // A 15 px "100" whose box was typed 10 px high, turned 90°, at the end of a scale.
    const number = {
      ...createText('100', { x: 200, y: 100, size: 15 }),
      width: 30,
      height: 10,
      rotation: 90,
    };
    const scale = createGroup([
      { ...createRect({ x: 0, y: 0, width: 200, height: 100 }), stroke: undefined },
      number,
    ]);
    const box = drawingBounds(stageWith(scale))!;
    // Turned about its centre (215, 105): its 30 px length now runs from y = 90 down to 120, its
    // top edge faces right (x = 220) and its letters (15 px × 1.2 high, more than the 10 px box)
    // reach left to x = 202.
    expect(box.y + box.height).toBeCloseTo(120, 6);
    expect(box.x + box.width).toBeCloseTo(220, 6);
    const alone = drawingBounds(stageWith(number))!;
    expect(alone.x).toBeCloseTo(202, 6);
    expect(alone.width).toBeCloseTo(18, 6);
  });

  it('a drop shadow and a glow are inside the box', () => {
    const shadowed = {
      ...createRect({ x: 100, y: 100, width: 100, height: 100 }),
      stroke: undefined,
      filters: [
        { kind: 'dropShadow' as const, colour: '#000', dx: 10, dy: 6, blur: 5, opacity: 50 },
      ],
    };
    // The shadow falls 10 right and 6 down, 5 px soft: it reaches x = 215 and y = 211.
    expect(drawingBounds(stageWith(shadowed))).toEqual({ x: 100, y: 100, width: 115, height: 111 });
    const glowing = {
      ...createRect({ x: 100, y: 100, width: 100, height: 100 }),
      stroke: line(2),
      filters: [{ kind: 'glow' as const, colour: '#fff', blur: 8, opacity: 90 }],
    };
    expect(drawingBounds(stageWith(glowing))).toEqual({ x: 91, y: 91, width: 118, height: 118 });
  });
});
