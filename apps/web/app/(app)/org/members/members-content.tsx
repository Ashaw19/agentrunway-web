"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  Crown,
  X,
  Clock,
  Loader2,
  Copy,
  Check,
  PartyPopper,
  Rocket,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  inviteMembers,
  removeMember,
  updateMemberRole,
  revokeInvitation,
} from "@/lib/actions/org-actions";
import type {
  Organization,
  OrganizationMember,
  OrganizationInvitation,
  OrgMemberRole,
} from "@/lib/types/organizations";
import {
  ORG_MEMBER_ROLE_LABELS,
  ORG_MEMBER_STATUS_LABELS,
} from "@/lib/types/organizations";

interface MemberWithProfile extends OrganizationMember {
  user_settings: { display_name: string; avatar_url: string } | null;
}

interface Props {
  org: Organization;
  isOwner: boolean;
  members: MemberWithProfile[];
  invitations: OrganizationInvitation[];
}

export function MembersContent({
  org,
  isOwner,
  members: initialMembers,
  invitations: initialInvitations,
}: Props) {
  const _router = useRouter();
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "1";
  const [showWelcome, setShowWelcome] = useState(isWelcome);
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgMemberRole>("agent");
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Invite progress: how many total invites vs accepted (now active members minus the owner)
  const totalInvited = invitations.length + members.filter((m) => m.role !== "owner").length;
  const totalAccepted = members.filter((m) => m.role !== "owner" && m.status === "active").length;

  function handleCopyLink(inv: OrganizationInvitation) {
    const appUrl = typeof window !== "undefined" ? window.location.origin : "https://agentrunway.ca";
    void navigator.clipboard.writeText(`${appUrl}/invite/${inv.token}`);
    setCopiedId(inv.id);
    toast.success("Invite link copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setSending(true);
    const emails = inviteEmail
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));

    if (emails.length === 0) {
      toast.error("Please enter valid email addresses");
      setSending(false);
      return;
    }

    const { data, error } = await inviteMembers(org.id, emails, inviteRole);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`Invited ${emails.length} member${emails.length > 1 ? "s" : ""}`);
      setInviteEmail("");
      if (data) setInvitations((prev) => [...data, ...prev]);
    }
    setSending(false);
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from ${org.name}? Their data will no longer be visible.`)) return;

    const { error } = await removeMember(org.id, userId);
    if (error) {
      toast.error(error);
    } else {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
      toast.success(`${name} has been removed`);
    }
  }

  async function handleRoleChange(userId: string, newRole: OrgMemberRole) {
    const { data, error } = await updateMemberRole(org.id, userId, newRole);
    if (error) {
      toast.error(error);
    } else if (data) {
      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)),
      );
      toast.success("Role updated");
    }
  }

  async function handleRevokeInvite(id: string) {
    const { error } = await revokeInvitation(org.id, id);
    if (error) {
      toast.error(error);
    } else {
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      toast.success("Invitation revoked");
    }
  }

  const roleIcon = (role: OrgMemberRole) => {
    if (role === "owner") return <Crown className="h-3.5 w-3.5 text-amber-500" />;
    if (role === "admin") return <Shield className="h-3.5 w-3.5 text-blue-500" />;
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Users className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {members.filter((m) => m.status === "active").length} / {org.max_seats} seats
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your organization members and invitations
        </p>
      </div>

      {/* Welcome Banner — shown after org creation */}
      {showWelcome && (
        <div className="relative rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-5">
          <button
            onClick={() => setShowWelcome(false)}
            className="absolute top-3 right-3 text-muted-foreground/50 hover:text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-500/10 p-2.5 shrink-0">
              <PartyPopper className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-900">
                {org.name} is live!
              </h3>
              <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                Your organization is set up and ready to go. Now invite your team members below —
                enter their emails (comma-separated for batch) and they&apos;ll receive a branded
                invitation with a one-click accept link.
              </p>
              <div className="flex items-center gap-4 mt-3 text-[11px] text-emerald-600">
                <span className="flex items-center gap-1">
                  <Rocket className="h-3 w-3" />
                  Tip: They&apos;ll complete their own setup after accepting
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Progress — shown when invites have been sent */}
      {totalInvited > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              Invite Progress
            </span>
            <span className="text-xs font-bold">
              {totalAccepted} of {totalInvited} accepted
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                totalAccepted === totalInvited ? "bg-emerald-500" : "bg-orange-500",
              )}
              style={{ width: `${totalInvited > 0 ? (totalAccepted / totalInvited) * 100 : 0}%` }}
            />
          </div>
          {totalAccepted === totalInvited && totalInvited > 0 && (
            <p className="text-[11px] text-emerald-600 mt-1.5 font-medium">
              Everyone&apos;s on board! Check your team dashboard for live metrics.
            </p>
          )}
          {invitations.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {invitations.length} invite{invitations.length !== 1 ? "s" : ""} still pending
            </p>
          )}
        </div>
      )}

      {/* Invite Form */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-orange-500" />
          Invite Someone New
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Add their email, pick their role, and hit send. They&apos;ll get a link to join.
          You can invite multiple people at once — just separate emails with commas.
        </p>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="e.g. newagent@email.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as OrgMemberRole)}
            className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="agent">Team Member</option>
            <option value="team_leader">Team Leader</option>
            {isOwner && <option value="admin">Admin</option>}
          </select>
          <Button type="submit" disabled={sending} className="gap-2 shrink-0">
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Send Invite
          </Button>
        </form>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending Invitations ({invitations.length})
            </h3>
          </div>
          <div className="divide-y">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ORG_MEMBER_ROLE_LABELS[inv.role]} · Expires{" "}
                    {new Date(inv.expires_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyLink(inv)}
                    className="text-xs text-muted-foreground hover:text-orange-500 transition-colors p-1"
                    title="Copy invite link"
                  >
                    {copiedId === inv.id ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleRevokeInvite(inv.id)}
                    className="text-xs text-muted-foreground hover:text-rose-500 transition-colors"
                    title="Revoke invitation"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members List */}
      <div className="rounded-xl border bg-card">
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Active Members</h3>
        </div>
        <div className="divide-y">
          {members.map((member) => {
            const displayName =
              member.user_settings?.display_name || "Unnamed Agent";
            return (
              <div
                key={member.id}
                className="flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {member.user_settings?.avatar_url ? (
                    <Image
                      src={member.user_settings.avatar_url}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/10 text-xs font-semibold text-orange-500">
                      {displayName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      {roleIcon(member.role)}
                      {displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ORG_MEMBER_STATUS_LABELS[member.status]}
                      {member.data_sharing_tier === "tier2" && (
                        <span className="ml-2 text-emerald-500">
                          Extended Sharing
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {member.role !== "owner" && (
                  <div className="flex items-center gap-2">
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleRoleChange(
                          member.user_id,
                          e.target.value as OrgMemberRole,
                        )
                      }
                      className="rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="agent">Team Member</option>
                      <option value="team_leader">Team Leader</option>
                      {isOwner && <option value="admin">Admin</option>}
                    </select>
                    <button
                      onClick={() =>
                        handleRemove(member.user_id, displayName)
                      }
                      className="text-xs text-muted-foreground hover:text-rose-500 transition-colors p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {members.length <= 1 && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                It&apos;s just you so far. Invite your team using the form above — they&apos;ll get an email with a link to join.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
