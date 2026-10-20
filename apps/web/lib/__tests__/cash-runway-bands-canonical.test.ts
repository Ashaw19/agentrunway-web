/**
 * REGRESSION TRIPWIRE — cash runway bands come from the survival engine
 * (2026-10-13).
 *
 * The survival engine classifies a cash runway as critical under 2 months,
 * warning from 2, healthy from 4 and strong from 6, and colours critical red,
 * warning and healthy amber, strong emerald. Until this date these surfaces
 * stated something else:
 *
 *   dashboard alerts      "critically low" under 3 months, "getting thin"
 *                         under 5: a 2.5-month runway was badged Warning and
 *                         alerted as critically low
 *   dashboard briefing    red under 3, amber under 5
 *   dashboard health card "Critical" under 1 month, "At Risk" under 3, and a
 *                         next move of "at least 3 months"
 *   dashboard score help  "Build 4–6 months ... for a strong Survival score"
 *   Reports card          "Consider building your reserve to at least 4
 *                         months", in a red box, for an amber band
 *   advisor card          under 3 months, "Recommended minimum: 3–6 months"
 *   Scenarios note        under 3 months
 *   Flight Crew prompt    "runway under 3 months"
 *   /metrics/financial-runway   Critical under 1, Warning 1–3, Healthy 3–6
 *                         in green, Strong 6+ in blue
 *   the runway blog post  five tiers, Healthy at 6–12 and Strong at 12+
 *
 * The Reports card and the business report PDF also explained the month count
 * as cash and burn only. The months are cash ÷ (burn − pipeline income).
 *
 * The fix is in `@agent-runway/core/engines/survival-engine`:
 *
 *   RISK_BAND_LEVELS / RISK_BAND_RANGE / RISK_LEVEL_LABEL / RISK_BAND_LADDER
 *   riskBandPhrase(level)      "in the Warning range (2–4 months)"
 *   isFlaggedRiskLevel(level)  the bands a surface draws attention to
 *   runwayFlag(result)         the dashboard alert
 *   nextRiskBand(level)        the band above and the month it starts at
 *   runwayBasisSentence(result) / netMonthlyBurn(result)
 *
 * Checked here, in web, mobile and core source:
 *   1. a runway month count compared against a number in code
 *   2. a band edge typed by hand beside a runway ("under 3 months", "4–6
 *      months", "6+ months is strong"): right today, wrong the day the edges
 *      change
 *   3. every surface that had edges of its own reads the engine
 *   4. text that cannot import (the blog post's table) matches the engine
 *   5. the public metric page renders the engine's bands and colours
 *   6. what Flight Crew is told matches the engine
 *   7. the Runway Score's Survival sub-score follows the bands (v1.4)
 *
 * On 7: the Survival bar is drawn beside the Cash Runway number and coloured
 * by its 0–100 score. Until v1.4 the score had edges of its own, so a runway
 * from 2 to under 3 months was a red bar (30, At Risk) beside an amber
 * Warning number. The ladder is now built from the engine's bands
 * (runway-score-engine.ts, SURVIVAL_SCORE_STEPS), and Flight Crew's table is
 * built from the ladder.
 *
 * A regex can't prove a sentence is right, only that its figures were not
 * typed in. The sentences themselves are tested in
 * packages/core/engines/__tests__/survival-engine.test.ts, and the PDF's in
 * pdf-tax-copy.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RISK_BAND_FLOOR_MONTHS,
  RISK_BAND_LADDER,
  RISK_BAND_LEVELS,
  RISK_BAND_RANGE,
  RISK_LEVEL_LABEL,
  riskColorBand,
} from "@agent-runway/core/engines/survival-engine";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import {
  bandColorHexForScore,
  compute as computeRunwayScore,
  stateLabel,
  survivalSubScore,
  SCORE_VERSION,
  SURVIVAL_SCORE_STEPS,
} from "@agent-runway/core/engines/runway-score-engine";
import { classifyTopicMulti } from "@/lib/troubleshooting-classifier";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { getPlaybook } from "@/lib/troubleshooting-playbooks";
import FinancialRunwayMetricPage from "@/app/metrics/financial-runway/page";

// The page's nav and footer are client components with their own data needs.
// The page's own content is what is under test.
vi.mock("@/components/marketing-nav", () => ({ MarketingNav: () => null }));
vi.mock("@/components/marketing-footer", () => ({ MarketingFooter: () => null }));
vi.mock("next/link", async () => {
  const react = await import("react");
  return {
    default: ({ href, children }: { href: string; children?: unknown }) =>
      react.createElement("a", { href }, children as never),
  };
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../.."); // agentrunway-web/

const ROOTS = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "apps/web/content",
  "apps/web/public/llms.txt",
  "apps/web/supabase/functions",
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/stores",
  "apps/mobile/lib",
  "packages/core",
  "packages/i18n/shared/en.json",
  "packages/i18n/web/en",
  "packages/i18n/mobile/en",
] as const;

/** The one file that may state the edges. */
const ENGINE = "packages/core/engines/survival-engine.ts";

const SCANNED = /\.(?:ts|tsx|mdx|md|txt|json)$/;
const SKIPPED = /(?:^|\/)(?:node_modules|__tests__|_shared|\.next|dist)(?:\/|$)|\.test\.tsx?$/;

function walk(rel: string, out: string[] = []): string[] {
  const abs = path.join(REPO_ROOT, rel);
  if (!existsSync(abs) || SKIPPED.test(rel)) return out;
  if (statSync(abs).isFile()) {
    if (SCANNED.test(rel) && rel !== ENGINE) out.push(rel);
    return out;
  }
  for (const name of readdirSync(abs)) walk(`${rel}/${name}`, out);
  return out;
}

const FILES = ROOTS.flatMap((root) => walk(root));
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

/**
 * Source with its comments blanked, line numbers kept. A comment that
 * restates an edge misleads nobody on a screen; what is scanned is what a
 * user or Flight Crew can read, and what the code decides on.
 */
function code(rel: string): string {
  const source = read(rel);
  if (!/\.tsx?$/.test(rel)) return source;
  const blank = (match: string) => match.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|\s)\/\/.*$/gm, (match, lead: string) => lead + " ".repeat(match.length - lead.length));
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

/**
 * Known matches left in place, counted per file so a new one still fails and
 * a fixed one forces the list to shrink.
 */
type Allowed = Record<string, { count: number; why: string }>;

function unexpected(hits: Hit[], allowed: Allowed): string[] {
  const byFile = new Map<string, Hit[]>();
  for (const hit of hits) byFile.set(hit.file, [...(byFile.get(hit.file) ?? []), hit]);
  const problems: string[] = [];
  for (const [file, list] of byFile) {
    const limit = allowed[file]?.count ?? 0;
    if (list.length !== limit) {
      problems.push(
        `${file}: ${list.length} found, ${limit} allowed\n` +
          list.map((h) => `    ${h.line}: ${h.text}`).join("\n"),
      );
    }
  }
  for (const [file, { count }] of Object.entries(allowed)) {
    if (!byFile.has(file)) problems.push(`${file}: 0 found, ${count} allowed. Remove it from the allow-list.`);
  }
  return problems;
}

// ── 1. A month count compared against a number ──────────────────────────────

/**
 * `survival.months < 3`, `current.survivalMonths < 3`, `runwayMonths < 6`.
 * Comparing with 0 asks "is one set"; 24 is the cap the engine's own label
 * prints as "24+ months".
 */
const MONTHS_VS_NUMBER =
  /\b(?:survival\w*\.months|\w*survivalMonths|\w*runwayMonths)\s*[<>]=?\s*(?!(?:0|24)\b(?!\.))-?\d/i;

const ALLOWED_COMPARISONS: Allowed = {
  "apps/web/app/(app)/dashboard/dashboard-content.tsx": {
    count: 3,
    why: 'How a runway under one month is displayed ("< 1 month", no calendar anchor). Not a band edge: no colour, status or alert hangs on it.',
  },
  "apps/web/app/cockpit/page.tsx": {
    count: 3,
    why: "The Director Cockpit's SaaS runway: Agent Runway Inc.'s own cash, internal only. Not an agent's cash runway and not the survival engine's figure.",
  },
};

// ── 2. A band edge typed by hand ────────────────────────────────────────────

/**
 * Text that is about an agent's cash runway. "Agent Runway" is the product
 * and "Runway Score" the composite score; neither is a month count.
 */
const ABOUT_RUNWAY =
  /(?<!agent\s)\brunway\b(?!\s+(?:score|inputs|briefing|gauge)\b)|survival|cash reserves?|\bburn\b/i;

/** A month count from 1 to 12. 24 is the cap, not an edge. */
const N = "(?:1[0-2]|[1-9])";
const UNIT = "(?:months?|mo)\\b";
const BAND_WORD = "(?:critical|warning|healthy|strong)\\b";

/**
 * "under 3 months", "at least 4 months", "≥6 months", "< 1 mo";
 * "4–6 months", "3 to 6 months"; "6+ months", "6+ mo";
 * and a figure set against a band's word with no unit: "2-4 warning",
 * "| ≥6 | Strong |", "<2mo critical".
 */
const TYPED_EDGE = new RegExp(
  // A ">" straight after a quote or a brace closes a JSX tag: `">10.9 months`.
  `(?:\\b(?:under|below|less than|fewer than|at least|over|above|beyond|more than|minimum:?)\\s+|(?:[<≤≥]|(?<=^|[\\s(])>)=?\\s?)${N}(?:\\.\\d)?\\s?\\+?\\s?${UNIT}` +
    `|(?<![\\d.$,])${N}\\s?(?:[–—-]|to)\\s?<?${N}\\+?\\s?${UNIT}` +
    `|(?<![\\d.$,])${N}\\+\\s?${UNIT}` +
    `|(?<![\\d.$,])${N}(?:\\s?[–—-]\\s?${N})?\\+?\\s?(?:mo(?:nths?)?)?\\s*(?:\\||is|=|:|→)?\\s*(?:considered\\s+)?${BAND_WORD}`,
  "i",
);

/** How many lines a figure can sit from the words that make it about a runway: a table's rows sit under its heading. */
const REACH = 6;

function typedEdges(): Hit[] {
  const hits: Hit[] = [];
  for (const file of FILES) {
    const lines = code(file).split("\n");
    lines.forEach((text, i) => {
      if (!TYPED_EDGE.test(text)) return;
      const around = lines.slice(Math.max(0, i - REACH), i + REACH + 1).join(" ").replace(/\s+/g, " ");
      if (ABOUT_RUNWAY.test(around)) hits.push({ file, line: i + 1, text: text.trim().slice(0, 160) });
    });
  }
  return hits;
}

const BLOG_POST = "apps/web/content/blog/financial-runway-what-it-means-for-real-estate-agents.mdx";
const PLAYBOOKS = "apps/web/lib/troubleshooting-playbooks.ts";
const KNOWLEDGE = "apps/web/lib/knowledge-base.ts";
const SCORE_ENGINE = "packages/core/engines/runway-score-engine.ts";

const ALLOWED_TYPED_EDGES: Allowed = {
  "apps/web/app/(app)/dashboard/dashboard-content.tsx": {
    count: 2,
    why: 'How a runway under one month is displayed: "< 1 month" beside the score and "Less than 1 month" in the Daily Briefing. Not a band edge.',
  },
  [BLOG_POST]: {
    count: 4,
    why: "The band table's four rows. MDX cannot import, so check 4 holds each row to the engine.",
  },
  [PLAYBOOKS]: {
    count: 3,
    why:
      'Three "Changed 2026-10-13" notes telling Flight Crew what was true before, so it can explain why an alert, a card or a score changed: ' +
      "what the screens said, what the business report PDF said, and which Survival sub-score step moved in v1.4.",
  },
  [KNOWLEDGE]: {
    count: 1,
    why: 'The "Changed 2026-10-13 (v1.4)" note naming the Survival sub-score step that moved. A dated fact, not a band edge in use.',
  },
};

// ── 3. Surfaces that had edges of their own ─────────────────────────────────

const SURFACES = [
  "packages/core/engines/advisor-engine.ts",
  "apps/web/app/(app)/dashboard/dashboard-content.tsx",
  "apps/web/app/(app)/reports/reports-content.tsx",
  "apps/web/app/(app)/scenarios/scenarios-content.tsx",
  "apps/web/app/metrics/financial-runway/page.tsx",
  "apps/web/components/pdf/business-report-pdf.tsx",
  "apps/web/components/pdf/guide-pdf.tsx",
  "apps/web/app/api/chat/route.ts",
  KNOWLEDGE,
  PLAYBOOKS,
  SCORE_ENGINE,
] as const;

const IMPORTS_THE_ENGINE =
  /from\s+["'](?:@agent-runway\/core\/engines\/survival-engine|@\/lib\/engines\/survival-engine|\.\/survival-engine)["']/;

const capitalised = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

describe("cash runway: one set of bands, from the survival engine", () => {
  it("scans the source it means to", () => {
    expect(FILES.length).toBeGreaterThan(300);
    for (const surface of SURFACES) expect(FILES).toContain(surface);
    expect(FILES).toContain(BLOG_POST);
    expect(FILES).not.toContain(ENGINE);
  });

  it("no file compares a runway's months against a number", () => {
    const hits: Hit[] = [];
    for (const file of FILES.filter((f) => /\.tsx?$/.test(f))) {
      code(file)
        .split("\n")
        .forEach((text, i) => {
          if (MONTHS_VS_NUMBER.test(text)) hits.push({ file, line: i + 1, text: text.trim().slice(0, 160) });
        });
    }
    expect(unexpected(hits, ALLOWED_COMPARISONS)).toEqual([]);
  });

  it("no file types a band edge by hand beside a cash runway", () => {
    expect(unexpected(typedEdges(), ALLOWED_TYPED_EDGES)).toEqual([]);
  });

  it.each(SURFACES)("%s reads the survival engine", (surface) => {
    expect(read(surface)).toMatch(IMPORTS_THE_ENGINE);
  });

  it("the blog post's table is the engine's four bands", () => {
    const post = read(BLOG_POST);
    for (const level of RISK_BAND_LEVELS) {
      expect(post).toContain(`| ${capitalised(RISK_BAND_RANGE[level])} | ${RISK_LEVEL_LABEL[level]} |`);
    }
    // The old table had a fifth tier and put Healthy at 6–12 months.
    expect(post).not.toMatch(/12\+ months|6–12 months|Concerning|Acceptable/);
    expect(post.match(/^\|.*\bmonths\b.*\|$/gm)).toHaveLength(RISK_BAND_LEVELS.length);
  });
});

describe("dashboard: a runway is flagged in the engine's words", () => {
  const page = read("apps/web/app/(app)/dashboard/dashboard-content.tsx");

  it("the alert is the engine's flag", () => {
    expect(page).toContain("runwayFlag(survival)");
    expect(page).not.toMatch(/critically low|getting thin|Time to close some pipeline/);
  });

  it("the health card's status follows the engine's level, not its own month counts", () => {
    expect(page).toMatch(/survival\.riskLevel === "critical"\) return "Critical"/);
    expect(page).not.toMatch(/extend runway beyond 1 month|at least 3 months/);
  });

  it("the score help says where Strong starts, from the engine", () => {
    expect(page).not.toMatch(/Build 4–6 months|6\+ months is considered strong/);
    expect(page).toContain("RISK_BAND_RANGE.strong");
    expect(page).toContain("RISK_BAND_LADDER");
  });

  it("does not describe the figure as cash against zero new income", () => {
    // The months are after the pipeline income estimate.
    expect(page).not.toMatch(/with zero new income/);
  });
});

describe("Scenarios: the runway note is the engine's band", () => {
  const page = read("apps/web/app/(app)/scenarios/scenarios-content.tsx");

  it("notes a flagged runway and says which range it is in", () => {
    expect(page).toContain("isFlaggedRiskLevel(");
    expect(page).toContain("riskBandPhrase(");
    expect(page).not.toMatch(/under 3 months/);
  });
});

describe("/metrics/financial-runway: the public page shows the engine's bands", () => {
  const html = renderToStaticMarkup(createElement(FinancialRunwayMetricPage));
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

  it.each(RISK_BAND_LEVELS)("the %s row gives the engine's range and word", (level) => {
    expect(text).toContain(`${capitalised(RISK_BAND_RANGE[level])} ${RISK_LEVEL_LABEL[level]}`);
  });

  it.each(RISK_BAND_LEVELS)("the %s row is the engine's colour", (level) => {
    const row = html.match(new RegExp(`<div data-band="${level}" class="([^"]*)"`));
    expect(row, `no row for ${level}`).not.toBeNull();
    expect(row![1]).toContain(`bg-${riskColorBand(level)}-50`);
  });

  it("Healthy is not green and Strong is not blue", () => {
    // Under 6 months is not yet strong: only Strong is emerald.
    expect(html.match(/<div data-band="healthy" class="([^"]*)"/)![1]).not.toMatch(/emerald|green|blue/);
    expect(html.match(/<div data-band="strong" class="([^"]*)"/)![1]).toMatch(/emerald/);
  });

  it("lists four bands, lowest first", () => {
    const order = [...html.matchAll(/<div data-band="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual([...RISK_BAND_LEVELS]);
  });

  it("states none of the old edges", () => {
    expect(text).not.toMatch(/Less than 1 month|1–3 months|3–6 months|< 1 mo/);
  });

  it("the hero gives the engine's Strong and Critical edges", () => {
    expect(text).toContain(`${RISK_BAND_FLOOR_MONTHS.strong}+ mo`);
    expect(text).toContain(`Under ${RISK_BAND_FLOOR_MONTHS.warning} mo`);
  });

  it("says the product's figure is after pipeline income, and counts the score's five components", () => {
    expect(text).toMatch(/How Agent Runway measures financial runway.*pipeline/);
    expect(text).not.toMatch(/six financial dimensions/);
  });
});

describe("marketing pages name the bands and the score for what they are", () => {
  // Found on the same sweep. The four words are the cash runway's bands; the
  // Runway Score's own labels are Strong, On Track, Building and At Risk, and
  // it has had five components since v1.1.
  const report = buildHealthReport(120_000, 200_000, 0.75, 40_000, 39_600);
  const components = computeRunwayScore(report, 50, 6).components.length;
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
  const COUNT = "(\\d+|zero|one|two|three|four|five|six|seven|eight)";
  const COMPONENT_COUNT = new RegExp(
    `\\b${COUNT}[- ](?:financial |business |key )?(?:components?|dimensions|factors)\\b`,
    "gi",
  );

  it("no page gives the Runway Score a component count other than the engine's", () => {
    const wrong: string[] = [];
    for (const file of FILES.filter((f) => f.startsWith("apps/web/") && !f.includes("/(app)/crm/"))) {
      const lines = read(file).split("\n");
      lines.forEach((text, i) => {
        if (!/runway score|composite|health grade|health score/i.test(lines.slice(Math.max(0, i - 2), i + 3).join(" "))) return;
        for (const match of text.matchAll(COMPONENT_COUNT)) {
          const stated = /^\d+$/.test(match[1]) ? Number(match[1]) : WORDS.indexOf(match[1].toLowerCase());
          if (stated !== components) wrong.push(`${file}:${i + 1}: ${match[0]}`);
        }
      });
    }
    expect(components).toBe(5);
    expect(wrong).toEqual([]);
  });

  it("the cash runway's four words are not called the Runway Score", () => {
    const words = RISK_BAND_LEVELS.map((level) => RISK_LEVEL_LABEL[level]).join(", ").replace(/, (\w+)$/, ",? (?:or )?$1");
    const mislabelled = new RegExp(`runway score:?\\s+${words}`, "i");
    expect(FILES.filter((file) => mislabelled.test(read(file)))).toEqual([]);
  });
});

describe("Flight Crew is told the engine's bands", () => {
  const COLOUR_WORD = { red: "Red", amber: "Amber", emerald: "Green", slate: "Gray" } as const;
  const playbook = getPlaybook("survival");

  it.each(RISK_BAND_LEVELS)("the survival playbook's table has the %s row", (level) => {
    expect(playbook).toContain(
      `| ${capitalised(RISK_BAND_RANGE[level])} | ${RISK_LEVEL_LABEL[level]} | ${COLOUR_WORD[riskColorBand(level)]} |`,
    );
  });

  it("the playbook says which runways are flagged, and where", () => {
    expect(playbook).toContain(
      `A runway is flagged when it is ${RISK_LEVEL_LABEL.critical} or ${RISK_LEVEL_LABEL.warning} (under ${RISK_BAND_FLOOR_MONTHS.healthy} months)`,
    );
    expect(playbook).not.toContain("Flags when <3 months");
  });

  it("the playbook quotes the alert's wording from the engine", () => {
    expect(playbook).toContain(`"Cash runway is in the ${RISK_LEVEL_LABEL.warning} range (${RISK_BAND_RANGE.warning})"`);
  });

  it("the knowledge base states the bands in the engine's sentence", () => {
    expect(KNOWLEDGE_BASE).toContain(`**Survival Runway** = Cash Reserve / Net Monthly Burn. ${RISK_BAND_LADDER}`);
  });

  it("the chat prompt points at the engine's flagged bands, not a month count of its own", () => {
    const route = read("apps/web/app/api/chat/route.ts");
    expect(route).not.toMatch(/runway under 3 months/);
    expect(route).toContain("RISK_LEVEL_LABEL.critical");
  });
});

describe("Runway Score: the Survival sub-score follows the cash runway bands", () => {
  const COLOUR_WORD = { red: "Red", amber: "Amber", emerald: "Green", slate: "Gray" } as const;
  const HEX_COLOUR_WORD: Record<string, string> = { "#EF4444": "Red", "#F59E0B": "Amber", "#10B981": "Green" };
  const scorePlaybook = getPlaybook("runway-score");
  const lines = scorePlaybook.split("\n");
  const heading = lines.find((line) => line.startsWith("**Survival Score** (15%)")) ?? "";
  const changed = lines.find((line) => line.startsWith("Changed 2026-10-13 (v1.4):")) ?? "";
  const months = (n: number) => (n === 1 ? "1 month" : `${n} months`);

  const rows = SURVIVAL_SCORE_STEPS.map((step, i) => {
    const next = SURVIVAL_SCORE_STEPS[i + 1];
    const range = !next
      ? `${step.fromMonths}+ months`
      : step.fromMonths === 0
        ? `Under ${months(next.fromMonths)}`
        : `${step.fromMonths} to under ${months(next.fromMonths)}`;
    return { step, range };
  });

  it("the score engine has no month count of its own left to compare", () => {
    expect(code(SCORE_ENGINE)).not.toMatch(MONTHS_VS_NUMBER);
  });

  it.each(rows)("Flight Crew's ladder has the engine's step for $range", ({ step, range }) => {
    const colour = COLOUR_WORD[riskColorBand(step.level)];
    // The bar (coloured by the score) and the runway number (coloured by the band) agree.
    expect(HEX_COLOUR_WORD[bandColorHexForScore(step.score)]).toBe(colour);
    expect(scorePlaybook).toContain(
      `| ${range} | ${RISK_LEVEL_LABEL[step.level]} | ${step.score} | ${stateLabel(step.score)} | ${colour} |`,
    );
  });

  it("the ladder has no row the engine does not", () => {
    const table = lines.filter((line) => /^\| (?:Under \d|\d+ to under \d|\d+\+ months)/.test(line));
    expect(table).toHaveLength(SURVIVAL_SCORE_STEPS.length);
    expect(scorePlaybook).not.toMatch(/→ 30 \(At Risk\)|→ 42 \(Building \/ watch\)/);
  });

  it("the playbook gives the engine's score version and says why the two colours agree", () => {
    expect(heading).toContain(`v${SCORE_VERSION}`);
    expect(heading).toContain("the Survival bar is the colour of the Cash Runway number beside it");
    expect(heading).not.toMatch(/the score's own/);
  });

  it("the playbook says an unset runway is a red bar beside a gray number, and why", () => {
    const notSet = lines.find((line) => line.startsWith("- Not configured")) ?? "";
    expect(notSet).toContain(`→ ${survivalSubScore(-1)} `);
    expect(stateLabel(survivalSubScore(-1))).toBe("At Risk");
    expect(notSet).toContain('reads "Not set" in gray while the Survival bar is red');
  });

  it("the playbook's dated note names the step that moved, both scores and the effect on the composite", () => {
    expect(changed).not.toBe("");
    expect(changed).toMatch(/from 2 to under 3 months scored 30 on Survival \(At Risk, a red bar\)/);
    expect(changed).toContain("It now scores 41 (Building, amber)");
    // A dated note keeps that day's figures. The Survival ladder hasn't moved
    // since v1.4 (v1.5 changed only an empty pipeline), so they are still the ladder's.
    expect(SCORE_VERSION).toBe("1.5");
    expect(survivalSubScore(2.5)).toBe(41);
    expect(changed).toContain("No other step moved");
    expect(changed).toMatch(/Survival is 15% of the Runway Score.*1 or 2 points higher.*with nothing else changed/);
    expect(`${heading}\n${changed}`).not.toMatch(/—/);
  });

  it.each(RISK_BAND_LEVELS)("both playbooks say which score band a %s runway scores in, and its colour", (level) => {
    const scores = SURVIVAL_SCORE_STEPS.filter((step) => step.level === level).map((step) => step.score);
    const scoreBands = new Set(scores.map(stateLabel));
    expect(scoreBands.size).toBe(1);
    const sentence = `a ${RISK_LEVEL_LABEL[level]} runway scores ${[...scoreBands][0]} (${COLOUR_WORD[riskColorBand(level)].toLowerCase()})`;
    expect(heading).toContain(sentence);
    expect(getPlaybook("survival")).toContain(sentence);
  });

  it("the survival playbook says the sub-score follows its bands, not only where the top step starts", () => {
    const survivalPlaybook = getPlaybook("survival");
    expect(survivalPlaybook).toContain("The Survival sub-score follows these bands");
    expect(survivalPlaybook).not.toContain("The top Survival sub-score starts where");
    expect(survivalPlaybook).toContain('a red bar beside a gray "Not set"');
  });

  it("the knowledge base gives the engine's version, each band's scores and the dated note", () => {
    expect(KNOWLEDGE_BASE).toContain(`**Runway Score** (v${SCORE_VERSION}) = `);
    expect(KNOWLEDGE_BASE).not.toMatch(/\*\*Runway Score\*\* \(v1\.[0-3]\)/);
    for (const level of RISK_BAND_LEVELS) {
      const scores = SURVIVAL_SCORE_STEPS.filter((step) => step.level === level).map((step) => step.score);
      const range = scores.length > 1 ? `${scores[0]}–${scores[scores.length - 1]}` : `${scores[0]}`;
      expect(KNOWLEDGE_BASE).toContain(`${RISK_LEVEL_LABEL[level]} ${range} (${stateLabel(scores[0])})`);
    }
    expect(KNOWLEDGE_BASE).toMatch(
      /Changed 2026-10-13 \(v1\.4\): a runway from 2 to under 3 months scored 30 \(At Risk, red\) and now scores 41 \(Building, amber\); no other step moved\./,
    );
  });

  it.each([
    "why is my survival bar red when my cash runway is amber",
    "my survival bar turned amber, it was red yesterday",
    "Survival is 41 now, it was 30",
    "my survival score went from 30 to 41 and I changed nothing",
    "My runway score went up 2 points overnight, why?",
  ])("%s reaches a playbook that says what changed", (question) => {
    // A question that says "survival" without "score" reaches only the
    // Survival playbook, so the dated note is in both.
    const topics = classifyTopicMulti(question).map((t) => t.topic);
    expect(topics.length).toBeGreaterThan(0);
    expect(getPlaybook(topics[0])).toContain(changed);
  });

  it("Flight Crew's example of stating a Survival score uses a score the ladder gives", () => {
    const prompts = read("apps/web/lib/flight-crew/system-prompts.ts");
    const example = prompts.match(/Survival scored (\d+)\/100 \(engine label: (\w+)\)[^\n]*?([\d.]+) months/);
    expect(example).not.toBeNull();
    const [, score, level, runway] = example!;
    expect(Number(score)).toBe(survivalSubScore(Number(runway)));
    expect(SURVIVAL_SCORE_STEPS.find((step) => step.score === Number(score))?.level).toBe(level);
  });
});
