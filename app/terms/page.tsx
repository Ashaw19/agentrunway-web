import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Terms of Service | Agent Runway",
  description:
    "Terms governing your use of Agent Runway, business analytics software for real estate agents.",
  alternates: {
    canonical: "https://agentrunway.ca/terms",
  },
  robots: { index: false, follow: false },
};

const LAST_UPDATED = "March 8, 2026";

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      <MarketingNav />

      <main className="flex-1 px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">

          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Terms of Service
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              Last updated: {LAST_UPDATED}
            </p>
            <p className="mt-5 text-base leading-relaxed text-slate-400">
              Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully
              before using Agent Runway. By creating an account or using the
              service, you agree to be bound by these Terms.
            </p>
          </div>

          {/* Terms content */}
          <div className="space-y-10 text-slate-300">

            {/* 1 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                1. Acceptance of Terms
              </h2>
              <p className="leading-relaxed">
                These Terms form a binding agreement between you and Agent
                Runway (operated by Andrew Shaw, New Brunswick, Canada). If you
                do not agree to these Terms, do not use the service. We may
                update these Terms at any time; continued use after changes
                take effect constitutes acceptance.
              </p>
            </section>

            {/* 2 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                2. Description of Service
              </h2>
              <p className="leading-relaxed">
                Agent Runway is a business analytics platform for Canadian real
                estate agents. It enables users to track gross commission
                income (GCI), log transactions, manage pipeline deals, track
                expenses, generate income forecasts, and view business
                performance reports. The service is provided via a web
                application accessible at agentrunway.ca.
              </p>
            </section>

            {/* 3 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                3. Accounts
              </h2>
              <p className="leading-relaxed">
                You must provide accurate information when creating your
                account. You are responsible for maintaining the security of
                your login credentials and for all activity that occurs under
                your account. Notify us immediately at{" "}
                <a
                  href="mailto:hello@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  hello@agentrunway.ca
                </a>{" "}
                if you suspect unauthorized access.
              </p>
            </section>

            {/* 4 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                4. Subscription Plans and Billing
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway offers a free Starter plan and a paid Professional
                plan. Paid subscriptions are billed monthly. By subscribing,
                you authorize us to charge your payment method on a recurring
                basis.
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  You may cancel your subscription at any time from your
                  account settings. Access continues through the end of the
                  current billing period; no partial refunds are issued.
                </li>
                <li>
                  We reserve the right to change pricing with 30 days&apos;
                  notice to active subscribers.
                </li>
                <li>
                  All prices are in Canadian dollars (CAD) unless stated
                  otherwise.
                </li>
              </ul>
            </section>

            {/* 5 — CRITICAL DISCLAIMER */}
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
              <h2 className="mb-4 text-xl font-semibold text-amber-400">
                5. Not Financial, Tax, or Professional Advice
              </h2>
              <div className="space-y-4 text-amber-200/80 leading-relaxed">
                <p>
                  <strong className="text-amber-300">
                    Agent Runway is a self-management tool for informational
                    and organisational purposes only. Nothing in Agent Runway
                    — including but not limited to tax estimates, income
                    projections, forecasts, runway scores, advisor cards,
                    AI-generated content, or any other output — constitutes
                    financial advice, tax advice, investment advice, legal
                    advice, or professional accounting services of any kind.
                  </strong>
                </p>
                <p>
                  All calculations, projections, and estimates displayed in
                  the app are approximations based solely on the data you
                  enter and publicly available rate information. They are
                  subject to error and may not reflect your actual tax
                  obligations, income, or financial situation. Agent Runway
                  does not verify, audit, certify, or independently confirm
                  any data you provide, and we make no representations as to
                  the accuracy, completeness, or fitness of any output for
                  any purpose.
                </p>
                <p>
                  <strong className="text-amber-300">
                    Do not use Agent Runway outputs — including tax estimates,
                    income projections, GCI figures, net income calculations,
                    or AI-generated recommendations — for any of the
                    following purposes:
                  </strong>
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>Filing a tax return or making representations to the Canada Revenue Agency (CRA)</li>
                  <li>Applying for a mortgage, loan, line of credit, or any other form of financing</li>
                  <li>Making investment or business decisions of material financial consequence</li>
                  <li>Providing evidence of income to any third party</li>
                  <li>Any other official, legal, or binding purpose</li>
                </ul>
                <p>
                  AI-generated advisor cards, chat responses, and insights are
                  produced by automated systems and may be inaccurate,
                  incomplete, or inapplicable to your specific situation.
                  These outputs do not reflect the judgment of a qualified
                  professional and must not be relied upon as such.
                </p>
                <p>
                  <strong className="text-amber-300">
                    Always consult a qualified accountant, tax professional,
                    financial advisor, or legal professional before making any
                    financial decision.
                  </strong>
                </p>
              </div>
            </section>

            {/* 6 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                6. Acceptable Use
              </h2>
              <p className="mb-4 leading-relaxed">
                You agree not to:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>Use the service for any unlawful purpose</li>
                <li>
                  Attempt to gain unauthorized access to any part of the
                  service or another user&apos;s account
                </li>
                <li>
                  Reverse engineer, decompile, or attempt to extract the source
                  code of the service
                </li>
                <li>
                  Use automated tools to scrape, crawl, or extract data from
                  the service
                </li>
                <li>
                  Resell, sublicense, or redistribute access to the service
                  without our written consent
                </li>
              </ul>
            </section>

            {/* 7 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                7. Your Data and Data Accuracy
              </h2>
              <p className="mb-4 leading-relaxed">
                You retain ownership of all business data you enter into Agent
                Runway. We do not claim any intellectual property rights over
                your transactions, deals, expenses, or other content. You grant
                us a limited licence to store, process, and display your data
                for the purpose of providing the service.
              </p>
              <p className="leading-relaxed">
                <strong className="text-white">
                  You are solely responsible for the accuracy and completeness
                  of the data you enter into Agent Runway.
                </strong>{" "}
                All calculations, projections, and outputs produced by the
                service are derived from the data you provide. Agent Runway
                does not verify, audit, or validate your inputs. Errors,
                omissions, or inaccuracies in the data you enter will result
                in corresponding errors in the outputs the service produces.
                You bear all responsibility for ensuring that data you enter
                is accurate and for verifying all outputs against your own
                records and with qualified professionals.
              </p>
            </section>

            {/* 8 — Forward-looking statements */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                8. Forward-Looking Statements and Projection Disclaimer
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway produces income projections, forecasts, probability
                bands, and other forward-looking estimates. These are
                illustrative scenarios based on mathematical models and
                historical patterns and are{" "}
                <strong className="text-white">
                  not predictions, guarantees, or commitments of any kind.
                </strong>
              </p>
              <p className="leading-relaxed">
                Actual results will differ from projections due to factors
                including but not limited to market conditions, deal timing,
                interest rate changes, regulatory changes, personal
                circumstances, and other variables outside the model.
                Historical performance reflected in Agent Runway does not
                guarantee or imply future results. You expressly acknowledge
                that you will not represent any projection or forecast
                produced by Agent Runway as a reliable indicator of actual
                future income to any third party.
              </p>
            </section>

            {/* 9 — Tax calculation disclaimer */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                9. Tax Calculation Disclaimer
              </h2>
              <p className="mb-4 leading-relaxed">
                Tax estimates in Agent Runway are approximations calculated
                using publicly available federal and provincial tax brackets,
                CPP/QPP contribution rates, and basic self-employment
                assumptions. They do not account for:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>Deductions you may be entitled to claim</li>
                <li>Tax credits, carry-forwards, or loss carry-backs</li>
                <li>Prior-year tax balances or instalments</li>
                <li>Corporation or partnership structures</li>
                <li>GST/HST obligations</li>
                <li>Changes to tax law enacted after the rates were last updated in the app</li>
                <li>Any other factors specific to your individual tax situation</li>
              </ul>
              <p className="mt-4 leading-relaxed">
                <strong className="text-white">
                  Your actual CRA tax obligation will differ from any estimate
                  displayed in Agent Runway.
                </strong>{" "}
                Agent Runway assumes no liability for taxes owing, penalties,
                interest, or any other consequence arising from reliance on
                tax estimates produced by the service. Always consult a
                qualified accountant or tax professional for your actual tax
                filings.
              </p>
            </section>

            {/* 10 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                10. Intellectual Property
              </h2>
              <p className="leading-relaxed">
                The Agent Runway software, design, logos, and all original
                content are owned by Andrew Shaw and protected by Canadian and
                international intellectual property law. These Terms do not
                grant you any rights to our intellectual property beyond the
                limited right to use the service as described here.
              </p>
            </section>

            {/* 11 — Limitation of Liability */}
            <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                11. Disclaimer of Warranties and Limitation of Liability
              </h2>
              <div className="space-y-4 leading-relaxed">
                <p>
                  <strong className="text-white">
                    THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
                    AVAILABLE&rdquo; WITHOUT ANY WARRANTY OF ANY KIND, EXPRESS
                    OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
                    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY,
                    COMPLETENESS, OR NON-INFRINGEMENT.
                  </strong>
                </p>
                <p>
                  Agent Runway does not warrant that: (a) the service will be
                  uninterrupted or error-free; (b) any calculation, projection,
                  estimate, or output is accurate, current, or complete; (c)
                  tax rates or other reference data used in calculations are
                  up to date; or (d) the service is suitable for any
                  particular purpose.
                </p>
                <p>
                  To the maximum extent permitted by applicable law, Agent
                  Runway and its operator shall not be liable for any indirect,
                  incidental, special, consequential, punitive, or exemplary
                  damages arising from your use of or inability to use the
                  service — including but not limited to financial losses,
                  tax underpayments, penalties, missed business opportunities,
                  data loss, or business interruption — even if we have been
                  advised of the possibility of such damages.
                </p>
                <p>
                  Our total aggregate liability to you shall not exceed the
                  greater of (a) the amount you paid us in the three months
                  preceding the claim, or (b) CAD $50.00.
                </p>
              </div>
            </section>

            {/* 12 — Indemnification */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                12. Indemnification
              </h2>
              <p className="leading-relaxed">
                You agree to indemnify, defend, and hold harmless Agent Runway
                and its operator, Andrew Shaw, from and against any and all
                claims, liabilities, damages, losses, costs, and expenses
                (including reasonable legal fees) arising out of or relating
                to: (a) your use of or reliance on the service; (b) your
                violation of these Terms; (c) any data you submit to the
                service; or (d) any decision you make based on outputs
                produced by the service, including but not limited to tax
                estimates, income projections, and AI-generated content.
              </p>
            </section>

            {/* 13 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                13. Termination
              </h2>
              <p className="leading-relaxed">
                You may terminate your account at any time by deleting it from
                your account settings. We reserve the right to suspend or
                terminate accounts that violate these Terms, with or without
                notice. Upon termination, your right to use the service ceases
                immediately.
              </p>
            </section>

            {/* 14 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                14. Governing Law
              </h2>
              <p className="leading-relaxed">
                These Terms are governed by the laws of the Province of New
                Brunswick and the federal laws of Canada applicable therein.
                Any disputes shall be resolved in the courts of New Brunswick,
                Canada. You hereby irrevocably consent to the exclusive
                jurisdiction of those courts for any dispute arising under or
                in connection with these Terms.
              </p>
            </section>

            {/* 15 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                15. Contact
              </h2>
              <p className="leading-relaxed">
                Questions about these Terms may be directed to:
              </p>
              <address className="mt-4 not-italic text-slate-400">
                <strong className="text-slate-300">Agent Runway</strong>
                <br />
                Andrew Shaw
                <br />
                New Brunswick, Canada
                <br />
                <a
                  href="mailto:hello@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  hello@agentrunway.ca
                </a>
              </address>
            </section>

          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
