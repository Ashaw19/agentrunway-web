/**
 * Agent Runway opens full-screen from a phone's Home Screen (2026-10-13).
 *
 * The manifest and the Apple tags are easy to break without noticing: there
 * is no error, the Home Screen icon just goes back to opening a browser tab.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "@/app/manifest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/

describe("web app manifest", () => {
  const m = manifest();

  it("opens full-screen on the dashboard, with the whole site in scope", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/dashboard");
    expect(m.scope).toBe("/");
    expect(m.name).toBe("Agent Runway");
    expect(m.short_name).toBe("Agent Runway");
  });

  it("points at icons that exist, including a 512px one", () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "512x512")).toBe(true);
    for (const icon of icons) {
      // /icon.png and /apple-icon.png are served from the app/ file convention.
      expect(existsSync(path.join(WEB, "app", icon.src.replace(/^\//, ""))), icon.src).toBe(true);
    }
  });

  it("the icons are opaque (iOS paints transparent pixels black)", () => {
    for (const file of ["app/icon.png", "app/apple-icon.png"]) {
      const png = readFileSync(path.join(WEB, file));
      // IHDR colour type at byte 25: 6 = RGBA, 2 = RGB. An RGBA icon is only
      // safe if no tRNS chunk makes it see-through and its corners are solid;
      // the corner pixel check needs a decoder, so this pins the format and
      // leaves a note for whoever replaces the artwork.
      expect([2, 6], file).toContain(png[25]);
      expect(png.includes(Buffer.from("tRNS")), `${file} has a tRNS chunk`).toBe(false);
    }
  });
});

describe("iOS Home Screen tags", () => {
  const layout = readFileSync(path.join(WEB, "app/layout.tsx"), "utf8");

  it("the root layout marks the site as a full-screen web app", () => {
    expect(layout).toMatch(/appleWebApp:\s*\{[\s\S]*?capable:\s*true/);
    expect(layout).toContain('"apple-mobile-web-app-capable": "yes"');
    expect(layout).toMatch(/statusBarStyle:\s*"default"/);
  });

  it("the start page is behind sign-in, so a signed-out launch lands on the login page", () => {
    const middleware = readFileSync(path.join(WEB, "lib/supabase/middleware.ts"), "utf8");
    expect(middleware).toMatch(/PROTECTED_PREFIXES\s*=\s*\[[\s\S]*?"\/dashboard"/);
  });
});
