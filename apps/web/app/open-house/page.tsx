import type { Metadata } from "next";
import Link from "next/link";
import { Home, CheckCircle2, MapPin, Clock, Users } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { LeadCaptureForm } from "@/components/lead-capture-form";

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_URL = "https://agentrunway.ca/open-house";

export const metadata: Metadata = {
  title: "Open House Sign-In — Agent Runway for Canadian Realtors",
  description:
    "Register your interest in today's open house. A Canadian REALTOR® powered by Agent Runway will follow up with details.",
  robots: { index: false, follow: false },
  alternates: { canonical: PAGE_URL },
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function OpenHousePage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <MarketingNav />

      <main className="flex flex-1 flex-col">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section
          className="relative px-6 py-16 sm:px-10 sm:py-20"
          style={{ background: "linear-gradient(135deg, #010D1F 0%, #0a1628 100%)" }}
        >
          <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-blue-500/10 blur-[100px]" />
          <div className="relative mx-auto max-w-5xl">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              {/* Left — form */}
              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 backdrop-blur-sm sm:p-8">
                {/* Badge */}
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-600/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-400">
                  <Home className="h-3.5 w-3.5" aria-hidden="true" />
                  Open House Sign-In
                </div>

                <LeadCaptureForm
                  source="open_house_template"
                  heading="Register your interest"
                  subheading="Leave your name and email and the hosting agent will follow up with property details and next steps."
                  ctaLabel="Register"
                  messageLabel="Which property? (optional)"
                  messagePlaceholder="e.g. 123 Main Street, Moncton — Sunday 2–4 PM"
                  successHeading="Registered — thanks!"
                  successSubtext="The agent will reach out shortly with details."
                  consentLanguage="Add me to updates about this property and future Agent Runway notifications for Canadian real estate buyers. Unsubscribe anytime. Sent by Agent Runway Inc., Saint John, NB, Canada."
                />
              </div>

              {/* Right — why */}
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Streamlined open house
                  <br />
                  <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    lead capture.
                  </span>
                </h1>
                <p className="mt-4 text-base leading-relaxed text-slate-400">
                  Built for Canadian agents using Agent Runway. Every registration is
                  captured to your CRM with a full CASL audit trail — no clipboard, no
                  chasing down illegible handwriting later.
                </p>

                <ul className="mt-8 flex flex-col gap-4">
                  {[
                    {
                      icon: CheckCircle2,
                      text: "CASL-compliant consent captured on every sign-in",
                    },
                    {
                      icon: Users,
                      text: "Leads auto-added to your Flight Control pipeline",
                    },
                    {
                      icon: Clock,
                      text: "Follow-up drafted by Captain the moment they register",
                    },
                    {
                      icon: MapPin,
                      text: "Property context logged with the lead record",
                    },
                  ].map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400" aria-hidden="true" />
                      <span className="text-sm leading-relaxed text-slate-300">{text}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link
                    href="/features"
                    className="inline-flex items-center text-sm font-semibold text-blue-400 underline underline-offset-4 hover:text-blue-300"
                  >
                    See all Agent Runway features →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Powered-by strip ─────────────────────────────────────────── */}
        <section className="border-t border-slate-800/60 px-6 py-8 sm:px-10">
          <div className="mx-auto max-w-5xl text-center">
            <p className="text-xs text-slate-500">
              This page is powered by{" "}
              <Link href="/" className="font-semibold text-slate-400 hover:text-white">
                Agent Runway
              </Link>{" "}
              — the business operating system for Canadian real estate agents.{" "}
              <Link href="/tools/realtor-tax-estimator" className="underline underline-offset-4 hover:text-slate-300">
                Try the free tax estimator →
              </Link>
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
