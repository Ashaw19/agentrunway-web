import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TrendingUp, Building2, CreditCard, Receipt, Wrench, Landmark } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { definedTermSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Net Income for Real Estate Agents Explained",
  description:
    "Understand net income for real estate agents — what it is, how to calculate it from GCI, and why it matters more than gross commissions.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/net-income",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/net-income",
  },
};

const netIncomeSchema = definedTermSchema({
  name: "Net Income (Real Estate Agent)",
  alternateName: ["Take-home Income", "Agent Net Income", "After-Expense Income"],
  description:
    "Net income for a real estate agent is what remains from Gross Commission Income (GCI) after brokerage splits, transaction fees, desk fees, and all business expenses are deducted — but before income tax. It is the true measure of business profitability.",
  url: "/metrics/net-income",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Real Estate Metrics", url: "/real-estate-metrics" },
  { name: "Net Income", url: "/metrics/net-income" },
]);

export default function NetIncomeMetricPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(netIncomeSchema) }}
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
              <TrendingUp className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Net Income
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              What actually lands in your pocket after every deduction — the
              number that GCI alone will never tell you.
            </p>

            {/* Key stat pills */}
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {[
                { value: "~37%", label: "of GCI after all deductions (typical Ontario agent)" },
                { value: "5 layers", label: "of deductions between GCI and take-home" },
                { value: "$0", label: "tax owed on money you don't realise you earned" },
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

            {/* 1. What is net income */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What is net income for a real estate agent?</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Net income is the amount remaining after all business-related deductions have been
                applied to your gross commission income. It represents your true business profit
                before personal income tax.
              </p>
              <p className="mt-3 leading-relaxed text-slate-600">
                Many agents focus on{" "}
                <Link href="/metrics/gci" className="text-blue-600 underline underline-offset-2">
                  GCI
                </Link>{" "}
                as the headline number — but a $180,000 GCI year and a $120,000 GCI year can
                result in very similar net income if the first agent runs a significantly higher
                cost structure. Net income is the only number that accurately reflects the
                financial outcome of a year of work.
              </p>

              {/* GCI vs Net comparison */}
              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-2 divide-x divide-slate-200">
                  <div className="bg-slate-50 px-5 py-4 text-center">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agent A — GCI</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">$180,000</div>
                    <div className="mt-1 text-xs text-slate-400">High expense structure</div>
                  </div>
                  <div className="bg-slate-50 px-5 py-4 text-center">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agent B — GCI</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">$120,000</div>
                    <div className="mt-1 text-xs text-slate-400">Lean expense structure</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200">
                  <div className="bg-white px-5 py-4 text-center">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">Net Income</div>
                    <div className="mt-2 text-xl font-bold text-amber-700">$68,000</div>
                    <div className="mt-1 text-xs text-slate-400">After 38% net cost ratio</div>
                  </div>
                  <div className="bg-white px-5 py-4 text-center">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Net Income</div>
                    <div className="mt-2 text-xl font-bold text-emerald-700">$72,000</div>
                    <div className="mt-1 text-xs text-slate-400">After 40% net cost ratio</div>
                  </div>
                </div>
                <div className="border-t border-slate-200 bg-blue-50 px-5 py-3 text-center">
                  <p className="text-xs text-blue-800">
                    <strong>Agent B earns more net income despite $60,000 less GCI.</strong>{" "}
                    GCI alone is misleading.
                  </p>
                </div>
              </div>
            </div>

            {/* 2. How to calculate net income — step-by-step waterfall */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">How to calculate net income — step by step</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Net income is calculated by working down through each layer of deduction from GCI.
                Here is the full waterfall for an Ontario agent earning $210,000 GCI:
              </p>

              {/* Waterfall */}
              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between bg-emerald-50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
                    <span className="font-semibold text-slate-900">Gross Commission Income</span>
                  </div>
                  <span className="font-bold text-emerald-700">$210,000</span>
                </div>
                {[
                  { icon: Building2, label: "Brokerage split (20%)", amount: "−$42,000", sub: "paid to brokerage" },
                  { icon: CreditCard, label: "Per-transaction fees", amount: "−$4,200", sub: "~$233/deal × 18 deals" },
                  { icon: Receipt, label: "Monthly desk fees", amount: "−$3,600", sub: "$300/mo × 12 months" },
                  { icon: Wrench, label: "Business expenses", amount: "−$48,000", sub: "marketing, MLS, E&O, tech, vehicle" },
                ].map(({ icon: Icon, label, amount, sub }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <div>
                        <div className="text-sm text-slate-700">{label}</div>
                        <div className="text-xs text-slate-400">{sub}</div>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-red-600">{amount}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t-2 border-blue-200 bg-blue-50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-blue-500 ring-2 ring-blue-200" />
                    <span className="font-semibold text-slate-900">Pre-Tax Net Income</span>
                  </div>
                  <span className="font-bold text-blue-700">$112,200</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Landmark className="h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <div className="text-sm text-slate-700">Federal + provincial tax + CPP</div>
                      <div className="text-xs text-slate-400">Ontario rates, 2025</div>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-red-600">−$34,000</span>
                </div>
                <div className="flex items-center justify-between border-t-2 border-emerald-200 bg-emerald-50 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
                    <span className="font-semibold text-slate-900">After-Tax Net Income</span>
                  </div>
                  <span className="font-bold text-emerald-700">~$78,200</span>
                </div>
                <div className="border-t border-slate-200 bg-slate-50 px-5 py-2 text-center">
                  <span className="text-xs text-slate-500">37% of original GCI — the true bottom line.</span>
                </div>
              </div>
            </div>

            {/* 3. Why net income matters more */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Why net income matters more than GCI</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                GCI is useful for comparing production across agents and markets. But for personal
                financial planning — saving for retirement, building an emergency fund, investing
                in the business — only net income is actionable.
              </p>
              <p className="mt-3 leading-relaxed text-slate-600">
                Tracking pre-tax net income throughout the year also enables preparing for tax obligations.
                Rather than discovering a large tax obligation at filing time, agents who monitor
                net income can calculate their quarterly instalment obligations and set aside the
                right amount from each commission cheque.
              </p>

              {/* Key insight */}
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none">💡</span>
                  <p className="text-sm leading-relaxed text-amber-900">
                    <strong>Key insight:</strong> Setting financial goals based on GCI alone
                    routinely leads agents to overestimate their available cash. Always plan
                    from net — not gross.
                  </p>
                </div>
              </div>
            </div>

            {/* 4. Net income vs financial runway */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Net income vs. financial runway</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                  <div className="text-sm font-semibold text-blue-800">Net Income</div>
                  <p className="mt-2 text-sm text-blue-700 leading-relaxed">
                    A <strong>backward-looking</strong> measure of what you earned after costs
                    and tax this period.
                  </p>
                </div>
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
                  <div className="text-sm font-semibold text-purple-800">
                    <Link href="/metrics/financial-runway" className="hover:underline underline-offset-2">
                      Financial Runway →
                    </Link>
                  </div>
                  <p className="mt-2 text-sm text-purple-700 leading-relaxed">
                    A <strong>forward-looking</strong> measure of how long you can sustain the
                    business without new income.
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                Both are essential. Net income tells you how the year went. Runway tells you how
                vulnerable you are to a slow stretch ahead.
              </p>
            </div>

            {/* Related metrics */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Related metrics</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { href: "/metrics/gci", label: "GCI", desc: "Your gross commission income — before deductions" },
                  { href: "/metrics/expense-ratio", label: "Expense Ratio", desc: "Expenses as a % of GCI" },
                  { href: "/metrics/financial-runway", label: "Financial Runway", desc: "Months of coverage at current burn rate" },
                  { href: "/metrics/average-commission", label: "Average Commission", desc: "GCI divided by closed deal count" },
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
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">How Agent Runway calculates net income</h2>
              </div>
            </div>
            <div className="px-8 py-6 sm:px-10">
              <p className="text-sm leading-relaxed text-slate-600">
                Agent Runway shows your net agent income alongside GCI at every level — per deal,
                month-to-date, and year-to-date. Your brokerage split percentage, transaction fee
                rate, and monthly desk fee are configured once and applied automatically to every
                transaction. The platform also calculates your estimated tax obligation using
                current federal and provincial rates for all 13 Canadian provinces and territories.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              See your real net income in Agent Runway
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              Stop estimating. Know your exact net income after every split,
              fee, expense, and tax — updated in real time.
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
