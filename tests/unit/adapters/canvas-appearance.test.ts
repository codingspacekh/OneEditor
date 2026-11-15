// M19 / G12, G14 on a browser canvas: a pattern's tile drawn once at the zoom and repeated, and
// effects made from a layer with the canvas's shadows and blur filter. jsdom has no canvas: a
// stand-in records what is done (the pixels are checked end to end).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasPattern, drawFiltered } from '../../../src/adapters/canvas/appearance.ts';
import { withLayers } from '../../../src/adapters/canvas/layers.ts';
import { newFilter, type PatternTile } from '../../../src/core/animation/appearance.ts';
import type { StageCanvas } from '../../../src/core/animation/draw.ts';
import type { ObjectFilter } from '../../../src/core/animation/types.ts';

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

const shown = (v: unknown): string =>
  typeof v === 'number'
    ? String(Math.round(v * 1000) / 1000)
    : typeof v === 'string'
      ? v
      : v && typeof v === 'object' && 'name' in v
        ? String((v as { name: string }).name)
        : '…';

/** A 2D context that records what is set and called, as `name.what`. */
function fakeContext(
  name: string,
  canvas: { width: number; height: number; name?: string },
  log: string[],
  transform: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  extra: { filter?: boolean; pattern?: object | null } = {},
) {
  const target: Record<string, unknown> = {
    canvas,
    getTransform: () => transform,
    createPattern: (image: unknown, repeat: string) => {
      log.push(`${name}.createPattern(${shown(image)},${repeat})`);
      return extra.pattern === undefined
        ? {
            setTransform: (m: Matrix) =>
              log.push(`pattern.setTransform(${Object.values(m).map(shown).join(',')})`),
          }
        : extra.pattern;
    },
  };
  if (extra.filter !== false) target.filter = 'none';
  return new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      return (...args: unknown[]) => log.push(`${name}.${key}(${args.map(shown).join(',')})`);
    },
    set(t, key: string, value: unknown) {
      t[key] = value;
      log.push(`${name}.${key}=${shown(value)}`);
      return true;
    },
    has(t, key) {
      return key in t;
    },
  });
}

let log: string[];
let made: string[];
let filterSupport: boolean;

beforeEach(() => {
  log = [];
  made = [];
  filterSupport = true;
  let count = 0;
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      name: string;
      private ctx: unknown = null;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.name = `canvas${++count}`;
        made.push(`${this.name} ${width}×${height}`);
      }
      getContext() {
        this.ctx ??= fakeContext(this.name, this, log, undefined, { filter: filterSupport });
        return this.ctx;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const tile = (width = 10, height = 10): PatternTile => ({
  width,
  height,
  matrix: [1, 0, 0, 1, -50, -30],
  draw: (ctx) => ctx.fillRect(0, 0, width, height),
});

describe('G12 pattern fills on a browser canvas', () => {
  it('G12: the tile is drawn once at the stage’s zoom, repeated, and placed by its matrix', () => {
    const stage = fakeContext('stage', { width: 800, height: 600 }, log, {
      a: 2,
      b: 0,
      c: 0,
      d: 2,
      e: 0,
      f: 0,
    });
    const pattern = canvasPattern(stage as never, tile(10, 5));
    expect(pattern).not.toBeNull();
    expect(made).toEqual(['canvas1 20×10']);
    expect(log).toEqual([
      'canvas1.scale(2,2)',
      'canvas1.fillRect(0,0,10,5)',
      'stage.createPattern(canvas1,repeat)',
      // Drawn twice as big, so put down at half the size, from the box's corner.
      'pattern.setTransform(0.5,0,0,0.5,-50,-30)',
    ]);
  });

  it('G12: a huge tile is drawn at most 2048 px; a tile of no size, or no pattern, is none', () => {
    const stage = fakeContext('stage', { width: 800, height: 600 }, log);
    canvasPattern(stage as never, tile(4000, 1000));
    expect(made).toEqual(['canvas1 2048×512']);
    expect(canvasPattern(stage as never, tile(0, 10))).toBeNull();
    const refusing = fakeContext('stage', { width: 8, height: 8 }, log, undefined, {
      pattern: null,
    });
    expect(canvasPattern(refusing as never, tile())).toBeNull();
  });

  it('G12: withLayers gives the canvas pattern fills', () => {
    const stage = withLayers(
      fakeContext('stage', { width: 80, height: 60 }, log),
    ) as unknown as StageCanvas;
    expect(stage.patternOf!(tile())).not.toBeNull();
  });
});

describe('G14 effects on a browser canvas', () => {
  const run = (filters: ObjectFilter[], zoom = 1) => {
    const stage = fakeContext('stage', { width: 200, height: 100 }, log, {
      a: zoom,
      b: 0,
      c: 0,
      d: zoom,
      e: 0,
      f: 0,
    });
    const scratch = new Map<string, OffscreenCanvas>();
    drawFiltered(
      stage as never,
      filters,
      (layer) => layer.fillRect(1, 2, 3, 4),
      (key, w, h) => {
        if (!scratch.has(key)) scratch.set(key, new OffscreenCanvas(w, h));
        return scratch.get(key)!;
      },
      (layer) => layer as unknown as StageCanvas,
    );
    return scratch;
  };

  it('G14: the object is drawn on a layer of the canvas’s size and transform, then put down', () => {
    run([]);
    expect(log).toEqual([
      'canvas1.reset()',
      'canvas1.setTransform(…)',
      'canvas1.fillRect(1,2,3,4)',
      'stage.save()',
      'stage.setTransform(1,0,0,1,0,0)',
      'stage.globalAlpha=1',
      'stage.drawImage(canvas1,0,0)',
      'stage.restore()',
    ]);
    expect(made).toEqual(['canvas1 200×100']);
  });

  it('G14 (J/21 shield): a drop shadow is the canvas’s shadow, its sizes times the zoom', () => {
    run([{ kind: 'dropShadow', colour: '#000000', dx: 3, dy: 4, blur: 5, opacity: 50 }], 2);
    expect(log.slice(3, 9)).toEqual([
      'canvas2.reset()',
      'canvas2.shadowColor=rgba(0, 0, 0, 0.5)',
      'canvas2.shadowBlur=10',
      'canvas2.shadowOffsetX=6',
      'canvas2.shadowOffsetY=8',
      'canvas2.drawImage(canvas1,0,0)',
    ]);
    expect(log).toContain('stage.drawImage(canvas2,0,0)');
  });

  it('G14 (O/N/24 halo): a glow is a shadow that is not moved; blur is the blur filter', () => {
    run([newFilter('glow'), { kind: 'blur', radius: 3 }], 2);
    expect(log).toContain('canvas2.shadowOffsetX=0');
    expect(log).toContain('canvas2.shadowBlur=40');
    // The two working layers take turns.
    expect(log).toContain('canvas3.filter=blur(6px)');
    expect(log).toContain('canvas3.drawImage(canvas2,0,0)');
    expect(log.at(-2)).toBe('stage.drawImage(canvas3,0,0)');
  });

  it('G14: on a canvas without the blur filter the shape stays sharp', () => {
    filterSupport = false;
    run([{ kind: 'blur', radius: 3 }]);
    expect(log.some((l) => l.includes('filter='))).toBe(false);
    expect(log).toContain('canvas2.drawImage(canvas1,0,0)');
  });

  it('G14: an inner shadow is the shadow of the outside, kept inside the shape', () => {
    run([{ kind: 'innerShadow', colour: '#000000', dx: 2, dy: 3, blur: 4, opacity: 60 }]);
    expect(log.slice(3)).toEqual([
      'canvas2.reset()',
      'canvas2.fillRect(0,0,200,100)',
      'canvas2.globalCompositeOperation=destination-out',
      'canvas2.drawImage(canvas1,0,0)',
      'canvas3.reset()',
      'canvas3.drawImage(canvas1,0,0)',
      'canvas3.globalCompositeOperation=source-atop',
      'canvas3.shadowColor=rgba(0, 0, 0, 0.6)',
      'canvas3.shadowBlur=4',
      'canvas3.shadowOffsetX=202',
      'canvas3.shadowOffsetY=3',
      'canvas3.drawImage(canvas2,-200,0)',
      'stage.save()',
      'stage.setTransform(1,0,0,1,0,0)',
      'stage.globalAlpha=1',
      'stage.drawImage(canvas3,0,0)',
      'stage.restore()',
    ]);
  });

  it('G14 (J/24 cake): a bevel is its light and its shade, two inner shadows', () => {
    run([newFilter('bevel')]);
    expect(log.filter((l) => l.includes('shadowColor='))).toEqual([
      'canvas3.shadowColor=rgba(255, 255, 255, 0.7)',
      'canvas4.shadowColor=rgba(0, 0, 0, 0.7)',
    ]);
  });

  it('G14: withLayers gives the canvas effects, with layers kept for the next frame', () => {
    const size = { width: 50, height: 40 };
    const raw = fakeContext('stage', size, log);
    const stage = withLayers(raw) as unknown as StageCanvas;
    let inner: StageCanvas | null = null;
    stage.withFilters!([newFilter('dropShadow')], (layer) => (inner = layer));
    // The layer can have effects (and see-through groups) of its own.
    expect(inner!.withFilters).toBeTypeOf('function');
    expect(inner!.withLayer).toBeTypeOf('function');
    stage.withFilters!([newFilter('dropShadow')], () => {});
    expect(made).toEqual(['canvas1 50×40', 'canvas2 50×40']);
    size.width = 30;
    stage.withFilters!([newFilter('dropShadow')], () => {});
    expect(made.slice(2)).toEqual(['canvas3 30×40', 'canvas4 30×40']);
  });
});
