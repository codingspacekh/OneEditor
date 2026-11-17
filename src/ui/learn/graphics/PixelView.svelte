<script lang="ts">
  // GC1 (M23): a picture drawn at a display width; zoomed views keep their pixels square.
  import type { RgbaImage } from '../../../core/image/encode/index.ts';
  import { paint } from './pixels.ts';

  let {
    image,
    label,
    width,
    pixelated = false,
    onpick,
  }: {
    image: RgbaImage;
    label: string;
    /** Shown this many CSS px wide (the height in proportion). */
    width: number;
    pixelated?: boolean;
    /** Clicked: the point in the picture's own pixels. */
    onpick?: (x: number, y: number) => void;
  } = $props();
  let canvas: HTMLCanvasElement | undefined = $state();
  $effect(() => {
    if (canvas) paint(canvas, image);
  });
  const height = $derived((width * image.height) / image.width);

  function pick(e: MouseEvent): void {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const inside = (v: number, size: number) => Math.max(0, Math.min(size - 1, Math.floor(v)));
    // A key press (no pointer) zooms on the middle.
    if (box.width === 0 || e.detail === 0) return onpick?.(image.width >> 1, image.height >> 1);
    onpick?.(
      inside(((e.clientX - box.left) / box.width) * image.width, image.width),
      inside(((e.clientY - box.top) / box.height) * image.height, image.height),
    );
  }
</script>

{#snippet view()}
  <span class="frame" role="img" aria-label={label}>
    <canvas
      bind:this={canvas}
      class:pixelated
      aria-hidden="true"
      style:width="{width}px"
      style:height="{height}px"
    ></canvas>
  </span>
{/snippet}

{#if onpick}
  <button type="button" class="pick" title="Click where to zoom in" onclick={pick}
    >{@render view()}</button
  >
{:else}
  {@render view()}
{/if}

<style>
  .frame {
    display: block;
  }
  canvas {
    display: block;
    border-radius: 4px;
    background: var(--bg-2);
    border: 1px solid var(--line);
  }
  .pixelated {
    image-rendering: pixelated;
  }
  .pick {
    padding: 0;
    border: 0;
    background: none;
    cursor: crosshair;
    display: block;
  }
</style>
