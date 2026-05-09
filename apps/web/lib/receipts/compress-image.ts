/**
 * Client-side image compression via Canvas.
 *
 * Resizes the image so its longest side ≤ `maxWidth`, then re-encodes as JPEG
 * at quality 0.85. Used by every web upload surface (desktop receipt-capture
 * dialog, phone QR-token upload page) to keep uploads under the 10 MB server
 * limit and to normalise iPhone HEIC photos into something Groq Vision OCR
 * can process.
 *
 * Safari on iOS can decode HEIC inside an <img> element, so this function
 * works for HEIC inputs on Apple devices — the server-side OCR endpoints
 * accept JPEG/PNG/WebP only and rely on this conversion happening client-side.
 *
 * Browser-only — must not be imported from server code (uses DOM APIs).
 */
export async function compressImage(file: File, maxWidth = 1600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objUrl);
        reject(new Error("Canvas not available"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objUrl);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.85,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error("Image load failed"));
    };
    img.src = objUrl;
  });
}
