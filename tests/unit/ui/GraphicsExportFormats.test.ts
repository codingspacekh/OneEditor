// M23 / G11, GC2: the Export image dialog's bitmap choices — GIF, BMP and TIFF beside PNG and JPG,
// each labelled lossless, lossy or uncompressed with the file's estimated size; a colour depth the
// format holds; at 8 bits or fewer the palette (the image's colours or greys) and dithering;
// see-through parts kept or put on a background colour; TIFF compression — remembered for next
// time, and the file made by our writers.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import { animUi } from '../../../src/ui/animation/animation-ui.svelte.ts';
import { webCompression } from '../../../src/core/image/deflate.ts';
import { decodeBitmap } from '../../../src/core/image/decode/index.ts';
import { testApp } from '../../helpers/test-app.ts';

async function exportDialog(transparent = true) {
  animUi.dialog = null;
  animUi.graphicFormat = 'png';
  animUi.graphicDepths = {};
  animUi.graphicPalette = 'colours';
  animUi.graphicDither = true;
  animUi.graphicTransparent = true;
  animUi.graphicTiff = 'lzw';
  const t = testApp();
  render(App, { props: { app: t.app } });
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('button', {
      name: 'Graphics',
    }),
  );
  const g = t.app.graphics;
  g.setImage({ width: 200, height: 100, ...(transparent ? { background: 'none' } : {}) });
  await tick();
  const open = async () => {
    await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    return within(screen.getByRole('dialog', { name: 'Export image' }));
  };
  const exported = async (d: Awaited<ReturnType<typeof open>>, path: string) => {
    t.dialogs.exportGraphic.mockResolvedValueOnce(path);
    await fireEvent.click(d.getByRole('button', { name: 'Export…' }));
    await new Promise((r) => setTimeout(r, 0));
    await tick();
    return decodeBitmap(t.bytes.get(path)!, webCompression);
  };
  return { ...t, g, open, exported };
}

const made = (d: ReturnType<typeof within>) => d.getByText(/The file/).textContent ?? '';

describe('G11 (M23): Export image as GIF, BMP or TIFF at a colour depth', () => {
  it('labels each format lossless, lossy, uncompressed or vector', async () => {
    const s = await exportDialog();
    const d = await s.open();
    for (const [f, word] of [
      ['PNG', 'lossless'],
      ['JPG', 'lossy'],
      ['GIF', 'lossless'],
      ['BMP', 'uncompressed'],
      ['TIFF', 'lossless'],
      ['SVG', 'vector'],
    ])
      expect(d.getByRole('radio', { name: new RegExp(`${f} ${word}`) })).toBeTruthy();
    // A 32-bit PNG keeps see-through parts: no background to choose, and about its size.
    expect(d.getByLabelText('Colour depth')).toBeTruthy();
    expect(d.queryByLabelText('Background')).toBeNull();
    expect(made(d)).toMatch(
      /see-through where nothing is drawn\.\s*about [\d.]+ KB \(lossless compression\)/,
    );
  });

  it('GIF: 8, 4 or 1 bits, its own colours or greys, dithered or not, see-through kept or not', async () => {
    const s = await exportDialog();
    const d = await s.open();
    await fireEvent.click(d.getByRole('radio', { name: /GIF/ }));
    const depth = d.getByLabelText('Colour depth') as HTMLSelectElement;
    expect([...depth.options].map((o) => o.value)).toEqual(['8', '4', '1']);
    expect(d.getByLabelText('Colours')).toBeTruthy();
    expect(d.getByText(/one more than half see-through is left see-through/)).toBeTruthy();
    await fireEvent.change(depth, { target: { value: '1' } });
    expect(d.getByText(/room for only one other/)).toBeTruthy();
    await fireEvent.change(depth, { target: { value: '4' } });
    await fireEvent.change(d.getByLabelText('Colours'), { target: { value: 'greys' } });
    await fireEvent.click(d.getByLabelText('Dither'));
    await fireEvent.click(d.getByLabelText('Keep see-through parts'));
    expect(d.getByText(/A GIF at 4 bits without see-through parts/)).toBeTruthy();
    await fireEvent.change(d.getByLabelText('Background'), { target: { value: '#000000' } });
    const back = await s.exported(d, '/work/Logo.gif');
    expect(back).toMatchObject({ format: 'gif', width: 200, height: 100 });
    // Nothing drawn: the background chosen (here, its grey), not see-through.
    expect(back.data[3]).toBe(255);
    expect(animUi.graphicDepths.gif).toBe(4);
    expect(animUi).toMatchObject({
      graphicFormat: 'gif',
      graphicPalette: 'greys',
      graphicDither: false,
      graphicTransparent: false,
    });
    // Remembered next time.
    const again = await s.open();
    expect((again.getByLabelText('Colour depth') as HTMLSelectElement).value).toBe('4');
  });

  it('1 bit is black and white, dithered, unless the image’s own two colours are chosen', async () => {
    const s = await exportDialog(false);
    s.g.setImage({ background: '#ffffff' });
    s.g.addShape('ellipse', { x: 50, y: 20, width: 100, height: 60 });
    s.g.setProperties({ fill: { kind: 'solid', colour: '#e8302c' } });
    s.g.select([]);
    await tick();
    const d = await s.open();
    await fireEvent.click(d.getByRole('radio', { name: /BMP/ }));
    await fireEvent.change(d.getByLabelText('Colour depth'), { target: { value: '1' } });
    const colours = d.getByLabelText('Colours') as HTMLSelectElement;
    expect(colours.value).toBe('greys');
    expect(colours.selectedOptions[0]!.textContent).toMatch(/Black and white/);
    // The 8-bit choice of the image's own colours is kept for 4 and 8 bits.
    await fireEvent.change(d.getByLabelText('Colour depth'), { target: { value: '8' } });
    expect((d.getByLabelText('Colours') as HTMLSelectElement).value).toBe('colours');
    await fireEvent.change(d.getByLabelText('Colour depth'), { target: { value: '1' } });
    s.stageRenderer.renderPixels.mockResolvedValueOnce({
      width: 4,
      height: 1,
      data: new Uint8ClampedArray([
        232, 48, 44, 255, 255, 255, 255, 255, 0, 0, 0, 255, 20, 20, 20, 255,
      ]),
    });
    const back = await s.exported(d, '/work/Mono.bmp');
    const seen = new Set<string>();
    for (let i = 0; i < back.data.length; i += 4) seen.add(back.data.subarray(i, i + 3).join());
    expect([...seen].every((c) => c === '0,0,0' || c === '255,255,255')).toBe(true);
    expect(back.data.subarray(4, 7).join()).toBe('255,255,255');
  });

  it('BMP: 24 bits on a background, its size exactly; 32 keeps see-through parts', async () => {
    const s = await exportDialog();
    const d = await s.open();
    await fireEvent.click(d.getByRole('radio', { name: /BMP/ }));
    expect((d.getByLabelText('Colour depth') as HTMLSelectElement).value).toBe('24');
    expect(d.getByText(/A BMP at 24 bits cannot be see-through/)).toBeTruthy();
    // 200 px × 3 bytes = 600 a row, 100 rows, and the 54-byte header.
    expect(made(d)).toMatch(/60\.1 KB \(not compressed\)/);
    expect(made(d)).not.toMatch(/about/);
    await fireEvent.change(d.getByLabelText('Colour depth'), { target: { value: '32' } });
    expect(d.queryByLabelText('Background')).toBeNull();
    expect(made(d)).toMatch(/see-through where nothing is drawn/);
    const back = await s.exported(d, '/work/Logo.bmp');
    expect(back).toMatchObject({ format: 'bmp', width: 200, height: 100, dpi: 96 });
  });

  it('TIFF: LZW or no compression; 8 bits of greys', async () => {
    const s = await exportDialog(false);
    const d = await s.open();
    await fireEvent.click(d.getByRole('radio', { name: /TIFF/ }));
    expect(made(d)).toMatch(/\(lossless compression\)/);
    await fireEvent.change(d.getByLabelText('Compression'), { target: { value: 'none' } });
    expect(made(d)).toMatch(/\(not compressed\)/);
    await fireEvent.change(d.getByLabelText('Colour depth'), { target: { value: '8' } });
    await fireEvent.change(d.getByLabelText('Colours'), { target: { value: 'greys' } });
    // An image with a background: nothing see-through to keep or put on a colour.
    expect(d.queryByLabelText('Keep see-through parts')).toBeNull();
    expect(d.queryByLabelText('Background')).toBeNull();
    const back = await s.exported(d, '/work/Scan.tif');
    expect(back.format).toBe('tiff');
    expect(animUi.graphicTiff).toBe('none');
  });

  it('the size of each file for each object; none while the size typed cannot be made', async () => {
    const s = await exportDialog();
    s.g.addShape('rect', { x: 0, y: 0, width: 50, height: 40 });
    s.g.addShape('rect', { x: 100, y: 0, width: 20, height: 20 });
    s.g.select(s.g.store.get().history.present.layers[0]!.objects.map((o) => o.id));
    await tick();
    const d = await s.open();
    await fireEvent.click(d.getByRole('radio', { name: /BMP/ }));
    await fireEvent.change(d.getByLabelText('Export'), { target: { value: 'each' } });
    expect(d.getByText(/Each file/).textContent).toMatch(/KB each \(not compressed\)/);
    await fireEvent.change(d.getByLabelText('Size'), { target: { value: 'percent' } });
    await fireEvent.input(d.getByLabelText('Scale'), { target: { value: '0' } });
    expect(d.queryByText(/KB each/)).toBeNull();
  });

  it('a JPG keeps its quality and background; vector formats have no colour depth', async () => {
    const s = await exportDialog();
    const d = await s.open();
    await fireEvent.click(d.getByRole('radio', { name: /JPG/ }));
    expect(d.queryByLabelText('Colour depth')).toBeNull();
    expect(made(d)).toMatch(/about .* \(lossy compression\)/);
    await fireEvent.click(d.getByRole('radio', { name: /SVG/ }));
    expect(d.queryByLabelText('Colour depth')).toBeNull();
  });
});
