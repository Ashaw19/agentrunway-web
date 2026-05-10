import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "GST/HST Quick Method for Canadian Real Estate Agents (2026) — Eligibility, Service-Provider Remittance Rates, the 1% Credit, and the Trade-Off That Decides Whether It Saves Money",
  description:
    "How the GST/HST Quick Method works for self-employed Canadian real estate agents — the $400,000 turnover threshold, the service-provider remittance rates by province, the 1% credit on the first $30,000 of eligible supplies, the GST74 election mechanic, and the operating-expense ITC trade-off that decides whether the Quick Method actually saves money for an agent.",
  keywords: [
    "gst hst quick method real estate agent canada",
    "hst quick method realtor canada",
    "rc4058 quick method service provider",
    "gst74 election quick method",
    "quick method remittance rate ontario",
    "quick method 1% credit $30,000",
    "real estate agent quick method itc",
    "$400,000 quick method threshold",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/gst-hst-quick-method-real-estate-agents-canada",
    title:
      "GST/HST Quick Method for Canadian Real Estate Agents (2026) — Eligibility, Rates, and the ITC Trade-Off",
    description:
      "Self-employed Canadian real estate agents: how CRA's Quick Method actually works — the $400K turnover threshold, the service-provider remittance rates by province, the 1% credit on the first $30K of eligible supplies, GST74 mechanics, and the trade-off (no ITCs on operating expenses) that determines whether the method saves money. CRA-cited.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/gst-hst-quick-method-real-estate-agents-canada",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "GST/HST Quick Method for Canadian Real Estate Agents (2026) — Eligibility, Service-Provider Remittance Rates, the 1% Credit, and the Trade-Off That Decides Whether It Saves Money",
  description:
    "How the GST/HST Quick Method works for self-employed Canadian real estate agents — the $400,000 turnover threshold, the service-provider remittance rates by province, the 1% credit on the first $30,000 of eligible supplies, the GST74 election mechanic, and the operating-expense ITC trade-off that decides whether the Quick Method actually saves money for an agent.",
  url: "/gst-hst-quick-method-real-estate-agents-canada",
  datePublished: "2026-05-09",
  dateModified: "2026-05-10",
});

// ─── CRA primary sources (audit registry) ─────────────────────────────────────
//
// Every numeric or mechanical claim in this article is backed by one of the
// URLs below. Inline citations are rendered via <CRACite id={n} />. URLs were
// hand-verified live on 2026-05-10.

const CRA_SOURCES = [
  {
    id: 1,
    label:
      "CRA — RC4058 Quick Method of Accounting for GST/HST (publication landing page)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4058.html",
  },
  {
    id: 2,
    label:
      "CRA — Quick Method of Accounting for GST/HST (full text, eligibility, remittance rates, 1% credit, election rules)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4058/quick-method-accounting-gst-hst.html",
  },
  {
    id: 3,
    label:
      "CRA — GST74 Election and Revocation of an Election to Use the Quick Method of Accounting (form)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/gst74.html",
  },
  {
    id: 4,
    label:
      "CRA — RC4022 General Information for GST/HST Registrants (small-supplier $30,000 registration threshold, ITC mechanics)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html",
  },
  {
    id: 5,
    label:
      "CRA — Charge and collect the GST/HST: Which rate to charge (current GST/HST rates by province)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html",
  },
  {
    id: 6,
    label:
      "CRA — Notice 342 Nova Scotia HST Rate Decrease — General Transitional Rules (HST 15% to 14%, effective April 1, 2025)",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/notice342/nova-scotia-hst-rate-decrease-questions-answers-general-transitional-rules-personal-property-services.html",
  },
  {
    id: 7,
    label:
      "CRA — Input tax credits (ITC eligibility, capital property versus operating expenses)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit.html",
  },
  {
    id: 8,
    label:
      "CRA — When you need to register for a GST/HST account (the $30,000 small-supplier threshold)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html",
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
  { href: "#what-it-is", label: "What the Quick Method actually is" },
  { href: "#eligibility", label: "Eligibility — the $400,000 turnover threshold" },
  { href: "#rates", label: "Service-provider remittance rates by province" },
  { href: "#credit", label: "The 1% credit on the first $30,000 of eligible supplies" },
  { href: "#math", label: "A concrete math example, run both directions" },
  { href: "#itc-trade-off", label: "The trade-off — operating-expense ITCs are forfeited" },
  { href: "#election", label: "Electing the method — GST74 mechanics and the 1-year minimum" },
  { href: "#scenarios", label: "Realtor-specific scenarios" },
  { href: "#provincial", label: "Provincial nuances and the Quebec geo-block" },
  { href: "#tracking", label: "Comparing the two methods through the year" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GstHstQuickMethodRealEstateAgentsCanadaPage() {
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
              GST/HST Quick Method for Canadian Real Estate Agents (2026)
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Once an agent crosses the $30,000 small-supplier threshold and
              registers for GST/HST, CRA publishes two ways to calculate net
              tax owing — the regular method (HST collected minus HST paid on
              inputs) and the Quick Method (a flat percentage applied to
              HST-included revenue, with operating-expense ITCs forfeited).
              The Quick Method is simpler. It can also be financially
              meaningful — a service-heavy agent in Ontario with low input
              HST may remit thousands less per year. It can also work the
              other way for an agent with substantial deductible HST on
              vehicle, office, and marketing spend. The choice between the
              two methods is the agent&apos;s, made with their accountant.
              This article walks the published 2026 mechanic.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              12 min read · CRA-cited · Updated 2026-05-10
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
                Agency. Whether the Quick Method produces a better or worse
                outcome than the regular method in any specific situation
                depends on the agent&apos;s actual revenue, the actual
                deductible GST/HST on the agent&apos;s expenses, and the
                province where the agent&apos;s permanent establishment is
                located. Always verify current rates and your specific
                eligibility against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4058/quick-method-accounting-gst-hst.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA&apos;s RC4058 publication
                </a>{" "}
                and consult a qualified accountant or tax professional before
                electing or revoking the Quick Method.{" "}
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
              <h2 id="what-it-is">What the Quick Method actually is</h2>

              <p>
                The Quick Method is a published alternative to the regular
                method of calculating net GST/HST owing<CRACite id={2} />.
                Both methods produce a number that the registrant remits to
                CRA on each GST/HST return. They reach that number by
                different paths.
              </p>

              <p>
                Under the <strong>regular method</strong>, a registrant
                charges GST/HST on taxable supplies, claims input tax credits
                (ITCs) on the GST/HST paid on eligible business inputs, and
                remits the difference (HST collected minus HST paid)
                <CRACite id={2} /><CRACite id={7} />. Every taxable expense
                line, every receipt with HST on it, every business meal,
                every fuel fill-up, every Mailchimp subscription — each
                contributes a small ITC that reduces net tax owing.
              </p>

              <p>
                Under the <strong>Quick Method</strong>, the registrant still
                charges GST/HST on taxable supplies at the regular rate (5%
                GST or the applicable HST rate)<CRACite id={2} />. The
                difference is on the remittance side. Instead of computing
                HST collected minus ITCs, the registrant remits a flat
                <strong> Quick Method remittance rate</strong> applied to the
                HST-included total of taxable supplies for the period, with a
                separate 1% credit on the first $30,000 of eligible supplies
                each fiscal year<CRACite id={2} />. ITCs on operating
                expenses are forfeited. ITCs on capital property purchases
                may still be claimed separately<CRACite id={2} />.
              </p>

              <p>
                The mechanic was designed to simplify GST/HST compliance for
                small service-heavy businesses where input HST is modest
                relative to revenue<CRACite id={1} />. For a real estate
                agent whose biggest expense lines are commissions on splits
                (paid to brokerages, not subject to ITCs in the agent&apos;s
                hands), referral fees, professional dues, and marketing —
                the input-HST profile is often modest enough that the flat
                Quick Method rate produces a smaller remittance than the
                regular method. For an agent with a leased vehicle, paid
                office space, heavy marketing spend, and other input-rich
                expenses, the opposite can be true.
              </p>

              <p>
                For the registration mechanics that come before this choice
                — the $30,000 small-supplier threshold, the four-quarter
                rolling-revenue calculation, and what CRA expects on
                registration day — see the{" "}
                <Link
                  href="/real-estate-agent-hst-registration-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  HST/GST registration guide for Canadian real estate agents
                </Link>. The Quick Method is a post-registration choice; an
                unregistered agent below the small-supplier threshold has
                neither method to elect.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="eligibility">Eligibility — the $400,000 turnover threshold</h2>

              <p>
                CRA states that a registrant may elect the Quick Method if
                their <strong>annual worldwide taxable supplies</strong>
                {" "}(including GST/HST and the supplies of any associates)
                from the previous fiscal year do not exceed{" "}
                <strong>$400,000</strong><CRACite id={2} />. The threshold
                applies on a tax-included basis: an Ontario agent with
                $350,000 of GCI plus 13% HST collected ($45,500) has total
                taxable supplies of $395,500 — under the threshold. The
                same agent with $360,000 of GCI plus HST ($406,800) is
                already over.
              </p>

              <p>
                Additional CRA-published eligibility conditions
                <CRACite id={2} />:
              </p>

              <ul>
                <li>
                  CRA states the registrant is required to have been
                  registered for GST/HST throughout the 365-day period
                  ending immediately before the start of the reporting
                  period in which the election takes effect — with a
                  published exception for new registrants, who may elect
                  the Quick Method on registration<CRACite id={2} />.
                </li>
                <li>
                  Certain entities are excluded from the Quick Method —
                  CRA&apos;s published list includes financial institutions,
                  charities, public institutions, non-profit organizations
                  with at least 40% government funding, accountants and
                  bookkeepers, lawyers and law offices, financial
                  consultants, and actuaries<CRACite id={2} />. Real estate
                  agents are not on that excluded list. Self-employed
                  Canadian real estate agents licensed under a provincial
                  real estate council, paid through their brokerage as
                  commission income, are eligible for the Quick Method
                  subject to the $400,000 turnover and registration
                  conditions.
                </li>
                <li>
                  If a registrant&apos;s taxable supplies exceed $400,000 in
                  any reporting period or fiscal year, CRA states the
                  registrant ceases to qualify for the Quick Method
                  beginning in the first fiscal quarter following the
                  quarter in which the threshold was exceeded
                  <CRACite id={2} />. The registrant returns to the regular
                  method from that point.
                </li>
              </ul>

              <p>
                A note on the threshold versus the small-supplier threshold:
                the $30,000 figure that triggers GST/HST registration
                <CRACite id={8} /> and the $400,000 figure that limits Quick
                Method eligibility<CRACite id={2} /> are different rules
                that govern different decisions. An agent at $35,000 of
                annual revenue is registered (above small-supplier) and
                eligible for the Quick Method (well below $400K). An agent
                at $450,000 of annual revenue is registered but no longer
                eligible for the Quick Method. The two thresholds are
                independent.
              </p>

              {/* ── Section 3 ── */}
              <h2 id="rates">Service-provider remittance rates by province</h2>

              <p>
                CRA publishes two distinct remittance-rate tables — one for
                businesses that purchase goods for resale, and a different
                one for businesses that provide services<CRACite id={2} />.
                A real estate agent earning commission income falls under
                the service-provider table; CRA describes service providers
                as registrants whose business is the supply of services
                rather than the resale of goods purchased for that purpose
                <CRACite id={2} />.
              </p>

              <p>
                The published service-provider rates depend on two facts:
                where the registrant&apos;s permanent establishment is
                located, and where the supply itself is made
                <CRACite id={2} />. For a real estate agent, the
                establishment is typically the home or brokerage in the
                province they are licensed in, and the supplies (real estate
                services to Canadian clients on Canadian properties) are
                made in that same province. The two-province scenario is
                rare for working agents.
              </p>

              <p>
                The following service-provider rates apply when the
                permanent establishment and the supply are in the same
                province<CRACite id={2} />:
              </p>

              <div className="not-prose my-6 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-300">
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        Province / Territory
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        GST/HST Rate Charged
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        Quick Method Service-Provider Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600">
                    <tr className="border-b border-slate-200">
                      <td className="px-4 py-2">
                        BC, Alberta, Saskatchewan, Manitoba, Yukon, NT, Nunavut
                      </td>
                      <td className="px-4 py-2">5% GST</td>
                      <td className="px-4 py-2 font-mono">3.6%</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="px-4 py-2">Ontario</td>
                      <td className="px-4 py-2">13% HST</td>
                      <td className="px-4 py-2 font-mono">8.8%</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="px-4 py-2">
                        New Brunswick, Newfoundland and Labrador, Prince Edward Island
                      </td>
                      <td className="px-4 py-2">15% HST</td>
                      <td className="px-4 py-2 font-mono">10.0%</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="px-4 py-2">
                        Nova Scotia (post Apr 1, 2025)
                      </td>
                      <td className="px-4 py-2">14% HST</td>
                      <td className="px-4 py-2 font-mono">
                        See RC4058 / Notice 342
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p>
                The Nova Scotia row deserves a note. Effective April 1,
                2025, the Government of Nova Scotia decreased the
                provincial portion of the HST from 10% to 9%, dropping the
                total HST rate from 15% to 14%<CRACite id={6} />. CRA
                published transitional rules and updated remittance-rate
                tables for reporting periods beginning after March 31,
                2025<CRACite id={6} />. Nova Scotia agents on the Quick
                Method confirm the post-transition service-provider rate
                directly from the current edition of RC4058 before electing
                or filing<CRACite id={1} /><CRACite id={2} />.
              </p>

              <p>
                The rate is applied to <strong>HST-included</strong>{" "}
                taxable supplies, not to pre-tax revenue<CRACite id={2} />.
                This is the single most common mechanical error in
                informal Quick Method explanations: agents reading
                second-hand sources sometimes apply the rate to GCI
                (pre-HST), which understates the remittance. The published
                mechanic is the rate times the HST-included total of
                taxable supplies for the period<CRACite id={2} />.
              </p>

              {/* ── Section 4 ── */}
              <h2 id="credit">The 1% credit on the first $30,000 of eligible supplies</h2>

              <p>
                CRA states that registrants using the Quick Method receive a
                <strong> 1% credit</strong> on the first <strong>$30,000
                </strong> of eligible supplies on which they collect GST/HST
                in each fiscal year<CRACite id={2} />. The credit reduces
                the net tax remittance for the year by up to $300 ($30,000 ×
                1%).
              </p>

              <p>
                Two clarifications matter. First, the $30,000 base for the
                1% credit is <em>not</em> the same $30,000 figure that
                governs small-supplier registration<CRACite id={8} />. The
                small-supplier $30,000 is a four-quarter rolling threshold
                that determines whether an agent has to register for GST/HST
                at all. The Quick Method 1% credit&apos;s $30,000 base is
                a fiscal-year cap on the supplies eligible for the credit,
                applied each fiscal year a Quick Method election is in
                place. Two distinct rules; two distinct $30,000 figures.
              </p>

              <p>
                Second, the 1% credit applies to the <strong>first
                $30,000 of eligible supplies</strong> in the fiscal year —
                not to revenue above that point<CRACite id={2} />. An agent
                with $200,000 of supplies in the year still receives a
                maximum credit of $300; the credit is not pro-rated to a
                higher revenue base.
              </p>

              <p>
                For an agent in their first registered fiscal year, the
                credit is the most meaningful at the lower end of the
                revenue range. At $30,000 of eligible supplies, the $300
                credit is a full 1% reduction in net tax owing. At $200,000
                of supplies, the same $300 is a 0.15% reduction. The
                credit&apos;s mechanical weight is heavier on lower-revenue
                Quick Method users.
              </p>

              {/* ── Section 5 ── */}
              <h2 id="math">A concrete math example, run both directions</h2>

              <p>
                The choice between regular method and Quick Method comes
                down to one comparison: the flat Quick Method remittance
                (rate times HST-included revenue, less the 1% credit) versus
                the regular-method remittance (HST collected minus ITCs).
                The math runs in opposite directions for different
                input-HST profiles. Below is the same agent — Ontario,
                $100,000 GCI after splits, registered for HST — modelled
                with two different expense profiles.
              </p>

              <h3>Profile A — service-heavy, low input HST</h3>

              <p>
                Agent earns $100,000 GCI in Ontario. They charge HST at 13%
                ($13,000), so HST-included revenue is $113,000. Their
                deductible expenses include modest marketing, professional
                dues, software subscriptions, and a small home office —
                producing roughly $11,500 of HST-eligible expenses with
                $1,500 of ITCs available under the regular method.
              </p>

              <ul>
                <li>
                  <strong>Regular method:</strong> $13,000 HST collected
                  minus $1,500 ITCs = <strong>$11,500</strong> remitted.
                </li>
                <li>
                  <strong>Quick Method:</strong> 8.8% × $113,000 = $9,944,
                  minus $300 (1% credit on first $30,000) ={" "}
                  <strong>$9,644</strong> remitted.
                </li>
                <li>
                  <strong>Difference:</strong> Quick Method retains $1,856
                  more cash for the agent in the year.
                </li>
              </ul>

              <h3>Profile B — input-heavy, high deductible HST</h3>

              <p>
                Same Ontario agent, same $100,000 GCI, same $13,000 HST
                collected. Different expense profile: the agent leases a
                vehicle ($800/mo with HST), rents desk space at the
                brokerage above the standard split ($600/mo with HST),
                spends meaningfully on photography, signage, and digital
                marketing — producing $5,000 of ITCs available under the
                regular method.
              </p>

              <ul>
                <li>
                  <strong>Regular method:</strong> $13,000 HST collected
                  minus $5,000 ITCs = <strong>$8,000</strong> remitted.
                </li>
                <li>
                  <strong>Quick Method:</strong> 8.8% × $113,000 = $9,944,
                  minus $300 (1% credit on first $30,000) ={" "}
                  <strong>$9,644</strong> remitted.
                </li>
                <li>
                  <strong>Difference:</strong> Quick Method costs the agent
                  $1,644 more in the year than the regular method.
                </li>
              </ul>

              <p>
                Same agent, same GCI, same province. Two different expense
                profiles; the methods rank in opposite orders. The break-
                even point — for an Ontario service provider on the 8.8%
                rate — is roughly the level of ITCs at which the regular
                method&apos;s saving exactly offsets the Quick Method&apos;s
                lower flat rate. With $13,000 HST collected and a Quick
                Method remittance of $9,644 (after the credit), the
                break-even ITC level is around $3,356 of input HST per
                year. Below that level of deductible input HST, the Quick
                Method tends to retain more cash; above it, the regular
                method does. The exact break-even varies by province, by
                whether the 1% credit is fully consumed, and by the
                composition of capital versus operating expenses (covered
                in the next section).
              </p>

              <p>
                The numbers above are illustrative and use simplified
                inputs. The published mechanic is the same; the actual
                outcome for any specific agent depends on their specific
                numbers, which is exactly why the choice is a decision the
                agent makes with their accountant — not a recommendation
                this article can make on a generic profile<CRACite id={2} />.
              </p>

              {/* ── Cheat sheet inline CTA ── */}
              <div className="not-prose my-8">
                <EmailCapture
                  heading="Get the Canadian Realtor Tax Cheat Sheet"
                  subheading="Every 2025 bracket, CPP rate, GST/HST threshold, and deadline on one printable page — CRA-cited. We'll email it to you."
                  ctaLabel="Email me the cheat sheet"
                  source="cheat_sheet_inline_gst-hst-quick-method-real-estate-agents-canada"
                  variant="light"
                />
              </div>

              {/* ── Section 6 ── */}
              <h2 id="itc-trade-off">The trade-off — operating-expense ITCs are forfeited</h2>

              <p>
                The structural trade-off of the Quick Method is the
                forfeiture of ITCs on operating expenses<CRACite id={2} />.
                A registrant on the Quick Method does not claim ITCs on the
                GST/HST paid on day-to-day business inputs — fuel, meals,
                marketing, professional dues, software, brokerage fees,
                supplies, and the operating-cost portion of vehicle
                expenses. Those input HST dollars are absorbed into the
                Quick Method&apos;s flat remittance rate, which was set at a
                level intended to approximate the average input-HST profile
                of a generic small service business.
              </p>

              <p>
                CRA does retain one carve-out: <strong>ITCs on capital
                property purchases</strong> may still be claimed separately
                under the Quick Method<CRACite id={2} />. This includes
                eligible capital expenditures — a vehicle purchase (subject
                to the 90% GST/HST ITC threshold for sole proprietors and
                the Class 10.1 ceiling — see the{" "}
                <Link
                  href="/vehicle-expenses-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  vehicle expenses guide for Canadian real estate agents
                </Link>{" "}
                for those rules), eligible computer equipment, eligible
                office furniture, and other capital-property classes. The
                operating-cost stream is what gets absorbed into the flat
                rate; the capital-property stream remains separately
                creditable.
              </p>

              <p>
                The split matters for the math because most agents&apos;
                input HST is concentrated in operating expenses, not
                capital. A typical year might involve $4,000–$7,000 of HST
                on operating expenses (vehicle operating costs, marketing,
                meals, dues, supplies) and $0–$1,500 of HST on capital
                property (a one-time monitor purchase, a desk, occasional
                tech). The Quick Method gives up the larger stream and
                preserves the smaller one. For agents whose vehicle is
                leased rather than purchased — and the ITC therefore
                accrues on the lease payments (operating) rather than on a
                vehicle acquisition (capital) — the forfeited stream is
                even larger.
              </p>

              <p>
                The implication is that an agent thinking about the Quick
                Method is really comparing the flat-rate saving against the
                value of the operating-expense ITCs they would have claimed
                under the regular method. If those ITCs are large (Profile
                B above), the Quick Method costs the agent money. If those
                ITCs are small (Profile A above), the Quick Method retains
                cash. The threshold between the two is mechanical and
                computable. It is not a judgment call about &quot;which
                method is better&quot; — it is an arithmetic comparison
                that depends on the agent&apos;s actual numbers
                <CRACite id={2} />.
              </p>

              {/* ── Section 7 ── */}
              <h2 id="election">Electing the method — GST74 mechanics and the 1-year minimum</h2>

              <p>
                CRA states the election is made by filing Form{" "}
                <strong>GST74 — Election and Revocation of an Election to
                Use the Quick Method of Accounting</strong>
                <CRACite id={3} />. The form is filed with CRA;{" "}
                no accountant or brokerage signature is required.
              </p>

              <p>
                Timing rules<CRACite id={2} />:
              </p>

              <ul>
                <li>
                  CRA states the election is required to be filed by the
                  first day of the reporting period in which the election
                  is to take effect<CRACite id={2} />. For an annual filer
                  with a calendar fiscal year electing for 2026, the
                  filing deadline is January 1, 2026. For a quarterly
                  filer electing for the quarter beginning April 1, the
                  deadline is April 1.
                </li>
                <li>
                  An election remains in effect for at least <strong>one
                  year</strong> from the effective date<CRACite id={2} />.
                  The 1-year minimum commitment means an agent who elects
                  the Quick Method on January 1 and discovers in March
                  that the regular method would have produced a smaller
                  remittance cannot revoke until at least the following
                  January 1. The election is not a per-period switch.
                </li>
                <li>
                  After the 1-year minimum has elapsed, the election may
                  be revoked by filing a revocation on the same GST74 form
                  <CRACite id={3} />. CRA states a revocation also takes
                  effect on the first day of a reporting period
                  <CRACite id={2} />.
                </li>
                <li>
                  As covered in section 2, if taxable supplies exceed
                  $400,000 in any reporting period or fiscal year, the
                  registrant ceases to qualify for the Quick Method
                  beginning in the first fiscal quarter following the
                  quarter in which the threshold was exceeded
                  <CRACite id={2} />. This is a forced exit, not a
                  revocation — no GST74 revocation needs to be filed; the
                  registrant simply returns to the regular method from
                  that point.
                </li>
              </ul>

              <p>
                A new registrant — an agent registering for GST/HST for the
                first time, having just crossed the small-supplier threshold
                — may elect the Quick Method on registration, without
                having been registered for the prior 365 days
                <CRACite id={2} />. This is the published exception to the
                ordinary 1-year-prior-registration eligibility rule. For a
                newly-registered agent, the practical sequence is: register
                for GST/HST (BN open, GST/HST account open, effective
                registration date set); concurrently file GST74 with the
                same effective date if the Quick Method is being elected
                <CRACite id={3} />.
              </p>

              {/* ── Section 8 ── */}
              <h2 id="scenarios">Realtor-specific scenarios</h2>

              <p>
                The published rules apply uniformly, but the day-to-day
                patterns of working real estate agents produce a few
                recurring scenarios where the Quick Method math runs in
                identifiable directions. Each item below describes how
                the rule applies — not what an agent &quot;should&quot;
                do, which is the accountant&apos;s lane.
              </p>

              <h3>The high-revenue, low-input agent</h3>

              <p>
                A luxury-segment agent earning $200,000–$390,000 of GCI
                from their home office, driving a personal vehicle that is
                modestly business-used, with a lean tech stack and minimal
                paid marketing. Most input HST is on small recurring
                operating costs. Under the regular method, ITCs are
                modest; under the Quick Method, the flat rate applied to a
                large HST-included base produces a smaller remittance than
                HST collected minus those modest ITCs. This profile is the
                one for which the Quick Method was originally designed.
                The 1% credit on the first $30,000 is fully consumed; the
                marginal saving above that comes from the rate spread
                itself (8.8% applied to HST-included revenue versus 13%
                effectively collected on pre-tax revenue, after ITCs).
              </p>

              <h3>The mid-revenue, input-heavy agent</h3>

              <p>
                An agent earning $80,000–$150,000 of GCI with a leased
                vehicle, paid brokerage office space above the standard
                split, an active marketing program (photography,
                staging, signage, digital ads), and a consultant or
                bookkeeper paid monthly. The aggregate operating-expense
                input HST may run $4,000–$8,000 a year. Under the regular
                method, those ITCs flow through directly and reduce net
                tax. Under the Quick Method, they are forfeited. The flat
                rate applied to HST-included revenue, less the $300
                credit, produces a larger remittance than the regular
                method&apos;s HST-collected-minus-ITCs calculation. For
                this profile, the Quick Method tends to cost more than it
                saves.
              </p>

              <h3>The new agent in year one</h3>

              <p>
                A licensed agent who has just crossed the $30,000
                small-supplier threshold and is registering for GST/HST
                <CRACite id={8} />. Year-one revenue is uncertain and
                year-one expenses are typically front-loaded (initial
                marketing, brokerage onboarding, tech setup, vehicle
                preparation). The published rules permit electing the
                Quick Method on registration, without the ordinary 1-year-
                prior-registration condition<CRACite id={2} />. The
                decision factor is the same as for any other agent: the
                flat-rate saving versus the value of the forfeited
                operating-expense ITCs over the coming year. The agent has
                less data than a third-year agent has, and the choice is
                accordingly more sensitive to expectations about year-one
                ITC volume — which is exactly the kind of forward-looking
                assessment an accountant does using the agent&apos;s
                business plan and projected expenses.
              </p>

              <h3>The agent close to the $400,000 ceiling</h3>

              <p>
                An agent whose annual taxable supplies are approaching
                $400,000 (HST-included). The Quick Method ceases to apply
                in the first fiscal quarter following the quarter in
                which the threshold was exceeded<CRACite id={2} />. An
                agent in this band is filing under the Quick Method for
                only part of the year, with a forced switch to the
                regular method partway through. The Quick Method election
                does not need to be revoked manually — the threshold
                exit is automatic — but the agent and accountant
                anticipate the transition and reconcile reporting
                accordingly.
              </p>

              <h3>The PREC scenario</h3>

              <p>
                An agent operating through a Personal Real Estate
                Corporation (PREC) is a different registrant than the
                same individual operating as a sole proprietor. The PREC
                has its own GST/HST registration, its own $30,000
                small-supplier threshold, its own $400,000 Quick Method
                ceiling, and its own GST74 election decision
                <CRACite id={2} />. PREC mechanics interact with corporate
                tax rules that are separate from the GST/HST decision and
                that go well beyond this article&apos;s scope. For the
                broader PREC frame, see the{" "}
                <Link
                  href="/prec-vs-sole-proprietor-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  PREC vs sole proprietor guide for real estate agents in Canada
                </Link>.
              </p>

              <h3>The agent with a home office and significant home-related HST</h3>

              <p>
                An agent claiming Line 9945 business-use-of-home expenses
                with a registered HST account may claim ITCs on the
                business-use portion of HST-eligible home expenses under
                the regular method — utilities, internet, repairs, etc.
                Under the Quick Method, those operating-expense ITCs are
                forfeited<CRACite id={2} />. The home-office calculation
                still applies for income-tax purposes (T2125 Line 9945
                deduction is unrelated to the HST method); only the HST
                ITC stream changes. For the income-tax mechanic, see the
                {" "}
                <Link
                  href="/business-use-of-home-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  business-use-of-home guide for Canadian real estate agents
                </Link>.
              </p>

              {/* ── Section 9 ── */}
              <h2 id="provincial">Provincial nuances and the Quebec geo-block</h2>

              <p>
                The Quick Method is a federal mechanic administered by CRA,
                with rates that vary by province because the underlying
                HST rate varies by province<CRACite id={2} />. For an
                agent whose permanent establishment and supplies are both
                in the same province, the rate is the single value
                listed in the table in section 3.
              </p>

              <p>
                The cross-province scenario is unusual for working real
                estate agents — almost all supplies are made in the
                province where the licensee is registered with the
                provincial real estate council and where the property is
                located. Where it does arise (e.g., a referral fee earned
                on a transaction in another province), CRA publishes
                separate rates for cross-province supplies in RC4058
                <CRACite id={2} />. An accountant resolves the cross-
                province application from the agent&apos;s actual supply
                pattern.
              </p>

              <h3>Quebec — QST and the Agent Runway geo-block</h3>

              <p>
                Quebec administers its own Quebec Sales Tax (QST) alongside
                GST and has its own Quick Method equivalent under
                Revenu Québec rules, with separate remittance rates and
                separate election forms (FP-2074). This article does not
                cover Quebec-specific QST mechanics. Agent Runway is
                currently geo-blocked from Quebec pending Law 25
                compliance work and French translation; Quebec agents are
                referred to Revenu Québec&apos;s published guidance and a
                Quebec-licensed accountant.
              </p>

              {/* ── Section 10 ── */}
              <h2 id="tracking">Comparing the two methods through the year</h2>

              <p>
                The decision between regular method and Quick Method is
                only as good as the data behind it. A clean comparison
                requires knowing — through the year, not retroactively at
                year-end — the HST collected on commission revenue, the
                HST paid on every operating expense, the HST paid on every
                capital purchase, and the running revenue total against
                the $400,000 ceiling. Reconstructing those figures from
                shoeboxes of receipts in March produces a comparison that
                is, at best, late.
              </p>

              <p>
                Agent Runway tracks GST/HST collected on commission
                income (post-split, by transaction) and GST/HST paid on
                expenses (categorized to T2125 lines and to operating-
                versus-capital classes). The dashboard estimates the net
                HST owing under the regular method as the year unfolds.
                The Navigator persona surfaces the published Quick Method
                rules — eligibility, the rate by province, the 1% credit,
                the 1-year minimum, the operating-expense ITC trade-off
                — as information for the agent and their accountant, not
                as a recommendation about which method to elect.
              </p>

              <p>
                The free{" "}
                <Link
                  href="/tools/realtor-tax-estimator"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian Realtor Tax Estimator
                </Link>{" "}
                provides a public-facing model that incorporates GCI,
                province, and self-employed CPP, with the regular-method
                HST mechanic surfaced. Quick Method comparison is a planned
                v1.1 enhancement; for the present, the regular-method
                output of the estimator paired with this article&apos;s
                published Quick Method rates allows an agent to model
                both calculations side by side using their own numbers.
              </p>

              <p>
                For the broader Canadian agent finance picture — every
                CRA surface AR covers, from registration and instalments
                through deductions and provincial rates — see the{" "}
                <Link
                  href="/canadian-real-estate-agent-financial-platform"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian real estate agent financial platform overview
                </Link>. For the T2125 line-by-line picture that the
                income-tax side of HST registration interacts with, see
                the{" "}
                <Link
                  href="/t2125-guide-real-estate-agents-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  T2125 guide for Canadian real estate agents
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
                live on 2026-05-10.
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
              only — not financial, tax, or professional advice. Whether the
              Quick Method produces a better outcome than the regular method
              in any specific situation depends on the agent&apos;s actual
              revenue, the actual deductible GST/HST on the agent&apos;s
              operating and capital expenses, and the province where the
              permanent establishment is located. The election carries a
              minimum 1-year commitment. Always verify current rates with
              CRA&apos;s RC4058 publication and consult a qualified
              accountant or tax professional before electing or revoking
              the Quick Method. Agent Runway assumes no liability for tax
              filing outcomes.{" "}
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
              Compare your two methods with your real numbers, not a generic profile.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway tracks GST/HST collected on commission income
              and GST/HST paid on expenses (operating versus capital,
              T2125-tagged) as your year unfolds — surfaced alongside
              federal, provincial, CPP, and instalment estimates. Built
              for Canadian real estate agents.
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
