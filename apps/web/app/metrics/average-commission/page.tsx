import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, DollarSign, TrendingUp, Home, Percent, Users, Building } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { definedTermSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Average Commission Per Deal Explained",
  description:
    "Learn how to calculate your average commission per deal and why it's a critical input for income forecasting and goal setting as a real estate agent.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/average-commission",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/average-commission",
  },
};

const avgCommissionSchema = definedTermSchema({
  name: "Average Commission Per Deal",
  alternateName: ["Avg. Commission", "GCI per Deal", "Per-Transaction Commission"],
  description:
    "Average Commission Per Deal is the agent's total Gross Commission Income (GCI) divided by the number of closed transactions in a period. It is a core planning input — multiply expected deal count by this figure to project annual GCI.",
  url: "/metrics/average-commission",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Real Estate Metrics", url: "/real-estate-metrics" },
  { name: "Average Commission", url: "/metrics/average-commission" },
]);

export default function AverageCommissionMetricPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(avgCommissionSchema) }}
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
              <DollarSign className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Average Commission Per Deal
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              The single number that ties your deal volume to your income goal —
              and the key to building a realistic annual forecast.
            </p>

            {/* Key stat pills */}
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {[
                { value: "$9,000", label: "avg. commission on $360k home at 2.5%" },
                { value: "3×", label: "more deals needed if avg commission is 3× lower" },
                { value: "1 number", label: "to reverse-engineer your entire annual plan" },
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

            {/* 1. What is average commission */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What is average commission per deal?</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Average commission per deal is your total{" "}
                <Link href="/metrics/gci" className="text-blue-600 underline underline-offset-2">
                  GCI
                </Link>{" "}
                for a period divided by the number of transactions you closed in that same period.
                It represents the typical revenue your business generates from a single closed
                transaction — and it is one of the most useful numbers in annual income planning.
              </p>

              {/* Formula card */}
              <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
                <span className="inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Formula
                </span>
                <div className="mt-3 text-xl font-bold text-slate-900">
                  <span className="text-blue-700">Avg Commission</span>{" "}
                  <span className="text-blue-500">=</span>{" "}
                  Total GCI{" "}
                  <span className="text-blue-500">÷</span>{" "}
                  Closed Deals
                </div>
                <div className="mt-4 rounded-xl border border-blue-100 bg-white px-5 py-3 text-sm">
                  <span className="text-slate-500">Example: </span>
                  <span className="font-semibold text-slate-800">$198,000 ÷ 22 deals = </span>
                  <span className="font-bold text-blue-700">$9,000 per deal</span>
                </div>
              </div>
            </div>

            {/* 2. Why it matters more than deal count — comparison */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Why average commission matters more than deal count</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Two agents can close the same number of transactions and earn very different
                incomes based entirely on average commission. Deal count alone is a misleading
                performance metric — average commission normalises for deal size.
              </p>

              {/* Comparison visual */}
              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>Agent</span>
                  <span className="text-center">Deals closed</span>
                  <span className="text-right">GCI earned</span>
                </div>
                {[
                  {
                    agent: "Agent A",
                    sub: "$1.2M homes · 2.5%",
                    deals: "15",
                    gci: "$450,000",
                    highlight: true,
                  },
                  {
                    agent: "Agent B",
                    sub: "$400k homes · 2.5%",
                    deals: "15",
                    gci: "$150,000",
                    highlight: false,
                  },
                ].map((row) => (
                  <div
                    key={row.agent}
                    className={`grid grid-cols-3 px-5 py-4 border-t border-slate-100 ${row.highlight ? "bg-emerald-50" : "bg-white"}`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{row.agent}</div>
                      <div className="text-xs text-slate-500">{row.sub}</div>
                    </div>
                    <div className="text-center text-sm font-medium text-slate-700 self-center">
                      {row.deals} deals
                    </div>
                    <div className={`text-right text-sm font-bold self-center ${row.highlight ? "text-emerald-700" : "text-slate-700"}`}>
                      {row.gci}
                    </div>
                  </div>
                ))}
                <div className="border-t border-slate-200 bg-blue-50 px-5 py-3 text-center">
                  <p className="text-xs text-blue-800">
                    <strong>Same deal count. 3× the income.</strong>{" "}
                    Average commission reveals the difference deal count hides.
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Reverse-engineering from a goal */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Using average commission for goal-setting</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Once you know your average commission, you can reverse-engineer your deal volume
                target from any income goal:
              </p>

              {/* Reverse formula */}
              <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
                <span className="inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Reverse Formula
                </span>
                <div className="mt-3 text-xl font-bold text-slate-900">
                  <span className="text-blue-700">Deals Needed</span>{" "}
                  <span className="text-blue-500">=</span>{" "}
                  GCI Goal{" "}
                  <span className="text-blue-500">÷</span>{" "}
                  Avg Commission
                </div>
              </div>

              {/* Deal count table */}
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>GCI Goal</span>
                  <span className="text-right">$7,500 avg</span>
                  <span className="text-right">$10,000 avg</span>
                  <span className="text-right">$15,000 avg</span>
                </div>
                {[
                  { goal: "$150,000", a: "20", b: "15", c: "10" },
                  { goal: "$200,000", a: "27", b: "20", c: "14" },
                  { goal: "$250,000", a: "34", b: "25", c: "17" },
                  { goal: "$300,000", a: "40", b: "30", c: "20" },
                ].map((row) => (
                  <div
                    key={row.goal}
                    className="grid grid-cols-4 border-t border-slate-100 bg-white px-4 py-3 text-sm"
                  >
                    <span className="font-semibold text-slate-900">{row.goal}</span>
                    <span className="text-right text-slate-600">{row.a} deals</span>
                    <span className="text-right font-medium text-blue-700">{row.b} deals</span>
                    <span className="text-right text-slate-600">{row.c} deals</span>
                  </div>
                ))}
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-center">
                  <span className="text-xs text-slate-500">Deals per year required to hit your GCI goal at different average commission levels</span>
                </div>
              </div>

              <p className="mt-4 leading-relaxed text-slate-600">
                Combined with your{" "}
                <Link href="/metrics/conversion-rate" className="text-blue-600 underline underline-offset-2">
                  conversion rate
                </Link>
                , this tells you exactly how many leads and pipeline deals you need per quarter —
                turning an abstract annual goal into a concrete monthly operating plan.
              </p>
            </div>

            {/* 4. What affects average commission — icon grid */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What affects average commission?</h2>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: Home,
                    label: "Average sale price",
                    desc: "The primary driver — higher price points generate more commission per deal",
                  },
                  {
                    icon: Percent,
                    label: "Commission rate structure",
                    desc: "Varies by brokerage, market, and negotiation",
                  },
                  {
                    icon: Users,
                    label: "Buyer vs seller mix",
                    desc: "Some markets pay different rates on buyer and seller sides",
                  },
                  {
                    icon: Building,
                    label: "Market segment",
                    desc: "Condos, single-family, luxury, and commercial carry different price points",
                  },
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

              {/* Key insight */}
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none">💡</span>
                  <p className="text-sm leading-relaxed text-amber-900">
                    <strong>Key insight:</strong> Moving upmarket by even $100k in average sale
                    price can reduce the number of deals you need to close by 20–30% to hit the
                    same income goal. Average commission is a powerful lever on your workload.
                  </p>
                </div>
              </div>
            </div>

            {/* Related metrics */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Related metrics</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { href: "/metrics/gci", label: "GCI", desc: "Total gross commissions — avg × deal count" },
                  { href: "/metrics/conversion-rate", label: "Conversion Rate", desc: "Tells you leads needed to hit deal target" },
                  { href: "/metrics/net-income", label: "Net Income", desc: "What average commission becomes after costs" },
                  { href: "/metrics/financial-runway", label: "Financial Runway", desc: "Higher avg deals = faster reserve building" },
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
                <h2 className="text-lg font-bold text-white">How Agent Runway tracks average commission</h2>
              </div>
            </div>
            <div className="px-8 py-6 sm:px-10">
              <p className="text-sm leading-relaxed text-slate-600">
                Agent Runway calculates your average commission per deal automatically from your
                transaction history — updated in real time as you log new deals. It uses your
                average commission as an input for income forecasting and deal-count projections,
                so your year-end estimates reflect your actual business mix rather than generic
                assumptions.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
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
      <MarketingFooter />
    </div>
  );
}
