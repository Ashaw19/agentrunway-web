"use client";

/**
 * ManualEntryDialog
 *
 * Cockpit-only manual entry path into corp_transactions.  The receipt
 * upload path is the OCR-driven counterpart (see receipt-capture-dialog
 * with context='corporate' + the /api/receipts/save-corporate route in
 * Deliverable 4).
 *
 * Field shape mirrors the spec at
 *   memory/findings/spec_corp_director_cockpit_phase0_artifacts_2026-05-05.md
 * and the column shape verified against
 *   apps/web/supabase/migrations/00132_corp_director_cockpit.sql.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CorpChartOfAccount,
  CorpVendor,
  CorpSredCategory,
} from "@agent-runway/core/types/database";
import { Loader2, Plus } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCIES = ["CAD", "USD"] as const;

type PaymentMethod =
  | "corp_card"
  | "personal_card"
  | "shareholder_loan_reimburse"
  | "wire"
  | "cheque";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "corp_card",                  label: "Corporate card" },
  { value: "personal_card",              label: "Personal card" },
  { value: "shareholder_loan_reimburse", label: "Shareholder loan reimbursement" },
  { value: "wire",                       label: "Wire transfer" },
  { value: "cheque",                     label: "Cheque" },
];

const SRED_CATEGORIES: { value: CorpSredCategory; label: string }[] = [
  { value: "overhead",      label: "Overhead" },
  { value: "direct_labour", label: "Direct labour" },
  { value: "materials",     label: "Materials" },
  { value: "contractor",    label: "Contractor" },
];

// Today as YYYY-MM-DD in user's local tz — matches DATE column semantics.
function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface Props {
  open:    boolean;
  onClose: () => void;
  onSaved: () => void;
  coa:     CorpChartOfAccount[];
  vendors: CorpVendor[];
}

interface FormState {
  date:            string;
  vendor_input:    string;        // free-text + autocomplete; empty allowed
  vendor_id:       string | null; // set when user picks an existing vendor
  account_code:    string;        // empty until selected
  amount_pretax:   string;
  gst_hst:         string;
  amount_total:    string;
  total_overridden: boolean;       // true once user touches the total field directly
  currency:        string;
  payment_method:  PaymentMethod;
  description:     string;
  sred_eligible:   boolean;
  sred_category:   CorpSredCategory | "";
  pre_incorp_flag: boolean;
  incurred_date:   string;
  notes:           string;
}

function emptyForm(): FormState {
  return {
    date:             todayIso(),
    vendor_input:     "",
    vendor_id:        null,
    account_code:     "",
    amount_pretax:    "",
    gst_hst:          "0",
    amount_total:     "",
    total_overridden: false,
    currency:         "CAD",
    payment_method:   "corp_card",
    description:      "",
    sred_eligible:    false,
    sred_category:    "",
    pre_incorp_flag:  false,
    incurred_date:    "",
    notes:            "",
  };
}

export function ManualEntryDialog({ open, onClose, onSaved, coa, vendors }: Props) {
  const [form,    setForm]    = useState<FormState>(emptyForm());
  const [saving,  setSaving]  = useState(false);
  const [errMsg,  setErrMsg]  = useState<string | null>(null);

  // Reset whenever the dialog opens — every entry is a fresh row.
  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setErrMsg(null);
      setSaving(false);
    }
  }, [open]);

  // Auto-derive total = pretax + gst_hst, unless the user typed in the total
  // field directly (in which case we respect their override).
  useEffect(() => {
    if (form.total_overridden) return;
    const pre = parseFloat(form.amount_pretax);
    const tax = parseFloat(form.gst_hst);
    if (Number.isFinite(pre) || Number.isFinite(tax)) {
      const total = (Number.isFinite(pre) ? pre : 0) + (Number.isFinite(tax) ? tax : 0);
      setForm((f) =>
        f.amount_total === total.toFixed(2) ? f : { ...f, amount_total: total.toFixed(2) },
      );
    }
  }, [form.amount_pretax, form.gst_hst, form.total_overridden]);

  // Vendor autocomplete suggestions — case-insensitive prefix/contains match
  // on the seeded names.  Capped at 6 for the dropdown.
  const vendorSuggestions = useMemo(() => {
    const q = form.vendor_input.trim().toLowerCase();
    if (!q) return [] as CorpVendor[];
    return vendors
      .filter((v) => v.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [form.vendor_input, vendors]);

  // When the user picks a vendor from autocomplete, snap the account_code to
  // its default if the field is still blank (don't clobber a user override).
  const pickVendor = (v: CorpVendor) => {
    setForm((f) => ({
      ...f,
      vendor_input: v.name,
      vendor_id:    v.id,
      account_code: f.account_code || v.default_account_code || "",
      sred_eligible:
        f.account_code === "" && v.sred_eligible ? true : f.sred_eligible,
      sred_category:
        f.account_code === "" && v.sred_eligible && v.sred_category
          ? v.sred_category
          : f.sred_category,
    }));
  };

  // ── Validation ──────────────────────────────────────────────────────────
  const errors = useMemo(() => {
    const list: string[] = [];
    const pre = parseFloat(form.amount_pretax);
    if (!form.date)               list.push("Date is required.");
    if (!form.account_code)       list.push("Account is required.");
    if (!Number.isFinite(pre) || pre <= 0)
      list.push("Pretax amount must be greater than zero.");
    if (form.sred_eligible && !form.sred_category)
      list.push("SR&ED category is required when SR&ED-eligible is on.");
    if (form.pre_incorp_flag && !form.incurred_date)
      list.push("Incurred date is required when pre-incorp is on.");
    return list;
  }, [form]);

  const canSubmit = errors.length === 0 && !saving;

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setErrMsg(null);
    if (!canSubmit) {
      setErrMsg(errors[0] ?? "Form invalid.");
      return;
    }
    setSaving(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setErrMsg("Session expired. Please refresh and try again.");
      return;
    }

    const pretax = parseFloat(form.amount_pretax);
    const tax    = parseFloat(form.gst_hst) || 0;
    const total  = parseFloat(form.amount_total);
    const totalSafe = Number.isFinite(total) ? total : pretax + tax;

    // Look up account_type from the chart so we don't depend on a DB trigger.
    const acct = coa.find((a) => a.account_code === form.account_code);

    // Compose description: if blank, fall back to "[payment_method] —
    // [vendor]" so the row isn't anonymous in the table.
    const descriptionFinal =
      form.description.trim() ||
      [PAYMENT_METHODS.find((m) => m.value === form.payment_method)?.label, form.vendor_input.trim()]
        .filter(Boolean)
        .join(" — ") ||
      null;

    // Notes carries the payment method as a structured tag so we don't lose
    // the field semantics — Phase 0 corp_transactions has no payment_method
    // column (deliberately deferred to Phase 1 per spec).
    const notesParts = [form.notes.trim(), `payment_method=${form.payment_method}`].filter(Boolean);

    const insert = {
      user_id:          user.id,
      date:             form.date,
      amount_pretax:    pretax,
      gst_hst:          tax,
      amount_total:     totalSafe,
      currency:         form.currency,
      vendor_id:        form.vendor_id,
      vendor_name_raw:  form.vendor_input.trim() || null,
      account_code:     form.account_code,
      account_type:     acct?.type ?? null,
      description:      descriptionFinal,
      source_channel:   "manual" as const,
      corp_pct:         100,
      sred_eligible:    form.sred_eligible,
      sred_category:    form.sred_eligible ? form.sred_category || null : null,
      pre_incorp_flag:  form.pre_incorp_flag,
      incurred_date:    form.pre_incorp_flag ? (form.incurred_date || null) : null,
      needs_review:     false,
      review_reason:    null,
      ingested_by_user_id: user.id,
      notes:            notesParts.join(" | ") || null,
    };

    const { error } = await supabase.from("corp_transactions").insert(insert);

    if (error) {
      console.error("[ManualEntryDialog] Insert error:", error.message);
      setErrMsg(`Save failed: ${error.message}`);
      setSaving(false);
      return;
    }

    toast.success("Transaction added");
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Add transaction
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {errMsg && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {errMsg}
            </div>
          )}

          {/* Row 1: Date + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="me-date" className="text-xs">Date</Label>
              <Input
                id="me-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Currency</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
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
          </div>

          {/* Vendor (free-text + autocomplete) */}
          <div className="grid gap-1.5">
            <Label htmlFor="me-vendor" className="text-xs">Vendor</Label>
            <Input
              id="me-vendor"
              value={form.vendor_input}
              onChange={(e) => setForm((f) => ({
                ...f,
                vendor_input: e.target.value,
                // Clear the matched vendor_id once the user diverges from
                // the picked label.
                vendor_id: null,
              }))}
              placeholder="e.g. Anthropic, Bell Mobility, Cox & Palmer"
              className="h-9 text-sm"
              autoComplete="off"
            />
            {vendorSuggestions.length > 0 && form.vendor_id === null && (
              <div className="rounded-md border border-white/10 bg-background/95 backdrop-blur shadow-sm">
                <ul className="max-h-44 overflow-y-auto py-1">
                  {vendorSuggestions.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => pickVendor(v)}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-white/5"
                      >
                        <span className="text-foreground/90">{v.name}</span>
                        {v.default_account_code && (
                          <span className="text-muted-foreground/70 font-mono text-[11px] tabular-nums">
                            {v.default_account_code}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Account dropdown */}
          <div className="grid gap-1.5">
            <Label className="text-xs">Account</Label>
            <Select
              value={form.account_code}
              onValueChange={(v) => setForm((f) => ({ ...f, account_code: v }))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select an account…" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {coa.map((a) => (
                  <SelectItem key={a.account_code} value={a.account_code}>
                    <span className="font-mono tabular-nums text-muted-foreground/80 mr-2">
                      {a.account_code}
                    </span>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="me-pretax" className="text-xs">Pretax <span className="text-red-400">*</span></Label>
              <Input
                id="me-pretax"
                type="number"
                step="0.01"
                min="0"
                value={form.amount_pretax}
                onChange={(e) => setForm((f) => ({ ...f, amount_pretax: e.target.value }))}
                placeholder="0.00"
                className="h-9 text-sm"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="me-tax" className="text-xs">GST/HST</Label>
              <Input
                id="me-tax"
                type="number"
                step="0.01"
                min="0"
                value={form.gst_hst}
                onChange={(e) => setForm((f) => ({ ...f, gst_hst: e.target.value }))}
                placeholder="0.00"
                className="h-9 text-sm"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="me-total" className="text-xs">Total</Label>
              <Input
                id="me-total"
                type="number"
                step="0.01"
                min="0"
                value={form.amount_total}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  amount_total: e.target.value,
                  total_overridden: true,
                }))}
                placeholder="auto"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Payment method */}
          <div className="grid gap-1.5">
            <Label className="text-xs">Payment method</Label>
            <Select
              value={form.payment_method}
              onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v as PaymentMethod }))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="me-desc" className="text-xs">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="me-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Pro plan + extra usage upgrade"
              className="h-9 text-sm"
            />
          </div>

          {/* SR&ED toggle */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
            <div className="min-w-0">
              <Label htmlFor="me-sred" className="text-sm cursor-pointer">SR&amp;ED-eligible</Label>
              <p className="text-muted-foreground/70 text-[11px]">
                Flag this row for the T661 working paper.
              </p>
            </div>
            <Switch
              id="me-sred"
              checked={form.sred_eligible}
              onCheckedChange={(v) => setForm((f) => ({
                ...f,
                sred_eligible: v,
                sred_category: v ? f.sred_category : "",
              }))}
            />
          </div>
          {form.sred_eligible && (
            <div className="grid gap-1.5 pl-3">
              <Label className="text-xs">SR&amp;ED category <span className="text-red-400">*</span></Label>
              <Select
                value={form.sred_category || ""}
                onValueChange={(v) => setForm((f) => ({ ...f, sred_category: v as CorpSredCategory }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  {SRED_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Pre-incorp toggle */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
            <div className="min-w-0">
              <Label htmlFor="me-preinc" className="text-sm cursor-pointer">Pre-incorp expense</Label>
              <p className="text-muted-foreground/70 text-[11px]">
                Paid before AR Inc. incorporated 2026-04-16. Flagged for accountant reclassification.
              </p>
            </div>
            <Switch
              id="me-preinc"
              checked={form.pre_incorp_flag}
              onCheckedChange={(v) => setForm((f) => ({
                ...f,
                pre_incorp_flag: v,
                incurred_date: v ? f.incurred_date : "",
              }))}
            />
          </div>
          {form.pre_incorp_flag && (
            <div className="grid gap-1.5 pl-3">
              <Label htmlFor="me-incurred" className="text-xs">
                Incurred date <span className="text-red-400">*</span>
              </Label>
              <Input
                id="me-incurred"
                type="date"
                value={form.incurred_date}
                onChange={(e) => setForm((f) => ({ ...f, incurred_date: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
          )}

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label htmlFor="me-notes" className="text-xs">
              Notes <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="me-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Free-form context, statement reference, etc."
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          {/* Validation summary */}
          {errors.length > 0 && (
            <ul className="text-muted-foreground/80 list-inside list-disc space-y-0.5 text-[11px]">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!canSubmit}
              className="gap-1.5"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                "Save transaction"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
