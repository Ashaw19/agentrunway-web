import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Sub-Processors | Agent Runway",
  description:
    "A list of third-party service providers (sub-processors) that Agent Runway uses to operate the platform.",
  robots: { index: false, follow: false },
};

const LAST_UPDATED = "April 2, 2026";

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
    provider: "Groq",
    purpose: "AI Processing",
    data: "User queries, business context data, client information for AI features",
    location: "United States",
    security: "DPA in place, no data retention",
  },
  {
    provider: "Plaid",
    purpose: "Bank Account Sync (coming soon)",
    data: "Bank credentials (held by Plaid), transaction data",
    location: "United States",
    security: "SOC 2 Type II, ISO 27001",
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
  {
    provider: "Google",
    purpose: "Integrations (Gmail, Calendar, Drive)",
    data: "Email, calendar events, documents (accessed via OAuth)",
    location: "United States / Global",
    security: "Google API User Data Policy",
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
              personal information on our behalf and is contractually bound to
              protect your data.
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

          {/* Contact note */}
          <p className="mt-6 text-sm leading-relaxed text-slate-500">
            We review our sub-processors regularly. If you have questions about
            how your data is processed, contact our Privacy Officer at{" "}
            <a
              href="mailto:andrew@agentrunway.ca"
              className="text-blue-400 hover:text-blue-300"
            >
              andrew@agentrunway.ca
            </a>
            .
          </p>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
