/**
 * Flight Crew context block: "PAYCHEQUE ALLOCATION GUIDANCE".
 *
 * What the AI is given when an agent asks how a commission cheque breaks
 * down: who handles the GST/HST, and the engine's estimate of the tax portion
 * of a commission. Pure: the chat route passes its figures in.
 *
 * The tax portion is `taxPortionOfCommission` (core/engines/deal-tax-portion),
 * the figure the deal-close screens print: the year's estimate x the
 * commission / projected GCI. Until 2026-10-13 this block worked the example
 * out as the agent's split x (income tax / net income), called that a marginal
 * rate, and fell back to a typed 30% when there was no estimate.
 *
 * Tax copy is information, not advice: the block states engine estimates and
 * tells the model to describe no action for the money.
 */
import { gstHstLabel, gstHstRate } from "@agent-runway/core/engines/canadian-tax-engine";
import { taxPortionOfCommission } from "@agent-runway/core/engines/deal-tax-portion";
import { computeHSTCollected } from "@agent-runway/core/engines/hst-engine";
import {
  CANONICAL_TAX_DISCLAIMER,
  DEAL_TAX_PORTION_DEFINITION,
  TAX_ENGINE_ESTIMATE,
  dealTaxPortionLabel,
} from "@agent-runway/core/tax-copy";
import { fmtCurrency } from "@/lib/formatters";

/** The commission the worked example is built on. */
const EXAMPLE_GCI = 10_000;

export interface PaychequeAllocationInput {
  /** `user_settings.province` */
  province: string;
  /** `user_settings.brokerage_withholds_hst` */
  brokerageWithholdsHst: boolean;
  /** The agent's share of a commission, 0-1 (the pre-cap share under REAL). */
  agentPct: number;
  /** Projected year-end GCI (projection-engine). */
  projectedGCI: number;
  /** canadian-tax-engine `totalBurden`: the year's estimate. */
  annualTaxEstimate: number;
  /** canadian-tax-engine `perDealSetAside`. */
  perDealTaxPortion: number;
}

export function paychequeAllocationLines(input: PaychequeAllocationInput): string[] {
  const { brokerageWithholdsHst, agentPct, projectedGCI, annualTaxEstimate, perDealTaxPortion } = input;
  const province = input.province || "ontario";
  const hstRate = gstHstRate(province);
  const hstLabel = gstHstLabel(province);

  const lines: string[] = [];
  lines.push("── PAYCHEQUE ALLOCATION GUIDANCE ──");
  lines.push(
    `[SETUP] Province: ${input.province}. ${hstLabel} rate: ${(hstRate * 100).toFixed(1)}%. ` +
    `Brokerage withholds HST: ${brokerageWithholdsHst ? "YES — agent receives net-of-HST cheques" : "NO — agent receives full amount including HST"}.`,
  );

  const hasEstimate = annualTaxEstimate > 0 && projectedGCI > 0;
  lines.push(
    hasEstimate
      ? `[TAX PORTION OF A COMMISSION] ${TAX_ENGINE_ESTIMATE.what} ${DEAL_TAX_PORTION_DEFINITION} ` +
        `This year's estimate: ${fmtCurrency(annualTaxEstimate)}. Projected year-end GCI: ${fmtCurrency(projectedGCI)}. ` +
        `${TAX_ENGINE_ESTIMATE.perDeal} Per-deal tax portion: ${fmtCurrency(perDealTaxPortion)}. ` +
        `The deal-close screens print the tax portion of the commission just closed as "${dealTaxPortionLabel(province)}", worked out this way.`
      : `[TAX PORTION OF A COMMISSION] ${TAX_ENGINE_ESTIMATE.what} ` +
        `The engine's estimate for this year is ${fmtCurrency(0)} on the figures entered so far, so no tax portion of a commission is worked out.`,
  );

  // HST is charged on the full commission invoiced to the client, not on the
  // agent's split (D-4, Audit 1 2026-04-22), so the example works it out on
  // the invoiced commission. Registered is forced on: this is a worked
  // example, not a statement about the agent.
  const exampleHST = computeHSTCollected({
    ytdGCI: EXAMPLE_GCI,
    hstRate,
    isRegistered: true,
    brokerageWithholdsHst,
  });
  const exampleAgentGross = EXAMPLE_GCI * agentPct;
  const exampleTaxPortion = taxPortionOfCommission(EXAMPLE_GCI, projectedGCI, annualTaxEstimate);
  const exampleTax = hasEstimate
    ? `Tax portion of that $${EXAMPLE_GCI.toLocaleString()} commission (income tax + CPP, engine estimate): ~${fmtCurrency(exampleTaxPortion)}; ` +
      `the agent's split less that tax portion: ~${fmtCurrency(Math.max(0, exampleAgentGross - exampleTaxPortion))}. `
    : "";

  if (brokerageWithholdsHst) {
    lines.push(
      `[ALLOCATION MODEL — HST WITHHELD BY BROKERAGE] The brokerage collects ${hstLabel} on the invoiced commission and remits to CRA. ` +
      `The agent receives their split of the pre-${hstLabel} commission. ` +
      `Illustrative example: $${EXAMPLE_GCI.toLocaleString()} gross commission at ${(agentPct * 100).toFixed(0)}% split — agent receives $${exampleAgentGross.toFixed(0)} (${hstLabel} of ~$${exampleHST === 0 ? (EXAMPLE_GCI * hstRate).toFixed(0) : exampleHST.toFixed(0)} handled by the brokerage). ` +
      exampleTax +
      `${CANONICAL_TAX_DISCLAIMER}`,
    );
  } else {
    lines.push(
      `[ALLOCATION MODEL — AGENT HANDLES HST] The agent receives the full commission including ${hstLabel} on their split portion (the ${hstLabel} portion is collected for CRA — it does not belong to the agent). ` +
      `Illustrative example: $${EXAMPLE_GCI.toLocaleString()} gross commission at ${(agentPct * 100).toFixed(0)}% split — ${hstLabel} on the full invoiced commission is ~$${exampleHST.toFixed(0)} (collected for CRA), agent's split portion is $${exampleAgentGross.toFixed(0)}. ` +
      exampleTax +
      `Note: ${hstLabel} is calculated on the invoiced commission, not on the agent's split — the agent/brokerage split affects who keeps what, not the ${hstLabel} base. ` +
      `The ${hstLabel} portion represents trust funds collected on CRA's behalf; under the Excise Tax Act s.222, amounts collected are deemed held in trust for the Crown. ` +
      `CRA charges interest at the prescribed rate on unremitted amounts from the day after the remittance due date.`,
    );
  }

  lines.push(
    `[GUIDANCE TONE] When discussing paycheque allocation, state specific dollar amounts from the agent's actual commission amount, split, and province. ` +
    `Distinguish between the portion that belongs to the agent post-tax and the estimated income tax and HST collected for CRA. ` +
    `For basic allocation math the engine covers, state the math directly. ` +
    `For a commission of another size, apply the tax portion definition above to that commission and state the result as a dollar estimate. ` +
    `Do not state it as a percentage of the commission or as a marginal rate, and describe no action for the money. ` +
    `End tax-emitting responses with the canonical tax disclaimer: ${CANONICAL_TAX_DISCLAIMER}`,
  );
  lines.push("── END PAYCHEQUE ALLOCATION GUIDANCE ──");
  return lines;
}
