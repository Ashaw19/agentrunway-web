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
