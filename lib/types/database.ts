// ============================================================================
// Agent Runway — Database Types
// TypeScript types mirroring the Supabase Postgres schema
// ============================================================================

// ── Enums ───────────────────────────────────────────────────────────────────

export type TransactionSide = "buyer" | "seller" | "both";

export type TransactionStatus = "closed" | "pending" | "fallen";

export type PipelineStage = "lead" | "showing" | "offer" | "conditional" | "firm";

export const PIPELINE_STAGE_DEFAULTS: Record<PipelineStage, number> = {
  lead: 0.1,
  showing: 0.25,
  offer: 0.5,
  conditional: 0.75,
  firm: 0.9,
};

export type MilestoneType =
  | "gciThreshold"
  | "dealCount"
  | "firstDealOfMonth"
  | "firstDealOfQuarter"
  | "bestMonth"
  | "bestQuarter"
  | "paceAhead"
  | "streakWeek";

export type SplitPreset =
  | "p70_30"
  | "p75_25"
  | "p80_20"
  | "p85_15"
  | "p90_10"
  | "p95_5"
  | "p100_0";

export const SPLIT_PRESET_AGENT_PCT: Record<SplitPreset, number> = {
  p70_30: 0.7,
  p75_25: 0.75,
  p80_20: 0.8,
  p85_15: 0.85,
  p90_10: 0.9,
  p95_5: 0.95,
  p100_0: 1.0,
};

export type Province =
  | "alberta"
  | "britishColumbia"
  | "manitoba"
  | "newBrunswick"
  | "newfoundland"
  | "northwestTerritories"
  | "novaScotia"
  | "nunavut"
  | "ontario"
  | "princeEdwardIsland"
  | "quebec"
  | "saskatchewan"
  | "yukon";

export const PROVINCE_LABELS: Record<Province, string> = {
  alberta: "Alberta",
  britishColumbia: "British Columbia",
  manitoba: "Manitoba",
  newBrunswick: "New Brunswick",
  newfoundland: "Newfoundland & Labrador",
  northwestTerritories: "Northwest Territories",
  novaScotia: "Nova Scotia",
  nunavut: "Nunavut",
  ontario: "Ontario",
  princeEdwardIsland: "Prince Edward Island",
  quebec: "Quebec",
  saskatchewan: "Saskatchewan",
  yukon: "Yukon",
};

export const PROVINCE_ISO_CODES: Record<Province, string> = {
  alberta: "AB",
  britishColumbia: "BC",
  manitoba: "MB",
  newBrunswick: "NB",
  newfoundland: "NL",
  northwestTerritories: "NT",
  novaScotia: "NS",
  nunavut: "NU",
  ontario: "ON",
  princeEdwardIsland: "PE",
  quebec: "QC",
  saskatchewan: "SK",
  yukon: "YT",
};

export const PROVINCE_GST_HST_RATES: Record<Province, number> = {
  alberta: 0.05,
  britishColumbia: 0.12,
  manitoba: 0.12,
  newBrunswick: 0.15,
  newfoundland: 0.15,
  northwestTerritories: 0.05,
  novaScotia: 0.15,
  nunavut: 0.05,
  ontario: 0.13,
  princeEdwardIsland: 0.15,
  quebec: 0.14975,
  saskatchewan: 0.11,
  yukon: 0.05,
};

export type MarketGeographyType = "national" | "province" | "board" | "city";

export type MarketMetricFocus = "sales" | "price" | "combined";

export type MarketDataReadiness = "manualOnly" | "stubData" | "liveFeed";

// ── Row Types ───────────────────────────────────────────────────────────────

export interface UserSettings {
  user_id: string;

  // YTD
  ytd_gci: number;
  ytd_transactions: number;
  ytd_volume: number;
  monthly_brokerage_fee: number;

  // Split
  split_preset: SplitPreset;

  // Transaction fees
  tx_fee_rate_pct: number;
  tx_fee_annual_cap: number;

  // Commission cap
  post_cap_threshold_gci: number;
  post_cap_agent_pct: number;
  post_cap_brokerage_pct: number;

  // Goals
  goal_gci: number;
  goal_transactions: number;
  goal_volume: number;
  growth_goal_year_pcts: number[]; // 5 elements

  // Province
  province: Province;

  // Seasonality
  use_national_seasonality: boolean;
  national_quarter_pcts: number[]; // 4 elements
  national_seasonality_updated: string;

  // Market context
  market_yoy_growth_pct: number;
  market_mom_growth_pct: number;
  market_sales_change_pct: number;
  market_new_listings_change_pct: number;
  market_index_source_note: string;
  apply_market_adjustment: boolean;
  market_report_month: string;
  market_data_is_manual: boolean;
  market_last_updated: string;

  // Market architecture
  market_board_name: string;
  market_metric_focus: MarketMetricFocus;

  // Claiming
  home_office_business_use_pct: number;
  vehicle_business_use_pct: number;

  // Defensibility
  cash_reserve: number;
  experience_years: number | null;

  // Profile display
  display_name: string;
  brokerage_name: string;
  color_theme: string; // 'blue' | 'violet' | 'emerald' | 'orange' | 'rose'

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;

  date: string; // ISO date
  address: string;
  sale_price: number;
  commission_pct: number;
  gci_override: number | null;
  side: TransactionSide;
  status: TransactionStatus;
  client_name: string;
  notes: string;

  created_at: string;
  updated_at: string;
}

export interface PipelineDeal {
  id: string;
  user_id: string;

  address: string;
  estimated_price: number;
  estimated_commission_pct: number;
  side: TransactionSide;
  stage: PipelineStage;
  expected_close_date: string | null;
  client_name: string;
  notes: string;
  probability_override: number | null;

  created_at: string;
  updated_at: string;
}

export interface HistoryItem {
  id: string;
  user_id: string;

  year: number;
  annual_gci: number;
  annual_tx: number;
  quarter_gci: number[]; // [Q1, Q2, Q3, Q4]
  quarter_tx: number[];
  is_locked: boolean;

  created_at: string;
  updated_at: string;
}

export interface ExpenseCategory {
  id: string;
  user_id: string;

  key: string;
  title: string;
  sort_order: number;

  created_at: string;
  updated_at: string;
}

export interface ExpenseItem {
  id: string;
  user_id: string;
  category_id: string;

  key: string;
  title: string;
  ytd_amount: number;
  monthly_recurring: number;
  sort_order: number;

  created_at: string;
  updated_at: string;
}

/** ExpenseCategory with its items joined */
export interface ExpenseCategoryWithItems extends ExpenseCategory {
  items: ExpenseItem[];
}

export interface Milestone {
  id: string;
  user_id: string;

  type: MilestoneType;
  title: string;
  message: string;
  triggered_at: string;
  acknowledged: boolean;

  created_at: string;
}

export interface AgentProfile {
  id: string;
  user_id: string;

  name: string;
  role: string;
  agent_split_pct: number;
  monthly_desk_fee: number;
  target_gci: number;
  color_index: number;
  notes: string;
  is_active: boolean;

  created_at: string;
  updated_at: string;
}

export interface TeamDeal {
  id: string;
  user_id: string;
  agent_profile_id: string;

  date: string;
  address: string;
  gci: number;
  side: TransactionSide;
  client_name: string;

  created_at: string;
  updated_at: string;
}

/** AgentProfile with deals joined */
export interface AgentProfileWithDeals extends AgentProfile {
  deals: TeamDeal[];
}

export interface MarketDataPoint {
  id: string;
  user_id: string;

  period_label: string;
  period_start: string | null;
  period_end: string | null;

  geo_type: MarketGeographyType;
  geo_name: string;
  geo_province_code: string;
  geo_board_code: string | null;

  sales: number | null;
  new_listings: number | null;
  active_listings: number | null;
  benchmark_price: number | null;
  avg_price: number | null;
  months_of_inventory: number | null;
  dom_median: number | null;

  yoy_sales_pct: number | null;
  yoy_price_pct: number | null;
  mom_sales_pct: number | null;
  mom_price_pct: number | null;

  source_name: string;
  source_url: string | null;
  retrieved_at: string;
  notes: string | null;

  created_at: string;
}

// ── Computed Helpers (mirror iOS computed properties) ────────────────────────

/** Compute GCI for a transaction (mirrors iOS Transaction.gci) */
export function computeGCI(tx: Transaction): number {
  return tx.gci_override ?? tx.sale_price * tx.commission_pct;
}

/** Compute pipeline deal probability (mirrors iOS PipelineDeal.probability) */
export function computeProbability(deal: PipelineDeal): number {
  if (deal.probability_override != null) {
    return Math.max(0, Math.min(1, deal.probability_override));
  }
  return PIPELINE_STAGE_DEFAULTS[deal.stage];
}

/** Compute estimated GCI for a pipeline deal */
export function computeEstimatedGCI(deal: PipelineDeal): number {
  return deal.estimated_price * deal.estimated_commission_pct;
}

/** Compute weighted GCI for a pipeline deal */
export function computeWeightedGCI(deal: PipelineDeal): number {
  return computeEstimatedGCI(deal) * computeProbability(deal);
}

/** Get agent percentage from split preset */
export function getAgentPct(preset: SplitPreset): number {
  return SPLIT_PRESET_AGENT_PCT[preset];
}

/** Get brokerage percentage from split preset */
export function getBrokeragePct(preset: SplitPreset): number {
  return 1 - SPLIT_PRESET_AGENT_PCT[preset];
}

/** Compute transaction fees capped at annual max (mirrors iOS txFees) */
export function computeTxFees(totalGCI: number, rateDecimal: number, annualCap: number): number {
  const raw = totalGCI * rateDecimal;
  return annualCap > 0 ? Math.min(raw, annualCap) : raw;
}

/** Compute agent gross from splits with cap logic (mirrors iOS agentGrossFromSplits) */
export function computeAgentGross(
  totalGCI: number,
  preset: SplitPreset,
  postCapThreshold: number,
  postCapAgentPct: number,
  _postCapBrokeragePct?: number,
): { agentGross: number; brokerageTake: number } {
  const agentPct = getAgentPct(preset);
  const brokeragePct = getBrokeragePct(preset);

  if (postCapThreshold > 0 && totalGCI > postCapThreshold) {
    const preCap = postCapThreshold * agentPct;
    const postCap = (totalGCI - postCapThreshold) * postCapAgentPct;
    const agentGross = preCap + postCap;
    return { agentGross, brokerageTake: totalGCI - agentGross };
  }

  const agentGross = totalGCI * agentPct;
  return { agentGross, brokerageTake: totalGCI * brokeragePct };
}
