/**
 * REGRESSION TRIPWIRE — one colour scale for a Runway Score sub-score
 * (2026-10-13).
 *
 * The Runway Score has five components (Goal Pace, Pipeline, Expenses,
 * Benchmark, Survival), each scored 0–100. Until this date the same sub-score
 * was a different colour depending on where it was read:
 *
 *   web dashboard        81 / 61 / 41   the engine's bands, bandColorHexForScore()
 *   Reports page         81 / 61 / 41   but gold, not emerald, from 81 up
 *   business report PDF  80 / 60 / 40   its own ladder, in the PDF's own blue and red
 *   mobile sheet         75 / 50 / 30   its own ladder
 *
 * A 75 was emerald on the phone and blue on the web, a 55 blue on the phone
 * and amber on the web, a 35 amber on the phone and red on the web. The
 * Expenses component scores 90 / 75 / 55 / 30, so the phone showed a 25–35%
 * expense ratio emerald while every web screen showed it blue.
 *
 * The weekly digest email coloured the composite score the same way, on
 * 80 / 60 with no blue: a 70 was amber in the email and blue on the dashboard.
 *
 * The decision (memory/spec_runway_score_canonical_bands.md §7 question 1): a
 * component sub-score takes the composite's bands. There is one table,
 * RUNWAY_SCORE_BANDS in packages/core/engines/runway-score-engine.ts, read
 * through bandColorHexForScore(). Gold is the composite gauge when the score
 * is Strong, and is not a component colour.
 *
 * Four things are checked, in web, mobile and core source:
 *   1. no file compares a score with a number to pick a colour
 *   2. every file that draws the component bars is on SURFACES
 *   3. each of them colours a bar with the engine's function, called on the
 *      component's own score
 *   4. none of them paints a component gold
 *
 * A regex can't prove a colour is right, only that it didn't come from a local
 * ladder. The bands are tested in
 * packages/core/engines/__tests__/runway-score-engine.test.ts, the PDF's bars
 * in pdf-tax-copy.test.ts, and the email's badge in
 * lib/emails/__tests__/weekly-digest-score-colour.test.ts.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../.."); // agentrunway-web/

const ROOTS = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "apps/web/supabase/functions",
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/stores",
  "apps/mobile/lib",
  "packages/core",
] as const;

/** The one file that may hold the band table. */
const ENGINE = "packages/core/engines/runway-score-engine.ts";

const SCANNED = /\.tsx?$/;
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

// ── 1. A ladder of its own ──────────────────────────────────────────────────

/** `score >= 75`, `comp.score > 60`, `data.runwayScore >= 80`. Comparing with 0 only asks "is there one". */
const SCORE_VS_NUMBER = /\b[\w.?]*score\w*\s*[<>]=?\s*(?!0\b(?!\.))\d/i;

/**
 * A colour: a hex, a Tailwind colour class, or a palette token (the PDF's
 * `C.emerald`, cockpit-ui's SEMANTIC and GOLD, the mobile theme's `c.success`).
 */
const COLOUR =
  /#[0-9a-fA-F]{6}\b|\b(?:text|bg|border|ring|fill|stroke|from|via|to)-(?:emerald|green|blue|sky|amber|yellow|orange|red|rose)-\d{2,3}\b|\bC\.[a-z]\w*|\bSEMANTIC\.\w+|\bGOLD\b|\bc\.(?:success|warning|danger|gold|primary|blue)\w*/;

/** How far under the comparison its colour can sit: `if (score >= 80) {` returns it a line or two down. */
const LADDER_REACH = 2;

/**
 * Scores that are not the Runway Score or one of its components. Each has a
 * scale of its own, and is not this file's business until someone decides
 * otherwise.
 */
const OTHER_SCORES: Allowed = {
  "apps/web/app/(app)/pipeline/pipeline-content.tsx": {
    count: 2,
    why: "accuracyColor(): the forecast accuracy score on the Pipeline page.",
  },
  "apps/web/app/(app)/flight-control/flight-control-content.tsx": {
    count: 4,
    why: "getScoreColor() and scoreHex(): the opportunity score on a Flight Control card.",
  },
  "apps/web/app/(app)/crm/clients-content.tsx": {
    count: 3,
    why: "ValuationCard: a client's valuation score.",
  },
};

// ── 2–4. The surfaces that draw the component bars ──────────────────────────

const SURFACES = [
  "apps/web/app/(app)/dashboard/dashboard-content.tsx",
  "apps/web/app/(app)/reports/reports-content.tsx",
  "apps/web/components/pdf/business-report-pdf.tsx",
  "apps/mobile/components/ScoreBreakdownSheet.tsx",
] as const;

/** `runwayScore.components.map(`, or on mobile `components.map(` over the snapshot's. */
const MAPS_THE_COMPONENTS = /\bcomponents\??\.map\(/;

/** The engine's function, or cockpit-ui's `scoreBand()` around it, called on a component's own score. */
const ENGINE_COLOUR_OF_A_COMPONENT = /\b(?:bandColorHexForScore|scoreBand)\(\s*\w+\.score\s*\)/;

const IMPORTS_THE_ENGINE_COLOUR =
  /import\s*\{[^}]*\b(?:bandColorHexForScore|scoreBand)\b[^}]*\}\s*from\s*["'](?:@agent-runway\/core\/engines\/runway-score-engine|@\/lib\/engines\/runway-score-engine|@\/components\/cockpit-ui)["']/;

/** Gold, by any of the names it goes by: cockpit-ui's GOLD and `isStrong`, the hex, the mobile theme's `c.gold`. */
const GOLD = /\bisStrong\b|\bGOLD\b|#F0A800|\.gold\b/i;

/**
 * The source of each `components.map(` in a file, to the line that closes it:
 * the first one indented no further than the line that opened it.
 */
function componentBlocks(file: string): string[] {
  const lines = read(file).split("\n");
  const blocks: string[] = [];
  lines.forEach((line, start) => {
    if (!MAPS_THE_COMPONENTS.test(line)) return;
    const indent = line.search(/\S/);
    let end = start + 1;
    while (end < lines.length && (lines[end].trim() === "" || lines[end].search(/\S/) > indent)) end++;
    blocks.push(lines.slice(start, end + 1).join("\n"));
  });
  return blocks;
}

describe("Runway Score sub-scores: one colour scale", () => {
  it("scans the source it means to", () => {
    expect(FILES.length).toBeGreaterThan(300);
    for (const surface of SURFACES) expect(FILES).toContain(surface);
    expect(FILES).toContain("apps/web/lib/emails/weekly-digest.ts");
    expect(FILES).not.toContain(ENGINE);
  });

  it("no file compares a score with a number to pick a colour", () => {
    const hits: Hit[] = [];
    for (const file of FILES) {
      const lines = read(file).split("\n");
      lines.forEach((text, i) => {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(text)) return; // a comment, not a comparison
        if (!SCORE_VS_NUMBER.test(text)) return;
        if (COLOUR.test(lines.slice(i, i + LADDER_REACH + 1).join("\n"))) {
          hits.push({ file, line: i + 1, text: text.trim().slice(0, 160) });
        }
      });
    }
    expect(unexpected(hits, OTHER_SCORES)).toEqual([]);
  });

  it("every file that draws the component bars is on SURFACES", () => {
    const drawing = FILES.filter((f) => f.endsWith(".tsx") && MAPS_THE_COMPONENTS.test(read(f)));
    expect(drawing.sort()).toEqual([...SURFACES].sort());
  });

  it.each(SURFACES)("%s colours a component with the engine's function", (surface) => {
    expect(IMPORTS_THE_ENGINE_COLOUR.test(read(surface)), "imports bandColorHexForScore or scoreBand").toBe(true);
    expect(componentBlocks(surface).some((block) => ENGINE_COLOUR_OF_A_COMPONENT.test(block))).toBe(true);
  });

  it("cockpit-ui's scoreBand() is the engine's function, not a second table", () => {
    expect(read("apps/web/components/cockpit-ui.tsx")).toMatch(/hex:\s*bandColorHexForScore\(score\)/);
  });

  it.each(SURFACES)("%s paints no component gold", (surface) => {
    expect(componentBlocks(surface).filter((block) => GOLD.test(block))).toEqual([]);
  });
});
