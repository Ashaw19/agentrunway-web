import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "Business-Use-of-Home Expenses for Canadian Real Estate Agents (2025) — T2125 Line 9945, the Two Qualifying Tests, the Loss Carryforward, and the CCA Trap on a Principal Residence",
  description:
    "How home-office expenses work for self-employed Canadian real estate agents — the T2125 Line 9945 mechanic (not employee-side T2200), the two qualifying tests (principal place of business OR exclusive use to meet clients on a regular and continuous basis), the floor-area calculation, the eligible expense list, the loss-limit carryforward rule, and the principal-residence-exemption trap if CCA is claimed on the home.",
  keywords: [
    "business use of home real estate agent canada",
    "home office deduction realtor canada",
    "t2125 line 9945",
    "home office self-employed canada",
    "principal place of business real estate agent",
    "cra home office cca principal residence",
    "realtor home office expenses canada",
    "t2200 vs t2125 self-employed",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/business-use-of-home-real-estate-agents-canada",
    title:
      "Business-Use-of-Home Expenses for Canadian Real Estate Agents (2025) — T2125 Line 9945",
    description:
      "Self-employed Canadian real estate agents: how Line 9945 of T2125 actually works — the two qualifying tests, the floor-area calculation, the loss carryforward, and the principal-residence CCA trap. CRA-cited.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/business-use-of-home-real-estate-agents-canada",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "Business-Use-of-Home Expenses for Canadian Real Estate Agents (2025) — T2125 Line 9945, the Two Qualifying Tests, the Loss Carryforward, and the CCA Trap on a Principal Residence",
  description:
    "How home-office expenses work for self-employed Canadian real estate agents — the T2125 Line 9945 mechanic (not employee-side T2200), the two qualifying tests (principal place of business OR exclusive use to meet clients on a regular and continuous basis), the floor-area calculation, the eligible expense list, the loss-limit carryforward rule, and the principal-residence-exemption trap if CCA is claimed on the home.",
  url: "/business-use-of-home-real-estate-agents-canada",
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
    label:
      "CRA — Business-use-of-home expenses (sole proprietorships and partnerships, T2125 Line 9945)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html",
  },
  {
    id: 2,
    label:
      "CRA — Calculating business-use-of-home expenses (Form T2125, Part 7)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/calculating-business-use-home-expenses.html",
  },
  {
    id: 3,
    label:
      "CRA — Running a business from your home",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/business-income-tax-reporting/business-expenses/running-a-business-your-home.html",
  },
  {
    id: 4,
    label:
      "CRA — T4002 Self-employed Business, Professional, Commission, Farming, and Fishing Income — Chapter 3 Expenses",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-5.html",
  },
  {
    id: 5,
    label:
      "CRA — T2125 Statement of Business or Professional Activities (form, including Part 7 / Line 9945)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html",
  },
  {
    id: 6,
    label:
      "CRA — T2200 Declaration of Conditions of Employment (employee-side form, for context only)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2200.html",
  },
  {
    id: 7,
    label:
      "CRA — Principal residence and other real estate (designation, change in use, capital cost allowance)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains/principal-residence-other-real-estate.html",
  },
  {
    id: 8,
    label:
      "CRA — Capital cost allowance (CCA) classes (Class 1 buildings and rates)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/claiming-capital-cost-allowance/classes.html",
  },
  {
    id: 9,
    label:
      "CRA — RC4022 General Information for GST/HST Registrants (small-supplier $30,000 threshold)",
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
  { href: "#t2125-not-t2200", label: "T2125 Line 9945, not employee-side T2200" },
  { href: "#two-tests", label: "The two qualifying tests CRA publishes" },
  { href: "#calculation", label: "Calculating the business-use percentage" },
  { href: "#eligible", label: "What CRA lists as eligible — and what isn't" },
  { href: "#loss-rule", label: "The loss-limit rule and the indefinite carryforward" },
  { href: "#cca-trap", label: "The CCA trap on a principal residence" },
  { href: "#realtor-scenarios", label: "Realtor-specific scenarios" },
  { href: "#provincial", label: "Provincial nuances and the Quebec geo-block" },
  { href: "#tracking", label: "Tracking the deduction through the year" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BusinessUseOfHomeRealEstateAgentsCanadaPage() {
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
              Business-Use-of-Home Expenses for Canadian Real Estate Agents (2025)
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Listing prep at the kitchen table, contracts on the home desk,
              client follow-up after dinner — most of an agent&apos;s
              behind-the-scenes work happens at home. CRA publishes a specific
              mechanic for self-employed agents to deduct a portion of their
              home expenses against business income, and it lives on a single
              line of T2125: Line 9945. The rules around it are not the same
              rules that apply to employees, and one of them — capital cost
              allowance on the home — carries a tax consequence on sale that
              most accountants caution against. This article walks the
              published 2025 mechanic.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              11 min read · CRA-cited · Updated 2026-05-09
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
                Agency. Eligibility tests, calculation methods, and the
                principal-residence-exemption interaction are circumstance-
                specific. Individual situations vary. Always verify current
                figures and your specific eligibility against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA&apos;s business-use-of-home expenses page
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
              <h2 id="t2125-not-t2200">T2125 Line 9945, not employee-side T2200</h2>

              <p>
                The single most common point of confusion online about
                Canadian home-office deductions is which form applies to which
                kind of taxpayer. Two distinct regimes exist:
              </p>

              <ul>
                <li>
                  <strong>Employees</strong> use Form T2200 (Declaration of
                  Conditions of Employment) signed by their employer, and
                  claim work-space-in-the-home expenses on Form T777
                  <CRACite id={6} />. This regime has its own published rules,
                  its own narrower eligible-expense list, and its own
                  qualifying conditions. It is not the regime that applies to
                  most Canadian real estate agents.
                </li>
                <li>
                  <strong>Self-employed individuals</strong> — sole
                  proprietorships and partnerships — use Form T2125
                  (Statement of Business or Professional Activities) and
                  report business-use-of-home expenses on Part 7 of T2125,
                  flowing to <strong>Line 9945</strong><CRACite id={5} />.
                  No T2200 is filed; no employer signature is required. The
                  agent is the business.
                </li>
              </ul>

              <p>
                A working real estate agent in Canada is typically a
                commission-based independent contractor licensed under a
                provincial real estate council and paid through their
                brokerage as self-employment income — not as an employee on
                T4 wages. That self-employment status is what places the
                agent on the T2125 / Line 9945 path<CRACite id={4} />. An
                agent who has searched online for &quot;home office
                deduction Canada&quot; and surfaced T2200 articles is reading
                rules that do not apply to their tax filing. The mechanic
                that does apply lives in CRA&apos;s self-employment guide,
                T4002 Chapter 3<CRACite id={4} />, and on T2125 Part 7
                <CRACite id={5} />.
              </p>

              <p>
                For the line-by-line picture of how Line 9945 fits among the
                other expense lines on T2125, see the{" "}
                <Link
                  href="/t2125-guide-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  T2125 guide for Canadian real estate agents
                </Link>.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="two-tests">The two qualifying tests CRA publishes</h2>

              <p>
                CRA states that to deduct business-use-of-home expenses on
                Line 9945, the workspace must meet at least one of two
                conditions<CRACite id={1} />:
              </p>

              <ol>
                <li>
                  The workspace is the agent&apos;s <strong>principal
                  place of business</strong>, OR
                </li>
                <li>
                  The agent uses the workspace <strong>only to earn business
                  income</strong> AND uses it <strong>on a regular and
                  continuous basis to meet clients, customers, or
                  patients</strong><CRACite id={1} />.
                </li>
              </ol>

              <p>
                The two tests are independent — meeting either one is
                sufficient. The published phrasing matters. The first test is
                about whether the home is where the agent&apos;s business
                primarily operates from; the second is about exclusive
                business use combined with regular client meetings on the
                premises. The two tests resolve different fact patterns.
              </p>

              <h3>The principal-place-of-business test</h3>

              <p>
                For a real estate agent who divides time between the home and
                a brokerage office, the question of which is the
                &quot;principal place of business&quot; is fact-specific.
                CRA&apos;s general guidance frames principal place of business
                as where the substantive business work is conducted —
                administrative work, contract review, client communication,
                marketing preparation, financial record-keeping<CRACite id={3} />.
                Many working agents do all of that at home, and visit the
                brokerage primarily to drop off paperwork, attend office
                meetings, or use shared resources. In that fact pattern, the
                home may meet the principal-place-of-business test even
                though the brokerage office exists.
              </p>

              <p>
                CRA does not publish a numerical threshold (&quot;X% of hours
                must be at home&quot;). The determination is qualitative and
                circumstance-specific, and it is the kind of question an
                accountant resolves by reviewing the agent&apos;s actual
                weekly pattern. What this article describes is the published
                rule, not a verdict on any individual situation.
              </p>

              <h3>The exclusive-use-to-meet-clients test</h3>

              <p>
                The second test has two prongs that both need to hold: the
                workspace is used only for business (not the kitchen table
                that becomes the family dinner table at 6 pm), AND the agent
                regularly meets clients there<CRACite id={1} />. For an
                agent who maintains a dedicated home office that doubles as
                an in-person meeting space — buyer consultations, listing
                presentations, paperwork signings — both prongs may be
                present. For an agent who does paperwork in a dedicated
                office but never meets clients there (all client meetings
                happen at properties or at a coffee shop), this test is not
                met. The principal-place-of-business test may still be met
                — but the exclusive-use-to-meet-clients test, on its own
                terms, requires the meeting prong.
              </p>

              <h3>What about agents who use both home and brokerage?</h3>

              <p>
                The most common Canadian agent fact pattern is some
                combination: paperwork at home, formal meetings at the
                brokerage, showings at properties. CRA&apos;s tests do not
                require that the home be the <em>only</em> place of business
                — only that it qualifies under one of the two tests
                <CRACite id={1} />. An agent whose home meets the
                principal-place-of-business test still qualifies even if
                they also use the brokerage office. The deduction still
                only applies to the home portion; brokerage costs (desk
                fees, office shares) are separate T2125 expenses on
                different lines, not on Line 9945.
              </p>

              {/* ── Section 3 ── */}
              <h2 id="calculation">Calculating the business-use percentage</h2>

              <p>
                Once the qualifying test is met, the deduction is the
                business-use percentage of total eligible home expenses. CRA
                publishes two methods for calculating the business-use
                percentage<CRACite id={2} />:
              </p>

              <ul>
                <li>
                  <strong>The floor-area method:</strong> the area of the
                  workspace divided by the total finished area of the home.
                  A 200 sq ft home office in a 2,000 sq ft home is 10%
                  business use<CRACite id={2} />. The total finished area is
                  measured consistently — both the numerator and the
                  denominator on the same basis (interior finished space
                  excluding unfinished basements, garages, etc., or
                  inclusive of them, but the same basis for both).
                </li>
                <li>
                  <strong>The room-count method:</strong> the number of
                  rooms used for business divided by the total number of
                  rooms in the home<CRACite id={2} />. One office in a
                  home with eight rooms is 12.5% business use. The
                  room-count method is a simpler approximation; it produces
                  a different number than floor-area when room sizes vary.
                </li>
              </ul>

              <h3>Dual-use rooms and the personal-use reduction</h3>

              <p>
                If the workspace is used partly for business and partly for
                personal purposes — a guest room that serves as an office
                during the day, a den used for paperwork on weekdays and TV
                on weekends — CRA states the calculation must reduce the
                business portion proportionally for personal use
                <CRACite id={2} />. The CRA-published example uses a time
                basis: a room used 8 hours of a 24-hour day for business
                contributes (8/24) of its area to the business-use
                percentage, not the full area<CRACite id={2} />.
              </p>

              <p>
                For the dedicated home office that is exclusively used for
                business at all times — the door is closed, the family does
                not use it, no personal items live there — the personal-use
                reduction does not apply. The full area of that room is the
                business numerator. For most working agents, getting a
                dedicated room (rather than a kitchen-table corner) is what
                determines whether the floor-area numerator is the full room
                or a fraction of it.
              </p>

              <h3>Reasonableness</h3>

              <p>
                CRA expects the calculation to be reasonable<CRACite id={1} />.
                Claiming 60% of a 2,000 sq ft home as a business workspace
                — when only 200 sq ft is actually used for business —
                produces a percentage that is not defensible on review. The
                test is not what the agent claims; the test is what the
                physical workspace actually is, sized against the actual
                home<CRACite id={2} />.
              </p>

              {/* ── Section 4 ── */}
              <h2 id="eligible">What CRA lists as eligible — and what isn&apos;t</h2>

              <p>
                CRA&apos;s published list of home expenses eligible for the
                business-use percentage on Line 9945<CRACite id={1} />
                <CRACite id={2} />:
              </p>

              <ul>
                <li><strong>Heat</strong></li>
                <li><strong>Electricity</strong></li>
                <li><strong>Water</strong></li>
                <li><strong>Home insurance</strong></li>
                <li>
                  <strong>Mortgage interest</strong> (interest only —
                  principal payments are not eligible<CRACite id={1} />)
                </li>
                <li><strong>Property taxes</strong></li>
                <li><strong>Maintenance and minor repairs</strong></li>
                <li>
                  <strong>Capital cost allowance</strong> on the home itself
                  (eligible in the published list, with significant
                  consequences covered in section 6)<CRACite id={1} />
                </li>
              </ul>

              <p>
                Internet service is a common adjacent question. Where a
                portion of internet service is used for business, the
                business portion may be deducted — typically as a separate
                T2125 utilities line rather than as part of the
                business-use-of-home calculation<CRACite id={4} />. An
                accountant will typically allocate it where the supporting
                pattern best fits.
              </p>

              <h3>What is not eligible</h3>

              <p>
                CRA states the following are not eligible expenses for
                Line 9945:
              </p>

              <ul>
                <li>
                  <strong>Mortgage principal payments.</strong> Only the
                  interest portion of the mortgage payment is an eligible
                  business-use-of-home expense<CRACite id={1} />. Principal
                  is the repayment of the loan and does not qualify as a
                  current expense.
                </li>
                <li>
                  <strong>Capital improvements and major renovations.</strong>{" "}
                  A new roof, a kitchen renovation, an addition — these are
                  capital expenditures, not current expenses. They may
                  affect the home&apos;s capital cost base for CCA purposes
                  if CCA is claimed (covered in section 6), but they are
                  not deductible as Line 9945 current expenses<CRACite id={1} />.
                </li>
                <li>
                  <strong>Expenses already deducted elsewhere on T2125.</strong>{" "}
                  CRA states that expenses claimed on Line 9945 cannot have
                  been claimed on other T2125 lines<CRACite id={5} /> — the
                  same dollar of insurance does not appear on both Line 8690
                  (insurance, business) and Line 9945 (insurance, home).
                </li>
              </ul>

              <p>
                For the broader picture of every T2125 line that applies to
                a Canadian real estate agent — vehicle, advertising, meals,
                supplies, professional fees, and the rest — see the{" "}
                <Link
                  href="/real-estate-agent-business-expenses-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  guide to real estate agent business expenses in Canada
                </Link>. Vehicle expenses sit on Line 9281 and follow their
                own logbook-and-CCA mechanic — covered in detail in the{" "}
                <Link
                  href="/vehicle-expenses-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  vehicle expenses guide for Canadian real estate agents
                </Link>.
              </p>

              {/* ── Section 5 ── */}
              <h2 id="loss-rule">The loss-limit rule and the indefinite carryforward</h2>

              <p>
                CRA states that business-use-of-home expenses cannot be used
                to create or increase a business loss<CRACite id={1} />. The
                deduction is capped at the amount of business income
                remaining after all other T2125 expenses have been
                deducted. If the calculated business-use-of-home expenses
                exceed that remaining income, the excess does not vanish —
                it carries forward to be claimed in a future year against
                business income from the same business<CRACite id={1} />.
              </p>

              <p>
                The mechanic, in conceptual numbers:
              </p>

              <ul>
                <li>
                  Gross commission income: $80,000
                </li>
                <li>
                  Other T2125 expenses (vehicle, advertising, supplies,
                  fees, etc.): $78,000
                </li>
                <li>
                  Business income before Line 9945: $2,000
                </li>
                <li>
                  Calculated business-use-of-home expenses for the year: $5,000
                </li>
                <li>
                  Amount deductible on Line 9945 this year: $2,000 (capped at
                  remaining business income)
                </li>
                <li>
                  Amount carried forward to a future year: $3,000
                </li>
              </ul>

              <p>
                CRA states the carryforward has no published expiry — the
                excess may be used in any future year against business
                income from the same business<CRACite id={1} />. An agent in
                a strong year that absorbs the carryforward sees the prior
                year&apos;s parked deduction crystallize. The mechanic exists
                so a temporarily lean year does not extinguish a deduction
                the agent legitimately had — but it also means an agent
                whose business closes before the carryforward is consumed
                may lose access to the unused balance.
              </p>

              <p>
                The carryforward applies <em>only</em> to the
                business-use-of-home expenses themselves. Other T2125
                expenses (vehicle, advertising, etc.) can create or
                increase a business loss in the normal way; only Line 9945
                is constrained by the loss-limit rule<CRACite id={1} />.
              </p>

              {/* ── Cheat sheet inline CTA ── */}
              <div className="not-prose my-8">
                <EmailCapture
                  heading="Get the Canadian Realtor Tax Cheat Sheet"
                  subheading="Every 2025 bracket, CPP rate, GST/HST threshold, and deadline on one printable page — CRA-cited. We'll email it to you."
                  ctaLabel="Email me the cheat sheet"
                  source="cheat_sheet_inline_business-use-of-home-real-estate-agents-canada"
                  variant="light"
                />
              </div>

              {/* ── Section 6 ── */}
              <h2 id="cca-trap">The CCA trap on a principal residence</h2>

              <p>
                Capital cost allowance — depreciation — on the
                business-use portion of a home is on CRA&apos;s list of
                eligible Line 9945 expenses<CRACite id={1} />. The home is a
                Class 1 capital asset for CCA purposes, with a 4%
                declining-balance rate<CRACite id={8} />. On its face,
                claiming CCA produces a larger deduction in the current
                year. The trade-off it triggers, however, is rarely worth
                the current-year benefit — and it is the single most
                consequential decision in the whole business-use-of-home
                regime.
              </p>

              <p>
                CRA states that a property used as a principal residence is
                generally exempt from capital gains tax on sale through the
                <strong> principal residence exemption</strong><CRACite id={7} />.
                The exemption applies to the years the property was the
                taxpayer&apos;s principal residence and is the mechanism that
                allows most Canadian homeowners to sell their home without
                triggering a capital gain on the entire appreciation.
              </p>

              <p>
                CRA further states that capital gain and recapture rules
                apply if CCA is deducted on the business-use part of the
                home, and the home is later sold<CRACite id={1} />
                <CRACite id={7} />. Claiming CCA changes the character of the
                business-use portion: it converts that portion from
                principal-residence use to non-residence use for tax
                purposes. On sale, that portion is no longer protected by
                the principal residence exemption, and the gain attributable
                to it becomes taxable as a capital gain. The CCA previously
                claimed may also be recaptured as income.
              </p>

              <p>
                The math, in conceptual terms:
              </p>

              <ul>
                <li>
                  Home purchased: $400,000. Sold ten years later: $700,000.
                  Capital gain on sale: $300,000.
                </li>
                <li>
                  No CCA claimed: the entire $300,000 gain may be sheltered
                  by the principal residence exemption (assuming the
                  property was the taxpayer&apos;s principal residence for
                  every year of ownership and the business use was
                  ancillary)<CRACite id={7} />.
                </li>
                <li>
                  CCA claimed on 10% of the home as a home office for ten
                  years: 10% of the $300,000 gain — $30,000 — is no longer
                  protected by the principal residence exemption and becomes
                  a taxable capital gain. The CCA claimed during those ten
                  years is also subject to recapture rules<CRACite id={7} />.
                </li>
              </ul>

              <p>
                The current-year CCA deduction on a 10% business-use share of
                a home with, say, $300,000 of allocable building value is
                modest — at the 4% Class 1 rate, the first-year CCA on the
                business-use portion is around $600 (with the half-year rule
                applying in the year first claimed)<CRACite id={8} />. The
                potential downstream capital-gains exposure on sale, by
                contrast, can be tens of thousands of dollars.
              </p>

              <p>
                That published asymmetry is the reason most Canadian
                accountants caution against claiming CCA on a personal
                residence used partly for business. CRA does not prohibit
                it — the rule allows it<CRACite id={1} /> — but the
                mechanic of the principal residence exemption converts
                what looks like a deduction into a deferred liability on
                sale. This article describes the published mechanic. The
                question of whether to claim CCA in any specific situation
                is exactly the kind of question that goes to the agent&apos;s
                accountant, not to a generic guide.
              </p>

              {/* ── Section 7 ── */}
              <h2 id="realtor-scenarios">Realtor-specific scenarios</h2>

              <p>
                The published rules apply uniformly, but the day-to-day
                patterns of working real estate agents produce a few
                recurring scenarios where the rules interact in
                agent-specific ways. Each item below describes how
                CRA&apos;s rules apply — not what an agent &quot;should&quot;
                do, which is the accountant&apos;s lane.
              </p>

              <h3>The kitchen-table agent</h3>

              <p>
                An agent whose only home workspace is the kitchen table —
                used for paperwork during the day and for family meals in
                the evening — has a workspace that is not used exclusively
                for business and that is shared with personal use during
                the same time period. The exclusive-use-to-meet-clients
                test is not met (no exclusive use). The
                principal-place-of-business test may still be available if
                the kitchen table is genuinely where the substantive
                business work happens; in that case, CRA&apos;s
                personal-use reduction applies — the deduction is sized to
                the percentage of time the table is actually used for
                business<CRACite id={2} />. The reasonableness test
                <CRACite id={1} /> may also apply; an outsized claim for
                a non-dedicated workspace is the pattern most likely to be
                challenged on review.
              </p>

              <h3>The dedicated-home-office agent</h3>

              <p>
                An agent with a spare bedroom or basement converted into a
                full-time office — desk, monitor, file cabinets, no
                personal use — has the cleanest fact pattern. The room is
                used exclusively for business, and the business-use
                percentage is the room&apos;s area divided by the home&apos;s
                total finished area<CRACite id={2} />. If the agent also
                meets clients there occasionally, both qualifying tests are
                potentially met<CRACite id={1} />.
              </p>

              <h3>The both-home-and-brokerage agent</h3>

              <p>
                An agent who has a dedicated home office <em>and</em> uses a
                desk or office at the brokerage is a common pattern. As
                covered in section 2, CRA&apos;s tests do not require the
                home to be the only place of business — only that it
                qualifies under one of the two tests<CRACite id={1} />. An
                agent whose home meets the principal-place-of-business
                test (substantive work happens at home; brokerage stops are
                shorter and more transactional) qualifies under the first
                test even though the brokerage exists. Brokerage desk fees
                and office costs are separate T2125 expenses on different
                lines (typically supplies, office, or rent lines), not on
                Line 9945.
              </p>

              <h3>The agent who meets clients at properties, not at home</h3>

              <p>
                Real estate agents routinely meet buyer clients at
                properties for showings and seller clients at the listing
                home for listing presentations. Almost no agent meets
                clients <em>at home</em> on a regular and continuous basis.
                That fact pattern means the second qualifying test
                (exclusive use AND regular client meetings on the
                premises<CRACite id={1} />) is typically not met for most
                working agents. The first test — principal place of
                business — is the path that is more commonly relevant.
                The two tests are independent; meeting either one is
                sufficient<CRACite id={1} />.
              </p>

              <h3>The renter</h3>

              <p>
                An agent who rents rather than owns the home applies the
                same business-use percentage to the rent paid (treating
                rent as one of the eligible home expenses)<CRACite id={1} />.
                The CCA trap discussed in section 6 does not apply to
                renters — there is no principal residence to protect from
                capital gains exposure, because the agent does not own the
                property. For renters, the business-use-of-home calculation
                is structurally simpler.
              </p>

              <h3>The agent registered for HST</h3>

              <p>
                An agent whose worldwide taxable revenue from the last four
                consecutive calendar quarters has crossed $30,000 is no
                longer a small supplier and is required to register for
                GST/HST<CRACite id={9} />. Once registered, the agent may
                claim input tax credits on the GST/HST portion of eligible
                home expenses, applied to the business-use percentage. The
                ITC mechanic interacts with the home-expense calculation,
                and the published method for individuals and partnerships
                is technical. For the broader picture of HST/GST
                registration mechanics, see the{" "}
                <Link
                  href="/real-estate-agent-hst-registration-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  HST/GST registration guide for Canadian real estate agents
                </Link>.
              </p>

              {/* ── Section 8 ── */}
              <h2 id="provincial">Provincial nuances and the Quebec geo-block</h2>

              <p>
                The federal mechanics described above apply uniformly across
                Canada. The eligible expense list (heat, electricity, water,
                insurance, mortgage interest, property taxes, maintenance)
                is the same in every province, and the qualifying tests and
                the loss-limit carryforward rule are federal rules. What
                varies by province is the dollar amount of the underlying
                expenses (property taxes, heating costs, insurance
                premiums) and the GST/HST rate applied to taxable inputs.
              </p>

              <p>
                For agents in HST provinces (15%: New Brunswick, Nova Scotia,
                Prince Edward Island, Newfoundland and Labrador; 13%:
                Ontario), eligible home expenses subject to HST produce
                ITCs at the provincial HST rate when the agent is
                registered. For agents in GST-only provinces (5%: British
                Columbia, Alberta, Saskatchewan, Manitoba, Yukon, Northwest
                Territories, Nunavut), the ITC is calculated on the 5% GST
                portion only; provincial sales tax (PST in BC, Saskatchewan,
                Manitoba) is not recoverable through GST ITCs.
              </p>

              <h3>Quebec — QST and the Agent Runway geo-block</h3>

              <p>
                Quebec administers its own Quebec Sales Tax (QST) alongside
                GST and has its own provincial rules layered onto the
                federal business-use-of-home mechanic. Revenu Québec is
                the administering authority for the QST side of the
                calculation. Agent Runway is currently geo-blocked from
                Quebec pending Law 25 compliance work and French
                translation; this article does not cover QST-specific
                mechanics. Quebec agents are referred to Revenu Québec&apos;s
                published guidance and a Quebec-licensed accountant.
              </p>

              {/* ── Section 9 ── */}
              <h2 id="tracking">Tracking the deduction through the year</h2>

              <p>
                Reconstructing a year of home expenses at filing time is
                where most home-office deductions get smaller than they
                could legitimately have been. Utility bills are scattered
                across months, insurance renews on its own cadence,
                property tax arrives on a municipal schedule, mortgage
                interest is buried in a year-end statement. The
                business-use percentage is meaningless if the underlying
                annual totals are incomplete.
              </p>

              <p>
                Agent Runway&apos;s expense model captures home expenses as
                they occur and tags them to the T2125 Line 9945
                business-use-of-home category, with sub-categories for
                heat, electricity, water, insurance, mortgage interest,
                property taxes, and maintenance. The business-use
                percentage is a configurable input on the dashboard&apos;s
                tax readiness card; changing the percentage updates the
                estimated deductible portion in real time. The
                loss-limit cap and indefinite carryforward are surfaced in
                the readout — the dashboard estimates how much of the
                year&apos;s calculated business-use-of-home expense may be
                deductible against this year&apos;s business income, and
                what may carry forward.
              </p>

              <p>
                The free{" "}
                <Link
                  href="/tools/realtor-tax-estimator"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian Realtor Tax Estimator
                </Link>{" "}
                accepts home expenses with a business-use percentage and
                shows the impact on the estimated tax owing, alongside
                the CPP, federal, and provincial figures. It uses the
                same engine that drives the in-app dashboard. The
                Navigator persona surfaces the qualifying tests, the
                carryforward mechanic, and the principal-residence-CCA
                trade-off as published rules — never as a recommendation
                to claim or not claim CCA. That decision belongs with the
                agent&apos;s accountant.
              </p>

              <p>
                For the full Canadian financial picture — every CRA
                surface AR covers, from HST registration through
                instalments — see the{" "}
                <Link
                  href="/canadian-real-estate-agent-financial-platform"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian real estate agent financial platform overview
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
              only — not financial, tax, or professional advice. Eligibility
              for business-use-of-home expenses, the choice of calculation
              method, and the decision whether to claim capital cost
              allowance on a personal residence are circumstance-specific
              and have material consequences on filing and on future sale of
              the property. Always verify current rules with the CRA and
              consult a qualified accountant or tax professional. Agent
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
              See your estimated home-office deduction as your year unfolds.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway tracks home expenses against T2125 Line 9945,
              applies your business-use percentage, and surfaces the
              estimated deductible portion alongside your federal,
              provincial, CPP, and HST estimates — with the loss-limit
              carryforward modelled in. Built for Canadian real estate
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
