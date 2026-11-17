// G2 (M21): every layer's opacity and blend mode drawn as one picture, on the stage and in the
// SVG — a see-through vector layer is faded as one picture (its overlaps no darker), a clipping
// mask's layers are seen only where their base is drawn, each at its own opacity and blend.
import { describe, expect, it } from 'vitest';
import { createLayer, createRect } from '../../../../../src/core/animation/factory.ts';
import {
  drawStage,
  type LayerHow,
  type StageCanvas,
} from '../../../../../src/core/animation/draw.ts';
import { stageSvg } from '../../../../../src/core/animation/svg-export.ts';
import type { AnimationDoc, Layer } from '../../../../../src/core/animation/types.ts';
import { createGraphic } from '../../../../../src/core/graphics/document.ts';
import { createBitmap, createMask } from '../../../../../src/core/graphics/pixels/raster.ts';

/** A canvas that writes down what is drawn: layers as nested [ … ]. */
function recorder(withLayers = true) {
  const calls: string[] = [];
  const target: Record<string, unknown> = {
    globalAlpha: 1,
    drawBitmap: (_b: unknown, x: number, y: number, key: string) =>
      calls.push(
        `bitmap ${key} at ${x},${y} alpha ${String(target.globalAlpha ?? 1)} ${String(target.globalCompositeOperation ?? 'source-over')}`,
      ),
  };
  if (withLayers)
    target.withLayer = (alpha: number, draw: (c: StageCanvas) => void, how: LayerHow = {}) => {
      calls.push(`[ layer ${alpha}${how.blend ? ` ${how.blend}` : ''}${how.clip ? ' clip' : ''}`);
      draw(ctx);
      calls.push(']');
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

function image(layers: Layer[]): AnimationDoc {
  const doc = createGraphic({
    name: 'Stadium',
    size: { width: 100, height: 80, units: 'px', dpi: 96 },
    background: '#ffffff',
  });
  return { ...doc, layers };
}

const rects = (name: string, extra: Partial<Layer> = {}): Layer => ({
  ...createLayer(name),
  objects: [
    { ...createRect({ x: 0, y: 0, width: 10, height: 10 }), name: `${name} a` },
    { ...createRect({ x: 5, y: 5, width: 10, height: 10 }), name: `${name} b` },
  ],
  ...extra,
});

const photo = (name: string, extra: Partial<Layer> = {}): Layer => ({
  ...createLayer(name),
  id: name,
  pixels: { bitmap: createBitmap(4, 4), x: 1, y: 2 },
  ...extra,
});

describe('M21 G2: a layer drawn as one picture', () => {
  it('fades a see-through vector layer as one picture, and mixes it in its blend mode', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, image([rects('Faded', { opacity: 0.5 }), rects('Mixed', { blend: 'screen' })]));
    expect(calls).toEqual([
      '[ layer 0.5',
      'fill alpha 1',
      'fill alpha 1',
      ']',
      '[ layer 1 screen',
      'fill alpha 1',
      'fill alpha 1',
      ']',
    ]);
  });

  it('draws an ordinary layer straight on, and a canvas without layers fades each part', () => {
    const plain = recorder();
    drawStage(plain.ctx, image([rects('Plain')]));
    expect(plain.calls).toEqual(['fill alpha 1', 'fill alpha 1']);
    const flat = recorder(false);
    drawStage(flat.ctx, image([rects('Faded', { opacity: 0.5 })]));
    expect(flat.calls).toEqual(['fill alpha 0.5', 'fill alpha 0.5']);
  });

  it('draws a pixel layer at its opacity and blend, or plain inside a clipping group', () => {
    const { ctx, calls } = recorder();
    drawStage(
      ctx,
      image([
        photo('Circle', { opacity: 0.8, blend: 'multiply' }),
        photo('Photo', { clip: true, opacity: 0.5, blend: 'darken' }),
        rects('Text', { clip: true }),
        photo('Hidden', { clip: true, visible: false }),
        photo('Sky', { opacity: 0.25 }),
      ]),
    );
    expect(calls).toEqual([
      '[ layer 0.8 multiply',
      'bitmap Circle at 1,2 alpha 1 source-over',
      '[ layer 0.5 darken clip',
      'bitmap Photo at 1,2 alpha 1 source-over',
      ']',
      '[ layer 1 clip',
      'fill alpha 1',
      'fill alpha 1',
      ']',
      ']',
      'bitmap Sky at 1,2 alpha 0.25 source-over',
    ]);
  });

  it('hides the layers clipped to a hidden one; without layers they are drawn as ordinary', () => {
    const doc = image([photo('Circle', { visible: false }), photo('Photo', { clip: true })]);
    const { ctx, calls } = recorder();
    drawStage(ctx, doc);
    expect(calls).toEqual([]);
    const shown = image([photo('Circle'), photo('Photo', { clip: true })]);
    const flat = recorder(false);
    drawStage(flat.ctx, shown);
    expect(flat.calls).toEqual([
      'bitmap Circle at 1,2 alpha 1 source-over',
      'bitmap Photo at 1,2 alpha 1 source-over',
    ]);
  });
});

describe('M21 G2, GB1: the SVG of layers', () => {
  it('embeds a pixel layer as an image of its PNG, at its opacity and in its blend mode', () => {
    const doc = image([photo('Photo', { opacity: 0.5, blend: 'multiply' }), photo('Unread')]);
    const svg = stageSvg(doc, 0, {}, [], {}, undefined, undefined, {
      Photo: 'data:image/png;base64,AAAA',
    });
    expect(svg).toContain(
      '<image href="data:image/png;base64,AAAA" x="1" y="2" width="4" height="4" preserveAspectRatio="none" opacity="0.5" style="mix-blend-mode:multiply" transform="matrix(1 0 0 1 0 0)"/>',
    );
    expect(svg.match(/<image/g)).toHaveLength(1);
  });

  it('puts a vector layer in a group with its opacity and blend mode', () => {
    const svg = stageSvg(image([rects('Logo', { opacity: 0.4, blend: 'difference' })]));
    expect(svg).toContain('<g opacity="0.4" style="mix-blend-mode:difference">');
  });

  it('clips a layer to its base with a mask of the base, made white', () => {
    const doc = image([
      rects('Circle'),
      photo('Photo', { clip: true }),
      rects('Words', { clip: true, opacity: 0.5 }),
    ]);
    const svg = stageSvg(doc, 0, {}, [], {}, undefined, undefined, {
      Photo: 'data:image/png;base64,P',
    });
    // The base, once, with an id; each clipped layer masked by it.
    expect(svg).toMatch(
      /<g>\n<g id="b1">\n<path [^\n]*\/>\n<path [^\n]*\/>\n<\/g>\n<g mask="url\(#m1\)">\n<image/,
    );
    expect(svg).toContain('<g opacity="0.5" mask="url(#m1)">');
    expect(svg).toContain(
      '<mask id="m1" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="80"><use href="#b1" filter="url(#white)"/></mask>',
    );
    expect(svg).toContain('<filter id="white"');
    expect(svg.match(/<mask /g)).toHaveLength(1);
  });

  it('shows a pixel layer with a mask as the PNG given (the mask applied in it)', () => {
    const layer = photo('Masked');
    const masked: Layer = { ...layer, pixels: { ...layer.pixels!, mask: createMask(4, 4) } };
    const svg = stageSvg(image([masked]), 0, {}, [], {}, undefined, undefined, {
      Masked: 'data:x',
    });
    expect(svg).toContain('<image href="data:x"');
  });
});
