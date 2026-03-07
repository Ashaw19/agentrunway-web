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
 * When false, renders a tasteful lock card with an upgrade CTA.
 */
export function ProGate({ isPro, feature, description, children, className }: Props) {
  if (isPro) return <>{children}</>;

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-primary/5 px-6 py-10 text-center ${className ?? ""}`}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-5 w-5 text-primary" />
      </div>
      <p className="mb-1 text-sm font-semibold text-foreground">{feature}</p>
      {description && (
        <p className="mb-5 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      <Link
        href="/pricing"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Upgrade to Professional
      </Link>
    </div>
  );
}
