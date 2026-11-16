// GT4 (D10): a variable font's letters at a weight and size (Inter, Montserrat, Noto Serif, Oswald,
// Playfair Display, Cinzel, Caveat, Dancing Script are one file each for every weight). The
// OpenType 'gvar' table moves each outline point by deltas, weighted by how far the wanted weight
// is from each master's. opentype.js 2.0 reads it, but drops a tuple's own "every point" list,
// misreads composite letters' deltas and interpolates the untouched points from the moved ones,
// so its bold letters can be 10 % off the ones the stage draws; this reads the table itself, as
// the OpenType specification (and Chromium's FreeType) do. Pure: bytes in, points out.

/** A TrueType outline point, in font units (y up). */
export interface GlyfPoint {
  x: number;
  y: number;
  onCurve: boolean;
  lastPointOfContour: boolean;
}

/** One master's deltas: where it applies (peak, start, end per axis) and its points' moves. */
interface Tuple {
  peak: number[];
  start?: number[];
  end?: number[];
  /** The point numbers it moves; null: every point. */
  points: number[] | null;
  dx: number[];
  dy: number[];
}

/** The 'gvar' table, read lazily letter by letter. */
export interface GlyphVariations {
  tuplesOf(glyphIndex: number, pointCount: number): Tuple[];
}

/** The font file's tables: tag → [offset, length]. */
function tablesOf(view: DataView): Map<string, [number, number]> {
  const count = view.getUint16(4);
  const tables = new Map<string, [number, number]>();
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(...[0, 1, 2, 3].map((k) => view.getUint8(at + k)));
    tables.set(tag, [view.getUint32(at + 8), view.getUint32(at + 12)]);
  }
  return tables;
}

const f2dot14 = (view: DataView, at: number) => view.getInt16(at) / 16384;

/** A cursor over the bytes. */
class Reader {
  private view: DataView;
  at: number;
  constructor(view: DataView, at: number) {
    this.view = view;
    this.at = at;
  }
  u8 = () => this.view.getUint8(this.at++);
  u16 = () => {
    const v = this.view.getUint16(this.at);
    this.at += 2;
    return v;
  };
  i8 = () => this.view.getInt8(this.at++);
  i16 = () => {
    const v = this.view.getInt16(this.at);
    this.at += 2;
    return v;
  };
  tuple(axes: number): number[] {
    const t = Array.from({ length: axes }, (_, i) => f2dot14(this.view, this.at + 2 * i));
    this.at += 2 * axes;
    return t;
  }
  /** Packed point numbers; null when it says "every point". */
  points(): number[] | null {
    let count = this.u8();
    if (count === 0) return null;
    if (count & 0x80) count = ((count & 0x7f) << 8) | this.u8();
    const out: number[] = [];
    let last = 0;
    while (out.length < count) {
      const control = this.u8();
      const words = (control & 0x80) !== 0;
      const run = (control & 0x7f) + 1;
      for (let i = 0; i < run && out.length < count; i++) {
        last += words ? this.u16() : this.u8();
        out.push(last);
      }
    }
    return out;
  }
  /** Packed deltas, `count` of them. */
  deltas(count: number): number[] {
    const out: number[] = [];
    while (out.length < count) {
      const control = this.u8();
      const run = (control & 0x3f) + 1;
      for (let i = 0; i < run && out.length < count; i++)
        out.push(control & 0x80 ? 0 : control & 0x40 ? this.i16() : this.i8());
    }
    return out;
  }
}

/** The font's 'gvar' table, or null for a font that is not variable. */
export function readGlyphVariations(bytes: Uint8Array): GlyphVariations | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const table = tablesOf(view).get('gvar');
  if (!table) return null;
  const [base] = table;
  const axes = view.getUint16(base + 4);
  const sharedCount = view.getUint16(base + 6);
  const sharedAt = base + view.getUint32(base + 8);
  const glyphCount = view.getUint16(base + 12);
  const longOffsets = (view.getUint16(base + 14) & 1) === 1;
  const dataAt = base + view.getUint32(base + 16);
  const offset = (g: number) =>
    longOffsets ? view.getUint32(base + 20 + 4 * g) : view.getUint16(base + 20 + 2 * g) * 2;
  const shared = Array.from({ length: sharedCount }, (_, i) =>
    Array.from({ length: axes }, (_, a) => f2dot14(view, sharedAt + 2 * (i * axes + a))),
  );
  return {
    tuplesOf(g, pointCount) {
      if (g < 0 || g >= glyphCount) return [];
      const [from, to] = [offset(g), offset(g + 1)];
      if (to <= from) return [];
      const start = dataAt + from;
      const r = new Reader(view, start);
      const head = r.u16();
      const count = head & 0x0fff;
      const serialised = start + r.u16();
      const headers = Array.from({ length: count }, () => {
        const size = r.u16();
        const index = r.u16();
        const peak = index & 0x8000 ? r.tuple(axes) : shared[index & 0x0fff]!;
        const between = index & 0x4000 ? { start: r.tuple(axes), end: r.tuple(axes) } : {};
        return { size, peak, ...between, own: (index & 0x2000) !== 0 };
      });
      const d = new Reader(view, serialised);
      const sharedPoints = head & 0x8000 ? d.points() : null;
      let at = d.at;
      return headers.map((h) => {
        const t = new Reader(view, at);
        at += h.size;
        const points = h.own ? t.points() : sharedPoints;
        const n = points ? points.length : pointCount;
        const dx = t.deltas(n);
        const dy = t.deltas(n);
        return { peak: h.peak, start: h.start, end: h.end, points, dx, dy };
      });
    },
  };
}

/** How much of a master's deltas apply at these normalised coordinates (0 to 1). */
export function scalarOf(
  t: Pick<Tuple, 'peak' | 'start' | 'end'>,
  coords: readonly number[],
): number {
  let f = 1;
  for (let a = 0; a < coords.length; a++) {
    const p = t.peak[a] ?? 0;
    if (p === 0) continue;
    const n = coords[a]!;
    if (n === 0) return 0;
    if (!t.start || !t.end) {
      if (n < Math.min(0, p) || n > Math.max(0, p)) return 0;
      f *= n / p;
    } else {
      const [s, e] = [t.start[a]!, t.end[a]!];
      if (n < s || n > e) return 0;
      if (n < p) f *= (n - s) / (p - s);
      else if (n > p) f *= (e - n) / (e - p);
    }
  }
  return f;
}

/**
 * The deltas of the points a master leaves out, inferred from the ones it moves on the same
 * contour (the specification's IUP): between two moved points in proportion, beyond them as the
 * nearer one. From the outline's own points, not ones already moved by another master.
 */
function inferDeltas(
  orig: readonly GlyfPoint[],
  dx: number[],
  dy: number[],
  touched: boolean[],
): void {
  let start = 0;
  while (start < orig.length) {
    let end = start;
    while (!orig[end]!.lastPointOfContour && end < orig.length - 1) end++;
    const moved: number[] = [];
    for (let i = start; i <= end; i++) if (touched[i]) moved.push(i);
    for (let i = start; i <= end && moved.length > 0; i++) {
      if (touched[i]) continue;
      const prev = moved.filter((m) => m < i).at(-1) ?? moved.at(-1)!;
      const next = moved.find((m) => m > i) ?? moved[0]!;
      for (const [k, d] of [
        ['x', dx],
        ['y', dy],
      ] as const) {
        let [a, b] = [prev, next];
        if (orig[a]![k] > orig[b]![k]) [a, b] = [b, a];
        const [i1, i2, c] = [orig[a]![k], orig[b]![k], orig[i]![k]];
        if (i1 === i2) d[i] = d[a] === d[b] ? d[a]! : 0;
        else if (c <= i1) d[i] = d[a]!;
        else if (c >= i2) d[i] = d[b]!;
        else d[i] = d[a]! + ((c - i1) / (i2 - i1)) * (d[b]! - d[a]!);
      }
    }
    start = end + 1;
  }
}

/** A letter's parts, as opentype.js reads them from 'glyf'. */
export interface GlyfGlyph {
  index: number;
  points?: GlyfPoint[];
  isComposite?: boolean;
  components?: {
    glyphIndex: number;
    dx: number;
    dy: number;
    xScale: number;
    scale01: number;
    scale10: number;
    yScale: number;
    matchedPoints?: number[];
  }[];
}

/**
 * GT4: a letter's points at the normalised coordinates `coords` (a composite letter's parts each
 * at its own, then placed with its offset moved too).
 */
export function variedPoints(
  glyph: GlyfGlyph,
  gvar: GlyphVariations,
  coords: readonly number[],
  glyphAt: (index: number) => GlyfGlyph,
): GlyfPoint[] {
  const parts = glyph.components;
  if (glyph.isComposite && parts) {
    // Parts placed by matching points are not moved (opentype.js placed them).
    if (parts.some((c) => c.matchedPoints)) return glyph.points ?? [];
    const n = parts.length;
    const [ox, oy] = [Array<number>(n).fill(0), Array<number>(n).fill(0)];
    for (const t of gvar.tuplesOf(glyph.index, n + 4)) {
      const f = scalarOf(t, coords);
      if (f === 0) continue;
      (t.points ?? parts.map((_, i) => i)).forEach((c, i) => {
        if (c < n) {
          ox[c] = ox[c]! + t.dx[i]! * f;
          oy[c] = oy[c]! + t.dy[i]! * f;
        }
      });
    }
    return parts.flatMap((c, i) =>
      variedPoints(glyphAt(c.glyphIndex), gvar, coords, glyphAt).map((p) => ({
        ...p,
        x: c.xScale * p.x + c.scale10 * p.y + c.dx + ox[i]!,
        y: c.scale01 * p.x + c.yScale * p.y + c.dy + oy[i]!,
      })),
    );
  }
  const orig = glyph.points ?? [];
  const total = orig.map(() => ({ x: 0, y: 0 }));
  for (const t of gvar.tuplesOf(glyph.index, orig.length + 4)) {
    const f = scalarOf(t, coords);
    if (f === 0) continue;
    let [dx, dy] = [t.dx, t.dy];
    if (t.points) {
      [dx, dy] = [orig.map(() => 0), orig.map(() => 0)];
      const touched = orig.map(() => false);
      t.points.forEach((p, i) => {
        if (p >= orig.length) return; // the four phantom points: the advance, not the outline
        touched[p] = true;
        dx[p] = t.dx[i]!;
        dy[p] = t.dy[i]!;
      });
      inferDeltas(orig, dx, dy, touched);
    }
    total.forEach((m, i) => {
      m.x += dx[i]! * f;
      m.y += dy[i]! * f;
    });
  }
  return orig.map((p, i) => ({ ...p, x: p.x + total[i]!.x, y: p.y + total[i]!.y }));
}
