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
 *
 * Two more shapes of the same bug (2026-10-13):
 *
 *   - A timestamp printed as a date. `new Date(ts).toLocaleDateString("en-CA")`
 *     with no timeZone prints the runtime's date, so on the server a call
 *     logged at 9 pm Atlantic read as tomorrow's to the AI and in emails.
 *     Server sites pass `timeZone: APP_TIME_ZONE`. `ts.slice(0, 10)` and
 *     `ts.split("T")[0]` cut a timestamptz to its UTC date the same way; AI
 *     surfaces use `atlanticISODate(new Date(ts))`.
 *   - The Intelligence Briefing engine counts calendar days from a `today`
 *     anchor that defaults to the runtime's day. Server callers pass
 *     atlanticNoon().
 *
 * And the same clock in the database (2026-10-13). Postgres runs in UTC too,
 * so a timestamptz compared with a bare `2026-10-09` or `2026-10-09T00:00:00`
 * is compared with 9 pm Atlantic the evening before. "What did I do on
 * Oct 9" lost that evening's calls and took the evening of Oct 8. A bound on
 * a timestamp column is an instant: `.toISOString()` on a Date, or
 * `atlanticDayStart(day)` for a calendar day. This one is scanned in browser
 * and mobile code as well: the database reads the bound the same way
 * whoever sends it.
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

/** Balanced call arguments, one level of nested parentheses. */
const ARGS = String.raw`[^()]*(?:\([^()]*\)[^()]*)*`;

describe("REGRESSION — server code prints a timestamp on its Atlantic day, not the runtime's", () => {
  /** A Date built inline and formatted: `new Date(x).toLocaleDateString(...)`. */
  const INLINE_DATE_FORMAT = new RegExp(
    String.raw`new Date\((${ARGS})\)\s*\.\s*toLocale(?:Date|Time)?String\((${ARGS})\)`,
    "g",
  );

  /**
   * A calendar day, not an instant: a date-only value anchored to local noon
   * or midnight, or `new Date(y, m, d)`. Built and formatted in the same
   * zone, it prints its own day in any runtime, and a timeZone would move it.
   */
  const isCalendarDay = (dateArg: string) =>
    /T(?:12|00):00:00/.test(dateArg) || dateArg.replace(/\([^()]*\)/g, "").includes(",");

  const unzoned = (src: string) =>
    [...src.matchAll(INLINE_DATE_FORMAT)].filter(
      ([, dateArg, formatArgs]) => !isCalendarDay(dateArg) && !/\btimeZone\b/.test(formatArgs),
    );

  /** Files without "use client" whose formatting only ever runs in the browser. */
  const BROWSER_ONLY: Record<string, { count: number; why: string }> = {
    "apps/web/components/pdf/expense-export-pdf.tsx": {
      count: 1,
      why: "\"Generated on\" date; the PDF is rendered in the browser by expenses-content.tsx",
    },
    "apps/web/components/pdf/t2125-pdf.tsx": {
      count: 1,
      why: "\"Generated\" date; the PDF is rendered in the browser by reports-t2125-tab.tsx",
    },
    "apps/web/components/pdf/gst34-worksheet-pdf.tsx": {
      count: 1,
      why: "\"Generated\" date; the PDF is rendered in the browser by expenses-content.tsx",
    },
    "apps/web/lib/checklist/checklist.ts": {
      count: 1,
      why: "doneLabel weekday; only the checklist page's client component calls it",
    },
    "apps/web/lib/crm/relative-date.ts": {
      count: 1,
      why: "relativeDate's \"Oct 6\" past six days; only the CRM tab's client components call it",
    },
  };

  it("no inline timestamp formatting without a timeZone outside the allowlist", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of scannedFiles()) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      const src = readFileSync(file, "utf8");
      for (const m of unzoned(src)) {
        if (BROWSER_ONLY[rel]) {
          allowedSeen[rel] = (allowedSeen[rel] ?? 0) + 1;
          continue;
        }
        offenders.push(`${rel}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [rel, { count }] of Object.entries(BROWSER_ONLY)) {
      expect({ file: rel, matches: allowedSeen[rel] ?? 0 }).toEqual({ file: rel, matches: count });
    }
  });

  it("the regex catches unzoned timestamps and spares calendar days", () => {
    const bad = [
      `new Date(c.last_contact_at).toLocaleDateString("en-CA")`,
      `new Date(a.activity_date as string).toLocaleDateString("en-CA")`,
      `new Date(inv.expires_at).toLocaleDateString("en-CA", { month: "long", day: "numeric" })`,
      `new Date(unixTimestamp * 1000).toLocaleDateString("en-CA", {\n  year: "numeric",\n})`,
      `new Date().toLocaleDateString("en-CA")`,
      `new Date(entry.created_at).toLocaleString()`,
      `new Date(page.open_house_date).toLocaleDateString("en-CA", { weekday: "long" })`,
    ];
    const good = [
      `new Date(c.last_contact_at).toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE })`,
      `new Date().toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE, month: "long" })`,
      `new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { month: "short" })`,
      "new Date(`${dateStr}T00:00:00`).toLocaleDateString(\"en-CA\")",
      `new Date(y!, mo! - 1, day!).toLocaleDateString("en-CA", { weekday: "long" })`,
      `Number(tx.gci).toLocaleString()`,
    ];
    for (const s of bad) expect(unzoned(s), s).toHaveLength(1);
    for (const s of good) expect(unzoned(s), s).toHaveLength(0);
  });

  // What the AI is told: Flight Crew tools and prompts, chat, the MCP server.
  const AI_ROOTS = [
    "apps/web/lib/ai",
    "apps/web/app/api/chat",
    "apps/web/supabase/functions/mcp-server",
  ] as const;

  /** A timestamptz column cut to the first ten characters: its UTC date. */
  const TIMESTAMP_CUT =
    /\b(?:\w+_at|activity_date)\b[^\n;,]{0,30}?(?:\.slice\(0,\s*10\)|\.split\(\s*["']T["']\s*\)\s*\[0\]|\.substring\(0,\s*10\))/g;

  it("AI surfaces never cut a timestamp to its UTC date", () => {
    const files = AI_ROOTS.flatMap(sourceFiles);
    expect(files.some((f) => f.endsWith(path.join("ai", "client-memory-engine.ts")))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join("mcp-server", "tools", "crm.ts")))).toBe(true);
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(TIMESTAMP_CUT)) {
        offenders.push(`${rel}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /** A timestamp column interpolated into text as is: `${a.activity_date}`. */
  const RAW_IN_TEXT = /\$\{\s*(?:[\w$]+\??\.)*(?:\w+_at|activity_date)\s*(?:\?\?[^}]*)?\}/g;

  /** A timestamp column returned under its own name: `sent_at: item.sent_at`. */
  const RAW_IN_RESULT = /\b(\w+_at|activity_date)\s*:\s*(?:[\w$]+\??\.)+\1\b(?!\s*[)\]])/g;

  /** Raw timestamps that never reach the model. */
  const NOT_SHOWN: Record<string, { count: number; why: string }> = {
    "apps/web/supabase/functions/mcp-server/tools/opportunities.ts": {
      count: 1,
      why: "updated_at feeds computeOpportunityKpis (elapsed time); the rows returned to the model leave it out",
    },
  };

  it("AI surfaces never hand the model a raw timestamp", () => {
    const offenders: string[] = [];
    const allowedSeen: Record<string, number> = {};
    for (const file of AI_ROOTS.flatMap(sourceFiles)) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      const src = readFileSync(file, "utf8");
      const inResult = rel.includes("/mcp-server/tools/") ? [...src.matchAll(RAW_IN_RESULT)] : [];
      for (const m of [...src.matchAll(RAW_IN_TEXT), ...inResult]) {
        if (NOT_SHOWN[rel]) {
          allowedSeen[rel] = (allowedSeen[rel] ?? 0) + 1;
          continue;
        }
        offenders.push(`${rel}:${src.slice(0, m.index).split("\n").length} ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [rel, { count }] of Object.entries(NOT_SHOWN)) {
      expect({ file: rel, matches: allowedSeen[rel] ?? 0 }).toEqual({ file: rel, matches: count });
    }
  });

  it("the regexes catch a raw timestamp and spare a converted one", () => {
    const badText = [
      "`- [${a.activity_date}] ${a.type}`",
      "`- Last Contact: ${c.last_contact_at ?? \"never\"}`",
      "`- [${o.created_at}] ${o.opportunity_type}`",
      "`sent ${item?.sent_at}`",
    ];
    const goodText = [
      "`- [${atlanticDay(a.activity_date)}] ${a.type}`",
      "`- Last Contact: ${c.last_contact_at ? atlanticDay(c.last_contact_at) : \"never\"}`",
      "`- [${s.showing_date}] ${s.property_address}`",
      "`${new Date(c.last_contact_at).toLocaleDateString(\"en-CA\", { timeZone: APP_TIME_ZONE })}`",
    ];
    for (const s of badText) expect([...s.matchAll(RAW_IN_TEXT)], s).toHaveLength(1);
    for (const s of goodText) expect([...s.matchAll(RAW_IN_TEXT)], s).toHaveLength(0);

    const badResult = [`sent_at: item.sent_at,`, `updated_at: r.updated_at,`, `activity_date: a?.activity_date,`];
    const goodResult = [
      `sent_at: atlanticDay(item.sent_at),`,
      `created_at: atlanticDay(clientData.created_at as string),`,
      `trigger_date: item.trigger_date,`,
      `expected_close_date: r.expected_close_date,`,
    ];
    for (const s of badResult) expect([...s.matchAll(RAW_IN_RESULT)], s).toHaveLength(1);
    for (const s of goodResult) expect([...s.matchAll(RAW_IN_RESULT)], s).toHaveLength(0);
  });

  it("the regex catches a cut timestamp and spares date-only columns", () => {
    const bad = [
      "`- [${n.created_at.slice(0, 10)}] ${n.content}`",
      `last_updated: c.updated_at?.split("T")[0],`,
      `date: (a.activity_date as string)?.split("T")[0],`,
      `const day = new Date(row.last_send_at).toISOString().split("T")[0];`,
    ];
    const good = [
      `last_updated: atlanticDay(c.updated_at),`,
      `const month = tx.close_date.slice(0, 7);`,
      `const day = tx.date.slice(0, 10);`,
      `const id = created_at, label = name.slice(0, 10);`,
    ];
    for (const s of bad) expect([...s.matchAll(TIMESTAMP_CUT)], s).toHaveLength(1);
    for (const s of good) expect([...s.matchAll(TIMESTAMP_CUT)], s).toHaveLength(0);
  });
});

describe("REGRESSION — a timestamp column is never range-filtered with a bare date", () => {
  // Every app that talks to the database, client components included.
  const QUERY_ROOTS = [...SERVER_ROOTS, "apps/mobile/app", "apps/mobile/stores", "apps/mobile/lib", "apps/mobile/components", "apps/mobile/hooks"] as const;

  /** Balanced call arguments, two levels of nested parentheses. */
  const ARGS2 = String.raw`[^()]*(?:\((?:[^()]|\([^()]*\))*\)[^()]*)*`;

  /** `.gte("activity_date", <bound>)` and friends on a timestamptz column. */
  const RANGE_FILTER = new RegExp(
    String.raw`\.(?:gte|gt|lte|lt)\(\s*["'](?:\w+_at|activity_date|window_start|last_calendar_sync|subscription_current_period_end|last_modified|google_updated)["']\s*,\s*(${ARGS2})\)`,
    "g",
  );

  /** Visibly an instant: ends in toISOString(), or is an Atlantic day's start. */
  const INSTANT = /\.toISOString\(\)\s*$|\batlanticDayStart\(/;

  /** A bound is an instant on its face, or a local built as one in the same file. */
  function isInstant(bound: string, src: string): boolean {
    const b = bound.trim();
    if (INSTANT.test(b)) return true;
    if (!/^[A-Za-z_$][\w$]*$/.test(b)) return false;
    const decls = [...src.matchAll(new RegExp(String.raw`\b(?:const|let)\s+${b}\s*=\s*([\s\S]*?);`, "g"))];
    return decls.length > 0 && decls.every(([, init]) => INSTANT.test(init.trim()));
  }

  /** Bounds that are instants but don't show it at the call site. Reviewed by hand. */
  const REVIEWED: Record<string, { bounds: string[]; why: string }> = {
    "apps/web/lib/ai/tools.ts": {
      bounds: ["days.from", "days.to"],
      why: "atlanticDays(): atlanticDayStart instants for the period's first and last day",
    },
    "apps/web/lib/ai/briefing-metrics.ts": {
      bounds: ["dates.fourteenDaysAgo"],
      why: "briefingDateRanges(): now minus 14 days, toISOString()",
    },
    "apps/web/lib/actions/calendar-actions.ts": {
      bounds: ["options.from", "options.to"],
      why: "caller-supplied; no caller passes a range today",
    },
  };

  it("every bound on a timestamp column is an instant", () => {
    const offenders: string[] = [];
    const reviewedSeen: Record<string, Set<string>> = {};
    const files = QUERY_ROOTS.flatMap(sourceFiles);
    expect(files.some((f) => f.endsWith(path.join("ai", "tools.ts")))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join("stores", "data-store.ts")))).toBe(true);
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(RANGE_FILTER)) {
        const bound = m[1].trim();
        if (isInstant(bound, src)) continue;
        if (REVIEWED[rel]?.bounds.includes(bound)) {
          (reviewedSeen[rel] ??= new Set()).add(bound);
          continue;
        }
        offenders.push(`${rel}:${src.slice(0, m.index).split("\n").length} ${bound.replace(/\s+/g, " ")}`);
      }
    }
    expect(offenders).toEqual([]);
    for (const [rel, { bounds }] of Object.entries(REVIEWED)) {
      expect({ file: rel, bounds: [...(reviewedSeen[rel] ?? [])].sort() }).toEqual({ file: rel, bounds: [...bounds].sort() });
    }
  });

  it("the check catches bare dates and spares instants", () => {
    const bounds = (src: string) => [...src.matchAll(RANGE_FILTER)].map((m) => isInstant(m[1], src));
    const bad = [
      'query.gte("activity_date", `${startDate}T00:00:00`)',
      'query.lte("activity_date", `${endDate}T23:59:59`)',
      '.gte("activity_date", new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10))',
      'const monthStart = `${atlanticISODate().slice(0, 7)}-01`;\nq.gte("sent_at", monthStart)',
      'const cutoff = d.toISOString().slice(0, 10);\nq.gte("created_at", cutoff)',
      '.lt("last_contact_at", dates.fourteenDaysAgo)',
      '.gte("created_at", since)',
    ];
    const good = [
      '.gte("activity_date", atlanticDayStart(startDate).toISOString())',
      '.lt("activity_date", atlanticDayStart(addDaysISO(endDate, 1)).toISOString())',
      '.lt("last_contact_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())',
      '.gte("sent_at", outreachSuppressionCutoff().toISOString())',
      'const since = new Date(\n  Date.now() - 7 * 86_400_000,\n).toISOString();\nq.gte("received_at", since)',
    ];
    for (const s of bad) expect(bounds(s), s).toEqual([false]);
    for (const s of good) expect(bounds(s), s).toEqual([true]);
    // Date columns are not timestamps: a bare date is right for them.
    expect(bounds('.gte("date", yearStart).lte("expense_date", `${year}-12-31`)')).toEqual([]);
  });
});

describe("REGRESSION — a datetime-local value is saved as an instant", () => {
  // `<input type="datetime-local">` yields `2026-10-09T21:30`, the agent's
  // wall clock with no offset. Inserted as is, the database reads it as UTC
  // and stores the activity three or four hours early. The form converts it
  // with localDateTimeToInstant (lib/crm/local-datetime.ts) before saving.
  it("every file with a datetime-local input converts its value", () => {
    const withInput = SERVER_ROOTS.flatMap(sourceFiles)
      .filter((f) => f.endsWith(".tsx") && /type=["']datetime-local["']/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(REPO_ROOT, f).split(path.sep).join("/"));
    expect(withInput).toEqual(["apps/web/app/(app)/crm/clients-content.tsx"]);
    for (const rel of withInput) {
      const src = readFileSync(path.join(REPO_ROOT, rel), "utf8");
      expect(src, rel).toContain("localDateTimeToInstant(");
      // The value the form holds is never the value inserted.
      expect(src, rel).not.toMatch(/activity_date:\s*activityDate\b/);
    }
  });
});

describe("REGRESSION — the mobile app reads days off the device's calendar", () => {
  // On the phone the local day is the user's own. Three ways the app read
  // the UTC day instead, all in the offline briefing and activity counters:
  //   - `new Date(birthdate)`: a date-only value parsed as UTC midnight, the
  //     evening before in Atlantic time. Birthdays use nextYearlyDate().
  //   - `new Date().toISOString().split("T")[0]` as "today": tomorrow from
  //     9 pm. The device's day is localISODate().
  //   - `activity_date.startsWith(today)` / `.split("T")[0]`: the UTC date of
  //     a timestamp. Its day is localISODate(new Date(activity_date)).
  const MOBILE_ROOTS = ["apps/mobile/app", "apps/mobile/stores", "apps/mobile/lib", "apps/mobile/components", "apps/mobile/hooks"] as const;

  const UTC_DAY = [
    /new Date\(\s*[\w.?]*birthdate\s*\)/g,
    /toISOString\(\)\s*\.\s*(?:split\(\s*["']T["']\s*\)\s*\[0\]|slice\(0,\s*10\))/g,
    /\b(?:\w+_at|activity_date)\b\s*\.\s*(?:startsWith\(|split\(\s*["']T["']\s*\)|slice\(0,\s*10\))/g,
  ];

  it("no UTC-day idiom in the mobile app", () => {
    const files = MOBILE_ROOTS.flatMap(sourceFiles);
    expect(files.some((f) => f.endsWith(path.join("stores", "data-store.ts")))).toBe(true);
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      const src = readFileSync(file, "utf8");
      for (const re of UTC_DAY) {
        for (const m of src.matchAll(re)) {
          offenders.push(`${rel}:${src.slice(0, m.index).split("\n").length} ${m[0]}`);
        }
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it("the regexes catch the UTC-day idioms and spare the local ones", () => {
    const hits = (s: string) => UTC_DAY.reduce((n, re) => n + [...s.matchAll(re)].length, 0);
    const bad = [
      `const bday = new Date(cl.birthdate);`,
      `const todayStr = new Date().toISOString().split("T")[0];`,
      `const yesterday = new Date(Date.now() - 86400000)\n  .toISOString()\n  .split("T")[0];`,
      `a.activity_date.startsWith(todayStr)`,
      `allActivities.map((a) => a.activity_date.split("T")[0])`,
    ];
    const good = [
      `const next = nextYearlyDate(cl.birthdate);`,
      `const todayStr = localISODate();`,
      `localISODate(new Date(a.activity_date))`,
      `t.due_date.startsWith(todayStr)`,
      `activity_date: new Date().toISOString(),`,
    ];
    for (const s of bad) expect(hits(s), s).toBe(1);
    for (const s of good) expect(hits(s), s).toBe(0);
  });
});

describe("REGRESSION — server callers give the Intelligence Briefing the Atlantic day", () => {
  // computeIntelligenceBriefing counts birthdays and anniversaries from its
  // `today` argument, which defaults to the runtime's day (right in the
  // browser). Left to default on the server, "today!" and "tomorrow" move a
  // day from 8 pm Atlantic and a Dec 31 birthday is missed that evening.
  const BRIEFING_CALL = new RegExp(String.raw`computeIntelligenceBriefing\((${ARGS})\)`, "g");

  it("every server call passes atlanticNoon()", () => {
    const calls: { where: string; args: string }[] = [];
    for (const file of scannedFiles()) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(BRIEFING_CALL)) {
        calls.push({ where: `${rel}:${src.slice(0, m.index).split("\n").length}`, args: m[1] });
      }
    }
    expect(calls.map((c) => c.where.replace(/:\d+$/, "")).sort()).toEqual([
      "apps/web/app/(app)/dashboard/page.tsx",
      "apps/web/app/api/mobile/briefing/route.ts",
    ]);
    expect(calls.filter((c) => !c.args.includes("atlanticNoon()")).map((c) => c.where)).toEqual([]);
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
