import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, TrendingUp, Shield, Sparkles, ArrowRight } from "lucide-react";
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

// ── Feature data ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: BarChart3,
    title: "Track GCI",
    description:
      "Log every deal and watch your year-to-date commission income build against your annual goal. Know exactly where you stand at every point in the year.",
  },
  {
    icon: TrendingUp,
    title: "Forecast Income",
    description:
      "Seasonality-aware projections combine your closed deals and probability-weighted pipeline to show where you'll land at year-end.",
  },
  {
    icon: Shield,
    title: "Measure Financial Runway",
    description:
      "See how many months your cash reserves cover your fixed costs. Know your number before you need it — not after.",
  },
  {
    icon: Sparkles,
    title: "AI Business Insights",
    description:
      "Contextual advisor cards surface risks, opportunities, and next steps based on your live business data — not generic advice.",
  },
];

// ── Social proof ─────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote:
      "I used to just look at my GCI and hope for the best. Agent Runway showed me I was burning through my reserve faster than I thought — woke me up before it became a real problem.",
    name: "Sarah M.",
    title: "Residential Agent, Toronto ON",
    initials: "SM",
  },
  {
    quote:
      "The seasonality-aware forecasting is something I've never seen in any other tool. It actually accounts for the Q1 slowdown instead of projecting a straight line.",
    name: "Jason T.",
    title: "RE/MAX Agent, Calgary AB",
    initials: "JT",
  },
  {
    quote:
      "The tax planning cards alone are worth the subscription. Knowing my quarterly instalments without calling my accountant every month saves time and money.",
    name: "Michelle L.",
    title: "Independent Agent, Ottawa ON",
    initials: "ML",
  },
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────

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
        <section className="relative overflow-hidden bg-slate-950 px-6 py-24 text-center sm:px-10 sm:py-32">
          {/* Gradient orbs — static depth/glow */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute -left-10 -top-10 h-80 w-80 rounded-full bg-blue-600/20 blur-[100px]" />
            <div className="absolute -right-10 top-16 h-64 w-64 rounded-full bg-violet-600/[0.12] blur-[80px]" />
            <div className="absolute bottom-0 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-blue-500/10 blur-[90px]" />
          </div>

          <div className="relative mx-auto max-w-3xl">

            {/* Badge */}
            <div className="mb-6 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              Built for Canadian Real Estate Agents
            </div>

            {/* Headline */}
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              <span className="bg-gradient-to-r from-blue-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
                Agent Runway
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mt-5 text-xl font-medium text-slate-300 sm:text-2xl">
              Business Analytics for Real Estate Agents
            </p>

            {/* Body copy */}
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
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
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get Started
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

        {/* ── Features ── */}
        <section id="features" className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-6xl">

            <div className="mb-14 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Everything you need to run your business
              </h2>
              <p className="mt-4 text-lg text-slate-500">
                Purpose-built tools for agents who want financial clarity.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <article
                  key={title}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-6 transition-shadow hover:shadow-lg hover:shadow-blue-500/5"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mb-2 font-semibold text-slate-900">{title}</h3>
                  <p className="text-sm leading-relaxed text-slate-500">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Why It Matters ── */}
        <section id="why" className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl text-center">

            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Most agents track transactions.
              <br className="hidden sm:block" />
              Agent Runway gives you CEO-level visibility.
            </h2>

            <p className="mt-8 text-lg leading-relaxed text-slate-600">
              Knowing your GCI is a start. Agent Runway goes further — showing
              your true net income after commission split, transaction fees, and
              business expenses. It estimates your tax obligations before filing
              season, benchmarks your performance against CREA cohort data, and
              builds{" "}
              <Link
                href="/real-estate-business-analytics"
                className="text-blue-600 underline underline-offset-2 hover:text-blue-500"
              >
                forward-looking forecasts
              </Link>
              {" "}from your actual pipeline.
            </p>

            <p className="mt-5 text-lg leading-relaxed text-slate-600">
              Built specifically for Canadian agents, with full provincial tax
              calculations and national seasonality data. Whether you&apos;re a
              solo agent or running a team, Agent Runway gives you the financial
              clarity to make better decisions about your business.
            </p>

            <div className="mt-10">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
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

            <div className="grid gap-6 md:grid-cols-3">
              {TESTIMONIALS.map(({ quote, name, title, initials }) => (
                <figure
                  key={name}
                  className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-8"
                >
                  <blockquote className="flex-1">
                    <p className="text-sm leading-relaxed text-slate-300">
                      &ldquo;{quote}&rdquo;
                    </p>
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600">
                      <span className="text-xs font-bold text-white">
                        {initials}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{name}</p>
                      <p className="text-xs text-slate-500">{title}</p>
                    </div>
                  </figcaption>
                </figure>
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
