import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  Shield,
  Receipt,
  FileText,
  Sparkles,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { CharterScarcityStrip } from "@/components/charter-scarcity-strip";
import { softwareApplicationSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Features — Real Estate Business Analytics",
  description:
    "Explore the features of Agent Runway, including GCI tracking, income forecasting, financial runway analysis, and AI insights for real estate agents.",
  openGraph: {
    url: "https://agentrunway.ca/features",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/features",
  },
};

const breadcrumb = breadcrumbSchema([
  { name: "Home",     url: "/" },
  { name: "Features", url: "/features" },
]);

// ── Feature data ──────────────────────────────────────────────────────────────

const FEATURES = [
  {
    id: "gci-tracking",
    icon: BarChart3,
    tag: "GCI Tracking",
    tagClass: "bg-blue-100 text-blue-700",
    iconClass: "text-blue-300",
    heading: "Track Every Dollar of Commission Income",
    explanation:
      "Agent Runway gives you a live year-to-date view of your gross commission income — updated the moment you log a deal. Know exactly where you stand against your annual goal at any point in the year, and understand your pacing compared to prior years.",
    bullets: [
      "Log every deal with buyer/seller side, address, and commission details",
      "Apply your brokerage split and transaction fees automatically",
      "Track YTD GCI and net agent income side by side",
      "Compare this year's pace against prior years to spot trends early",
    ],
    bg: "bg-white",
  },
  {
    id: "income-forecasting",
    icon: TrendingUp,
    tag: "Income Forecasting",
    tagClass: "bg-emerald-100 text-emerald-700",
    iconClass: "text-emerald-300",
    heading: "Forecast Where You'll Land at Year-End",
    explanation:
      "A straight-line projection from your current GCI will mislead you — real estate income is seasonal. Agent Runway applies Canadian market seasonality curves to your closed history and probability-weighted pipeline to build a realistic year-end estimate.",
    bullets: [
      "Seasonality-aware projections using Canadian real estate market data",
      "Pipeline deals weighted by your assigned close probability",
      "P10–P90 probability bands show conservative and optimistic outcomes",
      "5-year income growth trajectory based on your pace and trend",
    ],
    bg: "bg-slate-50",
  },
  {
    id: "financial-runway",
    icon: Shield,
    tag: "Financial Runway",
    tagClass: "bg-violet-100 text-violet-700",
    iconClass: "text-violet-300",
    heading: "Know How Long Your Business Can Sustain Itself",
    explanation:
      "Financial runway — the number of months your cash reserve covers your fixed costs — is the most important number for any agent navigating a slow market. Agent Runway calculates it automatically and keeps it updated as your reserves and expenses change.",
    bullets: [
      "Calculate runway in months from your cash reserve and monthly fixed costs",
      "Risk classification: Critical, Warning, Healthy, or Strong",
      "Composite runway score across 5 financial dimensions (A+ to F)",
      "Understand your break-even deal volume to cover monthly costs",
    ],
    bg: "bg-white",
  },
  {
    id: "expense-tracking",
    icon: Receipt,
    tag: "Expense Tracking",
    tagClass: "bg-amber-100 text-amber-700",
    iconClass: "text-amber-300",
    heading: "Track Business Expenses and Understand Net Income",
    explanation:
      "GCI is what you earn. Net income is what you keep. Agent Runway tracks your business expenses by category — marketing, MLS fees, E&O insurance, technology, vehicle costs, and more — so you always know the real profitability of your practice.",
    bullets: [
      "Pre-built expense categories tailored to real estate agents",
      "See your expense ratio versus the industry benchmark target (25–30%)",
      "Understand net agent income after all splits, fees, and expenses",
      "Separate monthly recurring costs from one-time purchases",
    ],
    bg: "bg-slate-50",
  },
  {
    id: "reports",
    icon: FileText,
    tag: "Reports",
    tagClass: "bg-rose-100 text-rose-700",
    iconClass: "text-rose-300",
    heading: "Review and Export Your Business Performance",
    explanation:
      "Agent Runway's reports bring your full business picture together in one view — P&L summary, tax breakdown, expense analysis, monthly trends, and transaction log. Export a polished PDF whenever you need to share or review your numbers.",
    bullets: [
      "Year-to-date P&L summary with GCI, net income, and all expenses",
      "Projected tax breakdown: federal, provincial, CPP, and effective rate",
      "Monthly performance chart showing GCI and deal volume trends",
      "One-click PDF export formatted for sharing with accountants or advisors",
    ],
    bg: "bg-white",
  },
  {
    id: "ai-insights",
    icon: Sparkles,
    tag: "AI Insights",
    tagClass: "bg-sky-100 text-sky-700",
    iconClass: "text-sky-300",
    heading: "Get AI-Powered Insights About Your Business",
    explanation:
      "Agent Runway includes a Flight Crew with full access to your live business data. Ask natural-language questions, review insight cards ranked by potential impact, and explore tax estimate tools — all grounded in your actual numbers, not generic templates.",
    bullets: [
      "AI chat assistant that understands your GCI, pipeline, expenses, and runway",
      "Contextual insight cards ranked by potential business impact",
      "Tax estimates: quarterly instalment amounts and per-deal set-asides",
      "Benchmark comparison against industry national cohort data",
    ],
    bg: "bg-slate-50",
  },
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FeaturesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── JSON-LD (SoftwareApplication + BreadcrumbList) ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
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
              Product Features
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Features Built for Real Estate Agents
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Agent Runway helps agents{" "}
              <Link
                href="/how-real-estate-agents-track-gci"
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                track GCI
              </Link>
              , forecast income, measure financial runway, and understand their
              business performance — purpose-built for the Canadian real estate
              market.
            </p>

            {/* Feature jump-nav */}
            <div className="mt-10 flex flex-wrap justify-center gap-2">
              {FEATURES.map(({ id, icon: Icon, tag }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-blue-500 hover:text-blue-400"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tag}
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── Feature Sections ── */}
        {FEATURES.map(
          ({ id, icon: Icon, tag, tagClass, iconClass, heading, explanation, bullets, bg }, idx) => (
            <section key={id} id={id} className={`${bg} px-6 py-20 sm:px-10`}>
              <div className="mx-auto max-w-5xl">
                <div
                  className={`flex flex-col gap-10 sm:flex-row sm:items-center ${
                    idx % 2 === 1 ? "sm:flex-row-reverse" : ""
                  }`}
                >
                  {/* Text */}
                  <div className="flex-1">
                    <span
                      className={`mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${tagClass}`}
                    >
                      {tag}
                    </span>
                    <h2 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                      {heading}
                    </h2>
                    <p className="mb-6 text-base leading-relaxed text-slate-600">
                      {explanation}
                    </p>
                    <ul className="space-y-2.5">
                      {bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2.5 text-sm text-slate-600">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Visual panel */}
                  <div className="flex h-52 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white sm:h-60">
                    <div className={`flex flex-col items-center gap-3 ${iconClass}`}>
                      <Icon className="h-14 w-14" />
                      <span className="text-xs font-medium text-slate-400">{tag}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )
        )}

        {/* ── Charter Scarcity Strip (auto-hides when sold out) ── */}
        <section className="bg-slate-950 px-6 pt-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <CharterScarcityStrip variant="prominent" />
          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Everything you need. One dashboard.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Create a free account and explore the full Agent Runway dashboard.
              No credit card required — start tracking your GCI and building
              your first forecast in minutes.
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
                href="/pricing"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                View Pricing
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
