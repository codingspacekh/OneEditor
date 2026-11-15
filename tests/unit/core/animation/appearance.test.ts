// M19 / G12, G14: pattern fills, the fill's and outline's own opacity, and effects (shadows,
// glow, bevel, blur), as drawStage gives them to any canvas: the stage, the PNG and JPG exports
// and the SVG (svg-appearance.test.ts) draw from the same calls. A recording canvas stands in.
import { describe, expect, it } from 'vitest';
import {
  bevelShadows,
  FILTER_KINDS,
  FILTER_LABELS,
  newFilter,
  patternTileOf,
  rgba,
  shadowDeviation,
  type PatternTile,
} from '../../../../src/core/animation/appearance.ts';
import {
  createAnimation,
  createGroup,
  createLayer,
  createPicture,
  createRect,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { drawObject, drawStage, type StageCanvas } from '../../../../src/core/animation/draw.ts';
import { pasteObjects, pictureIdsOf } from '../../../../src/core/animation/layers.ts';
import { validateObject } from '../../../../src/core/animation/rules.ts';
import { editAt } from '../../../../src/core/animation/tween.ts';
import type {
  AnimationDoc,
  AnimObject,
  ObjectFilter,
  Paint,
} from '../../../../src/core/animation/types.ts';

interface Powers {
  patternOf?: (tile: PatternTile) => object | null;
  withFilters?: StageCanvas['withFilters'];
}

/** Records every call and every property set, in order; `powers` are the optional methods. */
function recorder(powers: Powers = {}) {
  const calls: string[] = [];
  const target: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(target, {
    get(_t, key: string) {
      if (key in target) return target[key];
      if (key === 'withLayer' || key === 'measureText') return undefined;
      if (key === 'patternOf' || key === 'withFilters') return powers[key];
      return (...args: unknown[]) => {
        calls.push(
          `${key}(${args.map((a) => (typeof a === 'number' ? String(Math.round(a * 1000) / 1000) : typeof a === 'string' ? a : '…')).join(',')})`,
        );
        if (key.startsWith('create')) return { addColorStop: () => {} };
        return undefined;
      };
    },
    set(_t, key: string, value: unknown) {
      target[key] = value;
      calls.push(`${key}=${typeof value === 'object' ? 'style' : String(value)}`);
      return true;
    },
  }) as unknown as StageCanvas;
  return { ctx, calls };
}

const pattern = (extra: Partial<Extract<Paint, { kind: 'pattern' }>> = {}): Paint => ({
  kind: 'pattern',
  pattern: 'checks',
  colour: '#ff0000',
  background: '#ffffff',
  size: 10,
  ...extra,
});

function stageWith(objects: AnimObject[], pictures: AnimationDoc['pictures'] = []): AnimationDoc {
  const doc = createAnimation({ name: 'A' });
  return {
    ...doc,
    stage: { ...doc.stage, width: 400, height: 300 },
    pictures,
    layers: [createLayer('Layer 1', { objects })],
  };
}

const round = (m: number[]) => m.map((v) => Math.round(v * 1000) / 1000 || 0);

describe('G12 pattern fills on the canvas', () => {
  it('G12: a shape is filled with its tile repeated, from its box’s top-left corner', () => {
    const tiles: PatternTile[] = [];
    const { ctx, calls } = recorder({
      patternOf: (tile) => {
        tiles.push(tile);
        return { tile: true };
      },
    });
    const rect = { ...createRect({ x: 10, y: 20, width: 100, height: 60 }), fill: pattern() };
    drawStage(ctx, stageWith([{ ...rect, stroke: undefined }]));
    expect(tiles).toHaveLength(1);
    expect([tiles[0]!.width, tiles[0]!.height]).toEqual([10, 10]);
    // Drawn about the box's centre: the tiles start 50 left and 30 up from it.
    expect(round(tiles[0]!.matrix)).toEqual([1, 0, 0, 1, -50, -30]);
    expect(calls).toContain('fillStyle=style');
    expect(calls.at(-2)).toBe('fill()');
  });

  it('G12: the tile is the background, then the shapes in the colour (none: see-through)', () => {
    const tile = patternTileOf(pattern() as never, 100, 60, null)!;
    const { ctx, calls } = recorder();
    tile.draw(ctx);
    expect(calls.slice(0, 2)).toEqual(['fillStyle=#ffffff', 'fillRect(0,0,10,10)']);
    expect(calls.slice(-2)).toEqual(['fillStyle=#ff0000', 'fill()']);
    const clear = recorder();
    patternTileOf(pattern({ background: 'none', pattern: 'dots' }) as never, 1, 1, null)!.draw(
      clear.ctx,
    );
    expect(clear.calls.some((c) => c.startsWith('fillRect'))).toBe(false);
    expect(clear.calls.some((c) => c.startsWith('arc('))).toBe(true);
    // Hatching's lines are outlines of points.
    const lines = recorder();
    patternTileOf(pattern({ pattern: 'hatching', size: 8 }) as never, 1, 1, null)!.draw(lines.ctx);
    expect(lines.calls).toContain('lineTo(7,0)');
  });

  it('G12: the tiles are turned by the pattern’s angle about the box’s centre', () => {
    const tile = patternTileOf(pattern({ angle: 90 }) as never, 100, 60, null)!;
    // Turned a quarter: the box's top-left corner (−50, −30) goes to (30, −50).
    expect(round(tile.matrix)).toEqual([0, 1, -1, 0, 30, -50]);
  });

  it('G12: a picture is tiled at its width, as high as the picture’s proportions', () => {
    const picture = { id: 'p1', path: 'leaf.png', width: 200, height: 100 };
    const image = { name: 'leaf' };
    const tiles: PatternTile[] = [];
    const { ctx } = recorder({ patternOf: (t) => (tiles.push(t), {}) });
    const rect = {
      ...createRect({ x: 0, y: 0, width: 100, height: 100 }),
      fill: pattern({ pattern: 'picture', pictureId: 'p1', size: 40 }),
    };
    drawStage(ctx, stageWith([rect], [picture]), { image: () => image });
    expect([tiles[0]!.width, tiles[0]!.height]).toEqual([40, 20]);
    const inside = recorder();
    tiles[0]!.draw(inside.ctx);
    expect(inside.calls).toEqual(['drawImage(…,0,0,40,20)']);
  });

  it('G12: while the picture loads, or on a canvas that cannot repeat a tile, the colour fills', () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 100, height: 100 }),
      stroke: undefined,
      fill: pattern({ pattern: 'picture', pictureId: 'p1' }),
    };
    const made: PatternTile[] = [];
    const loading = recorder({ patternOf: (t) => (made.push(t), {}) });
    drawStage(loading.ctx, stageWith([rect]), { image: () => null });
    expect(made).toHaveLength(0);
    expect(loading.calls).toContain('fillStyle=#ff0000');
    const plain = recorder();
    drawStage(plain.ctx, stageWith([{ ...rect, fill: pattern() }]));
    expect(plain.calls).toContain('fillStyle=#ff0000');
    // A canvas that gives no pattern for the tile: the colour too.
    const refused = recorder({ patternOf: () => null });
    drawStage(refused.ctx, stageWith([{ ...rect, fill: pattern() }]));
    expect(refused.calls).toContain('fillStyle=#ff0000');
  });

  it('G12: text letters take a pattern fill; on curved text it runs on across the letters', () => {
    const tiles: PatternTile[] = [];
    const { ctx } = recorder({ patternOf: (t) => (tiles.push(t), {}) });
    const text = { ...createText('OK', { x: 0, y: 0, size: 40 }), fill: pattern() };
    drawObject(ctx, text);
    expect(tiles).toHaveLength(1);
    expect(round(tiles[0]!.matrix)).toEqual([1, 0, 0, 1, -text.width / 2, -text.height / 2]);
    const curved = recorder({ patternOf: (t) => (tiles.push(t), {}) });
    tiles.length = 0;
    drawObject(curved.ctx, { ...text, curve: 50 });
    // One tile a letter, each placed back from where its letter is drawn.
    expect(tiles).toHaveLength(2);
    expect(round(tiles[0]!.matrix)).not.toEqual(round(tiles[1]!.matrix));
  });
});

describe('G12 the fill’s and the outline’s own opacity', () => {
  it('G12: each is drawn at its own opacity under the object’s, then the object’s again', () => {
    const { ctx, calls } = recorder();
    const rect = {
      ...createRect({ x: 0, y: 0, width: 10, height: 10 }),
      opacity: 80,
      fillOpacity: 50,
      stroke: { colour: '#000000', width: 2, dash: 'solid' as const, opacity: 25 },
    };
    drawObject(ctx, rect);
    const alphas = calls.filter((c) => c.startsWith('globalAlpha=') || /^(fill|stroke)\(/.test(c));
    expect(alphas).toEqual([
      'globalAlpha=0.8',
      'globalAlpha=0.4',
      'fill()',
      'globalAlpha=0.8',
      'globalAlpha=0.2',
      'stroke()',
      'globalAlpha=0.8',
    ]);
  });

  it('G12: text has them too; at 100 % (or none set) nothing more is drawn', () => {
    const { ctx, calls } = recorder();
    drawObject(ctx, {
      ...createText('Hi', { x: 0, y: 0, size: 20 }),
      fillOpacity: 50,
      stroke: { colour: '#000000', width: 1, dash: 'solid', opacity: 50 },
    });
    expect(calls.filter((c) => c === 'globalAlpha=0.5')).toHaveLength(2);
    const plain = recorder();
    drawObject(plain.ctx, { ...createRect({ x: 0, y: 0, width: 5, height: 5 }), fillOpacity: 100 });
    expect(plain.calls.some((c) => c.startsWith('globalAlpha'))).toBe(false);
    const curved = recorder();
    drawObject(curved.ctx, {
      ...createText('Hi', { x: 0, y: 0, size: 20 }),
      curve: 40,
      fillOpacity: 50,
      stroke: { colour: '#000000', width: 1, dash: 'solid', opacity: 50 },
    });
    expect(curved.calls.filter((c) => c === 'globalAlpha=0.5')).toHaveLength(4);
  });

  it('G12: the outline’s own opacity is a plain change, not a keyframe (100 %: none kept)', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const stroke = rect.stroke!;
    const half = editAt(rect, 12, (o) => ({ ...o, stroke: { ...stroke, opacity: 50 } }));
    expect(half.stroke?.opacity).toBe(50);
    expect(half.tracks ?? []).toEqual([]);
    const back = editAt(half, 0, (o) => ({ ...o, stroke: { ...o.stroke!, opacity: undefined } }));
    expect(back.stroke).toEqual(stroke);
  });

  it('G12: opacities from 0 to 100 % are allowed, others are not', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    expect(() => validateObject({ ...rect, fillOpacity: 0 })).not.toThrow();
    expect(() => validateObject({ ...rect, fillOpacity: 101 })).toThrow(/fill opacity/);
    expect(() => validateObject({ ...rect, fillOpacity: Number.NaN })).toThrow(/fill opacity/);
    expect(() => validateObject({ ...rect, stroke: { ...rect.stroke!, opacity: -1 } })).toThrow(
      /outline opacity/,
    );
  });
});

describe('G12 a picture tiled goes where its object goes', () => {
  it('G12: the picture of a pattern fill is one of the object’s pictures, and comes with a copy', () => {
    const picture = { id: 'p1', path: 'leaf.png', width: 20, height: 20 };
    const rect = {
      ...createRect({ x: 0, y: 0, width: 10, height: 10 }),
      fill: pattern({ pattern: 'picture', pictureId: 'p1' }),
    };
    const shown = createPicture({ id: 'p2', path: 'b.png', width: 5, height: 5 }, { x: 0, y: 0 });
    expect(pictureIdsOf([rect, createGroup([shown, rect])])).toEqual(['p1', 'p2', 'p1']);
    // Pasted into an animation that has the same file under another id: that one is used.
    const other = { ...stageWith([]), pictures: [{ ...picture, id: 'mine' }] };
    const { doc } = pasteObjects(other, other.layers[0]!.id, [rect], [picture]);
    const pasted = doc.layers[0]!.objects[0]!;
    expect(pasted.fill.kind === 'pattern' && pasted.fill.pictureId).toBe('mine');
  });
});

const shadow: ObjectFilter = {
  kind: 'dropShadow',
  colour: '#000000',
  dx: 4,
  dy: 4,
  blur: 6,
  opacity: 50,
};

describe('G14 effects on the canvas', () => {
  it('G14: an object with effects is drawn whole into a layer, given its effects in order', () => {
    const given: { filters: readonly ObjectFilter[]; calls: string[] }[] = [];
    const { ctx, calls } = recorder({
      withFilters: (filters, draw) => {
        const layer = recorder();
        draw(layer.ctx);
        given.push({ filters, calls: layer.calls });
      },
    });
    const glow: ObjectFilter = { kind: 'glow', colour: '#ffff00', blur: 10, opacity: 80 };
    const rect = { ...createRect({ x: 0, y: 0, width: 10, height: 10 }), filters: [shadow, glow] };
    drawStage(ctx, stageWith([rect]));
    expect(given).toHaveLength(1);
    expect(given[0]!.filters).toEqual([shadow, glow]);
    expect(given[0]!.calls).toContain('fill()');
    // Nothing of the object is drawn on the stage itself: only through the layer.
    expect(calls.some((c) => c === 'fill()')).toBe(false);
  });

  it('G14: a group’s effects are the whole group’s; its parts keep their own inside', () => {
    const seen: string[] = [];
    const powers: Powers = {
      withFilters: (filters, draw) => {
        seen.push(filters.map((f) => f.kind).join('+'));
        draw(recorder(powers).ctx);
      },
    };
    const child = { ...createRect({ x: 0, y: 0, width: 10, height: 10 }), filters: [shadow] };
    const group = {
      ...createGroup([child, createRect({ x: 20, y: 0 })]),
      filters: [newFilter('bevel')],
    };
    drawObject(recorder(powers).ctx, group);
    expect(seen).toEqual(['bevel', 'dropShadow']);
  });

  it('G14: a canvas without layers for effects draws the object plainly', () => {
    const { ctx, calls } = recorder();
    drawObject(ctx, { ...createRect({ x: 0, y: 0, width: 10, height: 10 }), filters: [shadow] });
    expect(calls).toContain('fill()');
  });

  it('G14: every kind of effect starts with numbers that are allowed, and has a name', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    expect(FILTER_KINDS).toEqual(['dropShadow', 'innerShadow', 'glow', 'bevel', 'blur']);
    for (const kind of FILTER_KINDS) {
      expect(FILTER_LABELS[kind]).toBeTruthy();
      expect(newFilter(kind).kind).toBe(kind);
      expect(() => validateObject({ ...rect, filters: [newFilter(kind)] })).not.toThrow();
    }
  });

  it('G14: numbers out of range and colours that are not colours are refused, kindly', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const bad = (f: unknown) => () => validateObject({ ...rect, filters: [f as ObjectFilter] });
    expect(bad({ ...shadow, dx: 5000 })).toThrow(/moved up to 1000 px/);
    expect(bad({ ...shadow, colour: 'black' })).toThrow(/filter's colour/);
    expect(bad({ ...shadow, blur: -1 })).toThrow(/blur must be from 0/);
    expect(bad({ ...shadow, opacity: 150 })).toThrow(/opacity must be between/);
    expect(bad({ kind: 'glow', colour: '#ffffff', blur: 400, opacity: 50 })).toThrow(/blur/);
    expect(bad({ ...newFilter('bevel'), depth: 500 })).toThrow(/depth/);
    expect(bad({ ...newFilter('bevel'), angle: Number.NaN })).toThrow(/angle/);
    expect(bad({ ...newFilter('bevel'), shadow: '#12' })).toThrow(/colour/);
    expect(bad({ kind: 'blur', radius: 1000 })).toThrow(/blur/);
    expect(bad({ kind: 'sparkle' })).toThrow(/Choose one of the filters/);
    expect(() =>
      validateObject({ ...rect, filters: Array.from({ length: 11 }, () => shadow) }),
    ).toThrow(/up to 10 filters/);
  });

  it('G14: a bevel is lit on the side the light comes from, shaded on the other', () => {
    // 135°: light from the top left: the light along the top-left edges (pushed down-right).
    const [light, shade] = bevelShadows({ ...newFilter('bevel'), depth: 4 } as never);
    const r = 4 / Math.SQRT2;
    expect(light).toMatchObject({ colour: '#ffffff', dx: round([r])[0], dy: round([r])[0] });
    expect(shade).toMatchObject({ colour: '#000000', dx: -round([r])[0]!, dy: -round([r])[0]! });
    // 90°: from above: the light along the top, the shade along the bottom.
    const [top, bottom] = bevelShadows({ ...newFilter('bevel'), depth: 3, angle: 90 } as never);
    expect([top.dx, top.dy, bottom.dx, bottom.dy]).toEqual([0, 3, 0, -3]);
  });

  it('G14: shadows soften by half their blur (as a canvas and CSS); colours with opacity', () => {
    expect(shadowDeviation(8)).toBe(4);
    expect(rgba('#ff8000', 50)).toBe('rgba(255, 128, 0, 0.5)');
    expect(rgba('#000000', 140)).toBe('rgba(0, 0, 0, 1)');
  });
});
