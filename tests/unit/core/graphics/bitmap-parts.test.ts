// G11 / GV8 (M19): an SVG with bitmap parts is flagged (9626/04 M/26: "must not contain any
// bitmap elements"); a template layer never counts, as it is never exported.
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createGroup,
  createPicture,
  createRect,
} from '../../../../src/core/animation/factory.ts';
import { bitmapParts, bitmapWarning } from '../../../../src/core/graphics/bitmap-parts.ts';

const pic = (id: string) =>
  createPicture({ id, path: `/m/${id}.png`, width: 10, height: 10 }, { x: 0, y: 0 });

describe('G11: bitmap parts in an SVG', () => {
  const base = createAnimation({ name: 'Chip' });
  const inGroup = createGroup([pic('a'), createRect({ x: 0, y: 0 })]);
  const loose = pic('b');
  const doc = {
    ...base,
    layers: [
      { ...base.layers[0]!, id: 'template', template: true, objects: [pic('Chip')] },
      { ...base.layers[0]!, id: 'hidden', visible: false, objects: [pic('c')] },
      { ...base.layers[0]!, id: 'drawn', objects: [inGroup, loose, createRect({ x: 0, y: 0 })] },
    ],
  };

  it('counts the pictures shown, inside groups too, but never a template or a hidden layer', () => {
    expect(bitmapParts(doc)).toBe(2);
    expect(bitmapParts(doc, [loose.id])).toBe(1);
    expect(bitmapParts(doc, [])).toBe(0);
  });

  it('warns in plain words, or not at all', () => {
    expect(bitmapWarning(0)).toBeNull();
    expect(bitmapWarning(1)).toMatch(/^It will have 1 picture \(a bitmap part\) inside\./);
    expect(bitmapWarning(3)).toMatch(/3 pictures \(bitmap parts\)/);
  });
});
