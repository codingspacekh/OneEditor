// Property search in every property panel (the teacher's request, 2026-11-15): Video's
// Inspector (across its tabs), Audio's side panel, Animation's (and Graphics') Properties.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import Inspector from '../../../src/ui/Inspector.svelte';
import { testApp } from '../../helpers/test-app.ts';

const showing = (el: Element) => el.closest('[data-filtered]') === null;
const search = async (panel: HTMLElement, words: string) => {
  await fireEvent.input(within(panel).getByRole('searchbox', { name: 'Search properties' }), {
    target: { value: words },
  });
  await tick();
  await Promise.resolve();
};

describe('property search', () => {
  it('Animation: "opac" leaves Opacity; Escape clears; nothing found says so', async () => {
    const t = testApp();
    render(App, { props: { app: t.app } });
    await fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
        name: 'Animation',
      }),
    );
    t.app.animation.addShape('rect', { x: 0, y: 0, width: 100, height: 50 });
    await tick();
    const panel = screen.getByRole('complementary', { name: 'Properties' });
    await search(panel, 'opac');
    expect(showing(within(panel).getByLabelText('Opacity', { exact: true }))).toBe(true);
    expect(showing(within(panel).getByLabelText('Rotation', { exact: true }))).toBe(false);
    expect(showing(within(panel).getByRole('button', { name: 'Add effect' }))).toBe(false);
    await search(panel, 'zzz');
    expect(within(panel).getByText(/No setting matches “zzz”/)).toBeTruthy();
    await fireEvent.keyDown(within(panel).getByRole('searchbox'), { key: 'Escape' });
    await tick();
    expect((within(panel).getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(panel.querySelectorAll('[data-filtered]')).toHaveLength(0);
  });

  it('Video: a search looks in every tab of the Inspector, not only the open one', async () => {
    const t = testApp();
    await t.importFiles('/m/clip.mp4');
    t.app.addToTimeline(t.app.store.get().history.present.media[0]!.id);
    t.app.select(t.app.store.get().history.present.timeline.main[0]!.id);
    render(Inspector, { props: { app: t.app } });
    const panel = screen.getByRole('complementary', { name: 'Inspector' });
    // The Clip tab is open; "Remove sound" is on the Audio tab.
    expect(within(panel).queryByText('Remove sound')).toBeNull();
    await search(panel, 'remove sound');
    expect(showing(within(panel).getByText('Remove sound'))).toBe(true);
    expect(showing(within(panel).getByLabelText('Start point'))).toBe(false);
    await search(panel, '');
    expect(within(panel).queryByText('Remove sound')).toBeNull();
  });
});
