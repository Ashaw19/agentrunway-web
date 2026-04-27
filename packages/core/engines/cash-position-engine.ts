// CashPositionEngine — Implied business cash position
// Computes what *should* be in the agent's business account based on:
//   YTD take-home income − YTD expenses − YTD tax set-aside − YTD HST set-aside
//
// This is an ESTIMATE, not an actual bank balance. It answers:
// "If I've been disciplined, how much should I have right now?"

// ── Types ──────────────────────────────────────────────────────────────────

export interface CashPositionInputs {
  /** YTD gross commission income (before split) */
  ytdGCI: number;
  /** Agent gross after split + tx fees + brokerage fees (YTD take-home before tax) */
  ytdAgentNet: number;
  /** YTD business expenses (receipts + recurring) */
  ytdExpenses: number;
  /** Estimated YTD income tax set-aside (fraction of projected annual tax) */
  ytdTaxSetAside: number;
  /** Estimated YTD HST/GST collected on commissions */
  ytdHstCollected: number;
  /** HST paid on deductible business expenses (ITCs the agent can claim) */
  ytdHstOnExpenses: number;
  /** Whether the brokerage withholds HST from commission cheques */
  brokerageWithholdsHst: boolean;
  /** Manual cash reserve entered by user (fallback / starting balance) */
  manualCashReserve: number;
  /** Fraction of year elapsed (seasonality-adjusted) */
  fractionElapsed: number;
}

export interface CashPositionResult {
  /** Implied business cash position (what should be in the account) */
  impliedPosition: number;
  /** Manual cash reserve the user entered */
  manualReserve: number;
  /** The effective cash figure to use for survival calculations */
  effectiveCash: number;
  /** Which source was used: 'implied' if we have enough data, 'manual' as fallback */
  source: "implied" | "manual";
  /** Breakdown for display */
  breakdown: {
    ytdAgentNet: number;
    ytdExpenses: number;
    ytdTaxSetAside: number;
    ytdHstOwing: number;
  };
}

// ── Calculations ───────────────────────────────────────────────────────────

/**
 * Compute the implied cash position.
 *
 * Formula:
 *   Implied Cash = YTD Agent Net − YTD Expenses − YTD Tax Set-Aside − YTD HST Owing
 *
 * HST Owing:
 *   If brokerage withholds HST → $0 (they handle it)
 *   Otherwise → HST collected on commissions − HST ITCs on expenses
 *
 * We use the implied position when:
 *   1. The agent has at least one closed transaction (ytdGCI > 0)
 *   2. The implied position is a reasonable number (not wildly negative)
 *
 * Falls back to manual cash_reserve when there's no transaction data.
 */
export function computeCashPosition(inputs: CashPositionInputs): CashPositionResult {
  // Defensive: any NaN/Infinity input (e.g. tax engine fed an empty province
  // row) propagates through every subtraction and silently lands in
  // runway-score's survival branch as 10 points without explanation. Coerce
  // non-finite numerics to 0 at the boundary.
  const safeNum = (n: number) => (Number.isFinite(n) ? n : 0);
  const ytdGCI            = safeNum(inputs.ytdGCI);
  const ytdAgentNet       = safeNum(inputs.ytdAgentNet);
  const ytdExpenses       = safeNum(inputs.ytdExpenses);
  const ytdTaxSetAside    = safeNum(inputs.ytdTaxSetAside);
  const ytdHstCollected   = safeNum(inputs.ytdHstCollected);
  const ytdHstOnExpenses  = safeNum(inputs.ytdHstOnExpenses);
  const manualCashReserve = safeNum(inputs.manualCashReserve);
  const { brokerageWithholdsHst } = inputs;

  // HST owing: if brokerage withholds, the agent doesn't need to set aside HST
  const ytdHstOwing = brokerageWithholdsHst
    ? 0
    : Math.max(0, ytdHstCollected - ytdHstOnExpenses);

  const impliedPosition = ytdAgentNet - ytdExpenses - ytdTaxSetAside - ytdHstOwing;

  const breakdown = {
    ytdAgentNet,
    ytdExpenses,
    ytdTaxSetAside,
    ytdHstOwing,
  };

  // Use implied position when agent has closed deals this year
  // Fall back to manual reserve for brand-new users or pre-first-deal
  const hasTransactionData = ytdGCI > 0;

  if (hasTransactionData) {
    return {
      impliedPosition,
      manualReserve: manualCashReserve,
      effectiveCash: Math.max(0, impliedPosition + manualCashReserve),
      source: "implied",
      breakdown,
    };
  }

  return {
    impliedPosition: 0,
    manualReserve: manualCashReserve,
    effectiveCash: manualCashReserve,
    source: "manual",
    breakdown,
  };
}
