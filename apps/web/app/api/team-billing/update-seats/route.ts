/**
 * POST /api/team-billing/update-seats
 *
 * Syncs the Stripe subscription's member seat quantity with the actual
 * count of active members in the organization. Called after inviting
 * or removing a member.
 *
 * Expects: { org_id: string }
 */

import { NextResponse } from "next/server";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Block in sandbox mode ─────────────────────────────────────────────────────
  const { data: sbCheck } = await supabase
    .from("user_settings")
    .select("sandbox_mode")
    .eq("user_id", user.id)
    .single();
  if (sbCheck?.sandbox_mode === true) {
    return NextResponse.json(
      { error: "Billing changes are blocked in sandbox mode." },
      { status: 403 }
    );
  }

  const { org_id } = (await request.json()) as { org_id: string };

  if (!org_id) {
    return NextResponse.json(
      { error: "Missing org_id" },
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
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "Insufficient permissions." },
      { status: 403 }
    );
  }

  // ── Fetch org billing state ─────────────────────────────────────────────
  const db = adminClient();
  const { data: org } = await db
    .from("organizations")
    .select("stripe_subscription_id, is_beta")
    .eq("id", org_id)
    .single();

  if (!org) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 }
    );
  }

  // Beta orgs don't need seat sync
  if (org.is_beta) {
    return NextResponse.json({ ok: true, skipped: "beta" });
  }

  if (!org.stripe_subscription_id) {
    return NextResponse.json({ ok: true, skipped: "no_subscription" });
  }

  // ── Count active members (excluding the leader's own seat) ──────────────
  const { count: memberCount } = await db
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org_id)
    .eq("status", "active")
    .not("role", "in", '("owner")');

  const newMemberQuantity = memberCount ?? 0;

  // ── Find the member seat subscription item ──────────────────────────────
  try {
    const subscription = await stripe.subscriptions.retrieve(
      org.stripe_subscription_id
    );

    // Find the member seat line item (the one that's NOT a leader price)
    // Include ALL tier leader prices + legacy leader prices
    const leaderPriceIds = new Set(
      [
        STRIPE_PRICES.charter_leader_monthly,
        STRIPE_PRICES.charter_leader_annual,
        STRIPE_PRICES.early_adopter_leader_monthly,
        STRIPE_PRICES.early_adopter_leader_annual,
        STRIPE_PRICES.standard_leader_monthly,
        STRIPE_PRICES.standard_leader_annual,
        STRIPE_PRICES.team_leader_monthly,
        STRIPE_PRICES.team_leader_annual,
      ].filter(Boolean)
    );

    const memberItem = subscription.items.data.find(
      (item) => !leaderPriceIds.has(item.price.id)
    );

    if (!memberItem) {
      // No member seat item exists yet — need to add one
      if (newMemberQuantity > 0) {
        // Detect member price from the leader's price in the subscription
        const leaderItem = subscription.items.data.find(
          (item) => leaderPriceIds.has(item.price.id)
        );
        // Derive member price from same tier/billing period as leader
        let memberPriceId = "";
        if (leaderItem) {
          const leaderPid = leaderItem.price.id;
          // Map leader → member for each tier + billing period
          const leaderToMember: Record<string, string> = {
            [STRIPE_PRICES.charter_leader_monthly]: STRIPE_PRICES.charter_member_monthly,
            [STRIPE_PRICES.charter_leader_annual]: STRIPE_PRICES.charter_member_annual,
            [STRIPE_PRICES.early_adopter_leader_monthly]: STRIPE_PRICES.early_adopter_member_monthly,
            [STRIPE_PRICES.early_adopter_leader_annual]: STRIPE_PRICES.early_adopter_member_annual,
            [STRIPE_PRICES.standard_leader_monthly]: STRIPE_PRICES.standard_member_monthly,
            [STRIPE_PRICES.standard_leader_annual]: STRIPE_PRICES.standard_member_annual,
            [STRIPE_PRICES.team_leader_monthly]: STRIPE_PRICES.team_member_monthly,
            [STRIPE_PRICES.team_leader_annual]: STRIPE_PRICES.team_member_annual,
          };
          memberPriceId = leaderToMember[leaderPid] || "";
        }
        // Fallback to legacy env vars
        if (!memberPriceId) {
          memberPriceId = STRIPE_PRICES.team_member_monthly || STRIPE_PRICES.team_member_annual || "";
        }

        if (memberPriceId) {
          await stripe.subscriptionItems.create({
            subscription: org.stripe_subscription_id,
            price: memberPriceId,
            quantity: newMemberQuantity,
            proration_behavior: "create_prorations",
          });
        }
      }
    } else {
      // Update existing member seat quantity
      if (newMemberQuantity === 0) {
        // Remove the member item entirely
        await stripe.subscriptionItems.del(memberItem.id, {
          proration_behavior: "create_prorations",
        });
      } else {
        await stripe.subscriptionItems.update(memberItem.id, {
          quantity: newMemberQuantity,
          proration_behavior: "create_prorations",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      member_seats: newMemberQuantity,
    });
  } catch (err) {
    console.error("[team-billing] update-seats error:", err);
    return NextResponse.json(
      { error: "Failed to update seat count." },
      { status: 500 }
    );
  }
}
