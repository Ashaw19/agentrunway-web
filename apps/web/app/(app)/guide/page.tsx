import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { GuideContent } from "./guide-content";
import { computeIsPro } from "@/lib/compute-is-pro";

export default async function GuidePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // `business_structure` was queried here but has never existed — 00023
  // implemented it as `is_incorporated` + `corp_type`. PostgREST rejected the
  // whole select with 42703, `settings` came back null, and computeIsPro then
  // saw null and treated EVERY user as non-Pro on this page.
  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select(
      "subscription_tier, subscription_status, province, split_preset, is_incorporated, corp_type",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    console.error("[guide] Failed to load user_settings:", settingsError);
  }

  const isPro = await computeIsPro(supabase, user.id, settings);

  // Derive the structure label key the guide/PDF expect (sole_prop | prec | corp)
  // from the columns that actually exist. corp_type is 'prec' | 'general'.
  const businessStructure = !settings?.is_incorporated
    ? "sole_prop"
    : settings.corp_type === "prec"
      ? "prec"
      : "corp";

  return (
    <GuideContent
      isPro={isPro}
      province={settings?.province ?? "ontario"}
      businessStructure={businessStructure}
      splitPreset={settings?.split_preset ?? "p80_20"}
    />
  );
}
