import type { NextConfig } from "next";

// ── Security headers ──────────────────────────────────────────────────────────
//
// Applied globally via next.config headers() so every page and API route
// inherits them without per-route boilerplate.
//
// CSP notes:
//   - 'unsafe-inline' for scripts is required by Next.js App Router hydration.
//   - cdn.plaid.com  — Plaid Link SDK (loaded client-side)
//   - js.stripe.com  — Stripe.js (loaded client-side for billing)
//   - *.supabase.co  — Supabase REST, Auth, Realtime, and Storage
//   - api.groq.com   — server-side only, but listed in connect-src to allow
//                      any future client-side streaming fetch
//   - frame-src      — Stripe Checkout iframe + Plaid Link iframe
//   - frame-ancestors 'none' — equivalent to X-Frame-Options: DENY (belt+suspenders)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.plaid.com https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://graph.facebook.com https://*.cdninstagram.com https://*.fbcdn.net",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.plaid.com https://api.stripe.com https://api.groq.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://cdn.plaid.com",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  // Prevent the page from being embedded in iframes (clickjacking defence)
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers from MIME-sniffing response content-type
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send origin in the Referer header for same-site requests;
  // strip it entirely for cross-origin requests
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser features the app doesn't use
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Content Security Policy
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  // Prevent canvas-dependent packages from being bundled into the Node server
  // bundle — they are only ever used client-side via dynamic imports.
  serverExternalPackages: ["@react-pdf/renderer", "pdfjs-dist"],

  async headers() {
    return [
      {
        // Apply to every route: pages, API routes, and the receipt upload page
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
