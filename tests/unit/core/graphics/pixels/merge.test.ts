// G2, GB1 (M21): pixel layers in the document (new, from a picture, opacity, blend, clipping,
// layer masks, duplicate) and merge down, merge visible and flatten — the layers put together as
// the stage draws them.
import { describe, expect, it } from 'vitest';
import { createLayer, createRect } from '../../../../../src/core/animation/factory.ts';
import { addObject, moveObjectsToLayer } from '../../../../../src/core/animation/layers.ts';
import type { AnimationDoc, Layer, PixelContent } from '../../../../../src/core/animation/types.ts';
import { createGraphic } from '../../../../../src/core/graphics/document.ts';
import { clipBaseIndex, isLayerShown } from '../../../../../src/core/graphics/pixels/clipping.ts';
import {
  compositeLayers,
  layerAlone,
  mergeLayers,
  mergePlan,
} from '../../../../../src/core/graphics/pixels/merge.ts';
import {
  addLayerMask,
  addPixelLayer,
  applyMask,
  centredPixels,
  duplicateLayer,
  maskFromSelection,
  removeLayerMask,
  setLayerLook,
} from '../../../../../src/core/graphics/pixels/pixel-layers.ts';
import {
  createBitmap,
  createMask,
  fillRect,
  pixelAt,
  type Bitmap,
} from '../../../../../src/core/graphics/pixels/raster.ts';

/** A Graphics mode image of any size (the tests' are smaller than a new image can be). */
function graphic(width = 8, height = 6, background = 'none'): AnimationDoc {
  const doc = createGraphic({
    name: 'Test',
    size: { width: 100, height: 100, units: 'px', dpi: 96 },
    background,
  });
  return { ...doc, stage: { ...doc.stage, width, height } };
}

const solid = (w: number, h: number, rgba: number[]): Bitmap =>
  fillRect(createBitmap(w, h), { x: 0, y: 0, width: w, height: h }, rgba);

/** A doc of these layers, bottom first (on an 8 × 6 image). */
function withLayers(layers: Layer[], background = 'none'): AnimationDoc {
  return { ...graphic(8, 6, background), layers };
}

const pixelLayer = (name: string, pixels: PixelContent, extra: Partial<Layer> = {}): Layer => ({
  ...createLayer(name),
  pixels,
  ...extra,
});

describe('M21 GB1: pixel layers', () => {
  it('adds an empty pixel layer the size of the image, above the one chosen', () => {
    const doc = graphic(300, 200);
    const { doc: next, layer } = addPixelLayer(doc, { aboveId: doc.layers[0]!.id });
    expect(next.layers.map((l) => l.id)).toEqual([doc.layers[0]!.id, layer.id]);
    expect(layer.name).toBe('Layer 2');
    expect(layer.pixels).toMatchObject({ x: 0, y: 0, bitmap: { width: 300, height: 200 } });
    expect(layer.pixels!.bitmap.tiles.every((t) => t === null)).toBe(true);
  });

  it('adds a picture’s pixels as a layer named after it, in the middle of the image', () => {
    const doc = graphic(300, 200);
    const pixels = centredPixels(doc, solid(101, 50, [255, 0, 0, 255]));
    expect(pixels).toMatchObject({ x: 100, y: 75 });
    const { layer } = addPixelLayer(doc, { name: ' Castle ', pixels });
    expect(layer.name).toBe('Castle');
    const twice = addPixelLayer(addPixelLayer(doc, { name: 'Castle', pixels }).doc, {
      name: 'Castle',
      pixels,
    });
    expect(twice.layer.name).toBe('Castle 2');
  });

  it('is for Graphics mode only', () => {
    const animation = graphic();
    delete animation.graphic;
    expect(() => addPixelLayer(animation)).toThrow(/Graphics mode/);
  });

  it('takes no shapes: they go on a vector layer', () => {
    const { doc, layer } = addPixelLayer(graphic());
    const rect = createRect({ x: 0, y: 0, width: 2, height: 2 });
    expect(() => addObject(doc, layer.id, rect)).toThrow(/pixel layer: shapes, text and pictures/);
    const drawn = addObject(doc, doc.layers[0]!.id, rect);
    expect(() => moveObjectsToLayer(drawn, [rect.id], layer.id)).toThrow(/pixel layer/);
  });
});

describe('M21 G2: opacity, blend mode and clipping', () => {
  it('keeps them on the layer, and off it when they are the usual', () => {
    const doc = graphic();
    const id = doc.layers[0]!.id;
    const { doc: two, layer } = addPixelLayer(doc);
    const set = setLayerLook(two, layer.id, { opacity: 0.4567, blend: 'multiply', clip: true });
    expect(set.layers[1]).toMatchObject({ opacity: 0.457, blend: 'multiply', clip: true });
    const back = setLayerLook(set, layer.id, { opacity: 1, blend: 'normal', clip: false });
    expect(back.layers[1]).not.toHaveProperty('opacity');
    expect(back.layers[1]).not.toHaveProperty('blend');
    expect(back.layers[1]).not.toHaveProperty('clip');
    expect(setLayerLook(back, layer.id, {})).toBe(back);
    expect(setLayerLook(two, id, { opacity: 0.5 }).layers[0]!.opacity).toBe(0.5);
  });

  it('refuses an opacity outside 0–100 %, an unknown mode and clipping the bottom layer', () => {
    const doc = graphic();
    const id = doc.layers[0]!.id;
    expect(() => setLayerLook(doc, id, { opacity: 1.2 })).toThrow(/0 %/);
    expect(() => setLayerLook(doc, id, { opacity: Number.NaN })).toThrow(/0 %/);
    expect(() => setLayerLook(doc, id, { blend: 'burn' as never })).toThrow(/no blend mode/);
    expect(() => setLayerLook(doc, id, { clip: true })).toThrow(/bottom layer/);
    expect(() => setLayerLook(doc, 'gone', { clip: true })).toThrow(/no longer exists/);
    const animation = { ...doc };
    delete animation.graphic;
    expect(() => setLayerLook(animation, id, { opacity: 0.5 })).toThrow(/Graphics mode/);
  });

  it('finds the base a clipped layer clips to, and hides it with a hidden base', () => {
    const base = createLayer('Circle');
    const photo = { ...createLayer('Photo'), clip: true };
    const text = { ...createLayer('Text'), clip: true };
    expect(clipBaseIndex([base, photo, text], 2)).toBe(0);
    expect(clipBaseIndex([base, photo, text], 0)).toBe(-1);
    expect(clipBaseIndex([photo], 0)).toBe(-1);
    expect(clipBaseIndex([{ ...base, mask: true }, photo], 1)).toBe(-1);
    expect(isLayerShown([{ ...base, visible: false }, photo], 1)).toBe(false);
    expect(isLayerShown([base, photo], 1)).toBe(true);
    expect(isLayerShown([base, { ...photo, visible: false }], 1)).toBe(false);
  });
});

describe('M21 GB2: layer masks', () => {
  it('adds one showing everything, or the selection’s part, and takes it off again', () => {
    const doc = graphic();
    const { doc: two, layer } = addPixelLayer(doc, {
      pixels: { bitmap: solid(4, 4, [0, 0, 255, 255]), x: 2, y: 1 },
    });
    const masked = addLayerMask(two, layer.id);
    const mask = masked.layers[1]!.pixels!.mask!;
    expect(pixelAt(mask, 3, 3)).toBe(255);
    expect(() => addLayerMask(masked, layer.id)).toThrow(/has a layer mask already/);
    expect(removeLayerMask(masked, layer.id, false).layers[1]!.pixels).not.toHaveProperty('mask');
    expect(() => removeLayerMask(two, layer.id, false)).toThrow(/no layer mask/);
    // The selection (image-sized) cut to where the layer lies.
    const selection = fillRect(createMask(8, 6), { x: 0, y: 0, width: 3, height: 6 }, 255);
    const own = maskFromSelection(selection, two.layers[1]!.pixels!);
    expect([pixelAt(own, 0, 0), pixelAt(own, 1, 0)]).toEqual([255, 0]);
    expect(() => addLayerMask(two, layer.id, createMask(2, 2))).toThrow(/size of the layer/);
    const applied = removeLayerMask(addLayerMask(two, layer.id, own), layer.id, true);
    const bitmap = applied.layers[1]!.pixels!.bitmap;
    expect(pixelAt(bitmap, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(bitmap, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(() => addLayerMask(doc, doc.layers[0]!.id)).toThrow(/pixel layer/);
  });

  it('applies a half mask as half the alpha, and leaves an empty tile empty', () => {
    const bitmap = createBitmap(300, 2);
    const half = fillRect(createMask(300, 2), { x: 0, y: 0, width: 300, height: 2 }, 128);
    expect(applyMask(bitmap, half)).toBe(bitmap);
    const red = solid(2, 1, [255, 0, 0, 255]);
    expect(
      pixelAt(
        applyMask(red, fillRect(createMask(2, 1), { x: 0, y: 0, width: 2, height: 1 }, 128)),
        0,
        0,
      ),
    ).toEqual([255, 0, 0, 128]);
  });
});

describe('M21 G2: duplicate layer', () => {
  it('copies a pixel layer above it, sharing its tiles', () => {
    const { doc, layer } = addPixelLayer(graphic(), {
      pixels: { bitmap: solid(4, 4, [1, 2, 3, 255]), x: 0, y: 0 },
    });
    const { doc: next, layer: copy } = duplicateLayer(
      { ...doc, layers: doc.layers.map((l) => ({ ...l, locked: true })) },
      layer.id,
    );
    expect(next.layers.map((l) => l.name)).toEqual(['Layer 1', 'Layer 2', 'Layer 2 copy']);
    expect(copy.pixels!.bitmap).toBe(layer.pixels!.bitmap);
    expect(copy.locked).toBe(false);
    expect(copy.id).not.toBe(layer.id);
  });

  it('copies a vector layer’s objects with new ids and names', () => {
    const doc = graphic();
    const rect = { ...createRect({ x: 0, y: 0, width: 2, height: 2 }), name: 'Star' };
    const drawn = addObject(doc, doc.layers[0]!.id, rect);
    const { doc: next, layer } = duplicateLayer(drawn, doc.layers[0]!.id);
    expect(layer.objects[0]!.id).not.toBe(rect.id);
    expect(layer.objects[0]!.name).toBe('Star 2');
    expect(next.layers[1]!.objects).toHaveLength(1);
    expect(() => duplicateLayer(doc, 'gone')).toThrow(/no longer exists/);
  });
});

describe('M21 G2: the layers put together as the stage draws them', () => {
  const red = solid(2, 2, [255, 0, 0, 255]);
  const blue = solid(2, 2, [0, 0, 255, 255]);
  const at = (b: Bitmap) => ({ bitmap: b, x: 0, y: 0 });
  const area = { x: 0, y: 0, width: 2, height: 2 };

  it('puts each layer at its opacity, in its blend mode, on the background', () => {
    const out = compositeLayers(
      [
        { pixels: at(blue), opacity: 1, blend: 'normal', clip: false },
        { pixels: at(red), opacity: 0.5, blend: 'normal', clip: false },
      ],
      area,
    );
    expect(pixelAt(out, 1, 1)).toEqual([128, 0, 128, 255]);
    const grey = compositeLayers(
      [
        {
          pixels: at(solid(2, 2, [128, 128, 128, 255])),
          opacity: 1,
          blend: 'multiply',
          clip: false,
        },
      ],
      area,
      '#ff0000',
    );
    expect(pixelAt(grey, 0, 0)).toEqual([128, 0, 0, 255]);
  });

  it('shows a clipped layer only inside its base, at its own opacity, then at the base’s', () => {
    const circle = fillRect(
      createBitmap(2, 2),
      { x: 0, y: 0, width: 1, height: 2 },
      [0, 255, 0, 255],
    );
    const out = compositeLayers(
      [
        { pixels: at(circle), opacity: 0.5, blend: 'normal', clip: false },
        { pixels: at(red), opacity: 1, blend: 'normal', clip: true },
      ],
      area,
    );
    expect(pixelAt(out, 0, 0)).toEqual([255, 0, 0, 128]);
    expect(pixelAt(out, 1, 0)).toEqual([0, 0, 0, 0]);
    // A clipped layer at the bottom is an ordinary layer.
    expect(
      pixelAt(
        compositeLayers([{ pixels: at(red), opacity: 1, blend: 'normal', clip: true }], area),
        1,
        1,
      ),
    ).toEqual([255, 0, 0, 255]);
    // Nothing of the base here: nothing of the group.
    const off = compositeLayers(
      [
        { pixels: { bitmap: circle, x: 5, y: 5 }, opacity: 1, blend: 'normal', clip: false },
        { pixels: at(red), opacity: 1, blend: 'normal', clip: true },
        { pixels: { bitmap: blue, x: 9, y: 9 }, opacity: 1, blend: 'normal', clip: true },
      ],
      area,
    );
    expect(off.tiles.every((t) => t === null)).toBe(true);
  });

  it('uses a layer mask, and covers only the area asked for', () => {
    const half = fillRect(createMask(2, 2), { x: 0, y: 0, width: 2, height: 1 }, 255);
    const out = compositeLayers(
      [
        {
          pixels: { bitmap: red, x: 1, y: 1, mask: half },
          opacity: 1,
          blend: 'normal',
          clip: false,
        },
      ],
      { x: 1, y: 1, width: 2, height: 2 },
    );
    expect(pixelAt(out, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(out, 0, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe('M21 G2: merge down, merge visible, flatten', () => {
  const red = (x = 0, y = 0) => ({ bitmap: solid(2, 2, [255, 0, 0, 255]), x, y });
  const blue = (x = 0, y = 0) => ({ bitmap: solid(2, 2, [0, 0, 255, 255]), x, y });

  it('merges a layer into the one below: its place, name and blend kept', () => {
    const below = pixelLayer('Sky', blue(), { blend: 'screen', opacity: 0.5 });
    const top = pixelLayer('Castle', red(3, 3), { opacity: 0.5 });
    const doc = withLayers([createLayer('Back'), below, top]);
    expect(mergePlan(doc, 'down', top.id)).toEqual({ ids: [below.id, top.id], vector: [] });
    const merged = mergeLayers(doc, 'down', top.id, {});
    expect(merged.layers.map((l) => l.name)).toEqual(['Back', 'Sky']);
    const layer = merged.layers[1]!;
    expect(layer).toMatchObject({ id: below.id, blend: 'screen', pixels: { x: 0, y: 0 } });
    expect(layer).not.toHaveProperty('opacity');
    expect(layer.pixels!.bitmap).toMatchObject({ width: 5, height: 5 });
    expect(pixelAt(layer.pixels!.bitmap, 0, 0)).toEqual([0, 0, 255, 128]);
    expect(pixelAt(layer.pixels!.bitmap, 4, 4)).toEqual([255, 0, 0, 128]);
  });

  it('keeps a layer clipped to the lower one clipped inside it, and the lower one’s clipping', () => {
    const base = pixelLayer('Circle', blue());
    const photo = pixelLayer('Photo', red(1, 0), { clip: true });
    const merged = mergeLayers(withLayers([base, photo]), 'down', photo.id, {});
    const bitmap = merged.layers[0]!.pixels!.bitmap;
    expect(pixelAt(bitmap, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(bitmap, 2, 0)).toEqual([0, 0, 0, 0]);
    // Both clipped to the same base: the merged layer is clipped, the upper one not cut by the lower.
    const both = withLayers([
      base,
      pixelLayer('A', blue(), { clip: true }),
      pixelLayer('B', red(1, 0), { clip: true }),
    ]);
    const m = mergeLayers(both, 'down', both.layers[2]!.id, {});
    expect(m.layers[1]).toMatchObject({ clip: true });
    expect(pixelAt(m.layers[1]!.pixels!.bitmap, 2, 0)).toEqual([255, 0, 0, 255]);
  });

  it('says why a layer cannot be merged down', () => {
    const one = pixelLayer('One', red());
    const doc = withLayers([one, pixelLayer('Two', blue(), { locked: true })]);
    expect(() => mergePlan(doc, 'down', one.id)).toThrow(/no layer below One/);
    expect(() => mergePlan(doc, 'down', doc.layers[1]!.id)).toThrow(/Two is locked/);
    const hidden = withLayers([one, pixelLayer('Two', blue(), { visible: false })]);
    expect(() => mergePlan(hidden, 'down', hidden.layers[1]!.id)).toThrow(/hidden/);
    const mask = withLayers([one, { ...createLayer('M'), mask: true }]);
    expect(() => mergePlan(mask, 'down', mask.layers[1]!.id)).toThrow(/M is a mask/);
    const template = withLayers([one, { ...createLayer('T'), template: true }]);
    expect(() => mergePlan(template, 'down', template.layers[1]!.id)).toThrow(/T is a template/);
    expect(() => mergePlan(doc, 'down', 'gone')).toThrow(/no longer exists/);
    const animation = { ...doc };
    delete animation.graphic;
    expect(() => mergePlan(animation, 'down', one.id)).toThrow(/Graphics mode/);
  });

  it('draws a vector layer into the pixels it is given', () => {
    const shapes = createLayer('Logo');
    const doc = withLayers([pixelLayer('Photo', blue()), shapes]);
    expect(mergePlan(doc, 'down', shapes.id).vector).toEqual([shapes.id]);
    expect(() => mergeLayers(doc, 'down', shapes.id, {})).toThrow(/changed while/);
    const drawn = solid(8, 6, [255, 0, 0, 255]);
    const merged = mergeLayers(doc, 'down', shapes.id, { [shapes.id]: drawn });
    expect(merged.layers).toHaveLength(1);
    expect(merged.layers[0]!.pixels!.bitmap).toMatchObject({ width: 8, height: 6 });
    expect(pixelAt(merged.layers[0]!.pixels!.bitmap, 7, 5)).toEqual([255, 0, 0, 255]);
  });

  it('merges every layer showing into the lowest, leaving hidden ones, masks gone with theirs', () => {
    const vector = createLayer('Shapes');
    const layers = [
      pixelLayer('Hidden', red(), { visible: false }),
      pixelLayer('Sky', blue()),
      vector,
      { ...createLayer('Its mask'), mask: true },
      pixelLayer('Off', red(), { clip: true, visible: true }),
      { ...createLayer('T'), template: true },
    ];
    const doc = withLayers(layers);
    const plan = mergePlan(doc, 'visible', layers[1]!.id);
    expect(plan.ids).toEqual([layers[1]!.id, vector.id, layers[4]!.id]);
    expect(plan.vector).toEqual([vector.id]);
    const merged = mergeLayers(doc, 'visible', layers[1]!.id, {
      [vector.id]: createBitmap(8, 6),
    });
    expect(merged.layers.map((l) => l.name)).toEqual(['Hidden', 'Sky', 'T']);
    expect(merged.layers[1]).not.toHaveProperty('clip');
    const one = withLayers([pixelLayer('A', red()), pixelLayer('B', red(), { visible: false })]);
    expect(() => mergePlan(one, 'visible', one.layers[0]!.id)).toThrow(/Only one layer/);
  });

  it('flattens onto the background, on the canvas, dropping hidden layers and folders', () => {
    const top = pixelLayer(
      'Castle',
      { bitmap: solid(4, 4, [255, 0, 0, 255]), x: 6, y: 4 },
      { folderId: 'f' },
    );
    const doc = {
      ...withLayers(
        [
          pixelLayer('Hidden', blue(), { visible: false }),
          top,
          { ...createLayer('T'), template: true, folderId: 'f' },
        ],
        '#00ff00',
      ),
      folders: [{ id: 'f', name: 'Folder', open: true }],
    };
    const flat = mergeLayers(doc, 'flatten', top.id, {});
    expect(flat.layers.map((l) => l.name)).toEqual(['Background', 'T']);
    expect(flat.folders).toEqual([]);
    expect(flat.layers[1]).not.toHaveProperty('folderId');
    const bitmap = flat.layers[0]!.pixels!.bitmap;
    expect(bitmap).toMatchObject({ width: 8, height: 6 });
    expect(pixelAt(bitmap, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(bitmap, 7, 5)).toEqual([255, 0, 0, 255]);
    const none = withLayers([pixelLayer('Hidden', blue(), { visible: false })]);
    expect(() => mergePlan(none, 'flatten', none.layers[0]!.id)).toThrow(/No layer is showing/);
  });

  it('draws a layer on its own to rasterise it: full strength, with its mask layer', () => {
    const shapes = {
      ...createLayer('Logo'),
      opacity: 0.5,
      blend: 'multiply' as const,
      clip: true,
      visible: false,
    };
    const mask = { ...createLayer('Mask'), mask: true };
    const doc = withLayers([pixelLayer('Photo', blue()), shapes, mask], '#ffffff');
    const alone = layerAlone(doc, shapes.id);
    expect(alone.stage.background).toBe('none');
    expect(alone.layers).toHaveLength(2);
    expect(alone.layers[0]).toMatchObject({ visible: true });
    expect(alone.layers[0]).not.toHaveProperty('opacity');
    expect(alone.layers[0]).not.toHaveProperty('blend');
    expect(alone.layers[0]).not.toHaveProperty('clip');
    expect(alone.layers[1]).toMatchObject({ mask: true, locked: true });
    expect(layerAlone(doc, doc.layers[0]!.id).layers).toHaveLength(1);
    expect(() => layerAlone(doc, 'gone')).toThrow(/no longer exists/);
  });

  it('keeps the lower layer’s colour and folder; a mask layer at the bottom stays', () => {
    const below = pixelLayer('Sky', blue(), { colour: '#ff0000', folderId: 'f' });
    const top = pixelLayer('Castle', red());
    const lone = { ...createLayer('Lone mask'), mask: true };
    const doc = {
      ...withLayers([lone, below, top]),
      folders: [{ id: 'f', name: 'F', open: true }],
    };
    const merged = mergeLayers(doc, 'down', top.id, {});
    expect(merged.layers[1]).toMatchObject({ colour: '#ff0000', folderId: 'f' });
    const visible = mergeLayers(doc, 'visible', below.id, {});
    expect(visible.layers.map((l) => l.name)).toEqual(['Lone mask', 'Sky']);
  });

  it('leaves out a layer with nothing where it is put together', () => {
    const out = compositeLayers(
      [
        {
          pixels: { bitmap: solid(2, 2, [1, 2, 3, 255]), x: 50, y: 50 },
          opacity: 1,
          blend: 'normal',
          clip: false,
        },
      ],
      { x: 0, y: 0, width: 2, height: 2 },
    );
    expect(out.tiles.every((t) => t === null)).toBe(true);
  });
});
