import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  Shield,
  Sparkles,
  ArrowRight,
  Check,
  Star,
  DollarSign,
  Calculator,
  Award,
  LineChart,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";

export const metadata: Metadata = {
  title: "Agent Runway | Business Analytics for Real Estate Agents",
  description:
    "Agent Runway helps real estate agents track GCI, forecast income, measure financial runway, and receive AI-powered insights about their business performance.",
  openGraph: {
    url: "https://agentrunway.ca",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

// ── Structured data (JSON-LD) ─────────────────────────────────────────────────

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Agent Runway",
  description:
    "Business analytics software for real estate agents that tracks GCI, forecasts income, and measures financial runway.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://agentrunway.ca",
  image: "https://agentrunway.ca/og-image.png",
  creator: {
    "@type": "Organization",
    name: "Agent Runway",
  },
};

// ── Feature data ──────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: BarChart3,
    title: "Track GCI",
    description:
      "Log every deal and watch your year-to-date commission income build against your annual goal. Know exactly where you stand at every point in the year.",
    iconClass: "bg-gradient-to-br from-blue-500 to-blue-700",
    gradBorder: "from-blue-500/40 to-slate-800/30",
    hasChart: true,
    wide: false,
  },
  {
    icon: TrendingUp,
    title: "Forecast Income",
    description:
      "Seasonality-aware projections combine your closed deals and probability-weighted pipeline to show where you'll land at year-end.",
    iconClass: "bg-gradient-to-br from-emerald-500 to-emerald-700",
    gradBorder: "from-emerald-500/40 to-slate-800/30",
    hasChart: false,
    wide: false,
  },
  {
    icon: Shield,
    title: "Measure Financial Runway",
    description:
      "See how many months your cash reserves cover your fixed costs. Know your number before you need it — not after.",
    iconClass: "bg-gradient-to-br from-violet-500 to-violet-700",
    gradBorder: "from-violet-500/40 to-slate-800/30",
    hasChart: false,
    wide: false,
  },
  {
    icon: Sparkles,
    title: "AI Business Insights",
    description:
      "Contextual advisor cards surface risks, opportunities, and next steps based on your live business data — not generic advice.",
    iconClass: "bg-gradient-to-br from-amber-500 to-amber-600",
    gradBorder: "from-amber-500/40 to-slate-800/30",
    hasChart: false,
    wide: true,
  },
];

// ── "Why It Matters" callouts ─────────────────────────────────────────────────

const WHY_CALLOUTS = [
  {
    icon: DollarSign,
    title: "Net Income Clarity",
    description:
      "True take-home after commission splits, transaction fees, and business expenses.",
    iconClass: "bg-gradient-to-br from-blue-500 to-blue-700",
    gradBorder: "from-blue-500/35 to-slate-800/20",
  },
  {
    icon: Calculator,
    title: "Tax Estimates",
    description:
      "Know your quarterly instalments before filing season — no accountant required.",
    iconClass: "bg-gradient-to-br from-violet-500 to-violet-700",
    gradBorder: "from-violet-500/35 to-slate-800/20",
  },
  {
    icon: Award,
    title: "CREA Benchmarks",
    description:
      "See how your GCI and deal volume rank against national cohort data.",
    iconClass: "bg-gradient-to-br from-emerald-500 to-emerald-700",
    gradBorder: "from-emerald-500/35 to-slate-800/20",
  },
  {
    icon: LineChart,
    title: "Pipeline Forecasts",
    description:
      "Probability-weighted projections from your actual deals, not spreadsheet guesses.",
    iconClass: "bg-gradient-to-br from-teal-500 to-teal-700",
    gradBorder: "from-teal-500/35 to-slate-800/20",
  },
];

// ── Social proof ──────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote:
      "I used to just look at my GCI and hope for the best. Agent Runway showed me I was burning through my reserve faster than I thought — woke me up before it became a real problem.",
    name: "Sarah M.",
    title: "Residential Agent, Toronto ON",
    initials: "SM",
    avatarClass: "bg-gradient-to-br from-blue-500 to-blue-700",
    gradBorder: "from-blue-500/50 to-slate-800/20",
  },
  {
    quote:
      "The seasonality-aware forecasting is something I've never seen in any other tool. It actually accounts for the Q1 slowdown instead of projecting a straight line.",
    name: "Jason T.",
    title: "RE/MAX Agent, Calgary AB",
    initials: "JT",
    avatarClass: "bg-gradient-to-br from-emerald-500 to-emerald-700",
    gradBorder: "from-emerald-500/50 to-slate-800/20",
  },
  {
    quote:
      "The tax planning cards alone are worth the subscription. Knowing my quarterly instalments without calling my accountant every month saves time and money.",
    name: "Michelle L.",
    title: "Independent Agent, Ottawa ON",
    initials: "ML",
    avatarClass: "bg-gradient-to-br from-violet-500 to-violet-700",
    gradBorder: "from-violet-500/50 to-slate-800/20",
  },
];

// ── Stats bar data ────────────────────────────────────────────────────────────

const STATS = [
  { value: "13", label: "Provinces & Territories", sublabel: "Full tax coverage" },
  { value: "8", label: "Calculation Engines", sublabel: "Ported from iOS" },
  { value: "14-day", label: "Free Trial", sublabel: "No card required" },
];

// ── Hero dashboard preview (static mock) ─────────────────────────────────────

function HeroDashboardPreview() {
  const bars = [38, 52, 41, 67, 78, 55, 88, 72, 49, 63, 82, 44];

  return (
    <div className="relative">
      {/* Ambient glow behind the card */}
      <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-blue-600/20 via-violet-600/10 to-transparent blur-2xl" />

      {/* Main preview card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900 shadow-2xl shadow-black/50">

        {/* Fake browser chrome */}
        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/90 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          </div>
          <div className="mx-auto flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-slate-500">agentrunway.ca/dashboard</span>
          </div>
          <div className="w-12" />
        </div>

        {/* Dashboard content */}
        <div className="p-4">

          {/* Greeting row */}
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-white">Good morning, Sarah</p>
              <p className="text-[10px] text-slate-500">2026 · July</p>
            </div>
            <div className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[10px] font-bold text-blue-300">
              A+ Score
            </div>
          </div>

          {/* KPI cards */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 border-t-2 border-t-emerald-500/70 bg-slate-800/60 p-2.5">
              <p className="text-[9px] text-slate-500">YTD GCI</p>
              <p className="text-sm font-bold text-white">$118,400</p>
              <p className="text-[9px] text-emerald-400">↑ 12% ahead of pace</p>
            </div>
            <div className="rounded-lg border border-slate-800 border-t-2 border-t-violet-500/70 bg-slate-800/60 p-2.5">
              <p className="text-[9px] text-slate-500">Financial Runway</p>
              <p className="text-sm font-bold text-white">8.2 mo</p>
              <p className="text-[9px] text-violet-400">● Healthy reserve</p>
            </div>
          </div>

          {/* Goal progress */}
          <div className="mb-3 rounded-lg border border-slate-800 bg-slate-800/60 p-2.5">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[9px] text-slate-400">Annual Goal Progress</p>
              <p className="text-[9px] font-bold text-white">59%</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full w-[59%] rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" />
            </div>
            <p className="mt-1 text-[9px] text-slate-500">$118,400 of $200,000 annual goal</p>
          </div>

          {/* Monthly GCI chart */}
          <div className="mb-3 rounded-lg border border-slate-800 bg-slate-800/60 p-2.5">
            <p className="mb-2 text-[9px] text-slate-400">Monthly GCI — 2026</p>
            <div className="flex h-10 items-end gap-0.5">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-sm ${
                    i < 7 ? "bg-blue-600/80" : "bg-slate-700"
                  }`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          {/* AI insight */}
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-amber-500/25">
                <Sparkles className="h-2 w-2 text-amber-400" />
              </div>
              <div>
                <p className="text-[9px] font-semibold text-amber-300">AI Insight</p>
                <p className="text-[9px] leading-relaxed text-slate-400">
                  Set aside $4,200 this quarter for estimated tax instalments.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Home() {
  // Authenticated users go straight to their dashboard
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── JSON-LD structured data ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-slate-950 px-6 py-20 sm:px-10 lg:py-28">

          {/* Dot-grid texture */}
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(148,163,184,0.06) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          {/* Gradient orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-blue-600/25 blur-[120px]" />
            <div className="absolute -right-20 top-10 h-80 w-80 rounded-full bg-violet-600/[0.15] blur-[100px]" />
            <div className="absolute bottom-0 left-1/3 h-64 w-[600px] -translate-x-1/2 rounded-full bg-blue-500/[0.08] blur-[100px]" />
          </div>

          <div className="relative mx-auto max-w-6xl">
            <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr]">

              {/* Left: copy */}
              <div>
                {/* Badge */}
                <div className="mb-6 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
                  Built for Canadian Real Estate Agents
                </div>

                {/* Headline */}
                <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-[64px] lg:leading-[1.05]">
                  <span className="bg-gradient-to-r from-blue-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
                    Agent Runway
                  </span>
                </h1>

                {/* Subheadline */}
                <p className="mt-5 text-xl font-medium text-slate-300 sm:text-2xl">
                  Business Analytics for Real Estate Agents
                </p>

                {/* Body copy */}
                <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
                  Agent Runway helps real estate agents{" "}
                  <Link
                    href="/how-real-estate-agents-track-gci"
                    className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
                  >
                    track GCI
                  </Link>
                  , forecast income, measure financial runway, and receive
                  AI-powered business insights. One dashboard built around your
                  numbers.
                </p>

                {/* CTAs */}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-500 hover:shadow-blue-500/40"
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                  <Link
                    href="/demo"
                    className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
                  >
                    See the Product
                  </Link>
                </div>

                {/* Trust row */}
                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
                  {["14-day free trial", "No credit card required", "Cancel anytime"].map(
                    (item) => (
                      <div key={item} className="flex items-center gap-1.5 text-sm text-slate-500">
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        {item}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Right: product preview — desktop only */}
              <div className="hidden lg:block">
                <HeroDashboardPreview />
              </div>

            </div>
          </div>
        </section>

        {/* ── Stats bar ── */}
        <div className="border-y border-slate-800/80 bg-slate-900/50">
          <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
            <div className="grid grid-cols-3 divide-x divide-slate-800 text-center">
              {STATS.map(({ value, label, sublabel }) => (
                <div key={label} className="px-4 py-2 sm:px-6">
                  <p className="text-2xl font-bold sm:text-3xl">
                    <span className="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">
                      {value}
                    </span>
                  </p>
                  <p className="mt-1 text-xs font-semibold text-white sm:text-sm">{label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{sublabel}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Features ── */}
        <section id="features" className="bg-slate-950 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-6xl">

            <div className="mb-14 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Everything you need to run your business
              </h2>
              <p className="mt-4 text-lg text-slate-400">
                Purpose-built tools for agents who want financial clarity.
              </p>
            </div>

            {/* Bento grid: 3 equal cards + 1 full-width AI card */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description, iconClass, gradBorder, hasChart, wide }) => (
                <div
                  key={title}
                  className={`rounded-2xl bg-gradient-to-br ${gradBorder} p-px ${
                    wide ? "sm:col-span-2 lg:col-span-3" : ""
                  }`}
                >
                  <article
                    className={`h-full rounded-2xl bg-slate-900 p-6 ${
                      wide ? "sm:flex sm:gap-8 sm:items-start" : ""
                    }`}
                  >
                    {/* Icon + title + description */}
                    <div className={wide ? "flex-1" : ""}>
                      <div
                        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${iconClass}`}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="mb-2 font-semibold text-white">{title}</h3>
                      <p className="text-sm leading-relaxed text-slate-400">{description}</p>

                      {/* Mini bar chart — GCI card only */}
                      {hasChart && (
                        <div className="mt-4 rounded-lg bg-slate-800/60 p-3">
                          <p className="mb-2 text-[10px] text-slate-500">Sample GCI trend</p>
                          <div className="flex h-12 items-end gap-0.5">
                            {[30, 45, 38, 60, 72, 55, 80, 68, 50, 70, 85, 62].map((h, i) => (
                              <div
                                key={i}
                                className={`flex-1 rounded-sm ${
                                  i === 10 ? "bg-blue-500" : "bg-blue-500/35"
                                }`}
                                style={{ height: `${h}%` }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Mock AI insights — AI Insights card only */}
                    {wide && (
                      <div className="mt-5 space-y-2.5 sm:mt-0 sm:w-72 lg:w-80 lg:shrink-0">
                        {[
                          {
                            colorKey: "amber",
                            emoji: "⚡",
                            label: "High Impact",
                            text: "Set aside $4,200 for Q3 estimated tax instalment.",
                            borderClass: "border-amber-500/25 bg-amber-500/5",
                            labelClass: "text-amber-300",
                          },
                          {
                            colorKey: "emerald",
                            emoji: "📈",
                            label: "Opportunity",
                            text: "Pace is 12% above seasonal average — strong Q2.",
                            borderClass: "border-emerald-500/25 bg-emerald-500/5",
                            labelClass: "text-emerald-300",
                          },
                          {
                            colorKey: "red",
                            emoji: "⚠️",
                            label: "Watch",
                            text: "Pipeline coverage drops below 2× in October.",
                            borderClass: "border-red-500/25 bg-red-500/5",
                            labelClass: "text-red-300",
                          },
                        ].map(({ emoji, label, text, borderClass, labelClass }) => (
                          <div
                            key={label}
                            className={`rounded-lg border px-3 py-2.5 text-xs ${borderClass}`}
                          >
                            <span className="mr-1.5">{emoji}</span>
                            <span className={`font-semibold ${labelClass}`}>{label}:</span>
                            <span className="ml-1 text-slate-400">{text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Why It Matters ── */}
        <section id="why" className="bg-gradient-to-b from-slate-950 to-slate-900 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="grid items-center gap-12 lg:grid-cols-2">

              {/* Left: text */}
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Most agents track transactions.
                  <br />
                  <span className="bg-gradient-to-r from-blue-300 to-violet-300 bg-clip-text text-transparent">
                    Agent Runway gives you CEO-level visibility.
                  </span>
                </h2>

                <p className="mt-6 text-lg leading-relaxed text-slate-400">
                  Knowing your GCI is a start. Agent Runway goes further — showing your true net
                  income after commission split, transaction fees, and business expenses. It
                  estimates your tax obligations before filing season, benchmarks your performance
                  against CREA cohort data, and builds{" "}
                  <Link
                    href="/real-estate-business-analytics"
                    className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
                  >
                    forward-looking forecasts
                  </Link>{" "}
                  from your actual pipeline.
                </p>

                <p className="mt-4 text-lg leading-relaxed text-slate-400">
                  Built specifically for Canadian agents, with full provincial tax calculations and
                  national seasonality data. Whether you&apos;re a solo agent or running a team,
                  Agent Runway gives you the financial clarity to make better decisions.
                </p>

                <div className="mt-8">
                  <Link
                    href="/login"
                    className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-500 hover:shadow-blue-500/40"
                  >
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              </div>

              {/* Right: 4 callout cards */}
              <div className="grid grid-cols-2 gap-3">
                {WHY_CALLOUTS.map(({ icon: Icon, title, description, iconClass, gradBorder }) => (
                  <div key={title} className={`rounded-xl bg-gradient-to-br ${gradBorder} p-px`}>
                    <div className="h-full rounded-xl bg-slate-900/90 p-4">
                      <div
                        className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <h3 className="mb-1 text-sm font-semibold text-white">{title}</h3>
                      <p className="text-xs leading-relaxed text-slate-400">{description}</p>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </section>

        {/* ── Social Proof ── */}
        <section className="bg-slate-950 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-6xl">

            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Built for agents who take their business seriously
              </h2>
              <p className="mt-4 text-lg text-slate-400">
                Real estate agents across Canada use Agent Runway to get clarity on their numbers.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {TESTIMONIALS.map(({ quote, name, title, initials, avatarClass, gradBorder }) => (
                <div
                  key={name}
                  className={`rounded-2xl bg-gradient-to-br ${gradBorder} p-px`}
                >
                  <figure className="flex h-full flex-col rounded-2xl bg-slate-900 p-6">
                    {/* Stars */}
                    <div className="mb-4 flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <blockquote className="flex-1">
                      <p className="text-sm leading-relaxed text-slate-300">
                        &ldquo;{quote}&rdquo;
                      </p>
                    </blockquote>
                    <figcaption className="mt-6 flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${avatarClass}`}
                      >
                        <span className="text-xs font-bold text-white">{initials}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{name}</p>
                        <p className="text-xs text-slate-500">{title}</p>
                      </div>
                    </figcaption>
                  </figure>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* ── Email Capture ── */}
        <section className="bg-slate-900 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-2xl">
            <EmailCapture
              heading="Stay ahead of your numbers"
              subheading="Practical tips for running a more profitable real estate business. Sent occasionally — no spam."
              source="homepage"
            />
          </div>
        </section>

      </main>

      <MarketingFooter />

    </div>
  );
}
