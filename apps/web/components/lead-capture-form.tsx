"use client";

/**
 * components/lead-capture-form.tsx
 *
 * Reusable lead capture form used on the open-house and listing-inquiry
 * template pages (Phase 1.2, project_hml_gap_strategy.md).
 *
 * Submits to /api/subscribe with name + email + CASL consent.
 * Optional `messageLabel` and `messagePlaceholder` props add a textarea
 * row for context (open house property / listing URL / buyer message).
 * The message is NOT persisted server-side in this iteration — it is
 * passed as `brokerage` so the subscribe route accepts it without a
 * migration. A v2 with a dedicated messages column can be added when
 * a relational lead inbox is built.
 *
 * CASL compliance:
 * - Explicit opt-in checkbox (required) — not pre-checked.
 * - Consent language shown adjacent to the checkbox.
 * - Consent is stored verbatim in the consents table by /api/subscribe.
 */

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LeadCaptureFormProps {
  /** Resend source tag written to email_signups.source */
  source: string;
  /** Label shown above the form */
  heading?: string;
  subheading?: string;
  /** Submit button text */
  ctaLabel?: string;
  /** If provided, shows a textarea below the email field */
  messageLabel?: string;
  messagePlaceholder?: string;
  /** Message shown on success */
  successHeading?: string;
  successSubtext?: string;
  /** CASL consent language (override default) */
  consentLanguage?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_CONSENT =
  "Add me to occasional Agent Runway updates for Canadian real estate agents. Unsubscribe anytime. Sent by Agent Runway Inc., Saint John, NB, Canada.";

export function LeadCaptureForm({
  source,
  heading,
  subheading,
  ctaLabel = "Submit",
  messageLabel,
  messagePlaceholder,
  successHeading = "Got it — thanks!",
  successSubtext = "We'll be in touch shortly.",
  consentLanguage = DEFAULT_CONSENT,
}: LeadCaptureFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consented) {
      setErrorMsg("Please check the consent box to continue.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          // Pass the message as brokerage for audit trail until a dedicated
          // messages column is added in a future migration.
          ...(message.trim() ? { brokerage: message.trim() } : {}),
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

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="inline-flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
          <span className="text-base font-semibold">{successHeading}</span>
        </div>
        {successSubtext && (
          <p className="text-sm leading-relaxed text-slate-400">{successSubtext}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {heading && (
        <div className="mb-1">
          <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            {heading}
          </h2>
          {subheading && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{subheading}</p>
          )}
        </div>
      )}

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="lc-name" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Full name <span className="text-red-400">*</span>
        </label>
        <input
          id="lc-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
          required
          maxLength={120}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
        />
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="lc-email" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Email address <span className="text-red-400">*</span>
        </label>
        <input
          id="lc-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@brokerage.ca"
          required
          maxLength={254}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
        />
      </div>

      {/* Optional message / context row */}
      {messageLabel && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lc-message" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {messageLabel}
          </label>
          <textarea
            id="lc-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={messagePlaceholder}
            rows={3}
            maxLength={600}
            className="resize-none rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
      )}

      {/* CASL consent checkbox — required, not pre-checked */}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-600 bg-slate-800 accent-blue-500"
          aria-describedby="lc-consent-text"
        />
        <span id="lc-consent-text" className="text-[11px] leading-relaxed text-slate-500">
          {consentLanguage}
        </span>
      </label>

      {status === "error" && errorMsg && (
        <p className="text-xs text-red-400" role="alert">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          <>
            {ctaLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}

export default LeadCaptureForm;
