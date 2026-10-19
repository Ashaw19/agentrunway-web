/**
 * Dates and amounts as Canadian bank and card exports write them. Pure; no
 * I/O. Dates come back as YYYY-MM-DD calendar days (no time zone: a
 * statement date is the day printed on it).
 */
import { excelSerialToISO } from "@/lib/import/normalizers/normalize-dates";
import { parseMoneyLoose } from "@/lib/import/normalizers/normalize-money";

export type DateOrder = "ymd" | "mdy" | "dmy";

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, january: 1, janvier: 1,
  feb: 2, fev: 2, fevr: 2, february: 2, fevrier: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, april: 4, avril: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juin: 6,
  jul: 7, juil: 7, july: 7, juillet: 7,
  aug: 8, aou: 8, aout: 8, august: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, decembre: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function isoIfReal(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function monthFromWord(word: string): number | null {
  const w = stripAccents(word.toLowerCase()).replace(/\.$/, "");
  return MONTHS[w] ?? MONTHS[w.slice(0, 4)] ?? MONTHS[w.slice(0, 3)] ?? null;
}

/**
 * One date cell to YYYY-MM-DD, or null. `order` settles a numeric date like
 * 03/04/2026; with no order it is read month first (how North American
 * exports write it), unless a part over 12 shows otherwise.
 */
export function parseStatementDate(raw: string | null | undefined, order: DateOrder | null = null): string | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/^'+/, "");
  if (!s) return null;

  // Excel serial (an XLSX date cell read as a number).
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 30000 && n < 80000) return excelSerialToISO(Math.floor(n));
  }

  // A time after the date.
  s = s.replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm|z|[+-]\d{2}:?\d{2})?$/i, "").trim();

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return isoIfReal(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return isoIfReal(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(Number(m[3]));
    let dmy = order === "dmy";
    if (a > 12 && b <= 12) dmy = true;
    else if (b > 12 && a <= 12) dmy = false;
    return dmy ? isoIfReal(y, b, a) : isoIfReal(y, a, b);
  }

  // "07 Aug 2026", "7 août 2026", "15-Jan-2026", "15 janv. 26"
  m = stripAccents(s).match(/^(\d{1,2})[\s-]+([a-z]{3,9})\.?,?[\s-]+(\d{2}|\d{4})$/i);
  if (m) {
    const month = monthFromWord(m[2]);
    return month ? isoIfReal(fullYear(Number(m[3])), month, Number(m[1])) : null;
  }

  // "Aug 7, 2026", "August 07 2026"
  m = stripAccents(s).match(/^([a-z]{3,9})\.?[\s-]+(\d{1,2}),?[\s-]+(\d{2}|\d{4})$/i);
  if (m) {
    const month = monthFromWord(m[1]);
    return month ? isoIfReal(fullYear(Number(m[3])), month, Number(m[2])) : null;
  }

  return null;
}

/**
 * The order a column of numeric dates is written in, when its values show
 * it: a first part over 12 means day first, a second part over 12 means
 * month first. Null when every value could be either.
 */
export function detectDateOrder(values: readonly string[]): DateOrder | null {
  let dayFirst = false;
  let monthFirst = false;
  for (const raw of values) {
    const s = String(raw ?? "").trim();
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s) || /^\d{8}$/.test(s)) return "ymd";
    const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  if (dayFirst && !monthFirst) return "dmy";
  if (monthFirst && !dayFirst) return "mdy";
  return null;
}

/** True when the text reads as a date. */
export function looksLikeDate(raw: string | null | undefined): boolean {
  return parseStatementDate(raw) !== null;
}

export interface StatementAmount {
  /** Signed as written (a trailing minus or parentheses make it negative). */
  value: number;
  /** A "CR" or "DR" marker beside the number. */
  marker: "cr" | "dr" | null;
}

/**
 * One amount cell, or null when it is empty or not a number. Handles
 * "$1,234.56", "-12.34", "12.34-", "(12.34)", "12.34 CR", "1 234,56 $".
 */
export function parseStatementAmount(raw: string | null | undefined): StatementAmount | null {
  if (raw == null) return null;
  // Unicode minus signs and dashes (U+2212, en and em dashes, full-width) read as "-".
  let s = String(raw).trim().replace(/^'+/, "").replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, "-");
  if (!s || /^-+$/.test(s)) return null;
  s = s.replace(/^-\s+/, "-");

  let marker: StatementAmount["marker"] = null;
  const cr = s.match(/^(?:(cr|dr)\s*)?(.*?)(?:\s*(cr|dr))?$/i);
  if (cr && (cr[1] || cr[3])) {
    marker = (cr[1] || cr[3]).toLowerCase() as "cr" | "dr";
    s = cr[2].trim();
  }

  let negative = false;
  if (/-$/.test(s) && !/^-/.test(s)) {
    negative = true;
    s = s.slice(0, -1).trim();
  }
  s = s.replace(/^\+/, "");
  // A sign written after the currency symbol: "$-12.34", "$(12.34)", "CAD (12.34)".
  s = s.replace(/^([$£€]|ca\$|us\$|cad|usd)\s*-/i, "-$1");
  const wrapped = s.match(/^([$£€]|ca\$|us\$|cad|usd)\s*\((.*)\)$/i);
  if (wrapped) s = `(${wrapped[2]})`;
  // A minus inside the parentheses, or before them, is still one negative.
  if (/^-\s*\(.*\)$/.test(s)) s = s.replace(/^-\s*/, "");

  const n = parseMoneyLoose(s);
  if (!Number.isFinite(n)) return null;
  const value = Math.round((negative ? -n : n) * 100) / 100;
  return { value, marker };
}

/** True when the text reads as an amount. */
export function looksLikeAmount(raw: string | null | undefined): boolean {
  return parseStatementAmount(raw) !== null;
}
