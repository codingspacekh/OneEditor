// M21 step 3 (GB2): a selection made from vector objects — each object's area on the image (its
// outline turned, flipped, skewed and bent as it is drawn; in a group, where the group puts it; a
// combined path's holes; text as its letters' outlines), rasterised anti-aliased with the
// object's own fill rule, the objects joined. M/25 Task 2(b): the jigsaw template's piece drawn
// over Tier.png selects the piece to cut out.
import { flattenPath, isClosed, outlineOf, toStage, type Point } from '../../animation/geometry.ts';
import type { AnimObject, GroupObject, TextObject } from '../../animation/types.ts';
import { combineMasks, polygonMask, type FillRule } from './selection.ts';
import { createMask, type Mask } from './raster.ts';

/** Some closed rings filled by one rule: one object's area. */
export interface Area {
  rings: Point[][];
  rule: FillRule;
}

/** Text as its letters' outlines, grouped in the text's place (text-outlines.lettersGroup). */
export type LettersOf = (t: TextObject) => GroupObject;

/** The object's areas on the image; `place` puts a point of its parent's space on the image. */
function areasOf(o: AnimObject, letters: LettersOf, place: (p: Point) => Point): Area[] {
  if (o.kind === 'group' || o.kind === 'text') {
    const g = o.kind === 'group' ? o : letters(o);
    // The children are placed from the group's top-left corner, then the group is placed.
    const inGroup = (p: Point) => place(toStage(g, p));
    return g.children.flatMap((child) => areasOf(child, letters, inGroup));
  }
  if (!isClosed(o)) return [];
  const outline = outlineOf(o)[0]!;
  const holes = o.kind === 'path' ? (o.holes ?? []) : [];
  const rings = [outline, ...holes.map((h) => flattenPath(h, true).map((q) => toStage(o, q)))];
  return [
    {
      rings: rings.map((r) => r.map(place)),
      rule: o.kind === 'path' && o.fillRule === 'nonzero' ? 'nonzero' : 'evenodd',
    },
  ];
}

/**
 * GB2 Select from shape: the objects' areas joined, as a selection the image's size; soft edges
 * (anti-aliased), or hard (each pixel in or out by its centre: pieces cut by shapes that meet
 * share no pixel).
 */
export function objectsMask(
  width: number,
  height: number,
  objects: readonly AnimObject[],
  letters: LettersOf,
  antiAlias = true,
): Mask {
  const areas = objects.flatMap((o) => areasOf(o, letters, (p) => p));
  return areas.reduce(
    (m, a) =>
      combineMasks(m, polygonMask(width, height, a.rings, { rule: a.rule, antiAlias }), 'add'),
    createMask(width, height),
  );
}
