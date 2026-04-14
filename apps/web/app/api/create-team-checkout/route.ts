/**
 * POST /api/create-team-checkout
 *
 * Creates a Stripe Checkout session for a team subscription.
 * Two line items: leader seat (tiered: $149–$249/mo) + member seats (tiered: $49–$79/mo x member_count).
 *
 * Expects: { org_id: string, member_count: number, billing: "monthly" | "annual" }
 */

import { NextResponse } from "next/server";
import { stripe, getCurrentPricingTier, getLeaderPriceId, getMemberPriceId } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Payments are not yet activated." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in required.", redirect: "/login" },
      { status: 401 }
    );
  }

  const { org_id, member_count, billing } = (await request.json()) as {
    org_id: string;
    member_count: number;
    billing: "monthly" | "annual";
  };

  if (!org_id || member_count == null || member_count < 0) {
    return NextResponse.json(
      { error: "Missing or invalid org_id / member_count" },
      { status: 400 }
    );
  }

  // ── Verify user is org owner/admin ──────────────────────────────────────
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "Only org owners/admins can manage billing." },
      { status: 403 }
    );
  }

  // ── Check org isn't already on a paid plan ──────────────────────────────
  // `stripe_subscription_id` is revoked from the `authenticated` role
  // (migration 00117). Use the admin client — safe because the owner/admin
  // check above already authorizes this branch.
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("is_beta, stripe_subscription_id")
    .eq("id", org_id)
    .maybeSingle();

  if (org?.is_beta) {
    return NextResponse.json(
      { error: "Beta organizations have free access — no billing required." },
      { status: 200 }
    );
  }

  if (org?.stripe_subscription_id) {
    return NextResponse.json(
      { error: "Organization already has an active subscription." },
      { status: 409 }
    );
  }

  // ── Resolve prices based on current pricing tier ────────────────────────
  const { count: paidCount } = await admin
    .from("user_settings")
    .select("user_id", { count: "exact", head: true })
    .eq("subscription_tier", "professional");

  const tier = getCurrentPricingTier(paidCount ?? 0);
  const leaderPriceId = getLeaderPriceId(tier, billing);
  const memberPriceId = getMemberPriceId(tier, billing);

  if (!leaderPriceId || !memberPriceId) {
    return NextResponse.json(
      { error: "Team pricing not configured yet." },
      { status: 503 }
    );
  }

  // ── Create Checkout session ─────────────────────────────────────────────
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca";

  try {
    const lineItems = [
      { price: leaderPriceId, quantity: 1 },
    ];

    // Only add member seats if there are members beyond the leader
    if (member_count > 0) {
      lineItems.push({ price: memberPriceId, quantity: member_count });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: lineItems,
      subscription_data: {
        trial_period_days: 14,
        metadata: { orgId: org_id, userId: user.id },
      },
      payment_method_collection: "if_required",
      success_url: `${appUrl}/org?billing=success`,
      cancel_url: `${appUrl}/org/settings`,
      metadata: { orgId: org_id, userId: user.id },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe] create-team-checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
