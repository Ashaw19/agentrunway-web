"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/count-up";
import { fmtCurrency } from "@/lib/formatters";
import { gstHstRate, gstHstLabel } from "@/lib/engines/canadian-tax-engine";
import { computeHSTCollected } from "@/lib/engines/hst-engine";
import { cn } from "@/lib/utils";
import {
  PartyPopper,
  Landmark,
  Percent,
  Sparkles,
  Copy,
  Check,
  Flame,
  Trophy,
  DollarSign,
  PiggyBank,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CelebrationData {
  address: string;
  clientName: string;
  gci: number;
  ytdGCIBefore: number;   // YTD GCI BEFORE this deal
  goalGCI: number;
  province: string;
  dealsThisMonth: number; // including this deal
  totalDealsThisYear: number; // including this deal
  estimatedMarginalRate: number; // 0–1 decimal
  /** Optional — when omitted, defaults to `true` for backward-compat (legacy behavior was to always show HST). */
  isGstHstRegistered?: boolean;
  /** Optional — when omitted, defaults to `false` for backward-compat. */
  brokerageWithholdsHst?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: CelebrationData;
}

// ── Motivational quotes ────────────────────────────────────────────────────────

const QUOTES = [
  "You didn't get into real estate to play it safe. Keep going.",
  "Every closed deal is proof that you outworked the doubt.",
  "This is what showing up every single day looks like.",
  "The market is always open for the agents who never close their eyes.",
  "Another one. That pipeline isn't going to fill itself — but you will.",
  "Champions adjust. Closers execute. You just did both.",
  "The best agents don't wait for the right market. They make the market right.",
  "Signed, sealed, delivered. Now do it again.",
  "Real estate is a people business. You clearly people-well.",
  "You built this deal from a first call. Don't forget that.",
];

function randomQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

// ── GCI milestone thresholds ──────────────────────────────────────────────────

const MILESTONES = [25_000, 50_000, 75_000, 100_000, 150_000, 200_000, 250_000, 300_000, 500_000];

function getMilestone(before: number, after: number): number | null {
  for (const m of MILESTONES) {
    if (before < m && after >= m) return m;
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DealCloseCelebration({ open, onClose, data }: Props) {
  const {
    address,
    clientName,
    gci,
    ytdGCIBefore,
    goalGCI,
    province,
    dealsThisMonth,
    totalDealsThisYear,
    estimatedMarginalRate,
    isGstHstRegistered = true,
    brokerageWithholdsHst = false,
  } = data;

  const [quote] = useState(randomQuote);
  const [copied, setCopied] = useState(false);

  // Financial allocations
  // D-4 fix (Audit 1 2026-04-22): canonical HST helper. Returns 0 when the
  // agent isn't registered OR the brokerage handles HST remittance.
  const salesTaxRate = gstHstRate(province || "ontario");
  const salesTaxLabel = gstHstLabel(province || "ontario");
  const salesTaxAmount  = Math.round(
    computeHSTCollected({
      ytdGCI: gci,
      hstRate: salesTaxRate,
      isRegistered: isGstHstRegistered,
      brokerageWithholdsHst,
    }),
  );
  const taxReserve      = Math.round(gci * estimatedMarginalRate);
  const funMoney        = Math.round(gci * 0.10);
  const keepAndInvest   = Math.max(0, gci - taxReserve - funMoney);

  // Goal progress
  const ytdGCIAfter = ytdGCIBefore + gci;
  const goalPct = goalGCI > 0 ? Math.min(100, Math.round((ytdGCIAfter / goalGCI) * 100)) : 0;

  // Milestone crossed?
  const milestone = getMilestone(ytdGCIBefore, ytdGCIAfter);

  // Win streak label
  const streakLabel =
    totalDealsThisYear === 1
      ? "First deal of the year 🏅"
      : dealsThisMonth >= 3
      ? `${dealsThisMonth} deals this month 🔥`
      : dealsThisMonth === 2
      ? "2 deals this month — on a run! 🔥"
      : null;

  // Shareable text
  async function handleCopy() {
    const text = `Just closed another deal at ${address}. That's ${totalDealsThisYear} this year. 🏡🔑 #RealEstate #Closed`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  // Reset copied state on open
  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] max-w-lg p-0 overflow-hidden rounded-2xl border-0 shadow-2xl">

        {/* ── Hero band ───────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 px-6 pb-6 pt-8 text-white">
          {/* Decorative dots */}
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -left-6 bottom-0 h-24 w-24 rounded-full bg-white/10" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-2xl">
              🎉
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100">
                Deal Closed
              </p>
              <p className="text-lg font-bold leading-snug">
                {address || "Your deal"}
              </p>
              {clientName && (
                <p className="text-sm text-emerald-100">{clientName}</p>
              )}
            </div>
          </div>

          {/* GCI Counter */}
          <div className="mt-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200 mb-1">
              Commission Earned
            </p>
            <p className="text-5xl font-extrabold tabular-nums">
              $<CountUp end={gci} duration={1400} />
            </p>
          </div>

          {/* Goal progress */}
          {goalGCI > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-emerald-100 mb-1.5">
                <span>YTD Goal Progress</span>
                <span className="font-semibold text-white">{goalPct}% of {fmtCurrency(goalGCI)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/20">
                <div
                  className="h-2 rounded-full bg-white transition-all duration-1000"
                  style={{ width: `${goalPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="space-y-4 px-6 py-5">

          {/* Badges */}
          {(streakLabel || milestone) && (
            <div className="flex flex-wrap gap-2">
              {milestone && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                  <Trophy className="h-3.5 w-3.5" />
                  ${(milestone / 1000).toFixed(0)}k GCI milestone crossed!
                </span>
              )}
              {streakLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800 border border-orange-200">
                  <Flame className="h-3.5 w-3.5" />
                  {streakLabel}
                </span>
              )}
            </div>
          )}

          {/* Allocation breakdown */}
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              How to allocate your commission
            </p>
            <div className="space-y-2">

              {/* GST/HST */}
              <AllocationRow
                icon={<Landmark className="h-4 w-4" />}
                colorClass="bg-yellow-50 border-yellow-200 text-yellow-800"
                iconClass="bg-yellow-100 text-yellow-700"
                label={`${salesTaxLabel} to remit`}
                amount={salesTaxAmount}
                rate={salesTaxRate}
                note="Collected from your client — remit to CRA on next filing"
              />

              {/* Income tax reserve */}
              <AllocationRow
                icon={<Percent className="h-4 w-4" />}
                colorClass="bg-red-50 border-red-200 text-red-800"
                iconClass="bg-red-100 text-red-700"
                label="Income tax reserve"
                amount={taxReserve}
                rate={estimatedMarginalRate}
                note={`Estimated at your ~${Math.round(estimatedMarginalRate * 100)}% marginal rate — the tax portion before the rest is yours`}
              />

              {/* Fun money */}
              <AllocationRow
                icon={<Sparkles className="h-4 w-4" />}
                colorClass="bg-purple-50 border-purple-200 text-purple-800"
                iconClass="bg-purple-100 text-purple-700"
                label="Fun money (10%)"
                amount={funMoney}
                note="You earned it. Seriously. Go do something nice."
              />

              {/* Keep + invest */}
              <AllocationRow
                icon={<PiggyBank className="h-4 w-4" />}
                colorClass="bg-blue-50 border-blue-200 text-blue-800"
                iconClass="bg-blue-100 text-blue-700"
                label="Keep / invest"
                amount={keepAndInvest}
                note="Savings, RRSP, next month's lead gen — your call"
              />

            </div>
          </div>

          {/* Quote */}
          <div className="rounded-xl bg-muted/60 px-4 py-3 text-xs italic text-muted-foreground leading-relaxed border border-border/40">
            &ldquo;{quote}&rdquo;
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleCopy}
            >
              {copied ? (
                <><Check className="h-3.5 w-3.5 text-emerald-600" /> Copied!</>
              ) : (
                <><Copy className="h-3.5 w-3.5" /> Share the win</>
              )}
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs"
              onClick={onClose}
            >
              <PartyPopper className="h-3.5 w-3.5" />
              Awesome — let&apos;s go!
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── AllocationRow ─────────────────────────────────────────────────────────────

function AllocationRow({
  icon,
  colorClass,
  iconClass,
  label,
  amount,
  rate,
  note,
}: {
  icon: React.ReactNode;
  colorClass: string;
  iconClass: string;
  label: string;
  amount: number;
  rate?: number;
  note: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-3 py-2.5", colorClass)}>
      <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", iconClass)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold leading-snug">
            {label}
            {rate !== undefined && (
              <span className="ml-1.5 font-normal opacity-70">
                ({Math.round(rate * 100)}%)
              </span>
            )}
          </p>
          <p className="shrink-0 text-sm font-bold tabular-nums">
            {fmtCurrency(amount)}
          </p>
        </div>
        <p className="mt-0.5 text-[10px] leading-relaxed opacity-70">{note}</p>
      </div>
    </div>
  );
}
