import Stripe from "stripe";

/**
 * Server-side Stripe instance.
 *
 * Returns `null` if STRIPE_SECRET_KEY is not set — all API routes that use
 * this handle the null case and return a 503 with a helpful message. This
 * allows the billing infrastructure to exist in code without requiring a live
 * Stripe account until you're ready to activate payments.
 *
 * To activate:
 *   1. Create a Stripe account at stripe.com
 *   2. Add the following to your .env.local:
 *        STRIPE_SECRET_KEY=sk_live_...
 *        STRIPE_WEBHOOK_SECRET=whsec_...
 *        STRIPE_PRICE_PROFESSIONAL_MONTHLY=price_...
 *        STRIPE_PRICE_PROFESSIONAL_ANNUAL=price_...
 *        NEXT_PUBLIC_APP_URL=https://agentrunway.ca
 */
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/** Stripe Price IDs — populated via environment variables */
export const STRIPE_PRICES = {
  professional_monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? "",
  professional_annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL ?? "",
} as const;
