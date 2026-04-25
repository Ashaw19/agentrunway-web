"use client";

/**
 * PolicyUpdateBanner
 * ------------------
 * Surfaces inside the (app) layout when one or more policies have been
 * materially updated since the user last accepted them. Required by Cox
 * & Palmer review (April 25, 2026) Comments 0/11/45/94: "users should be
 * alerted that a new version of the [Policy/Terms] is available the first
 * time they log into their portal after [it] has been updated."
 *
 * The server component (layout) is responsible for the comparison:
 *   - Read the user's most-recent acceptance per policy from
 *     policy_acceptances
 *   - Diff against POLICY_VERSIONS
 *   - Pass `pendingPolicies` to this component
 *
 * Action: clicking "I have read and accept the updates" POSTs the pending
 * policy slugs to /api/auth/accept-policies with context="policy_update_banner".
 * On success the banner dismisses for the rest of the session.
 *
 * Note: the banner is informational, not a hard gate — the user can keep
 * using the app without clicking accept. We surface the prompt every page
 * load until they accept or stop using the Service. (A hard gate is
 * appropriate for material breaking changes; we'll add a `mustAccept` mode
 * later if a future revision warrants it.)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, X, Check } from "lucide-react";
import {
  POLICY_LABELS,
  POLICY_PATHS,
  type PolicyType,
} from "@/lib/policy-versions";

interface Props {
  pendingPolicies: PolicyType[];
}

export function PolicyUpdateBanner({ pendingPolicies }: Props) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  if (dismissed || pendingPolicies.length === 0) return null;

  const policyList = pendingPolicies
    .map((p) => POLICY_LABELS[p])
    .reduce<string>((acc, label, idx, arr) => {
      if (idx === 0) return label;
      if (idx === arr.length - 1) return arr.length === 2 ? `${acc} and ${label}` : `${acc}, and ${label}`;
      return `${acc}, ${label}`;
    }, "");

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/accept-policies", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          policies: pendingPolicies,
          context:  "policy_update_banner",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to record acceptance");
      }
      // Refresh server data so the layout re-queries acceptances and the
      // banner stops rendering.
      setDismissed(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div
      role="region"
      aria-label="Policy update notice"
      className="border-b border-amber-300/40 bg-amber-50 dark:border-amber-700/30 dark:bg-amber-950/20"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5 sm:px-6">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Our {policyList} {pendingPolicies.length > 1 ? "have" : "has"} been updated.
          </p>
          <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-200/80 leading-snug">
            Please review the changes:{" "}
            {pendingPolicies.map((p, idx) => (
              <span key={p}>
                <a
                  href={POLICY_PATHS[p]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
                >
                  {POLICY_LABELS[p]}
                </a>
                {idx < pendingPolicies.length - 1 && <span className="text-amber-700/70">{" · "}</span>}
              </span>
            ))}
          </p>
          {error && (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">{error}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleAccept}
            disabled={accepting}
            className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            {accepting ? "Recording…" : "I have read and accept the updates"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss for now"
            className="rounded-md p-1 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            title="Dismiss for now (the banner will return on your next visit until you accept)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
