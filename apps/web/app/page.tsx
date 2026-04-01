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
  Zap,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";

export const metadata: Metadata = {
  title: "Agent Runway | Canada's First Agent Business Platform",
  description:
    "The world's first platform built to run a real estate agent's entire business automatically. GCI tracking, tax planning, client outreach, and income forecasting — with uploads, not spreadsheets.",
  openGraph: {
    url: "https://agentrunway.ca",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
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
  image: "https://agentrunway.ca/og-image-v2.png",
  creator: { "@type": "Organization", name: "Agent Runway" },
};

// ── Feature data ──────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: BarChart3,
    title: "Track GCI",
    description:
      "See your year-to-date commission income update with every deal. Always know if you're ahead of pace, behind, or right on target.",
    iconBg: "bg-blue-500",
    borderColor: "rgba(96,165,250,0.55)",
    iconShadow: "0 0 20px rgba(59,130,246,0.4)",
    hasChart: true,
    wide: false,
  },
  {
    icon: TrendingUp,
    title: "Forecast Income",
    description:
      "Know where you'll finish the year — not a straight-line guess, but a seasonality-adjusted forecast built from your closed deals and active pipeline.",
    iconBg: "bg-emerald-500",
    borderColor: "rgba(52,211,153,0.55)",
    iconShadow: "0 0 20px rgba(16,185,129,0.4)",
    hasChart: false,
    wide: false,
  },
  {
    icon: Shield,
    title: "Measure Financial Runway",
    description:
      "How many months can you cover your costs if no new deals close? Your runway number answers the question most agents are afraid to ask.",
    iconBg: "bg-violet-500",
    borderColor: "rgba(167,139,250,0.55)",
    iconShadow: "0 0 20px rgba(139,92,246,0.4)",
    hasChart: false,
    wide: false,
  },
  {
    icon: Sparkles,
    title: "AI Business Insights",
    description:
      "Your data analyzed in real time. AI flags what needs attention, warns you before problems hit, and tells you exactly what to do next — specific to your numbers, not generic tips.",
    iconBg: "bg-amber-500",
    borderColor: "rgba(251,191,36,0.55)",
    iconShadow: "0 0 20px rgba(245,158,11,0.4)",
    hasChart: false,
    wide: true,
  },
];

// ── Why It Matters callouts ───────────────────────────────────────────────────

const WHY_CALLOUTS = [
  {
    icon: DollarSign,
    title: "Net Income Clarity",
    description: "What you actually keep after splits, brokerage fees, and business expenses.",
    color: "blue",
  },
  {
    icon: Calculator,
    title: "Tax Estimates",
    description: "Federal, provincial, CPP, and HST — calculated quarterly so you're never caught off guard.",
    color: "violet",
  },
  {
    icon: Award,
    title: "CREA Benchmarks",
    description: "Compare your GCI, expenses, and conversion rate against national agent averages.",
    color: "emerald",
  },
  {
    icon: LineChart,
    title: "Pipeline Forecasts",
    description: "Every deal in your pipeline weighted by close probability and adjusted for seasonal patterns.",
    color: "teal",
  },
];

// ── Testimonials ──────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote:
      "I used to look at my GCI and assume I was fine. Agent Runway showed me I was burning through my reserve faster than I realized — I caught it before it became a real problem.",
    name: "Sarah M.",
    title: "Residential Agent, Toronto ON",
    initials: "SM",
    color: "blue",
  },
  {
    quote:
      "The forecasting actually accounts for the Q1 slowdown instead of projecting a straight line. No other tool I've used does that — it changed how I plan my year.",
    name: "Jason T.",
    title: "RE/MAX Agent, Calgary AB",
    initials: "JT",
    color: "emerald",
  },
  {
    quote:
      "Knowing my quarterly tax instalments without calling my accountant every month saves me time and money. The tax planning alone is worth the subscription.",
    name: "Michelle L.",
    title: "Independent Agent, Ottawa ON",
    initials: "ML",
    color: "violet",
  },
];

// ── Hero dashboard preview ────────────────────────────────────────────────────

function HeroDashboardPreview() {
  const bars = [32, 48, 38, 62, 75, 52, 88, 70, 46, 67, 90, 58];

  return (
    <div className="relative">
      {/* Multi-layer ambient glow */}
      <div className="absolute -inset-10 rounded-[2rem] bg-gradient-to-br from-blue-500/35 via-violet-500/20 to-cyan-500/10 blur-3xl" />
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-blue-600/20 to-violet-600/15 blur-xl" />

      {/* Card with gradient border */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-400/50 via-violet-500/30 to-slate-700/20 p-px shadow-2xl shadow-black/70">
        <div className="overflow-hidden rounded-[15px] bg-[#07101F]">

          {/* Browser chrome */}
          <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-3">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
            </div>
            <div className="mx-auto flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-slate-400">agentrunway.ca/dashboard</span>
            </div>
            <div className="w-12" />
          </div>

          {/* Dashboard body */}
          <div className="p-5">

            {/* Runway score hero card */}
            <div className="mb-4 overflow-hidden rounded-xl border border-white/5 bg-gradient-to-br from-blue-500/15 via-violet-500/10 to-transparent p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                    Business Health
                  </p>
                  <p
                    className="mt-0.5 text-5xl font-black leading-none"
                    style={{
                      background: "linear-gradient(135deg, #34d399, #22d3ee)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    A+
                  </p>
                  <p className="mt-1 text-[10px] text-emerald-400">Performing above target</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">YTD GCI</p>
                  <p className="text-xl font-bold text-white">$118,400</p>
                  <p className="mt-2 text-[10px] text-slate-500">Runway</p>
                  <p className="text-base font-bold text-violet-300">8.2 months</p>
                </div>
              </div>

              {/* Goal progress */}
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[9px] text-slate-500">Annual Goal</p>
                  <p className="text-[9px] font-bold text-white">59% — $118.4K / $200K</p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: "59%",
                      background: "linear-gradient(90deg, #3b82f6, #22d3ee)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* KPI row */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              {[
                { label: "Closed", value: "7", sub: "deals", color: "text-blue-400" },
                { label: "Pipeline", value: "4", sub: "active", color: "text-violet-400" },
                { label: "Avg GCI", value: "$16.9K", sub: "per deal", color: "text-emerald-400" },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-center">
                  <p className="text-[8px] text-slate-500">{label}</p>
                  <p className={`text-sm font-bold ${color}`}>{value}</p>
                  <p className="text-[8px] text-slate-600">{sub}</p>
                </div>
              ))}
            </div>

            {/* Monthly chart */}
            <div className="mb-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] font-medium text-slate-400">Monthly GCI — 2026</p>
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  <p className="text-[8px] text-slate-500">Closed</p>
                </div>
              </div>
              <div className="flex h-14 items-end gap-[3px]">
                {bars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${h}%`,
                      background:
                        i < 7
                          ? `linear-gradient(to top, #2563eb, #60a5fa)`
                          : "rgba(255,255,255,0.07)",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* AI insight */}
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20">
                  <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-amber-300">⚡ High Impact</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
                    Set aside $4,200 this quarter for estimated tax instalments.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function colorConfig(color: string) {
  const map: Record<string, { border: string; bg: string; icon: string; text: string; avatar: string; borderGrad: string }> = {
    blue:    { border: "border-blue-400/40",    bg: "bg-blue-500/10",    icon: "bg-blue-500",    text: "text-blue-400",    avatar: "bg-gradient-to-br from-blue-500 to-blue-700",    borderGrad: "linear-gradient(135deg, rgba(96,165,250,0.55) 0%, rgba(96,165,250,0.08) 100%)" },
    emerald: { border: "border-emerald-400/40", bg: "bg-emerald-500/10", icon: "bg-emerald-500", text: "text-emerald-400", avatar: "bg-gradient-to-br from-emerald-500 to-emerald-700", borderGrad: "linear-gradient(135deg, rgba(52,211,153,0.55) 0%, rgba(52,211,153,0.08) 100%)" },
    violet:  { border: "border-violet-400/40",  bg: "bg-violet-500/10",  icon: "bg-violet-500",  text: "text-violet-400",  avatar: "bg-gradient-to-br from-violet-500 to-violet-700",  borderGrad: "linear-gradient(135deg, rgba(167,139,250,0.55) 0%, rgba(167,139,250,0.08) 100%)" },
    teal:    { border: "border-teal-400/40",     bg: "bg-teal-500/10",    icon: "bg-teal-500",    text: "text-teal-400",    avatar: "bg-gradient-to-br from-teal-500 to-teal-700",    borderGrad: "linear-gradient(135deg, rgba(45,212,191,0.55) 0%, rgba(45,212,191,0.08) 100%)" },
  };
  return map[color] ?? map.blue;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Don't redirect logged-in users — let them see the marketing site.
  // The nav shows a "Dashboard →" button so they can get back easily.

  // Fetch profile data for logged-in users so the nav can show their avatar
  let avatarUrl: string | undefined;
  let displayName: string | undefined;
  if (user) {
    const { data: settings } = await supabase
      .from("user_settings")
      .select("avatar_url, display_name")
      .eq("user_id", user.id)
      .single();
    avatarUrl = settings?.avatar_url ?? undefined;
    displayName = settings?.display_name || user.email?.split("@")[0] || undefined;
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#010D1F" }}>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <MarketingNav isLoggedIn={!!user} avatarUrl={avatarUrl} displayName={displayName} />

      <main>

        {/* ════════════════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden px-6 pb-24 pt-20 sm:px-10 sm:pb-32 sm:pt-24">

          {/* Vivid animated background orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="orb-drift-1 absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-blue-500/40 blur-[120px]" />
            <div className="orb-drift-2 absolute -right-40 -top-20 h-[500px] w-[500px] rounded-full bg-violet-500/30 blur-[100px]" />
            <div className="orb-drift-3 absolute bottom-0 left-1/2 h-64 w-[800px] -translate-x-1/2 rounded-full bg-cyan-500/15 blur-[80px]" />
          </div>

          {/* Dot-grid overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            aria-hidden="true"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(148,163,184,0.12) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* Vignette so grid fades at edges */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 40%, #010D1F 100%)",
            }}
          />

          <div className="relative mx-auto max-w-6xl">
            <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">

              {/* ── Left: copy ── */}
              <div>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-1.5 text-xs font-semibold text-blue-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  Canada&apos;s First Agent Business Platform
                </div>

                <h1 className="text-6xl font-extrabold tracking-tight sm:text-7xl lg:text-[76px] lg:leading-[1.02]">
                  <span
                    style={{
                      background: "linear-gradient(135deg, #93c5fd 0%, #60a5fa 30%, #a78bfa 70%, #c084fc 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    Agent Runway
                  </span>
                </h1>

                <p className="mt-4 text-2xl font-semibold text-white sm:text-3xl">
                  Know exactly where your business stands.
                </p>

                <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg">
                  Agent Runway tracks your income, estimates your taxes, forecasts your year-end, and tells you how long your cash will last — automatically. Upload your deals. See the full picture.
                </p>

                <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-500">
                  Built for Canadian agents who want clarity, not more spreadsheets.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/login"
                    className="group inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-sm font-bold text-white shadow-lg transition-all duration-200"
                    style={{
                      background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                      boxShadow: "0 0 30px rgba(99,102,241,0.35)",
                    }}
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    href="/demo"
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10"
                  >
                    See the Product
                  </Link>
                </div>

                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
                  {["14-day free trial", "No credit card required", "Cancel anytime"].map((item) => (
                    <div key={item} className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Right: product preview ── */}
              <div className="hidden lg:block">
                <HeroDashboardPreview />
              </div>

            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            STATS BAR
        ════════════════════════════════════════════════════════ */}
        <div
          className="relative border-y"
          style={{
            borderColor: "rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
            <div className="grid grid-cols-3 divide-x text-center" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              {[
                { value: "World's First", label: "Agent Business Platform", sub: "Nothing else like it exists" },
                { value: "13", label: "Provinces & Territories", sub: "Full Canadian tax coverage" },
                { value: "14-day", label: "Free Trial", sub: "No card required" },
              ].map(({ value, label, sub }) => (
                <div key={label} className="px-4 py-2 sm:px-8">
                  <p
                    className="text-3xl font-extrabold sm:text-4xl"
                    style={{
                      background: "linear-gradient(135deg, #60a5fa, #22d3ee)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    {value}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-white sm:text-sm">{label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-600">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            FEATURES
        ════════════════════════════════════════════════════════ */}
        <section id="features" className="relative px-6 py-16 sm:px-10" style={{ background: "#010D1F" }}>
          {/* Subtle section orb */}
          <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-violet-500/20 blur-[100px]" />

          <div className="relative mx-auto max-w-6xl">
            <ScrollRevealSection className="mb-14 text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Everything you need to{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  run like a CEO
                </span>
              </h2>
              <p className="mt-4 text-lg text-slate-400">
                Know your real income. See your tax liability. Track your runway. Plan your year with data, not instinct.
              </p>
            </ScrollRevealSection>

            {/* Bento grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description, iconBg, borderColor, iconShadow, hasChart, wide }, featureIdx) => (
                <ScrollRevealSection
                  key={title}
                  delay={(featureIdx % 4) as 0 | 1 | 2 | 3 | 4}
                  className={`rounded-2xl p-px ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}
                  style={{
                    background: `linear-gradient(135deg, ${borderColor} 0%, rgba(255,255,255,0.04) 100%)`,
                  } as React.CSSProperties}
                >
                  <div
                    className={`h-full overflow-hidden rounded-[15px] p-6 ${wide ? "sm:flex sm:gap-8 sm:items-start" : ""}`}
                    style={{ background: "#07101F" }}
                  >
                    <div className={wide ? "flex-1" : ""}>
                      <div
                        className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${iconBg}`}
                        style={{ boxShadow: iconShadow }}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="mb-2 text-base font-bold text-white">{title}</h3>
                      <p className="text-sm leading-relaxed text-slate-400">{description}</p>

                      {hasChart && (
                        <div className="mt-5 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                          <p className="mb-2 text-[10px] font-medium text-slate-500">Sample GCI trend</p>
                          <div className="flex h-14 items-end gap-0.5">
                            {[30, 44, 36, 58, 70, 52, 78, 65, 48, 68, 84, 60].map((h, i) => (
                              <div
                                key={i}
                                className="flex-1 rounded-sm"
                                style={{
                                  height: `${h}%`,
                                  background:
                                    i === 10
                                      ? "linear-gradient(to top, #3b82f6, #93c5fd)"
                                      : "rgba(59,130,246,0.3)",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {wide && (
                      <div className="mt-5 space-y-3 sm:mt-0 sm:w-80 lg:shrink-0">
                        {[
                          {
                            icon: "⚡",
                            label: "High Impact",
                            text: "Set aside $4,200 for Q3 estimated tax instalment.",
                            border: "border-amber-400/25",
                            bg: "rgba(251,191,36,0.05)",
                            labelColor: "text-amber-300",
                          },
                          {
                            icon: "📈",
                            label: "Opportunity",
                            text: "Pace is 12% above seasonal average — strong Q2.",
                            border: "border-emerald-400/25",
                            bg: "rgba(52,211,153,0.05)",
                            labelColor: "text-emerald-300",
                          },
                          {
                            icon: "⚠️",
                            label: "Watch",
                            text: "Pipeline coverage drops below 2× in October.",
                            border: "border-red-400/25",
                            bg: "rgba(248,113,113,0.05)",
                            labelColor: "text-red-300",
                          },
                        ].map(({ icon, label, text, border, bg, labelColor }) => (
                          <div
                            key={label}
                            className={`rounded-xl border px-4 py-3 text-xs ${border}`}
                            style={{ background: bg }}
                          >
                            <span className="mr-1.5">{icon}</span>
                            <span className={`font-semibold ${labelColor}`}>{label}:</span>
                            <span className="ml-1 text-slate-400">{text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollRevealSection>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            WHY IT MATTERS
        ════════════════════════════════════════════════════════ */}
        <section
          id="why"
          className="relative overflow-hidden px-6 py-16 sm:px-10"
          style={{ background: "linear-gradient(180deg, #010D1F 0%, #040C22 100%)" }}
        >
          {/* Section orbs */}
          <div className="pointer-events-none absolute -left-40 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-blue-500/30 blur-[130px]" />
          <div className="pointer-events-none absolute -right-40 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-violet-500/25 blur-[110px]" />

          <div className="relative mx-auto max-w-6xl">
            <div className="grid items-center gap-14 lg:grid-cols-2">

              <ScrollRevealSection>
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  Most agents track deals.
                  <br />
                  <span
                    style={{
                      background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    You&apos;ll run a real business.
                  </span>
                </h2>

                <p className="mt-6 text-lg leading-relaxed text-slate-400">
                  Knowing your GCI doesn&apos;t tell you if you&apos;re profitable. Agent Runway shows what you actually take home, estimates your taxes before filing season, benchmarks you against real CREA data, and builds{" "}
                  <Link
                    href="/real-estate-business-analytics"
                    className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
                  >
                    forward-looking forecasts
                  </Link>{" "}
                  from your pipeline — not wishful thinking.
                </p>

                <p className="mt-4 text-lg leading-relaxed text-slate-400">
                  All 13 provinces and territories. Every tax bracket. Every slowdown season accounted for.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/login"
                    className="group inline-flex items-center rounded-xl px-8 py-3.5 text-sm font-bold text-white transition-all duration-200"
                    style={{
                      background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                      boxShadow: "0 0 30px rgba(99,102,241,0.35)",
                    }}
                  >
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    href="/about"
                    className="text-sm font-medium text-slate-400 underline underline-offset-4 hover:text-white transition-colors"
                  >
                    Read why I built Agent Runway →
                  </Link>
                </div>
              </ScrollRevealSection>

              {/* 4 callout cards */}
              <div className="grid grid-cols-2 gap-3">
                {WHY_CALLOUTS.map(({ icon: Icon, title, description, color }) => {
                  const c = colorConfig(color);
                  return (
                    <div
                      key={title}
                      className="rounded-2xl p-px"
                      style={{ background: c.borderGrad }}
                    >
                      <div
                        className="h-full rounded-[15px] p-5"
                        style={{ background: "#07101F" }}
                      >
                        <div
                          className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${c.icon}`}
                        >
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <h3 className="mb-1 text-sm font-bold text-white">{title}</h3>
                        <p className="text-xs leading-relaxed text-slate-500">{description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            SOCIAL PROOF
        ════════════════════════════════════════════════════════ */}
        <section className="relative px-6 py-16 sm:px-10" style={{ background: "#010D1F" }}>
          {/* Centered glow */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/15 blur-[120px]" />

          <div className="relative mx-auto max-w-6xl">
            <ScrollRevealSection className="mb-12 text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Agents who fly blind{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg, #34d399, #22d3ee)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  don&apos;t last
                </span>
              </h2>
              <p className="mt-4 text-lg text-slate-400">
                Agents who stopped guessing and started making decisions with real data.
              </p>
            </ScrollRevealSection>

            <div className="grid gap-5 md:grid-cols-3">
              {TESTIMONIALS.map(({ quote, name, title, initials, color }, tIdx) => {
                const c = colorConfig(color);
                return (
                  <ScrollRevealSection
                    key={name}
                    delay={(tIdx % 4) as 0 | 1 | 2 | 3 | 4}
                    className="rounded-2xl p-px"
                    style={{ background: c.borderGrad } as React.CSSProperties}
                  >
                    <figure
                      className="flex h-full flex-col rounded-[15px] p-6"
                      style={{ background: "#07101F" }}
                    >
                      <div className="mb-4 flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                      <blockquote className="flex-1">
                        <p className="text-sm leading-relaxed text-slate-300">
                          &ldquo;{quote}&rdquo;
                        </p>
                      </blockquote>
                      <figcaption className="mt-6 flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${c.avatar}`}
                        >
                          <span className="text-xs font-bold text-white">{initials}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{name}</p>
                          <p className="text-xs text-slate-500">{title}</p>
                        </div>
                      </figcaption>
                    </figure>
                  </ScrollRevealSection>
                );
              })}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            CTA BAND
        ════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden px-6 py-20 sm:px-10">
          {/* Dramatic gradient background */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(37,99,235,0.25) 0%, rgba(124,58,237,0.20) 50%, rgba(37,99,235,0.15) 100%)",
            }}
          />
          <div className="absolute inset-0 border-y" style={{ borderColor: "rgba(255,255,255,0.05)" }} />
          {/* Orbs */}
          <div className="absolute -left-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-blue-500/30 blur-[80px]" />
          <div className="absolute -right-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-violet-500/25 blur-[80px]" />

          <div className="relative mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-slate-300">
              <Zap className="h-3 w-3 text-amber-400" />
              Start free · No credit card required
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Stop guessing.
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #93c5fd, #c084fc)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Start knowing.
              </span>
            </h2>
            <p className="mt-5 text-lg text-slate-400">
              Upload your first deal and see where you stand in 5 minutes.
              14-day free trial. No credit card required.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="group inline-flex items-center rounded-xl px-10 py-4 text-sm font-bold text-white transition-all duration-200"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  boxShadow: "0 0 40px rgba(99,102,241,0.4)",
                }}
              >
                Start Your Free Trial
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/pricing"
                className="text-sm font-medium text-slate-400 underline underline-offset-4 hover:text-white"
              >
                View pricing →
              </Link>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            EMAIL CAPTURE
        ════════════════════════════════════════════════════════ */}
        <section
          className="px-6 py-16 sm:px-10"
          style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="mx-auto max-w-2xl">
            <EmailCapture
              heading="Get smarter about your business"
              subheading="Tax tips, benchmarking insights, and strategies that help Canadian agents keep more of what they earn. Sent occasionally — no spam."
              source="homepage"
            />
          </div>
        </section>

      </main>

      <MarketingFooter />

    </div>
  );
}
