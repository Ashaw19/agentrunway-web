/**
 * lib/import/validation/validate-transactions.ts
 *
 * Deterministic post-extraction validators.
 *
 * Runs AFTER the LLM returns extracted values. Checks for impossible or
 * suspicious combinations using hard arithmetic rules — no AI involved.
 *
 * Design principles:
 *   • We FLAG issues, we do not silently discard deals.
 *   • We downgrade confidence when a field fails a check.
 *   • We are conservative — thresholds are wide enough to avoid false positives
 *     on legitimate edge cases (referral fees, land sales, luxury properties).
 *   • Heuristics win over LLM: if a validator finds something wrong, it overrides
 *     whatever confidence the LLM self-reported.
 *
 * ─── Field semantics (must match prompts and types.ts) ───────────────────────
 *   gci               = PRE-split gross commission income
 *   net_income        = POST-split amount agent receives
 *   sale_price        = Property transaction price (null if unknown)
 *   commission_percent = Decimal rate (0.03 = 3%)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ExtractedDeal } from "@/app/api/import-history/route";

export interface ValidationResult {
  /** Human-readable issue descriptions — attached to the deal's issues[]. */
  issues: string[];
  /** Confidence fields to downgrade — overrides LLM's self-reported confidence. */
  confidence_overrides: Partial<NonNullable<ExtractedDeal["confidence"]>>;
}

/** Canadian real estate thresholds. Adjust if expanding internationally. */
const THRESHOLDS = {
  /** A GCI below this is almost always a commission rate misread as dollars. */
  GCI_MIN_DOLLARS:        200,
  /** A GCI above this is suspicious — likely a sale price pulled in by mistake. */
  GCI_MAX_DOLLARS:        500_000,
  /** If GCI > this fraction of sale_price, something is wrong. */
  GCI_MAX_FRACTION_OF_SP: 0.25,
  /** Sale prices below this are not realistic for Canadian real estate. */
  SALE_PRICE_MIN:         5_000,
  /** Commission rates above this are not realistic. */
  COMMISSION_MAX:         0.20,
  /** Commission rates below this suggest a decimal entry error. */
  COMMISSION_MIN:         0.001,
  /** GCI vs (sale_price × commission_percent) tolerance before flagging. */
  GCI_COMMISSION_TOLERANCE: 0.35,
  /** Days in the future beyond which a closing date is flagged. */
  FUTURE_DATE_GRACE_DAYS: 90,
};

/**
 * Run all deterministic validators against a single extracted deal.
 * Returns issues and confidence overrides — does NOT mutate the input.
 *
 * @param deal          The extracted deal to validate.
 * @param effectiveYear The calendar year the document covers (from sheet name or LLM).
 *                      Pass undefined to skip year-matching check.
 */
export function validateExtractedDeal(
  deal: ExtractedDeal,
  effectiveYear?: number,
): ValidationResult {
  const issues: string[] = [];
  const overrides: Partial<NonNullable<ExtractedDeal["confidence"]>> = {};

  const gci               = typeof deal.gci === "number"               ? deal.gci               : 0;
  const sale_price        = typeof deal.sale_price === "number"        ? deal.sale_price        : null;
  const net_income        = typeof deal.net_income === "number"        ? deal.net_income        : null;
  const commission_pct    = typeof deal.commission_percent === "number" ? deal.commission_percent : null;

  // ── GCI checks ────────────────────────────────────────────────────────────

  if (gci <= 0) {
    // Zero GCI is caught upstream (computeAggregates skips these in the batch filter),
    // but flag it so the UI can show a meaningful warning.
    issues.push("GCI is zero or missing — this deal will not be counted in your annual total");
    overrides.gci = "missing";
  } else if (gci < THRESHOLDS.GCI_MIN_DOLLARS) {
    // A GCI under $200 almost certainly means the LLM extracted a commission percentage
    // (e.g., "3") as if it were a dollar amount. Real referral fees can be small, so
    // we flag rather than reject.
    issues.push(
      `GCI of $${gci} is unusually low — verify this is a dollar amount, not a commission rate`,
    );
    overrides.gci = "low";
  } else if (gci > THRESHOLDS.GCI_MAX_DOLLARS) {
    issues.push(
      `GCI of $${gci.toLocaleString()} is very high — verify this is commission income, not the sale price`,
    );
    overrides.gci = "low";
  }

  // ── Sale price checks ─────────────────────────────────────────────────────

  if (sale_price !== null && sale_price > 0) {
    if (sale_price < THRESHOLDS.SALE_PRICE_MIN) {
      issues.push(
        `Sale price of $${sale_price.toLocaleString()} is unusually low for real estate`,
      );
      overrides.sale_price = "low";
    }

    // If GCI is more than 25% of the reported sale price, the wrong column was used
    if (gci > 0 && gci > sale_price * THRESHOLDS.GCI_MAX_FRACTION_OF_SP) {
      issues.push(
        `GCI ($${gci.toLocaleString()}) is ${((gci / sale_price) * 100).toFixed(1)}% of sale price ` +
        `— commission income should typically be 1–5% of the property price`,
      );
      overrides.gci        = "low";
      overrides.sale_price = "low";
    }
  }

  // ── Net income checks ─────────────────────────────────────────────────────

  if (net_income !== null && net_income > 0 && gci > 0) {
    // Net income can never exceed gross — allow 1% tolerance for rounding
    if (net_income > gci * 1.01) {
      issues.push(
        `Net income ($${net_income.toLocaleString()}) exceeds GCI ($${gci.toLocaleString()}) ` +
        `— net income is always ≤ GCI`,
      );
      overrides.net_income = "low";
    }

    // Split ratio sanity: net/gci should be between 50% and 100%
    const split = net_income / gci;
    if (split < 0.40) {
      issues.push(
        `Implied brokerage split of ${(split * 100).toFixed(0)}% is unusually low — verify GCI and net income`,
      );
    }
  }

  // ── Commission percent checks ─────────────────────────────────────────────

  if (commission_pct !== null && commission_pct > 0) {
    if (commission_pct > THRESHOLDS.COMMISSION_MAX) {
      issues.push(
        `Commission rate of ${(commission_pct * 100).toFixed(2)}% is unusually high ` +
        `— verify this is a decimal fraction (e.g. 0.03 for 3%), not a percentage`,
      );
      overrides.commission_percent = "low";
    } else if (commission_pct < THRESHOLDS.COMMISSION_MIN) {
      issues.push(
        `Commission rate of ${(commission_pct * 100).toFixed(4)}% is unusually low`,
      );
      overrides.commission_percent = "low";
    }

    // Cross-check: GCI ≈ sale_price × commission_percent (within tolerance)
    if (gci > 0 && sale_price !== null && sale_price > 0) {
      const implied = sale_price * commission_pct;
      const ratio   = Math.abs(gci - implied) / implied;
      if (ratio > THRESHOLDS.GCI_COMMISSION_TOLERANCE) {
        issues.push(
          `GCI ($${gci.toLocaleString()}) is inconsistent with ` +
          `sale price × commission rate ($${Math.round(implied).toLocaleString()}) — ` +
          `one of these values may be wrong`,
        );
      }
    }
  }

  // ── Date checks ───────────────────────────────────────────────────────────

  if (deal.date) {
    const d = new Date(deal.date + "T12:00:00");

    if (isNaN(d.getTime())) {
      issues.push(`Date "${deal.date}" could not be parsed — check the format`);
      overrides.date = "low";
    } else {
      // Year-match check
      if (effectiveYear !== undefined && d.getFullYear() !== effectiveYear) {
        issues.push(
          `Date ${deal.date} is in year ${d.getFullYear()} but document covers ${effectiveYear} ` +
          `— this deal will not be included in the ${effectiveYear} totals`,
        );
        overrides.date = "low";
      }

      // Future date check (allow grace period for pending closings)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + THRESHOLDS.FUTURE_DATE_GRACE_DAYS);
      if (d > cutoff) {
        issues.push(`Date ${deal.date} is more than ${THRESHOLDS.FUTURE_DATE_GRACE_DAYS} days in the future`);
        overrides.date = "low";
      }
    }
  }

  return { issues, confidence_overrides: overrides };
}

/**
 * Apply validation results onto a deal's confidence and issues arrays.
 *
 * Pure function — returns a new deal object, never mutates input.
 * Safe to call in a pipeline after computeAggregates().
 */
export function applyValidation(
  deal: ExtractedDeal,
  effectiveYear?: number,
): ExtractedDeal {
  const { issues, confidence_overrides } = validateExtractedDeal(deal, effectiveYear);

  if (issues.length === 0) return deal; // fast path: nothing to update

  const updatedConfidence = deal.confidence
    ? { ...deal.confidence, ...confidence_overrides }
    : undefined;

  return {
    ...deal,
    confidence: updatedConfidence,
    issues: [...(deal.issues ?? []), ...issues],
  };
}
