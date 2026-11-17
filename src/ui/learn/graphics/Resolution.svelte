<script lang="ts">
  // G10 (M23): resolution and print size — px ↔ cm / in at a dpi, why too few pixels blur in
  // print and too many waste space on the web, and the same star printed from more pixels.
  import {
    PRINT_DEMO_PIXELS,
    pixelsFor,
    printSize,
    printVerdict,
    starBitmap,
    webVerdict,
  } from '../../../core/teaching/graphics.ts';
  import { imageFileSize } from '../../../core/teaching/file-size.ts';
  import LearnCard from '../LearnCard.svelte';

  const DPIS = [72, 96, 150, 300, 600];
  let width = $state(1600);
  let height = $state(1200);
  let dpi = $state(300);
  let length = $state(10);
  let unit: 'cm' | 'in' = $state('cm');
  let shown = $state(800);
  const size = $derived(printSize({ width, height }, dpi));
  const verdict = $derived(printVerdict(dpi));
  const web = $derived(webVerdict(width, shown));
  const needed = $derived(pixelsFor(length, unit, dpi));
  const mb = $derived(imageFileSize({ width, height, bits: 24 }).mb);
  const stars = PRINT_DEMO_PIXELS.map((side) => ({ side, cells: starBitmap(side) }));

  const whole = (set: (n: number) => void, min: number, max: number) => (e: Event) => {
    const v = Math.round(Number((e.currentTarget as HTMLInputElement).value));
    if (v >= min && v <= max) set(v);
  };
</script>

<LearnCard title="Resolution and print size" icon="ruler" tag="19.1 image resolutions">
  <p class="lead">
    Resolution is the amount of detail in a picture: its pixels, and for print how many pixels go in
    each inch (dots per inch, dpi). The same pixels print smaller at a higher dpi.
  </p>
  <div class="inputs">
    <label
      ><span>Width</span><input
        type="number"
        min="1"
        max="100000"
        aria-label="Width (px)"
        value={width}
        onchange={whole((v) => (width = v), 1, 100000)}
      /><span class="u">px</span></label
    >
    <label
      ><span>Height</span><input
        type="number"
        min="1"
        max="100000"
        aria-label="Height (px)"
        value={height}
        onchange={whole((v) => (height = v), 1, 100000)}
      /><span class="u">px</span></label
    >
    <div class="dpi">
      <span>Resolution</span>
      <div class="seg small" role="group" aria-label="Resolution (dpi)">
        {#each DPIS as d (d)}
          <button aria-pressed={dpi === d} onclick={() => (dpi = d)}>{d}</button>
        {/each}
      </div>
      <span class="u">dpi</span>
    </div>
  </div>
  <div class="result" role="status" aria-label="Printed size">
    Printed at {dpi} dpi: <b>{size.cm.width} × {size.cm.height} cm</b>
    ({size.in.width} × {size.in.height} in) · uncompressed {mb.toFixed(1)} MB
  </div>
  <p class="verdict {verdict.level}">{verdict.text}</p>

  <h4>How many pixels for a print?</h4>
  <div class="inputs">
    <label
      ><span>Print</span><input
        type="number"
        min="0.1"
        step="0.1"
        aria-label="Printed width"
        value={length}
        onchange={(e) => {
          const v = Number(e.currentTarget.value);
          if (v > 0) length = v;
        }}
      /></label
    >
    <div class="seg small" role="group" aria-label="Printed width unit">
      <button aria-pressed={unit === 'cm'} onclick={() => (unit = 'cm')}>cm</button>
      <button aria-pressed={unit === 'in'} onclick={() => (unit = 'in')}>in</button>
    </div>
    <span class="need" role="status" aria-label="Pixels needed"
      >wide at {dpi} dpi needs <b>{needed} px</b></span
    >
  </div>

  <h4>On a web page</h4>
  <div class="inputs">
    <label
      ><span>Shown</span><input
        type="number"
        min="1"
        max="10000"
        aria-label="Shown on the page (px wide)"
        value={shown}
        onchange={whole((v) => (shown = v), 1, 10000)}
      /><span class="u">px wide; the picture is {width} px</span></label
    >
  </div>
  <p class="verdict {web.level}" aria-label="On the web">{web.text}</p>
</LearnCard>

<LearnCard title="Too few pixels for the size" icon="image" tag="19.1 too low / too high">
  <p class="lead">
    The same star printed at one size from pictures of more and more pixels. With too few, each
    pixel is printed big and the picture looks blocky or blurred; past what the printer or screen
    can show, more pixels add nothing but file size.
  </p>
  <div class="stars">
    {#each stars as s (s.side)}
      <figure>
        <svg
          viewBox="0 0 {s.side} {s.side}"
          role="img"
          aria-label="The star from {s.side} × {s.side} pixels"
          shape-rendering="crispEdges"
        >
          <rect width={s.side} height={s.side} fill="#ffffff" />
          {#each s.cells as c, i (i)}
            {#if c > 0}
              <rect
                x={i % s.side}
                y={Math.floor(i / s.side)}
                width="1"
                height="1"
                fill="#2f6fd6"
                fill-opacity={c}
              />
            {/if}
          {/each}
        </svg>
        <figcaption>{s.side} × {s.side} px</figcaption>
      </figure>
    {/each}
  </div>
  <ul class="facts">
    <li>
      <b>Too low in print</b> (below 150 dpi at the printed size): the pixels show, edges are jagged and
      the picture looks blurred. A photo for print is usually 300 dpi.
    </li>
    <li>
      <b>Too low on screen</b>: a small picture stretched to fill a space is blurred.
    </li>
    <li>
      <b>Too high</b>: a screen or printer can only show so much detail, so extra pixels are wasted;
      the file is larger, slower to upload and download, and fills storage.
    </li>
  </ul>
</LearnCard>

<style>
  .lead {
    margin: 0 0 10px;
    color: var(--tx-2);
    font-size: 12px;
    line-height: 1.5;
  }
  h4 {
    margin: 14px 0 6px;
    font-size: 12.5px;
  }
  .inputs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    font-size: 12px;
    color: var(--tx-2);
  }
  .inputs label,
  .dpi {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .inputs input {
    width: 80px;
  }
  .u {
    color: var(--tx-3);
    font-size: 11.5px;
  }
  .result {
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--accent-soft);
    font-size: 12.5px;
    color: var(--tx-2);
  }
  .result b,
  .need b {
    color: var(--tx-1);
    font-family: var(--mono);
  }
  .verdict {
    margin: 8px 0 0;
    padding-left: 10px;
    border-left: 3px solid var(--line-strong);
    font-size: 12px;
    line-height: 1.45;
    color: var(--tx-2);
  }
  .verdict.low,
  .verdict.high {
    border-color: var(--warn);
  }
  .verdict.good {
    border-color: var(--success);
  }
  .stars {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  figure {
    margin: 0;
  }
  .stars svg {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 4px;
    border: 1px solid var(--line);
  }
  figcaption {
    margin-top: 4px;
    text-align: center;
    font-size: 11px;
    color: var(--tx-3);
    font-family: var(--mono);
  }
  .facts {
    margin: 12px 0 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--tx-2);
  }
  .facts b {
    color: var(--tx-1);
  }
</style>
