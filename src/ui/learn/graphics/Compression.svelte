<script lang="ts">
  // GC1 (M23): compression on the student's own picture — a JPEG quality slider with the size and
  // a zoomed difference view; the picture as PNG, GIF, BMP, TIFF and JPG side by side; the colour
  // depth and the resolution reduced (the coursebook's two lossy examples); a JPEG saved again
  // and again; and the file-size calculator. The work is on a copy of at most a million pixels.
  import type { GraphicsLearnApp } from '../../../app/learn-graphics.ts';
  import { imageFileSize } from '../../../core/teaching/file-size.ts';
  import { COMPRESSION_TOPICS, cropImage } from '../../../core/teaching/graphics.ts';
  import type { RgbaImage } from '../../../core/image/encode/index.ts';
  import { sizeText } from '../size.ts';
  import LearnCard from '../LearnCard.svelte';
  import ImageSizeCalculator from './ImageSizeCalculator.svelte';
  import PixelView from './PixelView.svelte';
  import Topics from './Topics.svelte';

  let { learn }: { learn: GraphicsLearnApp } = $props();
  const store = $derived(learn.store);
  const s = $derived($store);
  const picture = $derived(s.picture);
  /** The slider's number while it is dragged; the JPEG is made when it is let go. */
  let dragging: number | null = $state(null);
  const quality = $derived(dragging ?? s.quality);
  let vary = $state(true);
  /** Where the zoomed views look, in the copy's pixels (the middle at first). */
  let centre: { x: number; y: number } | null = $state(null);
  /** The zoomed views show this many pixels across. */
  const ZOOM = 40;

  const raw = $derived(
    picture
      ? imageFileSize({ width: picture.image.width, height: picture.image.height, bits: 24 }).bytes
      : 0,
  );
  const box = $derived.by(() => {
    if (!picture) return null;
    const { width, height } = picture.image;
    const c = centre ?? { x: width >> 1, y: height >> 1 };
    const side = Math.min(ZOOM, width, height);
    return {
      x: Math.max(0, Math.min(width - side, c.x - (side >> 1))),
      y: Math.max(0, Math.min(height - side, c.y - (side >> 1))),
      width: side,
      height: side,
    };
  });
  const zoomed = (image: RgbaImage) => cropImage(image, box!);
  const bytes = (n: number) => (n < 1000 ? `${Math.round(n)} bytes` : sizeText(n));
  const share = (n: number) => `${Math.max(1, Math.round((100 * n) / raw))} %`;
  const most = $derived(Math.max(1, ...(s.formats ?? []).map((f) => f.bytes ?? 0)));
  const worst = $derived(Math.max(0.01, ...(s.generations ?? []).map((g) => g.fromOriginal.mean)));
  const NAMES = { png: 'PNG', gif: 'GIF', bmp: 'BMP', tiff: 'TIFF', jpg: 'JPG' } as const;
</script>

<div class="grid">
  <div class="wide">
    <LearnCard title="Your picture" icon="image" tag="19.4 compression">
      <div class="top">
        <button onclick={() => learn.choosePicture()} disabled={s.busy !== null}
          >Choose a picture…</button
        >
        <button onclick={() => learn.useGraphic()} disabled={s.busy !== null}
          >Use the image in Graphics mode</button
        >
        <p class="facts" role="status" aria-label="The picture">
          {#if picture}
            <b>{picture.name}</b>: {picture.width} × {picture.height} px{#if picture.fileBytes !== null},
              the file {bytes(picture.fileBytes)}{/if}.
            {#if picture.image.width !== picture.width}
              Worked on a copy of {picture.image.width} × {picture.image.height} px, so it stays quick;
              the sizes below are the copy’s.
            {/if}
          {:else}
            Choose a photo (a paper’s photo is ideal), or use the image open in Graphics mode. It is
            only read: nothing is changed or saved.
          {/if}
        </p>
      </div>
      {#if s.busy}<p class="busy" role="status">{s.busy}</p>{/if}
      {#if s.message}
        <p class={s.message.kind === 'error' ? 'error' : 'note'} role="alert">
          {s.message.text}
          <button class="ghost sm" onclick={() => learn.dismiss()}>OK</button>
        </p>
      {/if}
    </LearnCard>
  </div>

  <div class="wide">
    <LearnCard title="JPEG quality" icon="speed" tag="19.4 lossy compression">
      {#if picture}
        <div class="views">
          <figure class="whole">
            <PixelView
              image={picture.image}
              label="Your picture: click where to zoom in"
              width={200}
              onpick={(x, y) => (centre = { x, y })}
            />
            <figcaption>Click where to zoom in</figcaption>
          </figure>
          {#if box}
            <figure>
              <PixelView
                image={zoomed(picture.image)}
                label="The original, zoomed"
                width={110}
                pixelated
              />
              <figcaption>Original</figcaption>
            </figure>
            {#if s.jpeg}
              <figure>
                <PixelView
                  image={zoomed(s.jpeg.image)}
                  label="The JPEG, zoomed"
                  width={110}
                  pixelated
                />
                <figcaption>JPEG {s.jpeg.quality}</figcaption>
              </figure>
              <figure>
                <PixelView
                  image={zoomed(s.jpeg.diff.image)}
                  label="The difference, zoomed"
                  width={110}
                  pixelated
                />
                <figcaption>Difference × 8</figcaption>
              </figure>
            {/if}
          {/if}
        </div>
      {/if}
      <label class="slider">
        <span>Quality</span>
        <input
          type="range"
          min="1"
          max="100"
          aria-label="JPEG quality"
          value={quality}
          oninput={(e) => (dragging = Number(e.currentTarget.value))}
          onchange={(e) => {
            dragging = null;
            void learn.setQuality(Number(e.currentTarget.value));
          }}
        />
        <span class="v">{quality}</span>
      </label>
      {#if picture && s.jpeg}
        <p class="stat" role="status" aria-label="JPEG size">
          JPEG at {s.jpeg.quality}: <b>{bytes(s.jpeg.bytes)}</b>, {share(s.jpeg.bytes)} of the
          {bytes(raw)} uncompressed. {Math.round(s.jpeg.diff.stats.changed * 100)} % of the pixels changed,
          by {s.jpeg.diff.stats.mean.toFixed(1)} levels on average (the most {s.jpeg.diff.stats
            .most} of 255).
        </p>
        <p class="hint">
          In the difference view black means the same; the brighter, the more data was lost. It
          shows most round edges and fine detail, where JPEG throws data away first.
        </p>
      {:else if !picture}
        <p class="hint">Choose a picture to see what each quality does to it.</p>
      {/if}
    </LearnCard>
  </div>

  <LearnCard title="The same picture in five formats" icon="export" tag="19.4 lossless and lossy">
    <div class="top">
      <button onclick={() => learn.compareFormats()} disabled={!picture || s.busy !== null}
        >Save in five formats</button
      >
      <p class="hint">PNG, GIF, BMP, TIFF and JPG (at quality {s.quality}), made in memory only.</p>
    </div>
    {#if s.formats}
      <ul class="rows" aria-label="Formats compared">
        {#each s.formats as f (f.format)}
          <li>
            {#if f.preview}
              <PixelView image={f.preview} label="{NAMES[f.format]} opened again" width={56} />
            {:else}
              <span class="nopreview" title="No preview">—</span>
            {/if}
            <span class="name">{NAMES[f.format]}</span>
            <span class="tag" class:lossy={!f.lossless}
              >{f.lossless ? 'exact' : f.format === 'gif' ? '256 colours' : 'lossy'}</span
            >
            {#if f.bytes !== null}
              <span class="bar" style:width="{(100 * f.bytes) / most}%" class:lossy={!f.lossless}
              ></span>
              <span class="size">{bytes(f.bytes)}</span>
            {:else}
              <span class="problem">{f.problem}</span>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="hint">
        BMP is not compressed: every pixel’s 3 bytes. PNG and TIFF (LZW) are lossless: smaller, and
        every pixel comes back exactly. GIF is lossless too, but holds only 256 colours, so a photo
        loses colours. JPG is the smallest because it is lossy.{#if s.formats.some((f) => f.format === 'tiff' && f.bytes !== null && !f.preview)}
          Browsers cannot show a TIFF.{/if}
      </p>
    {/if}
  </LearnCard>

  <LearnCard title="Fewer colours, fewer pixels" icon="layers" tag="19.4 colour depth · resolution">
    <div class="top">
      <button onclick={() => learn.reduce()} disabled={!picture || s.busy !== null}
        >Reduce the colours and the resolution</button
      >
    </div>
    <p class="hint">
      The coursebook’s two examples of lossy compression: fewer bits for each pixel (colour depth),
      and fewer pixels (resolution). What is taken away cannot be put back.
    </p>
    {#if s.depths}
      <h4>Colour depth</h4>
      <div class="strip" aria-label="Colour depths">
        {#each s.depths as d (d.depth)}
          <figure>
            <PixelView
              image={d.image}
              label="{d.depth === 1 ? '1 bit' : `${d.depth} bits`} a pixel"
              width={84}
            />
            <figcaption>
              <b>{d.depth}-bit</b> · {d.depth === 24 ? '16.7 million' : d.colours} colours<br />
              {bytes(d.raw)} uncompressed{#if d.bytes !== null}<br />PNG {bytes(d.bytes)}{/if}
            </figcaption>
          </figure>
        {/each}
      </div>
      {#if s.depths.some((d) => d.problem)}<p class="hint">{s.depths[0]!.problem}</p>{/if}
    {/if}
    {#if s.resolutions}
      <h4>Resolution</h4>
      <div class="strip" aria-label="Resolutions">
        {#each s.resolutions as r (r.width)}
          <figure>
            <PixelView image={r.image} label="{r.width} × {r.height} px" width={84} pixelated />
            <figcaption>
              <b>{r.width} × {r.height}</b><br />{bytes(r.raw)} uncompressed<br />JPEG {bytes(
                r.bytes,
              )}
            </figcaption>
          </figure>
        {/each}
      </div>
      <p class="hint">
        Each halving keeps a quarter of the pixels: shown at the same size, it blurs.
      </p>
    {/if}
  </LearnCard>

  <LearnCard title="A JPEG saved again and again" icon="loop" tag="19.4 effects on images">
    <div class="top">
      <button onclick={() => learn.resave(10, vary)} disabled={!picture || s.busy !== null}
        >Save it 10 times</button
      >
      <label class="check"
        ><input type="checkbox" bind:checked={vary} /> a little lower quality every other time</label
      >
    </div>
    <p class="hint">
      Each time a JPEG is opened and saved again, it is compressed again and loses a little more. At
      exactly the same quality in the same program, most of the loss is in the first few saves; an
      edit, another program or another quality between saves loses more each time.
    </p>
    {#if s.generations?.length}
      <table>
        <thead>
          <tr
            ><th scope="col">Save</th><th scope="col">Quality</th><th scope="col">Size</th><th
              scope="col">Lost since the original</th
            ></tr
          >
        </thead>
        <tbody>
          {#each s.generations as g (g.generation)}
            <tr>
              <td>{g.generation}</td>
              <td>{g.quality}</td>
              <td>{bytes(g.bytes)}</td>
              <td class="lost"
                ><span class="bar lossy" style:width="{(80 * g.fromOriginal.mean) / worst}%"
                ></span>{g.fromOriginal.mean.toFixed(2)} levels</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
      {#if picture && box && s.generations.length}
        <div class="strip">
          <figure>
            <PixelView
              image={zoomed(picture.image)}
              label="The original, zoomed"
              width={110}
              pixelated
            />
            <figcaption>Original</figcaption>
          </figure>
          <figure>
            <PixelView
              image={zoomed(s.generations[s.generations.length - 1]!.image)}
              label="After the last save, zoomed"
              width={110}
              pixelated
            />
            <figcaption>After {s.generations.length} saves</figcaption>
          </figure>
        </div>
      {/if}
    {/if}
  </LearnCard>

  <ImageSizeCalculator size={picture} />

  <LearnCard title="Compression" icon="info" tag="19.4 compression">
    <Topics topics={COMPRESSION_TOPICS} />
  </LearnCard>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    align-items: start;
  }
  .wide {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }
  .facts {
    flex: 1;
    min-width: 260px;
    margin: 0;
    font-size: 12px;
    color: var(--tx-2);
    line-height: 1.45;
  }
  .facts b {
    color: var(--tx-1);
  }
  .busy {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--accent);
  }
  .error,
  .note {
    margin: 8px 0 0;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .error {
    color: var(--danger);
  }
  .note {
    color: var(--tx-2);
  }
  .views {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
    margin-bottom: 8px;
  }
  figure {
    margin: 0;
  }
  figcaption {
    margin-top: 3px;
    font-size: 10.5px;
    color: var(--tx-3);
    line-height: 1.4;
  }
  figcaption b {
    color: var(--tx-2);
  }
  .slider {
    display: grid;
    grid-template-columns: auto 1fr 32px;
    gap: 10px;
    align-items: center;
    font-size: 12px;
    color: var(--tx-2);
  }
  .v {
    font-family: var(--mono);
    text-align: right;
  }
  .stat {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--tx-2);
  }
  .stat b {
    color: var(--tx-1);
    font-family: var(--mono);
  }
  .hint {
    margin: 8px 0 0;
    color: var(--tx-3);
    font-size: 11.5px;
    line-height: 1.45;
  }
  .top .hint {
    margin: 0;
  }
  h4 {
    margin: 12px 0 6px;
    font-size: 12px;
  }
  .rows {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rows li {
    display: grid;
    grid-template-columns: 58px 40px 76px 1fr 70px;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .nopreview {
    width: 56px;
    text-align: center;
    color: var(--tx-3);
  }
  .name {
    font-family: var(--mono);
    color: var(--tx-1);
  }
  .tag {
    font-size: 10.5px;
    color: var(--success);
  }
  .tag.lossy {
    color: var(--warn);
  }
  .bar {
    display: inline-block;
    height: 12px;
    min-width: 2px;
    border-radius: 3px;
    background: var(--accent);
  }
  .bar.lossy {
    background: var(--warn);
  }
  .size {
    font-family: var(--mono);
    text-align: right;
    color: var(--tx-2);
  }
  .problem {
    grid-column: 4 / -1;
    color: var(--tx-3);
    font-size: 11px;
  }
  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 6px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--tx-2);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
    margin-top: 8px;
  }
  th {
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--tx-3);
    padding: 0 8px 4px 0;
    border-bottom: 1px solid var(--line-strong);
  }
  td {
    padding: 3px 8px 3px 0;
    border-bottom: 1px solid var(--line);
    color: var(--tx-2);
    font-family: var(--mono);
  }
  .lost {
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
