/**
 * GET /api/health
 *
 * Health-check endpoint for Vercel and uptime monitors (Better Stack, etc.).
 *
 * Design (post 2026-04-29 outage)
 * -------------------------------
 * The April 29 outage was caused by a sick PostgREST/edge layer in front of
 * Supabase Postgres — Cloudflare returned 522s on the REST gateway while
 * Postgres itself was healthy. The previous version of this endpoint did a
 * single `SELECT` against `user_settings` through PostgREST with an 8-second
 * abort, so a sick gateway looked like a healthy 8-second function before
 * flipping to 503. That:
 *   1. Wasted Vercel function time (and money) every poll cycle.
 *   2. Could not distinguish "Postgres is down" from "API gateway is stuck",
 *      so Better Stack alerts were ambiguous.
 *
 * The current version:
 *   - Uses a 3s abort per probe (Better Stack tolerates a faster red signal).
 *   - Runs TWO probes in parallel that exercise different Supabase layers:
 *       * `postgrest` — `SELECT` against `user_settings` via the REST gateway.
 *       * `auth`      — `GET /auth/v1/health` (a different Supabase service).
 *   - Returns 503 if EITHER probe fails (the app needs both layers), but the
 *     response body identifies which leg failed so the on-call human can read
 *     the alert and know whether to call Supabase support (both legs failing
 *     usually = project-wide infra issue) vs. wait it out (just postgrest =
 *     gateway hiccup, often self-resolves in <5 min).
 *   - Always 200/503 — never throws, never times out the function.
 *
 * Returns 200 if both checks pass, 503 otherwise. Intentionally
 * unauthenticated. No sensitive data is returned.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** Per-probe timeout. Keep well under Vercel's function timeout. */
const PROBE_TIMEOUT_MS = 3000;

type ProbeStatus = "ok" | "error" | "timeout";

type Checks = {
  postgrest: ProbeStatus;
  auth: ProbeStatus;
};

export async function GET() {
  const start = performance.now();
  const timestamp = new Date().toISOString();

  const [postgrest, auth] = await Promise.all([
    probePostgrest(),
    probeAuth(),
  ]);

  const checks: Checks = { postgrest, auth };
  const healthy = postgrest === "ok" && auth === "ok";

  const responseMs = Math.round(performance.now() - start);
  const body: Record<string, unknown> = {
    status: healthy ? "healthy" : "unhealthy",
    timestamp,
    responseMs,
    checks,
  };
  if (!healthy) {
    // Surface a machine-readable error code for monitor templates.
    body.error =
      postgrest !== "ok" && auth !== "ok"
        ? "supabase_unavailable"
        : postgrest !== "ok"
          ? "postgrest_unavailable"
          : "auth_unavailable";
  }

  return NextResponse.json(body, { status: healthy ? 200 : 503 });
}

// ── Probes ────────────────────────────────────────────────────────────────────

/**
 * Probe the PostgREST REST gateway with a head-only count against a known
 * table. Service-role key bypasses RLS so the result is deterministic.
 */
async function probePostgrest(): Promise<ProbeStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("user_settings")
      .select("user_id", { count: "exact", head: true })
      .limit(1)
      .abortSignal(controller.signal);
    if (error) {
      console.error("[health] postgrest probe error:", error.message);
      return "error";
    }
    return "ok";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[health] postgrest probe timed out after", PROBE_TIMEOUT_MS, "ms");
      return "timeout";
    }
    console.error("[health] postgrest probe threw:", err);
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe Supabase's auth service health endpoint. This is a different code
 * path from PostgREST and exercises a separate worker pool — useful for
 * distinguishing "REST gateway stuck" from "the whole project is sick".
 *
 * Endpoint: GET https://<project>.supabase.co/auth/v1/health
 * Public, no auth required. Returns 200 with `{ description, name, version }`.
 */
async function probeAuth(): Promise<ProbeStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    console.error("[health] auth probe skipped: missing NEXT_PUBLIC_SUPABASE_URL");
    return "error";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      method: "GET",
      // Supabase auth/v1/health requires the anon apikey header even though
      // the response is public. Without it the gateway returns 401.
      headers: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
        : {},
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[health] auth probe non-2xx:", res.status);
      return "error";
    }
    return "ok";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[health] auth probe timed out after", PROBE_TIMEOUT_MS, "ms");
      return "timeout";
    }
    console.error("[health] auth probe threw:", err);
    return "error";
  } finally {
    clearTimeout(timer);
  }
}
