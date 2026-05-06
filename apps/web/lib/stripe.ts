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

/**
 * Pricing Tiers:
 *   Charter      — first 50 users, rate locked for as long as subscription stays active
 *   Early Adopter — year 1 users after charter slots fill, rate locked for as long as subscription stays active
 *   Standard     — post year-1 pricing
 */
export type PricingTier = "charter" | "early_adopter" | "standard";

const CHARTER_LIMIT = 50;
// Year-1 cutoff: set to your 1-year anniversary date (update once you launch)
const EARLY_ADOPTER_CUTOFF = new Date("2027-06-01T00:00:00Z");

/** Stripe Price IDs — populated via environment variables */
export const STRIPE_PRICES = {
  // ── Individual ──
  charter_monthly: process.env.STRIPE_PRICE_CHARTER_MONTHLY ?? "",
  charter_annual: process.env.STRIPE_PRICE_CHARTER_ANNUAL ?? "",
  early_adopter_monthly: process.env.STRIPE_PRICE_EARLY_ADOPTER_MONTHLY ?? "",
  early_adopter_annual: process.env.STRIPE_PRICE_EARLY_ADOPTER_ANNUAL ?? "",
  standard_monthly: process.env.STRIPE_PRICE_STANDARD_MONTHLY ?? "",
  standard_annual: process.env.STRIPE_PRICE_STANDARD_ANNUAL ?? "",
  // ── Team Leader ──
  charter_leader_monthly: process.env.STRIPE_PRICE_CHARTER_LEADER_MONTHLY ?? "",
  charter_leader_annual: process.env.STRIPE_PRICE_CHARTER_LEADER_ANNUAL ?? "",
  early_adopter_leader_monthly: process.env.STRIPE_PRICE_EARLY_ADOPTER_LEADER_MONTHLY ?? "",
  early_adopter_leader_annual: process.env.STRIPE_PRICE_EARLY_ADOPTER_LEADER_ANNUAL ?? "",
  standard_leader_monthly: process.env.STRIPE_PRICE_STANDARD_LEADER_MONTHLY ?? "",
  standard_leader_annual: process.env.STRIPE_PRICE_STANDARD_LEADER_ANNUAL ?? "",
  // ── Team Member ──
  charter_member_monthly: process.env.STRIPE_PRICE_CHARTER_MEMBER_MONTHLY ?? "",
  charter_member_annual: process.env.STRIPE_PRICE_CHARTER_MEMBER_ANNUAL ?? "",
  early_adopter_member_monthly: process.env.STRIPE_PRICE_EARLY_ADOPTER_MEMBER_MONTHLY ?? "",
  early_adopter_member_annual: process.env.STRIPE_PRICE_EARLY_ADOPTER_MEMBER_ANNUAL ?? "",
  standard_member_monthly: process.env.STRIPE_PRICE_STANDARD_MEMBER_MONTHLY ?? "",
  standard_member_annual: process.env.STRIPE_PRICE_STANDARD_MEMBER_ANNUAL ?? "",
  // ── Legacy (kept for backward compat with existing subscribers) ──
  professional_monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY ?? "",
  professional_annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL ?? "",
  team_leader_monthly: process.env.STRIPE_PRICE_TEAM_LEADER_MONTHLY ?? "",
  team_leader_annual: process.env.STRIPE_PRICE_TEAM_LEADER_ANNUAL ?? "",
  team_member_monthly: process.env.STRIPE_PRICE_TEAM_MEMBER_MONTHLY ?? "",
  team_member_annual: process.env.STRIPE_PRICE_TEAM_MEMBER_ANNUAL ?? "",
} as const;

/**
 * Determine the current pricing tier based on the number of paid subscribers
 * and whether we're still in year 1.
 */
export function getCurrentPricingTier(paidSubscriberCount: number): PricingTier {
  if (paidSubscriberCount < CHARTER_LIMIT) return "charter";
  if (new Date() < EARLY_ADOPTER_CUTOFF) return "early_adopter";
  return "standard";
}

/** How many charter slots remain */
export function charterSlotsRemaining(paidSubscriberCount: number): number {
  return Math.max(0, CHARTER_LIMIT - paidSubscriberCount);
}

/** Resolve individual price ID for a given tier + billing period */
export function getIndividualPriceId(
  tier: PricingTier,
  billing: "monthly" | "annual"
): string {
  const key = `${tier}_${billing}` as keyof typeof STRIPE_PRICES;
  return STRIPE_PRICES[key] || "";
}

/**
 * Resolve team leader price ID for a given tier + billing period.
 *
 * Tier-specific env vars (`STRIPE_PRICE_CHARTER_LEADER_*` etc.) are the
 * primary path; if those are not configured, fall back to the flat legacy
 * `STRIPE_PRICE_TEAM_LEADER_*` so team checkouts keep working during the
 * Ellis-beta / pre-tiered-rollout window. Update-seats uses the same
 * dual-key model (see apps/web/app/api/team-billing/update-seats/route.ts).
 */
export function getLeaderPriceId(
  tier: PricingTier,
  billing: "monthly" | "annual"
): string {
  const tieredKey   = `${tier}_leader_${billing}` as keyof typeof STRIPE_PRICES;
  const fallbackKey = `team_leader_${billing}`    as keyof typeof STRIPE_PRICES;
  return STRIPE_PRICES[tieredKey] || STRIPE_PRICES[fallbackKey] || "";
}

/** Resolve team member price ID for a given tier + billing period (same fallback). */
export function getMemberPriceId(
  tier: PricingTier,
  billing: "monthly" | "annual"
): string {
  const tieredKey   = `${tier}_member_${billing}` as keyof typeof STRIPE_PRICES;
  const fallbackKey = `team_member_${billing}`    as keyof typeof STRIPE_PRICES;
  return STRIPE_PRICES[tieredKey] || STRIPE_PRICES[fallbackKey] || "";
}
