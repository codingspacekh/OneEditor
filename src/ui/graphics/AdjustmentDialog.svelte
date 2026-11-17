<script lang="ts">
  // M22 GB3: Image ▸ Adjustments ▸ — one dialog for every adjustment (a chooser at the top, the
  // one the menu asked for first): its sliders, each with a number to type, a live preview on the
  // stage (shortly after the last change, on a reduced copy of a big layer), OK to apply it as
  // one undo step and Cancel (or Escape) to take the preview away. The editor stays undimmed so
  // the preview can be judged; for Replace colour a click on the image picks the colour. On a
  // layer mask only the adjustments that work on greys can be applied.
  import { onDestroy, untrack } from 'svelte';
  import type { App } from '../../app/app.ts';
  import {
    ADJUSTMENTS,
    adjustmentLabel,
    defaultSettings,
    maskRefusal,
    worksOnMask,
    type AdjustmentKind,
    type Tones,
  } from '../../core/graphics/pixels/adjust.ts';
  import { isPixelLayer } from '../../core/graphics/pixels/layers.ts';
  import ColourField from '../animation/ColourField.svelte';
  import Dialog from '../Dialog.svelte';
  import Why from '../Why.svelte';
  import { ADJUST_HINTS, slidersFor } from './adjust-fields.ts';
  import { adjustUi } from './adjust-ui.svelte.ts';

  let { app, onclose }: { app: App; onclose: () => void } = $props();

  /** The preview follows the sliders this long after they stop (ms). */
  const PREVIEW_DELAY = 120;
  const TONES = ['shadows', 'midtones', 'highlights'] as const;

  const g = untrack(() => app.graphics);
  const start = g.store.get();
  const layer = start.history.present.layers.find((l) => l.id === start.layerId);
  const onPixels = isPixelLayer(layer);
  const onMask = start.editingMask === true;

  let kind: AdjustmentKind = $state(untrack(() => adjustUi.kind));
  // The settings of the adjustment shown, as the sliders change them.
  let settings: Record<string, unknown> = $state(defaultSettings(untrack(() => adjustUi.kind)));
  let tone: (typeof TONES)[number] = $state('midtones');
  let note: string | null = $state(null);
  let busy = $state(false);

  const refused = $derived(onMask && !worksOnMask(kind) ? maskRefusal(kind) : null);
  const sliders = $derived(slidersFor(kind, settings.colourise === true));
  /** Where the sliders' numbers are: colour balance's are those of the tones chosen. */
  const values = $derived(
    kind === 'colourBalance' ? (settings[tone] as unknown as Record<string, number>) : settings,
  );

  function choose(next: AdjustmentKind): void {
    kind = next;
    adjustUi.kind = next;
    settings = defaultSettings(next);
    note = null;
  }

  function set(key: string, value: number): void {
    if (!Number.isFinite(value)) return;
    if (kind === 'colourBalance') settings[tone] = { ...(settings[tone] as Tones), [key]: value };
    else settings[key] = value;
  }

  function colourise(on: boolean): void {
    const hue = Number(settings.hue);
    const saturation = Number(settings.saturation);
    settings.colourise = on;
    // Colourise gives one hue (0–360°) and a saturation of 0–100 %; back again, shifts from 0.
    settings.hue = on ? ((hue % 360) + 360) % 360 : hue > 180 ? hue - 360 : hue;
    settings.saturation = on ? (saturation > 0 ? saturation : 25) : 0;
  }

  // ---- the live preview ----
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  $effect(() => {
    const k = kind;
    const now = $state.snapshot(settings);
    if (!onPixels || refused) {
      void g.previewAdjust(k, null);
      return;
    }
    timer = setTimeout(() => void g.previewAdjust(k, now as never), PREVIEW_DELAY);
    return () => clearTimeout(timer);
  });
  onDestroy(() => {
    clearTimeout(timer);
    if (!done) void g.previewAdjust(kind, null);
  });

  function cancel(): void {
    if (busy) return;
    clearTimeout(timer);
    done = true;
    void g.previewAdjust(kind, null);
    onclose();
  }

  async function apply(): Promise<void> {
    clearTimeout(timer);
    busy = true;
    done = true;
    await g.adjust(kind, $state.snapshot(settings) as never);
    busy = false;
    onclose();
  }

  // ---- Replace colour: the colour clicked on the image ----
  function pick(e: PointerEvent): void {
    if (kind !== 'replaceColour') return;
    const stage = document.querySelector('svg[aria-label="Stage"]');
    const box = stage?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;
    const { width, height } = g.store.get().history.present.stage;
    const colour = g.colourUnder({
      x: ((e.clientX - box.left) * width) / box.width,
      y: ((e.clientY - box.top) * height) / box.height,
    });
    if (colour) settings.colour = colour;
    note = colour ? null : 'Nothing to pick there: click the pixels of the layer.';
  }
</script>

<Dialog
  label={adjustmentLabel(kind)}
  syllabus="19.3 working with colour"
  width={380}
  clear
  {busy}
  onbackdrop={pick}
  onclose={cancel}
>
  <label class="row">
    <span>Adjustment</span>
    <select
      aria-label="Adjustment"
      value={kind}
      onchange={(e) => choose((e.currentTarget as HTMLSelectElement).value as AdjustmentKind)}
    >
      {#each ADJUSTMENTS as a (a.kind)}
        <option value={a.kind}>{a.label}</option>
      {/each}
    </select>
  </label>
  {#if !onPixels}
    <p class="error" role="alert">
      Choose a pixel layer first: adjustments change the pixels of one layer (or its mask).
    </p>
  {:else}
    <p class="hint">{ADJUST_HINTS[kind]}</p>
    {#if onMask}
      <p class="hint">On the layer mask: lighter shows more of the layer, darker hides it.</p>
    {/if}
    {#if kind === 'levels'}
      <label class="row">
        <span>Channel</span>
        <select aria-label="Channel" bind:value={settings.channel} disabled={onMask}>
          <option value="rgb">RGB (all three)</option>
          <option value="red">Red</option>
          <option value="green">Green</option>
          <option value="blue">Blue</option>
        </select>
      </label>
    {:else if kind === 'colourBalance'}
      <div class="tones" role="radiogroup" aria-label="Tones">
        {#each TONES as t (t)}
          <label class="check">
            <input type="radio" name="tones" checked={tone === t} onchange={() => (tone = t)} />
            {t[0]!.toUpperCase() + t.slice(1)}
          </label>
        {/each}
      </div>
    {:else if kind === 'replaceColour'}
      <ColourField
        label="Colour"
        value={String(settings.colour)}
        commit={(c) => {
          settings.colour = c;
          return null;
        }}
      />
      <p class="hint">Click the colour in the image to pick it.</p>
    {/if}
    {#each sliders as s (s.key)}
      <div class="slider">
        <label for="adjust-{s.key}">{s.label}</label>
        <input
          id="adjust-{s.key}"
          type="range"
          min={s.min}
          max={s.max}
          step={s.step}
          value={Number(values[s.key])}
          oninput={(e) => set(s.key, Number((e.currentTarget as HTMLInputElement).value))}
        />
        <input
          class="number"
          type="number"
          aria-label="{s.label} value"
          min={s.min}
          max={s.max}
          step={s.step}
          value={Number(values[s.key])}
          onchange={(e) => {
            const n = Number((e.currentTarget as HTMLInputElement).value);
            set(s.key, Math.min(s.max, Math.max(s.min, n)));
          }}
        />
        <span class="unit">{s.unit}</span>
      </div>
    {/each}
    {#if kind === 'colourBalance'}
      <label class="check">
        <input
          type="checkbox"
          checked={settings.preserveLuminosity === true}
          onchange={(e) =>
            (settings.preserveLuminosity = (e.currentTarget as HTMLInputElement).checked)}
        />
        Preserve luminosity (only the colour moves, not the brightness)
      </label>
    {:else if kind === 'hueSaturation'}
      <label class="check">
        <input
          type="checkbox"
          checked={settings.colourise === true}
          onchange={(e) => colourise((e.currentTarget as HTMLInputElement).checked)}
        />
        Colourise (one colour, the brightness kept)
      </label>
    {/if}
    {#if note}<p class="error" role="alert">{note}</p>{/if}
    {#if refused}<p class="error" role="alert">{refused}</p>{/if}
  {/if}
  <Why tool="graphicAdjust" />
  {#snippet buttons()}
    <button onclick={cancel} disabled={busy}>Cancel</button>
    <button class="primary" disabled={!onPixels || refused !== null || busy} onclick={apply}
      >OK</button
    >
  {/snippet}
</Dialog>

<style>
  .row {
    display: grid;
    grid-template-columns: 80px 1fr;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .slider {
    display: grid;
    grid-template-columns: 110px 1fr 58px 34px;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .slider label {
    color: var(--tx-2);
  }
  .number {
    width: 58px;
  }
  .unit {
    color: var(--tx-3);
    font-size: 11px;
  }
  .tones {
    display: flex;
    gap: 12px;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 12px;
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
