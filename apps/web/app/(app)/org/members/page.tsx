import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { MembersContent } from "./members-content";
import type {
  OrganizationMember,
  OrganizationInvitation,
} from "@/lib/types/organizations";

export default async function MembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgContext = await getOrgContext();
  if (!orgContext || !orgContext.isAdmin) {
    redirect("/org");
  }

  // Fetch all members with display names
  const { data: members } = await supabase
    .from("organization_members")
    .select("*, user_settings(display_name, avatar_url)")
    .eq("org_id", orgContext.org.id)
    .neq("status", "departed")
    .order("created_at", { ascending: true })
    .limit(10000);

  // Fetch pending invitations
  const { data: invitations } = await supabase
    .from("organization_invitations")
    .select("*")
    .eq("org_id", orgContext.org.id)
    .is("accepted_at", null)
    .order("created_at", { ascending: false })
    .limit(10000);

  return (
    <MembersContent
      org={orgContext.org}
      isOwner={orgContext.isOwner}
      members={(members ?? []) as (OrganizationMember & {
        user_settings: { display_name: string; avatar_url: string } | null;
      })[]}
      invitations={(invitations ?? []) as OrganizationInvitation[]}
    />
  );
}
