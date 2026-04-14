import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Mirrors the logic in apps/web/lib/compute-is-pro.ts exactly.
 * Must stay in sync with that file — do not add shortcuts here.
 */
export async function checkIsPro(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  // 1. Check individual subscription
  const { data: settings } = await supabase
    .from("user_settings")
    .select("subscription_tier, subscription_status")
    .eq("user_id", userId)
    .maybeSingle();

  const tier = settings?.subscription_tier ?? "starter";
  const status = settings?.subscription_status ?? "";

  const hasIndividualPro =
    (tier === "professional" || tier === "team") &&
    (status === "active" || status === "trialing" || status === "past_due" || !status);

  if (hasIndividualPro) return true;

  // 2. Check org membership (active/trialing org subscription OR beta org)
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("status, organizations(subscription_status, is_beta)")
    .eq("user_id", userId)
    .in("status", ["active", "pending"]);

  return (memberships ?? []).some((m: Record<string, unknown>) => {
    const org = m.organizations as Record<string, unknown> | null;
    return (
      org?.subscription_status === "active" ||
      org?.subscription_status === "trialing" ||
      org?.is_beta === true
    );
  });
}
