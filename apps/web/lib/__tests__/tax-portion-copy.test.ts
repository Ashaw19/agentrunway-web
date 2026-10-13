/**
 * No page, blog post, email, in-app label or AI context line gives a
 * percentage of a commission to put away for tax, or tells the reader to put
 * money away for it (2026-10-13).
 *
 * What was wrong:
 *   - "How Real Estate Agents Calculate Net Income": "Setting aside 30–35% of
 *     every payment into a dedicated tax account — untouchable until
 *     instalment dates — eliminates year-end surprises entirely", and
 *     instalments for anyone who "expects to owe more than $3,000 in tax for a
 *     given year" (CRA's test also needs one of the two years before).
 *   - "Real Estate Agent Tax Planning in Canada": a section headed "The 30–35%
 *     tax-portion estimate", rising to "38–40%", with no source for either.
 *   - "How Much Should Real Estate Agents Save for Taxes": "The short answer:
 *     25% to 40%", three times, as a "composite estimate" nobody could check.
 *   - Blog, "Financial Runway": "typically 25–35% ... belongs to the CRA" and
 *     "Best practice: Move your estimated tax portion into a separate account".
 *   - Blog, "The Real Cost of a Real Estate Deal": "you should be setting
 *     aside: $10,000 × 35%" and "set up a separate savings account".
 *   - Tax estimator page: "typically owe 20% to 40% of net commission
 *     income", with Ontario and Alberta dollar figures typed in.
 *   - Forecast page, under "HST collected YTD": "Set this aside — it's the
 *     government's, not yours".
 *   - "Per-deal set-aside" as the name of the per-deal tax estimate on six
 *     marketing pages, two emails, the Scenarios page and in the figures the
 *     AI reads, after the dashboard had been renamed "Per-deal tax portion".
 *
 * CRA publishes no percentage of a commission. The copy now states CRA's
 * instalment rules in the shared wording (`@agent-runway/core/tax-copy`,
 * cra-rules.ts) and says what the tax engine estimates (engine-estimate.ts).
 * Where a page shows a figure, the engine works it out when the page is built.
 *
 * Three checks:
 *   1. A scan of every source file that can reach a reader, for the wording.
 *   2. Each reworded passage prints the shared rules, cites CRA and carries
 *      the disclaimer. Pages are read as source, the way pdf-tax-copy.test.ts
 *      reads the Reports page.
 *   3. The engine table is rendered and compared with the engine.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_TAX_DISCLAIMER,
  CRA_INSTALMENT_SOURCES,
  INSTALMENT_DUE_DATES_RULE,
  INSTALMENT_REQUIREMENT_RULE,
  INSTALMENT_WITHHOLDING_RULE,
  TAX_ENGINE_ESTIMATE,
  TAX_ESTIMATE_EXAMPLE_INCOMES,
  fmtTaxEstimateRate,
  validateTaxCopy,
} from "@agent-runway/core/tax-copy";
import { calculate } from "@agent-runway/core/engines/canadian-tax-engine";
import { PROVINCE_LABELS, type Province } from "@agent-runway/core/types/database";
import { TaxEngineEstimateTable } from "@/components/tax-engine-estimate-table";

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

const WORDING: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "set aside", re: /\bset(?:s|ting)?(?:-|\s+(?:\w+\s+){0,3})asides?\b/i },
  { name: "put aside / put away", re: /\bput(?:s|ting)?[\s-]+(?:aside|away)\b/i },
  { name: "belongs to the CRA", re: /\bbelong(?:s|ing|ed)?\s+to\s+(?:the\s+)?CRA\b/i },
  { name: "a tax account", re: /\b(?:tax|separate)\s+(?:savings\s+)?account\b/i },
  { name: "a percentage of every commission", re: /%\s+of\s+(?:every|each)\b/i },
  { name: "earmark", re: /\bearmark/i },
];

/**
 * Files where the wording is not copy: rules that stop the AI from saying it,
 * patterns that catch it in AI output, and a user's question as they ask it.
 */
const NOT_COPY: Record<string, string> = {
  "apps/web/lib/ai/security.ts": "patterns that catch the wording in AI output",
  "apps/web/lib/flight-crew/system-prompts.ts": "rules telling the AI not to use it",
  "apps/web/app/api/captain-intake/route.ts": "a rule telling the AI not to promise it",
  "apps/web/lib/troubleshooting-classifier.ts": "keywords that match a user's question",
  "apps/web/lib/troubleshooting-playbooks.ts": "a user's question quoted, and notes on wording that was removed",
};

describe("no source file that reaches a reader carries the wording", () => {
  const files = SCAN_ROOTS.flatMap((root) => filesUnder(path.join(REPO, root)));

  // Read once, here, and not inside each test: six passes over a thousand
  // files ran past the test timeout while sibling suites were running.
  const copyLines = files
    .filter((file) => !(path.relative(REPO, file) in NOT_COPY))
    .flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${path.relative(REPO, file)}:${i + 1}` })),
    );

  it("the scan reads the web app, the blog, the emails and the mobile app", () => {
    const rels = files.map((f) => path.relative(REPO, f));
    expect(rels).toContain("apps/web/app/how-real-estate-agents-calculate-net-income/page.tsx");
    expect(rels).toContain("apps/web/content/blog/financial-runway-what-it-means-for-real-estate-agents.mdx");
    expect(rels).toContain("apps/web/lib/emails/trial-welcome.ts");
    expect(rels).toContain("apps/web/public/llms.txt");
    expect(rels.some((r) => r.startsWith("apps/mobile/") && r.endsWith(".tsx"))).toBe(true);
    expect(files.length).toBeGreaterThan(500);
  });

  it("every file left out of the scan still exists", () => {
    const rels = new Set(files.map((f) => path.relative(REPO, f)));
    for (const rel of Object.keys(NOT_COPY)) expect(rels.has(rel), rel).toBe(true);
  });

  it.each(WORDING)("$name", ({ re }) => {
    const hits = copyLines
      .filter(({ line }) => re.test(line))
      .map(({ line, at }) => `${at}  ${line.trim().slice(0, 120)}`);
    expect(hits).toEqual([]);
  });

  it("the patterns catch the sentences that were removed", () => {
    const removed = [
      "Setting aside 30–35% of every payment into a dedicated tax account",
      "Agents who do not set money aside throughout the year",
      "typically 25–35% depending on your income level and province — belongs to the CRA",
      "set up a separate savings account and transfer your tax reserve percentage",
      "Quarterly instalment targets + per-deal set-aside",
      "the portion earmarked for CRA",
      "Set this aside — it's the government's, not yours",
    ];
    for (const sentence of removed) {
      expect(WORDING.some(({ re }) => re.test(sentence)), sentence).toBe(true);
    }
  });

  it("the patterns leave identifiers and ordinary sentences alone", () => {
    const fine = [
      "fmtCurrency(taxResult.perDealSetAside)",
      "per_deal_set_aside: Math.round(taxResult.perDealSetAside)",
      "Verify with your accountant or tax professional",
      "a tax accountant who works with agents",
      "20% of GCI on each deal goes to the brokerage",
    ];
    for (const sentence of fine) {
      expect(WORDING.some(({ re }) => re.test(sentence)), sentence).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The reworded passages
// ─────────────────────────────────────────────────────────────────────────

/** A typed percentage: "35%", "30–35%", "25% to 40%". */
const TYPED_PERCENT = /\d\s*%/;

describe("article: how real estate agents calculate net income", () => {
  const page = source("app/how-real-estate-agents-calculate-net-income/page.tsx");
  const mistakes = between(page, 'id="common-mistakes"', 'id="how-agent-runway-helps"');

  it("states CRA's instalment rules in the shared wording, each with its citation", () => {
    expect(mistakes).toContain("{INSTALMENT_WITHHOLDING_RULE}");
    expect(mistakes).toContain("{INSTALMENT_REQUIREMENT_RULE}");
    expect(mistakes).toContain("{INSTALMENT_DUE_DATES_RULE}");
    expect(mistakes).toContain("{INSTALMENT_INTEREST_RULE}");
    expect(mistakes.match(/<CRACite id=\{\d\} \/>/g)?.length).toBeGreaterThanOrEqual(4);
    expect(page).toContain("CRA_INSTALMENT_SOURCES.whoPays");
    expect(page).toContain("CRA_INSTALMENT_SOURCES.dueDates");
    expect(page).toContain("CRA_INSTALMENT_SOURCES.interest");
  });

  it("says what the tax engine estimates, and carries the disclaimer", () => {
    expect(mistakes).toContain("{TAX_ENGINE_ESTIMATE.what}");
    expect(mistakes).toContain("{TAX_ENGINE_ESTIMATE.varies}");
    expect(mistakes).toContain("{TAX_ENGINE_ESTIMATE.perDeal}");
    expect(mistakes).toContain("{CANONICAL_TAX_DISCLAIMER}");
  });

  it("retypes no instalment rule and gives no percentage or fraction of a commission", () => {
    expect(mistakes).not.toMatch(/\$3,000/);
    expect(mistakes).not.toMatch(TYPED_PERCENT);
    expect(mistakes).not.toMatch(/\ba (?:third|quarter|half)\b/i);
    expect(mistakes).not.toMatch(/discipline required/i);
  });
});

describe("article: real estate agent tax planning in Canada", () => {
  const page = source("app/real-estate-agent-tax-planning-canada/page.tsx");
  const section = between(page, "<h3>How much of a commission is tax</h3>", 'id="deductible-expenses"');

  it("the section heading no longer carries a percentage", () => {
    expect(page).not.toMatch(/tax-portion estimate<\/h3>/);
  });

  it("prints the engine's table and wording, with CRA cited for rates and CPP", () => {
    expect(section).toContain("<TaxEngineEstimateTable />");
    expect(section).toContain("{TAX_ENGINE_ESTIMATE.what}");
    expect(section).toContain("{TAX_ENGINE_ESTIMATE.varies}");
    expect(section).toContain("{TAX_ENGINE_ESTIMATE.perDeal}");
    expect(section).toContain("<CRACite id={7} />");
    expect(section).toContain("<CRACite id={1} />");
  });

  it("types no percentage and calls nothing a common framing", () => {
    expect(section).not.toMatch(TYPED_PERCENT);
    expect(section).not.toMatch(/common framing/i);
  });
});

describe("article: how much should real estate agents save for taxes", () => {
  const page = source("app/how-much-should-real-estate-agents-save-for-taxes-canada/page.tsx");

  it("the answer is the engine's estimate, in the FAQ schema and on the page", () => {
    expect(page).toContain("<TaxEngineEstimateTable />");
    expect(page).toContain("${taxEstimateSpreadSentence(100_000)}");
    expect(page).toContain("text: HOW_MUCH_ANSWER,");
    expect(page).toContain("{HOW_MUCH_ANSWER}");
  });

  it("instalments are stated in the shared wording, in the FAQ schema and on the page", () => {
    expect(page).toContain("text: HOW_OFTEN_ANSWER,");
    expect(page).toContain("${INSTALMENT_REQUIREMENT_RULE} ${INSTALMENT_DUE_DATES_RULE} ${INSTALMENT_INTEREST_RULE}");
    expect(page).not.toMatch(/net\s+tax owing exceeds \$3,000/);
  });

  it("the typed range and the framing are gone", () => {
    expect(page).not.toMatch(/25%/);
    expect(page).not.toMatch(/40%/);
    expect(page).not.toMatch(/typical estimate/i);
    expect(page).not.toMatch(/composite estimate/i);
    expect(page).not.toMatch(/One framing many agents use/i);
    expect(page).not.toMatch(/has to come off the\s+top/);
  });
});

describe.each([
  {
    name: "blog: financial runway",
    file: "content/blog/financial-runway-what-it-means-for-real-estate-agents.mdx",
    start: "## The Tax Portion of a Commission",
    end: "\n## ",
  },
  {
    name: "blog: the real cost of a real estate deal",
    file: "content/blog/the-real-cost-of-a-real-estate-deal.mdx",
    start: "## Step 5: Income Tax and CPP",
    end: "\n## ",
  },
])("$name", ({ file, start, end }) => {
  const post = source(file);
  const section = between(post, start, end);

  it("states CRA's instalment rules in the shared wording", () => {
    expect(section).toContain(INSTALMENT_WITHHOLDING_RULE);
    expect(section).toContain(INSTALMENT_REQUIREMENT_RULE);
    expect(section).toContain(INSTALMENT_DUE_DATES_RULE);
  });

  it("links the CRA pages the rules come from", () => {
    for (const { label, url } of [CRA_INSTALMENT_SOURCES.whoPays, CRA_INSTALMENT_SOURCES.dueDates]) {
      expect(section).toContain(`[${label}](${url})`);
    }
  });

  it("says what the tax engine estimates, in the shared wording", () => {
    expect(section).toContain(TAX_ENGINE_ESTIMATE.what);
    expect(section).toContain(TAX_ENGINE_ESTIMATE.varies);
    expect(section).toContain(TAX_ENGINE_ESTIMATE.perDeal);
  });

  it("carries the canonical disclaimer", () => {
    expect(section).toContain(CANONICAL_TAX_DISCLAIMER);
  });

  it("has no percentage, no advice wording and no em dash", () => {
    expect(section).not.toMatch(TYPED_PERCENT);
    expect(errorsIn(section)).toEqual([]);
    expect(section).not.toContain("—");
    expect(section).not.toMatch(/best practice/i);
  });

  it("the old section heading is gone", () => {
    expect(post).not.toMatch(/^## .*Tax Reserve/m);
  });
});

describe("blog: the real cost of a real estate deal, the worked example", () => {
  const post = source("content/blog/the-real-cost-of-a-real-estate-deal.mdx");
  const table = between(post, "| Line Item | Amount |", "\n\n");

  it("stops before income tax instead of taking a typed percentage off", () => {
    expect(table).not.toMatch(/Tax reserve/i);
    expect(table).not.toMatch(/35%/);
    expect(table).toContain("| **Left before income tax and CPP** | **$8,875** |");
  });

  it("the figure left is the rows above it, and the share printed is that figure over the commission", () => {
    const amounts = [...table.matchAll(/\| -?\$([\d,]+) \|/g)].map((m) => Number(m[1].replace(/,/g, "")));
    const [gross, ...costs] = amounts;
    expect(gross).toBe(12_500);
    expect(gross - costs.reduce((sum, c) => sum + c, 0)).toBe(8_875);
    expect(post).toContain(`That's ${Math.round((8_875 / gross) * 100)}% of your gross commission`);
  });
});

describe("tax estimator page: how much tax an agent pays", () => {
  const page = source("app/tools/realtor-tax-estimator/page.tsx");

  it("the FAQ answer and the short answer are the engine's estimate, not a typed range", () => {
    expect(page.match(/\$\{taxEstimateSpreadSentence\(100_000\)\}|\{taxEstimateSpreadSentence\(100_000\)\}/g)).toHaveLength(2);
    expect(page).not.toMatch(/20% to 40%/);
    expect(page).not.toMatch(/roughly \$2\d,000/);
    expect(page).not.toMatch(/typically (?:owe|range)/i);
  });
});

describe("Forecast page: GST/HST collected year to date", () => {
  const page = source("app/(app)/forecast/forecast-content.tsx");

  it("states the trust rule in the shared wording under the amount", () => {
    expect(page).toContain("Estimate, before input tax credits. {GST_HST_TRUST_RULE}");
    expect(page).not.toMatch(/government&apos;s, not yours/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The engine table
// ─────────────────────────────────────────────────────────────────────────

describe("the tax engine table printed on the tax articles", () => {
  const html = renderToStaticMarkup(createElement(TaxEngineEstimateTable));
  const provinces = Object.keys(PROVINCE_LABELS).filter((key): key is Province => key in PROVINCE_LABELS);

  it.each(TAX_ESTIMATE_EXAMPLE_INCOMES)("at $%i: the lowest and highest of all 13 provinces, as the engine works them out", (netIncome) => {
    const results = provinces
      .map((province) => ({ province, result: calculate(netIncome, province, 0) }))
      .sort((a, b) => a.result.totalBurden - b.result.totalBurden);
    const low = results[0];
    const high = results[results.length - 1];

    expect(html).toContain(`$${netIncome.toLocaleString("en-CA")}`);
    expect(html).toContain(`${fmtTaxEstimateRate(low.result.totalBurden / netIncome)} (${PROVINCE_LABELS[low.province]})`);
    expect(html).toContain(`${fmtTaxEstimateRate(high.result.totalBurden / netIncome)} (${PROVINCE_LABELS[high.province]})`);
  });

  it("names the engine's tax year, what the figure is a share of, and what the engine leaves out", () => {
    const { taxYear } = calculate(100_000, "ontario", 0);
    expect(html).toContain(`Agent Runway tax engine, ${taxYear} tax year`);
    expect(html).toContain("as a share of net business income");
    expect(html).toContain("no other deductions or credits");
  });

  it("carries the canonical disclaimer", () => {
    expect(html).toContain(CANONICAL_TAX_DISCLAIMER);
  });
});
