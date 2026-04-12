import { NextResponse } from "next/server";
import { stripe, getCurrentPricingTier, getIndividualPriceId } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  // ── Stripe not yet configured ────────────────────────────────────────────────
  if (!stripe) {
    return NextResponse.json(
      {
        error: "Payments are not yet activated.",
        message:
          "Billing is temporarily unavailable. Please try again shortly or email hello@agentrunway.ca for help.",
      },
      { status: 503 }
    );
  }

  // ── Require authentication ────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in required to upgrade.", redirect: "/login" },
      { status: 401 }
    );
  }

  // ── Resolve price ID based on current pricing tier ───────────────────────────
  const { billing } = (await request.json()) as {
    billing: "monthly" | "annual";
  };

  // Count paid individual subscribers to determine tier
  const admin = createAdminClient();
  const { count: paidCount } = await admin
    .from("user_settings")
    .select("user_id", { count: "exact", head: true })
    .eq("subscription_tier", "professional");

  const tier = getCurrentPricingTier(paidCount ?? 0);
  const priceId = getIndividualPriceId(tier, billing);

  if (!priceId) {
    return NextResponse.json(
      {
        error: "Price ID not configured.",
        message: "Contact hello@agentrunway.ca to complete your upgrade.",
      },
      { status: 503 }
    );
  }

  // ── Create Stripe Checkout session ───────────────────────────────────────────
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      // 14-day free trial — no credit card required until trial ends
      subscription_data: {
        trial_period_days: 14,
        metadata: { userId: user.id, pricing_tier: tier },
      },
      payment_method_collection: "if_required",
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/pricing`,
      metadata: { userId: user.id },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe] create-checkout-session error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session. Please try again." },
      { status: 500 }
    );
  }
}
