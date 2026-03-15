import { Resend } from "resend";

/**
 * Server-side Resend instance for transactional email.
 *
 * Returns `null` if RESEND_API_KEY is not set — all callers handle the null
 * case gracefully so the app works without email configured in development.
 *
 * To activate:
 *   1. Create an account at resend.com
 *   2. Verify your sending domain (agentrunway.ca → Resend → Domains → Add)
 *   3. Create an API key (Resend → API Keys → Create)
 *   4. Add to .env.local:
 *        RESEND_API_KEY=re_...
 *   5. Add the same var to Vercel → Settings → Environment Variables
 */
export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** Verified sending address — must match a domain verified in Resend dashboard */
export const FROM_ADDRESS = "Agent Runway <hello@agentrunway.ca>";
