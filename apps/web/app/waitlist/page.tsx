import type { Metadata } from "next";
import Link from "next/link";
import { WaitlistForm } from "./waitlist-form";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { ScrollRevealSection } from "@/components/scroll-reveal-section";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { charterSlotsRemaining } from "@/lib/stripe";
import { getCharterPaidCount } from "@/lib/marketing/cached-queries";

// Render dynamically per request (still cheap thanks to the 5-minute
// `unstable_cache` window on `getCharterPaidCount`). We intentionally do NOT
// statically prerender at build time: the previous attempt blocked the build
// for >180s when Supabase was sick (2026-04-29 deploy), because the build
// worker waited on a live PostgREST fetch that was timing out. Dynamic
// rendering means a sick gateway fails the page render (handled with a
// fallback in the page body), not the entire deploy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Member Access",
  description:
    "First 50 agents get 3 months free, lifetime price lock, and a referral bonus. Charter Member spots are limited — offer closes September 30, 2026.",
  openGraph: {
    url: "https://agentrunway.ca/waitlist",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
};

// ── Data ──────────────────────────────────────────────────────────────────────

const PILLARS = [
  {
    label: "Runway Score",
    description: "Know instantly if your business is healthy — pace, pipeline, cash flow, and tax obligations in one number.",
    accentColor: "amber",
    border: "rgba(240,168,0,0.35)",
    borderHover: "rgba(240,168,0,0.6)",
    dot: "#F0A800",
    glow: "rgba(240,168,0,0.12)",
    visual: "amber",
  },
  {
    label: "Canadian Tax Engine",
    description: "See what you actually owe the CRA — HST, income tax, instalments — before April surprises you.",
    accentColor: "emerald",
    border: "rgba(16,185,129,0.35)",
    borderHover: "rgba(16,185,129,0.6)",
    dot: "#10b981",
    glow: "rgba(16,185,129,0.10)",
    visual: "emerald",
  },
  {
    label: "Aviation CRM",
    description: "Track every client from first contact to closing — and know who needs a follow-up before they go cold.",
    accentColor: "blue",
    border: "rgba(59,130,246,0.35)",
    borderHover: "rgba(59,130,246,0.6)",
    dot: "#3b82f6",
    glow: "rgba(59,130,246,0.10)",
    visual: "blue",
  },
  {
    label: "AI That Sounds Like You",
    description: "Draft outreach, follow-ups, and listing descriptions that match your voice — not a robot's.",
    accentColor: "violet",
    border: "rgba(124,58,237,0.35)",
    borderHover: "rgba(124,58,237,0.6)",
    dot: "#8b5cf6",
    glow: "rgba(124,58,237,0.10)",
    visual: "violet",
  },
] as const;

// ── Charter Member offer ──────────────────────────────────────────────────────
const CHARTER_SPOTS_TOTAL = 50;

const CHARTER_CHECKLIST = [
  "3 months free on any paid plan — no credit card at signup",
  "Your price locked while subscribed — never pay more as the product grows, as long as your subscription stays active",
  "Earn 3 extra free months for every referral who starts a paid plan",
  "Direct line to the founder — your feedback shapes the roadmap",
];

const SCORE_BARS = [
  { label: "Pace",      pct: 82, color: "#3b82f6"  },
  { label: "Pipeline",  pct: 68, color: "#8b5cf6"  },
  { label: "Cash",      pct: 74, color: "#0d9488"  },
  { label: "Trend",     pct: 90, color: "#10b981"  },
  { label: "Deals",     pct: 61, color: "#F0A800"  },
  { label: "Expenses",  pct: 45, color: "#ef4444"  },
] as const;

// ── Runway Score Preview Component ────────────────────────────────────────────

function RunwayScorePreview() {
  return (
    <div className="relative float-anim">
      {/* Ambient glow layers */}
      <div
        className="pointer-events-none absolute -inset-12 rounded-[3rem]"
        style={{
          background: "radial-gradient(ellipse at 60% 40%, rgba(240,168,0,0.18) 0%, rgba(124,58,237,0.10) 50%, transparent 75%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="pointer-events-none absolute -inset-4 rounded-3xl"
        style={{
          background: "linear-gradient(135deg, rgba(240,168,0,0.08) 0%, rgba(124,58,237,0.06) 100%)",
          filter: "blur(12px)",
        }}
      />

      {/* Card with gradient border */}
      <div
        className="relative rounded-2xl p-px"
        style={{
          background: "linear-gradient(135deg, rgba(240,168,0,0.55) 0%, rgba(217,119,6,0.30) 45%, rgba(124,58,237,0.40) 100%)",
          boxShadow: "0 0 40px rgba(240,168,0,0.18), 0 0 80px rgba(240,168,0,0.08), 0 32px 64px rgba(0,0,0,0.7)",
        }}
      >
        <div className="overflow-hidden rounded-[15px]" style={{ background: "#07101F" }}>

          {/* Browser chrome */}
          <div
            className="flex items-center gap-2 border-b px-4 py-2.5"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
          >
            <div className="flex gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
              <div className="h-2 w-2 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
              <div className="h-2 w-2 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
            </div>
            <div
              className="mx-auto flex items-center gap-1.5 rounded-md px-3 py-1"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-slate-400">agentrunway.ca/dashboard</span>
            </div>
            <div className="w-10" />
          </div>

          {/* Dashboard body */}
          <div className="p-4 space-y-3">

            {/* Runway Score section */}
            <div
              className="rounded-xl p-4"
              style={{
                border: "1px solid rgba(240,168,0,0.15)",
                background: "linear-gradient(135deg, rgba(240,168,0,0.06) 0%, rgba(124,58,237,0.04) 100%)",
              }}
            >
              <p className="mb-3 text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                Runway Score
              </p>

              <div className="flex items-center gap-4">
                {/* Grade circle */}
                <div
                  className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #a85c00 100%)",
                    boxShadow: "0 0 24px rgba(240,168,0,0.60), 0 0 60px rgba(240,168,0,0.20), inset 0 1px 1px rgba(255,255,255,0.22)",
                  }}
                >
                  <span
                    className="text-3xl font-black leading-none"
                    style={{ color: "#15110A" }}
                  >
                    A
                  </span>
                </div>

                {/* Score details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-2xl font-black text-white leading-none">78</span>
                    <span className="text-xs text-slate-500">/100</span>
                    <span
                      className="ml-1 rounded-full px-2 py-0.5 text-[9px] font-bold"
                      style={{
                        background: "rgba(240,168,0,0.15)",
                        border: "1px solid rgba(240,168,0,0.30)",
                        color: "#F0A800",
                      }}
                    >
                      Strong
                    </span>
                  </div>
                  <p className="text-[10px] font-semibold text-emerald-400 mb-2">+5 vs last month</p>
                  <p className="text-[8px] text-slate-600 leading-relaxed">
                    Pace · Pipeline · Cash · Tax · Trend · Consistency
                  </p>
                </div>
              </div>

              {/* Mini component bars */}
              <div className="mt-3 flex items-end gap-1.5 h-6">
                {SCORE_BARS.map((bar) => (
                  <div key={bar.label} className="flex flex-1 flex-col items-center gap-0.5">
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${Math.round(bar.pct * 0.22)}px`,
                        background: bar.color,
                        opacity: 0.85,
                        minHeight: 3,
                      }}
                    />
                    <span className="text-[7px] text-slate-600">{bar.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "GCI YTD",    value: "$118,400", color: "#10b981" },
                { label: "Pipeline",   value: "4 active", color: "#8b5cf6" },
                { label: "Take-Home",  value: "$74,200",  color: "#60a5fa" },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="rounded-lg p-2.5 text-center"
                  style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
                >
                  <p className="text-[8px] text-slate-500 mb-0.5">{label}</p>
                  <p className="text-[11px] font-bold leading-none" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>

            {/* AI Briefing card */}
            <div
              className="rounded-xl p-3"
              style={{
                border: "1px solid rgba(240,168,0,0.25)",
                background: "rgba(240,168,0,0.04)",
              }}
            >
              <div className="mb-2 flex items-center gap-1.5">
                <div
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(240,168,0,0.20)" }}
                >
                  <Sparkles className="h-2 w-2 text-amber-400" />
                </div>
                <span className="text-[9px] font-semibold text-amber-300">Intelligence Briefing</span>
              </div>
              <div className="space-y-1.5">
                <p className="text-[9px] leading-relaxed text-slate-400">
                  ⚡ Sarah Chen hasn&apos;t been contacted in 21 days — in-flight
                </p>
                <p className="text-[9px] leading-relaxed text-slate-400">
                  📅 David Kim&apos;s offer conditional expires in 3 days
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pillar visual accent ──────────────────────────────────────────────────────

function PillarVisual({ visual }: { visual: string }) {
  if (visual === "amber") {
    return (
      <div className="relative h-10 w-full overflow-hidden rounded-lg" style={{ background: "rgba(240,168,0,0.06)" }}>
        <div className="absolute bottom-1 left-1 flex items-end gap-0.5 h-8">
          {[40, 65, 52, 80, 70, 58].map((h, i) => (
            <div key={i} className="w-2 rounded-sm" style={{ height: `${h}%`, background: "rgba(240,168,0,0.6)" }} />
          ))}
        </div>
        <div className="absolute right-2 top-1.5 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, #F0A800, #D97706)", boxShadow: "0 0 8px rgba(240,168,0,0.5)" }}>
          <span className="text-[8px] font-black" style={{ color: "#15110A" }}>A</span>
        </div>
      </div>
    );
  }
  if (visual === "emerald") {
    return (
      <div className="relative h-10 w-full overflow-hidden rounded-lg" style={{ background: "rgba(16,185,129,0.06)" }}>
        <div className="absolute inset-0 flex items-center px-2 gap-1">
          {["T2125", "CCA", "GST"].map((label) => (
            <div key={label} className="rounded px-1.5 py-0.5 text-[7px] font-bold" style={{ background: "rgba(16,185,129,0.20)", color: "#10b981" }}>{label}</div>
          ))}
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-400">
          <Check className="h-3.5 w-3.5" />
        </div>
      </div>
    );
  }
  if (visual === "blue") {
    return (
      <div className="relative h-10 w-full overflow-hidden rounded-lg" style={{ background: "rgba(59,130,246,0.06)" }}>
        <div className="absolute inset-0 flex items-center px-2 gap-1.5">
          {["Boarding", "In Flight", "Cruising"].map((s, i) => (
            <div key={s} className="flex items-center gap-0.5">
              {i > 0 && <div className="h-px w-2" style={{ background: "rgba(59,130,246,0.4)" }} />}
              <div className="rounded-full px-1.5 py-0.5 text-[7px] font-bold" style={{ background: i === 1 ? "rgba(59,130,246,0.25)" : "rgba(59,130,246,0.08)", color: i === 1 ? "#60a5fa" : "rgba(148,163,184,0.5)" }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // violet — AI
  return (
    <div className="relative h-10 w-full overflow-hidden rounded-lg" style={{ background: "rgba(124,58,237,0.06)" }}>
      <div className="absolute inset-0 flex items-center px-2">
        <div className="flex-1 rounded-md px-2 py-1 text-[8px] text-slate-500 italic" style={{ background: "rgba(124,58,237,0.10)", borderLeft: "2px solid rgba(139,92,246,0.5)" }}>
          &ldquo;Just wanted to follow up…&rdquo;
        </div>
        <div className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(139,92,246,0.25)" }}>
          <Sparkles className="h-2.5 w-2.5 text-violet-400" />
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function WaitlistPage() {
  // Fetch charter spots from the database (same source as /api/pricing-tier).
  // Cached for 5 minutes via lib/marketing/cached-queries.ts — Stripe webhook
  // handlers should call revalidateTag(CHARTER_COUNT_CACHE_TAG) after a paid
  // signup. Falls back to 0 (i.e. "all 50 spots remaining") if the read fails.
  let paidCount = 0;
  try {
    paidCount = await getCharterPaidCount();
  } catch (err) {
    console.error("[waitlist] charter count fetch failed (rendering 0):", err);
  }

  const CHARTER_SPOTS_LEFT = charterSlotsRemaining(paidCount);
  const CHARTER_SPOTS_CLAIMED = CHARTER_SPOTS_TOTAL - CHARTER_SPOTS_LEFT;
  const CHARTER_PCT = Math.round((CHARTER_SPOTS_CLAIMED / CHARTER_SPOTS_TOTAL) * 100);

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ background: "#010D1F" }}>
      <MarketingNav isLoggedIn={false} />

      <main className="flex-1 overflow-hidden">

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1 — FULL-VIEWPORT HERO
        ══════════════════════════════════════════════════════════════════ */}
        <section className="relative flex flex-col justify-center">

          {/* ── Background atmosphere ── */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {/* Animated orbs */}
            <div
              className="orb-drift-1 absolute -left-32 -top-32 h-[700px] w-[700px] rounded-full"
              style={{ background: "rgba(240,168,0,0.12)", filter: "blur(160px)" }}
            />
            <div
              className="orb-drift-2 absolute -right-40 -top-20 h-[600px] w-[600px] rounded-full"
              style={{ background: "rgba(124,58,237,0.12)", filter: "blur(130px)" }}
            />
            <div
              className="orb-drift-3 absolute bottom-0 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full"
              style={{ background: "rgba(37,99,235,0.08)", filter: "blur(100px)" }}
            />
            {/* Dot grid */}
            <div
              className="absolute inset-0 opacity-100"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.12) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
            {/* Vignette */}
            <div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 30%, #010D1F 90%)",
              }}
            />
          </div>

          <div className="relative mx-auto w-full max-w-7xl px-6 py-10 sm:px-10 sm:py-12 lg:py-14">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-20 items-center">

              {/* ── Left column: Copy ── */}
              <div className="space-y-7">

                {/* Pill badge */}
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  ✈ Charter Member Access — {CHARTER_SPOTS_LEFT} of {CHARTER_SPOTS_TOTAL} Spots Left
                </div>

                {/* Headline */}
                <div>
                  <h1 className="text-4xl font-extrabold tracking-tight leading-[1.08] text-white sm:text-5xl lg:text-7xl">
                    Your business.
                    <br />
                    <span
                      style={{
                        background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #a85c00 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      In flight.
                    </span>
                  </h1>
                </div>

                {/* Problem statement */}
                <p className="text-base leading-relaxed text-slate-400 sm:text-lg max-w-lg">
                  You closed a $500K sale. Your commission was $12,500. After brokerage splits, transaction fees, HST, and taxes — you kept $5,769. Less than half. Most agents never do this math.
                </p>

                {/* Subheadline */}
                <p className="text-base leading-relaxed text-slate-400 sm:text-xl max-w-lg">
                  Agent Runway shows you what you actually keep, what you owe, and how long you can operate without a closing — built specifically for Canadian agents.
                </p>

                {/* Inline trust signals */}
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
                  {[
                    "3 months free — Charter Members only",
                    "Price locked at launch rate while subscribed",
                    "Priced in Canadian dollars",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span className="text-sm font-medium text-slate-300">{item}</span>
                    </div>
                  ))}
                </div>

                {/* CTA scroll link */}
                <div className="pt-1">
                  <a
                    href="#waitlist-form"
                    className="group inline-flex items-center gap-2 rounded-xl px-7 py-4 text-sm font-bold transition-all duration-200"
                    style={{
                      background: "linear-gradient(135deg, #F0A800 0%, #D97706 100%)",
                      boxShadow: "0 0 30px rgba(240,168,0,0.40), 0 0 60px rgba(240,168,0,0.15)",
                      color: "#15110A",
                      minHeight: "48px",
                    }}
                  >
                    Request my boarding pass
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </div>
              </div>

              {/* ── Right column: Dashboard preview (desktop only) ── */}
              <div className="relative hidden lg:flex justify-end">
                <div className="w-full max-w-md">
                  <RunwayScorePreview />
                </div>
              </div>

            </div>
          </div>

        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 2 — WAITLIST FORM
        ══════════════════════════════════════════════════════════════════ */}
        <section id="waitlist-form" className="relative py-24 sm:py-32">

          {/* Radial gold glow behind form */}
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{
              background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(240,168,0,0.07) 0%, transparent 70%)",
            }}
          />

          <div className="relative mx-auto max-w-xl px-6 sm:px-8">
            <ScrollRevealSection>
              {/* Section label */}
              <div className="mb-10 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-400/70">
                  Charter Member Offer
                </p>
                <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
                  Claim your spot before takeoff.
                </h2>
                <p className="mt-3 text-slate-400">
                  First 50 agents only. Offer expires September 30, 2026.
                </p>

                {/* Spot counter + progress bar */}
                <div className="mt-6 mx-auto max-w-xs">
                  <div className="flex justify-between mb-1.5 text-xs">
                    <span className="font-semibold text-amber-300">{CHARTER_SPOTS_CLAIMED} spots claimed</span>
                    <span className="text-slate-500">{CHARTER_SPOTS_LEFT} remaining</span>
                  </div>
                  <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${CHARTER_PCT}%`,
                        background: "linear-gradient(90deg, #F0A800 0%, #D97706 100%)",
                        boxShadow: "0 0 8px rgba(240,168,0,0.6)",
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-600">
                    of {CHARTER_SPOTS_TOTAL} Charter Member spots
                  </p>
                </div>

                {/* Charter Member benefits */}
                <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-left">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-amber-400/80 text-center">
                    What Charter Members get
                  </p>
                  <div className="space-y-2">
                    {CHARTER_CHECKLIST.map((item) => (
                      <div key={item} className="flex items-start gap-2.5">
                        <div
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full mt-0.5"
                          style={{ background: "rgba(16,185,129,0.20)", border: "1px solid rgba(16,185,129,0.35)" }}
                        >
                          <Check className="h-2.5 w-2.5 text-emerald-400" />
                        </div>
                        <span className="text-xs leading-relaxed text-slate-300">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Form card */}
              <div
                className="rounded-3xl p-px"
                style={{
                  background: "linear-gradient(135deg, rgba(240,168,0,0.60) 0%, rgba(217,119,6,0.30) 50%, rgba(124,58,237,0.25) 100%)",
                  boxShadow: "0 0 60px rgba(240,168,0,0.15), 0 0 120px rgba(240,168,0,0.06), 0 32px 64px rgba(0,0,0,0.6)",
                }}
              >
                <div
                  className="rounded-[23px] p-7 sm:p-10 md:p-12"
                  style={{ background: "#07101F" }}
                >
                  {/* AR orb */}
                  <div className="mb-8 flex justify-center">
                    <div
                      className="relative flex h-24 w-24 items-center justify-center rounded-full"
                      style={{
                        background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #a85c00 100%)",
                        boxShadow: "0 0 50px rgba(240,168,0,0.60), 0 0 100px rgba(240,168,0,0.25), inset 0 1px 1px rgba(255,255,255,0.22)",
                      }}
                    >
                      <span
                        className="text-4xl font-black leading-none select-none"
                        style={{ color: "#15110A" }}
                      >
                        AR
                      </span>
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-white text-center mb-1">
                    Become a Charter Member
                  </h3>
                  <p className="text-sm text-slate-400 text-center mb-8">
                    Leave your details and we&apos;ll reach out with your 3-month free access before the public launch.
                  </p>

                  <WaitlistForm />
                </div>
              </div>

              <p className="mt-5 text-center text-xs text-slate-600">
                No credit card. No commitment. Just a spot in line.
              </p>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 3 — FEATURE PILLARS
        ══════════════════════════════════════════════════════════════════ */}
        <section className="relative py-20 sm:py-28">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{
              background: "linear-gradient(180deg, transparent 0%, rgba(240,168,0,0.03) 50%, transparent 100%)",
            }}
          />

          <div className="relative mx-auto max-w-6xl px-6 sm:px-10">
            <ScrollRevealSection>
              <div className="mb-12 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  What&apos;s inside
                </p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Every tool. One runway.
                </h2>
              </div>
            </ScrollRevealSection>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PILLARS.map((pillar, i) => (
                <ScrollRevealSection key={pillar.label} delay={(Math.min(i + 1, 4)) as 1 | 2 | 3 | 4}>
                  <div
                    className="group relative rounded-2xl p-px transition-all duration-300 hover:-translate-y-1"
                    style={{
                      background: `linear-gradient(135deg, ${pillar.border} 0%, transparent 60%)`,
                    }}
                  >
                    {/* Inner glow on hover */}
                    <div
                      className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background: `radial-gradient(ellipse at 50% 0%, ${pillar.glow} 0%, transparent 70%)`,
                      }}
                    />
                    <div
                      className="relative rounded-[15px] p-5 h-full flex flex-col gap-4"
                      style={{ background: "#07101F" }}
                    >
                      {/* Label row */}
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: pillar.dot, boxShadow: `0 0 8px ${pillar.dot}` }}
                        />
                        <p className="text-sm font-bold text-white">{pillar.label}</p>
                      </div>

                      {/* Description */}
                      <p className="text-xs leading-relaxed text-slate-400 flex-1">
                        {pillar.description}
                      </p>

                      {/* Visual accent */}
                      <PillarVisual visual={pillar.visual} />
                    </div>
                  </div>
                </ScrollRevealSection>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 4 — FROM THE BLOG
        ══════════════════════════════════════════════════════════════════ */}
        <section className="relative py-16 sm:py-20">
          <div className="relative mx-auto max-w-4xl px-6 sm:px-10">
            <ScrollRevealSection>
              <div className="mb-8 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  From the blog
                </p>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">
                  The thinking behind the product
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Link
                  href="/blog/the-real-cost-of-a-real-estate-deal"
                  className="group rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/60 mb-2">
                    Latest
                  </p>
                  <p className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors leading-snug">
                    The Real Cost of a Real Estate Deal (What Most Canadian Agents Never Calculate)
                  </p>
                  <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                    You closed a $500K sale. Your commission was $12,500. But how much did you actually keep?
                  </p>
                </Link>

                <Link
                  href="/blog/why-i-built-agent-runway"
                  className="group rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/60 mb-2">
                    Founder Story
                  </p>
                  <p className="text-sm font-bold text-white group-hover:text-violet-300 transition-colors leading-snug">
                    Why I Built Agent Runway
                  </p>
                  <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                    After years in real estate, I realized no tool was built for how Canadian agents actually run their business.
                  </p>
                </Link>
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 5 — FOUNDER CREDIBILITY + REAL PROOF
        ══════════════════════════════════════════════════════════════════ */}
        <section className="relative py-16 sm:py-24">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.04)",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              background: "rgba(255,255,255,0.015)",
            }}
          />

          <div className="relative mx-auto max-w-4xl px-6 sm:px-10">
            <ScrollRevealSection>
              {/* Founder quote */}
              <div className="mx-auto max-w-2xl text-center mb-14">
                <div
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full mb-5"
                  style={{
                    background: "linear-gradient(135deg, rgba(240,168,0,0.20) 0%, rgba(124,58,237,0.15) 100%)",
                    border: "1px solid rgba(240,168,0,0.25)",
                  }}
                >
                  <span className="text-lg font-black text-amber-400">A</span>
                </div>
                <blockquote className="text-lg leading-relaxed text-slate-300 sm:text-xl italic">
                  &ldquo;I spent 4 years selling real estate before I realized I had no idea what I was actually keeping on each deal. I built Agent Runway because no tool on the market does this math for Canadian agents.&rdquo;
                </blockquote>
                <p className="mt-4 text-sm font-semibold text-white">Andrew Shaw</p>
                <p className="text-xs text-slate-500">Founder &amp; REALTOR® · Saint John, NB</p>
              </div>

              {/* Proof points */}
              <div className="grid grid-cols-3 gap-4 sm:gap-8 text-center">
                {[
                  { num: "4+", label: "Years in Real Estate", sub: "Built by someone who's lived it" },
                  { num: "13",  label: "Provinces & Territories", sub: "Every Canadian tax jurisdiction" },
                  { num: "CAD", label: "Always",                  sub: "No USD conversion headaches" },
                ].map(({ num, label, sub }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <span
                      className="text-3xl font-black sm:text-5xl"
                      style={{
                        background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #a85c00 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      {num}
                    </span>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-slate-500">{sub}</p>
                  </div>
                ))}
              </div>
            </ScrollRevealSection>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 6 — FOUNDING MEMBER CTA
        ══════════════════════════════════════════════════════════════════ */}
        <section className="relative py-24 sm:py-32 overflow-hidden">

          {/* Warm atmospheric bg */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(240,168,0,0.08) 0%, transparent 70%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.08) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          <div className="relative mx-auto max-w-3xl px-6 text-center sm:px-10">
            <ScrollRevealSection>
              {/* Badge */}
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                {CHARTER_SPOTS_LEFT} Charter Member spots remaining
              </div>

              {/* Headline */}
              <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-tight">
                Cleared for{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #a85c00 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  takeoff.
                </span>
              </h2>

              <p className="mt-6 text-lg leading-relaxed text-slate-400 max-w-xl mx-auto">
                Stop guessing what you keep. Charter Members get 3 months free, lifetime price lock, and a referral bonus — available to the first 50 agents only.
              </p>

              {/* Checklist */}
              <div className="mt-8 flex flex-col items-start gap-3 max-w-sm mx-auto text-left">
                {CHARTER_CHECKLIST.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5"
                      style={{ background: "rgba(16,185,129,0.20)", border: "1px solid rgba(16,185,129,0.35)" }}
                    >
                      <Check className="h-3 w-3 text-emerald-400" />
                    </div>
                    <span className="text-sm text-slate-300">{item}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="mt-10">
                <a
                  href="#waitlist-form"
                  className="group inline-flex items-center gap-2 rounded-xl px-8 py-4 text-base font-bold transition-all duration-200"
                  style={{
                    background: "linear-gradient(135deg, #F0A800 0%, #D97706 100%)",
                    boxShadow: "0 0 40px rgba(240,168,0,0.50), 0 0 80px rgba(240,168,0,0.20)",
                    color: "#15110A",
                    minHeight: "52px",
                  }}
                >
                  Request my boarding pass
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </a>
              </div>

              <p className="mt-5 text-xs text-slate-600">
                No credit card. No commitment. Just a spot in line.
              </p>
            </ScrollRevealSection>
          </div>
        </section>

        {/* Bottom tagline */}
        <div className="py-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-700">
            Agent Runway · agentrunway.ca · Built for Canada
          </p>
        </div>

      </main>

      <MarketingFooter />
    </div>
  );
}
