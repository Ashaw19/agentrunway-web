import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, AlertTriangle } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";
import { CommissionCalculator } from "./commission-calculator";
import { EmailCapture } from "@/components/email-capture";

export const metadata: Metadata = {
  title: "Real Estate Commission Calculator Canada — What You Actually Keep",
  description:
    "Free per-deal commission calculator for Canadian real estate agents. See what you take home after brokerage split, transaction fees, HST/GST, and estimated income tax.",
  openGraph: {
    title: "Real Estate Commission Calculator — Canada",
    description:
      "Free calculator for Canadian real estate agents. Find out exactly what you keep from a deal after your brokerage split, fees, and taxes.",
    url: "https://agentrunway.ca/real-estate-commission-calculator-canada",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/real-estate-commission-calculator-canada",
  },
};

// ── JSON-LD structured data ──────────────────────────────────────────────────

const JSON_LD_ARTICLE = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Real Estate Commission Calculator — Canada",
  description:
    "An interactive per-deal calculator for Canadian real estate agents to estimate take-home pay after brokerage splits, transaction fees, HST/GST, and income tax.",
  author: { "@type": "Person", name: "Andrew Shaw" },
  publisher: { "@type": "Organization", name: "Agent Runway", url: "https://agentrunway.ca" },
  datePublished: "2025-04-01",
  dateModified: "2026-05-10",
  url: "https://agentrunway.ca/real-estate-commission-calculator-canada",
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://agentrunway.ca/real-estate-commission-calculator-canada",
  },
};

const JSON_LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the average real estate commission in Canada?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Total real estate commission in Canada typically ranges from 3% to 5% of the sale price, split between the buyer's and seller's agents. Each agent's side is usually 2% to 2.5%. The exact rate varies by market, brokerage, and negotiation with the client.",
      },
    },
    {
      "@type": "Question",
      name: "Do I have to pay HST on my commission?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Per the CRA, once gross revenue exceeds $30,000 over four consecutive calendar quarters, GST/HST registration and collection applies. The rate charged depends on the province where the supply is made: 13% in Ontario, 15% in New Brunswick, Nova Scotia, PEI, and Newfoundland & Labrador, and 5% GST in provinces without HST such as Alberta, BC, Saskatchewan, and Manitoba. A single average-priced Canadian transaction's commission often surpasses $30,000 on its own.",
      },
    },
    {
      "@type": "Question",
      name: "How much does a real estate agent actually keep per deal?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "After brokerage splits, transaction fees, HST/GST, and income tax, the calculator estimates net take-home in roughly the 40% to 60% range of gross commission for common input combinations. As an illustration, a $500,000 sale at 2.5% commission produces $12,500 gross, with the calculator estimating a net of approximately $5,000 to $7,500 depending on split, fees, province, and marginal tax rate.",
      },
    },
    {
      "@type": "Question",
      name: "What are typical brokerage split structures in Canada?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Canadian brokerages typically use one of three models: percentage splits (e.g., 70/30 or 80/20 in the agent's favour), flat desk fees (a fixed monthly fee and you keep 100% of commission), or cap-based models (you pay a split until reaching a cap, then keep 100%). New agents often start at lower splits like 50/50 or 60/40.",
      },
    },
  ],
};

// ── CRA primary sources (audit registry) ─────────────────────────────────────
//
// Every CRA-mechanical claim in this article (HST $30K threshold, provincial
// HST/GST rates, GST/HST filing) maps to one of the URLs below. Inline
// citations are rendered via <CRACite id={n} />. URLs were hand-verified live
// on 2026-05-10.

const CRA_SOURCES = [
  {
    id: 1,
    label: "CRA — When to register for and start charging the GST/HST",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html",
  },
  {
    id: 2,
    label: "CRA — Charge and collect the tax: Which rate to charge",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html",
  },
  {
    id: 3,
    label: "CRA — File a GST/HST return",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/file-gst-hst-return.html",
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
      className="ml-0.5 align-super text-[0.65em] font-semibold text-blue-600 no-underline hover:underline"
    >
      [{id}]
    </a>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CommissionCalculatorPage() {
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
              Commission Calculator &middot; 2026
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Real Estate Commission Calculator — Canada
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Find out exactly what you take home from a deal after your
              brokerage split, transaction fees, and estimated taxes.
            </p>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            INTERACTIVE CALCULATOR
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-16 sm:px-10" id="calculator">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <CommissionCalculator />
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            HOW COMMISSION WORKS
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                How real estate commission works in Canada
              </h2>
              <div className="mt-6 space-y-5 text-base leading-relaxed text-slate-600">
                <p>
                  The total commission on a Canadian real estate transaction is
                  typically 3&ndash;5% of the sale price, split between the
                  buyer&apos;s and seller&apos;s agents. Each agent&apos;s side
                  is usually 2&ndash;2.5%.
                </p>
                <p>
                  But that&apos;s the gross number. Before an agent sees any of
                  it, the brokerage takes their split — anywhere from 5% to 50%
                  depending on your agreement. Then come per-deal transaction
                  fees, desk fees, and E&amp;O insurance. After that, the CRA
                  wants their share: HST/GST on the commission itself
                  <CRACite id={2} />, plus income tax on what&apos;s left.
                </p>
                <p>
                  As an illustration: a $500,000 sale at 2.5% commission
                  produces $12,500 gross. After an 80/20 brokerage split, a
                  $500 transaction fee, 13% HST collected and remitted, and a
                  30% blended income-tax estimate, the calculator below
                  estimates{" "}
                  <strong className="text-slate-900">
                    a net take-home in the $5,000&ndash;$6,000 range
                  </strong>
                  . Actual outcomes vary with split, fees, province, and
                  marginal tax rate.
                </p>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            WHAT AFFECTS YOUR TAKE-HOME
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                What affects your take-home
              </h2>
              <ol className="mt-6 space-y-4 text-base leading-relaxed text-slate-600">
                <li>
                  <strong className="text-slate-900">1. Commission rate</strong>{" "}
                  — Varies by market, brokerage, and negotiation with clients.
                  Buyer-side rates are evolving as transparency rules change.
                </li>
                <li>
                  <strong className="text-slate-900">2. Brokerage split</strong>{" "}
                  — Could be a flat desk fee, a percentage split (70/30, 80/20,
                  etc.), or a cap-based model where you keep 100% after hitting a
                  threshold.
                </li>
                <li>
                  <strong className="text-slate-900">3. Transaction fees</strong>{" "}
                  — Many brokerages charge $200&ndash;$800 per deal on top of the
                  split. Some also charge technology or admin fees.
                </li>
                <li>
                  <strong className="text-slate-900">4. HST/GST</strong>{" "}
                  — The CRA requires HST/GST collection and remittance once your
                  gross revenue exceeds $30,000 over four consecutive calendar
                  quarters<CRACite id={1} />. In Ontario that&apos;s 13%; in the
                  Maritimes, 15%; in Alberta, 5%<CRACite id={2} />. Returns are
                  filed with CRA on a monthly, quarterly, or annual basis
                  depending on revenue<CRACite id={3} />.
                </li>
                <li>
                  <strong className="text-slate-900">5. Income tax</strong>{" "}
                  — Federal plus provincial, calculated on your net
                  self-employment income. Rates vary significantly by province
                  and total annual income.
                </li>
              </ol>
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
                    What is the average real estate commission in Canada?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Total commission typically ranges from 3% to 5% of the sale
                    price, split between the buyer&apos;s and seller&apos;s
                    agents. Each agent&apos;s side is usually 2% to 2.5%. The
                    exact rate varies by market, brokerage, and negotiation with
                    the client.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Do I have to pay HST on my commission?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Per the CRA, once gross revenue exceeds $30,000 over four
                    consecutive calendar quarters, GST/HST registration and
                    collection applies<CRACite id={1} />. The rate charged
                    depends on the province where the supply is made: 13% in
                    Ontario, 15% in New Brunswick, Nova Scotia, PEI, and
                    Newfoundland &amp; Labrador, and 5% GST in provinces
                    without HST such as Alberta, BC, Saskatchewan, and
                    Manitoba<CRACite id={2} />. A single average-priced
                    Canadian transaction&apos;s commission often surpasses
                    $30,000 on its own.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    How much does a real estate agent actually keep per deal?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    After brokerage splits, transaction fees, HST/GST, and
                    income tax, the calculator estimates net take-home in
                    roughly the 40% to 60% range of gross commission for
                    common input combinations. As an illustration, a $500,000
                    sale at 2.5% commission produces $12,500 gross, with the
                    calculator estimating a net of approximately $5,000 to
                    $7,500 depending on split, fees, province, and marginal
                    tax rate.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    What are typical brokerage split structures in Canada?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Canadian brokerages typically use one of three models:
                    percentage splits (e.g., 70/30 or 80/20 in the agent&apos;s
                    favour), flat desk fees (a fixed monthly fee and you keep 100%
                    of commission), or cap-based models (you pay a split until
                    reaching a cap, then keep 100%). New agents often start at
                    lower splits like 50/50 or 60/40.
                  </p>
                </div>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            INTERNAL LINKS
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                More resources for Canadian agents
              </h2>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <Link
                  href="/how-much-should-real-estate-agents-save-for-taxes-canada"
                  className="group rounded-lg border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                    Tax Savings Calculator
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Estimate your full annual tax obligation — federal, provincial,
                    CPP, and HST/GST.
                  </p>
                </Link>
                <Link
                  href="/t2125-guide-real-estate-agents-canada"
                  className="group rounded-lg border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                    T2125 Filing Guide
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Line-by-line walkthrough for reporting self-employment income
                    to the CRA.
                  </p>
                </Link>
                <Link
                  href="/real-estate-agent-tax-planning-canada"
                  className="group rounded-lg border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">
                    Tax Planning Guide
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Quarterly instalments, common deductions claimed by
                    self-employed agents, and how CRA rules apply.
                  </p>
                </Link>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            SOURCES
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 pt-10 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <div
              aria-labelledby="sources"
              className="border-t border-slate-200 pt-8"
            >
              <h2
                id="sources"
                className="text-base font-semibold text-slate-800"
              >
                Sources
              </h2>
              <p className="mt-2 text-xs text-slate-500">
                Every CRA-mechanical claim in this article (HST registration
                threshold, provincial HST/GST rates, GST/HST filing) is backed
                by one of the primary sources below. Hand-verified live on
                2026-05-10.
              </p>
              <ol className="mt-4 space-y-2 text-xs text-slate-500">
                {CRA_SOURCES.map((s) => (
                  <li key={s.id} className="flex gap-2 leading-relaxed">
                    <span className="font-mono text-slate-400">[{s.id}]</span>
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
            </div>
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
                <strong>Disclaimer:</strong> This is an estimate based on
                rules published by the CRA. Verify with your accountant
                before making any filing or financial decision. The
                calculator provides estimates for educational purposes only
                and does not constitute tax, legal, or financial advice.
                Commission structures, tax rates, and fees vary based on
                individual circumstances. Agent Runway assumes no liability
                for financial decisions based on these estimates.
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
              heading="Want to track every deal automatically?"
              subheading="Agent Runway logs each commission, calculates your split, and estimates the tax portion."
              ctaLabel="Get Early Access"
              source="commission_calculator"
              variant="dark"
              successHeading="You're in."
              successSubtext="See how deal tracking works in practice."
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
              Stop guessing what you keep
            </h2>
            <p className="mt-5 text-lg text-slate-400">
              Agent Runway tracks every deal, calculates your split
              automatically, and estimates the tax portion of each commission.
              No spreadsheets. No surprises.
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
                See How Deal Tracking Works
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            {/* Trust bridge */}
            <div className="mt-6 border-t border-white/10 pt-6">
              <p className="text-sm text-slate-500">
                Want to understand the story behind Agent Runway?
              </p>
              <Link
                href="/about"
                className="mt-1 inline-flex text-sm font-medium text-slate-400 underline underline-offset-4 hover:text-white transition-colors"
              >
                Read the founder story →
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
