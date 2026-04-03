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

const LAST_UPDATED = "April 3, 2026";
const EFFECTIVE_DATE = "April 3, 2026";

/* ──────────────────────────────────────────────────────────────────────────── */

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
              Last updated: {LAST_UPDATED} &middot; Effective: {EFFECTIVE_DATE}
            </p>
            <p className="mt-5 text-base leading-relaxed text-slate-400">
              Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully
              before using Agent Runway. By creating an account, accessing, or
              using the service in any way, you acknowledge that you have read,
              understood, and agree to be bound by these Terms and all
              policies incorporated herein by reference, including our{" "}
              <a href="/privacy" className="text-blue-400 hover:text-blue-300 underline">
                Privacy Policy
              </a>{" "}
              and{" "}
              <a href="/acceptable-use" className="text-blue-400 hover:text-blue-300 underline">
                Acceptable Use Policy
              </a>
              . If you do not agree, do not use the service.
            </p>
          </div>

          {/* Terms content */}
          <div className="space-y-10 text-slate-300">

            {/* ────────────────────────────── 1 ────────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                1. Definitions
              </h2>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  <strong className="text-slate-300">&ldquo;Agent Runway&rdquo;</strong>,{" "}
                  <strong className="text-slate-300">&ldquo;we&rdquo;</strong>,{" "}
                  <strong className="text-slate-300">&ldquo;us&rdquo;</strong>, or{" "}
                  <strong className="text-slate-300">&ldquo;our&rdquo;</strong>{" "}
                  means the software-as-a-service product operated by Andrew Shaw,
                  a sole proprietorship based in New Brunswick, Canada.
                </li>
                <li>
                  <strong className="text-slate-300">&ldquo;Service&rdquo;</strong>{" "}
                  means the Agent Runway web application at agentrunway.ca, its
                  mobile-optimized web experience, all associated APIs, and any
                  related documentation, updates, and support services.
                </li>
                <li>
                  <strong className="text-slate-300">&ldquo;You&rdquo;</strong>,{" "}
                  <strong className="text-slate-300">&ldquo;User&rdquo;</strong>, or{" "}
                  <strong className="text-slate-300">&ldquo;Customer&rdquo;</strong>{" "}
                  means the individual or entity that creates an account and uses
                  the Service.
                </li>
                <li>
                  <strong className="text-slate-300">&ldquo;Customer Data&rdquo;</strong>{" "}
                  means all data, content, and information that you upload, enter,
                  import, or otherwise provide to the Service, including but not
                  limited to transactions, pipeline deals, client records, expenses,
                  goals, and notes.
                </li>
                <li>
                  <strong className="text-slate-300">&ldquo;AI Features&rdquo;</strong>{" "}
                  means any feature of the Service that uses artificial intelligence,
                  machine learning, or large language models to generate content,
                  recommendations, insights, outreach drafts, insight cards, chat
                  responses, or other automated outputs.
                </li>
                <li>
                  <strong className="text-slate-300">&ldquo;Team Account&rdquo;</strong>{" "}
                  means an account under our Teams plan where a Team Leader invites
                  and manages one or more Team Members.
                </li>
                <li>
                  <strong className="text-slate-300">&ldquo;Team Leader&rdquo;</strong>{" "}
                  means the User who creates and administers a Team Account.
                </li>
                <li>
                  <strong className="text-slate-300">&ldquo;Team Member&rdquo;</strong>{" "}
                  means a User who has been invited to and accepted membership in a
                  Team Account.
                </li>
              </ul>
            </section>

            {/* ────────────────────────────── 2 ────────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                2. Acceptance of Terms
              </h2>
              <p className="leading-relaxed">
                These Terms form a binding legal agreement between you and Agent
                Runway. By creating an account, accessing the Service, clicking
                &ldquo;I agree,&rdquo; or using the Service in any manner, you
                represent that you are at least 18 years of age and have the
                legal capacity to enter into this agreement. If you are accepting
                these Terms on behalf of a business, brokerage, team, or other
                legal entity, you represent and warrant that you have the authority
                to bind that entity to these Terms. We may update these Terms at
                any time in accordance with Section&nbsp;28; continued use after
                changes take effect constitutes acceptance.
              </p>
            </section>

            {/* ────────────────────────────── 3 ────────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                3. Description of Service
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway is a business analytics and client relationship
                management platform designed for Canadian real estate
                professionals. The Service enables Users to:
              </p>
              <ul className="list-disc space-y-1.5 pl-6 text-slate-400">
                <li>Track gross commission income (GCI), transactions, and pipeline deals</li>
                <li>Manage client relationships with flight-status-based CRM workflows</li>
                <li>Log and categorize business expenses (manually or via optional bank sync)</li>
                <li>Generate income forecasts and tax estimates</li>
                <li>Receive AI-generated business insights, outreach drafts, and suggested actions</li>
                <li>View performance analytics including the Runway Score</li>
                <li>Scan and digitize receipts using device cameras</li>
                <li>Connect to third-party services including banking (via Plaid), payments (via Stripe), and Google Workspace (Gmail, Calendar, Drive)</li>
              </ul>
              <p className="mt-4 leading-relaxed">
                The Service is provided via the web application at agentrunway.ca
                and is optimized for use on mobile devices through your browser.
                We reserve the right to modify, suspend, add, or
                discontinue any feature of the Service at any time, with or
                without notice.
              </p>
            </section>

            {/* ────────────────────────────── 4 ────────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                4. Eligibility
              </h2>
              <p className="leading-relaxed">
                The Service is intended for use by licensed real estate
                professionals, brokerages, and teams operating in Canada. By
                using the Service, you represent that you are at least 18 years
                of age and are legally capable of forming a binding contract. The
                Service is not intended for use by consumers, minors, or
                individuals under the age of 18. We reserve the right to refuse
                service, terminate accounts, or cancel subscriptions at our sole
                discretion if we believe you do not meet these eligibility
                requirements.
              </p>
            </section>

            {/* ────────────────────────────── 5 ────────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                5. Account Registration and Security
              </h2>
              <p className="mb-4 leading-relaxed">
                You must provide accurate, current, and complete information when
                creating your account and promptly update such information if it
                changes. You are solely responsible for:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>Maintaining the confidentiality and security of your login credentials</li>
                <li>All activity that occurs under your account, whether or not you authorized it</li>
                <li>Immediately notifying us at{" "}
                  <a href="mailto:hello@agentrunway.ca" className="text-blue-400 hover:text-blue-300">
                    hello@agentrunway.ca
                  </a>{" "}
                  if you suspect any unauthorized access to or use of your account
                </li>
                <li>Not sharing your login credentials with any other person or allowing any other person to access the Service using your account</li>
              </ul>
              <p className="mt-4 leading-relaxed">
                We are not liable for any loss, damage, or other consequence
                arising from unauthorized access to your account that results
                from your failure to safeguard your credentials. We reserve the
                right to suspend or terminate accounts that we reasonably believe
                have been compromised.
              </p>
            </section>

            {/* ────────────────────────────── 6 ────────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                6. Subscription Plans, Billing, and Payments
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway offers multiple subscription tiers including a free
                Starter plan and paid plans (Professional and Teams). By
                subscribing to a paid plan, you agree to the following:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Recurring billing.</strong>{" "}
                  Paid subscriptions are billed in advance on a recurring monthly
                  or annual basis at the rate displayed at checkout. You authorize
                  Agent Runway to charge your designated payment method
                  automatically on each billing date until you cancel.
                </li>
                <li>
                  <strong className="text-slate-300">Auto-renewal.</strong>{" "}
                  Subscriptions automatically renew at the end of each billing
                  period unless you cancel before the renewal date. For annual
                  subscriptions, we will provide you with at least{" "}
                  <strong className="text-slate-300">
                    30 days&apos; advance written notice
                  </strong>{" "}
                  of the upcoming renewal date and amount before your subscription
                  auto-renews, sent to the email address on your account. For
                  monthly subscriptions, renewal reminders are reflected in your
                  recurring billing schedule confirmed at checkout. You will
                  receive a receipt for each charge.
                </li>
                <li>
                  <strong className="text-slate-300">No refunds.</strong>{" "}
                  All fees are non-refundable to the fullest extent permitted by
                  applicable law. You may cancel your subscription at any time from
                  your account settings; access continues through the end of the
                  current billing period, but no partial refunds, credits, or
                  prorated refunds are issued for unused portions of a billing
                  period.
                </li>
                <li>
                  <strong className="text-slate-300">Price changes.</strong>{" "}
                  We reserve the right to change subscription pricing with at
                  least 30 days&apos; notice to active subscribers. Continued use
                  of the Service after a price change takes effect constitutes
                  acceptance of the new pricing. If you do not agree with a price
                  change, your sole remedy is to cancel your subscription before
                  the new pricing takes effect.
                </li>
                <li>
                  <strong className="text-slate-300">Currency.</strong>{" "}
                  All prices are in Canadian dollars (CAD) unless stated otherwise.
                </li>
                <li>
                  <strong className="text-slate-300">Taxes.</strong>{" "}
                  You are responsible for all applicable taxes, including GST/HST,
                  PST/QST, or other sales taxes imposed on your subscription by
                  any governmental authority. Tax amounts, if applicable, will be
                  displayed at checkout and added to your subscription fee.
                </li>
                <li>
                  <strong className="text-slate-300">Payment processing.</strong>{" "}
                  Payments are processed by{" "}
                  <strong className="text-slate-300">Stripe, Inc.</strong>, a PCI
                  DSS Level&nbsp;1 certified payment processor. Agent Runway does
                  not store, process, or transmit your full card number, CVV, or
                  other sensitive payment card data. All card data is entered
                  directly into Stripe&apos;s secure, encrypted payment fields and
                  handled solely by Stripe.
                </li>
                <li>
                  <strong className="text-slate-300">Failed payments.</strong>{" "}
                  If a payment fails, we may retry the charge, notify you of the
                  failure, and suspend access to paid features until payment is
                  successfully processed. We reserve the right to terminate your
                  account after 30 days of payment failure.
                </li>
                <li>
                  <strong className="text-slate-300">Billing disputes.</strong>{" "}
                  You must notify us of any billing dispute within 30 days of
                  the applicable charge by emailing{" "}
                  <a href="mailto:billing@agentrunway.ca" className="text-blue-400 hover:text-blue-300">
                    billing@agentrunway.ca
                  </a>
                  . Failure to dispute a charge within this period constitutes
                  your acceptance and waiver of any claim related to that charge.
                </li>
              </ul>
            </section>

            {/* ────────────────────────────── 7 ────────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                7. Team Accounts
              </h2>
              <p className="mb-4 leading-relaxed">
                If you subscribe to a Teams plan, the following additional terms
                apply:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Team Leader responsibility.</strong>{" "}
                  The Team Leader is the account owner and is solely responsible
                  for all fees associated with the Team Account, including fees
                  for all Team Members. The Team Leader is responsible for the
                  conduct of all Team Members and agrees to these Terms on behalf
                  of their team.
                </li>
                <li>
                  <strong className="text-slate-300">Team Member acceptance.</strong>{" "}
                  Each Team Member must individually accept these Terms upon their
                  first login. Team Members are independently bound by these Terms.
                </li>
                <li>
                  <strong className="text-slate-300">Team Member management.</strong>{" "}
                  The Team Leader controls Team Member access and permissions.
                  Removing a Team Member during a billing period does not reduce
                  fees for that period.
                </li>
                <li>
                  <strong className="text-slate-300">Team data.</strong>{" "}
                  The Team Leader may access aggregated team performance data.
                  Individual Team Member data is visible to the Team Leader to
                  the extent enabled by the platform&apos;s permission settings.
                  Team Members acknowledge and consent to this data visibility
                  by accepting these Terms.
                </li>
                <li>
                  <strong className="text-slate-300">Team Leader as data controller.</strong>{" "}
                  When a Team Leader accesses Team Member data, the Team Leader
                  acts as a data controller under applicable privacy law and is
                  independently responsible for ensuring that their collection,
                  use, and disclosure of Team Member data complies with all
                  applicable privacy and data protection laws.
                </li>
                <li>
                  <strong className="text-slate-300">Team Member liability.</strong>{" "}
                  The Team Leader agrees to indemnify and hold Agent Runway
                  harmless from any claims arising from Team Member conduct or
                  Team Member data handling that violates these Terms or applicable
                  law.
                </li>
              </ul>
            </section>

            {/* ────────────────────────────── 8 ────────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                8. Free Trials and Beta Features
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway may offer free trial periods, beta features, early
                access programs, or preview functionality from time to time.
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  Free trials are subject to the terms communicated at trial
                  initiation, including any feature or usage limitations.
                </li>
                <li>
                  Beta and preview features are provided on an even more
                  preliminary &ldquo;AS-IS&rdquo; basis and may be modified,
                  limited, or discontinued at any time without notice.
                </li>
                <li>
                  Beta features may contain errors, bugs, or inaccuracies and
                  should not be relied upon for any business-critical purpose.
                </li>
                <li>
                  Our total aggregate liability for beta or preview features is
                  limited to CAD&nbsp;$100.00, regardless of the nature of the
                  claim.
                </li>
                <li>
                  We may collect additional usage data and feedback during beta
                  periods to improve the Service.
                </li>
              </ul>
            </section>

            {/* ────────────────────────────── 9 ────────────────────────────── */}
            <section className="rounded-xl border border-blue-800/40 bg-blue-950/30 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                9. Bank Account Connection (Plaid)
              </h2>
              <p className="mb-4 leading-relaxed text-blue-100/80">
                Agent Runway offers an optional feature that allows you to connect
                your bank or financial institution account to the Service using{" "}
                <strong className="text-white">Plaid Technologies, Inc.</strong>{" "}
                (&ldquo;Plaid&rdquo;), a third-party financial data aggregator.
                Use of this feature is entirely optional and the Service functions
                fully without it. By connecting a bank account, you agree to
                the following:
              </p>
              <ul className="list-disc space-y-3 pl-6 text-blue-100/80">
                <li>
                  <strong className="text-white">Authorization.</strong>{" "}
                  You authorize Agent Runway to retrieve your financial transaction
                  data through Plaid solely for the purpose of populating your
                  expense records in the Service.
                </li>
                <li>
                  <strong className="text-white">Account ownership.</strong>{" "}
                  You represent and warrant that you are the authorized account
                  holder (or an authorized representative) for any bank or
                  financial institution account you connect. You agree not to
                  connect accounts belonging to others without their explicit
                  written authorization.
                </li>
                <li>
                  <strong className="text-white">Plaid&apos;s terms apply.</strong>{" "}
                  Your use of the bank connection feature is also subject to
                  Plaid&apos;s End User Privacy Policy at{" "}
                  <a
                    href="https://plaid.com/legal/#consumers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    plaid.com/legal/#consumers
                  </a>
                  . Plaid&apos;s processing of your banking information is governed
                  by Plaid&apos;s own terms and privacy practices, which are
                  independent of these Terms. It is your responsibility to review
                  and understand Plaid&apos;s terms before connecting your account.
                </li>
                <li>
                  <strong className="text-white">No credential storage.</strong>{" "}
                  Agent Runway never receives, transmits, or stores your banking
                  login credentials (username, password, or MFA codes). Your
                  credentials are entered directly with Plaid&apos;s secure,
                  encrypted interface and never pass through Agent Runway&apos;s
                  systems.
                </li>
                <li>
                  <strong className="text-white">Read-only access.</strong>{" "}
                  Agent Runway receives read-only access to your transaction
                  history only. We cannot initiate transfers, move funds, modify
                  your account, or perform any write operations on your financial
                  accounts.
                </li>
                <li>
                  <strong className="text-white">Revocation.</strong>{" "}
                  You may disconnect your bank account at any time from{" "}
                  <strong className="text-white">Settings &rarr; Bank Connections</strong>.
                  Upon disconnection, Agent Runway will immediately revoke
                  Plaid&apos;s access to your financial institution account and
                  permanently delete your Plaid access tokens from our systems.
                </li>
                <li>
                  <strong className="text-white">Limited use.</strong>{" "}
                  Agent Runway uses bank transaction data solely to help you
                  categorize expenses within the Service. We do not sell, aggregate
                  for commercial purposes, use for advertising, share with third
                  parties beyond Plaid, or use to train AI or machine-learning
                  models your financial transaction data.
                </li>
                <li>
                  <strong className="text-white">No liability for financial institution actions.</strong>{" "}
                  Agent Runway is not responsible or liable for any actions taken
                  by your financial institution in connection with the Plaid
                  integration, including but not limited to account restrictions,
                  alerts, notifications, holds, or changes to third-party access
                  policies.
                </li>
                <li>
                  <strong className="text-white">Data accuracy.</strong>{" "}
                  Bank transaction data imported via Plaid is provided as-is from
                  your financial institution. Agent Runway does not verify, audit,
                  or guarantee the accuracy, completeness, or timeliness of
                  imported bank data. You are solely responsible for reviewing and
                  verifying all imported transactions.
                </li>
              </ul>
            </section>

            {/* ────────────────────────────── 10 ───────────────────────────── */}
            <section className="rounded-xl border border-blue-800/40 bg-blue-950/30 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                10. Google Integrations (Gmail, Calendar, Drive)
              </h2>
              <p className="mb-4 leading-relaxed text-blue-100/80">
                Agent Runway may offer optional integrations with Google Workspace
                services including Gmail, Google Calendar, and Google Drive. Use
                of these integrations is entirely optional. By connecting your
                Google account, you agree to the following:
              </p>
              <ul className="list-disc space-y-3 pl-6 text-blue-100/80">
                <li>
                  <strong className="text-white">Authorization scope.</strong>{" "}
                  You authorize Agent Runway to access your Google account data
                  solely within the scopes you approve during the OAuth
                  authorization flow. We request only the minimum permissions
                  necessary to provide each integration feature.
                </li>
                <li>
                  <strong className="text-white">Gmail.</strong>{" "}
                  If you connect Gmail, Agent Runway may send emails on your
                  behalf (e.g., outreach messages you have reviewed and approved),
                  and may read email metadata to track delivery and responses. You
                  are solely responsible for the content of all emails sent through
                  the Service using your Gmail account, including compliance with
                  all applicable anti-spam laws (see Section&nbsp;19).
                </li>
                <li>
                  <strong className="text-white">Google Calendar.</strong>{" "}
                  If you connect Google Calendar, Agent Runway may read your
                  calendar events and create new events on your behalf to support
                  scheduling features.
                </li>
                <li>
                  <strong className="text-white">Google Drive.</strong>{" "}
                  If you connect Google Drive, Agent Runway may read documents you
                  designate and store or index document references to support
                  document management features within the Service.
                </li>
                <li>
                  <strong className="text-white">Google&apos;s terms apply.</strong>{" "}
                  Your use of Google integrations is also subject to Google&apos;s
                  Terms of Service and Privacy Policy. Agent Runway&apos;s use and
                  transfer of information received from Google APIs will adhere to
                  the{" "}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Google API Services User Data Policy
                  </a>
                  , including the Limited Use requirements.
                </li>
                <li>
                  <strong className="text-white">Revocation.</strong>{" "}
                  You may disconnect Google integrations at any time from your
                  account settings or from your Google Account permissions page.
                </li>
                <li>
                  <strong className="text-white">Third-party service disclaimer.</strong>{" "}
                  Agent Runway is not responsible for the availability, accuracy,
                  or performance of Google services. Changes to Google&apos;s APIs,
                  terms, or policies may affect the functionality of these
                  integrations, and we are not liable for any resulting service
                  disruptions.
                </li>
              </ul>
            </section>

            {/* ────────────────────────────── 11 ───────────────────────────── */}
            <section className="rounded-xl border border-purple-800/40 bg-purple-950/20 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                11. AI-Generated Content and Automated Features
              </h2>
              <div className="space-y-4 text-purple-100/80 leading-relaxed">
                <p>
                  Agent Runway incorporates AI Features powered by third-party
                  artificial intelligence and large language model providers. These
                  features include, but are not limited to: AI insight cards,
                  automated outreach drafting, chat-based business insights, smart
                  categorization suggestions, and performance recommendations.
                </p>
                <p>
                  <strong className="text-white">
                    By using any AI Feature, you acknowledge and agree to the
                    following:
                  </strong>
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    <strong className="text-white">No guarantee of accuracy.</strong>{" "}
                    AI-generated content may be inaccurate, incomplete, outdated,
                    misleading, or inapplicable to your specific situation. AI
                    outputs are generated by automated systems and do not reflect
                    the judgment, review, or endorsement of any qualified
                    professional.
                  </li>
                  <li>
                    <strong className="text-white">Not professional advice.</strong>{" "}
                    AI outputs do not constitute financial advice, tax advice,
                    legal advice, real estate advice, investment advice, or
                    professional accounting services of any kind. See
                    Section&nbsp;12 for additional disclaimers.
                  </li>
                  <li>
                    <strong className="text-white">Human review required.</strong>{" "}
                    All AI-generated content, including outreach emails, is
                    presented to you in draft form for your review, editing, and
                    explicit approval before any action is taken. You are solely
                    responsible for reviewing all AI-generated content and for any
                    decision or action you take based on it.
                  </li>
                  <li>
                    <strong className="text-white">No liability for outcomes.</strong>{" "}
                    Agent Runway disclaims all responsibility and liability for any
                    business outcomes, marketing campaign performance, conversion
                    rates, client responses, lost opportunities, or other
                    consequences resulting from your use of or reliance on
                    AI-generated content.
                  </li>
                  <li>
                    <strong className="text-white">Third-party AI providers (Groq).</strong>{" "}
                    Customer Data processed by AI Features is transmitted to{" "}
                    <strong className="text-white">Groq, Inc.</strong>, a third-party
                    large language model inference provider based in the United States,
                    for the purpose of generating AI outputs. Data transmitted to Groq
                    is processed on Groq&apos;s servers located in the United States
                    and is subject to US jurisdiction, including potential access by US
                    law enforcement authorities under applicable US law. We have a Data
                    Processing Agreement with Groq. Groq commits to not retaining or
                    training on customer data after processing, but we cannot independently
                    verify third-party provider compliance. Sensitive or confidential
                    information should not be included in AI prompts or interactions.
                    See Section&nbsp;12 for the full professional advice disclaimer.
                  </li>
                  <li>
                    <strong className="text-white">AI model ownership.</strong>{" "}
                    All AI models, algorithms, prompts, training data, and
                    underlying technology used to provide AI Features are and
                    remain the exclusive property of Agent Runway or our
                    third-party providers. No rights in AI models or technology
                    are transferred to you.
                  </li>
                  <li>
                    <strong className="text-white">Prohibited uses.</strong>{" "}
                    You may not use AI Features to generate content that is
                    discriminatory, harassing, defamatory, fraudulent, deceptive,
                    or otherwise in violation of law. You may not use AI Features
                    to generate content that impersonates another person or entity.
                    See our{" "}
                    <a href="/acceptable-use" className="text-blue-400 hover:text-blue-300 underline">
                      Acceptable Use Policy
                    </a>{" "}
                    for additional restrictions.
                  </li>
                  <li>
                    <strong className="text-white">Changes to AI Features.</strong>{" "}
                    AI Features may be modified, improved, degraded, or
                    discontinued at any time without notice. The quality, accuracy,
                    and availability of AI outputs may vary over time.
                  </li>
                </ul>
              </div>
            </section>

            {/* ────────────────────────────── 12 ───────────────────────────── */}
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
              <h2 className="mb-4 text-xl font-semibold text-amber-400">
                12. Not Financial, Tax, or Professional Advice
              </h2>
              <div className="space-y-4 text-amber-200/80 leading-relaxed">
                <p>
                  <strong className="text-amber-300">
                    Agent Runway is a self-management and organizational tool for
                    informational purposes only. Nothing in Agent Runway —
                    including but not limited to tax estimates, income projections,
                    forecasts, Runway Scores, insight cards, AI-generated content,
                    chat responses, benchmarking data, market data, or any other
                    output — constitutes financial advice, tax advice, investment
                    advice, legal advice, real estate advice, or professional
                    accounting services of any kind.
                  </strong>
                </p>
                <p>
                  All calculations, projections, and estimates displayed in the
                  Service are approximations based solely on the data you enter
                  and publicly available rate information. They are subject to
                  error and may not reflect your actual tax obligations, income,
                  or financial situation. Agent Runway does not verify, audit,
                  certify, or independently confirm any data you provide, and we
                  make no representations as to the accuracy, completeness, or
                  fitness of any output for any purpose.
                </p>
                <p>
                  <strong className="text-amber-300">
                    Do not use Agent Runway outputs — including tax estimates,
                    income projections, GCI figures, net income calculations,
                    Runway Scores, AI-generated recommendations, or market data —
                    for any of the following purposes:
                  </strong>
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>Filing a tax return or making representations to the Canada Revenue Agency (CRA) or any other tax authority</li>
                  <li>Applying for a mortgage, loan, line of credit, or any other form of financing</li>
                  <li>Making investment or business decisions of material financial consequence</li>
                  <li>Providing evidence of income, assets, or financial standing to any third party</li>
                  <li>Determining compliance with any regulatory requirement</li>
                  <li>Any official, legal, regulatory, or binding purpose</li>
                </ul>
                <p>
                  <strong className="text-amber-300">
                    Always consult a qualified accountant, tax professional,
                    financial advisor, or legal professional before making any
                    financial, tax, legal, or business decision.
                  </strong>{" "}
                  Agent Runway assumes no liability for any consequence arising
                  from your reliance on any output produced by the Service.
                </p>
              </div>
            </section>

            {/* ────────────────────────────── 13 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                13. Forward-Looking Statements and Projection Disclaimer
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway produces income projections, forecasts, probability
                bands, year-end estimates, and other forward-looking outputs.
                These are illustrative scenarios based on mathematical models,
                statistical extrapolation, and historical patterns. They are{" "}
                <strong className="text-white">
                  not predictions, guarantees, promises, or commitments of any
                  kind.
                </strong>
              </p>
              <p className="leading-relaxed">
                Actual results will differ — potentially materially — from
                projections due to factors including but not limited to market
                conditions, interest rate changes, economic conditions, deal
                timing, regulatory changes, personal circumstances, client
                decisions, and other variables outside the scope of any model.
                Historical performance reflected in Agent Runway does not
                guarantee or imply future results. You expressly acknowledge and
                agree that you will not represent any projection, forecast, or
                estimate produced by Agent Runway as a reliable indicator of
                actual future income to any third party, lender, tax authority,
                or regulatory body.
              </p>
            </section>

            {/* ────────────────────────────── 14 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                14. Tax Calculation Disclaimer
              </h2>
              <p className="mb-4 leading-relaxed">
                Tax estimates in Agent Runway are rough approximations calculated
                using publicly available federal and provincial tax brackets,
                CPP/QPP contribution rates, and basic self-employment
                assumptions. They are provided for general informational
                purposes only and do not account for:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>Deductions, credits, carry-forwards, or loss carry-backs you may be entitled to claim</li>
                <li>Prior-year tax balances, instalments, or reassessments</li>
                <li>Corporation, partnership, or trust structures</li>
                <li>GST/HST registration, reporting, or remittance obligations</li>
                <li>Multi-jurisdictional or cross-border income</li>
                <li>Changes to tax law, rates, or thresholds enacted after the rates were last updated in the Service</li>
                <li>Any other factors specific to your individual tax situation</li>
              </ul>
              <p className="mt-4 leading-relaxed">
                <strong className="text-white">
                  Your actual CRA tax obligation will differ from any estimate
                  displayed in Agent Runway.
                </strong>{" "}
                Agent Runway assumes no liability for taxes owing, penalties,
                interest, reassessments, or any other consequence arising from
                reliance on tax estimates produced by the Service. Always consult
                a qualified accountant or tax professional for your actual tax
                filings and planning.
              </p>
            </section>

            {/* ────────────────────────────── 15 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                15. Your Data, Data Accuracy, and Data Ownership
              </h2>
              <p className="mb-4 leading-relaxed">
                You retain ownership of all Customer Data you enter into Agent
                Runway. We do not claim any intellectual property rights over your
                transactions, deals, expenses, client records, or other Customer
                Data. You grant us a limited, non-exclusive, worldwide,
                royalty-free licence to store, process, transmit, display, and
                use your Customer Data solely for the purpose of providing,
                maintaining, and improving the Service.
              </p>
              <p className="mb-4 leading-relaxed">
                <strong className="text-white">
                  You are solely responsible for the accuracy, completeness,
                  legality, and reliability of all Customer Data you enter into
                  or import into Agent Runway.
                </strong>{" "}
                All calculations, projections, reports, and outputs produced by
                the Service are derived from the data you provide. Agent Runway
                does not verify, audit, validate, or independently confirm your
                inputs. Errors, omissions, or inaccuracies in the data you enter
                will result in corresponding errors in the outputs the Service
                produces. You bear all responsibility for ensuring your data is
                accurate and for verifying all outputs against your own records
                and with qualified professionals.
              </p>
              <p className="leading-relaxed">
                You represent and warrant that you have all necessary rights,
                consents, and authorizations to provide all Customer Data to
                Agent Runway, including client personal information, and that
                your provision of such data does not violate any applicable law,
                regulation, or third-party right.
              </p>
            </section>

            {/* ────────────────────────────── 16 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                16. Third-Party Data Sources (CREA MLS&reg; Statistics)
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway incorporates data from third-party sources to
                provide market benchmarking features. Your use of these features
                is subject to the following:
              </p>
              <div className="space-y-4">
                <div>
                  <p className="mb-2 font-semibold text-white">
                    CREA MLS&reg; Statistics
                  </p>
                  <p className="leading-relaxed text-slate-400">
                    Local market data displayed in Agent Runway (including board
                    average sale prices, Sales-to-New-Listings Ratios, and market
                    condition indicators) is sourced from statistics published by{" "}
                    <strong className="text-slate-300">
                      The Canadian Real Estate Association (CREA)
                    </strong>{" "}
                    via the CREA MLS&reg; Statistics portal. This data is provided
                    for general informational and benchmarking purposes only and is
                    updated on a monthly basis as CREA publishes new data.
                  </p>
                  <p className="mt-3 leading-relaxed text-slate-400">
                    The trademarks{" "}
                    <strong className="text-slate-300">MLS&reg;</strong>,{" "}
                    <strong className="text-slate-300">
                      Multiple Listing Service&reg;
                    </strong>{" "}
                    and the associated logos are owned by The Canadian Real Estate
                    Association (CREA) and identify the quality of services
                    provided by real estate professionals who are members of CREA.
                    Agent Runway is not affiliated with, endorsed by, or an
                    official partner of CREA. All CREA data remains the property
                    of CREA. &copy; {new Date().getFullYear()} The Canadian Real
                    Estate Association. All rights reserved.
                  </p>
                  <p className="mt-3 leading-relaxed text-slate-400">
                    Agent Runway makes no representations about the accuracy,
                    completeness, or timeliness of CREA data or any other
                    third-party data displayed in the Service. Market data should
                    not be used as the sole basis for any real estate, investment,
                    or business decision. Always consult a qualified real estate
                    professional for advice specific to your market.
                  </p>
                </div>
                <div>
                  <p className="mb-2 font-semibold text-white">
                    National Benchmark Data
                  </p>
                  <p className="leading-relaxed text-slate-400">
                    The Runway Score benchmarking component uses a national cohort
                    dataset derived from published CREA statistics and industry
                    surveys to compare your performance against agents with similar
                    experience. This data is based on historical aggregated data
                    and is updated periodically. It is provided for general
                    comparative purposes only and does not constitute a
                    professional performance assessment, employment evaluation, or
                    industry ranking.
                  </p>
                </div>
              </div>
            </section>

            {/* ────────────────────────────── 17 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                17. Third-Party Services and Integrations
              </h2>
              <p className="mb-4 leading-relaxed">
                The Service integrates with or relies upon third-party services
                including but not limited to Stripe (payments), Plaid (bank data),
                Supabase (infrastructure), Google Workspace (email, calendar,
                storage), and third-party AI providers. You acknowledge that:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>Agent Runway has no control over the availability, accuracy, security, performance, or policies of third-party services.</li>
                <li>Third-party services are subject to their own terms of service and privacy policies, which you are responsible for reviewing and accepting.</li>
                <li>Agent Runway makes no representations or warranties regarding any third-party service.</li>
                <li>Agent Runway shall have no liability for your use of any third-party service, or for the acts or omissions of any third-party service provider, including but not limited to service outages, data loss, security breaches, or policy changes by the third-party provider.</li>
                <li>Third-party integrations are provided as a convenience. We may add, modify, or remove integrations at any time without notice.</li>
                <li>If a third-party provider modifies its API, pricing, terms, or policies in a way that affects the Service, we are not liable for any resulting disruption, degradation, or loss of functionality.</li>
              </ul>
            </section>

            {/* ────────────────────────────── 18 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                18. Acceptable Use
              </h2>
              <p className="mb-4 leading-relaxed">
                Your use of the Service is subject to our{" "}
                <a href="/acceptable-use" className="text-blue-400 hover:text-blue-300 underline">
                  Acceptable Use Policy
                </a>
                , which is incorporated into these Terms by reference. In
                addition to the restrictions in that policy, you agree not to:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>Use the Service for any unlawful purpose or in violation of any applicable law or regulation</li>
                <li>Attempt to gain unauthorized access to any part of the Service, other accounts, computer systems, or networks connected to the Service</li>
                <li>Reverse engineer, decompile, disassemble, or attempt to derive the source code of the Service or any underlying technology</li>
                <li>Use any automated tools, bots, scrapers, or crawlers to access, scrape, index, or extract data from the Service</li>
                <li>Resell, sublicense, redistribute, time-share, or provide access to the Service to any third party without our prior written consent</li>
                <li>Interfere with or disrupt the integrity, performance, or security of the Service or its underlying infrastructure</li>
                <li>Upload or transmit viruses, malware, or other malicious code</li>
                <li>Impersonate any person or entity, or falsely state or misrepresent your affiliation with a person or entity</li>
                <li>Connect bank accounts, email accounts, or any other accounts belonging to others without their explicit written authorization</li>
                <li>Use the Service to store, process, or transmit information that infringes the intellectual property rights of any third party</li>
                <li>Use the Service in a manner that could damage, disable, overburden, or impair it</li>
              </ul>
            </section>

            {/* ────────────────────────────── 19 ───────────────────────────── */}
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
              <h2 className="mb-4 text-xl font-semibold text-amber-400">
                19. Communication Compliance (CASL and Anti-Spam)
              </h2>
              <div className="space-y-4 text-amber-200/80 leading-relaxed">
                <p>
                  Agent Runway provides features that enable you to send
                  communications to your clients, including outreach emails
                  (whether manually composed or AI-drafted) and text messages.{" "}
                  <strong className="text-amber-300">
                    Both you and Agent Runway can be held liable under CASL for
                    non-compliant messages. CASL penalties are up to $1,000,000
                    per violation for individuals and $10,000,000 per violation
                    for companies.
                  </strong>
                </p>

                <p className="font-semibold text-white">
                  Your CASL Obligations
                </p>
                <p>
                  By using Agent Runway&apos;s outreach features, you represent
                  and warrant that for every commercial electronic message (CEM)
                  you send through the Service:
                </p>
                <ul className="list-disc space-y-2 pl-6">
                  <li>
                    <strong className="text-white">Consent.</strong>{" "}
                    You have obtained either{" "}
                    <strong className="text-white">express consent</strong>{" "}
                    (recipient actively opted in) or{" "}
                    <strong className="text-white">implied consent</strong>{" "}
                    (existing business relationship within 2 years of last
                    transaction, or 6 months of last inquiry) from each
                    recipient, as required by CASL.
                  </li>
                  <li>
                    <strong className="text-white">Sender identification.</strong>{" "}
                    Each message identifies you (the sender) by name, includes
                    your physical mailing address, and provides at least one of:
                    phone number, email address, or website URL.
                  </li>
                  <li>
                    <strong className="text-white">Unsubscribe mechanism.</strong>{" "}
                    Each commercial message includes a functioning unsubscribe
                    mechanism. You must process unsubscribe requests within{" "}
                    <strong className="text-white">10 business days</strong>.
                  </li>
                  <li>
                    <strong className="text-white">Consent record keeping.</strong>{" "}
                    You maintain records of how and when consent was obtained from
                    each recipient for a minimum of{" "}
                    <strong className="text-white">3 years</strong> after the
                    business relationship ends. The burden of proof for consent
                    rests with you.
                  </li>
                </ul>

                <p className="font-semibold text-white">
                  Additional Anti-Spam Laws
                </p>
                <ul className="list-disc space-y-2 pl-6">
                  <li>
                    <strong className="text-white">CAN-SPAM Act</strong>{" "}
                    — applies if messaging recipients in the United States
                  </li>
                  <li>
                    <strong className="text-white">TCPA</strong>{" "}
                    — applies if sending text messages to U.S. recipients
                  </li>
                  <li>
                    Provincial privacy laws and real estate board rules
                    regarding solicitation and advertising in your jurisdiction
                  </li>
                </ul>

                <p>
                  <strong className="text-amber-300">
                    Agent Runway provides tools for communication but does not
                    verify whether you have obtained the necessary consents from
                    recipients.
                  </strong>{" "}
                  We make no representation that any AI-drafted communication
                  complies with applicable law. You agree to indemnify and hold
                  harmless Agent Runway from any claims, fines, penalties, or
                  damages arising from your communications sent through the
                  Service, including CASL penalties, CAN-SPAM violations, TCPA
                  claims, and complaints from recipients.
                </p>
              </div>
            </section>

            {/* ────────────────────────────── 20 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                20. Intellectual Property
              </h2>
              <p className="mb-4 leading-relaxed">
                The Agent Runway Service — including all software, source code,
                algorithms, models, user interfaces, designs, graphics, logos,
                trademarks, documentation, and all other original content — is
                owned by Andrew Shaw and protected by Canadian and international
                intellectual property laws. These Terms grant you only a limited,
                non-exclusive, non-transferable, revocable licence to access and
                use the Service during your active subscription, subject to these
                Terms. No other rights are granted to you, whether express or
                implied.
              </p>
              <p className="leading-relaxed">
                The Agent Runway name, logo, and all related product and service
                names, designs, and slogans are trademarks of Andrew Shaw. You
                may not use these marks without our prior written permission.
              </p>
            </section>

            {/* ────────────────────────────── 21 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                21. Feedback and Suggestions
              </h2>
              <p className="leading-relaxed">
                If you provide Agent Runway with any feedback, suggestions, ideas,
                enhancement requests, feature requests, recommendations, or other
                input regarding the Service (&ldquo;Feedback&rdquo;), you hereby
                assign to Agent Runway all right, title, and interest in and to
                such Feedback. Agent Runway is free to use, reproduce, modify,
                distribute, and commercialize Feedback without any obligation,
                compensation, attribution, or restriction of any kind to you. You
                waive any moral rights you may have in any Feedback to the extent
                permitted by applicable law.
              </p>
            </section>

            {/* ────────────────────────────── 22 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                22. Confidentiality
              </h2>
              <p className="leading-relaxed">
                You agree not to disclose any non-public information about Agent
                Runway&apos;s technology, algorithms, pricing structures
                (including beta or negotiated pricing), roadmap, security
                infrastructure, or business operations that you may learn through
                your use of the Service, participation in beta programs, or
                communications with Agent Runway team members. This obligation
                survives termination of your account.
              </p>
            </section>

            {/* ────────────────────────────── 23 ───────────────────────────── */}
            <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                23. Disclaimer of Warranties
              </h2>
              <div className="space-y-4 leading-relaxed">
                <p>
                  <strong className="text-white uppercase">
                    THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
                    AVAILABLE&rdquo; WITHOUT ANY WARRANTY OF ANY KIND, WHETHER
                    EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING BUT NOT
                    LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
                    PARTICULAR PURPOSE, ACCURACY, COMPLETENESS, RELIABILITY,
                    SECURITY, TITLE, QUIET ENJOYMENT, AND NON-INFRINGEMENT.
                  </strong>
                </p>
                <p>
                  WITHOUT LIMITING THE FOREGOING, AGENT RUNWAY DOES NOT WARRANT
                  THAT: (a) THE SERVICE WILL MEET YOUR REQUIREMENTS OR
                  EXPECTATIONS; (b) THE SERVICE WILL BE UNINTERRUPTED, TIMELY,
                  SECURE, ERROR-FREE, VIRUS-FREE, OR FREE OF HARMFUL COMPONENTS;
                  (c) ANY CALCULATION, PROJECTION, ESTIMATE, FORECAST, TAX
                  ESTIMATE, RUNWAY SCORE, AI OUTPUT, OR OTHER OUTPUT IS ACCURATE,
                  CURRENT, COMPLETE, OR RELIABLE; (d) TAX RATES, MARKET DATA,
                  BENCHMARK DATA, OR OTHER REFERENCE DATA USED IN CALCULATIONS
                  ARE UP TO DATE OR CORRECT; (e) THE SERVICE IS SUITABLE FOR ANY
                  PARTICULAR PURPOSE OR COMPLIANT WITH ANY INDUSTRY STANDARD; (f)
                  ANY DEFECTS OR ERRORS WILL BE CORRECTED; OR (g) THE RESULTS
                  OBTAINED FROM USE OF THE SERVICE WILL BE ACCURATE, RELIABLE, OR
                  MEET YOUR NEEDS.
                </p>
                <p>
                  SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF IMPLIED
                  WARRANTIES. IN SUCH JURISDICTIONS, THE ABOVE EXCLUSIONS APPLY
                  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW.
                </p>
              </div>
            </section>

            {/* ────────────────────────────── 24 ───────────────────────────── */}
            <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                24. Limitation of Liability
              </h2>
              <div className="space-y-4 leading-relaxed">
                <p>
                  <strong className="text-white uppercase">
                    TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO
                    EVENT SHALL AGENT RUNWAY, ITS OPERATOR (ANDREW SHAW), OR ANY
                    OF ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS,
                    SUPPLIERS, OR LICENSORS BE LIABLE TO YOU OR ANY THIRD PARTY
                    FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
                    PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO:
                  </strong>
                </p>
                <ul className="list-disc space-y-1.5 pl-5 text-slate-400">
                  <li>Financial losses, tax underpayments, penalties, or interest</li>
                  <li>Lost revenue, profits, business, goodwill, or anticipated savings</li>
                  <li>Loss of or damage to data</li>
                  <li>Business interruption or loss of business opportunity</li>
                  <li>Missed deals, lost clients, or failed transactions</li>
                  <li>Cost of procurement of substitute goods or services</li>
                  <li>Personal injury or property damage</li>
                  <li>Any matter beyond our reasonable control</li>
                </ul>
                <p>
                  THIS APPLIES REGARDLESS OF THE LEGAL THEORY (CONTRACT, TORT,
                  NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE) AND EVEN IF AGENT
                  RUNWAY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
                </p>
                <p>
                  <strong className="text-white">
                    OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING
                    FROM OR RELATED TO THE SERVICE OR THESE TERMS SHALL NOT EXCEED
                    THE GREATER OF: (a) THE TOTAL AMOUNT YOU ACTUALLY PAID TO
                    AGENT RUNWAY IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING
                    THE EVENT GIVING RISE TO THE CLAIM, OR (b) ONE HUNDRED
                    CANADIAN DOLLARS (CAD&nbsp;$100.00).
                  </strong>
                </p>
                <p>
                  THIS LIMITATION OF LIABILITY IS CUMULATIVE AND NOT PER-INCIDENT.
                  THIS CAP DOES NOT LIMIT YOUR INDEMNIFICATION OBLIGATIONS TO US
                  UNDER SECTION&nbsp;25.
                </p>
                <p>
                  <strong className="text-white">Carve-outs.</strong>{" "}
                  Notwithstanding the foregoing, the liability cap and exclusion of
                  consequential damages set out in this Section&nbsp;24 do{" "}
                  <strong className="text-white">not</strong> apply to: (a) damages
                  caused by{" "}
                  <strong className="text-white">
                    gross negligence or wilful misconduct
                  </strong>{" "}
                  by Agent Runway; (b) damages arising from Agent Runway&apos;s
                  breach of its confidentiality obligations under Section&nbsp;22;
                  (c) Agent Runway&apos;s liability for{" "}
                  <strong className="text-white">
                    data breaches caused by Agent Runway&apos;s own failure
                  </strong>{" "}
                  to implement reasonable security safeguards; or (d) any liability
                  that cannot be excluded or limited under applicable Canadian law.
                  In these carve-out circumstances, liability shall be limited to
                  actual direct damages only and shall not include indirect,
                  consequential, or punitive damages except to the extent required
                  by law.
                </p>
                <p>
                  SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF
                  CERTAIN DAMAGES. IN SUCH JURISDICTIONS, OUR LIABILITY SHALL BE
                  LIMITED TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW.
                </p>
              </div>
            </section>

            {/* ────────────────────────────── 25 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                25. Indemnification
              </h2>
              <p className="mb-4 leading-relaxed">
                You agree to indemnify, defend, and hold harmless Agent Runway,
                its operator (Andrew Shaw), and any affiliates, officers,
                directors, employees, agents, successors, and assigns from and
                against any and all claims, liabilities, damages, judgments,
                awards, losses, costs, and expenses (including reasonable
                attorneys&apos; fees and legal costs) arising out of or relating
                to:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>Your use of or reliance on the Service or any output produced by the Service</li>
                <li>Your breach or alleged breach of these Terms</li>
                <li>Your violation of any applicable law, regulation, or third-party right</li>
                <li>Any Customer Data you submit to the Service, including client personal information</li>
                <li>Any decision you make or action you take based on outputs produced by the Service, including tax estimates, income projections, AI-generated content, forecasts, or recommendations</li>
                <li>Your use of the bank account connection feature, including any actions taken by your financial institution</li>
                <li>Your use of Google integrations, including emails sent, calendar events created, or documents accessed using your connected Google account</li>
                <li>Communications you send using or through the Service, including outreach emails and text messages, and including any claims of CASL, CAN-SPAM, or TCPA violations</li>
                <li>Disputes between you and your clients, contacts, or any third party</li>
                <li>Your willful misconduct or negligence</li>
                <li>Third-party access to the Service using your credentials</li>
                <li>If you are a Team Leader: any conduct of your Team Members that violates these Terms or applicable law</li>
              </ul>
              <p className="mt-4 leading-relaxed">
                Agent Runway reserves the right to assume exclusive defense and
                control of any matter subject to indemnification by you, at your
                expense. You agree to cooperate fully with our defense of any
                such claim. You shall not settle any claim without our prior
                written consent.
              </p>
            </section>

            {/* ────────────────────────────── 26 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                26. Termination and Suspension
              </h2>
              <div className="space-y-4 leading-relaxed">
                <p>
                  <strong className="text-white">By you.</strong>{" "}
                  You may cancel your subscription or delete your account at any
                  time from your account settings. Cancellation takes effect at
                  the end of the current billing period; no refund is issued for
                  the remainder of the period. You may also choose to delete your
                  account immediately upon cancellation, which begins the data
                  deletion process described in Section&nbsp;27.
                </p>
                <p>
                  <strong className="text-white">By us.</strong>{" "}
                  We reserve the right to suspend or terminate your access to the
                  Service, with or without notice, for any of the following
                  reasons:
                </p>
                <ul className="list-disc space-y-1.5 pl-6 text-slate-400">
                  <li>Violation of these Terms, the Acceptable Use Policy, or any other policy</li>
                  <li>Non-payment of fees after 30 days of payment failure</li>
                  <li>Conduct that poses a security risk to the Service or other users</li>
                  <li>Conduct that could expose Agent Runway to legal liability</li>
                  <li>If required by law, court order, or governmental authority</li>
                  <li>Extended period of inactivity (12+ months with no login)</li>
                  <li>If your use of the Service is reasonably believed to be fraudulent or abusive</li>
                </ul>
                <p>
                  <strong className="text-white">Effect of termination.</strong>{" "}
                  Upon termination, your right to use the Service ceases
                  immediately. Sections of these Terms that by their nature should
                  survive termination will survive, including but not limited to:
                  Definitions, Disclaimer of Warranties, Limitation of Liability,
                  Indemnification, Governing Law, Class Action Waiver,
                  Confidentiality, and Intellectual Property.
                </p>
              </div>
            </section>

            {/* ────────────────────────────── 27 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                27. Data Export and Post-Termination
              </h2>
              <p className="mb-4 leading-relaxed">
                Upon cancellation or termination of your account, you have 30
                days to request an export of your Customer Data by emailing{" "}
                <a href="mailto:hello@agentrunway.ca" className="text-blue-400 hover:text-blue-300">
                  hello@agentrunway.ca
                </a>
                . We will provide your data in a commonly used machine-readable
                format (such as CSV or JSON).
              </p>
              <p className="mb-4 leading-relaxed">
                After the 30-day post-termination window, Agent Runway has no
                obligation to maintain, provide access to, or export your
                Customer Data and may permanently delete it. Certain records may
                be retained as required by law (e.g., billing records for 7 years
                per Canadian tax requirements).
              </p>
              <p className="leading-relaxed">
                If you used the bank sync feature, Plaid access tokens are
                permanently deleted upon account termination. If you used Google
                integrations, OAuth tokens are revoked upon account termination.
              </p>
            </section>

            {/* ────────────────────────────── 28 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                28. Modifications to These Terms
              </h2>
              <p className="leading-relaxed">
                We may revise these Terms at any time by posting an updated
                version at agentrunway.ca/terms. Material changes will be
                communicated via email to the address on your account or through
                an in-app notification at least 30 days before they take effect.
                The &ldquo;Last updated&rdquo; date at the top of this page
                indicates the most recent revision. Your continued use of the
                Service after the effective date of revised Terms constitutes
                your acceptance of those revisions. If you do not agree to
                revised Terms, you must stop using the Service and cancel your
                account before the changes take effect.
              </p>
            </section>

            {/* ────────────────────────────── 29 ───────────────────────────── */}
            <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                29. Governing Law and Dispute Resolution
              </h2>
              <div className="space-y-4 leading-relaxed">
                <p>
                  These Terms are governed by and construed in accordance with the
                  laws of the Province of New Brunswick and the federal laws of
                  Canada applicable therein, without regard to any conflict-of-law
                  rules or principles that would cause the application of the laws
                  of any other jurisdiction.
                </p>
                <p>
                  Any dispute, controversy, or claim arising out of or relating to
                  these Terms or the Service shall first be submitted to good-faith
                  negotiation for a period of at least 30 days. If the dispute
                  cannot be resolved through negotiation, it shall be resolved
                  exclusively in the courts of the Province of New Brunswick,
                  Canada. You hereby irrevocably consent to the exclusive personal
                  jurisdiction and venue of those courts and waive any objection
                  based on inconvenient forum.
                </p>
                <p>
                  <strong className="text-white">Prevailing party.</strong>{" "}
                  In any legal action or proceeding arising from or related to
                  these Terms, the prevailing party shall be entitled to recover
                  its reasonable attorneys&apos; fees, court costs, and other
                  collection expenses, in addition to any other relief to which it
                  may be entitled.
                </p>
              </div>
            </section>

            {/* ────────────────────────────── 30 ───────────────────────────── */}
            <section className="rounded-xl border border-red-800/40 bg-red-950/20 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                30. Class Action Waiver
              </h2>
              <div className="space-y-4 leading-relaxed text-red-100/80">
                <p>
                  <strong className="text-white">
                    TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, YOU AND
                    AGENT RUNWAY AGREE THAT EACH PARTY MAY BRING CLAIMS AGAINST
                    THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT AS
                    A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE,
                    CONSOLIDATED, MULTI-DISTRICT, OR REPRESENTATIVE ACTION OR
                    PROCEEDING.
                  </strong>
                </p>
                <p>
                  Unless both you and Agent Runway agree otherwise in writing, no
                  arbitrator or judge may consolidate more than one
                  person&apos;s claims or otherwise preside over any form of a
                  representative, class, or collective proceeding. If this class
                  action waiver is found to be unenforceable in any jurisdiction,
                  then the entirety of this Section&nbsp;30 shall be null and void
                  in that jurisdiction, but shall remain enforceable in all other
                  jurisdictions.
                </p>
              </div>
            </section>

            {/* ────────────────────────────── 31 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                31. Force Majeure
              </h2>
              <p className="leading-relaxed">
                Agent Runway shall not be liable for any delay or failure to
                perform any obligation under these Terms if such delay or failure
                results from events beyond our reasonable control, including but
                not limited to: acts of God, fire, flood, earthquake, hurricane,
                severe weather, epidemic, pandemic, war, terrorism, civil
                disturbance, riot, strike, labor dispute, embargo, government
                action, internet or telecommunications failure, power outage,
                equipment failure, cyberattack, third-party service outage
                (including cloud hosting or payment processor outages), or any
                other event that is beyond the reasonable control of Agent Runway.
                Our obligations under these Terms shall be suspended for the
                duration of any such event.
              </p>
            </section>

            {/* ────────────────────────────── 32 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                32. General Provisions
              </h2>
              <ul className="list-disc space-y-3 pl-6 text-slate-400 leading-relaxed">
                <li>
                  <strong className="text-slate-300">Entire Agreement.</strong>{" "}
                  These Terms, together with our Privacy Policy, Acceptable Use
                  Policy, and any other policies referenced herein, constitute the
                  entire agreement between you and Agent Runway regarding the
                  Service and supersede all prior agreements, understandings,
                  negotiations, and discussions, whether oral or written.
                </li>
                <li>
                  <strong className="text-slate-300">Severability.</strong>{" "}
                  If any provision of these Terms is found to be unenforceable or
                  invalid by a court of competent jurisdiction, that provision
                  shall be modified to the minimum extent necessary to make it
                  enforceable, and the remaining provisions shall continue in full
                  force and effect.
                </li>
                <li>
                  <strong className="text-slate-300">No Waiver.</strong>{" "}
                  Our failure to exercise or enforce any right or provision of
                  these Terms shall not constitute a waiver of such right or
                  provision. Any waiver must be in writing and signed by Agent
                  Runway.
                </li>
                <li>
                  <strong className="text-slate-300">Assignment.</strong>{" "}
                  You may not assign, subcontract, delegate, or transfer your
                  rights or obligations under these Terms without our prior written
                  consent. Any attempted unauthorized assignment is null and void.
                  Agent Runway may freely assign these Terms without restriction.
                </li>
                <li>
                  <strong className="text-slate-300">Headings.</strong>{" "}
                  Section headings are for convenience only and do not affect the
                  interpretation of these Terms.
                </li>
                <li>
                  <strong className="text-slate-300">Notices.</strong>{" "}
                  Notices to you may be sent to the email address on your account.
                  Notices to Agent Runway must be sent to{" "}
                  <a href="mailto:hello@agentrunway.ca" className="text-blue-400 hover:text-blue-300">
                    hello@agentrunway.ca
                  </a>
                  .
                </li>
                <li>
                  <strong className="text-slate-300">Relationship.</strong>{" "}
                  Nothing in these Terms creates a partnership, joint venture,
                  employment, or agency relationship between you and Agent Runway.
                </li>
                <li>
                  <strong className="text-slate-300">Electronic communications.</strong>{" "}
                  You consent to receiving communications from Agent Runway
                  electronically (email, in-app notifications). You agree that all
                  agreements, notices, disclosures, and other communications
                  provided electronically satisfy any legal requirement that such
                  communications be in writing.
                </li>
              </ul>
            </section>

            {/* ────────────────────────────── 33 ───────────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                33. Contact
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
                <br />
                General inquiries:{" "}
                <a href="mailto:hello@agentrunway.ca" className="text-blue-400 hover:text-blue-300">
                  hello@agentrunway.ca
                </a>
                <br />
                Privacy inquiries:{" "}
                <a href="mailto:privacy@agentrunway.ca" className="text-blue-400 hover:text-blue-300">
                  privacy@agentrunway.ca
                </a>
                <br />
                Security reports:{" "}
                <a href="mailto:security@agentrunway.ca" className="text-blue-400 hover:text-blue-300">
                  security@agentrunway.ca
                </a>
                <br />
                Billing inquiries:{" "}
                <a href="mailto:billing@agentrunway.ca" className="text-blue-400 hover:text-blue-300">
                  billing@agentrunway.ca
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
