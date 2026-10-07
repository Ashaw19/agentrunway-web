"use client";

/**
 * Dashboard year switch + next-year planning view (Andrew, 2026-10-07: "On
 * the dashboard, I should be able to flip between the current year and the
 * next year").
 *
 * Next year has no actuals, so instead of pace and year-to-date it shows a
 * plan: the goal (editable here), pipeline already expected to close that
 * year, deals still needed, month-by-month targets, and estimated take-home
 * at goal. Every number comes from packages/core/engines/year-plan-engine.ts,
 * which reuses the same pipeline, seasonality, plan/fee and tax engines as
 * the rest of the app.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarRange, Target, Layers, Wallet, Loader2 } from "lucide-react";
import { fmtCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { CANONICAL_TAX_DISCLAIMER_SHORT } from "@/lib/flight-crew/constants";
import {
  pipelineLinedUpForYear,
  averageDealGCI,
  dealsNeeded,
  monthlyTargets,
  planTakeHome,
} from "@agent-runway/core/engines/year-plan-engine";
import type { HistoryItem, PipelineDeal, UserSettings } from "@/lib/types/database";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SEASONAL_SOURCE_LABEL: Record<"agent" | "national" | "default", string> = {
  agent:    "your own seasonality from past years",
  national: "national seasonality",
  default:  "an even spread across the year",
};

// ── Year switch ─────────────────────────────────────────────────────────────

export type DashboardYearView = "current" | "next";

export function DashboardYearSwitch({
  view,
  onChange,
  currentYear,
}: {
  view:        DashboardYearView;
  onChange:    (v: DashboardYearView) => void;
  currentYear: number;
}) {
  const tab = (v: DashboardYearView, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === v}
      onClick={() => onChange(v)}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
        view === v
          ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
          : "text-slate-500 hover:text-slate-900 dark:hover:text-white",
      )}
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" aria-label="Dashboard year" className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {tab("current", `${currentYear}`)}
      {tab("next", `${currentYear + 1} plan`)}
    </div>
  );
}

/** From October 1 until next year has a goal (shouldPromptNextYearGoal). */
export function NextYearGoalPrompt({ year, onOpen }: { year: number; onOpen: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800/40 dark:bg-violet-950/20">
      <div className="flex items-center gap-2.5">
        <CalendarRange className="h-4 w-4 shrink-0 text-violet-500" />
        <p className="text-sm text-slate-700 dark:text-slate-200">
          <span className="font-semibold">Set your {year} goal.</span>{" "}
          Each year&apos;s goal is separate, so {year} starts with no goal unless you set one.
        </p>
      </div>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onOpen}>
        Plan {year}
      </Button>
    </div>
  );
}

// ── Planning view ───────────────────────────────────────────────────────────

export function NextYearPlan({
  year,
  currentYear,
  goal,
  onSaveGoal,
  pipelineDeals,
  historyItems,
  ytdGCI,
  ytdDealCount,
  seasonalWeights,
  seasonalSource,
  settings,
  monthlyRecurring,
}: {
  year:             number;
  currentYear:      number;
  /** null = no goal set for that year. */
  goal:             number | null;
  onSaveGoal:       (amount: number) => Promise<boolean>;
  pipelineDeals:    PipelineDeal[];
  historyItems:     HistoryItem[];
  ytdGCI:           number;
  ytdDealCount:     number;
  seasonalWeights:  number[];
  seasonalSource:   "agent" | "national" | "default";
  settings:         UserSettings;
  monthlyRecurring: number;
}) {
  const [draft, setDraft] = useState(goal != null ? String(goal) : "");
  const [saving, setSaving] = useState(false);

  const goalAmount = goal ?? 0;
  const linedUp = pipelineLinedUpForYear(pipelineDeals, year);
  const avg = averageDealGCI(historyItems, { gci: ytdGCI, deals: ytdDealCount }, currentYear);
  const needed = dealsNeeded(goalAmount, linedUp.weightedGCI, avg?.avg ?? null);
  const targets = monthlyTargets(goalAmount, seasonalWeights);
  const dealsAtGoal = avg && goalAmount > 0 ? Math.max(1, Math.round(goalAmount / avg.avg)) : undefined;
  const takeHome = goalAmount > 0
    ? planTakeHome({ gci: goalAmount, settings, monthlyRecurring, dealCount: dealsAtGoal, year })
    : null;
  const coveredPct = goalAmount > 0 ? Math.min(100, (linedUp.weightedGCI / goalAmount) * 100) : 0;

  async function save() {
    const amount = draft.trim() === "" ? 0 : Number(draft);
    if (!Number.isFinite(amount) || amount < 0) return;
    setSaving(true);
    const ok = await onSaveGoal(amount);
    setSaving(false);
    if (ok) setDraft(String(amount));
  }

  return (
    <div className="space-y-4">
      {/* Goal */}
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-violet-500" /> Your {year} goal
          </CardTitle>
          <CardDescription>
            Becomes your active goal on January 1, {year}. Your {currentYear} dashboard isn&apos;t affected.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <p className="mr-4 text-3xl font-bold tabular-nums text-slate-900">
            {goal == null ? <span className="text-xl font-semibold text-slate-400">No goal set yet</span>
              : goalAmount > 0 ? fmtCurrency(goalAmount)
              : <span className="text-xl font-semibold text-slate-400">No goal (set to $0)</span>}
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              aria-label={`${year} GCI goal`}
              placeholder="e.g. 80000"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-9 w-36"
            />
            <Button size="sm" className="h-9" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : goal == null ? "Set goal" : "Update"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Already lined up */}
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-blue-500" /> Already lined up for {year}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold tabular-nums">{fmtCurrency(linedUp.weightedGCI)}</p>
            <p className="text-xs text-slate-500">
              {linedUp.dealCount === 0
                ? `No active deals have an expected close date in ${year} yet.`
                : `${linedUp.dealCount} active ${linedUp.dealCount === 1 ? "deal" : "deals"} expected to close in ${year}, weighted by stage.`}
            </p>
            {goalAmount > 0 && (
              <>
                <Progress value={coveredPct} className="h-2" />
                <p className="text-xs text-slate-500">{Math.round(coveredPct)}% of your {year} goal</p>
              </>
            )}
            {linedUp.undatedCount > 0 && (
              <p className="text-xs text-amber-600">
                {linedUp.undatedCount} active {linedUp.undatedCount === 1 ? "deal has" : "deals have"} no expected close date, so {linedUp.undatedCount === 1 ? "it isn't" : "they aren't"} counted here.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Still needed */}
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-emerald-500" /> Still needed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {goalAmount <= 0 ? (
              <p className="text-sm text-slate-500">Set a {year} goal to see how many more deals it takes.</p>
            ) : needed == null ? (
              <p className="text-sm text-slate-500">
                {fmtCurrency(Math.max(0, goalAmount - linedUp.weightedGCI))} more. Log some closed deals and this
                turns into a deal count.
              </p>
            ) : (
              <>
                <p className="text-2xl font-bold tabular-nums">
                  {needed === 0 ? "Covered" : `About ${needed} more ${needed === 1 ? "deal" : "deals"}`}
                </p>
                <p className="text-xs text-slate-500">
                  {fmtCurrency(Math.max(0, goalAmount - linedUp.weightedGCI))} beyond what&apos;s lined up, at your average of{" "}
                  {fmtCurrency(avg!.avg)} per deal (your last {avg!.deals} closed {avg!.deals === 1 ? "deal" : "deals"}).
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly targets */}
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarRange className="h-4 w-4 text-violet-500" /> Month-by-month targets
          </CardTitle>
          <CardDescription>
            {goalAmount > 0
              ? `Your ${year} goal spread using ${SEASONAL_SOURCE_LABEL[seasonalSource]}.`
              : `Set a ${year} goal to see monthly targets.`}
          </CardDescription>
        </CardHeader>
        {goalAmount > 0 && (
          <CardContent>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
              {targets.map((t, i) => (
                <div key={MONTHS[i]} className="rounded-lg bg-slate-50 px-2 py-2 text-center dark:bg-slate-800/40">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{MONTHS[i]}</p>
                  <p className="text-sm font-semibold tabular-nums">{fmtCurrency(t)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Take-home at goal */}
      {takeHome && (
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4 text-emerald-500" /> What {fmtCurrency(goalAmount)} means for you
            </CardTitle>
            <CardDescription>
              Estimated take-home at your {year} goal, using your current split, fees and recurring expenses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-1.5 text-sm">
              <Row label="GCI at goal" value={fmtCurrency(takeHome.gci)} />
              <Row label="After commission split and plan fees" value={fmtCurrency(takeHome.afterPlan)} />
              {takeHome.brokerageFees > 0 && <Row label="Brokerage desk fees" value={`−${fmtCurrency(takeHome.brokerageFees)}`} />}
              <Row label="Business expenses (current recurring × 12)" value={`−${fmtCurrency(takeHome.expenses)}`} />
              <Row label="Estimated income tax and CPP" value={`−${fmtCurrency(takeHome.incomeTaxAndCpp)}`} />
              <div className="mt-1 border-t border-slate-200 pt-1.5 dark:border-slate-700">
                <Row label="Estimated take-home" value={fmtCurrency(takeHome.takeHome)} strong />
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-slate-400">{CANONICAL_TAX_DISCLAIMER_SHORT}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn("text-slate-500", strong && "font-semibold text-slate-900 dark:text-white")}>{label}</dt>
      <dd className={cn("tabular-nums", strong ? "text-base font-bold" : "font-medium")}>{value}</dd>
    </div>
  );
}
