import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "Self-Employed CPP for Canadian Real Estate Agents (2025) — Rates, Maximums, and How It's Calculated",
  description:
    "Exactly how CPP works for self-employed Canadian real estate agents in 2025 — the published CPP1 and CPP2 rates, the maximum contribution figure, worked examples at $80K, $120K, and $200K, and how the partial deduction and credit reduce the effective burden.",
  keywords: [
    "self employed cpp canada",
    "real estate agent cpp",
    "cpp2 self employed 2025",
    "ympe yampe 2025",
    "canadian realtor cpp contribution",
    "self employed pension plan canada",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/self-employed-cpp-real-estate-agents-canada",
    title: "Self-Employed CPP for Canadian Real Estate Agents (2025)",
    description:
      "The 2025 CPP1 and CPP2 figures for self-employed agents, worked examples, and how the half-deduction-half-credit mechanic reduces the effective burden.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/self-employed-cpp-real-estate-agents-canada",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "Self-Employed CPP for Canadian Real Estate Agents (2025) — Rates, Maximums, and How It's Calculated",
  description:
    "Exactly how CPP works for self-employed Canadian real estate agents in 2025: published CPP1 and CPP2 rates, the maximum contribution figure, worked examples at $80K, $120K, and $200K, and how the partial deduction and credit reduce the effective burden.",
  url: "/self-employed-cpp-real-estate-agents-canada",
  datePublished: "2026-05-06",
  dateModified: "2026-05-06",
});

// ─── TOC ──────────────────────────────────────────────────────────────────────

const TOC = [
  { href: "#why-double", label: "Why self-employed CPP is the 'double' contribution" },
  { href: "#2025-numbers", label: "The 2025 figures, exact" },
  { href: "#worked-examples", label: "Worked examples — $80K, $120K, $200K" },
  { href: "#when-paid", label: "When self-employed CPP is paid" },
  { href: "#deduction-credit", label: "The partial offset — half deduction, half credit" },
  { href: "#incorporation-question", label: "What incorporation does and doesn't change" },
  { href: "#tracking", label: "Tracking the CPP estimate through the year" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SelfEmployedCPPCanadaPage() {
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
              Self-Employed CPP for Canadian Real Estate Agents (2025)
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Almost every working Canadian real estate agent files as self-employed —
              and almost every one of them is surprised in their first or second tax
              year by how much they owe in CPP. This article explains exactly how
              self-employed CPP works in 2025, what the published rates produce in
              dollar terms at common income levels, and the deduction-and-credit
              mechanic that quietly offsets a portion of the gross figure.
            </p>
            <p className="mt-3 text-xs text-slate-500">10 min read · Updated for 2025 CRA rates</p>
          </div>
        </section>

        {/* ── Article body ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* Top disclaimer */}
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs leading-relaxed text-amber-700">
                <strong className="text-amber-800">General information only — not tax advice.</strong>{" "}
                This article describes published CPP rates and the structure of the
                self-employed contribution as set out by the Canada Revenue Agency and
                Service Canada. CPP rates and ceilings change every year. Individual
                circumstances vary. Always verify current rates against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA's published CPP contribution rates
                </a>{" "}
                and consult a qualified accountant or tax professional for your own
                situation.{" "}
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
              <h2 id="why-double">
                Why self-employed CPP is the "double" contribution
              </h2>

              <p>
                A salaried employee in Canada has CPP deducted from each paycheque at
                the employee rate. The employer matches that amount and remits both
                halves to the CRA on the employee's behalf. The employee never sees
                the employer-side contribution — it is paid directly by the employer
                out of their own funds, not from the employee's wage.
              </p>

              <p>
                A self-employed real estate agent is, in CRA's view, both the employee
                and the employer. Commissions land in the agent's account in full,
                with no source deduction taken at the time of payment. When the T1
                personal income tax return is filed, the agent calculates the
                self-employed CPP contribution on Schedule 8 — and the figure that
                lands there is the combined employee-plus-employer amount on the
                self-employed earnings.
              </p>

              <p>
                The practical consequence: at the same level of net earnings, a
                self-employed agent's CPP figure is approximately twice an employee's.
                That doubled figure is the single largest source of the "first-year
                tax shock" that working agents commonly describe — it is structural,
                published, and inescapable for agents earning income on a self-employed
                basis.
              </p>

              <p>
                The brokerage payroll structure most Canadian agents work under does
                not change this. Whether the brokerage pays the agent on a 1099-style
                commission split, through a brokerage trust account, or via direct
                deposit on closing, the agent's earnings flow as self-employed business
                income — and the self-employed CPP rules apply.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="2025-numbers">The 2025 figures, exact</h2>

              <p>
                The Canada Revenue Agency publishes CPP contribution rates and earnings
                ceilings annually. The 2025 figures, drawn from the CRA's official
                contribution-rates table, are:
              </p>

              <ul>
                <li>
                  <strong>Basic exemption:</strong> $3,500. CPP contributions are
                  calculated only on earnings above this amount.
                </li>
                <li>
                  <strong>Year's Maximum Pensionable Earnings (YMPE), 2025:</strong> $71,300.
                  This is the upper bound for CPP1 contributions.
                </li>
                <li>
                  <strong>Year's Additional Maximum Pensionable Earnings (YAMPE), 2025:</strong>{" "}
                  $81,200. CPP2 contributions apply on earnings between YMPE and YAMPE.
                </li>
                <li>
                  <strong>CPP1 self-employed rate, 2025:</strong> 11.90% (the employee
                  rate of 5.95% × 2).
                </li>
                <li>
                  <strong>CPP2 self-employed rate, 2025:</strong> 8.00% (the employee
                  rate of 4.00% × 2).
                </li>
              </ul>

              <p>
                Applied to the published ranges, the 2025 maximum contributions are:
              </p>

              <ul>
                <li>
                  <strong>Maximum CPP1 contribution (self-employed):</strong>{" "}
                  ($71,300 − $3,500) × 11.90% = <strong>$8,068.20</strong>.
                </li>
                <li>
                  <strong>Maximum CPP2 contribution (self-employed):</strong>{" "}
                  ($81,200 − $71,300) × 8.00% = <strong>$792.00</strong>.
                </li>
                <li>
                  <strong>Total maximum 2025 self-employed CPP:</strong>{" "}
                  <strong>$8,860.20</strong>.
                </li>
              </ul>

              <p>
                For comparison, the maximum 2025 contribution for a salaried employee
                at the same earnings level — paying only the employee half — is
                $4,430.10. The structural self-employed gap at YAMPE is therefore
                $4,430.10 — exactly the employer half that no employer remits on a
                self-employed agent's behalf.
              </p>

              <h3>The Quebec QPP variant</h3>

              <p>
                Agents who reside in Quebec contribute to the Quebec Pension Plan
                (QPP) rather than the federal CPP. The 2025 QPP1 self-employed rate
                is slightly higher than CPP1 (the QPP rate has been published at 12.80%
                versus CPP's 11.90%). The QPP2 rate matches CPP2 at 8.00%. YMPE and
                YAMPE figures are the same. Quebec residents file the QPP contribution
                on Schedule 8 of the Quebec TP-1 return rather than the federal T1
                Schedule 8.
              </p>

              {/* ── Section 3 ── */}
              <h2 id="worked-examples">Worked examples — $80K, $120K, $200K</h2>

              <p>
                The numbers behind the published rates become clearer when applied to
                three typical net-business-income scenarios. The figures below assume
                the agent operates outside Quebec (CPP, not QPP) and that net business
                income is the figure remaining after deductible expenses are subtracted
                from gross commissions.
              </p>

              <h3>$80,000 net business income (2025)</h3>

              <p>
                CPP1 applies to all earnings between $3,500 and YMPE. Because
                $80,000 exceeds YMPE, the full CPP1 range is contributed:
              </p>

              <ul>
                <li>CPP1: ($71,300 − $3,500) × 11.90% = <strong>$8,068.20</strong></li>
                <li>CPP2: ($80,000 − $71,300) × 8.00% = <strong>$696.00</strong></li>
                <li>Total CPP for $80K SE income: <strong>$8,764.20</strong></li>
              </ul>

              <h3>$120,000 net business income (2025)</h3>

              <p>
                Once net income exceeds YAMPE ($81,200), CPP2 also reaches its
                maximum and the total contribution stops growing.
              </p>

              <ul>
                <li>CPP1: <strong>$8,068.20</strong> (maximum)</li>
                <li>CPP2: ($81,200 − $71,300) × 8.00% = <strong>$792.00</strong> (maximum)</li>
                <li>Total CPP for $120K SE income: <strong>$8,860.20</strong> (the 2025 maximum)</li>
              </ul>

              <h3>$200,000 net business income (2025)</h3>

              <p>
                Earnings above YAMPE do not generate additional CPP contributions.
                A higher-producing agent at $200K and an agent at $120K pay the same
                CPP figure.
              </p>

              <ul>
                <li>CPP1: <strong>$8,068.20</strong> (maximum)</li>
                <li>CPP2: <strong>$792.00</strong> (maximum)</li>
                <li>Total CPP for $200K SE income: <strong>$8,860.20</strong> (unchanged from $120K)</li>
              </ul>

              <p>
                This ceiling is the practical reason the CPP burden shows up most
                visibly in the $50K–$120K income band: the contribution scales with
                income through that range and then stops. Federal and provincial income
                tax continue to scale on every dollar of net income, but CPP does not.
              </p>

              {/* ── Section 4 ── */}
              <h2 id="when-paid">When self-employed CPP is paid</h2>

              <p>
                Self-employed CPP is calculated and remitted with the T1 personal
                income tax return — not throughout the year as it would be for a
                salaried employee. The full year's contribution arrives as a single
                figure on the return and forms part of the balance owing at filing.
              </p>

              <p>
                For most active agents, this means the CPP figure is rolled into the
                quarterly tax instalment obligation that applies in subsequent years.
                The CRA's instalment threshold is $3,000 of net tax owing in either
                of the two preceding years (excluding Quebec, where the threshold is
                $1,800). Once an agent crosses that threshold once, instalment
                reminders begin arriving from the CRA the following spring — and the
                figures shown on those reminders include the CPP component, not just
                income tax.
              </p>

              <p>
                The full 2026 deadline calendar — including the four instalment
                payment dates, T1 filing dates for self-employed filers, and the HST
                return schedule — is laid out in the{" "}
                <Link
                  href="/real-estate-tax-deadlines-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian real estate agent tax deadline calendar
                </Link>
                . The mechanics of how instalment amounts are calculated under each
                of CRA's three published methods are covered in the{" "}
                <Link
                  href="/real-estate-agent-tax-planning-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  tax planning guide for Canadian real estate agents
                </Link>
                .
              </p>

              {/* ── Section 5 ── */}
              <h2 id="deduction-credit">
                The partial offset — half deduction, half credit
              </h2>

              <p>
                The headline 11.90% self-employed CPP1 rate is the gross figure. The
                actual after-tax cost is lower than the gross rate suggests, because
                of how CRA treats the two halves of the contribution.
              </p>

              <h3>The employer-half deduction</h3>

              <p>
                CRA treats half of CPP1 — the "employer half" — as a deductible
                business expense. It reduces net business income before federal and
                provincial income tax is calculated. For an agent paying combined
                marginal income tax rates of 35–45% (typical for net business income
                in the $80K–$150K band, depending on province), this deduction
                returns approximately 35–45 cents on every dollar of employer-half
                CPP1 paid.
              </p>

              <h3>The employee-half credit</h3>

              <p>
                The other half of CPP1 — the "employee half" — flows to a
                non-refundable tax credit. This credit is claimed at the lowest
                federal bracket rate (15%) plus the equivalent lowest provincial
                bracket rate. The provincial portion varies — typically in the
                5–10% range depending on province — so the combined credit value
                is usually around 20–25 cents on every dollar of employee-half CPP1
                paid.
              </p>

              <h3>CPP2 — fully deductible</h3>

              <p>
                CPP2, introduced in 2024 on earnings between YMPE and YAMPE, is
                treated differently again. CRA confirmed that CPP2 contributions are
                fully deductible from net business income — both halves — for
                self-employed filers. This means the net cost of CPP2 is reduced by
                the agent's full marginal income tax rate, not split between a
                deduction and a credit as CPP1 is.
              </p>

              <h3>The aggregate effect</h3>

              <p>
                Combining the deduction-half, credit-half, and full-deduction
                treatment, the after-tax cost of the gross 2025 maximum
                self-employed CPP contribution of $8,860.20 typically lands in the
                $5,800–$6,400 range, depending on province and marginal rate. The
                offset does not eliminate the burden, but it materially reduces it
                compared to what a simple application of the 11.90% gross rate
                might suggest. CRA's{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t1.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Schedule 8 instructions on the T1
                </a>{" "}
                show the exact line-by-line calculation.
              </p>

              {/* ── Section 6 ── */}
              <h2 id="incorporation-question">
                What incorporation does and doesn't change
              </h2>

              <p>
                Personal Real Estate Corporations (PRECs) are now permitted in most
                Canadian provinces — Ontario, British Columbia, Alberta, Manitoba,
                Saskatchewan, Nova Scotia, New Brunswick, and Newfoundland and
                Labrador have all enacted enabling legislation. Agents working in
                PREC-eligible provinces sometimes ask whether incorporation can
                eliminate the self-employed CPP burden.
              </p>

              <p>
                The CRA-published mechanics are these:
              </p>

              <ul>
                <li>
                  If a PREC pays its sole shareholder-agent a <strong>salary</strong>,
                  the salary is wages — and the corporation withholds and remits CPP
                  on those wages exactly as any employer would. The combined
                  employee-plus-employer CPP figure is the same as the self-employed
                  amount on the equivalent earnings. The contribution shifts
                  administratively, not in dollar terms.
                </li>
                <li>
                  If a PREC pays its sole shareholder-agent <strong>dividends</strong>{" "}
                  rather than salary, dividends are not wages. CPP does not apply to
                  dividend distributions. An agent paid entirely in dividends does
                  not contribute CPP on that distribution stream — and does not
                  accrue corresponding CPP retirement-benefit entitlement.
                </li>
                <li>
                  Most working PRECs use a <strong>blend</strong> of salary and
                  dividends. The salary portion attracts CPP; the dividend portion
                  does not. The CPP figure is determined entirely by the salary
                  portion, regardless of total corporate earnings.
                </li>
              </ul>

              <p>
                Whether a PREC structure is appropriate for any particular agent
                depends on factors well beyond CPP — corporate tax rates, dividend
                versus salary tax integration, RRSP-room generation (which requires
                T4 earnings, not dividends), provincial professional regulations,
                and incorporation costs. The PREC question is structural and
                situation-dependent. A qualified accountant familiar with both
                Canadian corporate tax and the agent's provincial real estate
                regulator is the appropriate consultation. This article addresses
                only the published CPP mechanics.
              </p>

              {/* ── Section 7 ── */}
              <h2 id="tracking">Tracking the CPP estimate through the year</h2>

              <p>
                Because self-employed CPP is calculated annually rather than
                deducted at source, an agent without a tracking system sees the full
                figure for the first time at filing. Agents who track an estimate
                through the year — using the published rates applied to net income
                as it accumulates — encounter no surprise figure in April.
              </p>

              <p>
                Agent Runway's tax engine implements the 2025 CRA-published CPP1
                and CPP2 schedule directly. As deals close and net business income
                accumulates, the engine produces a running estimate of the year's
                CPP contribution alongside the federal income tax estimate, the
                provincial income tax estimate, and (where applicable) HST
                obligation. The estimate is shown explicitly in the dashboard's tax
                readiness card and rolls into the quarterly instalment estimate the
                engine produces for years where the instalment threshold is met.
              </p>

              <p>
                The free{" "}
                <Link
                  href="/tools/realtor-tax-estimator"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian Realtor Tax Estimator
                </Link>{" "}
                produces the same CPP1 and CPP2 figures from a single GCI input —
                including the QPP variant for agents who select Quebec as their
                province. It is the same engine, run as a one-off public calculator
                rather than a tracked dashboard projection.
              </p>

            </article>

            {/* Bottom disclaimer */}
            <p className="mt-12 text-center text-xs leading-relaxed text-slate-400">
              This article is for general information and planning awareness only — not financial,
              tax, or professional advice. CPP rates and ceilings change annually and individual
              circumstances vary. Always verify current rates with the CRA or Service Canada and
              consult a qualified accountant or tax professional. Agent Runway assumes no liability
              for tax filing outcomes.{" "}
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
              See your estimated CPP contribution as your year unfolds.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway estimates your self-employed CPP1 and CPP2 alongside
              federal and provincial income tax — so the figure you owe in April is
              the figure you've been watching since January. Built for Canadian
              real estate agents.
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
