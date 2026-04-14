#!/usr/bin/env npx tsx
/**
 * Agent Runway — Seed Ellis Realty Beta Team
 * ============================================
 * Creates the Ellis Realty beta organization with 6 team members
 * (1 owner + 1 admin + 4 agents), all with price-locked professional access.
 *
 * Usage:
 *   npx tsx apps/web/scripts/seed-beta-team.ts
 *
 * Prerequisites:
 *   - .env.local must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *
 * The script is idempotent — it checks for existing records before
 * creating and uses upsert where possible. Safe to re-run.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Team definition ──────────────────────────────────────────────────────────

interface TeamMember {
  email: string;
  displayName: string;
  orgRole: "owner" | "admin" | "agent";
  dataSharingTier: "tier1" | "tier2";
  goalGci: number;
}

const ORG_SLUG = "ellis-realty";
const ORG_NAME = "Ellis Realty";

// Real Ellis Realty beta team. goal_gci is seeded to 0 so each agent sets
// their own target on first login — their number to own, not ours to assume.
const TEAM: TeamMember[] = [
  {
    email: "erin@ellisrealty.ca",
    displayName: "Erin Ellis",
    orgRole: "owner",
    dataSharingTier: "tier2",
    goalGci: 0,
  },
  {
    email: "homes@ellisrealty.ca",
    displayName: "Jess McCluskey",
    orgRole: "admin",
    dataSharingTier: "tier2",
    goalGci: 0,
  },
  {
    email: "aidan@ellisrealty.ca",
    displayName: "Aidan Finnegan",
    orgRole: "agent",
    dataSharingTier: "tier1",
    goalGci: 0,
  },
  {
    email: "liz@ellisrealty.ca",
    displayName: "Liz Spragg",
    orgRole: "agent",
    dataSharingTier: "tier1",
    goalGci: 0,
  },
  {
    email: "grace@ellisrealty.ca",
    displayName: "Grace Chappel",
    orgRole: "agent",
    dataSharingTier: "tier1",
    goalGci: 0,
  },
  {
    email: "genevieve@ellisrealty.ca",
    displayName: "Genevieve Bishop",
    orgRole: "agent",
    dataSharingTier: "tier1",
    goalGci: 0,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Ensure an auth user exists for the given email.
 * If the user already exists, return their ID. Otherwise create them
 * with a random password and auto-confirmed email.
 */
async function ensureAuthUser(email: string): Promise<string> {
  // Check if user already exists by listing and filtering
  const { data: listData, error: listErr } =
    await supabase.auth.admin.listUsers();

  if (listErr) {
    throw new Error(`Failed to list auth users: ${listErr.message}`);
  }

  const existing = listData.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (existing) {
    console.log(`  [auth] ${email} — already exists (${existing.id})`);
    return existing.id;
  }

  // Create new user with auto-confirmed email
  const tempPassword = `BetaSeed-${crypto.randomUUID().slice(0, 8)}!`;
  const { data: newUser, error: createErr } =
    await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { source: "beta-seed" },
    });

  if (createErr) {
    throw new Error(`Failed to create auth user ${email}: ${createErr.message}`);
  }

  console.log(`  [auth] ${email} — created (${newUser.user.id})`);
  return newUser.user.id;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Seeding Ellis Realty Beta Team ===\n");

  // ── Step 1: Ensure all auth users exist ────────────────────────────────────

  console.log("Step 1: Ensuring auth users exist...\n");

  const userIds: Map<string, string> = new Map();

  for (const member of TEAM) {
    const uid = await ensureAuthUser(member.email);
    userIds.set(member.email, uid);
  }

  const ownerEmail = TEAM[0].email;
  const ownerId = userIds.get(ownerEmail)!;

  console.log("");

  // ── Step 2: Create or update the organization ──────────────────────────────

  console.log("Step 2: Creating/updating organization...\n");

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .upsert(
      {
        name: ORG_NAME,
        slug: ORG_SLUG,
        type: "brokerage",
        owner_id: ownerId,
        is_beta: true,
        subscription_status: "active",
        max_seats: 10,
        billing_email: "erin@ellisrealty.ca",
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (orgErr) {
    console.error("Failed to create/update organization:", orgErr.message);
    process.exit(1);
  }

  console.log(
    `  [org] "${ORG_NAME}" (${org.id}) — type=brokerage, is_beta=true, max_seats=10\n`
  );

  // ── Step 3: Create organization_members entries ────────────────────────────

  console.log("Step 3: Creating organization members...\n");

  for (const member of TEAM) {
    const userId = userIds.get(member.email)!;

    const { error: memberErr } = await supabase
      .from("organization_members")
      .upsert(
        {
          org_id: org.id,
          user_id: userId,
          role: member.orgRole,
          status: "active",
          data_sharing_tier: member.dataSharingTier,
          consent_granted_at: new Date().toISOString(),
          consent_version: 1,
          joined_at: new Date().toISOString(),
        },
        { onConflict: "org_id,user_id" }
      );

    if (memberErr) {
      console.error(
        `  [member] FAILED ${member.displayName} (${member.email}): ${memberErr.message}`
      );
    } else {
      console.log(
        `  [member] ${member.displayName} — ${member.orgRole}, ${member.dataSharingTier}, active`
      );
    }
  }

  console.log("");

  // ── Step 4: Create/update user_settings entries ────────────────────────────

  console.log("Step 4: Creating/updating user_settings...\n");

  // The handle_new_user trigger already created a user_settings row for each
  // new auth user. We ONLY want to overwrite fields that this script owns
  // (display_name, subscription tier/status). goal_gci belongs to the user —
  // if they've set it, we must not stomp it, and if they haven't, the trigger
  // already seeded it to 0.
  for (const member of TEAM) {
    const userId = userIds.get(member.email)!;

    const { error: settingsErr } = await supabase
      .from("user_settings")
      .update({
        display_name: member.displayName,
        subscription_tier: "professional",
        subscription_status: "active",
      })
      .eq("user_id", userId);

    if (settingsErr) {
      console.error(
        `  [settings] FAILED ${member.displayName}: ${settingsErr.message}`
      );
    } else {
      console.log(
        `  [settings] ${member.displayName} — professional (goal_gci preserved)`
      );
    }
  }

  // ── Done ───────────────────────────────────────────────────────────────────

  console.log("\n=== Done ===");
  console.log(`\nEllis Realty beta team seeded successfully.`);
  console.log(`  Organization: ${ORG_NAME} (${org.id})`);
  console.log(`  Type: brokerage | is_beta: true | max_seats: 10`);
  console.log(`  Owner: Erin Ellis (erin@ellisrealty.ca)`);
  console.log(`  Admin: Jess McCluskey (homes@ellisrealty.ca)`);
  console.log(`  Agents: 4 (aidan, liz, grace, genevieve @ellisrealty.ca)`);
  console.log(`  All members: professional tier, active subscription`);
  console.log(`  Price-locked access via is_beta flag.`);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
