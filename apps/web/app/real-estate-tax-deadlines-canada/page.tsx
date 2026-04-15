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
  title: "Canadian Real Estate Agent Tax Deadlines 2026 | Agent Runway",
  description:
    "Every tax deadline Canadian real estate agents need to know for 2026 — quarterly instalments, T1 filing, HST/GST, T4A, RRSP. Built for self-employed realtors.",
  openGraph: {
    type: "article",
    url: URL,
    title: "Canadian Real Estate Agent Tax Deadlines 2026",
    description:
      "Every tax deadline Canadian real estate agents need to know for 2026 — quarterly instalments, T1, HST/GST, T4A, RRSP.",
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
    "Every CRA tax deadline self-employed Canadian real estate agents need to know for 2026, including quarterly instalments, T1 filing, HST/GST, T4A, and RRSP contributions.",
  url: "/real-estate-tax-deadlines-canada",
  datePublished: "2026-04-15",
  dateModified: "2026-04-15",
});

const JSON_LD_BREADCRUMB = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "Tax Deadlines", url: "/real-estate-tax-deadlines-canada" },
]);

const FAQS = [
  {
    question: "What are the 2026 CRA quarterly instalment deadlines for self-employed real estate agents?",
    answer:
      "Quarterly instalment deadlines are the 15th of March, June, September, and December — so March 15, June 15, September 15, and December 15, 2026. You must make quarterly instalments if you owed more than $3,000 in net tax for the current year or either of the two preceding years ($1,800 if you're a Quebec resident).",
  },
  {
    question: "When is the T1 tax filing deadline for self-employed real estate agents in 2026?",
    answer:
      "Self-employed real estate agents (and their spouses) have until June 15, 2026 to file their T1 personal tax return for the 2025 tax year. However, any balance owing must still be paid by April 30, 2026 — the CRA charges interest on any amount outstanding after that date, even if your return itself isn't due until June 15.",
  },
  {
    question: "When are T4A slips from my brokerage due?",
    answer:
      "Brokerages must issue T4A slips to agents and file them with the CRA by February 28, 2026 for the 2025 tax year. If you haven't received your T4A by early March, contact your brokerage. The T4A reports gross commission paid — not net of your brokerage split.",
  },
  {
    question: "What is the 2026 RRSP contribution deadline for the 2025 tax year?",
    answer:
      "The RRSP contribution deadline is March 2, 2026 (the first 60 days of 2026). Contributions made on or before that date can be deducted against your 2025 taxable income. Your 2025 RRSP deduction limit is on your 2024 Notice of Assessment.",
  },
  {
    question: "When do real estate agents need to file HST/GST returns?",
    answer:
      "If your gross commission income exceeded $30,000 over four consecutive calendar quarters, you must register for GST/HST. Most small suppliers file annually with returns due three months after fiscal year-end — so for a December 31 year-end, the return is due April 30. Instalment payments are required if you owed more than $3,000 in the prior year, due quarterly on the last day of each quarter following year-end.",
  },
  {
    question: "What happens if I miss a quarterly instalment deadline?",
    answer:
      "The CRA charges instalment interest (currently set quarterly) on any amount paid late or underpaid, calculated from the instalment due date. If the total instalment interest exceeds $1,000, a penalty of 50% of the interest charge above $1,000 is also applied. Missing instalments will not prevent you from filing your T1 return — it just adds to your total cost.",
  },
];

const JSON_LD_FAQ = faqSchema(FAQS);

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
      "Your brokerage must issue your T4A (for 2025 commissions paid) and file with CRA by this date. The T4A shows gross commission — your brokerage split is reported separately on your T2125.",
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
      "Any tax you owe on your 2025 T1 return must be paid by this date — even though your return itself isn't due until June 15. The CRA charges interest from May 1 on any unpaid balance.",
    appliesTo: "All self-employed agents with a 2025 balance owing",
    status: "passed",
  },
  {
    date: "2026-04-30",
    formattedDate: "April 30, 2026",
    title: "GST/HST annual return (December year-end)",
    description:
      "GST/HST registrants filing annually with a December 31 fiscal year-end must file their return by this date. Instalments were due throughout the year.",
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
      "Fourth and final quarterly instalment for the 2026 tax year. Tax-planning moves (RRSP top-ups, capital purchases) should be made before December 31.",
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
              Every CRA tax deadline self-employed Canadian realtors need to know — quarterly
              instalments, T1 filing, HST/GST returns, T4A issuance, and RRSP contributions.
              Updated for the 2026 tax year.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Last updated April 15, 2026 · Written by{" "}
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
                  deadlines (March 15, June 15, September 15, December 15), a T1 filing
                  deadline of June 15, and a balance-owing payment deadline of April 30 of
                  each year. Brokerages issue T4A slips by February 28. RRSP contributions
                  for the 2025 tax year are due by March 2, 2026.
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
              Today is April 15, 2026. These deadlines are still ahead of you this tax year.
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
              Missed any? Contact the CRA immediately — late instalments accrue interest from
              the missed date, but late-filing penalties only apply after your filing deadline.
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
              Rules every Canadian realtor should know
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
                    The CRA requires quarterly instalments whenever your net tax owing was
                    more than $3,000 in the current or either of the two preceding years —
                    $1,800 for Quebec residents. Due dates are March 15, June 15,
                    September 15, and December 15 of each tax year.
                  </p>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  For most agents in their second year of decent commission income, instalments
                  become mandatory. The CRA sends an <em>instalment reminder</em> notice in
                  February and August listing the amount they expect. You can pay that amount,
                  or use the <em>prior-year</em> method (1/4 of last year's total tax), or use
                  the <em>current-year</em> method if you expect to earn less this year.
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
                    balance owing must still be paid by April 30. If you owe $10,000 and pay on
                    June 15, the CRA charges interest on that balance for 46 days.
                  </p>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Many agents misunderstand this. The extra time to file is a concession
                  because T2125 calculations take longer — it is not an extension of the
                  payment deadline. If you expect to owe, pay an estimated amount by April 30
                  and reconcile on June 15 when you file.
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
                    Once your gross commission income exceeds $30,000 over any four
                    consecutive calendar quarters, you must register for GST/HST within 29
                    days. For most Canadian real estate agents, this happens in their first
                    full year of commission income.
                  </p>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Brokerages collect HST on your commission and remit it to you as part of
                  your payout (if you're registered). You then remit the net HST to the CRA
                  after deducting input tax credits on your business purchases. Most agents
                  file annually; larger agents file quarterly.
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
                    RRSP contributions for the 2025 tax year are due by March 2, 2026.
                    Contributions made on or before that date can be deducted against 2025
                    income. The same rule applies every year: the first 60 days of the
                    calendar year count toward the prior tax year.
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
                    This page is informational. Tax rules change frequently, rates vary by
                    province, and individual circumstances differ. Always consult a qualified
                    accountant and verify current dates on{" "}
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

        {/* ── Final CTA ── */}
        <section className="bg-slate-950 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-black text-white sm:text-4xl">
              Never miss another tax deadline
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Agent Runway tracks every deal automatically, calculates your projected tax
              bill in real time, and reminds you before each quarterly instalment is due.
              The Co-Pilot flags tax-owing risks before they become CRA interest charges.
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
