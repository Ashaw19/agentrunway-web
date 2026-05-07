import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "Provincial Income Tax for Real Estate Agents in New Brunswick, Nova Scotia, and Prince Edward Island (2025)",
  description:
    "The 2025 provincial income tax brackets and rates for NB, NS, and PEI — what self-employed real estate agents in Atlantic Canada pay on top of federal tax.",
  keywords: [
    "new brunswick income tax brackets 2025",
    "nova scotia income tax brackets 2025",
    "prince edward island income tax brackets 2025",
    "atlantic canada real estate agent tax",
    "maritime provincial tax rates realtor",
    "self employed agent provincial tax",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/real-estate-agent-tax-rates-nb-ns-pei",
    title:
      "Provincial Income Tax for Real Estate Agents in NB, NS, and PEI (2025)",
    description:
      "The 2025 provincial income tax brackets for self-employed real estate agents in New Brunswick, Nova Scotia, and Prince Edward Island.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/real-estate-agent-tax-rates-nb-ns-pei",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "Provincial Income Tax for Real Estate Agents in New Brunswick, Nova Scotia, and Prince Edward Island (2025)",
  description:
    "The 2025 provincial income tax brackets and rates for NB, NS, and PEI — what self-employed real estate agents in Atlantic Canada pay on top of federal tax.",
  url: "/real-estate-agent-tax-rates-nb-ns-pei",
  datePublished: "2026-05-06",
  dateModified: "2026-05-06",
});

// ─── CRA / provincial primary sources (audit registry) ────────────────────────
//
// Every numeric bracket figure in this article is backed by one of the URLs
// below. Inline citations are rendered via <CRACite id={n} />. URLs were
// hand-verified live on 2026-05-06.
//
// Note: New Brunswick's Department of Finance personal-income-tax page
// (https://www2.gnb.ca/content/gnb/en/departments/finance/taxes/personal_income_tax.html)
// returned a 404 on 2026-05-06. The CRA Form 5004-PC is the substituted
// primary citation for NB. Nova Scotia's legacy taxation page now redirects
// to beta.novascotia.ca; both the redirected page and the CRA's
// nova-scotia.html provincial package are cited. PEI's finance page bot-walls
// curl traffic but resolves in a browser, so we cite both PEI Finance and
// the CRA Form 5002-PC.

const CRA_SOURCES = [
  {
    id: 1,
    label: "CRA — Tax rates and income brackets for individuals (current and previous years)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html",
  },
  {
    id: 2,
    label: "CRA — Form 5004-PC: New Brunswick tax information for 2025",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/new-brunswick.html",
  },
  {
    id: 3,
    label: "CRA — Form 5003-PC: Nova Scotia tax information for 2025",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/nova-scotia.html",
  },
  {
    id: 4,
    label: "CRA — Form 5002-PC: Prince Edward Island tax information for 2025",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/prince-edward-island.html",
  },
  {
    id: 5,
    label: "Government of New Brunswick — Department of Finance and Treasury Board (Taxes)",
    url: "https://www2.gnb.ca/content/gnb/en/departments/finance/taxes.html",
  },
  {
    id: 6,
    label: "Government of Nova Scotia — Personal income tax rates and indexation",
    url: "https://beta.novascotia.ca/programs-and-services/taxation",
  },
  {
    id: 7,
    label: "Government of Prince Edward Island — Personal Income Tax",
    url: "https://www.princeedwardisland.ca/en/information/finance/pei-personal-income-tax",
  },
  {
    id: 8,
    label: "CRA — T2125 Statement of Business or Professional Activities",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html",
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
  { href: "#how-provincial-stacks", label: "How provincial income tax stacks for self-employed agents" },
  { href: "#nb-brackets", label: "New Brunswick — 2025 brackets" },
  { href: "#ns-brackets", label: "Nova Scotia — 2025 brackets" },
  { href: "#pei-brackets", label: "Prince Edward Island — 2025 brackets" },
  { href: "#combined-marginal", label: "Combined federal + provincial marginal rates at $80K, $120K, $200K" },
  { href: "#runway", label: "Where the Agent Runway estimator and Flight Crew fit in" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MaritimeProvincialTaxRatesPage() {
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
              Guide for Atlantic Canada Real Estate Agents
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Provincial Income Tax for Real Estate Agents in New Brunswick, Nova Scotia, and Prince Edward Island (2025)
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Provincial income tax is the second of two tax stacks a self-employed
              Maritime real estate agent pays — federal tax sits on top of one rate
              ladder, and the agent&apos;s home province sits on top of another.
              This article publishes the verified 2025 brackets for New Brunswick,
              Nova Scotia, and Prince Edward Island, with combined federal-plus-provincial
              marginal rates at three income levels common to working agents in the region.
            </p>
            <p className="mt-3 text-xs text-slate-500">8 min read · Updated for 2025 CRA rates</p>
          </div>
        </section>

        {/* ── Article body ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* Top disclaimer */}
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs leading-relaxed text-amber-700">
                <strong className="text-amber-800">General information only — not tax advice.</strong>{" "}
                This article describes published provincial income tax brackets for
                New Brunswick, Nova Scotia, and Prince Edward Island as set out by
                the Canada Revenue Agency and the respective provincial finance
                departments. Provincial brackets are indexed annually and may change.
                Individual circumstances vary. Always verify current rates against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA&apos;s published brackets
                </a>{" "}
                and consult a qualified accountant or tax professional for your own
                situation.{" "}
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
              <h2 id="how-provincial-stacks">
                How provincial income tax stacks for self-employed agents
              </h2>

              <p>
                A Canadian real estate agent operating as a self-employed sole
                proprietor — the structure most working agents in Atlantic Canada
                file under — calculates one figure for net business income on Form
                T2125<CRACite id={8} />, and that single figure feeds two parallel
                tax calculations on the T1 return: federal income tax and provincial
                income tax.
              </p>

              <p>
                The two stacks share the same starting point. After deductible
                expenses are subtracted from gross commissions on T2125, the resulting
                net business income flows into the T1&apos;s line 26000 (taxable
                income), with each province&apos;s bracket schedule applied separately
                from the federal schedule<CRACite id={1} />. There is no separate
                provincial filing for residents of NB, NS, or PEI — the CRA
                administers personal income tax on behalf of all three provinces and
                computes both stacks on the same return.
              </p>

              <p>
                Each province publishes its own bracket thresholds and percentage
                rates, indexed annually. The combined marginal rate at any given
                taxable-income level is the sum of the federal marginal rate at
                that level plus the provincial marginal rate at that level. Because
                the two ladders have different bracket boundaries, the combined
                marginal rate steps up at every threshold either ladder crosses.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="nb-brackets">New Brunswick — 2025 brackets</h2>

              <p>
                New Brunswick has four provincial income tax brackets in 2025
                <CRACite id={2} />. The bracket thresholds were indexed for 2025
                and the percentage rates are unchanged from 2024:
              </p>

              <ul>
                <li>
                  <strong>9.40%</strong> on the first $51,306 of taxable income
                  <CRACite id={2} /><CRACite id={5} />
                </li>
                <li>
                  <strong>14.00%</strong> on taxable income over $51,306 up to
                  $102,614<CRACite id={2} />
                </li>
                <li>
                  <strong>16.00%</strong> on taxable income over $102,614 up to
                  $190,060<CRACite id={2} />
                </li>
                <li>
                  <strong>19.50%</strong> on taxable income over $190,060
                  <CRACite id={2} />
                </li>
              </ul>

              <p>
                The New Brunswick provincial basic personal amount for 2025 is
                $13,396<CRACite id={2} />, claimed as a non-refundable credit at
                the lowest-bracket rate (9.40%) — meaning it shelters the first
                $13,396 of taxable income from provincial tax for most filers.
                The federal basic personal amount, which is separate and stacks
                on top, is set at the maximum of $16,129 for 2025<CRACite id={1} />.
              </p>

              {/* ── Section 3 ── */}
              <h2 id="ns-brackets">Nova Scotia — 2025 brackets</h2>

              <p>
                Nova Scotia has five provincial income tax brackets in 2025
                <CRACite id={3} />. 2025 was the first year Nova Scotia applied
                annual indexing to its bracket thresholds — the indexation factor
                for 2025 was 3.1% — after a long stretch of frozen brackets
                <CRACite id={6} />:
              </p>

              <ul>
                <li>
                  <strong>8.79%</strong> on the first $30,507 of taxable income
                  <CRACite id={3} /><CRACite id={6} />
                </li>
                <li>
                  <strong>14.95%</strong> on taxable income over $30,507 up to
                  $61,015<CRACite id={3} />
                </li>
                <li>
                  <strong>16.67%</strong> on taxable income over $61,015 up to
                  $95,883<CRACite id={3} />
                </li>
                <li>
                  <strong>17.50%</strong> on taxable income over $95,883 up to
                  $154,650<CRACite id={3} />
                </li>
                <li>
                  <strong>21.00%</strong> on taxable income over $154,650
                  <CRACite id={3} />
                </li>
              </ul>

              <p>
                Nova Scotia&apos;s top provincial marginal rate of 21.00% is the
                highest published top rate among the three Maritime provinces.
                The province&apos;s 2025 basic personal amount is $11,744 at the
                maximum, decreasing as taxable income rises<CRACite id={6} />.
              </p>

              {/* ── Section 4 ── */}
              <h2 id="pei-brackets">Prince Edward Island — 2025 brackets</h2>

              <p>
                Prince Edward Island restructured its provincial income tax in
                2025 — moving from three brackets to five and lowering the
                bottom-bracket rate from 9.65% (the 2024 rate) to 9.50%
                <CRACite id={4} /><CRACite id={7} />. The 2025 PEI brackets are:
              </p>

              <ul>
                <li>
                  <strong>9.50%</strong> on the first $33,328 of taxable income
                  <CRACite id={4} /><CRACite id={7} />
                </li>
                <li>
                  <strong>13.47%</strong> on taxable income over $33,328 up to
                  $64,656<CRACite id={4} />
                </li>
                <li>
                  <strong>16.60%</strong> on taxable income over $64,656 up to
                  $105,000<CRACite id={4} />
                </li>
                <li>
                  <strong>17.62%</strong> on taxable income over $105,000 up to
                  $140,000<CRACite id={4} />
                </li>
                <li>
                  <strong>19.00%</strong> on taxable income over $140,000
                  <CRACite id={4} />
                </li>
              </ul>

              <p>
                PEI&apos;s historical 10% surtax on provincial tax exceeding
                $12,500 was eliminated for the 2024 and subsequent tax years and
                does not apply in 2025<CRACite id={7} />. The 2025 PEI basic
                personal amount is $14,650<CRACite id={4} />.
              </p>

              {/* ── Cheat sheet inline CTA ── */}
              <div className="not-prose my-8">
                <EmailCapture
                  heading="Get the Canadian Realtor Tax Cheat Sheet"
                  subheading="Every 2025 federal and provincial bracket, CPP rate, GST/HST threshold, and deadline on one printable page — CRA-cited. We'll email it to you."
                  ctaLabel="Email me the cheat sheet"
                  source="cheat_sheet_inline_real-estate-agent-tax-rates-nb-ns-pei"
                  variant="light"
                />
              </div>

              {/* ── Section 5 ── */}
              <h2 id="combined-marginal">
                Combined federal + provincial marginal rates at $80K, $120K, $200K
              </h2>

              <p>
                A combined marginal tax rate is the sum of the federal marginal
                rate and the provincial marginal rate at a given level of taxable
                income. It describes the rate that would apply to the next dollar
                earned at that income level — not the rate applied to total
                taxable income (which is the average rate, a different figure).
                The 2025 federal brackets are 15.00% to $57,375, 20.50% to
                $114,750, 26.00% to $177,882, 29.00% to $253,414, and 33.00%
                above $253,414<CRACite id={1} />.
              </p>

              <p>
                The figures below pair the published federal and provincial
                bracket schedules at three taxable-income levels typical of
                working real estate agents in Atlantic Canada. They describe the
                marginal rate that would apply to each province&apos;s next dollar
                of taxable income at the stated level.
              </p>

              <h3>$80,000 taxable income (2025)</h3>

              <ul>
                <li>
                  Federal marginal rate at $80K: <strong>20.50%</strong> (the
                  20.50% bracket runs from $57,375 to $114,750)<CRACite id={1} />
                </li>
                <li>
                  <strong>New Brunswick:</strong> 20.50% federal + 14.00%
                  provincial = <strong>34.50%</strong> combined marginal
                  <CRACite id={2} />
                </li>
                <li>
                  <strong>Nova Scotia:</strong> 20.50% federal + 16.67%
                  provincial = <strong>37.17%</strong> combined marginal
                  <CRACite id={3} />
                </li>
                <li>
                  <strong>Prince Edward Island:</strong> 20.50% federal + 16.60%
                  provincial = <strong>37.10%</strong> combined marginal
                  <CRACite id={4} />
                </li>
              </ul>

              <h3>$120,000 taxable income (2025)</h3>

              <ul>
                <li>
                  Federal marginal rate at $120K: <strong>26.00%</strong> (the
                  26.00% bracket runs from $114,750 to $177,882)<CRACite id={1} />
                </li>
                <li>
                  <strong>New Brunswick:</strong> 26.00% federal + 16.00%
                  provincial = <strong>42.00%</strong> combined marginal
                  <CRACite id={2} />
                </li>
                <li>
                  <strong>Nova Scotia:</strong> 26.00% federal + 17.50%
                  provincial = <strong>43.50%</strong> combined marginal
                  <CRACite id={3} />
                </li>
                <li>
                  <strong>Prince Edward Island:</strong> 26.00% federal + 17.62%
                  provincial = <strong>43.62%</strong> combined marginal
                  <CRACite id={4} />
                </li>
              </ul>

              <h3>$200,000 taxable income (2025)</h3>

              <ul>
                <li>
                  Federal marginal rate at $200K: <strong>29.00%</strong> (the
                  29.00% bracket runs from $177,882 to $253,414)<CRACite id={1} />
                </li>
                <li>
                  <strong>New Brunswick:</strong> 29.00% federal + 19.50%
                  provincial = <strong>48.50%</strong> combined marginal
                  <CRACite id={2} />
                </li>
                <li>
                  <strong>Nova Scotia:</strong> 29.00% federal + 21.00%
                  provincial = <strong>50.00%</strong> combined marginal
                  <CRACite id={3} />
                </li>
                <li>
                  <strong>Prince Edward Island:</strong> 29.00% federal + 19.00%
                  provincial = <strong>48.00%</strong> combined marginal
                  <CRACite id={4} />
                </li>
              </ul>

              <p>
                Two structural patterns emerge from the published figures. First,
                Nova Scotia sits at the top of the Maritime combined-marginal-rate
                ladder at every income level above approximately $61,015 — a
                consequence of NS&apos;s higher provincial-bracket rates from
                14.95% upward. Second, New Brunswick&apos;s mid-range brackets
                (14.00% on the $51,306–$102,614 band) produce the lowest combined
                marginal rate among the three provinces in the $80K range, while
                PEI&apos;s broader $33,328–$64,656 13.47% band and the new
                $64,656–$105,000 16.60% band produce a marginal-rate profile that
                sits between NB and NS through most of the working-agent income
                range.
              </p>

              <p>
                For a deeper read on how the combined federal-plus-provincial
                stack interacts with CPP contributions, instalment thresholds,
                and net-business-income mechanics, see the{" "}
                <Link
                  href="/real-estate-agent-tax-planning-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  tax planning guide for Canadian real estate agents
                </Link>{" "}
                and the{" "}
                <Link
                  href="/self-employed-cpp-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  self-employed CPP article
                </Link>
                .
              </p>

              {/* ── Section 6 ── */}
              <h2 id="runway">
                Where the Agent Runway estimator and Flight Crew fit in
              </h2>

              <p>
                Agent Runway&apos;s tax engine implements the 2025 federal and
                provincial bracket schedules for all three Maritime provinces
                directly. The same engine powers two surfaces a Maritime agent
                will encounter:
              </p>

              <ul>
                <li>
                  The free, no-login{" "}
                  <Link
                    href="/tools/realtor-tax-estimator"
                    className="font-semibold text-blue-600 underline underline-offset-2"
                  >
                    Canadian Realtor Tax Estimator
                  </Link>{" "}
                  — produces a federal + provincial + CPP estimate from a single
                  GCI input. NB, NS, and PEI are selectable provinces; the
                  estimator applies the 2025 brackets published above.
                </li>
                <li>
                  The in-app dashboard tax readiness card, which projects a
                  running federal + provincial estimate as commissions and
                  expenses accumulate through the year.
                </li>
              </ul>

              <p>
                Provincial-tax questions that surface inside the app are
                answered by the Flight Crew&apos;s Navigator persona, which
                operates against the same 2025 published bracket schedules and
                cites primary CRA and provincial finance sources rather than
                producing strategic recommendations. Navigator returns figures
                and rule descriptions; filing decisions belong to the agent and
                the agent&apos;s accountant.
              </p>

              <p>
                Agent Runway is built in Saint John, New Brunswick. The Maritime
                provinces are the home market for the product, and the
                provincial bracket schedules above are the schedules the team
                applies to its own books.
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
                2026-05-06.
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
              This article is for general information and planning awareness only — not financial,
              tax, or professional advice. Provincial brackets are indexed annually and individual
              circumstances vary. Always verify current rates with the CRA or your provincial
              finance department, and consult a qualified accountant or tax professional. Agent
              Runway assumes no liability for tax filing outcomes.{" "}
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
              See your federal and Maritime provincial tax estimate as your year unfolds.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway estimates federal income tax, provincial income tax for NB, NS, and
              PEI, and self-employed CPP from your live transaction data — so the figure you owe
              in April is the figure you&apos;ve been watching since January. Built in Saint John,
              for Atlantic Canadian real estate agents.
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
