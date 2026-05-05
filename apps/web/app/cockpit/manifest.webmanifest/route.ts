import { NextResponse } from "next/server";

// PWA manifest scoped to /cockpit so Andrew can install it to his dock
// independently from the Agent Runway product.
export const dynamic = "force-static";
export const revalidate = false;

export function GET() {
  const manifest = {
    name: "Cockpit · Agent Runway Inc.",
    short_name: "Cockpit",
    description: "Internal corporate-finance dashboard for Agent Runway Inc.",
    start_url: "/cockpit",
    scope: "/cockpit",
    display: "standalone",
    orientation: "any",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return NextResponse.json(manifest, {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
}
