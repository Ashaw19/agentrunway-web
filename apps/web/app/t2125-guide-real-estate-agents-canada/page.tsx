import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle, FileText } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

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
  dateModified: "2026-05-10",
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
      name: "Where do I enter my brokerage commission split on T2125?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your brokerage split (the portion of commission your brokerage keeps) goes on Line 8871 \u2014 Management and administration fees. Do not subtract it from your gross income on Line 8000. Report the full commission amount as income, then deduct the brokerage\u2019s share as an expense.",
      },
    },
    {
      "@type": "Question",
      name: "Can I claim a home office on T2125 as a real estate agent?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, if you use a dedicated space in your home regularly and exclusively for business. You can claim a proportional share of rent or mortgage interest, property tax, utilities, insurance, and internet on Line 8810. The proportion is typically calculated by square footage of the office versus total home area.",
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

const EXPENSE_LINES: {
  line: string;
  label: string;
  description: string;
  tip: string;
}[] = [
  {
    line: "8521",
    label: "Advertising & marketing",
    description:
      "Social media ads, Google Ads, print flyers, signage, Just Listed/Just Sold cards, professional photography costs.",
    tip: "Agent tip: This is often one of your largest deductions. Keep every receipt and screenshot of digital ad spend.",
  },
  {
    line: "8590",
    label: "Business taxes, fees, licences",
    description:
      "Real estate board dues, MLS fees, CREA fees, provincial regulator fees (RECO, RECBC, etc.), lockbox fees.",
    tip: "Agent tip: Include your annual board membership renewal, technology levy, and any mandatory insurance levies from your board.",
  },
  {
    line: "8620",
    label: "Insurance",
    description: "Errors & omissions (E&O) insurance premiums.",
    tip: "Agent tip: If your brokerage deducts E&O from your commission, it still shows here as an expense \u2014 the full commission goes on Line 8000.",
  },
  {
    line: "8640",
    label: "Interest & bank charges",
    description:
      "Interest on business loans or lines of credit, business bank account fees, payment processing fees.",
    tip: "Agent tip: If you carry a business credit card balance, the interest portion is deductible here.",
  },
  {
    line: "8690",
    label: "Meals & entertainment",
    description:
      "Client meals, coffee meetings, client appreciation events. Only 50% of the amount is deductible.",
    tip: "Agent tip: Record who you met, the business purpose, and keep the itemised receipt. CRA auditors look closely at this category.",
  },
  {
    line: "8710",
    label: "Office expenses",
    description:
      "Office supplies, printer ink, stationery, small software subscriptions (CRM, e-signature, etc.).",
    tip: "Agent tip: Your Agent Runway subscription, MLS tools, and digital signature platform all belong here.",
  },
  {
    line: "8810",
    label: "Office-in-home expenses",
    description:
      "Proportional share of rent or mortgage interest, property tax, utilities, home insurance, internet \u2014 based on square footage of your dedicated workspace.",
    tip: "Agent tip: Measure your office space carefully. The CRA formula is (office sq ft / total home sq ft) \u00d7 eligible expenses.",
  },
  {
    line: "8860",
    label: "Professional fees",
    description: "Accountant fees, bookkeeper fees, legal fees related to your business.",
    tip: "Agent tip: Your tax preparation fee for the business portion of your return is deductible here.",
  },
  {
    line: "8871",
    label: "Management & administration fees",
    description:
      "This is where your brokerage split goes \u2014 the portion of commission your brokerage retains.",
    tip: "Agent tip: This is the most important line for agents. Your brokerage\u2019s share is NOT subtracted from income \u2014 it goes here as an expense.",
  },
  {
    line: "8910",
    label: "Travel",
    description:
      "Flights, hotels, and meals for business travel (conferences, out-of-town showings). Not regular vehicle use.",
    tip: "Agent tip: OREA or provincial association conferences count here. Keep boarding passes and hotel receipts.",
  },
  {
    line: "8940",
    label: "Telephone & internet",
    description:
      "Business portion of your cell phone plan, home internet (if not already claimed under home office), and any dedicated business phone line.",
    tip: "Agent tip: If you use one phone for both personal and business, estimate the business-use percentage and apply it consistently.",
  },
  {
    line: "9180",
    label: "Motor vehicle expenses",
    description:
      "Gas, insurance, maintenance, lease payments, parking \u2014 multiplied by your business-use percentage from your vehicle logbook.",
    tip: "Agent tip: A logbook is required by CRA. Without one, the CRA can deny the entire vehicle claim on audit.",
  },
  {
    line: "9270",
    label: "Capital cost allowance (CCA)",
    description:
      "Depreciation on capital assets: laptop, camera, drone, furniture. Claimed over multiple years based on CCA class and rate.",
    tip: "Agent tip: A laptop is Class 50 (55% rate). A camera is Class 8 (20% rate). Your accountant can calculate the optimal claim.",
  },
  {
    line: "9281",
    label: "Other expenses",
    description:
      "Anything that doesn\u2019t fit above: staging supplies, courier fees, client gifts (up to $500 each), virtual tour software.",
    tip: "Agent tip: Always document what the expense was for. \u201COther\u201D is a catch-all, but you still need receipts and a clear business purpose.",
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
                  Part 1 &mdash; Business Identification
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

              {/* -- Part 2: Business Income -- */}
              <div className="mt-10">
                <h3 className="text-lg font-bold text-slate-800">
                  Part 2 &mdash; Business Income (Lines 8000&ndash;8230)
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
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">8000</td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>Gross professional fees</strong> &mdash; Enter
                          the total commission amount from your T4A slip(s). This
                          is your <em>gross</em> commission before your brokerage
                          takes its split.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">8230</td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>Subcontracts / returns</strong> &mdash;
                          Subtract any adjustments, returns, or allowances. Most
                          agents leave this at zero.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm leading-relaxed text-emerald-800">
                    <strong>Important:</strong> Report the full gross commission
                    from your T4A &mdash; do not subtract your brokerage split
                    here. The brokerage&apos;s share goes under expenses
                    (Line&nbsp;8871). If you subtract it from income, your
                    numbers won&apos;t match what the CRA has on file and you may
                    trigger a review.
                  </p>
                </div>
              </div>

              {/* -- Part 3: Business Expenses -- */}
              <div className="mt-10">
                <h3 className="text-lg font-bold text-slate-800">
                  Part 3 &mdash; Business Expenses (Lines 8521&ndash;9281)
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
                  <CRACite id={3} />. Office-in-home rules are covered above
                  <CRACite id={5} />.
                </p>

                <div className="mt-6 space-y-4">
                  {EXPENSE_LINES.map((item) => (
                    <div
                      key={item.line}
                      className="rounded-xl border border-slate-200 bg-white p-5"
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="inline-flex shrink-0 rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-700">
                          Line {item.line}
                        </span>
                        <h4 className="font-semibold text-slate-800">{item.label}</h4>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        {item.description}
                      </p>
                      <p className="mt-2 text-sm italic leading-relaxed text-emerald-700">
                        {item.tip}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* -- Part 4: Net Income -- */}
              <div className="mt-10">
                <h3 className="text-lg font-bold text-slate-800">
                  Part 4 &mdash; Net Income Calculation
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
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">9369</td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>Total expenses</strong> &mdash; Sum of all
                          expense lines above.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">9945</td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>Net income (loss)</strong> &mdash; Gross income
                          minus total expenses. This is your net
                          self-employment income.
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-700">9946</td>
                        <td className="px-4 py-3 text-slate-600">
                          <strong>Your share</strong> &mdash; If you&apos;re a
                          sole proprietor (not a partnership), this equals
                          Line&nbsp;9945. This number flows to Line&nbsp;135 of
                          your T1 personal return.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
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
                      "Your brokerage\u2019s share goes on Line 8871 as an expense \u2014 not subtracted from Line 8000. Doing it wrong creates a mismatch with your T4A and can trigger a CRA review.",
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
                      "The CRA already has your T4A on file. If your Line 8000 is lower than what your brokerage reported, expect a reassessment notice.",
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
                    Where do I enter my brokerage commission split on T2125?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Your brokerage split goes on Line&nbsp;8871 &mdash;
                    Management and administration fees. Report the full gross
                    commission on Line&nbsp;8000 as income, then deduct the
                    brokerage&apos;s share on Line&nbsp;8871 as an expense. Do
                    not subtract it from income directly.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Can I claim a home office on T2125 as a real estate agent?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Yes, if you use a dedicated space in your home regularly and
                    exclusively for business<CRACite id={5} />. You can claim a
                    proportional share of rent or mortgage interest, property
                    tax, utilities, insurance, and internet on Line&nbsp;8810
                    <CRACite id={5} />. The proportion is typically calculated
                    by square footage of the office versus total home area
                    <CRACite id={6} />.
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
                    label: "Calculate your tax set-aside",
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
