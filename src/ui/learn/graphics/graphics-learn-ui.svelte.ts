// Learn ▸ Graphics (GL1, M23): the page the student last chose, kept while they visit other tabs.
export type GraphicsPage =
  'bitmap' | 'resolution' | 'colour' | 'formats' | 'compression' | 'trace' | 'society';

export const GRAPHICS_PAGES: readonly [GraphicsPage, string][] = [
  ['bitmap', 'Bitmap and vector'],
  ['resolution', 'Resolution and print size'],
  ['colour', 'Colour systems'],
  ['formats', 'File formats'],
  ['compression', 'Compression'],
  ['trace', 'Bitmap to vector'],
  ['society', 'Image editing and society'],
];

export const graphicsLearn = $state({ page: 'bitmap' as GraphicsPage });
