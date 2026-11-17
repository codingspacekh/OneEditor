<script lang="ts">
  // G11 (M18): Export image: SVG, PNG, JPG or PDF (M19) with what each is good for; the whole image, the
  // selected objects, or each selected object in a file of its own; the size (the canvas, a width
  // or height in px, a %, or a printed width at a resolution); JPG quality and background. M23:
  // GIF, BMP and TIFF too; a bitmap's colour depth, its palette (the image's colours or greys) and
  // dithering at 8 bits or fewer, see-through parts kept or put on a background, TIFF compression;
  // each format lossless, lossy or not compressed, with the file's estimated size (GC2).
  import { untrack } from 'svelte';
  import type { App } from '../../app/app.ts';
  import { TRANSPARENT } from '../../core/animation/rules.ts';
  import { graphicOf } from '../../core/graphics/document.ts';
  import {
    COLOUR_DEPTHS,
    exportPixels,
    FORMAT_INFO,
    GRAPHIC_FORMATS,
    imageOfObjects,
    keepsTransparency,
    type ColourDepth,
    type ExportSize,
    type ExportWhat,
    type GraphicFormat,
    type TiffCompression,
  } from '../../core/graphics/export.ts';
  import { estimateFileSize, sizeWords } from '../../core/image/encode/estimate.ts';
  import { pdfPageLabel, pdfPageSize } from '../../core/graphics/pdf.ts';
  import { bitmapParts, bitmapWarning } from '../../core/graphics/bitmap-parts.ts';
  import { UNITS, type Unit } from '../../core/graphics/units.ts';
  import { EditError } from '../../core/model/errors.ts';
  import Dialog from '../Dialog.svelte';
  import Why from '../Why.svelte';
  import ColourField from '../animation/ColourField.svelte';
  import { animUi } from '../animation/animation-ui.svelte.ts';

  let { app, onclose }: { app: App; onclose: () => void } = $props();
  const opened = untrack(() => app.graphics.store.get());
  const doc = opened.history.present;
  const settings = graphicOf(doc);
  const selected = opened.selection.length;

  let format: GraphicFormat = $state(animUi.graphicFormat);
  // The whole image unless the student chooses otherwise: a shape just drawn is still selected.
  let what: ExportWhat = $state('image');
  let sizeBy: ExportSize['by'] = $state('canvas');
  let px = $state(doc.stage.width);
  let percent = $state(100);
  let printWidth = $state(10);
  let printUnit: Unit = $state(settings.units === 'px' ? 'cm' : settings.units);
  let printDpi = $state(settings.dpi >= 150 ? settings.dpi : 300);
  let quality = $state(90);
  let background = $state(doc.stage.background === TRANSPARENT ? '#ffffff' : doc.stage.background);
  let busy = $state(false);
  // M23: the bitmap choices, as last made.
  let depths: Partial<Record<GraphicFormat, ColourDepth>> = $state({ ...animUi.graphicDepths });
  let palette: 'colours' | 'greys' = $state(animUi.graphicPalette);
  let dither = $state(animUi.graphicDither);
  let transparent = $state(animUi.graphicTransparent);
  let tiff: TiffCompression = $state(animUi.graphicTiff);

  const DEPTH_NAMES: Record<ColourDepth, string> = {
    1: '1 bit a pixel: 2 colours',
    4: '4 bits a pixel: 16 colours',
    8: '8 bits a pixel: 256 colours',
    24: '24 bits a pixel: 16.7 million colours (RGB)',
    32: '32 bits a pixel: 16.7 million colours and transparency (RGBA)',
  };
  /** M23 (GC2): how each format squeezes its file. */
  const squeeze = (f: GraphicFormat): string =>
    FORMAT_INFO[f].kind === 'vector'
      ? 'vector'
      : FORMAT_INFO[f].compression === 'none'
        ? 'uncompressed'
        : FORMAT_INFO[f].compression;
  const isBitmap = $derived(
    format === 'png' || format === 'gif' || format === 'bmp' || format === 'tiff',
  );
  const depthsHeld = $derived(COLOUR_DEPTHS[format]);
  const depth: ColourDepth = $derived(depths[format] ?? depthsHeld[0] ?? 24);
  /** GIF and a palette PNG keep see-through pixels or not, as chosen. */
  const choosesTransparency = $derived(format === 'gif' || (format === 'png' && depth <= 8));
  const keeps = $derived(isBitmap && keepsTransparency({ format, depth, transparent }));
  /** The picture has see-through parts: a transparent background, or a part cropped out. */
  const seeThrough = $derived(doc.stage.background === TRANSPARENT || what !== 'image');
  /** A photo (pixel layers or pictures) compresses less than flat colour. */
  const photo = doc.layers.some((l) => l.pixels) || doc.pictures.length > 0;

  const size = $derived.by((): ExportSize => {
    switch (sizeBy) {
      case 'width':
        return { by: 'width', px };
      case 'height':
        return { by: 'height', px };
      case 'percent':
        return { by: 'percent', percent };
      case 'print':
        return { by: 'print', width: printWidth, unit: printUnit, dpi: printDpi };
      default:
        return { by: 'canvas' };
    }
  });
  /** What one file will be, in pixels (for the selection: its own box), or why it cannot. */
  const result = $derived.by(() => {
    try {
      const base = what === 'selection' && selected ? imageOfObjects(doc, opened.selection) : doc;
      // G11 (M19): a PDF's page, the image's printed size.
      const page = format === 'pdf' ? pdfPageLabel(pdfPageSize(base, size), settings.units) : '';
      return { ...exportPixels(base.stage, settings.dpi, size), page, error: null };
    } catch (e) {
      const error = e instanceof EditError ? e.message : String(e);
      return { width: 0, height: 0, dpi: 0, page: '', error };
    }
  });
  const info = $derived(FORMAT_INFO[format]);
  /** M23 (GC2): about how big the file will be, and how it is compressed. */
  const guess = $derived(
    result.error ? null : estimateFileSize(format, result, { depth, tiff, quality, photo }),
  );
  const compressed = $derived(
    format === 'tiff' && tiff === 'none'
      ? 'not compressed'
      : info.compression === 'none'
        ? 'not compressed'
        : info.compression === 'lossy'
          ? 'lossy compression'
          : 'lossless compression',
  );
  /** G11: an SVG or PDF with pictures inside is flagged (M/26: "must not contain bitmap elements"). */
  const bitmaps = $derived(
    info.kind === 'vector'
      ? bitmapWarning(bitmapParts(doc, what === 'image' ? undefined : opened.selection))
      : null,
  );

  async function run(): Promise<void> {
    animUi.graphicFormat = format;
    if (isBitmap) {
      animUi.graphicDepths = { ...depths, [format]: depth };
      animUi.graphicPalette = palette;
      animUi.graphicDither = dither;
      animUi.graphicTransparent = transparent;
      animUi.graphicTiff = tiff;
    }
    busy = true;
    const made = await app.graphics.exportImage({
      format,
      what,
      size,
      ...(format === 'jpg' ? { quality, background } : {}),
      ...(isBitmap
        ? {
            depth,
            background,
            ...(depth <= 8 ? { palette, dither } : {}),
            ...(choosesTransparency ? { transparent } : {}),
            ...(format === 'tiff' ? { tiff } : {}),
          }
        : {}),
    });
    busy = false;
    if (made) onclose();
  }
</script>

<Dialog
  label="Export image"
  syllabus="19.1 exporting an image in different file formats"
  width={560}
  {busy}
  {onclose}
>
  <div class="formats" role="radiogroup" aria-label="Format">
    {#each GRAPHIC_FORMATS as f (f)}
      <label class="format" class:on={format === f}>
        <input type="radio" name="graphic-format" value={f} bind:group={format} />
        <b>{f.toUpperCase()}</b>
        <span>{squeeze(f)}</span>
      </label>
    {/each}
  </div>
  <p class="about"><b>{info.label}.</b> {info.about}</p>
  {#if bitmaps}
    <p class="bitmaps" role="note">{bitmaps}</p>
  {/if}

  <div class="field">
    <label for="export-what">Export</label>
    <select id="export-what" bind:value={what}>
      <option value="image">The whole image</option>
      <option value="selection" disabled={!selected}>The selected objects, cropped to them</option>
      <option value="each" disabled={!selected}
        >Each selected object in a file of its own (named after it)</option
      >
    </select>
  </div>

  <div class="field">
    <label for="export-size">Size</label>
    <select id="export-size" bind:value={sizeBy}>
      <option value="canvas">As it is ({doc.stage.width} × {doc.stage.height} px)</option>
      <option value="width">A width in pixels</option>
      <option value="height">A height in pixels</option>
      <option value="percent">A percentage</option>
      <option value="print">A printed width at a resolution</option>
    </select>
  </div>
  {#if sizeBy === 'width' || sizeBy === 'height'}
    <div class="field">
      <label for="export-px">{sizeBy === 'width' ? 'Width' : 'Height'}</label>
      <div class="row">
        <input id="export-px" type="number" min="1" step="1" bind:value={px} />
        <span class="unit">px, the other side in proportion</span>
      </div>
    </div>
  {:else if sizeBy === 'percent'}
    <div class="field">
      <label for="export-percent">Scale</label>
      <div class="row">
        <input id="export-percent" type="number" min="1" step="1" bind:value={percent} />
        <span class="unit">%</span>
      </div>
    </div>
  {:else if sizeBy === 'print'}
    <div class="field">
      <label for="export-print">Width</label>
      <div class="row">
        <input id="export-print" type="number" min="0.1" step="0.1" bind:value={printWidth} />
        <select aria-label="Printed width unit" bind:value={printUnit}>
          {#each UNITS.filter((u) => u !== 'px') as u (u)}<option value={u}>{u}</option>{/each}
        </select>
        <span class="unit">at</span>
        <input
          aria-label="Resolution"
          type="number"
          min="10"
          max="1200"
          step="1"
          bind:value={printDpi}
        />
        <span class="unit">dpi</span>
      </div>
    </div>
  {/if}

  {#if isBitmap}
    <div class="field">
      <label for="export-depth">Colour depth</label>
      <select
        id="export-depth"
        value={depth}
        onchange={(e) =>
          (depths = {
            ...depths,
            [format]: Number((e.currentTarget as HTMLSelectElement).value) as ColourDepth,
          })}
      >
        {#each depthsHeld as d (d)}<option value={d}>{DEPTH_NAMES[d]}</option>{/each}
      </select>
    </div>
    {#if depth <= 8}
      <div class="field">
        <label for="export-palette">Colours</label>
        <div class="row">
          <select id="export-palette" bind:value={palette}>
            <option value="colours">The image’s own {2 ** depth} colours (median cut)</option>
            <option value="greys">{2 ** depth} greys</option>
          </select>
          <label class="check"><input type="checkbox" bind:checked={dither} /> Dither</label>
        </div>
      </div>
      <p class="hint">
        Dithering mixes dots of the colours there are to look like those between; without it each
        pixel takes the nearest colour (flat bands).
      </p>
    {/if}
    {#if format === 'tiff'}
      <div class="field">
        <label for="export-tiff">Compression</label>
        <select id="export-tiff" bind:value={tiff}>
          <option value="lzw">LZW: lossless, a smaller file</option>
          <option value="none">None: every pixel stored, a larger file</option>
        </select>
      </div>
    {/if}
    {#if seeThrough && choosesTransparency}
      <label class="check">
        <input type="checkbox" bind:checked={transparent} /> Keep see-through parts
      </label>
    {/if}
    {#if seeThrough && depth < 32}
      <ColourField
        label="Background"
        value={background}
        commit={(c) => {
          background = c;
          return null;
        }}
      />
      <p class="hint">
        {#if keeps}
          A {format.toUpperCase()} pixel is see-through or not: one more than half see-through is left
          see-through, the rest are put on this colour{depth === 1
            ? '. At 1 bit, the see-through colour leaves room for only one other'
            : ''}.
        {:else}
          A {format.toUpperCase()} at {depth} bits {choosesTransparency
            ? 'without see-through parts'
            : 'cannot be see-through'}: transparent parts become this colour.
        {/if}
      </p>
    {/if}
  {/if}

  {#if format === 'jpg'}
    <div class="field">
      <label for="export-quality">Quality</label>
      <div class="row">
        <input id="export-quality" type="range" min="1" max="100" step="1" bind:value={quality} />
        <span class="unit">{quality}</span>
      </div>
    </div>
    <p class="hint">
      Lower quality makes a smaller file and loses more detail (lossy compression).
    </p>
    {#if doc.stage.background === TRANSPARENT || what !== 'image'}
      <ColourField
        label="Background"
        value={background}
        commit={(c) => {
          background = c;
          return null;
        }}
      />
      <p class="hint">A JPG cannot be see-through: transparent parts become this colour.</p>
    {/if}
  {/if}

  <p class="made" aria-live="polite">
    {#if result.error}
      <span class="error">{result.error}</span>
    {:else if format === 'pdf'}
      Vector shapes on {what === 'each' ? 'pages' : `a ${result.page} page`}, no margins: prints at
      exactly that size.
    {:else if format === 'svg'}
      Vector shapes{sizeBy === 'print'
        ? `, ${printWidth} ${printUnit} wide`
        : settings.units !== 'px' && sizeBy === 'canvas'
          ? `, at its printed size`
          : ''}: sharp at any size.
    {:else}
      {what === 'each' ? 'Each file' : 'The file'}{what === 'each' ? ' fits its object' : ''}:
      <b>{result.width} × {result.height} px</b> at {result.dpi} dpi{#if (isBitmap ? keeps : info.transparency) && seeThrough},
        see-through where nothing is drawn{/if}.
      {#if guess}<span class="size"
          >{sizeWords(guess)}{what === 'each' ? ' each' : ''} ({compressed}).</span
        >{/if}
    {/if}
  </p>
  <Why tool="graphicExport" />
  {#snippet buttons()}
    <button onclick={onclose}>Cancel</button>
    <button class="primary" disabled={!!result.error || busy} onclick={() => void run()}
      >Export…</button
    >
  {/snippet}
</Dialog>

<style>
  .bitmaps {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--warn, #e8590c);
  }
  .formats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 6px;
  }
  .format {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
  }
  .format.on {
    border-color: var(--accent);
  }
  .format span {
    color: var(--tx-3);
    margin-left: auto;
  }
  .about {
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--tx-2);
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
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .row input[type='number'] {
    width: 80px;
  }
  .row select {
    width: auto;
  }
  .unit {
    color: var(--tx-2);
    font-size: 12px;
  }
  .made {
    margin: 8px 0 4px;
    font-size: 12.5px;
  }
  .hint {
    margin: 0 0 6px;
    color: var(--tx-2);
    font-size: 11.5px;
  }
  .error {
    color: var(--danger);
    font-size: 12px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 6px 76px;
    font-size: 12px;
    white-space: nowrap;
  }
  .row .check {
    margin: 0;
  }
  .size {
    color: var(--tx-2);
  }
</style>
