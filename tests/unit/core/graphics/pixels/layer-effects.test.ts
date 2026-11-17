// M22 step 5 (G14 on pixel layers): a pixel layer's effects — drop shadow, inner shadow, glow
// (the NightScene's halo, the Lens's light blooms), bevel (workbook Task 9's plaque) and blur —
// set on the layer, drawn from its pixels through withFilters exactly as an object's are, inside
// its own picture before its opacity and blend mode (a clipping group's base: from the whole
// group), written to the SVG as filters, kept in the file, and drawn into pixels by the renderer
// when the layer is merged.
import { describe, expect, it } from 'vitest';
import { newFilter } from '../../../../../src/core/animation/appearance.ts';
import { createLayer, createRect } from '../../../../../src/core/animation/factory.ts';
import {
  drawStage,
  type LayerHow,
  type StageCanvas,
} from '../../../../../src/core/animation/draw.ts';
import {
  deserializeAnimation,
  pixelFiles,
  serializeAnimation,
} from '../../../../../src/core/animation/serialize.ts';
import { stageSvg } from '../../../../../src/core/animation/svg-export.ts';
import type { AnimationDoc, Layer, ObjectFilter } from '../../../../../src/core/animation/types.ts';
import { createGraphic } from '../../../../../src/core/graphics/document.ts';
import { setLayerEffects } from '../../../../../src/core/graphics/pixels/layer-effects.ts';
import {
  layerAlone,
  mergeLayers,
  mergePlan,
} from '../../../../../src/core/graphics/pixels/merge.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  type Bitmap,
  type Mask,
} from '../../../../../src/core/graphics/pixels/raster.ts';

const GLOW: ObjectFilter = { kind: 'glow', colour: '#fff4c0', blur: 30, opacity: 80 };
const SHADOW = newFilter('dropShadow');
const BEVEL = newFilter('bevel');

/** A canvas that writes down what is drawn: layers and effects as nested [ … ] and { … }. */
function recorder(powers = { layers: true, filters: true }) {
  const calls: string[] = [];
  const target: Record<string, unknown> = {
    globalAlpha: 1,
    drawBitmap: (_b: unknown, x: number, y: number, key: string, mask?: Mask) =>
      calls.push(
        `bitmap ${key} at ${x},${y}${mask ? ' masked' : ''} alpha ${String(target.globalAlpha ?? 1)} ${String(target.globalCompositeOperation ?? 'source-over')}`,
      ),
  };
  if (powers.layers)
    target.withLayer = (alpha: number, draw: (c: StageCanvas) => void, how: LayerHow = {}) => {
      calls.push(`[ layer ${alpha}${how.blend ? ` ${how.blend}` : ''}${how.clip ? ' clip' : ''}`);
      draw(ctx);
      calls.push(']');
    };
  if (powers.filters)
    target.withFilters = (filters: readonly ObjectFilter[], draw: (c: StageCanvas) => void) => {
      calls.push(`{ effects ${filters.map((f) => f.kind).join(' ')}`);
      draw(ctx);
      calls.push('}');
    };
  const saved: Record<string, unknown>[] = [];
  const ctx = new Proxy(target, {
    get(_t, key: string) {
      if (key in target) return target[key];
      if (key === 'save') return () => saved.push({ ...target });
      if (key === 'restore')
        return () => {
          const s = saved.pop()!;
          for (const k of ['globalAlpha', 'globalCompositeOperation']) target[k] = s[k];
        };
      if (['measureText', 'withFilters', 'patternOf', 'withLayer'].includes(key)) return undefined;
      return () => {
        if (key === 'fill') calls.push(`fill alpha ${String(target.globalAlpha)}`);
        if (key.startsWith('create')) return { addColorStop: () => {} };
        return undefined;
      };
    },
    set(_t, key: string, value: unknown) {
      target[key] = value;
      return true;
    },
  }) as unknown as StageCanvas;
  return { ctx, calls };
}

function image(layers: Layer[], width = 100, height = 80): AnimationDoc {
  const doc = createGraphic({
    name: 'NightScene',
    size: { width: 100, height: 80, units: 'px', dpi: 96 },
    background: '#ffffff',
  });
  return { ...doc, stage: { ...doc.stage, width, height }, layers };
}

const solid = (w: number, h: number, rgba: number[]): Bitmap =>
  fillRect(createBitmap(w, h), { x: 0, y: 0, width: w, height: h }, rgba);

const photo = (name: string, extra: Partial<Layer> = {}): Layer => ({
  ...createLayer(name),
  id: name,
  pixels: { bitmap: createBitmap(4, 4), x: 1, y: 2 },
  ...extra,
});

const rects = (name: string, extra: Partial<Layer> = {}): Layer => ({
  ...createLayer(name),
  objects: [createRect({ x: 0, y: 0, width: 10, height: 10 })],
  ...extra,
});

describe('M22 G14: a pixel layer’s effects set on it', () => {
  it('keeps them on the pixel layer, in order, and off it when there are none', () => {
    const doc = image([photo('Moon')]);
    const halo = setLayerEffects(doc, 'Moon', [GLOW, SHADOW]);
    expect(halo.layers[0]!.effects).toEqual([GLOW, SHADOW]);
    expect(doc.layers[0]).not.toHaveProperty('effects');
    const none = setLayerEffects(halo, 'Moon', []);
    expect(none.layers[0]).not.toHaveProperty('effects');
    expect(setLayerEffects(none, 'Moon', undefined)).toBe(none);
  });

  it('can be given to a locked layer (they are how it looks, as its opacity)', () => {
    const doc = image([photo('Moon', { locked: true })]);
    expect(setLayerEffects(doc, 'Moon', [GLOW]).layers[0]!.effects).toEqual([GLOW]);
  });

  it('G10 (M23, M/21 globe): a vector layer has them too; a mask layer does not; numbers out of range are refused, as an object’s', () => {
    const doc = image([rects('Logo'), photo('Moon'), rects('Mask', { mask: true })]);
    const stroke = newFilter('stroke');
    expect(setLayerEffects(doc, doc.layers[0]!.id, [stroke]).layers[0]!.effects).toEqual([stroke]);
    expect(() => setLayerEffects(doc, doc.layers[2]!.id, [GLOW])).toThrow(/mask layer/);
    expect(() => setLayerEffects(doc, 'Moon', [{ ...GLOW, opacity: 140 }])).toThrow(/opacity/);
    expect(() => setLayerEffects(doc, 'Moon', [{ ...GLOW, blur: -1 }])).toThrow(/blur/);
    expect(() =>
      setLayerEffects(
        doc,
        'Moon',
        Array.from({ length: 11 }, () => GLOW),
      ),
    ).toThrow(/A layer can have up to 10/);
  });
});

describe('M22 G14: a pixel layer drawn with its effects', () => {
  it('draws its pixels (through its mask) inside withFilters, as an object’s', () => {
    const mask = createMask(4, 4);
    const layer = photo('Moon', { effects: [GLOW, BEVEL] });
    const masked: Layer = { ...layer, pixels: { ...layer.pixels!, mask } };
    const { ctx, calls } = recorder();
    drawStage(ctx, image([masked]));
    expect(calls).toEqual([
      '{ effects glow bevel',
      'bitmap Moon at 1,2 masked alpha 1 source-over',
      '}',
    ]);
  });

  it('applies its opacity and blend mode to the picture with its effects (layer styles)', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, image([photo('Blooms', { effects: [GLOW], opacity: 0.6, blend: 'screen' })]));
    expect(calls).toEqual([
      '[ layer 0.6 screen',
      '{ effects glow',
      'bitmap Blooms at 1,2 alpha 1 source-over',
      '}',
      ']',
    ]);
  });

  it('makes a clipping base’s effects from the whole group, the clipped layers inside its picture', () => {
    const { ctx, calls } = recorder();
    drawStage(
      ctx,
      image([
        photo('Plaque', { effects: [BEVEL], opacity: 0.9 }),
        photo('Metal', { clip: true, effects: [SHADOW], opacity: 0.5 }),
      ]),
    );
    expect(calls).toEqual([
      '[ layer 0.9',
      '{ effects bevel',
      '[ layer 1',
      'bitmap Plaque at 1,2 alpha 1 source-over',
      '[ layer 0.5 clip',
      '{ effects dropShadow',
      'bitmap Metal at 1,2 alpha 1 source-over',
      '}',
      ']',
      ']',
      '}',
      ']',
    ]);
  });

  it('draws a clipping base without effects as before', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, image([photo('Circle'), photo('Photo', { clip: true })]));
    expect(calls).toEqual([
      '[ layer 1',
      'bitmap Circle at 1,2 alpha 1 source-over',
      '[ layer 1 clip',
      'bitmap Photo at 1,2 alpha 1 source-over',
      ']',
      ']',
    ]);
  });

  it('draws plain pixels on a canvas without effects, and none in the outline view', () => {
    const doc = image([photo('Moon', { effects: [GLOW], opacity: 0.5 })]);
    const flat = recorder({ layers: true, filters: false });
    drawStage(flat.ctx, doc);
    expect(flat.calls).toEqual(['bitmap Moon at 1,2 alpha 0.5 source-over']);
    const outline = recorder();
    drawStage(outline.ctx, doc, { editing: true, wireframe: { lineWidth: 1 } });
    expect(outline.calls.join('\n')).not.toContain('effects');
    // A canvas with effects but no layers: the effects, at full strength.
    const bare = recorder({ layers: false, filters: true });
    drawStage(bare.ctx, doc);
    expect(bare.calls).toEqual(['{ effects glow', 'bitmap Moon at 1,2 alpha 1 source-over', '}']);
  });

  it('G10 (M23): draws a vector layer’s effects from all its objects together', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, image([rects('Logo', { effects: [GLOW] })]));
    expect(calls).toEqual(['{ effects glow', 'fill alpha 1', '}']);
  });

  it('G10 (M23, M/21 globe): a vector base’s stroke goes round the whole clipping group', () => {
    const { ctx, calls } = recorder();
    const stroke = newFilter('stroke');
    drawStage(ctx, image([rects('Globe', { effects: [stroke] }), photo('Map', { clip: true })]));
    expect(calls).toEqual([
      '[ layer 1',
      '{ effects stroke',
      '[ layer 1',
      'fill alpha 1',
      '[ layer 1 clip',
      'bitmap Map at 1,2 alpha 1 source-over',
      ']',
      ']',
      '}',
      ']',
    ]);
  });
});

describe('M22 G14: the SVG of a pixel layer with effects', () => {
  it('puts the layer’s <image> in a group with the same SVG filter an object gets', () => {
    const doc = image([photo('Moon', { effects: [GLOW], opacity: 0.5 })]);
    const svg = stageSvg(doc, 0, {}, [], {}, undefined, undefined, { Moon: 'data:moon' });
    expect(svg).toMatch(/<g opacity="0.5">\n<g filter="url\(#f1\)">\n<image href="data:moon"/);
    expect(svg).toContain('<filter id="f1" filterUnits="userSpaceOnUse"');
    expect(svg).toContain('flood-color="#fff4c0" flood-opacity="0.8"');
    // The same filter as an object with the glow.
    const object = image([
      { ...rects('Logo'), objects: [{ ...rects('L').objects[0]!, filters: [GLOW] }] },
    ]);
    const filterOf = (s: string) => s.match(/<filter id="f1"[^]*?<\/filter>/)![0];
    expect(filterOf(svg)).toBe(filterOf(stageSvg(object)));
  });

  it('masks the clipped layers by the base alone, inside the base’s effects', () => {
    const doc = image([photo('Plaque', { effects: [BEVEL] }), photo('Metal', { clip: true })]);
    const svg = stageSvg(doc, 0, {}, [], {}, undefined, undefined, {
      Plaque: 'data:p',
      Metal: 'data:m',
    });
    expect(svg).toMatch(
      /<g>\n<g filter="url\(#f1\)">\n<g>\n<g id="b1">\n<image href="data:p"[^\n]*\/>\n<\/g>\n<g mask="url\(#m1\)">\n<image href="data:m"[^\n]*\/>\n<\/g>\n<\/g>\n<\/g>\n<\/g>/,
    );
  });
});

describe('M22 G14: a pixel layer’s effects in the file', () => {
  const read = (doc: AnimationDoc, text = serializeAnimation(doc)) => {
    const files = new Map(pixelFiles(doc).map((f) => [f.file, f.raster]));
    return deserializeAnimation(text, (f) => files.get(f));
  };

  it('keeps them, still file version 5', () => {
    const doc = image([photo('Moon', { effects: [GLOW, BEVEL, { kind: 'blur', radius: 2 }] })]);
    const text = serializeAnimation(doc);
    expect(JSON.parse(text).schemaVersion).toBe(5);
    expect(read(doc, text).layers[0]!.effects).toEqual(doc.layers[0]!.effects);
  });

  it('refuses damaged ones; G10 (M23): keeps a vector layer’s', () => {
    const doc = image([photo('Moon', { effects: [GLOW] })]);
    const damaged = serializeAnimation(doc).replace('"glow"', '"sparkle"');
    expect(() => read(doc, damaged)).toThrow(/damaged/);
    const logo = image([rects('Logo', { effects: [newFilter('stroke')] })]);
    expect(deserializeAnimation(serializeAnimation(logo)).layers[0]!.effects).toEqual([
      newFilter('stroke'),
    ]);
    const notList = JSON.parse(serializeAnimation(doc));
    notList.layers[0].effects = GLOW;
    expect(() => read(doc, JSON.stringify(notList))).toThrow(/damaged/);
  });
});

describe('M22 G14: a layer with effects merged into pixels', () => {
  const at = (x: number, y: number, bitmap: Bitmap) => ({ bitmap, x, y });
  const red = solid(2, 2, [255, 0, 0, 255]);
  const blue = solid(2, 2, [0, 0, 255, 255]);
  /** What the renderer drew: the canvas (8 × 6) in one colour. */
  const drawn = (rgba: number[]) => solid(8, 6, rgba);

  it('G10 (M23): a vector base with effects is drawn with the layers clipped to it, once', () => {
    const doc = image([
      rects('Globe', { effects: [newFilter('stroke')] }),
      photo('Map', { clip: true }),
    ]);
    const globe = doc.layers[0]!.id;
    expect(mergePlan(doc, 'flatten', 'Map')).toEqual({
      ids: [globe, 'Map'],
      vector: [globe],
      effects: [],
    });
    expect(layerAlone(doc, globe, [globe, 'Map']).layers.map((l) => l.name)).toEqual([
      'Globe',
      'Map',
    ]);
  });

  it('asks for it to be drawn with its effects by the renderer, on the canvas', () => {
    const moon = photo('Moon', { pixels: at(3, 3, red), effects: [GLOW], opacity: 0.5 });
    const doc = image([photo('Sky', { pixels: at(0, 0, blue) }), moon], 8, 6);
    const plan = mergePlan(doc, 'down', 'Moon');
    expect(plan).toEqual({ ids: ['Sky', 'Moon'], vector: [], effects: ['Moon'] });
    expect(() => mergeLayers(doc, 'down', 'Moon', {})).toThrow(/changed while/);
    const merged = mergeLayers(doc, 'down', 'Moon', { Moon: drawn([255, 255, 0, 255]) });
    expect(merged.layers).toHaveLength(1);
    const layer = merged.layers[0]!;
    expect(layer).not.toHaveProperty('effects');
    expect(layer.pixels).toMatchObject({ x: 0, y: 0 });
    // The glow as drawn, at the layer's opacity, over the sky.
    expect(pixelAt(layer.pixels!.bitmap, 0, 0)).toEqual([128, 128, 128, 255]);
    expect(pixelAt(layer.pixels!.bitmap, 7, 5)).toEqual([255, 255, 0, 128]);
  });

  it('draws the layer alone with its effects, and a clipping base with the layers merged', () => {
    const base = photo('Plaque', { effects: [BEVEL], opacity: 0.5, blend: 'multiply' });
    const metal = photo('Metal', { clip: true, opacity: 0.7 });
    const hidden = photo('Hidden', { clip: true, visible: false });
    const left = photo('Left out', { clip: true });
    const doc = image([base, metal, hidden, left, photo('Top')]);
    const alone = layerAlone(doc, 'Plaque', ['Plaque', 'Metal', 'Hidden', 'Top']);
    expect(alone.layers.map((l) => l.id)).toEqual(['Plaque', 'Metal']);
    expect(alone.layers[0]).toMatchObject({ effects: [BEVEL] });
    expect(alone.layers[0]).not.toHaveProperty('opacity');
    expect(alone.layers[0]).not.toHaveProperty('blend');
    expect(alone.layers[1]).toMatchObject({ clip: true, opacity: 0.7 });
    expect(layerAlone(doc, 'Plaque').layers.map((l) => l.id)).toEqual(['Plaque']);
    // Without effects, a base comes alone (its clipped layers are put together here).
    const plain = image([photo('Circle'), photo('Photo', { clip: true })]);
    expect(layerAlone(plain, 'Circle', ['Circle', 'Photo']).layers).toHaveLength(1);
  });

  it('does not put down again the layers clipped to a base drawn with its effects', () => {
    const base = photo('Plaque', { pixels: at(0, 0, blue), effects: [BEVEL] });
    const metal = photo('Metal', { pixels: at(0, 0, red), clip: true });
    const doc = image([base, metal], 8, 6);
    const plan = mergePlan(doc, 'down', 'Metal');
    expect(plan.effects).toEqual(['Plaque']);
    const merged = mergeLayers(doc, 'down', 'Metal', { Plaque: drawn([0, 255, 0, 255]) });
    // Only the group as the renderer drew it: the red is not put on it a second time.
    expect(pixelAt(merged.layers[0]!.pixels!.bitmap, 0, 0)).toEqual([0, 255, 0, 255]);
    // A layer clipped to a base without effects, which has effects itself: drawn alone with them,
    // then clipped to the base here.
    const glowing = image(
      [
        photo('Circle', { pixels: at(0, 0, blue) }),
        photo('Bloom', { pixels: at(4, 4, red), clip: true, effects: [GLOW] }),
      ],
      8,
      6,
    );
    const m = mergeLayers(glowing, 'visible', 'Circle', { Bloom: drawn([255, 255, 255, 255]) });
    const bitmap = m.layers[0]!.pixels!.bitmap;
    expect(pixelAt(bitmap, 1, 1)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(bitmap, 5, 5)).toEqual([0, 0, 0, 0]);
  });
});
