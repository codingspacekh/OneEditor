// M19 / G11: the main process prints an image's PDF from its SVG page in a hidden window that
// is never shown (it takes no focus, even while the e2e tests run behind other windows): the
// page is the image's size, no margins, the background printed, fonts loaded first; the window
// and its page file are gone afterwards. The real printToPDF is checked by the e2e tests.
import { describe, expect, it, vi } from 'vitest';
import { createPdfPrinter, PDF_WINDOW_OPTIONS, type PdfWindow } from '../../../src/main/pdf.ts';
import { createMockMediaEngine } from '../../../src/adapters/mock/media-engine.ts';
import { createElectronPageAssets } from '../../../src/adapters/electron/page-assets.ts';
import { inProcessBridge } from '../../helpers/ipc-bridge.ts';

function fakeWindow(pdf = new Uint8Array([37, 80, 68, 70])) {
  const win = {
    loadFile: vi.fn<(path: string) => Promise<void>>(async () => {}),
    destroy: vi.fn(),
    isDestroyed: () => false,
    webContents: {
      printToPDF: vi.fn<(options: unknown) => Promise<Buffer>>(async () => Buffer.from(pdf)),
      executeJavaScript: vi.fn<(code: string) => Promise<unknown>>(async () => true),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    },
  };
  return win;
}

function setup(win = fakeWindow()) {
  const disk = new Map<string, string>();
  const removed: string[] = [];
  const printer = createPdfPrinter({
    window: () => win as unknown as PdfWindow,
    dir: '/user/pdf',
    mkdir: vi.fn(async () => {}),
    writeFile: async (path, text) => void disk.set(path, text),
    remove: async (path) => void removed.push(path),
  });
  return { win, disk, removed, printer };
}

describe('G11 the PDF printer (main process)', () => {
  it('opens no window the student sees: hidden, sandboxed, no Node', () => {
    expect(PDF_WINDOW_OPTIONS.show).toBe(false);
    expect(PDF_WINDOW_OPTIONS.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
  });

  it('prints the page at the image’s size with no margins and the background, then tidies up', async () => {
    const s = setup();
    const bytes = await s.printer('<!DOCTYPE html><svg></svg>', { width: 8.27, height: 11.69 });
    expect([...bytes]).toEqual([37, 80, 68, 70]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    const [file] = s.win.loadFile.mock.calls[0]!;
    // Joined by the platform's separator (\ on Windows).
    expect(file.replaceAll('\\', '/')).toMatch(/^\/user\/pdf\/.+\.html$/);
    expect(s.disk.get(file)).toBe('<!DOCTYPE html><svg></svg>');
    // The bundled fonts in the SVG are loaded before it is printed.
    expect(s.win.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('document.fonts.ready'),
    );
    expect(s.win.webContents.printToPDF).toHaveBeenCalledWith({
      pageSize: { width: 8.27, height: 11.69 },
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
      preferCSSPageSize: true,
      pageRanges: '1',
    });
    expect(s.win.destroy).toHaveBeenCalled();
    expect(s.removed).toEqual([file]);
  });

  it('closes the window and removes the page even when printing fails', async () => {
    const win = fakeWindow();
    win.webContents.printToPDF.mockRejectedValueOnce(new Error('printing failed'));
    const s = setup(win);
    await expect(s.printer('<p>', { width: 1, height: 1 })).rejects.toThrow(/printing failed/);
    expect(win.destroy).toHaveBeenCalled();
    expect(s.removed).toHaveLength(1);
  });

  it('gives each print its own page file', async () => {
    const s = setup();
    await s.printer('a', { width: 1, height: 1 });
    await s.printer('b', { width: 1, height: 1 });
    const files = s.win.loadFile.mock.calls.map(([f]) => f);
    expect(new Set(files).size).toBe(2);
  });
});

describe('G11 page:pdf (IPC)', () => {
  function bridge(pdf = vi.fn(async () => new Uint8Array([1, 2, 3]))) {
    const b = inProcessBridge(createMockMediaEngine(), {
      pageFiles: {
        player: '/app/out/player.js',
        assets: '/app/dist/assets',
        read: async () => new Uint8Array(),
        show: async () => {},
        pdf,
      },
    });
    return { ...b, pdf, assets: createElectronPageAssets(b.api, {}) };
  }

  it('wraps the SVG in a page of its size and gives back the PDF’s bytes', async () => {
    const s = bridge();
    const bytes = await s.assets.svgToPdf('<svg></svg>', { width: 4, height: 2 });
    expect([...bytes]).toEqual([1, 2, 3]);
    const [html, page] = s.pdf.mock.calls[0]! as unknown as [string, unknown];
    expect(html).toContain('@page { size: 4in 2in; margin: 0; }');
    expect(html).toContain('<svg></svg>');
    expect(page).toEqual({ width: 4, height: 2 });
  });

  it('refuses anything but an SVG on a real page size', async () => {
    const s = bridge();
    expect(await s.api.invoke('page:pdf', '<p>hi</p>', 1, 1)).toMatchObject({ ok: false });
    expect(await s.api.invoke('page:pdf', '<svg/>', 0, 1)).toMatchObject({ ok: false });
    expect(await s.api.invoke('page:pdf', '<svg/>', 1, 500)).toMatchObject({ ok: false });
    expect(s.pdf).not.toHaveBeenCalled();
  });

  it('says so where PDFs cannot be made', async () => {
    const s = inProcessBridge(createMockMediaEngine());
    const reply = await s.api.invoke('page:pdf', '<svg/>', 1, 1);
    expect(reply).toMatchObject({ ok: false, error: { message: /PDF/ } });
  });
});
