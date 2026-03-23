"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { fmtCurrency } from "@/lib/formatters";
import { computeEstimatedGCI } from "@/lib/types/database";
import type { PipelineDeal } from "@/lib/types/database";
import {
  CalendarCheck,
  Clock,
  Moon,
  Home,
  User,
  TrendingUp,
  DollarSign,
  BadgePercent,
  StickyNote,
} from "lucide-react";

// ── localStorage helpers ──────────────────────────────────────────────────────

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDismissed(dealId: string): boolean {
  try {
    return localStorage.getItem(`closing_prompt_dismissed_${localToday()}_${dealId}`) === "1";
  } catch { return false; }
}

function markDismissed(dealId: string) {
  try {
    localStorage.setItem(`closing_prompt_dismissed_${localToday()}_${dealId}`, "1");
  } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  } catch { return iso; }
}

function sideLabel(side: string): string {
  return side === "buyer" ? "Buyer" : side === "seller" ? "Seller" : "Buyer & Seller";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  dealsClosingToday: PipelineDeal[];
}

export function ClosingDayPrompt({ dealsClosingToday }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<PipelineDeal[]>([]);
  const [mode, setMode] = useState<"main" | "delayed">("main");
  const [newDate, setNewDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const pending = dealsClosingToday.filter((d) => !isDismissed(d.id));
    if (pending.length === 0) return;
    setQueue(pending);
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [dealsClosingToday]);

  const current = queue[0] ?? null;

  function advance() {
    if (!current) return;
    markDismissed(current.id);
    const remaining = queue.slice(1);
    setMode("main");
    setNewDate("");
    if (remaining.length > 0) {
      setQueue(remaining);
    } else {
      setOpen(false);
      setQueue([]);
    }
  }

  function handleRegister() {
    advance();
    router.push("/transactions?tab=pipeline");
  }

  function handleTomorrow() {
    advance();
    // Dismissed for today — naturally reappears tomorrow when localToday() changes
  }

  async function handleSaveDelay() {
    if (!current || !newDate) return;
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("pipeline_deals")
      .update({ expected_close_date: newDate, updated_at: new Date().toISOString() })
      .eq("id", current.id);
    setSaving(false);
    advance();
  }

  if (!open || !current) return null;

  const gci = computeEstimatedGCI(current);

  // Portal renders directly into document.body, bypassing any CSS transform
  // stacking contexts (e.g. .page-enter animation) that break fixed positioning.
  return createPortal(
    <>
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-[9990] bg-black/60 backdrop-blur-sm"
        style={{ animation: "fadeIn 0.2s ease-out forwards" }}
      />

      {/* ── Modal ────────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 z-[9991] flex items-center justify-center p-4"
        style={{ animation: "scaleIn 0.25s ease-out forwards" }}
      >
        <style>{`
          @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
          @keyframes scaleIn { from { opacity: 0; transform: scale(0.94) } to { opacity: 1; transform: scale(1) } }
        `}</style>

        <div className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl bg-card border border-border/60">

          {/* ── Hero ───────────────────────────────────────────────────────── */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 px-6 py-7 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -left-6 bottom-0 h-28 w-28 rounded-full bg-white/10" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">🏡</span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-100">
                    Closing Day
                  </p>
                  <p className="text-[11px] text-emerald-200">
                    {formatDate(localToday())}
                  </p>
                </div>
                {queue.length > 1 && (
                  <span className="ml-auto inline-flex items-center justify-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">
                    {queue.length} deals
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-extrabold leading-tight">
                {current.address || "Your deal"}
              </h2>
              {current.client_name && (
                <p className="mt-1 text-sm text-emerald-100 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  {current.client_name}
                </p>
              )}
            </div>
          </div>

          {/* ── Deal Summary ───────────────────────────────────────────────── */}
          <div className="px-6 py-5 space-y-4">

            {/* KPI row */}
            <div className="grid grid-cols-3 gap-2">
              <SummaryKPI
                icon={<Home className="h-4 w-4" />}
                label="Side"
                value={sideLabel(current.side)}
                color="blue"
              />
              <SummaryKPI
                icon={<DollarSign className="h-4 w-4" />}
                label="Est. Price"
                value={fmtCurrency(current.estimated_price)}
                color="purple"
              />
              <SummaryKPI
                icon={<TrendingUp className="h-4 w-4" />}
                label="Est. GCI"
                value={fmtCurrency(gci)}
                color="emerald"
              />
            </div>

            {/* Detail rows */}
            <div className="rounded-xl bg-muted/50 divide-y divide-border/50 text-sm">
              <DetailRow
                icon={<BadgePercent className="h-3.5 w-3.5 text-muted-foreground" />}
                label="Commission"
                value={`${(current.estimated_commission_pct * 100).toFixed(2)}%`}
              />
              <DetailRow
                icon={<CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />}
                label="Scheduled Close"
                value={current.expected_close_date ? formatDate(current.expected_close_date) : "—"}
              />
              {current.notes && (
                <DetailRow
                  icon={<StickyNote className="h-3.5 w-3.5 text-muted-foreground" />}
                  label="Notes"
                  value={current.notes}
                />
              )}
            </div>

            {/* ── Actions ──────────────────────────────────────────────────── */}
            {mode === "main" ? (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  What&apos;s the status?
                </p>

                {/* Close it */}
                <Button
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm gap-2"
                  onClick={handleRegister}
                >
                  <CalendarCheck className="h-4 w-4" />
                  Yes — it&apos;s closed! 🎉
                </Button>

                {/* Delayed */}
                <Button
                  variant="outline"
                  className="w-full h-10 border-amber-300 text-amber-700 hover:bg-amber-50 text-sm gap-2"
                  onClick={() => {
                    setMode("delayed");
                    setNewDate(current.expected_close_date ?? "");
                  }}
                >
                  <Clock className="h-4 w-4" />
                  It&apos;s been delayed — update date
                </Button>

                {/* Tomorrow */}
                <Button
                  variant="ghost"
                  className="w-full h-9 text-muted-foreground hover:text-foreground text-xs gap-1.5"
                  onClick={handleTomorrow}
                >
                  <Moon className="h-3.5 w-3.5" />
                  Check back tomorrow morning
                </Button>
              </div>
            ) : (
              /* ── Delayed mode ─────────────────────────────────────────────── */
              <div className="space-y-3 pt-1">
                <p className="text-sm font-medium">When is the new closing date?</p>
                <div className="grid gap-1.5">
                  <Label htmlFor="new-close-date" className="text-xs text-muted-foreground">
                    New Expected Close Date
                  </Label>
                  <Input
                    id="new-close-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    min={localToday()}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1 text-sm"
                    onClick={() => setMode("main")}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm"
                    onClick={handleSaveDelay}
                    disabled={!newDate || saving}
                  >
                    {saving ? "Saving…" : "Update Date"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryKPI({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "blue" | "purple" | "emerald";
}) {
  const colors = {
    blue:    "bg-blue-50 border-blue-200 text-blue-700",
    purple:  "bg-purple-50 border-purple-200 text-purple-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-center ${colors[color]}`}>
      <div className="flex justify-center mb-1 opacity-70">{icon}</div>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xs font-bold mt-0.5 truncate">{value}</p>
    </div>
  );
}

function DetailRow({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="text-xs text-foreground font-medium flex-1 text-right">{value}</span>
    </div>
  );
}
