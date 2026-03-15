import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsContent } from "./settings-content";
import { type UserSettings, type PlaidItem } from "@/lib/types/database";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ensure a user_settings row exists (trigger may not have fired at signup)
  await supabase
    .from("user_settings")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  const plaidConfigured = !!(
    process.env.PLAID_CLIENT_ID &&
    process.env.PLAID_SECRET &&
    process.env.PLAID_ENV
  );

  const [{ data: settings }, { data: plaidItems }] = await Promise.all([
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("plaid_items")
      // access_token is intentionally excluded — server-only credential
      .select("id, user_id, plaid_item_id, institution_id, institution_name, sync_cursor, last_synced_at, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (!settings) redirect("/dashboard");

  return (
    <SettingsContent
      settings={settings as UserSettings}
      plaidItems={(plaidItems ?? []) as PlaidItem[]}
      plaidConfigured={plaidConfigured}
    />
  );
}
