/**
 * generate-reports.ts
 *
 * Synthetic brokerage report generator for testing the import-history extraction pipeline.
 * Generates hundreds of realistic report variations across every format the system handles,
 * each with embedded ground truth for automated accuracy measurement.
 *
 * Formats covered:
 *   A1 — Agent tracker CSV (standard columns, sale price present)
 *   A2 — Agent tracker CSV (no sale price column)
 *   A3 — Agent tracker CSV (DD/MM dates)
 *   A4 — Agent tracker CSV (Excel serial number dates)
 *   A5 — Agent tracker CSV (quarter codes only)
 *   B1 — Brokerage commission report (party_a / party_b, sale price present)
 *   B2 — Brokerage commission report (no sale price, agent net column only)
 *   B3 — Brokerage report (complex multi-name parties, estates, corporations)
 *   C1 — Narrative / bullet-point text (verbose deal descriptions)
 *   C2 — Narrative with referral fees mixed in
 *
 * Run: npx ts-node --esm scripts/import-tests/generate-reports.ts
 */

import * as fs from "fs";
import * as path from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GroundTruthDeal {
  date: string;          // YYYY-MM-DD
  address: string;
  sale_price: number;
  gci: number;
  /** Post-split net income — only set for formats that include a net commission column. */
  net_income?: number;
  party_a: string;
  party_b: string;
  side: "buyer" | "seller" | "both" | null;
  source: string | null;
}

export interface SyntheticReport {
  id: string;
  format: string;        // e.g. "A1", "B2", "C1"
  year: number;
  content: string;       // the text content to send to the API
  isImage: false;        // text reports only (vision path tested separately)
  groundTruth: {
    year: number;
    annual_gci: number;
    annual_tx: number;
    quarter_gci: [number, number, number, number];
    quarter_tx:  [number, number, number, number];
    deals: GroundTruthDeal[];
  };
}

// ── Realistic data pools ──────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Ashley", "Michael", "Sarah", "John", "Jennifer", "David", "Emily", "James",
  "Jessica", "Robert", "Amanda", "William", "Stephanie", "Christopher", "Nicole",
  "Matthew", "Megan", "Joshua", "Elizabeth", "Andrew", "Samantha", "Daniel",
  "Lauren", "Joseph", "Heather", "Ryan", "Amy", "Kevin", "Angela", "Brian",
  "Melissa", "Eric", "Rebecca", "Justin", "Michelle", "Scott", "Kimberly",
  "Tyler", "Christina", "Patrick", "Lisa", "Mark", "Rachel", "Adam", "Anna",
  "Timothy", "Katherine", "Aaron", "Brittany", "Steven", "Afshin", "Donya",
  "Tong", "Sunny", "Jiaolao", "Micheal", "Jeremy", "Silvio", "Diane",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Wilson", "Anderson", "Taylor", "Thomas", "Jackson", "White", "Harris", "Martin",
  "Thompson", "Young", "Robinson", "Clark", "Rodriguez", "Lewis", "Lee", "Walker",
  "Hall", "Allen", "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson",
  "Carter", "Mitchell", "Perez", "Roberts", "Turner", "Phillips", "Campbell", "Parker",
  "Evans", "Edwards", "Collins", "Stewart", "Sanchez", "Morris", "Rogers", "Reed",
  "Macaulay", "Mathias", "Meng", "Beaton", "Adivi", "Ferris", "Foster", "Gao",
];

const CORPORATE_SUFFIXES = [
  "Ltd.", "Inc.", "Corp.", "Properties Inc.", "Developments Ltd.", "Homes Ltd.",
  "Construction Inc.", "Real Estate Ltd.", "Holdings Corp.", "Realty Inc.",
];

const STREET_NAMES = [
  "Maple Ave", "Oak Drive", "Pine Street", "Cedar Lane", "Birch Road",
  "Elm Crescent", "Willow Court", "Spruce Way", "Ridge Row", "Valley Drive",
  "Hillside Terrace", "Lakeview Drive", "Riverside Road", "Mountain View Ave",
  "Sunset Blvd", "Heritage Lane", "Woodland Drive", "Garden Court", "Park Ave",
  "Main Street", "King Street", "Queen Street", "Elizabeth Pkwy", "McCarthy's Point Rd",
  "Broadview Ave", "Spadina Ave", "Yonge Street", "Bloor Street", "Dundas Street",
  "College Street", "Lawrence Ave", "Bayview Ave", "Leslie Street", "Victoria Street",
];

const SOURCES = ["SOI", "Agent Referral", "Realtor.ca", "Social Media", "Database", "Walk-In", "Open House", "Referral", "Past Client"];

// ── Helper functions ──────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randName(): string {
  const fn = randChoice(FIRST_NAMES);
  const ln = randChoice(LAST_NAMES);
  // 20% chance of couple (two first names)
  if (Math.random() < 0.2) {
    return `${fn} & ${randChoice(FIRST_NAMES)} ${ln}`;
  }
  return `${fn} ${ln}`;
}

function randCorporate(): string {
  return `${randChoice(LAST_NAMES)} ${randChoice(CORPORATE_SUFFIXES)}`;
}

function randAddress(): string {
  return `${randInt(1, 999)} ${randChoice(STREET_NAMES)}`;
}

function randSalePrice(): number {
  // Canadian residential: $280k–$1.8M, rounded to $1k
  const raw = randInt(280000, 1800000);
  return Math.round(raw / 1000) * 1000;
}

function randCommissionPct(): number {
  // 2.0%–3.5% typical
  const pcts = [0.020, 0.025, 0.025, 0.025, 0.030, 0.030, 0.035];
  return randChoice(pcts);
}

function dateForQuarter(year: number, q: 0 | 1 | 2 | 3): string {
  const month = q * 3 + randInt(0, 2); // random month within quarter
  const day = randInt(1, 28);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function quarterOf(dateStr: string): 0 | 1 | 2 | 3 {
  const m = parseInt(dateStr.slice(5, 7)) - 1;
  return Math.floor(m / 3) as 0 | 1 | 2 | 3;
}

// Convert YYYY-MM-DD to DD/MM/YYYY
function toDDMM(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// Excel serial number (days since 1899-12-30, matching Excel's 1900 date system)
// Both dates are treated as UTC midnight (ISO date-only strings → UTC in ECMAScript),
// so the difference is always an exact integer — no noon-rounding off-by-one.
function toExcelSerial(dateStr: string): number {
  const anchor = new Date("1899-12-30"); // UTC midnight (ISO date string)
  const d     = new Date(dateStr);       // UTC midnight (ISO date string)
  return (d.getTime() - anchor.getTime()) / 86_400_000;
}

// ── Deal generator ────────────────────────────────────────────────────────────

function generateDeals(year: number, count: number): GroundTruthDeal[] {
  const deals: GroundTruthDeal[] = [];

  for (let i = 0; i < count; i++) {
    const q = (i % 4) as 0 | 1 | 2 | 3;
    const date = dateForQuarter(year, q);
    const sale_price = randSalePrice();
    const commPct = randCommissionPct();
    const grossGCI = Math.round(sale_price * commPct * 100) / 100;

    const isCorpOtherSide = Math.random() < 0.25;
    const party_a = randName();
    const party_b = isCorpOtherSide ? randCorporate() : randName();
    const side = randChoice(["buyer", "seller", "both"] as const);
    const source = Math.random() < 0.7 ? randChoice(SOURCES) : null;

    deals.push({
      date,
      address: randAddress(),
      sale_price,
      gci: grossGCI,
      party_a,
      party_b,
      side,
      source,
    });
  }

  return deals;
}

function computeGroundTruth(year: number, deals: GroundTruthDeal[]) {
  const quarter_gci: [number, number, number, number] = [0, 0, 0, 0];
  const quarter_tx:  [number, number, number, number] = [0, 0, 0, 0];

  for (const d of deals) {
    const q = quarterOf(d.date);
    quarter_gci[q] = Math.round((quarter_gci[q] + d.gci) * 100) / 100;
    quarter_tx[q]++;
  }

  return {
    year,
    annual_gci: Math.round(quarter_gci.reduce((s, v) => s + v, 0) * 100) / 100,
    annual_tx: quarter_tx.reduce((s, v) => s + v, 0),
    quarter_gci,
    quarter_tx,
    deals,
  };
}

// ── Format generators ─────────────────────────────────────────────────────────

/** A1: Standard agent tracker CSV with sale price column */
function generateA1(year: number, deals: GroundTruthDeal[]): string {
  const header = `${year} Transaction Tracker\nName,Address,Sale Price,Close Date,Buy | Sell,Source,GCI,Net Commission\n`;
  const rows = deals.map((d) => {
    const splitPct = 0.8; // 80/20 split
    const net = Math.round(d.gci * splitPct * 100) / 100;
    const sideLabel = d.side === "buyer" ? "Buy" : d.side === "seller" ? "Sell" : "Buy | Sell";
    return `${d.party_a},${d.address},${d.sale_price},${d.date},${sideLabel},${d.source ?? "SOI"},${d.gci},${net}`;
  });
  return header + rows.join("\n");
}

/** A2: Agent tracker CSV with NO sale price column */
function generateA2(year: number, deals: GroundTruthDeal[]): string {
  const header = `${year} YEAR-END TRANSACTION SUMMARY\nName,Address,Date,Buy | Sell,Source,GCI,Net\n`;
  const rows = deals.map((d) => {
    const splitPct = 0.75;
    const net = Math.round(d.gci * splitPct * 100) / 100;
    const sideLabel = d.side === "buyer" ? "Buy" : d.side === "seller" ? "Sell" : "Buy | Sell";
    return `${d.party_a},${d.address},${d.date},${sideLabel},${d.source ?? "Database"},${d.gci},${net}`;
  });
  return header + rows.join("\n");
}

/** A3: Agent tracker with DD/MM/YYYY dates */
function generateA3(year: number, deals: GroundTruthDeal[]): string {
  const header = `${year} Transaction Log\nClient,Property,Price,Closing Date,Side,Source,GCI,Net\n`;
  const rows = deals.map((d) => {
    const net = Math.round(d.gci * 0.8 * 100) / 100;
    const sideLabel = d.side === "buyer" ? "Buy" : d.side === "seller" ? "Sell" : "Buy | Sell";
    return `${d.party_a},${d.address},${d.sale_price},${toDDMM(d.date)},${sideLabel},${d.source ?? "SOI"},${d.gci},${net}`;
  });
  return header + rows.join("\n");
}

/** A4: Agent tracker with Excel serial number dates */
function generateA4(year: number, deals: GroundTruthDeal[]): string {
  const header = `${year} Deal Log\nClient Name,Address,Sale Price,Date,Buy/Sell,GCI\n`;
  const rows = deals.map((d) => {
    const sideLabel = d.side === "buyer" ? "Buy" : d.side === "seller" ? "Sell" : "Buy | Sell";
    return `${d.party_a},${d.address},${d.sale_price},${toExcelSerial(d.date)},${sideLabel},${d.gci}`;
  });
  return header + rows.join("\n");
}

/** A5: Agent tracker with quarter-code dates only */
function generateA5(year: number, deals: GroundTruthDeal[]): string {
  const header = `${year} Transaction Tracker\nName,Property,Price,Quarter,Side,Source,GCI\n`;
  const rows = deals.map((d) => {
    const q = quarterOf(d.date);
    const qLabel = `Q${q + 1}`;
    const sideLabel = d.side === "buyer" ? "Buy" : d.side === "seller" ? "Sell" : "Buy | Sell";
    return `${d.party_a},${d.address},${d.sale_price},${qLabel},${sideLabel},${d.source ?? "SOI"},${d.gci}`;
  });
  return header + rows.join("\n");
}

/** B1: Brokerage commission report with sale price */
function generateB1(year: number, deals: GroundTruthDeal[]): string {
  const lines: string[] = [
    `ROYAL LePage Real Estate — Commission Statement`,
    `Year: ${year}`,
    ``,
    `Date,Property Address,Sale Price,Parties,Gross Commission,Agent Net (Taxable)`,
  ];
  for (const d of deals) {
    // After annotation: d.gci = Gross Commission (pre-split), d.net_income = Agent Net (post-split)
    const parties = `${d.party_a} / ${d.party_b}`;
    lines.push(`${d.date},${d.address},${d.sale_price},${parties},${d.gci},${d.net_income}`);
  }
  return lines.join("\n");
}

/** B2: Brokerage report without sale price, only net commission */
function generateB2(year: number, deals: GroundTruthDeal[]): string {
  const lines: string[] = [
    `SUTTON GROUP — Agent Commission Report ${year}`,
    ``,
    `Close Date,Clients,Net Commission (Taxable)`,
  ];
  for (const d of deals) {
    const parties = `${d.party_a} / ${d.party_b}`;
    lines.push(`${d.date},${parties},${d.gci}`);
  }
  return lines.join("\n");
}

/** B3: Brokerage report with complex multi-name parties, estates, corporations */
function generateB3(year: number, deals: GroundTruthDeal[]): string {
  // Override party_b with complex variations
  const complexDeals = deals.map((d) => {
    const rand = Math.random();
    let party_b: string;
    if (rand < 0.25) party_b = `Estate Of ${randChoice(FIRST_NAMES)} ${randChoice(LAST_NAMES)}`;
    else if (rand < 0.5) party_b = randCorporate();
    else if (rand < 0.75) party_b = `${randName()} & ${randName()}`;
    else party_b = randName();
    return { ...d, party_b };
  });

  const lines: string[] = [
    `RE/MAX — Annual Commission Statement ${year}`,
    ``,
    `Date,Address,Sale Price,Transaction Parties,Gross Commission,Your Net`,
  ];
  for (const d of complexDeals) {
    // After annotation: d.gci = Gross Commission (pre-split), d.net_income = Agent Net (post-split)
    lines.push(`${d.date},${d.address},${d.sale_price},${d.party_a} / ${d.party_b},${d.gci},${d.net_income}`);
  }
  return lines.join("\n");
}

/** C1: Narrative / bullet-point text with sale prices */
function generateC1(year: number, deals: GroundTruthDeal[]): string {
  const monthNames = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"];

  const lines: string[] = [`${year} CLOSED DEALS — SUMMARY\n`];
  for (const d of deals) {
    const monthIdx = parseInt(d.date.slice(5, 7)) - 1;
    const day = parseInt(d.date.slice(8, 10));
    const sideWord = d.side === "buyer" ? "Buyer rep for" : d.side === "seller" ? "Listed and sold" : "Double-ended:";
    const sourceNote = d.source ? ` (${d.source})` : "";
    lines.push(`- ${monthNames[monthIdx]} ${day}: ${sideWord} ${d.party_a} at ${d.address}. Sold for $${d.sale_price.toLocaleString()}. GCI earned: $${d.gci.toLocaleString()}${sourceNote}.`);
  }
  return lines.join("\n");
}

/** C2: Narrative with referral fees mixed in (tests that referrals are captured) */
function generateC2(year: number, deals: GroundTruthDeal[]): string {
  const monthNames = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"];

  const lines: string[] = [`${year} Annual Production Notes\n`];
  for (const d of deals) {
    const monthIdx = parseInt(d.date.slice(5, 7)) - 1;
    const day = parseInt(d.date.slice(8, 10));

    // 25% of deals are referral fees (lower GCI, no address)
    if (Math.random() < 0.25) {
      const referralFee = Math.round(randInt(500, 3000));
      lines.push(`- ${monthNames[monthIdx]} ${day}: Out-of-area referral sent for ${d.party_a}. Received referral fee of $${referralFee}.`);
      // Note: these modify ground truth and are tricky to handle cleanly in auto-test
      // For now, include them but mark as known-variable in accuracy report
    } else {
      const sideWord = d.side === "buyer" ? "Buyer rep" : d.side === "seller" ? "Listing" : "Double-ended";
      lines.push(`- ${monthNames[monthIdx]} ${day}: ${sideWord} — ${d.party_a} — ${d.address}. Property sold for $${d.sale_price.toLocaleString()}. Commission earned: $${d.gci.toLocaleString()}.`);
    }
  }
  return lines.join("\n");
}

// ── Main generator ────────────────────────────────────────────────────────────

const FORMAT_GENERATORS: Record<string, (year: number, deals: GroundTruthDeal[]) => string> = {
  A1: generateA1,
  A2: generateA2,
  A3: generateA3,
  A4: generateA4,
  A5: generateA5,
  B1: generateB1,
  B2: generateB2,
  B3: generateB3,
  C1: generateC1,
  C2: generateC2,
};

export function generateSyntheticReports(
  options: {
    perFormat?: number;   // how many reports per format (default 10)
    years?: number[];     // which years to use (default [2023, 2024, 2025])
    dealsPerReport?: number; // deals per report (default 8–15)
    seed?: number;        // for reproducibility (unused — Math.random() based)
  } = {}
): SyntheticReport[] {
  const {
    perFormat = 10,
    years = [2023, 2024, 2025],
    dealsPerReport = 12,
  } = options;

  const reports: SyntheticReport[] = [];
  let idCounter = 0;

  for (const format of Object.keys(FORMAT_GENERATORS)) {
    for (let i = 0; i < perFormat; i++) {
      const year = years[i % years.length];
      const dealCount = randInt(Math.max(3, dealsPerReport - 4), dealsPerReport + 4);
      let deals = generateDeals(year, dealCount);

      // Annotate net_income on deals for formats that include a net commission column.
      // The split % matches the value used inside the format generator function.
      if (format === "A1" || format === "A3") {
        deals = deals.map(d => ({ ...d, net_income: Math.round(d.gci * 0.8 * 100) / 100 }));
      } else if (format === "A2") {
        deals = deals.map(d => ({ ...d, net_income: Math.round(d.gci * 0.75 * 100) / 100 }));
      } else if (format === "B1" || format === "B3") {
        // In B-format CSVs the document has two columns:
        //   Gross Commission = d.gci / 0.8  (pre-split — what the brokerage received)
        //   Agent Net        = d.gci         (post-split — what the agent earned)
        // Per system semantics gci = pre-split gross, so we redefine:
        //   d.gci      → Gross Commission (what to capture as gci)
        //   d.net_income → Agent Net (what to capture as net_income)
        deals = deals.map(d => ({
          ...d,
          net_income: d.gci,                                  // Agent Net (original d.gci value)
          gci: Math.round(d.gci / 0.8 * 100) / 100,          // Gross Commission
        }));
      }

      const groundTruth = computeGroundTruth(year, deals);
      const content = FORMAT_GENERATORS[format](year, deals);

      reports.push({
        id: `${format}-${String(++idCounter).padStart(4, "0")}`,
        format,
        year,
        content,
        isImage: false,
        groundTruth,
      });
    }
  }

  return reports;
}

// ── CLI entry point ────────────────────────────────────────────────────────────

if (process.argv[1]?.includes("generate-reports")) {
  const reports = generateSyntheticReports({ perFormat: 5 });
  const outDir = path.join(path.dirname(process.argv[1]), "generated");
  fs.mkdirSync(outDir, { recursive: true });

  // Write a sample of each format to disk for manual inspection
  const seenFormats = new Set<string>();
  for (const r of reports) {
    if (!seenFormats.has(r.format)) {
      seenFormats.add(r.format);
      fs.writeFileSync(path.join(outDir, `sample-${r.format}.txt`), r.content, "utf8");
      fs.writeFileSync(
        path.join(outDir, `ground-truth-${r.format}.json`),
        JSON.stringify(r.groundTruth, null, 2),
        "utf8"
      );
    }
  }

  console.log(`Generated ${reports.length} synthetic reports across ${Object.keys(FORMAT_GENERATORS).length} formats.`);
  console.log(`Sample files written to: ${outDir}`);
}
