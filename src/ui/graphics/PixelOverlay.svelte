<script lang="ts">
  // M21: what the pixel tools show over the image, inside the stage's SVG (image px): the
  // selection's outline (GB2, step 3), the brush's size under the pointer (GB4, step 4) and the
  // pixel grid at a high zoom (GB1, step 5). Each is drawn by its step's own component here.
  import type { AnimationApp } from '../../app/animation.ts';
  import type { Rect } from '../../core/graphics/pixels/raster.ts';
  import PixelGrid from './PixelGrid.svelte';
  import SelectionOutline from './SelectionOutline.svelte';
  import BrushCursor from './BrushCursor.svelte';

  let {
    anim,
    zoom,
    part,
  }: {
    anim: AnimationApp;
    zoom: number;
    /** GB1: the part of the image on screen, image px (where the pixel grid is drawn). */
    part?: Rect | null;
  } = $props();
  const shown = $derived(anim.store !== undefined && zoom > 0);
</script>

{#if shown}
  <g class="pixel-overlay" pointer-events="none">
    <SelectionOutline {anim} />
    <BrushCursor {anim} />
    {#if part}<PixelGrid {zoom} {part} />{/if}
  </g>
{/if}
