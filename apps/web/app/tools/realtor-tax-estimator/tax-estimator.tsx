"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Calculator, Info, TrendingDown, Sparkles, ChevronDown } from "lucide-react";
import {
  calculate,
  bracketBreakdown,
  provincialInfo,
  gstHstRate,
  gstHstLabel,
  FEDERAL_BRACKETS,
  FEDERAL_BPA,
  FEDERAL_BPA_RATE,
} from "@/lib/engines/canadian-tax-engine";
import { PROVINCE_LABELS, type Province } from "@agent-runway/core/types/database";

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

const fmt0 = (n: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ─────────────────────────────────────────────────────────────────────────────
// Province ordering (alphabetical display)
// ─────────────────────────────────────────────────────────────────────────────

const PROVINCE_OPTIONS = (Object.entries(PROVINCE_LABELS) as [Province, string][]).sort(
  ([, a], [, b]) => a.localeCompare(b),
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function TaxEstimator() {
  // Inputs
  const [gci, setGci] = useState(120_000);
  const [expenses, setExpenses] = useState(30_000); // typical 20-30% of GCI
  const [province, setProvince] = useState<Province>("ontario");
  const [dealCount, setDealCount] = useState(12);
  const [hstRegistered, setHstRegistered] = useState(true);
  const [showCalculation, setShowCalculation] = useState(false);

  // Compute net income = GCI − expenses (floor at 0)
  const netIncome = Math.max(0, gci - expenses);

  // Run engine
  const result = useMemo(
    () => calculate(netIncome, province, dealCount),
    [netIncome, province, dealCount],
  );

  // Derived: take-home after tax + CPP
  const takeHome = netIncome - result.totalBurden;

  // ── Disclosure-panel inputs (display-only, sourced from canonical engine) ──
  const isQuebec = province === "quebec";
  const cppLabel = isQuebec ? "QPP" : "CPP";
  const provInfo = useMemo(() => provincialInfo(province), [province]);
  const fedTaxableForBrackets = useMemo(() => {
    // Mirror the engine's federal-taxable basis: net income minus CPP deduction.
    // CPP1 50% deductible (employer half), CPP2 100% deductible.
    const cppDeduction =
      result.cpp1Contribution * 0.5 + result.cpp2Contribution;
    return Math.max(0, netIncome - cppDeduction);
  }, [netIncome, result.cpp1Contribution, result.cpp2Contribution]);

  const fedSlices = useMemo(
    () => bracketBreakdown(fedTaxableForBrackets, FEDERAL_BRACKETS),
    [fedTaxableForBrackets],
  );
  const provSlices = useMemo(
    () => bracketBreakdown(fedTaxableForBrackets, provInfo.brackets),
    [fedTaxableForBrackets, provInfo],
  );

  // HST display values
  const hstRate = gstHstRate(province);
  const hstTypeLabel = gstHstLabel(province);
  const hstCollected = hstRegistered ? gci * hstRate : 0;
  // Illustrative ITC estimate: HST portion of expenses at the same rate
  // (real ITCs depend on which inputs are HST-bearing; this is shown as illustrative).
  const itcEstimate = hstRegistered ? expenses * hstRate : 0;
  const hstNetOwed = Math.max(0, hstCollected - itcEstimate);

  // Instalment threshold: $3,000 federal ($1,800 in Quebec)
  const instalmentThreshold = isQuebec ? 1_800 : 3_000;
  const instalmentsRequired = result.totalBurden > instalmentThreshold;

  return (
    <div>
      {/* ── Anchor explainer ── */}
      <p className="mb-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        As a self-employed Canadian real estate agent you are responsible for{" "}
        <strong className="text-slate-900">your own income tax, CPP/QPP contributions, and quarterly instalments</strong>.
        Enter your numbers below for an estimate based on 2025 federal and provincial brackets.
      </p>

      {/* ── Header ── */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
          <Calculator className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Canadian Realtor Tax Estimator</h2>
          <p className="text-sm text-slate-500">2025 federal + provincial · all 13 provinces and territories</p>
        </div>
      </div>

      {/* ── Inputs ── */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Gross Commission Income */}
        <div>
          <label htmlFor="gci" className="block text-sm font-medium text-slate-700">
            Gross Commission Income (GCI)
          </label>
          <p className="mt-0.5 text-xs text-slate-400">Your total commission earnings for the year (after brokerage splits)</p>
          <div className="relative mt-1.5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input
              id="gci"
              type="number"
              inputMode="numeric"
              min={0}
              step={5_000}
              value={gci}
              onChange={(e) => setGci(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-7 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Expenses */}
        <div>
          <label htmlFor="expenses" className="block text-sm font-medium text-slate-700">
            Total Business Expenses
          </label>
          <p className="mt-0.5 text-xs text-slate-400">Vehicle, marketing, MLS dues, desk fees, software, mileage, etc.</p>
          <div className="relative mt-1.5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input
              id="expenses"
              type="number"
              inputMode="numeric"
              min={0}
              step={1_000}
              value={expenses}
              onChange={(e) => setExpenses(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-7 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Province */}
        <div>
          <label htmlFor="province" className="block text-sm font-medium text-slate-700">
            Province / Territory
          </label>
          <p className="mt-0.5 text-xs text-slate-400">Where you file taxes (residency on Dec 31)</p>
          <select
            id="province"
            value={province}
            onChange={(e) => setProvince(e.target.value as Province)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {PROVINCE_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Deal Count */}
        <div>
          <label htmlFor="dealCount" className="block text-sm font-medium text-slate-700">
            Projected Deal Count
          </label>
          <p className="mt-0.5 text-xs text-slate-400">How many deals you expect to close this year</p>
          <input
            id="dealCount"
            type="number"
            inputMode="numeric"
            min={0}
            max={200}
            step={1}
            value={dealCount}
            onChange={(e) => setDealCount(Number(e.target.value))}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* ── HST registration toggle ── */}
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <input
          id="hstRegistered"
          type="checkbox"
          checked={hstRegistered}
          onChange={(e) => setHstRegistered(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
        />
        <label htmlFor="hstRegistered" className="flex-1 text-sm text-slate-700">
          <span className="font-medium text-slate-900">I am registered for {hstTypeLabel}.</span>
          <span className="ml-1 text-xs text-slate-500">
            CRA requires registration once gross revenue from taxable supplies exceeds $30,000 in any
            four consecutive calendar quarters (small-supplier threshold).
          </span>
        </label>
      </div>

      {/* ── Net income callout ── */}
      <div className="mt-8 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Net Self-Employment Income</p>
          <p className="mt-0.5 text-[11px] text-slate-400">GCI minus deductible expenses — this is what&rsquo;s taxed</p>
        </div>
        <p className="text-2xl font-bold text-slate-900">{fmt0(netIncome)}</p>
      </div>

      {/* ── HERO RESULT: Total tax burden ── */}
      <div className="mt-8">
        <div className="rounded-xl border-2 border-blue-400 bg-gradient-to-br from-blue-50 to-violet-50 px-6 py-8 text-center">
          <p className="text-sm font-medium text-blue-700">Your estimated total tax &amp; CPP burden:</p>
          <p className="mt-2 text-5xl font-black tracking-tight text-blue-900 sm:text-6xl">
            {fmt0(result.totalBurden)}
          </p>
          <p className="mt-3 text-sm text-blue-700">
            Effective rate{" "}
            <strong className="font-bold">{fmtPct(result.effectiveRate)}</strong> on {fmt0(netIncome)} of net income
          </p>
        </div>

        {/* Consequence line */}
        <p className="mt-3 text-center text-[13px] leading-relaxed text-slate-500">
          After tax, you keep roughly <strong className="text-slate-900">{fmt0(takeHome)}</strong> ·{" "}
          {netIncome > 0 ? Math.round((takeHome / netIncome) * 100) : 0}% of your net income.
        </p>
      </div>

      {/* ── Quarterly instalments ── */}
      <div className="mt-8 rounded-xl border border-violet-200 bg-violet-50 p-5">
        <div className="flex items-start gap-3">
          <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-violet-900">
              Quarterly instalment estimate: {fmt0(result.quarterlyEstimate)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-violet-700">
              CRA requires quarterly instalments once you owe more than $3,000 in tax for two consecutive years.
              Due dates: <strong>March 15, June 15, September 15, December 15</strong>.
              Missing instalments triggers compounding interest.
            </p>
          </div>
        </div>
      </div>

      {/* ── Secondary: breakdown cards ── */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
          <p className="text-xs font-medium text-slate-500">Federal Tax</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{fmt0(result.federalTax)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
          <p className="text-xs font-medium text-slate-500">Provincial Tax</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{fmt0(result.provincialTax)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
          <p className="text-xs font-medium text-slate-500">
            {province === "quebec" ? "QPP" : "CPP"} Contribution
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">{fmt0(result.totalCPP)}</p>
        </div>
      </div>

      {/* ── Per-deal tax portion ── */}
      {dealCount > 0 && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">
            <strong>Per-deal tax portion:</strong>{" "}
            Across {dealCount} closed deals this year, the tax estimate works out to{" "}
            <strong className="text-emerald-950">{fmt0(result.perDealSetAside)}</strong> per deal.
          </p>
        </div>
      )}

      {/* ── Detailed breakdown ── */}
      <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-slate-500 hover:text-slate-700">
          View full breakdown
        </summary>
        <div className="grid gap-2 border-t border-slate-200 p-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
            <span className="text-xs text-slate-500">Gross Commission Income</span>
            <span className="text-sm font-semibold text-slate-800">{fmt0(gci)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
            <span className="text-xs text-slate-500">Business Expenses</span>
            <span className="text-sm font-semibold text-slate-800">−{fmt0(expenses)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 sm:col-span-2">
            <span className="text-xs text-slate-500">Net Self-Employment Income</span>
            <span className="text-sm font-bold text-slate-900">{fmt0(netIncome)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
            <span className="text-xs text-slate-500">Federal Tax (after BPA &amp; CPP credits)</span>
            <span className="text-sm font-semibold text-slate-800">{fmt0(result.federalTax)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
            <span className="text-xs text-slate-500">{PROVINCE_LABELS[province]} Provincial Tax</span>
            <span className="text-sm font-semibold text-slate-800">{fmt0(result.provincialTax)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
            <span className="text-xs text-slate-500">{province === "quebec" ? "QPP" : "CPP"} Tier 1</span>
            <span className="text-sm font-semibold text-slate-800">{fmt0(result.cpp1Contribution)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
            <span className="text-xs text-slate-500">{province === "quebec" ? "QPP" : "CPP"} Tier 2</span>
            <span className="text-sm font-semibold text-slate-800">{fmt0(result.cpp2Contribution)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 sm:col-span-2">
            <span className="text-xs font-medium text-blue-600">Total Tax &amp; CPP Burden</span>
            <span className="text-sm font-bold text-blue-700">{fmt0(result.totalBurden)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 sm:col-span-2">
            <span className="text-xs font-medium text-emerald-600">Net Take-Home</span>
            <span className="text-sm font-bold text-emerald-700">{fmt0(takeHome)}</span>
          </div>
        </div>
      </details>

      {/* ── Show how this was calculated ── */}
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowCalculation((v) => !v)}
          aria-expanded={showCalculation}
          aria-controls="tax-calc-disclosure"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50"
        >
          <span>Show how this was calculated</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
              showCalculation ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
        <div
          id="tax-calc-disclosure"
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            showCalculation ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-6 border-t border-slate-200 px-4 py-5 text-sm text-slate-700">
              {/* Canonical disclaimer */}
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                <strong>This is a tax information tool only.</strong> The figures below estimate amounts that
                may be owed for the {result.taxYear} tax year based on rules published by the CRA. For filing
                decisions, consult a qualified tax professional or CPA.
              </div>

              {/* 1 — Federal + Provincial Bracket Math */}
              <section>
                <h4 className="text-sm font-semibold text-slate-900">
                  1. Federal &amp; Provincial Bracket Math
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Income tax in Canada is progressive: each dollar is taxed at the rate of the bracket
                  it falls into. The federal-taxable amount used below is net self-employment income
                  ({fmt0(netIncome)}) minus the {cppLabel} deduction
                  ({fmt0(result.cpp1Contribution * 0.5 + result.cpp2Contribution)}) ={" "}
                  <strong>{fmt0(fedTaxableForBrackets)}</strong>.
                </p>

                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Federal brackets ({result.taxYear})
                </p>
                <div className="mt-1 overflow-hidden rounded-md border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Bracket</th>
                        <th className="px-3 py-2 text-right font-medium">Rate</th>
                        <th className="px-3 py-2 text-right font-medium">Income in bracket</th>
                        <th className="px-3 py-2 text-right font-medium">Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {fedSlices.map((s, i) => (
                        <tr key={`fed-${i}`} className={s.incomeInBracket > 0 ? "" : "text-slate-400"}>
                          <td className="px-3 py-2">
                            {fmt0(s.from)} – {s.to === Infinity ? "∞" : fmt0(s.to)}
                          </td>
                          <td className="px-3 py-2 text-right">{fmtPct(s.rate)}</td>
                          <td className="px-3 py-2 text-right">{fmt0(s.incomeInBracket)}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">
                            {fmt0(s.taxInBracket)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  After bracket math, the engine applies the federal Basic Personal Amount credit
                  ({fmt0(FEDERAL_BPA)} × {fmtPct(FEDERAL_BPA_RATE)}) and the {cppLabel} employee-portion
                  credit, then{isQuebec ? " applies the 16.5% Quebec abatement, " : " "}producing a
                  federal tax estimate of <strong>{fmt0(result.federalTax)}</strong>.
                </p>

                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {PROVINCE_LABELS[province]} brackets ({result.taxYear})
                </p>
                <div className="mt-1 overflow-hidden rounded-md border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Bracket</th>
                        <th className="px-3 py-2 text-right font-medium">Rate</th>
                        <th className="px-3 py-2 text-right font-medium">Income in bracket</th>
                        <th className="px-3 py-2 text-right font-medium">Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {provSlices.map((s, i) => (
                        <tr key={`prov-${i}`} className={s.incomeInBracket > 0 ? "" : "text-slate-400"}>
                          <td className="px-3 py-2">
                            {fmt0(s.from)} – {s.to === Infinity ? "∞" : fmt0(s.to)}
                          </td>
                          <td className="px-3 py-2 text-right">{fmtPct(s.rate)}</td>
                          <td className="px-3 py-2 text-right">{fmt0(s.incomeInBracket)}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">
                            {fmt0(s.taxInBracket)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  After applying the {PROVINCE_LABELS[province]} Basic Personal Amount
                  ({fmt0(provInfo.basicPersonalAmount)} × {fmtPct(provInfo.lowestRate)}), the {cppLabel}
                  employee-portion credit
                  {province === "ontario" ? ", and the Ontario surtax" : ""}, the provincial tax
                  estimate is <strong>{fmt0(result.provincialTax)}</strong>.
                </p>
                <p className="mt-2 text-[11px] italic text-slate-400">
                  Source: CRA T1 General — federal and provincial tax tables ({result.taxYear}).
                </p>
              </section>

              {/* 2 — CPP/QPP Self-Employment Calculation */}
              <section>
                <h4 className="text-sm font-semibold text-slate-900">
                  2. {cppLabel} Self-Employment Contributions
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Self-employed individuals pay both the employee and employer halves of {cppLabel}.
                  Contributions apply on net self-employment income above the basic exemption
                  ($3,500), up to the year&rsquo;s maximum pensionable earnings.
                </p>
                <ul className="mt-2 space-y-1 text-xs text-slate-700">
                  <li>
                    <strong>{cppLabel} Tier 1</strong> (on earnings $3,500 – $71,300 at{" "}
                    {isQuebec ? "12.80%" : "11.90%"} self-employed rate):{" "}
                    <strong>{fmt0(result.cpp1Contribution)}</strong>
                  </li>
                  <li>
                    <strong>{cppLabel} Tier 2</strong> (on earnings $71,300 – $81,200 at{" "}
                    {isQuebec ? "8.00%" : "8.00%"} self-employed rate):{" "}
                    <strong>{fmt0(result.cpp2Contribution)}</strong>
                  </li>
                  <li>
                    Total {cppLabel} contribution:{" "}
                    <strong>{fmt0(result.totalCPP)}</strong>
                  </li>
                </ul>
                {isQuebec && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Quebec residents contribute to QPP (Quebec Pension Plan) instead of CPP. The QPP
                    base rate is higher than CPP (12.80% combined vs 11.90% combined for self-employed).
                  </p>
                )}
                <p className="mt-2 text-[11px] italic text-slate-400">
                  Source: CRA Schedule 8 — {cppLabel} contributions on self-employment income (
                  {result.taxYear}).
                </p>
              </section>

              {/* 3 — HST/GST owed on GCI minus ITCs */}
              {hstRegistered && (
                <section>
                  <h4 className="text-sm font-semibold text-slate-900">
                    3. {hstTypeLabel} Owed on GCI Minus ITCs (illustrative)
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Registered agents collect {hstTypeLabel} on commission income and may claim Input
                    Tax Credits ({hstTypeLabel === "GST + QST" ? "ITCs/ITRs" : "ITCs"}) on the
                    {hstTypeLabel} paid on eligible business expenses. {hstTypeLabel} is remitted
                    separately from income tax.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    <li>
                      Applicable rate ({PROVINCE_LABELS[province]}):{" "}
                      <strong>{fmtPct(hstRate)}</strong>
                    </li>
                    <li>
                      {hstTypeLabel} collected on GCI: {fmt0(gci)} × {fmtPct(hstRate)} ={" "}
                      <strong>{fmt0(hstCollected)}</strong>
                    </li>
                    <li>
                      Illustrative ITC estimate (expenses × rate): {fmt0(expenses)} ×{" "}
                      {fmtPct(hstRate)} = <strong>−{fmt0(itcEstimate)}</strong>
                    </li>
                    <li>
                      Estimated net {hstTypeLabel} owed:{" "}
                      <strong>{fmt0(hstNetOwed)}</strong>
                    </li>
                  </ul>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    ITCs reduce {hstTypeLabel} owed. Common ITCs: office expenses, vehicle (business
                    portion), software subscriptions, marketing, professional fees. The estimated ITCs
                    shown are illustrative — actual ITCs depend on which specific expenses were
                    {hstTypeLabel}-bearing and the business-use portion of each.
                  </p>
                  <p className="mt-2 text-[11px] italic text-slate-400">
                    Source: CRA GST/HST Guide RC4022 — General Information for GST/HST Registrants.
                  </p>
                </section>
              )}

              {/* 4 — Instalment Base Formula */}
              <section>
                <h4 className="text-sm font-semibold text-slate-900">
                  4. Quarterly Instalment Base
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  CRA requires quarterly tax instalments when net tax owing exceeds{" "}
                  {fmt0(instalmentThreshold)}
                  {isQuebec ? " (Quebec residents — Revenu Québec threshold)" : ""} in the current
                  year and either of the two preceding years.
                </p>
                <ul className="mt-2 space-y-1 text-xs text-slate-700">
                  <li>
                    Estimated annual tax &amp; {cppLabel} burden:{" "}
                    <strong>{fmt0(result.totalBurden)}</strong>
                  </li>
                  <li>
                    Threshold check: {fmt0(result.totalBurden)} {instalmentsRequired ? ">" : "≤"}{" "}
                    {fmt0(instalmentThreshold)} —{" "}
                    {instalmentsRequired
                      ? "instalments may be required"
                      : "instalments may not be required"}
                  </li>
                  <li>
                    Quarterly instalment estimate: {fmt0(result.totalBurden)} ÷ 4 ={" "}
                    <strong>{fmt0(result.quarterlyEstimate)}</strong>
                  </li>
                  <li>
                    Due dates: <strong>March 15, June 15, September 15, December 15</strong>
                  </li>
                </ul>
                <p className="mt-2 text-[11px] italic text-slate-400">
                  Source: CRA Guide P110 — Paying Your Income Tax by Instalments; CRA Income Tax
                  Folio S1-F2-C1 (instalment requirements).
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* ── Disclaimer ── */}
      <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-xs leading-relaxed text-amber-900">
          <strong>Estimate only — not tax advice.</strong>{" "}
          This calculator uses 2025 federal and provincial brackets and assumes self-employment
          income only, no employment income, no RRSP deductions, no dependent credits, and no
          PREC structure. For precise planning, consult a CPA. Agent Runway is not a CPA firm.
        </p>
      </div>

      {/* ── Powered by ── */}
      <p className="mt-4 text-center text-[11px] text-slate-400">
        Powered by Claude from Anthropic. Every calculation cites the CRA source it came from.
      </p>

      {/* ── CTA ── */}
      <div className="mt-6 rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-950 to-slate-950 p-6 text-white">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-white">Want this running automatically all year?</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">
              Agent Runway tracks your GCI, expenses, and mileage in real time — and updates your tax estimate
              with every new deal. Quarterly instalment reminders, per-deal set-asides, and an agentic Flight Crew
              that executes tasks for you.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                See pricing
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Try the live demo
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
