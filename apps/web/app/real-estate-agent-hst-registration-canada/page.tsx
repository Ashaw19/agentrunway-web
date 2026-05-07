import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title:
    "HST/GST Registration for Canadian Real Estate Agents (2025)",
  description:
    "The $30,000 small-supplier threshold, mandatory vs voluntary registration, Input Tax Credits, provincial HST rates, taxable vs exempt commissions, and filing frequency — a CRA-cited guide for self-employed Canadian real estate agents.",
  keywords: [
    "hst registration real estate agent",
    "gst registration realtor canada",
    "small supplier threshold $30000",
    "input tax credits real estate",
    "hst rates by province canada",
    "real estate commission hst exempt",
    "gst34 filing frequency",
  ],
  openGraph: {
    type: "article",
    url: "https://agentrunway.ca/real-estate-agent-hst-registration-canada",
    title:
      "HST/GST Registration for Canadian Real Estate Agents (2025)",
    description:
      "The $30,000 small-supplier threshold, mandatory vs voluntary registration, Input Tax Credits, provincial HST rates, taxable vs exempt commissions, and filing frequency — a CRA-cited guide for self-employed Canadian real estate agents.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/real-estate-agent-hst-registration-canada",
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "HST/GST Registration for Canadian Real Estate Agents (2025)",
  description:
    "The $30,000 small-supplier threshold, mandatory vs voluntary registration, Input Tax Credits, provincial HST rates, taxable vs exempt commissions, and filing frequency — a CRA-cited guide for self-employed Canadian real estate agents.",
  url: "/real-estate-agent-hst-registration-canada",
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
    label:
      "CRA — When to register for and start charging the GST/HST (small supplier)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html",
  },
  {
    id: 2,
    label: "CRA — Register for a GST/HST account",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/gst-hst-account/register-account.html",
  },
  {
    id: 3,
    label: "CRA — Charge and collect the tax — Which rate to charge",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html",
  },
  {
    id: 4,
    label: "CRA — Input tax credits",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit.html",
  },
  {
    id: 5,
    label:
      "CRA — File a GST/HST return — Reporting requirements and deadlines",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/file-gst-hst-return/reporting-requirements-deadlines.html",
  },
  {
    id: 6,
    label:
      "Excise Tax Act, R.S.C. 1985, c. E-15 (Schedule V — Exempt Supplies)",
    url: "https://laws-lois.justice.gc.ca/eng/acts/E-15/page-51.html",
  },
  {
    id: 7,
    label:
      "CRA — Make changes to your GST/HST account (reporting period thresholds)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/gst-hst-account/change-account.html",
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
  { href: "#threshold", label: "The $30,000 small-supplier threshold" },
  { href: "#registering", label: "Registering: voluntary vs. mandatory" },
  { href: "#itcs", label: "Input Tax Credits (ITCs)" },
  { href: "#rates", label: "HST/GST rates by province" },
  { href: "#taxable-exempt", label: "Taxable vs. exempt: the residential commission rule" },
  { href: "#filing", label: "Filing frequency and the GST34 return" },
  { href: "#tracking", label: "Tracking through the year" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RealEstateAgentHstRegistrationCanadaPage() {
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
              HST/GST Registration for Canadian Real Estate Agents (2025)
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              A real estate agent&apos;s first commission cheque often crosses
              the CRA threshold that activates a GST/HST registration
              obligation. This article explains the published $30,000
              small-supplier rule, the difference between voluntary and
              mandatory registration, how Input Tax Credits work, the
              provincial rate table, the taxable-versus-exempt distinction
              for residential commissions, and the filing frequency thresholds
              that determine whether returns are annual, quarterly, or monthly.
            </p>
            <p className="mt-3 text-xs text-slate-500">11 min read · Updated for 2025 CRA rules</p>
          </div>
        </section>

        {/* ── Article body ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* Top disclaimer */}
            <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs leading-relaxed text-amber-700">
                <strong className="text-amber-800">General information only — not tax advice.</strong>{" "}
                This article describes the CRA-published mechanics of GST/HST
                registration for self-employed individuals. Thresholds,
                provincial rates, and filing rules change over time, and
                individual circumstances vary. Always verify current rules
                against{" "}
                <a
                  href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  CRA&apos;s GST/HST guidance
                </a>{" "}
                and consult a qualified accountant or tax professional before
                making any filing or registration decision.{" "}
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
              <h2 id="threshold">
                The $30,000 small-supplier threshold
              </h2>

              <p>
                The CRA-published rule defines a <strong>small supplier</strong>{" "}
                as a person whose total worldwide taxable supplies (including
                zero-rated supplies) from all businesses are{" "}
                <strong>$30,000 or less</strong> over any single calendar
                quarter or over the four most recent consecutive calendar
                quarters<CRACite id={1} />. A self-employed real estate agent
                whose commission income stays at or under that threshold over
                a rolling four-quarter window remains a small supplier and is
                not required to register for GST/HST<CRACite id={1} />.
              </p>

              <p>
                The threshold is measured against{" "}
                <em>taxable supplies</em> — not gross deals, not sale prices,
                not brokerage splits before the agent&apos;s share. For a real
                estate agent, the relevant figure is the agent&apos;s own
                commission income (the service fee paid to the agent for the
                real estate service)<CRACite id={1} />.
              </p>

              <p>
                Three mechanical details on how the threshold is applied:
              </p>

              <ul>
                <li>
                  <strong>Rolling, not calendar.</strong> The four-quarter
                  window is the four <em>most recent consecutive</em>{" "}
                  calendar quarters, recomputed each quarter — not a fixed
                  January-to-December window<CRACite id={1} />.
                </li>
                <li>
                  <strong>Single-quarter trigger.</strong> A single calendar
                  quarter that exceeds $30,000 on its own ends small-supplier
                  status immediately, even if the trailing four-quarter total
                  is under $30,000<CRACite id={1} />.
                </li>
                <li>
                  <strong>Common first-trigger pattern.</strong> Real estate
                  commissions often arrive in concentrated bursts. The
                  threshold can be crossed by a single residential resale
                  closing or by the sum of two or three closings in one quarter.
                </li>
              </ul>

              <p>
                Crossing $30,000 in revenue is the mechanical event that ends
                small-supplier status and activates registration obligations
                — described in the next section<CRACite id={1} />.
              </p>

              {/* ── Section 2 ── */}
              <h2 id="registering">
                Registering: voluntary vs. mandatory
              </h2>

              <p>
                CRA describes two routes into the GST/HST system: voluntary
                registration while the agent is still a small supplier, or
                mandatory registration once the threshold is crossed
                <CRACite id={1} /><CRACite id={2} />.
              </p>

              <h3>Mandatory registration timing</h3>

              <p>
                When taxable revenues exceed $30,000 in a single calendar
                quarter, small-supplier status ends <em>immediately</em> on
                the supply that pushed the total past $30,000. GST/HST applies
                to that supply and to every supply afterwards, and the
                registration application is due within{" "}
                <strong>29 days</strong> of that supply<CRACite id={1} />.
              </p>

              <p>
                When taxable revenues exceed $30,000 over four consecutive
                calendar quarters (without any single quarter exceeding
                $30,000), the small-supplier exception expires at the end of
                the month following the quarter in which the threshold was
                crossed. From that point forward, GST/HST applies to all
                taxable supplies and registration is due within 29 days of
                the first taxable supply made after that grace month
                <CRACite id={1} />.
              </p>

              <p>
                An agent who collects commission past the date small-supplier
                status ended without having registered remains liable for the
                GST/HST on those supplies. CRA can assess the unremitted tax
                retroactively against the agent — even if the brokerage paid
                the commission as a flat amount with no GST/HST line item
                <CRACite id={1} />.
              </p>

              <h3>Voluntary registration</h3>

              <p>
                A small supplier may register voluntarily before reaching the
                $30,000 threshold<CRACite id={1} />. Voluntary registration
                opens access to Input Tax Credits (described in the next
                section) but also requires the agent to charge GST/HST on
                taxable supplies, file returns on the assigned schedule, and
                remit collected tax<CRACite id={1} /><CRACite id={5} />.
              </p>

              <h3>How registration is completed</h3>

              <p>
                CRA provides several published channels for opening a GST/HST
                account<CRACite id={2} />:
              </p>

              <ul>
                <li>
                  <strong>Business Registration Online (BRO)</strong> — the
                  CRA self-serve portal. Most common path for individuals
                  who already have a Business Number<CRACite id={2} />.
                </li>
                <li>
                  <strong>By phone</strong> — the CRA Business enquiries
                  line<CRACite id={2} />.
                </li>
                <li>
                  <strong>By mail or fax</strong> — using Form RC1, Request
                  for a Business Number and Certain Program Accounts
                  <CRACite id={2} />.
                </li>
              </ul>

              <p>
                The result is a 9-digit Business Number (BN) plus a GST/HST
                program identifier (RT0001), e.g.{" "}
                <strong>123456789 RT0001</strong><CRACite id={2} />. This is
                the number the agent uses on commission invoices and on the
                GST34 return.
              </p>

              {/* ── Section 3 ── */}
              <h2 id="itcs">
                Input Tax Credits (ITCs)
              </h2>

              <p>
                Once registered, a real estate agent collects GST/HST on
                taxable commissions and pays GST/HST on most business
                expenses. The mechanism that links the two is the{" "}
                <strong>Input Tax Credit</strong> — the credit a registrant
                claims for GST/HST paid on qualifying expenses incurred to
                make taxable supplies<CRACite id={4} />.
              </p>

              <p>
                On each GST/HST return, the registrant calculates net tax as
                GST/HST collected on taxable sales <em>minus</em> ITCs claimed
                on eligible expenses. The remitted figure is the difference
                <CRACite id={4} /><CRACite id={5} />.
              </p>

              <p>
                CRA&apos;s published ITC eligibility rules require that the
                expense<CRACite id={4} />:
              </p>

              <ul>
                <li>
                  Be acquired or imported for consumption, use, or supply in
                  the course of the registrant&apos;s commercial activities;
                </li>
                <li>
                  Be supported by adequate documentation showing the supplier,
                  the supplier&apos;s GST/HST registration number, the date,
                  the amount of GST/HST paid or payable, and a description of
                  the supply;
                </li>
                <li>
                  Be claimed within the time limit specified in the Excise
                  Tax Act (generally four years for most registrants).
                </li>
              </ul>

              <p>
                Common business categories where a real estate agent may incur
                GST/HST that becomes eligible for an ITC include
                <CRACite id={4} />:
              </p>

              <ul>
                <li>Brokerage desk fees and association dues that include GST/HST</li>
                <li>
                  Marketing and advertising — listing photography, signage,
                  paid digital ads where the supplier charges GST/HST
                </li>
                <li>
                  Technology subscriptions used for the business — CRM
                  software, financial-tracking platforms (such as Agent
                  Runway), MLS-adjacent tooling
                </li>
                <li>Office supplies, stationery, business cards</li>
                <li>Professional fees — accountant, lawyer, consultant</li>
                <li>
                  Vehicle expenses — fuel, repairs, leases — pro-rated to the
                  business-use portion of total kilometres driven
                </li>
                <li>Cell phone and internet — pro-rated to business use</li>
              </ul>

              <p>
                Some expenses are subject to specific limitations. Meals and
                entertainment are generally limited to 50% of the GST/HST
                paid for ITC purposes, mirroring the income-tax limitation
                <CRACite id={4} />. Personal-use portions of mixed-use
                expenses are not eligible for ITCs<CRACite id={4} />.
              </p>

              {/* ── Section 4 ── */}
              <h2 id="rates">
                HST/GST rates by province
              </h2>

              <p>
                The applicable rate is determined by the place of supply
                rules — for a real estate agent, generally the province where
                the real property is located<CRACite id={3} />. Five
                provinces use a harmonized rate (HST) that combines the
                federal and provincial portions into a single tax. Five
                provinces and three territories use only the federal 5% GST,
                with provincial sales tax (PST or RST) administered
                separately where applicable<CRACite id={3} />. Quebec uses
                the 5% federal GST plus the QST, administered by Revenu
                Québec<CRACite id={3} />.
              </p>

              <div className="not-prose my-6 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Province / Territory</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Rate</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-600">
                    <tr><td className="px-4 py-2">Alberta</td><td className="px-4 py-2">5%</td><td className="px-4 py-2">GST</td></tr>
                    <tr><td className="px-4 py-2">British Columbia</td><td className="px-4 py-2">5%</td><td className="px-4 py-2">GST (PST administered separately)</td></tr>
                    <tr><td className="px-4 py-2">Manitoba</td><td className="px-4 py-2">5%</td><td className="px-4 py-2">GST (RST administered separately)</td></tr>
                    <tr><td className="px-4 py-2">New Brunswick</td><td className="px-4 py-2">15%</td><td className="px-4 py-2">HST</td></tr>
                    <tr><td className="px-4 py-2">Newfoundland and Labrador</td><td className="px-4 py-2">15%</td><td className="px-4 py-2">HST</td></tr>
                    <tr><td className="px-4 py-2">Nova Scotia</td><td className="px-4 py-2">15%</td><td className="px-4 py-2">HST</td></tr>
                    <tr><td className="px-4 py-2">Ontario</td><td className="px-4 py-2">13%</td><td className="px-4 py-2">HST</td></tr>
                    <tr><td className="px-4 py-2">Prince Edward Island</td><td className="px-4 py-2">15%</td><td className="px-4 py-2">HST</td></tr>
                    <tr><td className="px-4 py-2">Quebec</td><td className="px-4 py-2">5% + QST</td><td className="px-4 py-2">GST + QST (Revenu Québec)</td></tr>
                    <tr><td className="px-4 py-2">Saskatchewan</td><td className="px-4 py-2">5%</td><td className="px-4 py-2">GST (PST administered separately)</td></tr>
                    <tr><td className="px-4 py-2">Northwest Territories, Nunavut, Yukon</td><td className="px-4 py-2">5%</td><td className="px-4 py-2">GST</td></tr>
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-slate-500">
                Rates published by CRA, current as of the article date.
                Provincial sales taxes (PST in BC and SK, RST in MB) and the
                QST in Quebec are administered separately by the relevant
                provincial revenue agencies and are outside the GST/HST
                return<CRACite id={3} />.
              </p>

              <p>
                For an agent licensed in a single province, the rate to charge
                on commissions is the rate for that province. An agent who
                represents a buyer or seller on a property located in a
                different province from where the agent is registered applies
                the rate of the province where the property is located, per
                the place-of-supply rules for real property services
                <CRACite id={3} />.
              </p>

              {/* ── Section 5 ── */}
              <h2 id="taxable-exempt">
                Taxable vs. exempt: the residential commission rule
              </h2>

              <p>
                A point of frequent confusion: the <em>sale</em> of a used
                residential property is an <strong>exempt supply</strong>{" "}
                under Schedule V, Part I of the Excise Tax Act — the seller
                does not charge GST/HST on the sale price<CRACite id={6} />.
                But the <em>real estate agent&apos;s commission</em> is a
                separate supply: a service rendered by the agent to the
                client, which is a <strong>taxable supply</strong>{" "}
                <CRACite id={1} /><CRACite id={6} />.
              </p>

              <p>
                The two transactions are taxed differently because they are
                two different supplies. The residential property changing
                hands between buyer and seller is exempt; the brokerage
                service the agent provides is taxable. GST/HST applies to the
                commission regardless of whether the underlying property sale
                is itself exempt<CRACite id={1} /><CRACite id={6} />.
              </p>

              <p>
                The mechanics applied to the most common categories of
                services a real estate agent provides:
              </p>

              <ul>
                <li>
                  <strong>Commission on a residential resale.</strong> The
                  property sale is exempt; the agent&apos;s commission is
                  taxable<CRACite id={1} /><CRACite id={6} />.
                </li>
                <li>
                  <strong>Commission on a new-build residential sale.</strong>{" "}
                  The new-build sale is taxable to the buyer (with new
                  housing rebate mechanics outside the scope of this article);
                  the agent&apos;s commission is also taxable<CRACite id={1} />.
                </li>
                <li>
                  <strong>Commission on a commercial property sale or lease.</strong>{" "}
                  Commercial real property sales and leases are generally
                  taxable supplies; the agent&apos;s commission is taxable
                  <CRACite id={1} /><CRACite id={6} />.
                </li>
                <li>
                  <strong>Referral fees received from another registered agent.</strong>{" "}
                  Fees paid to a real estate agent for a referral of business
                  are generally taxable supplies of a service<CRACite id={1} />.
                </li>
              </ul>

              <p>
                The practical effect: a registered agent charges GST/HST on
                substantially every commission cheque, whether the underlying
                property is residential, new-build, or commercial. The
                exempt-supply status of a used residential property does not
                flow through to the brokerage service<CRACite id={1} />
                <CRACite id={6} />.
              </p>

              {/* Cheat sheet inline CTA — at ~2/3 mark, after Section 5 */}
              <div className="not-prose my-8">
                <EmailCapture
                  heading="Get the Canadian Realtor Tax Cheat Sheet"
                  subheading="Every 2025 bracket, CPP rate, GST/HST threshold, and instalment due date on one printable page — CRA-cited. We'll email it to you."
                  ctaLabel="Email me the cheat sheet"
                  source="cheat_sheet_inline_real-estate-agent-hst-registration-canada"
                  variant="light"
                />
              </div>

              {/* ── Section 6 ── */}
              <h2 id="filing">
                Filing frequency and the GST34 return
              </h2>

              <p>
                CRA assigns each registrant a reporting period — annual,
                quarterly, or monthly — based on threshold revenue (taxable
                supplies plus zero-rated supplies, before expenses)
                <CRACite id={5} />. The published thresholds are
                <CRACite id={5} />:
              </p>

              <ul>
                <li>
                  <strong>Annual filing</strong> — assigned by default when
                  threshold revenue is <strong>$1,500,000 or less</strong>
                  <CRACite id={7} />.
                </li>
                <li>
                  <strong>Quarterly filing</strong> — assigned by default when
                  threshold revenue is{" "}
                  <strong>more than $1,500,000 up to $6,000,000</strong>
                  <CRACite id={7} />.
                </li>
                <li>
                  <strong>Monthly filing</strong> — required when threshold
                  revenue is <strong>more than $6,000,000</strong>
                  <CRACite id={7} />.
                </li>
              </ul>

              <p>
                Most self-employed real estate agents fall into the annual
                filing category. CRA permits a registrant to elect a more
                frequent reporting period than the assigned default — for
                example, a registrant with annual revenue of $400,000 may
                elect quarterly or monthly filing<CRACite id={5} />.
              </p>

              <h3>The GST34 return and due dates</h3>

              <p>
                The form used to file is the <strong>GST34</strong>, which
                CRA mails or makes available electronically based on the
                registrant&apos;s reporting period<CRACite id={5} />. Filing
                due dates depend on reporting period<CRACite id={5} />:
              </p>

              <ul>
                <li>
                  <strong>Annual filers (non-individual fiscal year-end)</strong>{" "}
                  — return and payment due 3 months after fiscal year-end
                  <CRACite id={5} />.
                </li>
                <li>
                  <strong>Annual filers (individual with December 31 year-end
                  who is self-employed)</strong> — return due{" "}
                  <strong>June 15</strong>; any net tax owing due{" "}
                  <strong>April 30</strong><CRACite id={5} />. The split
                  matches the T1 self-employed filing schedule.
                </li>
                <li>
                  <strong>Quarterly and monthly filers</strong> — return and
                  payment due one month after the end of the reporting period
                  <CRACite id={5} />.
                </li>
              </ul>

              <p>
                CRA also requires annual filers whose net tax for the previous
                year was $3,000 or more to make quarterly GST/HST instalment
                payments through the year, with the annual return reconciling
                the total<CRACite id={5} />. These instalments are separate
                from personal income-tax instalments described in the{" "}
                <Link
                  href="/real-estate-agent-tax-instalments-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  tax instalments article
                </Link>
                .
              </p>

              <p>
                Returns are filed electronically through CRA My Business
                Account, GST/HST NETFILE, or through certified third-party
                software<CRACite id={5} />.
              </p>

              {/* ── Section 7 ── */}
              <h2 id="tracking">
                Tracking through the year
              </h2>

              <p>
                The mechanical work of being GST/HST-registered breaks into
                three repeating activities through the year: collecting on
                invoices, tracking ITCs, and remitting on the assigned
                reporting period<CRACite id={1} /><CRACite id={4} />
                <CRACite id={5} />.
              </p>

              <p>
                On the collection side, GST/HST appears as a separate line on
                each commission invoice. Brokerages that handle the agent&apos;s
                commission documentation typically apply the registered
                agent&apos;s number on the trust-fund disbursement; agents
                who invoice independently include their own BN+RT0001 on each
                invoice<CRACite id={2} />.
              </p>

              <p>
                On the ITC side, the documentation requirements published by
                CRA — supplier name, supplier&apos;s GST/HST registration
                number, date, amount of tax, and description of the supply —
                are easier to satisfy when expense receipts are categorized
                as they are incurred rather than reconstructed at year-end
                <CRACite id={4} />.
              </p>

              <p>
                Agent Runway&apos;s expense module flags GST/HST paid on each
                categorized expense, separating the tax from the pre-tax
                amount. As the year progresses, the platform aggregates the
                GST/HST collected (from closed transactions) and the GST/HST
                paid (from categorized expenses), producing a running estimate
                of net tax owing on the next GST34 return — useful for
                approximating the figure that will appear on a quarterly
                instalment or annual filing.
              </p>

              <p>
                Other tax surfaces — quarterly income-tax instalments,
                deductible expense categorization on T2125, CPP contributions,
                and the choice between sole proprietor and PREC structures —
                are explored in the broader{" "}
                <Link
                  href="/real-estate-agent-tax-planning-canada"
                  className="font-semibold text-blue-600 underline underline-offset-2"
                >
                  Canadian real estate agent tax planning guide
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
              tax, or professional advice. GST/HST thresholds, provincial rates, and filing rules
              change over time, and individual circumstances vary. Always verify current rules with
              the CRA and consult a qualified accountant or tax professional before making any
              filing or registration decision. Agent Runway assumes no liability for tax filing
              outcomes.{" "}
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
              Track your GST/HST collected and paid as deals close.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway separates GST/HST from pre-tax amounts on every
              transaction and expense, aggregates the running net-tax figure,
              and produces an estimate of the amount that will appear on the
              next GST34 return. Built for Canadian real estate agents.
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
