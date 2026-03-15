/**
 * lib/logger.ts
 *
 * Structured logger for Agent Runway server-side code.
 *
 * Built on pino — the standard for Next.js / Node.js apps.
 * Outputs JSON lines to stdout, which Vercel Function Logs captures and
 * makes searchable. Any external log aggregator (Datadog, Logtail, etc.)
 * can ingest these lines directly.
 *
 * Usage:
 *   import { log } from "@/lib/logger";
 *
 *   log.info("User signed in", { userId: user.id });
 *   log.warn("[plaid/sync] transactionsSync slow", { itemId, ms: 4200 });
 *   log.error("[chat] Groq error", { err, requestId });
 *
 * Log levels:
 *   debug — dev only (filtered out when NODE_ENV=production)
 *   info  — normal operation milestones
 *   warn  — recoverable issues, retries, degraded paths
 *   error — failures that need investigation
 *
 * Request ID:
 *   Pass { requestId } in the extras object to correlate all log lines
 *   for a single request. The request ID comes from the x-request-id header
 *   injected by middleware:
 *
 *   import { headers } from "next/headers";
 *   const requestId = (await headers()).get("x-request-id") ?? undefined;
 *   log.info("[route] POST received", { requestId });
 */

import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

export const log = pino({
  // Filter debug logs in production — info and above only
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),

  // Remove pid and hostname — not useful in serverless environments
  base: null,

  // ISO 8601 timestamp
  timestamp: pino.stdTimeFunctions.isoTime,

  // Serialise Error objects properly
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },

  // Rename "msg" → "message" for compatibility with most log ingestion tools
  messageKey: "message",

  // Standard level label format (keeps "level" as a string field)
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Re-export pino type so callers can type extra fields if needed
export type Logger = typeof log;
