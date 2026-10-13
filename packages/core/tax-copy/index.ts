// Public API barrel for @agent-runway/core/tax-copy.
//
// Reference: memory/feedback_tax_information_not_advice.md
// Spec:      memory/spec_mobile_tax_info_not_advice_baseline.md §3

export {
  CANONICAL_TAX_DISCLAIMER,
  CANONICAL_TAX_DISCLAIMER_SHORT,
} from "./disclaimer";

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
  CRA_INSTALMENT_SOURCES,
  GST_HST_TRUST_RULE,
  BROKERAGE_HST_WITHHOLDING,
  brokerageHstWithholdingHint,
  gstHstReportNote,
  type GstHstReportNoteInput,
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
