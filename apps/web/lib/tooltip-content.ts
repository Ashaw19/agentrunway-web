// ============================================================================
// Agent Runway — Tooltip Content Registry
// Three-tier contextual education content for every dashboard card.
// Tier 1: "What is this?" — definition
// Tier 2: "What changes this?" — inputs and drivers
// Tier 3: "What should I do?" — actionable threshold-based advice
// ============================================================================

import type { CardId } from "@/app/(app)/dashboard/card-registry";

export interface TooltipDriver {
  label: string;
  /** App route where the user can change this input */
  href: string;
}

export interface TooltipAction {
  /** Human-readable threshold description */
  condition: string;
  /** Threshold check: returns true when the action should surface */
  check: (value: number, context?: Record<string, number>) => boolean;
  /** Message shown when threshold is breached */
  message: string;
  /** CTA link */
  href: string;
  ctaLabel: string;
}

export interface TooltipEntry {
  /** One-sentence definition of the metric */
  what: string;
  /** 2-3 inputs that drive this metric */
  drivers: TooltipDriver[];
  /** Threshold-based actionable advice (only surfaces when triggered) */
  action?: TooltipAction;
}

// ── Registry ────────────────────────────────────────────────────────────────

export const TOOLTIP_REGISTRY: Partial<Record<CardId, TooltipEntry>> = {
  kpi_row: {
    what: "Your four core KPIs: YTD gross commission, closed deals, active pipeline value, and projected year-end GCI.",
    drivers: [
      { label: "Closed transactions", href: "/transactions" },
      { label: "Pipeline deals", href: "/pipeline" },
      { label: "Commission split", href: "/settings" },
    ],
    action: {
      condition: "GCI pace is more than 25% behind annual goal",
      check: (pacePercent) => pacePercent < -25,
      message: "You're significantly behind pace. Focus on converting pipeline deals or increasing prospecting volume.",
      href: "/pipeline",
      ctaLabel: "Review Pipeline",
    },
  },

  client_briefing: {
    what: "AI-generated alerts for stale leads, overdue follow-ups, and high-value client actions due this week.",
    drivers: [
      { label: "CRM client records", href: "/crm" },
      { label: "Contact activities", href: "/crm" },
      { label: "Follow-up tasks", href: "/crm" },
    ],
  },

  business_brief: {
    what: "A weekly AI narrative summarizing your business health: income pace, expense trends, pipeline strength, and month-over-month momentum.",
    drivers: [
      { label: "All financial data", href: "/dashboard" },
      { label: "Pipeline status", href: "/pipeline" },
      { label: "Expense categories", href: "/overhead" },
    ],
  },

  net_takehome: {
    what: "Your estimated take-home after brokerage split, transaction fees, monthly fees, expenses, and projected income tax.",
    drivers: [
      { label: "Commission split", href: "/settings" },
      { label: "Monthly brokerage fee", href: "/settings" },
      { label: "Expense categories", href: "/overhead" },
    ],
    action: {
      condition: "Net take-home is negative",
      check: (netTakeHome) => netTakeHome < 0,
      message: "Your expenses and fees currently exceed your after-split income. Review your expense categories for reduction opportunities.",
      href: "/overhead",
      ctaLabel: "Review Expenses",
    },
  },

  personal_records: {
    what: "Your all-time personal bests: highest single-deal GCI, best month, and best year — tracked automatically from your transaction history.",
    drivers: [
      { label: "Transaction history", href: "/transactions" },
      { label: "Historical data", href: "/settings" },
    ],
  },

  commission_mix: {
    what: "Buyer vs. seller deal breakdown and your active pipeline deals by stage, showing how your business is distributed.",
    drivers: [
      { label: "Closed transactions", href: "/transactions" },
      { label: "Pipeline deals", href: "/pipeline" },
    ],
    action: {
      condition: "Pipeline has fewer than 3 active deals",
      check: (pipelineCount) => pipelineCount < 3,
      message: "Your pipeline is thin. Consider ramping up prospecting to maintain deal flow.",
      href: "/crm",
      ctaLabel: "Open CRM",
    },
  },

  cap_progress: {
    what: "How close you are to hitting your brokerage's commission cap — the GCI threshold where your split improves to the post-cap rate.",
    drivers: [
      { label: "Cap threshold", href: "/settings" },
      { label: "Post-cap split", href: "/settings" },
      { label: "YTD GCI", href: "/transactions" },
    ],
    action: {
      condition: "Within 80% of cap",
      check: (progressPct) => progressPct >= 80 && progressPct < 100,
      message: "You're close to hitting your cap. Every deal from here generates significantly more net income.",
      href: "/altimeter",
      ctaLabel: "View Projections",
    },
  },

  tasks: {
    what: "Your open CRM follow-up tasks sorted by due date, plus a count of stale leads that haven't been contacted recently.",
    drivers: [
      { label: "CRM tasks", href: "/crm" },
      { label: "Client contact activities", href: "/crm" },
    ],
  },

  insights: {
    what: "AI-generated business observations based on your current performance data. For informational purposes only.",
    drivers: [
      { label: "All dashboard metrics", href: "/dashboard" },
      { label: "Market data", href: "/settings" },
      { label: "Expense ratios", href: "/overhead" },
    ],
  },

  trends: {
    what: "Monthly GCI bar chart showing actual performance vs. projected remaining months, using your seasonal pattern.",
    drivers: [
      { label: "Monthly transactions", href: "/transactions" },
      { label: "Seasonality weights", href: "/settings" },
      { label: "Pipeline weighted GCI", href: "/pipeline" },
    ],
  },

  probability: {
    what: "Year-end GCI projection bands (pessimistic, base, optimistic) and your performance compared to agents at similar production levels.",
    drivers: [
      { label: "YTD pace", href: "/transactions" },
      { label: "Pipeline", href: "/pipeline" },
      { label: "Historical performance", href: "/settings" },
    ],
    action: {
      condition: "Pessimistic band is below 60% of goal",
      check: (pessimisticPct) => pessimisticPct < 60,
      message: "Even your base projection is at risk. You may need to increase pipeline activity to hit your goal.",
      href: "/pipeline",
      ctaLabel: "Build Pipeline",
    },
  },

  tax_planning: {
    what: "Estimated federal + provincial income tax liability, quarterly instalment tracker, and effective tax rate on your projected income.",
    drivers: [
      { label: "Province", href: "/settings" },
      { label: "Projected GCI", href: "/altimeter" },
      { label: "Deductions & expenses", href: "/overhead" },
    ],
    action: {
      condition: "Estimated tax owing exceeds $5,000 and no instalments paid",
      check: (taxOwing, ctx) => taxOwing > 5000 && (ctx?.instalmentsPaid ?? 0) === 0,
      message: "CRA may charge interest if quarterly instalments aren't made. Consider setting aside funds now.",
      href: "/overhead",
      ctaLabel: "Tax Estimates",
    },
  },

  corp_tax: {
    what: "Combined personal + corporate tax estimate for agents operating through a PREC or general corporation, including small business deduction.",
    drivers: [
      { label: "Incorporation status", href: "/settings" },
      { label: "Compensation method", href: "/settings" },
      { label: "Projected income", href: "/altimeter" },
    ],
  },

  tax_savings: {
    what: "Common tax deduction categories for self-employed agents. Estimates only.",
    drivers: [
      { label: "Home office details", href: "/overhead" },
      { label: "Vehicle usage", href: "/overhead" },
      { label: "CCA assets", href: "/overhead" },
    ],
  },

  recent_activity: {
    what: "Your most recent closed transactions with sale price, commission earned, and client details.",
    drivers: [
      { label: "Transactions", href: "/transactions" },
    ],
  },
};
