// M23 / G11, D5: an export's options for a bitmap writer, the defaults filled in, and the image
// put on a background where the file cannot keep see-through parts.
import { describe, expect, it } from 'vitest';
import { encodeOptions, onBackground } from '../../../../../src/core/image/encode/index.ts';
import { EditError } from '../../../../../src/core/model/errors.ts';

describe('encodeOptions (G11, M23)', () => {
  it('fills in each format’s defaults', () => {
    expect(encodeOptions({ format: 'png' }, 72)).toEqual({
      depth: 32,
      palette: 'colours',
      dither: true,
      transparent: true,
      background: '#ffffff',
      dpi: 72,
      tiff: 'lzw',
    });
    expect(encodeOptions({ format: 'gif' }, 96)).toMatchObject({ depth: 8, transparent: true });
    expect(encodeOptions({ format: 'bmp' }, 300)).toMatchObject({ depth: 24, transparent: false });
    expect(encodeOptions({ format: 'tiff', tiff: 'none', depth: 32 }, 300)).toMatchObject({
      depth: 32,
      transparent: true,
      tiff: 'none',
    });
  });

  it('1 bit is black and white unless the image’s own two colours are asked for', () => {
    expect(encodeOptions({ format: 'bmp', depth: 1 }, 96)).toMatchObject({ palette: 'greys' });
    expect(encodeOptions({ format: 'gif', depth: 1 }, 96)).toMatchObject({ palette: 'greys' });
    expect(encodeOptions({ format: 'gif', depth: 4 }, 96)).toMatchObject({ palette: 'colours' });
    expect(encodeOptions({ format: 'tiff', depth: 1, palette: 'colours' }, 96)).toMatchObject({
      palette: 'colours',
    });
  });

  it('keeps what is chosen', () => {
    expect(
      encodeOptions(
        { format: 'png', depth: 4, palette: 'greys', dither: false, background: '#FF0000' },
        150,
      ),
    ).toMatchObject({ depth: 4, palette: 'greys', dither: false, background: '#ff0000' });
  });

  it('refuses a depth the format cannot hold and a background that is not a colour', () => {
    expect(() => encodeOptions({ format: 'gif', depth: 32 }, 72)).toThrow(EditError);
    expect(() => encodeOptions({ format: 'bmp', background: 'red' }, 72)).toThrow(/#ffffff/);
  });
});

describe('onBackground (G11, M23)', () => {
  it('mixes see-through pixels with the background and makes all opaque', () => {
    const image = {
      width: 3,
      height: 1,
      data: Uint8ClampedArray.from([255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 128]),
    };
    const out = onBackground(image, '#ffffff');
    expect([...out.data]).toEqual([255, 0, 0, 255, 255, 255, 255, 255, 127, 127, 127, 255]);
    expect([...image.data.subarray(8)]).toEqual([0, 0, 0, 128]);
  });
});
