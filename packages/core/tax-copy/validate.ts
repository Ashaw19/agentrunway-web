// Runtime validator for the tax-information-not-advice rule.
//
// Reference: memory/feedback_tax_information_not_advice.md
// Spec:      memory/spec_mobile_tax_info_not_advice_baseline.md §4 (Layer 1)
//
// Pure string-in / diagnostic-out. No I/O, no React, no platform deps.
// Consumers:
//   - Web tax surfaces (snapshot-tested via existing tests).
//   - Mobile <TaxBoundary> (Phase 2+ — dev-only walk of child text nodes).
//   - Navigator output-side filter (gated on §8 Q1 — deferred).
//   - ESLint Layer 2 rule (deferred this PR; see spec §4).
//
// Design notes:
//   - All regex patterns are compiled once at module load (per-pattern,
//     reused across calls). No per-call allocations beyond the diagnostic
//     array.
//   - Word-boundary correctness uses standard \b for single-word triggers.
//     "shouldering" must NOT match "should"; "you should" must match.
//   - Case-insensitivity via the `i` flag on every regex.
//   - Multi-word phrases tolerate internal whitespace runs (`\s+` between
//     words) but do not tolerate intervening words.
//   - Diagnostics are returned in source order (sorted by `start` index).

import {
  FORBIDDEN_VERBS,
  FORBIDDEN_PHRASES,
  QUALITATIVE_ADJECTIVES,
  QUALITATIVE_COPULAS,
  BARE_IMPERATIVES,
  BARE_IMPERATIVE_OBJECTS,
  type ForbiddenLevel,
} from "./forbidden-verbs";

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

/**
 * Severity level for a single diagnostic.
 *
 * Errors are unambiguously forbidden. Warnings are ambiguous matches (e.g.,
 * the noun form of "reserve") that the developer either suppresses with an
 * inline justification comment or rephrases.
 */
export type DiagnosticLevel = ForbiddenLevel;

/**
 * A single lint diagnostic produced by validateTaxCopy().
 */
export type Diagnostic = {
  readonly level: DiagnosticLevel;
  /** The matched verb / phrase / adjective / imperative. */
  readonly trigger: string;
  /** Inclusive start index of the match in the source string. */
  readonly start: number;
  /** Exclusive end index of the match in the source string. */
  readonly end: number;
  /** Human-readable explanation for ambiguous (warning-level) matches. */
  readonly note?: string;
  /**
   * Which detector produced this diagnostic — useful for callers that want
   * to filter by category (e.g., "I want errors only on bare imperatives").
   */
  readonly category:
    | "forbidden-verb"
    | "forbidden-phrase"
    | "qualitative-judgment"
    | "bare-imperative";
};

/**
 * Branded TaxCopy type. Compile-time tag indicating a string has been
 * validated against validateTaxCopy() with zero error-level diagnostics.
 *
 * The brand is purely structural — there is no runtime representation.
 * The runtime gate is asTaxCopy(), which throws on any error-level
 * diagnostic. Casting bypasses safety, hence asTaxCopy() is the only
 * exported producer.
 */
declare const taxCopyBrand: unique symbol;
export type TaxCopy = string & { readonly [taxCopyBrand]: never };

// ─────────────────────────────────────────────────────────────────────────
// Compiled regex patterns (built once at module load)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Escapes a string for use inside a regex.
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a regex matching a multi-word phrase with internal-whitespace
 * tolerance. "you should" matches "you should", "you  should",
 * "you\tshould".
 */
function buildPhraseRegex(phrase: string): RegExp {
  const words = phrase.split(/\s+/).map(escapeRegex);
  const inner = words.join("\\s+");
  // For phrases starting/ending with letters, anchor at word boundaries to
  // avoid partial-word matches (e.g., "pad" inside "padding"). Phrases
  // beginning with punctuation/apostrophes (e.g., `you'd want to`) still
  // get `\b` because `\b` sits at the letter/non-letter transition.
  return new RegExp(`\\b${inner}\\b`, "gi");
}

const FORBIDDEN_VERB_REGEXES: ReadonlyArray<{
  regex: RegExp;
  entry: (typeof FORBIDDEN_VERBS)[number];
}> = FORBIDDEN_VERBS.map((entry) => ({
  entry,
  regex: new RegExp(`\\b${escapeRegex(entry.verb)}\\b`, "gi"),
}));

const FORBIDDEN_PHRASE_REGEXES: ReadonlyArray<{
  regex: RegExp;
  entry: (typeof FORBIDDEN_PHRASES)[number];
}> = FORBIDDEN_PHRASES.map((entry) => ({
  entry,
  regex: buildPhraseRegex(entry.phrase),
}));

const QUALITATIVE_REGEXES: ReadonlyArray<{
  regex: RegExp;
  entry: (typeof QUALITATIVE_ADJECTIVES)[number];
}> = QUALITATIVE_ADJECTIVES.map((entry) => {
  const copulaAlt = QUALITATIVE_COPULAS.map(escapeRegex).join("|");
  // Match "[copula] [adjective]" at word boundaries. The full match span
  // covers both tokens so the diagnostic's start/end pinpoint the offending
  // construction, not just the adjective.
  const pattern = `\\b(?:${copulaAlt})\\s+${escapeRegex(entry.adjective)}\\b`;
  return { entry, regex: new RegExp(pattern, "gi") };
});

const BARE_IMPERATIVE_REGEXES: ReadonlyArray<{
  regex: RegExp;
  entry: (typeof BARE_IMPERATIVES)[number];
}> = BARE_IMPERATIVES.map((entry) => {
  const objectsAlt = BARE_IMPERATIVE_OBJECTS.map(escapeRegex).join("|");
  // Sentence-initial: start-of-string OR after sentence-terminator
  // (.!?) + whitespace. Match "[Verb] (your|the) [object]" — only the
  // verb token is captured for the trigger span, but the lookahead
  // requires the full prescriptive shape.
  const pattern = `(?:^|[.!?]\\s+)(${escapeRegex(entry.verb)})\\s+(?:your|the)\\s+(?:${objectsAlt})\\b`;
  return { entry, regex: new RegExp(pattern, "gi") };
});

// ─────────────────────────────────────────────────────────────────────────
// validateTaxCopy
// ─────────────────────────────────────────────────────────────────────────

/**
 * Scans a string for forbidden verbs / phrases / judgment patterns /
 * bare imperatives. Returns diagnostics in source order (by `start`).
 * Empty array means the string passes the lint.
 *
 * Pure function. No I/O. Safe to call from any environment.
 */
export function validateTaxCopy(text: string): Diagnostic[] {
  if (text.length === 0) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  // Single-word forbidden verbs
  for (const { regex, entry } of FORBIDDEN_VERB_REGEXES) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      diagnostics.push({
        level: entry.level,
        trigger: match[0],
        start: match.index,
        end: match.index + match[0].length,
        note: entry.note,
        category: "forbidden-verb",
      });
      // Guard against zero-width matches (cannot happen with \b but safe).
      if (match.index === regex.lastIndex) {
        regex.lastIndex += 1;
      }
    }
  }

  // Multi-word forbidden phrases
  for (const { regex, entry } of FORBIDDEN_PHRASE_REGEXES) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      diagnostics.push({
        level: entry.level,
        trigger: match[0],
        start: match.index,
        end: match.index + match[0].length,
        note: entry.note,
        category: "forbidden-phrase",
      });
      if (match.index === regex.lastIndex) {
        regex.lastIndex += 1;
      }
    }
  }

  // Qualitative-judgment patterns ([copula] [adjective])
  for (const { regex, entry } of QUALITATIVE_REGEXES) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      diagnostics.push({
        level: entry.level,
        trigger: match[0],
        start: match.index,
        end: match.index + match[0].length,
        note: entry.note,
        category: "qualitative-judgment",
      });
      if (match.index === regex.lastIndex) {
        regex.lastIndex += 1;
      }
    }
  }

  // Bare imperatives (sentence-initial verb + your/the + object)
  for (const { regex, entry } of BARE_IMPERATIVE_REGEXES) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      // match[1] is the captured verb (without the leading sentence
      // terminator). The diagnostic span covers just the verb.
      const verb = match[1];
      const verbStart = match.index + match[0].indexOf(verb);
      diagnostics.push({
        level: entry.level,
        trigger: verb,
        start: verbStart,
        end: verbStart + verb.length,
        note: entry.note,
        category: "bare-imperative",
      });
      if (match.index === regex.lastIndex) {
        regex.lastIndex += 1;
      }
    }
  }

  // Sort diagnostics by source order. Stable sort: among equal `start`
  // values, preserve insertion order (category priority above).
  diagnostics.sort((a, b) => a.start - b.start);

  return diagnostics;
}

// ─────────────────────────────────────────────────────────────────────────
// asTaxCopy — the branding gate
// ─────────────────────────────────────────────────────────────────────────

/**
 * Error thrown by asTaxCopy() when the input contains error-level
 * diagnostics. Warning-level diagnostics do not throw — they pass.
 */
export class TaxCopyValidationError extends Error {
  public readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    const summary = diagnostics
      .map((d) => `[${d.level}] "${d.trigger}" @ ${d.start}-${d.end}`)
      .join("; ");
    super(`Tax copy failed the info-not-advice lint: ${summary}`);
    this.name = "TaxCopyValidationError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Validates `text` and returns it branded as TaxCopy.
 *
 * Throws TaxCopyValidationError if any error-level diagnostic is present.
 * Warning-level diagnostics pass (caller's responsibility to surface them
 * out-of-band — e.g., a dev console warning).
 *
 * This is the only exported producer of TaxCopy. Casting via
 * `value as TaxCopy` is a code-smell — the lint should catch it, and if it
 * doesn't, the runtime check still gates the actual emission path.
 */
export function asTaxCopy(text: string): TaxCopy {
  const diagnostics = validateTaxCopy(text);
  const errors = diagnostics.filter((d) => d.level === "error");
  if (errors.length > 0) {
    throw new TaxCopyValidationError(errors);
  }
  return text as TaxCopy;
}
