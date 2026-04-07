/**
 * @agent-runway/i18n — Translation key types
 *
 * Provides strong typing for all translation namespaces and keys.
 * Import these types in both web and mobile apps for type-safe i18n.
 */

// ── Flight Status Keys ─────────────────────────────────────────────────────────

export interface FlightStatusTranslations {
  boarding: string;
  boarding_description: string;
  scheduled: string;
  scheduled_description: string;
  in_flight: string;
  in_flight_description: string;
  cruising: string;
  cruising_description: string;
}

// ── Province Keys ──────────────────────────────────────────────────────────────

export interface ProvinceTranslations {
  alberta: string;
  britishColumbia: string;
  manitoba: string;
  newBrunswick: string;
  newfoundland: string;
  northwestTerritories: string;
  novaScotia: string;
  nunavut: string;
  ontario: string;
  princeEdwardIsland: string;
  quebec: string;
  saskatchewan: string;
  yukon: string;
}

// ── Commission Split Keys ──────────────────────────────────────────────────────

export interface CommissionSplitTranslations {
  p100_0: string;
  p95_5: string;
  p90_10: string;
  p85_15: string;
  p80_20: string;
  p75_25: string;
  p70_30: string;
  label: string;
  agent: string;
  brokerage: string;
}

// ── Deal Stage Keys ────────────────────────────────────────────────────────────

export interface DealStageTranslations {
  lead: string;
  lead_description: string;
  showing: string;
  showing_description: string;
  offer: string;
  offer_description: string;
  conditional: string;
  conditional_description: string;
  firm: string;
  firm_description: string;
  closed: string;
  closed_description: string;
}

// ── Transaction Type Keys ──────────────────────────────────────────────────────

export interface TransactionTypeTranslations {
  buyer: string;
  seller: string;
  dual: string;
  referral: string;
  both: string;
}

// ── Expense Category Keys ──────────────────────────────────────────────────────

export interface ExpenseCategoryTranslations {
  vehicle: string;
  vehicle_payment: string;
  vehicle_insurance: string;
  vehicle_fuel: string;
  vehicle_service: string;
  marketing: string;
  marketing_ads: string;
  marketing_photography: string;
  marketing_print: string;
  marketing_gifts: string;
  office_tech: string;
  office_supplies: string;
  office_software: string;
  office_phone: string;
  office_hardware: string;
  professional: string;
  prof_board_mls: string;
  prof_licensing: string;
  prof_eo: string;
  prof_accounting: string;
  education: string;
  edu_courses: string;
  edu_conferences: string;
  edu_books: string;
  meals: string;
  meals_client: string;
  meals_team: string;
  entertainment: string;
  ent_client: string;
  ent_events: string;
  other: string;
  other_misc: string;
}

// ── Common UI Keys ─────────────────────────────────────────────────────────────

export interface CommonTranslations {
  yes: string;
  no: string;
  save: string;
  cancel: string;
  delete: string;
  edit: string;
  back: string;
  next: string;
  loading: string;
  error: string;
  success: string;
  confirm: string;
  close: string;
  search: string;
  filter: string;
  sort: string;
  add: string;
  remove: string;
  done: string;
  retry: string;
  submit: string;
  reset: string;
  select: string;
  none: string;
  all: string;
  other: string;
  not_set: string;
  required: string;
  optional: string;
  view_all: string;
  show_more: string;
  show_less: string;
  copy: string;
  copied: string;
  share: string;
  download: string;
  export: string;
  import: string;
  settings: string;
  profile: string;
  sign_out: string;
  sign_in: string;
}

// ── Currency Keys ──────────────────────────────────────────────────────────────

export interface CurrencyTranslations {
  cad: string;
  cad_symbol: string;
  amount: string;
  total: string;
  subtotal: string;
  tax: string;
  gst: string;
  hst: string;
  qst: string;
  pst: string;
}

// ── Time / Relative Date Keys ──────────────────────────────────────────────────

export interface TimeTranslations {
  today: string;
  yesterday: string;
  just_now: string;
  minutes_ago: string;
  hours_ago: string;
  days_ago: string;
  weeks_ago: string;
  months_ago: string;
  years_ago: string;
  tomorrow: string;
  this_week: string;
  this_month: string;
  this_year: string;
  last_week: string;
  last_month: string;
  last_year: string;
  ytd: string;
  mtd: string;
  qtd: string;
}

// ── Metrics Keys ───────────────────────────────────────────────────────────────

export interface MetricTranslations {
  gci: string;
  gci_full: string;
  ytd: string;
  pipeline: string;
  runway_score: string;
  deals: string;
  transactions: string;
  volume: string;
  average_commission: string;
  conversion_rate: string;
  expense_ratio: string;
  net_income: string;
  financial_runway: string;
  repeat_client_rate: string;
  average_deal_size: string;
  days_to_close: string;
  goal: string;
  forecast: string;
  benchmark: string;
  trend: string;
}

// ── Root Translation Shape ─────────────────────────────────────────────────────

export interface SharedTranslations {
  flight_status: FlightStatusTranslations;
  provinces: ProvinceTranslations;
  commission_splits: CommissionSplitTranslations;
  deal_stages: DealStageTranslations;
  transaction_types: TransactionTypeTranslations;
  expense_categories: ExpenseCategoryTranslations;
  common: CommonTranslations;
  currency: CurrencyTranslations;
  time: TimeTranslations;
  metrics: MetricTranslations;
}
