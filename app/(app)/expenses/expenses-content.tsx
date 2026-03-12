"use client";

import { useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Plus, Check, X, Trash2, Info, ExternalLink, ChevronsUpDown, Camera, Receipt, ArrowRight } from "lucide-react";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import {
  computeGCI,
  type ExpenseCategoryWithItems,
  type UserSettings,
  type Transaction,
} from "@/lib/types/database";
import { survivalResult } from "@/lib/engines/survival-engine";
import { EXPENSE_KEY_TO_T2125 } from "@/lib/engines/t2125-engine";
import { ExpenseDonut, type DonutDataPoint } from "@/components/expense-donut";
import { cn } from "@/lib/utils";
import { ReceiptCaptureDialog } from "@/components/receipt-capture-dialog";
import {
  RECEIPT_CATEGORIES,
  type ReceiptExpense,
} from "@/lib/types/receipt";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  initialCategories: ExpenseCategoryWithItems[];
  settings: UserSettings | null;
  transactions: Transaction[];
  initialReceipts?: ReceiptExpense[];
  /** Current-year receipt totals keyed by expense_items.key — computed server-side */
  receiptTotalsByKey: Record<string, number>;
}

// Per-category colour accent (left border + header icon tint)
const CAT_COLORS: Record<string, { border: string; badge: string }> = {
  vehicle:       { border: "border-l-blue-500",    badge: "bg-blue-50 text-blue-700" },
  marketing:     { border: "border-l-violet-500",  badge: "bg-violet-50 text-violet-700" },
  office_tech:   { border: "border-l-teal-500",    badge: "bg-teal-50 text-teal-700" },
  professional:  { border: "border-l-amber-500",   badge: "bg-amber-50 text-amber-700" },
  education:     { border: "border-l-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  meals:         { border: "border-l-rose-400",    badge: "bg-rose-50 text-rose-700" },
  entertainment: { border: "border-l-purple-500",  badge: "bg-purple-50 text-purple-700" },
  other:         { border: "border-l-slate-400",   badge: "bg-slate-100 text-slate-600" },
};

const DEFAULT_CAT = { border: "border-l-slate-400", badge: "bg-slate-100 text-slate-600" };

// Map category key → label for the receipt log
const CAT_LABEL: Record<string, string> = Object.fromEntries(
  RECEIPT_CATEGORIES.map((c) => [c.key, c.label]),
);

export function ExpensesContent({ initialCategories, settings, transactions, initialReceipts = [], receiptTotalsByKey }: Props) {
  const [categories, setCategories] = useState(initialCategories);

  // ── Receipt YTD totals (keyed by expense_items.key, refreshed after each save) ──
  const [receiptTotals, setReceiptTotals] = useState<Record<string, number>>(receiptTotalsByKey);

  // ── Vehicle business use % (editable, persisted to user_settings) ────────
  const [vehiclePct, setVehiclePct] = useState<number>(
    settings?.vehicle_business_use_pct != null ? settings.vehicle_business_use_pct : 0.80,
  );

  // ── Receipt capture ────────────────────────────────────────────────────────
  const [captureOpen, setCaptureOpen] = useState(false);
  const [receipts,    setReceipts]    = useState<ReceiptExpense[]>(initialReceipts);

  const handleReceiptSaved = async () => {
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

  // ── YTD GCI for expense ratio ─────────────────────────────────────────
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const expenseRatio = ytdGCI > 0 ? ytdTotal / ytdGCI : 0;
  const ratioStatus =
    expenseRatio > 0.5 ? "critical" : expenseRatio > 0.35 ? "warning" : "healthy";
  const ratioColors: Record<string, string> = {
    critical: "text-red-600",
    warning: "text-amber-600",
    healthy: "text-emerald-600",
  };

  // ── Tax deductibility breakdown ───────────────────────────────────────
  const deductBreakdown = categories.reduce(
    (acc, cat) => {
      for (const item of cat.items) {
        const ytd = receiptTotals[item.key] ?? 0;
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
  const riskColors: Record<string, string> = {
    critical: "text-red-600",
    warning: "text-amber-600",
    healthy: "text-emerald-600",
    strong: "text-emerald-600",
  };

  // ── Donut chart data — per-category receipt totals ────────────────────
  const donutData: DonutDataPoint[] = categories
    .map((cat) => ({
      name: cat.title,
      value: cat.items.reduce((s, i) => s + (receiptTotals[i.key] ?? 0), 0),
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
    const numValue = parseFloat(value) || 0;
    const supabase = createClient();
    await supabase.from("expense_items").update({ [field]: numValue }).eq("id", itemId);
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
    const supabase = createClient();
    await supabase.from("expense_items").delete().eq("id", itemId);
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
    const pct = Math.min(1, Math.max(0, parseFloat(raw) / 100));
    if (isNaN(pct)) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("user_settings")
      .update({ vehicle_business_use_pct: pct })
      .eq("user_id", user.id);
    setVehiclePct(pct);
    toast.success("Vehicle business use % saved ✓");
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Every dollar out counts. Know your burn, protect your runway.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Capture Receipt */}
          <Button
            size="sm"
            onClick={() => setCaptureOpen(true)}
            className="gap-1.5"
          >
            <Camera className="h-3.5 w-3.5" />
            Capture Receipt
          </Button>

          {/* QuickBooks coming-soon CTA */}
          <Button
            variant="outline"
            size="sm"
            disabled
            title="QuickBooks integration — coming soon"
            className="opacity-60"
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Connect QuickBooks
            <Badge className="ml-1.5 bg-amber-100 px-1.5 py-0 text-[10px] font-semibold text-amber-700 hover:bg-amber-100">
              Soon
            </Badge>
          </Button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-100 to-rose-50 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wide text-rose-700">YTD Expenses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">{fmtCurrency(ytdTotal)}</div>
            <p className="mt-1 text-xs text-rose-600/80">This calendar year</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-100 to-amber-50 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wide text-amber-700">Monthly Recurring</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">{fmtCurrency(monthlyTotal)}</div>
            <p className="mt-1 text-xs text-amber-600/80">
              {fmtCurrency(monthlyTotal * 12)} annualized
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          "rounded-2xl shadow-sm",
          ratioStatus === "healthy" ? "border border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-50" :
          ratioStatus === "warning"  ? "border border-amber-200 bg-gradient-to-br from-amber-100 to-amber-50" :
                                       "border border-red-200 bg-gradient-to-br from-red-100 to-red-50"
        )}>
          <CardHeader className="pb-2">
            <CardDescription className={cn(
              "text-xs font-semibold uppercase tracking-wide",
              ratioStatus === "healthy" ? "text-emerald-700" :
              ratioStatus === "warning"  ? "text-amber-700" : "text-red-700"
            )}>Expense Ratio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold tracking-tight", ratioColors[ratioStatus])}>
              {ytdGCI > 0 ? fmtPct(expenseRatio) : "—"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {ytdGCI > 0 ? "of YTD GCI · target: 25–30%" : "Log deals to see ratio"}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          "rounded-2xl shadow-sm",
          survival.riskLevel === "strong" || survival.riskLevel === "healthy"
            ? "border border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-50"
            : survival.riskLevel === "warning"
            ? "border border-amber-200 bg-gradient-to-br from-amber-100 to-amber-50"
            : "border border-red-200 bg-gradient-to-br from-red-100 to-red-50"
        )}>
          <CardHeader className="pb-2">
            <CardDescription className={cn(
              "text-xs font-semibold uppercase tracking-wide",
              survival.riskLevel === "strong" || survival.riskLevel === "healthy" ? "text-emerald-700" :
              survival.riskLevel === "warning" ? "text-amber-700" : "text-red-700"
            )}>Cash Runway</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold tracking-tight", riskColors[survival.riskLevel])}>
              {survival.label}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {fmtCurrency(survival.monthlyBurn)}/mo burn rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Tax Deductibility Summary ────────────────────────────────────── */}
      {ytdTotal > 0 && (
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
                  of {fmtCurrency(ytdTotal)} spent ({Math.round((totalDeductible / ytdTotal) * 100)}% deductible)
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
                    className="h-6 w-16 pr-5 text-right text-xs"
                  />
                  <span className="pointer-events-none absolute right-1.5 text-[10px] text-muted-foreground">%</span>
                </div>
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                Estimates only · Not tax advice · Consult a qualified accountant
              </p>
              <a
                href="/tax"
                className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Generate T2125
                <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expense ratio bar */}
      {ytdGCI > 0 && (
        <Card className="border-l-4 border-l-amber-400">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Expense Ratio vs. Benchmark</CardTitle>
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
                <span className="font-medium">QuickBooks sync is coming soon.</span>
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
            const catYtd = cat.items.reduce((s, i) => s + (receiptTotals[i.key] ?? 0), 0);
            const catMonthly = cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0);
            const catDeductible = cat.items.reduce((s, i) => {
              const ytd = receiptTotals[i.key] ?? 0;
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
                          const ytd = receiptTotals[item.key] ?? 0;
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
          {receipts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="rounded-full bg-muted p-4">
                <Camera className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">No receipts yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tap &ldquo;Capture Receipt&rdquo; above to snap a photo and log an expense in seconds.
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.vendor ?? <span className="text-muted-foreground italic">Unknown</span>}
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
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {r.total_amount != null
                          ? fmtCurrency(r.total_amount)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {r.tax_amount != null
                          ? fmtCurrency(r.tax_amount)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Capture dialog ───────────────────────────────────────────────────── */}
      <ReceiptCaptureDialog
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onSaved={handleReceiptSaved}
      />
    </div>
  );
}
