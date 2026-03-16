/**
 * Type declarations for pdfjs-dist/webpack.mjs
 *
 * The webpack.mjs entry auto-configures the PDF.js worker for browser use.
 * We use it for converting PDF first page to PNG when users upload PDFs.
 */

declare module 'pdfjs-dist/webpack.mjs' {
  export function getDocument(
    params: { data: ArrayBuffer }
  ): { promise: Promise<{ getPage: (n: number) => Promise<PDFPage> }> }

  interface PDFPage {
    getViewport: (opts: { scale: number }) => { width: number; height: number }
    render: (opts: {
      canvasContext: CanvasRenderingContext2D
      viewport: { width: number; height: number }
    }) => { promise: Promise<void> }
  }
}
