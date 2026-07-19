/**
 * Source-level regression guard for the pipeline COUNT axis.
 *
 * Context: #258 stopped terminal (closed/lost) deals from leaking into pipeline
 * MONEY totals, and routed ~12 surfaces through `activePipelineDeals()`. But it
 * only wrapped the weighted-GCI reduce. The sibling `pipelineDeals.length` two
 * lines below was left raw at 11 call sites.
 *
 *   projectedYearEndTransactions(closedCount, pipelineCount, fraction)
 *     => round(closedCount / fraction + pipelineCount * 0.3)
 *
 * so every dead deal adds +0.3 phantom deals — and a `closed` deal is ALREADY
 * in `closedCount` as a transaction. That is the same double-count #258 was
 * written to kill, just on the count axis. Because `pipeline_deals` rows are
 * retained forever, the error grows monotonically for the life of the account,
 * and the count flows into per-deal fee/cap math (REAL comp plan) → projected
 * net → effective cash → survival months.
 *
 * A value-level unit test cannot catch this: each surface gathers its own data,
 * and `cross-surface-parity.test.ts` feeds every surface from one shared input
 * (so it proves surfaces AGREE, never that they are CORRECT). The invariant is
 * structural, so this test is structural: no production call site may pass an
 * unfiltered array's `.length` as the pipeline count.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB_ROOT = join(__dirname, "..", "..");

/**
 * There are two legitimate ways to exclude terminal deals, and this guard has
 * to accept both or it produces false positives:
 *
 *   1. In JS  — `const live = activePipelineDeals(rows)` (most surfaces)
 *   2. In SQL — `.not("stage", "in", "(closed,lost)")` or
 *               `.in("stage", ACTIVE_PIPELINE_STAGES)` on the query itself
 *               (the MCP edge functions, which filter server-side)
 *
 * Resolving the actual assignment rather than pattern-matching the identifier
 * name avoids false positives on correctly-filtered arrays that simply aren't
 * named `live*` (weekly-digest's `pipeline`, analytics' `deals`) and false
 * negatives on raw arrays that happen to be named `activeDeals`.
 */
function appliesServerSideStageFilter(src: string): boolean {
  return (
    /\.not\(\s*["']stage["']\s*,\s*["']in["']/.test(src) ||
    /\.in\(\s*["']stage["']\s*,\s*ACTIVE_PIPELINE_STAGES/.test(src)
  );
}

function isFilteredIdentifier(src: string, name: string): boolean {
  const escaped = name.replace(/[$]/g, "\\$&");

  // (1) assigned from the canonical JS filter
  if (
    new RegExp(
      `\\b(?:const|let|var)\\s+${escaped}\\s*(?::[^=]+)?=\\s*activePipelineDeals\\s*\\(`,
    ).test(src)
  ) {
    return true;
  }

  // (2) assigned straight from a query result in a file that filters in SQL
  const assignedFromQueryResult = new RegExp(
    `\\b(?:const|let|var)\\s+${escaped}\\s*(?::[^=]+)?=\\s*\\(?[\\w.]*\\.data\\b`,
  ).test(src);

  return assignedFromQueryResult && appliesServerSideStageFilter(src);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

interface CallSite {
  file: string;
  line: number;
  countArg: string;
  src: string;
}

/** Covers `deals.length` and the optional-chained `pipeline?.length ?? 0`. */
const COUNT_EXPR = /^([A-Za-z_$][\w$]*)\??\.length(?:\s*\?\?\s*\d+)?$/;

/**
 * Classify the second argument to projectedYearEndTransactions.
 *
 * Follows ONE level of variable indirection, because the count is often hoisted
 * (`const pipelineCount = pipeline?.length ?? 0;` then passed by name). An
 * argument-only scan reports those as clean, which is precisely how the
 * half-refactor stayed invisible.
 */
function resolveCountArg(
  src: string,
  arg: string,
): "filtered" | "unfiltered" | "unresolved" {
  const direct = COUNT_EXPR.exec(arg);
  if (direct) {
    return isFilteredIdentifier(src, direct[1]) ? "filtered" : "unfiltered";
  }

  // Bare identifier — resolve its assignment once.
  if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
    const escaped = arg.replace(/[$]/g, "\\$&");
    const assign = new RegExp(
      `\\b(?:const|let|var)\\s+${escaped}\\s*(?::[^=]+)?=\\s*([^;\\n]+)`,
    ).exec(src);
    if (!assign) return "unresolved";

    const rhs = assign[1].trim();
    const inner = COUNT_EXPR.exec(rhs);
    if (!inner) return "unresolved";
    return isFilteredIdentifier(src, inner[1]) ? "filtered" : "unfiltered";
  }

  return "unresolved";
}

/** Find every projectedYearEndTransactions(...) call and extract arg 2. */
function findCallSites(): CallSite[] {
  const sites: CallSite[] = [];

  for (const file of walk(WEB_ROOT)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("projectedYearEndTransactions(")) continue;

    let idx = src.indexOf("projectedYearEndTransactions(");
    while (idx !== -1) {
      // Skip the import/export/definition lines, not call sites.
      const lineStart = src.lastIndexOf("\n", idx) + 1;
      const lineText = src.slice(lineStart, src.indexOf("\n", idx));
      if (/\b(import|export|function)\b/.test(lineText)) {
        idx = src.indexOf("projectedYearEndTransactions(", idx + 1);
        continue;
      }

      // Walk the argument list with balanced-paren tracking.
      const open = src.indexOf("(", idx);
      let depth = 0;
      let end = open;
      for (let i = open; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }

      // Split top-level commas only.
      const inner = src.slice(open + 1, end);
      const args: string[] = [];
      let d = 0;
      let cur = "";
      for (const ch of inner) {
        if (ch === "(" || ch === "[" || ch === "{") d++;
        if (ch === ")" || ch === "]" || ch === "}") d--;
        if (ch === "," && d === 0) {
          args.push(cur);
          cur = "";
        } else cur += ch;
      }
      args.push(cur);

      if (args.length >= 2) {
        sites.push({
          file: relative(WEB_ROOT, file),
          line: src.slice(0, idx).split("\n").length,
          countArg: args[1].replace(/\/\/.*$/gm, "").trim(),
          src,
        });
      }

      idx = src.indexOf("projectedYearEndTransactions(", end);
    }
  }

  return sites;
}

describe("pipeline count axis — projectedYearEndTransactions", () => {
  const sites = findCallSites();

  it("finds the production call sites (guards against the scanner silently breaking)", () => {
    // If this drops to 0 the scanner is broken and the assertions below are
    // vacuously true — which is how a guard like this rots into uselessness.
    expect(sites.length).toBeGreaterThanOrEqual(8);
  });

  it("never passes an unfiltered pipeline array's .length as the deal count", () => {
    const violations = sites.filter((s) => resolveCountArg(s.src, s.countArg) === "unfiltered");

    expect(
      violations.map((v) => `${v.file}:${v.line} → ${v.countArg}`),
    ).toEqual([]);
  });

  it("resolves counts hoisted into a local variable, not just inline .length", () => {
    // api/chat assigns `const pipelineCount = ...` and passes the variable, so
    // an argument-only scan would miss it — which is exactly how the original
    // half-refactor survived review. Prove the indirection is followed.
    const hoisted = sites.filter((s) => /^[A-Za-z_$][\w$]*$/.test(s.countArg));
    expect(hoisted.length).toBeGreaterThan(0);
    for (const site of hoisted) {
      expect(resolveCountArg(site.src, site.countArg)).not.toBe("unresolved");
    }
  });
});
