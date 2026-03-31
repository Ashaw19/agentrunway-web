#!/usr/bin/env npx tsx
/**
 * Agent Runway — Seed Ellis Realty Beta Team
 * ============================================
 * Creates the Ellis Realty beta team organization with lifetime free access.
 *
 * Team leaders: erin@ellisrealty.ca (owner), andrew@andrewdshaw.ca
 * Admin:        homes@ellisrealty.ca (Jess McCluskey)
 * Agents:       liz@, grace@, aidan@ (all @ellisrealty.ca)
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

interface TeamMember {
  email: string;
  name: string;
  role: "team_leader" | "admin" | "agent";
}

const ORG_SLUG = "ellis-realty";
const ORG_NAME = "Ellis Realty";

/** Erin is the org owner — her user ID populates organizations.owner_id */
const OWNER_EMAIL = "erin@ellisrealty.ca";

const TEAM: TeamMember[] = [
  { email: "erin@ellisrealty.ca",    name: "Erin Ellis",       role: "team_leader" },
  { email: "andrew@andrewdshaw.ca",  name: "Andrew Shaw",      role: "team_leader" },
  { email: "homes@ellisrealty.ca",   name: "Jess McCluskey",   role: "admin" },
  { email: "liz@ellisrealty.ca",     name: "Liz Spragg",       role: "agent" },
  { email: "grace@ellisrealty.ca",   name: "Grace Chappell",   role: "agent" },
  { email: "aidan@ellisrealty.ca",   name: "Aidan Finnegan",   role: "agent" },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Seeding Ellis Realty Beta Team ===\n");

  // 1. Fetch all auth users so we can match by email
  const { data: userData, error: userErr } = await supabase.auth.admin.listUsers();

  if (userErr) {
    console.error("Failed to list users:", userErr.message);
    process.exit(1);
  }

  const findUser = (email: string) =>
    userData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  const owner = findUser(OWNER_EMAIL);

  if (!owner) {
    console.error(`Owner ${OWNER_EMAIL} not found in auth.users.`);
    console.error("Erin must register an account first.\n");
    console.error("Creating organization with placeholder owner_id — members");
    console.error("who haven't registered will receive invitations.\n");
  }

  // 2. Create or update the organization
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .upsert(
      {
        name: ORG_NAME,
        slug: ORG_SLUG,
        type: "team",
        owner_id: owner?.id ?? "00000000-0000-0000-0000-000000000000",
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

  console.log(`Organization "${ORG_NAME}" (${org.id}) — is_beta=true\n`);

  // 3. Add each team member (if registered) or create invitation
  for (const m of TEAM) {
    const authUser = findUser(m.email);

    if (authUser) {
      // User has an account — add directly as active member
      const { error: memberErr } = await supabase
        .from("organization_members")
        .upsert(
          {
            org_id: org.id,
            user_id: authUser.id,
            role: m.role,
            status: "active",
            data_sharing_tier: "tier1",
            joined_at: new Date().toISOString(),
          },
          { onConflict: "org_id,user_id" }
        );

      if (memberErr) {
        console.error(`  ✗ ${m.name} (${m.email}): ${memberErr.message}`);
      } else {
        console.log(`  ✓ ${m.name} — ${m.email} (${m.role}, active)`);
      }

      // Grant professional tier to all beta team members
      await supabase
        .from("user_settings")
        .update({
          subscription_tier: "professional",
          subscription_status: "active",
        })
        .eq("user_id", authUser.id);
    } else {
      // User hasn't registered — create a 1-year invitation
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error: inviteErr } = await supabase
        .from("organization_invitations")
        .upsert(
          {
            org_id: org.id,
            email: m.email.toLowerCase(),
            role: m.role,
            token,
            invited_by: owner?.id ?? "00000000-0000-0000-0000-000000000000",
            expires_at: new Date(
              Date.now() + 365 * 24 * 60 * 60 * 1000
            ).toISOString(),
          },
          { onConflict: "org_id,email" }
        );

      if (inviteErr) {
        console.error(`  ✗ ${m.name} (${m.email}): ${inviteErr.message}`);
      } else {
        console.log(`  ~ ${m.name} — ${m.email} (${m.role}, invited — pending registration)`);
      }
    }
  }

  console.log("\n=== Done ===");
  console.log(`\nEllis Realty is set up with is_beta=true (lifetime free).`);
  console.log("All registered members have professional tier access.");
  console.log("Members who haven't registered will receive invitations.");
}

main().catch(console.error);
