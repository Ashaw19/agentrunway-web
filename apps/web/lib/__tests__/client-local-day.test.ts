/**
 * REGRESSION TRIPWIRE — browser and device code never takes "today" from
 * toISOString (2026-10-09).
 *
 * `new Date().toISOString().slice(0, 10)` (or `.split("T")[0]`) is the UTC
 * day. Every Canadian time zone is behind UTC, so from 8 pm Atlantic it is
 * already tomorrow. PR #290 fixed it in the CRM tab (tasks due today read as
 * overdue, new tasks defaulted to tomorrow); the sweep that followed found it
 * in 14 more client components and 2 mobile files: form dates that defaulted
 * to tomorrow (mileage, showings, referrals, listing appointments, cockpit
 * forms, a closed deal logged on mobile), "tasks due today" on mobile, and the
 * REAL anniversary-year `asOf` on the dashboard, reports, overhead and
 * forecast.
 *
 * In code that runs on the user's device the fix is `localISODate()` from
 * `@agent-runway/core/lib/local-date` (the local calendar day). Server code
 * uses `atlanticISODate()` from the same module; it is not scanned here
 * because a UTC timestamp or a UTC-built date is sometimes the right answer
 * there.
 *
 * Scope: web files marked "use client" and everything under apps/mobile. In
 * those files any toISOString → YYYY-MM-DD / YYYY-MM-DDTHH:mm slice is the
 * UTC day of some instant, which is never the user's day. Timestamps for
 * timestamptz columns (activity_date, created_at, …) keep the full
 * `toISOString()` and are not matched.
 *
 * Source-level on purpose, like date-only-anchor.test.ts: the bug only
 * reproduces between 8 pm and midnight Atlantic, so a runtime test would have
 * to pin the clock and the host TZ, and it would only cover the files it
 * imports.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../.."); // agentrunway-web/

const WEB_ROOTS = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/hooks",
  "apps/web/lib",
] as const;

const MOBILE_ROOTS = [
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/hooks",
  "apps/mobile/lib",
  "apps/mobile/stores",
] as const;

/**
 * `.toISOString()` followed (across whitespace/newlines) by a cut to the
 * year, month, date or minute: `.slice(0, 4 | 7 | 10 | 16)` (or substring /
 * substr) or `.split("T")[0]`.
 */
const UTC_DAY = /\.toISOString\(\)\s*\.\s*(?:(?:slice|substring|substr)\(\s*0\s*,\s*(?:4|7|10|16)\s*\)|split\(\s*["']T["']\s*\)\s*\[\s*0\s*\])/g;

/**
 * Known matches left in place, counted per file so a new one still fails and
 * a fixed one forces this list to shrink.
 */
const ALLOWED: Record<string, { count: number; why: string }> = {
  "apps/mobile/stores/data-store.ts": {
    count: 3,
    why:
      "todayActivityCount + contactStreak bucket contact_activities.activity_date " +
      "(timestamptz) by its UTC date and compare it with the UTC today/yesterday. " +
      "Out of scope for the 2026-10-09 sweep (timestamptz left alone); both sides " +
      "need to move to the local day together.",
  },
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const abs = path.join(REPO_ROOT, dir);
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === "dist" || entry === "__tests__" || entry.startsWith(".")) continue;
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
  const web = WEB_ROOTS.flatMap(sourceFiles).filter((f) => isClientComponent(readFileSync(f, "utf8")));
  const mobile = MOBILE_ROOTS.flatMap(sourceFiles);
  return [...web, ...mobile];
}

describe("REGRESSION — client code takes today from the local day, not toISOString", () => {
  const files = scannedFiles();

  it("finds client and mobile files to scan (guards against a broken walker)", () => {
    expect(files.filter((f) => f.includes(`${path.sep}apps${path.sep}web${path.sep}`)).length).toBeGreaterThan(100);
    expect(files.filter((f) => f.includes(`${path.sep}apps${path.sep}mobile${path.sep}`)).length).toBeGreaterThan(20);
  });

  it("no toISOString date cut outside the allowlist", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(UTC_DAY)) {
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

  it("the regex catches the UTC-day shapes and spares full timestamps", () => {
    const bad = [
      `const t = new Date().toISOString().slice(0, 10);`,
      `const t = new Date().toISOString().split("T")[0];`,
      `const t = now.toISOString().slice(0, 16);`,
      `const y = new Date(Date.now() - 86400000)\n  .toISOString()\n  .split("T")[0];`,
      `const t = d.toISOString().substring(0, 10);`,
      `const month = new Date().toISOString().slice(0, 7);`,
    ];
    const good = [
      `const ts = new Date().toISOString();`,
      `const t = localISODate();`,
      `const t = new Date(iso + "T12:00:00");`,
    ];
    for (const s of bad) expect([...s.matchAll(UTC_DAY)], s).toHaveLength(1);
    for (const s of good) expect([...s.matchAll(UTC_DAY)], s).toHaveLength(0);
  });
});
