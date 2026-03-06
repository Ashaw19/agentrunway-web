import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Explicit list of route prefixes that require a valid Supabase session.
 * Everything NOT on this list is public — /, /login, /auth/*, and any
 * future marketing pages are automatically accessible without auth.
 *
 * NOTE: www ↔ apex host canonicalization is intentionally NOT done here.
 * It must be configured exclusively in the Vercel dashboard (Domains →
 * set one domain as primary, the other as a redirect). Doing it in both
 * places creates a redirect loop.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/transactions",
  "/pipeline",
  "/history",
  "/forecast",
  "/expenses",
  "/reports",
  "/settings",
  "/profile",
  "/onboarding",
];

export async function updateSession(request: NextRequest) {
  // ── Step 1: Supabase session refresh ────────────────────────────────────
  // Required on every request so the SSR auth cookie stays fresh.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ── Step 2: Auth guard ──────────────────────────────────────────────────
  // Use an explicit denylist (not an allowlist) so new public pages are
  // automatically public without requiring an allowlist update.
  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Unauthenticated user → block protected routes only
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated user on /login → send to dashboard
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
