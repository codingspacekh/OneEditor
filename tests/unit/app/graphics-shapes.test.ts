// M19 step 2 (GV1, GV2, G4) in the app: the Arc, Spiral and Polyline tools, Convert to curves,
// Step and repeat (J/23 spokes, M/26 chip legs), Mirror copy, Duplicate repeating the last move,
// Paste in place, and Exclude / Combine / Join; each one undo step, in Graphics and Animation modes.
import { describe, expect, it } from 'vitest';
import { findObject } from '../../../src/core/animation/layers.ts';
import { isSpiralOf } from '../../../src/core/graphics/shapes.ts';
import type { AnimObject, PathObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';

function setup(mode: 'graphics' | 'animation' = 'graphics') {
  const t = testApp();
  const g = mode === 'graphics' ? t.app.graphics : t.app.animation;
  const doc = () => g.store.get().history.present;
  const objects = () => doc().layers.flatMap((l) => l.objects);
  const last = (): AnimObject => objects().at(-1)!;
  const byId = (id: string) => findObject(doc(), id)!.object;
  const message = () => g.store.get().message?.text ?? '';
  return { ...t, g, doc, objects, last, byId, message };
}

describe('GV1: the Arc tool', () => {
  it('drags out the top half of an ellipse as a line, selected, the tool back to Select', () => {
    const s = setup();
    s.g.setTool('arc');
    s.g.addShape('arc', { x: 100, y: 100, width: 200, height: 200 });
    expect(s.last()).toMatchObject({
      kind: 'ellipse',
      name: 'Arc',
      arc: { start: 180, end: 360, close: 'open' },
    });
    expect(s.g.store.get()).toMatchObject({ selection: [s.last().id], tool: 'select' });
  });

  it('J/20: becomes the meter’s 180° gauge, a pie slice or whole again in Properties', () => {
    const s = setup();
    s.g.addShape('arc', { x: 0, y: 0, width: 200, height: 200 });
    expect(
      s.g.setProperties({ arc: { start: 180, end: 360, close: 'pie' } } as Partial<AnimObject>),
    ).toBeNull();
    expect(s.last()).toMatchObject({ arc: { close: 'pie' } });
    expect(s.g.setProperties({ arc: undefined } as Partial<AnimObject>)).toBeNull();
    expect('arc' in s.last() && (s.last() as { arc?: unknown }).arc).toBeFalsy();
    expect(
      s.g.setProperties({
        arc: { start: Number.NaN, end: 1, close: 'pie' },
      } as Partial<AnimObject>),
    ).toMatch(/numbers of degrees/);
  });
});

describe('GV1: the Spiral tool', () => {
  it('draws 3 even turns at first, then as its options say', () => {
    const s = setup();
    expect(s.g.spiralOptions()).toEqual({ turns: 3, inner: 0, growth: 'even' });
    s.g.addShape('spiral', { x: 0, y: 0, width: 100, height: 100 });
    expect((s.last() as PathObject).points).toHaveLength(13);
    s.g.select([]);
    expect(s.g.setSpiralOptions({ turns: 5 })).toBeNull();
    s.g.addShape('spiral', { x: 200, y: 0, width: 100, height: 100 });
    expect((s.last() as PathObject).points).toHaveLength(21);
    expect(s.g.spiralOptions().turns).toBe(5);
  });

  it('draws the spiral just made again with new options, one undo step', () => {
    const s = setup();
    s.g.addShape('spiral', { x: 0, y: 0, width: 100, height: 100 });
    const id = s.last().id;
    expect(s.g.setSpiralOptions({ turns: 2, inner: 20, growth: 'opening' })).toBeNull();
    const spiral = s.byId(id) as PathObject;
    expect(spiral.points).toHaveLength(9);
    expect(isSpiralOf(spiral, { turns: 2, inner: 20, growth: 'opening' })).toBe(true);
    s.g.undo();
    expect((s.byId(id) as PathObject).points).toHaveLength(13);
  });

  it('leaves a spiral whose points were changed, and refuses options it cannot draw', () => {
    const s = setup();
    s.g.addShape('spiral', { x: 0, y: 0, width: 100, height: 100 });
    const id = s.last().id;
    s.g.editPath(id, 'Move point', (p) => ({
      ...p,
      points: p.points.toSpliced(0, 1, { x: 9, y: 9 }),
    }));
    expect(s.g.setSpiralOptions({ turns: 6 })).toBeNull();
    expect((s.byId(id) as PathObject).points).toHaveLength(13);
    expect(s.g.setSpiralOptions({ turns: 0 })).toMatch(/turns for the spiral/);
    expect(s.g.spiralOptions().turns).toBe(6);
  });

  it('says why when the spiral’s layer is locked', () => {
    const s = setup();
    s.g.addShape('spiral', { x: 0, y: 0, width: 100, height: 100 });
    const id = s.last().id;
    s.g.toggleLayer(s.doc().layers[0]!.id, 'locked');
    s.g.select([id]);
    expect(s.g.setSpiralOptions({ turns: 4 })).toMatch(/locked/);
    expect(s.g.spiralOptions().turns).toBe(3);
  });
});

describe('GV1: the Polyline tool', () => {
  it('makes straight lines through the clicked points; closed when the first is clicked', () => {
    const s = setup();
    s.g.addPolyline(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 80 },
      ],
      true,
    );
    expect(s.last()).toMatchObject({ kind: 'path', name: 'Polyline', closed: true });
    expect((s.last() as PathObject).points).toHaveLength(3);
  });

  it('says why a closed one needs three points', () => {
    const s = setup();
    s.g.addPolyline(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      true,
    );
    expect(s.objects()).toHaveLength(0);
    expect(s.message()).toMatch(/three points/);
  });
});

describe('GV2: Convert to curves', () => {
  it('makes the selected shapes pen paths in one undo step, still selected', () => {
    const s = setup();
    s.g.addShape('star', { x: 0, y: 0, width: 100, height: 100 });
    const star = s.last().id;
    s.g.addShape('ellipse', { x: 200, y: 0, width: 100, height: 50 });
    const ellipse = s.last().id;
    s.g.select([star, ellipse]);
    expect(s.g.convertToCurves()).toBeNull();
    expect(s.objects().map((o) => o.kind)).toEqual(['path', 'path']);
    expect(s.g.store.get().selection).toEqual([star, ellipse]);
    s.g.undo();
    expect(s.objects().map((o) => o.kind)).toEqual(['star', 'ellipse']);
  });

  it('says text needs its font’s outlines, read in the app (GT4: text-curves-gt4.test.ts)', () => {
    const s = setup();
    s.g.addText({ x: 0, y: 0 }, 'Logo');
    expect(s.g.convertToCurves()).toMatch(/fonts that come with OneEditor, in the app/);
    s.g.select([]);
    expect(s.g.convertToCurves()).toMatch(/Select the shapes/);
  });
});

describe('GV2: Step and repeat', () => {
  it('J/23: 11 spokes turned 30° about the hub, all selected, in one undo step', () => {
    const s = setup();
    s.g.addShape('rect', { x: 295, y: 200, width: 10, height: 100 });
    expect(
      s.g.stepAndRepeat({ copies: 11, dx: 0, dy: 0, angle: 30, about: { x: 300, y: 300 } }),
    ).toBeNull();
    expect(s.objects()).toHaveLength(12);
    expect(s.g.store.get().selection).toHaveLength(11);
    expect(s.objects().map((o) => Math.round(o.rotation))).toEqual(
      Array.from({ length: 12 }, (_, i) => i * 30),
    );
    s.g.undo();
    expect(s.objects()).toHaveLength(1);
  });

  it('M/26: the chip’s legs evenly spaced; says why when it cannot', () => {
    const s = setup();
    s.g.addShape('rect', { x: 20, y: 200, width: 10, height: 30 });
    expect(
      s.g.stepAndRepeat({ copies: 4, dx: 40, dy: 0, angle: 0, about: 'selection' }),
    ).toBeNull();
    expect(s.objects().map((o) => o.x)).toEqual([20, 60, 100, 140, 180]);
    expect(s.g.stepAndRepeat({ copies: 2, dx: 0, dy: 0, angle: 0, about: 'selection' })).toMatch(
      /sit on the one before/,
    );
    s.g.select([]);
    expect(s.g.stepAndRepeat({ copies: 2, dx: 5, dy: 0, angle: 0, about: 'selection' })).toMatch(
      /Select the objects/,
    );
  });
});

describe('GV2: Mirror copy', () => {
  it('puts a flipped copy beside the selection, selected; over it on request', () => {
    const s = setup();
    s.g.addShape('rect', { x: 10, y: 10, width: 40, height: 20 });
    expect(s.g.mirrorCopy('horizontal')).toBeNull();
    expect(s.last()).toMatchObject({ x: 50, y: 10, flipX: true });
    expect(s.g.store.get().selection).toEqual([s.last().id]);
    expect(s.g.mirrorCopy('vertical', 'over')).toBeNull();
    expect(s.last()).toMatchObject({ x: 50, y: 10, flipX: true, flipY: true });
    s.g.select([]);
    expect(s.g.mirrorCopy('vertical')).toMatch(/Select the objects to mirror/);
  });
});

describe('GV2: Duplicate repeats the last move ("duplicate twice and arrange")', () => {
  it('copies 10 px away, then, once the copy is moved, each next copy as far again', () => {
    const s = setup();
    s.g.addShape('ellipse', { x: 0, y: 0, width: 20, height: 20 });
    s.g.duplicate();
    expect(s.last()).toMatchObject({ x: 10, y: 10 });
    s.g.moveSelection(40, -10); // the copy now 50 px right of the first
    s.g.duplicate();
    expect(s.last()).toMatchObject({ x: 100, y: 0 });
    s.g.duplicate();
    expect(s.last()).toMatchObject({ x: 150, y: 0 });
    expect(s.objects()).toHaveLength(4);
  });

  it('goes back to 10 px when something else is selected, or the original has gone', () => {
    const s = setup();
    const selected = () => s.byId(s.g.store.get().selection[0]!);
    s.g.addShape('rect', { x: 0, y: 0, width: 20, height: 20 });
    const first = s.last().id;
    s.g.duplicate();
    s.g.moveSelection(90, 0);
    s.g.select([first]);
    s.g.duplicate();
    expect(selected()).toMatchObject({ x: 10, y: 10 });
    const copy = selected().id;
    s.g.select([first]);
    s.g.deleteSelection();
    s.g.select([copy]);
    s.g.duplicate();
    expect(selected()).toMatchObject({ x: 20, y: 20 });
    s.g.select([]);
    s.g.duplicate();
    expect(s.objects()).toHaveLength(3);
  });
});

describe('GV2: Paste in place', () => {
  it('pastes the copies where they were copied from (Paste puts them 10 px away)', () => {
    const s = setup();
    s.g.addShape('star', { x: 30, y: 40, width: 50, height: 50 });
    s.g.copy();
    s.g.pasteInPlace();
    expect(s.last()).toMatchObject({ x: 30, y: 40 });
    expect(s.g.store.get().selection).toEqual([s.last().id]);
    expect(s.doc().layers[0]!.objects).toHaveLength(2);
    s.g.paste();
    expect(s.last()).toMatchObject({ x: 40, y: 50 });
  });

  it('does nothing with nothing copied', () => {
    const s = setup();
    const before = s.doc();
    s.app.animation.copy(); // the clipboard is shared: nothing selected, nothing copied
    s.g.pasteInPlace();
    expect(s.doc()).toBe(before);
  });
});

describe('G4: Exclude, Combine and Join in the app', () => {
  it('combines the selected shapes into one path with holes, one undo step', () => {
    const s = setup();
    s.g.addShape('ellipse', { x: 0, y: 0, width: 200, height: 200 });
    const outer = s.last().id;
    s.g.addShape('ellipse', { x: 50, y: 50, width: 100, height: 100 });
    s.g.select([outer, s.last().id]);
    expect(s.g.combine('combine')).toBeNull();
    expect(s.objects()).toHaveLength(1);
    expect((s.last() as PathObject).holes).toHaveLength(1);
    expect(s.g.store.get().selection).toEqual([s.last().id]);
    s.g.undo();
    expect(s.objects()).toHaveLength(2);
  });

  it('excludes the overlap, and joins two lines', () => {
    const s = setup();
    s.g.addShape('rect', { x: 0, y: 0, width: 100, height: 100 });
    const a = s.last().id;
    s.g.addShape('rect', { x: 50, y: 50, width: 100, height: 100 });
    s.g.select([a, s.last().id]);
    expect(s.g.combine('exclude')).toBeNull();
    expect(s.objects().every((o) => o.kind === 'path')).toBe(true);
    s.g.addLine({ x: 0, y: 300 }, { x: 100, y: 300 });
    const line = s.last().id;
    s.g.addLine({ x: 100, y: 300 }, { x: 100, y: 400 });
    s.g.select([line, s.last().id]);
    expect(s.g.combine('join')).toBeNull();
    expect((s.last() as PathObject).points).toHaveLength(3);
    s.g.select([s.last().id]);
    expect(s.g.combine('join')).toMatch(/two open lines/);
  });
});

describe('the vector toolkit in Animation mode too', () => {
  it('draws an arc and a spiral, and steps and repeats', () => {
    const s = setup('animation');
    s.g.addShape('arc', { x: 0, y: 0, width: 100, height: 100 });
    s.g.addShape('spiral', { x: 200, y: 0, width: 100, height: 100 });
    expect(s.objects().map((o) => o.name)).toEqual(['Arc', 'Spiral']);
    expect(s.g.stepAndRepeat({ copies: 2, dx: 0, dy: 120, angle: 0, about: 'canvas' })).toBeNull();
    expect(s.objects()).toHaveLength(4);
  });
});
