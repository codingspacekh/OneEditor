// M23 exit gate (phase 3): the last of the workbook's Graphics tasks, the formats and the task
// checker, done in Graphics mode as a student does them. Workbook Chapter 6 Task 1 (both parts:
// layers reordered, a shadow, a gradient of several colours, an ellipse made a circle, a shape's
// points added and moved; text skewed to a guide, objects grouped, aligned, rotated, united and
// merged on the grid) — its Task1.svg and Task1_2.svg are not available, so their shapes are made
// with the app's commands; Task 6.1 (cables removed with the repair and clone tools) and Task 8
// (the sky replaced, the small gaps between the leaves too, and a plaque with circular cut-outs) on
// the papers' photos standing in for the workbook's; G11: one image exported as each of the seven
// formats at every depth each holds, every file read back; GC2: never over the opened original;
// the task checker on files the papers ask for.
//
// The canvas is not here: the exports are drawn by a flat renderer (`flatImage`) — the pixel
// layers by the app's own compositor, each vector shape filled (solid or a gradient) and outlined
// through the app's shape rasteriser, at its opacity and fill opacity; effects (shadows) and text
// are left out (the e2e tests check what the canvas draws). JPGs are encoded by the bundled FFmpeg.
// Set M23_LOOK to a folder to have the exported files written there, to be looked at.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { boundsOf, type Bounds, type Point } from '../../src/core/animation/geometry.ts';
import { colourStops, radialCentre } from '../../src/core/animation/gradient.ts';
import { anchorsOnStage, insertPoint, moveAnchor } from '../../src/core/animation/pen.ts';
import { snapBox } from '../../src/core/animation/snap.ts';
import { stateAt } from '../../src/core/animation/state.ts';
import type {
  AnimObject,
  AnimationDoc,
  GroupObject,
  Id,
  Paint,
  PathObject,
  TextObject,
} from '../../src/core/animation/types.ts';
import { hexToRgb } from '../../src/core/colour.ts';
import {
  COLOUR_DEPTHS,
  FORMAT_INFO,
  GRAPHIC_FORMATS,
  keepsTransparency,
  type ColourDepth,
} from '../../src/core/graphics/export.ts';
import { compositeLayers, type DrawnLayer } from '../../src/core/graphics/pixels/merge.ts';
import {
  bitmapFromRGBA,
  pixelAt,
  readRegion,
  type Bitmap,
  type Mask,
  type Rect,
} from '../../src/core/graphics/pixels/raster.ts';
import { resampleBitmap } from '../../src/core/graphics/pixels/resample.ts';
import { objectsMask } from '../../src/core/graphics/pixels/select-objects.ts';
import {
  combineMasks,
  growMask,
  selectedBounds,
} from '../../src/core/graphics/pixels/selection.ts';
import { webCompression } from '../../src/core/image/deflate.ts';
import { decodeBitmap } from '../../src/core/image/decode/index.ts';
import { onBackground, type RgbaImage } from '../../src/core/image/encode/index.ts';
import { imageFacts, type ImageFacts } from '../../src/core/image/info.ts';
import { encodePng } from '../../src/core/image/png.ts';
import { checkFile, imageInfo } from '../../src/core/teaching/task-check.ts';
import { bundledFfmpeg } from '../integration/helpers/ffmpeg.ts';
import { graphics } from './helpers/graphics-app.ts';
import { hasPapers, loadBitmap, paperFile } from './helpers/pixels.ts';

// The papers' photos are up to 8 megapixels here, each step done for real (see M21, M22).
vi.setConfig({ testTimeout: 600_000 });

const CANDIDATE = { centre: 'ZZ999', number: '9999', name: 'Ann' };

/** Width 0 draws no outline (the workbook's shapes have none). */
const NO_STROKE = { colour: '#000000', width: 0, dash: 'solid' as const };

// ---- the flat renderer ----

type Rgb = [number, number, number];

/** Text, pictures and buttons are not drawn here; a mask's text needs no letters. */
const noLetters = (t: TextObject): GroupObject => ({ ...t, kind: 'group', children: [] });

/** The colour a paint gives at a pixel of `box`, or null for none. */
function paintAt(p: Paint, box: Rect): ((x: number, y: number) => Rgb) | null {
  if (p.kind === 'none') return null;
  if (p.kind === 'solid' || p.kind === 'pattern') {
    const c = hexToRgb(p.colour);
    return () => [c.r, c.g, c.b];
  }
  const stops = colourStops(p).map((s) => ({ at: s.offset, c: hexToRgb(s.colour) }));
  const along = (t: number): Rgb => {
    const u = Math.max(0, Math.min(1, t));
    let i = 0;
    while (i < stops.length - 2 && u > stops[i + 1]!.at) i++;
    const [a, b] = [stops[i]!, stops[i + 1]!];
    const k = b.at > a.at ? (u - a.at) / (b.at - a.at) : 0;
    return [a.c.r + (b.c.r - a.c.r) * k, a.c.g + (b.c.g - a.c.g) * k, a.c.b + (b.c.b - a.c.b) * k];
  };
  if (p.kind === 'radial') {
    const c = radialCentre(p);
    const cx = box.x + (box.width * c.x) / 100;
    const cy = box.y + (box.height * c.y) / 100;
    const r = Math.hypot(box.width, box.height) / 2;
    return (x, y) => along(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r);
  }
  const a = (p.angle * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a), Math.sin(a)];
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const half = (Math.abs(box.width * dx) + Math.abs(box.height * dy)) / 2 || 1;
  return (x, y) => along(((x + 0.5 - cx) * dx + (y + 0.5 - cy) * dy) / (2 * half) + 0.5);
}

/** Puts a colour down through a mask at `alpha` (0–1), over what is there (straight alpha). */
function putThrough(
  rgba: Uint8ClampedArray,
  width: number,
  mask: Mask,
  colour: (x: number, y: number) => Rgb,
  alpha: number,
) {
  const box = selectedBounds(mask);
  if (!box || alpha <= 0) return;
  const m = readRegion(mask, box);
  for (let j = 0; j < box.height; j++)
    for (let i = 0; i < box.width; i++) {
      const a = (m[j * box.width + i]! / 255) * alpha;
      if (a <= 0) continue;
      const x = box.x + i;
      const y = box.y + j;
      const k = (y * width + x) * 4;
      const [r, g, b] = colour(x, y);
      const under = (rgba[k + 3]! / 255) * (1 - a);
      const out = a + under;
      rgba[k] = (r * a + rgba[k]! * under) / out;
      rgba[k + 1] = (g * a + rgba[k + 1]! * under) / out;
      rgba[k + 2] = (b * a + rgba[k + 2]! * under) / out;
      rgba[k + 3] = out * 255;
    }
}

/** One object drawn: a group's parts each placed by the groups around them (`wrap`). */
function drawObject(
  rgba: Uint8ClampedArray,
  size: { width: number; height: number },
  o: AnimObject,
  wrap: (o: AnimObject) => AnimObject = (x) => x,
  opacity = 1,
) {
  const own = (opacity * o.opacity) / 100;
  if (o.kind === 'group') {
    for (const child of o.children)
      drawObject(rgba, size, child, (c) => wrap({ ...o, children: [c] }), own);
    return;
  }
  if (o.kind === 'text' || o.kind === 'picture' || o.kind === 'button') return;
  const area = objectsMask(size.width, size.height, [wrap(o)], noLetters);
  const box = selectedBounds(area);
  if (!box) return;
  const fill = paintAt(o.fill, box);
  if (fill) putThrough(rgba, size.width, area, fill, (own * (o.fillOpacity ?? 100)) / 100);
  if (o.stroke && o.stroke.width > 0) {
    const half = o.stroke.width / 2;
    const ring = combineMasks(growMask(area, half), growMask(area, -half), 'subtract');
    const c = hexToRgb(o.stroke.colour);
    putThrough(
      rgba,
      size.width,
      ring,
      () => [c.r, c.g, c.b],
      (own * (o.stroke.opacity ?? 100)) / 100,
    );
  }
}

/** The image as the export draws it (flat: no effects, no text), at its size or `size`. */
function flatImage(doc: AnimationDoc, size?: { width: number; height: number }): Bitmap {
  const { width, height } = doc.stage;
  const layers: DrawnLayer[] = stateAt(doc, 0).layers.flatMap((l) => {
    if (!l.visible || l.template || l.mask) return [];
    const look = { opacity: l.opacity ?? 1, blend: l.blend ?? 'normal', clip: !!l.clip };
    if (l.pixels) return [{ pixels: l.pixels, ...look }];
    if (l.objects.length === 0) return [];
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (const o of l.objects) drawObject(rgba, { width, height }, o);
    return [{ pixels: { bitmap: bitmapFromRGBA(width, height, rgba), x: 0, y: 0 }, ...look }];
  });
  const whole = compositeLayers(layers, { x: 0, y: 0, width, height }, doc.stage.background);
  return size && (size.width !== width || size.height !== height)
    ? resampleBitmap(whole, size.width, size.height, 'bicubic')
    : whole;
}

const rgbaOf = (b: Bitmap): RgbaImage => ({
  width: b.width,
  height: b.height,
  data: readRegion(b),
});

/** A JPEG of these pixels by the bundled FFmpeg (the app's canvas makes them). */
function ffmpegJpeg(image: RgbaImage, quality: number): Promise<Uint8Array> {
  const { ffmpeg } = bundledFfmpeg();
  const q = Math.round(2 + ((100 - quality) / 100) * 29);
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, [
      ...['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba'],
      ...['-s', `${image.width}x${image.height}`, '-i', '-', '-frames:v', '1'],
      ...['-q:v', String(q), '-pix_fmt', 'yuvj444p', '-f', 'image2pipe', '-c:v', 'mjpeg', '-'],
    ]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on('data', (b: Buffer) => out.push(b));
    p.stderr.on('data', (b: Buffer) => err.push(b));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0
        ? resolve(new Uint8Array(Buffer.concat(out)))
        : reject(new Error(Buffer.concat(err).toString())),
    );
    p.stdin.end(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength));
  });
}

/** Graphics mode on the papers' files, its exports drawn by the flat renderer. */
async function app(files: string[] = []) {
  const s = await graphics(files);
  s.stageRenderer.renderPng.mockImplementation(async (doc, _frame, size) =>
    encodePng({ ...rgbaOf(flatImage(doc, size)), channels: 4 }, webCompression),
  );
  s.stageRenderer.renderPixels.mockImplementation(async (doc, size) =>
    rgbaOf(flatImage(doc, size)),
  );
  s.stageRenderer.renderJpeg.mockImplementation(async (doc, { quality, background, size }) =>
    ffmpegJpeg(onBackground(rgbaOf(flatImage(doc, size)), background), quality),
  );
  const objects = () => s.doc().layers.flatMap((l) => l.objects);
  const last = (): AnimObject => objects().at(-1)!;
  const named = (name: string): AnimObject => objects().find((o) => o.name === name)!;
  const layerNamed = (name: string) => s.doc().layers.find((l) => l.name === name)!;
  /** Selects objects and types values in Properties. */
  const type = (o: AnimObject | AnimObject[], values: Partial<AnimObject>) => {
    s.g.select((Array.isArray(o) ? o : [o]).map((x) => x.id));
    expect(s.g.setProperties(values)).toBeNull();
  };
  /** A shape dragged out on the current layer, named and filled. */
  const shape = (
    kind: Parameters<typeof s.g.addShape>[0],
    name: string,
    box: Rect,
    values: Partial<AnimObject> = {},
  ) => {
    s.g.addShape(kind, box);
    type(last(), { name, stroke: NO_STROKE, ...values } as Partial<AnimObject>);
    return named(name);
  };
  /** A new layer above the current one, named. */
  const newLayer = (name: string): Id => {
    s.g.addLayer();
    const id = s.g.store.get().layerId;
    expect(s.g.renameLayer(id, name)).toBeNull();
    return id;
  };
  /**
   * The selection dragged by (dx, dy) on the stage, snapping as the stage snaps it (to the guides,
   * then the grid, within 8 px).
   */
  const drag = (dx: number, dy: number) => {
    const ids = s.g.store.get().selection;
    const u = unionOf(ids.map((id) => objects().find((o) => o.id === id)!));
    const r = snapBox(s.doc(), { ...u, x: u.x + dx, y: u.y + dy }, { threshold: 8, exclude: ids });
    s.g.moveSelection(round2(dx + r.dx), round2(dy + r.dy));
    return r.to;
  };
  return { ...s, objects, last, named, layerNamed, type, shape, newLayer, drag };
}

type App = Awaited<ReturnType<typeof app>>;

const round2 = (v: number) => Math.round(v * 100) / 100;

function unionOf(objects: readonly AnimObject[]): Bounds {
  const bs = objects.map(boundsOf);
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...bs.map((b) => b.x + b.width)) - x,
    height: Math.max(...bs.map((b) => b.y + b.height)) - y,
  };
}

// ---- checking the files ----

const LOOK = process.env.M23_LOOK;

/** Writes a file made to M23_LOOK, to be looked at. */
async function look(name: string, bytes: Uint8Array) {
  if (!LOOK) return;
  await mkdir(LOOK, { recursive: true });
  await writeFile(join(LOOK, name), bytes);
}

let scratch: string | undefined;
/** A JPEG's pixels, read by the bundled FFmpeg. */
async function decodeJpeg(bytes: Uint8Array): Promise<Bitmap> {
  scratch ??= await mkdtemp(join(tmpdir(), 'm23-'));
  const path = join(scratch, `${Math.random().toString(36).slice(2)}.jpg`);
  await writeFile(path, bytes);
  return (await loadBitmap(path)).bitmap;
}

/** The mean colour of a region (its solid pixels). */
function mean(b: Bitmap, r: Rect): Rgb {
  const data = readRegion(b, r);
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
    n++;
  }
  return sum.map((v) => v / Math.max(1, n)) as Rgb;
}

const near = (a: readonly number[], b: readonly number[], within: number) =>
  a.every((v, i) => Math.abs(v - b[i]!) <= within);

const rgb = (hex: string): Rgb => {
  const c = hexToRgb(hex);
  return [c.r, c.g, c.b];
};

/** A colour at `alpha` (0–1) over another. */
const over = (top: Rgb, alpha: number, under: Rgb): Rgb =>
  top.map((v, i) => v * alpha + under[i]! * (1 - alpha)) as Rgb;

/**
 * A pixel at least `by` px inside every one of `inside` and outside every one of `outside` (from
 * the app's own rasteriser), or null.
 */
function pixelWhere(
  size: { width: number; height: number },
  inside: AnimObject[],
  outside: AnimObject[] = [],
  by = 8,
): Point | null {
  const mask = (o: AnimObject) => objectsMask(size.width, size.height, [o], noLetters, false);
  const ins = inside.map((o) => growMask(mask(o), -by));
  const outs = outside.map((o) => growMask(mask(o), by));
  const box = selectedBounds(ins[0]!);
  if (!box) return null;
  const a = ins.map((m) => readRegion(m, box));
  const b = outs.map((m) => readRegion(m, box));
  for (let i = 0; i < a[0]!.length; i++)
    if (a.every((m) => m[i] === 255) && b.every((m) => m[i] === 0))
      return { x: box.x + (i % box.width), y: box.y + Math.floor(i / box.width) };
  return null;
}

// ---- the retouching strokes (as M22) ----

/** A clone or heal stroke: Alt-click the source `offset` away, then paint along `points`. */
function retouch(
  s: App,
  tool: 'clone' | 'heal',
  points: Point[],
  offset: { dx: number; dy: number },
  size: number,
) {
  s.g.setTool(tool);
  expect(s.g.setRetouchBrush({ size, hardness: 50 }, tool)).toBeNull();
  s.g.setCloneSource({ x: points[0]!.x + offset.dx, y: points[0]!.y + offset.dy });
  const stroke = s.g.startRetouch(points[0]!)!;
  expect(stroke).not.toBeNull();
  for (const p of points.slice(1)) stroke.to(p);
  expect(stroke.finish()).toBe(true);
}

/** The share of a region's pixels that differ between two bitmaps. */
function changed(a: Bitmap, b: Bitmap, r: Rect): number {
  const [x, y] = [readRegion(a, r), readRegion(b, r)];
  let n = 0;
  for (let i = 0; i < x.length; i += 4)
    if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2]) n++;
  return n / (r.width * r.height);
}

/** A colour within `within` of a hex colour, at a pixel of an export. */
const isAt = (b: Bitmap, p: Point, hex: string | Rgb, within: number) =>
  near(
    mean(b, { x: p.x - 2, y: p.y - 2, width: 5, height: 5 }),
    typeof hex === 'string' ? rgb(hex) : hex,
    within,
  );

/** The point of a path's outline nearest `on`, by its index among the anchors. */
const anchorNear = (path: PathObject, on: Point) =>
  anchorsOnStage(path).findIndex((a) => Math.hypot(a.x - on.x, a.y - on.y) < 3);

// ---- Workbook Chapter 6 Task 1 ----

describe('Workbook Chapter 6 Task 1 (part 1): Task1.svg edited and saved as Chapter06_Task1.jpg', () => {
  it('two layers swapped, a shadow on the star, a gradient of five colours, the ellipse a circle with a 3 px stroke at 50 % fill, the blue shape’s points added and moved, turned, moved and RGB 255:148:39', async () => {
    const s = await app();
    expect(
      await s.g.newImage({
        name: 'Task1',
        size: { width: 800, height: 400, units: 'px', dpi: 96 },
        background: '#ffffff',
      }),
    ).toBeNull();
    // Task1.svg (Figure 6.6): four shapes, each on a layer of its own; back to front the square,
    // the star in front of it, the ellipse, and the blue shape over the square.
    expect(s.g.renameLayer(s.doc().layers[0]!.id, 'Square')).toBeNull();
    s.shape(
      'rect',
      'Square',
      { x: 115, y: 190, width: 165, height: 165 },
      { fill: { kind: 'solid', colour: '#e75ca8' } },
    );
    s.newLayer('Star');
    s.shape(
      'star',
      'Star',
      { x: 85, y: 5, width: 255, height: 235 },
      { fill: { kind: 'solid', colour: '#e8302c' } },
    );
    s.newLayer('Ellipse');
    s.shape(
      'ellipse',
      'Ellipse',
      { x: 465, y: 12, width: 155, height: 205 },
      { fill: { kind: 'solid', colour: '#7ac943' } },
    );
    const shapeLayer = s.newLayer('Shape');
    const outline: Point[] = [
      { x: 205, y: 300 },
      { x: 300, y: 232 },
      { x: 400, y: 192 },
      { x: 470, y: 200 },
      { x: 495, y: 250 },
      { x: 470, y: 308 },
      { x: 360, y: 318 },
    ];
    s.g.addPath(outline, true);
    s.type(s.last(), {
      name: 'Shape',
      fill: { kind: 'solid', colour: '#5a64ae' },
      stroke: NO_STROKE,
    });
    const size = s.doc().stage;
    // Before: the blue shape is in front of the square where they overlap.
    const overlap = pixelWhere(size, [s.named('Shape'), s.named('Square')])!;
    expect(overlap).not.toBeNull();
    expect(isAt(flatImage(s.doc()), overlap, '#5a64ae', 2)).toBe(true);

    // 1. The order of two layers changed: the ellipse's layer now in front of the shape's.
    s.g.moveLayer(shapeLayer, 2);
    expect(s.doc().layers.map((l) => l.name)).toEqual(['Square', 'Star', 'Shape', 'Ellipse']);
    // 2. A shadow on the star (down and to the left, as the workbook shows it).
    const shadow = {
      kind: 'dropShadow' as const,
      colour: '#808080',
      dx: -10,
      dy: 8,
      blur: 4,
      opacity: 70,
    };
    s.type(s.named('Star'), { filters: [shadow] });
    // 3. The square's fill a gradient through the colours shown, top to bottom.
    const gradient: Paint = {
      kind: 'linear',
      from: '#7ad7e8',
      to: '#ffd84a',
      angle: 90,
      stops: [
        { at: 35, colour: '#e88bc4' },
        { at: 55, colour: '#5a4e8c' },
        { at: 80, colour: '#111111' },
      ],
    };
    s.type(s.named('Square'), { fill: gradient });
    // 4. The ellipse a circle (as wide as it is high), a 3 px outline, its fill at 50 %.
    s.type(s.named('Ellipse'), {
      x: 580,
      y: 20,
      width: 180,
      height: 180,
      stroke: { colour: '#000000', width: 3, dash: 'solid' },
      fillOpacity: 50,
    });
    // 5. Points added to the blue shape (double-clicks on its outline) and pulled out.
    const blue = s.named('Shape') as PathObject;
    expect(blue.points).toHaveLength(7);
    const mid = (i: number): Point => ({
      x: (outline[i]!.x + outline[i + 1]!.x) / 2,
      y: (outline[i]!.y + outline[i + 1]!.y) / 2,
    });
    const pulls: [Point, Point][] = [
      [mid(4), { x: 540, y: 300 }],
      [mid(5), { x: 400, y: 390 }],
      [mid(0), { x: 250, y: 200 }],
    ];
    for (const [on, to] of pulls) {
      s.g.editPath(blue.id, 'Add point', (p) => insertPoint(p, on));
      const i = anchorNear(s.named('Shape') as PathObject, on);
      expect(i).toBeGreaterThan(0);
      s.g.editPath(blue.id, 'Move point', (p) => moveAnchor(p, i, to));
      expect(anchorNear(s.named('Shape') as PathObject, to)).toBe(i);
    }
    expect((s.named('Shape') as PathObject).points).toHaveLength(10);
    //    Turned, moved where Figure 6.7 has it (under the circle), and RGB 255 : 148 : 39.
    s.type(s.named('Shape'), { rotation: 30 });
    const b = boundsOf(s.named('Shape'));
    s.g.select([blue.id]);
    s.g.moveSelection(round2(440 - b.x), round2(95 - b.y));
    s.type(s.named('Shape'), { fill: { kind: 'solid', colour: '#ff9427' } });
    expect(hexToRgb('#ff9427')).toEqual({ r: 255, g: 148, b: 39 });

    // The document as the workbook's Figure 6.7 shows it.
    const star = s.named('Star');
    const square = s.named('Square');
    const circle = s.named('Ellipse');
    const orange = s.named('Shape') as PathObject;
    expect(star.filters).toEqual([shadow]);
    expect(square.fill).toEqual(gradient);
    expect(circle).toMatchObject({ width: 180, height: 180, fillOpacity: 50 });
    expect(circle.stroke).toMatchObject({ width: 3 });
    expect(orange).toMatchObject({ rotation: 30, fill: { kind: 'solid', colour: '#ff9427' } });
    expect(boundsOf(orange).x).toBeCloseTo(440, 1);
    expect(boundsOf(orange).y).toBeCloseTo(95, 1);

    s.g.select([]);
    const bytes = await s.exportTo('/out/Chapter06_Task1.jpg', { format: 'jpg' });
    await look('Chapter06_Task1.jpg', bytes);
    expect(await imageFacts(bytes, 'Chapter06_Task1.jpg')).toMatchObject({
      format: 'jpg',
      width: 800,
      height: 400,
      dpi: { x: 96, y: 96 },
      depth: 24,
      seeThrough: 'none',
    });
    const jpg = await decodeJpeg(bytes);
    // The gradient down the square: cyan at the top (between the star's points), the dark band,
    // yellow at the foot.
    const sq = boundsOf(square);
    const across = (f: number) =>
      mean(jpg, { x: sq.x + 85, y: Math.round(sq.y + sq.height * f) - 2, width: 24, height: 4 });
    expect(near(across(0.03), rgb('#7ad7e8'), 25)).toBe(true);
    expect(near(across(0.8), rgb('#111111'), 25)).toBe(true);
    expect(near(across(0.98), rgb('#ffd84a'), 30)).toBe(true);
    // The star in front of the square, red where they overlap.
    expect(isAt(jpg, pixelWhere(size, [star, square], [orange])!, '#e8302c', 25)).toBe(true);
    const green = over(rgb('#7ac943'), 0.5, [255, 255, 255]);
    // The circle: green at half strength on white, a dark ring at its edge.
    expect(isAt(jpg, pixelWhere(size, [circle], [orange])!, green, 12)).toBe(true);
    const edge = pixelAt(jpg, 580, 110);
    expect(edge[0] + edge[1] + edge[2]).toBeLessThan(330);
    // The orange shape, 255 : 148 : 39 inside it; and where the circle overlaps it the circle is
    // in front (its half-strength green over orange), as the swapped layers put it.
    expect(isAt(jpg, pixelWhere(size, [orange], [circle])!, [255, 148, 39], 12)).toBe(true);
    const both = pixelWhere(size, [orange, circle])!;
    expect(both).not.toBeNull();
    expect(isAt(jpg, both, over(rgb('#7ac943'), 0.5, [255, 148, 39]), 14)).toBe(true);
  });
});

describe('Workbook Chapter 6 Task 1 (part 2): Task1_2.svg arranged and exported as Chapter06_Task1_2_Complete.jpg', () => {
  it('the text skewed, its left edge on 800 px; the three overlapping objects centred on each other, grouped and moved; the ellipse and rectangle grouped, turned 90°, their foot on 1900 px; the red square and blue ellipse united; the star turned 20°', async () => {
    const s = await app();
    expect(
      await s.g.newImage({
        name: 'Task1_2',
        size: { width: 3600, height: 2000, units: 'px', dpi: 72 },
        background: '#ffffff',
      }),
    ).toBeNull();
    // "Use the ruler and grid": rulers and a 100 px grid, shown and snapped to.
    s.g.setView({ rulers: true, grid: { show: true, size: 100, over: false } });
    // Task1_2.svg (Figure 6.8): three overlapping objects on the left, the words, and an ellipse
    // and a rectangle at the bottom.
    expect(s.g.renameLayer(s.doc().layers[0]!.id, 'Shapes')).toBeNull();
    const solid = (colour: string): Partial<AnimObject> => ({ fill: { kind: 'solid', colour } });
    s.shape('rect', 'Red square', { x: 300, y: 880, width: 340, height: 300 }, solid('#e8302c'));
    s.shape(
      'ellipse',
      'Blue ellipse',
      { x: 280, y: 1070, width: 400, height: 380 },
      solid('#5a64ae'),
    );
    s.shape('star', 'Star', { x: 180, y: 1170, width: 620, height: 630 }, solid('#7ac943'));
    s.shape(
      'ellipse',
      'Pink ellipse',
      { x: 1160, y: 1450, width: 400, height: 400 },
      solid('#cc5fae'),
    );
    s.shape('rect', 'Rectangle', { x: 1660, y: 1550, width: 780, height: 210 }, solid('#a99bd0'));
    s.newLayer('Words');
    s.g.addText({ x: 1000, y: 1100 }, 'Creating Digital Graphics');
    s.type(s.last(), { size: 160, fill: { kind: 'solid', colour: '#1f7a5c' } });
    const size = s.doc().stage;
    const words = () => s.named('Creating Digital Graphics') as TextObject;

    // 1. The text skewed and moved up; dragged until its left edge snaps to a guide at 800 px.
    s.type(words(), { skewX: -25, y: 60 });
    s.g.addGuide('x', 800);
    s.g.select([words().id]);
    s.drag(round2(805 - boundsOf(words()).x), 0);
    expect(words().skewX).toBe(-25);
    expect(boundsOf(words()).x).toBeCloseTo(800, 1);

    // 2. The three overlapping objects copied (the copies are for steps 4 and 5, Figure 6.9's
    //    left and middle), then centred on each other, grouped, and moved to the right.
    const three = ['Red square', 'Blue ellipse', 'Star'].map((n) => s.named(n).id);
    s.g.select(three);
    s.g.duplicate();
    const copies = [...s.g.store.get().selection];
    expect(copies).toHaveLength(3);
    s.g.select(three);
    s.g.align('centre', 'selection');
    const centres = three.map((id) => {
      const b = boundsOf(s.objects().find((o) => o.id === id)!);
      return b.x + b.width / 2;
    });
    for (const c of centres) expect(c).toBeCloseTo(centres[0]!, 3);
    s.g.group();
    const group = s.g.store.get().selection[0]!;
    expect((s.objects().find((o) => o.id === group) as GroupObject).children).toHaveLength(3);
    s.drag(2000, -150);
    const moved = s.objects().find((o) => o.id === group)!;
    expect(boundsOf(moved).x).toBeGreaterThan(2100);

    // 3. The ellipse and rectangle grouped, turned through 90° (the ellipse on top), and dragged
    //    until their foot snaps to a guide at 1900 px.
    s.g.select([s.named('Pink ellipse').id, s.named('Rectangle').id]);
    s.g.group();
    const bars = s.g.store.get().selection[0]!;
    s.type(
      s.objects().find((o) => o.id === bars)!,
      { rotation: 90 },
    );
    s.g.addGuide('y', 1900);
    const before = boundsOf(s.objects().find((o) => o.id === bars)!);
    s.g.select([bars]);
    s.drag(round2(3150 - before.x), round2(1895 - (before.y + before.height)));
    const turned = boundsOf(s.objects().find((o) => o.id === bars)!);
    expect(turned.y + turned.height).toBeCloseTo(1900, 1);
    expect(turned.height).toBeGreaterThan(turned.width);

    // 4. The copies of the red square and blue ellipse united into one shape, moved to the middle.
    const [squareCopy, ellipseCopy, starCopy] = copies as [Id, Id, Id];
    s.g.select([squareCopy, ellipseCopy]);
    expect(s.g.combine('union')).toBeNull();
    const united = s.g.store.get().selection;
    expect(united).toHaveLength(1);
    expect(s.objects().some((o) => o.id === squareCopy || o.id === ellipseCopy)).toBe(false);
    s.drag(1000, 0);
    // 5. The star turned through 20°.
    s.type(
      s.objects().find((o) => o.id === starCopy)!,
      { rotation: 20 },
    );

    const unite = s.objects().find((o) => o.id === united[0])!;
    const starTurned = s.objects().find((o) => o.id === starCopy)!;
    expect(starTurned.rotation).toBe(20);
    // Figure 6.9's objects: the words, the group, the turned bars, the united shape, the star.
    expect(s.objects()).toHaveLength(5);

    s.g.select([]);
    const bytes = await s.exportTo('/out/Chapter06_Task1_2_Complete.jpg', { format: 'jpg' });
    await look('Chapter06_Task1_2_Complete.jpg', bytes);
    expect(await imageFacts(bytes, 'Chapter06_Task1_2_Complete.jpg')).toMatchObject({
      format: 'jpg',
      width: 3600,
      height: 2000,
      depth: 24,
    });
    const jpg = await decodeJpeg(bytes);
    // The united shape is one colour, the red square's, where the blue ellipse was too.
    expect(isAt(jpg, pixelWhere(size, [unite])!, '#e8302c', 20)).toBe(true);
    // The turned star, green.
    expect(isAt(jpg, pixelWhere(size, [starTurned], [unite])!, '#7ac943', 20)).toBe(true);
    // Down the group's middle: the red square at the top, the star at the foot (in front).
    const g = boundsOf(moved);
    const cx = Math.round(g.x + g.width / 2);
    expect(isAt(jpg, { x: cx, y: Math.round(g.y + 40) }, '#e8302c', 20)).toBe(true);
    expect(isAt(jpg, { x: cx, y: Math.round(g.y + g.height - 200) }, '#7ac943', 20)).toBe(true);
    // The bars: the pink ellipse above, the rectangle below it.
    const bx = Math.round(turned.x + turned.width / 2);
    expect(isAt(jpg, { x: bx, y: Math.round(turned.y + 200) }, '#cc5fae', 20)).toBe(true);
    expect(isAt(jpg, { x: bx, y: Math.round(turned.y + turned.height - 200) }, '#a99bd0', 20)).toBe(
      true,
    );
  });
});

// ---- Workbook Chapter 6 Tasks 6.1 and 8 (J/22 Scene1.png stands in for the workbook's photos) ----

const SCENE = '2022_06_June/Scene1.png';

/** Light, grey-blue pixels left opaque: the sky (the trees are dark, or orange in the sun). */
function skyLeft(b: Bitmap, r: Rect): number {
  const data = readRegion(b, r);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [red, green, blue, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (a > 0 && Math.min(red, green, blue) > 120 && blue >= red - 8) n++;
  }
  return n;
}

describe.skipIf(!hasPapers)(
  'Workbook Chapter 6 Task 6.1: the cables removed with the clone and repair tools',
  () => {
    it('the post cloned over from beside it, the wires repaired along their length; nothing else touched; Chapter06_Task6.jpg', async () => {
      const s = await app([SCENE]);
      await s.open(SCENE);
      const before = s.pixels().bitmap;
      // The post: the clone stamp, from the trees just to its right.
      retouch(
        s,
        'clone',
        [
          { x: 1287, y: 1795 },
          { x: 1287, y: 2160 },
        ],
        { dx: 90, dy: 0 },
        64,
      );
      // The wires: the repair (heal) brush along them, from the leaves just above.
      retouch(
        s,
        'heal',
        [
          { x: 950, y: 1858 },
          { x: 1350, y: 1860 },
          { x: 1750, y: 1874 },
        ],
        { dx: 0, dy: -60 },
        40,
      );
      const after = s.pixels().bitmap;
      const post = mean(after, { x: 1280, y: 1900, width: 14, height: 250 });
      expect(near(post, mean(after, { x: 1370, y: 1900, width: 14, height: 250 }), 30)).toBe(true);
      // Along the wires every pixel is new, like the leaves above and below them.
      const wires = { x: 1000, y: 1852, width: 700, height: 14 };
      expect(changed(before, after, wires)).toBeGreaterThan(0.8);
      const around = [mean(after, { ...wires, y: 1815 }), mean(after, { ...wires, y: 1905 })];
      const leaves = around[0]!.map((v, i) => (v + around[1]![i]!) / 2);
      expect(near(mean(after, wires), leaves, 25)).toBe(true);
      // The sky, the balloon and the ground are as they were.
      for (const r of [
        { x: 1200, y: 400, width: 800, height: 600 },
        { x: 600, y: 2250, width: 600, height: 150 },
      ])
        expect(changed(before, after, r)).toBe(0);
      const bytes = await s.exportTo('/out/Chapter06_Task6.jpg', { format: 'jpg' });
      await look('Chapter06_Task6.jpg', bytes);
      expect(await imageFacts(bytes, 'Chapter06_Task6.jpg')).toMatchObject({
        format: 'jpg',
        width: 3264,
        height: 2448,
      });
    });
  },
);

describe.skipIf(!hasPapers)(
  'Workbook Chapter 6 Task 8: the sky replaced, between the leaves too, and a plaque',
  () => {
    it('the sky taken with the wand, its pockets between the leaves with a second click not contiguous; another sky beneath; a plaque with circular cut-outs at its corners; Chapter06_Task8.jpg', async () => {
      const s = await app([SCENE, '2022_06_June/Sunset.jpg']);
      await s.open(SCENE);
      const scene = s.layer().id;
      // The sky lightens towards the trees: clicked high, in the middle and low (beside the balloon,
      // which stays), added together.
      s.g.selectByWand({ x: 600, y: 300 }, { tolerance: 24, contiguous: true });
      for (const y of [800, 1200, 1450])
        s.g.selectByWand({ x: 600, y }, { tolerance: 24, contiguous: true, mode: 'add' });
      const crowns = { x: 1500, y: 1420, width: 900, height: 340 };
      const photo = s.pixels().bitmap;
      const pockets = skyLeft(photo, crowns);
      expect(pockets).toBeGreaterThan(2000);
      // "Pay special attention to the small areas between the leaves": the wand again, not
      // contiguous, takes the sky's colour wherever it shows through.
      s.g.selectByWand({ x: 600, y: 1200 }, { tolerance: 24, contiguous: false, mode: 'add' });
      expect(s.g.deleteSelectedPixels()).toBe(true);
      s.g.deselectPixels();
      const cut = s.pixels().bitmap;
      expect(skyLeft(cut, crowns)).toBeLessThan(pockets * 0.25);
      for (const y of [300, 900, 1400]) expect(pixelAt(cut, 600, y)[3]).toBe(0);
      // The balloon stays, in front of the new sky.
      expect(pixelAt(cut, 1600, 900)[3]).toBe(255);
      // The leaves themselves stay.
      expect(pixelAt(cut, 1500, 1500)[3]).toBe(255);
      // The other sky on a layer beneath, filling the width.
      await s.addLayer('2022_06_June/Sunset.jpg');
      const sunset = s.layer().id;
      expect(
        s.g.transformPixelLayer({
          reference: 'top-left',
          x: 0,
          y: 0,
          width: 3264,
          keepProportions: true,
        }),
      ).toBeNull();
      await s.g.pixelWork();
      s.g.moveLayer(sunset, 0);
      expect(s.doc().layers.map((l) => l.id)).toEqual([sunset, scene]);
      const replaced = flatImage(s.doc());
      expect(pixelAt(replaced, 600, 300)[3]).toBe(255);
      // The plaque: on a layer of its own at the top, a plate with a circle cut from each corner,
      // its title on it.
      s.g.selectLayer(scene);
      s.newLayer('Plaque');
      const plate = s.shape(
        'rect',
        'Plaque',
        { x: 1232, y: 2060, width: 800, height: 260 },
        { fill: { kind: 'solid', colour: '#b08d57' } },
      );
      const holes = [
        [1260, 2088],
        [1948, 2088],
        [1260, 2236],
        [1948, 2236],
      ].map(([x, y], i) =>
        s.shape('ellipse', `Hole ${i + 1}`, { x: x!, y: y!, width: 56, height: 56 }),
      );
      s.g.select([plate.id, ...holes.map((h) => h.id)]);
      expect(s.g.combine('cutOut')).toBeNull();
      const plaque = s.objects().filter((o) => o.kind !== 'text');
      expect(plaque).toHaveLength(1);
      s.g.addText({ x: 1420, y: 2140 }, 'The Goddess');
      s.type(s.last(), { size: 90, fill: { kind: 'solid', colour: '#2b1d0e' } });

      s.g.select([]);
      const bytes = await s.exportTo('/out/Chapter06_Task8.jpg', { format: 'jpg' });
      await look('Chapter06_Task8.jpg', bytes);
      expect(await imageFacts(bytes, 'Chapter06_Task8.jpg')).toMatchObject({
        format: 'jpg',
        width: 3264,
        height: 2448,
      });
      const jpg = await decodeJpeg(bytes);
      // Through each cut-out the photo shows; the plate round it is the plate's colour.
      for (const [x, y] of [
        [1288, 2116],
        [1976, 2116],
        [1288, 2264],
        [1976, 2264],
      ]) {
        const hole = mean(jpg, { x: x! - 6, y: y! - 6, width: 12, height: 12 });
        expect(
          near(hole, mean(replaced, { x: x! - 6, y: y! - 6, width: 12, height: 12 }), 20),
        ).toBe(true);
        expect(near(hole, rgb('#b08d57'), 20)).toBe(false);
      }
      expect(isAt(jpg, { x: 1350, y: 2190 }, '#b08d57', 12)).toBe(true);
      // The sunset behind the trees, where the sky was.
      const at = { x: 600, y: 300, width: 20, height: 20 };
      expect(near(mean(jpg, at), mean(photo, at), 20)).toBe(false);
    });
  },
);

// ---- G11: the seven formats at every depth; GC2; the task checker ----

/** A picture with a see-through margin, a gradient and a red disc, for every format. */
async function formatsImage() {
  const s = await app();
  expect(
    await s.g.newImage({
      name: 'Formats',
      size: { width: 240, height: 160, units: 'px', dpi: 300 },
      background: 'none',
    }),
  ).toBeNull();
  s.shape(
    'rect',
    'Band',
    { x: 20, y: 20, width: 200, height: 120 },
    { fill: { kind: 'linear', from: '#1565c0', to: '#ffd84a', angle: 0 } },
  );
  s.shape(
    'ellipse',
    'Disc',
    { x: 90, y: 50, width: 60, height: 60 },
    { fill: { kind: 'solid', colour: '#e8302c' } },
  );
  s.g.select([]);
  return s;
}

describe('G11 (M23): one image exported as each of the seven formats at every depth each holds', () => {
  it('each file reads back as its format, size, depth and dpi; see-through kept where the format can; the colours as near as the depth allows', async () => {
    const s = await formatsImage();
    const disc = { x: 120, y: 80 };
    const corner = { x: 3, y: 3 };
    let made = 0;
    for (const format of GRAPHIC_FORMATS) {
      const depths: (ColourDepth | undefined)[] =
        COLOUR_DEPTHS[format].length > 0 ? [...COLOUR_DEPTHS[format]] : [undefined];
      for (const depth of depths) {
        const name = `Formats-${depth ?? 'vector'}.${FORMAT_INFO[format].extension}`;
        const options = { format, ...(depth ? { depth } : {}) };
        const bytes = await s.exportTo(`/out/${name}`, options);
        await look(name, bytes);
        made++;
        if (format === 'pdf') {
          // The page is printed by the main process; it is given the image's printed size, in
          // inches (240 × 160 px at 300 dpi).
          const [, page] = s.pageAssets.svgToPdf.mock.calls.at(-1)!;
          expect(page.width).toBeCloseTo(0.8, 3);
          expect(page.height).toBeCloseTo(160 / 300, 3);
          continue;
        }
        const facts: ImageFacts = await imageFacts(bytes, name);
        expect(facts.format, name).toBe(format);
        expect(facts.extensionSays, name).toBeUndefined();
        if (format === 'svg') {
          expect(facts).toMatchObject({ kind: 'vector', svg: { bitmaps: 0 } });
          continue;
        }
        expect([facts.width, facts.height], name).toEqual([240, 160]);
        expect(facts.depth, name).toBe(depth);
        // GIF cannot hold a resolution; every other bitmap keeps the 300 dpi.
        if (format !== 'gif') expect(facts.dpi, name).toEqual({ x: 300, y: 300 });
        const keeps = keepsTransparency({ format, ...(depth ? { depth } : {}) });
        if (format === 'jpg') {
          expect(facts.seeThrough).toBe('none');
          const jpg = await decodeJpeg(bytes);
          expect(isAt(jpg, disc, '#e8302c', 12), name).toBe(true);
          expect(isAt(jpg, corner, '#ffffff', 6), name).toBe(true);
          continue;
        }
        const picture = await decodeBitmap(bytes, webCompression);
        expect(picture.format, name).toBe(format);
        const b = bitmapFromRGBA(picture.width, picture.height, picture.data);
        const at = (p: Point) => [...pixelAt(b, p.x, p.y)];
        if (keeps) {
          expect(at(corner)[3], name).toBe(0);
          expect(facts.seeThrough, name).toBe('used');
        } else {
          expect(at(corner), name).toEqual([255, 255, 255, 255]);
        }
        if (!(depth === 1 && keeps)) expect(at(disc)[3], name).toBe(255);
        if (depth === 1) {
          // 1 bit: black and white, dithered — the picture still seen as dots: the disc and the
          // gradient's blue end darker than its yellow end. Kept see-through, the one entry
          // left is black.
          const colours = new Set<string>();
          for (let i = 0; i < picture.data.length; i += 4)
            if (picture.data[i + 3]! > 0) colours.add(picture.data.subarray(i, i + 3).join());
          expect([...colours].sort(), name).toEqual(keeps ? ['0,0,0'] : ['0,0,0', '255,255,255']);
          if (!keeps) {
            const light = (r: Rect) => mean(b, r)[0];
            const yellow = light({ x: 190, y: 30, width: 25, height: 100 });
            expect(light({ x: 25, y: 30, width: 25, height: 100 }), name).toBeLessThan(yellow - 60);
            expect(light({ x: 105, y: 65, width: 30, height: 30 }), name).toBeLessThan(yellow - 60);
          }
          continue;
        }
        // The red disc: exact at 24 and 32 bits, near with a palette of 256 or 16 colours.
        const within = { 32: 2, 24: 2, 8: 40, 4: 90 }[depth as 32 | 24 | 8 | 4];
        expect(near(at(disc).slice(0, 3), rgb('#e8302c'), within), name).toBe(true);
      }
    }
    // 5 PNG + 1 JPG + 3 GIF + 5 BMP + 4 TIFF + SVG + PDF.
    expect(made).toBe(20);
  });
});

describe.skipIf(!hasPapers)(
  'GC2 (M23): an export never over the photo the image was opened from',
  () => {
    it('Pearl.jpg exported over itself is refused in words, the original kept; the save box offers Pearl-edited with the candidate’s details', async () => {
      const pearl = paperFile('2019_11_November/Pearl.jpg');
      const s = await app(['2019_11_November/Pearl.jpg']);
      await s.open('2019_11_November/Pearl.jpg');
      const original = new Uint8Array(await readFile(pearl));
      s.dialogs.exportGraphic.mockResolvedValueOnce(pearl);
      await s.g.exportImage({ format: 'jpg' });
      expect(s.dialogs.exportGraphic.mock.calls.at(-1)![0]).toBe('Pearl-edited_ZZ999_9999');
      expect(s.g.store.get().message).toMatchObject({ kind: 'error' });
      expect(s.g.store.get().message!.text).toMatch(/Pearl-edited\.jpg/);
      expect(s.bytes.get(pearl)).toEqual(original);
      // Another name is fine; a PNG is offered under the photo's own name.
      await s.exportTo('/out/Pearl-edited.jpg', { format: 'jpg' });
      await s.exportTo('/out/Pearl.png', { format: 'png' });
      expect(s.dialogs.exportGraphic.mock.calls.at(-1)![0]).toBe('Pearl_ZZ999_9999');
    });
  },
);

describe('GL2, P8 (M23): the task checker on the files the papers ask for', () => {
  it.skipIf(!hasPapers)(
    'O/N/19 Pearl: a PNG 210 px wide with a transparent background, named for the candidate; a JPG fails',
    async () => {
      const s = await app(['2019_11_November/Pearl.jpg']);
      await s.open('2019_11_November/Pearl.jpg');
      expect(s.g.trimCanvas(true)).toBe(true);
      s.g.selectByWand({ x: 0, y: 0 }, { tolerance: 12, contiguous: false });
      expect(s.g.deleteSelectedPixels()).toBe(true);
      s.g.deselectPixels();
      const task = {
        name: 'Pearl',
        container: 'png',
        width: 210,
        transparent: true,
        fileName: 'Pearl',
        examName: true,
      };
      const png = await s.exportTo('/out/Pearl_ZZ999_9999.png', {
        format: 'png',
        size: { by: 'width', px: 210 },
      });
      const ok = checkFile(
        task,
        imageInfo(await imageFacts(png, 'Pearl_ZZ999_9999.png'), 'Pearl_ZZ999_9999.png'),
        CANDIDATE,
      );
      expect(ok.rows.filter((r) => !r.pass)).toEqual([]);
      expect(ok.pass).toBe(true);
      // A JPG cannot keep the background see-through, and the name lacks the candidate number.
      const jpg = await s.exportTo('/out/Pearl.jpg', {
        format: 'jpg',
        size: { by: 'width', px: 210 },
      });
      const bad = checkFile(
        task,
        imageInfo(await imageFacts(jpg, 'Pearl.jpg'), 'Pearl.jpg'),
        CANDIDATE,
      );
      expect(bad.pass).toBe(false);
      const failed = bad.rows.filter((r) => !r.pass).map((r) => r.label);
      expect(failed).toContain('File format');
      expect(failed.length).toBeGreaterThanOrEqual(3);
    },
  );

  it('M/22 Heron: an SVG 10 cm square with no bitmaps and a 200 px PNG, each named for the candidate', async () => {
    const s = await app();
    expect(
      await s.g.newImage({
        name: 'HeronV10cm',
        size: { width: 10, height: 10, units: 'cm', dpi: 96 },
        background: '#ffffff',
      }),
    ).toBeNull();
    const side = s.doc().stage.width;
    s.shape(
      'ellipse',
      'Ring',
      { x: 20, y: 40, width: side - 40, height: side - 80 },
      { fill: { kind: 'none' }, stroke: { colour: '#ff0000', width: 24, dash: 'solid' } },
    );
    s.g.select([]);
    const svg = await s.exportTo('/exam/HeronV10cm_ZZ999_9999.svg', { format: 'svg' });
    const svgCheck = checkFile(
      {
        name: 'HeronV10cm',
        container: 'svg',
        printWidth: 10,
        printHeight: 10,
        noBitmaps: true,
        fileName: 'HeronV10cm',
        examName: true,
      },
      imageInfo(await imageFacts(svg, 'HeronV10cm_ZZ999_9999.svg'), 'HeronV10cm_ZZ999_9999.svg'),
      CANDIDATE,
    );
    expect(svgCheck.rows.filter((r) => !r.pass)).toEqual([]);
    const png = await s.exportTo('/exam/HeronV200px_ZZ999_9999.png', {
      format: 'png',
      size: { by: 'width', px: 200 },
    });
    const pngCheck = checkFile(
      {
        name: 'HeronV200px',
        container: 'png',
        width: 200,
        height: 200,
        fileName: 'HeronV200px',
        examName: true,
      },
      imageInfo(await imageFacts(png, 'HeronV200px_ZZ999_9999.png'), 'HeronV200px_ZZ999_9999.png'),
      CANDIDATE,
    );
    expect(pngCheck.rows.filter((r) => !r.pass)).toEqual([]);
  });
});
