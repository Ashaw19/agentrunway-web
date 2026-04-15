import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, AlertTriangle } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";
import { TaxSavingsCalculator } from "./tax-savings-calculator";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "How Much Should Real Estate Agents Save for Taxes in Canada? | Agent Runway",
  description:
    "Use our free calculator to estimate how much Canadian real estate agents should set aside for federal tax, provincial tax, CPP, and HST/GST. Based on 2025 tax brackets.",
  openGraph: {
    title: "How Much Should Real Estate Agents Save for Taxes in Canada?",
    description:
      "Free calculator for Canadian real estate agents. Estimate federal tax, provincial tax, CPP, and HST/GST set-asides based on your GCI and province.",
    url: "https://agentrunway.ca/how-much-should-real-estate-agents-save-for-taxes-canada",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/how-much-should-real-estate-agents-save-for-taxes-canada",
  },
};

// ── JSON-LD structured data ──────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline: "How Much Should Real Estate Agents Save for Taxes in Canada?",
  description:
    "A practical guide with an interactive calculator for Canadian real estate agents to estimate their tax set-aside from every commission cheque.",
  url: "/how-much-should-real-estate-agents-save-for-taxes-canada",
  datePublished: "2025-03-01",
  dateModified: "2026-04-15",
});

const JSON_LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How much should a real estate agent save for taxes in Canada?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most Canadian real estate agents typically set aside between 25% and 40% of their net business income for taxes, depending on their province and total income. This covers federal income tax, provincial income tax, CPP contributions, and HST/GST remittances.",
      },
    },
    {
      "@type": "Question",
      name: "Do real estate agents in Canada pay CPP?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Self-employed real estate agents in Canada pay both the employee and employer portions of CPP — a combined rate of 11.9% on net self-employment income between $3,500 and $71,300 (2025 figures), plus CPP2 on earnings up to $79,400.",
      },
    },
    {
      "@type": "Question",
      name: "Do real estate agents charge HST or GST in Canada?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "If a real estate agent earns more than $30,000 in gross revenue over four consecutive calendar quarters, they must register for and collect HST/GST. In HST provinces like Ontario (13%) or the Maritimes (15%), this is a significant additional obligation.",
      },
    },
    {
      "@type": "Question",
      name: "How often do self-employed agents pay taxes in Canada?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The CRA requires quarterly instalment payments (March 15, June 15, September 15, December 15) if you owe more than $3,000 in net tax for the current year or either of the two preceding years. HST/GST is typically filed annually or quarterly depending on revenue.",
      },
    },
  ],
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TaxSavingsGuidePage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_ARTICLE) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }}
      />

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ════════════════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-400">
              <Calculator className="h-3.5 w-3.5" />
              Free Calculator for Canadian Agents
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              How Much Should Real Estate Agents Save for Taxes in Canada?
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Most agents know they should be setting money aside. Few know
              exactly how much. Use the calculator below to estimate your
              federal tax, provincial tax, CPP, and HST/GST obligations —
              based on your GCI, province, and brokerage split.
            </p>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            INTERACTIVE CALCULATOR
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-16 sm:px-10" id="calculator">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <TaxSavingsCalculator />
            </ScrollRevealSection>

            {/* Cross-link: full tax estimator for detailed breakdown */}
            <div className="mt-10 rounded-xl border border-blue-200 bg-blue-50 p-5">
              <p className="text-sm text-blue-900">
                <strong>Want the full breakdown?</strong>{" "}
                The <Link href="/tools/realtor-tax-estimator" className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">Canadian Realtor Tax Estimator</Link>{" "}
                shows federal tax, provincial tax, CPP/QPP, quarterly instalment amounts,
                and per-deal set-asides — with the full 2025 bracket-by-bracket calculation
                for every province and territory.
              </p>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            THE SHORT ANSWER
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                The short answer: 25% to 40%
              </h2>
              <div className="mt-6 space-y-5 text-base leading-relaxed text-slate-600">
                <p>
                  For most Canadian real estate agents earning between $80,000
                  and $300,000 in gross commission income, the total tax
                  set-aside lands between 25% and 40% of net business income.
                  That range depends on your province, your brokerage split,
                  your deductible expenses, and whether you operate through a
                  personal corporation (PREC).
                </p>
                <p>
                  The breakdown typically includes four components:
                </p>
                <ul className="ml-4 space-y-2 list-disc list-outside">
                  <li>
                    <strong>Federal income tax</strong> — Progressive brackets
                    from 15% to 33% on net self-employment income
                  </li>
                  <li>
                    <strong>Provincial income tax</strong> — Varies by province,
                    from ~4% (Nunavut) to ~21% (Nova Scotia) at the highest
                    marginal rates
                  </li>
                  <li>
                    <strong>CPP contributions</strong> — Self-employed agents
                    pay both employee and employer portions: 11.9% on income
                    between $3,500 and $71,300 (2025), plus CPP2 up to $79,400
                  </li>
                  <li>
                    <strong>HST/GST</strong> — If you gross over $30,000 per
                    year, you must register and collect HST/GST. In Ontario
                    that&apos;s 13%; in the Maritimes, 15%
                  </li>
                </ul>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            WHY IT'S CONFUSING
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Why tax planning is harder for real estate agents
              </h2>
              <div className="mt-6 space-y-5 text-base leading-relaxed text-slate-600">
                <p>
                  Salaried employees have taxes deducted at source. Real estate
                  agents don&apos;t. Every commission cheque arrives as gross
                  income with no deductions — and the CRA expects you to manage
                  your own instalments, track your own expenses, and calculate
                  your own obligations.
                </p>
                <p>
                  This creates a common pattern: agents spend commission income
                  as it arrives, underestimate their tax liability, and face a
                  painful bill at filing time. The CRA may also charge interest
                  on missed quarterly instalments — even if you eventually pay
                  the full amount.
                </p>
                <p>
                  The fix is straightforward but requires discipline: know your
                  estimated rate, set aside that percentage from every cheque,
                  and pay your quarterly instalments on time. The calculator
                  above gives you a starting point. For a deeper look, see our{" "}
                  <Link
                    href="/real-estate-agent-tax-planning-canada"
                    className="text-blue-600 underline underline-offset-2 hover:text-blue-500"
                  >
                    full tax planning guide
                  </Link>
                  , learn{" "}
                  <Link
                    href="/real-estate-agent-business-expenses-canada"
                    className="text-blue-600 underline underline-offset-2 hover:text-blue-500"
                  >
                    what expenses you can deduct
                  </Link>
                  , or walk through the{" "}
                  <Link
                    href="/t2125-guide-real-estate-agents-canada"
                    className="text-blue-600 underline underline-offset-2 hover:text-blue-500"
                  >
                    T2125 line by line
                  </Link>
                  .
                </p>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            FAQ SECTION (matches FAQPage schema)
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Frequently asked questions
              </h2>
              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    How much should a real estate agent save for taxes in Canada?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Most Canadian real estate agents typically set aside between 25% and
                    40% of their net business income for taxes. This covers
                    federal income tax, provincial income tax, CPP
                    contributions, and HST/GST remittances. The exact percentage
                    depends on your province, total income, and deductible
                    expenses.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Do real estate agents in Canada pay CPP?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Yes. Self-employed real estate agents pay both the employee
                    and employer portions of CPP — a combined rate of 11.9% on
                    net self-employment income between $3,500 and $71,300 (2025
                    figures), plus CPP2 on earnings up to $79,400.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Do real estate agents charge HST or GST in Canada?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    If a real estate agent earns more than $30,000 in gross
                    revenue over four consecutive calendar quarters, they must
                    register for and collect HST/GST. In HST provinces like
                    Ontario (13%) or the Maritimes (15%), this is a significant
                    additional obligation.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    How often do self-employed agents pay taxes in Canada?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    The CRA requires quarterly instalment payments (March 15,
                    June 15, September 15, December 15) if you owe more than
                    $3,000 in net tax. HST/GST is typically filed annually or
                    quarterly depending on revenue. Missing instalments can
                    result in interest charges.
                  </p>
                </div>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            DISCLAIMER
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-10 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed text-amber-800">
                <strong>Disclaimer:</strong> This calculator provides estimates
                for educational purposes only and does not constitute tax,
                legal, or financial advice. Tax obligations vary based on
                individual circumstances. Consult a qualified accountant or tax
                professional for advice specific to your situation. Agent Runway
                assumes no liability for tax-related decisions.
              </p>
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
              heading="Want to see your full financial picture?"
              subheading="Get a clearer view of your income, taxes, and runway — not just estimates."
              ctaLabel="Get Early Access"
              source="tax_calculator"
              variant="dark"
              successHeading="You're in."
              successSubtext="Want to see how this looks with your full numbers?"
              successCtaLabel="View the Demo"
              successCtaHref="/demo"
              successSecondaryLabel="Or read why I built Agent Runway →"
              successSecondaryHref="/about"
            />
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            CLOSING CTA
        ════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden px-6 py-20 text-center sm:px-10">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(37,99,235,0.25) 0%, rgba(124,58,237,0.20) 50%, rgba(37,99,235,0.15) 100%)",
            }}
          />
          <div className="absolute -left-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-blue-500/30 blur-[80px]" />
          <div className="absolute -right-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-violet-500/25 blur-[80px]" />

          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Stop guessing. Start tracking.
            </h2>
            <p className="mt-5 text-lg text-slate-400">
              Agent Runway estimates your tax set-aside from every deal
              automatically — federal, provincial, CPP, and HST/GST. No
              spreadsheets. No surprises at tax time.
            </p>
            <div className="mt-8">
              <Link
                href="/demo"
                className="group inline-flex items-center rounded-xl px-10 py-4 text-sm font-bold text-white transition-all duration-200"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  boxShadow: "0 0 40px rgba(99,102,241,0.4)",
                }}
              >
                See Your Full Financial Picture
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            {/* Trust bridge */}
            <div className="mt-6 border-t border-white/10 pt-6">
              <p className="text-sm text-slate-500">
                Want to understand how this fits into your full business?
              </p>
              <Link
                href="/about"
                className="mt-1 inline-flex text-sm font-medium text-slate-400 underline underline-offset-4 hover:text-white transition-colors"
              >
                Read why I built Agent Runway →
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
