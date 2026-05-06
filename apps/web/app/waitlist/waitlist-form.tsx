"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

// ── Input component ───────────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
}

function Field({
  id,
  label,
  required,
  optional,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
}: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300"
      >
        {label}
        {required && (
          <span style={{ color: "#F0A800" }} aria-hidden="true">
            *
          </span>
        )}
        {optional && (
          <span className="font-normal text-slate-600">(optional)</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full rounded-xl border bg-white/[0.04] px-4 py-3.5 text-base text-white placeholder-slate-600 outline-none transition-all duration-200"
        style={{
          borderColor: focused
            ? "rgba(240,168,0,0.60)"
            : "rgba(255,255,255,0.10)",
          boxShadow: focused
            ? "0 0 0 3px rgba(240,168,0,0.12), 0 0 20px rgba(240,168,0,0.08)"
            : "none",
        }}
      />
    </div>
  );
}

// ── Success state ─────────────────────────────────────────────────────────────

function SuccessState({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      {/* Success circle */}
      <div className="relative">
        <div
          className="absolute -inset-4 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(16,185,129,0.25) 0%, transparent 70%)",
          }}
        />
        <div
          className="relative flex h-20 w-20 items-center justify-center rounded-full"
          style={{
            background: "linear-gradient(135deg, #10b981, #059669)",
            boxShadow:
              "0 0 40px rgba(16,185,129,0.45), 0 0 80px rgba(16,185,129,0.15), inset 0 1px 1px rgba(255,255,255,0.20)",
          }}
        >
          <CheckCircle2 className="h-9 w-9 text-white" />
        </div>
      </div>

      <div>
        <p
          className="text-2xl font-extrabold text-white"
          style={{ letterSpacing: "-0.02em" }}
        >
          You&apos;re on the runway.
        </p>
        <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
          {name
            ? `We'll be in touch when we launch. Talk soon, ${name.split(" ")[0]}.`
            : "We'll be in touch when we launch."}
        </p>
      </div>

      {/* Emerald divider accent */}
      <div
        className="h-px w-24 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(16,185,129,0.6), transparent)",
        }}
      />

      <p className="text-xs text-slate-600">
        Keep an eye on{" "}
        <span className="text-slate-500">agentrunway.ca</span>
        {" "}— we&apos;ll share updates here too.
      </p>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

const CONSENT_LANGUAGE =
  "I agree to receive marketing communications from Agent Runway Inc. I can unsubscribe at any time.";

export function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!consent) {
      setState("error");
      setErrorMsg("Please check the consent box to continue.");
      return;
    }

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          brokerage: brokerage.trim() || undefined,
          source: "waitlist_event",
          consent: true,
          consent_language: CONSENT_LANGUAGE,
          form_url: "/waitlist",
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }

      setState("success");
    } catch (err) {
      setState("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong."
      );
    }
  }

  if (state === "success") {
    return <SuccessState name={name} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field
        id="wl-name"
        label="Your name"
        value={name}
        onChange={setName}
        placeholder="Jane Smith"
        autoComplete="name"
      />

      <Field
        id="wl-email"
        label="Email address"
        required
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="jane@realestate.ca"
        autoComplete="email"
      />

      <Field
        id="wl-brokerage"
        label="Brokerage"
        optional
        value={brokerage}
        onChange={setBrokerage}
        placeholder="RE/MAX, Royal LePage, Century 21…"
        autoComplete="organization"
      />

      {/* CASL express consent — unchecked by default, company-named, separate from terms */}
      <label className="flex cursor-pointer items-start gap-3">
        <div className="relative mt-0.5 shrink-0">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <div
            className="flex h-5 w-5 items-center justify-center rounded border transition-all duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400/50"
            style={{
              background: consent ? "linear-gradient(135deg, #F0A800, #D97706)" : "rgba(255,255,255,0.04)",
              borderColor: consent ? "#F0A800" : "rgba(255,255,255,0.15)",
            }}
          >
            {consent && (
              <svg className="h-3 w-3 text-black" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
        <span className="text-xs leading-relaxed text-slate-400">
          {CONSENT_LANGUAGE}
        </span>
      </label>

      {/* Error message */}
      {state === "error" && errorMsg && (
        <div
          className="rounded-xl px-4 py-3 text-xs text-red-300"
          style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          {errorMsg}
        </div>
      )}

      {/* Data processing disclosure */}
      <p className="text-[11px] leading-relaxed text-slate-600 text-center">
        By signing up, you acknowledge that your data may be processed by
        service providers located in the United States. See our{" "}
        <a href="/subprocessors" target="_blank" rel="noopener noreferrer" className="text-slate-500 underline hover:text-slate-400 transition-colors">
          Sub-Processors list
        </a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-slate-500 underline hover:text-slate-400 transition-colors">
          Privacy Policy
        </a>{" "}
        for details.
      </p>

      {/* Submit */}
      <div className="pt-1">
        <button
          type="submit"
          disabled={state === "loading"}
          className="group relative w-full overflow-hidden rounded-xl px-6 py-4 text-sm font-bold transition-all duration-200 disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #c07700 100%)",
            boxShadow:
              "0 0 30px rgba(240,168,0,0.40), 0 0 60px rgba(240,168,0,0.15)",
            color: "#15110A",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 0 40px rgba(240,168,0,0.60), 0 0 80px rgba(240,168,0,0.25)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 0 30px rgba(240,168,0,0.40), 0 0 60px rgba(240,168,0,0.15)";
          }}
        >
          {/* Hover shimmer layer */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%)",
            }}
          />

          <span className="relative flex items-center justify-center gap-2">
            {state === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Requesting your boarding pass…
              </>
            ) : (
              <>
                Request my boarding pass
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </span>
        </button>
      </div>
    </form>
  );
}
