import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

/**
 * Stripe webhook handler.
 *
 * Register this endpoint in your Stripe dashboard:
 *   Webhook URL: https://agentrunway.ca/api/stripe-webhook
 *   Events to listen for:
 *     - checkout.session.completed
 *     - customer.subscription.updated
 *     - customer.subscription.deleted
 *
 * Set STRIPE_WEBHOOK_SECRET in .env.local to the signing secret from Stripe.
 */
export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }

  const body = await request.text();
  const sig = (await headers()).get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing Stripe-Signature header or STRIPE_WEBHOOK_SECRET." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json(
      { error: "Webhook signature verification failed." },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      // TODO: set user_settings.subscription_tier = 'professional' for userId
      console.log("[stripe] checkout.session.completed", session.id, userId);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      // TODO: sync subscription status to user_settings
      console.log("[stripe] subscription.updated", sub.id, sub.status);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      // TODO: downgrade user_settings.subscription_tier to 'starter'
      console.log("[stripe] subscription.deleted", sub.id);
      break;
    }

    default:
      console.log("[stripe] unhandled event:", event.type);
  }

  return NextResponse.json({ received: true });
}
