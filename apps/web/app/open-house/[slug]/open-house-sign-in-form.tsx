"use client";

/**
 * open-house-sign-in-form.tsx
 *
 * CASL-compliant sign-in form for the public branded open house page.
 * Collects name + email + optional phone with an explicit consent checkbox.
 *
 * On submit calls /api/open-house-signup which:
 *   1. Writes to email_signups (marketing CASL list)
 *   2. Writes to consents (CASL audit trail)
 *   3. Creates a client record in the agent's Flight Control CRM (Boarding)
 *   4. Sends a Resend notification to the agent (non-fatal)
 */

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

const CONSENT_LANGUAGE =
  "I consent to be contacted about this property and to receive follow-up communications from the hosting agent. My information will be handled in accordance with PIPEDA and CASL. Unsubscribe anytime.";

interface Props {
  slug:            string;
  agentName:       string;
  propertyAddress: string;
}

export function OpenHouseSignInForm({
  slug,
  agentName,
  propertyAddress,
}: Props) {
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [consented, setConsented] = useState(false);
  const [status,    setStatus]    = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg,  setErrorMsg]  = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consented) {
      setErrorMsg("Please check the consent box to continue.");
      return;
    }
    if (!name.trim()) {
      setErrorMsg("Please enter your name.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/open-house-signup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name:             name.trim(),
          email:            email.trim(),
          phone:            phone.trim() || null,
          consent:          true,
          consent_language: CONSENT_LANGUAGE,
          form_url:         typeof window !== "undefined" ? window.location.pathname : `/open-house/${slug}`,
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
      <div className="flex flex-col items-start gap-3">
        <div className="inline-flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="h-6 w-6 shrink-0" />
          <span className="text-lg font-semibold">You&apos;re registered!</span>
        </div>
        <p className="text-sm leading-relaxed text-slate-400">
          {agentName
            ? `${agentName} will follow up with details about ${propertyAddress || "the property"}.`
            : `The agent will follow up with more details about ${propertyAddress || "the property"}.`}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Register for today&apos;s
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            open house.
          </span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Leave your name and email — the agent will follow up with property details and next steps.
        </p>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="oh-name"
          className="text-xs font-semibold uppercase tracking-wider text-slate-400"
        >
          Full name <span className="text-red-400">*</span>
        </label>
        <input
          id="oh-name"
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
        <label
          htmlFor="oh-email"
          className="text-xs font-semibold uppercase tracking-wider text-slate-400"
        >
          Email address <span className="text-red-400">*</span>
        </label>
        <input
          id="oh-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@email.com"
          required
          maxLength={254}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
        />
      </div>

      {/* Phone (optional) */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="oh-phone"
          className="text-xs font-semibold uppercase tracking-wider text-slate-400"
        >
          Phone (optional)
        </label>
        <input
          id="oh-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(506) 555-0100"
          maxLength={30}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
        />
      </div>

      {/* CASL consent — required, not pre-checked */}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-800 accent-blue-500"
          aria-describedby="oh-consent-text"
        />
        <span id="oh-consent-text" className="text-[11px] leading-relaxed text-slate-500">
          {CONSENT_LANGUAGE}
        </span>
      </label>

      {status === "error" && errorMsg && (
        <p className="text-xs text-red-400" role="alert">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Registering…
          </>
        ) : (
          <>
            Register for Open House
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}

export default OpenHouseSignInForm;
