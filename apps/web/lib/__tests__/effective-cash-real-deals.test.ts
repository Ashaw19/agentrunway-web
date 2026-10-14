/**
 * A REAL-plan agent's cash position is the dashboard's on every surface
 * (2026-10-14).
 *
 * Under `comp_plan = 'real'`, `computeEffectiveCashForSurvival` works the
 * year-to-date agent net out as the per-deal waterfall over the year's closed
 * deals when it is given them, and as the analytic simulation on YTD GCI when
 * it is not. The dashboard's cash position always runs the waterfall
 * (dashboard-content.tsx, `planDeals`). Forecast, Reports, Altimeter,
 * Expenses, the weekly digest and Flight Crew's diagnostics left the deals
 * out, so for a REAL agent their cash, cash runway and Runway Score could
 * differ from the dashboard's. `transactions` is now a required input.
 *
 * 1. The engine, given the year's deals, is the dashboard's cash position
 *    (restated below as dashboard-content.tsx writes it), on a fixture the
 *    simulation gets wrong: a deal before the anniversary and a cap straddle.
 * 2. Flight Crew's diagnostics, run over made-up rows, quote that cash.
 * 3. Every call in the apps passes deals built through `computeGCI` from the
 *    array its `ytdGCI` sums, so the next caller cannot pass a different set.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { buildDiagnostics } from "../chat-diagnostics";
import { fmtCurrency } from "../formatters";
import { fakeSupabase, type Row } from "../ai/__tests__/helpers/fake-supabase";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import { computeGCI, type Transaction, type UserSettings } from "@agent-runway/core/types/database";
import {
  projectedYearEndGCI,
  projectedYearEndTransactions,
  seasonalFractionElapsed,
} from "@agent-runway/core/engines/projection-engine";
import { computeEffectiveCashForSurvival } from "@agent-runway/core/engines/effective-cash";
import { computePlanGross } from "@agent-runway/core/engines/real-compensation-engine";
import { computeCashPosition } from "@agent-runway/core/engines/cash-position-engine";
import { calculate as calculateTax, gstHstRate } from "@agent-runway/core/engines/canadian-tax-engine";
import { computeHSTCollected } from "@agent-runway/core/engines/hst-engine";
import { localISODate } from "@agent-runway/core/lib/local-date";

// Mid-July, 11:00 Atlantic: July 15 in every zone the tests run in.
const NOW = new Date("2026-07-15T14:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(createClient).mockReset();
});

// ── The account ──────────────────────────────────────────────────────────────

const USER = "user-1";

/**
 * A solo REAL agent who joined on 2025-03-01, so the anniversary year turned
 * on 2026-03-01. The February deal closes in the first anniversary year (the
 * sign-up fee, its own BEOP share); the two after it start the second, and
 * the $60,000 + $70,000 cross the $15,000 cap ($100,000 of GCI) inside it.
 * The simulation sees one $160,000 year.
 */
function settings(over: Partial<UserSettings> = {}): UserSettings {
  return createTestSettings({
    user_id: USER,
    province: "newBrunswick",
    comp_plan: "real",
    real_join_date: "2025-03-01",
    goal_gci: 250_000,
    cash_reserve: 10_000,
    monthly_brokerage_fee: 0,
    use_national_seasonality: false,
    gst_hst_registered: true,
    brokerage_withholds_hst: false,
    is_incorporated: false,
    experience_years: 6,
    ...over,
  });
}

function closed(id: string, date: string, sale_price: number): Row {
  return { id, user_id: USER, date, sale_price, commission_pct: 0.025, team_split_pct: null, gci_override: null, status: "closed" };
}

const CLOSINGS: Row[] = [
  closed("t1", "2026-02-10", 1_200_000), // $30,000
  closed("t2", "2026-04-22", 2_400_000), // $60,000
  closed("t3", "2026-06-01", 2_800_000), // $70,000
];

// ── The dashboard's chain, restated from dashboard-content.tsx ──────────────
//
// "YTD calculations" → "Survival prep" → "Tax estimate" → "Cash Position".
// No pipeline, no listing appointments, no history, no expenses: the cash is
// the only thing these tests compare.

function dashboard(s: UserSettings, rows: Row[]) {
  const now = new Date();
  const transactions = rows as unknown as Transaction[];
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const planDeals = transactions.map((tx) => ({ id: tx.id, date: tx.date, gci: computeGCI(tx) }));
  const fraction = seasonalFractionElapsed([0.25, 0.25, 0.25, 0.25]);
  const projectedGCI = projectedYearEndGCI(ytdGCI, 0, fraction, s.goal_gci);
  const projectedDealCount = projectedYearEndTransactions(transactions.length, 0, fraction);

  const projectedNet =
    computePlanGross(s, projectedGCI, { dealCount: projectedDealCount, asOf: localISODate() }).grossAfterPlan -
    s.monthly_brokerage_fee * 12;
  const netForTax = Math.max(0, projectedNet - 0);
  const taxResult = calculateTax(netForTax, s.province, Math.max(projectedDealCount, 1));

  const ytdHstCollected = computeHSTCollected({
    ytdGCI,
    hstRate: gstHstRate(s.province),
    isRegistered: s.gst_hst_registered ?? false,
    brokerageWithholdsHst: s.brokerage_withholds_hst ?? false,
  });
  const { grossAfterPlan } = computePlanGross(s, ytdGCI, {
    deals: planDeals,
    windowStart: `${now.getFullYear()}-01-01`,
    windowEnd: `${now.getFullYear() + 1}-01-01`,
    asOf: localISODate(now),
  });
  const cashPosition = computeCashPosition({
    ytdGCI,
    ytdAgentNet: Math.max(0, grossAfterPlan - s.monthly_brokerage_fee * (now.getMonth() + 1)),
    ytdExpenses: 0,
    ytdTaxSetAside: taxResult.totalBurden * Math.min(fraction, 1),
    ytdHstCollected,
    ytdHstOnExpenses: 0,
    brokerageWithholdsHst: s.brokerage_withholds_hst ?? false,
    manualCashReserve: s.cash_reserve ?? 0,
    fractionElapsed: fraction,
  });
  return { ytdGCI, planDeals, fraction, projectedGCI, projectedDealCount, effectiveCash: cashPosition.effectiveCash };
}

/** The engine on the dashboard's inputs, with these deals for the waterfall. */
function engineCash(s: UserSettings, rows: Row[], deals: { id?: string; date: string; gci: number }[]) {
  const d = dashboard(s, rows);
  return computeEffectiveCashForSurvival({
    settings: s,
    ytdGCI: d.ytdGCI,
    transactions: deals,
    expensesYTD: 0,
    expensesRemaining: 0,
    projectedGCI: d.projectedGCI,
    projectedDealCount: d.projectedDealCount,
    fraction: d.fraction,
    now: new Date(),
  }).cashPosition.effectiveCash;
}

describe("a REAL agent with a deal before the anniversary and a cap straddle after it", () => {
  it("the fixture is one the simulation gets wrong (sanity)", () => {
    const d = dashboard(settings(), CLOSINGS);
    expect(d.ytdGCI).toBe(160_000);
    const simulated = engineCash(settings(), CLOSINGS, []);
    expect(Math.abs(simulated - d.effectiveCash)).toBeGreaterThan(500);
  });

  it("the engine, given the year's deals, is the dashboard's cash position", () => {
    const d = dashboard(settings(), CLOSINGS);
    expect(engineCash(settings(), CLOSINGS, d.planDeals)).toBeCloseTo(d.effectiveCash, 6);
  });

  it("on a simple split the deals change nothing", () => {
    const s = settings({ comp_plan: "simple_split", split_preset: "p80_20", tx_fee_rate_pct: 0.02, tx_fee_annual_cap: 3_000 });
    const d = dashboard(s, CLOSINGS);
    expect(engineCash(s, CLOSINGS, d.planDeals)).toBeCloseTo(d.effectiveCash, 6);
    expect(engineCash(s, CLOSINGS, [])).toBeCloseTo(d.effectiveCash, 6);
  });
});

// ── Flight Crew's diagnostics ───────────────────────────────────────────────

function tables(s: UserSettings, rows: Row[]): Record<string, Row[]> {
  return {
    user_settings: [s as unknown as Row],
    transactions: rows,
    pipeline_deals: [],
    listing_appointments: [],
    expense_categories: [],
    clients: [],
    history_items: [],
    receipt_expenses: [],
    referrals: [],
    recurring_expenses: [],
  };
}

/** One `Label: value` line of the [SURVIVAL DIAGNOSTIC] block. */
async function survivalLine(s: UserSettings, rows: Row[], label: string): Promise<string> {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables(s, rows)).client as never);
  const text = await buildDiagnostics(USER, ["survival"]);
  const found = text.split("\n").find((l) => l.replace(/^├─ /, "").startsWith(label));
  if (found === undefined) throw new Error(`no "${label}" line in:\n${text}`);
  return found.replace(/^├─ /, "");
}

describe("Flight Crew's survival diagnostic for a REAL agent", () => {
  it("quotes the dashboard's effective cash, not the simulation's", async () => {
    const d = dashboard(settings(), CLOSINGS);
    const quoted = await survivalLine(settings(), CLOSINGS, "Effective Cash");
    expect(quoted).toBe(`Effective Cash (implied position — what Survival actually uses): ${fmtCurrency(d.effectiveCash)}`);
    expect(quoted).not.toContain(fmtCurrency(engineCash(settings(), CLOSINGS, [])));
  });

  it("leaves last year's closings out of the year's deals, as the dashboard's query does", async () => {
    const withLastYear = [...CLOSINGS, closed("t0", "2025-11-20", 2_000_000)];
    const d = dashboard(settings(), CLOSINGS);
    expect(await survivalLine(settings(), withLastYear, "Effective Cash")).toBe(
      `Effective Cash (implied position — what Survival actually uses): ${fmtCurrency(d.effectiveCash)}`,
    );
  });
});

// ── Every call site ──────────────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../.."); // agentrunway-web/

const ROOTS = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "apps/web/supabase/functions",
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/stores",
  "apps/mobile/lib",
] as const;

/**
 * Every file that calls the engine. A new caller fails here until it is added,
 * after the scan below has checked it passes the dashboard's deals.
 */
const CALLERS = [
  "apps/web/app/(app)/altimeter/altimeter-content.tsx",
  "apps/web/app/(app)/expenses/expenses-content.tsx",
  "apps/web/app/(app)/forecast/forecast-content.tsx",
  "apps/web/app/(app)/reports/reports-content.tsx",
  "apps/web/app/api/cron/weekly-digest/route.ts",
  "apps/web/lib/chat-diagnostics.ts",
  "apps/web/lib/scenario-seed.ts",
];

const ENGINE_CALL = /\bcomputeEffectiveCashForSurvival\s*\(\s*\{/g;

/** `<rows>.map((tx) => ({ id: tx.id, date: tx.date, gci: computeGCI(tx…) }))` */
const DEALS_FROM_ROWS =
  /^(\w+)\.map\(\((\w+)\)\s*=>\s*\(\{\s*id:\s*\2\.id,\s*date:\s*\2\.date,\s*gci:\s*computeGCI\(\2\b[^)]*\)\s*\}\)\)$/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Source with comments blanked, so a call named in a comment is not a call. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The object literal whose `{` is at `open`, braces and brackets balanced. */
function objectAt(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error("unbalanced object literal");
}

/** The value of one top-level property of an object literal, or null. */
function property(obj: string, key: string): string | null {
  let depth = 0;
  let start = -1;
  for (let i = 1; i < obj.length - 1; i++) {
    const ch = obj[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    else if (depth === 0 && start < 0 && obj.startsWith(`${key}:`, i) && !/\w/.test(obj[i - 1])) {
      start = i + key.length + 1;
    } else if (depth === 0 && start >= 0 && ch === ",") {
      return obj.slice(start, i).trim();
    }
  }
  return start >= 0 ? obj.slice(start, obj.length - 1).trim() : null;
}

describe("every computeEffectiveCashForSurvival call passes the dashboard's deals", () => {
  const calls: { file: string; src: string; obj: string }[] = [];
  for (const root of ROOTS) {
    for (const full of sourceFiles(path.join(REPO_ROOT, root))) {
      const src = withoutComments(readFileSync(full, "utf8"));
      for (const m of src.matchAll(ENGINE_CALL)) {
        calls.push({ file: path.relative(REPO_ROOT, full), src, obj: objectAt(src, m.index + m[0].length - 1) });
      }
    }
  }

  it("finds every caller, and only the ones on the list", () => {
    expect([...new Set(calls.map((c) => c.file))].sort()).toEqual(CALLERS);
  });

  it.each(CALLERS)("%s: the deals are the rows its ytdGCI sums, through computeGCI", (file) => {
    const mine = calls.filter((c) => c.file === file);
    expect(mine.length).toBeGreaterThan(0);
    for (const c of mine) {
      // `ytdGCI` goes in as the variable of that name.
      expect(/(^|[{,\s])ytdGCI\s*[,}]/.test(c.obj) || property(c.obj, "ytdGCI") === "ytdGCI").toBe(true);
      const deals = property(c.obj, "transactions");
      expect(deals, `${file} passes no transactions`).not.toBeNull();
      const m = DEALS_FROM_ROWS.exec(deals!.replace(/\s+/g, " "));
      expect(m, `${file} builds its deals another way: ${deals}`).not.toBeNull();
      const rows = m![1];
      // …and ytdGCI is the sum of computeGCI over that same array.
      const sum = new RegExp(`const ytdGCI = ${rows}\\.reduce\\(\\s*\\(sum, (\\w+)\\) => sum \\+ computeGCI\\(\\1\\b`);
      expect(sum.test(c.src), `${file}: ytdGCI is not ${rows}.reduce(… computeGCI …)`).toBe(true);
    }
  });

  it("the property reader handles nesting and shorthand", () => {
    const obj = "{ settings, ytdGCI, transactions: rows.map((tx) => ({ id: tx.id, date: tx.date, gci: computeGCI(tx) })), now }";
    expect(property(obj, "transactions")).toBe("rows.map((tx) => ({ id: tx.id, date: tx.date, gci: computeGCI(tx) }))");
    expect(property(obj, "now")).toBeNull();
    expect(property("{ a: f(b, c), d: 1 }", "d")).toBe("1");
  });
});
