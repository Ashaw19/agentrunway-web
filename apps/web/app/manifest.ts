import type { MetadataRoute } from "next";

/**
 * Web app manifest: lets Agent Runway be added to a phone's Home Screen and
 * open full-screen, like an app, with no App Store involved.
 *
 *   iPhone / iPad: Safari → Share → Add to Home Screen
 *   Android:       Chrome → menu → Add to Home screen / Install app
 *
 * Added 2026-10-13. Andrew wanted Agent Runway on his own iPhone (look
 * things up, capture receipts, make updates on the go) without the Apple
 * Developer Program. Before this, the Home Screen icon opened a Safari tab
 * with the address bar and toolbar.
 *
 * - `start_url` is the dashboard. Signed out, the middleware sends it to
 *   /login and back.
 * - A Home Screen app keeps its own sign-in, separate from Safari's: the
 *   agent signs in once inside it.
 * - Icons are the app/icon.png and app/apple-icon.png file-convention icons.
 *   Both are fully opaque; iOS paints transparent pixels black.
 * - No service worker: this is not an offline app. It needs a connection.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Agent Runway",
    short_name: "Agent Runway",
    description:
      "Track GCI, expenses and clients, capture receipts and talk to your Flight Crew.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    // Splash while the app loads: the navy of the icon. The toolbar colour
    // matches the app's light background.
    background_color: "#070e30",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
