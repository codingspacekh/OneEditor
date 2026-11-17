// issues/graphics-4.png (2026-11-17): Video's and Audio's side panels on the property grid
// (props.css) as Animation's and Graphics' Properties are — every field in the same columns, a
// box as wide as its column. Checked in the sources: each inspector lays its fields in .prop-row
// rows and its buttons in .prop-buttons rows, and the field components go into a row's columns.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI = join(import.meta.dirname, '../../../src/ui');
const source = (file: string) => readFileSync(join(UI, file), 'utf8');

describe('the property grid in Video and Audio', () => {
  it.each([
    'Inspector.svelte',
    'TextInspector.svelte',
    'ClipLookInspector.svelte',
    'OverlayInspector.svelte',
    'AudioInspector.svelte',
    'audio/AudioSidePanel.svelte',
  ])('%s lays its fields in .prop-row rows', (file) => {
    expect(source(file)).toMatch(/class="prop-row"/);
  });

  it.each([
    'Inspector.svelte',
    'ClipLookInspector.svelte',
    'OverlayInspector.svelte',
    'AudioInspector.svelte',
  ])('%s puts its buttons in even .prop-buttons rows', (file) => {
    expect(source(file)).toMatch(/class="prop-buttons/);
  });

  it.each(['NumberField.svelte', 'PercentField.svelte', 'TimeField.svelte'])(
    '%s lays its label and box into a row’s columns, the box as wide as its column',
    (file) => {
      const s = source(file);
      expect(s).toMatch(/:global\(\.prop-row\) > \.field \{\s*display: contents;/);
      expect(s).toMatch(/:global\(\.prop-row\) > \.field > \.box \{\s*width: 100%;/);
    },
  );

  it('the effects’ settings use the grid’s four columns', () => {
    expect(source('EffectParams.svelte')).toMatch(/grid-template-columns: var\(--prop-cols\)/);
  });
});
