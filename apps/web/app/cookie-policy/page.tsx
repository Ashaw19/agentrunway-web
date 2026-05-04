import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "How Agent Runway uses cookies and similar technologies, and how you can manage your preferences.",
  robots: { index: false, follow: false },
};

const LAST_UPDATED = "April 25, 2026";

/* -------------------------------------------------------------------------- */

export default function CookiePolicyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <MarketingNav />

      <main className="flex-1 px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Cookie Policy
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              Last updated: {LAST_UPDATED}
            </p>
            <p className="mt-5 text-base leading-relaxed text-slate-400">
              This Cookie Policy explains what cookies are, which cookies Agent
              Runway uses, why we use them, and how you can manage your
              preferences. It should be read alongside our{" "}
              <a href="/privacy" className="text-blue-400 underline hover:text-blue-300">
                Privacy Policy
              </a>
              . Capitalized terms not defined here have the meanings given in
              the{" "}
              <a href="/terms" className="text-blue-400 underline hover:text-blue-300">
                Terms of Service
              </a>
              .
            </p>
          </div>

          {/* Policy content */}
          <div className="space-y-10 text-slate-300">

            {/* ─── 1 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                1. What Cookies Are
              </h2>
              <p className="leading-relaxed">
                Cookies are small text files that a website places on your
                device when you visit. They allow the site to remember
                information about your visit &mdash; such as whether you are
                logged in &mdash; so that the site works correctly and you do
                not have to re-enter information every time you return.
              </p>
              <p className="mt-3 leading-relaxed">
                Agent Runway also uses <strong className="text-slate-200">localStorage</strong>,
                a browser storage mechanism that works similarly to cookies but
                stores data locally on your device without sending it to a
                server on every request. We use localStorage for your cookie
                consent preference.
              </p>
            </section>

            {/* ─── 2 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                2. Cookies We Use
              </h2>
              <p className="mb-6 leading-relaxed">
                We keep our cookie usage minimal and purposeful. The table
                below describes every cookie or storage entry Agent Runway sets.
              </p>

              {/* Essential cookies sub-section */}
              <div className="mb-8">
                <h3 className="mb-3 text-base font-semibold text-slate-200">
                  2.1 Essential / Strictly Necessary Cookies
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-slate-400">
                  These cookies are required for the Service to function. They
                  cannot be disabled without breaking authentication and core
                  security features. No consent is required for these cookies
                  because they are strictly necessary.
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60">
                        <th className="px-4 py-3 text-left font-semibold text-slate-200">
                          Name / Key
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-200">
                          Purpose
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-200">
                          Duration
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-200">
                          Type
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-400">
                      <tr>
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">
                          sb-[ref]-auth-token
                        </td>
                        <td className="px-4 py-3">
                          Authentication session token. Keeps you logged in to
                          the Service.
                        </td>
                        <td className="px-4 py-3">Session / rolling</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-300">
                            Required
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">
                          CSRF token
                        </td>
                        <td className="px-4 py-3">
                          Cross-site request forgery protection. Validates that
                          form submissions and API requests originate from the
                          Agent Runway application.
                        </td>
                        <td className="px-4 py-3">Session</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-300">
                            Required
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">
                          ar-cookie-consent
                          <span className="ml-1 text-slate-500">(localStorage)</span>
                        </td>
                        <td className="px-4 py-3">
                          Stores your cookie consent preference (&ldquo;accepted&rdquo; or
                          &ldquo;declined&rdquo;) so the cookie banner is not shown on
                          every page load.
                        </td>
                        <td className="px-4 py-3">1 year</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-xs font-medium text-slate-300">
                            Functional
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Analytics cookies sub-section */}
              <div className="mb-6">
                <h3 className="mb-3 text-base font-semibold text-slate-200">
                  2.2 Analytics Cookies (Optional)
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-slate-400">
                  These cookies are only set if you click &ldquo;Accept&rdquo; on the
                  cookie consent banner. They help us understand how users
                  navigate the product so we can improve it.
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60">
                        <th className="px-4 py-3 text-left font-semibold text-slate-200">
                          Data Collected
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-200">
                          Purpose
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-200">
                          Duration
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-200">
                          Provider
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-400">
                      <tr>
                        <td className="px-4 py-3">
                          Aggregate page view tracking
                        </td>
                        <td className="px-4 py-3">
                          Product improvement — understand which pages and
                          features are used most frequently.
                        </td>
                        <td className="px-4 py-3">Session + up to 2 years</td>
                        <td className="px-4 py-3">Analytics software</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3">
                          Feature usage analytics
                        </td>
                        <td className="px-4 py-3">
                          Understand which features are used, ignored, or
                          causing friction — informs development priorities.
                        </td>
                        <td className="px-4 py-3">Session + up to 2 years</td>
                        <td className="px-4 py-3">Analytics software</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3">
                          Navigation flow data
                        </td>
                        <td className="px-4 py-3">
                          Aggregate user journeys through the app — used to
                          improve onboarding and feature discoverability.
                        </td>
                        <td className="px-4 py-3">Session + up to 2 years</td>
                        <td className="px-4 py-3">Analytics software</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-400">
                  Analytics data is aggregated and does not contain your name,
                  email address, financial figures, or any business-specific
                  information you enter into the Service.
                </p>
              </div>

              {/* No advertising note */}
              <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-4">
                <p className="text-sm leading-relaxed text-slate-400">
                  <strong className="text-slate-200">What we do not use:</strong>{" "}
                  Agent Runway does not use advertising cookies, retargeting
                  pixels, cross-site tracking cookies, or any cookies from
                  social media platforms or advertising networks.
                </p>
              </div>
            </section>

            {/* ─── 3 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                3. How We Obtain Consent
              </h2>
              <ul className="space-y-3 leading-relaxed text-slate-400">
                <li className="flex gap-3">
                  <span className="mt-1 shrink-0 text-slate-500">&bull;</span>
                  <span>
                    On your first visit, a cookie consent banner appears at the
                    bottom of the screen. You may click{" "}
                    <strong className="text-slate-300">Accept</strong> to enable
                    optional analytics cookies, or{" "}
                    <strong className="text-slate-300">Decline</strong> to use
                    only essential cookies.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 shrink-0 text-slate-500">&bull;</span>
                  <span>
                    <strong className="text-slate-300">Essential cookies are always active</strong>{" "}
                    regardless of your choice, as they are strictly necessary to
                    provide the Service. No consent is required for these under
                    applicable law.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 shrink-0 text-slate-500">&bull;</span>
                  <span>
                    <strong className="text-slate-300">Quebec residents:</strong>{" "}
                    In accordance with Quebec&apos;s Law 25 and its associated
                    regulations, we implement opt-in (affirmative) consent for
                    all non-essential cookies for users located in Quebec. We do
                    not use opt-out or implied consent mechanisms.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 shrink-0 text-slate-500">&bull;</span>
                  <span>
                    Your preference is saved in your browser&apos;s localStorage
                    under the key{" "}
                    <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-xs text-slate-300">
                      ar-cookie-consent
                    </code>{" "}
                    and persists for one year. You can change your preference at
                    any time by clearing that localStorage entry (see Section 4
                    below).
                  </span>
                </li>
              </ul>
            </section>

            {/* ─── 4 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                4. How to Manage Cookies
              </h2>
              <p className="mb-4 leading-relaxed">
                You have several options for managing cookies and storage:
              </p>

              <div className="space-y-5">
                <div>
                  <h3 className="mb-2 text-base font-semibold text-slate-200">
                    Browser cookie settings
                  </h3>
                  <p className="leading-relaxed text-slate-400">
                    You can configure your browser to block, delete, or alert
                    you about cookies. Instructions for the most common browsers
                    are available at{" "}
                    <a
                      href="https://www.aboutcookies.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 underline hover:text-blue-300"
                    >
                      aboutcookies.org
                    </a>
                    . Note that blocking cookies entirely may affect how the
                    Service functions.
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 text-base font-semibold text-slate-200">
                    Clearing your consent preference (localStorage)
                  </h3>
                  <p className="leading-relaxed text-slate-400">
                    To reset your cookie consent choice, open your browser&apos;s
                    developer tools (F12 &rarr; Application &rarr; Local
                    Storage &rarr; agentrunway.ca) and delete the entry with key{" "}
                    <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-xs text-slate-300">
                      ar-cookie-consent
                    </code>
                    . The banner will reappear on your next visit and you can
                    make a new selection.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-4">
                  <p className="text-sm leading-relaxed text-slate-400">
                    <strong className="text-slate-200">Important:</strong>{" "}
                    Disabling or blocking essential cookies (authentication
                    session and CSRF tokens) will prevent you from logging in
                    and using the Service. Essential cookies cannot be made
                    optional.
                  </p>
                </div>
              </div>
            </section>

            {/* ─── 5 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                5. Third-Party Cookies
              </h2>
              <p className="mb-3 leading-relaxed">
                Agent Runway does not currently use cookies from advertising
                networks, social media platforms, or other third-party tracking
                services.
              </p>
            </section>

            {/* ─── 6 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                6. Changes to This Policy
              </h2>
              <p className="leading-relaxed">
                We may update this Cookie Policy from time to time to reflect
                changes in the cookies we use, changes in the law, or changes
                in our practices. For material changes, we will provide at
                least 30 days&apos; notice by posting the updated policy on this
                page and, where appropriate, by notifying you via email or an
                in-app notice. The &ldquo;Last updated&rdquo; date at the top of this
                page indicates when the most recent revision was made.
              </p>
            </section>

            {/* ─── 7 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                7. Contact
              </h2>
              <p className="leading-relaxed">
                If you have questions about this Cookie Policy or about how we
                handle your data, please contact us at{" "}
                <a
                  href="mailto:privacy@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  privacy@agentrunway.ca
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
