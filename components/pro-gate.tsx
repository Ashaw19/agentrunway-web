"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";

interface Props {
  isPro: boolean;
  feature: string;       // e.g. "AI Advisor Insights"
  description?: string;  // e.g. "Personalised tips ranked by business impact"
  children: React.ReactNode;
  className?: string;
}

/**
 * ProGate — wraps Professional-only features.
 * When isPro is true, renders children normally.
 * When false, renders a premium lock card with an upgrade CTA.
 */
export function ProGate({ isPro, feature, description, children, className }: Props) {
  if (isPro) return <>{children}</>;

  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/40 via-background to-primary/5 px-6 py-10 text-center ${className ?? ""}`}
    >
      {/* Decorative corner glow */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, oklch(0.74 0.18 65) 0%, transparent 70%)" }}
        aria-hidden="true"
      />

      {/* Amber lock — "premium you want" rather than "system restriction" */}
      <div className="relative mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-amber-200 bg-amber-50 shadow-sm">
        <Lock className="h-4.5 w-4.5 text-amber-600" style={{ height: "1.125rem", width: "1.125rem" }} />
      </div>

      {/* Feature name */}
      <p className="mb-1.5 text-sm font-semibold text-foreground">{feature}</p>

      {/* Description */}
      {description && (
        <p className="mb-5 max-w-[17rem] text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      {/* CTA */}
      <Link
        href="/pricing"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Upgrade to Professional
      </Link>

      {/* Trial reassurance */}
      <p className="mt-2.5 text-[11px] text-muted-foreground/70">
        14-day free trial · No credit card required
      </p>
    </div>
  );
}
