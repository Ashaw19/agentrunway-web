import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sitemap from "@/app/sitemap";

/**
 * Search Console tripwires (2026-10-07). Google flagged "Alternate page with
 * proper canonical tag" for agentrunway.ca. Crawling the live sitemap showed
 * 53/57 URLs self-canonical; the gaps were:
 *   - 8 URLs listed in the sitemap whose pages say noindex (a contradictory
 *     signal: "crawl this" + "don't index this");
 *   - the homepage had no canonical, so /index and ?ref= / ?utm_ copies of it
 *     gave Google no preferred URL.
 */

const APP_DIR = path.resolve(__dirname, "../../app");

/** Route path for an app/ page file: drop route groups, keep static segments. */
function routeFor(file: string): string | null {
  const rel = path.relative(APP_DIR, path.dirname(file));
  const segs = rel === "" ? [] : rel.split(path.sep).filter((s) => !/^\(.*\)$/.test(s));
  if (segs.some((s) => s.startsWith("["))) return null; // dynamic route — not a fixed sitemap URL
  return "/" + segs.join("/");
}

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pageFiles(p));
    else if (entry.name === "page.tsx") out.push(p);
  }
  return out;
}

const NOINDEX = /robots:\s*\{[^}]*index:\s*false/;

describe("sitemap", () => {
  const urls = sitemap().map((e) => new URL(e.url).pathname.replace(/\/$/, "") || "/");

  it("finds the noindex pages it guards (sanity)", () => {
    const noindex = pageFiles(APP_DIR).filter((f) => NOINDEX.test(fs.readFileSync(f, "utf8")));
    expect(noindex.length).toBeGreaterThan(0);
  });

  it("never lists a page that tells Google not to index it", () => {
    const noindexRoutes = pageFiles(APP_DIR)
      .filter((f) => NOINDEX.test(fs.readFileSync(f, "utf8")))
      .map(routeFor)
      .filter((r): r is string => r !== null);
    const listed = noindexRoutes.filter((r) => urls.includes(r));
    expect(listed).toEqual([]);
  });
});

describe("homepage", () => {
  it("declares a canonical URL, so /index and tracking-tagged copies resolve to it", () => {
    const src = fs.readFileSync(path.join(APP_DIR, "page.tsx"), "utf8");
    expect(src).toMatch(/alternates:\s*\{\s*canonical:\s*"https:\/\/agentrunway\.ca\/"/);
  });
});
