// From the Graphics benchmark (2026-11-17), M/17 the Woodlands sticker resized to 250 × 200:
// B2 a group's text and outlines scale by the same amount however its width and height are typed
// (together, width then height, or height then width): by √(sx·sy), the one rule that does not
// depend on the order; in proportion, by the scale itself. G3 the image's "Scale outlines and
// effects" choice (Illustrator's Scale Strokes & Effects): on (as before), a group's outlines and
// its effects' sizes scale with it; off, they stay as typed (the 1 pt outline stays 1 pt) — for a
// group, a handle drag and Image ▸ Image Size; saved with the image.
import { describe, expect, it } from 'vitest';
import { resizeObject, setProperties } from '../../../../src/app/animation-commands.ts';
import {
  createAnimation,
  createGroup,
  createRect,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { addObject } from '../../../../src/core/animation/layers.ts';
import {
  deserializeAnimation,
  serializeAnimation,
} from '../../../../src/core/animation/serialize.ts';
import type {
  AnimationDoc,
  AnimObject,
  GroupObject,
  ObjectFilter,
  TextObject,
} from '../../../../src/core/animation/types.ts';
import { createGraphic } from '../../../../src/core/graphics/document.ts';
import { resizeImage } from '../../../../src/core/graphics/image-size.ts';

const shadow: ObjectFilter = {
  kind: 'dropShadow',
  colour: '#000000',
  dx: 8,
  dy: 8,
  blur: 10,
  opacity: 50,
};
const line = (width: number) => ({ colour: '#000000', width, dash: 'solid' as const });

function sticker(scaleOutlines?: boolean): { doc: AnimationDoc; group: GroupObject } {
  const box = {
    ...createRect({ x: 0, y: 0, width: 600, height: 400 }),
    stroke: line(4),
    filters: [shadow],
  } as AnimObject;
  const words = createText('Homes', { x: 100, y: 100, size: 64 });
  const group = createGroup([box, words]);
  let doc = createAnimation({ name: 'A' });
  if (scaleOutlines !== undefined) doc = { ...doc, view: { ...doc.view, scaleOutlines } };
  doc = addObject(doc, doc.layers[0]!.id, group);
  return { doc, group: doc.layers[0]!.objects[0] as GroupObject };
}

const groupIn = (doc: AnimationDoc) => doc.layers[0]!.objects[0] as GroupObject;
const parts = (doc: AnimationDoc) => {
  const [box, words] = groupIn(doc).children as [AnimObject, TextObject];
  return { box, words };
};

describe('B2: a stretched group’s text and outlines do not depend on the order typed', () => {
  it('width and height together, or one after the other, give the same: √(sx·sy)', () => {
    const { doc, group } = sticker();
    const both = setProperties([group.id], { width: 250, height: 200 }).apply(doc);
    const k = Math.sqrt((250 / 600) * (200 / 400));
    expect(parts(both).words.size).toBeCloseTo(64 * k, 9);
    expect(parts(both).box.stroke!.width).toBeCloseTo(4 * k, 9);
    const wThenH = setProperties([group.id], { height: 200 }).apply(
      setProperties([group.id], { width: 250 }).apply(doc),
    );
    const hThenW = setProperties([group.id], { width: 250 }).apply(
      setProperties([group.id], { height: 200 }).apply(doc),
    );
    for (const d of [wThenH, hThenW]) {
      expect(parts(d).words.size).toBeCloseTo(parts(both).words.size, 9);
      expect(parts(d).box.stroke!.width).toBeCloseTo(parts(both).box.stroke!.width, 9);
    }
  });

  it('in proportion, by the scale itself (half the size: half the font and outline)', () => {
    const { doc, group } = sticker();
    const half = setProperties([group.id], { width: 300, height: 200 }).apply(doc);
    expect(parts(half).words.size).toBeCloseTo(32, 9);
    expect(parts(half).box.stroke!.width).toBeCloseTo(2, 9);
  });
});

describe('G3: Scale outlines and effects', () => {
  it('on (as before, the default): a group’s outlines and effect sizes scale with it', () => {
    const { doc, group } = sticker();
    expect(doc.view.scaleOutlines).toBeUndefined();
    const half = setProperties([group.id], { width: 300, height: 200 }).apply(doc);
    expect(parts(half).box.stroke!.width).toBeCloseTo(2, 9);
    const [f] = parts(half).box.filters as [Extract<ObjectFilter, { kind: 'dropShadow' }>];
    expect([f.dx, f.dy, f.blur, f.opacity]).toEqual([
      expect.closeTo(4, 9),
      expect.closeTo(4, 9),
      expect.closeTo(5, 9),
      50,
    ]);
  });

  it('off: typing the group’s size keeps the outline and the shadow as typed; text still scales', () => {
    const { doc, group } = sticker(false);
    const small = setProperties([group.id], { width: 250, height: 200 }).apply(doc);
    expect(parts(small).box.stroke!.width).toBe(4);
    expect(parts(small).box.filters).toEqual([shadow]);
    expect(parts(small).words.size).toBeLessThan(64);
    expect(groupIn(small)).toMatchObject({ width: 250, height: 200 });
  });

  it('off: dragging the group’s corner handle keeps them too', () => {
    const { doc, group } = sticker(false);
    const dragged = resizeObject(group.id, 'se', { x: 300, y: 200 }, false).apply(doc);
    expect(groupIn(dragged).width).toBeCloseTo(300, 6);
    expect(parts(dragged).box.stroke!.width).toBe(4);
    expect(parts(dragged).box.filters).toEqual([shadow]);
    const scaling = sticker();
    const on = resizeObject(scaling.group.id, 'se', { x: 300, y: 200 }, false).apply(scaling.doc);
    expect(parts(on).box.stroke!.width).toBeCloseTo(2, 6);
  });

  it('off: Image ▸ Image Size keeps the outlines of the image’s shapes (M/26: the chip at 10 cm)', () => {
    const image = createGraphic({
      name: 'Chip',
      size: { width: 1000, height: 600, units: 'px', dpi: 96 },
      background: 'none',
    });
    const rect = { ...createRect({ x: 100, y: 100, width: 800, height: 400 }), stroke: line(1.5) };
    const withRect = (scaleOutlines?: boolean) => {
      let d = addObject(image, image.layers[0]!.id, rect);
      if (scaleOutlines !== undefined) d = { ...d, view: { ...d.view, scaleOutlines } };
      return d;
    };
    const kept = resizeImage(withRect(false), { width: 378, height: 227, method: 'bicubic' });
    expect(kept.layers[0]!.objects[0]!.stroke!.width).toBe(1.5);
    const scaled = resizeImage(withRect(), { width: 378, height: 227, method: 'bicubic' });
    expect(scaled.layers[0]!.objects[0]!.stroke!.width).toBeLessThan(1);
  });

  it('is saved with the image and opened again; anything but yes or no is refused', () => {
    const { doc } = sticker(false);
    expect(deserializeAnimation(serializeAnimation(doc)).view.scaleOutlines).toBe(false);
    const bad = JSON.parse(serializeAnimation(doc)) as { view: Record<string, unknown> };
    bad.view.scaleOutlines = 'no';
    expect(() => deserializeAnimation(JSON.stringify(bad))).toThrow();
  });
});
