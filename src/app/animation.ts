// Animation mode's use cases (M13–M16b, AN1–AN20): its own document, history, file and selection.
// The UI only calls these and shows the store; errors become a message (or a reason a field
// shows). Each area is a module in ./animation/ sharing one context (the store, running commands
// as undo steps, the player); this file puts them together. A new feature is a new module, or
// one more action in the module of its area.
import { appearanceActions } from './animation/appearance.ts';
import { createAnimationContext } from './animation/context.ts';
import { documentActions } from './animation/document.ts';
import { drawingActions } from './animation/drawing.ts';
import { envelopeActions } from './animation/envelope.ts';
import { exportActions } from './animation/exporting.ts';
import { fileActions } from './animation/files.ts';
import { graphicActions } from './animation/graphic.ts';
import { nodeActions } from './animation/nodes.ts';
import { pictureActions } from './animation/pictures.ts';
import { pixelImageActions } from './animation/pixel-image.ts';
import { pixelOpActions } from './animation/pixel-ops.ts';
import { pixelLayerActions } from './animation/pixel-layers.ts';
import { pixelSelectionActions } from './animation/pixel-selection.ts';
import { pixelTransformActions } from './animation/pixel-transform.ts';
import { paintingActions } from './animation/painting.ts';
import { shapeActions } from './animation/shapes.ts';
import { soundActions } from './animation/sounds.ts';
import type { AnimationDeps } from './animation/state.ts';
import { svgActions } from './animation/svg-files.ts';
import { templateActions } from './animation/templates.ts';
import { textPathActions } from './animation/text-paths.ts';
import { timelineActions } from './animation/timeline.ts';

export {
  animationTitle,
  isAnimationDirty,
  type AnimationDeps,
  type AnimationExporting,
  type AnimationState,
  type Loop,
  type ShapeKind,
  type Tool,
} from './animation/state.ts';
export { TRACE_MAX_SIDE, TRACE_PREVIEW_SIDE } from './animation/pictures.ts';
export { ANIMATION_KIND, GRAPHIC_KIND, type EditorKind } from './animation/kind.ts';
export type { PixelMove, PixelTransformChange } from './animation/pixel-transform.ts';

export function createAnimationApp(deps: AnimationDeps) {
  const ctx = createAnimationContext(deps);
  const { stopAutosave, ...files } = fileActions(ctx);
  return {
    store: ctx.store,
    ...files,
    ...exportActions(ctx),
    ...pictureActions(ctx),
    ...soundActions(ctx),
    ...drawingActions(ctx),
    ...shapeActions(ctx),
    ...envelopeActions(ctx),
    ...nodeActions(ctx),
    ...timelineActions(ctx),
    ...documentActions(ctx),
    ...graphicActions(ctx, files.startWith),
    // G2, GB1 (M21): pixel layers, opacity, blend, clipping, layer masks, merging.
    ...pixelLayerActions(ctx, files.startWith),
    ...templateActions(ctx),
    ...svgActions(ctx),
    ...textPathActions(ctx),
    ...appearanceActions(ctx),
    // GB6, G8 (M21): Image size, Canvas size, trim and Reduce colours.
    ...pixelImageActions(ctx),
    // GB2, G8, G13 (M21): the pixel selection and the cut-outs made with it.
    ...pixelSelectionActions(ctx),
    // GB4, GB3 (M21): the brushes, the paint bucket and the gradient.
    ...paintingActions(ctx),
    // GB3, GB5 (M22): every adjustment and filter, applied and previewed the same way.
    ...pixelOpActions(ctx),
    // G3 (M21): a pixel layer, or the selected pixels, moved, scaled, turned, flipped, skewed.
    ...pixelTransformActions(ctx),
    /** M18: an animation's app, or Graphics mode's. */
    kind: ctx.kind,
    dispose(): void {
      ctx.pause();
      stopAutosave();
    },
  };
}

export type AnimationApp = ReturnType<typeof createAnimationApp>;
