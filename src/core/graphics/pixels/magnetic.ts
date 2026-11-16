// M21 step 3 (GB2): the magnetic lasso's snap (GRAPHICS-DESIGN §6: a help, not perfection; the
// colour range and the wand are the sure ways). Between the last anchor and the pointer, the path
// is the cheapest way through the picture's pixels where a pixel on a strong edge (a big change
// of brightness beside it) costs little: a shortest-path search (Dijkstra, 8 neighbours) in a
// window round the two points, so each step of the drag is a few thousand pixels at most.
import type { Point } from '../../animation/geometry.ts';
import { intersect, readRegion, type Bitmap } from './raster.ts';

/** How far round the two points the path may go looking for an edge, px. */
export const MAGNETIC_MARGIN = 10;
/** What a pixel on the strongest edge costs, against 1 for a pixel with none. */
const ON_EDGE = 0.05;
/** A change of brightness at least this big counts as a full edge (noise below it is not). */
const STRONG = 48;

/** A min-heap of pixel indices by their distance. */
class Heap {
  private items: number[] = [];
  private readonly dist: Float64Array;
  constructor(dist: Float64Array) {
    this.dist = dist;
  }
  get size(): number {
    return this.items.length;
  }
  push(i: number): void {
    const a = this.items;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (this.dist[a[up]!]! <= this.dist[i]!) break;
      a[k] = a[up]!;
      k = up;
    }
    a[k] = i;
  }
  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      let k = 0;
      const d = this.dist[last]!;
      while (true) {
        const l = 2 * k + 1;
        if (l >= a.length) break;
        const r = l + 1;
        const c = r < a.length && this.dist[a[r]!]! < this.dist[a[l]!]! ? r : l;
        if (this.dist[a[c]!]! >= d) break;
        a[k] = a[c]!;
        k = c;
      }
      a[k] = last;
    }
    return top;
  }
}

/** Drops the points on a straight line between their neighbours. */
function simplify(points: Point[]): Point[] {
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const a = points[i - 1]!;
    const b = points[i + 1]!;
    return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) !== 0;
  });
}

/**
 * The magnetic lasso's path from `from` to `to` (image px) along the strongest edges of `sample`
 * (a layer's pixels, or the whole picture), whose top-left pixel is at `origin` on the image. Its
 * points are pixel centres; straight from one point to the other where either is off the picture.
 */
export function magneticPath(
  sample: Bitmap,
  origin: Point,
  from: Point,
  to: Point,
  margin = MAGNETIC_MARGIN,
): Point[] {
  const fx = Math.floor(from.x - origin.x);
  const fy = Math.floor(from.y - origin.y);
  const tx = Math.floor(to.x - origin.x);
  const ty = Math.floor(to.y - origin.y);
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < sample.width && y < sample.height;
  if (!inside(fx, fy) || !inside(tx, ty)) return [from, to];
  const left = Math.min(fx, tx) - margin;
  const top = Math.min(fy, ty) - margin;
  const area = intersect(
    {
      x: left,
      y: top,
      width: Math.max(fx, tx) + margin - left + 1,
      height: Math.max(fy, ty) + margin - top + 1,
    },
    { x: 0, y: 0, width: sample.width, height: sample.height },
  )!;
  const { width: w, height: h } = area;
  const rgba = readRegion(sample, area);
  // Brightness (seen against nothing where it is transparent), then each pixel's cost.
  const light = new Float32Array(w * h);
  for (let i = 0; i < light.length; i++) {
    const k = i * 4;
    light[i] =
      ((0.299 * rgba[k]! + 0.587 * rgba[k + 1]! + 0.114 * rgba[k + 2]!) * rgba[k + 3]!) / 255;
  }
  const cost = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const at = (cx: number, cy: number) =>
        light[Math.max(0, Math.min(h - 1, cy)) * w + Math.max(0, Math.min(w - 1, cx))]!;
      const gx = at(x + 1, y) - at(x - 1, y);
      const gy = at(x, y + 1) - at(x, y - 1);
      const edge = Math.min(1, Math.hypot(gx, gy) / STRONG);
      cost[y * w + x] = 1 - (1 - ON_EDGE) * edge;
    }
  const start = (fy - area.y) * w + (fx - area.x);
  const goal = (ty - area.y) * w + (tx - area.x);
  const dist = new Float64Array(w * h).fill(Infinity);
  const back = new Int32Array(w * h).fill(-1);
  const done = new Uint8Array(w * h);
  const heap = new Heap(dist);
  dist[start] = 0;
  heap.push(start);
  while (heap.size > 0) {
    const i = heap.pop();
    if (done[i]) continue;
    done[i] = 1;
    if (i === goal) break;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (done[n]) continue;
        const d = dist[i]! + cost[n]! * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
        if (d < dist[n]!) {
          dist[n] = d;
          back[n] = i;
          heap.push(n);
        }
      }
  }
  const path: Point[] = [];
  for (let i = goal; i !== -1; i = i === start ? -1 : back[i]!) {
    const x = i % w;
    path.push({
      x: origin.x + area.x + x + 0.5,
      y: origin.y + area.y + (i - x) / w + 0.5,
    });
  }
  return simplify(path.reverse());
}
