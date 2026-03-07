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

const LAST_UPDATED = "March 7, 2026";

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
              (PIPEDA).
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
              </ul>
              <p className="mt-4 leading-relaxed">
                We do not use your business data to train AI models or sell
                insights to third parties.
              </p>
            </section>

            {/* 4 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                4. Data Storage and Security
              </h2>
              <p className="leading-relaxed">
                Your data is stored using Supabase, a managed database platform.
                Data may be stored on servers located in the United States. By
                using Agent Runway, you consent to this cross-border transfer.
                We use TLS encryption for all data in transit and implement
                row-level security (RLS) policies so your data is never
                accessible to other users. We maintain regular backups and
                monitor for unauthorized access.
              </p>
            </section>

            {/* 5 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                5. Sharing Your Information
              </h2>
              <p className="mb-4 leading-relaxed">
                We do not sell your personal information. We may share data
                with the following categories of service providers, strictly
                to operate the service:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>Database infrastructure (Supabase)</li>
                <li>Payment processing (Stripe or equivalent)</li>
                <li>Web analytics (aggregated, non-personal data only)</li>
                <li>Email delivery for transactional messages</li>
              </ul>
              <p className="mt-4 leading-relaxed">
                We may also disclose information if required by law or to
                protect the rights and safety of our users.
              </p>
            </section>

            {/* 6 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                6. Your Rights Under PIPEDA
              </h2>
              <p className="mb-4 leading-relaxed">
                As a Canadian resident, you have the right to:
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
                  at any time.
                </li>
                <li>
                  <strong className="text-slate-300">Deletion</strong> — request
                  deletion of your account and associated data by contacting us.
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

            {/* 7 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                7. Data Retention
              </h2>
              <p className="leading-relaxed">
                We retain your account data for as long as your account is
                active. If you delete your account, we will remove your
                personal information and business data within 30 days, except
                where retention is required by law (e.g., billing records
                retained for 7 years per Canadian tax requirements).
              </p>
            </section>

            {/* 8 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                8. Cookies and Tracking
              </h2>
              <p className="leading-relaxed">
                Agent Runway uses essential cookies for authentication (session
                management). We also use third-party analytics software to
                measure aggregate page views and feature usage. You may
                configure your browser to refuse cookies, though some features
                of the app require session cookies to function.
              </p>
            </section>

            {/* 9 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                9. Changes to This Policy
              </h2>
              <p className="leading-relaxed">
                We may update this privacy policy from time to time. Material
                changes will be communicated via email or an in-app
                notification. Continued use of Agent Runway after the effective
                date of a change constitutes acceptance of the revised policy.
              </p>
            </section>

            {/* 10 */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                10. Contact Us
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
            </section>

          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
