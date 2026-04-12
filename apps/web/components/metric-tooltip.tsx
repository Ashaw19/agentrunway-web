"use client";

import { Info, ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TOOLTIP_REGISTRY } from "@/lib/tooltip-content";
import type { CardId } from "@/app/(app)/dashboard/card-registry";

// ============================================================================
// MetricTooltip — Three-tier contextual education component
// Attached to each dashboard card header via an ⓘ icon.
// Tier 1: "What is this?" — always shown
// Tier 2: "What changes this?" — input drivers with navigation links
// Tier 3: "What should I do?" — threshold-based, only when triggered
// ============================================================================

interface MetricTooltipProps {
  /** Card ID from card-registry — used to look up content */
  metricKey: CardId;
  /** Current metric value — used for threshold checks in Tier 3 */
  value?: number;
  /** Additional context values for complex threshold checks */
  context?: Record<string, number>;
}

export function MetricTooltip({ metricKey, value, context }: MetricTooltipProps) {
  const entry = TOOLTIP_REGISTRY[metricKey];
  if (!entry) return null;

  const actionTriggered = entry.action && value !== undefined
    ? entry.action.check(value, context)
    : false;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`Info about ${metricKey.replace(/_/g, " ")}`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-xs p-3 space-y-2.5"
        >
          {/* Tier 1: What is this? */}
          <p className="text-xs leading-relaxed">{entry.what}</p>

          {/* Tier 2: What changes this? */}
          {entry.drivers.length > 0 && (
            <div className="border-t border-border/40 pt-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Driven by
              </p>
              <div className="flex flex-wrap gap-1">
                {entry.drivers.map((driver) => (
                  <Link
                    key={driver.href + driver.label}
                    href={driver.href}
                    className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {driver.label}
                    <ArrowRight className="h-2.5 w-2.5" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Tier 3: What should I do? (only when threshold is breached) */}
          {actionTriggered && entry.action && (
            <div className="border-t border-amber-200 bg-amber-50/60 rounded-md p-2 -mx-0.5">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-0.5">
                Action needed
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                {entry.action.message}
              </p>
              <Link
                href={entry.action.href}
                className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold text-amber-700 hover:text-amber-900 transition-colors"
              >
                {entry.action.ctaLabel}
                <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </div>
          )}

        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
