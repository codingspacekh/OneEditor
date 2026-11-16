<script lang="ts">
  // M21: what the pixel tools show over the image, inside the stage's SVG (image px): the
  // selection's outline (GB2, step 3), the brush's size under the pointer (GB4, step 4) and the
  // pixel grid at a high zoom (GB1, step 5). Each is drawn by its step's own component here.
  import type { AnimationApp } from '../../app/animation.ts';
  import type { Rect } from '../../core/graphics/pixels/raster.ts';
  import PixelGrid from './PixelGrid.svelte';
  import SelectionOutline from './SelectionOutline.svelte';
  import BrushCursor from './BrushCursor.svelte';
  // M22 (GB5): the retouching brush's size, the clone source and red eye's box.
  import RetouchCursor from './RetouchCursor.svelte';
  // M22 (GB5): a filter's centre, corners or mesh while its dialog is open.
  import FilterHandles from './FilterHandles.svelte';

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
    <RetouchCursor {anim} {zoom} />
    {#if part}<PixelGrid {zoom} {part} />{/if}
    <FilterHandles {zoom} />
  </g>
{/if}
