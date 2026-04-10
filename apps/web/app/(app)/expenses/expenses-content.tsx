"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { validateExpenseAmount, validateMonthlyRecurring, validateVehicleBusinessPct, parseDollar, FIELD_LIMITS } from "@agent-runway/core/validation/input-guards";
import { ExplainButton } from "@/components/explain-button";
import { GuideLink } from "@/components/guide-link";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Plus, Check, X, Trash2, Info, ExternalLink, ChevronsUpDown, Camera, Receipt, ArrowRight, Download, FileText, RefreshCw, AlertTriangle, Clock, Lightbulb } from "lucide-react";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import {
  computeGCI,
  type ExpenseCategoryWithItems,
  type UserSettings,
  type Transaction,
} from "@/lib/types/database";

interface PriorYearRow {
  year: number;
  annual_gci: number;
  annual_expenses: number;
  annual_mileage_km: number;
  annual_mileage_deduct: number;
}
import { survivalResult } from "@/lib/engines/survival-engine";
import { EXPENSE_KEY_TO_T2125 } from "@/lib/engines/t2125-engine";
import { ExpenseDonut, type DonutDataPoint } from "@/components/expense-donut";
import { cn } from "@/lib/utils";
import { ReceiptCaptureDialog }     from "@/components/receipt-capture-dialog";
import { ReceiptViewEditDialog }    from "@/components/receipt-view-edit-dialog";
import { pdf }                      from "@react-pdf/renderer";
import { ExpenseExportPdf }         from "@/components/pdf/expense-export-pdf";
import {
  RECEIPT_CATEGORIES,
  RECEIPT_CATEGORY_GROUPS,
  type ReceiptExpense,
} from "@/lib/types/receipt";
import { guardSandboxWrite } from "@/lib/sandbox-guard";
import { useSandboxMode } from "@/lib/sandbox-mode-context";
import { useVoiceDraft } from "@/lib/voice/voice-draft-context";
import type { VoiceDraft } from "@/lib/voice/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PlaidItem, PlaidTransaction, MileageLog, RecurringExpense } from "@/lib/types/database";
import { ExpensesMileageTab }     from "./expenses-mileage-tab";
import { ExpensesBankImportsTab } from "./expenses-bank-imports-tab";
import { TaxDisclaimer } from "@/components/tax-disclaimer";
import {
  getFilingPeriods,
  getCurrentFilingPeriod,
  deadlineUrgency,
} from "@agent-runway/core/engines/filing-period-engine";
import { computeGST34 } from "@agent-runway/core/engines/gst34-engine";
import { gstHstLabel } from "@agent-runway/core/engines/canadian-tax-engine";
import { reconcileDeals, type ReconciliationResult, type ReconciliationMatch, type ImportedDeal } from "@agent-runway/core/engines/reconciliation-engine";
import { selectTaxTips, TIP_CATEGORY_LABELS, type TaxTip } from "@agent-runway/core/engines/tax-iq-engine";
import type { FilingFrequency, FilingPeriod } from "@/lib/types/database";

interface ExpenseItemForPlaid {
  id: string; key: string; title: string; category_id: string;
}
interface ExpenseCategoryForPlaid {
  id: string; key: string; title: string; sort_order: number;
}

interface Props {
  initialCategories: ExpenseCategoryWithItems[];
  settings: UserSettings | null;
  transactions: Transaction[];
  initialReceipts?: ReceiptExpense[];
  /** Current-year receipt totals keyed by expense_items.key — computed server-side */
  receiptTotalsByKey: Record<string, number>;
  /** Prior year history for YoY comparison (up to 4 years) */
  priorYearHistory?: PriorYearRow[];
  currentYear?: number;
  /** Mileage tab data */
  mileageLogs?: MileageLog[];
  /** Bank Imports tab data */
  plaidItems?: PlaidItem[];
  plaidTransactions?: PlaidTransaction[];
  plaidExpenseItems?: ExpenseItemForPlaid[];
  plaidExpenseCategories?: ExpenseCategoryForPlaid[];
  plaidConfigured?: boolean;
}

// Per-category colour accent (left border + header icon tint)
const CAT_COLORS: Record<string, { border: string; badge: string }> = {
  vehicle:       { border: "border-l-blue-500",    badge: "bg-blue-50 text-blue-700"    },
  marketing:     { border: "border-l-violet-500",  badge: "bg-violet-50 text-violet-700" },
  office_tech:   { border: "border-l-teal-500",    badge: "bg-teal-50 text-teal-700"    },
  professional:  { border: "border-l-amber-500",   badge: "bg-amber-50 text-amber-700"  },
  education:     { border: "border-l-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  meals:         { border: "border-l-orange-400",  badge: "bg-orange-50 text-orange-700" },
  entertainment: { border: "border-l-indigo-500",  badge: "bg-indigo-50 text-indigo-700" },
  other:         { border: "border-l-slate-400",   badge: "bg-slate-100 text-slate-600"  },
};

const DEFAULT_CAT = { border: "border-l-slate-400", badge: "bg-slate-100 text-slate-600" };

// Map category key → label for the receipt log
const CAT_LABEL: Record<string, string> = Object.fromEntries(
  RECEIPT_CATEGORIES.map((c) => [c.key, c.label]),
);

export function ExpensesContent({
  initialCategories, settings, transactions, initialReceipts = [],
  receiptTotalsByKey, priorYearHistory = [], currentYear,
  mileageLogs = [], plaidItems = [], plaidTransactions = [],
  plaidExpenseItems = [], plaidExpenseCategories = [], plaidConfigured = false,
}: Props) {
  const sandbox = useSandboxMode();
  const thisYear = currentYear ?? new Date().getFullYear();
  const isPro = settings?.subscription_tier === "professional" || settings?.subscription_tier === "team";
  const [categories, setCategories] = useState(initialCategories);

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"receipts" | "mileage" | "imports">("receipts");
  const pendingImportsCount = plaidTransactions.filter(
    (t) => t.amount > 0 && t.review_status === "pending",
  ).length;

  // ── Receipt YTD totals (keyed by expense_items.key, refreshed after each save) ──
  const [receiptTotals, setReceiptTotals] = useState<Record<string, number>>(receiptTotalsByKey);

  // ── Vehicle business use % (editable, persisted to user_settings) ────────
  const [vehiclePct, setVehiclePct] = useState<number>(
    settings?.vehicle_business_use_pct != null ? settings.vehicle_business_use_pct : 0.80,
  );

  // ── Receipt capture ────────────────────────────────────────────────────────
  const [captureOpen, setCaptureOpen] = useState(false);
  const [receipts,    setReceipts]    = useState<ReceiptExpense[]>(initialReceipts);

  // ── Filing period filter ──────────────────────────────────────────────────
  const filingFreq = (settings?.filing_frequency as FilingFrequency) ?? "quarterly";
  const allPeriods = useMemo(() => getFilingPeriods(filingFreq, thisYear), [filingFreq, thisYear]);
  const currentPeriod = useMemo(() => getCurrentFilingPeriod(filingFreq, thisYear), [filingFreq, thisYear]);
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState<string>("all");

  const activePeriod: FilingPeriod | null =
    selectedPeriodIdx !== "all" ? allPeriods[parseInt(selectedPeriodIdx)] ?? null : null;

  const filteredReceipts = useMemo(() => {
    if (!activePeriod) return receipts;
    return receipts.filter((r) => {
      const d = r.expense_date;
      if (!d) return false;
      return d >= activePeriod.startDate && d <= activePeriod.endDate;
    });
  }, [receipts, activePeriod]);

  // ── GST34 pre-fill computation ─────────────────────────────────────────
  const gst34Result = useMemo(() => {
    if (!activePeriod || !settings) return null;
    // Filter transactions to the selected period
    const periodTx = transactions.filter((tx) => {
      const d = tx.date;
      return d >= activePeriod.startDate && d <= activePeriod.endDate;
    });
    return computeGST34({
      province: settings.province,
      period: activePeriod,
      frequency: filingFreq,
      periodTransactions: periodTx.map((tx) => ({ gci: computeGCI(tx) })),
      periodReceipts: filteredReceipts.map((r) => ({
        total_amount: r.total_amount,
        tax_amount: r.tax_amount,
        category_key: r.category_key,
      })),
      instalmentsPaid: 0, // User can enter this in Reports tab
    });
  }, [activePeriod, settings, transactions, filteredReceipts, filingFreq]);

  // ── Current period deadline alert ──────────────────────────────────────
  const currentDeadline = useMemo(() => {
    return deadlineUrgency(currentPeriod.deadline);
  }, [currentPeriod]);

  // ── Receipt view / edit ────────────────────────────────────────────────────
  const [viewReceipt,  setViewReceipt]  = useState<ReceiptExpense | null>(null);
  const [viewOpen,     setViewOpen]     = useState(false);

  // ── Recurring expenses ──────────────────────────────────────────────────
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [reName, setReName] = useState("");
  const [reAmount, setReAmount] = useState("");
  const [reCategory, setReCategory] = useState("");
  const [reDay, setReDay] = useState("1");
  const [reHstIncluded, setReHstIncluded] = useState(false);
  const [reHstAmount, setReHstAmount] = useState("");
  const [reVehicle, setReVehicle] = useState(false);
  const [reNotes, setReNotes] = useState("");
  const [reSaving, setReSaving] = useState(false);

  // ── Brokerage statement reconciliation ─────────────────────────────────
  const [reconOpen, setReconOpen] = useState(false);
  const [reconUploading, setReconUploading] = useState(false);
  const [reconResult, setReconResult] = useState<ReconciliationResult | null>(null);
  const [reconAdding, setReconAdding] = useState(false);
  const reconFileRef = useRef<HTMLInputElement>(null);

  async function handleStatementUpload(file: File) {
    setReconUploading(true);
    setReconResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "reconcile");

      const res = await fetch("/api/import-history", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      const data = await res.json();
      const deals: ImportedDeal[] = (data.deals || []).map((d: Record<string, unknown>, i: number) => ({
        _importId: `imp-${i}-${Date.now()}`,
        date: d.date as string,
        address: d.address as string,
        gci: d.gci as number,
        sale_price: (d.sale_price as number) ?? null,
        side: d.side as "buyer" | "seller" | "both" | undefined,
        client_name: (d.party_a as string) || (d.party_b as string) || "",
        commission_pct: (d.commission_percent as number) ?? null,
        net_income: (d.net_income as number) ?? null,
        confidence: d.confidence as Record<string, string> | undefined,
        issues: d.issues as string[] | undefined,
      }));
      if (deals.length === 0) {
        toast.error("No transactions found in the uploaded file.");
        setReconUploading(false);
        return;
      }
      const result = reconcileDeals(deals, transactions);
      setReconResult(result);
      toast.success(`Found ${deals.length} transaction${deals.length !== 1 ? "s" : ""} in statement.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast.error(msg);
    } finally {
      setReconUploading(false);
    }
  }

  function setReconDecision(importId: string, decision: "skip" | "add") {
    if (!reconResult) return;
    setReconResult({
      ...reconResult,
      matches: reconResult.matches.map((m) =>
        m.imported._importId === importId ? { ...m, decision } : m,
      ),
    });
  }

  async function commitReconDeals() {
    if (!reconResult || !settings) return;
    const toAdd = reconResult.matches.filter((m) => m.decision === "add");
    if (toAdd.length === 0) {
      toast.info("No deals selected to add.");
      return;
    }
    setReconAdding(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const inserts = toAdd.map((m) => ({
        user_id: user.id,
        date: m.imported.date,
        address: m.imported.address,
        sale_price: m.imported.sale_price ?? 0,
        commission_pct: m.imported.commission_pct ?? 0,
        gci_override: m.imported.gci,
        side: m.imported.side ?? "buyer",
        status: "closed" as const,
        client_name: m.imported.client_name ?? "",
        notes: "Imported from brokerage statement",
        source: "imported" as const,
      }));
      const { error } = await supabase.from("transactions").insert(inserts);
      if (error) throw error;
      toast.success(`Added ${toAdd.length} deal${toAdd.length !== 1 ? "s" : ""} from brokerage statement.`);
      setReconResult(null);
      setReconOpen(false);
      // Trigger page reload to reflect new transactions
      window.location.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to add deals";
      toast.error(msg);
    } finally {
      setReconAdding(false);
    }
  }

  // ── Tax IQ tips ────────────────────────────────────────────────────────
  const [dismissedTipIds, setDismissedTipIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("ar_dismissed_tax_tips") || "[]");
    } catch { return []; }
  });

  const taxIQTips = useMemo(() => {
    if (!settings) return [];
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    const activeCategories = receipts
      .map((r) => r.category_key)
      .filter((k): k is string => !!k);
    return selectTaxTips({
      province: settings.province,
      filingFrequency: (settings.filing_frequency as "monthly" | "quarterly" | "annual") ?? "quarterly",
      currentQuarter: q,
      transactionCount: transactions.length,
      activeExpenseCategories: [...new Set(activeCategories)],
      dismissedTipIds,
    }, 4);
  }, [settings, receipts, transactions.length, dismissedTipIds]);

  function dismissTip(tipId: string) {
    const updated = [...dismissedTipIds, tipId];
    setDismissedTipIds(updated);
    localStorage.setItem("ar_dismissed_tax_tips", JSON.stringify(updated));
  }

  // Fetch recurring expenses on mount
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("recurring_expenses")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (data) setRecurringExpenses(data as RecurringExpense[]);
    })();
  }, []);

  function openRecurringDialog(existing?: RecurringExpense) {
    if (existing) {
      setEditingRecurring(existing);
      setReName(existing.name);
      setReAmount(String(existing.amount));
      setReCategory(existing.category_key);
      setReDay(String(existing.day_of_month));
      setReHstIncluded(existing.hst_included);
      setReHstAmount(String(existing.hst_amount ?? 0));
      setReVehicle(existing.vehicle_pct_applicable);
      setReNotes(existing.notes ?? "");
    } else {
      setEditingRecurring(null);
      setReName("");
      setReAmount("");
      setReCategory("");
      setReDay("1");
      setReHstIncluded(false);
      setReHstAmount("");
      setReVehicle(false);
      setReNotes("");
    }
    setRecurringDialogOpen(true);
  }

  async function saveRecurringExpense() {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    if (!reName.trim() || !reAmount.trim() || !reCategory) {
      toast.error("Name, amount, and category are required.");
      return;
    }
    setReSaving(true);
    const supabase = createClient();
    const payload = {
      name: reName.trim(),
      amount: parseFloat(reAmount) || 0,
      category_key: reCategory,
      day_of_month: Math.min(28, Math.max(1, parseInt(reDay) || 1)),
      hst_included: reHstIncluded,
      hst_amount: reHstIncluded ? (parseFloat(reHstAmount) || 0) : 0,
      vehicle_pct_applicable: reVehicle,
      notes: reNotes.trim(),
    };

    if (editingRecurring) {
      const { error } = await supabase
        .from("recurring_expenses")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingRecurring.id);
      if (error) { toast.error("Failed to update recurring expense."); setReSaving(false); return; }
      setRecurringExpenses((prev) =>
        prev.map((r) => r.id === editingRecurring.id ? { ...r, ...payload } : r),
      );
      toast.success("Recurring expense updated.");
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setReSaving(false); return; }
      const { data, error } = await supabase
        .from("recurring_expenses")
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (error) { toast.error("Failed to add recurring expense."); setReSaving(false); return; }
      setRecurringExpenses((prev) => [...prev, data as RecurringExpense]);
      toast.success("Recurring expense added.");
    }
    setReSaving(false);
    setRecurringDialogOpen(false);
  }

  async function deleteRecurringExpense(id: string) {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("recurring_expenses")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Failed to remove recurring expense."); return; }
    setRecurringExpenses((prev) => prev.filter((r) => r.id !== id));
    toast.success("Recurring expense removed.");
  }

  // ── Voice-to-expense ─────────────────────────────────────────────────────
  const [quickExpenseOpen,  setQuickExpenseOpen]  = useState(false);
  const [voiceDraft,        setVoiceDraftLocal]   = useState<VoiceDraft | null>(null);
  const [voiceBanner,       setVoiceBanner]       = useState(false);
  const [qeCategory,  setQeCategory]  = useState("");
  const [qeAmount,    setQeAmount]    = useState("");
  const [qeVendor,    setQeVendor]    = useState("");
  const [qeDesc,      setQeDesc]     = useState("");
  const [qeDate,      setQeDate]     = useState(new Date().toISOString().split("T")[0]);
  const [qeSaving,    setQeSaving]   = useState(false);
  const { consume } = useVoiceDraft();

  useEffect(() => {
    const draft = consume();
    if (!draft || draft.intent !== "new_expense") return;
    const exp = draft.expense;
    if (exp.category_key) setQeCategory(exp.category_key);
    if (exp.amount != null) setQeAmount(String(exp.amount));
    if (exp.vendor) setQeVendor(exp.vendor);
    if (exp.description) setQeDesc(exp.description);
    if (exp.date) setQeDate(exp.date);
    setVoiceDraftLocal(draft);
    setVoiceBanner(true);
    setQuickExpenseOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const voiceFilledFields = useMemo(() => {
    if (!voiceBanner || !voiceDraft || voiceDraft.intent !== "new_expense") return new Set<string>();
    const s = new Set<string>();
    const exp = voiceDraft.expense;
    if (exp.category_key) s.add("category");
    if (exp.amount != null) s.add("amount");
    if (exp.vendor)       s.add("vendor");
    if (exp.description)  s.add("description");
    if (exp.date)         s.add("date");
    return s;
  }, [voiceBanner, voiceDraft]);

  const voiceTint = (field: string) =>
    voiceFilledFields.has(field) ? "bg-amber-50/60 border-amber-200/80" : "";

  async function handleQuickExpenseSave() {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    setQeSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setQeSaving(false); return; }

    // ── Validate expense amount before writing ─────────────────────────────
    const amount = parseDollar(qeAmount);
    const amountCheck = validateExpenseAmount(amount);
    if (!amountCheck.valid) {
      amountCheck.errors.forEach((msg) => toast.error(msg));
      setQeSaving(false);
      return;
    }

    const { error } = await supabase.from("receipt_expenses").insert({
      user_id: user.id,
      category_key: qeCategory || null,
      total_amount: amount!,
      vendor: (qeVendor || "").slice(0, FIELD_LIMITS.vendor) || null,
      notes: (qeDesc || "").slice(0, FIELD_LIMITS.notes) || null,
      expense_date: qeDate || new Date().toISOString().split("T")[0],
      currency: "CAD",
    });

    if (!error) {
      toast.success("Expense logged", { description: qeVendor ? `${qeVendor} — $${qeAmount}` : `$${qeAmount}` });
      setQuickExpenseOpen(false);
      setVoiceBanner(false);
      // Reset form
      setQeCategory("");
      setQeAmount("");
      setQeVendor("");
      setQeDesc("");
      setQeDate(new Date().toISOString().split("T")[0]);
      // Refresh receipt totals
      await handleReceiptSaved();
    } else {
      toast.error("Couldn't save — try again");
    }
    setQeSaving(false);
  }

  // Debounce receipt refresh to prevent concurrent fetches from rapid saves
  const receiptRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleReceiptSaved = async () => {
    // Cancel any pending refresh from a previous rapid save
    if (receiptRefreshTimer.current) clearTimeout(receiptRefreshTimer.current);

    // Small delay so back-to-back saves only trigger one refresh
    await new Promise<void>((resolve) => {
      receiptRefreshTimer.current = setTimeout(resolve, 300);
    });

    const supabase = createClient();
    const year = new Date().getFullYear();

    // Refresh receipt display log
    const { data: logData } = await supabase
      .from("receipt_expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (logData) setReceipts(logData as ReceiptExpense[]);

    // Refresh YTD totals — re-aggregate from all current-year receipts
    const { data: totalsData } = await supabase
      .from("receipt_expenses")
      .select("category_key, total_amount")
      .gte("expense_date", `${year}-01-01`);
    if (totalsData) {
      const newTotals: Record<string, number> = {};
      for (const r of totalsData) {
        if (r.category_key && r.total_amount != null) {
          newTotals[r.category_key] = (newTotals[r.category_key] ?? 0) + Number(r.total_amount);
        }
      }
      setReceiptTotals(newTotals);
    }
  };

  // Auto-expand all categories on first visit (no receipts yet and no monthly recurring)
  const isFirstVisit =
    Object.keys(receiptTotalsByKey).length === 0 &&
    initialCategories.every(
      (cat) => cat.items.every((i) => Number(i.monthly_recurring) === 0),
    );
  const [expanded, setExpanded] = useState<Set<string>>(
    isFirstVisit
      ? new Set(initialCategories.map((c) => c.id))
      : new Set(),
  );

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");

  // ── Totals ────────────────────────────────────────────────────────────
  // ytdTotal is now computed from receipt_expenses (not the manual ytd_amount field)
  const ytdTotal = Object.values(receiptTotals).reduce((sum, v) => sum + v, 0);
  const monthlyTotal = categories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, item) => s + Number(item.monthly_recurring), 0),
    0,
  );

  // ── Months elapsed for recurring YTD estimates ──────────────────────
  const now = new Date();
  const monthsElapsed = now.getMonth() + (now.getDate() / 30); // fractional months in current year

  // ── Effective YTD per item: receipts if available, else recurring estimate ──
  // Avoids double-counting: receipts represent actuals, recurring fills gaps
  const effectiveYTD = (item: { key: string; monthly_recurring: number | string }) => {
    const receipt = receiptTotals[item.key] ?? 0;
    const recurringEst = Number(item.monthly_recurring) * monthsElapsed;
    return Math.max(receipt, recurringEst);
  };

  const effectiveTotal = categories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, item) => s + effectiveYTD(item), 0),
    0,
  );

  // ── YTD GCI for expense ratio ─────────────────────────────────────────
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const expenseRatio = ytdGCI > 0 ? effectiveTotal / ytdGCI : 0;
  const ratioStatus =
    expenseRatio > 0.5 ? "critical" : expenseRatio > 0.35 ? "warning" : "healthy";

  // ── Tax deductibility breakdown ───────────────────────────────────────
  const deductBreakdown = categories.reduce(
    (acc, cat) => {
      for (const item of cat.items) {
        const ytd = effectiveYTD(item);
        if (ytd === 0) continue;
        const map = EXPENSE_KEY_TO_T2125[item.key];
        if (!map) {
          acc.full += ytd; // custom items default to 100%
        } else if (map.applyVehicleUse) {
          acc.vehicle += ytd * vehiclePct;
        } else if (map.deductiblePct < 1.0) {
          acc.meals += ytd * map.deductiblePct;
        } else {
          acc.full += ytd;
        }
      }
      return acc;
    },
    { full: 0, meals: 0, vehicle: 0 },
  );
  const totalDeductible = deductBreakdown.full + deductBreakdown.meals + deductBreakdown.vehicle;

  // ── Survival ──────────────────────────────────────────────────────────
  const survival = survivalResult(
    settings?.monthly_brokerage_fee ?? 0,
    monthlyTotal,
    settings?.cash_reserve ?? 0,
  );

  // ── Donut chart data — per-category effective YTD (receipts + recurring estimates) ──
  const donutData: DonutDataPoint[] = categories
    .map((cat) => ({
      name: cat.title,
      value: cat.items.reduce((s, i) => s + effectiveYTD(i), 0),
    }))
    .filter((d) => d.value > 0);

  // ── Helpers ───────────────────────────────────────────────────────────
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function updateItem(
    itemId: string,
    field: "monthly_recurring",
    value: string,
  ) {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const numValue = parseDollar(value) ?? 0;
    const recurringCheck = validateMonthlyRecurring(numValue);
    if (!recurringCheck.valid) {
      recurringCheck.errors.forEach((msg) => toast.error(msg));
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("expense_items").update({ [field]: numValue }).eq("id", itemId);
    if (error) {
      toast.error("Couldn't save — please try again.");
      return;
    }
    setCategories((prev) =>
      prev.map((cat) => ({
        ...cat,
        items: cat.items.map((item) =>
          item.id === itemId ? { ...item, [field]: numValue } : item,
        ),
      })),
    );
  }

  async function addItem(categoryId: string) {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const title = newItemTitle.trim();
    if (!title) return;

    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const cat = categories.find((c) => c.id === categoryId);
    const sortOrder = cat?.items.length ?? 0;
    const key = `custom_${categoryId.slice(0, 8)}_${Date.now()}`;

    const { data: newItem, error } = await supabase
      .from("expense_items")
      .insert({
        user_id: authData.user.id,
        category_id: categoryId,
        key,
        title,
        ytd_amount: 0,
        monthly_recurring: 0,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (newItem && !error) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId ? { ...c, items: [...c.items, newItem] } : c,
        ),
      );
      toast.success("Expense item added ✓");
    } else if (error) {
      toast.error("Couldn't add item — please try again.");
    }
    setAddingTo(null);
    setNewItemTitle("");
  }

  async function deleteItem(categoryId: string, itemId: string) {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("expense_items").delete().eq("id", itemId).eq("user_id", user.id);
    if (error) {
      toast.error("Couldn't remove item — please try again.");
      return;
    }
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? { ...cat, items: cat.items.filter((i) => i.id !== itemId) }
          : cat,
      ),
    );
    toast("Expense item removed");
  }

  async function saveVehiclePct(raw: string) {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const pct = Math.min(1, Math.max(0, parseFloat(raw) / 100));
    if (isNaN(pct)) return;
    const pctCheck = validateVehicleBusinessPct(pct);
    if (!pctCheck.valid) {
      pctCheck.errors.forEach((msg) => toast.error(msg));
      return;
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("user_settings")
      .update({ vehicle_business_use_pct: pct })
      .eq("user_id", user.id);
    if (error) {
      toast.error("Couldn't save vehicle % — please try again.");
      return;
    }
    setVehiclePct(pct);
    toast.success("Vehicle business use % saved ✓");
  }

  function openReceipt(r: ReceiptExpense) {
    setViewReceipt(r);
    setViewOpen(true);
  }

  function handleReceiptUpdated(updated: ReceiptExpense) {
    setReceipts((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    // Refresh YTD totals by re-querying
    const supabase = createClient();
    const year = new Date().getFullYear();
    supabase
      .from("receipt_expenses")
      .select("category_key, total_amount")
      .gte("expense_date", `${year}-01-01`)
      .then(({ data }) => {
        if (!data) return;
        const newTotals: Record<string, number> = {};
        for (const row of data) {
          if (row.category_key && row.total_amount != null)
            newTotals[row.category_key] = (newTotals[row.category_key] ?? 0) + Number(row.total_amount);
        }
        setReceiptTotals(newTotals);
      });
  }

  function handleReceiptDeleted(id: string) {
    setReceipts((prev) => prev.filter((r) => r.id !== id));
    // Refresh YTD totals
    const supabase = createClient();
    const year = new Date().getFullYear();
    supabase
      .from("receipt_expenses")
      .select("category_key, total_amount")
      .gte("expense_date", `${year}-01-01`)
      .then(({ data }) => {
        if (!data) return;
        const newTotals: Record<string, number> = {};
        for (const row of data) {
          if (row.category_key && row.total_amount != null)
            newTotals[row.category_key] = (newTotals[row.category_key] ?? 0) + Number(row.total_amount);
        }
        setReceiptTotals(newTotals);
      });
  }

  // ── Year-over-year prior year editable rows ───────────────────────────────
  const [priorRows, setPriorRows] = useState<PriorYearRow[]>(priorYearHistory);
  const [savingYoy, setSavingYoy] = useState<number | null>(null); // year being saved

  async function saveYoyExpenses(yr: number, field: "annual_expenses" | "annual_mileage_km" | "annual_mileage_deduct", rawValue: string) {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const val = parseDollar(rawValue) ?? 0;
    const yoyCheck = validateExpenseAmount(val);
    if (!yoyCheck.valid) {
      yoyCheck.errors.forEach((msg) => toast.error(msg));
      return;
    }
    setPriorRows((prev) => prev.map((r) => r.year === yr ? { ...r, [field]: val } : r));
    setSavingYoy(yr);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingYoy(null); return; }
    // Upsert: create history_item for this year if it doesn't exist
    const existing = priorRows.find((r) => r.year === yr);
    let saveError = null;
    if (existing) {
      const { error } = await supabase.from("history_items").update({ [field]: val }).eq("user_id", user.id).eq("year", yr);
      saveError = error;
    } else {
      const { error } = await supabase.from("history_items").upsert({
        user_id: user.id, year: yr, annual_gci: 0, annual_tx: 0,
        quarter_gci: [0,0,0,0], quarter_tx: [0,0,0,0], [field]: val,
      }, { onConflict: "user_id,year" });
      saveError = error;
    }
    if (saveError) {
      toast.error("Couldn't save — please try again.");
    }
    setSavingYoy(null);
  }

  // ── Export helpers ────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const year = new Date().getFullYear();

  function downloadCsv() {
    setExporting("csv");
    const rows = [
      ["Vendor", "Date", "Category", "Total (CAD)", "Tax / HST (CAD)", "Notes"],
      ...receipts
        .slice()
        .sort((a, b) => (b.expense_date ?? "").localeCompare(a.expense_date ?? ""))
        .map((r) => [
          r.vendor ?? "",
          r.expense_date ?? "",
          r.category_key
            ? (Object.fromEntries(
                (RECEIPT_CATEGORIES as { key: string; label: string }[]).map((c) => [c.key, c.label])
              )[r.category_key] ?? r.category_key)
            : "Uncategorized",
          r.total_amount != null ? r.total_amount.toFixed(2) : "",
          r.tax_amount   != null ? r.tax_amount.toFixed(2)   : "",
          r.notes ?? "",
        ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `agent-runway-expenses-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(null);
    toast.success("CSV downloaded ✓");
  }

  async function downloadPdf() {
    setExporting("pdf");
    try {
      const doc = (
        <ExpenseExportPdf
          year={year}
          settings={settings}
          categories={categories}
          receiptTotals={receiptTotals}
          vehiclePct={vehiclePct}
          receipts={receipts}
          totalDeductible={totalDeductible}
          deductFull={deductBreakdown.full}
          deductMeals={deductBreakdown.meals}
          deductVehicle={deductBreakdown.vehicle}
        />
      );
      const blob = await pdf(doc).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `agent-runway-expenses-${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded ✓");
    } catch (err) {
      console.error("[ExpensePDF] generation failed:", err);
      toast.error("PDF generation failed — please try again.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Capture Receipt */}
          <Button
            size="sm"
            onClick={() => setCaptureOpen(true)}
            className="gap-1.5"
          >
            <Camera className="h-3.5 w-3.5" />
            Capture Receipt
          </Button>

          {/* Export CSV */}
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            disabled={exporting !== null || receipts.length === 0}
            className="gap-1.5"
            title={receipts.length === 0 ? "No receipts to export" : "Download CSV for spreadsheet / accountant"}
          >
            {exporting === "csv"
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </Button>

          {/* Export PDF */}
          <Button
            variant="outline"
            size="sm"
            onClick={downloadPdf}
            disabled={exporting !== null || receipts.length === 0}
            className="gap-1.5"
            title={receipts.length === 0 ? "No receipts to export" : "Download accountant-ready PDF expense report"}
          >
            {exporting === "pdf"
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <FileText className="h-3.5 w-3.5" />}
            Accountant PDF
          </Button>

        </div>
      </div>

      {/* Compact KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50/60 px-3.5 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">YTD Expenses</span>
          <span className="text-base font-bold text-slate-800">{fmtCurrency(effectiveTotal)}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Monthly Recurring</span>
          <span className="text-base font-bold text-slate-800">{fmtCurrency(monthlyTotal)}</span>
        </div>
        <div className={cn(
          "flex items-center justify-between rounded-lg px-3.5 py-2.5",
          ratioStatus === "healthy" ? "border border-emerald-200 bg-emerald-50/60" :
          ratioStatus === "warning" ? "border border-amber-200 bg-amber-50/60" :
                                      "border border-red-200 bg-red-50/60"
        )}>
          <span className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            ratioStatus === "healthy" ? "text-emerald-600" :
            ratioStatus === "warning" ? "text-amber-600" : "text-red-600"
          )}>Expense Ratio</span>
          <span className={cn(
            "text-base font-bold",
            ratioStatus === "healthy" ? "text-emerald-700" :
            ratioStatus === "warning" ? "text-amber-700" : "text-red-700"
          )}>{ytdGCI > 0 ? fmtPct(expenseRatio) : "—"}</span>
        </div>
        <div className={cn(
          "flex items-center justify-between rounded-lg px-3.5 py-2.5",
          survival.riskLevel === "strong" || survival.riskLevel === "healthy"
            ? "border border-emerald-200 bg-emerald-50/60"
            : survival.riskLevel === "warning"
            ? "border border-amber-200 bg-amber-50/60"
            : "border border-red-200 bg-red-50/60"
        )}>
          <span className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            survival.riskLevel === "strong" || survival.riskLevel === "healthy" ? "text-emerald-600" :
            survival.riskLevel === "warning" ? "text-amber-600" : "text-red-600"
          )}>Cash Runway</span>
          <span className={cn(
            "text-base font-bold",
            survival.riskLevel === "strong" || survival.riskLevel === "healthy" ? "text-emerald-700" :
            survival.riskLevel === "warning" ? "text-amber-700" : "text-red-700"
          )}>{survival.label}</span>
        </div>
      </div>

      {/* ── Filing period filter ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Filing period:</span>
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setSelectedPeriodIdx("all")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              selectedPeriodIdx === "all"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            All YTD
          </button>
          {allPeriods.map((p, i) => {
            const isActive = selectedPeriodIdx === String(i);
            const isCurrent = p.startDate === currentPeriod.startDate;
            return (
              <button
                key={i}
                onClick={() => setSelectedPeriodIdx(String(i))}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-slate-800 text-white"
                    : isCurrent
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {activePeriod && (() => {
          const dl = deadlineUrgency(activePeriod.deadline);
          return (
            <span className={cn(
              "ml-1 text-xs font-medium",
              dl.urgency === "overdue" ? "text-red-600" :
              dl.urgency === "urgent" ? "text-amber-600" :
              dl.urgency === "soon" ? "text-amber-500" : "text-muted-foreground",
            )}>
              {dl.label}
            </span>
          );
        })()}
      </div>

      {/* ── Deadline alert banner ──────────────────────────────────────── */}
      {(currentDeadline.urgency === "overdue" || currentDeadline.urgency === "urgent") && (
        <div className={cn(
          "flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm",
          currentDeadline.urgency === "overdue"
            ? "border border-red-300 bg-red-50 text-red-800"
            : "border border-amber-300 bg-amber-50 text-amber-800",
        )}>
          <AlertTriangle className={cn(
            "h-4 w-4 shrink-0",
            currentDeadline.urgency === "overdue" ? "text-red-600" : "text-amber-600",
          )} />
          <div className="flex-1">
            <span className="font-semibold">
              {currentDeadline.urgency === "overdue"
                ? `${settings ? gstHstLabel(settings.province) : "GST/HST"} return overdue`
                : `${settings ? gstHstLabel(settings.province) : "GST/HST"} return due soon`}
            </span>
            <span className="ml-1.5 font-normal">
              — {currentPeriod.label} filing is {currentDeadline.label}.
              {" "}Deadline: {new Date(currentPeriod.deadline + "T00:00:00").toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })}.
            </span>
          </div>
          <Clock className={cn(
            "h-4 w-4 shrink-0",
            currentDeadline.urgency === "overdue" ? "text-red-500" : "text-amber-500",
          )} />
        </div>
      )}

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border/60">
        {(["receipts", "mileage", "imports"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "text-foreground border-b-2 border-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "receipts" && "Receipts"}
            {t === "mileage"  && "Mileage"}
            {t === "imports"  && (
              <span className="flex items-center gap-1.5">
                Bank Imports
                {pendingImportsCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-1">
                    {pendingImportsCount}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Mileage ─────────────────────────────────────────────────── */}
      {tab === "mileage" && (
        <ExpensesMileageTab
          mileageLogs={mileageLogs}
          year={thisYear}
          settings={settings}
        />
      )}

      {/* ── Tab: Bank Imports ─────────────────────────────────────────────── */}
      {tab === "imports" && (
        <ExpensesBankImportsTab
          items={plaidItems}
          transactions={plaidTransactions}
          expenseItems={plaidExpenseItems}
          expenseCategories={plaidExpenseCategories}
          plaidConfigured={plaidConfigured}
        />
      )}

      {/* ── Tab: Receipts ─────────────────────────────────────────────────── */}
      {tab === "receipts" && (<>

      {/* ── GST34 Pre-Fill Summary ───────────────────────────────────────── */}
      {gst34Result && activePeriod && (
        <Card className="border-l-4 border-l-sky-500">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  GST34 Summary — {gst34Result.periodLabel}
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Pre-fill helper for your {gst34Result.taxLabel} return · CRA Form GST34
                </CardDescription>
              </div>
              <div className="text-right">
                <div className={cn(
                  "text-2xl font-bold tabular-nums",
                  gst34Result.line113 > 0 ? "text-red-700" : gst34Result.line113 < 0 ? "text-emerald-700" : "text-slate-700",
                )}>
                  {fmtCurrency(Math.abs(gst34Result.line113))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {gst34Result.line113 > 0 ? "Est. balance owing" : gst34Result.line113 < 0 ? "Est. refund" : "Net zero"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {/* Line items */}
            <div className="rounded-lg border text-sm">
              {gst34Result.lines.map((line, i) => {
                const isNetTax = line.line === "109";
                const isResult = line.line === "113";
                const isDeduction = line.line === "106" || line.line === "107" || line.line === "108" || line.line === "110";
                return (
                  <div
                    key={line.line}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-2",
                      i > 0 && "border-t border-border/50",
                      isNetTax && "bg-slate-50 font-medium",
                      isResult && (gst34Result.line113 >= 0
                        ? "bg-red-50 border-t-2 border-t-red-200 font-bold"
                        : "bg-emerald-50 border-t-2 border-t-emerald-200 font-bold"),
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-500">
                        {line.line}
                      </span>
                      <div className="min-w-0">
                        <span className={cn(
                          "text-sm",
                          isResult ? (gst34Result.line113 >= 0 ? "text-red-800" : "text-emerald-800") : "",
                        )}>
                          {line.label}
                        </span>
                        <p className="text-[10px] text-muted-foreground/70 truncate">{line.note}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "shrink-0 tabular-nums text-right",
                      isResult
                        ? (gst34Result.line113 >= 0 ? "text-red-700" : "text-emerald-700")
                        : isDeduction && line.amount > 0
                        ? "text-emerald-600"
                        : line.amount < 0
                        ? "text-red-600"
                        : "",
                    )}>
                      {isDeduction && line.amount > 0 && line.line !== "108" ? "−" : ""}
                      {fmtCurrency(Math.abs(line.amount))}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Deadline + disclaimer */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {(() => {
                const dl = deadlineUrgency(activePeriod.deadline);
                return (
                  <div className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
                    dl.urgency === "overdue" ? "bg-red-100 text-red-700" :
                    dl.urgency === "urgent" ? "bg-amber-100 text-amber-700" :
                    dl.urgency === "soon" ? "bg-amber-50 text-amber-600" :
                    "bg-slate-100 text-slate-600",
                  )}>
                    <Clock className="h-3 w-3" />
                    Filing deadline: {new Date(activePeriod.deadline + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} ({dl.label})
                  </div>
                );
              })()}
              <span className="text-[10px] text-muted-foreground">
                {gst34Result.taxLabel} rate: {gst34Result.taxRate === 0.14975 ? "14.975%" : `${(gst34Result.taxRate * 100).toFixed(0)}%`}
              </span>
            </div>

            <TaxDisclaimer />
          </CardContent>
        </Card>
      )}

      {/* ── Brokerage Statement Reconciliation ─────────────────────────────── */}
      {gst34Result && activePeriod && (
        <Card className="border-l-4 border-l-indigo-400">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-500" />
                  Verify with Brokerage Statement
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Upload your brokerage commission statement to cross-check deals in {gst34Result.periodLabel}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReconOpen(!reconOpen)}
                className="shrink-0"
              >
                {reconOpen ? "Close" : "Upload Statement"}
              </Button>
            </div>
          </CardHeader>
          {reconOpen && (
            <CardContent className="pt-0 space-y-3">
              {/* Upload area */}
              {!reconResult && (
                <div
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors cursor-pointer",
                    reconUploading ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30",
                  )}
                  onClick={() => reconFileRef.current?.click()}
                >
                  <input
                    ref={reconFileRef}
                    type="file"
                    accept=".csv,.pdf,.txt,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleStatementUpload(f);
                      e.target.value = "";
                    }}
                  />
                  {reconUploading ? (
                    <>
                      <RefreshCw className="h-6 w-6 text-indigo-500 animate-spin" />
                      <p className="text-sm text-indigo-600 font-medium">Analyzing statement…</p>
                      <p className="text-xs text-muted-foreground">AI is extracting transactions and matching against your records</p>
                    </>
                  ) : (
                    <>
                      <Download className="h-6 w-6 text-slate-400" />
                      <p className="text-sm font-medium text-slate-600">Drop your brokerage statement here</p>
                      <p className="text-xs text-muted-foreground">CSV, PDF, or text file from your brokerage</p>
                    </>
                  )}
                </div>
              )}

              {/* Reconciliation results */}
              {reconResult && (
                <div className="space-y-3">
                  {/* Summary counts */}
                  <div className="flex flex-wrap gap-2">
                    {reconResult.matchCount > 0 && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        <Check className="h-3 w-3 mr-1" /> {reconResult.matchCount} matched
                      </Badge>
                    )}
                    {reconResult.possibleCount > 0 && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        <AlertTriangle className="h-3 w-3 mr-1" /> {reconResult.possibleCount} needs review
                      </Badge>
                    )}
                    {reconResult.newCount > 0 && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        <Plus className="h-3 w-3 mr-1" /> {reconResult.newCount} new ({fmtCurrency(reconResult.newGCI)} GCI)
                      </Badge>
                    )}
                  </div>

                  {/* Deal-by-deal list */}
                  <div className="rounded-lg border text-sm divide-y">
                    {reconResult.matches.map((m) => (
                      <div key={m.imported._importId} className={cn(
                        "px-3 py-2.5",
                        m.status === "match" ? "bg-emerald-50/40" :
                        m.status === "possible" ? "bg-amber-50/40" :
                        "bg-blue-50/40",
                      )}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn(
                                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                m.status === "match" ? "bg-emerald-100 text-emerald-700" :
                                m.status === "possible" ? "bg-amber-100 text-amber-700" :
                                "bg-blue-100 text-blue-700",
                              )}>
                                {m.status === "match" ? "MATCHED" : m.status === "possible" ? "REVIEW" : "NEW"}
                              </span>
                              <span className="font-medium truncate">{m.imported.address}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                              <span>{m.imported.date}</span>
                              <span>GCI {fmtCurrency(m.imported.gci)}</span>
                              {m.imported.side && <span className="capitalize">{m.imported.side}</span>}
                              {m.score > 0 && m.status !== "new" && <span>Score: {m.score}/100</span>}
                            </div>
                            {/* Discrepancies */}
                            {m.discrepancies.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {m.discrepancies.map((d, di) => (
                                  <span key={di} className={cn(
                                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px]",
                                    d.severity === "warning" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
                                  )}>
                                    {d.field}: {typeof d.imported === "number" ? fmtCurrency(d.imported) : d.imported} → {typeof d.existing === "number" ? fmtCurrency(d.existing) : d.existing}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Action buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            {m.status === "match" ? (
                              <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                                <Check className="h-3 w-3" /> Already recorded
                              </span>
                            ) : (
                              <>
                                <Button
                                  variant={m.decision === "add" ? "default" : "outline"}
                                  size="sm"
                                  className="h-7 text-xs px-2"
                                  onClick={() => setReconDecision(m.imported._importId, "add")}
                                >
                                  <Plus className="h-3 w-3 mr-0.5" /> Add
                                </Button>
                                <Button
                                  variant={m.decision === "skip" ? "default" : "outline"}
                                  size="sm"
                                  className="h-7 text-xs px-2"
                                  onClick={() => setReconDecision(m.imported._importId, "skip")}
                                >
                                  Skip
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Commit actions */}
                  <div className="flex items-center justify-between gap-3">
                    <Button variant="outline" size="sm" onClick={() => { setReconResult(null); }}>
                      Upload Different File
                    </Button>
                    {reconResult.matches.some((m) => m.decision === "add") && (
                      <Button
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700"
                        disabled={reconAdding}
                        onClick={commitReconDeals}
                      >
                        {reconAdding ? (
                          <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Adding…</>
                        ) : (
                          <>Add {reconResult.matches.filter((m) => m.decision === "add").length} Deal{reconResult.matches.filter((m) => m.decision === "add").length !== 1 ? "s" : ""}</>
                        )}
                      </Button>
                    )}
                  </div>

                  <TaxDisclaimer />
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Deadline approaching (for "All YTD" view — show when within 30 days) ── */}
      {!activePeriod && currentDeadline.urgency !== "ok" && currentDeadline.urgency !== "overdue" && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-2.5 text-sm text-amber-800">
          <Clock className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>{currentPeriod.label}</strong> {settings ? gstHstLabel(settings.province) : "GST/HST"} filing deadline is approaching — {currentDeadline.label}.
            Select the period above to see your GST34 pre-fill summary.
          </span>
        </div>
      )}

      {/* ── Tax Deductibility Summary ────────────────────────────────────── */}
      {effectiveTotal > 0 && (
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Est. Tax Deductible YTD</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Based on CRA rules · Meals & entertainment at 50% · Vehicle at{" "}
                  {Math.round(vehiclePct * 100)}% business use
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums text-emerald-700">
                  {fmtCurrency(totalDeductible)}
                </div>
                <p className="text-xs text-muted-foreground">
                  of {fmtCurrency(effectiveTotal)} spent ({effectiveTotal > 0 ? Math.round((totalDeductible / effectiveTotal) * 100) : 0}% deductible)
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Breakdown pills */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {deductBreakdown.full > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">100% items:</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">{fmtCurrency(deductBreakdown.full)}</span>
                </span>
              )}
              {deductBreakdown.meals > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  <span className="text-muted-foreground">Meals & ent. (50%):</span>
                  <span className="font-semibold text-amber-600 tabular-nums">{fmtCurrency(deductBreakdown.meals)}</span>
                </span>
              )}
              {deductBreakdown.vehicle > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">Vehicle ({Math.round(vehiclePct * 100)}% biz):</span>
                  <span className="font-semibold text-blue-600 tabular-nums">{fmtCurrency(deductBreakdown.vehicle)}</span>
                </span>
              )}

              {/* Vehicle % editor */}
              <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Vehicle biz use:</span>
                <div className="relative flex items-center">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={Math.round(vehiclePct * 100)}
                    onBlur={(e) => saveVehiclePct(e.target.value)}
                    className="h-6 w-[4.5rem] pr-5 text-right text-xs"
                  />
                  <span className="pointer-events-none absolute right-1.5 text-[10px] text-muted-foreground">%</span>
                </div>
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <TaxDisclaimer className="flex-1" />
              <a
                href="/reports"
                className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Generate T2125
                <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tax IQ Tips ──────────────────────────────────────────────────── */}
      {taxIQTips.length > 0 && (
        <Card className="border-l-4 border-l-amber-400">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Tax IQ
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  CRA-referenced tips based on your expenses and filing activity
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {taxIQTips.length} tip{taxIQTips.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {taxIQTips.map((tip) => (
              <div
                key={tip.id}
                className="group relative rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-slate-50/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{tip.title}</span>
                      <span className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        tip.category === "deductions" ? "bg-emerald-50 text-emerald-600" :
                        tip.category === "gst_hst" ? "bg-sky-50 text-sky-600" :
                        tip.category === "records" ? "bg-slate-100 text-slate-600" :
                        tip.category === "filing" ? "bg-amber-50 text-amber-600" :
                        "bg-violet-50 text-violet-600",
                      )}>
                        {TIP_CATEGORY_LABELS[tip.category] ?? tip.category}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tip.body}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <a
                        href={tip.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {tip.source}
                      </a>
                    </div>
                  </div>
                  <button
                    onClick={() => dismissTip(tip.id)}
                    className="shrink-0 rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-100 hover:text-muted-foreground"
                    title="Dismiss tip"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <TaxDisclaimer />
          </CardContent>
        </Card>
      )}

      {/* ── Year-over-Year Expense History ──────────────────────────────── */}
      {(priorRows.length > 0 || effectiveTotal > 0) && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Year-over-Year Expenses</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Enter prior year totals to track your expense trend · Edits save automatically
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Total Expenses</TableHead>
                    <TableHead className="text-right">Mileage (km)</TableHead>
                    <TableHead className="text-right">Mileage Deduction</TableHead>
                    <TableHead className="text-right hidden md:table-cell">GCI</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Exp. Ratio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Current year row — read-only from live data */}
                  <TableRow className="bg-emerald-50/40">
                    <TableCell className="font-semibold">
                      {thisYear}
                      <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        Live
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                      {fmtCurrency(effectiveTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">—</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">—</TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell">
                      {ytdGCI > 0 ? fmtCurrency(ytdGCI) : "—"}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-semibold hidden md:table-cell",
                      ytdGCI > 0 ? (expenseRatio > 0.35 ? "text-amber-600" : "text-emerald-600") : "text-muted-foreground",
                    )}>
                      {ytdGCI > 0 ? fmtPct(expenseRatio) : "—"}
                    </TableCell>
                  </TableRow>

                  {/* Prior year rows — editable */}
                  {priorRows.map((row) => {
                    const ratio = row.annual_gci > 0 ? row.annual_expenses / row.annual_gci : null;
                    const isSaving = savingYoy === row.year;
                    return (
                      <TableRow key={row.year} className="group">
                        <TableCell className="font-medium text-muted-foreground">
                          {row.year}
                          {isSaving && (
                            <span className="ml-1.5 text-[10px] text-blue-500">saving…</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="100"
                            min="0"
                            defaultValue={row.annual_expenses > 0 ? row.annual_expenses : ""}
                            placeholder="0"
                            onBlur={(e) => saveYoyExpenses(row.year, "annual_expenses", e.target.value)}
                            className="ml-auto h-7 w-28 text-right text-sm"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="10"
                            min="0"
                            defaultValue={row.annual_mileage_km > 0 ? row.annual_mileage_km : ""}
                            placeholder="km"
                            onBlur={(e) => saveYoyExpenses(row.year, "annual_mileage_km", e.target.value)}
                            className="ml-auto h-7 w-24 text-right text-sm"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="50"
                            min="0"
                            defaultValue={row.annual_mileage_deduct > 0 ? row.annual_mileage_deduct : ""}
                            placeholder="$0"
                            onBlur={(e) => saveYoyExpenses(row.year, "annual_mileage_deduct", e.target.value)}
                            className="ml-auto h-7 w-24 text-right text-sm"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground hidden md:table-cell">
                          {row.annual_gci > 0 ? fmtCurrency(row.annual_gci) : "—"}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium hidden md:table-cell",
                          ratio == null ? "text-muted-foreground" :
                          ratio > 0.35 ? "text-amber-600" : "text-emerald-600",
                        )}>
                          {ratio != null ? fmtPct(ratio) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {priorRows.length === 0 && (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                No prior year history yet. Add years in the{" "}
                <a href="/transactions?tab=history" className="underline underline-offset-2 hover:text-foreground">History</a>{" "}
                tab and they&apos;ll appear here for comparison.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Expense ratio bar */}
      {ytdGCI > 0 && (
        <Card className="border-l-4 border-l-amber-400">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-1.5">
                Expense Ratio vs. Benchmark
                <GuideLink anchor="expense-ratio" label="Expense ratio explained in Guide" />
                {isPro && <ExplainButton question="What is a healthy expense ratio for a real estate agent and how can I improve mine?" />}
              </CardTitle>
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs",
                  ratioStatus === "healthy" && "bg-emerald-100 text-emerald-700",
                  ratioStatus === "warning" && "bg-amber-100 text-amber-700",
                  ratioStatus === "critical" && "bg-red-100 text-red-700",
                )}
              >
                {ratioStatus === "healthy" ? "On track" : ratioStatus === "warning" ? "Elevated" : "High"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={Math.min(expenseRatio * 100, 100)} className="h-2.5" />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span className="font-medium text-foreground">25–30% target</span>
              <span>50%+</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Donut */}
      {donutData.length > 0 && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expense Breakdown</CardTitle>
            <CardDescription>YTD spending by category</CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseDonut data={donutData} />
          </CardContent>
        </Card>
      )}

      {/* Onboarding tip — shown only when no data entered yet */}
      {ytdTotal === 0 && monthlyTotal === 0 && (
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="flex items-start gap-3 py-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-blue-900">
                Two ways to track your spending — start with monthly bills.
              </p>
              <p className="mt-0.5 text-xs text-blue-700">
                Set <strong>Monthly Recurring</strong> for fixed costs (MLS dues, insurance,
                vehicle payment) — these feed your Cash Runway calculation.{" "}
                <strong>YTD totals</strong> are automatically tallied each time you capture a
                receipt photo, so there&apos;s nothing extra to type.
              </p>
              <p className="mt-2 text-xs text-blue-600">
                Tap <strong>Capture Receipt</strong> above to snap your first expense in seconds.{" "}
                <span className="font-medium">Want QuickBooks sync? Email hello@agentrunway.ca to let us know.</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Categories */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Categories
          </h2>
          {/* Expand All / Collapse All */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(new Set(categories.map((c) => c.id)))}
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              Expand all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(new Set())}
            >
              Collapse all
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {categories.map((cat) => {
            const isOpen = expanded.has(cat.id);
            const catYtd = cat.items.reduce((s, i) => s + effectiveYTD(i), 0);
            const catMonthly = cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0);
            const catDeductible = cat.items.reduce((s, i) => {
              const ytd = effectiveYTD(i);
              const map = EXPENSE_KEY_TO_T2125[i.key];
              if (!map) return s + ytd;
              if (map.applyVehicleUse) return s + ytd * vehiclePct;
              return s + ytd * map.deductiblePct;
            }, 0);
            const colors = CAT_COLORS[cat.key] ?? DEFAULT_CAT;

            return (
              <Card
                key={cat.id}
                className={cn("border-l-4 transition-shadow hover:shadow-md", colors.border)}
              >
                {/* Category header */}
                <CardHeader
                  className="cursor-pointer py-3"
                  onClick={() => toggleExpand(cat.id)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <CardTitle className="text-[15px] font-semibold">{cat.title}</CardTitle>
                      <Badge className={cn("text-xs font-medium", colors.badge)}>
                        {cat.items.length} item{cat.items.length !== 1 && "s"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="hidden sm:block">
                        <span className="text-muted-foreground">YTD </span>
                        <span className="font-semibold">{fmtCurrency(catYtd)}</span>
                      </span>
                      {catYtd > 0 && (
                        <span className="hidden md:block">
                          <span className="text-muted-foreground">Deduct. </span>
                          <span className={cn(
                            "font-semibold",
                            catDeductible < catYtd ? "text-amber-600" : "text-emerald-600",
                          )}>
                            {fmtCurrency(catDeductible)}
                          </span>
                        </span>
                      )}
                      <span className="hidden sm:block">
                        <span className="text-muted-foreground">/mo </span>
                        <span className="font-semibold">{fmtCurrency(catMonthly)}</span>
                      </span>
                      {/* Mobile compact */}
                      <span className="sm:hidden font-semibold">{fmtCurrency(catYtd)}</span>
                    </div>
                  </div>
                </CardHeader>

                {/* Expanded items */}
                {isOpen && (
                  <CardContent className="pb-4 pt-0">
                    <div className="overflow-x-auto">
                      <div className="min-w-[560px] space-y-1">
                        {/* Column headers */}
                        <div className="grid grid-cols-[1fr_100px_108px_130px_32px] gap-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          <span className="pl-1">Item</span>
                          <span className="text-right">YTD</span>
                          <span className="text-right">Deductible</span>
                          <span className="text-center">Monthly Recurring</span>
                          <span />
                        </div>

                        {/* Items */}
                        {cat.items.map((item) => {
                          const ytd = effectiveYTD(item);
                          const map = EXPENSE_KEY_TO_T2125[item.key];
                          let deductAmt = ytd;
                          let deductLabel: string | null = null;
                          let deductColor = "text-emerald-600";
                          if (map) {
                            if (map.applyVehicleUse) {
                              deductAmt = ytd * vehiclePct;
                              deductLabel = `${Math.round(vehiclePct * 100)}% biz`;
                              deductColor = "text-blue-600";
                            } else if (map.deductiblePct < 1.0) {
                              deductAmt = ytd * map.deductiblePct;
                              deductLabel = "50% rule";
                              deductColor = "text-amber-600";
                            }
                          }

                          return (
                          <div
                            key={item.id}
                            className="group grid grid-cols-[1fr_100px_108px_130px_32px] items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/40"
                          >
                            <span className="truncate text-sm font-medium">{item.title}</span>

                            {/* YTD — read-only, from receipts */}
                            <div className="h-8 flex items-center justify-end px-2 text-sm tabular-nums rounded-md border border-border/40 bg-muted/40 text-muted-foreground">
                              {ytd > 0
                                ? fmtCurrency(ytd)
                                : <span className="text-muted-foreground/40">—</span>}
                            </div>

                            {/* Deductible — computed */}
                            <div className="h-8 flex flex-col items-end justify-center px-2 rounded-md">
                              {ytd > 0 ? (
                                <>
                                  <span className={cn("text-xs font-semibold tabular-nums leading-tight", deductColor)}>
                                    {fmtCurrency(deductAmt)}
                                  </span>
                                  {deductLabel && (
                                    <span className={cn(
                                      "text-[9px] font-bold leading-tight",
                                      deductColor === "text-blue-600" ? "text-blue-500" : "text-amber-500",
                                    )}>
                                      {deductLabel}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground/40">—</span>
                              )}
                            </div>

                            {/* Monthly Recurring — editable */}
                            <Input
                              type="number"
                              placeholder="0"
                              defaultValue={Number(item.monthly_recurring) || ""}
                              onBlur={(e) => updateItem(item.id, "monthly_recurring", e.target.value)}
                              className="h-8 text-sm text-right"
                            />
                            <button
                              onClick={() => deleteItem(cat.id, item.id)}
                              className="flex h-8 w-8 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
                              title="Delete item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          );
                        })}

                        {/* Divider + Add item row */}
                        <div className="pt-1 border-t border-dashed border-border mt-1">
                          {addingTo === cat.id ? (
                            <div className="flex items-center gap-2 py-1 px-1">
                              <Input
                                autoFocus
                                placeholder="Item name (e.g. Client gifts)"
                                value={newItemTitle}
                                onChange={(e) => setNewItemTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") addItem(cat.id);
                                  if (e.key === "Escape") { setAddingTo(null); setNewItemTitle(""); }
                                }}
                                className="h-8 flex-1 text-sm"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                onClick={() => addItem(cat.id)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted"
                                onClick={() => { setAddingTo(null); setNewItemTitle(""); }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAddingTo(cat.id); setNewItemTitle(""); }}
                              className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add item
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Recurring Expenses ──────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Recurring Expenses</CardTitle>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openRecurringDialog()}>
              <Plus className="h-3.5 w-3.5" />
              Add Recurring
            </Button>
          </div>
          <CardDescription className="mt-1">
            Monthly expenses that auto-generate on a set day (e.g. vehicle lease, software subscriptions)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recurringExpenses.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <p className="text-sm text-muted-foreground">No recurring expenses set up yet.</p>
              <Button size="sm" variant="outline" onClick={() => openRecurringDialog()}>
                Add your first recurring expense
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Expense</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead className="hidden sm:table-cell text-center">Day</TableHead>
                    <TableHead className="hidden sm:table-cell text-center">HST</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurringExpenses.map((re) => (
                    <TableRow key={re.id} className="group cursor-pointer" onClick={() => openRecurringDialog(re)}>
                      <TableCell className="font-medium text-sm">
                        {re.name}
                        {re.notes && (
                          <span className="ml-1.5 text-xs text-muted-foreground">— {re.notes}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {fmtCurrency(re.amount)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" className="text-[10px]">
                          {CAT_LABEL[re.category_key] ?? re.category_key}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-center text-xs text-muted-foreground">
                        {re.day_of_month}{re.day_of_month === 1 ? "st" : re.day_of_month === 2 ? "nd" : re.day_of_month === 3 ? "rd" : "th"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-center text-xs">
                        {re.hst_included ? (
                          <span className="text-emerald-600">{fmtCurrency(re.hst_amount)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                            onClick={(e) => { e.stopPropagation(); deleteRecurringExpense(re.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Monthly total: <strong className="text-foreground">{fmtCurrency(recurringExpenses.reduce((s, r) => s + Number(r.amount), 0))}</strong>
            </span>
            <span>
              Annual estimate: <strong className="text-foreground">{fmtCurrency(recurringExpenses.reduce((s, r) => s + Number(r.amount), 0) * 12)}</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Receipt Log ─────────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Receipt Log</CardTitle>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCaptureOpen(true)}
              className="gap-1.5 h-7 text-xs"
            >
              <Camera className="h-3 w-3" />
              Add Receipt
            </Button>
          </div>
          <CardDescription className="mt-1">
            Individual receipts captured from photos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredReceipts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="rounded-full bg-muted p-4">
                <Camera className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {activePeriod ? `No receipts in ${activePeriod.label}` : "No receipts yet"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {activePeriod
                    ? "Try selecting a different filing period or add a receipt."
                    : "Tap \"Capture Receipt\" above to snap a photo and log an expense in seconds."}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCaptureOpen(true)}
                className="gap-1.5 mt-1"
              >
                <Camera className="h-3.5 w-3.5" />
                Capture your first receipt
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReceipts.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/60 group"
                      onClick={() => openReceipt(r)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {/* OCR confidence dot */}
                          {r.ocr_confidence != null && (
                            <span
                              className={cn(
                                "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                                r.ocr_confidence >= 0.85 ? "bg-emerald-400" :
                                r.ocr_confidence >= 0.60 ? "bg-amber-400"  : "bg-red-400",
                              )}
                              title={`OCR confidence: ${Math.round(r.ocr_confidence * 100)}%`}
                            />
                          )}
                          {r.vendor ?? <span className="text-muted-foreground italic">Unknown</span>}
                        </div>
                        {r.notes && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                            {r.notes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {r.expense_date
                          ? new Date(r.expense_date + "T12:00:00").toLocaleDateString("en-CA", {
                              month: "short", day: "numeric", year: "numeric",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {r.category_key ? (
                          <Badge variant="outline" className="text-xs font-normal">
                            {CAT_LABEL[r.category_key] ?? r.category_key}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs font-normal border-amber-300 text-amber-600">
                            Uncategorized
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {r.total_amount != null ? fmtCurrency(r.total_amount) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {r.tax_amount != null ? fmtCurrency(r.tax_amount) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-[10px] font-medium text-muted-foreground/50 group-hover:text-primary/60 transition-colors">
                          Edit →
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      </>)}

      {/* ── Capture dialog ───────────────────────────────────────────────────── */}
      <ReceiptCaptureDialog
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onSaved={handleReceiptSaved}
      />

      {/* ── View / Edit receipt dialog ───────────────────────────────────────── */}
      <ReceiptViewEditDialog
        receipt={viewReceipt}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        onSaved={handleReceiptUpdated}
        onDeleted={handleReceiptDeleted}
      />

      {/* ── Quick Add Expense dialog (voice-initiated) ─────────────────────── */}
      <Dialog open={quickExpenseOpen} onOpenChange={setQuickExpenseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Quick Add Expense
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {voiceBanner && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none mt-0.5">✨</span>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    Pre-filled from voice — please review and edit before saving.
                    {voiceDraft?.missingFields && voiceDraft.missingFields.length > 0 && (
                      <span className="block mt-0.5 text-amber-600">
                        Still needed: {voiceDraft.missingFields.join(", ")}
                      </span>
                    )}
                  </p>
                </div>
                {voiceDraft?.transcript_cleaned && (
                  <details className="mt-1.5">
                    <summary className="text-[10px] text-amber-700 cursor-pointer hover:text-amber-900 font-medium select-none">
                      View raw transcript
                    </summary>
                    <p className="mt-1 text-[10px] text-amber-700/80 leading-relaxed bg-amber-100/50 rounded px-2 py-1.5 italic">
                      &ldquo;{voiceDraft.transcript_cleaned}&rdquo;
                    </p>
                  </details>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={qeCategory} onValueChange={setQeCategory}>
                <SelectTrigger className={cn("text-sm", voiceTint("category"))}>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {RECEIPT_CATEGORY_GROUPS.map((g) => (
                    <SelectGroup key={g.group}>
                      <SelectLabel>{g.group}</SelectLabel>
                      {g.items.map((item) => (
                        <SelectItem key={item.key} value={item.key}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount ($) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={qeAmount}
                  onChange={(e) => setQeAmount(e.target.value)}
                  className={cn("text-sm", voiceTint("amount"))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  value={qeDate}
                  onChange={(e) => setQeDate(e.target.value)}
                  className={cn("text-sm", voiceTint("date"))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Vendor / Store</Label>
              <Input
                placeholder="e.g. Shell, Costco"
                value={qeVendor}
                onChange={(e) => setQeVendor(e.target.value)}
                className={cn("text-sm", voiceTint("vendor"))}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                placeholder="What was this expense for?"
                rows={2}
                value={qeDesc}
                onChange={(e) => setQeDesc(e.target.value)}
                className={cn("text-sm", voiceTint("description"))}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                disabled={!qeAmount.trim() || qeSaving}
                onClick={handleQuickExpenseSave}
                className="flex-1"
              >
                {qeSaving ? "Saving..." : "Add Expense"}
              </Button>
              <Button variant="ghost" onClick={() => setQuickExpenseOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Recurring Expense dialog ──────────────────────────────────────── */}
      <Dialog open={recurringDialogOpen} onOpenChange={setRecurringDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              {editingRecurring ? "Edit Recurring Expense" : "Add Recurring Expense"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Expense name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. Mazda CX-90 Lease, Canva Pro"
                value={reName}
                onChange={(e) => setReName(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Monthly amount ($) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={reAmount}
                  onChange={(e) => setReAmount(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Day of month (1-28)</Label>
                <Input
                  type="number"
                  min="1"
                  max="28"
                  value={reDay}
                  onChange={(e) => setReDay(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Category <span className="text-red-500">*</span></Label>
              <Select value={reCategory} onValueChange={setReCategory}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {RECEIPT_CATEGORY_GROUPS.map((g) => (
                    <SelectGroup key={g.group}>
                      <SelectLabel>{g.group}</SelectLabel>
                      {g.items.map((item) => (
                        <SelectItem key={item.key} value={item.key}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="re-hst"
                  checked={reHstIncluded}
                  onChange={(e) => setReHstIncluded(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="re-hst" className="text-xs cursor-pointer">HST included</Label>
              </div>
              {reHstIncluded && (
                <div className="space-y-1">
                  <Label className="text-xs">HST amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={reHstAmount}
                    onChange={(e) => setReHstAmount(e.target.value)}
                    className="text-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="re-vehicle"
                checked={reVehicle}
                onChange={(e) => setReVehicle(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="re-vehicle" className="text-xs cursor-pointer">
                Apply vehicle business-use % to this expense
              </Label>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                placeholder="e.g. 48-month lease, started Jan 2025"
                rows={2}
                value={reNotes}
                onChange={(e) => setReNotes(e.target.value)}
                className="text-sm"
              />
            </div>

            <TaxDisclaimer />

            <div className="flex gap-2 pt-2">
              <Button
                disabled={!reName.trim() || !reAmount.trim() || !reCategory || reSaving}
                onClick={saveRecurringExpense}
                className="flex-1"
              >
                {reSaving ? "Saving..." : editingRecurring ? "Update" : "Add Recurring Expense"}
              </Button>
              <Button variant="ghost" onClick={() => setRecurringDialogOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
