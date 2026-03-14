"use client";

// PIPEDA/CASL-compliant cookie notice banner.
//
// Canada's PIPEDA does not require opt-in consent for analytics cookies as long
// as they are clearly disclosed. This banner informs users and records their
// preference in localStorage. The banner is non-blocking — users can continue
// using the app without responding.
//
// Key: "ar-cookie-consent" in localStorage → "accepted" | "declined"

import { useState, useEffect } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

export function CookieConsent() {
  // null = hydrating (don't render), false = show banner, true = hide banner
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    // Read preference on mount — avoid hydration flash by deferring to client
    const stored = localStorage.getItem("ar-cookie-consent");
    setVisible(!stored); // show if no preference recorded yet
  }, []);

  // Don't render anything during SSR or while loading localStorage
  if (visible === null || visible === false) return null;

  const dismiss = (choice: "accepted" | "declined") => {
    localStorage.setItem("ar-cookie-consent", choice);
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

        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <button
            onClick={() => dismiss("declined")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded hover:bg-muted"
          >
            Decline
          </button>
          <button
            onClick={() => dismiss("accepted")}
            className="text-xs bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors font-medium"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
