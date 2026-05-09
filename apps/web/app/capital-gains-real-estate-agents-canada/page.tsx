import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "Capital Gains Tax for Canadian Real Estate Agents Who Invest Personally in Real Estate (2026) — The Flip-vs-Hold Classification, the Principal Residence Exemption, the Anti-Flipping Rule, Section 45 Change-of-Use Elections, CCA Recapture, and the QSBC Lifetime Exemption",
  description:
    "Capital gains tax mechanics for licensed Canadian real estate agents who own personal property — why CRA scrutinises agent transactions more closely, the flip-vs-hold classification (capital gain vs business income), the principal residence exemption and its formula, the anti-flipping rule for properties held under 365 days and its life-event exceptions, section 45(1)/45(2)/45(3) change-of-use elections, CCA recapture on rental property, the lifetime capital gains exemption ($1.25M) for QSBC shares, the current 50% inclusion rate after the March 2025 cancellation of the proposed increase, and Schedule 3 / Line 12700 reporting. CRA-cited.",
  keywords: [
    "capital gains real estate agent canada",
    "realtor capital gains tax canada",
    "real estate agent investment property tax canada",
    "principal residence exemption realtor",
    "anti-flipping rule canada 365 days",
    "section 45 change of use election canada",
    "rental property capital gain realtor",
    "cca recapture rental property",
    "lifetime capital gains exemption qsbc 2026",
    "capital gains inclusion rate 2026 canada",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/capital-gains-real-estate-agents-canada",
    title:
      "Capital Gains Tax for Canadian Real Estate Agents Who Invest Personally in Real Estate (2026)",
    description:
      "Capital gains mechanics for licensed Canadian agents — flip-vs-hold classification, the principal residence exemption, the anti-flipping rule, section 45 change-of-use elections, CCA recapture, the QSBC lifetime exemption ($1.25M), and the current 50% inclusion rate. CRA-cited.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/capital-gains-real-estate-agents-canada",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "Capital Gains Tax for Canadian Real Estate Agents Who Invest Personally in Real Estate (2026) — The Flip-vs-Hold Classification, the Principal Residence Exemption, the Anti-Flipping Rule, Section 45 Change-of-Use Elections, CCA Recapture, and the QSBC Lifetime Exemption",
  description:
    "Capital gains tax mechanics for licensed Canadian real estate agents who own personal property — why CRA scrutinises agent transactions more closely, the flip-vs-hold classification (capital gain vs business income), the principal residence exemption and its formula, the anti-flipping rule for properties held under 365 days and its life-event exceptions, section 45(1)/45(2)/45(3) change-of-use elections, CCA recapture on rental property, the lifetime capital gains exemption ($1.25M) for QSBC shares, the current 50% inclusion rate after the March 2025 cancellation of the proposed increase, and Schedule 3 / Line 12700 reporting. CRA-cited.",
  url: "/capital-gains-real-estate-agents-canada",
  datePublished: "2026-05-09",
  dateModified: "2026-05-09",
});

// ─── CRA primary sources (audit registry) ─────────────────────────────────────
//
// Every numeric or mechanical claim in this article is backed by one of the
// URLs below. Inline citations are rendered via <CRACite id={n} />. URLs were
// hand-verified live on 2026-05-09. The capital gains inclusion rate position
// reflects the Department of Finance announcement of March 21, 2025
// confirming the government does not intend to proceed with the proposed
// increase to two-thirds; the rate remains one-half (50%) for 2026.

const CRA_SOURCES = [
  {
    id: 1,
    label:
      "CRA — Line 12700 Taxable capital gains (the canonical T1 line for capital-gain reporting)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains.html",
  },
  {
    id: 2,
    label:
      "CRA — T4037 Capital Gains 2025 (the canonical guide to capital gains, including the inclusion rate, the flip-vs-business-income tests, and Schedule 3)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4037/capital-gains.html",
  },
  {
    id: 3,
    label:
      "Department of Finance Canada — Update on the deferral of the capital gains inclusion rate change (January 31, 2025)",
    url: "https://www.canada.ca/en/department-finance/news/2025/01/government-of-canada-announces-deferral-in-implementation-of-change-to-capital-gains-inclusion-rate.html",
  },
  {
    id: 4,
    label:
      "CRA — Update on the Canada Revenue Agency's administration of the proposed capital gains taxation changes (the March 21, 2025 confirmation that the proposed increase will not proceed)",
    url: "https://www.canada.ca/en/revenue-agency/news/newsroom/tax-tips/tax-tips-2025/update-cra-administration-proposed-capital-gains-taxation-changes.html",
  },
  {
    id: 5,
    label:
      "CRA — What's new for capital gains (the LCGE limit increase to $1.25 million effective June 25, 2024 and the resumption of indexation in 2026)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains/whats-new-capital-gains.html",
  },
  {
    id: 6,
    label:
      "CRA — Principal residence (the principal residence exemption mechanic, the ordinarily-inhabited test, the one-property-per-family-unit-per-year rule)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains/principal-residence-other-real-estate.html",
  },
  {
    id: 7,
    label:
      "CRA — Income Tax Folio S1-F3-C2, Principal Residence (the technical interpretation of the PRE rules)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/technical-information/income-tax/income-tax-folios-index/series-1-individuals/folio-3-family-unit-issues/income-tax-folio-s1-f3-c2-principal-residence.html",
  },
  {
    id: 8,
    label:
      "CRA — T2091(IND) Designation of a Property as a Principal Residence by an Individual (the form used to designate a principal residence on disposition)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2091ind.html",
  },
  {
    id: 9,
    label:
      "CRA — How CRA addresses non-compliance in the real estate sector (the anti-flipping rule, the 365-day deeming rule, life-event exceptions, and the licensed-agent compliance focus)",
    url: "https://www.canada.ca/en/revenue-agency/programs/about-canada-revenue-agency-cra/compliance/does-canada-revenue-agency-address-non-compliance-real-estate-sector.html",
  },
  {
    id: 10,
    label:
      "CRA — Tax effects of buying real estate to sell for a profit (the capital-gain-vs-business-income test factors)",
    url: "https://www.canada.ca/en/revenue-agency/programs/about-canada-revenue-agency-cra/compliance/real-estate-sector/effects-buying-real-estate-sell-for-profit.html",
  },
  {
    id: 11,
    label:
      "CRA — IT218R Profits, capital gains and losses from the sale of real estate (the historical factor list courts and CRA apply to classify a disposition)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/it218r/archived-profit-capital-gains-losses-sale-real-estate-including-farmland-inherited-land-conversion-real-estate-capital-property-inventory-vice-versa.html",
  },
  {
    id: 12,
    label:
      "CRA — Changing from personal to rental use (the section 45(1) deemed disposition and the section 45(2) election to defer recognition)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/rental-income/capital-cost-allowance-rental-property/determining-capital-cost-property-special-situations/changing-personal-rental-use.html",
  },
  {
    id: 13,
    label:
      "CRA — Changing part of your principal residence to a rental or business property or vice versa (the partial change-of-use mechanic and the post-2019 election extension)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains/principal-residence-other-real-estate/changes-use/changing-part-your-principal-residence-a-rental-business-property.html",
  },
  {
    id: 14,
    label:
      "CRA — T776 Statement of Real Estate Rentals (the form used to report rental income and expenses, including CCA)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t776.html",
  },
  {
    id: 15,
    label:
      "CRA — Rental Income guide T4036 (rental income reporting, CCA on rental buildings, recapture on disposition)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4036/rental-income.html",
  },
  {
    id: 16,
    label:
      "CRA — Line 25400 Capital gains deduction (the LCGE deduction mechanic and the half-of-LCGE rule)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-25400-capital-gains-deduction.html",
  },
  {
    id: 17,
    label:
      "CRA — Completing Schedule 3 (capital gains and losses) — the form-side reporting mechanic for dispositions",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains/completing-schedule-3.html",
  },
  {
    id: 18,
    label:
      "CRA — Self-employed Business, Professional, Commission, Farming, and Fishing Income — Chapter 6 Capital gains (T4002, capital-gain treatment for self-employed individuals)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-9.html",
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
  { href: "#realtor-specific", label: "Why this article is realtor-specific" },
  { href: "#flip-vs-hold", label: "The flip-vs-hold classification — capital gain vs business income" },
  { href: "#inclusion-rate", label: "The 50% inclusion rate in 2026 — and the proposal that did not proceed" },
  { href: "#pre-basics", label: "The principal residence exemption — the formula and the ordinarily-inhabited test" },
  { href: "#pre-wrinkles", label: "PRE wrinkles for realtors — the CCA trap, multiple properties, and family-unit designation" },
  { href: "#anti-flipping", label: "The anti-flipping rule — the 365-day deeming rule and life-event exceptions" },
  { href: "#change-of-use", label: "Change-of-use rules — section 45(1), 45(2), and 45(3)" },
  { href: "#rental-property", label: "Rental property capital gains — T776, CCA, and recapture on sale" },
  { href: "#prec-angle", label: "The PREC angle — corporate vs personal property" },
  { href: "#lcge", label: "The lifetime capital gains exemption ($1.25M) for QSBC shares" },
  { href: "#capital-losses", label: "Capital losses, ABILs, and the carry-back / carry-forward mechanic" },
  { href: "#reporting", label: "Reporting on T1 — Schedule 3 and Line 12700" },
  { href: "#provincial", label: "Provincial nuances and the Quebec geo-block" },
  { href: "#agent-runway", label: "How Agent Runway tracks the agent's own real estate transactions" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CapitalGainsRealEstateAgentsCanadaPage() {
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
              <TrendingUp className="h-3.5 w-3.5" />
              Guide for Canadian Real Estate Agents Who Invest Personally
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Capital Gains Tax for Canadian Real Estate Agents Who Invest Personally in Real Estate (2026)
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              A licensed Canadian real estate agent who owns property
              personally — a principal residence, a vacation property, a
              rental, a property held for resale — sits at a different
              point on CRA&apos;s scrutiny curve than a generic taxpayer.
              The agent has a licence, market knowledge, and a transaction
              history that is visible to CRA through provincial registry
              data and brokerage T4A filings. The published rules that
              govern capital gain versus business income are the same for
              every taxpayer; the practical application of those rules to
              an agent&apos;s own transactions is where the realtor-specific
              considerations live. This article walks the published
              mechanics with every step cited.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              18 min read · CRA-cited · Updated 2026-05-09
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
                Revenue Agency and the Department of Finance. The
                mechanics that apply to any specific agent depend on
                their licensing province, the property in question, the
                holding period, prior CCA claims, family-unit designation
                history, and personal circumstances. Capital gain
                classification in real estate is a fact-specific
                determination; the same property in two different hands
                can produce different tax outcomes. Always verify
                current rules against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4037/capital-gains.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA&apos;s T4037 guide
                </a>{" "}
                and consult a qualified accountant before making any
                disposition or filing decision.{" "}
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
              <h2 id="realtor-specific">Why this article is realtor-specific</h2>

              <p>
                Most Canadian capital gains content treats the reader as a
                passive investor — someone who bought a cottage in 1998
                and is now selling it. That framing maps poorly onto a
                licensed real estate agent. An agent transacts in real
                estate as a profession, builds market knowledge as part
                of their day job, has provincial licensing records and
                brokerage T4A filings on file with CRA, and frequently
                holds personal property at the same time. The published
                rules are identical; the application of those rules to
                agent transactions is where the practical differences
                live<CRACite id={9} />.
              </p>

              <p>
                CRA&apos;s published guidance on real-estate-sector
                non-compliance specifically lists licensed real estate
                agents as a focus group in compliance work, alongside
                builders, assignors, and short-term flippers
                <CRACite id={9} />. The reason is mechanical: an agent
                with access to MLS, market knowledge, and brokerage
                relationships is in a structurally different position
                from a passive homeowner when assessing whether a
                property was acquired with primary intention to hold or
                primary intention to resell at a profit. The agent&apos;s
                own stated intention — even when sincere — is one input
                among many; CRA&apos;s published position is that
                stated intention is not, on its own, sufficient
                <CRACite id={10} />.
              </p>

              <p>
                The article walks the rules, the realtor-relevant
                wrinkles, and the form-side reporting. It does not say
                whether to claim the principal residence exemption on a
                particular property, whether to convert a residence to a
                rental, whether to elect under section 45(2) or 45(3),
                whether to flip or hold, or whether the timing of any
                particular disposition is a good idea. Those are the
                decisions the rules describe the trade-offs for; the
                decision itself is between the agent and their accountant.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="flip-vs-hold">The flip-vs-hold classification — capital gain vs business income</h2>

              <p>
                The first decision CRA makes on the disposition of any
                property is whether the gain is on capital account
                (taxable as a capital gain at the inclusion rate) or on
                income account (taxable as business income at 100% of
                the gain, plus potentially attracting GST/HST on the
                supply)<CRACite id={2} /><CRACite id={11} />. The
                difference is large. A $100,000 gain on capital account
                produces $50,000 of taxable income at the current
                inclusion rate. The same $100,000 gain on income account
                produces $100,000 of taxable income — twice the
                immediate tax base, no inclusion-rate haircut.
              </p>

              <p>
                CRA&apos;s published guidance describes the test as a
                multi-factor determination of the taxpayer&apos;s
                intention at the time of acquisition, examined through
                the taxpayer&apos;s actual course of conduct
                <CRACite id={10} /><CRACite id={11} />. Stated intention
                is one input, not the determinative one; the auditor
                examines all the facts. The published list of factors
                includes<CRACite id={11} />:
              </p>

              <ul>
                <li>
                  <strong>The taxpayer&apos;s intention with respect to
                  the property at the time of purchase.</strong>{" "}
                  Documented contemporaneously is more credible than
                  asserted after the fact.
                </li>
                <li>
                  <strong>The nature of the property and the use to
                  which the taxpayer put it.</strong> A property held
                  vacant or marketed for sale immediately after purchase
                  reads differently from a property occupied or rented
                  for years.
                </li>
                <li>
                  <strong>The frequency or number of similar
                  transactions.</strong> A pattern of acquisitions and
                  short-hold dispositions is the strongest single
                  factor pointing to business income.
                </li>
                <li>
                  <strong>The length of period of ownership.</strong>{" "}
                  Short holds invite scrutiny; long holds support a
                  capital-account characterisation. After the 2023
                  anti-flipping rule, holds under 365 days are not
                  merely scrutinised but deemed business income subject
                  to specified life-event exceptions (covered below).
                </li>
                <li>
                  <strong>Work done on the property.</strong> Substantial
                  renovation followed by quick sale points to inventory.
                </li>
                <li>
                  <strong>Circumstances of the sale.</strong> An
                  involuntary sale (job relocation, separation, death)
                  reads differently from a planned exit on profit.
                </li>
                <li>
                  <strong>Motive (and the secondary-intention
                  doctrine).</strong> Even when the primary intention is
                  long-term hold, CRA&apos;s published position is that
                  if a secondary intention to resell at a profit existed
                  at acquisition and was carried out, the gain is
                  typically business income<CRACite id={10} />.
                </li>
              </ul>

              <p>
                For a licensed agent, several of these factors carry
                additional weight on audit. The agent&apos;s licence and
                MLS access are documented evidence of market knowledge.
                The brokerage T4A filed each year documents the
                agent&apos;s commission income — a baseline of
                real-estate-as-profession that the auditor reads against
                the personal transaction in question. None of this
                changes the rule; it changes the evidentiary picture
                CRA brings to the rule&apos;s application.
              </p>

              <p>
                The published consequence: an agent whose personal
                short-hold disposition is reclassified from capital gain
                to business income loses the inclusion-rate haircut, may
                owe HST on the supply if the property is taxable
                (typically a substantially-renovated property or new
                construction), and reports the gain on T2125 rather than
                on Schedule 3<CRACite id={2} /><CRACite id={18} />. The
                full mechanic of T2125 is covered in the{" "}
                <Link
                  href="/t2125-guide-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  T2125 guide for Canadian real estate agents
                </Link>.
              </p>

              {/* ── Section 3 ── */}
              <h2 id="inclusion-rate">The 50% inclusion rate in 2026 — and the proposal that did not proceed</h2>

              <p>
                The capital gains inclusion rate — the fraction of a
                capital gain that is included in taxable income — is one
                of the most-misreported figures in informal Canadian
                tax content as of this article&apos;s publication date.
                The published position requires unpacking.
              </p>

              <p>
                Budget 2024 proposed increasing the inclusion rate from
                one-half to two-thirds for capital gains realised on or
                after June 25, 2024 — for individuals, on the portion of
                annual gains exceeding $250,000; for corporations and
                most trusts, on all capital gains
                <CRACite id={3} />. The proposal was not enacted.
              </p>

              <p>
                On January 31, 2025, the Department of Finance announced
                a deferral of the proposed implementation date from June
                25, 2024 to January 1, 2026<CRACite id={3} />. On March
                21, 2025, the federal government announced that it does
                not intend to proceed with the proposed increase to the
                capital gains inclusion rate at all
                <CRACite id={4} />.
              </p>

              <p>
                The published position as of this article&apos;s update
                date is therefore: the capital gains inclusion rate
                remains one-half (50%) for individuals, corporations,
                and trusts in 2026<CRACite id={2} /><CRACite id={4} />.
                A $100,000 capital gain produces $50,000 of taxable
                income, regardless of whether the gain is above or below
                $250,000 in a year. The two-thirds rate that briefly
                appeared in 2024 budget commentary, on tax software
                preview interfaces, and in early 2025 secondary content
                is, as of the March 2025 announcement, not the operative
                rule.
              </p>

              <p>
                Two ancillary measures associated with the original
                inclusion-rate package were nonetheless implemented and
                remain in force<CRACite id={5} />:
              </p>

              <ul>
                <li>
                  <strong>The lifetime capital gains exemption (LCGE)
                  was increased to $1.25 million</strong> for
                  dispositions of qualified small business corporation
                  shares and qualified farm or fishing property
                  occurring after June 24, 2024<CRACite id={5} />.
                  Annual indexation of the $1.25M limit resumes in
                  2026<CRACite id={5} />. The QSBC angle is covered in
                  detail later in this article.
                </li>
                <li>
                  <strong>A $250,000 annual threshold for capital
                  gains</strong> was implemented effective January 1,
                  2026 to ensure individuals with modest capital gains
                  continue to benefit from the one-half inclusion rate
                  <CRACite id={5} />. Because the inclusion-rate
                  increase itself is not proceeding, the practical
                  effect of this threshold in 2026 is that the one-half
                  rate applies to gains above and below it.
                </li>
              </ul>

              <p>
                The reader of secondary tax content who finds a 2024
                source describing &quot;the new 66.67% inclusion
                rate&quot; is reading a snapshot from the period
                between the Budget 2024 announcement and the March 2025
                cancellation. CRA&apos;s current published position
                governs<CRACite id={2} /><CRACite id={4} />.
              </p>

              {/* ── Section 4 ── */}
              <h2 id="pre-basics">The principal residence exemption — the formula and the ordinarily-inhabited test</h2>

              <p>
                The principal residence exemption (PRE) eliminates the
                taxable capital gain on the disposition of a property
                that qualifies as a taxpayer&apos;s principal residence
                for every year the taxpayer owned it
                <CRACite id={6} /><CRACite id={7} />. It is one of the
                largest personal-tax provisions in the Canadian system
                and the single most-relevant capital-gains rule for the
                typical Canadian homeowner — including a real estate
                agent who owns their own home.
              </p>

              <h3>The qualifying conditions</h3>

              <p>
                A property qualifies as a principal residence in a year
                if all of the following apply<CRACite id={6} />
                <CRACite id={7} />:
              </p>

              <ul>
                <li>
                  <strong>It is a housing unit, a leasehold interest in
                  a housing unit, or a share in a co-operative housing
                  corporation that gives the right to use a housing
                  unit.</strong> Detached houses, condos, semi-detached,
                  duplexes, and certain mobile homes and houseboats can
                  qualify.
                </li>
                <li>
                  <strong>The taxpayer owns the property (alone or
                  jointly with another person).</strong>
                </li>
                <li>
                  <strong>The property is ordinarily inhabited in the
                  year</strong> by the taxpayer, the taxpayer&apos;s
                  current or former spouse or common-law partner, or
                  the taxpayer&apos;s child<CRACite id={6} />. CRA&apos;s
                  published position is that &quot;ordinarily
                  inhabited&quot; is a question of fact considering the
                  whole year; even a short period of habitation can
                  qualify if the use is genuine, but a property never
                  occupied by the taxpayer or their family does not
                  qualify on the ordinarily-inhabited test alone
                  <CRACite id={7} />.
                </li>
                <li>
                  <strong>The taxpayer designates the property as
                  their principal residence for that year.</strong>{" "}
                  Designation is required on T2091(IND) at disposition
                  <CRACite id={8} />.
                </li>
              </ul>

              <h3>One property per family unit per year</h3>

              <p>
                Only one property can be designated as a principal
                residence per family unit per tax year
                <CRACite id={6} /><CRACite id={7} />. The family unit
                for designation purposes consists of the taxpayer, their
                spouse or common-law partner (if any), and any unmarried
                minor children. A couple cannot, between them, designate
                two properties for the same year. This rule shapes
                multi-property planning materially: a household with a
                principal home and a cottage chooses, year by year on
                final disposition, which property carries the
                designation for each year<CRACite id={6} />
                <CRACite id={7} />.
              </p>

              <h3>The PRE formula</h3>

              <p>
                The exempt portion of the gain is calculated using the
                published formula<CRACite id={6} /><CRACite id={8} />:
              </p>

              <p>
                <em>Exempt gain = Total capital gain × ((1 + Number of
                years designated as principal residence) ÷ Number of
                years owned)</em>
              </p>

              <p>
                The &quot;1 +&quot; in the numerator is the published
                rule that allows a taxpayer to cover one extra year in
                the designation calculation — historically used to
                handle the year of acquisition of a replacement home in
                the same year as disposition of the old one. For a
                property that was the principal residence for every
                year of ownership, the formula produces an exempt gain
                of 100% of the total gain — the standard outcome for a
                long-time homeowner selling their only home
                <CRACite id={6} />.
              </p>

              <h3>Reporting the PRE — required since 2016</h3>

              <p>
                Effective for 2016 and later tax years, CRA requires
                that the disposition and designation of a principal
                residence be reported on Schedule 3 of the T1, with
                additional information on T2091(IND) where the property
                was the principal residence for every year of ownership
                — and on a more detailed basis where it was not
                <CRACite id={6} /><CRACite id={8} /><CRACite id={17} />.
                Failure to report the disposition can result in denial
                of the exemption and the imposition of a late-designation
                penalty<CRACite id={6} />. This reporting requirement is
                independent of whether any tax is owing; the
                disposition is reportable even when the gain is fully
                exempt.
              </p>

              {/* ── Section 5 ── */}
              <h2 id="pre-wrinkles">PRE wrinkles for realtors — the CCA trap, multiple properties, and family-unit designation</h2>

              <p>
                The standard PRE mechanic above applies identically to
                a real estate agent and to any other Canadian taxpayer.
                Several specific patterns surface more frequently for
                agents because of their property profile and their
                deduction history.
              </p>

              <h3>The CCA trap on a home office</h3>

              <p>
                A self-employed agent who claims business-use-of-home
                expenses on T2125 may be tempted to extend that
                deduction to capital cost allowance (CCA) on the
                business-use portion of the home. The published rule:
                claiming CCA on a portion of a principal residence
                jeopardises the principal residence exemption on that
                portion of the home for the year(s) CCA is claimed
                <CRACite id={6} /><CRACite id={7} /><CRACite id={12} />.
                The full mechanic — including how this interacts with
                the section 45(2) election, why most accountants treat
                CCA on a principal residence as a position to consider
                very carefully, and why the home-office deduction in
                practice excludes building CCA — is covered in the{" "}
                <Link
                  href="/business-use-of-home-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  business-use-of-home guide for Canadian real estate agents
                </Link>.
              </p>

              <h3>The vacation property and the family-unit designation choice</h3>

              <p>
                An agent who owns both a principal residence and a
                cottage faces, on disposition of either property, the
                published one-property-per-family-unit-per-year rule
                <CRACite id={6} />. The mechanic is that the
                designation election is made on disposition by
                completing T2091(IND) and choosing the years to
                designate against each property
                <CRACite id={8} />. Because the formula scales with
                designated years over total years of ownership, the
                analytical decision is which property has the larger
                gain per year of ownership and therefore benefits more
                from being the designated property in the years both
                were owned. This is the single most-mechanical PRE
                planning decision and is typically run by an accountant
                using the T2091(IND-WS) worksheet on disposition of the
                first of the two properties.
              </p>

              <h3>Properties held in a spouse&apos;s name</h3>

              <p>
                Where a spouse is the legal owner of one of the
                properties (a common pattern in mixed-ownership
                households), the family-unit rule still applies — the
                family unit can only designate one property per year
                across both spouses<CRACite id={6} /><CRACite id={7} />.
                The legal owner of each property is the spouse who can
                designate it; the family-unit rule binds the two
                designations to one per year.
              </p>

              <h3>Vacant land adjacent to the home</h3>

              <p>
                Up to half a hectare (1.235 acres) of land is generally
                included in the housing unit&apos;s definition for PRE
                purposes; land in excess of that may also qualify if
                the taxpayer establishes that the additional land is
                necessary for the use and enjoyment of the housing unit
                <CRACite id={6} /><CRACite id={7} />. Acreage properties
                — common in rural Canadian agent portfolios — engage
                this rule on disposition.
              </p>

              <h3>The agent&apos;s licensure and the &quot;ordinarily inhabited&quot; question</h3>

              <p>
                The ordinarily-inhabited test does not impose a minimum
                number of months<CRACite id={7} />. A property genuinely
                inhabited by the agent or their family for a portion of
                the year qualifies on that test. The standard
                application becomes relevant where an agent acquires a
                property, lives in it briefly, and disposes of it — in
                which case both the ordinarily-inhabited test and the
                anti-flipping rule (next section) and the flip-vs-hold
                factor list (section 2) all weigh in on whether the
                disposition produces an exempt PRE gain, a taxable
                capital gain, or business income.
              </p>

              {/* ── Section 6 ── */}
              <h2 id="anti-flipping">The anti-flipping rule — the 365-day deeming rule and life-event exceptions</h2>

              <p>
                Effective for dispositions on or after January 1, 2023,
                Income Tax Act subsections 12(13) and 12(14) introduced
                the residential property flipping rule. The published
                mechanic: any gain from the disposition of a housing
                unit (including a rental property) located in Canada,
                or a right to acquire a housing unit located in Canada,
                that the taxpayer owned or held for less than 365
                consecutive days before its disposition is deemed to be
                business income — not a capital gain — unless the
                disposition occurred due to, or in anticipation of, one
                of a published list of life events
                <CRACite id={9} />.
              </p>

              <p>
                The published consequences of the rule applying
                <CRACite id={9} />:
              </p>

              <ul>
                <li>
                  The gain is fully taxable as business income at 100%
                  inclusion (no capital-gain inclusion-rate haircut).
                </li>
                <li>
                  The principal residence exemption does not apply, even
                  where the property was the taxpayer&apos;s
                  principal residence for the period held.
                </li>
                <li>
                  The disposition is reported on T2125 (or T776 if
                  rental), not on Schedule 3 as a capital gain
                  <CRACite id={2} /><CRACite id={14} />.
                </li>
              </ul>

              <h3>The published life-event exceptions</h3>

              <p>
                The rule does not apply where the disposition occurred
                due to, or in anticipation of, one of the following
                events<CRACite id={9} />:
              </p>

              <ul>
                <li>
                  <strong>Death of the taxpayer or a person related to
                  the taxpayer.</strong>
                </li>
                <li>
                  <strong>A related person joining the taxpayer&apos;s
                  household, or the taxpayer joining a related
                  person&apos;s household.</strong> The published
                  examples include moving in with a spouse or common-law
                  partner, the birth of a child, adoption, or care of
                  an elderly parent.
                </li>
                <li>
                  <strong>Breakdown of marriage or common-law
                  partnership</strong> where the taxpayer had been
                  living separate and apart from their spouse or
                  common-law partner for at least 90 days before the
                  disposition.
                </li>
                <li>
                  <strong>A threat to the personal safety of the
                  taxpayer or a related person,</strong> such as
                  domestic violence.
                </li>
                <li>
                  <strong>Serious illness or disability</strong> of the
                  taxpayer or a related person.
                </li>
                <li>
                  <strong>An eligible relocation</strong> of the
                  taxpayer or the taxpayer&apos;s spouse or common-law
                  partner — typically an employment-related relocation
                  meeting the published distance test.
                </li>
                <li>
                  <strong>Involuntary disposition,</strong> such as
                  expropriation or destruction of the property.
                </li>
                <li>
                  <strong>Insolvency.</strong>
                </li>
              </ul>

              <p>
                The rule&apos;s realtor-specific weight is that licensed
                agents, by definition, transact in real estate. An
                agent&apos;s short-hold disposition will be measured
                against the rule the same way any taxpayer&apos;s
                short-hold is measured. The 365-day clock runs on
                ownership, not on occupancy<CRACite id={9} />. Whether
                a particular life-event exception applies is a
                fact-specific determination that benefits from
                accountant-side review at the time of disposition,
                because the documentation supporting the exception
                (medical records, separation date letters, expropriation
                notices, employment relocation letters) is the
                evidentiary base that supports the exception on audit.
              </p>

              {/* ── Cheat sheet inline CTA ── */}
              <div className="not-prose my-8">
                <EmailCapture
                  heading="Get the Canadian Realtor Tax Cheat Sheet"
                  subheading="Every 2025 bracket, CPP rate, GST/HST threshold, and deadline on one printable page — CRA-cited. We'll email it to you."
                  ctaLabel="Email me the cheat sheet"
                  source="cheat_sheet_inline_capital-gains-real-estate-agents-canada"
                  variant="light"
                />
              </div>

              {/* ── Section 7 ── */}
              <h2 id="change-of-use">Change-of-use rules — section 45(1), 45(2), and 45(3)</h2>

              <p>
                When a property changes from personal use to
                income-producing use, or vice versa, the Income Tax Act
                treats the change as a deemed disposition and
                reacquisition at fair market value
                <CRACite id={12} /><CRACite id={13} />. This is the
                section 45(1) baseline. Two elections allow the
                taxpayer to defer the deemed-disposition recognition.
              </p>

              <h3>Section 45(1) — the baseline deemed disposition</h3>

              <p>
                Where a taxpayer converts a property from personal use
                (e.g., principal residence) to income-producing use
                (e.g., rental property), section 45(1) deems a
                disposition at fair market value on the day of the
                change<CRACite id={12} />. Any accrued capital gain to
                that point is realised. If the property qualified as a
                principal residence for the entire pre-change ownership
                period and the PRE designation is made on the deemed
                disposition, the gain may be fully exempt
                <CRACite id={6} />. The post-change owner&apos;s
                adjusted cost base for the property is the deemed
                proceeds (fair market value at the change-of-use date).
                The reverse — converting from rental to personal — is
                the same deemed-disposition mechanic in the opposite
                direction<CRACite id={13} />.
              </p>

              <h3>Section 45(2) — defer recognition on personal-to-rental</h3>

              <p>
                Where a taxpayer converts a property from personal use
                to income-producing use, the taxpayer may elect under
                subsection 45(2) to be deemed not to have made the
                change of use<CRACite id={12} />. The election is made
                by filing a signed letter to that effect with the T1
                return for the year the change occurred
                <CRACite id={12} />. Two consequences follow
                <CRACite id={6} /><CRACite id={12} />:
              </p>

              <ul>
                <li>
                  No deemed disposition occurs at the time of change;
                  the capital-gain recognition is deferred until actual
                  disposition.
                </li>
                <li>
                  The property may continue to be designated as the
                  taxpayer&apos;s principal residence for up to four
                  additional tax years during which the election
                  remains in force, even though the property is not
                  ordinarily inhabited by the taxpayer or family during
                  that period<CRACite id={6} />. The four-year cap can
                  be extended without limit in certain employment-
                  relocation scenarios meeting the published conditions.
                </li>
              </ul>

              <p>
                The published limitation: the section 45(2) election is
                considered to be rescinded on the first day of the year
                in which CCA is claimed on the property
                <CRACite id={12} />. An election made and then followed
                by CCA claims on the rental building unwinds the
                election from that point forward. This is one of the
                most-mechanical CCA-vs-PRE interactions and is the
                reason rental-property CCA decisions deserve specific
                accountant review when a section 45(2) election is in
                play.
              </p>

              <h3>Section 45(3) — defer recognition on rental-to-personal</h3>

              <p>
                Where a taxpayer converts a property from
                income-producing use to personal use, subsection 45(3)
                allows an election to defer recognition of the deemed
                disposition that would otherwise arise under section
                45(1)<CRACite id={13} />. The election is made by filing
                a letter with the T1 return for the year the property
                is sold or, where applicable, an earlier prescribed
                year. As with section 45(2), the election is unavailable
                if CCA was claimed on the property in any tax year
                ending after 1984 and on or before the day of the
                change in use<CRACite id={12} />.
              </p>

              <h3>Partial change of use</h3>

              <p>
                Effective for changes in use occurring on or after
                March 19, 2019, the section 45(2) and 45(3) elections
                are available for a partial change in use of a property
                — for example, converting a basement of a principal
                residence to a rental suite, or converting a rental
                suite back to personal use<CRACite id={13} />. Before
                this change, only complete changes in use qualified for
                the elections. The realtor angle: an agent who lives in
                a duplex and rents the lower unit, or who rents a
                basement suite as a mortgage helper, engages this
                partial-change rule on a future disposition or on any
                future change in the personal-use proportion of the
                property.
              </p>

              {/* ── Section 8 ── */}
              <h2 id="rental-property">Rental property capital gains — T776, CCA, and recapture on sale</h2>

              <p>
                A real estate agent who owns rental property personally
                reports rental income and expenses on Form T776
                Statement of Real Estate Rentals during the holding
                period<CRACite id={14} /><CRACite id={15} />. The
                rental-period mechanic and the disposition mechanic
                interact through the capital cost allowance system.
              </p>

              <h3>T776 during the holding period</h3>

              <p>
                T776 is the rental analogue of T2125 — the form on
                which gross rents, eligible operating expenses
                (interest on mortgages used to acquire the rental,
                property taxes, insurance, utilities paid by landlord,
                maintenance, advertising, professional fees, property
                management fees), and capital cost allowance combine
                to produce net rental income for the year
                <CRACite id={14} /><CRACite id={15} />. Net rental
                income flows to Line 12600 of the T1 and is taxed at
                ordinary rates — not capital-gain rates — during the
                holding period.
              </p>

              <h3>The land-and-building separation at acquisition</h3>

              <p>
                On acquisition of a rental property, the cost is
                allocated between the land (which is not depreciable)
                and the building (which is, generally Class 1 at 4%
                declining balance for most residential rentals)
                <CRACite id={15} />. Provincial property assessment
                ratios are commonly used as the allocation reference
                where no contemporaneous appraisal is available. The
                allocation matters because CCA is claimed on the
                building, not the land — and the building&apos;s
                undepreciated capital cost (UCC) tracks through the
                holding period and is the figure against which
                recapture is measured on disposition.
              </p>

              <h3>Capital improvements vs current expenses</h3>

              <p>
                The published distinction matters during the rental
                period<CRACite id={15} />. Current expenses (repairs
                that maintain the property in its current condition —
                replacing a broken window with a similar window,
                repainting, fixing a leak) are deductible against
                rental income in the year incurred. Capital
                improvements (additions or upgrades that extend the
                property&apos;s useful life or change its character —
                replacing a kitchen, adding a bathroom, finishing a
                basement, replacing a roof with a longer-life
                material) are added to the property&apos;s capital
                cost and either depreciated through CCA or sit on the
                cost base until disposition. The classification is
                often where rental-tax return reviews focus.
              </p>

              <h3>The disposition mechanic — gain, recapture, and PRE interaction</h3>

              <p>
                On sale of a rental property, the published mechanic
                runs in three steps<CRACite id={2} /><CRACite id={15} />:
              </p>

              <ol>
                <li>
                  <strong>Capital gain calculation.</strong> Proceeds
                  of disposition (less selling expenses — commission
                  paid, legal fees, transfer taxes paid by seller)
                  minus adjusted cost base (acquisition cost plus
                  capital improvements) equals the capital gain (or
                  loss). The capital gain is taxed at the inclusion
                  rate — currently 50%<CRACite id={2} />
                  <CRACite id={4} />.
                </li>
                <li>
                  <strong>CCA recapture.</strong> If CCA was claimed on
                  the building during the holding period, the lesser of
                  (the proceeds attributable to the building, capped at
                  original capital cost) and (the original capital cost)
                  triggers recapture of the previously-claimed CCA
                  <CRACite id={15} />. Recapture is fully taxable as
                  ordinary income at 100%, not at the capital-gain
                  inclusion rate. The mechanical effect: CCA defers
                  tax during the holding period, but on disposition
                  the deferred tax is repaid as ordinary income (with
                  any inclusion-rate haircut on the capital-gain
                  portion separate from the recapture).
                </li>
                <li>
                  <strong>Principal residence designation interaction.</strong>{" "}
                  Where a property was a principal residence for some
                  years of ownership and a rental for others (with or
                  without a section 45(2) election), the PRE formula
                  reduces the taxable capital gain on the years of
                  designation; the recapture portion is unaffected by
                  the PRE because recapture is not a capital-gain
                  amount<CRACite id={6} /><CRACite id={15} />. The
                  T2091(IND) and T776 fields on disposition coordinate
                  the two<CRACite id={8} /><CRACite id={14} />.
                </li>
              </ol>

              <p>
                The published trade-off most-discussed in informal
                content is whether to claim CCA on a rental building
                during the holding period. Claiming CCA reduces taxable
                rental income each year (saving tax now); on
                disposition, recapture reverses the deferral as
                ordinary income (paying back tax later, possibly at a
                different marginal rate). The published rule does not
                prescribe a choice; it describes the mechanic of each
                option<CRACite id={15} />. The decision sits with the
                agent and their accountant.
              </p>

              {/* ── Section 9 ── */}
              <h2 id="prec-angle">The PREC angle — corporate vs personal property</h2>

              <p>
                Property held inside a Personal Real Estate Corporation
                (PREC) is a corporate asset, not personal. The capital
                gains mechanic on disposition shifts accordingly: the
                gain is realised at the corporate level, taxed under
                the corporate inclusion-rate framework, and any
                distribution of the after-tax gain to the shareholder
                runs through the integration mechanism (refundable
                taxes, the capital dividend account, eligible and
                non-eligible dividend regimes). This is a materially
                different framework from personal capital-gain reporting
                on Schedule 3 and is outside this article&apos;s
                personal-investments scope. For the structural
                comparison of PREC vs sole proprietor, see the{" "}
                <Link
                  href="/prec-vs-sole-proprietor-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  PREC vs sole proprietor guide for Canadian real estate agents
                </Link>.
              </p>

              <p>
                What is in scope for this article is the personal-side
                interaction: an agent who operates through a PREC for
                their commission income may still hold investment real
                estate personally — separate from the corporation —
                and the capital-gain mechanics for that personally-held
                property are the same as for any non-PREC agent. The
                separation between corporate and personal assets is the
                published baseline; mixing the two (e.g., a PREC paying
                expenses on a personally-held rental) is the kind of
                pattern that benefits from accountant-side review at
                the time the structure is established.
              </p>

              {/* ── Section 10 ── */}
              <h2 id="lcge">The lifetime capital gains exemption ($1.25M) for QSBC shares</h2>

              <p>
                The lifetime capital gains exemption (LCGE) is a
                cumulative deduction available against capital gains
                from the disposition of qualified small business
                corporation shares (QSBC) and qualified farm or fishing
                property<CRACite id={5} /><CRACite id={16} />. The
                effect is to exempt up to the LCGE limit of cumulative
                lifetime capital gain on those specific assets from
                taxation.
              </p>

              <h3>The 2026 limit</h3>

              <p>
                The LCGE limit was increased to $1.25 million for
                dispositions of qualified small business corporation
                shares and qualified farm or fishing property occurring
                after June 24, 2024<CRACite id={5} />. Annual indexation
                of the $1.25 million limit resumes in 2026
                <CRACite id={5} />. The exact 2026 indexed limit is
                published by CRA each year; the figure in this article
                may be confirmed against CRA&apos;s current published
                amount before any disposition is planned around it.
              </p>

              <p>
                The mechanic on T1 is that the LCGE is claimed as a
                deduction on Line 25400 (capital gains deduction) and
                is limited to half of the lifetime exemption — because
                only the taxable portion of the capital gain (the
                inclusion-rate portion) is in income and therefore
                deductible against<CRACite id={16} />. With the
                inclusion rate at 50%, the maximum deduction on Line
                25400 from the $1.25M LCGE is $625,000
                <CRACite id={16} />.
              </p>

              <h3>The QSBC qualifying conditions</h3>

              <p>
                To qualify as a QSBC share, three published tests must
                be met<CRACite id={2} /><CRACite id={16} />:
              </p>

              <ul>
                <li>
                  <strong>Small business corporation test at the time
                  of disposition.</strong> All or substantially all of
                  the corporation&apos;s assets must be used principally
                  in an active business carried on primarily in Canada,
                  or be shares or debt of connected corporations meeting
                  similar tests.
                </li>
                <li>
                  <strong>The 24-month holding period test.</strong>{" "}
                  Throughout the 24 months immediately before
                  disposition, the share must have been owned by the
                  taxpayer or a related person.
                </li>
                <li>
                  <strong>The 24-month asset test.</strong> Throughout
                  the same 24 months, more than 50% of the
                  corporation&apos;s assets (by fair market value) must
                  have been used principally in an active Canadian
                  business or in connected QSBC-eligible holdings.
                </li>
              </ul>

              <h3>The PREC-as-QSBC question</h3>

              <p>
                A PREC carrying on the business of providing real
                estate services in Canada through the licensed agent
                may, depending on its asset composition and the
                provincial PREC regulatory framework, satisfy the QSBC
                conditions on the sale of its shares. The mechanic
                therefore exists for an agent disposing of PREC shares
                (e.g., a structured exit from the business) to claim
                the LCGE against the resulting gain
                <CRACite id={16} />. The fact-specific tests above
                determine eligibility on a case-by-case basis;
                provincial PREC rules and the corporation&apos;s asset
                purification history are the inputs an accountant
                examines on disposition planning. This article
                describes the published mechanic; whether a particular
                PREC qualifies is an accountant-side determination on
                the facts of the corporation.
              </p>

              {/* ── Section 11 ── */}
              <h2 id="capital-losses">Capital losses, ABILs, and the carry-back / carry-forward mechanic</h2>

              <p>
                Capital losses arise when the adjusted cost base of a
                capital property exceeds the proceeds of disposition
                less selling expenses<CRACite id={2} />. The published
                mechanic for using capital losses<CRACite id={2} />
                <CRACite id={17} />:
              </p>

              <ul>
                <li>
                  <strong>Allowable capital losses</strong> (the
                  inclusion-rate portion of the capital loss) may be
                  applied against allowable capital gains in the same
                  year on Schedule 3.
                </li>
                <li>
                  <strong>Net capital losses</strong> remaining after
                  the current-year offset may be carried back three
                  preceding tax years (against allowable capital gains
                  in those years) by filing form T1A with the current
                  return.
                </li>
                <li>
                  <strong>Net capital losses</strong> may be carried
                  forward indefinitely, applied only against allowable
                  capital gains in future years (not against ordinary
                  income).
                </li>
              </ul>

              <h3>Allowable business investment losses (ABILs)</h3>

              <p>
                A specific subset of capital losses — losses on shares
                or debt of a small business corporation meeting
                published conditions — qualifies as a business
                investment loss, half of which is an allowable business
                investment loss (ABIL)<CRACite id={2} />. ABILs are
                deductible against ordinary income (not just capital
                gains), with carry-back of three years and
                carry-forward of ten years; unused balances after ten
                years convert to ordinary net capital losses
                <CRACite id={2} />. ABIL eligibility is the rare case
                where a real-estate-corporation share loss might
                produce ordinary-income deductibility rather than
                capital-loss-only deductibility, subject to the
                published small-business-corporation tests at the time
                of loss.
              </p>

              <h3>Personal-use property losses</h3>

              <p>
                Capital losses on personal-use property (a property
                used primarily for personal use rather than to earn
                income) are generally not deductible
                <CRACite id={2} />. A principal residence is the most
                common example — a loss on disposition of a principal
                residence cannot generally be applied against any
                capital gain. This is the asymmetric pair of the PRE:
                the gain is exempt, and the loss is also denied.
              </p>

              {/* ── Section 12 ── */}
              <h2 id="reporting">Reporting on T1 — Schedule 3 and Line 12700</h2>

              <p>
                Capital gains and losses are reported on Schedule 3 of
                the T1 return<CRACite id={17} />. The taxable capital
                gain (the inclusion-rate portion of the net capital
                gain) flows from Schedule 3 to Line 12700 of the T1
                <CRACite id={1} />.
              </p>

              <p>
                The Schedule 3 sections relevant to a real estate
                agent investing personally include
                <CRACite id={17} />:
              </p>

              <ul>
                <li>
                  <strong>Real estate, depreciable property, and other
                  properties.</strong> The line for non-principal-
                  residence real property dispositions — rental
                  properties, vacation properties, vacant land,
                  investment property held personally.
                </li>
                <li>
                  <strong>Principal residence designation.</strong>{" "}
                  The section requiring identification and designation
                  of a property as the taxpayer&apos;s principal
                  residence on disposition; T2091(IND) is filed where
                  the property was the principal residence for every
                  year of ownership, with a more detailed alternate
                  form where not<CRACite id={8} />.
                </li>
                <li>
                  <strong>Publicly traded shares, mutual funds, and
                  other shares.</strong> Including QSBC shares
                  qualifying for the LCGE on Line 25400
                  <CRACite id={16} />.
                </li>
                <li>
                  <strong>Bonds, debentures, and similar
                  obligations.</strong>
                </li>
                <li>
                  <strong>Other property.</strong>
                </li>
              </ul>

              <p>
                The taxable capital gain at Line 12700 enters the
                T1&apos;s ordinary-income calculation and is therefore
                taxed at the agent&apos;s combined federal-and-
                provincial marginal rate on the inclusion-rate-adjusted
                amount. A capital gain does not have its own special
                schedule of rates; the inclusion rate is the only
                rate-side adjustment, and the result is taxed at
                whatever marginal rate applies to the agent&apos;s
                total income for the year<CRACite id={1} />
                <CRACite id={2} />.
              </p>

              {/* ── Section 13 ── */}
              <h2 id="provincial">Provincial nuances and the Quebec geo-block</h2>

              <p>
                The capital gains inclusion rate is a federal rule that
                applies uniformly across all provinces and territories
                <CRACite id={2} />. Provincial differences arise on the
                rate side — the provincial component of the combined
                federal-and-provincial marginal rate that applies to
                the inclusion-rate-adjusted gain is set by each
                province&apos;s own bracket structure. For Atlantic
                Canada (NB, NS, PEI), the rate-side mechanic is covered
                in the{" "}
                <Link
                  href="/real-estate-agent-tax-rates-nb-ns-pei"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  NB / NS / PEI tax rates guide
                </Link>{" "}
                — those provincial rates apply to the taxable capital
                gain at Line 12700 the same way they apply to other
                ordinary income.
              </p>

              <p className="text-xs italic">
                Quebec is currently outside the platform&apos;s
                geo-coverage pending Law 25 compliance work and French
                translation. Quebec-licensed agents are referred to
                Revenu Québec&apos;s published guidance and a
                Quebec-licensed accountant. Quebec administers its own
                capital-gain rules through the TP-1 return and the
                Quebec capital gains schedule; the QST-side
                interactions on real-estate dispositions involving
                substantially-renovated property are also distinct
                from the federal HST treatment.
              </p>

              {/* ── Section 14 ── */}
              <h2 id="agent-runway">How Agent Runway tracks the agent&apos;s own real estate transactions</h2>

              <p>
                Agent Runway is the business financial layer Canadian
                real estate agents run alongside their CRM. Beyond the
                commission-side tracking covered in the{" "}
                <Link
                  href="/first-year-tax-filing-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  first-year tax filing guide
                </Link>, the platform tracks the agent&apos;s own
                personal real estate transactions for tax purposes —
                acquisition cost (with the land-and-building split for
                rental properties), capital improvements vs current
                expenses through the holding period, CCA decisions and
                their cumulative effect on UCC, disposition proceeds
                with selling-expense capture, and the realized capital
                gain or loss with the recapture component separated.
                The platform&apos;s output is information against
                which the agent and their accountant work; the
                published rules surfaced are the same rules this
                article walks through.
              </p>

              <p>
                For a year-round picture across the Canadian-specific
                tax surfaces, see the{" "}
                <Link
                  href="/canadian-real-estate-agent-financial-platform"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian financial layer overview
                </Link>{" "}
                and the broader{" "}
                <Link
                  href="/real-estate-agent-tax-planning-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian real estate agent tax planning guide
                </Link>. For the deduction-side of the agent&apos;s
                operating expenses on T2125, see the{" "}
                <Link
                  href="/real-estate-agent-business-expenses-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  business expenses guide
                </Link>,{" "}
                <Link
                  href="/vehicle-expenses-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  vehicle expenses guide
                </Link>, and{" "}
                <Link
                  href="/business-use-of-home-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  business-use-of-home guide
                </Link>. For the HST mechanic that may apply to
                substantially-renovated or new-construction property
                dispositions, see the{" "}
                <Link
                  href="/real-estate-agent-hst-registration-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  HST registration guide
                </Link>{" "}
                and the{" "}
                <Link
                  href="/gst-hst-quick-method-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  GST/HST Quick Method guide
                </Link>. For the live federal-plus-provincial estimator
                that runs the rate-side math in this article, see the{" "}
                <Link
                  href="/tools/realtor-tax-estimator"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian Realtor Tax Estimator
                </Link>.
              </p>

              <p className="text-xs italic">
                This article describes published CRA and Department of
                Finance rules as of 2026-05-09. Capital gains and
                principal residence rules are fact-specific and depend
                on documentation, designation history, holding period,
                CCA history, and family-unit composition that vary
                materially across taxpayers. Verify current rules and
                discuss any specific disposition with a qualified
                accountant before acting on any of the mechanics above.
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
                verified live on 2026-05-09.
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
              advice. Capital gain classification in real estate is a
              fact-specific determination; the same property in two
              different hands can produce different tax outcomes. The
              mechanics that apply to any specific agent depend on
              their licensing province, the property in question, the
              holding period, prior CCA claims, family-unit
              designation history, and personal circumstances. Always
              verify current rules against CRA&apos;s T4037 guide and
              consult a qualified accountant before making any
              disposition or filing decision. Agent Runway assumes no
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
              Your own real-estate transactions are part of the picture, not separate from it.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway tracks the agent&apos;s own personal
              property — acquisition, capital improvements, CCA
              decisions, dispositions — alongside commission income,
              expense capture, and the federal-plus-provincial-plus-CPP
              tax estimate. CRA-aware, surfaced in plain language by
              the Flight Crew. Built for Canadian real estate agents.
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
