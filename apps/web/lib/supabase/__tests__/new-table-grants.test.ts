import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard (2026-10-18): from 2026-10-30 Supabase stops exposing NEW tables in
 * `public` to the Data API (what supabase-js, so both apps, use) unless the
 * migration grants access explicitly. Existing tables keep their grants.
 * Source: supabase.com/changelog/45329. A table created without grants would
 * be silently unreadable from the web app and the phone.
 *
 * Every migration after 00181 that creates a table must, in the same file:
 *   - enable row level security on it (CLAUDE.md), and
 *   - GRANT ... ON public.<table> TO authenticated, and TO service_role,
 *     or say `-- data-api: not exposed: <table>` when nothing reads it
 *     through supabase-js.
 * A new function callable over RPC needs GRANT EXECUTE (trigger functions
 * don't). A serial column's sequence needs GRANT USAGE.
 */

const MIGRATIONS = join(__dirname, "..", "..", "..", "supabase", "migrations");
/** Migrations up to here were written before the rule and keep their default grants. */
const LAST_BEFORE_RULE = 181;

function strip(sql: string): string {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const ident = String.raw`(?:public\.)?"?([a-z_][a-z0-9_]*)"?`;

/** Tables created in this SQL (not temporary ones). */
export function createdTables(sql: string): string[] {
  const re = new RegExp(String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${ident}`, "gi");
  return [...strip(sql).matchAll(re)].map((m) => m[1].toLowerCase());
}

/** Functions created in this SQL that aren't trigger functions. */
export function createdRpcFunctions(sql: string): string[] {
  const re = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+${ident}\s*\(([\s\S]*?)\)\s*returns\s+(\w+)`, "gi");
  return [...strip(sql).matchAll(re)]
    .filter((m) => m[3].toLowerCase() !== "trigger")
    .map((m) => m[1].toLowerCase());
}

function grantsTo(sql: string, object: string, role: string, kind = "(?:table\\s+)?"): boolean {
  const re = new RegExp(
    String.raw`grant\s+[\w\s,]+\s+on\s+${kind}(?:public\.)?"?${object}"?(?:\s*\([^)]*\))?\s+to\s+[\w\s,]*\b${role}\b`,
    "i",
  );
  return re.test(strip(sql));
}

/** What a migration is missing, as readable lines. Empty when it is fine. */
export function missingGrants(sql: string, functionsBefore: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const clean = strip(sql);
  for (const table of createdTables(sql)) {
    if (!new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?${table}"?\s+enable\s+row\s+level\s+security`, "i").test(clean)) {
      problems.push(`table ${table}: no ENABLE ROW LEVEL SECURITY`);
    }
    if (new RegExp(String.raw`--\s*data-api:\s*not exposed:\s*${table}\b`, "i").test(sql)) continue;
    for (const role of ["authenticated", "service_role"]) {
      if (!grantsTo(sql, table, role)) problems.push(`table ${table}: no GRANT ... TO ${role}`);
    }
    const tableBody = new RegExp(String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?${table}"?\s*\(([\s\S]*?)\);`, "i").exec(clean)?.[1] ?? "";
    for (const m of tableBody.matchAll(/(?:^|,)\s*"?([a-z_][a-z0-9_]*)"?\s+(?:big|small)?serial\b/gi)) {
      const sequence = `${table}_${m[1].toLowerCase()}_seq`;
      if (!grantsTo(sql, sequence, "authenticated", "sequence\\s+")) {
        problems.push(`sequence ${sequence}: no GRANT USAGE ... TO authenticated`);
      }
    }
  }
  for (const fn of createdRpcFunctions(sql)) {
    if (functionsBefore.has(fn)) continue; // CREATE OR REPLACE keeps the grants it had
    const granted = new RegExp(String.raw`grant\s+execute\s+on\s+function\s+(?:public\.)?"?${fn}"?\s*(?:\([^)]*\))?\s+to\s+[\w\s,]*\b(?:authenticated|service_role)\b`, "i").test(clean);
    if (!granted) problems.push(`function ${fn}: no GRANT EXECUTE ... TO authenticated or service_role`);
  }
  return problems;
}

describe("missingGrants", () => {
  const ok = `
    CREATE TABLE public.vehicles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);
    ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "own" ON public.vehicles FOR ALL USING (auth.uid() = user_id);
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated, service_role;
  `;

  it("passes a table with RLS and grants to both roles", () => {
    expect(missingGrants(ok, new Set())).toEqual([]);
  });

  it("flags a table with no grants (the pre-10-30 habit)", () => {
    const sql = ok.replace(/GRANT[^;]*;/, "");
    expect(missingGrants(sql, new Set())).toEqual([
      "table vehicles: no GRANT ... TO authenticated",
      "table vehicles: no GRANT ... TO service_role",
    ]);
  });

  it("flags a table with no RLS", () => {
    expect(missingGrants(ok.replace(/ALTER TABLE[^;]*;/, ""), new Set())).toEqual(["table vehicles: no ENABLE ROW LEVEL SECURITY"]);
  });

  it("accepts the not-exposed marker for an internal table", () => {
    const sql = `-- data-api: not exposed: audit_scratch\nCREATE TABLE audit_scratch (id int);\nALTER TABLE audit_scratch ENABLE ROW LEVEL SECURITY;`;
    expect(missingGrants(sql, new Set())).toEqual([]);
  });

  it("ignores grants that sit in a comment", () => {
    const sql = ok.replace("GRANT SELECT", "-- GRANT SELECT");
    expect(missingGrants(sql, new Set())).toHaveLength(2);
  });

  it("needs EXECUTE on a new RPC function, not on a replaced one or a trigger", () => {
    const fn = `CREATE OR REPLACE FUNCTION public.fn_x(p uuid) RETURNS jsonb LANGUAGE sql AS $$ select '{}'::jsonb $$;`;
    expect(missingGrants(fn, new Set())).toEqual(["function fn_x: no GRANT EXECUTE ... TO authenticated or service_role"]);
    expect(missingGrants(fn, new Set(["fn_x"]))).toEqual([]);
    expect(missingGrants(`${fn}\nGRANT EXECUTE ON FUNCTION public.fn_x(uuid) TO authenticated;`, new Set())).toEqual([]);
    const trg = `CREATE FUNCTION set_updated() RETURNS trigger LANGUAGE plpgsql AS $$ begin return new; end $$;`;
    expect(missingGrants(trg, new Set())).toEqual([]);
  });

  it("needs USAGE on a serial column's sequence", () => {
    const sql = `CREATE TABLE public.counters (id bigserial PRIMARY KEY, n int);
      ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT ON public.counters TO authenticated, service_role;`;
    expect(missingGrants(sql, new Set())).toEqual(["sequence counters_id_seq: no GRANT USAGE ... TO authenticated"]);
    expect(missingGrants(`${sql}\nGRANT USAGE, SELECT ON SEQUENCE public.counters_id_seq TO authenticated, service_role;`, new Set())).toEqual([]);
  });
});

describe("migrations after 00181 grant Data API access to what they create", () => {
  it("every new table, RPC function and sequence is granted", () => {
    const files = readdirSync(MIGRATIONS).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    const functionsBefore = new Set<string>();
    const offenders: string[] = [];
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), "utf8");
      if (Number(f.slice(0, 5)) > LAST_BEFORE_RULE) {
        for (const p of missingGrants(sql, functionsBefore)) offenders.push(`${f}: ${p}`);
      }
      for (const fn of createdRpcFunctions(sql)) functionsBefore.add(fn);
    }
    expect(offenders).toEqual([]);
  });
});
