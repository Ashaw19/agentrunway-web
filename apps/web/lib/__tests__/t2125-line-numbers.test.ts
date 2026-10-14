/**
 * REGRESSION TRIPWIRE: a T2125 line number in copy is a line of CRA's form
 * (2026-10-13).
 *
 * Every surface used to type its own line numbers. The public T2125 guide
 * had 11 of its 14 expense lines wrong (phone on "Line 8940", which the form
 * does not have; travel on 8910, which is Rent; home office on 8810, which
 * is Office expenses). The Reports T2125 tab and its PDF printed "Line 8200"
 * and "Line 8270", neither on the form, and "T1 General Line 10400", which
 * is other employment income.
 *
 * The form's lines are now held once, in
 * packages/core/engines/t2125-lines.ts (T2125_LINES, read from form T2125 E
 * (25)). This test reads the source and fails on:
 *   1. a "Line NNNN" (or `lineNum="NNNN"`) anywhere in web, mobile or core
 *      copy whose number is not a line of the form;
 *   2. a guide page that types a line number on a category card in place of
 *      taking it from the engine's expense map or the form's line list;
 *   3. the wording this change removed: a $500 cut-off for office purchases
 *      credited to CRA, a mileage verdict worked out from an assumed 20,000 km
 *      a year, and "8.8%" as the quick method rate outside Ontario.
 *
 * It cannot tell that a valid line is the right one for the sentence it is
 * in. packages/core/engines/__tests__/t2125-lines.test.ts pins which line
 * each expense item is on.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isT2125LineNumber, t2125ReturnLinesPhrase } from "@agent-runway/core/engines/t2125-lines";
import { QUICK_METHOD_SERVICE_RATES_RULE } from "@agent-runway/core/tax-copy/quick-method";
import { getPlaybook } from "../troubleshooting-playbooks";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../.."); // agentrunway-web/

const ROOTS = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "apps/web/content",
  "apps/web/public/llms.txt",
  "apps/web/supabase/functions",
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/lib",
  "packages/core",
] as const;

const SCANNED = /\.(?:ts|tsx|mdx|md|txt)$/;
const SKIPPED = /(?:^|\/)(?:node_modules|__tests__|\.next|dist)(?:\/|$)|\.test\.tsx?$/;

function walk(rel: string, out: string[] = []): string[] {
  const abs = path.join(REPO_ROOT, rel);
  if (!existsSync(abs) || SKIPPED.test(rel)) return out;
  if (statSync(abs).isFile()) {
    if (SCANNED.test(rel)) out.push(rel);
    return out;
  }
  for (const name of readdirSync(abs)) walk(`${rel}/${name}`, out);
  return out;
}

const FILES = ROOTS.flatMap((root) => walk(root));
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

/** Code comments explain a change and may quote the old numbers; they are not copy. */
const COMMENT = /^\s*(?:\/\/|\/\*|\*(?:\s|\/|$)|\{\/\*)/;

/** A source file without its comment lines. */
const copyOf = (rel: string) => read(rel).split("\n").filter((line) => !COMMENT.test(line)).join("\n");

/**
 * "Line 9220", "line&nbsp;8871", "Lines 8521–9270", "lines 8000 to 8299".
 * T2125 lines are four digits starting 8 or 9; the return's lines are five
 * digits and a GST34's are three, so neither is read as one.
 */
const LINE_REF = /\blines?(?:\s|&nbsp;)+((?:[89]\d{3})(?:\s?(?:[–—-]|&ndash;|to|and|,)\s?[89]\d{3})*)(?!\d)/gi;
/** `lineNum="8299"`, `lineNumber: "9281"`. */
const LINE_PROP = /\blineNum(?:ber)?\s?[=:]\s?\{?["'`](\d{4})["'`]/g;

function lineNumbersIn(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(LINE_REF)) found.push(...(match[1].match(/\d{4}/g) ?? []));
  for (const match of text.matchAll(LINE_PROP)) found.push(match[1]);
  return found;
}

const EXPENSES_GUIDE = "apps/web/app/real-estate-agent-business-expenses-canada/page.tsx";
const T2125_GUIDE = "apps/web/app/t2125-guide-real-estate-agents-canada/page.tsx";
const T2125_TAB = "apps/web/app/(app)/reports/reports-t2125-tab.tsx";
const T2125_PDF = "apps/web/components/pdf/t2125-pdf.tsx";
const MILEAGE_TAB = "apps/web/app/(app)/expenses/expenses-mileage-tab.tsx";

describe("a T2125 line number in copy is a line of CRA's form", () => {
  it("scans the source it means to", () => {
    expect(FILES.length).toBeGreaterThan(300);
    for (const file of [EXPENSES_GUIDE, T2125_GUIDE, T2125_TAB, T2125_PDF, "apps/web/lib/troubleshooting-playbooks.ts", "apps/web/lib/knowledge-base.ts"]) {
      expect(FILES).toContain(file);
    }
  });

  it("the patterns read the numbers that were typed in error", () => {
    expect(lineNumbersIn('line: "Line 8940",')).toEqual(["8940"]);
    expect(lineNumbersIn("goes under expenses (Line&nbsp;8871).")).toEqual(["8871"]);
    expect(lineNumbersIn('label="Deductible Expenses (Lines 8521–9369)"')).toEqual(["8521", "9369"]);
    expect(lineNumbersIn('<LineRow lineNum="8200" label="Gross Commission Income" />')).toEqual(["8200"]);
    expect(lineNumbersIn('label="Net Business Income (Line 8270)"')).toEqual(["8270"]);
    // The return's five-digit lines and a GST34's three-digit lines are not T2125 lines.
    expect(lineNumbersIn("commission income on line 13900; GST34 line 105")).toEqual([]);
    expect(["8940", "8200", "8270", "8620", "8640"].filter(isT2125LineNumber)).toEqual([]);
  });

  it("no line number outside the form appears in web, mobile or core copy", () => {
    const problems: string[] = [];
    for (const file of FILES) {
      const isCode = /\.tsx?$/.test(file);
      read(file).split("\n").forEach((text, i) => {
        if (text.length > 4000 && !/troubleshooting-playbooks|knowledge-base/.test(file)) return; // minified or generated
        if (isCode && COMMENT.test(text)) return;
        for (const number of lineNumbersIn(text)) {
          if (!isT2125LineNumber(number)) problems.push(`${file}:${i + 1}: line ${number} is not on form T2125`);
        }
      });
    }
    expect(problems).toEqual([]);
  }, 30_000);
});

describe("the two guides take their line numbers from the engine and the form", () => {
  it.each([EXPENSES_GUIDE, T2125_GUIDE])("%s types no line number on a card", (file) => {
    const source = read(file);
    expect(source).toContain("@agent-runway/core/engines/t2125-lines");
    expect(source).toContain("t2125FormLineForExpenseItem");
    // `line: "Line 8940"` and `line: "8940"` were how every wrong number got in.
    expect(source).not.toMatch(/\bline:\s*["'`](?:Lines?\s)?\d{4}/);
  });

  it("the T2125 guide prints the form's own instruction for the return", () => {
    const source = read(T2125_GUIDE);
    expect(source).toContain('t2125ReturnLinesPhrase("net")');
    expect(source).toContain('t2125ReturnLinesPhrase("gross")');
    expect(source).not.toMatch(/Line(?:\s|&nbsp;)135\b/);
  });

  it("neither guide credits CRA with a line for the brokerage split", () => {
    for (const file of [EXPENSES_GUIDE, T2125_GUIDE]) {
      const source = read(file);
      expect(source).toContain("has no line named for");
      expect(source).not.toContain("Per CRA&apos;s expense classifications");
      expect(source).not.toContain("Per CRA's expense classifications");
    }
  });
});

describe("the Reports T2125 tab and its PDF", () => {
  it.each([T2125_TAB, T2125_PDF])("%s labels income, expenses and net income as the form does", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/\b(?:8200|8270|10400)\b/);
    expect(source).not.toContain("T1 General Line");
    expect(source).toContain("9946");
    expect(source).toContain("8299");
    expect(source).toContain('t2125ReturnLinesPhrase("net")');
    // A bare "(NNNN)" in the waterfall is a line number too.
    const bare = [...source.matchAll(/\(([89]\d{3})(?:[–-]([89]\d{3}))?\)/g)].flatMap((m) => [m[1], m[2]].filter(Boolean));
    expect(bare.filter((number) => !isT2125LineNumber(number))).toEqual([]);
    // The subtotal before CCA is not a line of the form and is not given a number.
    expect(source).not.toMatch(/lineNum="9369"|\(9369\)/);
  });

  it("the return lines are the form's", () => {
    expect(t2125ReturnLinesPhrase("net")).toContain("commission income on line 13900");
  });
});

describe("wording this change removed", () => {
  it("the expenses guide gives no $500 cut-off for office purchases", () => {
    const copy = copyOf(EXPENSES_GUIDE);
    expect(copy).not.toMatch(/(?:under|over|below|above)\s+(?:~|approximately\s+)?\$500/i);
    expect(copy).not.toMatch(/expense these immediately/i);
    expect(copy).not.toMatch(/up to \$500 per person/i);
    expect(copy).toContain("Class 12");
    expect(copy).toContain("tipSource: [9, 7]");
  });

  it("the T2125 guide gives no $500 limit on client gifts", () => {
    expect(copyOf(T2125_GUIDE)).not.toMatch(/\$500/);
  });

  it("the mileage tab does not judge the claimed business-use % against an assumed total", () => {
    const source = copyOf(MILEAGE_TAB);
    expect(source).not.toMatch(/20[_,]000/);
    expect(source).not.toMatch(/Keep logging|supports your claimed|doesn&apos;t yet support/);
    expect(source).toContain("does not store an odometer reading");
    expect(source).toContain("motor-vehicle-expenses.html");
  });

  it("Flight Crew's knowledge quotes the quick method rate by province", () => {
    const overhead = getPlaybook("overhead");
    expect(overhead).toContain(QUICK_METHOD_SERVICE_RATES_RULE);
    expect(overhead).toContain("8.8% is Ontario's rate only");
    expect(overhead).not.toMatch(/typically 8\.8%/);
  });

  it("Flight Crew's knowledge has the form's lines for income, total expenses and net income", () => {
    const expenses = getPlaybook("expenses");
    expect(expenses).toContain("| 8299 | Gross business or professional income |");
    expect(expenses).toContain("| 9368 | Total expenses |");
    expect(expenses).toContain("| 9946 | Your net income (loss) |");
    expect(expenses).not.toMatch(/\| (?:8200|8270) \|/);
  });

  it("Flight Crew's knowledge describes the mileage card as it now reads", () => {
    const mileage = getPlaybook("mileage");
    expect(mileage).toContain("Business-use % and your mileage log");
    expect(mileage).toContain("does not store an odometer reading");
  });
});
