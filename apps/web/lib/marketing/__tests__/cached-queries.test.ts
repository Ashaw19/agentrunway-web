/**
 * Regression guard for the public-marketing data cache.
 *
 * Context — 2026-04-29 outage
 * ---------------------------
 * The marketing homepage (`app/page.tsx`) and waitlist page
 * (`app/waitlist/page.tsx`) used to SSR-fetch Supabase on every render. A
 * PostgREST/edge hiccup turned into a multi-minute root-domain outage
 * because every render queued another hanging fetch. The fix moved the
 * fetches into `lib/marketing/cached-queries.ts` behind `unstable_cache`
 * with conservative revalidation windows.
 *
 * This test exists so that fix doesn't silently regress. It asserts:
 *   1. The exported revalidate constants are within sane bounds.
 *   2. The exported cache tags exist and have stable string values
 *      (something else may call `revalidateTag()` against them).
 *   3. Both call-sites still import from this module — i.e. nobody
 *      reverted `app/page.tsx` or `app/waitlist/page.tsx` to a raw
 *      Supabase client SSR fetch.
 *
 * If this test fails, read the file header on
 * `apps/web/lib/marketing/cached-queries.ts` before "fixing" anything.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CHARTER_COUNT_CACHE_TAG,
  CHARTER_COUNT_REVALIDATE_SECONDS,
  TESTIMONIALS_CACHE_TAG,
  TESTIMONIALS_REVALIDATE_SECONDS,
  getApprovedTestimonials,
  getCharterPaidCount,
} from "../cached-queries";

const APP_DIR = path.resolve(__dirname, "../../../app");

describe("marketing/cached-queries — outage regression guards", () => {
  it("exports stable cache tags so revalidateTag() callers don't silently break", () => {
    // The literal strings matter — Stripe webhooks and admin actions may
    // call `revalidateTag(...)` against them. Renaming a tag without
    // updating the caller is a silent cache-poisoning bug.
    expect(TESTIMONIALS_CACHE_TAG).toBe("marketing:testimonials");
    expect(CHARTER_COUNT_CACHE_TAG).toBe("marketing:charter-count");
  });

  it("revalidate windows are long enough to absorb a Supabase hiccup", () => {
    // Floor: must be >= 60s so a per-request edge stampede cannot recreate
    // the April 29 outage. Ceiling: must be <= 24h so admin-approved
    // testimonials and charter-count flips appear within a sane window.
    expect(TESTIMONIALS_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(60);
    expect(TESTIMONIALS_REVALIDATE_SECONDS).toBeLessThanOrEqual(86_400);
    expect(CHARTER_COUNT_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(60);
    expect(CHARTER_COUNT_REVALIDATE_SECONDS).toBeLessThanOrEqual(86_400);
  });

  it("exports the cached query callables", () => {
    // We can't easily assert that `unstable_cache` is in the call chain
    // without mocking next/cache, but we can at least assert the exports
    // are callable. Combined with the source-import check below, this
    // catches the obvious "someone unwrapped unstable_cache" regression.
    expect(typeof getApprovedTestimonials).toBe("function");
    expect(typeof getCharterPaidCount).toBe("function");
  });

  it("cached-queries.ts still wraps both queries with unstable_cache", () => {
    // Grep guard. If someone replaces unstable_cache with a raw async
    // function this fires before the next outage does.
    const src = readFileSync(
      path.resolve(__dirname, "../cached-queries.ts"),
      "utf8",
    );
    expect(src).toMatch(/unstable_cache\s*\(/);
    // Both tags must appear in the file (used in the wrapper options).
    expect(src).toContain("marketing:testimonials");
    expect(src).toContain("marketing:charter-count");
  });

  it("app/page.tsx fetches testimonials via the cached helper, not raw Supabase", () => {
    const src = readFileSync(path.resolve(APP_DIR, "page.tsx"), "utf8");

    // Must import the cached helper.
    expect(src).toMatch(
      /from\s+["']@\/lib\/marketing\/cached-queries["']/,
    );
    expect(src).toContain("getApprovedTestimonials");

    // Must NOT re-introduce a raw `.from("testimonials")` SSR fetch on the
    // homepage — that's exactly the pattern that caused the outage.
    expect(src).not.toMatch(/\.from\(\s*["']testimonials["']\s*\)/);
  });

  it("app/waitlist/page.tsx fetches charter count via the cached helper, not raw Supabase", () => {
    const src = readFileSync(
      path.resolve(APP_DIR, "waitlist/page.tsx"),
      "utf8",
    );

    expect(src).toMatch(
      /from\s+["']@\/lib\/marketing\/cached-queries["']/,
    );
    expect(src).toContain("getCharterPaidCount");

    // Must NOT re-introduce a raw `.from("user_settings")` count query on
    // the waitlist page — same outage class.
    expect(src).not.toMatch(/\.from\(\s*["']user_settings["']\s*\)/);
  });
});
