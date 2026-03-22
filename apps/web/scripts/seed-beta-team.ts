#!/usr/bin/env npx tsx
/**
 * Agent Runway — Seed Ellis Realty Beta Team
 * ============================================
 * Creates the Ellis Realty beta team organization with lifetime free access.
 *
 * Team leader: erin@ellisrealty.ca
 * Members:     liz@, grace@, aidan@, homes@, genevieve@ (all @ellisrealty.ca)
 *
 * Usage:
 *   npx tsx scripts/seed-beta-team.ts
 *
 * Prerequisites:
 *   - .env.local must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - Team members must already have Supabase auth accounts (registered users)
 *
 * The script is idempotent — it upserts by slug, so re-running
 * updates existing data instead of duplicating.
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

const TEAM_LEADER_EMAIL = "erin@ellisrealty.ca";

const MEMBER_EMAILS = [
  "liz@ellisrealty.ca",
  "grace@ellisrealty.ca",
  "aidan@ellisrealty.ca",
  "homes@ellisrealty.ca",
  "genevieve@ellisrealty.ca",
];

const ORG_SLUG = "ellis-realty";
const ORG_NAME = "Ellis Realty";

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Seeding Ellis Realty Beta Team ===\n");

  // 1. Look up the leader's auth user ID
  const { data: leaderData, error: leaderErr } = await supabase.auth.admin
    .listUsers();

  if (leaderErr) {
    console.error("Failed to list users:", leaderErr.message);
    process.exit(1);
  }

  const leader = leaderData.users.find(
    (u) => u.email?.toLowerCase() === TEAM_LEADER_EMAIL.toLowerCase()
  );

  if (!leader) {
    console.error(`Leader ${TEAM_LEADER_EMAIL} not found in auth.users.`);
    console.error("The team leader must register an account first.");
    console.error("\nCreating organization with placeholder — members will");
    console.error("be added via invitations when they register.\n");
  }

  // 2. Create or update the organization
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .upsert(
      {
        name: ORG_NAME,
        slug: ORG_SLUG,
        type: "team",
        owner_id: leader?.id ?? "00000000-0000-0000-0000-000000000000",
        is_beta: true,
        subscription_status: "active",
        max_seats: 10,
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (orgErr) {
    console.error("Failed to create/update organization:", orgErr.message);
    process.exit(1);
  }

  console.log(`Organization "${ORG_NAME}" (${org.id}) — is_beta=true`);

  // 3. Add the leader as owner/team_leader
  if (leader) {
    const { error: leaderMemberErr } = await supabase
      .from("organization_members")
      .upsert(
        {
          org_id: org.id,
          user_id: leader.id,
          role: "team_leader",
          status: "active",
          data_sharing_tier: "tier1",
        },
        { onConflict: "org_id,user_id" }
      );

    if (leaderMemberErr) {
      console.error("Failed to add leader as member:", leaderMemberErr.message);
    } else {
      console.log(`  + ${TEAM_LEADER_EMAIL} (team_leader, active)`);
    }

    // Grant professional tier to leader
    await supabase
      .from("user_settings")
      .update({
        subscription_tier: "professional",
        subscription_status: "active",
      })
      .eq("user_id", leader.id);
  }

  // 4. Add members (if they have accounts) or create invitations
  for (const email of MEMBER_EMAILS) {
    const member = leaderData.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (member) {
      // User exists — add directly
      const { error: memberErr } = await supabase
        .from("organization_members")
        .upsert(
          {
            org_id: org.id,
            user_id: member.id,
            role: "agent",
            status: "active",
            data_sharing_tier: "tier1",
          },
          { onConflict: "org_id,user_id" }
        );

      if (memberErr) {
        console.error(`  Failed to add ${email}:`, memberErr.message);
      } else {
        console.log(`  + ${email} (agent, active)`);
      }

      // Grant professional tier
      await supabase
        .from("user_settings")
        .update({
          subscription_tier: "professional",
          subscription_status: "active",
        })
        .eq("user_id", member.id);
    } else {
      // User doesn't exist yet — create an invitation
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error: inviteErr } = await supabase
        .from("organization_invitations")
        .upsert(
          {
            org_id: org.id,
            email: email.toLowerCase(),
            role: "agent",
            token,
            invited_by: leader?.id ?? null,
            expires_at: new Date(
              Date.now() + 365 * 24 * 60 * 60 * 1000
            ).toISOString(), // 1 year for beta
          },
          { onConflict: "org_id,email" }
        );

      if (inviteErr) {
        console.error(`  Failed to invite ${email}:`, inviteErr.message);
      } else {
        console.log(`  ~ ${email} (invited, pending registration)`);
      }
    }
  }

  console.log("\n=== Done ===");
  console.log(`\nEllis Realty team is set up with is_beta=true (lifetime free).`);
  console.log("Members who haven't registered yet will receive invitations.");
}

main().catch(console.error);
