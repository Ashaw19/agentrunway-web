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

  // Load Google Analytics via DOM when consented — avoids Next.js Script
  // src-prop type conflict introduced in @types/react 19.2 + TS 5.8.
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  useEffect(() => {
    if (!consented || !gaId) return;

    // Inject GTM loader script
    const loaderScript = document.createElement("script");
    loaderScript.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    loaderScript.async = true;
    document.head.appendChild(loaderScript);

    // Inject gtag init inline script
    const initScript = document.createElement("script");
    initScript.id = "google-analytics";
    initScript.textContent = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${gaId}', { page_path: window.location.pathname });
    `;
    document.head.appendChild(initScript);

    return () => {
      // Clean up on consent withdrawal
      if (loaderScript.parentNode) loaderScript.parentNode.removeChild(loaderScript);
      const existing = document.getElementById("google-analytics");
      if (existing?.parentNode) existing.parentNode.removeChild(existing);
    };
  }, [consented, gaId]);

  if (!consented) return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
