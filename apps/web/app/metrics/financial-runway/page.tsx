import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Shield, Monitor, Building2, ShieldCheck, Car, Receipt } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { definedTermSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Financial Runway for Real Estate Agents Explained",
  description:
    "Learn what financial runway means for real estate agents, how to calculate it, and why it's the most important resilience metric for a commission-based business.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/financial-runway",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/financial-runway",
  },
};

const runwaySchema = definedTermSchema({
  name: "Financial Runway (Real Estate Agent)",
  alternateName: ["Cash Runway", "Months of Coverage", "Agent Runway"],
  description:
    "Financial runway for a real estate agent is the number of months current cash reserves can cover fixed business and personal expenses if no new commission income is received. It is the single best resilience metric for a commission-based business because income is inherently lumpy — agents can go 60 to 120 days between closings.",
  url: "/metrics/financial-runway",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Real Estate Metrics", url: "/real-estate-metrics" },
  { name: "Financial Runway", url: "/metrics/financial-runway" },
]);

export default function FinancialRunwayMetricPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(runwaySchema) }}
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
              <Shield className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Financial Runway
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              How long your business can sustain itself without a single new
              commission — the most important resilience metric for any
              real estate agent.
            </p>

            {/* Key stat pills */}
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {[
                { value: "6+ mo", label: "target for strong financial resilience" },
                { value: "< 1 mo", label: "critical threshold — immediate risk" },
                { value: "$0", label: "income needed to measure your exposure" },
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

            {/* 1. What is financial runway */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What is financial runway?</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Financial runway is the number of months your current cash reserve covers your
                fixed monthly business costs — assuming zero new income. It is borrowed from
                startup finance, where it describes how long a company can operate before running
                out of money. For real estate agents, it answers one critical question:
              </p>

              {/* Key question callout */}
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-center text-base font-medium italic text-slate-700">
                  &ldquo;If I don&apos;t close a deal for the next several months,
                  how long before I&apos;m in financial trouble?&rdquo;
                </p>
              </div>

              <p className="mt-4 leading-relaxed text-slate-600">
                Unlike most metrics, financial runway is entirely forward-looking. It doesn&apos;t
                describe past performance — it describes current vulnerability. An agent with high{" "}
                <Link href="/metrics/gci" className="text-blue-600 underline underline-offset-2">
                  GCI
                </Link>{" "}
                and low runway is more exposed than an agent with moderate GCI and a strong reserve.
              </p>

              {/* Formula card */}
              <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
                <span className="inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Formula
                </span>
                <div className="mt-3 text-xl font-bold text-slate-900">
                  <span className="text-blue-700">Runway (months)</span>{" "}
                  <span className="text-blue-500">=</span>{" "}
                  Cash Reserve{" "}
                  <span className="text-blue-500">÷</span>{" "}
                  Monthly Fixed Costs
                </div>
                <div className="mt-4 rounded-xl border border-blue-100 bg-white px-5 py-3 text-sm">
                  <span className="text-slate-500">Example: </span>
                  <span className="font-semibold text-slate-800">$24,000 ÷ $3,200 = </span>
                  <span className="font-bold text-blue-700">7.5 months runway</span>
                </div>
              </div>
            </div>

            {/* 2. What counts as fixed costs — icon grid */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">What counts as a fixed monthly cost?</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Monthly fixed costs should include all obligations that continue regardless of
                whether you close deals:
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Building2, label: "Brokerage desk fee", desc: "monthly flat fee paid to your brokerage" },
                  { icon: Receipt, label: "MLS & board fees", desc: "monthly or annualised membership dues" },
                  { icon: ShieldCheck, label: "E&O insurance", desc: "errors and omissions, monthly allocation" },
                  { icon: Monitor, label: "Technology subscriptions", desc: "CRM, e-sign, productivity tools" },
                  { icon: Car, label: "Vehicle allocation", desc: "business-use portion of monthly car costs" },
                  { icon: Shield, label: "Other recurring obligations", desc: "any fixed cost that continues without income" },
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
            </div>

            {/* 3. Worked example */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Worked example</h2>

              <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
                <div className="border-b border-emerald-200 px-5 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Example Agent</span>
                </div>
                <div className="divide-y divide-emerald-100">
                  {[
                    { label: "Cash reserve (dedicated business account)", value: "$24,000" },
                    { label: "Monthly desk fee", value: "$800" },
                    { label: "MLS fees (monthly)", value: "$320" },
                    { label: "E&O insurance (monthly)", value: "$150" },
                    { label: "CRM + technology", value: "$230" },
                    { label: "Vehicle allocation", value: "$700" },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between px-5 py-3 text-sm">
                      <span className="text-slate-600">{row.label}</span>
                      <span className="font-medium text-slate-800">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-5 py-3 text-sm border-t border-emerald-200">
                    <span className="font-semibold text-slate-800">Total monthly fixed costs</span>
                    <span className="font-semibold text-slate-800">$2,200</span>
                  </div>
                  <div className="flex justify-between bg-white px-5 py-4">
                    <span className="font-bold text-slate-900">Financial runway</span>
                    <span className="text-lg font-bold text-emerald-700">10.9 months</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Risk classification tiers */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Risk classification tiers</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                A practical way to classify runway is by months of coverage:
              </p>

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                {[
                  {
                    range: "Less than 1 month",
                    badge: "Critical",
                    badgeColor: "bg-red-100 text-red-800",
                    dot: "bg-red-500",
                    rowColor: "bg-red-50",
                    desc: "Immediate exposure. A deal falling through or any delay creates a genuine financial crisis.",
                  },
                  {
                    range: "1–3 months",
                    badge: "Warning",
                    badgeColor: "bg-orange-100 text-orange-800",
                    dot: "bg-orange-400",
                    rowColor: "bg-orange-50",
                    desc: "Limited buffer. The business is vulnerable to normal seasonal slowdowns or unexpected costs.",
                  },
                  {
                    range: "3–6 months",
                    badge: "Healthy",
                    badgeColor: "bg-emerald-100 text-emerald-800",
                    dot: "bg-emerald-500",
                    rowColor: "bg-emerald-50",
                    desc: "Adequate buffer for most market cycles. Can weather a slow quarter without financial stress.",
                  },
                  {
                    range: "6+ months",
                    badge: "Strong",
                    badgeColor: "bg-blue-100 text-blue-800",
                    dot: "bg-blue-500",
                    rowColor: "bg-blue-50",
                    desc: "Significant resilience. Can invest in growth, take risks, and ride out extended slow periods.",
                  },
                ].map((tier) => (
                  <div
                    key={tier.range}
                    className={`flex items-start gap-4 border-t border-slate-100 first:border-t-0 px-5 py-4 ${tier.rowColor}`}
                  >
                    <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${tier.dot}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{tier.range}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tier.badgeColor}`}>
                          {tier.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{tier.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Why agents specifically */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Why real estate agents need to monitor runway</h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                Commission income is inherently lumpy and seasonal. Most Canadian markets see
                transaction volume peak in spring and fall and slow significantly in December
                and January. An agent earning $200,000 per year may receive 60% of that income
                in just four months. If the remaining eight months of operating costs are not
                pre-funded, every slow stretch creates financial pressure.
              </p>

              {/* Seasonal income visualisation */}
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Typical seasonal income distribution
                </div>
                <div className="flex items-end gap-1.5 h-20">
                  {[
                    { month: "Jan", pct: 3 },
                    { month: "Feb", pct: 5 },
                    { month: "Mar", pct: 10 },
                    { month: "Apr", pct: 14 },
                    { month: "May", pct: 13 },
                    { month: "Jun", pct: 9 },
                    { month: "Jul", pct: 7 },
                    { month: "Aug", pct: 7 },
                    { month: "Sep", pct: 11 },
                    { month: "Oct", pct: 10 },
                    { month: "Nov", pct: 7 },
                    { month: "Dec", pct: 4 },
                  ].map(({ month, pct }) => (
                    <div key={month} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-sm bg-blue-400"
                        style={{ height: `${pct * 4}px` }}
                      />
                      <span className="text-[9px] text-slate-400">{month}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Fixed costs continue every month. Runway ensures you can cover obligations during low-income periods.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none">💡</span>
                  <p className="text-sm leading-relaxed text-amber-900">
                    <strong>Key insight:</strong> Agents with strong runway can invest in
                    marketing during slow periods, take time off without anxiety, and pursue
                    higher-value listings — rather than chasing deals simply to cover
                    immediate costs.
                  </p>
                </div>
              </div>
            </div>

            {/* Related metrics */}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Related metrics</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { href: "/metrics/net-income", label: "Net Income", desc: "Cash inflows that replenish your reserve" },
                  { href: "/metrics/expense-ratio", label: "Expense Ratio", desc: "Fixed cost levels directly reduce runway" },
                  { href: "/metrics/gci", label: "GCI", desc: "Gross commission — the source of reserves" },
                  { href: "/metrics/average-commission", label: "Average Commission", desc: "Bigger deals = faster reserve building" },
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
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">How Agent Runway measures financial runway</h2>
              </div>
            </div>
            <div className="px-8 py-6 sm:px-10">
              <p className="text-sm leading-relaxed text-slate-600">
                Agent Runway calculates your financial runway automatically from your declared
                cash reserve and your tracked monthly fixed costs. Your position is classified as
                Critical, Warning, Healthy, or Strong, and a composite runway score across six
                financial dimensions generates an overall letter grade (A+ to F) summarising your
                business&apos;s financial health. Both the runway month count and the composite
                score update in real time as your reserve and expenses change.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Know your runway number in Agent Runway
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              See exactly how many months your reserve covers — and get a
              composite score that reflects your overall business resilience.
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
