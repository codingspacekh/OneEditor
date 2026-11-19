// 2026-11-18 (AN9, AN11, as Animate's Copy Motion / Paste Motion): an object's animation — its
// keyframes and paths — copied onto other objects, from where each one is: positions and paths
// are moved by the difference, widths and heights scaled by it, the rest (turn, opacity,
// colours) copied as they are; only what the other object can have is pasted.
import { describe, expect, it } from 'vitest';
import {
  createEllipse,
  createPath,
  createRect,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { copyMotion, pasteMotion } from '../../../../src/core/animation/copy-motion.ts';
import { motionFrom, withPaths } from '../../../../src/core/animation/motion.ts';
import { setPropertyAt, trackOf } from '../../../../src/core/animation/tween.ts';

const frames = (o: Parameters<typeof trackOf>[0], p: Parameters<typeof trackOf>[1]) =>
  trackOf(o, p)?.keyframes.map((k) => [k.frame, k.value]);

function mover() {
  let rect = createRect({ x: 0, y: 0, width: 100, height: 50 });
  rect = setPropertyAt(rect, 'x', 24, 300);
  rect = setPropertyAt(rect, 'width', 24, 200);
  rect = setPropertyAt(rect, 'opacity', 24, 0);
  rect = setPropertyAt(rect, 'radius', 24, 20);
  return rect;
}

describe('copy and paste motion', () => {
  it('moves the position keyframes to where the other object is, scales sizes, copies the rest', () => {
    const motion = copyMotion(mover());
    const ball = pasteMotion(createEllipse({ x: 500, y: 200, width: 50, height: 25 }), motion);
    expect(frames(ball, 'x')).toEqual([
      [0, 500],
      [24, 800],
    ]);
    expect(frames(ball, 'width')).toEqual([
      [0, 50],
      [24, 100],
    ]);
    expect(frames(ball, 'opacity')).toEqual([
      [0, 100],
      [24, 0],
    ]);
    // An ellipse has no corner radius: not pasted. No Y keyframes were copied: none made.
    expect(trackOf(ball, 'radius')).toBeUndefined();
    expect(trackOf(ball, 'y')).toBeUndefined();
    expect(ball).toMatchObject({ x: 500, y: 200, width: 50 });
  });

  it('a path is moved to start from the other object; its settings are kept', () => {
    const road = createPath(
      [
        { x: 50, y: 25 },
        { x: 350, y: 25 },
      ],
      false,
    );
    const car = withPaths(createRect({ x: 0, y: 0, width: 100, height: 50 }), [
      motionFrom(road, { from: 0, to: 48, orient: true, reverse: true }),
    ]);
    const other = pasteMotion(createRect({ x: 0, y: 300, width: 40, height: 40 }), copyMotion(car));
    expect(other.paths).toHaveLength(1);
    expect(other.paths![0]).toMatchObject({ from: 0, to: 48, orient: true, reverse: true });
    // The car's point of turn is at the path's end (reversed) at frame 0: (350, 25); the other's
    // is at (20, 320): the path is moved by (−330, 295).
    expect(other.paths![0]!.points.map((p) => [p.x, p.y])).toEqual([
      [-280, 320],
      [20, 320],
    ]);
  });

  it('replaces the other object’s keyframes for the same properties, keeps the rest', () => {
    let target = createRect({ x: 10, y: 10, width: 100, height: 50 });
    target = setPropertyAt(target, 'x', 10, 99);
    target = setPropertyAt(target, 'rotation', 10, 90);
    const pasted = pasteMotion(target, copyMotion(mover()));
    expect(frames(pasted, 'x')).toEqual([
      [0, 10],
      [24, 310],
    ]);
    expect(frames(pasted, 'rotation')).toEqual([
      [0, 0],
      [10, 90],
    ]);
  });

  it('a still object has no motion to copy; words and shapes are not copied', () => {
    expect(() => copyMotion(createRect({ x: 0, y: 0 }))).toThrow(/no motion/i);
    let words = createText('Hi', { x: 0, y: 0 });
    words = setPropertyAt(words, 'text', 10, 'Bye');
    expect(() => copyMotion(words)).toThrow(/no motion/i);
  });
});
