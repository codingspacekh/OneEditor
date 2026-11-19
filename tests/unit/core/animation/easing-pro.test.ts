// 2026-11-18 (AN9, professional easing): Overshoot (goes past and settles back), Anticipate
// (pulls back before it goes), Elastic (springs past and back, smaller each time) and a custom
// curve with two handles, as CSS's cubic-bezier and Animate's custom ease. A value that would
// go past what an object can be (opacity over 100 %, a width under 0) stops at that limit.
import { describe, expect, it } from 'vitest';
import { createRect } from '../../../../src/core/animation/factory.ts';
import {
  checkCurve,
  EASINGS,
  ease,
  objectAt,
  setPropertyAt,
  trackOf,
  valueAt,
} from '../../../../src/core/animation/tween.ts';
import type { Track } from '../../../../src/core/animation/types.ts';

const samples = (f: (t: number) => number) => Array.from({ length: 101 }, (_, i) => f(i / 100));

describe('the new easings', () => {
  it('each starts at 0 and ends at 1', () => {
    for (const e of ['back-out', 'back-in', 'elastic'] as const) {
      expect(ease(e, 0)).toBeCloseTo(0, 9);
      expect(ease(e, 1)).toBeCloseTo(1, 9);
    }
  });

  it('Overshoot goes past the end, Anticipate goes back before the start, Elastic does both ways', () => {
    expect(Math.max(...samples((t) => ease('back-out', t)))).toBeGreaterThan(1.05);
    expect(Math.min(...samples((t) => ease('back-out', t)))).toBeGreaterThanOrEqual(0);
    expect(Math.min(...samples((t) => ease('back-in', t)))).toBeLessThan(-0.05);
    const springy = samples((t) => ease('elastic', t));
    expect(Math.max(...springy)).toBeGreaterThan(1.05);
    // It swings back below the end at least once after going past it.
    const past = springy.findIndex((v) => v > 1);
    expect(springy.slice(past).some((v) => v < 1)).toBe(true);
  });

  it('are offered with words a student understands', () => {
    expect(EASINGS.map((e) => e.label)).toEqual([
      'Linear',
      'Ease in',
      'Ease out',
      'Ease in and out',
      'Bounce',
      'Overshoot',
      'Anticipate',
      'Elastic',
      'Custom curve',
    ]);
  });
});

describe('a custom curve', () => {
  it('follows the two handles as CSS cubic-bezier does', () => {
    // CSS "ease-in-out" is symmetrical: halfway in time is halfway in value.
    expect(ease('custom', 0.5, [0.42, 0, 0.58, 1])).toBeCloseTo(0.5, 5);
    // Handles on the straight line: linear.
    for (const t of [0.1, 0.3, 0.77])
      expect(ease('custom', t, [0.3, 0.3, 0.7, 0.7])).toBeCloseTo(t, 4);
    // CSS "ease" (0.25, 0.1, 0.25, 1) at a quarter of the time is about 0.4085 of the way.
    expect(ease('custom', 0.25, [0.25, 0.1, 0.25, 1])).toBeCloseTo(0.4085, 3);
    // A handle above 1 overshoots.
    expect(Math.max(...samples((t) => ease('custom', t, [0.3, 1.6, 0.6, 1])))).toBeGreaterThan(
      1.05,
    );
    // Without a curve, custom is linear.
    expect(ease('custom', 0.3)).toBeCloseTo(0.3, 9);
  });

  it('is read from the keyframe the tween starts at', () => {
    const track: Track = {
      property: 'x',
      keyframes: [
        { frame: 0, value: 0, easing: 'custom', curve: [0.42, 0, 0.58, 1], hold: false },
        { frame: 10, value: 100, easing: 'linear', hold: false },
      ],
    };
    expect(valueAt(track, 5)).toBeCloseTo(50, 3);
    expect(valueAt(track, 2) as number).toBeLessThan(20);
  });

  it('refuses handles outside 0–1 across, or far above or below', () => {
    expect(() => checkCurve([-0.1, 0, 0.5, 1])).toThrow(/across/i);
    expect(() => checkCurve([0.2, 0, 1.2, 1])).toThrow(/across/i);
    expect(() => checkCurve([0.2, -3, 0.5, 1])).toThrow(/between/i);
    expect(() => checkCurve([0.2, 0.1, 0.5, 1])).not.toThrow();
  });
});

describe('a value eased past what an object can be', () => {
  it('stops at the limit: opacity at 100 %, a width at 0', () => {
    let rect = createRect({ x: 0, y: 0, width: 50, height: 50 });
    rect = setPropertyAt(rect, 'opacity', 0, 40);
    rect = setPropertyAt(rect, 'opacity', 10, 100);
    rect = setPropertyAt(rect, 'width', 10, 2);
    const keyed = (p: 'opacity' | 'width') => trackOf(rect, p)!;
    rect = {
      ...rect,
      tracks: rect.tracks!.map((t) => ({
        ...t,
        keyframes: t.keyframes.map((k) =>
          k.frame === 0 ? { ...k, easing: 'back-out' as const } : k,
        ),
      })),
    };
    expect(keyed('opacity')).toBeDefined();
    const opacities = Array.from({ length: 11 }, (_, f) => objectAt(rect, f).opacity);
    expect(Math.max(...opacities)).toBe(100);
    const widths = Array.from({ length: 11 }, (_, f) => objectAt(rect, f).width);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(0);
  });
});
