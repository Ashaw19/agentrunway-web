/**
 * Agent Runway — Shared Test Fixtures
 * ====================================
 *
 * Test Agent: "Sarah Chen" — Ontario-based agent, 4 years experience.
 *
 * All expected values are hand-calculated from the engine source code,
 * using the exact constants and formulas therein. Every number is traceable.
 */

import type {
  Transaction,
  PipelineDeal,
  UserSettings,
  SplitPreset,
} from "../../types/database";

// ── Current year (tests use fake timers pinned to 2026-03-11) ────────────────

export const TEST_YEAR = 2026;
export const TEST_DATE = new Date(2026, 2, 11); // March 11, 2026

// ── User Settings ────────────────────────────────────────────────────────────

export const TEST_SETTINGS: UserSettings = {
  user_id: "test-sarah-chen-001",
  ytd_gci: 0, // computed from transactions
  ytd_transactions: 0,
  ytd_volume: 0,
  monthly_brokerage_fee: 500,
  split_preset: "p80_20" as SplitPreset,
  tx_fee_rate_pct: 0.02,
  tx_fee_annual_cap: 3_000,
  goal_gci: 150_000,
  cash_reserve: 15_000,
  province: "ontario" as const,
  experience_years: 4,
  // Post-cap
  post_cap_threshold_gci: 100_000,
  post_cap_agent_pct: 0.95,
  post_cap_brokerage_pct: 0.05,
  // Seasonality (spring/summer heavy, typical Ontario market)
  seasonal_weights: [0.20, 0.30, 0.30, 0.20],
  // Growth goals (5-year)
  growth_goals: [0.10, 0.10, 0.08, 0.08, 0.05],
  // Other required fields
  display_name: "Sarah Chen",
  avatar_url: null,
  onboarding_complete: true,
  updated_at: "2026-01-01T00:00:00Z",
  monthly_recurring_expenses: 800,
  // Pipeline
  pipeline_monthly_estimate: 0,
} as UserSettings;

// ── Transactions (6 closed deals in current year) ────────────────────────────
//
// Hand-calculated GCI for each:
//   Tx1: 450,000 × 0.025 = $11,250
//   Tx2: 380,000 × 0.025 = $9,500
//   Tx3: 525,000 × 0.025 = $13,125
//   Tx4: 600,000 × 0.025 × 0.5 (team split) = $7,500
//   Tx5: gci_override = $15,000 (bypasses calc)
//   Tx6: 400,000 × 0.025 = $10,000
//   ─────────────────────────────────────
//   Total YTD GCI = $66,375

function makeTx(overrides: Partial<Transaction> & { id: string; date: string }): Transaction {
  return {
    user_id: "test-sarah-chen-001",
    sale_price: 0,
    commission_pct: 0.025,
    gci_override: null,
    side: "buyer",
    status: "closed",
    team_split_pct: null,
    notes: null,
    created_at: overrides.date,
    updated_at: overrides.date,
    address: null,
    date_precision: "day",
    source: "manual",
    ...overrides,
  } as Transaction;
}

export const TEST_TRANSACTIONS: Transaction[] = [
  makeTx({
    id: "tx-001",
    date: `${TEST_YEAR}-01-15`,
    sale_price: 450_000,
    commission_pct: 0.025,
    side: "buyer",
  }),
  makeTx({
    id: "tx-002",
    date: `${TEST_YEAR}-02-20`,
    sale_price: 380_000,
    commission_pct: 0.025,
    side: "seller",
  }),
  makeTx({
    id: "tx-003",
    date: `${TEST_YEAR}-03-05`, // before March 11
    sale_price: 525_000,
    commission_pct: 0.025,
    side: "buyer",
  }),
  makeTx({
    id: "tx-004",
    date: `${TEST_YEAR}-02-10`, // February deal with team split
    sale_price: 600_000,
    commission_pct: 0.025,
    side: "seller",
    team_split_pct: 0.5,
  }),
  makeTx({
    id: "tx-005",
    date: `${TEST_YEAR}-01-28`,
    sale_price: 720_000, // ignored because override
    commission_pct: 0.025,
    gci_override: 15_000,
    side: "buyer",
  }),
  makeTx({
    id: "tx-006",
    date: `${TEST_YEAR}-03-08`,
    sale_price: 400_000,
    commission_pct: 0.025,
    side: "buyer",
  }),
];

// Expected GCI per transaction (hand-calculated)
export const EXPECTED_GCI = {
  tx1: 11_250, // 450000 × 0.025
  tx2: 9_500, // 380000 × 0.025
  tx3: 13_125, // 525000 × 0.025
  tx4: 7_500, // 600000 × 0.025 × 0.5
  tx5: 15_000, // gci_override
  tx6: 10_000, // 400000 × 0.025
  total: 66_375,
};

// Monthly GCI breakdown (for monthlyGCITotals, months 0-indexed):
// Jan (month 0): tx1 ($11,250) + tx5 ($15,000) = $26,250
// Feb (month 1): tx2 ($9,500) + tx4 ($7,500) = $17,000
// Mar (month 2): tx3 ($13,125) + tx6 ($10,000) = $23,125
export const EXPECTED_MONTHLY_GCI = {
  jan: 26_250,
  feb: 17_000,
  mar: 23_125,
  totals: [26_250, 17_000, 23_125], // 3 months (Jan–Mar)
};

// ── Pipeline Deals ───────────────────────────────────────────────────────────
//
// Hand-calculated:
//   Deal 1 (lead):        500,000 × 0.025 = $12,500 est → ×0.10 = $1,250 weighted
//   Deal 2 (conditional): 650,000 × 0.025 = $16,250 est → ×0.75 = $12,187.50 weighted
//   Deal 3 (firm):        420,000 × 0.025 = $10,500 est → ×0.90 = $9,450 weighted
//   ─────────────────────────────────────────────────────
//   Total weighted GCI = $22,887.50

function makeDeal(overrides: Partial<PipelineDeal> & { id: string }): PipelineDeal {
  return {
    user_id: "test-sarah-chen-001",
    estimated_price: 0,
    estimated_commission_pct: 0.025,
    probability_override: null,
    stage: "lead",
    notes: null,
    created_at: "2026-03-01",
    updated_at: "2026-03-01",
    client_name: null,
    ...overrides,
  } as PipelineDeal;
}

export const TEST_PIPELINE: PipelineDeal[] = [
  makeDeal({
    id: "deal-001",
    stage: "lead",
    estimated_price: 500_000,
    estimated_commission_pct: 0.025,
  }),
  makeDeal({
    id: "deal-002",
    stage: "conditional",
    estimated_price: 650_000,
    estimated_commission_pct: 0.025,
  }),
  makeDeal({
    id: "deal-003",
    stage: "firm",
    estimated_price: 420_000,
    estimated_commission_pct: 0.025,
  }),
];

export const EXPECTED_PIPELINE = {
  deal1: { estimatedGCI: 12_500, probability: 0.10, weighted: 1_250 },
  deal2: { estimatedGCI: 16_250, probability: 0.75, weighted: 12_187.5 },
  deal3: { estimatedGCI: 10_500, probability: 0.90, weighted: 9_450 },
  totalWeighted: 22_887.5,
};

// ── Expense Data ─────────────────────────────────────────────────────────────

export const TEST_EXPENSES = {
  ytdExpenses: 8_500,
  monthlyRecurring: 800,
};
