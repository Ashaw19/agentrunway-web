"use client";

import { useSandboxMode } from "@/lib/sandbox-mode-context";
import { FlaskConical } from "lucide-react";

/**
 * Global sandbox mode indicator banner.
 * Rendered in the app layout so it appears at the top of every page
 * when sandbox mode is active.
 */
export function SandboxBanner() {
  const sandbox = useSandboxMode();

  if (!sandbox.sandboxMode) return null;

  return (
    <div className="flex items-center justify-between border-b border-amber-300/60 bg-amber-50/80 px-4 py-2">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
        </span>
        <FlaskConical className="h-3.5 w-3.5 text-amber-600" />
        <p className="text-xs font-medium text-amber-800">
          Sandbox Mode — You&apos;re exploring with fictional data.
          {sandbox.daysRemaining > 0 && (
            <span className="ml-1 text-amber-600">
              {sandbox.daysRemaining} days remaining.
            </span>
          )}
        </p>
      </div>
      <button
        onClick={sandbox.toggle}
        className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
      >
        Exit Sandbox
      </button>
    </div>
  );
}
