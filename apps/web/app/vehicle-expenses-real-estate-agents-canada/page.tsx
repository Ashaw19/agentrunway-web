import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";
import {
  CRA_MOTOR_VEHICLE_SOURCES,
  GST_RATE_GROUP,
  HST_RATE_GROUPS,
  MULTIPLE_VEHICLES_RULE,
  SIMPLIFIED_LOGBOOK_EXAMPLE,
  SIMPLIFIED_LOGBOOK_FORMULA,
  SIMPLIFIED_LOGBOOK_OUTSIDE_RANGE_RULE,
  SIMPLIFIED_LOGBOOK_RANGE_RULE,
  SIMPLIFIED_LOGBOOK_RULE,
  VEHICLE_BUSINESS_PART_RULE,
  VEHICLE_FULL_DEDUCTION_RULE,
  VEHICLE_LOGBOOK_RETENTION_RULE,
  VEHICLE_LOGBOOK_RULE,
  latestAutomobileLimits,
} from "@agent-runway/core/tax-copy";

// Reviewed against CRA and Department of Finance pages on 2026-10-21 (the
// follow-up from #365; see lib/__tests__/vehicle-article-cra.test.ts). The
// limits print from AUTOMOBILE_LIMITS and CRA's logbook wording from the
// shared rules: neither is typed here.

const { current: LIMITS, previous: PREVIOUS } = latestAutomobileLimits();
const YEAR = LIMITS.year;
const money = (n: number) => `$${n.toLocaleString("en-CA")}`;

/** "15/115" for 15% HST: the fraction RC4022 applies to CCA for a vehicle's ITC. */
const taxFactor = (rate: number) => {
  const pct = Math.round(rate * 100);
  return `${pct}/${100 + pct}`;
};

const TITLE = `Vehicle Expenses for Canadian Real Estate Agents (${YEAR}): Logbook, CCA, Leasing and Interest Limits, GST/HST Input Tax Credits`;
const DESCRIPTION =
  `How motor vehicle expenses work for self-employed Canadian real estate agents: CRA's logbook and its simplified logbook ` +
  `(a 12-month base year, then three-month samples), what goes on T2125 line 9281 and what goes on line 9936, ` +
  `the ${YEAR} limits (Class 10.1 ceiling ${money(LIMITS.ccaCeiling)}, leasing ${money(LIMITS.leasePerMonth)} a month, ` +
  `interest ${money(LIMITS.interestPerMonth)} a month) and the 90% rule for GST/HST input tax credits on a passenger vehicle.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "vehicle expenses real estate agent canada",
    "realtor vehicle expenses canada",
    "cra vehicle logbook",
    "cra simplified logbook",
    `class 10.1 ceiling ${YEAR}`,
    "passenger vehicle lease limit canada",
    "gst hst itc passenger vehicle 90%",
    "t2125 line 9281 vehicle",
    "self-employed realtor car expenses",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/vehicle-expenses-real-estate-agents-canada",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/vehicle-expenses-real-estate-agents-canada",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline: TITLE,
  description: DESCRIPTION,
  url: "/vehicle-expenses-real-estate-agents-canada",
  datePublished: "2026-05-09",
  dateModified: "2026-10-21",
});

// ─── Primary sources ──────────────────────────────────────────────────────────
//
// Every rule and figure below is backed by one of these pages, read on
// 2026-10-21.

const CRA_SOURCES = [
  {
    id: 1,
    label: "CRA: Motor vehicle expenses (self-employed)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/business-income-tax-reporting/business-expenses/motor-vehicle-expenses.html",
  },
  { id: 2, ...CRA_MOTOR_VEHICLE_SOURCES.records },
  { id: 3, ...CRA_MOTOR_VEHICLE_SOURCES.businessPart },
  {
    id: 4,
    label: "CRA: Guide T4002, Chapter 4 – Capital cost allowance",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-6.html",
  },
  {
    id: 5,
    label: "CRA: Classes of depreciable property (Class 10, Class 10.1, Class 54)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/claiming-capital-cost-allowance/classes-depreciable-property.html",
  },
  { id: 6, ...LIMITS.source },
  ...(PREVIOUS ? [{ id: 7, ...PREVIOUS.source }] : []),
  {
    id: 8,
    label: "CRA: Motor vehicle – Leasing costs",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/motor-vehicle-expenses/deductible-expenses/motor-vehicle-leasing-costs.html",
  },
  {
    id: 9,
    label: "CRA: Guide T4002, Chapter 3 – Business expenses (line 9281, line 8521)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-5.html",
  },
  {
    id: 10,
    label: "CRA: Expenses section of Form T2125 (fines and penalties)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/expenses-section-form-t2125.html",
  },
  {
    id: 11,
    label: "CRA: IT-521R Motor vehicle expenses claimed by self-employed individuals (archived)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/it521r/archived-motor-vehicle-expenses-claimed-self-employed-individuals.html",
  },
  {
    id: 12,
    label: "CRA: What's new for small businesses and self-employed (accelerated and reaccelerated investment incentives)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/whats-new-small-businesses-self-employed.html",
  },
  {
    id: 13,
    label: "CRA: RC4022 General Information for GST/HST Registrants (passenger vehicles and aircraft)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html",
  },
  {
    id: 14,
    label: "CRA: Input tax credits, percentage of use in commercial activities (vehicles)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit/calculate-percentage-use-commercial-activities.html",
  },
];

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
  { href: "#the-formula", label: "How CRA works out the deduction" },
  { href: "#logbook", label: "CRA's logbook, and the simplified logbook" },
  { href: "#eligible", label: "What CRA lists as deductible, and what isn't business driving" },
  { href: "#limits", label: `The ${YEAR} limits: capital cost, leasing and interest` },
  { href: "#classes", label: "Class 10, Class 10.1 and Class 54" },
  { href: "#hst-itc", label: "GST/HST input tax credits on a vehicle" },
  { href: "#realtor-scenarios", label: "Realtor scenarios" },
  { href: "#provincial", label: "GST/HST by province, and Quebec" },
  { href: "#tracking", label: "Tracking it through the year" },
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
              Vehicle Expenses for Canadian Real Estate Agents ({YEAR})
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Showings, listing visits, brokerage stops and open houses: a
              working day in real estate runs on the vehicle. This article
              sets out CRA&apos;s published rules: the logbook and the
              simplified logbook, what&apos;s deductible and on which T2125
              line, the {YEAR} limits on capital cost, leasing and interest,
              and the 90% rule for GST/HST input tax credits on a passenger
              vehicle.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              12 min read · Updated for the {YEAR} automobile limits
              (Department of Finance Canada)
            </p>
          </div>
        </section>

        {/* ── Article body ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* Top disclaimer */}
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs leading-relaxed text-amber-700">
                <strong className="text-amber-800">General information only, not tax advice.</strong>{" "}
                This article describes published rules from the Canada Revenue
                Agency and the Department of Finance Canada. The capital cost,
                leasing and interest limits are set each year and change.
                Individual circumstances vary. Check current figures against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/business-income-tax-reporting/business-expenses/motor-vehicle-expenses.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA&apos;s motor vehicle expenses page
                </a>{" "}
                and a qualified accountant or tax professional before filing.{" "}
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
              <h2 id="the-formula">How CRA works out the deduction</h2>

              <p>
                {VEHICLE_BUSINESS_PART_RULE}<CRACite id={3} />
              </p>

              <p>
                CRA&apos;s own example: 27,000 kilometres driven to earn
                income out of 30,000 in total, with $7,000 of vehicle
                expenses for the year. (27,000 ÷ 30,000) × $7,000 = $6,300
                deductible<CRACite id={1} />.
              </p>

              <p>
                That business part goes on <strong>line 9281</strong> of Form
                T2125, which CRA titles &quot;Motor vehicle expenses (not
                including CCA)&quot;<CRACite id={9} />. Capital cost allowance
                on a vehicle you own is claimed separately, on{" "}
                <strong>line 9936</strong><CRACite id={1} /><CRACite id={9} />.
              </p>

              <p>
                {VEHICLE_FULL_DEDUCTION_RULE}<CRACite id={1} />
              </p>

              <p>
                For every T2125 line that applies to a real estate agent, see
                the{" "}
                <Link
                  href="/real-estate-agent-business-expenses-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  guide to real estate agent business expenses in Canada
                </Link>
                . This article covers the vehicle lines.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="logbook">CRA&apos;s logbook, and the simplified logbook</h2>

              <h3>The full-year logbook</h3>

              <p>
                {VEHICLE_LOGBOOK_RULE}<CRACite id={2} />
              </p>

              <h3>The simplified logbook: a base year, then three-month samples</h3>

              <p>
                {SIMPLIFIED_LOGBOOK_RULE}<CRACite id={2} /> The base year is a
                full 12 months of logbook; only the later years use a
                three-month sample.
              </p>

              <p>
                CRA&apos;s formula: <strong>{SIMPLIFIED_LOGBOOK_FORMULA}</strong>
                <CRACite id={2} />.
              </p>

              <p>
                {SIMPLIFIED_LOGBOOK_EXAMPLE}<CRACite id={2} />{" "}
                {SIMPLIFIED_LOGBOOK_RANGE_RULE}<CRACite id={2} />
              </p>

              <p>
                {SIMPLIFIED_LOGBOOK_OUTSIDE_RANGE_RULE}<CRACite id={2} />
              </p>

              <p>
                For an agent, whether a later year stays within that range
                depends on how much the year&apos;s driving changes: a new
                farm area, a move to another brokerage or team, a different
                mix of buyer and listing work.
              </p>

              <p>
                {VEHICLE_LOGBOOK_RETENTION_RULE}<CRACite id={2} />
              </p>

              <h3>More than one vehicle</h3>

              <p>
                {MULTIPLE_VEHICLES_RULE}<CRACite id={2} />
              </p>

              {/* ── Section 3 ── */}
              <h2 id="eligible">What CRA lists as deductible, and what isn&apos;t business driving</h2>

              <p>
                CRA lists these motor vehicle expenses, deductible for the
                business part of the vehicle&apos;s use<CRACite id={1} />:
              </p>

              <ul>
                <li>Licence and registration fees</li>
                <li>Fuel and oil</li>
                <li>Electricity for a zero-emission vehicle</li>
                <li>Insurance</li>
                <li>
                  Interest on money borrowed to buy the vehicle (limited, see{" "}
                  <a href="#limits">the {YEAR} limits</a>)
                </li>
                <li>Maintenance and repairs</li>
                <li>
                  Leasing costs (limited, see <a href="#limits">the {YEAR} limits</a>)
                </li>
              </ul>

              <p>
                Capital cost allowance on an owned vehicle isn&apos;t in this
                list: it goes on line 9936<CRACite id={1} />. Business parking
                and supplementary business insurance count in full, as above.
              </p>

              <h3>Driving between home and the brokerage</h3>

              <p>
                CRA&apos;s current motor vehicle pages count the kilometres
                driven to earn income as business use<CRACite id={1} />, and
                don&apos;t address trips between home and a place of business
                for the self-employed in general. CRA&apos;s archived
                interpretation bulletin IT-521R, which CRA no longer updates,
                says travel between home and the place of business is not
                deductible unless the home is the base of business
                operations, and that a home is normally not the base when
                there is an office or other fixed place of business
                elsewhere<CRACite id={11} />. How that applies to a given
                agent (a desk at the brokerage, or a home office as the base)
                is a question for an accountant.
              </p>

              <h3>Personal trips, and fines</h3>

              <ul>
                <li>
                  Personal driving, including the personal part of a trip that
                  mixes errands and business, isn&apos;t driving to earn
                  income<CRACite id={1} />.
                </li>
                <li>
                  CRA lists &quot;most fines and penalties imposed after March
                  22, 2004, under the law of Canada, a province, or a foreign
                  country&quot; among the amounts not to include in
                  expenses<CRACite id={10} />. That covers traffic tickets.
                </li>
              </ul>

              {/* ── Section 4 ── */}
              <h2 id="limits">The {YEAR} limits: capital cost, leasing and interest</h2>

              <p>
                The Department of Finance Canada sets these limits each year
                for passenger vehicles<CRACite id={6} />. They apply on top of
                the business-use part: the limit comes first, then the
                business share.
              </p>

              <ul>
                <li>
                  <strong>Class 10.1 capital cost ceiling: {money(LIMITS.ccaCeiling)}</strong>{" "}
                  before tax, for a passenger vehicle (new or used) bought in{" "}
                  {YEAR}
                  {PREVIOUS && PREVIOUS.ccaCeiling !== LIMITS.ccaCeiling
                    ? `, up from ${money(PREVIOUS.ccaCeiling)} in ${PREVIOUS.year}`
                    : ""}
                  <CRACite id={6} />{PREVIOUS ? <CRACite id={7} /> : null}. A
                  vehicle that costs more goes into Class 10.1 at the
                  ceiling, and CCA is worked out on the ceiling, not the
                  price<CRACite id={5} />.
                </li>
                <li>
                  <strong>Zero-emission passenger vehicle (Class 54) ceiling:{" "}
                  {money(LIMITS.zeroEmissionCeiling)}</strong> before tax
                  <CRACite id={6} /><CRACite id={5} />.
                </li>
                <li>
                  <strong>Leasing: {money(LIMITS.leasePerMonth)} a month</strong>{" "}
                  before tax, for leases entered into in {YEAR}
                  <CRACite id={6} />. CRA&apos;s leasing chart works out two
                  amounts, one from this monthly limit and one from the
                  manufacturer&apos;s list price, and the eligible leasing
                  cost is the lower of the two<CRACite id={8} />.
                </li>
                <li>
                  <strong>Interest: {money(LIMITS.interestPerMonth)} a month</strong>{" "}
                  on money borrowed to buy a passenger vehicle, for loans
                  entered into in {YEAR}
                  {PREVIOUS && PREVIOUS.interestPerMonth === LIMITS.interestPerMonth
                    ? `, the same as in ${PREVIOUS.year}`
                    : ""}
                  <CRACite id={6} />. CRA works it out by the day: the
                  deduction is the lower of the interest payable and the
                  monthly limit ÷ 30 for each day interest was payable in the
                  year<CRACite id={1} />.
                </li>
              </ul>

              <p>
                Class 10 and Class 10.1 are both 30% classes<CRACite id={5} />.
                In the year property is bought, CRA&apos;s guide usually
                limits CCA to half of the year&apos;s net additions (the
                half-year rule), and says the rule does not apply to
                accelerated investment incentive property, zero-emission
                vehicles, Class 56 property or, under proposed changes,
                reaccelerated investment incentive property
                <CRACite id={4} />. Under the proposed changes, the
                accelerated incentive covers qualifying property acquired
                before January 1, 2025, and the reaccelerated incentive
                covers qualifying property acquired on or after that date and
                available for use before 2034<CRACite id={12} />. Which of
                these applies to a particular vehicle is a question for an
                accountant.
              </p>

              {/* ── Section 5 ── */}
              <h2 id="classes">Class 10, Class 10.1 and Class 54</h2>

              <ul>
                <li>
                  <strong>Class 10 (30%):</strong> motor vehicles and some
                  passenger vehicles, including a passenger vehicle that costs
                  no more than the year&apos;s ceiling<CRACite id={5} />.
                </li>
                <li>
                  <strong>Class 10.1 (30%):</strong> a passenger vehicle not
                  included in Class 10, that is, one costing more than the
                  ceiling. CRA: &quot;List each Class 10.1 vehicle
                  separately.&quot;<CRACite id={5} /> Per CRA&apos;s guide,
                  recapture of CCA and terminal loss do not apply to passenger
                  vehicles in Class 10.1 (unless they were designated
                  immediate expensing property)<CRACite id={4} />. In the
                  year a Class 10.1 vehicle is sold, the guide allows 50% of
                  the CCA (the half-year rule on sale) when the vehicle was
                  owned at the end of the previous fiscal period
                  <CRACite id={4} />.
                </li>
                <li>
                  <strong>Class 54 (30%):</strong> zero-emission vehicles
                  acquired after March 18, 2019, that would otherwise be in
                  Class 10 or 10.1, with the capital cost limit above. These
                  vehicles may qualify for an enhanced first-year CCA that is
                  being phased out<CRACite id={5} />.
                </li>
              </ul>

              <p>
                Most sedans, SUVs and crossovers used in real estate work are
                passenger vehicles in CRA&apos;s terms. A pickup or van used
                to carry signs and staging may not be. CRA&apos;s{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/motor-vehicle-expenses/type-vehicle.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  type of vehicle page
                </a>{" "}
                sets out the tests.
              </p>

              {/* ── Section 6 ── */}
              <h2 id="hst-itc">GST/HST input tax credits on a vehicle</h2>

              <p>
                An agent registered for GST/HST can claim input tax credits
                (ITCs) for the GST/HST paid on vehicle costs. For an
                individual or a partnership, which covers most self-employed
                agents, RC4022 sets out how this works for a passenger
                vehicle<CRACite id={13} />:
              </p>

              <ul>
                <li>
                  Individuals and partnerships usually claim ITCs for a
                  passenger vehicle based on the capital cost allowance.
                </li>
                <li>
                  <strong>Used 90% or more in commercial activities:</strong> a
                  full ITC.
                </li>
                <li>
                  <strong>Used 10% or less:</strong> no ITC.
                </li>
                <li>
                  <strong>In between:</strong> the ITC is worked out each year
                  from the part of the year&apos;s CCA that relates to the
                  commercial activities, multiplied by a tax factor:{" "}
                  {GST_RATE_GROUP.percent} GST: {taxFactor(GST_RATE_GROUP.rate)};{" "}
                  {HST_RATE_GROUPS.map((g) => `${g.percent} HST: ${taxFactor(g.rate)}`).join("; ")}.
                </li>
                <li>
                  The part of a passenger vehicle&apos;s cost eligible for an
                  ITC is limited to the capital cost limitation, the Class
                  10.1 ceiling above ({money(LIMITS.ccaCeiling)} before tax
                  for a vehicle bought in {YEAR}<CRACite id={6} />).
                </li>
              </ul>

              <h3>Running costs</h3>

              <p>
                For running costs such as fuel, maintenance and repairs, and
                licence and registration fees, CRA&apos;s vehicle guidance
                limits the ITC to the GST/HST on the business part when the
                vehicle is used for business and personal driving
                <CRACite id={14} />. RC4022&apos;s general rule allows the
                full GST/HST as an ITC on an operating expense used 90% or
                more in commercial activities, and otherwise a fair and
                reasonable split used consistently through the year
                <CRACite id={13} />. These rules are technical, and an
                accountant familiar with GST/HST can apply them to a
                specific vehicle.
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
              <h2 id="realtor-scenarios">Realtor scenarios</h2>

              <p>
                CRA&apos;s rules apply to every self-employed person. These
                are the ones a real estate agent meets most often. Each item
                describes how the rules read, not what to claim: that is a
                conversation with an accountant.
              </p>

              <h3>Showings and listing visits</h3>

              <p>
                Driving to a showing, a listing appointment or an inspection
                is driving to earn income<CRACite id={1} />. A logbook entry
                for it records the date, destination, purpose and kilometres
                <CRACite id={2} />.
              </p>

              <h3>Open houses</h3>

              <p>
                Driving to an open house you host is driving to earn income.
                A visit to another agent&apos;s open house for market
                research is too when its purpose is recorded; a drop-in with
                no business purpose isn&apos;t.
              </p>

              <h3>The brokerage</h3>

              <p>
                See{" "}
                <a href="#eligible">driving between home and the brokerage</a>{" "}
                above: the archived bulletin treats a home that isn&apos;t the
                base of business operations differently from one that is
                <CRACite id={11} />.
              </p>

              <h3>Trips that mix business and errands</h3>

              <p>
                Only the kilometres driven to earn income count
                <CRACite id={1} />. A trip that takes in a listing visit, a
                grocery stop and a school pickup has a business part and a
                personal part, and the logbook records the business part.
              </p>

              <h3>Vehicle wraps and signs</h3>

              <p>
                Advertising goes on line 8521 of T2125<CRACite id={9} />. A
                wrap or sign advertising the business doesn&apos;t change the
                vehicle&apos;s business-use share: a personal errand in a
                wrapped vehicle is still personal driving.
              </p>

              {/* ── Section 8 ── */}
              <h2 id="provincial">GST/HST by province, and Quebec</h2>

              <p>
                The federal rules above apply across Canada. The GST/HST rate,
                which sets the dollar amount of an ITC, depends on the
                province:
              </p>

              <ul>
                {HST_RATE_GROUPS.map((group) => (
                  <li key={group.percent}>
                    <strong>{group.percent} HST:</strong> {group.names}.
                  </li>
                ))}
                <li>
                  <strong>{GST_RATE_GROUP.percent} GST only:</strong>{" "}
                  {GST_RATE_GROUP.names}. Provincial sales tax (where it
                  applies, for example PST in British Columbia, Saskatchewan
                  and Manitoba) isn&apos;t recovered through GST ITCs.
                </li>
              </ul>

              <p>
                For GST/HST registration, including the small supplier
                threshold and filing frequency, see the{" "}
                <Link
                  href="/real-estate-agent-hst-registration-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  HST/GST registration guide for Canadian real estate agents
                </Link>.
              </p>

              <h3>Quebec</h3>

              <p>
                Quebec administers its own Quebec Sales Tax (QST) alongside
                GST, and Revenu Québec has its own vehicle rules on top of
                the federal ones. Agent Runway isn&apos;t yet available in
                Quebec, and this article doesn&apos;t cover QST. Revenu
                Québec&apos;s published guidance and a Quebec accountant
                cover it.
              </p>

              {/* ── Section 9 ── */}
              <h2 id="tracking">Tracking it through the year</h2>

              <p>
                Rebuilding a year of vehicle costs in April runs into two
                gaps: missing receipts, and a kilometre record that was never
                kept. Recording costs as they happen and trips as they are
                driven keeps both.
              </p>

              <p>
                In Agent Runway, vehicle costs are recorded under Expenses →
                Vehicle in their own categories (lease or rental payments,
                insurance, fuel, repairs and maintenance, business parking,
                supplementary business insurance) and add up to T2125 line
                9281. The business-use share comes from CRA&apos;s logbook
                under Expenses → Mileage (trips, odometer readings, and a
                full-year logbook or a base year with three-month samples),
                or from the share you declare in Settings until the logbook
                covers the year. It applies to every vehicle cost except
                business parking and supplementary business insurance, which
                count in full. Capital cost allowance is worked out
                separately and goes on line 9936. These are estimates: what
                goes on T2125 is what you and your accountant settle at
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
                takes your total business expenses for the year (the business
                part of your vehicle costs is part of that total) and shows
                the estimated income tax, CPP and GST/HST.
              </p>

              <p>
                For how line 9281 fits with the other T2125 lines, see the{" "}
                <Link
                  href="/t2125-guide-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  T2125 guide for Canadian real estate agents
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
                Every rule and figure in this article is backed by one of the
                primary sources below, checked against them on 2026-10-21.
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
              This article is for general information only, not financial,
              tax, or professional advice. The Department of Finance Canada
              sets the vehicle limits each year and they change. GST/HST input
              tax credit rules for individuals and partnerships are technical
              and depend on the facts. Check current figures with CRA and a
              qualified accountant or tax professional. Agent Runway assumes
              no liability for tax filing outcomes.{" "}
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
              Agent Runway keeps your vehicle costs against T2125 line 9281,
              works out the business-use share from CRA&apos;s logbook, and
              shows the deductible part alongside your federal, provincial,
              CPP and GST/HST estimates. Built for Canadian real estate
              agents.
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
