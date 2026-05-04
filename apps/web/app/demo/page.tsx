import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  Shield,
  FileText,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Demo — Real Estate Business Analytics Platform",
  description:
    "See how Agent Runway helps real estate agents track GCI, forecast income, and understand business performance.",
  openGraph: {
    url: "https://agentrunway.ca/demo",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/demo",
  },
};

// ── Placeholder screenshot panels ─────────────────────────────────────────────

function DashboardMockup() {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-3 w-28 rounded bg-slate-200" />
        <div className="h-3 w-16 rounded bg-blue-100" />
      </div>
      {/* KPI row */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {["YTD GCI", "Deals", "Net Income"].map((label) => (
          <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="mb-1.5 h-2 w-12 rounded bg-slate-200" />
            <div className="h-4 w-16 rounded bg-blue-600/20" />
            <p className="mt-1.5 text-[9px] font-medium text-slate-400">{label}</p>
          </div>
        ))}
      </div>
      {/* Progress bar */}
      <div className="mb-2 flex items-center justify-between">
        <div className="h-2 w-20 rounded bg-slate-200" />
        <div className="h-2 w-8 rounded bg-slate-200" />
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-2 w-3/4 rounded-full bg-blue-600" />
      </div>
      {/* Chart placeholder */}
      <div className="mt-4 flex h-16 items-end gap-1">
        {[30, 50, 40, 65, 55, 80, 60, 90, 70, 85, 75, 95].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-blue-600/20"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ForecastMockup() {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="h-3 w-32 rounded bg-slate-200" />
        <div className="h-5 w-20 rounded-full bg-emerald-100" />
      </div>
      {/* Projection number */}
      <div className="mb-4">
        <div className="h-2 w-24 rounded bg-slate-200" />
        <div className="mt-1.5 h-6 w-36 rounded bg-blue-600/25" />
      </div>
      {/* Band chart */}
      <div className="relative h-20 w-full overflow-hidden rounded-lg bg-slate-50">
        {/* P90 band */}
        <div className="absolute inset-x-0 bottom-4 top-0 rounded bg-blue-50" />
        {/* P10 band */}
        <div className="absolute inset-x-0 bottom-4 top-6 rounded bg-blue-100/60" />
        {/* Main line */}
        <svg
          viewBox="0 0 200 60"
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          <polyline
            points="0,50 40,40 80,32 120,22 160,14 200,8"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
          />
        </svg>
      </div>
      {/* P10 / P90 labels */}
      <div className="mt-2 flex justify-between">
        <span className="text-[9px] text-slate-400">P10 conservative</span>
        <span className="text-[9px] text-slate-400">P90 optimistic</span>
      </div>
    </div>
  );
}

function ExpenseRunwayMockup() {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-3 h-3 w-28 rounded bg-slate-200" />
      {/* Expense categories */}
      <div className="mb-4 space-y-2">
        {[
          { label: "Marketing", pct: "72", color: "bg-blue-500" },
          { label: "MLS & Fees", pct: "45", color: "bg-violet-400" },
          { label: "Technology", pct: "30", color: "bg-emerald-400" },
        ].map(({ label, pct, color }) => (
          <div key={label}>
            <div className="mb-0.5 flex justify-between">
              <span className="text-[9px] text-slate-500">{label}</span>
              <span className="text-[9px] text-slate-400">{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
      </div>
      {/* Runway score */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
        <p className="mb-1 text-[9px] font-medium text-slate-400">Financial Runway</p>
        <div className="flex items-end justify-between">
          <div className="h-6 w-10 rounded bg-emerald-500/20" />
          <div className="flex flex-col items-end gap-0.5">
            <div className="h-2 w-16 rounded bg-slate-200" />
            <div className="h-2 w-10 rounded bg-emerald-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportsMockup() {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-3 w-28 rounded bg-slate-200" />
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded bg-slate-100" />
          <div className="h-5 w-16 rounded bg-blue-600/20" />
        </div>
      </div>
      {/* Two-column summary */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {["GCI", "Net Income", "Expenses", "Tax Est."].map((label) => (
          <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
            <div className="mb-1 h-2 w-12 rounded bg-slate-200" />
            <div className="h-3 w-16 rounded bg-blue-600/20" />
            <p className="mt-1 text-[8px] text-slate-400">{label}</p>
          </div>
        ))}
      </div>
      {/* Table rows */}
      <div className="space-y-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-600/30" />
            <div className="h-2 flex-1 rounded bg-slate-200" />
            <div className="h-2 w-10 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Product sections ──────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: "overview",
    icon: BarChart3,
    tag: "Dashboard Overview",
    tagClass: "bg-blue-100 text-blue-700",
    heading: "Your entire business at a glance",
    hint: "Start here — your Runway Score tells you how healthy your business is right now",
    explanation:
      "The Agent Runway dashboard brings every key number together in one place — updated the moment you log a deal. See your year-to-date GCI, net income after splits and fees, deal count, average commission, and real-time pace against your annual goal.",
    bullets: [
      "YTD GCI and net income side by side",
      "Goal progress with seasonality-adjusted pace indicator",
      "Monthly bar chart showing income distribution",
      "Benchmark score comparing your performance to peers",
    ],
    Mockup: DashboardMockup,
    bg: "bg-white",
  },
  {
    id: "forecasting",
    icon: TrendingUp,
    tag: "Income Forecasting",
    tagClass: "bg-emerald-100 text-emerald-700",
    heading: "Know where you'll land before year-end",
    hint: "This shows where you're headed — not just where you've been",
    explanation:
      "Agent Runway combines your closed history, probability-weighted pipeline, and Canadian market seasonality to project a realistic year-end income range. Every forecast is expressed as a band of outcomes — not a single guess — so you can plan for both the conservative and optimistic scenarios.",
    bullets: [
      "Seasonality-aware projection engine",
      "P10–P90 probability bands for all forecasts",
      "Pipeline deals weighted by close probability",
      "5-year growth trajectory from your trend data",
    ],
    Mockup: ForecastMockup,
    bg: "bg-slate-50",
  },
  {
    id: "expenses",
    icon: Shield,
    tag: "Expenses + Runway",
    tagClass: "bg-violet-100 text-violet-700",
    heading: "Understand costs and business resilience",
    hint: "Your runway tells you how long you can operate without new deals closing",
    explanation:
      "Track every business expense by category and see your expense ratio against the 25–30% industry benchmark. Your financial runway — the number of months your cash reserve covers your fixed costs — is calculated automatically and classified from Critical to Strong.",
    bullets: [
      "Pre-built expense categories for real estate agents",
      "Live expense ratio vs 25–30% benchmark",
      "Runway score: Critical, Warning, Healthy, or Strong",
      "Composite business health grade (A+ to F)",
    ],
    Mockup: ExpenseRunwayMockup,
    bg: "bg-white",
  },
  {
    id: "reports",
    icon: FileText,
    tag: "Reports",
    tagClass: "bg-rose-100 text-rose-700",
    heading: "Exportable analytics for your whole business",
    hint: "This is what you should be setting aside for taxes — and sharing with your accountant",
    explanation:
      "Agent Runway's reports section brings your P&L summary, projected tax breakdown, expense analysis, monthly performance trends, and full transaction log into one printable view. Export a polished PDF to share with your accountant, advisor, or brokerage.",
    bullets: [
      "Year-to-date P&L with full deduction waterfall",
      "Projected tax: federal, provincial, CPP, effective rate",
      "Monthly performance chart and transaction log",
      "One-click PDF export formatted for sharing",
    ],
    Mockup: ReportsMockup,
    bg: "bg-slate-50",
  },
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          {/* Animated gradient orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="orb-drift-1 absolute -left-10 -top-10 h-80 w-80 rounded-full bg-blue-600/25 blur-[100px]" />
            <div className="orb-drift-2 absolute -right-10 top-16 h-64 w-64 rounded-full bg-violet-600/20 blur-[80px]" />
            <div className="orb-drift-3 absolute bottom-0 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-cyan-500/12 blur-[90px]" />
          </div>

          <div className="relative mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              Product Tour
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              This is what your business could look like with Agent Runway
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              A real-time view of your income, expenses, taxes, and runway — not just estimates.
              See the dashboard Canadian agents use to{" "}
              <Link
                href="/how-real-estate-agents-track-gci"
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                track GCI
              </Link>
              , forecast income, and plan ahead with confidence.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/demo/dashboard"
                className="group inline-flex items-center rounded-xl px-8 py-3.5 text-sm font-bold text-white transition-all duration-200"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  boxShadow: "0 0 30px rgba(99,102,241,0.35)",
                }}
              >
                See It in Action
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center rounded-xl border border-slate-700 px-8 py-3.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Try It Free — No Card Required
              </Link>
            </div>
          </div>
        </section>

        {/* ── Insight Panel ── */}
        <section className="bg-slate-50 px-6 py-12 sm:px-10">
          <div className="mx-auto max-w-2xl">
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                What this means for you
              </p>
              <p className="text-sm leading-relaxed text-slate-600">
                Based on these numbers, this agent is on pace to exceed their
                annual goal — but their tax reserve is underfunded. If they
                don&apos;t adjust, they could face a significant tax gap at
                year-end.
              </p>
              <p className="mt-3 text-xs font-medium text-blue-600">
                This is what Agent Runway does automatically.
              </p>
            </div>
          </div>
        </section>

        {/* ── Product Sections ── */}
        {SECTIONS.map(({ id, tag, tagClass, heading, hint, explanation, bullets, Mockup, bg }, idx) => (
          <section key={id} id={id} className={`${bg} px-6 py-20 sm:px-10`}>
            <div className="mx-auto max-w-5xl">
              <div
                className={`flex flex-col gap-10 sm:flex-row sm:items-center ${
                  idx % 2 === 1 ? "sm:flex-row-reverse" : ""
                }`}
              >
                {/* Text */}
                <div className="flex-1">
                  <span className={`mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${tagClass}`}>
                    {tag}
                  </span>
                  <h2 className="mb-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    {heading}
                  </h2>
                  {hint && (
                    <p className="mb-4 text-sm italic text-slate-400">
                      {hint}
                    </p>
                  )}
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

                {/* Screenshot placeholder */}
                <div className="flex-1">
                  <Mockup />
                </div>
              </div>
            </div>
          </section>
        ))}

        {/* ── Closing CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Start tracking your real numbers
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Set your annual GCI goal, log your first deal, and see your
              year-end forecast update in real time. Setup takes five minutes
              — no credit card required.
            </p>
            <div className="mt-10">
              <Link
                href="/login"
                className="group inline-flex items-center rounded-xl px-10 py-4 text-sm font-bold text-white transition-all duration-200"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  boxShadow: "0 0 40px rgba(99,102,241,0.4)",
                }}
              >
                Try Agent Runway Free
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="mt-5 flex items-center justify-center gap-4">
              <Link
                href="/pricing"
                className="text-sm font-medium text-slate-500 underline underline-offset-4 hover:text-white transition-colors"
              >
                View pricing
              </Link>
              <span className="text-slate-700">·</span>
              <Link
                href="/about"
                className="text-sm font-medium text-slate-500 underline underline-offset-4 hover:text-white transition-colors"
              >
                Read the founder story
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
