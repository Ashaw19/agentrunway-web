import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Run Supabase session refresh — this handles auth cookies,
  // protected-route redirects, and request-id headers.
  //
  // Locale detection is handled entirely by next-intl's server config
  // (i18n/request.ts) which reads the NEXT_LOCALE cookie. No middleware
  // rewriting is needed because localePrefix is "never".
  return updateSession(request);
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
