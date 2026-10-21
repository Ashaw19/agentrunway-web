/**
 * One vehicle business-use share, from one resolver (2026-10-18, tightened
 * 2026-10-19 after review).
 *
 * The share applied to vehicle costs comes from CRA's logbook when it covers
 * the year (core/engines/vehicle-logbook-engine.ts) and from the declared
 * setting `user_settings.vehicle_business_use_pct` otherwise. Every surface
 * gets it through `expenseTaxContext(settings, logbook)`; the T2125, GST34
 * and ITC engines take it as a required argument. Memory records several
 * bugs where surfaces read the same input differently; this guard keeps a
 * surface from reading the setting on its own.
 *
 * Scanned: apps/web (app, lib, components), the MCP edge function,
 * apps/mobile, and packages/core. Tests are not scanned.
 *
 * What it checks:
 *   1. Every `expenseTaxContext(` call passes a second argument, and a
 *      literal `null` / `undefined` there is allowed only on a line marked
 *      `vehicle-share-ok` (the demo page, which has no logbook).
 *   2. Every `computeT2125(` call passes `vehicleBusinessUsePct`.
 *   3. The column name used as code (a property read, `?.`, destructuring,
 *      a bracket read, an object key, a template expression) appears only on
 *      a line marked `vehicle-share-ok` (or the line above): the resolver
 *      itself, the declared-setting editors, the row types. Inside a plain
 *      string (a `.select(...)` column list, a `Pick<>` key) it is fine.
 *   4. No copy calls km × CRA's per-km allowance rate a deduction. Until
 *      2026-10-18 the Mileage tab printed it as the total and estimated
 *      deduction and per trip, the T2125 PDF as the total at the CRA per-km
 *      rate, and the connector described a CRA deduction amount.
 *   5. CRA's per-km rates are not typed: they come from CRA_ALLOWANCE_RATES
 *      (tax-copy/cra-rules.ts), which names the year. `CRA_MILEAGE_RATES`
 *      held 2025's rates under the current year's label.
 *   6. The data export does not ship the generated `deduction` column under
 *      that name.
 * The probes at the end plant each kind of violation in a snippet and check
 * the scanner reports it.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const ROOTS = [
  join(WEB, "app"),
  join(WEB, "lib"),
  join(WEB, "components"),
  join(WEB, "supabase", "functions", "mcp-server"),
  join(REPO, "apps", "mobile", "app"),
  join(REPO, "apps", "mobile", "stores"),
  join(REPO, "apps", "mobile", "lib"),
  join(REPO, "apps", "mobile", "components"),
  join(REPO, "packages", "core"),
];

function files(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name === "__tests__" || name === "_shared" || name.startsWith(".")) return [];
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

interface Source { rel: string; text: string }

const SOURCES: Source[] = ROOTS.flatMap(files).map((file) => ({ rel: relative(REPO, file), text: readFileSync(file, "utf8") }));

const MARKER = "vehicle-share-ok";
const COLUMN = "vehicle_business_use_pct";

/**
 * The source with comments blanked, and with string text blanked too when
 * `strings` is set (template `${...}` expressions are kept: they are code).
 * Same length, so offsets and line numbers still line up.
 */
export function blank(src: string, { strings }: { strings: boolean }): string {
  const out = src.split("");
  const wipe = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  const templateDepth: number[] = [];
  let braceDepth = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      wipe(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      wipe(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      if (strings) wipe(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === "`" || (c === "}" && templateDepth.length && templateDepth[templateDepth.length - 1] === braceDepth)) {
      // Template text up to the closing backtick or the next `${`.
      if (c === "}") templateDepth.pop();
      let j = i + 1;
      while (j < src.length && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) j += src[j] === "\\" ? 2 : 1;
      if (strings) wipe(i + 1, j);
      if (src[j] === "$") {
        templateDepth.push(braceDepth);
        i = j + 2;
      } else {
        i = j + 1;
      }
      continue;
    }
    if (c === "{") braceDepth++;
    else if (c === "}") braceDepth--;
    i++;
  }
  return out.join("");
}

/** The argument list of a call whose "(" is at `open`, and its top-level arguments. */
function argsAt(src: string, open: number): string[] {
  let depth = 0;
  let start = open + 1;
  const args: string[] = [];
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) {
        args.push(src.slice(start, i));
        return args.map((a) => a.trim()).filter((a) => a.length > 0);
      }
    } else if (c === "," && depth === 1) {
      args.push(src.slice(start, i));
      start = i + 1;
    }
  }
  return args;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;
const marked = (text: string, line: number) => {
  const lines = text.split("\n");
  return (lines[line - 1] ?? "").includes(MARKER) || (lines[line - 2] ?? "").includes(MARKER);
};

/** Calls of `name(` that are not its definition, with their arguments. */
function callsOf(text: string, name: string): { line: number; args: string[] }[] {
  const code = blank(text, { strings: false });
  const out: { line: number; args: string[] }[] = [];
  for (const m of code.matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"))) {
    const before = code.slice(Math.max(0, m.index! - 20), m.index!);
    if (/function\s*$/.test(before)) continue;
    out.push({ line: lineOf(text, m.index!), args: argsAt(code, m.index! + m[0].length - 1) });
  }
  return out;
}

export function contextCallProblems({ rel, text }: Source): string[] {
  return callsOf(text, "expenseTaxContext").flatMap(({ line, args }) => {
    if (args.length < 2) return [`${rel}:${line} expenseTaxContext without the logbook`];
    if (/^(null|undefined)$/.test(args[1]) && !marked(text, line)) return [`${rel}:${line} expenseTaxContext(…, ${args[1]}) without ${MARKER}`];
    return [];
  });
}

export function t2125CallProblems({ rel, text }: Source): string[] {
  return callsOf(text, "computeT2125")
    .filter(({ args }) => !/\bvehicleBusinessUsePct\b/.test(args.join(",")))
    .map(({ line }) => `${rel}:${line} computeT2125 without vehicleBusinessUsePct`);
}

export function columnProblems({ rel, text }: Source): string[] {
  const out: string[] = [];
  const code = blank(text, { strings: true });
  for (const m of code.matchAll(new RegExp(`\\b${COLUMN}\\b`, "g"))) {
    const line = lineOf(text, m.index!);
    if (!marked(text, line)) out.push(`${rel}:${line} ${COLUMN} used as code`);
  }
  // A bracket read keeps the name in a string: `settings["vehicle_business_use_pct"]`.
  const noComments = blank(text, { strings: false });
  for (const m of noComments.matchAll(new RegExp(`\\[\\s*["'\`]${COLUMN}["'\`]\\s*\\]`, "g"))) {
    const line = lineOf(text, m.index!);
    if (!marked(text, line)) out.push(`${rel}:${line} ${COLUMN} read with brackets`);
  }
  return out;
}

const OLD_LABELS = [
  /total deduction(?! at)/i,
  /est\.\s*deduction/i,
  /deduction at cra per-km rate/i,
  /cra deduction amount/i,
  /\bdeduction \(auto-calculated/i,
  /estimated deduction: ~/i,
  /deductible rates are/i,
  /mileage deductions?\b/i,
];

export function labelProblems({ rel, text }: Source): string[] {
  const src = blank(text, { strings: false });
  return OLD_LABELS.flatMap((re) => {
    const m = re.exec(src);
    return m ? [`${rel}:${lineOf(text, m.index)} ${m[0]}`] : [];
  });
}

export function typedRateProblems({ rel, text }: Source): string[] {
  const src = blank(text, { strings: false });
  return [...src.matchAll(/\$0\.(?:5|6|7)\d\/km|\bCRA_MILEAGE_RATES\b|cra_rate_per_km\s*\?\?\s*0\.\d+/g)].map(
    (m) => `${rel}:${lineOf(text, m.index!)} ${m[0]}`,
  );
}

describe("one vehicle business-use share", () => {
  it("scans the apps and core", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
    for (const part of ["apps/mobile/", "functions/mcp-server/", "packages/core/engines/", "packages/core/lib/"]) {
      expect(SOURCES.some((s) => s.rel.includes(part)), part).toBe(true);
    }
  });

  it("every expenseTaxContext call passes the logbook", () => {
    expect(SOURCES.flatMap(contextCallProblems)).toEqual([]);
  });

  it("every computeT2125 call passes the resolved vehicle share", () => {
    expect(SOURCES.flatMap(t2125CallProblems)).toEqual([]);
  });

  it("the setting's column is used as code only where it is the declared one", () => {
    expect(SOURCES.flatMap(columnProblems)).toEqual([]);
  });

  it("no copy calls the per-km allowance figure a deduction", () => {
    // These describe the old labels on purpose ("Changed 2026-10-18: it was
    // labelled ...") or match words people type.
    const DESCRIBES_THE_CHANGE = new Set([
      "apps/web/lib/knowledge-base.ts",
      "apps/web/lib/troubleshooting-playbooks.ts",
      // Words people type, matched to route their question; not a label.
      "apps/web/lib/troubleshooting-classifier.ts",
    ]);
    expect(SOURCES.filter((s) => !DESCRIBES_THE_CHANGE.has(s.rel)).flatMap(labelProblems)).toEqual([]);
  });

  it("CRA's per-km rates are never typed", () => {
    expect(SOURCES.flatMap(typedRateProblems)).toEqual([]);
  });

  it("the data export renames the generated deduction column", () => {
    const exp = SOURCES.find((s) => s.rel === "apps/web/lib/data-export.ts")!;
    expect(exp.text).toMatch(/table: "mileage_logs",[\s\S]{0,600}renameColumns: \{ deduction: "allowance_rate_amount_not_a_deduction"/);
  });
});

// ── Probes: each kind of violation, planted, is reported ────────────────────

describe("the scanner catches what it is meant to", () => {
  const probe = (text: string): Source => ({ rel: "probe.ts", text });

  it.each([
    ["a property read", "const p = settings.vehicle_business_use_pct;"],
    ["an optional read", "const p = settings?.vehicle_business_use_pct ?? 0.8;"],
    ["destructuring", "const { vehicle_business_use_pct } = settings;"],
    ["destructuring with a rename", "const { vehicle_business_use_pct: pct } = row;"],
    ["a bracket read", 'const p = settings["vehicle_business_use_pct"];'],
    ["a template expression", "const s = `${settings.vehicle_business_use_pct}`;"],
    ["an object key", "save({ vehicle_business_use_pct: 0.5 });"],
  ])("%s of the setting", (_name, snippet) => {
    expect(columnProblems(probe(snippet)).length).toBeGreaterThan(0);
  });

  it.each([
    ["a column list", '.select("gst_hst_registered, vehicle_business_use_pct, home_office_business_use_pct")'],
    ["a Pick key", 'type S = Pick<UserSettings, "vehicle_business_use_pct">;'],
    ["a comment", "// vehicle_business_use_pct is the declared setting"],
    ["a marked line", "const p = settings.vehicle_business_use_pct; // vehicle-share-ok: the editor"],
  ])("not %s", (_name, snippet) => {
    expect(columnProblems(probe(snippet))).toEqual([]);
  });

  it("expenseTaxContext with one argument, or with null and no marker", () => {
    expect(contextCallProblems(probe("const c = expenseTaxContext(settings);"))).toHaveLength(1);
    expect(contextCallProblems(probe("const c = expenseTaxContext(settings, null);"))).toHaveLength(1);
    expect(contextCallProblems(probe("const c = expenseTaxContext(\n  settings,\n);"))).toHaveLength(1);
    expect(contextCallProblems(probe("const c = expenseTaxContext(settings, null); // vehicle-share-ok: demo"))).toEqual([]);
    expect(contextCallProblems(probe("const c = expenseTaxContext(settings, await logbookPromise);"))).toEqual([]);
    expect(contextCallProblems(probe("export function expenseTaxContext(settings, logbook) {}"))).toEqual([]);
  });

  it("computeT2125 without the share", () => {
    expect(t2125CallProblems(probe("computeT2125({ settings, transactions, expenses, ccaAssets })"))).toHaveLength(1);
    expect(t2125CallProblems(probe("computeT2125({ settings, vehicleBusinessUsePct: ctx.vehicleBusinessUsePct })"))).toEqual([]);
  });

  it("an old label and a typed rate", () => {
    expect(labelProblems(probe('const label = "Total deduction";'))).toHaveLength(1);
    expect(typedRateProblems(probe('const t = "$0.72/km first 5,000 km";'))).toHaveLength(1);
  });
});
