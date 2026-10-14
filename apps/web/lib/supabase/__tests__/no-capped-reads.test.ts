import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guard (2026-10-14): one request returns at most 1,000 rows
 * (supabase/config.toml max_rows), so `.limit(10000)` on a list that can grow
 * past 1,000 quietly drops rows. The CRM showed only the first 1,000 clients,
 * and deleting a history year could delete clients whose remaining deal sat
 * past row 1,000. Lists of these tables are read with fetchAllRows /
 * fetchAllIn (lib/supabase/fetch-all.ts). A count uses { head: true }.
 */

const ROOT = join(__dirname, "..", "..", "..");
const DIRS = ["app", "lib", "components"];
const TABLES = ["clients", "client_records", "contact_activities", "contact_tasks"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) return [];
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) && !name.includes(".test.") ? [p] : [];
  });
}

/** The query chain starting at `.from("table")`: the call and the `.method(...)` lines after it. */
function chainAt(lines: string[], i: number, col: number): string {
  const parts = [lines[i].slice(col)];
  for (let j = i + 1; j < lines.length && /^\s*\./.test(lines[j]); j++) parts.push(lines[j]);
  // A one-line chain ends at the first `),` / `);` that closes the statement.
  return parts.join("\n").split(/(?<=\))\s*[,;]\s*(?:\/\/.*)?$/m)[0];
}

describe("no capped list reads", () => {
  it("never reads clients, deal records, activities or checklist items with a 1,000-row cap", () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of files(join(ROOT, dir))) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          for (const m of line.matchAll(/\.from\("([a-z_]+)"\)/g)) {
            if (!TABLES.includes(m[1])) continue;
            const chain = chainAt(lines, i, m.index ?? 0);
            if (/head:\s*true/.test(chain)) continue;
            const limit = chain.match(/\.limit\((\d+)\)/);
            if (limit && Number(limit[1]) >= 1000) offenders.push(`${relative(ROOT, file)}:${i + 1} ${m[1]} .limit(${limit[1]})`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
