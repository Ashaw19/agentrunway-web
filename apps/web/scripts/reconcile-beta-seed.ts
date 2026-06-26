#!/usr/bin/env npx tsx
/**
 * Agent Runway — Reconcile seeded beta-team user_settings grants
 * ==============================================================
 * The Ellis beta seed (scripts/seed-beta-team.ts) wrote a STANDALONE individual
 * Pro grant onto every member:
 *
 *     user_settings.subscription_tier   = 'professional'
 *     user_settings.subscription_status = 'active'
 *
 * That grant makes each member Pro via the *individual* branch of the access
 * check (app/(app)/layout.tsx, lib/compute-is-pro.ts, lib/require-pro.ts) —
 * independent of any org subscription. While the org is beta that's fine
 * (the org also grants Pro). The hazard is DRIFT: a standalone active grant
 * that OUTLIVES the org's access — e.g. the org is converted (is_beta=false),
 * never subscribes, and members stay Pro forever off the stale seed; or a
 * member leaves the org but keeps the individual grant.
 *
 * This script heals that drift. For a given org it inspects each ACTIVE member
 * and downgrades any member whose individual grant is NOT backed by real
 * access — i.e. the org is neither beta nor on an active/trialing subscription.
 * It is gap-safe by construction: it ONLY downgrades when the org confers no
 * access, so a member who would still be Pro via the org is never touched.
 *
 * Usage:
 *   # Report only — never writes:
 *   npx tsx apps/web/scripts/reconcile-beta-seed.ts --org=<org_id> --dry-run
 *
 *   # Apply (heals drift):
 *   npx tsx apps/web/scripts/reconcile-beta-seed.ts --org=<org_id>
 *
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *
 * NOTE: This script does NOT touch Stripe. It only reconciles the DB so access
 * follows the org subscription, not a stale seed. Run it AFTER a conversion if
 * the org decided not to subscribe, or any time you suspect grant drift.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const orgArg = args.find((a) => a.startsWith("--org="));
const orgId = orgArg?.split("=")[1];
const dryRun = args.includes("--dry-run");

if (!orgId) {
  console.error("Usage: npx tsx apps/web/scripts/reconcile-beta-seed.ts --org=<org_id> [--dry-run]");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Mirrors the org branch of compute-is-pro.ts / require-pro.ts.
function orgConfersAccess(org: { is_beta: boolean; subscription_status: string | null }): boolean {
  return (
    org.is_beta === true ||
    org.subscription_status === "active" ||
    org.subscription_status === "trialing"
  );
}

async function main() {
  console.log(`=== Reconcile beta-seed grants for org ${orgId} ${dryRun ? "(DRY RUN)" : ""} ===\n`);

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name, is_beta, subscription_status, stripe_subscription_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgErr || !org) {
    console.error("Organization not found:", orgErr?.message);
    process.exit(1);
  }

  console.log(
    `Org: ${org.name} | is_beta=${org.is_beta} | subscription_status=${org.subscription_status} | stripe_subscription_id=${org.stripe_subscription_id ?? "none"}`,
  );

  const confersAccess = orgConfersAccess(org);
  console.log(`Org confers Pro access: ${confersAccess}\n`);

  if (confersAccess) {
    console.log(
      "Org currently grants Pro (beta or active/trialing subscription). No drift to heal —\n" +
      "every member's access is backed by the org. Nothing to do.",
    );
    return;
  }

  // Org confers NO access. Any member still carrying a standalone professional/
  // team + active/trialing/past_due individual grant is drifting on the stale
  // seed. Heal them to starter so access truly follows the org.
  const { data: members, error: memErr } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("status", "active");

  if (memErr) {
    console.error("Failed to read members:", memErr.message);
    process.exit(1);
  }

  const memberIds = (members ?? []).map((m) => m.user_id);
  if (memberIds.length === 0) {
    console.log("No active members. Nothing to do.");
    return;
  }

  const { data: settings, error: setErr } = await supabase
    .from("user_settings")
    .select("user_id, subscription_tier, subscription_status, stripe_customer_id")
    .in("user_id", memberIds);

  if (setErr) {
    console.error("Failed to read user_settings:", setErr.message);
    process.exit(1);
  }

  // A member is drifting if they have a Pro-granting individual grant but NO
  // own Stripe customer (i.e. the grant came from the seed/team, not a personal
  // subscription). We never strip a member who pays individually.
  const drifting = (settings ?? []).filter((s) => {
    const proTier = s.subscription_tier === "professional" || s.subscription_tier === "team";
    const proStatus =
      s.subscription_status === "active" ||
      s.subscription_status === "trialing" ||
      s.subscription_status === "past_due" ||
      !s.subscription_status;
    const hasOwnStripe = Boolean(s.stripe_customer_id);
    return proTier && proStatus && !hasOwnStripe;
  });

  console.log(`Active members: ${memberIds.length} | drifting (stale grant, no own Stripe): ${drifting.length}\n`);

  if (drifting.length === 0) {
    console.log("No drifting grants. Nothing to do.");
    return;
  }

  for (const s of drifting) {
    console.log(`  - ${s.user_id}: tier=${s.subscription_tier} status=${s.subscription_status} → starter/free`);
  }

  if (dryRun) {
    console.log("\nDRY RUN — no writes performed. Re-run without --dry-run to apply.");
    return;
  }

  const driftingIds = drifting.map((s) => s.user_id);
  const { error: updErr } = await supabase
    .from("user_settings")
    .update({ subscription_tier: "starter", subscription_status: "free" })
    .in("user_id", driftingIds);

  if (updErr) {
    console.error("\nFailed to heal grants:", updErr.message);
    process.exit(1);
  }

  console.log(`\nHealed ${driftingIds.length} drifting grant(s). Access now follows the org.`);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
