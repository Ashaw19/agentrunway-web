import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Receipt,
  Megaphone,
  Building2,
  ShieldCheck,
  Monitor,
  Car,
  GraduationCap,
  Users,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { definedTermSchema, breadcrumbSchema } from "@/lib/schema";
import {
  EXPENSE_RATIO_BANDS,
  EXPENSE_RATIO_COPY,
  expenseRatioBand,
  expenseRatioBandRange,
  expenseRatioTone,
  formatExpenseRatio,
  type ExpenseRatioBandKey,
} from "@agent-runway/core/engines/expense-ratio-bands";
import { EXPENSE_RATIO_TONE_CLASS } from "@/lib/expense-ratio-style";

// The bands, target and colours on this page are the app's own
// (EXPENSE_RATIO_BANDS): what the page says is what a signed-in agent sees.
// Only the sentence beside each band is written here, and it carries no figure.
const BAND_NOTES: Record<ExpenseRatioBandKey, string> = {
  wellWithin: "The top band. The Expenses part of the Runway Score is at its highest here.",
  within: "At or under the target.",
  above: "Past the target. The dashboard starts to flag the ratio here.",
  wellAbove: "The last band. The Expenses part of the Runway Score is at its lowest here.",
};

const BAND_ROW_CLASS: Record<(typeof EXPENSE_RATIO_BANDS)[number]["tone"], string> = {
  emerald: "bg-emerald-50",
  blue: "bg-blue-50",
  amber: "bg-amber-50",
  red: "bg-red-50",
};

// The worked example further down, placed in its band like any other ratio.
const EXAMPLE_EXPENSES = 52_000;
const EXAMPLE_GCI = 180_000;
const EXAMPLE_RATIO = EXAMPLE_EXPENSES / EXAMPLE_GCI;
const EXAMPLE_BAND = expenseRatioBand(EXAMPLE_RATIO);
const EXAMPLE_CLASS = EXPENSE_RATIO_TONE_CLASS[expenseRatioTone(EXAMPLE_RATIO)];

export const metadata: Metadata = {
  title: "Real Estate Expense Ratio Explained",
  description:
    "Learn what expense ratio means for real estate agents, how to calculate it, and the target Agent Runway measures it against.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/expense-ratio",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/expense-ratio",
  },
};

const expenseRatioSchema = definedTermSchema({
  name: "Expense Ratio (Real Estate Agent)",
  alternateName: ["Cost Ratio", "Operating Expense Ratio"],
  description:
    "Expense Ratio for a real estate agent is total business expenses divided by Gross Commission Income (GCI), expressed as a percentage. It measures what share of revenue is consumed by operating costs (marketing, fees, tools, vehicle, insurance, education) before taxes. " +
    EXPENSE_RATIO_COPY.targetSentence,
  url: "/metrics/expense-ratio",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Real Estate Metrics", url: "/real-estate-metrics" },
  { name: "Expense Ratio", url: "/metrics/expense-ratio" },
]);

export default function ExpenseRatioMetricPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(expenseRatioSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <MarketingNav />
      <main>

        {/* Hero */}
        <section className="bg-slate-950 px-6 py-16 text-center sm:px-10 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <Link
              href="/real-estate-metrics"
              className="mb-5 inline-flex items-center rounded-full border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
            >
              ← Real Estate Metrics Library
            </Link>
            <div className="mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600">
              <Receipt className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Expense Ratio
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              How much of every commission dollar goes to running your business,
              and the target Agent Runway measures it against.
            </p>

            {/* Key stat pills */}
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {[
                { value: EXPENSE_RATIO_COPY.targetShort, label: "of GCI is Agent Runway's target" },
                { value: "Every $", label: "of expenses comes out of net income" },
                { value: "1 metric", label: "that reveals your cost efficiency" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-4 text-center sm:w-auto sm:min-w-[160px]"
                >
                  <div className="text-xl font-bold text-white">{s.value}</div>
                  <div className="mt-1 text-xs text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl space-y-14">

            {/* 1. What is expense ratio */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What is expense ratio?</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Expense ratio is your total business expenses expressed as a percentage of your
                gross commission income (GCI). It tells you how much of every commission dollar
                you earn is consumed by the cost of running your practice before income tax is
                applied.
              </p>
              <p className="mt-3 leading-relaxed text-slate-600">
                A low expense ratio means a higher proportion of GCI flows through to{" "}
                <Link href="/metrics/net-income" className="text-blue-600 underline underline-offset-2">
                  net income
                </Link>. A high ratio — particularly one driven by fixed costs rather than
                revenue-generating activities — is a warning sign for long-term profitability.
              </p>

              {/* Formula card */}
              <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
                <span className="inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Formula
                </span>
                <div className="mt-3 text-xl font-bold text-slate-900">
                  <span className="text-blue-700">Expense Ratio</span>{" "}
                  <span className="text-blue-500">=</span>{" "}
                  (Total Expenses ÷ GCI){" "}
                  <span className="text-blue-500">×</span>{" "}
                  100
                </div>
                <div className="mt-4 rounded-xl border border-blue-100 bg-white px-5 py-3 text-sm">
                  <span className="text-slate-500">Example: </span>
                  <span className="font-semibold text-slate-800">$52,000 ÷ $180,000 × 100 = </span>
                  <span className="font-bold text-blue-700">28.9% expense ratio</span>
                </div>
              </div>
            </div>

            {/* 2. What counts as an expense — icon grid */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What counts as a business expense?</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                For real estate agents, common deductible business expenses include:
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Megaphone, label: "Marketing & advertising", desc: "listings, digital ads, signage, print" },
                  { icon: Building2, label: "MLS & board fees", desc: "membership and listing service dues" },
                  { icon: ShieldCheck, label: "E&O insurance", desc: "errors and omissions coverage" },
                  { icon: Monitor, label: "Technology subscriptions", desc: "CRM, transaction tools, productivity apps" },
                  { icon: Car, label: "Vehicle expenses", desc: "business-use portion of fuel, insurance, lease" },
                  { icon: GraduationCap, label: "Professional development", desc: "licensing, courses, continuing education" },
                  { icon: Users, label: "Referral fees", desc: "fees paid to other agents for referrals" },
                  { icon: Receipt, label: "Office & desk fees", desc: "fees paid to brokerage for workspace" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div
                    key={label}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                      <Icon className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3">
                <p className="text-xs leading-relaxed text-slate-500">
                  <strong className="text-slate-700">Note:</strong> Brokerage commission splits
                  and per-transaction fees are typically excluded from the expense ratio and
                  treated separately as commission adjustments.
                </p>
              </div>
            </div>

            {/* 3. Target and bands */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What is a healthy expense ratio?</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Agent Runway measures the ratio against a target of{" "}
                <strong className="text-slate-800">{EXPENSE_RATIO_COPY.target}</strong>.{" "}
                {EXPENSE_RATIO_COPY.provenance} The app reads every ratio in one of four bands,
                and shows it in that band&apos;s colour on the dashboard, the Expenses page and
                your reports.
              </p>

              {/* Bands */}
              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                {EXPENSE_RATIO_BANDS.map((band) => {
                  const range = expenseRatioBandRange(band);
                  const tone = EXPENSE_RATIO_TONE_CLASS[band.tone];
                  return (
                    <div
                      key={band.key}
                      className={`flex items-start gap-4 border-t border-slate-100 first:border-t-0 px-5 py-4 ${BAND_ROW_CLASS[band.tone]}`}
                    >
                      <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${tone.bar}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {range[0].toUpperCase()}{range.slice(1)}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone.badge}`}>
                            {band.label}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{BAND_NOTES[band.key]}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                The bands are the same for every agent. A new agent building a client base
                may run a higher ratio for a while, and a very low ratio can also mean some
                expenses have not been recorded yet.
              </p>
            </div>

            {/* 4. Worked example */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Worked example</h2>

              <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
                <div className="border-b border-emerald-200 px-5 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Example Agent</span>
                </div>
                <div className="divide-y divide-emerald-100">
                  {[
                    { label: "Annual GCI", value: "$180,000" },
                    { label: "Marketing & advertising", value: "$18,000" },
                    { label: "MLS + board fees", value: "$4,200" },
                    { label: "E&O insurance", value: "$1,800" },
                    { label: "Technology subscriptions", value: "$3,600" },
                    { label: "Vehicle (business use)", value: "$9,600" },
                    { label: "Education + misc", value: "$14,800" },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between px-5 py-3 text-sm">
                      <span className="text-slate-600">{row.label}</span>
                      <span className="font-medium text-slate-800">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-5 py-3 text-sm border-t border-emerald-200">
                    <span className="font-semibold text-slate-800">Total expenses</span>
                    <span className="font-semibold text-slate-800">$52,000</span>
                  </div>
                  <div className="flex justify-between bg-white px-5 py-4">
                    <span className="font-bold text-slate-900">Expense ratio</span>
                    <span className={`text-lg font-bold ${EXAMPLE_CLASS.value}`}>
                      {formatExpenseRatio(EXAMPLE_RATIO)}
                      {EXAMPLE_BAND ? ` · ${EXAMPLE_BAND.label}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Related metrics */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Related metrics</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { href: "/metrics/gci", label: "GCI", desc: "The denominator in the expense ratio formula" },
                  { href: "/metrics/net-income", label: "Net Income", desc: "What remains after expenses are applied" },
                  { href: "/metrics/financial-runway", label: "Financial Runway", desc: "Fixed monthly costs directly affect runway" },
                  { href: "/metrics/average-commission", label: "Average Commission", desc: "Higher avg deal = more room for expenses" },
                ].map((m) => (
                  <Link
                    key={m.href}
                    href={m.href}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{m.label}</div>
                      <div className="text-xs text-slate-500">{m.desc}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* Agent Runway callout */}
        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="bg-blue-600 px-8 py-5 sm:px-10">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
                  <Receipt className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">How Agent Runway tracks expense ratio</h2>
              </div>
            </div>
            <div className="px-8 py-6 sm:px-10">
              <p className="text-sm leading-relaxed text-slate-600">
                Agent Runway tracks all business expenses by category and automatically calculates
                your expense ratio against your year-to-date GCI. The ratio is shown against
                the target of {EXPENSE_RATIO_COPY.target}, in the same band and colour on the
                dashboard, the Expenses page and your reports, beside the expense categories
                that make up the number.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Track your expense ratio in Agent Runway
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              Categorise expenses, see your ratio vs benchmark, and understand
              exactly what is consuming your commission income.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-7 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/real-estate-metrics"
                className="inline-flex items-center rounded-lg border border-slate-700 px-7 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Back to Metrics Library
              </Link>
            </div>
          </div>
        </section>

      </main>
      <MarketingFooter />
    </div>
  );
}
