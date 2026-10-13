/**
 * REGRESSION TRIPWIRE — one expense ratio target, one set of bands
 * (2026-10-13).
 *
 * Until this date the app stated two benchmarks and coloured the ratio on
 * three sets of cut-offs:
 *
 *   "25–30%"  Reports and its PDF (colours at 30 / 40), the Expenses page
 *             (status at 35 / 50), the dashboard tooltip and alert (40), the
 *             guide PDF, the advisor card (above 30, saving measured to 25)
 *             and five marketing pages
 *   "25–35%"  the insight card ("industry average"), the Runway Score
 *             sub-score (25 / 35 / 50), Flight Crew's knowledge and playbook
 *
 * A 33% ratio was healthy to Flight Crew and the Runway Score, amber on
 * Reports and its PDF, and green on the Expenses page. None of the figures
 * had a source, and several were called an industry benchmark.
 *
 * The fix is `@agent-runway/core/engines/expense-ratio-bands`:
 *
 *   EXPENSE_RATIO_BANDS            the four bands, their colours and sub-scores
 *   expenseRatioBand(ratio)        which band a ratio (a fraction) is in
 *   expenseRatioTone / ColorHex    its colour
 *   EXPENSE_RATIO_COPY             the target, worded once, as Agent Runway's
 *
 * Six things are checked, in web, mobile and core source:
 *   1. a stated range beside the expense ratio ("25–30%", "25 to 35 percent")
 *   2. the figure called an industry benchmark, an industry average or
 *      "typical"
 *   3. a comparison of an expense ratio against a number (`ratio > 0.35`,
 *      `expenseRatio <= 30`), or the sub-score ladder written out again
 *   4. a band edge typed by hand beside the expense ratio ("below 30%",
 *      "35% or less"): right today, wrong the day the table changes
 *   5. every surface that showed its own figure imports the shared module
 *   6. text that cannot import (the blog post's table) matches the table
 *
 * A regex can't prove a colour is right, only that it didn't come from a
 * local ladder. The bands themselves are tested in
 * packages/core/engines/__tests__/expense-ratio-bands.test.ts, and the PDF's
 * printed sentences in pdf-tax-copy.test.ts.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPENSE_RATIO_BANDS,
  EXPENSE_RATIO_COPY,
  expenseRatioBandRange,
} from "@agent-runway/core/engines/expense-ratio-bands";

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
const BANDS_MODULE = "packages/core/engines/expense-ratio-bands.ts";

const SCANNED = /\.(?:ts|tsx|mdx|md|txt|json)$/;
const SKIPPED = /(?:^|\/)(?:node_modules|__tests__|_shared|\.next|dist)(?:\/|$)|\.test\.tsx?$/;

function walk(rel: string, out: string[] = []): string[] {
  const abs = path.join(REPO_ROOT, rel);
  if (!existsSync(abs) || SKIPPED.test(rel)) return out;
  if (statSync(abs).isFile()) {
    if (SCANNED.test(rel) && rel !== BANDS_MODULE) out.push(rel);
    return out;
  }
  for (const name of readdirSync(abs)) walk(`${rel}/${name}`, out);
  return out;
}

const FILES = ROOTS.flatMap((root) => walk(root));
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

/**
 * Text that is about the expense ratio, by name or by description
 * ("business expenses typically run 20–35% of GCI").
 */
const ABOUT_THE_RATIO =
  /expense[\s_-]?ratio|expense-to-GCI|expenses[^.\n]{0,80}%\s+of\s+(?:gross |YTD |projected )?GCI/i;

/**
 * True when the lines within `radius` of line `i` are about the expense
 * ratio. Read as one run of text, so JSX that wraps "expense" and "ratio"
 * onto two lines still counts.
 */
function nearTheRatio(lines: string[], i: number, radius: number): boolean {
  const around = lines.slice(Math.max(0, i - radius), i + radius + 1).join(" ");
  return ABOUT_THE_RATIO.test(around.replace(/\s+/g, " "));
}

/**
 * How many lines a figure can sit from the text or code that names the ratio
 * and still be about it: a gauge's caption is a few lines under its bar.
 * Wider than this and other figures on the page are swept in (a commission
 * split, a tax rate).
 */
const CAPTION_REACH = 6;

interface Hit {
  file: string;
  line: number;
  text: string;
}

/** Lines matching `pattern` that sit within `radius` lines of an expense ratio mention. */
function hitsNearTheRatio(pattern: RegExp, radius: number): Hit[] {
  const hits: Hit[] = [];
  for (const file of FILES) {
    const lines = read(file).split("\n");
    lines.forEach((text, i) => {
      if (pattern.test(text) && nearTheRatio(lines, i, radius)) {
        hits.push({ file, line: i + 1, text: text.trim().slice(0, 160) });
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

const HISTORY_NOTE =
  'The "Changed 2026-10-13" note in the expenses playbook: it tells Flight Crew what the screens used to show, so it can explain why a colour changed.';

// ── 1. A stated range ───────────────────────────────────────────────────────

/** "25–30%", "25-35%", "25 to 30 percent", "25&ndash;30%", "20–30%". */
const STATED_RANGE = /\b\d{2}\s?(?:[–—-]|&ndash;|to)\s?\d{2}\s?(?:%|percent)/i;

const ALLOWED_RANGES: Allowed = {
  "apps/web/lib/troubleshooting-playbooks.ts": { count: 1, why: HISTORY_NOTE },
};

// ── 2. An industry claim ────────────────────────────────────────────────────

const INDUSTRY_CLAIM =
  /industry[\s-](?:benchmark|average|standard|norm)|widely cited|commonly fall|typical(?:ly)? (?:range|canadian|benchmark|expense ratio)|typically range/i;

const ALLOWED_CLAIMS: Allowed = {};

// ── 3. A cut-off in code ────────────────────────────────────────────────────

/** `expenseRatio > 0.35`, `expenseRatioForAlert * 100 <= 30`. Comparing with 0 only asks "is there one". */
const NAMED_RATIO_VS_NUMBER =
  /\b\w*expense\w*ratio\w*\s*(?:\*\s*100\s*)?[<>]=?\s*(?!0\b(?!\.))(?:0?\.\d+|\d+)/i;

/** `ratio > 0.35`, `r > 0.5`, `roundedRatio >= 25`: a bare ratio against a band edge, old or new. */
const BARE_RATIO_VS_EDGE =
  /\b(?:\w*ratio\w*|r)\s*(?:\*\s*100\s*)?[<>]=?\s*(?:0?\.(?:25|3|30|35|4|40|5|50)|25|30|35|40|50)\b(?!\.)/i;

/** The sub-score ladder written out: `expenseScore = 75`. It lives on the band table. */
const SUB_SCORE_LADDER = /\bexpenseScore\s*=\s*(?:30|55|75|90)\b/;

// ── 4. A band edge typed by hand ────────────────────────────────────────────

/**
 * Every edge the app has used for this ratio (25, 30, 35, 40, 50), worded as
 * a bound: "below 30%", ">50%", "35% or less", "50%+", "30% of GCI". A bare
 * figure is not one: "Pipeline (30%), Expense Ratio (15%)" is a list of
 * Runway Score weights.
 */
const EDGE = "(?:25|30|35|40|50)\\s?%";
const TYPED_EDGE = new RegExp(
  `(?:\\b(?:below|under|above|over|past|exceeds?|less than|more than|target:?|benchmark:?)\\s+(?:the\\s+)?|[<>≤≥]=?\\s?)${EDGE}` +
    `|(?<![\\d.])${EDGE}(?:\\+|\\s+(?:or (?:less|more|lower|higher)|of (?:projected |YTD |gross )?GCI|target|benchmark))`,
  "i",
);

const ALLOWED_TYPED_EDGES: Allowed = {
  "apps/web/lib/troubleshooting-playbooks.ts": { count: 1, why: HISTORY_NOTE },
  "apps/web/content/blog/5-numbers-every-canadian-real-estate-agent-should-track.mdx": {
    count: 5,
    why: "The band table's four rows and its target sentence. MDX cannot import, so check 6 holds all five to EXPENSE_RATIO_BANDS.",
  },
  "apps/web/content/blog/how-to-set-an-annual-gci-goal-real-estate-agent.mdx": {
    count: 1,
    why: "The target sentence. MDX cannot import, so check 6 holds it to EXPENSE_RATIO_COPY.",
  },
};

// ── 5. Surfaces that showed a figure of their own ───────────────────────────

const SURFACES = [
  "packages/core/engines/health-report.ts",
  "packages/core/engines/insights-engine.ts",
  "packages/core/engines/advisor-engine.ts",
  "apps/web/app/(app)/dashboard/dashboard-content.tsx",
  "apps/web/app/(app)/expenses/expenses-content.tsx",
  "apps/web/app/(app)/reports/reports-content.tsx",
  "apps/web/components/pdf/business-report-pdf.tsx",
  "apps/web/components/pdf/guide-pdf.tsx",
  "apps/web/app/api/chat/route.ts",
  "apps/web/lib/chat-diagnostics.ts",
  "apps/web/lib/knowledge-base.ts",
  "apps/web/lib/troubleshooting-playbooks.ts",
  "apps/web/app/demo/page.tsx",
  "apps/web/app/features/page.tsx",
  "apps/web/app/metrics/expense-ratio/page.tsx",
  "apps/web/app/real-estate-metrics/page.tsx",
  "apps/web/app/real-estate-agent-business-expenses-canada/page.tsx",
] as const;

const IMPORTS_THE_BANDS = /from\s+["'](?:@agent-runway\/core\/engines\/expense-ratio-bands|\.\/expense-ratio-bands)["']/;

// ── 6. Text that cannot import ──────────────────────────────────────────────

const BLOG_POST = "apps/web/content/blog/5-numbers-every-canadian-real-estate-agent-should-track.mdx";
const GOAL_BLOG_POST = "apps/web/content/blog/how-to-set-an-annual-gci-goal-real-estate-agent.mdx";

describe("expense ratio: one target and one set of bands", () => {
  it("scans the source it means to", () => {
    expect(FILES.length).toBeGreaterThan(300);
    for (const surface of SURFACES) expect(FILES).toContain(surface);
    expect(FILES).toContain(BLOG_POST);
    expect(FILES).not.toContain(BANDS_MODULE);
  });

  it("no file states a range of its own for the expense ratio", () => {
    expect(unexpected(hitsNearTheRatio(STATED_RANGE, CAPTION_REACH), ALLOWED_RANGES)).toEqual([]);
  });

  it("no file calls the figure an industry benchmark, an industry average or typical", () => {
    expect(unexpected(hitsNearTheRatio(INDUSTRY_CLAIM, 1), ALLOWED_CLAIMS)).toEqual([]);
  });

  it("no file compares an expense ratio against a number", () => {
    const hits: Hit[] = [];
    for (const file of FILES.filter((f) => /\.tsx?$/.test(f))) {
      const lines = read(file).split("\n");
      lines.forEach((text, i) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(text)) return; // a comment, not a comparison
        const named = NAMED_RATIO_VS_NUMBER.test(text);
        // A bare `ratio` is an expense ratio when expenses are in view above it.
        const bare =
          BARE_RATIO_VS_EDGE.test(text) && lines.slice(Math.max(0, i - 8), i + 1).some((l) => /expens/i.test(l));
        if (named || bare || SUB_SCORE_LADDER.test(text)) {
          hits.push({ file, line: i + 1, text: text.trim().slice(0, 160) });
        }
      });
    }
    expect(unexpected(hits, {})).toEqual([]);
  });

  it("no file types a band edge by hand beside the expense ratio", () => {
    expect(unexpected(hitsNearTheRatio(TYPED_EDGE, CAPTION_REACH), ALLOWED_TYPED_EDGES)).toEqual([]);
  });

  it.each(SURFACES)("%s reads the shared bands", (surface) => {
    expect(read(surface)).toMatch(IMPORTS_THE_BANDS);
  });

  it("the blog post's table is the band table", () => {
    const post = read(BLOG_POST);
    for (const band of EXPENSE_RATIO_BANDS) {
      const range = expenseRatioBandRange(band);
      expect(post).toContain(`| ${range[0].toUpperCase()}${range.slice(1)} | ${band.label} |`);
    }
    expect(post).toContain(`${EXPENSE_RATIO_COPY.targetSentence} ${EXPENSE_RATIO_COPY.provenance}`);
  });

  it("the GCI goal blog post gives the target as the app words it", () => {
    expect(read(GOAL_BLOG_POST)).toContain(`${EXPENSE_RATIO_COPY.targetSentence} ${EXPENSE_RATIO_COPY.provenance}`);
  });

  it("the mobile app states no expense ratio figure of its own", () => {
    // Mobile shows the Runway Score's components from the web snapshot and has
    // no expense ratio card. If one is added, it reads the shared bands.
    const mobile = FILES.filter((f) => f.startsWith("apps/mobile/"));
    expect(mobile.length).toBeGreaterThan(20);
    for (const file of mobile) {
      const source = read(file);
      if (ABOUT_THE_RATIO.test(source) && /[<>]=?\s*0?\.\d|\d\s?%/.test(source)) {
        expect(source, file).toMatch(IMPORTS_THE_BANDS);
      }
    }
  });
});
