/**
 * Guards for the AI run ledger (migration 00182).
 *
 *   - Undo never writes a column Postgres computes: every GENERATED ALWAYS
 *     column in the migrations is listed in core GENERATED_COLUMNS.
 *   - No model call goes through the Helicone proxy any more, anywhere.
 *   - The chat diagnostics line for failed AI calls and writes.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERATED_COLUMNS,
  TRIGGER_SIDE_EFFECTS,
  TRIGGER_SIDE_EFFECTS_REVIEWED,
  UNDO_TABLES,
} from "@agent-runway/core/lib/ai-activity";
import { diagAIFailures } from "../chat-diagnostics";

const WEB = path.resolve(__dirname, "..", "..");
const MIGRATIONS = path.join(WEB, "supabase", "migrations");

describe("generated columns", () => {
  it("every GENERATED ALWAYS column is in GENERATED_COLUMNS", () => {
    const found: Array<[string, string]> = [];
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(path.join(MIGRATIONS, f), "utf8").replace(/--.*$/gm, "");
      // CREATE TABLE <t> ( ... <col> <type> GENERATED ALWAYS AS ...
      for (const t of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi)) {
        for (const c of t[2].matchAll(/(?:^|,)\s*"?(\w+)"?\s+[\w(), ]+?\s+generated\s+always\s+as/gim)) found.push([t[1], c[1]]);
      }
      // ALTER TABLE <t> ADD COLUMN <col> <type> GENERATED ALWAYS AS ...
      for (const a of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?[^;]*?generated\s+always\s+as/gi)) {
        found.push([a[1], a[2]]);
      }
    }
    expect(found.length).toBeGreaterThan(0); // the parser still finds mileage_logs.deduction
    for (const [table, col] of found) {
      expect(GENERATED_COLUMNS[table] ?? [], `${table}.${col}`).toContain(col);
    }
  });
});

describe("triggers that change other rows", () => {
  /**
   * Every trigger on a table undo can restore, whose function (its latest
   * definition) writes ANOTHER table, must be recorded by the write ledger
   * (TRIGGER_SIDE_EFFECTS) or reviewed (TRIGGER_SIDE_EFFECTS_REVIEWED).
   * Otherwise undoing a row would leave what its trigger did elsewhere, as
   * a logged call's client dates and status were before 2026-10-19.
   */
  it("every cross-table trigger on an undoable table is handled", () => {
    const files = readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort();
    const fnBodies = new Map<string, string>();
    const triggers: Array<{ table: string; fn: string; file: string }> = [];
    for (const f of files) {
      const sql = readFileSync(path.join(MIGRATIONS, f), "utf8").replace(/--.*$/gm, "");
      for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\([^)]*\)[\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi)) {
        fnBodies.set(m[1].toLowerCase(), m[3]);
      }
      for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?trigger\s+\w+[\s\S]*?\bon\s+(?:public\.)?(\w+)[\s\S]*?execute\s+(?:function|procedure)\s+(?:public\.)?(\w+)/gi)) {
        triggers.push({ table: m[1].toLowerCase(), fn: m[2].toLowerCase(), file: f });
      }
    }
    expect(triggers.some((t) => t.table === "contact_activities")).toBe(true); // the parser still sees them

    const unhandled: string[] = [];
    for (const t of triggers) {
      if (!UNDO_TABLES.has(t.table) && !TRIGGER_SIDE_EFFECTS_REVIEWED.has(t.table)) continue;
      const body = fnBodies.get(t.fn) ?? "";
      const targets = new Set(
        [...body.matchAll(/\b(?:update|insert\s+into|delete\s+from)\s+(?:public\.)?(\w+)/gi)]
          .map((m) => m[1].toLowerCase())
          .filter((x) => x !== t.table),
      );
      if (targets.size === 0) continue;
      const recorded = new Set((TRIGGER_SIDE_EFFECTS[t.table] ?? []).map((e) => e.parentTable));
      for (const target of targets) {
        if (!recorded.has(target) && !TRIGGER_SIDE_EFFECTS_REVIEWED.has(t.table)) unhandled.push(`${t.table} → ${target} (${t.fn}, ${t.file})`);
      }
    }
    expect(unhandled).toEqual([]);
  });
});

describe("Helicone proxy removed", () => {
  it("no source file routes a model call through anthropic.helicone.ai", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", ".next", "__tests__"].includes(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && /helicone\.ai|Helicone-Auth/.test(readFileSync(p, "utf8"))) hits.push(path.relative(WEB, p));
      }
    };
    for (const d of ["app", "lib", "components"]) walk(path.join(WEB, d));
    expect(hits.filter((h) => h !== "lib/ai/provider.ts")).toEqual([]);
    // provider.ts may mention the history in a comment, never as a URL in code.
    const provider = readFileSync(path.join(WEB, "lib/ai/provider.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(provider).not.toMatch(/helicone\.ai|Helicone-Auth/);
  });
});

describe("chat diagnostics: failed AI calls and writes", () => {
  it("says nothing when nothing failed, and names both counts when something did", () => {
    expect(diagAIFailures(null)).toBeNull();
    expect(diagAIFailures({ failedRuns: 0, failedWrites: 0, unknown: false })).toBeNull();
    const line = diagAIFailures({ failedRuns: 2, failedWrites: 1, unknown: false });
    expect(line).toContain("2 AI calls failed and 1 Flight Crew change didn't save");
    expect(line).toContain("/ai-activity");
  });
});
