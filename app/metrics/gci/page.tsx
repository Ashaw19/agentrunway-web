import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";

export const metadata: Metadata = {
  title: "Gross Commission Income (GCI) Explained | Agent Runway",
  description:
    "Learn what gross commission income (GCI) means for real estate agents, how to calculate it, and why it's the most important metric in your business.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/gci",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/gci",
  },
};

export default function GCIMetricPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      <MarketingNav />

      <main>

        {/* Hero */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-24">
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
              The top-line revenue number for every real estate agent — and
              the foundation for every other business metric that matters.
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <article className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:text-slate-900 prose-h3:text-lg prose-h3:text-slate-800 prose-p:leading-relaxed prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-slate-800">

              <h2>What is GCI?</h2>
              <p>
                Gross Commission Income (GCI) is the total commission earned from all
                real estate transactions in a given period — before any deductions.
                If a property sells for $700,000 at a 3% commission rate, the GCI
                from that transaction is $21,000. That number represents your gross
                revenue contribution, before your brokerage takes its split or any
                other fees are applied.
              </p>
              <p>
                GCI is the most fundamental metric in a real estate agent&apos;s
                business. It determines tax obligations, drives income forecasts, and
                is the basis for calculating every other performance metric.
              </p>

              <h2>How to calculate GCI</h2>
              <p>
                For a single transaction, GCI is straightforward:
              </p>
              <p>
                <strong>GCI = Sale Price × Commission Rate (your side)</strong>
              </p>
              <p>
                For a full year or quarter, GCI is the sum of all commissions earned
                across every transaction you closed in that period. Both buyer-side and
                seller-side transactions count separately — each represents its own
                commission income.
              </p>

              <h3>Example</h3>
              <p>
                An agent closes 18 transactions in a year across a mix of buyer and
                seller sides, with sale prices ranging from $350,000 to $900,000 and
                an average commission rate of 2.5% per side. If the total transaction
                value is $10.2 million, the agent&apos;s GCI is approximately $255,000.
              </p>

              <h2>Why GCI is not the same as income</h2>
              <p>
                A common mistake is treating GCI as take-home income. In reality,
                GCI is gross revenue. From this number, several deductions reduce
                what the agent actually keeps:
              </p>
              <ul>
                <li><strong>Brokerage commission split</strong> — typically 15–30% of GCI</li>
                <li><strong>Per-transaction fees</strong> — $200 to $600+ per closed deal</li>
                <li><strong>Monthly desk or franchise fees</strong> — a fixed recurring cost</li>
                <li><strong>Business expenses</strong> — marketing, MLS, insurance, technology</li>
                <li><strong>Income tax and CPP</strong> — federal and provincial obligations</li>
              </ul>
              <p>
                An agent earning $200,000 GCI may net $110,000–$130,000 before tax
                after all deductions. Understanding the gap between GCI and{" "}
                <Link href="/metrics/net-income">net income</Link> is essential for
                accurate financial planning.
              </p>

              <h2>Why GCI matters for forecasting</h2>
              <p>
                GCI is the input for every meaningful projection an agent needs.
                Your year-end income forecast, quarterly tax estimate, financial
                runway calculation, and pipeline valuation all start from GCI.
                Without accurate, real-time GCI tracking, all downstream metrics
                are unreliable.
              </p>
              <p>
                Tracking GCI monthly — and comparing each month&apos;s contribution
                against seasonality-adjusted expectations — gives agents the clearest
                signal of whether they are ahead of or behind their annual goal.
              </p>

            </article>
          </div>
        </section>

        {/* Agent Runway callout */}
        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 sm:p-10">
            <h2 className="text-xl font-bold text-slate-900">
              How Agent Runway tracks GCI
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Agent Runway automatically calculates your GCI, net agent income,
              year-to-date pace, and projected year-end total every time you log a
              deal. Your brokerage split, transaction fees, and expense deductions are
              applied automatically so you always see the real number — not just the
              gross. Seasonality-aware forecasting shows exactly where you&apos;re
              tracking against your annual goal.
            </p>
            <Link
              href="/how-real-estate-agents-track-gci"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline underline-offset-2"
            >
              Read the full guide: How agents track GCI
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Track your GCI automatically with Agent Runway
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              Log your deals, set your annual goal, and see your real-time
              GCI pace, net income, and year-end forecast — all in one dashboard.
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
