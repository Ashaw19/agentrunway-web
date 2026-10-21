import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, AlertTriangle } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { TaxEngineEstimateTable } from "@/components/tax-engine-estimate-table";
import { articleSchema } from "@/lib/schema";
import {
  BUSINESS_EXPENSE_RULE,
  CAPITAL_COST_ALLOWANCE_RULE,
  CRA_INSTALMENT_SOURCES,
  INCOME_TAX_INSTALMENT_DUE_DATES,
  INSTALMENT_ENGINE_ESTIMATE,
  INSTALMENT_INTEREST_RULE,
  INSTALMENT_OPTION_INTEREST_RULE,
  INSTALMENT_OPTION_LIST,
  INSTALMENT_OPTIONS_RULE,
  INSTALMENT_PENALTY_RULE,
  INSTALMENT_REQUIREMENT_RULE,
  INSTALMENT_WITHHOLDING_RULE,
  MEALS_ENTERTAINMENT_RULE,
  PERSONAL_EXPENSE_RULE,
  TAX_ENGINE_ESTIMATE,
} from "@agent-runway/core/tax-copy";

export const metadata: Metadata = {
  title: "Real Estate Agent Tax Planning in Canada",
  description:
    "A practical guide to tax planning for Canadian real estate agents — quarterly instalments, deductible expenses, CPP contributions, and HST/GST.",
  openGraph: {
    url: "https://agentrunway.ca/real-estate-agent-tax-planning-canada",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/real-estate-agent-tax-planning-canada",
  },
};

// ── JSON-LD structured data ──────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline: "Real Estate Agent Tax Planning in Canada",
  description:
    "A practical guide to tax planning for Canadian real estate agents — quarterly instalments, deductible expenses, CPP contributions, and HST/GST registration.",
  url: "/real-estate-agent-tax-planning-canada",
  datePublished: "2025-03-15",
  dateModified: "2026-10-13",
});

// ── CRA primary sources (audit registry) ─────────────────────────────────────
//
// Every numeric or mechanical claim in this article maps to one of the URLs
// below. Inline citations are rendered via <CRACite id={n} />. URLs were
// hand-verified live on 2026-05-06.

const CRA_SOURCES = [
  {
    id: 1,
    label: "CRA — CPP contribution rates, maximums and exemptions",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html",
  },
  {
    id: 2,
    label: "CRA — Second additional CPP contribution (CPP2) rates and maximums",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/making-deductions/second-additional-cpp-contribution-rates-maximums.html",
  },
  {
    id: 3,
    label: "CRA — Required tax instalments for individuals (overview)",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments.html",
  },
  {
    id: 4,
    label: "CRA — Required tax instalments — Who has to pay",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/who-pays-instalments.html",
  },
  {
    id: 5,
    label: "CRA — Required tax instalments — Payment due dates",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/due-dates.html",
  },
  {
    id: 6,
    label: "CRA — Required tax instalments — Options to calculate",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/options-calculate.html",
  },
  {
    id: 7,
    label: "CRA — Canadian income tax rates for individuals (current and previous years)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html",
  },
  {
    id: 8,
    label: "CRA — Line 30000: Basic personal amount",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-30000-basic-personal-amount.html",
  },
  {
    id: 9,
    label: "CRA — Expenses section of form T2125",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/expenses-section-form-t2125.html",
  },
  {
    id: 10,
    label: "CRA — Motor vehicle expenses (self-employed)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/business-income-tax-reporting/business-expenses/motor-vehicle-expenses.html",
  },
  {
    id: 11,
    label: "CRA — Business-use-of-home expenses",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html",
  },
  {
    id: 12,
    label: "CRA — Line 9936: Capital cost allowance (CCA)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/line-9936-capital-cost-allowance.html",
  },
  {
    id: 13,
    label: "CRA — Self-employed: Chapter 3 — Expenses (T4002, includes meals 50% rule)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-5.html",
  },
  { id: 14, ...CRA_INSTALMENT_SOURCES.interest },
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

// ── Table of contents entries ─────────────────────────────────────────────────

const TOC = [
  { href: "#self-employed-tax-basics", label: "The self-employed tax reality for real estate agents" },
  { href: "#quarterly-instalments", label: "Quarterly tax instalments: what they are and how to calculate them" },
  { href: "#deductible-expenses", label: "Tax deductions Canadian real estate agents commonly claim" },
  { href: "#tax-planning-tools", label: "Using Agent Runway for tax planning" },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RealEstateAgentTaxPlanningCanadaPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_ARTICLE) }}
      />

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <BookOpen className="h-3.5 w-3.5" />
              Guide for Canadian Real Estate Agents
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Real Estate Agent Tax Planning in Canada
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              No employer withholds tax for self-employed agents and no T4 is issued.
              As a self-employed real estate agent in Canada, the responsibility for
              tracking, estimating, and remitting tax sits with the agent. This guide
              surfaces the rules published by the CRA on the topics that touch
              real-estate agents most often: CPP obligations, quarterly instalments,
              deductible expenses, and the year-round cadence those rules imply.
            </p>
            <p className="mt-3 text-xs text-slate-500">8 min read</p>
          </div>
        </section>

        {/* ── Article Body ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* Top disclaimer */}
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs leading-relaxed text-amber-700">
                <strong className="text-amber-800">General information only — not tax advice.</strong>{" "}
                This article surfaces rules published by the CRA and produces general planning estimates only. Tax
                rules change frequently, rates vary by province, and individual circumstances differ. Verify with a
                qualified accountant or tax professional before making any filing or financial decision.{" "}
                <a href="/terms" className="underline underline-offset-2 hover:text-amber-900">Terms of Service</a>.
              </p>
            </div>

            {/* Table of Contents */}
            <nav
              aria-label="Table of contents"
              className="mb-12 rounded-xl border border-slate-200 bg-slate-50 p-6"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                In this article
              </p>
              <ol className="space-y-2">
                {TOC.map(({ href, label }, i) => (
                  <li key={href} className="flex items-baseline gap-2 text-sm">
                    <span className="font-mono text-xs text-slate-400">{i + 1}.</span>
                    <a
                      href={href}
                      className="text-blue-600 underline-offset-2 hover:underline"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <article className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:text-slate-900 prose-h3:text-lg prose-h3:text-slate-800 prose-p:leading-relaxed prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-slate-800">

              {/* ── Section 1: Self-Employed Tax Basics ── */}
              <h2 id="self-employed-tax-basics">
                The Self-Employed Tax Reality for Real Estate Agents
              </h2>

              <p>
                Most real estate agents in Canada operate as self-employed independent
                contractors rather than salaried employees. Three things follow from
                that for tax: nothing is withheld from a commission at source, both
                halves of CPP are payable by the agent, and income tax may be payable
                by instalments during the year.
              </p>

              <h3>No employer withholding</h3>

              <p>
                A salaried employee has income tax, CPP contributions, and EI premiums
                deducted directly from each paycheque before it arrives. A self-employed
                agent receives commission payments with no deductions applied at source.{" "}
                {INSTALMENT_WITHHOLDING_RULE}
                <CRACite id={4} />
              </p>

              <h3>The double CPP burden</h3>

              <p>
                Canada Pension Plan contributions are payable on net self-employment
                earnings. A salaried
                employee contributes the employee share of CPP — 5.95% on pensionable
                earnings up to the Year&apos;s Maximum Pensionable Earnings (YMPE)
                <CRACite id={1} />, with the employer matching that amount. A
                self-employed agent pays both the employee and employer share. For 2025,
                the combined self-employed CPP1 contribution rate is 11.90%
                <CRACite id={1} />, and the maximum total CPP1 contribution at YMPE
                ($71,300) is $8,068.20<CRACite id={1} />.
              </p>

              <p>
                The second additional CPP contribution (CPP2), introduced in 2024, adds
                a further contribution on earnings between YMPE and the Year&apos;s
                Additional Maximum Pensionable Earnings (YAMPE — $81,200 in 2025) at a
                self-employed rate of 8.00%, capped at $792.00 for the year
                <CRACite id={2} />. Combined, the 2025 maximum self-employed CPP
                contribution is $8,860.20<CRACite id={1} /><CRACite id={2} />. The
                full 2025 CPP1 and CPP2 numbers, worked examples at $80K, $120K, and
                $200K, and the deduction-and-credit mechanic that offsets a portion of
                the gross figure are all covered in the dedicated{" "}
                <Link
                  href="/self-employed-cpp-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  self-employed CPP guide for Canadian real estate agents
                </Link>
                .
              </p>

              <h3>Federal and provincial income tax stacks on top</h3>

              <p>
                Self-employed agents pay federal income tax at graduated marginal rates
                that reach 33% on taxable income above $253,414 for 2025
                <CRACite id={7} />. The basic personal amount, which reduces federal
                taxable income at the lowest-bracket rate, is $16,129 for 2025
                <CRACite id={8} />. Provincial income tax is assessed on top, at rates
                that vary by province. The
                verified 2025 brackets and combined marginal rates for the three
                Maritime provinces are published in the{" "}
                <Link
                  href="/real-estate-agent-tax-rates-nb-ns-pei"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  NB, NS, and PEI provincial income tax rates article
                </Link>
                .
              </p>

              <p>
                Commission income arrives unevenly through the year, and income tax is
                worked out on net business income for the whole year. The tax for a
                year therefore depends on deals that have not closed yet, which is why
                the figure shown before year end is an estimate.
              </p>

              {/* ── Section 2: Quarterly Instalments ── */}
              <h2 id="quarterly-instalments">
                Quarterly Tax Instalments: What They Are and How to Calculate Them
              </h2>

              <p>
                {INSTALMENT_REQUIREMENT_RULE}
                <CRACite id={3} />
                <CRACite id={4} />
              </p>

              <h3>Instalment due dates</h3>

              <p>
                The four quarterly instalment due dates for personal income tax are
                <CRACite id={5} />:
              </p>

              <ul>
                {INCOME_TAX_INSTALMENT_DUE_DATES.map((due) => (
                  <li key={due.quarter}><strong>{due.long}</strong></li>
                ))}
              </ul>

              <p>
                See the full{" "}
                <Link
                  href="/real-estate-tax-deadlines-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  2026 Canadian real estate agent tax deadline calendar
                </Link>
                {" "}for every key CRA date this year — T1 filing, HST returns, T4A issuance,
                and RRSP contribution deadlines alongside the instalment schedule.
                The mechanics of HST/GST registration itself — the $30,000
                small-supplier threshold, mandatory vs voluntary registration,
                Input Tax Credits, provincial rates, and filing frequency — are
                covered in the{" "}
                <Link
                  href="/real-estate-agent-hst-registration-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  HST/GST registration guide for Canadian real estate agents
                </Link>
                .
              </p>

              <p>
                {INSTALMENT_INTEREST_RULE}
                <CRACite id={14} /> {INSTALMENT_PENALTY_RULE}
                <CRACite id={14} />
              </p>

              <h3>How to calculate your instalment amounts</h3>

              <p>
                {INSTALMENT_OPTIONS_RULE}
                <CRACite id={6} /> CRA describes each one the same way: how the
                amounts are worked out, and the situation it is best for.
              </p>

              <ul>
                {INSTALMENT_OPTION_LIST.map((option) => (
                  <li key={option.name}>
                    <strong>{option.name}.</strong> {option.how} {option.bestIf}
                    <CRACite id={6} />
                  </li>
                ))}
              </ul>

              <p>
                {INSTALMENT_OPTION_INTEREST_RULE}
                <CRACite id={6} />
              </p>

              <p>
                {INSTALMENT_ENGINE_ESTIMATE} CRA&apos;s wording for each option,
                the interest rules, and the payment channels are covered in the{" "}
                <Link
                  href="/real-estate-agent-tax-instalments-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  quarterly tax instalments guide
                </Link>
                .
              </p>

              <h3>How much of a commission is tax</h3>

              <p>
                The CRA sets income tax by bracket on taxable income for the year
                <CRACite id={7} /> and CPP contributions on net self-employment
                earnings<CRACite id={1} /><CRACite id={2} />. Neither is set as a
                percentage of a commission. {TAX_ENGINE_ESTIMATE.what}{" "}
                {TAX_ENGINE_ESTIMATE.varies}
              </p>

              <TaxEngineEstimateTable />

              <p>
                {TAX_ENGINE_ESTIMATE.perDeal} Inside Agent Runway the same engine
                runs on the agent&apos;s own province, projected income for the
                year, and logged expenses, and the estimate updates as deals close.
              </p>

              {/* ── Section 3: Deductible Expenses ── */}
              <h2 id="deductible-expenses">
                Tax Deductions Canadian Real Estate Agents Commonly Claim
              </h2>

              <p>
                {BUSINESS_EXPENSE_RULE}
                <CRACite id={9} /> A deductible expense lowers net business income,
                which is the figure income tax and CPP are worked out on. The
                categories below are ones real estate agents commonly claim.
              </p>

              <h3>Common deductible expenses for real estate agents</h3>

              <ul>
                <li>
                  <strong>MLS and real estate board fees</strong> — annual membership
                  dues, MLS access fees, and lock-box fees charged by the local board
                  are deductible business expenses<CRACite id={9} />.
                </li>
                <li>
                  <strong>Errors and omissions (E&O) insurance</strong> — professional
                  liability insurance premiums are fully deductible<CRACite id={9} />.
                </li>
                <li>
                  <strong>Professional dues and licensing</strong> — fees paid to RECO
                  (Ontario), RECBC (British Columbia), or the agent&apos;s provincial
                  regulator are deductible<CRACite id={9} />.
                </li>
                <li>
                  <strong>Marketing and advertising</strong> — online advertising spend,
                  social media promotion, print materials, signage, and direct marketing
                  costs are deductible<CRACite id={9} />.
                </li>
                <li>
                  <strong>Vehicle expenses</strong> — the business-use portion of vehicle
                  costs (fuel, insurance, maintenance, lease payments) is deductible. To
                  support the amount, CRA asks for a record of the total kilometres driven
                  and the kilometres driven to earn income<CRACite id={10} />. CRA describes
                  a logbook of each business trip&apos;s date, destination, purpose and
                  kilometres as the best evidence of business use.
                </li>
                <li>
                  <strong>Home office</strong> — where an agent regularly works from a
                  dedicated home workspace, a proportional share of rent or mortgage
                  interest, utilities, and internet may be deductible
                  <CRACite id={11} />. The CRA applies specific rules on what qualifies;
                  an accountant can advise on individual situations.
                </li>
                <li>
                  <strong>Technology and software</strong> — CRM subscriptions, analytics
                  tools, digital signature platforms, and business-related software
                  subscriptions are deductible.
                </li>
                <li>
                  <strong>Continuing education and professional development</strong> —
                  courses, designations, conference registrations, and educational materials
                  directly related to your real estate practice are deductible.
                </li>
                <li>
                  <strong>Referral fees</strong> — referral fees paid to other licensed
                  agents are deductible as a business expense, provided they are properly
                  documented.
                </li>
                <li>
                  <strong>Office supplies and communication</strong> — business phone
                  costs, printing, postage, and office supplies used for your practice
                  are deductible in full or in proportion to business use.
                </li>
              </ul>

              <p>
                For a complete breakdown by CRA category with T2125 line numbers, see our{" "}
                <Link
                  href="/real-estate-agent-business-expenses-canada"
                  className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
                >
                  full guide to deductible business expenses
                </Link>
                . When you&apos;re ready to file, our{" "}
                <Link
                  href="/t2125-guide-real-estate-agents-canada"
                  className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
                >
                  T2125 line-by-line guide
                </Link>
                {" "}walks you through every section.
              </p>

              <h3>Limits on what is deductible</h3>

              <p>
                {PERSONAL_EXPENSE_RULE}
                <CRACite id={9} /> {MEALS_ENTERTAINMENT_RULE}
                <CRACite id={13} /> {CAPITAL_COST_ALLOWANCE_RULE}
                <CRACite id={12} />
              </p>

              <p>
                Agents in PREC-eligible provinces sometimes operate through a
                Personal Real Estate Corporation rather than as sole
                proprietors; the structural mechanics — commission flow, tax
                deferral, and salary versus dividend extraction — are compared
                in the{" "}
                <Link
                  href="/prec-vs-sole-proprietor-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  PREC vs sole proprietor guide
                </Link>
                .
              </p>

              {/* ── Disclaimer callout ── */}
              <div className="not-prose rounded-2xl border border-amber-200 bg-amber-50 p-8 my-10">
                <div className="flex items-start gap-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      Not Tax Advice
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-amber-700">
                      This page surfaces rules published by the CRA and produces
                      planning estimates only. Tax rules change, individual
                      circumstances vary, and the CRA applies its own
                      interpretation to specific situations. Verify with a
                      qualified accountant or tax professional before making any
                      filing or financial decision.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Cheat sheet inline CTA ── */}
              <div className="not-prose my-8">
                <EmailCapture
                  heading="Get the Canadian Realtor Tax Cheat Sheet"
                  subheading="Every 2025 bracket, CPP rate, GST/HST threshold, and deadline on one printable page — CRA-cited. We'll email it to you."
                  ctaLabel="Email me the cheat sheet"
                  source="cheat_sheet_inline_real-estate-agent-tax-planning-canada"
                  variant="light"
                />
              </div>

              {/* ── Section 4: Tax Planning Tools ── */}
              <h2 id="tax-planning-tools">
                Using Agent Runway for Tax Planning
              </h2>

              <p>
                Every deal closed, every expense logged, and every month that
                passes changes the tax estimate for the year. How each
                of those flows through to take-home pay is covered in
                the guide to{" "}
                <Link href="/how-real-estate-agents-calculate-net-income">
                  how real estate agents calculate net income
                </Link>
                . <Link href="/">Agent Runway</Link>{" "}
                keeps that estimate current as deals and expenses are entered.
              </p>

              <h3>Expense tracking by category</h3>

              <p>
                Agent Runway&apos;s expense categories are set up for real estate
                agents. Every expense logged lowers the running net business income
                estimate, and the projected tax figure on the dashboard is worked
                out from that estimate. Whether a given expense is deductible is
                decided by CRA&apos;s rules, not by the category it is logged under.
              </p>

              <h3>Quarterly instalment estimates based on projected income</h3>

              <p>
                Because Agent Runway tracks your GCI, applies your brokerage split and
                expenses, and projects your year-end income using seasonality-aware
                forecasting, it has a current estimate of your annual net business
                income. The tax engine works out the year&apos;s tax from that
                estimate, and the quarterly figure on the dashboard is one quarter
                of it. The figure updates as deals close and expenses are logged.
              </p>

              <h3>Per-deal tax portion (estimate)</h3>

              <p>
                For agents who think deal-by-deal rather than annually, Agent Runway
                displays a per-deal tax-portion estimate: the dollar figure the engine
                estimates as the tax-side share of each commission payment, given the
                current income trajectory. This translates the abstract quarterly
                instalment into an immediate, per-deal figure that fits naturally into
                how commission income actually arrives.
              </p>

              <h3>Full projected tax breakdown</h3>

              <p>
                Agent Runway&apos;s tax engine covers all 13 Canadian provinces and
                territories, applying current federal and provincial rate tables, the
                CPP self-employed contribution schedule, and the Quebec QPP and abatement
                where applicable. The full projected tax breakdown — federal income tax,
                provincial income tax, and CPP or QPP contributions — is displayed
                separately so you can see exactly where your tax obligation comes from,
                not just the total. Effective rate, marginal rate, and the quarterly
                instalment derived from those projections are all shown in one view.
              </p>

              <p>
                For a complete overview of how Agent Runway handles income forecasting,
                expense tracking, and financial analytics beyond tax planning, visit the{" "}
                <Link href="/features">features page</Link>. Agents evaluating whether
                a dedicated tool is worth it can also read the{" "}
                <Link href="/real-estate-analytics-vs-spreadsheets">
                  comparison of analytics software vs. spreadsheets
                </Link>
                .
              </p>

            </article>

            {/* Sources */}
            <section
              aria-labelledby="sources"
              className="mt-12 border-t border-slate-200 pt-8"
            >
              <h2
                id="sources"
                className="text-base font-semibold text-slate-800"
              >
                Sources
              </h2>
              <p className="mt-2 text-xs text-slate-500">
                Every quantitative or mechanical claim in this article is backed
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
            </section>

            {/* Bottom disclaimer */}
            <p className="mt-12 text-center text-xs leading-relaxed text-slate-400">
              This article is for general information only and is not financial, tax, or professional
              advice. Numbers shown are estimates based on rules published by the CRA. Tax laws change
              frequently and rates vary by province. Verify with a qualified accountant or tax
              professional before making any filing or financial decision. Agent Runway assumes no
              liability for tax filing outcomes.{" "}
              <a href="/terms" className="underline underline-offset-2 hover:text-slate-600">
                Terms of Service
              </a>.
            </p>

          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              See your estimated quarterly instalments in real time.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway estimates your projected federal tax, provincial tax, and CPP
              obligations automatically — and surfaces the estimated tax portion of
              every deal. Built for Canadian real estate agents.
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
                href="/about"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Read the Founder Story
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              Want a quick projection first?{" "}
              <Link
                href="/tools/realtor-tax-estimator"
                className="font-semibold text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                Try the free Canadian Realtor Tax Estimator →
              </Link>
            </p>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <MarketingFooter />
    </div>
  );
}
