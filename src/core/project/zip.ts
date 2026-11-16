// D9 (M21): the .mveg file is a zip of doc.json and one PNG per pixel layer and mask, so an image
// is one file to hand in or move, its pixels kept exactly, and its JSON still readable (any zip
// program opens it). Our own small writer and reader: the entries are stored, not compressed (the
// PNGs are compressed already, and doc.json stays readable as text in the file), with the CRC-32
// every zip program checks. The reader takes the files we write and any zip of stored entries.
import { crc32 } from '../image/dpi.ts';

export interface ZipEntry {
  /** The path inside the zip, with "/" between folders ("pixels/0.png"). */
  name: string;
  data: Uint8Array;
}

export const ZIP_DAMAGED = 'This file is damaged: it is not a complete zip.';

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

/** "PK\x03\x04": a zip's first bytes. */
export const isZip = (b: Uint8Array): boolean =>
  b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/** MS-DOS time and date, as zips keep them (to 2 s, from 1980). */
function dosTime(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/** A zip of the entries, each stored as it is. */
export function writeZip(entries: readonly ZipEntry[], modified = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosTime(modified);
  const names = entries.map((e) => encoder.encode(e.name));
  const crcs = entries.map((e) => crc32(e.data));
  const localSize = entries.reduce((n, e, i) => n + 30 + names[i]!.length + e.data.length, 0);
  const centralSize = names.reduce((n, name) => n + 46 + name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;
  const offsets: number[] = [];
  /** The fields a local header and a central record share, from "version needed" on. */
  const common = (i: number): void => {
    view.setUint16(at, 20, true); // version needed: 2.0
    view.setUint16(at + 2, 0x0800, true); // the names are UTF-8
    view.setUint16(at + 4, 0, true); // stored
    view.setUint16(at + 6, time, true);
    view.setUint16(at + 8, date, true);
    view.setUint32(at + 10, crcs[i]!, true);
    view.setUint32(at + 14, entries[i]!.data.length, true);
    view.setUint32(at + 18, entries[i]!.data.length, true);
    view.setUint16(at + 22, names[i]!.length, true);
    view.setUint16(at + 24, 0, true); // no extra field
    at += 26;
  };
  entries.forEach((entry, i) => {
    offsets.push(at);
    view.setUint32(at, LOCAL, true);
    at += 4;
    common(i);
    out.set(names[i]!, at);
    at += names[i]!.length;
    out.set(entry.data, at);
    at += entry.data.length;
  });
  const central = at;
  entries.forEach((_, i) => {
    view.setUint32(at, CENTRAL, true);
    view.setUint16(at + 4, 20, true); // made by: 2.0
    at += 6;
    common(i);
    // No comment, disk 0, no internal or external attributes (all left 0); its local header.
    view.setUint32(at + 10, offsets[i]!, true);
    at += 14;
    out.set(names[i]!, at);
    at += names[i]!.length;
  });
  view.setUint32(at, END, true);
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, at - central, true);
  view.setUint32(at + 16, central, true);
  return out;
}

const damaged = (why = ZIP_DAMAGED): never => {
  throw new RangeError(why);
};

/**
 * The entries of a zip by name (folders left out). Refuses (RangeError) a zip that is cut short or
 * damaged, or an entry that is compressed (we write none).
 */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end record is the last thing in the file, before a comment of up to 64 KiB.
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--)
    if (view.getUint32(at, true) === END) {
      end = at;
      break;
    }
  if (end < 0) damaged();
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const found = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || view.getUint32(at, true) !== CENTRAL) damaged();
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
    if (name.endsWith('/')) continue;
    if (method !== 0)
      damaged(`${name} is compressed inside the zip: OneEditor reads only its own files.`);
    if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL) damaged();
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + size > bytes.length) damaged();
    const data = bytes.subarray(start, start + size);
    if (crc32(data) !== crc) damaged();
    found.set(name, data);
  }
  return found;
}
