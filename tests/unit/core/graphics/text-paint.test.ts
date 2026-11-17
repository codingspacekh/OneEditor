// Benchmark 2026-11-17 (9626/04 M/22 Heron, M/17 Woodlands, J/18 TTS10): text in an image is
// painted as Illustrator and Inkscape paint it.
// G2: its outline is drawn over the letters, centred on their edge, so a 1 pt outline shows 1 pt
// wide (behind them, only its outer half showed). An animation keeps the outline behind the
// letters (words over video stay readable).
// G5: a gradient on its letters runs over their ink (the capitals' and ascenders' tops to the
// baseline, or to the descenders' feet), line by line, or letter by letter along a path or a
// curve, so white to red is strongly red at the letters' feet (M/22 Heron), not spread over
// the empty em box and line gap.
import { describe, expect, it } from 'vitest';
import { drawStage, type StageCanvas } from '../../../../src/core/animation/draw.ts';
import {
  createAnimation,
  createLayer,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { stageSvg } from '../../../../src/core/animation/svg-export.ts';
import type { AnimationDoc, AnimObject, TextObject } from '../../../../src/core/animation/types.ts';
import { createGraphic } from '../../../../src/core/graphics/document.ts';
import { BASELINE, CAP_TOP } from '../../../../src/core/graphics/text-path.ts';

type Call = { name: string; args: unknown[]; fill?: unknown; stroke?: unknown };

/** A canvas that records the text drawn and the gradients made (every other call does nothing). */
function recorder() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
  };
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === 'measureText') return (s: string) => ({ width: s.length * 50 });
      if (key === 'createLinearGradient')
        return (...args: number[]) => {
          const g = { kind: 'linear', args, addColorStop: () => {} };
          calls.push({ name: 'gradient', args });
          return g;
        };
      if (key === 'createRadialGradient')
        return (...args: number[]) => ({ kind: 'radial', args, addColorStop: () => {} });
      if (key === 'fillText' || key === 'strokeText')
        return (...args: unknown[]) =>
          calls.push({ name: key, args, fill: target.fillStyle, stroke: target.lineWidth });
      return () => {};
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as StageCanvas;
  return { ctx, calls };
}

const SIZE = 100;
const words = (over: Partial<TextObject> = {}): TextObject => ({
  ...createText('Villa', { x: 0, y: 0, size: SIZE, font: 'Inter' }),
  width: 250,
  height: 1.2 * SIZE,
  fill: { kind: 'linear', from: '#ffffff', to: '#ff0000', angle: 90 },
  stroke: { colour: '#000000', width: 2, dash: 'solid' },
  ...over,
});

const image = (objects: AnimObject[]): AnimationDoc => {
  const doc = createGraphic({
    name: 'Logo',
    size: { width: 400, height: 400, units: 'px', dpi: 96 },
    background: 'none',
  });
  return { ...doc, layers: [{ ...createLayer('Layer 1'), objects }] };
};
const animation = (objects: AnimObject[]): AnimationDoc => {
  const doc = createAnimation({ name: 'Anim' });
  return { ...doc, layers: [{ ...createLayer('Layer 1'), objects }] };
};

const order = (calls: Call[]) =>
  calls.filter((c) => c.name === 'fillText' || c.name === 'strokeText').map((c) => c.name);

describe('G2 (benchmark): an outline over the letters in an image, behind them in an animation', () => {
  it('in an image the letters are filled first and their outline drawn over them', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, image([words()]));
    expect(order(calls)).toEqual(['fillText', 'strokeText']);
  });

  it('in an animation the outline stays behind the letters', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, animation([words()]));
    expect(order(calls)).toEqual(['strokeText', 'fillText']);
  });

  it('on a path and with letter spacing too, letter by letter or line by line', () => {
    const path = {
      points: [
        { x: 0, y: 200 },
        { x: 400, y: 200 },
      ],
      closed: false,
      start: 0,
      side: 'outside' as const,
    };
    for (const t of [words({ path, width: 400, height: 200 }), words({ letterSpacing: 100 })]) {
      const { ctx, calls } = recorder();
      drawStage(ctx, image([t]));
      const o = order(calls);
      // Each fill comes before the outline drawn over it.
      expect(o.indexOf('fillText')).toBeLessThan(o.indexOf('strokeText'));
      expect(o.lastIndexOf('fillText')).toBeLessThan(o.lastIndexOf('strokeText'));
    }
  });

  it('the SVG of an image writes the filled words first, then the outline at the width typed', () => {
    const svg = stageSvg(image([words()]));
    const texts = [...svg.matchAll(/<text [^>]*>/g)].map((m) => m[0]);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/fill="url\(#/);
    expect(texts[1]).toMatch(/fill="none"/);
    expect(texts[1]).toMatch(/stroke-width="2"/);
  });
});

describe('G5 (benchmark): a gradient on text runs over the letters’ ink', () => {
  it('in an image, a vertical gradient runs from the capitals’ tops to the baseline (no descenders)', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, image([words()]));
    const [g] = calls.filter((c) => c.name === 'gradient');
    // The words' box is centred on (0, 0) while drawn: its top at -60.
    const [, y0, , y1] = g!.args as number[];
    expect(y0).toBeCloseTo(-60 + CAP_TOP * SIZE, 5);
    expect(y1).toBeCloseTo(-60 + BASELINE * SIZE, 5);
  });

  it('down to the descenders’ feet when the words have them', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, image([words({ text: 'Holy' })]));
    const [, , , y1] = calls.find((c) => c.name === 'gradient')!.args as number[];
    expect(y1).toBeGreaterThan(-60 + BASELINE * SIZE + 0.1 * SIZE);
  });

  it('each line over its own letters', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, image([words({ text: 'Villa\nVilla', height: 2.4 * SIZE })]));
    const bands = calls
      .filter((c) => c.name === 'gradient')
      .map((c) => [(c.args as number[])[1]!, (c.args as number[])[3]!]);
    expect(bands).toHaveLength(2);
    expect(bands[1]![0]! - bands[0]![0]!).toBeCloseTo(1.2 * SIZE, 5);
  });

  it('along a path, each letter over its own ink', () => {
    const path = {
      points: [
        { x: 0, y: 200 },
        { x: 400, y: 200 },
      ],
      closed: false,
      start: 0,
      side: 'outside' as const,
    };
    const { ctx, calls } = recorder();
    drawStage(ctx, image([words({ path, width: 400, height: 200 })]));
    const gradients = calls.filter((c) => c.name === 'gradient');
    expect(gradients).toHaveLength(5);
    // In the letter's own frame (drawn from half a line above its middle): its ink band.
    const [, y0, , y1] = gradients[0]!.args as number[];
    expect(y0).toBeCloseTo(-0.6 * SIZE + CAP_TOP * SIZE, 5);
    expect(y1).toBeCloseTo(-0.6 * SIZE + BASELINE * SIZE, 5);
  });

  it('in an animation a gradient still spans the words’ box', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, animation([words()]));
    const [, y0, , y1] = calls.find((c) => c.name === 'gradient')!.args as number[];
    expect(y0).toBeCloseTo(-60, 5);
    expect(y1).toBeCloseTo(60, 5);
  });
});
