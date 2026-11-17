// GB4 (M21): the brush presets the student saves (a moon glow, a cloud brush), kept between
// sessions in preferences.json beside the layout and settings, for Graphics mode's painting
// tools. Read back safely: a damaged entry is left out.
import { parsePresets, type BrushPreset } from '../core/graphics/pixels/presets.ts';
import { EditError } from '../core/model/errors.ts';
import type { PreferencesStore } from './preferences.ts';
import { createStore, type Store } from './store.ts';

export function createBrushPresetsApp(preferences: PreferencesStore) {
  const store: Store<BrushPreset[]> = createStore<BrushPreset[]>([]);
  const keep = (presets: BrushPreset[]) => {
    store.set(presets);
    return preferences.update({ brushPresets: presets });
  };
  return {
    store,
    async load(): Promise<void> {
      store.set(parsePresets((await preferences.read()).brushPresets));
    },
    /** Saves a preset under its name (one of the same name is replaced). */
    async save(preset: BrushPreset): Promise<void> {
      const name = preset.name.trim();
      if (name === '') throw new EditError('Give the preset a name.');
      await keep([...store.get().filter((p) => p.name !== name), { ...preset, name }]);
    },
    async remove(name: string): Promise<void> {
      await keep(store.get().filter((p) => p.name !== name));
    },
  };
}

export type BrushPresetsApp = ReturnType<typeof createBrushPresetsApp>;
