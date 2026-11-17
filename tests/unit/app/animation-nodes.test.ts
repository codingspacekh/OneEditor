// M19 / GV3 in the app: the nodes chosen on the selected pen path, and the node tool's edits —
// types, segments, moving (arrow keys too), typed X / Y, align and distribute, simplify, break,
// join, close / open, reverse and delete — each one undo step, in Graphics and Animation modes.
import { describe, expect, it } from 'vitest';
import { anchorsOnStage } from '../../../src/core/animation/pen.ts';
import type { AnimObject, PathObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';

function setup(mode: 'graphics' | 'animation' = 'graphics') {
  const t = testApp();
  const g = mode === 'graphics' ? t.app.graphics : t.app.animation;
  const doc = () => g.store.get().history.present;
  const objects = (): AnimObject[] => doc().layers.flatMap((l) => l.objects);
  const path = () => objects().at(-1) as PathObject;
  const xy = (p: PathObject = path()) =>
    anchorsOnStage(p).map((a) => [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100]);
  const label = () => g.store.get().history.past.at(-1)?.label;
  const message = () => g.store.get().message?.text ?? '';
  g.addPath(
    [
      { x: 100, y: 100 },
      { x: 200, y: 200 },
      { x: 300, y: 100 },
    ],
    false,
  );
  return { ...t, g, doc, objects, path, xy, label, message };
}

describe('GV3: choosing nodes', () => {
  it('nodes are chosen on the one selected path; Shift adds or takes one away', () => {
    const s = setup();
    expect(s.g.chosenNodes()).toEqual([]);
    s.g.chooseNodes([1]);
    expect(s.g.chosenNodes()).toEqual([1]);
    s.g.chooseNodes([2, 0], true);
    expect(s.g.chosenNodes()).toEqual([0, 1, 2]);
    s.g.chooseNodes([1], true);
    expect(s.g.chosenNodes()).toEqual([0, 2]);
  });

  it('a new selection forgets them, as does another tool or a node no longer there', () => {
    const s = setup();
    const id = s.path().id;
    s.g.chooseNodes([2]);
    s.g.setTool('pen');
    expect(s.g.chosenNodes()).toEqual([]);
    s.g.setTool('select');
    expect(s.g.chosenNodes()).toEqual([2]);
    s.g.select([id]);
    expect(s.g.chosenNodes()).toEqual([]);
    s.g.chooseNodes([2]);
    s.g.deleteNodes();
    s.g.undo();
    s.g.chooseNodes([2]);
    s.g.editPath(id, 'Remove point', (p) => ({ ...p, points: p.points.slice(0, 2) }));
    expect(s.g.chosenNodes()).toEqual([]);
  });

  it('nothing is chosen without a single pen path selected', () => {
    const s = setup();
    s.g.addShape('rect', { x: 0, y: 0, width: 10, height: 10 });
    s.g.chooseNodes([0]);
    expect(s.g.chosenNodes()).toEqual([]);
    s.g.setNodeType('smooth');
    expect(s.message()).toMatch(/Choose a pen path/);
  });
});

describe('GV3: the node tool’s edits, one undo step each', () => {
  it('node types: smooth, symmetrical and cusp', () => {
    const s = setup();
    s.g.chooseNodes([1]);
    s.g.setNodeType('smooth');
    expect(s.label()).toBe('Smooth node');
    expect(s.path().points[1]).toMatchObject({ type: 'smooth' });
    s.g.setNodeType('symmetrical');
    expect(s.label()).toBe('Symmetrical node');
    s.g.setNodeType('cusp');
    expect(s.label()).toBe('Cusp node');
    s.g.undo();
    expect(s.path().points[1]!.type).toBe('symmetrical');
  });

  it('a node with nothing chosen is asked for', () => {
    const s = setup();
    s.g.setNodeType('smooth');
    expect(s.message()).toMatch(/Choose a node/);
  });

  it('segment to curve and back to line', () => {
    const s = setup();
    s.g.chooseNodes([0]);
    s.g.segmentsTo('curve');
    expect(s.label()).toBe('Segment to curve');
    expect(s.path().points[0]!.out).toBeDefined();
    s.g.segmentsTo('line');
    expect(s.label()).toBe('Segment to line');
    expect(s.path().points[0]!.out).toBeUndefined();
  });

  it('the chosen nodes move by a drag or the arrow keys; with none chosen the path moves', () => {
    const s = setup();
    s.g.chooseNodes([0, 1]);
    s.g.moveNodes(10, 0);
    expect(s.label()).toBe('Move nodes');
    s.g.nudge(0, 10);
    expect(s.xy()).toEqual([
      [110, 110],
      [210, 210],
      [300, 100],
    ]);
    s.g.moveNodes(0, 0); // no move, no step
    expect(s.g.store.get().history.past).toHaveLength(3);
    s.g.select([s.path().id]);
    s.g.nudge(1, 0);
    expect(s.xy()[2]).toEqual([301, 100]);
  });

  it('a chosen node is placed at a typed X / Y (stage px); a bad number is explained', () => {
    const s = setup();
    s.g.chooseNodes([1]);
    expect(s.g.placeNode({ x: 250 })).toBeNull();
    expect(s.label()).toBe('Move node');
    expect(s.xy()[1]).toEqual([250, 200]);
    expect(s.g.placeNode({ y: Number.NaN })).toMatch(/number/);
    s.g.chooseNodes([0, 1]);
    expect(s.g.placeNode({ x: 5 })).toMatch(/one node/);
  });

  it('align and distribute the chosen nodes', () => {
    const s = setup();
    s.g.chooseNodes([0, 1, 2]);
    s.g.alignNodes('top');
    expect(s.label()).toBe('Align nodes');
    expect(s.xy().map((a) => a[1])).toEqual([100, 100, 100]);
    s.g.undo(); // Undo makes a new selection: the nodes are chosen again
    expect(s.g.chosenNodes()).toEqual([]);
    s.g.chooseNodes([0, 1, 2]);
    s.g.distributeNodes('vertical');
    expect(s.label()).toBe('Distribute nodes');
    s.g.chooseNodes([0]);
    s.g.alignNodes('left');
    expect(s.message()).toMatch(/two or more/);
  });

  it('simplify: fewer nodes; a bad tolerance is explained', () => {
    const s = setup();
    s.g.addPath(
      Array.from({ length: 50 }, (_, i) => ({ x: i * 4, y: 100 + 20 * Math.sin(i / 8) })),
      false,
    );
    s.g.chooseNodes([3]);
    expect(s.g.simplifyPath(1)).toBeNull();
    expect(s.label()).toBe('Simplify');
    expect(s.path().points.length).toBeLessThan(10);
    expect(s.g.chosenNodes()).toEqual([]);
    expect(s.g.simplifyPath(0)).toMatch(/more than 0 px/);
    s.g.select([]);
    expect(s.g.simplifyPath(1)).toMatch(/Choose a pen path/);
  });

  it('break: an open path becomes two paths, the second just in front, both kept selected', () => {
    const s = setup();
    s.g.chooseNodes([1]);
    s.g.breakAtNode();
    expect(s.label()).toBe('Break at node');
    expect(s.objects()).toHaveLength(2);
    expect(s.xy(s.objects()[0] as PathObject)).toEqual([
      [100, 100],
      [200, 200],
    ]);
    expect(s.xy(s.objects()[1] as PathObject)).toEqual([
      [200, 200],
      [300, 100],
    ]);
    expect(s.g.store.get().selection).toEqual(s.objects().map((o) => o.id));
    s.g.undo();
    expect(s.objects()).toHaveLength(1);
  });

  it('break a closed shape, then join its two end nodes: closed again', () => {
    const s = setup();
    s.g.chooseNodes([0, 2]);
    s.g.joinNodes();
    expect(s.label()).toBe('Join nodes');
    expect(s.path().closed).toBe(true);
    s.g.chooseNodes([1]);
    s.g.breakAtNode();
    expect(s.path().closed).toBe(false);
    expect(s.g.chosenNodes()).toEqual([0, 3]);
    s.g.joinNodes();
    expect(s.path().points).toHaveLength(3);
    s.g.chooseNodes([0, 1]);
    s.g.breakAtNode();
    expect(s.message()).toMatch(/Choose one node/);
  });

  it('close and open, reverse, delete', () => {
    const s = setup();
    s.g.setPathClosed(true);
    expect(s.label()).toBe('Close path');
    expect(s.path().closed).toBe(true);
    s.g.setPathClosed(false);
    expect(s.label()).toBe('Open path');
    s.g.chooseNodes([0]);
    s.g.reversePath();
    expect(s.label()).toBe('Reverse path');
    expect(s.xy()[0]).toEqual([300, 100]);
    expect(s.g.chosenNodes()).toEqual([2]);
    s.g.deleteNodes();
    expect(s.label()).toBe('Delete nodes');
    expect(s.xy()).toEqual([
      [300, 100],
      [200, 200],
    ]);
    expect(s.g.chosenNodes()).toEqual([]);
  });

  it('Delete with nodes chosen deletes them, not the path', () => {
    const s = setup();
    s.g.chooseNodes([1]);
    s.g.deleteSelection();
    expect(s.objects()).toHaveLength(1);
    expect(s.path().points).toHaveLength(2);
    s.g.deleteSelection();
    expect(s.objects()).toHaveLength(0);
  });

  it('works the same in Animation mode', () => {
    const s = setup('animation');
    s.g.chooseNodes([1]);
    s.g.setNodeType('smooth');
    expect(s.path().points[1]!.type).toBe('smooth');
  });
});
