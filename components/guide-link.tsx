"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Anchor within the Guide page — maps to a section heading slug.
   *  e.g. "market-position" → /guide#market-position
   *  Leave empty to link to /guide root */
  anchor?: string;
  /** Optional tooltip label shown on hover */
  label?: string;
  className?: string;
}

/**
 * GuideLink — a small book icon that deep-links to the corresponding
 * section of the Guide page (/guide#anchor).
 * Place next to any metric label so users can instantly understand what they're seeing.
 */
export function GuideLink({ anchor, label, className }: Props) {
  const href = anchor ? `/guide#${anchor}` : "/guide";
  return (
    <Link
      href={href}
      title={label ?? "Learn more in the Guide"}
      className={cn(
        "inline-flex items-center justify-center rounded-full p-0.5 text-cyan-400/70 hover:text-cyan-500 hover:bg-cyan-50 transition-colors shrink-0",
        className
      )}
    >
      <BookOpen className="h-3 w-3" />
      <span className="sr-only">{label ?? "Guide"}</span>
    </Link>
  );
}
