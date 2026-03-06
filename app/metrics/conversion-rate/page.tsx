import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";

export const metadata: Metadata = {
  title: "Real Estate Conversion Rate Explained | Agent Runway",
  description:
    "Understand conversion rate for real estate agents — from lead to client, and client to closed deal. Learn how to calculate and improve yours.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/conversion-rate",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/conversion-rate",
  },
};

export default function ConversionRateMetricPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      <MarketingNav />

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
              <ArrowUpRight className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Conversion Rate
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              How efficiently you turn leads into clients, and clients into
              closed deals — a direct measure of business productivity.
            </p>
          </div>
        </section>

        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <article className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:text-slate-900 prose-h3:text-lg prose-h3:text-slate-800 prose-p:leading-relaxed prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-slate-800">

              <h2>What is conversion rate?</h2>
              <p>
                Conversion rate measures the percentage of prospects at one stage of
                your pipeline that successfully advance to the next. For real estate
                agents, there are two primary conversion rates that matter:
              </p>
              <ul>
                <li>
                  <strong>Lead-to-client conversion</strong> — the percentage of
                  inbound leads or referrals that become signed buyer or listing
                  clients
                </li>
                <li>
                  <strong>Client-to-close conversion</strong> — the percentage of
                  active clients that result in a completed, commission-generating
                  transaction
                </li>
              </ul>
              <p>
                Together, these two rates describe the full efficiency of your
                business pipeline. A high lead volume with a low conversion rate
                is just as problematic as a low lead volume with a high rate —
                both limit your income ceiling.
              </p>

              <h2>How to calculate conversion rate</h2>
              <p>
                <strong>Conversion Rate = (Outcomes ÷ Inputs) × 100</strong>
              </p>
              <p>
                For lead-to-client conversion: divide the number of signed clients
                by the number of qualified leads in the same period.
              </p>
              <p>
                For client-to-close conversion: divide the number of closed
                transactions by the number of active clients in the same period.
              </p>

              <h3>Example</h3>
              <p>
                An agent receives 60 qualified leads over a quarter and signs 18
                as clients. The lead-to-client conversion rate is 30%. Of those 18
                clients, 14 close a transaction. The client-to-close rate is 78%.
                Overall lead-to-close conversion is 23%.
              </p>

              <h2>What is a good conversion rate?</h2>
              <p>
                Benchmarks vary by market and lead source, but as a general
                reference for Canadian agents:
              </p>
              <ul>
                <li>
                  <strong>Lead-to-client:</strong> 20–40% is considered healthy
                  for qualified leads from referrals or organic sources; paid lead
                  sources typically convert lower
                </li>
                <li>
                  <strong>Client-to-close:</strong> 70–85% is a strong range;
                  lower rates often signal pipeline deals that stall due to pricing,
                  financing, or market conditions
                </li>
              </ul>

              <h2>Why conversion rate matters for income planning</h2>
              <p>
                Knowing your conversion rates lets you work backwards from your
                income goal. If your annual{" "}
                <Link href="/metrics/gci">GCI</Link> target requires 20 closed
                transactions and your lead-to-close rate is 25%, you need 80
                qualified leads per year — roughly 7 per month. Without this
                calculation, lead generation targets are arbitrary guesses.
              </p>
              <p>
                Monitoring conversion rate over time also surfaces operational
                problems early. A declining client-to-close rate, for example,
                may indicate pricing misalignment with current market conditions
                — something that requires a strategic adjustment before it
                materially affects annual income.
              </p>

            </article>
          </div>
        </section>

        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 sm:p-10">
            <h2 className="text-xl font-bold text-slate-900">
              How Agent Runway supports conversion tracking
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Agent Runway&apos;s pipeline module lets you track active deals by
              stage and assign close probabilities. Combined with your transaction
              history, this gives you a live view of how your pipeline converts
              to revenue — and probability-weighted forecasts that account for
              deals that may not close.
            </p>
          </div>
        </section>

        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              See your pipeline performance in Agent Runway
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              Track active deals, assign probabilities, and forecast year-end
              income from a single dashboard built for Canadian agents.
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
