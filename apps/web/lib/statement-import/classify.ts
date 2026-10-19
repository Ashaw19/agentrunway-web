/**
 * A category and a business likelihood for each statement line, by rules
 * first (deterministic, no model): money in, transfers, card payments, tax
 * remittances and personal-looking merchants, then the receipt form's own
 * merchant hints (lib/receipts/category-hints.ts), then the export's own
 * category label. What the rules can't place goes to the model
 * (classify-model.ts).
 *
 * Information, not advice: these are estimates. A line below
 * PERSONAL_LIKELIHOOD_BELOW starts out skipped; the agent can include it.
 * Keys are always one of RECEIPT_CATEGORY_GROUPS' item keys.
 */
import { PERSONAL_LIKELIHOOD_BELOW, type StatementSkipReason } from "@agent-runway/core/engines/statement-import-engine";
import { suggestCategoryFromText } from "@/lib/receipts/category-hints";
import { isReceiptCategoryKey, receiptCategoryFullLabel, type ReceiptCategoryKey } from "@/lib/types/receipt";

export interface ClassifyInput {
  description: string;
  merchant: string | null;
  amount: number;
  direction: "out" | "in";
  sourceCategory: string | null;
  sourceBusiness: boolean | null;
}

export interface LineClassification {
  suggestedCategoryKey: ReceiptCategoryKey | null;
  categorySource: "hint" | "statement" | "model" | null;
  /** 0 to 1, or null with no estimate. */
  businessLikelihood: number | null;
  /** One short, descriptive sentence (no advice). */
  likelihoodReason: string;
  status: "pending" | "skipped";
  skipReason: StatementSkipReason | null;
}

const PAYMENT_IN = /\b(payment|paiement|pymt|pmt|thank you|merci|autopay)\b/i;
const TRANSFER = /\b(e-?\s?transfer|e-?tfr|interac e|send e|transfer|virement|tfr|xfer|mb-transfer|investment|tfsa|rrsp|celi|reer)\b/i;
const REFUND = /\b(refund|return|remboursement|reversal|credit voucher|adjustment)\b/i;
/**
 * A payment from a bank account to a credit card or line of credit:
 * "ONLINE BANKING PAYMENT - VISA", "INTERNET BILL PAY CIBC VISA",
 * "MB-CREDIT CARD/LOC PAY.", "PAYMENT MBNA", "BMO MC PAYMENT".
 */
const CARD_ISSUER = String.raw`(?:visa|mastercard|master card|mc|amex|american express|mbna|credit card|card\/loc|loc|line of credit|carte de cr[eé]dit|capital one|pc financial|rogers bank|triangle)`;
const CARD_PAYMENT_OUT = new RegExp(
  String.raw`\b${CARD_ISSUER}\b[^a-z]{0,3}(?:bill\s+)?(?:pay|payment|pmt|pymt|paiement)\b|\b(?:pay|payment|pmt|pymt|paiement|bill pay(?:ment)?)\b.*\b${CARD_ISSUER}\b`,
  "i",
);
const CASH = /\b(atm|abm|cash withdrawal|retrait guichet|guichet automatique)\b/i;
const LOAN = /\b(loan payment|mortgage|hypoth[eè]que|line of credit payment|loc payment|car loan)\b/i;
const TAX_REMITTANCE = /\b(cra|canada revenue|receiver general|rec gen|revenu canada|revenu quebec|gst\/?hst|hst payment|gst payment|tax payment|imp[oô]t)\b/i;
const BANK_FEE = /\b(interest charge|purchase interest|cash advance interest|interest charged|annual fee|monthly (?:account |plan )?fee|service charge|account fee|overdraft|nsf|foreign transaction fee|frais (?:mensuels|bancaires|de service)|int[eé]r[eê]ts?)\b/i;

/** Merchants that are almost always household spending. */
const PERSONAL = /\b(sobeys|loblaws|superstore|no frills|nofrills|food basics|metro inc|freshco|safeway|save-?on|foodland|farm boy|t&t|walmart supercentre grocery|grocery|groceries|epicerie|[eé]picerie|iga|maxi|provigo|shoppers drug|pharmasave|lawtons|guardian drugs|jean coutu|rexall|pharmacy|pharmacie|anbl|nslc|lcbo|saq|bc liquor|beer store|liquor|wine|netflix|disney|crave|spotify|apple music|prime video|youtube premium|winners|marshalls|homesense|old navy|gap|h&m|lululemon|sport chek|goodlife|planet fitness|anytime fitness|petsmart|pet valu|toys|daycare|garderie|tuition)\b/i;

/** Big-box retailers where a charge could be either. */
const MIXED_RETAIL = /\b(walmart|costco|amazon|dollarama|dollar tree|london drugs|best buy|canadian tire|home depot|rona|kent|home hardware)\b/i;

/** How likely a charge filed under this item is a business cost, before anything else is known. */
function baseLikelihood(key: string): number {
  if (key.startsWith("prof_")) return 0.9;
  if (key.startsWith("marketing_")) return 0.85;
  if (key.startsWith("edu_")) return 0.75;
  if (key === "office_software") return 0.75;
  if (key === "office_phone") return 0.65;
  if (key === "office_hardware") return 0.6;
  if (key === "office_supplies") return 0.55;
  if (key.startsWith("vehicle_")) return 0.65;
  if (key.startsWith("meals_")) return 0.45;
  if (key.startsWith("ent_")) return 0.35;
  if (key.startsWith("home_")) return 0.5;
  return 0.4;
}

/** The export's own category label (QuickBooks, Tangerine, National Bank) to an item key. */
const SOURCE_CATEGORY_RULES: Array<{ pattern: RegExp; key: ReceiptCategoryKey | null; personal?: boolean }> = [
  { pattern: /grocer|[eé]picerie|pharma|personal|personnel|clothing|v[eê]tement|kids|enfants/i, key: null, personal: true },
  // Parking first: "Car & Truck: Parking" is parking, which CRA lets be deducted in full.
  { pattern: /parking|stationnement/i, key: "vehicle_parking" },
  { pattern: /\bgas\b|fuel|essence|car\s*&\s*truck|vehicle|v[eé]hicule|automobile|auto\b/i, key: "vehicle_fuel" },
  { pattern: /meal|restaurant|dining|resto|food\s*&\s*drink/i, key: "meals_client" },
  { pattern: /advertis|marketing|publicit/i, key: "marketing_ads" },
  { pattern: /software|subscription|abonnement|logiciel/i, key: "office_software" },
  { pattern: /phone|internet|t[eé]l[eé]com|cell/i, key: "office_phone" },
  { pattern: /office|supplies|fournitures|bureau/i, key: "office_supplies" },
  { pattern: /legal|professional|accounting|comptab|bookkeep/i, key: "prof_accounting" },
  { pattern: /licen[cs]e|dues|cotisation|membership/i, key: "prof_board_mls" },
  { pattern: /education|training|course|formation/i, key: "edu_courses" },
  { pattern: /bank fee|frais bancaires|fees|frais|interest|int[eé]r[eê]t/i, key: "other_misc" },
  { pattern: /entertainment|divertissement/i, key: "ent_client" },
];

function clamp(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

function decided(
  key: ReceiptCategoryKey | null,
  source: LineClassification["categorySource"],
  likelihood: number,
  reason: string,
  skipReason: StatementSkipReason | null = null,
): LineClassification {
  const l = clamp(likelihood);
  const skip = skipReason ?? (l < PERSONAL_LIKELIHOOD_BELOW ? "personal" : null);
  return {
    suggestedCategoryKey: key,
    categorySource: key ? source : null,
    businessLikelihood: l,
    likelihoodReason: reason.slice(0, 200),
    status: skip ? "skipped" : "pending",
    skipReason: skip,
  };
}

/** What a line with no estimate is: pending, no category. */
export function unclassified(): LineClassification {
  return {
    suggestedCategoryKey: null,
    categorySource: null,
    businessLikelihood: null,
    likelihoodReason: "No category estimate for this line. Choose one to include it.",
    status: "pending",
    skipReason: null,
  };
}

/** The rules' answer for one line, or null to ask the model. */
export function classifyByRules(input: ClassifyInput): LineClassification | null {
  const text = `${input.merchant ?? ""} ${input.description}`.trim();

  if (input.direction === "in") {
    if (PAYMENT_IN.test(text)) return decided(null, null, 0, "Money in: a payment to this account. Not an expense.", "payment");
    if (TRANSFER.test(text)) return decided(null, null, 0, "Money in: a transfer. Not an expense.", "transfer");
    if (REFUND.test(text)) return decided(null, null, 0, "Money in: a refund. Refunds are not added as expenses.", "income");
    return decided(null, null, 0, "Money in: a deposit or credit. Not an expense.", "income");
  }

  if (CARD_PAYMENT_OUT.test(text)) return decided(null, null, 0, "A payment to a credit card. The charges on that card are the expenses.", "payment");
  if (TAX_REMITTANCE.test(text)) return decided(null, null, 0, "A payment to CRA or a tax authority. Tax and GST/HST payments are not T2125 expenses.", "payment");
  if (LOAN.test(text)) return decided(null, null, 0.05, "A loan or mortgage payment. Skipped; it can be included if it paid for a business cost.", "transfer");
  if (CASH.test(text) && !BANK_FEE.test(text)) return decided(null, null, 0.05, "A cash withdrawal. Skipped; what the cash paid for may have its own receipt.", "transfer");
  if (TRANSFER.test(text)) return decided(null, null, 0.15, "A transfer or e-Transfer. Skipped; it can be included if it paid for a business cost.", "transfer");

  if (input.sourceBusiness === false) {
    return decided(null, null, 0.05, "Marked Personal in the exported file.", "personal");
  }

  if (BANK_FEE.test(text)) {
    return decided("other_misc", "hint", 0.5, "A bank or card fee or interest. A business share applies when the account is used for the business.");
  }

  if (PERSONAL.test(text) && input.sourceBusiness !== true) {
    return decided(null, null, 0.1, "Indicated as personal spending from the merchant name (groceries, pharmacy, streaming or similar).", "personal");
  }

  const hinted = suggestCategoryFromText(input.merchant, input.description);
  if (hinted && isReceiptCategoryKey(hinted)) {
    let likelihood = baseLikelihood(hinted);
    if (MIXED_RETAIL.test(text)) likelihood = Math.min(likelihood, 0.4);
    if (input.sourceBusiness === true) likelihood = Math.max(likelihood, 0.9);
    const label = receiptCategoryFullLabel(hinted);
    const reason = hinted.startsWith("home_")
      ? `Estimated as ${label} from the merchant name. Only the home office share of a home bill counts as a business expense.`
      : input.sourceBusiness === true
        ? `Marked Business in the exported file; estimated as ${label} from the merchant name.`
        : `Estimated as ${label} from the merchant name.`;
    return decided(hinted, "hint", likelihood, reason);
  }

  if (input.sourceCategory) {
    for (const rule of SOURCE_CATEGORY_RULES) {
      if (!rule.pattern.test(input.sourceCategory)) continue;
      if (rule.personal && input.sourceBusiness !== true) {
        return decided(null, null, 0.1, `The exported file files it under "${input.sourceCategory}", indicated as personal.`, "personal");
      }
      if (rule.key) {
        const likelihood = input.sourceBusiness === true ? 0.9 : baseLikelihood(rule.key);
        return decided(rule.key, "statement", likelihood, `The exported file files it under "${input.sourceCategory}" (estimated as ${receiptCategoryFullLabel(rule.key)}).`);
      }
    }
  }

  // Nothing placed it (a Business flag with no item included): the model, then the agent.
  return null;
}
