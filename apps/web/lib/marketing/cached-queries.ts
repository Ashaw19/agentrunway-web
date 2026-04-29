/**
 * Public marketing-page data, cached at the Next.js data-cache layer.
 *
 * Why this file exists
 * --------------------
 * The marketing homepage (`app/page.tsx`) and waitlist page (`app/waitlist/page.tsx`)
 * are server-rendered and previously SSR-fetched the same public data on every
 * render. On 2026-04-29 a PostgREST/edge hiccup (Cloudflare 522s on the
 * Supabase REST gateway) cascaded into a marketing-site outage: every page
 * render queued another hanging fetch, the connection pool exhausted, and the
 * entire root domain returned `Timeout (no headers received)` to Better Stack
 * for several minutes at a time.
 *
 * The data here changes hourly at most (testimonials are admin-approved, the
 * charter slot count moves only when Stripe webhooks land), so caching the
 * fetches with `unstable_cache` is the right primitive: edge caches absorb
 * the load, and a single cache-population race per revalidation window can
 * fail without taking the page down.
 *
 * Stateless Supabase client
 * -------------------------
 * `unstable_cache` requires the underlying work to be deterministic — it must
 * not read request cookies, headers, or other dynamic context. The cookie-
 * bound `lib/supabase/server.ts` client therefore does not work here. We
 * instantiate a fresh stateless `@supabase/supabase-js` client per call. RLS
 * policies on `testimonials` allow public read of `approved = true` rows.
 */

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Cache config ──────────────────────────────────────────────────────────────

/** Testimonials change only when an admin approves a new one. 1 hour is plenty. */
export const TESTIMONIALS_REVALIDATE_SECONDS = 3600;

/** Charter slot count moves on Stripe webhook events. 5 minutes is responsive enough. */
export const CHARTER_COUNT_REVALIDATE_SECONDS = 300;

/** Cache tags — exported so future server actions can call `revalidateTag()`. */
export const TESTIMONIALS_CACHE_TAG = "marketing:testimonials";
export const CHARTER_COUNT_CACHE_TAG = "marketing:charter-count";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApprovedTestimonial = {
  id: string;
  name: string;
  title: string | null;
  quote: string;
  rating: number | null;
};

// ── Stateless anon client (no cookies, no auth state) ─────────────────────────

function statelessAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "[marketing/cached-queries] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Cached queries ────────────────────────────────────────────────────────────

/**
 * Approved testimonials for the homepage carousel.
 *
 * Cached for 1 hour. To invalidate immediately (e.g. after admin approval),
 * call `revalidateTag(TESTIMONIALS_CACHE_TAG)` from a server action.
 */
export const getApprovedTestimonials = unstable_cache(
  async (): Promise<ApprovedTestimonial[]> => {
    const supabase = statelessAnonClient();
    const { data, error } = await supabase
      .from("testimonials")
      .select("id, name, title, quote, rating")
      .eq("approved", true)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6);

    if (error) {
      // Don't poison the cache with an empty result: throwing causes
      // unstable_cache to re-fetch on the next request rather than serving an
      // empty array for the next hour. Caller can fall back to [].
      console.error("[marketing/cached-queries] testimonials fetch failed:", error.message);
      throw error;
    }

    return (data ?? []) as ApprovedTestimonial[];
  },
  ["marketing", "testimonials", "approved", "homepage"],
  {
    revalidate: TESTIMONIALS_REVALIDATE_SECONDS,
    tags: [TESTIMONIALS_CACHE_TAG],
  },
);

/**
 * Count of paid (`subscription_tier = professional`) users — used to compute
 * charter slots remaining on the waitlist page.
 *
 * Cached for 5 minutes. Stripe webhook handlers should call
 * `revalidateTag(CHARTER_COUNT_CACHE_TAG)` after a paid signup so the marketing
 * surface updates promptly.
 */
export const getCharterPaidCount = unstable_cache(
  async (): Promise<number> => {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("user_settings")
      .select("user_id", { count: "exact", head: true })
      .eq("subscription_tier", "professional");

    if (error) {
      console.error("[marketing/cached-queries] charter count fetch failed:", error.message);
      throw error;
    }
    return count ?? 0;
  },
  ["marketing", "charter-count", "professional"],
  {
    revalidate: CHARTER_COUNT_REVALIDATE_SECONDS,
    tags: [CHARTER_COUNT_CACHE_TAG],
  },
);

