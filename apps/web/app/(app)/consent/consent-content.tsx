"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Shield,
  Eye,
  EyeOff,
  LogOut,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  updateConsent,
  leaveOrganization,
} from "@/lib/actions/org-actions";
import type {
  Organization,
  OrganizationMember,
  DataSharingTier,
} from "@/lib/types/organizations";
import {
  ORG_TYPE_LABELS,
  CURRENT_CONSENT_VERSION,
} from "@/lib/types/organizations";

interface MembershipWithOrg {
  membership: OrganizationMember;
  org: Organization;
}

interface Props {
  memberships: MembershipWithOrg[];
}

export function ConsentContent({ memberships: initialMemberships }: Props) {
  const router = useRouter();
  const [memberships, setMemberships] = useState(initialMemberships);
  const [saving, setSaving] = useState<string | null>(null);

  async function handleTierChange(orgId: string, tier: DataSharingTier) {
    // Track if this is a first-time activation (pending → active)
    const wasPending = memberships.find(
      (m) => m.membership.org_id === orgId,
    )?.membership.status === "pending";

    setSaving(orgId);
    const { data, error } = await updateConsent(orgId, tier);
    if (error) {
      toast.error(error);
    } else if (data) {
      setMemberships((prev) =>
        prev.map((m) =>
          m.membership.org_id === orgId
            ? { ...m, membership: { ...m.membership, ...data } }
            : m,
        ),
      );
      if (wasPending) {
        toast.success("You're all set! Redirecting to your dashboard…");
        setSaving(null);
        router.push("/dashboard");
        return;
      }
      toast.success(
        tier === "tier2"
          ? "Extended sharing enabled"
          : "Switched to basic sharing",
      );
      router.refresh();
    }
    setSaving(null);
  }

  async function handleLeave(orgId: string, orgName: string) {
    if (
      !confirm(
        `Leave ${orgName}? Your data will immediately become invisible to the organization. This cannot be undone.`,
      )
    )
      return;

    setSaving(orgId);
    const { error } = await leaveOrganization(orgId);
    if (error) {
      toast.error(error);
    } else {
      setMemberships((prev) =>
        prev.filter((m) => m.membership.org_id !== orgId),
      );
      toast.success(`Left ${orgName}`);
      router.refresh();
    }
    setSaving(null);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Lock className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold tracking-tight">
            My Data Consent
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Control what data your organizations can see
        </p>
      </div>

      {memberships.map(({ membership, org }) => (
        <div key={membership.id} className="rounded-xl border bg-card">
          {/* Org Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h3 className="text-base font-semibold">{org.name}</h3>
              <p className="text-xs text-muted-foreground">
                {ORG_TYPE_LABELS[org.type]} · {membership.role}
                {membership.status === "pending" && (
                  <span className="ml-2 text-amber-500 font-medium">
                    Pending consent
                  </span>
                )}
              </p>
            </div>
            <Shield className="h-5 w-5 text-muted-foreground/40" />
          </div>

          {/* Consent Level */}
          <div className="px-5 py-4 space-y-4">
            {/* Tier 1 — Basic */}
            <label
              className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                membership.data_sharing_tier === "tier1"
                  ? "border-orange-500/50 bg-orange-500/5"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              <input
                type="radio"
                name={`tier-${membership.id}`}
                checked={membership.data_sharing_tier === "tier1"}
                onChange={() => handleTierChange(org.id, "tier1")}
                disabled={saving === org.id}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Basic Sharing (Tier 1)</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Only YTD GCI, deal count, and pipeline summary are visible to
                  admins. This is the minimum required to participate.
                </p>
              </div>
            </label>

            {/* Tier 2 — Extended */}
            <label
              className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                membership.data_sharing_tier === "tier2"
                  ? "border-orange-500/50 bg-orange-500/5"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              <input
                type="radio"
                name={`tier-${membership.id}`}
                checked={membership.data_sharing_tier === "tier2"}
                onChange={() => handleTierChange(org.id, "tier2")}
                disabled={saving === org.id}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-emerald-500" />
                  <p className="text-sm font-medium">
                    Extended Sharing (Tier 2)
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Additionally shares monthly GCI breakdown and qualitative
                  expense ratio. Helps your brokerage provide better coaching.
                </p>
              </div>
            </label>

            {saving === org.id && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </div>
            )}

            {/* Never shared */}
            <div className="rounded-lg bg-muted/30 p-4">
              <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                Never Shared (Tier 3)
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tax data, expense amounts, commission splits, cash reserves,
                individual transaction details, and previous years&apos;
                earnings are <strong>never</strong> accessible to organization
                administrators regardless of your sharing level.
              </p>
            </div>
          </div>

          {/* Leave Organization */}
          {membership.role !== "owner" && (
            <div className="px-5 py-4 border-t">
              <button
                onClick={() => handleLeave(org.id, org.name)}
                disabled={saving === org.id}
                className="flex items-center gap-2 text-xs text-rose-500 hover:text-rose-400 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Leave {org.name}
              </button>
            </div>
          )}
        </div>
      ))}

      <p className="text-[10px] text-muted-foreground/60 italic leading-relaxed">
        Consent version {CURRENT_CONSENT_VERSION}. Changes take effect
        immediately. If you leave an organization, all your data becomes
        immediately invisible to administrators.
      </p>
    </div>
  );
}
