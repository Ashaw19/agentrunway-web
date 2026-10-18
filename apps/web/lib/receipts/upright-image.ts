/**
 * Turns a receipt photo upright before OCR. Server only.
 *
 * An iPhone saves a portrait photo as landscape pixels plus an EXIF flag that
 * says "rotate 90°". Viewers apply the flag; a vision model may not, and then
 * reads the receipt sideways, where a slashed zero is easily taken for an 8.
 * Photos from the web upload are already upright (the browser applies the flag
 * when it compresses them), so only flagged images are re-encoded.
 */
import sharp from "sharp";

export async function uprightImage(
  bytes: Buffer,
  mimeType: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  try {
    const { orientation } = await sharp(bytes).metadata();
    if (!orientation || orientation === 1) return { bytes, mimeType };
    const upright = await sharp(bytes).rotate().jpeg({ quality: 92 }).toBuffer();
    return { bytes: upright, mimeType: "image/jpeg" };
  } catch (err) {
    // HEIC and anything else sharp can't decode goes to OCR as it came.
    console.warn("[receipt/extract] Couldn't turn the image upright:", err instanceof Error ? err.message : err);
    return { bytes, mimeType };
  }
}
