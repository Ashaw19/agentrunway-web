import type { Metadata } from "next";
import Link from "next/link";
import { Calculator, TrendingUp, ArrowRight, Sparkles, FileText } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { CharterScarcityStrip } from "@/components/charter-scarcity-strip";
import { breadcrumbSchema, faqSchema } from "@/lib/schema";

const URL = "https://agentrunway.ca/tools";

export const metadata: Metadata = {
  title: "Free Tools for Canadian Real Estate Agents",
  description:
    "Free calculators and tools for Canadian real estate agents — tax estimator, commission calculator, and more. Built for 2025 rates across all 13 provinces and territories.",
  openGraph: {
    type: "website",
    url: URL,
    title: "Free Tools for Canadian Real Estate Agents",
    description:
      "Free calculators for Canadian realtors — 2025 tax estimator and per-deal commission calculator.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: URL },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool catalog
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    href: "/tools/realtor-tax-estimator",
    title: "Canadian Realtor Tax Estimator",
    description:
      "Estimate your 2025 federal tax, provincial tax, CPP/QPP, and quarterly instalments — covers all 13 provinces and territories.",
    icon: Calculator,
    badge: "Updated for 2025",
    accentColor: "blue",
  },
  {
    href: "/real-estate-commission-calculator-canada",
    title: "Per-Deal Commission Calculator",
    description:
      "See what you actually take home from a single deal after brokerage split, transaction fees, HST/GST, and income tax.",
    icon: TrendingUp,
    badge: null,
    accentColor: "emerald",
  },
];

const ACCENT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  blue: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/30 group-hover:border-blue-400/60",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30 group-hover:border-emerald-400/60",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

const JSON_LD_BREADCRUMB = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Tools", url: "/tools" },
]);

const TOOLS_FAQS = [
  {
    question: "Are these calculators really free to use?",
    answer:
      "Yes. Every tool on this page is free for Canadian real estate agents — no signup, no credit card, no email required. We built them for our own use at Agent Runway and open-sourced them for every realtor in Canada.",
  },
  {
    question: "How accurate are the tax estimates?",
    answer:
      "The 2025 Canadian Realtor Tax Estimator uses current federal brackets, provincial brackets for all 13 provinces and territories, CPP Tier 1 and Tier 2 rates, and QPP for Quebec residents. It's designed to get you within a few hundred dollars of your actual bill for planning purposes. It is not a substitute for a CRA-licensed accountant at filing time.",
  },
  {
    question: "Do these tools work for every province?",
    answer:
      "Yes. Every calculator supports all 13 Canadian provinces and territories, including Quebec (which uses QPP instead of CPP and has its own Relevé 1 rules).",
  },
  {
    question: "What's the difference between these tools and the Agent Runway app?",
    answer:
      "These calculators are one-off snapshots — you plug in numbers, get an answer. The Agent Runway app tracks every deal automatically so your tax estimate, pipeline forecast, and Runway Score stay updated in real time without any manual entry. The agentic Flight Crew can also log deals, draft client outreach, and update your pipeline with a single approval.",
  },
  {
    question: "Are more calculators planned?",
    answer:
      "Yes. Upcoming free tools include a per-deal tax set-aside calculator, a runway months calculator, an HST instalment schedule, and a PREC vs. sole proprietor break-even analyzer.",
  },
];

const JSON_LD_FAQ = faqSchema(TOOLS_FAQS);

export default function ToolsIndexPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_BREADCRUMB) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }}
      />

      <MarketingNav />

      <main>
        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Free tools · No signup required
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl md:text-6xl">
              Free tools for
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                Canadian real estate agents
              </span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-300 sm:text-xl">
              Calculators we built for ourselves at Agent Runway, now free for every Canadian
              realtor. 2025 federal and provincial rates, all 13 provinces and territories.
            </p>
          </div>
        </section>

        {/* ── Tool grid ── */}
        <section className="bg-slate-950 px-6 pb-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-6 sm:grid-cols-2">
              {TOOLS.map((tool) => {
                const styles = ACCENT_STYLES[tool.accentColor];
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className={`group block rounded-2xl border bg-white/[0.02] p-8 transition hover:bg-white/[0.04] ${styles.border}`}
                  >
                    <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${styles.bg}`}>
                      <tool.icon className={`h-6 w-6 ${styles.text}`} />
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-xl font-bold text-white">{tool.title}</h2>
                      {tool.badge && (
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${styles.bg} ${styles.text}`}>
                          {tool.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-400">
                      {tool.description}
                    </p>
                    <p className={`mt-5 inline-flex items-center gap-1.5 text-sm font-semibold ${styles.text} transition group-hover:gap-2.5`}>
                      Open tool <ArrowRight className="h-4 w-4" />
                    </p>
                  </Link>
                );
              })}
            </div>

            {/* Coming soon teaser — signals more tools are on the way */}
            <div className="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center">
              <p className="text-sm text-slate-400">
                More calculators coming: per-deal tax set-aside, runway months, HST instalment schedule,
                PREC vs. sole proprietor break-even.
              </p>
            </div>

            {/* Deep-dive guides — long-form Canadian realtor references */}
            <div className="mt-14">
              <h2 className="text-xl font-bold text-white">
                Deep-dive guides for Canadian realtors
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                The context behind the numbers — written for agents, by an agent.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    href: "/how-much-should-real-estate-agents-save-for-taxes-canada",
                    title: "How much should you save for taxes?",
                    description: "Province-by-province tax-save percentages with CPP, GST/HST, and quarterly instalments.",
                  },
                  {
                    href: "/t2125-guide-real-estate-agents-canada",
                    title: "T2125 filing guide",
                    description: "Line-by-line walkthrough of the CRA T2125 for real estate agents.",
                  },
                  {
                    href: "/real-estate-agent-tax-planning-canada",
                    title: "Year-round tax planning",
                    description: "How to plan quarterly instalments, CPP contributions, and year-end moves.",
                  },
                  {
                    href: "/real-estate-agent-business-expenses-canada",
                    title: "Deductible business expenses",
                    description: "Every CRA category real estate agents can deduct — with examples.",
                  },
                  {
                    href: "/real-estate-tax-deadlines-canada",
                    title: "2026 tax deadlines",
                    description: "Every CRA deadline Canadian realtors need — instalments, T1, HST, T4A, RRSP.",
                  },
                ].map((guide) => (
                  <Link
                    key={guide.href}
                    href={guide.href}
                    className="group flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:border-slate-700 hover:bg-slate-900/70"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-blue-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{guide.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">
                        {guide.description}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── Visible counterpart to the FAQPage JSON-LD for AEO */}
        <section className="bg-slate-950 px-6 pb-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-black text-white sm:text-3xl">
              Frequently asked questions
            </h2>
            <div className="mt-6 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/30">
              {TOOLS_FAQS.map((faq, i) => (
                <details key={i} className="group p-5 sm:p-6">
                  <summary className="cursor-pointer list-none text-base font-semibold text-white marker:hidden">
                    <span className="flex items-start justify-between gap-4">
                      {faq.question}
                      <span className="mt-1 shrink-0 text-slate-500 transition-transform group-open:rotate-45">
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="bg-slate-950 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-black text-white sm:text-4xl">
              Calculators are a snapshot. <br />
              <span className="text-slate-400">Agent Runway is the full system.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Every deal updates your tax estimate, pipeline forecast, and Runway Score automatically.
              The agentic Flight Crew logs deals, drafts client outreach, and updates your pipeline — with
              a single approval.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              >
                See pricing →
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Explore features
              </Link>
            </div>

            <div className="mt-10">
              <CharterScarcityStrip variant="prominent" />
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
