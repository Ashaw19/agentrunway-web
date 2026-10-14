/**
 * REGRESSION TRIPWIRE — one set of cut-offs for the repeat client rate
 * (2026-10-13).
 *
 * Until this date the rate was judged on numbers typed into each file, and
 * they did not agree:
 *
 *   Insights card   highlighted from 20%, bar colour at 15% and 30%, and a
 *                   sentence that read "Good" from 15% and "Excellent" from 30%
 *   KPI strip       `repeatRate / 35`: a bar that was full at 35%
 *   Scan cards      "Your repeat rate is strong" above 25%
 *   a blog post     an illustration at 15% and 25%
 *
 * A 20% rate lit the card up under the middle sentence, and a 27% rate was
 * "strong" on a Scan card and "Good" on the card. None of the figures had a
 * source.
 *
 * The fix is `@agent-runway/core/engines/repeat-rate-bands`:
 *
 *   REPEAT_RATE_BANDS             the three bands and their tones
 *   repeatRateBand(rate, n)       which band a rate (a whole percent) is in
 *   repeatRateGaugePct(rate, n)   how full a bar is
 *   REPEAT_RATE_COPY              the reference points, worded once, as
 *                                 Agent Runway's own
 *
 * Seven things are checked, in web, mobile and core source:
 *   1. a comparison of a repeat rate against a number (`repeatRate >= 20`)
 *   2. a bar scaled by a typed number (`repeatRate / 35`)
 *   3. a percentage typed beside the repeat rate in copy ("from 30%")
 *   4. a judgement on the rate ("Excellent", "Good repeat rate", "strong")
 *   5. every file that reads the rate imports the shared module
 *   6. text that cannot import (the blog post) matches the module
 *   7. the mobile app states no figure of its own
 *
 * A regex can't prove a colour is right, only that it didn't come from a
 * local ladder. The bands themselves are tested in
 * packages/core/engines/__tests__/repeat-rate-bands.test.ts.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPEAT_RATE_COPY,
  REPEAT_RATE_LOWER_REFERENCE_PCT,
  REPEAT_RATE_UPPER_REFERENCE_PCT,
} from "@agent-runway/core/engines/repeat-rate-bands";

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
const BANDS_MODULE = "packages/core/engines/repeat-rate-bands.ts";

/** Where the rate itself is worked out. It reads no cut-off. */
const RATE_HOME = "apps/web/lib/crm/client-groups.ts";

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
 * Text or code that is about the repeat rate: "repeat rate", "repeat client
 * rate", "repeat-client rate", `repeatRate`, `repeat_client_rate`. Not a
 * repeat client (one person), and not the client valuation's "repeat
 * probability", which is a different figure.
 */
const ABOUT_THE_RATE = /repeat[\s_-]?(?:clients?[\s_-]?)?rate|repeat\w*Rate/i;

/**
 * How far a figure or a word can sit from the text that names the rate and
 * still be about it. JSX wraps a sentence over a few lines, and a blog
 * paragraph sits a few lines under its heading. A prompt or a JSON string is
 * one line, and its neighbours are other metrics.
 */
function reach(file: string): number {
  if (file.endsWith(".tsx")) return 3;
  if (/\.mdx?$/.test(file)) return 6;
  return 0;
}

function nearTheRate(lines: string[], i: number, radius: number): boolean {
  const around = lines.slice(Math.max(0, i - radius), i + radius + 1).join(" ");
  return ABOUT_THE_RATE.test(around.replace(/\s+/g, " "));
}

/** Code comments explain a change; they are not copy and not a comparison. */
const COMMENT = /^\s*(?:\/\/|\/\*|\*(?:\s|\/|$)|\{\/\*)/;

interface Hit {
  file: string;
  line: number;
  text: string;
}

function scan(match: (text: string, lines: string[], i: number, file: string) => boolean, files = FILES): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const lines = read(file).split("\n");
    const isCode = /\.tsx?$/.test(file);
    lines.forEach((text, i) => {
      if (text.length > 4000) return; // minified or generated
      if (isCode && COMMENT.test(text)) return;
      if (match(text, lines, i, file)) hits.push({ file, line: i + 1, text: text.trim().slice(0, 160) });
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

const PLAYBOOK = "apps/web/lib/troubleshooting-playbooks.ts";
const GOAL_BLOG_POST = "apps/web/content/blog/how-to-set-an-annual-gci-goal-real-estate-agent.mdx";

const HISTORY_NOTE =
  'The "Changed 2026-10-13" note in the CRM playbook: it tells Flight Crew what the screens used to show, so it can explain why the wording or the bar changed.';

// ── 1. A cut-off in code ────────────────────────────────────────────────────

/**
 * `repeatRate >= 20`, `portfolioStats.repeatRate > 25`, `repeat_rate_pct < 15`.
 * Comparing with 0 only asks "is there one".
 */
const RATE_VS_NUMBER = /\b\w*repeat\w*(?:rate|pct|percent)\w*\s*[<>]=?\s*(?!0\b(?!\.))(?:0?\.\d+|\d+)/i;

/**
 * The rate's denominator against a number: `transactionalClients >= 2` was
 * the Insights card deciding for itself when a rate could be placed.
 */
const BASE_VS_NUMBER = /\b(?:transactionalClients|clientsWithADeal)\s*[<>]=?\s*[1-9]/;

/** A verdict as a name: `hasStrongRepeatHistory`, `repeatRateIsGood`. */
const VERDICT_IN_A_NAME =
  /(?:strong|good|excellent|moderate|weak|poor|healthy)\w*repeat|repeat\w*(?:strong|good|excellent|moderate|weak|poor|healthy)/i;

// ── 2. A bar on a scale of its own ──────────────────────────────────────────

/** `repeatRate / 35`, `repeatRate * 2`, `Math.min(repeatRate, 100)`. */
const RATE_SCALED_BY_HAND =
  /\b\w*repeat\w*rate\w*\s*[/*]\s*\d|Math\.(?:min|max)\([^)]*\b\w*repeat\w*rate\b[^)]*\d|Math\.(?:min|max)\(\s*\d[^)]*\b\w*repeat\w*rate\b/i;

// ── 3. A percentage typed beside the rate ───────────────────────────────────

/** "15%", "30 percent", "35%+". Not "0%" (where a gauge starts) and not `${rate}%`. */
const TYPED_PERCENT = /(?<![\w.$}-])(?:[1-9]\d?|100)(?:\.\d+)?\s?(?:%|percent\b)/;

const ALLOWED_PERCENTS: Allowed = {
  [PLAYBOOK]: { count: 1, why: HISTORY_NOTE },
  [GOAL_BLOG_POST]: {
    count: 2,
    why: "The reference points and the worked illustration. MDX cannot import, so check 6 holds both lines to the module.",
  },
};

// ── 4. A judgement on the rate ──────────────────────────────────────────────

const JUDGEMENT =
  /\b(?:excellent|good|great|strong|impressive|outstanding|solid|healthy|weak|poor|low|high)\b|\bopportunity to build\b/i;

/** "Never call a rate good, strong or excellent": the verdict being ruled out, not given. */
const RULED_OUT = /\bnever call\b/i;

/**
 * A verdict and the rate in one clause: "Your repeat rate is strong", "Good
 * repeat rate". A prompt paragraph is one long line that names many metrics,
 * so there the two have to sit within a few words of each other.
 */
const JUDGEMENT_BESIDE_THE_RATE = new RegExp(
  `(?:${JUDGEMENT.source})[^.!?\\n]{0,40}?(?:${ABOUT_THE_RATE.source})|(?:${ABOUT_THE_RATE.source})[^.!?\\n]{0,40}?(?:${JUDGEMENT.source})`,
  "i",
);

function judgesTheRate(text: string, lines: string[], i: number, file: string): boolean {
  if (RULED_OUT.test(text)) return false;
  const radius = reach(file);
  if (radius === 0) return JUDGEMENT_BESIDE_THE_RATE.test(text);
  return JUDGEMENT.test(text) && nearTheRate(lines, i, radius);
}

const ALLOWED_JUDGEMENTS: Allowed = {
  [PLAYBOOK]: {
    count: 2,
    why: `Two lines. One is the question as an agent asks it ("Is my repeat rate good?"), which the answer declines to judge. The other: ${HISTORY_NOTE}`,
  },
};

// ── 5. Surfaces ─────────────────────────────────────────────────────────────

const SURFACES = [
  "apps/web/app/(app)/crm/clients-content.tsx",
  "apps/web/app/(app)/crm/tabs/insights-tab.tsx",
  "apps/web/app/api/ai/detect-opportunities/route.ts",
  "apps/web/lib/repeat-rate-style.ts",
  "apps/web/lib/knowledge-base.ts",
  PLAYBOOK,
] as const;

const IMPORTS_THE_BANDS = /from\s+["'](?:@agent-runway\/core\/engines\/repeat-rate-bands|\.\/repeat-rate-bands)["']/;

/** A file that holds the rate as a value, not just its name in a sentence. */
const READS_THE_RATE = /\brepeatRate\b|\brepeat_rate\b|\brepeatClientStats\(/;

describe("repeat client rate: one set of cut-offs", () => {
  it("scans the source it means to", () => {
    expect(FILES.length).toBeGreaterThan(300);
    for (const surface of SURFACES) expect(FILES).toContain(surface);
    expect(FILES).toContain(GOAL_BLOG_POST);
    expect(FILES).toContain(RATE_HOME);
    expect(FILES).toContain("packages/i18n/shared/en.json");
    expect(FILES).not.toContain(BANDS_MODULE);
  });

  it("the patterns catch the code and the wording that were removed", () => {
    expect(RATE_VS_NUMBER.test("repeatRate >= 20")).toBe(true);
    expect(RATE_VS_NUMBER.test('repeatRate >= 30 ? "bg-violet-500" : repeatRate >= 15 ? "bg-violet-400" : "bg-slate-300",')).toBe(true);
    expect(RATE_VS_NUMBER.test("const hasStrongRepeatHistory = portfolioStats.repeatRate > 25;")).toBe(true);
    expect(RATE_VS_NUMBER.test("if (repeatRate > 0) {")).toBe(false);
    expect(BASE_VS_NUMBER.test("{transactionalClients >= 2 && (")).toBe(true);
    expect(VERDICT_IN_A_NAME.test("if (hasStrongRepeatHistory) {")).toBe(true);
    expect(VERDICT_IN_A_NAME.test("const _hasModerateRepeatHistory = x;")).toBe(true);
    expect(RATE_SCALED_BY_HAND.test("progress={Math.min(100, Math.round((repeatRate / 35) * 100))}")).toBe(true);
    expect(RATE_SCALED_BY_HAND.test("style={{ width: `${Math.min(repeatRate, 100)}%` }}")).toBe(true);
    expect(RATE_SCALED_BY_HAND.test("progress={repeatRateGaugePct(repeatRate, transactionalClients)}")).toBe(false);
    // The rate's own arithmetic is not a gauge.
    expect(RATE_SCALED_BY_HAND.test("repeatRate: n > 0 ? Math.round((repeatCount / n) * 100) : 0,")).toBe(false);

    expect(TYPED_PERCENT.test("a repeat rate of 30% or more")).toBe(true);
    expect(TYPED_PERCENT.test("the bar is full at 35%+")).toBe(true);
    expect(TYPED_PERCENT.test('<span className="absolute left-0">0%</span>')).toBe(false);
    expect(TYPED_PERCENT.test("value={`${repeatRate}%`}")).toBe(false);

    const oldCard = [
      "{repeatRate >= 30",
      '  ? "Excellent loyalty — your clients keep coming back."',
      "  : repeatRate >= 15",
      '  ? "Good repeat rate. Nurturing past clients could grow this further."',
      '  : "Opportunity to build more repeat business."}',
    ];
    for (const i of [1, 3, 4]) expect(judgesTheRate(oldCard[i], oldCard, i, "card.tsx"), oldCard[i]).toBe(true);
    const oldScanCard = "return `Your repeat rate is strong — this referral window is how you keep feeding that.`;";
    expect(judgesTheRate(oldScanCard, [oldScanCard], 0, "route.ts")).toBe(true);
    expect(judgesTheRate("Never call a repeat rate good, strong or excellent.", [], 0, "kb.ts")).toBe(false);
    // One prompt line that lists the rate among other totals and names a badge.
    expect(judgesTheRate("Left out of avg / deal, repeat rate, each client's Lifetime GCI and Deals, top clients, badges (High Yield).", [], 0, "kb.ts")).toBe(false);
    // A repeat client is one person, and repeat probability is another figure.
    expect(ABOUT_THE_RATE.test("Repeat client — high loyalty signal")).toBe(false);
    expect(ABOUT_THE_RATE.test("- Repeat probability: 60% (multi-deal), 30% (recent 1-deal)")).toBe(false);
  });

  it("no file compares a repeat rate, or its client count, against a number", () => {
    const code = FILES.filter((f) => /\.tsx?$/.test(f));
    const hits = scan(
      (text, lines, i) =>
        RATE_VS_NUMBER.test(text) ||
        VERDICT_IN_A_NAME.test(text) ||
        (BASE_VS_NUMBER.test(text) && nearTheRate(lines, i, 40)),
      code,
    );
    expect(unexpected(hits, {})).toEqual([]);
  });

  it("no file draws the repeat rate on a scale of its own", () => {
    const code = FILES.filter((f) => /\.tsx?$/.test(f));
    expect(unexpected(scan((text) => RATE_SCALED_BY_HAND.test(text), code), {})).toEqual([]);
  });

  it("no file types a percentage beside the repeat rate", () => {
    const hits = scan((text, lines, i, file) => TYPED_PERCENT.test(text) && nearTheRate(lines, i, reach(file)));
    expect(unexpected(hits, ALLOWED_PERCENTS)).toEqual([]);
  });

  it("no file passes judgement on the repeat rate", () => {
    expect(unexpected(scan(judgesTheRate), ALLOWED_JUDGEMENTS)).toEqual([]);
  });

  it.each(SURFACES)("%s reads the shared reference points", (surface) => {
    expect(read(surface)).toMatch(IMPORTS_THE_BANDS);
  });

  it("every file that holds the repeat rate imports the shared reference points", () => {
    // A new screen, tool or email that reads the rate lands here. It either
    // places the rate with the shared module or shows the bare figure, and
    // in that second case it is added to this list with the reason.
    const showsTheBareFigure: Record<string, string> = {
      [RATE_HOME]: "Works the rate out. Reads no cut-off.",
    };
    const holders = FILES.filter((f) => /\.tsx?$/.test(f) && READS_THE_RATE.test(read(f)));
    expect(holders).toEqual(expect.arrayContaining(SURFACES.slice(0, 3)));
    const missing = holders.filter((f) => !(f in showsTheBareFigure) && !IMPORTS_THE_BANDS.test(read(f)));
    expect(missing).toEqual([]);
  });

  it("the GCI goal blog post gives the reference points as the app words them", () => {
    const post = read(GOAL_BLOG_POST);
    expect(post).toContain(`${REPEAT_RATE_COPY.referenceSentence} ${REPEAT_RATE_COPY.provenance}`);
    // The worked illustration uses the same two figures, on 60 past clients.
    const clients = 60;
    const lower = REPEAT_RATE_LOWER_REFERENCE_PCT;
    const upper = REPEAT_RATE_UPPER_REFERENCE_PCT;
    expect(post).toContain(
      `with ${clients} past clients a rate of ${lower}% is ${(clients * lower) / 100} who came back and ${upper}% is ${(clients * upper) / 100}`,
    );
  });

  it("the mobile app states no repeat rate figure of its own", () => {
    // Mobile has no repeat rate card. If one is added, it reads the shared
    // reference points.
    const mobile = FILES.filter((f) => f.startsWith("apps/mobile/"));
    expect(mobile.length).toBeGreaterThan(20);
    for (const file of mobile) {
      const source = read(file);
      if (ABOUT_THE_RATE.test(source) && /[<>]=?\s*\d|\d\s?%/.test(source)) {
        expect(source, file).toMatch(IMPORTS_THE_BANDS);
      }
    }
  });
});
