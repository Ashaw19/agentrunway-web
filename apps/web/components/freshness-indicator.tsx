"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format/relative-time";

interface Props {
  /** ISO timestamp the data was loaded/synced at (server render time). */
  since: string;
  className?: string;
  /** Show the live dot (only honest when the view re-syncs on focus). */
  live?: boolean;
}

/**
 * "Updated just now / Xm ago" freshness line. The anchor is the server data
 * load time; on a focus-triggered re-sync the page re-renders with a fresh
 * `since`, so the line resets — making it a real liveness signal rather than a
 * decorative one. The relative string ticks once a minute; for
 * prefers-reduced-motion users it renders once and does not tick.
 */
export function FreshnessIndicator({ since, className, live = true }: Props) {
  const [label, setLabel] = useState("Updated just now");

  useEffect(() => {
    const sinceMs = new Date(since).getTime();
    const update = () => setLabel(`Updated ${relativeTime(sinceMs, Date.now())}`);
    update();

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return; // no perpetual interval for reduced-motion users

    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [since]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {live && (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
        </span>
      )}
      {label}
    </span>
  );
}
