// AN6: a Properties number box is never narrower than its numbers need (whole degrees narrower
// than lengths with two decimals; on its own, in a dialog, it grows with a longer value:
// field-sizing), so its label keeps the room on the left; the number sits on the right of the
// box, next to its unit. In a properties row (props.css) it is as wide as its column, so the
// boxes line up (issues/graphics-4.png).
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NumField from '../../../src/ui/animation/NumField.svelte';

const box = (label: string) => screen.getByLabelText(label, { exact: true }) as HTMLInputElement;
const commit = () => null;

describe('NumField (AN6)', () => {
  it('is never narrower than its numbers: 4 characters for whole numbers, 5 with one decimal, 7 with two', () => {
    render(NumField, { props: { label: 'Rotation', value: 90, unit: '°', commit } });
    render(NumField, { props: { label: 'Turn', value: 50, unit: '%', decimals: 1, commit } });
    render(NumField, { props: { label: 'X', value: 384, unit: 'px', decimals: 2, commit } });
    expect(box('Rotation').style.minWidth).toBe('4.5ch');
    expect(box('Turn').style.minWidth).toBe('5.5ch');
    expect(box('X').style.minWidth).toBe('7.5ch');
  });

  it('shows a longer value whole (the box grows with it, not a fixed width)', () => {
    render(NumField, { props: { label: 'Width', value: -123456.25, decimals: 2, commit } });
    expect(box('Width').value).toBe('-123456.25');
    expect(box('Width').style.width).toBe('');
  });

  it('lays its label and box into a properties row: two in a row make a pair', () => {
    const row = document.createElement('div');
    row.className = 'prop-row';
    document.body.append(row);
    render(NumField, { target: row, props: { label: 'Y', value: 1, commit } });
    render(NumField, { target: row, props: { label: 'H', value: 2, commit } });
    // Each field's label and box are its own two children (display: contents in a row).
    expect(row.querySelectorAll(':scope > .field')).toHaveLength(2);
    expect(row.querySelectorAll(':scope > .field > label')).toHaveLength(2);
  });
});
