"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Building2, Shield, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/lib/actions/org-actions";
import type { OrganizationInvitation } from "@/lib/types/organizations";
import {
  ORG_MEMBER_ROLE_LABELS,
  ORG_TYPE_LABELS,
} from "@/lib/types/organizations";

interface Props {
  invitation: OrganizationInvitation & { org_name: string; org_type: string };
  token: string;
}

export function InviteContent({ invitation, token }: Props) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const acceptingRef = useRef(false);
  const [consentChecked, setConsentChecked] = useState(false);

  async function handleAccept() {
    if (!consentChecked) {
      toast.error("Please review and accept the data sharing consent");
      return;
    }
    if (acceptingRef.current) return;
    acceptingRef.current = true;

    setAccepting(true);
    const { data: _data, error } = await acceptInvitation(token);
    if (error) {
      if (error === "Not authenticated") {
        // Redirect to login with return URL
        acceptingRef.current = false;
        setAccepting(false);
        router.push(`/login?redirect=/invite/${token}`);
        return;
      }
      toast.error(error);
      acceptingRef.current = false;
      setAccepting(false);
    } else {
      toast.success("Welcome to the team!");
      acceptingRef.current = false;
      setAccepting(false);
      router.push("/consent");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-full bg-orange-500/10 p-4">
              <Building2 className="h-10 w-10 text-orange-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            You&apos;re Invited
          </h1>
          <p className="text-sm text-muted-foreground">
            You&apos;ve been invited to join{" "}
            <span className="font-semibold text-foreground">
              {invitation.org_name}
            </span>{" "}
            as {ORG_MEMBER_ROLE_LABELS[invitation.role].toLowerCase()}.
          </p>
        </div>

        {/* Invitation Details */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Organization</span>
            <span className="font-medium">{invitation.org_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Type</span>
            <span className="font-medium capitalize">
              {ORG_TYPE_LABELS[invitation.org_type as keyof typeof ORG_TYPE_LABELS] ?? invitation.org_type}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Your Role</span>
            <span className="font-medium">
              {ORG_MEMBER_ROLE_LABELS[invitation.role]}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Expires</span>
            <span className="text-xs text-muted-foreground">
              {new Date(invitation.expires_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* Consent Disclosure */}
        <div className="rounded-xl border border-amber-500/20 bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-500" />
            Data Sharing Disclosure
          </h3>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>By joining this organization, you agree to share the following with organization administrators:</p>
            <ul className="space-y-1 ml-4">
              <li className="flex items-start gap-2">
                <Check className="h-3 w-3 mt-0.5 text-emerald-500 shrink-0" />
                <span>YTD gross commission income (GCI) and deal count</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-3 w-3 mt-0.5 text-emerald-500 shrink-0" />
                <span>Pipeline deal count and estimated value</span>
              </li>
            </ul>
            <p className="font-medium text-foreground mt-2">
              The following are NEVER shared:
            </p>
            <ul className="space-y-1 ml-4">
              <li>• Tax data, filings, and CRA information</li>
              <li>• Expense amounts and categories</li>
              <li>• Commission splits and brokerage fees</li>
              <li>• Cash reserves and runway months</li>
              <li>• Individual transaction details</li>
              <li>• Previous years&apos; earnings</li>
            </ul>
            <p className="mt-2">
              You can upgrade to Extended Sharing (monthly breakdown) later from
              your Consent settings. You can leave the organization at any time.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 rounded border-muted-foreground/30"
            />
            <span className="text-xs">
              I understand and agree to share the listed data with organization
              administrators
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={handleAccept}
            disabled={accepting || !consentChecked}
            className="w-full gap-2"
          >
            {accepting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Accept & Join
          </Button>
          <a
            href="/dashboard"
            className="text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Decline and go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
