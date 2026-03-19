"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

export function WaitlistForm() {
  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [state, setState]         = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg]   = useState("");

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
          name: name.trim() || undefined,
          brokerage: brokerage.trim() || undefined,
          source: "waitlist_event",
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

  if (state === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background: "linear-gradient(135deg, #10b981, #059669)",
            boxShadow: "0 0 40px rgba(16,185,129,0.4)",
          }}
        >
          <CheckCircle2 className="h-8 w-8 text-white" />
        </div>
        <div>
          <p className="text-xl font-bold text-white">You&apos;re on the runway.</p>
          <p className="mt-2 text-sm text-slate-400">
            We&apos;ll be in touch when we launch.{name ? ` Talk soon, ${name.split(" ")[0]}.` : ""}
          </p>
        </div>
        <p className="text-xs text-slate-600">
          Keep an eye on{" "}
          <span className="text-slate-500">agentrunway.ca</span>{" "}
          — we&apos;ll share updates here too.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Name */}
      <div>
        <label htmlFor="wl-name" className="block text-xs font-semibold text-slate-400 mb-1.5">
          Your name
        </label>
        <input
          id="wl-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
          autoComplete="name"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/20"
        />
      </div>

      {/* Email */}
      <div>
        <label htmlFor="wl-email" className="block text-xs font-semibold text-slate-400 mb-1.5">
          Email address <span className="text-amber-400">*</span>
        </label>
        <input
          id="wl-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@realestate.ca"
          required
          autoComplete="email"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/20"
        />
      </div>

      {/* Brokerage */}
      <div>
        <label htmlFor="wl-brokerage" className="block text-xs font-semibold text-slate-400 mb-1.5">
          Brokerage <span className="text-slate-600 font-normal">(optional)</span>
        </label>
        <input
          id="wl-brokerage"
          type="text"
          value={brokerage}
          onChange={(e) => setBrokerage(e.target.value)}
          placeholder="RE/MAX, Royal LePage, Century 21…"
          autoComplete="organization"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/20"
        />
      </div>

      {/* Error */}
      {state === "error" && errorMsg && (
        <p className="text-xs text-red-400">{errorMsg}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={state === "loading"}
        className="group mt-2 w-full inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-sm font-bold text-white transition-all duration-200 disabled:opacity-60"
        style={{
          background: "linear-gradient(135deg, #F0A800 0%, #D97706 100%)",
          boxShadow: "0 0 30px rgba(240,168,0,0.35)",
          color: "#15110A",
        }}
      >
        {state === "loading" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Securing your spot…
          </>
        ) : (
          <>
            Reserve my founding spot
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </button>

    </form>
  );
}
