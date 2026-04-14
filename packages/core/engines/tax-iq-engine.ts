/**
 * Tax IQ Engine
 *
 * Contextual tax education tips for Canadian real estate agents.
 * Each tip references a specific CRA publication so the agent can
 * verify the guidance and share it with their accountant.
 *
 * Tips are selected dynamically based on the agent's current data:
 * filing period, expense categories, transaction volume, province, etc.
 *
 * CRA Sources:
 *   - T4002: Self-employed Business, Professional, Commission, Farming, and Fishing Income
 *   - RC4022: General Information for GST/HST Registrants
 *   - IT-522R: Vehicle, Travel and Sales Expenses of Employees
 *   - GST/HST Memoranda 8.1: General Eligibility Rules (ITCs)
 *   - T2125: Statement of Business or Professional Activities
 *   - IC78-10R5: Books and Records Retention/Destruction
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface TaxTip {
  /** Unique tip ID for tracking dismissals */
  id: string;
  /** Short title */
  title: string;
  /** Educational content (2-3 sentences) */
  body: string;
  /** CRA publication reference */
  source: string;
  /** CRA URL (generic, not deep-linked to avoid link rot) */
  url: string;
  /** Category for grouping */
  category: "deductions" | "gst_hst" | "records" | "filing" | "planning";
  /** When this tip is relevant — evaluated against agent context */
  trigger: TipTrigger;
}

export interface TipTrigger {
  /** Show when agent has expenses in these category keys */
  hasExpenseCategories?: string[];
  /** Show when agent has at least this many transactions YTD */
  minTransactions?: number;
  /** Show during specific quarters (1-4) */
  quarters?: number[];
  /** Show for specific provinces */
  provinces?: string[];
  /** Show when filing frequency matches */
  filingFrequency?: ("monthly" | "quarterly" | "annual")[];
  /** Always show (evergreen tips) */
  always?: boolean;
}

export interface TaxIQContext {
  /** Agent's province */
  province: string;
  /** Filing frequency */
  filingFrequency: "monthly" | "quarterly" | "annual";
  /** Current quarter (1-4) */
  currentQuarter: number;
  /** YTD transaction count */
  transactionCount: number;
  /** Expense category keys the agent has used */
  activeExpenseCategories: string[];
  /** Tip IDs the agent has previously dismissed */
  dismissedTipIds: string[];
}

// ── Tip Library ────────────────────────────────────────────────────────────

const TAX_TIPS: TaxTip[] = [
  // ── Deductions ──────────────────────────────────────────────────────
  {
    id: "meals-50-pct",
    title: "Meals & entertainment are only 50% deductible",
    body: "CRA limits the deduction for food, beverages, and entertainment to 50% of the amount paid. This applies to both the expense deduction and the Input Tax Credit (ITC) you can claim on GST/HST paid.",
    source: "CRA T4002, Chapter 3 — Business expenses",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002.html",
    category: "deductions",
    trigger: { hasExpenseCategories: ["meals_entertainment", "client_meals", "meals", "entertainment"] },
  },
  {
    id: "vehicle-logbook",
    title: "Keep a vehicle logbook for CRA compliance",
    body: "If you claim vehicle expenses, CRA expects a logbook documenting business vs. personal kilometres. Without one, your entire vehicle claim could be denied on audit. A full logbook for one complete year establishes a base year, then a 3-month sample log can be used in subsequent years.",
    source: "CRA T4002, Chapter 3 — Motor vehicle expenses",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002.html",
    category: "deductions",
    trigger: { hasExpenseCategories: ["vehicle", "vehicle_fuel", "vehicle_insurance", "vehicle_lease", "vehicle_repairs"] },
  },
  {
    id: "home-office",
    title: "Home office deduction for real estate agents",
    body: "If you use a dedicated space in your home regularly for meeting clients or doing administrative work, you can deduct a proportional share of rent, utilities, insurance, and maintenance. The space must be your principal place of business OR used exclusively for earning income on a regular and continuous basis.",
    source: "CRA T4002, Chapter 3 — Business-use-of-home expenses",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002.html",
    category: "deductions",
    trigger: { hasExpenseCategories: ["office_tech", "home_office", "office_supplies"] },
  },
  {
    id: "insurance-no-itc",
    title: "Insurance premiums are GST/HST-exempt — no ITC",
    body: "Insurance premiums (E&O, general liability, auto insurance) are exempt financial services under the Excise Tax Act. There is no GST/HST on insurance premiums, so you cannot claim an ITC. However, insurance premiums are still deductible as a business expense on your T2125.",
    source: "CRA RC4022 — General Information for GST/HST Registrants",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022.html",
    category: "gst_hst",
    trigger: { hasExpenseCategories: ["professional", "insurance"] },
  },
  {
    id: "marketing-fully-deductible",
    title: "Marketing and advertising are 100% deductible",
    body: "Unlike meals, marketing expenses (yard signs, online ads, flyers, staging, photography, virtual tours) are fully deductible with no 50% limitation. Keep receipts showing the business purpose.",
    source: "CRA T4002, Chapter 3 — Advertising and promotion",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002.html",
    category: "deductions",
    trigger: { hasExpenseCategories: ["marketing", "advertising", "staging", "photography"] },
  },

  // ── GST/HST ─────────────────────────────────────────────────────────
  {
    id: "gst-hst-filing-basics",
    title: "How your GST/HST return works",
    body: "As a registrant, you collect GST/HST on your commission income and can claim ITCs for GST/HST paid on business expenses. Your net tax is the difference. If ITCs exceed collected tax (common in low-income quarters), CRA refunds the difference.",
    source: "CRA RC4022 — General Information for GST/HST Registrants",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022.html",
    category: "gst_hst",
    trigger: { always: true },
  },
  {
    id: "itc-4-year-limit",
    title: "Claim ITCs within 4 years or lose them",
    body: "You have up to 4 years from the due date of the return in which the ITC could have first been claimed. If you find an old receipt with GST/HST paid, you can still claim the ITC on a current or amended return — as long as you're within the 4-year window.",
    source: "CRA GST/HST Memoranda Series 8.1 — General Eligibility Rules",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/8-1.html",
    category: "gst_hst",
    trigger: { always: true },
  },
  {
    id: "quick-method-consideration",
    title: "Consider the Quick Method for GST/HST",
    body: "If your taxable revenue (including GST/HST) is $400,000 or less, you may benefit from the Quick Method. Instead of tracking every ITC, you remit a flat percentage of revenue. For service providers in most provinces, this is often 8.8% of HST-included revenue — which can result in paying less than the regular method.",
    source: "CRA RC4058 — Quick Method of Accounting for GST/HST",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4058.html",
    category: "gst_hst",
    trigger: { always: true },
  },

  // ── Records ─────────────────────────────────────────────────────────
  {
    id: "receipt-retention",
    title: "Keep receipts for 6 years minimum",
    body: "CRA requires you to keep all business records and supporting documents for at least 6 years from the end of the tax year they relate to. This includes receipts, bank statements, contracts, and mileage logs. Digital copies are acceptable if they are complete and legible.",
    source: "CRA IC78-10R5 — Books and Records Retention/Destruction",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/ic78-10r5.html",
    category: "records",
    trigger: { always: true },
  },
  {
    id: "digital-receipts-ok",
    title: "Digital receipt copies are CRA-acceptable",
    body: "CRA accepts electronic images of receipts as supporting documentation, provided the image is a complete and accurate copy of the original. You don't need to keep paper originals if you have a reliable digital backup. Agent Runway stores your receipt images securely for this purpose.",
    source: "CRA IC78-10R5 — Books and Records Retention/Destruction",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/ic78-10r5.html",
    category: "records",
    trigger: { always: true },
  },

  // ── Filing ──────────────────────────────────────────────────────────
  {
    id: "quarterly-instalment-reminder",
    title: "Quarterly instalments may be required for income tax",
    body: "If your net tax owing exceeds $3,000 in the current year and either of the two prior years, CRA expects quarterly income tax instalments (Mar 15, Jun 15, Sep 15, Dec 15). Missing instalments incurs interest charges. Your GST/HST filing is separate from income tax instalments.",
    source: "CRA P110 — Paying Your Income Tax by Instalments",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/p110.html",
    category: "filing",
    trigger: { minTransactions: 3 },
  },
  {
    id: "sole-prop-deadline",
    title: "Sole proprietor tax deadline is June 15",
    body: "Self-employed individuals have until June 15 to file their income tax return, but any balance owing is still due April 30. Filing on time avoids penalties, but paying late incurs compound daily interest on the balance owing from May 1.",
    source: "CRA — Filing due dates",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/important-dates-individuals.html",
    category: "filing",
    trigger: { quarters: [1, 2] },
  },

  // ── Planning ────────────────────────────────────────────────────────
  {
    id: "rrsp-contribution",
    title: "RRSP contributions reduce taxable income",
    body: "As a self-employed agent, you don't have employer RRSP matching — but RRSP contributions directly reduce your taxable income. Your contribution room is 18% of prior year's earned income (up to the annual limit). Contributing before the March 1 deadline counts against the previous tax year.",
    source: "CRA — RRSP contributions, deductions and withdrawals",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans.html",
    category: "planning",
    trigger: { quarters: [1, 4] },
  },
  {
    id: "cpp-self-employed",
    title: "Self-employed agents pay both CPP portions",
    body: "Unlike employees who split CPP contributions with their employer, self-employed individuals pay both the employee and employer portions. For 2025, this can total over $8,800 (CPP1 max $8,068 + CPP2 max $792). The employer-equivalent half is deductible on your tax return, reducing your taxable income.",
    source: "CRA T4002, Chapter 6 — Canada Pension Plan contributions",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002.html",
    category: "planning",
    trigger: { always: true },
  },
  {
    id: "hst-new-registrant",
    title: "Newly registered? You can claim ITCs on startup costs",
    body: "If you recently registered for GST/HST, you may be able to claim ITCs on business expenses incurred before registration — going back up to one year for services and property still on hand at registration. This includes startup costs like laptop, phone, and office furniture.",
    source: "CRA GST/HST Memoranda Series 8.1 — General Eligibility Rules",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/8-1.html",
    category: "gst_hst",
    trigger: { minTransactions: 0 },
  },
];

// ── Category labels ───────────────────────────────────────────────────────

export const TIP_CATEGORY_LABELS: Record<string, string> = {
  deductions: "Deductions",
  gst_hst: "GST/HST",
  records: "Record Keeping",
  filing: "Filing",
  planning: "Tax Planning",
};

// ── Tip selection logic ───────────────────────────────────────────────────

function tipMatchesContext(tip: TaxTip, ctx: TaxIQContext): boolean {
  const t = tip.trigger;

  if (t.always) return true;

  if (t.hasExpenseCategories) {
    const hasAny = t.hasExpenseCategories.some((cat) =>
      ctx.activeExpenseCategories.includes(cat),
    );
    if (!hasAny) return false;
  }

  if (t.minTransactions !== undefined) {
    if (ctx.transactionCount < t.minTransactions) return false;
  }

  if (t.quarters) {
    if (!t.quarters.includes(ctx.currentQuarter)) return false;
  }

  if (t.provinces) {
    if (!t.provinces.includes(ctx.province)) return false;
  }

  if (t.filingFrequency) {
    if (!t.filingFrequency.includes(ctx.filingFrequency)) return false;
  }

  return true;
}

/**
 * Select relevant Tax IQ tips based on the agent's current context.
 * Returns tips sorted by relevance (contextual first, then evergreen).
 * Excludes previously dismissed tips.
 */
export function selectTaxTips(
  ctx: TaxIQContext,
  maxTips: number = 5,
): TaxTip[] {
  const eligible = TAX_TIPS.filter(
    (tip) =>
      !ctx.dismissedTipIds.includes(tip.id) &&
      tipMatchesContext(tip, ctx),
  );

  // Sort: contextual tips (with specific triggers) first, evergreen last
  eligible.sort((a, b) => {
    const aSpecific = !a.trigger.always ? 1 : 0;
    const bSpecific = !b.trigger.always ? 1 : 0;
    return bSpecific - aSpecific;
  });

  return eligible.slice(0, maxTips);
}
