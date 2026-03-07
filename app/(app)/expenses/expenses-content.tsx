"use client";

import { useState } from "react";
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
import { ChevronDown, ChevronRight, Plus, Check, X, Trash2, Info, ExternalLink, ChevronsUpDown } from "lucide-react";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import {
  computeGCI,
  type ExpenseCategoryWithItems,
  type UserSettings,
  type Transaction,
} from "@/lib/types/database";
import { survivalResult } from "@/lib/engines/survival-engine";
import { ExpenseDonut, type DonutDataPoint } from "@/components/expense-donut";
import { cn } from "@/lib/utils";

interface Props {
  initialCategories: ExpenseCategoryWithItems[];
  settings: UserSettings | null;
  transactions: Transaction[];
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

export function ExpensesContent({ initialCategories, settings, transactions }: Props) {
  const [categories, setCategories] = useState(initialCategories);

  // Auto-expand all categories on first visit (when no data has been entered yet)
  const isFirstVisit = initialCategories.every(
    (cat) => cat.items.every(
      (i) => Number(i.ytd_amount) === 0 && Number(i.monthly_recurring) === 0,
    ),
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    isFirstVisit
      ? new Set(initialCategories.map((c) => c.id))
      : new Set(),
  );

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");

  // ── Totals ────────────────────────────────────────────────────────────
  const ytdTotal = categories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, item) => s + Number(item.ytd_amount), 0),
    0,
  );
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

  // ── Donut chart data ──────────────────────────────────────────────────
  const donutData: DonutDataPoint[] = categories
    .map((cat) => ({
      name: cat.title,
      value: cat.items.reduce((s, i) => s + Number(i.ytd_amount), 0),
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
    field: "ytd_amount" | "monthly_recurring",
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
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Track your business expenses and recurring costs by category
          </p>
        </div>
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

      {/* KPI Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-t-2 border-t-primary/40">
          <CardHeader className="pb-2">
            <CardDescription>YTD Expenses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{fmtCurrency(ytdTotal)}</div>
            <p className="mt-1 text-xs text-muted-foreground">This calendar year</p>
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-primary/40">
          <CardHeader className="pb-2">
            <CardDescription>Monthly Recurring</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{fmtCurrency(monthlyTotal)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {fmtCurrency(monthlyTotal * 12)} annualized
            </p>
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-primary/40">
          <CardHeader className="pb-2">
            <CardDescription>Expense Ratio</CardDescription>
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

        <Card className="border-t-2 border-t-primary/40">
          <CardHeader className="pb-2">
            <CardDescription>Cash Runway</CardDescription>
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
        <Card className="border-t-2 border-t-primary/40">
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
                Start by entering your monthly recurring costs
              </p>
              <p className="mt-0.5 text-xs text-blue-700">
                Each category below has two fields: <strong>Monthly Recurring</strong> (e.g.
                MLS dues, insurance, vehicle payment) and <strong>YTD Amount</strong> (what
                you&apos;ve actually spent so far this year). Monthly costs feed directly into
                your Cash Runway calculation. Enter what you know — you can always update later.
              </p>
              <p className="mt-2 text-xs text-blue-600">
                Prefer to import your expenses automatically?{" "}
                <span className="font-medium">QuickBooks integration is coming soon.</span>
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
            const catYtd = cat.items.reduce((s, i) => s + Number(i.ytd_amount), 0);
            const catMonthly = cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0);
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
                    <div className="flex items-center gap-6 text-sm">
                      <span className="hidden sm:block">
                        <span className="text-muted-foreground">YTD </span>
                        <span className="font-semibold">{fmtCurrency(catYtd)}</span>
                      </span>
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
                      <div className="min-w-[440px] space-y-1">
                        {/* Column headers */}
                        <div className="grid grid-cols-[1fr_148px_148px_32px] gap-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          <span className="pl-1">Item</span>
                          <span className="text-center">YTD Amount</span>
                          <span className="text-center">Monthly Recurring</span>
                          <span />
                        </div>

                        {/* Items */}
                        {cat.items.map((item) => (
                          <div
                            key={item.id}
                            className="group grid grid-cols-[1fr_148px_148px_32px] items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/40"
                          >
                            <span className="truncate text-sm font-medium">{item.title}</span>
                            <Input
                              type="number"
                              placeholder="0"
                              defaultValue={Number(item.ytd_amount) || ""}
                              onBlur={(e) => updateItem(item.id, "ytd_amount", e.target.value)}
                              className="h-8 text-sm text-right"
                            />
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
                        ))}

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
    </div>
  );
}
