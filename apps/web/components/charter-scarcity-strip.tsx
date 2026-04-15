"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// CharterScarcityStrip
// ─────────────────────────────────────────────────────────────────────────────
// Displays "X of 50 charter seats remaining at $79/mo locked while subscribed" — a conversion
// lift mechanism recommended in the v4 visibility plan.
//
// Reuses the existing GET /api/pricing-tier endpoint. Hides itself when:
//   - The tier has moved past "charter" (charterRemaining === 0)
//   - The fetch fails (graceful degradation)
//
// Variants:
//   - variant="compact" (default): thin strip for footer use
//   - variant="prominent": larger card for page hero / CTA sections
//   - variant="inline": single-line text for inline placement
// ─────────────────────────────────────────────────────────────────────────────

interface TierInfo {
  tier: "charter" | "early_adopter" | "standard";
  charterRemaining: number;
  charterTotal: number;
}

interface CharterScarcityStripProps {
  variant?: "compact" | "prominent" | "inline";
  className?: string;
}

export function CharterScarcityStrip({
  variant = "compact",
  className = "",
}: CharterScarcityStripProps) {
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);

  useEffect(() => {
    fetch("/api/pricing-tier")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TierInfo | null) => {
        if (data) setTierInfo(data);
      })
      .catch(() => {
        /* silent — component hides when data is missing */
      });
  }, []);

  // Hide if no data, wrong tier, or no seats remaining
  if (!tierInfo) return null;
  if (tierInfo.tier !== "charter") return null;
  if (tierInfo.charterRemaining <= 0) return null;

  const { charterRemaining, charterTotal } = tierInfo;
  const percentFull = Math.round(
    ((charterTotal - charterRemaining) / charterTotal) * 100,
  );

  // ── Inline variant ────────────────────────────────────────────────────────
  if (variant === "inline") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm ${className}`}>
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        <Link
          href="/pricing"
          className="font-semibold text-amber-700 underline decoration-amber-300 underline-offset-2 transition hover:text-amber-900"
        >
          {charterRemaining} of {charterTotal} charter seats remaining
        </Link>
        <span className="text-slate-500">· $79/mo locked while subscribed</span>
      </span>
    );
  }

  // ── Prominent variant ─────────────────────────────────────────────────────
  if (variant === "prominent") {
    return (
      <div
        className={`mx-auto flex max-w-xl items-start gap-3 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 ${className}`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900">
            Charter pricing — {charterRemaining} of {charterTotal} seats remaining
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-amber-800">
            First 50 Agent Runway users lock in{" "}
            <strong>$79/month for as long as your subscription stays active</strong>. After that, $99, then $149.{" "}
            <Link
              href="/pricing"
              className="font-semibold underline underline-offset-2 hover:text-amber-950"
            >
              Claim a seat →
            </Link>
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-amber-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
              style={{ width: `${percentFull}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Compact variant (default) ────────────────────────────────────────────
  return (
    <Link
      href="/pricing"
      className={`group inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3.5 py-1.5 text-xs font-medium text-amber-300 transition hover:border-amber-400 hover:bg-amber-500/15 ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
      </span>
      <span>
        <strong className="font-bold text-amber-200">{charterRemaining}</strong> of {charterTotal}{" "}
        charter seats · $79/mo locked while subscribed
      </span>
      <span className="text-amber-400/60 transition group-hover:translate-x-0.5 group-hover:text-amber-300">
        →
      </span>
    </Link>
  );
}
