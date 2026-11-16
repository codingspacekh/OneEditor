// D9 (M21): our own PNG writer and reader — what the .mveg file keeps each pixel layer and mask
// in, and what the acceptance tests load the papers' PNGs with.
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { webCompression } from '../../../../src/core/image/deflate.ts';
import { crc32, pngDpi } from '../../../../src/core/image/dpi.ts';
import { decodePng, encodePng, encodePngRows } from '../../../../src/core/image/png.ts';

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type: string, data: number[] | Uint8Array): number[] {
  const body = new Uint8Array([...[...type].map((c) => c.charCodeAt(0)), ...data]);
  return [...be32(data.length), ...body, ...be32(crc32(body))];
}

/** A PNG made by hand: rows already filtered (each starting with its filter byte). */
function handPng(
  width: number,
  height: number,
  depth: number,
  type: number,
  filteredRows: number[],
  extra: number[][] = [],
  interlace = 0,
): Uint8Array {
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...chunk('IHDR', [...be32(width), ...be32(height), depth, type, 0, 0, interlace]),
    ...extra.flat(),
    ...chunk('IDAT', deflateSync(new Uint8Array(filteredRows))),
    ...chunk('IEND', []),
  ]);
}

const rgbaOf = async (png: Uint8Array) => [...(await decodePng(png, webCompression)).data];

describe('M21 D9: the PNG writer', () => {
  it('writes RGBA that reads back exactly, partly see-through pixels and all', async () => {
    const data = new Uint8ClampedArray(5 * 3 * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 37 + 11) % 256;
    const png = await encodePng({ width: 5, height: 3, channels: 4, data }, webCompression);
    const back = await decodePng(png, webCompression);
    expect(back.width).toBe(5);
    expect(back.height).toBe(3);
    expect([...back.data]).toEqual([...data]);
  });

  it('writes a mask as grey, read back as grey RGBA', async () => {
    const data = new Uint8Array([0, 128, 255, 7]);
    const png = await encodePng({ width: 2, height: 2, channels: 1, data }, webCompression);
    expect(png[25]).toBe(0); // colour type: grey
    const back = await decodePng(png, webCompression);
    expect([...back.data]).toEqual([
      0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255, 7, 7, 7, 255,
    ]);
  });

  it('takes the rows a band at a time, and keeps the resolution asked for', async () => {
    const data = new Uint8ClampedArray(3 * 7 * 4).map((_, i) => i);
    const asked: number[][] = [];
    const png = await encodePngRows(
      3,
      7,
      4,
      (y, count) => {
        asked.push([y, count]);
        return data.subarray(y * 12, (y + count) * 12);
      },
      webCompression,
      { band: 3, dpi: 300 },
    );
    expect(asked).toEqual([
      [0, 3],
      [3, 3],
      [6, 1],
    ]);
    expect(pngDpi(png)).toEqual({ x: 300, y: 300 });
    const back = await decodePng(png, webCompression);
    expect([...back.data]).toEqual([...data]);
    expect(back.dpi).toBe(300);
  });

  it('refuses a size that is not whole, and rows that do not fill the band', async () => {
    await expect(
      encodePng({ width: 0, height: 1, channels: 4, data: new Uint8Array() }, webCompression),
    ).rejects.toThrow(/at least 1 × 1/);
    await expect(encodePngRows(2, 2, 4, () => new Uint8Array(3), webCompression)).rejects.toThrow(
      /do not fill/,
    );
  });

  it('writes and reads a large layer band by band (GN3 is timed in the built app)', async () => {
    const width = 1500;
    const height = 1000;
    const row = new Uint8ClampedArray(width * 4).map((_, i) => (i * 7) & 255);
    const png = await encodePngRows(
      width,
      height,
      4,
      (_y, count) => {
        const band = new Uint8ClampedArray(row.length * count);
        for (let j = 0; j < count; j++) band.set(row, j * row.length);
        return band;
      },
      webCompression,
    );
    const back = await decodePng(png, webCompression);
    expect([back.width, back.height]).toEqual([width, height]);
    expect([...back.data.subarray(width * 4 * 999, width * 4 * 999 + 8)]).toEqual([
      ...row.subarray(0, 8),
    ]);
  });
});

describe('M21 D9: the PNG reader', () => {
  it('undoes all five row filters', async () => {
    // A 2 × 5 grey image, one row per filter: none, sub, up, average, Paeth.
    const png = handPng(
      2,
      5,
      8,
      0,
      [
        [0, 10, 20],
        [1, 30, 5], // 30, 35
        [2, 1, 1], // 31, 36
        [3, 4, 4], // 31/2 + 4 = 19; (19 + 36) / 2 + 4 = 31
        [4, 1, 2], // paeth(0, 19, 0) = 19 → 20; paeth(20, 31, 19) = 31 → 33
      ].flat(),
    );
    const grey = (await rgbaOf(png)).filter((_, i) => i % 4 === 0);
    expect(grey).toEqual([10, 20, 30, 35, 31, 36, 19, 31, 20, 33]);
  });

  it('reads RGB (opaque) and RGB with a see-through colour', async () => {
    const rows = [0, 255, 0, 0, 0, 0, 255];
    expect(await rgbaOf(handPng(2, 1, 8, 2, rows))).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    const keyed = handPng(2, 1, 8, 2, rows, [chunk('tRNS', [0, 0, 0, 0, 0, 255])]);
    expect(await rgbaOf(keyed)).toEqual([255, 0, 0, 255, 0, 0, 255, 0]);
  });

  it('reads a palette, with its transparency, at 8 and at 2 bits', async () => {
    const plte = chunk('PLTE', [255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const trns = chunk('tRNS', [128]);
    expect(await rgbaOf(handPng(3, 1, 8, 3, [0, 0, 1, 2], [plte, trns]))).toEqual([
      255, 0, 0, 128, 0, 255, 0, 255, 0, 0, 255, 255,
    ]);
    // 2 bits a pixel: 0b00_01_10_00 → 0, 1, 2.
    expect(await rgbaOf(handPng(3, 1, 2, 3, [0, 0b00011000], [plte]))).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    ]);
  });

  it('reads grey at 1 bit (with a see-through grey), grey + alpha and 16 bits', async () => {
    const bits = handPng(3, 1, 1, 0, [0, 0b10100000], [chunk('tRNS', [0, 0])]);
    expect(await rgbaOf(bits)).toEqual([255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
    expect(await rgbaOf(handPng(1, 1, 8, 4, [0, 90, 200]))).toEqual([90, 90, 90, 200]);
    const wide = handPng(1, 1, 16, 6, [0, 0x12, 0x34, 0xff, 0xff, 0, 1, 0x80, 0]);
    expect(await rgbaOf(wide)).toEqual([0x12, 0xff, 0, 0x80]);
    const wideRgb = handPng(
      1,
      1,
      16,
      2,
      [0, 1, 0, 2, 0, 3, 0],
      [chunk('tRNS', [1, 0, 2, 0, 3, 0])],
    );
    expect(await rgbaOf(wideRgb)).toEqual([1, 2, 3, 0]);
    expect(await rgbaOf(handPng(1, 1, 16, 4, [0, 0xab, 0, 0x40, 0]))).toEqual([
      0xab, 0xab, 0xab, 0x40,
    ]);
  });

  it('refuses what is not a PNG, is damaged, interlaced or has no pixels', async () => {
    const good = handPng(1, 1, 8, 0, [0, 1]);
    await expect(decodePng(new Uint8Array([1, 2, 3]), webCompression)).rejects.toThrow(/damaged/);
    const bad = good.slice();
    bad[bad.length - 20]! ^= 0xff; // inside IDAT: its CRC no longer matches
    await expect(decodePng(bad, webCompression)).rejects.toThrow(/damaged/);
    await expect(decodePng(handPng(1, 1, 8, 0, [0, 1], [], 1), webCompression)).rejects.toThrow(
      /interlaced/,
    );
    await expect(decodePng(handPng(1, 1, 8, 0, [7, 1]), webCompression)).rejects.toThrow(/damaged/);
    await expect(decodePng(handPng(1, 1, 3, 0, [0, 1]), webCompression)).rejects.toThrow(/damaged/);
    await expect(decodePng(handPng(1, 1, 8, 3, [0, 0]), webCompression)).rejects.toThrow(/damaged/);
    await expect(decodePng(handPng(2, 2, 8, 0, [0, 1]), webCompression)).rejects.toThrow(/damaged/);
    const plte = chunk('PLTE', [1, 2, 3]);
    await expect(decodePng(handPng(1, 1, 8, 3, [0, 5], [plte]), webCompression)).rejects.toThrow(
      /damaged/,
    );
    const noData = new Uint8Array([
      ...good.subarray(0, 33),
      ...chunk('IDAT', [1, 2, 3]),
      ...chunk('IEND', []),
    ]);
    await expect(decodePng(noData, webCompression)).rejects.toThrow(/damaged/);
    const cut = good.subarray(0, good.length - 15); // inside the image data
    await expect(decodePng(cut, webCompression)).rejects.toThrow(/damaged/);
    const odd = handPng(1, 1, 8, 0, [0, 1]);
    odd[26] = 1; // compression method 1
    odd.set(be32(crc32(odd, 12, 29)), 29);
    await expect(decodePng(odd, webCompression)).rejects.toThrow(/damaged/);
  });
});
