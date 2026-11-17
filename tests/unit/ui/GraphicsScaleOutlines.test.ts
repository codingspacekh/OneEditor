// From the Graphics benchmark (2026-11-17): G3 "Scale outlines and effects" in Properties, beside
// Lock proportions, when a group (or more than one object) is selected — on by default; off, the
// group's outlines stay as typed when its size is typed (M/17: the 1 pt outlines of the sticker
// resized to 250 × 200); in Graphics and Animation mode.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import type { GroupObject } from '../../../src/core/animation/types.ts';
import { testApp } from '../../helpers/test-app.ts';

async function open(modeName: 'Graphics' | 'Animation') {
  animUi.dialog = null;
  animUi.lockRatio = false;
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: modeName,
    }),
  );
  const g = modeName === 'Graphics' ? t.app.graphics : t.app.animation;
  const objects = () => g.store.get().history.present.layers.flatMap((l) => l.objects);
  return {
    g,
    objects,
    props: () => within(screen.getByRole('complementary', { name: 'Properties' })),
  };
}

describe('G3: Scale outlines and effects in Properties', () => {
  for (const mode of ['Graphics', 'Animation'] as const)
    it(`${mode}: shown for a group, on by default; off keeps the outline when W is typed`, async () => {
      const s = await open(mode);
      s.g.addShape('rect', { x: 50, y: 50, width: 200, height: 100 });
      s.g.select([s.objects().at(-1)!.id]);
      expect(
        s.g.setProperties({ stroke: { colour: '#000000', width: 4, dash: 'solid' } }),
      ).toBeNull();
      // One shape: not shown (a shape resized on its own keeps its outline anyway).
      expect(s.props().queryByLabelText('Scale outlines and effects')).toBeNull();
      s.g.addShape('ellipse', { x: 300, y: 50, width: 100, height: 100 });
      s.g.select(s.objects().map((o) => o.id));
      s.g.group();
      const box = await s.props().findByLabelText('Scale outlines and effects');
      expect((box as HTMLInputElement).checked).toBe(true);
      expect(box.closest('label')!.getAttribute('title')).toMatch(/stay as typed/);
      await fireEvent.click(box);
      expect(s.g.store.get().history.present.view.scaleOutlines).toBe(false);
      const w = s.props().getByLabelText('W') as HTMLInputElement;
      await fireEvent.input(w, { target: { value: '175' } });
      await fireEvent.change(w, { target: { value: '175' } });
      await fireEvent.keyDown(w, { key: 'Enter' });
      const group = s.objects().at(-1) as GroupObject;
      expect(group.width).toBeCloseTo(175, 6);
      expect(group.children[0]!.stroke!.width).toBe(4);
    });
});
