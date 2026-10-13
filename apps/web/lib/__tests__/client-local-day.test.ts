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
 *
 * A second shape of the same mistake (2026-10-13): a day count made by
 * flooring elapsed time, `Math.floor((now - then) / 86_400_000)`, and shown
 * as "Today / Yesterday / 3 days ago" or "Closing in 2d". That counts
 * 24-hour blocks, not days: a call logged at 10 pm read "Today" at 9 the
 * next morning, a deal closing tomorrow read "Closing in 0d" from noon, and
 * `Math.ceil` between two local midnights ran a day long across the autumn
 * clock change. A count behind a label is `localDaysSince` or
 * `daysBetweenISO` from the same module (lib/crm/relative-date.ts holds the
 * CRM labels). Flooring elapsed time is still right for a rule about time
 * passed ("no contact in 14 days"), so every floor or ceil over a day's
 * milliseconds in client, mobile and engine code is listed below with the
 * reason it is one.
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
// Empty since 2026-10-13: the mobile store's todayActivityCount and
// contactStreak (three matches) moved to the phone's local day, both sides
// together. server-calendar.test.ts guards the other half, the activity's
// own day.
const ALLOWED: Record<string, { count: number; why: string }> = {};

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

// ── Day counts: calendar days for a label, elapsed time for a rule ──────────

const ENGINE_ROOTS = ["packages/core/engines", "packages/core/lib"] as const;

/** A day in milliseconds, or hours divided by 24. */
const DAY_OF_ELAPSED_TIME =
  /86_?400_?000|1000\s*\*\s*60\s*\*\s*60\s*\*\s*24|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|\b(?:DAY|DAY_MS|dayMs|MS_PER_DAY)\b|\b\w*(?:[hH]ours|[hH]rs)\w*\s*\/\s*24\b/;

/** Comments blanked out, offsets kept: a doc comment may quote the shape. */
const withoutComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, " "));

/** Offsets of every `Math.floor(…)` / `Math.ceil(…)` whose argument divides by a day. */
function flooredDayCounts(source: string): number[] {
  const src = withoutComments(source);
  const out: number[] = [];
  for (const m of src.matchAll(/Math\.(?:floor|ceil)\(/g)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
    }
    if (DAY_OF_ELAPSED_TIME.test(src.slice(start, i - 1))) out.push(m.index);
  }
  return out;
}

/**
 * Elapsed-time counts left in place, counted per file so a new one still
 * fails and a fixed one forces this list to shrink. Each is a rule about
 * time passed or a position in the year, not a "today / yesterday / N days
 * ago" label.
 */
const ELAPSED_RULES: Record<string, { count: number; why: string }> = {
  "apps/web/app/(app)/crm/tabs/pipeline-tab.tsx": {
    count: 1,
    why: "the 14-day check-in and 30-day rules and the row colour; the row's label is lastTouchLabel",
  },
  "apps/web/app/(app)/forecast/forecast-content.tsx": {
    count: 1,
    why: "days to the next remittance date: rounded up to a local midnight, which is the calendar count at any hour of the day",
  },
  "apps/web/app/(app)/pipeline/components/opportunity-cockpit-strip.tsx": {
    count: 1,
    why: "length of the year-to-date window for a conversion rate, never printed as a date label",
  },
  "apps/web/app/(app)/settings/settings-content.tsx": {
    count: 1,
    why: "bank sync age as a duration (minutes, hours, then days), not a day name",
  },
  "apps/mobile/lib/theme.ts": {
    count: 1,
    why: "day of the year, to rotate content",
  },
  "apps/mobile/stores/data-store.ts": {
    count: 2,
    why: "offline briefing: how long a new lead has gone uncontacted, and days without contact past the 14-day rule",
  },
  "packages/core/engines/crm-analytics-engine.ts": {
    count: 4,
    why: "days without contact against the 14 and 30 day rules (\"12d silent\"), and a new lead's age from its hours (twice)",
  },
  "packages/core/engines/pipeline-forecast-engine.ts": {
    count: 1,
    why: "days a deal has sat in its stage, a duration",
  },
  "packages/core/engines/projection-engine.ts": {
    count: 2,
    why: "day of the year and week of the year for pacing",
  },
  "packages/core/engines/tax-optimization-engine.ts": {
    count: 1,
    why: "days left to Dec 31, rounded up to a local midnight",
  },
};

describe("REGRESSION — a day count behind a label is calendar days, not floored elapsed time", () => {
  const rel = (f: string) => path.relative(REPO_ROOT, f).split(path.sep).join("/");
  const engineFiles = ENGINE_ROOTS.flatMap(sourceFiles);
  const files = [...scannedFiles(), ...engineFiles];

  it("finds engine files to scan (guards against a broken walker)", () => {
    expect(engineFiles.length).toBeGreaterThan(30);
  });

  it("no floor or ceil over a day of elapsed time outside the listed rules", () => {
    const offenders: string[] = [];
    const seen: Record<string, number> = {};
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const index of flooredDayCounts(src)) {
        if (ELAPSED_RULES[rel(file)]) {
          seen[rel(file)] = (seen[rel(file)] ?? 0) + 1;
          continue;
        }
        offenders.push(`${rel(file)}:${src.slice(0, index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [file, { count }] of Object.entries(ELAPSED_RULES)) {
      expect({ file, matches: seen[file] ?? 0 }).toEqual({ file, matches: count });
    }
  });

  it("the matcher catches the elapsed-day shapes and spares calendar counts", () => {
    const bad = [
      `const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);`,
      `return Math.floor((Date.now() - ms) / 86_400_000);`,
      `return Math.floor(diff / (1000 * 60 * 60 * 24));`,
      `const daysUntil = Math.ceil(\n  (dl.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),\n);`,
      `const daysOld = createdMs ? Math.floor((now - createdMs) / DAY) : 0;`,
      `const diffDays = Math.floor(diffHours / 24);`,
    ];
    const good = [
      `const days = localDaysSince(act.activity_date);`,
      `const days = daysBetweenISO(localISODate(at), localISODate(now));`,
      `return Math.round((to.getTime() - from.getTime()) / 86_400_000);`,
      `const mins = Math.floor(diff / 60_000);`,
      `const cutoff = Date.now() - 14 * 86_400_000;`,
      `const weeks = Math.floor(days / 7);`,
    ];
    for (const s of bad) expect(flooredDayCounts(s), s).toHaveLength(1);
    for (const s of good) expect(flooredDayCounts(s), s).toHaveLength(0);
    // A comment that quotes the shape is not a use of it.
    expect(flooredDayCounts(`// was Math.floor((now - then) / 86_400_000)\nconst n = 1;`)).toHaveLength(0);
    expect(flooredDayCounts(`/** Not Math.floor(ms / 86_400_000). */\nconst n = 1;`)).toHaveLength(0);
  });
});
