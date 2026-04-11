"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter }   from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtCurrency }  from "@/lib/formatters";
import type { PlaidItem, PlaidTransaction, PlaidReviewStatus } from "@/lib/types/database";
import {
  Landmark, CheckCircle2, XCircle, Clock, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExpenseItem {
  id: string;
  key: string;
  title: string;
  category_id: string;
}

interface ExpenseCategory {
  id: string;
  key: string;
  title: string;
  sort_order: number;
}

interface Props {
  items:             PlaidItem[];
  transactions:      PlaidTransaction[];
  expenseItems:      ExpenseItem[];
  expenseCategories: ExpenseCategory[];
  plaidConfigured:   boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const STATUS_CONFIG: Record<PlaidReviewStatus, { label: string; color: string }> = {
  pending:  { label: "Pending",  color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  approved: { label: "Approved", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  ignored:  { label: "Ignored",  color: "bg-slate-500/15 text-slate-500" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ExpensesBankImportsTab({
  items,
  transactions,
  expenseItems,
  expenseCategories,
  plaidConfigured,
}: Props) {
  const router   = useRouter();
  const supabase = createClient();

  const [localItems] = useState<PlaidItem[]>(items);
  const [localTxs,   setLocalTxs]   = useState<PlaidTransaction[]>(transactions);

  // Per-row category selection
  const [selectedCats, setSelectedCats] = useState<Record<string, string>>({});

  // Filter state
  const [filterStatus, setFilterStatus] = useState<"all" | PlaidReviewStatus>("pending");
  const [filterItemId, setFilterItemId] = useState<string>("all");

  // ── Category map ─────────────────────────────────────────────────────────
  const catGrouped = useMemo(() => {
    return expenseCategories
      .map((cat) => ({
        ...cat,
        items: expenseItems.filter((i) => i.category_id === cat.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [expenseCategories, expenseItems]);

  const keyTitle = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of expenseItems) map[item.key] = item.title;
    return map;
  }, [expenseItems]);

  // ── Filtered transactions ─────────────────────────────────────────────────
  const filteredTxs = useMemo(() => {
    return localTxs.filter((tx) => {
      if (tx.amount <= 0) return false;
      if (filterStatus !== "all" && tx.review_status !== filterStatus) return false;
      if (filterItemId !== "all" && tx.plaid_item_id !== filterItemId) return false;
      return true;
    });
  }, [localTxs, filterStatus, filterItemId]);

  const pendingCount = useMemo(
    () => localTxs.filter((t) => t.amount > 0 && t.review_status === "pending").length,
    [localTxs],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleApprove = useCallback(async (tx: PlaidTransaction) => {
    const catKey = selectedCats[tx.id] ?? tx.suggested_category ?? null;
    const prevTxs = localTxs;

    setLocalTxs((prev) =>
      prev.map((t) => t.id === tx.id
        ? { ...t, review_status: "approved", category_key: catKey }
        : t,
      ),
    );

    try {
      if (catKey) {
        const { error: insertErr } = await supabase.from("receipt_expenses").insert({
          user_id:      tx.user_id,
          expense_date: tx.transaction_date,
          category_key: catKey,
          total_amount: tx.amount,
          vendor_name:  tx.merchant_name ?? tx.description,
          notes:        "Imported from bank sync",
        });
        if (insertErr) throw insertErr;
      }

      const { error: updateErr } = await supabase
        .from("plaid_transactions")
        .update({ review_status: "approved", category_key: catKey })
        .eq("id", tx.id);
      if (updateErr) throw updateErr;

      router.refresh();
    } catch {
      setLocalTxs(prevTxs);
      toast.error("Failed to approve transaction — please try again.");
    }
  }, [localTxs, selectedCats, supabase, router]);

  const handleIgnore = useCallback(async (txId: string) => {
    const prevTxs = localTxs;
    setLocalTxs((prev) =>
      prev.map((t) => t.id === txId ? { ...t, review_status: "ignored" } : t),
    );
    const { error } = await supabase
      .from("plaid_transactions")
      .update({ review_status: "ignored" })
      .eq("id", txId);
    if (error) {
      setLocalTxs(prevTxs);
      toast.error("Failed to ignore transaction — please try again.");
    }
  }, [localTxs, supabase]);

  const handleApproveAll = useCallback(async () => {
    const pending = localTxs.filter(
      (t) => t.amount > 0 && t.review_status === "pending" && t.suggested_category,
    );
    const prevTxs = localTxs;

    setLocalTxs((prev) =>
      prev.map((t) =>
        (t.amount > 0 && t.review_status === "pending" && t.suggested_category)
          ? { ...t, review_status: "approved", category_key: t.suggested_category }
          : t,
      ),
    );

    let failed = 0;
    for (const tx of pending) {
      const catKey = selectedCats[tx.id] ?? tx.suggested_category!;
      const { error: insertErr } = await supabase.from("receipt_expenses").insert({
        user_id:      tx.user_id,
        expense_date: tx.transaction_date,
        category_key: catKey,
        total_amount: tx.amount,
        vendor_name:  tx.merchant_name ?? tx.description,
        notes:        "Imported from bank sync",
      });
      if (insertErr) { failed++; continue; }
      const { error: updateErr } = await supabase
        .from("plaid_transactions")
        .update({ review_status: "approved", category_key: catKey })
        .eq("id", tx.id);
      if (updateErr) failed++;
    }

    if (failed > 0) {
      setLocalTxs(prevTxs);
      toast.error(`${failed} transaction${failed !== 1 ? "s" : ""} failed to approve — please try again.`);
    } else {
      router.refresh();
    }
  }, [localTxs, selectedCats, supabase, router]);

  // ── Render ────────────────────────────────────────────────────────────────

  // No bank accounts connected yet
  if (localItems.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Landmark className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-base">No bank accounts connected</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Connect your business bank account or credit card in{" "}
            <Link href="/settings" className="underline underline-offset-2 font-medium text-foreground">
              Settings → Bank Connections
            </Link>{" "}
            to automatically import transactions as expenses.
          </p>
        </div>
        {!plaidConfigured && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-left text-sm text-amber-800 dark:text-amber-300 max-w-lg mx-auto">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <Info className="h-4 w-4" />
              Plaid credentials not yet configured
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Add Plaid credentials to your environment variables and Vercel settings, then connect a bank account in{" "}
              <Link href="/settings" className="underline underline-offset-2">Settings</Link>.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            Transaction Inbox
            {pendingCount > 0 && (
              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0">
                {pendingCount} pending
              </Badge>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review imported bank transactions. Approve them to add to your expense tracker.{" "}
            <Link href="/settings" className="underline underline-offset-2">Manage connections</Link>
          </p>
        </div>

        {pendingCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleApproveAll}
            className="text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Approve All with Suggestions
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Status:</span>
          {(["all", "pending", "approved", "ignored"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "px-2.5 py-1 rounded-full border text-xs font-medium transition-colors",
                filterStatus === s
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40",
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {localItems.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Account:</span>
            <select
              value={filterItemId}
              onChange={(e) => setFilterItemId(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="all">All accounts</option>
              {localItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.institution_name ?? "Bank"}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      {filteredTxs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 px-4 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground max-w-md">
            {filterStatus === "pending"
              ? "No pending transactions — all caught up!"
              : "No transactions match the current filter."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Merchant / Description</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTxs.map((tx) => {
                  const currentCat = selectedCats[tx.id] ?? tx.suggested_category ?? tx.category_key ?? "";
                  const isPending  = tx.review_status === "pending";
                  const isApproved = tx.review_status === "approved";

                  return (
                    <tr
                      key={tx.id}
                      className={cn(
                        "transition-colors",
                        isApproved ? "opacity-50" : "hover:bg-muted/20",
                      )}
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(tx.transaction_date)}
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <p className="font-medium truncate text-sm">
                          {tx.merchant_name ?? tx.description}
                        </p>
                        {tx.merchant_name && tx.description !== tx.merchant_name && (
                          <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-sm whitespace-nowrap">
                        {fmtCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        {isPending ? (
                          <Select
                            value={currentCat}
                            onValueChange={(val) =>
                              setSelectedCats((prev) => ({ ...prev, [tx.id]: val }))
                            }
                          >
                            <SelectTrigger className="h-8 text-xs border-border">
                              <SelectValue placeholder="Select category…">
                                {currentCat ? keyTitle[currentCat] : "Select category…"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {catGrouped.map((group) => (
                                <SelectGroup key={group.id}>
                                  <SelectLabel className="text-xs">{group.title}</SelectLabel>
                                  {group.items.map((item) => (
                                    <SelectItem key={item.key} value={item.key} className="text-xs">
                                      {item.title}
                                      {tx.suggested_category === item.key && tx.suggestion_confidence && (
                                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                                          ({Math.round(tx.suggestion_confidence * 100)}% match)
                                        </span>
                                      )}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {tx.category_key ? (keyTitle[tx.category_key] ?? tx.category_key) : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          STATUS_CONFIG[tx.review_status].color,
                        )}>
                          {tx.review_status === "approved" && <CheckCircle2 className="h-3 w-3" />}
                          {tx.review_status === "ignored"  && <XCircle      className="h-3 w-3" />}
                          {tx.review_status === "pending"  && <Clock        className="h-3 w-3" />}
                          {STATUS_CONFIG[tx.review_status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isPending && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => handleApprove(tx)}
                              disabled={!currentCat}
                              className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              title={!currentCat ? "Select a category first" : "Approve as expense"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleIgnore(tx.id)}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                              title="Ignore (personal / non-business)"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-2.5 text-xs text-muted-foreground bg-muted/20 flex items-center justify-between">
            <span>
              Showing {filteredTxs.length} transaction{filteredTxs.length !== 1 ? "s" : ""}
            </span>
            <span>Approved transactions appear in your Receipts tracker</span>
          </div>
        </div>
      )}
    </div>
  );
}
