import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  ArrowUpRight,
  DollarSign,
  Receipt,
  TrendingUp,
  Shield,
  ArrowRight,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { collectionPageSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Real Estate Business Metrics",
  description:
    "Learn the key metrics real estate agents use to track GCI, conversion rate, expenses, and financial performance.",
  openGraph: {
    url: "https://agentrunway.ca/real-estate-metrics",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/real-estate-metrics",
  },
};

const metricsCollectionSchema = collectionPageSchema({
  name: "Real Estate Business Metrics",
  description:
    "A library of the core business metrics Canadian real estate agents use to measure performance: GCI, net income, average commission, conversion rate, expense ratio, and financial runway.",
  url: "/real-estate-metrics",
  items: [
    { name: "Gross Commission Income (GCI)", url: "/metrics/gci" },
    { name: "Net Income",                    url: "/metrics/net-income" },
    { name: "Average Commission Per Deal",    url: "/metrics/average-commission" },
    { name: "Conversion Rate",                url: "/metrics/conversion-rate" },
    { name: "Expense Ratio",                  url: "/metrics/expense-ratio" },
    { name: "Financial Runway",               url: "/metrics/financial-runway" },
  ],
});

const breadcrumb = breadcrumbSchema([
  { name: "Home",                    url: "/" },
  { name: "Real Estate Metrics",     url: "/real-estate-metrics" },
]);

// ── Metric cards ──────────────────────────────────────────────────────────────

const METRICS = [
  {
    icon: BarChart3,
    name: "Gross Commission Income (GCI)",
    description:
      "The total commission earned from real estate transactions before any deductions. GCI is the top-line revenue number every agent needs to track.",
    href: "/metrics/gci",
  },
  {
    icon: ArrowUpRight,
    name: "Conversion Rate",
    description:
      "The percentage of leads or prospects that result in a signed client or closed deal — a key indicator of business efficiency and pipeline quality.",
    href: "/metrics/conversion-rate",
  },
  {
    icon: DollarSign,
    name: "Average Commission",
    description:
      "Your total GCI divided by the number of closed deals. A higher average commission means fewer deals needed to reach your annual income goal.",
    href: "/metrics/average-commission",
  },
  {
    icon: Receipt,
    name: "Expense Ratio",
    description:
      "Total business expenses as a percentage of GCI. The industry benchmark for a healthy agent business is 25–30% of gross commission income.",
    href: "/metrics/expense-ratio",
  },
  {
    icon: TrendingUp,
    name: "Net Income",
    description:
      "What you actually keep after your brokerage split, transaction fees, desk fees, and business expenses are deducted from your GCI.",
    href: "/metrics/net-income",
  },
  {
    icon: Shield,
    name: "Financial Runway",
    description:
      "The number of months your current cash reserve covers your fixed monthly costs — the most critical indicator of business resilience.",
    href: "/metrics/financial-runway",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RealEstateMetricsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── JSON-LD (CollectionPage + BreadcrumbList) ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(metricsCollectionSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              Metrics Library
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Real Estate Business Metrics Every Agent Should Understand
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Successful agents track more than transactions and commissions.
              They monitor the key metrics that determine long-term business
              health — income pace, expense ratios, conversion efficiency, and
              financial resilience. This library explains each one.
            </p>
          </div>
        </section>

        {/* ── Metrics Grid ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">

            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                Core business metrics for real estate agents
              </h2>
              <p className="mt-3 text-base text-slate-500">
                Select a metric to read the full explanation.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {METRICS.map(({ icon: Icon, name, description, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-6 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 transition-colors group-hover:bg-blue-500">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">
                    {name}
                  </h3>
                  <p className="flex-1 text-sm leading-relaxed text-slate-500">
                    {description}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:gap-2 transition-all">
                    Read explanation
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Agent Runway tracks these ── */}
        <section className="bg-slate-50 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Agent Runway tracks all of these automatically
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-600">
              Every metric in this library is calculated and displayed in your
              Agent Runway dashboard — updated in real time as you log deals,
              track expenses, and update your pipeline. No manual formulas, no
              spreadsheets. Just the numbers that matter, always current.
            </p>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600">
              Built for Canadian agents, with full provincial tax calculations,
              national seasonality data, and{" "}
              <Link
                href="/real-estate-business-analytics"
                className="text-blue-600 underline-offset-2 hover:underline"
              >
                real estate business analytics
              </Link>
              {" "}purpose-built for how your business actually works.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center rounded-lg border border-slate-300 px-8 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                See All Features
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <MarketingFooter />
    </div>
  );
}
