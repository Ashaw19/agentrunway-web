import type { Metadata } from "next";
import { Home } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { OpenHouseForm } from "./open-house-form";

const URL = "https://agentrunway.ca/tools/open-house-signup";

export const metadata: Metadata = {
  title: "Open House Registration — Agent Runway",
  description:
    "Register for an open house. Powered by Agent Runway — the business platform built for Canadian real estate agents.",
  openGraph: {
    type: "website",
    url: URL,
    title: "Open House Registration — Agent Runway",
    description: "Register for an open house. Powered by Agent Runway.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: URL },
  robots: { index: false, follow: false },
};

export default function OpenHouseSignupPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <MarketingNav />

      <main className="flex flex-1 flex-col items-center justify-start px-6 py-16 sm:py-24">
        <div className="w-full max-w-lg">

          {/* Eyebrow */}
          <div className="mb-6 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <Home className="h-3.5 w-3.5" />
              Open House · Registration
            </div>
          </div>

          {/* Headline */}
          <h1 className="mb-3 text-center text-3xl font-black tracking-tight text-white sm:text-4xl">
            Register for this open house
          </h1>
          <p className="mb-10 text-center text-base leading-relaxed text-slate-400">
            Fill in your details and your agent will follow up with showing times and property information.
          </p>

          {/* Form card */}
          <div
            className="rounded-2xl border p-8"
            style={{
              background: "rgba(255,255,255,0.03)",
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <OpenHouseForm />
          </div>

          {/* Powered-by footer note */}
          <p className="mt-8 text-center text-xs text-slate-600">
            This form is powered by{" "}
            <a href="/" className="text-slate-500 underline hover:text-slate-400 transition-colors">
              Agent Runway
            </a>{" "}
            — the business platform built for Canadian real estate agents.
          </p>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
