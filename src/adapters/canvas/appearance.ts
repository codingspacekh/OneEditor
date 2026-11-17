// G12, G14 (M19) on a browser canvas: pattern fills (StageCanvas.patternOf) and effects
// (StageCanvas.withFilters) for the stage, the PNG and JPG exports, the video and the web page.
// A pattern's tile is drawn once on a small canvas at the stage's zoom, so it stays sharp, and
// repeated by the canvas. Effects: the object is drawn whole on a layer of the canvas's size,
// then each effect is made from the layer in device pixels (sizes times the zoom), with the
// canvas's own shadows and blur filter, and the result put down on the canvas.
import type { StageCanvas } from '../../core/animation/draw.ts';
import { bevelShadows, rgba, type PatternTile } from '../../core/animation/appearance.ts';
import type { ObjectFilter } from '../../core/animation/types.ts';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A canvas to work on, `key` naming its use (kept and reused for the next frame). */
export type Scratch = (key: string, width: number, height: number) => OffscreenCanvas;

/** The largest side of a pattern's tile drawn on its own canvas, in device pixels. */
const MAX_TILE = 2048;

/** How much the canvas's transform enlarges (the stage's zoom, the export's size). */
function zoomOf(ctx: Context2D): number {
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

/** G12: the tile drawn on a canvas of its own and repeated, placed by its matrix. */
export function canvasPattern(ctx: Context2D, tile: PatternTile): CanvasPattern | null {
  if (!(tile.width > 0 && tile.height > 0)) return null;
  const zoom = Math.max(zoomOf(ctx), 1e-3);
  const fit = Math.min(1, MAX_TILE / (Math.max(tile.width, tile.height) * zoom));
  const w = Math.max(1, Math.ceil(tile.width * zoom * fit));
  const h = Math.max(1, Math.ceil(tile.height * zoom * fit));
  const canvas = new OffscreenCanvas(w, h);
  const t = canvas.getContext('2d');
  if (!t) return null;
  t.scale(w / tile.width, h / tile.height);
  tile.draw(t as unknown as StageCanvas);
  const pattern = ctx.createPattern(canvas, 'repeat');
  if (!pattern) return null;
  const [a, b, c, d, e, f] = tile.matrix;
  const [sx, sy] = [tile.width / w, tile.height / h];
  pattern.setTransform({ a: a * sx, b: b * sx, c: c * sy, d: d * sy, e, f });
  return pattern;
}

interface Shadow {
  colour: string;
  dx: number;
  dy: number;
  blur: number;
  opacity: number;
}

/**
 * G14: draws `draw` on a layer, then puts it down on `ctx` with `filters` made from it in order.
 * `nested` gives the layer's context the same powers, for effects inside a group with effects.
 */
export function drawFiltered(
  ctx: Context2D,
  filters: readonly ObjectFilter[],
  draw: (layer: StageCanvas) => void,
  scratch: Scratch,
  nested: (layer: Context2D) => StageCanvas,
): void {
  const { width, height } = ctx.canvas;
  const zoom = zoomOf(ctx);
  const fresh = (key: string): OffscreenCanvasRenderingContext2D => {
    const layer = scratch(key, width, height).getContext('2d')!;
    layer.reset();
    return layer;
  };
  const source = fresh('source');
  source.setTransform(ctx.getTransform());
  draw(nested(source));
  let current: OffscreenCanvas = source.canvas;
  let turn = 0;
  const next = () => fresh(turn++ % 2 === 0 ? 'one' : 'two');

  const shadow = (s: Shadow) => {
    const out = next();
    out.shadowColor = rgba(s.colour, s.opacity);
    out.shadowBlur = s.blur * zoom;
    out.shadowOffsetX = s.dx * zoom;
    out.shadowOffsetY = s.dy * zoom;
    out.drawImage(current, 0, 0);
    current = out.canvas;
  };
  // An inner shadow: the shadow of everything outside the shape, seen only inside it. The
  // outside is drawn a canvas-width off to the left, so only its shadow lands on the canvas.
  const inner = (s: Shadow) => {
    const outside = fresh('outside');
    outside.fillRect(0, 0, width, height);
    outside.globalCompositeOperation = 'destination-out';
    outside.drawImage(current, 0, 0);
    const out = next();
    out.drawImage(current, 0, 0);
    out.globalCompositeOperation = 'source-atop';
    out.shadowColor = rgba(s.colour, s.opacity);
    out.shadowBlur = s.blur * zoom;
    out.shadowOffsetX = s.dx * zoom + width;
    out.shadowOffsetY = s.dy * zoom;
    out.drawImage(outside.canvas, -width, 0);
    current = out.canvas;
  };

  // G10 (M23): a stroke effect. The canvas has no morphology: the shape's silhouette in the
  // colour is stamped round circles out to the width (and nearer in, so thin parts fill) to grow
  // it. Outside: grown, under the shape; inside: what is outside the shape grown inwards keeps a
  // ring inside the edge, over the shape; centred: half of each.
  const silhouette = (from: OffscreenCanvas, colour: string): OffscreenCanvas => {
    const s = fresh('silhouette');
    s.drawImage(from, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = colour;
    s.fillRect(0, 0, width, height);
    return s.canvas;
  };
  const grown = (from: OffscreenCanvas, radius: number, key: string): OffscreenCanvas => {
    const g = fresh(key);
    for (const [dx, dy] of discOffsets(radius)) g.drawImage(from, dx, dy);
    return g.canvas;
  };
  const strokeEffect = (f: Extract<ObjectFilter, { kind: 'stroke' }>) => {
    const out =
      (f.position === 'outside' ? f.width : f.position === 'centred' ? f.width / 2 : 0) * zoom;
    const inn =
      (f.position === 'inside' ? f.width : f.position === 'centred' ? f.width / 2 : 0) * zoom;
    const under = out > 0 ? grown(silhouette(current, f.colour), out, 'grown') : null;
    let ring: OffscreenCanvas | null = null;
    if (inn > 0) {
      const outside = fresh('outside');
      outside.fillRect(0, 0, width, height);
      outside.globalCompositeOperation = 'destination-out';
      outside.drawImage(current, 0, 0);
      const edge = grown(outside.canvas, inn, 'edge');
      const r = fresh('ring');
      r.drawImage(silhouette(current, f.colour), 0, 0);
      r.globalCompositeOperation = 'destination-in';
      r.drawImage(edge, 0, 0);
      ring = r.canvas;
    }
    const result = next();
    if (under) {
      result.globalAlpha = f.opacity / 100;
      result.drawImage(under, 0, 0);
      result.globalAlpha = 1;
    }
    result.drawImage(current, 0, 0);
    if (ring) {
      result.globalAlpha = f.opacity / 100;
      result.drawImage(ring, 0, 0);
    }
    current = result.canvas;
  };

  for (const f of filters)
    switch (f.kind) {
      case 'blur': {
        const out = next();
        // A canvas without the blur filter (not Chromium) keeps the shape sharp.
        if ('filter' in out) out.filter = `blur(${f.radius * zoom}px)`;
        out.drawImage(current, 0, 0);
        current = out.canvas;
        break;
      }
      case 'dropShadow':
        shadow(f);
        break;
      case 'glow':
        shadow({ ...f, dx: 0, dy: 0 });
        break;
      case 'innerShadow':
        inner(f);
        break;
      case 'bevel':
        for (const side of bevelShadows(f)) inner(side);
        break;
      case 'stroke':
        strokeEffect(f);
        break;
    }
  // The layer is already faded as the object is (drawObject passes its groups' opacity on).
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(current, 0, 0);
  ctx.restore();
}

/**
 * G10 (M23): where to stamp a silhouette to grow it by `radius` px: its own place, then rings out
 * to the radius (at most 8, so a big stroke stays quick), each with enough stamps to close up.
 */
export function discOffsets(radius: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  if (!(radius > 0)) return out;
  const rings = Math.min(8, Math.ceil(radius));
  const round = (v: number) => Math.round(v * 1000) / 1000 || 0;
  for (let k = 1; k <= rings; k++) {
    const r = (radius * k) / rings;
    const n = Math.max(8, Math.min(48, Math.ceil(2 * Math.PI * r)));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      out.push([round(r * Math.cos(a)), round(r * Math.sin(a))]);
    }
  }
  return out;
}
