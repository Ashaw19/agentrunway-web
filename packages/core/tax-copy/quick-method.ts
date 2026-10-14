// CRA's quick method remittance rates for a business that provides services,
// stated once so the Tax IQ tip, Flight Crew's knowledge and the public guide
// cannot drift apart.
//
// Source: CRA guide RC4058, "Quick Method of Accounting for GST/HST" (Rev. 25)
//   canada.ca/en/revenue-agency/services/forms-publications/publications/rc4058/quick-method-accounting-gst-hst.html
//   (page dated 2025-07-21, read 2026-10-13)
//
// Why this exists: until 2026-10-13 the Tax IQ tip said the rate "for service
// providers in most provinces" is "often 8.8%", and Flight Crew's knowledge
// said "typically 8.8%". 8.8% is the rate for one province, Ontario. An agent
// in New Brunswick is on 10%, one in Alberta on 3.6%.
//
// What is here: the rate for a business that provides services, whose
// permanent establishment and supplies are in the same province. That is the
// case for an agent selling in the province they are licensed in. RC4058 has
// a second table for goods bought for resale and other rates for supplies
// made in another province; neither is repeated here.
//
// Every string built here goes through asTaxCopy(), so a forbidden verb is a
// failing test (__tests__/quick-method.test.ts), not a shipped sentence.

import { asTaxCopy, type TaxCopy } from "./validate";

export const QUICK_METHOD_SOURCE = {
  guide: "RC4058",
  title: "Quick Method of Accounting for GST/HST",
  url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4058/quick-method-accounting-gst-hst.html",
  readOn: "2026-10-13",
} as const;

/** Annual worldwide taxable supplies, GST/HST included, at or under which the election is open. */
export const QUICK_METHOD_REVENUE_LIMIT = 400_000;

/** The 1% credit applies to this much of each fiscal year's eligible supplies, GST/HST included. */
export const QUICK_METHOD_CREDIT_BASE = 30_000;
export const QUICK_METHOD_CREDIT_RATE = 0.01;

export interface QuickMethodServiceRate {
  /** Province keys as `user_settings.province` holds them. */
  provinces: readonly string[];
  /** How the page names the group. */
  label: string;
  /** The GST/HST charged there, as copy: "5% GST", "15% HST". */
  taxCharged: string;
  /** Remittance rate on revenue including the GST/HST. */
  rate: number;
  /** Set when the rate applies from a date. */
  since?: string;
}

/**
 * Services, permanent establishment and supplies in the same province.
 * Quebec is absent: Revenu Québec administers the GST there and RC4058 gives
 * no rate for it.
 */
export const QUICK_METHOD_SERVICE_RATES: readonly QuickMethodServiceRate[] = [
  {
    provinces: ["britishColumbia", "alberta", "saskatchewan", "manitoba", "yukon", "northwestTerritories", "nunavut"],
    label: "British Columbia, Alberta, Saskatchewan, Manitoba, Yukon, Northwest Territories, Nunavut",
    taxCharged: "5% GST",
    rate: 0.036,
  },
  { provinces: ["ontario"], label: "Ontario", taxCharged: "13% HST", rate: 0.088 },
  {
    provinces: ["novaScotia"],
    label: "Nova Scotia",
    taxCharged: "14% HST",
    rate: 0.094,
    since: "April 1, 2025",
  },
  {
    provinces: ["newBrunswick", "newfoundland", "princeEdwardIsland"],
    label: "New Brunswick, Newfoundland and Labrador, Prince Edward Island",
    taxCharged: "15% HST",
    rate: 0.1,
  },
];

/** "8.8%", "10%", "3.6%" */
export function fmtQuickMethodRate(rate: number): string {
  return `${Number((rate * 100).toFixed(1))}%`;
}

/** The row for a province, or null where RC4058 gives none (Quebec, an unknown key). */
export function quickMethodServiceRate(province: string | null | undefined): QuickMethodServiceRate | null {
  if (!province) return null;
  return QUICK_METHOD_SERVICE_RATES.find((row) => row.provinces.includes(province)) ?? null;
}

/** "3.6% where 5% GST is charged; 8.8% in Ontario; 9.4% in Nova Scotia; 10% in New Brunswick, …" */
export const QUICK_METHOD_SERVICE_RATES_LIST: string = QUICK_METHOD_SERVICE_RATES.map((row) =>
  row.taxCharged.endsWith("GST")
    ? `${fmtQuickMethodRate(row.rate)} where ${row.taxCharged} is charged`
    : `${fmtQuickMethodRate(row.rate)} in ${row.label}`,
).join("; ");

/** The rates for every province, in one sentence. For copy that does not know the reader's province. */
export const QUICK_METHOD_SERVICE_RATES_RULE: TaxCopy = asTaxCopy(
  `Per CRA guide ${QUICK_METHOD_SOURCE.guide}, the quick method remittance rate for a business that provides services, with its permanent establishment and its supplies in the same province, is ${QUICK_METHOD_SERVICE_RATES_LIST}. The rate is applied to revenue including the GST/HST.`,
);

/**
 * The rate for one province, or the all-province rule where RC4058 gives no
 * single rate for it.
 */
export function quickMethodServiceRateSentence(province: string | null | undefined): TaxCopy {
  const row = quickMethodServiceRate(province);
  if (!row) return QUICK_METHOD_SERVICE_RATES_RULE;
  return asTaxCopy(
    `Per CRA guide ${QUICK_METHOD_SOURCE.guide}, the quick method remittance rate for a business that provides services, with its permanent establishment and its supplies in a province charging ${row.taxCharged}, is ${fmtQuickMethodRate(row.rate)} of revenue including the GST/HST.`,
  );
}
