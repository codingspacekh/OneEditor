<script lang="ts">
  // M21 GB6, G8: Image ▸ Canvas size… — the canvas made bigger or smaller without resampling: the
  // picture kept at one of nine anchors (a corner, an edge's middle, the centre), or moved to a
  // typed place (a crop to a typed box); the new area transparent or a colour; a smaller canvas
  // crops what is outside it.
  import { untrack } from 'svelte';
  import type { App } from '../../app/app.ts';
  import { TRANSPARENT } from '../../core/animation/rules.ts';
  import { graphicOf } from '../../core/graphics/document.ts';
  import {
    ANCHORS,
    anchorOffset,
    checkedSize,
    pxToSize,
    SIZE_UNITS,
    sizeToPx,
    type Anchor,
    type SizeUnit,
  } from '../../core/graphics/image-size.ts';
  import Dialog from '../Dialog.svelte';
  import ColourField from '../animation/ColourField.svelte';
  import NumField from '../animation/NumField.svelte';

  let { app, onclose }: { app: App; onclose: () => void } = $props();
  const doc = untrack(() => app.graphics.store.get().history.present);
  const { dpi, units: docUnits } = graphicOf(doc);
  const now = { width: doc.stage.width, height: doc.stage.height };
  const startUnits: SizeUnit = docUnits === 'pt' ? 'px' : docUnits;

  let units: SizeUnit = $state(startUnits);
  let width = $state(pxToSize(now.width, startUnits, dpi, now.width));
  let height = $state(pxToSize(now.height, startUnits, dpi, now.height));
  let anchor: Anchor = $state('centre');
  /** G8: the new canvas's top left on the image as it is (px), when typed instead. */
  let place = $state<{ left: number; top: number } | null>(null);
  let transparent = $state(doc.stage.background === TRANSPARENT);
  let colour = $state(doc.stage.background === TRANSPARENT ? '#ffffff' : doc.stage.background);
  let error: string | null = $state(null);

  const size = $derived(
    checkedSize(sizeToPx(width, units, dpi, now.width), sizeToPx(height, units, dpi, now.height)),
  );
  const offset = $derived(
    place ? { dx: -place.left, dy: -place.top } : anchorOffset(anchor, now, size),
  );

  const ANCHOR_NAMES: Record<Anchor, string> = {
    'top-left': 'top left',
    top: 'top',
    'top-right': 'top right',
    left: 'left',
    centre: 'centre',
    right: 'right',
    'bottom-left': 'bottom left',
    bottom: 'bottom',
    'bottom-right': 'bottom right',
  };
  const ARROWS: Record<Anchor, string> = {
    'top-left': '↖',
    top: '↑',
    'top-right': '↗',
    left: '←',
    centre: '•',
    right: '→',
    'bottom-left': '↙',
    bottom: '↓',
    'bottom-right': '↘',
  };

  function changeUnits(next: SizeUnit): void {
    width = pxToSize(size.width, next, dpi, now.width);
    height = pxToSize(size.height, next, dpi, now.height);
    units = next;
  }

  function apply(): void {
    if (size.error) return;
    error = app.graphics.resizeCanvas({
      width: size.width,
      height: size.height,
      anchor,
      background: transparent ? TRANSPARENT : colour,
      ...(place ? { offset } : {}),
    });
    if (!error) onclose();
  }
</script>

<Dialog label="Canvas size" syllabus="19.3 resizing the image / canvas" width={480} {onclose}>
  <div class="grid">
    <NumField
      label="Width"
      value={width}
      unit={units}
      decimals={units === 'px' ? 0 : units === '%' ? 1 : 2}
      commit={(v) => {
        width = v;
        return null;
      }}
    />
    <NumField
      label="Height"
      value={height}
      unit={units}
      decimals={units === 'px' ? 0 : units === '%' ? 1 : 2}
      commit={(v) => {
        height = v;
        return null;
      }}
    />
    <div class="field">
      <label for="canvas-units">Units</label>
      <select
        id="canvas-units"
        value={units}
        onchange={(e) => changeUnits((e.currentTarget as HTMLSelectElement).value as SizeUnit)}
      >
        {#each SIZE_UNITS as u (u)}<option value={u}>{u === '%' ? 'percent (%)' : u}</option>{/each}
      </select>
    </div>
  </div>
  <div class="place">
    <div class="anchors" role="group" aria-label="Anchor">
      {#each ANCHORS as a (a)}
        <button
          class="sm"
          aria-label="Anchor {ANCHOR_NAMES[a]}"
          aria-pressed={!place && anchor === a}
          title="Keep the picture at the {ANCHOR_NAMES[a]}"
          onclick={() => {
            anchor = a;
            place = null;
          }}>{ARROWS[a]}</button
        >
      {/each}
    </div>
    <div class="typed">
      <NumField
        label="Left"
        value={-offset.dx}
        unit="px"
        commit={(v) => {
          place = { left: Math.round(v), top: -offset.dy };
          return null;
        }}
      />
      <NumField
        label="Top"
        value={-offset.dy}
        unit="px"
        commit={(v) => {
          place = { left: -offset.dx, top: Math.round(v) };
          return null;
        }}
      />
      <p class="hint">Where the new canvas's top left is on the picture: type it to crop a box.</p>
    </div>
  </div>
  <div class="grid">
    <label class="check">
      <input type="checkbox" bind:checked={transparent} />
      New area transparent
    </label>
    <ColourField
      label="New area"
      value={colour}
      disabled={transparent}
      commit={(c) => {
        colour = c;
        return null;
      }}
    />
  </div>
  <p class="made" aria-live="polite">
    {#if size.error}
      <span class="error">{size.error}</span>
    {:else}
      The canvas: <b>{now.width} × {now.height} px</b> →
      <b>{size.width} × {size.height} px</b
      >{#if size.width < now.width || size.height < now.height}; what is outside it is cropped{/if}.
    {/if}
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#snippet buttons()}
    <button onclick={onclose}>Cancel</button>
    <button class="primary" disabled={!!size.error} onclick={apply}>Apply</button>
  {/snippet}
</Dialog>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 16px;
  }
  .field {
    display: grid;
    grid-template-columns: 70px 1fr;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .field label {
    color: var(--tx-2);
    font-size: 12px;
  }
  select {
    width: 100%;
  }
  .place {
    display: flex;
    gap: 16px;
    margin: 6px 0 10px;
  }
  .anchors {
    display: grid;
    grid-template-columns: repeat(3, 30px);
    gap: 3px;
  }
  .anchors button {
    width: 30px;
    height: 30px;
    padding: 0;
  }
  .anchors button[aria-pressed='true'] {
    background: var(--accent);
    color: #fff;
  }
  .typed {
    flex: 1;
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
