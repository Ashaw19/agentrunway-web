import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Agent Runway collects, uses, and protects your personal information under Canadian privacy law (PIPEDA).",
  alternates: {
    canonical: "https://agentrunway.ca/privacy",
  },
  robots: { index: false, follow: false },
};

const LAST_UPDATED = "April 25, 2026";
const EFFECTIVE_DATE = "April 25, 2026";

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
              Last updated: {LAST_UPDATED} &middot; Effective: {EFFECTIVE_DATE}
            </p>
            <p className="mt-5 text-base leading-relaxed text-slate-400">
              Agent Runway (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or
              &ldquo;our&rdquo;) is committed to protecting the privacy of our
              users. This Privacy Policy explains what information we collect,
              how we use it, how we protect it, and what rights you have under
              Canada&apos;s{" "}
              <em>
                Personal Information Protection and Electronic Documents Act
              </em>{" "}
              (PIPEDA), applicable provincial privacy laws (including
              Quebec&apos;s Law&nbsp;25), and other data protection frameworks
              that may apply to you.
            </p>
            <p className="mt-3 text-base leading-relaxed text-slate-400">
              This policy applies to all users of the Agent Runway web
              application (agentrunway.ca), mobile-optimized web experience, and related
              services. By using the Service, you consent to the collection,
              use, and disclosure of your information as described in this
              policy.
            </p>
            <div className="mt-5 rounded-lg border border-blue-800/40 bg-blue-950/30 p-4 text-sm leading-relaxed text-blue-100/90">
              <strong className="text-white">Notice (April 16, 2026):</strong>{" "}
              On April 16, 2026, the Agent Runway business transitioned from
              a sole proprietorship to{" "}
              <strong className="text-white">Agent Runway Inc.</strong>, a
              Canadian federal corporation incorporated under the{" "}
              <em>Canada Business Corporations Act</em> (Canada Corporation
              No.&nbsp;1786542-2), with its registered office in the Province
              of New Brunswick, Canada. The data controller for personal
              information is Agent Runway Inc. as of this date.
            </div>
            <p className="mt-3 text-base leading-relaxed text-slate-400">
              This policy is designed to reflect the{" "}
              <strong className="text-slate-300">
                10 fair information principles
              </strong>{" "}
              set out in Schedule&nbsp;1 of PIPEDA: accountability, identifying
              purposes, consent, limiting collection, limiting use/disclosure/retention,
              accuracy, safeguards, openness, individual access, and challenging
              compliance. We are committed to upholding each of these principles
              in our handling of your personal information.
            </p>
          </div>

          {/* Policy content */}
          <div className="space-y-10 text-slate-300">

            {/* ─── 1 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                1. Who We Are
              </h2>
              <p className="leading-relaxed">
                Agent Runway is a software-as-a-service product operated by{" "}
                <strong className="text-slate-300">Agent Runway Inc.</strong>,
                a corporation incorporated under the Canada Business
                Corporations Act (Canada Corporation No.&nbsp;1786542-2), with
                its registered office in the Province of New Brunswick, Canada.
                Agent Runway Inc. is the data controller responsible for your
                personal information. You can reach us at{" "}
                <a
                  href="mailto:privacy@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  privacy@agentrunway.ca
                </a>{" "}
                for all privacy-related inquiries.
              </p>
            </section>

            {/* ─── 2 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                2. Information We Collect
              </h2>
              <p className="mb-4 leading-relaxed">
                We collect and process the following categories of information:
              </p>

              <h3 className="mb-2 mt-6 text-lg font-semibold text-slate-200">
                2.1 Information You Provide Directly
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Account information</strong>{" "}
                  — email address and password (stored as a secure bcrypt hash)
                  when you create an account.
                </li>
                <li>
                  <strong className="text-slate-300">Profile and settings</strong>{" "}
                  — display name, province, brokerage split, annual income goal,
                  transaction goal, experience years, and other preferences.
                </li>
                <li>
                  <strong className="text-slate-300">Business data</strong>{" "}
                  — transactions, gross commission income (GCI) figures, commission
                  details, pipeline deals, client records (names, emails, phones,
                  notes, tags), expenses, receipts, and goals.
                </li>
                <li>
                  <strong className="text-slate-300">Client personal information</strong>{" "}
                  — when you use Agent Runway&apos;s client relationship management
                  (CRM) features, you may enter personal information about your own
                  real estate clients (names, emails, phones, notes). You are the data
                  controller for this client data and are responsible for ensuring
                  you have appropriate consent from your clients and legal basis to
                  store and disclose it. Do not enter any more client information
                  than strictly necessary for your use of the Service.
                </li>
                <li>
                  <strong className="text-slate-300">Communications</strong>{" "}
                  — support requests, feedback, and correspondence you send to us.
                </li>
                <li>
                  <strong className="text-slate-300">AI interactions</strong>{" "}
                  — prompts, queries, and inputs you provide to AI features,
                  including chat messages and outreach editing.
                </li>
              </ul>

              <h3 className="mb-2 mt-6 text-lg font-semibold text-slate-200">
                2.2 Information Collected Through Integrations
              </h3>
              <p className="leading-relaxed text-slate-400">
                Agent Runway does not currently retrieve personal information
                from third-party integrations. Bank-account connectivity (via
                Plaid) is a{" "}
                <strong className="text-slate-300">planned future capability</strong>
                {" "}and is not currently offered. If and when such integrations
                are made available, this section will be updated and you will
                be notified in accordance with Section&nbsp;21 before any new
                category of personal information is collected.
              </p>

              <h3 className="mb-2 mt-6 text-lg font-semibold text-slate-200">
                2.3 Information Collected Automatically
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Usage data</strong>{" "}
                  — page views, feature usage, interaction events, session
                  duration, and navigation paths, collected via analytics software
                  to help us improve the product. This data is aggregated and does
                  not directly identify you.
                </li>
                <li>
                  <strong className="text-slate-300">Device and technical data</strong>{" "}
                  — browser type, operating system, device type, screen
                  resolution, IP address, and referring URL.
                </li>
                <li>
                  <strong className="text-slate-300">Log data</strong>{" "}
                  — server logs including timestamps, API requests, error reports,
                  and authentication events for security and operational purposes.
                </li>
              </ul>

              <h3 className="mb-2 mt-6 text-lg font-semibold text-slate-200">
                2.4 Information We Do NOT Collect
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>Payment card numbers, CVVs, or expiry dates (handled solely by Stripe)</li>
                <li>Banking login credentials (the Service does not collect, transmit, or store any banking credentials)</li>
                <li>Social Insurance Numbers (SIN) or government-issued ID numbers</li>
                <li>Biometric data</li>
                <li>Health or medical information</li>
              </ul>
            </section>

            {/* ─── 3 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                3. How We Use Your Information
              </h2>
              <p className="mb-4 leading-relaxed">
                We use your information for the following purposes:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>To create and manage your account and authenticate your identity</li>
                <li>To deliver the features of Agent Runway (dashboards, forecasts, reports, CRM, Flight Crew)</li>
                <li>To process subscription payments and send billing confirmations</li>
                <li>To generate AI-powered insights, outreach drafts, and recommendations using your business data</li>
                <li>To respond to support requests and communications</li>
                <li>To improve and develop the product based on aggregated usage patterns</li>
                <li>To send important service notifications (security updates, policy changes, billing alerts)</li>
                <li>To detect, prevent, and address fraud, abuse, security incidents, and technical issues</li>
                <li>To comply with legal obligations and enforce our Terms of Service</li>
              </ul>
              <p className="mt-4 leading-relaxed font-semibold text-white">
                We do NOT use your information to:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>Sell your personal information or business data to third parties</li>
                <li>Build advertising profiles or target you with third-party ads</li>
                <li>Train general-purpose AI or machine-learning models on your data</li>
                <li>Share your financial data with your brokerage, competitors, or any third party (we do not share your financial data, except with the limited service providers listed in Section&nbsp;9 strictly to operate the Service)</li>
                <li>Send unsolicited marketing communications (you may opt in to product updates separately)</li>
              </ul>
            </section>

            {/* ─── 4 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                4. Consent and Legal Basis for Processing
              </h2>
              <p className="mb-4 leading-relaxed">
                Under PIPEDA, we process your personal information based on the
                following grounds:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Express consent</strong>{" "}
                  — for sensitive data processing, including transmitting
                  business data to AI providers (Anthropic and Groq) and sending
                  outreach communications on your behalf. Express consent is
                  obtained through affirmative action (e.g., clicking
                  &ldquo;Send&rdquo;) after you have been informed of what data
                  will be processed and by whom.
                </li>
                <li>
                  <strong className="text-slate-300">Implied consent</strong>{" "}
                  — for processing that is reasonably expected as part of the
                  Service you have signed up for, such as storing your business
                  data, computing dashboards and reports, and sending essential
                  service notifications (security alerts, billing receipts,
                  policy change notices).
                </li>
                <li>
                  <strong className="text-slate-300">Contractual necessity</strong>{" "}
                  — processing required to fulfill our contract with you (the
                  Terms of Service), including account management, payment
                  processing, and feature delivery.
                </li>
                <li>
                  <strong className="text-slate-300">
                    Exceptions without consent (PIPEDA s.&nbsp;7)
                  </strong>{" "}
                  — in limited circumstances, we may process personal information
                  without consent where permitted by law: to comply with a court
                  order or subpoena, to comply with a lawful request from a
                  government institution, to investigate a breach of an agreement or
                  contravention of law, to detect or prevent fraud, or where
                  required to protect the safety of an individual.
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                In this section, &ldquo;process&rdquo; or &ldquo;processing&rdquo;
                includes the collection, use, or disclosure of information, as
                applicable. You may withdraw consent at any time by disconnecting
                integrations, adjusting your settings, or contacting{" "}
                <a
                  href="mailto:privacy@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  privacy@agentrunway.ca
                </a>
                . Withdrawal of consent may affect your ability to use certain
                features. We will explain the consequences of withdrawal before
                finalizing your request.
              </p>

              <h3 className="mb-2 mt-6 text-lg font-semibold text-slate-200">
                4.1 Meaningful Consent and Just-in-Time Notices
              </h3>
              <p className="leading-relaxed">
                Consistent with the Office of the Privacy Commissioner of
                Canada&apos;s (&ldquo;OPC&rdquo;){" "}
                <em>Guidelines for Obtaining Meaningful Consent</em>, we provide
                clear, specific information at the point of data collection
                (&ldquo;just-in-time&rdquo; notices) so you can make informed
                decisions. Before you use AI features for the first time or
                send outreach communications, the Service will clearly
                disclose: what data will
                be collected, who will process it, where it will be processed
                (including if outside Canada), and how to disconnect or withdraw
                consent. We do not bundle consent for unrelated purposes or use
                deceptive design patterns.
              </p>

              <h3 className="mb-2 mt-6 text-lg font-semibold text-slate-200">
                4.2 CASL Compliance for Communications
              </h3>
              <p className="leading-relaxed">
                When you use Agent Runway&apos;s outreach features to send
                communications to your clients, Canada&apos;s Anti-Spam
                Legislation (CASL) applies. You are solely responsible for
                ensuring you have express or implied consent from each recipient
                before sending any commercial electronic message. Agent Runway
                provides communication tools but does not verify recipient
                consent. See our{" "}
                <a href="/terms" className="text-blue-400 hover:text-blue-300 underline">
                  Terms of Service (Section&nbsp;18)
                </a>{" "}
                for your full CASL obligations.
              </p>
            </section>

            {/* ─── 5 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                5. Data Storage and Security
              </h2>
              <p className="mb-4 leading-relaxed">
                Your data is stored using{" "}
                <strong className="text-slate-300">Supabase</strong>, a managed
                database platform hosted on Amazon Web Services in the{" "}
                <strong className="text-slate-300">
                  Canada (ca-central-1) region
                </strong>
                .{" "}
                <strong className="text-white">
                  Your data is stored in Canada.
                </strong>
              </p>
              <p className="mb-4 leading-relaxed">
                We implement the following security measures:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Encryption in transit</strong>{" "}
                  — TLS 1.3 for all connections
                </li>
                <li>
                  <strong className="text-slate-300">Encryption at rest</strong>{" "}
                  — AES-256 encryption for all stored data
                </li>
                <li>
                  <strong className="text-slate-300">Row-level security (RLS)</strong>{" "}
                  — enforced at the database level so your data is never accessible
                  to other users, even in the event of an application logic error
                </li>
                <li>
                  <strong className="text-slate-300">Access controls</strong>{" "}
                  — multi-factor authentication for production system access,
                  principle of least privilege
                </li>
                <li>
                  <strong className="text-slate-300">Password security</strong>{" "}
                  — bcrypt hashing; passwords are never stored in plaintext
                </li>
                <li>
                  <strong className="text-slate-300">Regular backups</strong>{" "}
                  — automated backups with point-in-time recovery
                </li>
                <li>
                  <strong className="text-slate-300">Monitoring</strong>{" "}
                  — active monitoring for unauthorized access and anomalous
                  activity
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                While we take reasonable measures to protect your information, no
                method of electronic storage or transmission is 100% secure. We
                cannot guarantee absolute security and are not liable for
                breaches beyond our reasonable control. See our{" "}
                <a href="/security" className="text-blue-400 hover:text-blue-300 underline">
                  Security page
                </a>{" "}
                for additional details.
              </p>
            </section>

            {/* ─── 6 ─── */}
            <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                6. Bank-Account Connectivity (Planned Feature)
              </h2>
              <p className="leading-relaxed text-slate-400">
                Bank-account connectivity is a{" "}
                <strong className="text-slate-200">planned future capability</strong>
                {" "}of Agent Runway and is{" "}
                <strong className="text-slate-200">not currently offered</strong>.
                Agent Runway does not currently retrieve, store, or process any
                banking information about you. If and when this feature becomes
                available, this Privacy Policy will be updated and you will be
                notified in accordance with Section&nbsp;21 (Changes to This
                Policy) before any banking data is collected.
              </p>
            </section>

            {/* ─── 7 ─── */}
            <section className="rounded-xl border border-purple-800/40 bg-purple-950/20 p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                7. AI and Automated Processing
              </h2>
              <p className="mb-4 leading-relaxed text-purple-100/80">
                Agent Runway uses AI Features powered by third-party large
                language model (LLM) providers. Our primary AI provider is{" "}
                <strong className="text-white">Anthropic, PBC</strong> (the
                Claude family of models), with{" "}
                <strong className="text-white">Groq, Inc.</strong> used as a
                fallback provider and for voice transcription. The following
                describes how your data is handled in connection with AI
                Features:
              </p>
              <ul className="list-disc space-y-3 pl-6 text-purple-100/80">
                <li>
                  <strong className="text-white">Data sent to AI providers.</strong>{" "}
                  When you use AI Features, relevant portions of your business
                  data (such as transaction summaries, client information, and
                  performance metrics) may be transmitted to third-party AI
                  providers to generate outputs. We transmit only the minimum
                  data necessary for the specific AI feature.
                </li>
                <li>
                  <strong className="text-white">No data retention by AI providers.</strong>{" "}
                  We select AI providers that contractually commit to not
                  retaining customer data after processing, and to not using
                  customer data for training their general models. However, we
                  cannot independently verify or guarantee third-party provider
                  compliance.
                </li>
                <li>
                  <strong className="text-white">No training on your data.</strong>{" "}
                  Agent Runway does not use your personal information, business
                  data, or client data to train, fine-tune, or improve any AI or
                  machine-learning models, whether our own or third-party models.
                </li>
                <li>
                  <strong className="text-white">AI logs.</strong>{" "}
                  We may retain logs of AI interactions (prompts and outputs) for
                  a limited period for debugging, quality assurance, and abuse
                  prevention purposes. These logs are subject to the same security
                  measures as the other information we outline in Section&nbsp;2.
                </li>
                <li>
                  <strong className="text-white">Automated decision-making.</strong>{" "}
                  Agent Runway does not make automated decisions with legal or
                  significant effects on you without human review. AI outputs
                  (insight cards, outreach drafts, insights) are presented as
                  suggestions for your review, not as automated actions. It is your
                  responsibility to review AI outputs thoroughly.
                </li>
                <li>
                  <strong className="text-white">AI-assisted development.</strong>{" "}
                  AI-assisted development tools are used in building the
                  platform. These tools process source code only and are never
                  provided access to user personal information.
                </li>
              </ul>
            </section>

            {/* ─── 9 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                8. Third-Party Market Data
              </h2>
              <p className="leading-relaxed">
                Agent Runway does not currently display third-party real estate
                market statistics inside the Service. This section is reserved
                for future market-data integrations and will be updated when
                applicable. No personal information about you is transmitted to
                any market-data provider.
              </p>
            </section>

            {/* ─── 10 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                9. Sharing Your Information
              </h2>
              <p className="mb-4 leading-relaxed font-semibold text-white">
                We do not sell your personal information.
              </p>
              <p className="mb-4 leading-relaxed">
                We may share data with the following categories of service
                providers, strictly to operate the Service:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Supabase</strong> — database
                  infrastructure (AWS ca-central-1, Canada)
                </li>
                <li>
                  <strong className="text-slate-300">Stripe, Inc.</strong> —
                  payment processing (PCI DSS Level&nbsp;1 certified). Agent
                  Runway does not handle payment card data.
                </li>
                <li>
                  <strong className="text-slate-300">Anthropic, PBC</strong>{" "}
                  — primary AI inference processing for AI Features (United States).
                  When you use AI features, relevant portions of your business data
                  are transmitted to Anthropic and processed by the Claude family of
                  large language models. Anthropic operates under a Data Processing
                  Agreement, commits to zero data retention for API traffic by
                  default, and does not use customer data to train its models. See
                  Section&nbsp;7 and Section&nbsp;10.
                </li>
                <li>
                  <strong className="text-slate-300">Groq, Inc.</strong>{" "}
                  — fallback AI inference and voice transcription (United States).
                  Groq is used as a fallback when Anthropic is unavailable, and for
                  speech-to-text on voice features. Groq operates under a Data
                  Processing Agreement and commits to not retaining or training on
                  customer data. See Section&nbsp;7 and Section&nbsp;10.
                </li>
                <li>
                  <strong className="text-slate-300">Vercel, Inc.</strong>{" "}
                  — application hosting and edge network infrastructure (United
                  States). Vercel hosts the Agent Runway web application and
                  processes HTTP requests; minimal request metadata (IP addresses,
                  request logs) may be processed on Vercel&apos;s infrastructure.
                </li>
                <li>
                  <strong className="text-slate-300">Analytics providers</strong>{" "}
                  — aggregated, non-personal usage data only (only if you have
                  accepted analytics cookies).
                </li>
                <li>
                  <strong className="text-slate-300">Email delivery</strong>{" "}
                  — transactional email service for password resets, billing
                  receipts, and service notifications.
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                We maintain signed{" "}
                <strong className="text-slate-300">
                  Data Processing Agreements (DPAs)
                </strong>{" "}
                with each sub-processor listed above. These agreements require
                each processor to: use personal information only for the
                specific purposes outlined, implement security safeguards
                comparable to our own, notify us promptly in the event of a
                data breach, return or delete personal information upon
                termination, and permit audit of their data handling practices.
              </p>
              <p className="mt-4 leading-relaxed">
                For a complete list of our sub-processors, including the data
                they process and their locations, see our{" "}
                <a href="/subprocessors" className="text-blue-400 hover:text-blue-300 underline">
                  Sub-Processors page
                </a>
                .
              </p>
              <p className="mt-4 leading-relaxed">
                We may also disclose information if: (a) required by law, court
                order, subpoena, or governmental authority; (b) necessary to
                protect the rights, property, or safety of Agent Runway, our
                users, or the public; (c) to enforce our Terms of Service; or
                (d) in connection with a merger, acquisition, or sale of assets,
                in which case your information would be subject to the privacy
                commitments made in this policy.
              </p>
            </section>

            {/* ─── 11 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                10. International Data Transfers
              </h2>
              <p className="mb-4 leading-relaxed">
                Your primary data is stored in Canada (AWS ca-central-1). However,
                some data may be processed outside Canada in the following
                circumstances:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Payment processing</strong>{" "}
                  — Stripe may process payment data in the United States.
                </li>
                <li>
                  <strong className="text-slate-300">AI processing</strong>{" "}
                  — third-party AI providers may process AI requests in the United
                  States or other jurisdictions.
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                When data is transferred outside Canada, we ensure that
                appropriate safeguards are in place through contractual
                commitments (Data Processing Agreements) from each service
                provider requiring them to protect personal information to a
                standard comparable to Canadian law. By using the Service and
                its integrations, you consent to these transfers to the extent
                required to provide the features you have enabled.
              </p>
              <p className="mt-4 leading-relaxed font-semibold text-slate-200">
                Important notice regarding US-based processing:
              </p>
              <p className="leading-relaxed">
                Data processed in the United States (by Anthropic, Groq, Stripe, Vercel,
                and other US-based sub-processors) is subject to United States
                law, including the{" "}
                <strong className="text-slate-300">
                  Clarifying Lawful Overseas Use of Data Act (CLOUD Act)
                </strong>{" "}
                and other US federal and state laws. This means that US
                authorities may, under certain circumstances, access data held
                by US-based companies regardless of where that data was
                originally collected or where the individual is located.{" "}
                <strong className="text-slate-300">
                  No contract can override a foreign government&apos;s legal
                  authority to access data under its own laws.
                </strong>{" "}
                We disclose this so you can make an informed decision about
                using integrations that involve US data processing.
              </p>
              <p className="mt-4 leading-relaxed">
                <strong className="text-slate-300">Alberta residents:</strong>{" "}
                If you have questions about Agent Runway&apos;s use of service
                providers outside Canada, you may contact our Privacy Officer at{" "}
                <a
                  href="mailto:privacy@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  privacy@agentrunway.ca
                </a>{" "}
                (Agent Runway Inc., New Brunswick, Canada), which is the
                designated representative responsible for answering questions
                about cross-border data transfers.
              </p>
            </section>

            {/* ─── 12 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                11. Team Accounts and Data Visibility
              </h2>
              <p className="mb-4 leading-relaxed">
                If you participate in a Team Account:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Team Leaders</strong> may
                  view aggregated and individual Team Member performance data to
                  the extent enabled by the platform&apos;s permission settings.
                </li>
                <li>
                  <strong className="text-slate-300">Team Members</strong>{" "}
                  acknowledge and consent to this data visibility by accepting the
                  Terms of Service.
                </li>
                <li>
                  The <strong className="text-slate-300">Team Leader</strong> is
                  an independent data controller for Team Member data they access
                  and is responsible for their own compliance with privacy laws.
                </li>
                <li>
                  Agent Runway acts as a data processor when processing Team
                  Member data on behalf of the Team Leader.
                </li>
              </ul>
            </section>

            {/* ─── 13 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                12. Your Privacy Rights
              </h2>
              <p className="mb-4 leading-relaxed">
                Under PIPEDA and applicable provincial laws, you have the
                following rights:
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
                  <strong className="text-slate-300">Withdrawal of consent</strong>{" "}
                  — withdraw your consent for non-essential uses of your data at
                  any time, including disconnecting integrations. Withdrawal of
                  consent may affect your ability to use certain features.
                </li>
                <li>
                  <strong className="text-slate-300">Deletion</strong> — request
                  deletion of your account and associated data.
                </li>
                <li>
                  <strong className="text-slate-300">Data export / portability</strong>{" "}
                  — request a copy of your data in a structured, commonly used,
                  machine-readable format (CSV or JSON). We are developing a
                  self-serve &ldquo;Download My Data&rdquo; feature in your
                  account settings. In the interim, email{" "}
                  <a
                    href="mailto:privacy@agentrunway.ca"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    privacy@agentrunway.ca
                  </a>{" "}
                  and we will provide your data export within 30 days at no cost.
                </li>
                <li>
                  <strong className="text-slate-300">
                    Object to processing
                  </strong>{" "}
                  — object to specific uses of your data where you believe those
                  uses are not necessary for the Service or where your rights
                  outweigh the processing purpose.
                </li>
                <li>
                  <strong className="text-slate-300">Complaint</strong> — file a
                  complaint with the Office of the Privacy Commissioner of Canada
                  if you believe your rights have been violated.
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
                . We will verify your identity and respond within 30 days.
                We will not charge a fee for reasonable access requests. We will
                not discriminate against you for exercising your privacy rights.
              </p>
            </section>

            {/* ─── 14 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                13. Quebec Residents (Law 25)
              </h2>
              <p className="mb-4 leading-relaxed">
                If you are a resident of Quebec, you have additional rights under{" "}
                <em>
                  Loi 25 (Act respecting the protection of personal information
                  in the private sector)
                </em>
                , including:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Data portability</strong> —
                  the right to have your personal information communicated to you
                  or transferred to another organization in a structured, commonly
                  used technological format.
                </li>
                <li>
                  <strong className="text-slate-300">
                    Automated decision-making (Law 25, s. 12.1)
                  </strong>{" "}
                  — Agent Runway&apos;s Flight Crew feature uses automated
                  processing of your personal business data (GCI, pipeline
                  metrics, expense ratios, activity data) to generate
                  insights and recommendations presented to you. Under
                  Quebec&apos;s Law 25, you have the right to: (a) be informed
                  that a decision or recommendation was generated using
                  automated processing; (b) request a list of the personal
                  information used and the principal factors and parameters
                  that influenced the output; and (c) submit your observations
                  to a human representative at Agent Runway and request that
                  the decision be reconsidered by a person. All AI outputs in
                  Agent Runway are clearly labeled as AI-generated and are
                  presented for your review — no automated action is taken
                  without your explicit approval. To exercise these rights,
                  contact{" "}
                  <a
                    href="mailto:privacy@agentrunway.ca"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    privacy@agentrunway.ca
                  </a>
                  .
                </li>
                <li>
                  <strong className="text-slate-300">
                    De-indexing
                  </strong>{" "}
                  — the right to request de-indexing of personal information from
                  any hyperlink attached to your name where dissemination of that
                  information contravenes the law or a court order.
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                Quebec residents may contact the{" "}
                <a
                  href="https://www.cai.gouv.qc.ca/en/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  Commission d&apos;acc&egrave;s &agrave; l&apos;information (CAI)
                </a>{" "}
                with privacy concerns.
              </p>
            </section>

            {/* ─── 15 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                14. California Residents (CCPA/CPRA)
              </h2>
              <p className="mb-4 leading-relaxed">
                If you are a California resident, the California Consumer Privacy
                Act (CCPA) and California Privacy Rights Act (CPRA) provide you
                with additional rights:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Right to know</strong> —
                  request disclosure of the categories and specific pieces of
                  personal information we have collected about you.
                </li>
                <li>
                  <strong className="text-slate-300">Right to delete</strong> —
                  request deletion of your personal information, subject to
                  exceptions.
                </li>
                <li>
                  <strong className="text-slate-300">Right to opt-out of sale</strong> —
                  we do not sell personal information. No opt-out is necessary.
                </li>
                <li>
                  <strong className="text-slate-300">Right to non-discrimination</strong> —
                  we will not discriminate against you for exercising your CCPA
                  rights.
                </li>
                <li>
                  <strong className="text-slate-300">Right to correct</strong> —
                  request correction of inaccurate personal information.
                </li>
                <li>
                  <strong className="text-slate-300">Right to limit use of sensitive personal information</strong> —
                  we do not use or disclose sensitive personal information for
                  purposes other than those allowed under CCPA.
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                To exercise these rights, email{" "}
                <a
                  href="mailto:privacy@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  privacy@agentrunway.ca
                </a>{" "}
                with the subject line &ldquo;CCPA Request.&rdquo;
              </p>
            </section>

            {/* ─── 16 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                15. European Residents (GDPR)
              </h2>
              <p className="mb-4 leading-relaxed">
                If you are located in the European Economic Area (EEA), the
                United Kingdom, or Switzerland, you may have additional rights
                under the General Data Protection Regulation (GDPR) or equivalent
                legislation, including the rights to access, rectification,
                erasure, restriction of processing, data portability, and
                objection. You also have the right to lodge a complaint with your
                local supervisory authority.
              </p>
              <p className="leading-relaxed">
                Our legal bases for processing your data are described in
                Section&nbsp;4. For international data transfers, see
                Section&nbsp;10. To exercise your GDPR rights, contact{" "}
                <a
                  href="mailto:privacy@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  privacy@agentrunway.ca
                </a>
                .
              </p>
            </section>

            {/* ─── 17 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                16. Data Retention
              </h2>
              <p className="mb-4 leading-relaxed">
                We retain your data according to the following schedule:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Active accounts</strong> —
                  data is retained for as long as your account is active.
                </li>
                <li>
                  <strong className="text-slate-300">Account deletion</strong> —
                  personal information and business data are removed within 30
                  days of account deletion, except where retention is required by
                  law.
                </li>
                <li>
                  <strong className="text-slate-300">Billing records</strong> —
                  retained for 7 years per Canadian tax requirements.
                </li>
                <li>
                  <strong className="text-slate-300">AI interaction logs</strong>{" "}
                  — retained for up to 90 days for debugging and quality
                  assurance, then deleted.
                </li>
                <li>
                  <strong className="text-slate-300">Server logs</strong> —
                  retained for up to 90 days for security and operational purposes.
                </li>
                <li>
                  <strong className="text-slate-300">Analytics data</strong> —
                  aggregated usage data may be retained indefinitely in
                  de-identified form.
                </li>
              </ul>
            </section>

            {/* ─── 18 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                17. Children&apos;s Privacy
              </h2>
              <p className="leading-relaxed">
                The Service is not intended for individuals under the age of 18.
                We do not knowingly collect personal information from children
                under 18. If we become aware that a child under 18 has provided
                us with personal information, we will take steps to delete that
                information promptly. If you believe a child has provided us with
                personal information, please contact us at{" "}
                <a
                  href="mailto:privacy@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  privacy@agentrunway.ca
                </a>
                .
              </p>
            </section>

            {/* ─── 19 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                18. Cookies and Tracking Technologies
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway uses the following types of cookies and tracking
                technologies:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Essential cookies</strong> —
                  required for authentication, session management, and core
                  functionality. These cannot be disabled without breaking the
                  Service.
                </li>
                <li>
                  <strong className="text-slate-300">Analytics cookies</strong> —
                  used to measure aggregate page views, feature usage, and user
                  flows to help us improve the product. You may accept or decline
                  these via our cookie banner.
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                We do not use advertising cookies, tracking pixels for ad
                retargeting, or cross-site tracking technologies. You may
                configure your browser to refuse optional analytics cookies. Our
                cookie preferences are stored locally and can be changed at any
                time. Refer to our{" "}
                <a href="/cookie-policy" className="text-blue-400 hover:text-blue-300 underline">
                  Cookie Policy
                </a>{" "}
                for more information.
              </p>
            </section>

            {/* ─── 20 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                19. Do Not Track Signals
              </h2>
              <p className="leading-relaxed">
                Some browsers transmit &ldquo;Do Not Track&rdquo; (DNT) signals.
                As there is no industry-standard technology for recognizing or
                honoring DNT signals, we do not currently respond to them.
                However, we limit tracking to essential cookies as described in
                Section&nbsp;18 and do not engage in cross-site tracking.
              </p>
            </section>

            {/* ─── 21 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                20. Data Breach Notification and Response
              </h2>
              <p className="mb-4 leading-relaxed">
                Under PIPEDA Section&nbsp;10.1, organizations must report
                breaches of security safeguards that create a{" "}
                <strong className="text-slate-300">
                  &ldquo;real risk of significant harm&rdquo; (RROSH)
                </strong>{" "}
                to affected individuals and to the OPC. Given the sensitivity of
                the data Agent Runway processes (financial records, bank
                connection data, CRM contacts), we take this obligation
                seriously.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-slate-200">
                Breach Response Plan
              </h3>
              <p className="mb-4 leading-relaxed">
                Agent Runway maintains a documented breach response plan that
                includes the following steps:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400">
                <li>
                  <strong className="text-slate-300">Detection and containment</strong>{" "}
                  — immediately isolate affected systems, revoke compromised
                  credentials, and engage security expertise to stop the breach
                </li>
                <li>
                  <strong className="text-slate-300">Assessment</strong>{" "}
                  — determine what personal information was involved, the
                  sensitivity of that information, the number of affected
                  individuals, and whether the breach creates a real risk of
                  significant harm (financial loss, identity theft, damage to
                  reputation, or other harm)
                </li>
                <li>
                  <strong className="text-slate-300">OPC notification</strong>{" "}
                  — if the breach meets the RROSH threshold, report to the{" "}
                  <strong className="text-slate-300">
                    Office of the Privacy Commissioner of Canada
                  </strong>{" "}
                  using the prescribed form, as soon as feasible
                </li>
                <li>
                  <strong className="text-slate-300">Individual notification</strong>{" "}
                  — notify affected users as soon as feasible, including: a
                  description of the breach, the types of personal information
                  involved, what we have done to address it, what steps you can
                  take to protect yourself, and contact information for questions
                </li>
                <li>
                  <strong className="text-slate-300">Third-party notification</strong>{" "}
                  — if another organization or government institution can reduce
                  the risk of harm, we will notify them as well
                </li>
                <li>
                  <strong className="text-slate-300">Remediation</strong>{" "}
                  — address the root cause, implement additional safeguards, and
                  update our security practices to prevent recurrence
                </li>
              </ul>

              <h3 className="mb-2 mt-6 text-lg font-semibold text-slate-200">
                Breach Record Keeping
              </h3>
              <p className="mb-4 leading-relaxed">
                We maintain records of{" "}
                <strong className="text-slate-300">all</strong> breaches of
                security safeguards — including breaches that do not meet the
                RROSH threshold for notification — for a minimum of{" "}
                <strong className="text-slate-300">24 months</strong>, as
                required under PIPEDA. These records include: the date of the
                breach, a description of the circumstances, the personal
                information involved, our risk assessment, and the actions
                taken. These records are available to the OPC upon request.
              </p>

              <h3 className="mb-2 mt-6 text-lg font-semibold text-slate-200">
                Quebec Residents
              </h3>
              <p className="leading-relaxed">
                For Quebec residents, we will additionally report qualifying
                breaches to the{" "}
                <strong className="text-slate-300">
                  Commission d&apos;acc&egrave;s &agrave; l&apos;information
                  (CAI)
                </strong>{" "}
                if the breach creates a risk of serious injury, and maintain an
                incident register as required under Law&nbsp;25.
              </p>
            </section>

            {/* ─── 22 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                21. Changes to This Policy
              </h2>
              <p className="leading-relaxed">
                We may update this Privacy Policy from time to time. Material
                changes will be communicated via email to the address on your
                account or through an in-app notification at least 30 days before
                they take effect. The &ldquo;Last updated&rdquo; date at the top
                of this page indicates the most recent revision. Continued use of
                Agent Runway after the effective date of a change constitutes
                acceptance of the revised policy. If you do not agree with a
                change, you must stop using the Service and delete your account
                before the change takes effect.
              </p>
            </section>

            {/* ─── 23 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                22. Privacy Impact Assessments
              </h2>
              <p className="leading-relaxed">
                Agent Runway conducts Privacy Impact Assessments (PIAs) before
                introducing new features or integrations that involve the
                collection or processing of sensitive personal information. This
                currently includes our AI-powered features (which transmit
                business data to third-party providers). PIAs evaluate: the
                necessity and proportionality of the data collection, the risks
                to individuals, the safeguards in place to mitigate those
                risks, and whether alternatives exist that are less
                privacy-intrusive. A PIA will be completed for any future
                integration (such as planned bank-account connectivity) before
                that integration is offered to users. We review and update our
                PIAs when material changes are made to data processing
                activities.
              </p>
            </section>

            {/* ─── 24 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                23. Evolving Canadian Privacy Legislation
              </h2>
              <p className="leading-relaxed">
                Agent Runway actively monitors developments in Canadian privacy
                law. We are committed to adapting our privacy practices as
                Canadian privacy law evolves. When material changes to our data
                processing practices are required by new legislation, we will
                update this policy and notify you in accordance with
                Section&nbsp;21.
              </p>
            </section>

            {/* ─── 25 ─── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                24. Contact Us
              </h2>
              <p className="leading-relaxed">
                For questions about this policy, to exercise your privacy rights,
                or to file a privacy complaint, contact:
              </p>
              <address className="mt-4 not-italic text-slate-400">
                <strong className="text-slate-300">Agent Runway Inc.</strong>
                <br />
                Privacy Officer: Andrew Shaw
                <br />
                Email:{" "}
                <a
                  href="mailto:andrew@agentrunway.ca"
                  className="text-blue-400 hover:text-blue-300"
                >
                  andrew@agentrunway.ca
                </a>
                <br />
                Registered office: New Brunswick, Canada
                <br />
                Canada Corporation No. 1786542-2
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
                . California residents may contact the{" "}
                <a
                  href="https://oag.ca.gov/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  California Attorney General
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
