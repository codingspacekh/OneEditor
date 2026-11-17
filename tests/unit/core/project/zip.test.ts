// D9 (M21): the stored zip the .mveg file is (doc.json and one PNG per pixel layer and mask).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isZip, readZip, writeZip } from '../../../../src/core/project/zip.ts';

const text = (s: string) => new TextEncoder().encode(s);

describe('M21 D9: the stored zip', () => {
  it('writes entries that read back the same, names in UTF-8', () => {
    const zip = writeZip([
      { name: 'doc.json', data: text('{"a":1}') },
      { name: 'pixels/0.png', data: new Uint8Array([1, 2, 3]) },
      { name: 'café.txt', data: new Uint8Array() },
    ]);
    expect(isZip(zip)).toBe(true);
    const back = readZip(zip);
    expect([...back.keys()]).toEqual(['doc.json', 'pixels/0.png', 'café.txt']);
    expect(new TextDecoder().decode(back.get('doc.json'))).toBe('{"a":1}');
    expect([...back.get('pixels/0.png')!]).toEqual([1, 2, 3]);
    expect(back.get('café.txt')!.length).toBe(0);
    // doc.json stays readable inside the file, as the end-to-end test checks.
    expect(new TextDecoder().decode(zip)).toContain('{"a":1}');
  });

  it('is a zip other programs read (unzip checks every CRC)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mve-zip-'));
    const file = join(dir, 'a.zip');
    writeFileSync(
      file,
      writeZip(
        [
          { name: 'doc.json', data: text('hello') },
          { name: 'pixels/0.png', data: new Uint8Array(1000).fill(7) },
        ],
        new Date(2026, 10, 17, 9, 30, 12),
      ),
    );
    let listing: string;
    try {
      listing = execFileSync('unzip', ['-tv', file], { encoding: 'utf8' });
    } catch (error) {
      // No unzip on this computer (Windows): Python's zipfile checks it instead.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      listing = execFileSync(
        'python',
        [
          '-I',
          '-c',
          'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip())',
          file,
        ],
        { encoding: 'utf8' },
      );
      expect(listing.trim()).toBe('None');
      return;
    }
    expect(listing).toMatch(/No errors detected/);
    expect(readFileSync(file).length).toBeGreaterThan(1000);
  });

  it('reads a zip with folders, a comment and extra fields, as other programs write them', () => {
    const zip = writeZip([{ name: 'a.txt', data: text('A') }]);
    // An archive comment after the end record.
    const commented = new Uint8Array([...zip, ...text('made elsewhere')]);
    commented[zip.length - 2] = 14;
    expect(new TextDecoder().decode(readZip(commented).get('a.txt'))).toBe('A');
    // A folder entry is skipped.
    const withFolder = writeZip([
      { name: 'pixels/', data: new Uint8Array() },
      { name: 'pixels/1.png', data: text('P') },
    ]);
    expect([...readZip(withFolder).keys()]).toEqual(['pixels/1.png']);
  });

  it('refuses a zip cut short, damaged or compressed', () => {
    const zip = writeZip([{ name: 'doc.json', data: text('{"a":1}') }]);
    expect(() => readZip(zip.subarray(0, zip.length - 30))).toThrow(/damaged/);
    expect(() => readZip(new Uint8Array(10))).toThrow(/damaged/);
    const changed = zip.slice();
    changed[40]! ^= 1; // a byte of doc.json: its CRC no longer matches
    expect(() => readZip(changed)).toThrow(/damaged/);
    const compressed = zip.slice();
    const central = new DataView(compressed.buffer).getUint32(compressed.length - 6, true);
    compressed[central + 10] = 8; // deflated
    expect(() => readZip(compressed)).toThrow(/compressed inside the zip/);
    const lostLocal = zip.slice();
    lostLocal[0] = 0;
    expect(() => readZip(lostLocal)).toThrow(/damaged/);
    const badCentral = zip.slice();
    badCentral[central] = 0;
    expect(() => readZip(badCentral)).toThrow(/damaged/);
    const tooLong = zip.slice();
    new DataView(tooLong.buffer).setUint32(central + 20, 9999, true);
    expect(() => readZip(tooLong)).toThrow(/damaged/);
    expect(isZip(text('{"schemaVersion":5}'))).toBe(false);
  });
});
