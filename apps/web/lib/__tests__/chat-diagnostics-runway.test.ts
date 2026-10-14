/**
 * Flight Crew's troubleshooting diagnostics quote the dashboard's cash runway
 * (2026-10-13).
 *
 * The months are cash ÷ (burn − pipeline income estimate). Every screen and
 * the chat route's main context passed the estimate. The two diagnostic
 * builders in chat-diagnostics.ts ([RUNWAY SCORE BREAKDOWN] and
 * [SURVIVAL DIAGNOSTIC]) passed 0, so with deals in the pipeline
 * troubleshooting mode handed Flight Crew a second, lower month count, a
 * different band, and through the Survival sub-score a different Runway
 * Score than the dashboard showed.
 *
 * These tests run the real `buildDiagnostics` over made-up rows. One account
 * is worked out by hand; the others are held to the dashboard's own chain
 * (dashboard-content.tsx), written out below as the dashboard writes it.
 *
 * The last block scans every `survivalResult(` call in the apps for its
 * fourth argument, so the next surface that leaves the estimate out fails
 * here instead of in front of a user.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { buildDiagnostics } from "../chat-diagnostics";
import { fakeSupabase, type Row } from "../ai/__tests__/helpers/fake-supabase";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import {
  activePipelineDeals,
  computeGCI,
  computeWeightedGCI,
  type Transaction,
  type UserSettings,
} from "@agent-runway/core/types/database";
import {
  computeListingWeightedGCI,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  seasonalFractionElapsed,
} from "@agent-runway/core/engines/projection-engine";
import { computeEffectiveCashForSurvival } from "@agent-runway/core/engines/effective-cash";
import {
  RISK_BAND_RANGE,
  RISK_LEVEL_LABEL,
  survivalResult,
  type RiskBandLevel,
} from "@agent-runway/core/engines/survival-engine";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import { compute as computeRunwayScore } from "@agent-runway/core/engines/runway-score-engine";
import { compare as benchmarkCompare } from "@agent-runway/core/engines/benchmark-engine";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const USER = "user-1";
// Mid-July: with flat quarters, six months of the year are still ahead.
const NOW = new Date(2026, 6, 15, 12);

function settings(over: Partial<UserSettings> = {}): UserSettings {
  return createTestSettings({
    user_id: USER,
    province: "newBrunswick",
    goal_gci: 120_000,
    cash_reserve: 7_500,
    monthly_brokerage_fee: 2_500,
    use_national_seasonality: false,
    gst_hst_registered: false,
    brokerage_withholds_hst: false,
    is_incorporated: false,
    experience_years: 6,
    ...over,
  });
}

function pipelineDeal(estimated_price: number, probability_override: number | null, stage: string): Row {
  return { user_id: USER, estimated_price, estimated_commission_pct: 0.025, probability_override, stage };
}

function closing(date: string, sale_price: number): Row {
  return { user_id: USER, date, sale_price, commission_pct: 0.025, team_split_pct: null, gci_override: null, status: "closed" };
}

// $400,000 × 2.5% × 60% = $6,000 of weighted GCI. The closed and lost rows
// stay in `pipeline_deals` for history and belong to no pipeline total.
const PIPELINE: Row[] = [
  pipelineDeal(400_000, 0.6, "conditional"),
  pipelineDeal(500_000, null, "closed"),
  pipelineDeal(300_000, 0.25, "lost"),
];

// $800,000 × 2.5% × 40% = $8,000 of listing-weighted GCI. It feeds the
// projection, and is not part of the runway's income estimate.
const LISTINGS: Row[] = [
  { user_id: USER, estimated_list_price: 800_000, estimated_commission_pct: 0.025, status: "active" },
  { user_id: USER, estimated_list_price: 650_000, estimated_commission_pct: 0.025, status: "sold" },
];

interface Account {
  settings: UserSettings;
  transactions?: Row[];
  pipeline?: Row[];
  listings?: Row[];
}

function tables(a: Account): Record<string, Row[]> {
  return {
    user_settings: [a.settings as unknown as Row],
    transactions: a.transactions ?? [],
    pipeline_deals: a.pipeline ?? [],
    listing_appointments: a.listings ?? [],
    expense_categories: [],
    clients: [],
    history_items: [],
    receipt_expenses: [],
    referrals: [],
    recurring_expenses: [],
  };
}

async function diagnostics(a: Account): Promise<string> {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase(tables(a)).client as never);
  return buildDiagnostics(USER, ["runway-score", "survival"]);
}

/** One `Label: value` line of a diagnostic block. */
function line(text: string, label: string): string {
  const found = text.split("\n").find((l) => l.replace(/^├─ /, "").startsWith(label));
  if (found === undefined) throw new Error(`no "${label}" line in:\n${text}`);
  return found.replace(/^├─ /, "");
}

function block(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`no ${heading} block in:\n${text}`);
  const next = text.indexOf("\n\n[", start);
  return next < 0 ? text.slice(start) : text.slice(start, next);
}

const bandText = (level: RiskBandLevel) => `${RISK_LEVEL_LABEL[level]} (${RISK_BAND_RANGE[level]})`;

/**
 * What the dashboard shows for the same rows: dashboard-content.tsx's chain,
 * from "YTD calculations" to "Runway Score". The account has no expenses, so
 * expensesYTD, monthlyRecurring and expensesRemaining are 0.
 */
function dashboard(a: Account) {
  const s = a.settings;
  const transactions = (a.transactions ?? []) as unknown as Transaction[];
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const livePipelineDeals = activePipelineDeals(
    (a.pipeline ?? []) as unknown as Parameters<typeof computeWeightedGCI>[0][],
  );
  const pipelineWeightedGCI = livePipelineDeals.reduce((sum, d) => sum + computeWeightedGCI(d), 0);
  const activeListings = (a.listings ?? []).filter((l) => l.status === "scheduled" || l.status === "active");
  const listingWeightedGCI = computeListingWeightedGCI(
    activeListings as unknown as Parameters<typeof computeListingWeightedGCI>[0],
  );
  const fraction = seasonalFractionElapsed([0.25, 0.25, 0.25, 0.25]);
  const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI + listingWeightedGCI, fraction, s.goal_gci);

  // "Survival prep (pipeline monthly estimate)", as the dashboard writes it.
  const remainingMonths = Math.max(1, 12 - Math.floor(fraction * 12));
  const pipelineMonthlyEst = fraction > 0 ? pipelineWeightedGCI / remainingMonths : 0;

  const projectedDealCount = projectedYearEndTransactions(transactions.length, livePipelineDeals.length, fraction);
  const { cashPosition } = computeEffectiveCashForSurvival({
    settings: s,
    ytdGCI,
    expensesYTD: 0,
    expensesRemaining: 0,
    projectedGCI,
    projectedDealCount,
    fraction,
    now: NOW,
  });
  const survival = survivalResult(s.monthly_brokerage_fee, 0, cashPosition.effectiveCash, pipelineMonthlyEst);
  const healthReport = buildHealthReport(ytdGCI, s.goal_gci, fraction, pipelineWeightedGCI, 0);
  const benchmark = benchmarkCompare(projectedGCI, s.experience_years ?? null);
  const runwayScore = computeRunwayScore(healthReport, benchmark.percentile, survival.months);
  const survivalSubScore = runwayScore.components.find((c) => c.label === "Survival")!.score;
  return { survival, runwayScore, survivalSubScore, pipelineMonthlyEst, effectiveCash: cashPosition.effectiveCash };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(createClient).mockReset();
});

// ── Worked out by hand ───────────────────────────────────────────────────────
//
//   cash             $7,500 (no closings yet this year, so the reserve as entered)
//   burn             $2,500 a month (brokerage fee; no expenses)
//   pipeline income  $6,000 weighted ÷ 6 months left = $1,000 a month
//   net burn         $2,500 − $1,000 = $1,500
//   runway           $7,500 ÷ $1,500 = 5.0 months → Healthy (4–6 months)
//
// Without the estimate: $7,500 ÷ $2,500 = 3.0 months → Warning.

describe("an account with $7,500, a $2,500 burn and $6,000 of weighted pipeline in mid-July", () => {
  const ACCOUNT: Account = { settings: settings(), pipeline: PIPELINE, listings: LISTINGS };

  it("the fixture is the hand arithmetic: the dashboard shows 5.0 months, Healthy", () => {
    const d = dashboard(ACCOUNT);
    expect(d.effectiveCash).toBe(7_500);
    expect(d.pipelineMonthlyEst).toBe(1_000);
    expect(d.survival.label).toBe("5.0 months");
    expect(d.survival.riskLevel).toBe("healthy");
  });

  it("the survival diagnostic says 5.0 months, Healthy, not the 3.0 months of cash ÷ burn", async () => {
    const survival = block(await diagnostics(ACCOUNT), "[SURVIVAL DIAGNOSTIC]");
    expect(line(survival, "Runway")).toMatch(/: 5\.0 months$/);
    expect(line(survival, "Risk Level")).toBe("Risk Level: Healthy (4–6 months)");
  });

  it("prints the estimate, what it is divided from, and the net burn, so the months divide out", async () => {
    const survival = block(await diagnostics(ACCOUNT), "[SURVIVAL DIAGNOSTIC]");
    expect(line(survival, "Effective Cash")).toMatch(/: \$7,500$/);
    expect(line(survival, "Total Monthly Burn")).toBe("Total Monthly Burn: $2,500");
    expect(line(survival, "Pipeline Income Estimate")).toBe(
      "Pipeline Income Estimate: $1,000/mo (pipeline weighted GCI $6,000 ÷ 6 months left in the year; listing appointments are not counted)",
    );
    expect(line(survival, "Net Monthly Burn")).toMatch(/: \$1,500$/);
  });

  it("gives the sentence the Reports page prints under the figure", async () => {
    const survival = block(await diagnostics(ACCOUNT), "[SURVIVAL DIAGNOSTIC]");
    expect(survival).toContain(
      "Based on your cash reserve of $7,500 and a monthly burn rate of $2,500, less an estimated $1,000 a month of pipeline income.",
    );
  });

  it("the Runway Score breakdown describes the same runway", async () => {
    const breakdown = block(await diagnostics(ACCOUNT), "[RUNWAY SCORE BREAKDOWN]");
    expect(line(breakdown, "Survival detail")).toBe(
      "Survival detail: 5.0 months (Healthy, 4–6 months), burn: $2,500/mo, pipeline income estimate: $1,000/mo, net burn: $1,500/mo",
    );
  });

  it("the breakdown's Survival sub-score and composite score are the dashboard's", async () => {
    const d = dashboard(ACCOUNT);
    const breakdown = block(await diagnostics(ACCOUNT), "[RUNWAY SCORE BREAKDOWN]");
    expect(line(breakdown, "Survival (15%)")).toBe(`Survival (15%): ${d.survivalSubScore}/100`);
    expect(line(breakdown, "Score")).toMatch(new RegExp(`^Score: ${d.runwayScore.score} — ${d.runwayScore.stateLabel} `));
  });

  it("listing appointments alone add nothing to the estimate", async () => {
    const survival = block(await diagnostics({ ...ACCOUNT, pipeline: [] }), "[SURVIVAL DIAGNOSTIC]");
    expect(line(survival, "Pipeline Income Estimate")).toMatch(/^Pipeline Income Estimate: \$0\/mo/);
    expect(line(survival, "Runway")).toMatch(/: 3\.0 months$/);
  });
});

// ── The far end of the same bug ──────────────────────────────────────────────

describe("a $0 cash position with a pipeline estimate above the burn", () => {
  // $900,000 × 2.5% × 80% = $18,000 weighted ÷ 6 months = $3,000 a month,
  // above the $2,500 burn. The screens show 24+ months, Strong. With no
  // estimate the same account is $0 ÷ $2,500 = 0 months, Critical.
  const ACCOUNT: Account = {
    settings: settings({ cash_reserve: 0 }),
    pipeline: [pipelineDeal(900_000, 0.8, "firm")],
  };

  it("reads 24+ months, Strong, in both blocks", async () => {
    const text = await diagnostics(ACCOUNT);
    const survival = block(text, "[SURVIVAL DIAGNOSTIC]");
    expect(line(survival, "Runway")).toMatch(/: 24\+ months$/);
    expect(line(survival, "Risk Level")).toBe("Risk Level: Strong (6+ months)");
    expect(line(block(text, "[RUNWAY SCORE BREAKDOWN]"), "Survival detail")).toMatch(
      /^Survival detail: 24\+ months \(Strong, 6\+ months\)/,
    );
  });

  it("says the estimate covers the burn, so the months are not a division", async () => {
    const survival = block(await diagnostics(ACCOUNT), "[SURVIVAL DIAGNOSTIC]");
    expect(line(survival, "Pipeline Income Estimate")).toMatch(/^Pipeline Income Estimate: \$3,000\/mo/);
    expect(line(survival, "Net Monthly Burn")).toMatch(/: \$0$/);
    expect(survival).toContain("the pipeline income estimate covers the whole burn");
  });

  it("scores Survival and the composite as the dashboard does", async () => {
    const d = dashboard(ACCOUNT);
    expect(d.survival.months).toBe(24);
    const breakdown = block(await diagnostics(ACCOUNT), "[RUNWAY SCORE BREAKDOWN]");
    expect(line(breakdown, "Survival (15%)")).toBe(`Survival (15%): ${d.survivalSubScore}/100`);
    expect(line(breakdown, "Score")).toMatch(new RegExp(`^Score: ${d.runwayScore.score} — `));
  });
});

// ── Cash that is worked out, not entered ─────────────────────────────────────

describe("an account with closings this year (cash is the implied position)", () => {
  const ACCOUNT: Account = {
    settings: settings({ cash_reserve: 2_000 }),
    transactions: [closing("2026-02-10", 500_000), closing("2026-05-20", 460_000)],
    pipeline: PIPELINE,
    listings: LISTINGS,
  };

  it("the fixture nets pipeline income: the dashboard's months are above cash ÷ burn", () => {
    const d = dashboard(ACCOUNT);
    expect(d.survival.monthlyIncome).toBe(1_000);
    expect(d.survival.months).toBeLessThan(24);
    expect(d.survival.months).toBeGreaterThan(d.effectiveCash / 2_500);
  });

  it("both blocks give the dashboard's months, band, sub-score and score", async () => {
    const d = dashboard(ACCOUNT);
    const text = await diagnostics(ACCOUNT);
    const survival = block(text, "[SURVIVAL DIAGNOSTIC]");
    const breakdown = block(text, "[RUNWAY SCORE BREAKDOWN]");
    const level = d.survival.riskLevel as RiskBandLevel;

    expect(line(survival, "Runway")).toMatch(new RegExp(`: ${d.survival.label.replace("+", "\\+")}$`));
    expect(line(survival, "Risk Level")).toBe(`Risk Level: ${bandText(level)}`);
    expect(line(breakdown, "Survival detail")).toContain(`Survival detail: ${d.survival.label} (`);
    expect(line(breakdown, "Survival (15%)")).toBe(`Survival (15%): ${d.survivalSubScore}/100`);
    expect(line(breakdown, "Score")).toMatch(new RegExp(`^Score: ${d.runwayScore.score} — ${d.runwayScore.stateLabel} `));
  });
});

// ── Unchanged where there is no pipeline ─────────────────────────────────────

describe("an account with no pipeline", () => {
  const ACCOUNT: Account = { settings: settings() };

  it("the runway is cash ÷ burn: 3.0 months, Warning", async () => {
    const text = await diagnostics(ACCOUNT);
    const survival = block(text, "[SURVIVAL DIAGNOSTIC]");
    expect(line(survival, "Runway")).toMatch(/: 3\.0 months$/);
    expect(line(survival, "Risk Level")).toBe("Risk Level: Warning (2–4 months)");
    expect(line(survival, "Pipeline Income Estimate")).toBe(
      "Pipeline Income Estimate: $0/mo (the active pipeline has no weighted GCI)",
    );
    expect(line(survival, "Net Monthly Burn")).toMatch(/: \$2,500$/);
    expect(survival).toContain("Based on your cash reserve of $7,500 and a monthly burn rate of $2,500.");
    expect(line(block(text, "[RUNWAY SCORE BREAKDOWN]"), "Survival detail")).toBe(
      "Survival detail: 3.0 months (Warning, 2–4 months), burn: $2,500/mo",
    );
  });
});

describe("an account with no cash reserve and no monthly costs", () => {
  it("is called what the badge calls it, with no band", async () => {
    const text = await diagnostics({ settings: settings({ cash_reserve: 0, monthly_brokerage_fee: 0 }) });
    const survival = block(text, "[SURVIVAL DIAGNOSTIC]");
    expect(line(survival, "Risk Level")).toBe(
      `Risk Level: ${RISK_LEVEL_LABEL.notConfigured} (no cash reserve and no monthly costs entered)`,
    );
    expect(line(block(text, "[RUNWAY SCORE BREAKDOWN]"), "Survival detail")).toBe(
      `Survival detail: ${RISK_LEVEL_LABEL.notConfigured} (no cash reserve and no monthly costs entered)`,
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

/** A call to the survival engine, under either name it is imported as. */
const SURVIVAL_CALL = /\b(?:survivalResult|computeSurvivalResult)\s*\(/g;

/** The fourth argument is the pipeline income estimate. */
const PASSES_ESTIMATE = /\bpipelineMonthlyEst\b|\bcomputePipelineMonthlyIncome\s*\(/;

/**
 * Calls that leave the estimate out, counted per file so a new one fails and
 * a fixed one forces this list to shrink. Each needs a reason.
 */
const ALLOWED_WITHOUT_ESTIMATE: Record<string, { count: number; why: string }> = {
  "apps/web/app/(app)/crm/clients-content.tsx": {
    count: 1,
    why: "Reads `.monthlyBurn` only (brokerage fee + recurring), for the client valuation. No runway is shown.",
  },
  "apps/web/app/(app)/scenarios/scenarios-content.tsx": {
    count: 1,
    why:
      "Known difference from the dashboard, not a decision: the Scenarios page models its own runway " +
      "(cash ÷ burn, its own seasonal fraction, benchmark fixed at 50). Aligning its Current column is a separate task.",
  },
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name === "_shared" || name.startsWith(".")) continue;
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

/** The arguments of the call whose `(` is at `open`, split at top-level commas. */
function argumentsAt(src: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(" || ch === "[" || ch === "{") {
      if (depth > 0) current += ch;
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) break;
      current += ch;
    } else if (ch === "," && depth === 1) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") args.push(current.trim());
  return args;
}

describe("every survivalResult call passes the pipeline income estimate", () => {
  const calls: { file: string; args: string[] }[] = [];
  for (const root of ROOTS) {
    for (const full of sourceFiles(path.join(REPO_ROOT, root))) {
      const src = withoutComments(readFileSync(full, "utf8"));
      for (const m of src.matchAll(SURVIVAL_CALL)) {
        calls.push({
          file: path.relative(REPO_ROOT, full),
          args: argumentsAt(src, m.index + m[0].length - 1),
        });
      }
    }
  }

  it("finds the call sites (the scan is not vacuous)", () => {
    const files = new Set(calls.map((c) => c.file));
    expect(files).toContain("apps/web/app/(app)/dashboard/dashboard-content.tsx");
    expect(files).toContain("apps/web/lib/chat-diagnostics.ts");
    expect(files).toContain("apps/web/app/api/chat/route.ts");
    expect(calls.length).toBeGreaterThanOrEqual(10);
  });

  it("as its fourth argument, or the file is on the list with a reason", () => {
    const without: Record<string, number> = {};
    for (const c of calls) {
      if (c.args.length === 4 && PASSES_ESTIMATE.test(c.args[3])) continue;
      without[c.file] = (without[c.file] ?? 0) + 1;
    }
    const expected = Object.fromEntries(
      Object.entries(ALLOWED_WITHOUT_ESTIMATE).map(([file, { count }]) => [file, count]),
    );
    expect(without).toEqual(expected);
  });

  it("the argument splitter reads nested calls and trailing commas", () => {
    const src = "f(a, g(b, { c: [1, 2] }), h(),\n  d,\n)";
    expect(argumentsAt(src, 1)).toEqual(["a", "g(b, { c: [1, 2] })", "h()", "d"]);
  });
});
