<script lang="ts">
  // M21 G3: Properties ▸ Pixel layer (Graphics mode), shown for the current pixel layer while no
  // objects are selected and no painting tool is chosen: exact numbers for moving, scaling,
  // turning and skewing its pixels — or only the selected ones — as Animation mode's Properties
  // gives them for objects. X and Y are where one of the 9 reference points goes ("bottom edge at
  // Y = 1900"), W and H the new size in px, % or the image's units (proportions kept), Rotate and
  // Skew in degrees about the reference point; the numbers typed wait for Apply, so they are one
  // undo step. Flip and the quarter turns are done at once (no resampling). Resample: bicubic for
  // photos, nearest for pixel art. Dragging on the canvas with the Select tool moves the pixels,
  // the arrow keys nudge them.
  import type { App } from '../../app/app.ts';
  import { graphicOf } from '../../core/graphics/document.ts';
  import {
    ANCHORS,
    pxToSize,
    SIZE_UNITS,
    sizeToPx,
    type Anchor,
    type SizeUnit,
  } from '../../core/graphics/image-size.ts';
  import { isBrushTool } from '../../core/graphics/pixels/presets.ts';
  import type { Rect } from '../../core/graphics/pixels/raster.ts';
  import {
    RESAMPLE_METHODS,
    RESAMPLE_NAMES,
    type ResampleMethod,
  } from '../../core/graphics/pixels/resample.ts';
  import { referencePoint, type TransformValues } from '../../core/graphics/pixels/transform.ts';
  import { DECIMALS, fromPx, toPx } from '../../core/graphics/units.ts';
  import Why from '../Why.svelte';
  import NumField from '../animation/NumField.svelte';
  import { editorOf } from '../animation/editor.ts';

  let { app }: { app: App } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);
  const store = $derived(editor.anim.store);

  const doc = $derived($store.history.present);
  const layer = $derived(doc.layers.find((l) => l.id === $store.layerId));
  const tool = $derived($store.tool);
  const painting = $derived(isBrushTool(tool) || tool === 'bucket' || tool === 'gradient');
  const shown = $derived(
    editor.still && layer?.pixels !== undefined && $store.selection.length === 0 && !painting,
  );
  const selected = $derived($store.pixelSelection !== undefined);
  const image = $derived(graphicOf(doc));

  /** The box measured, looked for again only when the pixels or the selection change. */
  let cache: { pixels: unknown; selection: unknown; box: Rect | null } | null = null;
  const box = $derived.by((): Rect | null => {
    if (!shown) return null;
    const pixels = layer?.pixels;
    const selection = $store.pixelSelection;
    if (cache && cache.pixels === pixels && cache.selection === selection) return cache.box;
    const found = anim.pixelTransformBox();
    cache = { pixels, selection, box: found };
    return found;
  });

  type Draft = Omit<TransformValues, 'reference' | 'keepProportions'>;
  /** The numbers typed and not yet applied, in image px. */
  let draft: Draft = $state({});
  let reference: Anchor = $state('centre');
  let chosenUnit: SizeUnit | null = $state(null);
  const unit = $derived<SizeUnit>(chosenUnit ?? (image.units === 'pt' ? 'px' : image.units));
  let keep = $state(true);
  let method: ResampleMethod = $state('bicubic');
  let error: string | null = $state(null);

  // Another box (applied, another layer, a new selection): the numbers typed for the old one go.
  let lastBox = '';
  $effect(() => {
    const key = box ? `${box.x} ${box.y} ${box.width} ${box.height}` : '';
    if (key === lastBox) return;
    lastBox = key;
    draft = {};
    error = null;
  });

  const ref = $derived(box ? referencePoint(box, reference) : { x: 0, y: 0 });
  const lengthDecimals = $derived(image.units === 'px' ? 0 : DECIMALS[image.units]);
  const shownLength = (px: number) => fromPx(px, image.units, image.dpi);
  const typedLength = (v: number) => Math.round(toPx(v, image.units, image.dpi) * 100) / 100;
  const sizeDecimals = $derived(unit === 'px' ? 0 : unit === '%' ? 1 : 2);
  const width = $derived(draft.width ?? box?.width ?? 0);
  const height = $derived(draft.height ?? box?.height ?? 0);
  const pending = $derived(Object.keys(draft).length > 0);

  const NAMES: Record<Anchor, string> = {
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

  const change = (next: Draft): null => {
    draft = { ...draft, ...next };
    return null;
  };

  /** A side typed in the size unit, as whole px; the other side in proportion when kept. */
  function setSide(side: 'width' | 'height', v: number): string | null {
    if (!box) return null;
    const whole = side === 'width' ? box.width : box.height;
    const px = Math.round(sizeToPx(v, unit, image.dpi, whole));
    if (!(px >= 1)) return `The ${side} must be at least 1 px.`;
    if (!keep) return change({ [side]: px });
    const other = side === 'width' ? box.height : box.width;
    const kept = Math.max(1, Math.round((px * other) / whole));
    return change(side === 'width' ? { width: px, height: kept } : { height: px, width: kept });
  }

  function chooseReference(a: Anchor): void {
    reference = a;
    // X and Y were where the old point went.
    const rest = { ...draft };
    delete rest.x;
    delete rest.y;
    draft = rest;
  }

  function apply(): void {
    error = anim.transformPixelLayer({ reference, ...draft, method });
    if (!error) draft = {};
  }
</script>

{#if shown && box}
  <div class="sec pixel-transform">
    <h4>
      {selected ? 'Selected pixels' : 'Pixel layer'}
      <span class="syl">19.3 creating and editing bitmap images</span>
    </h4>
    <div class="prop-row">
      <span class="prop-label">Reference</span>
      <div class="anchors prop-half" role="group" aria-label="Reference point">
        {#each ANCHORS as a (a)}
          <button
            class="sm"
            aria-label="Reference point {NAMES[a]}"
            aria-pressed={reference === a}
            title="X and Y give the {NAMES[
              a
            ]}; it stays put as the pixels are scaled, turned or skewed"
            onclick={() => chooseReference(a)}>{ARROWS[a]}</button
          >
        {/each}
      </div>
    </div>
    <div class="prop-row">
      <NumField
        label="X"
        value={shownLength(draft.x ?? ref.x)}
        unit={image.units}
        decimals={lengthDecimals}
        commit={(v) => change({ x: typedLength(v) })}
      />
      <NumField
        label="Y"
        value={shownLength(draft.y ?? ref.y)}
        unit={image.units}
        decimals={lengthDecimals}
        commit={(v) => change({ y: typedLength(v) })}
      />
    </div>
    <div class="prop-row">
      <NumField
        label="W"
        value={pxToSize(width, unit, image.dpi, box.width)}
        {unit}
        decimals={sizeDecimals}
        commit={(v) => setSide('width', v)}
      />
      <NumField
        label="H"
        value={pxToSize(height, unit, image.dpi, box.height)}
        {unit}
        decimals={sizeDecimals}
        commit={(v) => setSide('height', v)}
      />
    </div>
    <div class="field">
      <label for="pixel-size-unit">Size in</label>
      <select
        id="pixel-size-unit"
        value={unit}
        onchange={(e) => (chosenUnit = (e.currentTarget as HTMLSelectElement).value as SizeUnit)}
      >
        {#each SIZE_UNITS as u (u)}<option value={u}>{u === '%' ? 'percent (%)' : u}</option>{/each}
      </select>
    </div>
    <label class="check">
      <input type="checkbox" bind:checked={keep} /> Keep proportions
    </label>
    <NumField
      label="Rotate"
      value={draft.rotate ?? 0}
      unit="°"
      decimals={1}
      commit={(v) => change({ rotate: v })}
    />
    <div class="prop-row">
      <NumField
        label="Skew ↔"
        value={draft.skewX ?? 0}
        unit="°"
        decimals={1}
        commit={(v) => change({ skewX: v })}
      />
      <NumField
        label="Skew ↕"
        value={draft.skewY ?? 0}
        unit="°"
        decimals={1}
        commit={(v) => change({ skewY: v })}
      />
    </div>
    <div class="field">
      <label for="pixel-resample">Resample</label>
      <select
        id="pixel-resample"
        value={method}
        title="How new pixels are made from the old: bicubic for photos, nearest for pixel art"
        onchange={(e) => (method = (e.currentTarget as HTMLSelectElement).value as ResampleMethod)}
      >
        {#each RESAMPLE_METHODS as m (m)}<option value={m}>{RESAMPLE_NAMES[m]}</option>{/each}
      </select>
    </div>
    <div class="prop-buttons">
      <button
        class="sm primary"
        disabled={!pending}
        title="Move, scale, turn and skew the pixels as typed (one undo step)"
        onclick={apply}>Apply</button
      >
      <button
        class="sm"
        disabled={!pending}
        title="Forget the numbers typed"
        onclick={() => {
          draft = {};
          error = null;
        }}>Reset</button
      >
    </div>
    <div class="prop-row">
      <span class="prop-label">Flip</span>
      <div class="prop-buttons" role="group" aria-label="Flip pixels">
        <button
          class="sm"
          aria-label="Flip pixels horizontal"
          title="Mirror left to right (no pixels lost)"
          onclick={() => anim.flipPixels('horizontal')}>↔ Horizontal</button
        >
        <button
          class="sm"
          aria-label="Flip pixels vertical"
          title="Mirror top to bottom (no pixels lost)"
          onclick={() => anim.flipPixels('vertical')}>↕ Vertical</button
        >
      </div>
    </div>
    <div class="prop-row">
      <span class="prop-label">Turn</span>
      <div class="prop-buttons" style:--n="3" role="group" aria-label="Turn pixels">
        <button
          class="sm"
          aria-label="Turn 90° anticlockwise"
          title="A quarter turn to the left (no pixels lost)"
          onclick={() => anim.rotatePixels(-90)}>↺ 90°</button
        >
        <button
          class="sm"
          aria-label="Turn 90° clockwise"
          title="A quarter turn to the right (no pixels lost)"
          onclick={() => anim.rotatePixels(90)}>↻ 90°</button
        >
        <button
          class="sm"
          aria-label="Turn 180°"
          title="Upside down (no pixels lost)"
          onclick={() => anim.rotatePixels(180)}>180°</button
        >
      </div>
    </div>
    <p class="hint">
      Drag on the canvas with the Select tool to move {selected ? 'them' : 'it'} (Shift: straight across
      or down); the arrow keys nudge 1 px, with Shift 10 px.
    </p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <Why tool="graphicTransform" />
  </div>
{/if}

<style>
  /* The Properties panel's own look (its styles are its own: Svelte scopes them). */
  .sec {
    padding: 8px 0 10px;
    border-bottom: 1px solid var(--line);
  }
  h4 {
    margin: 0 0 8px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--tx-2);
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .syl {
    font-size: 10px;
    font-weight: 500;
    color: var(--tx-3);
  }
  /* The nine points fill the first field column (on the grid's lines, as the boxes below). */
  .anchors {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2px;
  }
  .anchors button {
    width: 100%;
    height: 22px;
    padding: 0;
    justify-content: center;
  }
  .anchors button[aria-pressed='true'] {
    background: var(--accent);
    color: #fff;
  }
  /* A label and a menu or box in a row of its own: on the property grid (props.css), the control
     across the field columns. */
  .field {
    display: grid;
    grid-template-columns: var(--prop-cols);
    column-gap: var(--prop-gap-x);
    align-items: center;
    margin-bottom: var(--prop-gap-y);
    min-width: 0;
  }
  .field > :not(label) {
    grid-column: 2 / -1;
    min-width: 0;
  }
  .field label,
  .check {
    color: var(--tx-2);
    font-size: 12px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  select {
    width: 100%;
  }
  .hint {
    margin: 6px 0;
    color: var(--tx-3);
    font-size: 11.5px;
  }
  .error {
    margin: 4px 0 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
