"use client";

/**
 * PhotoCropDialog — modal for optionally cropping a property photo.
 *
 * Flow:
 *   1. Caller sets `imageFile` (from <input type="file">)
 *   2. Dialog shows the image inside a free-form ReactCrop (no forced aspect ratio)
 *      with the full image pre-selected — user can adjust or leave as-is
 *   3a. "Save Crop"    — draws the selected region onto a canvas at 1080px wide
 *       (height is proportional, preserving the crop's native aspect ratio) → JPEG blob
 *   3b. "Use Full Image" — skips the crop and uploads the original image at its
 *       native aspect ratio (scaled to max 1080px wide) → JPEG blob
 *   4. `onCropComplete(blob)` returns the blob to the caller
 *
 * The slide API renders photos with objectFit: "contain", so any aspect ratio
 * is displayed in full with template-coloured letterbox bars where needed.
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import ReactCropImpl, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

// react-image-crop ships a class component that isn't compatible with
// @types/react 19.2's strict JSX element checks (TS2607/TS2786). Re-cast
// as a function component shape with the props we actually use.
const ReactCrop = ReactCropImpl as unknown as React.FC<{
  crop?: Crop;
  onChange?: (c: PixelCrop, p: Crop) => void;
  onComplete?: (c: PixelCrop, p: Crop) => void;
  className?: string;
  children?: ReactNode;
}>;
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// ── Props ────────────────────────────────────────────────────────────────────

interface PhotoCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageFile: File | null;
  onCropComplete: (blob: Blob) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_OUTPUT_WIDTH = 1080; // slide width; height is proportional

// ── Helpers ──────────────────────────────────────────────────────────────────

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) return resolve(b);
        // PNG fallback for browsers that don't support JPEG canvas export
        canvas.toBlob(
          (pngBlob) => (pngBlob ? resolve(pngBlob) : reject(new Error("Canvas toBlob failed"))),
          "image/png",
        );
      },
      "image/jpeg",
      0.92,
    );
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export function PhotoCropDialog({ open, onOpenChange, imageFile, onCropComplete }: PhotoCropDialogProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgSrc, setImgSrc] = useState<string>("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Load image when file changes ────────────────────────────────────────

  useEffect(() => {
    if (!imageFile) {
      setImgSrc("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // ── Reset state when dialog closes ──────────────────────────────────────

  useEffect(() => {
    if (!open) {
      setCrop(undefined);
      setCompletedCrop(null);
      setSaving(false);
    }
  }, [open]);

  // ── Pre-select the full image when it loads ──────────────────────────────

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    imgRef.current = e.currentTarget;
    // Select the entire image by default — user can adjust if needed
    setCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
  }, []);

  // ── Save cropped region ──────────────────────────────────────────────────

  async function handleSave() {
    const image = imgRef.current;
    if (!image || !completedCrop) return;
    setSaving(true);

    try {
      // Scale from displayed coords to natural image coords
      const scaleX = image.naturalWidth  / image.width;
      const scaleY = image.naturalHeight / image.height;

      const naturalCropW = completedCrop.width  * scaleX;
      const naturalCropH = completedCrop.height * scaleY;

      // Preserve the crop's aspect ratio; scale so width ≤ 1080px
      const outWidth  = Math.min(Math.round(naturalCropW), MAX_OUTPUT_WIDTH);
      const outHeight = Math.round(outWidth * (naturalCropH / naturalCropW));

      const canvas = document.createElement("canvas");
      canvas.width  = outWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext("2d")!;

      ctx.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        naturalCropW,
        naturalCropH,
        0, 0,
        outWidth, outHeight,
      );

      onCropComplete(await canvasToJpegBlob(canvas));
    } catch (err) {
      console.error("Crop failed:", err);
    } finally {
      setSaving(false);
    }
  }

  // ── Use full image without any crop ─────────────────────────────────────

  async function handleUseFullImage() {
    const image = imgRef.current;
    if (!image) return;
    setSaving(true);

    try {
      const outWidth  = Math.min(image.naturalWidth, MAX_OUTPUT_WIDTH);
      const outHeight = Math.round(outWidth * (image.naturalHeight / image.naturalWidth));

      const canvas = document.createElement("canvas");
      canvas.width  = outWidth;
      canvas.height = outHeight;
      canvas.getContext("2d")!.drawImage(image, 0, 0, outWidth, outHeight);

      onCropComplete(await canvasToJpegBlob(canvas));
    } catch (err) {
      console.error("Full image export failed:", err);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adjust Property Photo</DialogTitle>
          <DialogDescription>
            Drag the handles to trim, or click <strong>Use Full Image</strong> to keep the original dimensions.
            Landscape, portrait, and square photos all display correctly on the slide.
          </DialogDescription>
        </DialogHeader>

        {imgSrc && (
          <div className="flex justify-center max-h-[62vh] overflow-auto">
            <ReactCrop
              crop={crop}
              onChange={(_c, p) => setCrop(p)}
              onComplete={(c) => setCompletedCrop(c)}
              // No aspect prop — free-form crop
              className="max-h-[62vh]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgSrc}
                alt="Photo preview"
                onLoad={onImageLoad}
                className="max-h-[62vh] w-auto"
              />
            </ReactCrop>
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          {/* Left side: Use Full Image */}
          <Button
            variant="outline"
            onClick={handleUseFullImage}
            disabled={saving || !imgSrc}
            className="sm:mr-auto"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Use Full Image
          </Button>

          {/* Right side: Cancel + Save Crop */}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !completedCrop}>
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
              ) : (
                "Save Crop"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
