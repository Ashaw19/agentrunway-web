"use client";

/**
 * UploadForm — client component for the phone receipt upload page.
 *
 * States:
 *   idle       → camera/file buttons
 *   uploading  → spinner with preview
 *   success    → "Return to your computer" message
 *   error      → retry option
 */

import { useState, useRef, useCallback } from "react";
import { compressImage } from "@/lib/receipts/compress-image";

type UploadState = "idle" | "uploading" | "success" | "error";

interface Props {
  token: string;
}

export function UploadForm({ token }: Props) {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null);
  const [preview,     setPreview]     = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File | undefined | null) => {
    if (!file) return;

    setUploadState("uploading");
    setErrorMsg(null);

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    // Show preview for images immediately; PDFs render after conversion
    if (!isPdf) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }

    try {
      let imageFile: File;

      if (isPdf) {
        const { pdfToImageBlob } = await import("@/lib/receipts/pdf-to-image");
        const blob = await pdfToImageBlob(file);
        imageFile  = new File([blob], "receipt.jpg", { type: "image/jpeg" });
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target?.result as string);
        reader.readAsDataURL(imageFile);
      } else {
        const compressed = await compressImage(file);
        imageFile = new File([compressed], "receipt.jpg", { type: "image/jpeg" });
      }

      const form = new FormData();
      form.append("file", imageFile);

      const res = await fetch(`/api/receipts/mobile-upload/${token}`, {
        method: "POST",
        body:   form,
      });

      const data = await res.json() as { ok: boolean; error?: string };

      if (!data.ok) {
        throw new Error(data.error ?? "Upload failed");
      }

      setUploadState("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setErrorMsg(msg);
      setUploadState("error");
    }
  }, [token]);

  const retry = () => {
    setUploadState("idle");
    setErrorMsg(null);
    setPreview(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current)   fileRef.current.value   = "";
  };

  // ── Success ────────────────────────────────────────────────────────────────
  if (uploadState === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-emerald-800 text-base">Upload successful!</p>
          <p className="mt-1 text-sm text-emerald-700">
            Your receipt has been sent. You may return to your computer.
          </p>
        </div>
      </div>
    );
  }

  // ── Uploading ──────────────────────────────────────────────────────────────
  if (uploadState === "uploading") {
    return (
      <div className="flex flex-col items-center gap-5 py-8">
        {preview && (
          <div className="relative h-36 w-36 overflow-hidden rounded-2xl border border-border shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Receipt" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
              {/* Spinner */}
              <svg className="h-9 w-9 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </div>
        )}
        {!preview && (
          <svg className="h-10 w-10 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        <div className="text-center">
          <p className="font-medium text-foreground">Uploading &amp; reading receipt…</p>
          <p className="mt-1 text-sm text-muted-foreground">This takes a few seconds</p>
        </div>
      </div>
    );
  }

  // ── Idle / Error ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Camera button */}
        <button
          onClick={() => cameraRef.current?.click()}
          className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 transition-colors active:bg-muted/60 active:scale-95"
        >
          {/* Camera icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          <span className="text-sm font-medium text-foreground">Take Photo</span>
          <span className="text-[11px] text-muted-foreground text-center">Opens camera</span>
        </button>

        {/* File/gallery button */}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 transition-colors active:bg-muted/60 active:scale-95"
        >
          {/* Upload icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="text-sm font-medium text-foreground">Choose Photo</span>
          <span className="text-[11px] text-muted-foreground text-center">Image or PDF</span>
        </button>
      </div>

      {uploadState === "error" && (
        <button
          onClick={retry}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground active:opacity-90"
        >
          Try again
        </button>
      )}

      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
