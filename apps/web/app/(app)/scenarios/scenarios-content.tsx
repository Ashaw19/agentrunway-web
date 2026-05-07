"use client";

import { useState, useMemo } from "react";
import type { ScenarioSeedData } from "./page";
import type { Province } from "@/lib/types/database";
import { computeAgentGross, computeTxFees } from "@/lib/types/database";
import { calculate as calculateTax } from "@/lib/engines/canadian-tax-engine";
import { calculateCorporateTax } from "@/lib/engines/corporate-tax-engine";
import { survivalResult } from "@/lib/engines/survival-engine";
import { buildHealthReport } from "@/lib/engines/health-report";
import { compute as computeRunwayScore } from "@/lib/engines/runway-score-engine";
import { seasonalFractionElapsed } from "@/lib/engines/projection-engine";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import {
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function deltaColor(delta: number, inverted = false) {
  const positive = inverted ? delta < 0 : delta > 0;
  const negative = inverted ? delta > 0 : delta < 0;
  if (positive) return "text-emerald-600";
  if (negative) return "text-red-500";
  return "text-slate-400";
}

function DeltaIcon({ delta, inverted = false }: { delta: number; inverted?: boolean }) {
  const positive = inverted ? delta < 0 : delta > 0;
  const negative = inverted ? delta > 0 : delta < 0;
  if (positive) return <TrendingUp className="h-3.5 w-3.5" />;
  if (negative) return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function gradeColor(grade: string) {
  if (grade.startsWith("A")) return "text-emerald-600";
  if (grade === "B") return "text-blue-500";
  if (grade === "C") return "text-amber-500";
  if (grade === "D") return "text-orange-500";
  return "text-red-500";
}

// ── Types ──────────────────────────────────────────────────────────────────

interface ComputedResult {
  taxOwed: number;
  netIncome: number;
  effectiveRate: number;
  quarterlyInstalment: number;
  perDealSetAside: number;
  runwayScore: number;
  runwayGrade: string;
  survivalMonths: number;
}

// ── Computation ────────────────────────────────────────────────────────────

function computeResult(
  annualGCI: number,
  dealCount: number,
  rrspContribution: number,
  isIncorporated: boolean,
  compensationMethod: "salary" | "dividends" | "mixed",
  monthlyRecurring: number,
  cashReserve: number,
  goalGCI: number,
  pipelineWeightedGCI: number,
  province: Province,
  quarterPcts: number[],
  monthlyBrokerageFee: number,
  splitPreset: ScenarioSeedData["splitPreset"],
  postCapThreshold: number,
  postCapAgentPct: number,
  postCapBrokeragePct: number,
  txFeeRate: number,
  txFeeCap: number,
  expensesYTD: number,
  ytdGCI: number,
): ComputedResult {
  // ── Match dashboard: deduct split, fees, brokerage, expenses before tax ──
  // Dashboard: projectedNet = agentGross - txFees - brokerageFeeAnnual
  //            netForTax     = projectedNet - annualExpenses
  const { agentGross } = computeAgentGross(
    annualGCI,
    splitPreset,
    postCapThreshold,
    postCapAgentPct,
    postCapBrokeragePct,
  );
  const txFees = computeTxFees(annualGCI, txFeeRate, txFeeCap);
  const brokerageFeeAnnual = monthlyBrokerageFee * 12;

  // Dashboard projects annual expenses: expensesYTD + monthlyRecurring * remainingMonths
  const now = new Date();
  const expRemainingMonths = Math.max(0, 12 - (now.getMonth() + 1));
  const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;

  const projectedNet = agentGross - txFees - brokerageFeeAnnual;
  const netForTax = Math.max(0, projectedNet - annualExpenses - rrspContribution);

  let taxOwed: number;
  let netIncome: number;
  let effectiveRate: number;
  let quarterlyInstalment: number;
  let perDealSetAside: number;

  if (isIncorporated) {
    // Dashboard passes netForTax as corporateIncome (RRSP already deducted above for salary)
    const corpResult = calculateCorporateTax({
      corporateIncome: netForTax,
      province,
      compensationMethod,
      dealCount: dealCount > 0 ? dealCount : 1,
    });
    taxOwed = corpResult.totalCombinedTax;
    netIncome = corpResult.netPersonalIncome;
    effectiveRate = netForTax > 0 ? taxOwed / netForTax : 0;
    quarterlyInstalment = taxOwed / 4;
    perDealSetAside = dealCount > 0 ? taxOwed / dealCount : taxOwed;
  } else {
    const taxResult = calculateTax(netForTax, province, dealCount > 0 ? dealCount : 1);
    taxOwed = taxResult.totalBurden;
    netIncome = netForTax - taxOwed;
    effectiveRate = taxResult.effectiveRate;
    quarterlyInstalment = taxResult.quarterlyEstimate;
    perDealSetAside = taxResult.perDealSetAside;
  }

  // ── Runway score (uses YTD GCI for pace, not projected) ──────────────
  const fraction = seasonalFractionElapsed(quarterPcts);
  const healthReport = buildHealthReport(
    ytdGCI,
    goalGCI,
    fraction,
    pipelineWeightedGCI,
    expensesYTD,
  );

  // Survival months — cashReserve here is the user-adjusted slider value,
  // but the baseline comes from cashPosition.effectiveCash (computed in
  // scenarios/page.tsx) so the "no change" scenario matches dashboard + chat.
  // See memory/feedback_data_consistency_protocol.md.
  const survival = survivalResult(
    monthlyBrokerageFee,
    monthlyRecurring,
    cashReserve,
  );

  const benchmarkPercentile = 50; // neutral — scenario isolates the effect of changes
  const runwayResult = computeRunwayScore(
    healthReport,
    benchmarkPercentile,
    survival.months,
  );

  return {
    taxOwed,
    netIncome,
    effectiveRate,
    quarterlyInstalment,
    perDealSetAside,
    runwayScore: runwayResult.score,
    runwayGrade: runwayResult.grade,
    survivalMonths: survival.months,
  };
}

// ── Main Component ─────────────────────────────────────────────────────────

export function ScenariosContent({ seed }: { seed: ScenarioSeedData }) {
  // ── Input state (scenario values — user adjusts these) ────────────────
  const [scenarioGCI, setScenarioGCI] = useState(seed.projectedAnnualGCI);
  const [scenarioDealCount, setScenarioDealCount] = useState(seed.dealCount);
  const [scenarioRRSP, setScenarioRRSP] = useState(0);
  const [scenarioIncorporated, setScenarioIncorporated] = useState(seed.isIncorporated);
  const [scenarioCompMethod, setScenarioCompMethod] = useState<"salary" | "dividends" | "mixed">(
    (seed.compensationMethod as "salary" | "dividends" | "mixed") || "salary",
  );
  const [scenarioMonthlyRecurring, setScenarioMonthlyRecurring] = useState(seed.monthlyRecurring);
  const [scenarioCashReserve, setScenarioCashReserve] = useState(seed.cashReserve);
  const [scenarioWeeklyHours, setScenarioWeeklyHours] = useState(seed.estimatedWeeklyHours ?? 0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const province = (seed.province || "ontario") as Province;

  // Track how many inputs differ from seed (for Reset button)
  const modifiedCount = [
    scenarioGCI !== seed.projectedAnnualGCI,
    scenarioDealCount !== seed.dealCount,
    scenarioRRSP !== 0,
    scenarioIncorporated !== seed.isIncorporated,
    scenarioCompMethod !== ((seed.compensationMethod as "salary" | "dividends" | "mixed") || "salary"),
    scenarioMonthlyRecurring !== seed.monthlyRecurring,
    scenarioCashReserve !== seed.cashReserve,
    scenarioWeeklyHours !== (seed.estimatedWeeklyHours ?? 0),
  ].filter(Boolean).length;

  // Shared args for split/fee deductions (passed to computeResult)
  const deductionArgs = useMemo(() => [
    seed.splitPreset,
    seed.postCapThreshold,
    seed.postCapAgentPct,
    seed.postCapBrokeragePct,
    seed.txFeeRate,
    seed.txFeeCap,
    seed.expensesYTD,
  ] as const, [seed.splitPreset, seed.postCapThreshold, seed.postCapAgentPct, seed.postCapBrokeragePct, seed.txFeeRate, seed.txFeeCap, seed.expensesYTD]);

  // ── Current result (from real data — matches dashboard logic) ─────────
  const current = useMemo(
    () =>
      computeResult(
        seed.projectedAnnualGCI,
        seed.dealCount,
        0, // no RRSP adjustment for current
        seed.isIncorporated,
        (seed.compensationMethod as "salary" | "dividends" | "mixed") || "salary",
        seed.monthlyRecurring,
        seed.cashReserve,
        seed.goalGCI,
        seed.pipelineWeightedGCI,
        province,
        seed.quarterPcts,
        seed.monthlyBrokerageFee,
        ...deductionArgs,
        seed.ytdGCI,
      ),
    [seed, province, deductionArgs],
  );

  // ── Scenario result (from user-adjusted inputs) ───────────────────────
  const scenario = useMemo(
    () =>
      computeResult(
        scenarioGCI,
        scenarioDealCount,
        scenarioRRSP,
        scenarioIncorporated,
        scenarioCompMethod,
        scenarioMonthlyRecurring,
        scenarioCashReserve,
        seed.goalGCI,
        seed.pipelineWeightedGCI,
        province,
        seed.quarterPcts,
        seed.monthlyBrokerageFee,
        ...deductionArgs,
        seed.ytdGCI,
      ),
    [
      scenarioGCI,
      scenarioDealCount,
      scenarioRRSP,
      scenarioIncorporated,
      scenarioCompMethod,
      scenarioMonthlyRecurring,
      scenarioCashReserve,
      seed.goalGCI,
      seed.pipelineWeightedGCI,
      province,
      seed.quarterPcts,
      seed.monthlyBrokerageFee,
      deductionArgs,
      seed.ytdGCI,
    ],
  );

  // ── Deltas ────────────────────────────────────────────────────────────
  const deltas = {
    taxOwed: scenario.taxOwed - current.taxOwed,
    netIncome: scenario.netIncome - current.netIncome,
    effectiveRate: scenario.effectiveRate - current.effectiveRate,
    runwayScore: scenario.runwayScore - current.runwayScore,
    survivalMonths: scenario.survivalMonths - current.survivalMonths,
  };
  const hasChanges = modifiedCount > 0;

  // ── Hourly rate (only when weekly hours are set) ──────────────────────
  const vacationWeeks = seed.vacationWeeks ?? 0;
  const currentWorkingWeeks = Math.max(0, 52 - vacationWeeks);
  const currentHourlyRate = (seed.estimatedWeeklyHours ?? 0) > 0 && currentWorkingWeeks > 0
    ? current.netIncome / ((seed.estimatedWeeklyHours ?? 1) * currentWorkingWeeks)
    : null;
  const scenarioWorkingWeeks = Math.max(0, 52 - vacationWeeks);
  const scenarioHourlyRate = scenarioWeeklyHours > 0 && scenarioWorkingWeeks > 0
    ? scenario.netIncome / (scenarioWeeklyHours * scenarioWorkingWeeks)
    : null;
  const hourlyRateDelta = currentHourlyRate != null && scenarioHourlyRate != null
    ? scenarioHourlyRate - currentHourlyRate
    : null;

  // ── Situational observation (single most-notable thing about current state) ──
  const observation = useMemo(() => {
    // Pick the single most interesting observation from existing current values.
    // Priority: low survival → high tax rate → strong runway → low projected GCI
    if (current.survivalMonths < 3 && current.survivalMonths > 0) {
      return {
        column: `Cash runway is ${current.survivalMonths.toFixed(1)} months at your current expense level`,
        nudge: `Your cash runway is under 3 months — try adjusting your reserve to see the effect.`,
      };
    }
    if (current.effectiveRate > 0.35) {
      return {
        column: `Your effective tax rate is ${(current.effectiveRate * 100).toFixed(1)}% at this income level`,
        nudge: `Your effective rate is ${(current.effectiveRate * 100).toFixed(0)}% — try adjusting RRSP or business structure to see the tax impact.`,
      };
    }
    if (current.runwayGrade === "A+" || current.runwayGrade === "A") {
      return {
        column: `Runway grade ${current.runwayGrade} — your financial position is strong`,
        nudge: `You're in a strong position — explore what happens if you increase RRSP contributions or close more deals.`,
      };
    }
    if (seed.projectedAnnualGCI < seed.goalGCI * 0.6 && seed.goalGCI > 0) {
      return {
        column: `Projected GCI is tracking below your annual goal`,
        nudge: `Your projection is below your goal — try exploring what a few more deals would change.`,
      };
    }
    if (current.effectiveRate > 0.25) {
      return {
        column: `Your effective tax rate is ${(current.effectiveRate * 100).toFixed(1)}% at this income level`,
        nudge: `Adjust an input or try a quick scenario to see the impact.`,
      };
    }
    return {
      column: null,
      nudge: `Adjust an input or try a quick scenario to see the impact.`,
    };
  }, [current, seed.projectedAnnualGCI, seed.goalGCI]);

  // ── GCI slider bounds ────────────────────────────────────────────────
  const gciMin = 0;
  const gciMax = Math.max(500_000, seed.goalGCI * 2, seed.projectedAnnualGCI * 2);
  const gciStep = 5_000;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
          <SlidersHorizontal className="h-6 w-6 text-violet-500" />
          Scenario Engine
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Adjust inputs to see how changes affect your tax burden, net income, and runway score.
        </p>
      </div>

      {/* Trust indicator */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Info className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          &ldquo;Your Projection&rdquo; reflects your actual dashboard data. &ldquo;What If&rdquo; is
          a hypothetical estimate only&mdash;it never changes your records. Based on {new Date().getFullYear()} Canadian
          tax rates; not financial advice.
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ── LEFT: Input Controls ─────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Scenario Inputs
            </h2>

            {/* 1. Projected Annual GCI */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-slate-600">Projected Annual GCI</label>
                  <span className="block text-[10px] text-slate-400">Changes take-home, tax, and runway score</span>
                </div>
                <span className="text-sm font-semibold text-slate-800 tabular-nums">
                  {fmtCurrency(scenarioGCI)}
                </span>
              </div>
              <input
                type="range"
                min={gciMin}
                max={gciMax}
                step={gciStep}
                value={scenarioGCI}
                onChange={(e) => setScenarioGCI(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{fmtCurrency(gciMin)}</span>
                <span>{fmtCurrency(gciMax)}</span>
              </div>
            </div>

            {/* 2. Deal Count */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Deal Count</label>
              <span className="block text-[10px] text-slate-400 -mt-1">Only changes per-deal set-aside — total tax stays the same</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setScenarioDealCount((c) => Math.max(0, c - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  -
                </button>
                <span className="min-w-[3rem] text-center text-lg font-semibold text-slate-800 tabular-nums">
                  {scenarioDealCount}
                </span>
                <button
                  type="button"
                  onClick={() => setScenarioDealCount((c) => c + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* 3. RRSP Contribution */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">RRSP Contribution</label>
              <span className="block text-[10px] text-slate-400 -mt-1">Lowers your tax owed and increases take-home</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  max={100_000}
                  step={500}
                  value={scenarioRRSP}
                  onChange={(e) => setScenarioRRSP(clamp(Number(e.target.value), 0, 100_000))}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-7 pr-3 text-sm text-slate-800 tabular-nums placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>

            {/* 4. Business Structure */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Business Structure</label>
              <span className="block text-[10px] text-slate-400 -mt-1">Changes how your income is taxed</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScenarioIncorporated(false)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    !scenarioIncorporated
                      ? "border-violet-500 bg-violet-50 text-violet-600"
                      : "border-slate-300 bg-white text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Sole Prop
                </button>
                <button
                  type="button"
                  onClick={() => setScenarioIncorporated(true)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    scenarioIncorporated
                      ? "border-violet-500 bg-violet-50 text-violet-600"
                      : "border-slate-300 bg-white text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Incorporated
                </button>
              </div>
            </div>

            {/* 5. Compensation Method (only if incorporated) */}
            {scenarioIncorporated && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">
                  Compensation Method
                </label>
                <span className="block text-[10px] text-slate-400">Splits income between salary and dividends</span>
                <div className="grid grid-cols-3 gap-2">
                  {(["salary", "dividends", "mixed"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setScenarioCompMethod(method)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                        scenarioCompMethod === method
                          ? "border-violet-500 bg-violet-50 text-violet-600"
                          : "border-slate-300 bg-white text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span>Advanced</span>
              {showAdvanced ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showAdvanced && (
              <div className="space-y-4 border-t border-slate-200 pt-4">
                {/* 6. Monthly Recurring Expenses */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">
                    Monthly Recurring
                  </label>
                  <span className="block text-[10px] text-slate-400 -mt-1">Lowers tax owed but also shortens cash runway</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={50_000}
                      step={100}
                      value={scenarioMonthlyRecurring}
                      onChange={(e) =>
                        setScenarioMonthlyRecurring(
                          clamp(Number(e.target.value), 0, 50_000),
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-7 pr-3 text-sm text-slate-800 tabular-nums placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>

                {/* 7. Cash Reserve */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Cash Reserve</label>
                  <span className="block text-[10px] text-slate-400 -mt-1">Affects cash runway only — no tax impact</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={1_000_000}
                      step={1_000}
                      value={scenarioCashReserve}
                      onChange={(e) =>
                        setScenarioCashReserve(
                          clamp(Number(e.target.value), 0, 1_000_000),
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-7 pr-3 text-sm text-slate-800 tabular-nums placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>

                {/* 8. Weekly Hours */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Weekly Hours</label>
                  <span className="block text-[10px] text-slate-400 -mt-1">Changes your effective hourly rate only</span>
                  <input
                    type="number"
                    min={0}
                    max={168}
                    step={1}
                    value={scenarioWeeklyHours || ""}
                    placeholder="e.g. 45"
                    onChange={(e) =>
                      setScenarioWeeklyHours(
                        clamp(Number(e.target.value), 0, 168),
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-800 tabular-nums placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </div>
            )}

            {/* Reset button */}
            <button
              type="button"
              disabled={modifiedCount === 0}
              onClick={() => {
                setScenarioGCI(seed.projectedAnnualGCI);
                setScenarioDealCount(seed.dealCount);
                setScenarioRRSP(0);
                setScenarioIncorporated(seed.isIncorporated);
                setScenarioCompMethod(
                  (seed.compensationMethod as "salary" | "dividends" | "mixed") || "salary",
                );
                setScenarioMonthlyRecurring(seed.monthlyRecurring);
                setScenarioCashReserve(seed.cashReserve);
                setScenarioWeeklyHours(seed.estimatedWeeklyHours ?? 0);
              }}
              className={`w-full rounded-lg border py-2 text-xs font-medium transition-colors ${
                modifiedCount > 0
                  ? "border-slate-300 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                  : "border-slate-200 bg-slate-50 text-slate-400 cursor-default"
              }`}
            >
              {modifiedCount > 0
                ? `Reset to Current (${modifiedCount} changed)`
                : "No changes"}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Comparison Results ─────────────────────────────────── */}
        <div className="space-y-4">
          {/* Two-column comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Current Column */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Your Projection
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-400">Based on your dashboard data</p>
              </div>
              <div className="space-y-1">
                {/* Primary metrics — larger */}
                <PrimaryMetricRow label="Take-Home" value={fmtCurrency(current.netIncome)} />
                <PrimaryMetricRow label="Tax Owed" value={fmtCurrency(current.taxOwed)} />
                <div className="!mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <MetricRow
                    label="Eff. Tax Rate"
                    value={fmtPct(current.effectiveRate)}
                  />
                  <MetricRow
                    label="CRA Instalments"
                    value={fmtCurrency(current.quarterlyInstalment)}
                  />
                  <MetricRow
                    label="Per-Deal Set-Aside"
                    value={fmtCurrency(current.perDealSetAside)}
                  />
                </div>
                <div className="!mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <MetricRow
                    label="Runway Score"
                    value={`${current.runwayScore}`}
                    badge={current.runwayGrade}
                    badgeColor={gradeColor(current.runwayGrade)}
                  />
                  <MetricRow
                    label="Cash Runway"
                    value={
                      current.survivalMonths >= 24
                        ? "24+ mo"
                        : `${current.survivalMonths.toFixed(1)} mo`
                    }
                  />
                </div>
                {currentHourlyRate != null && (
                  <div className="!mt-3 space-y-2 border-t border-slate-200 pt-3">
                    <MetricRow
                      label="Eff. Hourly Rate"
                      value={`${fmtCurrency(currentHourlyRate)}/hr`}
                    />
                  </div>
                )}
                {observation.column && (
                  <p className="!mt-3 text-[10px] text-slate-400 italic leading-relaxed">
                    {observation.column}
                  </p>
                )}
              </div>
            </div>

            {/* Scenario Column */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 shadow-sm p-5">
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-600">
                  What If
                </h3>
                <p className="mt-0.5 text-[10px] text-violet-400">Hypothetical — does not change your data</p>
              </div>
              <div className="space-y-1">
                {/* Primary metrics — larger */}
                <PrimaryMetricRow label="Take-Home" value={fmtCurrency(scenario.netIncome)} />
                <PrimaryMetricRow label="Tax Owed" value={fmtCurrency(scenario.taxOwed)} />
                <div className="!mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <MetricRow
                    label="Eff. Tax Rate"
                    value={fmtPct(scenario.effectiveRate)}
                  />
                  <MetricRow
                    label="CRA Instalments"
                    value={fmtCurrency(scenario.quarterlyInstalment)}
                  />
                  <MetricRow
                    label="Per-Deal Set-Aside"
                    value={fmtCurrency(scenario.perDealSetAside)}
                  />
                </div>
                <div className="!mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <MetricRow
                    label="Runway Score"
                    value={`${scenario.runwayScore}`}
                    badge={scenario.runwayGrade}
                    badgeColor={gradeColor(scenario.runwayGrade)}
                  />
                  <MetricRow
                    label="Cash Runway"
                    value={
                      scenario.survivalMonths >= 24
                        ? "24+ mo"
                        : `${scenario.survivalMonths.toFixed(1)} mo`
                    }
                  />
                </div>
                {scenarioHourlyRate != null && scenarioWeeklyHours > 0 && (
                  <div className="!mt-3 space-y-2 border-t border-slate-200 pt-3">
                    <MetricRow
                      label="Eff. Hourly Rate"
                      value={`${fmtCurrency(scenarioHourlyRate)}/hr`}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Delta Section */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Impact
            </h3>
            {hasChanges ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                <DeltaCard
                  label="Tax"
                  delta={deltas.taxOwed}
                  formatted={fmtCurrency(Math.abs(deltas.taxOwed))}
                  inverted
                />
                <DeltaCard
                  label="Take-Home"
                  delta={deltas.netIncome}
                  formatted={fmtCurrency(Math.abs(deltas.netIncome))}
                />
                <DeltaCard
                  label="Eff. Rate"
                  delta={deltas.effectiveRate}
                  formatted={`${Math.abs(deltas.effectiveRate * 100).toFixed(1)}%`}
                  inverted
                />
                <DeltaCard
                  label="Runway"
                  delta={deltas.runwayScore}
                  formatted={`${Math.abs(deltas.runwayScore)} pts`}
                />
                <DeltaCard
                  label="Cash Runway"
                  delta={deltas.survivalMonths}
                  formatted={`${Math.abs(deltas.survivalMonths).toFixed(1)} mo`}
                />
                {hourlyRateDelta != null && (
                  <DeltaCard
                    label="Hourly Rate"
                    delta={hourlyRateDelta}
                    formatted={`${fmtCurrency(Math.abs(hourlyRateDelta))}/hr`}
                  />
                )}
              </div>
            ) : (
              <p className="text-center text-sm text-slate-500 py-2">
                {observation.nudge}
              </p>
            )}
          </div>

          {/* Quick question shortcuts */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Quick Scenarios
            </h3>
            <div className="flex flex-wrap gap-2">
              <QuickButton
                label="What if I earn $30K more?"
                onClick={() => setScenarioGCI(seed.projectedAnnualGCI + 30_000)}
              />
              <QuickButton
                label="What if I close 5 more deals?"
                onClick={() => {
                  setScenarioDealCount(seed.dealCount + 5);
                  setScenarioGCI(
                    seed.projectedAnnualGCI +
                      (seed.dealCount > 0
                        ? (seed.projectedAnnualGCI / seed.dealCount) * 5
                        : 50_000),
                  );
                }}
              />
              <QuickButton
                label="What if I incorporate?"
                onClick={() => setScenarioIncorporated(true)}
              />
              <QuickButton
                label="Max RRSP ($31,560)"
                onClick={() => setScenarioRRSP(31_560)}
              />
              <QuickButton
                label="Double cash reserve"
                onClick={() => {
                  setScenarioCashReserve(seed.cashReserve * 2);
                  setShowAdvanced(true);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function PrimaryMetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className="text-lg font-bold text-slate-800 tabular-nums">{value}</span>
    </div>
  );
}

function MetricRow({
  label,
  value,
  badge,
  badgeColor,
}: {
  label: string;
  value: string;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 tabular-nums">
        {value}
        {badge && (
          <span className={`text-xs font-bold ${badgeColor ?? "text-slate-400"}`}>
            {badge}
          </span>
        )}
      </span>
    </div>
  );
}

function DeltaCard({
  label,
  delta,
  formatted,
  inverted = false,
}: {
  label: string;
  delta: number;
  formatted: string;
  inverted?: boolean;
}) {
  const color = deltaColor(delta, inverted);
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return (
    <div className="text-center">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`mt-1 flex items-center justify-center gap-1 text-sm font-semibold ${color}`}>
        <DeltaIcon delta={delta} inverted={inverted} />
        <span className="tabular-nums">
          {sign}
          {formatted}
        </span>
      </div>
    </div>
  );
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600 transition-colors"
    >
      {label}
    </button>
  );
}
