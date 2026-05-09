"use client";

/**
 * ReceiptCaptureDialog
 *
 * Full receipt capture flow in a single dialog:
 *   idle → processing → review → saving → done
 *
 * Three capture modes (all feed into the same post-upload flow):
 *   Mode 1 — File upload       : file picker (JPEG, PNG, WebP, PDF)
 *   Mode 2 — Mobile camera     : <input capture="environment"> — opens rear camera on mobile
 *   Mode 3 — QR handoff        : desktop creates a one-time token, shows QR code,
 *                                phone opens /receipt-upload/{token} and uploads there,
 *                                desktop polls every 3 s and transitions to review on complete.
 *
 * Images are compressed client-side to ≤ 1600 px before upload (modes 1 & 2).
 * Mode 3 compression happens on the phone page.
 */

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import QRCode from "qrcode";
import { toast }                                     from "sonner";
import { createClient }                              from "@/lib/supabase/client";
import { normalizeExtraction }                       from "@/lib/receipts/normalize";
import { compressImage }                             from "@/lib/receipts/compress-image";
import { RECEIPT_CATEGORY_GROUPS }                   from "@/lib/types/receipt";
import type { OcrExtraction, ReceiptDraft, ProcessReceiptResponse, ProcessReceiptError } from "@/lib/types/receipt";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  X,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type FlowState = "idle" | "processing" | "review" | "saving" | "done" | "qr";

interface Props {
  open:     boolean;
  onClose:  () => void;
  /** Called after a receipt is saved so the parent can refresh its list. */
  onSaved?: () => void;
  /**
   * Tenant routing.  Realtor flow ('realtor', default) writes to
   * `receipt_expenses` directly via the supabase client.  Corporate flow
   * ('corporate') POSTs to /api/receipts/save-corporate which performs the
   * vendor regex match + writes `corp_transactions`.  See
   * memory/findings/decision_director_cockpit_greenlight_2026-05-05.md.
   */
  context?: "realtor" | "corporate";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCIES     = ["CAD", "USD"];
const QR_POLL_MS     = 3_000;   // 3 seconds between polls
const TOKEN_TTL_MS   = 5 * 60 * 1000; // 5 minutes

// Mirrors the file input's accept attribute below. Drag-drop bypasses the
// browser's accept filter, so we re-check here. file.type can be empty for
// files dragged from some sources, so we also check the filename extension.
const ACCEPTED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ACCEPTED_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
const ACCEPTED_LABEL = "JPEG / PNG / WebP / PDF";

function isFileAccepted(file: File): boolean {
  if (file.type && ACCEPTED_MIMES.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTS.some((ext) => lower.endsWith(ext));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceLabel(conf: number): { text: string; color: string } {
  if (conf >= 0.85) return { text: "High confidence",   color: "text-emerald-600" };
  if (conf >= 0.60) return { text: "Medium confidence", color: "text-amber-500"   };
  if (conf <= 0)    return { text: "OCR failed — please enter details manually", color: "text-red-600" };
  return               { text: "Low confidence — please review carefully", color: "text-red-500" };
}

/** Format seconds as M:SS */
function fmtCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Render a QR code onto a canvas element using the local qrcode library */
function QrCanvas({ text, size = 220 }: { text: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (!canvasRef.current || !text) return;
    QRCode.toCanvas(canvasRef.current, text, {
      width:    size,
      margin:   2,
      color:    { dark: "#000000", light: "#ffffff" },
    }).catch(console.error);
  }, [text, size]);
  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-xl"
      aria-label="QR code for phone receipt upload"
    />
  );
}

/**
 * Parse a fetch Response body as JSON safely.
 * Returns null (instead of throwing) if the body is empty or not valid JSON.
 * Prevents "Unexpected end of JSON input" crashes when the server returns
 * an empty 500 body due to an unhandled exception.
 */
async function safeJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReceiptCaptureDialog({ open, onClose, onSaved, context = "realtor" }: Props) {
  // Tenant routing.  context='corporate' (cockpit) POSTs to
  // /api/receipts/save-corporate (vendor regex match + corp_transactions
  // insert).  context='realtor' (default) writes receipt_expenses directly
  // via the supabase client — bit-identical to the pre-Phase-0 behavior.
  const [state,      setState]      = useState<FlowState>("idle");
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [draft,      setDraft]      = useState<ReceiptDraft | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);

  // QR mode state
  const [qrUrl,      setQrUrl]      = useState<string | null>(null);   // full phone URL
  const [_tokenId,   setTokenId]    = useState<string | null>(null);   // for polling
  const [countdown,  setCountdown]  = useState<number>(300);           // seconds remaining

  // Device detection — starts false (SSR-safe), updates after mount
  // `pointer: coarse` is true on touchscreen phones & tablets
  const [isMobile,   setIsMobile]   = useState(false);

  // Drag-and-drop visual feedback
  const [dragActive, setDragActive] = useState(false);

  // Batch upload state — when the user picks/drops multiple files, we store
  // the rest of the queue and the current 1-based position; OCR runs
  // sequentially (one file at a time), the user reviews each one, and on
  // save we auto-advance to the next.  Sequential is intentional: the OCR
  // endpoint is rate-limited (20/min) and parallelizing it both burns the
  // budget and clobbers the single review form state.
  const [batchQueue, setBatchQueue] = useState<File[]>([]);
  const [batchIndex, setBatchIndex] = useState<number>(0);  // 0-based position of CURRENT file
  const [batchTotal, setBatchTotal] = useState<number>(0);

  // Refs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const pollTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cleanup helpers ──────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    if (cdTimerRef.current)   { clearInterval(cdTimerRef.current);   cdTimerRef.current   = null; }
  }, []);

  // ── Reset ────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    stopPolling();
    setState("idle");
    setErrorMsg(null);
    setDraft(null);
    setPreview(null);
    setQrUrl(null);
    setTokenId(null);
    setCountdown(300);
    setDragActive(false);
    setBatchQueue([]);
    setBatchIndex(0);
    setBatchTotal(0);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current)   fileInputRef.current.value   = "";
  }, [stopPolling]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // Stop polling when dialog closes
  useEffect(() => {
    if (!open) stopPolling();
  }, [open, stopPolling]);

  // Detect touch device once on mount
  useEffect(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // ── File selected (modes 1 & 2) ─────────────────────────────────────────
  const handleFile = useCallback(async (file: File | undefined | null) => {
    if (!file) return;

    setState("processing");
    setErrorMsg(null);

    // Detect PDF — convert first page to JPEG before the standard pipeline
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    // Show a preview for images immediately; PDFs show the spinner only
    if (!isPdf) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }

    try {
      let imageFile: File;

      if (isPdf) {
        // Convert PDF page 1 → JPEG client-side (pdfjs-dist, already installed)
        const { pdfToImageBlob } = await import("@/lib/receipts/pdf-to-image");
        const blob = await pdfToImageBlob(file);
        imageFile  = new File([blob], "receipt.jpg", { type: "image/jpeg" });
        // Show preview of the rendered page
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target?.result as string);
        reader.readAsDataURL(imageFile);
      } else {
        const compressed = await compressImage(file);
        imageFile = new File([compressed], "receipt.jpg", { type: "image/jpeg" });
      }

      const form = new FormData();
      form.append("file", imageFile);

      const res  = await fetch("/api/receipts/process", { method: "POST", body: form });

      // Handle non-JSON responses (e.g. Vercel 413 body too large, 504 timeout)
      const data = await safeJson<(ProcessReceiptResponse & { ocrError?: string }) | ProcessReceiptError>(res);

      if (!data) {
        throw new Error(`Server returned ${res.status} with empty or non-JSON response`);
      }

      if (!data.ok) throw new Error(data.error ?? "Processing failed");

      if (data.ocrError) {
        console.warn("[ReceiptCapture] OCR failed:", data.ocrError);
        toast.error("Receipt scanning couldn't read the image. Please enter details manually.");
      }

      const normalized = normalizeExtraction(data.extraction, data.path);
      setDraft(normalized);
      setState("review");

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      console.error("[ReceiptCapture] Error:", msg);
      setErrorMsg(msg);
      setState("idle");
    }
  }, []);

  // ── Batch entry: accept 1+ files, queue the rest, start file 0 ─────────
  // Caller passes the full array (FileList → Array).  We sort PDFs and
  // images in arrival order — sequential processing avoids OCR rate-limit
  // burst and keeps the single review-form invariant intact.
  //
  // Filters out unsupported file types up front (drag-drop bypasses the
  // file input's accept attribute, so a CSV/xlsx/etc. would otherwise be
  // silently dropped — see commit history for the bug it fixed).
  const handleFiles = useCallback(async (files: File[]) => {
    const list = files.filter(Boolean);
    if (list.length === 0) return;

    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of list) {
      if (isFileAccepted(f)) accepted.push(f);
      else rejected.push(f.name);
    }

    if (rejected.length > 0) {
      const names = rejected.join(", ");
      toast.error(
        `File type not supported: ${names}. Accepts ${ACCEPTED_LABEL}.`,
      );
    }

    if (accepted.length === 0) return;

    const [first, ...rest] = accepted;
    if (!first) return;
    setBatchQueue(rest);
    setBatchIndex(0);
    setBatchTotal(accepted.length);
    await handleFile(first);
  }, [handleFile]);

  // ── Drag-and-drop handlers ──────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (state !== "idle") return;
    setDragActive(true);
  }, [state]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (state !== "idle") return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) await handleFiles(files);
  }, [state, handleFiles]);

  // ── QR handoff mode ─────────────────────────────────────────────────────

  /** Start QR mode: create token, build URL, begin polling + countdown */
  const handleQrMode = useCallback(async () => {
    setErrorMsg(null);

    try {
      const res  = await fetch("/api/receipts/create-token", { method: "POST" });
      const data = await safeJson<{ ok: boolean; tokenId?: string; token?: string; phoneOrigin?: string; error?: string }>(res);

      if (!data) {
        throw new Error(`Server error (${res.status}) — check server logs`);
      }

      if (!data.ok || !data.tokenId || !data.token) {
        throw new Error(data.error ?? "Failed to create upload link");
      }

      // Use phoneOrigin from server: LAN IP on localhost so the phone can
      // reach it over Wi-Fi; real domain in production.
      const baseUrl  = data.phoneOrigin ?? window.location.origin;
      // /r/[token] is a raw HTML route — no React/Next.js runtime, works in
      // iOS Camera's restricted WKWebView in-app preview browser.
      const phoneUrl = `${baseUrl}/r/${data.token}`;
      setQrUrl(phoneUrl);
      setTokenId(data.tokenId);
      setCountdown(Math.floor(TOKEN_TTL_MS / 1000));
      setState("qr");

      // ── Countdown timer (1 second tick) ────────────────────────────────
      cdTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            stopPolling();
            setState("idle");
            setErrorMsg("The QR code expired. Generate a new one.");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // ── Polling (every 3 seconds) ───────────────────────────────────────
      pollTimerRef.current = setInterval(async () => {
        try {
          const pollRes  = await fetch(`/api/receipts/token-status/${data.tokenId}`);
          const pollData = await safeJson<{
            ok: boolean;
            status: string;
            receiptPath?: string;
            extraction?: OcrExtraction;
            errorMessage?: string;
          }>(pollRes);

          if (!pollData || !pollData.ok) return; // network hiccup — keep polling

          if (pollData.status === "complete" && pollData.receiptPath && pollData.extraction) {
            stopPolling();
            const normalized = normalizeExtraction(pollData.extraction, pollData.receiptPath);
            setDraft(normalized);
            // No local preview for QR mode — that's fine, review form works without it
            setState("review");
          } else if (pollData.status === "error") {
            stopPolling();
            setErrorMsg(pollData.errorMessage ?? "Upload failed on your phone. Please try again.");
            setState("idle");
          } else if (pollData.status === "expired") {
            stopPolling();
            setErrorMsg("The QR code expired. Generate a new one.");
            setState("idle");
          }
          // status === 'pending' → keep polling
        } catch {
          // network error — silently retry next tick
        }
      }, QR_POLL_MS);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setErrorMsg(msg);
    }
  }, [stopPolling]);

  // ── Form field update ────────────────────────────────────────────────────
  const updateDraft = useCallback(
    <K extends keyof ReceiptDraft>(key: K, value: ReceiptDraft[K]) => {
      setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
    },
    [],
  );

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!draft) return;
    setState("saving");

    const supabase  = createClient();

    // Fetch the current user — required for the user_id NOT NULL column and RLS
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Session expired. Please refresh and try again.");
      setState("review");
      return;
    }

    const totalAmt  = draft.total_amount !== "" ? parseFloat(draft.total_amount) : null;
    const taxAmt    = draft.tax_amount   !== "" ? parseFloat(draft.tax_amount)   : null;
    const subAmt    = draft.subtotal     !== "" ? parseFloat(draft.subtotal)     : null;

    // Tenant routing: corporate flow (Director Cockpit) writes a `corp_transactions`
    // row via the server-side regex-matching endpoint; realtor flow writes
    // `receipt_expenses` directly via the supabase client.  The two table
    // schemas don't share columns — schema isolation is the whole point of
    // the corp_* tables (no engine leak, no realtor metric contamination).
    if (context === "corporate") {
      try {
        const res = await fetch("/api/receipts/save-corporate", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            vendor:         draft.vendor || null,
            expense_date:   draft.expense_date || null,
            total_amount:   isNaN(totalAmt!) ? null : totalAmt,
            tax_amount:     isNaN(taxAmt!) ? null : taxAmt,
            subtotal:       isNaN(subAmt!) ? null : subAmt,
            currency:       draft.currency,
            notes:          draft.notes || null,
            receipt_path:   draft.receipt_path,
            // `category_key` is a realtor concept — corporate side ignores it
            // in favour of vendor regex → account_code.
          }),
        });
        const data = await safeJson<{ ok: boolean; error?: string; needs_review?: boolean }>(res);
        if (!data || !data.ok) {
          const msg = data?.error ?? `Server returned ${res.status}`;
          console.error("[ReceiptCaptureDialog] Corporate save error:", msg);
          toast.error("Failed to save receipt. Please try again.");
          setState("review");
          return;
        }
        if (data.needs_review) {
          toast.info("Saved — flagged for review (no vendor match).");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error";
        console.error("[ReceiptCaptureDialog] Corporate save failed:", msg);
        toast.error("Failed to save receipt. Please try again.");
        setState("review");
        return;
      }
    } else {
      const { error } = await supabase.from("receipt_expenses").insert({
        user_id:        user.id,
        vendor:         draft.vendor       || null,
        expense_date:   draft.expense_date || null,
        total_amount:   isNaN(totalAmt!)   ? null : totalAmt,
        tax_amount:     isNaN(taxAmt!)     ? null : taxAmt,
        subtotal:       isNaN(subAmt!)     ? null : subAmt,
        currency:       draft.currency,
        category_key:   draft.category_key || null,
        notes:          draft.notes        || null,
        receipt_path:   draft.receipt_path,
        ocr_confidence: draft.ocr_confidence,
        ocr_raw:        draft.ocr_raw,
      });

      if (error) {
        console.error("[ReceiptCaptureDialog] Save error:", error.message);
        toast.error("Failed to save receipt. Please try again.");
        setState("review");
        return;
      }
    }

    setState("done");
    toast.success("Receipt saved!");
    onSaved?.();

    // Batch advance: if more files remain in the queue, advance to the next
    // one and trigger its OCR; otherwise close the dialog as before.
    if (batchQueue.length > 0) {
      const [next, ...rest] = batchQueue;
      const newIndex = batchIndex + 1;
      setTimeout(() => {
        setDraft(null);
        setPreview(null);
        setBatchQueue(rest);
        setBatchIndex(newIndex);
        if (next) void handleFile(next);
      }, 800);
      return;
    }

    setTimeout(() => {
      reset();
      onClose();
    }, 1200);
  }, [draft, reset, onClose, onSaved, batchQueue, batchIndex, handleFile, context]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className={cn(
          "max-w-lg w-full",
          "max-h-[92dvh] overflow-y-auto",
          "sm:max-h-[85vh]",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Capture Receipt
          </DialogTitle>
        </DialogHeader>

        {/* ── IDLE ──────────────────────────────────────────────────────── */}
        {state === "idle" && (
          <div
            className={cn(
              "relative space-y-4 py-2 rounded-xl transition-colors",
              dragActive && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
            )}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Drop overlay — appears only while a drag is hovering. */}
            {dragActive && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/10">
                <div className="flex flex-col items-center gap-2 rounded-lg bg-background/90 px-5 py-3 shadow-lg ring-1 ring-primary/40">
                  <Upload className="h-5 w-5 text-primary" aria-hidden />
                  <span className="text-sm font-medium text-foreground">Drop to upload</span>
                  <span className="text-[11px] text-muted-foreground">One or more files — they&apos;ll process in order.</span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {isMobile
                ? "Take a photo of your receipt or choose an image or PDF from your gallery."
                : "Drag receipts here, or pick a file. Multi-select works — they'll process one at a time."}
            </p>

            {/*
              Adaptive 2-column layout:
                Mobile  → primary: [Take Photo | Upload File]
                Desktop → primary: [Upload File | Use Phone]
              The third mode is shown as a small secondary link below.
            */}
            <div className="grid grid-cols-2 gap-3">
              {isMobile ? (
                <>
                  {/* Mobile primary 1 — camera */}
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 transition-colors hover:border-primary/50 hover:bg-primary/5 active:scale-95"
                  >
                    <Camera className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-medium text-foreground">Take Photo</span>
                    <span className="text-[11px] text-muted-foreground text-center">Opens camera</span>
                  </button>

                  {/* Mobile primary 2 — file */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 transition-colors hover:border-primary/50 hover:bg-primary/5 active:scale-95"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-medium text-foreground">Upload File</span>
                    <span className="text-[11px] text-muted-foreground text-center">JPEG · PNG · PDF</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Desktop primary 1 — file */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 transition-colors hover:border-primary/50 hover:bg-primary/5 active:scale-95"
                  >
                    <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-medium text-foreground">Upload File</span>
                    <span className="text-[11px] text-muted-foreground text-center">JPEG · PNG · PDF</span>
                  </button>

                  {/* Desktop primary 2 — QR handoff */}
                  <button
                    onClick={handleQrMode}
                    className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 transition-colors hover:border-primary/50 hover:bg-primary/5 active:scale-95"
                  >
                    <Smartphone className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-medium text-foreground">Use Phone</span>
                    <span className="text-[11px] text-muted-foreground text-center">Scan QR to capture</span>
                  </button>
                </>
              )}
            </div>

            {/* Hidden inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) void handleFiles(files);
              }}
            />
          </div>
        )}

        {/* ── QR MODE ────────────────────────────────────────────────────── */}
        {state === "qr" && qrUrl && (
          <div className="space-y-4 py-2">
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">Scan with your phone</p>
              <p className="text-xs text-muted-foreground">
                Point your phone camera at this QR code to open the upload page.
              </p>
            </div>

            {/* QR code — rendered locally, no external service */}
            <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl border border-border bg-white p-2 shadow-sm">
              <QrCanvas text={qrUrl} size={208} />
            </div>

            {/* Countdown + waiting indicator */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Waiting for upload from your phone…</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Expires in{" "}
                <span className={cn(
                  "font-mono font-medium",
                  countdown <= 60 ? "text-red-500" : "text-foreground",
                )}>
                  {fmtCountdown(countdown)}
                </span>
              </p>
            </div>

            {/* Manual URL for when camera QR scanning isn't available */}
            <details className="text-center">
              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none">
                Can&apos;t scan? Open link manually
              </summary>
              <p className="mt-2 break-all rounded-lg bg-muted px-3 py-2 text-[11px] font-mono text-muted-foreground">
                {qrUrl}
              </p>
            </details>

            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              className="w-full gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        )}

        {/* ── PROCESSING ─────────────────────────────────────────────────── */}
        {state === "processing" && (
          <div className="flex flex-col items-center gap-5 py-10">
            {batchTotal > 1 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                File <span className="font-mono tabular-nums">{batchIndex + 1}</span> of <span className="font-mono tabular-nums">{batchTotal}</span>
              </span>
            )}
            {preview && (
              <div className="relative h-32 w-32 overflow-hidden rounded-xl border border-border shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Receipt preview" className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              </div>
            )}
            {!preview && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
            <div className="text-center">
              <p className="font-medium text-foreground">Reading your receipt…</p>
              <p className="mt-1 text-sm text-muted-foreground">This takes a few seconds</p>
            </div>
          </div>
        )}

        {/* ── REVIEW ─────────────────────────────────────────────────────── */}
        {(state === "review" || state === "saving") && draft && (
          <div className="space-y-5 py-1">
            {batchTotal > 1 && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
                  Reviewing file <span className="font-mono tabular-nums">{batchIndex + 1}</span> of <span className="font-mono tabular-nums">{batchTotal}</span>
                </span>
                {batchQueue.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {batchQueue.length} more after this
                  </span>
                )}
              </div>
            )}
            {/* Receipt image + confidence */}
            <div className="flex items-start gap-3">
              {preview && (
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Receipt" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Review extracted details
                </p>
                <p className={cn(
                  "mt-0.5 text-xs",
                  confidenceLabel(draft.ocr_confidence).color,
                )}>
                  {confidenceLabel(draft.ocr_confidence).text}
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Edit any field before saving. Optional fields can be left blank.
                </p>
              </div>
            </div>

            {/* Form */}
            <div className="grid gap-4">
              {/* Vendor + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="vendor" className="text-xs">Merchant / Vendor</Label>
                  <Input
                    id="vendor"
                    value={draft.vendor}
                    onChange={(e) => updateDraft("vendor", e.target.value)}
                    placeholder="e.g. Petro-Canada"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="expense_date" className="text-xs">Date</Label>
                  <Input
                    id="expense_date"
                    type="date"
                    value={draft.expense_date}
                    onChange={(e) => updateDraft("expense_date", e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="total_amount" className="text-xs">
                    Total <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="total_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.total_amount}
                    onChange={(e) => updateDraft("total_amount", e.target.value)}
                    placeholder="0.00"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tax_amount" className="text-xs">Tax (GST/HST)</Label>
                  <Input
                    id="tax_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.tax_amount}
                    onChange={(e) => updateDraft("tax_amount", e.target.value)}
                    placeholder="0.00"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="subtotal" className="text-xs">Subtotal</Label>
                  <Input
                    id="subtotal"
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.subtotal}
                    onChange={(e) => updateDraft("subtotal", e.target.value)}
                    placeholder="0.00"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* Currency + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Currency</Label>
                  <Select
                    value={draft.currency}
                    onValueChange={(v) => updateDraft("currency", v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={draft.category_key}
                    onValueChange={(v) => updateDraft("category_key", v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECEIPT_CATEGORY_GROUPS.map((group) => (
                        <SelectGroup key={group.group}>
                          <SelectLabel className="text-xs font-semibold text-muted-foreground">
                            {group.group}
                          </SelectLabel>
                          {group.items.map((item) => (
                            <SelectItem key={item.key} value={item.key}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div className="grid gap-1.5">
                <Label htmlFor="notes" className="text-xs">
                  Notes <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="notes"
                  value={draft.notes}
                  onChange={(e) => updateDraft("notes", e.target.value)}
                  placeholder="Any context, client name, or project…"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                disabled={state === "saving"}
                className="gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Start over
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={state === "saving" || !draft.total_amount}
                className="flex-1 gap-1.5"
              >
                {state === "saving" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : (
                  "Save Expense"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── DONE ───────────────────────────────────────────────────────── */}
        {state === "done" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="font-semibold text-foreground">Receipt saved!</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
