"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Lock, Unlock, Plus, ChevronDown, ChevronRight, Info } from "lucide-react";
import { fmtCurrency } from "@/lib/formatters";
import { computeGCI, type HistoryItem, type Transaction } from "@/lib/types/database";
import { cn } from "@/lib/utils";

interface Props {
  historyItems: HistoryItem[];
  transactions: Transaction[];
}

// Per-quarter colour config
const QUARTER_STYLES = [
  { label: "Q1", border: "border-blue-200",   bg: "bg-blue-50",   heading: "text-blue-700",   ring: "focus-visible:ring-blue-400"   },
  { label: "Q2", border: "border-amber-200",  bg: "bg-amber-50",  heading: "text-amber-700",  ring: "focus-visible:ring-amber-400"  },
  { label: "Q3", border: "border-emerald-200",bg: "bg-emerald-50",heading: "text-emerald-700",ring: "focus-visible:ring-emerald-400" },
  { label: "Q4", border: "border-violet-200", bg: "bg-violet-50", heading: "text-violet-700", ring: "focus-visible:ring-violet-400"  },
];

export function HistoryContent({ historyItems: initial, transactions }: Props) {
  const [items, setItems] = useState(initial);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addYear, setAddYear] = useState(new Date().getFullYear() - 1);
  const [addGCI, setAddGCI] = useState("");
  const [addTx, setAddTx] = useState("");
  // Track which item+field is currently saving (for subtle feedback)
  const [saving, setSaving] = useState<string | null>(null);

  // Group transactions by year for auto-derived stats
  const txByYear = transactions.reduce<Record<number, Transaction[]>>(
    (acc, tx) => {
      const y = new Date(tx.date).getFullYear();
      (acc[y] ??= []).push(tx);
      return acc;
    },
    {},
  );

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function toggleLock(item: HistoryItem) {
    const supabase = createClient();
    const { error } = await supabase
      .from("history_items")
      .update({ is_locked: !item.is_locked })
      .eq("id", item.id);
    if (!error) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, is_locked: !i.is_locked } : i,
        ),
      );
      toast(item.is_locked ? "Year unlocked ✓" : "Year locked 🔒");
    }
  }

  // ── Inline edit helpers ──────────────────────────────────────────────────

  async function updateAnnualGCI(item: HistoryItem, value: string) {
    const num = parseFloat(value) || 0;
    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, annual_gci: num } : i));
    setSaving(`${item.id}-annual_gci`);
    const supabase = createClient();
    await supabase.from("history_items").update({ annual_gci: num }).eq("id", item.id);
    setSaving(null);
  }

  async function updateAnnualTx(item: HistoryItem, value: string) {
    const num = parseInt(value) || 0;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, annual_tx: num } : i));
    setSaving(`${item.id}-annual_tx`);
    const supabase = createClient();
    await supabase.from("history_items").update({ annual_tx: num }).eq("id", item.id);
    setSaving(null);
  }

  async function updateQuarterGCI(item: HistoryItem, qi: number, value: string) {
    const num = parseFloat(value) || 0;
    const newArr = [...(item.quarter_gci as number[])];
    newArr[qi] = num;
    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, quarter_gci: newArr } : i));
    setSaving(`${item.id}-qgci-${qi}`);
    const supabase = createClient();
    await supabase.from("history_items").update({ quarter_gci: newArr }).eq("id", item.id);
    setSaving(null);
  }

  async function updateQuarterTx(item: HistoryItem, qi: number, value: string) {
    const num = parseInt(value) || 0;
    const newArr = [...(item.quarter_tx as number[])];
    newArr[qi] = num;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, quarter_tx: newArr } : i));
    setSaving(`${item.id}-qtx-${qi}`);
    const supabase = createClient();
    await supabase.from("history_items").update({ quarter_tx: newArr }).eq("id", item.id);
    setSaving(null);
  }

  async function handleAddYear() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("history_items")
      .insert({
        user_id: user.id,
        year: addYear,
        annual_gci: parseFloat(addGCI) || 0,
        annual_tx: parseInt(addTx) || 0,
        quarter_gci: [0, 0, 0, 0],
        quarter_tx: [0, 0, 0, 0],
      })
      .select()
      .single();

    if (!error && data) {
      setItems((prev) => [data, ...prev].sort((a, b) => b.year - a.year));
      setAddOpen(false);
      setAddGCI("");
      setAddTx("");
      // Auto-expand the new year so user can enter quarterly data immediately
      setExpanded((prev) => new Set([...prev, data.id]));
      toast.success(`${addYear} history added ✓`);
    } else if (error) {
      toast.error("Couldn't add year — please try again.");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">
            Your track record — where you&apos;ve been shapes where you&apos;re going.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add Year
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add History Year</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                Enter your annual totals here. After saving, expand the year card to fill in quarterly breakdowns — quarterly data powers the seasonality engine.
              </p>
              <div className="grid gap-2">
                <Label>Year</Label>
                <Input
                  type="number"
                  value={addYear}
                  onChange={(e) => setAddYear(parseInt(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Annual GCI ($)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={addGCI}
                  onChange={(e) => setAddGCI(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Total Transactions</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={addTx}
                  onChange={(e) => setAddTx(e.target.value)}
                />
              </div>
              <Button onClick={handleAddYear}>Save &amp; Add Quarterly Data</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            No history years yet. Add your first year to improve projections.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const isOpen = expanded.has(item.id);
            const yearTx = txByYear[item.year] ?? [];
            const derivedGCI = yearTx.reduce((sum, tx) => sum + computeGCI(tx), 0);

            // Quarter sums for comparison
            const quarterGCI = item.quarter_gci as number[];
            const quarterTx = item.quarter_tx as number[];
            const quarterGCISum = quarterGCI.reduce((s, v) => s + (v ?? 0), 0);
            const quarterTxSum = quarterTx.reduce((s, v) => s + (v ?? 0), 0);
            const hasQuarterData = quarterGCISum > 0 || quarterTxSum > 0;

            // Cycle through accent colors for each year
            const accentBorders = [
              "border-l-blue-500",
              "border-l-violet-500",
              "border-l-emerald-500",
              "border-l-amber-500",
              "border-l-teal-500",
              "border-l-rose-500",
            ];
            const accentBorder = accentBorders[idx % accentBorders.length];

            return (
              <Card key={item.id} className={`rounded-2xl border-l-4 shadow-sm transition-shadow hover:shadow-md ${accentBorder}`}>
                <CardHeader
                  className="cursor-pointer select-none"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <CardTitle className="text-lg font-bold">{item.year}</CardTitle>
                      {item.is_locked && (
                        <Badge variant="outline" className="text-xs">Locked</Badge>
                      )}
                      {!hasQuarterData && !item.is_locked && (
                        <Badge className="bg-amber-100 text-amber-700 text-xs border border-amber-200 hover:bg-amber-100">
                          No quarterly data
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-base font-bold text-slate-800">
                        {fmtCurrency(item.annual_gci)}
                      </span>
                      <span className="text-muted-foreground">
                        {item.annual_tx} deals
                      </span>
                    </div>
                  </div>
                </CardHeader>

                {isOpen && (
                  <CardContent className="space-y-5 pt-0" onClick={(e) => e.stopPropagation()}>

                    {/* ── Annual totals (editable) ─────────────────────────── */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Annual Totals
                      </p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Annual GCI ($)</Label>
                          <Input
                            type="number"
                            disabled={item.is_locked}
                            defaultValue={item.annual_gci || ""}
                            placeholder="0"
                            className={cn("h-9 text-sm font-semibold", saving === `${item.id}-annual_gci` && "opacity-60")}
                            onBlur={(e) => updateAnnualGCI(item, e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Annual Transactions</Label>
                          <Input
                            type="number"
                            disabled={item.is_locked}
                            defaultValue={item.annual_tx || ""}
                            placeholder="0"
                            className={cn("h-9 text-sm font-semibold", saving === `${item.id}-annual_tx` && "opacity-60")}
                            onBlur={(e) => updateAnnualTx(item, e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── Quarterly breakdown (editable) ───────────────────── */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Quarterly Breakdown
                        </p>
                        {quarterGCISum > 0 && Math.abs(quarterGCISum - item.annual_gci) > 100 && (
                          <span className="text-[11px] text-amber-600">
                            ∑Q = {fmtCurrency(quarterGCISum)} (differs from annual)
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {QUARTER_STYLES.map((qs, qi) => (
                          <div
                            key={qs.label}
                            className={cn(
                              "rounded-xl border p-3 space-y-2",
                              qs.border,
                              qs.bg,
                            )}
                          >
                            <p className={cn("text-xs font-bold uppercase tracking-wide", qs.heading)}>
                              {qs.label}
                            </p>
                            <div className="space-y-1.5">
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">GCI ($)</p>
                                <Input
                                  type="number"
                                  disabled={item.is_locked}
                                  defaultValue={(quarterGCI[qi] ?? 0) || ""}
                                  placeholder="0"
                                  className={cn(
                                    "h-8 text-sm bg-white/80",
                                    saving === `${item.id}-qgci-${qi}` && "opacity-60",
                                  )}
                                  onBlur={(e) => updateQuarterGCI(item, qi, e.target.value)}
                                />
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">Deals</p>
                                <Input
                                  type="number"
                                  disabled={item.is_locked}
                                  defaultValue={(quarterTx[qi] ?? 0) || ""}
                                  placeholder="0"
                                  className={cn(
                                    "h-8 text-sm bg-white/80",
                                    saving === `${item.id}-qtx-${qi}` && "opacity-60",
                                  )}
                                  onBlur={(e) => updateQuarterTx(item, qi, e.target.value)}
                                />
                              </div>
                            </div>
                            {/* Quarter summary */}
                            {(quarterGCI[qi] ?? 0) > 0 && (
                              <p className={cn("text-[10px] font-medium", qs.heading)}>
                                {fmtCurrency(quarterGCI[qi])}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Values auto-save on blur. Quarterly data is used to calibrate the seasonality engine for projections.
                      </p>
                    </div>

                    {/* ── Derived from live transactions ────────────────────── */}
                    {yearTx.length > 0 && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                        <p className="text-xs text-blue-700">
                          <span className="font-semibold">Live data:</span>{" "}
                          {yearTx.length} transactions in your log → {fmtCurrency(derivedGCI)} GCI
                        </p>
                      </div>
                    )}

                    {/* ── Lock / Unlock ─────────────────────────────────────── */}
                    <div className="flex items-center justify-between border-t border-border/40 pt-3">
                      <p className="text-xs text-muted-foreground">
                        {item.is_locked ? "Locked — data frozen for use in projections." : "Unlocked — you can edit all values."}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleLock(item)}
                      >
                        {item.is_locked ? (
                          <><Unlock className="mr-1 h-3 w-3" /> Unlock</>
                        ) : (
                          <><Lock className="mr-1 h-3 w-3" /> Lock</>
                        )}
                      </Button>
                    </div>

                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
