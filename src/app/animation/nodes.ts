// GV3 (M19): the node tool in Graphics and Animation modes — the nodes chosen on the selected pen
// path (with the select tool), and the edits of core/graphics/nodes.ts on them: node types,
// segments to lines or curves, moving (a drag or the arrow keys), a typed X / Y, align and
// distribute, simplify, break, join, close / open, reverse and delete. Each edit is one undo step;
// a refused one becomes a message (or, for a typed value, the reason under its box).
import * as cmd from '../animation-commands.ts';
import type { Point } from '../../core/animation/geometry.ts';
import { findObject, replaceObjects } from '../../core/animation/layers.ts';
import { validateObject } from '../../core/animation/rules.ts';
import type { Id, NodeType, PathObject } from '../../core/animation/types.ts';
import type { AlignEdge, DistributeAxis } from '../../core/graphics/align.ts';
import * as nodes from '../../core/graphics/nodes.ts';
import { EditError } from '../../core/model/errors.ts';
import type { AnimationContext } from './context.ts';

const TYPE_LABELS: Record<NodeType, string> = {
  cusp: 'Cusp node',
  smooth: 'Smooth node',
  symmetrical: 'Symmetrical node',
};

/** The pen path whose nodes are edited: the one object selected, with the select tool. */
function editedPath(ctx: AnimationContext): PathObject | null {
  const s = ctx.store.get();
  if (s.tool !== 'select' || s.selection.length !== 1) return null;
  const found = findObject(ctx.present(), s.selection[0]!);
  return found?.object.kind === 'path' ? found.object : null;
}

/** The nodes chosen on it (those still on the path), in path order. */
function chosenOf(ctx: AnimationContext): number[] {
  const s = ctx.store.get();
  const path = editedPath(ctx);
  if (!path || !s.nodes || s.nodes.selection !== s.selection) return [];
  return s.nodes.indices.filter((i) => i < path.points.length);
}

/**
 * GV3: the arrow keys move the chosen nodes instead of the path (Shift: 10 px). False when no
 * node is chosen, so the keys move the selected objects as before.
 */
export function nudgeChosenNodes(ctx: AnimationContext, dx: number, dy: number): boolean {
  const path = editedPath(ctx);
  const indices = chosenOf(ctx);
  if (!path || indices.length === 0) return false;
  if (dx !== 0 || dy !== 0)
    ctx.run(
      cmd.changeObject(path.id, 'Move nodes', (o) =>
        nodes.moveNodes(o as PathObject, indices, dx, dy),
      ),
    );
  return true;
}

/** GV3: Delete with nodes chosen deletes those nodes, not the path. False when none is chosen. */
export function deleteChosenNodes(ctx: AnimationContext): boolean {
  if (chosenOf(ctx).length === 0) return false;
  nodeActions(ctx).deleteNodes();
  return true;
}

export function nodeActions(ctx: AnimationContext) {
  const { store, patch, run, edit, showError } = ctx;

  const choose = (indices: readonly number[]) =>
    patch({
      nodes: {
        selection: store.get().selection,
        indices: [...new Set(indices)].sort((a, b) => a - b),
      },
    });

  /** The path and its chosen nodes, or a message saying what to choose. */
  function target(): { path: PathObject; indices: number[] } | null {
    const path = editedPath(ctx);
    if (path) return { path, indices: chosenOf(ctx) };
    showError(new EditError('Choose a pen path to edit its nodes.'));
    return null;
  }

  /**
   * One edit of the path as one undo step; `after` gives the nodes chosen then (the same ones
   * unless it says otherwise). True when it was made.
   */
  function editNodes(
    label: string,
    change: (path: PathObject, indices: number[]) => PathObject,
    after?: (path: PathObject, indices: number[]) => number[],
  ): boolean {
    const t = target();
    if (!t) return false;
    let made: PathObject | null = null;
    const done = run(
      cmd.changeObject(t.path.id, label, (o) => (made = change(o as PathObject, t.indices))),
    );
    if (done && made) choose(after ? after(made, t.indices) : t.indices);
    return done;
  }

  return {
    /** GV3: nodes chosen (a click, a box dragged round them); with `toggle` (Shift) added or taken away. */
    chooseNodes(indices: readonly number[], toggle = false): void {
      if (!editedPath(ctx)) return;
      if (!toggle) return choose(indices);
      const now = new Set(chosenOf(ctx));
      for (const i of indices) {
        if (now.has(i)) now.delete(i);
        else now.add(i);
      }
      choose([...now]);
    },

    /** The nodes chosen on the selected pen path (none without one). */
    chosenNodes: (): number[] => chosenOf(ctx),

    setNodeType(type: NodeType): void {
      editNodes(TYPE_LABELS[type], (p, i) => nodes.setNodeType(p, i, type));
    },

    /** The segment after each chosen node made a straight line or a curve. */
    segmentsTo(kind: 'line' | 'curve'): void {
      editNodes(kind === 'line' ? 'Segment to line' : 'Segment to curve', (p, i) =>
        nodes.segmentsTo(p, i, kind),
      );
    },

    /** The chosen nodes moved together on the stage (a drag of one of them). */
    moveNodes(dx: number, dy: number): void {
      if (dx === 0 && dy === 0) return;
      editNodes('Move nodes', (p, i) => nodes.moveNodes(p, i, dx, dy));
    },

    /** The chosen node put at a typed X and / or Y (stage px); returns why not, for the box. */
    placeNode(at: Partial<Point>): string | null {
      const path = editedPath(ctx);
      const indices = chosenOf(ctx);
      if (!path || indices.length !== 1) return 'Choose one node to place it.';
      if (Object.values(at).some((v) => !Number.isFinite(v))) return 'Type a number.';
      return edit(
        cmd.changeObject(path.id, 'Move node', (o) =>
          nodes.placeNode(o as PathObject, indices[0]!, at),
        ),
      );
    },

    alignNodes(edge: AlignEdge): void {
      editNodes('Align nodes', (p, i) => nodes.alignNodes(p, i, edge));
    },

    distributeNodes(axis: DistributeAxis): void {
      editNodes('Distribute nodes', (p, i) => nodes.distributeNodes(p, i, axis));
    },

    /** The selected path with fewer nodes, the same look within `tolerance` px; returns why not. */
    simplifyPath(tolerance: number): string | null {
      const path = editedPath(ctx);
      if (!path) return 'Choose a pen path to simplify it.';
      const refused = edit(
        cmd.changeObject(path.id, 'Simplify', (o) =>
          nodes.simplifyPath(o as PathObject, tolerance),
        ),
      );
      if (!refused) choose([]);
      return refused;
    },

    /**
     * The path broken at the one chosen node: a closed shape opens there (its two new ends
     * chosen, ready to join again); an open path becomes two, both selected.
     */
    breakAtNode(): void {
      const t = target();
      if (!t) return;
      if (t.indices.length !== 1) {
        showError(new EditError('Choose one node to break the path there.'));
        return;
      }
      const at = t.indices[0]!;
      let ids: Id[] = [];
      const done = run({
        label: 'Break at node',
        apply: (doc) => {
          const result = replaceObjects(doc, [t.path.id], ([o]) => {
            const parts = nodes.breakAtNode(o as PathObject, at);
            parts.forEach(validateObject);
            return parts;
          });
          ids = result.ids;
          return result.doc;
        },
      });
      if (!done) return;
      if (ids.length > 1) patch({ selection: ids });
      else choose([0, t.path.points.length]);
    },

    /** The two chosen end nodes of the open path joined: it closes there. */
    joinNodes(): void {
      editNodes(
        'Join nodes',
        (p, i) => nodes.joinNodes(p, i),
        () => [0],
      );
    },

    /** The path closed (a segment back to its first node) or opened (that segment taken away). */
    setPathClosed(closed: boolean): void {
      editNodes(closed ? 'Close path' : 'Open path', (p) => nodes.setPathClosed(p, closed));
    },

    reversePath(): void {
      editNodes('Reverse path', nodes.reversePath, (p, i) => i.map((k) => p.points.length - 1 - k));
    },

    /** The chosen nodes deleted, the curves either side fitted again to keep the shape. */
    deleteNodes(): void {
      editNodes(
        'Delete nodes',
        (p, i) => nodes.deleteNodes(p, i),
        () => [],
      );
    },
  };
}
