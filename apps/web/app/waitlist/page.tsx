import type { Metadata } from "next";
import { WaitlistForm } from "./waitlist-form";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Join the Waitlist | Agent Runway",
  description:
    "Be first in line when Agent Runway launches. The only all-in-one business platform built exclusively for Canadian real estate agents.",
  openGraph: {
    url: "https://agentrunway.ca/waitlist",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const PILLARS = [
  {
    label: "Runway Score",
    description: "A real-time business health score across 6 dimensions — like a credit score for your business.",
    color: "from-amber-500/20 to-amber-500/5",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  {
    label: "Canadian Tax Engine",
    description: "T2125, CCA, GST/HST, PREC optimization. Built for how Canadian agents actually get paid.",
    color: "from-emerald-500/20 to-emerald-500/5",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  {
    label: "Aviation CRM",
    description: "Clients move through a flight journey — Boarding to Cruising. Your pipeline, always clear.",
    color: "from-blue-500/20 to-blue-500/5",
    border: "border-blue-500/30",
    dot: "bg-blue-400",
  },
  {
    label: "AI That Sounds Like You",
    description: "A personality quiz teaches your AI your voice. Every draft sounds like you wrote it on a good day.",
    color: "from-violet-500/20 to-violet-500/5",
    border: "border-violet-500/30",
    dot: "bg-violet-400",
  },
];

const CHECKLIST = [
  "Founding member pricing — locked in before public launch",
  "First access when we go live",
  "Direct line to the team — your feedback shapes the product",
  "Priced in Canadian dollars. Always.",
];

export default function WaitlistPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#010D1F" }}>
      <MarketingNav isLoggedIn={false} />

      <main className="flex-1">

        {/* ── Background atmosphere ── */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -left-60 -top-60 h-[700px] w-[700px] rounded-full bg-amber-500/10 blur-[140px]" />
          <div className="absolute -right-40 top-1/3 h-[500px] w-[500px] rounded-full bg-violet-500/10 blur-[120px]" />
          <div className="absolute bottom-0 left-1/2 h-72 w-[900px] -translate-x-1/2 rounded-full bg-blue-500/8 blur-[100px]" />
          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.15) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          {/* Vignette */}
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse 90% 70% at 50% 40%, transparent 30%, #010D1F 100%)",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 py-16 sm:px-10 sm:py-24">

          {/* ── Header ── */}
          <div className="text-center mb-16">

            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Founding Member Access — Limited Spots
            </div>

            {/* Headline */}
            <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.05]">
              Your business.
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #c084fc 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                In flight.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl mx-auto text-lg leading-relaxed text-slate-400 sm:text-xl">
              Agent Runway is the only all-in-one platform built exclusively for Canadian real estate agents.
              CRM. Tax engine. Financial forecasting. AI that sounds like you.
              <span className="text-white font-medium"> One runway. Every number that matters.</span>
            </p>

            <p className="mt-3 text-sm text-slate-500">
              Pricing coming soon — in Canadian dollars. Founding members get locked-in rates before public launch.
            </p>
          </div>

          {/* ── Two-column layout: form + pillars ── */}
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16 items-start">

            {/* ── Left: Pillars + checklist ── */}
            <div className="space-y-8">

              <div className="space-y-3">
                {PILLARS.map(({ label, description, color, border, dot }) => (
                  <div
                    key={label}
                    className={`rounded-2xl border bg-gradient-to-br ${color} ${border} p-4`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <div>
                        <p className="text-sm font-bold text-white">{label}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
                  What founding members get
                </p>
                <ul className="space-y-3">
                  {CHECKLIST.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                      <span className="text-sm text-slate-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </div>

            {/* ── Right: Form ── */}
            <div>
              {/* Gold gradient border card */}
              <div
                className="rounded-3xl p-px"
                style={{
                  background: "linear-gradient(135deg, rgba(240,168,0,0.6) 0%, rgba(217,119,6,0.3) 50%, rgba(192,132,252,0.2) 100%)",
                }}
              >
                <div
                  className="rounded-[23px] p-8 sm:p-10"
                  style={{ background: "#07101F" }}
                >
                  {/* Glow behind card */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-3xl"
                    style={{
                      boxShadow: "0 0 60px rgba(240,168,0,0.12), 0 0 120px rgba(240,168,0,0.06)",
                    }}
                  />

                  <div className="relative">
                    {/* Runway Score orb — decorative brand moment */}
                    <div className="mb-8 flex justify-center">
                      <div
                        className="relative flex h-20 w-20 items-center justify-center rounded-full"
                        style={{
                          background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #a85c00 100%)",
                          boxShadow: "0 0 40px rgba(240,168,0,0.5), 0 0 80px rgba(240,168,0,0.2), inset 0 1px 1px rgba(255,255,255,0.22)",
                        }}
                      >
                        <span className="text-3xl font-black leading-none select-none" style={{ color: "#15110A" }}>
                          AR
                        </span>
                      </div>
                    </div>

                    <h2 className="text-2xl font-bold text-white text-center mb-1">
                      Get early access
                    </h2>
                    <p className="text-sm text-slate-400 text-center mb-8">
                      Be first in line. No spam — just a heads-up when we launch.
                    </p>

                    <WaitlistForm />
                  </div>
                </div>
              </div>

              <p className="mt-4 text-center text-xs text-slate-600">
                No credit card. No commitment. Just a spot in line.
              </p>
            </div>

          </div>

          {/* ── Bottom tagline ── */}
          <div className="mt-24 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">
              Agent Runway · agentrunway.ca · Built for Canada
            </p>
          </div>

        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
