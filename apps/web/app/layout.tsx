import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { CookieConsent } from "@/components/cookie-consent";
import "./globals.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = "https://agentrunway.ca";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: "Agent Runway | Business Analytics for Real Estate Agents",
    template: "%s | Agent Runway",
  },
  description:
    "Agent Runway helps real estate agents track GCI, forecast income, measure financial runway, and receive AI-powered insights about their business performance.",

  openGraph: {
    type: "website",
    url: BASE_URL,
    siteName: "Agent Runway",
    title: "Agent Runway | Business Analytics for Real Estate Agents",
    description:
      "Agent Runway helps real estate agents track GCI, forecast income, measure financial runway, and receive AI-powered insights about their business performance.",
    images: [
      {
        url: "/og-image-v2.png",
        width: 1200,
        height: 630,
        alt: "Agent Runway — Business Analytics for Real Estate Agents",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Agent Runway | Business Analytics for Real Estate Agents",
    description:
      "Agent Runway helps real estate agents track GCI, forecast income, measure financial runway, and receive AI-powered insights about their business performance.",
    images: ["/og-image-v2.png"],
  },

  icons: {
    icon: [
      { url: "/favicon.ico",  sizes: "any" },
      { url: "/icon.png",     type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-icon.png",
    shortcut: "/favicon.ico",
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <CookieConsent />
        </ThemeProvider>

        {/* Google Analytics — loads only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set */}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}', { page_path: window.location.pathname });
              `}
            </Script>
          </>
        )}

        {/* Plausible Analytics — loads only when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set */}
        {PLAUSIBLE_DOMAIN && (
          <Script
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        )}

        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
