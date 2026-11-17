// The tool strip's tools in the ui tests (2026-11-17): a tool is either on the strip (its family's
// button shows it) or behind its family's corner, in the family's flyout (tool-families.ts). These
// reach it either way, as a student does.
import { fireEvent, screen, within } from '@testing-library/svelte';
import { familyButtonName, familyOf, VIEW_BUTTON } from '../../src/ui/animation/tool-families.ts';

const strip = () => within(screen.getByRole('toolbar', { name: /^(Drawing|Animation) tools$/ }));

/** The element that chooses a tool: its strip button, or (its flyout opened) its menu item. */
export async function toolControl(name: string): Promise<HTMLElement> {
  const direct = strip().queryByRole('button', { name });
  if (direct) return direct;
  const family = familyOf(name);
  if (!family) throw new Error(`No tool named ${name}`);
  const open = screen.queryByRole('menu', { name: family.label });
  if (!open) await fireEvent.click(strip().getByRole('button', { name: familyButtonName(family) }));
  return within(screen.getByRole('menu', { name: family.label })).getByRole('menuitemradio', {
    name,
  });
}

/** Chooses a tool (from the strip, or from its family's flyout). */
export async function pickTool(name: string): Promise<void> {
  await fireEvent.click(await toolControl(name));
}

/** A view helper's switch (Rulers, Grid, Snap, Outline view, Pixel grid), its flyout opened. */
export async function viewHelper(name: string): Promise<HTMLElement> {
  if (!screen.queryByRole('menu', { name: 'View options' }))
    await fireEvent.click(screen.getByRole('button', { name: VIEW_BUTTON }));
  return within(screen.getByRole('menu', { name: 'View options' })).getByRole('menuitemcheckbox', {
    name,
  });
}
