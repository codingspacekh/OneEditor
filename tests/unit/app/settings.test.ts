// The teacher's request (2026-11-15): Settings… can hide the "Why use this?" links. Settings are
// kept in preferences.json beside the layout and the Welcome, and come back after a restart.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../../../src/app/settings.ts';
import { testApp } from '../../helpers/test-app.ts';

const PREFS = '/prefs/preferences.json';

describe('settings', () => {
  it('"Why use this?" shows unless it was turned off; bad values read as the default', () => {
    expect(DEFAULT_SETTINGS).toEqual({ showWhy: true });
    expect(parseSettings(undefined)).toEqual({ showWhy: true });
    expect(parseSettings({ showWhy: false })).toEqual({ showWhy: false });
    expect(parseSettings({ showWhy: 'no' })).toEqual({ showWhy: true });
    expect(parseSettings('x')).toEqual({ showWhy: true });
  });

  it('a change is saved beside the other preferences and comes back after a restart', async () => {
    const t = testApp({}, { preferences: PREFS });
    t.disk.set(PREFS, JSON.stringify({ welcomeSeen: true }));
    await t.app.start();
    expect(t.app.settings.store.get().showWhy).toBe(true);
    await t.app.settings.set({ showWhy: false });
    expect(t.app.settings.store.get().showWhy).toBe(false);
    expect(JSON.parse(t.disk.get(PREFS)!)).toEqual({
      welcomeSeen: true,
      settings: { showWhy: false },
    });
    const again = testApp({}, { preferences: PREFS });
    again.disk.set(PREFS, t.disk.get(PREFS)!);
    await again.app.start();
    expect(again.app.settings.store.get().showWhy).toBe(false);
  });
});
