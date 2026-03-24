import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, User, Users, TrendingUp, MapPin } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "About Agent Runway | Business Analytics for Real Estate Agents",
  description:
    "Learn why Agent Runway was built and how it helps real estate agents track GCI, forecast income, and run their business with clarity.",
  openGraph: {
    url: "https://agentrunway.ca/about",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/about",
  },
};

// ── "Who it's for" cards ──────────────────────────────────────────────────────

const AUDIENCE = [
  {
    icon: User,
    heading: "Independent Agents",
    body: "Solo practitioners who want to stop guessing and start measuring. Know your true net income, understand your pace, and plan ahead — without a business degree or a team of analysts.",
  },
  {
    icon: Users,
    heading: "Small Teams",
    body: "Teams who need shared visibility into performance, GCI goals, and financial health. Agent Runway gives team leaders the data to coach effectively and plan for growth.",
  },
  {
    icon: TrendingUp,
    heading: "Growth-Focused Professionals",
    body: "Agents who are serious about building a real business. If you set annual GCI targets, think about your financial runway, and want AI-powered insights — Agent Runway was built for you.",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              Our Story
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Why Agent Runway Exists
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Real estate agents run complex businesses. Most manage hundreds
              of thousands — sometimes millions — in annual transaction value,
              navigate commission split structures, carry fixed monthly costs,
              and plan around a market that is seasonal by nature. Yet the tools
              most agents rely on were built for transaction management, not
              business intelligence. Agent Runway exists to close that gap.
            </p>
          </div>
        </section>

        {/* ── Founder Story ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">

            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Built by a real estate agent
            </h2>

            {/* Founder attribution */}
            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600">
                <span className="text-sm font-bold text-white">AS</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Andrew Shaw</p>
                <p className="flex items-center gap-1 text-xs text-slate-400">
                  <MapPin className="h-3 w-3" />
                  New Brunswick, Canada
                </p>
              </div>
            </div>

            {/* Story prose */}
            <div className="mt-8 space-y-5 text-base leading-relaxed text-slate-600">
              <p>
                Agent Runway was created by Andrew Shaw, a real estate agent
                based in New Brunswick, Canada. Andrew noticed something after
                years in the industry: the agents around him were running
                sophisticated businesses but operating without the kind of
                financial visibility that other self-employed professionals take
                for granted.
              </p>
              <p>
                Most agents knew their GCI. Some tracked their transactions
                carefully. But very few had a clear picture of their net income
                after every split and fee, a reliable forecast of where
                they&apos;d land at year-end, a meaningful sense of how long
                their cash reserves would carry them through a slow stretch, or
                any benchmarks to compare their performance against peers in
                their market.
              </p>
              <p>
                The tools for that kind of analysis either didn&apos;t exist or
                required patching together spreadsheets, accounting software,
                and CRM reports — none of which were designed to work together
                or speak the language of a real estate agent&apos;s business.
              </p>
            </div>

            {/* Pull quote */}
            <blockquote className="my-10 border-l-4 border-blue-600 pl-5">
              <p className="text-lg font-medium leading-relaxed text-slate-800">
                &ldquo;Real estate agents are running multi-six-figure businesses.
                They deserve the same financial clarity that every other serious
                business owner expects.&rdquo;
              </p>
              <footer className="mt-3 text-sm text-slate-400">— Andrew Shaw, Founder</footer>
            </blockquote>

          </div>
        </section>

        {/* ── Mission ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Our mission
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
              Give every Canadian real estate agent the financial visibility to
              run their business with confidence — not guesswork. Agent Runway
              brings together GCI tracking, income forecasting, expense
              management, tax planning, and AI-powered insights in a single
              platform built around how real estate agents actually work.
            </p>
          </div>
        </section>

        {/* ── Who it&apos;s for ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">

            <div className="mb-14 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Who Agent Runway is for
              </h2>
            </div>

            <div className="grid gap-8 sm:grid-cols-3">
              {AUDIENCE.map(({ icon: Icon, heading, body }) => (
                <div key={heading} className="rounded-xl border border-slate-200 bg-slate-50 p-8">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mb-3 text-lg font-semibold text-slate-900">{heading}</h3>
                  <p className="text-sm leading-relaxed text-slate-500">{body}</p>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* ── CTA ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to see your business clearly?
            </h2>
            <p className="mt-5 text-lg text-slate-400">
              Join agents across Canada who use Agent Runway to track GCI,
              plan for taxes, and measure their financial runway.
            </p>
            <div className="mt-10">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
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
