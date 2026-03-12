/**
 * lib/config.ts
 *
 * Server-side environment variable validation.
 *
 * Validated at module-load time so a misconfigured deploy surfaces
 * immediately — on the first request that imports this module — rather
 * than silently returning undefined inside a route handler at 2am.
 *
 * Usage:
 *   import { serverConfig } from "@/lib/config";
 *   const { groqApiKey } = serverConfig;
 *
 * Required vars throw at load time.
 * Optional vars are typed as `string | undefined` so callers must check.
 */

// ── Required variables ────────────────────────────────────────────────────────
// The app cannot function at all without these. Fail fast with a clear message.

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `[config] Missing required environment variables: ${missing.join(", ")}.\n` +
    `Set these in your Vercel project settings or .env.local file.`,
  );
}

// ── Validated config object ───────────────────────────────────────────────────

export const serverConfig = {
  // ── Supabase (required) ─────────────────────────────────────────────────────
  supabaseUrl:            process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey:        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,

  // ── AI features (optional — routes check and return 503 if absent) ──────────
  groqApiKey:    process.env.GROQ_API_KEY,

  // ── Stripe (optional — billing features degrade gracefully) ─────────────────
  stripeSecretKey:        process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret:    process.env.STRIPE_WEBHOOK_SECRET,
  stripePriceProfMonthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
  stripePriceProfAnnual:  process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,

  // ── Plaid (optional — bank sync features degrade gracefully) ─────────────────
  plaidClientId: process.env.PLAID_CLIENT_ID,
  plaidSecret:   process.env.PLAID_SECRET,
  plaidEnv:      (process.env.PLAID_ENV ?? "sandbox") as "sandbox" | "development" | "production",

  // ── Email (optional — emails silently skip if absent) ───────────────────────
  resendApiKey: process.env.RESEND_API_KEY,

  // ── App URLs ────────────────────────────────────────────────────────────────
  appUrl:     process.env.NEXT_PUBLIC_APP_URL  ?? "https://agentrunway.ca",
  siteUrl:    process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentrunway.ca",

  // ── Social / Meta (optional) ─────────────────────────────────────────────────
  metaAppId:     process.env.META_APP_ID,
  metaAppSecret: process.env.META_APP_SECRET,
} as const;

// Type helper so callers can narrow optional vars
export type ServerConfig = typeof serverConfig;
