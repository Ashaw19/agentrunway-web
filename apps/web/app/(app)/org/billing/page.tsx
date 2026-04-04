import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { stripe } from "@/lib/stripe";
import { BillingContent } from "./billing-content";

export default async function OrgBillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgContext = await getOrgContext();
  if (!orgContext || !orgContext.isAdmin) {
    redirect("/org");
  }

  const { org } = orgContext;

  // Count active members for seat display
  const { count: activeMemberCount } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("status", "active");

  // Fetch Stripe subscription details if available
  let subscriptionData: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    interval: string | null;
  } | null = null;

  let upcomingInvoice: {
    amountDue: number;
    currency: string;
  } | null = null;

  let paymentMethodLast4: string | null = null;

  if (stripe && org.stripe_subscription_id) {
    try {
      const subscription = await stripe.subscriptions.retrieve(
        org.stripe_subscription_id,
        { expand: ["default_payment_method"] },
      );

      const interval =
        subscription.items.data[0]?.price?.recurring?.interval ?? null;

      subscriptionData = {
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        interval,
      };

      // Extract payment method last4
      const pm = subscription.default_payment_method;
      if (pm && typeof pm === "object" && "card" in pm && pm.card) {
        paymentMethodLast4 = pm.card.last4 ?? null;
      }
    } catch {
      // Subscription may have been deleted or Stripe is unreachable
    }

    try {
      const invoice = await stripe.invoices.retrieveUpcoming({
        subscription: org.stripe_subscription_id,
      });
      upcomingInvoice = {
        amountDue: invoice.amount_due,
        currency: invoice.currency,
      };
    } catch {
      // No upcoming invoice (e.g. canceled subscription)
    }
  }

  return (
    <BillingContent
      org={org}
      isOwner={orgContext.isOwner}
      role={orgContext.membership.role}
      activeMemberCount={activeMemberCount ?? 0}
      subscriptionData={subscriptionData}
      upcomingInvoice={upcomingInvoice}
      paymentMethodLast4={paymentMethodLast4}
    />
  );
}
