// Pilot feedback 2026-11-18: an object is renamed from the Layers panel (AN6, AN7), and a
// keyframe made by mistake is removed at the playhead, every property's at once (AN9: as
// Animate's Clear Keyframe, Shift + F6).
import { describe, expect, it } from 'vitest';
import { createAnimation, createRect } from '../../../../src/core/animation/factory.ts';
import { addObject, findObject, renameObject } from '../../../../src/core/animation/layers.ts';
import {
  insertKeyframe,
  removeKeyframesAt,
  setPropertyAt,
  trackOf,
} from '../../../../src/core/animation/tween.ts';

describe('renaming an object', () => {
  const withRect = () => {
    const doc = createAnimation({ name: 'Test' });
    return addObject(doc, doc.layers[0]!.id, createRect({ x: 0, y: 0 }));
  };

  it('takes the typed name, trimmed', () => {
    const doc = withRect();
    const id = doc.layers[0]!.objects[0]!.id;
    expect(findObject(renameObject(doc, id, '  Sun  '), id)?.object.name).toBe('Sun');
  });

  it('refuses an empty name, and on a locked layer', () => {
    const doc = withRect();
    const id = doc.layers[0]!.objects[0]!.id;
    expect(() => renameObject(doc, id, '   ')).toThrow(/name/i);
    const locked = { ...doc, layers: [{ ...doc.layers[0]!, locked: true }] };
    expect(() => renameObject(locked, id, 'Sun')).toThrow(/locked/i);
  });
});

describe('removing the keyframes at a frame (AN9)', () => {
  it('every property’s keyframe on that frame goes; the others stay', () => {
    let rect = createRect({ x: 0, y: 0 });
    rect = setPropertyAt(rect, 'x', 72, 396);
    rect = setPropertyAt(rect, 'opacity', 72, 50);
    rect = setPropertyAt(rect, 'x', 30, 100);
    const after = removeKeyframesAt(rect, 72);
    expect(trackOf(after, 'x')!.keyframes.map((k) => k.frame)).toEqual([0, 30]);
    expect(trackOf(after, 'opacity')!.keyframes.map((k) => k.frame)).toEqual([0]);
  });

  it('a track left with no keyframes goes (Keyframe pressed by mistake on a still object)', () => {
    const rect = insertKeyframe(createRect({ x: 0, y: 0 }), 'x', 40);
    expect(trackOf(rect, 'x')!.keyframes.map((k) => k.frame)).toEqual([40]);
    const after = removeKeyframesAt(rect, 40);
    expect(after.tracks).toBeUndefined();
    expect(after.x).toBe(0);
  });

  it('says so when there is no keyframe on that frame', () => {
    const rect = setPropertyAt(createRect({ x: 0, y: 0 }), 'x', 72, 396);
    expect(() => removeKeyframesAt(rect, 10)).toThrow(/no keyframe on frame 10/i);
  });
});
