import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "Tax Instalments for Self-Employed Real Estate Agents in Canada (2025)",
  description:
    "When CRA requires quarterly tax instalments, how to calculate them using the three methods, and the exact due dates — a plain-language guide for Canadian real estate agents.",
  keywords: [
    "tax instalments canada",
    "quarterly tax instalments real estate",
    "cra instalment due dates",
    "self employed instalments canada",
    "real estate agent tax instalments",
    "instalment interest cra",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/real-estate-agent-tax-instalments-canada",
    title:
      "Tax Instalments for Self-Employed Real Estate Agents in Canada (2025)",
    description:
      "When CRA requires quarterly tax instalments, how to calculate them under each of the three published methods, and the exact due dates for self-employed Canadian real estate agents.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/real-estate-agent-tax-instalments-canada",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "Tax Instalments for Self-Employed Real Estate Agents in Canada (2025)",
  description:
    "When CRA requires quarterly tax instalments, how to calculate them under each of the three published methods, and the exact due dates for self-employed Canadian real estate agents.",
  url: "/real-estate-agent-tax-instalments-canada",
  datePublished: "2026-05-06",
  dateModified: "2026-05-06",
});

// ─── CRA primary sources (audit registry) ─────────────────────────────────────
//
// Every numeric or mechanical claim in this article is backed by one of the
// URLs below. Inline citations are rendered via <CRACite id={n} />. URLs were
// hand-verified live (HTTP 200) on 2026-05-06.

const CRA_SOURCES = [
  {
    id: 1,
    label: "CRA — Required tax instalments for individuals (overview)",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments.html",
  },
  {
    id: 2,
    label: "CRA — Required tax instalments — Who has to pay",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/who-pays-instalments.html",
  },
  {
    id: 3,
    label: "CRA — Required tax instalments — Options to calculate",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/options-calculate.html",
  },
  {
    id: 4,
    label: "CRA — Required tax instalments — Payment due dates",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/due-dates.html",
  },
  {
    id: 5,
    label: "CRA — Required tax instalments — How to pay",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/how-pay.html",
  },
  {
    id: 6,
    label: "CRA — Required tax instalments — Interest and penalty charges",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/interest-penalty-charges.html",
  },
  {
    id: 7,
    label: "CRA — Required tax instalments — Claim amounts on your tax return",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/claim-amounts-tax-return.html",
  },
  {
    id: 8,
    label: "CRA — Line 47600: Tax paid by instalments",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-47600-tax-paid-instalments.html",
  },
  {
    id: 9,
    label: "CRA — Important dates for individuals",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/important-dates-individuals.html",
  },
  {
    id: 10,
    label: "CRA — Interest and penalties on late taxes",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/interest-penalties/late-filing-penalty.html",
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
  { href: "#why-agents", label: "Why real estate agents get instalment notices" },
  { href: "#threshold", label: "The threshold: when instalments are required" },
  { href: "#methods", label: "The three calculation methods" },
  { href: "#due-dates", label: "The four due dates" },
  { href: "#how-to-pay", label: "How to make the payment" },
  { href: "#interest-penalty", label: "What happens if you miss or underpay" },
  { href: "#tracking", label: "Tracking your estimated instalment obligation" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RealEstateAgentTaxInstalmentsCanadaPage() {
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
              Tax Instalments for Self-Employed Real Estate Agents in Canada (2025)
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Most working real estate agents go through their first or second
              full commission year without a quarterly tax payment, and then
              receive an instalment reminder in the mail from the CRA.
              This article explains the published threshold that triggers the
              requirement, the three calculation methods CRA offers, the four
              annual due dates, and the interest mechanics that apply when an
              instalment is late or short.
            </p>
            <p className="mt-3 text-xs text-slate-500">9 min read · Updated for 2025 CRA rules</p>
          </div>
        </section>

        {/* ── Article body ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* Top disclaimer */}
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs leading-relaxed text-amber-700">
                <strong className="text-amber-800">General information only — not tax advice.</strong>{" "}
                This article describes the CRA-published mechanics of personal
                income tax instalments. Instalment thresholds, prescribed
                interest rates, and processing timelines change over time, and
                individual circumstances vary. Always verify current rules
                against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA&apos;s instalment guidance
                </a>{" "}
                and consult a qualified accountant or tax professional before
                making any filing or payment decision.{" "}
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
              <h2 id="why-agents">
                Why real estate agents get instalment notices
              </h2>

              <p>
                Salaried Canadians have income tax, CPP, and EI withheld from
                each paycheque by their employer, who remits those amounts to
                the CRA on the employee&apos;s behalf throughout the year. By the
                time the T1 personal income tax return is filed in April, most
                or all of the year&apos;s tax obligation has already been paid at
                source.
              </p>

              <p>
                A self-employed real estate agent has no source deduction.
                Commission cheques and direct deposits arrive in full — gross
                of federal income tax, gross of provincial income tax, gross of
                CPP, and (where the agent is registered) gross of GST/HST. The
                full year&apos;s tax obligation is calculated only when the T1 is
                filed and lands on the return as a single balance owing.
              </p>

              <p>
                Once that balance owing crosses a published threshold, CRA
                begins requiring the agent to prepay the next year&apos;s tax in
                quarterly instalments rather than waiting for the following
                April<CRACite id={2} />. The instalment regime is the
                CRA&apos;s mechanism for matching the cash-flow pattern of
                source deduction onto self-employed income — collecting tax
                as the income is earned rather than once a year afterwards.
              </p>

              <p>
                Agents who experience a strong commission year are the most
                common recipients of a first instalment reminder. The notice
                typically arrives by mail (or in CRA My Account) in February
                covering the March 15 and June 15 instalments, and again in
                August covering the September 15 and December 15 instalments
                <CRACite id={2} />.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="threshold">
                The threshold: when instalments are required
              </h2>

              <p>
                CRA&apos;s published rule for individual taxpayers is
                straightforward: instalments are required when net tax owing
                is more than <strong>$3,000</strong> in the current year{" "}
                <em>and</em> in either of the two preceding years
                <CRACite id={2} />. For residents of Quebec, the federal
                threshold is <strong>$1,800</strong>, because Quebec residents
                pay federal and provincial income tax separately and the
                federal portion is correspondingly smaller<CRACite id={2} />.
              </p>

              <p>
                Three details on the threshold mechanics:
              </p>

              <ul>
                <li>
                  &quot;Net tax owing&quot; is the figure on the T1 return
                  after credits and prior instalments are applied — not gross
                  tax<CRACite id={2} />.
                </li>
                <li>
                  Both conditions are required. A single high-income year
                  followed by a low one may not trigger the requirement; CRA
                  looks at a two-year window<CRACite id={2} />.
                </li>
                <li>
                  CPP contributions on self-employment earnings count toward
                  the net tax owing figure<CRACite id={2} />. An agent with
                  modest income tax but a substantial self-employed CPP
                  contribution may cross the threshold from CPP alone.
                </li>
              </ul>

              <p>
                When CRA determines instalments are required, the
                taxpayer receives an{" "}
                <em>instalment reminder</em> showing the suggested amount
                under the no-calculation method (described below). The
                reminder itself is not a bill — it is a notice that the
                quarterly obligation has been activated<CRACite id={2} />.
              </p>

              {/* ── Section 3 ── */}
              <h2 id="methods">
                The three calculation methods
              </h2>

              <p>
                CRA publishes three methods for calculating each quarterly
                instalment payment<CRACite id={3} />. A taxpayer may choose
                any of the three for any given year — the choice is not
                locked in advance, and switching methods between years is
                permitted<CRACite id={3} />.
              </p>

              <h3>1. No-calculation option</h3>

              <p>
                The no-calculation option is the default. CRA computes the
                quarterly amount and prints it directly on the instalment
                reminder. The figure is based on the most recent two years
                of assessed returns: the March 15 and June 15 instalments
                are each one-quarter of the second-most-recent year&apos;s net
                tax owing, and the September 15 and December 15 instalments
                are calculated to bring the year&apos;s total instalments to
                the most-recent year&apos;s net tax owing<CRACite id={3} />.
              </p>

              <p>
                Following the no-calculation option exactly — paying each
                amount on or before its due date — eliminates instalment
                interest exposure for that year, regardless of what the
                actual current-year tax turns out to be<CRACite id={3} />
                <CRACite id={6} />.
              </p>

              <h3>2. Prior-year option</h3>

              <p>
                The prior-year option pays one quarter of the previous
                year&apos;s net tax owing on each of the four due dates
                <CRACite id={3} />. This option produces a lower figure than
                the no-calculation option when income two years ago was
                higher than income last year — the no-calculation method is
                anchored to the older figure on the first two payments,
                while the prior-year method uses only the most recent
                assessed year.
              </p>

              <p>
                Following the prior-year option exactly also eliminates
                instalment interest exposure, even if current-year income
                grows<CRACite id={3} />.
              </p>

              <h3>3. Current-year option</h3>

              <p>
                The current-year option pays one quarter of the
                taxpayer&apos;s own estimate of the current year&apos;s net
                tax owing<CRACite id={3} />. This option produces the lowest
                figure when income is expected to drop materially — for
                example, when an agent moves to part-time, takes parental
                leave, or transitions to a salaried role mid-year.
              </p>

              <p>
                The trade-off is interest risk. If the current-year estimate
                turns out to be low and actual tax owing is higher, CRA
                charges instalment interest on the underpayment from the
                original due date forward<CRACite id={6} />. Following the
                current-year option exactly eliminates instalment interest
                only if the estimate matches or exceeds actual current-year
                tax.
              </p>

              <h3>How CRA charges interest across the three methods</h3>

              <p>
                CRA&apos;s published rule is that instalment interest is
                calculated on whichever of the three methods produces the
                <em> lowest</em> required payment for the year
                <CRACite id={6} />. A taxpayer who chooses the no-calculation
                option and pays it correctly, but whose current-year option
                would have been even lower, is not penalised — interest is
                assessed against the floor, not the chosen method
                <CRACite id={6} />.
              </p>

              {/* ── Section 4 ── */}
              <h2 id="due-dates">
                The four due dates
              </h2>

              <p>
                The four CRA-published instalment due dates for personal
                income tax instalments are<CRACite id={4} />:
              </p>

              <ul>
                <li><strong>March 15</strong></li>
                <li><strong>June 15</strong></li>
                <li><strong>September 15</strong></li>
                <li><strong>December 15</strong></li>
              </ul>

              <p>
                When a due date falls on a Saturday, Sunday, or public
                holiday, CRA treats payment received on the next business
                day as on time<CRACite id={4} />.
              </p>

              <p>
                Farmers and fishers as defined under the Income Tax Act follow
                a different schedule — a single annual instalment due
                December 31<CRACite id={4} /> — but this schedule does not
                apply to real estate agents, whose self-employed income is
                business income rather than farming or fishing income.
              </p>

              <p>
                The full 2026 calendar — quarterly instalment dates alongside
                the T1 self-employed filing deadline (June 15, with balance
                owing due April 30), the GST/HST return schedule, the T4A
                deadline, and the RRSP contribution deadline — is laid out
                in the{" "}
                <Link
                  href="/real-estate-tax-deadlines-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian real estate agent tax deadline calendar
                </Link>
                <CRACite id={9} />.
              </p>

              {/* ── Section 5 ── */}
              <h2 id="how-to-pay">
                How to make the payment
              </h2>

              <p>
                CRA accepts instalment payments through several published
                channels<CRACite id={5} />. All four route to the same
                taxpayer account; the choice between them is administrative.
              </p>

              <ul>
                <li>
                  <strong>CRA My Account</strong> — the secure online portal
                  for individuals. Instalment payments may be made directly
                  from a Canadian chequing account using My Payment, or by
                  setting up pre-authorized debit (PAD) for one or more
                  scheduled instalment dates<CRACite id={5} />.
                </li>
                <li>
                  <strong>Online banking through a Canadian financial
                  institution</strong> — most major Canadian banks list
                  &quot;CRA (revenue) — tax instalment&quot; (or a similarly
                  worded payee) as a bill-payment option. The taxpayer&apos;s
                  social insurance number is the account number
                  <CRACite id={5} />.
                </li>
                <li>
                  <strong>Pre-authorized debit (PAD)</strong> — set up either
                  through My Account or by submitting Form RC366. PAD can be
                  arranged for a single instalment or for the full schedule
                  in advance<CRACite id={5} />.
                </li>
                <li>
                  <strong>In person at a Canadian financial institution</strong>{" "}
                  — using a personalized remittance voucher (Form INNS3) which
                  CRA mails alongside instalment reminders, or which can be
                  ordered through My Account or by phone<CRACite id={5} />.
                </li>
              </ul>

              <p>
                CRA also accepts payment by credit card and select
                third-party payment services, though these intermediaries
                charge a service fee that is not refunded by CRA
                <CRACite id={5} />.
              </p>

              <p>
                Whichever channel is used, CRA records the date the payment
                is received — not the date it was initiated. Online banking
                bill payments and PAD typically take 1–3 business days to
                post, so the initiation date and the credited date are not
                the same<CRACite id={5} />.
              </p>

              {/* Cheat sheet inline CTA — at ~2/3 mark, after Section 5 */}
              <div className="not-prose my-8">
                <EmailCapture
                  heading="Get the Canadian Realtor Tax Cheat Sheet"
                  subheading="Every 2025 bracket, CPP rate, GST/HST threshold, and instalment due date on one printable page — CRA-cited. We'll email it to you."
                  ctaLabel="Email me the cheat sheet"
                  source="cheat_sheet_inline_real-estate-agent-tax-instalments-canada"
                  variant="light"
                />
              </div>

              {/* ── Section 6 ── */}
              <h2 id="interest-penalty">
                What happens if you miss or underpay
              </h2>

              <p>
                CRA charges <strong>instalment interest</strong> on amounts
                paid after the due date or on amounts that fall short of the
                required payment<CRACite id={6} />. The rate is the
                CRA-prescribed rate for amounts owed to the government,
                which is set quarterly and published on the CRA website
                <CRACite id={6} />. Interest compounds daily<CRACite id={6} />.
              </p>

              <p>
                The mechanics are mitigated in two specific ways:
              </p>

              <ul>
                <li>
                  <strong>The offset method.</strong> CRA applies an
                  offset-method calculation that gives credit interest for
                  early or excess payments. A taxpayer who pays one
                  instalment late but pays the next instalment early can
                  reduce or eliminate the net interest charge<CRACite id={6} />.
                </li>
                <li>
                  <strong>The $1,000 floor for the additional penalty.</strong>{" "}
                  An additional <em>instalment penalty</em> applies only when
                  the year&apos;s instalment interest exceeds $1,000. The
                  penalty is calculated as 50% of the amount by which the
                  interest exceeds $1,000<CRACite id={6} />. For most agents
                  with modest underpayments, instalment interest stays below
                  $1,000 and no separate penalty applies.
                </li>
              </ul>

              <p>
                Instalment interest is separate from the late-filing penalty
                and the late-payment interest that apply when the T1 itself
                is filed late or when the April 30 balance owing is paid
                late<CRACite id={10} />. A taxpayer can be current on
                instalments but late filing, or current on filing but behind
                on instalments — the two charges are calculated independently.
              </p>

              <p>
                Instalment interest is not deductible. Unlike business
                expenses claimed on Form T2125, interest on overdue
                instalments cannot be used to reduce taxable income
                <CRACite id={6} />.
              </p>

              {/* ── Section 7 ── */}
              <h2 id="tracking">
                Tracking your estimated instalment obligation through the year
              </h2>

              <p>
                Instalments paid through the year are claimed on{" "}
                <strong>line 47600</strong> of the T1 return<CRACite id={8} />.
                CRA mails Form INNS1 (Instalment Reminder) and Form INNS2
                (Instalment Payment Summary) showing the agency&apos;s record of
                instalments received; agents who paid an amount not yet
                reflected on those forms add the difference manually to line
                47600 when filing<CRACite id={7} />.
              </p>

              <p>
                Because the instalment obligation is calculated against
                figures only knowable at year-end — net business income,
                deductible expenses, CPP contributions, HST owing — a running
                estimate produced through the year tends to track reality
                more closely than any single static figure printed on a
                February reminder. The CRA-suggested no-calculation amount
                is anchored to two-year-old data and may differ materially
                from actual current-year tax for an agent whose business is
                growing or shrinking.
              </p>

              <p>
                Agent Runway&apos;s tax engine implements the CRA-published
                instalment math directly. As deals close and net business
                income accumulates, the engine produces a running estimate of
                the year&apos;s federal income tax, provincial income tax,
                self-employed CPP1 and CPP2, and HST owing — and combines
                them into a quarterly instalment estimate aligned to the
                March 15 / June 15 / September 15 / December 15 schedule.
                The estimate updates as new transactions and expenses are
                recorded, so the figure shown in early September reflects
                actual income through August rather than a static projection
                made in February.
              </p>

              <p>
                The free{" "}
                <Link
                  href="/tools/realtor-tax-estimator"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian Realtor Tax Estimator
                </Link>{" "}
                produces an annualized tax figure from a single GCI input,
                broken down into federal income tax, provincial income tax,
                CPP, and HST. Dividing the resulting total by four
                approximates a current-year-method instalment figure for
                planning purposes — useful for agents whose first instalment
                reminder is still months away, or who are estimating
                obligations under the current-year option.
              </p>

              <p>
                The mechanics of how the three methods interact with each
                other, and how an agent&apos;s choice of method affects
                full-year planning, are explored further in the{" "}
                <Link
                  href="/real-estate-agent-tax-planning-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  tax planning guide for Canadian real estate agents
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
                Every quantitative or mechanical claim in this article is
                backed by one of the primary sources below. Hand-verified
                live (HTTP 200) on 2026-05-06.
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
              tax, or professional advice. Instalment thresholds, prescribed interest rates, and
              processing timelines change over time, and individual circumstances vary. Always
              verify current rules with the CRA and consult a qualified accountant or tax
              professional before making any filing or payment decision. Agent Runway assumes no
              liability for tax filing outcomes.{" "}
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
              Track your quarterly instalment estimate as your year unfolds.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway estimates your federal and provincial income tax,
              self-employed CPP, and HST as deals close — combined into a
              running quarterly instalment figure aligned to the March 15 /
              June 15 / September 15 / December 15 CRA schedule. Built for
              Canadian real estate agents.
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
