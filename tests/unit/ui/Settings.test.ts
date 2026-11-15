// Settings… (the teacher's request, 2026-11-15): "Why use this?" can be hidden — the links under
// the tools and the Why? part of the tooltips — and shown again; the choice is kept.
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { menuActions } from '../../../src/ui/menu-actions.ts';
import { ui } from '../../../src/ui/ui-state.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';

afterEach(() => {
  ui.settings = false;
});

describe('Settings… (Why use this?)', () => {
  it('turning "Why use this?" off hides every link; on brings them back; the choice is saved', async () => {
    const t = testApp();
    render(App, { props: { app: t.app } });
    await fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
        name: 'Animation',
      }),
    );
    const links = () => screen.queryAllByRole('button', { name: /^Why use/ });
    expect(links().length).toBeGreaterThan(0);

    menuActions(t.app).settings();
    await tick();
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const box = within(dialog).getByRole('checkbox', { name: /Why use this\?/ });
    expect((box as HTMLInputElement).checked).toBe(true);
    await fireEvent.click(box);
    expect(t.app.settings.store.get().showWhy).toBe(false);
    expect(links()).toEqual([]);
    // The layers' box of links goes too, not only the links in it.
    expect(document.querySelector('.layers .why')).toBeNull();

    await fireEvent.click(box);
    expect(links().length).toBeGreaterThan(0);
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });
});
