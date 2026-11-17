// GN1 (M23): the undo history of an image within a memory budget. A step keeps only the tiles it
// changed (core/graphics/pixels/raster.ts), so brush strokes cost little; but a whole-layer step
// on a 12-megapixel photo (an adjustment, a filter, a transform, Image size) keeps a whole copy,
// about 38 MB, and 10–15 of them would take the app past 1 GB. Past the budget the oldest steps
// are let go (decided 2026-11-17 over spilling them to a file): the newest is always kept.
import type { History } from '../history.ts';
import type { AnimationDoc } from '../../core/animation/types.ts';

/** GN1: what the history may hold of its own (the present picture's tiles not counted). */
export const HISTORY_BUDGET = 400 * 1024 * 1024;

function eachTile(doc: AnimationDoc, visit: (tile: Uint8ClampedArray) => void): void {
  for (const layer of doc.layers) {
    const pixels = layer.pixels;
    if (!pixels) continue;
    for (const t of pixels.bitmap.tiles) if (t) visit(t);
    if (pixels.mask) for (const t of pixels.mask.tiles) if (t) visit(t);
  }
}

/** The bytes of tiles a document holds that are not in `seen`, added to it. */
function newBytes(doc: AnimationDoc, seen: Set<Uint8ClampedArray>): number {
  let bytes = 0;
  eachTile(doc, (t) => {
    if (seen.has(t)) return;
    seen.add(t);
    bytes += t.byteLength;
  });
  return bytes;
}

/** GN1: the bytes of pixel tiles only the history holds (undo and redo steps), each once. */
export function historyTileBytes(history: History<AnimationDoc>): number {
  const seen = new Set<Uint8ClampedArray>();
  newBytes(history.present, seen);
  let bytes = 0;
  for (const e of history.future) bytes += newBytes(e.project, seen);
  for (const e of history.past) bytes += newBytes(e.project, seen);
  return bytes;
}

/**
 * GN1: the history with its oldest undo steps let go until what it holds of its own is within
 * `budget`; the newest undo step always stays. The same history when nothing had to go.
 */
export function keepWithin(
  history: History<AnimationDoc>,
  budget = HISTORY_BUDGET,
): { history: History<AnimationDoc>; dropped: number } {
  const seen = new Set<Uint8ClampedArray>();
  newBytes(history.present, seen);
  let bytes = 0;
  for (const e of history.future) bytes += newBytes(e.project, seen);
  // From the newest step back: the first one that takes it over the budget goes, with all older.
  for (let i = history.past.length - 1; i >= 0; i--) {
    bytes += newBytes(history.past[i]!.project, seen);
    if (bytes > budget && i < history.past.length - 1)
      return { history: { ...history, past: history.past.slice(i + 1) }, dropped: i + 1 };
    if (bytes > budget) {
      // The newest step alone is over: it stays, the rest go.
      if (i === 0) break;
      return { history: { ...history, past: history.past.slice(i) }, dropped: i };
    }
  }
  return { history, dropped: 0 };
}
