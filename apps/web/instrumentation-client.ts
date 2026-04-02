// Sentry browser configuration
// Loaded in the browser for every page (replaces sentry.client.config.ts).
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
//
// Cookie consent compliance (Quebec Law 25):
// - Basic error tracking (without replay) is treated as essential for service
//   operation and is always enabled in production.
// - Session Replay is non-essential tracking and is ONLY enabled when the user
//   has explicitly accepted cookies via the consent banner.

import * as Sentry from "@sentry/nextjs";

// Instrument client-side navigation transitions for performance monitoring
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// Check cookie consent at init time — localStorage is available in client JS
const hasConsented =
  typeof window !== "undefined" &&
  localStorage.getItem("ar-cookie-consent") === "accepted";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of all traces for performance monitoring (low cost)
  tracesSampleRate: 0.1,

  // Session Replay — only active when user has consented to non-essential cookies
  replaysOnErrorSampleRate: hasConsented ? 1.0 : 0,
  replaysSessionSampleRate: hasConsented ? 0.01 : 0,

  // Only include replay integration when user has consented
  integrations: hasConsented
    ? [
        Sentry.replayIntegration({
          // Mask all text input values (protects PII / financial data)
          maskAllText: true,
          blockAllMedia: false,
        }),
      ]
    : [],

  environment: process.env.NODE_ENV,

  // Only send events in production — keeps dev console clean
  enabled: process.env.NODE_ENV === "production",
});

// Listen for mid-session consent changes so replay can be enabled if the user
// accepts cookies after initial page load.
if (typeof window !== "undefined") {
  window.addEventListener("ar-cookie-consent-change", ((e: Event) => {
    const choice = (e as CustomEvent).detail;
    const client = Sentry.getClient();
    if (!client || choice !== "accepted") return;

    // Dynamically add replay integration if not already present
    if (!client.getIntegrationByName("Replay")) {
      client.addIntegration(
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: false,
        })
      );
    }
  }) as EventListener);
}
