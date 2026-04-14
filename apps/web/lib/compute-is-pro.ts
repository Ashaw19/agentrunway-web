/**
 * Server-side utility to compute whether a user has Pro-level access.
 *
 * Checks both individual subscription AND organization membership (beta orgs).
 * This matches the canonical logic in the (app) layout.tsx.
 *
 * Use this in every server-side page.tsx that needs to pass `isPro` to its
 * client-side content component — never recompute from subscription_tier alone.
 */

import { type SupabaseClient } from "@supabase/supabase-js";

export async function computeIsPro(
  supabase: SupabaseClient,
  userId: string,
  /** Optional: pass existing settings to avoid a duplicate query */
  existingSettings?: { subscription_tier?: string; subscription_status?: string } | null,
): Promise<boolean> {
  // 1. Check individual subscription
  const tier = existingSettings?.subscription_tier ?? "starter";
  const subStatus = existingSettings?.subscription_status ?? "";
  const hasIndividualPro =
    (tier === "professional" || tier === "team") &&
    (subStatus === "active" || subStatus === "trialing" || subStatus === "past_due" || !subStatus);

  if (hasIndividualPro) return true;

  // 2. Check org membership (active/trialing org subscription OR beta org).
  // Only `active` memberships count — a `pending` invite would show the UI
  // as Pro while require-pro.ts (the API gate) rejects the same user with
  // 403 SUBSCRIPTION_REQUIRED, leaving them in a broken half-Pro state.
  // Keep these two in lockstep: status = 'active' on both sides.
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("status, organizations(subscription_status, is_beta)")
    .eq("user_id", userId)
    .eq("status", "active");

  const hasOrgAccess = (memberships ?? []).some((m: Record<string, unknown>) => {
    const org = m.organizations as Record<string, unknown> | null;
    return (
      org?.subscription_status === "active" ||
      org?.subscription_status === "trialing" ||
      org?.is_beta === true
    );
  });

  return hasOrgAccess;
}
