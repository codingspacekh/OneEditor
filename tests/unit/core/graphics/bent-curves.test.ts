// GV4 with GV2 and G4 (M19): a shape bent by an envelope is converted to curves, combined and
// cut as it is drawn — bent — not as its box was before the bend.
import { describe, expect, it } from 'vitest';
import { combineShapes } from '../../../../src/core/animation/combine.ts';
import { createRect } from '../../../../src/core/animation/factory.ts';
import { boundsOf } from '../../../../src/core/animation/geometry.ts';
import type { AnimObject } from '../../../../src/core/animation/types.ts';
import { toCurves } from '../../../../src/core/graphics/curves.ts';
import { applyEnvelope } from '../../../../src/core/graphics/warp.ts';

const arched = (): AnimObject => ({
  ...createRect({ x: 0, y: 100, width: 200, height: 50 }),
  envelope: { kind: 'preset', preset: 'arch', bend: 60 },
});

describe('GV4: bent shapes in Convert to curves and Combine', () => {
  it('Convert to curves keeps the bend (as Apply does) and leaves no envelope', () => {
    const o = arched();
    const curved = toCurves(o);
    expect(curved.kind).toBe('path');
    expect(curved.envelope).toBeUndefined();
    expect(curved).toEqual(toCurves(applyEnvelope(o)));
    // An arch lifts the middle: the bent shape reaches higher than the box did.
    expect(boundsOf(curved).y).toBeLessThan(100);
  });

  it('Union of a bent shape follows the bend', () => {
    const [u] = combineShapes(
      [arched(), createRect({ x: 0, y: 140, width: 10, height: 10 })],
      'union',
    );
    expect(boundsOf(u!).y).toBeLessThan(100);
  });
});
