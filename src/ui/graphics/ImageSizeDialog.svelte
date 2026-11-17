<script lang="ts">
  // M21 GB6, G10: Image ▸ Image size… — the whole image made a new size in px, %, cm, mm or in
  // at a resolution, its proportions kept or not, every layer resampled (bicubic, bilinear or
  // nearest neighbour); or, with Resample off, only the resolution changed: the pixels stay and
  // the printed size changes. Shows the pixels, the printed size and the memory before and after,
  // and warns when a print would be blocky or a web picture far bigger than a screen (G10, M23:
  // both at once when both are so, below 150 dpi at the printed size and over 4 times a screen).
  import { untrack } from 'svelte';
  import type { App } from '../../app/app.ts';
  import { graphicOf } from '../../core/graphics/document.ts';
  import {
    checkedSize,
    pxToSize,
    resolutionWarnings,
    SIZE_UNITS,
    sizeToPx,
    type SizeUnit,
  } from '../../core/graphics/image-size.ts';
  import {
    RESAMPLE_METHODS,
    RESAMPLE_NAMES,
    type ResampleMethod,
  } from '../../core/graphics/pixels/resample.ts';
  import { formatLength, validateDpi } from '../../core/graphics/units.ts';
  import { EditError } from '../../core/model/errors.ts';
  import Dialog from '../Dialog.svelte';
  import NumField from '../animation/NumField.svelte';

  let { app, onclose }: { app: App; onclose: () => void } = $props();
  const doc = untrack(() => app.graphics.store.get().history.present);
  const settings = graphicOf(doc);
  const now = { width: doc.stage.width, height: doc.stage.height };
  const startUnits: SizeUnit = settings.units === 'pt' ? 'px' : settings.units;

  let units: SizeUnit = $state(startUnits);
  let dpi = $state(settings.dpi);
  let width = $state(pxToSize(now.width, startUnits, settings.dpi, now.width));
  let height = $state(pxToSize(now.height, startUnits, settings.dpi, now.height));
  let keep = $state(true);
  let resample = $state(true);
  let method: ResampleMethod = $state('bicubic');
  let error: string | null = $state(null);

  const dpiError = $derived.by(() => {
    try {
      validateDpi(dpi);
      return null;
    } catch (e) {
      return e instanceof EditError ? e.message : String(e);
    }
  });
  /** The image this makes, in px, or why it cannot be made. */
  const after = $derived(
    resample
      ? checkedSize(
          sizeToPx(width, units, dpi, now.width),
          sizeToPx(height, units, dpi, now.height),
        )
      : { ...now, error: null },
  );
  const problem = $derived(dpiError ?? after.error);
  /** G10 (M23): an image sized for paper (its own units, or the ones typed in) is a print. */
  const onPaper = (u: SizeUnit | typeof settings.units): boolean => u !== 'px' && u !== '%';
  const warnings = $derived(
    problem
      ? []
      : resolutionWarnings(after, dpi, { print: onPaper(settings.units) || onPaper(units) }),
  );
  const megabytes = (w: number, h: number) => `${((w * h * 4) / 1e6).toFixed(1)} MB`;
  const printed = (w: number, h: number) =>
    `${formatLength(w, 'cm', dpi).replace(' cm', '')} × ${formatLength(h, 'cm', dpi)}`;

  /** A side typed: with proportions kept, the other follows. */
  function setSide(side: 'width' | 'height', value: number): string | null {
    if (!(value > 0)) return 'Type a size above 0.';
    if (side === 'width') width = value;
    else height = value;
    if (!keep) return null;
    if (units === '%') {
      if (side === 'width') height = value;
      else width = value;
      return null;
    }
    const px = sizeToPx(value, units, dpi, side === 'width' ? now.width : now.height);
    if (side === 'width')
      height = pxToSize(
        Math.max(1, Math.round((px * now.height) / now.width)),
        units,
        dpi,
        now.height,
      );
    else
      width = pxToSize(
        Math.max(1, Math.round((px * now.width) / now.height)),
        units,
        dpi,
        now.width,
      );
    return null;
  }

  /** Another unit: the same size shown in it. */
  function changeUnits(next: SizeUnit): void {
    const sized = after;
    width = pxToSize(sized.width, next, dpi, now.width);
    height = pxToSize(sized.height, next, dpi, now.height);
    units = next;
  }

  function apply(): void {
    if (problem) return;
    error = resample
      ? app.graphics.resizeImage({
          width: after.width,
          height: after.height,
          method,
          dpi,
          // G6 (benchmark): a size typed in cm, mm or in is kept exactly as typed.
          ...(units !== 'px' && units !== '%' ? { printed: { width, height, units } } : {}),
        })
      : app.graphics.setResolution(dpi);
    if (!error) onclose();
  }
</script>

<Dialog label="Image size" syllabus="19.1 image resolutions" width={480} {onclose}>
  <label class="check">
    <input type="checkbox" bind:checked={resample} />
    Resample (change the number of pixels)
  </label>
  <div class="grid">
    <NumField
      label="Width"
      value={width}
      unit={units}
      decimals={units === 'px' ? 0 : units === '%' ? 1 : 2}
      disabled={!resample}
      commit={(v) => setSide('width', v)}
    />
    <NumField
      label="Height"
      value={height}
      unit={units}
      decimals={units === 'px' ? 0 : units === '%' ? 1 : 2}
      disabled={!resample}
      commit={(v) => setSide('height', v)}
    />
    <div class="field">
      <label for="size-units">Units</label>
      <select
        id="size-units"
        value={units}
        disabled={!resample}
        onchange={(e) => changeUnits((e.currentTarget as HTMLSelectElement).value as SizeUnit)}
      >
        {#each SIZE_UNITS as u (u)}<option value={u}>{u === '%' ? 'percent (%)' : u}</option>{/each}
      </select>
    </div>
    <div class="field">
      <label for="size-dpi">Resolution</label>
      <div class="row">
        <input
          id="size-dpi"
          type="number"
          min="10"
          max="1200"
          step="1"
          value={dpi}
          onchange={(e) => (dpi = Number((e.currentTarget as HTMLInputElement).value))}
        />
        <span class="unit">dpi</span>
      </div>
    </div>
    <label class="check">
      <input type="checkbox" bind:checked={keep} disabled={!resample} />
      Keep proportions
    </label>
    <div class="field">
      <label for="size-method">Resample by</label>
      <select id="size-method" bind:value={method} disabled={!resample}>
        {#each RESAMPLE_METHODS as m (m)}<option value={m}>{RESAMPLE_NAMES[m]}</option>{/each}
      </select>
    </div>
  </div>
  <p class="made" aria-live="polite">
    {#if problem}
      <span class="error">{problem}</span>
    {:else}
      Now <b>{now.width} × {now.height} px</b> ({megabytes(now.width, now.height)} in memory); after:
      <b>{after.width} × {after.height} px</b>
      ({megabytes(after.width, after.height)}), printed {printed(after.width, after.height)} at
      {dpi} dpi.
    {/if}
  </p>
  {#each warnings as warning (warning)}<p class="warn" role="note">{warning}</p>{/each}
  <p class="hint">
    {#if !resample}
      The pixels stay as they are: only how big the image prints changes.
    {:else if after.width > now.width}
      Making a bitmap bigger adds pixels guessed from those around them: it does not add detail.
    {:else}
      Bicubic suits photos; nearest neighbour keeps hard edges (pixel art, QR codes).
    {/if}
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#snippet buttons()}
    <button onclick={onclose}>Cancel</button>
    <button class="primary" disabled={!!problem} onclick={apply}>Apply</button>
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
    grid-template-columns: 76px 1fr;
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
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .row input {
    width: 80px;
  }
  .unit {
    color: var(--tx-2);
    font-size: 12px;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 0 0 8px;
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
  .warn {
    margin: 0 0 6px;
    color: var(--warn, #e8590c);
    font-size: 12px;
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
