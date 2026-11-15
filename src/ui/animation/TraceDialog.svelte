<script lang="ts">
  // Trace bitmap (AN5): the selected picture becomes vector shapes. The colours, detail and
  // smoothing are tried on a small copy first, drawn as a preview with the number of shapes.
  // GV5 (M19): in black and white (a threshold: silhouettes), of only a part of the picture
  // (shown as a box on the preview), with the picture kept underneath on a hidden layer to
  // compare; and why tracing is worth it or not.
  import Dialog from '../Dialog.svelte';
  import { editorOf } from './editor.ts';
  import type { App } from '../../app/app.ts';
  import {
    DEFAULT_THRESHOLD,
    type TraceMode,
    type TraceOptions,
    type TracedRegion,
  } from '../../core/animation/trace.ts';
  import Why from '../Why.svelte';

  let { app, onclose }: { app: App; onclose: () => void } = $props();
  const editor = editorOf(() => app);
  const anim = $derived(editor.anim);

  let mode = $state<TraceMode>('colour');
  let colours = $state(8);
  let threshold = $state(DEFAULT_THRESHOLD);
  let detail = $state(60);
  let smoothing = $state(50);
  /** GV5: only a part, in % of the picture. */
  let partOnly = $state(false);
  let part = $state({ x: 25, y: 25, width: 50, height: 50 });
  let keep = $state(false);
  let tracing = $state(false);
  let preview = $state<{ width: number; height: number; regions: TracedRegion[] } | null>(null);
  let canvas: HTMLCanvasElement | undefined = $state();

  const clampPct = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0);
  /** The whole picture, for the preview: the part is shown on it as a box. */
  const whole = (): TraceOptions => ({
    colours,
    detail,
    smoothing,
    ...(mode === 'blackWhite' ? { mode, threshold } : {}),
  });
  const options = (): TraceOptions => ({
    ...whole(),
    ...(partOnly
      ? {
          area: {
            x: clampPct(part.x) / 100,
            y: clampPct(part.y) / 100,
            width: clampPct(part.width) / 100,
            height: clampPct(part.height) / 100,
          },
        }
      : {}),
  });
  const shapes = $derived(preview?.regions.length ?? 0);
  const colourCount = $derived(new Set(preview?.regions.map((r) => r.colour)).size);
  const summary = $derived(
    preview
      ? `${shapes} ${shapes === 1 ? 'shape' : 'shapes'} in ${colourCount} ${colourCount === 1 ? 'colour' : 'colours'}`
      : 'Tracing a preview…',
  );

  // The newest settings win: an older preview that finishes late is ignored.
  let asked = 0;
  $effect(() => {
    const wanted = whole();
    const ask = ++asked;
    void anim.tracePreview(wanted).then(
      (made) => {
        if (ask === asked) preview = made;
      },
      () => {},
    );
  });

  type Point = { x: number; y: number; in?: Point; out?: Point };
  function outline(ctx: CanvasRenderingContext2D, pts: readonly Point[]): void {
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]!;
      const c1 = a.out ?? a;
      const c2 = b.in ?? b;
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
    });
    ctx.closePath();
  }

  $effect(() => {
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !preview) return;
    const scale = Math.min(canvas.width / preview.width, canvas.height / preview.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(
      (canvas.width - preview.width * scale) / 2,
      (canvas.height - preview.height * scale) / 2,
    );
    ctx.scale(scale, scale);
    for (const region of preview.regions) {
      ctx.beginPath();
      outline(ctx, region.points);
      for (const hole of region.holes ?? []) outline(ctx, hole);
      ctx.fillStyle = region.colour;
      ctx.fill('evenodd');
    }
    if (partOnly) {
      // GV5: the part that will be traced.
      ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = '#e8590c';
      ctx.strokeRect(
        (clampPct(part.x) / 100) * preview.width,
        (clampPct(part.y) / 100) * preview.height,
        (clampPct(part.width) / 100) * preview.width,
        (clampPct(part.height) / 100) * preview.height,
      );
    }
  });

  async function trace(): Promise<void> {
    tracing = true;
    await anim.traceBitmap(options(), keep);
    tracing = false;
    onclose();
  }
</script>

<Dialog label="Trace bitmap" syllabus="20.1 importing and tracing bitmaps" width={560} {onclose}>
  <div class="body">
    <div class="preview" role="img" aria-label="Preview of the traced shapes">
      <canvas bind:this={canvas} width="240" height="180" aria-hidden="true"></canvas>
    </div>
    <div class="settings">
      <span class="label" id="trace-mode">Trace in</span>
      <div class="row" role="radiogroup" aria-labelledby="trace-mode">
        <label class="choice"
          ><input type="radio" name="trace-mode" value="colour" bind:group={mode} /> In colour</label
        >
        <label class="choice"
          ><input type="radio" name="trace-mode" value="blackWhite" bind:group={mode} /> Black and white</label
        >
      </div>
      {#if mode === 'colour'}
        <label for="trace-colours">Colours</label>
        <div class="row">
          <input id="trace-colours" type="range" min="2" max="16" step="1" bind:value={colours} />
          <span class="value">{colours}</span>
        </div>
      {:else}
        <label
          for="trace-threshold"
          title="Pixels darker than this become black; lighter ones are left out"
        >
          Threshold
        </label>
        <div class="row">
          <input
            id="trace-threshold"
            type="range"
            min="0"
            max="255"
            step="1"
            bind:value={threshold}
          />
          <span class="value">{threshold}</span>
        </div>
      {/if}
      <label for="trace-detail">Detail</label>
      <div class="row">
        <input id="trace-detail" type="range" min="0" max="100" step="5" bind:value={detail} />
        <span class="value">{detail}</span>
      </div>
      <label for="trace-smoothing">Smoothing</label>
      <div class="row">
        <input
          id="trace-smoothing"
          type="range"
          min="0"
          max="100"
          step="5"
          bind:value={smoothing}
        />
        <span class="value">{smoothing}</span>
      </div>
      <p class="count" aria-live="polite">
        {summary}
      </p>
      <label class="check wide"
        ><input type="checkbox" bind:checked={partOnly} /> Only a part of the picture</label
      >
      {#if partOnly}
        <div class="part wide">
          <label>Left % <input type="number" min="0" max="100" bind:value={part.x} /></label>
          <label>Top % <input type="number" min="0" max="100" bind:value={part.y} /></label>
          <label>Width % <input type="number" min="0" max="100" bind:value={part.width} /></label>
          <label>Height % <input type="number" min="0" max="100" bind:value={part.height} /></label>
        </div>
      {/if}
      <label class="check wide"
        ><input type="checkbox" bind:checked={keep} /> Keep the picture underneath (hidden) to compare</label
      >
    </div>
  </div>
  <p class="hint">
    {#if mode === 'blackWhite'}
      The parts darker than the threshold become black shapes (silhouettes); lighter parts are left
      out. Some detail is lost.
    {:else}
      The picture becomes vector shapes, one for each area of colour, grouped in its place, so the
      parts can be recoloured, moved and animated separately. Some detail is lost: fewer colours and
      less detail lose more, but make fewer shapes.
    {/if}
  </p>
  <div class="pros-cons" role="group" aria-label="Tracing: for and against">
    <ul class="pros">
      <li>Scales to any size without going blurry</li>
      <li>Small files for flat art, logos and line drawings</li>
      <li>Each part can be edited, recoloured or animated</li>
    </ul>
    <ul class="cons">
      <li>Fine detail and soft shading are lost</li>
      <li>A photo becomes many shapes and a large file</li>
      <li>Tracing a big picture takes time</li>
    </ul>
  </div>
  <Why tool="animTrace" />
  {#snippet buttons()}
    <button onclick={onclose}>Cancel</button>
    <button class="primary" disabled={tracing} onclick={trace}>Trace</button>
  {/snippet}
</Dialog>

<style>
  .body {
    display: flex;
    gap: 16px;
  }
  canvas {
    width: 240px;
    height: 180px;
    flex: none;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: repeating-conic-gradient(var(--bg-2) 0 25%, var(--bg-1) 0 50%) 0 0 / 16px 16px;
  }
  .settings {
    flex: 1;
    display: grid;
    grid-template-columns: 70px 1fr;
    align-items: center;
    gap: 8px 6px;
    align-content: start;
  }
  .settings label,
  .settings .label {
    color: var(--tx-2);
    font-size: 12px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .row input[type='range'] {
    flex: 1;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }
  .value {
    width: 28px;
    text-align: right;
    font-size: 12px;
    color: var(--tx-1);
    font-variant-numeric: tabular-nums;
  }
  .count {
    grid-column: 1 / -1;
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--tx-1);
  }
  .wide {
    grid-column: 1 / -1;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .part {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .part label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
  }
  .part input {
    width: 100%;
    min-width: 0;
  }
  .hint {
    margin: 12px 0 0;
    color: var(--tx-2);
    font-size: 11.5px;
  }
  .pros-cons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 8px 0 0;
    font-size: 11.5px;
    color: var(--tx-2);
  }
  .pros-cons ul {
    margin: 0;
    padding-left: 16px;
  }
  .pros li::marker {
    content: '+ ';
    color: var(--ok, #2f9e44);
  }
  .cons li::marker {
    content: '− ';
    color: var(--warn, #e8590c);
  }
</style>
