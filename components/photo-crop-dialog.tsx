"use client";

/**
 * PhotoCropDialog — modal for cropping a property photo to a 1:1 square.
 *
 * Flow:
 *   1. Caller sets `imageFile` (from <input type="file">)
 *   2. Dialog shows the image inside a ReactCrop with locked 1:1 aspect
 *   3. User adjusts the crop → clicks "Save Crop"
 *   4. We draw the cropped region onto a 1080×1080 canvas → WebP blob
 *   5. `onCropComplete(blob)` returns the cropped blob to the caller
 */

import { useState, useRef, useEffect, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
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

const OUTPUT_SIZE = 1080; // match Instagram slide resolution

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

  // ── Set initial crop when image loads (centered 80% square) ─────────────

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    imgRef.current = e.currentTarget;
    const { width, height } = e.currentTarget;
    const initial = centerCrop(
      makeAspectCrop({ unit: "%", width: 80 }, 1, width, height),
      width,
      height,
    );
    setCrop(initial);
  }, []);

  // ── Save: draw crop onto canvas → blob ─────────────────────────────────

  async function handleSave() {
    const image = imgRef.current;
    if (!image || !completedCrop) return;
    setSaving(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d")!;

      // Scale from displayed coords to natural image coords
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      ctx.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      );

      // Convert canvas → blob (WebP with PNG fallback for Safari)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) return resolve(b);
            // Fallback: try PNG if WebP not supported
            canvas.toBlob(
              (pngBlob) => (pngBlob ? resolve(pngBlob) : reject(new Error("Canvas toBlob failed"))),
              "image/png",
            );
          },
          "image/webp",
          0.85,
        );
      });

      onCropComplete(blob);
    } catch (err) {
      console.error("Crop failed:", err);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Crop Property Photo</DialogTitle>
          <DialogDescription>
            Drag to adjust the crop area. Photos are cropped to a square for Instagram slides.
          </DialogDescription>
        </DialogHeader>

        {imgSrc && (
          <div className="flex justify-center max-h-[60vh] overflow-hidden">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              className="max-h-[60vh]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgSrc}
                alt="Crop preview"
                onLoad={onImageLoad}
                className="max-h-[60vh] w-auto"
              />
            </ReactCrop>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !completedCrop}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save Crop"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
