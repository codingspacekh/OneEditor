// M22 (GB3): which adjustment Image ▸ Adjustments ▸ opened its dialog on (UI state only).
import type { AdjustmentKind } from '../../core/graphics/pixels/adjust.ts';

export const adjustUi = $state({
  /** The adjustment the dialog shows first. */
  kind: 'brightnessContrast' as AdjustmentKind,
});
