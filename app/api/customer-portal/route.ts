import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens the Stripe Customer Portal for the authenticated user.
 *
 * The portal lets subscribers:
 *   - Cancel their subscription
 *   - Update their payment method
 *   - View billing history and invoices
 *
 * Requires the Stripe Customer Portal to be configured at:
 *   https://dashboard.stripe.com/settings/billing/portal
 */
export async function POST() {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in required.", redirect: "/login" },
      { status: 401 },
    );
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (!settings?.stripe_customer_id) {
    return NextResponse.json(
      {
        error: "No billing account found.",
        message:
          "No Stripe customer record is linked to your account. Contact hello@agentrunway.ca for help.",
      },
      { status: 404 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca";

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: settings.stripe_customer_id,
      return_url: `${appUrl}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe] customer-portal error:", err);
    return NextResponse.json(
      { error: "Failed to open billing portal. Please try again." },
      { status: 500 },
    );
  }
}
