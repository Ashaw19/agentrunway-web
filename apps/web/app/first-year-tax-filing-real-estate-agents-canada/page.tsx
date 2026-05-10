import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "First-Year Tax Filing for Newly-Licensed Canadian Real Estate Agents (2026) — The CRA Sequence From Licence Day to First T1 Filing, T2125 Mechanics, the $30,000 HST Threshold, and the First-Year Mistakes That Compound",
  description:
    "A first-year tax guide for newly-licensed Canadian real estate agents — the published CRA sequence from licence day to first T1 filing, why agents are self-employed (T2125, not T4), how to register a business number, the two $30,000 HST tests, T2125 line-by-line for year one, the June 15 filing extension that does not extend the April 30 payment deadline, the year-one mistakes that compound (commingling, missing logbooks, late HST registration), and the role of an accountant. CRA-cited.",
  keywords: [
    "first year tax filing real estate agent canada",
    "new realtor taxes canada",
    "newly licensed real estate agent tax canada",
    "real estate agent first year self employed",
    "t2125 first year realtor",
    "new agent hst registration canada",
    "first year realtor tax mistakes",
    "june 15 self employed deadline canada",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/first-year-tax-filing-real-estate-agents-canada",
    title:
      "First-Year Tax Filing for Newly-Licensed Canadian Real Estate Agents (2026)",
    description:
      "Newly-licensed Canadian real estate agents: the published CRA sequence from licence day to first T1 filing — T2125 mechanics, the $30,000 HST threshold, the June 15 filing extension that does not extend April 30 payment, and the year-one mistakes that compound. CRA-cited.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/first-year-tax-filing-real-estate-agents-canada",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "First-Year Tax Filing for Newly-Licensed Canadian Real Estate Agents (2026) — The CRA Sequence From Licence Day to First T1 Filing, T2125 Mechanics, the $30,000 HST Threshold, and the First-Year Mistakes That Compound",
  description:
    "A first-year tax guide for newly-licensed Canadian real estate agents — the published CRA sequence from licence day to first T1 filing, why agents are self-employed (T2125, not T4), how to register a business number, the two $30,000 HST tests, T2125 line-by-line for year one, the June 15 filing extension that does not extend the April 30 payment deadline, the year-one mistakes that compound (commingling, missing logbooks, late HST registration), and the role of an accountant. CRA-cited.",
  url: "/first-year-tax-filing-real-estate-agents-canada",
  datePublished: "2026-05-09",
  dateModified: "2026-05-10",
});

// ─── CRA primary sources (audit registry) ─────────────────────────────────────
//
// Every numeric or mechanical claim in this article is backed by one of the
// URLs below. Inline citations are rendered via <CRACite id={n} />. URLs were
// hand-verified live on 2026-05-10.

const CRA_SOURCES = [
  {
    id: 1,
    label:
      "CRA — T4002 Self-employed Business, Professional, Commission, Farming, and Fishing Income (the canonical T2125 guide)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002.html",
  },
  {
    id: 2,
    label:
      "CRA — Form T2125 Statement of Business or Professional Activities",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html",
  },
  {
    id: 3,
    label:
      "CRA — Due dates and payment dates (personal income tax) — April 30 payment, June 15 self-employed filing extension, interest from May 1",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/important-dates-individuals.html",
  },
  {
    id: 4,
    label:
      "CRA — When to register for and start charging the GST/HST ($30,000 small-supplier threshold, single-quarter and four-consecutive-quarter tests, effective registration dates)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html",
  },
  {
    id: 5,
    label:
      "CRA — RC4022 General Information for GST/HST Registrants (registration mechanics, ITCs, filing periods)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html",
  },
  {
    id: 6,
    label:
      "CRA — How to register for a business number or CRA program accounts",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/registering-your-business/register.html",
  },
  {
    id: 7,
    label:
      "CRA — Keeping records (six-year retention for self-employed income and expense records)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/keeping-records.html",
  },
  {
    id: 8,
    label:
      "CRA — Motor vehicle expenses and the requirement to keep a logbook (full and simplified)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/motor-vehicle-expenses/motor-vehicle-records.html",
  },
  {
    id: 9,
    label:
      "CRA — Pay (or remit) instalments — the $3,000 net-tax-owing threshold and the no-prior-year baseline rule for new self-employed filers",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments.html",
  },
  {
    id: 10,
    label:
      "CRA — Canada Pension Plan contribution rates and base/enhanced contribution mechanic for self-employed individuals",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html",
  },
  {
    id: 11,
    label:
      "CRA — Lines 13499 to 14300 Self-employment income (T1 reporting lines for gross and net business income flowed from T2125, including Line 13500)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/self-employment-income-lines-13499-14299-gross-income-lines-13500-14300-net-income.html",
  },
  {
    id: 12,
    label:
      "CRA — Late-filing penalty (5% of balance owing plus 1% per full month late, up to 12 months; higher rate for repeat late filers)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/interest-penalties/late-filing-penalty.html",
  },
  {
    id: 13,
    label:
      "CRA — Employee or self-employed? (the four-factor test that determines self-employment status, RC4110)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4110.html",
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

// ─── TOC ──────────────────────────────────────────────────────────────────────

const TOC = [
  { href: "#self-employed", label: "The first thing to understand: you are self-employed, not an employee" },
  { href: "#sequence", label: "The first-year sequence — licence day to first T1 filing" },
  { href: "#bn-registration", label: "Business number registration with CRA" },
  { href: "#hst-threshold", label: "The $30,000 HST threshold — two tests, not one" },
  { href: "#t2125-year-one", label: "T2125 in year one — line by line" },
  { href: "#deadlines", label: "April 30, June 15, and the interest-from-May-1 mechanic" },
  { href: "#cpp", label: "Self-employed CPP — the part most new agents miss" },
  { href: "#instalments", label: "Tax instalments — usually not in year one, almost certainly in year two" },
  { href: "#estimator", label: "The save-for-taxes mechanic and the AR estimator" },
  { href: "#deductions", label: "First-year deductions checklist" },
  { href: "#mistakes", label: "Five first-year mistakes that compound" },
  { href: "#accountant", label: "The accountant question" },
  { href: "#agent-runway", label: "How Agent Runway supports first-year agents" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FirstYearTaxFilingRealEstateAgentsCanadaPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_ARTICLE) }}
      />

      <MarketingNav />

      <main>
        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <Compass className="h-3.5 w-3.5" />
              Guide for Newly-Licensed Canadian Real Estate Agents
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              First-Year Tax Filing for Newly-Licensed Canadian Real Estate Agents (2026)
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Most new agents come from a T4 employment background where
              tax withholding, CPP, and EI are deducted at source by an
              employer and the year-end picture is largely settled before
              April. Real estate is structurally different. A licensed
              Canadian agent paid through their brokerage as commission
              income is, in CRA&apos;s framework, self-employed — reporting
              business income on Form T2125, paying both halves of CPP, and
              owing a lump sum at filing rather than receiving a refund of
              over-withheld tax. This article walks the published CRA
              sequence from licence day to first T1 filing, with every
              mechanical step cited.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              16 min read · CRA-cited · Updated 2026-05-10
            </p>
          </div>
        </section>

        {/* ── Article body ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* Top disclaimer */}
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs leading-relaxed text-amber-700">
                <strong className="text-amber-800">General information only — not tax advice.</strong>{" "}
                This article describes published rules from the Canada
                Revenue Agency. The mechanics that apply to any specific
                agent depend on their licensing province, brokerage
                arrangement, expense profile, and personal circumstances.
                Always verify current rules against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA&apos;s T4002 guide
                </a>{" "}
                and consult a qualified accountant before filing your first
                T1 return as a self-employed agent.{" "}
                <a href="/terms" className="underline underline-offset-2 hover:text-amber-900">
                  Terms of Service
                </a>.
              </p>
            </div>

            {/* TOC */}
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

              {/* ── Section 1 ── */}
              <h2 id="self-employed">The first thing to understand: you are self-employed, not an employee</h2>

              <p>
                A licensed Canadian real estate agent is, in nearly every
                normal arrangement, a self-employed independent contractor
                paid by their brokerage on commission. The CRA framework
                that applies is the self-employed framework — Form T2125
                (Statement of Business or Professional Activities), Line
                13500 of the T1 return, both halves of the Canada Pension
                Plan contribution, and GST/HST registration once the
                relevant threshold is crossed<CRACite id={1} />
                <CRACite id={2} /><CRACite id={11} />.
              </p>

              <p>
                The distinction matters because a substantial fraction of
                new agents arrive from T4 employment — salaried roles where
                income tax, CPP, and EI are deducted at source on every
                paycheque, the employer files a T4 in February, and the
                only year-end action is filing a T1 that often produces a
                small refund. The self-employed picture is the inverse.
                Nothing is withheld during the year. Commissions land in
                the agent&apos;s bank account at the gross-after-split
                level. The full federal-plus-provincial tax liability,
                both halves of CPP, and any HST collected accumulate as
                obligations that come due at the first T1 filing — and
                that is where the year-one shock typically lands.
              </p>

              <p>
                CRA publishes a four-factor test (control, ownership of
                tools, chance of profit and risk of loss, integration into
                the payer&apos;s business) that determines self-employment
                status<CRACite id={13} />. Standard real estate agency
                arrangements — where the agent works under a brokerage
                licence, sets their own hours, pays their own marketing,
                and earns commission from their own client work — almost
                always satisfy the self-employment test. A few brokerages
                in unusual arrangements may treat licensed staff as
                employees on T4; for the vast majority of working agents
                in Canada, the T2125 framework applies.
              </p>

              <p>
                A note on the Personal Real Estate Corporation (PREC). In
                provinces where PRECs are permitted, an agent can elect to
                operate through their own corporation rather than as a
                sole proprietor. PREC mechanics introduce corporate tax,
                separate registrations, and a meaningfully different
                framework that goes well beyond first-year filing for a
                newly-licensed agent. Year one as a sole proprietor is
                the typical starting point; a PREC decision usually
                follows after revenue stabilises. For the structural
                comparison, see the{" "}
                <Link
                  href="/prec-vs-sole-proprietor-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  PREC vs sole proprietor guide for Canadian real estate agents
                </Link>.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="sequence">The first-year sequence — licence day to first T1 filing</h2>

              <p>
                The published CRA mechanic for a newly-licensed agent
                unfolds in chronological steps. The dates are the
                published statutory ones; the order is the practical one.
              </p>

              <h3>Day 1 — licence issued</h3>

              <p>
                On the day a provincial real estate council issues a
                licence and the agent is registered with a brokerage,
                three records-keeping mechanics apply immediately
                <CRACite id={7} />:
              </p>

              <ul>
                <li>
                  <strong>Receipts:</strong> CRA requires self-employed
                  individuals to keep records of all business income and
                  expenses for at least six years from the end of the
                  last tax year they relate to<CRACite id={7} />. That
                  six-year clock starts on the day the first business
                  expense is incurred, which is often well before the
                  first commission is earned (licence fees, board dues,
                  initial marketing, brokerage onboarding costs).
                </li>
                <li>
                  <strong>Mileage logbook:</strong> CRA states that to
                  claim motor-vehicle expenses, the registrant maintains
                  a logbook recording the date, destination, purpose, and
                  kilometres of each business trip<CRACite id={8} />.
                  The logbook is contemporaneous — reconstructing it from
                  memory in March of the following year is the most
                  common audit-vulnerable position for new agents. For
                  the full vehicle mechanic (logbook, the simplified
                  three-month sample rule, Class 10.1 ceiling, lease
                  caps), see the{" "}
                  <Link
                    href="/vehicle-expenses-real-estate-agents-canada"
                    className="font-semibold text-blue-600 underline underline-offset-2"
                  >
                    vehicle expenses guide for Canadian real estate agents
                  </Link>.
                </li>
                <li>
                  <strong>A separate business bank account:</strong> not
                  legally required for sole proprietors, but the
                  practical mechanism that keeps records of business
                  versus personal money distinct. CRA&apos;s
                  records-retention rule applies to business records;
                  reconstructing a year of commingled personal-and-
                  business transactions on a single chequing account in
                  March is materially harder than separating from day
                  one<CRACite id={7} />.
                </li>
              </ul>

              <h3>Within the first 30–60 days — business number with CRA</h3>

              <p>
                A self-employed agent is not required to register a
                business number (BN) with CRA before earning income, but
                a BN is required for any of the program-account
                registrations that follow (GST/HST, payroll, import/
                export). Most new agents register a BN in the first 30–60
                days simply because the first GST/HST decision arrives
                quickly once commissions begin to flow<CRACite id={6} />.
              </p>

              <p>
                Registration is free, online, and takes minutes. The CRA
                portal asks for the agent&apos;s name, the business name
                (typically &quot;[Agent Name], real estate agent&quot;),
                the operating address, and the fiscal year-end (default
                December 31 for individuals). The output is a 9-digit
                business number that becomes the root identifier for all
                CRA program accounts<CRACite id={6} />.
              </p>

              <h3>First commission — the HST trigger begins</h3>

              <p>
                The day the first commission cheque clears, the four-
                quarter rolling-revenue calculation that governs HST
                registration begins to accumulate<CRACite id={4} />. This
                is covered in detail in the next section. The short
                version: the agent does not have to register on day one,
                but the calculation that determines when registration
                becomes mandatory is now running.
              </p>

              <h3>Through the year — running totals</h3>

              <p>
                Through the first calendar year, the agent accumulates
                commission income (with HST collected after registration),
                deductible business expenses, vehicle kilometres, home-
                office records, and an ongoing total of revenue against
                the $30,000 small-supplier threshold. Each of those
                streams will eventually flow onto the T2125 at year-end.
              </p>

              <h3>Fiscal year-end — December 31</h3>

              <p>
                For self-employed individuals, the standard fiscal year-
                end is December 31, aligning with the T1 calendar
                year<CRACite id={1} />. This is when the year&apos;s
                income and expense compilation begins. A small set of
                self-employed individuals elect a non-calendar fiscal
                year under section 249.1 of the Income Tax Act; the
                election is uncommon for first-year real estate agents
                and outside this article&apos;s scope.
              </p>

              <h3>April 30 of the following year — payment deadline</h3>

              <p>
                CRA states that any balance owing on a personal income
                tax return is due April 30 of the year following the tax
                year, regardless of self-employment status
                <CRACite id={3} />. Interest on unpaid tax begins
                accruing May 1<CRACite id={3} /><CRACite id={12} />.
              </p>

              <h3>June 15 of the following year — self-employed filing extension</h3>

              <p>
                CRA grants self-employed individuals (and their spouses
                or common-law partners) a filing extension to June 15 —
                but the extension is on filing only, not on payment
                <CRACite id={3} />. A self-employed agent who files June
                15 with a balance owing has interest accruing daily from
                May 1 onward<CRACite id={3} /><CRACite id={12} />. The
                practical implication: agents with a confidently-known
                balance owing often still pay by April 30 and file by
                June 15, separating the two deadlines.
              </p>

              {/* ── Section 3 ── */}
              <h2 id="bn-registration">Business number registration with CRA</h2>

              <p>
                Registering a business number with CRA produces a 9-digit
                identifier that all subsequent CRA program accounts
                attach to with a 6-character suffix — RT0001 for the
                first GST/HST account, RP0001 for payroll, RC0001 for
                corporate income tax, and so on<CRACite id={6} />. For
                a self-employed sole-proprietor real estate agent, the
                relevant accounts in year one are typically the BN itself
                plus GST/HST (RT0001) once registration is required.
              </p>

              <p>
                The mechanics<CRACite id={6} />:
              </p>

              <ul>
                <li>
                  Register through the CRA Business Registration Online
                  portal, a paper RC1 form, or by telephone with CRA.
                  The online portal is the fastest of the three.
                </li>
                <li>
                  No fee. The BN itself is free. Provincial business-name
                  registration (e.g., a sole-prop trade name) is a
                  separate provincial registration with its own fee, and
                  is required in some provinces if the agent operates
                  under a name other than their legal name.
                </li>
                <li>
                  The BN is permanent for the individual. If the same
                  individual later incorporates a PREC, the corporation
                  receives its own separate BN; the original sole-prop
                  BN remains on the individual.
                </li>
              </ul>

              <p>
                Registering a BN is not the same as registering for
                GST/HST. The BN is the root; the GST/HST account
                (program code RT) is added on top of the BN once
                registration becomes required (or is voluntarily
                elected). The two registrations can be done together at
                the same time, or the BN can be opened first and the
                GST/HST account added later when the threshold is
                crossed.
              </p>

              {/* ── Section 4 ── */}
              <h2 id="hst-threshold">The $30,000 HST threshold — two tests, not one</h2>

              <p>
                The mechanic that decides when a real estate agent has
                to register for GST/HST is published in CRA&apos;s
                small-supplier rules<CRACite id={4} /><CRACite id={5} />.
                Two distinct tests apply, and they have different
                effective registration dates.
              </p>

              <h3>Test 1 — single calendar quarter</h3>

              <p>
                If total taxable supplies (commission income, including
                associated supplies) in a single calendar quarter exceed
                $30,000, the agent ceases to be a small supplier the
                moment of the supply that crossed the threshold
                <CRACite id={4} />. The effective registration date is
                no later than the day of that supply. Registration is
                required to be in place on that date and HST is required
                to be collected on every taxable supply from that date
                forward.
                Any commission earned before crossing the threshold in
                the quarter is not subject to HST collection.
              </p>

              <p>
                For a real estate agent, a single calendar quarter
                exceeding $30,000 is the scenario of one or two large
                deals closing close together — for example, two listings
                at $750,000 each closing in March that produce
                $20,000–$30,000 of commission per side. Crossing $30,000
                in a single quarter is uncommon for a brand-new agent in
                their first weeks, but standard for agents in a hot
                market or with an established sphere of influence.
              </p>

              <h3>Test 2 — four consecutive calendar quarters</h3>

              <p>
                If total taxable supplies over the previous four
                consecutive calendar quarters exceed $30,000, the agent
                ceases to be a small supplier at the end of the month
                following the quarter in which the cumulative threshold
                was crossed<CRACite id={4} />. The effective registration
                date is no later than the first day of the second month
                after that quarter.
              </p>

              <p>
                Worked example. An agent earns $7,000 in Q1, $8,000 in
                Q2, $9,000 in Q3, and $7,500 in Q4 — a cumulative
                $31,500 over the four quarters. The threshold is
                crossed in Q4 (the quarter the cumulative figure
                exceeds $30,000). The small-supplier status ends at
                the end of January (the month following Q4). The
                effective registration date is no later than February
                1<CRACite id={4} />. The agent collects HST on all
                taxable supplies from February 1 forward and files the
                first GST/HST return at the end of the assigned
                reporting period.
              </p>

              <h3>The taxable-supplies definition for an agent</h3>

              <p>
                The $30,000 figure is the gross taxable supplies — for a
                real estate agent, this is the gross commission income
                billed to the brokerage (the agent&apos;s contractual
                supply), before the brokerage&apos;s split and other
                deductions<CRACite id={5} />. The split paid to the
                brokerage is the agent&apos;s own deductible expense on
                T2125; it is not a reduction of the gross taxable supply
                for HST threshold purposes. This is the most common
                misunderstanding in informal HST guidance — the
                threshold is gross, not net of split.
              </p>

              <h3>The backdating mechanic — and why missing the threshold matters</h3>

              <p>
                If an agent crosses the threshold but does not register
                on time, CRA can backdate the registration to the date
                that registration was required to be effective
                <CRACite id={4} />
                <CRACite id={5} />. From that backdated date, the agent
                owes the HST on commissions earned — even though the
                agent did not actually charge HST to the brokerage at
                the time. The agent typically cannot retroactively bill
                clients or the brokerage for HST that was never
                collected, so the unremitted HST comes out of the
                agent&apos;s own funds, plus interest. This is the
                published consequence; the practical effect on an agent
                whose first big quarter quietly crossed $30,000 is a
                meaningful surprise at filing.
              </p>

              <p>
                For the full HST mechanic — voluntary registration
                trade-offs, ITC eligibility, filing frequencies, and the
                Quick Method election — see the{" "}
                <Link
                  href="/real-estate-agent-hst-registration-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  HST/GST registration guide for Canadian real estate agents
                </Link>{" "}
                and the{" "}
                <Link
                  href="/gst-hst-quick-method-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  GST/HST Quick Method guide
                </Link>.
              </p>

              {/* ── Section 5 ── */}
              <h2 id="t2125-year-one">T2125 in year one — line by line</h2>

              <p>
                T2125 is the CRA form on which a self-employed
                individual reports business or professional activities
                <CRACite id={2} />. Net business income from T2125 flows
                to Line 13500 of the T1 return<CRACite id={11} />. For a
                first-year real estate agent, the form&apos;s structure
                is the same as for any sole proprietor; the line-by-line
                content is shaped by the typical agent expense profile.
              </p>

              <p>
                The income side of T2125 begins with gross sales,
                commissions, or fees<CRACite id={2} />. For an agent,
                this is the gross commission income — the full
                commission billed to the brokerage on each transaction,
                before the brokerage split. The gross figure is what is
                reported in Part 3 of T2125. The brokerage&apos;s split
                is a deductible expense reported separately, not a
                reduction of gross commission. This bookkeeping
                distinction matters because the gross figure is what
                ties to the HST threshold (above), the GCI metric used
                by the brokerage and MLS systems, and any future
                business-credit application that asks for gross
                commission income.
              </p>

              <p>
                The expenses side of T2125 lists categories aligned to
                the agent&apos;s typical year-one spend
                <CRACite id={1} />:
              </p>

              <ul>
                <li>
                  <strong>Brokerage split (other amounts deductible
                  from gross income, Line 9270 or commission expense):
                  </strong> the dollar value of every split paid to
                  the brokerage in the year. For a 70/30 split, this
                  is 30% of the gross commission flowing in. This is
                  typically the largest single deduction on a year-
                  one agent&apos;s T2125.
                </li>
                <li>
                  <strong>Licensing, board dues, MLS fees, errors-
                  and-omissions (E&amp;O) insurance:</strong> reported
                  under licences, professional fees, and insurance
                  lines as appropriate<CRACite id={1} />. These are
                  typically the second-largest year-one expense
                  cluster.
                </li>
                <li>
                  <strong>Vehicle expenses (Line 9281, motor vehicle
                  expenses):</strong> business-use percentage of fuel,
                  insurance, repairs, lease or interest, parking, plus
                  capital cost allowance for owned vehicles. For the
                  full mechanic — logbook requirements, Class 10.1
                  ceiling, lease and interest caps, and the 90%
                  GST/HST ITC threshold — see the{" "}
                  <Link
                    href="/vehicle-expenses-real-estate-agents-canada"
                    className="font-semibold text-blue-600 underline underline-offset-2"
                  >
                    vehicle expenses guide for Canadian real estate agents
                  </Link>.
                </li>
                <li>
                  <strong>Business-use-of-home (Line 9945):</strong>
                  the proportionate share of home utilities, internet,
                  insurance, and (with the principal-residence CCA
                  caveat) other home costs. Subject to the loss-limit
                  carryforward and the two qualifying tests. For the
                  full mechanic, see the{" "}
                  <Link
                    href="/business-use-of-home-real-estate-agents-canada"
                    className="font-semibold text-blue-600 underline underline-offset-2"
                  >
                    business-use-of-home guide for Canadian real estate agents
                  </Link>.
                </li>
                <li>
                  <strong>Advertising (Line 8521):</strong> photography,
                  signage, digital ads, brochures, and other listing-
                  and-personal marketing<CRACite id={1} />. A common
                  large year-one line for agents building a sphere.
                </li>
                <li>
                  <strong>Office expenses, supplies, telephone:
                  </strong> small-line operating costs. Reported under
                  the relevant T2125 expense line.
                </li>
                <li>
                  <strong>Professional development, courses, conference
                  fees:</strong> reported under professional fees or
                  business-tax line as appropriate. Pre-licence courses
                  (i.e., the licensing course taken before income
                  begins) are typically not deductible on T2125 because
                  they are pre-business; in-career continuing-education
                  courses generally are<CRACite id={1} />.
                </li>
                <li>
                  <strong>Technology, software, subscriptions:
                  </strong> CRM, e-signature, transaction management,
                  database tools — reported under office expenses or
                  supplies as appropriate.
                </li>
                <li>
                  <strong>Meals and entertainment (Line 8523):</strong>
                  CRA limits the deduction to 50% of the lesser of the
                  amount paid and a reasonable amount<CRACite id={1} />.
                  Subject to the published rules on which meals
                  qualify.
                </li>
              </ul>

              <p>
                The result of T2125 — gross income less allowable
                expenses, with adjustments for business-use-of-home and
                CCA — is net business income, which flows to Line 13500
                of the T1<CRACite id={11} />. That figure becomes the
                base for federal and provincial income tax calculations
                and for the self-employed CPP contribution (next
                section). For the line-by-line walkthrough beyond the
                year-one summary above, see the{" "}
                <Link
                  href="/t2125-guide-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  T2125 guide for Canadian real estate agents
                </Link>{" "}
                and the broader{" "}
                <Link
                  href="/real-estate-agent-business-expenses-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  business expenses guide
                </Link>.
              </p>

              {/* ── Section 6 ── */}
              <h2 id="deadlines">April 30, June 15, and the interest-from-May-1 mechanic</h2>

              <p>
                The two-deadline structure is the single most-misread
                item in informal first-year guidance for self-employed
                Canadian agents. The published mechanic
                <CRACite id={3} /><CRACite id={12} />:
              </p>

              <ul>
                <li>
                  <strong>April 30:</strong> the date by which any
                  balance owing on the personal income tax return is
                  due. Interest on unpaid amounts begins accruing May
                  1<CRACite id={3} /><CRACite id={12} />. This deadline
                  applies to every individual filer, self-employed or
                  not.
                </li>
                <li>
                  <strong>June 15:</strong> the filing deadline for
                  self-employed individuals and their spouses or
                  common-law partners<CRACite id={3} />. The extension
                  is on filing the return only — not on paying the
                  balance owing. CRA states that interest on any
                  amount owing accrues from May 1 regardless of when
                  the return is filed<CRACite id={3} />
                  <CRACite id={12} />.
                </li>
                <li>
                  <strong>Late-filing penalty:</strong> if the return
                  is filed after June 15 with a balance owing, CRA
                  imposes a late-filing penalty of 5% of the balance
                  owing plus 1% per full month late, up to 12 months
                  <CRACite id={12} />. Repeat late-filing within
                  certain conditions can trigger higher penalties
                  <CRACite id={12} />.
                </li>
                <li>
                  <strong>GST/HST returns:</strong> filed separately
                  from the T1 on the agent&apos;s assigned reporting
                  period (typically annual for new registrants, with
                  a December 31 fiscal year-end producing a March 31
                  GST/HST filing deadline if no instalments are
                  required, or a June 15 deadline for self-employed
                  individuals with calendar-year HST reporting under
                  certain elections)<CRACite id={5} />. Filing
                  frequency depends on revenue; the published
                  mechanic for each frequency is in CRA&apos;s
                  RC4022<CRACite id={5} />.
                </li>
              </ul>

              <p>
                For the full deadline picture, including instalment
                quarters and provincial overlays, see the{" "}
                <Link
                  href="/real-estate-tax-deadlines-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  real estate tax deadlines guide for Canada
                </Link>.
              </p>

              {/* ── Cheat sheet inline CTA ── */}
              <div className="not-prose my-8">
                <EmailCapture
                  heading="Get the Canadian Realtor Tax Cheat Sheet"
                  subheading="Every 2025 bracket, CPP rate, GST/HST threshold, and deadline on one printable page — CRA-cited. We'll email it to you."
                  ctaLabel="Email me the cheat sheet"
                  source="cheat_sheet_inline_first-year-tax-filing-real-estate-agents-canada"
                  variant="light"
                />
              </div>

              {/* ── Section 7 ── */}
              <h2 id="cpp">Self-employed CPP — the part most new agents miss</h2>

              <p>
                A self-employed individual contributes to the Canada
                Pension Plan on net business income, but unlike a T4
                employee — for whom the employer matches the
                contribution — the self-employed individual pays both
                halves<CRACite id={10} />. The contribution covers both
                the base CPP (which has been the historical rate) and
                the enhanced CPP introduced beginning 2019, plus the
                second additional CPP (CPP2) on income between the
                first and second earnings ceilings<CRACite id={10} />.
              </p>

              <p>
                The mechanical effect on a year-one agent is a CPP
                liability that was not visible in their previous T4
                employment because the employer half was withheld
                silently. On a typical year-one net business income, the
                self-employed CPP contribution can run several thousand
                dollars — material on a first-year tax bill, and
                material in the year-end &quot;why is my balance owing
                so large&quot; reaction. The contribution is calculated
                on T1 Schedule 8 from the net business income on Line
                13500<CRACite id={10} /><CRACite id={11} />.
              </p>

              <p>
                For the full mechanic — base, first additional, and
                second additional rates by year, the YMPE and YAMPE
                ceilings, and the deduction-versus-credit split of the
                self-employed contribution — see the{" "}
                <Link
                  href="/self-employed-cpp-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  self-employed CPP guide for Canadian real estate agents
                </Link>.
              </p>

              {/* ── Section 8 ── */}
              <h2 id="instalments">Tax instalments — usually not in year one, almost certainly in year two</h2>

              <p>
                CRA states that an individual is required to pay tax by
                instalments if their net tax owing for the current year
                and either of the two previous years exceeds $3,000
                (or $1,800 in Quebec)<CRACite id={9} />. The mechanic
                uses a two-year look-back. A first-year self-employed
                agent has, by definition, no prior-year tax owing as a
                self-employed individual — the previous year was T4
                employment with tax withheld at source. The two-year
                look-back therefore does not produce an instalment
                obligation in year one<CRACite id={9} />.
              </p>

              <p>
                In year two, this changes. The first T1 filing as a
                self-employed agent (filed in April or June of year
                two for year-one income) sets the prior-year tax-owing
                figure. If that figure exceeds $3,000, CRA issues
                instalment reminders for year three, with payments
                generally due March 15, June 15, September 15, and
                December 15<CRACite id={9} />. The published mechanic
                also offers two alternative calculation methods (the
                no-calculation, prior-year, and current-year options)
                that an agent or accountant chooses among
                <CRACite id={9} />.
              </p>

              <p>
                The year-one shape that follows from the no-instalment
                rule: the entire first-year tax obligation — federal,
                provincial, and the self-employed CPP — comes due on a
                single April 30 payment date, with no quarterly
                spreading mechanism. This is the principal reason the
                first-year tax bill is the year that most new agents
                describe as the tax surprise. The estimator-based
                tracking discussed below is the published-rules-aware
                way to see the obligation building through the year.
              </p>

              <p>
                For the full instalment mechanic — calculation methods,
                interest on missed instalments, and the relationship to
                year-end filing — see the{" "}
                <Link
                  href="/real-estate-agent-tax-instalments-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  real estate agent tax instalments guide
                </Link>.
              </p>

              {/* ── Section 9 ── */}
              <h2 id="estimator">The save-for-taxes mechanic and the AR estimator</h2>

              <p>
                The published rules above produce, for any given agent,
                a calculable year-end tax obligation as a function of
                gross commission income, deductible expenses, the
                province of residence, and CPP. The free{" "}
                <Link
                  href="/tools/realtor-tax-estimator"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian Realtor Tax Estimator
                </Link>{" "}
                runs that calculation publicly with current-year CRA
                rates — federal brackets, provincial brackets for all
                13 provinces and territories, the self-employed CPP
                base and enhanced contributions, and the GST/HST
                collection mechanic.
              </p>

              <p>
                For a first-year agent, the estimator&apos;s use is
                straightforward: enter gross commission income earned
                year-to-date, deductible expenses, and the province,
                and the estimator indicates the federal-plus-provincial
                tax plus self-employed CPP that the rules produce. The
                estimator is not a tax filing — it is a published-rules
                model that produces a number an agent can use as a
                planning anchor through the year, rather than waiting
                until February of the following year for the first
                concrete look at the obligation.
              </p>

              <p>
                The published-rules framing matters for the verbs an
                agent uses around it. The estimator indicates a number;
                what an agent does with that number is the agent&apos;s
                decision, made with their accountant. For the more
                detailed mechanic of using the estimator&apos;s number
                to anchor an in-year reserve, including the rate-of-
                income-set-against-tax that current CRA brackets imply,
                see the{" "}
                <Link
                  href="/how-much-should-real-estate-agents-save-for-taxes-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  how much to save for taxes guide
                </Link>.
              </p>

              {/* ── Section 10 ── */}
              <h2 id="deductions">First-year deductions checklist</h2>

              <p>
                The deductions a year-one agent typically encounters,
                with link-throughs to the full mechanic for each
                <CRACite id={1} />:
              </p>

              <ul>
                <li>
                  <strong>Brokerage split:</strong> the largest single
                  deduction; reported as a commission expense on T2125.
                </li>
                <li>
                  <strong>Licensing, board, MLS, E&amp;O insurance:
                  </strong> reported under licences, professional fees,
                  and insurance.
                </li>
                <li>
                  <strong>Vehicle expenses:</strong>{" "}
                  <Link
                    href="/vehicle-expenses-real-estate-agents-canada"
                    className="font-semibold text-blue-600 underline underline-offset-2"
                  >
                    full mechanic in the vehicle expenses guide
                  </Link>{" "}
                  — logbook, Class 10.1 ceiling, lease and interest
                  caps, the 90% GST/HST ITC threshold for sole
                  proprietors.
                </li>
                <li>
                  <strong>Business-use-of-home:</strong>{" "}
                  <Link
                    href="/business-use-of-home-real-estate-agents-canada"
                    className="font-semibold text-blue-600 underline underline-offset-2"
                  >
                    full mechanic in the business-use-of-home guide
                  </Link>{" "}
                  — Line 9945, the two qualifying tests, the loss-
                  limit carryforward, the principal-residence CCA
                  caveat.
                </li>
                <li>
                  <strong>Advertising and marketing:</strong>
                  photography, signage, digital ads, brochures,
                  branded promotional items.
                </li>
                <li>
                  <strong>Professional development:</strong> in-
                  career continuing-education courses, conference
                  registrations, designation fees. Pre-licence courses
                  are typically not deductible.
                </li>
                <li>
                  <strong>Technology and software:</strong> CRM,
                  e-signature, transaction management, virtual tour
                  software, subscriptions to industry data services.
                </li>
                <li>
                  <strong>Office expenses and supplies:</strong>
                  business-side stationery, printing, signage
                  consumables, lockboxes (subject to capital-versus-
                  operating classification for higher-cost items).
                </li>
                <li>
                  <strong>Telephone and internet:</strong>
                  business-use portion of mobile and home internet
                  (the home-internet portion typically claimed via
                  business-use-of-home or as a stand-alone telephone
                  expense, depending on the configuration).
                </li>
                <li>
                  <strong>Meals and entertainment:</strong> 50% of the
                  lesser of the amount paid and a reasonable amount,
                  per CRA&apos;s published rule<CRACite id={1} />.
                </li>
                <li>
                  <strong>Bank fees and interest:</strong> business-
                  account fees and interest on business-use loans
                  (not the principal portion of mortgage payments,
                  which is not deductible).
                </li>
              </ul>

              <p>
                For the broader deductible-versus-non-deductible map —
                including the published items that look deductible but
                are not (commuting, principal-residence mortgage
                principal, life insurance premiums, fines and
                penalties) — see the{" "}
                <Link
                  href="/real-estate-agent-business-expenses-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  real estate agent business expenses guide
                </Link>.
              </p>

              {/* ── Section 11 ── */}
              <h2 id="mistakes">Five first-year mistakes that compound</h2>

              <p>
                The structural mistakes that surface at first-T1-filing
                are the ones whose consequences extend beyond year one.
                Each item below describes a published-rules consequence,
                not a recommendation about behaviour.
              </p>

              <h3>1. Commingling personal and business money on a single bank account</h3>

              <p>
                CRA states that records of business income and expenses
                are required to be kept and are subject to audit
                <CRACite id={7} />. A single chequing account with
                personal grocery shops, restaurant tabs, mortgage
                payments, and brokerage commissions all flowing through
                the same line items produces a record-keeping situation
                in which substantiating any individual deduction
                requires reconstructing context that is not on the
                statement. The published consequence on audit is that
                deductions without adequate substantiation can be
                disallowed; CRA does not have to reconstruct the
                agent&apos;s mental model of the year. A separate
                business chequing account from licence day forward is
                the structural mechanism that prevents the
                substantiation problem from arising.
              </p>

              <h3>2. Reconstructing a mileage logbook from memory in March</h3>

              <p>
                CRA states that a motor-vehicle logbook is required to
                claim vehicle expenses, and CRA&apos;s published
                guidance describes the logbook as contemporaneous —
                recording the date, destination, purpose, and
                kilometres of each business trip at the time of the
                trip<CRACite id={8} />. A logbook reconstructed from
                calendar entries and gut-feel kilometre estimates 14
                months later is materially weaker substantiation on
                audit than a contemporaneous record. The published
                simplified mechanic — a full year-one logbook combined
                with a representative three-month sample in subsequent
                years — depends on having year one&apos;s logbook in
                place to begin with<CRACite id={8} />. Year one is the
                year the logbook is most consequential.
              </p>

              <h3>3. Discarding receipts that didn&apos;t feel deductible at the time</h3>

              <p>
                The six-year retention rule applies to all business
                records<CRACite id={7} />. The category an agent
                doesn&apos;t learn until tax time often becomes the
                category of receipts that were quietly discarded in
                March of the year they were incurred. A specific
                example: a meal with a referral source in February
                that wasn&apos;t logged because the agent wasn&apos;t
                yet thinking of meals as a tax category. The 50%
                deduction would have applied; the missing receipt is
                the only obstacle.
              </p>

              <h3>4. Crossing the $30,000 HST threshold without registering</h3>

              <p>
                Covered in section 4. The published consequence is
                CRA&apos;s ability to backdate registration to the
                date the published rule places the effective
                registration, and to assess HST on commissions earned
                from that date even though the agent did not actually
                charge HST to the brokerage at the time<CRACite id={4} />
                <CRACite id={5} />.
                The unremitted HST comes out of the agent&apos;s own
                funds because the agent typically cannot retroactively
                bill the brokerage for HST that was never collected.
              </p>

              <h3>5. Treating gross commissions as taxable income (not netting splits)</h3>

              <p>
                The technically-correct T2125 mechanic is to report
                gross commission income on the income side and the
                brokerage split as a deductible expense
                <CRACite id={2} />. This produces the same net business
                income on Line 13500 as netting the split before
                reporting<CRACite id={11} />, but the gross-and-deduct
                approach is what the form&apos;s structure expects.
                The mistake is not a tax-amount error in most cases —
                it is a presentation error that produces a T2125 with
                an income line that doesn&apos;t match the brokerage
                T4A or 1099-equivalent record CRA receives, which can
                trigger a review.
              </p>

              {/* ── Section 12 ── */}
              <h2 id="accountant">The accountant question</h2>

              <p>
                Whether a self-employed agent benefits from engaging an
                accountant in year one is a question that depends on
                the agent&apos;s revenue, the complexity of their
                expense profile, their comfort with CRA forms, and the
                cost of the accountant&apos;s time relative to the
                expected accuracy benefit. The published-rules side of
                that question is mechanical: T2125, the GST/HST
                mechanic, the CPP calculation, and the line flows are
                all publicly documented. The unpublished side is the
                judgment that a tax professional brings — what to claim
                in marginal cases, how to optimise a PREC decision in
                year three, how to position year-one elections for
                year-two outcomes.
              </p>

              <p>
                The rule provides for self-preparation; it also
                provides for engaging a tax professional. Most working
                agents with stabilised commission income engage an
                accountant by year two or three, and many do so in year
                one. The decision is the agent&apos;s. This article
                describes the published mechanics; it does not advocate
                a self-prepared or professional-prepared approach over
                the other.
              </p>

              {/* ── Section 13 ── */}
              <h2 id="agent-runway">How Agent Runway supports first-year agents</h2>

              <p>
                Agent Runway is the business financial layer Canadian
                real estate agents run alongside their CRM. For a
                year-one agent, the platform tracks gross commission
                income (with brokerage split awareness), expense
                capture with HST splitting (so HST collected and HST
                paid are tracked separately on each transaction),
                running progress against the $30,000 small-supplier
                threshold, the federal-plus-provincial-plus-CPP tax
                estimate as the year unfolds, and Flight Crew personas
                that surface published CRA rules in plain language.
                The platform&apos;s output is information against which
                the agent and their accountant make decisions; the
                mechanics surfaced are the same published CRA rules
                this article walks through.
              </p>

              <p>
                For the broader picture of the financial layer, see the
                {" "}
                <Link
                  href="/canadian-real-estate-agent-financial-platform"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian real estate agent financial platform overview
                </Link>. For the underlying tax-rate math by province,
                see the{" "}
                <Link
                  href="/real-estate-agent-tax-rates-nb-ns-pei"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  NB / NS / PEI tax rates guide
                </Link>{" "}
                and the broader{" "}
                <Link
                  href="/real-estate-agent-tax-planning-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian real estate agent tax planning guide
                </Link>.
              </p>

              <p className="text-xs italic">
                Quebec is currently outside the platform&apos;s
                geo-coverage pending Law 25 compliance work and French
                translation. Quebec-licensed agents are referred to
                Revenu Québec&apos;s published guidance and a
                Quebec-licensed accountant. The QST-side mechanics
                differ from the federal HST treatment described in
                this article.
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
                Every quantitative or mechanical claim in this article
                is backed by one of the primary sources below. Hand-
                verified live on 2026-05-10.
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
              This article is for general information and planning
              awareness only — not financial, tax, or professional
              advice. The mechanics that apply to any specific
              newly-licensed agent depend on their licensing province,
              brokerage arrangement, expense profile, and personal
              circumstances. Always verify current rules against
              CRA&apos;s T4002 guide and consult a qualified
              accountant before filing your first T1 return as a
              self-employed agent. Agent Runway assumes no liability
              for tax filing outcomes.{" "}
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
              Year one is when the records mechanic is set. Set it up well.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway tracks commission income, brokerage splits,
              expense capture with HST splitting, and the federal-plus-
              provincial-plus-CPP tax estimate as the year unfolds —
              CRA-aware, surfaced in plain language by the Flight Crew.
              Built for newly-licensed Canadian real estate agents.
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
                href="/tools/realtor-tax-estimator"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Try the Free Tax Estimator
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              Want the full Canadian agent tax picture?{" "}
              <Link
                href="/canadian-real-estate-agent-financial-platform"
                className="font-semibold text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                See the Canadian financial layer →
              </Link>
            </p>
          </div>
        </section>

      </main>

      <MarketingFooter />
    </div>
  );
}
