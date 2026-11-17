<script lang="ts">
  // GC1 (M23): the image file-size calculator — width × height × colour depth ÷ 8, worked step by
  // step as the audio calculator is. Starts with the coursebook's photo (1600 × 1200 at 2 bytes).
  import { imageFileSize } from '../../../core/teaching/file-size.ts';
  import LearnCard from '../LearnCard.svelte';

  let { size }: { size?: { width: number; height: number } | null } = $props();
  let width = $state(1600);
  let height = $state(1200);
  let bits = $state(16);
  const result = $derived(imageFileSize({ width, height, bits }));
  const DEPTHS = [1, 4, 8, 16, 24, 32];
  const colours = (b: number) => (b >= 24 ? '16.7 million+' : (2 ** b).toLocaleString('en-GB'));

  const whole = (set: (n: number) => void) => (e: Event) => {
    const v = Math.round(Number((e.currentTarget as HTMLInputElement).value));
    if (v >= 1 && v <= 100000) set(v);
  };
</script>

<LearnCard title="Image file-size calculator" icon="calc" tag="19.4 colour depth · resolution">
  <div class="inputs">
    <label
      ><span>Width</span><input
        type="number"
        min="1"
        aria-label="Picture width (px)"
        value={width}
        onchange={whole((v) => (width = v))}
      /></label
    >
    <label
      ><span>Height</span><input
        type="number"
        min="1"
        aria-label="Picture height (px)"
        value={height}
        onchange={whole((v) => (height = v))}
      /></label
    >
    {#if size}
      <button
        class="sm"
        onclick={() => {
          width = size.width;
          height = size.height;
        }}>Use my picture’s size</button
      >
    {/if}
  </div>
  <div class="depth">
    <span class="label-s">Colour depth (bits a pixel)</span>
    <div class="seg small" role="group" aria-label="Colour depth">
      {#each DEPTHS as b (b)}
        <button aria-pressed={bits === b} onclick={() => (bits = b)}>{b}</button>
      {/each}
    </div>
    <span class="u">{colours(bits)} colours</span>
  </div>
  {#each result.steps as step (step.label)}
    <div class="calc-step"><span>{step.label}</span><span>{step.working}</span></div>
  {/each}
  <div class="result">
    <span>Uncompressed</span><span class="big"
      >≈ {result.mb >= 1 ? `${result.mb.toFixed(2)} MB` : `${result.kb.toFixed(1)} KB`}</span
    >
  </div>
  <p class="hint">
    Halving the bits halves the size; halving the width and the height leaves a quarter of the
    pixels. Compression then makes the file smaller than this.
  </p>
</LearnCard>

<style>
  .inputs,
  .depth {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    font-size: 12px;
    color: var(--tx-2);
    margin-bottom: 10px;
  }
  .inputs label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .inputs input {
    width: 84px;
  }
  .label-s {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--tx-3);
  }
  .u {
    color: var(--tx-3);
    font-size: 11.5px;
  }
  .calc-step {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 6px;
    background: var(--bg-2);
    font: 500 12px var(--mono);
  }
  .calc-step + .calc-step {
    margin-top: 5px;
  }
  .calc-step span:first-child {
    color: var(--tx-2);
    font-family: var(--font);
    white-space: nowrap;
  }
  .calc-step span:last-child {
    text-align: right;
  }
  .result {
    margin-top: 10px;
    padding: 12px;
    border-radius: 10px;
    background: var(--accent-soft);
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    color: var(--tx-2);
  }
  .big {
    font: 700 22px var(--mono);
    color: var(--tx-1);
  }
  .hint {
    color: var(--tx-3);
    font-size: 11.5px;
    margin: 8px 0 0;
  }
</style>
