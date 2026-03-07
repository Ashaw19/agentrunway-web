"use client";

import { useState } from "react";
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
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EmailCapture({
  heading = "Stay ahead of your numbers",
  subheading = "Tips for running a more profitable real estate business. No spam — unsubscribe anytime.",
  placeholder = "your@email.com",
  ctaLabel = "Subscribe",
  source = "website",
  variant = "dark",
}: EmailCaptureProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const isDark = variant === "dark";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
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
    </div>
  );
}
