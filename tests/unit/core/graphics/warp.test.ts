// GV4, G3 (M19): shapes and groups bent by their envelope — drawn bent while the envelope is
// live, and made into plain paths that look the same on Apply. Curves are cut into short pieces
// before they are mapped, so the bent outline stays close to the exact bend.
import { describe, expect, it } from 'vitest';
import {
  createButton,
  createEllipse,
  createGroup,
  createPath,
  createPicture,
  createPolygon,
  createRect,
  createStar,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { boundsOf, toStage } from '../../../../src/core/animation/geometry.ts';
import type {
  AnimObject,
  Envelope,
  GroupObject,
  PathObject,
} from '../../../../src/core/animation/types.ts';
import { boxMap } from '../../../../src/core/graphics/envelope.ts';
import {
  applyEnvelope,
  bentForDrawing,
  warpedOutline,
  warpedRings,
  whyNotBendable,
  withEnvelope,
} from '../../../../src/core/graphics/warp.ts';

const arch: Envelope = { kind: 'preset', preset: 'arch', bend: 100 };
const bent = <T extends AnimObject>(o: T, envelope: Envelope = arch): T => ({ ...o, envelope });
const rect = () => createRect({ x: 50, y: 40, width: 200, height: 100 });

/** How far a point is from a polyline (closed). */
function distance(p: { x: number; y: number }, line: { x: number; y: number }[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    const [a, b] = [line[i]!, line[(i + 1) % line.length]!];
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

describe('GV4 a bent outline', () => {
  it('stays within a quarter of a pixel of the exact bend (curves subdivided before mapping)', () => {
    const o = bent(rect());
    const [outline] = warpedOutline(o);
    const exact = boxMap(arch, 200, 100);
    for (let x = 0; x <= 200; x += 5)
      for (const y of [0, 100]) expect(distance(exact({ x, y }), outline!)).toBeLessThan(0.25);
    for (let y = 0; y <= 100; y += 5)
      expect(distance(exact({ x: 200, y }), outline!)).toBeLessThan(0.25);
  });

  it('is a few smooth curves, not hundreds of points', () => {
    const [ring] = warpedRings(bent(rect()));
    expect(ring!.closed).toBe(true);
    expect(ring!.points.length).toBeLessThan(32);
    // Inside a bent side the curve runs on smoothly; the box's corners stay corners.
    const top = ring!.points.filter((p) => p.y < -1);
    expect(top.length).toBeGreaterThan(3);
    expect(top.every((p) => p.type === 'smooth' && p.in && p.out)).toBe(true);
    expect(ring!.points[0]).toMatchObject({ x: 0, y: 0 });
    expect(ring!.points[0]!.type).toBeUndefined();
  });

  it('G3 perspective keeps straight sides straight (no curve handles)', () => {
    const o = bent(rect(), {
      kind: 'perspective',
      corners: [
        { x: 0.25, y: 0 },
        { x: 0.75, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    });
    const [ring] = warpedRings(o);
    expect(ring!.points.every((p) => !p.in && !p.out)).toBe(true);
    // Straight pieces in line are one side again: four corners.
    expect(ring!.points).toHaveLength(4);
    expect(ring!.points).toContainEqual({ x: 50, y: 0 });
    expect(ring!.points).toContainEqual({ x: 200, y: 100 });
  });

  it('bends every kind of shape: a rounded rectangle, an ellipse, a star, a polygon', () => {
    const shapes: AnimObject[] = [
      { ...rect(), radius: 20 },
      createEllipse({ x: 0, y: 0, width: 100, height: 60 }),
      createStar({ x: 0, y: 0, width: 100, height: 100 }),
      createPolygon({ x: 0, y: 0, width: 100, height: 100 }),
    ];
    for (const o of shapes) {
      const plain = warpedOutline(o)[0]!;
      const arched = warpedOutline(bent(o))[0]!;
      expect(Math.min(...arched.map((p) => p.y))).toBeLessThan(
        Math.min(...plain.map((p) => p.y)) - 10,
      );
    }
    // An ellipse not bent is the ellipse (four quarters within 0.03 %).
    const e = warpedOutline(createEllipse({ x: 0, y: 0, width: 100, height: 60 }))[0]!;
    for (const p of e) expect(((p.x - 50) / 50) ** 2 + ((p.y - 30) / 30) ** 2).toBeCloseTo(1, 2);
  });

  it('GV1 bends an arc: open (a line), a pie slice and a chord', () => {
    const e = createEllipse({ x: 0, y: 0, width: 100, height: 100 });
    const open = { ...e, arc: { start: 180, end: 360, close: 'open' as const } };
    const [line] = warpedRings(bent(open));
    expect(line!.closed).toBe(false);
    expect(line!.points[0]).toMatchObject({ x: 0, y: 50 });
    expect(line!.points.at(-1)).toMatchObject({ x: 100, y: 50 });
    const pie = warpedRings({ ...e, arc: { start: 0, end: 90, close: 'pie' } })[0]!;
    expect(pie.closed).toBe(true);
    expect(pie.points).toContainEqual({ x: 50, y: 50 });
    const chord = warpedRings({ ...e, arc: { start: 300, end: 60, close: 'chord' } })[0]!;
    expect(chord.points[0]).toMatchObject({ x: 75, y: 6.7 });
    // Start and end the same: the whole way round.
    const whole = warpedRings({ ...e, arc: { start: 90, end: 90, close: 'chord' } })[0]!;
    expect(whole).toMatchObject({ closed: true });
    expect(whole.points).toHaveLength(4);
  });

  it('bends a path’s curves, its open lines and its holes', () => {
    const p: PathObject = {
      ...createPath(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        true,
      ),
      holes: [
        [
          { x: 40, y: 40 },
          { x: 60, y: 40 },
          { x: 50, y: 60 },
        ],
      ],
    };
    const rings = warpedRings(bent(p));
    expect(rings).toHaveLength(2);
    expect(rings[1]!.closed).toBe(true);
    const curved = createPath(
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      false,
    );
    curved.points[0]!.out = { x: 30, y: 0 };
    const [line] = warpedRings(bent(curved));
    expect(line!.closed).toBe(false);
    expect(line!.points.at(-1)).toMatchObject({ x: 100, y: 0 });
    // A handle only at the far end is a curve too; the outline ends at the line's last point.
    const back = createPath(
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      false,
    );
    back.points[1]!.in = { x: 70, y: 100 };
    expect(warpedRings(back)[0]!.points[1]!.in).toEqual({ x: 70, y: 100 });
    expect(warpedOutline(back)[0]!.at(-1)).toEqual({ x: 100, y: 0 });
    // A line going back on itself keeps its turning point.
    const zigzag = createPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 0 },
      ],
      false,
    );
    expect(warpedRings(zigzag)[0]!.points).toHaveLength(3);
  });
});

describe('GV4 Apply: plain paths that look the same', () => {
  it('keeps the look and the name, its box now round the bent outline', () => {
    const o: AnimObject = {
      ...bent(rect()),
      fill: { kind: 'linear', from: '#ff0000', to: '#0000ff', angle: 90 },
      opacity: 80,
      fillOpacity: 50,
      filters: [{ kind: 'blur', radius: 3 }],
      tracks: [{ property: 'x', keyframes: [] }],
    };
    const a = applyEnvelope(o) as PathObject;
    expect(a).toMatchObject({
      kind: 'path',
      id: o.id,
      name: o.name,
      opacity: 80,
      fillOpacity: 50,
      filters: [{ kind: 'blur', radius: 3 }],
      fill: o.fill,
      stroke: o.stroke,
      closed: true,
      x: 50,
      rotation: 0,
    });
    expect(a.envelope).toBeUndefined();
    expect(a.tracks).toBeUndefined();
    expect(a.pivot).toBeUndefined();
    expect(a.y).toBeCloseTo(-10, 1);
    expect(a.width).toBeCloseTo(200, 1);
    expect(a.height).toBeCloseTo(150, 1);
  });

  it('a turned, flipped and skewed shape stays where it was drawn, turning about the same point', () => {
    const o: AnimObject = {
      ...bent(rect()),
      rotation: 30,
      flipX: true,
      flipY: true,
      skewX: 10,
      skewY: 5,
      pivot: { x: 0.25, y: 1 },
    };
    const a = applyEnvelope(o);
    expect(a).toMatchObject({ rotation: 30, flipX: true, flipY: true, skewX: 10, skewY: 5 });
    // The bent top middle (100, −50 in the old box) is in the same place on the stage.
    const was = toStage(o, { x: 100, y: -50 });
    const now = toStage(a, { x: 100 - (a.x - o.x), y: -50 - (a.y - o.y) });
    expect(now.x).toBeCloseTo(was.x, 1);
    expect(now.y).toBeCloseTo(was.y, 1);
    const b = boundsOf(a);
    const c = boundsOf(o);
    expect(b.width).toBeGreaterThan(0);
    expect(Math.abs(b.x - c.x)).toBeLessThan(3);
  });

  it('an open line stays open and unfilled; a hole stays a hole', () => {
    const line = bent(
      createPath(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        false,
      ),
    );
    const a = applyEnvelope({ ...line, fill: { kind: 'solid', colour: '#ff0000' } }) as PathObject;
    expect(a.closed).toBe(false);
    expect(a.fill).toEqual({ kind: 'none' });
    const holed: PathObject = {
      ...createPath(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        true,
      ),
      holes: [
        [
          { x: 60, y: 20 },
          { x: 80, y: 20 },
          { x: 80, y: 40 },
        ],
      ],
    };
    expect((applyEnvelope(bent(holed)) as PathObject).holes).toHaveLength(1);
  });

  it('a group is bent as one: each part in the group’s box, a part’s own envelope first', () => {
    const left = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const right = { ...createEllipse({ x: 100, y: 0, width: 100, height: 100 }), rotation: 45 };
    const inner = createGroup([createStar({ x: 0, y: 100, width: 100, height: 50 })]);
    const own = bent(createRect({ x: 100, y: 100, width: 100, height: 50 }), {
      kind: 'preset',
      preset: 'bulge',
      bend: 50,
    });
    const g = bent(createGroup([left, right, inner, own]));
    const a = applyEnvelope(g) as GroupObject;
    expect(a.kind).toBe('group');
    expect(a.envelope).toBeUndefined();
    expect(a.children.map((c) => c.kind)).toEqual(['path', 'path', 'group', 'path']);
    expect(a.children.map((c) => c.id)).toEqual([left.id, right.id, inner.id, own.id]);
    expect((a.children[2] as GroupObject).children[0]!.kind).toBe('path');
    // Bent up by half its height in the middle: the box grows upwards.
    expect(a.y).toBeLessThan(g.y - 40);
    expect(a.children.every((c) => c.rotation === 0)).toBe(true);
    expect(warpedRings(g)).toHaveLength(4);
  });

  it('keeps a shape on a frame-by-frame drawing on its drawing; a flat result turns about its middle', () => {
    const o = {
      ...bent(
        createPath(
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          false,
        ),
      ),
      drawing: 12,
    };
    const a = applyEnvelope({ ...o, rotation: 10 });
    expect(a.drawing).toBe(12);
    expect(a.height).toBe(0);
    expect(a.pivot).toEqual({ x: 0.5, y: 0.5 });
  });

  it('a bend of 0 % takes the envelope off and leaves the shape as it is', () => {
    const o = bent(rect(), { kind: 'preset', preset: 'wave', bend: 0 });
    const a = applyEnvelope(o);
    expect(a.kind).toBe('rect');
    expect(a.envelope).toBeUndefined();
  });

  it('says what is wrong when there is nothing to apply, or it cannot be bent', () => {
    expect(() => applyEnvelope(rect())).toThrow(/not bent: choose an envelope first/);
    // GT5 (M20): text can be bent, once its font's outlines are loaded (no fonts are read here).
    expect(() => applyEnvelope(bent(createText('Hi', { x: 0, y: 0 })))).toThrow(
      /fonts that come with OneEditor, in the app/,
    );
    const button = bent(createButton('pause', { x: 0, y: 0 }));
    expect(() => applyEnvelope(button)).toThrow(/^A button cannot/);
  });
});

describe('GV4 what can be bent', () => {
  it('shapes, text (GT5) and groups of them; not pictures or buttons, nor groups holding them', () => {
    expect(whyNotBendable(rect())).toBeNull();
    expect(whyNotBendable(createGroup([rect(), createGroup([rect()])]))).toBeNull();
    expect(whyNotBendable(createText('Hi', { x: 0, y: 0 }))).toBeNull();
    expect(
      whyNotBendable(
        createPicture({ id: 'p1', path: '/a/b.png', width: 10, height: 10 }, { x: 0, y: 0 }),
      ),
    ).toBe('A picture cannot be bent by an envelope: only shapes, text and groups of them can.');
    expect(whyNotBendable(createButton('pause', { x: 0, y: 0 }))).toMatch(/^A button cannot/);
    const deep = {
      ...createGroup([rect(), createGroup([createButton('pause', { x: 0, y: 0 })])]),
      name: 'Logo',
    };
    expect(whyNotBendable(deep)).toBe(
      '“Logo” has a button in it: only groups of shapes and text can be bent by an envelope.',
    );
    expect(whyNotBendable(createGroup([rect(), createText('Hi', { x: 0, y: 0 })]))).toBeNull();
  });

  it('withEnvelope bends, checks and takes the envelope off', () => {
    const o = withEnvelope(rect(), arch);
    expect(o.envelope).toEqual(arch);
    expect(withEnvelope(o, null).envelope).toBeUndefined();
    const plain = rect();
    expect(withEnvelope(plain, null)).toBe(plain);
    expect(() => withEnvelope(createButton('pause', { x: 0, y: 0 }), arch)).toThrow(
      /button cannot/,
    );
    expect(() => withEnvelope(rect(), { ...arch, bend: 120 })).toThrow(/between −100 % and 100 %/);
  });
});

describe('GV4 drawn live', () => {
  it('the stage draws a bent object as its bent paths, made once', () => {
    const o = bent(rect());
    const shown = bentForDrawing(o);
    expect(shown.kind).toBe('path');
    expect(shown.envelope).toBeUndefined();
    expect(bentForDrawing(o)).toBe(shown);
    expect(shown).toEqual(applyEnvelope(o));
  });

  it('anything not bent (or not bendable) is drawn as it is', () => {
    const plain = rect();
    expect(bentForDrawing(plain)).toBe(plain);
    const flat = bent(rect(), { kind: 'preset', preset: 'arch', bend: 0 });
    expect(bentForDrawing(flat)).toBe(flat);
    const text = bent(createText('Hi', { x: 0, y: 0 }));
    expect(bentForDrawing(text)).toBe(text);
  });
});
