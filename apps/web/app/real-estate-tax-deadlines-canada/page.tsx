import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle,
  Calculator,
  FileText,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { CharterScarcityStrip } from "@/components/charter-scarcity-strip";
import { articleSchema, breadcrumbSchema, faqSchema } from "@/lib/schema";

const URL = "https://agentrunway.ca/real-estate-tax-deadlines-canada";

export const metadata: Metadata = {
  title: "Canadian Real Estate Agent Tax Deadlines 2026",
  description:
    "Every CRA tax deadline that applies to Canadian real estate agents in 2026 — quarterly instalments, T1 filing, HST/GST, T4A, RRSP. Built for self-employed realtors.",
  openGraph: {
    type: "article",
    url: URL,
    title: "Canadian Real Estate Agent Tax Deadlines 2026",
    description:
      "Every CRA tax deadline that applies to Canadian real estate agents in 2026 — quarterly instalments, T1, HST/GST, T4A, RRSP.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: URL },
};

// ─────────────────────────────────────────────────────────────────────────────
// JSON-LD
// ─────────────────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline: "Canadian Real Estate Agent Tax Deadlines 2026",
  description:
    "Every CRA tax deadline that applies to self-employed Canadian real estate agents in 2026, including quarterly instalments, T1 filing, HST/GST, T4A, and RRSP contributions.",
  url: "/real-estate-tax-deadlines-canada",
  datePublished: "2026-04-15",
  dateModified: "2026-05-10",
});

const JSON_LD_BREADCRUMB = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Tax Deadlines", url: "/real-estate-tax-deadlines-canada" },
]);

const FAQS = [
  {
    question: "What are the 2026 CRA quarterly instalment deadlines for self-employed real estate agents?",
    answer:
      "Quarterly instalment deadlines are the 15th of March, June, September, and December — so March 15, June 15, September 15, and December 15, 2026. CRA requires quarterly instalments if net tax owing was more than $3,000 in the current year or either of the two preceding years ($1,800 for Quebec residents).",
  },
  {
    question: "When is the T1 tax filing deadline for self-employed real estate agents in 2026?",
    answer:
      "Self-employed real estate agents (and their spouses) have until June 15, 2026 to file their T1 personal tax return for the 2025 tax year. However, any balance owing is still due by April 30, 2026 — the CRA charges interest on any amount outstanding after that date, even if the return itself isn't due until June 15.",
  },
  {
    question: "When are T4A slips from my brokerage due?",
    answer:
      "CRA requires brokerages to issue T4A slips to agents and file them by February 28, 2026 for the 2025 tax year. If the T4A has not arrived by early March, contact the brokerage. The T4A reports gross commission paid — not net of the brokerage split.",
  },
  {
    question: "What is the 2026 RRSP contribution deadline for the 2025 tax year?",
    answer:
      "The RRSP contribution deadline is March 2, 2026 (the first 60 days of 2026). Contributions made on or before that date can be deducted against your 2025 taxable income. Your 2025 RRSP deduction limit is on your 2024 Notice of Assessment.",
  },
  {
    question: "When are HST/GST returns due for real estate agents?",
    answer:
      "Once gross commission income exceeds $30,000 over four consecutive calendar quarters, CRA requires the agent to register for GST/HST. Most small suppliers file annually with returns due three months after fiscal year-end — so for a December 31 year-end, the return is due April 30. Instalment payments apply when net tax owing exceeded $3,000 in the prior year, due quarterly on the last day of each quarter following year-end.",
  },
  {
    question: "What happens if I miss a quarterly instalment deadline?",
    answer:
      "The CRA charges instalment interest (currently set quarterly) on any amount paid late or underpaid, calculated from the instalment due date. If the total instalment interest exceeds $1,000, a penalty of 50% of the interest charge above $1,000 is also applied. Missing instalments will not prevent you from filing your T1 return — it just adds to your total cost.",
  },
];

const JSON_LD_FAQ = faqSchema(FAQS);

// ─────────────────────────────────────────────────────────────────────────────
// CRA primary-source registry (self-contained per article)
// All URLs hand-verified live on 2026-05-06.
// ─────────────────────────────────────────────────────────────────────────────

const CRA_SOURCES = [
  {
    id: 1,
    label: "CRA — Important dates for individuals (T1 filing, balance owing)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/important-dates-individuals.html",
  },
  {
    id: 2,
    label: "CRA — Required tax instalments — Due dates",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/due-dates.html",
  },
  {
    id: 3,
    label: "CRA — Required tax instalments — Who has to pay",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/who-pays-instalments.html",
  },
  {
    id: 4,
    label: "CRA — Required tax instalments (overview)",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments.html",
  },
  {
    id: 5,
    label: "CRA — File information returns / slip summaries — When to file (T4A)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/file-information-returns-slip-summaries/when-to-file.html",
  },
  {
    id: 6,
    label: "CRA — When to register for and start charging the GST/HST",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html",
  },
  {
    id: 7,
    label: "CRA — Complete and file a GST/HST return",
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
      className="ml-0.5 align-super text-[0.65em] font-semibold text-blue-400 no-underline hover:underline"
    >
      [{id}]
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deadline data — organized chronologically for 2026 calendar year
// ─────────────────────────────────────────────────────────────────────────────

type DeadlineStatus = "passed" | "upcoming" | "recurring";

interface Deadline {
  date: string;
  formattedDate: string;
  title: string;
  description: string;
  appliesTo: string;
  status: DeadlineStatus;
}

const DEADLINES: Deadline[] = [
  {
    date: "2026-02-28",
    formattedDate: "February 28, 2026",
    title: "T4A slips issued by brokerage",
    description:
      "CRA requires the brokerage to issue the T4A (for 2025 commissions paid) and file it by this date. The T4A shows gross commission — the brokerage split is reported separately on the T2125.",
    appliesTo: "All real estate agents",
    status: "passed",
  },
  {
    date: "2026-03-02",
    formattedDate: "March 2, 2026",
    title: "RRSP contribution deadline (for 2025 tax year)",
    description:
      "Last day to make an RRSP contribution that can be deducted against 2025 taxable income. Your 2025 RRSP limit appears on your 2024 Notice of Assessment.",
    appliesTo: "All taxpayers with RRSP room",
    status: "passed",
  },
  {
    date: "2026-03-15",
    formattedDate: "March 15, 2026",
    title: "Q1 2026 tax instalment",
    description:
      "First quarterly instalment for the 2026 tax year. Required if you owed more than $3,000 in net tax in 2025 or either of the two preceding years ($1,800 in Quebec).",
    appliesTo: "Self-employed agents with 2025 tax owing > $3,000",
    status: "passed",
  },
  {
    date: "2026-04-30",
    formattedDate: "April 30, 2026",
    title: "2025 tax balance due (self-employed)",
    description:
      "Any tax owed on the 2025 T1 return is due by this date — even though the return itself isn't due until June 15. The CRA charges interest from May 1 on any unpaid balance.",
    appliesTo: "All self-employed agents with a 2025 balance owing",
    status: "passed",
  },
  {
    date: "2026-04-30",
    formattedDate: "April 30, 2026",
    title: "GST/HST annual return (December year-end)",
    description:
      "GST/HST registrants filing annually with a December 31 fiscal year-end are required to file their return by this date. Instalments were due throughout the year.",
    appliesTo: "HST-registered agents filing annually",
    status: "passed",
  },
  {
    date: "2026-06-15",
    formattedDate: "June 15, 2026",
    title: "2025 T1 tax return due (self-employed)",
    description:
      "Last day to file your 2025 personal tax return if you (or your spouse) carried on a business in 2025. Balance was due April 30 — this is only the filing deadline, not the payment deadline.",
    appliesTo: "All self-employed agents",
    status: "upcoming",
  },
  {
    date: "2026-06-15",
    formattedDate: "June 15, 2026",
    title: "Q2 2026 tax instalment",
    description:
      "Second quarterly instalment for the 2026 tax year. Based on the CRA's reminder notice or the prior-year / current-year / no-calculation method — whichever minimizes your amount.",
    appliesTo: "Self-employed agents required to pay instalments",
    status: "upcoming",
  },
  {
    date: "2026-09-15",
    formattedDate: "September 15, 2026",
    title: "Q3 2026 tax instalment",
    description:
      "Third quarterly instalment for the 2026 tax year.",
    appliesTo: "Self-employed agents required to pay instalments",
    status: "upcoming",
  },
  {
    date: "2026-12-15",
    formattedDate: "December 15, 2026",
    title: "Q4 2026 tax instalment",
    description:
      "Fourth and final quarterly instalment for the 2026 tax year. Tax-planning moves (RRSP contributions, capital purchases) take effect for the current tax year only if completed by December 31.",
    appliesTo: "Self-employed agents required to pay instalments",
    status: "upcoming",
  },
  {
    date: "2026-12-31",
    formattedDate: "December 31, 2026",
    title: "End of 2026 tax year",
    description:
      "Last day to incur deductible expenses, make charitable donations, and execute CCA-eligible purchases for the 2026 tax year. Receipts dated December 31 qualify; January 1 does not.",
    appliesTo: "All taxpayers",
    status: "upcoming",
  },
  {
    date: "2027-03-01",
    formattedDate: "March 1, 2027",
    title: "2026 RRSP contribution deadline",
    description:
      "Last day to make an RRSP contribution that can be deducted against 2026 taxable income. Standard first-60-days-of-year rule.",
    appliesTo: "All taxpayers with RRSP room",
    status: "upcoming",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function RealEstateTaxDeadlinesPage() {
  const upcoming = DEADLINES.filter((d) => d.status === "upcoming");
  const passed = DEADLINES.filter((d) => d.status === "passed");

  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_ARTICLE) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_BREADCRUMB) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }}
      />

      <MarketingNav />

      <main>
        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <Calendar className="h-3.5 w-3.5" />
              2026 Tax Year · Canadian Realtors
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl md:text-6xl">
              Canadian Real Estate Agent
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                Tax Deadlines 2026
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Every CRA tax deadline that applies to self-employed Canadian realtors — quarterly
              instalments, T1 filing, HST/GST returns, T4A issuance, and RRSP contributions.
              Updated for the 2026 tax year.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Last updated May 10, 2026 · Written by{" "}
              <Link href="/about" className="text-slate-400 underline underline-offset-2 hover:text-slate-300">
                Andrew Shaw
              </Link>
            </p>
          </div>
        </section>

        {/* ── Answer Capsule ── Quick-reference summary for AEO ── */}
        <section className="bg-slate-950 px-6 pb-12 sm:px-10">
          <div className="mx-auto max-w-3xl rounded-2xl border border-blue-500/30 bg-blue-500/5 p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
                <CheckCircle className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-300">Quick answer</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-200 sm:text-base">
                  Self-employed Canadian real estate agents have four quarterly instalment
                  deadlines (March 15, June 15, September 15, December 15)<CRACite id={2} />,
                  a T1 filing deadline of June 15, and a balance-owing payment deadline of
                  April 30 of each year<CRACite id={1} />. Brokerages issue T4A slips by
                  February 28<CRACite id={5} />. RRSP contributions for the 2025 tax year are
                  due by March 2, 2026<CRACite id={1} />.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Upcoming deadlines ── */}
        <section className="bg-slate-950 px-6 pb-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-black text-white sm:text-3xl">
              Upcoming deadlines for 2026
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              As of May 10, 2026, these CRA deadlines are still ahead in the 2026 tax year.
            </p>

            <div className="mt-8 space-y-3">
              {upcoming.map((deadline) => (
                <article
                  key={deadline.date + deadline.title}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition hover:border-slate-700 hover:bg-slate-900/70 sm:p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className="text-sm font-bold text-blue-300">
                          {deadline.formattedDate}
                        </p>
                        <h3 className="text-base font-bold text-white sm:text-lg">
                          {deadline.title}
                        </h3>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">
                        {deadline.description}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-400">Applies to:</span>{" "}
                        {deadline.appliesTo}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Passed deadlines (recently passed, for context) ── */}
        <section className="bg-slate-950 px-6 pb-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-xl font-bold text-slate-400">
              Deadlines already passed in 2026
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Per CRA rules, late instalments accrue interest from the missed instalment
              date<CRACite id={4} />, while late-filing penalties only apply after the T1
              filing deadline<CRACite id={1} />. Agents who have missed a deadline can verify
              current interest and penalty figures with the CRA or an accountant.
            </p>

            <div className="mt-6 space-y-2">
              {passed.map((deadline) => (
                <div
                  key={deadline.date + deadline.title}
                  className="flex items-start gap-3 rounded-xl border border-slate-800/60 bg-slate-900/20 p-4"
                >
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-300">
                      {deadline.formattedDate} · {deadline.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {deadline.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Key rules section ── */}
        <section className="bg-slate-950 px-6 pb-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-black text-white sm:text-3xl">
              Rules that apply to every Canadian realtor
            </h2>

            <div className="mt-6 space-y-6">
              {/* Rule 1 */}
              <div>
                <h3 className="text-lg font-bold text-white">
                  You pay tax 4 times per year, not once
                </h3>
                <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                  <p className="text-sm font-semibold text-slate-300">Answer capsule</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    The CRA requires quarterly instalments whenever net tax owing was more
                    than $3,000 in the current year and in either of the two preceding years —
                    $1,800 for Quebec residents<CRACite id={3} />. Due dates are March 15,
                    June 15, September 15, and December 15 of each tax year<CRACite id={2} />.
                  </p>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Instalments apply once the $3,000 net-tax-owing threshold is met in the
                  current year and either of the two preceding years<CRACite id={3} />. The
                  CRA sends an <em>instalment reminder</em> notice in February and August
                  listing the amount it expects<CRACite id={4} />. The reminder amount may be
                  paid as-is, or the <em>prior-year</em> method (1/4 of last year&apos;s total
                  tax) or the <em>current-year</em> method (based on projected income) may
                  apply<CRACite id={4} />. Full mechanics of the three methods, the $3,000
                  threshold, and the interest rules are covered in the{" "}
                  <Link
                    href="/real-estate-agent-tax-instalments-canada"
                    className="font-semibold text-blue-400 underline underline-offset-2 hover:text-blue-300"
                  >
                    quarterly tax instalments guide
                  </Link>
                  .
                </p>
              </div>

              {/* Rule 2 */}
              <div>
                <h3 className="text-lg font-bold text-white">
                  June 15 is your filing deadline. April 30 is still your payment deadline.
                </h3>
                <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                  <p className="text-sm font-semibold text-slate-300">Answer capsule</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    Self-employed agents get an extra 6 weeks to file their T1 return, but any
                    balance owing is still due by April 30<CRACite id={1} />. If $10,000 is
                    owed and paid on June 15, the CRA charges interest on that balance for 46
                    days.
                  </p>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  The extra six weeks granted to self-employed filers is a filing-only
                  concession — it does not extend the April 30 payment deadline
                  <CRACite id={1} />. Interest on any unpaid balance begins accruing
                  May 1<CRACite id={1} />.
                </p>
              </div>

              {/* Rule 3 */}
              <div>
                <h3 className="text-lg font-bold text-white">
                  HST registration kicks in at $30,000 gross commission
                </h3>
                <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                  <p className="text-sm font-semibold text-slate-300">Answer capsule</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    Once gross commission income exceeds $30,000 over any four
                    consecutive calendar quarters, CRA requires the agent to register for
                    GST/HST within 29 days<CRACite id={6} />. For most Canadian real estate
                    agents, this happens in their first full year of commission income.
                  </p>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Brokerages collect HST on commission and remit it to the agent as part of
                  payout (when the agent is registered). The agent then remits the net HST to
                  CRA after deducting input tax credits on business purchases<CRACite id={7} />.
                  Most agents file annually; larger agents file quarterly.
                </p>
              </div>

              {/* Rule 4 */}
              <div>
                <h3 className="text-lg font-bold text-white">
                  Your RRSP deadline is always the first 60 days of the next year
                </h3>
                <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/30 p-4">
                  <p className="text-sm font-semibold text-slate-300">Answer capsule</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">
                    RRSP contributions for the 2025 tax year are due by March 2, 2026
                    <CRACite id={1} />. Contributions made on or before that date can be
                    deducted against 2025 income. The same rule applies every year: the first
                    60 days of the calendar year count toward the prior tax year.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Warning callout ── */}
        <section className="bg-slate-950 px-6 pb-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-amber-300">
                    General information — not tax advice
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    This page is an estimate based on rules published by the CRA. Verify
                    with your accountant before making any filing or financial decision.
                    Tax rules change frequently, rates vary by province, and individual
                    circumstances differ. Current dates can be confirmed on{" "}
                    <a
                      href="https://www.canada.ca/en/revenue-agency.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-300 underline underline-offset-2"
                    >
                      the CRA website
                    </a>
                    . Agent Runway assumes no liability for tax decisions made based on this
                    page.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="bg-slate-950 px-6 pb-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-black text-white sm:text-3xl">
              Frequently asked questions
            </h2>
            <div className="mt-6 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/30">
              {FAQS.map((faq, i) => (
                <details key={i} className="group p-5 sm:p-6">
                  <summary className="cursor-pointer list-none text-base font-semibold text-white marker:hidden">
                    <span className="flex items-start justify-between gap-4">
                      {faq.question}
                      <span className="mt-1 shrink-0 text-slate-500 transition-transform group-open:rotate-45">
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Related resources ── */}
        <section className="bg-slate-950 px-6 pb-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-xl font-bold text-white">Related resources</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                {
                  href: "/tools/realtor-tax-estimator",
                  icon: Calculator,
                  title: "Free 2025 Tax Estimator",
                  description:
                    "Project federal, provincial, CPP, and quarterly instalments for your GCI and province.",
                },
                {
                  href: "/t2125-guide-real-estate-agents-canada",
                  icon: FileText,
                  title: "T2125 Filing Guide",
                  description:
                    "Line-by-line walkthrough of CRA Form T2125 for Canadian real estate agents.",
                },
                {
                  href: "/how-much-should-real-estate-agents-save-for-taxes-canada",
                  icon: FileText,
                  title: "How Much to Save for Taxes",
                  description:
                    "Province-by-province tax-save percentages with CPP, HST, and quarterly instalments.",
                },
                {
                  href: "/real-estate-agent-tax-planning-canada",
                  icon: FileText,
                  title: "Year-Round Tax Planning Guide",
                  description:
                    "Quarterly instalments, CPP contributions, and year-end planning moves explained.",
                },
              ].map((resource) => (
                <Link
                  key={resource.href}
                  href={resource.href}
                  className="group flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:border-slate-700 hover:bg-slate-900/70"
                >
                  <resource.icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-blue-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{resource.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {resource.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Sources ── */}
        <section className="bg-slate-950 px-6 pb-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <section
              aria-labelledby="sources"
              className="border-t border-slate-800 pt-8"
            >
              <h2
                id="sources"
                className="text-base font-semibold text-slate-200"
              >
                Sources
              </h2>
              <p className="mt-2 text-xs text-slate-500">
                Every quantitative or mechanical claim in this article is backed
                by one of the CRA primary sources below. Hand-verified live on
                2026-05-06.
              </p>
              <ol className="mt-4 space-y-2 text-xs text-slate-500">
                {CRA_SOURCES.map((s) => (
                  <li key={s.id} className="flex gap-2 leading-relaxed">
                    <span className="font-mono text-slate-600">[{s.id}]</span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-slate-300"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="bg-slate-950 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-black text-white sm:text-4xl">
              Never miss another tax deadline
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Agent Runway tracks every deal automatically, calculates your projected tax
              bill in real time, and reminds you before each quarterly instalment is due.
              The Flight Crew flags tax-owing risks before they become CRA interest charges.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/tools/realtor-tax-estimator"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Try the free tax estimator
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                See pricing
              </Link>
            </div>

            <div className="mt-10">
              <CharterScarcityStrip variant="prominent" />
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
