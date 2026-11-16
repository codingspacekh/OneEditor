<script lang="ts">
  // M21 GB1: the pixel grid at a high zoom (800 % and more, View ▸ Pixel grid): a thin line round
  // every pixel of the part of the image on screen, one screen pixel wide whatever the zoom, so
  // each pixel can be seen as the square it is.
  import type { Rect } from '../../core/graphics/pixels/raster.ts';
  import { animUi } from '../animation/animation-ui.svelte.ts';
  import { pixelGridAt, pixelGridPath } from '../animation/stage-viewport.ts';

  let { zoom, part }: { zoom: number; part: Rect } = $props();
  const d = $derived(pixelGridAt(zoom, animUi.pixelGrid) ? pixelGridPath(part) : '');
</script>

{#if d}
  <path class="pixel-grid" {d} vector-effect="non-scaling-stroke" data-testid="pixel-grid" />
{/if}

<style>
  .pixel-grid {
    fill: none;
    stroke: rgba(128, 128, 128, 0.55);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
</style>
