import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// ── Security headers ──────────────────────────────────────────────────────────
//
// Applied globally via next.config headers() so every page and API route
// inherits them without per-route boilerplate.
//
// CSP notes:
//   - 'unsafe-inline'    — Required by Next.js App Router hydration.
//   - 'unsafe-eval'      — Required by onnxruntime-web (ORT v1.21) used inside
//                          @imgly/background-removal. ORT generates optimised WASM
//                          bindings via new Function() at runtime. 'wasm-unsafe-eval'
//                          alone is NOT enough — it only covers WebAssembly.compile(),
//                          not eval()/new Function().
//   - 'wasm-unsafe-eval' — Allows WebAssembly compilation for ORT & yoga-layout
//                          (@react-pdf/renderer). Kept alongside 'unsafe-eval' for
//                          older browsers that treat them independently.
//   - blob: (script-src) — ORT v1.21 creates a type:"module" Worker whose script URL
//                          is a blob:. Chrome checks script-src for module workers.
//   - blob: (connect-src)— The ORT worker calls fetch(blobUrl) to load the WASM binary.
//                          'self' does NOT cover the blob: scheme.
//   - blob: (worker-src) — @imgly spawns a Web Worker via blob URL.
//   - blob: (child-src)  — Safari fallback (Safari ignores worker-src, uses child-src).
//   - cdn.plaid.com      — Plaid Link SDK (loaded client-side)
//   - js.stripe.com      — Stripe.js (loaded client-side for billing)
//   - *.supabase.co      — Supabase REST, Auth, Realtime, and Storage
//   - api.groq.com       — server-side only, listed for future client-side streaming
//   - staticimgly.com    — @imgly model + ORT WASM files (~45 MB, fetched on demand)
//   - frame-src          — Stripe Checkout iframe + Plaid Link iframe
//   - frame-ancestors    — 'none' = X-Frame-Options: DENY (belt+suspenders)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.plaid.com https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://graph.facebook.com https://*.cdninstagram.com https://*.fbcdn.net",
  "connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://*.plaid.com https://api.stripe.com https://api.groq.com https://staticimgly.com",
  "worker-src blob: 'self'",
  "child-src blob: 'self'",
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

  // Allow Next.js <Image> to load from Supabase Storage and social CDNs
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "graph.facebook.com" },
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "*.fbcdn.net" },
    ],
  },

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

export default withSentryConfig(nextConfig, {
  // Sentry organization and project (set in Vercel env vars)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress output in local dev; show in CI
  silent: !process.env.CI,

  // Upload wider sourcemap coverage for better stack traces
  widenClientFileUpload: true,

  // Tunnel Sentry requests through /monitoring to avoid ad-blocker interference
  // This works because the tunnelRoute is on the same origin ('self' in CSP)
  tunnelRoute: "/monitoring",

  webpack: {
    // Suppress Sentry's own logger in production bundles (tree-shaking)
    treeshake: { removeDebugLogging: true },
    // Auto-instrument Vercel Cron Monitors if used
    automaticVercelMonitors: true,
  },
});
