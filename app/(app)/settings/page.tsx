import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsContent } from "./settings-content";
import { type UserSettings } from "@/lib/types/database";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return <SettingsContent settings={settings as UserSettings} />;
}
