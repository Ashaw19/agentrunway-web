"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, CalendarCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PipelineDeal } from "@/lib/types/database";

// ── localStorage helpers ───────────────────────────────────────────────────────

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dismissedKey(dealId: string): string {
  return `closing_prompt_dismissed_${localToday()}_${dealId}`;
}

function isDismissed(dealId: string): boolean {
  try { return localStorage.getItem(dismissedKey(dealId)) === "1"; } catch { return false; }
}

function markDismissed(dealId: string) {
  try { localStorage.setItem(dismissedKey(dealId), "1"); } catch { /* ignore */ }
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  dealsClosingToday: PipelineDeal[];
}

export function ClosingDayPrompt({ dealsClosingToday }: Props) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [queue, setQueue] = useState<PipelineDeal[]>([]);

  useEffect(() => {
    // Filter out already-dismissed deals (localStorage — client-only)
    const pending = dealsClosingToday.filter((d) => !isDismissed(d.id));
    if (pending.length === 0) return;

    setQueue(pending);
    // Short delay so the prompt doesn't fire during the page-load paint
    const t = setTimeout(() => setShow(true), 400);
    return () => clearTimeout(t);
  }, [dealsClosingToday]);

  const current = queue[0] ?? null;

  // Don't render anything until ready — avoids any hydration / SSR mismatch
  if (!show || !current) return null;

  function next(action: "register" | "delay") {
    if (!current) return;
    markDismissed(current.id);
    const remaining = queue.slice(1);
    if (remaining.length > 0) {
      setQueue(remaining);
    } else {
      setShow(false);
      setQueue([]);
    }
    router.push("/transactions?tab=pipeline");
  }

  function handleDismiss() {
    if (!current) return;
    markDismissed(current.id);
    const remaining = queue.slice(1);
    if (remaining.length > 0) {
      setQueue(remaining);
    } else {
      setShow(false);
      setQueue([]);
    }
  }

  const remaining = queue.length;

  return (
    // z-[9999] ensures this floats above FABs, toasts, modals
    <div
      className="fixed bottom-24 right-6 z-[9999] w-80 rounded-2xl border border-border/80 bg-card shadow-2xl"
      style={{ animation: "slideUpFade 0.35s ease-out forwards" }}
    >
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Emerald accent bar */}
      <div className="h-1 rounded-t-2xl bg-gradient-to-r from-emerald-500 to-teal-400" />

      <div className="p-4">
        {/* Header */}
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

        {/* Context */}
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          {current.client_name && (
            <><span className="font-medium text-foreground">{current.client_name}</span>{" · "}</>
          )}
          This deal was scheduled to close today. Did everything go through?
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
            onClick={() => next("register")}
          >
            <CalendarCheck className="mr-1.5 h-3.5 w-3.5" />
            Yes — register as closed
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs h-8 border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={() => next("delay")}
          >
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            It&apos;s been delayed — update date
          </Button>
        </div>

        {remaining > 1 && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            {remaining - 1} more deal{remaining - 1 !== 1 ? "s" : ""} closing today
          </p>
        )}
      </div>
    </div>
  );
}
