// Public API barrel for @agent-runway/core/tax-copy.
//
// Reference: memory/feedback_tax_information_not_advice.md
// Spec:      memory/spec_mobile_tax_info_not_advice_baseline.md §3

export {
  CANONICAL_TAX_DISCLAIMER,
  CANONICAL_TAX_DISCLAIMER_SHORT,
} from "./disclaimer";

export {
  DEAL_CLOSE_BREAKDOWN_HEADING,
  DEAL_TAX_PORTION_DEFINITION,
  dealTaxPortionLabel,
  dealTaxPortionNote,
  dealGstHstLabel,
  dealGstHstNote,
  type DealTaxPortionCopyInput,
  type DealGstHstCopyInput,
} from "./deal-tax-portion";

export {
  FORBIDDEN_VERBS,
  FORBIDDEN_PHRASES,
  QUALITATIVE_ADJECTIVES,
  QUALITATIVE_COPULAS,
  BARE_IMPERATIVES,
  BARE_IMPERATIVE_OBJECTS,
  SAFE_VERBS,
  SAFE_FRAMINGS,
  type ForbiddenLevel,
  type ForbiddenVerb,
  type ForbiddenPhrase,
  type QualitativeAdjective,
  type BareImperative,
} from "./forbidden-verbs";

export {
  validateTaxCopy,
  asTaxCopy,
  TaxCopyValidationError,
  type TaxCopy,
  type Diagnostic,
  type DiagnosticLevel,
} from "./validate";

export {
  TAX_ENGINE_TABLES,
  TAX_ENGINE_TABLES_SUMMARY,
  SELF_EMPLOYED_CPP,
  fmtBracketRate,
  fmtContributionRate,
} from "./engine-tables";

export {
  SMALL_SUPPLIER_LIMIT,
  SMALL_SUPPLIER_RULE,
  SMALL_SUPPLIER_RULE_SHORT,
  INCOME_TAX_INSTALMENT_DUE_DATES,
  INSTALMENT_DUE_DATES_RULE,
  INSTALMENT_NET_TAX_OWING_LIMIT,
  INSTALMENT_NET_TAX_OWING_LIMIT_QUEBEC,
  INSTALMENT_REQUIREMENT_RULE,
  INSTALMENT_WITHHOLDING_RULE,
  INSTALMENT_INTEREST_RULE,
  INSTALMENT_INTEREST_LEAST_RULE,
  INSTALMENT_REMINDERS_RULE,
  INSTALMENT_PENALTY_INTEREST_FLOOR,
  INSTALMENT_PENALTY_RULE,
  INSTALMENT_OPTIONS,
  INSTALMENT_OPTION_LIST,
  INSTALMENT_OPTIONS_RULE,
  INSTALMENT_OPTION_INTEREST_RULE,
  INSTALMENT_ENGINE_ESTIMATE,
  CRA_INSTALMENT_SOURCES,
  HST_RATE_GROUPS,
  GST_RATE_GROUP,
  GST_HST_RATE_RULE,
  fmtGstHstRate,
  gstHstRatePercent,
  INPUT_TAX_CREDIT_RULE,
  INPUT_TAX_CREDIT_EVIDENCE_RULE,
  INPUT_TAX_CREDIT_NOTE,
  CRA_GST_HST_SOURCES,
  BUSINESS_EXPENSE_RULE,
  PERSONAL_EXPENSE_RULE,
  MEALS_ENTERTAINMENT_RULE,
  CAPITAL_COST_ALLOWANCE_RULE,
  GST_HST_TRUST_RULE,
  BROKERAGE_HST_WITHHOLDING,
  brokerageHstWithholdingHint,
  gstHstReportNote,
  type GstHstReportNoteInput,
  type GstHstRateGroup,
} from "./cra-rules";

export {
  TAX_ENGINE_ESTIMATE,
  TAX_ESTIMATE_EXAMPLE_INCOMES,
  taxEstimateSpread,
  taxEstimateSpreadSentence,
  fmtTaxEstimateRate,
  type TaxEstimateAt,
  type TaxEstimateSpread,
} from "./engine-estimate";
