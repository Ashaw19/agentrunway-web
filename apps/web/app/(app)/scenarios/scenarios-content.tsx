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
  if (positive) return "text-emerald-400";
  if (negative) return "text-red-400";
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
  if (grade.startsWith("A")) return "text-emerald-400";
  if (grade === "B") return "text-blue-400";
  if (grade === "C") return "text-amber-400";
  if (grade === "D") return "text-orange-400";
  return "text-red-400";
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
    annualGCI,
    goalGCI,
    fraction,
    pipelineWeightedGCI,
    expensesYTD,
  );

  // Survival months — uses monthlyRecurring (matches dashboard)
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const province = (seed.province || "ontario") as Province;

  // Shared args for split/fee deductions (passed to computeResult)
  const deductionArgs = [
    seed.splitPreset,
    seed.postCapThreshold,
    seed.postCapAgentPct,
    seed.postCapBrokeragePct,
    seed.txFeeRate,
    seed.txFeeCap,
    seed.expensesYTD,
  ] as const;

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

  // ── GCI slider bounds ────────────────────────────────────────────────
  const gciMin = 0;
  const gciMax = Math.max(500_000, seed.goalGCI * 2, seed.projectedAnnualGCI * 2);
  const gciStep = 5_000;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <SlidersHorizontal className="h-6 w-6 text-violet-400" />
          Scenario Engine
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Adjust inputs to see how changes affect your tax burden, net income, and runway score.
        </p>
      </div>

      {/* Trust indicator */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-xs text-slate-400">
        <Info className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span>
          Estimates based on your current data and {new Date().getFullYear()} Canadian tax rates.
          Not financial advice.
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ── LEFT: Input Controls ─────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5 space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Scenario Inputs
            </h2>

            {/* 1. Projected Annual GCI */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Projected Annual GCI</label>
                <span className="text-sm font-semibold text-white tabular-nums">
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
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>{fmtCurrency(gciMin)}</span>
                <span>{fmtCurrency(gciMax)}</span>
              </div>
            </div>

            {/* 2. Deal Count */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Deal Count</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setScenarioDealCount((c) => Math.max(0, c - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-700/50 text-white hover:bg-slate-600 transition-colors"
                >
                  -
                </button>
                <span className="min-w-[3rem] text-center text-lg font-semibold text-white tabular-nums">
                  {scenarioDealCount}
                </span>
                <button
                  type="button"
                  onClick={() => setScenarioDealCount((c) => c + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-700/50 text-white hover:bg-slate-600 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* 3. RRSP Contribution */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">RRSP Contribution</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  max={100_000}
                  step={500}
                  value={scenarioRRSP}
                  onChange={(e) => setScenarioRRSP(clamp(Number(e.target.value), 0, 100_000))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700/50 py-2 pl-7 pr-3 text-sm text-white tabular-nums placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>

            {/* 4. Business Structure */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Business Structure</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScenarioIncorporated(false)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    !scenarioIncorporated
                      ? "border-violet-500 bg-violet-500/20 text-violet-300"
                      : "border-slate-600 bg-slate-700/30 text-slate-400 hover:text-white"
                  }`}
                >
                  Sole Prop
                </button>
                <button
                  type="button"
                  onClick={() => setScenarioIncorporated(true)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    scenarioIncorporated
                      ? "border-violet-500 bg-violet-500/20 text-violet-300"
                      : "border-slate-600 bg-slate-700/30 text-slate-400 hover:text-white"
                  }`}
                >
                  Incorporated
                </button>
              </div>
            </div>

            {/* 5. Compensation Method (only if incorporated) */}
            {scenarioIncorporated && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">
                  Compensation Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["salary", "dividends", "mixed"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setScenarioCompMethod(method)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                        scenarioCompMethod === method
                          ? "border-violet-500 bg-violet-500/20 text-violet-300"
                          : "border-slate-600 bg-slate-700/30 text-slate-400 hover:text-white"
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
              className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors"
            >
              <span>Advanced</span>
              {showAdvanced ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showAdvanced && (
              <div className="space-y-4 border-t border-slate-700/50 pt-4">
                {/* 6. Monthly Recurring Expenses */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">
                    Monthly Recurring
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
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
                      className="w-full rounded-lg border border-slate-600 bg-slate-700/50 py-2 pl-7 pr-3 text-sm text-white tabular-nums placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>

                {/* 7. Cash Reserve */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Cash Reserve</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
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
                      className="w-full rounded-lg border border-slate-600 bg-slate-700/50 py-2 pl-7 pr-3 text-sm text-white tabular-nums placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Reset button */}
            <button
              type="button"
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
              }}
              className="w-full rounded-lg border border-slate-600 bg-slate-700/30 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
            >
              Reset to Current
            </button>
          </div>
        </div>

        {/* ── RIGHT: Comparison Results ─────────────────────────────────── */}
        <div className="space-y-4">
          {/* Two-column comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Current Column */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Current
              </h3>
              <div className="space-y-4">
                <MetricRow label="Tax Owed" value={fmtCurrency(current.taxOwed)} />
                <MetricRow label="Net Income" value={fmtCurrency(current.netIncome)} />
                <MetricRow
                  label="Effective Rate"
                  value={fmtPct(current.effectiveRate)}
                />
                <MetricRow
                  label="Quarterly Instalment"
                  value={fmtCurrency(current.quarterlyInstalment)}
                />
                <MetricRow
                  label="Per-Deal Set-Aside"
                  value={fmtCurrency(current.perDealSetAside)}
                />
                <div className="border-t border-slate-700/50 pt-3">
                  <MetricRow
                    label="Runway Score"
                    value={`${current.runwayScore}`}
                    badge={current.runwayGrade}
                    badgeColor={gradeColor(current.runwayGrade)}
                  />
                  <div className="mt-2">
                    <MetricRow
                      label="Survival"
                      value={
                        current.survivalMonths >= 24
                          ? "24+ mo"
                          : `${current.survivalMonths.toFixed(1)} mo`
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Scenario Column */}
            <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-violet-400">
                Scenario
              </h3>
              <div className="space-y-4">
                <MetricRow label="Tax Owed" value={fmtCurrency(scenario.taxOwed)} />
                <MetricRow label="Net Income" value={fmtCurrency(scenario.netIncome)} />
                <MetricRow
                  label="Effective Rate"
                  value={fmtPct(scenario.effectiveRate)}
                />
                <MetricRow
                  label="Quarterly Instalment"
                  value={fmtCurrency(scenario.quarterlyInstalment)}
                />
                <MetricRow
                  label="Per-Deal Set-Aside"
                  value={fmtCurrency(scenario.perDealSetAside)}
                />
                <div className="border-t border-slate-700/50 pt-3">
                  <MetricRow
                    label="Runway Score"
                    value={`${scenario.runwayScore}`}
                    badge={scenario.runwayGrade}
                    badgeColor={gradeColor(scenario.runwayGrade)}
                  />
                  <div className="mt-2">
                    <MetricRow
                      label="Survival"
                      value={
                        scenario.survivalMonths >= 24
                          ? "24+ mo"
                          : `${scenario.survivalMonths.toFixed(1)} mo`
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Delta Section */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Impact
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              <DeltaCard
                label="Tax"
                delta={deltas.taxOwed}
                formatted={fmtCurrency(Math.abs(deltas.taxOwed))}
                inverted
              />
              <DeltaCard
                label="Net Income"
                delta={deltas.netIncome}
                formatted={fmtCurrency(Math.abs(deltas.netIncome))}
              />
              <DeltaCard
                label="Eff. Rate"
                delta={deltas.effectiveRate}
                formatted={`${Math.abs(deltas.effectiveRate * 100).toFixed(1)}pp`}
                inverted
              />
              <DeltaCard
                label="Runway"
                delta={deltas.runwayScore}
                formatted={`${Math.abs(deltas.runwayScore)} pts`}
              />
              <DeltaCard
                label="Survival"
                delta={deltas.survivalMonths}
                formatted={`${Math.abs(deltas.survivalMonths).toFixed(1)} mo`}
              />
            </div>
          </div>

          {/* Quick question shortcuts */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
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
      <span className="text-sm text-slate-400">{label}</span>
      <span className="flex items-center gap-2 text-sm font-semibold text-white tabular-nums">
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
      className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-violet-500/20 hover:border-violet-500/50 hover:text-violet-300 transition-colors"
    >
      {label}
    </button>
  );
}
