// GT4, GT5 (M20) on screen: Convert to curves on a selected text (its letters' shapes, grouped)
// and the Envelope section for text (an arch on the words, still text), with their "Why use
// this?" texts; the fake font's outlines stand in for the bundled fonts'.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import type { AnimObject, GroupObject } from '../../../src/core/animation/types.ts';
import { WHY } from '../../../src/core/effects/help.ts';
import { setGlyphSource } from '../../../src/core/graphics/glyphs.ts';
import { fakeGlyphSource, fakeWidths } from '../../helpers/fake-glyphs.ts';
import { testApp } from '../../helpers/test-app.ts';
import { whyTexts } from '../../helpers/why.ts';

async function open(modeName: 'Graphics' | 'Animation' = 'Graphics') {
  animUi.dialog = null;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: modeName,
    }),
  );
  const g = modeName === 'Graphics' ? t.app.graphics : t.app.animation;
  const objects = (): AnimObject[] =>
    g.store.get().history.present.layers.flatMap((l) => l.objects);
  g.addText({ x: 40, y: 60 }, 'TV');
  await tick();
  return {
    ...t,
    g,
    last: () => objects().at(-1)!,
    props: () => within(screen.getByRole('complementary', { name: 'Properties' })),
  };
}

const read = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => setGlyphSource(fakeGlyphSource(), (t, s) => fakeWidths(t.size)(s)));
afterEach(() => setGlyphSource(null));

describe('GT4: Convert to curves on text', () => {
  it('makes the selected text its letters, grouped; says why to use it', async () => {
    const s = await open();
    const convert = s.props().getByRole('button', { name: 'Convert to curves' });
    expect(convert.title).toMatch(/a path for each letter, grouped/);
    expect(convert.title).toContain(WHY.textCurves.slice(0, 60));
    await fireEvent.click(convert);
    await read();
    await tick();
    expect(s.last()).toMatchObject({ kind: 'group', name: 'TV' });
    expect((s.last() as GroupObject).children.map((c) => c.kind)).toEqual(['path', 'path']);
  });
});

describe('GT5: an envelope on text', () => {
  it('Animation too: the words arched, still text; the section says why warp text', async () => {
    const s = await open('Animation');
    await fireEvent.change(s.props().getByLabelText('Bend into'), { target: { value: 'arch' } });
    expect(s.last()).toMatchObject({ kind: 'text', envelope: { kind: 'preset', preset: 'arch' } });
    expect(whyTexts(document.body)).toContain(WHY.textWarp.slice(0, 60));
    await fireEvent.click(s.props().getByRole('button', { name: 'Apply' }));
    await read();
    await tick();
    expect(s.last().kind).toBe('group');
  });
});
