import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Building2, CreditCard, Receipt, Wrench } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { definedTermSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Gross Commission Income (GCI) Explained",
  description:
    "Learn what gross commission income (GCI) means for real estate agents, how to calculate it, and why it's the most important metric in your business.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/gci",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/gci",
  },
};

const gciSchema = definedTermSchema({
  name: "Gross Commission Income (GCI)",
  termCode: "GCI",
  alternateName: ["Gross Commission", "Commission Revenue", "Real Estate Commission Income"],
  description:
    "Gross Commission Income (GCI) is the total commission a real estate agent earns from all transactions in a given period, before any brokerage splits, transaction fees, or business expenses are deducted. GCI is calculated as Sale Price × Commission Rate on each transaction, summed across the period.",
  url: "/metrics/gci",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Real Estate Metrics", url: "/real-estate-metrics" },
  { name: "GCI", url: "/metrics/gci" },
]);

export default function GCIMetricPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(gciSchema) }}
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
              <BarChart3 className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Gross Commission Income (GCI)
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              The top-line revenue number for every real estate agent — and the
              foundation for every other business metric that matters.
            </p>

            {/* Key stat pills */}
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {[
                { value: "$21,000", label: "GCI on a $700k sale at 3%" },
                { value: "37–55%", label: "typical take-home % of GCI" },
                { value: "#1", label: "metric every agent must track" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-4 text-center sm:w-auto sm:min-w-[150px]"
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

            {/* 1. What is GCI */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What is GCI?</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Gross Commission Income (GCI) is the total commission earned from all real estate
                transactions in a given period — before any deductions. It represents your gross
                revenue contribution, before your brokerage takes its split or any other fees are
                applied.
              </p>
              <p className="mt-3 leading-relaxed text-slate-600">
                GCI is the most fundamental metric in a real estate agent&apos;s business. It
                determines tax obligations, drives income forecasts, and is the basis for
                calculating every other performance metric.
              </p>

              {/* Formula card */}
              <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
                <span className="inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Formula
                </span>
                <div className="mt-3 text-xl font-bold text-slate-900">
                  Sale Price{" "}
                  <span className="text-blue-500">×</span>{" "}
                  Commission Rate{" "}
                  <span className="text-blue-500">=</span>{" "}
                  <span className="text-blue-700">GCI</span>
                </div>
                <div className="mt-4 rounded-xl border border-blue-100 bg-white px-5 py-3 text-sm">
                  <span className="text-slate-500">Example: </span>
                  <span className="font-semibold text-slate-800">$700,000 × 3% = </span>
                  <span className="font-bold text-blue-700">$21,000 GCI</span>
                </div>
              </div>
            </div>

            {/* 2. Annual GCI / worked example */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Annual GCI — a worked example</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                For a full year or quarter, GCI is the sum of all commissions earned across every
                transaction you closed in that period. Both buyer-side and seller-side transactions
                count separately — each represents its own commission income.
              </p>

              {/* Example box */}
              <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
                <div className="border-b border-emerald-200 px-5 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Worked Example</span>
                </div>
                <div className="divide-y divide-emerald-100">
                  {[
                    { label: "Closed transactions", value: "18 deals" },
                    { label: "Avg. sale price", value: "$566,666" },
                    { label: "Avg. commission rate (per side)", value: "2.5%" },
                    { label: "Total transaction volume", value: "$10.2M" },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between px-5 py-3 text-sm">
                      <span className="text-slate-600">{row.label}</span>
                      <span className="font-medium text-slate-800">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between bg-white px-5 py-4">
                    <span className="font-bold text-slate-900">Annual GCI</span>
                    <span className="text-lg font-bold text-emerald-700">$255,000</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. GCI ≠ Income — waterfall */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Why GCI is not the same as income</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                A common mistake is treating GCI as take-home income. In reality, GCI is gross
                revenue. From this number, several deductions reduce what the agent actually keeps:
              </p>

              {/* Waterfall visual */}
              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between bg-emerald-50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
                    <span className="font-semibold text-slate-900">Gross Commission Income</span>
                  </div>
                  <span className="font-bold text-emerald-700">$200,000</span>
                </div>
                {[
                  { icon: Building2, label: "Brokerage split (20%)", amount: "−$40,000" },
                  { icon: CreditCard, label: "Per-transaction fees", amount: "−$5,800" },
                  { icon: Receipt, label: "Monthly desk fees (annualised)", amount: "−$3,600" },
                  { icon: Wrench, label: "Business expenses", amount: "−$40,000" },
                ].map(({ icon: Icon, label, amount }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="text-sm text-slate-600">{label}</span>
                    </div>
                    <span className="text-sm font-medium text-red-600">{amount}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t-2 border-blue-200 bg-blue-50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-blue-500 ring-2 ring-blue-200" />
                    <span className="font-semibold text-slate-900">Pre-Tax Net Income</span>
                  </div>
                  <span className="font-bold text-blue-700">~$110,600</span>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                An agent earning $200,000 GCI may net $110,000–$130,000 before tax. Understanding
                the gap between GCI and{" "}
                <Link href="/metrics/net-income" className="text-blue-600 underline underline-offset-2">
                  net income
                </Link>{" "}
                is essential for informed business planning.
              </p>
            </div>

            {/* 4. Why GCI matters for forecasting */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Why GCI matters for forecasting</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                GCI is the input for every meaningful projection an agent needs. Your year-end
                income forecast, quarterly tax estimate, financial runway calculation, and pipeline
                valuation all start from GCI. Without accurate, real-time GCI tracking, all
                downstream metrics are unreliable.
              </p>

              {/* Key insight callout */}
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none">💡</span>
                  <p className="text-sm leading-relaxed text-amber-900">
                    <strong>Key insight:</strong> Tracking GCI monthly against seasonality-adjusted
                    expectations gives the clearest signal of whether you&apos;re ahead of or
                    behind your annual goal — before a slow quarter turns into a financial problem.
                  </p>
                </div>
              </div>
            </div>

            {/* Related metrics */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Related metrics</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { href: "/metrics/net-income", label: "Net Income", desc: "What GCI becomes after all deductions" },
                  { href: "/metrics/expense-ratio", label: "Expense Ratio", desc: "How much of GCI goes to business costs" },
                  { href: "/metrics/average-commission", label: "Average Commission", desc: "Your GCI divided by closed deal count" },
                  { href: "/metrics/financial-runway", label: "Financial Runway", desc: "How long your cash covers fixed costs" },
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
                  <BarChart3 className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">How Agent Runway tracks GCI</h2>
              </div>
            </div>
            <div className="px-8 py-6 sm:px-10">
              <p className="text-sm leading-relaxed text-slate-600">
                Agent Runway automatically calculates your GCI, net agent income, year-to-date
                pace, and projected year-end total every time you log a deal. Your brokerage split,
                transaction fees, and expense deductions are applied automatically so you always
                see the real number — not just the gross. Seasonality-aware forecasting shows
                exactly where you&apos;re tracking against your annual goal.
              </p>
              <Link
                href="/how-real-estate-agents-track-gci"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline underline-offset-2"
              >
                Read: How agents track GCI
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Track your GCI automatically with Agent Runway
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              Log your deals, set your annual goal, and see your real-time GCI pace, net income,
              and year-end forecast — all in one dashboard.
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
