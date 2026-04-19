"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { validateTransaction, FIELD_LIMITS } from "@agent-runway/core/validation/input-guards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
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
import { Plus, Pencil, Trash2, DollarSign, Briefcase, TrendingUp, AlertTriangle, Users, Layers, History, ArrowUp, ArrowDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { fmtCurrency } from "@/lib/formatters";
import { computeGCI, getAgentPct, type Transaction, type PipelineDeal, type HistoryItem, type UserSettings } from "@/lib/types/database";
import { TransactionsPipelineTab } from "./transactions-pipeline-tab";
import { TransactionsHistoryTab } from "./transactions-history-tab";
import { useVoiceDraft } from "@/lib/voice/voice-draft-context";
import type { VoiceDraft } from "@/lib/voice/types";

interface Props {
  initialTransactions: Transaction[];
  initialPipelineDeals: PipelineDeal[];
  historyItems: HistoryItem[];
  settingsSplit: number | null;
  settings: UserSettings | null;
  initialTab?: string;
}

type FormState = {
  date: string;
  address: string;
  client_name: string;
  side: "buyer" | "seller" | "both";
  status: "closed" | "pending" | "fallen";
  sale_price: string;
  commission_pct: string;
  gci_override: string;
  notes: string;
  // Team / referral split
  has_team_split: boolean;
  team_split_pct: string; // display percentage, e.g. "60" = 60%
};

/** Local-timezone date string (avoids UTC date-shift at night) */
function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const emptyForm = (): FormState => ({
  date: localDateStr(),
  address: "",
  client_name: "",
  side: "buyer",
  status: "closed",
  sale_price: "",
  commission_pct: "2.5",
  gci_override: "",
  notes: "",
  has_team_split: false,
  team_split_pct: "60",
});

const STATUS_CHIP: Record<string, string> = {
  closed:  "bg-emerald-100 text-emerald-800 border border-emerald-200",
  pending: "bg-amber-100 text-amber-800 border border-amber-200",
  fallen:  "bg-red-100 text-red-800 border border-red-200",
};

const SIDE_CHIP: Record<string, string> = {
  buyer:  "bg-blue-100 text-blue-800 border border-blue-200",
  seller: "bg-purple-100 text-purple-800 border border-purple-200",
  both:   "bg-teal-100 text-teal-800 border border-teal-200",
};

export function TransactionsContent({ initialTransactions, initialPipelineDeals, historyItems, settingsSplit, settings, initialTab }: Props) {
  const [tab, setTab] = useState<"deals" | "pipeline" | "history">(
    initialTab === "history" ? "history" : initialTab === "pipeline" ? "pipeline" : "deals",
  );
  const [transactions, setTransactions] = useState(initialTransactions);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const deletingRef = useRef(false);
  const [filter, setFilter] = useState<"all" | "closed" | "pending" | "fallen">("all");
  const [yearFilter, setYearFilter] = useState<"all" | number>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");

  // ── Voice draft consumption ──────────────────────────────────────────────
  const [voiceDraft, setVoiceDraftLocal] = useState<VoiceDraft | null>(null);
  const [voiceBanner, setVoiceBanner] = useState(false);
  const { consume } = useVoiceDraft();

  useEffect(() => {
    const draft = consume();
    if (!draft || draft.intent !== "new_transaction") return;
    const tx = draft.transaction;
    setForm({
      ...emptyForm(),
      date: tx.date ?? emptyForm().date,
      address: tx.address ?? "",
      client_name: tx.client_name ?? "",
      side: tx.side ?? "buyer",
      status: tx.status ?? "closed",
      sale_price: tx.sale_price ? String(tx.sale_price) : "",
      commission_pct: tx.commission_pct ? String(tx.commission_pct * 100) : "2.5",
      gci_override: tx.gci ? String(tx.gci) : "",
      notes: tx.notes ?? "",
      has_team_split: false,
      team_split_pct: "60",
    });
    setVoiceDraftLocal(draft);
    setVoiceBanner(true);
    setTab("deals");
    setEditingId(null);
    setDialogOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const voiceFilledFields = useMemo(() => {
    if (!voiceBanner || !voiceDraft || voiceDraft.intent !== "new_transaction") return new Set<string>();
    const s = new Set<string>();
    const tx = voiceDraft.transaction;
    if (tx.date)           s.add("date");
    if (tx.address)        s.add("address");
    if (tx.client_name)    s.add("client_name");
    if (tx.side)           s.add("side");
    if (tx.status)         s.add("status");
    if (tx.sale_price)     s.add("sale_price");
    if (tx.commission_pct) s.add("commission_pct");
    if (tx.gci)            s.add("gci_override");
    if (tx.notes)          s.add("notes");
    return s;
  }, [voiceBanner, voiceDraft]);

  const voiceTint = (field: string) =>
    voiceFilledFields.has(field) ? "bg-amber-50/60 border-amber-200/80" : "";

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(tx: Transaction) {
    setEditingId(tx.id);
    setForm({
      date: tx.date,
      address: tx.address ?? "",
      client_name: tx.client_name ?? "",
      side: tx.side,
      status: tx.status,
      sale_price: tx.sale_price ? String(tx.sale_price) : "",
      commission_pct: tx.commission_pct ? String(tx.commission_pct * 100) : "2.5",
      gci_override: tx.gci_override ? String(tx.gci_override) : "",
      notes: tx.notes ?? "",
      has_team_split: tx.team_split_pct != null,
      team_split_pct: tx.team_split_pct != null ? String(Math.round(tx.team_split_pct * 100)) : "60",
    });
    setDialogOpen(true);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { savingRef.current = false; setSaving(false); return; }

    // ── Validate all numeric fields before writing ──────────────────────────
    const validation = validateTransaction({
      sale_price: form.sale_price,
      commission_pct: form.commission_pct,
      gci_override: form.gci_override || undefined,
      team_split_pct: form.has_team_split ? form.team_split_pct : null,
      has_team_split: form.has_team_split,
      address: form.address,
      notes: form.notes,
    });
    if (!validation.valid || !validation.parsed) {
      validation.errors.forEach((msg) => toast.error(msg));
      savingRef.current = false;
      setSaving(false);
      return;
    }
    const { parsed } = validation;

    const payload = {
      date: form.date,
      address: form.address.slice(0, FIELD_LIMITS.address),
      client_name: form.client_name.slice(0, FIELD_LIMITS.clientName),
      side: form.side,
      status: form.status,
      sale_price: parsed.sale_price,
      commission_pct: parsed.commission_pct,
      gci_override: parsed.gci_override,
      notes: form.notes.slice(0, FIELD_LIMITS.notes),
      team_split_pct: parsed.team_split_pct,
    };

    let failed = false;
    if (editingId) {
      // Stamp edited_at so a future re-import won't overwrite this manual edit.
      const { data, error } = await supabase
        .from("transactions")
        .update({ ...payload, edited_at: new Date().toISOString() })
        .eq("id", editingId)
        .eq("user_id", user.id)
        .select()
        .single();
      if (!error && data) {
        setTransactions((prev) =>
          prev.map((t) => (t.id === editingId ? data : t))
            .sort((a, b) => b.date.localeCompare(a.date)),
        );
        toast.success("Updated. Clean records win deals. ✓");
      } else if (error) {
        failed = true;
        const detail = error.code === "23514" ? "Value out of allowed range" : "Something went wrong. Please try again.";
        toast.error(`Couldn't update transaction: ${detail}`);
      }
    } else {
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (!error && data) {
        setTransactions((prev) =>
          [data, ...prev].sort((a, b) => b.date.localeCompare(a.date)),
        );
        toast.success("Deal locked in. 🎉", {
          description: form.address ? `${form.address} added to your record.` : undefined,
        });
      } else if (error) {
        failed = true;
        const detail = error.code === "23514" ? "Value out of allowed range" : "Something went wrong. Please try again.";
        toast.error(`Couldn't save transaction: ${detail}`);
      }
    }

    savingRef.current = false;
    setSaving(false);
    if (!failed) setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    if (deletingRef.current) return;
    deletingRef.current = true;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { deletingRef.current = false; return; }
    const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", user.id);
    if (!error) {
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      toast("Deal removed", { description: "Your numbers have been updated." });
    } else {
      toast.error("Couldn't delete — try again");
    }
    setDeleteConfirmId(null);
    deletingRef.current = false;
  }

  // Compare year strings directly to avoid UTC-vs-local-timezone mismatch
  const currentYear = String(new Date().getFullYear());
  const ytdCount = transactions.filter(
    (t) => t.status === "closed" && t.date.startsWith(currentYear),
  ).length;
  const ytdGCI = transactions
    .filter((t) => t.status === "closed" && t.date.startsWith(currentYear))
    .reduce((sum, t) => sum + computeGCI(t), 0);

  // Available years for the year filter — derived from data
  const availableYears = [...new Set(
    transactions.map((t) => parseInt(t.date.slice(0, 4))).filter(Boolean)
  )].sort((a, b) => b - a);

  // Filtered + sorted view
  const visibleTransactions = transactions
    .filter((t) => filter === "all" || t.status === filter)
    .filter((t) => yearFilter === "all" || t.date.startsWith(String(yearFilter)))
    .sort((a, b) => {
      if (sortBy === "oldest") return a.date.localeCompare(b.date);
      if (sortBy === "highest") return computeGCI(b) - computeGCI(a);
      if (sortBy === "lowest") return computeGCI(a) - computeGCI(b);
      return b.date.localeCompare(a.date); // newest
    });

  const FILTERS: { value: typeof filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "closed", label: "Closed" },
    { value: "pending", label: "Pending" },
    { value: "fallen", label: "Fallen" },
  ];

  const avgDealSize = ytdCount > 0 ? ytdGCI / ytdCount : 0;

  // ── Insights ─────────────────────────────────────────────────────────────
  // Agent's brokerage split percentage (for "your cut" sub-label)
  const agentPct = settings?.split_preset ? getAgentPct(settings.split_preset) : null;

  // Closing velocity: last 30 days vs prior 30 days
  const _now = new Date();
  const _ms30 = 30 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = new Date(_now.getTime() - _ms30);
  const sixtyDaysAgo = new Date(_now.getTime() - 2 * _ms30);
  const last30Deals = transactions.filter((t) => {
    const d = new Date(t.date + "T12:00:00");
    return t.status === "closed" && d >= thirtyDaysAgo && d <= _now;
  }).length;
  const prior30Deals = transactions.filter((t) => {
    const d = new Date(t.date + "T12:00:00");
    return t.status === "closed" && d >= sixtyDaysAgo && d < thirtyDaysAgo;
  }).length;

  // YTD business mix
  const ytdClosed = transactions.filter((t) => t.status === "closed" && t.date.startsWith(currentYear));
  const buyerCount  = ytdClosed.filter((t) => t.side === "buyer").length;
  const sellerCount = ytdClosed.filter((t) => t.side === "seller").length;
  const bothCount   = ytdClosed.filter((t) => t.side === "both").length;
  // Insight: flag if ≥65% buyer-side with ≥3 deals — listings typically net more per deal
  const showListingInsight = ytdCount >= 3 && buyerCount / ytdCount >= 0.65;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "deals"
              ? ytdCount > 0
                ? <>{ytdCount} closed deal{ytdCount !== 1 ? "s" : ""} this year &middot; {fmtCurrency(ytdGCI)} GCI</>
                : "Log your first deal. Your GCI won't track itself."
              : tab === "pipeline"
                ? "Track deals in progress before they close."
                : "Year-by-year production history and seasonal patterns."}
          </p>
        </div>
        {tab === "deals" && (
          <Button onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" />
            Add Deal
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex rounded-lg border border-border p-0.5 text-sm w-fit">
        <button
          onClick={() => setTab("deals")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-1.5 font-medium transition-colors",
            tab === "deals"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Briefcase className="h-3.5 w-3.5" />
          Deals
        </button>
        <button
          onClick={() => setTab("pipeline")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-1.5 font-medium transition-colors",
            tab === "pipeline"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          Pipeline
        </button>
        <button
          onClick={() => setTab("history")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-4 py-1.5 font-medium transition-colors",
            tab === "history"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <History className="h-3.5 w-3.5" />
          History
        </button>
      </div>

      {/* Pipeline tab */}
      {tab === "pipeline" && (
        <TransactionsPipelineTab
          pipelineDeals={initialPipelineDeals}
          settings={settings}
          closedTransactions={transactions
            .filter((t) => t.status === "closed")
            .map((t) => ({ sale_price: t.sale_price, commission_pct: t.commission_pct, date: t.date }))}
        />
      )}

      {/* History tab */}
      {tab === "history" && (
        <TransactionsHistoryTab
          historyItems={historyItems}
          transactions={initialTransactions.filter((t) => t.status === "closed")}
          settingsSplit={settingsSplit}
          settings={settings}
        />
      )}

      {/* Deals tab content — hidden when pipeline is active */}
      {tab === "deals" && <>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 shadow-sm">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-200">
            <DollarSign className="h-4 w-4 text-emerald-700" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">YTD GCI</p>
            <p className="text-lg font-bold text-slate-800">{fmtCurrency(ytdGCI)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 shadow-sm">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-200">
            <Briefcase className="h-4 w-4 text-blue-700" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Closed Deals</p>
            <p className="text-lg font-bold text-slate-800">{ytdCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-3 shadow-sm">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-200">
            <TrendingUp className="h-4 w-4 text-purple-700" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">Avg Deal Size</p>
            <p className="text-lg font-bold text-slate-800">{ytdCount > 0 ? fmtCurrency(avgDealSize) : "—"}</p>
          </div>
        </div>
      </div>

      {/* Insight strip — velocity, mix, avg take-home */}
      {transactions.length >= 2 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm">
          {/* Closing velocity */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last 30 d</span>
            <span className="font-semibold text-slate-800">{last30Deals} deal{last30Deals !== 1 ? "s" : ""}</span>
            {last30Deals > prior30Deals && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
                <ArrowUp className="h-3 w-3" />vs prior
              </span>
            )}
            {last30Deals < prior30Deals && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-rose-500">
                <ArrowDown className="h-3 w-3" />vs prior
              </span>
            )}
          </div>
          {ytdCount >= 1 && (
            <>
              <div className="hidden h-4 w-px bg-slate-200 sm:block" />
              {/* Business mix */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mix</span>
                <span className="font-medium text-slate-700">
                  {buyerCount} buyer &middot; {sellerCount} listing &middot; {bothCount} dual
                </span>
                {showListingInsight && (
                  <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Add listings — typically 1.5–2× net per deal
                  </span>
                )}
              </div>
            </>
          )}
          {agentPct !== null && ytdCount >= 1 && (
            <>
              <div className="hidden h-4 w-px bg-slate-200 sm:block" />
              {/* Avg take-home after brokerage split */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Avg take-home</span>
                <span className="font-semibold text-emerald-700">{fmtCurrency((ytdGCI * agentPct) / ytdCount)}</span>
                <span className="text-xs text-slate-400">/ deal after split</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filter + Sort bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filter pills */}
        <div className="flex rounded-lg border border-border p-0.5 text-xs">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Right controls: year filter + sort */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {availableYears.length > 1 && (
            <Select
              value={String(yearFilter)}
              onValueChange={(v) => setYearFilter(v === "all" ? "all" : parseInt(v))}
            >
              <SelectTrigger className="h-8 w-20 text-xs sm:w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span>Sort:</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-8 w-28 text-xs sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="highest">Highest GCI</SelectItem>
              <SelectItem value="lowest">Lowest GCI</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Briefcase className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground max-w-md">
                No closed deals yet. Every top producer has a day one.
              </p>
            </div>
          ) : visibleTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Briefcase className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground max-w-md">
                No {filter} deals in the books. Yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">GCI</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      <div className="flex flex-col gap-0.5">
                        <span>{tx.date}</span>
                        {tx.source === "imported" && (
                          <span className="inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            imported
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.address || <span className="text-muted-foreground">&mdash;</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        {tx.client_name || <span className="text-muted-foreground">&mdash;</span>}
                        {tx.source === "imported" && !tx.client_name && (
                          <span title="Client name missing — click edit to complete">
                            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", SIDE_CHIP[tx.side] ?? "bg-slate-100 text-slate-700 border border-slate-200")}>
                        {tx.side}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", STATUS_CHIP[tx.status] ?? "bg-slate-100 text-slate-700 border border-slate-200")}>
                        {tx.status}
                      </span>
                    </TableCell>
                    <TableCell className={cn("text-right font-semibold", tx.status === "closed" ? "text-emerald-700" : tx.status === "pending" ? "text-amber-700" : "text-slate-400")}>
                      <div className="flex flex-col items-end gap-0.5">
                        <span>{fmtCurrency(computeGCI(tx))}</span>
                        {tx.team_split_pct != null && (
                          <span className="text-[10px] font-normal text-amber-600 flex items-center gap-0.5">
                            <Users className="h-2.5 w-2.5" />
                            {Math.round(tx.team_split_pct * 100)}% split
                          </span>
                        )}
                        {agentPct !== null && tx.status === "closed" && (
                          <span className="text-[10px] font-normal text-slate-400">
                            {fmtCurrency(computeGCI(tx) * agentPct)} your cut
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {deleteConfirmId === tx.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 px-3 text-xs"
                            onClick={() => handleDelete(tx.id)}
                          >
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-3 text-xs"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEdit(tx)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteConfirmId(tx.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Deal" : "Add Deal"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Voice pre-fill banner */}
            {voiceBanner && !editingId && (
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

            {/* Row: Date + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField("date", e.target.value)}
                  className={voiceTint("date")}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Status *</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v as FormState["status"])}>
                  <SelectTrigger className={voiceTint("status")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="fallen">Fallen Through</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Past/future year warning */}
            {form.date && new Date(form.date + "T12:00:00").getFullYear() !== new Date().getFullYear() && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This date is in <strong>{new Date(form.date + "T12:00:00").getFullYear()}</strong> — it will count toward that year&apos;s history, not your {new Date().getFullYear()} YTD.
                </span>
              </div>
            )}

            {/* Address */}
            <div className="grid gap-1.5">
              <Label>Address</Label>
              <Input
                placeholder="123 Main St, Toronto"
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                className={voiceTint("address")}
              />
            </div>

            {/* Row: Client + Side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Client Name</Label>
                <Input
                  placeholder="Jane Smith"
                  value={form.client_name}
                  onChange={(e) => setField("client_name", e.target.value)}
                  className={voiceTint("client_name")}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Side *</Label>
                <Select value={form.side} onValueChange={(v) => setField("side", v as FormState["side"])}>
                  <SelectTrigger className={voiceTint("side")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row: Sale Price + Commission % */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Sale Price ($) *</Label>
                <Input
                  type="number"
                  placeholder="500000"
                  value={form.sale_price}
                  onChange={(e) => setField("sale_price", e.target.value)}
                  className={voiceTint("sale_price")}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Commission % *</Label>
                <Input
                  type="number"
                  step="0.25"
                  placeholder="2.5"
                  value={form.commission_pct}
                  onChange={(e) => setField("commission_pct", e.target.value)}
                  className={voiceTint("commission_pct")}
                />
              </div>
            </div>

            {/* GCI Override */}
            <div className="grid gap-1.5">
              <Label>
                GCI Override ($){" "}
                <span className="text-xs text-muted-foreground">
                  — leave blank to calculate from price × commission
                </span>
              </Label>
              <Input
                type="number"
                placeholder="e.g. 12500"
                value={form.gci_override}
                onChange={(e) => setField("gci_override", e.target.value)}
                className={voiceTint("gci_override")}
              />
            </div>

            {/* Team / Referral Split */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  Team / Referral Split
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {form.has_team_split ? "On" : "Off"}
                  </span>
                  <Switch
                    checked={form.has_team_split}
                    onCheckedChange={(checked) => setField("has_team_split", checked)}
                  />
                </div>
              </div>
              {form.has_team_split && (
                <div className="grid gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <Label className="text-xs text-amber-800">
                    Your share of this deal&apos;s commission (%)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="99"
                      step="1"
                      placeholder="60"
                      className="w-28 bg-white"
                      value={form.team_split_pct}
                      onChange={(e) => setField("team_split_pct", e.target.value)}
                    />
                    <span className="text-sm text-amber-700">
                      % &mdash; team member gets{" "}
                      {(100 - (parseFloat(form.team_split_pct) || 0)).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700/80">
                    Applied before your brokerage split. E.g. 60% means you keep 60 of every 100 earned on this deal.
                  </p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes..."
                rows={2}
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                className={voiceTint("notes")}
              />
            </div>

            {/* Preview GCI */}
            <p className="text-sm text-muted-foreground">
              GCI:{" "}
              <span className="font-medium text-foreground">
                {form.gci_override
                  ? fmtCurrency(parseFloat(form.gci_override) || 0)
                  : (() => {
                      const raw =
                        (parseFloat(form.sale_price) || 0) *
                        ((parseFloat(form.commission_pct) || 0) / 100);
                      const withSplit = form.has_team_split
                        ? raw * ((parseFloat(form.team_split_pct) || 0) / 100)
                        : raw;
                      return fmtCurrency(withSplit);
                    })()}
              </span>
              {form.has_team_split && !form.gci_override && (
                <span className="ml-2 text-xs text-amber-600">
                  (your {form.team_split_pct}% share of{" "}
                  {fmtCurrency(
                    (parseFloat(form.sale_price) || 0) *
                      ((parseFloat(form.commission_pct) || 0) / 100),
                  )}
                  )
                </span>
              )}
            </p>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Deal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </>}
    </div>
  );
}
