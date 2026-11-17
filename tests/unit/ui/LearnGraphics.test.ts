// Learn ▸ Graphics (GL1, G9, G10, GC1, M23): bitmap and vector, resolution and print size, colour
// systems, the file formats for a scenario, compression on the student's own picture, bitmap to
// vector, image editing and society. The picture's codec and writers are fakes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../../src/ui/App.svelte';
import GraphicsLearn from '../../../src/ui/learn/graphics/GraphicsLearn.svelte';
import PixelView from '../../../src/ui/learn/graphics/PixelView.svelte';
import { graphicsLearn } from '../../../src/ui/learn/graphics/graphics-learn-ui.svelte.ts';
import { paint } from '../../../src/ui/learn/graphics/pixels.ts';
import { createGraphicsLearnApp } from '../../../src/app/learn-graphics.ts';
import { createAnimation } from '../../../src/core/animation/factory.ts';
import { EditError } from '../../../src/core/model/errors.ts';
import type { RgbaImage } from '../../../src/core/image/encode/index.ts';
import type { PictureCodec } from '../../../src/core/teaching/graphics.ts';
import { menuActions } from '../../../src/ui/menu-actions.ts';
import { ui } from '../../../src/ui/ui-state.svelte.ts';
import { testApp } from '../../helpers/test-app.ts';

const card = (name: string) => screen.getByRole('region', { name });
const page = async (name: string) => {
  await fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Graphics topics' })).getByRole('button', {
      name,
    }),
  );
};

function photo(width = 60, height = 40): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i / 4) % 256;
    data[i + 1] = 120;
    data[i + 2] = 30;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/** A fake codec: a JPEG is 100 + quality bytes and opens with red 5 levels lower. */
function codec(): PictureCodec {
  const opened = photo();
  return {
    jpeg: async (image, quality) => {
      const b = new Uint8Array(100 + quality);
      b[0] = 1;
      return b;
    },
    decode: async (bytes) => {
      if (bytes[0] === 1) {
        const data = new Uint8ClampedArray(opened.data);
        for (let i = 0; i < data.length; i += 4) data[i] = data[i]! - 5;
        return { image: { ...opened, data }, width: 60, height: 40 };
      }
      return { image: opened, width: 3000, height: 2000 };
    },
  };
}

function renderPage(options: { tiffReady?: boolean } = {}) {
  const dialogs = { openPicture: vi.fn(async (): Promise<string | null> => '/papers/Beach.jpg') };
  const learn = createGraphicsLearnApp({
    dialogs,
    files: { readBytes: async () => new Uint8Array(2_400_000) },
    renderer: { renderPng: async () => new Uint8Array([2]) },
    graphic: () => createAnimation({ name: 'Logo' }),
    codec: codec(),
    encode: async (format, _image, o) => {
      if (format === 'tiff' && !options.tiffReady)
        throw new EditError('Saving as TIFF is not ready yet.');
      return new Uint8Array(format === 'bmp' ? 7200 : 1000 + o.depth);
    },
    decodeFile: async () => photo(),
    compression: { deflate: async (d) => d, inflate: async (d) => d },
  });
  render(GraphicsLearn, { props: { learn } });
  return { learn, dialogs };
}

afterEach(() => {
  ui.mode = 'Video';
  ui.learnTab = 'inspect';
  graphicsLearn.page = 'bitmap';
});

describe('GL1 (M23) Learn ▸ Graphics', () => {
  it('opens from the Learn menu as its own tab, with its seven pages', async () => {
    const t = testApp();
    render(App, { props: { app: t.app } });
    ui.mode = 'Graphics';
    menuActions(t.app).learnGraphics();
    await tick();
    expect(screen.getByRole('tab', { name: 'Graphics' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    const nav = screen.getByRole('navigation', { name: 'Graphics topics' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent!.trim()),
    ).toEqual([
      'Bitmap and vector',
      'Resolution and print size',
      'Colour systems',
      'File formats',
      'Compression',
      'Bitmap to vector',
      'Image editing and society',
    ]);
    expect(
      within(nav).getByRole('button', { name: 'Bitmap and vector' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(card('Bitmap and vector')).toBeTruthy();
    // The compression page runs on the app's own Learn ▸ Graphics.
    await page('Compression');
    expect(card('Your picture')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Back to Graphics' }));
    expect(ui.mode).toBe('Graphics');
  });

  it('the page last seen stays chosen', async () => {
    renderPage();
    await page('File formats');
    expect(graphicsLearn.page).toBe('formats');
    expect(card('Which format?')).toBeTruthy();
  });
});

describe('GL1 G10 (M23) bitmap and vector', () => {
  it('zooming in pixelates the bitmap; the vector stays sharp', async () => {
    renderPage();
    const box = card('Bitmap and vector');
    expect(within(box).getByRole('status').textContent).toMatch(/both look the same/);
    await fireEvent.input(within(box).getByLabelText('Zoom'), { target: { value: '2' } });
    expect(within(box).getByRole('status').textContent).toMatch(/stepped/);
    await fireEvent.input(within(box).getByLabelText('Zoom'), { target: { value: '8' } });
    const bitmap = within(box).getByRole('img', { name: 'The star as a bitmap at 8 ×' });
    expect(bitmap.getAttribute('viewBox')).toMatch(/ 2 2$/);
    // The pixel grid shows when the squares are big.
    expect(bitmap.querySelectorAll('line').length).toBeGreaterThan(0);
    expect(within(box).getByRole('img', { name: 'The star as a vector at 8 ×' })).toBeTruthy();
    expect(within(box).getByRole('status').textContent).toMatch(/pixelated/);
  });

  it('lists the uses, advantages and disadvantages of each', () => {
    renderPage();
    const box = card('Uses, advantages and disadvantages');
    expect(within(box).getByRole('region', { name: 'Bitmap (raster)' }).textContent).toMatch(
      /Photographs/,
    );
    expect(within(box).getByRole('region', { name: 'Vector' }).textContent).toMatch(/Logos/);
  });
});

describe('G10 (M23) resolution and print size', () => {
  it('the printed size at a dpi, and what too low or too high does', async () => {
    renderPage();
    await page('Resolution and print size');
    const box = card('Resolution and print size');
    expect(within(box).getByRole('status', { name: 'Printed size' }).textContent).toMatch(
      /13\.55 × 10\.16 cm/,
    );
    expect(box.textContent).toMatch(/Good for print/);
    await fireEvent.click(within(box).getByRole('button', { name: '72' }));
    expect(within(box).getByRole('status', { name: 'Printed size' }).textContent).toMatch(
      /56\.44 × 42\.33 cm/,
    );
    expect(box.textContent).toMatch(/Too low for print/);
    await fireEvent.change(within(box).getByLabelText('Width (px)'), { target: { value: '800' } });
    await fireEvent.change(within(box).getByLabelText('Height (px)'), { target: { value: '0' } });
    expect(within(box).getByRole('status', { name: 'Printed size' }).textContent).toMatch(
      /28\.22 × 42\.33 cm/,
    );
  });

  it('the pixels needed to print a size, and the web', async () => {
    renderPage();
    await page('Resolution and print size');
    const box = card('Resolution and print size');
    const needed = () => within(box).getByRole('status', { name: 'Pixels needed' }).textContent;
    expect(needed()).toMatch(/1181 px/);
    await fireEvent.click(within(box).getByRole('button', { name: 'in' }));
    expect(needed()).toMatch(/3000 px/);
    await fireEvent.change(within(box).getByLabelText('Printed width'), { target: { value: '2' } });
    expect(needed()).toMatch(/600 px/);
    await fireEvent.click(within(box).getByRole('button', { name: 'cm' }));
    expect(within(box).getByLabelText('On the web').textContent).toMatch(/Right for the web/);
    await fireEvent.change(within(box).getByLabelText('Shown on the page (px wide)'), {
      target: { value: '300' },
    });
    expect(within(box).getByLabelText('On the web').textContent).toMatch(/Too high/);
    await fireEvent.change(within(box).getByLabelText('Shown on the page (px wide)'), {
      target: { value: '3200' },
    });
    expect(within(box).getByLabelText('On the web').textContent).toMatch(/Too low/);
  });

  it('numbers that are not sizes are not taken', async () => {
    renderPage();
    await page('Resolution and print size');
    const box = card('Resolution and print size');
    await fireEvent.change(within(box).getByLabelText('Printed width'), { target: { value: '0' } });
    expect(within(box).getByRole('status', { name: 'Pixels needed' }).textContent).toMatch(
      /1181 px/,
    );
    await fireEvent.change(within(box).getByLabelText('Shown on the page (px wide)'), {
      target: { value: 'x' },
    });
    expect(within(box).getByLabelText('On the web').textContent).toMatch(/Right for the web/);
    for (const d of ['96', '150', '600'])
      await fireEvent.click(within(box).getByRole('button', { name: d }));
    expect(box.textContent).toMatch(/more than a printer can show|Good for print/);
  });

  it('the same star from more pixels', async () => {
    renderPage();
    await page('Resolution and print size');
    const box = card('Too few pixels for the size');
    expect(
      within(box)
        .getAllByRole('img')
        .map((i) => i.getAttribute('aria-label')),
    ).toEqual([
      'The star from 8 × 8 pixels',
      'The star from 16 × 16 pixels',
      'The star from 32 × 32 pixels',
      'The star from 64 × 64 pixels',
    ]);
  });
});

describe('G9 (M23) colour systems', () => {
  const same = () => card('The same colour in each system');

  it('RGB light: the sliders mix light; the colour in every system follows', async () => {
    renderPage();
    await page('Colour systems');
    expect(same().textContent).toMatch(/#FFFFFF/);
    await fireEvent.input(screen.getByLabelText('Red light'), { target: { value: '0' } });
    expect(same().textContent).toMatch(/#00FFFF/);
    expect(same().textContent).toMatch(/RGB 0, 255, 255/);
    expect(same().textContent).toMatch(/CMYK 100 %, 0 %, 0 %, 0 %/);
    expect(same().textContent).toMatch(/From RGB light/);
  });

  it('CMYK ink and the HSL wheel', async () => {
    renderPage();
    await page('Colour systems');
    await fireEvent.input(screen.getByLabelText('Yellow ink'), { target: { value: '0' } });
    expect(same().textContent).toMatch(/#0000FF/);
    expect(same().textContent).toMatch(/From CMYK ink/);
    await fireEvent.input(screen.getByLabelText('Black (K) ink'), { target: { value: '50' } });
    expect(same().textContent).toMatch(/#000080/);
    await fireEvent.input(screen.getByLabelText('Hue'), { target: { value: '100' } });
    expect(same().textContent).toMatch(/HSL 100°, 50 %, 50 %/);
    expect(screen.getByRole('img', { name: 'The hue wheel at 100°' })).toBeTruthy();
  });

  it('every slider mixes', async () => {
    renderPage();
    await page('Colour systems');
    for (const name of ['Green light', 'Blue light']) {
      await fireEvent.input(screen.getByLabelText(name), { target: { value: '0' } });
      expect(same().textContent).toMatch(/From RGB light/);
    }
    expect(same().textContent).toMatch(/#FF0000/);
    for (const name of ['Cyan ink', 'Magenta ink']) {
      await fireEvent.input(screen.getByLabelText(name), { target: { value: '0' } });
      expect(same().textContent).toMatch(/From CMYK ink/);
    }
    for (const name of ['Saturation', 'Lightness']) {
      await fireEvent.input(screen.getByLabelText(name), { target: { value: '100' } });
      expect(same().textContent).toMatch(/From the HSL wheel/);
    }
    expect(same().textContent).toMatch(/#FFFFFF/);
    const scene = screen.getByRole('group', { name: 'A picture to pick colours from' });
    for (const b of within(scene).getAllByRole('button')) await fireEvent.click(b);
    expect(screen.getByRole('status', { name: 'Colour picked' }).textContent).toMatch(/#6B6B6B/);
  });

  it('CMS: the eyedropper picks the car’s red; a swatch book gives ink recipes', async () => {
    renderPage();
    await page('Colour systems');
    const box = card('CMS: colour matching');
    await fireEvent.click(within(box).getByRole('button', { name: 'Pick the car’s red' }));
    expect(within(box).getByRole('status', { name: 'Colour picked' }).textContent).toMatch(
      /#C8102E — RGB 200, 16, 46/,
    );
    expect(same().textContent).toMatch(/From the eyedropper/);
    expect(within(box).getByRole('list', { name: 'Matching swatches' }).children.length).toBe(6);
  });
});

describe('GL1 (M23) file formats', () => {
  it('a scenario shows the formats to use and to avoid, and why', async () => {
    renderPage();
    await page('File formats');
    const box = card('Which format?');
    const advice = () => within(box).getByRole('region', { name: /Advice for/ });
    expect(within(advice()).getAllByRole('listitem')[0]!.textContent!.trim()).toMatch(/^JPG/);
    await fireEvent.click(within(box).getByRole('button', { name: /A logo/ }));
    expect(within(advice()).getAllByRole('listitem')[0]!.textContent).toMatch(/SVG/);
    await fireEvent.click(within(box).getByRole('button', { name: /small moving banner/ }));
    expect(advice().textContent).toMatch(/GIF/);
  });

  it('every scenario has advice', async () => {
    renderPage();
    await page('File formats');
    const box = card('Which format?');
    for (const b of within(box).getAllByRole('button')) {
      await fireEvent.click(b);
      expect(b.getAttribute('aria-pressed')).toBe('true');
      expect(within(box).getByRole('region', { name: `Advice for ${b.textContent}` })).toBeTruthy();
    }
  });

  it('the seven formats side by side', async () => {
    renderPage();
    await page('File formats');
    const rows = within(card('The seven formats')).getAllByRole('row');
    expect(rows.slice(1).map((r) => r.querySelector('th')!.textContent)).toEqual([
      '.png',
      '.jpg',
      '.gif',
      '.bmp',
      '.tif',
      '.svg',
      '.pdf',
    ]);
  });
});

describe('GC1 (M23) compression on the student’s picture', () => {
  it('asks for a picture first', async () => {
    renderPage();
    await page('Compression');
    expect(screen.getByRole('button', { name: 'Save in five formats' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(card('JPEG quality').textContent).toMatch(/Choose a picture/);
  });

  it('a chosen photo: its size, the copy worked on, and the JPEG at a quality with what was lost', async () => {
    const t = renderPage();
    await page('Compression');
    await fireEvent.click(screen.getByRole('button', { name: 'Choose a picture…' }));
    await vi.waitFor(() => expect(t.learn.store.get().jpeg).not.toBeNull());
    await tick();
    const facts = screen
      .getByRole('status', { name: 'The picture' })
      .textContent!.replace(/\s+/g, ' ');
    expect(facts).toMatch(/Beach\.jpg: 3000 × 2000 px, the file 2\.40 MB/);
    expect(facts).toMatch(/copy of 60 × 40 px/);
    const jpeg = card('JPEG quality');
    expect(
      within(jpeg).getByRole('status', { name: 'JPEG size' }).textContent!.replace(/\s+/g, ' '),
    ).toMatch(/JPEG at 60: 160 bytes, 2 % of the 7 KB uncompressed\. 100 % of the pixels changed/);
    for (const view of ['The original, zoomed', 'The JPEG, zoomed', 'The difference, zoomed'])
      expect(within(jpeg).getByRole('img', { name: view })).toBeTruthy();
    // The slider shows its number while dragged; the JPEG is made when it is let go.
    const slider = within(jpeg).getByLabelText('JPEG quality');
    await fireEvent.input(slider, { target: { value: '90' } });
    expect(jpeg.textContent).toMatch(/Quality\s*90/);
    await fireEvent.change(slider, { target: { value: '90' } });
    await vi.waitFor(() => expect(t.learn.store.get().jpeg?.quality).toBe(90));
    // Clicking the picture chooses where to zoom.
    await fireEvent.click(within(jpeg).getByTitle('Click where to zoom in'));
  });

  it('the same picture in five formats, a writer not ready shown in words', async () => {
    const t = renderPage();
    await page('Compression');
    await t.learn.choosePicture();
    await fireEvent.click(screen.getByRole('button', { name: 'Save in five formats' }));
    await vi.waitFor(() => expect(t.learn.store.get().formats).not.toBeNull());
    await tick();
    const rows = within(screen.getByRole('list', { name: 'Formats compared' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((r) => r.textContent!.replace(/\s+/g, ''))).toEqual([
      'PNGexact1KB',
      'GIFexact1KB',
      'BMPexact7KB',
      '—TIFFexactSavingasTIFFisnotreadyyet.',
      'JPGlossy160bytes',
    ]);
  });

  it('a TIFF browsers cannot show is listed by its size', async () => {
    const t = renderPage({ tiffReady: true });
    await page('Compression');
    await t.learn.choosePicture();
    await t.learn.compareFormats();
    // A reader that cannot show the TIFF.
    t.learn.store.update((s) => ({
      ...s,
      formats: s.formats!.map((f) => (f.format === 'tiff' ? { ...f, preview: null } : f)),
    }));
    await tick();
    expect(card('The same picture in five formats').textContent).toMatch(
      /Browsers cannot show a TIFF/,
    );
  });

  it('fewer colours and fewer pixels, with their sizes', async () => {
    const t = renderPage();
    await page('Compression');
    await t.learn.choosePicture();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Reduce the colours and the resolution' }),
    );
    await vi.waitFor(() => expect(t.learn.store.get().resolutions).not.toBeNull());
    await tick();
    const depths = screen.getByLabelText('Colour depths');
    expect(
      within(depths)
        .getAllByRole('img')
        .map((i) => i.getAttribute('aria-label')),
    ).toEqual(['24 bits a pixel', '8 bits a pixel', '4 bits a pixel', '1 bit a pixel']);
    expect(depths.textContent).toMatch(/1-bit · 2 colours\s*300 bytes uncompressed\s*PNG 1 KB/);
    const res = screen.getByLabelText('Resolutions');
    expect(res.textContent).toMatch(/30 × 20/);
    expect(res.textContent).toMatch(/15 × 10/);
  });

  it('a JPEG saved again and again', async () => {
    const t = renderPage();
    await page('Compression');
    await t.learn.choosePicture();
    await fireEvent.click(screen.getByRole('checkbox'));
    await fireEvent.click(screen.getByRole('button', { name: 'Save it 10 times' }));
    await vi.waitFor(() => expect(t.learn.store.get().busy).toBeNull());
    await vi.waitFor(() => expect(t.learn.store.get().generations?.length).toBe(10));
    await tick();
    const box = card('A JPEG saved again and again');
    expect(within(box).getAllByRole('row').length).toBe(11);
    expect(within(box).getByRole('img', { name: 'After the last save, zoomed' })).toBeTruthy();
    expect(box.textContent).toMatch(/After 10 saves/);
  });

  it('the Graphics image, a message, and the calculator on the picture’s size', async () => {
    const t = renderPage();
    await page('Compression');
    await fireEvent.click(screen.getByRole('button', { name: 'Use the image in Graphics mode' }));
    await vi.waitFor(() => expect(t.learn.store.get().picture).not.toBeNull());
    await tick();
    expect(screen.getByRole('status', { name: 'The picture' }).textContent).toMatch(
      /The image in Graphics mode/,
    );
    // An SVG is explained.
    t.dialogs.openPicture.mockResolvedValueOnce('/m/logo.svg');
    await fireEvent.click(screen.getByRole('button', { name: 'Choose a picture…' }));
    await tick();
    expect(screen.getByRole('alert').textContent).toMatch(/vector drawing/);
    await fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alert')).toBeNull();

    const calc = card('Image file-size calculator');
    expect(calc.textContent).toMatch(/1 600 × 1 200 = 1 920 000 pixels/);
    expect(calc.textContent).toMatch(/≈ 3\.84 MB/);
    await fireEvent.click(within(calc).getByRole('button', { name: '24' }));
    expect(calc.textContent).toMatch(/16\.7 million\+ colours/);
    // The image in Graphics mode is 1280 × 720.
    await fireEvent.click(within(calc).getByRole('button', { name: 'Use my picture’s size' }));
    expect(calc.textContent).toMatch(/1 280 × 720 = 921 600 pixels/);
    expect(calc.textContent).toMatch(/≈ 2\.76 MB/);
    await fireEvent.change(within(calc).getByLabelText('Picture width (px)'), {
      target: { value: '100' },
    });
    await fireEvent.change(within(calc).getByLabelText('Picture height (px)'), {
      target: { value: '1' },
    });
    await fireEvent.change(within(calc).getByLabelText('Picture height (px)'), {
      target: { value: '-3' },
    });
    expect(calc.textContent).toMatch(/100 × 1 = 100 pixels/);
    expect(calc.textContent).toMatch(/≈ 0\.3 KB/);
  });

  it('a failure is shown as an error', async () => {
    const t = renderPage();
    await page('Compression');
    t.learn.store.update((s) => ({ ...s, message: { kind: 'error', text: 'It broke.' } }));
    await tick();
    expect(screen.getByRole('alert').className).toMatch(/error/);
  });
});

describe('GL1 (M23) bitmap to vector, and image editing and society', () => {
  it('trace explains itself and points to Trace bitmap', async () => {
    renderPage();
    await page('Bitmap to vector');
    expect(card('Bitmap to vector').textContent).toMatch(/Trace bitmap…/);
  });

  it('society: airbrushing, memes, politics, consent and copyright', async () => {
    renderPage();
    await page('Image editing and society');
    const box = card('Image editing and society');
    for (const t of [
      'Airbrushing',
      'Memes and fake scenes',
      'Politics and news',
      'Consent and privacy',
      'Copyright',
    ])
      expect(within(box).getByRole('article', { name: t })).toBeTruthy();
  });
});

describe('GC1 (M23) pictures drawn on a canvas', () => {
  it('paint sizes the canvas and puts the pixels in; no canvas, nothing drawn', () => {
    const put = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: put,
      }),
    };
    expect(paint(canvas, photo(3, 2))).toBe(true);
    expect([canvas.width, canvas.height]).toEqual([3, 2]);
    expect((put.mock.calls[0]![0] as { data: Uint8ClampedArray }).data[0]).toBe(0);
    expect(paint({ ...canvas, getContext: () => null }, photo(1, 1))).toBe(false);
  });

  it('a click picks the point under the mouse; a key press the middle', async () => {
    const onpick = vi.fn();
    render(PixelView, { props: { image: photo(100, 50), label: 'Pic', width: 200, onpick } });
    const button = screen.getByTitle('Click where to zoom in');
    button.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 200, height: 100 }) as DOMRect;
    await fireEvent.click(button, { clientX: 110, clientY: 70, detail: 1 });
    expect(onpick).toHaveBeenLastCalledWith(50, 25);
    await fireEvent.click(button, { clientX: 999, clientY: 0, detail: 1 });
    expect(onpick).toHaveBeenLastCalledWith(99, 0);
    await fireEvent.click(button, { detail: 0 });
    expect(onpick).toHaveBeenLastCalledWith(50, 25);
  });
});
