import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRedirect } from "@/lib/security/safe-redirect";
import {
  POLICY_VERSIONS,
  POLICY_TYPES,
  type PolicyType,
} from "@/lib/policy-versions";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // ── Backfill policy_acceptances from signup metadata ─────────────────
      // The signup form stashed the accepted versions in auth.users metadata
      // before email confirm; now that the user has a session we can write
      // the audit rows. We also accept the CURRENT POLICY_VERSIONS as the
      // authoritative source (signup metadata is informational only) so a
      // user who signed up days ago and is only confirming now still gets
      // accurate acceptance rows for whatever was current AT signup time.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
          const acceptedAt = typeof meta.policies_accepted_at === "string"
            ? meta.policies_accepted_at
            : null;
          const acceptedVersions = (meta.policies_accepted_versions ?? null) as
            | Partial<Record<PolicyType, string>>
            | null;

          if (acceptedAt && acceptedVersions) {
            const forwardedFor = request.headers.get("x-forwarded-for");
            const ipAddress    = forwardedFor ? forwardedFor.split(",")[0]?.trim() : null;
            const userAgent    = request.headers.get("user-agent") ?? null;

            const rows = POLICY_TYPES
              .filter((p) => typeof acceptedVersions[p] === "string")
              .map((p) => ({
                user_id:            user.id,
                policy_type:        p,
                // Prefer the version the user actually saw at signup time;
                // fall back to current if metadata is incomplete.
                version:            acceptedVersions[p] ?? POLICY_VERSIONS[p],
                accepted_at:        acceptedAt,
                acceptance_context: "backfill" as const,
                ip_address:         ipAddress,
                user_agent:         userAgent,
              }));

            if (rows.length > 0) {
              await supabase
                .from("policy_acceptances")
                .upsert(rows, {
                  onConflict: "user_id,policy_type,version",
                  ignoreDuplicates: true,
                });
            }
          }
        }
      } catch (e) {
        // Backfill is best-effort — log but do not block the auth callback.
        // The PolicyUpdateBanner in (app) layout will catch any user with no
        // acceptance rows and surface a banner asking them to accept.
        console.error("[auth/callback] policy acceptance backfill failed:", e);
      }

      // sanitizeRedirect() uses new URL() parsing to prevent open-redirect
      // bypass via URL-encoded or protocol-prefixed payloads.
      const safeNext = sanitizeRedirect(next, origin);
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
