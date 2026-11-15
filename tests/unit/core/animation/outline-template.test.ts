// M19 / GV7, GV8: View ▸ Outline draws every object as a thin line (only on the stage while
// editing), and template layers are placed faded and locked, shown only while editing, and left
// out of what is exported. A recording canvas stands in for the real one, as in draw.test.ts.
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createButton,
  createEllipse,
  createGroup,
  createLine,
  createPicture,
  createRect,
  createText,
} from '../../../../src/core/animation/factory.ts';
import { addObject } from '../../../../src/core/animation/layers.ts';
import {
  drawStage,
  TEMPLATE_OPACITY,
  WIREFRAME_COLOUR,
  type StageCanvas,
} from '../../../../src/core/animation/draw.ts';
import {
  fittedPicture,
  hasTemplate,
  markTemplate,
  placeTemplate,
  withoutTemplates,
} from '../../../../src/core/animation/template.ts';
import { stageSvg } from '../../../../src/core/animation/svg-export.ts';
import type { AnimationDoc, AnimObject, Picture } from '../../../../src/core/animation/types.ts';

function recorder() {
  const calls: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, key: string) {
      if (key in target) return target[key];
      if (key === 'withLayer' || key === 'measureText') return undefined;
      return (...args: unknown[]) => {
        const shown = args.map((a) =>
          typeof a === 'number'
            ? String(Math.round(a * 1000) / 1000)
            : typeof a === 'string'
              ? a
              : '…',
        );
        calls.push(`${key}(${shown.join(',')})`);
        if (key === 'createLinearGradient' || key === 'createRadialGradient')
          return { addColorStop: () => {} };
        return undefined;
      };
    },
    set(_t, key: string, value: unknown) {
      target[key] = value;
      calls.push(`${key}=${typeof value === 'object' ? 'gradient' : String(value)}`);
      return true;
    },
  }) as unknown as StageCanvas;
  return { ctx, calls };
}

function stageWith(...objects: AnimObject[]): AnimationDoc {
  let doc = createAnimation({ name: 'A' });
  doc = { ...doc, stage: { ...doc.stage, width: 600, height: 400, background: '#000000' } };
  for (const o of objects) doc = addObject(doc, doc.layers[0]!.id, o);
  return doc;
}

const CHIP: Picture = { id: 'chip', path: '/m/Chip.png', width: 300, height: 100 };

describe('GV7: View ▸ Outline (wireframe)', () => {
  const outline = { editing: true, wireframe: { lineWidth: 0.5 } };

  it('GV7: draws a shape as a thin outline in one colour, never filled, on a white stage', () => {
    const rect = { ...createRect({ x: 10, y: 10, width: 100, height: 50 }), opacity: 40 };
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith(rect), outline);
    expect(calls.slice(0, 2)).toEqual(['fillStyle=#ffffff', 'fillRect(0,0,600,400)']);
    expect(calls).not.toContain('fill()');
    expect(calls).toContain(`strokeStyle=${WIREFRAME_COLOUR}`);
    expect(calls).toContain('lineWidth=0.5');
    expect(calls).toContain('stroke()');
    // Every object at full strength, so faint parts can still be seen and picked.
    expect(calls.some((c) => c.startsWith('globalAlpha'))).toBe(false);
  });

  it('GV7: an ellipse, a line and the parts of a group are each outlined', () => {
    const group = createGroup([
      createEllipse({ x: 0, y: 0, width: 40, height: 40 }),
      createLine({ x: 50, y: 0 }, { x: 90, y: 30 }),
    ]);
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith(group), outline);
    expect(calls.filter((c) => c === 'stroke()')).toHaveLength(2);
    expect(calls.some((c) => c.startsWith('ellipse('))).toBe(true);
    expect(calls).not.toContain('fill()');
  });

  it('GV7: a picture is its box with a cross; its pixels are not drawn', () => {
    const pic = createPicture(CHIP, { x: 0, y: 0 });
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith(pic), { ...outline, image: () => ({}) });
    expect(calls.some((c) => c.startsWith('drawImage'))).toBe(false);
    expect(calls).toContain('strokeRect(-150,-50,300,100)');
    expect(calls).toContain('moveTo(-150,-50)');
    expect(calls).toContain('lineTo(150,50)');
    expect(calls).toContain('moveTo(150,-50)');
    expect(calls).toContain('lineTo(-150,50)');
  });

  it('GV7: text keeps its letters (in the outline colour); a button its outline and label', () => {
    const text = {
      ...createText('Chip', { x: 0, y: 0 }),
      fill: { kind: 'linear' as const, from: '#ff0000', to: '#0000ff', angle: 0 },
      stroke: { colour: '#00ff00', width: 3, dash: 'solid' as const },
    };
    const button = createButton('pause', { x: 100, y: 100 });
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith(text, button), outline);
    expect(calls).toContain('fillText(Chip,-52.8,-28.8)');
    expect(calls).not.toContain('fillStyle=gradient');
    expect(calls).not.toContain('strokeStyle=#00ff00');
    expect(calls).toContain('fillText(Pause,0,0)');
    expect(calls.filter((c) => c === 'stroke()')).toHaveLength(1);
  });

  it('GV7: a skewed shape keeps lines of the width set', () => {
    const rect = { ...createRect({ x: 0, y: 0, width: 100, height: 50 }), skewX: 20 };
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith(rect), outline);
    const transforms = calls.filter((c) => c.startsWith('transform('));
    // Skewed, the skew taken off for the line, and put back.
    expect(transforms).toHaveLength(3);
  });

  it('GV7: masks do not hide anything in the outline view: every part can be checked', () => {
    let doc = stageWith(createRect({ x: 0, y: 0, width: 10, height: 10 }));
    const mask = { ...doc.layers[0]!, id: 'm', name: 'Mask', mask: true, locked: true };
    doc = { ...doc, layers: [...doc.layers, mask] };
    const { ctx, calls } = recorder();
    drawStage(ctx, doc, outline);
    expect(calls).not.toContain('clip()');
    expect(calls.filter((c) => c === 'stroke()')).toHaveLength(2);
  });

  it('GV7: exports never draw the outline view, even when asked', () => {
    const { ctx, calls } = recorder();
    drawStage(ctx, stageWith(createRect({ x: 0, y: 0 })), { wireframe: { lineWidth: 1 } });
    expect(calls).toContain('fill()');
    expect(calls[0]).toBe('fillStyle=#000000');
  });
});

describe('GV8: template layers', () => {
  it('GV8: a picture is fitted to the canvas without stretching, in the middle', () => {
    expect(fittedPicture(CHIP, { width: 600, height: 400 })).toMatchObject({
      x: 0,
      y: 100,
      width: 600,
      height: 200,
    });
    const tall = { ...CHIP, width: 100, height: 400 };
    expect(fittedPicture(tall, { width: 600, height: 400 })).toMatchObject({
      x: 250,
      y: 0,
      width: 100,
      height: 400,
    });
    expect(() => fittedPicture({ ...CHIP, width: 0 }, { width: 10, height: 10 })).toThrow(
      /no size/,
    );
  });

  it('GV8: Place template puts it on a locked template layer at the bottom', () => {
    const doc = stageWith(createRect({ x: 0, y: 0 }));
    const placed = placeTemplate(doc, CHIP);
    expect(placed.doc.layers).toHaveLength(2);
    expect(placed.doc.layers[0]).toMatchObject({
      name: 'Template',
      locked: true,
      template: true,
      objects: [{ kind: 'picture', pictureId: 'chip', width: 600, height: 200 }],
    });
    expect(placed.doc.pictures).toEqual([CHIP]);
    expect(hasTemplate(placed.doc)).toBe(true);
    expect(hasTemplate(doc)).toBe(false);
    // A second is named apart, and the picture is listed once.
    const again = placeTemplate(placed.doc, CHIP);
    expect(again.doc.layers[0]!.name).toBe('Template 2');
    expect(again.doc.pictures).toHaveLength(1);
  });

  it('GV8: the Template toggle makes any layer a locked template, and back', () => {
    const doc = stageWith(createRect({ x: 0, y: 0 }));
    const id = doc.layers[0]!.id;
    const masked = { ...doc, layers: [{ ...doc.layers[0]!, mask: true }] };
    const on = markTemplate(masked, id, true);
    expect(on.layers[0]).toMatchObject({ template: true, locked: true });
    expect(on.layers[0]!.mask).toBeUndefined();
    const off = markTemplate(on, id, false);
    expect(off.layers[0]!.template).toBeUndefined();
    expect(off.layers[0]!.locked).toBe(true);
    expect(() => markTemplate(doc, 'gone', true)).toThrow(/not there/);
  });

  it('GV8: drawn faintly on the stage while editing, and not at all in an export', () => {
    const { doc } = placeTemplate(stageWith(), CHIP);
    const editing = recorder();
    drawStage(editing.ctx, doc, { editing: true, image: () => ({}) });
    expect(editing.calls).toContain(`globalAlpha=${TEMPLATE_OPACITY}`);
    expect(editing.calls.some((c) => c.startsWith('drawImage'))).toBe(true);
    const exported = recorder();
    drawStage(exported.ctx, doc, { image: () => ({}) });
    expect(exported.calls.some((c) => c.startsWith('drawImage'))).toBe(false);
    // Hidden, it is not shown while editing either.
    const hidden = { ...doc, layers: doc.layers.map((l) => ({ ...l, visible: false })) };
    const off = recorder();
    drawStage(off.ctx, hidden, { editing: true, image: () => ({}) });
    expect(off.calls.some((c) => c.startsWith('drawImage'))).toBe(false);
  });

  it('GV8: shown as the picture (not outlined) in the outline view, to draw over', () => {
    const { doc } = placeTemplate(stageWith(), CHIP);
    const { ctx, calls } = recorder();
    drawStage(ctx, doc, { editing: true, wireframe: { lineWidth: 1 }, image: () => ({}) });
    expect(calls.some((c) => c.startsWith('drawImage'))).toBe(true);
  });

  it('GV8: an SVG has no bitmap from a template', () => {
    const { doc } = placeTemplate(stageWith(), CHIP);
    expect(stageSvg(doc, 0, { chip: 'data:image/png;base64,AA' })).not.toContain('<image');
  });

  it('GV8: the exports see the document without its template layers', () => {
    const doc = stageWith(createRect({ x: 0, y: 0 }));
    expect(withoutTemplates(doc)).toBe(doc);
    const placed = placeTemplate(doc, CHIP).doc;
    expect(withoutTemplates(placed).layers.map((l) => l.name)).toEqual(['Layer 1']);
  });
});
