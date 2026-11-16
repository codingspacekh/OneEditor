// M21 step 3 (GB2): a selection from vector objects — each object's outline (turned, in its
// group, a combined path's holes, text as its letters) rasterised anti-aliased with the object's
// fill rule; what M/25 Tier needs (the jigsaw template's piece cutting the picture).
import { describe, expect, it } from 'vitest';
import {
  createGroup,
  createPath,
  createRect,
  createText,
} from '../../../../../src/core/animation/factory.ts';
import type {
  GroupObject,
  PathObject,
  TextObject,
} from '../../../../../src/core/animation/types.ts';
import { contentBounds, pixelAt } from '../../../../../src/core/graphics/pixels/raster.ts';
import { createEllipse } from '../../../../../src/core/animation/factory.ts';
import { readRegion } from '../../../../../src/core/graphics/pixels/raster.ts';
import { objectsMask } from '../../../../../src/core/graphics/pixels/select-objects.ts';
import { isEmptyMask } from '../../../../../src/core/graphics/pixels/selection.ts';

const noLetters = (): GroupObject => {
  throw new Error('no letters here');
};

describe('M21 GB2: selection from shapes and text', () => {
  it('hard edges: two ellipses that meet share no pixel; soft ones share their edge', () => {
    const a = createEllipse({ x: 0, y: 0, width: 20, height: 20 });
    const b = createEllipse({ x: 10.3, y: 0, width: 20, height: 20 });
    const hard = (o: typeof a) => objectsMask(40, 20, [o], noLetters, false);
    const soft = (o: typeof a) => objectsMask(40, 20, [o], noLetters);
    const values = (m: ReturnType<typeof hard>) => new Set(readRegion(m));
    expect([...values(hard(a))].sort((x, y) => x - y)).toEqual([0, 255]);
    expect(values(soft(a)).size).toBeGreaterThan(2);
  });

  it('selects a rectangle’s area, turned with it', () => {
    const rect = createRect({ x: 10, y: 10, width: 20, height: 10 });
    expect(contentBounds(objectsMask(50, 50, [rect], noLetters))).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 10,
    });
    const turned = objectsMask(50, 50, [{ ...rect, rotation: 90 }], noLetters);
    expect(contentBounds(turned)).toEqual({ x: 15, y: 5, width: 10, height: 20 });
  });

  it('leaves a combined path’s holes out (even-odd)', () => {
    const square: PathObject = {
      ...createPath(
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        true,
      ),
      holes: [
        [
          { x: 5, y: 5 },
          { x: 15, y: 5 },
          { x: 15, y: 15 },
          { x: 5, y: 15 },
        ],
      ],
    };
    const m = objectsMask(30, 30, [square], noLetters);
    expect(pixelAt(m, 2, 2)).toBe(255);
    expect(pixelAt(m, 10, 10)).toBe(0);
  });

  it('selects each shape in a group where the group puts it, and joins several', () => {
    const group = {
      ...createGroup([
        createRect({ x: 0, y: 0, width: 4, height: 4 }),
        createRect({ x: 10, y: 0, width: 4, height: 4 }),
      ]),
    };
    const moved = { ...group, x: 20, y: 20 };
    const m = objectsMask(
      40,
      40,
      [moved, createRect({ x: 0, y: 0, width: 2, height: 2 })],
      noLetters,
    );
    expect(pixelAt(m, 21, 21)).toBe(255);
    expect(pixelAt(m, 31, 21)).toBe(255);
    expect(pixelAt(m, 26, 21)).toBe(0);
    expect(pixelAt(m, 1, 1)).toBe(255);
  });

  it('selects text as its letters (given by the font), not its box', () => {
    const text: TextObject = createText('I', { x: 10, y: 10, size: 20 });
    const stroke: PathObject = createPath(
      [
        { x: 2, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 12 },
        { x: 2, y: 12 },
      ],
      true,
    );
    const letters = (t: TextObject): GroupObject => ({
      ...createGroup([stroke]),
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
    });
    const m = objectsMask(60, 60, [text], letters);
    // The letter's 2 px stroke, placed in the text's box (the group's children from its corner).
    expect(contentBounds(m)).toEqual({ x: 10, y: 10, width: 2, height: 10 });
  });

  it('an open line has no inside to select', () => {
    const line = createPath(
      [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
      ],
      false,
    );
    expect(isEmptyMask(objectsMask(30, 30, [line], noLetters))).toBe(true);
    expect(isEmptyMask(objectsMask(30, 30, [], noLetters))).toBe(true);
  });
});
