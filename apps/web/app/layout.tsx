import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter_Tight, Instrument_Serif } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { ConsentAwareAnalytics } from "@/components/consent-aware-analytics";
import { rtlLocales, type Locale } from "@/i18n/routing";
import { organizationSchema, webSiteSchema } from "@/lib/schema";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Cockpit-only typography (scoped via font-[var(...)] on the cockpit shell;
// customer-facing pages still default to Geist).
const interTight = Inter_Tight({
  variable: "--font-cockpit-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-cockpit-display",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
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
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Agent Runway — Financial Intelligence. Clear for Takeoff.",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Agent Runway | Business Analytics for Real Estate Agents",
    description:
      "Agent Runway helps real estate agents track GCI, forecast income, measure financial runway, and receive AI-powered insights about their business performance.",
    images: ["/og-image.png"],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
  const dir = rtlLocales.has(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* Global JSON-LD: Organization + WebSite entities on every page.
            Page-specific schemas (SoftwareApplication, FAQPage, Article, etc.)
            are emitted by individual pages. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${interTight.variable} ${instrumentSerif.variable} antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
            {children}
            <CookieConsent />
          </ThemeProvider>
        </NextIntlClientProvider>

        {/* All analytics (Vercel, GA) are consent-gated */}
        <ConsentAwareAnalytics />
      </body>
    </html>
  );
}
