import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Opens the Stripe Customer Portal for the authenticated user or their org.
 *
 * The portal lets subscribers:
 *   - Cancel their subscription
 *   - Update their payment method
 *   - View billing history and invoices
 *
 * Pass { org_id } in the body to open the org's billing portal instead.
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({}));
  const orgId = body.org_id as string | undefined;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca";
  let customerId: string | null = null;
  let returnUrl = `${appUrl}/settings`;

  if (orgId) {
    // Org billing portal — verify user is owner/admin
    const { data: member } = await supabase
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!member || !["owner", "admin", "team_leader"].includes(member.role)) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    // `stripe_customer_id` is revoked from the `authenticated` role
    // (migration 00117). Read it via the admin client — safe because the
    // owner/admin/team_leader check above already gates this branch.
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", orgId)
      .maybeSingle();

    customerId = org?.stripe_customer_id ?? null;
    returnUrl = `${appUrl}/org/settings`;
  } else {
    // Individual billing portal
    const { data: settings } = await supabase
      .from("user_settings")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    customerId = settings?.stripe_customer_id ?? null;
  }

  if (!customerId) {
    return NextResponse.json(
      {
        error: "No billing account found.",
        message:
          "No Stripe customer record is linked to your account. Contact hello@agentrunway.ca for help.",
      },
      { status: 404 },
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
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
