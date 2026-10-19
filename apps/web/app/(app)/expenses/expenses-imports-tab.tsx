"use client";

/**
 * Expenses → Imports: upload a bank or credit-card statement, review its
 * lines, confirm the business ones into the expense records.
 *
 * Reads and writes go through /api/statement-import (lib/statement-import/
 * server.ts). What confirming a line does is the engine's
 * (statement-import-engine: confirmationOutcome), so the summary here is what
 * fn_confirm_statement_lines then does: a line already on file is linked,
 * never added twice. The confirm screen carries the canonical tax
 * disclaimer. Excel files are read here in the browser (xlsx-rows.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, Link2, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RECEIPT_CATEGORY_GROUPS, receiptCategoryFullLabel } from "@/lib/types/receipt";
import { readImportError } from "@/lib/import/client-error";
import { rowsFromWorkbook } from "@/lib/import/bank-csv/xlsx-rows";
import {
  bulkConfirmExclusion,
  confirmationOutcome,
  findStatementDuplicates,
  type BulkExclusion,
  type DuplicateFinding,
} from "@agent-runway/core/engines/statement-import-engine";
import {
  CANONICAL_TAX_DISCLAIMER,
  STATEMENT_DUPLICATE_NOTE,
  STATEMENT_ESTIMATE_NOTE,
  STATEMENT_GST_HST_NOTE,
  STATEMENT_RECORDS_NOTE,
  businessLikelihoodLabel,
  statementConfirmSummary,
} from "@agent-runway/core/tax-copy";
import { daysBetweenISO } from "@agent-runway/core/lib/local-date";
import type { StatementReview, StatementLineRow, ReceiptRow } from "@/lib/statement-import/server";

type Filter = "pending" | "skipped" | "confirmed" | "all";

const FILTER_LABEL: Record<Filter, string> = {
  pending: "To review",
  skipped: "Skipped",
  confirmed: "Confirmed",
  all: "All",
};

const SKIP_LABEL: Record<string, string> = {
  personal: "Indicated as personal",
  transfer: "Transfer or cash",
  payment: "Payment",
  income: "Money in",
  duplicate: "Already on file",
  user: "Skipped",
};

const EXCLUSION_LABEL: Record<BulkExclusion, string> = {
  not_confirmable: "held, money in, already decided or without a category",
  expense_deleted: "its expense was deleted earlier",
  low_likelihood: "under 50% business",
  unverified_statement: "from a PDF that couldn't be checked against its totals",
};

const VERIFICATION_NOTE: Record<string, string | null> = {
  not_applicable: null,
  reconciled: "Checked against the statement's printed totals.",
  mismatch: "The lines don't add up to the statement's printed totals. Its lines are confirmed one at a time.",
  unverified: "No totals could be read from this PDF to check its lines against. Its lines are confirmed one at a time.",
};

interface MappingState {
  hasHeader: boolean;
  date: number;
  description: number;
  amountMode: "signed" | "split";
  amount: number;
  debit: number;
  credit: number;
  dateOrder: "ymd" | "mdy" | "dmy";
  negativeIs: "out" | "in";
}

/** Statement amounts to the cent ("$54.20"): a charge is matched to its receipt by the cents. */
function fmtCurrency(n: number): string {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  // A calendar day: built and shown in the browser's own zone.
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function postLines(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/statement-import/lines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data?.ok) throw new Error(String(data?.error ?? "That didn't save. Try again."));
  return data;
}

export function ExpensesImportsTab({ onExpensesChanged }: { onExpensesChanged?: () => void }) {
  const [review, setReview] = useState<StatementReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [statementFilter, setStatementFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"bank" | "credit_card">("credit_card");
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadNotes, setUploadNotes] = useState<string[]>([]);
  const [mappingPreview, setMappingPreview] = useState<{ preview: string[][]; columnCount: number } | null>(null);
  const [dateOrderAsk, setDateOrderAsk] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<MappingState>({
    hasHeader: true, date: 0, description: 1, amountMode: "signed", amount: 2, debit: 2, credit: 3, dateOrder: "mdy", negativeIs: "out",
  });

  // Confirm
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmIds, setConfirmIds] = useState<string[]>([]);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/statement-import", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Could not load your imports.");
      setReview(data as StatementReview);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your imports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const after = useCallback(async (changedExpenses: boolean) => {
    setSelected(new Set());
    await load();
    if (changedExpenses) onExpensesChanged?.();
  }, [load, onExpensesChanged]);

  // ── Derived ────────────────────────────────────────────────────────────

  const receiptById = useMemo(() => new Map((review?.receipts ?? []).map((r) => [r.id, r])), [review]);
  const recurringById = useMemo(() => new Map((review?.recurring ?? []).map((r) => [r.id, r])), [review]);
  const statementById = useMemo(() => new Map((review?.statements ?? []).map((s) => [s.id, s])), [review]);
  const lineById = useMemo(() => new Map((review?.lines ?? []).map((l) => [l.id, l])), [review]);
  const labels = useMemo(() => [...new Set((review?.statements ?? []).map((s) => s.account_label))], [review]);

  // For held lines: which records could be the charge.
  const candidates = useMemo(() => {
    const out = new Map<string, Extract<DuplicateFinding, { kind: "ambiguous" }>>();
    if (!review) return out;
    const held = review.lines.filter((l) => l.status === "pending" && (l.hold_reason || l.duplicate_candidate_count > 1) && !l.duplicate_dismissed);
    if (held.length === 0) return out;
    const findings = findStatementDuplicates(review.lines, review.receipts, review.recurring);
    for (const h of held) {
      const f = findings.get(h.id);
      if (f?.kind === "ambiguous") out.set(h.id, f);
    }
    return out;
  }, [review]);

  const visible = useMemo(() => {
    return (review?.lines ?? []).filter((l) =>
      (filter === "all" || l.status === filter) &&
      (statementFilter === "all" || l.statement_id === statementFilter),
    );
  }, [review, filter, statementFilter]);

  const counts = useMemo(() => {
    const lines = (review?.lines ?? []).filter((l) => statementFilter === "all" || l.statement_id === statementFilter);
    return {
      pending: lines.filter((l) => l.status === "pending").length,
      skipped: lines.filter((l) => l.status === "skipped").length,
      confirmed: lines.filter((l) => l.status === "confirmed").length,
      all: lines.length,
    };
  }, [review, statementFilter]);

  const selectedLines = useMemo(() => visible.filter((l) => selected.has(l.id)), [visible, selected]);

  /** Why a line can't be confirmed as one of several (null when it can). */
  const exclusion = useCallback(
    (l: StatementLineRow) => bulkConfirmExclusion(l, statementById.get(l.statement_id)?.verification),
    [statementById],
  );

  // ── Upload ─────────────────────────────────────────────────────────────

  async function upload(withMapping: boolean, dateOrder?: "mdy" | "dmy") {
    if (!file) {
      toast.error("Choose a statement file first.");
      return;
    }
    setUploading(true);
    setUploadNotes([]);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("account_label", label);
      if (dateOrder) fd.set("date_order", dateOrder);
      if (withMapping) {
        fd.set("mapping", JSON.stringify({
          headerRow: mapping.hasHeader ? 0 : null,
          firstDataRow: mapping.hasHeader ? 1 : 0,
          date: mapping.date,
          description: [mapping.description],
          amount: mapping.amountMode === "signed" ? mapping.amount : null,
          debit: mapping.amountMode === "split" ? mapping.debit : null,
          credit: mapping.amountMode === "split" ? mapping.credit : null,
          dateOrder: mapping.dateOrder,
          negativeIs: mapping.negativeIs,
        }));
      }
      if (/\.xlsx?$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const rows = rowsFromWorkbook(XLSX, buf);
        fd.set("rows", JSON.stringify(rows));
        fd.set("file_hash", await sha256Hex(buf));
        fd.set("file_name", file.name);
      } else {
        if (file.size > 4 * 1024 * 1024) throw new Error("That file is larger than 4 MB. Export one month at a time.");
        fd.set("file", file);
      }
      const res = await fetch("/api/statement-import", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.needsMapping) {
          setMappingPreview({ preview: data.preview ?? [], columnCount: data.columnCount ?? 0 });
          toast.info(data.error ?? "Choose which column is which.");
          return;
        }
        if (data?.needsDateOrder) {
          setDateOrderAsk(Array.isArray(data.sampleDates) ? data.sampleDates : []);
          toast.info(data.error ?? "Choose how the dates are written.");
          return;
        }
        throw new Error(data?.error ?? (await readImportError(res)).message);
      }
      setMappingPreview(null);
      setDateOrderAsk(null);
      const notes: string[] = Array.isArray(data?.warnings) ? data.warnings : [];
      setUploadNotes(notes);
      if (data.added > 0) {
        toast.success(`${data.added} line${data.added === 1 ? "" : "s"} ready for review${data.alreadyImported ? ` (${data.alreadyImported} already imported)` : ""}.`);
      } else {
        toast.info(data.alreadyImported ? "Every line in this file was already imported." : "No new lines were found.");
      }
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      if (data.statementId) setStatementFilter(data.statementId);
      setFilter("pending");
      await after(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  // ── Line actions ───────────────────────────────────────────────────────

  async function run(body: Record<string, unknown>, success: string, changedExpenses: boolean) {
    setBusy(true);
    try {
      await postLines(body);
      toast.success(success);
      await after(changedExpenses);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function setCategory(lineIds: string[], categoryKey: string) {
    await run({ action: "category", lineIds, categoryKey }, lineIds.length === 1 ? "Category changed." : `Category changed on ${lineIds.length} lines.`, false);
  }

  function openConfirm(ids: string[]) {
    if (ids.length === 0) {
      toast.info("Select the lines to confirm.");
      return;
    }
    setConfirmIds(ids);
    setConfirmOpen(true);
  }

  // One line: confirmed as asked (the agent is looking at it). Several: only
  // the ones bulkConfirmExclusion lets through; the rest are listed.
  const confirmPlan = useMemo(() => {
    const lines = (review?.lines ?? []).filter((l) => confirmIds.includes(l.id));
    const single = lines.length === 1;
    const c = { create: 0, link: 0, recurring: 0, held: 0, other: 0 };
    const send: string[] = [];
    const left: Partial<Record<BulkExclusion, number>> = {};
    for (const l of lines) {
      const why = single ? null : exclusion(l);
      if (why && why !== "not_confirmable") {
        left[why] = (left[why] ?? 0) + 1;
        continue;
      }
      const o = confirmationOutcome(l);
      if (o.action === "create") c.create++;
      else if (o.action === "link_receipt") c.link++;
      else if (o.action === "recurring") c.recurring++;
      else if (o.reason === "needs_decision") c.held++;
      else c.other++;
      if (o.action !== "refuse") send.push(l.id);
    }
    return { counts: c, send, left, single };
  }, [review, confirmIds, exclusion]);
  const confirmPreview = confirmPlan.counts;

  async function doConfirm() {
    setBusy(true);
    try {
      const data = await postLines({ action: "confirm", lines: confirmPlan.send.map((id) => ({ id })) });
      const created = (data.created as unknown[] | undefined)?.length ?? 0;
      const linked = ((data.linked as unknown[] | undefined)?.length ?? 0) + ((data.recurring as unknown[] | undefined)?.length ?? 0);
      const refused = (data.refused as { message?: string }[] | undefined) ?? [];
      toast.success(`${created} added to your expenses${linked ? `, ${linked} already on file and linked` : ""}.`);
      if (refused.length > 0) toast.info(`${refused.length} not confirmed: ${refused[0]?.message ?? ""}`);
      setConfirmOpen(false);
      await after(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nothing was added. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────

  function receiptText(r: ReceiptRow | undefined): string {
    if (!r) return "a receipt on file";
    return `${r.vendor ?? "Receipt"} ${fmtCurrency(Number(r.total_amount ?? 0))} on ${fmtDay(r.expense_date)}`;
  }

  function DuplicateChip({ line }: { line: StatementLineRow }) {
    if (line.direction !== "out") {
      if (line.hold_reason === "refund") {
        const p = line.related_line_id ? lineById.get(line.related_line_id) : undefined;
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" /> Refund of {p ? `${p.merchant || p.description} ${fmtCurrency(Number(p.amount))} on ${fmtDay(p.line_date)}` : "a charge in your imports"}
          </span>
        );
      }
      return null;
    }
    if (line.duplicate_dismissed) return <span className="text-[11px] text-muted-foreground">Marked as a different charge</span>;
    if (line.match_receipt_id) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
          <Link2 className="h-3 w-3" /> On file: {receiptText(receiptById.get(line.match_receipt_id))}
        </span>
      );
    }
    if (line.recurring_expense_id) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
          <Link2 className="h-3 w-3" /> Recurring: {recurringById.get(line.recurring_expense_id)?.name ?? "recurring expense"}
        </span>
      );
    }
    const held = (text: string) => (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3 w-3" /> {text}
      </span>
    );
    const related = line.related_line_id ? lineById.get(line.related_line_id) : undefined;
    const relatedText = related ? `${related.merchant || related.description} ${fmtCurrency(Number(related.amount))} on ${fmtDay(related.line_date)}` : null;
    switch (line.hold_reason) {
      case "other_import":
        return held(`Could be the same charge as a line in another import${relatedText ? `: ${relatedText}` : ""}`);
      case "near_match":
        return held(`Close to a record on file${line.related_receipt_id ? `: ${receiptText(receiptById.get(line.related_receipt_id))}` : ""}`);
      case "recurring_off_date":
        return held("Same amount as a recurring expense charged a few days away");
      case "refund":
        return held(`Refunded later${relatedText ? `: ${relatedText}` : ""}. Skip it, or keep both`);
      case "recurring_changed":
        return held("The recurring expense it was counted under changed: check it again");
      case "later_receipt":
        return held(`A receipt saved later could be this charge: ${receiptText(line.related_receipt_id ? receiptById.get(line.related_receipt_id) : undefined)}`);
      default:
        return line.duplicate_candidate_count > 1 ? held("Could be a charge already on file") : null;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const statements = review?.statements ?? [];
  const recon = review?.reconciliation;

  return (
    <div className="space-y-5">
      {/* Upload */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <FileUp className="h-4 w-4" /> Import a bank or card statement
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              CSV, Excel or PDF, from RBC, TD, Scotiabank, BMO, CIBC, National Bank, Tangerine, Simplii, Desjardins, American Express or QuickBooks Self-Employed (other files work when their columns can be read). Account and card numbers are removed as the file is read, and the file itself isn&apos;t kept. Nothing is added to your expenses until you confirm.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="statement-file" className="text-xs">Statement file</Label>
              <Input
                id="statement-file"
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf,text/csv,application/pdf"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setMappingPreview(null);
                }}
                className="text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Account</span>
              <div className="flex rounded-md border border-border p-0.5 text-xs">
                {(["credit_card", "bank"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn("rounded px-2.5 py-1.5", kind === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                  >
                    {k === "credit_card" ? "Credit card" : "Bank account"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="statement-label" className="text-xs">Account name <span className="text-muted-foreground">(no account number)</span></Label>
              <Input
                id="statement-label"
                list="statement-labels"
                placeholder="e.g. RBC Visa"
                value={label}
                maxLength={80}
                onChange={(e) => setLabel(e.target.value)}
                className="text-sm"
              />
              <datalist id="statement-labels">
                {labels.map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <Button onClick={() => upload(false)} disabled={!file || uploading} className="h-9">
              {uploading ? "Reading..." : "Upload"}
            </Button>
          </div>
          {uploading && file && /\.pdf$/i.test(file.name) && (
            <p className="text-xs text-muted-foreground">Reading the PDF and checking it against its own totals. This can take a minute.</p>
          )}
          {uploadNotes.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              {uploadNotes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}

          {dateOrderAsk && (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">How are the dates written?</p>
              <p className="text-xs text-muted-foreground">
                Every date in this file could be read either way{dateOrderAsk.length > 0 ? ` (for example ${dateOrderAsk.join(", ")})` : ""}. Nothing is read until you choose.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={uploading} onClick={() => upload(Boolean(mappingPreview), "mdy")}>Month/day/year</Button>
                <Button size="sm" variant="outline" disabled={uploading} onClick={() => upload(Boolean(mappingPreview), "dmy")}>Day/month/year</Button>
              </div>
            </div>
          )}

          {mappingPreview && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Which column is which?</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr>
                      {Array.from({ length: mappingPreview.columnCount }, (_, c) => (
                        <th key={c} className="border-b px-2 py-1 text-left font-semibold text-muted-foreground">Column {c + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappingPreview.preview.slice(0, 6).map((row, r) => (
                      <tr key={r}>
                        {Array.from({ length: mappingPreview.columnCount }, (_, c) => (
                          <td key={c} className="max-w-[160px] truncate border-b px-2 py-1">{row[c] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 text-xs sm:grid-cols-3">
                {([
                  ["Date", "date"],
                  ["Description", "description"],
                ] as const).map(([name, field]) => (
                  <label key={field} className="grid gap-1">
                    <span className="font-medium">{name} column</span>
                    <select
                      className="rounded border border-border bg-background px-2 py-1"
                      value={mapping[field]}
                      onChange={(e) => setMapping({ ...mapping, [field]: Number(e.target.value) })}
                    >
                      {Array.from({ length: mappingPreview.columnCount }, (_, c) => <option key={c} value={c}>Column {c + 1}</option>)}
                    </select>
                  </label>
                ))}
                <label className="grid gap-1">
                  <span className="font-medium">Amounts</span>
                  <select
                    className="rounded border border-border bg-background px-2 py-1"
                    value={mapping.amountMode}
                    onChange={(e) => setMapping({ ...mapping, amountMode: e.target.value as MappingState["amountMode"] })}
                  >
                    <option value="signed">One column, with a sign</option>
                    <option value="split">Money out and money in columns</option>
                  </select>
                </label>
                {mapping.amountMode === "signed" ? (
                  <>
                    <label className="grid gap-1">
                      <span className="font-medium">Amount column</span>
                      <select className="rounded border border-border bg-background px-2 py-1" value={mapping.amount} onChange={(e) => setMapping({ ...mapping, amount: Number(e.target.value) })}>
                        {Array.from({ length: mappingPreview.columnCount }, (_, c) => <option key={c} value={c}>Column {c + 1}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="font-medium">A negative amount is</span>
                      <select className="rounded border border-border bg-background px-2 py-1" value={mapping.negativeIs} onChange={(e) => setMapping({ ...mapping, negativeIs: e.target.value as "out" | "in" })}>
                        <option value="out">A charge (money out)</option>
                        <option value="in">A payment or refund (money in)</option>
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="grid gap-1">
                      <span className="font-medium">Money out column</span>
                      <select className="rounded border border-border bg-background px-2 py-1" value={mapping.debit} onChange={(e) => setMapping({ ...mapping, debit: Number(e.target.value) })}>
                        {Array.from({ length: mappingPreview.columnCount }, (_, c) => <option key={c} value={c}>Column {c + 1}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="font-medium">Money in column</span>
                      <select className="rounded border border-border bg-background px-2 py-1" value={mapping.credit} onChange={(e) => setMapping({ ...mapping, credit: Number(e.target.value) })}>
                        {Array.from({ length: mappingPreview.columnCount }, (_, c) => <option key={c} value={c}>Column {c + 1}</option>)}
                      </select>
                    </label>
                  </>
                )}
                <label className="grid gap-1">
                  <span className="font-medium">Dates are written</span>
                  <select className="rounded border border-border bg-background px-2 py-1" value={mapping.dateOrder} onChange={(e) => setMapping({ ...mapping, dateOrder: e.target.value as MappingState["dateOrder"] })}>
                    <option value="mdy">Month/day/year</option>
                    <option value="dmy">Day/month/year</option>
                    <option value="ymd">Year-month-day</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 pt-5">
                  <input type="checkbox" checked={mapping.hasHeader} onChange={(e) => setMapping({ ...mapping, hasHeader: e.target.checked })} />
                  <span>The first row holds column names</span>
                </label>
              </div>
              <Button size="sm" onClick={() => upload(true)} disabled={uploading}>Read with these columns</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading your imports...</p>}
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {!loading && statements.length > 0 && (
        <>
          {/* Imported statements */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatementFilter("all")}
              className={cn("rounded-full border px-3 py-1 text-xs", statementFilter === "all" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/40")}
            >
              All imports
            </button>
            {statements.map((s) => (
              <span key={s.id} className={cn("inline-flex items-center gap-1 rounded-full border text-xs", statementFilter === s.id ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground")}>
                <button type="button" className="py-1 pl-3" onClick={() => setStatementFilter(s.id)}>
                  {s.account_label}: {fmtDay(s.period_start)} to {fmtDay(s.period_end)}
                  {s.pending_count > 0 ? ` (${s.pending_count} to review)` : ""}
                </button>
                <button type="button" title="Remove this import" className="py-1 pr-2 pl-1 opacity-70 hover:opacity-100" onClick={() => setRemoveId(s.id)}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          {/* Notes on every import shown: a PDF that didn't check out is visible in "All imports" too. */}
          {statements.filter((st) => statementFilter === "all" || st.id === statementFilter).some((st) => (st.warnings?.length ?? 0) > 0 || VERIFICATION_NOTE[st.verification]) && (
            <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              {statements
                .filter((st) => statementFilter === "all" || st.id === statementFilter)
                .flatMap((st) => [
                  ...(VERIFICATION_NOTE[st.verification] && st.verification !== "reconciled" ? [VERIFICATION_NOTE[st.verification]!] : []),
                  ...(st.warnings ?? []),
                ].map((w, i) => (
                  <li key={`${st.id}-${i}`}>{statements.length > 1 ? <span className="font-medium">{st.account_label}, {fmtDay(st.period_start)} to {fmtDay(st.period_end)}: </span> : null}{w}</li>
                )))}
            </ul>
          )}

          {/* Review table */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(["pending", "skipped", "confirmed", "all"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => { setFilter(f); setSelected(new Set()); }}
                    className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", filter === f ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/40")}
                  >
                    {FILTER_LABEL[f]} ({counts[f]})
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedLines.length > 0 && filter === "pending" && (
                  <>
                    <Select onValueChange={(v) => setCategory(selectedLines.filter((l) => l.direction === "out").map((l) => l.id), v)}>
                      <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Set category for selected" /></SelectTrigger>
                      <SelectContent>
                        {RECEIPT_CATEGORY_GROUPS.map((g) => (
                          <SelectGroup key={g.group}>
                            <SelectLabel className="text-xs">{g.group}</SelectLabel>
                            {g.items.map((i) => <SelectItem key={i.key} value={i.key} className="text-xs">{i.label}</SelectItem>)}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "skip", lineIds: selectedLines.map((l) => l.id) }, "Skipped.", false)}>
                      <XCircle className="mr-1 h-3.5 w-3.5" /> Skip selected
                    </Button>
                  </>
                )}
                {selectedLines.length > 0 && filter !== "pending" && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "reopen", lineIds: selectedLines.filter((l) => l.status !== "pending").map((l) => l.id) }, "Back to review.", true)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Back to review
                  </Button>
                )}
                {filter === "pending" && (
                  <Button
                    size="sm"
                    disabled={busy || counts.pending === 0}
                    onClick={() => openConfirm(selectedLines.length > 0 ? selectedLines.map((l) => l.id) : visible.filter((l) => l.status === "pending" && exclusion(l) === null).map((l) => l.id))}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    {selectedLines.length > 0 ? `Confirm ${selectedLines.length} selected` : "Confirm lines with a category"}
                  </Button>
                )}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">{STATEMENT_ESTIMATE_NOTE} {STATEMENT_DUPLICATE_NOTE}</p>

            {visible.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                {filter === "pending" ? "Nothing waiting for review." : "No lines here."}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-8 px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label="Select all"
                            checked={visible.length > 0 && visible.every((l) => selected.has(l.id))}
                            onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((l) => l.id)) : new Set())}
                          />
                        </th>
                        <th className="px-3 py-2.5 font-medium">Date</th>
                        <th className="px-3 py-2.5 font-medium">Merchant</th>
                        <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                        <th className="px-3 py-2.5 font-medium">Estimated category</th>
                        <th className="px-3 py-2.5 font-medium">Business</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visible.map((l) => {
                        const cat = l.category_key ?? l.suggested_category_key;
                        const held = candidates.get(l.id);
                        return (
                          <tr key={l.id} className={cn("align-top", l.status !== "pending" && "opacity-70")}>
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                aria-label="Select line"
                                checked={selected.has(l.id)}
                                onChange={(e) => {
                                  const next = new Set(selected);
                                  if (e.target.checked) next.add(l.id);
                                  else next.delete(l.id);
                                  setSelected(next);
                                }}
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{fmtDay(l.line_date)}</td>
                            <td className="max-w-[260px] px-3 py-2.5">
                              <p className="truncate font-medium">{l.merchant || l.description}</p>
                              <p className="truncate text-xs text-muted-foreground">{l.description}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <DuplicateChip line={l} />
                                {l.expense_deleted_at && l.status === "pending" && (
                                  <span className="text-[11px] text-amber-700 dark:text-amber-300">Its expense was deleted, so it is back in review.</span>
                                )}
                                {l.status === "skipped" && <span className="text-[11px] text-muted-foreground">{SKIP_LABEL[l.skip_reason ?? "user"] ?? "Skipped"}</span>}
                                {l.status === "confirmed" && <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Confirmed</span>}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-sm">
                              {fmtCurrency(Number(l.amount))}
                              {l.direction === "in" && <span className="ml-1 rounded bg-muted px-1 text-[10px] font-sans">in</span>}
                            </td>
                            <td className="min-w-[190px] px-3 py-2.5">
                              {l.status === "pending" && l.direction === "out" && !l.match_receipt_id && !l.recurring_expense_id ? (
                                <Select value={cat ?? undefined} onValueChange={(v) => setCategory([l.id], v)}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose a category" /></SelectTrigger>
                                  <SelectContent>
                                    {RECEIPT_CATEGORY_GROUPS.map((g) => (
                                      <SelectGroup key={g.group}>
                                        <SelectLabel className="text-xs">{g.group}</SelectLabel>
                                        {g.items.map((i) => <SelectItem key={i.key} value={i.key} className="text-xs">{i.label}</SelectItem>)}
                                      </SelectGroup>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-muted-foreground">{cat ? receiptCategoryFullLabel(cat) : ""}</span>
                              )}
                              {l.likelihood_reason && l.status === "pending" && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{l.likelihood_reason}</p>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                              {l.direction !== "out"
                                ? ""
                                : !l.duplicate_dismissed && (l.match_receipt_id || l.recurring_expense_id)
                                  ? <span className="text-muted-foreground">Already counted</span>
                                  : businessLikelihoodLabel(l.business_likelihood)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right">
                              <div className="flex flex-col items-end gap-1">
                                {l.status === "pending" && l.direction === "out" && confirmationOutcome(l).action !== "refuse" && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-700 dark:text-emerald-400" disabled={busy} onClick={() => openConfirm([l.id])}>Confirm</Button>
                                )}
                                {l.status === "pending" && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => run({ action: "skip", lineIds: [l.id] }, "Skipped.", false)}>Skip</Button>
                                )}
                                {l.status === "confirmed" && l.hold_reason === "later_receipt" && l.related_receipt_id && (
                                  <>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => run({ action: "match", lineId: l.id, receiptId: l.related_receipt_id }, "Matched: the charge counts once, as the receipt.", true)}>Same charge</Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => run({ action: "keep_both", lineIds: [l.id] }, "Kept both.", false)}>Keep both</Button>
                                  </>
                                )}
                                {l.status !== "pending" && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => run({ action: "reopen", lineIds: [l.id] }, "Back to review.", l.status === "confirmed")}>
                                    {l.status === "skipped" ? "Include" : "Back to review"}
                                  </Button>
                                )}
                                {l.status === "pending" && !l.duplicate_dismissed && (l.match_receipt_id || l.recurring_expense_id || l.hold_reason || l.duplicate_candidate_count > 1) && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => run({ action: "not_duplicate", lineIds: [l.id] }, "Marked as a different charge.", false)}>Different charge</Button>
                                )}
                                {held && held.receiptIds.length > 0 && l.direction === "out" && (
                                  <select
                                    className="max-w-[180px] rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                                    defaultValue=""
                                    disabled={busy}
                                    onChange={(e) => e.target.value && run({ action: "match", lineId: l.id, receiptId: e.target.value }, "Matched to the receipt.", true)}
                                  >
                                    <option value="">Match a receipt...</option>
                                    {held.receiptIds.map((id) => <option key={id} value={id}>{receiptText(receiptById.get(id))}</option>)}
                                  </select>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Reconciliation */}
          {recon && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="space-y-2 p-4">
                  <h4 className="text-sm font-semibold">Card charges with no receipt on file ({recon.chargesWithoutReceipt.length})</h4>
                  <p className="text-[11px] text-muted-foreground">Confirmed charges whose expense has no receipt image or file. Charges counted by your Recurring Expenses list ({recon.recurringCharges}) aren&apos;t listed.</p>
                  {recon.chargesWithoutReceipt.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None.</p>
                  ) : (
                    <ul className="divide-y divide-border text-xs">
                      {recon.chargesWithoutReceipt.slice(0, 50).map((c) => {
                        const options = recon.receiptsWithoutLine
                          .map((r) => ({ r, score: Math.abs(Number(r.total_amount ?? 0) - Number(c.line.amount)) * 10 + Math.abs(daysBetweenISO(c.line.line_date, r.expense_date ?? c.line.line_date)) }))
                          .sort((a, b) => a.score - b.score)
                          .slice(0, 5);
                        return (
                          <li key={c.line.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                            <span>{fmtDay(c.line.line_date)} · {c.line.merchant || c.line.description} · {fmtCurrency(Number(c.line.amount))}</span>
                            {options.length > 0 && (
                              <select
                                className="max-w-[200px] rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                                defaultValue=""
                                disabled={busy}
                                onChange={(e) => e.target.value && run({ action: "match", lineId: c.line.id, receiptId: e.target.value }, "Matched to the receipt.", true)}
                              >
                                <option value="">Match a receipt...</option>
                                {options.map(({ r }) => <option key={r.id} value={r.id}>{receiptText(r as ReceiptRow)}</option>)}
                              </select>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <h4 className="text-sm font-semibold">Receipts with no statement line ({recon.receiptsWithoutLine.length})</h4>
                  <p className="text-[11px] text-muted-foreground">Expenses dated inside an imported statement&apos;s period that no line matches: paid another way (cash, another card), or on a statement not imported yet.</p>
                  {recon.receiptsWithoutLine.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None.</p>
                  ) : (
                    <ul className="divide-y divide-border text-xs">
                      {recon.receiptsWithoutLine.slice(0, 50).map((r) => (
                        <li key={r.id} className="py-1.5">{fmtDay(r.expense_date)} · {r.vendor ?? "Receipt"} · {fmtCurrency(Number(r.total_amount ?? 0))}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">{STATEMENT_RECORDS_NOTE}</p>
        </>
      )}

      {/* Confirm */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm statement lines</DialogTitle>
            <DialogDescription>
              {statementConfirmSummary({ create: confirmPreview.create, link: confirmPreview.link, recurring: confirmPreview.recurring, held: confirmPreview.held })}
            </DialogDescription>
          </DialogHeader>
          {Object.keys(confirmPlan.left).length > 0 && (
            <div className="rounded-md border border-border p-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Left out of this confirm (each can be confirmed on its own):</p>
              <ul className="mt-1 list-disc pl-4">
                {(Object.entries(confirmPlan.left) as [BulkExclusion, number][]).map(([why, n]) => (
                  <li key={why}>{n} line{n === 1 ? "" : "s"}: {EXCLUSION_LABEL[why]}</li>
                ))}
              </ul>
            </div>
          )}
          {confirmPlan.single && (() => {
            const l = (review?.lines ?? []).find((x) => x.id === confirmIds[0]);
            const st = l ? statementById.get(l.statement_id) : undefined;
            const notes = [
              l?.expense_deleted_at ? "Its expense was deleted earlier; confirming adds it again." : null,
              st && (st.verification === "mismatch" || st.verification === "unverified") ? VERIFICATION_NOTE[st.verification] : null,
              l && l.category_source !== "agent" && (l.business_likelihood == null || Number(l.business_likelihood) < 0.5) ? `Estimated at ${businessLikelihoodLabel(l.business_likelihood)}.` : null,
            ].filter(Boolean);
            return notes.length > 0 ? <p className="text-xs text-amber-800 dark:text-amber-300">{notes.join(" ")}</p> : null;
          })()}
          {confirmPreview.other > 0 && (
            <p className="text-xs text-muted-foreground">{confirmPreview.other} selected line{confirmPreview.other === 1 ? " is" : "s are"} money in, already decided, or without a category, and {confirmPreview.other === 1 ? "is" : "are"} left as {confirmPreview.other === 1 ? "it is" : "they are"}.</p>
          )}
          <p className="text-xs text-muted-foreground">{STATEMENT_GST_HST_NOTE}</p>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{CANONICAL_TAX_DISCLAIMER}</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={doConfirm} disabled={busy || confirmPreview.create + confirmPreview.link + confirmPreview.recurring === 0} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {busy ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <Dialog open={removeId !== null} onOpenChange={(o) => !o && setRemoveId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this import?</DialogTitle>
            <DialogDescription>
              The statement and its lines waiting for review are removed. Expenses already confirmed from it stay in your records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveId(null)} disabled={busy}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                const id = removeId;
                setRemoveId(null);
                if (id) {
                  if (statementFilter === id) setStatementFilter("all");
                  await run({ action: "remove", statementId: id }, "Import removed.", false);
                }
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
