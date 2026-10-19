/**
 * The signed-in user behind an API request, from either app.
 *
 * Web sends the Supabase session cookie. The phone app (Expo) has no cookie
 * and sends `Authorization: Bearer <access token>` instead. A route that both
 * apps call resolves the user here, so neither app gets a silent 401: the
 * phone's AI Morning Briefing card called the cookie-only /api/briefing and
 * never loaded (found 2026-10-14).
 *
 * The returned client is scoped to that user either way, so RLS applies:
 * the cookie client for web, a token-scoped client for the phone. The admin
 * client is used only to check the token, never for the route's reads.
 *
 * A token-scoped client has no stored session, so `supabase.auth.getUser()`
 * with no argument returns no user on it: pass `user.id` from here instead.
 */

import { createClient as createJsClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RequestUser {
  user: User;
  supabase: SupabaseClient;
}

/**
 * `opts.fetch` becomes the returned client's fetch (either kind); the chat
 * route passes `ledgerFetch` so Flight Crew's writes are recorded.
 */
export async function getRequestUser(
  req: Request,
  opts?: { fetch?: typeof fetch },
): Promise<RequestUser | null> {
  const cookieClient = await createClient(opts);
  const { data: { user: cookieUser } } = await cookieClient.auth.getUser();
  if (cookieUser) {
    // The @supabase/ssr cookie client and the supabase-js client share the
    // query surface (.from / .rpc / .auth); routes take the broader type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { user: cookieUser, supabase: cookieClient as any };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const accessToken = authHeader.slice(7);

  const { data: { user: bearerUser } } = await createAdminClient().auth.getUser(accessToken);
  if (!bearerUser) return null;

  const options = {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  };
  if (opts?.fetch) Object.assign(options.global, { fetch: opts.fetch });
  const supabase = createJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    options,
  );
  return { user: bearerUser, supabase };
}
