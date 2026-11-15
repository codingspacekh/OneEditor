// M19 (Graphics: the vector toolkit): the file keeps what is new — pattern fills and fill and
// outline opacity (G12), effects (G14), envelopes and perspective (GV4), arcs (GV1), node types
// (GV3), template layers (GV8) and the outline view (GV7) — and refuses them damaged. Files say
// version 5; version 4 files still open.
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createEllipse,
  createPath,
  createRect,
} from '../../../../src/core/animation/factory.ts';
import { addObject } from '../../../../src/core/animation/layers.ts';
import {
  ANIMATION_SCHEMA,
  deserializeAnimation,
  serializeAnimation,
} from '../../../../src/core/animation/serialize.ts';
import type { AnimObject, AnimationDoc } from '../../../../src/core/animation/types.ts';

function docOf(...objects: AnimObject[]): AnimationDoc {
  let doc = createAnimation({ name: 'M19' });
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
}

const patterned: AnimObject = {
  ...createRect({ x: 0, y: 0, width: 100, height: 50 }),
  fill: { kind: 'pattern', pattern: 'weave', colour: '#8B5A2B', background: '#F5DEB3', size: 12 },
  fillOpacity: 50,
  stroke: { colour: '#000000', width: 2, dash: 'solid', opacity: 40 },
  filters: [
    { kind: 'dropShadow', colour: '#000000', dx: 4, dy: 4, blur: 6, opacity: 60 },
    { kind: 'innerShadow', colour: '#000000', dx: 2, dy: 2, blur: 3, opacity: 50 },
    { kind: 'glow', colour: '#FFFF99', blur: 12, opacity: 80 },
    {
      kind: 'bevel',
      depth: 4,
      blur: 3,
      angle: 135,
      light: '#FFFFFF',
      shadow: '#000000',
      opacity: 75,
    },
    { kind: 'blur', radius: 5 },
  ],
  envelope: { kind: 'preset', preset: 'arch', bend: 40 },
};

const arc: AnimObject = {
  ...createEllipse({ x: 10, y: 10, width: 80, height: 80 }),
  arc: { start: 180, end: 360, close: 'pie' },
  envelope: {
    kind: 'perspective',
    corners: [
      { x: 0.1, y: 0 },
      { x: 0.9, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  },
};

const nodes: AnimObject = {
  ...createPath(
    [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ],
    false,
  ),
  points: [
    { x: 0, y: 0 },
    { x: 50, y: 0, in: { x: 40, y: -10 }, out: { x: 60, y: 10 }, type: 'symmetrical' },
    { x: 100, y: 50 },
  ],
};

describe('the M19 file format', () => {
  it('saves and opens every new field the same; files say version 5', () => {
    let doc = docOf(patterned, arc, nodes);
    doc = {
      ...doc,
      layers: [{ ...doc.layers[0]!, template: true }],
      view: { ...doc.view, wireframe: true },
    };
    expect(ANIMATION_SCHEMA).toBe(5);
    expect(doc.schemaVersion).toBe(5);
    expect(deserializeAnimation(serializeAnimation(doc))).toEqual(doc);
  });

  it('a picture pattern names its picture', () => {
    const tiled: AnimObject = {
      ...createRect({ x: 0, y: 0, width: 10, height: 10 }),
      fill: {
        kind: 'pattern',
        pattern: 'picture',
        colour: '#000000',
        background: 'none',
        size: 40,
        pictureId: 'p1',
      },
    };
    const doc = docOf(tiled);
    expect(deserializeAnimation(serializeAnimation(doc))).toEqual(doc);
  });

  it('version 4 files still open, as version 5', () => {
    const v4 = serializeAnimation(docOf(createRect({ x: 0, y: 0 }))).replace(
      '"schemaVersion": 5',
      '"schemaVersion": 4',
    );
    expect(deserializeAnimation(v4).schemaVersion).toBe(5);
  });

  it.each([
    ['an unknown pattern', '"pattern": "weave"', '"pattern": "tartan"'],
    ['a pattern without a size', '"size": 12', '"size": "big"'],
    ['an unknown effect', '"kind": "glow"', '"kind": "sparkle"'],
    ['an effect without its numbers', '"radius": 5', '"radius": "soft"'],
    ['an unknown envelope', '"preset": "arch"', '"preset": "twist"'],
    ['a bad fill opacity', '"fillOpacity": 50', '"fillOpacity": "half"'],
    ['a bad outline opacity', '"opacity": 40', '"opacity": "some"'],
    ['an arc without its end', '"end": 360', '"end": "top"'],
    ['an unknown arc close', '"close": "pie"', '"close": "cake"'],
    ['an unknown node type', '"type": "symmetrical"', '"type": "wobbly"'],
    ['a perspective of 3 corners', '"x": 0.1,\n', '"z": 0.1,\n'],
  ])('refuses %s', (_what, from, to) => {
    const text = serializeAnimation(docOf(patterned, arc, nodes));
    expect(text).toContain(from);
    expect(() => deserializeAnimation(text.replace(from, to))).toThrow(/not a OneEditor animation/);
  });

  it('refuses a template flag or outline view that is not true or false', () => {
    const doc = docOf();
    const t = serializeAnimation({ ...doc, layers: [{ ...doc.layers[0]!, template: true }] });
    expect(() => deserializeAnimation(t.replace('"template": true', '"template": 1'))).toThrow();
    const w = serializeAnimation({ ...doc, view: { ...doc.view, wireframe: true } });
    expect(() =>
      deserializeAnimation(w.replace('"wireframe": true', '"wireframe": "on"')),
    ).toThrow();
  });
});
