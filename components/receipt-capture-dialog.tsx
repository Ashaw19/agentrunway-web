"use client";

/**
 * ReceiptCaptureDialog
 *
 * Full receipt capture flow in a single dialog:
 *   idle → processing → review → saving → done
 *
 * Mobile: uses <input capture="environment"> to open the native camera.
 * Desktop: file picker (JPEG, PNG, WEBP).
 * Images are compressed client-side to ≤ 1600px before upload.
 */

import { useState, useRef, useCallback } from "react";
import { toast }                          from "sonner";
import { createClient }                   from "@/lib/supabase/client";
import { normalizeExtraction }            from "@/lib/receipts/normalize";
import { RECEIPT_CATEGORIES }             from "@/lib/types/receipt";
import type { ReceiptDraft, ProcessReceiptResponse, ProcessReceiptError } from "@/lib/types/receipt";

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
  SelectItem,
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
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type FlowState = "idle" | "processing" | "review" | "saving" | "done";

interface Props {
  open:      boolean;
  onClose:   () => void;
  /** Called after a receipt is saved so the parent can refresh its list. */
  onSaved?:  () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CURRENCIES = ["CAD", "USD"];

/**
 * Client-side image compression using Canvas.
 * Resizes to ≤ maxWidth and re-encodes as JPEG at 0.85 quality.
 * Returns a Blob with type "image/jpeg".
 */
async function compressImage(file: File, maxWidth = 1600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img     = new Image();
    const objUrl  = URL.createObjectURL(file);

    img.onload = () => {
      const scale   = Math.min(1, maxWidth / Math.max(img.width, img.height));
      const w       = Math.round(img.width  * scale);
      const h       = Math.round(img.height * scale);
      const canvas  = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not available")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objUrl);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.85,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error("Image load failed")); };
    img.src = objUrl;
  });
}

function confidenceLabel(conf: number): { text: string; color: string } {
  if (conf >= 0.85) return { text: "High confidence",   color: "text-emerald-600" };
  if (conf >= 0.60) return { text: "Medium confidence", color: "text-amber-500"   };
  return               { text: "Low confidence — please review carefully", color: "text-red-500" };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReceiptCaptureDialog({ open, onClose, onSaved }: Props) {
  const [state,      setState]      = useState<FlowState>("idle");
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [draft,      setDraft]      = useState<ReceiptDraft | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);  // data URL for img preview

  // Separate file inputs: one for camera, one for gallery/file
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setState("idle");
    setErrorMsg(null);
    setDraft(null);
    setPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current)   fileInputRef.current.value   = "";
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── File selected ──────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File | undefined | null) => {
    if (!file) return;

    setState("processing");
    setErrorMsg(null);

    // Show preview immediately while processing
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      // Compress client-side
      const compressed = await compressImage(file);
      const form        = new FormData();
      form.append("file", new File([compressed], "receipt.jpg", { type: "image/jpeg" }));

      const res = await fetch("/api/receipts/process", {
        method: "POST",
        body:   form,
      });

      const data = (await res.json()) as ProcessReceiptResponse | ProcessReceiptError;

      if (!data.ok) {
        throw new Error(data.error ?? "Processing failed");
      }

      // Normalize into a form-ready draft
      const normalized = normalizeExtraction(data.extraction, data.path);
      setDraft(normalized);
      setState("review");

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setErrorMsg(msg);
      setState("idle");
    }
  }, []);

  // ── Form field update ──────────────────────────────────────────────────────
  const updateDraft = useCallback(
    <K extends keyof ReceiptDraft>(key: K, value: ReceiptDraft[K]) => {
      setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
    },
    [],
  );

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!draft) return;
    setState("saving");

    const supabase = createClient();

    const totalAmt = draft.total_amount !== "" ? parseFloat(draft.total_amount) : null;
    const taxAmt   = draft.tax_amount   !== "" ? parseFloat(draft.tax_amount)   : null;
    const subAmt   = draft.subtotal     !== "" ? parseFloat(draft.subtotal)     : null;

    const { error } = await supabase.from("receipt_expenses").insert({
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

    setState("done");
    toast.success("Receipt saved!");
    onSaved?.();

    // Auto-close after a brief success moment
    setTimeout(() => {
      reset();
      onClose();
    }, 1200);
  }, [draft, reset, onClose, onSaved]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className={cn(
          "max-w-lg w-full",
          // On mobile (below sm), take most of the screen height so form is usable
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

        {/* ── IDLE ─────────────────────────────────────────────────────────── */}
        {state === "idle" && (
          <div className="space-y-4 py-2">
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Take a photo of your receipt or upload one from your device. We&apos;ll read the key details for you.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Camera button — triggers native camera on mobile */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 transition-colors hover:border-primary/50 hover:bg-primary/5 active:scale-95"
              >
                <Camera className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-sm font-medium text-foreground">Take Photo</span>
                <span className="text-[11px] text-muted-foreground text-center">Opens camera on mobile</span>
              </button>

              {/* File upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 transition-colors hover:border-primary/50 hover:bg-primary/5 active:scale-95"
              >
                <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-sm font-medium text-foreground">Upload Photo</span>
                <span className="text-[11px] text-muted-foreground text-center">JPEG, PNG, WEBP</span>
              </button>
            </div>

            {/* Hidden inputs */}
            {/* capture="environment" tells mobile browsers to open the rear camera */}
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
              accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        )}

        {/* ── PROCESSING ───────────────────────────────────────────────────── */}
        {state === "processing" && (
          <div className="flex flex-col items-center gap-5 py-10">
            {preview && (
              <div className="relative h-32 w-32 overflow-hidden rounded-xl border border-border shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Receipt preview"
                  className="h-full w-full object-cover"
                />
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

        {/* ── REVIEW ───────────────────────────────────────────────────────── */}
        {(state === "review" || state === "saving") && draft && (
          <div className="space-y-5 py-1">
            {/* Receipt image + confidence */}
            <div className="flex items-start gap-3">
              {preview && (
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Receipt"
                    className="h-full w-full object-cover"
                  />
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
              {/* Vendor + Date row */}
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

              {/* Amounts row */}
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

              {/* Currency + Category row */}
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
                      {RECEIPT_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.key} value={cat.key}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div className="grid gap-1.5">
                <Label htmlFor="notes" className="text-xs">
                  Notes{" "}
                  <span className="text-muted-foreground">(optional)</span>
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

        {/* ── DONE ─────────────────────────────────────────────────────────── */}
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
