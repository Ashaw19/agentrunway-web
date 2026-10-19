/**
 * Checks on what the model read from a PDF statement, in code: structured
 * output guarantees the shape, not the values. Never adds a line; a line that
 * fails a check is left out and said so.
 *
 *   - dates: real calendar days, inside the statement period (with a week's
 *     grace before it: a card statement lists purchases made a few days
 *     before its first posting day)
 *   - amounts: positive and finite; a direction on every line
 *   - signs consistent: when the statement prints its totals or balances,
 *     the lines must add up to them. If they add up only with money in and
 *     money out swapped, the directions were read backwards and are flipped.
 *   - line count: none, or an implausible number, fails the extraction
 *   - account and card numbers removed from every description
 *
 * Pure; no I/O. Nothing here logs a description or an amount.
 */
import { addDaysISO, daysBetweenISO } from "@agent-runway/core/lib/local-date";
import { merchantFromDescription, stripAccountNumbers } from "@/lib/import/bank-csv/scrub";
import type { ParsedStatementLine, StatementKind } from "@/lib/import/bank-csv/parse";
import { parseStatementDate } from "@/lib/import/bank-csv/values";
import type { StatementVerification } from "@agent-runway/core/engines/statement-import-engine";

/** How the mismatch warning starts, so a second reading can carry it over (betterReading). */
export const MISMATCH_WARNING_START = "The lines read don't add up to the statement's own totals";

export const UNVERIFIED_WARNING =
  "No totals or balances could be read from this PDF, so its lines couldn't be checked against the statement. They are confirmed one at a time.";

export interface ExtractedPdfStatement {
  institution: string | null;
  kind: StatementKind | null;
  period_start: string | null;
  period_end: string | null;
  currency: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  total_out: number | null;
  total_in: number | null;
  lines: Array<{
    date: string;
    posted_date: string | null;
    description: string;
    amount: number;
    direction: "out" | "in";
  }>;
}

export interface ValidatedPdfStatement {
  ok: boolean;
  /** Why it failed, for the agent. */
  error?: string;
  institution: string | null;
  kind: StatementKind | null;
  periodStart: string | null;
  periodEnd: string | null;
  lines: ParsedStatementLine[];
  warnings: string[];
  /** True when the printed totals or balances were there and the lines add up to them. */
  reconciled: boolean | null;
  /** Stored on the import: a mismatch or unverified PDF's lines are confirmed one at a time. */
  verification: StatementVerification;
  statedTotalOut: number | null;
  statedTotalIn: number | null;
  openingBalance: number | null;
  closingBalance: number | null;
}

/** The most lines one statement can plausibly hold. */
export const MAX_PDF_LINES = 1500;
/** Days before the period start a transaction date may fall. */
export const PERIOD_GRACE_DAYS = 7;
/** How far apart a sum and a printed total may be, in dollars. */
export const TOTAL_TOLERANCE = 0.05;

const money = (n: unknown): number | null => {
  const v = Number(n);
  return n === null || n === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
};
const near = (a: number, b: number) => Math.abs(a - b) <= TOTAL_TOLERANCE;

/**
 * `todayISO` is the Atlantic day (atlanticISODate()): a date after it is a
 * misread.
 */
export function validatePdfExtraction(
  raw: ExtractedPdfStatement,
  todayISO: string,
  kindHint: StatementKind | null = null,
): ValidatedPdfStatement {
  const warnings: string[] = [];
  const fail = (error: string): ValidatedPdfStatement => ({
    ok: false, error, institution: raw.institution ?? null, kind: raw.kind ?? null,
    periodStart: null, periodEnd: null, lines: [], warnings, reconciled: null, verification: "unverified",
    statedTotalOut: null, statedTotalIn: null, openingBalance: null, closingBalance: null,
  });

  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    return fail("No transactions were found in this PDF. If it is a scanned image, a CSV export from the bank's website may read better.");
  }
  if (raw.lines.length > MAX_PDF_LINES) return fail("This PDF lists more transactions than one statement holds. Try one month at a time.");
  if (raw.currency && !/^(cad|c\$|ca\$|\$|canadian)/i.test(raw.currency.trim())) {
    return fail("This statement is not in Canadian dollars. Only Canadian-dollar statements can be imported.");
  }

  let periodStart = parseStatementDate(raw.period_start ?? null, "ymd");
  let periodEnd = parseStatementDate(raw.period_end ?? null, "ymd");
  if (periodStart && periodEnd && periodStart > periodEnd) [periodStart, periodEnd] = [periodEnd, periodStart];
  if (periodStart && periodEnd && daysBetweenISO(periodStart, periodEnd) > 100) {
    warnings.push("The statement period read from the PDF is longer than three months; line dates were checked against it anyway.");
  }

  const lines: ParsedStatementLine[] = [];
  let badDate = 0;
  let outside = 0;
  let badAmount = 0;
  raw.lines.forEach((l, row) => {
    const date = parseStatementDate(l.date, "ymd");
    if (!date || date > todayISO) {
      badDate++;
      return;
    }
    if (periodStart && periodEnd && (date < addDaysISO(periodStart, -PERIOD_GRACE_DAYS) || date > periodEnd)) {
      outside++;
      return;
    }
    const amount = money(l.amount);
    if (amount === null || amount === 0 || Math.abs(amount) > 1_000_000 || (l.direction !== "out" && l.direction !== "in")) {
      badAmount++;
      return;
    }
    const description = stripAccountNumbers(String(l.description ?? "")).slice(0, 300);
    if (!description) {
      badAmount++;
      return;
    }
    lines.push({
      date,
      postedDate: parseStatementDate(l.posted_date ?? null, "ymd"),
      description,
      merchant: merchantFromDescription(description),
      // A negative amount read as money out stays money out.
      amount: Math.abs(amount),
      direction: l.direction,
      sourceCategory: null,
      sourceBusiness: null,
      balance: null,
      row,
    });
  });

  const dropped = badDate + outside + badAmount;
  if (outside > raw.lines.length * 0.1) {
    return fail("The dates read from this PDF don't fit its statement period, so nothing was imported. A CSV export from the bank's website reads more reliably.");
  }
  if (lines.length === 0) return fail("No transaction in this PDF could be read with a date and an amount.");
  if (badDate) warnings.push(`${badDate} line${badDate === 1 ? "" : "s"} had no readable date (or a date still to come) and ${badDate === 1 ? "was" : "were"} left out.`);
  if (outside) warnings.push(`${outside} line${outside === 1 ? "" : "s"} dated outside the statement period ${outside === 1 ? "was" : "were"} left out. Check ${outside === 1 ? "it" : "them"} against the statement.`);
  if (badAmount) warnings.push(`${badAmount} line${badAmount === 1 ? "" : "s"} had no readable amount and ${badAmount === 1 ? "was" : "were"} left out.`);

  // Identical repeated lines beyond reason: the model looped.
  const keys = new Map<string, number>();
  for (const l of lines) {
    const k = `${l.date}|${l.amount}|${l.direction}|${l.description}`;
    keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  const repeats = [...keys.values()].reduce((sum, n) => sum + (n > 3 ? n - 3 : 0), 0);
  if (repeats > lines.length * 0.25) return fail("The PDF could not be read cleanly (the same line came back many times). A CSV export reads more reliably.");

  // Totals and balances. The agent's choice of account kind wins over the
  // model's: it decides which way a balance moves.
  const modelKind = raw.kind === "bank" || raw.kind === "credit_card" ? raw.kind : null;
  const kind = kindHint ?? modelKind;
  if (kindHint && modelKind && kindHint !== modelKind) {
    warnings.push(`This PDF reads like a ${modelKind === "credit_card" ? "credit card" : "bank account"} statement, but it was imported as a ${kindHint === "credit_card" ? "credit card" : "bank account"}. Its balance was checked as a ${kindHint === "credit_card" ? "credit card" : "bank account"}.`);
  }
  const sum = (dir: "out" | "in", ls: ParsedStatementLine[]) => Math.round(ls.filter((l) => l.direction === dir).reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const statedOut = money(raw.total_out);
  const statedIn = money(raw.total_in);
  const opening = money(raw.opening_balance);
  const closing = money(raw.closing_balance);
  const hasTotals = statedOut !== null || statedIn !== null;
  const hasBalances = opening !== null && closing !== null;

  const totalsAgree = (ls: ParsedStatementLine[]): boolean =>
    (statedOut === null || near(sum("out", ls), Math.abs(statedOut))) &&
    (statedIn === null || near(sum("in", ls), Math.abs(statedIn)));
  const balancesAgree = (ls: ParsedStatementLine[]): boolean => {
    if (!hasBalances) return true;
    const out = sum("out", ls);
    const inn = sum("in", ls);
    // A bank balance goes down with money out; a card balance (what is owed) goes up.
    const bank = near(opening! - out + inn, closing!);
    const card = near(opening! + out - inn, closing!);
    return kind === "bank" ? bank : kind === "credit_card" ? card : bank || card;
  };

  let verification: StatementVerification = "unverified";
  if (hasTotals || hasBalances) {
    verification = totalsAgree(lines) && balancesAgree(lines) ? "reconciled" : "mismatch";
    // Directions read backwards are swapped only on the printed totals'
    // evidence, never on balances alone: a balance can't tell a misread sign
    // from a wrong account kind.
    if (verification === "mismatch" && hasTotals) {
      const flipped = lines.map((l) => ({ ...l, direction: l.direction === "out" ? ("in" as const) : ("out" as const) }));
      if (totalsAgree(flipped) && balancesAgree(flipped)) {
        lines.splice(0, lines.length, ...flipped);
        verification = "reconciled";
        warnings.push("Money in and money out were read the wrong way round and were swapped to match the statement's printed totals.");
      }
    }
    if (verification === "mismatch") {
      const parts: string[] = [];
      if (statedOut !== null) parts.push(`charges $${sum("out", lines).toFixed(2)} against $${Math.abs(statedOut).toFixed(2)} printed`);
      if (statedIn !== null) parts.push(`credits $${sum("in", lines).toFixed(2)} against $${Math.abs(statedIn).toFixed(2)} printed`);
      if (!hasTotals) parts.push("the opening and closing balances");
      warnings.push(`${MISMATCH_WARNING_START} (${parts.join("; ")}). Some lines may be missing or misread${dropped ? ", including the ones left out above" : ""}. Check them against the statement; they are confirmed one at a time.`);
    }
  } else {
    warnings.push(UNVERIFIED_WARNING);
  }
  const reconciled = verification === "reconciled" ? true : verification === "mismatch" ? false : null;

  if (!periodStart || !periodEnd) {
    const dates = lines.map((l) => l.date).sort();
    periodStart = periodStart ?? dates[0];
    periodEnd = periodEnd ?? dates[dates.length - 1];
  }

  return {
    ok: true,
    institution: raw.institution ? stripAccountNumbers(raw.institution).slice(0, 60) || null : null,
    kind,
    periodStart,
    periodEnd,
    lines,
    warnings,
    reconciled,
    verification,
    statedTotalOut: statedOut === null ? null : Math.abs(statedOut),
    statedTotalIn: statedIn === null ? null : Math.abs(statedIn),
    openingBalance: opening,
    closingBalance: closing,
  };
}
