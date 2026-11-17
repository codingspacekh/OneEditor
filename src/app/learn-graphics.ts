// Learn ▸ Graphics ▸ Compression (GC1, M23): compression shown on the student's own picture — a
// file chosen, or the image open in Graphics mode — as a copy of at most a million pixels
// (DEMO_MAX_PIXELS), so a 12-megapixel photo never holds the page up. A JPEG at a quality with
// the difference view; the same picture as PNG, GIF, BMP, TIFF and JPG; the colour depth and the
// resolution reduced; a JPEG saved again and again. Learn mode never changes the image or a file.
import type { AnimationDoc } from '../core/animation/types.ts';
import { graphicOf } from '../core/graphics/document.ts';
import { webCompression, type Compression } from '../core/image/deflate.ts';
import { decodeBitmap } from '../core/image/decode/index.ts';
import { encodeBitmap, onBackground, type RgbaImage } from '../core/image/encode/index.ts';
import { EditError, MediaError } from '../core/model/errors.ts';
import type { Dialogs, ProjectFiles, StageRenderer } from '../core/ports.ts';
import { fileNameOf } from '../core/project/relocate.ts';
import {
  DEMO_MAX_PIXELS,
  compareFormats,
  depthSteps,
  fitWithin,
  generations,
  jpegAt,
  resolutionSteps,
  type BitmapEncoder,
  type DepthStep,
  type FormatResult,
  type Generation,
  type JpegResult,
  type PictureCodec,
  type ResolutionStep,
} from '../core/teaching/graphics.ts';
import { unexpected } from './problems.ts';
import { createStore, type Store } from './store.ts';

export interface LearnPicture {
  name: string;
  /** The file's (or the image's) own size, in px. */
  width: number;
  height: number;
  /** The file's size; null for the Graphics image. */
  fileBytes: number | null;
  dpi: number;
  /** The copy the demonstrations work on: opaque, at most DEMO_MAX_PIXELS. */
  image: RgbaImage;
}

export interface FormatRow extends FormatResult {
  /** The file opened again; null when it could not be made or opened. */
  preview: RgbaImage | null;
}

export interface GraphicsLearnState {
  picture: LearnPicture | null;
  /** What is being done, e.g. "Saving as GIF…". */
  busy: string | null;
  message: { kind: 'error' | 'info'; text: string } | null;
  /** The JPEG quality chosen, 1–100. */
  quality: number;
  jpeg: JpegResult | null;
  formats: FormatRow[] | null;
  depths: DepthStep[] | null;
  resolutions: ResolutionStep[] | null;
  generations: Generation[] | null;
}

export interface GraphicsLearnDeps {
  dialogs: Pick<Dialogs, 'openPicture'>;
  files: Pick<ProjectFiles, 'readBytes'>;
  renderer?: Pick<StageRenderer, 'renderPng'>;
  /** The image open in Graphics mode. */
  graphic: () => AnimationDoc;
  /** JPEG and the page's own decoding (the canvas in the app). */
  codec?: PictureCodec;
  encode?: BitmapEncoder;
  decodeFile?: (bytes: Uint8Array, compression: Compression) => Promise<RgbaImage>;
  compression?: Compression;
}

const NO_CODEC: PictureCodec = {
  jpeg: () => Promise.reject(new EditError('Making a JPEG needs the OneEditor app.')),
  decode: () => Promise.reject(new EditError('Opening a picture needs the OneEditor app.')),
};

const FIRST = 'Choose a picture first (or use the image in Graphics mode).';
const CANNOT_OPEN = 'This picture could not be opened. Choose a PNG, JPG, GIF or BMP file.';
const NAMES: Record<FormatResult['format'], string> = {
  png: 'PNG',
  gif: 'GIF',
  bmp: 'BMP',
  tiff: 'TIFF',
  jpg: 'JPG',
};

export function createGraphicsLearnApp({
  dialogs,
  files,
  renderer,
  graphic,
  codec = NO_CODEC,
  encode = encodeBitmap,
  decodeFile = decodeBitmap,
  compression = webCompression,
}: GraphicsLearnDeps) {
  const store: Store<GraphicsLearnState> = createStore<GraphicsLearnState>({
    picture: null,
    busy: null,
    message: null,
    quality: 60,
    jpeg: null,
    formats: null,
    depths: null,
    resolutions: null,
    generations: null,
  });
  const patch = (change: Partial<GraphicsLearnState>) => store.update((s) => ({ ...s, ...change }));
  const showError = (error: unknown) =>
    patch({
      busy: null,
      message: {
        kind: 'error',
        text:
          error instanceof EditError || error instanceof MediaError
            ? error.message
            : unexpected(error),
      },
    });
  /** Bumped for each JPEG asked for: a slower, older one is not shown over a newer one. */
  let jpegTurn = 0;

  async function setQuality(quality: number): Promise<void> {
    const q = Math.max(1, Math.min(100, Math.round(quality)));
    patch({ quality: q });
    const picture = store.get().picture;
    if (!picture) return;
    const turn = ++jpegTurn;
    try {
      const jpeg = await jpegAt(picture.image, q, codec);
      if (turn === jpegTurn && store.get().picture === picture) patch({ jpeg });
    } catch (error) {
      if (turn === jpegTurn) showError(error);
    }
  }

  /** A new picture: what was worked out on the last one goes. */
  async function show(picture: LearnPicture): Promise<void> {
    patch({
      picture,
      busy: null,
      message: null,
      jpeg: null,
      formats: null,
      depths: null,
      resolutions: null,
      generations: null,
    });
    await setQuality(store.get().quality);
  }

  async function open(
    bytes: Uint8Array,
  ): Promise<{ image: RgbaImage; width: number; height: number }> {
    try {
      const decoded = await codec.decode(bytes, DEMO_MAX_PIXELS);
      // GC1: a JPEG cannot keep see-through parts, so every demonstration starts opaque.
      return { ...decoded, image: onBackground(decoded.image, '#ffffff') };
    } catch (error) {
      if (error instanceof EditError) throw error;
      throw new EditError(CANNOT_OPEN);
    }
  }

  /** One job at a time; none without a picture. */
  async function job(
    label: string,
    work: (picture: LearnPicture) => Promise<Partial<GraphicsLearnState>>,
  ): Promise<void> {
    const s = store.get();
    if (s.busy) return;
    if (!s.picture) {
      patch({ message: { kind: 'info', text: FIRST } });
      return;
    }
    const picture = s.picture;
    patch({ busy: label, message: null });
    try {
      const result = await work(picture);
      if (store.get().picture === picture) patch({ ...result, busy: null });
    } catch (error) {
      showError(error);
    }
  }

  const reopen = async (row: FormatResult): Promise<RgbaImage | null> => {
    if (!row.file) return null;
    try {
      return row.format === 'jpg'
        ? (await codec.decode(row.file)).image
        : await decodeFile(row.file, compression);
    } catch {
      return null; // shown by its size only
    }
  };

  return {
    store,

    /** GC1: Choose a picture… — a file the student picks (it is only read). */
    async choosePicture(): Promise<void> {
      const path = await dialogs.openPicture();
      if (!path) return;
      if (/\.svg$/i.test(path)) {
        patch({
          message: {
            kind: 'info',
            text: 'An SVG is a vector drawing: it is stored as shapes, not pixels. Choose a photo (JPG, PNG, GIF or BMP) to see what compression does to pixels.',
          },
        });
        return;
      }
      patch({ busy: 'Opening the picture…', message: null });
      try {
        const bytes = await files.readBytes(path);
        const { image, width, height } = await open(bytes);
        await show({
          name: fileNameOf(path),
          width,
          height,
          fileBytes: bytes.length,
          dpi: 96,
          image,
        });
      } catch (error) {
        showError(error);
      }
    },

    /** GC1: the image open in Graphics mode, drawn at a size of at most DEMO_MAX_PIXELS. */
    async useGraphic(): Promise<void> {
      if (!renderer) {
        showError(new EditError('Drawing the image needs the OneEditor app.'));
        return;
      }
      const doc = graphic();
      const { width, height } = doc.stage;
      patch({ busy: 'Drawing the image…', message: null });
      try {
        const png = await renderer.renderPng(doc, 0, fitWithin(width, height, DEMO_MAX_PIXELS));
        const { image } = await open(png);
        await show({
          name: 'The image in Graphics mode',
          width,
          height,
          fileBytes: null,
          dpi: graphicOf(doc).dpi,
          image,
        });
      } catch (error) {
        showError(error);
      }
    },

    setQuality,

    /** GC1: the same picture as PNG, GIF, BMP, TIFF and JPG, each opened again to show. */
    compareFormats: () =>
      job('Saving the picture in five formats…', async (picture) => {
        const rows = await compareFormats(picture.image, {
          encode: (format, image, options, c) => {
            patch({ busy: `Saving as ${NAMES[format]}…` });
            return encode(format, image, options, c);
          },
          codec,
          compression,
          dpi: picture.dpi,
          quality: store.get().quality,
        });
        const formats: FormatRow[] = [];
        for (const row of rows) formats.push({ ...row, preview: await reopen(row) });
        return { formats };
      }),

    /** GC1: the coursebook's two lossy examples: fewer colours, fewer pixels. */
    reduce: () =>
      job('Reducing the colours…', async (picture) => {
        const depths = await depthSteps(picture.image, {
          encode,
          compression,
          dpi: picture.dpi,
          decode: (file) => decodeFile(file, compression),
        });
        patch({ busy: 'Reducing the resolution…' });
        const resolutions = await resolutionSteps(picture.image, codec, store.get().quality);
        return { depths, resolutions };
      }),

    /** GC1: the JPEG opened and saved `count` times, each save shown as it is made. */
    resave: (count: number, vary: boolean) =>
      job('Saving the JPEG again…', async (picture) => {
        patch({ generations: [] });
        const all = await generations(
          picture.image,
          { quality: store.get().quality, count, vary },
          codec,
          (step) => {
            patch({
              busy: `Saved ${step.generation} of ${count} times…`,
              generations: [...(store.get().generations ?? []), step],
            });
          },
        );
        return { generations: all };
      }),

    dismiss: () => patch({ message: null }),
  };
}

export type GraphicsLearnApp = ReturnType<typeof createGraphicsLearnApp>;
