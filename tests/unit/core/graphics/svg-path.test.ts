// GV6 (M19): an SVG's transforms and path data — every command, relative and absolute, implicit
// repeats, arcs and quadratics as cubic curves.
import { describe, expect, it } from 'vitest';
import {
  apply,
  arcCubics,
  invert,
  multiply,
  numbersIn,
  parsePathData,
  parseTransform,
  scaleOf,
  type ArcSeg,
  type Matrix,
} from '../../../../src/core/graphics/svg-path.ts';

const close = (m: Matrix, want: number[]) =>
  m.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 6));

describe('GV6: transforms', () => {
  it('reads each kind and composes them left to right', () => {
    close(parseTransform('translate(10 20)'), [1, 0, 0, 1, 10, 20]);
    close(parseTransform('translate(5)'), [1, 0, 0, 1, 5, 0]);
    close(parseTransform('scale(2)'), [2, 0, 0, 2, 0, 0]);
    close(parseTransform('scale(2,3)'), [2, 0, 0, 3, 0, 0]);
    close(parseTransform('matrix(1,0,0,1,-390.064,-363.651)'), [1, 0, 0, 1, -390.064, -363.651]);
    close(parseTransform('rotate(90)'), [0, 1, -1, 0, 0, 0]);
    close(parseTransform('skewX(45)'), [1, 0, 1, 1, 0, 0]);
    close(parseTransform('skewY(45)'), [1, 1, 0, 1, 0, 0]);
    // Turned about (10, 0): that point stays put.
    const p = apply(parseTransform('rotate(90 10 0)'), { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0);
    // "translate then scale": the scale happens first.
    close(parseTransform('translate(10,0) scale(2)'), [2, 0, 0, 2, 10, 0]);
  });

  it('leaves out what it cannot read', () => {
    close(parseTransform(undefined), [1, 0, 0, 1, 0, 0]);
    close(
      parseTransform('wobble(3) matrix(1 2) translate() scale() rotate() skewX() skewY()'),
      [1, 0, 0, 1, 0, 0],
    );
  });

  it('inverts, multiplies and measures scale', () => {
    const m: Matrix = [2, 0, 0, 3, 4, 5];
    close(multiply(m, invert(m)!), [1, 0, 0, 1, 0, 0]);
    expect(invert([1, 2, 2, 4, 0, 0])).toBeNull();
    expect(scaleOf([2, 0, 0, 8, 0, 0])).toBe(4);
  });

  it('reads numbers written tightly', () => {
    expect(numbersIn('1,2 -3.5.5e1-4')).toEqual([1, 2, -3.5, 5, -4]);
  });
});

describe('GV6: path data', () => {
  it('reads absolute and relative lines, H and V, Z and a second outline', () => {
    const [a, b] = parsePathData('M10 10 L20 10 h5 v5 H10 V12 z m5 5 l1 1');
    expect(a!.start).toEqual({ x: 10, y: 10 });
    expect(a!.segs.map((s) => s.to)).toEqual([
      { x: 20, y: 10 },
      { x: 25, y: 10 },
      { x: 25, y: 15 },
      { x: 10, y: 15 },
      { x: 10, y: 12 },
    ]);
    expect(a!.closed).toBe(true);
    // After Z the pen is back at the start: m is from there.
    expect(b!.start).toEqual({ x: 15, y: 15 });
    expect(b!.segs[0]!.to).toEqual({ x: 16, y: 16 });
    expect(b!.closed).toBe(false);
  });

  it('repeats a command for more numbers; pairs after M are lines', () => {
    const [s] = parsePathData('M0,0 10,0 10,10 m0 0 1 1');
    expect(s!.segs).toEqual([
      { kind: 'L', to: { x: 10, y: 0 } },
      { kind: 'L', to: { x: 10, y: 10 } },
    ]);
    const all = parsePathData('M0 0 10 0 10 10 m0 0 1 1');
    expect(all[1]!.segs[0]).toEqual({ kind: 'L', to: { x: 11, y: 11 } });
  });

  it('reads cubic curves and S reflecting the last handle', () => {
    const [s] = parsePathData('M0 0C0 10 10 10 10 0s10 -10 10 0S30 10 30 0');
    expect(s!.segs[0]).toEqual({
      kind: 'C',
      c1: { x: 0, y: 10 },
      c2: { x: 10, y: 10 },
      to: { x: 10, y: 0 },
    });
    expect(s!.segs[1]).toMatchObject({
      c1: { x: 10, y: -10 },
      c2: { x: 20, y: -10 },
      to: { x: 20, y: 0 },
    });
    expect(s!.segs[2]).toMatchObject({ c1: { x: 20, y: 10 } });
    // S after a line starts its handle at the point.
    const [t] = parsePathData('M0 0L5 0S10 5 10 0');
    expect(t!.segs[1]).toMatchObject({ c1: { x: 5, y: 0 } });
  });

  it('turns quadratics into cubics, T reflecting the last control point', () => {
    const [s] = parsePathData('M0 0Q15 15 30 0T60 0t30 0');
    expect(s!.segs[0]).toMatchObject({
      c1: { x: 10, y: 10 },
      c2: { x: 20, y: 10 },
      to: { x: 30, y: 0 },
    });
    // T reflects (15, 15) about (30, 0): (45, −15).
    expect(s!.segs[1]).toMatchObject({ c1: { x: 40, y: -10 }, c2: { x: 50, y: -10 } });
    const [t] = parsePathData('M0 0L10 0T20 0q5 5 10 0');
    // T after a line: its control point is the point itself (a straight piece).
    expect(t!.segs[1]).toMatchObject({ c1: { x: 10, y: 0 }, to: { x: 20, y: 0 } });
    expect(t!.segs[2]).toMatchObject({ to: { x: 30, y: 0 } });
  });

  it('reads arcs, with flags written without spaces, and finds their centre', () => {
    const [s] = parsePathData('M0 0a10 10 0 0110 10A10 10 0 1 1 20 0');
    const a = s!.segs[0] as ArcSeg;
    expect(a.kind).toBe('A');
    expect(a.centre.x).toBeCloseTo(0);
    expect(a.centre.y).toBeCloseTo(10);
    expect(a.sweep).toBeCloseTo(Math.PI / 2);
    const b = s!.segs[1] as ArcSeg;
    expect(b.to).toEqual({ x: 20, y: 0 });
  });

  it('scales radii too small to reach, draws a 0 radius as a line and skips an arc to itself', () => {
    const [s] = parsePathData('M0 0A1 1 0 0 1 20 0A0 5 0 0 1 30 0A5 5 0 0 1 30 0');
    const a = s!.segs[0] as ArcSeg;
    expect(a.rx).toBeCloseTo(10);
    expect(a.centre.x).toBeCloseTo(10);
    expect(s!.segs[1]).toEqual({ kind: 'L', to: { x: 30, y: 0 } });
    expect(s!.segs).toHaveLength(2);
    // Counter-clockwise (sweep 0) goes the other way round.
    const [t] = parsePathData('M0 0A10 10 0 0 0 20 0');
    expect((t!.segs[0] as ArcSeg).sweep).toBeCloseTo(-Math.PI);
  });

  it('stops at the first thing it cannot read, keeping what came before', () => {
    expect(parsePathData('M0 0L10 0L')[0]!.segs).toHaveLength(1);
    expect(parsePathData('M0 0L10 0 # L20 0')[0]!.segs).toHaveLength(1);
    expect(parsePathData('10 10')).toEqual([]);
    expect(parsePathData('M')).toEqual([]);
    expect(parsePathData('M0 0H')[0]!.segs).toEqual([]);
    expect(parsePathData('M0 0V')[0]!.segs).toEqual([]);
    expect(parsePathData('M0 0C1 1')[0]!.segs).toEqual([]);
    expect(parsePathData('M0 0S1 1')[0]!.segs).toEqual([]);
    expect(parsePathData('M0 0Q1 1')[0]!.segs).toEqual([]);
    expect(parsePathData('M0 0T')[0]!.segs).toEqual([]);
    expect(parsePathData('M0 0A1 1 0 2 0 5 5')[0]!.segs).toEqual([]);
    expect(parsePathData('M0 0Z 5 5')[0]!.closed).toBe(true);
    // A line after Z starts a new outline where the last began.
    const [, b] = parsePathData('M3 3L5 5ZL9 9');
    expect(b!.start).toEqual({ x: 3, y: 3 });
  });
});

describe('GV6: arcs as cubic curves', () => {
  it('a half circle is two quarter curves through its points', () => {
    const [s] = parsePathData('M0 0A10 10 0 0 1 20 0');
    const cubics = arcCubics(s!.segs[0] as ArcSeg);
    expect(cubics).toHaveLength(2);
    expect(cubics[0]!.to.x).toBeCloseTo(10);
    expect(cubics[0]!.to.y).toBeCloseTo(-10);
    expect(cubics[1]!.to).toEqual({ x: 20, y: 0 });
    // The handle of a quarter circle: 0.5523 of the radius.
    expect(cubics[0]!.c1.y).toBeCloseTo(-5.523, 2);
  });
});
