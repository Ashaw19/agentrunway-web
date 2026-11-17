/**
 * Guard: the briefing's ✕ is saved, and every screen that shows the briefing
 * leaves saved dismissals out (briefing_dismissals, 00192).
 *
 * Andrew (2026-11-17): he dismissed every item in the CRM tab's "Today's
 * briefing", refreshed, and they all came back. The ✕ only changed page state.
 * Flight Control had the same bug before 00168.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/** The text of a call's arguments: `rest` starts just after its "(". */
function argumentsOf(rest: string): string {
  let depth = 1;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "(") depth++;
    else if (rest[i] === ")" && --depth === 0) return rest.slice(0, i);
  }
  return rest;
}

/** Every screen or route that builds the briefing. */
const CALLERS = [
  "app/(app)/crm/tabs/crm-dashboard-tab.tsx",
  "app/(app)/dashboard/page.tsx",
  "app/api/mobile/briefing/route.ts",
];

describe("briefing dismissals", () => {
  it.each(CALLERS)("%s passes the saved dismissals to the engine", (rel) => {
    const src = read(rel);
    const calls = src.split("computeIntelligenceBriefing(").slice(1);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(argumentsOf(call)).toMatch(/dismissedKeys/);
  });

  it("the CRM tab saves a dismissal instead of keeping it in page state", () => {
    const src = read("app/(app)/crm/tabs/crm-dashboard-tab.tsx");
    expect(src).toMatch(/writeBriefingDismissal\(/);
    expect(src).toMatch(/loadBriefingDismissKeys\(/);
    expect(src).not.toMatch(/dismissedIds/);
  });

  it("no other file builds the briefing without going through this list", () => {
    // A new caller has to be added to CALLERS (and pass dismissedKeys).
    const out = execSync(
      `git grep -l "computeIntelligenceBriefing(" -- 'app' 'lib' ':!**/__tests__/**'`,
      { cwd: WEB, encoding: "utf8" },
    ).trim().split("\n").filter(Boolean).filter((f) => !f.startsWith("app/demo/"));
    expect(out.sort()).toEqual([...CALLERS].sort());
  });
});
