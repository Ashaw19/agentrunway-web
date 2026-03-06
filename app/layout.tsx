import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
        url: "/og-image.png",
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
    images: ["/og-image.png"],
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
