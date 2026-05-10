import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "PREC vs Sole Proprietor for Real Estate Agents in Canada: What the Tax Difference Actually Is",
  description:
    "A plain-language breakdown of how a Personal Real Estate Corporation (PREC) differs from sole proprietorship for Canadian agents — tax deferral, salary vs dividend, and what changes.",
  keywords: [
    "prec vs sole proprietor",
    "personal real estate corporation canada",
    "prec tax canada",
    "real estate agent incorporation canada",
    "salary vs dividend prec",
    "canadian realtor incorporation",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/prec-vs-sole-proprietor-real-estate-agents-canada",
    title:
      "PREC vs Sole Proprietor for Real Estate Agents in Canada (2025)",
    description:
      "How a Personal Real Estate Corporation differs from sole proprietorship — tax deferral, salary vs dividend, and the structural mechanics of each.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/prec-vs-sole-proprietor-real-estate-agents-canada",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "PREC vs Sole Proprietor for Real Estate Agents in Canada: What the Tax Difference Actually Is",
  description:
    "A plain-language breakdown of how a Personal Real Estate Corporation (PREC) differs from sole proprietorship for Canadian agents — tax deferral, salary vs dividend, and what changes.",
  url: "/prec-vs-sole-proprietor-real-estate-agents-canada",
  datePublished: "2026-05-06",
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
    label: "CRA — Corporation tax rates (federal)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/corporation-tax-rates.html",
  },
  {
    id: 2,
    label:
      "CRA — Corporation tax rates (federal lower rate / small business deduction and general rate)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/corporation-tax-rates.html",
  },
  {
    id: 3,
    label:
      "CRA — Lines 12000 and 12010: Taxable amount of dividends (eligible and other than eligible) from taxable Canadian corporations",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12000-taxable-amount-dividends-eligible-other-than-eligible-taxable-canadian-corporations.html",
  },
  {
    id: 4,
    label:
      "Ontario — Trust in Real Estate Services Act, 2020 (TRESA, Bill 145)",
    url: "https://www.ola.org/en/legislative-business/bills/parliament-42/session-1/bill-145",
  },
  {
    id: 5,
    label:
      "CRA — Type of corporation (Canadian-controlled private corporation)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/type-corporation.html",
  },
  {
    id: 6,
    label: "CRA — T4001 Employer's Guide: Payroll Deductions and Remittances",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4001.html",
  },
  {
    id: 7,
    label:
      "CRA — Charge and collect the GST/HST: Which rate to charge (registration and rate-by-province overview)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html",
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
  { href: "#what-is-a-prec", label: "What a PREC is" },
  { href: "#commission-flow", label: "How commission flows differently" },
  { href: "#tax-deferral", label: "Tax deferral — the core mechanical benefit" },
  { href: "#salary-vs-dividend", label: "Salary vs dividend — two extraction methods" },
  { href: "#what-doesnt-change", label: "What doesn't change" },
  { href: "#setup-costs", label: "Setup and ongoing costs" },
  { href: "#tracking", label: "Tracking PREC income through the year" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PRECvsSoleProprietorPage() {
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
              <BookOpen className="h-3.5 w-3.5" />
              Guide for Canadian Real Estate Agents
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              PREC vs Sole Proprietor for Real Estate Agents in Canada
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              A Personal Real Estate Corporation (PREC) is now permitted in
              most Canadian provinces. The structure is mechanically different
              from sole proprietorship in three ways: how commission flows,
              how it is taxed, and how the agent draws money personally. This
              article describes the published mechanics of each, side by side,
              with no opinion on which structure fits any individual agent.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              9 min read · Updated for 2025 CRA rates
            </p>
          </div>
        </section>

        {/* ── Article body ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* Top disclaimer */}
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs leading-relaxed text-amber-700">
                <strong className="text-amber-800">General information only — not tax or legal advice.</strong>{" "}
                This article describes the published mechanics of Personal
                Real Estate Corporations and sole proprietorship as set out
                by the CRA and provincial real estate regulators. Tax and
                corporate rules change, and PREC eligibility depends on
                provincial legislation. Whether incorporation is appropriate
                for any individual agent is a question for a qualified
                accountant or tax lawyer familiar with the agent&apos;s province
                and personal financial position.{" "}
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
              <h2 id="what-is-a-prec">What a PREC is</h2>

              <p>
                A Personal Real Estate Corporation is a provincial corporation
                that holds a registered real estate agent&apos;s licence and
                receives the agent&apos;s commission income on behalf of the
                individual. The agent remains personally licensed with the
                provincial regulator; the corporation is the legal entity that
                contracts with the brokerage and receives the commission cheque.
              </p>

              <p>
                PREC eligibility is set province-by-province. Enabling
                legislation now exists in Ontario (under the Trust in Real
                Estate Services Act, 2020<CRACite id={4} />), British Columbia,
                Alberta, Saskatchewan, Manitoba, Nova Scotia, New Brunswick,
                and Newfoundland and Labrador. Each province sets its own
                requirements: who can be a shareholder, how the corporation
                is named, what the relationship between the agent and the
                brokerage looks like, and what the corporation may and may not
                do beyond receiving commissions. Provincial regulator rules
                are independent of the CRA tax mechanics described below.
              </p>

              <p>
                A PREC is, for federal tax purposes, a Canadian-controlled
                private corporation (CCPC) like any other small private
                company<CRACite id={5} />. The federal corporate-tax mechanics
                that apply to a small private business apply to a PREC in the
                same way.
              </p>

              <p>
                A sole proprietor real estate agent, by contrast, has no
                separate legal entity. Commission income flows directly to the
                individual and is reported as self-employment income on the
                T1 personal return at form T2125. There is no corporate filing,
                no corporate tax return, and no distinction between business
                income and personal income other than the deductible-expense
                line on T2125.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="commission-flow">How commission flows differently</h2>

              <p>
                The mechanical difference between the two structures shows up
                most plainly in how a single commission cheque is treated.
              </p>

              <h3>Sole proprietor</h3>

              <p>
                The brokerage pays the commission to the agent directly. The
                full amount lands as self-employment income in the agent&apos;s
                personal hands and is taxed in the year it is received at the
                agent&apos;s personal marginal rate — combined federal plus
                provincial. Allowable T2125 expenses reduce the taxable amount,
                but the after-expense net is taxed personally that same year,
                whether or not the agent actually spends it.
              </p>

              <h3>PREC</h3>

              <p>
                The brokerage pays the commission to the corporation. The
                amount enters the corporation as business revenue. The
                corporation pays its own tax on the after-expense net at the
                corporate rate — and only the portion the agent extracts to
                themselves personally (as salary or dividend) is taxed at
                personal rates that year. Amounts retained inside the
                corporation are taxed only at the corporate rate that year.
              </p>

              <p>
                The federal small business deduction reduces the corporate
                rate on the first $500,000 of active business income earned by
                a CCPC<CRACite id={2} />. Combined with provincial corporate
                rates, the effective rate on small-business-deduction-eligible
                income approximates 12% in many provinces (the exact figure
                depends on the province, since provincial corporate rates
                vary)<CRACite id={1} />. Income above the small business
                deduction limit, or that does not qualify, is taxed at the
                higher general corporate rate<CRACite id={1} />.
              </p>

              {/* ── Section 3 ── */}
              <h2 id="tax-deferral">Tax deferral — the core mechanical benefit</h2>

              <p>
                The structural feature most often cited as the reason for a
                PREC is <strong>tax deferral</strong>. Deferral is timing,
                not elimination. Income retained inside the corporation is
                taxed at the corporate rate that year; the personal tax owing
                on the remaining balance is deferred until the agent extracts
                the funds in a later year as salary or dividend. When extracted,
                the personal tax becomes payable. The total tax paid across
                corporate-then-personal layers approximates the tax that would
                have been paid as a sole proprietor in the year of earning —
                this is the principle of tax integration. The benefit is in
                the timing.
              </p>

              <h3>Worked example at $200,000 net business income</h3>

              <p>
                Consider an agent in a province where combined corporate
                small-business rate approximates 12% and combined personal
                marginal rate at $200,000 approximates 45%. Both figures are
                approximations — actual rates depend on the province and the
                agent&apos;s full income picture<CRACite id={1} />.
              </p>

              <p>
                <strong>As sole proprietor.</strong> The full $200,000 is
                taxed personally that year. Assume the agent personally needs
                $120,000 to live on. The full $200,000 is taxed regardless,
                producing approximately $90,000 in combined federal and
                provincial income tax (plus CPP — see the{" "}
                <Link
                  href="/self-employed-cpp-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  CPP guide
                </Link>
                ). Net of tax: approximately $110,000 — less than the $120,000
                living requirement, before CPP.
              </p>

              <p>
                <strong>As PREC, drawing $120,000 personally.</strong> The
                corporation earns $200,000. The agent draws $120,000 as
                salary or dividend; $80,000 is retained inside the corporation.
                The retained $80,000 is taxed at the corporate small-business
                rate (~12%, ~$9,600), leaving ~$70,400 inside the corporation.
                The $120,000 drawn is taxed personally — at lower brackets
                than the $200,000 sole-prop figure, since personal income is
                lower. The personal tax on the eventual extraction of the
                retained $70,400 is deferred until that extraction occurs.
              </p>

              <p>
                The deferred amount is the difference between the corporate
                rate paid this year and the personal rate that would have
                applied this year on the retained portion. At ~12% corporate
                versus ~45% personal on $80,000, the deferral approximates
                $26,000 of tax pushed into a future year. When that money is
                later extracted, additional personal tax becomes payable and
                the integration principle closes most of the gap. The
                permanent benefit is small; the timing benefit can be
                substantial when the retained funds are reinvested at a
                positive return.
              </p>

              <p>
                Whether deferral is valuable for any specific agent depends on
                whether the agent actually needs less than full earnings to
                live on, whether the retained funds will be reinvested
                productively, and the difference between this-year personal
                rate and future-year personal rate at extraction. These are
                situation-specific questions a qualified accountant addresses
                with the agent&apos;s full income picture.
              </p>

              {/* ── Section 4 ── */}
              <h2 id="salary-vs-dividend">Salary vs dividend — two extraction methods</h2>

              <p>
                Once income is inside the PREC, the agent extracts it
                personally through one of two mechanical paths — or a blend
                of the two. Each path has different tax treatment, different
                contribution-room consequences, and different cash-flow
                characteristics.
              </p>

              <h3>Salary</h3>

              <ul>
                <li>
                  <strong>Corporate side:</strong> Salary is a deductible
                  business expense to the corporation, reducing the
                  corporation&apos;s taxable income dollar-for-dollar.
                </li>
                <li>
                  <strong>Personal side:</strong> Salary is T4 employment
                  income, taxed at the agent&apos;s personal marginal rate.
                </li>
                <li>
                  <strong>RRSP room:</strong> Salary creates RRSP
                  contribution room (18% of earned income, subject to the
                  annual maximum).
                </li>
                <li>
                  <strong>CPP:</strong> CPP applies on T4 earnings up to the
                  yearly maximums. The corporation withholds and remits CPP
                  on the salary portion exactly as any employer would
                  <CRACite id={6} />.
                </li>
              </ul>

              <h3>Dividend</h3>

              <ul>
                <li>
                  <strong>Corporate side:</strong> Dividends are paid out of
                  after-corporate-tax retained earnings. They are not
                  deductible to the corporation.
                </li>
                <li>
                  <strong>Personal side:</strong> Dividends are taxed at the
                  personal level using the dividend gross-up and dividend tax
                  credit mechanics, which are designed to integrate with the
                  corporate tax already paid<CRACite id={3} />. Eligible
                  dividends and non-eligible (small-business-rate) dividends
                  are taxed at different rates.
                </li>
                <li>
                  <strong>RRSP room:</strong> Dividend income does not create
                  RRSP contribution room.
                </li>
                <li>
                  <strong>CPP:</strong> CPP does not apply to dividend
                  distributions. The agent does not contribute on the
                  dividend portion and does not accrue corresponding CPP
                  benefit on it.
                </li>
              </ul>

              <p>
                Most working PRECs use a <strong>blend</strong> of salary and
                dividend, calibrated to the agent&apos;s personal cash needs,
                target RRSP room, intended retirement structure, and the
                province&apos;s personal-vs-corporate rate differential. Neither
                salary nor dividend is universally better — the appropriate
                mix is a question for a qualified accountant who has the
                agent&apos;s complete personal financial picture.
              </p>

              {/* ── Section 5 ── */}
              <h2 id="what-doesnt-change">What doesn&apos;t change</h2>

              <p>
                Several elements of an agent&apos;s tax and regulatory situation
                are unchanged by the move from sole proprietor to PREC.
              </p>

              <ul>
                <li>
                  <strong>Provincial registration.</strong> The agent remains
                  personally registered with the provincial real estate
                  regulator. The PREC structure does not transfer the licence
                  to the corporation in a meaningful sense — the individual
                  agent continues to hold the registration and is personally
                  responsible for regulatory compliance.
                </li>
                <li>
                  <strong>HST/GST obligations.</strong> The entity that
                  receives commission income is the entity that registers for
                  HST/GST and collects the tax<CRACite id={7} />. Under a
                  PREC, the corporation is typically the registrant. The
                  registration threshold ($30,000 of taxable supplies in any
                  four-quarter period) and the obligation to charge, collect,
                  and remit HST/GST on commissions still apply<CRACite id={7} />.
                  The HST/GST mechanics are covered in the{" "}
                  <Link
                    href="/real-estate-agent-tax-planning-canada"
                    className="font-semibold text-blue-600 underline underline-offset-2"
                  >
                    tax planning guide
                  </Link>
                  .
                </li>
                <li>
                  <strong>Earned-income character.</strong> Commission income
                  flowing through a PREC is still active business income
                  earned by the agent&apos;s personal services. It is not
                  passive investment income.
                </li>
                <li>
                  <strong>Underlying brokerage relationship.</strong> The
                  agent&apos;s relationship with the brokerage continues — the
                  PREC is the contracting party for commission flow, but the
                  agent is the licensed individual conducting the trade.
                </li>
              </ul>

              {/* ── Cheat sheet inline CTA (between Sections 5 and 6) ── */}
              <div className="not-prose my-8">
                <EmailCapture
                  variant="light"
                  source="cheat_sheet_inline_prec-vs-sole-proprietor-real-estate-agents-canada"
                />
              </div>

              {/* ── Section 6 ── */}
              <h2 id="setup-costs">Setup and ongoing costs</h2>

              <p>
                Running a PREC involves both one-time and recurring costs that
                a sole proprietor does not incur. The cost categories below
                are described as cost categories — not as a threshold or a
                rule of thumb for when incorporation is or is not worthwhile.
                That question is situation-specific and is addressed by a
                qualified accountant with full visibility into the agent&apos;s
                income, draws, province, and long-term plans.
              </p>

              <h3>One-time setup</h3>

              <ul>
                <li>
                  <strong>Provincial incorporation.</strong> Filing fees and
                  the cost of preparing articles of incorporation that comply
                  with the province&apos;s PREC legislation. Most agents engage
                  a lawyer for this; some provinces require specific shareholder
                  and naming structures that benefit from legal review.
                </li>
                <li>
                  <strong>Initial tax setup.</strong> Registering the
                  corporation for a CRA business number, opening a corporate
                  HST/GST account, opening a corporate payroll account if
                  paying salary, and (where applicable) registering for
                  provincial corporate accounts.
                </li>
                <li>
                  <strong>Banking and brokerage transition.</strong> Opening a
                  corporate bank account and updating the brokerage agreement
                  so commission flows to the corporation rather than the
                  individual.
                </li>
              </ul>

              <h3>Ongoing</h3>

              <ul>
                <li>
                  <strong>Annual corporate tax return (T2).</strong>{" "}
                  Preparation of the federal T2 corporate return and any
                  required provincial corporate filings, typically prepared
                  by an accountant.
                </li>
                <li>
                  <strong>Bookkeeping.</strong> Corporate-grade bookkeeping
                  separated from personal finances. The corporation
                  maintains its own books, its own bank account, and a clear
                  record of inflows, outflows, and shareholder draws.
                </li>
                <li>
                  <strong>Payroll administration.</strong> If the corporation
                  pays salary to the agent, monthly source-deduction
                  remittances (CPP, income tax) are required<CRACite id={6} />.
                </li>
                <li>
                  <strong>Annual corporate filings.</strong> Provincial
                  corporate annual returns and, depending on province, ongoing
                  registration renewals with the real estate regulator that
                  cover the PREC structure.
                </li>
              </ul>

              <p>
                These costs offset the deferral benefit described in Section
                3. The size of the offset depends on the agent&apos;s actual
                accounting and legal fees and on how much is retained inside
                the corporation each year. Whether the offset still leaves a
                net benefit, and at what income level, is a question for a
                qualified accountant.
              </p>

              {/* ── Section 7 ── */}
              <h2 id="tracking">Tracking PREC income through the year</h2>

              <p>
                Whether income flows through a sole proprietorship or a PREC,
                tracking gross commission income (GCI) as deals close — and
                applying the appropriate tax treatment to each dollar — is
                what produces a real-time picture of the year&apos;s tax position.
                For sole proprietors, that picture is personal tax on net
                business income. For PREC operators, it is a layered picture:
                corporate tax on retained earnings plus personal tax on the
                draw portion.
              </p>

              <p>
                The free{" "}
                <Link
                  href="/tools/realtor-tax-estimator"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian Realtor Tax Estimator
                </Link>{" "}
                produces a sole-proprietor-mode estimate of federal and
                provincial income tax, CPP, and HST from a single GCI input.
                A PREC mode that breaks the projection into corporate and
                personal layers is on the roadmap — for now, agents operating
                under a PREC use the estimator for the underlying gross
                figures and apply the corporate-vs-personal split with their
                accountant.
              </p>

              <p>
                Inside Agent Runway, the dashboard&apos;s tax readiness card
                tracks the sole-proprietor estimate as deals close. The
                Flight Crew — Agent Runway&apos;s in-app AI — answers questions
                about how income, expenses, and tax estimates are tracked
                inside the product. Questions about which structure is
                appropriate for any individual agent, or how a PREC&apos;s salary
                and dividend mix is calibrated, sit outside the Flight
                Crew&apos;s scope and are handled by a qualified accountant or
                tax lawyer. The full Agent Runway feature set is described
                on the{" "}
                <Link
                  href="/features"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  features page
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
                Every quantitative or mechanical claim in this article is
                backed by one of the primary sources below. Hand-verified
                live on 2026-05-10.
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
              This article is for general information and planning awareness
              only — not financial, tax, or legal advice. PREC eligibility,
              corporate tax rates, dividend tax credit rates, and provincial
              regulator rules change. Whether incorporation is appropriate
              for any individual agent is a question for a qualified
              accountant or tax lawyer familiar with the agent&apos;s province
              and personal financial position. Agent Runway assumes no
              liability for tax filing or incorporation outcomes.{" "}
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
              Track GCI as it lands — sole prop or PREC.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway tracks gross commission income, deductible
              expenses, CPP, and tax estimates as deals close — so the
              underlying figures are ready for whichever structure the
              accountant settles on. Built for Canadian real estate agents.
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
                href="/real-estate-agent-tax-planning-canada"
                className="font-semibold text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                Read the tax planning guide →
              </Link>
            </p>
          </div>
        </section>

      </main>

      <MarketingFooter />
    </div>
  );
}
