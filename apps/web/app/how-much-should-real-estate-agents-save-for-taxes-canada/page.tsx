import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, AlertTriangle } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "How Much Should Real Estate Agents Save for Taxes in Canada?",
  description:
    "A practical guide for Canadian real estate agents on the typical tax-portion estimate for federal tax, provincial tax, CPP, and HST/GST — with a free 2025 tax estimator tool.",
  openGraph: {
    title: "How Much Should Real Estate Agents Save for Taxes in Canada?",
    description:
      "Practical guide for Canadian real estate agents. Federal tax, provincial tax, CPP, and HST/GST tax-portion estimates — plus a free 2025 tax estimator.",
    url: "https://agentrunway.ca/how-much-should-real-estate-agents-save-for-taxes-canada",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/how-much-should-real-estate-agents-save-for-taxes-canada",
  },
};

// ── CRA primary-source registry (self-contained per article) ────────────────

const CRA_SOURCES = [
  {
    id: 1,
    label: "CRA — CPP contribution rates, maximums and exemptions",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html",
  },
  {
    id: 2,
    label: "CRA — Canadian income tax rates for individuals",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html",
  },
  {
    id: 3,
    label: "CRA — When to register for and start charging the GST/HST",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html",
  },
  {
    id: 4,
    label: "CRA — GST/HST: charge and collect the tax — which rate to charge",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html",
  },
  {
    id: 5,
    label: "CRA — Required tax instalments: who has to pay",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/who-pays-instalments.html",
  },
  {
    id: 6,
    label: "CRA — Required tax instalments: due dates",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/due-dates.html",
  },
] as const;

function CRACite({ id }: { id: number }) {
  const src = CRA_SOURCES.find((s) => s.id === id);
  if (!src) return null;
  return (
    <a
      href={src.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Source: ${src.label}`}
      className="text-emerald-600 align-super text-[0.65em] no-underline hover:underline"
    >
      [{id}]
    </a>
  );
}

// ── JSON-LD structured data ──────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline: "How Much Should Real Estate Agents Save for Taxes in Canada?",
  description:
    "A practical guide for Canadian real estate agents on the typical tax-portion estimate for every commission cheque — with a free tax estimator tool.",
  url: "/how-much-should-real-estate-agents-save-for-taxes-canada",
  datePublished: "2025-03-01",
  dateModified: "2026-05-10",
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
        text: "For Canadian real estate agents, a typical estimate of the total tax portion lands between 25% and 40% of net business income, depending on province and total income. This estimate covers federal income tax, provincial income tax, CPP contributions, and HST/GST remittances.",
      },
    },
    {
      "@type": "Question",
      name: "Do real estate agents in Canada pay CPP?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Self-employed real estate agents in Canada pay both the employee and employer portions of CPP — a combined rate of 11.90% on net self-employment income between $3,500 and $71,300 (2025 YMPE), plus CPP2 at 8.00% on earnings between $71,300 and $81,200 (2025 YAMPE).",
      },
    },
    {
      "@type": "Question",
      name: "Do real estate agents charge HST or GST in Canada?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Once a real estate agent earns more than $30,000 in gross revenue over four consecutive calendar quarters, the agent is required to register for and collect HST/GST per CRA rules. In HST provinces like Ontario (13%) or the Maritimes (15%), this is a significant additional obligation.",
      },
    },
    {
      "@type": "Question",
      name: "How often do self-employed agents pay taxes in Canada?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CRA requires quarterly instalment payments (March 15, June 15, September 15, December 15) when net tax owing exceeds $3,000 in the current year and in either of the two preceding years ($1,800 in Quebec). HST/GST is typically filed annually or quarterly depending on revenue.",
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
              Canadian Tax Guide for Agents
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              How Much Should Real Estate Agents Save for Taxes in Canada?
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Most agents know a tax portion of every cheque has to come off the
              top. Few know exactly how much. This guide explains the typical
              estimated percentage, why it varies by province, and what CRA rules
              apply — plus a free tax estimator to plug in your own numbers.
            </p>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            TOOL CALLOUT — points to the canonical Canadian Realtor Tax Estimator
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-16 sm:px-10" id="calculator">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <Link
                href="/tools/realtor-tax-estimator"
                className="group block overflow-hidden rounded-2xl border-2 border-blue-600 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-8 shadow-lg shadow-blue-600/10 transition hover:shadow-xl hover:shadow-blue-600/20 sm:p-10"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <Calculator className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                      Free tool · Updated for 2025
                    </p>
                    <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                      Canadian Realtor Tax Estimator
                    </h2>
                    <p className="mt-3 text-base leading-relaxed text-slate-600">
                      Plug in your GCI, province, and deal count. Get federal tax,
                      provincial tax, CPP/QPP, and quarterly instalment amounts —
                      calculated with the same engine that powers the Agent Runway
                      dashboard. All 13 provinces and territories, 2025 brackets.
                    </p>
                    <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 transition group-hover:gap-2.5">
                      Open the free estimator
                      <ArrowRight className="h-4 w-4" />
                    </p>
                  </div>
                </div>
              </Link>
            </ScrollRevealSection>
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
                  and $300,000 in gross commission income, the typical estimate
                  of the total tax portion lands between 25% and 40% of net
                  business income. (This 25%–40% range is an Agent Runway
                  composite estimate of federal + provincial + CPP, not a CRA
                  figure — actual rates depend on province, brokerage split,
                  deductible expenses, and whether the agent operates through a
                  personal corporation (PREC).)
                </p>
                <p>
                  The breakdown typically includes four components:
                </p>
                <ul className="ml-4 space-y-2 list-disc list-outside">
                  <li>
                    <strong>Federal income tax</strong> — Progressive brackets
                    from 15% to 33% on net self-employment income
                    <CRACite id={2} />
                  </li>
                  <li>
                    <strong>Provincial income tax</strong> — Varies by province,
                    from ~4% (Nunavut) to ~21% (Nova Scotia) at the highest
                    marginal rates
                    <CRACite id={2} />
                  </li>
                  <li>
                    <strong>CPP contributions</strong> — Self-employed agents
                    pay both employee and employer portions: 11.90% on income
                    between $3,500 and $71,300 (2025 YMPE), plus CPP2 at 8.00%
                    on earnings between $71,300 and $81,200 (2025 YAMPE)
                    <CRACite id={1} />
                  </li>
                  <li>
                    <strong>HST/GST</strong> — Once gross revenue exceeds
                    $30,000 over four consecutive calendar quarters, CRA
                    requires registration and collection of HST/GST
                    <CRACite id={3} />. In Ontario the rate is 13%; in the
                    Maritimes, 15%
                    <CRACite id={4} />
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
                  One framing many agents use: estimate the tax portion of each
                  commission cheque ahead of time, and reconcile it against
                  CRA&apos;s published quarterly instalment dates of March 15,
                  June 15, September 15, and December 15<CRACite id={6} />.
                  Whether instalments apply in a given year depends on the
                  $3,000 net-tax-owing threshold described in CRA&apos;s
                  instalment rules<CRACite id={5} />. The{" "}
                  <Link
                    href="/tools/realtor-tax-estimator"
                    className="text-blue-600 underline underline-offset-2 hover:text-blue-500"
                  >
                    free tax estimator
                  </Link>{" "}
                  produces a starting estimate from your own numbers. For a
                  deeper look, see our{" "}
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
                    For Canadian real estate agents, a typical estimate of the
                    total tax portion lands between 25% and 40% of net business
                    income. That estimate covers federal income tax
                    <CRACite id={2} />, provincial income tax<CRACite id={2} />,
                    CPP contributions<CRACite id={1} />, and HST/GST remittances
                    <CRACite id={4} />. The exact percentage depends on
                    province, total income, and deductible expenses.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Do real estate agents in Canada pay CPP?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Yes. Self-employed real estate agents pay both the employee
                    and employer portions of CPP — a combined rate of 11.90% on
                    net self-employment income between $3,500 and $71,300 (2025
                    YMPE), plus CPP2 at 8.00% on earnings between $71,300 and
                    $81,200 (2025 YAMPE)<CRACite id={1} />.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Do real estate agents charge HST or GST in Canada?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Once a real estate agent earns more than $30,000 in gross
                    revenue over four consecutive calendar quarters, CRA
                    requires the agent to register for and collect HST/GST
                    <CRACite id={3} />. In HST provinces like Ontario (13%) or
                    the Maritimes (15%)<CRACite id={4} />, this is a
                    significant additional obligation.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    How often do self-employed agents pay taxes in Canada?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    CRA requires quarterly instalment payments (March 15, June
                    15, September 15, December 15)<CRACite id={6} /> when net
                    tax owing exceeds $3,000 in the current year and in either
                    of the two preceding years ($1,800 in Quebec)
                    <CRACite id={5} />. HST/GST is typically filed annually or
                    quarterly depending on revenue. Missing instalments can
                    result in interest charges.
                  </p>
                </div>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            SOURCES
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 pt-12 pb-2 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <section
              aria-labelledby="sources"
              className="border-t border-slate-200 pt-8"
            >
              <h2
                id="sources"
                className="text-base font-semibold text-slate-800"
              >
                Sources
              </h2>
              <ol className="mt-3 space-y-1 text-xs text-slate-500">
                {CRA_SOURCES.map((s) => (
                  <li key={s.id} className="flex gap-2">
                    <span className="font-mono">[{s.id}]</span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-slate-700"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ol>
            </section>
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
                <strong>Disclaimer:</strong> This guide and the linked estimator
                provide information for educational purposes only and do not
                constitute tax, legal, or financial advice. Tax obligations
                vary based on individual circumstances. Consult a qualified
                accountant or tax professional for advice specific to your
                situation. Agent Runway assumes no liability for tax-related
                decisions.
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
              Agent Runway estimates the tax portion of every deal
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
