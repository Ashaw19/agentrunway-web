"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Eye, EyeOff, AlertTriangle, Loader2, Target, CreditCard, Users, Shield, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateOrgSettings } from "@/lib/actions/org-actions";
import { fmtCurrency } from "@/lib/formatters";
import type { Organization } from "@/lib/types/organizations";
import { ORG_TYPE_LABELS } from "@/lib/types/organizations";

interface Props {
  org: Organization;
  isOwner: boolean;
  role: string;
  activeMemberCount?: number;
}

export function OrgSettingsContent({ org, isOwner, role, activeMemberCount = 0 }: Props) {
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [anonymize, setAnonymize] = useState(org.anonymize_agents);
  const [goalEnabled, setGoalEnabled] = useState(org.org_goal_gci != null && org.org_goal_gci > 0);
  const [goalValue, setGoalValue] = useState(
    org.org_goal_gci != null && org.org_goal_gci > 0 ? String(org.org_goal_gci) : "",
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const orgGoalGci = goalEnabled && goalValue.trim()
      ? Number(goalValue.replace(/[^0-9.]/g, ""))
      : null;
    const { error } = await updateOrgSettings(org.id, {
      name: name.trim(),
      anonymize_agents: anonymize,
      org_goal_gci: orgGoalGci && orgGoalGci > 0 ? orgGoalGci : null,
    });
    if (error) {
      toast.error(error);
    } else {
      toast.success("Settings saved");
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Settings className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold tracking-tight">
            Organization Settings
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your organization preferences
        </p>
      </div>

      {/* General Settings */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <h3 className="text-sm font-semibold">General</h3>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Organization Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Slug (URL identifier)
          </label>
          <input
            type="text"
            value={org.slug}
            disabled
            className="w-full rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
          />
          <p className="text-[10px] text-muted-foreground/60">
            Cannot be changed after creation
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Type
          </label>
          <p className="text-sm">{ORG_TYPE_LABELS[org.type]}</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Max Seats
          </label>
          <p className="text-sm">{org.max_seats}</p>
        </div>
      </div>

      {/* Organization Goal */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <h3 className="text-sm font-semibold">Organization Goal</h3>

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-teal-500" />
              Aggregate GCI Goal
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Set an optional organization-wide GCI target. Individual agent
              goals are always tracked independently.
            </p>
          </div>
          <button
            onClick={() => {
              setGoalEnabled(!goalEnabled);
              if (goalEnabled) setGoalValue("");
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              goalEnabled ? "bg-orange-500" : "bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                goalEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {goalEnabled && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Annual GCI Target
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={goalValue}
              onChange={(e) => setGoalValue(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 2000000"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {goalValue && Number(goalValue) > 0 && (
              <p className="text-xs text-muted-foreground">
                {fmtCurrency(Number(goalValue))}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Privacy Settings */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <h3 className="text-sm font-semibold">Privacy</h3>

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium flex items-center gap-2">
              {anonymize ? (
                <EyeOff className="h-4 w-4 text-amber-500" />
              ) : (
                <Eye className="h-4 w-4 text-emerald-500" />
              )}
              Agent Anonymization
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              When enabled, agent names are replaced with &quot;Agent A&quot;,
              &quot;Agent B&quot; on the organization dashboard.
            </p>
          </div>
          <button
            onClick={() => setAnonymize(!anonymize)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              anonymize ? "bg-orange-500" : "bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                anonymize ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Billing & Subscription — team_leader only */}
      {["team_leader", "owner"].includes(role) && <div className="rounded-xl border bg-card p-5 space-y-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-500" />
            Billing & Subscription
          </h3>

          <div className="grid gap-3 text-sm">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                {org.is_beta ? (
                  <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">
                    <Shield className="h-3 w-3 mr-1" />
                    Beta — Lifetime Free
                  </Badge>
                ) : org.subscription_status === "active" ? (
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                ) : org.subscription_status === "trialing" ? (
                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                    Trial
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    {org.subscription_status ?? "No subscription"}
                  </Badge>
                )}
              </div>
            </div>

            {/* Seats */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Seats</span>
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                {activeMemberCount} / {org.max_seats}
              </span>
            </div>

            {/* Billing email */}
            {org.billing_email && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Billing email</span>
                <span>{org.billing_email}</span>
              </div>
            )}
          </div>

          {/* Manage billing or Subscribe */}
          {!org.is_beta && (
            <div className="pt-2">
              {org.stripe_subscription_id ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/customer-portal", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ org_id: org.id }),
                      });
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else {
                        toast.error("Could not open billing portal");
                      }
                    } catch {
                      toast.error("Could not open billing portal");
                    }
                  }}
                >
                  <CreditCard className="h-4 w-4" />
                  Manage Billing
                </Button>
              ) : (
                <Button
                  className="gap-2"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/create-team-checkout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          org_id: org.id,
                          member_count: Math.max(0, activeMemberCount - 1),
                          billing: "monthly",
                        }),
                      });
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else {
                        toast.error(data.error ?? "Could not start checkout");
                      }
                    } catch {
                      toast.error("Could not start checkout");
                    }
                  }}
                >
                  Subscribe Team
                </Button>
              )}
            </div>
          )}
      </div>}

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Save Changes
      </Button>

      {/* Danger Zone */}
      {isOwner && (
        <div className="rounded-xl border border-rose-500/20 bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-rose-500 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </h3>
          <p className="text-xs text-muted-foreground">
            These actions are irreversible. Deleting the organization will
            remove all member associations and audit history.
          </p>
          <Button
            variant="outline"
            className="border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
            onClick={() =>
              toast.error(
                "Contact support@agentrunway.ca to delete your organization",
              )
            }
          >
            Delete Organization
          </Button>
        </div>
      )}
    </div>
  );
}
