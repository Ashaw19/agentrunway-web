/**
 * Server-side subscription gate for paid API routes.
 *
 * Checks if the authenticated user has Professional-tier access via:
 *   1. Individual subscription (subscription_tier = professional/team + active status)
 *   2. Organization membership (org subscription_status = active/trialing or is_beta)
 *
 * Usage in API routes:
 *   const proCheck = await requirePro(supabase, user.id);
 *   if (!proCheck.allowed) return proCheck.response;
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

interface ProCheckResult {
  allowed: boolean;
  response?: NextResponse;
}

export async function requirePro(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProCheckResult> {
  // Check individual subscription tier + status
  const { data: settings } = await supabase
    .from("user_settings")
    .select("subscription_tier, subscription_status")
    .eq("user_id", userId)
    .single();

  const tier = settings?.subscription_tier ?? "starter";
  const status = settings?.subscription_status ?? "";

  const hasIndividualPro =
    (tier === "professional" || tier === "team") &&
    (status === "active" || status === "trialing" || status === "past_due");

  if (hasIndividualPro) {
    return { allowed: true };
  }

  // Check org membership (active/trialing org or beta org)
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

  if (hasOrgAccess) {
    return { allowed: true };
  }

  return {
    allowed: false,
    response: NextResponse.json(
      { error: "This feature requires a Professional subscription", code: "SUBSCRIPTION_REQUIRED" },
      { status: 403 },
    ),
  };
}
