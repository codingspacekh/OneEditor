// GT4, GT5 (M20) in the app: Convert to curves makes the selected text its letters (read from the
// fonts' outlines the first time, then one undo step), in Graphics and Animation modes; text bent
// by an envelope stays text, is exported bent and is applied as its bent letters. The fake font's
// letters are squares with a square counter. Gate tasks: workbook Task 2 (text to curves, the
// letters stretched by their nodes); coursebook exam-style 1 (a TV logo with arched text).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AnimObject,
  Envelope,
  GroupObject,
  PathObject,
  TextObject,
} from '../../../src/core/animation/types.ts';
import { glyphsOf, setGlyphSource } from '../../../src/core/graphics/glyphs.ts';
import { fakeGlyphSource, fakeWidths } from '../../helpers/fake-glyphs.ts';
import { testApp } from '../../helpers/test-app.ts';

const arch: Envelope = { kind: 'preset', preset: 'arch', bend: 60 };
/** Lets the fonts' outlines arrive (the fake source answers at once). */
const read = () => new Promise((r) => setTimeout(r, 0));

function setup(mode: 'graphics' | 'animation' = 'graphics') {
  const t = testApp();
  const g = t.app[mode];
  const doc = () => g.store.get().history.present;
  const objects = () => doc().layers.flatMap((l) => l.objects);
  const message = () => g.store.get().message?.text ?? '';
  g.addText({ x: 40, y: 60 }, 'TV');
  const text = objects().at(-1) as TextObject;
  g.select([text.id]);
  return { ...t, g, doc, objects, message, text };
}

let source: ReturnType<typeof fakeGlyphSource>;
beforeEach(() => {
  source = fakeGlyphSource();
  setGlyphSource(source, (t, s) => fakeWidths(t.size)(s));
});
afterEach(() => setGlyphSource(null));

describe('GT4: Convert to curves on text', () => {
  for (const mode of ['graphics', 'animation'] as const)
    it(`${mode}: the text becomes its letters, grouped and selected, in one undo step`, async () => {
      const s = setup(mode);
      expect(s.g.convertToCurves()).toBeNull();
      // The first time, the font's outlines are read first.
      expect(s.objects().at(-1)!.kind).toBe('text');
      await read();
      const g = s.objects().at(-1) as GroupObject;
      expect(g).toMatchObject({ kind: 'group', id: s.text.id, name: 'TV' });
      expect(g.children.map((c) => [c.kind, c.name])).toEqual([
        ['path', 'T'],
        ['path', 'V'],
      ]);
      expect(s.g.store.get().selection).toEqual([s.text.id]);
      expect(source.loads).toEqual(['Inter']);
      s.g.undo();
      expect(s.objects().at(-1)!.kind).toBe('text');
      // Read once: done at once the next time.
      expect(s.g.convertToCurves()).toBeNull();
      expect(s.objects().at(-1)!.kind).toBe('group');
      expect(source.loads).toHaveLength(1);
    });

  it('workbook Task 2: ungrouped, a letter’s top nodes pulled up stretch it (one undo step)', async () => {
    const s = setup();
    s.g.convertToCurves();
    await read();
    s.g.ungroup();
    const letter = () => s.objects().find((o) => o.name === 'T') as PathObject;
    const t = letter();
    expect(t).toMatchObject({ kind: 'path', fillRule: 'nonzero' });
    expect(t.holes).toHaveLength(1);
    s.g.select([t.id]);
    const top = Math.min(...t.points.map((p) => p.y));
    s.g.chooseNodes(t.points.flatMap((p, i) => (p.y === top ? [i] : [])));
    s.g.moveNodes(0, -30);
    expect(letter().height).toBeCloseTo(t.height + 30, 0);
    expect(letter().y).toBeCloseTo(t.y - 30, 0);
    expect(letter().holes).toHaveLength(1);
    s.g.undo();
    expect(letter().height).toBe(t.height);
  });

  it('a font whose outlines cannot be read is refused in the message line, the text kept', async () => {
    setGlyphSource({ load: async () => null });
    const s = setup();
    expect(s.g.convertToCurves()).toBeNull();
    await read();
    expect(s.objects().at(-1)!.kind).toBe('text');
    expect(s.message()).toMatch(/letters of “Inter” cannot be read/);
  });

  it('without the fonts’ outlines (outside the app) it says so', () => {
    setGlyphSource(null);
    const s = setup();
    expect(s.g.convertToCurves()).toMatch(/in the app/);
  });
});

describe('GT5: text bent by an envelope, still text', () => {
  it('coursebook exam-style 1: the TV logo’s words arched, still editable, exported bent', async () => {
    const s = setup('animation');
    expect(s.g.setEnvelope(arch)).toBeNull();
    const bent = s.objects().at(-1) as TextObject;
    expect(bent).toMatchObject({ kind: 'text', envelope: arch });
    // Its words changed: still text, still arched.
    expect(s.g.setProperties({ text: 'TV5' } as Partial<AnimObject>)).toBeNull();
    expect(s.objects().at(-1)).toMatchObject({ kind: 'text', text: 'TV5', envelope: arch });
    s.dialogs.exportAnimation.mockResolvedValueOnce('/work/Logo.svg');
    await s.g.exportAnimation('svg');
    const svg = s.disk.get('/work/Logo.svg')!;
    expect(svg).not.toContain('>T<');
    expect([...svg.matchAll(/<path d="[^"]*C/g)].length).toBeGreaterThanOrEqual(3);
    expect(glyphsOf(bent)).not.toBeNull();
  });

  it('Apply makes it the bent letters as paths (after reading the outlines, one undo step)', async () => {
    const s = setup();
    s.g.setEnvelope(arch);
    expect(s.g.applyEnvelope()).toBeNull();
    await read();
    const applied = s.objects().at(-1) as GroupObject;
    expect(applied).toMatchObject({ kind: 'group', id: s.text.id });
    expect(applied.envelope).toBeUndefined();
    expect(applied.children.every((c) => c.kind === 'path')).toBe(true);
    s.g.undo();
    expect(s.objects().at(-1)).toMatchObject({ kind: 'text', envelope: arch });
  });
});
