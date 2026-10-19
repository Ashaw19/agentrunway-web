/**
 * Bank and credit-card statement exports → statement lines. Deterministic:
 * no model is involved. Shared by the Expenses → Imports upload
 * (/api/statement-import) and the Director Cockpit's bank reconciliation
 * (/api/cockpit/bank-statements), which this generalizes.
 *
 * Layouts recognised (documented in __tests__/fixtures, synthetic values):
 *   RBC            header: Account Type, Account Number, Transaction Date, Cheque Number,
 *                  Description 1, Description 2, CAD$, USD$. Signed; negative = out (cards too).
 *   TD             no header: Date (MM/DD/YYYY), Description, Debit, Credit, Balance.
 *   Scotiabank     new header: Filter, Date, Description, Sub-description, [Status,]
 *                  Type of Transaction, Amount[, Balance]. Type Debit/Credit decides.
 *                  Old, no header: Date, Amount, -, Type, Description.
 *   BMO            preamble "Following data is valid as of ...", then
 *                  bank: First Bank Card, Transaction Type, Date Posted, Transaction Amount, Description
 *                  card: Item #, Card #, Transaction Date, Posting Date, Transaction Amount, Description
 *                  (card purchases are positive). Dates YYYYMMDD.
 *   CIBC           no header: Date (YYYY-MM-DD), Description, Debit, Credit[, masked card number].
 *   National Bank  header (French, semicolons): Date;Description;Catégorie;Débit;Crédit;Solde.
 *                  Not confirmed against a real export.
 *   Tangerine      header: [Transaction ]Date, Transaction, Name, Memo, Amount. Negative = out.
 *   Simplii        header: Date, Transaction Details, Funds Out, Funds In.
 *   Desjardins     no header, 14 fields (AccèsD guide MF-207 §10.9): caisse, folio, account
 *                  type, date (YYYY/MM/DD), sequence, description, cheque, withdrawal,
 *                  deposit, interest, capital, advance, repayment, balance.
 *   Amex Canada    header: Date, Date Processed, Description, Amount[, ... Merchant ...].
 *                  Dates "07 Aug 2026"; purchases positive. Also the Excel download (preamble).
 *   QuickBooks Self-Employed  header with Date, Description, Amount, Category and a
 *                  Business/Personal type column. Best effort: no published layout.
 *   Anything else  column names in English or French, or, with no header, columns told
 *                  apart by their contents; failing that, the agent maps the columns.
 *
 * Account and card numbers: only the mapped columns are ever read, so an
 * account or card number column is dropped unread; descriptions go through
 * stripAccountNumbers. Nothing here logs a description or an amount.
 */
import { parseDelimited } from "./csv";
import { merchantFromDescription, stripAccountNumbers } from "./scrub";
import { detectDateOrder, parseStatementAmount, parseStatementDate, type DateOrder } from "./values";

export type StatementKind = "bank" | "credit_card";

export interface ParsedStatementLine {
  /** Transaction date, YYYY-MM-DD. */
  date: string;
  postedDate: string | null;
  /** As printed, account and card numbers removed. */
  description: string;
  merchant: string | null;
  /** Always positive. */
  amount: number;
  direction: "out" | "in";
  /** The export's own category label (Tangerine, National Bank, QuickBooks). */
  sourceCategory: string | null;
  /** QuickBooks Self-Employed's Business / Personal flag. */
  sourceBusiness: boolean | null;
  /** The running balance after the line, when the export has one (the Director Cockpit keeps it). */
  balance: number | null;
  /** 0-based row in the file, for messages. */
  row: number;
}

export interface StatementColumnMapping {
  /** Row index of the header, or null for a file with no header. */
  headerRow: number | null;
  firstDataRow: number;
  date: number;
  postedDate?: number | null;
  /** Joined with a space, in this order. */
  description: number[];
  merchant?: number | null;
  /** One signed amount column... */
  amount?: number | null;
  /** ...or a money-out and a money-in column. */
  debit?: number | null;
  credit?: number | null;
  /** More money-out columns (Desjardins interest). */
  extraOut?: number[];
  /** A Debit/Credit (or Withdrawal/Deposit) column that decides the direction. */
  typeColumn?: number | null;
  category?: number | null;
  /** A Business/Personal column (QuickBooks Self-Employed). */
  businessFlag?: number | null;
  balance?: number | null;
  /** A foreign-currency amount column: a row with only that amount is left out. */
  foreignAmount?: number | null;
  dateOrder?: DateOrder | null;
  /** For a single signed amount: is a negative number money out or money in? Null works it out. */
  negativeIs?: "out" | "in" | null;
  /** Scotiabank's Filter column, whose first cell holds the statement period. */
  periodColumn?: number | null;
}

export interface ParseStatementOptions {
  /** What the agent said the account is. */
  kind?: StatementKind | null;
  /** How the agent says the file writes its dates, when the file can't show it. */
  dateOrder?: DateOrder | null;
  /** The agent's own column choices, when automatic reading failed. */
  mapping?: Partial<StatementColumnMapping> | null;
}

export interface ParsedStatement {
  /** 'rbc', 'td', 'scotia', 'bmo', 'cibc', 'nbc', 'tangerine', 'simplii', 'desjardins', 'amex', 'qbse', 'generic'. */
  formatId: string;
  institution: string | null;
  /** From the file's own layout, when it shows it. */
  detectedKind: StatementKind | null;
  lines: ParsedStatementLine[];
  /** A period printed in the file (Scotiabank), else null. */
  periodStart: string | null;
  periodEnd: string | null;
  /** Plain-language notes for the agent. */
  warnings: string[];
  /** Data rows left out, by reason. */
  skipped: Record<string, number>;
  mapping: StatementColumnMapping | null;
  /** True when the columns could not be told apart: the agent maps them. */
  needsMapping: boolean;
  /**
   * True when every date could be month/day or day/month (no day over 12):
   * nothing is read until the agent says which. `sampleDates` shows some.
   */
  needsDateOrder: boolean;
  sampleDates: string[];
  /** The first rows, numbers removed, for the mapping form. */
  preview: string[][];
  columnCount: number;
}

// ── Header vocabulary ──────────────────────────────────────────────────────

function norm(h: string | null | undefined): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const H = {
  date: ["transactiondate", "transdate", "date", "datedetransaction", "datetransaction", "dateoperation", "datedeloperation", "dateoftransaction"],
  posted: ["postingdate", "posteddate", "dateposted", "posted", "dateprocessed", "dateinscription", "datedinscription", "processeddate"],
  description: ["description1", "description", "transactiondetails", "transactiondescription", "details", "descriptif", "libelle", "narrative", "payee", "merchantname", "name", "nom"],
  description2: ["description2", "subdescription", "memo", "notes"],
  merchant: ["merchant", "marchand", "commercant"],
  amount: ["cad", "amountcad", "cadamount", "amount", "transactionamount", "montant", "montantcad", "value"],
  foreign: ["usd", "amountusd", "foreignspendamount", "foreignamount"],
  debit: ["debit", "debits", "debitamount", "withdrawal", "withdrawals", "fundsout", "moneyout", "paidout", "retrait", "retraits", "purchases", "charges", "debitcad"],
  credit: ["credit", "credits", "creditamount", "deposit", "deposits", "fundsin", "moneyin", "paidin", "depot", "depots", "paymentsandcredits", "creditcad"],
  balance: ["balance", "runningbalance", "solde", "newbalance"],
  type: ["transactiontype", "typeoftransaction", "debitcredit", "drcr", "type", "transaction", "typedetransaction"],
  category: ["category", "categorie", "categories", "spendcategory"],
  filter: ["filter"],
} as const;

const DATE_LIKE_HEADER = new Set<string>([...H.date, ...H.posted]);
const MONEY_LIKE_HEADER = new Set<string>([...H.amount, ...H.debit, ...H.credit]);

function findCol(headers: string[], names: readonly string[], taken: Set<number>): number | null {
  for (const name of names) {
    const i = headers.findIndex((h, idx) => h === name && !taken.has(idx));
    if (i >= 0) return i;
  }
  return null;
}

function isHeaderRow(cells: string[]): boolean {
  const n = cells.map(norm);
  const hasDate = n.some((c) => DATE_LIKE_HEADER.has(c));
  const hasMoney = n.some((c) => MONEY_LIKE_HEADER.has(c));
  const anyDateValue = cells.some((c) => parseStatementDate(c) !== null);
  return hasDate && hasMoney && !anyDateValue;
}

// ── Values in a column ─────────────────────────────────────────────────────

function columnValues(rows: string[][], col: number, from: number, limit = 400): string[] {
  const out: string[] = [];
  for (let i = from; i < rows.length && out.length < limit; i++) out.push(rows[i][col] ?? "");
  return out;
}

const MASKED_CARD = /^'?\d{0,6}[*Xx•]{3,}\d{0,4}'?$/;

function typeDirection(raw: string | null | undefined): "out" | "in" | null {
  const v = norm(raw);
  if (!v) return null;
  if (/^(debit|dr|withdrawal|retrait|purchase|achat|atm|fee|frais|charge|payment(out)?|sent)$/.test(v)) return "out";
  if (/^(credit|cr|deposit|depot|refund|remboursement|received|paymentreceived)$/.test(v)) return "in";
  return null;
}

function businessValue(raw: string | null | undefined): boolean | null {
  const v = norm(raw);
  if (v === "business" || v === "affaires" || v === "entreprise") return true;
  if (v === "personal" || v === "personnel" || v === "personnelle") return false;
  return null;
}

const PAYMENT_WORDS = /\b(payment|paiement|pymt|pmt|thank you|merci|autopay)\b/i;

// ── Profiles: what a known export's header says about it ──────────────────

interface HeaderProfile {
  id: string;
  institution: string | null;
  match: (h: string[]) => boolean;
  negativeIs?: "out" | "in";
  kind?: (h: string[], rows: string[][], mapping: StatementColumnMapping) => StatementKind | null;
  dateOrder?: DateOrder;
  /** Adjust the generic mapping for this layout. */
  tune?: (h: string[], m: StatementColumnMapping) => void;
}

const has = (h: string[], ...names: string[]) => names.every((n) => h.includes(n));

const HEADER_PROFILES: HeaderProfile[] = [
  {
    id: "rbc",
    institution: "RBC",
    match: (h) => has(h, "accounttype", "description1") && (h.includes("cad") || h.includes("usd")),
    negativeIs: "out",
    dateOrder: "mdy",
    kind: (h, rows, m) => {
      const col = h.indexOf("accounttype");
      const values = columnValues(rows, col, m.firstDataRow).map(norm).filter(Boolean);
      if (values.length === 0) return null;
      const card = values.filter((v) => /visa|mastercard|card/.test(v)).length;
      return card > values.length / 2 ? "credit_card" : "bank";
    },
  },
  {
    id: "bmo",
    institution: "BMO",
    match: (h) => h.includes("firstbankcard"),
    negativeIs: "out",
    kind: () => "bank",
  },
  {
    id: "bmo",
    institution: "BMO",
    match: (h) => has(h, "item", "card", "transactionamount") && (h.includes("postingdate") || h.includes("transactiondate")),
    negativeIs: "in",
    kind: () => "credit_card",
  },
  {
    id: "scotia",
    institution: "Scotiabank",
    match: (h) => has(h, "filter", "subdescription"),
    kind: (h) => (h.includes("status") || !h.includes("balance") ? "credit_card" : "bank"),
    tune: (h, m) => {
      m.periodColumn = h.indexOf("filter");
      // Purchases are positive on the card and negative on chequing; the
      // Type of Transaction column decides either way.
      m.negativeIs = h.includes("status") || !h.includes("balance") ? "in" : "out";
    },
  },
  {
    id: "tangerine",
    institution: "Tangerine",
    match: (h) => has(h, "transaction", "name", "memo", "amount"),
    negativeIs: "out",
    dateOrder: "mdy",
    kind: (h) => (h[0] === "transactiondate" ? "credit_card" : "bank"),
    tune: (h, m) => {
      // DEBIT/CREDIT/OTHER/ATM: the sign is the more reliable signal here.
      m.typeColumn = null;
      const memo = h.indexOf("memo");
      // The card's memo is "Rewards earned: 0.78 ~ Category: Groceries".
      m.description = [h.indexOf("name"), ...(memo >= 0 ? [memo] : [])];
      m.category = memo >= 0 ? memo : null;
    },
  },
  {
    id: "simplii",
    institution: "Simplii Financial",
    match: (h) => has(h, "transactiondetails", "fundsout"),
    dateOrder: "mdy",
    kind: () => "bank",
  },
  {
    id: "amex",
    institution: "American Express",
    match: (h) => has(h, "dateprocessed", "description", "amount"),
    negativeIs: "in",
    kind: () => "credit_card",
  },
  {
    id: "nbc",
    institution: "National Bank",
    match: (h) => has(h, "date", "description", "categorie", "debit", "credit", "solde"),
    kind: () => "bank",
  },
  {
    id: "qbse",
    institution: "QuickBooks Self-Employed",
    match: () => false, // decided from the values (see below)
  },
];

// ── The mapping from a header row ──────────────────────────────────────────

function mappingFromHeader(headerCells: string[], headerRow: number, rows: string[][]): { mapping: StatementColumnMapping; profile: HeaderProfile | null } | null {
  const h = headerCells.map(norm);
  const taken = new Set<number>();
  const take = (names: readonly string[]) => {
    const i = findCol(h, names, taken);
    if (i !== null) taken.add(i);
    return i;
  };

  let date = take(H.date);
  const posted = take(H.posted);
  if (date === null) date = posted;
  if (date === null) return null;

  take(H.filter);
  const merchant = take(H.merchant);
  const amount = take(H.amount);
  const foreign = take(H.foreign);
  const debit = take(H.debit);
  const credit = take(H.credit);
  const balance = take(H.balance);
  const category = take(H.category);
  const type = take(H.type);
  const desc1 = take(H.description);
  const desc2 = take(H.description2);

  const description = [desc1, desc2].filter((i): i is number => i !== null);
  if (description.length === 0 && merchant !== null) description.push(merchant);
  if (description.length === 0) return null;
  if (amount === null && debit === null && credit === null) return null;

  const mapping: StatementColumnMapping = {
    headerRow,
    firstDataRow: headerRow + 1,
    date,
    postedDate: posted !== date ? posted : null,
    description,
    merchant,
    amount: amount ?? null,
    debit: amount === null ? debit : null,
    credit: amount === null ? credit : null,
    typeColumn: type,
    category,
    businessFlag: null,
    balance,
    foreignAmount: foreign,
    dateOrder: null,
    negativeIs: null,
    periodColumn: null,
  };

  // A "Type" column of Business / Personal is QuickBooks Self-Employed's flag, not a direction.
  if (type !== null) {
    const values = columnValues(rows, type, mapping.firstDataRow).filter((v) => v.trim());
    const flags = values.filter((v) => businessValue(v) !== null).length;
    if (values.length > 0 && flags >= values.length * 0.6) {
      mapping.typeColumn = null;
      mapping.businessFlag = type;
    }
  }

  const profile = HEADER_PROFILES.find((p) => p.match(h)) ?? (mapping.businessFlag !== null ? HEADER_PROFILES.find((p) => p.id === "qbse")! : null);
  if (profile) {
    if (profile.negativeIs) mapping.negativeIs = profile.negativeIs;
    if (profile.dateOrder) mapping.dateOrder = profile.dateOrder;
    profile.tune?.(h, mapping);
  }
  return { mapping, profile };
}

// ── The mapping for a file with no header ──────────────────────────────────

interface ColumnStats {
  dates: number;
  amounts: number;
  filled: number;
  letters: number;
  masked: number;
  negatives: number;
  dashes: number;
  longIds: number;
}

function statsFor(rows: string[][], col: number): ColumnStats {
  const s: ColumnStats = { dates: 0, amounts: 0, filled: 0, letters: 0, masked: 0, negatives: 0, dashes: 0, longIds: 0 };
  for (const r of rows) {
    const v = (r[col] ?? "").trim();
    if (!v) continue;
    if (v === "-") {
      s.dashes++;
      continue;
    }
    s.filled++;
    if (parseStatementDate(v) !== null) s.dates++;
    const a = parseStatementAmount(v);
    if (a !== null && /\d/.test(v) && !/[a-z]{3,}/i.test(v)) {
      s.amounts++;
      if (a.value < 0) s.negatives++;
      if (/^'?\d{6,}'?$/.test(v)) s.longIds++;
    }
    if (MASKED_CARD.test(v)) s.masked++;
    s.letters += (v.match(/[a-z]/gi) ?? []).length;
  }
  return s;
}

function headerlessMapping(rows: string[][]): { mapping: StatementColumnMapping; formatId: string; institution: string | null; kind: StatementKind | null } | null {
  const sample = rows.slice(0, 400);
  if (sample.length === 0) return null;
  const width = Math.max(...sample.map((r) => r.length));

  // Desjardins AccèsD: 14 fields, account type code, date as YYYY/MM/DD.
  const desj = sample.filter((r) => r.length >= 14 && /^\d{4}\/\d{2}\/\d{2}$/.test((r[3] ?? "").trim()) && /^[A-Z]{2,3}$/.test((r[2] ?? "").trim()));
  if (desj.length >= Math.max(1, sample.length * 0.8)) {
    return {
      formatId: "desjardins",
      institution: "Desjardins",
      kind: "bank",
      mapping: { headerRow: null, firstDataRow: 0, date: 3, description: [5], debit: 7, credit: 8, extraOut: [9], amount: null, balance: 13, dateOrder: "ymd", negativeIs: null },
    };
  }

  const stats = Array.from({ length: width }, (_, c) => statsFor(sample, c));
  const n = sample.length;
  const dateCol = stats.findIndex((s) => s.filled > 0 && s.dates >= n * 0.8);
  if (dateCol < 0) return null;

  const moneyCols = stats
    .map((s, c) => ({ s, c }))
    .filter(({ s, c }) => c !== dateCol && s.filled > 0 && s.amounts >= s.filled * 0.9 && s.masked === 0 && s.longIds < s.filled * 0.5 && s.dates < s.filled * 0.5)
    .map(({ c }) => c);
  const textCols = stats
    .map((s, c) => ({ s, c }))
    .filter(({ s, c }) => c !== dateCol && !moneyCols.includes(c) && s.filled > 0 && s.masked === 0)
    .sort((a, b) => b.s.letters / Math.max(1, b.s.filled) - a.s.letters / Math.max(1, a.s.filled));
  if (moneyCols.length === 0 || textCols.length === 0) return null;
  const description = textCols[0].c;
  const cardColumn = stats.some((s) => s.filled > 0 && s.masked >= s.filled * 0.8);

  // A money-out and a money-in column: in each row exactly one of the two is filled.
  let debit: number | null = null;
  let credit: number | null = null;
  let balance: number | null = null;
  outer: for (let i = 0; i < moneyCols.length; i++) {
    for (let j = i + 1; j < moneyCols.length; j++) {
      const a = moneyCols[i];
      const b = moneyCols[j];
      let oneOf = 0;
      for (const r of sample) {
        const fa = (r[a] ?? "").trim() !== "";
        const fb = (r[b] ?? "").trim() !== "";
        if (fa !== fb) oneOf++;
      }
      if (oneOf >= n * 0.9) {
        debit = a;
        credit = b;
        break outer;
      }
    }
  }
  if (debit !== null && credit !== null) {
    balance = moneyCols.find((c) => c !== debit && c !== credit && stats[c].filled >= n * 0.9) ?? null;
    const iso = (sample[0][dateCol] ?? "").trim();
    let formatId = "generic";
    let institution: string | null = null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso) && balance !== null && width === 5) {
      formatId = "td";
      institution = "TD";
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && (width === 4 || (width === 5 && cardColumn))) {
      formatId = "cibc";
      institution = "CIBC";
    }
    return {
      formatId,
      institution,
      kind: cardColumn ? "credit_card" : null,
      mapping: { headerRow: null, firstDataRow: 0, date: dateCol, description: [description], debit, credit, amount: null, balance, dateOrder: formatId === "td" ? "mdy" : null, negativeIs: null },
    };
  }

  // One signed amount column: the one with negatives, else the first.
  const amount = moneyCols.find((c) => stats[c].negatives > 0) ?? moneyCols[0];
  // Scotiabank's old layout: Date, Amount, "-", Type, Description.
  const scotiaOld = width === 5 && dateCol === 0 && amount === 1 && stats[2].dashes + (n - stats[2].filled - stats[2].dashes) >= n * 0.9;
  if (scotiaOld) {
    return {
      formatId: "scotia",
      institution: "Scotiabank",
      kind: "bank",
      mapping: { headerRow: null, firstDataRow: 0, date: 0, description: [3, 4], merchant: 4, amount: 1, dateOrder: "mdy", negativeIs: "out" },
    };
  }
  return {
    formatId: "generic",
    institution: null,
    kind: cardColumn ? "credit_card" : null,
    mapping: { headerRow: null, firstDataRow: 0, date: dateCol, description: [description], amount, dateOrder: null, negativeIs: null },
  };
}

// ── Reading the rows ───────────────────────────────────────────────────────

const SUMMARY_ROW = /^(total|totals|sous-total|subtotal|opening balance|closing balance|balance forward|previous balance|new balance|solde (?:d'ouverture|de cloture|precedent|anterieur)|beginning balance|ending balance)\b/i;

function cleanCategory(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Tangerine card memo: "Rewards earned: 0.78 ~ Category: Groceries"
  const m = s.match(/category\s*:\s*([^~;|]+)/i);
  const v = (m ? m[1] : /rewards earned/i.test(s) ? "" : s).trim();
  return v ? v.slice(0, 80) : null;
}

function periodFromFilter(raw: string | null | undefined): { start: string; end: string } | null {
  const s = String(raw ?? "");
  const from = s.match(/from\s*date\s*=\s*(\d{4}-\d{2}-\d{2})/i);
  const to = s.match(/to\s*date\s*=\s*(\d{4}-\d{2}-\d{2})/i);
  if (from && to && from[1] <= to[1]) return { start: from[1], end: to[1] };
  return null;
}

interface RawLine extends Omit<ParsedStatementLine, "direction" | "amount"> {
  /** Signed as the file has it, before deciding which sign is money out. */
  signed: number;
  /** Direction already settled by a debit/credit pair, a type column or a CR/DR marker. */
  settled: "out" | "in" | null;
}

function bump(skipped: Record<string, number>, reason: string) {
  skipped[reason] = (skipped[reason] ?? 0) + 1;
}

function readRows(rows: string[][], m: StatementColumnMapping, skipped: Record<string, number>, warnings: string[]): RawLine[] {
  // Decided before reading (parseStatementRows): the profile's, the file's own, or the agent's.
  const order = m.dateOrder ?? detectDateOrder(columnValues(rows, m.date, m.firstDataRow));
  const out: RawLine[] = [];
  for (let i = m.firstDataRow; i < rows.length; i++) {
    const r = rows[i];
    const dateRaw = r[m.date] ?? "";
    const firstText = r.find((c) => c.trim()) ?? "";
    if (SUMMARY_ROW.test(firstText.trim()) || SUMMARY_ROW.test(String(r[m.description[0]] ?? "").trim())) {
      bump(skipped, "summary row");
      continue;
    }
    if (m.headerRow !== null && rows[m.headerRow] && r.join("|") === rows[m.headerRow].join("|")) {
      bump(skipped, "repeated header");
      continue;
    }
    const date = parseStatementDate(dateRaw, order);
    if (!date) {
      if (r.filter((c) => c.trim()).length >= 2) bump(skipped, "no readable date");
      continue;
    }
    const rawDescription = m.description.map((c) => (r[c] ?? "").trim()).filter(Boolean);
    // Tangerine's card memo only carries rewards and a category.
    const descParts = rawDescription.filter((p) => !/^rewards earned/i.test(p));
    const description = stripAccountNumbers(descParts.join(" ")).slice(0, 300);
    if (!description) {
      bump(skipped, "no description");
      continue;
    }

    let signed: number | null = null;
    let settled: "out" | "in" | null = null;
    if (m.debit != null || m.credit != null) {
      const d = m.debit != null ? parseStatementAmount(r[m.debit]) : null;
      const c = m.credit != null ? parseStatementAmount(r[m.credit]) : null;
      const dv = d ? Math.abs(d.value) : 0;
      const cv = c ? Math.abs(c.value) : 0;
      const extra = (m.extraOut ?? []).reduce((sum, col) => sum + Math.abs(parseStatementAmount(r[col])?.value ?? 0), 0);
      if (dv > 0 && cv > 0) {
        signed = cv - dv;
        settled = signed < 0 ? "out" : "in";
        signed = Math.abs(signed);
        const note = "Some rows had both a debit and a credit; the difference was used.";
        if (!warnings.includes(note)) warnings.push(note);
      } else if (dv > 0) {
        signed = dv;
        settled = "out";
      } else if (cv > 0) {
        signed = cv;
        settled = "in";
      } else if (extra > 0) {
        signed = extra;
        settled = "out";
      }
    } else if (m.amount != null) {
      const a = parseStatementAmount(r[m.amount]);
      if (a) {
        signed = a.value;
        if (a.marker === "cr") settled = "in";
        else if (a.marker === "dr") settled = "out";
      }
    }
    if (signed === null || Number.isNaN(signed)) {
      if (m.foreignAmount != null && parseStatementAmount(r[m.foreignAmount])) bump(skipped, "foreign currency only");
      else bump(skipped, "no amount");
      continue;
    }
    if (signed === 0) {
      bump(skipped, "zero amount");
      continue;
    }
    if (!settled && m.typeColumn != null) settled = typeDirection(r[m.typeColumn]);

    out.push({
      date,
      postedDate: m.postedDate != null ? parseStatementDate(r[m.postedDate], order) : null,
      description,
      merchant: m.merchant != null ? merchantFromDescription(r[m.merchant]) ?? merchantFromDescription(description) : merchantFromDescription(description),
      signed,
      settled,
      sourceCategory: m.category != null ? cleanCategory(r[m.category]) : null,
      sourceBusiness: m.businessFlag != null ? businessValue(r[m.businessFlag]) : null,
      balance: m.balance != null ? parseStatementAmount(r[m.balance])?.value ?? null : null,
      row: i,
    });
  }
  return out;
}

/**
 * Which sign is money out, for a single signed column with no profile to
 * say. A bank account's export writes money out as negative. On a card,
 * payments are money in, so whichever sign the payment lines carry is "in";
 * with no payment line, most lines on a card are purchases.
 */
function orientSigns(lines: RawLine[], kind: StatementKind | null): { negativeIs: "out" | "in"; guessed: boolean } {
  const open = lines.filter((l) => !l.settled);
  if (kind !== "credit_card" || open.length === 0) return { negativeIs: "out", guessed: false };
  const payments = open.filter((l) => PAYMENT_WORDS.test(l.description));
  const negativePayments = payments.filter((l) => l.signed < 0).length;
  const positivePayments = payments.length - negativePayments;
  if (negativePayments !== positivePayments) {
    return { negativeIs: negativePayments > positivePayments ? "in" : "out", guessed: false };
  }
  const positives = open.filter((l) => l.signed > 0).length;
  return { negativeIs: positives >= open.length / 2 ? "in" : "out", guessed: true };
}

function finish(raw: RawLine[], negativeIs: "out" | "in"): ParsedStatementLine[] {
  return raw.map(({ signed, settled, ...rest }) => ({
    ...rest,
    amount: Math.round(Math.abs(signed) * 100) / 100,
    direction: settled ?? (signed < 0 ? negativeIs : negativeIs === "out" ? "in" : "out"),
  }));
}

/** The first rows of a file, numbers removed, for the column-mapping form. */
function previewRows(rows: string[][]): string[][] {
  // Every cell, amounts included: a card or account number reads as an amount too.
  return rows.slice(0, 8).map((r) => r.slice(0, 16).map((c) => stripAccountNumbers(c).slice(0, 40)));
}

/** Numeric dates where the month and the day could be either way round, and it matters. */
function ambiguousDates(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const m = String(raw ?? "").trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (m && Number(m[1]) <= 12 && Number(m[2]) <= 12 && m[1] !== m[2]) out.push(m[0]);
  }
  return out;
}

/**
 * Read statement rows (from a CSV, or an XLSX sheet) into lines. With
 * `options.mapping`, the agent's own column choices are used as they are.
 */
export function parseStatementRows(rows: string[][], options: ParseStatementOptions = {}): ParsedStatement {
  const warnings: string[] = [];
  const skipped: Record<string, number> = {};
  const columnCount = Math.max(0, ...rows.slice(0, 50).map((r) => r.length));
  const empty = (needsMapping: boolean): ParsedStatement => ({
    formatId: "generic",
    institution: null,
    detectedKind: null,
    lines: [],
    periodStart: null,
    periodEnd: null,
    warnings,
    skipped,
    mapping: null,
    needsMapping,
    needsDateOrder: false,
    sampleDates: [],
    preview: previewRows(rows),
    columnCount,
  });
  if (rows.length === 0) return empty(false);

  let mapping: StatementColumnMapping | null = null;
  let formatId = "generic";
  let institution: string | null = null;
  let detectedKind: StatementKind | null = null;
  let profile: HeaderProfile | null = null;

  const manual = options.mapping;
  if (manual && typeof manual.date === "number" && Array.isArray(manual.description) && manual.description.length > 0 &&
      (typeof manual.amount === "number" || typeof manual.debit === "number" || typeof manual.credit === "number")) {
    const headerRow = typeof manual.headerRow === "number" ? manual.headerRow : null;
    mapping = {
      headerRow,
      firstDataRow: typeof manual.firstDataRow === "number" ? manual.firstDataRow : headerRow === null ? 0 : headerRow + 1,
      date: manual.date,
      description: manual.description.filter((c) => Number.isInteger(c) && c >= 0),
      amount: typeof manual.amount === "number" ? manual.amount : null,
      debit: typeof manual.debit === "number" ? manual.debit : null,
      credit: typeof manual.credit === "number" ? manual.credit : null,
      dateOrder: manual.dateOrder ?? null,
      negativeIs: manual.negativeIs ?? null,
    };
  } else {
    // A header row within the first 30 rows (BMO and Amex put a preamble first).
    for (let i = 0; i < Math.min(30, rows.length); i++) {
      if (!isHeaderRow(rows[i])) continue;
      const found = mappingFromHeader(rows[i], i, rows);
      if (!found) continue;
      mapping = found.mapping;
      profile = found.profile;
      if (profile) {
        formatId = profile.id;
        institution = profile.institution;
        detectedKind = profile.kind?.(rows[i].map(norm), rows, mapping) ?? null;
      }
      break;
    }
    if (!mapping) {
      // Data rows: three or more filled cells, one of them a date (a title or
      // column-name row above the data is not one).
      const body = rows.filter((r) => r.filter((c) => c.trim()).length >= 3 && r.some((c) => parseStatementDate(c) !== null));
      const found = headerlessMapping(body);
      if (found) {
        // Point the mapping at the full row list: headerless files start at their first data row.
        const first = rows.indexOf(body[0]);
        mapping = { ...found.mapping, firstDataRow: Math.max(0, first) };
        formatId = found.formatId;
        institution = found.institution;
        detectedKind = found.kind;
      }
    }
  }

  if (!mapping) return empty(true);

  // Month/day or day/month: from the layout, the file (a day over 12), the
  // agent, or else ask before reading anything.
  if (!mapping.dateOrder) {
    const values = columnValues(rows, mapping.date, mapping.firstDataRow, 2000);
    const order = options.dateOrder ?? detectDateOrder(values);
    if (order) {
      mapping.dateOrder = order;
    } else {
      const unclear = ambiguousDates(values);
      if (unclear.length > 0) {
        return { ...empty(false), formatId, institution, detectedKind, mapping, needsDateOrder: true, sampleDates: [...new Set(unclear)].slice(0, 3), preview: [] };
      }
    }
  }

  const raw = readRows(rows, mapping, skipped, warnings);
  if (raw.length === 0) return { ...empty(true), formatId, institution, detectedKind, mapping };

  let negativeIs = mapping.negativeIs ?? null;
  if (!negativeIs) {
    const oriented = orientSigns(raw, options.kind ?? detectedKind);
    negativeIs = oriented.negativeIs;
    if (oriented.guessed) warnings.push(negativeIs === "in" ? "Charges were read as the positive amounts and payments as the negative ones." : "Charges were read as the negative amounts and payments as the positive ones.");
  }
  const lines = finish(raw, negativeIs);

  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  if (mapping.periodColumn != null && mapping.periodColumn >= 0) {
    for (let i = mapping.firstDataRow; i < Math.min(rows.length, mapping.firstDataRow + 3); i++) {
      const p = periodFromFilter(rows[i][mapping.periodColumn]);
      if (p) {
        periodStart = p.start;
        periodEnd = p.end;
        break;
      }
    }
  }

  if (formatId === "rbc" || formatId === "desjardins") {
    const accountCol = formatId === "rbc" ? (rows[mapping.headerRow ?? 0] ?? []).map(norm).indexOf("accounttype") : 2;
    const types = new Set(columnValues(rows, accountCol, mapping.firstDataRow).map((v) => v.trim()).filter(Boolean));
    if (types.size > 1) warnings.push("This file holds lines from more than one account. They are all imported under the one account name.");
  }

  return { formatId, institution, detectedKind, lines, periodStart, periodEnd, warnings, skipped, mapping, needsMapping: false, needsDateOrder: false, sampleDates: [], preview: [], columnCount };
}

/** Read a CSV, TSV or semicolon-separated export. */
export function parseStatementCsv(text: string, options: ParseStatementOptions = {}): ParsedStatement {
  return parseStatementRows(parseDelimited(text), options);
}
