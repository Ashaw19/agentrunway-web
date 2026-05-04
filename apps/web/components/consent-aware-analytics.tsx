"use client";

// Conditionally loads ALL non-essential analytics based on cookie consent.
// Quebec Law 25 requires opt-in consent — analytics must NOT load until the user
// explicitly clicks "Accept" on the cookie banner.
//
// This component gates:
// - Vercel Analytics
// - Vercel Speed Insights
// - Google Analytics (if NEXT_PUBLIC_GA_MEASUREMENT_ID env var is set)

import { useState, useEffect } from "react";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { CONSENT_CHANGE_EVENT } from "@/components/cookie-consent";

export function ConsentAwareAnalytics() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    // Check initial consent state
    const stored = localStorage.getItem("ar-cookie-consent");
    setConsented(stored === "accepted");

    // Listen for consent changes
    function handleConsentChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      setConsented(detail === "accepted");
    }

    window.addEventListener(CONSENT_CHANGE_EVENT, handleConsentChange);
    return () =>
      window.removeEventListener(CONSENT_CHANGE_EVENT, handleConsentChange);
  }, []);

  if (!consented) return null;

  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <>
      <Analytics />
      <SpeedInsights />

      {/* Google Analytics — only when consented and env var is set */}
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', { page_path: window.location.pathname });
            `}
          </Script>
        </>
      )}
    </>
  );
}
