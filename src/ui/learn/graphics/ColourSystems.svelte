<script lang="ts">
  // G9 (M23): colour systems — red, green and blue light added on black (RGB), cyan, magenta and
  // yellow ink taking light away on white paper (CMYK), the HSL wheel; the colour last mixed shown
  // in every system; and what a colour matching system (CMS) is, with the eyedropper.
  import { cmykToHex, hslToHex, rgbToHex } from '../../../core/colour.ts';
  import {
    COLOUR_TOPICS,
    MATCHING_SWATCHES,
    additiveMix,
    colourCodes,
    hueWheel,
    subtractiveMix,
  } from '../../../core/teaching/graphics.ts';
  import LearnCard from '../LearnCard.svelte';
  import Topics from './Topics.svelte';

  let rgb = $state({ r: 255, g: 255, b: 255 });
  let ink = $state({ c: 100, m: 100, y: 100, k: 0 });
  let hsl = $state({ h: 100, s: 50, l: 50 });
  let from: 'RGB light' | 'CMYK ink' | 'the HSL wheel' | 'the eyedropper' = $state('RGB light');
  let picked = $state('#c8102e');

  const light = $derived(additiveMix(rgb));
  const inks = $derived(subtractiveMix(ink));
  const current = $derived(
    from === 'RGB light'
      ? rgbToHex(rgb)
      : from === 'CMYK ink'
        ? cmykToHex(ink)
        : from === 'the HSL wheel'
          ? hslToHex(hsl)
          : picked,
  );
  const codes = $derived(colourCodes(current));
  const wheel = `conic-gradient(from 90deg, ${hueWheel(12).join(', ')}, ${hueWheel(1)[0]})`;

  const LIGHTS = [
    ['r', 'Red'],
    ['g', 'Green'],
    ['b', 'Blue'],
  ] as const;
  const INKS = [
    ['c', 'Cyan'],
    ['m', 'Magenta'],
    ['y', 'Yellow'],
    ['k', 'Black (K)'],
  ] as const;
  const HSL = [
    ['h', 'Hue', 360, '°'],
    ['s', 'Saturation', 100, '%'],
    ['l', 'Lightness', 100, '%'],
  ] as const;
  /** The eyedropper's picture: a red car on a road by the sea. */
  const SCENE = [
    { name: 'sky', label: 'sky', hex: '#8ecae6' },
    { name: 'sea', label: 'sea', hex: '#1d6fa3' },
    { name: 'grass', label: 'grass', hex: '#4c9a2a' },
    { name: 'car', label: 'car’s red', hex: '#c8102e' },
    { name: 'tyre', label: 'tyres', hex: '#222222' },
    { name: 'road', label: 'road', hex: '#6b6b6b' },
  ];
</script>

<div class="mixers">
  <LearnCard title="RGB: light added" icon="sparkles" tag="19.1 RGB">
    <svg
      viewBox="0 0 120 110"
      role="img"
      aria-label="Red, green and blue light overlapping on black"
    >
      <rect width="120" height="110" fill="#000000" />
      <g style:isolation="isolate">
        <circle cx="45" cy="42" r="30" fill={light.r} style:mix-blend-mode="screen" />
        <circle cx="75" cy="42" r="30" fill={light.g} style:mix-blend-mode="screen" />
        <circle cx="60" cy="68" r="30" fill={light.b} style:mix-blend-mode="screen" />
      </g>
    </svg>
    {#each LIGHTS as [key, name] (key)}
      <label class="slider">
        <span>{name}</span>
        <input
          type="range"
          min="0"
          max="255"
          aria-label="{name} light"
          bind:value={rgb[key]}
          oninput={() => (from = 'RGB light')}
        />
        <span class="v">{rgb[key]}</span>
      </label>
    {/each}
    <ul class="mix" aria-label="Where the lights overlap">
      <li><i style:background={light.rg}></i>red + green</li>
      <li><i style:background={light.gb}></i>green + blue</li>
      <li><i style:background={light.rb}></i>red + blue</li>
      <li><i style:background={light.rgb}></i>all three</li>
    </ul>
  </LearnCard>

  <LearnCard title="CMYK: ink taken away" icon="bucket" tag="19.1 CMYK">
    <svg
      viewBox="0 0 120 110"
      role="img"
      aria-label="Cyan, magenta and yellow ink overlapping on white paper"
    >
      <rect width="120" height="110" fill="#ffffff" />
      <g style:isolation="isolate">
        <circle cx="45" cy="42" r="30" fill={inks.c} style:mix-blend-mode="multiply" />
        <circle cx="75" cy="42" r="30" fill={inks.m} style:mix-blend-mode="multiply" />
        <circle cx="60" cy="68" r="30" fill={inks.y} style:mix-blend-mode="multiply" />
      </g>
    </svg>
    {#each INKS as [key, name] (key)}
      <label class="slider">
        <span>{name}</span>
        <input
          type="range"
          min="0"
          max="100"
          aria-label="{name} ink"
          bind:value={ink[key]}
          oninput={() => (from = 'CMYK ink')}
        />
        <span class="v">{ink[key]} %</span>
      </label>
    {/each}
    <ul class="mix" aria-label="Where the inks overlap">
      <li><i style:background={inks.cm}></i>cyan + magenta</li>
      <li><i style:background={inks.my}></i>magenta + yellow</li>
      <li><i style:background={inks.cy}></i>cyan + yellow</li>
      <li><i style:background={cmykToHex(ink)}></i>all, with {ink.k} % black</li>
    </ul>
  </LearnCard>

  <LearnCard title="HSL: the colour wheel" icon="graphics" tag="19.1 HSL">
    <div class="wheel" style:background={wheel} role="img" aria-label="The hue wheel at {hsl.h}°">
      <span class="marker" style:transform="rotate({hsl.h}deg)"><b></b></span>
      <span class="hub" style:background={hslToHex(hsl)}></span>
    </div>
    {#each HSL as [key, name, max, unit] (key)}
      <label class="slider">
        <span>{name}</span>
        <input
          type="range"
          min="0"
          {max}
          aria-label={name}
          bind:value={hsl[key]}
          oninput={() => (from = 'the HSL wheel')}
        />
        <span class="v">{hsl[key]}{unit === '°' ? '°' : ' %'}</span>
      </label>
    {/each}
    <p class="hint">The coursebook’s example: hue 100, 50 % saturation, 50 % lightness.</p>
  </LearnCard>
</div>

<div class="two">
  <LearnCard title="The same colour in each system" icon="info" tag="19.1 colour systems">
    <div class="same">
      <span class="swatch" style:background={codes.hex} aria-hidden="true"></span>
      <dl aria-label="The colour in each system">
        <dt>Hex</dt>
        <dd>{codes.text.hex}</dd>
        <dt>RGB</dt>
        <dd>{codes.text.rgb}</dd>
        <dt>HSL</dt>
        <dd>{codes.text.hsl}</dd>
        <dt>CMYK</dt>
        <dd>{codes.text.cmyk}</dd>
      </dl>
    </div>
    <p class="hint">
      From {from}. The screen always shows RGB; the CMYK numbers are what a printer would mix (with
      no printer’s colour profile, so a real press differs a little).
    </p>
    <Topics topics={COLOUR_TOPICS.slice(0, 3)} />
  </LearnCard>

  <LearnCard title="CMS: colour matching" icon="search" tag="19.1 CMS">
    <Topics topics={COLOUR_TOPICS.slice(3)} />
    <h4>The eyedropper: match a colour from a picture</h4>
    <div class="scene" role="group" aria-label="A picture to pick colours from">
      {#each SCENE as part (part.name)}
        <button
          class={part.name}
          style:background={part.hex}
          aria-label="Pick the {part.label}"
          title="Pick the {part.label}"
          onclick={() => {
            picked = part.hex;
            from = 'the eyedropper';
          }}
        ></button>
      {/each}
    </div>
    <p class="match" role="status" aria-label="Colour picked">
      <span class="dot" style:background={picked} aria-hidden="true"></span>
      Picked {colourCodes(picked).text.hex} — {colourCodes(picked).text.rgb}, {colourCodes(picked)
        .text.cmyk}: a new shape filled with these numbers matches exactly.
    </p>
    <h4>A swatch book (example numbers)</h4>
    <ul class="book" aria-label="Matching swatches">
      {#each MATCHING_SWATCHES as s (s.code)}
        <li>
          <span class="chip" style:background={s.hex} aria-hidden="true"></span>
          <b>{s.code}</b>
          <span>{s.name}</span>
          <span class="recipe">C {s.cmyk.c} M {s.cmyk.m} Y {s.cmyk.y} K {s.cmyk.k}</span>
        </li>
      {/each}
    </ul>
  </LearnCard>
</div>

<style>
  .mixers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-top: 16px;
  }
  svg {
    display: block;
    width: 100%;
    max-width: 200px;
    margin: 0 auto 8px;
    border-radius: 6px;
    border: 1px solid var(--line);
  }
  .slider {
    display: grid;
    grid-template-columns: 74px 1fr 46px;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--tx-2);
  }
  .v {
    font-family: var(--mono);
    text-align: right;
  }
  .mix {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 8px;
    font-size: 11px;
    color: var(--tx-3);
  }
  .mix li,
  .match,
  .book li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mix i,
  .chip,
  .dot {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid var(--line-strong);
  }
  .wheel {
    position: relative;
    width: 150px;
    height: 150px;
    margin: 0 auto 10px;
    border-radius: 50%;
  }
  .marker {
    position: absolute;
    inset: 0;
  }
  .marker b {
    position: absolute;
    top: -3px;
    left: calc(50% - 5px);
    width: 10px;
    height: 16px;
    border-radius: 3px;
    border: 2px solid #ffffff;
    box-shadow: 0 0 0 1px #000000;
  }
  .hub {
    position: absolute;
    inset: 32px;
    border-radius: 50%;
    border: 3px solid var(--bg-1);
  }
  .same {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .swatch {
    width: 64px;
    height: 64px;
    border-radius: 8px;
    border: 1px solid var(--line-strong);
    flex: none;
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    font-size: 12px;
  }
  dt {
    color: var(--tx-3);
  }
  dd {
    margin: 0;
    font-family: var(--mono);
    color: var(--tx-1);
  }
  .hint {
    margin: 8px 0 12px;
    color: var(--tx-3);
    font-size: 11.5px;
    line-height: 1.45;
  }
  h4 {
    margin: 14px 0 6px;
    font-size: 12.5px;
  }
  .scene {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    grid-template-rows: 26px 22px 30px 14px 18px;
    gap: 0;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--line);
  }
  .scene button {
    border: 0;
    border-radius: 0;
    padding: 0;
    font-size: 0;
    min-height: 0;
    cursor: crosshair;
  }
  .scene button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .sky {
    grid-column: 1 / -1;
    grid-row: 1;
  }
  .sea {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .grass {
    grid-column: 1 / 2;
    grid-row: 3 / 5;
  }
  .car {
    grid-column: 2 / -1;
    grid-row: 3;
  }
  .tyre {
    grid-column: 2 / -1;
    grid-row: 4;
  }
  .road {
    grid-column: 1 / -1;
    grid-row: 5;
  }
  .match {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--tx-2);
    line-height: 1.45;
  }
  .book {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
    font-size: 11.5px;
    color: var(--tx-2);
  }
  .book b {
    font-family: var(--mono);
    color: var(--tx-1);
  }
  .recipe {
    margin-left: auto;
    color: var(--tx-3);
    font-family: var(--mono);
    font-size: 10.5px;
  }
</style>
