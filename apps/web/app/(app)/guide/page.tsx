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

  const { data: settings } = await supabase
    .from("user_settings")
    .select("subscription_tier, subscription_status, province, split_preset, business_structure")
    .eq("user_id", user.id)
    .maybeSingle();

  const isPro = await computeIsPro(supabase, user.id, settings);

  return (
    <GuideContent
      isPro={isPro}
      province={settings?.province ?? "ontario"}
      businessStructure={settings?.business_structure ?? "sole_prop"}
      splitPreset={settings?.split_preset ?? "p80_20"}
    />
  );
}
