"use client";

/**
 * ReceiptViewEditDialog
 * ─────────────────────
 * Displays a saved receipt with its photo and allows the agent to correct
 * any OCR errors before saving. Also handles delete with confirmation.
 *
 * Layout (two-panel):
 *   Left  — Receipt photo with zoom/rotate controls + OCR confidence badge
 *   Right — Editable form: vendor, date, total, tax, category, notes
 */

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
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
  Loader2, Trash2, Save, ZoomIn, ZoomOut, RotateCw,
  ExternalLink, Receipt, AlertTriangle,
} from "lucide-react";
import { RECEIPT_CATEGORY_GROUPS } from "@/lib/types/receipt";
import type { ReceiptExpense } from "@/lib/types/receipt";
import { cn } from "@/lib/utils";

interface Props {
  receipt: ReceiptExpense | null;
  open: boolean;
  onClose: () => void;
  /** Called after a successful save — pass the updated row */
  onSaved: (updated: ReceiptExpense) => void;
  /** Called after a successful delete — pass the deleted id */
  onDeleted: (id: string) => void;
}

export function ReceiptViewEditDialog({
  receipt, open, onClose, onSaved, onDeleted,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  // ── Image panel state ──────────────────────────────────────────────────────
  const [imageUrl,     setImageUrl]     = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [zoom,         setZoom]         = useState(1);
  const [rotation,     setRotation]     = useState(0);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [vendor,      setVendor]      = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [totalAmt,    setTotalAmt]    = useState("");
  const [taxAmt,      setTaxAmt]      = useState("");
  const [catKey,      setCatKey]      = useState("");
  const [notes,       setNotes]       = useState("");

  // ── Action state ───────────────────────────────────────────────────────────
  const [saving,         setSaving]         = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [deleting,       setDeleting]       = useState(false);

  // ── Sync form + image when receipt changes ─────────────────────────────────
  useEffect(() => {
    if (!receipt) return;
    setVendor(receipt.vendor ?? "");
    setExpenseDate(receipt.expense_date ?? "");
    setTotalAmt(receipt.total_amount != null ? String(receipt.total_amount) : "");
    setTaxAmt(receipt.tax_amount   != null ? String(receipt.tax_amount)   : "");
    setCatKey(receipt.category_key ?? "");
    setNotes(receipt.notes ?? "");
    setZoom(1);
    setRotation(0);
    setConfirmDelete(false);
  }, [receipt]);

  useEffect(() => {
    if (!receipt?.receipt_path || !open) {
      setImageUrl(null);
      return;
    }
    setImageLoading(true);
    supabase.storage
      .from("receipts")
      .createSignedUrl(receipt.receipt_path, 3600)
      .then(({ data, error }) => {
        setImageUrl(data?.signedUrl && !error ? data.signedUrl : null);
        setImageLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.receipt_path, open]);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!receipt) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("receipt_expenses")
      .update({
        vendor:       vendor.trim() || null,
        expense_date: expenseDate   || null,
        total_amount: totalAmt.trim() !== "" && !isNaN(parseFloat(totalAmt)) ? parseFloat(totalAmt) : null,
        tax_amount:   taxAmt.trim()  !== "" && !isNaN(parseFloat(taxAmt))  ? parseFloat(taxAmt)  : null,
        category_key: catKey               || null,
        notes:        notes.trim()         || null,
      })
      .eq("id", receipt.id)
      .select()
      .single();

    setSaving(false);
    if (error || !data) {
      toast.error("Couldn't save — please try again.");
      return;
    }
    toast.success("Receipt updated ✓");
    onSaved(data as ReceiptExpense);
    onClose();
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!receipt) return;
    setDeleting(true);
    const { error: delErr } = await supabase.from("receipt_expenses").delete().eq("id", receipt.id);
    if (delErr) {
      toast.error("Couldn't delete receipt — please try again.");
      setDeleting(false);
      return;
    }
    if (receipt.receipt_path) {
      await supabase.storage.from("receipts").remove([receipt.receipt_path]);
    }
    setDeleting(false);
    toast("Receipt deleted");
    onDeleted(receipt.id);
    onClose();
  }

  // ── OCR confidence ─────────────────────────────────────────────────────────
  const confidencePct = receipt?.ocr_confidence != null
    ? Math.round(receipt.ocr_confidence * 100)
    : null;
  const confidenceColor =
    confidencePct == null        ? "" :
    confidencePct >= 85          ? "text-emerald-400" :
    confidencePct >= 60          ? "text-amber-400"   : "text-red-400";

  if (!receipt) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden p-0 gap-0">
        <div className="flex flex-col sm:flex-row" style={{ maxHeight: "88vh" }}>

          {/* ── LEFT: Photo panel ──────────────────────────────────────────── */}
          <div className="flex w-full sm:w-[42%] shrink-0 flex-col bg-slate-900">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-1 border-b border-slate-700 bg-slate-800 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Receipt Photo
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1)))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-30"
                  disabled={zoom <= 0.4} title="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="w-9 text-center text-[10px] font-mono text-slate-400">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(1)))}
                  className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white disabled:opacity-30"
                  disabled={zoom >= 3} title="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
                  title="Rotate 90°"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                {imageUrl && (
                  <a
                    href={imageUrl} target="_blank" rel="noopener noreferrer"
                    className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
                    title="Open full size"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Image area */}
            <div className="flex flex-1 items-center justify-center overflow-auto p-4 min-h-[180px]">
              {imageLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
              ) : imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="Receipt"
                  className="max-w-full rounded-sm object-contain shadow-lg transition-transform duration-150"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: "center center",
                  }}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <div className="rounded-full bg-slate-800 p-4">
                    <Receipt className="h-7 w-7" />
                  </div>
                  <p className="text-xs text-slate-500">No photo stored</p>
                </div>
              )}
            </div>

            {/* OCR badge */}
            {confidencePct != null && (
              <div className="border-t border-slate-700 bg-slate-800/60 px-3 py-2 text-center">
                <span className={cn("text-[10px] font-semibold", confidenceColor)}>
                  OCR confidence: {confidencePct}%
                  {confidencePct < 80 && " · Please verify fields →"}
                </span>
              </div>
            )}
          </div>

          {/* ── RIGHT: Edit form ───────────────────────────────────────────── */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <DialogHeader className="border-b px-5 pt-4 pb-3">
              <DialogTitle className="text-[15px] font-semibold leading-tight">
                {vendor || "Receipt Details"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Captured{" "}
                {receipt.created_at
                  ? new Date(receipt.created_at).toLocaleDateString("en-CA", {
                      month: "short", day: "numeric", year: "numeric",
                    })
                  : "—"}
              </p>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
              {/* Vendor */}
              <div className="space-y-1.5">
                <Label htmlFor="rv-vendor" className="text-xs font-semibold">Vendor</Label>
                <Input
                  id="rv-vendor"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. Starbucks, Shell, Adobe"
                  className="h-8 text-sm"
                />
              </div>

              {/* Date + Total */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rv-date" className="text-xs font-semibold">Date</Label>
                  <Input
                    id="rv-date"
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rv-total" className="text-xs font-semibold">Total (CAD)</Label>
                  <Input
                    id="rv-total"
                    type="number"
                    step="0.01"
                    min="0"
                    value={totalAmt}
                    onChange={(e) => setTotalAmt(e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-sm text-right"
                  />
                </div>
              </div>

              {/* Tax */}
              <div className="space-y-1.5">
                <Label htmlFor="rv-tax" className="text-xs font-semibold">
                  HST / Tax Amount{" "}
                  <span className="font-normal text-muted-foreground">(optional — for ITC tracking)</span>
                </Label>
                <Input
                  id="rv-tax"
                  type="number"
                  step="0.01"
                  min="0"
                  value={taxAmt}
                  onChange={(e) => setTaxAmt(e.target.value)}
                  placeholder="0.00"
                  className="h-8 text-sm text-right"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <Select value={catKey} onValueChange={setCatKey}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select a category…" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECEIPT_CATEGORY_GROUPS.map((group) => (
                      <SelectGroup key={group.group}>
                        <SelectLabel className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          {group.group}
                        </SelectLabel>
                        {group.items.map((item) => (
                          <SelectItem key={item.key} value={item.key} className="text-sm">
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="rv-notes" className="text-xs font-semibold">
                  Notes{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="rv-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Client meeting — John & Sarah, or open house signage"
                  className="min-h-[60px] resize-none text-sm"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="border-t px-5 py-3">
              {/* Delete confirmation */}
              {confirmDelete ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                  <p className="flex-1 text-xs text-red-700">
                    Permanently delete this receipt and photo?
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 bg-red-600 px-3 text-xs hover:bg-red-700"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                      {saving
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Save className="h-3.5 w-3.5" />}
                      Save changes
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
