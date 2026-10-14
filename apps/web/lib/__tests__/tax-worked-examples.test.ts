/**
 * A worked example on a public page prints the tax engine's figures for its
 * tax row, not typed ones (2026-10-13).
 *
 * What was wrong:
 *   - "How Real Estate Agents Calculate Net Income", Step 4, an Ontario agent
 *     with $110,000 of net business income: tax that "runs approximately
 *     $28,000–$32,000", CPP of "a further $6,000–$7,000" (under CRA's
 *     self-employed maximum), "A combined tax and CPP estimate of $35,000 is
 *     a reasonable planning figure", then "Approximate net income: $75,000"
 *     and "just 37.5% of the headline number". No tax year. Earlier in the
 *     article: "might realistically net somewhere between $65,000 and
 *     $90,000".
 *   - Metrics, Net Income: a waterfall row "Federal + provincial tax + CPP,
 *     Ontario rates, 2025, −$34,000" on $112,200, while the engine is on 2026
 *     tables, and "37% of original GCI".
 *   - "How Real Estate Agents Track GCI": a waterfall row "−$38,000, Approx.
 *     — varies by province" on $130,200, for no province.
 *   - Blog, "How to Set a Realistic Annual GCI Goal": "your effective tax
 *     rate on net income could be anywhere from 25% to 45%", "assume 35% of
 *     net income goes to taxes and CPP", and a formula that divided by
 *     (1 − tax rate).
 *
 * The rule (memory/feedback_tax_information_not_advice.md): every tax number
 * shown to a reader comes from the canonical engine and is marked as an
 * estimate. The three pages are server components, so they call
 * `taxEstimateBreakdown` (@agent-runway/core/tax-copy) when the page is
 * built. A blog post cannot call the engine, so it carries no tax figure.
 *
 * Three checks:
 *   1. Each page is rendered and every dollar figure and percentage in its
 *      tax section is compared with the engine.
 *   2. The blog post's tax step carries the shared wording and no rate.
 *   3. A scan of the public pages and posts for a typed tax figure on an
 *      income ("tax of approximately $", "a 30% effective tax rate").
 */
import { describe, expect, it, vi } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_TAX_DISCLAIMER,
  TAX_ENGINE_ESTIMATE,
  fmtTaxEstimateRate,
  taxEstimateSpread,
  validateTaxCopy,
} from "@agent-runway/core/tax-copy";
import { calculate } from "@agent-runway/core/engines/canadian-tax-engine";
import NetIncomeArticle from "@/app/how-real-estate-agents-calculate-net-income/page";
import NetIncomeMetricPage from "@/app/metrics/net-income/page";
import TrackGciArticle from "@/app/how-real-estate-agents-track-gci/page";

// The site header reads the router and the signed-in session. Neither exists
// in a test and neither is what these tests are about.
vi.mock("@/components/marketing-nav", () => ({ MarketingNav: () => null }));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/
const REPO = path.resolve(WEB, "../..");
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error");

/** "$30,855": a whole-dollar amount the way the pages print it. */
const dollars = (amount: number) => `$${Math.round(amount).toLocaleString("en-CA")}`;

/** The page as a reader gets it: rendered, tags removed, one block per line. */
function textOf(page: ComponentType): string {
  return renderToStaticMarkup(createElement(page))
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<\/(?:p|li|ul|ol|div|h[1-6]|section|figure)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ");
}

/** The text from `start` up to `end`. Both have to be there. */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  expect(from, `"${start}" is on the page`).toBeGreaterThanOrEqual(0);
  const to = text.indexOf(end, from + start.length);
  expect(to, `"${end}" is on the page after it`).toBeGreaterThan(from);
  return text.slice(from, to);
}

const dollarFiguresIn = (text: string) => new Set(text.match(/\$\d{1,3}(?:,\d{3})*(?:\.\d+)?/g) ?? []);
const percentagesIn = (text: string) => new Set(text.match(/\d+(?:\.\d+)?%/g) ?? []);

/** Every amount taken off in a waterfall: "−$60,000" gives 60000. */
const deductionsIn = (text: string) =>
  [...text.matchAll(/−\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));

// ─────────────────────────────────────────────────────────────────────────
// 1. The rendered pages
// ─────────────────────────────────────────────────────────────────────────

describe("article: how real estate agents calculate net income, the worked example", () => {
  const GCI = 200_000;
  const NET_BUSINESS_INCOME = 110_000;
  const engine = calculate(NET_BUSINESS_INCOME, "ontario", 0);
  const afterTax = NET_BUSINESS_INCOME - engine.totalBurden;

  const page = textOf(NetIncomeArticle);
  const stepsOneToThree = between(page, "Step 1: Apply the brokerage commission split", "Step 4:");
  const stepFour = between(
    page,
    "Step 4: Estimate federal and provincial income tax plus CPP",
    "How brokerage structure changes the outcome",
  );

  it("steps 1 to 3 arrive at the income the engine is given", () => {
    expect(stepsOneToThree).toContain(`GCI: ${dollars(GCI)}`);
    const takenOff = deductionsIn(stepsOneToThree);
    expect(takenOff).toEqual([60_000, 8_000, 22_000]);
    expect(GCI - takenOff.reduce((sum, amount) => sum + amount, 0)).toBe(NET_BUSINESS_INCOME);
    expect(stepsOneToThree).toContain(`Net business income before tax: ${dollars(NET_BUSINESS_INCOME)}`);
    expect(stepFour).toContain(`Net business income before tax: ${dollars(NET_BUSINESS_INCOME)}`);
  });

  it("prints the engine's federal tax, provincial tax, CPP and total for Ontario", () => {
    expect(stepFour).toContain(`Estimated federal income tax: ${dollars(engine.federalTax)}`);
    expect(stepFour).toContain(`Estimated Ontario income tax: ${dollars(engine.provincialTax)}`);
    expect(stepFour).toContain(`Estimated CPP contributions: ${dollars(engine.totalCPP)}`);
    expect(stepFour).toContain(`Estimated tax and CPP for ${engine.taxYear}: ${dollars(engine.totalBurden)}`);
    expect(stepFour).toContain(`Estimated federal + provincial tax + CPP: −${dollars(engine.totalBurden)}`);
  });

  it("names the engine's tax year and the province", () => {
    expect(stepFour).toContain(`works them out for Ontario, for the ${engine.taxYear} tax year`);
  });

  it("the net income is the income less the engine's total, and its share of GCI is that over GCI", () => {
    expect(stepFour).toContain(`Approximate net income: ${dollars(afterTax)}`);
    expect(stepFour).toContain(
      `the amount left in this example is ${dollars(afterTax)}, which is ${fmtTaxEstimateRate(afterTax / GCI)} of GCI`,
    );
  });

  it("the rate is the total over the income, rounded once, not the engine's rounded rate", () => {
    const rate = fmtTaxEstimateRate(engine.totalBurden / NET_BUSINESS_INCOME);
    expect(stepFour).toContain(`which is ${rate} of net business income`);
    // 28.04989…% prints as 28.0%. The engine's four-decimal 0.2805 would print as 28.1%.
    expect(rate).toBe("28.0%");
    expect(source("app/how-real-estate-agents-calculate-net-income/page.tsx")).not.toContain("effectiveRate");
  });

  it("every dollar figure in step 4 is the engine's or one of the example's two inputs", () => {
    expect(dollarFiguresIn(stepFour)).toEqual(
      new Set([
        dollars(GCI),
        dollars(NET_BUSINESS_INCOME),
        dollars(engine.federalTax),
        dollars(engine.provincialTax),
        dollars(engine.totalCPP),
        dollars(engine.totalBurden),
        dollars(afterTax),
      ]),
    );
  });

  it("every percentage in step 4 is worked out from the engine", () => {
    const { low, high } = taxEstimateSpread(NET_BUSINESS_INCOME);
    expect(percentagesIn(stepFour)).toEqual(
      new Set([
        fmtTaxEstimateRate(engine.totalBurden / NET_BUSINESS_INCOME),
        fmtTaxEstimateRate(afterTax / GCI),
        fmtTaxEstimateRate(low.rate),
        fmtTaxEstimateRate(high.rate),
      ]),
    );
    expect(stepFour).toContain(`in ${low.label}`);
    expect(stepFour).toContain(`in ${high.label}`);
  });

  it("the printed lines add up to the printed total", () => {
    // True for these figures. If a new tax year's tables make the rounded
    // lines miss the rounded total by a dollar, the page already says amounts
    // are rounded; this test is then the place to decide how to print them.
    expect(
      Math.round(engine.federalTax) + Math.round(engine.provincialTax) + Math.round(engine.totalCPP),
    ).toBe(Math.round(engine.totalBurden));
    expect(NET_BUSINESS_INCOME - Math.round(engine.totalBurden)).toBe(Math.round(afterTax));
  });

  it("states what the engine counts and carries the canonical disclaimer", () => {
    expect(stepFour).toContain(TAX_ENGINE_ESTIMATE.assumptions);
    expect(stepFour).toContain("Amounts are rounded to the nearest dollar.");
    expect(stepFour).toContain(CANONICAL_TAX_DISCLAIMER);
  });

  it("the range typed earlier in the article is the example's own figure now", () => {
    const intro = between(page, "What Is Net Income for a Real Estate Agent?", "Why the distinction matters");
    expect(intro).not.toMatch(/\$65,000|\$90,000/);
    expect(intro).toContain(
      `an agent in Ontario with ${dollars(GCI)} in GCI is left with ${dollars(afterTax)}`,
    );
    expect(intro).toContain(`the tax engine's ${engine.taxYear} estimate of income tax and CPP`);
  });

  it("describes the figures instead of judging them", () => {
    const example = between(page, "The Net Income Calculation Step by Step", "Why Most Agents Overestimate");
    expect(example).not.toMatch(/reasonable|realistic|conservative|meaningful|standard 70\/30|not unusual|well-run/i);
    expect(example).toContain("It is an illustration figure, not a benchmark.");
    expect(errorsIn(stepFour)).toEqual([]);
    expect(stepFour).not.toContain("—");
  });
});

describe("metrics: net income, the waterfall", () => {
  const GCI = 210_000;
  const PRE_TAX = 112_200;
  const engine = calculate(PRE_TAX, "ontario", 0);
  const afterTax = PRE_TAX - engine.totalBurden;
  const shareLeft = fmtTaxEstimateRate(afterTax / GCI);

  const page = textOf(NetIncomeMetricPage);
  const waterfall = between(page, "How to calculate net income", "Why net income matters more than GCI");
  const taxRows = waterfall.slice(waterfall.indexOf("Pre-Tax Net Income"));

  it("the typed rows arrive at the income the engine is given", () => {
    expect(waterfall).toContain(`an agent in Ontario earning ${dollars(GCI)} GCI`);
    const takenOff = deductionsIn(waterfall.slice(0, waterfall.indexOf("Pre-Tax Net Income")));
    expect(takenOff).toEqual([42_000, 4_200, 3_600, 48_000]);
    expect(GCI - takenOff.reduce((sum, amount) => sum + amount, 0)).toBe(PRE_TAX);
  });

  it("the tax row is the engine's total, with the engine's tax year, and what is left follows from it", () => {
    expect(taxRows).toContain("Estimated federal + provincial tax + CPP");
    expect(taxRows).toContain(`Agent Runway tax engine, Ontario, ${engine.taxYear} tax year`);
    expect(taxRows).toContain(`−${dollars(engine.totalBurden)}`);
    expect(taxRows).toContain(`Estimated After-Tax Net Income\n${dollars(afterTax)}`);
    expect(taxRows).toContain(`${shareLeft} of GCI in this example.`);
    expect(PRE_TAX - Math.round(engine.totalBurden)).toBe(Math.round(afterTax));
  });

  it("no other dollar figure or percentage is in the tax rows, and no other year", () => {
    expect(dollarFiguresIn(taxRows)).toEqual(
      new Set([dollars(PRE_TAX), dollars(engine.totalBurden), dollars(afterTax)]),
    );
    expect(percentagesIn(taxRows)).toEqual(new Set([shareLeft]));
    expect(taxRows.match(/\b20\d\d\b/g)).toEqual([String(engine.taxYear)]);
  });

  it("the figure at the top of the page is the same share", () => {
    expect(page).toContain(`${shareLeft}\nof GCI left after estimated tax in the worked example below (Ontario)`);
    expect(page).not.toContain("~37%");
  });

  it("states what the engine counts and carries the canonical disclaimer", () => {
    expect(waterfall).toContain(TAX_ENGINE_ESTIMATE.assumptions);
    expect(waterfall).toContain(CANONICAL_TAX_DISCLAIMER);
  });

  it("the two-agent comparison states each agent's costs as the share of GCI they are", () => {
    const comparison = between(page, "Agent A — GCI", "GCI alone is misleading");
    expect(comparison).toContain(`After ${Math.round((1 - 68_000 / 180_000) * 100)}% net cost ratio`);
    expect(comparison).toContain(`After ${Math.round((1 - 72_000 / 120_000) * 100)}% net cost ratio`);
  });
});

describe("article: how real estate agents track GCI, the income waterfall", () => {
  const GCI = 200_000;
  const PRE_TAX = 130_200;
  const engine = calculate(PRE_TAX, "ontario", 0);
  const afterTax = PRE_TAX - engine.totalBurden;

  const page = textOf(TrackGciArticle);
  const waterfall = between(page, "Where $200,000 GCI actually goes", "Tracking GCI alone");
  const taxRows = waterfall.slice(waterfall.indexOf("Net before tax"));

  it("the typed rows arrive at the income the engine is given", () => {
    const takenOff = deductionsIn(waterfall.slice(0, waterfall.indexOf("Net before tax")));
    expect(takenOff).toEqual([40_000, 3_000, 4_800, 22_000]);
    expect(GCI - takenOff.reduce((sum, amount) => sum + amount, 0)).toBe(PRE_TAX);
    expect(taxRows).toContain(dollars(PRE_TAX));
  });

  it("the tax row is the engine's total for a named province and tax year", () => {
    expect(taxRows).toContain("Estimated federal + provincial tax + CPP");
    expect(taxRows).toContain(`Agent Runway tax engine, Ontario, ${engine.taxYear} tax year`);
    expect(taxRows).toContain(`−${dollars(engine.totalBurden)}`);
    expect(taxRows).toContain("Estimated take-home income");
    expect(taxRows).toContain(dollars(afterTax));
    expect(PRE_TAX - Math.round(engine.totalBurden)).toBe(Math.round(afterTax));
  });

  it("no other dollar figure is in the tax rows", () => {
    expect(dollarFiguresIn(taxRows)).toEqual(
      new Set([dollars(PRE_TAX), dollars(engine.totalBurden), dollars(afterTax)]),
    );
    expect(taxRows).not.toMatch(/Approx|varies by province|≈/);
  });

  it("states what the engine counts and carries the canonical disclaimer", () => {
    expect(taxRows).toContain(TAX_ENGINE_ESTIMATE.assumptions);
    expect(taxRows).toContain(CANONICAL_TAX_DISCLAIMER);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The blog post
// ─────────────────────────────────────────────────────────────────────────

describe("blog: how to set a realistic annual GCI goal, the tax step", () => {
  const post = source("content/blog/how-to-set-an-annual-gci-goal-real-estate-agent.mdx");
  const step = between(post, "**Step 3: Account for income tax and CPP**", "\n## ");

  it("says what the tax engine estimates, in the shared wording", () => {
    expect(step).toContain(TAX_ENGINE_ESTIMATE.netIncome);
    expect(step).toContain(TAX_ENGINE_ESTIMATE.what);
    expect(step).toContain(TAX_ENGINE_ESTIMATE.varies);
    expect(step).toContain("[Canadian Realtor Tax Estimator](/tools/realtor-tax-estimator)");
  });

  it("carries the canonical disclaimer", () => {
    expect(step).toContain(CANONICAL_TAX_DISCLAIMER);
  });

  it("gives no tax rate, no advice wording and no em dash", () => {
    expect(step).not.toMatch(/\d\s*%/);
    expect(step).not.toMatch(/tax rate\)/);
    expect(errorsIn(step)).toEqual([]);
    expect(step).not.toContain("—");
    expect(post).not.toMatch(/effective tax rate/i);
    expect(post).not.toMatch(/conservative approach/i);
  });

  it("the example starts from income before tax, and its sum is right", () => {
    expect(step).toContain("GCI goal = Net business income before tax + Business expenses");
    expect(step).toContain(`GCI = $130,000 + $30,000 = ${dollars(130_000 + 30_000)}`);
    // The next section's deal count example starts from the same goal.
    expect(post).toContain("you need $160,000 GCI");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The scan
// ─────────────────────────────────────────────────────────────────────────

const SCAN_ROOTS = ["apps/web/app", "apps/web/content"];
const SKIP_DIRS = new Set(["node_modules", "__tests__", ".next", "api"]);
const TEXT_FILE = /\.(?:tsx?|mdx?)$/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : filesUnder(full);
    return TEXT_FILE.test(entry.name) ? [full] : [];
  });
}

const APPROX = "(?:approximately|roughly|about|around|close to|nearly)";

/** A tax figure typed against an income. Run on a file with its line breaks closed up. */
const TYPED_TAX_FIGURE: ReadonlyArray<{ name: string; re: RegExp }> = [
  {
    // Not "The maximum CPP contribution in 2026 is approximately $X": that is
    // CRA's published ceiling for a named year, not tax on an income.
    name: "tax of approximately $X",
    re: new RegExp(`(?<!\\bmaximum\\s)\\b(?:tax|taxes|CPP|QPP)\\b[^.;:(]{0,100}?\\b${APPROX}\\s+\\$\\d`, "i"),
  },
  {
    name: "approximately $X in tax",
    re: new RegExp(
      `\\b${APPROX}\\s+\\$[\\d,]+(?:[–-]\\$?[\\d,]+)?\\s+(?:in|of)\\s+(?:combined\\s+|total\\s+|personal\\s+)?(?:federal|provincial|income|tax|CPP)\\b`,
      "i",
    ),
  },
  { name: "pays roughly $X", re: new RegExp(`\\b(?:pays?|owes?|owing)\\s+${APPROX}\\s+\\$\\d`, "i") },
  {
    name: "an effective tax rate with a figure",
    re: /\beffective\s+(?:tax\s+)?rate\b[^.;(]{0,50}?\d{2}(?:\.\d+)?\s*%|\d{2}(?:\.\d+)?\s*%\s+effective\s+(?:tax\s+)?rate\b/i,
  },
  {
    name: "a share of net income that goes to tax",
    re: /\d{2}\s*%\s+of\s+(?:your\s+)?net\s+(?:business\s+)?income\s+(?:goes|go|going)\s+to\s+tax/i,
  },
  {
    name: "a flat tax rate applied to a commission",
    re: /\b(?:income\s+)?tax\b[^.;]{0,40}?~\s*\d{2}\s*%|~\s*\d{2}\s*%\s+(?:blended|flat)\b/i,
  },
  {
    name: "a waterfall tax row with a typed amount",
    re: /label:\s*"[^"]*\btax\b[^"]*",\s*(?:value|amount):\s*"[−-]?\$\d/i,
  },
];

/**
 * Pages where a typed tax figure is known and is not fixed here. Each is its
 * own piece of work. An entry comes out of this list in the change that fixes
 * its page; the last test below fails if an entry no longer has a hit.
 */
const KNOWN_OPEN: Record<string, string> = {
  "apps/web/app/prec-vs-sole-proprietor-real-estate-agents-canada/page.tsx":
    "the $200,000 worked example types its personal and corporate tax; it takes the corporate tax engine to redo",
  "apps/web/app/real-estate-commission-calculator-canada/commission-calculator.tsx":
    "the calculator takes a flat ~30% off one deal for income tax instead of calling the engine",
};

describe("no public page or post types a tax figure against an income", () => {
  const files = SCAN_ROOTS.flatMap((root) => filesUnder(path.join(REPO, root)));
  const closedUp = files.map((file) => ({
    rel: path.relative(REPO, file),
    text: readFileSync(file, "utf8").replace(/\s+/g, " "),
  }));

  const hitsIn = (text: string) =>
    TYPED_TAX_FIGURE.flatMap(({ name, re }) => {
      const match = re.exec(text);
      return match ? [`${name}: "${text.slice(Math.max(0, match.index - 30), match.index + 90).trim()}"`] : [];
    });

  it("the scan reads the pages, the tools and the blog", () => {
    const rels = closedUp.map(({ rel }) => rel);
    expect(rels).toContain("apps/web/app/how-real-estate-agents-calculate-net-income/page.tsx");
    expect(rels).toContain("apps/web/app/metrics/net-income/page.tsx");
    expect(rels).toContain("apps/web/app/tools/realtor-tax-estimator/page.tsx");
    expect(rels).toContain("apps/web/content/blog/how-to-set-an-annual-gci-goal-real-estate-agent.mdx");
    expect(files.length).toBeGreaterThan(200);
  });

  it("no file outside the known-open list has a hit", () => {
    const hits = closedUp
      .filter(({ rel }) => !(rel in KNOWN_OPEN))
      .flatMap(({ rel, text }) => hitsIn(text).map((hit) => `${rel}  ${hit}`));
    expect(hits).toEqual([]);
  });

  it("the patterns catch the sentences that were removed", () => {
    const removed = [
      "income tax on this amount — after the basic personal amount and other standard deductions — runs approximately $28,000–$32,000 depending on filing specifics",
      "producing approximately $90,000 in combined federal and provincial income tax",
      "your effective tax rate on net income could be anywhere from 25% to 45%",
      "and have a 30% effective tax rate",
      "assume 35% of net income goes to taxes and CPP",
      '{ label: "Federal + provincial tax + CPP", value: "−$38,000", note: "Approx. — varies by province" }',
      "Income tax estimate uses a ~30% blended rate",
      "an Ontario agent at that income pays roughly $24,000",
    ];
    for (const sentence of removed) {
      expect(TYPED_TAX_FIGURE.some(({ re }) => re.test(sentence)), sentence).toBe(true);
    }
  });

  it("the patterns leave engine output, cited rates and ordinary sentences alone", () => {
    const fine = [
      "Estimated federal income tax: {fmtCurrency(EXAMPLE_TAX.federalTax)}",
      "{ label: \"Estimated federal + provincial tax + CPP\", value: `−${fmtCurrency(WATERFALL_TAX.total)}` }",
      "CPP1: ($71,300 − $3,500) × 11.90% = $8,068.20",
      "The maximum CPP contribution in 2026 is approximately $9,293 (combined Tier 1 + Tier 2)",
      "Projected tax breakdown: federal, provincial, CPP, and effective rate",
      "the estimator shows your effective rate, quarterly instalment amount, and per-deal tax portion",
      "Agent Runway's target for the expense ratio is 35% of GCI or less",
      "spend about $30,000 on business",
    ];
    for (const sentence of fine) {
      expect(TYPED_TAX_FIGURE.some(({ re }) => re.test(sentence)), sentence).toBe(false);
    }
  });

  it.each(Object.keys(KNOWN_OPEN))("known open, still to fix: %s", (rel) => {
    const file = closedUp.find((f) => f.rel === rel);
    expect(file, `${rel} exists`).toBeDefined();
    expect(hitsIn(file?.text ?? "").length, "still has a typed tax figure; drop it from KNOWN_OPEN once fixed").toBeGreaterThan(0);
  });
});
