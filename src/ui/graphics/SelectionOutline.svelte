<script lang="ts">
  // M21 step 3 (GB2): the pixel selection's outline over the image as moving dashes ("marching
  // ants"), black on white so it shows on any picture, one screen pixel wide at any zoom; and the
  // outline of a marquee or lasso while it is drawn. The outline is traced from the selection
  // (core/graphics/pixels/outline.ts) only when the selection changes.
  import type { AnimationApp } from '../../app/animation.ts';
  import { maskOutline } from '../../core/graphics/pixels/outline.ts';
  import { selUi } from './selection-ui.svelte.ts';

  let { anim }: { anim: AnimationApp } = $props();
  const store = $derived(anim.store);
  /** The selection on this image (none when it was made on an image of another size). */
  const selection = $derived.by(() => {
    void $store.pixelSelection;
    void $store.history.present.stage;
    return anim.pixelSelection();
  });
  const outline = $derived(selection ? maskOutline(selection) : null);
  const draft = $derived(
    selUi.draft && selUi.draft.length > 1
      ? `M${selUi.draft.map((p) => `${p.x} ${p.y}`).join('L')}Z`
      : null,
  );
</script>

{#if outline && outline.runs > 0}
  <g class="selection-outline" data-runs={outline.runs}>
    <path class="under" d={outline.d} vector-effect="non-scaling-stroke" />
    <path class="ants" d={outline.d} vector-effect="non-scaling-stroke" />
  </g>
{/if}
{#if draft}
  <g class="selection-draft">
    <path class="under" d={draft} vector-effect="non-scaling-stroke" />
    <path class="ants" d={draft} vector-effect="non-scaling-stroke" />
  </g>
{/if}

<style>
  path {
    fill: none;
    stroke-width: 1px;
    shape-rendering: crispEdges;
  }
  .under {
    stroke: #fff;
  }
  .ants {
    stroke: #000;
    stroke-dasharray: 4 4;
    animation: march 0.6s linear infinite;
  }
  .selection-draft path {
    shape-rendering: auto;
  }
  @keyframes march {
    to {
      stroke-dashoffset: -8;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ants {
      animation: none;
    }
  }
</style>
