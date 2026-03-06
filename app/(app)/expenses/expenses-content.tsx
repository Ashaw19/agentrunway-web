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
import { ChevronDown, ChevronRight } from "lucide-react";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import {
  computeGCI,
  type ExpenseCategoryWithItems,
  type UserSettings,
  type Transaction,
} from "@/lib/types/database";
import { survivalResult } from "@/lib/engines/survival-engine";

interface Props {
  initialCategories: ExpenseCategoryWithItems[];
  settings: UserSettings | null;
  transactions: Transaction[];
}

export function ExpensesContent({ initialCategories, settings, transactions }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── Totals ────────────────────────────────────────────────────────────
  const ytdTotal = categories.reduce(
    (sum, cat) =>
      sum + cat.items.reduce((s, item) => s + Number(item.ytd_amount), 0),
    0,
  );
  const monthlyTotal = categories.reduce(
    (sum, cat) =>
      sum +
      cat.items.reduce((s, item) => s + Number(item.monthly_recurring), 0),
    0,
  );

  // ── YTD GCI for expense ratio ─────────────────────────────────────────
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);

  // ── Expense ratio ─────────────────────────────────────────────────────
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

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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
    await supabase
      .from("expense_items")
      .update({ [field]: numValue })
      .eq("id", itemId);

    setCategories((prev) =>
      prev.map((cat) => ({
        ...cat,
        items: cat.items.map((item) =>
          item.id === itemId ? { ...item, [field]: numValue } : item,
        ),
      })),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">
          Track your business expenses by category
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>YTD Expenses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCurrency(ytdTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly Recurring</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCurrency(monthlyTotal)}</div>
            <p className="text-xs text-muted-foreground">
              {fmtCurrency(monthlyTotal * 12)} annualized
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expense Ratio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${ratioColors[ratioStatus]}`}>
              {ytdGCI > 0 ? fmtPct(expenseRatio) : "\u2014"}
            </div>
            <p className="text-xs text-muted-foreground">
              {ytdGCI > 0 ? "of YTD GCI \u2022 benchmark: 25\u201330%" : "Log deals to see ratio"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cash Runway</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${riskColors[survival.riskLevel]}`}>
              {survival.label}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtCurrency(survival.monthlyBurn)}/mo burn
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Expense ratio bar */}
      {ytdGCI > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expense Ratio vs. Benchmark</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress
              value={Math.min(expenseRatio * 100, 100)}
              className="h-3"
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span className="font-medium">
                25\u201330% target
              </span>
              <span>50%+</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Categories */}
      <div className="space-y-3">
        {categories.map((cat) => {
          const isOpen = expanded.has(cat.id);
          const catYtd = cat.items.reduce(
            (s, i) => s + Number(i.ytd_amount),
            0,
          );
          const catMonthly = cat.items.reduce(
            (s, i) => s + Number(i.monthly_recurring),
            0,
          );

          return (
            <Card key={cat.id}>
              <CardHeader
                className="cursor-pointer"
                onClick={() => toggleExpand(cat.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <CardTitle className="text-base">{cat.title}</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {cat.items.length} items
                    </Badge>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <span>
                      <span className="text-muted-foreground">YTD </span>
                      <span className="font-medium">
                        {fmtCurrency(catYtd)}
                      </span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Monthly </span>
                      <span className="font-medium">
                        {fmtCurrency(catMonthly)}
                      </span>
                    </span>
                  </div>
                </div>
              </CardHeader>
              {isOpen && (
                <CardContent>
                  <div className="space-y-3">
                    {cat.items.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[1fr_150px_150px] items-center gap-3"
                      >
                        <span className="text-sm">{item.title}</span>
                        <Input
                          type="number"
                          placeholder="YTD"
                          defaultValue={Number(item.ytd_amount) || ""}
                          onBlur={(e) =>
                            updateItem(item.id, "ytd_amount", e.target.value)
                          }
                          className="h-8 text-sm"
                        />
                        <Input
                          type="number"
                          placeholder="Monthly"
                          defaultValue={Number(item.monthly_recurring) || ""}
                          onBlur={(e) =>
                            updateItem(
                              item.id,
                              "monthly_recurring",
                              e.target.value,
                            )
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_150px_150px] gap-3 text-xs text-muted-foreground">
                      <span />
                      <span className="text-center">YTD Amount</span>
                      <span className="text-center">Monthly Recurring</span>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
