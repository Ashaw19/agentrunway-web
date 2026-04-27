import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { sanitizeRedirect } from "@/lib/security/safe-redirect";

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
  "/clients",
  "/crm",
  "/forecast",
  "/expenses",
  "/mileage",
  "/reports",
  "/settings",
  "/profile",
  "/onboarding",
  "/org",
  "/consent",
  "/flight-control",
  "/altimeter",
  "/bank-sync",
  "/drive",
  "/overhead",
  "/referrals",
  "/scenarios",
  "/social",
  "/tax",
  "/guide",
  "/oauth",
  "/inbox",
];

export async function updateSession(request: NextRequest) {
  // ── Step 0: Request ID ───────────────────────────────────────────────────
  // Generate a unique ID for this request. Attach it to:
  //   • The forwarded request headers → API routes read it via req.headers
  //   • The response headers → clients and Vercel logs can correlate requests
  const requestId = globalThis.crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  // ── Step 1: Supabase session refresh ────────────────────────────────────
  // Required on every request so the SSR auth cookie stays fresh.
  // Use requestHeaders (with X-Request-Id) for both NextResponse.next() calls
  // so the ID is preserved even when setAll() recreates supabaseResponse.
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

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
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // ── Step 2: Resolve the current user ────────────────────────────────────
  // Wrapped in try/catch with a 1200ms timeout: Vercel edge middleware has a
  // hard wall-clock limit (~1.5s). If Supabase Auth is slow we treat the
  // request as unauthenticated so the middleware returns instead of timing
  // out and serving a 504 to every visitor. For protected routes this is
  // fail-CLOSED (user stays null → redirect to /login below); for public
  // routes it just means the request continues without an auth context.
  let user: { id: string } | null = null;
  try {
    const authCall = supabase.auth.getUser().then((r) => r.data.user);
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 1200),
    );
    user = await Promise.race([authCall, timeout]);
  } catch (err) {
    log.error({ err, requestId }, "[middleware] supabase.auth.getUser() threw");
    // user stays null — protected routes will redirect to /login below
  }

  const pathname = request.nextUrl.pathname;

  // ── Step 2b: Quebec geo-restriction ─────────────────────────────────────
  // Quebec has strict language (Bill 96) and privacy (Law 25) requirements.
  // Until French translation and full compliance are built, redirect Quebec
  // visitors to an informational landing page. Bypass cookie allows override.
  if (pathname !== "/quebec" && !pathname.startsWith("/quebec/")) {
    // Next.js 15 removed request.geo — Vercel now exposes geo via headers.
    // x-vercel-ip-country: ISO 3166-1 alpha-2 (e.g. "CA")
    // x-vercel-ip-country-region: ISO 3166-2 subdivision (e.g. "QC")
    const country = request.headers.get("x-vercel-ip-country");
    const region = request.headers.get("x-vercel-ip-country-region");
    const isQuebec = country === "CA" && region === "QC";
    const hasBypass = request.cookies.get("qc-bypass")?.value === "1";

    if (isQuebec && !hasBypass) {
      const url = request.nextUrl.clone();
      url.pathname = "/quebec";
      return NextResponse.redirect(url);
    }
  }

  // ── Step 3: Auth guard ──────────────────────────────────────────────────
  // Use an explicit denylist (not an allowlist) so new public pages are
  // automatically public without requiring an allowlist update.
  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Unauthenticated user → block protected routes only
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve the original URL so login can redirect back after auth
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user on /login → send to redirect param or dashboard
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = sanitizeRedirect(
      request.nextUrl.searchParams.get("redirect"),
      request.nextUrl.origin,
    );
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Attach the request ID to the outgoing response so clients and Vercel
  // logs can correlate it with server-side log lines.
  supabaseResponse.headers.set("x-request-id", requestId);

  return supabaseResponse;
}
