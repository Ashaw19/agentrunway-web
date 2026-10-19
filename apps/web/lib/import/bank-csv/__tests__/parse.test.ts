/**
 * Canadian bank and card CSV exports → statement lines. Each fixture in
 * ./fixtures is a synthetic file in a documented layout (sources in
 * parse.ts); every name, number and amount is made up.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseStatementCsv, parseStatementRows, type ParsedStatement, type StatementKind } from "../parse";
import { decodeStatementBytes, detectDelimiter, parseDelimited } from "../csv";
import { hasAccountNumber, merchantFromDescription, scrubAccountLabel, scrubFileName, stripAccountNumbers } from "../scrub";
import { parseStatementAmount, parseStatementDate } from "../values";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const parse = (name: string, kind: StatementKind | null = null) => parseStatementCsv(fixture(name), { kind });

/** date, amount, direction per line: the shape that matters for the totals. */
const shape = (p: ParsedStatement) => p.lines.map((l) => [l.date, l.amount, l.direction]);

function expectNoAccountNumbers(p: ParsedStatement) {
  for (const l of p.lines) {
    expect(hasAccountNumber(l.description), l.description).toBe(false);
    expect(hasAccountNumber(l.merchant), String(l.merchant)).toBe(false);
  }
}

describe("RBC", () => {
  const p = parse("rbc.csv", "credit_card");
  it("reads the signed CAD$ column: negative is money out, cards too", () => {
    expect(p.formatId).toBe("rbc");
    expect(p.institution).toBe("RBC");
    expect(p.detectedKind).toBe("credit_card");
    expect(shape(p)).toEqual([
      ["2026-09-03", 54.2, "out"],
      ["2026-09-04", 32.18, "out"],
      ["2026-09-10", 500, "in"],
      ["2026-09-12", 12.99, "in"],
      ["2026-09-18", 2.15, "out"],
    ]);
  });
  it("joins Description 1 and 2, drops the account number column and leaves out US-dollar-only rows", () => {
    expect(p.lines[0].description).toBe("SHELL C04512 SAINT JOHN NB");
    expect(p.lines[0].merchant).toBe("Shell Saint John");
    expect(p.skipped["foreign currency only"]).toBe(1);
    expectNoAccountNumbers(p);
  });
});

describe("TD (no header)", () => {
  const p = parse("td.csv", "bank");
  it("reads Date, Description, Debit, Credit, Balance", () => {
    expect(p.formatId).toBe("td");
    expect(shape(p)).toEqual([
      ["2026-09-02", 4.75, "out"],
      ["2026-09-03", 2500, "in"],
      ["2026-09-05", 61.3, "out"],
      ["2026-09-08", 150, "out"],
      ["2026-09-30", 16.95, "out"],
    ]);
    expect(p.lines[0].description).toBe("COFFEE SHOP _F");
  });
});

describe("Scotiabank", () => {
  it("chequing: the Type of Transaction decides; the Filter row gives the period", () => {
    const p = parse("scotia-chequing.csv", "bank");
    expect(p.formatId).toBe("scotia");
    expect(p.detectedKind).toBe("bank");
    expect([p.periodStart, p.periodEnd]).toEqual(["2026-09-01", "2026-09-30"]);
    expect(shape(p)).toEqual([
      ["2026-09-02", 4.5, "out"],
      ["2026-09-05", 1200, "in"],
      ["2026-09-09", 88, "out"],
    ]);
    expect(p.lines[0].merchant).toBe("Coffee Co");
  });
  it("card: purchases are positive and payments negative, the opposite of chequing", () => {
    const p = parse("scotia-card.csv", "credit_card");
    expect(p.detectedKind).toBe("credit_card");
    expect(shape(p)).toEqual([
      ["2026-09-03", 48.1, "out"],
      ["2026-09-10", 300, "in"],
      ["2026-09-14", 250, "out"],
    ]);
    expectNoAccountNumbers(p);
  });
  it("the old headerless layout: Date, Amount, -, Type, Description", () => {
    const p = parse("scotia-old.csv", "bank");
    expect(p.formatId).toBe("scotia");
    expect(shape(p)).toEqual([
      ["2026-09-02", 12.34, "out"],
      ["2026-09-04", 1500, "in"],
      ["2026-09-08", 45, "out"],
    ]);
    expect(p.lines[0].merchant).toBe("Coffee Co");
  });
});

describe("BMO", () => {
  it("bank: skips the preamble, reads YYYYMMDD dates and the DEBIT/CREDIT type, drops the card number", () => {
    const p = parse("bmo-bank.csv", "bank");
    expect(p.formatId).toBe("bmo");
    expect(shape(p)).toEqual([
      ["2026-09-02", 42.1, "out"],
      ["2026-09-03", 900, "in"],
      ["2026-09-06", 19.99, "out"],
    ]);
    expect(p.lines[0].merchant).toBe("Coffee Co");
    expectNoAccountNumbers(p);
  });
  it("Mastercard: purchases positive, payments negative; posting date kept", () => {
    const p = parse("bmo-card.csv", "credit_card");
    expect(p.detectedKind).toBe("credit_card");
    expect(shape(p)).toEqual([
      ["2026-09-01", 35.4, "out"],
      ["2026-09-05", 200, "in"],
      ["2026-09-07", 64, "out"],
    ]);
    expect(p.lines[0].postedDate).toBe("2026-09-02");
  });
});

describe("CIBC (no header)", () => {
  it("chequing: Date, Description, Debit, Credit; long reference numbers removed", () => {
    const p = parse("cibc-chequing.csv", "bank");
    expect(p.formatId).toBe("cibc");
    expect(shape(p)).toEqual([
      ["2026-09-02", 52.1, "out"],
      ["2026-09-04", 1800, "in"],
      ["2026-09-11", 300, "out"],
    ]);
    expectNoAccountNumbers(p);
  });
  it("card: the masked card number column is recognised and never read", () => {
    const p = parse("cibc-card.csv", "credit_card");
    expect(p.formatId).toBe("cibc");
    expect(p.detectedKind).toBe("credit_card");
    expect(shape(p)).toEqual([
      ["2026-09-03", 5.3, "out"],
      ["2026-09-06", 400, "in"],
      ["2026-09-09", 129.95, "out"],
    ]);
    expect(p.lines[0].description).toBe("CAFE CO, HALIFAX NS");
    expectNoAccountNumbers(p);
  });
});

describe("National Bank (French, semicolons)", () => {
  it("reads Débit/Crédit with French decimals and keeps the category label", () => {
    const p = parse("nbc.csv", "bank");
    expect(p.formatId).toBe("nbc");
    expect(shape(p)).toEqual([
      ["2026-09-02", 23.4, "out"],
      ["2026-09-04", 1200, "in"],
      ["2026-09-09", 7.95, "out"],
    ]);
    expect(p.lines[2].sourceCategory).toBe("Frais bancaires");
  });
});

describe("Tangerine", () => {
  it("chequing: negative is money out", () => {
    const p = parse("tangerine-chequing.csv", "bank");
    expect(p.formatId).toBe("tangerine");
    expect(p.detectedKind).toBe("bank");
    expect(shape(p)).toEqual([
      ["2026-09-02", 3.85, "out"],
      ["2026-09-03", 1450, "in"],
      ["2026-09-07", 60, "out"],
    ]);
  });
  it("card: the memo's category is kept and its rewards text is not part of the description", () => {
    const p = parse("tangerine-card.csv", "credit_card");
    expect(p.detectedKind).toBe("credit_card");
    expect(shape(p)).toEqual([
      ["2026-09-02", 48.1, "out"],
      ["2026-09-05", 250, "in"],
      ["2026-09-09", 102.3, "out"],
    ]);
    expect(p.lines[0].sourceCategory).toBe("Gas");
    expect(p.lines[0].description).toBe("FUEL MART 22");
  });
});

describe("Simplii", () => {
  it("reads Funds Out and Funds In", () => {
    const p = parse("simplii.csv", "bank");
    expect(p.formatId).toBe("simplii");
    expect(shape(p)).toEqual([
      ["2026-09-02", 4.2, "out"],
      ["2026-09-05", 1300, "in"],
      ["2026-09-12", 112, "out"],
    ]);
  });
});

describe("Desjardins (AccèsD, no header)", () => {
  it("reads the 14-field layout: Retrait out, Dépôt in, and drops the caisse and folio", () => {
    const p = parse("desjardins.csv", "bank");
    expect(p.formatId).toBe("desjardins");
    expect(shape(p)).toEqual([
      ["2026-09-02", 4.25, "out"],
      ["2026-09-04", 1200, "in"],
      ["2026-09-10", 95, "out"],
    ]);
    expect(p.lines[0].description).toBe("Achat /COFFEE CO");
    for (const l of p.lines) expect(l.description).not.toMatch(/123456|Caisse/);
  });
});

describe("American Express Canada", () => {
  it("reads '02 Sep 2026' dates, positive purchases, the Merchant column, and a quoted address with a line break", () => {
    const p = parse("amex.csv", "credit_card");
    expect(p.formatId).toBe("amex");
    expect(shape(p)).toEqual([
      ["2026-09-02", 150, "out"],
      ["2026-09-05", 500, "in"],
      ["2026-09-08", 38.5, "out"],
    ]);
    expect(p.lines[0].merchant).toBe("Ad Platform Inc");
    expect(p.lines[0].postedDate).toBe("2026-09-03");
    expectNoAccountNumbers(p);
  });
});

describe("QuickBooks Self-Employed export (best effort)", () => {
  it("reads the Business/Personal flag and the category, and never the account column", () => {
    // Its dates (09/02/2026) could be either order, so the agent is asked first.
    expect(parse("qbse.csv", "credit_card").needsDateOrder).toBe(true);
    const p = parseStatementCsv(fixture("qbse.csv"), { kind: "credit_card", dateOrder: "mdy" });
    expect(p.formatId).toBe("qbse");
    expect(shape(p)).toEqual([
      ["2026-09-02", 48.1, "out"],
      ["2026-09-04", 88.2, "out"],
      ["2026-09-06", 19.99, "out"],
    ]);
    expect(p.lines.map((l) => l.sourceBusiness)).toEqual([true, false, true]);
    expect(p.lines[2].sourceCategory).toBe("Office expenses");
    for (const l of p.lines) expect(l.description).not.toMatch(/1234|Visa/);
  });
});

describe("Generic layouts and the column-mapping fallback", () => {
  it("reads unknown English headers, and day-first dates when a day over 12 shows the order", () => {
    const p = parse("generic-dmy.csv", "bank");
    expect(p.formatId).toBe("generic");
    expect(shape(p)).toEqual([
      ["2026-09-15", 24.99, "out"],
      ["2026-09-16", 5, "in"],
    ]);
  });

  it("a file it can't read asks for a column mapping, with a preview", () => {
    const p = parse("unreadable.csv");
    expect(p.needsMapping).toBe(true);
    expect(p.lines).toEqual([]);
    expect(p.preview.length).toBeGreaterThan(0);
  });

  it("the mapping preview never carries a card or account number, even in a column that looks like an amount", () => {
    const p = parseStatementCsv("a,b,c\n4510123412341234,THING,10.00\n4510123412341234,OTHER,5.00\n");
    expect(p.needsMapping).toBe(true);
    for (const row of p.preview) for (const cell of row) expect(cell).not.toMatch(/\d{6,}/);
  });

  it("dates that could be month/day or day/month stage nothing until the agent says which", () => {
    const csv = "Date,Description,Amount\n03/04/2026,STORE A,-10.00\n05/06/2026,STORE B,-5.00\n";
    const unclear = parseStatementCsv(csv, { kind: "bank" });
    expect(unclear.needsDateOrder).toBe(true);
    expect(unclear.lines).toEqual([]);
    expect(unclear.sampleDates).toEqual(["03/04/2026", "05/06/2026"]);
    expect(shape(parseStatementCsv(csv, { kind: "bank", dateOrder: "dmy" }))).toEqual([
      ["2026-04-03", 10, "out"],
      ["2026-06-05", 5, "out"],
    ]);
    // A layout that fixes the order (RBC writes month first) never asks.
    expect(parse("rbc.csv", "credit_card").needsDateOrder).toBe(false);
  });

  it("the agent's mapping is used as given", () => {
    const rows = parseDelimited("x,a,b,c\n03/04/2026,THING ONE,10.00,\n05/04/2026,THING TWO,,4.00\n");
    const p = parseStatementRows(rows, { mapping: { headerRow: 0, date: 0, description: [1], debit: 2, credit: 3, dateOrder: "dmy" } });
    expect(shape(p)).toEqual([
      ["2026-04-03", 10, "out"],
      ["2026-04-05", 4, "in"],
    ]);
  });

  it("a card file with a single signed column and no profile is oriented by its payment lines", () => {
    const p = parseStatementCsv("When,What,How much\n2026-09-01,STORE A,-10.00\n2026-09-02,PAYMENT THANK YOU,100.00\n2026-09-03,STORE B,-5.00\n", { kind: "credit_card" });
    expect(shape(p)).toEqual([
      ["2026-09-01", 10, "out"],
      ["2026-09-02", 100, "in"],
      ["2026-09-03", 5, "out"],
    ]);
  });

  it("summary and repeated header rows are left out and counted", () => {
    const p = parseStatementCsv("Date,Description,Amount\n2026-09-01,STORE A,-10.00\nDate,Description,Amount\nTotal,,-10.00\n", { kind: "bank" });
    expect(p.lines).toHaveLength(1);
    expect(p.skipped["repeated header"]).toBe(1);
  });
});

describe("csv reading", () => {
  it("detects semicolons and tabs", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter('"a,b";c\n1;2')).toBe(";");
  });
  it("keeps quoted delimiters, doubled quotes and line breaks", () => {
    expect(parseDelimited('a,"b, c","say ""hi""","x\ny"\n')).toEqual([["a", "b, c", 'say "hi"', "x\ny"]]);
  });
  it("decodes Windows-1252 and UTF-16 files", () => {
    expect(decodeStatementBytes(new Uint8Array([0x44, 0xe9, 0x62, 0x69, 0x74]))).toBe("Débit");
    expect(decodeStatementBytes(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]))).toBe("AB");
  });
});

describe("account numbers come out", () => {
  it.each([
    ["PAYMENT FROM - *****12*3456", "PAYMENT FROM"],
    ["TRANSFER TO 00123-4567890", "TRANSFER TO"],
    ["'5000123412341234' COFFEE", "COFFEE"],
    ["CARD 4500 **** **** 1234 PURCHASE", "CARD PURCHASE"],
    ["XXXX XXXX XXXX 9876 STORE", "STORE"],
    ["NETFLIX.COM 866-579-0000", "NETFLIX.COM"],
    ["TIM HORTONS #1234", "TIM HORTONS #1234"],
  ])("%s", (input, expected) => {
    expect(stripAccountNumbers(input)).toBe(expected);
  });
  it("from labels and file names", () => {
    expect(scrubAccountLabel("RBC Visa ****1234")).toBe("RBC Visa");
    expect(scrubAccountLabel("1234 5678", "TD")).toBe("TD");
    expect(scrubAccountLabel("")).toBe("Imported account");
    expect(scrubFileName("Statement_4510123412341234_Sep.CSV")).toBe("Statement Sep.csv");
  });
  it("merchant names are readable", () => {
    expect(merchantFromDescription("POS PURCHASE SHELL C12345 SAINT JOHN NB")).toBe("Shell Saint John");
    expect(merchantFromDescription("[CW] COFFEE CO      ")).toBe("Coffee Co");
    expect(merchantFromDescription("SQ *FARMERS MARKET")).toBe("Farmers Market");
    expect(merchantFromDescription("0000000")).toBeNull();
  });
});

describe("values", () => {
  it.each([
    ["9/3/2026", "2026-09-03"],
    ["09/30/2026", "2026-09-30"],
    ["2026-09-03", "2026-09-03"],
    ["2026/09/03", "2026-09-03"],
    ["20260903", "2026-09-03"],
    ["07 Aug 2026", "2026-08-07"],
    ["7 août 2026", "2026-08-07"],
    ["15-Jan-26", "2026-01-15"],
    ["Aug 7, 2026", "2026-08-07"],
    ["2026-09-03 00:00:00", "2026-09-03"],
    ["46268", "2026-09-03"],
    ["2026-02-30", null],
    ["not a date", null],
  ])("date %s", (raw, iso) => {
    expect(parseStatementDate(raw)).toBe(iso);
  });
  it("day-first when told", () => {
    expect(parseStatementDate("03/04/2026", "dmy")).toBe("2026-04-03");
    expect(parseStatementDate("03/04/2026")).toBe("2026-03-04");
  });
  it.each([
    ["-54.20", -54.2, null],
    ["$1,234.56", 1234.56, null],
    ["12.34-", -12.34, null],
    ["(12.34)", -12.34, null],
    ["12.34 CR", 12.34, "cr"],
    ["1 234,56 $", 1234.56, null],
    ["$-5.00", -5, null],
    ["$(12.34)", -12.34, null],
    ["\u221212.34", -12.34, null],
    ["\u2013 12.34", -12.34, null],
    ["CAD (8.00)", -8, null],
  ])("amount %s", (raw, value, marker) => {
    expect(parseStatementAmount(raw)).toEqual({ value, marker });
  });
  it("empty amounts are null", () => {
    expect(parseStatementAmount("")).toBeNull();
    expect(parseStatementAmount("-")).toBeNull();
    expect(parseStatementAmount("abc")).toBeNull();
  });
});
