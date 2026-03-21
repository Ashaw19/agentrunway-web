export type CardId =
  | "client_briefing"
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
  | "recent_activity";

export interface CardDef {
  id: CardId;
  label: string;
  description: string;
}

export const CARD_REGISTRY: CardDef[] = [
  { id: "kpi_row",          label: "Performance KPIs",            description: "YTD GCI, Deals Closed, Pipeline, and Projected Year-End" },
  { id: "client_briefing",  label: "Client Briefing",             description: "Smart alerts and top CRM action items" },
  { id: "business_brief",   label: "Weekly Business Brief",       description: "AI-generated health narrative and month recap" },
  { id: "net_takehome",     label: "Net Take-Home",               description: "After-split, after-tax estimated take-home" },
  { id: "personal_records", label: "Personal Records",            description: "Best deal, best month, best year" },
  { id: "commission_mix",   label: "Commission Mix & Pipeline",   description: "Buyer/seller split and active pipeline deals" },
  { id: "cap_progress",     label: "Cap Progress",                description: "Commission cap tracking" },
  { id: "tasks",            label: "Follow-up Tasks",             description: "Open CRM tasks and stale leads" },
  { id: "insights",         label: "Insights & Actions",          description: "AI-generated business recommendations" },
  { id: "trends",           label: "Monthly Performance Chart",   description: "GCI by month with projected months" },
  { id: "probability",      label: "Projection Range & Benchmark",description: "Probability bands and cohort comparison" },
  { id: "tax_planning",     label: "Tax Planning",                description: "Tax readiness and goal progress" },
  { id: "corp_tax",         label: "Corporate Tax Estimate",      description: "PREC/corporation combined tax breakdown" },
  { id: "tax_savings",      label: "Tax Savings Opportunities",   description: "Estimated tax savings you may be missing" },
  { id: "recent_activity",  label: "Recent Transactions",         description: "Latest closed deals" },
];

// Cards shown by default on the dashboard.
// NOTE: trends, commission_mix, personal_records, tax_planning, net_takehome, cap_progress
// have been moved to Altimeter (/altimeter) and Overhead (/overhead) pages.
// They are kept in CARD_REGISTRY for saved-layout backwards compatibility but
// are nulled at render time, so they will not appear even if in a saved order.
export const DEFAULT_ORDER: CardId[] = [
  "kpi_row",
  "client_briefing",
  "business_brief",
  "tasks",
  "insights",
  "probability",
  "corp_tax",
  "tax_savings",
  "recent_activity",
];

// Hidden by default (advanced / niche cards)
export const DEFAULT_HIDDEN: CardId[] = ["probability", "corp_tax", "tax_savings"];

export interface DashboardLayout {
  order: CardId[];
  hidden: CardId[];
}
