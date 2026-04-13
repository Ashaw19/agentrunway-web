import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { GuideContent } from "./guide-content";

export default async function GuidePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("subscription_tier, province, split_preset, business_structure")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <GuideContent
      subscriptionTier={settings?.subscription_tier ?? "starter"}
      province={settings?.province ?? "ontario"}
      businessStructure={settings?.business_structure ?? "sole_prop"}
      splitPreset={settings?.split_preset ?? "p80_20"}
    />
  );
}
