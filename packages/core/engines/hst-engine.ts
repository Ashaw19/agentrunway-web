/**
 * HST / GST Engine — Canonical Calculator
 *
 * CANONICAL source of truth for every HST/GST "collected" and "net owing"
 * calculation across the app. Created 2026-04-22 for Audit 1 D-4:
 *
 *   Chat route was computing two different HST numbers in the same response
 *   (one at line 538 with `ytdGCI * hstRate`, another at line 829 with
 *   `ytdGCI * agentPct * hstRate`). The second is wrong: HST/GST is charged
 *   on the full commission invoiced to the client; the agent / brokerage
 *   split affects who collects the funds, not the HST calculation itself.
 *
 * This engine enforces one formula:
 *
 *   HST collected on commissions = ytdGCI * hstRate
 *   (multiplied by 0 when the agent is not registered or when the brokerage
 *    withholds and remits on the agent's behalf)
 *
 * Distinguish the agent cash-flow view (this engine) from the filing-period
 * view (gst34-engine.ts, t2125-engine.ts). The filing view always reports
 * the amount collected on invoiced GCI regardless of who remits the funds
 * to CRA — the brokerage-withholds flag only shifts who cuts the cheque.
 *
 * PUBLISHED RATES — verified against CRA's "GST/HST — Which rate to charge"
 * guidance (canada.ca/en/revenue-agency/services/tax/businesses/topics/
 * gst-hst-businesses/charge-collect-which-rate.html). The rates themselves
 * live in canonical form in `canadian-tax-engine.ts:gstHstRate`. This engine
 * imports nothing — the caller provides the rate so this helper stays pure
 * and easily mirrored into the Deno edge function.
 *
 * SAFETY: Returns numbers only. No advice strings, no opinion labels,
 * no "you owe", "tight", "low", "high". Forbidden-verb-safe per
 * memory/feedback_tax_information_not_advice.md. A severity enum is
 * provided so UI layers can choose safe wording downstream.
 */

// ── Inputs / Outputs ────────────────────────────────────────────────────────

export interface HSTCollectedInputs {
  /** Year-to-date gross commission income (invoiced to clients, before split). */
  ytdGCI: number;
  /**
   * HST/GST rate as a decimal, e.g. 0.13 for Ontario, 0.15 for Atlantic,
   * 0.05 for GST-only provinces. Caller provides via
   * `gstHstRate(province)` from canadian-tax-engine.
   */
  hstRate: number;
  /**
   * Whether the agent is a GST/HST registrant. Non-registrants do not charge
   * or collect HST (but are subject to the $30K small-supplier threshold
   * rules surfaced elsewhere).
   */
  isRegistered: boolean;
  /**
   * Whether the brokerage withholds and remits HST on the agent's commission
   * invoices. True in the "agent-held back gross" pay model: the brokerage
   * pays the agent net-of-HST and remits HST to CRA itself. In this case
   * the agent's personal cash-flow view sees $0 collected.
   */
  brokerageWithholdsHst: boolean;
}

export interface HSTNetOwingInputs {
  /** Amount from computeHSTCollected. */
  hstCollected: number;
  /**
   * Input Tax Credits (ITCs) — HST paid on deductible business expenses
   * during the same period. Reduces the remittance owed to CRA.
   */
  hstPaidOnExpenses: number;
}

export type HSTThresholdSeverity =
  | "already_registered"
  | "collected_below_threshold"
  | "collected_at_threshold"
  | "collected_above_threshold";

// ── Functions ───────────────────────────────────────────────────────────────

/**
 * Compute HST/GST the agent has collected on commission income (cash-flow
 * view — agent-side).
 *
 * Formula:
 *   If !isRegistered         -> 0  (non-registrants do not charge HST)
 *   If brokerageWithholdsHst -> 0  (brokerage holds and remits; agent never
 *                                   touches the HST portion)
 *   Otherwise                -> ytdGCI * hstRate
 *
 * Critical: the multiplier is the full invoiced GCI, not the agent's split.
 * HST is charged on the commission invoiced to the client; the split
 * determines who keeps how much of the net, not the HST base.
 */
export function computeHSTCollected(inputs: HSTCollectedInputs): number {
  const { ytdGCI, hstRate, isRegistered, brokerageWithholdsHst } = inputs;

  if (!isRegistered) return 0;
  if (brokerageWithholdsHst) return 0;
  if (ytdGCI <= 0 || hstRate <= 0) return 0;

  return ytdGCI * hstRate;
}

/**
 * Compute net HST/GST payable to CRA after Input Tax Credits.
 *
 * Formula:
 *   net_owing = hstCollected - hstPaidOnExpenses
 *
 * Positive = balance owing, negative = refund. This helper clamps nothing —
 * returning the signed value so callers can distinguish a refund case
 * explicitly.
 */
export function computeHSTNetOwing(inputs: HSTNetOwingInputs): number {
  const { hstCollected, hstPaidOnExpenses } = inputs;
  return hstCollected - hstPaidOnExpenses;
}

/**
 * Machine-readable threshold classification for the $30K CRA small-supplier
 * trigger. Caller provides the agent's gross commission income over four
 * consecutive calendar quarters; this helper emits a severity label the UI
 * can translate into safe, information-only wording.
 *
 * This does NOT tell the caller to register. It only describes where they
 * sit relative to the published CRA threshold. The $30K rule applies to
 * taxable supplies over four consecutive calendar quarters (not YTD), so
 * callers must compute the rolling four-quarter window themselves.
 *
 * Threshold: $30,000 (CRA small-supplier limit for sole-prop realtors).
 */
export function classifyHSTThreshold(
  isRegistered: boolean,
  fourQuarterGCI: number,
): HSTThresholdSeverity {
  const THRESHOLD = 30_000;
  if (isRegistered) return "already_registered";
  if (fourQuarterGCI < THRESHOLD * 0.9) return "collected_below_threshold";
  if (fourQuarterGCI < THRESHOLD) return "collected_at_threshold";
  return "collected_above_threshold";
}
