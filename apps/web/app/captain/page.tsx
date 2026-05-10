/**
 * /captain — Public Captain chat page (Phase 2.1)
 *
 * Conversational lead intake powered by the Captain persona.
 * No auth required. Visitor has a genuine conversation with Captain
 * about their real estate business; CASL-compliant email capture
 * appears after one exchange (opt-in, dismissable).
 *
 * Captain name on this page: "Talk to Captain" — AR aviation vocabulary.
 * NOT "Lead Concierge" (HML), NOT "AI Chat" (generic).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, BarChart3 } from "lucide-react";
import { Tailfin } from "@/components/icons/brand-icons";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { CaptainChat } from "./captain-chat";

export const metadata: Metadata = {
  title: "Talk to Captain",
  description:
    "Chat with Captain — Agent Runway's AI advisor — to get honest answers about whether the platform is right for your real estate business. No sign-up required.",
  openGraph: {
    siteName: "Agent Runway",
    url: "https://agentrunway.ca/captain",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

// ── Quick-start chips — surface AR's strongest entry points ──────────────────

const QUICK_CHIPS = [
  {
    label: "How does the tax estimator work?",
    href:  "/tools/realtor-tax-estimator",
    icon:  Calculator,
  },
  {
    label: "What is the Runway Score?",
    href:  "/features",
    icon:  BarChart3,
  },
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CaptainPage() {
  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-slate-950 pb-16">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">

          {/* ── Hero ── */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/20 ring-1 ring-blue-600/30">
              <Tailfin className="h-7 w-7 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Talk to Captain
            </h1>
            <p className="mt-2.5 mx-auto max-w-sm text-sm text-slate-400">
              Get honest answers about how Agent Runway works and whether it fits
              your Canadian real estate business. No sign-up required.
            </p>

            {/* Quick links for visitors who want to self-serve first */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {QUICK_CHIPS.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  {label}
                  <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                </Link>
              ))}
            </div>
          </div>

          {/* ── Chat widget ── */}
          <CaptainChat />

          {/* ── Footer note ── */}
          <p className="mt-4 text-center text-[11px] text-slate-700">
            Captain provides information about Agent Runway — not personalized financial or tax advice.
            Tax-related content surfaces published CRA information only.{" "}
            <Link href="/ai-disclaimer" className="hover:text-slate-500 underline underline-offset-2">
              AI disclaimer
            </Link>
          </p>

        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
