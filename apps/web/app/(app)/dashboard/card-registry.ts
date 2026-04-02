export type CardId =
  | "client_briefing"
  | "where_you_stand"
  | "business_brief"
  | "kpi_row"
  | "net_takehome"
  | "personal_records"
  | "commission_mix"
  | "cap_progress"
  | "tasks"
  | "insights"
  | "trends"
  | "probability"
  | "tax_planning"
  | "corp_tax"
  | "tax_savings"
  | "recent_activity"
  | "time_value";

export type SectionId = "performance" | "actions" | "financial";

export interface CardDef {
  id: CardId;
  label: string;
  description: string;
  section: SectionId;
}

export interface SectionDef {
  id: SectionId;
  label: string;
}

export const SECTIONS: SectionDef[] = [
  { id: "performance", label: "Performance" },
  { id: "actions", label: "Daily Actions" },
  { id: "financial", label: "Financial Outlook" },
];

export const CARD_REGISTRY: CardDef[] = [
  { id: "kpi_row",          label: "Performance KPIs",            description: "YTD GCI, Deals Closed, Pipeline, and Projected Year-End", section: "performance" },
  { id: "where_you_stand",  label: "Where You Stand",              description: "Competitive position, market diagnosis, and momentum", section: "performance" },
  { id: "probability",      label: "Projection Range & Benchmark",description: "Probability bands and cohort comparison", section: "performance" },
  { id: "client_briefing",  label: "Daily Briefing",               description: "Pipeline status, pace, market conditions, and priority actions", section: "actions" },
  { id: "tasks",            label: "Follow-up Tasks",             description: "Open CRM tasks and stale leads", section: "actions" },
  { id: "insights",         label: "Insights & Actions",          description: "AI-generated business observations (estimates only)", section: "actions" },
  { id: "business_brief",   label: "Weekly Business Brief",       description: "AI-generated health narrative and month recap", section: "financial" },
  { id: "corp_tax",         label: "Corporate Tax Estimate",      description: "PREC/corporation combined tax breakdown", section: "financial" },
  { id: "tax_savings",      label: "Tax Deduction Estimates",   description: "Common deduction categories for self-employed agents (estimates only)", section: "financial" },
  { id: "recent_activity",  label: "Recent Transactions",         description: "Latest closed deals", section: "financial" },
  { id: "time_value",       label: "Time Value",                  description: "Effective hourly rate and per-deal time metrics", section: "financial" },
  // Moved cards — kept for backwards compatibility with saved layouts
  { id: "net_takehome",     label: "Net Take-Home",               description: "After-split, after-tax estimated take-home", section: "financial" },
  { id: "personal_records", label: "Personal Records",            description: "Best deal, best month, best year", section: "performance" },
  { id: "commission_mix",   label: "Commission Mix & Pipeline",   description: "Buyer/seller split and active pipeline deals", section: "performance" },
  { id: "cap_progress",     label: "Cap Progress",                description: "Commission cap tracking", section: "financial" },
  { id: "trends",           label: "Monthly Performance Chart",   description: "GCI by month with projected months", section: "performance" },
  { id: "tax_planning",     label: "Tax Estimates",               description: "Tax estimate overview and goal progress", section: "financial" },
];

// Cards shown by default on the dashboard.
// NOTE: trends, commission_mix, personal_records, tax_planning, net_takehome, cap_progress
// have been moved to Altimeter (/altimeter) and Overhead (/overhead) pages.
// They are kept in CARD_REGISTRY for saved-layout backwards compatibility but
// are nulled at render time, so they will not appear even if in a saved order.
export const DEFAULT_ORDER: CardId[] = [
  "kpi_row",
  "where_you_stand",
  "probability",
  "client_briefing",
  "tasks",
  "insights",
  "business_brief",
  "corp_tax",
  "tax_savings",
  "recent_activity",
  "time_value",
];

// Hidden by default (advanced / niche cards)
export const DEFAULT_HIDDEN: CardId[] = ["probability", "corp_tax", "tax_savings"];

export interface DashboardLayout {
  order: CardId[];
  hidden: CardId[];
}
