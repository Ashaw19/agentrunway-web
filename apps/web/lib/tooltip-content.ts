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
  /** Sandbox-specific teaching line (shown when sandboxMode === true) */
  sandboxNote: string;
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
    sandboxNote: "Try editing the fictional pipeline deals to see how weighted GCI and projections shift in real time.",
  },

  client_briefing: {
    what: "AI-generated alerts for stale leads, overdue follow-ups, and high-value client actions due this week.",
    drivers: [
      { label: "CRM client records", href: "/crm" },
      { label: "Contact activities", href: "/crm" },
      { label: "Follow-up tasks", href: "/crm" },
    ],
    sandboxNote: "In sandbox mode, this card uses fictional CRM data. Your real CRM alerts will appear when you switch to live data.",
  },

  business_brief: {
    what: "A weekly AI narrative summarizing your business health: income pace, expense trends, pipeline strength, and month-over-month momentum.",
    drivers: [
      { label: "All financial data", href: "/dashboard" },
      { label: "Pipeline status", href: "/pipeline" },
      { label: "Expense categories", href: "/overhead" },
    ],
    sandboxNote: "This narrative is generated from the sandbox dataset. Watch how it changes when you toggle between tiers.",
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
    sandboxNote: "This is the bottom line. Change the fictional brokerage fee or split in Settings to see how dramatically it affects your take-home.",
  },

  personal_records: {
    what: "Your all-time personal bests: highest single-deal GCI, best month, and best year — tracked automatically from your transaction history.",
    drivers: [
      { label: "Transaction history", href: "/transactions" },
      { label: "Historical data", href: "/settings" },
    ],
    sandboxNote: "These records are from the sandbox history. Your real records will populate as you close deals.",
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
    sandboxNote: "Notice how the buyer/seller mix affects your projected income differently in each market.",
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
    sandboxNote: "High producers often hit their cap mid-year. Toggle to that tier to see how cap progress changes the math.",
  },

  tasks: {
    what: "Your open CRM follow-up tasks sorted by due date, plus a count of stale leads that haven't been contacted recently.",
    drivers: [
      { label: "CRM tasks", href: "/crm" },
      { label: "Client contact activities", href: "/crm" },
    ],
    sandboxNote: "Task management is connected to your real CRM. This card won't show sandbox data — it always reflects your actual pipeline.",
  },

  insights: {
    what: "AI-generated business observations based on your current performance data. For informational purposes only.",
    drivers: [
      { label: "All dashboard metrics", href: "/dashboard" },
      { label: "Market data", href: "/settings" },
      { label: "Expense ratios", href: "/overhead" },
    ],
    sandboxNote: "These insights are generated from the fictional dataset. They'll recalculate when you switch to your real data.",
  },

  trends: {
    what: "Monthly GCI bar chart showing actual performance vs. projected remaining months, using your seasonal pattern.",
    drivers: [
      { label: "Monthly transactions", href: "/transactions" },
      { label: "Seasonality weights", href: "/settings" },
      { label: "Pipeline weighted GCI", href: "/pipeline" },
    ],
    sandboxNote: "The seasonal curve shows how Canadian real estate deals cluster in spring/summer. Watch how the projection bars shift.",
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
    sandboxNote: "The benchmark comparison shows where you'd rank against other agents. Try different tiers to see how the bands shift.",
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
    sandboxNote: "Tax is calculated using real Canadian federal/provincial rates. Change the province in Settings to see how tax varies.",
  },

  corp_tax: {
    what: "Combined personal + corporate tax estimate for agents operating through a PREC or general corporation, including small business deduction.",
    drivers: [
      { label: "Incorporation status", href: "/settings" },
      { label: "Compensation method", href: "/settings" },
      { label: "Projected income", href: "/altimeter" },
    ],
    sandboxNote: "This card only appears for incorporated agents. It uses the Canadian small business deduction rate.",
  },

  tax_savings: {
    what: "Common tax deduction categories for self-employed agents. Estimates only.",
    drivers: [
      { label: "Home office details", href: "/overhead" },
      { label: "Vehicle usage", href: "/overhead" },
      { label: "CCA assets", href: "/overhead" },
    ],
    sandboxNote: "These savings estimates use real CRA rules. Experiment with the sandbox data to understand how each deduction category works.",
  },

  recent_activity: {
    what: "Your most recent closed transactions with sale price, commission earned, and client details.",
    drivers: [
      { label: "Transactions", href: "/transactions" },
    ],
    sandboxNote: "These are fictional transactions generated from your board's average sale prices. Your real deals will appear here.",
  },
};
