"use client";

import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

// ─── Field ────────────────────────────────────────────────────────────────────

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
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
        {label}
        {required && <span style={{ color: "#F0A800" }} aria-hidden="true">*</span>}
        {optional && <span className="font-normal text-slate-600">(optional)</span>}
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
          borderColor: focused ? "rgba(240,168,0,0.60)" : "rgba(255,255,255,0.10)",
          boxShadow: focused ? "0 0 0 3px rgba(240,168,0,0.12), 0 0 20px rgba(240,168,0,0.08)" : "none",
        }}
      />
    </div>
  );
}

function TextareaField({
  id,
  label,
  optional,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  optional?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
        {label}
        {optional && <span className="font-normal text-slate-600">(optional)</span>}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full resize-none rounded-xl border bg-white/[0.04] px-4 py-3.5 text-base text-white placeholder-slate-600 outline-none transition-all duration-200"
        style={{
          borderColor: focused ? "rgba(240,168,0,0.60)" : "rgba(255,255,255,0.10)",
          boxShadow: focused ? "0 0 0 3px rgba(240,168,0,0.12), 0 0 20px rgba(240,168,0,0.08)" : "none",
        }}
      />
    </div>
  );
}

// ─── Success ──────────────────────────────────────────────────────────────────

function SuccessState({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-6 text-center">
      <div className="relative">
        <div
          className="absolute -inset-4 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,0.25) 0%, transparent 70%)" }}
        />
        <div
          className="relative flex h-20 w-20 items-center justify-center rounded-full"
          style={{
            background: "linear-gradient(135deg, #10b981, #059669)",
            boxShadow: "0 0 40px rgba(16,185,129,0.45), 0 0 80px rgba(16,185,129,0.15), inset 0 1px 1px rgba(255,255,255,0.20)",
          }}
        >
          <CheckCircle2 className="h-9 w-9 text-white" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-extrabold text-white" style={{ letterSpacing: "-0.02em" }}>
          You&apos;re registered.
        </p>
        <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
          {name
            ? `Thanks, ${name.split(" ")[0]}. Your agent will be in touch with details.`
            : "Your agent will be in touch with details."}
        </p>
      </div>
      <div
        className="h-px w-24 rounded-full"
        style={{ background: "linear-gradient(90deg, transparent, rgba(16,185,129,0.6), transparent)" }}
      />
      <p className="text-xs text-slate-600">
        Powered by{" "}
        <a href="/" className="text-slate-500 underline hover:text-slate-400 transition-colors">
          Agent Runway
        </a>
      </p>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export function OpenHouseForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const formLoadedAt = useRef<number>(Date.now());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setErrorMsg("Please check the consent box to continue.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/leads/open-house", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          propertyAddress: propertyAddress.trim() || undefined,
          message: message.trim() || undefined,
          consent,
          formLoadedAt: formLoadedAt.current,
          website: "", // honeypot — always empty for real users
          formUrl: "/tools/open-house-signup",
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
    return <SuccessState name={`${firstName} ${lastName}`} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Hidden honeypot — never visible to real users */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ display: "none" }}
      />

      <div className="grid grid-cols-2 gap-4">
        <Field id="oh-first" label="First name" required value={firstName} onChange={setFirstName} placeholder="Jane" autoComplete="given-name" />
        <Field id="oh-last" label="Last name" required value={lastName} onChange={setLastName} placeholder="Smith" autoComplete="family-name" />
      </div>

      <Field id="oh-email" label="Email address" required type="email" value={email} onChange={setEmail} placeholder="jane@email.com" autoComplete="email" />
      <Field id="oh-phone" label="Phone number" optional type="tel" value={phone} onChange={setPhone} placeholder="(506) 555-0100" autoComplete="tel" />
      <Field id="oh-property" label="Property address" optional value={propertyAddress} onChange={setPropertyAddress} placeholder="123 Main St, Saint John, NB" autoComplete="street-address" />
      <TextareaField id="oh-message" label="Questions or notes" optional value={message} onChange={setMessage} placeholder="Any questions before the open house?" />

      {/* CASL consent checkbox */}
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
          I agree to receive marketing communications from Agent Runway Inc. I can unsubscribe at any time.
        </span>
      </label>

      {status === "error" && errorMsg && (
        <div
          className="rounded-xl px-4 py-3 text-xs text-red-300"
          style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          {errorMsg}
        </div>
      )}

      <div className="pt-1">
        <button
          type="submit"
          disabled={status === "loading"}
          className="group relative w-full overflow-hidden rounded-xl px-6 py-4 text-sm font-bold transition-all duration-200 disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #c07700 100%)",
            boxShadow: "0 0 30px rgba(240,168,0,0.40), 0 0 60px rgba(240,168,0,0.15)",
            color: "#15110A",
          }}
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%)" }}
          />
          <span className="relative flex items-center justify-center gap-2">
            {status === "loading" ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Registering…</>
            ) : (
              <>Register for this open house<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>
            )}
          </span>
        </button>
      </div>

      <p className="text-center text-[11px] text-slate-600">
        Your information is handled securely. See our{" "}
        <a href="/privacy" className="text-slate-500 underline hover:text-slate-400 transition-colors">Privacy Policy</a>.
      </p>
    </form>
  );
}
