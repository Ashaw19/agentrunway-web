// Forbidden / safe verb data for the tax-information-not-advice rule.
//
// Reference: memory/feedback_tax_information_not_advice.md
// Spec:      memory/spec_mobile_tax_info_not_advice_baseline.md §2
// Mirror of: apps/web/lib/flight-crew/system-prompts.ts forbidden-verb canon
//
// This module is DATA ONLY — no logic, no regex compilation, no validation.
// Consumers (validate.ts, future ESLint rule) compile the patterns
// themselves so the data shape stays portable.
//
// The lint follows the system-prompt list (production-hardened canon),
// which is a strict superset of the feedback-memory baseline. See spec §2
// "Rationale for the deltas".

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

/**
 * Severity level for a verb/phrase entry.
 *
 * - "error":   unambiguously forbidden in tax-or-money-proximate context.
 * - "warning": legitimate in some uses (noun forms, data-description usage,
 *              context-dependent meaning). The lint surfaces these for
 *              human review; the dev either suppresses with an inline
 *              comment justifying the use, or rephrases.
 */
export type ForbiddenLevel = "error" | "warning";

/**
 * A single forbidden-verb entry (one word, matched at word boundaries,
 * case-insensitive).
 */
export type ForbiddenVerb = {
  readonly verb: string;
  readonly level: ForbiddenLevel;
  /** Human-readable note explaining ambiguity (warning-level entries). */
  readonly note?: string;
};

/**
 * A multi-word phrase trigger. Matched whole-phrase, case-insensitive, with
 * tolerance for internal whitespace runs.
 */
export type ForbiddenPhrase = {
  readonly phrase: string;
  readonly level: ForbiddenLevel;
  readonly note?: string;
};

/**
 * A qualitative-judgment adjective. The lint detects the pattern
 *   [copula] [adjective]
 * where copula ∈ {is, are, looks, seems, appears} (case-insensitive).
 */
export type QualitativeAdjective = {
  readonly adjective: string;
  readonly level: ForbiddenLevel;
  readonly note?: string;
};

/**
 * A bare-imperative trigger. Matched sentence-initial (start of string OR
 * after `.`/`!`/`?` + optional whitespace), followed by `your` or
 * `the receipts/records/claims/forms`.
 */
export type BareImperative = {
  readonly verb: string;
  readonly level: ForbiddenLevel;
  readonly note?: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Single-word triggers (case-insensitive, word-boundary)
// ─────────────────────────────────────────────────────────────────────────

export const FORBIDDEN_VERBS: readonly ForbiddenVerb[] = [
  { verb: "should", level: "error" },
  { verb: "must", level: "error" },
  { verb: "recommend", level: "error" },
  { verb: "recommends", level: "error" },
  { verb: "recommended", level: "error" },
  { verb: "advise", level: "error" },
  { verb: "advises", level: "error" },
  { verb: "urge", level: "error" },
  { verb: "urges", level: "error" },
  { verb: "encourage", level: "error" },
  { verb: "encourages", level: "error" },
  { verb: "remind", level: "error" },
  { verb: "reminds", level: "error" },
  // Ambiguous: "the engine suggests $X" (OK as data description) vs
  // "I suggest you file" (forbidden as advice direction). Warning-level
  // forces human review.
  {
    verb: "suggests",
    level: "warning",
    note: "OK as data description (`the engine suggests $X`); forbidden as advice direction (`I suggest you file`).",
  },
  // "need" / "needs" / "needed" are only forbidden when followed by `to`
  // (e.g., "you need to"). The phrase form covers that; the bare verb is
  // not added here to avoid false positives on "this need" / "the needs of".
];

// ─────────────────────────────────────────────────────────────────────────
// Multi-word phrase triggers (case-insensitive, internal-whitespace-tolerant)
// ─────────────────────────────────────────────────────────────────────────

export const FORBIDDEN_PHRASES: readonly ForbiddenPhrase[] = [
  // Direct prescriptions to the user
  { phrase: "you should", level: "error" },
  { phrase: "you'd want to", level: "error" },
  { phrase: "you'll want to", level: "error" },
  { phrase: "you need to", level: "error" },
  { phrase: "you have to", level: "error" },
  { phrase: "you ought to", level: "error" },
  { phrase: "need to", level: "error" },
  { phrase: "ought to", level: "error" },

  // Endorsement / strategy framings
  { phrase: "the best way", level: "error" },
  { phrase: "the right move", level: "error" },
  { phrase: "a smart move", level: "error" },
  { phrase: "the smart thing", level: "error" },
  { phrase: "worth doing", level: "error" },

  // Vigilance / planning prescriptions
  { phrase: "keep an eye on", level: "error" },
  { phrase: "watch out for", level: "error" },
  { phrase: "plan for", level: "error" },
  { phrase: "prepare for", level: "error" },
  { phrase: "get ahead of", level: "error" },

  // Money-handling prescriptions
  { phrase: "set aside", level: "error" },
  { phrase: "earmark", level: "error" },
  { phrase: "build up", level: "error" },
  { phrase: "top up", level: "error" },

  // "reserve" — noun ("HST reserve") OK, prescriptive verb ("reserve $X")
  // forbidden. Warning-level for human review.
  {
    phrase: "reserve",
    level: "warning",
    note: "OK as a noun (HST reserve, cash reserve); forbidden as a prescriptive verb (reserve $X).",
  },
  // "pad" — same ambiguity as reserve (noun "buffer pad" vs verb "pad your
  // reserve"). Warning-level.
  {
    phrase: "pad",
    level: "warning",
    note: "OK as a noun; forbidden as a prescriptive verb (`pad your reserve`).",
  },

  // Reinforcing imperatives
  { phrase: "make sure to", level: "error" },
  { phrase: "be sure to", level: "error" },

  // "consider [verb-ing]" — borderline. Lint at warning-level so the dev
  // sees and either suppresses or rephrases.
  {
    phrase: "consider",
    level: "warning",
    note: "Forbidden in Navigator's voice when used as advice (`consider filing early`); rephrase as data description.",
  },

  // Prescription framings
  { phrase: "the fix is", level: "error" },
  { phrase: "the lever is", level: "error" },

  // Qualitative-zone phrase
  { phrase: "critical zone", level: "error" },
];

// ─────────────────────────────────────────────────────────────────────────
// Qualitative-judgment adjectives (forbidden after copula)
// ─────────────────────────────────────────────────────────────────────────

export const QUALITATIVE_ADJECTIVES: readonly QualitativeAdjective[] = [
  { adjective: "low", level: "error" },
  { adjective: "high", level: "error" },
  { adjective: "thin", level: "error" },
  { adjective: "healthy", level: "error" },
  { adjective: "concerning", level: "error" },
  { adjective: "manageable", level: "error" },
  { adjective: "sufficient", level: "error" },
  { adjective: "solid", level: "error" },
  { adjective: "weak", level: "error" },
  { adjective: "significant", level: "error" },
];

/**
 * Copulas that, when followed by a qualitative adjective, trigger the
 * qualitative-judgment lint.
 */
export const QUALITATIVE_COPULAS: readonly string[] = [
  "is",
  "are",
  "looks",
  "seems",
  "appears",
];

// ─────────────────────────────────────────────────────────────────────────
// Bare imperatives (sentence-initial verb followed by your / the [target])
// ─────────────────────────────────────────────────────────────────────────

export const BARE_IMPERATIVES: readonly BareImperative[] = [
  { verb: "Record", level: "error" },
  { verb: "Keep", level: "error" },
  { verb: "Track", level: "error" },
  { verb: "File", level: "error" },
  { verb: "Save", level: "error" },
  { verb: "Log", level: "error" },
  { verb: "Document", level: "error" },
];

/**
 * The set of object words that, when following a sentence-initial bare
 * imperative, trigger the bare-imperative lint. The pattern is:
 *   ^[Verb]\s+(your|the)\s+(receipts|records|claims|forms)
 */
export const BARE_IMPERATIVE_OBJECTS: readonly string[] = [
  "receipts",
  "records",
  "claims",
  "forms",
];

// ─────────────────────────────────────────────────────────────────────────
// Safe verbs / framings (advisory list — used in documentation and prompt
// authoring; not consumed by the runtime validator).
// ─────────────────────────────────────────────────────────────────────────

export const SAFE_VERBS: readonly string[] = [
  "indicates",
  "estimates",
  "reflects",
  "projects",
  "may",
  "could",
  "would",
];

export const SAFE_FRAMINGS: readonly string[] = [
  "per CRA",
  "per ITA s.",
  "per ETA s.",
  "the engine projects",
  "the math works out to",
  "the threshold sits at",
  "weighted value sits at",
  "based on",
];
