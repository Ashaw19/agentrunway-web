// ============================================================================
// Agent Runway — Database Types
// TypeScript types mirroring the Supabase Postgres schema
// ============================================================================

// ── Enums ───────────────────────────────────────────────────────────────────

export type TransactionSide = "buyer" | "seller" | "both";

export type TransactionStatus = "closed" | "pending" | "fallen";

// Phase 1 — Unified Ledger
export type TxDatePrecision = "day" | "month" | "quarter" | "year";
export type TxSource = "manual" | "imported";

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

  // T2125 — Home office
  home_office_method: string;            // 'simplified' | 'detailed'
  home_office_sq_footage: number | null; // for simplified method ($5/sq ft)
  home_office_rent_monthly: number;
  home_office_utilities_monthly: number;
  home_office_property_tax_annual: number;
  home_office_insurance_monthly: number;
  home_office_maintenance_annual: number;
  home_office_condo_fees_monthly: number;

  // T2125 — GST/HST remittance tracking
  gst_hst_registered: boolean;
  gst_hst_remitted_q1: number;
  gst_hst_remitted_q2: number;
  gst_hst_remitted_q3: number;
  gst_hst_remitted_q4: number;
  gst_hst_paid_on_expenses: number;     // ITCs claimable

  // T2125 — Vehicle
  vehicle_type: string;                  // 'own' | 'lease' | 'none'

  // T2125 — CRA tax instalments actually paid
  cpp_instalment_paid_ytd: number;
  tax_instalment_paid_q1: number;
  tax_instalment_paid_q2: number;
  tax_instalment_paid_q3: number;
  tax_instalment_paid_q4: number;

  // Defensibility
  cash_reserve: number;
  experience_years: number | null;

  // Profile display
  display_name: string;
  brokerage_name: string;
  color_theme: string; // 'blue' | 'violet' | 'emerald' | 'orange' | 'rose'

  // Profile media (Supabase Storage — profile-media bucket)
  avatar_url: string;        // public URL of the agent profile photo
  business_logo_url: string; // public URL of the business / brokerage logo
  agent_cutout_url: string;  // public URL of transparent PNG cutout for social slides

  // Business identity
  business_name: string;   // trade name or team name (e.g. "The Smith Group")
  business_number: string; // GST/HST registration number for CRA claiming

  // UI preferences
  dashboard_view: string; // 'essentials' | 'standard' | 'full'

  // Subscription (Stripe)
  subscription_tier: string;              // 'starter' | 'professional' | 'team'
  subscription_status: string;            // 'free' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  stripe_customer_id: string | null;      // cus_...
  stripe_subscription_id: string | null;  // sub_...
  subscription_current_period_end: string | null; // ISO timestamp

  // Admin override
  is_admin: boolean; // founder/admin flag — bypasses all subscription checks

  // Business structure
  is_incorporated:     boolean;      // true = PREC or general corp
  corp_type:           string | null; // 'prec' | 'general' | null
  compensation_method: string;        // 'salary' | 'dividends' | 'mixed'
  has_employees:       boolean;       // unlocks Payroll & HR expense category
  num_employees:       number;        // approximate headcount

  // Tax optimization
  tax_opt_dismissed: string[];       // IDs of dismissed/acted-on tax optimization cards

  // Timestamps
  created_at: string;
  updated_at: string;
}

// ── CCA Asset (T2125 Capital Cost Allowance tracking) ────────────────────────

export interface CcaAsset {
  id: string;
  user_id: string;
  cca_class: number;                // 8, 10, 12, 50, etc.
  class_rate: number;               // 0.20 = 20%
  class_half_year: boolean;         // half-year rule
  description: string;
  acquisition_date: string;
  original_cost: number;
  business_use_pct: number;         // 0.0–1.0
  opening_ucc: number;
  additions_this_year: number;
  disposals_this_year: number;
  cca_claimed_prior: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Common CCA class definitions for the UI picker
export const CCA_CLASSES: { class: number; rate: number; halfYear: boolean; label: string }[] = [
  { class: 8,   rate: 0.20, halfYear: true,  label: "Class 8 — Office furniture & equipment (20%)" },
  { class: 10,  rate: 0.30, halfYear: true,  label: "Class 10 — Motor vehicles (30%)" },
  { class: 10.1, rate: 0.30, halfYear: true, label: "Class 10.1 — Passenger vehicles > $37,000 (30%)" },
  { class: 12,  rate: 1.00, halfYear: true,  label: "Class 12 — Computer software & tools < $500 (100%)" },
  { class: 50,  rate: 0.55, halfYear: true,  label: "Class 50 — Computers & data handling (55%)" },
  { class: 14,  rate: 0,    halfYear: false, label: "Class 14 — Franchise or patent (straight-line)" },
  { class: 43,  rate: 0.30, halfYear: true,  label: "Class 43 — Manufacturing & processing equipment (30%)" },
];

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

  // Phase 1 — Unified Ledger (optional until migration 00011 is applied)
  date_precision?: TxDatePrecision;  // 'day' for manual entries; coarser for imports
  source?: TxSource;                 // 'manual' | 'imported'

  // Per-deal team / referral split (migration 00012)
  // Agent's share of the commission BEFORE the brokerage split is applied.
  // NULL = no team split (agent keeps 100% before brokerage cut).
  // Waterfall: sale_price × commission_pct × team_split_pct × brokerage_split = net
  team_split_pct?: number | null;

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
  split_pct: number | null; // agent's brokerage split this year (e.g. 0.75 = 75/25)

  // Expense + mileage history (migration 00017)
  annual_expenses:       number;  // total annual business expenses
  annual_mileage_km:     number;  // total business km driven
  annual_mileage_deduct: number;  // total mileage deduction claimed

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

// ── Activity / CRM types (migration 00018) ───────────────────────────────────
export type ActivityType = "call" | "email" | "text" | "showing" | "meeting" | "offer" | "note";
export type TaskPriority  = "low" | "normal" | "high";
export type LeadSource    = "SOI" | "Referral" | "Zillow" | "Realtor.ca" | "Open House" | "Social" | "Cold Call" | "Other";

// ── Client Flight Status (aviation-themed pipeline stages, migration 00027) ──
export type ClientStatus = "boarding" | "taxiing" | "in_flight" | "landed" | "cruising";

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  boarding:  "Boarding",
  taxiing:   "Taxiing",
  in_flight: "In-Flight",
  landed:    "Landed",
  cruising:  "Cruising",
};

export const CLIENT_STATUS_DESCRIPTIONS: Record<ClientStatus, string> = {
  boarding:  "New lead or prospect",
  taxiing:   "Actively shopping or preparing",
  in_flight: "Under contract",
  landed:    "Deal closed",
  cruising:  "Past client, nurturing",
};

export const CLIENT_STATUS_COLORS: Record<ClientStatus, { bg: string; text: string; border: string; dot: string }> = {
  boarding:  { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     dot: "bg-sky-400"     },
  taxiing:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-400"   },
  in_flight: { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200",  dot: "bg-violet-400"  },
  landed:    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-400" },
  cruising:  { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-400"    },
};

// ── Phone Type ───────────────────────────────────────────────────────────────
export type PhoneType = "mobile" | "home" | "work" | "other";

export const PHONE_TYPE_LABELS: Record<PhoneType, string> = {
  mobile: "Mobile",
  home:   "Home",
  work:   "Work",
  other:  "Other",
};

// ── Preferred Contact Method ─────────────────────────────────────────────────
export type PreferredContact = "phone" | "email" | "text";

export const PREFERRED_CONTACT_LABELS: Record<PreferredContact, string> = {
  phone: "Phone",
  email: "Email",
  text:  "Text",
};

// ── Property Interest Type ───────────────────────────────────────────────────
export type PropertyInterestType = "budget" | "listing";

export const PROPERTY_INTEREST_TYPE_LABELS: Record<PropertyInterestType, string> = {
  budget:  "Buyer Budget",
  listing: "Listing Price",
};

// ── Client Timeframe ─────────────────────────────────────────────────────────
export type ClientTimeframe = "asap" | "1_3_months" | "3_6_months" | "6_12_months" | "12_plus" | "unknown";

export const CLIENT_TIMEFRAME_LABELS: Record<ClientTimeframe, string> = {
  asap:         "ASAP",
  "1_3_months": "1–3 Months",
  "3_6_months": "3–6 Months",
  "6_12_months":"6–12 Months",
  "12_plus":    "12+ Months",
  unknown:      "Unknown",
};

// ── Relationship Type ────────────────────────────────────────────────────────
export type RelationshipType = "spouse" | "partner" | "parent" | "child" | "referrer" | "referred";

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  spouse:   "Spouse",
  partner:  "Partner",
  parent:   "Parent",
  child:    "Child",
  referrer: "Referrer",
  referred: "Referred By",
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call:    "Phone Call",
  email:   "Email",
  text:    "Text",
  showing: "Showing",
  meeting: "Meeting",
  offer:   "Offer",
  note:    "Note",
};

export const ACTIVITY_TYPE_ICONS: Record<ActivityType, string> = {
  call:    "📞",
  email:   "✉️",
  text:    "💬",
  showing: "🏠",
  meeting: "🤝",
  offer:   "📋",
  note:    "📝",
};

export interface ContactActivity {
  id:            string;
  user_id:       string;
  client_id:     string;
  type:          ActivityType;
  description:   string;
  activity_date: string;   // ISO timestamptz
  created_at:    string;
}

export interface ContactTask {
  id:           string;
  user_id:      string;
  client_id:    string | null;
  title:        string;
  due_date:     string;   // ISO date
  priority:     TaskPriority;
  notes:        string | null;
  completed_at: string | null;  // null = pending
  created_at:   string;
  updated_at:   string;
}

// ── Client identity (master record, one per unique client per agent) ──────────
export interface Client {
  id: string;
  user_id: string;

  name: string;
  name_search: string;   // lower(trim(name)) — for dedup matching

  // Contact info
  email:    string | null;
  phone:    string | null;

  // CRM fields (migration 00018)
  birthdate:       string | null;  // ISO date — for anniversary alerts
  tags:            string[];       // e.g. ["VIP", "Investor", "First-time buyer"]
  lead_source:     string | null;  // LeadSource enum value
  last_contact_at: string | null;  // auto-updated when activity logged
  notes:           string | null;

  // Profile expansion (migration 00027)
  status:                 ClientStatus;
  city:                   string | null;
  province_region:        string | null;
  phone_type:             PhoneType;
  secondary_email:        string | null;
  secondary_phone:        string | null;
  secondary_phone_type:   PhoneType;
  property_interest:      number | null;
  property_interest_type: PropertyInterestType;
  timeframe:              string | null;   // ClientTimeframe value
  preferred_contact:      PreferredContact;

  created_at: string;
  updated_at: string;
}

// ── Client Relationships (migration 00027) ───────────────────────────────────
export interface ClientRelationship {
  id: string;
  user_id: string;
  client_id_a: string;
  client_id_b: string;
  relationship_type: RelationshipType;
  created_at: string;
}

// ── Flight Plans stub (migration 00027 — future automated contact sequences) ─
export interface FlightPlan {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  trigger_status: ClientStatus | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FlightPlanStep {
  id: string;
  flight_plan_id: string;
  step_order: number;
  delay_days: number;
  action_type: "task" | "email" | "text";
  template: string | null;
  created_at: string;
}

export interface ClientRecord {
  id: string;
  user_id: string;

  // FK to clients.id — null for pre-migration records or unmatched imports
  client_id: string | null;

  name: string;
  side: "buyer" | "seller" | "both" | null; // agent's role in the deal
  source: string | null;   // SOI, Agent Referral, Realtor.ca, etc.
  address: string | null;
  close_date: string | null; // ISO date
  year: number | null;
  gci: number;
  notes: string | null;

  created_at: string;
  updated_at: string;
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

// ── Plaid bank sync (migration 00019) ─────────────────────────────────────────

/** One connected bank/card account per row */
export interface PlaidItem {
  id:               string;
  user_id:          string;
  plaid_item_id:    string;
  // NOTE: access_token is intentionally absent from this client-facing type.
  // It is stored server-side only and accessed exclusively via the service-role
  // admin client in API routes (/api/plaid/sync, /api/plaid/disconnect).
  // A Postgres REVOKE SELECT (access_token) prevents the authenticated role
  // from reading it via the Supabase REST/PostgREST API.
  institution_id:   string | null;
  institution_name: string | null;
  sync_cursor:      string | null;
  last_synced_at:   string | null;
  created_at:       string;
  updated_at:       string;
}

export type PlaidReviewStatus = "pending" | "approved" | "ignored";

/** One imported bank/card transaction per row */
export interface PlaidTransaction {
  id:                    string;
  user_id:               string;
  plaid_item_id:         string;  // FK → plaid_items.id
  plaid_transaction_id:  string;
  plaid_account_id:      string | null;
  transaction_date:      string;  // ISO date
  merchant_name:         string | null;
  description:           string;
  amount:                number;  // positive = expense (debit)
  category_key:          string | null;  // maps to expense_items.key
  review_status:         PlaidReviewStatus;
  suggested_category:    string | null;
  suggestion_confidence: number | null;  // 0.0–1.0
  created_at:            string;
  updated_at:            string;
}

// ── Mileage Log ───────────────────────────────────────────────────────────────

/** CRA automobile allowance rates for 2025 */
export const CRA_MILEAGE_RATES = {
  /** $/km for first 5,000 km of business travel */
  first5000:   0.72,
  /** $/km beyond 5,000 km */
  beyond5000:  0.66,
  /** Annual km threshold separating the two rates */
  threshold:   5000,
} as const;

export interface MileageLog {
  id:              string;
  user_id:         string;
  trip_date:       string;       // ISO date YYYY-MM-DD
  description:     string;
  from_location:   string | null;
  to_location:     string | null;
  km:              number;
  cra_rate_per_km: number;
  deduction:       number;       // generated column: km × cra_rate_per_km
  purpose:         string | null;
  notes:           string | null;
  created_at:      string;
  updated_at:      string;
}

// ── Computed Helpers (mirror iOS computed properties) ────────────────────────

/** Compute GCI for a transaction (mirrors iOS Transaction.gci)
 *
 * Waterfall:
 *   1. gci_override set → use directly (user entered their exact net GCI).
 *   2. Otherwise: sale_price × commission_pct × team_split_pct (if set)
 *
 * The brokerage split is NOT applied here — it is applied downstream in
 * computeAgentGross() when computing net income or tax projections.
 *
 * Note: gci_override bypasses the team split intentionally — if a user
 * types in their GCI directly they already know their share of the deal.
 */
export function computeGCI(tx: Transaction): number {
  if (tx.gci_override != null) return tx.gci_override;
  const raw = tx.sale_price * tx.commission_pct;
  return (tx.team_split_pct != null && tx.team_split_pct > 0)
    ? raw * tx.team_split_pct
    : raw;
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
