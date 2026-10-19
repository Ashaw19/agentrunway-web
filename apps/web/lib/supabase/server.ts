import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * The signed-in user's Supabase client (session cookie, RLS applies).
 * `fetch` swaps the HTTP layer; Flight Crew routes pass `ledgerFetch`
 * (lib/ai/write-ledger.ts) so the writes a tool makes are recorded.
 */
export async function createClient(opts?: { fetch?: typeof fetch }) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(opts?.fetch ? { global: { fetch: opts.fetch } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — ignore
          }
        },
      },
    },
  );
}
