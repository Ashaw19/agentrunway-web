"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles, Clock, Users } from "lucide-react";

import type { PricingTier } from "@/lib/stripe";

// ── Types ─────────────────────────────────────────────────────────────────────

type Billing = "monthly" | "annual";
type CheckoutStatus = "idle" | "loading" | "unavailable";

interface TierInfo {
  tier: PricingTier;
  charterRemaining: number;
  charterTotal: number;
}

// ── Pricing by tier ──────────────────────────────────────────────────────────

const INDIVIDUAL_PRICES = {
  charter: { monthly: 79, annual: 790, label: "Charter Member", badge: "Locked while subscribed" },
  early_adopter: { monthly: 99, annual: 990, label: "Early Adopter", badge: "Locked while subscribed" },
  standard: { monthly: 149, annual: 1490, label: "Professional", badge: null },
} as const;

const TEAM_LEADER_PRICES = {
  charter: { monthly: 149, annual: 1490 },
  early_adopter: { monthly: 199, annual: 1990 },
  standard: { monthly: 249, annual: 2490 },
} as const;

const TEAM_MEMBER_PRICES = {
  charter: { monthly: 55, annual: 550 },
  early_adopter: { monthly: 59, annual: 590 },
  standard: { monthly: 79, annual: 790 },
} as const;

// ── Static tier data ─────────────────────────────────────────────────────────

const PRO_FEATURES = [
  "GCI tracking and deal log",
  "Full CRM with flight statuses and outreach",
  "AI business assistant with financial context",
  "AI-powered outreach (21 opportunity types)",
  "Receipt scanning with AI categorization",
  "Canadian tax centre (T2125, all provinces)",
  "Tax estimation tools (10 categories)",
  "Probabilistic forecasting (P10–P90)",
  "Business health score (A+ to F)",
  "Expense tracking and categorization",
  "Industry benchmark comparison",
  "Business reports and PDF export",
  "Mileage tracking (CRA-format logs)",
  "Year-to-date dashboard and forecasting",
];

const TEAM_FEATURES = [
  "Everything in Professional, plus:",
  "Team analytics dashboard",
  "5 brokerage-level report types",
  "Agent performance coaching insights",
  "Recruitment performance summary",
  "Team comparative benchmarks",
  "Organization audit log",
  "Role-based access (owner/admin/member)",
  "Priority support",
];

// ── Component ─────────────────────────────────────────────────────────────────

export function PricingCards() {
  const router = useRouter();
  const [billing, setBilling] = useState<Billing>("monthly");
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [notice, setNotice] = useState("");
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);

  useEffect(() => {
    fetch("/api/pricing-tier")
      .then((r) => r.json())
      .then((data) => setTierInfo(data as TierInfo))
      .catch(() => {});
  }, []);

  const currentTier: PricingTier = tierInfo?.tier ?? "charter";
  const indivPrice = INDIVIDUAL_PRICES[currentTier];
  const leaderPrice = TEAM_LEADER_PRICES[currentTier];
  const memberPrice = TEAM_MEMBER_PRICES[currentTier];

  const annualSavings = indivPrice.monthly * 12 - indivPrice.annual;
  const annualSavingsPct = Math.round((annualSavings / (indivPrice.monthly * 12)) * 100);

  async function handleCheckout() {
    setStatus("loading");
    setNotice("");

    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billing }),
      });

      const data = (await res.json()) as {
        url?: string;
        redirect?: string;
        message?: string;
        error?: string;
      };

      if (res.status === 401 && data.redirect) {
        router.push(data.redirect);
        return;
      }

      if (res.status === 503 || res.status === 500) {
        setStatus("unavailable");
        setNotice(
          data.message ??
            "Billing is temporarily unavailable — please try again shortly or email hello@agentrunway.ca for help."
        );
        return;
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      setStatus("unavailable");
      setNotice("Something went wrong. Please try again.");
    } catch {
      setStatus("unavailable");
      setNotice("Something went wrong. Please try again.");
    }
  }

  return (
    <div>
      {/* ── Charter banner ── */}
      {currentTier === "charter" && tierInfo && (
        <div className="mb-8 mx-auto max-w-xl rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-bold text-amber-900">Charter Membership</span>
            <Sparkles className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-sm text-amber-800">
            <span className="font-bold text-amber-900">{tierInfo.charterRemaining}</span> of{" "}
            {tierInfo.charterTotal} charter spots remaining. Lock in{" "}
            <span className="font-bold">${indivPrice.monthly}/mo for as long as your subscription stays active.</span>
          </p>
        </div>
      )}

      {currentTier === "early_adopter" && (
        <div className="mb-8 mx-auto max-w-xl rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-bold text-blue-900">Early Adopter Pricing</span>
          </div>
          <p className="text-sm text-blue-800">
            Charter spots are filled! Lock in{" "}
            <span className="font-bold">${indivPrice.monthly}/mo for as long as your subscription stays active</span> before standard
            pricing begins.
          </p>
        </div>
      )}

      {/* ── Billing toggle ── */}
      <div className="mb-10 flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit mx-auto">
        {(["monthly", "annual"] as Billing[]).map((option) => (
          <button
            key={option}
            onClick={() => {
              setBilling(option);
              setStatus("idle");
              setNotice("");
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              billing === option
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {option.charAt(0).toUpperCase() + option.slice(1)}
            {option === "annual" && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                Save {annualSavingsPct}%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Cards ── */}
      <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
        {/* ── Professional ── */}
        <div className="relative flex flex-col rounded-2xl border-2 border-blue-600 bg-white p-8 shadow-xl shadow-blue-600/10">
          {/* Badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1 text-xs font-semibold text-white">
              <Sparkles className="h-3 w-3" />
              {indivPrice.label}
            </span>
          </div>
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">Professional</h2>
            <p className="mt-1 text-sm text-slate-500">The complete platform for serious agents</p>
          </div>
          <div className="mb-6">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight text-slate-900">
                ${billing === "annual" ? Math.round(indivPrice.annual / 12) : indivPrice.monthly}
              </span>
              <span className="text-sm text-slate-500">/mo</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {billing === "annual"
                ? `Billed $${indivPrice.annual.toLocaleString()}/year (save $${annualSavings})`
                : "Billed monthly"}
            </p>
            {indivPrice.badge && (
              <p className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
                {indivPrice.badge}
              </p>
            )}
            {currentTier === "standard" && (
              <p className="mt-1 text-xs text-slate-400">
                <span className="line-through text-slate-300">Charter was $79/mo</span>
              </p>
            )}
          </div>
          <button
            onClick={handleCheckout}
            disabled={status === "loading"}
            className="mb-2 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
          >
            {status === "loading" ? "Loading…" : "Start Free Trial"}
            {status !== "loading" && <ArrowRight className="ml-2 h-4 w-4" />}
          </button>

          {status === "unavailable" && notice && (
            <p className="mb-4 text-center text-xs leading-relaxed text-amber-600">{notice}</p>
          )}
          {!notice && <div className="mb-6" />}
          <div className="mb-6 border-t border-slate-100" />
          <ul className="flex-1 space-y-3">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span className="text-sm leading-snug text-slate-600">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Team ── */}
        <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-white p-8">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">Teams</h2>
            <p className="mt-1 text-sm text-slate-500">For brokerages and team leads</p>
          </div>
          <div className="mb-6">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight text-slate-900">
                ${billing === "annual" ? Math.round(leaderPrice.annual / 12) : leaderPrice.monthly}
              </span>
              <span className="text-sm text-slate-500">/mo</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Team leader seat
              {billing === "annual" && ` — billed $${leaderPrice.annual.toLocaleString()}/year`}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-xs text-slate-500">
                + <span className="font-semibold text-slate-700">${billing === "annual" ? Math.round(memberPrice.annual / 12) : memberPrice.monthly}/mo</span>{" "}
                per team member
                {billing === "annual" && (
                  <span className="text-slate-400">
                    {" "}
                    (${memberPrice.annual}/yr)
                  </span>
                )}
              </p>
            </div>
            {indivPrice.badge && (
              <p className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
                {indivPrice.badge}
              </p>
            )}
          </div>
          <Link
            href="mailto:hello@agentrunway.ca?subject=Team%20Plan%20Inquiry"
            className="mb-2 inline-flex w-full items-center justify-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Contact Us
          </Link>
          <div className="mb-6" />
          <div className="mb-6 border-t border-slate-100" />
          <ul className="flex-1 space-y-3">
            {TEAM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-sm leading-snug text-slate-600">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Pricing comparison ── */}
      {currentTier !== "standard" && (
        <div className="mt-10 mx-auto max-w-2xl">
          <p className="text-center text-xs text-slate-400">
            {currentTier === "charter" ? "Charter" : "Early Adopter"} rates are locked as long as
            your subscription remains active. Standard pricing will be ${INDIVIDUAL_PRICES.standard.monthly}/mo after{" "}
            {currentTier === "charter" ? "charter spots fill" : "the early adopter period"}.
          </p>
        </div>
      )}
    </div>
  );
}
