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

export type PipelineStage = "lead" | "showing" | "offer" | "conditional" | "firm" | "closed";

export const PIPELINE_STAGE_DEFAULTS: Record<PipelineStage, number> = {
  lead: 0.1,
  showing: 0.25,
  offer: 0.5,
  conditional: 0.75,
  firm: 0.9,
  closed: 1.0,
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

/**
 * Consumer rates including PST — NOT for real estate commission tax calculations.
 * Use gstHstRate() from canadian-tax-engine.ts for commissions.
 */
export const PROVINCE_CONSUMER_TAX_RATES: Record<Province, number> = {
  alberta: 0.05,
  britishColumbia: 0.12,
  manitoba: 0.12,
  newBrunswick: 0.15,
  newfoundland: 0.15,
  northwestTerritories: 0.05,
  novaScotia: 0.14, // reduced from 15% Apr 1, 2025 (CRA Notice 342)
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

// ── AI Voice Profile Types ───────────────────────────────────────────────────

export interface CommunicationProfile {
  completed: boolean;
  answers: Record<string, string[]>; // q1: ["A","C"], q2: ["B","E"], etc.
  derived: {
    voice_traits: string[];
    humor_level: "none" | "light" | "moderate" | "frequent";
    directness: "low" | "medium" | "high";
    verbosity: "concise" | "balanced" | "thorough";
    archetype: string[];
    sign_off_style: string;
    avoids: string[];
  };
  ai_voice_summary: string; // human-readable summary sent to Groq
}

export interface BusinessIdentity {
  completed: boolean;
  specialty: string[]; // "buyer", "listing", "both"
  market_type: string[]; // "urban_condo", "suburban", "rural", "luxury", "new_construction"
  business_model: string; // "solo_agent", "team_lead", "team_member"
  lead_sources: string[]; // "referrals", "sphere", "cold_outreach", "social", "farming"
  years_experience: string; // "0_2", "3_5", "5_10", "10_plus"
  avg_price_range: string; // "under_300k", "300_500k", "500_800k", "800k_1m", "over_1m"
}

export interface AgentGoals {
  completed: boolean;
  primary_goal: string; // "grow_volume", "grow_margins", "build_referral_base", "work_less", "build_team"
  secondary_goals: string[];
  signature_phrases: string; // free text
  hard_nogos: string; // free text
  suppressed_topics: string[]; // "tax_advice", "pricing", "crm_health", "business_growth"
}

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
  estimated_weekly_hours: number | null;
  vacation_weeks_per_year: number | null;

  // Profile display
  display_name: string;
  brokerage_name: string;
  phone: string; // canonical agent phone — pre-fills Open House Setup, Showings Ledger, etc.
  color_theme: string; // 'blue' | 'violet' | 'emerald' | 'orange' | 'rose'

  // Profile media (Supabase Storage — profile-media bucket)
  avatar_url: string;        // public URL of the agent profile photo
  business_logo_url: string; // public URL of the business / brokerage logo
  agent_cutout_url: string;  // public URL of transparent PNG cutout for social slides

  // Business identity
  business_name: string;   // trade name or team name (e.g. "The Smith Group")
  business_number: string; // GST/HST registration number for CRA claiming

  // Social media profile URLs (synced from iOS ProfileView)
  social_instagram: string;
  social_facebook:  string;
  social_linkedin:  string;
  social_tiktok:    string;
  social_youtube:   string;

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

  // Local market board (reserved — market data layer currently disabled)
  board_code:          string;       // board slug (e.g. 'nbreb', 'treb') — '' = not set

  board_subregion:     string;       // Optional sub-region within board (e.g. 'Saint John') — '' = board total

  // Business structure
  is_incorporated:     boolean;      // true = PREC or general corp
  corp_type:           string | null; // 'prec' | 'general' | null
  compensation_method: string;        // 'salary' | 'dividends' | 'mixed'
  has_employees:       boolean;       // unlocks Payroll & HR expense category
  num_employees:       number;        // approximate headcount

  // Tax optimization
  tax_opt_dismissed: string[];       // IDs of dismissed/acted-on tax optimization cards

  // Flight Control email signature (migration 00039)
  email_signature: string;           // free-form multi-line signature block

  // AI Voice Guide (migration 00046) — personal writing style for AI outreach drafts
  ai_voice_guide: string | null;

  // AI Voice Profile (migration 00052)
  communication_profile: CommunicationProfile | null;
  business_identity: BusinessIdentity | null;
  agent_goals: AgentGoals | null;
  ai_profile_prompt_dismissed_at: string | null;

  // Tax filing
  filing_frequency: 'monthly' | 'quarterly' | 'annual';
  fiscal_year_end_month: number; // 1-12
  brokerage_withholds_hst: boolean; // brokerage holds HST and remits to CRA

  // Timestamps
  created_at: string;
  updated_at: string;
}

// ── Recurring Expense ──────────────────────────────────────────────────────

export type RecurringFrequency = 'monthly' | 'quarterly' | 'annual';

export interface RecurringExpense {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  category_key: string;
  frequency: RecurringFrequency;
  day_of_month: number;       // 1-28
  month_of_year: number | null; // 1-12 for annual; starting quarter month for quarterly
  hst_included: boolean;
  hst_amount: number;
  vehicle_pct_applicable: boolean;
  notes: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecurringExpenseEntry {
  id: string;
  recurring_expense_id: string;
  user_id: string;
  receipt_expense_id: string | null;
  entry_date: string;
  amount: number;
  status: 'generated' | 'confirmed' | 'skipped';
  created_at: string;
}

// ── Filing Period Helpers ──────────────────────────────────────────────────

export type FilingFrequency = 'monthly' | 'quarterly' | 'annual';

export interface FilingPeriod {
  label: string;         // e.g. "Q1 2026", "Jan 2026", "2026"
  startDate: string;     // ISO date
  endDate: string;       // ISO date
  deadline: string;      // ISO date — CRA filing deadline
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

  pipeline_deal_id: string | null;  // FK to pipeline_deals for accuracy tracking

  // Import provenance + edit protection (migration 00121)
  // import_external_id: stable natural-key fingerprint set on imported rows;
  //                     NULL for manual entries. Used to UPSERT on re-import.
  // edited_at:          timestamp of the most recent manual edit. NULL = untouched
  //                     since import. Reimports skip rows with edited_at IS NOT NULL.
  import_external_id?: string | null;
  edited_at?: string | null;

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
  client_id: string | null;                // FK to clients table
  original_estimated_price: number | null;  // snapshot at creation for accuracy tracking

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
export type LeadSource =
  // Personal network
  | "SOI"
  | "Referral — Past Client"
  | "Referral — Agent"
  | "Referral — General"
  // Portals
  | "Realtor.ca"
  | "Zillow"
  | "Zolo"
  | "HouseSigma"
  | "Point2 Homes"
  // Brokerages
  | "Royal LePage"
  | "RE/MAX"
  | "EXIT Realty"
  | "Century 21"
  | "REAL Broker"
  | "eXp Realty"
  | "Keller Williams"
  | "Brokerage Website"
  // Events & outreach
  | "Open House"
  | "Door Knocking"
  | "Direct Mail"
  | "Sphere Event"
  // Digital
  | "Social Media"
  | "Google Ads"
  | "Facebook Ads"
  | "YouTube"
  | "TikTok"
  | "Podcast / Media"
  | "Cold Call"
  | "Other";

// ── Client Flight Status (aviation-themed pipeline stages, migration 00102) ──
// Collapsed from 6 stages to 4 in migration 00102.
// taxiing/approach/landed removed — "landed" is now a celebration moment, not a
// status (post-close → cruising immediately). "scheduled" added for future-intent
// clients with a target date or vague phrase like "after the holidays".
export type ClientStatus = "boarding" | "scheduled" | "in_flight" | "cruising";

// ── Client Archive Reason (migration 00037) ───────────────────────────────────
export type ArchiveReason = "deceased" | "moved_away" | "do_not_contact" | "other";

// ── Property Use (migration 00043) ────────────────────────────────────────────
export type PropertyUse = "primary_residence" | "investment" | "commercial" | "pre_construction";

export const PROPERTY_USE_LABELS: Record<PropertyUse, string> = {
  primary_residence: "Primary Residence",
  investment:        "Investment / Rental",
  commercial:        "Commercial",
  pre_construction:  "Pre-Construction",
};

// ── Client Communication Tone (migration 00041) ─────────────────────────────
export type CommunicationTone = "casual" | "friendly" | "professional" | "formal";

export const COMMUNICATION_TONE_LABELS: Record<CommunicationTone, string> = {
  casual:       "Casual",
  friendly:     "Friendly",
  professional: "Professional",
  formal:       "Formal",
};

export const COMMUNICATION_TONE_DESCRIPTIONS: Record<CommunicationTone, string> = {
  casual:       "Close friend — first names, slang okay",
  friendly:     "Warm & personal — default tone",
  professional: "Business-appropriate — polished",
  formal:       "Investor/VIP — respectful & precise",
};

// ── AI Flight Control — outreach queue (migration 00038) ──────────────────────
export type OutreachOpportunityType =
  // Phase A (live)
  | "closing_anniversary"
  | "idle_client"
  | "birthday"
  // Batch 1: Post-Close Nurture
  | "post_close_3"
  | "post_close_14"
  | "post_close_90"
  | "review_request"
  | "referral_ask"
  // Batch 2: Relationship Milestones
  | "new_client_welcome"
  | "contact_anniversary"
  | "multi_deal_milestone"
  // Batch 3: Seasonal
  | "seasonal_spring"
  | "seasonal_fall"
  | "seasonal_yearend"
  | "seasonal_tax"
  // Batch 4: Intelligent Outreach (briefing-triggered, one-click from Today's Briefing)
  | "mortgage_renewal_due"      // 5-yr term expiring within ~6 months — contact before the bank does
  | "mortgage_renewal_window"   // 3–4.5 yrs post-close — plant the seed for upcoming renewal
  | "past_client_check_in"      // landed/cruising client, 180+ days no contact
  | "timeframe_approaching"     // active buyer/seller reaching their stated deadline
  | "property_value_milestone"  // notable round-year anniversary (1,3,5,10yr) — offer CMA
  // Batch 5: Memory-Powered Triggers (driven by client_memory_profiles)
  | "pain_point_inactive"       // Known concern + idle — re-open with empathy
  | "buyer_inventory_match"     // Active buyer matching new listings in target area
  | "seller_timing_hesitation"  // Seller with timing objection — gentle nudge
  | "mortgage_renewal_finance"  // Mortgage context surfaced in memory + finance-relevant timing
  | "educational_value_inactive"// Idle client + known topic of interest — value-add touchpoint
  | "condition_firming"         // Pipeline deal moving from conditional to firm
  | "scheduled_date_approaching"; // Client in Scheduled stage, future-intent date approaching (within 30d)
export type OutreachStatus          = "draft" | "ready" | "sent" | "skipped";

export interface OutreachQueueItem {
  id:               string;
  user_id:          string;
  client_id:        string | null;
  client_record_id: string | null;
  opportunity_type: OutreachOpportunityType;
  trigger_date:     string;                  // ISO date
  context:          Record<string, unknown>;
  status:           OutreachStatus;
  ai_subject:       string | null;
  ai_body:          string | null;
  final_subject:    string | null;
  final_body:       string | null;
  sent_at:          string | null;
  created_at:       string;
  updated_at:       string;
}

/** Top Opportunities — structured insight card for the Business Brain. */
export interface AgentState {
  pipeline_status: "empty" | "light" | "healthy";
  pace_status:     "behind" | "on_track" | "ahead";
  urgency_level:   "critical" | "high" | "moderate" | "low";
}

export interface TopOpportunity {
  client_id:         string;
  client_name:       string;
  client_city:       string | null;
  opportunity_type:  OutreachOpportunityType;
  trigger_date:      string;
  score:             number;
  label:             string;           // e.g. "High-value past client · no contact in 14 months"
  why_this_matters:  string;           // human explanation of relationship value
  why_now:           string;           // timing justification
  suggested_angle:   string;           // practical approach recommendation
  context_level:     "sensitive" | "sparse" | "rich";
  client_record_id:  string | null;
  context:           Record<string, unknown>; // pass-through for optional drafting
  financial_impact:  string;                  // 1-2 sentence business impact explanation
  is_primary:        boolean;                 // true for exactly ONE opportunity — "start here"
  primary_reason:    string | null;           // why this is the best use of time right now (primary only)
  risk_if_ignored:   string | null;           // consequence of inaction (required for primary, optional for secondary)
  agent_state?:      AgentState;              // runtime-computed snapshot of where the agent stands right now
}

export interface EmailConnection {
  id:            string;
  user_id:       string;
  provider:      "gmail" | "outlook";
  email_address: string;
  display_name:  string | null;
  connected_at:  string;
}

// AI Property Showings Ledger — migration 00040
export type PropertyType = "detached" | "semi" | "townhouse" | "condo" | "other";
export type AnalysisSourceType = "mls_cutsheet" | "screenshot" | "manual";

export interface PropertyShowing {
  id:                string;
  user_id:           string;
  client_id:         string;
  property_address:  string;
  city:              string | null;
  province_region:   string | null;
  postal_code:       string | null;
  mls_number:        string | null;
  listing_price:     number | null;
  property_type:     PropertyType | null;
  bedrooms:          number | null;
  bathrooms:         number | null;
  square_feet:       number | null;
  lot_size:          string | null;
  year_built:        number | null;
  showing_date:      string;
  client_rating:     number | null; // 1–5
  notes:             string | null;
  realtor_ca_url:    string | null;
  screenshot_url:    string | null;
  extracted_data:    Record<string, unknown>;
  created_at:        string;
  updated_at:        string;
}

export interface PropertyAnalysis {
  id:             string;
  user_id:        string;
  client_id:      string | null;
  showing_id:     string | null;
  source_type:    AnalysisSourceType;
  source_url:     string | null;
  property_data:  Record<string, unknown>;
  ai_analysis: {
    pricing_assessment?: string;
    offer_strategy?:     string;
    leverage_tips?:      string[];
    market_comparison?:  string;
    risk_factors?:       string[];
    summary?:            string;
  };
  created_at:     string;
}

export interface BuyerDNA {
  preferred_type:      string;       // most common property type
  avg_price:           number;
  price_range:         [number, number];
  avg_bedrooms:        number;
  avg_bathrooms:       number;
  avg_sqft:            number;
  preferred_areas:     string[];     // most common cities/neighbourhoods
  budget_drift:        "stable" | "increasing" | "decreasing";
  viewing_velocity:    number;       // showings per week
  top_rated_features:  string[];     // from notes + ratings
  total_showings:      number;
  date_range:          [string, string]; // first → most recent showing
  ai_summary:          string;       // Groq-generated narrative
}

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  boarding:  "Boarding",
  scheduled: "Scheduled",
  in_flight: "In-Flight",
  cruising:  "Cruising",
};

export const CLIENT_STATUS_DESCRIPTIONS: Record<ClientStatus, string> = {
  boarding:  "New or active lead — not yet under contract",
  scheduled: "Plans to act later — target date or phrase captured",
  in_flight: "Under contract — offer made, conditional, or firm",
  cruising:  "Past client / long-term nurture — seasonal check-ins",
};

// ── Flight status colour arc ───────────────────────────────────────────────
// Stages (4-stage model, migration 00102):
//   boarding → scheduled → in_flight → cruising
// Colour logic:
//   sky (active prospect) → slate (parked/future) → violet (under contract) → blue (settled)
//
// Constraints (from colour system rules):
//   • Amber is globally reserved for WARNING signals — never used for lifecycle stages
//   • Orange is globally reserved for URGENCY/CRITICAL alerts — never used for stages
//   • Violet signals "in the air" — mid-transaction commitment
export const CLIENT_STATUS_COLORS: Record<ClientStatus, { bg: string; text: string; border: string; dot: string }> = {
  boarding:  { bg: "bg-sky-50",    text: "text-sky-700",    border: "border-sky-200",    dot: "bg-sky-400"    },
  scheduled: { bg: "bg-slate-100", text: "text-slate-600",  border: "border-slate-200",  dot: "bg-slate-400"  },
  in_flight: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-400" },
  cruising:  { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   dot: "bg-blue-400"   },
};

// Defensive fallback styling for any status that slipped past the 4-stage
// CHECK constraint (legacy row in a self-hosted env, future stage added).
const UNKNOWN_STATUS_COLORS = {
  bg: "bg-zinc-50", text: "text-zinc-600", border: "border-zinc-200", dot: "bg-zinc-400",
} as const;

/**
 * Render a client status as a human label. Unknown values fall back to
 * "Unknown" rather than rendering blank — the DB CHECK constraint should
 * prevent this in production, but old/migrated/imported rows can drift.
 */
export function getClientStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return CLIENT_STATUS_LABELS[status as ClientStatus] ?? "Unknown";
}

/**
 * Render-safe client status colours. Same fallback contract as the label
 * helper — never returns undefined.
 */
export function getClientStatusColors(status: string | null | undefined) {
  if (!status) return UNKNOWN_STATUS_COLORS;
  return CLIENT_STATUS_COLORS[status as ClientStatus] ?? UNKNOWN_STATUS_COLORS;
}

// ── Listing Appointment Status (migration 00048) ─────────────────────────────
export type ListingStatus = "scheduled" | "active" | "sold" | "expired" | "withdrawn" | "lost";

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  scheduled: "Scheduled",
  active:    "Active Listing",
  sold:      "Sold",
  expired:   "Expired",
  withdrawn: "Withdrawn",
  lost:      "Lost Listing",
};

export interface ListingAppointment {
  id:                   string;
  user_id:              string;
  client_id:            string | null;
  appointment_date:     string;        // ISO date "YYYY-MM-DD"
  property_address:     string | null;
  estimated_list_price: number | null; // agent's estimate at appointment time
  actual_list_price:    number | null; // what it listed for
  actual_sale_price:    number | null; // what it sold for
  status:               string;        // ListingStatus value
  estimated_commission_pct: number | null; // agent's expected commission rate
  expected_close_date:      string | null; // when the agent expects the listing to sell
  listing_agreement_date:   string | null; // when the listing agreement was signed
  notes:                string | null;
  created_at:           string;
  updated_at:           string;
}

// ── Buyer Financing Type (migration 00049) ───────────────────────────────────
export type BuyerFinancingType = "mortgage" | "cash" | "bridge" | "unknown";

export const BUYER_FINANCING_LABELS: Record<BuyerFinancingType, string> = {
  mortgage: "Mortgage",
  cash:     "Cash",
  bridge:   "Bridge",
  unknown:  "TBD",
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
  referrer: "They Referred Someone",
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

export interface ClientNote {
  id:         string;
  user_id:    string;
  client_id:  string;
  content:    string;
  created_at: string;
}

// ── Client identity (master record, one per unique client per agent) ──────────
export interface Client {
  id: string;
  user_id: string;

  name: string;
  name_search: string;   // lower(trim(name)) — for dedup matching
  first_name: string | null;
  last_name:  string | null;

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
  // Full address (migration 00029)
  street_address:         string | null;
  unit_number:            string | null;
  postal_code:            string | null;
  country:                string;          // defaults to "Canada"
  phone_type:             PhoneType;
  secondary_email:        string | null;
  secondary_phone:        string | null;
  secondary_phone_type:   PhoneType;
  property_interest:      number | null;
  property_interest_type: PropertyInterestType;
  timeframe:              string | null;   // ClientTimeframe value
  preferred_contact:      PreferredContact;

  // Speed to Lead (migration 00028)
  first_contacted_at: string | null;

  // Archive (migration 00037)
  archived_at:    string | null;   // TIMESTAMPTZ — null = active
  archive_reason: ArchiveReason | null;

  // Communication tone for AI Flight Control (migration 00041)
  communication_tone: CommunicationTone;

  // Buyer profile (migration 00049)
  buyer_pre_approved:        boolean | null;
  buyer_pre_approval_amount: number | null;
  buyer_financing_type:      string | null;  // BuyerFinancingType value
  buyer_target_close_date:   string | null;  // ISO date
  buyer_target_area:         string | null;  // Where buyer is looking (city/neighbourhood)

  // CSV import tracking (migration 00054)
  imported_at: string | null;  // set when created via bulk CSV import; null = manually added

  // Scheduled stage (migration 00102)
  scheduled_for:    string | null;  // ISO date — future date client plans to act
  scheduled_phrase: string | null;  // vague phrase ("after the holidays", "next spring")

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
  trigger_tag:    string | null;   // only fire if client has this tag (migration 00044)
  is_active: boolean;
  is_system:  boolean;             // true = pre-loaded default (migration 00044)
  system_key: string | null;       // stable key for idempotent seeding (migration 00044)
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

// ── Tag System ───────────────────────────────────────────────────────────────

export interface TagCategory {
  category: string;
  tags: string[];
}

export const PREDEFINED_TAGS: TagCategory[] = [
  {
    category: "Lead Type / Motivation",
    tags: ["Buyer", "Seller", "Investor", "First-Time Buyer", "Relocation", "Renter", "Cash Buyer", "Luxury"],
  },
  {
    category: "Property Interest",
    tags: ["Pool", "Waterfront", "Fixer-Upper", "New Construction"],
  },
  {
    category: "Lead Source & Marketing",
    tags: ["Open House", "Sign Call", "Referral", "Facebook Lead", "Podcast Listener"],
  },
  {
    category: "Status & Priority",
    tags: ["VIP", "High Value", "Nurture", `Closed ${new Date().getFullYear()}`, "Out of Area"],
  },
  {
    category: "Action / Restriction",
    tags: ["Do Not Call", "Do Not Text", "Attorney", "Lender"],
  },
];

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

  // Property use for AI post-close context (migration 00043)
  property_use: PropertyUse | null;

  // Property specs (migration 00075)
  bedrooms:     number | null;
  bathrooms:    number | null;
  garage:       boolean | null;
  lot_acres:    number | null;
  waterfront:   boolean | null;
  square_feet:  number | null;

  // MLS / listing URL (migration 00075)
  listing_url:  string | null;

  // Condition tracking (migration 00075)
  condition_date:   string | null;  // ISO date
  condition_status: "pending" | "waived" | "firmed" | "collapsed" | null;

  // Import provenance + edit protection (migration 00121)
  // See Transaction.import_external_id / edited_at for semantics.
  import_external_id?: string | null;
  edited_at?: string | null;

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
  error_code:       string | null;
  error_message:    string | null;
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
  // Guard against unknown stage values from DB (would otherwise return undefined → NaN in weightedGCI)
  return PIPELINE_STAGE_DEFAULTS[deal.stage] ?? PIPELINE_STAGE_DEFAULTS.lead;
}

/** Compute estimated GCI for a pipeline deal */
export function computeEstimatedGCI(deal: PipelineDeal): number {
  return (deal.estimated_price ?? 0) * (deal.estimated_commission_pct ?? 0);
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

// ── Newsletter Queue (migration 00042) ────────────────────────────────────────

/** Which AI template produced the newsletter */
export type NewsletterTemplateType = "boc_rate_change" | "custom";

export type NewsletterStatus = "draft" | "ready" | "sent";

export interface NewsletterQueue {
  id:             string;
  user_id:        string;

  template_type:  NewsletterTemplateType;
  context:        Record<string, unknown>;   // template-specific data (rates, stats, topic…)

  status:         NewsletterStatus;

  ai_subject:     string | null;
  ai_body:        string | null;
  final_subject:  string | null;
  final_body:     string | null;

  /** empty array = all active clients; otherwise filter by tag value */
  recipient_tags: string[];

  sent_at:        string | null;
  created_at:     string;
  updated_at:     string;
}

// ── Policy Acceptances (migration 00124) ────────────────────────────────────
// Append-only audit log of each user's acceptance of a specific policy
// version. Drives the in-app PolicyUpdateBanner. See lib/policy-versions.ts
// for the canonical version list and the accept-policies API route for
// upsert semantics.

export type PolicyAcceptanceType =
  | "terms"
  | "privacy"
  | "acceptable_use"
  | "cookie";

export type PolicyAcceptanceContext =
  | "signup"
  | "policy_update_banner"
  | "backfill";

export interface PolicyAcceptance {
  id:                 string;
  user_id:            string;
  policy_type:        PolicyAcceptanceType;
  version:            string;                       // YYYY-MM-DD
  accepted_at:        string;                       // ISO timestamp
  acceptance_context: PolicyAcceptanceContext;
  ip_address:         string | null;
  user_agent:         string | null;
  created_at:         string;
}

// ── Director Cockpit (corp_* tables, migration 00132) ──────────────────────
// Internal-only operator surface for AR Inc. Distinct from realtor expense
// data — schema isolation prevents corporate rows leaking into realtor
// metric engines. See:
//   apps/web/supabase/migrations/00132_corp_director_cockpit.sql
//   memory/findings/spec_corp_director_cockpit_phase0_artifacts_2026-05-05.md

export type CorpAccountType =
  | "revenue"
  | "cogs"
  | "opex"
  | "equity"
  | "liability"
  | "tax"
  | "asset";

export type CorpSourceChannel =
  | "receipt_upload"
  | "mobile_photo"
  | "email_inbound"
  | "qbo"
  | "manual"
  | "stripe"
  | "bank_csv";

export type CorpSredCategory =
  | "overhead"
  | "direct_labour"
  | "materials"
  | "contractor";

export interface CorpChartOfAccount {
  account_code: string;        // text PK (e.g. "4000", "5010")
  name:         string;
  type:         CorpAccountType;
  notes:        string | null;
  created_at:   string;
}

export interface CorpVendor {
  id:                   string;
  user_id:              string;

  name:                 string;
  regex_pattern:        string;
  default_account_code: string | null;
  sred_eligible:        boolean;
  sred_category:        CorpSredCategory | null;
  corp_pct:             number;
  notes:                string | null;

  created_at:           string;
  updated_at:           string;
}

export interface CorpVendorAllocation {
  id:              string;
  user_id:         string;
  vendor_id:       string;

  corp_pct:        number;
  personal_pct:    number;
  rationale_text:  string | null;
  set_by:          string | null;
  effective_from:  string | null;  // ISO date

  created_at:      string;
  updated_at:      string;
}

export interface CorpTransaction {
  id:                    string;
  user_id:               string;

  date:                  string;                   // ISO date
  amount_pretax:         number;
  gst_hst:               number;
  amount_total:          number;
  currency:              string;                   // 'CAD' default
  fx_rate:               number | null;

  vendor_id:             string | null;
  vendor_name_raw:       string | null;

  account_code:          string | null;
  account_type:          CorpAccountType | null;

  description:           string | null;
  source_channel:        CorpSourceChannel;
  source_ref:            string | null;
  receipt_storage_path:  string | null;

  corp_pct:              number;
  sred_eligible:         boolean;
  sred_category:         CorpSredCategory | null;

  pre_incorp_flag:       boolean;
  incurred_date:         string | null;            // ISO date

  parent_transaction_id: string | null;
  needs_review:          boolean;
  review_reason:         string | null;

  ingested_by_user_id:   string | null;
  ingested_at:           string;                   // ISO timestamp
  posted_at:             string | null;            // ISO timestamp

  notes:                 string | null;

  created_at:            string;
  updated_at:            string;
}

// Manual cash-position snapshots (migration 00135). No bank-feed integration
// in Phase 1; Andrew posts each observation by hand. Latest by `as_of_date`
// is the displayed Snapshot value.
export interface CorpCashSnapshot {
  id:           string;
  user_id:      string;

  as_of_date:   string;          // ISO date
  amount_cad:   number;
  source_label: string | null;   // e.g. "RBC Business chequing"
  notes:        string | null;

  created_at:   string;
  updated_at:   string;
}

export type CorpInboxSeverity = "low" | "medium" | "high";

export type CorpInboxSource =
  | "manual"
  | "hugo"
  | "allocation-ui"
  | "pre-incorp-ui"
  | "founder-comp"
  | "director-persona"
  | "marcus";

export interface CorpInboxItem {
  id:            string;
  user_id:       string;

  title:         string;
  body:          string | null;

  source:        CorpInboxSource | string; // string allows future sources without migration
  source_ref_id: string | null;
  severity:      CorpInboxSeverity;

  resolved_at:   string | null; // ISO timestamptz
  resolved_note: string | null;

  created_at:    string;
  updated_at:    string;
}


export type CorpBriefPriority = "low" | "medium" | "high";

export type CorpBriefSource =
  | "hugo-bookkeeping"
  | "vera-monthly-cash"
  | "quinn-quarterly-hst"
  | "tessa-annual-t2"
  | "marcus-sred"
  | "main-session"
  | "manual";

export interface CorpBriefEntry {
  id:           string;
  user_id:      string;

  brief_date:   string; // ISO date YYYY-MM-DD
  source:       CorpBriefSource | string;
  title:        string;
  content_md:   string | null;

  des_priority: CorpBriefPriority;

  created_at:   string;
}


// ── Director Cockpit: corp_compliance_events (Phase 2 / Build #8) ───────────

export type CorpComplianceSeverity = "low" | "medium" | "high";

export type CorpComplianceRecurringPattern =
  | "annual"
  | "quarterly"
  | "monthly"
  | "fiscal-anniversary";

export type CorpComplianceKind =
  | "cra-t2-filing"
  | "cra-t2-payment"
  | "cra-hst-filing"
  | "cra-hst-instalment"
  | "cra-payroll-t4"
  | "cra-payroll-source-deductions"
  | "corp-annual-return-federal"
  | "corp-annual-return-nb"
  | "corp-minute-book"
  | "corp-insurance-renewal"
  | "corp-other";

/** Urgency tier surfaced by v_corp_upcoming_compliance. */
export type CorpComplianceUrgency =
  | "overdue"
  | "critical"
  | "soon"
  | "upcoming";

export interface CorpComplianceEvent {
  id:                string;
  user_id:           string;

  title:             string;
  kind:              CorpComplianceKind | string;

  due_date:          string; // ISO date YYYY-MM-DD
  severity:          CorpComplianceSeverity;

  recurring_pattern: CorpComplianceRecurringPattern | null;

  source_ref_id:     string | null;
  notes:             string | null;

  completed_at:      string | null;
  completed_note:    string | null;

  created_at:        string;
  updated_at:        string;
}

/** Row shape returned by v_corp_upcoming_compliance. */
export interface CorpUpcomingComplianceRow {
  id:                string;
  user_id:           string;
  title:             string;
  kind:              CorpComplianceKind | string;
  due_date:          string;
  severity:          CorpComplianceSeverity;
  recurring_pattern: CorpComplianceRecurringPattern | null;
  notes:             string | null;
  completed_at:      string | null;
  created_at:        string;

  /** PostgreSQL `(due_date - CURRENT_DATE)` interval in days. */
  days_until_due:    number;
  urgency:           CorpComplianceUrgency;
}


// ── Director Cockpit: corp_bank_reconciliation (Phase 2 / Build #9) ─────────

export type CorpBankLineMatchStatus = "unmatched" | "matched" | "manual" | "split";
export type CorpBankLineMatchMethod = "auto-exact" | "auto-window" | "manual";

export interface CorpBankStatement {
  id:              string;
  user_id:         string;

  bank_name:       string;           // e.g. 'RBC Business Chequing'
  account_label:   string | null;    // e.g. '****1234'
  period_start:    string;           // ISO date
  period_end:      string;           // ISO date

  raw_filename:    string | null;
  row_count:       number;
  matched_count:   number;
  manual_count:    number;
  unmatched_count: number;

  uploaded_at:     string;
  created_at:      string;
  updated_at:      string;
}

export interface CorpBankLine {
  id:               string;
  user_id:          string;
  statement_id:     string;

  line_date:        string;                       // ISO date
  description_raw:  string;
  /** Signed: negative = debit (money out), positive = credit (money in). */
  amount_cad:       number;
  balance_cad:      number | null;

  match_status:     CorpBankLineMatchStatus;
  matched_tx_id:    string | null;
  match_method:     CorpBankLineMatchMethod | null;
  match_confidence: number | null;                // 0.000 – 1.000

  skip_reason:      string | null;
  notes:            string | null;

  created_at:       string;
  updated_at:       string;
}

/** Row shape returned by v_corp_bank_reconciliation_summary. */
export interface CorpBankReconciliationSummaryRow {
  statement_id:    string;
  user_id:         string;
  bank_name:       string;
  account_label:   string | null;
  period_start:    string;
  period_end:      string;
  raw_filename:    string | null;
  row_count:       number;
  matched_count:   number;
  manual_count:    number;
  unmatched_count: number;
  match_rate_pct:  number | null;
  uploaded_at:     string;
  period_days:     number;
}

// ── Corp documents ────────────────────────────────────────────────────────────

export type CorpDocumentType =
  | "minutes"
  | "resolution"
  | "contract"
  | "correspondence"
  | "other";

export interface CorpDocument {
  id:               string;
  user_id:          string;
  document_type:    CorpDocumentType;
  title:            string;
  description:      string | null;
  document_date:    string;
  fiscal_year:      number;
  storage_path:     string;
  file_name:        string;
  file_size_bytes:  number | null;
  mime_type:        string | null;
  created_at:       string;
  updated_at:       string;
}

// ── Corp resolutions / minute book — migration 00147 ────────────────────────
// Internal Director Cockpit only. Auto-numbered {year}-DR-{NNN} by DB trigger.
export type CorpResolutionType =
  | "salary_election"
  | "dividend_declaration"
  | "banking_authority"
  | "officer_appointment"
  | "agm_waiver"
  | "general";

export type CorpResolutionStatus = "draft" | "passed";

export interface CorpResolution {
  id:                string;
  user_id:           string;
  resolution_number: string;
  resolution_type:   CorpResolutionType;
  subject:           string;
  body_md:           string;
  passed_date:       string;
  fiscal_year:       number;
  status:            CorpResolutionStatus;
  is_unanimous:      boolean;
  created_at:        string;
  updated_at:        string;
}

// ── SR&ED daily work-log entries — migration 00148 ──────────────────────────
// Internal Director Cockpit only. One row per work session.
// sred_weight drives eligible-hours calculation for T661.
export type SredWeight = "none" | "low" | "medium" | "high";

/** Weight multipliers applied to hours for T661 eligible-hours quantum. */
export const SRED_WEIGHT_FACTORS: Record<SredWeight, number> = {
  high:   1.00,
  medium: 0.50,
  low:    0.15,
  none:   0.00,
};

export interface CorpSredEntry {
  id:               string;
  user_id:          string;
  entry_date:       string;     // YYYY-MM-DD
  hours:            number;
  work_summary:     string;     // T661 narrative material
  tech_challenges:  string | null;
  sred_note:        string | null;  // weight rationale
  sred_weight:      SredWeight;
  commits_count:    number | null;
  pr_refs:          string | null;  // comma-sep PR references
  created_at:       string;
  updated_at:       string;
}

/** Shape of v_corp_sred_annual_summary rows. */
export interface CorpSredAnnualSummary {
  user_id:       string;
  fiscal_year:   number;
  entry_count:   number;
  total_hours:   number;
  eligible_hours: number;
  high_hours:    number;
  medium_hours:  number;
  low_hours:     number;
  none_hours:    number;
}

// ── Flight Status workflow library — migration 00145 ────────────────────────
// Pre-built email draft sequences keyed to Flight Status transitions.
// System templates have user_id = null and are seeded by the migration.
// Drafts are agent-initiated (manual click in CRM client detail panel) — no
// auto-trigger, no auto-send. Drafts are text the agent reviews and copies
// into their own email client. CASL-clean.
export type WorkflowTriggerEvent =
  | "new_lead"               // Client enters Boarding stage
  | "showing_scheduled"      // Client moves to Scheduled stage
  | "listing_active"         // Seller flow — listing goes live (In-Flight)
  | "transaction_milestone"  // Buyer flow — accepted offer (In-Flight)
  | "anniversary"            // 1+ year after a closed transaction
  | "closing_day";           // Client moves to Cruising — closing imminent

export type WorkflowDraftStatus = "pending" | "sent" | "dismissed";

export interface WorkflowTemplate {
  id:                string;
  user_id:           string | null;        // null = system template (seeded)
  trigger_event:     WorkflowTriggerEvent;
  name:              string;
  subject_template:  string;
  body_prompt:       string;
  is_active:         boolean;
  created_at:        string;
  updated_at:        string;
}

export interface WorkflowDraft {
  id:             string;
  user_id:        string;
  client_id:      string;
  template_id:    string;
  trigger_event:  WorkflowTriggerEvent;
  subject:        string;
  body:           string;
  status:         WorkflowDraftStatus;
  generated_at:   string;
  created_at:     string;
  updated_at:     string;
}

// ── Client Communication Log — migration 00146 ─────────────────────────────
// Per-client conversation timeline. Because email integration is CASA-
// shelved (see memory/project_google_integrations.md), inbound replies
// cannot be auto-ingested. Agents paste inbound text into a "Log reply"
// form, or jot manual notes about phone/text conversations. Combined with
// workflow_drafts (Phase 2.3) and outreach_queue, this assembles a full
// timeline per client without any email integration.
//
// Direction:
//   outbound — agent-sent message logged after the fact via the agent's
//              own external channel (e.g. typed in Gmail, pasted here)
//   inbound  — message the agent received from the client (pasted in)
//   note     — free-form note about phone/in-person/text conversation
export type CommunicationDirection = "outbound" | "inbound" | "note";

export interface ClientCommunicationLog {
  id:           string;
  user_id:      string;
  client_id:    string;
  direction:    CommunicationDirection;
  subject:      string | null;
  body:         string;
  logged_at:    string;       // ISO timestamp; defaults to insert time
  created_at:   string;
  updated_at:   string;
}

// ── Organization types (re-export from dedicated module) ────────────────────
export * from "./organizations";
