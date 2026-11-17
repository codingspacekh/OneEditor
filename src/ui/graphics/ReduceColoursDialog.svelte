<script lang="ts">
  // M21 GB6 (D6): Image ▸ Reduce colours… — the current pixel layer's colours cut to 2, 16 or 256
  // (1, 4 or 8 bits a pixel: a median-cut palette) or to greys, with Floyd–Steinberg dithering on
  // or off, and an estimate of the picture's size before and after: what colour depth saves.
  import { untrack } from 'svelte';
  import type { App } from '../../app/app.ts';
  import { isPixelLayer } from '../../core/graphics/pixels/layers.ts';
  import {
    COLOUR_TARGETS,
    colourStats,
    sizeEstimate,
    type ColourTarget,
  } from '../../core/graphics/pixels/reduce-colours.ts';
  import Dialog from '../Dialog.svelte';

  let { app, onclose }: { app: App; onclose: () => void } = $props();
  const current = untrack(() => app.graphics.store.get());
  const layer = current.history.present.layers.find((l) => l.id === current.layerId);
  const bitmap = isPixelLayer(layer) ? layer.pixels.bitmap : null;
  /** Counted once: a 12-megapixel photo takes a moment. */
  const stats = bitmap ? colourStats(bitmap) : null;

  let to: ColourTarget = $state(256);
  let dither = $state(true);
  let error: string | null = $state(null);

  const NAMES: Record<string, string> = {
    2: '2 colours (1 bit)',
    16: '16 colours (4 bits)',
    256: '256 colours (8 bits)',
    grey: 'Greyscale (256 greys)',
  };
  const estimate = $derived(
    bitmap && stats ? sizeEstimate(stats, bitmap.width, bitmap.height, to) : null,
  );
  const kb = (bytes: number) =>
    bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

  function apply(): void {
    error = app.graphics.reduceColours({ to, dither: to !== 'grey' && dither });
    if (!error) onclose();
  }
</script>

<Dialog label="Reduce colours" syllabus="19.3 changing colour depth" width={440} {onclose}>
  {#if !bitmap || !stats || !layer}
    <p class="error" role="alert">Choose a pixel layer first: colours are reduced on one layer.</p>
  {:else}
    <p class="made">
      On the layer <b>{layer.name}</b> ({bitmap.width} × {bitmap.height} px), which uses
      <b>{stats.colours.toLocaleString('en-GB')}</b>
      {stats.colours === 1 ? 'colour' : 'colours'}.
    </p>
    <div class="options" role="radiogroup" aria-label="Colours">
      {#each COLOUR_TARGETS as t (t)}
        <label class="check">
          <input type="radio" name="reduce-to" checked={to === t} onchange={() => (to = t)} />
          {NAMES[String(t)]}
        </label>
      {/each}
    </div>
    <label class="check">
      <input type="checkbox" bind:checked={dither} disabled={to === 'grey'} />
      Dithering (dots of the colours there are mix to the colours between)
    </label>
    {#if estimate}
      <p class="made" aria-live="polite">
        File size estimate, before compression: <b>{kb(estimate.before)}</b> at
        {estimate.beforeBits} bits a pixel → <b>{kb(estimate.after)}</b> at {estimate.afterBits}
        {estimate.afterBits === 1 ? 'bit' : 'bits'} a pixel{#if to !== 'grey'}, with its palette{/if}.
      </p>
      <p class="hint">
        An estimate: a PNG or GIF compresses both further, and fewer colours compress better still.
      </p>
    {/if}
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#snippet buttons()}
    <button onclick={onclose}>Cancel</button>
    <button class="primary" disabled={!bitmap} onclick={apply}>Apply</button>
  {/snippet}
</Dialog>

<style>
  .options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin: 6px 0;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 0 0 6px;
    font-size: 12px;
  }
  .made {
    margin: 8px 0 4px;
    font-size: 12.5px;
  }
  .hint {
    margin: 0;
    color: var(--tx-2);
    font-size: 11.5px;
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
