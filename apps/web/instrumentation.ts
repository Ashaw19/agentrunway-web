// Next.js instrumentation file — required for Sentry server & edge initialization
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#create-initialization-config-files

import * as Sentry from "@sentry/nextjs";
import { scrubErrorEvent, scrubTransactionEvent } from "@/lib/sentry-scrubber";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      enabled: process.env.NODE_ENV === "production",
      // Defense-in-depth PII scrubbing on every outgoing event.
      // Source code should never log PII in the first place; this ensures
      // accidental leakage is stripped before reaching Sentry's servers.
      beforeSend: scrubErrorEvent,
      beforeSendTransaction: scrubTransactionEvent,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      // Minimal sampling for edge (lightweight runtime)
      tracesSampleRate: 0.05,
      environment: process.env.NODE_ENV,
      enabled: process.env.NODE_ENV === "production",
      // Same PII scrubbing on the edge runtime.
      beforeSend: scrubErrorEvent,
      beforeSendTransaction: scrubTransactionEvent,
    });
  }
}

// Capture errors from nested React Server Components
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#errors-from-nested-react-server-components
export const onRequestError = Sentry.captureRequestError;
