import { NextResponse } from "next/server";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  // ── Stripe not yet configured ────────────────────────────────────────────────
  if (!stripe) {
    return NextResponse.json(
      {
        error: "Payments are not yet activated.",
        message:
          "Professional billing is coming soon. Email hello@agentrunway.ca to be notified when it's ready.",
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

  // ── Resolve price ID ──────────────────────────────────────────────────────────
  const { billing } = (await request.json()) as {
    billing: "monthly" | "annual";
  };

  const priceId =
    billing === "annual"
      ? STRIPE_PRICES.professional_annual
      : STRIPE_PRICES.professional_monthly;

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
