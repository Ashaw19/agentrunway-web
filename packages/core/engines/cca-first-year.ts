/**
 * The first-year treatment of a capital cost allowance (CCA) addition, per
 * CRA's Guide T4002, Chapter 4.
 *
 * CRA (T4002 ch.4): in the year property is added, "you can usually claim
 * CCA on half of your net additions" (the half-year rule), but "the
 * half-year rule does not apply to AIIPs, ZEVs, Class 56 properties, or,
 * under proposed changes, RIIPs".
 *   - AIIP (accelerated investment incentive property): acquired after
 *     November 20, 2018, and available for use before 2028; under proposed
 *     changes, acquired before 2025.
 *   - RIIP (reaccelerated investment incentive property): acquired after
 *     2024 and available for use before 2034, with a four-year phase-out
 *     for property available for use after 2029 (CRA, What's new for small
 *     businesses and self-employed). The 2025 guide still says "under
 *     proposed changes", but CRA's Income Tax Folio S3-F4-C1 notice says
 *     these measures were enacted on March 26, 2026 (Bill C-15), deemed in
 *     force January 1, 2025. Finance's table: 2025 to 2029 "up to 3x normal
 *     rate", 2030 to 2033 "up to 2x".
 *   - Class 50 (computers, 55%): "Under proposed changes, new additions of
 *     Class 50 property are eligible for an enhanced first-year deduction of
 *     100%", for property "acquired after April 15, 2024, and that becomes
 *     available for use before 2027" (T4002 ch.4). Property available for
 *     use in 2027 goes back to the AII or RII.
 *
 * The factor is what the year's net additions count for in the CCA base:
 * base = UCC − net additions + net additions × factor. So 0.5 is the
 * half-year rule, 1 is the full rate in the first year, and 1.5 is the
 * enhanced first-year allowance (one and a half times the full rate).
 *
 * The date used is the acquisition date, taken as the date the property
 * became available for use (the app does not record the two separately).
 * Before 2028 and 2030 the two only differ for property bought near the
 * end of a year and put to use in the next.
 *
 * Pure: no I/O.
 */

export type FirstYearRule =
  /** CRA's general rule: half of the year's net additions. */
  | "half_year"
  /** AIIP available for use before 2024: 1.5 times the full rate. */
  | "aiip_enhanced"
  /** AIIP available for use 2024 to 2027: the full rate, no half-year rule. */
  | "aiip_full"
  /** RIIP available for use before 2030: 1.5 times the full rate. */
  | "riip_enhanced"
  /** RIIP in its phase-out (available for use 2030 to 2033): the full rate. */
  | "riip_full"
  /** Class 50 acquired after April 15, 2024, in use before 2027: 100% of the addition (proposed, per T4002). */
  | "class50_full"
  /** A class the half-year rule doesn't apply to (as the class is recorded). */
  | "not_subject";

export interface FirstYearTreatment {
  rule: FirstYearRule;
  /** What the year's net additions count for in the CCA base. */
  factor: number;
  /** CRA's guide describes it as a proposed change. */
  proposed: boolean;
}

const TREATMENT: Record<FirstYearRule, FirstYearTreatment> = {
  half_year: { rule: "half_year", factor: 0.5, proposed: false },
  aiip_enhanced: { rule: "aiip_enhanced", factor: 1.5, proposed: false },
  aiip_full: { rule: "aiip_full", factor: 1, proposed: false },
  riip_enhanced: { rule: "riip_enhanced", factor: 1.5, proposed: false },
  riip_full: { rule: "riip_full", factor: 1, proposed: false },
  class50_full: { rule: "class50_full", factor: 1, proposed: true },
  not_subject: { rule: "not_subject", factor: 1, proposed: false },
};

/** AIIP: acquired after this date. */
const AIIP_FROM = "2018-11-21";
/** Under proposed changes: AIIP acquired before this date; RIIP on or after it. */
const RIIP_FROM = "2025-01-01";

/** Class 50's 100% first-year deduction: acquired after this date ... */
const CLASS50_FULL_FROM = "2024-04-16";
/** ... and available for use before this year. */
const CLASS50_FULL_BEFORE_YEAR = 2027;

/**
 * The first-year treatment of an addition acquired (and put to use) on
 * `acquisitionDate` (YYYY-MM-DD), in a class the half-year rule applies to
 * (`classHalfYear`). `ccaClass` and `classRate` pick out Class 50's 100%
 * deduction (its factor is 1 ÷ the rate, so base × rate = the addition).
 * A date that can't be read gets CRA's general rule.
 */
export function firstYearTreatment({
  acquisitionDate,
  classHalfYear,
  ccaClass,
  classRate,
}: {
  acquisitionDate: string | null | undefined;
  classHalfYear: boolean;
  ccaClass?: number;
  classRate?: number;
}): FirstYearTreatment {
  if (!classHalfYear) return TREATMENT.not_subject;
  const date = /^\d{4}-\d{2}-\d{2}/.test(acquisitionDate ?? "") ? acquisitionDate!.slice(0, 10) : null;
  if (!date) return TREATMENT.half_year;
  const year = Number(date.slice(0, 4));

  if (ccaClass === 50 && classRate && classRate > 0 && date >= CLASS50_FULL_FROM && year < CLASS50_FULL_BEFORE_YEAR) {
    return { ...TREATMENT.class50_full, factor: 1 / classRate };
  }

  if (date >= AIIP_FROM && date < RIIP_FROM) {
    if (year < 2024) return TREATMENT.aiip_enhanced;
    if (year < 2028) return TREATMENT.aiip_full;
    return TREATMENT.half_year;
  }
  if (date >= RIIP_FROM) {
    if (year < 2030) return TREATMENT.riip_enhanced;
    if (year < 2034) return TREATMENT.riip_full;
    return TREATMENT.half_year;
  }
  return TREATMENT.half_year;
}

/**
 * The CCA for one asset in a year, per CRA's chart: the base is the UCC
 * with the year's net additions counted at the first-year factor; the CCA
 * is the base × the class rate, never more than the UCC; the business part
 * is claimed. `fullCca` is what reduces the UCC.
 */
export function ccaForYear({
  ucc,
  netAdditions,
  factor,
  rate,
  businessUsePct,
}: {
  ucc: number;
  netAdditions: number;
  factor: number;
  rate: number;
  businessUsePct: number;
}): { base: number; fullCca: number; claimed: number; closingUcc: number } {
  if (!(ucc > 0)) return { base: 0, fullCca: 0, claimed: 0, closingUcc: Math.max(0, ucc || 0) };
  const added = Math.max(0, netAdditions);
  const base = Math.max(0, ucc - added + added * factor);
  const fullCca = Math.min(ucc, base * rate);
  const share = Math.min(1, Math.max(0, businessUsePct));
  return { base, fullCca, claimed: fullCca * share, closingUcc: Math.max(0, ucc - fullCca) };
}
