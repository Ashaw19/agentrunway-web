import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle, Receipt } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";
import { EmailCapture } from "@/components/email-capture";

export const metadata: Metadata = {
  title: "Real Estate Agent Business Expenses You Can Deduct in Canada | Agent Runway",
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

// ── JSON-LD structured data ──────────────────────────────────────────────────

const JSON_LD_ARTICLE = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Real Estate Agent Business Expenses You Can Deduct in Canada",
  description:
    "A practical guide to every deduction available to self-employed Canadian real estate agents — organized by CRA category, with T2125 line references.",
  author: { "@type": "Person", name: "Andrew Shaw" },
  publisher: { "@type": "Organization", name: "Agent Runway", url: "https://agentrunway.ca" },
  datePublished: "2025-04-01",
  dateModified: "2025-04-01",
  url: "https://agentrunway.ca/real-estate-agent-business-expenses-canada",
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://agentrunway.ca/real-estate-agent-business-expenses-canada",
  },
};

const JSON_LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I deduct my brokerage split as a business expense?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The portion of your gross commission that goes to your brokerage is a deductible business expense. It is reported on Line 8871 (Management and admin fees) of the T2125 form. If your brokerage keeps 20% of your GCI, that 20% is an expense.",
      },
    },
    {
      "@type": "Question",
      name: "What is a reasonable expense ratio for a real estate agent?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most successful Canadian real estate agents have a total expense ratio between 25% and 30% of their gross commission income. This includes brokerage splits, marketing, vehicle costs, board dues, and all other business expenses. Ratios significantly above 30% may indicate overspending or trigger CRA scrutiny.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need to keep receipts for every business expense?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The CRA requires you to keep supporting documentation for every business expense you claim. Receipts, invoices, bank statements, and contracts must be retained for at least six years from the end of the tax year. Digital copies are acceptable as long as they are legible and complete.",
      },
    },
    {
      "@type": "Question",
      name: "Can I deduct my phone if I use it for both personal and business?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, but only the business-use portion. If you use one phone for both personal and business purposes, you must determine a reasonable business-use percentage. For most active real estate agents, 60% to 80% business use is considered reasonable by the CRA. You must be able to justify the percentage if audited.",
      },
    },
    {
      "@type": "Question",
      name: "What happens if I can't prove a business expense to CRA?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "If you cannot provide supporting documentation for an expense during a CRA audit or review, the deduction will be denied. This increases your net business income, which means you will owe additional tax plus interest on the underpayment. In some cases, penalties may also apply. The CRA can reassess up to three years back for most returns, or six years if they suspect negligence.",
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
    tip: "Digital marketing costs are fully deductible and often the largest single expense category for modern agents.",
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
    tip: "Your CREA/board dues alone can be $2,000\u20134,000/year depending on your province.",
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
    tip: "THIS is where your brokerage split goes. If your brokerage keeps 20% of your GCI, that 20% is an expense on Line 8871.",
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
    tip: "Track every subscription. Most agents underestimate their SaaS costs.",
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
      "You MUST keep a vehicle logbook. Without it, CRA can deny your entire vehicle claim. Record date, destination, client/purpose, and km for every business trip.",
    tip: "Most agents have 50\u201370% business use. CRA may challenge anything above 80%.",
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
      "Square footage of office \u00f7 total home square footage \u00d7 eligible expenses = your deduction.",
    tip: "The home office deduction is valuable but attracts CRA attention. Keep floor plan measurements documented.",
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
    tip: "Keep the receipt AND note who you met and the business purpose. \u2018Lunch\u2019 is not enough.",
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
    tip: "Your accountant\u2019s fee is itself a deductible expense. Factor this in when deciding whether professional tax help is worth it.",
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
    tip: "Continuing education is fully deductible and keeps you competitive. Conference travel costs (flights, hotels) are also deductible separately.",
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
    tip: "If you use one phone for everything, a reasonable business-use percentage is 60\u201380%.",
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
    tip: "If a trip has both business and personal components, only the business portion is deductible. Keep a clear itinerary.",
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
    tip: "Small items under $500 can often be expensed immediately as office supplies rather than capitalized.",
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
                  As a self-employed real estate agent, you can deduct any expense
                  that was incurred to earn business income. The CRA expects
                  expenses to be <strong>reasonable</strong>,{" "}
                  <strong>documented</strong>, and{" "}
                  <strong>directly related to your real estate business</strong>.
                </p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5">
                  <p className="text-sm font-semibold text-emerald-800">
                    The key rule
                  </p>
                  <p className="mt-1 text-base text-emerald-700">
                    If you wouldn&apos;t have spent the money without the
                    business, it&apos;s likely deductible.
                  </p>
                </div>
                <p>
                  <strong>Industry benchmark:</strong> Most successful agents have
                  an expense ratio between{" "}
                  <strong>25&ndash;30% of their gross commission income</strong>.
                  This includes everything from brokerage splits and board dues to
                  marketing, vehicle costs, and software subscriptions.
                </p>
                <p>
                  All of these expenses are reported on the{" "}
                  <strong>T2125 &mdash; Statement of Business or Professional Activities</strong>,
                  which is filed with your personal T1 tax return. The sections
                  below cover every major category, with the specific T2125 line
                  references.
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
                <strong>T2125 form</strong>. Understanding which expenses belong
                where makes tax filing cleaner and reduces audit risk.
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
                What CRA looks for in an audit
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Real estate agents are among the most frequently audited
                self-employed professionals in Canada. The best defence is
                thorough, consistent record-keeping.
              </p>
              <ul className="mt-6 space-y-4">
                <li className="flex items-start gap-3 text-base text-slate-700">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    <strong>Keep all receipts</strong> (digital or physical) for a
                    minimum of <strong>6 years</strong> from the end of the tax
                    year.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-base text-slate-700">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    <strong>Maintain a vehicle logbook</strong> &mdash; this is
                    the single most important piece of documentation for your
                    vehicle claim.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-base text-slate-700">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    <strong>Document the business purpose</strong> of every
                    expense &mdash; especially meals, entertainment, and travel.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-base text-slate-700">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    <strong>Don&apos;t round numbers</strong> &mdash; use exact
                    amounts from receipts. Rounded figures are a red flag.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-base text-slate-700">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    <strong>Keep your expense ratio reasonable</strong> &mdash;
                    25&ndash;30% of GCI is typical for real estate agents. Ratios
                    well above this range attract scrutiny.
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
                    Can I deduct my brokerage split as a business expense?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Yes. The portion of your gross commission that goes to your
                    brokerage is a deductible business expense, reported on Line
                    8871 (Management and admin fees) of the T2125. If your
                    brokerage keeps 20% of your GCI, that 20% is an expense.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    What is a reasonable expense ratio for a real estate agent?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Most successful Canadian real estate agents have a total
                    expense ratio between 25% and 30% of their gross commission
                    income. This includes brokerage splits, marketing, vehicle
                    costs, board dues, and all other business expenses. Ratios
                    significantly above 30% may indicate overspending or trigger
                    CRA scrutiny.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Do I need to keep receipts for every business expense?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Yes. The CRA requires supporting documentation for every
                    business expense you claim. Receipts, invoices, bank
                    statements, and contracts must be retained for at least six
                    years from the end of the tax year. Digital copies are
                    acceptable as long as they are legible and complete.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Can I deduct my phone if I use it for both personal and
                    business?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    Yes, but only the business-use portion. If you use one phone
                    for both personal and business purposes, you must determine a
                    reasonable business-use percentage. For most active real estate
                    agents, 60% to 80% business use is considered reasonable by
                    the CRA. You must be able to justify the percentage if
                    audited.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    What happens if I can&apos;t prove a business expense to CRA?
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-600">
                    If you cannot provide supporting documentation during a CRA
                    audit, the deduction will be denied. This increases your net
                    business income, meaning you will owe additional tax plus
                    interest on the underpayment. In some cases, penalties may also
                    apply. The CRA can reassess up to three years back for most
                    returns, or six years if they suspect negligence.
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
