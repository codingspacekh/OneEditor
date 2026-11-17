// The property grid (issues/graphics-1.png, graphics-4.png, 2026-11-17): every row of the
// Properties panel on the same four columns (props.css), so the fields of every section line
// up; a lone button fills its row ("Make an arc"); the quick effect buttons show their names
// alone (no "+" wrapping above them); the Image section's buttons are one even grid.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (path: string) => readFileSync(`src/ui/${path}`, 'utf8');
const markup = (path: string) => src(path).split('<style>')[0]!;

describe('the property grid', () => {
  it('is one set of four columns for every row, from props.css', () => {
    const css = src('props.css');
    expect(css).toMatch(/--prop-cols:/);
    expect(css).toMatch(/\.prop-row \{[^}]*grid-template-columns: var\(--prop-cols\)/);
    expect(css).toMatch(/\.prop-buttons > :only-child \{[^}]*grid-column: 1 \/ -1/);
    expect(src('main.ts')).toMatch(/import '\.\/props\.css';/);
  });

  it('is used by the Properties panel and its sections, with no old two-column boxes left', () => {
    for (const file of [
      'animation/PropertiesPanel.svelte',
      'animation/ArcSection.svelte',
      'animation/FiltersSection.svelte',
      'animation/AlignSection.svelte',
      'animation/NodeSection.svelte',
      'graphics/PaintSection.svelte',
      'graphics/PixelTransformSection.svelte',
    ]) {
      const m = markup(file);
      expect(m, file).toMatch(/class="prop-(row|buttons)/);
      expect(m, file).not.toMatch(/class="(two|cells[^"]*|line)"/);
    }
  });

  it('gives "Make an arc" a row of its own, which it fills', () => {
    const m = markup('animation/ArcSection.svelte');
    const before = m.slice(0, m.indexOf('>Make an arc'));
    // The nearest opening before the button is the lone-button row.
    expect(before.lastIndexOf('<div class="prop-buttons">')).toBeGreaterThan(
      before.lastIndexOf('</div>'),
    );
  });

  it('shows the quick effects by name alone, no "+"', () => {
    const m = markup('animation/FiltersSection.svelte');
    expect(m).toMatch(/aria-label="Add quickly"/);
    expect(m).not.toMatch(/>\+ \{q\.label\}/);
    expect(m).toMatch(/>\{q\.label\}<\/button/);
  });

  it('puts the Image section buttons in one grid (the same gap between every row)', () => {
    const m = markup('animation/PropertiesPanel.svelte');
    const image = m.slice(m.indexOf('aria-label="Image"'));
    for (const name of [
      'Image settings…',
      'Fit to drawing',
      'Image size…',
      'Canvas size…',
      'Crop to content',
      'Trim plain edges',
      'Reduce colours…',
    ])
      expect(image.indexOf(name), name).toBeLessThan(image.indexOf('</div>'));
  });
});
