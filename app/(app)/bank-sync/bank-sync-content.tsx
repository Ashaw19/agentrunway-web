"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter }                       from "next/navigation";
import { PlaidLinkButton }                 from "@/components/plaid-link";
import { createClient }                    from "@/lib/supabase/client";
import { fmtCurrency }                     from "@/lib/formatters";
import type { PlaidItem, PlaidTransaction, PlaidReviewStatus } from "@/lib/types/database";
import {
  Landmark, RefreshCw, Trash2, CheckCircle2, XCircle,
  AlertCircle, Clock, Loader2, ChevronDown, Info,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtRelative(isoTs: string | null) {
  if (!isoTs) return "Never";
  const diff = Date.now() - new Date(isoTs).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATUS_CONFIG: Record<PlaidReviewStatus, { label: string; color: string }> = {
  pending:  { label: "Pending",  color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  approved: { label: "Approved", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  ignored:  { label: "Ignored",  color: "bg-slate-500/15 text-slate-500" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function BankSyncContent({ items, transactions, expenseItems, expenseCategories }: Props) {
  const router   = useRouter();
  const supabase = createClient();

  // ── Local state ──────────────────────────────────────────────────────────
  const [localItems, setLocalItems]       = useState<PlaidItem[]>(items);
  const [localTxs,   setLocalTxs]         = useState<PlaidTransaction[]>(transactions);
  const [syncingId,  setSyncingId]        = useState<string | null>(null);
  const [connectErr, setConnectErr]       = useState<string | null>(null);

  // Per-row category selection (before approving)
  const [selectedCats, setSelectedCats]   = useState<Record<string, string>>({});

  // Filter state
  const [filterStatus, setFilterStatus]   = useState<"all" | PlaidReviewStatus>("pending");
  const [filterItemId, setFilterItemId]   = useState<string>("all");

  // ── Plaid credentials configured? ────────────────────────────────────────
  const plaidConfigured = true; // server-side check is done in the API; optimistic here

  // ── Category map for dropdowns ───────────────────────────────────────────
  // Group expense items by category for the <Select> groups
  const catGrouped = useMemo(() => {
    return expenseCategories.map((cat) => ({
      ...cat,
      items: expenseItems.filter((i) => i.category_id === cat.id),
    })).filter((g) => g.items.length > 0);
  }, [expenseCategories, expenseItems]);

  // Key → title lookup
  const keyTitle = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of expenseItems) map[item.key] = item.title;
    return map;
  }, [expenseItems]);

  // ── Filtered transactions ─────────────────────────────────────────────────
  const filteredTxs = useMemo(() => {
    return localTxs.filter((tx) => {
      // Only show debits (positive amounts = money out)
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

  // Called when Plaid Link completes successfully
  const handlePlaidSuccess = useCallback(
    async ({ item_id, institution_name }: { item_id: string; institution_name: string }) => {
      setConnectErr(null);
      // Immediately trigger an initial sync
      setSyncingId(item_id);
      try {
        await fetch("/api/plaid/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id }),
        });
      } finally {
        setSyncingId(null);
      }
      // Refresh the page to get new data
      router.refresh();
      // Optimistic: add a placeholder item so the UI updates immediately
      setLocalItems((prev) => [
        {
          id:               item_id,
          user_id:          "",
          plaid_item_id:    "",
          access_token:     "",
          institution_id:   null,
          institution_name: institution_name,
          sync_cursor:      null,
          last_synced_at:   new Date().toISOString(),
          created_at:       new Date().toISOString(),
          updated_at:       new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    [router],
  );

  // Sync a single item
  const handleSync = useCallback(async (itemId: string) => {
    setSyncingId(itemId);
    try {
      const res  = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      if (res.ok) {
        // Update last_synced_at optimistically
        setLocalItems((prev) =>
          prev.map((i) => i.id === itemId
            ? { ...i, last_synced_at: new Date().toISOString() }
            : i,
          ),
        );
        // Refresh server data
        router.refresh();
      }
    } finally {
      setSyncingId(null);
    }
  }, [router]);

  // Disconnect a bank item
  const handleDisconnect = useCallback(async (itemId: string) => {
    const res = await fetch("/api/plaid/disconnect", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    });
    if (res.ok) {
      setLocalItems((prev)  => prev.filter((i) => i.id !== itemId));
      setLocalTxs((prev)    => prev.filter((t) => t.plaid_item_id !== itemId));
    }
  }, []);

  // Approve a transaction (creates a receipt_expenses row + marks approved)
  const handleApprove = useCallback(async (tx: PlaidTransaction) => {
    const catKey = selectedCats[tx.id] ?? tx.suggested_category ?? null;

    // Optimistic update
    setLocalTxs((prev) =>
      prev.map((t) => t.id === tx.id
        ? { ...t, review_status: "approved", category_key: catKey }
        : t,
      ),
    );

    // Insert receipt_expenses row so it contributes to YTD calculations
    if (catKey) {
      await supabase.from("receipt_expenses").insert({
        user_id:        tx.user_id,
        expense_date:   tx.transaction_date,
        category_key:   catKey,
        total_amount:   tx.amount,
        vendor_name:    tx.merchant_name ?? tx.description,
        notes:          "Imported from bank sync",
      });
    }

    // Mark as approved in plaid_transactions
    await supabase
      .from("plaid_transactions")
      .update({ review_status: "approved", category_key: catKey })
      .eq("id", tx.id);
  }, [selectedCats, supabase]);

  // Ignore a transaction
  const handleIgnore = useCallback(async (txId: string) => {
    setLocalTxs((prev) =>
      prev.map((t) => t.id === txId ? { ...t, review_status: "ignored" } : t),
    );
    await supabase
      .from("plaid_transactions")
      .update({ review_status: "ignored" })
      .eq("id", txId);
  }, [supabase]);

  // Approve ALL pending transactions using their suggested categories
  const handleApproveAll = useCallback(async () => {
    const pending = localTxs.filter(
      (t) => t.amount > 0 && t.review_status === "pending" && t.suggested_category,
    );

    // Optimistic
    setLocalTxs((prev) =>
      prev.map((t) =>
        (t.amount > 0 && t.review_status === "pending" && t.suggested_category)
          ? { ...t, review_status: "approved", category_key: t.suggested_category }
          : t,
      ),
    );

    // Persist all
    for (const tx of pending) {
      const catKey = selectedCats[tx.id] ?? tx.suggested_category!;
      await supabase.from("receipt_expenses").insert({
        user_id:      tx.user_id,
        expense_date: tx.transaction_date,
        category_key: catKey,
        total_amount: tx.amount,
        vendor_name:  tx.merchant_name ?? tx.description,
        notes:        "Imported from bank sync",
      });
      await supabase
        .from("plaid_transactions")
        .update({ review_status: "approved", category_key: catKey })
        .eq("id", tx.id);
    }
  }, [localTxs, selectedCats, supabase]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isPlaidSetup = plaidConfigured;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bank &amp; Card Sync</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your bank accounts to automatically import transactions as expenses.
          </p>
        </div>
        <PlaidLinkButton
          onSuccess={handlePlaidSuccess}
          onError={(msg) => setConnectErr(msg)}
          label="Connect Bank Account"
        />
      </div>

      {/* Error banner */}
      {connectErr && (
        <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{connectErr}</span>
          <button onClick={() => setConnectErr(null)} className="ml-auto text-red-500 hover:text-red-700">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Setup notice (Plaid not yet configured) ──────────────────────── */}
      {localItems.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Landmark className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-base">No bank accounts connected</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Connect your business bank account or credit card to automatically import
              transactions and categorise them as expenses.
            </p>
          </div>

          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-left text-sm text-amber-800 dark:text-amber-300 max-w-lg mx-auto">
            <div className="flex items-center gap-2 font-semibold mb-2">
              <Info className="h-4 w-4" />
              First-time setup — Plaid credentials required
            </div>
            <ol className="list-decimal list-inside space-y-1 text-amber-700 dark:text-amber-400">
              <li>Create a free account at <strong>dashboard.plaid.com</strong></li>
              <li>Go to <strong>Team → Keys</strong> and copy your Client ID &amp; Secret</li>
              <li>
                Add to <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">.env.local</code>:
                <pre className="mt-1 text-xs bg-amber-100 dark:bg-amber-900 rounded p-2 overflow-x-auto">
{`PLAID_CLIENT_ID=your_id_here
PLAID_SECRET=your_secret_here
PLAID_ENV=sandbox`}
                </pre>
              </li>
              <li>Restart the dev server, then also add these vars to Vercel → Environment Variables</li>
            </ol>
          </div>

          <PlaidLinkButton
            onSuccess={handlePlaidSuccess}
            onError={(msg) => setConnectErr(msg)}
            label="Connect Your First Account"
            variant="default"
            className="mx-auto"
          />
        </div>
      )}

      {/* ── Connected accounts ───────────────────────────────────────────── */}
      {localItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Connected Accounts</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {localItems.map((item) => {
              const txCount = localTxs.filter((t) => t.plaid_item_id === item.id && t.amount > 0).length;
              const pendingN = localTxs.filter(
                (t) => t.plaid_item_id === item.id && t.amount > 0 && t.review_status === "pending",
              ).length;
              const isSyncing = syncingId === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-xl border bg-card p-4 space-y-3"
                >
                  {/* Bank name + icon */}
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Landmark className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {item.institution_name ?? "Bank Account"}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last synced: {fmtRelative(item.last_synced_at)}
                      </p>
                    </div>
                    {pendingN > 0 && (
                      <Badge className="ml-auto shrink-0 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0 text-xs">
                        {pendingN} pending
                      </Badge>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="text-xs text-muted-foreground">
                    {txCount} transaction{txCount !== 1 ? "s" : ""} imported
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSync(item.id)}
                      disabled={isSyncing}
                      className="flex-1 text-xs h-8"
                    >
                      {isSyncing
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Syncing…</>
                        : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sync Now</>}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect {item.institution_name ?? "this bank"}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the bank connection and all imported transactions
                            that have not been approved yet. Approved expenses already saved to your
                            expense tracker will not be affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDisconnect(item.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Transaction inbox ─────────────────────────────────────────────── */}
      {localItems.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                Transaction Inbox
                {pendingCount > 0 && (
                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0">
                    {pendingCount} pending
                  </Badge>
                )}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review imported bank transactions. Approve them to add to your expense tracker.
              </p>
            </div>

            {/* Approve all with suggestions */}
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
            <div className="rounded-xl border border-dashed border-border py-12 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">
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
                          {/* Date */}
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(tx.transaction_date)}
                          </td>

                          {/* Merchant */}
                          <td className="px-4 py-3 max-w-[220px]">
                            <p className="font-medium truncate text-sm">
                              {tx.merchant_name ?? tx.description}
                            </p>
                            {tx.merchant_name && tx.description !== tx.merchant_name && (
                              <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                            )}
                          </td>

                          {/* Amount */}
                          <td className="px-4 py-3 text-right font-mono font-semibold text-sm whitespace-nowrap">
                            {fmtCurrency(tx.amount)}
                          </td>

                          {/* Category dropdown */}
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

                          {/* Status badge */}
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

                          {/* Actions */}
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

              {/* Footer */}
              <div className="border-t px-4 py-2.5 text-xs text-muted-foreground bg-muted/20 flex items-center justify-between">
                <span>
                  Showing {filteredTxs.length} transaction{filteredTxs.length !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                  <ChevronDown className="h-3.5 w-3.5" />
                  Approved transactions appear in your Expenses tracker
                </span>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
