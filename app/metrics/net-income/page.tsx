import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";

export const metadata: Metadata = {
  title: "Net Income for Real Estate Agents Explained | Agent Runway",
  description:
    "Understand net income for real estate agents — what it is, how to calculate it from GCI, and why it matters more than gross commissions.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/net-income",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/net-income",
  },
};

export default function NetIncomeMetricPage() {
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
              <TrendingUp className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Net Income
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              What actually lands in your pocket after every deduction — the
              number that GCI alone will never tell you.
            </p>
          </div>
        </section>

        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <article className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:text-slate-900 prose-h3:text-lg prose-h3:text-slate-800 prose-p:leading-relaxed prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-slate-800">

              <h2>What is net income for a real estate agent?</h2>
              <p>
                Net income is the amount of money remaining after all business-related
                deductions have been applied to your gross commission income. It
                represents your true business profit before personal income tax.
              </p>
              <p>
                Many agents focus on{" "}
                <Link href="/metrics/gci">GCI</Link> as the headline number —
                but GCI tells only part of the story. A $180,000 GCI year and a
                $120,000 GCI year can result in very similar net income if the first
                agent runs a significantly higher cost structure. Net income is the
                only number that accurately reflects the financial outcome of a year
                of work.
              </p>

              <h2>How to calculate net income</h2>
              <p>
                Net income for a real estate agent is calculated by working down
                through each layer of deduction:
              </p>
              <p>
                <strong>GCI</strong><br />
                − Brokerage commission split<br />
                − Per-transaction fees<br />
                − Monthly desk or franchise fees (annualised)<br />
                − Business expenses (marketing, MLS, E&O, technology, vehicle, etc.)<br />
                <strong>= Pre-tax net income</strong>
              </p>
              <p>
                Pre-tax net income is then subject to federal and provincial income
                tax, CPP (or QPP in Quebec), and any other personal tax obligations.
                After these, you arrive at after-tax net income — what you actually
                deposit into your personal accounts.
              </p>

              <h3>Example</h3>
              <p>
                An Ontario agent earns $210,000 GCI. After a 20% brokerage split
                ($42,000), $4,200 in transaction fees, $3,600 in desk fees, and
                $48,000 in business expenses, their pre-tax net income is $112,200.
                After approximately $34,000 in income tax and CPP, their after-tax
                net is roughly $78,200 — about 37% of the original GCI figure.
              </p>

              <h2>Why net income matters more than GCI</h2>
              <p>
                GCI is useful for comparing production across agents and markets.
                But for personal financial planning — saving for retirement,
                building an emergency fund, investing in the business — only net
                income is actionable. Setting financial goals based on GCI alone
                routinely leads agents to overestimate their available cash.
              </p>
              <p>
                Tracking pre-tax net income throughout the year also enables
                accurate tax planning. Rather than discovering a large tax
                obligation at filing time, agents who monitor net income can
                calculate their quarterly instalment obligations and set aside
                the right amount from each commission cheque.
              </p>

              <h2>The difference between net income and financial runway</h2>
              <p>
                Net income is a backward-looking measure of what you earned.{" "}
                <Link href="/metrics/financial-runway">Financial runway</Link> is
                a forward-looking measure of how long you can sustain your business
                without new income. Both are essential, and they answer different
                questions: net income tells you how the year went; runway tells
                you how vulnerable you are to a slow stretch.
              </p>

            </article>
          </div>
        </section>

        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 sm:p-10">
            <h2 className="text-xl font-bold text-slate-900">
              How Agent Runway calculates net income
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Agent Runway shows your net agent income alongside GCI at every
              level — per deal, month-to-date, and year-to-date. Your brokerage
              split percentage, transaction fee rate, and monthly desk fee are
              configured once during onboarding and applied automatically to every
              transaction. The platform also calculates your estimated tax
              obligation using current federal and provincial rates for all
              13 Canadian provinces and territories.
            </p>
          </div>
        </section>

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
