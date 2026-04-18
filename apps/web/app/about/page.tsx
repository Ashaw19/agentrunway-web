import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  User,
  Users,
  TrendingUp,
  MapPin,
  BarChart3,
  Calculator,
  Sparkles,
  Check,
  Zap,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";
import { andrewShawPersonSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "About Agent Runway | Built by a Real Estate Agent, for Real Estate Agents",
  description:
    "Agent Runway was built by Andrew Shaw, a Canadian real estate agent who saw that agents deserve real business analytics — not patchwork spreadsheets. Read the founder story.",
  openGraph: {
    url: "https://agentrunway.ca/about",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/about",
  },
};

// ── JSON-LD structured data ──────────────────────────────────────────────────

const JSON_LD_ABOUT = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About Agent Runway",
  description:
    "Agent Runway was built by a Canadian real estate agent who saw that agents deserve the same financial clarity every other business owner expects.",
  url: "https://agentrunway.ca/about",
  mainEntity: {
    "@type": "SoftwareApplication",
    name: "Agent Runway",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    creator: { "@id": "https://agentrunway.ca/about/andrew-shaw#person" },
  },
};

const JSON_LD_BREADCRUMB = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "About", url: "/about" },
]);

// ── "Who it's for" cards ──────────────────────────────────────────────────────

const AUDIENCE = [
  {
    icon: User,
    heading: "Independent Agents",
    body: "Solo practitioners who want to stop guessing and start measuring. Know your true net income, understand your pace, and plan ahead — without a business degree.",
  },
  {
    icon: Users,
    heading: "Small Teams",
    body: "Teams who need shared visibility into performance, GCI goals, and financial health. Agent Runway gives team leaders the data to coach effectively and plan for growth.",
  },
  {
    icon: TrendingUp,
    heading: "Growth-Focused Professionals",
    body: "Agents who are serious about building a real business. If you set annual GCI targets, think about your financial runway, and want AI-powered insights — this was built for you.",
  },
];

// ── Charter benefits ─────────────────────────────────────────────────────────

const CHARTER_BENEFITS = [
  "Locked-in Charter Member pricing — your rate never increases",
  "Direct access to the founder for feature requests and feedback",
  "Priority access to new features before general release",
  "Shape the product roadmap as an early adopter",
  "Free onboarding support and data migration help",
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_ABOUT) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(andrewShawPersonSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_BREADCRUMB) }}
      />

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ════════════════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              Our Story
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Built by a Real Estate Agent.{" "}
              <br className="hidden sm:block" />
              <span className="text-slate-300">
                For Real Estate Agents.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Real estate agents run complex businesses — managing hundreds of
              thousands in annual transaction value, navigating commission splits,
              and planning around a seasonal market. Yet the tools most agents rely
              on were built for transaction management — not for showing agents where they actually stand.
              Agent Runway exists to close that gap.
            </p>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            FOUNDER STORY
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">

            <ScrollRevealSection>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                The spreadsheet that started everything
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
            </ScrollRevealSection>

            {/* Story prose */}
            <ScrollRevealSection>
              <div className="mt-8 space-y-5 text-base leading-relaxed text-slate-600">
                <p>
                  Agent Runway started as a spreadsheet. Andrew Shaw, a real estate
                  agent based in New Brunswick, Canada, had been tracking his GCI in
                  a messy Excel file — the same way most agents track theirs. After
                  years in the industry, he noticed something: the agents around him
                  were running sophisticated businesses but operating without the
                  kind of financial visibility that other self-employed professionals
                  take for granted.
                </p>
                <p>
                  Most agents knew their GCI. Some tracked their transactions
                  carefully. But very few had a clear picture of their net income
                  after every split and fee, a reliable forecast of where
                  they&apos;d land at year-end, a meaningful sense of how long their
                  cash reserves would carry them through a slow stretch, or any
                  benchmarks to compare their performance against peers.
                </p>
                <p>
                  The tools for that kind of analysis either didn&apos;t exist or
                  required patching together spreadsheets, accounting software, and
                  CRM reports — none of which were designed to work together or speak
                  the language of a real estate agent&apos;s business.
                </p>
                <p>
                  So Andrew built Agent Runway. Not as a tech startup. As a
                  practical answer to a real problem he faced every day: &ldquo;How
                  is my business <em>actually</em> doing?&rdquo;
                </p>
              </div>
            </ScrollRevealSection>

            {/* Pull quote */}
            <ScrollRevealSection>
              <blockquote className="my-10 border-l-4 border-blue-600 pl-5">
                <p className="text-lg font-medium leading-relaxed text-slate-800">
                  &ldquo;Real estate agents are running multi-six-figure businesses.
                  They deserve the same financial clarity that every other serious
                  business owner expects.&rdquo;
                </p>
                <footer className="mt-3 text-sm text-slate-400">— Andrew Shaw, Founder</footer>
              </blockquote>
            </ScrollRevealSection>

          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            SCREENSHOT SHOWCASE — Runway Score
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <ScrollRevealSection>
              <div className="grid items-center gap-12 lg:grid-cols-2">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Dashboard
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    Your Runway Score — at a glance
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-slate-600">
                    The dashboard opens with your Runway Score — a single composite
                    number that combines your GCI pace, pipeline strength, financial
                    reserves, and goal progress. It&apos;s the cockpit view of your
                    business health, updated in real time as you close deals and log
                    expenses.
                  </p>
                  <ul className="mt-5 space-y-2">
                    {["GCI pace vs annual goal", "Pipeline coverage ratio", "Cash runway in months", "AI-generated daily briefing"].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-slate-600">
                        <Check className="h-4 w-4 shrink-0 text-blue-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Screenshot placeholder — dark mockup frame */}
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-2xl">
                  <div className="flex items-center gap-1.5 border-b border-slate-700 bg-slate-800 px-4 py-2.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                    <span className="ml-3 text-[10px] text-slate-500">agentrunway.ca/dashboard</span>
                  </div>
                  <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-8">
                    {/* Stylized placeholder — simulated dashboard elements */}
                    <div className="w-full max-w-[280px] space-y-3">
                      {/* Score bar */}
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
                          <BarChart3 className="h-4 w-4 text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <div className="h-2 w-16 rounded-full bg-slate-700" />
                          <div className="mt-1.5 h-3 w-24 rounded-full bg-blue-500/30" />
                        </div>
                        <div className="h-6 w-12 rounded-md bg-emerald-500/20" />
                      </div>
                      {/* KPI row */}
                      <div className="grid grid-cols-3 gap-2">
                        {[0.6, 0.8, 0.45].map((w, i) => (
                          <div key={i} className="rounded-md border border-slate-700/50 bg-slate-800/50 p-2">
                            <div className="h-1.5 w-8 rounded-full bg-slate-700" />
                            <div className="mt-1.5 h-2.5 rounded-full bg-slate-600" style={{ width: `${w * 100}%` }} />
                          </div>
                        ))}
                      </div>
                      {/* Chart placeholder */}
                      <div className="flex items-end gap-1 rounded-md border border-slate-700/50 bg-slate-800/50 p-2.5 pt-4">
                        {[35, 50, 40, 65, 75, 55, 85, 70, 48, 60, 80, 58].map((h, i) => (
                          <div key={i} className="flex-1 rounded-sm bg-blue-500/25" style={{ height: `${h * 0.4}px` }} />
                        ))}
                      </div>
                      <p className="text-center text-[10px] font-medium tracking-wider text-slate-600 uppercase">
                        Live dashboard preview
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            MID-PAGE CTA — Trust Bridge
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-900 px-6 py-16 sm:px-10">
          <ScrollRevealSection>
            <div className="mx-auto max-w-2xl text-center">
              <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                If this sounds familiar, you should see what your numbers actually look like.
              </h3>
              <p className="mt-4 text-base text-slate-400">
                Import your transactions. See your Runway Score. It takes five minutes.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/demo"
                  className="inline-flex items-center rounded-xl px-8 py-3.5 text-sm font-bold text-white transition-all duration-200"
                  style={{
                    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                    boxShadow: "0 0 30px rgba(99,102,241,0.3)",
                  }}
                >
                  Try Agent Runway
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="/real-estate-agent-tax-planning-canada"
                  className="text-sm font-medium text-slate-400 underline underline-offset-4 hover:text-white transition-colors"
                >
                  Read our tax guide →
                </Link>
              </div>
            </div>
          </ScrollRevealSection>
        </section>

        {/* ════════════════════════════════════════════════════════
            SCREENSHOT SHOWCASE — Tax & Forecasting
        ════════════════════════════════════════════════════════ */}

        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <ScrollRevealSection>
              <div className="grid items-center gap-12 lg:grid-cols-2">
                {/* Screenshot placeholder */}
                <div className="relative order-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-2xl lg:order-1">
                  <div className="flex items-center gap-1.5 border-b border-slate-700 bg-slate-800 px-4 py-2.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                    <span className="ml-3 text-[10px] text-slate-500">agentrunway.ca/overhead</span>
                  </div>
                  <div className="flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-8">
                    {/* Stylized placeholder — simulated tax breakdown */}
                    <div className="w-full max-w-[280px] space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
                          <Calculator className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="flex-1">
                          <div className="h-2 w-20 rounded-full bg-slate-700" />
                          <div className="mt-1.5 h-3 w-16 rounded-full bg-emerald-500/30" />
                        </div>
                      </div>
                      {/* Tax breakdown rows */}
                      {[0.7, 0.5, 0.35, 0.55].map((w, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md border border-slate-700/50 bg-slate-800/50 px-3 py-2">
                          <div className="h-1.5 w-16 rounded-full bg-slate-700" />
                          <div className="h-2 rounded-full bg-emerald-500/25" style={{ width: `${w * 60}px` }} />
                        </div>
                      ))}
                      {/* Total bar */}
                      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <div className="h-2 w-12 rounded-full bg-emerald-500/30" />
                          <div className="h-3 w-20 rounded-full bg-emerald-500/25" />
                        </div>
                      </div>
                      <p className="text-center text-[10px] font-medium tracking-wider text-slate-600 uppercase">
                        Live tax estimate preview
                      </p>
                    </div>
                  </div>
                </div>
                <div className="order-1 lg:order-2">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <Calculator className="h-3.5 w-3.5" />
                    Tax Estimates
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    Estimate what you may owe — before the CRA asks
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-slate-600">
                    Canadian real estate agents are self-employed. That means
                    quarterly instalments, HST/GST obligations, CPP contributions,
                    and deductible expenses that most agents only think about at tax
                    time. Agent Runway tracks it all year-round so there are no
                    surprises.
                  </p>
                  <Link
                    href="/real-estate-agent-tax-planning-canada"
                    className="mt-5 inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-500 transition-colors"
                  >
                    Read our Canadian tax guide
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            MISSION
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <ScrollRevealSection>
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Our mission
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
                Give every Canadian real estate agent the financial visibility to
                run their business with confidence — not guesswork. Agent Runway
                brings together GCI tracking, income forecasting, expense
                management, tax estimation tools, and AI-powered data exploration in a single
                platform built around how real estate agents actually work.
              </p>
            </div>
          </ScrollRevealSection>
        </section>

        {/* ════════════════════════════════════════════════════════
            COMPANY
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <ScrollRevealSection>
            <div className="mx-auto max-w-3xl">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                The Company
              </h2>
              <p className="mt-5 text-base leading-relaxed text-slate-600">
                Agent Runway Inc. is a private corporation incorporated on
                April 16, 2026 under the Canada Business Corporations Act
                (Canada Corporation No. 1786542-2), with its registered office
                in New Brunswick, Canada.
              </p>
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Leadership
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  Andrew Shaw — Founder &amp; Director
                </p>
              </div>
            </div>
          </ScrollRevealSection>
        </section>

        {/* ════════════════════════════════════════════════════════
            WHO IT'S FOR
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <ScrollRevealSection>
              <div className="mb-14 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  Who Agent Runway is for
                </h2>
              </div>
            </ScrollRevealSection>

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

        {/* ════════════════════════════════════════════════════════
            CHARTER MEMBER BENEFITS
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50 to-white p-8 sm:p-10">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Limited Availability
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                  Charter Member benefits
                </h3>
                <p className="mt-3 text-base text-slate-600">
                  The first 50 agents to join Agent Runway receive Charter Member
                  status — permanently locked-in pricing and a direct line to the
                  founder.
                </p>
                <ul className="mt-6 space-y-3">
                  {CHARTER_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <span className="text-sm leading-relaxed text-slate-700">{benefit}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Link
                    href="/pricing"
                    className="inline-flex items-center rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
                  >
                    View Charter Pricing
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            FINAL CTA
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <ScrollRevealSection>
            <div className="mx-auto max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-slate-300">
                <Zap className="h-3 w-3 text-amber-400" />
                Start free · No credit card required
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Claim your Charter Member spot
              </h2>
              <p className="mt-5 text-lg text-slate-400">
                Join agents across Canada who are done guessing and ready to know
                exactly where their business stands. Set up takes five minutes.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/demo"
                  className="group inline-flex items-center rounded-xl px-10 py-4 text-sm font-bold text-white transition-all duration-200"
                  style={{
                    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                    boxShadow: "0 0 40px rgba(99,102,241,0.4)",
                  }}
                >
                  Try Agent Runway Free
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/pricing"
                  className="text-sm font-medium text-slate-400 underline underline-offset-4 hover:text-white transition-colors"
                >
                  View pricing →
                </Link>
              </div>
            </div>
          </ScrollRevealSection>
        </section>

      </main>

      {/* ── Footer ── */}
      <MarketingFooter />
    </div>
  );
}
