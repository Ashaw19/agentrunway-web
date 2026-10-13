"use client";

import { Fragment, useState, useEffect, useMemo, useRef } from "react";
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
import type { ReceiptTotalsRow } from "@agent-runway/core/engines/expense-totals-engine";
import {
  RECEIPT_LIST_COLUMNS,
  RECEIPT_LIST_PAGE,
  receiptListDateFilter,
  receiptsForYear,
  receiptsInPeriod,
} from "@/lib/expenses/receipt-list";
import { expenseCategoryResolver, ytdExpenseTotals, type TrackedExpenseLine } from "@agent-runway/core/engines/t2125-expenses-engine";
import {
  UNFILED_CATEGORY_TITLE,
  groupExpenseLinesByCategory,
  linesDeductible,
  linesMonthly,
  linesYtd,
} from "@/lib/expenses/category-lines";
import { KpiCard } from "@/components/kpi-card";
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
import { survivalResult, riskColorBand, type RiskColorBand } from "@/lib/engines/survival-engine";
import { HOME_OFFICE_CATEGORY_KEY, isHomeOfficeKey } from "@/lib/engines/t2125-engine";
import { clampSalePrice, clampCommissionPct, clampGci } from "@/lib/import/clamp-db-range";
import { readImportError, ImportRequestError } from "@/lib/import/client-error";
import dynamic from "next/dynamic";
import type { DonutDataPoint } from "@/components/expense-donut";
import { cn } from "@/lib/utils";

const ExpenseDonut = dynamic(() => import("@/components/expense-donut").then(m => m.ExpenseDonut), { ssr: false });
const ReceiptCaptureDialog = dynamic(() => import("@/components/receipt-capture-dialog").then(m => m.ReceiptCaptureDialog), { ssr: false });
const ReceiptViewEditDialog = dynamic(() => import("@/components/receipt-view-edit-dialog").then(m => m.ReceiptViewEditDialog), { ssr: false });
import { ExpenseExportPdf }         from "@/components/pdf/expense-export-pdf";
import { Gst34WorksheetPdf }        from "@/components/pdf/gst34-worksheet-pdf";
import {
  RECEIPT_CATEGORIES,
  RECEIPT_CATEGORY_GROUPS,
  type ReceiptExpense,
} from "@/lib/types/receipt";
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
import type { PlaidItem, PlaidTransaction, MileageLog, RecurringExpense, PipelineDeal, HistoryItem } from "@/lib/types/database";
import { computeWeightedGCI, activePipelineDeals } from "@/lib/types/database";
import { seasonalFractionElapsed, projectedYearEndGCI, projectedYearEndTransactions } from "@/lib/engines/projection-engine";
import { computeEffectiveCashForSurvival, computePipelineMonthlyIncome } from "@/lib/engines/effective-cash";
import { ExpensesMileageTab }     from "./expenses-mileage-tab";
import { ExpensesBankImportsTab } from "./expenses-bank-imports-tab";
import { TaxDisclaimer } from "@/components/tax-disclaimer";
import {
  getFilingPeriods,
  getCurrentFilingPeriod,
  deadlineUrgency,
} from "@agent-runway/core/engines/filing-period-engine";
import { computeGST34 } from "@agent-runway/core/engines/gst34-engine";
import { buildGST34Worksheet } from "@agent-runway/core/engines/gst34-worksheet";
import { recurringHSTDetailForPeriod, recurringHSTEntriesForPeriod } from "@agent-runway/core/engines/recurring-expense-engine";
import { recurringEndDateError, recurringEndStatus } from "@/lib/expenses/recurring-end-date";
import { recurringListFooter } from "@/lib/expenses/recurring-list-footer";
import { localISODate } from "@agent-runway/core/lib/local-date";
import { gstHstLabel } from "@agent-runway/core/engines/canadian-tax-engine";
import {
  EXPENSE_RATIO_COPY,
  EXPENSE_RATIO_GAUGE_MAX,
  expenseRatioBand,
  expenseRatioColorHex,
  expenseRatioTone,
} from "@agent-runway/core/engines/expense-ratio-bands";
import { EXPENSE_RATIO_TONE_CLASS } from "@/lib/expense-ratio-style";
import { reconcileDeals, type ReconciliationResult, type ImportedDeal } from "@agent-runway/core/engines/reconciliation-engine";
import { selectTaxTips, TIP_CATEGORY_LABELS } from "@agent-runway/core/engines/tax-iq-engine";
import { gstHstRate } from "@agent-runway/core/engines/canadian-tax-engine";
import type { FilingFrequency, FilingPeriod } from "@/lib/types/database";

interface ExpenseItemForPlaid {
  id: string; key: string; title: string; category_id: string;
}
interface ExpenseCategoryForPlaid {
  id: string; key: string; title: string; sort_order: number;
}

/** A receipt totals row with its date, so it can be placed in a filing period. */
type ReceiptTotalDatedRow = ReceiptTotalsRow & { expense_date?: string | null };

/** Stable default, so the memo that reads it doesn't rerun every render. */
const NO_HIDDEN_ITEMS: { key: string; monthly_recurring: number | string | null }[] = [];

interface Props {
  initialCategories: ExpenseCategoryWithItems[];
  /**
   * Expense items of the categories this page doesn't show (payroll,
   * corporate admin). Their monthly figure still counts, as it does on the
   * dashboard and in the T2125 inputs, which read every expense item.
   */
  hiddenExpenseItems?: { key: string; monthly_recurring: number | string | null }[];
  settings: UserSettings | null;
  transactions: Transaction[];
  initialReceipts?: ReceiptExpense[];
  /**
   * Every current-year receipt (category_key, total_amount, tax_amount,
   * expense_date): the YTD totals and the GST34 summary are built on these.
   */
  receiptTotalRows: ReceiptTotalDatedRow[];
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
  isPro?: boolean;
  /** Pipeline deals — required for Survival metric parity with dashboard */
  pipelineDeals?: PipelineDeal[];
  /** Full history items (with quarter_gci) — required for agent-specific seasonality */
  historyItems?: HistoryItem[];
  /** Active recurring expenses — server-fetched for SSR parity with dashboard */
  recurringExpenses?: RecurringExpense[];
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
  home_office:   { border: "border-l-cyan-500",    badge: "bg-cyan-50 text-cyan-700"     },
};

const DEFAULT_CAT = { border: "border-l-slate-400", badge: "bg-slate-100 text-slate-600" };

// Map category key → label for the receipt log
const CAT_LABEL: Record<string, string> = Object.fromEntries(
  RECEIPT_CATEGORIES.map((c) => [c.key, c.label]),
);

export function ExpensesContent({
  initialCategories, settings, transactions, initialReceipts = [],
  receiptTotalRows: receiptTotalRowsSeed, priorYearHistory = [], currentYear,
  mileageLogs = [], plaidItems = [], plaidTransactions = [],
  plaidExpenseItems = [], plaidExpenseCategories = [], plaidConfigured = false,
  isPro: isProProp = false,
  pipelineDeals = [], historyItems = [], recurringExpenses: recurringExpensesSeed = [],
  hiddenExpenseItems = NO_HIDDEN_ITEMS,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const thisYear = currentYear ?? new Date().getFullYear();
  const isPro = isProProp;
  const [categories, setCategories] = useState(initialCategories);

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"receipts" | "mileage" | "imports">("receipts");
  // Bank Imports tab is hidden; pendingImportsCount kept for code retention.
  const _pendingImportsCount = plaidTransactions.filter(
    (t) => t.amount > 0 && t.review_status === "pending",
  ).length;
  void _pendingImportsCount;

  // ── Vehicle business use % (editable, persisted to user_settings) ────────
  const [vehiclePct, setVehiclePct] = useState<number>(
    settings?.vehicle_business_use_pct != null ? settings.vehicle_business_use_pct : 0.80,
  );

  // ── Home office % (editable, persisted to user_settings) ─────────────────
  // The share of a Home Office bill that is a business cost. The same figure
  // the T2125 business-use-of-home section and the GST34 summary use.
  const [homePct, setHomePct] = useState<number>(() => {
    const raw = Number(settings?.home_office_business_use_pct ?? 0);
    return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  });

  // ── Receipt YTD totals (refreshed after each save) ────────────────────────
  // Every expense total on this page comes from expense-totals-engine. For a
  // GST/HST registrant it is net of the ITCs the GST34 summary claims, so the
  // same tax isn't counted as both an ITC and an expense. The vehicle % in
  // the context is the editable one above, the same figure the GST34 uses.
  const [receiptTotalRows, setReceiptTotalRows] = useState<ReceiptTotalDatedRow[]>(receiptTotalRowsSeed);
  const gstHstRegistered = settings?.gst_hst_registered === true;
  const expenseTaxCtx = useMemo(
    () => ({ gstHstRegistered, vehicleBusinessUsePct: vehiclePct, homeOfficeBusinessUsePct: homePct }),
    [gstHstRegistered, vehiclePct, homePct],
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

  // The on-screen receipt log for the selected period. DISPLAY ONLY: every
  // number comes from `receiptTotalRows` (all of the year's receipts), never
  // from this list. See lib/expenses/receipt-list.ts.
  const filteredReceipts = useMemo(() => receiptsInPeriod(receipts, activePeriod), [receipts, activePeriod]);
  const [showAllReceipts, setShowAllReceipts] = useState(false);
  const visibleReceipts = showAllReceipts ? filteredReceipts : filteredReceipts.slice(0, RECEIPT_LIST_PAGE);

  // ── Recurring expenses ──────────────────────────────────────────────────
  // Seeded server-side so Survival/Runway metrics render with full data on first paint.
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>(recurringExpensesSeed);
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);

  // ── GST34 pre-fill computation ─────────────────────────────────────────
  const gst34Result = useMemo(() => {
    if (!activePeriod || !settings) return null;
    // Filter transactions to the selected period
    const periodTx = transactions.filter((tx) => {
      const d = tx.date;
      return d >= activePeriod.startDate && d <= activePeriod.endDate;
    });
    // One entry per recurring expense, so the meal and vehicle ITC limits
    // apply to each (a lease payment's HST follows the business-use share).
    const recurringHST = recurringHSTEntriesForPeriod(
      recurringExpenses,
      activePeriod.startDate,
      activePeriod.endDate,
    );
    return computeGST34({
      province: settings.province,
      period: activePeriod,
      frequency: filingFreq,
      periodTransactions: periodTx.map((tx) => ({ gci: computeGCI(tx) })),
      periodReceipts: [
        // Every receipt dated in the period, from the full current-year rows.
        ...receiptsInPeriod(receiptTotalRows, activePeriod).map((r) => ({
          total_amount: r.total_amount == null ? null : Number(r.total_amount),
          tax_amount: r.tax_amount == null ? null : Number(r.tax_amount),
          category_key: r.category_key ?? null,
        })),
        // Include HST paid on recurring expenses as ITCs (total_amount null
        // marks them as not-a-receipt for the line 106 note)
        ...recurringHST.map((e) => ({ total_amount: null, ...e })),
      ],
      instalmentsPaid: 0, // User can enter this in Reports tab
      vehicleBusinessUsePct: vehiclePct,
      homeOfficeBusinessUsePct: homePct,
    });
  }, [activePeriod, settings, transactions, receiptTotalRows, filingFreq, recurringExpenses, vehiclePct, homePct]);

  // ── Current period deadline alert ──────────────────────────────────────
  const currentDeadline = useMemo(() => {
    return deadlineUrgency(currentPeriod.deadline);
  }, [currentPeriod]);

  // ── Receipt view / edit ────────────────────────────────────────────────────
  const [viewReceipt,  setViewReceipt]  = useState<ReceiptExpense | null>(null);
  const [viewOpen,     setViewOpen]     = useState(false);
  const [reName, setReName] = useState("");
  const [reAmount, setReAmount] = useState("");
  const [reCategory, setReCategory] = useState("");
  const [reFrequency, setReFrequency] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const [reDay, setReDay] = useState("1");
  const [reMonthOfYear, setReMonthOfYear] = useState("1");
  const [reHstIncluded, setReHstIncluded] = useState(false);
  const [reHstAmount, setReHstAmount] = useState("");
  const [reVehicle, setReVehicle] = useState(false);
  const [reStartDate, setReStartDate] = useState(`${thisYear}-01-01`);
  const [reEndDate, setReEndDate] = useState(""); // "" = no end date
  const [reNotes, setReNotes] = useState("");
  const [reSaving, setReSaving] = useState(false);
  // Removing one asks what happened: it ended (keeps the charges to that
  // date) or it was never a real expense (takes the whole entry out).
  // `removingRecurring` stays set while the dialog closes, so it keeps its
  // contents through the exit animation (as `editingRecurring` does).
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removingRecurring, setRemovingRecurring] = useState<RecurringExpense | null>(null);
  const [removeEndDate, setRemoveEndDate] = useState("");

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
      // /api/import-history expects JSON with either `textContent` (for
      // CSV/XLSX/TXT) or `imageBase64` + `mimeType` (for PDFs and images).
      // Previously this path POSTed `multipart/form-data` with a `mode=reconcile`
      // flag, but the route does `await req.json()` and never consumed `mode`
      // — so every statement upload was silently failing with a JSON parse
      // error. Match the contract history-content.tsx uses.
      const isTextFile = /\.(csv|txt|tsv)$/i.test(file.name) ||
        file.type === "text/csv" || file.type === "text/plain";

      let payload: Record<string, unknown>;
      if (isTextFile) {
        const textContent = (await file.text()).replace(/\uFEFF/g, "");
        payload = { textContent };
      } else if (/\.xlsx?$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(buf, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const textContent = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]);
        payload = { textContent };
      } else {
        // Image or PDF → send as base64. Vercel serverless body cap is ~4.5MB,
        // so we reject oversized files here with a clearer message than a 413.
        const buf = await file.arrayBuffer();
        if (buf.byteLength > 4 * 1024 * 1024) {
          throw new Error("File is larger than 4 MB. Try exporting a CSV from your brokerage instead.");
        }
        let binary = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const imageBase64 = btoa(binary);
        const mimeType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
        payload = { imageBase64, mimeType };
      }

      const res = await fetch("/api/import-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // Same route as the history/transactions importers — a platform 504/502
        // returns a non-JSON body, so branch on status for an actionable message
        // instead of masking the timeout as a generic "Upload failed".
        throw new ImportRequestError(await readImportError(res));
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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const inserts = toAdd.map((m) => ({
        user_id: user.id,
        date: m.imported.date,
        address: m.imported.address,
        // Clamp to DB CHECK ranges via the single-source-of-truth helper. This
        // brokerage-statement reconcile path was the one bulk-import write site
        // the centralized clamp module never reached: an LLM misread (30%
        // commission, a column-swapped >$100M price, a negative/overflow GCI)
        // would otherwise reject the ENTIRE .insert() batch with no recovery.
        sale_price: clampSalePrice(m.imported.sale_price, 0),
        commission_pct: clampCommissionPct(m.imported.commission_pct, 0),
        gci_override: clampGci(m.imported.gci, 0),
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

  // Ref-based guards to prevent double-submit from rapid clicks
  const savingReRef = useRef(false);       // saveRecurringExpense
  const savingQeRef = useRef(false);       // handleQuickExpenseSave
  const addingItemRef = useRef(false);     // addItem
  const deletingItemRef = useRef(false);   // deleteItem
  const deletingReRef = useRef(false);     // deleteRecurringExpense

  // Fetch recurring expenses on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser || cancelled) return;
      const { data } = await supabase
        .from("recurring_expenses")
        .select("*")
        .eq("user_id", authUser.id)
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (data && !cancelled) setRecurringExpenses(data as RecurringExpense[]);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (receiptRefreshTimer.current) clearTimeout(receiptRefreshTimer.current);
    };
  }, []);

  function openRecurringDialog(existing?: RecurringExpense) {
    if (existing) {
      setEditingRecurring(existing);
      setReName(existing.name);
      setReAmount(String(existing.amount));
      setReCategory(existing.category_key);
      setReFrequency(existing.frequency ?? "monthly");
      setReDay(String(existing.day_of_month));
      setReMonthOfYear(String(existing.month_of_year ?? 1));
      setReHstIncluded(existing.hst_included);
      setReHstAmount(String(existing.hst_amount ?? 0));
      setReVehicle(existing.vehicle_pct_applicable);
      setReStartDate(existing.start_date ?? `${thisYear}-01-01`);
      setReEndDate(existing.end_date ?? "");
      setReNotes(existing.notes ?? "");
    } else {
      setEditingRecurring(null);
      setReName("");
      setReAmount("");
      setReCategory("");
      setReFrequency("monthly");
      setReDay("1");
      setReMonthOfYear("1");
      setReHstIncluded(false);
      setReHstAmount("");
      setReVehicle(false);
      setReStartDate(`${thisYear}-01-01`);
      setReEndDate("");
      setReNotes("");
    }
    setRecurringDialogOpen(true);
  }

  async function saveRecurringExpense() {
    if (savingReRef.current) return;
    if (!reName.trim() || !reAmount.trim() || !reCategory) {
      toast.error("Name, amount, and category are required.");
      return;
    }
    const endDateError = recurringEndDateError(reStartDate, reEndDate);
    if (endDateError) {
      toast.error(endDateError);
      return;
    }
    savingReRef.current = true;
    setReSaving(true);
    const payload = {
      name: reName.trim(),
      amount: parseFloat(reAmount) || 0,
      category_key: reCategory,
      frequency: reFrequency,
      day_of_month: Math.min(28, Math.max(1, parseInt(reDay) || 1)),
      month_of_year: reFrequency !== "monthly" ? Math.min(12, Math.max(1, parseInt(reMonthOfYear) || 1)) : null,
      hst_included: reHstIncluded,
      hst_amount: reHstIncluded ? (() => {
        const manual = parseFloat(reHstAmount) || 0;
        if (manual > 0) return manual;
        // Auto-calculate from total using province rate
        const rate = settings ? gstHstRate(settings.province) : 0;
        const total = parseFloat(reAmount) || 0;
        return total > 0 && rate > 0 ? Math.round((total - total / (1 + rate)) * 100) / 100 : 0;
      })() : 0,
      vehicle_pct_applicable: reVehicle,
      start_date: reStartDate,
      // The row stays active: its charges up to this date keep counting.
      end_date: reEndDate || null,
      notes: reNotes.trim(),
    };

    if (editingRecurring) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { savingReRef.current = false; setReSaving(false); return; }
      const { error } = await supabase
        .from("recurring_expenses")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingRecurring.id)
        .eq("user_id", authUser.id);
      if (error) { toast.error("Failed to update recurring expense."); savingReRef.current = false; setReSaving(false); return; }
      setRecurringExpenses((prev) =>
        prev.map((r) => r.id === editingRecurring.id ? { ...r, ...payload } : r),
      );
      toast.success("Recurring expense updated.");
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { savingReRef.current = false; setReSaving(false); return; }
      const { data, error } = await supabase
        .from("recurring_expenses")
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (error) { toast.error("Failed to add recurring expense."); savingReRef.current = false; setReSaving(false); return; }
      setRecurringExpenses((prev) => [...prev, data as RecurringExpense]);
      toast.success("Recurring expense added.");
    }
    savingReRef.current = false;
    setReSaving(false);
    setRecurringDialogOpen(false);
  }

  async function deleteRecurringExpense(id: string) {
    if (deletingReRef.current) return;
    deletingReRef.current = true;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { deletingReRef.current = false; return; }
    const { error } = await supabase
      .from("recurring_expenses")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", authUser.id);
    if (error) { toast.error("Failed to remove recurring expense."); deletingReRef.current = false; return; }
    setRecurringExpenses((prev) => prev.filter((r) => r.id !== id));
    toast.success("Recurring expense removed.");
    deletingReRef.current = false;
    setRemoveDialogOpen(false);
  }

  function openRemoveRecurring(re: RecurringExpense) {
    // Today, or the start date for an entry that has not started yet.
    const today = localISODate();
    setRemoveEndDate(re.end_date ?? (re.start_date > today ? re.start_date : today));
    setRemovingRecurring(re);
    setRemoveDialogOpen(true);
  }

  /** The expense was real and has stopped: keep the row, with an end date. */
  async function endRecurringExpense(re: RecurringExpense, endDate: string) {
    if (deletingReRef.current) return;
    const endDateError = endDate ? recurringEndDateError(re.start_date, endDate) : "Enter the last day this expense applied.";
    if (endDateError) { toast.error(endDateError); return; }
    deletingReRef.current = true;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { deletingReRef.current = false; return; }
    const { error } = await supabase
      .from("recurring_expenses")
      .update({ end_date: endDate, updated_at: new Date().toISOString() })
      .eq("id", re.id)
      .eq("user_id", authUser.id);
    if (error) { toast.error("Failed to save the end date."); deletingReRef.current = false; return; }
    setRecurringExpenses((prev) => prev.map((r) => r.id === re.id ? { ...r, end_date: endDate } : r));
    toast.success("End date saved. Charges up to that date still count.");
    deletingReRef.current = false;
    setRemoveDialogOpen(false);
  }

  // ── Voice-to-expense ─────────────────────────────────────────────────────
  const [quickExpenseOpen,  setQuickExpenseOpen]  = useState(false);
  const [voiceDraft,        setVoiceDraftLocal]   = useState<VoiceDraft | null>(null);
  const [voiceBanner,       setVoiceBanner]       = useState(false);
  const [qeCategory,  setQeCategory]  = useState("");
  const [qeAmount,    setQeAmount]    = useState("");
  const [qeVendor,    setQeVendor]    = useState("");
  const [qeDesc,      setQeDesc]     = useState("");
  const [qeDate,      setQeDate]     = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; });
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
    if (savingQeRef.current) return;
    savingQeRef.current = true;
    setQeSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { savingQeRef.current = false; setQeSaving(false); return; }

    // ── Validate expense amount before writing ─────────────────────────────
    const amount = parseDollar(qeAmount);
    const amountCheck = validateExpenseAmount(amount);
    if (!amountCheck.valid) {
      amountCheck.errors.forEach((msg) => toast.error(msg));
      savingQeRef.current = false;
      setQeSaving(false);
      return;
    }

    const { error } = await supabase.from("receipt_expenses").insert({
      user_id: user.id,
      category_key: qeCategory || null,
      total_amount: amount!,
      vendor: (qeVendor || "").slice(0, FIELD_LIMITS.vendor) || null,
      notes: (qeDesc || "").slice(0, FIELD_LIMITS.notes) || null,
      expense_date: qeDate || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })(),
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
      { const d = new Date(); setQeDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`); }
      // Refresh receipt totals
      await handleReceiptSaved();
    } else {
      toast.error("Couldn't save — try again");
    }
    savingQeRef.current = false;
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

    const year = new Date().getFullYear();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    // Refresh the receipt list (same query as the page: every receipt dated
    // this year or last, not a "last 50")
    const { data: logData } = await supabase
      .from("receipt_expenses")
      .select(RECEIPT_LIST_COLUMNS)
      .eq("user_id", authUser.id)
      .or(receiptListDateFilter(year))
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10000);
    if (logData) setReceipts(logData as ReceiptExpense[]);

    // Refresh YTD totals — re-aggregate from all current-year receipts
    const { data: totalsData } = await supabase
      .from("receipt_expenses")
      .select("category_key, total_amount, tax_amount, expense_date")
      .eq("user_id", authUser.id)
      .gte("expense_date", `${year}-01-01`);
    if (totalsData) setReceiptTotalRows(totalsData as ReceiptTotalDatedRow[]);
  };

  // Auto-expand all categories on first visit (no receipts yet and no monthly recurring)
  const isFirstVisit =
    receiptTotalRowsSeed.length === 0 &&
    initialCategories.every(
      (cat) => cat.items.every((i) => Number(i.monthly_recurring) === 0),
    );
  const [expanded, setExpanded] = useState<Set<string>>(
    isFirstVisit
      ? new Set(initialCategories.map((c) => c.id))
      : new Set(),
  );

  const [taxIQExpanded, setTaxIQExpanded] = useState(false);
  const [yoyExpanded, setYoyExpanded] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");

  // ── Which category an expense key sits under ("vehicle_payment" → "vehicle") ──
  // The engine's rule, the one the Reports "Expenses by Category" table, the
  // tax cards and Flight Crew use (expenseCategoryResolver).
  const categoryOf = useMemo(() => expenseCategoryResolver(categories), [categories]);

  // ── Recurring expenses grouped by parent category key ───────────────────────
  const recurringByCatKey = useMemo(() => {
    const map: Record<string, RecurringExpense[]> = {};
    for (const re of recurringExpenses) {
      if (!re.is_active) continue;
      // Ended before this year: nothing of it is in this year's figures. It
      // stays in the Recurring Expenses list below.
      if (re.end_date && re.end_date < `${thisYear}-01-01`) continue;
      // Resolve item-level key to parent category key
      const key = categoryOf(re.category_key) ?? re.category_key;
      if (!map[key]) map[key] = [];
      map[key].push(re);
    }
    return map;
  }, [recurringExpenses, categoryOf, thisYear]);

  // ── What each expense counts for ─────────────────────────────────────────
  // One call to t2125-expenses-engine gives this page its year-to-date total,
  // its monthly total, the "Est. Tax Deductible" card and every YTD,
  // Deductible and /mo cell. The dashboard, Reports and every other surface
  // make the same call (`ytdExpenseTotals`), so "YTD Expenses" here is theirs.
  // It covers receipts, the per-item monthly figure and the Recurring
  // Expenses list. Until 2026-10-13 the other surfaces compared the receipt
  // total with the monthly-figure total and kept the larger, so an account
  // with both read higher here than on its dashboard.
  const expenseTotals = useMemo(
    () =>
      ytdExpenseTotals({
        receipts: receiptTotalRows,
        recurring: recurringExpenses,
        expenseItems: [...categories.flatMap((c) => c.items), ...hiddenExpenseItems],
        ctx: expenseTaxCtx,
        now: new Date(),
      }),
    [receiptTotalRows, categories, hiddenExpenseItems, recurringExpenses, expenseTaxCtx],
  );
  const tracked = expenseTotals.tracked;
  // Home Office bills are in the lines at the home office share;
  // `homeBillTotals` is the whole bills, to show what the share is a share of.
  const homeBillTotals = expenseTotals.receipts.homeOfficeCosts;

  // The engine's lines, arranged the way this page shows them: by expense
  // item, by recurring expense, and by category. `unfiledLines` are the ones
  // with no category row to sit under (a receipt saved with no category, or
  // filed under a category this page doesn't show).
  const { lineByItemKey, lineByRecurringId, linesByCatKey, unfiledLines } = useMemo(
    () => groupExpenseLinesByCategory(tracked.lines, categories),
    [tracked, categories],
  );

  // ── Totals ────────────────────────────────────────────────────────────
  // This year's receipts (with or without a category), and what is expected
  // each month: the per-item monthly figures plus the Recurring Expenses
  // list. Both from the engine call above, so "Monthly Recurring" here is the
  // dashboard's, including anything filed under a category this page hides.
  const ytdTotal = expenseTotals.receiptYTD;
  const monthlyTotal = expenseTotals.monthlyRecurring;

  const now = new Date();

  // The footer under the Recurring Expenses list: its entries as entered
  // (GST/HST included, like the rows above it). The monthly figure is for
  // those that have not ended; the year's figure is the charges dated in
  // `thisYear`, so an entry with an end date or a start date in the year
  // counts between them. A list footer, not an expense total: those are
  // `expenseTotals`, net of ITCs.
  const recurringFooter = recurringListFooter(recurringExpenses, thisYear, now);

  // ── YTD expenses ──────────────────────────────────────────────────────
  // Every line the engine tracked: receipts (or the per-item monthly figure
  // where that is larger), the Recurring Expenses list to date, and receipts
  // with no category. The dashboard's figure is this same sum, so this
  // page's expense ratio is the dashboard's.
  const effectiveTotal = expenseTotals.expensesYTD;

  // ── YTD GCI for expense ratio ─────────────────────────────────────────
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const expenseRatio = ytdGCI > 0 ? effectiveTotal / ytdGCI : 0;
  // Band, colour and badge text from EXPENSE_RATIO_BANDS: the cut-offs the
  // Runway Score uses, so this page and the dashboard agree on any ratio.
  const ratioBand = expenseRatioBand(expenseRatio);
  const ratioTone = expenseRatioTone(expenseRatio);
  const ratioClass = EXPENSE_RATIO_TONE_CLASS[ratioTone];

  // ── Tax deductibility breakdown ───────────────────────────────────────
  // From the same engine lines: `home` is already the home office share.
  const deductBreakdown = tracked.byRule;
  const totalDeductible = tracked.deductibleTotal;
  const homePctLabel = `${Math.round(homePct * 100)}%`;

  /** Label and colour for a Deductible cell, by the limit that applies. */
  const deductibleDisplay = (line: TrackedExpenseLine | undefined): { label: string | null; color: string } => {
    switch (line?.rule) {
      case "vehicle": return { label: `${Math.round(vehiclePct * 100)}% biz`, color: "text-blue-600" };
      case "meals":   return { label: "50% rule", color: "text-amber-600" };
      case "home":    return { label: `${homePctLabel} home`, color: "text-cyan-700" };
      default:        return { label: null, color: "text-emerald-600" };
    }
  };

  // ── Survival ──────────────────────────────────────────────────────────
  // Survival cash input MUST be cashPosition.effectiveCash (not raw cash_reserve)
  // to match dashboard + chat. See memory/feedback_data_consistency_protocol.md.
  // Derive the same seasonal fraction + projections the dashboard uses.
  const expensesSeasonalWeights: number[] = (() => {
    const withData = historyItems.filter((h) =>
      (h.quarter_gci as number[] | null | undefined)?.some((v) => (v ?? 0) > 0),
    );
    if (withData.length >= 2) {
      const avgQ = [0, 1, 2, 3].map((q) =>
        withData.reduce((sum, h) =>
          sum + (((h.quarter_gci as number[] | null | undefined)?.[q]) ?? 0), 0,
        ) / withData.length,
      );
      const total = avgQ.reduce((a, b) => a + b, 0);
      if (total > 0) return avgQ.map((v) => v / total);
    }
    if (settings?.use_national_seasonality) {
      return (settings.national_quarter_pcts as number[] | null) ?? [0.25, 0.25, 0.25, 0.25];
    }
    return [0.25, 0.25, 0.25, 0.25];
  })();
  const expensesFraction = seasonalFractionElapsed(expensesSeasonalWeights);
  // Hoisted so the weighted-GCI reduce and the deal COUNT are derived from
  // the SAME filtered array. #258 filtered the money and left the count raw,
  // which fed terminal deals into projectedYearEndTransactions at +0.3 each.
  const liveExpensesPipelineDeals = activePipelineDeals(pipelineDeals);
  const expensesPipelineWeighted = liveExpensesPipelineDeals.reduce((sum, d) => sum + computeWeightedGCI(d), 0);
  const expensesProjectedGCI = projectedYearEndGCI(
    ytdGCI, expensesPipelineWeighted, expensesFraction, settings?.goal_gci ?? 0,
  );
  const expensesProjectedDeals = projectedYearEndTransactions(
    transactions.length, liveExpensesPipelineDeals.length, expensesFraction,
  );
  // Still to come this year, the dashboard's figure from the same engine
  // call: the per-item monthly figures for the months after this one, and
  // the Recurring Expenses list's charges after today (net of ITC).
  const expensesRemaining = expenseTotals.expensesRemaining;
  const survival = settings
    ? survivalResult(
        settings.monthly_brokerage_fee ?? 0,
        monthlyTotal,
        computeEffectiveCashForSurvival({
          settings,
          ytdGCI,
          expensesYTD: effectiveTotal,
          expensesRemaining,
          projectedGCI: expensesProjectedGCI,
          projectedDealCount: expensesProjectedDeals,
          fraction: expensesFraction,
          now,
        }).cashPosition.effectiveCash,
        // Pipeline monthly income via canonical helper (D-1, Audit 1 2026-04-22).
        computePipelineMonthlyIncome(expensesPipelineWeighted, expensesFraction),
      )
    : survivalResult(0, monthlyTotal, 0, 0);

  // Cash-runway color via the engine's single semantic contract (§9.1/§9.5):
  // healthy (4–<6mo) reads amber/watch, not emerald.
  const cashRunwayBand = riskColorBand(survival.riskLevel);
  const cashRunwayValueClass: Record<RiskColorBand, string> = {
    red: "text-red-700",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    slate: "text-slate-700",
  };

  // ── Donut chart data — YTD per category, from the engine lines ──────────
  const unfiledYtd = linesYtd(unfiledLines);
  const unfiledMonthly = linesMonthly(unfiledLines);
  const unfiledDeductible = linesDeductible(unfiledLines);
  const donutData: DonutDataPoint[] = [
    ...categories.map((cat) => ({ name: cat.title, value: linesYtd(linesByCatKey[cat.key]) })),
    { name: UNFILED_CATEGORY_TITLE, value: unfiledYtd },
  ].filter((d) => d.value > 0);

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
    const numValue = parseDollar(value) ?? 0;
    const recurringCheck = validateMonthlyRecurring(numValue);
    if (!recurringCheck.valid) {
      recurringCheck.errors.forEach((msg) => toast.error(msg));
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("expense_items").update({ [field]: numValue }).eq("id", itemId).eq("user_id", user.id);
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
    if (addingItemRef.current) return;
    const title = newItemTitle.trim();
    if (!title) return;
    addingItemRef.current = true;

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { addingItemRef.current = false; return; }

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
    addingItemRef.current = false;
    setAddingTo(null);
    setNewItemTitle("");
  }

  async function deleteItem(categoryId: string, itemId: string) {
    if (deletingItemRef.current) return;
    deletingItemRef.current = true;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { deletingItemRef.current = false; return; }
    const { error } = await supabase.from("expense_items").delete().eq("id", itemId).eq("user_id", user.id);
    if (error) {
      toast.error("Couldn't remove item — please try again.");
      deletingItemRef.current = false;
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
    deletingItemRef.current = false;
  }

  async function saveVehiclePct(raw: string) {
    const pct = Math.min(1, Math.max(0, parseFloat(raw) / 100));
    if (isNaN(pct)) return;
    const pctCheck = validateVehicleBusinessPct(pct);
    if (!pctCheck.valid) {
      pctCheck.errors.forEach((msg) => toast.error(msg));
      return;
    }
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

  async function saveHomePct(raw: string) {
    const pct = Math.min(1, Math.max(0, parseFloat(raw) / 100));
    if (isNaN(pct)) return;
    if (pct === homePct) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("user_settings")
      .update({ home_office_business_use_pct: pct })
      .eq("user_id", user.id);
    if (error) {
      toast.error("Couldn't save your home office %. Please try again.");
      return;
    }
    setHomePct(pct);
    toast.success("Home office % saved");
  }

  function openReceipt(r: ReceiptExpense) {
    setViewReceipt(r);
    setViewOpen(true);
  }

  async function refreshReceiptTotals() {
    const year = new Date().getFullYear();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data, error } = await supabase
      .from("receipt_expenses")
      .select("category_key, total_amount, tax_amount, expense_date")
      .eq("user_id", authUser.id)
      .gte("expense_date", `${year}-01-01`);
    if (error) { console.error("[expenses] receipt totals refresh failed:", error); return; }
    if (!data) return;
    setReceiptTotalRows(data as ReceiptTotalDatedRow[]);
  }

  function handleReceiptUpdated(updated: ReceiptExpense) {
    setReceipts((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    refreshReceiptTotals();
  }

  function handleReceiptDeleted(id: string) {
    setReceipts((prev) => prev.filter((r) => r.id !== id));
    refreshReceiptTotals();
  }

  // ── Year-over-year prior year editable rows ───────────────────────────────
  const [priorRows, setPriorRows] = useState<PriorYearRow[]>(priorYearHistory);
  const [savingYoy, setSavingYoy] = useState<number | null>(null); // year being saved

  async function saveYoyExpenses(yr: number, field: "annual_expenses" | "annual_mileage_km" | "annual_mileage_deduct", rawValue: string) {
    const val = parseDollar(rawValue) ?? 0;
    const yoyCheck = validateExpenseAmount(val);
    if (!yoyCheck.valid) {
      yoyCheck.errors.forEach((msg) => toast.error(msg));
      return;
    }
    setPriorRows((prev) => prev.map((r) => r.year === yr ? { ...r, [field]: val } : r));
    setSavingYoy(yr);
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
  // Both exports are named for the year, so they carry every receipt of that
  // year (the list also holds last year's).
  const exportReceipts = useMemo(() => receiptsForYear(receipts, year), [receipts, year]);

  function downloadCsv() {
    setExporting("csv");
    const rows = [
      ["Vendor", "Date", "Category", "Total (CAD)", "Tax / HST (CAD)", "Notes"],
      ...exportReceipts
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

  /** The export's category table: the same engine lines as the table on this page. */
  function pdfRuleLabel(lines: TrackedExpenseLine[]): string {
    const rules = new Set(lines.filter((l) => l.rawAmount > 0).map((l) => l.rule));
    if (rules.size > 1) return "Mixed";
    if (rules.has("home")) return `${homePctLabel} of home bills`;
    if (rules.has("vehicle")) return `${Math.round(vehiclePct * 100)}% biz use`;
    if (rules.has("meals")) return "50% rule";
    return "100%";
  }
  const pdfCategoryRows = [
    ...categories.map((cat) => ({ name: cat.title, lines: linesByCatKey[cat.key] ?? [] })),
    { name: UNFILED_CATEGORY_TITLE, lines: unfiledLines },
  ]
    .map(({ name, lines }) => ({ name, ytd: linesYtd(lines), deductible: linesDeductible(lines), rule: pdfRuleLabel(lines) }))
    .filter((row) => row.ytd > 0);

  async function downloadPdf() {
    setExporting("pdf");
    try {
      const doc = (
        <ExpenseExportPdf
          year={year}
          settings={settings}
          categoryRows={pdfCategoryRows}
          totalYtd={effectiveTotal}
          vehiclePct={vehiclePct}
          receipts={exportReceipts}
          totalDeductible={totalDeductible}
          deductFull={deductBreakdown.full}
          deductMeals={deductBreakdown.meals}
          deductVehicle={deductBreakdown.vehicle}
          deductHome={deductBreakdown.home}
          homePct={homePct}
          netOfItc={gstHstRegistered}
        />
      );
      const { pdf } = await import("@react-pdf/renderer");
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

  // ── GST/HST return worksheet (PDF) ────────────────────────────────────────
  // The lines come from `gst34Result` (every receipt of the year, filtered to
  // the period). The expense-by-expense list is built from the receipt list,
  // which carries vendor names; the worksheet prints the difference between
  // the two if they ever disagree.
  const [showAllGstLines, setShowAllGstLines] = useState(false);
  const [exportingGst, setExportingGst] = useState(false);

  async function downloadGstWorksheet() {
    if (!gst34Result || !activePeriod) return;
    setExportingGst(true);
    try {
      const worksheet = buildGST34Worksheet({
        receipts: receiptsInPeriod(receipts, activePeriod),
        recurring: recurringHSTDetailForPeriod(recurringExpenses, activePeriod.startDate, activePeriod.endDate),
        vehicleBusinessUsePct: vehiclePct,
        homeOfficeBusinessUsePct: homePct,
        line106: gst34Result.line106,
      });
      const doc = (
        <Gst34WorksheetPdf
          period={activePeriod}
          frequency={filingFreq}
          result={gst34Result}
          worksheet={worksheet}
          agentName={settings?.display_name || settings?.business_name || "Agent"}
          businessNumber={settings?.business_number || null}
          vehiclePct={vehiclePct}
          homePct={homePct}
        />
      );
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(doc).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `agent-runway-${gst34Result.taxLabel.toLowerCase().replace(/[^a-z]+/g, "-")}-return-${activePeriod.label.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Worksheet downloaded");
    } catch (err) {
      console.error("[GST34 worksheet] generation failed:", err);
      toast.error("Couldn't create the worksheet. Please try again.");
    } finally {
      setExportingGst(false);
    }
  }

  return (
    <div className="space-y-6">
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
            disabled={exporting !== null || exportReceipts.length === 0}
            className="gap-1.5"
            title={exportReceipts.length === 0 ? "No receipts to export" : `Download all ${exportReceipts.length} receipts for ${year} as CSV`}
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
            disabled={exporting !== null || exportReceipts.length === 0}
            className="gap-1.5"
            title={exportReceipts.length === 0 ? "No receipts to export" : "Download accountant-ready PDF expense report"}
          >
            {exporting === "pdf"
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <FileText className="h-3.5 w-3.5" />}
            Accountant PDF
          </Button>

        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="YTD Expenses"
          value={fmtCurrency(effectiveTotal)}
          subtitle={gstHstRegistered ? `Net of ${settings ? gstHstLabel(settings.province) : "GST/HST"} input tax credits` : undefined}
          colorScheme="rose"
          layout="horizontal"
        />
        <KpiCard label="Monthly Recurring" value={fmtCurrency(monthlyTotal)} colorScheme="amber" layout="horizontal" />
        <KpiCard
          label="Expense Ratio"
          value={ytdGCI > 0 ? fmtPct(expenseRatio) : "—"}
          colorScheme={ratioTone}
          valueClassName={ratioClass.value}
          layout="horizontal"
        />
        <KpiCard
          label="Cash Runway"
          value={survival.label}
          colorScheme={cashRunwayBand}
          valueClassName={cashRunwayValueClass[cashRunwayBand]}
          layout="horizontal"
        />
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
      {/* "Bank Imports" tab is hidden — bank-account connectivity is a planned
          future capability and is not currently offered. See
          memory/project_plaid_status.md. */}
      <div className="flex items-center gap-1 border-b border-border/60">
        {(["receipts", "mileage"] as const).map((t) => (
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

      {/* ── Tab: Bank Imports — HIDDEN (Plaid not currently offered) ────── */}
      {false && tab === "imports" && (
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

      {/* ── GST/HST return, line by line ─────────────────────────────────── */}
      {/* The lines are CRA's (gst34-engine). Line 106 is the ELIGIBLE credit;
          what was paid and what can't be claimed are shown under it, never as
          line 107, which CRA's return adds to line 106. */}
      {gst34Result && activePeriod && (() => {
        const fmtCents = (n: number) => {
          const abs = Math.abs(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return n < 0 ? `−$${abs}` : `$${abs}`;
        };
        const tax = gst34Result.taxLabel;
        const online = gst34Result.filingLines.filter((l) => l.how !== "paper");
        // Lines Agent Runway has nothing for (and line 110 at $0) sit behind a toggle.
        const isQuiet = (l: (typeof online)[number]) => !l.tracked || (l.line === "110" && l.amount === 0);
        const shown = online.filter((l) => showAllGstLines || !isQuiet(l));
        const quietCount = online.filter(isQuiet).length;
        const result = online[online.length - 1];
        const refund = result.line === "114";
        const tone = refund ? "emerald" : result.amount > 0 ? "red" : "slate";
        return (
        <Card className="border-l-4 border-l-sky-500">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {tax} Return: {gst34Result.periodLabel}
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Line by line, as CRA&apos;s Form GST34 asks for it
                </CardDescription>
              </div>
              <div className="text-right">
                <div className={cn(
                  "text-2xl font-bold tabular-nums",
                  tone === "red" ? "text-red-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-700",
                )}>
                  {fmtCents(result.amount)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {refund ? "Est. refund" : result.amount > 0 ? "Est. balance owing" : "Net zero"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="rounded-lg border text-sm">
              {shown.map((line, i) => {
                const isResult = line === result;
                return (
                  <div
                    key={line.line}
                    className={cn(
                      "flex items-start justify-between gap-3 px-4 py-2",
                      i > 0 && "border-t border-border/50",
                      line.line === "109" && "bg-slate-50 font-medium",
                      !line.tracked && "bg-muted/30",
                      isResult && (tone === "red"
                        ? "bg-red-50 border-t-2 border-t-red-200 font-bold"
                        : tone === "emerald"
                        ? "bg-emerald-50 border-t-2 border-t-emerald-200 font-bold"
                        : "bg-slate-50 border-t-2 font-bold"),
                    )}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-500">
                        {line.line}
                      </span>
                      <div className="min-w-0">
                        <span className={cn(
                          "text-sm",
                          isResult && (tone === "red" ? "text-red-800" : tone === "emerald" ? "text-emerald-800" : ""),
                        )}>
                          {line.label}
                        </span>
                        <p className="text-[10px] font-normal text-muted-foreground/80">{line.note}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={cn(
                        "tabular-nums",
                        isResult && (tone === "red" ? "text-red-700" : tone === "emerald" ? "text-emerald-700" : ""),
                      )}>
                        {fmtCents(line.amount)}
                      </span>
                      <p className={cn(
                        "text-[10px] font-normal",
                        line.how === "enter" ? "text-sky-700" : "text-muted-foreground/70",
                      )}>
                        {line.how === "enter" ? "You enter" : "CRA calculates"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => setShowAllGstLines((v) => !v)}
                className="font-medium text-sky-700 hover:text-sky-800"
              >
                {showAllGstLines
                  ? "Hide the lines left at $0"
                  : `Show ${quietCount} more line${quietCount !== 1 ? "s" : ""} left at $0 (Agent Runway has nothing for them)`}
              </button>
              <Button
                size="sm"
                variant="outline"
                onClick={downloadGstWorksheet}
                disabled={exportingGst}
                className="gap-1.5"
                title="The return line by line, with every expense behind line 106"
              >
                {exportingGst
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  : <FileText className="h-3.5 w-3.5" />}
                Download worksheet (PDF)
              </Button>
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
                {tax} rate: {gst34Result.taxRate === 0.14975 ? "14.975%" : `${(gst34Result.taxRate * 100).toFixed(0)}%`}
              </span>
            </div>

            <TaxDisclaimer />
          </CardContent>
        </Card>
        );
      })()}

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
                  {deductBreakdown.home > 0 && <> · Home bills at {homePctLabel} home office use</>}
                  {gstHstRegistered && (
                    <>
                      {" "}· Net of the {settings ? gstHstLabel(settings.province) : "GST/HST"} claimed as input tax credits
                    </>
                  )}
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums text-emerald-700">
                  {fmtCurrency(totalDeductible)}
                </div>
                <p className="text-xs text-muted-foreground">
                  of {fmtCurrency(effectiveTotal)} in expenses ({effectiveTotal > 0 ? Math.round((totalDeductible / effectiveTotal) * 100) : 0}% deductible)
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
              {deductBreakdown.home > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-cyan-500" />
                  <span className="text-muted-foreground">Home office ({homePctLabel} of bills):</span>
                  <span className="font-semibold text-cyan-700 tabular-nums">{fmtCurrency(deductBreakdown.home)}</span>
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
            {(taxIQExpanded ? taxIQTips : taxIQTips.slice(0, 1)).map((tip) => (
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
            {taxIQTips.length > 1 && (
              <button
                onClick={() => setTaxIQExpanded(!taxIQExpanded)}
                className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 pt-1"
              >
                {taxIQExpanded ? (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-3 w-3" />
                    Show {taxIQTips.length - 1} more tip{taxIQTips.length - 1 !== 1 ? "s" : ""}
                  </>
                )}
              </button>
            )}
            <TaxDisclaimer />
          </CardContent>
        </Card>
      )}

      {/* ── Year-over-Year Expense History ──────────────────────────────── */}
      {(priorRows.length > 0 || effectiveTotal > 0) && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setYoyExpanded(!yoyExpanded)}
            >
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Year-over-Year Expenses
                  {!yoyExpanded && priorRows.length > 0 && (
                    <Badge variant="outline" className="text-[10px]">{priorRows.length} yr{priorRows.length !== 1 ? "s" : ""}</Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Enter prior year totals to track your expense trend · Edits save automatically
                </CardDescription>
              </div>
              {yoyExpanded
                ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </button>
          </CardHeader>
          {yoyExpanded && <CardContent className="p-0">
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
                      ytdGCI > 0 ? ratioClass.text : "text-muted-foreground",
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
                          ratio == null ? "text-muted-foreground" : EXPENSE_RATIO_TONE_CLASS[expenseRatioTone(ratio)].text,
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
          </CardContent>}
        </Card>
      )}

      {/* Expense ratio + Donut — side-by-side */}
      {(ytdGCI > 0 || donutData.length > 0) && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Expense Ratio */}
              {ytdGCI > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      Expense Ratio
                      <GuideLink anchor="expense-ratio" label="Expense ratio explained in Guide" />
                      {isPro && <ExplainButton question="What is a healthy expense ratio for a real estate agent and how can I improve mine?" />}
                    </h3>
                    {ratioBand && (
                      <Badge variant="secondary" className={cn("text-xs", ratioClass.badge)}>
                        {ratioBand.label}
                      </Badge>
                    )}
                  </div>
                  {/* Drawn on the scale the captions name: full at the gauge's end, not at 100%. */}
                  <Progress
                    value={Math.min(expenseRatio / EXPENSE_RATIO_GAUGE_MAX, 1) * 100}
                    className="h-2.5"
                    indicatorStyle={{ background: expenseRatioColorHex(expenseRatio) }}
                  />
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>0%</span>
                    <span className="font-medium text-foreground">{EXPENSE_RATIO_COPY.targetCaption}</span>
                    <span>{EXPENSE_RATIO_COPY.gaugeMaxCaption}</span>
                  </div>
                </div>
              )}
              {/* Right: Donut */}
              {donutData.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Expense Breakdown</h3>
                  <ExpenseDonut data={donutData} />
                </div>
              )}
            </div>
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

      {/* Categories — compact table */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Categories
            </CardTitle>
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
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-4">Category</TableHead>
                  <TableHead className="text-center w-[60px]">Items</TableHead>
                  <TableHead className="text-right">YTD</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Deductible</TableHead>
                  <TableHead className="text-right">/mo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => {
                  const isOpen = expanded.has(cat.id);
                  const catLines = linesByCatKey[cat.key] ?? [];
                  const catYtd = linesYtd(catLines);
                  const catMonthly = linesMonthly(catLines);
                  const catDeductible = linesDeductible(catLines);
                  // Receipts filed under this category with no item row to show
                  // them on (the category itself, or an item since removed).
                  const catItemKeys = new Set(cat.items.map((i) => i.key));
                  const looseLines = catLines.filter((l) => l.source === "item" && !(l.key && catItemKeys.has(l.key)));
                  const colors = CAT_COLORS[cat.key] ?? DEFAULT_CAT;
                  const itemCount = cat.items.length + (recurringByCatKey[cat.key]?.length ?? 0);

                  return (
                    <Fragment key={cat.id}>
                      {/* Summary row */}
                      <TableRow
                        className={cn("cursor-pointer hover:bg-muted/40 border-l-4", colors.border)}
                        onClick={() => toggleExpand(cat.id)}
                      >
                        <TableCell className="pl-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {isOpen
                              ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                            <span className="font-semibold text-sm">{cat.title}</span>
                            {cat.key === HOME_OFFICE_CATEGORY_KEY && (
                              homePct > 0 ? (
                                <span className="text-[10px] font-medium text-cyan-700">{homePctLabel} of each bill counts</span>
                              ) : (
                                <span className="text-[10px] font-medium text-amber-600">Set your home office %</span>
                              )
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center py-2.5">
                          <Badge className={cn("text-[10px] font-medium", colors.badge)}>
                            {itemCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right py-2.5 font-semibold text-sm tabular-nums">
                          {catYtd > 0 ? fmtCurrency(catYtd) : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell className="text-right py-2.5 hidden sm:table-cell">
                          {catYtd > 0 ? (
                            <span className={cn(
                              "text-sm font-semibold tabular-nums",
                              catDeductible < catYtd ? "text-amber-600" : "text-emerald-600",
                            )}>
                              {fmtCurrency(catDeductible)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50 text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right py-2.5 font-semibold text-sm tabular-nums">
                          {catMonthly > 0 ? fmtCurrency(catMonthly) : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                      </TableRow>

                      {/* Expanded detail rows */}
                      {isOpen && (
                        <>
                          {cat.key === HOME_OFFICE_CATEGORY_KEY && (
                            <TableRow className="bg-cyan-50/40 hover:bg-cyan-50/40">
                              <TableCell colSpan={5} className="pl-12 py-2">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                                  <span>
                                    Log each home bill for its full amount. Only your home office share counts as a business expense.
                                  </span>
                                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                                    <span>Home office share:</span>
                                    <span className="relative flex items-center">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        aria-label="Home office share of your home, percent"
                                        defaultValue={homePct > 0 ? Math.round(homePct * 1000) / 10 : ""}
                                        placeholder="0"
                                        onBlur={(e) => saveHomePct(e.target.value || "0")}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-6 w-[4.5rem] pr-5 text-right text-xs"
                                      />
                                      <span className="pointer-events-none absolute right-1.5 text-[10px] text-muted-foreground">%</span>
                                    </span>
                                  </span>
                                  <span>Office area ÷ total home area. Also used for the T2125 home office line.</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                          {cat.items.map((item) => {
                            const line = lineByItemKey.get(item.key);
                            const ytd = line?.rawAmount ?? 0;
                            const isHomeBill = isHomeOfficeKey(item.key);
                            const homeBills = isHomeBill ? (homeBillTotals[item.key] ?? 0) : 0;
                            // For a home bill `ytd` is already the home office share.
                            const deductAmt = line?.deductibleAmount ?? 0;
                            const { label: deductLabel, color: deductColor } = deductibleDisplay(line);
                            return (
                              <TableRow key={item.id} className="group bg-muted/20 hover:bg-muted/40">
                                <TableCell className="pl-12 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">{item.title}</span>
                                    <button
                                      onClick={() => deleteItem(cat.id, item.id)}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
                                      title="Delete item"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell className="py-1.5" />
                                <TableCell className="text-right py-1.5 text-sm tabular-nums text-muted-foreground">
                                  {ytd > 0 ? fmtCurrency(ytd) : homeBills > 0 ? fmtCurrency(0) : "—"}
                                  {homeBills > 0 && (
                                    <span className="block text-[10px] text-muted-foreground/80">
                                      of {fmtCurrency(homeBills)} in bills
                                      {/* With an ITC on the bill, the share applies to the bill before tax. */}
                                      {gstHstRegistered && homePct > 0.1
                                        ? ` before ${settings ? gstHstLabel(settings.province) : "GST/HST"}`
                                        : ""}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right py-1.5 hidden sm:table-cell">
                                  {ytd > 0 ? (
                                    <span className={cn("text-xs font-medium tabular-nums", deductColor)}>
                                      {fmtCurrency(deductAmt)}
                                      {deductLabel && <span className="ml-1 text-[9px] opacity-70">{deductLabel}</span>}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/40">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right py-1.5">
                                  {isHomeBill ? (
                                    // Home bills vary, so there is no fixed monthly figure to
                                    // enter here: every other surface sums that field in full,
                                    // and a home bill only counts at the home office share.
                                    <span className="text-[10px] text-muted-foreground/70">log each bill</span>
                                  ) : (
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      defaultValue={Number(item.monthly_recurring) || ""}
                                      onBlur={(e) => updateItem(item.id, "monthly_recurring", e.target.value)}
                                      className="h-7 w-24 ml-auto text-sm text-right"
                                    />
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}

                          {/* Recurring expenses in this category */}
                          {(recurringByCatKey[cat.key] || []).map((re) => {
                            // Net of the ITC a registrant claims on it. The rows
                            // themselves stay as entered: the edit dialog and the
                            // Recurring Expenses list read `re.amount`.
                            const line = lineByRecurringId.get(re.id);
                            const monthly = line?.monthlyAmount ?? 0;
                            const ytd = line?.rawAmount ?? 0;
                            const deduct = deductibleDisplay(line);
                            const freqLabel = (re.frequency ?? "monthly") === "monthly" ? "/mo" : (re.frequency ?? "monthly") === "quarterly" ? "/qtr" : "/yr";
                            const endStatus = recurringEndStatus(re, now);
                            return (
                              <TableRow key={`re-${re.id}`} className="group bg-indigo-50/30 hover:bg-indigo-50/50">
                                <TableCell className="pl-12 py-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <RefreshCw className="h-3 w-3 text-indigo-400 shrink-0" />
                                    <span className="text-sm text-indigo-700">{re.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{freqLabel}</span>
                                    {endStatus?.ended && (
                                      <span className="text-[10px] text-muted-foreground">· {endStatus.label}</span>
                                    )}
                                    <button
                                      onClick={() => openRecurringDialog(re)}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 hover:text-indigo-600"
                                      title="Edit in Recurring Expenses"
                                    >
                                      <RefreshCw className="h-3 w-3" />
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell className="py-1.5" />
                                <TableCell className="text-right py-1.5 text-sm tabular-nums text-indigo-700">
                                  {ytd > 0 ? fmtCurrency(ytd) : "—"}
                                </TableCell>
                                <TableCell className="text-right py-1.5 hidden sm:table-cell">
                                  {line && ytd > 0 ? (
                                    <span className={cn("text-xs font-medium tabular-nums", deduct.color)}>
                                      {fmtCurrency(line.deductibleAmount)}
                                      {deduct.label && <span className="ml-1 text-[9px] opacity-70">{deduct.label}</span>}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/40">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right py-1.5 text-sm tabular-nums text-indigo-700 font-medium">
                                  {endStatus?.ended ? <span className="text-muted-foreground/40">—</span> : fmtCurrency(monthly)}
                                </TableCell>
                              </TableRow>
                            );
                          })}

                          {/* Receipts in this category with no item row */}
                          {looseLines.map((line) => {
                            const deduct = deductibleDisplay(line);
                            return (
                              <TableRow key={`loose-${line.key}`} className="bg-muted/20 hover:bg-muted/40">
                                <TableCell className="pl-12 py-1.5">
                                  <span className="text-sm text-muted-foreground">
                                    {line.key === cat.key ? "No item chosen" : (CAT_LABEL[line.key ?? ""] ?? line.key)}
                                  </span>
                                </TableCell>
                                <TableCell className="py-1.5" />
                                <TableCell className="text-right py-1.5 text-sm tabular-nums text-muted-foreground">
                                  {fmtCurrency(line.rawAmount)}
                                </TableCell>
                                <TableCell className="text-right py-1.5 hidden sm:table-cell">
                                  <span className={cn("text-xs font-medium tabular-nums", deduct.color)}>
                                    {fmtCurrency(line.deductibleAmount)}
                                    {deduct.label && <span className="ml-1 text-[9px] opacity-70">{deduct.label}</span>}
                                  </span>
                                </TableCell>
                                <TableCell className="py-1.5" />
                              </TableRow>
                            );
                          })}

                          {/* Add item row */}
                          <TableRow className="bg-muted/10">
                            <TableCell colSpan={5} className="pl-12 py-1">
                              {addingTo === cat.id ? (
                                <div className="flex items-center gap-2 py-0.5">
                                  <Input
                                    autoFocus
                                    placeholder="Item name (e.g. Client gifts)"
                                    value={newItemTitle}
                                    onChange={(e) => setNewItemTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") addItem(cat.id);
                                      if (e.key === "Escape") { setAddingTo(null); setNewItemTitle(""); }
                                    }}
                                    className="h-7 max-w-xs text-sm"
                                  />
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600" onClick={() => addItem(cat.id)}>
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => { setAddingTo(null); setNewItemTitle(""); }}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setAddingTo(cat.id); setNewItemTitle(""); }}
                                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                >
                                  <Plus className="h-3 w-3" /> Add item
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </Fragment>
                  );
                })}

                {/* Counted in YTD Expenses, with no category row above to sit under */}
                {(unfiledYtd > 0 || unfiledMonthly > 0) && (
                  <TableRow className="border-l-4 border-l-slate-300">
                    <TableCell className="pl-4 py-2.5">
                      <div className="flex flex-col gap-0.5 pl-5">
                        <span className="font-semibold text-sm">Not in a category above</span>
                        <span className="text-[10px] text-muted-foreground">
                          Receipts with no category, or expenses filed under one not shown here.
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5" />
                    <TableCell className="text-right py-2.5 font-semibold text-sm tabular-nums">
                      {fmtCurrency(unfiledYtd)}
                    </TableCell>
                    <TableCell className="text-right py-2.5 hidden sm:table-cell">
                      <span className={cn(
                        "text-sm font-semibold tabular-nums",
                        unfiledDeductible < unfiledYtd ? "text-amber-600" : "text-emerald-600",
                      )}>
                        {fmtCurrency(unfiledDeductible)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right py-2.5 font-semibold text-sm tabular-nums">
                      {unfiledMonthly > 0 ? fmtCurrency(unfiledMonthly) : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
            Expenses that repeat on a schedule (e.g. vehicle lease, software subscriptions). Each one counts in your totals and deductible figures by that schedule. One that has stopped keeps its earlier charges when it is given an end date.
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
                  {recurringExpenses.map((re) => {
                    const endStatus = recurringEndStatus(re, now);
                    return (
                    <TableRow key={re.id} className="group cursor-pointer" onClick={() => openRecurringDialog(re)}>
                      <TableCell className={cn("font-medium text-sm", endStatus?.ended && "text-muted-foreground")}>
                        {re.name}
                        {endStatus && (
                          endStatus.ended ? (
                            <Badge variant="outline" className="ml-2 text-[10px] font-normal text-muted-foreground">
                              {endStatus.label}
                            </Badge>
                          ) : (
                            <span className="ml-2 text-[10px] font-normal text-muted-foreground">{endStatus.label}</span>
                          )
                        )}
                        {re.notes && (
                          <span className="ml-1.5 text-xs text-muted-foreground">— {re.notes}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {fmtCurrency(re.amount)}
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">
                          /{(re.frequency ?? "monthly") === "monthly" ? "mo" : (re.frequency ?? "monthly") === "quarterly" ? "qtr" : "yr"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" className="text-[10px]">
                          {CAT_LABEL[re.category_key] ?? re.category_key}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-center text-xs text-muted-foreground">
                        {(re.frequency ?? "monthly") === "monthly" ? (
                          <>Day {re.day_of_month}</>
                        ) : (re.frequency ?? "monthly") === "quarterly" ? (
                          <>Quarterly</>
                        ) : (
                          <>{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(re.month_of_year ?? 1) - 1]}</>
                        )}
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
                            onClick={(e) => { e.stopPropagation(); openRemoveRecurring(re); }}
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Monthly avg{gstHstRegistered ? " as charged" : ""}: <strong className="text-foreground">{fmtCurrency(recurringFooter.monthly)}</strong>
            </span>
            <span title={`Every charge dated in ${thisYear}, from each entry's start date to its end date.`}>
              {thisYear} total{gstHstRegistered ? " as charged" : ""}: <strong className="text-foreground">{fmtCurrency(recurringFooter.yearTotal)}</strong>
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
                  {visibleReceipts.map((r) => (
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
              {filteredReceipts.length > RECEIPT_LIST_PAGE && (
                <div className="flex items-center justify-between gap-3 border-t px-2 pt-3 text-xs text-muted-foreground">
                  <span>
                    Showing {visibleReceipts.length} of {filteredReceipts.length} receipts
                    {activePeriod ? ` in ${activePeriod.label}` : ""}. Totals and exports include all of them.
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setShowAllReceipts((v) => !v)}
                  >
                    {showAllReceipts ? `Show the latest ${RECEIPT_LIST_PAGE}` : `Show all ${filteredReceipts.length}`}
                  </Button>
                </div>
              )}
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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

            {/* Frequency selector */}
            <div className="space-y-1">
              <Label className="text-xs">How often?</Label>
              <div className="flex gap-1.5">
                {(["monthly", "quarterly", "annual"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setReFrequency(f)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border",
                      reFrequency === f
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {f === "monthly" ? "Monthly" : f === "quarterly" ? "Quarterly" : "Annual"}
                  </button>
                ))}
              </div>
            </div>

            <div className={cn("grid gap-3", reFrequency !== "monthly" ? "grid-cols-3" : "grid-cols-2")}>
              <div className="space-y-1">
                <Label className="text-xs">
                  {reFrequency === "monthly" ? "Amount per month" : reFrequency === "quarterly" ? "Amount per quarter" : "Annual amount"} ($) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={reAmount}
                  onChange={(e) => {
                    setReAmount(e.target.value);
                    if (reHstIncluded && settings?.province) {
                      const rate = gstHstRate(settings.province);
                      const total = parseFloat(e.target.value) || 0;
                      if (total > 0 && rate > 0) {
                        setReHstAmount((total - total / (1 + rate)).toFixed(2));
                      }
                    }
                  }}
                  className="text-sm"
                />
              </div>
              {reFrequency !== "monthly" && (
                <div className="space-y-1">
                  <Label className="text-xs">{reFrequency === "annual" ? "Which month?" : "Starting month"}</Label>
                  <Select value={reMonthOfYear} onValueChange={setReMonthOfYear}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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

            {reFrequency !== "monthly" && (
              <p className="text-[10px] text-muted-foreground -mt-1">
                {reFrequency === "annual"
                  ? `This expense will appear once per year in ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(reMonthOfYear) - 1] || "Jan"}.`
                  : `This expense will appear every 3 months starting in ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(reMonthOfYear) - 1] || "Jan"}.`
                }
              </p>
            )}

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

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="re-hst"
                  checked={reHstIncluded}
                  onChange={(e) => {
                    setReHstIncluded(e.target.checked);
                    if (e.target.checked && reAmount && settings?.province) {
                      const rate = gstHstRate(settings.province);
                      const total = parseFloat(reAmount) || 0;
                      if (total > 0 && rate > 0) {
                        const hst = total - total / (1 + rate);
                        setReHstAmount(hst.toFixed(2));
                      }
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="re-hst" className="text-xs cursor-pointer">
                  This amount includes {settings ? gstHstLabel(settings.province) : "GST/HST"}
                </Label>
              </div>
              {reHstIncluded && (() => {
                const rate = settings ? gstHstRate(settings.province) : 0;
                const total = parseFloat(reAmount) || 0;
                const hst = total > 0 && rate > 0 ? total - total / (1 + rate) : 0;
                const taxLabel = settings ? gstHstLabel(settings.province) : "GST/HST";
                const ratePct = rate === 0.14975 ? "14.975%" : `${(rate * 100).toFixed(0)}%`;
                return (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-slate-50 px-3 py-1.5 text-xs">
                    {total > 0 ? (
                      <>
                        <span className="text-muted-foreground">Pre-tax: <strong className="text-foreground">{fmtCurrency(total - hst)}</strong></span>
                        <span className="text-muted-foreground">{taxLabel} ({ratePct}): <strong className="text-emerald-700">{fmtCurrency(hst)}</strong></span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Enter amount to see {taxLabel} breakdown</span>
                    )}
                    <span className="ml-auto flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">Override:</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Auto"
                        value={reHstAmount}
                        onChange={(e) => setReHstAmount(e.target.value)}
                        className="h-6 text-xs w-20"
                      />
                    </span>
                  </div>
                );
              })()}
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
              <Label className="text-xs">Started from</Label>
              <Input
                type="date"
                value={reStartDate}
                onChange={(e) => setReStartDate(e.target.value)}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                When did this expense start? Months before today will be included in your YTD totals.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="re-end-date" className="text-xs">End date (optional)</Label>
                {reEndDate && (
                  <button
                    type="button"
                    onClick={() => setReEndDate("")}
                    className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input
                id="re-end-date"
                type="date"
                min={reStartDate || undefined}
                value={reEndDate}
                onChange={(e) => setReEndDate(e.target.value)}
                aria-invalid={Boolean(recurringEndDateError(reStartDate, reEndDate))}
                className="text-sm"
              />
              {recurringEndDateError(reStartDate, reEndDate) ? (
                <p className="text-[10px] text-red-600">{recurringEndDateError(reStartDate, reEndDate)}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Leave empty while this expense is still being paid. With an end date, charges up to that date stay in your totals and none count after it.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                placeholder="e.g. 48-month lease through Jan 2028"
                rows={2}
                value={reNotes}
                onChange={(e) => setReNotes(e.target.value)}
                className="text-sm"
              />
            </div>

            <TaxDisclaimer />

            <div className="flex gap-2 pt-2">
              <Button
                disabled={!reName.trim() || !reAmount.trim() || !reCategory || reSaving || Boolean(recurringEndDateError(reStartDate, reEndDate))}
                onClick={saveRecurringExpense}
                className="flex-1"
              >
                {reSaving ? "Saving..." : editingRecurring ? "Update" : "Add Recurring Expense"}
              </Button>
              <Button variant="ghost" onClick={() => setRecurringDialogOpen(false)}>
                Cancel
              </Button>
              {/* The list's remove button shows on hover only; this one is reachable by touch. */}
              {editingRecurring && (
                <Button
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => { setRecurringDialogOpen(false); openRemoveRecurring(editingRecurring); }}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Remove a recurring expense: it ended, or it was never real ─────── */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Remove {removingRecurring?.name}
            </DialogTitle>
          </DialogHeader>
          {removingRecurring && (
            <div className="space-y-3 pt-2">
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">It ended</p>
                <p className="text-xs text-muted-foreground">
                  It was a real expense and it has stopped. Charges up to the end date stay in this year&apos;s totals and deductible figures. None count after it.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="re-remove-end-date" className="text-xs">Last day it applied</Label>
                  <Input
                    id="re-remove-end-date"
                    type="date"
                    min={removingRecurring.start_date || undefined}
                    value={removeEndDate}
                    onChange={(e) => setRemoveEndDate(e.target.value)}
                    className="text-sm"
                  />
                  {recurringEndDateError(removingRecurring.start_date, removeEndDate) && (
                    <p className="text-[10px] text-red-600">{recurringEndDateError(removingRecurring.start_date, removeEndDate)}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!removeEndDate || Boolean(recurringEndDateError(removingRecurring.start_date, removeEndDate))}
                  onClick={() => endRecurringExpense(removingRecurring, removeEndDate)}
                >
                  Save end date
                </Button>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">It was never a real expense</p>
                <p className="text-xs text-muted-foreground">
                  It was entered by mistake. Deleting takes it out of every total, including the months already past this year.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => deleteRecurringExpense(removingRecurring.id)}
                >
                  Delete it
                </Button>
              </div>

              <TaxDisclaimer />

              <Button variant="ghost" className="w-full" onClick={() => setRemoveDialogOpen(false)}>
                Cancel
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
