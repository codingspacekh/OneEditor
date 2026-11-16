// M22 (GB3): what the adjustment dialog shows for each adjustment — its sliders (each with a typed
// number beside it), in the units core/graphics/pixels/adjust.ts takes, and a line saying what it
// does, in plain words for a student.
import type { AdjustmentKind } from '../../core/graphics/pixels/adjust.ts';

export interface Slider {
  /** The setting it changes (one of the adjustment's settings). */
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const s = (key: string, label: string, min: number, max: number, unit = '', step = 1): Slider => ({
  key,
  label,
  min,
  max,
  step,
  unit,
});

const SHIFTS = [
  s('hue', 'Hue', -180, 180, '°'),
  s('saturation', 'Saturation', -100, 100, '%'),
  s('lightness', 'Lightness', -100, 100, '%'),
];

/** The sliders of an adjustment (colourise changes the hue's and saturation's ranges). */
export function slidersFor(kind: AdjustmentKind, colourise = false): Slider[] {
  switch (kind) {
    case 'brightnessContrast':
      return [s('brightness', 'Brightness', -150, 150), s('contrast', 'Contrast', -100, 100, '%')];
    case 'levels':
      return [
        s('inBlack', 'Input black', 0, 254),
        s('gamma', 'Midtones (gamma)', 0.1, 9.99, '', 0.01),
        s('inWhite', 'Input white', 1, 255),
        s('outBlack', 'Output black', 0, 255),
        s('outWhite', 'Output white', 0, 255),
      ];
    case 'exposure':
      return [s('stops', 'Exposure', -5, 5, 'stops', 0.05)];
    case 'shadowsHighlights':
      return [
        s('shadows', 'Shadows', 0, 100, '%'),
        s('highlights', 'Highlights', 0, 100, '%'),
        s('radius', 'Radius', 0, 500, 'px'),
      ];
    case 'hueSaturation':
      return colourise
        ? [
            s('hue', 'Hue', 0, 360, '°'),
            s('saturation', 'Saturation', 0, 100, '%'),
            s('lightness', 'Lightness', -100, 100, '%'),
          ]
        : SHIFTS;
    case 'colourBalance':
      return [
        s('cyanRed', 'Cyan – Red', -100, 100),
        s('magentaGreen', 'Magenta – Green', -100, 100),
        s('yellowBlue', 'Yellow – Blue', -100, 100),
      ];
    case 'temperatureTint':
      return [s('temperature', 'Temperature', -100, 100), s('tint', 'Tint', -100, 100)];
    case 'replaceColour':
      return [s('fuzziness', 'Fuzziness', 0, 200), ...SHIFTS];
    case 'threshold':
      return [s('level', 'Level', 0, 255)];
    case 'greyscale':
    case 'invert':
      return [];
  }
}

/** What each adjustment does, in a sentence. */
export const ADJUST_HINTS: Record<AdjustmentKind, string> = {
  brightnessContrast:
    'Brightness makes every pixel lighter or darker; contrast pulls the tones apart from the middle grey (more) or towards it (less).',
  levels:
    'Input black and white become black and white, so a dull photo uses the whole range; the midtones (gamma) above 1 brighten the middle tones. The output range makes the darkest and brightest lighter or darker.',
  exposure:
    'Gives the photo more light or less, as a longer or shorter exposure in the camera would: +1 stop doubles the light.',
  shadowsHighlights:
    'Shadows lifts the dark parts and highlights brings down the bright parts, each judged by the area round them (the radius), so the detail in both shows without flattening the rest.',
  hueSaturation:
    'Hue turns every colour round the colour wheel; saturation makes colours stronger or greyer; lightness makes them lighter or darker. Colourise gives every pixel one colour, its brightness kept (a grey Moon made gold).',
  colourBalance:
    'Pushes the colours of the shadows, midtones or highlights towards red, green or blue (or away, towards cyan, magenta or yellow), to warm a picture or take away a colour cast.',
  temperatureTint:
    'Temperature makes the picture warmer (more orange) or cooler (more blue); tint adds magenta or green, as a camera’s white balance does.',
  replaceColour:
    'Click the colour to change in the image: colours near it (up to the fuzziness) have their hue, saturation and lightness moved — the darker colours made brighter, or one colour turned into another.',
  threshold:
    'Every pixel at the level or brighter becomes white and every darker pixel black: a black-and-white picture with no greys.',
  greyscale:
    'Takes the colour away, keeping the brightness the eye sees in each pixel: a picture in greys.',
  invert: 'Turns every colour into its opposite, as a photographic negative.',
};
