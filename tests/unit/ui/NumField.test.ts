// AN6: a Properties number box is as wide as its numbers need (whole degrees narrower than
// lengths with two decimals, wider when a value is longer), so its label keeps the room on the
// left; the number sits on the right of the box, next to its unit.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NumField from '../../../src/ui/animation/NumField.svelte';

const box = (label: string) => screen.getByLabelText(label, { exact: true }) as HTMLInputElement;
const commit = () => null;

describe('NumField (AN6)', () => {
  it('fits its numbers: 4 characters for whole numbers, 5 with one decimal, 7 with two', () => {
    render(NumField, { props: { label: 'Rotation', value: 90, unit: '°', commit } });
    render(NumField, { props: { label: 'Turn', value: 50, unit: '%', decimals: 1, commit } });
    render(NumField, { props: { label: 'X', value: 384, unit: 'px', decimals: 2, commit } });
    expect(box('Rotation').style.width).toBe('4.5ch');
    expect(box('Turn').style.width).toBe('5.5ch');
    expect(box('X').style.width).toBe('7.5ch');
  });

  it('grows for a longer value, and keeps the number on the right', () => {
    render(NumField, { props: { label: 'Width', value: -123456.25, decimals: 2, commit } });
    expect(box('Width').value).toBe('-123456.25');
    expect(box('Width').style.width).toBe('10.5ch');
  });
});
