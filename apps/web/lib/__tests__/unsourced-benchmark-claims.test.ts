/**
 * REGRESSION TRIPWIRE — no figure is called an industry benchmark without a
 * source (2026-10-13).
 *
 * The rule: a figure is not called an "industry benchmark", an "industry
 * average", "typical", "common" or a "healthy range", and is not credited to
 * "top producers", "most agents" or "experts", unless the page cites where it
 * was published. With no source it is Agent Runway's own figure and says so,
 * or it is a worked illustration and says so, or it goes.
 *
 * #322 did this for the expense ratio
 * (expense-ratio-bands-canonical.test.ts). The same sweep found the pattern
 * on other metrics: a "healthy" lead conversion range of 20–40%, a repeat
 * client rate "industry average" of 12–15%, brokerage splits "commonly
 * 20–30% of GCI", "most agents lose 90% of open house leads within 48
 * hours", "agents with a clear GCI target close 23% more deals on average".
 * None had a source.
 *
 * Three patterns are checked, in web, mobile and core source:
 *   1. an industry or national claim beside a figure ("industry average",
 *      "national median", "top producers")
 *   2. a figure credited to a crowd ("most agents lose 90%", "experts say
 *      3–6 months", "research shows 6+")
 *   3. a range stated as typical, common or healthy ("typically 3–5%",
 *      "commonly fall in the $2,000–4,000 range", "Healthy range: 20–40%")
 *
 * A match passes when it is cited: a citation link within two lines, or the
 * sentence names a source the same file links to ("The Financial Consumer
 * Agency of Canada says…" on a page whose source list holds that URL).
 *
 * A regex can't tell a sourced figure from a confident one, so this cannot
 * prove a page is right. It stops the wording that carried every unsourced
 * figure found so far from coming back unnoticed.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPLIT_COMPARISON_AGENT_PCT } from "@agent-runway/core/engines/advisor-engine";

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

const SCANNED = /\.(?:ts|tsx|mdx|md|txt|json)$/;
const SKIPPED = /(?:^|\/)(?:node_modules|__tests__|_shared|\.next|dist)(?:\/|$)|\.test\.tsx?$/;

function walk(rel: string, out: string[] = []): string[] {
  const abs = path.join(REPO_ROOT, rel);
  if (!existsSync(abs) || SKIPPED.test(rel)) return out;
  if (statSync(abs).isFile()) {
    if (SCANNED.test(rel)) out.push(rel);
    return out;
  }
  for (const name of readdirSync(abs)) walk(`${rel}/${name}`, out);
  return out;
}

const FILES = ROOTS.flatMap((root) => walk(root));
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

// ── What counts as a figure ─────────────────────────────────────────────────

/**
 * "23%", "$96,000", "5x", "1.5×", "6+ contacts", "3–6 months", or a figure
 * the code fills in: "industry benchmark of $${…}", "National median: ${…}".
 */
const FIGURE =
  /\d[\d,.]*\s?(?:%|percent\b|x\b|×)|\$\s?\d|\$\{|\b\d+\+?\s(?:contacts|touches|deals|months|hours|km)\b|\b\d+\s?(?:[–—-]|&ndash;)\s?\d+\s(?:months|hours|days|deals)\b/i;

/** "20–40%", "20% to 40%", "between 25% and 40%", "$2,000–4,000", "1.5–2×". */
const RANGE =
  "(?:\\$\\s?\\d[\\d,]*\\s?(?:[–—-]|&ndash;|\\\\u2013|to)\\s?\\$?\\d[\\d,]*" +
  "|\\d+(?:\\.\\d+)?\\s?(?:%|percent)?\\s?(?:[–—-]|&ndash;|\\\\u2013|\\bto\\b|\\band\\b)\\s?\\d+(?:\\.\\d+)?\\s?(?:%|percent\\b|x\\b|×))";

// ── 1. An industry or national claim ────────────────────────────────────────

const INDUSTRY_CLAIM =
  /industry[\s-](?:benchmarks?|averages?|standards?|norms?|medians?|statistics?|data|figures?|cohort|estimates?)|national (?:averages?|medians?)|canadian average|top[\s-](?:producers?|performers?)\b/i;

// ── 2. A figure credited to a crowd ─────────────────────────────────────────

/**
 * A number that reads as a statistic: "90%", "5x", "6+", "3–6", "1 call".
 * Not a digit inside a name or a class ("T4", "h2", "mt-4", "Q1").
 */
const CROWD_FIGURE =
  "(?<![A-Za-z\\d-])\\d[\\d,.]*(?:\\s?(?:%|percent\\b|x\\b|×|\\+)|\\s?[–—-]\\s?\\d|\\s(?:contacts?|calls?|touches|deals|months|hours|days|leads|times)\\b)";

const CROWD_CLAIM = new RegExp(
  `\\bmost (?:new )?(?:agents|realtors|experts|brokerages|teams)\\b[^.!?\\n]{0,100}?${CROWD_FIGURE}` +
    `|\\b(?:studies|research|industry data|data) shows?\\b[^.!?\\n]{0,100}?${CROWD_FIGURE}` +
    `|\\bexperts (?:say|recommend|suggest)\\b[^.!?\\n]{0,100}?${CROWD_FIGURE}` +
    `|\\bagents (?:with|who)\\b[^.!?\\n]{0,80}?\\d[\\d.]*\\s?% (?:more|fewer|higher|lower)`,
  "i",
);

// ── 3. A range stated as typical, common or healthy ─────────────────────────

/**
 * "common" alone is left out: "the most common cause", "common inputs". So is
 * "strong" after a range, which is how every `</strong>` tag reads.
 */
const TYPICAL_WORD = "(?:typical(?:ly)?|commonly|usually|generally considered|healthy|strong range|on average)";
const TYPICAL_RANGE = new RegExp(
  `\\b${TYPICAL_WORD}\\b[^.!?\\n]{0,120}?${RANGE}|${RANGE}[^.!?\\n]{0,60}?\\b(?:typical|healthy|commonly)\\b`,
  "i",
);

// ── Citations ───────────────────────────────────────────────────────────────

/** A citation element or an outbound link. */
const CITATION_MARKER = /<CRACite\b|Cite id=|\]\(https?:\/\/|href="https?:\/\/|tipSource:/;

/** A source named beside the claim counts when the same file links to it. */
const NAMED_SOURCES = [
  { name: /Financial Consumer Agency of Canada/, url: "canada.ca/en/financial-consumer-agency/" },
  { name: /\bCRA(?:'s|&apos;s)?\b|Canada Revenue Agency/, url: "canada.ca/en/revenue-agency/" },
] as const;

function isCited(source: string, lines: string[], i: number): boolean {
  const around = lines.slice(Math.max(0, i - 2), i + 3).join("\n");
  if (CITATION_MARKER.test(around)) return true;
  // The name has to be on the claim's own line: a tax page mentions CRA on
  // most lines, and that does not cite the figure on the next one.
  return NAMED_SOURCES.some(({ name, url }) => name.test(lines[i]) && source.includes(url));
}

// ── Scanning ────────────────────────────────────────────────────────────────

interface Hit {
  file: string;
  line: number;
  text: string;
}

/**
 * Code comments explain a change; they are not copy. A JSDoc line is "* text"
 * or a bare "*"; "**Benchmark**" is Markdown inside a prompt string and is copy.
 */
const COMMENT = /^\s*(?:\/\/|\/\*|\*(?:\s|\/|$)|\{\/\*)/;

/** "not an industry statistic", "never present it as an industry figure": the claim being denied, not made. */
const DENIED = /\b(?:not|never)\b[^.\n]{0,30}?\b(?:industry|national|published)\b/i;

function scan(match: (lines: string[], i: number) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const file of FILES) {
    const source = read(file);
    const lines = source.split("\n");
    const isCode = /\.tsx?$/.test(file);
    lines.forEach((text, i) => {
      if (text.length > 4000) return; // minified or generated
      if (isCode && COMMENT.test(text)) return;
      if (match(lines, i) && !isCited(source, lines, i)) {
        hits.push({ file, line: i + 1, text: text.trim().slice(0, 170) });
      }
    });
  }
  return hits;
}

/** The line and its neighbours as one run of text, so wrapped JSX still reads as a sentence. */
const withNext = (lines: string[], i: number) => `${lines[i]} ${lines[i + 1] ?? ""}`;
const neighbours = (lines: string[], i: number) => lines.slice(Math.max(0, i - 1), i + 2).join(" ");

/** True when `pattern` matches the line joined to the next one and the match starts on the line itself. */
function startsOnLine(pattern: RegExp, lines: string[], i: number): boolean {
  const found = pattern.exec(withNext(lines, i));
  return found !== null && found.index < lines[i].length;
}

/**
 * Known matches left in place, as a ceiling per file. A file may hold fewer
 * (another change removed one) but never more, so the pattern cannot spread.
 * Not an exact count: sibling changes were rewording some of these files on
 * the day this was written, and an exact count would have failed on whichever
 * merged second.
 */
type Allowed = Record<string, { max: number; why: string }>;

function unexpected(hits: Hit[], allowed: Allowed): string[] {
  const byFile = new Map<string, Hit[]>();
  for (const hit of hits) byFile.set(hit.file, [...(byFile.get(hit.file) ?? []), hit]);
  const problems: string[] = [];
  for (const [file, list] of byFile) {
    const limit = allowed[file]?.max ?? 0;
    if (list.length > limit) {
      problems.push(
        `${file}: ${list.length} found, ${limit} allowed\n` +
          list.map((h) => `    ${h.line}: ${h.text}`).join("\n"),
      );
    }
  }
  return problems;
}

// ── Left in place, with the reason ──────────────────────────────────────────

/**
 * The Benchmark feature. `benchmark-engine.ts` holds a table of GCI and deal
 * counts by years of experience and a "national median", described as
 * "industry-cohort estimates aggregated from public industry sources". No
 * source is named. The figures feed 5% of the Runway Score and appear on the
 * dashboard, Altimeter, Reports, the team dashboard, both PDFs, the Terms and
 * Flight Crew's knowledge. Renaming or removing them is a product decision
 * for Andrew, reported with this change and not made in it.
 */
const BENCHMARK_FEATURE = "The Benchmark feature's cohort table: unsourced, awaiting Andrew's decision (source it, relabel it as Agent Runway's estimate, or remove it).";

const ALLOWED_INDUSTRY: Allowed = {
  "packages/core/engines/org-insights-engine.ts": { max: 1, why: BENCHMARK_FEATURE },
  "packages/core/engines/advisor-engine.ts": { max: 1, why: BENCHMARK_FEATURE },
  "apps/web/app/(app)/dashboard/dashboard-content.tsx": { max: 1, why: BENCHMARK_FEATURE },
  "apps/web/components/pdf/guide-pdf.tsx": { max: 1, why: BENCHMARK_FEATURE },
  "apps/web/lib/knowledge-base.ts": { max: 2, why: BENCHMARK_FEATURE },
  "apps/web/lib/troubleshooting-playbooks.ts": {
    max: 5,
    why: `Four are the Benchmark feature. ${BENCHMARK_FEATURE} The fifth is the "Changed 2026-10-13" note in the expenses playbook, which quotes the old "industry average" wording so Flight Crew can explain why a colour changed.`,
  },
};

const ALLOWED_CROWD: Allowed = {
  "apps/web/lib/outreach-prompts.ts": {
    max: 1,
    why: "Reading-level guidance inside the drafting prompt, credited to research with no citation. A user never sees it. Left for the Flight Crew lane: rewording a prompt changes what the drafter writes.",
  },
};

/** Tax-rate ranges stated as typical: tax copy, reported with this change for the tax lane. */
const TAX_LANE =
  "A tax-rate range stated as typical. Tax copy: reported with this change for the tax lane to restate as CRA rates or engine estimates.";

const ALLOWED_TYPICAL: Allowed = {
  "apps/web/app/tools/realtor-tax-estimator/page.tsx": { max: 2, why: TAX_LANE },
  "apps/web/lib/troubleshooting-playbooks.ts": { max: 1, why: TAX_LANE },
  "apps/web/app/how-much-should-real-estate-agents-save-for-taxes-canada/page.tsx": { max: 3, why: TAX_LANE },
  "apps/web/content/blog/financial-runway-what-it-means-for-real-estate-agents.mdx": { max: 1, why: TAX_LANE },
  "apps/web/app/self-employed-cpp-real-estate-agents-canada/page.tsx": {
    max: 1,
    why: "The lowest combined federal and provincial rate, 'typically around 20–25%': a span of published tax rates, not a benchmark.",
  },
  "apps/web/lib/import-prompt.ts": {
    max: 1,
    why: "The import prompt tells the model which column holds commissions by the size of the numbers. A user never sees it, and import prompts are not reworded without a re-test of imports.",
  },
};

describe("no figure is called an industry benchmark without a source", () => {
  it("scans the source it means to", () => {
    expect(FILES.length).toBeGreaterThan(300);
    expect(FILES).toContain("apps/web/app/metrics/conversion-rate/page.tsx");
    expect(FILES).toContain("apps/web/content/blog/how-to-set-an-annual-gci-goal-real-estate-agent.mdx");
    expect(FILES).toContain("apps/web/lib/flight-plan-defaults.ts");
    expect(FILES).toContain("packages/core/engines/advisor-engine.ts");
    expect(FILES).toContain("apps/web/public/llms.txt");
  });

  it("the patterns catch the wording that was removed", () => {
    const industry = (s: string) => INDUSTRY_CLAIM.test(s) && FIGURE.test(s);
    expect(industry("The industry average sits around 12–15%. Top producers often run 25–35%.")).toBe(true);
    expect(industry("(12% above industry benchmark of $12,000)")).toBe(true);
    expect(CROWD_CLAIM.test("Most agents lose 90% of open house leads within 48 hours")).toBe(true);
    expect(CROWD_CLAIM.test("Most experts say 3–6 months before buying.")).toBe(true);
    expect(CROWD_CLAIM.test("industry data shows most conversions happen after 6+ contacts")).toBe(true);
    expect(CROWD_CLAIM.test("Agents with a clear annual GCI target close 23% more deals on average.")).toBe(true);
    expect(TYPICAL_RANGE.test("Healthy range: 20–40%")).toBe(true);
    expect(TYPICAL_RANGE.test('{ value: "20–40%", label: "healthy lead-to-client rate (referrals)" },')).toBe(true);
    expect(TYPICAL_RANGE.test("your brokerage retains (commonly 20–30% of GCI, though structures vary")).toBe(true);
    expect(TYPICAL_RANGE.test("dues commonly fall in the $2,000\\u20134,000 per year range")).toBe(true);
    expect(TYPICAL_RANGE.test("Add listings — typically 1.5–2× net per deal")).toBe(true);
    expect(TYPICAL_RANGE.test("typically 3&ndash;5% of the sale price")).toBe(true);
    expect(TYPICAL_RANGE.test("Typical agents deduct 20% to 35% of gross commission as expenses.")).toBe(true);
    // Arithmetic and plain statements are not claims.
    expect(TYPICAL_RANGE.test("A $180,000 GCI goal takes 20 deals at the first and 16 at the second.")).toBe(false);
    expect(CROWD_CLAIM.test("Most agents never do this math.")).toBe(false);
  });

  it("no industry or national claim sits beside a figure without a citation", () => {
    const hits = scan(
      (lines, i) => INDUSTRY_CLAIM.test(lines[i]) && !DENIED.test(lines[i]) && FIGURE.test(neighbours(lines, i)),
    );
    expect(unexpected(hits, ALLOWED_INDUSTRY)).toEqual([]);
  });

  it("no figure is credited to most agents, experts or research without a citation", () => {
    const hits = scan((lines, i) => startsOnLine(CROWD_CLAIM, lines, i));
    expect(unexpected(hits, ALLOWED_CROWD)).toEqual([]);
  });

  it("no range is stated as typical, common or healthy without a citation", () => {
    const hits = scan((lines, i) => startsOnLine(TYPICAL_RANGE, lines, i));
    expect(unexpected(hits, ALLOWED_TYPICAL)).toEqual([]);
  });

  it("a cited claim passes and the same claim uncited does not", () => {
    const cited = [
      "The Financial Consumer Agency of Canada says realtor",
      "commissions may be negotiable and typically range from 2% to",
      "6% of the sale price, depending on location",
      "<CRACite id={4} />.",
    ];
    expect(startsOnLine(TYPICAL_RANGE, cited, 1)).toBe(true);
    expect(isCited(cited.join("\n"), cited, 1)).toBe(true);
    const uncited = ["Commissions typically range from 2% to 6% of the sale price."];
    expect(isCited(uncited.join("\n"), uncited, 0)).toBe(false);
    // Naming a source is not enough: the file has to link to it.
    const named = ["The Financial Consumer Agency of Canada says commissions typically range from 2% to 6%."];
    expect(isCited(named.join("\n"), named, 0)).toBe(false);
    expect(isCited(`${named[0]}\nhttps://www.canada.ca/en/financial-consumer-agency/services/selling-home.html`, named, 0)).toBe(true);
  });

  it("the split card says whose comparison point it is, from the engine's constant", () => {
    const engine = read("packages/core/engines/advisor-engine.ts");
    expect(SPLIT_COMPARISON_AGENT_PCT).toBe(0.85);
    expect(engine).toContain("is Agent Runway's comparison point, not a market rate");
    // The comparison is typed once: no second 0.85 in the card's arithmetic.
    expect(engine.match(/\b0\.85\b/g) ?? []).toHaveLength(1);
  });
});
