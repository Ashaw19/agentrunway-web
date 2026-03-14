// Sentry browser configuration
// Loaded in the browser for every page (replaces sentry.client.config.ts).
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client

import * as Sentry from "@sentry/nextjs";

// Instrument client-side navigation transitions for performance monitoring
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of all traces for performance monitoring (low cost)
  tracesSampleRate: 0.1,

  // Capture 100% of sessions where an error occurs (full replay on errors)
  replaysOnErrorSampleRate: 1.0,
  // Capture 1% of all other sessions for general performance insight
  replaysSessionSampleRate: 0.01,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text input values (protects PII / financial data)
      maskAllText: true,
      blockAllMedia: false,
    }),
  ],

  environment: process.env.NODE_ENV,

  // Only send events in production — keeps dev console clean
  enabled: process.env.NODE_ENV === "production",
});
