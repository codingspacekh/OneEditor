// The animation document (AN1–AN16): a stage, layers of vector objects, pictures, guides and
// view settings. Plain, immutable, JSON-serialisable data, like the video project (ARCHITECTURE
// §5). Coordinates are stage pixels with (0, 0) at the top left, as the coursebook's rulers;
// an object's x and y are its top-left corner and it turns about its centre.
import type { Bitmap, Mask } from '../graphics/pixels/raster.ts';
import type { Id } from '../model/types.ts';

export type { Id };

/** AN1: the stage. `length` is in frames; the UI shows seconds beside it (AN8). */
export interface Stage {
  width: number;
  height: number;
  /** Hex colour, e.g. "#F4C8EE". */
  background: string;
  fps: number;
  length: number;
  /**
   * AN8, AN15: true: a GIF and the web page play once and stop on the last frame. Absent: they
   * play again and again (as every animation did before the choice existed).
   */
  playOnce?: boolean;
}

/** AN6: a colour between a gradient's first and last, `at` % of the way along (0–100). */
export interface GradientStop {
  at: number;
  colour: string;
}

/**
 * AN6: how the inside of a shape (or the letters of text) is coloured. Colours are hex. A
 * gradient runs from `from` to `to`, through its `stops` (absent: none, as in older files).
 */
export type Paint =
  | { kind: 'none' }
  | { kind: 'solid'; colour: string }
  /** `angle` in degrees: 0 runs left to right, 90 top to bottom. */
  | { kind: 'linear'; from: string; to: string; angle: number; stops?: GradientStop[] }
  /** From its centre outwards: `cx`, `cy` in % of the box (absent: 50, the middle). */
  | { kind: 'radial'; from: string; to: string; stops?: GradientStop[]; cx?: number; cy?: number }
  /**
   * G12 (M19): a repeating pattern: one of the built-in tiles drawn in `colour` on `background`
   * (`'none'`: see-through between), `size` px a tile, turned by `angle`°; or `'picture'`: the
   * picture `pictureId` tiled at `size` px wide.
   */
  | {
      kind: 'pattern';
      pattern: PatternName;
      colour: string;
      background: string;
      size: number;
      angle?: number;
      pictureId?: Id;
    };

/** G12 (M19): the built-in pattern tiles, and a picture tiled. */
export type PatternName =
  'weave' | 'checks' | 'stripes' | 'dots' | 'hatching' | 'crosshatch' | 'bricks' | 'picture';

export type Dash = 'solid' | 'dashed' | 'dotted';

/** AN6: the outline. Width 0 draws nothing. */
export interface Stroke {
  colour: string;
  width: number;
  dash: Dash;
  /** G12 (M19): the outline's own opacity, 0–100 %, under the object's. Absent: 100. */
  opacity?: number;
}

/**
 * G14 (M19): an effect drawn with an object (Animate's filters, Photoshop's layer styles):
 * depth, 3-D, blooms and halos. Offsets and blurs in px, opacity 0–100 %, angles in degrees
 * (as Photoshop's: 0: light from the right, 90: from above, the papers' "light from the top left"
 * is 135).
 */
export type ObjectFilter =
  | { kind: 'dropShadow'; colour: string; dx: number; dy: number; blur: number; opacity: number }
  | { kind: 'innerShadow'; colour: string; dx: number; dy: number; blur: number; opacity: number }
  /** The halo round the Moon, a light bloom: a soft colour all round the outline. */
  | { kind: 'glow'; colour: string; blur: number; opacity: number }
  /** Raised lettering, "3-D" buttons, the metallic plaque: lit on one side, shaded on the other. */
  | {
      kind: 'bevel';
      depth: number;
      blur: number;
      angle: number;
      light: string;
      shadow: string;
      opacity: number;
    }
  /** A soft-edged shape. */
  | { kind: 'blur'; radius: number };

export type FilterKind = ObjectFilter['kind'];

/**
 * GV4 (M19): an envelope bends an object's box into another shape; kept live (the object stays
 * editable) until it is applied, which makes plain paths. Points are fractions of the box (0, 0 =
 * its top left; they may lie outside it). A preset bends by `bend` % (−100 to 100); perspective
 * moves the four corners; a custom envelope's four sides are Bézier curves, each from its first
 * corner to the next going round (top: top left → top right; right: → bottom right; bottom:
 * bottom left → bottom right; left: top left → bottom left), with two control points each.
 */
export type Envelope =
  | { kind: 'preset'; preset: EnvelopePreset; bend: number }
  | { kind: 'perspective'; corners: [EnvPoint, EnvPoint, EnvPoint, EnvPoint] }
  | { kind: 'custom'; sides: EnvelopeSides };

export type EnvelopePreset = 'arch' | 'arc' | 'bulge' | 'flag' | 'wave' | 'rise' | 'squeeze';

export interface EnvPoint {
  x: number;
  y: number;
}

/** GV4: a side from corner a to corner b with control points c1 and c2 (box fractions). */
export interface EnvelopeSide {
  a: EnvPoint;
  c1: EnvPoint;
  c2: EnvPoint;
  b: EnvPoint;
}

export interface EnvelopeSides {
  top: EnvelopeSide;
  right: EnvelopeSide;
  bottom: EnvelopeSide;
  left: EnvelopeSide;
}

/** AN9: how a tween runs from one keyframe to the next. */
export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce';

/** AN9: the properties that can have keyframes. Colours are hex; `text` changes at the keyframe. */
export type TweenProperty =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  /** AN25: the skews, in degrees (absent on an object: 0). */
  | 'skewX'
  | 'skewY'
  | 'opacity'
  | 'fillColour'
  | 'strokeColour'
  | 'strokeWidth'
  | 'radius'
  | 'size'
  | 'text'
  | 'shape'
  /** AN14: the picture a picture object shows (stop motion); it changes at the keyframe. */
  | 'picture';

/** AN10: a shape keyframe's outline, in the object's box scaled to 0–1. */
export interface ShapeValue {
  points: { x: number; y: number }[];
  closed: boolean;
}

export type KeyValue = number | string | ShapeValue;

/** AN9: a value fixed at a frame. `easing` shapes the tween to the next keyframe; `hold` keeps this value until it. */
export interface Keyframe {
  frame: number;
  value: KeyValue;
  easing: Easing;
  hold: boolean;
}

/**
 * AN9, AN13: one property's keyframes, sorted by frame. `repeat` plays the span from the first
 * to the last keyframe again after it ends: `'end'` until the animation ends, or n more times.
 */
export interface Track {
  property: TweenProperty;
  keyframes: Keyframe[];
  repeat?: 'end' | number;
}

/**
 * AN11: a motion path. Between `from` and `to` the object's centre follows the path (in its
 * parent's coordinates: the stage for an object on a layer), at even speed or with an equal share
 * of the time per segment, eased; before and after, it waits at the ends. Oriented, it also turns
 * with the path (a car on a road), on top of its own rotation.
 */
export interface MotionPath {
  points: PathPoint[];
  closed: boolean;
  from: number;
  to: number;
  orient: boolean;
  even: boolean;
  easing: Easing;
  /** The name of the path or shape it was taken from, for the Properties panel. */
  source?: string;
}

/** What every object has (AN6). Rotation in degrees, clockwise; opacity 0–100 %. */
interface ObjectBase {
  id: Id;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill: Paint;
  /** Absent: no outline. */
  stroke?: Stroke;
  /**
   * AN23: mirrored in its own box, left to right (flipX) or top to bottom (flipY), after its turn.
   * Absent: not flipped. Text and pictures are mirrored too, as Animate's Flip does.
   */
  flipX?: boolean;
  flipY?: boolean;
  /**
   * AN25: slanted in its own box, in degrees (−80 to 80), before its flip and turn: skewX leans
   * it as italic letters lean (its top to the right), skewY drops its right side. Absent: 0.
   */
  skewX?: number;
  skewY?: number;
  /**
   * AN27: the point it turns about (Animate's transformation point), as fractions of its box from
   * its top-left corner: { x: 0.5, y: 1 } is the middle of its bottom edge (a meter's needle, a
   * pendulum). It may lie outside the box (a moon going round the Earth). Its flip and skew are
   * about it too, and on a motion path it is this point that follows the path. Absent: the centre.
   */
  pivot?: { x: number; y: number };
  /** G12 (M19): the fill's own opacity, 0–100 %, under the object's. Absent: 100. */
  fillOpacity?: number;
  /** G14 (M19): effects drawn with it, in order. Absent or empty: none. */
  filters?: ObjectFilter[];
  /** GV4 (M19): bent by an envelope or perspective until applied. Absent: not bent. */
  envelope?: Envelope;
  /** AN9: keyframes, one track per animated property. Absent or empty: the object stays still. */
  tracks?: Track[];
  /**
   * AN11: the paths the object follows, in frame order, never overlapping (Task 6: out along one,
   * back along another). Before the first it waits at its start, between two at the end of the one
   * before, after the last at its end. Its position keyframes are not used while it has paths.
   */
  paths?: MotionPath[];
  /**
   * AN14: on a frame-by-frame layer, the keyframe (frame) of the drawing the object belongs to;
   * it is shown from that frame until the layer's next keyframe.
   */
  drawing?: number;
}

export interface RectObject extends ObjectBase {
  kind: 'rect';
  /** Corner radius in px. */
  radius: number;
}

export interface EllipseObject extends ObjectBase {
  kind: 'ellipse';
  /**
   * GV1 (M19): only part of the ellipse: from `start` to `end` degrees clockwise (0 at the right,
   * as the canvas), left open (an arc's line), closed to the centre (a pie slice) or straight
   * across (a chord). Absent: the whole ellipse.
   */
  arc?: { start: number; end: number; close: ArcClose };
}

export type ArcClose = 'open' | 'pie' | 'chord';

export interface StarObject extends ObjectBase {
  kind: 'star';
  points: number;
  /** The inner radius as a fraction of the outer one (0–1). */
  inner: number;
}

export interface PolygonObject extends ObjectBase {
  kind: 'polygon';
  sides: number;
}

/** One anchor of a path, in the object's own box (0, 0 = its top left), with optional handles. */
export interface PathPoint {
  x: number;
  y: number;
  /** The control point of the curve arriving here. */
  in?: { x: number; y: number };
  /** The control point of the curve leaving here. */
  out?: { x: number; y: number };
  /**
   * GV3 (M19): how its handles move together: cusp (each on its own), smooth (in line, each its
   * own length; asymmetrical), symmetrical (in line and equal). Absent: cusp, as before.
   */
  type?: NodeType;
}

export type NodeType = 'cusp' | 'smooth' | 'symmetrical';

/** AN3: a line (two points), a pen or brush path. Points stay inside the box; resizing scales them. */
export interface PathObject extends ObjectBase {
  kind: 'path';
  points: PathPoint[];
  closed: boolean;
  /**
   * AN24: holes cut out of a closed shape (Combine ▸ Cut out), each an outline in the same box,
   * filled even-odd. Absent: no holes.
   */
  holes?: PathPoint[][];
  /**
   * GT4 (M20): how its outline and holes are filled: 'nonzero' as a font fills its letters (a
   * letter made curves: its overlapping strokes stay filled, its counters, wound the other way,
   * stay holes). Absent: even-odd (each hole cut out).
   */
  fillRule?: 'nonzero' | 'evenodd';
}

export type TextAlign = 'left' | 'centre' | 'right';

/** AN4: words in a bundled font (X2). `fill` colours the letters; `stroke` outlines them. */
export interface TextObject extends ObjectBase {
  kind: 'text';
  text: string;
  font: string;
  /** Font size in px. */
  size: number;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  /**
   * AN26: the words bent along an arc, −100 to 100: up like a rainbow when more than 0, down like
   * a smile when less; at ±100 the widest line closes into a circle. Absent: 0, straight.
   */
  curve?: number;
  /**
   * GT1 (M20): space added after every letter but a line's last, in thousandths of an em (as
   * tracking in Illustrator and Photoshop), so it grows with the letters; less than 0 tightens.
   * Absent: 0.
   */
  letterSpacing?: number;
  /**
   * GT1 (M20): kerning, the space between two letters only: `kerning[i]` is added after the i-th
   * character of `text` (new lines counted), in thousandths of an em. Absent or 0: none.
   */
  kerning?: number[];
  /** GT1 (M20): the line height, in times the size. Absent: 1.2. */
  lineSpacing?: number;
  /**
   * GT2 (M20): the words follow this path or shape's outline instead of a line (Absent: on a
   * line, or curved by `curve`). Its points are in the text's own box.
   */
  path?: TextPath;
  /** GT3 (M20): the words wrap inside this closed shape, in the text's own box. */
  inShape?: TextShape;
}

/**
 * GT2 (M20): text on a path. The letters start `start` % of the way along and stand on the
 * outline: `outside` on the left of the way it runs (above a line drawn left to right, outside a
 * shape drawn clockwise), `inside` hanging on the other side, `centred` halfway through it
 * (9626/04 M/22: "each letter halfway through the outline"). `flip` runs them the other way. The
 * path itself is drawn only when it has a `stroke` ("do not show the path").
 */
export interface TextPath {
  points: PathPoint[];
  closed: boolean;
  start: number;
  side: TextSide;
  flip?: boolean;
  stroke?: Stroke;
}

export type TextSide = 'outside' | 'inside' | 'centred';

/** GT3 (M20): text in a shape: the lines wrap inside its outline, `padding` px in from it. */
export interface TextShape {
  points: PathPoint[];
  holes?: PathPoint[][];
  padding: number;
}

/** AN5: an imported picture, kept in `AnimationDoc.pictures`. */
export interface PictureObject extends ObjectBase {
  kind: 'picture';
  pictureId: Id;
}

/** AN18: what a button does when it is clicked (in the HTML page and in Test). */
export type ButtonAction = 'pause' | 'continue' | 'restart' | 'goto';

/**
 * AN18: a button (workbook Task 4: Pause and Continue). Its box is filled and outlined as a shape;
 * the label is drawn in the middle in the bundled Inter, `size` px, in `colour`.
 */
export interface ButtonObject extends ObjectBase {
  kind: 'button';
  label: string;
  action: ButtonAction;
  /** For "Go to frame": the frame to go to. */
  frame?: number;
  size: number;
  colour: string;
}

/** AN13: a group's children are placed inside its box and move, turn and scale with it. */
export interface GroupObject extends ObjectBase {
  kind: 'group';
  children: AnimObject[];
}

export type AnimObject =
  | RectObject
  | EllipseObject
  | StarObject
  | PolygonObject
  | PathObject
  | TextObject
  | PictureObject
  | ButtonObject
  | GroupObject;

export type ObjectKind = AnimObject['kind'];

/** AN7: a layer. The first layer in the list is at the bottom; the last is in front. */
export interface Layer {
  id: Id;
  name: string;
  visible: boolean;
  locked: boolean;
  /** The folder it is in, if any. */
  folderId?: Id;
  /** The colour tag shown in the Layers panel. */
  colour?: string;
  /** AN12: a mask: its shapes restrict what is seen of the layer directly beneath it. */
  mask?: boolean;
  /**
   * GV8 (M19): a template to draw over (Chip.png, Plane.jpg): shown faded, locked, and never
   * exported or sent to Animation mode.
   */
  template?: boolean;
  /**
   * AN14: a frame-by-frame layer: the frames where a new drawing starts, sorted, the first 0.
   * Each drawing (the objects whose `drawing` is that frame) is held until the next one.
   */
  drawings?: number[];
  /** Drawing order: the first object is at the back. */
  objects: AnimObject[];
  /** G2 (M21): how strongly the whole layer is drawn, 0–1, as one picture. Absent: 1. */
  opacity?: number;
  /** G2 (M21): how the layer's colours mix with what is below it. Absent: normal. */
  blend?: BlendMode;
  /**
   * G2 (M21): a clipping mask: the layer is seen only where the nearest layer below it that is
   * not itself clipped (its base) has something drawn (the photo inside the circle).
   */
  clip?: boolean;
  /**
   * G2, GB1 (M21): a pixel layer (Graphics mode only): its pixels, where its top left lies on the
   * image, and its layer mask. A pixel layer has no objects; Send to Animation makes it a picture.
   */
  pixels?: PixelContent;
}

/** G2 (M21): the blend modes of the Layers panel, named as the canvas names them where it can. */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'colour'
  | 'luminosity'
  | 'difference';

export const BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'colour',
  'luminosity',
  'difference',
];

/** G2, GB1, GB2 (M21): what a pixel layer holds. */
export interface PixelContent {
  bitmap: Bitmap;
  /** Where the bitmap's top-left pixel is on the image, in whole image px (may be outside it). */
  x: number;
  y: number;
  /**
   * GB2: the layer mask, the bitmap's size and at its place (it moves with the layer): 255 shows
   * the pixel, 0 hides it, between: partly. Absent: all shown.
   */
  mask?: Mask;
  /**
   * M22 (GN2): a live preview only, never in a document that is kept: each bitmap pixel covers
   * `scale` image px (a reduced copy, drawn at the layer's own size).
   */
  scale?: number;
}

export interface LayerFolder {
  id: Id;
  name: string;
  open: boolean;
}

/** AN5: a picture file used by picture objects. The path is relative to the animation file (X1). */
export interface Picture {
  id: Id;
  path: string;
  width: number;
  height: number;
}

/**
 * AN28: a sound in the animation (a secondary component, syllabus 20.1): a sound file (its path
 * relative to the animation file, X1) or a built-in sound effect (X8), heard from the frame
 * `start`. Several sounds may overlap: they are mixed.
 */
export interface AnimSound {
  id: Id;
  /** What the timeline shows: the file's name or the sound effect's. */
  name: string;
  path: string;
  /** X8: the built-in sound effect it was made from; made again if its file has gone. */
  effect?: string;
  /** The whole file's length in seconds. */
  duration: number;
  /** The frame it starts at. */
  start: number;
  /** Trim: the seconds of the file skipped at its start. Absent: 0. */
  offset?: number;
  /** Trim: the seconds heard. Absent: to the end of the file. */
  length?: number;
  /** 0–200 %; 100 is the file as it is. */
  volume: number;
  /** Seconds of fading in and out. Absent: none. */
  fadeIn?: number;
  fadeOut?: number;
  /** Not heard (kept for later). Absent: heard. */
  muted?: boolean;
}

/** AN2: guides are dragged out of the rulers; stage pixels. */
export interface Guides {
  /** Vertical guides, by their x. */
  x: number[];
  /** Horizontal guides, by their y. */
  y: number[];
}

/** AN2: rulers, grid and snapping, saved with the animation as Animate saves them. */
export interface ViewSettings {
  rulers: boolean;
  grid: { show: boolean; size: number; over: boolean };
  snap: { grid: boolean; guides: boolean; objects: boolean; pixels: boolean };
  /** GV7 (M19): View ▸ Outline: every shape as a thin line, no fills. Absent: off. */
  wireframe?: boolean;
}

/** G1, G6 (Graphics mode, M18): the units sizes are typed and shown in. */
export type Unit = 'px' | 'cm' | 'mm' | 'in' | 'pt';

/**
 * G1, G10 (Graphics mode, M18): what makes a document a still image (a `.mveg`): its resolution
 * in dots per inch, which turns pixels into a printed size (A4, 10 cm), and the units its rulers
 * and sizes are shown in. The stage is the canvas; its one frame is the picture.
 */
export interface GraphicSettings {
  dpi: number;
  units: Unit;
}

export interface AnimationDoc {
  /**
   * 2 since M14 (keyframes), 3 since M15 (paths, morphs, masks), 4 since M16 (buttons, stop
   * motion and frame-by-frame layers), 5 since M19 (patterns, effects, envelopes, arcs, node
   * types, template layers); older apps refuse newer files.
   */
  schemaVersion: 5;
  name: string;
  stage: Stage;
  /** G1 (M18): present in a Graphics mode image, absent in an animation. */
  graphic?: GraphicSettings;
  layers: Layer[];
  folders: LayerFolder[];
  pictures: Picture[];
  /** AN28: absent when there are none, so older versions of the app still open the file. */
  sounds?: AnimSound[];
  guides: Guides;
  view: ViewSettings;
}
