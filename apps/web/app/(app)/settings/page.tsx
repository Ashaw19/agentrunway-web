import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsContent } from "./settings-content";
import { AccountantShareManager } from "@/components/accountant-share-manager";
import { computeIsPro } from "@/lib/compute-is-pro";
import { type UserSettings, type PlaidItem } from "@/lib/types/database";


export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const plaidConfigured = !!(
    process.env.PLAID_CLIENT_ID &&
    process.env.PLAID_SECRET &&
    process.env.PLAID_ENV
  );

  // Ensure user_settings row exists BEFORE reading it (sequential to avoid race condition)
  await supabase
    .from("user_settings")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  // Now read settings and other data in parallel.
  // google_connections is intentionally NOT fetched: the Google Integrations
  // card is gated off (SHOW_GOOGLE_INTEGRATIONS_CARD=false) per CASA shelf
  // (memory/project_google_integrations.md). Loading the row would waste a
  // round-trip and serialise OAuth scope flags into the client bundle on
  // every Settings load.
  const [{ data: settingsRaw }, { data: plaidItems }, { data: emailConnections }] = await Promise.all([
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("plaid_items")
      // access_token is intentionally excluded — server-only credential
      .select("id, user_id, plaid_item_id, institution_id, institution_name, sync_cursor, last_synced_at, created_at, updated_at, error_code, error_message")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("email_connections")
      .select("id, provider, email_address, display_name, connection_name, smtp_host, smtp_port, calendar_sync_enabled, connected_at")
      .eq("user_id", user.id)
      .order("connected_at", { ascending: false }),
  ]);

  if (!settingsRaw) redirect("/dashboard");

  const settings = settingsRaw;
  const isPro = (settings as UserSettings).is_admin || await computeIsPro(supabase, user.id, settings);

  return (
    <div className="space-y-6">
      <SettingsContent
        settings={settings as UserSettings}
        plaidItems={(plaidItems ?? []) as PlaidItem[]}
        plaidConfigured={plaidConfigured}
        googleConnection={null}
        emailConnections={emailConnections ?? []}
        isPro={isPro}
      />
      {isPro ? (
        <AccountantShareManager />
      ) : null}
    </div>
  );
}
