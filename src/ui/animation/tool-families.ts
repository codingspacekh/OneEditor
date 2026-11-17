// The tool strip's tools in families (issues 2026-11-17: "instead of scroll, group and classify
// the tools"): as Photoshop's and Illustrator's toolboxes, each family is one button in the strip
// showing the tool of it last used, and holding it (or right-clicking it, or clicking its corner)
// opens the rest of the family. Animation and Graphics share the families; a tool for one mode
// only is left out of the other (Graphics' selections, paint and retouching; Animation's button).
// The tests use the same list to reach a tool behind its family (tests/helpers/tools.ts,
// tests/e2e/app.ts pickTool).
import type { Tool } from '../../app/animation.ts';
import { withWhy } from '../../core/effects/help.ts';

export interface ToolInfo {
  tool: Tool;
  /** The button's name (what the tests click). */
  label: string;
  /** An icon of Icon.svelte. */
  icon: string;
  /** The tooltip (with its "Why use this?" where there is one). */
  title: string;
  /** The key that picks it, if any (the modes' TOOL_KEYS). */
  key?: string;
  /** Only in one mode. */
  only?: 'graphics' | 'animation';
}

export interface ToolFamily {
  id: string;
  /** The family's name: its flyout and corner button ("Shapes tools"). */
  label: string;
  tools: ToolInfo[];
  /** Families between two lines in the strip share a group (drawing, selecting, painting …). */
  group: number;
}

export const TOOL_FAMILIES: readonly ToolFamily[] = [
  {
    id: 'select',
    label: 'Select',
    group: 0,
    tools: [
      {
        tool: 'select',
        label: 'Select',
        icon: 'select',
        title: 'Select, move, resize and turn objects (V)',
        key: 'V',
      },
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    group: 1,
    tools: [
      {
        tool: 'rect',
        label: 'Rectangle',
        icon: 'rect',
        title: withWhy('Drag out a rectangle (R); Shift for a square', 'vectorShapes'),
        key: 'R',
      },
      {
        tool: 'ellipse',
        label: 'Ellipse',
        icon: 'ellipse',
        title: withWhy('Drag out an ellipse (E); Shift for a circle', 'vectorShapes'),
        key: 'E',
      },
      {
        tool: 'star',
        label: 'Star',
        icon: 'star',
        title: withWhy('Drag out a star (S)', 'vectorShapes'),
        key: 'S',
      },
      {
        tool: 'polygon',
        label: 'Polygon',
        icon: 'polygon',
        title: withWhy('Drag out a polygon (G)', 'vectorShapes'),
        key: 'G',
      },
      // GV1 (M19): an arc (ends and how it closes in Properties), a spiral.
      {
        tool: 'arc',
        label: 'Arc',
        icon: 'arc',
        title: withWhy(
          'Drag out an arc: half an ellipse (C); Shift for a circle’s',
          'graphicShapes',
        ),
        key: 'C',
      },
      {
        tool: 'spiral',
        label: 'Spiral',
        icon: 'spiral',
        title: withWhy('Drag out a spiral (O); its turns are in Properties', 'graphicShapes'),
        key: 'O',
      },
    ],
  },
  {
    id: 'lines',
    label: 'Pen and lines',
    group: 1,
    tools: [
      {
        tool: 'pen',
        label: 'Pen',
        icon: 'pen',
        title: withWhy(
          'Click points for a path (P); double-click or Enter to finish, click the first point to close',
          'vectorShapes',
        ),
        key: 'P',
      },
      {
        tool: 'line',
        label: 'Line',
        icon: 'line',
        title: withWhy('Drag a straight line (L)', 'vectorShapes'),
        key: 'L',
      },
      {
        tool: 'polyline',
        label: 'Polyline',
        icon: 'polyline',
        title: withWhy(
          'Click points for straight lines (Y); double-click or Enter to finish, click the first point to close; Shift for 15° steps',
          'graphicShapes',
        ),
        key: 'Y',
      },
      {
        tool: 'brush',
        label: 'Brush',
        icon: 'brush',
        title: withWhy('Draw freehand (B)', 'vectorShapes'),
        key: 'B',
      },
    ],
  },
  {
    id: 'text',
    label: 'Text',
    group: 1,
    tools: [
      {
        tool: 'text',
        label: 'Text',
        icon: 'text',
        title: withWhy('Click to add text (T)', 'animText'),
        key: 'T',
      },
    ],
  },
  {
    id: 'picture',
    label: 'Picture',
    group: 1,
    tools: [
      {
        tool: 'picture',
        label: 'Picture',
        icon: 'picture',
        title: withWhy('Click to place a picture file (I)', 'animPicture'),
        key: 'I',
      },
    ],
  },
  {
    id: 'button',
    label: 'Button',
    group: 1,
    tools: [
      {
        tool: 'button',
        label: 'Button',
        icon: 'button',
        title: withWhy(
          'Click to place a button: Pause, Continue, Restart or Go to frame (U)',
          'animButton',
        ),
        key: 'U',
        // M18: a still image has no buttons to click (AN18 is for animations).
        only: 'animation',
      },
    ],
  },
  // GB2 (M21): the selection tools; their options show above the canvas.
  {
    id: 'marquee',
    label: 'Marquee',
    group: 2,
    tools: [
      {
        tool: 'select-rect',
        label: 'Rectangle select',
        icon: 'marqueeRect',
        title:
          'Rectangle select: drag over the pixels (M); Shift while dragging for a square. Shift adds, Alt subtracts, both intersect',
        key: 'M',
        only: 'graphics',
      },
      {
        tool: 'select-ellipse',
        label: 'Ellipse select',
        icon: 'marqueeEllipse',
        title: 'Ellipse select: drag over the pixels; Shift while dragging for a circle',
        only: 'graphics',
      },
    ],
  },
  {
    id: 'lasso',
    label: 'Lasso',
    group: 2,
    tools: [
      {
        tool: 'lasso',
        label: 'Lasso',
        icon: 'lasso',
        title: 'Lasso: drag round the part to select it freehand',
        only: 'graphics',
      },
      {
        tool: 'polygon-lasso',
        label: 'Polygonal lasso',
        icon: 'polygonLasso',
        title:
          'Polygonal lasso: click the corners; double-click, Enter or click the first point to close',
        only: 'graphics',
      },
      {
        tool: 'magnetic-lasso',
        label: 'Magnetic lasso',
        icon: 'magneticLasso',
        title: 'Magnetic lasso: drag along an edge and the line snaps to it',
        only: 'graphics',
      },
    ],
  },
  {
    id: 'wand',
    label: 'Magic wand',
    group: 2,
    tools: [
      {
        tool: 'magic-wand',
        label: 'Magic wand',
        icon: 'wand',
        title:
          'Magic wand: click a colour to select it (W): the tolerance and contiguous are above the canvas',
        key: 'W',
        only: 'graphics',
      },
      {
        tool: 'colour-select',
        label: 'Colour select',
        icon: 'colourSelect',
        title:
          'Colour select: click a colour to select every pixel like it, softly by the fuzziness',
        only: 'graphics',
      },
    ],
  },
  // GB4, GB3 (M21): painting on a pixel layer; their options are in Properties.
  {
    id: 'paint',
    label: 'Brushes',
    group: 3,
    tools: [
      {
        tool: 'paintbrush',
        label: 'Paintbrush',
        icon: 'paintbrush',
        title: withWhy(
          'Paintbrush: paint on a pixel layer; Shift-click for a straight line',
          'graphicPaint',
        ),
        only: 'graphics',
      },
      {
        tool: 'pencil',
        label: 'Pencil',
        icon: 'pencil',
        title: withWhy(
          'Pencil: hard pixels, exactly (a 1 px pencil sets one pixel)',
          'graphicPaint',
        ),
        only: 'graphics',
      },
      {
        tool: 'airbrush',
        label: 'Airbrush',
        icon: 'airbrush',
        title: withWhy('Airbrush: builds up colour softly, the longer it is held', 'graphicPaint'),
        only: 'graphics',
      },
    ],
  },
  {
    id: 'eraser',
    label: 'Eraser',
    group: 3,
    tools: [
      {
        tool: 'eraser',
        label: 'Eraser',
        icon: 'eraser',
        title: withWhy(
          'Eraser: rub pixels out to transparent (on a layer mask: hides)',
          'graphicPaint',
        ),
        only: 'graphics',
      },
    ],
  },
  {
    id: 'fill',
    label: 'Fills',
    group: 3,
    tools: [
      {
        tool: 'bucket',
        label: 'Paint bucket',
        icon: 'bucket',
        title: withWhy('Paint bucket: click an area to fill it with the colour', 'graphicFill'),
        only: 'graphics',
      },
      {
        tool: 'gradient',
        label: 'Gradient',
        icon: 'gradient',
        title: withWhy('Gradient: drag a line to fill the layer or the selection', 'graphicFill'),
        only: 'graphics',
      },
    ],
  },
  // GB5 (M22): retouching a pixel layer; their options are in Properties.
  {
    id: 'clone',
    label: 'Clone and heal',
    group: 4,
    tools: [
      {
        tool: 'clone',
        label: 'Clone stamp',
        icon: 'cloneStamp',
        title: withWhy(
          'Clone stamp: Alt-click (Option-click on a Mac) where to copy from, then paint over what to remove',
          'graphicClone',
        ),
        only: 'graphics',
      },
      {
        tool: 'heal',
        label: 'Heal',
        icon: 'heal',
        title: withWhy(
          'Heal: as the clone stamp, then the colour and light are matched to the surroundings (sky, sea, walls)',
          'graphicClone',
        ),
        only: 'graphics',
      },
    ],
  },
  {
    id: 'retouch',
    label: 'Retouch',
    group: 4,
    tools: [
      {
        tool: 'blur-brush',
        label: 'Blur brush',
        icon: 'blurDrop',
        title: withWhy('Blur brush: soften the places painted', 'graphicRetouch'),
        only: 'graphics',
      },
      {
        tool: 'sharpen-brush',
        label: 'Sharpen brush',
        icon: 'sharpen',
        title: withWhy(
          'Sharpen brush: bring out the detail in the places painted',
          'graphicRetouch',
        ),
        only: 'graphics',
      },
      {
        tool: 'smudge',
        label: 'Smudge',
        icon: 'smudge',
        title: withWhy(
          'Smudge: drag colour along the stroke, as a finger in wet paint',
          'graphicRetouch',
        ),
        only: 'graphics',
      },
      {
        tool: 'red-eye',
        label: 'Red eye',
        icon: 'redEye',
        title: withWhy(
          'Red eye: click the middle of a red eye, or drag a box over it',
          'graphicRetouch',
        ),
        only: 'graphics',
      },
    ],
  },
  // GB1 (M21): moving round the image.
  {
    id: 'navigate',
    label: 'Hand and zoom',
    group: 5,
    tools: [
      {
        tool: 'hand',
        label: 'Hand',
        icon: 'hand',
        title: 'Hand: drag to move round the image (H); hold Space with any tool',
        key: 'H',
        only: 'graphics',
      },
      {
        tool: 'zoom',
        label: 'Zoom',
        icon: 'zoomIn',
        title:
          'Zoom: click to zoom in there (Z), Alt-click to zoom out; Ctrl/Cmd + wheel zooms too',
        key: 'Z',
        only: 'graphics',
      },
    ],
  },
];

/** The families a mode shows, each with only that mode's tools (empty families left out). */
export function familiesFor(still: boolean): ToolFamily[] {
  const mode = still ? 'graphics' : 'animation';
  return TOOL_FAMILIES.map((f) => ({
    ...f,
    tools: f.tools.filter((t) => !t.only || t.only === mode),
  })).filter((f) => f.tools.length > 0);
}

/** The family a tool (or a tool's button name) is in. */
export function familyOf(tool: Tool | string): ToolFamily | undefined {
  return TOOL_FAMILIES.find((f) => f.tools.some((t) => t.tool === tool || t.label === tool));
}

/** The name of a family's corner button, which opens its flyout ("Shapes tools"). */
export const familyButtonName = (f: Pick<ToolFamily, 'label'>): string => `${f.label} tools`;

/** The view helpers' button (Rulers, Grid, Snap, Outline view, Pixel grid in a flyout). */
export const VIEW_BUTTON = 'View options';
