"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { convertBetaOrgToPaid } from "@/lib/actions/beta-conversion";

interface Props {
  orgId: string;
  /** Active member count INCLUDING the owner/leader seat. */
  activeMemberCount: number;
  /**
   * Whether the org is still flagged is_beta. When true the button first
   * converts the org (is_beta → false) via the server action, THEN starts
   * checkout. When false it goes straight to checkout. Either way members keep
   * Pro the whole time (the seed grant + active membership cover the window;
   * the webhook re-grounds access on the live subscription after checkout).
   */
  isBeta: boolean;
  billing?: "monthly" | "annual";
  className?: string;
  label?: string;
}

export function TeamSubscribeButton({
  orgId,
  activeMemberCount,
  isBeta,
  billing = "monthly",
  className,
  label = "Subscribe Team",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    const res = await fetch("/api/create-team-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: orgId,
        // Member seats = everyone except the leader's own seat.
        member_count: Math.max(0, activeMemberCount - 1),
        billing,
      }),
    });

    let data: { url?: string; error?: string } = {};
    try {
      data = (await res.json()) as { url?: string; error?: string };
    } catch {
      // fall through to generic error below
    }

    if (res.status === 503) {
      toast.error(
        data.error ?? "Payments are not yet activated. Please try again shortly.",
      );
      return;
    }

    if (data.url) {
      window.location.href = data.url;
      return;
    }

    toast.error(data.error ?? "Could not start checkout.");
  }

  async function handleClick() {
    setLoading(true);
    try {
      // If still on beta, flip is_beta=false first so checkout is reachable.
      // This is gap-safe: members keep Pro via their seeded individual grant +
      // active membership until the subscription activates.
      if (isBeta) {
        const { error } = await convertBetaOrgToPaid(orgId);
        if (error) {
          toast.error(error);
          setLoading(false);
          return;
        }
      }
      await startCheckout();
    } catch {
      toast.error("Could not start checkout.");
    } finally {
      // If checkout redirected, this never runs; on any non-redirect path we
      // refresh so the (possibly newly un-gated) billing UI reflects the flip.
      setLoading(false);
      router.refresh();
    }
  }

  return (
    <Button className={className} onClick={handleClick} disabled={loading}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </Button>
  );
}
