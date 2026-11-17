// G11 (M19, D5): an image's PDF, printed by Chromium from its SVG page (core/graphics/pdf.ts) in
// a window that is never shown, so the shapes stay vector and no PDF library is needed. The
// window takes no focus (it is not shown at all, so the e2e tests' background runs are not
// disturbed); the page file is written in the app's own folder and removed afterwards.
import type { BrowserWindowConstructorOptions, PrintToPDFOptions } from 'electron';
import { join } from 'node:path';
import type { PdfPage } from '../core/graphics/pdf.ts';

/** What the printer needs of an Electron BrowserWindow (a fake one in the tests). */
export interface PdfWindow {
  loadFile(path: string): Promise<void>;
  destroy(): void;
  isDestroyed(): boolean;
  webContents: {
    printToPDF(options: PrintToPDFOptions): Promise<Uint8Array>;
    executeJavaScript(code: string): Promise<unknown>;
    setWindowOpenHandler(handler: () => { action: 'deny' }): void;
    on(event: 'will-navigate', listener: (event: { preventDefault(): void }) => void): void;
  };
}

/** Hidden for good, sandboxed, without Node: it only lays out the SVG to print it. */
export const PDF_WINDOW_OPTIONS = {
  show: false,
  width: 800,
  height: 600,
  webPreferences: {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    // Its fonts and layout run even though it is never on the screen.
    backgroundThrottling: false,
  },
} satisfies BrowserWindowConstructorOptions;

export interface PdfPrinterDeps {
  /** A new hidden window (`new BrowserWindow(PDF_WINDOW_OPTIONS)` in the app). */
  window: () => PdfWindow;
  /** Where the page is written while it is printed (in the app's user-data folder). */
  dir: string;
  mkdir(dir: string): Promise<unknown>;
  writeFile(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
}

/** Long enough for a large image with every font inside it; a stuck window is given up. */
const PRINT_TIMEOUT_MS = 60_000;

function timeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The PDF took too long to make.')), PRINT_TIMEOUT_MS);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** Prints a page (pdfPageHtml) as a PDF `page` inches big, with no margins and its background. */
export function createPdfPrinter(deps: PdfPrinterDeps) {
  let count = 0;
  return async function printPdf(html: string, page: PdfPage): Promise<Uint8Array> {
    await deps.mkdir(deps.dir);
    count += 1;
    const file = join(deps.dir, `image-${process.pid}-${Date.now()}-${count}.html`);
    await deps.writeFile(file, html);
    const win = deps.window();
    try {
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (e) => e.preventDefault());
      const pdf = await timeout(
        (async () => {
          await win.loadFile(file);
          // The bundled fonts inside the SVG are data: URLs; they load just after the page.
          await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
          return win.webContents.printToPDF({
            pageSize: { width: page.width, height: page.height },
            margins: { top: 0, right: 0, bottom: 0, left: 0 },
            printBackground: true,
            preferCSSPageSize: true,
            pageRanges: '1',
          });
        })(),
      );
      // A copy of its own: a Buffer can be a slice of a larger shared one, all sent over IPC.
      return new Uint8Array(pdf);
    } finally {
      if (!win.isDestroyed()) win.destroy();
      await deps.remove(file).catch(() => {});
    }
  };
}
