// GT1 (M20) step 2: letter spacing, kerning and line spacing drawn on the stage and in every
// export (one drawing, so the SVG too), checked when typed, followed by the kerning when the
// words change, and kept when the text is split into letters, resized or keyed to a new size.
import { describe, expect, it } from 'vitest';
import { drawStage, type StageCanvas } from '../../../../src/core/animation/draw.ts';
import { createAnimation, createText } from '../../../../src/core/animation/factory.ts';
import { resizeFrom } from '../../../../src/core/animation/geometry.ts';
import {
  KERN_BIG_STEP,
  KERN_STEP,
  kernedBy,
  kerningAfterEdit,
  kerningAt,
  withKerning,
} from '../../../../src/core/animation/kerning.ts';
import { addObject } from '../../../../src/core/animation/layers.ts';
import { splitIntoLetters, type MeasureText } from '../../../../src/core/animation/letters.ts';
import { validateObject } from '../../../../src/core/animation/rules.ts';
import { stageSvg } from '../../../../src/core/animation/svg-export.ts';
import { layoutText } from '../../../../src/core/animation/text-layout.ts';
import { propertyOf, withProperty } from '../../../../src/core/animation/tween.ts';
import type { AnimationDoc, AnimObject, TextObject } from '../../../../src/core/animation/types.ts';

/** Records the calls, as draw.test.ts does; every letter 10 px wide. */
function recorder() {
  const calls: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, key: string) {
      if (key in target) return target[key];
      if (key === 'withLayer' || key === 'patternOf' || key === 'withFilters') return undefined;
      return (...args: unknown[]) => {
        const shown = args.map((a) =>
          typeof a === 'number' ? String(Math.round(a * 1000) / 1000) : String(a),
        );
        calls.push(`${key}(${shown.join(',')})`);
        if (key === 'createLinearGradient')
          return { addColorStop: (at: number, c: string) => calls.push(`stop ${at} ${c}`) };
        if (key === 'measureText') return { width: 10 * String(args[0]).length };
        return undefined;
      };
    },
    set(_t, key: string, value: unknown) {
      target[key] = value;
      calls.push(`${key}=${typeof value === 'object' ? 'object' : String(value)}`);
      return true;
    },
  }) as unknown as StageCanvas;
  return { ctx, calls };
}

function stageWith(...objects: AnimObject[]): AnimationDoc {
  let doc = createAnimation({ name: 'A' });
  doc = { ...doc, stage: { ...doc.stage, width: 600, height: 400, background: '#ffffff' } };
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
}

/** Text 10 px a letter, its box from the layout (as the app measures it). */
function text(words: string, over: Partial<TextObject> = {}): TextObject {
  const t = { ...createText(words, { x: 0, y: 0, size: 50 }), ...over };
  const laid = layoutText(t, (s) => 10 * s.length);
  return { ...t, width: laid.width, height: laid.height };
}

const texts = (calls: string[], kind = 'fillText') => calls.filter((c) => c.startsWith(`${kind}(`));

describe('GT1: spaced text on the stage', () => {
  it('GT1: letter spacing draws each letter at its place in the layout, from its left', () => {
    const { ctx, calls } = recorder();
    // 100 thousandths of a 50 px em: 5 px after each letter. Box 40 × 60, centred on (0, 0).
    const t = text('ABC', { letterSpacing: 100 });
    expect(t.width).toBe(40);
    drawStage(ctx, stageWith(t));
    expect(calls).toContain('textAlign=left');
    expect(texts(calls)).toEqual([
      'fillText(A,-20,-30)',
      'fillText(B,-5,-30)',
      'fillText(C,10,-30)',
    ]);
  });

  it('GT1: kerning moves only the letters after it; spaces take room but draw nothing', () => {
    const { ctx, calls } = recorder();
    // −200 after "A" (index 0): 10 px closer.
    const t = text('AB C', { kerning: [-200] });
    drawStage(ctx, stageWith(t));
    expect(texts(calls)).toEqual([
      'fillText(A,-15,-30)',
      'fillText(B,-15,-30)',
      'fillText(C,5,-30)',
    ]);
  });

  it('GT1: each line is aligned in the box; outlines first, then fills, a line at a time', () => {
    const { ctx, calls } = recorder();
    const t = text('AB\nC', {
      letterSpacing: 200,
      align: 'right',
      stroke: { colour: '#000000', width: 1, dash: 'solid' },
    });
    // Line 1: 10 + 10 + 10 (spacing) = 30 wide, the box too; line 2 "C" 10 wide, pushed right.
    expect(t.width).toBe(30);
    drawStage(ctx, stageWith(t));
    const letters = calls.filter((c) => /^(fill|stroke)Text\(/.test(c));
    expect(letters).toEqual([
      'strokeText(A,-15,-60)',
      'strokeText(B,5,-60)',
      'fillText(A,-15,-60)',
      'fillText(B,5,-60)',
      'strokeText(C,5,0)',
      'fillText(C,5,0)',
    ]);
  });

  it('GT1: line spacing sets the lines apart, with or without letter spacing', () => {
    const plain = recorder();
    // 2 × 50 px a line: the box is 200 high, the second line 100 lower.
    const t = text('A\nB', { lineSpacing: 2 });
    expect(t.height).toBe(200);
    drawStage(plain.ctx, stageWith(t));
    expect(texts(plain.calls)).toEqual(['fillText(A,-5,-100)', 'fillText(B,-5,0)']);
    const spaced = recorder();
    drawStage(spaced.ctx, stageWith(text('A\nB', { lineSpacing: 2, letterSpacing: 10 })));
    expect(texts(spaced.calls)).toEqual(['fillText(A,-5,-100)', 'fillText(B,-5,0)']);
  });

  it('GT1: without spacing, straight text is still one fillText a line (pixels unchanged)', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith({ ...text('AB\nC'), align: 'centre' }));
    expect(texts(calls)).toEqual(['fillText(AB,0,-60)', 'fillText(C,0,0)']);
    expect(calls).toContain('textAlign=center');
  });

  it('GT1: a gradient runs across the whole box (made once), and the fill opacity still fades it', () => {
    const { ctx, calls } = recorder();
    const t = {
      ...text('ABC', { letterSpacing: 100 }),
      fill: { kind: 'linear' as const, from: '#ffffff', to: '#ff0000', angle: 0 },
      fillOpacity: 50,
    };
    drawStage(ctx, stageWith(t));
    // One gradient, from the box's left edge to its right.
    expect(calls.filter((c) => c.startsWith('createLinearGradient('))).toEqual([
      'createLinearGradient(-20,0,20,0)',
    ]);
    const first = calls.indexOf('fillText(A,-20,-30)');
    expect(calls.slice(0, first)).toContain('globalAlpha=0.5');
    expect(calls.slice(first)).toContain('globalAlpha=1');
  });

  it('GT1: curved text uses the line spacing for its letters’ cells', () => {
    const { ctx, calls } = recorder();
    const t = { ...text('AB', { lineSpacing: 2 }), curve: 20 };
    drawStage(ctx, stageWith(t));
    // Drawn from the top of a 100 px cell: 50 above the letter's middle.
    expect(texts(calls).every((c) => c.endsWith(',-50)'))).toBe(true);
  });
});

describe('GT1: spaced text in the SVG', () => {
  it('GT1: centred spaced text sits in the middle of a wider box; without a measure, rough widths', () => {
    const { ctx, calls } = recorder();
    // Laid 25 wide in a 45 px box: 10 px in from its left (−22.5).
    const t = { ...text('AB', { letterSpacing: 100, align: 'centre' }), width: 45 };
    drawStage(ctx, stageWith(t));
    expect(texts(calls)).toEqual(['fillText(A,-12.5,-30)', 'fillText(B,2.5,-30)']);
    // An SVG made without the app's measure: 0.55 em a letter (27.5 px) and the 5 px spacing.
    const svg = stageSvg(stageWith(text('AB', { letterSpacing: 100 })));
    expect(svg).toMatch(/<text x="-12\.5"[^>]*>A<\/text>/);
    expect(svg).toMatch(/<text x="20"[^>]*>B<\/text>/);
  });

  it('GT1: each letter of spaced text is its own <text>; plain text stays one per line', () => {
    const measure = (_font: string, s: string) => 10 * s.length;
    const spaced = stageSvg(stageWith(text('AB', { letterSpacing: 100 })), 0, {}, [], {}, measure);
    expect(spaced.match(/<text /g)?.length).toBe(2);
    expect(spaced).toContain('>A</text>');
    expect(spaced).toContain('>B</text>');
    expect(spaced).toContain('text-anchor="start"');
    const plain = stageSvg(stageWith(text('AB')), 0, {}, [], {}, measure);
    expect(plain.match(/<text /g)?.length).toBe(1);
    expect(plain).toContain('>AB</text>');
  });
});

describe('GT1: spacing is checked', () => {
  it('GT1: letter spacing −500 to 2000, kerning −1000 to 1000, line spacing 0.5 to 5', () => {
    const ok = text('AB', { letterSpacing: -500, kerning: [1000, -1000], lineSpacing: 0.5 });
    expect(() => validateObject(ok)).not.toThrow();
    expect(() => validateObject({ ...ok, letterSpacing: 2000, lineSpacing: 5 })).not.toThrow();
    expect(() => validateObject({ ...ok, letterSpacing: 2001 })).toThrow(
      'The letter spacing must be between −500 and 2000 (thousandths of the size).',
    );
    expect(() => validateObject({ ...ok, letterSpacing: Number.NaN })).toThrow(/letter spacing/);
    expect(() => validateObject({ ...ok, kerning: [0, 1001] })).toThrow(
      'Kerning must be between −1000 and 1000 (thousandths of the size).',
    );
    expect(() => validateObject({ ...ok, lineSpacing: 0.4 })).toThrow(
      'The line spacing must be between 0.5 and 5 times the size.',
    );
    expect(() => validateObject({ ...ok, lineSpacing: 6 })).toThrow(/line spacing/);
  });
});

describe('GT1: kerning at the cursor', () => {
  it('GT1: the gap at the cursor is the kerning after the letter before it', () => {
    const t = { text: 'AV\nTo', kerning: [-80] };
    expect(kerningAt(t, 1)).toBe(-80);
    expect(kerningAt(t, 4)).toBe(0);
    // No pair: at the start, the end, or either side of a new line.
    for (const at of [0, 2, 3, 5]) expect(kerningAt(t, at)).toBeNull();
  });

  it('GT1: Alt+← / → steps of 20 (Shift: 100), kept within ±1000; 0 everywhere is no kerning', () => {
    expect(KERN_STEP).toBe(20);
    expect(KERN_BIG_STEP).toBe(100);
    const t = { text: 'AVATAR', kerning: undefined };
    expect(kernedBy(t, 2, -KERN_STEP)).toEqual([0, -20]);
    expect(kernedBy({ ...t, kerning: [0, -20] }, 2, KERN_STEP)).toBeUndefined();
    expect(kernedBy({ ...t, kerning: [990] }, 1, KERN_BIG_STEP)).toEqual([1000]);
    expect(kernedBy({ ...t, kerning: [-990] }, 1, -KERN_BIG_STEP)).toEqual([-1000]);
    expect(withKerning(t, 3, 40)).toEqual([0, 0, 40]);
    expect(() => kernedBy(t, 0, KERN_STEP)).toThrow(
      'Put the cursor between two letters to kern them.',
    );
    expect(() => withKerning(t, 6, 10)).toThrow('Put the cursor between two letters');
  });

  it('GT1: a letter made of two UTF-16 units is kerned after its whole self', () => {
    // "😀" is two units: the cursor after it is at 2; its kerning is at its start, 0.
    expect(withKerning({ text: '😀A', kerning: undefined }, 2, 30)).toEqual([30]);
    expect(kerningAt({ text: '😀A', kerning: [30] }, 2)).toBe(30);
  });

  it('GT1: when the words change, the kerning follows the letters; what was deleted goes', () => {
    // "AVATAR": kerning after A(0), V(1) and R(5)… typed in the middle.
    const k = [-60, -40, 0, 0, 20];
    expect(kerningAfterEdit('AVATAR', 'AVAXTAR', k)).toEqual([-60, -40, 0, 0, 0, 20]);
    expect(kerningAfterEdit('AVATAR', 'VATAR', k)).toEqual([-40, 0, 0, 20]);
    expect(kerningAfterEdit('AVATAR', 'AVA', k)).toEqual([-60, -40]);
    expect(kerningAfterEdit('AVATAR', 'AVATAR!', k)).toEqual(k);
    expect(kerningAfterEdit('AVATAR', 'AVATAR', k)).toEqual(k);
    expect(kerningAfterEdit('AVATAR', 'TAR', k)).toEqual([0, 20]);
    expect(kerningAfterEdit('AVATAR', 'xyz', k)).toBeUndefined();
    expect(kerningAfterEdit('AB', 'ABC', undefined)).toBeUndefined();
  });
});

/** 10 px a letter; the height as the app measures it (with the line spacing). */
const measure: MeasureText = (t) => ({
  width: t.text.split('\n').reduce((w, l) => Math.max(w, l.length * 10), 0),
  height: t.text.split('\n').length * t.size * (t.lineSpacing ?? 1.2),
});

describe('GT1: spaced text split, resized and keyed', () => {
  it('GT1: Split into letters puts each letter where the spaced text drew it', () => {
    const t = {
      ...text('AB\nC', { letterSpacing: 100, kerning: [100], lineSpacing: 2 }),
      x: 10,
      y: 20,
    };
    const letters = splitIntoLetters(t, measure);
    // "A" at 0, "B" 10 + 5 (spacing) + 5 (kerning) on; "C" on the next line, 100 lower.
    expect(letters.map((l) => [l.text, l.x, l.y, l.width, l.height])).toEqual([
      ['A', 10, 20, 10, 100],
      ['B', 30, 20, 10, 100],
      ['C', 10, 120, 10, 100],
    ]);
    // A letter alone needs no spacing; its line spacing keeps it in its line's cell.
    expect(letters.every((l) => l.letterSpacing === undefined && l.kerning === undefined)).toBe(
      true,
    );
    expect(letters[0]!.lineSpacing).toBe(2);
  });

  it('GT1: centred spaced lines split where they were drawn', () => {
    const t = text('ABC\nD', { letterSpacing: 200, align: 'centre' });
    // Line 1: 30 + 2 × 10 = 50 wide; "D" 10 wide, centred: 20 in.
    const letters = splitIntoLetters(t, measure);
    expect(letters.map((l) => l.x)).toEqual([0, 20, 40, 20]);
  });

  it('GT1: curved spaced text splits from its unspaced widths', () => {
    const t = text('ABC', { letterSpacing: 100, curve: 30 });
    const letters = splitIntoLetters(t, measure);
    expect(letters.map((l) => l.text)).toEqual(['A', 'B', 'C']);
    expect(letters.every((l) => l.width === 10 && l.letterSpacing === undefined)).toBe(true);
  });

  it('GT1: resizing spaced text on the stage scales its size; the spacing (in em) scales with it', () => {
    const t = text('AB', { letterSpacing: 100, lineSpacing: 1.5 });
    const big = resizeFrom(t, 'se', { x: t.width * 2, y: t.height * 2 }, { lockRatio: false });
    expect(big.size).toBeCloseTo(100);
    expect(big.letterSpacing).toBe(100);
    expect(big.lineSpacing).toBe(1.5);
    const laid = layoutText(big, (s) => 20 * s.length);
    expect(big.width).toBeCloseTo(laid.width);
    expect(big.height).toBeCloseTo(laid.height);
  });

  it('GT1: a size keyframe gives the box its line spacing', () => {
    const t = text('A\nB', { lineSpacing: 2 });
    const sized = withProperty(t, 'size', 100);
    expect(sized.height).toBe(400);
    expect(propertyOf(sized, 'size')).toBe(100);
  });
});
