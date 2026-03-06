import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, User, Users, TrendingUp, MapPin } from "lucide-react";

export const metadata: Metadata = {
  title: "About Agent Runway | Business Analytics for Real Estate Agents",
  description:
    "Learn why Agent Runway was built and how it helps real estate agents track GCI, forecast income, and run their business with clarity.",
  openGraph: {
    url: "https://agentrunway.ca/about",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
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
              <footer className="mt-3 text-sm text-slate-400">
                — Andrew Shaw, Founder
              </footer>
            </blockquote>

            <div className="space-y-5 text-base leading-relaxed text-slate-600">
              <p>
                Agent Runway started as a personal tool — a way to track GCI,
                model the year-end forecast, and understand exactly where the
                business stood at any point in the year. It evolved into a
                full-featured analytics platform designed for every agent who
                wants to{" "}
                <Link
                  href="/how-real-estate-agents-track-gci"
                  className="text-blue-600 underline-offset-2 hover:underline"
                >
                  track GCI properly
                </Link>
                , plan for taxes, measure financial runway, and make smarter
                business decisions.
              </p>
            </div>
          </div>
        </section>

        {/* ── Mission ── */}
        <section className="bg-slate-50 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-3xl">

            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Our mission
            </h2>

            <p className="mx-auto mt-6 max-w-2xl text-xl font-medium leading-relaxed text-slate-700">
              Help real estate agents run their business like a professional
              company — with the analytics, forecasting, and financial clarity
              that every serious business deserves.
            </p>

            <div className="mx-auto mt-8 max-w-2xl space-y-4 text-left text-base leading-relaxed text-slate-500">
              <p>
                That means replacing end-of-year surprises with live projections.
                Replacing gut feel with data. Replacing a spreadsheet that gets
                updated once a quarter with a dashboard that reflects your
                business in real time.
              </p>
              <p>
                It means giving agents the same calibre of{" "}
                <Link
                  href="/real-estate-business-analytics"
                  className="text-blue-600 underline-offset-2 hover:underline"
                >
                  real estate business analytics
                </Link>
                {" "}that a well-run company in any other industry would consider
                standard — built specifically around the income structure,
                seasonality, and tax complexity of Canadian real estate.
              </p>
            </div>
          </div>
        </section>

        {/* ── Who It's For ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">

            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Who Agent Runway is for
              </h2>
              <p className="mt-4 text-lg text-slate-500">
                Built for agents at every stage who want to run their practice
                like a business.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              {AUDIENCE.map(({ icon: Icon, heading, body }) => (
                <div
                  key={heading}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-7"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mb-2 font-semibold text-slate-900">{heading}</h3>
                  <p className="text-sm leading-relaxed text-slate-500">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              We&apos;re just getting started.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway is actively developed with one goal: give real estate
              agents the business intelligence tools they deserve. If you have
              feedback, a feature request, or just want to share how you use
              Agent Runway in your practice, we&apos;d love to hear from you.
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
