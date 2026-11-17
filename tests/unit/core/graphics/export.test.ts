// M18 / G11: exporting an image — its pixel size and resolution, an SVG in cm, and the chosen
// objects alone or each in a file of its own.
import { describe, expect, it } from 'vitest';
import { createEllipse, createLayer, createRect } from '../../../../src/core/animation/factory.ts';
import { createBitmap } from '../../../../src/core/graphics/pixels/raster.ts';
import { addObject, groupObjects } from '../../../../src/core/animation/layers.ts';
import { createGraphic, defaultGraphic } from '../../../../src/core/graphics/document.ts';
import {
  COLOUR_DEPTHS,
  colourDepth,
  exportPixels,
  FORMAT_INFO,
  GRAPHIC_FORMATS,
  keepsTransparency,
  imageOfObjects,
  imagesOfEach,
  imagesOfLayers,
  jpegQuality,
  svgDimensions,
} from '../../../../src/core/graphics/export.ts';
import { EditError } from '../../../../src/core/model/errors.ts';

describe('exportPixels (G11)', () => {
  const canvas = { width: 800, height: 400 };

  it('is the canvas, or another width or height with the other side in proportion', () => {
    expect(exportPixels(canvas, 96)).toEqual({ width: 800, height: 400, dpi: 96 });
    // 9626/04 J/20: "a non-transparent bitmap format with a width of 600px".
    expect(exportPixels(canvas, 96, { by: 'width', px: 600 })).toEqual({
      width: 600,
      height: 300,
      dpi: 96,
    });
    // M/21: "export the image with a height of 500 pixels".
    expect(exportPixels(canvas, 96, { by: 'height', px: 500 })).toEqual({
      width: 1000,
      height: 500,
      dpi: 96,
    });
    expect(exportPixels(canvas, 96, { by: 'percent', percent: 50 })).toEqual({
      width: 400,
      height: 200,
      dpi: 96,
    });
  });

  it('is a printed width at a resolution, written into the file', () => {
    // 10 cm at 300 dpi.
    expect(
      exportPixels({ width: 500, height: 500 }, 96, {
        by: 'print',
        width: 10,
        unit: 'cm',
        dpi: 300,
      }),
    ).toEqual({ width: 1181, height: 1181, dpi: 300 });
  });

  it('refuses sizes of nothing or too many pixels', () => {
    expect(() => exportPixels(canvas, 96, { by: 'width', px: 0 })).toThrow(EditError);
    expect(() => exportPixels(canvas, 96, { by: 'width', px: 40000 })).toThrow(/40000 × 20000/);
    expect(() => exportPixels(canvas, 96, { by: 'percent', percent: -5 })).toThrow(EditError);
  });
});

describe('svgDimensions (G11, G10)', () => {
  it('writes px for a screen image and cm for a 10 cm logo (9626/04 M/22 HeronV10cm)', () => {
    expect(svgDimensions(defaultGraphic())).toEqual({ width: '1280', height: '720' });
    const logo = createGraphic({
      name: 'Heron',
      size: { width: 10, height: 10, units: 'cm', dpi: 300 },
      background: '#ffffff',
    });
    expect(svgDimensions(logo)).toEqual({ width: '10cm', height: '10cm' });
    expect(
      svgDimensions(defaultGraphic(), { by: 'print', width: 4, unit: 'in', dpi: 300 }),
    ).toEqual({
      width: '4in',
      height: '2.25in',
    });
    expect(svgDimensions(logo, { by: 'width', px: 200 })).toEqual({ width: '200', height: '200' });
  });
});

describe('exporting the chosen objects (G11)', () => {
  function monitor() {
    let doc = defaultGraphic();
    const layer = doc.layers[0]!.id;
    const casing = { ...createRect({ x: 100, y: 100, width: 300, height: 200 }), name: 'Casing' };
    const grid = { ...createRect({ x: 120, y: 120, width: 100, height: 80 }), name: 'Grid' };
    const star = { ...createRect({ x: 500, y: 50, width: 40, height: 40 }), name: 'Star' };
    const other = { ...createEllipse({ x: 600, y: 300, width: 40, height: 40 }), name: 'Star' };
    for (const o of [casing, grid, star, other]) doc = addObject(doc, layer, o);
    return { doc, casing, grid, star, other };
  }

  it('crops the canvas to them and leaves the rest out, see-through around them', () => {
    const { doc, casing, grid } = monitor();
    const part = imageOfObjects(doc, [casing.id, grid.id]);
    expect(part.stage).toMatchObject({ width: 300, height: 200, background: 'none' });
    expect(part.layers[0]!.objects.map((o) => o.name)).toEqual(['Casing', 'Grid']);
    expect(part.layers[0]!.objects[1]).toMatchObject({ x: 20, y: 20 });
  });

  it('makes one image per object, named after it, names made different', () => {
    const { doc, casing, star, other } = monitor();
    const each = imagesOfEach(doc, [casing.id, star.id, other.id]);
    expect(each.map((e) => e.name)).toEqual(['Casing', 'Star', 'Star 2']);
    expect(each[1]!.doc.stage).toMatchObject({ width: 40, height: 40 });
  });

  it('keeps a group whole (9626/04 J/19: the grouped Casing)', () => {
    const { doc, casing, grid } = monitor();
    const grouped = groupObjects(doc, [casing.id, grid.id]);
    const group = { ...grouped.group, name: 'Casing' };
    const withName = {
      ...grouped.doc,
      layers: grouped.doc.layers.map((l) => ({
        ...l,
        objects: l.objects.map((o) => (o.id === group.id ? group : o)),
      })),
    };
    const [only] = imagesOfEach(withName, [group.id]);
    expect(only!.name).toBe('Casing');
    expect(only!.doc.stage).toMatchObject({ width: 300, height: 200 });
  });

  it('asks for objects to be chosen first', () => {
    expect(() => imageOfObjects(defaultGraphic(), [])).toThrow(/Choose the objects/);
  });
});

describe('formats (G11)', () => {
  it('says which keep transparency and which lose detail', () => {
    expect(FORMAT_INFO.png).toMatchObject({
      kind: 'bitmap',
      compression: 'lossless',
      transparency: true,
    });
    expect(FORMAT_INFO.jpg).toMatchObject({
      kind: 'bitmap',
      compression: 'lossy',
      transparency: false,
    });
    expect(FORMAT_INFO.svg).toMatchObject({ kind: 'vector', transparency: true });
  });

  it('checks the JPG quality', () => {
    expect(jpegQuality()).toBe(90);
    expect(jpegQuality(40)).toBe(40);
    expect(() => jpegQuality(0)).toThrow(EditError);
    expect(() => jpegQuality(101)).toThrow(EditError);
  });
});

describe('M21 G11: each layer in a file of its own (O/N/23)', () => {
  const pixels = { bitmap: createBitmap(4, 4), x: 0, y: 0 };
  const shape = createRect({ x: 0, y: 0, width: 5, height: 5 });

  it('one image per layer shown with something on it, named after it, on the whole canvas', () => {
    const doc = {
      ...defaultGraphic(),
      layers: [
        { ...createLayer('CastleLayer'), pixels, clip: true },
        { ...createLayer('Hidden'), pixels, visible: false },
        { ...createLayer('Empty') },
        { ...createLayer('Shapes'), objects: [shape] },
        { ...createLayer('Its mask'), mask: true, objects: [shape] },
        { ...createLayer('Template'), template: true, objects: [shape] },
        { ...createLayer('Sky:Layer'), pixels },
        { ...createLayer('sky layer'), pixels },
      ],
    };
    const parts = imagesOfLayers(doc);
    expect(parts.map((p) => p.name)).toEqual(['CastleLayer', 'Shapes', 'Sky Layer', 'sky layer 2']);
    expect(parts[0]!.doc.layers).toHaveLength(1);
    expect(parts[0]!.doc.layers[0]).not.toHaveProperty('clip');
    expect(parts[0]!.doc.stage).toMatchObject({ width: 1280, height: 720, background: 'none' });
    // AN12: a shapes layer takes its mask layer with it.
    expect(parts[1]!.doc.layers.map((l) => l.name)).toEqual(['Shapes', 'Its mask']);
  });

  it('says when there is nothing on the layers shown', () => {
    expect(() => imagesOfLayers(defaultGraphic())).toThrow(/nothing on the layers shown/);
  });

  it('leaves pixel layers out of the chosen objects’ image', () => {
    let doc = {
      ...defaultGraphic(),
      layers: [{ ...createLayer('Photo'), pixels }, createLayer('Logo')],
    };
    doc = addObject(doc, doc.layers[1]!.id, shape);
    expect(imageOfObjects(doc, [shape.id]).layers.map((l) => l.name)).toEqual(['Logo']);
  });
});

// M23: G11 the seven formats the syllabus names, each with the colour depths it can hold.
describe('formats and colour depth (G11, M23)', () => {
  it('names the seven formats of syllabus 19.1', () => {
    expect([...GRAPHIC_FORMATS].sort()).toEqual(['bmp', 'gif', 'jpg', 'pdf', 'png', 'svg', 'tiff']);
    expect(FORMAT_INFO.gif).toMatchObject({
      kind: 'bitmap',
      compression: 'lossless',
      transparency: true,
    });
    expect(FORMAT_INFO.bmp).toMatchObject({
      kind: 'bitmap',
      compression: 'none',
      transparency: false,
    });
    expect(FORMAT_INFO.tiff).toMatchObject({
      kind: 'bitmap',
      compression: 'lossless',
      extension: 'tif',
    });
  });

  it('gives each bitmap format the depths it can hold, the first its default', () => {
    expect(COLOUR_DEPTHS.png).toEqual([32, 24, 8, 4, 1]);
    expect(COLOUR_DEPTHS.gif).toEqual([8, 4, 1]);
    expect(COLOUR_DEPTHS.bmp).toEqual([24, 32, 8, 4, 1]);
    expect(COLOUR_DEPTHS.tiff).toEqual([24, 32, 8, 1]);
    expect(COLOUR_DEPTHS.jpg).toEqual([24]);
    expect(COLOUR_DEPTHS.svg).toEqual([]);
    expect(colourDepth({ format: 'gif' })).toBe(8);
    expect(colourDepth({ format: 'bmp', depth: 4 })).toBe(4);
  });

  it('refuses a depth the format cannot hold, in words', () => {
    expect(() => colourDepth({ format: 'gif', depth: 24 })).toThrow(/A GIF holds 1, 4 or 8 bits/);
    expect(() => colourDepth({ format: 'jpg', depth: 8 })).toThrow(EditError);
    expect(() => colourDepth({ format: 'svg', depth: 8 })).toThrow(/has no colour depth/);
  });

  it('says when see-through parts are kept and when they go on the background', () => {
    expect(keepsTransparency({ format: 'png' })).toBe(true);
    expect(keepsTransparency({ format: 'png', depth: 24 })).toBe(false);
    expect(keepsTransparency({ format: 'png', depth: 8 })).toBe(true);
    expect(keepsTransparency({ format: 'gif' })).toBe(true);
    expect(keepsTransparency({ format: 'gif', transparent: false })).toBe(false);
    expect(keepsTransparency({ format: 'bmp', depth: 32 })).toBe(true);
    expect(keepsTransparency({ format: 'bmp' })).toBe(false);
    expect(keepsTransparency({ format: 'tiff', depth: 32 })).toBe(true);
    expect(keepsTransparency({ format: 'jpg' })).toBe(false);
    expect(keepsTransparency({ format: 'svg' })).toBe(true);
  });
});
