// M21 step 3 (GB2): the selection's outline, drawn over the image as moving dashes ("marching
// ants"). Every edge between a selected pixel (at least half selected) and an unselected one, or
// the image's edge, is a pixel edge; edges in a line are merged into one run, so a rectangle is
// four runs and the path stays small. Each row is read once, as the places where it changes
// between selected and not; the edges across are where two rows' changes differ, the edges down
// are the changes themselves, joined from row to row. Made again only when the selection changes.
import { readRegion, type Mask } from './raster.ts';
import { selectedBounds } from './selection.ts';

export interface MaskOutline {
  /** SVG path data in image px: "M x y H x2" and "M x y V y2" runs. */
  d: string;
  /** How many runs (straight pieces) it has. */
  runs: number;
}

/** The x where each row changes between unselected and selected (sorted; from unselected). */
function rowChanges(bytes: Uint8ClampedArray, w: number, h: number, x0: number): Int32Array[] {
  const rows: Int32Array[] = [];
  const found: number[] = [];
  for (let y = 0; y < h; y++) {
    found.length = 0;
    const base = y * w;
    let on = false;
    for (let x = 0; x < w; x++) {
      const now = bytes[base + x]! >= 128;
      if (now !== on) {
        found.push(x0 + x);
        on = now;
      }
    }
    if (on) found.push(x0 + w);
    rows.push(Int32Array.from(found));
  }
  return rows;
}

/** The changes of the two rows' difference: both rows' changes, those in both cancelled. */
function differs(a: Int32Array, b: Int32Array): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i]! < b[j]!)) out.push(a[i++]!);
    else if (i >= a.length || b[j]! < a[i]!) out.push(b[j++]!);
    else {
      i++;
      j++;
    }
  }
  return out;
}

export function maskOutline(m: Mask): MaskOutline {
  const b = selectedBounds(m);
  if (!b) return { d: '', runs: 0 };
  const rows = rowChanges(readRegion(m, b), b.width, b.height, b.x);
  const none = new Int32Array(0);
  const parts: string[] = [];
  // Across: the edge above each row (and below the last).
  for (let j = 0; j <= b.height; j++) {
    const xs = differs(rows[j - 1] ?? none, rows[j] ?? none);
    for (let k = 0; k + 1 < xs.length; k += 2) parts.push(`M${xs[k]} ${b.y + j}H${xs[k + 1]}`);
  }
  // Down: a run at each x a row changes at, open while the rows below change there too.
  let open = new Map<number, number>();
  for (let j = 0; j <= b.height; j++) {
    const xs = rows[j] ?? none;
    const next = new Map<number, number>();
    for (const x of xs) next.set(x, open.get(x) ?? b.y + j);
    for (const [x, start] of open) if (!next.has(x)) parts.push(`M${x} ${start}V${b.y + j}`);
    open = next;
  }
  return { d: parts.join(''), runs: parts.length };
}
