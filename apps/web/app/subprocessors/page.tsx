import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Sub-Processors",
  description:
    "A list of third-party service providers (sub-processors) that Agent Runway uses to operate the platform.",
  robots: { index: false, follow: false },
};

const LAST_UPDATED = "April 6, 2026";

const SUB_PROCESSORS = [
  {
    provider: "Supabase",
    purpose: "Database & Authentication",
    data: "All application data including user accounts, CRM contacts, transactions, financial records",
    location: "Canada (AWS ca-central-1, Montreal)",
    security: "SOC 2 Type II, AES-256 encryption at rest",
  },
  {
    provider: "Stripe",
    purpose: "Payment Processing",
    data: "Payment method tokens, subscription records, billing information",
    location: "United States",
    security: "PCI DSS Level 1",
  },
  {
    provider: "Anthropic",
    purpose: "AI Processing (Claude — primary LLM)",
    data: "User queries, business context data, client information for AI features",
    location: "United States",
    security: "DPA in place, zero data retention for API traffic, not used for model training",
  },
  {
    provider: "Groq",
    purpose: "AI Processing (fallback LLM and voice transcription)",
    data: "User queries, business context data, client information; audio for voice features",
    location: "United States",
    security: "DPA in place, no data retention",
  },
  {
    provider: "Vercel",
    purpose: "Hosting & Analytics",
    data: "Application code, page view analytics, performance metrics",
    location: "United States / Global CDN",
    security: "SOC 2 Type 2",
  },
  {
    provider: "Sentry",
    purpose: "Error Tracking",
    data: "Error logs, performance data, anonymized session recordings",
    location: "United States",
    security: "SOC 2",
  },
  {
    provider: "Resend",
    purpose: "Email Delivery",
    data: "Email addresses, email content",
    location: "United States",
    security: "N/A",
  },
] as const;

/* -------------------------------------------------------------------------- */

const PLANNED_SUB_PROCESSORS = [
  {
    provider: "Plaid",
    purpose: "Bank Account Connectivity (planned — not currently active)",
    data: "Will be updated when this feature is offered to users.",
    location: "Pending",
    security: "Pending",
  },
] as const;

/* -------------------------------------------------------------------------- */

export default function SubProcessorsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <MarketingNav />

      <main className="flex-1 px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Sub-Processors
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              Last updated: {LAST_UPDATED}
            </p>
            <p className="mt-5 text-base leading-relaxed text-slate-400">
              Agent Runway uses the following third-party service providers
              (sub-processors) to operate our platform. Each provider processes
              personal information on our behalf and is bound by a{" "}
              <strong className="text-slate-300">
                Data Processing Agreement (DPA)
              </strong>{" "}
              requiring them to: use personal information only for specified
              purposes, implement appropriate security safeguards, notify us of
              any data breach, return or delete data upon termination, and permit
              audit of their data handling practices. These contractual
              protections ensure a comparable level of protection to Canadian
              privacy law, as required under PIPEDA.
            </p>
          </div>

          {/* Sub-processors table */}
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">
                    Provider
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">
                    Purpose
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">
                    Data Processed
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-200">
                    Security
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-400">
                {SUB_PROCESSORS.map((sp) => (
                  <tr key={sp.provider}>
                    <td className="px-4 py-3 font-medium text-slate-300">
                      {sp.provider}
                    </td>
                    <td className="px-4 py-3">{sp.purpose}</td>
                    <td className="px-4 py-3">{sp.data}</td>
                    <td className="px-4 py-3">{sp.location}</td>
                    <td className="px-4 py-3">{sp.security}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Planned sub-processors */}
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-white">
              Planned Sub-Processors
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-slate-400">
              The following providers are anticipated for future capabilities
              that are <strong className="text-slate-300">not currently
              active</strong>. They are listed here for transparency. None of
              these providers receive personal information from Agent Runway at
              this time. This page will be updated, and notice will be given
              under our{" "}
              <a href="/privacy" className="text-blue-400 hover:text-blue-300 underline">
                Privacy Policy
              </a>
              , before any planned sub-processor begins processing data.
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60">
                    <th className="px-4 py-3 text-left font-semibold text-slate-200">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-200">
                      Purpose
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-200">
                      Data Processed
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-200">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-200">
                      Security
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-400">
                  {PLANNED_SUB_PROCESSORS.map((sp) => (
                    <tr key={sp.provider}>
                      <td className="px-4 py-3 font-medium text-slate-300">
                        {sp.provider}
                      </td>
                      <td className="px-4 py-3">{sp.purpose}</td>
                      <td className="px-4 py-3">{sp.data}</td>
                      <td className="px-4 py-3">{sp.location}</td>
                      <td className="px-4 py-3">{sp.security}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Important notice */}
          <div className="mt-8 rounded-lg border border-amber-800/40 bg-amber-950/20 p-5">
            <p className="text-sm leading-relaxed text-amber-200/80">
              <strong className="text-amber-200">Important:</strong> Some of our
              sub-processors are located in the United States. Your data may be
              accessible to US law enforcement under applicable US laws,
              including the CLOUD Act. For more information, see our{" "}
              <a
                href="/privacy"
                className="text-blue-400 underline hover:text-blue-300"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>

          {/* Change notification */}
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <p className="text-sm leading-relaxed text-slate-400">
              <strong className="text-slate-300">Sub-processor change notification:</strong>{" "}
              We will update this page when we add, remove, or change a
              sub-processor. Material changes (new providers processing
              sensitive personal information) will be communicated via email to
              active account holders at least 30&nbsp;days before the new
              sub-processor begins processing data, giving you the opportunity
              to review the change and exercise your rights under our{" "}
              <a href="/privacy" className="text-blue-400 hover:text-blue-300 underline">
                Privacy Policy
              </a>
              .
            </p>
          </div>

          {/* Contact note */}
          <p className="mt-6 text-sm leading-relaxed text-slate-500">
            We review our sub-processors regularly. If you have questions about
            how your data is processed or would like to review our DPAs,
            contact our Privacy Officer at{" "}
            <a
              href="mailto:privacy@agentrunway.ca"
              className="text-blue-400 hover:text-blue-300"
            >
              privacy@agentrunway.ca
            </a>
            .
          </p>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
