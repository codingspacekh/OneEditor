// M20 (Graphics: text): the file keeps letter spacing, kerning and line spacing (GT1), text on a
// path (GT2) and text in a shape (GT3), and refuses them damaged. Still version 5: M19 and M20
// are released together.
import { describe, expect, it } from 'vitest';
import { createAnimation, createText } from '../../../../src/core/animation/factory.ts';
import { addObject } from '../../../../src/core/animation/layers.ts';
import {
  ANIMATION_SCHEMA,
  deserializeAnimation,
  serializeAnimation,
} from '../../../../src/core/animation/serialize.ts';
import type { AnimObject, AnimationDoc } from '../../../../src/core/animation/types.ts';

const ring = [
  { x: 0, y: 50 },
  { x: 50, y: 0, type: 'smooth' as const },
  { x: 100, y: 50 },
  { x: 50, y: 100 },
];

const words: AnimObject = {
  ...createText('HERON', { x: 0, y: 0 }),
  letterSpacing: 120,
  kerning: [0, -40, 0, 0, 25],
  lineSpacing: 1.5,
  path: {
    points: ring,
    closed: true,
    start: 25,
    side: 'centred',
    flip: true,
    stroke: { colour: '#000000', width: 1, dash: 'solid' },
  },
};

const boxed: AnimObject = {
  ...createText('Text in a shape', { x: 0, y: 0 }),
  inShape: { points: ring, holes: [ring], padding: 6 },
};

function docOf(...objects: AnimObject[]): AnimationDoc {
  let doc = createAnimation({ name: 'M20' });
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
}

describe('the M20 file format (version 5)', () => {
  it('saves and opens spacing, kerning, line spacing, a text path and a text shape the same', () => {
    expect(ANIMATION_SCHEMA).toBe(5);
    const doc = docOf(words, boxed);
    expect(deserializeAnimation(serializeAnimation(doc))).toEqual(doc);
  });

  it.each([
    ['a bad letter spacing', '"letterSpacing": 120', '"letterSpacing": "wide"'],
    ['a bad line spacing', '"lineSpacing": 1.5', '"lineSpacing": null'],
    ['kerning that is not numbers', '-40,', '"tight",'],
    ['an unknown side', '"side": "centred"', '"side": "under"'],
    ['a text path without its start', '"start": 25', '"start": "top"'],
    ['a flip that is not true or false', '"flip": true', '"flip": "yes"'],
    ['a shape without its padding', '"padding": 6', '"padding": "some"'],
  ])('refuses %s', (_what, from, to) => {
    const text = serializeAnimation(docOf(words, boxed));
    expect(text).toContain(from);
    expect(() => deserializeAnimation(text.replace(from, to))).toThrow(/not a OneEditor animation/);
  });
});
