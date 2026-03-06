import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, DollarSign } from "lucide-react";

export const metadata: Metadata = {
  title: "Average Commission Per Deal Explained | Agent Runway",
  description:
    "Learn how to calculate your average commission per deal and why it's a critical input for income forecasting and goal setting as a real estate agent.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/average-commission",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/average-commission",
  },
};

export default function AverageCommissionMetricPage() {
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
              <DollarSign className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Average Commission Per Deal
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              The single number that ties your deal volume to your income goal —
              and the key to building a realistic annual forecast.
            </p>
          </div>
        </section>

        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <article className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:text-slate-900 prose-h3:text-lg prose-h3:text-slate-800 prose-p:leading-relaxed prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-slate-800">

              <h2>What is average commission per deal?</h2>
              <p>
                Average commission per deal is your total{" "}
                <Link href="/metrics/gci">GCI</Link> for a period divided by the
                number of transactions you closed in that same period. It represents
                the typical revenue your business generates from a single closed
                transaction — and it is one of the most useful numbers in annual
                income planning.
              </p>

              <h2>How to calculate average commission</h2>
              <p>
                <strong>Average Commission = Total GCI ÷ Number of Closed Deals</strong>
              </p>

              <h3>Example</h3>
              <p>
                An agent closes 22 transactions in a year and earns $198,000 in GCI.
                Their average commission per deal is $9,000. If they want to earn
                $225,000 next year and expect a similar average deal size, they need
                to close 25 transactions — approximately two per month.
              </p>

              <h2>Why average commission matters more than deal count</h2>
              <p>
                Two agents can close the same number of transactions and earn very
                different incomes based entirely on average commission. An agent
                closing $1.2M homes at 2.5% earns $30,000 per side. An agent
                closing $400,000 homes at the same rate earns $10,000 per side.
                Three times the deal volume would be required to match the same income.
              </p>
              <p>
                This is why deal count alone is a misleading performance metric.
                Average commission normalises for deal size and gives a clearer
                picture of income efficiency.
              </p>

              <h2>Using average commission for goal-setting</h2>
              <p>
                Once you know your average commission, you can reverse-engineer your
                deal volume target from any income goal:
              </p>
              <p>
                <strong>Required Deals = Annual GCI Goal ÷ Average Commission</strong>
              </p>
              <p>
                Combined with your{" "}
                <Link href="/metrics/conversion-rate">conversion rate</Link>, this
                tells you exactly how many leads, pipeline deals, and closed
                transactions you need per quarter to hit your target — turning
                an abstract annual goal into a concrete monthly operating plan.
              </p>

              <h2>What affects average commission?</h2>
              <ul>
                <li>
                  <strong>Average sale price</strong> — the primary driver; higher
                  price points generate more commission per deal
                </li>
                <li>
                  <strong>Commission rate structure</strong> — varies by brokerage,
                  market, and negotiation
                </li>
                <li>
                  <strong>Buyer vs seller mix</strong> — some agents earn different
                  rates on buyer and seller sides depending on their market structure
                </li>
                <li>
                  <strong>Market segment</strong> — condos, single-family, luxury,
                  and commercial segments carry different typical sale prices
                </li>
              </ul>

            </article>
          </div>
        </section>

        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 sm:p-10">
            <h2 className="text-xl font-bold text-slate-900">
              How Agent Runway tracks average commission
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Agent Runway calculates your average commission per deal automatically
              from your transaction history — updated in real time as you log new
              deals. It uses your average commission as an input for income
              forecasting and deal-count projections, so your year-end estimates
              reflect your actual business mix rather than generic assumptions.
            </p>
          </div>
        </section>

        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              See your average deal size in Agent Runway
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              Understand your real income per transaction and build forecasts
              that reflect your actual business — not industry averages.
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
