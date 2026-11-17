// 2026-11-17 (issues/graphics-*.png, "instead of scroll, group and classify the tools"): the tool
// strip in families, as Photoshop's — one button a family showing the tool of it last used; its
// corner, a right-click or a held press opens the family's flyout (the tools by name and key);
// a tool chosen by its key shows on its family's button; the view helpers in one flyout. In
// Graphics and in Animation.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';
import { pickTool, viewHelper } from '../../helpers/tools.ts';

async function open(mode: 'Graphics' | 'Animation') {
  animUi.dialog = null;
  animUi.toolFamily = {};
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', { name: mode }),
  );
  const editor = mode === 'Graphics' ? t.app.graphics : t.app.animation;
  const name = mode === 'Graphics' ? 'Drawing tools' : 'Animation tools';
  const strip = () => within(screen.getByRole('toolbar', { name }));
  const tool = () => editor.store.get().tool;
  return { ...t, editor, strip, tool };
}

const key = (k: string) => fireEvent.keyDown(window, { key: k });

describe('the tool strip in families', () => {
  it('Graphics: one button a family (not 35 tools), separated into drawing, selecting, painting, retouching and moving round', async () => {
    const s = await open('Graphics');
    const shown = s.strip().getAllByRole('button', { pressed: undefined });
    const tools = shown.filter((b) => b.classList.contains('tbtn')).map((b) => b.ariaLabel);
    expect(tools).toEqual([
      'Select',
      'Rectangle',
      'Pen',
      'Text',
      'Picture',
      'Rectangle select',
      'Lasso',
      'Magic wand',
      'Paintbrush',
      'Eraser',
      'Paint bucket',
      'Clone stamp',
      'Blur brush',
      'Hand',
    ]);
    // A family of one has no corner; the others do.
    expect(s.strip().queryByRole('button', { name: 'Select tools' })).toBeNull();
    expect(s.strip().getByRole('button', { name: 'Shapes tools' })).toBeTruthy();
    // Animation's button is not a Graphics tool.
    expect(screen.queryByRole('button', { name: 'Button' })).toBeNull();
  });

  it('the corner opens the family by name and key; a tool picked is chosen, shown and the flyout closes', async () => {
    const s = await open('Graphics');
    await fireEvent.click(s.strip().getByRole('button', { name: 'Shapes tools' }));
    const menu = screen.getByRole('menu', { name: 'Shapes' });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      'Rectangle R',
      'Ellipse E',
      'Star S',
      'Polygon G',
      'Arc C',
      'Spiral O',
    ]);
    expect(items[0]!.getAttribute('title')).toMatch(/Why\? /);
    await fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Ellipse' }));
    expect(s.tool()).toBe('ellipse');
    expect(screen.queryByRole('menu')).toBeNull();
    const button = s.strip().getByRole('button', { name: 'Ellipse' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(s.strip().queryByRole('button', { name: 'Rectangle' })).toBeNull();
  });

  it('remembers each family’s tool: back to Select, the family button chooses the ellipse again', async () => {
    const s = await open('Graphics');
    await pickTool('Ellipse');
    await pickTool('Select');
    expect(s.tool()).toBe('select');
    await fireEvent.click(s.strip().getByRole('button', { name: 'Ellipse' }));
    expect(s.tool()).toBe('ellipse');
  });

  it('a key chooses a tool behind its family and shows it there (S: the star, W: the wand)', async () => {
    const s = await open('Graphics');
    await key('s');
    expect(s.tool()).toBe('star');
    expect(s.strip().getByRole('button', { name: 'Star' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await key('o');
    expect(s.strip().getByRole('button', { name: 'Spiral' })).toBeTruthy();
  });

  it('a right-click or a held press opens the flyout; arrows move in it, Escape closes it', async () => {
    const s = await open('Graphics');
    const lasso = s.strip().getByRole('button', { name: 'Lasso' });
    await fireEvent.contextMenu(lasso);
    const menu = screen.getByRole('menu', { name: 'Lasso' });
    expect(document.activeElement?.textContent).toMatch(/^\s*Lasso/);
    await fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toMatch(/Polygonal lasso/);
    await fireEvent.keyDown(menu, { key: 'ArrowUp' });
    await fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toMatch(/Magnetic lasso/);
    await fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(s.tool()).toBe('select');
    // Held: the flyout opens and the press chooses nothing by itself.
    const paint = s.strip().getByRole('button', { name: 'Paintbrush' });
    await fireEvent.pointerDown(paint, { button: 0 });
    await new Promise((r) => setTimeout(r, 380));
    expect(screen.getByRole('menu', { name: 'Brushes' })).toBeTruthy();
    await fireEvent.pointerUp(paint);
    await fireEvent.click(paint);
    expect(s.tool()).toBe('select');
    // A press elsewhere closes it.
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('the view helpers are one View options flyout: each a tick, switched in place', async () => {
    const s = await open('Graphics');
    expect(s.strip().queryByRole('button', { name: 'Rulers' })).toBeNull();
    const rulers = await viewHelper('Rulers');
    const was = s.editor.store.get().history.present.view.rulers;
    expect(rulers.getAttribute('aria-checked')).toBe(String(was));
    await fireEvent.click(rulers);
    expect(s.editor.store.get().history.present.view.rulers).toBe(!was);
    const names = within(screen.getByRole('menu', { name: 'View options' }))
      .getAllByRole('menuitemcheckbox')
      .map((i) => i.textContent!.replace(/[✓\s]+$/, '').trim());
    expect(names).toEqual(['Rulers', 'Grid', 'Snap', 'Outline view', 'Pixel grid']);
  });

  it('Animation: the same families for its tools (shapes, pen and lines), with its button; no Graphics tools', async () => {
    const s = await open('Animation');
    const tools = s
      .strip()
      .getAllByRole('button')
      .filter((b) => b.classList.contains('tbtn'))
      .map((b) => b.ariaLabel);
    expect(tools).toEqual(['Select', 'Rectangle', 'Pen', 'Text', 'Picture', 'Button']);
    await pickTool('Star');
    expect(s.tool()).toBe('star');
    await fireEvent.click(await viewHelper('Grid'));
    expect(s.editor.store.get().history.present.view.grid.show).toBe(true);
    const names = within(screen.getByRole('menu', { name: 'View options' }))
      .getAllByRole('menuitemcheckbox')
      .map((i) => i.textContent!.replace(/[✓\s]+$/, '').trim());
    expect(names).toEqual(['Rulers', 'Grid', 'Snap', 'Outline view']);
  });
});
