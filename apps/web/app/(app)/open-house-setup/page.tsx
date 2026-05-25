import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OpenHouseSetupContent } from "./open-house-setup-content";

export const metadata: Metadata = { title: "Open House Setup" };

export default async function OpenHouseSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: settings }, { data: existingPage }] = await Promise.all([
    supabase
      .from("user_settings")
      .select("display_name, brokerage_name, avatar_url, phone")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("agent_open_houses")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <OpenHouseSetupContent
      userId={user.id}
      userEmail={user.email ?? ""}
      displayName={settings?.display_name ?? ""}
      brokerageName={settings?.brokerage_name ?? ""}
      phone={settings?.phone ?? ""}
      avatarUrl={settings?.avatar_url ?? ""}
      existingPage={existingPage}
    />
  );
}
