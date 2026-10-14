/**
 * Public tax pages give each province its own GST/HST rate, state CRA's three
 * instalment options the way CRA does, and state deductions as CRA's rules
 * (2026-10-13).
 *
 * What was wrong:
 *   - Blog, "The Real Cost of a Real Estate Deal": "In most provinces, you
 *     charge 13% HST on your commission". 13% is Ontario's rate only. Same
 *     section: "you're leaving ITCs on the table and paying more HST than you
 *     need to".
 *   - Nova Scotia at 15% (14% since April 1, 2025) on six surfaces: "in the
 *     Maritimes, 15%" on two articles, the rate table on the HST registration
 *     guide, the home office and vehicle guides, the cheat sheet PDF's source,
 *     and the commission calculator's own rate table, so the calculator worked
 *     out the wrong HST for a Nova Scotia agent.
 *   - "Real Estate Agent Tax Planning in Canada": "The most effective planning
 *     approach for agents with variable income is the current-year method ...
 *     which is exactly what a tool like Agent Runway calculates
 *     automatically", "Following this option exactly eliminates
 *     instalment-interest risk even if income grows", "a well-managed expense
 *     strategy can meaningfully reduce net business income", and a combined
 *     marginal rate "in the 40–45% range" with no source.
 *   - Tax estimator page: "Most agents use the no-calculation option". Tax
 *     deadlines page: "whichever minimizes your amount". Instalments guide:
 *     "The no-calculation option is the default" and three "eliminates
 *     instalment interest" sentences. CRA's page attaches a condition to that
 *     ("unless your estimated instalment amounts are too low").
 *   - "How Much Should Real Estate Agents Save for Taxes": "the CRA expects
 *     you to manage your own instalments" and "face a painful bill at filing
 *     time".
 *
 * The wording lives in `@agent-runway/core/tax-copy` (cra-rules.ts), where
 * each rule is checked against CRA's page and each rate against the tax
 * engine. This file proves the pages print it, and scans every file that can
 * reach a reader for the old claims. Pages are read as source, the way
 * tax-portion-copy.test.ts reads them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CRA_GST_HST_SOURCES,
  GST_HST_RATE_RULE,
  GST_HST_TRUST_RULE,
  INPUT_TAX_CREDIT_EVIDENCE_RULE,
  INPUT_TAX_CREDIT_NOTE,
  INPUT_TAX_CREDIT_RULE,
  validateTaxCopy,
} from "@agent-runway/core/tax-copy";
import { gstHstRate } from "@agent-runway/core/engines/canadian-tax-engine";
import { PROVINCE_ISO_CODES, PROVINCE_LABELS, type Province } from "@agent-runway/core/types/database";
import { calculateCommission } from "@/app/real-estate-commission-calculator-canada/commission-calculator";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/
const REPO = path.resolve(WEB, "../..");
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error");

/** The text from `start` up to `end`, or to the end of the file. */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  expect(from, `"${start}" is in the file`).toBeGreaterThanOrEqual(0);
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to === -1 ? undefined : to);
}

// ─────────────────────────────────────────────────────────────────────────
// 1. The scan
// ─────────────────────────────────────────────────────────────────────────

const SCAN_ROOTS = [
  "apps/web/app",
  "apps/web/content",
  "apps/web/lib",
  "apps/web/components",
  "apps/web/public",
  "apps/mobile",
];
const SKIP_DIRS = new Set(["node_modules", "__tests__", ".next", ".expo", ".turbo", "ios", "android", "dist", "build"]);
const TEXT_FILE = /\.(?:tsx?|mdx?|txt|json|html)$/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : filesUnder(full);
    return TEXT_FILE.test(entry.name) ? [full] : [];
  });
}

/**
 * Matched against a whole file with its whitespace collapsed, because JSX
 * wraps a sentence over several lines ("Nova\n Scotia").
 */
const CLAIMS: ReadonlyArray<{ name: string; re: RegExp }> = [
  // A GST/HST rate given to the wrong provinces.
  { name: "one HST rate for most provinces", re: /\bin most provinces\b[^.]{0,80}\b(?:HST|GST)\b|\b(?:HST|GST)\b[^.]{0,80}\bin most provinces\b/i },
  { name: "one HST rate for the Maritimes", re: /\bMaritimes?\b[^.]{0,40}\b\d{1,2}(?:\.\d+)? ?%|\b\d{1,2}(?:\.\d+)? ?%[^.]{0,40}\bMaritimes?\b/i },
  // "15% in New Brunswick, Nova Scotia, ..." (no other rate in between), and
  // a table cell or label with 15% straight after the name.
  { name: "Nova Scotia at 15%", re: /\b15 ?%(?! (?:before|to 14))[^.;%]{0,100}\bNova Scotia\b|\bNova Scotia\b(?:\s|<[^>]+>|[":(])*15 ?%(?! (?:before|to 14))/ },
  { name: "NS listed with the 15% provinces", re: /\b(?:[A-Z]{2}, ){1,4}NS\b[^.;]{0,25}\b15 ?%/ },
  // One of CRA's three instalment options put above the others.
  { name: "most effective", re: /\bmost effective\b/i },
  { name: "what most agents use", re: /\bmost (?:agents|realtors)\b[^.]{0,80}\b(?:option|method)\b/i },
  { name: "whichever minimizes", re: /\bwhichever minimi[sz]es\b/i },
  { name: "an option called the default", re: /\b(?:no-calculation|prior-year|current-year) (?:option|method) is the default\b/i },
  { name: "an option that eliminates instalment interest", re: /\beliminates?\s+instalment[- ]interest\b|\binstalment[- ]interest (?:risk|exposure)\b/i },
  { name: "exactly what Agent Runway calculates", re: /\bexactly what a tool like\b/i },
  // Directives and pressure on a tax page.
  { name: "ITCs left on the table", re: /\bITCs? on the table\b|\bmore (?:HST|GST) than you need\b/i },
  { name: "the CRA expects you to", re: /\bCRA expects you to\b/i },
  { name: "a painful bill", re: /\bpainful bill\b/i },
  { name: "an expense strategy", re: /\bexpense strategy\b/i },
];

describe("no source file that reaches a reader carries the old claims", () => {
  const files = SCAN_ROOTS.flatMap((root) => filesUnder(path.join(REPO, root)));

  // Read once, here, and not inside each test (see tax-portion-copy.test.ts).
  const texts = files.map((file) => ({
    rel: path.relative(REPO, file),
    text: readFileSync(file, "utf8").replace(/\s+/g, " "),
  }));

  it("the scan reads the articles, the blog, the PDFs' sources and the mobile app", () => {
    const rels = texts.map((t) => t.rel);
    expect(rels).toContain("apps/web/app/real-estate-agent-tax-planning-canada/page.tsx");
    expect(rels).toContain("apps/web/content/blog/the-real-cost-of-a-real-estate-deal.mdx");
    expect(rels).toContain("apps/web/lib/reports/cheat-sheet-pdf-doc.tsx");
    expect(rels).toContain("apps/web/lib/knowledge-base.ts");
    expect(rels.some((r) => r.startsWith("apps/mobile/") && r.endsWith(".tsx"))).toBe(true);
    expect(files.length).toBeGreaterThan(500);
  });

  it.each(CLAIMS)("$name", ({ re }) => {
    const hits = texts
      .filter(({ text }) => re.test(text))
      .map(({ rel, text }) => `${rel}  ${text.match(re)?.[0].slice(0, 120)}`);
    expect(hits).toEqual([]);
  });

  it("the patterns catch the sentences that were removed", () => {
    const removed = [
      "In most provinces, you charge 13% HST on your commission:",
      "In Ontario the rate is 13%; in the Maritimes, 15%",
      "In HST provinces like Ontario (13%) or the Maritimes (15%), this is a significant additional obligation.",
      "13% in Ontario, 15% in New Brunswick, Nova Scotia, PEI, and Newfoundland & Labrador",
      "For agents in HST provinces (15%: New Brunswick, Nova Scotia, Prince Edward Island",
      "<strong>HST provinces (15%):</strong> New Brunswick, Nova Scotia, Prince Edward Island",
      'Nova Scotia</td><td className="px-4 py-2">15%</td>',
      '["HST — NB, NL, NS, PEI", "15%"],',
      "The most effective planning approach for agents with variable income is the current-year method",
      "which is exactly what a tool like Agent Runway calculates automatically",
      "Following this option exactly eliminates instalment-interest risk even if income grows.",
      "Following the prior-year option exactly also eliminates instalment interest exposure",
      "Most agents use the no-calculation option unless income swings dramatically year-to-year.",
      "the prior-year / current-year / no-calculation method — whichever minimizes your amount.",
      "The no-calculation option is the default.",
      "you're leaving ITCs on the table and paying more HST than you need to",
      "and the CRA expects you to manage your own instalments",
      "and face a painful bill at filing time.",
      "a well-managed expense strategy can meaningfully reduce net business income",
    ];
    for (const sentence of removed) {
      expect(CLAIMS.some(({ re }) => re.test(sentence)), sentence).toBe(true);
    }
  });

  it("the patterns leave correct rates and ordinary sentences alone", () => {
    const fine = [
      GST_HST_RATE_RULE,
      "**GST/HST:** 5%(AB,BC,MB,SK,territories), 13%(ON), 14%(NS), 15%(NB,NL,PE).",
      "HST collected on commissions (13% in ON, 14% in NS, 15% in NB/NL/PE, etc.)",
      "Nova Scotia HST Rate Decrease — General Transitional Rules (HST 15% to 14%, effective April 1, 2025)",
      'Nova Scotia</td><td className="px-4 py-2">{gstHstRatePercent("novaScotia")}</td><td className="px-4 py-2">HST (15% before April 1, 2025)</td>',
      "PREC = Personal Real Estate Corporation, available in most provinces.",
      "Per CRA, this option is best if income, deductions and credits stay about the same from year to year.",
      "overpaying a later instalment may reduce or eliminate the net interest charge",
      "Discuss the best method with your accountant.",
    ];
    for (const sentence of fine) {
      expect(CLAIMS.filter(({ re }) => re.test(sentence)).map((c) => c.name), sentence).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The reworded passages
// ─────────────────────────────────────────────────────────────────────────

describe("blog: the real cost of a real estate deal, Step 3", () => {
  const post = source("content/blog/the-real-cost-of-a-real-estate-deal.mdx");
  const section = between(post, "## Step 3: HST/GST", "\n## ");

  it("states the rate by province in the shared wording, with CRA's rate table linked", () => {
    expect(section).toContain(GST_HST_RATE_RULE);
    expect(section).toContain(`[${CRA_GST_HST_SOURCES.rates.label}](${CRA_GST_HST_SOURCES.rates.url})`);
  });

  it("the worked example names its province, and its figures are the engine's rate on $10,000", () => {
    expect(section).toContain("For an agent in Ontario, where the rate is 13%");
    expect(gstHstRate("ontario")).toBe(0.13);
    expect(section).toContain(`$10,000 (your share after split) + $${(10_000 * gstHstRate("ontario")).toLocaleString("en-CA")} HST collected = $11,300 invoice to brokerage`);
    expect(section).toContain(`In New Brunswick the same $10,000 carries $${(10_000 * gstHstRate("newBrunswick")).toLocaleString("en-CA")} of HST`);
    expect(section).toContain(`in Alberta $${(10_000 * gstHstRate("alberta")).toLocaleString("en-CA")} of GST`);
  });

  it("states the trust rule and the input tax credit rules in the shared wording, with CRA's page linked", () => {
    expect(section).toContain(GST_HST_TRUST_RULE);
    expect(section).toContain(INPUT_TAX_CREDIT_RULE);
    expect(section).toContain(INPUT_TAX_CREDIT_NOTE);
    expect(section).toContain(INPUT_TAX_CREDIT_EVIDENCE_RULE);
    expect(section).toContain(`[${CRA_GST_HST_SOURCES.inputTaxCredits.label}](${CRA_GST_HST_SOURCES.inputTaxCredits.url})`);
  });

  it("has no advice wording and no em dash", () => {
    expect(errorsIn(section)).toEqual([]);
    expect(section).not.toContain("—");
    expect(section).not.toMatch(/isn't yours/i);
  });
});

describe("article: real estate agent tax planning in Canada", () => {
  const page = source("app/real-estate-agent-tax-planning-canada/page.tsx");
  const instalments = between(page, 'id="quarterly-instalments"', "<h3>How much of a commission is tax</h3>");
  const deductions = between(page, 'id="deductible-expenses"', 'id="tax-planning-tools"');

  it("who pays, when, interest and penalty are the shared rules, each with its citation", () => {
    expect(instalments).toContain("{INSTALMENT_REQUIREMENT_RULE}");
    expect(instalments).toContain("INCOME_TAX_INSTALMENT_DUE_DATES.map(");
    expect(instalments).toContain("{INSTALMENT_INTEREST_RULE}");
    expect(instalments).toContain("{INSTALMENT_PENALTY_RULE}");
    expect(page).toContain("{ id: 14, ...CRA_INSTALMENT_SOURCES.interest }");
    expect(instalments).not.toMatch(/\$3,000|\$1,800/);
    expect(instalments).not.toMatch(/<strong>(?:March|June|September|December) 15<\/strong>/);
  });

  it("prints CRA's three options from one list, so each is stated in the same two parts", () => {
    expect(instalments).toContain("{INSTALMENT_OPTIONS_RULE}");
    expect(instalments).toContain("INSTALMENT_OPTION_LIST.map((option) => (");
    expect(instalments).toContain("<strong>{option.name}.</strong> {option.how} {option.bestIf}");
    expect(instalments).toContain("{INSTALMENT_OPTION_INTEREST_RULE}");
    expect(instalments.match(/<CRACite id=\{6\} \/>/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("types no option by hand and ranks none", () => {
    expect(instalments).not.toMatch(/<strong>(?:No-calculation|Prior-year|Current-year) option<\/strong>/);
    expect(instalments).not.toMatch(/one quarter of last year|planning approach|current-year method/i);
  });

  it("Agent Runway's part is the shared statement of what the engine estimates", () => {
    expect(instalments).toContain("{INSTALMENT_ENGINE_ESTIMATE}");
    expect(page).not.toMatch(/calculates\s+automatically/);
  });

  it("deductions are CRA's rules in the shared wording, each with its citation", () => {
    expect(deductions).toContain("{BUSINESS_EXPENSE_RULE}");
    expect(deductions).toContain("{PERSONAL_EXPENSE_RULE}");
    expect(deductions).toContain("{MEALS_ENTERTAINMENT_RULE}");
    expect(deductions).toContain("{CAPITAL_COST_ALLOWANCE_RULE}");
    expect(deductions).toMatch(/\{MEALS_ENTERTAINMENT_RULE\}\s*<CRACite id=\{13\} \/>/);
    expect(deductions).toMatch(/\{CAPITAL_COST_ALLOWANCE_RULE\}\s*<CRACite id=\{12\} \/>/);
    expect(deductions).not.toMatch(/deductibility cap|genuine advantages|loosely related/i);
  });

  it("the intro carries no unsourced marginal rate range and no pressure wording", () => {
    expect(page).not.toMatch(/40–45%/);
    expect(page).not.toMatch(/unexpected CRA bill|caught\s+off guard|most\s+frequently overlooked|serious real estate agents/i);
    expect(page).not.toMatch(/majority of active real estate agents/i);
  });
});

describe("article: how much should real estate agents save for taxes", () => {
  const page = source("app/how-much-should-real-estate-agents-save-for-taxes-canada/page.tsx");

  it("registration and the rate by province are the shared rules, in the FAQ schema and on the page", () => {
    expect(page).toContain("const HST_GST_ANSWER = `${SMALL_SUPPLIER_RULE} ${GST_HST_RATE_RULE}`;");
    expect(page).toContain("text: HST_GST_ANSWER,");
    expect(page.match(/\{SMALL_SUPPLIER_RULE\}\s*<CRACite id=\{3\} \/> \{GST_HST_RATE_RULE\}/g)).toHaveLength(2);
    expect(page).toContain("{ id: 8, ...CRA_GST_HST_SOURCES.rates }");
  });

  it("types no HST rate and no registration limit", () => {
    expect(page).not.toMatch(/Ontario \(13%\)|rate is 13%/);
    expect(page).not.toMatch(/\$30,000/);
    expect(page).not.toMatch(/significant additional obligation/i);
  });

  it("why tax is paid later is CRA's withholding rule, not a warning", () => {
    const why = between(page, "Why tax planning is harder for real estate agents", "FAQ SECTION");
    expect(why).toContain("{INSTALMENT_WITHHOLDING_RULE}");
    expect(why).not.toMatch(/common pattern|underestimate/i);
    expect(page).not.toMatch(/No surprises at tax time/i);
  });
});

describe("commission calculator: the rate is the engine's for every province", () => {
  const provinces = Object.keys(PROVINCE_LABELS).filter((key): key is Province => key in PROVINCE_LABELS);

  it.each(provinces)("%s", (province) => {
    const result = calculateCommission(500_000, 2.5, 80, 500, PROVINCE_ISO_CODES[province]);
    expect(result.hstRate).toBe(gstHstRate(province));
    expect(result.hstOwed).toBeCloseTo(result.afterFees * gstHstRate(province), 6);
  });

  it("Nova Scotia is 14%, not the 15% the calculator's own table had", () => {
    expect(calculateCommission(500_000, 2.5, 80, 500, "NS").hstRate).toBe(0.14);
  });

  it("the component keeps no rate table of its own", () => {
    const component = source("app/real-estate-commission-calculator-canada/commission-calculator.tsx");
    expect(component).toContain("hstRate: gstHstRate(province)");
    expect(component).not.toMatch(/hstRate: 0\.\d/);
  });

  it("the page states registration and the rate in the shared wording, and names the example's province", () => {
    const page = source("app/real-estate-commission-calculator-canada/page.tsx");
    expect(page).toContain("const HST_GST_ANSWER = `${SMALL_SUPPLIER_RULE} ${GST_HST_RATE_RULE}`;");
    expect(page).toContain("text: HST_GST_ANSWER,");
    expect(page.match(/\{SMALL_SUPPLIER_RULE\}\s*<CRACite id=\{1\} \/> \{GST_HST_RATE_RULE\}/g)).toHaveLength(2);
    expect(page).toContain('Ontario&apos;s {gstHstRatePercent("ontario")} HST');
    expect(page).toContain("{ id: 5, ...CRA_GST_HST_SOURCES.rates }");
  });
});

describe("pages that list the rate by province print the engine's", () => {
  it("HST registration guide: every rate cell is the engine's", () => {
    const page = source("app/real-estate-agent-hst-registration-canada/page.tsx");
    const table = between(page, "<tbody", "</tbody>");
    expect(table.match(/\{gstHstRatePercent\("[a-zA-Z]+"\)\}/g)).toHaveLength(10);
    expect(table).toContain('{gstHstRatePercent("novaScotia")}');
    expect(table).toContain("{GST_RATE_GROUP.percent} + QST");
    expect(table).not.toMatch(/>\d{1,2}%</);
    expect(page).toContain("{ id: 8, ...CRA_GST_HST_SOURCES.rates }");
    // Four provinces (AB, BC, MB, SK) and three territories have GST alone.
    expect(page).toMatch(/Four\s+provinces and three territories use only the federal/);
  });

  it.each([
    "app/business-use-of-home-real-estate-agents-canada/page.tsx",
    "app/vehicle-expenses-real-estate-agents-canada/page.tsx",
  ])("%s: the list comes from the shared rate groups", (rel) => {
    const page = source(rel);
    expect(page).toContain("HST_RATE_GROUPS.map(");
    expect(page).toContain("{GST_RATE_GROUP.names}");
    expect(page).not.toMatch(/\b1[345] ?%:|\(1[345] ?%\)/);
    expect(page).not.toMatch(/cents on the\s+dollar/);
  });

  it("cheat sheet PDF source: one row per HST rate, from the shared rate groups", () => {
    const doc = source("lib/reports/cheat-sheet-pdf-doc.tsx");
    expect(doc).toContain("...HST_RATE_GROUPS.map((group) => [`HST — ${group.codes}`, group.percent]),");
    expect(doc).toContain("[`GST (${GST_RATE_GROUP.codes})`, GST_RATE_GROUP.percent],");
    expect(doc).not.toMatch(/"1[345]%"/);
  });
});

describe("the other pages that describe CRA's instalment options", () => {
  it("tax estimator page: the three options in the shared wording, with CRA's page linked", () => {
    const page = source("app/tools/realtor-tax-estimator/page.tsx");
    expect(page).toContain("{INSTALMENT_OPTIONS_RULE}");
    expect(page).toContain("INSTALMENT_OPTION_LIST.map((option) => option.how)");
    expect(page).toContain("CRA_INSTALMENT_SOURCES.options.url");
    expect(page).not.toMatch(/three instalment methods/i);
  });

  it("tax deadlines page: names the options and picks none", () => {
    const page = source("app/real-estate-tax-deadlines-canada/page.tsx");
    expect(page).toContain("`Second quarterly instalment for the 2026 tax year. ${INSTALMENT_OPTIONS_RULE}`");
  });

  it("instalments guide: each option, the reminders and interest are the shared rules", () => {
    const page = source("app/real-estate-agent-tax-instalments-canada/page.tsx");
    const methods = between(page, 'id="methods"', 'id="due-dates"');
    for (const key of ["noCalculation", "priorYear", "currentYear"]) {
      expect(methods).toContain(`{INSTALMENT_OPTIONS.${key}.how}`);
      expect(methods).toContain(`{INSTALMENT_OPTIONS.${key}.bestIf}`);
    }
    expect(methods).toContain("{INSTALMENT_REMINDERS_RULE}");
    expect(methods).toContain("{INSTALMENT_INTEREST_RULE}");
    expect(methods).toContain("{INSTALMENT_INTEREST_LEAST_RULE}");
    expect(methods).toContain("{INSTALMENT_OPTION_INTEREST_RULE}");
    expect(methods).not.toMatch(/trade-off|lowest\s+figure|not penalised|locked in advance/i);
    expect(page).toContain("{INSTALMENT_ENGINE_ESTIMATE}");
    // The engine's quarterly figure has no HST in it and is not CRA's own calculation.
    expect(page).not.toMatch(/implements the CRA-published/);
    expect(page).not.toMatch(/tends to track reality/);
  });
});
