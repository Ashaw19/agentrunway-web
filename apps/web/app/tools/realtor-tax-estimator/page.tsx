import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle, Calculator, Clock, MapPin, Sparkles } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";
import { TaxEstimator } from "./tax-estimator";
import { CharterScarcityStrip } from "@/components/charter-scarcity-strip";
import { articleSchema, faqSchema, breadcrumbSchema, howToSchema } from "@/lib/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

const URL = "https://agentrunway.ca/tools/realtor-tax-estimator";

export const metadata: Metadata = {
  title: "Canadian Realtor Tax Estimator — 2025 Self-Employed Calculator",
  description:
    "Free tax estimator for Canadian real estate agents. Calculate your 2025 federal + provincial income tax, CPP/QPP, and quarterly instalments — all 13 provinces and territories.",
  keywords: [
    "realtor tax calculator canada",
    "canadian real estate agent tax",
    "self employed tax calculator canada",
    "real estate agent quarterly tax",
    "realtor cpp calculator",
    "real estate T2125 tax estimate",
  ],
  openGraph: {
    type: "article",
    url: URL,
    title: "Canadian Realtor Tax Estimator — 2025 Self-Employed Calculator",
    description:
      "Free tax estimator for Canadian real estate agents. 2025 federal + provincial brackets, CPP/QPP contributions, and quarterly instalment amounts for all 13 provinces.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Canadian Realtor Tax Estimator — 2025",
    description:
      "Free tax calculator for Canadian real estate agents. Federal + provincial tax, CPP/QPP, quarterly instalments.",
  },
  alternates: {
    canonical: URL,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FAQ content — also emitted as FAQPage schema
// ─────────────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    question: "How much tax does a Canadian real estate agent pay?",
    answer:
      "Canadian real estate agents are self-employed and pay federal income tax, provincial income tax, and CPP (or QPP in Quebec) contributions on their net commission income. Effective rates typically range from 20% to 40% depending on net income and province. On $100,000 of net income in Ontario, expect roughly $25,000 to $28,000 in total tax plus CPP — an effective rate around 25% to 28%.",
  },
  {
    question: "Do real estate agents have to pay quarterly taxes in Canada?",
    answer:
      "Yes. The Canada Revenue Agency (CRA) requires quarterly tax instalments when you owe more than $3,000 in tax for two consecutive years ($1,800 in Quebec). Instalments are due March 15, June 15, September 15, and December 15. Missing instalments triggers compounding interest that cannot be deducted.",
  },
  {
    question: "How do I calculate my net income as a realtor?",
    answer:
      "Net income equals your gross commission income minus deductible business expenses. Deductible expenses include brokerage desk fees, MLS dues, vehicle expenses (using CCA and mileage), marketing, home office, phone, software subscriptions, professional development, and licence fees. Report everything on CRA form T2125 (Statement of Business or Professional Activities).",
  },
  {
    question: "When does HST or GST registration apply for a realtor?",
    answer:
      "Once your gross revenue exceeds $30,000 over four consecutive calendar quarters, the CRA requires HST registration (in HST-harmonized provinces) or GST registration (in the remaining provinces). Most active agents reach this threshold within their first couple of deals. Registered agents charge HST/GST on commission and may claim input tax credits on business expenses. This is an estimate based on rules published by the CRA. Verify with your accountant before making any filing or financial decision.",
  },
  {
    question: "What CPP do I pay as a self-employed realtor?",
    answer:
      "Self-employed agents pay both the employee and employer portions of CPP — 11.90% on earnings between $3,500 and $71,300 in 2025 (Tier 1), plus 8.00% on earnings between $71,300 and $81,200 (Tier 2). In Quebec you pay QPP instead, at slightly higher rates (12.80% Tier 1, 8.00% Tier 2). Half of Tier 1 and all of Tier 2 are tax-deductible.",
  },
  {
    question: "When does incorporating as a PREC become tax-relevant?",
    answer:
      "Incorporating as a Personal Real Estate Corporation (PREC) may become tax-relevant once net income consistently exceeds the small business deduction threshold (roughly $150,000 to $200,000 net), because corporate small-business rates are lower than personal marginal rates at those levels. PRECs are permitted in Ontario, British Columbia, Alberta, Saskatchewan, Manitoba, Nova Scotia, and increasingly others. This is general information based on rules published by the CRA — verify with a CPA familiar with real estate before making any incorporation decision.",
  },
  {
    question: "Is this calculator accurate?",
    answer:
      "The estimator uses 2025 federal and provincial tax brackets, the 2025 CPP/QPP contribution rates and maximums, the federal basic personal amount, and the blended federal rate cut from 15% to 14% (effective July 1, 2025). It assumes self-employment income only — no employment income, no RRSP deductions, no dependent credits, no spousal amounts. For precise planning and complex situations, consult a CPA.",
  },
  {
    question: "How is this different from Agent Runway's full product?",
    answer:
      "This free calculator gives you a one-time tax estimate. The full Agent Runway product tracks your GCI, expenses, and mileage in real time; updates your tax estimate with every new transaction; sends quarterly instalment reminders; calculates per-deal set-asides automatically; and includes an agentic Flight Crew that can execute tasks like logging deals, drafting client outreach, and updating your pipeline — all with human approval.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline: "Canadian Realtor Tax Estimator — 2025",
  description:
    "Interactive 2025 tax calculator for self-employed Canadian real estate agents. Covers federal and provincial income tax, CPP/QPP, and quarterly instalments across all 13 provinces and territories.",
  url: URL,
  datePublished: "2026-04-15",
  dateModified: "2026-04-15",
  authorName: "Andrew Shaw",
  imageUrl: "/og-image-v2.png",
});

const JSON_LD_FAQ = faqSchema(FAQS);

const JSON_LD_BREADCRUMB = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Tools", url: "/tools" },
  { name: "Realtor Tax Estimator", url: "/tools/realtor-tax-estimator" },
]);

const JSON_LD_HOWTO = howToSchema({
  name: "How to estimate Canadian real estate agent taxes",
  description:
    "Estimate your annual self-employed tax burden as a Canadian real estate agent in four steps.",
  totalTime: "PT3M",
  steps: [
    {
      name: "Enter your Gross Commission Income (GCI)",
      text: "Enter the total commission income you expect to earn this year, after brokerage splits and transaction fees.",
    },
    {
      name: "Enter your total business expenses",
      text: "Include vehicle expenses, MLS dues, desk fees, marketing, software, professional development, and any other deductible business costs.",
    },
    {
      name: "Select your province or territory",
      text: "Choose the province or territory where you are resident on December 31 — that's where you file provincial tax.",
    },
    {
      name: "Review your tax and quarterly instalment amounts",
      text: "The estimator shows your total federal tax, provincial tax, CPP or QPP contributions, effective rate, quarterly instalment amount, and per-deal set-aside target.",
    },
  ],
});

export default function RealtorTaxEstimatorPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      {/* ── JSON-LD structured data ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_ARTICLE) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_BREADCRUMB) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_HOWTO) }}
      />

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>
        {/* ═══════════════════════════════════════════════════════════════════
            HERO
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              Free Tool · Canadian Real Estate Agents
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl md:text-6xl">
              Canadian Realtor
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                Tax Estimator
              </span>
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-300 sm:text-xl">
              Estimate your 2025 federal tax, provincial tax, CPP/QPP contributions, and quarterly
              instalments in under a minute. Covers all 13 Canadian provinces and territories.
            </p>

            {/* Trust row */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-blue-400" />
                <span>All 13 provinces</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5 text-violet-400" />
                <span>2025 federal + provincial brackets</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-emerald-400" />
                <span>Under 60 seconds</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            CALCULATOR
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 pb-20 pt-12 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <TaxEstimator />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            EDUCATIONAL CONTENT — Answer Capsules under H2s (AEO)
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl prose prose-slate prose-lg">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                How much tax does a Canadian real estate agent actually pay?
              </h2>
              <p className="mt-3 rounded-lg border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-slate-700">
                <strong>Short answer:</strong> Canadian realtors typically owe{" "}
                <strong>20% to 40% of net commission income</strong> in combined federal tax,
                provincial tax, and CPP/QPP contributions. Effective rate depends on net income,
                province, and whether you&rsquo;re incorporated as a PREC. A sole proprietor in
                Ontario earning $100,000 net pays roughly $26,000 (26% effective). The same agent
                in Alberta pays roughly $24,000 (24% effective).
              </p>
              <p className="mt-4">
                Real estate agents in Canada are classified as self-employed independent contractors,
                which means you report commission income on{" "}
                <Link href="/t2125-guide-real-estate-agents-canada" className="text-blue-600 underline">
                  CRA form T2125
                </Link>
                . Unlike employees with income tax withheld at source, you are responsible for
                setting aside tax money yourself and remitting it through quarterly instalments.
              </p>
            </ScrollRevealSection>

            <ScrollRevealSection>
              <h2 className="mt-12 text-2xl font-bold text-slate-900 sm:text-3xl">
                What are the CRA quarterly instalment dates?
              </h2>
              <p className="mt-3 rounded-lg border-l-4 border-violet-500 bg-violet-50 px-4 py-3 text-slate-700">
                <strong>Short answer:</strong> Quarterly instalments are due{" "}
                <strong>March 15, June 15, September 15, and December 15</strong>. You&rsquo;re
                required to pay instalments once you owe more than $3,000 in tax for two consecutive
                years ($1,800 in Quebec). Missing an instalment triggers compounding interest that
                cannot be deducted on your return.
              </p>
              <p className="mt-4">
                CRA offers three instalment methods: the <em>no-calculation option</em> (pay the
                amounts CRA bills you), the <em>prior-year option</em> (one-quarter of last
                year&rsquo;s tax per instalment), and the <em>current-year option</em> (estimate
                this year&rsquo;s tax and pay one-quarter each instalment). Most agents use the
                no-calculation option unless income swings dramatically year-to-year.
              </p>
            </ScrollRevealSection>

            <ScrollRevealSection>
              <h2 className="mt-12 text-2xl font-bold text-slate-900 sm:text-3xl">
                What business expenses can realtors deduct?
              </h2>
              <p className="mt-3 rounded-lg border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-slate-700">
                <strong>Short answer:</strong> Canadian realtors can deduct{" "}
                <strong>brokerage desk fees, MLS dues, licensing, vehicle expenses,
                marketing, home office, phone, software, professional development</strong>, and
                more. The CRA requires expenses to be incurred for the purpose of earning commission
                income. Typical agents deduct 20% to 35% of gross commission as expenses.
              </p>
              <p className="mt-4">
                Vehicle expenses are the most commonly audited — the CRA requires a detailed mileage log
                distinguishing business kilometres from personal. Home office is deductible based on
                the business-use percentage of your home (square footage) applied to utilities, property
                taxes, insurance, and mortgage interest (not principal). CCA (capital cost allowance)
                lets you depreciate vehicles, computers, and office equipment over multiple years.
              </p>
              <p className="mt-4">
                See our full guide to{" "}
                <Link
                  href="/real-estate-agent-business-expenses-canada"
                  className="text-blue-600 underline"
                >
                  CRA-eligible business expenses for Canadian real estate agents
                </Link>
                .
              </p>
            </ScrollRevealSection>

            <ScrollRevealSection>
              <h2 className="mt-12 text-2xl font-bold text-slate-900 sm:text-3xl">
                How does CPP work for self-employed realtors?
              </h2>
              <p className="mt-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-slate-700">
                <strong>Short answer:</strong> Self-employed realtors pay{" "}
                <strong>both the employee and employer portions of CPP</strong> — 11.90% on
                earnings between $3,500 and $71,300 in 2025 (Tier 1), plus 8.00% on earnings between
                $71,300 and $81,200 (Tier 2). In Quebec, QPP rates are slightly higher.
                Half of Tier 1 and all of Tier 2 are tax-deductible.
              </p>
              <p className="mt-4">
                CPP and QPP contributions are capped. The maximum CPP contribution in 2025 is
                approximately $8,860 (combined Tier 1 + Tier 2). Once you hit that, no further
                CPP is owed on additional income. Quebec&rsquo;s QPP maximum is slightly higher
                due to the higher contribution rate.
              </p>
            </ScrollRevealSection>

            <ScrollRevealSection>
              <h2 className="mt-12 text-2xl font-bold text-slate-900 sm:text-3xl">
                Should I set up a Personal Real Estate Corporation (PREC)?
              </h2>
              <p className="mt-3 rounded-lg border-l-4 border-cyan-500 bg-cyan-50 px-4 py-3 text-slate-700">
                <strong>Short answer:</strong> A PREC is typically tax-advantageous once your net
                commission income consistently exceeds the small business deduction threshold
                (roughly <strong>$150,000 to $200,000 net</strong>). The corporate small-business
                tax rate is 9% federal plus 0%-4% provincial — much lower than personal marginal
                rates of 35%+ at that income level. Income left inside the corporation compounds
                at the lower rate. PRECs are permitted in Ontario, BC, Alberta, Saskatchewan,
                Manitoba, Nova Scotia, and are expanding to other provinces.
              </p>
              <p className="mt-4">
                PRECs come with accounting complexity (separate corporate tax return, payroll,
                dividends, shareholder loans). Below $150,000 net, the administrative cost usually
                outweighs the tax savings. Talk to a CPA who works with real estate agents in your
                province before incorporating.
              </p>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            FAQ
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold text-slate-900">Frequently asked questions</h2>
            <div className="mt-8 space-y-3">
              {FAQS.map((faq) => (
                <details
                  key={faq.question}
                  className="group rounded-lg border border-slate-200 bg-slate-50 transition hover:bg-white hover:shadow-sm"
                >
                  <summary className="cursor-pointer list-none px-5 py-4 text-base font-semibold text-slate-900">
                    <span className="flex items-center justify-between gap-4">
                      {faq.question}
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="border-t border-slate-200 px-5 py-4 text-sm leading-relaxed text-slate-700">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            CHEAT SHEET CROSSLINK
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-8 sm:px-10">
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Free download</p>
                <h2 className="mt-1 text-base font-bold text-slate-900">Want the figures on a printable card?</h2>
                <p className="mt-1 text-sm text-slate-600">
                  The Canadian Realtor Tax Cheat Sheet puts every 2025 bracket, CPP rate, GST/HST
                  threshold, and deadline on a single page — CRA-cited.
                </p>
              </div>
              <Link
                href="/tools/canadian-realtor-tax-cheat-sheet"
                className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Get the cheat sheet <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            RELATED RESOURCES
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-bold text-slate-900">Keep reading</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  href: "/t2125-guide-real-estate-agents-canada",
                  title: "T2125 guide for realtors",
                  blurb: "Line-by-line walkthrough of the CRA Statement of Business Activities for real estate agents.",
                },
                {
                  href: "/how-much-should-real-estate-agents-save-for-taxes-canada",
                  title: "How much of each deal is estimated for tax",
                  blurb: "Per-deal tax portion percentage by province and GCI bracket.",
                },
                {
                  href: "/real-estate-agent-business-expenses-canada",
                  title: "Eligible business expenses",
                  blurb: "CRA-eligible deductions for Canadian real estate agents.",
                },
                {
                  href: "/real-estate-agent-tax-planning-canada",
                  title: "Annual tax planning",
                  blurb: "Year-round tax planning strategy for Canadian realtors.",
                },
                {
                  href: "/real-estate-commission-calculator-canada",
                  title: "Commission calculator",
                  blurb: "What you actually keep from a single deal after splits, fees, and tax.",
                },
                {
                  href: "/metrics/financial-runway",
                  title: "What is financial runway?",
                  blurb: "How long you can cover business costs if no new deals close.",
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-md"
                >
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.blurb}</p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 group-hover:gap-2 transition-all">
                    Read more <ArrowRight className="h-3.5 w-3.5" />
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            FINAL CTA
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="bg-slate-950 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              More than a calculator
            </div>
            <h2 className="text-3xl font-black text-white sm:text-4xl">
              Tax is one number. <br />
              <span className="text-slate-400">You have thirty.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Agent Runway is an agentic business operating system for Canadian real estate agents.
              Every deal updates your income, tax estimate, pipeline forecast, and Runway Score.
              The Flight Crew doesn&rsquo;t just answer questions — it logs deals, drafts client
              outreach, and updates your pipeline with a single approval.
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

            {/* Charter scarcity — auto-hides after seat 50 */}
            <div className="mt-8">
              <CharterScarcityStrip variant="prominent" />
            </div>
            <div className="mt-6 flex items-start justify-center gap-2 text-[11px] text-slate-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="max-w-md text-left">
                This calculator is an estimate only and not tax advice. For precise planning and
                complex situations, consult a CPA.
              </p>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
