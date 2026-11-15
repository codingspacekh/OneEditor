// AN7: the Layers panel's folders — the Folder button groups the selected layer, a folder is
// renamed by double-clicking it, and layers are dragged into a folder, next to another layer or
// out of their folder. The layer's name keeps its room when the folder box shows.
import { describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import App from '../../../src/ui/App.svelte';
import { testApp } from '../../helpers/test-app.ts';

async function animationMode() {
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Animation',
    }),
  );
  const anim = t.app.animation;
  return {
    anim,
    doc: () => anim.store.get().history.present,
    panel: () => screen.getByRole('complementary', { name: 'Layers' }),
  };
}

const layerOf = (s: Awaited<ReturnType<typeof animationMode>>, name: string) =>
  s.doc().layers.find((l) => l.name === name)!;

describe('layer folders (AN7)', () => {
  it('Folder puts the selected layer in a new folder, shown under it; the name keeps its room', async () => {
    const s = await animationMode();
    await fireEvent.click(within(s.panel()).getByRole('button', { name: 'Folder' }));
    const [folder] = s.doc().folders;
    expect(folder!.name).toBe('Folder');
    expect(layerOf(s, 'Layer 1').folderId).toBe(folder!.id);
    const row = within(s.panel()).getByRole('option', { name: 'Layer 1' });
    expect(row.classList.contains('infolder')).toBe(true);
    expect(within(row).getByText('Layer 1').classList.contains('name')).toBe(true);
    // The folder box is hidden until asked for, then has a line of its own under the name.
    expect(within(s.panel()).queryByLabelText('Folder of Layer 1')).toBeNull();
    await fireEvent.click(within(row).getByRole('button', { name: 'Move Layer 1 to a folder' }));
    const pick = within(s.panel()).getByLabelText('Folder of Layer 1') as HTMLSelectElement;
    expect(pick.value).toBe(folder!.id);
    expect(pick.closest('.in-folder')).not.toBeNull();
    // Choosing closes it again; so do Escape and leaving it.
    await fireEvent.change(pick, { target: { value: '' } });
    expect(layerOf(s, 'Layer 1').folderId).toBeUndefined();
    expect(within(s.panel()).queryByLabelText('Folder of Layer 1')).toBeNull();
    await fireEvent.click(within(row).getByRole('button', { name: 'Move Layer 1 to a folder' }));
    await fireEvent.keyDown(within(s.panel()).getByLabelText('Folder of Layer 1'), {
      key: 'Escape',
    });
    expect(within(s.panel()).queryByLabelText('Folder of Layer 1')).toBeNull();
    await fireEvent.click(within(row).getByRole('button', { name: 'Move Layer 1 to a folder' }));
    await fireEvent.blur(within(s.panel()).getByLabelText('Folder of Layer 1'));
    expect(within(s.panel()).queryByLabelText('Folder of Layer 1')).toBeNull();
    await fireEvent.click(within(row).getByRole('button', { name: 'Move Layer 1 to a folder' }));
    await fireEvent.change(within(s.panel()).getByLabelText('Folder of Layer 1'), {
      target: { value: folder!.id },
    });
    // Each move was one undo step; one more takes the folder away and lets the layer out.
    s.anim.undo();
    s.anim.undo();
    expect(layerOf(s, 'Layer 1').folderId).toBe(folder!.id);
    s.anim.undo();
    expect(s.doc().folders).toEqual([]);
    expect(layerOf(s, 'Layer 1').folderId).toBeUndefined();
  });

  it('a folder is renamed by double-clicking its name', async () => {
    const s = await animationMode();
    await fireEvent.click(within(s.panel()).getByRole('button', { name: 'Folder' }));
    await fireEvent.dblClick(within(s.panel()).getByText('Folder', { selector: '.name' }));
    const box = within(s.panel()).getByLabelText('Folder name') as HTMLInputElement;
    await fireEvent.change(box, { target: { value: 'stick_person' } });
    expect(s.doc().folders[0]!.name).toBe('stick_person');
    expect(within(s.panel()).queryByLabelText('Folder name')).toBeNull();
    await fireEvent.dblClick(within(s.panel()).getByText('stick_person', { selector: '.name' }));
    const again = within(s.panel()).getByLabelText('Folder name');
    await fireEvent.change(again, { target: { value: ' ' } });
    expect(within(s.panel()).getByRole('alert').textContent).toMatch(/name/);
    await fireEvent.keyDown(again, { key: 'Escape' });
    expect(within(s.panel()).queryByLabelText('Folder name')).toBeNull();
  });

  it('a layer dragged onto a folder goes in it; onto empty space, out of it; onto a layer, next to it', async () => {
    const s = await animationMode();
    s.anim.addLayer(); // Layer 2, selected
    s.anim.selectLayer(layerOf(s, 'Layer 1').id);
    await fireEvent.click(within(s.panel()).getByRole('button', { name: 'Folder' }));
    const folder = s.doc().folders[0]!;
    const row = (name: string) => within(s.panel()).getByRole('option', { name });
    const folderRow = within(s.panel()).getByText('Folder', { selector: '.name' }).closest('li')!;

    expect(row('Layer 2').getAttribute('draggable')).toBe('true');
    await fireEvent.dragStart(row('Layer 2'));
    await fireEvent.dragOver(folderRow);
    expect(folderRow.classList.contains('drop')).toBe(true);
    await fireEvent.drop(folderRow);
    expect(layerOf(s, 'Layer 2').folderId).toBe(folder.id);
    expect(folderRow.classList.contains('drop')).toBe(false);

    await fireEvent.dragStart(row('Layer 2'));
    await fireEvent.drop(within(s.panel()).getByRole('listbox', { name: 'Layer list' }));
    expect(layerOf(s, 'Layer 2').folderId).toBeUndefined();

    // Dropped on Layer 1 (in the folder): just in front of it, in its folder.
    s.anim.selectLayer(layerOf(s, 'Layer 2').id);
    s.anim.addLayer(); // Layer 3, in front, loose
    await tick();
    await fireEvent.dragStart(row('Layer 3'));
    await fireEvent.drop(row('Layer 1'));
    expect(s.doc().layers.map((l) => l.name)).toEqual(['Layer 1', 'Layer 3', 'Layer 2']);
    expect(layerOf(s, 'Layer 3').folderId).toBe(folder.id);
    // Each drop is one undo step.
    s.anim.undo();
    expect(s.doc().layers.map((l) => l.name)).toEqual(['Layer 1', 'Layer 2', 'Layer 3']);
  });
});
