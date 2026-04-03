"use client";

// PIPEDA / Quebec Law 25 compliant cookie consent banner.
//
// Quebec's Law 25 requires opt-in consent for non-essential cookies/tracking.
// Default state (no choice made) = NO tracking loaded.
// Accept = load analytics and session replay.
// Decline = only essential services (Sentry error tracking without replay).
//
// Key: "ar-cookie-consent" in localStorage -> "accepted" | "declined"

import { useState, useEffect } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

/** Check if user has accepted cookies. Returns true only if explicitly accepted. */
export function hasConsentedToCookies(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("ar-cookie-consent") === "accepted";
}

/** Custom event name dispatched when consent changes */
export const CONSENT_CHANGE_EVENT = "ar-cookie-consent-change";

export function CookieConsent() {
  // null = hydrating (don't render), true = show banner, false = hide banner
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("ar-cookie-consent");
    setVisible(!stored); // show if no preference recorded yet
  }, []);

  // Don't render anything during SSR or while loading localStorage
  if (visible === null || visible === false) return null;

  const dismiss = (choice: "accepted" | "declined") => {
    localStorage.setItem("ar-cookie-consent", choice);
    // Dispatch custom event so other components can react
    window.dispatchEvent(
      new CustomEvent(CONSENT_CHANGE_EVENT, { detail: choice })
    );
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-2xl w-full bg-card border border-border rounded-xl shadow-elevation-lift p-4 flex items-start gap-3">
        <Cookie className="h-5 w-5 text-primary mt-0.5 shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium mb-0.5">We use cookies</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Agent Runway uses essential cookies for authentication and optional
            analytics to improve the product.{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        {/* OPC guidance: both options must be equally prominent (no dark patterns) */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <button
            onClick={() => dismiss("declined")}
            className="text-xs border border-border text-foreground rounded-lg px-3 py-1.5 hover:bg-muted transition-colors font-medium"
          >
            Decline
          </button>
          <button
            onClick={() => dismiss("accepted")}
            className="text-xs border border-border text-foreground rounded-lg px-3 py-1.5 hover:bg-muted transition-colors font-medium"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
