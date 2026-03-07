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

const LAST_UPDATED = "March 7, 2026";

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
                  href="mailto:support@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  support@agentrunway.ca
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
                5. Not Financial or Tax Advice
              </h2>
              <p className="leading-relaxed text-amber-200/80">
                Agent Runway provides analytics, forecasting, and reporting
                tools for informational and organizational purposes only.{" "}
                <strong className="text-amber-300">
                  Nothing in Agent Runway constitutes financial advice, tax
                  advice, investment advice, or professional accounting services.
                </strong>{" "}
                Tax estimates, income projections, and financial calculations
                displayed in the app are approximations based on the data you
                enter and publicly available rate information. They may not
                reflect your actual tax obligations or financial situation.
                Always consult a qualified accountant, financial advisor, or
                tax professional before making financial decisions.
              </p>
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
                7. Your Data
              </h2>
              <p className="leading-relaxed">
                You retain ownership of all business data you enter into Agent
                Runway. We do not claim any intellectual property rights over
                your transactions, deals, expenses, or other content. You grant
                us a limited license to store, process, and display your data
                for the purpose of providing the service.
              </p>
            </section>

            {/* 8 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                8. Intellectual Property
              </h2>
              <p className="leading-relaxed">
                The Agent Runway software, design, logos, and all original
                content are owned by Andrew Shaw and protected by Canadian and
                international intellectual property law. These Terms do not
                grant you any rights to our intellectual property beyond the
                limited right to use the service as described here.
              </p>
            </section>

            {/* 9 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                9. Limitation of Liability
              </h2>
              <p className="leading-relaxed">
                To the maximum extent permitted by law, Agent Runway and its
                operator shall not be liable for any indirect, incidental,
                special, consequential, or punitive damages arising from your
                use of the service — including but not limited to financial
                losses, data loss, or business interruption. Our total
                aggregate liability to you shall not exceed the amount you paid
                us in the three months preceding the claim. The service is
                provided &ldquo;as is&rdquo; without any warranty of accuracy,
                completeness, or fitness for a particular purpose.
              </p>
            </section>

            {/* 10 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                10. Termination
              </h2>
              <p className="leading-relaxed">
                You may terminate your account at any time by deleting it from
                your account settings. We reserve the right to suspend or
                terminate accounts that violate these Terms, with or without
                notice. Upon termination, your right to use the service ceases
                immediately.
              </p>
            </section>

            {/* 11 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                11. Governing Law
              </h2>
              <p className="leading-relaxed">
                These Terms are governed by the laws of the Province of New
                Brunswick and the federal laws of Canada applicable therein.
                Any disputes shall be resolved in the courts of New Brunswick,
                Canada.
              </p>
            </section>

            {/* 12 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                12. Contact
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
                  href="mailto:support@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  support@agentrunway.ca
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
