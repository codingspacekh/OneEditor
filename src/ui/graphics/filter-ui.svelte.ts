// M22 (GB5): the filter the Filter menu opened its dialog on, and its settings while the dialog is
// open (UI state only): the dialog changes them as numbers are typed, the stage's handles
// (FilterHandles) draw them, and a click or drag on the image moves their centre, corners or
// mesh points.
import type { Point } from '../../core/animation/geometry.ts';
import type { FilterKind, FilterSpec } from '../../core/graphics/pixels/filter-specs.ts';

export const filterUi = $state({
  /** The filter the dialog shows. */
  kind: 'gaussian' as FilterKind,
  /** Its settings (image px) while the dialog is open; null when there is no pixel layer. */
  spec: null as FilterSpec | null,
});

/** The points a filter shows on the stage to drag: its centre, its corners or its mesh. */
export function handlesOf(spec: FilterSpec | null): readonly Point[] {
  if (!spec) return [];
  if ('centre' in spec) return [spec.centre];
  if (spec.kind === 'perspective') return spec.corners;
  if (spec.kind === 'warp') return spec.points;
  return [];
}

/** The settings with handle `i` moved to `p`. */
export function withHandle(spec: FilterSpec, i: number, p: Point): FilterSpec {
  const at = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  if ('centre' in spec) return { ...spec, centre: at };
  if (spec.kind === 'perspective')
    return { ...spec, corners: spec.corners.map((c, k) => (k === i ? at : c)) };
  if (spec.kind === 'warp')
    return { ...spec, points: spec.points.map((c, k) => (k === i ? at : c)) };
  return spec;
}
