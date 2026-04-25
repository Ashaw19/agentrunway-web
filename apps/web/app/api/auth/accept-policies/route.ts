/**
 * POST /api/auth/accept-policies
 *
 * Records the authenticated user's acceptance of one or more policy versions
 * in the policy_acceptances table. Called from:
 *   - The signup flow (one row per policy at the current published version,
 *     acceptance_context="signup")
 *   - The PolicyUpdateBanner in the (app) layout, after a material policy
 *     revision (acceptance_context="policy_update_banner")
 *   - The /auth/callback handler when backfilling acceptance metadata captured
 *     at sign-up time before email confirmation (acceptance_context="backfill")
 *
 * Request body:
 *   {
 *     policies: PolicyType[],          // required, one or more
 *     context:  "signup" | "policy_update_banner" | "backfill",
 *   }
 *
 * The version for each policy is read server-side from POLICY_VERSIONS so
 * clients cannot record acceptance of an arbitrary version string.
 *
 * Idempotent: re-posting the same (user, policy, version) is a no-op via
 * the unique index in migration 00124.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  POLICY_VERSIONS,
  POLICY_TYPES,
  type PolicyType,
} from "@/lib/policy-versions";

type AcceptanceContext = "signup" | "policy_update_banner" | "backfill";
const VALID_CONTEXTS: AcceptanceContext[] = [
  "signup",
  "policy_update_banner",
  "backfill",
];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { policies?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const policies = Array.isArray(body.policies) ? body.policies : null;
  const context  = typeof body.context === "string" ? body.context : null;

  if (!policies || policies.length === 0) {
    return NextResponse.json(
      { error: "policies must be a non-empty array" },
      { status: 400 },
    );
  }
  if (!context || !VALID_CONTEXTS.includes(context as AcceptanceContext)) {
    return NextResponse.json(
      { error: `context must be one of: ${VALID_CONTEXTS.join(", ")}` },
      { status: 400 },
    );
  }

  // Validate every policy slug against POLICY_TYPES — never trust the client
  // with an arbitrary string for the policy_type column.
  const validPolicies: PolicyType[] = [];
  for (const p of policies) {
    if (typeof p !== "string" || !POLICY_TYPES.includes(p as PolicyType)) {
      return NextResponse.json(
        { error: `Invalid policy type: ${String(p)}` },
        { status: 400 },
      );
    }
    validPolicies.push(p as PolicyType);
  }

  // Capture audit fields. ip_address comes from the standard reverse-proxy
  // headers (Vercel sets x-forwarded-for); fall back to remote address only
  // if that's missing (local dev). user_agent is from the request directly.
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ipAddress    = forwardedFor ? forwardedFor.split(",")[0]?.trim() : null;
  const userAgent    = req.headers.get("user-agent") ?? null;

  // Build acceptance rows. Server-side version lookup means the client cannot
  // backdate or forward-date an acceptance.
  const rows = validPolicies.map((policy) => ({
    user_id:            user.id,
    policy_type:        policy,
    version:            POLICY_VERSIONS[policy],
    acceptance_context: context,
    ip_address:         ipAddress,
    user_agent:         userAgent,
  }));

  // Use upsert with on_conflict so re-acceptance of the same version is a no-op
  // (the unique index from migration 00124 enforces this at the DB level).
  const { error } = await supabase
    .from("policy_acceptances")
    .upsert(rows, { onConflict: "user_id,policy_type,version", ignoreDuplicates: true });

  if (error) {
    console.error("[accept-policies] Insert error:", error);
    return NextResponse.json(
      { error: "Failed to record policy acceptance" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok:        true,
    accepted:  validPolicies,
    versions:  Object.fromEntries(validPolicies.map((p) => [p, POLICY_VERSIONS[p]])),
  });
}
