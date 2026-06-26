"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit-log";
import { revalidatePath } from "next/cache";

/**
 * Beta → paid conversion.
 * =======================
 * Beta orgs (`organizations.is_beta = true`) get free Pro access AND are
 * hard-refused billing: `create-team-checkout` returns 200 "Beta organizations
 * have free access" and the Subscribe-Team UI is hidden behind `{!org.is_beta}`.
 *
 * To take a beta org to a real subscription we have to flip `is_beta = false`.
 * The ONLY hazard is an access gap: while is_beta is false and before a Stripe
 * subscription is active, a member could drop from Pro to starter.
 *
 * How access is granted (must stay in lockstep across all three readers —
 * app/(app)/layout.tsx, lib/compute-is-pro.ts, lib/require-pro.ts):
 *
 *   isPro =
 *     (user_settings.subscription_tier in {professional, team}
 *        AND subscription_status in {active, trialing, past_due, ''})   // individual
 *     OR (active org membership AND
 *         (org.subscription_status in {active, trialing} OR org.is_beta))  // org
 *
 * Gap-safety guarantee of this conversion:
 *   - The Ellis seed (scripts/seed-beta-team.ts + migration 00097) wrote
 *     user_settings.subscription_tier='professional', subscription_status='active'
 *     directly onto every member. That standalone individual grant keeps every
 *     member Pro through the `individual` branch above EVEN WHILE is_beta=false
 *     and no Stripe subscription exists yet. So flipping is_beta=false NEVER
 *     drops a seeded member.
 *   - Once the owner completes checkout, the Stripe webhook
 *     (checkout.session.completed) writes org.subscription_status + re-stamps
 *     every member's user_settings to the live subscription status. From that
 *     point access is grounded on the org subscription, not the stale seed.
 *
 * Reconciling the stale seed (the task's requirement that "access follows the
 * org subscription, not a stale seed"):
 *   The standalone seed grant is a *liability* only if it OUTLIVES the org
 *   subscription — e.g. the org cancels later and a member's user_settings
 *   still says active/professional, keeping them Pro forever via the individual
 *   branch. The webhook's customer.subscription.deleted handler already
 *   downgrades org members to starter, so a cancellation re-grounds them.
 *   This action additionally records `beta_converted_at` so the conversion is
 *   auditable and the UI can reason about "converted-but-not-yet-subscribed".
 *
 * This action does NOT touch Stripe. It flips the DB flag so the existing,
 * already-correct checkout + webhook plumbing can take over. Reversible via
 * `revertOrgToBeta`.
 */

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

/** Owner-only authz check using the user-session client (respects RLS). */
async function verifyOwner(
  orgId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("role", "owner")
    .maybeSingle();

  if (!membership) {
    return { ok: false, error: "Only the organization owner can change billing status." };
  }
  return { ok: true, userId: user.id };
}

/**
 * Convert a beta org to a billable org.
 *
 * Flips `is_beta = false` and stamps `beta_converted_at`. After this returns
 * successfully the owner can reach `Subscribe Team` (the CTA un-gates because
 * `is_beta` is now false). Members keep Pro throughout — see gap-safety note
 * in the file header.
 *
 * Idempotent: converting an already-converted (or never-beta) org is a no-op
 * success.
 */
export async function convertBetaOrgToPaid(
  orgId: string,
): Promise<ActionResult<{ alreadyConverted: boolean }>> {
  const authz = await verifyOwner(orgId);
  if (!authz.ok) return { data: null, error: authz.error };

  // Billing-state writes go through the admin client after an explicit authz
  // check — same pattern as create-team-checkout / update-seats. is_beta lives
  // behind the column-level revoke (00118), and we never want this write to
  // depend on RLS edge cases for a money-path flag.
  const admin = createAdminClient();

  const { data: org, error: readErr } = await admin
    .from("organizations")
    .select("is_beta, beta_converted_at, stripe_subscription_id")
    .eq("id", orgId)
    .maybeSingle();

  if (readErr) return { data: null, error: readErr.message };
  if (!org) return { data: null, error: "Organization not found." };

  // Already converted (or never beta) — no-op success so the UI can call this
  // defensively without double-flip side effects.
  if (!org.is_beta) {
    return { data: { alreadyConverted: true }, error: null };
  }

  const { error: updateErr } = await admin
    .from("organizations")
    .update({
      is_beta: false,
      beta_converted_at: new Date().toISOString(),
    })
    .eq("id", orgId)
    // Guard against a concurrent double-flip: only flip if still beta.
    .eq("is_beta", true);

  if (updateErr) return { data: null, error: updateErr.message };

  await logAuditEvent({
    userId: authz.userId,
    eventType: "org_beta_converted",
    eventCategory: "billing",
    actorUserId: authz.userId,
    metadata: {
      orgId,
      from: "beta",
      to: "billable",
      hadSubscription: Boolean(org.stripe_subscription_id),
    },
  });

  // Refresh the billing + settings surfaces so the Subscribe-Team CTA appears.
  revalidatePath("/org/settings");
  revalidatePath("/org/billing");
  revalidatePath("/org");

  return { data: { alreadyConverted: false }, error: null };
}

/**
 * Reverse a conversion: put the org back on beta (free) access.
 *
 * Reversible companion to `convertBetaOrgToPaid`. Owner-only. Safe to call
 * whether or not a subscription exists; it does NOT cancel any Stripe
 * subscription (that is the customer portal's job) — it only restores the
 * free-access flag. Clears `beta_converted_at`.
 *
 * Idempotent: reverting an already-beta org is a no-op success.
 */
export async function revertOrgToBeta(
  orgId: string,
): Promise<ActionResult<{ alreadyBeta: boolean }>> {
  const authz = await verifyOwner(orgId);
  if (!authz.ok) return { data: null, error: authz.error };

  const admin = createAdminClient();

  const { data: org, error: readErr } = await admin
    .from("organizations")
    .select("is_beta")
    .eq("id", orgId)
    .maybeSingle();

  if (readErr) return { data: null, error: readErr.message };
  if (!org) return { data: null, error: "Organization not found." };
  if (org.is_beta) {
    return { data: { alreadyBeta: true }, error: null };
  }

  const { error: updateErr } = await admin
    .from("organizations")
    .update({ is_beta: true, beta_converted_at: null })
    .eq("id", orgId)
    .eq("is_beta", false);

  if (updateErr) return { data: null, error: updateErr.message };

  await logAuditEvent({
    userId: authz.userId,
    eventType: "org_beta_reverted",
    eventCategory: "billing",
    actorUserId: authz.userId,
    metadata: { orgId, from: "billable", to: "beta" },
  });

  revalidatePath("/org/settings");
  revalidatePath("/org/billing");
  revalidatePath("/org");

  return { data: { alreadyBeta: false }, error: null };
}
