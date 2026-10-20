/**
 * The words on the score badge and the score sheet (lib/score-sheet-copy.ts),
 * rendered through the app's real i18n setup (lib/i18n.ts: i18next 24, the en
 * home.json). Mocked: the device locale (expo-localization) and saved storage
 * (lib/mmkv).
 *
 * What this holds:
 *   - copy guard: no value under `scoreSheet` or `yourNumbers`, in any
 *     locale's home.json, has the word "good", "strong" or "should", or an
 *     em dash. The sheet's own sentences name a part and its number; the one
 *     "Strong" on the sheet is the engine's state label, which comes from
 *     `score.strong`, outside these namespaces.
 *   - the lines the sheet and badge print: the status line, the lowest part,
 *     the trend tag and the badge's spoken label
 *
 * Task 13 (the 10 locales): only en carries these namespaces today. The guard
 * checks every key a locale has, so it covers a locale as soon as its
 * translation lands, and the "every locale" test below then asks for the
 * en keys too. Until then it stays on en.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
// The vi.mock calls below are hoisted over these imports, so i18n loads the mocks.
import i18n from "../i18n";
import type { ScoreView } from "../score-view";
import {
  badgeLabel,
  lowestLine,
  partName,
  statusLine,
  trendPhrase,
  trendTag,
} from "../score-sheet-copy";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-CA" }] }));
vi.mock("../mmkv", () => ({ storage: { getString: () => undefined, set: () => {} } }));

const t = i18n.getFixedT("en", "home") as unknown as (key: string, options?: Record<string, unknown>) => string;

/** The namespaces this task adds to home.json. */
const NAMESPACES = ["scoreSheet", "yourNumbers"] as const;

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`));
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const I18N_MOBILE = path.resolve(HERE, "../../../../packages/i18n/mobile");
const LOCALES = readdirSync(I18N_MOBILE, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

function sheetStrings(locale: string): [string, string][] {
  const home = JSON.parse(readFileSync(path.join(I18N_MOBILE, locale, "home.json"), "utf8")) as Tree;
  return NAMESPACES.flatMap((ns) => (home[ns] ? leaves(home[ns] as Tree, `${ns}.`) : []));
}

const BANNED_WORD = /\b(?:good|strong|should)\b/i;

describe("copy guard: the sheet's own sentences", () => {
  it("covers every locale the app ships", () => {
    expect(LOCALES.sort()).toEqual(["ar", "en", "es", "fr-CA", "hi", "pa", "tl", "ur", "yue", "zh"]);
  });

  it("en has the strings the sheet prints", () => {
    const keys = sheetStrings("en").map(([k]) => k);
    expect(keys).toEqual(expect.arrayContaining([
      "scoreSheet.down", "scoreSheet.up", "scoreSheet.asOf", "scoreSheet.lowest",
      "scoreSheet.fullBreakdown", "scoreSheet.noScore", "yourNumbers.title",
    ]));
  });

  it.each(LOCALES)("%s: no good, strong or should, and no em dash", (locale) => {
    for (const [key, value] of sheetStrings(locale)) {
      expect(value, `${locale} ${key}`).not.toMatch(BANNED_WORD);
      expect(value, `${locale} ${key}`).not.toContain("—");
    }
  });

  it("the guard can fail: it catches each banned word and the dash", () => {
    for (const bad of ["That is good", "A STRONG start", "You should call", "a — b"]) {
      expect(BANNED_WORD.test(bad) || bad.includes("—"), bad).toBe(true);
    }
    expect(BANNED_WORD.test("Lowest part: Bench, at 6 of 100.")).toBe(false);
    expect(BANNED_WORD.test("strongest")).toBe(false);
  });
});

describe("the trend", () => {
  it("tags the badge with an arrow and the size of the change", () => {
    expect(trendTag({ delta: 3, direction: "down" })).toBe("▼ 3");
    expect(trendTag({ delta: 2, direction: "up" })).toBe("▲ 2");
  });

  it("says it in words, at 1 and at 3", () => {
    expect(trendPhrase({ delta: 1, direction: "down" }, t)).toBe("down 1 since last week");
    expect(trendPhrase({ delta: 3, direction: "down" }, t)).toBe("down 3 since last week");
    expect(trendPhrase({ delta: 1, direction: "up" }, t)).toBe("up 1 since last week");
    expect(trendPhrase({ delta: 12, direction: "up" }, t)).toBe("up 12 since last week");
  });
});

describe("the status line under the score", () => {
  const view = (over: Partial<Pick<ScoreView, "stateLabel" | "trend" | "asOf">> = {}) => ({
    stateLabel: "At Risk" as const, trend: null, asOf: null, ...over,
  });

  it("is the state label, then the trend", () => {
    expect(statusLine(view({ trend: { delta: 3, direction: "down" } }), "2026-10-19", t, "en-CA"))
      .toBe("At Risk · down 3 since last week");
  });

  it("leaves the trend out when there is none", () => {
    expect(statusLine(view(), "2026-10-19", t, "en-CA")).toBe("At Risk");
  });

  it("adds as of <day> when the save is old: the weekday within a week, else the date", () => {
    // Oct 15, 2026 is a Thursday.
    expect(statusLine(view({ trend: { delta: 3, direction: "down" }, asOf: "2026-10-15" }), "2026-10-19", t, "en-CA"))
      .toBe("At Risk · down 3 since last week · as of Thursday");
    expect(statusLine(view({ asOf: "2026-10-09" }), "2026-10-19", t, "en-CA")).toBe("At Risk · as of Oct 9");
  });

  it("prints the state label the engine gave, in the app's words for each", () => {
    expect(statusLine(view({ stateLabel: "Strong" }), "2026-10-19", t, "en-CA")).toBe("Strong");
    expect(statusLine(view({ stateLabel: "On Track" }), "2026-10-19", t, "en-CA")).toBe("On Track");
    expect(statusLine(view({ stateLabel: "Building" }), "2026-10-19", t, "en-CA")).toBe("Building");
  });
});

describe("the parts", () => {
  it("names a part as the score bars do", () => {
    expect(partName({ label: "Goal Pace", part: "pace" }, t)).toBe("Pace");
    expect(partName({ label: "Benchmark", part: "bench" }, t)).toBe("Bench");
    expect(partName({ label: "Survival", part: "survival" }, t)).toBe("Survival");
  });

  it("falls back to the engine's label for a part it doesn't know", () => {
    expect(partName({ label: "Cash Flow", part: null }, t)).toBe("Cash Flow");
  });

  it("names the lowest part and its number", () => {
    expect(lowestLine({ lowest: { label: "Benchmark", part: "bench", score: 6 } }, t))
      .toBe("Lowest part: Bench, at 6 of 100.");
    expect(lowestLine({ lowest: { label: "Goal Pace", part: "pace", score: 21.6 } }, t))
      .toBe("Lowest part: Pace, at 22 of 100.");
  });

  it("says nothing with no lowest part", () => {
    expect(lowestLine({ lowest: null }, t)).toBeNull();
  });

  it("the lowest-part sentence has no banned word", () => {
    const line = lowestLine({ lowest: { label: "Expenses", part: "expenses", score: 40 } }, t) ?? "";
    expect(line).not.toMatch(BANNED_WORD);
    expect(line).not.toContain("—");
  });
});

describe("the badge's spoken label", () => {
  const full: ScoreView = {
    score: 34, color: "#EF4444", grade: "F", stateLabel: "At Risk",
    trend: { delta: 3, direction: "down" }, asOf: null, components: [], lowest: null,
  };

  it("reads the score and the trend", () => {
    expect(badgeLabel(full, t)).toBe("Runway Score 34, down 3 since last week");
  });

  it("reads just the score without a trend", () => {
    expect(badgeLabel({ ...full, trend: null }, t)).toBe("Runway Score 34");
  });

  it("reads just the name with no score saved", () => {
    expect(badgeLabel(null, t)).toBe("Runway Score");
  });
});
