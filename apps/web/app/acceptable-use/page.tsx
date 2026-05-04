import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description: "Rules governing acceptable use of the Agent Runway platform.",
  alternates: { canonical: "https://agentrunway.ca/acceptable-use" },
  robots: { index: false, follow: false },
};

const LAST_UPDATED = "April 25, 2026";

/* -------------------------------------------------------------------------- */

export default function AcceptableUsePage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <MarketingNav />

      <main className="flex-1 px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Acceptable Use Policy
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              Last updated: {LAST_UPDATED}
            </p>
            <p className="mt-5 text-base leading-relaxed text-slate-400">
              This Acceptable Use Policy (&ldquo;AUP&rdquo;) governs your use
              of the Agent Runway platform and all related services. It
              supplements our{" "}
              <a
                href="/terms"
                className="text-blue-400 underline hover:text-blue-300"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="/privacy"
                className="text-blue-400 underline hover:text-blue-300"
              >
                Privacy Policy
              </a>
              . By accessing or using Agent Runway, you agree to comply with
              this AUP. Capitalized terms not defined here have the meanings
              given in the Terms of Service.
            </p>
          </div>

          {/* Policy content */}
          <div className="space-y-10 text-slate-300">
            {/* ──────────────────────── 1 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                1. Purpose
              </h2>
              <p className="leading-relaxed">
                Agent Runway provides business analytics, client relationship
                management, and AI-powered tools designed for licensed real
                estate professionals. This Acceptable Use Policy exists to
                ensure a safe, professional, and lawful environment for all
                users. It supplements and is incorporated into our{" "}
                <a
                  href="/terms"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  Terms of Service
                </a>
                . Any violation of this AUP constitutes a violation of the Terms
                of Service.
              </p>
            </section>

            {/* ──────────────────────── 2 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                2. General Conduct
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway is a professional tool built for real estate
                agents. You are expected to use the platform in a manner
                consistent with the standards of the real estate industry and
                applicable law. You agree to:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Use the Service only for lawful, legitimate business purposes
                  related to your real estate practice.
                </li>
                <li>
                  Provide accurate and truthful information in your account
                  profile and any data you enter into the platform.
                </li>
                <li>
                  Treat all interactions through the platform&mdash;including
                  AI-generated communications sent to clients&mdash;with the
                  same professional care you would apply to any client-facing
                  correspondence.
                </li>
                <li>
                  Comply with all applicable federal, provincial, state, and
                  local laws, regulations, and industry standards.
                </li>
                <li>
                  Respect the intellectual property rights of Agent Runway and
                  third parties.
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                Agent Runway is provided for use only by persons located in
                Canada, and is not intended for use in any jurisdiction where
                its use is not permitted. If you access Agent Runway from
                outside Canada, you do so at your own risk and you are
                responsible for compliance with the local laws of your
                jurisdiction.
              </p>
            </section>

            {/* ──────────────────────── 3 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                3. Prohibited Activities
              </h2>
              <p className="mb-4 leading-relaxed">
                You may not use the Service to engage in any of the following
                activities. This list is illustrative and not exhaustive; Agent
                Runway reserves the right to determine, in its sole discretion,
                what constitutes a violation.
              </p>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                3.1 Illegal and Unauthorized Use
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Using the Service for any activity that violates applicable
                  law, including fraud, money laundering, or any activity
                  related to proceeds of crime.
                </li>
                <li>
                  Accessing, or attempting to access, accounts, systems, or data
                  that you are not authorized to access (including other
                  users&apos; accounts).
                </li>
                <li>
                  Attempting to probe, scan, or test the vulnerability of the
                  Service or any associated system, or to breach any security or
                  authentication measures.
                </li>
                <li>
                  Circumventing, disabling, or otherwise interfering with any
                  security, rate-limiting, or access-control features of the
                  Service.
                </li>
              </ul>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                3.2 Reverse Engineering and Scraping
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Reverse engineering, decompiling, disassembling, or otherwise
                  attempting to derive the source code, algorithms, or data
                  models of the Service or any underlying technology.
                </li>
                <li>
                  Using any automated tool, robot, spider, scraper, or data
                  mining technique to access, collect, copy, or monitor any
                  portion of the Service or its content without prior written
                  consent.
                </li>
                <li>
                  Crawling or indexing the Service for purposes of building a
                  competing product or service.
                </li>
              </ul>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                3.3 Reselling and Sublicensing
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Reselling, sublicensing, leasing, or otherwise making the
                  Service available to any third party outside of your
                  authorized account, except as expressly permitted under a
                  Teams plan.
                </li>
                <li>
                  Sharing login credentials with anyone who is not an authorized
                  user on your account.
                </li>
              </ul>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                3.4 Service Interference
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Taking any action that imposes, or may impose, an
                  unreasonable or disproportionately large load on our
                  infrastructure.
                </li>
                <li>
                  Interfering with or disrupting the integrity or performance of
                  the Service, including through denial-of-service attacks or
                  similar methods.
                </li>
                <li>
                  Uploading, distributing, or transmitting any virus, worm,
                  trojan, ransomware, spyware, adware, or other malicious code.
                </li>
              </ul>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                3.5 Impersonation and Misrepresentation
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Impersonating any person or entity, or falsely claiming an
                  affiliation with any person, organization, or entity.
                </li>
                <li>
                  Creating accounts under false or misleading identities.
                </li>
                <li>
                  Misrepresenting your licensing status, brokerage affiliation,
                  or professional qualifications.
                </li>
              </ul>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                3.6 Harassment and Discrimination
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Harassing, threatening, intimidating, or stalking any
                  individual, including other users, clients, or Agent Runway
                  staff.
                </li>
                <li>
                  Using the Service to engage in discrimination on the basis of
                  race, colour, national origin, religion, sex, gender identity,
                  sexual orientation, disability, familial status, age, or any
                  other characteristic protected by applicable law.
                </li>
                <li>
                  Uploading or transmitting content that is defamatory, obscene,
                  hateful, or promotes violence.
                </li>
              </ul>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                3.7 Prohibited Data Storage
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Storing your (or your client&apos;s) sensitive personal
                  information that the platform is not designed to handle,
                  including but not limited to: protected health information
                  (PHI), medical records, credit card numbers, full bank account
                  numbers, Social Insurance Numbers (SIN), Social Security
                  Numbers (SSN), passport numbers, or government-issued
                  identification numbers.
                </li>
                <li>
                  The platform is designed for business data related to real
                  estate transactions and client relationship management. You
                  are responsible for ensuring that the data you enter is
                  appropriate for the platform.
                </li>
              </ul>
            </section>

            {/* ──────────────────────── 4 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                4. AI Feature Usage Rules
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway includes AI-powered features that generate content,
                insights, recommendations, and draft communications. The
                following rules apply to all use of AI Features:
              </p>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                4.1 Prohibited AI Uses
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  <strong className="text-slate-300">
                    No discriminatory use.
                  </strong>{" "}
                  You may not use AI Features in a manner that discriminates
                  against any individual or group on the basis of any protected
                  characteristic, including using AI outputs to steer, exclude,
                  or unfairly target clients.
                </li>
                <li>
                  <strong className="text-slate-300">
                    No impersonation.
                  </strong>{" "}
                  You may not use AI Features to generate content that
                  impersonates another person, organization, or entity, or that
                  misrepresents the origin or authorship of communications.
                </li>
                <li>
                  <strong className="text-slate-300">
                    No fraudulent or deceptive content.
                  </strong>{" "}
                  You may not use AI Features to create false, misleading,
                  fraudulent, or deceptive content, including fabricated
                  property details, fake testimonials, misleading market data,
                  or fraudulent offers.
                </li>
                <li>
                  <strong className="text-slate-300">
                    No illegal purposes.
                  </strong>{" "}
                  You may not use AI Features for any purpose that is illegal
                  under applicable law, including generating content that
                  facilitates fraud, money laundering, or violations of fair
                  housing laws.
                </li>
                <li>
                  <strong className="text-slate-300">
                    No circumvention of safety controls.
                  </strong>{" "}
                  You may not attempt to bypass, circumvent, manipulate, or
                  override any safety controls, content filters, or moderation
                  systems built into the AI Features.
                </li>
              </ul>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                4.2 Human Review Requirement
              </h3>
              <p className="leading-relaxed">
                <strong className="text-slate-300">
                  You must review all AI-generated content before sending,
                  publishing, or otherwise distributing it.
                </strong>{" "}
                AI-drafted emails, messages, outreach content, and any other
                communications must be reviewed by you for accuracy,
                appropriateness, and compliance with applicable law and industry
                standards before they are sent to any recipient. Agent Runway
                does not guarantee the accuracy, completeness, or suitability
                of any AI-generated content.
              </p>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                4.3 Responsibility for AI Output
              </h3>
              <p className="leading-relaxed">
                You are solely responsible for any AI-generated content that you
                choose to use, send, publish, or act upon. Agent Runway
                provides AI Features as tools to assist your workflow; the final
                decision to use any AI output is yours, and you bear full
                responsibility for the consequences of that decision. This
                includes any legal, regulatory, or professional liability
                arising from AI-generated content.
              </p>
            </section>

            {/* ──────────────────────── 5 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                5. Communication Features (CASL / Anti-Spam Compliance)
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway may provide features that enable you to send
                emails, messages, or other communications to your clients and
                contacts. When using these features, you are solely responsible
                for compliance with all applicable anti-spam and electronic
                messaging laws, including but not limited to:
              </p>
              <ul className="mb-4 list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  <strong className="text-slate-300">
                    Canada&apos;s Anti-Spam Legislation (CASL)
                  </strong>
                </li>
                <li>
                  <strong className="text-slate-300">
                    The U.S. CAN-SPAM Act
                  </strong>
                </li>
                <li>
                  <strong className="text-slate-300">
                    The U.S. Telephone Consumer Protection Act (TCPA)
                  </strong>
                </li>
                <li>
                  Any other applicable federal, provincial, state, or local
                  anti-spam or electronic communication laws.
                </li>
              </ul>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                5.1 Consent Requirements
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  You must obtain proper consent&mdash;either express or implied
                  as defined by applicable law&mdash;before sending any
                  commercial electronic message (CEM) to any recipient through
                  the platform.
                </li>
                <li>
                  You are responsible for maintaining records of consent,
                  including how and when consent was obtained, and for producing
                  such records if required by a regulatory authority.
                </li>
                <li>
                  You must honour all unsubscribe and opt-out requests promptly
                  and within the time frames required by law (no more than 10
                  business days under CASL).
                </li>
              </ul>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                5.2 Message Requirements
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  All messages sent through the platform must include proper
                  sender identification, including your name, the name of the
                  person or business on whose behalf the message is sent, and
                  valid contact information (mailing address, phone number, or
                  email).
                </li>
                <li>
                  All commercial electronic messages must include a clear,
                  functioning, and easy-to-use unsubscribe mechanism.
                </li>
                <li>
                  Subject lines and content must not be false or misleading.
                </li>
              </ul>

              <h3 className="mb-3 mt-6 text-lg font-medium text-white">
                5.3 Prohibited Messaging Practices
              </h3>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Sending bulk unsolicited messages, spam, or messages to
                  purchased or scraped contact lists.
                </li>
                <li>
                  Sending messages with deceptive subject lines, forged
                  headers, or misleading sender information.
                </li>
                <li>
                  Using the platform to harvest email addresses or other contact
                  information from third-party sources without proper
                  authorization.
                </li>
                <li>
                  Sending messages that contain malicious links, phishing
                  attempts, or content designed to deceive recipients.
                </li>
              </ul>
            </section>

            {/* ──────────────────────── 6 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                6. Data and Privacy
              </h2>
              <p className="mb-4 leading-relaxed">
                You are responsible for the data you store and manage within
                Agent Runway. By using the Service, you agree to the following:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  <strong className="text-slate-300">
                    Lawful data collection.
                  </strong>{" "}
                  You will only upload, enter, or import data that you have a
                  lawful right to possess, use, and store. You represent that
                  any client data you enter has been collected in compliance
                  with applicable privacy laws, including PIPEDA and any
                  applicable provincial privacy legislation.
                </li>
                <li>
                  <strong className="text-slate-300">Client privacy.</strong>{" "}
                  You will respect the privacy of your clients and contacts. You
                  will not use the platform to collect, store, or process
                  personal information about individuals without a legitimate
                  business purpose and, where required by law, without their
                  knowledge or consent.
                </li>
                <li>
                  <strong className="text-slate-300">
                    No unlawful surveillance.
                  </strong>{" "}
                  You will not use the Service to unlawfully monitor, track, or
                  collect information about any individual.
                </li>
                <li>
                  <strong className="text-slate-300">
                    Compliance with privacy laws.
                  </strong>{" "}
                  You are responsible for ensuring that your use of the Service
                  complies with all applicable privacy and data protection laws,
                  including but not limited to PIPEDA, GDPR (if applicable),
                  CCPA (if applicable), and any provincial or state privacy
                  legislation.
                </li>
                <li>
                  <strong className="text-slate-300">
                    Third-party data sharing.
                  </strong>{" "}
                  You will not export, download, or otherwise transfer client
                  data from the platform for purposes inconsistent with your
                  original collection purpose or in violation of applicable law.
                </li>
              </ul>
            </section>

            {/* ──────────────────────── 7 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                7. Content Standards
              </h2>
              <p className="mb-4 leading-relaxed">
                All content you create, upload, store, or transmit through the
                Service must comply with the following standards:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Content must be accurate and not intentionally misleading.
                </li>
                <li>
                  Content must not infringe upon the intellectual property
                  rights of any third party, including copyrights, trademarks,
                  trade secrets, or patents.
                </li>
                <li>
                  Content must not contain any material that is defamatory,
                  obscene, abusive, threatening, hateful, or that promotes
                  violence or illegal activity.
                </li>
                <li>
                  Content must not contain sensitive personal information as
                  described in Section 3.7 above.
                </li>
                <li>
                  Marketing materials, listing descriptions, and client-facing
                  content generated or stored on the platform must comply with
                  all applicable advertising standards and real estate board
                  regulations.
                </li>
              </ul>
            </section>

            {/* ──────────────────────── 8 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                8. Security
              </h2>
              <p className="mb-4 leading-relaxed">
                Maintaining the security of the platform is a shared
                responsibility. You agree to the following:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  You will not attempt to circumvent, disable, or interfere with
                  any security feature or access control of the Service.
                </li>
                <li>
                  You will keep your login credentials confidential and will not
                  share your password, API keys, or authentication tokens with
                  any unauthorized person.
                </li>
                <li>
                  You will not access or attempt to access any other
                  user&apos;s account, data, or systems without authorization.
                </li>
                <li>
                  You will promptly notify Agent Runway at{" "}
                  <a
                    href="mailto:security@agentrunway.ca"
                    className="text-blue-400 underline hover:text-blue-300"
                  >
                    security@agentrunway.ca
                  </a>{" "}
                  if you become aware of any unauthorized access to your
                  account, any security vulnerability, or any suspected breach.
                </li>
                <li>
                  You are responsible for maintaining the security of the
                  devices and networks you use to access the Service.
                </li>
              </ul>
            </section>

            {/* ──────────────────────── 9 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                9. MLS and Real Estate Board Compliance
              </h2>
              <p className="mb-4 leading-relaxed">
                As a platform designed for licensed real estate professionals,
                Agent Runway expects all users to adhere to the rules and
                regulations of their respective real estate boards, MLS systems,
                and regulatory bodies. You agree to:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Comply with all MLS rules and regulations that apply to you,
                  including data input standards, accuracy requirements, and
                  rules governing the display and use of MLS data.
                </li>
                <li>
                  Comply with all applicable real estate board regulations,
                  bylaws, and codes of ethics.
                </li>
                <li>
                  Comply with all advertising standards and regulations
                  established by your real estate board, provincial or state
                  regulatory body, and any applicable self-regulatory
                  organization (such as CREA, NAR, or RECO).
                </li>
                <li>
                  Not use the Service to store, distribute, or display MLS data
                  in a manner that violates your MLS agreement or applicable MLS
                  rules.
                </li>
                <li>
                  Not use the Service to create marketing materials or
                  communications that violate your board&apos;s advertising
                  rules or applicable real estate legislation.
                </li>
              </ul>
            </section>

            {/* ──────────────────────── 10 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                10. Reporting Violations
              </h2>
              <p className="leading-relaxed">
                If you become aware of any violation of this Acceptable Use
                Policy, please report it to us immediately at{" "}
                <a
                  href="mailto:security@agentrunway.ca"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  security@agentrunway.ca
                </a>
                . Please include as much detail as possible, including the
                nature of the violation, any relevant evidence, and the
                identity of the parties involved (if known). We will review
                all reports promptly and take appropriate action.
              </p>
            </section>

            {/* ──────────────────────── 11 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                11. Enforcement
              </h2>
              <p className="mb-4 leading-relaxed">
                Agent Runway reserves the right to investigate any suspected
                violation of this AUP and to take any action we deem
                appropriate, including but not limited to:
              </p>
              <ul className="list-disc space-y-2 pl-6 text-slate-400 leading-relaxed">
                <li>
                  Issuing a warning to the user.
                </li>
                <li>
                  Temporarily suspending access to the Service.
                </li>
                <li>
                  Permanently terminating the user&apos;s account.
                </li>
                <li>
                  Removing or disabling access to any content that violates
                  this AUP.
                </li>
                <li>
                  Reporting the violation to law enforcement or regulatory
                  authorities.
                </li>
              </ul>
              <p className="mt-4 leading-relaxed">
                Agent Runway may take enforcement action at any time, with or
                without prior notice, at its sole discretion. If your account is
                suspended or terminated for a violation of this AUP, you are not
                entitled to a refund of any fees paid. Agent Runway is not
                liable to you or any third party for any enforcement action
                taken under this policy.
              </p>
            </section>

            {/* ──────────────────────── 12 ──────────────────────── */}
            <section>
              <h2 className="mb-4 text-xl font-semibold text-white">
                12. Modifications to This Policy
              </h2>
              <p className="leading-relaxed">
                We may update or modify this Acceptable Use Policy from time to
                time. When we make material changes, we will update the
                &ldquo;Last updated&rdquo; date at the top of this page. Your
                continued use of the Service after any changes take effect
                constitutes your acceptance of the revised AUP. We encourage
                you to review this policy periodically. If you do not agree
                with any changes, you must stop using the Service.
              </p>
            </section>

            {/* Contact */}
            <section className="border-t border-slate-800 pt-10">
              <h2 className="mb-4 text-xl font-semibold text-white">
                Contact Us
              </h2>
              <p className="leading-relaxed">
                If you have any questions about this Acceptable Use Policy,
                please contact us at{" "}
                <a
                  href="mailto:security@agentrunway.ca"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  security@agentrunway.ca
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
