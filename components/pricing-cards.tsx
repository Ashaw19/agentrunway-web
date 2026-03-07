"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Billing = "monthly" | "annual";
type CheckoutStatus = "idle" | "loading" | "unavailable";

// ── Static tier data (features don't change with billing) ─────────────────────

const TIERS = [
  {
    name: "Starter",
    tagline: "For agents getting organised",
    featured: false,
    ctaAction: "link" as const,
    ctaLabel: "Get Started",
    ctaHref: "/login",
    features: [
      "GCI tracking and deal log",
      "Year-to-date dashboard",
      "Basic income forecasting",
      "Expense category tracking",
      "Transaction history",
      "Canadian agent profile setup",
    ],
  },
  {
    name: "Professional",
    tagline: "For serious growth-focused agents",
    featured: true,
    ctaAction: "checkout" as const,
    ctaLabel: "Start Free Trial",
    ctaHref: null,
    features: [
      "Everything in Starter",
      "Advanced forecasting with P10–P90 bands",
      "Financial runway score (A+ to F)",
      "Business reports and PDF download",
      "AI insights and advisor cards",
      "Canadian tax planning tools",
      "CREA benchmark comparison",
      "5-year growth projections",
    ],
  },
  {
    name: "Team",
    tagline: "For teams and brokerages",
    featured: false,
    ctaAction: "link" as const,
    ctaLabel: "Contact Us",
    ctaHref: "mailto:hello@agentrunway.ca",
    features: [
      "Everything in Professional",
      "Shared team visibility",
      "Team analytics dashboard",
      "Brokerage-level reporting",
      "Custom report templates",
      "Volume pricing",
      "Priority support",
      "Custom onboarding",
    ],
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPrice(name: string, billing: Billing) {
  if (name === "Professional") {
    return billing === "annual"
      ? { display: "$41", detail: "per month — billed $490/year (save 2 months)" }
      : { display: "$49", detail: "per month, billed monthly" };
  }
  if (name === "Starter") return { display: "Free", detail: "No credit card required" };
  return { display: "Custom", detail: "Contact us for a quote" };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PricingCards() {
  const router = useRouter();
  const [billing, setBilling] = useState<Billing>("monthly");
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [notice, setNotice] = useState("");

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

      // Redirect to login if not authenticated
      if (res.status === 401 && data.redirect) {
        router.push(data.redirect);
        return;
      }

      // Stripe not yet configured or other server issue
      if (res.status === 503 || res.status === 500) {
        setStatus("unavailable");
        setNotice(
          data.message ??
            "Professional billing is coming soon — email hello@agentrunway.ca to upgrade."
        );
        return;
      }

      // Successful checkout session — redirect to Stripe
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
                Save 17%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Cards ── */}
      <div className="grid gap-6 sm:grid-cols-3">
        {TIERS.map((tier) => {
          const price = getPrice(tier.name, billing);
          return (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-2xl p-8 ${
                tier.featured
                  ? "border-2 border-blue-600 bg-white shadow-xl shadow-blue-600/10"
                  : "border border-slate-200 bg-white"
              }`}
            >
              {/* Most Popular badge */}
              {tier.featured && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1 text-xs font-semibold text-white">
                    <Sparkles className="h-3 w-3" />
                    Most Popular
                  </span>
                </div>
              )}

              {/* Header */}
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-900">{tier.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{tier.tagline}</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">
                    {price.display}
                  </span>
                  {price.display !== "Free" && price.display !== "Custom" && (
                    <span className="text-sm text-slate-500">/mo</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">{price.detail}</p>
              </div>

              {/* CTA */}
              {tier.ctaAction === "checkout" ? (
                <button
                  onClick={handleCheckout}
                  disabled={status === "loading"}
                  className="mb-2 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                >
                  {status === "loading" ? "Loading…" : tier.ctaLabel}
                  {status !== "loading" && <ArrowRight className="ml-2 h-4 w-4" />}
                </button>
              ) : (
                <Link
                  href={tier.ctaHref!}
                  className="mb-2 inline-flex w-full items-center justify-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {tier.ctaLabel}
                </Link>
              )}

              {/* Coming-soon notice for Professional */}
              {tier.ctaAction === "checkout" && status === "unavailable" && notice && (
                <p className="mb-4 text-center text-xs leading-relaxed text-amber-600">
                  {notice}
                </p>
              )}

              {!notice && <div className="mb-6" />}

              {/* Divider */}
              <div className="mb-6 border-t border-slate-100" />

              {/* Features */}
              <ul className="flex-1 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <CheckCircle2
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        tier.featured ? "text-blue-600" : "text-slate-400"
                      }`}
                    />
                    <span className="text-sm leading-snug text-slate-600">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
