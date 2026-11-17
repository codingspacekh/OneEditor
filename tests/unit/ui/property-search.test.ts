// Property search (the teacher's request, 2026-11-15, as Roblox Studio's Properties filter): in a
// property panel, typing shows only the settings whose words match — a section whose heading
// matches shows whole; a section with nothing matching is hidden; empty shows everything.
import { beforeEach, describe, expect, it } from 'vitest';
import { filterProperties } from '../../../src/ui/property-search.ts';

let root: HTMLElement;
/** The element whose own words are `text` shows (nothing around it is filtered). */
const shown = (text: string) => {
  const el = [...root.querySelectorAll<HTMLElement>('*')].find((e) =>
    [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() === text),
  )!;
  return el.closest('[data-filtered]') === null;
};

beforeEach(() => {
  root = document.createElement('div');
  root.innerHTML = `
    <div class="head">Rectangle</div>
    <div class="sec">
      <h4>Rectangle <span>20.1 object properties</span></h4>
      <div class="two">
        <div class="field"><label>X</label><input /></div>
        <div class="field"><label>Opacity</label><input /></div>
      </div>
      <label class="check"><input type="checkbox" /> Lock proportions</label>
      <p class="hint">Typed values apply when you leave the box.</p>
    </div>
    <section>
      <h3>Fade</h3>
      <div class="field"><label>Fade in</label><input /></div>
      <div role="radiogroup"><span>Fade to</span><label><input type="radio" />Black</label></div>
    </section>
    <div class="sec">
      <h4>Arrange</h4>
      <div class="line"><span>Order</span><button aria-label="Bring forward"></button></div>
    </div>`;
});

describe('property search', () => {
  it('empty shows everything', () => {
    expect(filterProperties(root, '  ')).toBe(-1);
    expect(root.querySelectorAll('[data-filtered]')).toHaveLength(0);
  });

  it('shows only the matching settings, with their heading; capitals do not matter', () => {
    expect(filterProperties(root, 'OPAC')).toBe(1);
    expect(shown('Opacity')).toBe(true);
    expect(shown('X')).toBe(false);
    expect(shown('Lock proportions')).toBe(false);
    expect(shown('Typed values apply when you leave the box.')).toBe(false);
    expect(shown('Rectangle')).toBe(true); // the head above the sections stays
    expect(shown('Fade in')).toBe(false);
    expect(shown('Order')).toBe(false);
  });

  it('a heading that matches shows its whole section; a button is found by its name', () => {
    expect(filterProperties(root, 'fade')).toBeGreaterThan(0);
    expect(shown('Fade in')).toBe(true);
    expect(shown('Black')).toBe(true);
    expect(shown('Opacity')).toBe(false);
    filterProperties(root, 'forward');
    expect(shown('Order')).toBe(true);
    expect(shown('Fade in')).toBe(false);
  });

  it('every word must match; nothing matching hides every section; clearing shows all again', () => {
    expect(filterProperties(root, 'lock prop')).toBe(1);
    expect(shown('Lock proportions')).toBe(true);
    expect(filterProperties(root, 'zzz')).toBe(0);
    expect(root.querySelectorAll('.sec[data-filtered], section[data-filtered]')).toHaveLength(3);
    filterProperties(root, '');
    expect(root.querySelectorAll('[data-filtered]')).toHaveLength(0);
  });
});
