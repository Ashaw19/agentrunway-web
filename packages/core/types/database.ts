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

// ── Sandbox Mode ──────────────────────────────────────────────────────────────

export type SandboxTier = "building" | "established" | "high_producer";

export const SANDBOX_TIER_LABELS: Record<SandboxTier, string> = {
  building:      "Building (0–8 deals/yr)",
  established:   "Established (8–20 deals/yr)",
  high_producer: "High Producer (20+ deals/yr)",
};

/**
 * Complete fictional-agent dataset stored in user_settings.sandbox_data.
 * Every field mirrors the real data props that DashboardContent receives,
 * so engines can consume sandbox data with zero modifications.
 */
export interface SandboxDataset {
  /** Generated fictional transactions (closed deals, YTD) */
  transactions: Transaction[];
  /** Generated fictional pipeline deals (active) */
  pipelineDeals: PipelineDeal[];
  /** Generated fictional expense categories with items */
  expenseCategories: ExpenseCategoryWithItems[];
  /** Generated fictional historical performance (3 prior years) */
  historyItems: HistoryItem[];
  /** Settings overrides for sandbox (goal_gci, cash_reserve, etc.) */
  settingsOverrides: Partial<UserSettings>;

  // ── Full-App Data (CRM, Overhead, Flight Control, etc.) ────────────────
  /** Fictional CRM clients covering all statuses */
  clients: Client[];
  /** Historical contact activities for each client */
  contactActivities: ContactActivity[];
  /** Open follow-up tasks */
  contactTasks: ContactTask[];
  /** Historical client deal records (linked to history years) */
  clientRecords: ClientRecord[];
  /** Client-to-client relationships (spouse, referrer, etc.) */
  clientRelationships: ClientRelationship[];
  /** CRM flight plans (system templates) */
  flightPlans: FlightPlan[];
  /** Steps for each flight plan */
  flightPlanSteps: FlightPlanStep[];
  /** Property showings for active buyer clients */
  propertyShowings: PropertyShowing[];
  /** Listing appointments for active seller clients */
  listingAppointments: ListingAppointment[];
  /** Outreach queue items (draft/ready) */
  outreachQueue: OutreachQueueItem[];
  /** Newsletter queue items */
  newsletterQueue: NewsletterQueue[];
  /** Mileage logs (YTD trips) */
  mileageLogs: MileageLog[];
  /** CCA capital assets */
  ccaAssets: CcaAsset[];
  /** Receipt expense totals (supplements category expenses) */
  receiptExpenses: { total_amount: number; expense_date: string; category_key: string }[];

  /** Metadata about how the dataset was generated */
  meta: {
    generatedAt: string;      // ISO timestamp
    boardCode: string;        // CREA board used for generation
    boardName: string;        // Human-readable board name
    tier: SandboxTier;        // Production tier selected
    avgBoardPrice: number;    // Board average price used
    dealsPerAgent: number;    // Board deals-per-agent used
  };
}

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

  // CREA board benchmarking
  board_code:          string;       // CREA board slug (e.g. 'nbreb', 'treb') — '' = not set
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

  // Sandbox mode
  sandbox_mode: boolean;
  sandbox_activated_at: string | null;
  sandbox_expires_at: string | null;
  sandbox_tier: SandboxTier | null;
  sandbox_data: SandboxDataset | null;

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

// ── Client Flight Status (aviation-themed pipeline stages, migration 00027) ──
export type ClientStatus = "boarding" | "taxiing" | "approach" | "in_flight" | "landed" | "cruising";

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
  | "property_value_milestone"; // notable round-year anniversary (1,3,5,10yr) — offer CMA
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
  taxiing:   "Taxiing",
  approach:  "Approach",
  in_flight: "In-Flight",
  landed:    "Landed",
  cruising:  "Cruising",
};

export const CLIENT_STATUS_DESCRIPTIONS: Record<ClientStatus, string> = {
  boarding:  "New lead or prospect",
  taxiing:   "Gearing up to act",
  approach:  "Actively viewing homes, preparing to offer",
  in_flight: "Under contract",
  landed:    "Deal closed",
  cruising:  "Past client, nurturing",
};

// ── Flight status colour arc ───────────────────────────────────────────────
// Stages progress: boarding → taxiing → approach → in_flight → landed → cruising
// Colour logic:   sky → slate → indigo → violet → emerald → blue
//
// Constraints (from colour system rules):
//   • Amber is globally reserved for WARNING signals — never used for lifecycle stages
//   • Orange is globally reserved for URGENCY/CRITICAL alerts — never used for stages
//   • Indigo signals high-intent pre-close urgency without the danger connotation of orange
//   • Emerald signals success (deal closed) — correct semantic for landed
export const CLIENT_STATUS_COLORS: Record<ClientStatus, { bg: string; text: string; border: string; dot: string }> = {
  boarding:  { bg: "bg-sky-50",    text: "text-sky-700",    border: "border-sky-200",    dot: "bg-sky-400"    },
  taxiing:   { bg: "bg-slate-100", text: "text-slate-600",  border: "border-slate-200",  dot: "bg-slate-400"  },
  approach:  { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" },
  in_flight: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-400" },
  landed:    { bg: "bg-emerald-50",text: "text-emerald-700",border: "border-emerald-200",dot: "bg-emerald-400"},
  cruising:  { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   dot: "bg-blue-400"   },
};

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

  // CSV import tracking (migration 00054)
  imported_at: string | null;  // set when created via bulk CSV import; null = manually added

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
    tags: ["VIP", "High Value", "Nurture", "Closed 2025", "Out of Area"],
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

// ── Newsletter Queue (migration 00042) ────────────────────────────────────────

/** Which AI template produced the newsletter */
export type NewsletterTemplateType = "boc_rate_change" | "market_update" | "custom";

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

// ── Organization types (re-export from dedicated module) ────────────────────
export * from "./organizations";
