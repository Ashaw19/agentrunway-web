import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle, FileText } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";
import { t2125FormLineForExpenseItem as lineForItem } from "@agent-runway/core/engines/t2125-engine";
import {
  T2125_FORM,
  t2125Line,
  t2125ReturnLinesPhrase,
  type T2125Line,
} from "@agent-runway/core/engines/t2125-lines";

// Every line number on this page comes from the form's line list
// (t2125Line) or, for an expense the app tracks, from the engine's expense
// map (lineForItem), so this guide and the T2125 pre-fill cannot disagree.
// Until 2026-10-13 the numbers were typed here and 11 of the 14 expense lines
// were wrong, along with the income and net income lines.

const ADJUSTED_SALES_LINE = t2125Line("8000");
const OTHER_INCOME_LINE = t2125Line("8230");
const GROSS_INCOME_LINE = t2125Line("8299");
const MANAGEMENT_FEES_LINE = t2125Line("8871");
const VEHICLE_LINE = lineForItem("vehicle_fuel");
const TOTAL_EXPENSES_LINE = t2125Line("9368");
const NET_BEFORE_ADJUSTMENTS_LINE = t2125Line("9369");
const HOME_LINE = lineForItem("home_utilities");
const NET_INCOME_LINE = t2125Line("9946");

// The form has no line named for a brokerage split and CRA publishes no
// placement, so the placement is stated as this guide's, not CRA's.
const BROKERAGE_SPLIT_FAQ = {
  question: "Where does a brokerage commission split go on the T2125?",
  answer:
    `The T2125 has no line named for a brokerage split. This guide places it on ${MANAGEMENT_FEES_LINE.ref} (${MANAGEMENT_FEES_LINE.label}); which line a return uses is the preparer's call. ` +
    "The split is an expense in Part 4 of the form, not a reduction of the income in Part 3: the full commission is the income, and the brokerage's share is deducted from it.",
};

// The home office answer, in CRA's own conditions. The wording that was here
// answered "Yes", gave one condition where CRA gives two, named Line 8810
// (Office expenses) and listed internet, which CRA's page does not.
const HOME_OFFICE_FAQ = {
  question: "Where is a home office claimed on the T2125?",
  conditions:
    "Per CRA, business-use-of-home expenses are deductible when the work space is the principal place of business, or when it is used only to earn business income and on a regular and ongoing basis to meet clients",
  line: `The claim is worked out in Part 7 of the form and entered on ${HOME_LINE.ref} (${HOME_LINE.label}). Part 7 lists heat, electricity, insurance, maintenance, mortgage interest and property taxes, and takes off the personal-use part`,
  limit:
    "Per CRA, the claim cannot create or increase a business loss; an amount that cannot be used is carried to a later year",
};

export const metadata: Metadata = {
  title: "How to Fill Out T2125 as a Real Estate Agent in Canada",
  description:
    "Line-by-line guide to filing CRA Form T2125 (Statement of Business or Professional Activities) for self-employed real estate agents in Canada. Industry code, expenses, and common mistakes.",
  openGraph: {
    title: "How to Fill Out T2125 as a Real Estate Agent in Canada",
    description:
      "A plain-English, line-by-line guide to CRA Form T2125 for Canadian real estate agents. Know exactly where to enter your commission income, brokerage split, and every deductible expense.",
    url: "https://agentrunway.ca/t2125-guide-real-estate-agents-canada",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/t2125-guide-real-estate-agents-canada",
  },
};

// -- CRA primary-source registry (self-contained per article) ----------------

const CRA_SOURCES = [
  {
    id: 1,
    label: "CRA — Form T2125, Statement of Business or Professional Activities",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html",
  },
  {
    id: 2,
    label: "CRA — Expenses section of Form T2125",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/expenses-section-form-t2125.html",
  },
  {
    id: 3,
    label: "CRA — Line 9936, Capital cost allowance (T2125)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/line-9936-capital-cost-allowance.html",
  },
  {
    id: 4,
    label: "CRA — T4002, Self-employed Business, Professional, Commission… Income — Chapter 3 (Expenses)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-5.html",
  },
  {
    id: 5,
    label: "CRA — Business-use-of-home expenses (T2125)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html",
  },
  {
    id: 6,
    label: "CRA — Calculating business-use-of-home expenses",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/calculating-business-use-home-expenses.html",
  },
  {
    id: 7,
    label: "CRA — Motor vehicle expenses",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/business-income-tax-reporting/business-expenses/motor-vehicle-expenses.html",
  },
  {
    id: 8,
    label: "CRA — File a GST/HST return",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/file-gst-hst-return.html",
  },
  {
    id: 9,
    label: "CRA — Classes of depreciable property (CCA classes 8, 10, 12 and 50)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/claiming-capital-cost-allowance/classes-depreciable-property.html",
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

// -- JSON-LD structured data --------------------------------------------------

const JSON_LD_ARTICLE = articleSchema({
  headline: "How to Fill Out T2125 as a Real Estate Agent in Canada",
  description:
    "A line-by-line guide to CRA Form T2125 for self-employed real estate agents in Canada, covering industry code, commission income, deductible expenses, and common filing mistakes.",
  url: "/t2125-guide-real-estate-agents-canada",
  datePublished: "2025-04-01",
  dateModified: "2026-10-13",
});

const JSON_LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Do I need to file T2125 if my brokerage gives me a T4A?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The T4A reports the gross commission your brokerage paid you, but it does not report your expenses. As a self-employed agent, you file T2125 to report that income and claim all of your business expenses against it. The net result flows to your T1 personal return.",
      },
    },
    {
      "@type": "Question",
      name: BROKERAGE_SPLIT_FAQ.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: BROKERAGE_SPLIT_FAQ.answer,
      },
    },
    {
      "@type": "Question",
      name: HOME_OFFICE_FAQ.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${HOME_OFFICE_FAQ.conditions}. ${HOME_OFFICE_FAQ.line}. ${HOME_OFFICE_FAQ.limit}.`,
      },
    },
    {
      "@type": "Question",
      name: "What is the industry code for real estate agents on T2125?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The NAICS industry code for real estate agents and brokers is 531210. You enter this in Part 1 of the T2125 form under business identification.",
      },
    },
  ],
};

// -- Expense line data --------------------------------------------------------

// Part 4 of the form, in the form's order. `line.label` is the form's own
// label. Business-use-of-home is not in this list: on the form it is Part 7,
// entered on line 9945 in Part 5.
const EXPENSE_LINES: {
  line: T2125Line;
  description: string;
  /** CRA_SOURCES ids for a description that states a CRA rule. */
  sources?: number[];
}[] = [
  {
    line: lineForItem("marketing_ads"),
    description:
      "Social media ads, Google Ads, print flyers, signage, Just Listed and Just Sold cards, professional photography.",
  },
  {
    line: lineForItem("meals_client"),
    description:
      "Client meals, coffee meetings, client appreciation events. CRA's guide gives the maximum claim for food, beverages and entertainment as 50% of the amount.",
    sources: [4],
  },
  {
    line: lineForItem("prof_eo"),
    description: "Errors and omissions (E&O) insurance premiums.",
  },
  {
    line: t2125Line("8710"),
    description:
      "Interest on business loans or lines of credit, and business bank account fees.",
  },
  {
    line: lineForItem("prof_board_mls"),
    description:
      "Real estate board dues, MLS fees, CREA fees, provincial regulator fees (RECO, RECBC and others), lockbox fees.",
  },
  {
    line: t2125Line("8810"),
    description:
      "CRA's guide lists pens, pencils, paper clips, stationery and stamps as office expenses. It names calculators, filing cabinets, chairs and a desk as capital property, which is claimed as capital cost allowance and not on this line.",
    sources: [4],
  },
  {
    line: lineForItem("office_supplies"),
    description:
      "Agent Runway's T2125 pre-fill puts office supplies and software subscriptions (CRM, e-signature, MLS tools) on this line.",
  },
  {
    line: lineForItem("prof_accounting"),
    description: "Accountant fees, bookkeeper fees, legal fees related to the business.",
  },
  {
    line: MANAGEMENT_FEES_LINE,
    description:
      "CRA's guide describes this line as management and administration fees, including bank charges, incurred to run the business. The T2125 has no line named for a brokerage split. This guide places the split here; which line a return uses is the preparer's call.",
    sources: [4],
  },
  {
    line: t2125Line("9200"),
    description:
      `Flights, hotels and ground transportation for business travel (conferences, out-of-town showings). Day-to-day vehicle use is on ${VEHICLE_LINE.ref}.`,
  },
  {
    line: lineForItem("office_phone"),
    description:
      "CRA's guide puts telephone expenses on this line with utilities. For a cellphone it gives the deductible amount as the percentage of airtime expenses used to earn business income. Agent Runway's T2125 pre-fill puts the business phone and internet here.",
    sources: [4],
  },
  {
    line: VEHICLE_LINE,
    description:
      "Fuel, insurance, maintenance, lease payments and parking, at the business-use share. Per CRA, that share is the kilometres driven to earn business income against the total kilometres driven, from a record of both.",
    sources: [7],
  },
  {
    line: t2125Line("9936"),
    description:
      "Capital cost allowance on capital property such as a laptop, camera, drone or furniture, claimed over several years by CCA class. CRA's class list puts computer hardware in Class 50 (55%) and furniture in Class 8 (20%).",
    sources: [3, 9],
  },
  {
    line: lineForItem("other_misc"),
    description:
      "Expenses with no line of their own. Agent Runway's T2125 pre-fill puts client gifts, courses and conferences here. CRA's guide covers convention expenses under this line and allows the cost of up to two conventions a year.",
    sources: [4],
  },
];

// -- Page ---------------------------------------------------------------------

export default function T2125GuidePage() {
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

      {/* -- Navigation -- */}
      <MarketingNav />

      <main>

        {/* ================================================================
            HERO
        ================================================================ */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-400">
              <FileText className="h-3.5 w-3.5" />
              CRA Filing Guide &middot; 2025
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              How to Fill Out T2125 as a Real Estate Agent in Canada
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Every self-employed agent in Canada is required to file a T2125
              <CRACite id={1} /> with their tax return. This is your
              line-by-line guide &mdash; written specifically for agents, not
              accountants.
            </p>
            <p className="mt-3 text-xs text-slate-500">10 min read</p>
          </div>
        </section>

        {/* ================================================================
            TOP DISCLAIMER
        ================================================================ */}
        <section className="bg-white px-6 pt-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs leading-relaxed text-amber-700">
                <strong className="text-amber-800">General information only — not tax advice.</strong>{" "}
                This article describes the CRA-published mechanics of Form
                T2125 for self-employed real estate agents. Line numbers,
                eligible expense categories, and CCA classes are reviewed by
                CRA annually and may change. Individual circumstances vary.
                Always verify current rules against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA&apos;s Form T2125 page
                </a>{" "}
                and consult a qualified accountant or tax professional before
                making any filing decision.{" "}
                <a href="/terms" className="underline underline-offset-2 hover:text-amber-900">
                  Terms of Service
                </a>.
              </p>
            </div>
          </div>
        </section>

        {/* ================================================================
            WHAT IS T2125?
        ================================================================ */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                What is the T2125?
              </h2>
              <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-600">
                <p>
                  The T2125 &mdash; officially called the <em>Statement of Business
                  or Professional Activities</em> &mdash; is the CRA form where
                  self-employed individuals report their business income and
                  expenses<CRACite id={1} />. As a real estate agent operating
                  as an independent contractor (which is the vast majority of
                  agents in Canada), the form is completed and attached to the
                  T1 personal income tax return every year<CRACite id={1} />.
                </p>
                <p>
                  Your fiscal period is typically January&nbsp;1 to
                  December&nbsp;31. The filing deadline for self-employed
                  individuals is June&nbsp;15, but any balance owing is still due
                  by April&nbsp;30.
                </p>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ================================================================
            BEFORE YOU START
        ================================================================ */}
        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Before you start: what you need
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Gather the following before you sit down to fill out the T2125.
                Having these ready will save you time and reduce errors.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  {
                    label: "T4A slips from your brokerage",
                    detail: "Shows total gross commission paid to you during the tax year.",
                  },
                  {
                    label: "Business expenses organised by category",
                    detail:
                      "Receipts, bank statements, or accounting software reports broken down by advertising, vehicle, office, etc.",
                  },
                  {
                    label: "Home office measurements",
                    detail:
                      "Square footage of your dedicated workspace and total home area, plus related bills (rent/mortgage interest, utilities, insurance).",
                  },
                  {
                    label: "Vehicle logbook",
                    detail:
                      "Total kilometres driven and business kilometres driven during the year, with trip-by-trip records.",
                  },
                  {
                    label: "Capital cost allowance (CCA) schedule",
                    detail:
                      "List of depreciable assets (computer, camera, drone) with purchase dates, costs, and CCA class.",
                  },
                ].map((item) => (
                  <li
                    key={item.label}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                      &#10003;
                    </span>
                    <div>
                      <p className="font-semibold text-slate-800">{item.label}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ================================================================
            LINE-BY-LINE BREAKDOWN
        ================================================================ */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Line-by-line breakdown
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                The T2125 is a long form, but not every section applies to every
                agent. Below is a walk-through of the parts that matter most for
                real estate professionals.
              </p>

              {/* -- Part 1: Business Identification -- */}
              <div className="mt-10">
                <h3 className="text-lg font-bold text-slate-800">
                  Part 1: Business Identification
                </h3>
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Field</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">
                          What to enter
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-4 py-3 font-medium text-slate-700">Industry code</td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>531210</strong> &mdash; Real estate agents and
                          brokers
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-medium text-slate-700">Business name</td>
                        <td className="px-4 py-3 text-slate-600">
                          Your legal name, or your registered trade name if you
                          operate under one
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-medium text-slate-700">Fiscal period</td>
                        <td className="px-4 py-3 text-slate-600">
                          January&nbsp;1 to December&nbsp;31 (for most agents)
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-medium text-slate-700">Partnership</td>
                        <td className="px-4 py-3 text-slate-600">
                          Select &ldquo;No&rdquo; unless you operate within a
                          formal partnership structure
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* -- Part 3: Income -- */}
              <div className="mt-10">
                <h3 className="text-lg font-bold text-slate-800">
                  Part 3: Income (Lines {ADJUSTED_SALES_LINE.number} to{" "}
                  {GROSS_INCOME_LINE.number})
                  <CRACite id={1} />
                </h3>
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="w-24 px-4 py-3 text-left font-semibold text-slate-700">
                          Line
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">3A</td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>Gross sales, commissions, or fees.</strong>{" "}
                          Part 3A of the form starts from gross commissions
                          with the GST/HST collected included, then takes the
                          GST/HST back off. This is the commission before the
                          brokerage&apos;s share.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                          {ADJUSTED_SALES_LINE.number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>Adjusted gross sales.</strong> The result
                          of Part 3A, carried into Part 3C.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                          {OTHER_INCOME_LINE.number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>{OTHER_INCOME_LINE.label}.</strong>{" "}
                          Business income that is not commission, such as a
                          referral fee received.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                          {GROSS_INCOME_LINE.number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>{GROSS_INCOME_LINE.label}.</strong>{" "}
                          Line {ADJUSTED_SALES_LINE.number} plus reserves
                          deducted last year and other income.
                          The form says to report it on the return as{" "}
                          {t2125ReturnLinesPhrase("gross")}.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm leading-relaxed text-emerald-800">
                    <strong>The brokerage split is not taken off here.</strong>{" "}
                    The brokerage&apos;s share is an expense in Part&nbsp;4
                    (this guide places it on {MANAGEMENT_FEES_LINE.ref}), not a
                    reduction of the income in Part&nbsp;3. Income reported net
                    of the split does not match the gross commission on a T4A
                    slip.
                  </p>
                </div>
              </div>

              {/* -- Part 4: Expenses -- */}
              <div className="mt-10">
                <h3 className="text-lg font-bold text-slate-800">
                  Part 4: Expenses (Lines {EXPENSE_LINES[0].line.number}{" "}
                  to {EXPENSE_LINES[EXPENSE_LINES.length - 1].line.number})
                </h3>
                <p className="mt-3 text-sm text-slate-500">
                  These are the lines most relevant to real estate agents
                  <CRACite id={2} />. You may not use every line &mdash; only
                  claim what you actually spent. The 50% rule on meals
                  &amp; entertainment and the rules for capital cost allowance
                  are described in CRA&rsquo;s T4002 self-employed guide
                  <CRACite id={4} />.
                </p>

                <p className="mt-2 text-xs text-slate-500">
                  Motor vehicle expenses (logbook + business-use percentage)
                  follow CRA&rsquo;s motor-vehicle guidance<CRACite id={7} />.
                  Capital cost allowance follows CRA&rsquo;s line-9936 rules
                  <CRACite id={3} />. Business-use-of-home expenses are not in
                  this list: they are worked out in Part&nbsp;7 and entered on{" "}
                  {HOME_LINE.ref}<CRACite id={5} />.
                </p>

                <div className="mt-6 space-y-4">
                  {EXPENSE_LINES.map((item) => (
                    <div
                      key={item.line.number}
                      className="rounded-xl border border-slate-200 bg-white p-5"
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="inline-flex shrink-0 rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-700">
                          {item.line.ref}
                        </span>
                        <h4 className="font-semibold text-slate-800">{item.line.label}</h4>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        {item.description}
                        {item.sources?.map((id) => <CRACite key={id} id={id} />)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* -- Parts 4 and 5: Net income -- */}
              <div className="mt-10">
                <h3 className="text-lg font-bold text-slate-800">
                  Parts 4 and 5: Net income
                  <CRACite id={1} />
                </h3>
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="w-24 px-4 py-3 text-left font-semibold text-slate-700">
                          Line
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                          {TOTAL_EXPENSES_LINE.number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>{TOTAL_EXPENSES_LINE.label}.</strong>{" "}
                          The expense lines above added up, capital cost
                          allowance included.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                          {NET_BEFORE_ADJUSTMENTS_LINE.number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>{NET_BEFORE_ADJUSTMENTS_LINE.label}.</strong>{" "}
                          Gross income less line {TOTAL_EXPENSES_LINE.number}.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                          {HOME_LINE.number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>{HOME_LINE.label}.</strong> The allowable
                          claim from Part&nbsp;7 of the form
                          <CRACite id={5} />. {HOME_OFFICE_FAQ.limit}
                          <CRACite id={5} />.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                          {NET_INCOME_LINE.number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>{NET_INCOME_LINE.label}.</strong> For a
                          sole proprietor, line{" "}
                          {NET_BEFORE_ADJUSTMENTS_LINE.number} less line{" "}
                          {HOME_LINE.number}. The form says to report it on the
                          return as {t2125ReturnLinesPhrase("net")}.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Line numbers and labels are those of form {T2125_FORM.edition},
                  read on {T2125_FORM.readOn}<CRACite id={1} />.
                </p>
              </div>

            </ScrollRevealSection>
          </div>
        </section>

        {/* ================================================================
            COMMON MISTAKES
        ================================================================ */}
        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Common mistakes agents make on the T2125
              </h2>
              <p className="mt-3 text-sm text-slate-500">
                HST/GST collected sits on the GST/HST return<CRACite id={8} />
                {" "}— not on T2125<CRACite id={1} />.
              </p>
              <div className="mt-6 space-y-4">
                {[
                  {
                    title: "Deducting brokerage split from income instead of expensing it",
                    detail:
                      `The brokerage\u2019s share is an expense in Part 4 of the form (this guide places it on ${MANAGEMENT_FEES_LINE.ref}), not a reduction of the income in Part 3. Income reported net of the split does not match the gross commission on a T4A slip.`,
                  },
                  {
                    title: "Not keeping a vehicle logbook",
                    detail:
                      "Without a contemporaneous logbook recording business versus personal kilometres, the CRA can deny your entire vehicle expense claim on audit. This is non-negotiable.",
                  },
                  {
                    title: "Claiming 100% of home office without proper calculation",
                    detail:
                      "The proportional square footage of the dedicated workspace relative to total home area applies to home-office expenses, per CRA's published method. Overclaiming is a common audit trigger.",
                  },
                  {
                    title: "Declaring less income than what\u2019s on your T4A",
                    detail:
                      "The CRA already has the T4A on file. Income in Part 3 of the form that is lower than the slip is a mismatch the CRA can see.",
                  },
                  {
                    title: "Counting HST/GST collected as income",
                    detail:
                      "HST/GST collected is not business income \u2014 it\u2019s held in trust for the CRA. It does not appear on T2125. It\u2019s reported separately on the GST/HST return.",
                  },
                  {
                    title: "Claiming personal meals as business expenses",
                    detail:
                      "Only meals with a clear business purpose (client meeting, prospect lunch) qualify \u2014 and even then, only 50% is deductible. Your Tuesday night takeout does not count.",
                  },
                ].map((mistake) => (
                  <div
                    key={mistake.title}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                    <div>
                      <p className="font-semibold text-slate-800">{mistake.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">
                        {mistake.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ================================================================
            FAQ SECTION (matches FAQPage schema)
        ================================================================ */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Frequently asked questions
              </h2>
              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Do I need to file T2125 if my brokerage gives me a T4A?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Yes. The T4A reports the gross commission your brokerage paid
                    you, but it does not report your expenses. As a self-employed
                    agent, you file T2125 to report that income and claim all of
                    your business expenses against it. The net result flows to
                    your T1 personal return.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {BROKERAGE_SPLIT_FAQ.question}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    {BROKERAGE_SPLIT_FAQ.answer}
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {HOME_OFFICE_FAQ.question}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    {HOME_OFFICE_FAQ.conditions}
                    <CRACite id={5} />. {HOME_OFFICE_FAQ.line}
                    <CRACite id={1} />. {HOME_OFFICE_FAQ.limit}
                    <CRACite id={5} />.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    What is the industry code for real estate agents on T2125?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    The NAICS industry code for real estate agents and brokers is{" "}
                    <strong>531210</strong>. You enter this in Part&nbsp;1 of the
                    T2125 form under business identification.
                  </p>
                </div>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ================================================================
            RELATED GUIDES
        ================================================================ */}
        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Related guides
              </h2>
              <div className="mt-6 space-y-3">
                {[
                  {
                    href: "/how-much-should-real-estate-agents-save-for-taxes-canada",
                    label: "See the tax engine's estimate by province",
                  },
                  {
                    href: "/real-estate-agent-business-expenses-canada",
                    label: "Full guide to deductible business expenses",
                  },
                  {
                    href: "/real-estate-agent-tax-planning-canada",
                    label: "Tax planning guide for agents",
                  },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-800">
                      {link.label}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-emerald-600" />
                  </Link>
                ))}
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ================================================================
            EMAIL CAPTURE
        ================================================================ */}
        <section
          className="px-6 py-16 sm:px-10"
          style={{
            background: "rgba(255,255,255,0.02)",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div className="mx-auto max-w-2xl">
            <EmailCapture
              heading="Want to track your T2125 numbers year-round?"
              subheading="Agent Runway automatically categorizes your income and expenses — so filing is just reading a report."
              source="t2125_guide"
              successHeading="You're in."
              successSubtext="Want to see how this works?"
              successCtaLabel="View the Demo"
              successCtaHref="/demo"
              successSecondaryLabel="Or read why I built Agent Runway &rarr;"
              successSecondaryHref="/about"
            />
          </div>
        </section>

        {/* ================================================================
            CLOSING CTA
        ================================================================ */}
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
              Filing shouldn&apos;t feel like guessing.
            </h2>
            <p className="mt-5 text-lg text-slate-400">
              Agent Runway tracks your commission income and expenses throughout
              the year &mdash; so when it&apos;s time to fill out your T2125,
              the numbers are already there.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/demo"
                className="group inline-flex items-center rounded-xl px-10 py-4 text-sm font-bold text-white transition-all duration-200"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  boxShadow: "0 0 40px rgba(99,102,241,0.4)",
                }}
              >
                Try Agent Runway Free
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Read the Founder Story
              </Link>
            </div>

            {/* Soft CTA to free tax estimator */}
            <p className="mt-6 text-sm text-slate-400">
              Want a quick estimate first?{" "}
              <Link
                href="/tools/realtor-tax-estimator"
                className="font-semibold text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                Try the free Canadian Realtor Tax Estimator →
              </Link>
            </p>
          </div>
        </section>

        {/* ================================================================
            SOURCES
        ================================================================ */}
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

        {/* ================================================================
            DISCLAIMER
        ================================================================ */}
        <section className="bg-white px-6 py-10 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed text-amber-800">
                <strong>Disclaimer:</strong> This guide is for educational
                purposes only and does not constitute tax, legal, or financial
                advice. Tax rules change frequently and individual circumstances
                vary. Always consult a qualified accountant or tax professional
                for advice specific to your situation. Agent Runway assumes no
                liability for tax-related decisions.
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* -- Footer -- */}
      <MarketingFooter />
    </div>
  );
}
