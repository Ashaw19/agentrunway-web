import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle, Receipt } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Real Estate Agent Business Expenses You Can Deduct in Canada",
  description:
    "A practical guide to every deduction available to self-employed Canadian real estate agents — organized by CRA category, with T2125 line references.",
  openGraph: {
    title: "Real Estate Agent Business Expenses You Can Deduct in Canada",
    description:
      "Every deductible business expense for Canadian real estate agents, organized by CRA T2125 category with line references. Advertising, vehicle, home office, and more.",
    url: "https://agentrunway.ca/real-estate-agent-business-expenses-canada",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/real-estate-agent-business-expenses-canada",
  },
};

// ── CRA primary-source registry (self-contained per article) ────────────────

const CRA_SOURCES = [
  {
    id: 1,
    label: "CRA — Form T2125 (Statement of Business or Professional Activities)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html",
  },
  {
    id: 2,
    label: "CRA — Expenses section of form T2125",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/expenses-section-form-t2125.html",
  },
  {
    id: 3,
    label: "CRA — Motor vehicle expenses (self-employed)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/business-income-tax-reporting/business-expenses/motor-vehicle-expenses.html",
  },
  {
    id: 4,
    label: "CRA — Business-use-of-home expenses",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html",
  },
  {
    id: 5,
    label: "CRA — Calculating business-use-of-home expenses",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/calculating-business-use-home-expenses.html",
  },
  {
    id: 6,
    label: "CRA — Line 9936: Capital cost allowance (CCA)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/line-9936-capital-cost-allowance.html",
  },
  {
    id: 7,
    label: "CRA — Self-employed: Chapter 3 — Expenses (T4002, includes meals 50% rule)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-5.html",
  },
  {
    id: 8,
    label: "CRA — Keeping records (six-year retention rule)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/keeping-records.html",
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
      className="ml-0.5 align-super text-[0.65em] font-semibold text-emerald-700 no-underline hover:underline"
    >
      [{id}]
    </a>
  );
}

// ── JSON-LD structured data ──────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline: "Real Estate Agent Business Expenses You Can Deduct in Canada",
  description:
    "A practical guide to every deduction available to self-employed Canadian real estate agents — organized by CRA category, with T2125 line references.",
  url: "/real-estate-agent-business-expenses-canada",
  datePublished: "2025-04-01",
  dateModified: "2026-05-10",
});

const JSON_LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is the brokerage split a deductible business expense?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Per CRA's expense classifications, the portion of gross commission paid to a brokerage is a deductible business expense, reported on Line 8871 (Management and admin fees) of the T2125. A brokerage split that retains 20% of GCI produces an expense equal to 20% of GCI on Line 8871.",
      },
    },
    {
      "@type": "Question",
      name: "What expense ratio is typical for a Canadian real estate agent?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Total expense ratios for active Canadian real estate agents commonly fall in the 25 to 30 percent range of gross commission income, covering brokerage splits, marketing, vehicle costs, board dues, and other business expenses. Ratios materially above that range may attract closer CRA review. The 25 to 30 percent figure is a descriptive observation, not a CRA-published threshold.",
      },
    },
    {
      "@type": "Question",
      name: "Are receipts required for every business expense?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CRA's record-keeping rule indicates that supporting documentation is retained for every business expense claimed. Receipts, invoices, bank statements, and contracts are retained for at least six years from the end of the tax year. Digital copies that are legible and complete are accepted.",
      },
    },
    {
      "@type": "Question",
      name: "How does CRA treat a phone used for both personal and business?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Per CRA, only the business-use portion of a mixed-use phone is deductible. The business-use percentage is determined on a reasonable basis. For active real estate agents, percentages in the 60 to 80 percent range are commonly considered reasonable, subject to CRA's facts-and-circumstances review — the percentage applies only when it can be supported in audit.",
      },
    },
    {
      "@type": "Question",
      name: "What happens when supporting documentation for an expense is missing?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Per CRA's published audit treatment, an expense without supporting documentation may be disallowed in a review. A disallowed expense increases net business income, which results in additional tax plus interest on the underpayment, and penalties may apply in some cases. CRA may reassess up to three years back for most returns, or six years where negligence is suspected.",
      },
    },
  ],
};

// ── Expense category data ────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  {
    name: "Advertising & Marketing",
    line: "Line 8521",
    included: [
      "Website hosting and domain registration",
      "Social media ads (Facebook, Instagram, Google)",
      "Signage (for sale signs, open house signs)",
      "Business cards and flyers",
      "Virtual tours and 3D walkthroughs",
      "Professional photography and drone footage",
      "Staging costs",
      "Open house materials and refreshments",
      "Print advertising and mailers",
    ],
    notIncluded: [
      "Personal social media spending",
      "Clothing purchased for photo shoots",
      "Personal branding that is not business-related",
    ],
    tip: "Digital marketing costs are fully deductible per CRA's expense list and are often the largest single category for active agents.",
  },
  {
    name: "Business Taxes, Fees & Licenses",
    line: "Line 8760",
    included: [
      "Real estate board dues (CREA, provincial, local)",
      "MLS fees and lockbox fees",
      "Brokerage desk fees (if flat fee arrangement)",
      "Errors & Omissions (E&O) insurance premiums",
      "Business license fees",
      "Provincial regulatory fees (RECO, RECBC, etc.)",
    ],
    notIncluded: [
      "Personal insurance premiums (life, health)",
      "Income tax payments",
      "Penalties or fines",
    ],
    tip: "CREA and provincial board dues commonly fall in the $2,000\u20134,000 per year range, depending on the province.",
  },
  {
    name: "Management & Admin Fees",
    line: "Line 8871",
    included: [
      "Brokerage commission split",
      "Referral fees paid to other agents",
      "Administrative assistant wages",
      "Virtual assistant services",
      "Transaction coordinator fees",
    ],
    notIncluded: [
      "Your own salary draws or owner distributions",
      "Personal assistant costs unrelated to business",
    ],
    tip: "Line 8871 is where the brokerage commission split is reported. If the brokerage retains 20% of GCI, that 20% is an expense on Line 8871.",
  },
  {
    name: "Office Expenses",
    line: "Line 8810",
    included: [
      "Software subscriptions (CRM, transaction management, design tools)",
      "Office supplies (paper, ink, toner, pens)",
      "Postage and courier fees",
      "Printer and scanner supplies",
      "Cloud storage subscriptions",
    ],
    notIncluded: [
      "Personal computer use (only business portion)",
      "Personal phone plan (only business portion)",
      "Home furnishings not used exclusively for business",
    ],
    tip: "SaaS subscriptions are commonly underreported. A complete software inventory captures every recurring deductible cost.",
  },
  {
    name: "Vehicle Expenses",
    line: "Line 9281",
    included: [
      "Gas and fuel",
      "Insurance (business-use portion)",
      "Maintenance and repairs (business-use portion)",
      "Parking fees for client meetings and showings",
      "Lease payments (business-use portion)",
      "CCA depreciation if vehicle is owned",
      "Car washes (business-use portion)",
    ],
    notIncluded: [
      "Commuting from home to your brokerage office",
      "Personal trips and errands",
      "Traffic tickets and fines",
    ],
    critical:
      "CRA's published expectation for the vehicle claim is a logbook. Without supporting records, the deduction may be disallowed. CRA's logbook entries cover date, destination, client or business purpose, and kilometres for each business trip.",
    tip: "Reported business-use percentages for active agents commonly fall in the 50\u201370% range. Percentages above 80% may attract closer CRA review.",
  },
  {
    name: "Home Office",
    line: "Line 8810",
    included: [
      "Proportional share of rent or mortgage interest",
      "Utilities (heat, hydro, water)",
      "Property tax (proportional)",
      "Home insurance (proportional)",
      "Internet (proportional)",
      "Maintenance and minor repairs (proportional)",
    ],
    notIncluded: [
      "Mortgage principal payments",
      "Major renovations (except as CCA)",
      "Furniture not used exclusively for business",
    ],
    calculation:
      "Square footage of the office \u00f7 total home square footage \u00d7 eligible expenses = the deductible portion (per CRA's business-use-of-home calculation method).",
    tip: "The home office deduction can be material, and CRA reviews it closely. Documented floor-plan measurements support the claim if it is reviewed.",
  },
  {
    name: "Meals & Entertainment",
    line: "Line 8523",
    included: [
      "Client meals (only 50% deductible)",
      "Event tickets for client entertaining (only 50% deductible)",
      "Open house refreshments (fully deductible as advertising)",
    ],
    notIncluded: [
      "Your own lunches eaten alone",
      "Team meals without clients present",
      "Alcohol at personal events",
      "Meals with no documented business purpose",
    ],
    tip: "CRA's documentation expectation for meals covers the receipt plus the attendees and business purpose. A receipt labelled only 'lunch' may not satisfy the supporting-documentation requirement.",
  },
  {
    name: "Professional Fees",
    line: "Line 8860",
    included: [
      "Accounting and bookkeeping fees",
      "Legal fees for business matters",
      "Tax preparation fees",
      "Business consulting fees",
    ],
    notIncluded: [
      "Personal legal matters (divorce, estate, etc.)",
      "Personal financial planning fees",
    ],
    tip: "Accountant and tax-preparation fees are themselves deductible business expenses, which lowers the effective cost of professional tax help.",
  },
  {
    name: "Education & Training",
    line: "Line 8523 / 8760",
    included: [
      "Real estate continuing education courses",
      "Conference and convention registration fees",
      "Coaching and mentorship programs",
      "Designation courses (ABR, SRES, etc.)",
      "Industry webinars and workshops",
    ],
    notIncluded: [
      "Initial licensing courses (capital expense)",
      "Courses unrelated to real estate",
    ],
    tip: "Continuing-education fees are fully deductible. Conference travel costs (flights, hotels) are deductible separately on the travel line.",
  },
  {
    name: "Telephone & Internet",
    line: "Line 8940",
    included: [
      "Business portion of cell phone plan",
      "Dedicated business phone line",
      "Internet (business-use portion, or proportional if home office)",
      "VoIP and communication app subscriptions",
    ],
    notIncluded: [
      "Personal phone plan (only business portion is deductible)",
      "Streaming services",
    ],
    tip: "When a single phone is used for both personal and business purposes, business-use percentages in the 60\u201380% range are commonly considered reasonable for active real estate agents, subject to CRA's facts-and-circumstances review.",
  },
  {
    name: "Travel",
    line: "Line 8910",
    included: [
      "Flights for business travel (conferences, out-of-town showings)",
      "Hotel accommodations for business trips",
      "Meals during business travel (at 50%)",
      "Ground transportation (taxis, rideshares) during business travel",
    ],
    notIncluded: [
      "Personal vacations (even if partially business-related)",
      "Commuting to your regular office",
      "Travel for personal errands",
    ],
    tip: "Per CRA, only the business portion of a mixed business-and-personal trip is deductible. A documented itinerary supports the apportionment if the claim is reviewed.",
  },
  {
    name: "Capital Cost Allowance (CCA)",
    line: "Line 9936",
    included: [
      "Computer and laptop (depreciated over time)",
      "Camera and photography equipment",
      "Drone",
      "Office furniture (items over ~$500)",
      "Vehicle (if owned, not leased)",
    ],
    notIncluded: [
      "Items under ~$500 (expense these immediately as office supplies)",
      "Land (land does not depreciate)",
    ],
    tip: "Small items under approximately $500 are commonly expensed as office supplies rather than capitalized, per CRA's published treatment for low-value assets.",
  },
];

const MISSED_EXPENSES = [
  "Home insurance (proportional for home office)",
  "Professional development and coaching programs",
  "Client gift expenses (up to $500 per person per year)",
  "Association and networking group memberships",
  "Bank fees on business accounts",
  "Vehicle washes and detailing (business-use portion)",
  "Cloud storage and backup services",
  "Postage and courier fees",
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BusinessExpensesGuidePage() {
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

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ════════════════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-400">
              <Receipt className="h-3.5 w-3.5" />
              Expense Guide &middot; CRA 2025
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Real Estate Agent Business Expenses You Can Deduct in Canada
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              A practical guide to every deduction available to self-employed
              Canadian real estate agents &mdash; organized by CRA category, with
              T2125 line references.
            </p>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            THE SHORT ANSWER
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                The short answer
              </h2>
              <div className="mt-6 space-y-5 text-base leading-relaxed text-slate-600">
                <p>
                  For a self-employed real estate agent, CRA states an expense
                  is deductible when it was incurred to earn business income
                  <CRACite id={2} />. CRA expects expenses to be{" "}
                  <strong>reasonable</strong>, <strong>documented</strong>, and{" "}
                  <strong>directly related to the real estate business</strong>
                  <CRACite id={2} />.
                </p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5">
                  <p className="text-sm font-semibold text-emerald-800">
                    The general principle CRA applies
                  </p>
                  <p className="mt-1 text-base text-emerald-700">
                    An expense that would not have been incurred without the
                    business may meet CRA&apos;s deductibility test
                    <CRACite id={2} />. Whether a specific expense qualifies
                    depends on facts an accountant would verify.
                  </p>
                </div>
                <p>
                  <strong>Observed industry pattern:</strong> total expense
                  ratios for active Canadian real estate agents commonly fall
                  between <strong>25&ndash;30% of gross commission income</strong>.
                  That range covers brokerage splits, board dues, marketing,
                  vehicle costs, and software subscriptions. The figure is a
                  descriptive observation, not a CRA-published benchmark.
                </p>
                <p>
                  These expenses are reported on the{" "}
                  <strong>T2125 &mdash; Statement of Business or Professional Activities</strong>
                  <CRACite id={1} />, which is filed with the personal T1 tax
                  return. The sections below cover each major category with the
                  specific T2125 line reference<CRACite id={2} />.
                </p>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            EXPENSE CATEGORIES
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Deductible expenses by CRA category
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Each category below maps to a specific line on the{" "}
                <strong>T2125 form</strong><CRACite id={1} />. Understanding
                which expenses belong where makes tax filing cleaner and reduces
                audit risk. Specific guidance on motor vehicle expenses
                <CRACite id={3} />, business-use-of-home expenses
                <CRACite id={4} /><CRACite id={5} />, capital cost allowance on
                line 9936<CRACite id={6} />, and the 50% rule for meals and
                entertainment<CRACite id={7} /> is published by CRA on the
                pages cited.
              </p>
            </ScrollRevealSection>

            <div className="mt-10 space-y-8">
              {EXPENSE_CATEGORIES.map((cat) => (
                <ScrollRevealSection key={cat.name}>
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    {/* Header */}
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-bold text-slate-900">
                        {cat.name}
                      </h3>
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-xs font-semibold text-emerald-700">
                        {cat.line}
                      </span>
                    </div>

                    {/* Included */}
                    <div className="mt-5">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                        What you can deduct
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {cat.included.map((item) => (
                          <li
                            key={item}
                            className="flex items-baseline gap-2 text-sm text-slate-600"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Not Included */}
                    <div className="mt-5">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Not deductible
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {cat.notIncluded.map((item) => (
                          <li
                            key={item}
                            className="flex items-baseline gap-2 text-sm text-slate-500"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Calculation note (home office) */}
                    {"calculation" in cat && cat.calculation && (
                      <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                        <p className="text-xs font-semibold text-blue-700">
                          How to calculate
                        </p>
                        <p className="mt-1 text-sm text-blue-600">
                          {cat.calculation}
                        </p>
                      </div>
                    )}

                    {/* Critical warning (vehicle) */}
                    {"critical" in cat && cat.critical && (
                      <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <p className="text-sm font-medium text-amber-800">
                          {cat.critical}
                        </p>
                      </div>
                    )}

                    {/* Tip */}
                    <p className="mt-5 text-sm italic text-slate-500">
                      {cat.tip}
                    </p>
                  </div>
                </ScrollRevealSection>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            EXPENSES MOST AGENTS MISS
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Expenses most agents miss
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                These are commonly overlooked deductions that can add up to
                hundreds or thousands of dollars per year.
              </p>
              <ul className="mt-6 space-y-3">
                {MISSED_EXPENSES.map((item) => (
                  <li
                    key={item}
                    className="flex items-baseline gap-3 text-base text-slate-700"
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            WHAT CRA LOOKS FOR
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                What CRA looks for in a review
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Real estate agents are among the more frequently reviewed
                self-employed taxpayers in Canada. The published documentation
                expectations below reduce the risk that a deduction is
                disallowed for lack of supporting records.
              </p>
              <ul className="mt-6 space-y-4">
                <li className="flex items-start gap-3 text-base text-slate-700">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    <strong>Receipt retention.</strong> CRA&apos;s published
                    record-keeping rule indicates supporting documents
                    (digital or physical) are retained for a minimum of{" "}
                    <strong>6 years</strong> from the end of the tax year
                    <CRACite id={8} />.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-base text-slate-700">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    <strong>Vehicle logbook.</strong> CRA&apos;s motor vehicle
                    expense guidance indicates a logbook is the central piece
                    of supporting documentation for a vehicle claim
                    <CRACite id={3} />.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-base text-slate-700">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    <strong>Business-purpose documentation.</strong> CRA&apos;s
                    published expectation is that the business purpose of each
                    expense is documented &mdash; particularly for meals,
                    entertainment, and travel<CRACite id={7} />.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-base text-slate-700">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    <strong>Exact amounts.</strong> Figures recorded from
                    receipts at exact amounts may carry more weight in review
                    than rounded estimates, which CRA reviewers commonly
                    flag.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-base text-slate-700">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    <strong>Expense ratio context.</strong> Total expense
                    ratios for active Canadian real estate agents commonly
                    fall in the 25&ndash;30% of GCI range. Ratios materially
                    above that range may attract closer review &mdash; the
                    figure is descriptive, not a CRA threshold.
                  </span>
                </li>
              </ul>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            FAQ
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Frequently asked questions
              </h2>
              <div className="mt-8 space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Is the brokerage split a deductible business expense?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Per CRA&apos;s expense classifications<CRACite id={2} />, the
                    portion of gross commission paid to a brokerage is a
                    deductible business expense, reported on Line 8871
                    (Management and admin fees) of the T2125<CRACite id={1} />.
                    A brokerage split that retains 20% of GCI produces an
                    expense equal to 20% of GCI on Line 8871.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    What expense ratio is typical for a Canadian real estate agent?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Total expense ratios for active Canadian real estate agents
                    commonly fall in the 25&ndash;30% range of gross commission
                    income, covering brokerage splits, marketing, vehicle
                    costs, board dues, and other business expenses. Ratios
                    materially above that range may attract closer CRA review.
                    The 25&ndash;30% figure is a descriptive observation, not a
                    CRA-published threshold.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Are receipts required for every business expense?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    CRA&apos;s record-keeping rule indicates that supporting
                    documentation is retained for every business expense
                    claimed<CRACite id={8} />. Receipts, invoices, bank
                    statements, and contracts are retained for at least six
                    years from the end of the tax year<CRACite id={8} />.
                    Digital copies that are legible and complete are accepted.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    How does CRA treat a phone used for both personal and business?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Per CRA, only the business-use portion of a mixed-use phone
                    is deductible<CRACite id={2} />. The business-use
                    percentage is determined on a reasonable basis. For active
                    real estate agents, percentages in the 60&ndash;80% range
                    are commonly considered reasonable, subject to CRA&apos;s
                    facts-and-circumstances review &mdash; the percentage
                    applies only when it can be supported in audit.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    What happens when supporting documentation for an expense is missing?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Per CRA&apos;s published audit treatment, an expense without
                    supporting documentation may be disallowed in a review
                    <CRACite id={8} />. A disallowed expense increases net
                    business income, which results in additional tax plus
                    interest on the underpayment, and penalties may apply in
                    some cases. CRA may reassess up to three years back for
                    most returns, or six years where negligence is suspected.
                  </p>
                </div>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            INTERNAL LINKS
        ════════════════════════════════════════════════════════ */}
        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <ScrollRevealSection>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Related guides
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Link
                  href="/how-much-should-real-estate-agents-save-for-taxes-canada"
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-700">
                    Tax Savings Calculator
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-emerald-500" />
                </Link>
                <Link
                  href="/t2125-guide-real-estate-agents-canada"
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-700">
                    T2125 Filing Guide
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-emerald-500" />
                </Link>
                <Link
                  href="/real-estate-commission-calculator-canada"
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-700">
                    Commission Calculator
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-emerald-500" />
                </Link>
                <Link
                  href="/about"
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <span className="text-sm font-medium text-slate-700 group-hover:text-emerald-700">
                    About Agent Runway
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-emerald-500" />
                </Link>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            SOURCES
        ════════════════════════════════════════════════════════ */}
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
              <p className="mt-2 text-xs text-slate-500">
                Every quantitative or mechanical claim in this article is backed
                by one of the primary sources below. Hand-verified live on
                2026-05-10.
              </p>
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

        {/* ════════════════════════════════════════════════════════
            DISCLAIMER
        ════════════════════════════════════════════════════════ */}
        <section className="bg-white px-6 py-10 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed text-amber-800">
                <strong>Disclaimer:</strong> This guide provides general
                information for educational purposes only and does not constitute
                tax, legal, or financial advice. Tax rules change frequently,
                rates vary by province, and individual circumstances differ.
                Consult a qualified accountant or tax professional for advice
                specific to your situation. Agent Runway assumes no liability for
                tax-related decisions.
              </p>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            EMAIL CAPTURE
        ════════════════════════════════════════════════════════ */}
        <section
          className="px-6 py-16 sm:px-10"
          style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="mx-auto max-w-2xl">
            <EmailCapture
              heading="Want your expenses tracked and categorized automatically?"
              subheading="Agent Runway categorizes every business expense and estimates potential deduction amounts in real time."
              source="expenses_guide"
              variant="dark"
              successHeading="You're in."
              successSubtext="See how expense tracking works."
              successCtaLabel="View the Demo"
              successCtaHref="/demo"
              successSecondaryLabel="Or read why I built Agent Runway →"
              successSecondaryHref="/about"
            />
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════
            CLOSING CTA
        ════════════════════════════════════════════════════════ */}
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
              Stop guessing what you can deduct
            </h2>
            <p className="mt-5 text-lg text-slate-400">
              Agent Runway tracks every business expense by CRA category,
              estimates potential deduction amounts in real time, and shows you exactly
              where your money goes. No spreadsheets. No shoebox of receipts.
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
                className="inline-flex items-center rounded-xl border border-white/20 px-8 py-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
              >
                Read the founder story
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-300">
              Want to see how your expenses affect your tax bill?{" "}
              <Link
                href="/tools/realtor-tax-estimator"
                className="font-semibold text-blue-300 underline underline-offset-2 hover:text-blue-200"
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
