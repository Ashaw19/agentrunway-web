"use client";

import { useState, useMemo } from "react";
import { Calculator, Info } from "lucide-react";

// ── Province data ────────────────────────────────────────────────────────────

interface ProvinceConfig {
  label: string;
  hstRate: number; // combined HST/GST rate (e.g., 0.15 for NB)
  /** Provincial brackets: [threshold, rate] — cumulative thresholds */
  brackets: [number, number][];
}

const PROVINCES: Record<string, ProvinceConfig> = {
  AB: {
    label: "Alberta",
    hstRate: 0.05,
    brackets: [[0, 0.10], [148_269, 0.12], [177_922, 0.13], [237_230, 0.14], [355_845, 0.15]],
  },
  BC: {
    label: "British Columbia",
    hstRate: 0.05,
    brackets: [[0, 0.0506], [47_937, 0.077], [95_875, 0.105], [110_076, 0.1229], [133_664, 0.147], [181_232, 0.168], [252_752, 0.205]],
  },
  MB: {
    label: "Manitoba",
    hstRate: 0.05,
    brackets: [[0, 0.108], [47_000, 0.1275], [100_000, 0.174]],
  },
  NB: {
    label: "New Brunswick",
    hstRate: 0.15,
    brackets: [[0, 0.094], [49_958, 0.14], [99_916, 0.16], [185_064, 0.195]],
  },
  NL: {
    label: "Newfoundland & Labrador",
    hstRate: 0.15,
    brackets: [[0, 0.087], [43_198, 0.145], [86_395, 0.158], [154_244, 0.178], [215_943, 0.198], [275_870, 0.208], [551_739, 0.213], [1_103_478, 0.218]],
  },
  NS: {
    label: "Nova Scotia",
    hstRate: 0.15,
    brackets: [[0, 0.0879], [29_590, 0.1495], [59_180, 0.1667], [93_000, 0.175], [150_000, 0.21]],
  },
  ON: {
    label: "Ontario",
    hstRate: 0.13,
    brackets: [[0, 0.0505], [51_446, 0.0915], [102_894, 0.1116], [150_000, 0.1216], [220_000, 0.1316]],
  },
  PE: {
    label: "Prince Edward Island",
    hstRate: 0.15,
    brackets: [[0, 0.098], [32_656, 0.138], [64_313, 0.167], [105_000, 0.183], [140_000, 0.187]],
  },
  QC: {
    label: "Quebec",
    hstRate: 0.14975,
    brackets: [[0, 0.14], [51_780, 0.19], [103_545, 0.24], [126_000, 0.2575]],
  },
  SK: {
    label: "Saskatchewan",
    hstRate: 0.05,
    brackets: [[0, 0.105], [52_057, 0.125], [148_734, 0.145]],
  },
  NT: {
    label: "Northwest Territories",
    hstRate: 0.05,
    brackets: [[0, 0.059], [50_597, 0.086], [101_198, 0.122], [164_525, 0.1405]],
  },
  NU: {
    label: "Nunavut",
    hstRate: 0.05,
    brackets: [[0, 0.04], [53_268, 0.07], [106_537, 0.09], [173_205, 0.115]],
  },
  YT: {
    label: "Yukon",
    hstRate: 0.05,
    brackets: [[0, 0.064], [55_867, 0.09], [111_733, 0.109], [154_906, 0.128], [500_000, 0.15]],
  },
};

// ── Federal brackets (2025) ──────────────────────────────────────────────────

const FEDERAL_BRACKETS: [number, number][] = [
  [0, 0.15],
  [57_375, 0.205],
  [114_750, 0.26],
  [158_468, 0.29],
  [220_000, 0.33],
];

const BASIC_PERSONAL_AMOUNT = 16_129;

// ── CPP constants (2025) ─────────────────────────────────────────────────────

const CPP_RATE = 0.119; // combined employee + employer
const CPP_EXEMPTION = 3_500;
const CPP_MAX_PENSIONABLE = 71_300;
const CPP2_MAX = 79_400;
const CPP2_RATE = 0.08; // CPP2 rate (employee + employer for self-employed)

// ── Tax calculation ──────────────────────────────────────────────────────────

function calcBracketTax(income: number, brackets: [number, number][]): number {
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [threshold, rate] = brackets[i];
    const nextThreshold = brackets[i + 1]?.[0] ?? Infinity;
    const taxableInBracket = Math.min(income, nextThreshold) - threshold;
    if (taxableInBracket <= 0) break;
    tax += taxableInBracket * rate;
  }
  return tax;
}

interface TaxResult {
  federalTax: number;
  provincialTax: number;
  cpp: number;
  hstGst: number;
  totalTax: number;
  effectiveRate: number;
  perDealSetAside: number;
  monthlyReserve: number;
  netIncome: number;
  taxableIncome: number;
}

function calculateTax(
  gci: number,
  splitPct: number,
  expenses: number,
  province: string,
  avgDeals: number,
): TaxResult {
  const afterSplit = gci * (splitPct / 100);
  const taxableIncome = Math.max(0, afterSplit - expenses);

  // Federal tax
  const grossFederal = calcBracketTax(taxableIncome, FEDERAL_BRACKETS);
  const bpaCredit = BASIC_PERSONAL_AMOUNT * 0.15;
  const federalTax = Math.max(0, grossFederal - bpaCredit);

  // Provincial tax
  const prov = PROVINCES[province];
  const provincialTax = prov ? calcBracketTax(taxableIncome, prov.brackets) : 0;

  // CPP (self-employed = both portions)
  const cppPensionable = Math.min(taxableIncome, CPP_MAX_PENSIONABLE) - CPP_EXEMPTION;
  const cpp1 = Math.max(0, cppPensionable) * CPP_RATE;
  const cpp2Pensionable = Math.min(taxableIncome, CPP2_MAX) - CPP_MAX_PENSIONABLE;
  const cpp2 = Math.max(0, cpp2Pensionable) * CPP2_RATE;
  const cpp = cpp1 + cpp2;

  // HST/GST (on gross commission — agent collects on full GCI before split)
  const hstRate = prov?.hstRate ?? 0.05;
  const hstGst = gci > 30_000 ? afterSplit * hstRate : 0;

  const totalTax = federalTax + provincialTax + cpp + hstGst;
  const effectiveRate = taxableIncome > 0 ? totalTax / taxableIncome : 0;
  const perDealSetAside = avgDeals > 0 ? totalTax / avgDeals : 0;
  const monthlyReserve = totalTax / 12;
  const netIncome = taxableIncome - federalTax - provincialTax - cpp;

  return {
    federalTax,
    provincialTax,
    cpp,
    hstGst,
    totalTax,
    effectiveRate,
    perDealSetAside,
    monthlyReserve,
    netIncome,
    taxableIncome,
  };
}

// ── Formatter ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ── Component ────────────────────────────────────────────────────────────────

export function TaxSavingsCalculator() {
  const [gci, setGci] = useState(200_000);
  const [splitPct, setSplitPct] = useState(80);
  const [expenses, setExpenses] = useState(15_000);
  const [province, setProvince] = useState("ON");
  const [avgDeals, setAvgDeals] = useState(12);

  const result = useMemo(
    () => calculateTax(gci, splitPct, expenses, province, avgDeals),
    [gci, splitPct, expenses, province, avgDeals],
  );

  return (
    <div>
      {/* Anchor text */}
      <p className="mb-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        Most Canadian real estate agents should set aside{" "}
        <strong className="text-slate-900">25&ndash;40% of their commission</strong>{" "}
        for taxes. Use the calculator below to refine your number.
      </p>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
          <Calculator className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tax Set-Aside Calculator</h2>
          <p className="text-sm text-slate-500">Estimate based on 2025 Canadian tax brackets</p>
        </div>
      </div>

      {/* ── Inputs ── */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* GCI */}
        <div>
          <label htmlFor="gci" className="block text-sm font-medium text-slate-700">
            Annual Gross Commission Income (GCI)
          </label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input
              id="gci"
              type="number"
              min={0}
              step={5000}
              value={gci}
              onChange={(e) => setGci(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-7 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Split */}
        <div>
          <label htmlFor="split" className="block text-sm font-medium text-slate-700">
            Your Split (% you keep)
          </label>
          <div className="relative mt-1">
            <input
              id="split"
              type="number"
              min={0}
              max={100}
              step={5}
              value={splitPct}
              onChange={(e) => setSplitPct(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
          </div>
        </div>

        {/* Expenses */}
        <div>
          <label htmlFor="expenses" className="block text-sm font-medium text-slate-700">
            Estimated Business Expenses
          </label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input
              id="expenses"
              type="number"
              min={0}
              step={1000}
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
          <select
            id="province"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {Object.entries(PROVINCES)
              .sort(([, a], [, b]) => a.label.localeCompare(b.label))
              .map(([code, { label }]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
          </select>
        </div>

        {/* Average deals */}
        <div className="sm:col-span-2">
          <label htmlFor="deals" className="block text-sm font-medium text-slate-700">
            Average Deals Per Year
          </label>
          <input
            id="deals"
            type="number"
            min={1}
            max={200}
            step={1}
            value={avgDeals}
            onChange={(e) => setAvgDeals(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:max-w-[200px]"
          />
        </div>
      </div>

      {/* ── Results ── */}
      <div className="mt-10">
        {/* ── HERO: Monthly reserve ── */}
        <div className="mb-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-6 py-8 text-center">
          <p className="text-sm font-medium text-emerald-700">Recommended Monthly Tax Reserve</p>
          <p className="mt-2 text-5xl font-black tracking-tight text-emerald-900 sm:text-6xl">
            {fmt(result.monthlyReserve)}
          </p>
          <p className="mt-3 text-sm text-emerald-600">
            {pct(result.effectiveRate)} of your {fmt(result.taxableIncome)} net business income
          </p>
        </div>

        {/* Actionable insight */}
        <p className="mb-8 text-center text-sm text-slate-500">
          If you&apos;re not consistently setting this aside, you&apos;re likely
          underestimating your tax liability.
        </p>

        {/* ── Secondary: key numbers ── */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs font-medium text-slate-500">Total Annual Tax</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{fmt(result.totalTax)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs font-medium text-slate-500">Set Aside Per Deal</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{fmt(result.perDealSetAside)}</p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 text-center">
            <p className="text-xs font-medium text-blue-600">Estimated Net Income</p>
            <p className="mt-1 text-lg font-bold text-blue-900">{fmt(result.netIncome)}</p>
          </div>
        </div>

        {/* ── Tertiary: detailed breakdown (collapsed feel) ── */}
        <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-slate-500 hover:text-slate-700">
            View full breakdown
          </summary>
          <div className="grid gap-2 border-t border-slate-200 p-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
              <span className="text-xs text-slate-500">Federal Income Tax</span>
              <span className="text-sm font-semibold text-slate-800">{fmt(result.federalTax)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
              <span className="text-xs text-slate-500">Provincial Tax ({PROVINCES[province]?.label})</span>
              <span className="text-sm font-semibold text-slate-800">{fmt(result.provincialTax)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
              <span className="text-xs text-slate-500">CPP (Both Portions)</span>
              <span className="text-sm font-semibold text-slate-800">{fmt(result.cpp)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
              <span className="text-xs text-slate-500">HST/GST ({(PROVINCES[province]?.hstRate * 100).toFixed(1)}%)</span>
              <span className="text-sm font-semibold text-slate-800">{fmt(result.hstGst)}</span>
            </div>
          </div>
        </details>

        {/* Info note */}
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-xs leading-relaxed text-slate-500">
            This is a simplified estimate. It does not account for RRSP
            contributions, other tax credits, PREC/corporate structures, or ITCs
            on HST/GST. For real-time tracking tailored to your business,{" "}
            <a href="/demo" className="text-blue-600 underline underline-offset-2 hover:text-blue-500">
              try Agent Runway
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

