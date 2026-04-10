"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  Plus,
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
} from "lucide-react";
import { createOrganization, inviteMembers } from "@/lib/actions/org-actions";

type Step = "details" | "leaders" | "review";

export function CreateOrgContent() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [creating, setCreating] = useState(false);

  // Step 1: Org details
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<"team" | "brokerage">("team");

  // Step 2: Leaders/managers
  const [leaderEmail, setLeaderEmail] = useState("");
  const [leaders, setLeaders] = useState<string[]>([]);

  // Step 3: Members
  const [memberEmail, setMemberEmail] = useState("");
  const [members, setMembers] = useState<string[]>([]);

  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const addLeader = () => {
    const email = leaderEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (leaders.includes(email) || members.includes(email)) {
      toast.error("Already added");
      return;
    }
    setLeaders([...leaders, email]);
    setLeaderEmail("");
  };

  const addMember = () => {
    const email = memberEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (leaders.includes(email) || members.includes(email)) {
      toast.error("Already added");
      return;
    }
    setMembers([...members, email]);
    setMemberEmail("");
  };

  const handleCreate = async () => {
    if (!orgName.trim() || slug.length < 3) {
      toast.error("Organization name must be at least 3 characters");
      return;
    }

    setCreating(true);
    try {
      // 1. Create the org
      const { data: org, error: orgError } = await createOrganization(
        orgName.trim(),
        orgType,
        slug,
      );

      if (orgError || !org) {
        toast.error(orgError ?? "Failed to create organization");
        return;
      }

      // 2. Invite leaders as admins
      if (leaders.length > 0) {
        const { error: leaderErr } = await inviteMembers(
          org.id,
          leaders,
          "admin",
        );
        if (leaderErr) {
          console.error("Failed to invite leaders:", leaderErr);
          toast.error("Org created but some leader invites failed");
        }
      }

      // 3. Invite members as agents
      if (members.length > 0) {
        const { error: memberErr } = await inviteMembers(
          org.id,
          members,
          "agent",
        );
        if (memberErr) {
          console.error("Failed to invite members:", memberErr);
        }
      }

      toast.success(`${orgName} created successfully!`);
      router.push("/org/members?welcome=1");
    } catch {
      toast.error("Something went wrong — try again");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto py-12 px-4 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">
          Create Your {orgType === "team" ? "Team" : "Brokerage"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Set up your organization and invite your people.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {(["details", "leaders", "review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                step === s
                  ? "bg-violet-600 text-white border-violet-600"
                  : ["details", "leaders", "review"].indexOf(step) > i
                    ? "bg-violet-100 text-violet-600 border-violet-300"
                    : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {["details", "leaders", "review"].indexOf(step) > i ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                i + 1
              )}
            </div>
            {i < 2 && (
              <div className="w-8 h-0.5 bg-border" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Details */}
      {step === "details" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Organization Details</CardTitle>
            <CardDescription>What type of organization are you creating?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setOrgType("team")}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  orgType === "team"
                    ? "border-violet-500 bg-violet-50"
                    : "border-border hover:border-violet-300"
                }`}
              >
                <Users className="h-5 w-5 text-violet-500 mb-2" />
                <p className="font-semibold text-sm">Team</p>
                <p className="text-xs text-muted-foreground">2–20 agents</p>
              </button>
              <button
                onClick={() => setOrgType("brokerage")}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  orgType === "brokerage"
                    ? "border-violet-500 bg-violet-50"
                    : "border-border hover:border-violet-300"
                }`}
              >
                <Building2 className="h-5 w-5 text-violet-500 mb-2" />
                <p className="font-semibold text-sm">Brokerage</p>
                <p className="text-xs text-muted-foreground">50–500+ agents</p>
              </button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Ellis Realty"
              />
              {slug && (
                <p className="text-xs text-muted-foreground">
                  URL: agentrunway.ca/org/{slug}
                </p>
              )}
            </div>

            <Button
              className="w-full gap-2"
              disabled={!orgName.trim() || slug.length < 3}
              onClick={() => setStep("leaders")}
            >
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Leaders & Members */}
      {step === "leaders" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invite Your Team</CardTitle>
            <CardDescription>
              Enter each person&apos;s email and hit the + button to add them.
              They&apos;ll get an invite with a link to join.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Leaders */}
            <div className="space-y-2">
              <Label>Team Leaders</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Managers and admins — they&apos;ll have full access to team reports, billing, and settings.
              </p>
              <div className="flex gap-2">
                <Input
                  value={leaderEmail}
                  onChange={(e) => setLeaderEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addLeader()}
                  placeholder="e.g. erin@ellisrealty.ca"
                  className="flex-1"
                />
                <Button variant="outline" size="icon" onClick={addLeader}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {leaders.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {leaders.map((e) => (
                    <Badge key={e} variant="secondary" className="gap-1 text-xs">
                      {e}
                      <button onClick={() => setLeaders(leaders.filter((l) => l !== e))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Members */}
            <div className="space-y-2">
              <Label>Team Members</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Your agents — they&apos;ll get their own dashboard and tools.
              </p>
              <div className="flex gap-2">
                <Input
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMember()}
                  placeholder="e.g. sarah@ellisrealty.ca"
                  className="flex-1"
                />
                <Button variant="outline" size="icon" onClick={addMember}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {members.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {members.map((e) => (
                    <Badge key={e} variant="secondary" className="gap-1 text-xs">
                      {e}
                      <button onClick={() => setMembers(members.filter((m) => m !== e))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setStep("details")}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button className="flex-1 gap-2" onClick={() => setStep("review")}>
                Review <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review & Create</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{orgName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Type</span>
                <Badge variant="outline">{orgType}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">URL</span>
                <span className="text-xs text-muted-foreground">/org/{slug}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Team Leaders</span>
                <span>{leaders.length || "None yet"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Team Members</span>
                <span>{members.length || "None yet"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total People</span>
                <span className="font-bold">{1 + leaders.length + members.length}</span>
              </div>
            </div>

            {leaders.length + members.length > 0 && (
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
                {leaders.length + members.length} invite{leaders.length + members.length !== 1 ? "s" : ""} will be sent.
                Everyone will get an email with a link to join — if they&apos;re new to Agent Runway, they&apos;ll set up their account first.
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setStep("leaders")}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                className="flex-1 gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                ) : (
                  <><Check className="h-4 w-4" /> Create {orgType === "team" ? "Team" : "Brokerage"}</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
