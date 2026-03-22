import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateOrgContent } from "./create-org-content";

export default async function CreateOrgPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If user already belongs to an org, redirect to org dashboard
  const { data: existing } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    redirect("/org");
  }

  return <CreateOrgContent />;
}
