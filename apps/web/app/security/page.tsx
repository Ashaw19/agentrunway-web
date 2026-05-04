import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { Shield, Lock, CreditCard, Building2, Eye, Bell, Mail } from "lucide-react";
import { webPageSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Agent Runway protects your financial data — encryption, bank security, payment security, and responsible disclosure.",
  alternates: {
    canonical: "https://agentrunway.ca/security",
  },
};

const securityWebPage = webPageSchema({
  name:
    "Agent Runway Security — Encryption, Bank Security, Payment Security",
  description:
    "How Agent Runway protects your financial data: TLS 1.3, AES-256, row-level security, Canadian data residency, Stripe PCI DSS Level 1 payments, PIPEDA and Law 25 compliance, and responsible disclosure.",
  url: "/security",
  lastReviewed: "2026-04-16",
});

const securityBreadcrumb = breadcrumbSchema([
  { name: "Home",     url: "/" },
  { name: "Security", url: "/security" },
]);

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-7">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400">
          {icon}
        </div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      <div className="space-y-3 text-slate-400 leading-relaxed text-[15px]">
        {children}
      </div>
    </section>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-md border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-[12px] font-mono text-slate-300">
      {label}
    </span>
  );
}

export default function SecurityPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(securityWebPage) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(securityBreadcrumb) }}
      />
      <MarketingNav />

      <main className="flex-1 px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">

          {/* Header */}
          <div className="mb-12">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400">
                <Shield className="h-6 w-6" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-white">
                Security
              </h1>
            </div>
            <p className="mt-3 text-base leading-relaxed text-slate-400">
              Agent Runway handles sensitive financial data — your income and
              expenses. Here is exactly how we protect it.
            </p>
          </div>

          <div className="space-y-5">

            {/* Encryption */}
            <Section icon={<Lock className="h-5 w-5" />} title="Data Encryption">
              <p>
                <strong className="text-slate-300">All data in transit</strong> is
                encrypted using <Pill label="TLS 1.3" />. Every connection between
                your browser and Agent Runway&apos;s servers is encrypted end-to-end.
              </p>
              <p>
                <strong className="text-slate-300">All data at rest</strong> is
                encrypted using <Pill label="AES-256" /> via Supabase&apos;s
                managed encryption layer. This applies to all tables — your
                transactions, expenses, pipeline deals, and settings.
              </p>
              <p>
                <strong className="text-slate-300">Row-level security (RLS)</strong>{" "}
                is enforced at the database level on all 10 tables. Every query is
                scoped to the authenticated user — your data cannot be accessed by
                other users, even in the event of an application logic error.
              </p>
            </Section>

            {/* Bank-account connectivity (planned) */}
            <Section icon={<Building2 className="h-5 w-5" />} title="Bank-Account Connectivity (Planned)">
              <p>
                Bank-account connectivity is a{" "}
                <strong className="text-slate-300">planned future capability</strong>{" "}
                of Agent Runway. It is{" "}
                <strong className="text-slate-300">not currently offered</strong>.
                Agent Runway does not currently retrieve, store, or process any
                banking information about you.
              </p>
              <p>
                When this capability is introduced, it will be optional, the
                core Service will continue to work without it, and we will
                update this Security page and notify users in accordance with
                our{" "}
                <a href="/privacy" className="text-blue-400 hover:text-blue-300 underline">
                  Privacy Policy
                </a>{" "}
                before any banking data is collected.
              </p>
            </Section>

            {/* Payments */}
            <Section icon={<CreditCard className="h-5 w-5" />} title="Payment Security (Stripe)">
              <p>
                All subscription payments are processed by{" "}
                <strong className="text-slate-300">Stripe, Inc.</strong>, a{" "}
                <Pill label="PCI DSS Level 1" /> certified payment processor —
                the highest level of PCI compliance available.
              </p>
              <p>
                <strong className="text-slate-300">
                  Agent Runway never sees, stores, or transmits your full card
                  number, CVV, or expiry date.
                </strong>{" "}
                Card details are entered directly into Stripe&apos;s encrypted,
                hosted payment fields. Stripe tokenizes your card and returns only
                a non-sensitive payment method ID to our system.
              </p>
              <p>
                Agent Runway complies with{" "}
                <strong className="text-slate-300">PCI DSS SAQ A</strong> — the
                self-assessment tier that applies when all cardholder data functions
                are fully outsourced to a PCI-validated third party and card data
                never touches our servers.
              </p>
              <p className="text-sm text-slate-500">
                <a
                  href="https://stripe.com/docs/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Stripe Security &rarr;
                </a>
              </p>
            </Section>

            {/* Infrastructure */}
            <Section icon={<Shield className="h-5 w-5" />} title="Infrastructure & Access Controls">
              <p>
                Agent Runway is hosted on{" "}
                <strong className="text-slate-300">Supabase</strong>, using
                Amazon Web Services in the{" "}
                <Pill label="ca-central-1" /> (Canada) region.{" "}
                <strong className="text-slate-300">Your data is stored in Canada.</strong>
              </p>
              <p>
                Access to production systems is restricted to authorized personnel
                only via <strong className="text-slate-300">multi-factor authentication</strong>.
                We follow the principle of least privilege — access is limited to
                what is required for each role.
              </p>
              <p>
                Authentication is handled by{" "}
                <strong className="text-slate-300">Supabase Auth</strong>, using
                bcrypt for password hashing — passwords are never stored in
                plaintext. Sign-in today is email and password over TLS.{" "}
                <strong className="text-slate-300">Two-factor authentication</strong>{" "}
                is on the near-term roadmap for accounts handling client data.
              </p>
              <p>
                All API routes are protected by session verification on the server.
                Unauthenticated requests to protected endpoints return 401 and are
                logged. We monitor for anomalous access patterns.
              </p>
            </Section>

            {/* Privacy */}
            <Section icon={<Eye className="h-5 w-5" />} title="Data Privacy">
              <p>
                Agent Runway complies with Canada&apos;s{" "}
                <strong className="text-slate-300">
                  Personal Information Protection and Electronic Documents Act (PIPEDA)
                </strong>{" "}
                and Quebec&apos;s{" "}
                <strong className="text-slate-300">Law 25</strong>.
              </p>
              <p>
                <strong className="text-slate-300">We do not sell your data.</strong>{" "}
                Your business data and transaction history are not used for
                advertising, sold to third parties, or used to train AI or
                machine-learning models.
              </p>
              <p>
                You can request a copy of your data, correction of inaccuracies, or
                complete account deletion at any time by emailing{" "}
                <a href="mailto:privacy@agentrunway.ca" className="text-blue-400 hover:text-blue-300">
                  privacy@agentrunway.ca
                </a>
                . Account deletion removes all personal and business data within 30 days,
                except records we are required to retain by law.
              </p>
              <p className="text-sm">
                See our full{" "}
                <a href="/privacy" className="text-blue-400 hover:text-blue-300 underline">
                  Privacy Policy
                </a>{" "}
                for details.
              </p>
            </Section>

            {/* Breach response */}
            <Section icon={<Bell className="h-5 w-5" />} title="Breach Response">
              <p>
                In the event of a data breach that creates a real risk of
                significant harm to any user, Agent Runway will:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Notify affected users as soon as feasible following confirmation of the breach</li>
                <li>
                  Report to the{" "}
                  <strong className="text-slate-300">
                    Office of the Privacy Commissioner of Canada
                  </strong>{" "}
                  as required under PIPEDA
                </li>
                <li>Provide a description of the breach, data involved, steps taken, and recommendations for affected users</li>
                <li>Engage appropriate security expertise to contain and remediate the incident</li>
              </ul>
            </Section>

            {/* Development practices */}
            <Section icon={<Shield className="h-5 w-5" />} title="Development Practices">
              <p>
                Our development process uses AI-assisted coding tools. These
                tools operate in a development environment only and have no
                access to production user data. We maintain strict internal
                policies separating development tools from user information.
              </p>
            </Section>

            {/* Responsible disclosure */}
            <Section icon={<Mail className="h-5 w-5" />} title="Vulnerability Disclosure">
              <p>
                If you discover a security vulnerability in Agent Runway, please
                report it responsibly. We take all security reports seriously and
                commit to:
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Acknowledging your report within <strong className="text-slate-300">48 hours</strong></li>
                <li>Keeping you informed of our investigation progress</li>
                <li>Resolving confirmed vulnerabilities within <strong className="text-slate-300">30 days</strong> where feasible</li>
                <li>Not pursuing legal action against researchers who act in good faith</li>
              </ul>
              <p className="mt-2">
                Please do not publicly disclose a vulnerability before we have had a
                reasonable opportunity to investigate and remediate it. Do not access,
                modify, or exfiltrate user data as part of security research.
              </p>
              <div className="mt-4 rounded-xl border border-blue-800/40 bg-blue-950/30 p-5">
                <p className="font-semibold text-white">Report a vulnerability</p>
                <p className="mt-1 text-slate-400">
                  Email:{" "}
                  <a
                    href="mailto:security@agentrunway.ca"
                    className="text-blue-400 hover:text-blue-300 font-mono"
                  >
                    security@agentrunway.ca
                  </a>
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Please include a description of the vulnerability, steps to
                  reproduce, and your assessment of the impact.
                </p>
              </div>
            </Section>

          </div>

          {/* Bottom note */}
          <p className="mt-10 text-center text-sm text-slate-600">
            Questions about our security practices?{" "}
            <a href="mailto:security@agentrunway.ca" className="text-slate-500 hover:text-white underline">
              security@agentrunway.ca
            </a>
          </p>

        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
