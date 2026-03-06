import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";

export const metadata: Metadata = {
  title: "Real Estate Expense Ratio Explained | Agent Runway",
  description:
    "Learn what expense ratio means for real estate agents, how to calculate it, and what the industry benchmark is for a healthy business.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/expense-ratio",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/expense-ratio",
  },
};

export default function ExpenseRatioMetricPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      <header className="border-b border-slate-800 px-6 py-5 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight text-white">
            Agent Runway
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
          >
            Sign In
          </Link>
        </div>
      </header>

      <main>

        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-24">
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
              How much of every commission dollar you spend running your
              business — and the benchmark that separates efficient agents
              from those quietly eroding their income.
            </p>
          </div>
        </section>

        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <article className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:text-slate-900 prose-h3:text-lg prose-h3:text-slate-800 prose-p:leading-relaxed prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-slate-800">

              <h2>What is expense ratio?</h2>
              <p>
                Expense ratio is your total business expenses expressed as a
                percentage of your gross commission income (GCI). It tells you how
                much of every commission dollar you earn is consumed by the cost
                of running your practice before income tax is applied.
              </p>
              <p>
                A low expense ratio means a higher proportion of GCI flows through
                to{" "}
                <Link href="/metrics/net-income">net income</Link>. A high ratio —
                particularly one driven by fixed costs rather than revenue-generating
                activities — is a warning sign for long-term profitability.
              </p>

              <h2>How to calculate expense ratio</h2>
              <p>
                <strong>Expense Ratio = (Total Business Expenses ÷ GCI) × 100</strong>
              </p>

              <h3>Example</h3>
              <p>
                An agent earns $180,000 GCI and spends $52,000 on business
                expenses (marketing, MLS fees, E&O insurance, technology,
                vehicle use, desk fees, and continuing education). Their
                expense ratio is 28.9% — within the healthy benchmark range.
              </p>

              <h2>What counts as a business expense?</h2>
              <p>
                For real estate agents, common deductible business expenses include:
              </p>
              <ul>
                <li>Marketing and advertising (listings, digital ads, signage)</li>
                <li>MLS and board membership fees</li>
                <li>Errors and Omissions (E&O) insurance</li>
                <li>Technology subscriptions (CRM, transaction management, tools)</li>
                <li>Vehicle expenses allocated to business use</li>
                <li>Professional development and continuing education</li>
                <li>Office or desk fees paid to brokerage</li>
                <li>Referral fees paid to other agents</li>
              </ul>
              <p>
                Note: brokerage commission splits and per-transaction fees are
                typically excluded from the expense ratio calculation and treated
                separately as commission adjustments before arriving at agent GCI.
              </p>

              <h2>What is the benchmark expense ratio?</h2>
              <p>
                The widely cited benchmark for a healthy real estate agent business
                is an expense ratio of <strong>25–30%</strong>. This range reflects
                sufficient investment in lead generation and business development
                without overspending relative to production.
              </p>
              <ul>
                <li>
                  <strong>Below 20%</strong> — may indicate underinvestment in
                  marketing or lead generation, potentially limiting future growth
                </li>
                <li>
                  <strong>25–30%</strong> — generally healthy; business is investing
                  appropriately in operations and growth
                </li>
                <li>
                  <strong>Above 40%</strong> — warrants review; fixed cost structure
                  may be too high relative to production volume
                </li>
              </ul>
              <p>
                These benchmarks apply most accurately to agents with established
                production. New agents in their first 1–2 years may run temporarily
                higher ratios as they build their client base.
              </p>

            </article>
          </div>
        </section>

        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 sm:p-10">
            <h2 className="text-xl font-bold text-slate-900">
              How Agent Runway tracks expense ratio
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Agent Runway tracks all business expenses by category and
              automatically calculates your expense ratio against your
              year-to-date GCI. The dashboard displays your ratio against the
              25–30% benchmark so you can see at a glance whether your cost
              structure is healthy — and which expense categories are driving
              the number up or down.
            </p>
          </div>
        </section>

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

      <footer className="border-t border-slate-800 bg-slate-950 px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm font-semibold text-white">Agent Runway</p>
          <p className="mt-1 text-xs text-slate-500">
            © {new Date().getFullYear()} Agent Runway. All rights reserved.
          </p>
        </div>
      </footer>

    </div>
  );
}
