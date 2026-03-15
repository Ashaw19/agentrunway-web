/**
 * PDF → JPEG conversion for receipt OCR.
 *
 * Uses pdfjs-dist (already installed, worker at /public/pdf.worker.min.mjs).
 * Renders only the first page — receipts are always single-page documents.
 * Uses scale 2.0 to produce a high-resolution canvas suitable for OCR.
 *
 * Client-only: uses dynamic import so it is never bundled into the server build.
 * Follow the pdfjs-dist v5 render API: page.render({ canvas, viewport }).
 */

export async function pdfToImageBlob(
  file: File,
  scale = 2.0,
  quality = 0.92,
): Promise<Blob> {
  // Dynamic import — keeps pdfjs out of the server bundle
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await file.arrayBuffer();
  const pdf         = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  // Always render page 1 for receipts
  const page     = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas  = document.createElement("canvas");
  canvas.width  = viewport.width;
  canvas.height = viewport.height;

  // pdfjs-dist v5 API: pass canvas directly (not canvasContext)
  await page.render({ canvas, viewport }).promise;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
}
