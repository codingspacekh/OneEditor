<script lang="ts">
  // GL1, G10 (M23): the same star as a 16 × 16 px bitmap and as a vector shape, zoomed together:
  // the bitmap's pixels grow into squares (it pixelates); the vector is drawn again, sharp.
  import {
    BITMAP_SIDE,
    BITMAP_VECTOR,
    STAR,
    coverage,
    zoomView,
  } from '../../../core/teaching/graphics.ts';
  import LearnCard from '../LearnCard.svelte';

  let zoom = $state(1);
  const cells = coverage(STAR, BITMAP_SIDE);
  const pixels = [...cells].flatMap((c, i) =>
    c > 0 ? [{ x: i % BITMAP_SIDE, y: Math.floor(i / BITMAP_SIDE), c }] : [],
  );
  const view = $derived(zoomView(zoom));
  const viewBox = $derived(`${view.x} ${view.y} ${view.size} ${view.size}`);
  /** The pixel grid's lines. */
  const LINES = Array.from({ length: BITMAP_SIDE + 1 }, (_, i) => i);
  const points = STAR.map(([x, y]) => `${x},${y}`).join(' ');
  const kinds = [
    ['Bitmap (raster)', BITMAP_VECTOR.bitmap],
    ['Vector', BITMAP_VECTOR.vector],
  ] as const;
</script>

<LearnCard title="Bitmap and vector" icon="image" tag="19.1 bitmap and vector">
  <p class="lead">
    The same star twice: on the left as a bitmap of {BITMAP_SIDE} × {BITMAP_SIDE} pixels, on the right
    as a vector shape of 10 points. Zoom in and watch the edges.
  </p>
  <div class="pair">
    <figure>
      <svg
        {viewBox}
        role="img"
        aria-label="The star as a bitmap at {zoom} ×"
        shape-rendering="crispEdges"
      >
        <rect x="0" y="0" width={BITMAP_SIDE} height={BITMAP_SIDE} fill="#ffffff" />
        {#each pixels as p (`${p.x},${p.y}`)}
          <rect x={p.x} y={p.y} width="1" height="1" fill="#d23b3b" fill-opacity={p.c} />
        {/each}
        {#if zoom >= 4}
          {#each LINES as i (i)}
            <line x1={i} y1="0" x2={i} y2={BITMAP_SIDE} class="grid" />
            <line x1="0" y1={i} x2={BITMAP_SIDE} y2={i} class="grid" />
          {/each}
        {/if}
      </svg>
      <figcaption>Bitmap: {BITMAP_SIDE * BITMAP_SIDE} pixels, each one colour</figcaption>
    </figure>
    <figure>
      <svg {viewBox} role="img" aria-label="The star as a vector at {zoom} ×">
        <rect x="0" y="0" width={BITMAP_SIDE} height={BITMAP_SIDE} fill="#ffffff" />
        <polygon {points} fill="#d23b3b" />
      </svg>
      <figcaption>Vector: 10 points joined by lines, filled</figcaption>
    </figure>
  </div>
  <label class="zoom">
    <span>Zoom</span>
    <input type="range" min="1" max="16" step="1" aria-label="Zoom" bind:value={zoom} />
    <span class="v">{zoom} ×</span>
  </label>
  <p class="hint" role="status">
    {#if zoom === 1}
      At the size it was made, both look the same.
    {:else if zoom < 4}
      Enlarged {zoom} times: the bitmap’s edge starts to look soft and stepped.
    {:else}
      Enlarged {zoom} times: each pixel of the bitmap is now a square {zoom} times bigger — it has pixelated.
      The vector is worked out again from its points, so its edge stays sharp.
    {/if}
  </p>
</LearnCard>

<LearnCard title="Uses, advantages and disadvantages" icon="info" tag="19.1 bitmap and vector">
  <div class="kinds">
    {#each kinds as [name, k] (name)}
      <section aria-label={name}>
        <h4>{name}</h4>
        <p class="what">{k.what}</p>
        <h5>Used for</h5>
        <ul>
          {#each k.uses as u (u)}<li>{u}</li>{/each}
        </ul>
        <h5>Advantages</h5>
        <ul>
          {#each k.pros as a (a)}<li class="plus">{a}</li>{/each}
        </ul>
        <h5>Disadvantages</h5>
        <ul>
          {#each k.cons as d (d)}<li class="minus">{d}</li>{/each}
        </ul>
      </section>
    {/each}
  </div>
</LearnCard>

<style>
  .lead,
  .what {
    margin: 0 0 10px;
    color: var(--tx-2);
    font-size: 12px;
    line-height: 1.5;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  figure {
    margin: 0;
  }
  svg {
    display: block;
    width: 100%;
    max-width: 240px;
    aspect-ratio: 1;
    margin: 0 auto;
    border-radius: 6px;
    border: 1px solid var(--line);
  }
  .grid {
    stroke: rgba(0, 0, 0, 0.18);
    stroke-width: 0.03;
  }
  figcaption {
    margin-top: 6px;
    text-align: center;
    font-size: 11.5px;
    color: var(--tx-3);
  }
  .zoom {
    display: grid;
    grid-template-columns: auto 1fr 44px;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    font-size: 12px;
    color: var(--tx-2);
  }
  .v {
    font-family: var(--mono);
    text-align: right;
  }
  .hint {
    margin: 8px 0 0;
    color: var(--tx-3);
    font-size: 11.5px;
    line-height: 1.5;
  }
  .kinds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  h4 {
    margin: 0 0 4px;
    font-size: 13px;
  }
  h5 {
    margin: 10px 0 4px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--tx-3);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    line-height: 1.45;
    color: var(--tx-2);
  }
  li + li {
    margin-top: 3px;
  }
  li::before {
    content: '·';
    font-weight: 700;
    margin-right: 5px;
    color: var(--tx-3);
  }
  .plus::before {
    content: '+';
    color: var(--success);
  }
  .minus::before {
    content: '−';
    color: var(--danger);
  }
</style>
