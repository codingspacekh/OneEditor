// M21 step 4 (GB4): the painting tools' defaults and the brush presets — the built-in ones the
// papers need (the night scene's stars and lights: scatter) and saved ones read back safely.
import { describe, expect, it } from 'vitest';
import { checkBrush } from '../../../../../src/core/graphics/pixels/brush.ts';
import {
  BUILT_IN_PRESETS,
  DEFAULT_PAINT,
  isBrushTool,
  parsePresets,
} from '../../../../../src/core/graphics/pixels/presets.ts';

describe('M21 GB4: brush presets', () => {
  it('the built-in presets are each a valid brush for their tool', () => {
    expect(BUILT_IN_PRESETS.map((p) => p.name)).toEqual([
      'Soft round',
      'Hard round',
      'Pencil 1 px',
      'Airbrush',
      'Square',
      'Star',
      'Scatter: stars and lights',
      'Soft eraser',
    ]);
    for (const p of BUILT_IN_PRESETS) expect(() => checkBrush(p.brush)).not.toThrow();
    expect(BUILT_IN_PRESETS.find((p) => p.name === 'Pencil 1 px')).toMatchObject({
      tool: 'pencil',
      brush: { size: 1 },
    });
    for (const b of Object.values(DEFAULT_PAINT.brushes)) expect(() => checkBrush(b)).not.toThrow();
  });

  it('knows the brush tools', () => {
    expect(isBrushTool('airbrush')).toBe(true);
    expect(isBrushTool('bucket')).toBe(false);
  });

  it('reads saved presets back, leaving out any it does not understand', () => {
    const good = { name: ' Moon glow ', tool: 'airbrush', brush: { size: 120, flow: 5 } };
    expect(parsePresets([good])).toEqual([
      {
        name: 'Moon glow',
        tool: 'airbrush',
        brush: { ...DEFAULT_PAINT.brushes.airbrush, size: 120, flow: 5 },
      },
    ]);
    expect(
      parsePresets([
        null,
        'x',
        { ...good, name: '' },
        { ...good, tool: 'bucket' },
        { ...good, brush: null },
        { ...good, brush: { shape: 'blob' } },
        { ...good, brush: { size: 0 } },
        { ...good, brush: { size: '20' } },
      ]),
    ).toEqual([]);
    expect(parsePresets({})).toEqual([]);
    expect(parsePresets([{ ...good, brush: { pressureSize: 'yes' } }])[0]!.brush.pressureSize).toBe(
      false,
    );
  });
});
