/**
 * The "Commission breakdown" on the two deal-close screens: the Closing Day
 * prompt on the dashboard and the celebration on the Transactions pipeline
 * tab. One function builds the rows so both screens show the same figures
 * under the same words.
 *
 * Tax copy is information, not advice: the tax rows state an engine estimate
 * and how it was worked out. The wording is `@agent-runway/core/tax-copy`.
 */
import { gstHstLabel, gstHstRate } from "@agent-runway/core/engines/canadian-tax-engine";
import type { DealTaxPortion } from "@agent-runway/core/engines/deal-tax-portion";
import { computeHSTCollected } from "@agent-runway/core/engines/hst-engine";
import {
  CANONICAL_TAX_DISCLAIMER_SHORT,
  DEAL_CLOSE_BREAKDOWN_HEADING,
  dealGstHstLabel,
  dealGstHstNote,
  dealTaxPortionLabel,
  dealTaxPortionNote,
} from "@agent-runway/core/tax-copy";

/** Share of the commission shown as "Fun money". */
const FUN_MONEY_SHARE = 0.10;

export type DealCloseBreakdownRowKey = "salesTax" | "incomeTax" | "funMoney" | "rest";

export interface DealCloseBreakdownRow {
  key: DealCloseBreakdownRowKey;
  label: string;
  /** Whole dollars. */
  amount: number;
  /** Printed beside the label as a percentage. The income tax row has none. */
  rate?: number;
  note: string;
}

export interface DealCloseBreakdownInput {
  /** The commission, as GCI. */
  gci: number;
  province: string;
  isGstHstRegistered: boolean;
  brokerageWithholdsHst: boolean;
  /** `dealCloseTaxPortion(...)`; null when there are no settings to estimate from. */
  taxPortion: DealTaxPortion | null;
}

export interface DealCloseBreakdown {
  heading: string;
  rows: DealCloseBreakdownRow[];
  /** Printed under the rows. */
  disclaimer: string;
}

export function dealCloseBreakdown(input: DealCloseBreakdownInput): DealCloseBreakdown {
  const { gci, isGstHstRegistered, brokerageWithholdsHst, taxPortion } = input;
  const province = input.province || "ontario";

  // Canonical HST helper: 0 when the agent isn't registered or the brokerage
  // remits the tax.
  const salesTaxRate = gstHstRate(province);
  const salesTaxLabel = gstHstLabel(province);
  const salesTax = Math.round(
    computeHSTCollected({
      ytdGCI: gci,
      hstRate: salesTaxRate,
      isRegistered: isGstHstRegistered,
      brokerageWithholdsHst,
    }),
  );
  const incomeTax = taxPortion ? Math.round(taxPortion.taxPortion) : 0;
  const funMoney = Math.round(gci * FUN_MONEY_SHARE);
  const rest = Math.max(0, Math.round(gci - incomeTax - funMoney));

  const rows: DealCloseBreakdownRow[] = [
    {
      key: "salesTax",
      label: dealGstHstLabel(salesTaxLabel),
      amount: salesTax,
      rate: salesTaxRate,
      note: dealGstHstNote({
        label: salesTaxLabel,
        registered: isGstHstRegistered,
        brokerageWithholds: brokerageWithholdsHst,
      }),
    },
  ];
  if (taxPortion) {
    rows.push({
      key: "incomeTax",
      label: dealTaxPortionLabel(province),
      amount: incomeTax,
      note: dealTaxPortionNote(taxPortion),
    });
  }
  rows.push(
    {
      key: "funMoney",
      label: `Fun money (${Math.round(FUN_MONEY_SHARE * 100)}%)`,
      amount: funMoney,
      note: "You earned it. Seriously.",
    },
    {
      key: "rest",
      label: "Rest of this commission",
      amount: rest,
      note: "Before your brokerage's split and fees, and business expenses.",
    },
  );

  return { heading: DEAL_CLOSE_BREAKDOWN_HEADING, rows, disclaimer: CANONICAL_TAX_DISCLAIMER_SHORT };
}
