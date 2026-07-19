/**
 * Regression tests for the morning-briefing metric gatherer.
 *
 * Context: on 2026-07-19 a QA audit found that `GET /api/briefing`'s
 * on-demand path had drifted from the nightly cron and queried FIVE columns
 * that do not exist:
 *
 *   user_settings.gci_goal          → real column is `goal_gci`
 *   pipeline_deals.projected_gci    → does not exist (GCI is derived)
 *   pipeline_deals.status           → real column is `stage`
 *   transactions.gci                → does not exist (GCI is derived)
 *   pipeline_deals.projected_close_date → real column is `expected_close_date`
 *
 * Every one of those queries returned PostgREST 42703. supabase-js RESOLVES
 * `{data: null, error}` rather than rejecting, the route never read `error`,
 * and `?? []` coerced it all to empty — so `generateMorningBriefing` was
 * handed `goalGci: 0, ytdGci: 0, pipelineValue: 0` and confidently told the
 * agent they had $0.
 *
 * These tests pin two things:
 *   1. Every column queried actually exists in the schema (schema conformance).
 *   2. A failed query THROWS instead of silently degrading to zeros.
 */

import { describe, expect, it } from "vitest";
import {
  BRIEFING_USER_COLUMNS,
  briefingDateRanges,
  gatherBriefingMetrics,
  type AnySupabaseClient,
  type BriefingUser,
} from "../briefing-metrics";

// ── Schema ground truth ──────────────────────────────────────────────────────
// Mirrors packages/core/types/database.ts. If a column is added/renamed there,
// add it here — that is the point: this list is the contract.
const SCHEMA: Record<string, readonly string[]> = {
  user_settings: [
    "user_id",
    "display_name",
    "goal_gci",
    "subscription_tier",
    "use_national_seasonality",
    "national_quarter_pcts",
  ],
  clients: [
    "id",
    "name",
    "status",
    "archived_at",
    "last_contact_at",
    "engagement_score",
    "user_id",
  ],
  pipeline_deals: [
    "address",
    "estimated_price",
    "estimated_commission_pct",
    "probability_override",
    "stage",
    "expected_close_date",
    "user_id",
  ],
  transactions: [
    "sale_price",
    "commission_pct",
    "team_split_pct",
    "gci_override",
    "status",
    "date",
    "user_id",
  ],
  history_items: ["year", "quarter_gci", "user_id"],
};

/** Columns that were queried but do not exist — the exact 2026-07-19 bug. */
const PHANTOM_COLUMNS = [
  "gci_goal",
  "projected_gci",
  "projected_close_date",
  "gci",
];

interface RecordedQuery {
  table: string;
  columns: string[];
}

/**
 * Minimal PostgREST-shaped recorder. Chainable like supabase-js, records the
 * table and every column name touched by select/eq/in/gte/lte/lt/gt/order/is.
 */
function makeRecordingClient(opts: {
  queries: RecordedQuery[];
  /** Table whose query should resolve with an error, to test failure handling. */
  failTable?: string;
  rows?: Record<string, unknown[]>;
}) {
  const { queries, failTable, rows = {} } = opts;

  function builder(table: string) {
    const record: RecordedQuery = { table, columns: [] };
    queries.push(record);

    const note = (cols: string) => {
      for (const raw of cols.split(",")) {
        const col = raw.trim();
        // `select("id", { count: "exact", head: true })` and plain columns only
        // — this module intentionally uses no embedded-resource joins.
        if (col) record.columns.push(col);
      }
    };

    const result = {
      data: failTable === table ? null : (rows[table] ?? []),
      error:
        failTable === table
          ? { code: "42703", message: `column does not exist`, details: "", hint: "" }
          : null,
      count: failTable === table ? null : (rows[table] ?? []).length,
    };

    const chain: Record<string, unknown> = {
      select: (cols: string) => (note(cols), chain),
      eq: (c: string) => (note(c), chain),
      in: (c: string) => (note(c), chain),
      gt: (c: string) => (note(c), chain),
      gte: (c: string) => (note(c), chain),
      lt: (c: string) => (note(c), chain),
      lte: (c: string) => (note(c), chain),
      is: (c: string) => (note(c), chain),
      order: (c: string) => (note(c), chain),
      limit: () => chain,
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
      then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  }

  return { from: (table: string) => builder(table) } as unknown as AnySupabaseClient;
}

const USER: BriefingUser = {
  user_id: "00000000-0000-0000-0000-000000000000",
  display_name: "Test Agent",
  goal_gci: 120_000,
  subscription_tier: "professional",
  use_national_seasonality: false,
  national_quarter_pcts: null,
};

describe("gatherBriefingMetrics — schema conformance", () => {
  it("queries only columns that exist in the schema", async () => {
    const queries: RecordedQuery[] = [];
    await gatherBriefingMetrics(
      makeRecordingClient({ queries }),
      USER,
      briefingDateRanges(new Date("2026-07-19T12:00:00Z")),
    );

    expect(queries.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const q of queries) {
      const known = SCHEMA[q.table];
      if (!known) {
        violations.push(`unknown table: ${q.table}`);
        continue;
      }
      for (const col of q.columns) {
        if (!known.includes(col)) violations.push(`${q.table}.${col}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not reference any of the five phantom columns from the 07-19 bug", async () => {
    const queries: RecordedQuery[] = [];
    await gatherBriefingMetrics(
      makeRecordingClient({ queries }),
      USER,
      briefingDateRanges(new Date("2026-07-19T12:00:00Z")),
    );

    const allColumns = queries.flatMap((q) => q.columns);
    for (const phantom of PHANTOM_COLUMNS) {
      expect(allColumns).not.toContain(phantom);
    }
  });

  it("selects pipeline by `stage`, never by `status`", async () => {
    const queries: RecordedQuery[] = [];
    await gatherBriefingMetrics(
      makeRecordingClient({ queries }),
      USER,
      briefingDateRanges(new Date("2026-07-19T12:00:00Z")),
    );

    const pipelineCols = queries
      .filter((q) => q.table === "pipeline_deals")
      .flatMap((q) => q.columns);

    expect(pipelineCols).toContain("stage");
    expect(pipelineCols).not.toContain("status");
  });

  it("BRIEFING_USER_COLUMNS only names real user_settings columns", () => {
    for (const col of BRIEFING_USER_COLUMNS.split(",").map((c) => c.trim())) {
      expect(SCHEMA.user_settings).toContain(col);
    }
  });
});

describe("gatherBriefingMetrics — fails loudly, never silently zero", () => {
  // supabase-js RESOLVES {data:null,error} rather than rejecting. Without an
  // explicit error check, a real failure is indistinguishable from "no data"
  // and the AI writes a confident briefing off zeros. Each table gets its own
  // case because the original bug was five separate silent failures.
  for (const table of [
    "user_settings",
    "clients",
    "pipeline_deals",
    "transactions",
    "history_items",
  ]) {
    it(`throws when the ${table} query returns an error`, async () => {
      const queries: RecordedQuery[] = [];
      const client = makeRecordingClient({ queries, failTable: table });

      // user_settings is fetched by fetchBriefingUser, not this function, so
      // for that case assert the metric gatherer still surfaces its own tables.
      if (table === "user_settings") {
        await expect(
          gatherBriefingMetrics(client, USER, briefingDateRanges()),
        ).resolves.toBeDefined();
        return;
      }

      await expect(
        gatherBriefingMetrics(client, USER, briefingDateRanges()),
      ).rejects.toMatchObject({ code: "42703" });
    });
  }

  it("returns real zeros only when the queries genuinely succeed with no rows", async () => {
    const queries: RecordedQuery[] = [];
    const data = await gatherBriefingMetrics(
      makeRecordingClient({ queries }),
      USER,
      briefingDateRanges(new Date("2026-07-19T12:00:00Z")),
    );

    expect(data.ytdGci).toBe(0);
    expect(data.pipelineValue).toBe(0);
    // Goal comes from the settings row, not a query — it must survive.
    expect(data.goalGci).toBe(120_000);
    expect(data.userName).toBe("Test Agent");
  });
});
