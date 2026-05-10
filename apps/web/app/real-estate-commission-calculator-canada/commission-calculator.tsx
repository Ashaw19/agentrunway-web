"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Calculator, Info } from "lucide-react";

// ── Province HST/GST rates ──────────────────────────────────────────────────

interface ProvinceConfig {
  label: string;
  hstRate: number;
}

const PROVINCES: Record<string, ProvinceConfig> = {
  AB: { label: "Alberta", hstRate: 0.05 },
  BC: { label: "British Columbia", hstRate: 0.05 },
  MB: { label: "Manitoba", hstRate: 0.05 },
  NB: { label: "New Brunswick", hstRate: 0.15 },
  NL: { label: "Newfoundland & Labrador", hstRate: 0.15 },
  NS: { label: "Nova Scotia", hstRate: 0.15 },
  ON: { label: "Ontario", hstRate: 0.13 },
  PE: { label: "Prince Edward Island", hstRate: 0.15 },
  QC: { label: "Quebec", hstRate: 0.14975 },
  SK: { label: "Saskatchewan", hstRate: 0.05 },
  NT: { label: "Northwest Territories", hstRate: 0.05 },
  NU: { label: "Nunavut", hstRate: 0.05 },
  YT: { label: "Yukon", hstRate: 0.05 },
};

// ── Blended income tax estimate ─────────────────────────────────────────────

const BLENDED_TAX_RATE = 0.30;

// ── Calculation ─────────────────────────────────────────────────────────────

interface CommissionResult {
  grossCommission: number;
  afterSplit: number;
  afterFees: number;
  hstOwed: number;
  estimatedTax: number;
  netTakeHome: number;
  hstRate: number;
}

function calculateCommission(
  salePrice: number,
  commissionRate: number,
  brokerageSplit: number,
  transactionFee: number,
  province: string,
): CommissionResult {
  const grossCommission = salePrice * (commissionRate / 100);
  const afterSplit = grossCommission * (brokerageSplit / 100);
  const afterFees = Math.max(0, afterSplit - transactionFee);

  const hstRate = PROVINCES[province]?.hstRate ?? 0.05;
  const hstOwed = afterFees * hstRate;
  const estimatedTax = afterFees * BLENDED_TAX_RATE;
  const netTakeHome = afterFees - hstOwed - estimatedTax;

  return {
    grossCommission,
    afterSplit,
    afterFees,
    hstOwed,
    estimatedTax,
    netTakeHome,
    hstRate,
  };
}

// ── Formatter ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);

// ── Component ───────────────────────────────────────────────────────────────

export function CommissionCalculator() {
  const [salePrice, setSalePrice] = useState(500_000);
  const [commissionRate, setCommissionRate] = useState(2.5);
  const [brokerageSplit, setBrokerageSplit] = useState(80);
  const [transactionFee, setTransactionFee] = useState(500);
  const [province, setProvince] = useState("ON");

  const result = useMemo(
    () => calculateCommission(salePrice, commissionRate, brokerageSplit, transactionFee, province),
    [salePrice, commissionRate, brokerageSplit, transactionFee, province],
  );

  return (
    <div>
      {/* Anchor text */}
      <p className="mb-8 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
        For common Canadian inputs, this calculator estimates net take-home
        in roughly the{" "}
        <strong className="text-slate-900">40&ndash;60% range of the gross commission</strong>{" "}
        after brokerage split, transaction fees, HST/GST remitted to the CRA,
        and an estimated income-tax portion.
      </p>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
          <Calculator className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Per-Deal Commission Calculator</h2>
          <p className="text-sm text-slate-500">Estimate based on 2026 published CRA rates</p>
        </div>
      </div>

      {/* ── Inputs ── */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Sale Price */}
        <div>
          <label htmlFor="salePrice" className="block text-sm font-medium text-slate-700">
            Sale Price
          </label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input
              id="salePrice"
              type="number"
              inputMode="numeric"
              min={0}
              step={25000}
              value={salePrice}
              onChange={(e) => setSalePrice(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-7 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Commission Rate */}
        <div>
          <label htmlFor="commissionRate" className="block text-sm font-medium text-slate-700">
            Commission Rate (your side)
          </label>
          <div className="relative mt-1">
            <input
              id="commissionRate"
              type="number"
              inputMode="decimal"
              min={0}
              max={10}
              step={0.1}
              value={commissionRate}
              onChange={(e) => setCommissionRate(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
          </div>
        </div>

        {/* Brokerage Split */}
        <div>
          <label htmlFor="brokerageSplit" className="block text-sm font-medium text-slate-700">
            Brokerage Split (% you keep)
          </label>
          <div className="relative mt-1">
            <input
              id="brokerageSplit"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={5}
              value={brokerageSplit}
              onChange={(e) => setBrokerageSplit(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
          </div>
        </div>

        {/* Transaction Fee */}
        <div>
          <label htmlFor="transactionFee" className="block text-sm font-medium text-slate-700">
            Transaction Fee (per deal)
          </label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input
              id="transactionFee"
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              value={transactionFee}
              onChange={(e) => setTransactionFee(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-7 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Province */}
        <div className="sm:col-span-2">
          <label htmlFor="province" className="block text-sm font-medium text-slate-700">
            Province / Territory
          </label>
          <select
            id="province"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:max-w-[300px]"
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
      </div>

      {/* ── Results ── */}
      <div className="mt-10">
        {/* ── HERO: Net take-home ── */}
        <div className="mb-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-6 py-8 text-center">
          <p className="text-sm font-medium text-emerald-700">
            Your estimated take-home from this deal:
          </p>
          <p className="mt-2 text-5xl font-black tracking-tight text-emerald-900 sm:text-6xl">
            {fmt(result.netTakeHome)}
          </p>
          <p className="mt-3 text-sm text-emerald-600">
            after brokerage split, fees, HST, and estimated income tax
          </p>
        </div>

        {/* Consequence line */}
        <p className="mb-8 text-center text-[13px] leading-relaxed text-slate-500">
          That&apos;s {result.grossCommission > 0 ? Math.round((result.netTakeHome / result.grossCommission) * 100) : 0}% of your gross commission — the rest goes to your brokerage, the CRA, and fees.
        </p>

        {/* ── Secondary: key numbers ── */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs font-medium text-slate-500">Gross Commission</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{fmt(result.grossCommission)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs font-medium text-slate-500">After Brokerage Split</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{fmt(result.afterSplit)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs font-medium text-slate-500">After Transaction Fees</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{fmt(result.afterFees)}</p>
          </div>
        </div>

        {/* ── Tertiary: detailed breakdown (collapsed) ── */}
        <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-slate-500 hover:text-slate-700">
            View full breakdown
          </summary>
          <div className="grid gap-2 border-t border-slate-200 p-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
              <span className="text-xs text-slate-500">HST/GST Owed ({(result.hstRate * 100).toFixed(1)}%)</span>
              <span className="text-sm font-semibold text-slate-800">{fmt(result.hstOwed)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2">
              <span className="text-xs text-slate-500">Estimated Income Tax (~30%)</span>
              <span className="text-sm font-semibold text-slate-800">{fmt(result.estimatedTax)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 sm:col-span-2">
              <span className="text-xs font-medium text-emerald-600">Net Take-Home</span>
              <span className="text-sm font-bold text-emerald-700">{fmt(result.netTakeHome)}</span>
            </div>
          </div>
        </details>

        {/* Info note */}
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-xs leading-relaxed text-slate-500">
            Income tax estimate uses a ~30% blended rate. Actual rate
            depends on total annual income and province. For a more precise
            estimate, see our{" "}
            <Link
              href="/how-much-should-real-estate-agents-save-for-taxes-canada"
              className="text-blue-600 underline underline-offset-2 hover:text-blue-500"
            >
              tax calculator
            </Link>
            . This is an estimate based on rules published by the CRA.
            Verify with your accountant before making any filing or
            financial decision.
          </p>
        </div>
      </div>
    </div>
  );
}
