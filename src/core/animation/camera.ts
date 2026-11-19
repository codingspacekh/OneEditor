// 2026-11-18 (AN8, as Animate's camera): the camera shows part of the stage — centred on a point,
// zoomed in or out, turned — and moves over time with keyframes, made at the playhead as an
// object's are (an edit at frame 0 with no keyframes just sets it). Its keyframes ease in and out,
// as a camera operator's moves do. Every export draws the objects through it (the background
// fills the picture as it is); the editing stage shows its frame, or looks through it.
import { EditError } from '../model/errors.ts';
import type { Point } from './geometry.ts';
import { setKeyframe, valueAt } from './tween.ts';
import type { AnimationDoc, Camera, CameraProperty, CameraTrack, Stage, Track } from './types.ts';

/** Where the camera is at a frame. */
export interface CameraView {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 1000;
export const CAMERA_PROPERTIES: readonly { id: CameraProperty; label: string }[] = [
  { id: 'x', label: 'Camera X' },
  { id: 'y', label: 'Camera Y' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'rotation', label: 'Camera turn' },
];

/** The camera, or one seeing the whole stage. */
export const cameraOf = (doc: AnimationDoc): Camera =>
  doc.camera ?? { x: doc.stage.width / 2, y: doc.stage.height / 2, zoom: 100, rotation: 0 };

// A camera track is read as an object's track is (only its keyframes and repeat are used).
const asTrack = (t: CameraTrack): Track => t as unknown as Track;

export function cameraAt(doc: AnimationDoc, frame: number): CameraView {
  const c = cameraOf(doc);
  const view: CameraView = { x: c.x, y: c.y, zoom: c.zoom, rotation: c.rotation };
  for (const t of c.tracks ?? [])
    if (t.keyframes.length) view[t.property] = valueAt(asTrack(t), frame) as number;
  return view;
}

function check(property: CameraProperty, value: number): void {
  if (!Number.isFinite(value)) throw new EditError('The camera needs numbers.');
  if (property === 'zoom' && (value < MIN_ZOOM || value > MAX_ZOOM))
    throw new EditError(`The zoom must be between ${MIN_ZOOM} % and ${MAX_ZOOM} %.`);
}

/** The camera's property set at a frame: a keyframe there (the first at frame 0 keeps the old value). */
export function setCameraAt(
  doc: AnimationDoc,
  property: CameraProperty,
  frame: number,
  value: number,
): AnimationDoc {
  check(property, value);
  if (!Number.isInteger(frame) || frame < 0)
    throw new EditError('A keyframe sits on a whole frame, from frame 0.');
  const c = cameraOf(doc);
  const tracks = c.tracks ?? [];
  const track = tracks.find((t) => t.property === property);
  if (!track && frame === 0) return { ...doc, camera: { ...c, [property]: value, tracks } };
  const started: CameraTrack = track ?? {
    property,
    keyframes: [{ frame: 0, value: c[property], easing: 'ease-in-out', hold: false }],
  };
  const keyed = setKeyframe(asTrack(started), { frame, value, easing: 'ease-in-out' });
  const next: CameraTrack = { property, keyframes: keyed.keyframes };
  return {
    ...doc,
    camera: { ...c, tracks: [...tracks.filter((t) => t.property !== property), next] },
  };
}

/** Every camera keyframe at a frame removed (a track left empty goes). */
export function removeCameraKeysAt(doc: AnimationDoc, frame: number): AnimationDoc {
  const c = cameraOf(doc);
  const tracks = c.tracks ?? [];
  if (!tracks.some((t) => t.keyframes.some((k) => k.frame === frame)))
    throw new EditError(`There is no camera keyframe on frame ${frame}.`);
  const kept = tracks
    .map((t) => ({ ...t, keyframes: t.keyframes.filter((k) => k.frame !== frame) }))
    .filter((t) => t.keyframes.length > 0);
  return { ...doc, camera: { ...c, tracks: kept } };
}

/** The camera taken away: the whole stage is seen again. */
export function resetCamera(doc: AnimationDoc): AnimationDoc {
  const rest = { ...doc };
  delete rest.camera;
  return rest;
}

/** True when the camera has a keyframe on the frame. */
export const cameraKeyedAt = (doc: AnimationDoc, frame: number): boolean =>
  (doc.camera?.tracks ?? []).some((t) => t.keyframes.some((k) => k.frame === frame));

/**
 * The matrix (a, b, c, d, e, f, as a canvas's transform) taking a stage point to where it is in the
 * picture: moved so the camera's point is in the middle, zoomed, turned the other way.
 */
export function cameraMatrix(view: CameraView, stage: Pick<Stage, 'width' | 'height'>): number[] {
  const s = view.zoom / 100;
  const r = (-view.rotation * Math.PI) / 180;
  const a = s * Math.cos(r);
  const b = s * Math.sin(r);
  const c = -s * Math.sin(r);
  const d = s * Math.cos(r);
  const e = stage.width / 2 - (a * view.x + c * view.y);
  const f = stage.height / 2 - (b * view.x + d * view.y);
  return [a, b, c, d, e, f].map((n) => (Math.abs(n) < 1e-12 ? 0 : n));
}

/** True when the camera changes nothing (the whole stage, as it is). */
export const isPlainView = (view: CameraView, stage: Pick<Stage, 'width' | 'height'>): boolean =>
  view.zoom === 100 &&
  view.rotation === 0 &&
  view.x === stage.width / 2 &&
  view.y === stage.height / 2;

/** The stage point under a point of the picture (a click on the web page). */
export function fromCamera(
  view: CameraView,
  stage: Pick<Stage, 'width' | 'height'>,
  p: Point,
): Point {
  const [a, b, c, d, e, f] = cameraMatrix(view, stage) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const det = a * d - b * c;
  const x = p.x - e;
  const y = p.y - f;
  return { x: (d * x - c * y) / det, y: (a * y - b * x) / det };
}

/** The corners of what the camera sees, on the stage (top left, top right, bottom right, bottom left). */
export function cameraFrame(view: CameraView, stage: Pick<Stage, 'width' | 'height'>): Point[] {
  const round = (p: Point) => ({
    x: Math.round(p.x * 1000) / 1000,
    y: Math.round(p.y * 1000) / 1000,
  });
  return [
    { x: 0, y: 0 },
    { x: stage.width, y: 0 },
    { x: stage.width, y: stage.height },
    { x: 0, y: stage.height },
  ].map((p) => round(fromCamera(view, stage, p)));
}
