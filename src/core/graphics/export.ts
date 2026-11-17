// G11 (M18): exporting an image — SVG (vector), PNG and JPG (bitmaps) — at the canvas size or
// another one, and the whole image or only the objects chosen, each in a file of its own if
// asked (9626/04 J/19: "save the grouped objects separately as Casing, MetalInsert and Grid";
// J/20: each part "in both .svg and a transparent bitmap format"). PDF (M19) is the SVG printed
// on a page of the image's printed size (pdf.ts). M23: GIF, BMP and TIFF — the seven formats of
// syllabus 19.1 — each at a colour depth it can hold (1, 4, 8, 24 or 32 bits), made by our own
// encoders (D5, core/image/encode/).
import { EditError } from '../model/errors.ts';
import { TRANSPARENT } from '../animation/rules.ts';
import type { AnimationDoc, AnimObject, Id } from '../animation/types.ts';
import { canvasAround, drawingBounds, graphicOf, printedSize } from './document.ts';
import { roundIn, toPx, type Unit } from './units.ts';

export type GraphicFormat = 'png' | 'jpg' | 'gif' | 'bmp' | 'tiff' | 'svg' | 'pdf';

export const GRAPHIC_FORMATS: readonly GraphicFormat[] = [
  'png',
  'jpg',
  'gif',
  'bmp',
  'tiff',
  'svg',
  'pdf',
];

/** G11 (M23): bits a pixel. 1, 4 and 8 are a palette (or greys); 24 is RGB; 32 RGB and alpha. */
export type ColourDepth = 1 | 4 | 8 | 24 | 32;

/** M23: the depths each format can hold, the first its default; none for a vector format. */
export const COLOUR_DEPTHS: Readonly<Record<GraphicFormat, readonly ColourDepth[]>> = {
  png: [32, 24, 8, 4, 1],
  jpg: [24],
  gif: [8, 4, 1],
  bmp: [24, 32, 8, 4, 1],
  tiff: [24, 32, 8, 1],
  svg: [],
  pdf: [],
};

/** M23: a TIFF's compression (D5): none, or LZW (lossless). */
export type TiffCompression = 'none' | 'lzw';

export interface FormatInfo {
  label: string;
  extension: string;
  kind: 'vector' | 'bitmap';
  compression: 'lossless' | 'lossy' | 'none';
  transparency: boolean;
  /** One line on what it is good for and what it cannot do (T7, syllabus 19.1 file formats). */
  about: string;
}

export const FORMAT_INFO: Readonly<Record<GraphicFormat, FormatInfo>> = {
  svg: {
    label: 'SVG (Scalable Vector Graphics)',
    extension: 'svg',
    kind: 'vector',
    compression: 'none',
    transparency: true,
    about:
      'Shapes, not pixels: any size without going blurry, small for logos and drawings, opens in browsers and vector programs. Not for photographs.',
  },
  png: {
    label: 'PNG (Portable Network Graphics)',
    extension: 'png',
    kind: 'bitmap',
    compression: 'lossless',
    transparency: true,
    about:
      'Pixels, compressed without losing any: sharp edges and text, keeps transparency. Larger than a JPG for photographs.',
  },
  jpg: {
    label: 'JPG / JPEG (Joint Photographic Experts Group)',
    extension: 'jpg',
    kind: 'bitmap',
    compression: 'lossy',
    transparency: false,
    about:
      'Pixels, compressed by losing detail you hardly see: small files for photographs. No transparency (see-through parts become the background colour); edges and text can blur.',
  },
  // M23: the other three bitmap formats syllabus 19.1 names.
  gif: {
    label: 'GIF (Graphics Interchange Format)',
    extension: 'gif',
    kind: 'bitmap',
    compression: 'lossless',
    transparency: true,
    about:
      'Pixels in at most 256 colours, compressed without losing any: small for logos, icons and simple drawings, a pixel fully see-through or not at all, and it can animate. Photographs lose colours (banding or speckles).',
  },
  bmp: {
    label: 'BMP (Bitmap)',
    extension: 'bmp',
    kind: 'bitmap',
    compression: 'none',
    transparency: false,
    about:
      'Pixels stored one by one, not compressed: exact, opens in any Windows program, but very large files. Not for the web; see-through parts become the background colour (32-bit keeps them, though not every program shows it).',
  },
  tiff: {
    label: 'TIFF (Tagged Image File Format)',
    extension: 'tif',
    kind: 'bitmap',
    compression: 'lossless',
    transparency: true,
    about:
      'Pixels kept exactly (not compressed, or LZW without losing any), with the resolution for print: for print shops, scans and archives. Large files; browsers do not show it.',
  },
  // G11 (M19): the workbook's "save as PDF".
  pdf: {
    label: 'PDF (Portable Document Format)',
    extension: 'pdf',
    kind: 'vector',
    compression: 'lossless',
    transparency: false,
    about:
      'A page to print or send: the shapes stay vector (sharp at any zoom), it prints at the exact size of the image, and it opens everywhere (browsers, phones, print shops). Not for editing the drawing again; see-through parts print as white paper.',
  },
};

/** What size the picture is made at. A vector file (SVG) is always the canvas, scaled if asked. */
export type ExportSize =
  | { by: 'canvas' }
  /** In px; the other side in proportion (9626/04 J/20: "a width of 600px"; M/21: "a height of 500 pixels"). */
  | { by: 'width'; px: number }
  | { by: 'height'; px: number }
  | { by: 'percent'; percent: number }
  /** A printed width in a unit at a resolution (the height in proportion): "10 cm at 300 dpi". */
  | { by: 'print'; width: number; unit: Unit; dpi: number };

/**
 * What is exported: the whole canvas, or the selected objects cropped to them (together, or each
 * in a file of its own). G11 (M21): or each layer in a file of its own, on the whole canvas
 * (O/N/23: CastleLayer, OceanLayer and SkyLayer, each saved apart).
 */
export type ExportWhat = 'image' | 'selection' | 'each' | 'layers';

export interface GraphicExportOptions {
  format: GraphicFormat;
  size?: ExportSize;
  /** JPG quality, 1–100 (default 90). */
  quality?: number;
  /** The colour see-through parts become when the file cannot keep them (default white). */
  background?: string;
  what?: ExportWhat;
  /** M23: bits a pixel (COLOUR_DEPTHS; default the format's first). */
  depth?: ColourDepth;
  /** M23: 1, 4 or 8 bits: the image's own colours (median cut) or greys (default colours). */
  palette?: 'colours' | 'greys';
  /** M23: 1, 4 or 8 bits: dithered (default) or the nearest colour only. */
  dither?: boolean;
  /** M23: GIF and palette PNG: see-through pixels kept (default true). */
  transparent?: boolean;
  /** M23: TIFF only (default LZW). */
  tiff?: TiffCompression;
}

const DEPTH_WORDS: Readonly<Record<GraphicFormat, string>> = {
  png: 'A PNG',
  jpg: 'A JPG',
  gif: 'A GIF',
  bmp: 'A BMP',
  tiff: 'A TIFF',
  svg: 'An SVG',
  pdf: 'A PDF',
};

const orList = (ns: readonly number[]): string =>
  ns.length === 1 ? `${ns[0]}` : `${ns.slice(0, -1).join(', ')} or ${ns[ns.length - 1]}`;

/** M23: the colour depth an export is made at, checked against what its format can hold. */
export function colourDepth(options: Pick<GraphicExportOptions, 'format' | 'depth'>): ColourDepth {
  const can = COLOUR_DEPTHS[options.format];
  if (can.length === 0) {
    if (options.depth === undefined) return 24;
    throw new EditError(
      `${DEPTH_WORDS[options.format]} is vector: it has no colour depth to choose.`,
    );
  }
  if (options.depth === undefined) return can[0]!;
  if (!can.includes(options.depth))
    throw new EditError(
      `${DEPTH_WORDS[options.format]} holds ${orList([...can].sort((a, b) => a - b))} bits a pixel, not ${options.depth}.`,
    );
  return options.depth;
}

/**
 * M23: whether see-through parts stay see-through in the file, or go on the background colour:
 * 32 bits keep alpha; a GIF or a palette PNG keeps fully see-through pixels unless asked not to;
 * JPG, BMP and TIFF below 32 bits cannot.
 */
export function keepsTransparency(
  options: Pick<GraphicExportOptions, 'format' | 'depth' | 'transparent'>,
): boolean {
  const { format } = options;
  if (format === 'svg') return true;
  if (format === 'pdf' || format === 'jpg') return false;
  const depth = colourDepth(options);
  if (depth === 32) return true;
  if (format === 'gif' || (format === 'png' && depth <= 8)) return options.transparent !== false;
  return false;
}

/**
 * Benchmark G11: the depths remembered from the last exports, as the next export starts with
 * them: for an image with see-through parts, a depth that would lose them is not reused (the
 * format's default then: 32-bit PNG), so a see-through PNG never silently comes out on white
 * because the one before had to be opaque (J/20: Meter1_ at 24 bits, then Scale2_).
 */
export function rememberedDepths(
  depths: Partial<Record<GraphicFormat, ColourDepth>>,
  seeThrough: boolean,
): Partial<Record<GraphicFormat, ColourDepth>> {
  if (!seeThrough) return { ...depths };
  const kept: Partial<Record<GraphicFormat, ColourDepth>> = {};
  // (Whether a GIF or palette PNG keeps them is its own tick box, shown and remembered.)
  for (const [format, depth] of Object.entries(depths) as [GraphicFormat, ColourDepth][])
    if (keepsTransparency({ format, depth, transparent: true })) kept[format] = depth;
  return kept;
}

export const MIN_EXPORT_SIDE = 1;
export const MAX_EXPORT_SIDE = 16384;

export interface PixelSize {
  width: number;
  height: number;
  /** The resolution written into the file. */
  dpi: number;
}

/** G11: the pixel size (and dpi kept in the file) of an export of a canvas this big. */
export function exportPixels(
  canvas: { width: number; height: number },
  dpi: number,
  size: ExportSize = { by: 'canvas' },
): PixelSize {
  const ratio = canvas.height / canvas.width;
  let width: number;
  let height: number;
  let outDpi = dpi;
  switch (size.by) {
    case 'canvas':
      ({ width, height } = canvas);
      break;
    case 'width':
      width = Math.round(size.px);
      height = Math.round(width * ratio);
      break;
    case 'height':
      height = Math.round(size.px);
      width = Math.round(height / ratio);
      break;
    case 'percent':
      if (!(size.percent > 0)) throw new EditError('Type a size above 0 %.');
      width = Math.round((canvas.width * size.percent) / 100);
      height = Math.round((canvas.height * size.percent) / 100);
      // The same printed size: a picture made smaller keeps its size on paper only at a lower dpi.
      break;
    case 'print':
      if (!(size.width > 0)) throw new EditError('Type a printed width above 0.');
      width = Math.round(toPx(size.width, size.unit, size.dpi));
      height = Math.round(width * ratio);
      outDpi = size.dpi;
      break;
  }
  for (const n of [width, height])
    if (!Number.isFinite(n) || n < MIN_EXPORT_SIDE || n > MAX_EXPORT_SIDE)
      throw new EditError(
        `That makes a picture of ${Number.isFinite(width) ? width : '?'} × ${Number.isFinite(height) ? height : '?'} px: each side must be between ${MIN_EXPORT_SIDE} and ${MAX_EXPORT_SIDE} px.`,
      );
  return { width, height, dpi: outDpi };
}

/**
 * G11, G10: an SVG's width and height as written in the file: in px for a screen image, or in
 * the image's own units (cm, mm, in, pt), so a 10 cm logo opens as 10 cm (9626/04 M/22).
 */
export function svgDimensions(
  doc: AnimationDoc,
  size: ExportSize = { by: 'canvas' },
): {
  width: string;
  height: string;
} {
  const { dpi, units } = graphicOf(doc);
  if (size.by === 'print') {
    const h = (size.width * doc.stage.height) / doc.stage.width;
    return {
      width: `${roundIn(size.width, size.unit)}${size.unit}`,
      height: `${roundIn(h, size.unit)}${size.unit}`,
    };
  }
  const px = exportPixels(doc.stage, dpi, size);
  if (units === 'px' || size.by !== 'canvas')
    return { width: `${px.width}`, height: `${px.height}` };
  // G6 (benchmark): the size typed (80 mm), not the whole pixels it came to (79.9 mm).
  const inches = printedSize(doc) ?? { width: px.width / dpi, height: px.height / dpi };
  const inUnit = (n: number) => roundIn(n * { cm: 2.54, mm: 25.4, in: 1, pt: 72 }[units], units);
  return { width: `${inUnit(inches.width)}${units}`, height: `${inUnit(inches.height)}${units}` };
}

/** The objects on the canvas that `ids` names (top-level), in drawing order. */
function chosen(doc: AnimationDoc, ids: readonly Id[]): AnimObject[] {
  const want = new Set(ids);
  return doc.layers.flatMap((l) => l.objects).filter((o) => want.has(o.id));
}

/**
 * G11: an image of only these objects, its canvas cropped to them and see-through around them
 * (a transparent bitmap or an SVG of the part alone). Their layers stay (hidden ones are left
 * out, as on the canvas); the rest of the drawing is gone.
 */
export function imageOfObjects(doc: AnimationDoc, ids: readonly Id[]): AnimationDoc {
  const want = new Set(ids);
  const objects = chosen(doc, ids);
  if (objects.length === 0) throw new EditError('Choose the objects to export first.');
  const only: AnimationDoc = {
    ...doc,
    stage: { ...doc.stage, background: TRANSPARENT },
    // A mask layer still shapes the layer under it, as it does on the canvas. M21: a pixel layer
    // holds no objects to choose: it is left out.
    layers: doc.layers
      .filter((l) => !l.pixels)
      .map((l) => (l.mask ? l : { ...l, objects: l.objects.filter((o) => want.has(o.id)) })),
    guides: { x: [], y: [] },
  };
  const box = drawingBounds(only, want);
  if (!box) throw new EditError('The objects chosen are on hidden layers: show them first.');
  return canvasAround(only, box);
}

/**
 * G11 "each": one image per chosen object, named after it ("Casing", "Needle"); names that are the
 * same, or not usable in a file name, are made different ("Star", "Star 2").
 */
export function imagesOfEach(
  doc: AnimationDoc,
  ids: readonly Id[],
): { name: string; doc: AnimationDoc }[] {
  const used = new Set<string>();
  return chosen(doc, ids).map((o) => {
    const plain = o.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Object';
    let name = plain;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${plain} ${n}`;
    used.add(name.toLowerCase());
    return { name, doc: imageOfObjects(doc, [o.id]) };
  });
}

/** A name usable in a file name, made different from those already used ("Star", "Star 2"). */
function fileNameFor(name: string, used: Set<string>, fallback: string): string {
  const plain = name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || fallback;
  let out = plain;
  for (let n = 2; used.has(out.toLowerCase()); n++) out = `${plain} ${n}`;
  used.add(out.toLowerCase());
  return out;
}

/**
 * G11 (M21) "layers": one image per layer shown that has something on it, on the whole canvas,
 * see-through around it, named after the layer (CastleLayer, OceanLayer, SkyLayer). Each is
 * drawn as it is (its opacity, its layer mask; AN12: with its mask layer), not clipped. Mask
 * layers and templates are not layers to save.
 */
export function imagesOfLayers(doc: AnimationDoc): { name: string; doc: AnimationDoc }[] {
  const used = new Set<string>();
  const out = doc.layers.flatMap((layer, i) => {
    if (!layer.visible || layer.mask || layer.template) return [];
    if (!layer.pixels && layer.objects.length === 0) return [];
    const mask = doc.layers[i + 1];
    const alone = { ...layer };
    delete alone.clip;
    return [
      {
        name: fileNameFor(layer.name, used, 'Layer'),
        doc: {
          ...doc,
          stage: { ...doc.stage, background: TRANSPARENT },
          layers: mask?.mask ? [alone, mask] : [alone],
          guides: { x: [], y: [] },
        },
      },
    ];
  });
  if (out.length === 0) throw new EditError('There is nothing on the layers shown to export.');
  return out;
}

/** JPG quality, checked. */
export function jpegQuality(quality = 90): number {
  if (!Number.isInteger(quality) || quality < 1 || quality > 100)
    throw new EditError('The JPG quality must be a whole number from 1 to 100.');
  return quality;
}
