import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ArrowRight, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Agent Runway Pricing | Real Estate Analytics Software",
  description:
    "View pricing for Agent Runway, business analytics software for real estate agents with forecasting, runway tracking, and AI insights.",
  openGraph: {
    url: "https://agentrunway.ca/pricing",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/pricing",
  },
};

// ── Pricing tier data ─────────────────────────────────────────────────────────

const TIERS = [
  {
    name: "Starter",
    tagline: "For agents getting organised",
    price: "Free",
    priceDetail: "No credit card required",
    cta: "Get Started",
    ctaHref: "/login",
    featured: false,
    features: [
      "GCI tracking and deal log",
      "Year-to-date dashboard",
      "Basic income forecasting",
      "Expense category tracking",
      "Transaction history",
      "Canadian agent profile setup",
    ],
  },
  {
    name: "Professional",
    tagline: "For serious growth-focused agents",
    price: "$49",
    priceDetail: "per month, billed monthly",
    cta: "Start Free Trial",
    ctaHref: "/login",
    featured: true,
    features: [
      "Everything in Starter",
      "Advanced forecasting with P10–P90 bands",
      "Financial runway score (A+ to F)",
      "Business reports and PDF download",
      "AI insights and advisor cards",
      "Canadian tax planning tools",
      "CREA benchmark comparison",
      "5-year growth projections",
    ],
  },
  {
    name: "Team",
    tagline: "For teams and brokerages",
    price: "Custom",
    priceDetail: "Contact us for a quote",
    cta: "Contact Us",
    ctaHref: "mailto:hello@agentrunway.ca",
    featured: false,
    features: [
      "Everything in Professional",
      "Shared team visibility",
      "Team analytics dashboard",
      "Brokerage-level reporting",
      "Custom report templates",
      "Volume pricing",
      "Priority support",
      "Custom onboarding",
    ],
  },
] as const;

// ── FAQ data ──────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "Is there a free trial for the Professional plan?",
    a: "Yes. The Professional plan includes a 14-day free trial with no credit card required. You can explore every feature before committing.",
  },
  {
    q: "Can I cancel at any time?",
    a: "Absolutely. There are no long-term contracts or cancellation fees. Cancel from your account settings at any time and your access continues through the end of your current billing period.",
  },
  {
    q: "Who is Agent Runway designed for?",
    a: "Agent Runway is built specifically for Canadian real estate agents — from solo agents building their first business plan to high-producing agents who want deep financial analytics and tax planning.",
  },
  {
    q: "Which provinces and territories are supported?",
    a: "All 13 Canadian provinces and territories are supported for tax calculations, including federal and provincial income tax rates, CPP, and Quebec QPP contributions.",
  },
  {
    q: "How does billing work?",
    a: "The Professional plan is billed monthly. You can upgrade, downgrade, or cancel at any time from your account settings. Team plan pricing is scoped per team size and agreed at setup.",
  },
  {
    q: "What's the difference between Starter and Professional?",
    a: "Starter gives you the core GCI tracking and basic forecasting to get organised. Professional adds probability-weighted forecasts, a financial runway score, PDF reports, AI advisor cards, tax planning, and CREA benchmark data — everything serious agents need to run their business with clarity.",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── Navigation ── */}
      <header className="border-b border-slate-800 px-6 py-5 sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight text-white">
            Agent Runway
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
          >
            Sign In
          </Link>
        </div>
      </header>

      <main>

        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              Transparent Pricing
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Simple Pricing for Real Estate Agents
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Agent Runway helps you{" "}
              <Link
                href="/how-real-estate-agents-track-gci"
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                track GCI
              </Link>
              , forecast income, measure financial runway, and receive
              AI-powered business insights — all in one dashboard built for
              Canadian agents. Start free, upgrade when you&apos;re ready.
            </p>
          </div>
        </section>

        {/* ── Pricing Cards ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-6 sm:grid-cols-3">
              {TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className={`relative flex flex-col rounded-2xl p-8 ${
                    tier.featured
                      ? "border-2 border-blue-600 bg-white shadow-xl shadow-blue-600/10"
                      : "border border-slate-200 bg-white"
                  }`}
                >
                  {/* Most Popular badge */}
                  {tier.featured && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1 text-xs font-semibold text-white">
                        <Sparkles className="h-3 w-3" />
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Tier name + tagline */}
                  <div className="mb-6">
                    <h2 className="text-lg font-bold text-slate-900">{tier.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{tier.tagline}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold tracking-tight text-slate-900">
                        {tier.price}
                      </span>
                      {tier.price !== "Free" && tier.price !== "Custom" && (
                        <span className="text-sm text-slate-500">/mo</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{tier.priceDetail}</p>
                  </div>

                  {/* CTA */}
                  <Link
                    href={tier.ctaHref}
                    className={`mb-8 inline-flex w-full items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
                      tier.featured
                        ? "bg-blue-600 text-white hover:bg-blue-500"
                        : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {tier.cta}
                    {tier.featured && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Link>

                  {/* Divider */}
                  <div className="mb-6 border-t border-slate-100" />

                  {/* Feature list */}
                  <ul className="flex-1 space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <CheckCircle2
                          className={`mt-0.5 h-4 w-4 shrink-0 ${
                            tier.featured ? "text-blue-600" : "text-slate-400"
                          }`}
                        />
                        <span className="text-sm leading-snug text-slate-600">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Trust line */}
            <p className="mt-10 text-center text-sm text-slate-400">
              All plans include SSL security, Canadian data residency, and
              automatic updates.{" "}
              <Link
                href="/real-estate-business-analytics"
                className="text-blue-600 underline-offset-2 hover:underline"
              >
                See all features
              </Link>
              .
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-4xl">

            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                Frequently asked questions
              </h2>
              <p className="mt-3 text-base text-slate-500">
                Everything you need to know before getting started.
              </p>
            </div>

            <dl className="grid gap-8 sm:grid-cols-2">
              {FAQS.map(({ q, a }) => (
                <div key={q} className="rounded-xl border border-slate-200 bg-white p-6">
                  <dt className="mb-2 text-sm font-semibold text-slate-900">{q}</dt>
                  <dd className="text-sm leading-relaxed text-slate-500">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Start understanding your business today.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              No contracts. No setup fees. Start on the free Starter plan and
              upgrade when Agent Runway becomes the most important dashboard in
              your business.
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
                href="/"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Learn More
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800 bg-slate-950 px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm font-semibold text-white">Agent Runway</p>
          <p className="mt-1 text-xs text-slate-500">
            © {new Date().getFullYear()} Agent Runway. All rights reserved.
          </p>
        </div>
      </footer>

    </div>
  );
}
