import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Privacy Policy | Agent Runway",
  description:
    "How Agent Runway collects, uses, and protects your personal information under Canadian privacy law (PIPEDA).",
  alternates: {
    canonical: "https://agentrunway.ca/privacy",
  },
  robots: { index: false, follow: false },
};

const LAST_UPDATED = "March 14, 2026";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      <MarketingNav />

      <main className="flex-1 px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">

          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              Last updated: {LAST_UPDATED}
            </p>
            <p className="mt-5 text-base leading-relaxed text-slate-400">
              Agent Runway (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or
              &ldquo;our&rdquo;) is committed to protecting the privacy of our
              users. This policy explains what information we collect, how we
              use it, and what rights you have under Canada&apos;s{" "}
              <em>Personal Information Protection and Electronic Documents Act</em>{" "}
              (PIPEDA) and applicable provincial privacy laws.
            </p>
          </div>

          {/* Policy content */}
          <div className="space-y-10 text-slate-300">

            {/* 1 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                1. Who We Are
              </h2>
              <p className="leading-relaxed">
                Agent Runway is a software-as-a-service product operated by
                Andrew Shaw, based in New Brunswick, Canada. You can reach us
                at{" "}
                <a
                  href="mailto:privacy@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  privacy@agentrunway.ca
                </a>{" "}
                for all privacy-related inquiries.
              </p>
            </section>

            {/* 2 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                2. Information We Collect
              </h2>
              <p className="mb-4 leading-relaxed">
                We collect only the information necessary to provide the
                service:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Account information</strong>
                  {" "}— your email address and password (stored as a secure hash)
                  when you create an account.
                </li>
                <li>
                  <strong className="text-slate-300">Business data you enter</strong>
                  {" "}— transactions, GCI figures, commission splits, pipeline deals,
                  expenses, and goals that you provide when using the app. This
                  data belongs to you.
                </li>
                <li>
                  <strong className="text-slate-300">Profile settings</strong>
                  {" "}— your province, brokerage split percentage, annual income
                  goal, and other configuration preferences.
                </li>
                <li>
                  <strong className="text-slate-300">
                    Financial account and transaction data (Bank Sync, optional)
                  </strong>
                  {" "}— if you choose to connect a bank or financial institution
                  account using our bank sync feature, we receive from Plaid
                  Technologies, Inc. (&ldquo;Plaid&rdquo;) on your behalf: account
                  names, account numbers (last four digits only), and transaction
                  details (date, merchant name, amount). We do{" "}
                  <strong className="text-slate-300">not</strong> receive, transmit,
                  or store your online banking login credentials at any time &mdash;
                  those are entered directly with Plaid&apos;s secure interface and
                  never pass through Agent Runway&apos;s systems.
                </li>
                <li>
                  <strong className="text-slate-300">Usage data</strong>
                  {" "}— page views, feature usage, and interaction events collected
                  via analytics software to help us improve the product. This
                  data is aggregated and does not identify you individually.
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                We do not collect payment card numbers directly. Billing is
                processed by a third-party payment processor that handles
                card data in compliance with PCI-DSS.
              </p>
            </section>

            {/* 3 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                3. How We Use Your Information
              </h2>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>To create and manage your account</li>
                <li>To deliver the features of Agent Runway (dashboards, forecasts, reports)</li>
                <li>To process subscription payments and send billing confirmations</li>
                <li>To respond to support requests</li>
                <li>To improve and develop the product based on aggregated usage patterns</li>
                <li>To send important service notifications (security updates, policy changes)</li>
                <li>
                  To populate your expense records with imported bank transactions,
                  when you use the optional Bank Sync feature
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                We do not use your business data or bank transaction data to
                train AI models, build advertising profiles, or sell insights
                to third parties.
              </p>
            </section>

            {/* 4 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                4. Data Storage and Security
              </h2>
              <p className="leading-relaxed">
                Your data is stored using{" "}
                <strong className="text-slate-300">Supabase</strong>, a managed
                database platform hosted on Amazon Web Services in the{" "}
                <strong className="text-slate-300">
                  Canada (ca-central-1) region
                </strong>
                . Your data is stored in Canada. We use TLS 1.3 encryption for
                all data in transit and AES-256 encryption for data at rest. We
                implement row-level security (RLS) policies so your data is
                never accessible to other users. We maintain regular backups
                and monitor for unauthorized access.
              </p>
              <p className="mt-4 leading-relaxed">
                Plaid access tokens (which authorize Plaid to retrieve your bank
                data) are stored exclusively in our secured database and are
                never transmitted to or accessible from your browser or any
                client-side environment.
              </p>
              <p className="mt-4 leading-relaxed">
                <strong className="text-slate-300">Data breach notification:</strong>{" "}
                In the event of a data breach that creates a real risk of
                significant harm to any user, we will notify affected users and,
                where required, the Office of the Privacy Commissioner of Canada,
                as soon as feasible following discovery of the breach.
                Notifications will include the nature of the breach, what
                information was involved, the steps we have taken to address it,
                and recommendations for what you can do to protect yourself.
              </p>
            </section>

            {/* 5 — NEW: Plaid / Bank Account Connectivity */}
            <section className="rounded-xl border border-blue-800/40 bg-blue-950/30 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                5. Bank Account Connectivity (Plaid)
              </h2>
              <p className="mb-4 leading-relaxed text-blue-100/80">
                Agent Runway offers an optional bank sync feature that allows
                you to connect your bank or financial institution account to
                automatically import transactions for expense categorization.
                This feature is powered by{" "}
                <strong className="text-white">Plaid Technologies, Inc.</strong>{" "}
                (&ldquo;Plaid&rdquo;), a third-party financial data service.
                Use of this feature is entirely optional.
              </p>
              <p className="mb-3 font-semibold text-white">
                When you choose to connect a bank account:
              </p>
              <ul className="list-disc space-y-3 pl-6 text-blue-100/80">
                <li>
                  <strong className="text-white">No credentials stored by us.</strong>{" "}
                  Agent Runway passes you to Plaid&apos;s secure connection
                  interface (Plaid Link). Your banking username and password are
                  entered directly with Plaid and are{" "}
                  <strong className="text-white">never transmitted to or stored by Agent Runway</strong>.
                </li>
                <li>
                  <strong className="text-white">Minimal data scope.</strong>{" "}
                  Plaid retrieves your account and transaction data on our
                  behalf using only the access necessary to power the bank sync
                  feature. We do not request or receive identity documents,
                  income verification data, investment account data, asset
                  information, or any other data beyond what is needed for
                  expense categorization.
                </li>
                <li>
                  <strong className="text-white">Data security.</strong>{" "}
                  Transaction data retrieved through Plaid is stored in your
                  Agent Runway account and is subject to the same security
                  measures described in §4 above.
                </li>
                <li>
                  <strong className="text-white">Plaid&apos;s own privacy policy applies.</strong>{" "}
                  By connecting a bank account, you acknowledge that your use
                  of Plaid&apos;s services is also governed by Plaid&apos;s End
                  User Privacy Policy, available at:{" "}
                  <a
                    href="https://plaid.com/legal/#consumers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    plaid.com/legal/#consumers
                  </a>
                </li>
                <li>
                  <strong className="text-white">You can disconnect at any time.</strong>{" "}
                  You may disconnect your bank account from{" "}
                  <strong className="text-white">Settings &rarr; Bank Connections</strong>{" "}
                  at any time. When you disconnect, we will revoke Plaid&apos;s
                  access to your financial institution account and permanently
                  delete your Plaid access tokens from our systems. Transaction
                  data you have already approved and categorized in your expense
                  records will remain in your account until you delete your
                  account entirely.
                </li>
                <li>
                  <strong className="text-white">Your data is not sold.</strong>{" "}
                  We use bank transaction data solely to help you categorize
                  expenses within Agent Runway. We do not sell, share with
                  third parties for commercial purposes, use for advertising,
                  or use to train AI or machine-learning models.
                </li>
              </ul>
            </section>

            {/* 6 — NEW: Third-Party Market Data */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                6. Third-Party Market Data (CREA MLS® Statistics)
              </h2>
              <p className="leading-relaxed">
                Agent Runway displays local real estate market data sourced
                from{" "}
                <strong className="text-slate-300">
                  The Canadian Real Estate Association (CREA)
                </strong>{" "}
                MLS® Statistics portal. This market data (board average prices,
                SNLR, market conditions) is publicly available aggregate
                information — it is{" "}
                <strong className="text-slate-300">not</strong> personal
                information about you. No personal information is transmitted
                to CREA in connection with this feature.
              </p>
              <p className="mt-4 leading-relaxed">
                The trademarks MLS®, Multiple Listing Service® and the
                associated logos are owned by CREA. &copy;{" "}
                {new Date().getFullYear()} The Canadian Real Estate Association.
                All rights reserved.
              </p>
            </section>

            {/* 7 — was §6 (Sharing) */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                7. Sharing Your Information
              </h2>
              <p className="mb-4 leading-relaxed">
                We do not sell your personal information. We may share data
                with the following categories of service providers, strictly
                to operate the service:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Supabase</strong> —
                  database infrastructure (AWS ca-central-1, Canada)
                </li>
                <li>
                  <strong className="text-slate-300">Stripe, Inc.</strong> —
                  payment processing. Stripe is PCI DSS Level&nbsp;1 certified.
                  Agent Runway does not store or process payment card data;
                  all card information is handled solely by Stripe.
                </li>
                <li>
                  <strong className="text-slate-300">
                    Plaid Technologies, Inc.
                  </strong>{" "}
                  — bank account data retrieval (only when you use the
                  optional Bank Sync feature). Governed by{" "}
                  <a
                    href="https://plaid.com/legal/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Plaid&apos;s Privacy Policy
                  </a>
                  .
                </li>
                <li>Web analytics (aggregated, non-personal data only)</li>
                <li>Email delivery for transactional messages</li>
              </ul>
              <p className="mt-4 leading-relaxed">
                We may also disclose information if required by law, court
                order, or to protect the rights and safety of our users or
                the public.
              </p>
            </section>

            {/* 8 — was §7 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                8. Your Rights
              </h2>
              <p className="mb-4 leading-relaxed">
                As a Canadian resident, you have the following rights under
                PIPEDA. Residents of Quebec have additional rights under{" "}
                <em>Loi 25</em> (Quebec&apos;s{" "}
                <em>
                  Act respecting the protection of personal information in the
                  private sector
                </em>
                ), including the right to data portability and the right to
                object to certain automated decision-making.
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Access</strong> — request a
                  copy of the personal information we hold about you.
                </li>
                <li>
                  <strong className="text-slate-300">Correction</strong> — ask us
                  to correct inaccurate or incomplete information.
                </li>
                <li>
                  <strong className="text-slate-300">Withdrawal of consent</strong>
                  {" "}— withdraw your consent for non-essential uses of your data
                  at any time, including disconnecting your bank account.
                </li>
                <li>
                  <strong className="text-slate-300">Deletion</strong> — request
                  deletion of your account and associated data (including any
                  Plaid access tokens and imported bank data) by contacting us.
                </li>
                <li>
                  <strong className="text-slate-300">Portability (Quebec)</strong>
                  {" "}— Quebec residents may request that their personal information
                  be communicated to them or transferred to another organization
                  in a structured, commonly used technological format.
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                To exercise any of these rights, email{" "}
                <a
                  href="mailto:privacy@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  privacy@agentrunway.ca
                </a>
                . We will respond within 30 days.
              </p>
            </section>

            {/* 9 — was §8 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                9. Data Retention
              </h2>
              <p className="leading-relaxed">
                We retain your account data for as long as your account is
                active. If you delete your account, we will remove your
                personal information and business data within 30 days, except
                where retention is required by law (e.g., billing records
                retained for 7 years per Canadian tax requirements).
              </p>
              <p className="mt-4 leading-relaxed">
                If you disconnect a bank account via{" "}
                <strong className="text-white">Settings &rarr; Bank Connections</strong>,
                your Plaid access tokens are permanently deleted from our
                systems immediately upon disconnection, and Plaid&apos;s access
                to your financial institution is simultaneously revoked.
                Transaction data already imported and categorized in your
                expense records is retained as part of your account until you
                delete your account.
              </p>
            </section>

            {/* 10 — was §9 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                10. Cookies and Tracking
              </h2>
              <p className="leading-relaxed">
                Agent Runway uses essential cookies for authentication (session
                management). We also use third-party analytics software to
                measure aggregate page views and feature usage. You may
                configure your browser to refuse cookies, though some features
                of the app require session cookies to function.
              </p>
            </section>

            {/* 11 — was §10 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                11. Changes to This Policy
              </h2>
              <p className="leading-relaxed">
                We may update this privacy policy from time to time. Material
                changes will be communicated via email or an in-app
                notification. Continued use of Agent Runway after the effective
                date of a change constitutes acceptance of the revised policy.
              </p>
            </section>

            {/* 12 — was §11 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                12. Contact Us
              </h2>
              <p className="leading-relaxed">
                For questions about this policy or to exercise your privacy
                rights, contact:
              </p>
              <address className="mt-4 not-italic text-slate-400">
                <strong className="text-slate-300">Agent Runway</strong>
                <br />
                Andrew Shaw
                <br />
                New Brunswick, Canada
                <br />
                <a
                  href="mailto:privacy@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  privacy@agentrunway.ca
                </a>
              </address>
              <p className="mt-4 leading-relaxed text-slate-500 text-sm">
                You may also contact the{" "}
                <a
                  href="https://www.priv.gc.ca"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  Office of the Privacy Commissioner of Canada
                </a>{" "}
                if you believe your privacy rights have been violated. Quebec
                residents may contact the{" "}
                <a
                  href="https://www.cai.gouv.qc.ca/en/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  Commission d&apos;acc&egrave;s &agrave; l&apos;information (CAI)
                </a>
                .
              </p>
            </section>

          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
