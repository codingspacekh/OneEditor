// M23 / G11, D5: LZW, the dictionary compression inside a GIF and an LZW TIFF — what is written
// reads back exactly, with GIF's and TIFF's own code widths, through many clear codes.
import { describe, expect, it } from 'vitest';
import {
  gifLzwDecode,
  gifLzwEncode,
  tiffLzwDecode,
  tiffLzwEncode,
} from '../../../../src/core/image/lzw.ts';

function noise(n: number, mask = 0xff): Uint8Array {
  const out = new Uint8Array(n);
  let seed = 12345;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (seed >> 16) & mask;
  }
  return out;
}

describe('G11 (M23): LZW', () => {
  it('a flat run becomes a few codes; it reads back', () => {
    const flat = new Uint8Array(10_000).fill(3);
    const gif = gifLzwEncode(flat, 2);
    expect(gif.length).toBeLessThan(200);
    expect([...gifLzwDecode(gif, 2, flat.length)]).toEqual([...flat]);
    const tiff = tiffLzwEncode(flat);
    expect(tiff.length).toBeLessThan(300);
    expect([...tiffLzwDecode(tiff, flat.length)]).toEqual([...flat]);
  });

  it('busy bytes, more than one table full (clear codes), read back exactly', () => {
    const busy = noise(200_000);
    expect(tiffLzwDecode(tiffLzwEncode(busy), busy.length)).toEqual(busy);
    const indices = noise(200_000, 0x0f);
    expect(gifLzwDecode(gifLzwEncode(indices, 4), 4, indices.length)).toEqual(indices);
  });

  it('nothing to send: a clear code and the end; reading stops at the end code', () => {
    expect(gifLzwDecode(gifLzwEncode(new Uint8Array(), 2), 2, 10)).toEqual(new Uint8Array());
    expect(tiffLzwDecode(tiffLzwEncode(new Uint8Array()), 10)).toEqual(new Uint8Array());
  });

  it('data cut short, or a code not made yet, gives what it has so far', () => {
    const data = noise(5000, 0x03);
    const cut = gifLzwEncode(data, 2).slice(0, 100);
    const some = gifLzwDecode(cut, 2, data.length);
    expect(some.length).toBeLessThan(data.length);
    expect([...some]).toEqual([...data.subarray(0, some.length)]);
    // Clear (256) then code 300, which does not exist yet: 9 bits each, MSB first.
    const bad = Uint8Array.from([0x80, 0x4b, 0x00, 0x00]);
    expect(tiffLzwDecode(bad, 4)).toEqual(new Uint8Array());
  });
});
