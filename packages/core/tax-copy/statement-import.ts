// Copy for the bank and credit-card statement import (Expenses → Imports,
// Flight Crew's Navigator tools, the MCP server). Information, not advice:
// what a line is estimated to be, never what the agent is to do about it.
//
// Reference: memory/feedback_tax_information_not_advice.md
// Engine:    packages/core/engines/statement-import-engine.ts

import { asTaxCopy, type TaxCopy } from "./validate";

/** Why GST/HST is empty on an expense added from a statement line. */
export const STATEMENT_GST_HST_NOTE: TaxCopy = asTaxCopy(
  "A statement line does not show the GST/HST inside a charge, so an expense added from one is saved with GST/HST empty and no input tax credit is claimed on it. A receipt matched to the line carries the GST/HST printed on it.",
);

/** What the category and likelihood on a line are. */
export const STATEMENT_ESTIMATE_NOTE: TaxCopy = asTaxCopy(
  "The category and business likelihood on each line are estimates based on the merchant name and the statement's own labels. Nothing is added to your expenses until you confirm, and you can change any category first.",
);

/** What confirming a line already on file does. */
export const STATEMENT_DUPLICATE_NOTE: TaxCopy = asTaxCopy(
  "A charge counts once. A line that matches a receipt on file, or a charge from your Recurring Expenses list, is linked to it when confirmed and not added a second time.",
);

/** The Imports tab's footer and the confirm screen: where the records stand. */
export const STATEMENT_RECORDS_NOTE: TaxCopy = asTaxCopy(
  "Per CRA, one condition for claiming an ITC is having sufficient documentary evidence to substantiate it before the claim is made on a return. A statement line is a record of the charge, not a receipt. The list of charges with no receipt on file shows which ones a receipt could be matched to.",
);

/** A business likelihood as the number shown beside a line ("82% business"). */
export function businessLikelihoodLabel(likelihood: number | null | undefined): string {
  if (likelihood == null || !Number.isFinite(Number(likelihood))) return "No estimate";
  return `${Math.round(Math.min(1, Math.max(0, Number(likelihood))) * 100)}% business`;
}

/**
 * The confirm screen's summary, e.g. "12 lines will be added to your expense
 * records with the category shown. 3 are already on file and will be linked,
 * not added again. Nothing is saved until you confirm."
 */
export function statementConfirmSummary(counts: { create: number; link: number; recurring: number; held: number }): TaxCopy {
  const parts: string[] = [];
  const s = (n: number) => (n === 1 ? "" : "s");
  parts.push(
    counts.create > 0
      ? `${counts.create} line${s(counts.create)} will be added to your expense records with the category shown.`
      : "No new expenses will be added.",
  );
  const onFile = counts.link + counts.recurring;
  if (onFile > 0) parts.push(`${onFile} ${onFile === 1 ? "is" : "are"} already on file and will be linked, not added again.`);
  if (counts.held > 0) parts.push(`${counts.held} could be a charge already on file and ${counts.held === 1 ? "stays" : "stay"} in review until you match ${counts.held === 1 ? "it" : "them"} or mark ${counts.held === 1 ? "it" : "them"} as a different charge.`);
  parts.push("Nothing is saved until you confirm.");
  return asTaxCopy(parts.join(" "));
}
