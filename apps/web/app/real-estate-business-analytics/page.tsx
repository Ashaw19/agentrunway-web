import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  Shield,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  Target,
  Clock,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { articleSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Real Estate Business Analytics Software",
  description:
    "Agent Runway gives real estate agents a better way to track GCI, forecast income, measure financial runway, and understand business performance.",
  openGraph: {
    url: "https://agentrunway.ca/real-estate-business-analytics",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/real-estate-business-analytics",
  },
};

const pageArticleSchema = articleSchema({
  headline: "Real Estate Business Analytics Software for Canadian Agents",
  description:
    "A framework for evaluating business analytics tools for real estate agents — what metrics matter, how to measure them, and why purpose-built software beats spreadsheets.",
  url: "/real-estate-business-analytics",
  datePublished: "2025-11-01",
  dateModified: "2026-04-16",
  imageUrl: "/og-image-v2.png",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Real Estate Business Analytics", url: "/real-estate-business-analytics" },
]);

// ── Why-analytics pain points ─────────────────────────────────────────────────

const PAIN_POINTS = [
  {
    icon: DollarSign,
    heading: "Do you know your real net income?",
    body: "GCI is a starting point, not the finish line. After commission splits, brokerage fees, transaction costs, and business expenses, the number that matters is what actually lands in your pocket.",
  },
  {
    icon: Target,
    heading: "Are you on pace to hit your goal?",
    body: "Closing deals feels great — but without seasonality-aware projections, it's impossible to know whether you're ahead or behind. Agent Runway tells you exactly where you'll land at year-end.",
  },
  {
    icon: Clock,
    heading: "How long can you cover your costs?",
    body: "Real estate income is lumpy. Your cash reserve needs to be measured against your fixed monthly obligations, not just eyeballed. Know your runway before you need it.",
  },
];

// ── Feature detail sections ───────────────────────────────────────────────────

const FEATURES = [
  {
    icon: BarChart3,
    tag: "GCI Tracking",
    heading: "Track Every Dollar of Commission Income",
    subheading:
      "Log deals as you close them. Watch your year-to-date GCI build against your annual goal.",
    bullets: [
      "Separate buyer and seller sides automatically",
      "Apply your commission split and transaction fee rate",
      "See net agent income — not just gross GCI",
      "Track pace against prior years",
    ],
  },
  {
    icon: TrendingUp,
    tag: "Income Forecasting",
    heading: "Forecast Your Annual Income",
    subheading:
      "Seasonality-aware projections combine your closed history with your probability-weighted pipeline.",
    bullets: [
      "Canadian real estate seasonality baked in",
      "P10–P90 probability bands show realistic outcome range",
      "Pipeline deals weighted by close probability",
      "5-year growth trajectory based on your pace and trend",
    ],
  },
  {
    icon: Shield,
    tag: "Financial Runway",
    heading: "Measure Your Financial Runway",
    subheading:
      "See exactly how many months your cash reserves cover your fixed costs — so you always know where you stand.",
    bullets: [
      "Track monthly recurring expenses by category",
      "Calculate runway from your actual cash reserve",
      "Risk classification: Critical, Warning, Healthy, Strong",
      "Composite runway score across 5 financial dimensions",
    ],
  },
  {
    icon: Sparkles,
    tag: "AI Business Insights",
    heading: "Get AI-Powered Business Insights",
    subheading:
      "Contextual insight cards surface patterns, opportunities, and data points based on your live data.",
    bullets: [
      "Insights tied to your actual numbers — not generic tips",
      "Insight cards ranked by potential impact",
      "Built-in AI chat assistant for business Q&A",
      "Tax estimates: quarterly instalments and per-deal set-asides",
    ],
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RealEstateBusinessAnalyticsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── JSON-LD (Article + BreadcrumbList) ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageArticleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10 sm:py-32">
          <div className="mx-auto max-w-3xl">

            {/* Badge */}
            <div className="mb-6 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              Built for Canadian Real Estate Agents
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Real Estate Business Analytics Software for Agents
            </h1>

            {/* Subheadline */}
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Agent Runway gives real estate agents a better way to{" "}
              <Link
                href="/how-real-estate-agents-track-gci"
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                track GCI
              </Link>
              , forecast income, measure financial runway, and understand their
              true business performance — all in one dashboard.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Learn More
              </Link>
            </div>
          </div>
        </section>

        {/* ── Why Agents Need Analytics ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">

            <div className="mb-14 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Why real estate agents need business analytics
              </h2>
              <p className="mt-4 text-lg text-slate-500">
                Tracking transactions is not the same as understanding your
                business.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-3">
              {PAIN_POINTS.map(({ icon: Icon, heading, body }) => (
                <div key={heading} className="flex flex-col items-start">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mb-2 text-base font-semibold text-slate-900">
                    {heading}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-500">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Feature Sections ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl space-y-20">

            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Every tool you need. One dashboard.
              </h2>
              <p className="mt-4 text-lg text-slate-500">
                Purpose-built analytics for agents who want financial clarity.
              </p>
            </div>

            {FEATURES.map(({ icon: Icon, tag, heading, subheading, bullets }, idx) => (
              <div
                key={tag}
                className={`flex flex-col gap-8 sm:flex-row sm:items-center ${
                  idx % 2 === 1 ? "sm:flex-row-reverse" : ""
                }`}
              >
                {/* Icon + text */}
                <div className="flex-1">
                  <span className="mb-3 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                    {tag}
                  </span>
                  <h3 className="mb-3 text-2xl font-bold tracking-tight text-slate-900">
                    {heading}
                  </h3>
                  <p className="mb-5 text-base leading-relaxed text-slate-600">
                    {subheading}
                  </p>
                  <ul className="space-y-2">
                    {bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-slate-600">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Visual placeholder panel */}
                <div className="flex h-48 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white sm:h-56">
                  <div className="flex flex-col items-center gap-3 text-slate-300">
                    <Icon className="h-12 w-12" />
                    <span className="text-xs font-medium">{tag}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Start understanding your business — not just your transactions.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              <Link
                href="/"
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                Agent Runway
              </Link>
              {" "}is built specifically for Canadian agents. Full provincial
              tax calculations, national seasonality data, and AI-powered
              insights — all connected to your live business numbers.
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
                href="/login"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Sign In
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
