import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { OrgSettingsContent } from "./org-settings-content";

export default async function OrgSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgContext = await getOrgContext();
  if (!orgContext || !orgContext.isAdmin) {
    redirect("/org");
  }

  return (
    <OrgSettingsContent
      org={orgContext.org}
      isOwner={orgContext.isOwner}
    />
  );
}
