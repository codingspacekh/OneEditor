// M19 exit gate (phase 3): the past papers' vector graphics tasks done in Graphics mode as a
// student does them — arcs, repeated parts, Boolean shapes, nodes, envelopes, gradients and
// patterns, shadows, glows and bevels, a given SVG imported, a photo traced over as a template,
// the outline view — and the files checked (SVG, PNG, JPG and PDF, named with the candidate's
// details).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boundsOf } from '../../src/core/animation/geometry.ts';
import type { AnimObject, GroupObject, Paint, PathObject } from '../../src/core/animation/types.ts';
import { picture } from '../helpers/animation-studio.ts';
import { testApp } from '../helpers/test-app.ts';

const CHIP_LEG = readFileSync('tests/fixtures/graphics/ChipLeg.svg', 'utf8');

/** Graphics mode with the candidate's details set (P8: ZZ999_9999 in every name). */
async function graphics(media: Parameters<typeof testApp>[0] = {}) {
  const t = testApp(media);
  await t.app.candidate.set({ centre: 'ZZ999', number: '9999', name: 'Ann' });
  const g = t.app.graphics;
  const doc = () => g.store.get().history.present;
  const objects = () => doc().layers.flatMap((l) => l.objects);
  const last = (): AnimObject => objects().at(-1)!;
  const named = (name: string): AnimObject => objects().find((o) => o.name === name)!;
  /** Selects objects and types values in Properties. */
  const type = (o: AnimObject | AnimObject[], values: Partial<AnimObject>) => {
    g.select((Array.isArray(o) ? o : [o]).map((x) => x.id));
    expect(g.setProperties(values)).toBeNull();
  };
  const solid = (colour: string): Paint => ({ kind: 'solid', colour });
  const vertical = (from: string, to: string, stops?: { at: number; colour: string }[]): Paint => ({
    kind: 'linear',
    from,
    to,
    angle: 90,
    ...(stops ? { stops } : {}),
  });
  const shape = (kind: Parameters<typeof g.addShape>[0], name: string, box: Box, values = {}) => {
    g.addShape(kind, box);
    type(last(), { name, ...box, ...values });
    return last();
  };
  async function newImage(name: string, width: number, height: number) {
    expect(
      await g.newImage({
        name,
        size: { width, height, units: 'px', dpi: 96 },
        background: 'none',
      }),
    ).toBeNull();
  }
  /** Exports with the save box answering `path`; the text of an SVG made. */
  async function exportTo(path: string, options: Parameters<typeof g.exportImage>[0]) {
    t.dialogs.exportGraphic.mockResolvedValueOnce(path);
    expect(await g.exportImage(options)).toEqual([path]);
    return t.disk.get(path);
  }
  return { ...t, g, doc, objects, last, named, type, solid, vertical, shape, newImage, exportTo };
}

type Box = { x: number; y: number; width: number; height: number };
const thinBlack = { colour: '#000000', width: 1, dash: 'solid' as const };

describe('9626/04 J/20 Question 1: the Wi-Fi meter', () => {
  it('an arc surround, a red–yellow–green scale, ticks repeated round the centre, a needle; each part as SVG and PNG, the meter 600 px wide', async () => {
    const s = await graphics();
    await s.newImage('Meter', 400, 240);
    // GV1: the surround and the scale are half ellipses (arcs from 180° to 360°, closed straight
    // across), one inside the other.
    s.shape(
      'arc',
      'Surround',
      { x: 20, y: 20, width: 360, height: 360 },
      {
        arc: { start: 180, end: 360, close: 'chord' },
        fill: s.solid('#333333'),
        stroke: thinBlack,
      },
    );
    s.shape(
      'arc',
      'Scale',
      { x: 50, y: 50, width: 300, height: 300 },
      {
        arc: { start: 180, end: 360, close: 'chord' },
        // "progress in colour from red to yellow to green": left to right, three colours.
        fill: {
          kind: 'linear',
          from: '#ff0000',
          to: '#00b000',
          angle: 0,
          stops: [{ at: 50, colour: '#ffff00' }],
        },
        stroke: undefined,
      },
    );
    const surround = boundsOf(s.named('Surround'));
    expect([surround.x, surround.y, surround.width]).toEqual([20, 20, 360]);
    expect(surround.height).toBeCloseTo(180, 9);

    // GV2: one tick at 0, then 10 more, each turned 18° about the centre of the dial: 0 to 100.
    s.shape(
      'rect',
      'Tick',
      { x: 50, y: 198, width: 24, height: 4 },
      {
        fill: s.solid('#ffffff'),
        stroke: undefined,
      },
    );
    s.g.select([s.named('Tick').id]);
    expect(
      s.g.stepAndRepeat({ copies: 10, dx: 0, dy: 0, angle: 18, about: { x: 200, y: 200 } }),
    ).toBeNull();
    const ticks = s.objects().filter((o) => o.name.startsWith('Tick'));
    expect(ticks).toHaveLength(11);
    expect(ticks.map((t) => Math.round(t.rotation))).toEqual([
      0, 18, 36, 54, 72, 90, 108, 126, 144, 162, 180,
    ]);
    // The last tick (100 %) lies on the right where the first (0 %) lies on the left.
    const right = boundsOf(ticks[10]!);
    expect(right.x + right.width).toBeCloseTo(350, 0);
    s.g.select(ticks.map((t) => t.id));
    s.g.group();
    s.type(s.last(), { name: 'Ticks' });

    // The needle: a polyline (GV1) of three points, closed.
    s.g.addPolyline(
      [
        { x: 196, y: 200 },
        { x: 200, y: 70 },
        { x: 204, y: 200 },
      ],
      true,
    );
    s.type(s.last(), {
      name: 'Needle',
      fill: s.solid('#000000'),
      stroke: undefined,
      pivot: { x: 0.5, y: 1 },
    });

    // Each part, as SVG and as a transparent bitmap, in a folder (each in a file named after it).
    s.dialogs.chooseFolder.mockResolvedValue('/exam');
    s.g.select(['Surround', 'Scale', 'Needle'].map((n) => s.named(n).id));
    for (const format of ['svg', 'png'] as const)
      expect(await s.g.exportImage({ format, what: 'each' })).toEqual(
        ['Surround', 'Scale', 'Needle'].map((n) => `/exam/${n}_ZZ999_9999.${format}`),
      );
    expect(s.disk.get('/exam/Scale_ZZ999_9999.svg')).toMatch(/#ffff00/i);
    expect(s.disk.get('/exam/Surround_ZZ999_9999.svg')).toMatch(/A180 180 /);

    // The meter: SVG, then a bitmap 600 px wide, not transparent (a JPG on white).
    s.g.select([]);
    expect(await s.exportTo('/exam/Meter1_ZZ999_9999.svg', { format: 'svg' })).toMatch(
      /width="400" height="240"/,
    );
    await s.exportTo('/exam/Meter1_ZZ999_9999.jpg', {
      format: 'jpg',
      size: { by: 'width', px: 600 },
    });
    const [, jpeg] = s.stageRenderer.renderJpeg.mock.calls.at(-1)!;
    expect(jpeg).toMatchObject({ size: { width: 600, height: 360 }, background: '#ffffff' });
  });
});

describe('9626/04 J/21 Task 1: the shield and the bolt', () => {
  it('a gold rim with a shadow, domed gold studs, a dark–light–dark silver panel off-centre, thin black outlines; the bolt; SVG, PNG and PDF', async () => {
    const s = await graphics();
    await s.newImage('Shield', 300, 360);
    const gold = s.vertical('#ffe680', '#a07800');
    s.shape(
      'ellipse',
      'Rim',
      { x: 20, y: 20, width: 260, height: 320 },
      {
        fill: gold,
        stroke: thinBlack,
        // G14: "Add a shadow to create an impression of depth".
        filters: [{ kind: 'dropShadow', colour: '#000000', dx: 6, dy: 6, blur: 8, opacity: 60 }],
      },
    );
    // The panel's silver runs dark – light – dark across; it sits a little off-centre.
    s.shape(
      'ellipse',
      'Panel',
      { x: 66, y: 60, width: 180, height: 240 },
      {
        fill: {
          kind: 'linear',
          from: '#808080',
          to: '#808080',
          angle: 0,
          stops: [{ at: 50, colour: '#f4f4f4' }],
        },
        stroke: thinBlack,
      },
    );
    // One domed stud (a radial gradient lit at the top left), repeated round the rim.
    s.shape(
      'ellipse',
      'Stud',
      { x: 140, y: 26, width: 20, height: 20 },
      {
        fill: { kind: 'radial', from: '#fff4b0', to: '#a07800', cx: 35, cy: 35 },
        stroke: thinBlack,
      },
    );
    s.g.select([s.named('Stud').id]);
    expect(s.g.stepAndRepeat({ copies: 7, dx: 0, dy: 0, angle: 45, about: 'canvas' })).toBeNull();
    expect(s.objects().filter((o) => o.name.startsWith('Stud'))).toHaveLength(8);
    s.g.select([]);
    const shield1 = await s.exportTo('/exam/Shield_1_ZZ999_9999.svg', { format: 'svg' });
    expect(shield1).toMatch(/<filter/);
    expect(shield1).toMatch(/radialGradient/);
    expect(shield1).toMatch(/#f4f4f4/i);

    // The bolt: a pen shape, thin blue outline, white to orange.
    s.g.addPath(
      [
        { x: 160, y: 80 },
        { x: 110, y: 190 },
        { x: 150, y: 190 },
        { x: 130, y: 290 },
        { x: 200, y: 160 },
        { x: 160, y: 160 },
        { x: 190, y: 80 },
      ],
      true,
    );
    s.type(s.last(), {
      name: 'Bolt',
      fill: s.vertical('#ffffff', '#ff8000'),
      stroke: { colour: '#0000ff', width: 1, dash: 'solid' },
    });
    s.g.select([]);
    expect(await s.exportTo('/exam/Shield_2_ZZ999_9999.svg', { format: 'svg' })).toMatch(
      /#ff8000/i,
    );
    await s.exportTo('/exam/Shield_3_ZZ999_9999.png', { format: 'png' });
    const [drawn] = s.stageRenderer.renderPng.mock.calls.at(-1)!;
    expect(drawn.stage.background).toBe('none');
    expect(drawn.layers[0]!.objects.find((o) => o.name === 'Rim')!.filters).toHaveLength(1);

    // G11 (M19): the same image as a PDF, its page the image's size.
    await s.exportTo('/exam/Shield_2_ZZ999_9999.pdf', { format: 'pdf' });
    const [svg, page] = s.pageAssets.svgToPdf.mock.calls.at(-1)!;
    expect(svg).toMatch(/<svg/);
    expect(page.width).toBeCloseTo(300 / 96, 5);
    expect(page.height).toBeCloseTo(360 / 96, 5);
    expect(new TextDecoder().decode(s.bytes.get('/exam/Shield_2_ZZ999_9999.pdf'))).toMatch(/^%PDF/);
  });
});

describe('9626/04 O/N/21 Task 2: the cloud and the bolt', () => {
  it('a cloud of 3 elements, light grey, darker grey at the bottom edges, sharp; a red-to-yellow bolt with a thin black outline; transparent SVGs', async () => {
    const s = await graphics();
    await s.newImage('Cloud', 300, 160);
    const grey = s.solid('#d8d8d8');
    // G14: the darker grey shading along the bottom is an inner shadow coming up from below.
    const shading = [
      { kind: 'innerShadow' as const, colour: '#808080', dx: 0, dy: -8, blur: 6, opacity: 80 },
    ];
    for (const [name, box] of [
      ['Puff 1', { x: 20, y: 60, width: 120, height: 80 }],
      ['Puff 2', { x: 90, y: 20, width: 130, height: 120 }],
      ['Puff 3', { x: 170, y: 55, width: 110, height: 85 }],
    ] as const)
      s.shape('ellipse', name, box, { fill: grey, stroke: undefined, filters: shading });
    s.g.select(s.objects().map((o) => o.id));
    s.g.group();
    s.type(s.last(), { name: 'Cloud' });
    expect((s.named('Cloud') as GroupObject).children).toHaveLength(3);
    s.g.select([]);
    const cloud = await s.exportTo('/exam/Cloud_ZZ999_9999.svg', { format: 'svg' });
    expect(cloud).toMatch(/<filter/);
    expect(cloud).not.toMatch(/feGaussianBlur[^>]*stdDeviation="[1-9]\d*"[^>]*in="SourceGraphic"/);

    await s.newImage('Bolt', 120, 240);
    s.g.addPath(
      [
        { x: 70, y: 10 },
        { x: 20, y: 130 },
        { x: 60, y: 130 },
        { x: 40, y: 230 },
        { x: 100, y: 100 },
        { x: 60, y: 100 },
        { x: 90, y: 10 },
      ],
      true,
    );
    s.type(s.last(), { name: 'Bolt', fill: s.vertical('#ff0000', '#ffff00'), stroke: thinBlack });
    s.g.select([]);
    const bolt = await s.exportTo('/exam/Bolt_ZZ999_9999.svg', { format: 'svg' });
    expect(bolt).toMatch(/#ff0000/i);
    expect(bolt).toMatch(/#ffff00/i);
    expect(bolt).not.toMatch(/<rect[^>]*width="120" height="240"/);
  });
});

describe('9626/04 J/24 Task 2: the cake and the slice', () => {
  it('gradient layers, a plate with contours, raised lettering, candles; then a slice cut out', async () => {
    const s = await graphics();
    await s.newImage('Cake', 400, 300);
    s.shape(
      'ellipse',
      'Plate',
      { x: 10, y: 200, width: 380, height: 90 },
      {
        fill: {
          kind: 'radial',
          from: '#ffffff',
          to: '#c0c0c0',
          stops: [{ at: 80, colour: '#e8e8e8' }],
        },
        stroke: { colour: '#909090', width: 2, dash: 'solid' },
      },
    );
    // Its contour: a second ring inside, a shade darker.
    s.shape(
      'ellipse',
      'Plate rim',
      { x: 40, y: 210, width: 320, height: 70 },
      {
        fill: { kind: 'none' },
        stroke: { colour: '#b0b0b0', width: 2, dash: 'solid' },
      },
    );
    s.shape(
      'rect',
      'Base',
      { x: 60, y: 150, width: 280, height: 90 },
      { fill: s.vertical('#7b4a24', '#3d2210'), stroke: undefined },
    );
    s.shape(
      'rect',
      'Jam',
      { x: 60, y: 130, width: 280, height: 20 },
      { fill: s.vertical('#ff4040', '#a00000'), stroke: undefined },
    );
    s.shape(
      'rect',
      'Top',
      { x: 60, y: 90, width: 280, height: 40 },
      { fill: s.vertical('#ffc060', '#ff8000'), stroke: undefined },
    );
    // G14: raised lettering — a bevel lit from the top left.
    s.g.addText({ x: 120, y: 96 }, 'Happy');
    s.type(s.last(), {
      name: 'Lettering',
      fill: s.solid('#ffe0a0'),
      filters: [
        {
          kind: 'bevel',
          depth: 3,
          blur: 2,
          angle: 135,
          light: '#ffffff',
          shadow: '#000000',
          opacity: 75,
        },
      ],
    });
    // A candle and its flame (a glow round it), repeated along the top.
    s.shape(
      'rect',
      'Candle',
      { x: 100, y: 40, width: 12, height: 50 },
      {
        fill: { kind: 'linear', from: '#4060ff', to: '#ffffff', angle: 0 },
        stroke: undefined,
      },
    );
    s.shape(
      'ellipse',
      'Flame',
      { x: 98, y: 18, width: 16, height: 24 },
      {
        fill: { kind: 'radial', from: '#ffff80', to: '#ff6000' },
        stroke: undefined,
        filters: [{ kind: 'glow', colour: '#ffcc00', blur: 10, opacity: 70 }],
      },
    );
    s.g.select([s.named('Candle').id, s.named('Flame').id]);
    expect(
      s.g.stepAndRepeat({ copies: 3, dx: 64, dy: 0, angle: 0, about: 'selection' }),
    ).toBeNull();
    expect(s.objects().filter((o) => o.name.startsWith('Flame'))).toHaveLength(4);
    s.g.select([]);
    const whole = await s.exportTo('/exam/WholeCake_ZZ999_9999.svg', { format: 'svg' });
    expect(whole).toMatch(/<filter/);
    expect(whole).toMatch(/Happy/);

    // The slice: a pie wedge (GV1 arc, pie) over the front of the cake cut out of each layer (G4).
    for (const layerName of ['Top', 'Jam', 'Base']) {
      s.shape(
        'arc',
        'Slice',
        { x: 120, y: 60, width: 160, height: 240 },
        {
          arc: { start: 60, end: 120, close: 'pie' },
          fill: s.solid('#000000'),
        },
      );
      s.g.select([s.named(layerName).id, s.named('Slice').id]);
      expect(s.g.combine('cutOut')).toBeNull();
      const cut = s
        .objects()
        .filter((o) => o.name === layerName || o.kind === 'path')
        .at(-1)!;
      expect(cut.kind).toBe('path');
    }
    expect(s.objects().some((o) => o.name === 'Slice')).toBe(false);
    s.g.select([]);
    expect(await s.exportTo('/exam/SlicedCake_ZZ999_9999.svg', { format: 'svg' })).toMatch(/<path/);
  });
});

describe('9626/04 O/N/25 Task 2: the apple', () => {
  it('a 300 px #B40000 apple with blooms, the stalk and leaves checked in the outline view, then bitten twice, a core and an old core', async () => {
    const s = await graphics();
    await s.newImage('Apple', 360, 380);
    s.shape(
      'ellipse',
      'Body',
      { x: 30, y: 60, width: 300, height: 300 },
      {
        fill: { kind: 'radial', from: '#d02020', to: '#b40000', cx: 40, cy: 35 },
        stroke: undefined,
      },
    );
    // A light bloom: a white highlight, soft (blurred) and half see-through.
    s.shape(
      'ellipse',
      'Bloom',
      { x: 90, y: 110, width: 60, height: 40 },
      {
        fill: s.solid('#ffffff'),
        opacity: 50,
        stroke: undefined,
        filters: [{ kind: 'blur', radius: 6 }],
      },
    );
    s.shape(
      'rect',
      'Stalk',
      { x: 175, y: 20, width: 10, height: 50 },
      { fill: s.solid('#7a4a20'), stroke: undefined },
    );
    // A leaf drawn with the pen, its middle node made smooth (GV3).
    s.g.addPath(
      [
        { x: 185, y: 40 },
        { x: 230, y: 10 },
        { x: 270, y: 30 },
        { x: 230, y: 55 },
      ],
      true,
    );
    s.type(s.last(), { name: 'Leaf', fill: s.vertical('#80e060', '#207020'), stroke: undefined });
    s.g.select([s.named('Leaf').id]);
    s.g.chooseNodes([1, 3]);
    s.g.setNodeType('smooth');
    const leaf = s.named('Leaf') as PathObject;
    expect(leaf.points[1]!.type).toBe('smooth');
    expect(leaf.points[1]!.in && leaf.points[1]!.out).toBeTruthy();

    // GV7: the outline view on — the drawing is checked as lines; it is never exported so.
    s.g.toggleOutline();
    expect(s.doc().view.wireframe).toBe(true);
    s.g.select([]);
    expect(await s.exportTo('/exam/Apple_ZZ999_9999.svg', { format: 'svg' })).toMatch(/#b40000/i);
    s.g.toggleOutline();
    expect(s.doc().view.wireframe).toBeFalsy();

    // Bitten: a circle at the edge cut out of the body (G4 Cut out), then a second.
    const bite = async (name: string, box: Box) => {
      s.shape('ellipse', 'Bite', box, { fill: s.solid('#000000') });
      const body = s.objects().find((o) => o.name.startsWith('Body'))!;
      s.g.select([body.id, s.named('Bite').id]);
      expect(s.g.combine('cutOut')).toBeNull();
      s.g.select([]);
      await s.exportTo(`/exam/${name}.svg`, { format: 'svg' });
    };
    const area = () => {
      const b = boundsOf(s.objects().find((o) => o.kind === 'path' && o.name !== 'Leaf')!);
      return b.width * b.height;
    };
    await bite('Bite1', { x: 280, y: 150, width: 100, height: 100 });
    const once = area();
    await bite('Bite2', { x: -20, y: 150, width: 100, height: 100 });
    expect(area()).toBeLessThan(once);
    expect(s.disk.get('/exam/Bite2.svg')).toBeDefined();
  });
});

describe('9626/04 M/23 Task 1: SpaceShip, Flame and Rocket', () => {
  it('the flame saved as SVG is imported into the spaceship as editable shapes and the two saved as the rocket', async () => {
    const s = await graphics();
    // The flame: drawn and saved on its own.
    await s.newImage('Flame', 80, 120);
    s.shape(
      'ellipse',
      'Outer flame',
      { x: 10, y: 0, width: 60, height: 120 },
      {
        fill: s.vertical('#ffd000', '#ff3000'),
        stroke: undefined,
      },
    );
    s.shape(
      'ellipse',
      'Inner flame',
      { x: 25, y: 10, width: 30, height: 70 },
      {
        fill: s.solid('#ffffa0'),
        stroke: undefined,
      },
    );
    s.g.select([]);
    const flame = await s.exportTo('/exam/Flame_ZZ999_9999.svg', { format: 'svg' });
    expect(flame).toMatch(/width="80" height="120"/);

    // The spaceship, with guides at its edges as the paper's rulers show.
    await s.newImage('SpaceShip', 200, 400);
    s.shape(
      'rect',
      'Body',
      { x: 60, y: 80, width: 80, height: 220 },
      {
        radius: 30,
        fill: s.vertical('#ffffff', '#a0a0b0'),
        stroke: thinBlack,
      },
    );
    s.g.addPath(
      [
        { x: 60, y: 110 },
        { x: 100, y: 10 },
        { x: 140, y: 110 },
      ],
      true,
    );
    s.type(s.last(), { name: 'Nose', fill: s.solid('#d00000'), stroke: thinBlack });
    s.g.select([]);
    await s.exportTo('/exam/SpaceShip_ZZ999_9999.svg', { format: 'svg' });

    // GV6: Import SVG… puts the flame's shapes in as one selected group; moved under the body.
    s.dialogs.openSvg.mockResolvedValueOnce('/exam/Flame_ZZ999_9999.svg');
    await s.g.importSvg();
    const group = s.last() as GroupObject;
    expect(group.kind).toBe('group');
    expect(group.children.map((c) => c.kind)).toEqual(['ellipse', 'ellipse']);
    expect(s.g.store.get().selection).toEqual([group.id]);
    s.type(group, { x: 60, y: 290 });
    s.g.select([]);
    const rocket = await s.exportTo('/exam/Rocket_ZZ999_9999.svg', { format: 'svg' });
    expect(rocket).toMatch(/#ffd000/i);
    expect(rocket).not.toMatch(/<image/);
  });
});

describe('9626/04 M/26 Task 2: the chip', () => {
  it('Chip.png as a template, ChipLeg.svg imported for evenly spaced legs, no bitmap in the SVG, resized to 10 cm × 6 cm at 15°', async () => {
    const s = await graphics({ '/exam/Chip.png': picture(1200, 800) });
    s.disk.set('/exam/ChipLeg.svg', CHIP_LEG);
    await s.newImage('Chip', 600, 400);
    // GV8: the template, faded and locked, never exported.
    s.dialogs.openPicture.mockResolvedValueOnce('/exam/Chip.png');
    await s.g.placeTemplate();
    const template = s.doc().layers[0]!;
    expect(template).toMatchObject({ template: true, locked: true, name: 'Template' });
    expect(template.objects[0]!.kind).toBe('picture');

    // The body traced over it.
    s.shape(
      'rect',
      'Body',
      { x: 100, y: 120, width: 400, height: 160 },
      {
        radius: 8,
        fill: s.vertical('#505050', '#202020'),
        stroke: thinBlack,
      },
    );
    // GV6: one leg from the paper's SVG, then 5 more evenly spaced along the top (GV2).
    s.dialogs.openSvg.mockResolvedValueOnce('/exam/ChipLeg.svg');
    await s.g.importSvg();
    const leg = s.last();
    s.type(leg, { name: 'Leg', x: 110, y: 40, width: 30, height: 93 });
    s.g.select([leg.id]);
    expect(
      s.g.stepAndRepeat({ copies: 5, dx: 72, dy: 0, angle: 0, about: 'selection' }),
    ).toBeNull();
    const legs = s.objects().filter((o) => o.name.startsWith('Leg'));
    expect(legs).toHaveLength(6);
    const gaps = legs.slice(1).map((l, i) => l.x - legs[i]!.x);
    expect(new Set(gaps.map((g) => Math.round(g * 1000)))).toEqual(new Set([72000]));
    // And 6 along the bottom: a mirror copy of the row, flipped top to bottom.
    s.g.select(legs.map((l) => l.id));
    expect(s.g.mirrorCopy('vertical')).toBeNull();
    expect(s.objects().filter((o) => o.name.startsWith('Leg'))).toHaveLength(12);

    // Grouped, then resized to 10 cm × 6 cm (at 96 dpi) and turned 15°.
    const drawn = s
      .doc()
      .layers.filter((l) => !l.template)
      .flatMap((l) => l.objects);
    s.g.select(drawn.map((o) => o.id));
    s.g.group();
    const cm = 96 / 2.54;
    s.type(s.last(), { name: 'Chip', width: 10 * cm, height: 6 * cm, rotation: 15 });
    expect(s.last()).toMatchObject({ rotation: 15 });
    expect(s.last().width).toBeCloseTo(377.95, 1);

    s.g.select([]);
    const svg = await s.exportTo('/exam/Chip_ZZ999_9999.svg', { format: 'svg' });
    // "Your vector image must not contain any bitmap elements": the template is left out.
    expect(svg).not.toMatch(/<image/);
    expect(svg).toMatch(/#ff7f00/i);
  });
});

describe('9626/04 J/19 Question 1: the medical monitor', () => {
  it('a 1 cm green grid, rounded 3-D buttons, a metallic insert, see-through panels; Casing, MetalInsert and Grid saved apart as transparent PNGs; HMonitor as SVG', async () => {
    const s = await graphics();
    const cm = 96 / 2.54;
    await s.newImage('HMonitor', Math.round(11 * cm), Math.round(10 * cm));
    // The casing, light blue, with see-through panels (its fill half see-through, G12).
    s.shape(
      'rect',
      'Casing',
      { x: 0, y: 0, width: 11 * cm, height: 10 * cm },
      {
        radius: 12,
        fill: s.solid('#a0d0ff'),
        fillOpacity: 50,
        stroke: thinBlack,
      },
    );
    // The metallic insert: grey – white – grey.
    s.shape(
      'rect',
      'MetalInsert',
      { x: 0.5 * cm, y: 0.5 * cm, width: 10 * cm, height: 7 * cm },
      {
        fill: s.vertical('#8a8a8a', '#8a8a8a', [{ at: 50, colour: '#f0f0f0' }]),
        fillOpacity: 70,
        stroke: undefined,
      },
    );
    // The black screen with a 1 cm green grid: one line, step and repeated.
    s.shape(
      'rect',
      'Screen',
      { x: 1.5 * cm, y: 1 * cm, width: 8 * cm, height: 6 * cm },
      {
        fill: s.solid('#000000'),
        stroke: undefined,
      },
    );
    s.shape(
      'rect',
      'Line',
      { x: 1.5 * cm, y: 1 * cm, width: 1, height: 6 * cm },
      {
        fill: s.solid('#00c000'),
        stroke: undefined,
      },
    );
    s.g.select([s.named('Line').id]);
    expect(
      s.g.stepAndRepeat({ copies: 8, dx: cm, dy: 0, angle: 0, about: 'selection' }),
    ).toBeNull();
    s.g.select(
      [
        'Screen',
        ...s
          .objects()
          .filter((o) => o.name.startsWith('Line'))
          .map((o) => o.name),
      ].map((n) => s.named(n).id),
    );
    s.g.group();
    s.type(s.last(), { name: 'Grid' });
    expect((s.named('Grid') as GroupObject).children).toHaveLength(10);
    // A 3-D button: rounded, bevelled.
    s.shape(
      'rect',
      'Pause',
      { x: 1.5 * cm, y: 8 * cm, width: 1.5 * cm, height: 1.5 * cm },
      {
        radius: 6,
        fill: s.solid('#d0d0d0'),
        filters: [
          {
            kind: 'bevel',
            depth: 4,
            blur: 3,
            angle: 135,
            light: '#ffffff',
            shadow: '#000000',
            opacity: 80,
          },
        ],
      },
    );

    s.dialogs.chooseFolder.mockResolvedValueOnce('/exam');
    s.g.select(['Casing', 'MetalInsert', 'Grid'].map((n) => s.named(n).id));
    expect(await s.g.exportImage({ format: 'png', what: 'each' })).toEqual(
      ['Casing', 'MetalInsert', 'Grid'].map((n) => `/exam/${n}_ZZ999_9999.png`),
    );
    for (const [doc] of s.stageRenderer.renderPng.mock.calls.slice(-3))
      expect(doc.stage.background).toBe('none');

    s.g.select([]);
    const svg = await s.exportTo('/exam/HMonitor_ZZ999_9999.svg', { format: 'svg' });
    expect(svg).toMatch(/fill-opacity="0.5"/);
    expect(svg).toMatch(/#00c000/i);
  });
});

describe('9626/04 O/N/22 Task 2: VPlane and VPlanePlus', () => {
  it('the plane traced by hand over Plane.jpg as a template, pure yellow, smooth nodes; a ribbon streamer; SVGs without the photo', async () => {
    const s = await graphics({ '/exam/Plane.jpg': picture(1024, 640) });
    await s.newImage('VPlane', 512, 320);
    s.dialogs.openPicture.mockResolvedValueOnce('/exam/Plane.jpg');
    await s.g.placeTemplate();
    // The fuselage: clicked as a polyline over the photo, then its nodes made smooth (GV3).
    s.g.addPolyline(
      [
        { x: 40, y: 160 },
        { x: 120, y: 140 },
        { x: 420, y: 150 },
        { x: 480, y: 160 },
        { x: 420, y: 175 },
        { x: 120, y: 180 },
      ],
      true,
    );
    s.type(s.last(), { name: 'Body', fill: s.solid('#ffff00'), stroke: thinBlack });
    s.g.select([s.last().id]);
    s.g.chooseNodes([1, 2, 4, 5]);
    s.g.setNodeType('smooth');
    expect((s.named('Body') as PathObject).points.filter((p) => p.type === 'smooth')).toHaveLength(
      4,
    );
    // A design on the body: a pattern of stripes.
    s.shape(
      'rect',
      'Design',
      { x: 200, y: 150, width: 120, height: 20 },
      {
        fill: {
          kind: 'pattern',
          pattern: 'stripes',
          colour: '#0000ff',
          background: 'none',
          size: 8,
        },
        stroke: undefined,
      },
    );
    s.g.select([]);
    const vplane = await s.exportTo('/exam/VPlane_ZZ999_9999.svg', { format: 'svg' });
    expect(vplane).toMatch(/<pattern/);
    expect(vplane).not.toMatch(/<image/);

    // The ribbon streamer: a rectangle bent into a wave (GV4), then applied to plain paths.
    s.shape(
      'rect',
      'Ribbon',
      { x: 470, y: 150, width: 40, height: 10 },
      { fill: s.solid('#ff0000'), stroke: undefined },
    );
    s.g.select([s.named('Ribbon').id]);
    expect(s.g.setEnvelope({ kind: 'preset', preset: 'wave', bend: 50 })).toBeNull();
    expect(s.g.applyEnvelope()).toBeNull();
    const ribbon = s.named('Ribbon');
    expect(ribbon.kind).toBe('path');
    expect(ribbon.envelope).toBeUndefined();
    s.g.select([]);
    expect(await s.exportTo('/exam/VPlanePlus_ZZ999_9999.svg', { format: 'svg' })).not.toMatch(
      /<image/,
    );
  });
});

describe('Coursebook Ch.18 exam-style question 2: the roller coaster track', () => {
  it('a rectangle distorted in perspective, its far end narrower, kept editable until applied', async () => {
    const s = await graphics();
    await s.newImage('Coaster', 400, 300);
    s.shape(
      'rect',
      'Track',
      { x: 50, y: 100, width: 300, height: 100 },
      { fill: s.solid('#8040c0') },
    );
    s.g.select([s.named('Track').id]);
    expect(
      s.g.setEnvelope({
        kind: 'perspective',
        corners: [
          { x: 0.35, y: 0 },
          { x: 0.65, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      }),
    ).toBeNull();
    // Still a rectangle (its corner radius can be typed) while bent.
    expect(s.named('Track').kind).toBe('rect');
    s.type(s.named('Track'), { radius: 4 });
    s.g.select([]);
    const svg = await s.exportTo('/exam/Coaster.svg', { format: 'svg' });
    expect(svg).toMatch(/<path/);
    s.g.select([s.named('Track').id]);
    expect(s.g.applyEnvelope()).toBeNull();
    const track = s.named('Track') as PathObject;
    const top = track.points.filter((p) => p.y < 1);
    expect(Math.max(...top.map((p) => p.x)) - Math.min(...top.map((p) => p.x))).toBeLessThan(120);
  });
});
