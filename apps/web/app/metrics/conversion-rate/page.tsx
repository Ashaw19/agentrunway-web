import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Users, CheckCircle2, XCircle, TrendingDown } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { definedTermSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Real Estate Conversion Rate Explained",
  description:
    "Understand conversion rate for real estate agents — from lead to client, and client to closed deal. Learn how to calculate and improve yours.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/conversion-rate",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/conversion-rate",
  },
};

const conversionRateSchema = definedTermSchema({
  name: "Conversion Rate (Real Estate)",
  alternateName: ["Lead-to-Client Rate", "Client-to-Close Rate", "Lead Conversion"],
  description:
    "In real estate, conversion rate measures how effectively leads move through the pipeline. It is typically expressed as two ratios: lead-to-client conversion (signed buyer/seller agreements divided by total leads) and client-to-close conversion (closed transactions divided by signed clients).",
  url: "/metrics/conversion-rate",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Real Estate Metrics", url: "/real-estate-metrics" },
  { name: "Conversion Rate", url: "/metrics/conversion-rate" },
]);

export default function ConversionRateMetricPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(conversionRateSchema) }}
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
              <ArrowUpRight className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Conversion Rate
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              How efficiently you turn leads into clients, and clients into
              closed deals — a direct measure of business productivity.
            </p>

            {/* Key stat pills */}
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {[
                { value: "20–40%", label: "healthy lead-to-client rate (referrals)" },
                { value: "70–85%", label: "strong client-to-close rate" },
                { value: "80 leads", label: "needed at 25% rate to close 20 deals" },
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

            {/* 1. What is conversion rate */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What is conversion rate?</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Conversion rate measures the percentage of prospects at one stage of your pipeline
                that successfully advance to the next. For real estate agents, there are two
                primary conversion rates that matter:
              </p>

              {/* Two conversion types */}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-bold text-blue-900">Lead → Client</span>
                  </div>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    The % of qualified leads or referrals that become signed buyer or listing clients.
                  </p>
                  <div className="mt-3 rounded-lg bg-white border border-blue-100 px-3 py-2 text-xs font-medium text-blue-700">
                    Healthy range: 20–40%
                  </div>
                </div>
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-bold text-purple-900">Client → Close</span>
                  </div>
                  <p className="text-sm text-purple-800 leading-relaxed">
                    The % of active clients that result in a completed, commission-generating transaction.
                  </p>
                  <div className="mt-3 rounded-lg bg-white border border-purple-100 px-3 py-2 text-xs font-medium text-purple-700">
                    Strong range: 70–85%
                  </div>
                </div>
              </div>

              <p className="mt-4 leading-relaxed text-slate-600">
                Together, these two rates describe the full efficiency of your business pipeline.
                A high lead volume with a low conversion rate is just as problematic as a low
                lead volume with a high rate — both limit your income ceiling.
              </p>
            </div>

            {/* 2. Formula + worked example */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">How to calculate conversion rate</h2>

              {/* Formula card */}
              <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
                <span className="inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Formula
                </span>
                <div className="mt-3 text-xl font-bold text-slate-900">
                  <span className="text-blue-700">Conversion Rate</span>{" "}
                  <span className="text-blue-500">=</span>{" "}
                  (Outcomes ÷ Inputs){" "}
                  <span className="text-blue-500">×</span>{" "}
                  100
                </div>
              </div>

              {/* Pipeline funnel visual */}
              <div className="mt-6">
                <div className="text-sm font-semibold text-slate-700 mb-3">Pipeline funnel — worked example (one quarter):</div>
                <div className="space-y-2">
                  {/* Stage 1: Leads */}
                  <div className="flex items-center gap-3">
                    <div className="w-full rounded-xl bg-slate-100 border border-slate-200 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                        <span className="text-sm font-medium text-slate-700">Qualified leads</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900">60</span>
                    </div>
                  </div>

                  {/* Arrow + conversion rate */}
                  <div className="flex items-center gap-3 pl-4">
                    <div className="flex flex-col items-center">
                      <div className="h-6 w-px bg-slate-300" />
                    </div>
                    <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      Lead-to-client: 30% → 18 signed
                    </div>
                  </div>

                  {/* Stage 2: Clients */}
                  <div className="flex items-center gap-3">
                    <div className="w-full rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between" style={{ marginLeft: "5%" }}>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                        <span className="text-sm font-medium text-blue-800">Signed clients</span>
                      </div>
                      <span className="text-sm font-bold text-blue-900">18</span>
                    </div>
                  </div>

                  {/* Arrow + conversion rate */}
                  <div className="flex items-center gap-3 pl-4">
                    <div className="flex flex-col items-center">
                      <div className="h-6 w-px bg-slate-300" />
                    </div>
                    <div className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                      Client-to-close: 78% → 14 closed
                    </div>
                  </div>

                  {/* Stage 3: Closed */}
                  <div className="flex items-center gap-3">
                    <div className="w-full rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between" style={{ marginLeft: "10%" }}>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <span className="text-sm font-medium text-emerald-800">Closed deals</span>
                      </div>
                      <span className="text-sm font-bold text-emerald-900">14</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                    <span className="text-xs text-slate-600">
                      Overall lead-to-close: <strong>14 ÷ 60 = 23%</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Benchmarks */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What is a good conversion rate?</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Benchmarks vary by market and lead source. As a general reference for Canadian agents:
              </p>

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                {[
                  {
                    metric: "Lead-to-client (referrals/organic)",
                    healthy: "20–40%",
                    warning: "Below 15%",
                    note: "Paid lead sources typically convert lower than referrals",
                    color: "bg-blue-50",
                  },
                  {
                    metric: "Client-to-close",
                    healthy: "70–85%",
                    warning: "Below 60%",
                    note: "Low rates often signal pricing misalignment or financing issues",
                    color: "bg-purple-50",
                  },
                  {
                    metric: "Overall lead-to-close",
                    healthy: "15–30%",
                    warning: "Below 10%",
                    note: "Combined product of both rates above",
                    color: "bg-emerald-50",
                  },
                ].map((row) => (
                  <div
                    key={row.metric}
                    className={`border-t border-slate-100 first:border-t-0 px-5 py-4 ${row.color}`}
                  >
                    <div className="text-sm font-semibold text-slate-900">{row.metric}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" />
                        Healthy: {row.healthy}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                        <XCircle className="h-3 w-3" />
                        Warning: {row.warning}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{row.note}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Income planning math */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Using conversion rate for income planning</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Knowing your conversion rates lets you work backwards from your income goal.
                If your annual{" "}
                <Link href="/metrics/gci" className="text-blue-600 underline underline-offset-2">
                  GCI
                </Link>{" "}
                target requires 20 closed transactions and your lead-to-close rate is 25%, you
                need 80 qualified leads per year — roughly 7 per month. Without this calculation,
                lead generation targets are arbitrary guesses.
              </p>

              {/* Backwards calculation visual */}
              <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
                <div className="border-b border-emerald-200 px-5 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Backwards Plan: $200k GCI Goal</span>
                </div>
                <div className="divide-y divide-emerald-100 bg-white">
                  {[
                    { step: "1", label: "Annual GCI target", value: "$200,000" },
                    { step: "2", label: "Average commission per deal", value: "$10,000" },
                    { step: "3", label: "Deals needed (÷ avg commission)", value: "20 deals" },
                    { step: "4", label: "Client-to-close rate", value: "80%" },
                    { step: "5", label: "Active clients needed (÷ 80%)", value: "25 clients" },
                    { step: "6", label: "Lead-to-client rate", value: "25%" },
                    { step: "7", label: "Qualified leads needed (÷ 25%)", value: "100 leads/yr" },
                  ].map((row) => (
                    <div key={row.step} className="flex items-center justify-between px-5 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                          {row.step}
                        </span>
                        <span className="text-slate-600">{row.label}</span>
                      </div>
                      <span className="font-semibold text-slate-800">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-emerald-50 px-5 py-4">
                    <span className="font-bold text-slate-900">Monthly lead target</span>
                    <span className="text-lg font-bold text-emerald-700">~8–9 leads/mo</span>
                  </div>
                </div>
              </div>

              {/* Declining rate warning */}
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <TrendingDown className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Watch for declining rates</p>
                    <p className="mt-1 text-sm leading-relaxed text-amber-800">
                      A falling client-to-close rate over time often signals pricing misalignment
                      with current market conditions — requiring a strategic adjustment before it
                      materially affects annual income.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Related metrics */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Related metrics</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { href: "/metrics/average-commission", label: "Average Commission", desc: "Pairs with conversion rate to plan deal targets" },
                  { href: "/metrics/gci", label: "GCI", desc: "The output that conversion rate drives" },
                  { href: "/metrics/net-income", label: "Net Income", desc: "What closed deals ultimately produce" },
                  { href: "/metrics/financial-runway", label: "Financial Runway", desc: "Resilience while pipeline is converting" },
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
                  <ArrowUpRight className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">How Agent Runway supports conversion tracking</h2>
              </div>
            </div>
            <div className="px-8 py-6 sm:px-10">
              <p className="text-sm leading-relaxed text-slate-600">
                Agent Runway&apos;s pipeline module lets you track active deals by stage and assign
                close probabilities. Combined with your transaction history, this gives you a live
                view of how your pipeline converts to revenue — and probability-weighted forecasts
                that account for deals that may not close.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
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
      <MarketingFooter />
    </div>
  );
}
