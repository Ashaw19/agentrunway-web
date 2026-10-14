/**
 * A tax-year label that describes the tax engine is printed from the engine,
 * and the tax estimator states CRA's rules in the shared wording (2026-10-13).
 *
 * What was wrong:
 *   - The public tax estimator ran the engine's 2026 tables (first federal
 *     bracket 14%, CPP ceiling $74,600) while its title, meta description,
 *     social titles, article schema, hero, trust row and "Is this calculator
 *     accurate?" answer said 2025. Another answer on the same page quoted the
 *     2026 CPP ceiling, and since #327 the page printed "For the 2026 tax
 *     year" from the engine. The page contradicted itself.
 *   - The same typed 2025 was on the calculator (three places), the tools
 *     index (six), the guide that links to the estimator ("Updated for 2025",
 *     "2025 brackets", federal brackets "from 15%", and the 2025 CPP ceilings
 *     quoted as CRA's under a table of 2026 estimates), a related-resources
 *     card, two articles ("the tax engine implements the 2025 ..."), the
 *     getting-started PDF, the in-app guide's section key, and a line the AI
 *     reads about the Overhead page ("14.5% is the 2025 blended rate").
 *   - The estimator gave CRA's instalment test as "more than $3,000 in tax
 *     for two consecutive years" (CRA: that year and either of the two before
 *     it), said instalment interest "cannot be deducted" (CRA's interest page
 *     does not say so), gave half of the small supplier rule with "Most
 *     active agents reach this threshold within their first couple of deals",
 *     and named an income tax folio on education credits as its source for
 *     instalments.
 *
 * How the year is checked. The engine's year is replaced with one nobody
 * would type (2031) and each page is rendered. Every year the page then
 * prints has to be 2031. A label typed as "2026" reads correctly today and
 * fails here, so it cannot be left behind when the engine moves on.
 *
 * The CRA wording lives in `@agent-runway/core/tax-copy` and is tested there
 * string by string. This file proves the pages print it.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The stand-in for the engine's tax year. No page has a reason to type it. */
const { ENGINE_YEAR } = vi.hoisted(() => ({ ENGINE_YEAR: 2031 }));

vi.mock("@agent-runway/core/engines/canadian-tax-engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("@agent-runway/core/engines/canadian-tax-engine")>();
  return {
    ...engine,
    TAX_YEAR: ENGINE_YEAR,
    calculate: (...args: Parameters<typeof engine.calculate>) => ({
      ...engine.calculate(...args),
      taxYear: ENGINE_YEAR,
    }),
  };
});

// The nav reads the app router, which a test does not mount. Neither it nor
// the footer prints a tax year.
vi.mock("@/components/marketing-nav", () => ({ MarketingNav: () => null }));
vi.mock("@/components/marketing-footer", () => ({ MarketingFooter: () => null }));

import {
  calculate,
  FEDERAL_BRACKETS,
  TAX_YEAR,
} from "@agent-runway/core/engines/canadian-tax-engine";
import {
  CANONICAL_TAX_DISCLAIMER,
  CRA_INSTALMENT_SOURCES,
  INSTALMENT_DUE_DATES_RULE,
  INSTALMENT_INTEREST_RULE,
  INSTALMENT_REQUIREMENT_RULE,
  INSTALMENT_WITHHOLDING_RULE,
  SELF_EMPLOYED_CPP,
  SMALL_SUPPLIER_RULE,
  SMALL_SUPPLIER_RULE_SHORT,
  TAX_ENGINE_ESTIMATE,
  TAX_ENGINE_TABLES,
  TAX_ENGINE_TABLES_SUMMARY,
  fmtBracketRate,
  validateTaxCopy,
} from "@agent-runway/core/tax-copy";
import EstimatorPage, { metadata as estimatorMetadata } from "@/app/tools/realtor-tax-estimator/page";
import ToolsPage, { metadata as toolsMetadata } from "@/app/tools/page";
import HowMuchPage, { metadata as howMuchMetadata } from "@/app/how-much-should-real-estate-agents-save-for-taxes-canada/page";
import DeadlinesPage from "@/app/real-estate-tax-deadlines-canada/page";
import MaritimeRatesPage from "@/app/real-estate-agent-tax-rates-nb-ns-pei/page";
import SelfEmployedCppPage from "@/app/self-employed-cpp-real-estate-agents-canada/page";
import { KNOWLEDGE_BASE, TAX_REFERENCE_HEADING } from "@/lib/knowledge-base";
import { getPlaybook } from "@/lib/troubleshooting-playbooks";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/
const REPO = path.resolve(WEB, "../..");
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error");

// ─────────────────────────────────────────────────────────────────────────
// Reading a rendered page
// ─────────────────────────────────────────────────────────────────────────

const JSON_LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

/** What a reader sees: scripts and tags dropped, entities decoded, one space between words. */
function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** Every string inside a value, however deep. */
function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}

/** Every four-digit year in a text. A full date ("2026-04-15") is not a label and is left out. */
function yearsIn(text: string): number[] {
  return [...text.matchAll(/(?<![\d$,.\-/])\b(20\d\d)\b(?!-\d\d|[,.]\d)/g)].map((m) => Number(m[1]));
}

interface Rendered {
  text: string;
  jsonLd: unknown[];
}

function render(Page: ComponentType): Rendered {
  const html = renderToStaticMarkup(createElement(Page));
  return {
    text: textOf(html),
    jsonLd: [...html.matchAll(JSON_LD)].map((m) => JSON.parse(m[1])),
  };
}

/** The answers of the page's FAQPage schema, by question. */
function faqAnswers(jsonLd: unknown[]): Map<string, string> {
  const answers = new Map<string, string>();
  for (const block of jsonLd) {
    if (!block || typeof block !== "object") continue;
    const { "@type": type, mainEntity } = block as { "@type"?: string; mainEntity?: unknown };
    if (type !== "FAQPage" || !Array.isArray(mainEntity)) continue;
    for (const entry of mainEntity as { name: string; acceptedAnswer: { text: string } }[]) {
      answers.set(entry.name, entry.acceptedAnswer.text);
    }
  }
  return answers;
}

/** The answer to the one question that matches. */
function answerTo(answers: Map<string, string>, question: RegExp): string {
  const found = [...answers].filter(([name]) => question.test(name));
  expect(found.map(([name]) => name), `one question matching ${question}`).toHaveLength(1);
  return found[0][1];
}

// Rendered once, here: a render inside each test ran past the test timeout
// while sibling suites were running.
const estimator = render(EstimatorPage);
const tools = render(ToolsPage);
const howMuch = render(HowMuchPage);
const deadlines = render(DeadlinesPage);
const maritimeRates = render(MaritimeRatesPage);
const selfEmployedCpp = render(SelfEmployedCppPage);

// ─────────────────────────────────────────────────────────────────────────
// 1. The stand-in year
// ─────────────────────────────────────────────────────────────────────────

describe("the stand-in year reaches everything that reads the engine", () => {
  it("the engine's constant, its results and the shared wording", () => {
    expect(TAX_YEAR).toBe(ENGINE_YEAR);
    expect(calculate(100_000, "ontario", 10).taxYear).toBe(ENGINE_YEAR);
    expect(TAX_ENGINE_TABLES.taxYear).toBe(ENGINE_YEAR);
    expect(SELF_EMPLOYED_CPP.rates).toContain(`For the ${ENGINE_YEAR} tax year`);
    expect(TAX_ENGINE_TABLES_SUMMARY).toContain(`for the ${ENGINE_YEAR} tax year`);
  });

  it("no real tax year is a stand-in for itself", () => {
    expect(ENGINE_YEAR).toBeGreaterThan(new Date().getFullYear() + 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Pages that are about the estimator: every year they print is the engine's
// ─────────────────────────────────────────────────────────────────────────

/**
 * A year a page prints that is not the engine's, and why it stays.
 *
 *   estimator  The cheat sheet is a PDF of CRA's 2025 figures and says so on
 *              its own page, in its email and in its file name.
 *   tools      The card links to the tax deadlines page, a calendar of one
 *              year's dates.
 */
const NOT_THE_ENGINE = {
  estimator: ["The Canadian Realtor Tax Cheat Sheet puts every 2025 bracket"],
  tools: ["2026 tax deadlines"],
  howMuch: [] as string[],
};

describe.each([
  {
    name: "the tax estimator",
    page: estimator,
    metadata: estimatorMetadata,
    otherYears: NOT_THE_ENGINE.estimator,
    labels: [
      `Estimate your ${ENGINE_YEAR} federal tax, provincial tax, CPP/QPP contributions`,
      `${ENGINE_YEAR} tax year · all 13 provinces and territories`,
      `for an estimate for the ${ENGINE_YEAR} tax year`,
      `This calculator estimates the ${ENGINE_YEAR} tax year`,
      `Federal brackets (${ENGINE_YEAR})`,
      `For the ${ENGINE_YEAR} tax year, on $100,000 of net business income`,
    ],
  },
  {
    name: "the tools index",
    page: tools,
    metadata: toolsMetadata,
    otherYears: NOT_THE_ENGINE.tools,
    labels: [
      `Estimate your ${ENGINE_YEAR} federal tax, provincial tax, CPP/QPP`,
      `${ENGINE_YEAR} tax year`,
      `The tax estimator covers the ${ENGINE_YEAR} tax year`,
    ],
  },
  {
    name: "the guide that links to the estimator",
    page: howMuch,
    metadata: howMuchMetadata,
    otherYears: NOT_THE_ENGINE.howMuch,
    labels: [
      `Free tool · ${ENGINE_YEAR} tax year`,
      `All 13 provinces and territories, for the ${ENGINE_YEAR} tax year.`,
      `Agent Runway tax engine, ${ENGINE_YEAR} tax year`,
      SELF_EMPLOYED_CPP.rates,
    ],
  },
])("$name", ({ page, metadata, otherYears, labels }) => {
  const readerText = otherYears.reduce((text, sentence) => text.replace(sentence, ""), page.text);

  it("prints the engine's year where it labels the estimate", () => {
    for (const label of labels) expect(page.text).toContain(label);
  });

  it("prints no other year to a reader", () => {
    expect(yearsIn(readerText).filter((year) => year !== ENGINE_YEAR)).toEqual([]);
  });

  it("every year left out of that check is still on the page", () => {
    for (const sentence of otherYears) expect(page.text).toContain(sentence);
  });

  it("the title, descriptions and social cards carry no other year", () => {
    expect(yearsIn(stringsIn(metadata).join(" | ")).filter((year) => year !== ENGINE_YEAR)).toEqual([]);
  });

  it("the structured data carries no other year", () => {
    expect(yearsIn(stringsIn(page.jsonLd).join(" | ")).filter((year) => year !== ENGINE_YEAR)).toEqual([]);
  });
});

describe("the tax estimator: the year is in the search and social copy, from the engine", () => {
  it("title, description, Open Graph and Twitter", () => {
    expect(estimatorMetadata.title).toBe(`Canadian Realtor Tax Estimator — ${ENGINE_YEAR} Self-Employed Calculator`);
    expect(estimatorMetadata.description).toContain(`Calculate your ${ENGINE_YEAR} federal + provincial income tax`);
    expect(estimatorMetadata.openGraph?.title).toBe(estimatorMetadata.title);
    expect(estimatorMetadata.openGraph?.description).toContain(`for the ${ENGINE_YEAR} tax year`);
    expect(estimatorMetadata.twitter?.title).toBe(`Canadian Realtor Tax Estimator — ${ENGINE_YEAR}`);
  });

  it("the address has not changed", () => {
    expect(estimatorMetadata.alternates?.canonical).toBe("https://agentrunway.ca/tools/realtor-tax-estimator");
    expect(estimatorMetadata.openGraph?.url).toBe("https://agentrunway.ca/tools/realtor-tax-estimator");
  });

  it("the article schema", () => {
    const article = estimator.jsonLd.find((block) => (block as { "@type"?: string })["@type"] === "Article") as {
      headline: string;
      description: string;
    };
    expect(article.headline).toBe(`Canadian Realtor Tax Estimator — ${ENGINE_YEAR}`);
    expect(article.description).toContain(`Interactive ${ENGINE_YEAR} tax calculator`);
  });
});

describe("the tools index: the year is in the search copy and on the estimator's card", () => {
  it("description, Open Graph, the card and its badge", () => {
    expect(toolsMetadata.description).toContain(`Built for the ${ENGINE_YEAR} tax year`);
    expect(toolsMetadata.openGraph?.description).toContain(`${ENGINE_YEAR} tax estimator`);
    expect(tools.text).toContain(`${ENGINE_YEAR} tax year`);
  });

  it("the accuracy answer says which tables the engine holds, and promises no margin", () => {
    const answer = answerTo(faqAnswers(tools.jsonLd), /accurate/i);
    expect(answer).toContain(TAX_ENGINE_TABLES_SUMMARY);
    expect(answer).toContain(TAX_ENGINE_ESTIMATE.assumptions);
    expect(answer).toContain(CANONICAL_TAX_DISCLAIMER);
    expect(answer).not.toMatch(/within a few hundred dollars/i);
    expect(answer).not.toMatch(/CRA-licensed/i);
    expect(errorsIn(answer)).toEqual([]);
    expect(tools.text).toContain(answer);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The tax estimator: CRA's rules in the shared wording
// ─────────────────────────────────────────────────────────────────────────

describe("the tax estimator: FAQ answers, in the schema and on the page", () => {
  const answers = faqAnswers(estimator.jsonLd);

  it("every answer in the schema is printed on the page", () => {
    expect(answers.size).toBeGreaterThanOrEqual(8);
    for (const answer of answers.values()) expect(estimator.text).toContain(answer);
  });

  it("instalments: who pays, when, and the interest, as CRA states them", () => {
    const answer = answerTo(answers, /quarterly taxes/i);
    expect(answer).toBe(
      `${INSTALMENT_WITHHOLDING_RULE} ${INSTALMENT_REQUIREMENT_RULE} ${INSTALMENT_DUE_DATES_RULE} ${INSTALMENT_INTEREST_RULE}`,
    );
  });

  it("GST/HST registration: the whole small supplier rule, and the disclaimer", () => {
    const answer = answerTo(answers, /HST or GST registration/i);
    expect(answer).toContain(SMALL_SUPPLIER_RULE);
    expect(answer).toContain(CANONICAL_TAX_DISCLAIMER);
    expect(answer).not.toMatch(/most active agents/i);
    expect(answer).not.toMatch(/first couple of deals/i);
  });

  it("CPP: the engine's rates and ceilings for its year", () => {
    const answer = answerTo(answers, /What CPP do I pay/i);
    expect(answer).toBe(`${SELF_EMPLOYED_CPP.rates} ${SELF_EMPLOYED_CPP.quebec} ${SELF_EMPLOYED_CPP.deduction}`);
  });

  it("accuracy: which tables the engine holds, what it leaves out, and the disclaimer", () => {
    const answer = answerTo(answers, /Is this calculator accurate/i);
    expect(answer).toContain(TAX_ENGINE_TABLES_SUMMARY);
    expect(answer).toContain(TAX_ENGINE_ESTIMATE.assumptions);
    expect(answer).toContain(CANONICAL_TAX_DISCLAIMER);
    expect(answer).not.toMatch(/blended federal rate/i);
    expect(answer).not.toMatch(/15% to 14%/);
  });

  it.each([/quarterly taxes/i, /HST or GST registration/i, /What CPP do I pay/i, /Is this calculator accurate/i])(
    "%s: no advice wording and no em dash",
    (question) => {
      const answer = answerTo(answers, question);
      expect(errorsIn(answer)).toEqual([]);
      expect(answer).not.toContain("—");
    },
  );
});

describe("the tax estimator: the article sections and the calculator", () => {
  it("the instalment short answer and the calculator's note print the three rules", () => {
    const rules = `${INSTALMENT_REQUIREMENT_RULE} ${INSTALMENT_DUE_DATES_RULE} ${INSTALMENT_INTEREST_RULE}`;
    expect(estimator.text).toContain(`Short answer: ${INSTALMENT_DUE_DATES_RULE} ${INSTALMENT_REQUIREMENT_RULE} ${INSTALMENT_INTEREST_RULE}`);
    expect(estimator.text).toContain(rules);
  });

  it("the calculator's instalment working states the test once, cites CRA's own pages and uses CRA's limits", () => {
    const working = estimator.text.slice(estimator.text.indexOf("4. Quarterly Instalment Base"));
    expect(working).toContain(INSTALMENT_REQUIREMENT_RULE);
    expect(working).toContain("Due dates: March 15, June 15, September 15, December 15");
    expect(working).toContain(CRA_INSTALMENT_SOURCES.whoPays.label);
    expect(working).toContain(CRA_INSTALMENT_SOURCES.dueDates.label);
    expect(working).toContain("CRA's test also looks at the two years before");
    expect(estimator.text).not.toMatch(/S1-F2-C1/);
    expect(estimator.text).not.toMatch(/Guide P110/);
  });

  it("the registration hint under the calculator's checkbox is the short small supplier rule", () => {
    expect(estimator.text).toContain(SMALL_SUPPLIER_RULE_SHORT);
    expect(estimator.text).not.toMatch(/in any four consecutive calendar quarters/);
  });

  it("the CPP section prints the engine's rates, its maximum and how it deducts them", () => {
    expect(estimator.text).toContain(
      `Short answer: ${SELF_EMPLOYED_CPP.rates} ${SELF_EMPLOYED_CPP.quebec} ${SELF_EMPLOYED_CPP.deduction}`,
    );
    expect(estimator.text).toContain(SELF_EMPLOYED_CPP.maximum);
    expect(estimator.text).not.toMatch(/approximately \$9,293/);
  });

  it("the calculator's CPP working prints the engine's ceilings and rates", () => {
    const { cpp } = TAX_ENGINE_TABLES;
    expect(estimator.text).toContain(`Tier 1 (on earnings ${cpp.basicExemption} – ${cpp.firstCeiling} at ${cpp.rate} self-employed rate)`);
    expect(estimator.text).toContain(`Tier 2 (on earnings ${cpp.firstCeiling} – ${cpp.secondCeiling} at ${cpp.cpp2Rate} self-employed rate)`);
  });

  it("the calculator carries the canonical disclaimer", () => {
    const calculator = estimator.text.slice(estimator.text.indexOf("Estimate only"));
    expect(calculator).toContain(CANONICAL_TAX_DISCLAIMER);
  });

  it("the old statements are gone from the page", () => {
    expect(estimator.text).not.toMatch(/two consecutive years/i);
    expect(estimator.text).not.toMatch(/cannot be deducted/i);
    expect(estimator.text).not.toMatch(/triggers compounding interest/i);
  });

  it("the only reminders on the page are the notices CRA sends, in CRA's words", () => {
    expect(estimator.text).toContain("the instalment reminders it sends");
    expect(estimator.text.replace(/instalment reminders/g, "")).not.toMatch(/\bremind/i);
  });

  // Read here, not inside the test: under sibling load a file read ran past the test timeout.
  const ESTIMATOR_SOURCES = ["app/tools/realtor-tax-estimator/page.tsx", "app/tools/realtor-tax-estimator/tax-estimator.tsx"].map(
    (rel) => ({ rel, text: source(rel) }),
  );

  it.each(ESTIMATOR_SOURCES)(
    "$rel retypes no CRA limit, no instalment date and no CPP figure",
    ({ text }) => {
      expect(text).not.toMatch(/\$3,000|\b3_000\b/);
      expect(text).not.toMatch(/\$1,800|\b1_800\b/);
      expect(text).not.toMatch(/\$30,000/);
      expect(text).not.toMatch(/March 15|June 15|September 15|December 15/);
      expect(text).not.toMatch(/\$74,600|\$85,000|\$3,500|11\.90%|12\.80%|8\.00%/);
      expect(text).not.toMatch(/\b20\d\d (?:federal|CPP)/);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The guide that links to the estimator: federal and CPP figures
// ─────────────────────────────────────────────────────────────────────────

describe("how much should real estate agents save for taxes: federal and CPP figures are the engine's", () => {
  const page = source("app/how-much-should-real-estate-agents-save-for-taxes-canada/page.tsx");
  const { federal } = TAX_ENGINE_TABLES;

  it("the federal bracket range is the engine's, for its year", () => {
    expect(howMuch.text).toContain(`Progressive brackets from ${federal.lowestRate} to ${federal.highestRate} for ${ENGINE_YEAR}`);
    expect(page).not.toMatch(/from 15% to 33%/);
  });

  it("the CPP answer is the engine's, in the FAQ schema and on the page", () => {
    const answer = answerTo(faqAnswers(howMuch.jsonLd), /pay CPP/i);
    expect(answer).toBe(`Yes. ${SELF_EMPLOYED_CPP.rates}`);
    expect(howMuch.text).toContain(answer);
    expect(howMuch.text.split(SELF_EMPLOYED_CPP.rates).length - 1).toBe(2);
  });

  it("no CPP ceiling, federal rate or provincial rate is typed in", () => {
    expect(page).not.toMatch(/\$71,300|\$81,200|\$74,600|\$85,000/);
    expect(page).not.toMatch(/YMPE|YAMPE/);
    expect(page).not.toMatch(/~4% \(Nunavut\)|~21% \(Nova Scotia\)/);
  });

  it("CRA's CPP2 page is listed with the sources", () => {
    expect(page).toContain("second-additional-cpp-contribution-rates-maximums.html");
    expect(howMuch.text).toContain("Second additional CPP contribution (CPP2) rates and maximums");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Other pages that say what the engine or the estimator is on
// ─────────────────────────────────────────────────────────────────────────

describe("pages that name the estimator or the engine beside a year", () => {
  /** The text from a heading to about a screen later. The last match: the first is the table of contents. */
  const after = (text: string, heading: string) => {
    const from = text.lastIndexOf(heading);
    expect(from, `"${heading}" is on the page`).toBeGreaterThanOrEqual(0);
    return text.slice(from, from + 1_800);
  };

  it("tax deadlines: the related-resources card", () => {
    expect(deadlines.text).toContain(`Free ${ENGINE_YEAR} Tax Estimator`);
  });

  it("Maritime tax rates: the engine's year, and no claim that it runs the brackets printed above", () => {
    const section = after(maritimeRates.text, "Where the Agent Runway estimator and Flight Crew fit in");
    expect(section).toContain(`The estimator runs the engine for the ${ENGINE_YEAR} tax year`);
    expect(section).toContain("can differ from the brackets published above");
    expect(section).not.toMatch(/implements the \d{4}/);
    expect(section).not.toMatch(/applies the \d{4} brackets/);
    expect(section).not.toMatch(/same \d{4} published bracket schedules/);
  });

  it("self-employed CPP: the engine's year and ceilings", () => {
    const { cpp } = TAX_ENGINE_TABLES;
    expect(selfEmployedCpp.text).toContain(
      `CPP1 and CPP2 schedule for the ${ENGINE_YEAR} tax year (ceilings of ${cpp.firstCeiling} and ${cpp.secondCeiling})`,
    );
    expect(selfEmployedCpp.text).not.toMatch(/implements the \d{4}/);
  });

  const pdf = source("components/pdf/guide-pdf.tsx");

  it("the getting-started PDF", () => {
    expect(pdf).toContain("Tax estimation engine for the {TAX_YEAR} tax year, federal + provincial");
    expect(pdf).toContain("Agent Runway estimates your tax for the {TAX_YEAR} tax year");
    expect(pdf).toContain("{CANONICAL_TAX_DISCLAIMER}");
    expect(pdf).toContain("graduated brackets from {federal.lowestRate} to {federal.highestRate}");
    expect(pdf).not.toMatch(/\b20\d\d CRA (?:federal|rates for your province)/);
    expect(pdf).not.toMatch(/\$74,600|\$85,000|11\.90%/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. What the app's guide and the AI read
// ─────────────────────────────────────────────────────────────────────────

describe("the knowledge base tax reference", () => {
  const reference = KNOWLEDGE_BASE.slice(KNOWLEDGE_BASE.indexOf(`### ${TAX_REFERENCE_HEADING}`));
  const section = reference.slice(0, reference.indexOf("\n---"));
  const { cpp, federal } = TAX_ENGINE_TABLES;

  const knowledgeBaseSource = source("lib/knowledge-base.ts");
  const guide = source("app/(app)/guide/guide-content.tsx");

  it("its heading carries the engine's year", () => {
    expect(TAX_REFERENCE_HEADING).toBe(`TAX REFERENCE — ${ENGINE_YEAR} CRA`);
    expect(KNOWLEDGE_BASE).toContain(`\n### ${TAX_REFERENCE_HEADING}\n`);
    expect(knowledgeBaseSource).not.toMatch(/TAX REFERENCE — 20\d\d/);
  });

  it("its federal brackets are the engine's", () => {
    const ceilings = FEDERAL_BRACKETS.slice(0, -1);
    for (const [ceiling, rate] of ceilings) {
      expect(section).toContain(`${ceiling.toLocaleString("en-CA")}@${fmtBracketRate(rate)}`);
    }
    const top = ceilings[ceilings.length - 1][0];
    expect(section).toContain(`$${top.toLocaleString("en-CA")}+@${federal.highestRate}`);
    expect(section).toContain(`BPA ${federal.basicPersonalAmount}`);
  });

  it("its CPP figures are the engine's", () => {
    expect(section).toContain(`CPP1: ${cpp.rate} on ${cpp.basicExemption}-${cpp.firstCeiling}. Max ${cpp.maximum}.`);
    expect(section).toContain(`CPP2: ${cpp.cpp2Rate} on ${cpp.firstCeiling}-${cpp.secondCeiling}.`);
  });

  it("the in-app guide finds the section by the same heading", () => {
    expect(guide).toContain("[TAX_REFERENCE_HEADING]: {");
    expect(guide).toContain('"tax-estimate":          sectionId(TAX_REFERENCE_HEADING),');
    expect(guide).not.toMatch(/TAX REFERENCE — 20\d\d/);
    expect(guide).not.toMatch(/tax-reference-20\d\d/);
  });
});

describe("what the AI reads about the tax estimate", () => {
  const { cpp, federal } = TAX_ENGINE_TABLES;
  const systemPrompts = source("lib/flight-crew/system-prompts.ts");

  it("tax playbook: the year on the federal step and the CPP ceilings is the engine's", () => {
    const playbook = getPlaybook("tax");
    expect(playbook).toContain(`**Step 3: Federal Tax** (${ENGINE_YEAR})`);
    expect(playbook).toContain(`${cpp.firstCeiling} (YMPE ${ENGINE_YEAR})`);
    expect(playbook).toContain(`${cpp.secondCeiling} (YAMPE ${ENGINE_YEAR})`);
  });

  it("tax playbook: the figures under those labels are the engine's", () => {
    const playbook = getPlaybook("tax");
    for (const [ceiling, rate] of FEDERAL_BRACKETS.slice(0, -1)) {
      expect(playbook).toContain(`$${ceiling.toLocaleString("en-CA")} @ ${fmtBracketRate(rate)}`);
    }
    expect(playbook).toContain(`CPP1: ${cpp.rate} on income between ${cpp.basicExemption} (basic exemption) and ${cpp.firstCeiling}`);
    expect(playbook).toContain(`= ${cpp.maximum}`);
    expect(playbook).toContain(`= ${cpp.cpp2Maximum}`);
    expect(playbook).toContain(`Basic Personal Amount (BPA): ${federal.basicPersonalAmount}`);
  });

  it("overhead playbook: the federal rates are the engine's, with no blended rate from an earlier year", () => {
    const playbook = getPlaybook("overhead");
    expect(playbook).toContain(`Federal tax (multi-bracket: ${federal.rates.join(" / ")}, the ${ENGINE_YEAR} tax year)`);
    expect(playbook).not.toMatch(/14\.5%/);
    expect(playbook).not.toMatch(/blended rate/i);
  });

  it("Navigator's sample answer names the engine's year", () => {
    expect(systemPrompts).toContain("Per CRA's ${TAX_YEAR} federal brackets (applied in canadian-tax-engine)");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. The scan: no typed year beside the estimator or the engine, anywhere
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
 * A typed year. A full date ("2026-10-13", "April 1, 2025") is when something
 * happened, not a label.
 */
const TYPED_YEAR = String.raw`(?<!\b[A-Z][a-z]{2,8}\.? \d{1,2}, )\b20\d\d\b(?!-\d\d)`;

const YEAR_BESIDE_THE_ENGINE: ReadonlyArray<{ name: string; re: RegExp }> = [
  {
    name: "the engine or the estimator, then a typed year",
    re: new RegExp(String.raw`\b(?:tax (?:estimation )?engine|tax estimator|tax calculator|this calculator|the estimator)\b[^.!?]{0,80}?${TYPED_YEAR}`, "i"),
  },
  {
    name: "a typed year, then the estimator",
    re: new RegExp(String.raw`${TYPED_YEAR}[^.!?]{0,40}?\b(?:tax estimator|tax calculator)\b`, "i"),
  },
  {
    name: "estimate or calculate your <typed year> tax",
    re: new RegExp(String.raw`\b(?:estimates?|calculate) your (?:tax [^.!?]{0,40}?)?${TYPED_YEAR}`, "i"),
  },
];

/**
 * Files where a year beside those words is not a label on the engine.
 */
const NOT_A_LABEL: Record<string, string> = {};

describe("no source file that reaches a reader types a year beside the estimator or the engine", () => {
  const files = SCAN_ROOTS.flatMap((root) => filesUnder(path.join(REPO, root)));

  // Read and searched once, here, and not inside each test: three passes over
  // a thousand files ran past the test timeout while sibling suites were
  // running. Line breaks are folded, so a label wrapped across two lines of
  // JSX is still one sentence. A file with no year in it cannot match.
  const sources = files
    .filter((file) => !(path.relative(REPO, file) in NOT_A_LABEL))
    .map((file) => ({ rel: path.relative(REPO, file), text: readFileSync(file, "utf8") }))
    .filter(({ text }) => /\b20\d\d\b/.test(text))
    .map(({ rel, text }) => ({ rel, text: text.replace(/\s+/g, " ") }));

  const hits = YEAR_BESIDE_THE_ENGINE.map(({ name, re }) => ({
    name,
    found: sources.flatMap(({ rel, text }) => {
      const match = re.exec(text);
      return match ? [`${rel}  ${match[0].trim().slice(0, 140)}`] : [];
    }),
  }));

  it("the scan reads the web app, the blog, the emails and the mobile app", () => {
    const rels = files.map((f) => path.relative(REPO, f));
    expect(rels).toContain("apps/web/app/tools/realtor-tax-estimator/page.tsx");
    expect(rels).toContain("apps/web/app/tools/realtor-tax-estimator/tax-estimator.tsx");
    expect(rels).toContain("apps/web/components/pdf/guide-pdf.tsx");
    expect(rels).toContain("apps/web/lib/troubleshooting-playbooks.ts");
    expect(rels.some((r) => r.startsWith("apps/web/content/blog/") && r.endsWith(".mdx"))).toBe(true);
    expect(rels.some((r) => r.startsWith("apps/mobile/") && r.endsWith(".tsx"))).toBe(true);
    expect(files.length).toBeGreaterThan(500);
  });

  it("every file left out of the scan still exists", () => {
    const rels = new Set(files.map((f) => path.relative(REPO, f)));
    for (const rel of Object.keys(NOT_A_LABEL)) expect(rels.has(rel), rel).toBe(true);
  });

  it.each(hits)("$name", ({ found }) => {
    expect(found).toEqual([]);
  });

  it("the patterns catch the labels that were removed", () => {
    const removed = [
      "Canadian Realtor Tax Estimator — 2025 Self-Employed Calculator",
      "Free tax estimator for Canadian real estate agents. Calculate your 2025 federal + provincial income tax",
      "Interactive 2025 tax calculator for self-employed Canadian real estate agents",
      "Estimate your 2025 federal tax, provincial tax, CPP/QPP contributions",
      "The estimator uses 2025 federal and provincial tax brackets",
      "This calculator uses 2025 federal and provincial brackets",
      "Free 2025 Tax Estimator",
      "The 2025 Canadian Realtor Tax Estimator uses current federal brackets",
      "Free calculators for Canadian realtors — 2025 tax estimator and per-deal commission calculator",
      "Agent Runway's tax engine implements the 2025 federal and provincial bracket schedules",
      "the estimator applies the 2025 brackets published above",
      "Tax estimation engine with 2025 CRA federal + provincial brackets",
      "Agent Runway estimates your tax obligations using 2025 CRA rates",
    ];
    for (const label of removed) {
      expect(YEAR_BESIDE_THE_ENGINE.some(({ re }) => re.test(label)), label).toBe(true);
    }
  });

  it("the patterns leave dates, the engine's own year and ordinary sentences alone", () => {
    const fine = [
      "Canadian Realtor Tax Estimator — ${TAX_YEAR} Self-Employed Calculator",
      "The estimator runs the engine for the {TAX_YEAR} tax year",
      'the tax estimator page was reworded on 2026-10-13',
      "the tax engine's (gstHstRate), not typed: a typed cell missed the April 1, 2025 change",
      "Estimate your federal tax, provincial tax and CPP in under a minute",
      "RRSP contributions for the 2025 tax year are due by March 2, 2026",
    ];
    for (const sentence of fine) {
      expect(YEAR_BESIDE_THE_ENGINE.some(({ re }) => re.test(sentence)), sentence).toBe(false);
    }
  });
});
