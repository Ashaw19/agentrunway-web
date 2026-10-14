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
 * The same day: REAL's cap resets on the anniversary of `real_join_date`, not
 * on January 1, and every surface (the dashboard too) handed the waterfall
 * this calendar year's deals only. From January 1 a REAL agent whose
 * anniversary is not January 1 had their YTD take-home, cash position, cash
 * runway and Runway Score priced as if the cap had restarted. Every surface
 * now hands it `toPlanDeals(carryOverTx, ytdTx)`: the closed deals from the
 * start of the anniversary year that contains January 1, then the year's own.
 * ytdGCI and every "year to date" figure stay the calendar year's.
 *
 * 1. The engine, given the dashboard's deals, is the dashboard's cash
 *    position (restated below as dashboard-content.tsx writes it), on a
 *    fixture the simulation gets wrong: a deal before the anniversary and a
 *    cap straddle.
 * 2. A cap year that spans January 1: the dashboard restated with its
 *    carry-over, and the engine (Forecast, Reports, Altimeter, Expenses, the
 *    weekly digest), Flight Crew's diagnostics and the Scenario Engine's seed
 *    held to it; the page loader fetches exactly the carry-over.
 * 3. Every call in the apps builds its deals with `toPlanDeals(carryOverTx,
 *    <rows>)`, `<rows>` the array its `ytdGCI` sums, sums over the calendar
 *    year, and gets `carryOverTx` from the one helper.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { buildDiagnostics } from "../chat-diagnostics";
import { loadCapYearCarryOver } from "../cap-year-carry-over";
import { buildScenarioSeed } from "../scenario-seed";
import { fmtCurrency } from "../formatters";
import { KNOWLEDGE_BASE } from "../knowledge-base";
import { getPlaybook } from "../troubleshooting-playbooks";
import { classifyTopicMulti } from "../troubleshooting-classifier";
import { fakeSupabase, type Row } from "../ai/__tests__/helpers/fake-supabase";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import { computeGCI, type Transaction, type UserSettings } from "@agent-runway/core/types/database";
import {
  projectedYearEndGCI,
  projectedYearEndTransactions,
  seasonalFractionElapsed,
} from "@agent-runway/core/engines/projection-engine";
import { computeEffectiveCashForSurvival } from "@agent-runway/core/engines/effective-cash";
import {
  capYearCarryOver,
  computePlanGross,
  toPlanDeals,
} from "@agent-runway/core/engines/real-compensation-engine";
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

const asTx = (rows: Row[]) => rows as unknown as Transaction[];

// ── The dashboard's chain, restated from dashboard-content.tsx ──────────────
//
// "YTD calculations" → "Survival prep" → "Tax estimate" → "Cash Position".
// `rows` is the page's `transactions` (this year's closed rows), `carryOver`
// its `carryOverTx`. No pipeline, no listing appointments, no history, no
// expenses: the cash is the only thing these tests compare.

function dashboard(s: UserSettings, rows: Row[], carryOver: Row[] = []) {
  const now = new Date();
  const transactions = asTx(rows);
  const carryOverTx = asTx(carryOver);
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const planDeals = toPlanDeals(carryOverTx, transactions);
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
  const ytdPlanGross = computePlanGross(s, ytdGCI, {
    deals: planDeals,
    windowStart: `${now.getFullYear()}-01-01`,
    windowEnd: `${now.getFullYear() + 1}-01-01`,
    asOf: localISODate(now),
  });
  const cashPosition = computeCashPosition({
    ytdGCI,
    ytdAgentNet: Math.max(0, ytdPlanGross.grossAfterPlan - s.monthly_brokerage_fee * (now.getMonth() + 1)),
    ytdExpenses: 0,
    ytdTaxSetAside: taxResult.totalBurden * Math.min(fraction, 1),
    ytdHstCollected,
    ytdHstOnExpenses: 0,
    brokerageWithholdsHst: s.brokerage_withholds_hst ?? false,
    manualCashReserve: s.cash_reserve ?? 0,
    fractionElapsed: fraction,
  });
  return {
    ytdGCI,
    planDeals,
    fraction,
    projectedGCI,
    projectedDealCount,
    ytdPlanGross,
    effectiveCash: cashPosition.effectiveCash,
  };
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

  it("the engine, given the dashboard's deals, is the dashboard's cash position", () => {
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

/** One `Label: value` line of the diagnostics for `topic`. */
async function diagLine(s: UserSettings, rows: Row[], label: string, topic: "survival" | "forecast" = "survival"): Promise<string> {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables(s, rows)).client as never);
  const text = await buildDiagnostics(USER, [topic]);
  const found = text.split("\n").find((l) => l.replace(/^├─ /, "").startsWith(label));
  if (found === undefined) throw new Error(`no "${label}" line in:\n${text}`);
  return found.replace(/^├─ /, "");
}

const cashLine = (cash: number) => `Effective Cash (implied position — what Survival actually uses): ${fmtCurrency(cash)}`;

describe("Flight Crew's survival diagnostic for a REAL agent", () => {
  it("quotes the dashboard's effective cash, not the simulation's", async () => {
    const d = dashboard(settings(), CLOSINGS);
    const quoted = await diagLine(settings(), CLOSINGS, "Effective Cash");
    expect(quoted).toBe(cashLine(d.effectiveCash));
    expect(quoted).not.toContain(fmtCurrency(engineCash(settings(), CLOSINGS, [])));
  });

  it("carries last year's closings in the anniversary year that contains January 1, and no earlier ones", async () => {
    // 2025-11-20 is in the cap year 2025-03-01 → 2026-03-01 (it pays the
    // sign-up fee the February deal paid without it); 2025-02-15 closed
    // before the agent joined REAL and moves nothing.
    const november = closed("t0", "2025-11-20", 2_000_000);
    const withLastYear = [...CLOSINGS, november, closed("tp", "2025-02-15", 2_000_000)];
    const d = dashboard(settings(), CLOSINGS, [november]);
    expect(d.effectiveCash).not.toBeCloseTo(dashboard(settings(), CLOSINGS).effectiveCash, 0);
    expect(await diagLine(settings(), withLastYear, "Effective Cash")).toBe(cashLine(d.effectiveCash));
  });
});

// ── A cap year that spans January 1 ─────────────────────────────────────────
//
// Joined 2026-07-01, so the anniversary year runs to 2027-07-01. $50,000 in
// August and $60,000 on 2026-10-20 cross the $15,000 cap; the $20,000 deal on
// 2027-01-20 is post-cap. Before joining REAL: a May 2026 deal (legacy split,
// moves no cap). Not closed: a September row.

const SPAN_JOIN = "2026-07-01";
const SPAN_ROWS: Row[] = [
  closed("s0", "2026-05-01", 1_000_000), // $25,000, before joining REAL
  closed("s1", "2026-08-15", 2_000_000), // $50,000
  { ...closed("sx", "2026-09-10", 4_000_000), status: "pending" },
  closed("s2", "2026-10-20", 2_400_000), // $60,000: caps
  closed("s3", "2027-01-20", 800_000), // $20,000
];
const SPAN_YTD = SPAN_ROWS.filter((r) => r.status === "closed" && String(r.date).startsWith("2027"));
const SPAN_CARRY = SPAN_ROWS.filter((r) => r.id === "s1" || r.id === "s2");

describe("a REAL agent whose cap year spans January 1, on 2027-02-01", () => {
  const s = () => settings({ real_join_date: SPAN_JOIN });

  beforeEach(() => {
    vi.setSystemTime(new Date("2027-02-01T15:00:00Z")); // 11:00 Atlantic
  });

  it("the dashboard's year-to-date figures are 2027's; its take-home is priced post-cap", () => {
    const d = dashboard(s(), SPAN_YTD, SPAN_CARRY);
    expect(d.ytdGCI).toBe(20_000);
    // $20,000 × 100% − (post-cap $375 + CBR $40 + BEOP $400)
    expect(d.ytdPlanGross.grossAfterPlan).toBeCloseTo(19_185, 6);
    expect(d.ytdPlanGross.capState?.cappedOnDate).toBe("2026-10-20");
  });

  it("without the carry-over the cap restarts on January 1 (the old figure, sanity)", () => {
    const before = dashboard(s(), SPAN_YTD);
    // $20,000 × 85% − (CBR $40 + BEOP $400 + a second sign-up fee $249)
    expect(before.ytdPlanGross.grossAfterPlan).toBeCloseTo(16_311, 6);
    expect(dashboard(s(), SPAN_YTD, SPAN_CARRY).effectiveCash - before.effectiveCash).toBeGreaterThan(2_000);
  });

  it("the page loader fetches exactly the carry-over: closed, from the anniversary to January 1", async () => {
    const { client } = fakeSupabase({ transactions: SPAN_ROWS });
    const rows = await loadCapYearCarryOver(client, USER, s(), 2027);
    expect(rows.map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(capYearCarryOver(s(), asTx(SPAN_ROWS.filter((r) => r.status === "closed")), 2027).map((r) => r.id)).toEqual(["s1", "s2"]);
  });

  it("the page loader makes no query when nothing carries over", async () => {
    const { client } = fakeSupabase({}, { unreachable: ["transactions"] });
    expect(await loadCapYearCarryOver(client, USER, s(), 2026)).toEqual([]); // joined during 2026
    expect(await loadCapYearCarryOver(client, USER, settings({ comp_plan: "simple_split", real_join_date: SPAN_JOIN }), 2027)).toEqual([]);
    expect(await loadCapYearCarryOver(client, USER, null, 2027)).toEqual([]);
  });

  it("the engine (Forecast, Reports, Altimeter, Expenses, the weekly digest) is the dashboard's cash", () => {
    const d = dashboard(s(), SPAN_YTD, SPAN_CARRY);
    expect(engineCash(s(), SPAN_YTD, toPlanDeals(asTx(SPAN_CARRY), asTx(SPAN_YTD)))).toBeCloseTo(d.effectiveCash, 6);
  });

  it("Flight Crew's diagnostics quote the dashboard's cash and 2027's YTD GCI", async () => {
    const d = dashboard(s(), SPAN_YTD, SPAN_CARRY);
    expect(await diagLine(s(), SPAN_ROWS, "Effective Cash")).toBe(cashLine(d.effectiveCash));
    expect(await diagLine(s(), SPAN_ROWS, "YTD Closed GCI", "forecast")).toBe(`YTD Closed GCI: ${fmtCurrency(20_000)} (1 deals)`);
  });

  it("the Scenario Engine's seed starts from the dashboard's cash", async () => {
    const d = dashboard(s(), SPAN_YTD, SPAN_CARRY);
    const carryOverTx = await loadCapYearCarryOver(fakeSupabase({ transactions: SPAN_ROWS }).client, USER, s(), 2027);
    const seed = buildScenarioSeed({
      settings: s(),
      transactions: asTx(SPAN_YTD),
      carryOverTx,
      pipelineDeals: [],
      listings: [],
      historyItems: [],
      expenses: { expensesYTD: 0, monthlyRecurring: 0, expensesRemaining: 0 },
    });
    expect(seed.cashReserve).toBeCloseTo(d.effectiveCash, 6);
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
const ENGINE_CALLERS = [
  "apps/web/app/(app)/altimeter/altimeter-content.tsx",
  "apps/web/app/(app)/expenses/expenses-content.tsx",
  "apps/web/app/(app)/forecast/forecast-content.tsx",
  "apps/web/app/(app)/reports/reports-content.tsx",
  "apps/web/app/api/cron/weekly-digest/route.ts",
  "apps/web/lib/chat-diagnostics.ts",
  "apps/web/lib/scenario-seed.ts",
];

/** Every file that prices closed deals with computePlanGross's `deals` (the YTD take-home and cash position). */
const PLAN_GROSS_DEAL_CALLERS = [
  "apps/web/app/(app)/dashboard/dashboard-content.tsx",
  "apps/web/app/(app)/overhead/overhead-content.tsx",
  "apps/web/app/(app)/reports/reports-content.tsx",
  "apps/web/app/api/chat/route.ts",
];

/** Loaders whose rows reach back past January 1 and that cut the carry-over from them with capYearCarryOver. */
const ALL_ROWS_PAGES = ["apps/web/app/(app)/forecast/page.tsx", "apps/web/app/(app)/reports/page.tsx"];

/** The demo dashboard's made-up agent is on a simple split: it passes an empty carry-over. */
const DEMO = "apps/web/app/demo/";

const ENGINE_CALL = /\bcomputeEffectiveCashForSurvival\s*\(\s*\{/g;
const PLAN_GROSS_CALL = /\bcomputePlanGross\s*\(/g;

/** `toPlanDeals(carryOverTx, <rows>)` */
const DEALS_RULE = /^toPlanDeals\(carryOverTx, (\w+)\)$/;

/** Where a file's `carryOverTx` may come from: the one helper. */
const CARRY_SOURCE =
  /\bconst carryOverTx = (?:await loadCapYearCarryOver\(|capYearCarryOver(?:<\w+>)?\(|await carryOverPromise;)/;
const CARRY_PROMISE = /\bconst carryOverPromise = loadCapYearCarryOver\(/;

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

/** The bracketed text whose opening `{`, `(` or `[` is at `open`, brackets balanced. */
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

/** The top-level comma-separated parts between a bracketed text's outer brackets. */
function parts(bracketed: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 1;
  for (let i = 1; i < bracketed.length - 1; i++) {
    const ch = bracketed[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(bracketed.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = bracketed.slice(start, bracketed.length - 1).trim();
  if (last) out.push(last);
  return out;
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

/** An identifier resolved one step through `const <name> = <expr>;` in the same file. */
function resolve(src: string, value: string): string {
  if (!/^\w+$/.test(value)) return value;
  const m = new RegExp(`\\bconst ${value} = ([^;]+);`).exec(src);
  return m ? m[1].trim() : value;
}

type Call = { file: string; src: string; obj: string; deals: string | null; gci: string | null };

function scan(): { engine: Call[]; planGross: Call[] } {
  const engine: Call[] = [];
  const planGross: Call[] = [];
  for (const root of ROOTS) {
    for (const full of sourceFiles(path.join(REPO_ROOT, root))) {
      const file = path.relative(REPO_ROOT, full);
      const src = withoutComments(readFileSync(full, "utf8"));
      for (const m of src.matchAll(ENGINE_CALL)) {
        const obj = objectAt(src, m.index + m[0].length - 1);
        engine.push({ file, src, obj, deals: property(obj, "transactions"), gci: null });
      }
      for (const m of src.matchAll(PLAN_GROSS_CALL)) {
        const args = parts(objectAt(src, m.index + m[0].length - 1));
        const opts = args[2]?.startsWith("{") ? args[2] : null;
        const deals = opts ? property(opts, "deals") : null;
        if (opts && deals !== null) planGross.push({ file, src, obj: opts, deals, gci: args[1] });
      }
    }
  }
  return { engine, planGross };
}

/** The deals are toPlanDeals(carryOverTx, <rows>), and ytdGCI sums computeGCI over <rows>. */
function expectDashboardDeals(c: Call) {
  expect(c.deals, `${c.file} passes no deals`).not.toBeNull();
  const deals = resolve(c.src, c.deals!).replace(/\s+/g, " ");
  const m = DEALS_RULE.exec(deals);
  expect(m, `${c.file} builds its deals another way: ${deals}`).not.toBeNull();
  const rows = m![1];
  const sum = new RegExp(
    `const ytdGCI = ${rows}\\.reduce\\(\\s*\\(sum(?:: \\w+)?, (\\w+)(?:: \\w+)?\\) => sum \\+ computeGCI\\(\\1\\b`,
  );
  expect(sum.test(c.src), `${c.file}: ytdGCI is not ${rows}.reduce(… computeGCI …)`).toBe(true);
  return rows;
}

describe("every surface prices the year's deals the way the dashboard does", () => {
  const { engine, planGross } = scan();

  it("finds every caller, and only the ones on the lists", () => {
    expect([...new Set(engine.map((c) => c.file))].sort()).toEqual(ENGINE_CALLERS);
    expect([...new Set(planGross.map((c) => c.file))].sort()).toEqual(PLAN_GROSS_DEAL_CALLERS);
  });

  it.each(ENGINE_CALLERS)("%s: the engine gets toPlanDeals(carryOverTx, the rows its ytdGCI sums)", (file) => {
    const mine = engine.filter((c) => c.file === file);
    expect(mine.length).toBeGreaterThan(0);
    for (const c of mine) {
      // `ytdGCI` goes in as the variable of that name.
      expect(/(^|[{,\s])ytdGCI\s*[,}]/.test(c.obj) || property(c.obj, "ytdGCI") === "ytdGCI").toBe(true);
      expectDashboardDeals(c);
    }
  });

  it.each(PLAN_GROSS_DEAL_CALLERS)("%s: computePlanGross sums toPlanDeals(carryOverTx, …) over the calendar year", (file) => {
    const mine = planGross.filter((c) => c.file === file);
    expect(mine.length).toBeGreaterThan(0);
    for (const c of mine) {
      expect(c.gci).toBe("ytdGCI");
      expectDashboardDeals(c);
      // The calendar window is what keeps the carry-over out of every sum.
      expect(property(c.obj, "windowStart")).toMatch(/^`\$\{[^}]+\}-01-01`$/);
      expect(property(c.obj, "windowEnd")).toMatch(/^`\$\{[^}]+ \+ 1\}-01-01`$/);
    }
  });

  it("every carryOverTx comes from the one helper, or is a required prop a page fills from it", () => {
    const files: { file: string; src: string }[] = [];
    for (const root of ROOTS) {
      for (const full of sourceFiles(path.join(REPO_ROOT, root))) {
        const src = withoutComments(readFileSync(full, "utf8"));
        if (/\bcarryOverTx\b/.test(src)) files.push({ file: path.relative(REPO_ROOT, full), src });
      }
    }
    const users = [...new Set([...engine, ...planGross].map((c) => c.file))];
    for (const u of users) expect(files.map((f) => f.file), u).toContain(u);

    for (const { file, src } of files) {
      const sourced = CARRY_SOURCE.test(src);
      if (/\bconst carryOverTx = await carryOverPromise;/.test(src)) {
        expect(CARRY_PROMISE.test(src), `${file}: carryOverPromise is not loadCapYearCarryOver(…)`).toBe(true);
      }
      // A file that does not source it receives it as a required input, typed.
      if (!sourced && !file.startsWith(DEMO)) {
        expect(/\bcarryOverTx: Transaction\[\];/.test(src), `${file} uses carryOverTx it neither loads nor receives`).toBe(true);
      }
      // A const may only be the helper's result.
      for (const m of src.matchAll(/\bconst carryOverTx = ([^;]+);/g)) {
        expect(CARRY_SOURCE.test(m[0]), `${file}: const carryOverTx = ${m[1]}`).toBe(true);
      }
      // Props pass the loaded value on; only the simple-split demo passes none.
      for (const m of src.matchAll(/\bcarryOverTx=\{([^}]*)\}/g)) {
        expect(m[1] === "carryOverTx" || (file.startsWith(DEMO) && m[1] === "[]"), `${file}: carryOverTx={${m[1]}}`).toBe(true);
      }
      expect(/\bcarryOverTx:\s*\[\]/.test(src), `${file} passes an empty carry-over`).toBe(false);
    }
  });

  it("capYearCarryOver cuts from rows that reach back past January 1, never from the year's own", () => {
    for (const c of [...engine, ...planGross]) {
      for (const m of c.src.matchAll(/\bcapYearCarryOver(?:<\w+>)?\(/g)) {
        const args = parts(objectAt(c.src, m.index + m[0].length - 1));
        const rows = args[1].replace(/\s+/g, " ");
        const ytdRows = DEALS_RULE.exec(resolve(c.src, c.deals!).replace(/\s+/g, " "))?.[1];
        expect(rows, `${c.file} cuts the carry-over from the year's rows`).not.toBe(ytdRows);
      }
    }
    // The loaders that hand those components their rows put no lower bound on the date.
    for (const page of ALL_ROWS_PAGES) {
      const src = readFileSync(path.join(REPO_ROOT, page), "utf8");
      const start = src.indexOf('.from("transactions")');
      expect(start, page).toBeGreaterThan(-1);
      expect(src.slice(start, src.indexOf(".limit(", start)), page).not.toMatch(/\.gte?\("date"/);
    }
  });

  it("the property reader handles nesting and shorthand", () => {
    const obj = "{ settings, ytdGCI, transactions: toPlanDeals(carryOverTx, rows), now }";
    expect(property(obj, "transactions")).toBe("toPlanDeals(carryOverTx, rows)");
    expect(property(obj, "now")).toBeNull();
    expect(property("{ a: f(b, c), d: 1 }", "d")).toBe("1");
    expect(parts("(s, ytdGCI, { deals: f(a, b) })")).toEqual(["s", "ytdGCI", "{ deals: f(a, b) }"]);
  });
});

// ── Flight Crew knows ────────────────────────────────────────────────────────

describe("Flight Crew: the REAL cap carries across January 1", () => {
  const kbReal = KNOWLEDGE_BASE.split("\n").find((l) => l.startsWith("**real** (REAL Brokerage")) ?? "";
  const kbSurvival = KNOWLEDGE_BASE.split("\n").find((l) => l.startsWith("**Survival Runway**")) ?? "";

  it("the knowledge base says so under COMMISSION STRUCTURE and Survival Runway, dated", () => {
    for (const [name, line] of [["real", kbReal], ["survival", kbSurvival]] as const) {
      expect(line, name).toMatch(/January 1/);
      expect(line, name).toMatch(/[Cc]hanged 2026-10-14/);
      expect(line, name).toMatch(/re-capped/);
    }
    expect(kbReal).toMatch(/not toward this year's GCI/);
  });

  it("the survival and settings playbooks state the rule and what changed", () => {
    expect(getPlaybook("survival")).toMatch(/before January 1 in the anniversary year that contains it \(the carry-over\)/);
    const settingsPlaybook = getPlaybook("settings");
    expect(settingsPlaybook).toMatch(/The cap carries across January 1/);
    expect(settingsPlaybook).toMatch(/Changed 2026-10-14: every screen, the dashboard included/);
    // The seed is for deals the app does not have: entered deals already count.
    expect(settingsPlaybook).toMatch(/counts twice/);
  });

  it("a question about the cap resetting in January reaches those playbooks", () => {
    const topics = classifyTopicMulti("I'm on REAL and my cash runway dropped on January 1, did my cap reset?").map((t) => t.topic);
    expect(topics.some((t) => t === "survival" || t === "settings")).toBe(true);
  });
});
