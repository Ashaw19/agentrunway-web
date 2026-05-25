/**
 * Agent Runway — Shared Test Fixtures
 * ====================================
 *
 * Test Agent: "Sarah Chen" — Ontario-based agent, 4 years experience.
 *
 * All expected values are hand-calculated from the engine source code,
 * using the exact constants and formulas therein. Every number is traceable.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * FIXTURE DISCIPLINE — READ BEFORE EDITING
 * ──────────────────────────────────────────────────────────────────────────
 * Every fixture in this file is typed to the canonical Supabase row types in
 * `packages/core/types/database.ts`. DO NOT add `as UserSettings` /
 * `as Transaction` / `as PipelineDeal` casts — they silently bypass schema
 * drift and mean CI can ship green while the engines have already broken.
 *
 * If the schema changes:
 *   1. Update `packages/core/types/database.ts` from the migration.
 *   2. Run `pnpm --filter @agent-runway/core typecheck` — failures tell you
 *      exactly which fixtures need new defaults.
 *   3. Add the new fields with sensible defaults in the factories below.
 *
 * Column-name gotchas baked into this fixture:
 *   • `national_quarter_pcts`     — seasonality; DB stores percentages
 *                                   [25,25,25,25]; engine normalizes either
 *                                   form. We seed fractions [0.20, 0.30, 0.30,
 *                                   0.20] here because early engine expected
 *                                   outputs were hand-calculated off fractions.
 *   • `growth_goal_year_pcts`     — 5-year growth; DB stores percentages
 *                                   [10,10,8,8,5]; real callers divide by 100
 *                                   before passing to `fiveYearBands`. We seed
 *                                   decimals [0.10, 0.10, 0.08, 0.08, 0.05]
 *                                   here so the integration test matches the
 *                                   hardcoded decimals in
 *                                   probabilistic-engine.test.ts. Callers of
 *                                   this fixture DO NOT divide by 100 again.
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

// ── User Settings factory ────────────────────────────────────────────────────
// Builds a fully-typed UserSettings row. Every required field on the
// canonical UserSettings type MUST appear here with a sensible default.
// Tests override specific fields via the `overrides` argument.

export function createTestSettings(
  overrides: Partial<UserSettings> = {},
): UserSettings {
  const base: UserSettings = {
    user_id: "test-sarah-chen-001",

    // YTD
    ytd_gci: 0, // computed from transactions
    ytd_transactions: 0,
    ytd_volume: 0,
    monthly_brokerage_fee: 500,

    // Split
    split_preset: "p80_20" as SplitPreset,

    // Transaction fees
    tx_fee_rate_pct: 0.02,
    tx_fee_annual_cap: 3_000,

    // Commission cap
    post_cap_threshold_gci: 100_000,
    post_cap_agent_pct: 0.95,
    post_cap_brokerage_pct: 0.05,

    // Goals
    goal_gci: 150_000,
    goal_transactions: 0,
    goal_volume: 0,
    // Stored as DECIMALS for engine direct-consumption (see header note).
    // Real DB form is percentages; real callers divide by 100 before this shape.
    growth_goal_year_pcts: [0.10, 0.10, 0.08, 0.08, 0.05],

    // Province
    province: "ontario",

    // Seasonality — fractions (spring/summer heavy, typical Ontario market)
    use_national_seasonality: true,
    national_quarter_pcts: [0.20, 0.30, 0.30, 0.20],
    national_seasonality_updated: "2026-01-01T00:00:00Z",

    // Market context
    market_yoy_growth_pct: 0,
    market_mom_growth_pct: 0,
    market_sales_change_pct: 0,
    market_new_listings_change_pct: 0,
    market_index_source_note: "",
    apply_market_adjustment: false,
    market_report_month: "",
    market_data_is_manual: false,
    market_last_updated: "2026-01-01T00:00:00Z",

    // Market architecture
    market_board_name: "",
    market_metric_focus: "combined",

    // Claiming
    home_office_business_use_pct: 0,
    vehicle_business_use_pct: 0,

    // T2125 — Home office
    home_office_method: "simplified",
    home_office_sq_footage: null,
    home_office_rent_monthly: 0,
    home_office_utilities_monthly: 0,
    home_office_property_tax_annual: 0,
    home_office_insurance_monthly: 0,
    home_office_maintenance_annual: 0,
    home_office_condo_fees_monthly: 0,

    // T2125 — GST/HST
    gst_hst_registered: false,
    gst_hst_remitted_q1: 0,
    gst_hst_remitted_q2: 0,
    gst_hst_remitted_q3: 0,
    gst_hst_remitted_q4: 0,
    gst_hst_paid_on_expenses: 0,

    // T2125 — Vehicle
    vehicle_type: "none",

    // T2125 — CRA tax instalments
    cpp_instalment_paid_ytd: 0,
    tax_instalment_paid_q1: 0,
    tax_instalment_paid_q2: 0,
    tax_instalment_paid_q3: 0,
    tax_instalment_paid_q4: 0,

    // Defensibility
    cash_reserve: 15_000,
    experience_years: 4,
    estimated_weekly_hours: null,
    vacation_weeks_per_year: null,

    // Profile display
    display_name: "Sarah Chen",
    brokerage_name: "",
    phone: "",
    color_theme: "blue",

    // Profile media
    avatar_url: "",
    business_logo_url: "",
    agent_cutout_url: "",

    // Business identity
    business_name: "",
    business_number: "",

    // Social
    social_instagram: "",
    social_facebook: "",
    social_linkedin: "",
    social_tiktok: "",
    social_youtube: "",

    // UI preferences
    dashboard_view: "standard",

    // Subscription
    subscription_tier: "starter",
    subscription_status: "free",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_current_period_end: null,

    // Admin override
    is_admin: false,

    // Local market board (reserved — market data layer currently disabled)
    board_code: "",
    board_subregion: "",

    // Business structure
    is_incorporated: false,
    corp_type: null,
    compensation_method: "salary",
    has_employees: false,
    num_employees: 0,

    // Tax optimization
    tax_opt_dismissed: [],

    // Flight Control email signature
    email_signature: "",

    // AI Voice Guide
    ai_voice_guide: null,

    // AI Voice Profile
    communication_profile: null,
    business_identity: null,
    agent_goals: null,
    ai_profile_prompt_dismissed_at: null,

    // Tax filing
    filing_frequency: "annual",
    fiscal_year_end_month: 12,
    brokerage_withholds_hst: false,

    // Timestamps
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  return { ...base, ...overrides };
}

/** Default test settings — Sarah Chen baseline used across the engine tests. */
export const TEST_SETTINGS: UserSettings = createTestSettings();

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
  const base: Transaction = {
    id: overrides.id,
    user_id: "test-sarah-chen-001",
    date: overrides.date,
    address: "",
    sale_price: 0,
    commission_pct: 0.025,
    gci_override: null,
    side: "buyer",
    status: "closed",
    client_name: "Test Client",
    notes: "",
    date_precision: "day",
    source: "manual",
    team_split_pct: null,
    pipeline_deal_id: null,
    import_external_id: null,
    edited_at: null,
    created_at: overrides.date,
    updated_at: overrides.date,
  };
  return { ...base, ...overrides };
}

export const TEST_TRANSACTIONS: Transaction[] = [
  makeTx({
    id: "tx-001",
    date: `${TEST_YEAR}-01-15`,
    sale_price: 450_000,
    commission_pct: 0.025,
    side: "buyer",
    client_name: "Alice Johnson",
  }),
  makeTx({
    id: "tx-002",
    date: `${TEST_YEAR}-02-20`,
    sale_price: 380_000,
    commission_pct: 0.025,
    side: "seller",
    client_name: "Bob Thompson",
  }),
  makeTx({
    id: "tx-003",
    date: `${TEST_YEAR}-03-05`, // before March 11
    sale_price: 525_000,
    commission_pct: 0.025,
    side: "buyer",
    client_name: "Carol Nguyen",
  }),
  makeTx({
    id: "tx-004",
    date: `${TEST_YEAR}-02-10`, // February deal with team split
    sale_price: 600_000,
    commission_pct: 0.025,
    side: "seller",
    team_split_pct: 0.5,
    client_name: "David Patel",
  }),
  makeTx({
    id: "tx-005",
    date: `${TEST_YEAR}-01-28`,
    sale_price: 720_000, // ignored because override
    commission_pct: 0.025,
    gci_override: 15_000,
    side: "buyer",
    client_name: "Evelyn Kim",
  }),
  makeTx({
    id: "tx-006",
    date: `${TEST_YEAR}-03-08`,
    sale_price: 400_000,
    commission_pct: 0.025,
    side: "buyer",
    client_name: "Frank Rossi",
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
  const base: PipelineDeal = {
    id: overrides.id,
    user_id: "test-sarah-chen-001",
    address: "",
    estimated_price: 0,
    estimated_commission_pct: 0.025,
    side: "buyer",
    stage: "lead",
    expected_close_date: null,
    client_name: "Test Pipeline Client",
    notes: "",
    probability_override: null,
    client_id: null,
    original_estimated_price: null,
    created_at: "2026-03-01",
    updated_at: "2026-03-01",
  };
  return { ...base, ...overrides };
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
