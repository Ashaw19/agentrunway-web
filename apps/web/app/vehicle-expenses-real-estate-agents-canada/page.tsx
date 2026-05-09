import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "Vehicle Expenses for Canadian Real Estate Agents (2025) — Logbook, CCA, Lease Caps, and HST/GST Input Tax Credits",
  description:
    "How motor vehicle expenses work for self-employed Canadian real estate agents in 2025 — the CRA logbook rule, the simplified three-month base period, the 2025 Class 10.1 ceiling, the $1,100 lease cap and $350 interest cap, and the 90% \"all or substantially all\" GST/HST input-tax-credit threshold. Worked examples on Line 9281 of T2125.",
  keywords: [
    "vehicle expenses real estate agent canada",
    "realtor mileage deduction canada",
    "cra vehicle logbook",
    "class 10.1 ceiling 2025",
    "passenger vehicle lease cap canada",
    "gst hst itc 90% threshold",
    "t2125 line 9281 vehicle",
    "self-employed realtor car expenses",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/vehicle-expenses-real-estate-agents-canada",
    title:
      "Vehicle Expenses for Canadian Real Estate Agents (2025) — Logbook, CCA, Lease Caps, ITCs",
    description:
      "Self-employed real estate agents in Canada: how the 2025 vehicle deduction rules work — logbook, Class 10.1 ceiling, lease/interest caps, and the 90% GST/HST ITC threshold. CRA-cited.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/vehicle-expenses-real-estate-agents-canada",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "Vehicle Expenses for Canadian Real Estate Agents (2025) — Logbook, CCA, Lease Caps, and HST/GST Input Tax Credits",
  description:
    "How motor vehicle expenses work for self-employed Canadian real estate agents in 2025 — the CRA logbook rule, the simplified three-month base period, the 2025 Class 10.1 ceiling, the $1,100 lease cap and $350 interest cap, and the 90% \"all or substantially all\" GST/HST input-tax-credit threshold.",
  url: "/vehicle-expenses-real-estate-agents-canada",
  datePublished: "2026-05-09",
  dateModified: "2026-05-09",
});

// ─── CRA primary sources (audit registry) ─────────────────────────────────────
//
// Every numeric or mechanical claim in this article is backed by one of the
// URLs below. Inline citations are rendered via <CRACite id={n} />. URLs were
// hand-verified live on 2026-05-09.

const CRA_SOURCES = [
  {
    id: 1,
    label: "CRA — Motor vehicle expenses (self-employed)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/business-income-tax-reporting/business-expenses/motor-vehicle-expenses.html",
  },
  {
    id: 2,
    label: "CRA — Motor vehicle records (logbook requirements and simplified three-month base period)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/motor-vehicle-expenses/motor-vehicle-records.html",
  },
  {
    id: 3,
    label:
      "CRA — T4002 Self-employed Business, Professional, Commission, Farming, and Fishing Income — Chapter 4 Capital Cost Allowance",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-6.html",
  },
  {
    id: 4,
    label: "CRA — Capital cost allowance (CCA) classes (Class 10 and Class 10.1)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/claiming-capital-cost-allowance/classes.html",
  },
  {
    id: 5,
    label:
      "Department of Finance Canada — Government announces the 2025 automobile deduction limits and expense benefit rates for businesses",
    url: "https://www.canada.ca/en/department-finance/news/2024/12/government-announces-the-2025-automobile-deduction-limits-and-expense-benefit-rates-for-businesses.html",
  },
  {
    id: 6,
    label:
      "CRA — T2125 Statement of Business or Professional Activities (Line 9281 motor vehicle expenses)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html",
  },
  {
    id: 7,
    label:
      "CRA — Input tax credits — ITC eligibility percentage (the \"all or substantially all\" rule for individuals and partnerships)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit/calculate-eligibility-percentage.html",
  },
  {
    id: 8,
    label: "CRA — Input tax credits — methods to calculate the ITCs",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit/calculate-methods.html",
  },
  {
    id: 9,
    label:
      "CRA — Input tax credits — percentage of use in commercial activities",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit/calculate-percentage-use-commercial-activities.html",
  },
  {
    id: 10,
    label: "CRA — RC4022 General Information for GST/HST Registrants",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html",
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
  { href: "#the-formula", label: "The two-step formula CRA uses" },
  { href: "#logbook", label: "The logbook rule and the simplified three-month base period" },
  { href: "#eligible", label: "What CRA lists as eligible — and what it excludes" },
  { href: "#caps-2025", label: "The 2025 caps — Class 10.1 ceiling, lease cap, interest cap" },
  { href: "#class-10-vs-10-1", label: "Class 10 vs Class 10.1 — which one your vehicle falls in" },
  { href: "#hst-itc", label: "GST/HST input tax credits — the 90% threshold for sole proprietors" },
  { href: "#realtor-scenarios", label: "Realtor-specific scenarios" },
  { href: "#provincial", label: "Provincial nuances — HST rate, GST-only provinces, Quebec" },
  { href: "#tracking", label: "Tracking the deduction through the year" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VehicleExpensesRealEstateAgentsCanadaPage() {
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
              Vehicle Expenses for Canadian Real Estate Agents (2025)
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Showings, listing visits, brokerage stops, open-house drop-ins —
              the working day of a Canadian real estate agent runs on the
              vehicle. Vehicle expenses are also the single line on T2125
              the CRA scrutinizes most consistently. This article walks the
              published 2025 rules: the logbook expectation, the eligible
              expense list, the Class 10.1 ceiling, the lease and interest
              caps, and the 90% threshold that governs whether you can claim
              full GST/HST input tax credits on the vehicle.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              12 min read · Updated for 2025 CRA rates and Department of Finance
              automobile deduction limits
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
                This article describes published rules from the Canada Revenue
                Agency and the Department of Finance Canada. CCA ceilings,
                lease caps, and interest caps are reviewed annually and may
                change. Individual circumstances vary. Always verify current
                figures against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/business-income-tax-reporting/business-expenses/motor-vehicle-expenses.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA&apos;s motor vehicle expenses page
                </a>{" "}
                and consult a qualified accountant or tax professional before
                making a filing decision.{" "}
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
              <h2 id="the-formula">The two-step formula CRA uses</h2>

              <p>
                For a self-employed agent, the deductible portion of vehicle
                expenses is calculated in two steps. CRA states the structure
                this way<CRACite id={1} />:
              </p>

              <ol>
                <li>
                  Determine the <strong>business-use percentage</strong> of the
                  vehicle for the year — the kilometres driven for business
                  divided by the total kilometres driven.
                </li>
                <li>
                  Multiply that percentage by the <strong>total eligible
                  vehicle expenses</strong> incurred during the year (fuel,
                  insurance, maintenance, lease or interest, CCA, and so on).
                </li>
              </ol>

              <p>
                The result is the figure that flows to <strong>Line 9281
                (motor vehicle expenses)</strong> on T2125<CRACite id={6} />.
                Total expenses are tracked at 100%; the business-use ratio is
                applied at year-end. The two inputs — kilometres and
                expenses — are independent, and CRA expects supporting
                records for each.
              </p>

              <p>
                For the broader picture of every line on T2125 that applies to
                a Canadian real estate agent, see the{" "}
                <Link
                  href="/real-estate-agent-business-expenses-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  guide to real estate agent business expenses in Canada
                </Link>{" "}
                — vehicle is one line of nine, and this article is the
                deep-dive on Line 9281 specifically.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="logbook">
                The logbook rule and the simplified three-month base period
              </h2>

              <p>
                The kilometre split that drives the entire deduction has to
                come from somewhere. CRA&apos;s published expectation is a
                logbook<CRACite id={2} /> — a record of each business trip
                showing date, destination, purpose, and distance.
              </p>

              <h3>The full-year logbook</h3>

              <p>
                The default expectation is a <strong>full-year logbook</strong>
                {" "}— every business kilometre, every trip, recorded as it
                occurs<CRACite id={2} />. The full-year approach produces the
                cleanest record and the lowest audit-defence risk. For a
                working real estate agent, it accumulates dozens of entries a
                week — showings, listing presentations, photo appointments,
                inspections, brokerage stops.
              </p>

              <h3>The simplified three-month base period</h3>

              <p>
                CRA also publishes a simplified-logbook option<CRACite id={2} />.
                The structure works in two phases:
              </p>

              <ul>
                <li>
                  <strong>Year 1 — base year:</strong> a complete-year logbook
                  is maintained. The result is the agent&apos;s baseline annual
                  business-use percentage<CRACite id={2} />.
                </li>
                <li>
                  <strong>Subsequent years — three-month sample:</strong> the
                  agent maintains a representative three-month sample logbook,
                  and the calculated annual business-use percentage is the
                  base-year percentage adjusted by the ratio of the sample
                  period to the equivalent base-year period<CRACite id={2} />.
                  The formula CRA publishes is: (sample-period business % ÷
                  base-year same-period business %) × base-year annual % =
                  calculated annual business use.
                </li>
              </ul>

              <p>
                CRA states a critical condition on the simplified method: if
                the calculated annual business-use percentage in a later year
                varies from the base year by more than 10 percentage points
                (up or down), the base year is no longer treated as
                representative<CRACite id={2} />. In that situation, CRA
                states the sample-period logbook is reliable only for the
                three-month period in which it was kept — and a fresh
                full-year logbook may be needed to re-establish the baseline.
              </p>

              <p>
                For an agent whose business mix is stable year-over-year — same
                farm area, same client volume, same vehicle — the simplified
                method may match annual usage closely. For an agent whose
                business changes materially (new region, large team move, a
                shift in lead sources), the 10-point variance test may
                indicate a fresh full-year logbook would be more defensible.
              </p>

              {/* ── Section 3 ── */}
              <h2 id="eligible">
                What CRA lists as eligible — and what it excludes
              </h2>

              <p>
                CRA&apos;s published list of motor vehicle expenses eligible for
                deduction (subject to the business-use percentage) is the
                following<CRACite id={1} />:
              </p>

              <ul>
                <li><strong>Fuel</strong> (gasoline, propane, oil)</li>
                <li><strong>Maintenance and repairs</strong></li>
                <li>
                  <strong>Insurance</strong> on the vehicle
                </li>
                <li>
                  <strong>Licence and registration fees</strong>
                </li>
                <li>
                  <strong>Capital cost allowance (CCA)</strong> — depreciation
                  on a vehicle the agent owns
                </li>
                <li>
                  <strong>Eligible interest</strong> on money borrowed to buy
                  the vehicle (subject to the per-day cap covered below)
                </li>
                <li>
                  <strong>Eligible leasing costs</strong> on a leased vehicle
                  (subject to the per-month cap covered below)
                </li>
              </ul>

              <p>
                Two additional categories sit outside this list but are
                routinely deductible <em>in full</em> as separate business
                expenses (not subject to the business-use percentage), provided
                they are incurred for a business purpose:
              </p>

              <ul>
                <li>
                  <strong>Parking fees</strong> incurred at business
                  destinations (showings, client meetings, brokerage office
                  for a deal-related stop) — CRA treats parking as a separate
                  motor-vehicle-related expense rather than a portion of the
                  vehicle-use claim<CRACite id={1} />.
                </li>
                <li>
                  <strong>Supplementary business insurance</strong> — for
                  example, a commercial endorsement on the personal auto
                  policy obtained because the vehicle is used for business.
                </li>
              </ul>

              <h3>What CRA excludes</h3>

              <p>
                CRA states the following are <strong>not</strong> deductible
                as motor vehicle expenses:
              </p>

              <ul>
                <li>
                  <strong>Travel between home and a regular place of
                  business.</strong> CRA treats home-to-office travel as
                  personal commuting, even where the &quot;office&quot; is the
                  brokerage<CRACite id={1} />. For most agents, the brokerage
                  qualifies as a regular place of business; the kilometres
                  driven from home to the brokerage and back are not
                  deductible regardless of the business activity that occurred
                  there.
                </li>
                <li>
                  <strong>Personal trips and personal portions of mixed
                  trips.</strong> A trip that combines a listing visit and a
                  grocery run is not deductible end-to-end — only the portion
                  that is genuinely business.
                </li>
                <li>
                  <strong>Traffic violations, parking tickets, fines.</strong>{" "}
                  Fines are not deductible business expenses regardless of
                  context<CRACite id={1} />.
                </li>
              </ul>

              <p>
                The home-to-brokerage exclusion is the single most commonly
                misunderstood rule on this list. An agent who treats the
                brokerage commute as &quot;driving to a business meeting&quot; is
                applying a US framing — Canadian rules are different, and CRA
                reviewers may flag the pattern in audit.
              </p>

              {/* ── Section 4 ── */}
              <h2 id="caps-2025">
                The 2025 caps — Class 10.1 ceiling, lease cap, interest cap
              </h2>

              <p>
                CRA enforces three numerical limits on what a passenger
                vehicle&apos;s costs can deduct. The Department of Finance
                Canada publishes the figures annually; the 2025 figures apply
                to vehicles, leases, and loans entered into <strong>on or
                after January 1, 2025</strong><CRACite id={5} />:
              </p>

              <ul>
                <li>
                  <strong>Class 10.1 capital cost ceiling — $38,000
                  (before tax)</strong> for vehicles (new or used) acquired on
                  or after January 1, 2025<CRACite id={5} />. A vehicle that
                  costs more than $38,000 before GST/HST has its capital cost
                  capped at $38,000 for CCA purposes; the excess is not
                  deductible. The 2024 figure was $37,000<CRACite id={5} />.
                </li>
                <li>
                  <strong>Deductible leasing cost — $1,100 per month
                  (before tax)</strong> for new leases entered into on or
                  after January 1, 2025<CRACite id={5} />. Lease payments
                  above this amount per month are not deductible. The 2024
                  figure was $1,050<CRACite id={5} />.
                </li>
                <li>
                  <strong>Maximum allowable interest deduction — $350 per
                  month</strong> on new automobile loans entered into on or
                  after January 1, 2025<CRACite id={5} />. The $350 figure
                  remains unchanged from prior years<CRACite id={5} />.
                </li>
              </ul>

              <p>
                These three limits apply <em>in addition to</em> the
                business-use percentage. A leased vehicle at $1,400 per month,
                used 70% for business, deducts (cap of $1,100) × 70% =
                <strong> $770 per month</strong>, not (actual $1,400) × 70%.
                The cap binds first; the percentage applies second.
              </p>

              <p>
                The CCA ceiling on Class 10.1 is the same kind of mechanic.
                A vehicle purchased for $50,000 plus tax, used 70% for
                business, depreciates against a capped $38,000 cost base, not
                $50,000. The CCA rate for Class 10.1 is 30% declining-balance
                <CRACite id={4} />, with the half-year rule applying in the
                year of acquisition<CRACite id={3} />.
              </p>

              {/* ── Section 5 ── */}
              <h2 id="class-10-vs-10-1">
                Class 10 vs Class 10.1 — which one your vehicle falls in
              </h2>

              <p>
                Owned vehicles depreciate via CCA, and the depreciation class
                determines whether the $38,000 ceiling applies or not.
                CRA&apos;s rules<CRACite id={4} />:
              </p>

              <ul>
                <li>
                  <strong>Class 10</strong> — passenger vehicles costing
                  $38,000 or less (before tax) acquired in 2025, plus motor
                  vehicles that are not passenger vehicles (cargo vans,
                  pickup trucks meeting the loaded-bed test, taxis,
                  ride-share vehicles meeting the use test, and similar). CCA
                  rate: 30% declining-balance<CRACite id={4} />.
                </li>
                <li>
                  <strong>Class 10.1</strong> — passenger vehicles whose cost
                  exceeds the year&apos;s ceiling ($38,000 before tax for 2025
                  acquisitions). Each Class 10.1 vehicle is its own separate
                  class — meaning the recapture and terminal-loss rules apply
                  on a per-vehicle basis<CRACite id={3} />. CCA rate: 30%
                  declining-balance, applied to the capped cost
                  <CRACite id={4} />.
                </li>
              </ul>

              <p>
                The practical line: for the typical 4- or 5-seat sedan, SUV,
                or crossover used in real estate work, the vehicle is a
                <em> passenger vehicle</em> in CRA terminology<CRACite id={4} />.
                If it cost $38,000 or less before tax, it goes in Class 10.
                If it cost more, it goes in Class 10.1 with the capped
                base. A pickup truck used to move signs and staging
                materials may meet CRA&apos;s test for a non-passenger motor
                vehicle and stay in Class 10 regardless of cost — the test
                is published in CRA&apos;s class definitions and is
                circumstance-specific<CRACite id={4} />.
              </p>

              {/* ── Section 6 ── */}
              <h2 id="hst-itc">
                GST/HST input tax credits — the 90% threshold for sole proprietors
              </h2>

              <p>
                A real estate agent who is registered for GST/HST (typically
                because their gross taxable revenue from the last four
                consecutive calendar quarters exceeded $30,000<CRACite id={10} />)
                may claim input tax credits (ITCs) on the GST/HST paid on
                vehicle expenses. The size of the ITC depends on a published
                threshold mechanic that is materially different for
                individuals and partnerships than it is for corporations.
              </p>

              <h3>The &quot;all or substantially all&quot; rule</h3>

              <p>
                For an individual or a partnership — which describes most
                self-employed Canadian real estate agents — CRA states that
                the ITC eligibility on a passenger vehicle is determined by
                whether the vehicle is acquired for use <strong>all or
                substantially all (90% or more) in commercial activities
                </strong><CRACite id={7} />:
              </p>

              <ul>
                <li>
                  <strong>≥ 90% commercial use:</strong> the registrant may
                  claim 100% of the GST/HST paid as an ITC, subject to the
                  capital cost limitation discussed below<CRACite id={7} />
                  <CRACite id={9} />.
                </li>
                <li>
                  <strong>Less than 90% commercial use:</strong> the
                  passenger-vehicle ITC for individuals and partnerships
                  is determined by a different mechanic — the ITC is based
                  on the CCA claimed for the year, calculated using a
                  prescribed tax fraction<CRACite id={7} /><CRACite id={9} />.
                  This is the published treatment that distinguishes
                  individuals and partnerships from corporations, which use a
                  proportional ITC method.
                </li>
              </ul>

              <p>
                In plain terms: for a sole-proprietor agent, if the vehicle is
                used overwhelmingly for business (90%+), the GST/HST paid is
                generally fully recoverable through the ITC. If the vehicle
                is used substantially but not overwhelmingly for business
                (say 60–80%), the ITC mechanic switches and CRA&apos;s
                published method ties the ITC to the year&apos;s CCA claim
                rather than to the percentage of expenses<CRACite id={7} />.
                The mechanic is technical, and an accountant familiar with
                GST/HST registrant rules is the appropriate person to apply
                it to a specific situation.
              </p>

              <h3>The capital cost limitation on ITCs</h3>

              <p>
                The Class 10.1 ceiling discussed in section 4 also constrains
                the GST/HST ITC. CRA states that ITCs cannot be claimed on
                the portion of a passenger vehicle&apos;s cost exceeding the
                year&apos;s capital cost limitation<CRACite id={9} /> —
                $38,000 (before tax) for 2025 acquisitions<CRACite id={5} />.
                A vehicle purchased for $50,000 plus HST has its ITC computed
                against $38,000 of cost base, not $50,000.
              </p>

              <h3>Operating expenses (fuel, maintenance, insurance, parking)</h3>

              <p>
                For ITCs on operating expenses (fuel, maintenance, repairs,
                paid parking, and so on), the standard ITC calculation
                methods apply<CRACite id={8} /> — the registrant determines
                the percentage of use in commercial activities and claims
                the ITC against that percentage. CRA also publishes
                simplified ITC methods for small businesses meeting eligibility
                criteria<CRACite id={8} />.
              </p>

              {/* ── Cheat sheet inline CTA ── */}
              <div className="not-prose my-8">
                <EmailCapture
                  heading="Get the Canadian Realtor Tax Cheat Sheet"
                  subheading="Every 2025 bracket, CPP rate, GST/HST threshold, and deadline on one printable page — CRA-cited. We'll email it to you."
                  ctaLabel="Email me the cheat sheet"
                  source="cheat_sheet_inline_vehicle-expenses-real-estate-agents-canada"
                  variant="light"
                />
              </div>

              {/* ── Section 7 ── */}
              <h2 id="realtor-scenarios">Realtor-specific scenarios</h2>

              <p>
                The published rules apply to every self-employed taxpayer in
                Canada, but the day-to-day patterns of a working real estate
                agent produce a few recurring scenarios where the rules
                interact unusually. Each item below describes how CRA&apos;s
                rules apply — not what an agent &quot;should&quot; do, which is
                a conversation for the accountant.
              </p>

              <h3>Property showings and listing visits</h3>

              <p>
                Travel from a business location (the brokerage, a previous
                client meeting, a previous showing) to a showing or listing
                visit is travel between business activities and is treated as
                business use<CRACite id={1} />. The destination address, time,
                and client purpose belong in the logbook entry.
              </p>

              <h3>Open houses</h3>

              <p>
                Travel to an open house the agent is hosting is business use.
                Travel to a competing open house the agent is touring as
                research is also business use, provided the purpose is
                documented (market research, comparable assessment).
                Recreational drop-ins to open houses with no documented
                business purpose do not meet the test.
              </p>

              <h3>The brokerage commute</h3>

              <p>
                As covered in section 3, CRA treats home-to-brokerage and
                brokerage-to-home travel as personal commuting<CRACite id={1} />.
                The kilometres are not business kilometres, even on a day
                where every other trip from the brokerage is business. An
                agent whose home is also their principal place of business
                may have a different fact pattern — the home-office
                designation interacts with the commute rule in a way that
                accountants resolve case-by-case based on the published home
                business test.
              </p>

              <h3>Combined business-and-personal trips</h3>

              <p>
                A trip that runs a listing visit, a grocery stop, and a kid
                pickup is not 100% business. CRA&apos;s rule applies on a
                per-trip kilometre basis<CRACite id={1} />: the
                listing-visit kilometres are business, the grocery and
                pickup kilometres are personal. The logbook entry would
                reflect only the business segment of the trip.
              </p>

              <h3>Multiple vehicles</h3>

              <p>
                An agent with two vehicles in the household — one used
                primarily for business, one used primarily for personal — may
                track each separately. CRA&apos;s expectation is that
                <em> each vehicle</em> has its own logbook and its own
                business-use percentage<CRACite id={2} />. Aggregating
                kilometres across vehicles is not a published method.
              </p>

              <h3>Vehicle wraps and signage</h3>

              <p>
                Vehicle wraps and signage advertising the agent&apos;s
                business are advertising expenses (deductible at 100% on T2125
                Line 8521<CRACite id={6} />) rather than vehicle expenses on
                Line 9281. The wrap does not change the business-use
                percentage of the vehicle itself — driving the wrapped
                vehicle to a personal errand is still personal kilometres,
                regardless of the visible advertising.
              </p>

              {/* ── Section 8 ── */}
              <h2 id="provincial">
                Provincial nuances — HST rate, GST-only provinces, Quebec
              </h2>

              <p>
                The federal mechanics described above apply uniformly across
                Canada. The GST/HST rate that determines the dollar amount of
                the ITC, however, varies by province:
              </p>

              <ul>
                <li>
                  <strong>HST provinces (15%):</strong> New Brunswick, Nova
                  Scotia, Prince Edward Island, Newfoundland and Labrador.
                  ITCs on eligible vehicle expenses recover 15 cents on the
                  dollar of HST paid.
                </li>
                <li>
                  <strong>HST province (13%):</strong> Ontario. ITCs recover
                  13 cents on the dollar.
                </li>
                <li>
                  <strong>GST-only provinces (5%):</strong> British Columbia,
                  Alberta, Saskatchewan, Manitoba, Yukon, Northwest
                  Territories, Nunavut. ITCs recover 5 cents on the dollar of
                  GST paid; provincial sales tax (where applicable, e.g. PST
                  in BC, Saskatchewan, Manitoba) is not recoverable through
                  GST ITCs.
                </li>
              </ul>

              <p>
                For the broader picture of HST/GST registration mechanics —
                including the $30,000 small-supplier threshold, ITC eligibility
                generally, and filing-frequency rules — see the{" "}
                <Link
                  href="/real-estate-agent-hst-registration-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  HST/GST registration guide for Canadian real estate agents
                </Link>.
              </p>

              <h3>Quebec — QST and the Agent Runway geo-block</h3>

              <p>
                Quebec administers its own Quebec Sales Tax (QST) alongside
                GST. Vehicle-expense rules in Quebec have additional QST
                mechanics overlaid on the federal rules described above, and
                Revenu Québec is the administering authority. Agent Runway is
                currently geo-blocked from Quebec pending Law 25 compliance
                work and French translation; this article does not cover
                QST-specific mechanics. Quebec agents are referred to Revenu
                Québec&apos;s published guidance and a Quebec-licensed
                accountant.
              </p>

              {/* ── Section 9 ── */}
              <h2 id="tracking">Tracking the deduction through the year</h2>

              <p>
                An agent who reconstructs vehicle expenses at year-end faces
                two problems: the receipts may be incomplete, and the
                kilometre log may not exist at the level of detail CRA&apos;s
                logbook rule indicates. Tracking the deduction through the
                year — receipts captured as they occur, kilometres logged
                against trips as they happen — produces a reconstructible
                record that aligns with CRA&apos;s expectation.
              </p>

              <p>
                Agent Runway&apos;s expense model maps to T2125 Line 9281 for
                vehicle expenses, with separate sub-fields for fuel,
                insurance, maintenance, lease/interest, and CCA. The
                business-use percentage applied to the year&apos;s expenses is
                surfaced as a configurable input on the dashboard&apos;s tax
                readiness card; changing the percentage updates the estimated
                deductible portion in real time. The estimate produced is
                informational — the figure that ultimately appears on T2125
                is the figure the agent and their accountant agree on at
                filing time.
              </p>

              <p>
                The free{" "}
                <Link
                  href="/tools/realtor-tax-estimator"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian Realtor Tax Estimator
                </Link>{" "}
                accepts vehicle expenses with a business-use percentage and
                shows the impact on the estimated tax owing, alongside the
                CPP, federal, and provincial figures. It uses the same engine
                that drives the in-app dashboard.
              </p>

              <p>
                For the line-by-line context of how Line 9281 fits among the
                other T2125 lines, see the{" "}
                <Link
                  href="/t2125-guide-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  T2125 guide for Canadian real estate agents
                </Link>.
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
                live on 2026-05-09.
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
              only — not financial, tax, or professional advice. Vehicle
              deduction limits, lease caps, and interest caps are reviewed
              annually by the Department of Finance Canada and may change.
              GST/HST input tax credit rules for individuals and partnerships
              are technical and circumstance-specific. Always verify current
              figures with the CRA and consult a qualified accountant or tax
              professional. Agent Runway assumes no liability for tax filing
              outcomes.{" "}
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
              See your estimated vehicle deduction as your year unfolds.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway tracks vehicle expenses against T2125 Line 9281 and
              applies your business-use percentage to estimate the deductible
              portion alongside your federal, provincial, CPP, and HST
              estimates. Built for Canadian real estate agents.
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
