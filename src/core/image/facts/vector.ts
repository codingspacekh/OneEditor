// GL2 (M23): an SVG's and a PDF's facts. An SVG: its width and height as written (with their
// units), its viewBox, its size in px as a browser shows it (AN5's svgSize), and the bitmaps it
// holds — 9626/04 M/26: "the SVG must not contain any bitmap elements". A PDF: its pages, the
// first page's size (MediaBox, in points: 72 an inch) and the pictures inside (/Subtype /Image).
import { svgSize } from '../../animation/svg.ts';
import { EditError } from '../../model/errors.ts';
import type { Found, PrintSize } from './types.ts';

const CM_PER_UNIT: Record<string, number> = {
  cm: 1,
  mm: 0.1,
  in: 2.54,
  pt: 2.54 / 72,
  pc: 2.54 / 6,
};

const print = (widthIn: number, heightIn: number, from: PrintSize['from']): PrintSize => ({
  widthCm: widthIn * 2.54,
  heightCm: heightIn * 2.54,
  widthIn,
  heightIn,
  from,
});

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag);
  return match?.[2]?.trim() || undefined;
}

const unitOf = (value: string | undefined) =>
  /^[\d.]+(?:e[+-]?\d+)?\s*([a-z%]*)$/i.exec(value ?? '')?.[1]?.toLowerCase() ?? '';

/** Bitmaps an SVG holds: <image> (any prefix), <feImage>, an HTML <img>, a data:image in CSS. */
const BITMAPS = [/<(?:[\w-]+:)?(?:image|feImage|img)\b/gi, /url\(\s*["']?data:image\//gi];

export function svgFacts(textOf: string): Found {
  const tag = /<svg\b[^>]*>/i.exec(textOf)?.[0];
  if (!tag) throw new EditError('This file is not an SVG picture.');
  const width = attribute(tag, 'width');
  const height = attribute(tag, 'height');
  const viewBox = attribute(tag, 'viewBox');
  const px = svgSize(textOf);
  const unit = unitOf(width ?? height) || 'px';
  const bitmaps = BITMAPS.reduce((n, re) => n + (textOf.match(re)?.length ?? 0), 0);
  // In its own units when it gives them (10cm); otherwise in px at the web's 96 px an inch.
  const cm = CM_PER_UNIT[unit];
  let printed = print(px.width / 96, px.height / 96, 'css');
  if (cm !== undefined && unitOf(height ?? width) === unit) {
    const w = width ? parseFloat(width) * cm : undefined;
    const h = height ? parseFloat(height) * cm : undefined;
    const wCm = w ?? (h! * px.width) / px.height;
    const hCm = h ?? (w! * px.height) / px.width;
    printed = print(wCm / 2.54, hCm / 2.54, 'units');
  }
  return {
    width: px.width,
    height: px.height,
    seeThrough: 'possible',
    svg: {
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      unit,
      ...(viewBox ? { viewBox } : {}),
      bitmaps,
    },
    print: printed,
  };
}

export function pdfFacts(textOf: string): Found {
  const pages = textOf.match(/\/Type\s*\/Page(?![a-z])/gi)?.length ?? 0;
  const box = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/.exec(
    textOf,
  );
  const images = textOf.match(/\/Subtype\s*\/Image(?![a-z])/gi)?.length ?? 0;
  // A PDF 1.5 file may keep its dictionaries compressed in object streams: none found may be none seen.
  const hidden = images === 0 && /\/Type\s*\/ObjStm/.test(textOf);
  const size = box
    ? {
        widthPt: Math.abs(Number(box[3]) - Number(box[1])),
        heightPt: Math.abs(Number(box[4]) - Number(box[2])),
      }
    : null;
  return {
    seeThrough: 'none',
    pdf: { pages, ...(size ?? {}), bitmaps: hidden ? null : images },
    ...(size ? { print: print(size.widthPt / 72, size.heightPt / 72, 'page') } : {}),
  };
}
