"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Receipt,
  ArrowLeftRight,
  Car,
  Shield,
  Loader2,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtCurrency } from "@/lib/formatters";
import { PROVINCE_LABELS } from "@/lib/types/database";

// ── Types ────────────────────────────────────────────────────────────────────

interface AccountantData {
  agentName: string;
  brokerageName: string;
  businessName: string;
  province: string;
  year: number;
  label: string;
  transactions?: {
    id: string;
    address: string;
    date: string;
    sale_price: number;
    commission_pct: number;
    gci_override: number | null;
    side: string;
    status: string;
  }[];
  expenseCategories?: {
    id: string;
    key: string;
    title: string;
    items: {
      key: string;
      title: string;
      monthly_recurring: number;
    }[];
  }[];
  receiptTotalsByKey?: Record<string, number>;
  mileageLogs?: {
    trip_date: string;
    description: string;
    from_location: string;
    to_location: string;
    km: number;
    deduction: number;
    purpose: string;
  }[];
  ccaAssets?: {
    id: string;
    description: string;
    cca_class: number;
    acquisition_date: string;
    cost: number;
    ucc_opening: number;
  }[];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AccountantPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<AccountantData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/accountant-share?token=${params.token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Invalid or expired link");
        return r.json();
      })
      .then((d) => setData(d as AccountantData))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
            <h1 className="text-lg font-bold text-slate-900">
              Link Not Found
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {error || "This accountant share link is invalid or has expired."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const province =
    PROVINCE_LABELS[data.province as keyof typeof PROVINCE_LABELS] ??
    data.province;

  const year = data.year;
  const now = new Date();
  const completedMonths = Math.max(1, now.getMonth() + 1);

  // Compute expense totals
  const expenseTotal = data.expenseCategories
    ? data.expenseCategories.reduce((sum, cat) => {
        const receiptTotal = cat.items.reduce(
          (s, i) => s + (data.receiptTotalsByKey?.[i.key] ?? 0),
          0
        );
        const recurringTotal = cat.items.reduce(
          (s, i) => s + i.monthly_recurring * completedMonths,
          0
        );
        return sum + receiptTotal + recurringTotal;
      }, 0)
    : 0;

  const transactionTotal = data.transactions
    ? data.transactions.reduce((sum, tx) => {
        const gci =
          tx.gci_override ??
          tx.sale_price * tx.commission_pct;
        return sum + gci;
      }, 0)
    : 0;

  const mileageTotal = data.mileageLogs
    ? data.mileageLogs.reduce((sum, m) => sum + Number(m.deduction), 0)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-blue-600" />
                <Badge variant="secondary" className="text-xs">
                  Read-Only Accountant View
                </Badge>
              </div>
              <h1 className="text-xl font-bold text-slate-900">
                {data.agentName || "Agent"} — {year} Financial Summary
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {data.businessName || data.brokerageName} · {province}
                {data.label ? ` · Shared with: ${data.label}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Powered by</p>
              <p className="text-sm font-bold text-slate-700">Agent Runway</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* KPI Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          {data.transactions && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-100 p-2">
                    <ArrowLeftRight className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {year} Gross Commission
                    </p>
                    <p className="text-xl font-bold">
                      {fmtCurrency(transactionTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {data.transactions.length} transactions
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {data.expenseCategories && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-100 p-2">
                    <Receipt className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {year} Business Expenses
                    </p>
                    <p className="text-xl font-bold">
                      {fmtCurrency(expenseTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      YTD through {now.toLocaleDateString("en-CA", { month: "long" })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {data.mileageLogs && data.mileageLogs.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-violet-100 p-2">
                    <Car className="h-4 w-4 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Mileage Deduction
                    </p>
                    <p className="text-xl font-bold">
                      {fmtCurrency(mileageTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {data.mileageLogs.length} trips logged
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Transactions */}
        {data.transactions && data.transactions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowLeftRight className="h-4 w-4" />
                Closed Transactions — {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        Property
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        Side
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Sale Price
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        GCI
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tx) => {
                      const gci =
                        tx.gci_override ??
                        tx.sale_price * tx.commission_pct;
                      return (
                        <tr key={tx.id} className="border-b last:border-0">
                          <td className="py-2 text-muted-foreground">
                            {tx.date}
                          </td>
                          <td className="py-2">
                            {tx.address || "—"}
                          </td>
                          <td className="py-2">
                            <Badge variant="outline" className="text-[10px]">
                              {tx.side}
                            </Badge>
                          </td>
                          <td className="py-2 text-right">
                            {fmtCurrency(tx.sale_price)}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {fmtCurrency(gci)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2">
                      <td
                        colSpan={4}
                        className="py-2 font-semibold text-right"
                      >
                        Total GCI
                      </td>
                      <td className="py-2 text-right font-bold text-emerald-600">
                        {fmtCurrency(transactionTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expense Categories */}
        {data.expenseCategories && data.expenseCategories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4" />
                Expense Categories — {year} YTD
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">
                        Category
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        Key
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Receipts
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Recurring
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenseCategories.map((cat) => {
                      const receiptTotal = cat.items.reduce(
                        (s, i) =>
                          s + (data.receiptTotalsByKey?.[i.key] ?? 0),
                        0
                      );
                      const recurringTotal = cat.items.reduce(
                        (s, i) => s + i.monthly_recurring * completedMonths,
                        0
                      );
                      const total = receiptTotal + recurringTotal;
                      if (total === 0) return null;
                      return (
                        <tr key={cat.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{cat.title}</td>
                          <td className="py-2 text-muted-foreground">
                            {cat.key}
                          </td>
                          <td className="py-2 text-right">
                            {fmtCurrency(receiptTotal)}
                          </td>
                          <td className="py-2 text-right">
                            {fmtCurrency(recurringTotal)}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {fmtCurrency(total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2">
                      <td
                        colSpan={4}
                        className="py-2 font-semibold text-right"
                      >
                        Total Expenses
                      </td>
                      <td className="py-2 text-right font-bold text-amber-600">
                        {fmtCurrency(expenseTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mileage Log */}
        {data.mileageLogs && data.mileageLogs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Car className="h-4 w-4" />
                Mileage Log — {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        From / To
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        Purpose
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Km
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Deduction
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mileageLogs.map((m, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 text-muted-foreground">
                          {m.trip_date}
                        </td>
                        <td className="py-2">
                          {m.from_location || "—"} → {m.to_location || "—"}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {m.purpose || m.description || "—"}
                        </td>
                        <td className="py-2 text-right">
                          {Number(m.km).toFixed(1)}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {fmtCurrency(Number(m.deduction))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2">
                      <td
                        colSpan={3}
                        className="py-2 font-semibold text-right"
                      >
                        Total
                      </td>
                      <td className="py-2 text-right font-bold">
                        {data.mileageLogs
                          .reduce((s, m) => s + Number(m.km), 0)
                          .toFixed(1)}{" "}
                        km
                      </td>
                      <td className="py-2 text-right font-bold text-violet-600">
                        {fmtCurrency(mileageTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* CCA Assets */}
        {data.ccaAssets && data.ccaAssets.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Capital Cost Allowance Assets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">
                        Description
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        CCA Class
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        Acquired
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Cost
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        UCC Opening
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ccaAssets.map((a) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-2">{a.description}</td>
                        <td className="py-2">Class {a.cca_class}</td>
                        <td className="py-2 text-muted-foreground">
                          {a.acquisition_date}
                        </td>
                        <td className="py-2 text-right">
                          {fmtCurrency(Number(a.cost))}
                        </td>
                        <td className="py-2 text-right">
                          {fmtCurrency(Number(a.ucc_opening))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 pt-4 pb-8">
          <p>
            This is a read-only view shared via{" "}
            <a
              href="https://agentrunway.ca"
              className="text-blue-500 hover:underline"
            >
              Agent Runway
            </a>
            . Data is live and reflects the agent&apos;s current records.
          </p>
          <p className="mt-1">
            For questions about this data, contact the agent directly.
          </p>
        </div>
      </div>
    </div>
  );
}
