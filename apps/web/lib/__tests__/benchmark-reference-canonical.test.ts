/**
 * REGRESSION TRIPWIRE — the Benchmark's figures are Agent Runway's own, and
 * every surface says so (2026-10-13).
 *
 * `benchmark-engine.ts` holds a table of GCI by years of experience. Until
 * this date the app called it "industry-cohort estimates aggregated from
 * public industry sources", printed the score as a cohort percentile ("P62")
 * beside a "cohort median" and a "national median", and told agents they had
 * "outperformed most agents in your cohort". No source exists for the table:
 * CREA and Statistics Canada publish no agent GCI by years of experience.
 *
 * Andrew's decision: keep the numbers, so no Runway Score moves, and say
 * whose they are. The wording lives once, in
 * `@agent-runway/core/engines/benchmark-engine`:
 *
 *   BENCHMARK_COPY                 provenance, labels, the definition
 *   formatBenchmarkScore()         "62/100", never "P62" or "62nd percentile"
 *   benchmarkCardSubtitle()        "vs. Growth (3–5 yrs) · Agent Runway reference figures"
 *   benchmarkSentence()            the comparison in one sentence
 *   benchmarkReferenceList()       the table, for Flight Crew
 *   BENCHMARK_VOICE_RULE           what Flight Crew may and may not call it
 *
 * The same sweep found the seasonality default labelled "national averages".
 * There is no national seasonal data: the weights are the account's stored
 * quarter weights, 25% a quarter by default (ACCOUNT_SEASONALITY_COPY in
 * projection-engine).
 *
 * Seven things are checked, in web, mobile and core source:
 *   1. the old wording is gone (industry, national, percentile, peer)
 *   2. no surface prints the score as "P62" or as an ordinal
 *   3. every surface that words the Benchmark imports the engine's wording
 *   4. the table is typed once, in the engine
 *   5. Flight Crew's knowledge and playbook carry the table and the rule
 *   6. the Terms say whose figures they are
 *   7. the seasonality label comes from the projection engine
 *
 * The table's numbers are pinned in
 * packages/core/engines/__tests__/benchmark-engine.test.ts, and the report
 * PDF's printed wording in pdf-tax-copy.test.ts.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BENCHMARK_COPY,
  BENCHMARK_VOICE_RULE,
  benchmarkReferenceList,
} from "@agent-runway/core/engines/benchmark-engine";
import { ACCOUNT_SEASONALITY_COPY } from "@agent-runway/core/engines/projection-engine";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { getPlaybook } from "@/lib/troubleshooting-playbooks";

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

/** The one file that may state the figures. */
const ENGINE = "packages/core/engines/benchmark-engine.ts";

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
/** Each file is read once: six checks walk the same thousand files. */
const SOURCES = new Map<string, string>();
function read(rel: string): string {
  let source = SOURCES.get(rel);
  if (source === undefined) {
    source = readFileSync(path.join(REPO_ROOT, rel), "utf8");
    SOURCES.set(rel, source);
  }
  return source;
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

/** Code comments explain a change; they are not copy. "**Benchmark**" is Markdown inside a prompt string and is copy. */
const COMMENT = /^\s*(?:\/\/|\/\*|\*(?:\s|\/|$)|\{\/\*)/;

/** "They were never industry or national figures", "not national averages": the claim being denied, not made. */
const DENIED = /\b(?:not|never)\b[^.\n]{0,30}?\b(?:industry|national|published)\b/i;

function scan(pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const file of FILES) {
    const isCode = /\.tsx?$/.test(file);
    read(file)
      .split("\n")
      .forEach((text, i) => {
        if (text.length > 4000) return; // minified or generated
        if (isCode && COMMENT.test(text)) return;
        if (pattern.test(text) && !DENIED.test(text)) {
          hits.push({ file, line: i + 1, text: text.trim().slice(0, 170) });
        }
      });
  }
  return hits;
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

// ── 1. The old wording ──────────────────────────────────────────────────────

/** The figures credited to an industry, a market or the country. */
const INDUSTRY_OR_NATIONAL =
  /industry[\s-](?:cohort|estimate|median)|industry benchmark|public industry sources|market benchmark|national (?:median|percentile|cohort|agent data)/i;

/** The score worded as a rank among agents. */
const RANK_AMONG_AGENTS =
  /cohort (?:percentile|median|rank)|percentile rank|\bpctile\b|peer[\s-]benchmark|benchmark peer|peer comparison|(?:against|to) peers\b|outperformed most agents|agents with similar experience/i;

/** The seasonality default credited to the country. */
const NATIONAL_SEASONALITY = /national[\s-](?:seasonal|seasonality)|national (?:averages|defaults?)\b/i;

/** Words a user may still type. They route the question to the Benchmark playbook and are never shown. */
const CLASSIFIER_KEYWORDS =
  "Keywords and phrases the troubleshooting classifier matches in a user's question. A user who saw the old wording may still type it. Nothing here is shown to anyone.";

const ALLOWED_INDUSTRY_OR_NATIONAL: Allowed = {
  "apps/web/lib/troubleshooting-classifier.ts": { count: 3, why: CLASSIFIER_KEYWORDS },
};

const ALLOWED_RANK: Allowed = {
  "apps/web/lib/troubleshooting-classifier.ts": { count: 1, why: CLASSIFIER_KEYWORDS },
  "apps/web/app/about/page.tsx": {
    count: 1,
    why: "The founding story lists what agents lacked, a way to compare against peers among them. It states no figure and describes no feature. Left for Andrew: it is his account.",
  },
  "apps/web/app/about/andrew-shaw/page.tsx": {
    count: 1,
    why: "Andrew's biography, the same sentence as the About page. Not reworded without him.",
  },
};

// ── 2. The score printed as a percentile ────────────────────────────────────

/** `P{benchmark.percentile}`, `P${benchmark…}`, `${benchmark.percentile}th`, `ord(benchmark.percentile)`. */
const SCORE_AS_PERCENTILE =
  /P\$?\{\s*benchmark\w*[.}]|\$\{[^}]*[pP]ercentile[^}]*\}(?:st|nd|rd|th)\b|\bord\(\s*benchmark/;

// ── 3. Surfaces that word the Benchmark ─────────────────────────────────────

/** Each takes its Benchmark wording from the engine. The names are what it must import. */
const SURFACES: Record<string, string[]> = {
  "apps/web/app/(app)/dashboard/dashboard-content.tsx": ["BENCHMARK_COPY", "benchmarkCardSubtitle", "formatBenchmarkScore", "benchmarkSentence", "benchmarkVsReference"],
  "apps/web/app/(app)/altimeter/altimeter-content.tsx": ["BENCHMARK_COPY", "benchmarkCardSubtitle", "formatBenchmarkScore"],
  "apps/web/app/(app)/reports/reports-content.tsx": ["BENCHMARK_COPY", "benchmarkCardSubtitle", "formatBenchmarkScore", "benchmarkVsReference"],
  "apps/web/app/(app)/org/org-dashboard-content.tsx": ["BENCHMARK_COPY", "cohortLabelWithYears"],
  "apps/web/components/org-leaderboard.tsx": ["cohortLabelWithYears"],
  "apps/web/components/org-cohort-chart.tsx": ["cohortLabelWithYears"],
  "apps/web/components/annual-review.tsx": ["BENCHMARK_COPY", "formatBenchmarkScore", "benchmarkVsReference"],
  "apps/web/components/pdf/business-report-pdf.tsx": ["BENCHMARK_COPY", "cohortLabelWithYears", "formatBenchmarkScore", "benchmarkVsReference"],
  "apps/web/components/pdf/guide-pdf.tsx": ["BENCHMARK_COPY", "cohortLabelWithYears"],
  "apps/web/app/api/chat/route.ts": ["benchmarkSentence", "BENCHMARK_VOICE_RULE"],
  "apps/web/lib/chat-diagnostics.ts": ["BENCHMARK_COPY", "formatBenchmarkScore", "BENCHMARK_VOICE_RULE"],
  "apps/web/lib/knowledge-base.ts": ["BENCHMARKS", "BENCHMARK_VOICE_RULE"],
  "apps/web/lib/troubleshooting-playbooks.ts": ["BENCHMARK_COPY", "BENCHMARK_VOICE_RULE", "benchmarkReferenceList"],
  "apps/web/app/features/page.tsx": ["BENCHMARK_COPY"],
  "apps/web/app/page.tsx": ["BENCHMARK_COPY"],
  "apps/web/app/demo/page.tsx": ["BENCHMARK_COPY"],
  "apps/web/app/real-estate-analytics-vs-spreadsheets/page.tsx": ["BENCHMARK_COPY"],
  "apps/web/components/pricing-cards.tsx": ["BENCHMARK_COPY"],
  "apps/web/lib/schema.ts": ["BENCHMARK_COPY"],
  "packages/core/engines/advisor-engine.ts": ["GENERAL_REFERENCE_GCI", "formatBenchmarkScore"],
  "packages/core/engines/org-insights-engine.ts": ["GENERAL_REFERENCE_GCI_PER_DEAL"],
};

/** The import statement that names the engine, whichever alias the file uses. */
function engineImport(source: string): string {
  const found = source.match(/import\s*(?:type\s*)?\{[^}]*\}\s*from\s*"[^"]*benchmark-engine";/g);
  return (found ?? []).join("\n");
}

// ── 4. The table ────────────────────────────────────────────────────────────

/** A level's reference GCI written out: "$78,000", "78_000", "$78K". */
const REFERENCE_GCI_FIGURES = [
  /(?<![\d,.])\$?42[,_]000\b|\$42K\b/,
  /(?<![\d,.])\$?78[,_]000\b|\$78K\b/,
  /(?<![\d,.])\$?96[,_]000\b|\$96K\b/,
  /(?<![\d,.])\$?145[,_]000\b|\$145K\b/,
];

describe("the Benchmark's figures are Agent Runway's own, and every surface says so", () => {
  it("scans the source it means to", () => {
    expect(FILES.length).toBeGreaterThan(300);
    expect(FILES).toContain(ENGINE);
    expect(FILES).toContain("apps/web/app/terms/page.tsx");
    expect(FILES).toContain("apps/web/public/llms.txt");
    expect(FILES).toContain("apps/mobile/components/ScoreBreakdownSheet.tsx");
    for (const surface of Object.keys(SURFACES)) expect(FILES, surface).toContain(surface);
  });

  it("the patterns catch the wording that was removed", () => {
    expect(INDUSTRY_OR_NATIONAL.test("vs. {COHORT_LABELS[benchmark.cohort]} cohort · industry estimate")).toBe(true);
    expect(INDUSTRY_OR_NATIONAL.test("Benchmark data reflects industry-cohort estimates aggregated from public industry sources.")).toBe(true);
    expect(INDUSTRY_OR_NATIONAL.test('<th className="px-5 py-3 text-right font-medium">Industry Median</th>')).toBe(true);
    expect(INDUSTRY_OR_NATIONAL.test("Cohort Performance vs Industry Benchmark")).toBe(true);
    expect(INDUSTRY_OR_NATIONAL.test("`National median: ${fmtCurrency(nationalAvgPerDeal)}/deal`,")).toBe(true);
    expect(INDUSTRY_OR_NATIONAL.test("National Percentile: ${benchmark.nationalPercentile}th")).toBe(true);
    expect(INDUSTRY_OR_NATIONAL.test("against real national agent data.")).toBe(true);
    expect(RANK_AMONG_AGENTS.test("<span>Cohort percentile</span>")).toBe(true);
    expect(RANK_AMONG_AGENTS.test("Cohort median: {fmtCurrency(benchmark.cohortMedianGCI)}")).toBe(true);
    expect(RANK_AMONG_AGENTS.test("<Text style={s.benchmarkPctSub}>pctile</Text>")).toBe(true);
    expect(RANK_AMONG_AGENTS.test("<Text style={s.sectionTitle}>Peer Benchmark Positioning</Text>")).toBe(true);
    expect(RANK_AMONG_AGENTS.test('? "You outperformed most agents in your cohort."')).toBe(true);
    expect(RANK_AMONG_AGENTS.test("Years licensed as an agent — used for benchmark peer comparison.")).toBe(true);
    expect(NATIONAL_SEASONALITY.test('? "Seasonality: national averages"')).toBe(true);
    expect(NATIONAL_SEASONALITY.test('? "Based on national seasonal averages."')).toBe(true);
    expect(NATIONAL_SEASONALITY.test('national: "national seasonality",')).toBe(true);
    expect(NATIONAL_SEASONALITY.test('"National default"')).toBe(true);
    expect(SCORE_AS_PERCENTILE.test('<span className="font-medium">P{benchmark.percentile}</span>')).toBe(true);
    expect(SCORE_AS_PERCENTILE.test("<span>P{benchmark.nationalPercentile}</span>")).toBe(true);
    expect(SCORE_AS_PERCENTILE.test("ranks at the ${benchmark.percentile}th percentile for your experience cohort")).toBe(true);
    expect(SCORE_AS_PERCENTILE.test("<Text style={s.benchmarkPctText}>{ord(benchmark.percentile)}</Text>")).toBe(true);
    // The settings columns keep their historic names, and the new wording passes.
    expect(NATIONAL_SEASONALITY.test("settings.use_national_seasonality ? nationalWeights : uniform")).toBe(false);
    expect(RANK_AMONG_AGENTS.test(BENCHMARK_COPY.provenance) && !DENIED.test(BENCHMARK_COPY.provenance)).toBe(false);
    expect(SCORE_AS_PERCENTILE.test("{formatBenchmarkScore(benchmark.percentile)}")).toBe(false);
  });

  it("no surface credits the figures to an industry, a market or the country", () => {
    expect(unexpected(scan(INDUSTRY_OR_NATIONAL), ALLOWED_INDUSTRY_OR_NATIONAL)).toEqual([]);
  });

  it("no surface words the score as a rank among agents", () => {
    expect(unexpected(scan(RANK_AMONG_AGENTS), ALLOWED_RANK)).toEqual([]);
  });

  it("no surface calls the seasonality default national", () => {
    expect(unexpected(scan(NATIONAL_SEASONALITY), {})).toEqual([]);
  });

  it("no surface prints the score as P62 or as an ordinal", () => {
    expect(unexpected(scan(SCORE_AS_PERCENTILE), {})).toEqual([]);
  });

  it("every surface that words the Benchmark imports the engine's wording", () => {
    const missing: string[] = [];
    for (const [file, names] of Object.entries(SURFACES)) {
      const imported = engineImport(read(file));
      for (const name of names) {
        if (!new RegExp(`\\b${name}\\b`).test(imported)) missing.push(`${file}: does not import ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the table is typed once, in the engine", () => {
    const copies = FILES.filter((file) => file !== ENGINE).filter((file) => {
      const source = read(file);
      // Any one of these figures turns up on its own in a worked example.
      // Three of the four in one file is the table again.
      return REFERENCE_GCI_FIGURES.filter((figure) => figure.test(source)).length >= 3;
    });
    expect(copies).toEqual([]);
  });

  it("Flight Crew's knowledge states the table and the rule from the engine", () => {
    expect(KNOWLEDGE_BASE).toContain(BENCHMARK_VOICE_RULE);
    expect(KNOWLEDGE_BASE).toContain("Rookie (0–2 yrs): $42K / 4 deals");
    expect(KNOWLEDGE_BASE).toContain("Top Producer (over 10 yrs): $145K / 12 deals");
    expect(KNOWLEDGE_BASE).toContain("The numbers and every Runway Score are unchanged");

    const playbook = getPlaybook("benchmark");
    expect(playbook).toContain(BENCHMARK_VOICE_RULE);
    expect(playbook).toContain(benchmarkReferenceList());
    expect(playbook).toContain(BENCHMARK_COPY.definition);
    expect(playbook).toContain("No published source is behind them.");
    expect(getPlaybook("altimeter")).toContain("The reference figures are Agent Runway's own, not an industry or national statistic");
    expect(playbook).not.toMatch(/\d(?:st|nd|rd|th)\+? percentile/);

    // The Runway Score playbook describes the component the same way.
    expect(getPlaybook("runway-score")).toContain("| Benchmark Score | 5% | Projected GCI on Agent Runway's reference scale");
  });

  it("the Terms say whose figures they are", () => {
    // The Terms are typed by hand on purpose: a change to the engine's wording
    // must not reword a legal page on its own.
    const terms = read("apps/web/app/terms/page.tsx").replace(/\s+/g, " ");
    expect(terms).toContain("reference figures that Agent Runway sets for each level of experience");
    expect(terms).toContain("These reference figures are Agent Runway&apos;s own.");
    expect(terms).toContain("They are not a published industry, national or third-party statistic");
    expect(terms).toContain("They do not measure or rank other agents.");
    expect(terms).not.toMatch(/industry-cohort|public industry sources/i);
  });

  it("the seasonality label comes from the projection engine", () => {
    expect(ACCOUNT_SEASONALITY_COPY.label).toBe("your account's quarter weights");
    expect(ACCOUNT_SEASONALITY_COPY.detail).toBe("25% a quarter by default");
    for (const file of [
      "apps/web/app/(app)/dashboard/dashboard-content.tsx",
      "apps/web/app/(app)/altimeter/altimeter-content.tsx",
      "apps/web/app/(app)/dashboard/next-year-plan.tsx",
      "apps/web/app/api/chat/route.ts",
      "apps/web/lib/chat-diagnostics.ts",
    ]) {
      expect(read(file), file).toMatch(/ACCOUNT_SEASONALITY_COPY\.(?:label|source)/);
    }
    // Flight Crew is told what the stored weights are and what they are not.
    expect(KNOWLEDGE_BASE).toContain("these are not national averages and no national seasonal data is loaded");
  });
});
