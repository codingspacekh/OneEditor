<script lang="ts">
  // GL1, G11 (M23): the seven formats of syllabus 19.1 and which suits a scenario — choose one to
  // see the formats to use (and to avoid), and why.
  import {
    COLOUR_DEPTHS,
    FORMAT_INFO,
    GRAPHIC_FORMATS,
    type GraphicFormat,
  } from '../../../core/graphics/export.ts';
  import { SCENARIOS, advise, type Scenario } from '../../../core/teaching/graphics.ts';
  import LearnCard from '../LearnCard.svelte';

  let chosen: Scenario['id'] = $state('web-photo');
  const advice = $derived(advise(chosen));
  const name = (f: GraphicFormat) => FORMAT_INFO[f].extension.toUpperCase();
  const COMPRESSION = { lossless: 'Lossless', lossy: 'Lossy', none: 'None' } as const;
  const depths = (f: GraphicFormat) =>
    COLOUR_DEPTHS[f].length ? [...COLOUR_DEPTHS[f]].sort((a, b) => a - b).join(', ') : '—';
</script>

<LearnCard title="Which format?" icon="file" tag="19.1 suitability for a scenario">
  <div class="pick" role="group" aria-label="Scenarios">
    {#each SCENARIOS as s (s.id)}
      <button aria-pressed={chosen === s.id} onclick={() => (chosen = s.id)}>{s.label}</button>
    {/each}
  </div>
  <section class="advice" aria-label="Advice for {advice.label}">
    <h4>Use</h4>
    <ul>
      {#each advice.best as a (a.format)}
        <li class="plus"><b>{name(a.format)}</b> {a.why}</li>
      {/each}
    </ul>
    {#if advice.avoid.length}
      <h4>Avoid</h4>
      <ul>
        {#each advice.avoid as a (a.format)}
          <li class="minus"><b>{name(a.format)}</b> {a.why}</li>
        {/each}
      </ul>
    {/if}
  </section>
</LearnCard>

<LearnCard title="The seven formats" icon="export" tag="19.1 bitmap and vector file formats">
  <table>
    <thead>
      <tr>
        <th scope="col">Format</th>
        <th scope="col">Type</th>
        <th scope="col">Compression</th>
        <th scope="col">See-through</th>
        <th scope="col">Bits a pixel</th>
        <th scope="col">Good for, and not</th>
      </tr>
    </thead>
    <tbody>
      {#each GRAPHIC_FORMATS as f (f)}
        <tr>
          <th scope="row" title={FORMAT_INFO[f].label}>.{FORMAT_INFO[f].extension}</th>
          <td>{FORMAT_INFO[f].kind === 'vector' ? 'Vector' : 'Bitmap'}</td>
          <td class={FORMAT_INFO[f].compression}>{COMPRESSION[FORMAT_INFO[f].compression]}</td>
          <td>{FORMAT_INFO[f].transparency ? 'Yes' : 'No'}</td>
          <td class="mono">{depths(f)}</td>
          <td>{FORMAT_INFO[f].about}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="hint">
    Tip: never save over the original with a lossy format; export under a new name. Graphics ▸
    Export saves each of these.
  </p>
</LearnCard>

<style>
  .pick {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pick button {
    font-size: 11.5px;
  }
  .pick button[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--tx-1);
  }
  .advice h4 {
    margin: 12px 0 4px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--tx-3);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--tx-2);
  }
  li + li {
    margin-top: 4px;
  }
  li b {
    font-family: var(--mono);
    color: var(--tx-1);
    margin-right: 4px;
  }
  li::before {
    font-weight: 700;
    margin-right: 5px;
  }
  .plus::before {
    content: '✓';
    color: var(--success);
  }
  .minus::before {
    content: '✕';
    color: var(--danger);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
  }
  thead th {
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--tx-3);
    padding: 0 8px 6px 0;
    border-bottom: 1px solid var(--line-strong);
  }
  td,
  tbody th {
    padding: 6px 8px 6px 0;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
    color: var(--tx-2);
    line-height: 1.4;
    text-align: left;
  }
  tbody th {
    font-family: var(--mono);
    color: var(--tx-1);
    white-space: nowrap;
  }
  .mono {
    font-family: var(--mono);
    white-space: nowrap;
  }
  .lossy {
    color: var(--warn);
  }
  .lossless {
    color: var(--success);
  }
  .hint {
    margin: 8px 0 0;
    color: var(--tx-3);
    font-size: 11.5px;
  }
</style>
