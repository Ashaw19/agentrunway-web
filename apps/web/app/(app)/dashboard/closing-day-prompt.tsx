"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, CalendarCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PipelineDeal } from "@/lib/types/database";

interface ClosingDayPromptProps {
  dealsClosingToday: PipelineDeal[];
}

/**
 * Returns a localStorage key that is unique to today's date.
 * Dismissals naturally expire when the date rolls over.
 */
function dismissedKey(dealId: string): string {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz
  return `closing_prompt_dismissed_${today}_${dealId}`;
}

function isDismissed(dealId: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(dealId)) === "1";
  } catch {
    return false;
  }
}

function dismiss(dealId: string) {
  try {
    localStorage.setItem(dismissedKey(dealId), "1");
  } catch { /* ignore */ }
}

export function ClosingDayPrompt({ dealsClosingToday }: ClosingDayPromptProps) {
  const router = useRouter();
  // Filter out any deals the user already dismissed today
  const [queue, setQueue] = useState<PipelineDeal[]>([]);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const pending = dealsClosingToday.filter((d) => !isDismissed(d.id));
    if (pending.length > 0) {
      setQueue(pending);
      const t = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(t);
    }
  }, [dealsClosingToday]);

  // Current deal at the front of the queue
  const current = queue[0] ?? null;

  function handleDismiss() {
    if (!current) return;
    dismiss(current.id);
    const next = queue.slice(1);
    if (next.length === 0) {
      setVisible(false);
      setTimeout(() => setQueue([]), 500); // wait for fade-out
    } else {
      setQueue(next);
    }
  }

  function handleRegister() {
    if (!current) return;
    dismiss(current.id);
    // Navigate to pipeline tab — the user will click the checkmark to register
    router.push("/transactions?tab=pipeline");
  }

  function handleDelayed() {
    if (!current) return;
    dismiss(current.id);
    // Navigate to pipeline tab so they can update the expected close date
    router.push("/transactions?tab=pipeline");
  }

  if (!mounted || !current) return null;

  const remaining = queue.length;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-border/80 bg-card shadow-xl transition-all duration-500",
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-8 opacity-0 pointer-events-none",
      )}
    >
      {/* Emerald accent bar */}
      <div className="h-1 rounded-t-2xl bg-gradient-to-r from-emerald-500 to-teal-400" />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <CalendarCheck className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              Closing Today
              {remaining > 1 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  {remaining}
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Deal address */}
        <p className="text-sm font-semibold leading-snug mb-1 truncate">
          {current.address || "Unnamed deal"}
        </p>

        {/* Client + stage context */}
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          {current.client_name ? (
            <>
              <span className="font-medium text-foreground">{current.client_name}</span>
              {" · "}
            </>
          ) : null}
          This deal was scheduled to close today. Did everything go through?
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
            onClick={handleRegister}
          >
            <CalendarCheck className="mr-1.5 h-3.5 w-3.5" />
            Yes — register as closed
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs h-8 border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={handleDelayed}
          >
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            It&apos;s been delayed — update date
          </Button>
        </div>

        {/* Multi-deal hint */}
        {remaining > 1 && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            {remaining - 1} more deal{remaining - 1 !== 1 ? "s" : ""} closing today
          </p>
        )}
      </div>
    </div>
  );
}
