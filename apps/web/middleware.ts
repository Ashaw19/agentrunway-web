import { type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { updateSession } from "@/lib/supabase/middleware";
import { routing } from "@/i18n/routing";

// next-intl locale detection middleware (Accept-Language header + cookie)
const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // 1. Run Supabase session refresh first — this handles auth cookies,
  //    protected-route redirects, and request-id headers.
  const supabaseResponse = await updateSession(request);

  // If Supabase middleware issued a redirect (e.g. unauthenticated user
  // hitting a protected route, or authenticated user on /login), honour
  // that redirect immediately — do not run locale detection.
  if (supabaseResponse.headers.get("location")) {
    return supabaseResponse;
  }

  // 2. Run next-intl locale detection. This inspects Accept-Language,
  //    the NEXT_LOCALE cookie, and the URL prefix to resolve the locale.
  const intlResponse = intlMiddleware(request);

  // Merge Supabase cookies into the intl response so auth tokens are
  // preserved even when next-intl issues its own response (e.g. a locale
  // redirect like / → /fr-CA).
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    intlResponse.cookies.set(cookie.name, cookie.value, {
      ...cookie,
    });
  });

  // Preserve the x-request-id header set by the Supabase middleware
  const requestId = supabaseResponse.headers.get("x-request-id");
  if (requestId) {
    intlResponse.headers.set("x-request-id", requestId);
  }

  return intlResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (svg, png, jpg, etc.)
     * - r/* (phone receipt-upload raw HTML — unauthenticated, must be instant)
     * - api/receipts/mobile-upload/* (phone file POST — unauthenticated)
     */
    "/((?!_next/static|_next/image|favicon.ico|r/|api/receipts/mobile-upload/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
