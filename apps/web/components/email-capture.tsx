"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

// ── Props ─────────────────────────────────────────────────────────────────────

interface EmailCaptureProps {
  heading?: string;
  subheading?: string;
  placeholder?: string;
  ctaLabel?: string;
  source?: string;
  /** "dark" = white text on dark bg (default).  "light" = dark text on light bg. */
  variant?: "dark" | "light";
  /** Optional enhanced success state — when provided, shows a CTA after capture */
  successHeading?: string;
  successSubtext?: string;
  successCtaLabel?: string;
  successCtaHref?: string;
  successSecondaryLabel?: string;
  successSecondaryHref?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EmailCapture({
  heading = "Stay ahead of your numbers",
  subheading = "Tips for running a more profitable real estate business. No spam — unsubscribe anytime.",
  placeholder = "your@email.com",
  ctaLabel = "Subscribe",
  source = "website",
  variant = "dark",
  successHeading,
  successSubtext,
  successCtaLabel,
  successCtaHref,
  successSecondaryLabel,
  successSecondaryHref,
}: EmailCaptureProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const isDark = variant === "dark";

  // CASL: clear disclosure + affirmative submit = express consent for marketing-purposed inline forms.
  // String covers BOTH (a) the immediate fulfillment purpose (PDF / charter spot)
  // AND (b) the ongoing marketing purpose, AND embeds the sender mailing address
  // per CASL Regulations §3 — verbatim from the legal-compliance-champion CASL
  // hardening review (memory/findings/legal_casl_cheat_sheet_optin_2026-05-06.md, Item 2).
  const consentLanguage =
    "Email me the cheat sheet, and add me to occasional Agent Runway updates for Canadian real estate agents. Unsubscribe anytime. Sent by Agent Runway Inc., Saint John, NB, Canada.";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          source,
          consent: true,
          consent_language: consentLanguage,
          form_url: typeof window !== "undefined" ? window.location.pathname : "/",
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }

      setState("success");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  // Success state
  if (state === "success") {
    // Enhanced success: show CTA to continue into the product
    if (successCtaLabel && successCtaHref) {
      return (
        <div className="text-center">
          <div className="mb-4 inline-flex items-center justify-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-semibold">
              {successHeading ?? "You\u2019re in."}
            </span>
          </div>
          {successSubtext && (
            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {successSubtext}
            </p>
          )}
          <div className="mt-5">
            <Link
              href={successCtaHref}
              className="inline-flex items-center rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              {successCtaLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
          {successSecondaryLabel && successSecondaryHref && (
            <div className="mt-3">
              <Link
                href={successSecondaryHref}
                className={`text-sm font-medium underline underline-offset-4 transition-colors ${
                  isDark ? "text-slate-500 hover:text-white" : "text-slate-400 hover:text-slate-700"
                }`}
              >
                {successSecondaryLabel}
              </Link>
            </div>
          )}
        </div>
      );
    }

    // Default minimal success
    return (
      <div className="flex items-center justify-center gap-2 text-emerald-400">
        <CheckCircle2 className="h-5 w-5" />
        <span className="text-sm font-medium">You&apos;re in! Check your inbox soon.</span>
      </div>
    );
  }

  return (
    <div className="text-center">
      {heading && (
        <h2
          className={`text-2xl font-bold tracking-tight sm:text-3xl ${
            isDark ? "text-white" : "text-slate-900"
          }`}
        >
          {heading}
        </h2>
      )}
      {subheading && (
        <p className={`mt-3 text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {subheading}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          required
          maxLength={254}
          className={`w-full max-w-xs rounded-lg border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:w-72 ${
            isDark
              ? "border-slate-700 bg-slate-800 text-white placeholder-slate-500"
              : "border-slate-300 bg-white text-slate-900 placeholder-slate-400"
          }`}
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
        >
          {state === "loading" ? "Subscribing…" : ctaLabel}
          {state !== "loading" && <ArrowRight className="ml-2 h-4 w-4" />}
        </button>
      </form>

      {state === "error" && errorMsg && (
        <p className="mt-2 text-xs text-red-400">{errorMsg}</p>
      )}

      {/* CASL: express consent disclosure — submission is the affirmative action */}
      <p
        className={`mt-3 text-[11px] leading-relaxed ${
          isDark ? "text-slate-500" : "text-slate-400"
        }`}
      >
        {consentLanguage}
      </p>
    </div>
  );
}
