import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  MapPin,
  Briefcase,
  Building2,
  BookOpen,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { andrewShawPersonSchema, breadcrumbSchema } from "@/lib/schema";

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:
    "Andrew Shaw | Founder of Agent Runway — REALTOR® in Saint John, NB",
  description:
    "Andrew Shaw is a working REALTOR® on the Ellis Team in Saint John, New Brunswick, and the founder of Agent Runway — an agentic business operating system for Canadian real estate agents.",
  openGraph: {
    url: "https://agentrunway.ca/about/andrew-shaw",
    type: "profile",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/about/andrew-shaw",
  },
};

// ── JSON-LD ───────────────────────────────────────────────────────────────────

const BREADCRUMB = breadcrumbSchema([
  { name: "Home",         url: "/" },
  { name: "About",        url: "/about" },
  { name: "Andrew Shaw",  url: "/about/andrew-shaw" },
]);

// ── Focus areas ───────────────────────────────────────────────────────────────

const FOCUS_AREAS = [
  {
    icon: Briefcase,
    title: "Real Estate Practice",
    body:
      "Working REALTOR® on the Ellis Team in Saint John, New Brunswick. Represents buyers and sellers across the Greater Saint John market.",
  },
  {
    icon: Building2,
    title: "Agent Runway",
    body:
      "Founder of Agent Runway — an agentic business operating system built specifically for Canadian real estate agents. Income, taxes, expenses, pipeline, CRM, and forecasting, unified into one system.",
  },
  {
    icon: BookOpen,
    title: "Areas of Focus",
    body:
      "Canadian real estate business analytics, self-employed tax planning (T2125, HST, CCA), pipeline management and forecasting, and applied AI for real estate workflows.",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AndrewShawPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(andrewShawPersonSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB) }}
      />

      <MarketingNav />

      <main>
        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <Link
              href="/about"
              className="mb-10 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to About
            </Link>

            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              {/* Avatar */}
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-blue-600 sm:h-24 sm:w-24">
                <span className="text-2xl font-bold text-white sm:text-3xl">AS</span>
              </div>
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  Andrew Shaw
                </h1>
                <p className="mt-2 text-base leading-relaxed text-slate-300 sm:text-lg">
                  REALTOR® · Founder &amp; Director of Agent Runway Inc.
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="h-4 w-4" />
                  Saint John, New Brunswick, Canada
                </p>
              </div>
            </div>

            {/* Short bio */}
            <div className="mt-10 space-y-5 text-base leading-relaxed text-slate-300 sm:text-lg">
              <p>
                Andrew Shaw is a working REALTOR® on the{" "}
                <span className="font-semibold text-white">Ellis Team</span> in
                Saint John, New Brunswick, and the founder of Agent Runway —
                an agentic business operating system built specifically for
                Canadian real estate agents.
              </p>
              <p>
                Agent Runway grew out of real practice. Andrew built it to
                solve the problems he was living with every day as an agent:
                no clear picture of net income after splits and fees, no
                reliable year-end forecast, no sense of how long cash reserves
                would carry through a slow stretch, and no way to compare
                performance against peers. The tools for that kind of analysis
                either didn&apos;t exist or required patching together
                spreadsheets, accounting software, and CRM reports that were
                never designed to work together.
              </p>
              <p>
                Today, Agent Runway serves Canadian agents across all thirteen
                provinces and territories, with tax calculations tuned to each
                jurisdiction, forecasting grounded in Canadian market
                seasonality, and a Flight Crew that understands the realities of
                how real estate businesses actually run.
              </p>
            </div>
          </div>
        </section>

        {/* ── Focus areas ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-10 text-3xl font-bold tracking-tight text-slate-900">
              What Andrew Works On
            </h2>
            <div className="grid gap-6 sm:grid-cols-3">
              {FOCUS_AREAS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="mb-2 text-base font-bold text-slate-900">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Written by Andrew ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-3xl font-bold tracking-tight text-slate-900">
              Writing
            </h2>
            <p className="mb-8 text-base leading-relaxed text-slate-600">
              Andrew writes about Canadian real estate business analytics,
              GCI tracking, forecasting, and self-employed tax planning on
              the Agent Runway blog. Articles are grounded in working agent
              practice — not generic business advice.
            </p>
            <div className="space-y-3">
              <Link
                href="/blog"
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Read the Agent Runway Blog
                  </p>
                  <p className="text-xs text-slate-500">
                    Practical guides for Canadian real estate agents
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-blue-600" />
              </Link>
              <Link
                href="/real-estate-metrics"
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Real Estate Business Metrics Library
                  </p>
                  <p className="text-xs text-slate-500">
                    Definitions and formulas for the metrics every agent should track
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-blue-600" />
              </Link>
              <Link
                href="/about"
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    The Agent Runway Story
                  </p>
                  <p className="text-xs text-slate-500">
                    Why Andrew built Agent Runway
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-blue-600" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Contact ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Get in touch
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-400">
              For questions about Agent Runway, feedback, or feature requests,
              email is the best way to reach Andrew and the team.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <a
                href="mailto:hello@agentrunway.ca"
                className="inline-flex items-center rounded-lg bg-blue-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                hello@agentrunway.ca
              </a>
              <Link
                href="/contact"
                className="inline-flex items-center rounded-lg border border-slate-700 px-7 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Contact page
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
