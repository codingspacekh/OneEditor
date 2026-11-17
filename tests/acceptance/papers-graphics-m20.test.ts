// M20 exit gate (phase 3): the papers' text tasks done in Graphics mode as a student does them —
// text on a hidden path, round the bottom of a shape and halfway through an ellipse's outline, in
// a script font above balloons, sized in points, letter-spaced, turned into letter outlines whose
// nodes are pulled, and arched while it is still text — and the files checked. The letters'
// outlines are read from the bundled font files by opentype.js, as in the app.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOpentypeGlyphs } from '../../src/adapters/fonts/opentype-glyphs.ts';
import { boundsOf } from '../../src/core/animation/geometry.ts';
import type {
  AnimObject,
  GroupObject,
  Paint,
  PathObject,
  TextObject,
} from '../../src/core/animation/types.ts';
import { glyphsOf, loadGlyphsFor, setGlyphSource } from '../../src/core/graphics/glyphs.ts';
import { testApp } from '../helpers/test-app.ts';

const FONTS = join(import.meta.dirname, '../../resources/fonts');

beforeAll(() => {
  const glyphs = createOpentypeGlyphs(
    async (file) => new Uint8Array(readFileSync(join(FONTS, file))),
  );
  // Words measured by the fonts' own advances (the app measures them on its canvas).
  setGlyphSource(glyphs, (t, text) => {
    const g = glyphsOf(t);
    return g ? [...text].reduce((w, c) => w + g.advance(c, t.size), 0) : text.length * t.size * 0.6;
  });
});
afterAll(() => setGlyphSource(null));

/** Lets the fonts' outlines arrive. */
const read = () => new Promise((r) => setTimeout(r, 20));

async function graphics() {
  const t = testApp();
  await t.app.candidate.set({ centre: 'ZZ999', number: '9999', name: 'Ann' });
  const g = t.app.graphics;
  const doc = () => g.store.get().history.present;
  const objects = () => doc().layers.flatMap((l) => l.objects);
  const last = (): AnimObject => objects().at(-1)!;
  const named = (name: string): AnimObject => objects().find((o) => o.name === name)!;
  const type = (o: AnimObject | AnimObject[], values: Record<string, unknown>) => {
    g.select((Array.isArray(o) ? o : [o]).map((x) => x.id));
    expect(g.setProperties(values as Partial<AnimObject>)).toBeNull();
  };
  const solid = (colour: string): Paint => ({ kind: 'solid', colour });
  async function newImage(name: string, size: Parameters<typeof g.newImage>[0]['size']) {
    expect(await g.newImage({ name, size, background: 'none' })).toBeNull();
  }
  function text(words: string, values: Record<string, unknown> = {}) {
    g.addText({ x: 20, y: 20 }, words);
    type(last(), { name: words, ...values });
    return last() as TextObject;
  }
  function pen(name: string, points: { x: number; y: number }[], closed: boolean) {
    g.addPath(points, closed);
    type(last(), { name });
    return last() as PathObject;
  }
  async function exportTo(path: string, options: Parameters<typeof g.exportImage>[0]) {
    t.dialogs.exportGraphic.mockResolvedValueOnce(path);
    expect(await g.exportImage(options)).toEqual([path]);
    return t.disk.get(path);
  }
  return { ...t, g, doc, objects, last, named, type, solid, newImage, text, pen, exportTo };
}

/** 1 pt at 96 dpi. */
const PT = 96 / 72;
const outline = (colour: string, pt: number) => ({
  colour,
  width: pt * PT,
  dash: 'solid' as const,
});

describe('9626/04 M/17 Task 2(a): the Woodlands sticker', () => {
  it('a tree of 3 joined circles with a 1 pt outline and a flared trunk, duplicated; Woodlands on a hidden path, white with a black outline; grouped and sized 250 × 200 px', async () => {
    const s = await graphics();
    await s.newImage('Woodlands', { width: 500, height: 400, units: 'px', dpi: 96 });
    // The trunk first, so it is behind the foliage.
    s.g.addShape('rect', { x: 90, y: 180, width: 20, height: 80 });
    s.type(s.last(), { name: 'Trunk', fill: s.solid('#8b5a2b'), stroke: undefined });
    for (const [x, y] of [
      [60, 120],
      [100, 100],
      [80, 150],
    ] as const) {
      s.g.addShape('ellipse', { x, y, width: 60, height: 60 });
      s.type(s.last(), { fill: s.solid('#90ee90') });
    }
    // "Join the circles to make a single shape with a 1pt black outline."
    s.g.select(
      s
        .objects()
        .filter((o) => o.kind === 'ellipse')
        .map((o) => o.id),
    );
    expect(s.g.combine('union')).toBeNull();
    s.type(s.last(), { name: 'Foliage', stroke: outline('#000000', 1) });
    expect(s.objects().filter((o) => o.name === 'Foliage')).toHaveLength(1);
    // "Convert the rectangle to curves and flare the bottom of the trunk": its two bottom nodes
    // pulled apart.
    s.g.select([s.named('Trunk').id]);
    expect(s.g.convertToCurves()).toBeNull();
    const trunk = s.named('Trunk') as PathObject;
    expect(trunk.kind).toBe('path');
    const bottom = trunk.points.flatMap((p, i) => (p.y > trunk.height / 2 ? [i] : []));
    const left = bottom.filter((i) => trunk.points[i]!.x < trunk.width / 2);
    const right = bottom.filter((i) => trunk.points[i]!.x >= trunk.width / 2);
    s.g.chooseNodes(left);
    s.g.moveNodes(-10, 0);
    s.g.chooseNodes(right);
    s.g.moveNodes(10, 0);
    const flared = boundsOf(s.named('Trunk'));
    expect(flared.width).toBeCloseTo(40, 0);
    // "Duplicate the tree twice".
    s.g.select([s.named('Trunk').id, s.named('Foliage').id]);
    s.g.group();
    s.type(s.last(), { name: 'Tree' });
    s.g.duplicate();
    s.type(s.last(), { x: 180 });
    s.g.duplicate();
    expect(s.objects().filter((o) => o.kind === 'group')).toHaveLength(3);

    // "Create a path to position the text Woodlands … Do not show the path."
    s.pen(
      'Arc',
      [
        { x: 60, y: 330 },
        { x: 250, y: 280 },
        { x: 440, y: 330 },
      ],
      false,
    );
    s.text('Woodlands', {
      font: 'Inter',
      size: 48,
      bold: true,
      fill: s.solid('#ffffff'),
      stroke: outline('#000000', 1),
      letterSpacing: 60,
    });
    s.g.select([s.named('Woodlands').id, s.named('Arc').id]);
    expect(s.g.putOnPath(false)).toBeNull();
    const words = s.named('Woodlands') as TextObject;
    expect(words.path).toBeDefined();
    expect(words.path!.stroke).toBeUndefined();
    expect(s.objects().some((o) => o.name === 'Arc')).toBe(false);
    s.text('Homes', {
      font: 'Inter',
      size: 36,
      fill: s.solid('#ffffff'),
      stroke: outline('#000000', 1),
    });

    // "Group the objects and resize the image to 250 px wide and 200 px high."
    s.g.select(s.objects().map((o) => o.id));
    s.g.group();
    s.type(s.last(), { name: 'Sticker', x: 0, y: 0, width: 250, height: 200 });
    expect(boundsOf(s.named('Sticker'))).toMatchObject({ width: 250, height: 200 });
    s.g.select([]);
    const svg = await s.exportTo('/exam/Woodlands_ZZ999_9999.svg', { format: 'svg' });
    // The words drawn letter by letter along the path, which itself is not drawn.
    expect(svg!.match(/>W</g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(svg).toMatch(/fill="#ffffff"/i);
    await s.exportTo('/exam/Woodlands_ZZ999_9999.png', { format: 'png' });
  });
});

describe('9626/04 O/N/17 Question 1: the RockICT logo', () => {
  it('a 200 × 200 px black guitar with a 3 pt red outline, Rock ICT in white curved to fit the bottom, one layer, transparent', async () => {
    const s = await graphics();
    await s.newImage('RockICT_logo', { width: 200, height: 200, units: 'px', dpi: 96 });
    s.g.addShape('ellipse', { x: 30, y: 90, width: 110, height: 100 });
    s.g.addShape('ellipse', { x: 45, y: 40, width: 80, height: 70 });
    s.g.addShape('rect', { x: 78, y: 0, width: 14, height: 70 });
    s.g.select(s.objects().map((o) => o.id));
    expect(s.g.combine('union')).toBeNull();
    s.type(s.last(), { name: 'Guitar', fill: s.solid('#000000'), stroke: outline('#ff0000', 3) });
    expect(s.named('Guitar').stroke!.width).toBeCloseTo(4, 5);
    // The sound hole.
    s.g.addShape('ellipse', { x: 70, y: 110, width: 30, height: 30 });
    s.type(s.last(), { name: 'Sound hole', fill: s.solid('#ffffff'), stroke: undefined });
    // The words go round the inside of a circle the size of the body's bottom, flipped so they
    // read left to right along the bottom.
    s.g.addShape('ellipse', { x: 38, y: 98, width: 94, height: 84 });
    s.type(s.last(), { name: 'Curve', fill: { kind: 'none' } });
    s.text('Rock ICT', { font: 'Inter', size: 16, bold: true, fill: s.solid('#ffffff') });
    s.g.select([s.named('Rock ICT').id, s.named('Curve').id]);
    expect(s.g.putOnPath(false)).toBeNull();
    const rock = s.named('Rock ICT') as TextObject;
    s.type(rock, { path: { ...rock.path!, side: 'inside', flip: true } });
    // Its letters lie along the bottom half of the body.
    const box = boundsOf(s.named('Rock ICT'));
    expect(box.y + box.height).toBeGreaterThan(150);
    expect(s.doc().layers).toHaveLength(1);
    s.g.select([]);
    await s.exportTo('/exam/RockICT_logo_ZZ999_9999.png', { format: 'png' });
    const [drawn] = s.stageRenderer.renderPng.mock.calls.at(-1)!;
    expect(drawn.stage).toMatchObject({ width: 200, height: 200, background: 'none' });
  });
});

describe('9626/04 J/18 Question 1: the TTS anniversary image', () => {
  it('an A4 image, a red balloon of 2 shapes combined with a 1 pt outline and a light bloom, green and blue copies, “TTS is 10!” on a curved path above in a script font', async () => {
    const s = await graphics();
    await s.newImage('3Balloons', { width: 21, height: 29.7, units: 'cm', dpi: 96 });
    expect(s.doc().stage).toMatchObject({ width: 794, height: 1123 });
    const balloon = (name: string, x: number, colour: string) => {
      s.g.addShape('ellipse', { x, y: 500, width: 160, height: 200 });
      s.g.addShape('polygon', { x: x + 65, y: 690, width: 30, height: 24 });
      s.g.select(
        s
          .objects()
          .slice(-2)
          .map((o) => o.id),
      );
      expect(s.g.combine('union')).toBeNull();
      s.type(s.last(), {
        name,
        fill: {
          kind: 'radial',
          from: '#ffffff',
          to: colour,
          stops: [{ at: 25, colour }],
          cx: 35,
          cy: 30,
        },
        stroke: outline('#000000', 1),
      });
    };
    balloon('RedBalloon', 120, '#ff0000');
    balloon('GreenBalloon', 317, '#00ff00');
    balloon('BlueBalloon', 514, '#0000ff');
    s.g.select([s.named('RedBalloon').id]);
    const red = await s.exportTo('/exam/RedBalloon.svg', { format: 'svg', what: 'selection' });
    expect(red).toMatch(/#ff0000/i);

    s.pen(
      'Above',
      [
        { x: 150, y: 400 },
        { x: 400, y: 300 },
        { x: 650, y: 400 },
      ],
      false,
    );
    s.text('TTS is 10!', { font: 'Dancing Script', size: 96, fill: s.solid('#6a1b9a') });
    s.g.select([s.named('TTS is 10!').id, s.named('Above').id]);
    expect(s.g.putOnPath(false)).toBeNull();
    s.text('A big thank you to\nall our loyal clients', {
      font: 'Dancing Script',
      size: 48,
      align: 'centre',
      lineSpacing: 1.4,
      y: 800,
    });
    s.g.select([]);
    const svg = await s.exportTo('/exam/3Balloons.svg', { format: 'svg' });
    expect(svg).toMatch(/Dancing Script/);
    // The words follow the curve over the balloons: their box is the curve's, above them.
    const tts = s.named('TTS is 10!') as TextObject;
    expect(tts.path!.closed).toBe(false);
    const above = boundsOf(tts);
    expect(above.y + above.height).toBeLessThan(500);
  });
});

describe('9626/04 M/22 Task 1: the Heron logo', () => {
  it('10 cm × 10 cm; each letter of the curved text halfway through the red ellipse’s outline; text with a black outline and a white-to-red vertical gradient; SVG at 10 cm and a 200 px PNG', async () => {
    const s = await graphics();
    await s.newImage('HeronV10cm', { width: 10, height: 10, units: 'cm', dpi: 96 });
    const side = s.doc().stage.width;
    s.g.addShape('ellipse', { x: 20, y: 40, width: side - 40, height: side - 80 });
    s.type(s.last(), {
      name: 'Ring',
      fill: { kind: 'none' },
      stroke: { colour: '#ff0000', width: 24, dash: 'solid' },
    });
    const gradient: Paint = { kind: 'linear', from: '#ffffff', to: '#ff0000', angle: 90 };
    // The ring kept: the words follow a copy of its outline.
    s.g.select([s.named('Ring').id]);
    s.g.duplicate();
    s.type(s.last(), { name: 'Outline', x: 20, y: 40 });
    s.text('HERON TRAVEL', {
      font: 'Montserrat',
      size: 30,
      bold: true,
      fill: gradient,
      stroke: outline('#000000', 1),
    });
    s.g.select([s.named('HERON TRAVEL').id, s.named('Outline').id]);
    expect(s.g.putOnPath(false)).toBeNull();
    const heron = s.named('HERON TRAVEL') as TextObject;
    s.type(heron, { path: { ...heron.path!, side: 'centred' } });
    expect((s.named('HERON TRAVEL') as TextObject).path!.side).toBe('centred');
    // Its box is the ring's: the letters sit on the ring itself.
    const ring = boundsOf(s.named('Ring'));
    const words = boundsOf(s.named('HERON TRAVEL'));
    expect(words.x).toBeCloseTo(ring.x, 0);
    expect(words.width).toBeCloseTo(ring.width, 0);

    s.g.select([]);
    const svg = await s.exportTo('/exam/HeronV10cm_ZZ999_9999.svg', { format: 'svg' });
    expect(svg).toMatch(/width="10cm" height="10cm"/);
    expect(svg).toMatch(/linearGradient/);
    await s.exportTo('/exam/HeronV200px_ZZ999_9999.png', {
      format: 'png',
      size: { by: 'width', px: 200 },
    });
    const [, , scaled] = s.stageRenderer.renderPng.mock.calls.at(-1)!;
    expect(scaled).toEqual({ width: 200, height: 200 });
  });
});

describe('Workbook Ch.6 Task 2: text to curves, the letters stretched', () => {
  it('the words become their letters’ outlines from the font (holes kept), and a letter is stretched by pulling its top nodes up', async () => {
    const s = await graphics();
    await s.newImage('Logo', { width: 400, height: 200, units: 'px', dpi: 96 });
    s.text('OPEN', { font: 'Inter', size: 80, bold: true, fill: s.solid('#1565c0') });
    const before = boundsOf(s.named('OPEN'));
    s.g.select([s.named('OPEN').id]);
    expect(s.g.convertToCurves()).toBeNull();
    await read();
    const group = s.named('OPEN') as GroupObject;
    expect(group.kind).toBe('group');
    expect(group.children.map((c) => c.name)).toEqual(['O', 'P', 'E', 'N']);
    // O and P keep their counters.
    const o = group.children[0] as PathObject;
    expect(o.kind).toBe('path');
    expect(o.holes?.length ?? 0).toBeGreaterThanOrEqual(1);
    // Where the words were.
    const after = boundsOf(group);
    expect(Math.abs(after.x - before.x)).toBeLessThan(before.width * 0.1);
    // Ungrouped, the E's top nodes pulled up: a taller E.
    s.g.select([group.id]);
    s.g.ungroup();
    const e = s.named('E') as PathObject;
    const tall = boundsOf(e).height;
    s.g.select([e.id]);
    const top = e.points.flatMap((p, i) => (p.y < e.height * 0.2 ? [i] : []));
    expect(top.length).toBeGreaterThan(0);
    s.g.chooseNodes(top);
    s.g.moveNodes(0, -30);
    expect(boundsOf(s.named('E')).height).toBeCloseTo(tall + 30, 0);
  });
});

describe('Coursebook Ch.18 exam-style questions', () => {
  it('1: a TV logo with arched text that stays text (an arch envelope), exported bent', async () => {
    const s = await graphics();
    await s.newImage('TVLogo', { width: 400, height: 200, units: 'px', dpi: 96 });
    s.text('CHANNEL 9', {
      font: 'Anton',
      size: 60,
      fill: s.solid('#ffcc00'),
      stroke: outline('#000000', 1),
    });
    await loadGlyphsFor(s.objects());
    s.g.select([s.named('CHANNEL 9').id]);
    expect(s.g.setEnvelope({ kind: 'preset', preset: 'arch', bend: 50 })).toBeNull();
    await read();
    const t = s.named('CHANNEL 9') as TextObject;
    expect(t.kind).toBe('text');
    // Still text: its words can be changed and it stays arched.
    s.type(t, { text: 'CHANNEL 10' });
    const now = s.objects().find((o) => o.kind === 'text') as TextObject;
    expect(now.text).toBe('CHANNEL 10');
    expect(now.envelope).toMatchObject({ preset: 'arch' });
    s.g.select([]);
    const svg = await s.exportTo('/exam/TVLogo.svg', { format: 'svg' });
    // Drawn as its bent letters' outlines.
    expect(svg).toMatch(/<path/);
  });

  it('2: the roller coaster’s words on an arc', async () => {
    const s = await graphics();
    await s.newImage('Coaster', { width: 500, height: 300, units: 'px', dpi: 96 });
    s.g.addShape('arc', { x: 50, y: 60, width: 400, height: 400 });
    s.type(s.last(), { name: 'Track', arc: { start: 200, end: 340, close: 'open' } });
    s.text('THRILL RIDE', { font: 'Bungee', size: 28, fill: s.solid('#d50000') });
    s.g.select([s.named('THRILL RIDE').id, s.named('Track').id]);
    expect(s.g.putOnPath(true)).toBeNull();
    const t = s.named('THRILL RIDE') as TextObject;
    // Shown: the track is drawn under the words.
    expect(t.path!.stroke).toBeDefined();
    s.g.select([]);
    expect(await s.exportTo('/exam/Coaster.svg', { format: 'svg' })).toMatch(/<path/);
  });
});
