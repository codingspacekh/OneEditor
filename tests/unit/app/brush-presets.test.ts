// M21 step 4 (GB4): saved custom brush presets — kept in the preferences, replaced by name,
// removed, and read back after a restart (a damaged entry left out).
import { describe, expect, it } from 'vitest';
import { createBrushPresetsApp } from '../../../src/app/brush-presets.ts';
import { createPreferences } from '../../../src/app/preferences.ts';
import { BUILT_IN_PRESETS } from '../../../src/core/graphics/pixels/presets.ts';
import type { AppPaths, ProjectFiles } from '../../../src/core/ports.ts';

function disk() {
  const files = new Map<string, string>();
  const io = {
    read: async (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw new Error('ENOENT');
      return v;
    },
    write: async (p: string, text: string) => void files.set(p, text),
  } as unknown as ProjectFiles;
  const paths = { preferences: '/prefs.json' } as AppPaths;
  return { files, open: () => createBrushPresetsApp(createPreferences(io, paths)) };
}

describe('M21 GB4: saved brush presets', () => {
  it('are saved, replaced by name, removed, and come back after a restart', async () => {
    const d = disk();
    const presets = d.open();
    await presets.load();
    expect(presets.store.get()).toEqual([]);
    const soft = BUILT_IN_PRESETS[0]!;
    await presets.save({ ...soft, name: ' Moon glow ' });
    await presets.save({ ...soft, name: 'Clouds' });
    await presets.save({ ...soft, name: 'Moon glow', brush: { ...soft.brush, size: 99 } });
    expect(presets.store.get().map((p) => [p.name, p.brush.size])).toEqual([
      ['Clouds', 30],
      ['Moon glow', 99],
    ]);
    await expect(presets.save({ ...soft, name: '  ' })).rejects.toThrow('Give the preset a name.');
    await presets.remove('Clouds');
    const again = d.open();
    await again.load();
    expect(again.store.get().map((p) => p.name)).toEqual(['Moon glow']);
    expect(JSON.parse(d.files.get('/prefs.json')!).brushPresets).toHaveLength(1);
  });
});
