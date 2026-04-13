/**
 * GET /api/pricing-tier
 *
 * Returns the current pricing tier and charter slots remaining.
 * Public endpoint — no auth required (pricing page is public).
 */

import { NextResponse } from "next/server";
import { getCurrentPricingTier, charterSlotsRemaining } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const admin = createAdminClient();
    const { count: paidCount } = await admin
      .from("user_settings")
      .select("user_id", { count: "exact", head: true })
      .eq("subscription_tier", "professional");

    const subscriberCount = paidCount ?? 0;
    const tier = getCurrentPricingTier(subscriberCount);
    const charterRemaining = charterSlotsRemaining(subscriberCount);

    return NextResponse.json({
      tier,
      charterRemaining,
      charterTotal: 50,
    });
  } catch (err) {
    console.error("[pricing-tier] GET failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Unable to load pricing info" }, { status: 500 });
  }
}
