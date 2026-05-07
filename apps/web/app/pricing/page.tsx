import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { PricingCards } from "@/components/pricing-cards";
import { CharterScarcityStrip } from "@/components/charter-scarcity-strip";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Pricing — Real Estate Analytics Software",
  description:
    "View pricing for Agent Runway, business analytics software for real estate agents with forecasting, runway tracking, and AI insights.",
  openGraph: {
    url: "https://agentrunway.ca/pricing",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/pricing",
  },
};

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
    a: "Agent Runway is built specifically for Canadian real estate agents — from solo agents building their first business plan to high-producing agents who want deep financial analytics and tax estimation tools.",
  },
  {
    q: "Which provinces and territories are supported?",
    a: "All 13 Canadian provinces and territories are supported for tax calculations, including federal and provincial income tax rates, CPP, and Quebec QPP contributions.",
  },
  {
    q: "How does billing work?",
    a: "The Professional plan can be billed monthly or annually (save ~17% with annual billing). You can upgrade, downgrade, or cancel at any time from your account settings. Team plan pricing is scoped per team size and agreed at setup.",
  },
  {
    q: "What's included in the Professional plan?",
    a: "Professional gives you the full platform: GCI tracking, CRM with flight statuses, probability-weighted forecasts, a financial runway score, PDF reports, AI business assistant, tax estimation tools, receipt scanning, mileage tracking, and industry benchmark data — everything serious agents need to run their business with clarity.",
  },
];

// ── FAQ JSON-LD ───────────────────────────────────────────────────────────────

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

const PRICING_BREADCRUMB = breadcrumbSchema([
  { name: "Home",    url: "/" },
  { name: "Pricing", url: "/pricing" },
]);

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRICING_BREADCRUMB) }}
      />

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          {/* Animated gradient orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="orb-drift-1 absolute -left-20 -top-20 h-96 w-96 rounded-full bg-blue-600/25 blur-[120px]" />
            <div className="orb-drift-2 absolute -right-20 top-10 h-80 w-80 rounded-full bg-violet-600/20 blur-[100px]" />
            <div className="orb-drift-3 absolute bottom-0 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[90px]" />
          </div>

          {/* Flight path motif — forward motion / path to clarity */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/marks/flight-path.svg"
            aria-hidden="true"
            alt=""
            className="pointer-events-none absolute bottom-6 right-8 w-[200px] select-none opacity-[0.06]"
          />

          <div className="relative mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              ✦ No hidden fees. No surprises.
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Priced for agents.
              <br />
              <span className="bg-gradient-to-r from-blue-300 to-violet-300 bg-clip-text text-transparent">
                Built to pay for itself.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              One commission. That&apos;s all it takes to cover a full year of Pro. Most agents say the tax estimation tools alone justify the cost.{" "}
              <Link
                href="/how-real-estate-agents-track-gci"
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                Start your free trial
              </Link>
              , no credit card required.
            </p>
          </div>
        </section>

        {/* ── Charter Scarcity Strip ── */}
        <section className="bg-slate-950 px-6 pb-4 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <CharterScarcityStrip variant="prominent" />
          </div>
        </section>

        {/* ── Pricing Cards ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <PricingCards />
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
            {/* Cleared for Takeoff badge */}
            <div className="mb-6 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/badges/cleared-for-takeoff.svg"
                alt="Cleared for Takeoff"
                className="w-[80px]"
              />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Start understanding your business today.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              No contracts. No setup fees. Start with a 14-day free trial and
              upgrade when Agent Runway becomes the most important dashboard in
              your business.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-500 hover:shadow-blue-500/40"
              >
                Start Free Trial
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
      <MarketingFooter />
    </div>
  );
}
