/**
 * REGRESSION TRIPWIRE — server code never reads "this year / this month /
 * today" off the runtime clock (2026-10-09).
 *
 * Vercel and Supabase Edge run in UTC. From 8 pm Atlantic on Dec 31,
 * `new Date().getFullYear()` there is already next year, and on a month-end
 * evening `getMonth()` is already next month. The server's YTD filters,
 * months-elapsed expense estimates, AI "Current Year" context, cockpit fiscal
 * year and MCP analytics all rolled over four hours early. The fix (with
 * #291's atlanticISODate) is `@agent-runway/core/lib/local-date`:
 *
 *   atlanticYear() / atlanticMonth()   a single year or month
 *   atlanticNoon()                     a calendar anchor for date math and
 *                                      for engines that take `now`
 *
 * Scope: every web file that is not "use client" (route handlers, server
 * components, shared lib) and the Supabase edge functions. Only the direct
 * `new Date().getFullYear()` shape is matched; a `const now = new Date()`
 * read later can't be caught by a regex, so review those by hand.
 *
 * Browser code is not scanned: there the local clock is the user's own.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../.."); // agentrunway-web/

const SERVER_ROOTS = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "apps/web/supabase/functions",
] as const;

/** `new Date()` read straight off the clock for a calendar field. */
const RUNTIME_CALENDAR = /new Date\(\)\s*\.\s*get(?:FullYear|Month|Date|Day)\(\)/g;

/**
 * Known matches left in place, counted per file so a new one still fails and
 * a fixed one forces this list to shrink.
 */
const ALLOWED: Record<string, { count: number; why: string }> = {};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const abs = path.join(REPO_ROOT, dir);
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      // _shared/core is a generated copy of packages/core (pnpm build:mcp-shared).
      if (entry === "node_modules" || entry === "dist" || entry === "__tests__" || entry === "_shared" || entry.startsWith(".")) continue;
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

/** "use client" as the first statement, after any leading comments. */
const isClientComponent = (src: string) =>
  /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/.test(src);

function scannedFiles(): string[] {
  return SERVER_ROOTS.flatMap(sourceFiles).filter((f) => !isClientComponent(readFileSync(f, "utf8")));
}

describe("REGRESSION — server code takes the calendar from Atlantic time, not the UTC clock", () => {
  const files = scannedFiles();

  it("finds server files to scan (guards against a broken walker)", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith(path.join("api", "chat", "route.ts")))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join("mcp-server", "tools", "analytics.ts")))).toBe(true);
  });

  it("no runtime-clock year / month / day outside the allowlist", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(RUNTIME_CALENDAR)) {
        if (ALLOWED[rel]) {
          allowedSeen[rel] = (allowedSeen[rel] ?? 0) + 1;
          continue;
        }
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [rel, { count }] of Object.entries(ALLOWED)) {
      expect({ file: rel, matches: allowedSeen[rel] ?? 0 }).toEqual({ file: rel, matches: count });
    }
  });

  it("the regex catches the runtime-clock shapes and spares parsed dates", () => {
    const bad = [
      `const y = new Date().getFullYear();`,
      "const ytdStart = `${new Date().getFullYear()}-01-01`;",
      `const m = new Date().getMonth() + 1;`,
      `const d = new Date()\n  .getDate();`,
      `const w = new Date().getDay();`,
    ];
    const good = [
      `const y = atlanticYear();`,
      `const y = new Date(tx.date + "T12:00:00").getFullYear();`,
      `const d = today.getDate();`,
      `const ts = new Date().toISOString();`,
    ];
    for (const s of bad) expect([...s.matchAll(RUNTIME_CALENDAR)], s).toHaveLength(1);
    for (const s of good) expect([...s.matchAll(RUNTIME_CALENDAR)], s).toHaveLength(0);
  });
});

describe("seasonalFractionElapsed — MCP mirror reads the same Atlantic clock as core", () => {
  // The Deno mirror is a deliberate copy (mcp-server/lib/README.md). If one
  // side goes back to UTC, server YTD (Atlantic) and the fraction disagree on
  // Dec 31 evening: pace vs goal reads ~100x, projected GCI ~11x.
  const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");
  const body = (src: string) => {
    const start = src.indexOf("export function seasonalFractionElapsed(");
    expect(start).toBeGreaterThanOrEqual(0);
    return src.slice(start, src.indexOf("\n}\n", start));
  };

  it("both anchor quarters on atlanticWallClock, not the UTC fields of the instant", () => {
    for (const rel of [
      "packages/core/engines/projection-engine.ts",
      "apps/web/supabase/functions/mcp-server/lib/projection-engine.ts",
    ]) {
      const fn = body(read(rel));
      expect(fn, rel).toContain("atlanticWallClock(date)");
      expect(fn, rel).toContain("yearFractionElapsed(atlanticNoon(date))");
      expect(fn, rel).not.toMatch(/\bdate\.getUTC(?:FullYear|Month)\(\)/);
    }
  });
});
