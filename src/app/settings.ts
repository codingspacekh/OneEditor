// Settings… (the teacher's request, 2026-11-15): choices a person makes once for the whole app,
// kept between sessions in preferences.json (beside the layout and the Welcome).
import type { PreferencesStore } from './preferences.ts';
import { createStore, type Store } from './store.ts';

export interface Settings {
  /** The "Why use this?" links under the tools and settings (N17). */
  showWhy: boolean;
}

export const DEFAULT_SETTINGS: Settings = { showWhy: true };

/** Saved settings read safely: anything missing or not understood is the default. */
export function parseSettings(value: unknown): Settings {
  const v = typeof value === 'object' && value !== null ? (value as Partial<Settings>) : {};
  return { showWhy: typeof v.showWhy === 'boolean' ? v.showWhy : DEFAULT_SETTINGS.showWhy };
}

/** The settings as the app keeps them: a store, loaded from and saved to the preferences. */
export function createSettingsApp(preferences: PreferencesStore) {
  const store: Store<Settings> = createStore<Settings>(DEFAULT_SETTINGS);
  return {
    store,
    async load(): Promise<void> {
      store.set(parseSettings((await preferences.read()).settings));
    },
    set(change: Partial<Settings>): Promise<void> {
      const settings = { ...store.get(), ...change };
      store.set(settings);
      return preferences.update({ settings });
    },
  };
}

export type SettingsApp = ReturnType<typeof createSettingsApp>;
