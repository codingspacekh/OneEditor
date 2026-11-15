// GV4, G3 (M19): where the stage's envelope handles go (with the object's turn), what a drag of
// one makes, and the document shown while dragging.
import { describe, expect, it } from 'vitest';
import {
  createAnimation,
  createLayer,
  createRect,
  createText,
} from '../../../src/core/animation/factory.ts';
import type { AnimObject, Envelope } from '../../../src/core/animation/types.ts';
import { BOX_CORNERS, sidesFromCorners } from '../../../src/core/graphics/envelope.ts';
import {
  draggedTo,
  fractionAt,
  gripsOf,
  previewEnvelope,
  shapedOnStage,
  sidesPath,
} from '../../../src/ui/animation/envelope-handles.ts';

const persp: Envelope = { kind: 'perspective', corners: [...BOX_CORNERS] as never };
const custom: Envelope = { kind: 'custom', sides: sidesFromCorners(BOX_CORNERS) };
const box = (envelope: Envelope): AnimObject & { envelope: Envelope } => ({
  ...createRect({ x: 100, y: 100, width: 200, height: 100 }),
  envelope,
});

describe('GV4 the envelope handles on the stage', () => {
  it('are shown for perspective and custom envelopes on shapes, not presets or text', () => {
    expect(shapedOnStage(box(persp))).toBe(true);
    expect(shapedOnStage(box(custom))).toBe(true);
    expect(shapedOnStage(box({ kind: 'preset', preset: 'arch', bend: 20 }))).toBe(false);
    expect(shapedOnStage({ ...createText('Hi', { x: 0, y: 0 }), envelope: persp })).toBe(false);
    expect(shapedOnStage(null)).toBe(false);
  });

  it('sit on the corners (turned with the object) and, for custom, on the sides’ handles', () => {
    const grips = gripsOf({ ...box(persp), rotation: 90 });
    expect(grips).toHaveLength(4);
    // Turned a quarter about its centre (200, 150): the top left corner goes to the top right.
    expect(grips[0]!.at.x).toBeCloseTo(250);
    expect(grips[0]!.at.y).toBeCloseTo(50);
    const all = gripsOf(box(custom));
    expect(all).toHaveLength(12);
    expect(all[4]).toMatchObject({
      label: 'Envelope handle, top side, first',
      from: { x: 100, y: 100 },
    });
    expect(all[4]!.at.x).toBeCloseTo(166.67, 1);
    expect(sidesPath(box(custom))).toBe(
      'M 100 100 C 166.67 100 233.33 100 300 100 C 300 133.33 300 166.67 300 200 C 233.33 200 166.67 200 100 200 C 100 166.67 100 133.33 100 100 Z',
    );
  });

  it('a drag gives fractions of the box (none for a box 0 wide), and the envelope it makes', () => {
    expect(fractionAt(box(persp), { x: 160, y: 100 })).toEqual({ x: 0.3, y: 0 });
    expect(fractionAt({ ...box(persp), width: 0 }, { x: 0, y: 0 })).toBeNull();
    const moved = draggedTo(persp, { kind: 'corner', index: 0 }, { x: 0.3, y: 0 });
    expect(moved).toMatchObject({ kind: 'perspective' });
    const bent = draggedTo(custom, { kind: 'control', side: 'left', which: 'c2' }, { x: -1, y: 1 });
    expect(bent.kind === 'custom' && bent.sides.left.c2).toEqual({ x: -1, y: 1 });
  });

  it('shows the dragged envelope on the object, or the document as it is', () => {
    const o = box(persp);
    const doc = { ...createAnimation({ name: 'A' }), layers: [createLayer('L', { objects: [o] })] };
    expect(previewEnvelope(doc, null)).toBe(doc);
    const shown = previewEnvelope(doc, { id: o.id, envelope: custom });
    expect(shown.layers[0]!.objects[0]!.envelope).toBe(custom);
    expect(previewEnvelope(doc, { id: 'gone', envelope: custom })).toBe(doc);
  });
});
