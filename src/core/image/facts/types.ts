// GL2 (M23): what the task checker and Learn ▸ Inspect read from a picture file (info.ts).

/** The seven formats of syllabus 19.1, as the file's bytes show them. */
export type ImageFormat = 'png' | 'jpg' | 'gif' | 'bmp' | 'tiff' | 'svg' | 'pdf';

/**
 * Whether any pixel is see-through: `used` (at least one is), `unused` (the file has a see-through
 * channel or colour, but every pixel is solid), `possible` (the file can hold see-through parts but
 * OneEditor did not look pixel by pixel), `none` (this file cannot hold any).
 */
export type SeeThrough = 'used' | 'unused' | 'possible' | 'none';

export interface PrintSize {
  widthCm: number;
  heightCm: number;
  widthIn: number;
  heightIn: number;
  /**
   * Where it comes from: a bitmap's dpi, an SVG's own units (cm, mm, in, pt, pc), an SVG in px
   * at the web's 96 px an inch, or a PDF's page.
   */
  from: 'dpi' | 'units' | 'css' | 'page';
}

/** What one reader finds; info.ts adds the name, the size in bytes and the printed size. */
export interface Found {
  width?: number;
  height?: number;
  dpi?: { x: number; y: number };
  /** Bits a pixel. */
  depth?: number;
  /** Colours in the palette (a GIF, an 8-bit PNG, BMP or TIFF). */
  palette?: number;
  /** Greys only (no colour). */
  grey?: boolean;
  seeThrough: SeeThrough;
  /** How the pixels are squeezed, in words: none, LZW, deflate, RLE, PackBits… */
  compression?: string;
  /** A JPEG's quality (1–100) estimated from its luminance table; exact when the table is libjpeg's at that quality. */
  jpeg?: { quality: number; exact: boolean; progressive: boolean };
  /** An (animated) GIF: its pictures, whether it plays again and again, and how long it plays (s). */
  gif?: { frames: number; loop: boolean; duration: number };
  svg?: {
    /** As written, with any unit ("10cm", "77.44"). */
    width?: string;
    height?: string;
    /** The unit of the width (px when none is written). */
    unit: string;
    viewBox?: string;
    /** Bitmaps inside: <image>, <feImage>, an HTML <img>, a data:image in a style. */
    bitmaps: number;
  };
  pdf?: {
    pages: number;
    widthPt?: number;
    heightPt?: number;
    /** Pictures inside (/Subtype /Image); null when compressed object streams hide them. */
    bitmaps: number | null;
  };
  print?: PrintSize;
}

export interface ImageFacts extends Found {
  format: ImageFormat;
  kind: 'bitmap' | 'vector';
  /** The file name's extension, lower case, without the dot ('' when there is none). */
  extension: string;
  /** The format the extension names, when it is one of the seven and not what is inside. */
  extensionSays?: ImageFormat;
  sizeBytes: number;
}
