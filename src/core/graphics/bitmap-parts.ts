// G11 (M18, M19): "an SVG with bitmap parts is flagged" — 9626/04 M/26: "the SVG must not contain
// any bitmap elements". The pictures an SVG (or PDF) of the image would carry inside: on the
// layers shown, a template (GV8) never, as it is never exported. Pure.
import { withoutTemplates } from '../animation/template.ts';
import type { AnimObject, AnimationDoc, Id } from '../animation/types.ts';

const picturesIn = (objects: readonly AnimObject[]): number =>
  objects.reduce(
    (n, o) => n + (o.kind === 'picture' ? 1 : o.kind === 'group' ? picturesIn(o.children) : 0),
    0,
  );

/** How many pictures are in what is exported: the whole image, or the objects `ids`. */
export function bitmapParts(doc: AnimationDoc, ids?: readonly Id[]): number {
  const shown = withoutTemplates(doc).layers.filter((l) => l.visible);
  const objects = shown.flatMap((l) => l.objects);
  return picturesIn(ids ? objects.filter((o) => ids.includes(o.id)) : objects);
}

/** The warning the export shows, or null when there are none. */
export function bitmapWarning(count: number): string | null {
  if (count === 0) return null;
  const what = count === 1 ? '1 picture (a bitmap part)' : `${count} pictures (bitmap parts)`;
  return `It will have ${what} inside. If the task says it must not contain bitmap elements, trace the picture or remove it first.`;
}
