"use client";

/**
 * ClientMemoryPanel — "What Agent Runway remembers"
 *
 * Read-only surface for the per-client AI memory profile
 * (client_memory_profiles, built by lib/ai/client-memory-engine.ts). The
 * profile already powers outreach personalization invisibly; this panel makes
 * it visible in the client detail drawer. Reads are free (no AI call);
 * Refresh triggers a compute (rate-limited server-side, 30/hr).
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  CRM_SECTION_CARD,
  CRM_SECTION_HEADER,
  CRM_SECTION_ICON_CHIP,
} from "@/components/cockpit-ui";
import type { ClientMemoryProfile } from "@/lib/ai/client-memory-engine";

// The subset of structured facts worth showing an agent at a glance, in
// display order. Everything else stays engine-internal.
const DISPLAY_FACTS: { key: keyof ClientMemoryProfile["structured_facts"]; label: string }[] = [
  { key: "goal", label: "Goal" },
  { key: "timeline", label: "Timeline" },
  { key: "motivation", label: "Motivation" },
  { key: "pain_point", label: "Pain point" },
  { key: "objection", label: "Objection" },
  { key: "budget_context", label: "Budget context" },
  { key: "last_key_topic", label: "Last key topic" },
  { key: "next_best_angle", label: "Next best angle" },
];

interface MemoryResponse {
  success: boolean;
  profile?: ClientMemoryProfile | null;
  error?: string;
}

export function ClientMemoryPanel({ clientId }: { clientId: string }) {
  const [profile, setProfile] = useState<ClientMemoryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);

  const callMemoryApi = useCallback(
    async (action: "read" | "compute"): Promise<MemoryResponse | null> => {
      try {
        const res = await fetch("/api/ai/client-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, client_id: clientId }),
        });
        return (await res.json()) as MemoryResponse;
      } catch {
        return null;
      }
    },
    [clientId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    (async () => {
      const data = await callMemoryApi("read");
      if (cancelled) return;
      setProfile(data?.success ? (data.profile ?? null) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [callMemoryApi]);

  async function handleCompute() {
    setComputing(true);
    const data = await callMemoryApi("compute");
    setComputing(false);
    if (data?.success && data.profile) {
      setProfile(data.profile);
      toast.success("Memory profile refreshed");
    } else {
      toast.error(data?.error ?? "Could not refresh the memory profile");
    }
  }

  const facts = profile
    ? DISPLAY_FACTS.filter((f) => !!profile.structured_facts?.[f.key])
    : [];

  return (
    <div className={CRM_SECTION_CARD}>
      <div className="flex items-center justify-between">
        <h3 className={CRM_SECTION_HEADER}>
          <span className={CRM_SECTION_ICON_CHIP}>
            <Brain className="h-3 w-3" />
          </span>
          What Agent Runway remembers
          {profile?.stale && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-amber-700">
              may be outdated
            </span>
          )}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
          disabled={computing || loading}
          onClick={handleCompute}
        >
          {computing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {profile ? "Refresh" : "Build profile"}
        </Button>
      </div>

      {loading ? (
        <p className="text-[11px] text-muted-foreground">Loading…</p>
      ) : !profile ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          No memory profile yet. Build one and Agent Runway will keep a working
          summary of this client&apos;s goals, concerns, and the best next angle —
          drawn from your notes, activities, and deal history.
        </p>
      ) : (
        <div className="space-y-2.5">
          {profile.memory_summary && (
            <p className="text-[12px] leading-relaxed text-foreground/90">
              {profile.memory_summary}
            </p>
          )}
          {facts.length > 0 && (
            <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {facts.map(({ key, label }) => (
                <div key={key} className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="text-[11px] leading-snug text-foreground/85">
                    {profile.structured_facts[key]}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {profile.last_computed_at && (
            <p className="text-[9px] text-muted-foreground/70">
              Updated {new Date(profile.last_computed_at).toLocaleDateString("en-CA")}
              {" · informational summary, not advice"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
