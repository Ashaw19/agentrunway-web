import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CheckCircle2, Clock, MessageSquare, Zap } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { LeadCaptureForm } from "@/components/lead-capture-form";

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_URL = "https://agentrunway.ca/listing-inquiry";

export const metadata: Metadata = {
  title: "Listing Inquiry — Agent Runway for Canadian Realtors",
  description:
    "Interested in a property? Leave your details and a Canadian REALTOR® powered by Agent Runway will respond with information and next steps.",
  robots: { index: false, follow: false },
  alternates: { canonical: PAGE_URL },
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ListingInquiryPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <MarketingNav />

      <main className="flex flex-1 flex-col">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section
          className="relative px-6 py-16 sm:px-10 sm:py-20"
          style={{ background: "linear-gradient(135deg, #010D1F 0%, #0c1420 100%)" }}
        >
          <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[100px]" />
          <div className="relative mx-auto max-w-5xl">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              {/* Left — form */}
              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 backdrop-blur-sm sm:p-8">
                {/* Badge */}
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-600/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Listing Inquiry
                </div>

                <LeadCaptureForm
                  source="listing_inquiry_template"
                  heading="Interested in this property?"
                  subheading="Leave your details below. The agent will follow up with pricing, availability, and next steps."
                  ctaLabel="Send Inquiry"
                  messageLabel="Which property or MLS® number? (optional)"
                  messagePlaceholder="e.g. 456 River Road, Fredericton — MLS® NB123456"
                  successHeading="Inquiry sent!"
                  successSubtext="The agent will be in touch within one business day."
                  consentLanguage="Contact me about this property listing and add me to Agent Runway updates for Canadian real estate buyers. Unsubscribe anytime. Sent by Agent Runway Inc., Saint John, NB, Canada."
                />
              </div>

              {/* Right — why */}
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Every inquiry captured.
                  <br />
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                    No lead left behind.
                  </span>
                </h1>
                <p className="mt-4 text-base leading-relaxed text-slate-400">
                  Canadian agents on Agent Runway receive every listing inquiry directly
                  in their Flight Control pipeline — with CASL consent logged, follow-up
                  drafted, and the lead scored automatically.
                </p>

                <ul className="mt-8 flex flex-col gap-4">
                  {[
                    {
                      icon: CheckCircle2,
                      text: "CASL-compliant — express consent on every submission",
                    },
                    {
                      icon: Zap,
                      text: "Dispatcher routes the inquiry to the right pipeline stage",
                    },
                    {
                      icon: Clock,
                      text: "Captain drafts a follow-up the moment the form submits",
                    },
                    {
                      icon: MessageSquare,
                      text: "All context — property, message, source — logged to the record",
                    },
                  ].map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-400" aria-hidden="true" />
                      <span className="text-sm leading-relaxed text-slate-300">{text}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link
                    href="/features"
                    className="inline-flex items-center text-sm font-semibold text-cyan-400 underline underline-offset-4 hover:text-cyan-300"
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
              <Link href="/pricing" className="underline underline-offset-4 hover:text-slate-300">
                View pricing →
              </Link>
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
