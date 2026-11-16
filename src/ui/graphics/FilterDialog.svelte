<script lang="ts">
  // M22 (GB5, GN2): Filter ▸ Blur ▸ Gaussian / Motion / Zoom, Twirl…, Sharpen…, Distort ▸ Bulge /
  // Pinch, Perspective, Warp — the filter's settings, previewed live on the stage a moment after
  // each change (on a reduced copy of a big photo), OK applies it (one undo step) and Cancel or
  // Escape takes the preview away. The editor stays undimmed beside the box: a click on the image
  // puts the centre of a zoom, twirl or bulge there, and the perspective's corners and the warp's
  // mesh points (drawn by FilterHandles) are dragged on the image.
  import { onDestroy, untrack } from 'svelte';
  import type { App } from '../../app/app.ts';
  import type { Point } from '../../core/animation/geometry.ts';
  import {
    FILTER_FIELDS,
    FILTER_NAMES,
    fieldProblem,
    filterProblem,
    hasCentre,
    type FilterField,
    type FilterSpec,
  } from '../../core/graphics/pixels/filter-specs.ts';
  import type { ToolId } from '../../core/effects/help.ts';
  import Dialog from '../Dialog.svelte';
  import Why from '../Why.svelte';
  import { filterUi, handlesOf, withHandle } from './filter-ui.svelte.ts';

  let { app, onclose }: { app: App; onclose: () => void } = $props();
  const g = untrack(() => app.graphics);

  /** GN2: how long after a change the preview is made (typing or dragging goes on meanwhile). */
  const PREVIEW_DELAY = 150;
  /** How near (screen px) a press must be to a corner or mesh point to drag it. */
  const GRAB = 10;

  const kind = untrack(() => filterUi.kind);
  filterUi.spec = g.filterStart(kind);
  const start = untrack(() => $state.snapshot(filterUi.spec));
  const spec = $derived(filterUi.spec);
  const fields = FILTER_FIELDS[kind];
  const problem = $derived(spec ? filterProblem(spec) : null);
  const why: ToolId =
    kind === 'gaussian' || kind === 'motion' || kind === 'zoom' || kind === 'sharpen'
      ? 'graphicBlur'
      : 'graphicDistort';
  let busy = $state(false);

  const HINTS: Record<FilterSpec['kind'], string> = {
    gaussian: 'Softens the picture evenly: a larger radius blurs more.',
    motion: 'Streaks the picture along a line, as if it moves fast: 0° across, 90° up and down.',
    zoom: 'Streaks the picture out from the centre, as if rushing towards it; the centre stays sharp.',
    twirl:
      'Turns the inside of the circle round its centre, most at the middle: a positive angle turns clockwise.',
    sharpen:
      'Makes edges crisper. The threshold leaves differences smaller than it alone (skin, noise).',
    bulge:
      'Magnifies the inside of the circle like a lens (a negative amount pinches it in); the rim stays put.',
    perspective:
      'Drag the four corners on the image (or type them) to lay the picture flat at an angle.',
    warp: 'Drag the 16 points of the mesh on the image: the picture bends to follow them.',
  };
  const CORNERS = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];

  /** A field's value (the fields show only while there are settings). */
  const valueOf = (key: string): number => (spec as unknown as Record<string, number>)[key]!;

  /** How far a field's slider goes: lengths no further than the layer is big. */
  function sliderMax(field: FilterField): number {
    if (field.key === 'radius' && field.length && (kind === 'gaussian' || kind === 'sharpen'))
      return Math.min(field.max, 100);
    if (field.key === 'distance') return 500;
    if (field.key === 'radius' && start && 'centre' in start) {
      const image = g.store.get().history.present.stage;
      return Math.max(10, Math.round(Math.max(image.width, image.height)));
    }
    return field.max;
  }

  function set(field: FilterField, value: number): void {
    filterUi.spec = { ...spec!, [field.key]: value } as FilterSpec;
  }

  /** A typed number for a field (refused out of range: the box shows why). */
  let refusals: Record<string, string | null> = $state({});
  function typed(field: FilterField, text: string): void {
    const n = text.trim() === '' ? Number.NaN : Number(text);
    const why = fieldProblem(field, n);
    refusals = { ...refusals, [field.key]: why };
    if (!why) set(field, n);
  }

  function setPoint(i: number, axis: 'x' | 'y', text: string): void {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) return;
    const p = handlesOf(spec)[i]!;
    filterUi.spec = withHandle(spec!, i, { ...p, [axis]: n });
  }

  // ---- the live preview ----
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  $effect(() => {
    const now = $state.snapshot(filterUi.spec) as FilterSpec | null;
    if (!now || filterProblem(now)) {
      void g.previewFilter(null);
      return;
    }
    timer = setTimeout(() => void g.previewFilter(now), PREVIEW_DELAY);
    return () => clearTimeout(timer);
  });

  // ---- on the image: the centre clicked, corners and mesh points dragged ----
  let stopDrag: (() => void) | null = null;

  /** A press's place on the image (image px), from the stage's box on screen. */
  function onImage(e: { clientX: number; clientY: number }): { p: Point; perPx: number } | null {
    const stage = document.querySelector('svg[aria-label="Stage"]');
    const box = stage?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    const { width, height } = g.store.get().history.present.stage;
    return {
      p: {
        x: ((e.clientX - box.left) * width) / box.width,
        y: ((e.clientY - box.top) * height) / box.height,
      },
      perPx: width / box.width,
    };
  }

  function press(e: PointerEvent): void {
    if (!spec || busy) return;
    const at = onImage(e);
    if (!at) return;
    const points = handlesOf(spec);
    let grabbed = -1;
    if (hasCentre(kind)) grabbed = 0;
    else {
      let best = GRAB * at.perPx;
      points.forEach((q, i) => {
        const d = Math.hypot(q.x - at.p.x, q.y - at.p.y);
        if (d <= best) {
          best = d;
          grabbed = i;
        }
      });
    }
    if (grabbed < 0) return;
    if (hasCentre(kind)) filterUi.spec = withHandle(spec, 0, at.p);
    const grab = { x: at.p.x - points[grabbed]!.x, y: at.p.y - points[grabbed]!.y };
    const keep = hasCentre(kind) ? { x: 0, y: 0 } : grab;
    const move = (m: PointerEvent) => {
      const now = onImage(m);
      if (!now) return;
      filterUi.spec = withHandle(filterUi.spec!, grabbed, {
        x: now.p.x - keep.x,
        y: now.p.y - keep.y,
      });
    };
    const up = () => stopDrag?.();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    stopDrag = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      stopDrag = null;
    };
  }

  onDestroy(() => {
    clearTimeout(timer);
    stopDrag?.();
    if (!done) void g.previewFilter(null);
    filterUi.spec = null;
  });

  function reset(): void {
    filterUi.spec = start as FilterSpec;
  }

  /** Cancel or Escape (neither while it is being applied: the button is off, Escape ignored). */
  function cancel(): void {
    clearTimeout(timer);
    done = true;
    void g.previewFilter(null);
    onclose();
  }

  /** OK (only allowed when the settings can be used). */
  async function apply(): Promise<void> {
    clearTimeout(timer);
    busy = true;
    done = true;
    await g.applyFilter($state.snapshot(spec!) as FilterSpec);
    busy = false;
    onclose();
  }
</script>

<Dialog
  label={FILTER_NAMES[kind]}
  syllabus="19.3 tools/filters to alter parts of an image"
  width={360}
  clear
  {busy}
  onbackdrop={press}
  onclose={cancel}
>
  {#if !spec}
    <p class="error" role="alert">
      Choose a pixel layer first: filters change the pixels of one layer (or its mask).
    </p>
  {:else}
    <p class="hint">{HINTS[kind]}</p>
    <Why tool={why} />
    {#each fields as field (field.key)}
      <div class="slider">
        <label for="filter-{field.key}">{field.label}</label>
        <input
          id="filter-{field.key}"
          type="range"
          min={field.min}
          max={sliderMax(field)}
          step={field.decimals ? 0.1 : 1}
          value={valueOf(field.key)}
          oninput={(e) => set(field, Number((e.currentTarget as HTMLInputElement).value))}
        />
        <input
          class="number"
          type="number"
          aria-label="{field.label} value"
          min={field.min}
          max={field.max}
          step={field.decimals ? 0.1 : 1}
          value={valueOf(field.key)}
          onchange={(e) => typed(field, (e.currentTarget as HTMLInputElement).value)}
        />
        <span class="unit">{field.unit}</span>
      </div>
      {#if refusals[field.key]}<p class="error" role="alert">{refusals[field.key]}</p>{/if}
    {/each}
    {#if 'centre' in spec}
      <div class="points">
        <span>Centre</span>
        <input
          class="number"
          type="number"
          aria-label="Centre X"
          value={spec.centre.x}
          onchange={(e) => setPoint(0, 'x', (e.currentTarget as HTMLInputElement).value)}
        />
        <input
          class="number"
          type="number"
          aria-label="Centre Y"
          value={spec.centre.y}
          onchange={(e) => setPoint(0, 'y', (e.currentTarget as HTMLInputElement).value)}
        />
        <span class="unit">px</span>
      </div>
      <p class="hint">Or click the image to put the centre there.</p>
    {:else if spec.kind === 'perspective'}
      {#each spec.corners as corner, i (i)}
        <div class="points">
          <span>{CORNERS[i]}</span>
          <input
            class="number"
            type="number"
            aria-label="{CORNERS[i]} X"
            value={corner.x}
            onchange={(e) => setPoint(i, 'x', (e.currentTarget as HTMLInputElement).value)}
          />
          <input
            class="number"
            type="number"
            aria-label="{CORNERS[i]} Y"
            value={corner.y}
            onchange={(e) => setPoint(i, 'y', (e.currentTarget as HTMLInputElement).value)}
          />
          <span class="unit">px</span>
        </div>
      {/each}
    {/if}
    {#if kind === 'perspective' || kind === 'warp'}
      <button class="reset" onclick={reset}>Reset</button>
    {/if}
    {#if problem}<p class="error" role="alert">{problem}</p>{/if}
  {/if}
  {#snippet buttons()}
    <button onclick={cancel} disabled={busy}>Cancel</button>
    <button class="primary" disabled={!spec || problem !== null || busy} onclick={apply}>
      {busy ? 'Applying…' : 'OK'}
    </button>
  {/snippet}
</Dialog>

<style>
  .slider,
  .points {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr) 72px 34px;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .points {
    grid-template-columns: 76px 1fr 1fr 34px;
  }
  .slider label,
  .points span:first-child {
    color: var(--tx-2);
  }
  .number {
    width: 100%;
    min-width: 0;
  }
  .unit {
    color: var(--tx-3);
    font-size: 11px;
  }
  .reset {
    align-self: flex-start;
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
