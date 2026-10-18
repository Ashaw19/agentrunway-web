/**
 * Phone receipt photos are landscape pixels with an EXIF "rotate 90°" flag
 * (all of one night's scans, 2026-10-18). OCR gets them upright.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { uprightImage } from "../upright-image";

async function photo(orientation?: number): Promise<Buffer> {
  // 300 × 100 pixels, like a portrait phone photo stored on its side.
  const img = sharp({ create: { width: 300, height: 100, channels: 3, background: "#ffffff" } }).jpeg();
  return (orientation ? img.withMetadata({ orientation }) : img).toBuffer();
}

describe("uprightImage", () => {
  it("rotates a photo flagged to be turned 90°", async () => {
    const out = await uprightImage(await photo(6), "image/jpeg");
    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([100, 300]);
    expect(meta.orientation ?? 1).toBe(1);
    expect(out.mimeType).toBe("image/jpeg");
  });

  it("leaves an upright photo as it came", async () => {
    const bytes = await photo();
    const out = await uprightImage(bytes, "image/png");
    expect(out.bytes).toBe(bytes);
    expect(out.mimeType).toBe("image/png");
  });

  it("passes through what it can't decode", async () => {
    const bytes = Buffer.from("not an image");
    const out = await uprightImage(bytes, "image/heic");
    expect(out.bytes).toBe(bytes);
  });
});
